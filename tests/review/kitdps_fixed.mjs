// kitDps estimate vs actual per-hit damage for fixed-damage specials
import { loadGame } from '../sim/env.mjs';
const G_ = await loadGame();
const { run: RUN, combat, moves, content } = G_;
const bosses = await import('../../web/src/game/bosses.js');
const { RoomScene } = await import('../../web/src/scenes/room.js');
for (const [st, mv, lvl, bi, key] of [['DRATINI', 'DRAGON_RAGE', 30, 2, 'MAROWAK'], ['DRATINI', 'TWISTER', 30, 2, 'MAROWAK'], ['GASTLY', 'NIGHT_SHADE', 30, 2, 'MAROWAK'], ['SQUIRTLE', 'SONIC_BOOM', 22, 1, 'MISTY'], ['CHARMANDER', 'EMBER', 22, 1, 'MISTY']]) {
  RUN.newRun(st, 'K'); const run = RUN.G.run; run.level = lvl; run.biome = bi; run.slots.special = mv; run.slots.attack = 'GROWL';
  const B = content.BIOMES[bi];
  const sc = new RoomScene({ kind: 'boss', layout: B.bossRoom[0], cropIndex: B.bossRoom[1], boss: key }); await sc.enter();
  const w = sc.world, p = w.player; const m = bosses.BOSSES[key].mons[0];
  const boss = combat.makeActor(m.species, m.level, 'enemy', { boss: true });
  const est = bosses.kitDps(w, boss);
  let tot = 0; for (let i = 0; i < 200; i++) tot += w.calcDamage(p, boss, moves.profile(mv), { scale: 1, slot: 'special' }).dmg;
  const pr = moves.profile(mv); const interval = Math.max(0.35, (pr.cd || 0.6) * 1.2) + 0.12;
  console.log(`${st} L${lvl} ${mv} vs ${m.species}: kitDps ${est.toFixed(1)}  actual dmg/hit ${(tot / 200).toFixed(1)} -> actual special-only dps ~${((tot / 200) / interval * 0.35 * (pr.kind === 'proj' ? Math.min(pr.count || 1, 3) * 0.8 : 1)).toFixed(1)} (same weighting)`);
}
process.exit(0);
