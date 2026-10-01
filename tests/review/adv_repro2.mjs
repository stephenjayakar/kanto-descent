// More adversarial repros. node tests/review/adv_repro2.mjs
import { loadGame } from '../sim/env.mjs';
const G_ = await loadGame();
const { combat, rooms, run: RUN, data, rewards, input, core } = G_;
const { makeActor } = combat;
const D = data.D;
const log = (...a) => console.log(...a);
const { RoomScene } = await import('../../web/src/scenes/room.js');
const enterRoom = async (spec, starter = 'CHARMANDER', seed = 'S') => { RUN.newRun(starter, seed); const sc = new RoomScene(spec); await sc.enter(); return sc; };

// A) C_NOHEAL curse: every refreshPlayer() re-wraps world.heal -> healing shrinks geometrically
{
  const sc = await enterRoom({ kind: 'combat', layout: 'LAYOUT_VIRIDIAN_FOREST', cropIndex: 0, reward: { kind: 'money' } });
  const { boons } = G_;
  sc.run.chaos.push({ curse: boons.CHAOS.curses.find(c => c.key === 'C_NOHEAL'), blessing: boons.CHAOS.blessings[0], rooms: 3, active: false });
  sc.world.hooks = RUN.buildHooks(sc.run, sc.world);
  for (let i = 0; i < 4; i++) rewards.refreshPlayer(sc); // e.g. 4 level-ups / boon picks in one room
  const p = sc.world.player; p.hp = 1;
  sc.world.heal(p, 1000);
  log('[A] heal(1000) with C_NOHEAL after 4 refreshes healed', p.hp - 1, '(expected 500)');
}

// B) NIGHT_SHADE / SEISMIC_TOSS / SUPER_FANG have power 1 in the data and no `fixed` profile
{
  const sc = await enterRoom({ kind: 'combat', layout: 'LAYOUT_VIRIDIAN_FOREST', cropIndex: 0, reward: { kind: 'money' } }, 'GASTLY');
  const w = sc.world, p = w.player;
  const { profile } = G_.moves;
  for (const [mv, tgt] of [['NIGHT_SHADE', 'CATERPIE'], ['LICK', 'CATERPIE'], ['NIGHT_SHADE', 'ONIX']]) {
    const t = makeActor(tgt, 14, 'enemy', { hpMul: 1.7 });
    const r = w.calcDamage(p, t, profile(mv), { scale: 1, slot: 'special' });
    log(`[B] Lv${p.level} GASTLY ${mv} vs ${tgt} (maxHp ${t.maxHp}): ${r.dmg} dmg`);
  }
  log('    data power: NIGHT_SHADE', D.moves.NIGHT_SHADE.power, 'SEISMIC_TOSS', D.moves.SEISMIC_TOSS.power, 'SUPER_FANG', D.moves.SUPER_FANG.power, 'MAGNITUDE', D.moves.MAGNITUDE.power);
}

// C) Itemfinder reroll (R at a door) also throws a POKé BALL in the same step
{
  const sc = await enterRoom({ kind: 'combat', layout: 'LAYOUT_VIRIDIAN_FOREST', cropIndex: 0, reward: { kind: 'money' } });
  sc.run.rerolls = 1; sc.state = 'play';
  sc.waves = []; sc.cleared = true; sc.openDoors();
  const d = sc.doors[0]; const p = sc.world.player; p.x = d.x + 14; p.y = d.y; d.armed = false;
  const balls0 = sc.run.balls, k0 = d.reward.kind;
  core.Engine.keys.add('r'); input.Input.poll(); core.Engine.keys.delete('r');
  sc.step(1 / 60);
  log('[C] reroll used:', sc.run.rerolls === 0, 'reward', k0, '->', d.reward.kind, ' balls', balls0, '->', sc.run.balls, ' ball thrown:', (sc.world.balls || []).length);
}

// D) hub door shows "undefined" and R in the hub burns rerolls + starting balls
{
  RUN.newRun('CHARMANDER', 'H');
  const sc = new RoomScene({ kind: 'hub', layout: 'LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB', cropIndex: 0, entry: { x: 7, y: 5 }, shopRoom: true });
  await sc.enter();
  log('[D] hub door label:', JSON.stringify(rewards.rewardLabel(sc.doors[0].reward)));
}

// E) Boss flinch-lock: player spam of a flinch move cancels most boss attacks
{
  const sc = await enterRoom({ kind: 'boss', layout: 'LAYOUT_PEWTER_CITY_GYM', cropIndex: 0, boss: 'BROCK' }, 'SQUIRTLE', 'B');
  const w = sc.world, run = sc.run;
  run.slots.attack = 'BITE';
  const { spawnBoss } = await import('../../web/src/game/bosses.js');
  const [boss] = spawnBoss(w, 'BROCK', { x: w.player.x, y: w.player.y - 40 }); boss.spawnT = 0;
  const p = w.player; p.hp = p.maxHp = 1e9; boss.brain = (await import('../../web/src/game/bosses.js')).bossBrain;
  let started = 0, fired = 0, last = null;
  for (let i = 0; i < 60 * 30; i++) {
    if (!p.action && (p.cds.slot_attack || 0) <= 0) { const act = w.useMove(p, 'BITE', { aim: Math.atan2(boss.y - p.y, boss.x - p.x), slot: 'attack' }); p.cds.slot_attack = 0.24; }
    p.x = boss.x; p.y = boss.y + 26;
    const a = boss.action;
    if (a && a !== last) { started++; last = a; }
    if (a && a.stage === 'active' && !a._c) { a._c = 1; fired++; }
    w.step();
  }
  log(`[E] 30s of BITE spam vs ONIX: boss started ${started} actions, only ${fired} reached their active frames`);
}
process.exit(0);
