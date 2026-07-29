import { v } from "convex/values";
import {
  mutation,
  query,
  internalAction,
  internalMutation,
  internalQuery,
  ActionCtx,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  parseCommand,
  extractInboundTexts,
  formatTaskList,
  CATEGORIES,
  Category,
} from "./whatsappParser";
import { parseWithGemini } from "./gemini";

const categoryValidator = v.union(
  v.literal("Personal"),
  v.literal("Work"),
  v.literal("Errands"),
  v.literal("Fitness"),
  v.literal("Urgent")
);

const LINK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // unambiguous chars
const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/* ───────────────────────── Public (dashboard, auth-gated) ───────────────────────── */

export const createLinkCode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Single active code per user: wipe previous ones.
    const existing = await ctx.db
      .query("whatsappLinks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes, (b) => LINK_CODE_ALPHABET[b % LINK_CODE_ALPHABET.length]).join("");

    const expiresAt = Date.now() + LINK_CODE_TTL_MS;
    await ctx.db.insert("whatsappLinks", { code, userId, expiresAt });
    return { code, expiresAt };
  },
});

export const getWhatsAppStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const link = await ctx.db
      .query("whatsappUsers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return { linked: link !== null, phone: link?.phone ?? null };
  },
});

export const unlinkWhatsApp = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const link = await ctx.db
      .query("whatsappUsers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (link) await ctx.db.delete(link._id);
  },
});

/* ───────────────────────── Internal helpers ───────────────────────── */

export const getUserByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("whatsappUsers")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .unique();
    return link?.userId ?? null;
  },
});

export const redeemLinkCode = internalMutation({
  args: { code: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("whatsappLinks")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!row || row.expiresAt < Date.now()) return null;

    await ctx.db.delete(row._id); // single use

    const existing = await ctx.db
      .query("whatsappUsers")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { userId: row.userId, lastInboundAt: Date.now() });
    } else {
      await ctx.db.insert("whatsappUsers", {
        phone: args.phone,
        userId: row.userId,
        linkedAt: Date.now(),
        lastInboundAt: Date.now(),
        lastListIds: [],
      });
    }
    return row.userId;
  },
});

export const touchInbound = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("whatsappUsers")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .unique();
    if (link) await ctx.db.patch(link._id, { lastInboundAt: Date.now() });
  },
});

export const unlinkByPhone = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("whatsappUsers")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .unique();
    if (link) await ctx.db.delete(link._id);
  },
});

export const recordLastList = internalMutation({
  args: { userId: v.id("users"), ids: v.array(v.id("todos")) },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("whatsappUsers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (link) await ctx.db.patch(link._id, { lastListIds: args.ids });
  },
});

export const listTasksForUser = internalQuery({
  args: {
    userId: v.id("users"),
    filter: v.union(v.literal("open"), v.literal("done"), v.literal("urgent")),
  },
  handler: async (ctx, args) => {
    const todos = await ctx.db
      .query("todos")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);
    if (args.filter === "open") return todos.filter((t) => !t.isCompleted);
    if (args.filter === "done") return todos.filter((t) => t.isCompleted);
    return todos.filter((t) => !t.isCompleted && t.category === "Urgent");
  },
});

export const resolveTaskRef = internalQuery({
  args: { userId: v.id("users"), ref: v.string() },
  handler: async (ctx, args) => {
    // Numeric ref → ordinal from the last list the bot showed.
    if (/^\d+$/.test(args.ref)) {
      const link = await ctx.db
        .query("whatsappUsers")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique();
      const idx = parseInt(args.ref, 10) - 1;
      const id = link?.lastListIds[idx];
      if (!id) return null;
      const doc = await ctx.db.get(id);
      return doc && doc.userId === args.userId ? doc : null;
    }
    // Text ref → fuzzy contains match over the user's tasks.
    const todos = await ctx.db
      .query("todos")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);
    const needle = args.ref.toLowerCase();
    return todos.find((t) => t.text.toLowerCase().includes(needle)) ?? null;
  },
});

