import { query, mutation, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { normEmail, requireUser, signedInUser, emailAllowed, nameForEmail, ensurePlayer, cleanName, runFields } from "./lib";
import { INVITER } from "./invites";

// Who am I? Works for signed-in accounts that aren't allowed yet, so the game can explain.
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await signedInUser(ctx);
    if (!user) return null;
    const email = normEmail(user.email);
    const allowed = await emailAllowed(ctx, email);
    const row = allowed ? await ctx.db.query("allowedEmails").withIndex("by_email", q => q.eq("email", email)).first() : null;
    return {
      email, allowed, canInvite: email === INVITER, admin: email === INVITER || !!row?.admin,
      name: allowed ? await nameForEmail(ctx, email) : null, // public trainer name (records screen)
    };
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

// A finished run. The score and the other leaderboard fields are worked out here from the entry.
export const addRun = mutation({
  args: { entry: v.any() },
  handler: async (ctx, { entry }) => {
    const user = await requireUser(ctx);
    const e = normEmail(user.email);
    await ensurePlayer(ctx, user);
    const fields = runFields(entry);
    await ctx.db.insert("runs", { email: e, entry, at: Date.now(), ...fields });
    return { score: fields.score };
  },
});

// ---------------------------------------------------------------- records screen
// Change your public trainer name (2-12 characters, unique ignoring case).
export const rename = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name: raw }) => {
    const user = await requireUser(ctx);
    const player = await ensurePlayer(ctx, user);
    const name = cleanName(raw);
    const nameLower = name.toLowerCase();
    const taken = await ctx.db.query("players").withIndex("by_nameLower", q => q.eq("nameLower", nameLower)).first();
    if (taken && taken._id !== player._id) throw new Error(`The name ${name} is taken.`);
    await ctx.db.patch(player._id, { name, nameLower });
    return { name };
  },
});

// A run as the records screen sees it: no emails, just the trainer's public name and whether it's yours.
type Names = Map<string, string>;
async function publicRun(ctx: QueryCtx, r: Doc<"runs">, names: Names, me: string) {
  if (!names.has(r.email)) names.set(r.email, await nameForEmail(ctx, r.email));
  const e = r.entry || {};
  const f = runFields(e); // fallback for runs from before v0.0.2
  return {
    name: names.get(r.email)!, me: r.email === me,
    score: r.score ?? f.score, result: r.result ?? f.result, version: r.version ?? f.version,
    heat: r.heat ?? f.heat, starter: r.starter ?? f.starter,
    species: typeof e.species === "string" ? e.species : null, partner: typeof e.partner === "string" ? e.partner : null,
    level: Number(e.level) || 0, biome: Number(e.biome) || 0, room: Number(e.room) || 0,
    time: Number(e.time) || 0, kills: Number(e.kills) || 0, at: r.at,
  };
}

const sortArg = v.optional(v.union(v.literal("recent"), v.literal("score")));
const clampLimit = (limit: number | undefined) => Math.max(1, Math.min(limit ?? 12, 50));

// Everyone's runs: newest first or by score, optionally for one game version and/or one starter.
export const leaderboard = query({
  args: { version: v.optional(v.string()), sort: sortArg, starter: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { version, sort, starter, limit }) => {
    const me = normEmail((await requireUser(ctx)).email);
    const n = clampLimit(limit);
    const byScore = sort === "score";
    const runs = ctx.db.query("runs");
    let rows: Doc<"runs">[];
    if (version) {
      const q = byScore ? runs.withIndex("by_version_score", q => q.eq("version", version)) : runs.withIndex("by_version_at", q => q.eq("version", version));
      rows = await (starter ? q.filter(q => q.eq(q.field("starter"), starter)) : q).order("desc").take(n);
    } else if (starter) {
      const q = byScore ? runs.withIndex("by_starter_score", q => q.eq("starter", starter)) : runs.withIndex("by_starter_at", q => q.eq("starter", starter));
      rows = await q.order("desc").take(n);
    } else {
      rows = await (byScore ? runs.withIndex("by_score") : runs.withIndex("by_at")).order("desc").take(n);
    }
    const names: Names = new Map();
    return await Promise.all(rows.map(r => publicRun(ctx, r, names, me)));
  },
});

const SCAN_CAP = 3000; // runs read for totals (plenty for a playtest; keeps queries inside Convex's limits)

// The caller's own runs (newest first) and totals, optionally for one game version.
export const myRuns = query({
  args: { version: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { version, limit }) => {
    const me = normEmail((await requireUser(ctx)).email);
    const n = clampLimit(limit);
    const q = version
      ? ctx.db.query("runs").withIndex("by_email_version_at", q => q.eq("email", me).eq("version", version))
      : ctx.db.query("runs").withIndex("by_email_at", q => q.eq("email", me));
    const all = await q.order("desc").take(SCAN_CAP);
    const names: Names = new Map();
    const recent = await Promise.all(all.slice(0, n).map(r => publicRun(ctx, r, names, me)));
    let wins = 0, bestScore = 0;
    for (const r of all) {
      const f = runFields(r.entry);
      if ((r.result ?? f.result) === "win") wins++;
      bestScore = Math.max(bestScore, r.score ?? f.score);
    }
    return { player: { name: await nameForEmail(ctx, me), runs: all.length, wins, bestScore }, recent };
  },
});

// Trainers ranked by their best score, optionally within one game version.
export const topTrainers = query({
  args: { version: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { version, limit }) => {
    const me = normEmail((await requireUser(ctx)).email);
    const n = clampLimit(limit);
    const q = version ? ctx.db.query("runs").withIndex("by_version_at", q => q.eq("version", version)) : ctx.db.query("runs").withIndex("by_at");
    const per = new Map<string, { runs: number; wins: number; bestScore: number }>();
    for (const r of await q.order("desc").take(SCAN_CAP)) {
      const f = runFields(r.entry);
      const t = per.get(r.email) ?? { runs: 0, wins: 0, bestScore: 0 };
      t.runs++;
      if ((r.result ?? f.result) === "win") t.wins++;
      t.bestScore = Math.max(t.bestScore, r.score ?? f.score);
      per.set(r.email, t);
    }
    const top = [...per.entries()].sort((a, b) => b[1].bestScore - a[1].bestScore).slice(0, n);
    return await Promise.all(top.map(async ([email, t]) => ({ name: await nameForEmail(ctx, email), me: email === me, ...t })));
  },
});

// One-off after deploying v0.0.2: fill in the leaderboard fields on older runs so they sort and filter.
//   npx convex run game:backfillRuns [--prod]
export const backfillRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const r of await ctx.db.query("runs").collect()) {
      if (r.score !== undefined && r.version !== undefined) continue;
      await ctx.db.patch(r._id, runFields(r.entry));
      n++;
    }
    return { updated: n };
  },
});
