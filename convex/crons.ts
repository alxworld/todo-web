import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { sendWhatsAppText } from "./whatsapp";

const FREE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface DueReminder {
  phone: string;
  userId: Doc<"users">["_id"];
  todoId: Doc<"todos">["_id"];
  text: string;
  category: string;
  lastInboundAt: number;
}

export const getDueReminders = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const out: DueReminder[] = [];
    const links = await ctx.db.query("whatsappUsers").take(500);
    for (const link of links) {
      const todos = await ctx.db
        .query("todos")
        .withIndex("by_user", (q) => q.eq("userId", link.userId))
        .take(200);
      for (const todo of todos) {
        if (todo.isCompleted || !todo.dueAt || todo.remindedAt) continue;
        if (todo.dueAt > args.now) continue;
        out.push({
          phone: link.phone,
          userId: link.userId,
          todoId: todo._id,
          text: todo.text,
          category: todo.category,
          lastInboundAt: link.lastInboundAt,
        });
      }
    }
    return out;
  },
});

export const markReminded = internalMutation({
  args: { todoId: v.id("todos") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.todoId, { remindedAt: Date.now() });
  },
});

export const queueNotification = internalMutation({
  args: { userId: v.id("users"), phone: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("pendingNotifications", {
      userId: args.userId,
      phone: args.phone,
      body: args.body,
      createdAt: Date.now(),
    });
  },
});

/**
 * Zero-cost reminder delivery:
 *  - 24h free window OPEN  → send immediately (session message, free)
 *  - window CLOSED         → queue; flushed for free on the user's next message
 *  No paid templates are ever used, so charges are structurally impossible.
 */
export const sendDueReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due: DueReminder[] = await ctx.runQuery(internal.crons.getDueReminders, { now });
    for (const r of due) {
      const body = `⏰ Reminder: *${r.text}* \`${r.category}\` is due.\nReply "done" when finished, or "list" for all tasks.`;
      const windowOpen = now - r.lastInboundAt < FREE_WINDOW_MS;
      if (windowOpen) {
        await sendWhatsAppText(r.phone, body);
      } else {
        await ctx.runMutation(internal.crons.queueNotification, {
          userId: r.userId,
          phone: r.phone,
          body,
        });
      }
      await ctx.runMutation(internal.crons.markReminded, { todoId: r.todoId });
    }
  },
});

const crons = cronJobs();
crons.interval("whatsapp due-task reminders", { minutes: 15 }, internal.crons.sendDueReminders, {});
export default crons;
