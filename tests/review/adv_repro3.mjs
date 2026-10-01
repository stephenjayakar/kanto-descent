// Round-2 adversarial repros. node tests/review/adv_repro3.mjs
import { loadGame } from '../sim/env.mjs';
const G_ = await loadGame();
const { combat, run: RUN, data, rewards, input, core, moves, content } = G_;
const { makeActor } = combat;
const D = data.D;
const log = (...a) => console.log(...a);
const { RoomScene } = await import('../../web/src/scenes/room.js');
const player = await import('../../web/src/game/player.js');
const bosses = await import('../../web/src/game/bosses.js');
const spawn = await import('../../web/src/game/spawn.js');
const enterRoom = async (spec, starter = 'CHARMANDER', seed = 'S') => { RUN.newRun(starter, seed); const sc = new RoomScene(spec); await sc.enter(); sc.state = 'play'; return sc; };
const FOREST = { kind: 'combat', layout: 'LAYOUT_VIRIDIAN_FOREST', cropIndex: 0, reward: { kind: 'money' } };

// A) catch status bonus: status is wiped before catchShakes() reads it
{
  const sc = await enterRoom(FOREST);
  const w = sc.world, p = w.player;
  let shakesAsleep = 0, shakesAwake = 0;
  for (let trial = 0; trial < 400; trial++) for (const asleep of [true, false]) {
    w.balls = [];
    const e = spawn.makeEnemy(w, 'ONIX', 14, { x: p.x + 30, y: p.y, spawnT: 0 }); e.hp = Math.round(e.maxHp * 0.5); w.add(e);
    if (asleep) e.status.sleep = { t: 9, tick: 0 };
    w.balls.push({ x: p.x, y: p.y, from: { x: p.x, y: p.y }, to: { x: e.x, y: e.y }, target: e, t: 0.45, life: 0.45, ball: 'poke_ball', state: 'fly' });
    player.updateBalls(w, 0);
    const b = w.balls[0]; if (asleep) shakesAsleep += b.shakes; else shakesAwake += b.shakes;
    e.dead = true;
  }
  log(`[A] avg shakes: asleep ${(shakesAsleep / 400).toFixed(2)} vs awake ${(shakesAwake / 400).toFixed(2)} (asleep should be clearly higher)`);
}

// B) a confused enemy that is caught and breaks free stays confused forever (status wiped, flag kept)
{
  const sc = await enterRoom(FOREST);
  const w = sc.world, p = w.player;
  const e = spawn.makeEnemy(w, 'PIDGEY', 5, { x: p.x + 30, y: p.y, spawnT: 0 }); w.add(e);
  w.addStatus(e, 'confuse', p); w.step();
  w.balls = [{ x: p.x, y: p.y, from: { x: p.x, y: p.y }, to: { x: e.x, y: e.y }, target: e, t: 0.45, life: 0.45, ball: 'poke_ball', state: 'fly' }];
  player.updateBalls(w, 0); w.balls[0].shakes = 0; // force break-free
  for (let i = 0; i < 120; i++) player.updateBalls(w, 1 / 60);
  for (let i = 0; i < 60 * 10; i++) w.step();
  log(`[B] after break-free + 10s: status=${JSON.stringify(Object.keys(e.status))} confused=${e.confused} -> foesOf(e) includes player: ${w.foesOf(e).includes(p)}, other enemies too: ${w.foesOf(e).some(b => b.team === 'enemy')}`);
}

// C) refreshPlayer (level-up) in the middle of Dig keeps the action but drops untargetable/burrowed
{
  const sc = await enterRoom(FOREST, 'SQUIRTLE');
  const w = sc.world, p = w.player;
  w.useMove(p, moves.profile('DIG'), { aim: 0, slot: 'special', windup: 0 });
  w.step(); w.step();
  const before = { unt: p.untargetable, bur: p.burrowed, sp: p.speedMul };
  rewards.refreshPlayer(sc);
  log(`[C] mid-DIG refresh: action=${p.action?.p.kind} untargetable ${before.unt}->${p.untargetable} burrowed ${before.bur}->${p.burrowed} speedMul ${before.sp}->${p.speedMul}`);
  p.action = null;
  w.useMove(p, moves.profile('FLAMETHROWER'), { aim: 0, slot: 'special', windup: 0 }); w.step(); w.step();
  const s0 = p.speedMul; rewards.refreshPlayer(sc);
  log(`    mid-FLAMETHROWER refresh: speedMul ${s0}->${p.speedMul}`);
}

// D) enemy DISABLE hard-stuns the player for 1.2s through dash i-frames and cancels the dash
{
  const sc = await enterRoom({ ...FOREST }, 'PIKACHU');
  const w = sc.world, p = w.player;
  const e = spawn.makeEnemy(w, 'HYPNO', 30, { x: p.x + 30, y: p.y, spawnT: 0 }); e.brain = null; w.add(e);
  p.action = { p: { kind: 'dash' }, stage: 'active', t: 0, dur: 0.13, canMove: false, hits: new Set(), uninterruptible: true, vx: 300, vy: 0 };
  p.dashing = true; p.iframes = 0.3;
  w.useMove(e, 'DISABLE', { aim: Math.PI, target: p, slot: 'enemy', windup: 0 });
  w.step();
  log(`[D] HYPNO DISABLE vs dashing player with iframes 0.3: player.stun=${p.stun.toFixed(2)} dash action=${p.action?.p.kind ?? 'CANCELLED'} dashing=${p.dashing}; DISABLE windup=${moves.profile('DISABLE').windup}s`);
  log('    HYPNO moves at 30-45:', [30, 38, 45].map(l => spawn ? (G_.data.defaultMoves('HYPNO', l)).join('/') : '').join('  |  '));
}

