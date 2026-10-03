// Draws a World: map layers, telegraphs, zones, actors (PMD sprites), projectiles (FireRed battle
// animation sprites), effects and floating text. Coordinates are world pixels; the caller sets the
// camera transform (2x scale).
import { img, ready } from '../engine/assets.js';
import { drawPmd, pmdMeta, resolveAnim } from './pmd.js';
import { text } from '../engine/font.js';
import { TYPE_COLORS } from './data.js';
import { TILE } from './combat.js';

let BA = null; // battle anim manifest
export function setBattleAnimManifest(m) {
  BA = m;
  for (const [tag, e] of Object.entries(m)) for (const [size, sub] of Object.entries(e.subSheets || {})) BA[`${tag}__${size}`] ??= { ...sub, anim: null };
}
const baPath = tag => `gfx/battle_anims/${tag}.png`;

// sprite key -> battle anim tag (+ draw params)
const SPR = {
  ember: { tag: 'small_ember', anim: true }, fireblast: { tag: 'fire', anim: true, scale: 1.2 },
  water: { tag: 'water_orb', anim: true }, bubble: { tag: 'bubble', frame: 0 }, leaf: { tag: 'leaf', anim: true },
  needle: { tag: 'needle', rotate: true, rotOff: -Math.PI / 4 }, star: { tag: 'yellow_star', scale: 0.5, spin: true },
  shadow: { tag: 'shadow_ball', scale: 0.7, spin: true }, sludge: { tag: 'poison_bubble', anim: true, fps: 8 },
  rock: { tag: 'rocks', frame: 2, scale: 0.8 }, mud: { tag: 'mud_sand__16x16', frame: 0 }, wind: { tag: 'air_wave_2', rotate: true },
  bone: { tag: 'bone', spin: true, scale: 0.8 }, seed: { tag: 'seed', frame: 0 }, orb_green: { tag: 'glowy_green_orb', anim: true, fps: 10 },
  orb_yellow: { tag: 'electric_orbs', anim: true, fps: 12 }, orb_psychic: { tag: 'pink_orb', anim: true, fps: 10 }, orb_ghost: { tag: 'wisp_orb', anim: true },
  ring: { tag: 'ring', anim: true, fps: 10 }, snow: { tag: 'snowball', frame: 0 }, string: { tag: 'string', rotate: true },
  dragon: { tag: 'purple_flame', anim: true }, tri: { tag: 'tri_attack_triangle', spin: true, scale: 0.6 }, coin: { tag: 'coin', anim: true, fps: 10 },
  egg: { tag: 'fresh_egg', frame: 0 }, ink: { tag: 'black_ball', frame: 0, scale: 1.5 },
};
const CLOUD = {
  smog: 'purple_gas_cloud', smoke: 'black_smoke', powder_blue: 'sleep_powder', powder_yellow: 'stun_spore', powder_purple: 'poison_powder',
  powder_green: 'spore', spikes: 'spikes', mist: 'mist_cloud', ember: 'small_ember', sludge: 'poison_bubble', vortex: 'water_orb',
};
const SWIPE_FX = {
  claw: 'scratch', cut: 'cut', impact: 'impact', fist: 'punch_impact', bite: 'sharp_teeth', vine: 'whip_hit', ghost: 'lick',
  wind: 'gust', bone: 'bone', fire: 'fire', spark: 'shock_3', psychic: 'gold_ring', ice: 'ice_crystals__16x16', water: 'water_impact',
  dragon: 'purple_flame', rock: 'rocks', quake: 'dirt_mound', sludge: 'poison_bubble', petal: 'pink_petal', sound: 'metal_sound_waves',
};

