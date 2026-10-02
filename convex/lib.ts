import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx } from "./_generated/server";

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
