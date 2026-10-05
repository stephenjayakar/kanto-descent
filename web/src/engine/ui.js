// UI drawing helpers: panels, buttons, tooltips, bars, the animated background.
import { Engine, W, H, hover, clicked, inRect } from './core.js';
import { img, ready, draw } from './assets.js';
import { text, measure, wrap, lineHeight, COLORS } from './font.js';
import { Sound } from '../audio/sound.js';

export function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

export function roundRect(ctx, x, y, w, h, r, fill, stroke, lw = 1) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// Pixel-style rounded box (no anti-aliasing): chamfered corners.
export function pixBox(ctx, x, y, w, h, fill, border, r = 2) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (border) {
    ctx.fillStyle = border;
    ctx.fillRect(x + r, y, w - 2 * r, h);
    ctx.fillRect(x, y + r, w, h - 2 * r);
    if (r > 1) { ctx.fillRect(x + 1, y + 1, w - 2, h - 2); }
  }
  const b = border ? 1 : 0;
  ctx.fillStyle = fill;
  ctx.fillRect(x + r, y + b, w - 2 * r, h - 2 * b);
  ctx.fillRect(x + b, y + r, w - 2 * b, h - 2 * r);
  if (r > 1) ctx.fillRect(x + b + 1, y + b + 1, w - 2 * b - 2, h - 2 * b - 2);
}

export const THEME = {
  panel: '#2a3142', panelDark: '#1b2030', panelLight: '#3a4458', border: '#0d1018', ink: '#e8e8f0',
  chips: '#2f8cff', mult: '#ff3d3d', money: '#f8c838', play: '#2f8cff', discard: '#ff3d3d', green: '#38b048', orange: '#f09030',
};

export function panel(ctx, x, y, w, h, style = 'window') {
  if (style === 'window' || style === 'paper') return windowFrame(ctx, x, y, w, h, style === 'paper' ? 'std' : 'type1');
  if (style === 'inset') { pixBox(ctx, x, y, w, h, THEME.panelDark, THEME.border, 3); return; }
  pixBox(ctx, x, y, w, h, THEME.border, null, 4);
  pixBox(ctx, x + 1, y + 1, w - 2, h - 2, THEME.panelLight, null, 3);
  pixBox(ctx, x + 1, y + 2, w - 2, h - 3, THEME.panel, null, 3);
}

// FireRed's window-frame colours (gfx/ui/text_window/typeN.png): outline, light edge (top/left), middle ring,
// dark edge (bottom/right). Used for buttons and thin frames that are too small for the 9-slice windows.
export const FR_FRAMES = {
  type1: { o: '#293131', hi: '#8c8cce', mid: '#736b84', lo: '#4a4a6b' }, // the default purple-grey
  red: { o: '#293131', hi: '#e7a529', mid: '#d64229', lo: '#942108' },   // type3
  green: { o: '#293131', hi: '#8cde84', mid: '#4abd42', lo: '#089442' }, // type4
  blue: { o: '#293131', hi: '#84b5e7', mid: '#216bd6', lo: '#104a8c' },  // type5
  gold: { o: '#523100', hi: '#ffde52', mid: '#deb552', lo: '#946b10' },  // type6/9
  gray: { o: '#293131', hi: '#ffffff', mid: '#d6d6de', lo: '#b5b5c6' },  // type7
};
// the old Kanto Spire button colours -> a FireRed frame
const FRAME_OF = { '#38b048': 'green', '#2f8cff': 'blue', '#3060c0': 'blue', '#ff3d3d': 'red', '#c09020': 'gold', '#3a9a58': 'green', '#3a7a58': 'green' };
export function frameOf(color) { return FR_FRAMES[color] ? color : FRAME_OF[(color || '').toLowerCase()] || 'type1'; }

// A thin FireRed frame (3px: outline, light/dark bevel, middle ring) around a fill.
export function frBox(ctx, x, y, w, h, kind = 'type1', fill = '#ffffff') {
  const f = FR_FRAMES[kind] || FR_FRAMES.type1;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.fillStyle = f.o; ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = f.lo; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = f.hi; ctx.fillRect(x + 1, y + 1, w - 3, h - 3);
  ctx.fillStyle = f.mid; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = fill; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
}

// FireRed's red selection arrow (16x16 sheet, the arrow is 6x10 at its left), bobbing like the games' menus
export function frCursor(ctx, x, y, bob = true) {
  const im = img('gfx/ui/cursors/red_arrow.png');
  const dx = bob ? (Math.floor(Engine.time * 4) % 2) : 0;
  if (ready(im)) ctx.drawImage(im, Math.round(x) + dx, Math.round(y));
  else { ctx.fillStyle = '#e83018'; ctx.fillRect(Math.round(x) + dx, Math.round(y) + 3, 5, 7); }
}

