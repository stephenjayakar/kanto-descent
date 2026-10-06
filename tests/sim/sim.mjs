// Headless balance simulator: plays whole runs with a bot through the real game scenes.
//   node tests/sim/sim.mjs [runs=10] [starter=CHARMANDER|all] [skill=0.8] [research=0..1]
// skill: 0..1 — how reliably the bot reacts to telegraphs (reaction delay and dodge chance).
import { sim, tickTimers, loadGame } from './env.mjs';

const G_ = await loadGame();
const { core, input, run: RUN, rewards, data, moves, content, boons, combat } = G_;
const { Engine } = core;
const { Input } = input;
const D = data.D;
const STEP = 1 / 60;

const args = process.argv.slice(2);
const N = +(args[0] || 10);
const STARTER = args[1] || 'CHARMANDER';
const SKILL = +(args[2] ?? 0.8);
const RESEARCH = +(args[3] ?? 0);
const VERBOSE = process.env.V === '1';
if (process.env.TUNE) Object.assign(content.TUNING, JSON.parse(process.env.TUNE));

let rngState = 12345;
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

// ---------------- bot
const bot = { reactT: 0, dodgeDir: null, path: null, pathTarget: null, lastPick: null };
function press(k) { Engine.pressed.add(k); }
function setMove(dx, dy) {
  Engine.keys.clear();
  if (dx > 0.38) Engine.keys.add('d'); if (dx < -0.38) Engine.keys.add('a');
  if (dy > 0.38) Engine.keys.add('s'); if (dy < -0.38) Engine.keys.add('w');
}
function aimAt(scene, x, y) {
  Engine.mouse.x = (x - scene.cam.x) * 2; Engine.mouse.y = (y - 6 - scene.cam.y) * 2;
  Input.lastMouseMove = Engine.time; Input._lastMouse = { x: Engine.mouse.x, y: Engine.mouse.y };
}
// BFS path direction toward a point
function pathDir(w, p, tx, ty) {
  const R = w.room, T = 16;
  const gx = Math.floor(tx / T), gy = Math.floor(ty / T);
  const key = gx + ',' + gy;
  if (bot.pathTarget !== key || !bot.path) {
    bot.pathTarget = key;
    const d = new Int16Array(R.w * R.h).fill(-1);
    if (gx < 0 || gy < 0 || gx >= R.w || gy >= R.h) return null;
    const q = [gy * R.w + gx]; d[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % R.w, y = (c / R.w) | 0;
      for (const [nx, ny, side] of [[x + 1, y, 4], [x - 1, y, 8], [x, y + 1, 1], [x, y - 1, 2]]) { // side: the thin-wall bit on the neighbour facing us
        if (nx < 0 || ny < 0 || nx >= R.w || ny >= R.h) continue;
        const j = ny * R.w + nx; if (d[j] >= 0 || (R.walk[j] && !(nx === gx && ny === gy)) || (R.edge && R.edge[j] & side)) continue;
        d[j] = d[c] + 1; q.push(j);
      }
    }
    bot.path = d;
  }
  const d = bot.path, x = Math.floor(p.x / T), y = Math.floor(p.y / T);
  if (Math.hypot(tx - p.x, ty - p.y) < 20 && w.lineClear(p.x, p.y, tx, ty, 'walk')) { const l = Math.hypot(tx - p.x, ty - p.y) || 1; return { x: (tx - p.x) / l, y: (ty - p.y) / l }; }
  let best = null, bv = d[y * R.w + x] >= 0 ? d[y * R.w + x] : 1e9;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= R.w || ny >= R.h) continue;
    if (dx && dy && (R.walk[y * R.w + nx] || R.walk[ny * R.w + x])) continue;
    if (w.crossesEdge(p.x, p.y, nx * T + 8, p.y, 6, 'walk') || w.crossesEdge(nx * T + 8, p.y, nx * T + 8, ny * T + 8, 6, 'walk')) continue;
    const v = d[ny * R.w + nx]; if (v >= 0 && v < bv) { bv = v; best = [nx * T + 8 - p.x, ny * T + 8 - p.y]; }
  }
  if (!best) { const l = Math.hypot(tx - p.x, ty - p.y) || 1; return { x: (tx - p.x) / l, y: (ty - p.y) / l }; }
  const l = Math.hypot(best[0], best[1]) || 1;
  return { x: best[0] / l, y: best[1] / l };
}