async function getOwnedTodo(ctx: MutationCtx, userId: Id<"users">, todoId: Id<"todos">) {
  const todo = await ctx.db.get(todoId);
  if (!todo || todo.userId !== userId) return null;
  return todo;
}

export const addTaskForUser = internalMutation({
  args: {
    userId: v.id("users"),
    text: v.string(),
    category: categoryValidator,
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("todos", {
      text: args.text,
      isCompleted: false,
      category: args.category as Doc<"todos">["category"],
      userId: args.userId,
      createdAt: Date.now(),
      ...(args.dueAt !== undefined ? { dueAt: args.dueAt } : {}),
    });
  },
});

export const completeTaskForUser = internalMutation({
  args: { userId: v.id("users"), todoId: v.id("todos") },
  handler: async (ctx, args) => {
    const todo = await getOwnedTodo(ctx, args.userId, args.todoId);
    if (!todo) return false;
    await ctx.db.patch(args.todoId, { isCompleted: true });
    return true;
  },
});

export const editTaskForUser = internalMutation({
  args: { userId: v.id("users"), todoId: v.id("todos"), text: v.string() },
  handler: async (ctx, args) => {
    const todo = await getOwnedTodo(ctx, args.userId, args.todoId);
    if (!todo) return false;
    await ctx.db.patch(args.todoId, { text: args.text });
    return true;
  },
});

export const moveTaskForUser = internalMutation({
  args: { userId: v.id("users"), todoId: v.id("todos"), category: categoryValidator },
  handler: async (ctx, args) => {
    const todo = await getOwnedTodo(ctx, args.userId, args.todoId);
    if (!todo) return false;
    await ctx.db.patch(args.todoId, { category: args.category as Doc<"todos">["category"] });
    return true;
  },
});

export const deleteTaskForUser = internalMutation({
  args: { userId: v.id("users"), todoId: v.id("todos") },
  handler: async (ctx, args) => {
    const todo = await getOwnedTodo(ctx, args.userId, args.todoId);
    if (!todo) return false;
    await ctx.db.delete(args.todoId);
    return true;
  },
});

export const flushPending = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pendingNotifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(20);
    if (rows.length === 0) return "";
    for (const row of rows) await ctx.db.delete(row._id);
    const items = rows.map((r) => `• ${r.body}`).join("\n");
    return `🔔 *While you were away:*\n${items}\n\n`;
  },
});

/* ───────────────────────── Inbound processing ───────────────────────── */

export const processInbound = internalAction({
  args: { payload: v.any() },
  handler: async (ctx, args) => {
    const messages = extractInboundTexts(args.payload);
    for (const msg of messages) {
      try {
        await handleMessage(ctx, msg.from, msg.body);
      } catch (err) {
        console.error("WhatsApp handleMessage error:", err);
      }
    }
  },
});

async function handleMessage(ctx: ActionCtx, phone: string, rawBody: string) {
  const body = rawBody.trim();
  const userId: Id<"users"> | null = await ctx.runQuery(internal.whatsapp.getUserByPhone, { phone });

  // ── Link gate: unlinked numbers only get the LINK flow, nothing else ──
  if (!userId) {
    const cmd = parseCommand(body);
    if (cmd.kind === "link") {
      const linkedUser: Id<"users"> | null = await ctx.runMutation(internal.whatsapp.redeemLinkCode, {
        code: cmd.code,
        phone,
      });
      await sendWhatsAppText(
        phone,
        linkedUser
          ? "✅ *Linked!* Your WhatsApp is now connected to Surf ToDo.\n\n" + HELP_TEXT
          : "❌ That code is invalid or expired. Generate a fresh one in the app (Connect WhatsApp) and send: LINK ABC123"
      );
    } else {
      await sendWhatsAppText(
        phone,
        "👋 This number isn't linked to a Surf ToDo account yet.\n\nIn the app, open *Connect WhatsApp*, generate a code, then send it here like:\nLINK ABC123"
      );
    }
    return;
  }

  await ctx.runMutation(internal.whatsapp.touchInbound, { phone });

  // Flush any reminders queued while the free window was closed.
  const pendingPrefix: string = await ctx.runMutation(internal.whatsapp.flushPending, { userId });

  const reply = await routeCommand(ctx, userId, body);
  await sendWhatsAppText(phone, pendingPrefix + reply);
}

