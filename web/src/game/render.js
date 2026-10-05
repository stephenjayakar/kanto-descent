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
  water: { tag: 'small_bubbles', frame: 1, rotate: true, rotOff: Math.PI / 2 }, // Water Gun's droplet (the orb is only ever drawn blended, in groups)
  spark: { tag: 'spark__8x16', anim: true, fps: 16, rotate: true, rotOff: Math.PI / 2 }, bubble: { tag: 'bubble', frame: 0 }, leaf: { tag: 'leaf', anim: true },
  needle: { tag: 'needle', rotate: true, rotOff: -Math.PI / 4 }, star: { tag: 'yellow_star', scale: 0.5, spin: true },
  shadow: { tag: 'shadow_ball', scale: 0.7, spin: true }, sludge: { tag: 'poison_bubble', anim: true, fps: 8 },
  rock: { tag: 'rocks', frame: 2, scale: 0.8 }, mud: { tag: 'mud_sand__16x16', frame: 0 }, wind: { tag: 'air_wave_2', rotate: true },
  bone: { tag: 'bone', spin: true, scale: 0.8 }, seed: { tag: 'seed', frame: 0 }, orb_green: { tag: 'glowy_green_orb', anim: true, fps: 10 },
  orb_yellow: { tag: 'electric_orbs', anim: true, fps: 12 }, orb_psychic: { tag: 'pink_orb', anim: true, fps: 10 }, orb_ghost: { tag: 'wisp_orb', anim: true },
  ring: { tag: 'ring', anim: true, fps: 10 }, snow: { tag: 'snowball', frame: 0 }, string: { tag: 'string', rotate: true },
  dragon: { tag: 'fire_plume', anim: true, scale: 0.5 }, // Dragon Rage / Breath use fire, not Grudge's navy flame tri: { tag: 'tri_attack_triangle', spin: true, scale: 0.6 }, coin: { tag: 'coin', anim: true, fps: 10 },
  egg: { tag: 'fresh_egg', frame: 0 }, ink: { tag: 'black_ball', frame: 0, scale: 1.5 },
};
// beam moves as particle streams (from FireRed's move animations)
function beamStyle(v) {
  const fx = v.fx, ty = v.type;
  if (fx === 'water' || ty === 'WATER') return { tag: 'water_orb', anim: true, scale: 0.5, step: 6, speed: 140, wobble: 1.5, alpha: 0.65, hit: 'water_impact' };
  if (fx === 'ice' || ty === 'ICE') return { tag: 'ice_crystals', anim: true, scale: 1, step: 6, speed: 120, wobble: 2, alpha: 1, hit: 'ice_crystals__16x16' };
  if (fx === 'psychic' || ty === 'PSYCHIC') return { tag: 'gold_ring', scale: 0.5, step: 8, speed: 160, wobble: 0, alpha: 0.9, rotate: true, rotOff: Math.PI / 2, hit: 'gold_ring' };
  if (fx === 'fire' || ty === 'FIRE') return { tag: 'small_ember', anim: true, scale: 0.5, step: 6, speed: 150, wobble: 2, alpha: 1, hit: 'fire_plume' };
  if (fx === 'spark' || ty === 'ELECTRIC') return { tag: 'spark__8x16', anim: true, scale: 0.5, step: 6, speed: 180, wobble: 2.5, alpha: 1, rotate: true, rotOff: Math.PI / 2, hit: 'spark_2' };
  if (ty === 'GRASS') return { tag: 'orbs__16x16', anim: true, scale: 0.5, step: 7, speed: 150, wobble: 1, alpha: 1, hit: 'impact' };
  if (ty === 'DRAGON') return { tag: 'fire_plume', anim: true, scale: 0.5, step: 7, speed: 150, wobble: 2, alpha: 1, hit: 'fire_plume' };
  return { tag: 'orbs', anim: true, scale: 1, step: 6, speed: 160, wobble: 1, alpha: 1, hit: 'impact' }; // Hyper Beam and other normal beams
}
const RING_SPRITE = {
  fire: { tag: 'small_ember', anim: true }, ice: { tag: 'ice_crystals', anim: true, scale: 1 }, water: { tag: 'small_bubbles', frame: 0 },
  spark: { tag: 'spark_2', frame: 1 }, psychic: { tag: 'gold_ring', rotate: true }, sound: { tag: 'noise_line', anim: true, rotate: true },
  quake: { tag: 'mud_sand__16x16', frame: 2 }, explosion: { tag: 'explosion', anim: true }, shine: { tag: 'sparkle_4', anim: true }, sludge: { tag: 'poison_bubble', anim: true },
};
const CLOUD = {
  smog: 'purple_gas_cloud', smoke: 'black_smoke', powder_blue: 'sleep_powder', powder_yellow: 'stun_spore', powder_purple: 'poison_powder',
  powder_green: 'spore', spikes: 'spikes', mist: 'mist_cloud', ember: 'small_ember', sludge: 'poison_bubble', vortex: 'water_orb',
};
const SWIPE_FX = {
  claw: 'scratch', cut: 'cut', impact: 'impact', fist: 'punch_impact', bite: 'sharp_teeth', vine: 'whip_hit', ghost: 'lick',
  wind: 'gust', bone: 'bone', fire: 'fire', spark: 'spark_2', psychic: 'gold_ring', ice: 'ice_crystals__16x16', water: 'water_impact',
  dragon: 'fire_plume', rock: 'rocks', quake: 'dirt_mound', sludge: 'poison_bubble', petal: 'pink_petal', sound: 'metal_sound_waves',
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
  const s = Math.max(0.5, Math.round((opts.scale || 1) * 2) / 2); // only x0.5 / x1 / x1.5...: odd scales mangle pixel art
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (opts.rot) ctx.rotate(opts.rot);
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  if (opts.flipX) ctx.scale(-1, 1);
  ctx.drawImage(im, f * e.frameW, 0, e.frameW, e.frameH, -e.frameW * s / 2, -e.frameH * s / 2, e.frameW * s, e.frameH * s);
  ctx.restore();
  return true;
}

