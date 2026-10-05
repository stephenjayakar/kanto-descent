// World helpers used by boons: extra lightning strikes, chains, novas, vortexes, delayed calls.
import { World, setAnim } from './combat.js';
import { D } from './data.js';
import { profile } from './moves_rt.js';
import { Sound } from '../audio/sound.js';

const bp = {};
// A synthetic move profile for boon damage of a given type/power.
World.prototype.boonProfile = function (type, power, extra = {}) {
  const key = type + power + (extra.fx || '');
  if (!bp[key]) bp[key] = { key: 'BOON_' + type, name: 'BOON', type, power, special: true, damaging: true, kind: 'boon', crit: 0.0625, knock: 30, boonProc: true, fx: extra.fx || 'impact' };
  return { ...bp[key], ...extra };
};

// co-op runs player 2's blessings against Object.create(world) views: timers must live on the real world
const rootWorld = w => { while (!Object.prototype.hasOwnProperty.call(w, 'actors') && Object.getPrototypeOf(w) instanceof World) w = Object.getPrototypeOf(w); return w; };
World.prototype.later = function (t, fn) { const w = rootWorld(this); (w.timers ||= []).push({ t, fn }); };
World.prototype.tickTimers = function (dt) {
  if (!this.timers) return;
  for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0 && !tm.done) { tm.done = true; tm.fn(); } }
  this.timers = this.timers.filter(t => !t.done);
};

// lightning (or other) strike on a target after a short delay
World.prototype.boonStrike = function (target, o) {
  const p = this.boonProfile(o.type, o.power, { fx: o.fx, status: o.status ? { kind: o.status, chance: o.chance ?? 1 } : null });
  const pl = this.player;
  const r = (o.r || 14) * (o.fx === 'lightning' ? pl?.boltR || 1 : 1); // Zap Cannon widens lightning
  this.strikes.push({ owner: pl, act: { p, slot: 'boon', hits: new Set() }, x: target.x, y: target.y, r, t: 0, delay: o.delay ?? 0.12, p, slot: 'boon', team: 'player' });
};

// Doom Desire: a mark that follows the target and bursts after a delay (only if the target is still there)
World.prototype.boonDoom = function (target, o) {
  const pl = this.player;
  const p = this.boonProfile(o.type || 'FIRE', o.power, { fx: o.fx || 'fire', knock: 20 });
  const delay = o.delay ?? 1.1;
  this.vfx.push({ kind: 'doom', tgt: target, x: target.x, y: target.y, t: 0, life: delay }); // Lock-On corners, drawn by render.js
  this.later(delay, () => {
    if (!pl || pl.dead || target.dead || target.untargetable || target.captured) return;
    this.vfx.push({ kind: 'explode', x: target.x, y: target.y, r: 18, t: 0, life: 0.3, type: p.type, fx: p.fx });
    this.hit(pl, target, { p, slot: 'boon', hits: new Set() }, { ang: Math.atan2(target.y - pl.y, target.x - pl.x) });
  });
};

World.prototype.boonChain = function (from, o) {
  const pl = this.player;
  const p = this.boonProfile('ELECTRIC', o.power, { fx: 'spark' });
  let cur = from; const seen = new Set([from]);
  for (let j = 0; j < o.jumps; j++) {
    let nb = null, nd = 90;
    for (const e of this.enemies()) { if (seen.has(e) || e.spawnT > 0) continue; const d = Math.hypot(e.x - cur.x, e.y - cur.y); if (d < nd) { nd = d; nb = e; } }
    if (!nb) break;
    this.vfx.push({ kind: 'bolt', x0: cur.x, y0: cur.y - 8, x1: nb.x, y1: nb.y - 8, t: 0, life: 0.18 });
    seen.add(nb);
    const tgt = nb;
    const info = { p, slot: 'boon', hits: new Set() };
    this.hit(pl, tgt, info, { scale: 1 });
    cur = nb;
  }
  if (seen.size > 1) Sound.playSE('se_m_thunderbolt');
};

// ring burst around a point (src may be the player or a fake source for on-death effects)
World.prototype.boonNova = function (at, o) {
  const src = o.src || (at.team === 'player' && at.stats ? at : this.player);
  const p = this.boonProfile(o.type, o.power, { fx: o.fx, knock: o.knock ?? 40, status: o.status ? { kind: o.status, chance: 1 } : null });
  const x = at.x, y = at.y;
  this.later(o.delay ?? 0.05, () => {
    this.vfx.push({ kind: 'ring', x, y, r0: 4, r1: o.r || 30, t: 0, life: 0.3, fx: o.fx, type: o.type });
    for (const e of this.enemies()) {
      if (e.spawnT > 0 || e === at && o.skipSelf) continue;
      if (Math.hypot(e.x - x, e.y - y) < (o.r || 30) + e.r) this.hit(src, e, { p, slot: 'boon', hits: new Set() }, { ang: Math.atan2(e.y - y, e.x - x) });
    }
  });
};

World.prototype.boonVortex = function (a, o) {
  const c = Math.cos(a.facing), s = Math.sin(a.facing);
  const z = this.addZone({ owner: a, x: a.x + c * 50, y: a.y + s * 50, r: 46, dur: o.dur, team: 'player', tick: 0.5, p: this.boonProfile('WATER', o.power, { fx: 'water' }), dmgFrac: 1, sprite: 'vortex', vortex: true });
  z.pull = 90;
  Sound.playSE('se_m_whirlpool');
};

World.prototype.boonMetronome = function (a, mult) {
  const keys = Object.keys(D.moves).filter(k => D.moves[k].power >= 60 && !['SELF_DESTRUCT', 'EXPLOSION', 'STRUGGLE', 'FOCUS_PUNCH'].includes(k));
  const k = keys[Math.floor(this.rand() * keys.length)];
  const p = { ...profile(k), boonProc: true, windup: 0 };
  // fire it once the Cast itself has resolved (never replace the player's own move)
  let tries = 0;
  const go = () => {
    if (a.dead) return;
    if (a.action && a.action.stage !== 'recover' && tries++ < 20) { this.later(0.08, go); return; }
    this.text(a, p.name, '#f8a8d0');
    const act = this.useMove(a, p, { aim: a.facing, slot: 'boon', windup: 0 });
    act.power = mult;
  };
  this.later(0.1, go);
};

// vortex pull (called each step from the zone loop)
const baseZones = World.prototype.updateZones;
World.prototype.updateZones = function (dt) {
  for (const z of this.zones) if (z.pull) for (const e of this.enemies()) {
    if (e.boss || e.spawnT > 0) continue;
    const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy);
    if (d < z.r * 2 && d > 4) this.moveBy(e, dx / d * z.pull * dt, dy / d * z.pull * dt);
  }
  if (this.sunny) { this.sunny.t -= dt; if (this.sunny.t <= 0) this.sunny = null; }
  this.tickTimers(dt);
  this.hooks.onTick?.(this, dt);
  baseZones.call(this, dt);
};

export { setAnim };
