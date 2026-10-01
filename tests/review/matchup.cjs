// Per-biome matchups: player (expected level) vs wild pool and bosses.
const L = require('./lib.cjs');
const { BIOMES, pool, lvl, simulate, trainersFor } = require('./progression.cjs');
const SPECIAL_EVOS = { PIKACHU: [30, 'RAICHU'], HAUNTER: [38, 'GENGAR'], KADABRA: [38, 'ALAKAZAM'], MACHOKE: [38, 'MACHAMP'], GRAVELER: [38, 'GOLEM'] };
const KITS = { CHARMANDER: ['SCRATCH', 'EMBER', 'GROWL'], BULBASAUR: ['VINE_WHIP', 'RAZOR_LEAF', 'LEECH_SEED'], SQUIRTLE: ['TACKLE', 'BUBBLE', 'WITHDRAW'], PIKACHU: ['QUICK_ATTACK', 'THUNDER_SHOCK', 'THUNDER_WAVE'], EEVEE: ['TACKLE', 'SWIFT', 'SAND_ATTACK'], GASTLY: ['LICK', 'NIGHT_SHADE', 'HYPNOSIS'], DRATINI: ['WRAP', 'TWISTER', 'THUNDER_WAVE'] };
function evoAt(sp, l) { for (const e of L.S[sp].evolutions || []) if (e.method === 'LEVEL' && l >= e.param) return e.into; if (SPECIAL_EVOS[sp] && l >= SPECIAL_EVOS[sp][0]) return SPECIAL_EVOS[sp][1]; for (const e of L.S[sp].evolutions || []) if (/FRIENDSHIP|TRADE/.test(e.method) && l >= 30) return e.into; if (sp === 'EEVEE' && l >= 20) return 'FLAREON'; return null; }
function stateAt(starter, level, startL = 5) {
  let sp = starter; const known = new Set(KITS[starter]);
  for (let l = startL + 1; l <= level; l++) { for (const [ll, m] of L.S[sp].learnset) if (ll === l) known.add(m); const into = evoAt(sp, l); if (into && L.S[into]) { sp = into; for (const [ll, m] of L.S[sp].learnset) if (ll === l) known.add(m); } }
  return { sp, known: [...known].filter(m => L.M[m]) };
}
const actDur = p => ({ swipe: 0.1, multi: 0.09 * (p.hits || 3) + 0.05, lunge: p.dur || 0.14, charge: p.dur || 0.26, proj: 0.08, seed: 0.08, stream: p.dur || 0.6, beam: (p.dur || 0.35) + Math.min(p.windup || 0, 0.25), chain: 0.1, nova: p.wave ? 0.35 : 0.12, strike: 0.15, cloud: 0.1, dig: p.dur || 0.9 }[p.kind] ?? 0.1);
function projHits(p, d = 45) { const n = p.count || 1; if (n === 1 || p.homing) return n; const thr = Math.atan(13 / d); let k = 0; for (let i = 0; i < n; i++) if (Math.abs((i / (n - 1) - 0.5) * (p.spread || 0) * 2) <= thr) k++; return Math.max(1, k); }
// damage units (in single-hit multiples) a player use deals to ONE target
function useUnits(p) {
  let u;
  switch (p.kind) {
    case 'swipe': { const c = p.combo || 1; u = c > 1 ? (c - 1 + 1.5) / c : 1; break; }
    case 'multi': u = Math.sqrt(p.hits || 3); break;
    case 'proj': u = projHits(p); break;
    case 'stream': u = ((p.dur || 0.6) / (p.rate || 0.05)) * 0.22 * 0.8; break;
    case 'beam': u = 1.4; break;
    case 'strike': u = (p.count || 1) > 1 ? 1.5 : 1; break;
    case 'cloud': u = p.power ? (p.dur || 3) / (p.tick || 0.5) * 0.35 : 0; break;
    default: u = 1;
  }
  return u * (1 + (p.crit || (L.M[p.key]?.effect === 'HIGH_CRITICAL' ? 0.25 : 0.0625)));
}
const interval = (p, slot) => slot === 'attack' ? Math.max(p.cd || 0.25, 0.04 + actDur(p) + 1 / 60) : Math.max(Math.max(0.35, (p.cd || 0.6) * 1.2), 0.04 + actDur(p));
function moveDps(pSp, pL, m, tSp, tL, slot, dmgMul = 1) { const p = L.prof(m); if (!p.damaging) return { dps: 0, hit: 0 }; const h = L.hit(pSp, pL, 20, tSp, tL, 15, m, { player: true }) * dmgMul; return { dps: h * useUnits(p) / interval(p, slot), hit: h, use: h * useUnits(p), int: interval(p, slot) }; }
function bestKit(st, pL, tSp, tL) {
  let best = null;
  for (const a of st.known) for (const s of st.known) { if (a === s) continue; const A = moveDps(st.sp, pL, a, tSp, tL, 'attack'), Sx = moveDps(st.sp, pL, s, tSp, tL, 'special'); const ps = L.prof(s); const tot = A.dps * (1 - (Sx.dps ? (0.04 + actDur(ps)) / Sx.int : 0)) + Sx.dps; if (!best || tot > best.tot) best = { a, s, tot, A, S: Sx }; }
  return best;
}
function enemyHitPct(eSp, eL, pSp, pL, dmgScale, maxHpMul = 1) {
  const pHp = L.stats(pSp, pL, 20).hp * 3 * maxHpMul; let best = { pct: 0 };
  for (const m of L.enemyMoves(eSp, eL)) { const p = L.prof(m); if (!p.damaging) continue; let h = L.hit(eSp, eL, 15, pSp, pL, 20, m, { enemy: true }); if (!p.fixed) h *= dmgScale; // player iframes 0.6s: only the first hit of a multi/stream/spread lands
    if (p.kind === 'multi') h *= 1 / Math.sqrt(p.hits || 3); if (p.kind === 'stream') h *= 0.22 * 2; if (p.kind === 'beam') h *= 1.4 / Math.max(1, Math.round((p.dur || 0.35) / 0.15));
    if (p.kind === 'nova' && p.selfKO) h *= 1;
    const pct = h / pHp; if (pct > best.pct) best = { pct, m, h: Math.round(h) }; }
  return best;
}
module.exports = { stateAt, bestKit, moveDps, enemyHitPct, useUnits, interval, KITS };
if (require.main === module) {
  const scen = process.argv[2] === 'candy' ? { candiesPerBiome: 1 } : {};
  for (const starter of (process.argv[3] || 'CHARMANDER,BULBASAUR,SQUIRTLE,PIKACHU,GASTLY,DRATINI,EEVEE').split(',')) {
    const prog = simulate(starter, scen);
    console.log(`\n######## ${starter}  (${process.argv[2] || 'no candy'})`);
    BIOMES.forEach((b, bi) => {
      const pL = Math.round((prog[bi].enter + prog[bi].preBoss) / 2); const st = stateAt(starter, pL); const dmgScale = 0.55 + 0.03 * bi;
      const pHp = Math.round(L.stats(st.sp, pL, 20).hp * 3);
      const pl = pool(b); const tot = pl.reduce((s, x) => s + x.rate, 0); const agg = {};
      for (const x of pl) { const k = x.species; agg[k] ??= { w: 0, l: 0 }; agg[k].w += x.rate / tot; agg[k].l += x.rate / tot * lvl(b, Math.floor((b.rooms - 1) / 2), (x.min + x.max) / 2); }
      console.log(`-- ${b.key}: player ${st.sp} L${pL} HP${pHp}  moves known: ${st.known.join(',')}`);
      let wHits = 0, wPct = 0, wTtk = 0;
      for (const [sp, a] of Object.entries(agg).sort((x, y) => y[1].w - x[1].w)) {
        const eL = Math.round(a.l / a.w); const eHp = Math.round(L.stats(sp, eL).hp * 1.7);
        const k = bestKit(st, pL, sp, eL); const hits = eHp / Math.max(1, k.A.hit * (L.prof(k.a).kind === 'multi' ? 1 / Math.sqrt(L.prof(k.a).hits || 3) : 1)); const ttk = eHp / Math.max(0.1, k.tot);
        const eh = enemyHitPct(sp, eL, st.sp, pL, dmgScale);
        wHits += a.w * hits; wPct += a.w * eh.pct; wTtk += a.w * ttk;
        if (a.w >= 0.04) console.log(`   ${(a.w * 100).toFixed(0).padStart(3)}% ${sp}${eL} HP${eHp}: best ${k.a}/${k.s}; ${hits.toFixed(1)} atk-hits, TTK@100% ${ttk.toFixed(2)}s; its best hit ${eh.m || '-'} ${eh.h ?? 0} = ${(eh.pct * 100).toFixed(1)}% of HP`);
      }
      console.log(`   => weighted: ${wHits.toFixed(1)} attack hits to kill, TTK ${wTtk.toFixed(2)}s, enemy hit = ${(wPct * 100).toFixed(1)}% HP (~${Math.round(1 / Math.max(wPct, 1e-3))} hits to faint)`);
    });
  }
}
