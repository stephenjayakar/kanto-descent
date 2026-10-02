// Run score for the records screen. Keep in sync with scoreRun in convex/lib.ts (the server recomputes it).
// Depth first (areas and rooms reached), then KOs, a bonus for escaping (more for a fast escape),
// all scaled by HEAT.
export function scoreRun(e) {
  const n = (v, max) => Math.max(0, Math.min(max, Math.floor(Number.isFinite(+v) ? +v : 0)));
  const biome = n(e.biome, 10), room = n(e.room, 50), kills = n(e.kills, 5000), heat = n(e.heat, 20), time = n(e.time, 1e7);
  const won = !!e.won;
  const base = biome * 1000 + room * 100 + kills * 5 + (won ? 5000 + Math.max(0, 2400 - time) * 2 : 0);
  return Math.round(base * (1 + 0.2 * heat));
}