function threat(w, p) {
  let best = null, urg = 0;
  for (const v of w.vfx) if (v.kind === 'tele' && !v.dead) {
    const k = v.t / Math.max(0.01, v.life);
    let inside = false, ax = p.x - v.x, ay = p.y - v.y, ox = ax, oy = ay;
    if (v.shape === 'circle') inside = Math.hypot(ax, ay / 0.75) < v.r + 10;
    else if (v.shape === 'arc') inside = Math.hypot(ax, ay) < v.r + 10;
    else if (v.shape === 'line') {
      const c = Math.cos(v.ang), s = Math.sin(v.ang), al = ax * c + ay * s, pe = -ax * s + ay * c;
      inside = al > -10 && al < v.len + 14 && Math.abs(pe) < (v.width || 4) / 2 + 14;
      if (inside) { const sg = Math.sign(pe) || 1; ox = -s * sg; oy = c * sg; }
    }
    if (inside && k > urg) { urg = k; const l = Math.hypot(ox, oy) || 1; best = { x: ox / l, y: oy / l, k, life: v.life * (1 - k) }; }
  }
  for (const s of w.strikes) if (s.team === 'enemy' && !s.done && s.t >= 0 && Math.hypot(p.x - s.x, (p.y - s.y) / 0.75) < s.r + 10) {
    const k = s.t / s.delay; if (k > urg) { urg = k; const ax = p.x - s.x, ay = p.y - s.y, l = Math.hypot(ax, ay) || 1; best = { x: ax / l, y: ay / l, k, life: s.delay - s.t }; }
  }
  for (const pr of w.projectiles) if (pr.team === 'enemy') {
    const dx = p.x - pr.x, dy = p.y - 8 - pr.y, d = Math.hypot(dx, dy), sp = Math.hypot(pr.vx, pr.vy) || 1;
    const along = (dx * pr.vx + dy * pr.vy) / sp, perp = Math.abs((-dx * pr.vy + dy * pr.vx) / sp);
    if (along > 0 && along < 70 && perp < pr.r + p.r + 4) { const k = 1 - along / 70; if (k > urg) { urg = k; best = { x: -pr.vy / sp, y: pr.vx / sp, k, life: along / sp }; } }
  }
  return best;
}

function fight(scene, w, p, foes, run) {
  const tz = threat(w, p);
  // reaction: a skilled player notices threats quickly; a sloppy one misses some
  if (tz) {
    if (!bot.seen) { bot.seen = true; bot.react = (1 - SKILL) * 0.45 + 0.08; bot.willDodge = rnd() < 0.35 + SKILL * 0.6; }
    bot.react -= STEP;
    if (bot.react <= 0 && bot.willDodge) {
      setMove(tz.x, tz.y);
      if (tz.life < 0.22 && (p.pc?.dashLeft || 0) > 0) { press(' '); }
      return;
    }
  } else bot.seen = false;
  let e = null, ed = 1e9;
  for (const f of foes) { const d = Math.hypot(f.x - p.x, f.y - p.y) * (f.boss ? 0.9 : 1); if (d < ed) { ed = d; e = f; } }
  if (!e) return;
  aimAt(scene, e.x, e.y);
  const atk = moves.profile(run.slots.attack), sp = run.slots.special && moves.profile(run.slots.special);
  const atkRange = atk.melee ? Math.max(18, (atk.range || 22) * 0.8) + e.r : Math.min(120, atk.range * 0.7);
  const los = w.lineClear(p.x, p.y, e.x, e.y, 'shot');
  // catch a partner when possible
  if (!run.partner && run.balls > 0 && !e.trainerMon && !e.boss && e.hp < e.maxHp * 0.33 && ed < 120 && los) { press('r'); }
  if (run.callGauge >= 1 && run.partner) press('f');
  if (sp && sp.damaging !== false && !(p.cds.slot_special > 0) && ed < Math.min(150, (sp.range || 100) * 0.9) && los) press('k');
  if (run.slots.cast && !(p.cds.slot_cast > 0) && ed < 70) press('q');
  const lowHp = p.hp < p.maxHp * 0.3;
  if (ed > atkRange || !los) { const dir = pathDir(w, p, e.x, e.y); if (dir) setMove(dir.x, dir.y); }
  else if (lowHp && atk.melee && ed < 24) { setMove(-(e.x - p.x) / ed, -(e.y - p.y) / ed); press('j'); }
  else { setMove(0, 0); press('j'); }
}

