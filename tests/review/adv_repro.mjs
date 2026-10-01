// Adversarial review repros against the real game modules (headless). node tests/review/adv_repro.mjs
import { loadGame } from '../sim/env.mjs';
const G_ = await loadGame();
const { combat, rooms, run: RUN, data, boons, rewards } = G_;
const { World, makeActor, TILE } = combat;
const D = data.D;
const log = (...a) => console.log(...a);
const room = async (layout, idx, opts = { exits: 3 }) => rooms.buildRoom(await rooms.loadLayout(layout), rooms.candidates(layout)[idx], opts);
const mkWorld = (R) => { const r = RUN.newRun('CHARMANDER', 'SEED1'); const w = new World(R, { rng: r.rng }); w.run = r; w.hooks = {}; return w; };

// 1) Fat player vs Pewter Gym chokepoint (boss exit is at (0,0))
{
  const R = await room('LAYOUT_PEWTER_CITY_GYM', 0, { exits: 1 });
  log('[1] Pewter gym exit', R.exits[0].tx, R.exits[0].ty, 'entry', R.entry);
  for (const sp of ['CHARMANDER', 'CHARMELEON', 'GASTLY']) {
    const w = mkWorld(R); let best = 1e9;
    for (let x0 = 2; x0 <= R.w * TILE - 2; x0 += 0.5) {
      const a = makeActor(sp, 20, 'player', { x: x0, y: 5 * TILE + 8 });
      if (w.collides(a.x, a.y, a.r, 'walk')) continue;
      for (let i = 0; i < 120; i++) w.moveBy(a, 0, -1.8);
      best = Math.min(best, a.y);
    }
    log(`    ${sp} r=${makeActor(sp, 20, 'player').r.toFixed(2)}: highest y reached walking up from row 5 = ${best.toFixed(1)} (row ${Math.floor(best / TILE)}; door row 0)`);
  }
}

// 2) Captured enemy keeps thinking/attacking while invisible + cancelAction clears untargetable
{
  const R = await room('LAYOUT_VIRIDIAN_FOREST', 0);
  const w = mkWorld(R);
  const p = makeActor('CHARMANDER', 10, 'player', { x: R.entry.x, y: R.entry.y }); w.player = p; w.add(p);
  const { makeEnemy } = await import('../../web/src/game/spawn.js');
  const e = makeEnemy(w, 'PIDGEY', 6, { x: p.x + 30, y: p.y, spawnT: 0 }); w.add(e);
  e.hp = 1;
  // simulate the ball landing exactly as updateBalls does
  w.useMove(e, 'GUST', { aim: Math.PI, target: p }); // enemy mid-windup when the ball lands
  e.captured = true; e.untargetable = true; e.vx = e.vy = 0; w.cancelAction(e);
  log('[2] after capture: untargetable =', e.untargetable, '(expected true)');
  let acted = 0, moved = 0; const x0 = e.x, y0 = e.y;
  for (let i = 0; i < 120; i++) { w.step(); if (e.action) acted++; }
  log('    captured enemy frames with an action during 2s shake:', acted, ' moved px:', Math.hypot(e.x - x0, e.y - y0).toFixed(1));
}

// 3) Dash during DIG leaves the player burrowed (projectile-immune, drawn as a dirt mound) forever
{
  const R = await room('LAYOUT_VIRIDIAN_FOREST', 0);
  const w = mkWorld(R);
  const p = makeActor('CHARMANDER', 20, 'player', { x: R.entry.x, y: R.entry.y }); w.player = p; w.add(p);
  w.useMove(p, 'DIG', { aim: 0 }); for (let i = 0; i < 10; i++) w.step();
  w.cancelAction(p); // what playerBrain's dash does
  for (let i = 0; i < 600; i++) w.step();
  log('[3] after dash-cancel of DIG + 10s: burrowed =', p.burrowed, ' speedMul =', p.speedMul);
  // same for a stream (FLAMETHROWER) cancelled by a dash
  const q = makeActor('CHARMANDER', 20, 'player', { x: R.entry.x, y: R.entry.y }); w.add(q);
  w.useMove(q, 'FLAMETHROWER', { aim: 0 }); for (let i = 0; i < 10; i++) w.step(); w.cancelAction(q);
  for (let i = 0; i < 600; i++) w.step();
  log('    after dash-cancel of FLAMETHROWER + 10s: speedMul =', q.speedMul, '(player permanently slowed)');
  const { makeEnemy } = await import('../../web/src/game/spawn.js');
  const e = makeEnemy(w, 'CHARMELEON', 30, { x: R.entry.x + 40, y: R.entry.y, spawnT: 0, moves: ['FLAMETHROWER'] }); w.add(e);
  w.useMove(e, 'FLAMETHROWER', { aim: 0, target: q }); for (let i = 0; i < 40; i++) w.step();
  w.addStatus(e, 'sleep', null, { dur: 0.1 });
  for (let i = 0; i < 300; i++) w.step();
  log('    enemy stream interrupted by sleep: speedMul =', e.speedMul, '-> moveSpeed', combat.moveSpeed(e));
}