async function routeCommand(ctx: ActionCtx, userId: Id<"users">, body: string): Promise<string> {
  const cmd = parseCommand(body);

  switch (cmd.kind) {
    case "help":
      return HELP_TEXT;

    case "link":
      return "✅ This number is already linked to your account.";

    case "unlink": {
      await ctx.runMutation(internal.whatsapp.unlinkByPhone, {
        phone: (await getPhoneForUser(ctx, userId)) ?? "",
      });
      return "🔌 Unlinked. Your tasks stay in the app — send a fresh LINK code anytime to reconnect.";
    }

    case "list": {
      const tasks: Doc<"todos">[] = await ctx.runQuery(internal.whatsapp.listTasksForUser, {
        userId,
        filter: cmd.filter,
      });
      await ctx.runMutation(internal.whatsapp.recordLastList, {
        userId,
        ids: tasks.map((t) => t._id),
      });
      const title =
        cmd.filter === "done" ? "Completed tasks" : cmd.filter === "urgent" ? "Urgent tasks" : "Open tasks";
      const hint = cmd.filter === "open" && tasks.length > 0 ? "\n\n_Reply e.g. \"done 1\", \"edit 2 …\", \"delete 3\"_" : "";
      return formatTaskList(title, tasks) + hint;
    }

    case "digest": {
      const open: Doc<"todos">[] = await ctx.runQuery(internal.whatsapp.listTasksForUser, {
        userId,
        filter: "open",
      });
      const urgent = open.filter((t) => t.category === "Urgent");
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const dueToday = open.filter((t) => t.dueAt && t.dueAt <= endOfDay.getTime());
      let out = `📋 *Today:* ${open.length} open task${open.length === 1 ? "" : "s"}`;
      if (urgent.length > 0) out += `\n\n${formatTaskList("🚨 Urgent", urgent)}`;
      if (dueToday.length > 0) out += `\n\n${formatTaskList("⏰ Due today", dueToday)}`;
      if (open.length === 0) out += "\nAll clear ✨";
      return out;
    }

    case "add": {
      await ctx.runMutation(internal.whatsapp.addTaskForUser, {
        userId,
        text: cmd.text,
        category: cmd.category,
      });
      return `✅ Added: *${cmd.text}* \`${cmd.category}\``;
    }

    case "done":
    case "delete":
    case "edit":
    case "move": {
      const todo: Doc<"todos"> | null = await ctx.runQuery(internal.whatsapp.resolveTaskRef, {
        userId,
        ref: cmd.ref,
      });
      if (!todo) return `🤔 Couldn't find a task matching \"${cmd.ref}\". Send *list* to see numbers.`;

      if (cmd.kind === "done") {
        if (todo.isCompleted) return `Already done: *${todo.text}* 👍`;
        await ctx.runMutation(internal.whatsapp.completeTaskForUser, { userId, todoId: todo._id });
        return `✔️ Closed: *${todo.text}*`;
      }
      if (cmd.kind === "delete") {
        await ctx.runMutation(internal.whatsapp.deleteTaskForUser, { userId, todoId: todo._id });
        return `🗑 Deleted: *${todo.text}*`;
      }
      if (cmd.kind === "edit") {
        await ctx.runMutation(internal.whatsapp.editTaskForUser, { userId, todoId: todo._id, text: cmd.text });
        return `✏️ Updated: *${cmd.text}*`;
      }
      await ctx.runMutation(internal.whatsapp.moveTaskForUser, {
        userId,
        todoId: todo._id,
        category: cmd.category,
      });
      return `📁 Moved *${todo.text}* → \`${cmd.category}\``;
    }

    case "unknown":
      return routeWithGemini(ctx, userId, body);
  }
}