function baFrame(tag, t, opts = {}) {
  const e = BA?.[tag];
  if (!e) return null;
  const n = e.frames || 1;
  let f = opts.frame ?? 0;
  if (opts.anim && e.anim) {
    const seq = e.anim.filter(x => typeof x[0] === 'number');
    const total = seq.reduce((s, x) => s + x[1], 0) || 1;
    let k = (t * 60) % total;
    for (const [fi, d] of seq) { k -= d; if (k < 0) { f = fi; break; } }
  } else if (opts.anim) f = Math.floor(t * (opts.fps || 12)) % n;
  return { e, f: Math.min(f, n - 1) };
}
export function drawBA(ctx, tag, x, y, t, opts = {}) {
  const r = baFrame(tag, t, opts);
  const im = img(baPath(tag));
  if (!r || !ready(im)) return false;
  const { e, f } = r;
  const s = opts.scale || 1;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (opts.rot) ctx.rotate(opts.rot);
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  if (opts.flipX) ctx.scale(-1, 1);
  ctx.drawImage(im, f * e.frameW, 0, e.frameW, e.frameH, -e.frameW * s / 2, -e.frameH * s / 2, e.frameW * s, e.frameH * s);
  ctx.restore();
  return true;
}

const shadowCache = new Map();
function shadow(ctx, x, y, w, a = 0.35) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), w, Math.max(2, w * 0.4), 0, 0, Math.PI * 2); ctx.fill();
}

// ---------------------------------------------------------------------------------------------
export function drawWorld(ctx, w, cam, opts = {}) {
  const R = w.room;
  const t = w.time;
  // map under layer (the whole layout, so the surroundings of the crop show too)
  if (R.under && ready(R.under)) {
    ctx.drawImage(R.under, -R.ox, -R.oy);
    if (R.anim && opts.tileAnims) { ctx.save(); ctx.translate(-R.ox, -R.oy); opts.tileAnims(ctx); ctx.restore(); }
  } else { ctx.fillStyle = '#304030'; ctx.fillRect(0, 0, R.w * TILE, R.h * TILE); }
  opts.underlay?.(ctx);
  // zones
  for (const z of w.zones) drawZone(ctx, z, w);
  // telegraphs
  for (const v of w.vfx) if (v.kind === 'tele') drawTele(ctx, v);
  for (const s of w.strikes) drawStrikeWarn(ctx, s);
  // pickups
  for (const k of w.pickups) drawPickup(ctx, k, t);
  // sortable things
  const items = [];
  for (const a of w.actors) items.push({ y: a.y, a });
  for (const p of w.projectiles) items.push({ y: p.y + 6, p });
  for (const v of w.vfx) if (v.kind === 'afterimage') items.push({ y: v.y - 0.1, v });
  for (const b of (w.balls || [])) items.push({ y: b.y + 10, ball: b });
  opts.extraSprites?.(items);
  // shadows first
  for (const it of items) {
    if (it.a && !it.a.dead && it.a.spawnT <= 0 && !it.a.burrowed) shadow(ctx, it.a.x, it.a.y + 1, it.a.r * 0.9 * (it.a.scale || 1), it.a.flying ? 0.2 : 0.3);
    if (it.p) shadow(ctx, it.p.x, it.p.y + 8, Math.max(2, it.p.r * 0.6), 0.25);
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.a) drawActor(ctx, it.a, w);
    else if (it.p) drawProjectile(ctx, it.p);
    else if (it.v) drawPmd(ctx, it.v.dex, it.v.x, it.v.y - 4, { anim: it.v.anim, dir: it.v.dir, t: it.v.animT || 0, alpha: 0.35 * (1 - it.v.t / it.v.life), tint: '#a0e0ff', tintA: 0.6 });
    else if (it.ball) drawBall(ctx, it.ball);
    else if (it.draw) it.draw(ctx);
  }
  // tall grass covers feet
  if (R.grass) drawGrassOver(ctx, w);
  // map over layer (tree tops, roofs)
  if (R.over && ready(R.over)) ctx.drawImage(R.over, -R.ox, -R.oy);
  // darken everything outside the arena crop
  if (!opts.noMask) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const fw = (R.fullW || R.w) * TILE, fh = (R.fullH || R.h) * TILE;
    ctx.fillRect(-R.ox - 400, -R.oy - 400, fw + 800, R.oy + 400);
    ctx.fillRect(-R.ox - 400, R.h * TILE, fw + 800, fh - R.oy - R.h * TILE + 400);
    ctx.fillRect(-R.ox - 400, 0, R.ox + 400, R.h * TILE);
    ctx.fillRect(R.w * TILE, 0, fw - R.ox - R.w * TILE + 400, R.h * TILE);
  }
  opts.overlay?.(ctx);
  // effects
  for (const v of w.vfx) if (v.kind !== 'tele' && v.kind !== 'afterimage') drawVfx(ctx, v, w);
  // health bars + status icons above enemies
  for (const a of w.actors) if (!a.dead && a.spawnT <= 0 && a.team !== 'player' && !a.boss && !a.captured) drawActorBar(ctx, a);
  // floating text
  for (const tx of w.texts) {
    const k = tx.t / tx.life;
    const y = tx.y - (tx.label ? 10 * k : 18 * Math.sqrt(k));
    const alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    if (tx.label) text(ctx, tx.str, tx.x, y, { align: 'center', color: [tx.color, '#202020'], font: 'small', alpha });
    else text(ctx, tx.str, tx.x, y, { align: 'center', color: tx.color, font: tx.big ? 'normal' : 'small', alpha, scale: 1 });
  }
}

