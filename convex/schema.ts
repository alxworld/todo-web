import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  todos: defineTable({
    text: v.string(),
    isCompleted: v.boolean(),
    category: v.union(
      v.literal("Personal"),
      v.literal("Work"),
      v.literal("Errands"),
      v.literal("Fitness"),
      v.literal("Urgent")
    ),
    // Optional so pre-auth todos (created before ownership existed) remain
    // valid; they are orphaned and hidden from every user's list.
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_category", ["category"])
    .index("by_user", ["userId"]),
});