// FireRed's overworld shadows (field_effects/shadow_*), picked by width; drawn see-through like the game does
const SHADOWS = [[10, 'shadow_small', 8, 8], [20, 'shadow_medium', 16, 8], [40, 'shadow_large', 32, 8], [1e9, 'shadow_extra_large', 64, 32]];
function shadow(ctx, x, y, w, a = 0.35) {
  const [, name, sw, sh] = SHADOWS.find(s => w * 2 <= s[0]);
  const im = img(`gfx/misc/field_effects/${name}.png`);
  if (!ready(im)) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), w, Math.max(2, w * 0.4), 0, 0, Math.PI * 2); ctx.fill(); return; }
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * Math.min(1, a * 1.6);
  ctx.drawImage(im, Math.round(x - sw / 2), Math.round(y - (name === 'shadow_extra_large' ? sh / 2 : sh / 2)));
  ctx.globalAlpha = ga;
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
  // darken everything outside the arena crop, with a soft one-tile edge stepped in 2px rings (like a GBA palette
  // fade) so the room doesn't look like a cut-out rectangle
  if (!opts.noMask) {
    const fw = (R.fullW || R.w) * TILE, fh = (R.fullH || R.h) * TILE, rw = R.w * TILE, rh = R.h * TILE;
    const A = 0.6, E = 16, X0 = -R.ox - 400, Y0 = -R.oy - 400, X1 = fw - R.ox + 400, Y1 = fh - R.oy + 400;
    ctx.fillStyle = `rgba(0,0,0,${A})`;
    ctx.fillRect(X0, Y0, X1 - X0, -E - Y0);
    ctx.fillRect(X0, rh + E, X1 - X0, Y1 - rh - E);
    ctx.fillRect(X0, -E, -E - X0, rh + 2 * E);
    ctx.fillRect(rw + E, -E, X1 - rw - E, rh + 2 * E);
    for (let d0 = 0; d0 < E; d0 += 2) {
      const d1 = d0 + 2;
      ctx.fillStyle = `rgba(0,0,0,${(A * d1 / (E + 2)).toFixed(3)})`;
      ctx.fillRect(-d1, -d1, rw + 2 * d1, 2); ctx.fillRect(-d1, rh + d0, rw + 2 * d1, 2);
      ctx.fillRect(-d1, -d0, 2, rh + 2 * d0); ctx.fillRect(rw + d0, -d0, 2, rh + 2 * d0);
    }
  }
  opts.overlay?.(ctx);
  // effects (clipped to the arena so storms and long beams don't paint over the darkened surroundings)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, R.w * TILE, R.h * TILE); ctx.clip();
  for (const v of w.vfx) if (v.kind !== 'tele' && v.kind !== 'afterimage' && !v.door && !v.noClip) drawVfx(ctx, v, w);
  ctx.restore();
  // door reward icons sit on the arena's edge (and float above it): never clipped
  for (const v of w.vfx) if (v.door || v.noClip) drawVfx(ctx, v, w);
  // health bars + status icons above enemies
  for (const a of w.actors) if (!a.dead && a.spawnT <= 0 && a.team !== 'player' && !a.boss && !a.captured) drawActorBar(ctx, a);
  // floating text: in world space only if the caller doesn't draw it on screen (drawWorldTexts)
  if (!opts.screenTexts) for (const tx of w.texts) {
    const k = tx.t / tx.life;
    const y = tx.y - (tx.label ? 10 * k : 18 * Math.sqrt(k));
    const alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    if (tx.label) text(ctx, tx.str, tx.x, y, { align: 'center', color: [tx.color, '#202020'], font: 'small', alpha });
    else text(ctx, tx.str, tx.x, y, { align: 'center', color: tx.color, font: tx.big ? 'normal' : 'small', alpha, scale: 1 });
  }
}

