// Realtime combat simulation: actors, actions (moves), projectiles, zones, damage and status.
// Runs at a fixed 60 Hz step. Rendering lives in render.js, enemy brains in ai.js / bosses.js.
import { D, monStats, typeEffect } from './data.js';
import { profile } from './moves_rt.js';
import { Sound } from '../audio/sound.js';

export const TILE = 16;
export const STEP = 1 / 60;
const TAU = Math.PI * 2;

export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// PMD sheet rows: Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft
export const dirFromAngle = a => (10 - (((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8)) % 8;

const STAGE_MULT = s => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
const ACC_MULT = s => [33, 36, 43, 50, 60, 75, 100, 133, 166, 200, 233, 266, 300][Math.max(-6, Math.min(6, s)) + 6] / 100;

let nextId = 1;

// ---- actors -------------------------------------------------------------------------------------
export function makeActor(speciesKey, level, team, opts = {}) {
  const sp = D.species[speciesKey];
  const st = monStats(speciesKey, level, opts.iv ?? 15);
  const hpMul = opts.hpMul ?? (team === 'enemy' ? 1.6 : 3);
  const maxHp = Math.max(1, Math.round(st.hp * hpMul));
  const height = sp.height || 8;
  return {
    id: nextId++, team, species: speciesKey, dex: sp.dex, level, stats: st, types: sp.types.slice(),
    name: opts.name || sp.name, hp: opts.hp ?? maxHp, maxHp,
    x: opts.x || 0, y: opts.y || 0, z: 0, vx: 0, vy: 0, kx: 0, ky: 0,
    r: opts.r ?? Math.max(6, Math.min(15, 5 + height * 0.55)),
    facing: Math.PI / 2, dir: 0,
    speed: opts.speed ?? baseSpeed(st.spe, team),
    moves: opts.moves || [], cds: {}, action: null,
    anim: 'Idle', animT: 0, animLock: 0,
    iframes: 0, flash: 0, stun: 0, hitstop: 0,
    status: {}, stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0, crit: 0 },
    flying: !!opts.flying || sp.types.includes('FLYING') || ['GASTLY', 'HAUNTER', 'GENGAR', 'ZUBAT', 'GOLBAT', 'KOFFING', 'WEEZING', 'MAGNEMITE', 'MAGNETON', 'MEW', 'MEWTWO'].includes(speciesKey),
    ghost: sp.types.includes('GHOST'),
    boss: !!opts.boss, elite: !!opts.elite, scale: opts.scale || 1,
    dead: false, deathT: 0, spawnT: opts.spawnT ?? 0, alpha: 1,
    brain: null, dmgMul: 1, takenMul: 1, armor: opts.armor || 0, poise: opts.poise || 0,
    shiny: !!opts.shiny, expYield: sp.expYield, catchRate: sp.catchRate,
    ...opts.extra,
  };
}

function baseSpeed(spe, team) {
  if (team === 'player') return 84 + Math.min(36, spe * 0.22);
  return 34 + Math.min(46, spe * 0.32);
}

export function statOf(a, key) {
  let v = a.stats[key] * STAGE_MULT(a.stages[key] || 0);
  if (key === 'atk' && a.status.burn) v *= 0.5;
  return v;
}
export function moveSpeed(a) {
  let s = a.speed * STAGE_MULT((a.stages.spe || 0) * 0.5);
  if (a.status.para) s *= 0.55;
  if (a.status.slow) s *= 0.6;
  if (a.status.chill) s *= 1 - 0.1 * a.status.chill.stacks;
  if (a.speedMul) s *= a.speedMul;
  return s;
}

// ---- the world ----------------------------------------------------------------------------------
export class World {
  constructor(room, opts = {}) {
    this.room = room; // { w, h, walk: Uint8Array, shot: Uint8Array, grass: Uint8Array, ox, oy }
    this.actors = []; this.projectiles = []; this.zones = []; this.strikes = []; this.vfx = []; this.texts = [];
    this.time = 0; this.hooks = opts.hooks || {}; this.rng = opts.rng || Math.random;
    this.player = null; this.hitstop = 0; this.shake = 0; this.slowmo = 0;
    this.events = []; // things the scene reacts to: {type:'kill'|'hurt'|'clear'|...}
    this.flow = null; this.flowT = 0;
    this.money = 0; this.pickups = [];
  }

  add(a) { this.actors.push(a); return a; }
  enemies() { return this.actors.filter(a => a.team === 'enemy' && !a.dead); }
  foesOf(a) {
    return this.actors.filter(b => !b.dead && b.spawnT <= 0 && !b.untargetable && !b.captured && b !== a &&
      (a.confused && a.team === 'enemy' ? true : b.team !== a.team && !(a.team !== 'enemy' && b.team !== 'enemy')));
  }
  emit(e) { this.events.push(e); }
  rand() { return typeof this.rng === 'function' ? this.rng() : this.rng.next(); }

  // ---- grid
  tileAt(px, py) { return [Math.floor(px / TILE), Math.floor(py / TILE)]; }
  blocked(px, py, mode = 'walk') {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    const R = this.room;
    if (tx < 0 || ty < 0 || tx >= R.w || ty >= R.h) return true;
    const i = ty * R.w + tx;
    if (mode === 'ghost') return false;
    if (mode === 'fly') return R.walk[i] === 1 && R.shot[i] === 1; // flyers cross water/ledges, not walls
    if (mode === 'shot') return R.shot[i] === 1;
    return R.walk[i] !== 0;
  }
  moveMode(a) { return a.ghost ? 'ghost' : a.flying ? 'fly' : 'walk'; }
  // circle vs grid; axis separated with corner sampling
  collides(x, y, r, mode) {
    const s = r * 0.75;
    return this.blocked(x - s, y - s * 0.5, mode) || this.blocked(x + s, y - s * 0.5, mode) ||
      this.blocked(x - s, y + s * 0.5, mode) || this.blocked(x + s, y + s * 0.5, mode) ||
      this.blocked(x, y, mode);
  }
  moveBy(a, dx, dy) {
    const mode = this.moveMode(a);
    const R = this.room;
    if (mode === 'ghost') { // stay inside the room bounds
      a.x = Math.max(8, Math.min(R.w * TILE - 8, a.x + dx)); a.y = Math.max(8, Math.min(R.h * TILE - 8, a.y + dy)); return { hitX: false, hitY: false };
    }
    let hitX = false, hitY = false;
    const r = Math.min(a.r, a.boss ? 8 : 6); // terrain footprint is smaller than the hitbox, so 1-tile gaps fit
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4) || 1;
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps, sy = dy / steps;
      if (sx) { if (!this.collides(a.x + sx, a.y, r, mode)) a.x += sx; else { hitX = true; if (!sy) this.slide(a, r, mode, sx, 0); } }
      if (sy) { if (!this.collides(a.x, a.y + sy, r, mode)) a.y += sy; else { hitY = true; if (!sx) this.slide(a, r, mode, 0, sy); } }
    }
    return { hitX, hitY };
  }
  // corner correction: when pushing straight into a corner, slip sideways toward the nearest opening
  slide(a, r, mode, sx, sy) {
    for (let k = 1; k <= 7; k++) for (const sg of [1, -1]) {
      const ox = sy ? sg * k : 0, oy = sx ? sg * k : 0;
      if (!this.collides(a.x + ox, a.y + oy, r, mode) && !this.collides(a.x + ox + sx, a.y + oy + sy, r, mode)) {
        const nx = a.x + Math.sign(ox) * Math.min(1.5, Math.abs(ox)), ny = a.y + Math.sign(oy) * Math.min(1.5, Math.abs(oy));
        if (!this.collides(nx, ny, r, mode)) { a.x = nx; a.y = ny; }
        return;
      }
    }
  }
  lineClear(x0, y0, x1, y1, mode = 'shot') {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) { const t = i / n; if (this.blocked(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, mode)) return false; }
    return true;
  }
  // first wall along a ray (for beams)
  rayLength(x, y, ang, len, owner) {
    if (owner?.boss) return len; // boss beams pass over their own arena's terrain
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let d = 4; d < len; d += 4) if (this.blocked(x + c * d, y + s * d, 'shot')) return d;
    return len;
  }
  // is this a cell the player can actually reach (and stand on)?
  reachable(x, y) {
    const R = this.room, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return tx >= 0 && ty >= 0 && tx < R.w && ty < R.h && R.walk[ty * R.w + tx] === 0 && (!R.reach || R.reach[ty * R.w + tx]);
  }
  nearestReachable(x, y) {
    const R = this.room;
    let best = null, bd = 1e9;
    for (let ty = 0; ty < R.h; ty++) for (let tx = 0; tx < R.w; tx++) {
      if (R.walk[ty * R.w + tx] !== 0 || (R.reach && !R.reach[ty * R.w + tx])) continue;
      const px = tx * TILE + 8, py = ty * TILE + 8;
      if (this.collides(px, py, 6, 'walk')) continue;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    return best || { x, y };
  }
  randomOpenPoint(minDistFrom, minD = 0, tries = 200) {
    const R = this.room;
    for (let i = 0; i < tries; i++) {
      const tx = Math.floor(this.rand() * R.w), ty = Math.floor(this.rand() * R.h);
      if (R.walk[ty * R.w + tx] !== 0 || !R.reach || !R.reach[ty * R.w + tx]) continue;
      const x = tx * TILE + 8, y = ty * TILE + 8;
      if (this.collides(x, y, 7, 'walk')) continue;
      if (minDistFrom && Math.hypot(x - minDistFrom.x, y - minDistFrom.y) < minD) continue;
      return { x, y };
    }
    return { x: R.w * 8, y: R.h * 8 };
  }

  // BFS distance field toward the player (for enemy navigation around walls)
  updateFlow() {
    const p = this.player; if (!p) return;
    const R = this.room, N = R.w * R.h;
    if (!this.flow) this.flow = new Int16Array(N);
    const f = this.flow; f.fill(-1);
    const [px, py] = this.tileAt(p.x, p.y);
    if (px < 0 || py < 0 || px >= R.w || py >= R.h) return;
    const q = new Int32Array(N); let h = 0, t = 0;
    q[t++] = py * R.w + px; f[py * R.w + px] = 0;
    while (h < t) {
      const i = q[h++], x = i % R.w, y = (i / R.w) | 0, d = f[i] + 1;
      if (x > 0 && f[i - 1] < 0 && R.walk[i - 1] === 0) { f[i - 1] = d; q[t++] = i - 1; }
      if (x < R.w - 1 && f[i + 1] < 0 && R.walk[i + 1] === 0) { f[i + 1] = d; q[t++] = i + 1; }
      if (y > 0 && f[i - R.w] < 0 && R.walk[i - R.w] === 0) { f[i - R.w] = d; q[t++] = i - R.w; }
      if (y < R.h - 1 && f[i + R.w] < 0 && R.walk[i + R.w] === 0) { f[i + R.w] = d; q[t++] = i + R.w; }
    }
  }
  // direction to step along the flow field from (x,y)
  flowDir(x, y) {
    const R = this.room, f = this.flow; if (!f) return null;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    let best = null, bd = f[ty * R.w + tx] >= 0 ? f[ty * R.w + tx] : 1e9;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= R.w || ny >= R.h) continue;
      const v = f[ny * R.w + nx];
      if (v < 0) continue;
      if (dx && dy && (R.walk[ty * R.w + nx] !== 0 || R.walk[ny * R.w + tx] !== 0)) continue;
      if (v < bd) { bd = v; best = [nx * TILE + 8 - x, ny * TILE + 8 - y]; }
    }
    if (!best) return null;
    const l = Math.hypot(best[0], best[1]) || 1;
    return { x: best[0] / l, y: best[1] / l };
  }

  // ---- main step
  step(dt = STEP) {
    if (this.hitstop > 0) { this.hitstop -= dt; this.updateVfx(dt * 0.25); return; }
    this.time += dt;
    this.flowT -= dt;
    if (this.flowT <= 0) { this.updateFlow(); this.flowT = 0.25; }
    for (const a of this.actors) this.updateActor(a, dt);
    this.separate();
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateStrikes(dt);
    this.updatePickups(dt);
    this.updateVfx(dt);
    // remove fully dead
    this.actors = this.actors.filter(a => !(a.dead && a.deathT > 1.2 && a !== this.player));
  }

  updateActor(a, dt) {
    a.animT += dt;
    if (a.spawnT > 0) { a.spawnT -= dt; return; }
    if (a.dead) { a.deathT += dt; return; }
    if (a.captured) { a.vx = a.vy = 0; return; }
    // anti-softlock: a grounded enemy outside the reachable area gets put back after a moment
    if (a.team === 'enemy' && !a.ghost && !a.flying && !a.untargetable && !a.dashing) {
      if (!this.reachable(a.x, a.y)) { a.offT = (a.offT || 0) + dt; if (a.offT > 1.5) { const q = this.nearestReachable(a.x, a.y); a.x = q.x; a.y = q.y; a.offT = 0; } }
      else a.offT = 0;
    } else if (a.team === 'enemy' && (a.ghost || a.flying) && (a.x < 0 || a.y < 0 || a.x > this.room.w * TILE || a.y > this.room.h * TILE)) { const q = this.nearestReachable(a.x, a.y); a.x = q.x; a.y = q.y; }
    for (const k in a.cds) if (a.cds[k] > 0) a.cds[k] -= dt;
    if (a.iframes > 0) a.iframes -= dt;
    if (a.flash > 0) a.flash -= dt;
    if (a.animLock > 0) a.animLock -= dt;
    this.updateStatus(a, dt);
    if (a.dead) return;
    // knockback
    if (Math.abs(a.kx) + Math.abs(a.ky) > 1) {
      const r = this.moveBy(a, a.kx * dt, a.ky * dt);
      if ((r.hitX || r.hitY) && a.slamDmg && Math.hypot(a.kx, a.ky) > 150) { // wall slam
        this.applyDamage(null, a, { dmg: a.slamDmg, slot: 'env', type: 'NORMAL', noKnock: true, label: 'SLAM' });
        this.text(a, 'SLAM!', '#a8c8f8', true); this.shake = Math.max(this.shake, 3); Sound.playSE('se_wall_hit');
        a.slamDmg = 0; this.hooks.onSlam?.(this, a);
      }
      if (r.hitX) a.kx *= -0.3; if (r.hitY) a.ky *= -0.3;
      const fr = Math.exp(-10 * dt); a.kx *= fr; a.ky *= fr;
    } else { a.kx = a.ky = 0; a.slamDmg = 0; }
    const disabled = a.stun > 0 || a.status.sleep || a.status.freeze;
    if (a.stun > 0) a.stun -= dt;
    if (disabled) { if (a.action && !a.action.uninterruptible) this.cancelAction(a); a.vx = a.vy = 0; return; }
    if (a.action) this.updateAction(a, dt);
    else if (a.brain) a.brain(this, a, dt);
    if (a.status.trap && !a.dashing) { a.vx = a.vy = 0; }
    if (!a.action || a.action.canMove) {
      // brains / player controller set a.vx, a.vy as desired velocity
      if (a.vx || a.vy) {
        this.moveBy(a, a.vx * dt, a.vy * dt);
        if (!a.action && !a.lockFacing) a.facing = Math.atan2(a.vy, a.vx);
        if (a.animLock <= 0 && !a.action) setAnim(a, 'Walk');
      } else if (a.animLock <= 0 && !a.action) setAnim(a, 'Idle');
    }
    a.dir = dirFromAngle(a.facing);
  }

  separate() {
    const list = this.actors.filter(a => !a.dead && a.spawnT <= 0 && !a.noCollide);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.dashing || b.dashing) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = (a.r + b.r) * 0.8;
      if (d < m && d > 0.01) {
        const push = (m - d) / 2, nx = dx / d, ny = dy / d;
        const wa = a.boss ? 0.1 : b.boss ? 1.9 : 1, wb = 2 - wa;
        this.moveBy(a, -nx * push * wa, -ny * push * wa);
        this.moveBy(b, nx * push * wb, ny * push * wb);
      }
    }
  }

  // ---- statuses
  addStatus(a, kind, src, opts = {}) {
    if (a.dead || a.boss && ['sleep', 'freeze', 'confuse', 'trap'].includes(kind) && !opts.force) {
      if (a.boss && kind === 'freeze') { a.status.chill = { stacks: 3, t: 3 }; }
      if (a.boss && kind === 'sleep' && (a.stunImmune || 0) < this.time) { a.stun = Math.max(a.stun, 0.4); a.stunImmune = this.time + 4; }
      if (!a.boss) return;
      if (kind !== 'burn' && kind !== 'poison' && kind !== 'toxic' && kind !== 'para' && kind !== 'slow' && kind !== 'chill') return;
    }
    const isPlayer = a.team === 'player';
    const T = { burn: 4, poison: 6, toxic: 8, para: isPlayer ? 3 : 5, sleep: isPlayer ? 1.2 : 3, confuse: isPlayer ? 1.5 : 4, slow: 3, trap: isPlayer ? 0.8 : 2, freeze: isPlayer ? 0.8 : 2.2, flinch: 0 };
    // type immunities, Gen 3 style
    if (kind === 'burn' && a.types.includes('FIRE')) return;
    if ((kind === 'poison' || kind === 'toxic') && (a.types.includes('POISON') || a.types.includes('STEEL'))) return;
    if (kind === 'para' && a.types.includes('ELECTRIC')) return;
    if ((kind === 'freeze' || kind === 'chill') && a.types.includes('ICE')) return;
    if (kind === 'flinch') { if (a.boss) return; this.cancelAction(a); a.stun = Math.max(a.stun, 0.3); return; }
    if (kind === 'stun' && a.team === 'player') { if (a.iframes > 0 || a.action?.uninterruptible) return; a.stun = Math.max(a.stun, 0.4); this.text(a, 'DISABLED', '#ffb0b0', true); return; }
    if (kind === 'stun') { if (a.boss && (a.stunImmune || 0) > this.time) return; a.stun = Math.max(a.stun, a.boss ? 0.4 : 1.2); this.cancelAction(a); if (a.boss) a.stunImmune = this.time + 4; return; }
    if (kind === 'chill') {
      const c = a.status.chill || (a.status.chill = { stacks: 0, t: 0 });
      c.stacks = Math.min(5, c.stacks + (opts.stacks || 1)); c.t = 4;
      if (c.stacks >= 5 && !a.status.freeze) { delete a.status.chill; this.addStatus(a, 'freeze', src); if (a.status.freeze) { Sound.playSE('se_ice_crack'); this.hooks.onFreeze?.(this, a); } }
      return;
    }
    const prev = a.status[kind];
    const s = { t: opts.dur ?? T[kind] ?? 3, tick: 0, src, stacks: (prev?.stacks || 0) + 1, power: opts.power || 1 };
    if (kind === 'burn') s.stacks = Math.min(s.stacks, 5);
    a.status[kind] = s;
    if (kind === 'sleep' || kind === 'freeze') this.cancelAction(a);
    this.text(a, { burn: 'BRN', poison: 'PSN', toxic: 'PSN', para: 'PAR', sleep: 'SLP', confuse: '???', freeze: 'FRZ', trap: 'TRAPPED', slow: 'SLOW' }[kind] || '', '#ffd0a0', true);
  }
  updateStatus(a, dt) {
    const S = a.status;
    for (const k of Object.keys(S)) {
      const s = S[k];
      s.t -= dt; s.tick = (s.tick || 0) + dt;
      const dot = (frac, color) => {
        if (s.tick >= 0.5) {
          s.tick -= 0.5;
          const dmg = Math.max(1, Math.round(a.maxHp * frac * (a.boss ? 0.12 : 1) * (s.power || 1)));
          this.applyDamage(s.src && !s.src.dead ? s.src : null, a, { dmg, slot: 'dot', noKnock: true, noFlash: true, color, silent: true });
        }
      };
      if (k === 'burn') dot(0.012 * (1 + (s.stacks - 1) * 0.5) * (a.team === 'player' ? 0.5 : (s.src?.burnMul || 1)), 'orange');
      if (k === 'poison') dot(0.016 * (a.team === 'player' ? 0.4 : 1), 'purple');
      if (k === 'toxic') { s.power = 1 + (8 - s.t) * 0.25; dot(0.012 * (a.team === 'player' ? 0.4 : 1), 'purple'); }
      if (k === 'trap') dot(0.01, 'white');
      if (k === 'para' && s.tick > 1.2 && !a.boss) { s.tick = 0; if (this.rand() < 0.25) { a.stun = Math.max(a.stun, 0.5); this.text(a, 'PAR', '#f8d030', true); this.cancelAction(a); } }
      if (k === 'confuse' && a.team === 'enemy') a.confused = true;
      if (s.t <= 0) { delete S[k]; if (k === 'confuse') a.confused = false; }
    }
    if (a.status.chill) { a.status.chill.t -= dt; if (a.status.chill.t <= 0) delete a.status.chill; }
  }

  // ---- actions
  // Starts a move. opts: {aim (radians), target (actor), slot, windup override, enemy}
  useMove(a, moveKey, opts = {}) {
    const p = typeof moveKey === 'string' ? profile(moveKey) : moveKey;
    moveKey = p.key;
    const isEnemy = a.team === 'enemy';
    const windup = opts.windup ?? (isEnemy ? p.windup * (a.boss ? 0.85 : 1) * (a.windupMul || 1) : Math.min(p.windup, p.kind === 'beam' ? 0.25 : p.kind === 'charge' && p.windup >= 0.4 ? 0.2 : 0.04));
    const aim = opts.aim ?? a.facing;
    a.facing = aim;
    const act = {
      move: moveKey, p, t: 0, windup, aim, target: opts.target || null, slot: opts.slot || 'attack', hits: new Set(),
      stage: 'windup', canMove: false, comboStep: opts.comboStep || 0, power: opts.power, enemy: isEnemy, data: {},
      targetPt: opts.targetPt || (opts.target ? { x: opts.target.x, y: opts.target.y } : null),
    };
    a.action = act;
    if (isEnemy && windup > 0.05) this.telegraph(a, act);
    setAnim(a, chargeAnimFor(p), true);
    a.animT = 0;
    return act;
  }
  cancelAction(a) {
    if (!a.action) return;
    if (a.action.tele) a.action.tele.dead = true;
    a.dashing = false; a.noCollide = false; a.burrowed = false; a.speedMul = 1; a.z = 0; a.channeling = null;
    if (!a.captured) a.untargetable = false;
    a.action = null;
  }

  updateAction(a, dt) {
    const act = a.action, p = act.p;
    act.t += dt;
    if (act.stage === 'windup') {
      // enemies track the target during the first part of the windup
      if (act.enemy && act.target && act.t < act.windup * 0.55 && !act.noTrack) {
        const ang = Math.atan2(act.target.y - a.y, act.target.x - a.x);
        act.aim = ang; a.facing = ang;
        if (p.kind === 'strike' || p.kind === 'leap' || (p.kind === 'cloud' && p.at === 'target')) act.targetPt = { x: act.target.x, y: act.target.y };
        if (act.tele) Object.assign(act.tele, this.teleShape(a, act));
      }
      if (act.t >= act.windup) {
        act.stage = 'active'; act.t = 0;
        if (act.tele) act.tele.dead = true;
        setAnim(a, attackAnimFor(p), true);
        this.beginActive(a, act);
      }
      return;
    }
    if (act.stage === 'active') {
      const done = this.tickActive(a, act, dt);
      if (done) { act.stage = 'recover'; act.t = 0; a.dashing = false; a.noCollide = false; a.untargetable = false; }
      return;
    }
    if (act.stage === 'recover') {
      const rec = act.recover ?? (act.enemy ? (p.recharge ? p.recharge + 0.4 : 0.35) * (a.recoverMul || 1) : (p.recharge || 0.06));
      act.canMove = !act.enemy && act.t > 0.02;
      if (act.t >= rec) { a.action = null; act.onDone?.(); }
    }
  }

  beginActive(a, act) {
    const p = act.p;
    if (p.sfx && !act.silent) Sound.playSE(p.sfx);
    const c = Math.cos(act.aim), s = Math.sin(act.aim);
    switch (p.kind) {
      case 'swipe': case 'multi': act.dur = p.kind === 'multi' ? 0.09 * (p.hits || 3) + 0.05 : 0.1; act.nextHit = 0; act.hitN = 0; break;
      case 'lunge': case 'charge': {
        act.dur = p.dur || (p.kind === 'lunge' ? 0.14 : 0.26);
        act.vx = c * (p.dist || 30) / act.dur; act.vy = s * (p.dist || 30) / act.dur;
        a.dashing = true; a.noCollide = true;
        if (p.iframes || (!act.enemy && p.kind === 'charge')) a.iframes = Math.max(a.iframes, act.dur);
        break;
      }
      case 'proj': {
        const n = p.count || 1, spread = p.spread || 0;
        for (let i = 0; i < n; i++) {
          const ang = act.aim + (n > 1 ? (i / (n - 1) - 0.5) * spread * 2 : 0);
          this.spawnProjectile(a, act, ang);
        }
        act.dur = 0.08;
        break;
      }
      case 'seed': this.spawnProjectile(a, act, act.aim, { seed: true }); act.dur = 0.08; break;
      case 'stream': act.dur = p.dur || 0.6; act.nextShot = 0; act.canMove = !act.enemy; a.speedMul = act.enemy ? 0 : 0.45; break;
      case 'beam': {
        const len = this.rayLength(a.x, a.y - 6, act.aim, p.len || 150, a);
        act.dur = p.dur || 0.35; act.len = len;
        this.vfx.push({ kind: 'beam', x: a.x + c * 6, y: a.y - 6 + s * 6, ang: act.aim, len, width: p.width || 10, t: 0, life: act.dur + 0.1, fx: p.fx, type: p.type });
        this.shake = Math.max(this.shake, (p.width || 10) / 4);
        break;
      }
      case 'chain': this.doChain(a, act); act.dur = 0.1; break;
      case 'nova': {
        act.dur = p.wave ? 0.35 : 0.12; act.waveR = 0;
        this.vfx.push({ kind: 'ring', x: a.x, y: a.y, r0: 6, r1: p.radius || 40, t: 0, life: p.wave ? 0.4 : 0.3, fx: p.fx, type: p.type });
        if (p.grounded || (p.radius || 0) > 50) this.shake = Math.max(this.shake, 6);
        if (!p.wave) this.hitCircle(a, act, a.x, a.y, p.radius || 40);
        if (p.selfKO) this.applyDamage(null, a, { dmg: Math.round(a.maxHp * (a.team === 'player' ? 0.25 : p.selfKO)), slot: 'self', noKnock: true });
        break;
      }
      case 'strike': {
        const n = p.count || 1;
        let tp = act.targetPt || { x: a.x + c * 60, y: a.y + s * 60 };
        if (p.self) tp = { x: a.x + c * 10, y: a.y + s * 10 };
        for (let i = 0; i < n; i++) {
          const sc = p.scatter || 0;
          const pt = i === 0 && n === 1 ? tp : { x: tp.x + (this.rand() - 0.5) * sc * 2, y: tp.y + (this.rand() - 0.5) * sc * 2 };
          // enemy blasts must be readable: at least ~0.75s between the warning circle and the hit
          const delay = a.team === 'enemy' ? Math.max(p.delay ?? 0.4, a.boss ? 0.65 : 0.8) : (p.delay ?? 0.4);
          this.strikes.push({ owner: a, act, x: pt.x, y: pt.y, r: p.radius || 20, t: -(i * 0.12), delay, p, slot: act.slot, team: a.team });
        }
        act.dur = 0.15;
        break;
      }
      case 'cloud': {
        let pt = { x: a.x, y: a.y };
        if (p.at === 'front') pt = { x: a.x + c * 34, y: a.y + s * 34 };
        if (p.at === 'target') pt = act.targetPt || { x: a.x + c * 70, y: a.y + s * 70 };
        this.addZone({ owner: a, x: pt.x, y: pt.y, r: p.radius || 24, dur: p.dur || 3, p, slot: act.slot, team: a.team, tick: p.tick || 0.5, status: p.status, blind: p.blind, sprite: p.sprite });
        act.dur = 0.1;
        break;
      }
      case 'debuff': {
        let pt = { x: a.x, y: a.y }; const r = p.radius || 56;
        if (p.at === 'front') pt = { x: a.x + c * r * 0.6, y: a.y + s * r * 0.6 };
        this.vfx.push({ kind: 'ring', x: pt.x, y: pt.y, r0: 4, r1: r, t: 0, life: 0.35, fx: p.fx || 'sound', type: p.type });
        for (const b of this.foesOf(a)) if (Math.hypot(b.x - pt.x, b.y - pt.y) < r + b.r) {
          if (b.team === 'player' && b.iframes > 0) continue;
          if (p.stat) this.changeStage(b, p.stat, -(p.stages || 1));
          if (p.status) this.addStatus(b, p.status, a);
          if (act.slot === 'cast' && a === this.player) this.hooks.onCastHit?.(this, b);
        }
        act.dur = 0.1;
        break;
      }
      case 'buff': {
        if (!p.none) {
          this.changeStage(a, p.stat, p.stages || 1);
          if (p.also) this.changeStage(a, p.also, p.stages || 1);
        } else this.text(a, 'But nothing happened!', '#ffffff');
        this.vfx.push({ kind: 'ring', x: a.x, y: a.y, r0: 18, r1: 4, t: 0, life: 0.35, fx: p.fx || 'shine', type: p.type });
        act.dur = 0.15;
        break;
      }
      case 'heal': {
        const amt = Math.round(a.maxHp * (p.amount || 0.25) * (a.team === 'player' ? 0.6 : 1));
        this.heal(a, amt);
        if (p.sleep) this.addStatus(a, 'sleep', null, { dur: a.team === 'player' ? 1.5 : p.sleep });
        act.dur = 0.2;
        break;
      }
      case 'protect': a.protect = p.dur || 0.8; a.iframes = Math.max(a.iframes, p.dur || 0.8); act.dur = p.dur || 0.8; act.canMove = false; break;
      case 'teleport': {
        const tgt = act.target || this.player;
        const pt = this.randomOpenPoint(tgt, 60);
        this.vfx.push({ kind: 'ring', x: a.x, y: a.y, r0: 12, r1: 2, t: 0, life: 0.25, fx: 'psychic' });
        a.x = pt.x; a.y = pt.y;
        this.vfx.push({ kind: 'ring', x: a.x, y: a.y, r0: 2, r1: 14, t: 0, life: 0.25, fx: 'psychic' });
        act.dur = 0.1;
        break;
      }
      case 'dig': act.dur = p.dur || 0.9; a.untargetable = true; a.burrowed = true; a.noCollide = true; act.canMove = true; a.speedMul = 1.2; break;
      case 'radial': {
        const n = p.count || 12, off = act.aim + (p.offset || 0);
        for (let i = 0; i < n; i++) this.spawnProjectile(a, act, off + (i / n) * Math.PI * 2);
        act.dur = 0.1; break;
      }
      case 'sweep': {
        act.dur = p.dur || 1.0; act.len = p.len || 160;
        act.beamV = { kind: 'beam', x: a.x, y: a.y - 6, ang: act.aim - (p.sweep || 1), len: act.len, width: p.width || 12, t: 0, life: act.dur + 0.05, fx: p.fx, type: p.type };
        this.vfx.push(act.beamV);
        break;
      }
      case 'channel': act.dur = p.dur || 1.4; act.taken = 0; act.hp0 = a.hp; a.channeling = act; break;
      case 'leap': {
        const tp = act.targetPt || (act.target ? { x: act.target.x, y: act.target.y } : { x: a.x, y: a.y });
        act.from = { x: a.x, y: a.y }; act.to = tp; act.dur = p.dur || 0.55; a.untargetable = true; a.noCollide = true; break;
      }
      case 'metronome': {
        const keys = Object.keys(D.moves).filter(k => D.moves[k].power > 0 && k !== 'STRUGGLE');
        const pick = keys[Math.floor(this.rand() * keys.length)];
        this.text(a, D.moves[pick].name, '#ffffff');
        a.action = null;
        this.useMove(a, pick, { aim: act.aim, target: act.target, slot: act.slot, windup: 0 });
        return;
      }
      default: act.dur = 0.1;
    }
  }

  tickActive(a, act, dt) {
    const p = act.p;
    switch (p.kind) {
      case 'swipe': {
        if (!act.swung) { act.swung = true; this.swipe(a, act, p.range, p.arc || 1.6); }
        break;
      }
      case 'multi': {
        act.nextHit -= dt;
        if (act.nextHit <= 0 && act.hitN < (p.hits || 3)) {
          act.hits = new Set(); act.hitN++; act.nextHit = 0.09;
          this.swipe(a, act, p.range, p.arc || 1.6, 1 / Math.sqrt(p.hits || 3));
          if (act.hitN > 1 && p.sfx) Sound.playSE(p.sfx);
        }
        break;
      }
      case 'lunge': case 'charge': {
        const r = this.moveBy(a, act.vx * dt, act.vy * dt);
        if (p.trail && this.time % 0.05 < dt) this.addZone({ owner: a, x: a.x, y: a.y, r: 10, dur: 1.5, p, slot: act.slot, team: a.team, tick: 0.4, fire: true, sprite: 'ember', dmgFrac: 0.3 });
        for (const b of this.foesOf(a)) if (!act.hits.has(b) && Math.hypot(b.x - a.x, b.y - a.y) < (p.range || 14) + b.r) {
          act.hits.add(b);
          this.hit(a, b, act, { ang: act.aim });
          if (p.kind === 'lunge') { act.t = act.dur; } // lunges stop at the first target
        }
        if (r.hitX || r.hitY) {
          if (p.kind === 'charge' && (p.roll || act.enemy)) { this.shake = Math.max(this.shake, 4); if (act.enemy) a.stun = Math.max(a.stun, 0.6); Sound.playSE('se_wall_hit'); }
          act.t = act.dur;
        }
        if (act.t >= act.dur && p.recoil && act.hits.size) this.applyDamage(null, a, { dmg: Math.max(1, Math.round(a.maxHp * p.recoil * (a.team === 'player' ? 0.3 : 0.5))), slot: 'self', noKnock: true, silent: true });
        break;
      }
      case 'stream': {
        act.nextShot -= dt;
        if (!act.enemy && a === this.player) { act.aim = this.playerAim?.() ?? act.aim; a.facing = act.aim; }
        if (act.nextShot <= 0) {
          act.nextShot = p.rate || 0.05;
          const ang = act.aim + (this.rand() - 0.5) * (p.spread || 0.2) * 2;
          this.spawnProjectile(a, act, ang, { dmgScale: 0.22, small: true });
        }
        if (act.t >= act.dur) a.speedMul = 1;
        break;
      }
      case 'beam': {
        if (!act.beamHit || act.t - act.beamHit > 0.15) {
          act.beamHit = act.t; act.hits = new Set();
          const n = Math.max(1, Math.round((p.dur || 0.35) / 0.15));
          this.hitLine(a, act, a.x, a.y - 6, act.aim, act.len, (p.width || 10) / 2, 1 / n * 1.4);
        }
        break;
      }
      case 'nova': {
        if (p.wave) {
          act.waveR = (p.radius || 40) * Math.min(1, act.t / act.dur);
          this.hitCircle(a, act, a.x, a.y, act.waveR);
        }
        if (p.repeat && !act.rep) { act.rep = 1; }
        break;
      }
      case 'dig': {
        if (act.t >= act.dur) {
          a.untargetable = false; a.burrowed = false; a.noCollide = false; a.speedMul = 1;
          this.vfx.push({ kind: 'ring', x: a.x, y: a.y, r0: 4, r1: p.radius || 24, t: 0, life: 0.3, fx: p.fx, type: p.type });
          this.hitCircle(a, act, a.x, a.y, p.radius || 24);
          this.shake = Math.max(this.shake, 5);
          Sound.playSE(p.air ? 'se_m_wing_attack' : 'se_m_dig');
        } else if (act.enemy && act.target) {
          const ang = Math.atan2(act.target.y - a.y, act.target.x - a.x);
          a.vx = Math.cos(ang) * moveSpeed(a) * 1.6; a.vy = Math.sin(ang) * moveSpeed(a) * 1.6;
        }
        break;
      }
      case 'sweep': {
        const k = Math.min(1, act.t / act.dur);
        const ang = act.aim + (k - 0.5) * 2 * (p.sweep || 1) * (p.dir || 1);
        act.beamV.ang = ang; act.beamV.x = a.x; act.beamV.y = a.y - 6;
        act.beamV.len = this.rayLength(a.x, a.y - 6, ang, act.len, a);
        a.facing = ang;
        if (!act.beamHit || act.t - act.beamHit > 0.2) { act.beamHit = act.t; act.hits = new Set(); }
        this.hitLine(a, act, a.x, a.y - 6, ang, act.beamV.len, (p.width || 12) / 2, 0.5);
        break;
      }
      case 'channel': {
        act.taken = act.hp0 - a.hp;
        if (act.taken > a.maxHp * (p.breakFrac || 0.05)) {
          this.text(a, p.breakText || 'It was interrupted!', '#ffffff'); a.channeling = null;
          a.stun = Math.max(a.stun, p.stunOnBreak || 1.6); a.vulnerable = 1.6; act.t = act.dur; act.broken = true; Sound.playSE('se_m_reflect');
        } else if (act.t >= act.dur) { a.channeling = null; if (p.heal) this.heal(a, Math.round(a.maxHp * p.heal)); p.onDone?.(this, a); }
        break;
      }
      case 'leap': {
        const k = Math.min(1, act.t / act.dur);
        a.x = act.from.x + (act.to.x - act.from.x) * k; a.y = act.from.y + (act.to.y - act.from.y) * k; a.z = Math.sin(k * Math.PI) * 50;
        if (k >= 1) {
          a.z = 0; a.untargetable = false; a.noCollide = false;
          if (this.collides(a.x, a.y, Math.min(a.r, 8), this.moveMode(a))) { const pt = this.randomOpenPoint(null); a.x = pt.x; a.y = pt.y; }
          this.vfx.push({ kind: 'ring', x: a.x, y: a.y, r0: 6, r1: p.radius || 40, t: 0, life: 0.35, fx: p.fx || 'quake' });
          this.hitCircle(a, act, a.x, a.y, p.radius || 40); this.shake = Math.max(this.shake, 6); Sound.playSE('se_m_earthquake');
          p.onLand?.(this, a, act);
        }
        break;
      }
      case 'protect': break;
      case 'dash': {
        this.moveBy(a, act.vx * dt, act.vy * dt);
        act.ghostT = (act.ghostT || 0) - dt;
        if (act.ghostT <= 0) { act.ghostT = 0.03; this.vfx.push({ kind: 'afterimage', dex: a.dex, x: a.x, y: a.y, dir: a.dir, anim: a.anim, animT: a.animT, t: 0, life: 0.2 }); }
        act.recover = 0;
        break;
      }
    }
    return act.t >= (act.dur || 0.1);
  }

  swipe(a, act, range, arc, scale = 1) {
    const reach = range * (a.scale || 1);
    this.vfx.push({ kind: 'swipe', x: a.x, y: a.y - 6, ang: act.aim, r: reach, arc, t: 0, life: 0.14, fx: act.p.fx, type: act.p.type, flip: act.comboStep % 2 === 1 });
    for (const b of this.foesOf(a)) {
      if (act.hits.has(b)) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > reach + b.r) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (d > b.r + 4 && Math.abs(angDiff(act.aim, ang)) > arc / 2 + 0.2) continue;
      act.hits.add(b);
      this.hit(a, b, act, { ang, scale });
    }
  }
  hitCircle(a, act, x, y, r) {
    for (const b of this.foesOf(a)) {
      if (act.hits.has(b)) continue;
      if (act.p.grounded && b.flying && !b.boss) continue;
      if (Math.hypot(b.x - x, b.y - y) < r + b.r) { act.hits.add(b); this.hit(a, b, act, { ang: Math.atan2(b.y - y, b.x - x) }); }
    }
  }
  hitLine(a, act, x, y, ang, len, half, scale = 1) {
    const c = Math.cos(ang), s = Math.sin(ang);
    for (const b of this.foesOf(a)) {
      if (act.hits.has(b)) continue;
      const rx = b.x - x, ry = (b.y - 6) - y;
      const along = rx * c + ry * s, perp = Math.abs(-rx * s + ry * c);
      if (along > -b.r && along < len + b.r && perp < half + b.r) { act.hits.add(b); this.hit(a, b, act, { ang, scale }); }
    }
  }
  doChain(a, act) {
    const p = act.p;
    let from = { x: a.x, y: a.y - 8 }, hitSet = new Set(), jumps = (p.jumps || 1) + (act.bonusJumps || 0);
    let target = null;
    // first target: nearest foe within range, preferring the aim direction
    let best = 1e9;
    for (const b of this.foesOf(a)) {
      const d = Math.hypot(b.x - a.x, b.y - a.y); if (d > p.range) continue;
      const da = Math.abs(angDiff(act.aim, Math.atan2(b.y - a.y, b.x - a.x)));
      const score = d * (1 + da * 1.5);
      if (da < (a.team === 'enemy' ? 0.35 : 1.3) && score < best && (a.boss || this.lineClear(a.x, a.y, b.x, b.y))) { best = score; target = b; }
    }
    if (!target) { // fizzle bolt in the aim direction
      const len = this.rayLength(a.x, a.y - 8, act.aim, p.range * 0.7);
      this.vfx.push({ kind: 'bolt', x0: from.x, y0: from.y, x1: from.x + Math.cos(act.aim) * len, y1: from.y + Math.sin(act.aim) * len, t: 0, life: 0.15 });
      return;
    }
    let scale = 1;
    for (let j = 0; j <= jumps && target; j++) {
      this.vfx.push({ kind: 'bolt', x0: from.x, y0: from.y, x1: target.x, y1: target.y - 8, t: 0, life: 0.18 });
      hitSet.add(target);
      this.hit(a, target, act, { ang: Math.atan2(target.y - from.y, target.x - from.x), scale });
      scale *= 0.75;
      from = { x: target.x, y: target.y - 8 };
      let nb = null, nd = 1e9;
      for (const b of this.foesOf(a)) { if (hitSet.has(b)) continue; const d = Math.hypot(b.x - from.x, b.y - from.y); if (d < 80 && d < nd) { nd = d; nb = b; } }
      target = nb;
    }
  }

  spawnProjectile(a, act, ang, o = {}) {
    const p = act.p;
    const sp = (p.speed || 200) * (a.team === 'enemy' ? (a.boss ? 0.85 : 0.72) * ((this.run?.heat || 0) >= 5 ? 1.15 : 1) : 1); // enemy shots are slower, so they can be read and side-stepped
    const pr = {
      owner: a, team: a.team, act, p, slot: act.slot, x: a.x + Math.cos(ang) * (a.r + 2), y: a.y - 6 + Math.sin(ang) * (a.r + 2), z: 0,
      // enemy shots are slower but live longer, so they reach further than the same move in your hands
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, ang, r: (p.size || 5) * (o.small ? 0.8 : 1), life: (p.life || 0.8) * (a.team === 'enemy' ? (a.boss ? 1.6 : 1.5) : 1), t: 0,
      ghost: !!a.boss, // boss shots fly over walls and water
      pierce: p.pierce || 0, hits: new Set(), homing: p.homing || 0, sprite: p.sprite, spin: p.spin, wobble: p.wobble,
      boomerang: p.boomerang, explode: p.explode, lob: p.lob, seed: o.seed, dmgScale: o.dmgScale || 1, type: p.type,
      target: act.target, puddle: p.puddle,
    };
    if (p.lob) { // lobbed: fly to the target point over `life`
      const tp = act.targetPt || { x: a.x + Math.cos(ang) * 90, y: a.y + Math.sin(ang) * 90 };
      pr.lobFrom = { x: pr.x, y: pr.y }; pr.lobTo = { x: tp.x, y: tp.y }; pr.life = 0.7;
      if (a.team === 'enemy') this.strikes.push({ owner: a, act, x: tp.x, y: tp.y, r: p.explode || 16, t: 0, delay: 0.7, p, slot: act.slot, team: a.team, visualOnly: true });
    }
    this.projectiles.push(pr);
    return pr;
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      pr.t += dt;
      if (pr.lob) {
        const k = Math.min(1, pr.t / pr.life);
        pr.x = pr.lobFrom.x + (pr.lobTo.x - pr.lobFrom.x) * k; pr.y = pr.lobFrom.y + (pr.lobTo.y - pr.lobFrom.y) * k;
        pr.z = Math.sin(k * Math.PI) * 40;
        if (k >= 1) { this.explodeProjectile(pr); pr.dead = true; }
        continue;
      }
      if (pr.homing) {
        let tgt = pr.target && !pr.target.dead ? pr.target : null;
        if (!tgt || pr.team !== 'enemy') {
          let bd = 140; tgt = null;
          for (const b of this.foesOf(pr.owner)) { const d = Math.hypot(b.x - pr.x, b.y - pr.y); if (d < bd && !pr.hits.has(b)) { bd = d; tgt = b; } }
        }
        if (tgt) {
          const want = Math.atan2(tgt.y - 6 - pr.y, tgt.x - pr.x), cur = Math.atan2(pr.vy, pr.vx), sp = Math.hypot(pr.vx, pr.vy);
          const na = cur + Math.max(-pr.homing * dt, Math.min(pr.homing * dt, angDiff(cur, want)));
          pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        }
      }
      if (pr.boomerang && pr.t > pr.life * 0.45) {
        const o = pr.owner, want = Math.atan2(o.y - 6 - pr.y, o.x - pr.x), sp = Math.hypot(pr.vx, pr.vy);
        const cur = Math.atan2(pr.vy, pr.vx), na = cur + Math.max(-9 * dt, Math.min(9 * dt, angDiff(cur, want)));
        pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        if (pr.t > pr.life * 0.6 && Math.hypot(o.x - pr.x, o.y - 6 - pr.y) < 10) { pr.dead = true; continue; }
        if (!pr.returned && pr.t > pr.life * 0.45) { pr.returned = true; pr.hits = new Set(); }
      }
      let wob = 0;
      if (pr.wobble) wob = Math.sin(pr.t * 14) * 30;
      pr.x += pr.vx * dt + (-pr.vy / (Math.hypot(pr.vx, pr.vy) || 1)) * wob * dt;
      pr.y += pr.vy * dt + (pr.vx / (Math.hypot(pr.vx, pr.vy) || 1)) * wob * dt;
      if (pr.t > pr.life * (pr.boomerang ? 1.6 : 1)) { if (pr.explode) this.explodeProjectile(pr); pr.dead = true; continue; }
      if (!pr.boomerang && !pr.ghost && this.blocked(pr.x, pr.y + 6, 'shot')) { if (pr.explode) this.explodeProjectile(pr); else this.puff(pr); pr.dead = true; continue; }
      for (const b of this.foesOf(pr.owner)) {
        if (pr.hits.has(b)) continue;
        if (b.burrowed) continue;
        if (Math.hypot(b.x - pr.x, b.y - 8 - pr.y) < pr.r + b.r) {
          if (b.deflect && pr.team !== b.team) { // reflect projectiles (Ho-Oh dash boon, Protect)
            pr.team = b.team; pr.owner = b; pr.vx *= -1; pr.vy *= -1; pr.hits = new Set(); pr.t = 0; pr.dmgScale *= 1.5;
            this.text(b, 'DEFLECT', '#ffffff'); Sound.playSE('se_m_reflect'); break;
          }
          pr.hits.add(b);
          if (pr.seed) { this.addStatus(b, 'poison', pr.owner, { dur: 6 }); b.seeded = { src: pr.owner, t: 6 }; this.text(b, 'SEEDED', '#78c850'); pr.dead = true; break; }
          if (pr.explode) { this.explodeProjectile(pr); pr.dead = true; break; }
          this.hit(pr.owner, b, pr.act, { ang: Math.atan2(pr.vy, pr.vx), scale: pr.dmgScale, proj: pr });
          if (pr.pierce-- <= 0) { pr.dead = true; break; }
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }
  puff(pr) { this.vfx.push({ kind: 'puff', x: pr.x, y: pr.y, t: 0, life: 0.2, type: pr.type, sprite: pr.sprite }); }
  explodeProjectile(pr) {
    const r = pr.explode || 16;
    this.vfx.push({ kind: 'explode', x: pr.x, y: pr.y, r, t: 0, life: 0.3, type: pr.type, sprite: pr.sprite });
    if (r > 20) this.shake = Math.max(this.shake, 3);
    const owner = pr.owner;
    const fake = { ...pr.act, hits: new Set() };
    for (const b of this.foesOf(owner)) if (Math.hypot(b.x - pr.x, b.y - 6 - pr.y) < r + b.r) this.hit(owner, b, fake, { ang: Math.atan2(b.y - pr.y, b.x - pr.x), scale: pr.dmgScale });
    if (pr.puddle) this.addZone({ owner, x: pr.x, y: pr.y + 6, r: r * 0.8, dur: 3, p: pr.p, slot: pr.slot, team: pr.team, tick: 0.5, status: { kind: 'poison', chance: 0.5 }, sprite: 'sludge', dmgFrac: 0.15 });
  }

  addZone(z) { z.t = 0; z.tickT = 0; z.hitCd = new Map(); this.zones.push(z); return z; }
  updateZones(dt) {
    for (const z of this.zones) {
      z.t += dt;
      if (z.t >= z.dur) { z.dead = true; continue; }
      if (z.follow) { z.x = z.follow.x; z.y = z.follow.y; }
      for (const b of this.actors) {
        if (b.dead || b.spawnT > 0) continue;
        const inside = Math.hypot(b.x - z.x, b.y - z.y) < z.r + b.r * 0.5;
        if (z.blind && b.team === z.team) b.hidden = inside ? 0.2 : b.hidden;
        if (!inside) continue;
        if (b.team === z.team && !z.hitsAll) { if (z.onAlly) z.onAlly(this, b, dt); continue; }
        if (b.team !== 'enemy' && z.team !== 'enemy') continue;
        if (b.flying && z.grounded) continue;
        const cd = z.hitCd.get(b) || 0;
        if (this.time < cd) continue;
        z.hitCd.set(b, this.time + (z.tick || 0.5));
        if (z.onEnter) { z.onEnter(this, b); continue; }
        const p = z.p;
        if (p && (p.power > 0 || z.dmgFrac)) {
          this.hit(z.owner, b, { p, slot: z.slot, hits: new Set(), aim: 0, enemy: z.team === 'enemy', zone: true }, { scale: z.dmgFrac ?? 0.35, noKnock: true });
        } else if (p?.dmg) {
          this.applyDamage(z.owner, b, { dmg: Math.max(1, Math.round(b.maxHp * p.dmg)), slot: 'env', noKnock: true });
        }
        if (z.status && this.rand() < z.status.chance) this.addStatus(b, z.status.kind, z.owner);
        if (z.slowField) this.addStatus(b, 'slow', z.owner, { dur: 0.6 });
      }
    }
    this.zones = this.zones.filter(z => !z.dead);
    for (const b of this.actors) if (b.hidden > 0) b.hidden -= dt;
  }

  updateStrikes(dt) {
    for (const s of this.strikes) {
      s.t += dt;
      if (s.t >= s.delay && !s.done) {
        s.done = true;
        if (s.visualOnly) { s.dead = true; continue; }
        this.vfx.push({ kind: 'explode', x: s.x, y: s.y, r: s.r, t: 0, life: 0.3, type: s.p.type, fx: s.p.fx, strike: true });
        if (s.p.fx === 'lightning') { this.vfx.push({ kind: 'bolt', x0: s.x + (this.rand() - 0.5) * 20, y0: s.y - 200, x1: s.x, y1: s.y, t: 0, life: 0.2, big: true }); this.shake = Math.max(this.shake, 4); }
        if (s.p.fx === 'rock' || s.p.fx === 'quake') this.shake = Math.max(this.shake, 3);
        const fake = { ...s.act, p: s.p, slot: s.slot, hits: new Set(), enemy: s.team === 'enemy' };
        const owner = s.owner;
        for (const b of this.actors) {
          if (b.dead || b.spawnT > 0 || b.untargetable) continue;
          if ((s.team === 'enemy' ? b.team === 'enemy' : b.team !== 'enemy') && !(s.owner?.confused && b !== s.owner)) continue;
          if (Math.hypot(b.x - s.x, b.y - s.y) < s.r + b.r) this.hit(owner, b, fake, { ang: Math.atan2(b.y - s.y, b.x - s.x), scale: s.scale || 1 });
        }
        if (s.onHit) s.onHit(this, s);
      }
      if (s.t > s.delay + 0.05) s.dead = true;
    }
    this.strikes = this.strikes.filter(s => !s.dead);
  }

  // ---- telegraphs (enemy windups)
  telegraph(a, act) {
    const tele = { kind: 'tele', t: 0, life: act.windup, owner: a, ...this.teleShape(a, act) };
    act.tele = tele;
    this.vfx.push(tele);
  }
  teleShape(a, act) {
    const p = act.p, ang = act.aim;
    switch (p.kind) {
      case 'swipe': case 'multi': return { shape: 'arc', x: a.x, y: a.y, ang, r: p.range * (a.scale || 1) + 4, arc: p.arc || 1.6 };
      case 'lunge': case 'charge': return { shape: 'line', x: a.x, y: a.y, ang, len: (p.dist || 30) + (p.range || 14), width: a.r * 2 };
      case 'beam': return { shape: 'line', x: a.x, y: a.y - 6, ang, len: this.rayLength(a.x, a.y - 6, ang, p.len || 150, a), width: p.width || 10 };
      case 'proj': case 'stream': case 'seed': return { shape: 'line', x: a.x, y: a.y, ang, len: Math.min(140, p.lob ? 0 : (p.speed || 200) * (p.life || 0.8) * 0.5), width: 3, thin: true, spread: p.spread && p.count > 1 ? p.spread : 0 };
      case 'nova': return { shape: 'circle', x: a.x, y: a.y, r: p.radius || 40 };
      case 'cloud': { const c = Math.cos(ang), s = Math.sin(ang); const pt = p.at === 'front' ? { x: a.x + c * 34, y: a.y + s * 34 } : p.at === 'target' ? (act.targetPt || a) : a; return { shape: 'circle', x: pt.x, y: pt.y, r: p.radius || 24 }; }
      case 'strike': { const pt = act.targetPt || a; return { shape: 'circle', x: pt.x, y: pt.y, r: (p.radius || 20) + (p.scatter || 0) * 0.7 }; }
      case 'chain': return { shape: 'line', x: a.x, y: a.y, ang, len: p.range || 90, width: 3, thin: true };
      case 'debuff': return { shape: 'circle', x: a.x, y: a.y, r: p.radius || 56, soft: true };
      case 'radial': return { shape: 'circle', x: a.x, y: a.y, r: 28, soft: true };
      case 'sweep': return { shape: 'arc', x: a.x, y: a.y - 6, ang, r: Math.min(p.len || 160, 170), arc: (p.sweep || 1) * 2 };
      case 'leap': { const pt = act.targetPt || a; return { shape: 'circle', x: pt.x, y: pt.y, r: p.radius || 40 }; }
      default: return { shape: 'none', x: a.x, y: a.y };
    }
  }

  // ---- damage
  changeStage(a, stat, n) {
    const before = a.stages[stat] || 0;
    a.stages[stat] = Math.max(-2, Math.min(2, before + n));
    if (a.stages[stat] === before) return;
    const names = { atk: 'ATK', def: 'DEF', spa: 'SP.ATK', spd: 'SP.DEF', spe: 'SPEED', acc: 'ACC', eva: 'EVASION', crit: 'CRIT' };
    this.text(a, `${names[stat] || stat} ${n > 0 ? '↑' : '↓'}`, n > 0 ? '#80c8ff' : '#ff9090', true);
    Sound.playSE(n > 0 ? 'se_m_stat_increase' : 'se_m_stat_decrease');
    a.stageTimers ??= {};
    a.stageTimers[stat] = 8;
  }

  // a move hits a target
  hit(src, b, act, o = {}) {
    if (!b || b.dead || b.untargetable) return;
    const p = act.p;
    if (b.protect > 0) { this.text(b, 'PROTECTED', '#c0e0ff'); Sound.playSE('se_m_detect'); return; }
    if (b.iframes > 0 && b.team === 'player') return;
    // accuracy vs evasion (stat stages only; positional aiming does the rest)
    if (src && ((src.stages.acc || 0) < 0 || (b.stages.eva || 0) > 0)) {
      const m = ACC_MULT((src.stages.acc || 0) - (b.stages.eva || 0));
      if (this.rand() > m) { this.text(b, 'MISS', '#ffffff'); return; }
    }
    if (b.team === 'player' && src && src.team === 'enemy' && this.player?.hidden > 0 && this.rand() < 0.5) { this.text(b, 'MISS', '#ffffff'); return; }
    const info = { src, target: b, p, slot: act.slot, scale: (o.scale ?? 1) * (act.power || 1) * (act.scaleMul || 1), crit: false, eff: 1, ang: o.ang ?? 0, knock: p.knock ?? (p.melee ? 70 : 40), proj: o.proj, zone: act.zone, finisher: act.finisher };
    if (p.damaging || act.forceDmg) {
      const r = this.calcDamage(src, b, p, info);
      info.dmg = r.dmg; info.crit = r.crit; info.eff = r.eff;
      if (r.eff === 0) { this.text(b, 'NO EFFECT', '#a0a0a0'); return; }
    } else info.dmg = 0;
    this.hooks.beforeHit?.(this, info);
    if (info.cancel) return;
    if (info.dmg > 0) {
      this.applyDamage(src, b, { dmg: info.dmg, crit: info.crit, eff: info.eff, slot: info.slot, ang: info.ang, knock: o.noKnock ? 0 : info.knock, type: p.type });
      if (p.drain && src && !src.dead) this.heal(src, Math.max(1, Math.round(info.dmg * p.drain * (src.team === 'player' ? 0.35 : 1))));
      if (p.money && src === this.player) this.emit({ type: 'money', amount: 1 + Math.floor(src.level / 8), x: b.x, y: b.y });
    }
    if (p.status && !b.dead && this.rand() < (p.status.chance ?? 1) * (src?.team === 'player' && p.status.kind !== 'trap' ? 0.8 : 1)) this.addStatus(b, p.status.kind, src);
    this.hooks.onHit?.(this, info);
  }

  calcDamage(src, b, p, info) {
    const scale = info.scale ?? 1;
    if (p.fixed === 'level') { // Night Shade / Seismic Toss: damage equals the user's level (scaled for realtime)
      const e0 = typeEffect(p.type, b.types);
      if (e0 === 0 && src?.team === 'enemy') return { dmg: 0, crit: false, eff: 0 };
      if (src?.team === 'enemy') return { dmg: Math.max(1, Math.round((src.level || 10) * 0.5 * Math.sqrt((src.dmgScale ?? 0.55) / 0.55) * scale)), crit: false, eff: 1 };
      const crit = this.rand() < (p.crit || 0.0625) + (src?.critBonus || 0) + (info.slot && src?.slotCrit?.[info.slot] || 0);
      let d = (src?.level || 10) * 1.4 * scale * (src?.dmgMul || 1) * (crit ? 2 : 1) * (src?.slotMul?.[info.slot] || 1);
      if (b.status.freeze) d *= 1.5; if (b.vulnerable > 0) d *= 1.5;
      return { dmg: Math.max(1, Math.round(d)), crit, eff: 1 };
    }
    if (p.fixed) return { dmg: Math.max(1, Math.round(p.fixed * scale * (src?.team === 'enemy' ? 0.5 : 1) * (src?.level || 10) / 20)), crit: false, eff: 1 };
    const L = src?.level || 10;
    const A = src ? statOf(src, p.special ? 'spa' : 'atk') : 20;
    const Dv = statOf(b, p.special ? 'spd' : 'def');
    let base = (((2 * L) / 5 + 2) * p.power * A / Math.max(1, Dv)) / 50 + 2;
    const stab = src && src.types.includes(p.type) ? 1.5 : 1;
    let eff = typeEffect(p.type, b.types);
    // against the player, type matchups are compressed: they matter, but never decide a run
    if (src?.team === 'enemy' && b.team === 'player' && eff > 0) eff = src.boss ? Math.max(0.9, Math.min(1.1, eff)) : Math.max(0.6, Math.min(1.5, eff)); // type weaknesses sting but don't decide runs
    if (eff === 0 && src && src.team !== 'enemy') eff = 0.5; // the player's moves are never fully blocked (a Gastly run must stay winnable)
    const critChance = (p.crit || 0.0625) + (src?.stages.crit || 0) * 0.125 + (src?.critBonus || 0) + (info.slot && src?.slotCrit?.[info.slot] || 0);
    const crit = this.rand() < critChance;
    let dmg = base * stab * eff * (0.85 + this.rand() * 0.15) * scale * (crit ? 2 : 1);
    dmg *= (src?.dmgMul || 1) * (b.takenMul || 1);
    if (src?.slotMul?.[info.slot]) dmg *= src.slotMul[info.slot];
    if (b.status.freeze) dmg *= 1.5;
    if (b.vulnerable > 0) dmg *= 1.5;
    if (this.sunny && p.type === 'FIRE' && src?.team !== 'enemy') dmg *= this.sunny.mult;
    if (this.sunny && p.type === 'WATER' && src?.team !== 'enemy') dmg *= 0.7;
    if (src?.team === 'enemy') dmg *= (src.dmgScale ?? 0.55);
    if (b.armor) dmg *= 1 - b.armor;
    return { dmg: eff === 0 ? 0 : Math.max(1, Math.round(dmg)), crit, eff };
  }

  applyDamage(src, b, o) {
    if (b.dead) return 0;
    let dmg = o.dmg;
    if (b.team === 'player' && b.iframes > 0 && o.slot !== 'dot' && o.slot !== 'self') return 0;
    const ctx = { src, target: b, dmg, ...o };
    if (b.team === 'player' || b.team === 'ally') this.hooks.beforeHurt?.(this, ctx);
    dmg = ctx.dmg;
    if (dmg <= 0) return 0;
    if (b.barrier > 0 && o.slot !== 'dot') {
      const absorbed = Math.min(b.barrier, dmg); b.barrier -= absorbed; dmg -= absorbed;
      this.texts.push({ str: String(absorbed), x: b.x, y: b.y - 18 - b.r, t: 0, life: 0.5, color: 'blue' });
      if (b.barrier <= 0) { this.text(b, 'BARRIER broke!', '#a0d0ff'); Sound.playSE('se_ice_break'); b.stun = Math.max(b.stun, 1.2); b.vulnerable = 2; this.cancelAction(b); }
      if (dmg <= 0) { b.flash = 0.06; return 0; }
    }
    b.hp -= dmg;
    if (!o.noFlash) b.flash = 0.12;
    if (b.status.sleep && o.slot !== 'dot') delete b.status.sleep;
    if (b.status.freeze && o.slot !== 'dot' && o.slot !== 'env') { b.wasFrozen = this.time; delete b.status.freeze; this.vfx.push({ kind: 'shatter', x: b.x, y: b.y - 8, t: 0, life: 0.4 }); Sound.playSE('se_ice_break'); }
    // numbers
    const col = o.color || (b.team === 'player' ? 'red' : o.crit ? 'gold' : o.eff > 1 ? 'orange' : o.eff < 1 ? 'gray' : 'white');
    this.texts.push({ str: String(dmg) + (o.crit ? '!' : ''), x: b.x + (this.rand() - 0.5) * 8, y: b.y - 18 - b.r, t: 0, life: 0.7, color: col, big: o.crit || o.eff > 1 });
    if (o.eff > 1 && !o.silent && b.team === 'enemy' && (!b._seT || this.time - b._seT > 3)) { b._seT = this.time; this.text(b, 'Super effective!', '#ffb060', true, 0.7); }
    if (!o.silent && o.slot !== 'dot') Sound.playSE(o.eff > 1 ? 'se_super_effective' : o.eff < 1 ? 'se_not_effective' : 'se_effective');
    // knockback / stagger
    if (o.knock && !b.boss) {
      const k = o.knock * (b.poise ? 0.4 : 1) * (b.team === 'player' ? 0.6 : 1);
      b.kx += Math.cos(o.ang || 0) * k; b.ky += Math.sin(o.ang || 0) * k;
      b.slamDmg = src?.slamBonus ? Math.round(dmg * src.slamBonus) : 0;
    }
    if (b.team === 'enemy' && o.slot !== 'dot' && !b.boss && !b.poise && !b.action?.uninterruptible) {
      if (b.action && b.action.stage === 'windup' && (dmg > b.maxHp * 0.25 || o.crit)) { if (b.action.move) b.cds[b.action.move] = Math.min(b.cds[b.action.move] || 0, 0.8); this.cancelAction(b); b.stun = Math.max(b.stun, 0.25); }
      setAnim(b, 'Hurt', true); b.animLock = 0.2;
    }
    if (b.team === 'player' && o.slot !== 'dot') {
      b.iframes = Math.max(b.iframes, 0.6); this.shake = Math.max(this.shake, 4);
      setAnim(b, 'Hurt', true); b.animLock = 0.25;
      this.emit({ type: 'hurt', dmg });
    }
    if (o.crit || o.eff > 1 || dmg > b.maxHp * 0.25) this.hitstop = Math.max(this.hitstop, b.boss ? 0.04 : 0.06);
    if (b.hp <= 0) this.kill(b, src, o);
    return dmg;
  }

  heal(a, amt) {
    if (a.dead || amt <= 0) return;
    const before = a.hp;
    a.hp = Math.min(a.maxHp, a.hp + amt);
    if (a.hp > before) this.texts.push({ str: '+' + (a.hp - before), x: a.x, y: a.y - 20 - a.r, t: 0, life: 0.8, color: 'green' });
  }

  kill(b, src, o = {}) {
    if ((b.team === 'player' || b.team === 'ally') && !this.forceDeath) {
      const ctx = { target: b, prevent: false };
      this.hooks.beforeDeath?.(this, ctx);
      if (ctx.prevent) return;
    }
    b.hp = 0; b.dead = true; b.deathT = 0; this.cancelAction(b);
    setAnim(b, 'Hurt', true);
    if (b.team === 'enemy') {
      Sound.playCry(b.species, { mode: 'faint' });
      this.emit({ type: 'kill', actor: b, src, slot: o.slot });
      this.hooks.onKill?.(this, b, src, o);
      if (!this.enemies().length) this.slowmo = 0.5;
    } else this.emit({ type: b.team === 'player' ? 'playerDown' : 'allyDown', actor: b });
  }

  // ---- pickups (money, health drops)
  updatePickups(dt) {
    const p = this.player; if (!p) return;
    for (const k of this.pickups) {
      k.t += dt;
      if (k.vz !== undefined) { k.z += k.vz * dt; k.vz -= 400 * dt; if (k.z <= 0) { k.z = 0; k.vz = k.vz < -60 ? -k.vz * 0.4 : undefined; } }
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (k.t > 0.4 && d < 50 && k.magnet !== false) { k.x += (p.x - k.x) * Math.min(1, dt * 8); k.y += (p.y - k.y) * Math.min(1, dt * 8); }
      if (k.t > 0.4 && d < 10) { k.dead = true; this.emit({ type: 'pickup', pickup: k }); }
    }
    this.pickups = this.pickups.filter(k => !k.dead);
  }

  // ---- visuals bookkeeping
  text(a, str, color = '#ffffff', small = false, life = 0.8) { this.texts.push({ str, x: a.x, y: a.y - 26 - a.r, t: 0, life, label: true, color, small }); }
  updateVfx(dt) {
    for (const v of this.vfx) { v.t += dt; if (v.t >= v.life || (v.kind === 'tele' && v.dead)) v.gone = true; }
    this.vfx = this.vfx.filter(v => !v.gone);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter(t => t.t < t.life);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 25);
    if (this.slowmo > 0) this.slowmo -= dt;
    for (const a of this.actors) {
      if (a.protect > 0) a.protect -= dt;
      if (a.vulnerable > 0) a.vulnerable -= dt;
      if (a.seeded) {
        a.seeded.t -= dt; a.seeded.tick = (a.seeded.tick || 0) + dt;
        if (a.seeded.tick > 1) { a.seeded.tick = 0; const d = this.applyDamage(a.seeded.src, a, { dmg: Math.max(1, Math.round(a.maxHp * (a.boss ? 0.005 : 0.04))), slot: 'dot', noKnock: true, color: 'green', silent: true }); if (a.seeded.src && !a.seeded.src.dead) this.heal(a.seeded.src, Math.max(1, Math.round(d * 0.5))); }
        if (a.seeded.t <= 0) a.seeded = null;
      }
      if (a.stageTimers) for (const k in a.stageTimers) { a.stageTimers[k] -= dt; if (a.stageTimers[k] <= 0) { delete a.stageTimers[k]; a.stages[k] = 0; } }
    }
  }
}

// ---- anim helpers -------------------------------------------------------------------------------
export function setAnim(a, name, restart = false) {
  if (a.anim !== name || restart) { a.anim = name; a.animT = 0; }
}
function chargeAnimFor(p) {
  if (p.kind === 'beam' || p.kind === 'nova' || p.kind === 'buff' || p.kind === 'heal' || p.kind === 'cloud' || p.kind === 'debuff') return 'Charge';
  if (p.melee) return 'Walk';
  return 'Charge';
}
function attackAnimFor(p) {
  if (p.kind === 'swipe' || p.kind === 'multi') return 'Attack';
  if (p.kind === 'lunge' || p.kind === 'charge') return p.roll ? 'Rotate' : 'Attack';
  if (p.kind === 'proj' || p.kind === 'stream' || p.kind === 'beam' || p.kind === 'chain' || p.kind === 'seed') return 'Shoot';
  if (p.kind === 'nova' || p.kind === 'strike') return 'Strike';
  if (p.kind === 'buff' || p.kind === 'heal') return 'Pose';
  return 'Attack';
}
