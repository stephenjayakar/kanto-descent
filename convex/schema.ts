import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

// Kanto Descent backend. Players sign in with Google (Convex Auth); only emails in allowedEmails may
// play, sync saves or download the game's asset packs. Save data is keyed by the account's email.
export default defineSchema({
  ...authTables,

  // who may play (managed with `npx convex run access:*` or invite links)
  allowedEmails: defineTable({
    email: v.string(),
    note: v.optional(v.string()),
    addedAt: v.number(),
    admin: v.optional(v.boolean()),
  }).index("by_email", ["email"]),

  // One-time invite links (?invite=CODE): the first account to sign in with one joins allowedEmails.
  invites: defineTable({
    code: v.string(),
    createdBy: v.string(),
    note: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedBy: v.optional(v.string()),
    usedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),

  // the extracted game assets, served by GET /pack to allowed accounts only (the public site has none)
  assetPacks: defineTable({
    name: v.string(),
    storageId: v.id("_storage"),
    hash: v.string(),
    size: v.number(),
    uploadedAt: v.number(),
  }).index("by_name", ["name"]),

  // permanent progression (stardust, research, badges, dex, settings...)
  profiles: defineTable({
    email: v.string(),
    meta: v.any(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  // the run in progress, snapshotted at the start of each room (one per player)
  saves: defineTable({
    email: v.string(),
    save: v.any(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  // public trainer names for the records screen (one per account; emails are never shown to others)
  players: defineTable({
    email: v.string(),
    name: v.string(),
    nameLower: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]).index("by_nameLower", ["nameLower"]),

  // finished runs (deaths and escapes). `entry` is what the client sent; the top-level fields are
  // derived from it on the server for the leaderboards (runs from before v0.0.2 may lack them).
  runs: defineTable({
    email: v.string(),
    entry: v.any(),
    at: v.number(),
    score: v.optional(v.number()),
    result: v.optional(v.union(v.literal("win"), v.literal("lose"))),
    version: v.optional(v.string()),
    heat: v.optional(v.number()),
    starter: v.optional(v.string()),
  })
    .index("by_email_at", ["email", "at"])
    .index("by_email_version_at", ["email", "version", "at"])
    .index("by_at", ["at"])
    .index("by_score", ["score"])
    .index("by_version_at", ["version", "at"])
    .index("by_version_score", ["version", "score"])
    .index("by_starter_at", ["starter", "at"])
    .index("by_starter_score", ["starter", "score"]),
});
