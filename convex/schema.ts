import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Cloud saves for Kanto Descent, keyed by the player's email.
export default defineSchema({
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

  // finished runs (deaths and escapes)
  runs: defineTable({
    email: v.string(),
    entry: v.any(),
    at: v.number(),
  }).index("by_email_at", ["email", "at"]),
});
