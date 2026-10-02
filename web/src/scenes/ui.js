// Overlays (dialogue, choice cards, menus) and small drawing helpers, FireRed styled.
import { Engine, W, H, pushOverlay, popOverlay, hover, inRect } from '../engine/core.js';
import { img, ready, draw } from '../engine/assets.js';
import { text, measure, wrap } from '../engine/font.js';
import { windowFrame, pixBox, rect } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { TYPE_COLORS } from '../game/data.js';

export const ICON = {
  item: k => `gfx/items/${k.toLowerCase()}.png`,
  type: t => `gfx/ui/types/${t}.png`,
  portrait: (dex, e = 'Normal') => `pmd/${dex}/portrait_${e}.png`,
  ow: name => `gfx/overworld/people/${name}.png`,
};

export function drawPortrait(ctx, dex, x, y, emotion = 'Normal', scale = 1) {
  let im = img(ICON.portrait(dex, emotion));
  if (im._failed) im = img(ICON.portrait(dex, 'Normal'));
  pixBox(ctx, x - 2, y - 2, 40 * scale + 4, 40 * scale + 4, '#f8f8f8', '#283040', 2);
  if (ready(im)) ctx.drawImage(im, x, y, 40 * scale, 40 * scale);
}

// overworld NPC sprite (16x32 frames: down, up, left x3)
export function drawOW(ctx, name, x, y, dir = 'down', frame = 0) {
  const im = img(ICON.ow(name));
  if (!ready(im)) return;
  const fw = im.naturalHeight === 32 ? 16 : im.naturalHeight; // most are 16x32
  const fh = im.naturalHeight;
  const base = { down: 0, up: 1, left: 2, right: 2 }[dir] ?? 0;
  const f = frame ? 3 + base * 2 + ((frame - 1) % 2) : base; // 0-2 standing, then 2 walk frames per direction
  ctx.save();
  if (dir === 'right') { ctx.translate(Math.round(x + fw / 2), Math.round(y - fh)); ctx.scale(-1, 1); ctx.drawImage(im, f * fw, 0, fw, fh, 0, 0, fw, fh); }
  else ctx.drawImage(im, f * fw, 0, fw, fh, Math.round(x - fw / 2), Math.round(y - fh), fw, fh);
  ctx.restore();
}

function confirmPressed() { return Input.justPressed('confirm') || Engine.mouse.clicked; }

// ---- dialogue box with typewriter text. lines: string[] or [{text, portrait:dex, name, emotion}]
export class Dialog {
  constructor(lines, opts = {}) {
    this.lines = lines.map(l => typeof l === 'string' ? { text: l } : l);
    this.i = 0; this.chars = 0; this.opts = opts; this.done = false;
  }
  enter() { Input.clear(); }
  update(dt) {
    Input.poll();
    const L = this.lines[this.i];
    this.chars += dt * 70;
    if (confirmPressed()) {
      Engine.mouse.clicked = false;
      if (this.chars < L.text.length) this.chars = L.text.length;
      else {
        Sound.playSE('se_select');
        this.i++; this.chars = 0;
        if (this.i >= this.lines.length) { popOverlay(this); this.opts.onDone?.(); }
      }
    }
  }
  draw(ctx) {
    const L = this.lines[Math.min(this.i, this.lines.length - 1)];
    if (this.opts.dim) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H); }
    const bw = 520, bh = 64, bx = (W - bw) / 2, by = H - bh - 14;
    const dex = L.portrait ?? this.opts.portrait;
    const pic = L.pic ?? this.opts.pic;
    if (dex) drawPortrait(ctx, dex, bx + 6, by - 52, L.emotion || 'Normal');
    else if (pic) { const im = img(pic); pixBox(ctx, bx + 4, by - 70, 68, 68, '#f8f8f8', '#283040', 2); if (ready(im)) ctx.drawImage(im, bx + 6, by - 68, 64, 64); }
    windowFrame(ctx, bx, by, bw, bh, 'std');
    const name = L.name ?? this.opts.name;
    const nx = dex ? 56 : pic ? 76 : 8;
    if (name) { pixBox(ctx, bx + nx, by - 16, measure(name) + 14, 18, '#f8f8f8', '#283040', 2); text(ctx, name, bx + nx + 7, by - 14, { color: 'blue' }); }
    const shown = L.text.slice(0, Math.floor(this.chars));
    wrap(shown, bw - 30).slice(0, 3).forEach((ln, i) => text(ctx, ln, bx + 14, by + 10 + i * 16, { color: 'dark' }));
    if (this.chars >= L.text.length && Math.floor(Engine.time * 3) % 2 === 0) {
      const im = img('gfx/ui/cursors/text_advance_arrow.png');
      if (ready(im)) ctx.drawImage(im, 0, 0, 10, 12, bx + bw - 22, by + bh - 20, 10, 12);
    }
  }
}
export function say(lines, opts = {}) { return new Promise(res => pushOverlay(new Dialog(lines, { ...opts, onDone: res }))); }

