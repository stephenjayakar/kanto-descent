import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const norm = (email: string) => email.trim().toLowerCase();

// Everything the game needs on login: progression, the run in progress and recent run history.
export const load = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const e = norm(email);
    const profile = await ctx.db.query("profiles").withIndex("by_email", q => q.eq("email", e)).unique();
    const save = await ctx.db.query("saves").withIndex("by_email", q => q.eq("email", e)).unique();
    const runs = await ctx.db.query("runs").withIndex("by_email_at", q => q.eq("email", e)).order("desc").take(30);
    return { meta: profile?.meta ?? null, save: save?.save ?? null, runs: runs.map(r => r.entry) };
  },
});

export const putMeta = mutation({
  args: { email: v.string(), meta: v.any() },
  handler: async (ctx, { email, meta }) => {
    const e = norm(email);
    const row = await ctx.db.query("profiles").withIndex("by_email", q => q.eq("email", e)).unique();
    if (row) await ctx.db.patch(row._id, { meta, updatedAt: Date.now() });
    else await ctx.db.insert("profiles", { email: e, meta, updatedAt: Date.now() });
  },
});

export const putSave = mutation({
  args: { email: v.string(), save: v.any() },
  handler: async (ctx, { email, save }) => {
    const e = norm(email);
    const row = await ctx.db.query("saves").withIndex("by_email", q => q.eq("email", e)).unique();
    if (save === null) { if (row) await ctx.db.delete(row._id); return; }
    if (row) await ctx.db.patch(row._id, { save, updatedAt: Date.now() });
    else await ctx.db.insert("saves", { email: e, save, updatedAt: Date.now() });
  },
});

export const addRun = mutation({
  args: { email: v.string(), entry: v.any() },
  handler: async (ctx, { email, entry }) => {
    await ctx.db.insert("runs", { email: norm(email), entry, at: Date.now() });
  },
});
