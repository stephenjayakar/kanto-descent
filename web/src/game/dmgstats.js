// Damage tally for the run records: who dealt how much damage with what, and how much each player took.
// World.applyDamage calls tallyDamage() with the HP actually removed. No imports, so combat.js can use it
// without an import cycle; run.js turns a tally into the compact summary stored with the run (dmgSummary).
//
// A tally lives on the run (run.dmg, saved with the room snapshots). Co-op player 2 has its own run object,
// which inherits from the host's, so the tally must be an own property (tallyOf).
// Keys: 'm:MOVE' (a move), 'p:SPECIES' (a called partner), 'b:TYPE' (a blessing proc, by its type),
// 's:burn|poison|trap|seed' (damage over time), 'x:env' (other).
const DOT_KIND = { orange: 'burn', purple: 'poison', white: 'trap', green: 'seed' }; // the DoT tick colours in combat.js

export function tallyOf(run) {
  if (!run) return null;
  return Object.prototype.hasOwnProperty.call(run, 'dmg') && run.dmg ? run.dmg : (run.dmg = { dealt: 0, taken: 0, best: 0, bestBy: null, by: {} });
}

export function tallyDamage(w, src, b, dmg, o) {
  if (!(dmg > 0)) return;
  if (b.team === 'player') { // damage taken (P1 or P2)
    const t = tallyOf(b.p2 ? b.run : w.run);
    if (t) t.taken += dmg;
    return;
  }
  if (b.team !== 'enemy' || !src) return;
  const owner = src.team === 'ally' ? src.owner || w.player : src;
  if (!owner || owner.team !== 'player') return;
  const t = tallyOf(owner.p2 ? owner.run : w.run);
  if (!t) return;
  const mv = o.move;
  const key = src !== owner ? 'p:' + src.species
    : o.slot === 'dot' ? 's:' + (DOT_KIND[o.color] || 'status')
    : mv ? (mv.startsWith('BOON_') ? 'b:' + mv.slice(5) : 'm:' + mv)
    : 'x:' + (o.slot === 'boon' ? 'boon' : 'env');
  t.dealt += dmg;
  t.by[key] = (t.by[key] || 0) + dmg;
  if (dmg > t.best) { t.best = dmg; t.bestBy = key; }
}