// E) mid-area center can be followed by the forced pre-boss center (two centers in a row)
{
  RUN.newRun('CHARMANDER', 'C');
  const run = RUN.G.run; let doubles = 0, tries = 0;
  for (let s = 0; s < 400; s++) {
    run.rng = new (await import('../../web/src/engine/rng.js')).RNG('c' + s);
    for (const b of [0, 1, 2, 3, 4]) {
      run.biome = b; run.visited = {}; const B = content.BIOMES[b];
      run.roomInBiome = B.rooms - 3; // next = rooms-2
      const doors = RUN.rollDoors(run, 3); tries++;
      if (doors.some(d => d.kind === 'center')) doubles++;
    }
  }
  log(`[E] doors offered from room rooms-3 (next is rooms-2) that include a CENTER: ${doubles}/${tries}; the room after it is always the forced pre-boss CENTER`);
}

// F) old save that already escaped (wins>0) before HEAT existed: maxHeatWon=-1 -> rival only offers HEAT 0
{
  localStorage.setItem('kanto-descent-v1', JSON.stringify({ wins: 3, stardust: 0, research: { revive: 2, level: 3 } }));
  const m = RUN.loadMeta();
  const max = Math.min(content.HEAT.length - 1, (m.maxHeatWon ?? -1) + 1);
  const r = RUN.newRun('CHARMANDER', 'F');
  log(`[F] legacy save wins=3: highest HEAT offered=${max}; legacy research revive=2/level=3 -> run.revives=${r.revives} start Lv=${r.level} (new max: 1 revive, Lv9)`);
  localStorage.clear(); RUN.loadMeta();
}

// G) fixed-level damage (Night Shade) ignores freeze x1.5 / vulnerable x1.5 / slot boons; never crits
{
  const sc = await enterRoom(FOREST, 'GASTLY');
  const w = sc.world, p = w.player;
  const t = makeActor('CATERPIE', 10, 'enemy', { hpMul: 1.7 });
  const ns = moves.profile('NIGHT_SHADE');
  const d0 = w.calcDamage(p, t, ns, { scale: 1, slot: 'special' }).dmg;
  t.status.freeze = { t: 2 }; t.vulnerable = 2; p.slotMul = { special: 1.5 }; p.slotCrit = { special: 1 };
  const d1 = w.calcDamage(p, t, ns, { scale: 1, slot: 'special' });
  log(`[G] NIGHT_SHADE plain ${d0}, vs frozen+vulnerable with slotMul 1.5 and 100% slot crit: ${d1.dmg} crit=${d1.crit}`);
}

// H) confused enemy: do its projectiles/strikes/zones hit other enemies consistently?
{
  const sc = await enterRoom(FOREST);
  const w = sc.world, p = w.player; p.x = 40; p.y = 40;
  const a = spawn.makeEnemy(w, 'GASTLY', 20, { x: 160, y: 120, spawnT: 0 }); a.brain = null; w.add(a);
  const b = spawn.makeEnemy(w, 'CATERPIE', 20, { x: 160 + 18, y: 120, spawnT: 0 }); b.brain = null; b.maxHp = b.hp = 9999; w.add(b);
  a.confused = true; a.status.confuse = { t: 99, tick: 0 };
  const res = {};
  for (const mv of ['NIGHT_SHADE', 'EMBER', 'SMOG', 'LICK']) {
    b.hp = 9999; b.iframes = 0; a.action = null; a.cds = {};
    w.useMove(a, mv, { aim: 0, target: b, slot: 'enemy', windup: 0 });
    for (let i = 0; i < 90; i++) { w.step(); a.status.confuse.t = 99; }
    res[mv] = 9999 - b.hp;
  }
  log('[H] confused GASTLY damage dealt to an adjacent enemy by move kind:', JSON.stringify(res), '(strike/cloud use team checks, not foesOf)');
}

// I) boss HP from kitDps for each starter at its boss (sanity, extremes)
{
  const rows = [];
  for (const st of content.STARTERS) {
    for (const [bi, key, lvl] of [[0, 'BROCK', 13], [1, 'MISTY', 22], [2, 'MAROWAK', 30], [3, 'GIOVANNI', 38], [4, 'MEWTWO', 46]]) {
      RUN.newRun(st.species, 'K'); const run = RUN.G.run; run.level = lvl; run.biome = bi;
      const sc = new RoomScene({ kind: 'boss', layout: content.BIOMES[bi].bossRoom[0], cropIndex: content.BIOMES[bi].bossRoom[1], boss: key });
      await sc.enter();
      const def = bosses.BOSSES[key];
      const hp = def.mons.map(m => { const a = makeActor(m.species, m.level, 'enemy', { boss: true }); return Math.round(bosses.kitDps(sc.world, a) * 10) / 10; });
      rows.push(`${st.species.padEnd(10)} ${key.padEnd(8)} dps ${hp.join('/')}`);
    }
  }
  log('[I] kitDps:\n   ' + rows.join('\n   '));
}
process.exit(0);