function navigate(scene, w, p) {
  // service rooms: talk to NPCs once
  if ((scene.spec.kind === 'center' || scene.spec.kind === 'shop' || scene.spec.kind === 'chaos') && !scene._talked) {
    const n = scene.npcs.find(n => n.onTalk); if (!n) { scene._talked = true; return; }
    if (scene.nearNpc === n) { press('e'); scene._talked = true; return; }
    const dir = pathDir(w, p, n.x, n.y + 18); if (dir) setMove(dir.x, dir.y); return;
  }
  if (scene.rewardPickup && !scene.rewardPickup.dead) { const k = scene.rewardPickup; const dir = pathDir(w, p, k.x, k.y); if (dir) setMove(dir.x, dir.y); return; }
  if (scene.doorsOpen && scene.doors.length) {
    if (!bot.door || !scene.doors.includes(bot.door)) bot.door = pickDoor(scene);
    const d = bot.door;
    if (!d.armed) { const dx = p.x - d.x, dy = p.y - d.y, l = Math.hypot(dx, dy) || 1; const dir = pathDir(w, p, scene.room.center.x, scene.room.center.y); if (dir) setMove(dir.x, dir.y); else setMove(dx / l, dy / l); return; }
    const dir = pathDir(w, p, d.x, d.y); if (dir) setMove(dir.x, dir.y);
    return;
  }
  setMove(0, 0);
}
function pickDoor(scene) {
  const run = RUN.G.run, p = scene.world.player;
  const score = d => {
    const k = d.reward.kind;
    if (k === 'center') return 10; if (k === 'boss' || k === 'next' || k === 'victory') return 10;
    if (k === 'shop' && run.money > 150) return 6;
    if (k === 'boon') return 5 + rnd();
    if (k === 'rare_candy') return 4.5; if (k === 'hp_up') return p.hp < p.maxHp * 0.5 ? 5.5 : 3.5;
    if (k === 'pp_up') return 4; if (k === 'tm') return 3.5; if (k === 'trainer') return 3; if (k === 'money') return 3;
    if (k === 'chaos') return p.hp > p.maxHp * 0.7 ? 3 : 0;
    return 2 + rnd();
  };
  return [...scene.doors].sort((a, b) => score(b) - score(a))[0];
}