// Damage numbers and labels at 1x on screen (crisp and half the size of world-space text). cam = camera
// top-left in world px; the world is drawn at 2x.
export function drawWorldTexts(ctx, w, cam) {
  for (const tx of w.texts) {
    const k = tx.t / tx.life;
    const y = tx.y - (tx.label ? 8 * k : 14 * Math.sqrt(k));
    const alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    const sx = Math.round((tx.x + (tx.dx || 0) - cam.x) * 2), sy = Math.round((y - cam.y) * 2);
    if (tx.label) text(ctx, tx.str, sx, sy, { align: 'center', color: [tx.color, '#202020'], font: 'small', alpha });
    else text(ctx, tx.str, sx, sy, { align: 'center', color: [COLOR_HEX[tx.color] || tx.color, '#202020'], font: tx.big ? 'normal' : 'small', alpha });
  }
}
const COLOR_HEX = { red: '#ff6858', gold: '#f8d030', orange: '#f8a048', gray: '#c0c0c0', white: '#ffffff', green: '#78e878', blue: '#80b0ff', purple: '#d080f0' };

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
  if (a.status.sleep) for (let i = 0; i < 2; i++) { const k = (w.time * 0.9 + i * 0.5) % 1; drawBA(ctx, 'letter_z', a.x + 4 + k * 8, a.y - spriteTop(a) + 4 - k * 10, 0, { scale: 0.5, alpha: k < 0.8 ? 1 : (1 - k) / 0.2 }); } // Status_Sleep: Zs drift up and fade
  if (a.status.confuse || a.confused) drawBA(ctx, 'duck', a.x + Math.cos(w.time * 5) * 8, a.y - spriteTop(a) + 2, w.time, { anim: true, scale: 0.5 });
  if (a.status.para && Math.floor(w.time * 10) % 3 === 0) drawBA(ctx, 'spark_2', a.x + (Math.random() - 0.5) * a.r, a.y - 10 - Math.random() * a.r, 0, { frame: Math.floor(Math.random() * 3), scale: 0.5 });
  if (a.status.burn && Math.floor(w.time * 8) % 4 === 0) drawBA(ctx, 'small_ember', a.x + (Math.random() - 0.5) * a.r, a.y - 6 - Math.random() * a.r, w.time, { anim: true, scale: 0.5 });
  if (a.protect > 0) drawBA(ctx, 'protect', a.x, a.y - 10, 0, { scale: Math.max(0.4, a.r / 22), alpha: 0.6 });
  if (a.shieldHits > 0 && a.team === 'player') drawBA(ctx, 'protect', a.x, a.y - 10, 0, { scale: 0.5, alpha: 0.35 + 0.15 * Math.sin(w.time * 4) }); // Rebirth Shield: a faint Protect bubble
  if (a.seeded) drawBA(ctx, 'seed', a.x - 6, a.y - 4 - a.r, 0, { frame: 0, scale: 0.5 });
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

