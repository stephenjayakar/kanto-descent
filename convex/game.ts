import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const norm = (email: string) => email.trim().toLowerCase();

// Access control: every call must carry the deployment's ACCESS_KEY (baked only into the private site /
// local config) and an email from ALLOWED_EMAILS (comma separated). Set both with `npx convex env set`.
function check(key: string, email: string) {
  const want = process.env.ACCESS_KEY;
  if (!want || key !== want) throw new Error("access denied");
  const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const e = norm(email);
  if (!allowed.includes(e)) throw new Error("this email is not allowed");
  return e;
}

// Everything the game needs on login: progression, the run in progress and recent run history.
export const load = query({
  args: { key: v.string(), email: v.string() },
  handler: async (ctx, { key, email }) => {
    const e = check(key, email);
    const profile = await ctx.db.query("profiles").withIndex("by_email", q => q.eq("email", e)).unique();
    const save = await ctx.db.query("saves").withIndex("by_email", q => q.eq("email", e)).unique();
    const runs = await ctx.db.query("runs").withIndex("by_email_at", q => q.eq("email", e)).order("desc").take(30);
    return { meta: profile?.meta ?? null, save: save?.save ?? null, runs: runs.map(r => r.entry) };
  },
});

export const putMeta = mutation({
  args: { key: v.string(), email: v.string(), meta: v.any() },
  handler: async (ctx, { key, email, meta }) => {
    const e = check(key, email);
    const row = await ctx.db.query("profiles").withIndex("by_email", q => q.eq("email", e)).unique();
    if (row) await ctx.db.patch(row._id, { meta, updatedAt: Date.now() });
    else await ctx.db.insert("profiles", { email: e, meta, updatedAt: Date.now() });
  },
});

export const putSave = mutation({
  args: { key: v.string(), email: v.string(), save: v.any() },
  handler: async (ctx, { key, email, save }) => {
    const e = check(key, email);
    const row = await ctx.db.query("saves").withIndex("by_email", q => q.eq("email", e)).unique();
    if (save === null) { if (row) await ctx.db.delete(row._id); return; }
    if (row) await ctx.db.patch(row._id, { save, updatedAt: Date.now() });
    else await ctx.db.insert("saves", { email: e, save, updatedAt: Date.now() });
  },
});

export const addRun = mutation({
  args: { key: v.string(), email: v.string(), entry: v.any() },
  handler: async (ctx, { key, email, entry }) => {
    const e = check(key, email);
    await ctx.db.insert("runs", { email: e, entry, at: Date.now() });
  },
});