// ---------------- overlay policies
function handleOverlay(o, stats) {
  const n = o.constructor.name;
  if (n === 'Choice') {
    if (o.t <= 0.3) { o.update(STEP); return; }
    const title = o.title || '';
    const run = RUN.G.run;
    let sel = 0;
    const cardMove = c => Object.values(D.moves).find(m => c.title && (c.title === m.name || c.title.endsWith(m.name)));
    if (/wants to learn|can learn/.test(title)) {
      const mvName = title.match(/learn (.+)!$/)?.[1];
      const mv = Object.values(D.moves).find(m => m.name === mvName);
      // order[0] is the suggested slot; learn if better than what's there
      const curName = o.cards[0].title.replace(/^.*replace /, '');
      const cur = Object.values(D.moves).find(m => m.name === curName);
      const val = m => !m ? -1 : m.power ? m.power * (D.species[run.species].types.includes(m.type) ? 1.5 : 1) * (moves.profile(m.key).kind === 'beam' ? 0.7 : 1) : 25;
      sel = mv && val(mv) > val(cur) * 1.05 ? 0 : o.cards.length - 1;
      stats.learn = (stats.learn || 0) + 1;
    } else if (/TM/.test(title)) {
      let bi = 0, bv = -1; o.cards.forEach((c, i) => { const m = cardMove(c); const v = m ? (m.power || 20) * (D.species[run.species].types.includes(m.type) ? 1.5 : 1) : 0; if (v > bv) { bv = v; bi = i; } }); sel = bi;
    } else if (/MART/.test(title)) {
      const p = Engine.scene.world.player;
      const want = ['POTION', 'SUPER POTION', 'RARE CANDY', 'PP UP', 'HP UP', 'SACRED ASH', 'HELD ITEM', 'POKé BALL ×3', 'TM'];
      const lowHp = p.hp < p.maxHp * 0.6;
      sel = -1;
      for (const wname of want) {
        if ((wname === 'POTION' || wname === 'SUPER POTION') && !lowHp) continue;
        if (wname === 'HELD ITEM' && run.held) continue;
        if (wname === 'POKé BALL ×3' && run.balls > 2) continue;
        const i = o.cards.findIndex(c => c.title === wname && !c.disabled);
        if (i >= 0) { sel = i; break; }
      }
      if (sel < 0) { Engine.pressed.add('x'); o.update(STEP); return; }
    } else if (title === 'DEOXYS') {
      sel = Engine.scene.world.player.hp > Engine.scene.world.player.maxHp * 0.6 ? 0 : o.cards.length - 1;
    } else if (/item to hold/.test(title)) sel = Math.floor(rnd() * o.cards.length);
    else sel = Math.floor(rnd() * o.cards.length); // boons, PP Up, Eevee
    if (o.cards[sel]?.disabled) sel = o.cards.findIndex(c => !c.disabled);
    if (sel < 0) { Engine.pressed.add('x'); o.update(STEP); return; }
    o.sel = sel; o.mx = Engine.mouse.x; o.my = Engine.mouse.y;
    if ((o._w = (o._w || 0) + 1) % 2 === 0) Engine.pressed.add('Enter');
    o.update(STEP);
    return;
  }
  if (n === 'Dialog') { if ((o._w = (o._w || 0) + 1) % 3 === 0) Engine.pressed.add('Enter'); o.update(STEP); return; }
  if (n === 'EvolutionOverlay') { if (o.t > 5.2) Engine.pressed.add('Enter'); o.update(STEP); return; }
  Engine.pressed.add('Enter'); o.update?.(STEP);
}