function drawGrassOver(ctx, w) {
  const R = w.room;
  for (const a of w.actors) {
    if (a.dead || a.flying || a.spawnT > 0) continue;
    const tx = Math.floor(a.x / TILE), ty = Math.floor(a.y / TILE);
    if (tx < 0 || ty < 0 || tx >= R.w || ty >= R.h || !R.grass[ty * R.w + tx]) continue;
    // redraw the bottom half of the grass tile over the sprite's feet
    if (R.under && ready(R.under)) ctx.drawImage(R.under, R.ox + tx * TILE, R.oy + ty * TILE + 8, TILE, 8, tx * TILE, ty * TILE + 8, TILE, 8);
  }
}

const STATUS_ICON = { burn: 'brn', poison: 'psn', toxic: 'psn', para: 'par', sleep: 'slp', freeze: 'frz' };

export function drawActor(ctx, a, w) {
  const t = a.animT;
  let alpha = a.alpha ?? 1;
  if (a.spawnT > 0) {
    const k = 1 - a.spawnT / (a.spawnMax || 0.6);
    // spawn: white silhouette pop-in
    drawPmd(ctx, a.dex, a.x, a.y - 4, { anim: 'Idle', dir: a.dir, t, alpha: Math.min(1, k * 1.5), tint: '#ffffff', tintA: 1 - k * 0.5, scale: a.scale });
    return;
  }
  if (a.burrowed) { drawBA(ctx, 'dirt_mound', a.x, a.y, w.time, { frame: Math.floor(w.time * 8) % 2 }); return; }
  if (a.captured) return;
  if (a.dead) {
    if (a.deathT > 0.6) return;
    alpha *= 1 - a.deathT / 0.6;
    drawPmd(ctx, a.dex, a.x, a.y - 4 + a.deathT * 10, { anim: 'Hurt', dir: a.dir, t: 0, loop: false, alpha, tint: '#ffffff', tintA: 0.5, scale: a.scale });
    return;
  }
  if (a.ghost && w.blocked(a.x, a.y, 'walk')) alpha *= 0.45;
  if (a.ghostly) alpha *= 0.55 + Math.sin(w.time * 4) * 0.15;
  if (a.team === 'player' && a.iframes > 0 && !a.dashing && Math.floor(w.time * 20) % 2 === 0) alpha *= 0.5;
  if (a.team === 'player' && a.dashing) alpha *= 0.55; // dashing = invulnerable (about 0.2s): show it
  if (a.hidden > 0 && a.team === 'player') alpha *= 0.6;
  let tint = null, tintA = 0;
  if (a.flash > 0) { tint = '#ffffff'; tintA = 0.85; }
  else if (a.status.freeze) { tint = '#a8e8ff'; tintA = 0.55; }
  else if (a.status.chill) { tint = '#a8e8ff'; tintA = 0.12 * a.status.chill.stacks; }
  else if (a.action?.stage === 'windup' && a.team === 'enemy' && a.action.windup > 0.15) { tint = '#ff3030'; tintA = 0.25 + 0.25 * Math.sin(w.time * 30); }
  else if (a.status.burn && Math.floor(w.time * 6) % 2 === 0) { tint = '#ff6020'; tintA = 0.25; }
  else if (a.status.poison || a.status.toxic) { tint = '#a040c0'; tintA = 0.18; }
  const loop = !['Attack', 'Strike', 'Shoot', 'Hurt', 'Pose'].includes(a.anim);
  const z = a.flying || a.hover ? 4 + Math.sin(w.time * 4 + a.id) * 2 : 0;
  const frozen = a.status.freeze || a.status.sleep;
  const speed = a.action?.stage === 'windup' && a.anim === 'Charge' ? 1 : (a.status.para ? 0.5 : 1);
  drawPmd(ctx, a.dex, a.x, a.y - 4 - z - (a.z || 0), { anim: a.status.sleep ? 'Sleep' : a.anim, dir: a.dir, t: frozen ? 0 : t, loop, alpha, tint, tintA, scale: a.scale, speed });
  if (a.status.freeze) drawBA(ctx, 'ice_cube', a.x, a.y - 10, 0, { scale: Math.min(0.5, a.r / 26), alpha: 0.75 });
  if (a.status.sleep) drawBA(ctx, 'letter_z', a.x + 8, a.y - 24 - a.r - Math.sin(w.time * 3) * 3, w.time, { anim: true, alpha: 0.9 });
  if (a.status.confuse || a.confused) drawBA(ctx, 'duck', a.x + Math.cos(w.time * 5) * 8, a.y - 20 - a.r, w.time, { anim: true, scale: 0.6 });
  if (a.status.para && Math.floor(w.time * 10) % 3 === 0) drawBA(ctx, 'spark_2', a.x + (Math.random() - 0.5) * a.r, a.y - 10 - Math.random() * a.r, 0, { frame: Math.floor(Math.random() * 3), scale: 0.7 });
  if (a.status.burn && Math.floor(w.time * 8) % 4 === 0) drawBA(ctx, 'small_ember', a.x + (Math.random() - 0.5) * a.r, a.y - 6 - Math.random() * a.r, w.time, { anim: true, scale: 0.4 });
  if (a.protect > 0) drawBA(ctx, 'protect', a.x, a.y - 10, 0, { scale: Math.max(0.4, a.r / 22), alpha: 0.6 });
  if (a.shieldHits > 0 && a.team === 'player') { ctx.strokeStyle = 'rgba(248,208,96,0.5)'; ctx.beginPath(); ctx.arc(a.x, a.y - 8, a.r + 6, 0, Math.PI * 2); ctx.stroke(); }
  if (a.seeded) drawBA(ctx, 'seed', a.x - 6, a.y - 4 - a.r, 0, { frame: 0, scale: 0.7 });
}

