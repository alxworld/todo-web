import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const categoryValidator = v.union(
  v.literal("Personal"),
  v.literal("Work"),
  v.literal("Errands"),
  v.literal("Fitness"),
  v.literal("Urgent")
);

export default defineSchema({
  ...authTables,
  todos: defineTable({
    text: v.string(),
    isCompleted: v.boolean(),
    category: categoryValidator,
    // Optional so pre-auth todos (created before ownership existed) remain
    // valid; they are orphaned and hidden from every user's list.
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
    // WhatsApp reminders: when the task is due, and whether a reminder was sent.
    dueAt: v.optional(v.number()),
    remindedAt: v.optional(v.number()),
  })
    .index("by_category", ["category"])
    .index("by_user", ["userId"]),
  // Single-use, short-lived codes that bind a WhatsApp phone number to a user.
  whatsappLinks: defineTable({
    code: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_user", ["userId"]),
  // Phone number (E.164 digits, no "+") → owning user.
  whatsappUsers: defineTable({
    phone: v.string(),
    userId: v.id("users"),
    linkedAt: v.number(),
    // Last inbound message time — drives the free 24h reply-window check.
    lastInboundAt: v.number(),
    // IDs from the most recent "list" reply, enabling "done 2" ordinals.
    lastListIds: v.array(v.id("todos")),
  })
    .index("by_phone", ["phone"])
    .index("by_user", ["userId"]),
  // Reminders fired while the 24h window was closed; flushed on next inbound.
  pendingNotifications: defineTable({
    userId: v.id("users"),
    phone: v.string(),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