// ---------------- one run
async function playRun(starter, seed) {
  sim.timers.length = 0; Engine.overlays.length = 0;
  RUN.G.meta.research = {};
  if (RESEARCH > 0) for (const r of content.RESEARCH) RUN.G.meta.research[r.key] = Math.round(r.max * RESEARCH);
  if (process.env.R) Object.assign(RUN.G.meta.research, JSON.parse(process.env.R));
  RUN.G.meta.badges = ['BROCK', 'MISTY', 'MAROWAK', 'GIOVANNI'];
  RUN.G.meta.heat = +(process.env.HEAT || 0);
  const run = RUN.newRun(starter, seed);
  const stats = { starter, seed, rooms: 0, hurtBy: {}, roomLog: [], levels: [], deathAt: null, won: false, boons: [] };
  // log damage to the player by source
  const W = combat.World.prototype;
  if (!W._origApply) { W._origApply = W.applyDamage; }
  W.applyDamage = function (src, b, o) {
    const d = W._origApply.call(this, src, b, o);
    if (b === this.player && d > 0) { const k = src ? src.species + (src.boss ? '*' : '') : o.slot; stats.hurtBy[k] = (stats.hurtBy[k] || 0) + d; stats.roomDmg = (stats.roomDmg || 0) + d / b.maxHp; }
    return d;
  };
  if (!W._origHit) W._origHit = W.hit;
  W.hit = function (src, b, act, o) {
    const hp0 = b.hp;
    W._origHit.call(this, src, b, act, o);
    if (b === this.player && hp0 > b.hp) { const k = (act.p?.kind || '?') + (o?.proj ? '/proj' : '') + (act.zone ? '/zone' : '') + (act.p?.kind === 'strike' ? ':' + (src?.species || '?') + ':' + act.p.key : ''); KIND[k] = (KIND[k] || 0) + (hp0 - b.hp); }
  };
  // start at the first room (like walking out of the lab), or at a dev room (START='dev=boss&biome=1&level=22')
  if (process.env.START) { RUN.G.meta.lastStarter = starter; const q = new URLSearchParams(process.env.START + '&starter=' + starter + '&seed=' + seed); rewards.devStart(q); }
  else rewards.goNext({ spec: { kind: 'hub' } }, { kind: 'start' });
  let frames = 0, lastSig = '', roomStart = 0, roomHp = 0;
  const MAX = 60 * 60 * 60; // 60 minutes of game time
  while (frames < MAX) {
    frames++; Engine.time += STEP;
    tickTimers(STEP);
    const scene = Engine.scene;
    const top = Engine.overlays[Engine.overlays.length - 1];
    if (scene?.constructor?.name === 'VictoryScene') { stats.won = true; stats.roomLog.push({ sig: lastSig, boss: 'MEWTWO', won: true, t: +((frames - (bot.bossStart || roomStart)) / 60).toFixed(1), hpFrac: bot.bossHpFrac }); lastSig = ''; break; }
    if (top) { if (top.constructor.name === 'SummaryOverlay') break; handleOverlay(top, stats); }
    else if (scene && scene.update) {
      if (scene.state === 'play' && scene.world) {
        const w = scene.world, p = w.player;
        const sig = scene.spec.kind + ':' + run.biome + ':' + run.roomInBiome;
        if (sig !== lastSig) {
          if (lastSig) stats.roomLog.push({ sig: lastSig, t: +((frames - roomStart) / 60).toFixed(1), hpLost: stats.roomDmg || 0, boss: bot.bossKey, won: true, hpFrac: bot.bossHpFrac });
          stats.roomDmg = 0;
          bot.bossKey = scene.spec.kind === 'boss' ? scene.spec.boss : null; bot.bossHp0 = null;
          lastSig = sig; roomStart = frames; roomHp = 0; bot.door = null; bot.path = null;
          if (scene.spec.first) stats.levels.push([run.biome, run.level]);
        }
        if ((frames - roomStart) / 60 > 240) {
          stats.stuck = { sig, en: w.enemies().map(e => ({ s: e.species, x: e.x | 0, y: e.y | 0, hp: e.hp | 0, max: e.maxHp, unt: !!e.untargetable, cap: !!e.captured, spawn: +e.spawnT.toFixed(2), reach: w.room.reach[Math.floor(e.y / 16) * w.room.w + Math.floor(e.x / 16)], walk: w.room.walk[Math.floor(e.y / 16) * w.room.w + Math.floor(e.x / 16)], fly: e.flying, ghost: e.ghost, boss: e.boss })), p: [p.x | 0, p.y | 0], slots: { ...run.slots }, cleared: scene.cleared, state: scene.state, doors: scene.doors.map(d => [d.x, d.y, d.armed, d.used, d.reward.kind, bot.door === d]), pick: !!(scene.rewardPickup && !scene.rewardPickup.dead), waves: [scene.waveI, scene.waves.length], layout: scene.spec.layout };
          break;
        }
        const foes = w.enemies().filter(e => e.spawnT <= 0 && !e.untargetable);
        if (foes.length) fight(scene, w, p, foes, run); else navigate(scene, w, p);
        if (bot.bossKey && scene.bossLive && bot.bossHp0 == null) { bot.bossHp0 = p.hp; bot.bossStart = frames; }
        if (bot.bossKey && bot.bossHp0 != null && !scene.cleared) bot.bossHpFrac = (bot.bossHp0 - p.hp) / p.maxHp;
        if (p.dead) { stats.deathAt = sig; stats.deathLvl = run.level; if (bot.bossKey) stats.roomLog.push({ sig, boss: bot.bossKey, won: false, t: +((frames - (bot.bossStart || roomStart)) / 60).toFixed(1), bossLeft: Math.round(100 * scene.world.actors.filter(a => a.boss).reduce((s2, a) => s2 + Math.max(0, a.hp), 0) / Math.max(1, scene.world.actors.filter(a => a.boss).reduce((s2, a) => s2 + a.maxHp, 0))) }); break; }
      }
      scene.update(STEP);
    }
    if (process.env.DBG && frames % 600 === 0) { const sc = Engine.scene, w = sc?.world; console.log('dbg', frames / 60, sc?.state, sc?.spec?.kind, 'ov', Engine.overlays.map(o => o.constructor.name + ':' + (o.title || '')), 'cleared', sc?.cleared, 'doors', sc?.doors?.length, 'pick', !!sc?.rewardPickup && !sc.rewardPickup.dead, 'en', w?.enemies().map(e => e.species + e.spawnT.toFixed(1)).join(','), 'p', w && [w.player.x | 0, w.player.y | 0, w.player.hp | 0], [...Engine.keys]); }
    Engine.pressed.clear();
    if (frames % 30 === 0) await new Promise(r => setImmediate(r));
    else await null;
  }
  if (lastSig) stats.roomLog.push({ sig: lastSig, t: +((frames - roomStart) / 60).toFixed(1) });
  stats.time = Math.round(frames / 60);
  stats.level = run.level; stats.species = run.species;
  stats.boons = run.boons.map(b => b.key); stats.run = run;
  stats.reached = lastSig;
  return stats;
}