// height of the sprite above its ground point, from the PMD Idle frame (cached per actor)
export function spriteTop(a) {
  if (a._top) return a._top;
  const m = pmdMeta(a.dex);
  if (!m) return 12 + a.r * 1.5;
  const an = resolveAnim(m, 'Idle');
  a._top = Math.round((an.frameH * 0.36 + 4) * (a.scale || 1)) + (a.flying ? 6 : 0);
  return a._top;
}

function drawActorBar(ctx, a) {
  const w = Math.max(18, Math.min(32, a.r * 2.4));
  const x = Math.round(a.x - w / 2), y = Math.round(a.y - spriteTop(a) - 4);
  const frac = Math.max(0, a.hp / a.maxHp);
  ctx.fillStyle = '#202820'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
  ctx.fillStyle = a.team === 'ally' ? '#4080ff' : frac > 0.5 ? '#58d080' : frac > 0.2 ? '#f8c838' : '#f85838';
  ctx.fillRect(x, y, Math.ceil(w * frac), 2);
  if (a.elite) { ctx.fillStyle = '#f8d030'; ctx.fillRect(x - 3, y - 1, 2, 4); ctx.fillRect(x + w + 1, y - 1, 2, 4); }
  // catchable hint
  if (a.team === 'enemy' && !a.trainerMon && frac <= 0.45) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w + 2, y - 1, 3, 3); ctx.fillStyle = '#e83030'; ctx.fillRect(x + w + 2, y - 1, 3, 1); }
  // status icon
  const st = Object.keys(a.status).find(k => STATUS_ICON[k]);
  if (st) { const im = img(`gfx/ui/battle/status_${STATUS_ICON[st]}.png`); if (ready(im)) ctx.drawImage(im, x + w / 2 - 12, y - 9); }
  // stage arrows
  let sx = x;
  for (const k of ['atk', 'def', 'spe']) { const s = a.stages[k]; if (s) { ctx.fillStyle = s > 0 ? '#80c8ff' : '#ff8080'; ctx.fillRect(sx, y + 3, 3, 1); sx += 4; } }
}