// 4) Shatter boon: freeze is removed before kill() runs, so onKill never sees a frozen foe
{
  const R = await room('LAYOUT_VIRIDIAN_FOREST', 0);
  const w = mkWorld(R);
  const run = w.run; RUN.addBoon(run, { key: 'A_SHATTER', rarity: 0, level: 1 });
  const p = RUN.makePlayer(run, R.entry.x, R.entry.y); w.player = p; w.add(p);
  w.hooks = RUN.buildHooks(run, w);
  const { makeEnemy } = await import('../../web/src/game/spawn.js');
  const e = makeEnemy(w, 'CATERPIE', 5, { x: p.x + 20, y: p.y, spawnT: 0 }); w.add(e);
  let novaCalls = 0; const orig = w.boonNova; w.boonNova = (...a) => { novaCalls++; return orig.apply(w, a); };
  w.addStatus(e, 'freeze', p); e.hp = 1;
  log('[4] frozen before hit:', !!e.status.freeze);
  w.applyDamage(p, e, { dmg: 5, slot: 'attack', type: 'NORMAL' });
  log('    enemy dead:', e.dead, ' Shatter explosions triggered:', novaCalls, '(expected 1)');
}

// 5) Metronome boon throws away the real Cast move
{
  const R = await room('LAYOUT_VIRIDIAN_FOREST', 0);
  const w = mkWorld(R);
  const run = w.run; RUN.addBoon(run, { key: 'MEW_METRONOME', rarity: 0, level: 1 });
  const p = RUN.makePlayer(run, R.entry.x, R.entry.y); w.player = p; w.add(p);
  w.hooks = RUN.buildHooks(run, w);
  const act = w.useMove(p, run.slots.cast, { slot: 'cast', aim: 0 }); // what tryUse('cast') does
  w.hooks.onCast(w, p);
  log('[5] cast move', act.move, 'still the active action after onCast?', p.action === act, ' now:', p.action?.move);
}

// 6) Deoxys curses C_HP / C_SPEED apply at room start, before any wave exists
{
  const { G } = RUN;
  RUN.newRun('CHARMANDER', 'SEED2');
  const run = G.run;
  run.chaos.push({ curse: boons.CHAOS.curses.find(c => c.key === 'C_HP'), blessing: boons.CHAOS.blessings[0], rooms: 3, active: false });
  const { RoomScene } = await import('../../web/src/scenes/room.js');
  const sc = new RoomScene({ kind: 'combat', layout: 'LAYOUT_VIRIDIAN_FOREST', cropIndex: 0, reward: { kind: 'money' } });
  await sc.enter();
  log('[6] enemies alive when onRoomStart ran: 0 (waves queued:', sc.waves.length, ')');
  sc.spawnWave(sc.waves[0]);
  const e = sc.world.enemies()[0];
  const base = Math.round(Math.round(data.monStats(e.species, e.level).hp * 1.7) * (e.elite ? 1.8 : 1));
  log('    first wave enemy maxHp', e.maxHp, 'vs uncursed', base, '-> curse applied?', e.maxHp > base);
}

// 7) refreshPlayer (level up mid-fight) keeps stages but drops stageTimers -> debuffs become permanent
{
  const { G } = RUN;
  const { RoomScene } = await import('../../web/src/scenes/room.js');
  RUN.newRun('CHARMANDER', 'SEED3');
  const sc = new RoomScene({ kind: 'combat', layout: 'LAYOUT_VIRIDIAN_FOREST', cropIndex: 0, reward: { kind: 'money' } });
  await sc.enter();
  const w = sc.world;
  w.changeStage(w.player, 'atk', -2); // e.g. an enemy GROWL x2
  rewards.refreshPlayer(sc);
  for (let i = 0; i < 60 * 20; i++) w.step();
  log('[7] player atk stage 20s after a level-up refresh:', w.player.stages.atk, '(should have reset to 0 after 12s)');
}

// 8) refreshPlayer resurrects a dead player (level-up from the same step as the player's death)
{
  const { RoomScene } = await import('../../web/src/scenes/room.js');
  RUN.newRun('CHARMANDER', 'SEED4');
  const sc = new RoomScene({ kind: 'combat', layout: 'LAYOUT_VIRIDIAN_FOREST', cropIndex: 0, reward: { kind: 'money' } });
  await sc.enter();
  const w = sc.world; const run = sc.run;
  w.player.hp = 0; w.player.dead = true; run.hp = 0;
  run.exp = data.expForLevel(D.species[run.species].growthRate, run.level + 1) - 1;
  const { makeEnemy } = await import('../../web/src/game/spawn.js');
  const e = makeEnemy(w, 'CATERPIE', 5, { x: w.player.x + 20, y: w.player.y, spawnT: 0 }); w.add(e);
  w.kill(e, null, {}); // same step: an enemy faints (burn tick / Explosion trade)
  for (const ev of w.events.splice(0)) sc.onEvent(ev);
  log('[8] player dead after kill-event level up?', w.player.dead, ' hp =', w.player.hp);
}

// 9) "Give up the run" is eaten by Focus Band / revives
{
  RUN.newRun('CHARMANDER', 'SEED5');
  const { G } = RUN; G.run.held = 'FOCUS_BAND'; G.run.revives = 1;
  const { RoomScene } = await import('../../web/src/scenes/room.js');
  const sc = new RoomScene({ kind: 'combat', layout: 'LAYOUT_VIRIDIAN_FOREST', cropIndex: 0, reward: { kind: 'money' } });
  await sc.enter();
  const w = sc.world;
  w.player.hp = 0; w.kill(w.player, null);
  log('[9] after "Give up the run": dead =', w.player.dead, 'hp =', w.player.hp, 'focusUsed =', G.run.focusUsed);
}
process.exit(0);