async function routeWithGemini(ctx: ActionCtx, userId: Id<"users">, body: string): Promise<string> {
  const open: Doc<"todos">[] = await ctx.runQuery(internal.whatsapp.listTasksForUser, {
    userId,
    filter: "open",
  });
  const result = await parseWithGemini(body, open);
  if (!result) {
    return "🤔 I couldn't understand that.\n\n" + HELP_TEXT;
  }

  switch (result.action) {
    case "ADD": {
      if (!result.text) return "🤔 What should I add? Try: add buy milk";
      const category = CATEGORIES.includes(result.category as Category)
        ? (result.category as Category)
        : "Personal";
      await ctx.runMutation(internal.whatsapp.addTaskForUser, {
        userId,
        text: result.text,
        category,
        ...(result.dueAt ? { dueAt: result.dueAt } : {}),
      });
      const due = result.dueAt
        ? ` ⏰ ${new Date(result.dueAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
        : "";
      return `✅ Added: *${result.text}* \`${category}\`${due}`;
    }
    case "LIST":
      return routeCommand(ctx, userId, "list");
    case "LIST_DONE":
      return routeCommand(ctx, userId, "list done");
    case "LIST_URGENT":
      return routeCommand(ctx, userId, "list urgent");
    case "DIGEST":
      return routeCommand(ctx, userId, "today");
    case "TOGGLE":
    case "DELETE": {
      if (!result.taskRef) return "🤔 Which task? Send *list* to see numbers.";
      const todo: Doc<"todos"> | null = await ctx.runQuery(internal.whatsapp.resolveTaskRef, {
        userId,
        ref: result.taskRef,
      });
      if (!todo) return `🤔 Couldn't find a task matching \"${result.taskRef}\".`;
      if (result.action === "TOGGLE") {
        if (todo.isCompleted) return `Already done: *${todo.text}* 👍`;
        await ctx.runMutation(internal.whatsapp.completeTaskForUser, { userId, todoId: todo._id });
        return `✔️ Closed: *${todo.text}*`;
      }
      await ctx.runMutation(internal.whatsapp.deleteTaskForUser, { userId, todoId: todo._id });
      return `🗑 Deleted: *${todo.text}*`;
    }
    default:
      return "🤔 I couldn't understand that.\n\n" + HELP_TEXT;
  }
}

async function getPhoneForUser(ctx: ActionCtx, userId: Id<"users">): Promise<string | null> {
  const phone: string | null = await ctx.runQuery(internal.whatsapp.getPhoneForUserQuery, { userId });
  return phone;
}

export const getPhoneForUserQuery = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("whatsappUsers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    return link?.phone ?? null;
  },
});

/* ───────────────────────── WhatsApp sender ───────────────────────── */

export async function sendWhatsAppText(phone: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION ?? "v21.0";
  if (!token || !phoneNumberId) {
    console.log(`[whatsapp] env not configured — would send to ${phone}: ${body}`);
    return;
  }
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    console.error(`[whatsapp] send failed (${res.status}): ${await res.text()}`);
  }
}

export const HELP_TEXT = `*Surf ToDo commands* 🤖
• *add* buy milk [urgent] — new task
• *list* — open tasks
• *list done* — completed tasks
• *list urgent* — urgent only
• *today* — daily digest
• *done 2* — close task #2
• *edit 2* call dentist fri — change text
• *move 2 work* — change category
• *delete 1* — remove task
• *unlink* — disconnect WhatsApp

Or just talk naturally — "remind me to call mom tomorrow 6pm" 😉`;
