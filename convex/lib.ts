import { getAuthUserId } from "@convex-dev/auth/server";
import { MutationCtx, QueryCtx } from "./_generated/server";

export const normEmail = (email: string | undefined) => (email || "").trim().toLowerCase();

// The allowlist lives in the allowedEmails table. An empty table means nobody can play.
export async function emailAllowed(ctx: QueryCtx, email: string | undefined): Promise<boolean> {
  const e = normEmail(email);
  if (!e) return false;
  return !!(await ctx.db.query("allowedEmails").withIndex("by_email", (q) => q.eq("email", e)).first());
}

// The signed-in user, allowlisted or not (only invite redemption accepts these).
export async function signedInUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  return userId ? await ctx.db.get(userId) : null;
}

// The signed-in, allowlisted user, or null.
export async function currentUser(ctx: QueryCtx) {
  const user = await signedInUser(ctx);
  if (!user || !(await emailAllowed(ctx, user.email))) return null;
  return user;
}

export async function requireUser(ctx: QueryCtx) {
  const user = await currentUser(ctx);
  if (!user) throw new Error("Please sign in with an allowed Google account.");
  return user;
}

// ---------------------------------------------------------------- trainers and run records
type UserRef = { name?: string; email?: string };

// A trainer name for a new player: the first word of the Google name (or the email's local part),
// uppercase letters and digits, at most 12 characters.
export function defaultName(user: UserRef | null | undefined): string {
  const raw = (user?.name || (user?.email || "").split("@")[0] || "RED").split(/[ @._-]/)[0];
  return raw.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase().slice(0, 12) || "RED";
}

export function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim().toUpperCase();
  if (name.length < 2 || name.length > 12) throw new Error("Name must be 2-12 characters.");
  if (!/^[\p{L}\p{N} .'!?-]+$/u.test(name)) throw new Error("Name has characters the game font can't show.");
  return name;
}

export async function playerByEmail(ctx: QueryCtx, email: string) {
  return await ctx.db.query("players").withIndex("by_email", (q) => q.eq("email", email)).first();
}

// The account's public trainer name, without creating anything (queries can't write).
export async function nameForEmail(ctx: QueryCtx, email: string): Promise<string> {
  const p = await playerByEmail(ctx, email);
  if (p) return p.name;
  const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first();
  return defaultName(user ?? { email });
}

// Finds or creates the trainer row for an account. A default name already taken gets a number.
export async function ensurePlayer(ctx: MutationCtx, user: UserRef) {
  const email = normEmail(user.email);
  const existing = await playerByEmail(ctx, email);
  if (existing) return existing;
  const base = defaultName(user);
  let name = base;
  for (let i = 2; await ctx.db.query("players").withIndex("by_nameLower", (q) => q.eq("nameLower", name.toLowerCase())).first(); i++) {
    name = base.slice(0, 12 - String(i).length) + i;
  }
  const id = await ctx.db.insert("players", { email, name, nameLower: name.toLowerCase(), createdAt: Date.now() });
  return (await ctx.db.get(id))!;
}

// Runs from clients that predate version tagging count as v0.0.1.
export const LEGACY_VERSION = "v0.0.1";
export function cleanVersion(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return LEGACY_VERSION;
  const s = String(raw).trim().slice(0, 16);
  return /^v[0-9][0-9A-Za-z.-]*$/.test(s) ? s : "unknown";
}

const num = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number.isFinite(Number(v)) ? Number(v) : 0)));

// Keep in sync with web/src/game/score.js: depth first (areas and rooms reached), then KOs, a bonus
// for escaping (more for a fast escape), all scaled by HEAT.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scoreRun(e: any): number {
  const biome = num(e?.biome, 10), room = num(e?.room, 50), kills = num(e?.kills, 5000), heat = num(e?.heat, 20), time = num(e?.time, 1e7);
  const won = !!e?.won;
  const base = biome * 1000 + room * 100 + kills * 5 + (won ? 5000 + Math.max(0, 2400 - time) * 2 : 0);
  return Math.round(base * (1 + 0.2 * heat));
}

// The indexed fields of a run, derived from the client's entry.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function runFields(entry: any) {
  return {
    score: scoreRun(entry),
    result: (entry?.won ? "win" : "lose") as "win" | "lose",
    version: cleanVersion(entry?.version),
    heat: num(entry?.heat, 20),
    starter: String(entry?.starter || "").toUpperCase().slice(0, 24),
  };
}
