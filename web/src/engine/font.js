// FireRed bitmap font renderer (fonts.json + 2-channel R=fill/G=shadow atlases from the decomp).
import { BASE } from './assets.js';
import { assetUrl } from '../game/assetpack.js';

let META = null;
const atlases = {}; // font -> Image (rg)
const masks = {};   // font -> { fill, shadow } white masks (tinted by compositing)
const colored = new Map(); // key -> canvas

export const COLORS = {
  dark: ['#636363', '#d6d6ce'],
  white: ['#ffffff', '#636363'],
  whiteSoft: ['#f8f8f8', '#3a3a52'],
  gray: ['#a0a0a0', '#404050'],
  red: ['#e70808', '#ffbd73'],
  blue: ['#3152ce', '#a5c6f7'],
  green: ['#219c08', '#94f794'],
  gold: ['#f8d038', '#7a5a10'],
  chips: ['#4aa8ff', '#16305a'],
  mult: ['#ff4a4a', '#5a1616'],
  orange: ['#ff9c30', '#5a3010'],
  black: ['#202020', '#a0a0a0'],
  lime: ['#a8ff60', '#205010'],
  pink: ['#ff88c8', '#602040'],
  purple: ['#c890ff', '#402060'],
};

const ALIASES = { '"': '“', "'": '’', '`': '‘', '*': '·', '[': '(', ']': ')', '{': '(', '}': ')', '_': '-', '#': 'º', '~': '-', '@': 'º', '|': '!', '^': '·', '\\': '/' };

const loadImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

export async function loadFonts() {
  META = await (await fetch(BASE + 'gfx/fonts/fonts.json')).json();
  await Promise.all(Object.entries(META.fonts).map(async ([name, f]) => {
    // white fill/shadow masks (tools/font_masks.py), tinted by compositing; the R/G atlas is only a fallback
    const [fill, shadow] = await Promise.all([loadImg(assetUrl(`gfx/fonts/${name}_fill.png`)), loadImg(assetUrl(`gfx/fonts/${name}_shadow.png`))]);
    if (fill && shadow) masks[name] = { fill, shadow };
    else { const im = await loadImg(assetUrl('gfx/' + f.rg)); if (im) atlases[name] = im; }
  }));
}

// Tint a white mask with compositing only: no getImageData, which privacy settings (Firefox's
// fingerprinting protection, Brave...) blank or scramble, leaving all text invisible.
function tinted(mask, color) {
  const c = document.createElement('canvas');
  c.width = mask.naturalWidth; c.height = mask.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(mask, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}

function colorAtlas(font, fill, shadow) {
  const key = font + fill + shadow;
  if (colored.has(key)) return colored.get(key);
  const m = masks[font];
  if (m) {
    const c = document.createElement('canvas');
    c.width = m.fill.naturalWidth; c.height = m.fill.naturalHeight;
    const x = c.getContext('2d');
    if (shadow) x.drawImage(tinted(m.shadow, shadow), 0, 0);
    x.drawImage(tinted(m.fill, fill), 0, 0);
    colored.set(key, c);
    return c;
  }
  const src = atlases[font];
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width = src.naturalWidth; c.height = src.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const fc = hex(fill), sc = shadow ? hex(shadow) : null;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    if (p[i] > 128) { p[i] = fc[0]; p[i + 1] = fc[1]; p[i + 2] = fc[2]; p[i + 3] = 255; }
    else if (p[i + 1] > 128 && sc) { p[i] = sc[0]; p[i + 1] = sc[1]; p[i + 2] = sc[2]; p[i + 3] = 255; }
    else p[i + 3] = 0;
  }
  x.putImageData(d, 0, 0);
  colored.set(key, c);
  return c;
}

function codesFor(str) {
  const out = [];
  const cm = META.charMap;
  // Upper-case "POKéMON" style multi glyphs aren't needed; map chars individually.
  for (const ch0 of str) {
    let ch = ch0;
    if (ch === '→') { out.push(124); continue; }
    if (ch === '←') { out.push(123); continue; }
    if (ch === '↑') { out.push(121); continue; }
    if (ch === '↓') { out.push(122); continue; }
    if (ch === '—' || ch === '–') ch = '-';
    if (ch === '©') ch = 'º';
    if (ch === '$') ch = '¥';
    if (ch === '★') ch = '·';
    if (ch === '✓') ch = '·';
    if (ch === '⚔') ch = '!';
    if (cm[ch] === undefined && ALIASES[ch]) ch = ALIASES[ch];
    if (cm[ch] === undefined) {
      const up = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      ch = cm[up] !== undefined ? up : '?';
    }
    out.push(cm[ch]);
  }
  return out;
}

export function measure(str, font = 'normal', scale = 1) {
  if (!META) return str.length * 6 * scale;
  const f = META.fonts[font];
  const sp = font === 'normal' ? 0 : f.fontInfo.letterSpacing;
  let w = 0;
  for (const c of codesFor(String(str))) w += (f.glyphWidths[c] ?? 6) + sp;
  return w * scale;
}

export function lineHeight(font = 'normal', scale = 1) {
  if (!META) return 14 * scale;
  return (font === 'small' ? 12 : 14) * scale;
}

// opts: font, color (preset name or [fill, shadow]), align 'left'|'center'|'right', scale, alpha, shadow=false to drop shadow
export function text(ctx, str, x, y, opts = {}) {
  if (!META || str === undefined || str === null) return 0;
  str = String(str);
  const font = opts.font || 'normal';
  const scale = opts.scale || 1;
  const f = META.fonts[font];
  let [fill, shadow] = Array.isArray(opts.color) ? opts.color : (COLORS[opts.color || 'dark'] || COLORS.dark);
  if (opts.shadow === false) shadow = null;
  const atlas = colorAtlas(font, fill, shadow);
  if (!atlas) return 0;
  const width = measure(str, font, scale);
  let cx = x;
  if (opts.align === 'center') cx = x - width / 2;
  else if (opts.align === 'right') cx = x - width;
  cx = Math.round(cx); y = Math.round(y);
  const sp = font === 'normal' ? 0 : f.fontInfo.letterSpacing;
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  for (const c of codesFor(str)) {
    const gw = f.glyphWidths[c] ?? 6;
    const sx = (c % f.perRow) * f.cellW, sy = Math.floor(c / f.perRow) * f.cellH;
    ctx.drawImage(atlas, sx, sy, gw, f.cellH, cx, y, gw * scale, f.cellH * scale);
    cx += (gw + sp) * scale;
  }
  ctx.restore();
  return width;
}

export function wrap(str, maxW, font = 'normal', scale = 1) {
  const lines = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (measure(t, font, scale) > maxW && line) { lines.push(line); line = word; }
      else line = t;
    }
    lines.push(line);
  }
  return lines;
}

export function textBlock(ctx, str, x, y, maxW, opts = {}) {
  const lines = wrap(str, maxW, opts.font, opts.scale || 1);
  const lh = opts.lineHeight || lineHeight(opts.font, opts.scale || 1);
  lines.forEach((l, i) => text(ctx, l, x, y + i * lh, opts));
  return lines.length * lh;
}

// Fit text into width by switching to the small font, then truncating.
export function textFit(ctx, str, x, y, maxW, opts = {}) {
  let font = opts.font || 'normal';
  if (measure(str, font) > maxW && font === 'normal') font = 'small';
  let s = String(str);
  while (s.length > 1 && measure(s, font) > maxW) s = s.slice(0, -1);
  return text(ctx, s, x, y, { ...opts, font });
}
