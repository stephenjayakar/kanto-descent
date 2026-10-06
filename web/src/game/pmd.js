// PMDCollab SpriteCollab animated sprites (fetched by tools/fetch_pmd.js into assets/pmd/<dex>/).
// anim.json: { anims: { Name: { file, frameW, frameH, frames, rows, durations[ticks @60fps], hitFrame... } } }
// Sheet rows are directions: Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft.
import { img, ready, BASE } from '../engine/assets.js';

const metas = new Map(); // dex -> anim.json (or a pending promise)
const tints = new Map();

export function loadPmd(dex) {
  if (metas.has(dex)) return metas.get(dex) instanceof Promise ? metas.get(dex) : Promise.resolve(metas.get(dex));
  const p = fetch(`${BASE}pmd/${dex}/anim.json`).then(r => r.json()).then(j => {
    metas.set(dex, j);
    for (const a of Object.values(j.anims)) img(`pmd/${dex}/${a.file}`);
    return j;
  }).catch(() => { metas.set(dex, null); return null; });
  metas.set(dex, p);
  return p;
}
export const pmdMeta = dex => { const m = metas.get(dex); return m instanceof Promise ? null : m; };
export function preloadPmd(dexes) { return Promise.all(dexes.map(loadPmd)); }

const FALLBACK = {
  Attack: ['Attack', 'Strike', 'Walk'], Strike: ['Strike', 'Attack', 'Walk'], Shoot: ['Shoot', 'Charge', 'Attack', 'Walk'],
  Charge: ['Charge', 'Shoot', 'Idle', 'Walk'], Hurt: ['Hurt', 'Idle', 'Walk'], Idle: ['Idle', 'Walk'], Walk: ['Walk', 'Idle'],
  Sleep: ['Sleep', 'Idle'], Pose: ['Pose', 'Charge', 'Idle'], Rotate: ['Rotate', 'Tumble', 'Attack', 'Walk'],
  Faint: ['Faint', 'Hurt', 'Idle'], Hop: ['Hop', 'Walk'], Double: ['Double', 'Attack'], Swing: ['Swing', 'Attack'],
};

export function resolveAnim(meta, name) {
  if (!meta) return null;
  for (const n of FALLBACK[name] || [name, 'Idle', 'Walk']) if (meta.anims[n]) return meta.anims[n];
  return Object.values(meta.anims)[0];
}

// Frame index for time t (seconds). loop=false clamps on the last frame.
export function frameAt(anim, t, loop = true, speed = 1) {
  const ticks = t * 60 * speed;
  const total = anim.durations.reduce((s, d) => s + d, 0);
  let k = loop ? ticks % total : Math.min(ticks, total - 0.001);
  for (let i = 0; i < anim.durations.length; i++) { k -= anim.durations[i]; if (k < 0) return i; }
  return anim.durations.length - 1;
}
export function animLength(meta, name) {
  const a = resolveAnim(meta, name);
  return a ? a.durations.reduce((s, d) => s + d, 0) / 60 : 0.3;
}

function tintSheet(path, color) {
  const key = path + color;
  if (tints.has(key)) return tints.get(key);
  const im = img(path);
  if (!ready(im)) return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  tints.set(key, c);
  return c;
}

// Draw centred on (x, y) = the sprite's ground anchor (frame centre in PMD sheets).
// opts: anim, dir (0-7), t, loop, alpha, tint (css colour, full silhouette), tintA, scale, frame (force),
//   outline (css colour: a 1-screen-pixel silhouette ring around the sprite, behind it), outlineW (world px, 0.5)
export function drawPmd(ctx, dex, x, y, opts = {}) {
  const meta = pmdMeta(dex);
  if (meta === undefined) loadPmd(dex);
  if (!meta) return false;
  const anim = resolveAnim(meta, opts.anim || 'Idle');
  if (!anim) return false;
  const path = `pmd/${dex}/${anim.file}`;
  const im = img(path);
  if (!ready(im)) return false;
  const f = opts.frame ?? frameAt(anim, opts.t || 0, opts.loop ?? true, opts.speed || 1);
  const row = anim.rows > 1 ? (opts.dir || 0) : 0;
  const fw = anim.frameW, fh = anim.frameH, s = opts.scale || 1;
  const dx = Math.round(x - (fw * s) / 2), dy = Math.round(y - (fh * s) / 2);
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  if (opts.outline) { // the silhouette nudged out in 8 directions, under the sprite
    const o = tintSheet(path, opts.outline), d = opts.outlineW || 0.5;
    if (o) for (const [ox, oy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, -d], [-d, d], [d, d]]) ctx.drawImage(o, f * fw, row * fh, fw, fh, dx + ox, dy + oy, fw * s, fh * s);
  }
  ctx.drawImage(im, f * fw, row * fh, fw, fh, dx, dy, fw * s, fh * s);
  if (opts.tint) {
    const t = tintSheet(path, opts.tint);
    if (t) { ctx.globalAlpha *= opts.tintA ?? 1; ctx.drawImage(t, f * fw, row * fh, fw, fh, dx, dy, fw * s, fh * s); }
  }
  ctx.restore();
  return true;
}

export function portraitPath(dex, emotion = 'Normal') { return `pmd/${dex}/portrait_${emotion}.png`; }
