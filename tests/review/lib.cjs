// Shared helpers replicating the game's formulas (read-only mirror of web/src/game/*).
const path = require('path');
const DD = p => require(path.join(__dirname, '../../web/assets/data', p));
const S = DD('species.json'), M = DD('moves.json'), T = DD('types.json'), E = DD('encounters.json'), TR = DD('trainers.json');
for (const [k, t] of Object.entries(TR)) t.key = k;
const SPECIAL = new Set(['FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'PSYCHIC', 'ICE', 'DRAGON', 'DARK']);
const eff = (at, defs) => defs.reduce((m, t) => m * (T.chart[at]?.[t] ?? 1), 1);
const calc = (b, iv, L, hp) => { const c = Math.floor(((2 * b + iv) * L) / 100); return hp ? c + L + 10 : c + 5; };
const stats = (sp, L, iv = 15) => { const b = S[sp].stats; return { hp: calc(b.hp, iv, L, 1), atk: calc(b.atk, iv, L), def: calc(b.def, iv, L), spa: calc(b.spa, iv, L), spd: calc(b.spd, iv, L), spe: calc(b.spe, iv, L) }; };
function expForLevel(rate, n) {
  if (n <= 1) return 0; const n3 = n * n * n;
  switch (rate) {
    case 'FAST': return Math.floor((4 * n3) / 5);
    case 'MEDIUM_SLOW': return Math.max(0, Math.floor((6 * n3) / 5 - 15 * n * n + 100 * n - 140));
    case 'SLOW': return Math.floor((5 * n3) / 4);
    case 'ERRATIC': if (n <= 50) return Math.floor((n3 * (100 - n)) / 50); if (n <= 68) return Math.floor((n3 * (150 - n)) / 100); return Math.floor((n3 * Math.floor((1911 - 10 * n) / 3)) / 500);
    case 'FLUCTUATING': if (n <= 15) return Math.floor((n3 * (Math.floor((n + 1) / 3) + 24)) / 50); if (n <= 36) return Math.floor((n3 * (n + 14)) / 50); return Math.floor((n3 * (Math.floor(n / 2) + 32)) / 50);
    default: return n3;
  }
}
function defaultMoves(sp, L) { const k = []; for (const [l, m] of S[sp]?.learnset || []) { if (l > L) break; if (!M[m]) continue; const i = k.indexOf(m); if (i >= 0) k.splice(i, 1); k.push(m); } return k.length ? k.slice(-4) : ['TACKLE']; }
// minimal profile mirror (just what matters for numbers)
const PROF = require('./profiles.cjs');
function prof(key) { const m = M[key] || M.TACKLE; const DV = require('./derive.cjs'); const p = { ...(PROF[key] || DV.derive(m)) }; p.key = key; p.type = m.type; p.power = m.power || 0; p.special = SPECIAL.has(m.type); p.damaging = p.power > 0 && !p.power0; p.windup ??= DV.defaultWindup(p); p.melee = ['swipe','lunge','charge','multi'].includes(p.kind); p.range ??= DV.estimateRange(p); return p; }
function enemyMoves(sp, L) { let mv = defaultMoves(sp, L); const dmg = m => prof(m).damaging; if (!mv.some(dmg)) { const pre = S[sp]?.preEvolution; if (pre) mv = [...new Set([...defaultMoves(pre, L).filter(dmg), ...mv])].slice(-4); } if (!mv.some(dmg)) mv = ['TACKLE', ...mv].slice(0, 4); return mv; }
// Gen3 base damage, average roll (0.925), no crit
function dmg({ L, A, D, power, stab, e }) { const base = (((2 * L) / 5 + 2) * power * A / Math.max(1, D)) / 50 + 2; return base * stab * e * 0.925; }
function hit(srcSp, srcL, srcIv, tgtSp, tgtL, tgtIv, moveKey, opt = {}) {
  const p = prof(moveKey); const a = stats(srcSp, srcL, srcIv), d = stats(tgtSp, tgtL, tgtIv);
  let e = eff(p.type, S[tgtSp].types); if (e === 0 && opt.player) e = 0.25;
  if (p.fixed) return p.fixed * (opt.enemy ? 0.5 : 1) * srcL / 20;
  return dmg({ L: srcL, A: p.special ? a.spa : a.atk, D: p.special ? d.spd : d.def, power: p.power, stab: S[srcSp].types.includes(p.type) ? 1.5 : 1, e });
}
module.exports = { S, M, T, E, TR, eff, stats, expForLevel, defaultMoves, prof, enemyMoves, hit, SPECIAL };
