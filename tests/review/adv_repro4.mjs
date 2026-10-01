// Round-2 repros, part 2. node tests/review/adv_repro4.mjs
import { loadGame, tickTimers, sim } from '../sim/env.mjs';
const G_ = await loadGame();
const { combat, run: RUN, rewards, core, input, boons, moves } = G_;
const { Engine } = core;
const log = (...a) => console.log(...a);
const { RoomScene } = await import('../../web/src/scenes/room.js');
const spawn = await import('../../web/src/game/spawn.js');
const bosses = await import('../../web/src/game/bosses.js');
const ui = await import('../../web/src/scenes/ui.js');
const enterRoom = async (spec, starter = 'CHARMANDER', seed = 'S') => { RUN.newRun(starter, seed); const sc = new RoomScene(spec); await sc.enter(); sc.state = 'play'; return sc; };
const FOREST = { kind: 'combat', layout: 'LAYOUT_VIRIDIAN_FOREST', cropIndex: 0, reward: { kind: 'money' } };

// 1) Shatter with world.time > 0, heal wrap ratio after refreshes
{
  const sc = await enterRoom(FOREST);
  const w = sc.world, run = sc.run;
  RUN.addBoon(run, { key: 'A_SHATTER', rarity: 0, level: 1 }); rewards.refreshPlayer(sc);
  for (let i = 0; i < 30; i++) w.step();
  const e = spawn.makeEnemy(w, 'CATERPIE', 5, { x: w.player.x + 20, y: w.player.y, spawnT: 0 }); w.add(e);
  let n = 0; const o = w.boonNova; w.boonNova = (...a) => { n++; return o.apply(w, a); };
  w.addStatus(e, 'freeze', w.player); e.hp = 1; w.applyDamage(w.player, e, { dmg: 5, slot: 'attack' });
  log('[1] Shatter novas on killing a frozen foe (t>0):', n);
  run.chaos.push({ curse: boons.CHAOS.curses.find(c => c.key === 'C_NOHEAL'), blessing: boons.CHAOS.blessings[0], rooms: 3, active: false });
  for (let i = 0; i < 4; i++) rewards.refreshPlayer(sc);
  const p = w.player; p.hp = 1; w.heal(p, 20);
  log('    C_NOHEAL heal(20) after 4 refreshes ->', p.hp - 1, '(expect 10)');
}

// 2) popOverlay deletes Enter from Engine.keys: OS key-repeat of a held Enter then reads as a fresh press
{
  const sc = await enterRoom(FOREST);
  core.setScene(sc); sc.state = 'play';
  let picked = null;
  const d = new ui.Dialog(['Hello']); core.pushOverlay(d);
  // user presses and HOLDS Enter to close the dialog
  const keydown = (k, repeat) => { if (!Engine.keys.has(k)) Engine.pressed.add(k); Engine.keys.add(k); };
  d.chars = 99; keydown('Enter'); d.update(1 / 60); Engine.pressed.clear();
  // the game immediately opens a choice (e.g. a boon pick after a reward dialog)
  const c = new ui.Choice('Pick', [{ title: 'A' }, { title: 'B' }], { onPick: i => { picked = i; } }); core.pushOverlay(c);
  for (let f = 0; f < 60; f++) { // 1s, Enter still physically held; browser auto-repeat fires keydown every ~33ms after 500ms
    if (f >= 30 && f % 2 === 0) keydown('Enter', true);
    if (core.topOverlay() === c) c.update(1 / 60);
    Engine.pressed.clear();
  }
  log('[2] holding Enter through a dialog close: Choice auto-picked card =', picked, '(null = safe)');
  Engine.keys.clear(); Engine.overlays.length = 0;
}

// 3) boss defeated while its strikes are still in the air -> player can faint after winning
{
  const sc = await enterRoom({ kind: 'boss', layout: 'LAYOUT_CERULEAN_CAVE_B1F', cropIndex: 0, boss: 'MEWTWO' }, 'CHARMANDER', 'M');
  const w = sc.world, p = w.player;
  sc.pendingIntro = null;
  const list = bosses.spawnBoss(w, 'MEWTWO', { x: p.x, y: p.y - 60 }); sc.bossLive = true;
  const m = list[0]; m.spawnT = 0; m.brain = null;
  // Psystrike storm aimed at the player, then MEWTWO dies to the player's hit
  w.strikes.push({ owner: m, act: { p: moves.profile('PSYCHIC'), slot: 'enemy', hits: new Set() }, x: p.x, y: p.y, r: 22, t: 0, delay: 0.85, p: { ...moves.profile('PSYCHIC'), power: 90 }, slot: 'enemy', team: 'enemy' });
  p.hp = 5; RUN.G.run.hp = 5; RUN.G.run.revives = 0;
  w.applyDamage(p, m, { dmg: 1e6, slot: 'attack' });
  for (let i = 0; i < 60; i++) { sc.step(1 / 60); tickTimers(1 / 60); }
  log('[3] MEWTWO dead:', m.dead, ' bossDone:', !!sc.bossDone, ' player dead 1s later:', p.dead, ' dying:', !!sc.dying);
}

// 4) gamepad A (button 0) is dash AND interact: dashing next to a door burns an Itemfinder reroll
{
  const sc = await enterRoom(FOREST);
  sc.run.rerolls = 2; sc.waves = []; sc.cleared = true; sc.openDoors();
  const dr = sc.doors[0]; const p = sc.world.player; p.x = dr.x; p.y = dr.y + 18; dr.armed = false;
  const pad = { connected: true, buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 0, value: i === 0 ? 1 : 0 })), axes: [0, 0, 0, 0] };
  globalThis.navigator.getGamepads = () => [pad];
  const k0 = dr.reward.kind;
  sc.update(1 / 60);
  log('[4] pad A next to a door: rerolls 2 ->', sc.run.rerolls, ' dash started:', p.action?.p?.kind === 'dash', ' reward', k0, '->', dr.reward.kind);
  globalThis.navigator.getGamepads = () => [];
}
process.exit(0);
