// Boss HP (bossHp mirror), fight length and boss damage per hit for each starter at its expected pre-boss level.
const L = require('./lib.cjs');
const { simulate } = require('./progression.cjs');
const { stateAt, bestKit, moveDps, useUnits } = require('./matchup.cjs');
const BOSSES = [
  { name: 'BROCK', mons: [['ONIX', 14, 70, 0.5]], adds: [2, 'GEODUDE', 12, 2], pats: [['ROCK_TOMB', 50, 'ROCK'], ['BIND(sweep)', 15, 'NORMAL'], ['TACKLE(charge)', 35, 'NORMAL'], ['ROCK_THROW', 50, 'ROCK']] },
  { name: 'MISTY', mons: [['STARMIE', 21, 80, 0.5]], adds: [1, 'STARYU', 18, 1], pats: [['SWIFT x5', 60, 'NORMAL'], ['WATER_PULSE nova', 60, 'WATER'], ['RAPID_SPIN x3 ricochet', 20, 'NORMAL'], ['BUBBLE_BEAM radial', 65, 'WATER']] },
  { name: 'MAROWAK', mons: [['MAROWAK', 30, 90, 0.5]], adds: [2, 'GASTLY', 22, 2], pats: [['BONEMERANG', 50, 'GROUND'], ['BONE_CLUB leap', 65, 'GROUND'], ['BONE_RUSH charge', 25, 'GROUND']] },
  { name: 'GIOVANNI', mons: [['RHYHORN', 37, 55, 0.45], ['KANGASKHAN', 35, 55, 0.45], ['NIDOQUEEN', 41, 70, 0.5]], pats: [['RHYHORN HORN_ATTACK charge', 65, 'NORMAL', 'RHYHORN'], ['RHYHORN ROCK_TOMB', 50, 'ROCK', 'RHYHORN'], ['KANGASKHAN COMET_PUNCH x5 (1/sqrt5)', 18, 'NORMAL', 'KANGASKHAN', 1 / Math.sqrt(5)], ['KANGASKHAN MEGA_PUNCH', 80, 'NORMAL', 'KANGASKHAN'], ['KANGASKHAN EARTHQUAKE', 100, 'GROUND', 'KANGASKHAN'], ['NIDOQUEEN EARTHQUAKE', 100, 'GROUND', 'NIDOQUEEN'], ['NIDOQUEEN BODY_SLAM', 85, 'NORMAL', 'NIDOQUEEN']] },
  { name: 'MEWTWO', mons: [['MEWTWO', 70, 140, 0.42]], pats: [['PSYCHIC strike', 90, 'PSYCHIC'], ['SWIFT x8', 60, 'NORMAL'], ['PSYBEAM sweep (0.5/tick)', 65, 'PSYCHIC', null, 0.5], ['SHADOW_BALL radial', 80, 'GHOST'], ['FUTURE_SIGHT', 80, 'PSYCHIC'], ['PSYSTRIKE storm', 100, 'PSYCHIC']] },
];
const SPECIAL = L.SPECIAL;
function bossHp(pSp, pL, kit, bSp, bL, hits) {
  let best = 0; const a = L.stats(pSp, pL, 20), d = L.stats(bSp, bL, 15);
  for (const k of kit) { const p = L.prof(k); if (!p.damaging) continue; const A = p.special ? a.spa : a.atk, D = p.special ? d.spd : d.def; const base = (((2 * pL) / 5 + 2) * Math.max(30, p.power) * A / D) / 50 + 2; const stab = L.S[pSp].types.includes(p.type) ? 1.5 : 1; const e = Math.max(0.25, L.eff(p.type, L.S[bSp].types)); best = Math.max(best, base * stab * Math.sqrt(e)); }
  const gap = Math.max(0.75, Math.min(1.4, 1 + (bL - pL) * 0.03));
  return Math.max(60, Math.round(Math.max(4, best) * hits * gap));
}
function bossHit(bSp, bL, power, type, pSp, pL, scale, mult = 1) { const p = { special: SPECIAL.has(type) }; const a = L.stats(bSp, bL, 15), d = L.stats(pSp, pL, 20); const base = (((2 * bL) / 5 + 2) * power * (p.special ? a.spa : a.atk) / (p.special ? d.spd : d.def)) / 50 + 2; let e = L.eff(type, L.S[pSp].types); const stab = L.S[bSp].types.includes(type) ? 1.5 : 1; return base * stab * e * 0.925 * scale * mult; }
const cand = process.argv[2] === 'candy' ? { candiesPerBiome: 1 } : {};
for (const starter of ['CHARMANDER', 'BULBASAUR', 'SQUIRTLE', 'PIKACHU', 'EEVEE', 'GASTLY', 'DRATINI']) {
  const prog = simulate(starter, cand);
  console.log(`\n######## ${starter}`);
  BOSSES.forEach((B, bi) => {
    const pL = prog[bi].preBoss; const st = stateAt(starter, pL); const pHp = L.stats(st.sp, pL, 20).hp * 3;
    let totT = 0; const lines = [];
    for (const [bSp, bL, hits, sc] of B.mons) {
      const k = bestKit(st, pL, bSp, bL);
      const hp = bossHp(st.sp, pL, [k.a, k.s], bSp, bL, hits);
      const t = hp / k.tot; totT += t;
      lines.push(`${bSp}${bL}: HP ${hp} (${hits} hits), kit ${k.a}/${k.s}, DPS@100% ${k.tot.toFixed(1)} -> ${t.toFixed(0)}s @100% uptime, ${(t / 0.5).toFixed(0)}s @50%`);
    }
    const dm = B.pats.map(([n, pow, ty, who, mult]) => { const m = B.mons.find(x => x[0] === (who || B.mons[0][0])); const h = bossHit(m[0], m[1], pow, ty, st.sp, pL, m[3], mult); return `${n} ${(h / pHp * 100).toFixed(0)}%`; });
    console.log(`-- ${B.name} @ player ${st.sp} L${pL} (HP ${pHp}): total ${totT.toFixed(0)}s@100% / ${(totT / 0.5).toFixed(0)}s@50%\n     ${lines.join('\n     ')}\n     boss hit as % player HP: ${dm.join(', ')}`);
  });
}
