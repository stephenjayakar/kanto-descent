p = 'web/src/game/coop.js'
s = open(p, encoding='utf8').read()
start = s.index("// ---------------------------------------------------------------- the second player (host side)")
end = s.index("// Host overlay: the code while waiting")
new = r'''// ---------------------------------------------------------------- the second player (host side)
// P2 has its own run state layered over the host's: its own POKéMON, moves, blessings, held item, partner and
// Call gauge, while level/EXP, money, POKé BALLS, curses and the map stay shared (accessors forward them).
const SHARED = ['money', 'balls', 'ballType', 'level', 'exp', 'kills', 'time', 'stardustGained', 'revives', 'reviveFrac', 'rerolls',
  'biome', 'roomInBiome', 'depth', 'heat', 'chaos', 'over', 'won', 'visited', 'lastLayouts', 'history', 'caught', 'rng', 'seed', 'callBonus'];

function makeP2Run(base, starter) {
  const kit = STARTERS.find(s => s.species === starter) || STARTERS[0];
  const r2 = Object.create(base);
  for (const k of SHARED) Object.defineProperty(r2, k, { get: () => base[k], set: v => { base[k] = v; }, enumerable: true });
  Object.assign(r2, {
    isP2: true, starter: kit.species, species: kit.species, slots: { ...kit.slots }, known: Object.values(kit.slots),
    boons: [], held: null, partner: null, maxHpMul: base.maxHpMul, callGauge: 0, pendingLearn: [], pendingEvo: null, partnerEvo: null,
    focusUsed: false, hp: null, lastLevel: 1,
  });
  syncP2Level(r2); // catch up with the shared level: evolve and offer the moves it would have learned
  return r2;
}

// The shared level went up: queue P2's own level-up moves and evolution (offered at the next prompts).
function syncP2Level(r2) {
  for (let l = r2.lastLevel + 1; l <= r2.level; l++) {
    for (const mv of movesLearnedAt(r2.species, l)) if (!PLAYER_BANNED.has(mv) && !r2.known.includes(mv) && !r2.pendingLearn.includes(mv)) r2.pendingLearn.push(mv);
  }
  r2.lastLevel = r2.level;
  checkEvolution(r2);
}

function ensureP2(base) {
  if (!Coop.guest) return null;
  if (!Coop.p2 || Coop.p2.base !== base) Coop.p2 = { base, run: makeP2Run(base, Coop.guest.starter), downT: 0 };
  return Coop.p2;
}

const p2Key = r2 => `${r2.level}|${r2.species}|${r2.boons.map(b => b.key + b.rarity + b.level).join()}|${r2.held}|${r2.maxHpMul}|${Object.values(r2.slots).join()}`;

function buildP2(world, x, y) {
  const r2 = Coop.p2.run;
  const a = makePlayer(r2, x, y);
  a.hp = r2.hp == null ? a.maxHp : Math.max(1, Math.min(a.maxHp, r2.hp));
  Object.assign(a, { brain: playerBrain, input: Coop.remote, run: r2, p2: true, label: Coop.guest.name, facing: -Math.PI / 2 });
  a._key = p2Key(r2);
  return a;
}

// Each player's blessings only react to their own hits, kills, dashes and casts. P2's are built against a view
// of the world whose `player` is P2, so boon code that says w.player means P2.
export function coopWrapHooks(w) {
  if (!w?.p2 || !Coop.p2) return;
  const host = w.hooks?._host || w.hooks;
  const pw = Object.create(w); pw.player = w.p2;
  const p2h = buildHooks(Coop.p2.run, pw);
  const mine = a => !!a && (a === w.p2 || a.owner === w.p2);
  const by = (pick, name) => (W, x, ...rest) => (pick(x, ...rest) ? p2h[name]?.(pw, x, ...rest) : host[name]?.(W, x, ...rest));
  w.hooks = {
    _host: host,
    beforeHit: by(info => mine(info.src), 'beforeHit'),
    onHit: by(info => mine(info.src), 'onHit'),
    beforeHurt: by(ctx => ctx.target === w.p2, 'beforeHurt'),
    beforeDeath: (W, ctx) => host.beforeDeath?.(W, ctx),
    onKill: by((e, src) => mine(src), 'onKill'),
    onDash: by(a => a === w.p2, 'onDash'),
    onCast: by(a => a === w.p2, 'onCast'),
    onCastHit: (W, e, a) => (a === w.p2 ? p2h.onCastHit?.(pw, e) : host.onCastHit?.(W, e)),
    onFreeze: (W, e) => host.onFreeze?.(W, e),
    onSlam: (W, e) => host.onSlam?.(W, e),
    onTick: (W, dt) => { host.onTick?.(W, dt); if (w.p2 && !w.p2.dead) p2h.onTick?.(pw, dt); },
    onRoomStart: W => { host.onRoomStart?.(W); p2h.onRoomStart?.(pw); },
    onRoomClear: W => { host.onRoomClear?.(W); p2h.onRoomClear?.(pw); },
    onSpawn: (W, e) => host.onSpawn?.(W, e),
  };
}

// Put P2 into the current room (on room start, or when the guest connects mid-room).
export function coopSpawnP2(scene) {
  const w = scene.world;
  if (!Coop.active || !w?.player || (w.p2 && !w.p2.removed)) return;
  if (!ensureP2(scene.run)) return;
  const p = w.player;
  const at = w.collides(p.x + 16, p.y, 6, 'walk') ? { x: p.x, y: p.y } : { x: p.x + 16, y: p.y };
  const a = buildP2(w, at.x, at.y);
  a.iframes = 1.5;
  w.p2 = a; w.add(a);
  coopWrapHooks(w);
  preloadPmd([a.dex]);
  w.vfx.push({ kind: 'sendout', x: a.x, y: a.y, t: 0, life: 0.5 });
}

function removeP2(w) {
  if (!w?.p2) return;
  w.p2.removed = true; w.actors = w.actors.filter(x => x !== w.p2); w.p2 = null;
  if (w.hooks?._host) w.hooks = w.hooks._host;
}

// Rebuild P2's actor in place after its run changed (level, blessings, held item, moves, evolution).
export function coopRefreshP2(scene) {
  const w = scene.world, a = w?.p2;
  if (!a || !Coop.p2) return;
  const frac = a.dead ? 0 : a.hp / a.maxHp;
  const n = buildP2(w, a.x, a.y);
  const keep = ['x', 'y', 'facing', 'pc', 'cds', 'cdMax', 'status', 'stages', 'stageTimers', 'iframes', 'id', 'action', 'kx', 'ky', 'dashing', 'noCollide', 'anim', 'animT', 'speedMul', 'z', 'stun', 'dead', 'deathT'];
  const saved = {}; for (const k of keep) saved[k] = a[k];
  for (const k of Object.keys(a)) delete a[k];
  Object.assign(a, n, saved);
  if (!a.dead) a.hp = Math.max(1, Math.round(a.maxHp * frac));
  coopWrapHooks(w);
  preloadPmd([a.dex]);
}

// Run a reward/level-up flow for P2: G.run is P2's run and the menus read the guest's controller.
export async function asP2(scene, fn) {
  if (!Coop.active || !scene.world?.p2 || !Coop.p2 || G.run?.isP2) return;
  const host = G.run, r2 = Coop.p2.run;
  syncP2Level(r2);
  G.run = r2; Coop.menuP2 = true;
  try { await fn(); } finally { G.run = host; Coop.menuP2 = false; }
  coopRefreshP2(scene);
}

// Heals from Nurse Joy, potions, HP UP and between areas reach P2 too (and wake it up if it had fainted).
export function coopHeal(scene, frac) {
  const w = scene.world, a = w?.p2;
  if (!a || !Coop.p2) return;
  if (a.dead) reviveP2(w, a, frac);
  else { w.heal(a, Math.round(a.maxHp * frac)); a.status = {}; }
  Coop.p2.run.hp = a.hp;
}
function reviveP2(w, a, frac) {
  Coop.p2.downT = 0;
  const p = w.player;
  Object.assign(a, { dead: false, deathT: 0, hp: Math.max(1, Math.round(a.maxHp * frac)), x: p.x, y: p.y, iframes: 2, action: null, status: {}, stun: 0 });
  w.vfx.push({ kind: 'heal', x: a.x, y: a.y, t: 0, life: 0.8 });
  Sound.playSE('se_m_morning_sun');
}

// Every host frame (before the simulation steps): read the guest's input, keep P2 in sync with its run.
export function coopFrame(scene, dt) {
  const w = scene.world;
  if (!w) return;
  if (Coop.role === 'host' && Coop.status === 'reconnecting' && w.p2) { Coop.remote.reset(); return; } // hold P2 still for a moment
  if (!Coop.active) { if (w.p2) removeP2(w); return; }
  Coop.remote.poll(scene.cam);
  if (!w.p2) { if (scene.state === 'play' || scene.state === 'intro') coopSpawnP2(scene); return; }
  const a = w.p2, st = Coop.p2;
  if (a.dead) {
    st.downT += dt;
    if (st.downT > 8 || scene.cleared) reviveP2(w, a, 0.5); // back up next to P1 with half HP
    return;
  }
  st.run.hp = a.hp;
  if (p2Key(st.run) !== a._key) coopRefreshP2(scene);
}

'''
s = s[:start] + new + s[end:]
reps = [
    ("import { G, makePlayer, nextEvolution, PLAYER_BANNED } from './run.js';",
     "import { G, makePlayer, buildHooks, checkEvolution, PLAYER_BANNED } from './run.js';\nimport { movesLearnedAt } from './data.js';\nimport { preloadPmd } from './pmd.js';"),
    ("import { profile } from './moves_rt.js';\n", ""),
    ("const ACTIONS = ['attack', 'special', 'dash', 'cast', 'call', 'ball', 'interact', 'pause', 'confirm', 'back'];",
     "const ACTIONS = ['attack', 'special', 'dash', 'cast', 'call', 'ball', 'interact', 'pause', 'confirm', 'back', 'up', 'down', 'left', 'right'];"),
    ("  hostName: null,    // guest side\n", "  hostName: null,    // guest side\n  menuP2: false,     // a menu is open for P2: it reads the guest's controller\n"),
]
for a, b in reps:
    assert a in s, a[:60]
    s = s.replace(a, b, 1)
open(p, 'w', encoding='utf8').write(s)
print('ok')
