import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getTodos = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("todos").order("desc").collect();
  },
});

export const addTodo = mutation({
  args: { 
    text: v.string(), 
    category: v.union(
      v.literal("Personal"),
      v.literal("Work"),
      v.literal("Errands"),
      v.literal("Fitness"),
      v.literal("Urgent")
    )
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("todos", {
      text: args.text,
      category: args.category,
      isCompleted: false,
      createdAt: Date.now(),
    });
  },
});

export const toggleTodo = mutation({
  args: { id: v.id("todos"), isCompleted: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isCompleted: args.isCompleted });
  },
});

export const deleteTodo = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});