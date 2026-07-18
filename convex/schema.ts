import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
    createdAt: v.number(),
  }).index("by_category", ["category"]),
});