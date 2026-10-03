import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { normEmail, requireUser } from "./lib";

// Co-op signalling only: the host posts a WebRTC offer under a short room code, the guest posts an answer,
// then the two browsers talk directly (game video/audio one way, inputs the other). Rooms expire after 2h.
const TTL = 2 * 60 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const create = mutation({
  args: { offer: v.string() },
  handler: async (ctx, { offer }) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    for (const old of await ctx.db.query("coopRooms").withIndex("by_createdAt", q => q.lt("createdAt", now - TTL)).take(50)) await ctx.db.delete(old._id);
    let code = "";
    for (let tries = 0; tries < 10; tries++) {
      code = Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
      if (!(await ctx.db.query("coopRooms").withIndex("by_code", q => q.eq("code", code)).first())) break;
    }
    await ctx.db.insert("coopRooms", { code, host: normEmail(user.email), hostName: user.name ?? undefined, offer, createdAt: now });
    return { code };
  },
});

// The guest reads the offer (and claims the room); the host polls this for the answer.
export const get = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    await requireUser(ctx);
    const r = await ctx.db.query("coopRooms").withIndex("by_code", q => q.eq("code", code.toUpperCase())).first();
    if (!r || r.createdAt < Date.now() - TTL) return null;
    return { offer: r.offer, answer: r.answer ?? null, hostName: r.hostName ?? null, taken: !!r.guest };
  },
});

export const answer = mutation({
  args: { code: v.string(), answer: v.string() },
  handler: async (ctx, { code, answer }) => {
    const me = normEmail((await requireUser(ctx)).email);
    const r = await ctx.db.query("coopRooms").withIndex("by_code", q => q.eq("code", code.toUpperCase())).first();
    if (!r || r.createdAt < Date.now() - TTL) throw new Error("That co-op code has expired.");
    if (r.guest && r.guest !== me) throw new Error("Someone already joined that game.");
    await ctx.db.patch(r._id, { guest: me, answer });
  },
});