function drawProjectile(ctx, p) {
  const spec = SPR[p.sprite];
  const ang = Math.atan2(p.vy, p.vx);
  const y = p.y - (p.z || 0);
  const s = (spec?.scale || 1) * Math.max(0.6, Math.min(1.6, p.r / 5));
  if (spec) {
    const rot = spec.rotate ? ang + (spec.rotOff || 0) : spec.spin || p.spin ? p.t * 14 : 0;
    if (drawBA(ctx, spec.tag, p.x, y, p.t, { anim: spec.anim, fps: spec.fps, frame: spec.frame, rot, scale: s })) return;
  }
  const col = TYPE_COLORS[p.type] || '#fff';
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, y, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x - 1, y - 1, p.r * 0.4, 0, Math.PI * 2); ctx.fill();
}

function drawBall(ctx, b) {
  const im = img(`gfx/ui/balls/${b.ball.replace("_ball", "")}.png`);
  if (!ready(im)) return;
  let frame = 0, dx = 0;
  if (b.state === 'shake') {
    const k = (b.t % 0.55) / 0.55;
    dx = k < 0.4 ? Math.sin(k / 0.4 * Math.PI * 2) * 2 : 0;
    frame = b.t < 0.15 ? 2 : 0;
  }
  ctx.save();
  ctx.translate(Math.round(b.x + dx), Math.round(b.y));
  if (b.state === 'fly') ctx.rotate(b.t * 20);
  if (b.state === 'shake' && dx) ctx.rotate(dx * 0.15);
  ctx.drawImage(im, 0, frame * 16, 16, 16, -8, -8, 16, 16);
  ctx.restore();
}

function drawPickup(ctx, k, t) {
  const y = k.y - (k.z || 0) - Math.sin(t * 4 + k.x) * 1.5;
  shadow(ctx, k.x, k.y + 4, 5, 0.25);
  if (k.icon) { const im = img(k.icon); if (ready(im)) ctx.drawImage(im, Math.round(k.x - im.naturalWidth / 2), Math.round(y - im.naturalHeight / 2)); }
  else { ctx.fillStyle = '#f8d038'; ctx.fillRect(Math.round(k.x - 2), Math.round(y - 2), 4, 4); }
}