// FireRed HP bar, built like the GBA does: 8x8 tiles each holding 0-8 px of fill (ui/battle/hpbar_*_strip.png),
// drawn at 0.5 so one source pixel is one screen pixel. Status icon to the left (like the healthbox), the
// caught-ball mark when it's weak enough to catch, and stat-stage arrows.
export function drawHpTiles(ctx, x, y, tiles, frac, color) {
  const im = img(`gfx/ui/battle/hpbar_${color}_strip.png`);
  if (!ready(im)) { ctx.fillStyle = '#202820'; ctx.fillRect(x, y, tiles * 4, 4); ctx.fillStyle = color === 'red' ? '#f85838' : color === 'yellow' ? '#f8c838' : '#58d080'; ctx.fillRect(x, y + 1.5, tiles * 4 * frac, 1.5); return; }
  const px = Math.round(frac * tiles * 8);
  for (let i = 0; i < tiles; i++) { const f = Math.max(0, Math.min(8, px - i * 8)); ctx.drawImage(im, f * 8, 0, 8, 8, x + i * 4, y, 4, 4); }
}
function drawActorBar(ctx, a) {
  const tiles = Math.max(4, Math.min(8, Math.round(a.r * 2.4 / 4)));
  const w = tiles * 4;
  const x = Math.round(a.x - w / 2), y = Math.round(a.y - spriteTop(a) - 5);
  const frac = Math.max(0, a.hp / a.maxHp);
  drawHpTiles(ctx, x, y, tiles, frac, frac > 0.5 || a.team === 'ally' ? 'green' : frac > 0.2 ? 'yellow' : 'red');
  if (a.elite) drawBA(ctx, 'sparkle_4', x - 3, y + 2, 0, { frame: 1, scale: 0.5 });
  // catchable: the healthbox's caught-ball mark
  if (a.team === 'enemy' && !a.trainerMon && frac <= 0.45) { const im = img('gfx/ui/battle/ball_caught.png'); if (ready(im)) ctx.drawImage(im, x + w + 1, y, 4, 4); }
  // status icon (24x8) to the left of the bar
  const st = Object.keys(a.status).find(k => STATUS_ICON[k]);
  if (st) { const im = img(`gfx/ui/battle/status_${STATUS_ICON[st]}.png`); if (ready(im)) ctx.drawImage(im, x - 13, y, 12, 4); }
  // stat stages: FireRed's scroll arrows (up if any stat is raised, down if any is lowered)
  const up = ['atk', 'def', 'spe'].some(k => a.stages[k] > 0), down = ['atk', 'def', 'spe'].some(k => a.stages[k] < 0);
  if (up || down) { const im = img(`gfx/ui/cursors/scroll_${up ? 'up' : 'down'}.png`); if (ready(im)) ctx.drawImage(im, x + w + (frac <= 0.45 ? 6 : 1), y - 2, 8, 8); }
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
  else { const im = img('gfx/overworld/misc/item_ball.png'); if (ready(im)) ctx.drawImage(im, 0, 0, 16, 16, Math.round(k.x - 8), Math.round(y - 8), 16, 16); }
}

// A whirlpool (LUGIA's Whirlpool, Fire Spin...): a basin that's darkest in the middle, spiral arms of foam turning
// inward, spray being sucked in, and a churning rim. Fire vortexes use the same shape in flame colours.
function drawWhirlpool(ctx, z, w) {
  const fire = z.p?.type === 'FIRE' || z.fire;
  const rx = z.r, ry = z.r * 0.62, spin = w.time * 4.2;
  // a soft basin, darkest in the middle
  ctx.save(); ctx.translate(z.x, z.y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, rx);
  if (fire) { g.addColorStop(0, 'rgba(90,10,0,0.55)'); g.addColorStop(0.6, 'rgba(220,70,10,0.3)'); g.addColorStop(1, 'rgba(255,150,40,0)'); }
  else { g.addColorStop(0, 'rgba(10,30,90,0.6)'); g.addColorStop(0.6, 'rgba(40,110,210,0.35)'); g.addColorStop(1, 'rgba(120,190,255,0)'); }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Status_Whirlpool / Fire Spin: the move's own particles spiralling inward (water orbs blended, embers)
  for (let i = 0; i < 18; i++) {
    const life = (w.time * 0.55 + i / 18) % 1, r = rx * (1 - life * 0.85), a2 = i * 2.4 + spin + life * 5;
    drawBA(ctx, fire ? 'small_ember' : 'water_orb', z.x + Math.cos(a2) * r, z.y + Math.sin(a2) * r * (ry / rx) - 2, w.time + i * 0.1, { anim: true, scale: 0.5, alpha: (fire ? 0.9 : 0.6) * Math.min(1, (1 - life) * 3) });
  }
}