// ---- Hades-style choice cards. cards: [{title, sub, desc, icon, color, accent, badge, portrait}]
export class Choice {
  constructor(title, cards, opts = {}) { this.title = title; this.cards = cards; this.opts = opts; this.sel = 0; this.t = 0; }
  enter() { Input.clear(); Sound.playSE('se_win_open'); }
  update(dt) {
    Input.poll(); this.t += dt;
    const n = this.cards.length;
    if (Input.justPressed('up')) { this.sel = (this.sel + n - 1) % n; Sound.playSE('se_select'); }
    if (Input.justPressed('down')) { this.sel = (this.sel + 1) % n; Sound.playSE('se_select'); }
    const L = this.layout();
    L.forEach((r, i) => { if (inRect(r.x, r.y, r.w, r.h) && (Engine.mouse.x !== this.mx || Engine.mouse.y !== this.my)) this.sel = i; });
    this.mx = Engine.mouse.x; this.my = Engine.mouse.y;
    let pick = -1;
    if (Input.justPressed('confirm') && this.t > 0.4) pick = this.sel;
    if (Engine.mouse.clicked && this.t > 0.4) L.forEach((r, i) => { if (inRect(r.x, r.y, r.w, r.h)) pick = i; });
    if (pick >= 0 && !this.cards[pick].disabled) {
      Sound.playSE('se_select');
      popOverlay(this); this.opts.onPick?.(pick, this.cards[pick]);
    } else if (pick >= 0) Sound.playSE('se_failure');
    if (this.opts.canSkip && Input.justPressed('back')) { popOverlay(this); this.opts.onPick?.(-1, null); }
  }
  layout() {
    const n = this.cards.length, cw = 460, ch = this.opts.cardH || 62, gap = 8;
    const total = n * ch + (n - 1) * gap;
    const y0 = Math.max(this.opts.top ?? 70, (H - total) / 2 + 14);
    return this.cards.map((c, i) => ({ x: (W - cw) / 2, y: y0 + i * (ch + gap), w: cw, h: ch }));
  }
  draw(ctx) {
    const k = Math.min(1, this.t * 5);
    ctx.fillStyle = `rgba(8,10,20,${0.62 * k})`; ctx.fillRect(0, 0, W, H);
    const L = this.layout();
    this.opts.drawTop?.(ctx);
    if (this.opts.header) this.opts.header(ctx, L[0].y - 8);
    else text(ctx, this.title, W / 2, L[0].y - 34, { align: 'center', color: 'white', scale: 2 });
    this.cards.forEach((c, i) => {
      const r = L[i], sel = i === this.sel;
      const dx = (1 - k) * (i % 2 ? 40 : -40);
      const x = r.x + dx + (sel ? 0 : 6);
      pixBox(ctx, x, r.y, r.w, r.h, sel ? '#fffef0' : '#e8e8e0', c.accent || '#283040', 3);
      if (sel) { rect(ctx, x + 2, r.y + 2, 4, r.h - 4, c.accent || '#f8d030'); }
      let tx = x + 12;
      if (c.portrait) { drawPortrait(ctx, c.portrait, x + 12, r.y + (r.h - 40) / 2, c.emotion || 'Normal'); tx = x + 62; }
      else if (c.icon) { const im = img(c.icon); if (ready(im)) ctx.drawImage(im, x + 12, r.y + (r.h - im.naturalHeight) / 2); tx = x + 44; }
      text(ctx, c.title, tx, r.y + 6, { color: c.titleColor || 'dark' });
      if (c.badge) { const bw = measure(c.badge, 'small') + 8; pixBox(ctx, x + r.w - bw - 8, r.y + 6, bw, 13, c.badgeColor || '#3060c0', null, 2); text(ctx, c.badge, x + r.w - bw - 4, r.y + 6, { font: 'small', color: 'white' }); }
      if (c.sub) text(ctx, c.sub, tx + measure(c.title) + 8, r.y + 7, { font: 'small', color: c.subColor || 'blue' });
      wrap(c.desc || '', r.w - (tx - x) - 12, 'small').slice(0, 3).forEach((ln, j) => text(ctx, ln, tx, r.y + 23 + j * 12, { font: 'small', color: c.disabled ? 'gray' : 'dark' }));
      if (c.icon2) { const im = img(c.icon2); if (ready(im)) ctx.drawImage(im, x + r.w - 28, r.y + r.h - 28); }
    });
    if (this.opts.footer) text(ctx, this.opts.footer, W / 2, H - 24, { align: 'center', color: 'whiteSoft', font: 'small' });
  }
}
export function choose(title, cards, opts = {}) { return new Promise(res => pushOverlay(new Choice(title, cards, { ...opts, onPick: (i, c) => res(i) }))); }

// ---- big banner text (area name, boss intro)
export class Banner {
  constructor(title, sub, opts = {}) { this.title = title; this.sub = sub; this.t = 0; this.life = opts.life || 2.4; this.color = opts.color || '#f8d030'; }
  update(dt) { this.t += dt; return this.t < this.life; }
  draw(ctx) {
    const k = this.t / this.life;
    const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
    const y = H * 0.3;
    ctx.globalAlpha = a * 0.75; ctx.fillStyle = '#000'; ctx.fillRect(0, y - 8, W, this.sub ? 58 : 40); ctx.globalAlpha = 1;
    ctx.fillStyle = this.color; ctx.globalAlpha = a; ctx.fillRect(0, y - 8, W, 2); ctx.fillRect(0, y + (this.sub ? 48 : 30), W, 2); ctx.globalAlpha = 1;
    text(ctx, this.title, W / 2, y, { align: 'center', color: 'white', scale: 2, alpha: a });
    if (this.sub) text(ctx, this.sub, W / 2, y + 30, { align: 'center', color: 'whiteSoft', alpha: a });
  }
}

export function typeBadge(ctx, type, x, y) { const im = img(ICON.type(type)); if (ready(im)) ctx.drawImage(im, x, y); else { pixBox(ctx, x, y, 32, 12, TYPE_COLORS[type] || '#888', null, 2); } }

export { hover };
