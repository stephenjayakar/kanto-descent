// Try alternative levelBonus / dmgScale / hpMul values and report player-vs-wild gaps and % HP per enemy hit.
const L = require('./lib.cjs');
const P = require('./progression.cjs');
const { stateAt, bestKit, enemyHitPct } = require('./matchup.cjs');
function report(label, lbs, dmgScaleFn, opts = {}) {
  const save = P.BIOMES.map(b => b.lb); P.BIOMES.forEach((b, i) => { if (lbs[i]) b.lb = lbs[i]; });
  console.log(`\n== ${label}`);
  for (const starter of ['CHARMANDER', 'BULBASAUR', 'SQUIRTLE', 'PIKACHU']) {
    const prog = P.simulate(starter, opts.sim || {});
    const cells = P.BIOMES.map((b, bi) => {
      const pL = Math.round((prog[bi].enter + prog[bi].preBoss) / 2); const st = stateAt(starter, pL);
      const pl = P.pool(b); const tot = pl.reduce((s, x) => s + x.rate, 0); let pct = 0, hits = 0, wl = 0;
      for (const x of pl) { const w = x.rate / tot; const eL = P.lvl(b, Math.floor((b.rooms - 1) / 2), (x.min + x.max) / 2); wl += w * eL; const eh = enemyHitPct(x.species, eL, st.sp, pL, dmgScaleFn(bi), opts.hpMul ? opts.hpMul / 3 : 1); pct += w * eh.pct; const k = bestKit(st, pL, x.species, eL); hits += w * (L.stats(x.species, eL).hp * 1.7 / Math.max(1, k.A.hit)); }
      return `${b.key} P${pL}/E${wl.toFixed(0)} hit ${(pct * 100).toFixed(1)}% kill ${hits.toFixed(1)}h`;
    });
    console.log(starter.padEnd(10), cells.join(' | '));
  }
  P.BIOMES.forEach((b, i) => { b.lb = save[i]; });
}
const cur = bi => 0.55 + 0.03 * bi;
report('CURRENT', [], cur);
report('levelBonus raised (forest [1,4], mtmoon [5,9], tower [6,10], silph [3,6], cave [-12,-7])', [[1, 4], [5, 9], [6, 10], [3, 6], [-12, -7]], cur);
report('raised levels + dmgScale 0.9+0.05*biome', [[1, 4], [5, 9], [6, 10], [3, 6], [-12, -7]], bi => 0.9 + 0.05 * bi);
report('raised levels + dmgScale 1.0 flat + player hpMul 2.5', [[1, 4], [5, 9], [6, 10], [3, 6], [-12, -7]], bi => 1.0, { hpMul: 2.5 });