function drawZone(ctx, z, w) {
  const k = z.t / z.dur;
  const alpha = Math.min(1, z.t * 4) * (k > 0.8 ? (1 - k) / 0.2 : 1);
  const tag = CLOUD[z.sprite];
  const col = z.fxColor || (z.team === 'enemy' ? 'rgba(200,60,200,0.18)' : 'rgba(255,255,255,0.12)');
  ctx.globalAlpha = alpha;
  if (z.vortex) drawWhirlpool(ctx, z, w);
  else if (z.sprite === 'smoke' || z.blind) { // Smokescreen: FireRed's black smoke puffs (this used to skip the sprite)
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + w.time * 0.4; drawBA(ctx, 'black_smoke', z.x + Math.cos(a) * z.r * 0.5, z.y + Math.sin(a) * z.r * 0.35 - 4, 0, { scale: 1, alpha: 0.85 }); }
  } else {
    if (!tag) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); } // sprite clouds need no disc under them
    if (tag) {
      const n = Math.max(2, Math.round(z.r / 6));
      for (let i = 0; i < n; i++) {
        const a = i * 2.4 + z.t * (z.fire ? 0 : 0.8), rr = z.r * (0.25 + 0.55 * ((i * 37) % 10) / 10);
        drawBA(ctx, tag, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.6 - 4, z.t + i * 0.13, { anim: true, scale: z.fire ? 0.5 : 1, alpha: 0.9 });
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
      const fade = k > 0.7 ? (1 - k) / 0.3 : 1;
      const B = beamStyle(v);
      const c = Math.cos(v.ang), s2 = Math.sin(v.ang), lanes = v.width >= 12 ? [-v.width / 4, v.width / 4] : [0];
      const grow = Math.min(1, k / 0.15);
      for (const lane of lanes) for (let d = (w.time * B.speed) % B.step; d < v.len * grow; d += B.step) {
        const jit = Math.sin(d * 0.7 + w.time * 20) * B.wobble;
        drawBA(ctx, B.tag, v.x + c * d - s2 * (lane + jit), v.y + s2 * d + c * (lane + jit), w.time + d * 0.01, { anim: B.anim, frame: B.frame, scale: B.scale, alpha: fade * B.alpha, rot: B.rotate ? v.ang + (B.rotOff || 0) : 0 });
      }
      drawBA(ctx, B.hit, v.x + c * v.len, v.y + s2 * v.len, v.t, { anim: true, scale: 0.5, alpha: fade });
      break;
    }
    case 'bolt': {
      const a = 1 - k;
      if (v.big && v.heavy) { // THUNDER: a tall column of FireRed lightning that flickers, then an electric burst at the target
        const fl = k < 0.55 ? (Math.floor(v.t * 30) % 3 ? 1 : 0.5) : (1 - k) / 0.45;
        for (let i = 0; i < 6; i++) drawBA(ctx, 'lightning', v.x1 + (i % 2 ? 2 : -2), v.y1 - 16 - i * 30, v.t + i * 0.03, { anim: true, alpha: fl, flipX: i % 2 === 1 });
        for (let i = 0; i < 5; i++) { const an = i * 1.26 + v.t * 8; drawBA(ctx, 'spark_2', v.x1 + Math.cos(an) * 6, v.y1 - 8 + Math.sin(an) * 5, 0, { frame: (i + Math.floor(v.t * 20)) % 3, scale: 1, alpha: fl }); } // crackling sparks at the strike
        const rr = (v.r || 24) * (0.4 + 0.9 * Math.min(1, k * 1.6));
        for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2 + v.t * 2; drawBA(ctx, 'spark_2', v.x1 + Math.cos(an) * rr, v.y1 + Math.sin(an) * rr * 0.75 - 4, 0, { frame: i % 3, scale: 0.5, alpha: 1 - k }); }
        if (k < 0.5) { const im = img('gfx/misc/field_effects/ground_impact_dust.png'); if (ready(im)) for (const dx of [-10, 10]) ctx.drawImage(im, 0, Math.min(2, Math.floor(k * 6)) * 8, 16, 8, Math.round(v.x1 + dx - 8), Math.round(v.y1 - 4), 16, 8); }
      } else if (v.big) { // a lightning blessing proc: a short column
        for (let i = 0; i < 3; i++) drawBA(ctx, 'lightning', v.x1, v.y1 - 16 - i * 30, v.t + i * 0.04, { anim: true, alpha: a });
      } else { // Thunderbolt-style chain: spark tiles laid end to end along the arc
        const dx = v.x1 - v.x0, dy = v.y1 - v.y0, len = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
        v.jit ??= Array.from({ length: 16 }, () => (Math.random() - 0.5) * 6);
        for (let d = 0, i = 0; d < len; d += 7, i++) drawBA(ctx, 'spark__8x16', v.x0 + dx * d / len - Math.sin(ang) * v.jit[i % 16], v.y0 + dy * d / len + Math.cos(ang) * v.jit[i % 16], v.t + i * 0.03, { anim: true, fps: 16, rot: ang + Math.PI / 2, scale: 0.5, alpha: a });
        drawBA(ctx, 'spark_2', v.x1, v.y1, v.t, { frame: Math.floor(v.t * 20) % 3, scale: 0.5, alpha: a });
      }
      break;
    }
    case 'ring': {
      const r = v.r0 + (v.r1 - v.r0) * Math.sqrt(k);
      const RS = RING_SPRITE[v.fx];
      if (RS) { // ring of the move's particles (FireRed builds its bursts out of sprites, not lines)
        const n = Math.max(6, Math.min(16, Math.round(r / 5)));
        for (let i = 0; i < n; i++) { const an = i / n * Math.PI * 2 + (RS.spin ? v.t * 3 : 0); drawBA(ctx, RS.tag, v.x + Math.cos(an) * r, v.y + Math.sin(an) * r * 0.75 - 4, v.t + i * 0.05, { anim: RS.anim, frame: RS.frame, scale: RS.scale || 0.5, alpha: 1 - k, rot: RS.rotate ? an + Math.PI / 2 : 0 }); }
        if (v.fx === 'quake' && k < 0.5) drawBA(ctx, 'flying_dirt', v.x, v.y - 6, 0, { scale: Math.min(1.5, r / 32), alpha: (0.5 - k) * 2 });
        break;
      }
      const col = v.fx === 'wind' ? '220,240,255' : '255,255,255';
      ctx.strokeStyle = `rgba(${col},${(1 - k) * 0.9})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(v.x, v.y, r, r * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
      if (v.fx === 'quake' || v.fx === 'explosion') { ctx.fillStyle = `rgba(${col},${(1 - k) * 0.15})`; ctx.fill(); }
      if (v.fx === 'explosion' && k < 0.6) for (let i = 0; i < 5; i++) drawBA(ctx, 'explosion', v.x + Math.cos(i * 1.3) * r * 0.6, v.y + Math.sin(i * 1.3) * r * 0.45, v.t + i * 0.04, { anim: true });
      break;
    }
    case 'explode': {
      const tag = v.fx === 'lightning' ? null : v.type === 'WATER' ? 'water_impact' : v.type === 'FIRE' ? 'fire_plume' : v.type === 'ICE' ? 'ice_crystals__16x16' : v.type === 'POISON' ? 'poison_bubble' : v.type === 'ROCK' || v.type === 'GROUND' ? 'rocks' : v.type === 'PSYCHIC' ? 'gold_ring' : v.type === 'GHOST' || v.type === 'DARK' ? 'shadow_ball' : 'explosion';
      const s = v.r >= 26 ? 1 : 0.5;
      if (tag) drawBA(ctx, tag, v.x, v.y - 4, v.t, { anim: true, scale: s, alpha: 1 - k * 0.5, frame: tag === 'rocks' ? 3 : undefined });
      if (v.r >= 20) for (let i = 0; i < 6; i++) { const an = i * 1.05; drawBA(ctx, 'impact', v.x + Math.cos(an) * v.r * k, v.y + Math.sin(an) * v.r * 0.75 * k - 4, 0, { scale: 0.5, alpha: (1 - k) * 0.7 }); }
      break;
    }
    case 'puff': drawBA(ctx, 'impact', v.x, v.y, v.t, { scale: 0.4, alpha: 1 - k }); break;
    case 'shatter': for (let i = 0; i < 6; i++) drawBA(ctx, 'ice_crystals__8x16', v.x + Math.cos(i) * 20 * k, v.y + Math.sin(i * 1.7) * 14 * k, 0, { frame: i % 3, alpha: 1 - k }); break;
    case 'dust': { const im = img('gfx/misc/field_effects/ground_impact_dust.png'); if (ready(im)) { const f = Math.min(2, Math.floor(k * 3)); ctx.drawImage(im, 0, f * 8, 16, 8, Math.round(v.x - 8), Math.round(v.y - 6), 16, 8); } break; } // field_effects/ground_impact_dust: 3 frames of 16x8
    case 'sendout': {
      const r = (v.recall ? 1 - k : k) * 20;
      ctx.fillStyle = `rgba(255,255,255,${(1 - k) * 0.8})`; ctx.beginPath(); ctx.ellipse(v.x, v.y - 8, r, r, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) drawBA(ctx, 'sparkle_2', v.x + Math.cos(i * 0.8) * r * 1.4, v.y - 8 + Math.sin(i * 0.8) * r, v.t, { anim: true, scale: 0.5, alpha: 1 - k });
      break;
    }
    case 'heal': for (let i = 0; i < 5; i++) drawBA(ctx, 'sparkle_2', v.x + Math.cos(i * 1.3 + k * 4) * 10, v.y - 10 - k * 20 + i * 2, v.t, { anim: true, scale: 0.5, alpha: 1 - k }); break;
    case 'custom': v.draw?.(ctx, v, k); break;
    // Fire Blast: flames shoot out in the 大 shape, then a fireball core lingers
    case 'fireblast': {
      const arms = [-Math.PI / 2, Math.PI, 0, Math.PI * 0.75, Math.PI * 0.25];
      const reach = v.r * 1.3 * Math.min(1, k * 2.5), fade = k > 0.6 ? (1 - k) / 0.4 : 1;
      ctx.fillStyle = `rgba(255,190,80,${0.45 * fade})`; ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r * (0.5 + 0.5 * k), v.r * 0.75 * (0.5 + 0.5 * k), 0, 0, Math.PI * 2); ctx.fill();
      for (const ang of arms) for (let i = 1; i <= 3; i++) {
        const d = reach * i / 3;
        drawBA(ctx, 'fire_plume', v.x + Math.cos(ang) * d, v.y + Math.sin(ang) * d * 0.75 - 6, v.t + i * 0.05, { anim: true, scale: 0.9 - i * 0.12, alpha: fade });
      }
      drawBA(ctx, 'explosion', v.x, v.y - 6, v.t, { anim: true, scale: 1.4, alpha: fade });
      break;
    }
    // Blizzard: a frosty haze with wind-driven snow over the target area
    case 'blizzard': {
      const a = Math.min(1, v.t / 0.2, (v.life - v.t) / 0.35);
      const g = ctx.createRadialGradient(v.x, v.y, 4, v.x, v.y, v.r * 1.3);
      g.addColorStop(0, `rgba(220,240,255,${0.35 * a})`); g.addColorStop(1, 'rgba(220,240,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r * 1.3, v.r, 0, 0, Math.PI * 2); ctx.fill();
      const W2 = v.r * 2.6, H2 = v.r * 2;
      for (let i = 0; i < 28; i++) { // sBlizzardIceCrystalSpriteTemplate: crystals blown diagonally across
        const sx = ((i * 97.13 + v.t * (150 + (i % 5) * 25)) % W2) - W2 / 2, sy = ((i * 53.71 + v.t * (55 + (i % 3) * 20)) % H2) - H2 / 2;
        if ((sx * sx) / (W2 * W2 / 4) + (sy * sy) / (H2 * H2 / 4) > 1) continue;
        drawBA(ctx, i % 3 ? 'ice_crystals__8x16' : 'ice_crystals__16x16', v.x + sx, v.y + sy - 10, v.t + i * 0.07, { anim: true, fps: 10, scale: 0.5, alpha: a * 0.95, rot: 0.6 });
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
// (an ellipse matching the screen, so the sides aren't crushed while the top and bottom stay bright)
export function drawVignette(ctx, W, H, strength = 0.5) {
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(W / H, 1);
  const g = ctx.createRadialGradient(0, 0, H * 0.24, 0, 0, H * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, `rgba(0,0,0,${(strength * 0.4).toFixed(3)})`); g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g; ctx.fillRect(-H / 2, -H / 2, H, H);
  ctx.restore();
}

export { resolveAnim, pmdMeta, shadow };