function drawZone(ctx, z, w) {
  const k = z.t / z.dur;
  const alpha = Math.min(1, z.t * 4) * (k > 0.8 ? (1 - k) / 0.2 : 1);
  const tag = CLOUD[z.sprite];
  const col = z.fxColor || (z.team === 'enemy' ? 'rgba(200,60,200,0.18)' : 'rgba(255,255,255,0.12)');
  ctx.globalAlpha = alpha;
  if (z.vortex) {
    ctx.strokeStyle = 'rgba(120,180,255,0.6)';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.3 + 0.3 * i) * (1 + 0.1 * Math.sin(w.time * 6 + i)), w.time * 5 + i, w.time * 5 + i + 4); ctx.stroke(); }
  } else if (z.sprite === 'smoke' || z.blind) {
    ctx.fillStyle = 'rgba(40,40,48,0.55)';
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + w.time * 0.4; ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * z.r * 0.5, z.y + Math.sin(a) * z.r * 0.35, z.r * 0.55, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    if (tag) {
      const n = Math.max(2, Math.round(z.r / 6));
      for (let i = 0; i < n; i++) {
        const a = i * 2.4 + z.t * (z.fire ? 0 : 0.8), rr = z.r * (0.25 + 0.55 * ((i * 37) % 10) / 10);
        drawBA(ctx, tag, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.6 - 4, z.t + i * 0.13, { anim: true, scale: z.fire ? 0.5 : 0.8, alpha: 0.9 });
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawTele(ctx, v) {
  const k = Math.min(1, v.t / Math.max(0.01, v.life));
  ctx.save();
  const fill = `rgba(255,40,40,${0.12 + 0.18 * k})`, edge = `rgba(255,80,60,${0.5 + 0.4 * k})`;
  ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = 1;
  if (v.shape === 'arc') {
    ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.arc(v.x, v.y, v.r, v.ang - v.arc / 2, v.ang + v.arc / 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(v.x, v.y, v.r * k, v.ang - v.arc / 2, v.ang + v.arc / 2); ctx.stroke();
  } else if (v.shape === 'line') {
    ctx.translate(v.x, v.y); ctx.rotate(v.ang);
    const draws = v.spread ? [-v.spread, 0, v.spread] : [0];
    for (const off of draws) {
      ctx.save(); ctx.rotate(off);
      if (v.thin) { ctx.fillStyle = `rgba(255,60,60,${0.35 + 0.3 * k})`; ctx.fillRect(0, -1, v.len * (0.4 + 0.6 * k), 2); }
      else { ctx.fillRect(0, -v.width / 2, v.len, v.width); ctx.fillStyle = edge; ctx.fillRect(0, -v.width / 2, v.len * k, v.width); }
      ctx.restore();
    }
  } else if (v.shape === 'circle') {
    ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r, v.r * 0.75, 0, 0, Math.PI * 2); ctx.fill(); if (!v.soft) ctx.stroke();
    ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r * k, v.r * 0.75 * k, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawStrikeWarn(ctx, s) {
  if (s.done || s.t < 0) return;
  const k = Math.min(1, s.t / s.delay);
  const enemy = s.team === 'enemy';
  ctx.save();
  ctx.fillStyle = enemy ? `rgba(255,40,40,${0.15 + 0.2 * k})` : `rgba(255,240,120,${0.1 + 0.15 * k})`;
  ctx.strokeStyle = enemy ? 'rgba(255,90,70,0.85)' : 'rgba(255,240,140,0.7)';
  ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * k, s.r * 0.75 * k, 0, 0, Math.PI * 2); ctx.stroke();
  // falling rock
  if (s.p?.fx === 'rock') drawBA(ctx, 'rocks', s.x, s.y - (1 - k) * 120 - 8, 0, { frame: 2, scale: 0.9 });
  ctx.restore();
}

function drawVfx(ctx, v, w) {
  const k = v.t / v.life;
  switch (v.kind) {
    case 'swipe': {
      const tag = SWIPE_FX[v.fx] || 'impact';
      const x = v.x + Math.cos(v.ang) * v.r * 0.6, y = v.y + Math.sin(v.ang) * v.r * 0.6;
      const scale = tag === 'sharp_teeth' ? 0.45 : Math.max(0.6, Math.min(1.2, v.r / 26));
      if (!drawBA(ctx, tag, x, y, v.t, { anim: true, rot: ['scratch', 'cut', 'whip_hit', 'gust'].includes(tag) ? v.ang + (v.flip ? Math.PI : 0) - Math.PI / 2 : 0, scale, flipX: v.flip })) {
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(v.x, v.y, v.r * (0.6 + 0.4 * k), v.ang - v.arc / 2, v.ang + v.arc / 2); ctx.stroke(); ctx.lineWidth = 1;
      }
      // arc trail
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(v.x, v.y, v.r * 0.9, v.ang - v.arc / 2 * (0.4 + k), v.ang + v.arc / 2 * (0.4 + k)); ctx.stroke();
      break;
    }
    case 'beam': {
      const col = TYPE_COLORS[v.type] || '#fff';
      const fade = k > 0.7 ? (1 - k) / 0.3 : 1;
      const wd = v.width * (k < 0.15 ? k / 0.15 : 1);
      ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.ang); ctx.globalAlpha = fade;
      ctx.fillStyle = col; ctx.fillRect(0, -wd / 2, v.len, wd);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -wd / 5, v.len, wd / 2.5);
      for (let d = 0; d < v.len; d += 12) { ctx.fillStyle = col; ctx.fillRect(d + ((w.time * 200) % 12), -wd / 2 - 2, 4, 2); ctx.fillRect(d + ((w.time * 160) % 12), wd / 2, 4, 2); }
      ctx.restore();
      drawBA(ctx, v.fx === 'water' ? 'water_impact' : v.fx === 'ice' ? 'ice_crystals__16x16' : 'explosion', v.x + Math.cos(v.ang) * v.len, v.y + Math.sin(v.ang) * v.len, v.t, { anim: true, alpha: fade });
      break;
    }
    case 'bolt': {
      ctx.strokeStyle = `rgba(255,248,140,${1 - k})`; ctx.lineWidth = v.big ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(v.x0, v.y0);
      const n = 6;
      for (let i = 1; i < n; i++) { const t = i / n; ctx.lineTo(v.x0 + (v.x1 - v.x0) * t + (Math.random() - 0.5) * 8, v.y0 + (v.y1 - v.y0) * t + (Math.random() - 0.5) * 8); }
      ctx.lineTo(v.x1, v.y1); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 1; ctx.stroke();
      if (v.big) drawBA(ctx, 'lightning', v.x1, v.y1 - 16, v.t, { anim: true });
      break;
    }
    case 'ring': {
      const r = v.r0 + (v.r1 - v.r0) * Math.sqrt(k);
      const col = v.fx === 'fire' ? '255,140,40' : v.fx === 'ice' ? '170,230,255' : v.fx === 'water' ? '100,150,255' : v.fx === 'spark' ? '255,240,100' : v.fx === 'psychic' ? '255,120,200' : v.fx === 'quake' ? '200,170,100' : v.fx === 'explosion' ? '255,200,80' : v.fx === 'wind' ? '220,240,255' : v.fx === 'sound' ? '255,255,255' : '255,255,255';
      ctx.strokeStyle = `rgba(${col},${(1 - k) * 0.9})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(v.x, v.y, r, r * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
      if (v.fx === 'quake' || v.fx === 'explosion') { ctx.fillStyle = `rgba(${col},${(1 - k) * 0.15})`; ctx.fill(); }
      if (v.fx === 'explosion' && k < 0.6) for (let i = 0; i < 5; i++) drawBA(ctx, 'explosion', v.x + Math.cos(i * 1.3) * r * 0.6, v.y + Math.sin(i * 1.3) * r * 0.45, v.t + i * 0.04, { anim: true });
      break;
    }
    case 'explode': {
      const tag = v.fx === 'lightning' ? null : v.type === 'WATER' ? 'water_impact' : v.type === 'FIRE' ? 'fire_plume' : v.type === 'ICE' ? 'ice_crystals__16x16' : v.type === 'POISON' ? 'poison_bubble' : v.type === 'ROCK' || v.type === 'GROUND' ? 'rocks' : v.type === 'PSYCHIC' ? 'gold_ring' : v.type === 'GHOST' || v.type === 'DARK' ? 'purple_flame' : 'explosion';
      const s = Math.max(0.6, Math.min(1.6, v.r / 18));
      if (tag) drawBA(ctx, tag, v.x, v.y - 4, v.t, { anim: true, scale: s, alpha: 1 - k * 0.5, frame: tag === 'rocks' ? 3 : undefined });
      ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.6})`; ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r * k, v.r * 0.75 * k, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'puff': drawBA(ctx, 'impact', v.x, v.y, v.t, { scale: 0.4, alpha: 1 - k }); break;
    case 'shatter': for (let i = 0; i < 6; i++) drawBA(ctx, 'ice_crystals__8x16', v.x + Math.cos(i) * 20 * k, v.y + Math.sin(i * 1.7) * 14 * k, 0, { frame: i % 3, alpha: 1 - k }); break;
    case 'dust': for (let i = 0; i < 3; i++) { ctx.fillStyle = `rgba(230,220,200,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(v.x + (i - 1) * 5, v.y - k * 4, 2 + k * 3, 0, Math.PI * 2); ctx.fill(); } break;
    case 'sendout': {
      const r = (v.recall ? 1 - k : k) * 20;
      ctx.fillStyle = `rgba(255,255,255,${(1 - k) * 0.8})`; ctx.beginPath(); ctx.ellipse(v.x, v.y - 8, r, r, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) drawBA(ctx, 'sparkle_2', v.x + Math.cos(i * 0.8) * r * 1.4, v.y - 8 + Math.sin(i * 0.8) * r, v.t, { anim: true, scale: 0.5, alpha: 1 - k });
      break;
    }
    case 'heal': for (let i = 0; i < 5; i++) drawBA(ctx, 'sparkle_2', v.x + Math.cos(i * 1.3 + k * 4) * 10, v.y - 10 - k * 20 + i * 2, v.t, { anim: true, scale: 0.5, alpha: 1 - k }); break;
    case 'custom': v.draw?.(ctx, v, k); break;
    // Blizzard: a frosty haze with wind-driven snow over the target area
    case 'blizzard': {
      const a = Math.min(1, v.t / 0.2, (v.life - v.t) / 0.35);
      const g = ctx.createRadialGradient(v.x, v.y, 4, v.x, v.y, v.r * 1.3);
      g.addColorStop(0, `rgba(220,240,255,${0.35 * a})`); g.addColorStop(1, 'rgba(220,240,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r * 1.3, v.r, 0, 0, Math.PI * 2); ctx.fill();
      const W2 = v.r * 2.6, H2 = v.r * 2;
      for (let i = 0; i < 70; i++) {
        const sx = ((i * 97.13 + v.t * (150 + (i % 5) * 25)) % W2) - W2 / 2, sy = ((i * 53.71 + v.t * (55 + (i % 3) * 20)) % H2) - H2 / 2;
        if ((sx * sx) / (W2 * W2 / 4) + (sy * sy) / (H2 * H2 / 4) > 1) continue;
        const big = i % 7 === 0;
        ctx.fillStyle = `rgba(255,255,255,${(big ? 0.95 : 0.7) * a})`;
        ctx.fillRect(Math.round(v.x + sx), Math.round(v.y + sy - 10), big ? 2 : 1, big ? 2 : 1);
        if (i % 4 === 0) { ctx.fillStyle = `rgba(230,245,255,${0.35 * a})`; ctx.fillRect(Math.round(v.x + sx - 6), Math.round(v.y + sy - 10), 6, 1); } // wind streaks
      }
      break;
    }
    // an ice chunk drops from the sky onto its warning circle
    case 'icefall': {
      if (v.t < 0) break;
      const f = Math.min(1, v.t / v.life), fall = (1 - f * f) * 130;
      ctx.fillStyle = `rgba(150,210,255,${0.25 + 0.25 * f})`; ctx.beginPath(); ctx.ellipse(v.x, v.y, 4 + 8 * f, 3 + 5 * f, 0, 0, Math.PI * 2); ctx.fill(); // its shadow
      if (!drawBA(ctx, 'ice_chunk', v.x, v.y - 8 - fall, 0, { scale: 0.9 })) { ctx.fillStyle = '#c8ecff'; ctx.fillRect(v.x - 3, v.y - 14 - fall, 6, 10); }
      ctx.strokeStyle = `rgba(220,245,255,${0.5 * f})`; ctx.beginPath(); ctx.moveTo(v.x, v.y - 8 - fall - 4); ctx.lineTo(v.x - 3, v.y - 8 - fall - 22); ctx.stroke(); // falling streak
      break;
    }
    // impact: ice spikes burst out, frost spreads and crystals scatter
    case 'iceburst': {
      ctx.fillStyle = `rgba(200,240,255,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r * (0.6 + 0.6 * k), v.r * 0.75 * (0.6 + 0.6 * k), 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
      drawBA(ctx, 'ice_spikes', v.x, v.y - 6, v.t, { anim: true, scale: Math.max(0.8, v.r / 18), alpha: 1 - k * 0.6 });
      for (let i = 0; i < 6; i++) drawBA(ctx, 'ice_crystals__8x16', v.x + Math.cos(i * 1.05) * v.r * 1.1 * k, v.y + Math.sin(i * 1.05) * v.r * 0.8 * k - 6, 0, { frame: i % 3, alpha: 1 - k });
      break;
    }
  }
}

// screen-space darkness vignette for caves/towers
export function drawVignette(ctx, W, H, strength = 0.5) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

export { resolveAnim, pmdMeta, shadow };
