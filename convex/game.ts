import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { normEmail, requireUser, signedInUser, emailAllowed } from "./lib";
import { INVITER } from "./invites";

// Who am I? Works for signed-in accounts that aren't allowed yet, so the game can explain.
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await signedInUser(ctx);
    if (!user) return null;
    const email = normEmail(user.email);
    return { email, name: user.name ?? null, allowed: await emailAllowed(ctx, email), canInvite: email === INVITER };
  },
});

// Everything the game needs at sign-in: progression, the run in progress and recent run history.
export const load = query({
  args: {},
  handler: async (ctx) => {
    const e = normEmail((await requireUser(ctx)).email);
    const profile = await ctx.db.query("profiles").withIndex("by_email", q => q.eq("email", e)).unique();
    const save = await ctx.db.query("saves").withIndex("by_email", q => q.eq("email", e)).unique();
    const runs = await ctx.db.query("runs").withIndex("by_email_at", q => q.eq("email", e)).order("desc").take(30);
    return { email: e, meta: profile?.meta ?? null, save: save?.save ?? null, runs: runs.map(r => r.entry) };
  },
});

export const putMeta = mutation({
  args: { meta: v.any() },
  handler: async (ctx, { meta }) => {
    const e = normEmail((await requireUser(ctx)).email);
    const row = await ctx.db.query("profiles").withIndex("by_email", q => q.eq("email", e)).unique();
    if (row) await ctx.db.patch(row._id, { meta, updatedAt: Date.now() });
    else await ctx.db.insert("profiles", { email: e, meta, updatedAt: Date.now() });
  },
});

export const putSave = mutation({
  args: { save: v.any() },
  handler: async (ctx, { save }) => {
    const e = normEmail((await requireUser(ctx)).email);
    const row = await ctx.db.query("saves").withIndex("by_email", q => q.eq("email", e)).unique();
    if (save === null) { if (row) await ctx.db.delete(row._id); return; }
    if (row) await ctx.db.patch(row._id, { save, updatedAt: Date.now() });
    else await ctx.db.insert("saves", { email: e, save, updatedAt: Date.now() });
  },
});

export const addRun = mutation({
  args: { entry: v.any() },
  handler: async (ctx, { entry }) => {
    const e = normEmail((await requireUser(ctx)).email);
    await ctx.db.insert("runs", { email: e, entry, at: Date.now() });
  },
});
