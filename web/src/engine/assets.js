// Image loading with a cache. img() returns an Image immediately; draw helpers skip it until loaded.
import { assetUrl } from '../game/assetpack.js';
const cache = new Map();
export const BASE = 'assets/';

export function img(path) {
  let im = cache.get(path);
  if (!im) {
    im = new Image();
    im.src = assetUrl(path); // a blob: URL when assets come from the signed-in asset packs
    im.onerror = () => { im._failed = true; };
    cache.set(path, im);
  }
  return im;
}
export const ready = (im) => im && im.complete && im.naturalWidth > 0;

export function preload(paths) {
  return Promise.all(paths.map(p => new Promise(res => {
    const im = img(p);
    if (ready(im) || im._failed) return res();
    im.addEventListener('load', res, { once: true });
    im.addEventListener('error', res, { once: true });
  })));
}

export function draw(ctx, path, x, y, opts = {}) {
  const im = typeof path === 'string' ? img(path) : path;
  if (!ready(im)) return false;
  const sx = opts.sx || 0, sy = opts.sy || 0;
  const sw = opts.sw || im.naturalWidth - sx, sh = opts.sh || im.naturalHeight - sy;
  const s = opts.scale || 1;
  const w = opts.w || sw * s, h = opts.h || sh * s;
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  if (opts.flip) { ctx.translate(Math.round(x) + w, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(im, sx, sy, sw, sh, 0, 0, w, h); }
  else ctx.drawImage(im, sx, sy, sw, sh, Math.round(x), Math.round(y), w, h);
  ctx.restore();
  return true;
}

// Tinted / silhouette copies of images (e.g. white flash, black silhouettes), cached.
const tintCache = new Map();
export function tinted(path, color, amount = 1) {
  const key = path + '|' + color + '|' + amount;
  if (tintCache.has(key)) return tintCache.get(key);
  const im = img(path);
  if (!ready(im)) return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = amount;
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  tintCache.set(key, c);
  return c;
}

export async function loadJSON(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error('fetch ' + path);
  return r.json();
}

// Paths
export const monPath = (folder, kind = 'front', shiny = false) => `gfx/pokemon/${folder}/${kind}${shiny ? '_shiny' : ''}.png`;
export const itemPath = (key) => `gfx/items/${key.toLowerCase()}.png`;
export const trainerPath = (pic) => `gfx/trainers/${pic}.png`;
export const typePath = (t) => `gfx/ui/types/${t}.png`;