// FireRed's title-screen backdrop (tools/extract_title_fixed.py): black, a teal band, the orange top stripe and the
// dark red bottom bar, stretched across the 768px screen at 2x. dim darkens it (records / co-op screens).
export function frBackdrop(ctx, opts = {}) {
  const band = opts.band ?? [60, 224];
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = opts.bandColor || '#41b4a4'; ctx.fillRect(0, band[0], W, band[1] - band[0]);
  if (opts.stripe !== false) { ctx.fillStyle = '#ff5a00'; ctx.fillRect(0, 0, W, 8); }
  if (opts.bar !== false) { ctx.fillStyle = '#8b0000'; ctx.fillRect(0, H - 20, W, 20); }
  if (opts.dim) { ctx.fillStyle = `rgba(0,0,0,${opts.dim})`; ctx.fillRect(0, 0, W, H); }
}

// FireRed text window frame (9-slice 24x24 with 8px borders); s = 2 draws it at the world's 2x scale.
export function windowFrame(ctx, x, y, w, h, kind = 'type1', s = 1) {
  const im = img(`gfx/ui/text_window/${kind}.png`);
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (!ready(im)) { pixBox(ctx, x, y, w, h, '#f8f8f8', '#506878', 3); return; }
  const c = 8, d = 8 * s;
  ctx.drawImage(im, c, c, 8, 8, x + d, y + d, w - 2 * d, h - 2 * d); // center
  ctx.drawImage(im, 0, 0, c, c, x, y, d, d);
  ctx.drawImage(im, 16, 0, c, c, x + w - d, y, d, d);
  ctx.drawImage(im, 0, 16, c, c, x, y + h - d, d, d);
  ctx.drawImage(im, 16, 16, c, c, x + w - d, y + h - d, d, d);
  ctx.drawImage(im, c, 0, 8, c, x + d, y, w - 2 * d, d);
  ctx.drawImage(im, c, 16, 8, c, x + d, y + h - d, w - 2 * d, d);
  ctx.drawImage(im, 0, c, c, 8, x, y + d, d, h - 2 * d);
  ctx.drawImage(im, 16, c, c, 8, x + w - d, y + d, d, h - 2 * d);
}

// A FireRed menu button: a thin window frame (its colour from opts.color / opts.frame), dark text, a pale fill under
// the mouse and the red arrow when focused (opts.focused, from FocusNav). Returns true when clicked (plays select).
export function button(ctx, label, x, y, w, h, opts = {}) {
  const disabled = !!opts.disabled;
  const hot = !disabled && hover(x, y, w, h);
  const down = hot && Engine.mouse.down;
  const kind = disabled ? 'gray' : opts.frame || frameOf(opts.color);
  frBox(ctx, x, y, w, h, kind, disabled ? '#e8e8e8' : down ? '#f0e8a8' : hot || opts.focused ? '#fff8d0' : opts.selected ? '#d6e7f7' : '#ffffff');
  const font = opts.font || (measure(label, 'normal') > w - 12 ? 'small' : 'normal');
  const lw = measure(label, font) + (opts.icon ? 18 : 0);
  const room = (w - lw) / 2;
  if (opts.focused && !disabled && room >= 22) frCursor(ctx, x + 5, y + Math.round((h - 16) / 2) + 1); // FireRed menus: the arrow at the left edge
  if (opts.icon) draw(ctx, opts.icon, x + w / 2 - lw / 2, y + (h - 16) / 2);
  const ty = y + Math.round((h - (font === 'small' ? 12 : 14)) / 2) - 1 + (down ? 1 : 0);
  text(ctx, label, x + w / 2 + (opts.icon ? 9 : 0), ty, { align: 'center', color: disabled ? 'gray' : opts.textColor || (opts.selected ? 'blue' : 'dark'), font });
  if (opts.sub) text(ctx, opts.sub, x + w / 2, y + h - 14, { align: 'center', color: 'dark', font: 'small' });
  const hit = !disabled && (clicked(x, y, w, h) || (opts.hotkey && Engine.pressed.has(opts.hotkey)));
  if (hit && !opts.silent) Sound.playSE('se_select');
  return hit;
}