const KIND = {};
const starters = STARTER === 'all' ? content.STARTERS.map(s => s.species) : [STARTER];
const results = [];
for (let i = 0; i < N; i++) {
  const st = starters[i % starters.length];
  rngState = 1000 + i * 7919;
  const r = await playRun(st, 'SIM' + i);
  results.push(r);
  const hurt = Object.entries(r.hurtBy).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ':' + v).join(' ');
  console.log(`${String(i).padStart(2)} ${st.padEnd(10)} ${r.won ? 'WON ' : 'died'} at ${r.reached.padEnd(14)} L${r.level} ${r.species} ${r.time}s  levels ${r.levels.map(x => x[1]).join('/')}  hurt ${hurt}`);
  if (r.stuck) console.log('   STUCK', JSON.stringify(r.stuck));
  if (VERBOSE) console.log('   damage', JSON.stringify(RUN.dmgSummary(r.run))); // what the run record's damage summary would hold
  if (VERBOSE) console.log('   rooms', r.roomLog.map(x => `${x.sig}=${x.t}s`).join(' '), '\n   boons', r.boons.join(','));
}
// summary: furthest biome reached
const biomeOf = r => +r.reached.split(':')[1];
const dist = [0, 0, 0, 0, 0, 0];
for (const r of results) dist[r.won ? 5 : biomeOf(r)]++;
console.log('\nreached biome (0-4, 5=won):', dist.join(' '), ` win rate ${(100 * dist[5] / results.length).toFixed(0)}%`);
const B = {};
for (const r of results) for (const x of r.roomLog) if (x.boss) { const b = (B[x.boss] ??= { n: 0, won: 0, t: 0, hp: 0, left: [] }); b.n++; if (x.won) { b.won++; b.t += x.t; b.hp += x.hpFrac || 0; } else b.left.push(x.bossLeft); }
for (const [k, b] of Object.entries(B)) console.log(`  ${k.padEnd(9)} fights ${b.n}  won ${b.won} (${Math.round(100 * b.won / b.n)}%)  avg win time ${(b.t / Math.max(1, b.won)).toFixed(0)}s  avg HP lost on win ${Math.round(100 * b.hp / Math.max(1, b.won))}%  boss HP left on losses ${b.left.join(',')}`);
const byS = {};
for (const r of results) { const c = r.roomLog.filter(x => /^combat|^trainer/.test(x.sig)); const b = (byS[r.starter] ??= { t: 0, hp: 0, n: 0, won: 0, runs: 0 }); b.runs++; if (r.won) b.won++; for (const x of c) { b.t += x.t; b.hp += x.hpLost || 0; b.n++; } }
for (const [k, b] of Object.entries(byS)) console.log(`  ${k.padEnd(10)} won ${b.won}/${b.runs}  combat room ${(b.t / b.n).toFixed(1)}s  hp lost/room ${(100 * b.hp / b.n).toFixed(1)}%`);
const rt = results.flatMap(r => r.roomLog.filter(x => /^combat|^trainer/.test(x.sig)).map(x => x.t));
console.log('  combat room time avg', (rt.reduce((a, b) => a + b, 0) / Math.max(1, rt.length)).toFixed(1), 's');
const tot = Object.values(KIND).reduce((a, b) => a + b, 0);
console.log('  damage to player by attack kind:', Object.entries(KIND).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(100 * v / tot)}%`).join('  '));
const bossDeaths = results.filter(r => r.deathAt?.startsWith('boss')).length;
console.log('deaths at bosses:', bossDeaths, '/', results.filter(r => !r.won).length);
process.exit(0);