export function shade(hex, amt) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt > 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// ---- tooltips -------------------------------------------------------------------------------
let tipQueue = null;
export function tip(title, body, opts = {}) { tipQueue = { title, body, ...opts }; }
export function drawTips(ctx) {
  if (!tipQueue) return;
  const t = tipQueue; tipQueue = null;
  const maxW = t.width || 170;
  const lines = t.body ? wrap(t.body, maxW - 12, 'small') : [];
  const tw = Math.max(t.title ? measure(t.title, 'normal') + 14 : 0, ...lines.map(l => measure(l, 'small') + 14), 60);
  const w = Math.min(maxW + 10, tw);
  const h = (t.title ? 18 : 4) + lines.length * 11 + 8 + (t.extraH || 0);
  let x = (t.x ?? Engine.mouse.x + 10), y = (t.y ?? Engine.mouse.y + 10);
  if (x + w > W - 2) x = W - 2 - w;
  if (y + h > H - 2) y = Math.max(2, (t.y ?? Engine.mouse.y) - h - 6);
  frBox(ctx, x, y, w, h, 'gray', '#ffffff');
  if (t.accent) rect(ctx, x + 3, y + 3, w - 6, 2, t.accent);
  let cy = y + 4;
  if (t.title) { text(ctx, t.title, x + 6, cy, { color: t.titleColor || 'dark' }); cy += 16; }
  for (const l of lines) { text(ctx, l, x + 6, cy, { font: 'small', color: 'dark' }); cy += 11; }
  if (t.extra) t.extra(ctx, x + 6, cy);
}

// ---- bars -----------------------------------------------------------------------------------
export function hpBar(ctx, x, y, w, frac, h = 3) {
  frac = Math.max(0, Math.min(1, frac));
  const col = frac > 0.5 ? ['#70f8a8', '#58d080'] : frac > 0.2 ? ['#f8e038', '#c8a808'] : ['#f85838', '#a84048'];
  rect(ctx, x - 1, y - 1, w + 2, h + 2, '#384040');
  rect(ctx, x, y, w, h, '#506858');
  const fw = Math.round(w * frac);
  if (fw > 0) { rect(ctx, x, y, fw, h, col[1]); rect(ctx, x, y, fw, Math.max(1, h - 1), col[0]); }
}

export function bar(ctx, x, y, w, h, frac, color, bg = '#20242e') {
  rect(ctx, x, y, w, h, bg);
  rect(ctx, x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h, color);
}

// ---- animated swirl background (Balatro-style, pixelated) --------------------------------------
let bgCanvas = null, bgCtx = null, bgData = null;
const BW = 160, BH = 90;
export function swirlBackground(ctx, palette = ['#1d3b2a', '#2f6b45', '#183024'], speed = 1) {
  if (!bgCanvas) {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = BW; bgCanvas.height = BH;
    bgCtx = bgCanvas.getContext('2d');
    bgData = bgCtx.createImageData(BW, BH);
  }
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [a, b, c] = palette.map(hex);
  const t = Engine.time * 0.25 * speed;
  const p = bgData.data;
  let i = 0;
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const u = (x - BW / 2) / BH, v = (y - BH / 2) / BH;
      const r = Math.sqrt(u * u + v * v);
      const ang = Math.atan2(v, u) + r * 3.2 - t * 0.6;
      let s = Math.sin(ang * 3 + Math.sin(r * 6 - t) * 1.2) * 0.5 + 0.5;
      s = s * 0.7 + 0.3 * (Math.sin(u * 7 + t * 1.3) * Math.cos(v * 5 - t) * 0.5 + 0.5);
      // quantize for a pixel-art banding look
      const q = Math.floor(s * 5) / 4;
      let col;
      if (q < 0.5) { const k = q * 2; col = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
      else { const k = (q - 0.5) * 2; col = [b[0] + (c[0] - b[0]) * k, b[1] + (c[1] - b[1]) * k, b[2] + (c[2] - b[2]) * k]; }
      p[i++] = col[0]; p[i++] = col[1]; p[i++] = col[2]; p[i++] = 255;
    }
  }
  bgCtx.putImageData(bgData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bgCanvas, 0, 0, W, H);
}

export const BG_THEMES = {
  grass: ['#16301f', '#2c5e3c', '#1c3d2a'],
  cave: ['#2a2218', '#4e3e2a', '#33291c'],
  boss: ['#3a1018', '#7a2030', '#4a1420'],
  shop: ['#1a2440', '#2c4078', '#1e2a50'],
  center: ['#3a1830', '#7a3060', '#4a2040'],
  title: ['#401010', '#902820', '#581810'],
  map: ['#1a2a38', '#2a4a5e', '#1e3444'],
  event: ['#2a1a40', '#4a3078', '#2e2050'],
  gold: ['#3a3010', '#7a6020', '#4a3c14'],
  dark: ['#101018', '#202434', '#141820'],
  water: ['#10283a', '#20507a', '#183850'],
};
