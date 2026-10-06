// Overlays (dialogue, choice cards, menus) and small drawing helpers, FireRed styled.
import { Engine, W, H, pushOverlay, popOverlay, hover, inRect } from '../engine/core.js';
import { img, ready, draw } from '../engine/assets.js';
import { text, measure, wrap } from '../engine/font.js';
import { windowFrame, pixBox, rect, frBox, frCursor } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { TYPE_COLORS } from '../game/data.js';
import { Coop } from '../game/coop.js';


export const ICON = {
  item: k => `gfx/items/${k.toLowerCase()}.png`,
  type: t => `gfx/ui/types/${t}.png`,
  portrait: (dex, e = 'Normal') => `pmd/${dex}/portrait_${e}.png`,
  ow: name => `gfx/overworld/people/${name}.png`,
};

export function drawPortrait(ctx, dex, x, y, emotion = 'Normal', scale = 1) {
  let im = img(ICON.portrait(dex, emotion));
  if (im._failed) im = img(ICON.portrait(dex, 'Normal'));
  frBox(ctx, x - 3, y - 3, 40 * scale + 6, 40 * scale + 6, 'type1', '#ffffff');
  if (ready(im)) ctx.drawImage(im, x, y, 40 * scale, 40 * scale);
}

// Wrap text into at most maxLines lines; a cut-off last line ends in '…' (descriptions never spill out of a card).
export function fitLines(str, maxW, maxLines, font = 'small') {
  const lines = wrap(str || '', maxW, font);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  let last = out[maxLines - 1] + '…';
  while (last.length > 1 && measure(last, font) > maxW) last = last.slice(0, -2).trimEnd() + '…';
  out[maxLines - 1] = last;
  return out;
}

// FireRed's bobbing "more text" arrow (4 frames of 10x12)
function advanceArrow(ctx, x, y) {
  const im = img('gfx/ui/cursors/text_advance_arrow.png');
  if (ready(im)) ctx.drawImage(im, (Math.floor(Engine.time * 6) % 4) * 10, 0, 10, 12, x, y, 10, 12);
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
    this.hidesHud = true; // the room skips its HUD under a dialogue box
  }
  enter() { Input.clear(); }
  update(dt) {
    Input.poll(); if (Coop.menuP2) Coop.remote.poll();
    const L = this.lines[this.i];
    this.chars += dt * 70;
    if (confirmPressed() || (Coop.menuP2 && Coop.remote.justPressed('confirm'))) {
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
    if (dex) drawPortrait(ctx, dex, bx + 7, by - 49, L.emotion || 'Normal');
    else if (pic) { const im = img(pic); frBox(ctx, bx + 3, by - 71, 70, 70, 'type1', '#ffffff'); if (ready(im)) ctx.drawImage(im, bx + 6, by - 68, 64, 64); }
    windowFrame(ctx, bx, by, bw, bh, 'std');
    const name = L.name ?? this.opts.name;
    const nx = dex ? 54 : pic ? 78 : 4;
    if (name) { frBox(ctx, bx + nx, by - 19, measure(name) + 18, 21, 'type1', '#ffffff'); text(ctx, name, bx + nx + 9, by - 16, { color: 'blue' }); }
    // the whole text is wrapped first so words don't jump lines as they type out
    const all = wrap(L.text, bw - 32);
    let left = Math.floor(this.chars);
    all.slice(0, 3).forEach((ln, i) => { const part = ln.slice(0, Math.max(0, left)); left -= ln.length + 1; if (part) text(ctx, part, bx + 14, by + 10 + i * 15, { color: 'dark' }); });
    if (this.chars >= L.text.length) advanceArrow(ctx, bx + bw - 24, by + bh - 20);
  }
}
export function say(lines, opts = {}) { return new Promise(res => pushOverlay(new Dialog(lines, { ...opts, onDone: res }))); }

// ---- Hades-style choice cards. cards: [{title, sub, desc, icon, color, accent, badge, portrait}]
export class Choice {
  // opts.custom = { view(c), layout(c), draw(ctx, c) } replaces the card list with another look (the POKé MART) but keeps
  // the same input, scrolling and interface (the sim and autoplay bots drive Choice overlays).
  constructor(title, cards, opts = {}) { this.title = title; this.cards = cards; this.opts = opts; this.sel = opts.start || 0; this.t = 0; this.scroll = 0; this.hidesHud = opts.hidesHud ?? true; } // the dimmed HUD would sit under the footer and SKIP
  enter() { Input.clear(); this.p2 = Coop.menuP2; Sound.playSE('se_win_open'); }
  update(dt) {
    const I = this.p2 ? Coop.remote : Input;
    I.poll(); this.t += dt;
    const n = this.cards.length;
    let moved = false;
    if (I.justPressed('up')) { this.sel = (this.sel + n - 1) % n; Sound.playSE('se_select'); moved = true; }
    if (I.justPressed('down')) { this.sel = (this.sel + 1) % n; Sound.playSE('se_select'); moved = true; }
    const V = this.view();
    if (V.max > 0) {
      if (Engine.mouse.wheel) this.scroll += Engine.mouse.wheel * 40;
      if (moved) { // keep the selected card on screen
        const top = this.sel * (V.ch + V.gap), bot = top + V.ch;
        if (top < this.scroll) this.scroll = top;
        if (bot > this.scroll + V.h) this.scroll = bot - V.h;
      }
      this.scroll = Math.max(0, Math.min(V.max, this.scroll));
    }
    const L = this.layout();
    const vis = r => r.y + r.h > V.y0 && r.y < V.y0 + V.h;
    if (!this.p2) L.forEach((r, i) => { if (vis(r) && inRect(r.x, r.y, r.w, r.h) && (Engine.mouse.x !== this.mx || Engine.mouse.y !== this.my)) this.sel = i; });
    this.mx = Engine.mouse.x; this.my = Engine.mouse.y;
    let pick = -1;
    const skip = this.opts.canSkip && this.skipRect();
    if (I.justPressed('confirm') && this.t > 0.4) pick = this.sel;
    if (Engine.mouse.clicked && this.t > 0.4 && !this.p2) L.forEach((r, i) => { if (vis(r) && inRect(r.x, r.y, r.w, r.h)) pick = i; });
    if (pick >= 0 && !this.cards[pick].disabled) {
      Sound.playSE('se_select');
      popOverlay(this); this.opts.onPick?.(pick, this.cards[pick]);
    } else if (pick >= 0) Sound.playSE('se_failure');
    else if (skip && (I.justPressed('back') || (!this.p2 && Engine.mouse.clicked && this.t > 0.4 && inRect(skip.x, skip.y, skip.w, skip.h)))) { Sound.playSE('se_select'); popOverlay(this); this.opts.onPick?.(-1, null); }
  }
  // the scrolling window the cards live in (scroll only when they don't fit)
  view() {
    if (this.opts.custom) return this.opts.custom.view(this);
    const n = this.cards.length, ch = this.opts.cardH || 62, gap = 8;
    const total = n * ch + (n - 1) * gap;
    const y0 = Math.max(this.opts.top ?? 70, (H - total) / 2 + 14);
    const h = Math.min(total, H - 38 - y0); // stop above the footer line and the SKIP button
    return { y0, h, ch, gap, total, max: Math.max(0, total - h) };
  }
  layout() {
    if (this.opts.custom) return this.opts.custom.layout(this);
    const V = this.view(), cw = 460;
    const x = this.opts.side ? W - cw - 16 : (W - cw) / 2;
    return this.cards.map((c, i) => ({ x, y: V.y0 + i * (V.ch + V.gap) - this.scroll, w: cw, h: V.ch }));
  }
  skipRect() { const label = (this.opts.skipLabel || 'SKIP (X)').replace('(X)', `(${Input.label('back')})`), w = measure(label, 'small') + 18; return { x: W - w - 10, y: H - 30, w, h: 22, label }; }
  draw(ctx) {
    if (this.opts.custom) return this.opts.custom.draw(ctx, this);
    const k = Math.min(1, this.t * 5);
    ctx.fillStyle = `rgba(8,10,20,${0.62 * k})`; ctx.fillRect(0, 0, W, H);
    const V = this.view(), L = this.layout();
    this.opts.drawTop?.(ctx);
    this.opts.side?.(ctx, this);
    const cx = L[0].x + L[0].w / 2;
    if (this.opts.header) this.opts.header(ctx, V.y0 - 8, cx);
    else { const tw = Math.min(W - 40, measure(this.title) + 36); windowFrame(ctx, Math.round(cx - tw / 2), V.y0 - 42, Math.round(tw), 30, 'type1'); text(ctx, this.title, cx, V.y0 - 34, { align: 'center', color: 'dark' }); }
    ctx.save();
    if (V.max > 0) { ctx.beginPath(); ctx.rect(0, V.y0 - 2, W, V.h + 4); ctx.clip(); }
    this.cards.forEach((c, i) => {
      const r = L[i], sel = i === this.sel;
      if (r.y + r.h < V.y0 - 2 || r.y > V.y0 + V.h + 2) return;
      const dx = (1 - k) * (i % 2 ? 40 : -40);
      drawCard(ctx, c, r.x + dx + (sel ? 0 : 6), r.y, r.w, r.h, sel);
    });
    ctx.restore();
    if (V.max > 0) { // scrollbar
      const x = L[0].x + L[0].w + 6, barH = Math.max(16, V.h * V.h / V.total), barY = V.y0 + (V.h - barH) * (this.scroll / V.max);
      rect(ctx, x, V.y0, 3, V.h, '#ffffff22'); rect(ctx, x, barY, 3, barH, '#f8d038');
    }
    if (this.opts.footer) text(ctx, this.opts.footer, cx, H - 24, { align: 'center', color: 'whiteSoft', font: 'small' });
    // whose pick this is (Coop.drawingP2: the guest's own view, where P2's menus are simply theirs)
    const who = Coop.drawingP2 ? (this.p2 ? `YOUR PICK  ·  ${Input.usingPad ? 'D-pad' : 'arrows'} + ${Input.label('confirm')}${this.opts.canSkip ? `, ${Input.label('back')} to skip` : ''}` : 'PLAYER 1 IS CHOOSING...')
      : this.p2 ? `PLAYER 2 (${Coop.guest?.name || 'P2'}) CHOOSES  ·  arrows + Enter/Z, X to skip` : null;
    if (who) { const tw = measure(who, 'small') + 16; frBox(ctx, Math.round(W / 2 - tw / 2), 4, tw, 20, this.p2 ? 'blue' : 'gold', '#ffffff'); text(ctx, who, W / 2, 7, { align: 'center', font: 'small', color: this.p2 ? 'blue' : 'dark' }); }
    if (this.opts.canSkip) {
      const b = this.skipRect(), on = inRect(b.x, b.y, b.w, b.h);
      frBox(ctx, b.x, b.y, b.w, b.h, 'type1', on ? '#fff8d0' : '#ffffff');
      text(ctx, b.label, b.x + b.w / 2, b.y + 4, { align: 'center', font: 'small', color: 'dark' });
    }
  }
}
// One choice card, FireRed style: a thin window frame with the card's accent as a stripe down its left side, the
// picture (portrait / item / type), title + sub + badge on the first row and the description below, wrapped to the
// lines that fit (cut with '…', never spilling out). Selected: a pale fill and FireRed's red arrow on its left.
export function drawCard(ctx, c, x, y, w, h, sel, opts = {}) {
  x = Math.round(x); y = Math.round(y);
  frBox(ctx, x, y, w, h, 'type1', c.disabled ? '#ececec' : sel ? '#fff8d8' : '#ffffff');
  rect(ctx, x + 3, y + 3, 3, h - 6, c.accent || '#736b84');
  if (sel && opts.arrow !== false) frCursor(ctx, x - 17, y + Math.round(h / 2) - 6);
  let tx = x + 14;
  if (c.portrait) {
    const py = y + Math.round((h - 40) / 2);
    if (h >= 52) { drawPortrait(ctx, c.portrait, x + 14, py, c.emotion || 'Normal'); tx = x + 64; }
    else { const im = img(ICON.portrait(c.portrait, c.emotion || 'Normal')); if (ready(im)) ctx.drawImage(im, x + 10, py, 40, 40); tx = x + 56; }
  } else if (c.icon) { const im = img(c.icon); if (ready(im)) ctx.drawImage(im, x + 12, y + Math.round((h - im.naturalHeight) / 2)); tx = x + (ready(im) && im.naturalWidth > 24 ? 50 : 42); }
  const right = x + w - 8;
  let bw = 0;
  if (c.badge) { bw = measure(c.badge, 'small') + 8; pixBox(ctx, right - bw, y + 5, bw, 13, c.badgeColor || '#3060c0', null, 2); text(ctx, c.badge, right - bw + 4, y + 5, { font: 'small', color: 'white' }); bw += 6; }
  const tw = measure(c.title);
  text(ctx, c.title, tx, y + 4, { color: c.titleColor || 'dark' });
  if (c.sub) {
    const sx = tx + tw + 8, avail = right - bw - sx;
    let s = c.sub;
    while (s.length > 1 && measure(s, 'small') > avail) s = s.slice(0, -2).trimEnd() + '…';
    if (avail > 24) text(ctx, s, sx, y + 5, { font: 'small', color: c.subColor || 'blue' });
  }
  const maxLines = Math.max(1, Math.floor((h - 3 - 19 - 12) / 11) + 1);
  fitLines(c.desc, right - tx - 2 - (c.icon2 ? 28 : 0), maxLines).forEach((ln, j) => text(ctx, ln, tx, y + 19 + j * 11, { font: 'small', color: c.disabled ? 'gray' : 'dark' }));
  if (c.icon2) { const im = img(c.icon2); if (ready(im)) ctx.drawImage(im, x + w - 30, y + h - 30); }
}

// Co-op: both players pick from their own cards at the same time (left: player 1 with this keyboard/mouse,
// right: player 2 with the guest's controller). Resolves [pick1, pick2] once both chose (-1 = skipped).
export class DualChoice {
  constructor(sides, opts = {}) { this.sides = sides.map(s => ({ ...s, sel: 0, pick: s.cards.length ? null : -1 })); this.opts = opts; this.t = 0; this.hidesHud = true; }
  enter() { Input.clear(); Coop.remote.clear(); Sound.playSE('se_win_open'); }
  // col: the column side i is drawn in (the guest's view swaps them: its own picks on the left, like player 1's)
  rects(i, col = i) { const cw = 356, ch = 66, x = col === 0 ? 24 : W - 8 - cw; return this.sides[i].cards.map((c, j) => ({ x, y: 96 + j * (ch + 6), w: cw, h: ch })); }
  update(dt) {
    this.t += dt; Input.poll(); Coop.remote.poll();
    this.sides.forEach((s, i) => {
      if (s.pick !== null) return;
      const I = i === 0 ? Input : Coop.remote, n = s.cards.length;
      if (I.justPressed('up')) { s.sel = (s.sel + n - 1) % n; Sound.playSE('se_select'); }
      if (I.justPressed('down')) { s.sel = (s.sel + 1) % n; Sound.playSE('se_select'); }
      if (i === 0) this.rects(0).forEach((r, j) => { if (inRect(r.x, r.y, r.w, r.h) && (Engine.mouse.x !== this.mx || Engine.mouse.y !== this.my)) s.sel = j; });
      if (this.t < 0.4) return;
      const click = i === 0 && Engine.mouse.clicked && this.rects(0).some(r => inRect(r.x, r.y, r.w, r.h));
      if (I.justPressed('confirm') || click) { s.pick = s.sel; Sound.playSE('se_select'); }
      else if (I.justPressed('back')) { s.pick = -1; Sound.playSE('se_select'); }
    });
    this.mx = Engine.mouse.x; this.my = Engine.mouse.y;
    if (this.sides.every(s => s.pick !== null)) { popOverlay(this); this.opts.onDone?.(this.sides.map(s => s.pick)); }
  }
  draw(ctx) {
    const k = Math.min(1, this.t * 5);
    ctx.fillStyle = `rgba(8,10,20,${0.7 * k})`; ctx.fillRect(0, 0, W, H);
    this.opts.header?.(ctx);
    const allDone = this.sides.every(o => o.pick !== null);
    this.sides.forEach((s, i) => {
      const col = Coop.drawingP2 ? 1 - i : i, R = this.rects(i, col), cw = 356, x = col === 0 ? 24 : W - 8 - cw, half = cw / 2;
      text(ctx, s.title, x + 4, 80, { font: 'small', color: [i === 0 ? '#f8d030' : '#80d0ff', '#202020'] });
      if (!s.cards.length) text(ctx, s.empty || 'Nothing more to offer.', x + half, 150, { align: 'center', font: 'small', color: 'gray' });
      const done = s.pick !== null && s.cards.length && !allDone;
      s.cards.forEach((c, j) => drawCard(ctx, c, R[j].x, R[j].y, R[j].w, R[j].h, s.pick === null ? j === s.sel : j === s.pick, { arrow: !done || j === s.pick }));
      if (done) {
        ctx.fillStyle = 'rgba(8,10,20,0.45)'; ctx.fillRect(x, 92, cw, R.length * 72);
        const lbl = (s.pick >= 0 ? 'CHOSEN' : 'SKIPPED') + ' - waiting for the other player', tw = measure(lbl, 'small') + 18, ly = 92 + R.length * 36 - 10;
        frBox(ctx, x + half - tw / 2, ly, tw, 20, 'type1', '#ffffff');
        text(ctx, lbl, x + half, ly + 3, { align: 'center', font: 'small', color: 'dark' });
      }
      s.owned?.(ctx, x, 96 + Math.max(1, R.length) * 72 + 4, cw, s.pick === null ? s.sel : s.pick);
    });
    const foot = Coop.drawingP2 ? `Both pick at once.  You: ${Input.usingPad ? 'D-pad' : 'arrows'} + ${Input.label('confirm')} (${Input.label('back')} skips).  Player 1 picks on their side.`
      : this.opts.footer || 'Both pick at once.  P1: arrows + Enter (X skips).  P2: their own controls.';
    text(ctx, foot, W / 2, H - 14, { align: 'center', font: 'small', color: 'whiteSoft' });
  }
}
export function chooseBoth(sides, opts = {}) { return new Promise(res => pushOverlay(new DualChoice(sides, { ...opts, onDone: res }))); }

export function choose(title, cards, opts = {}) { return new Promise(res => pushOverlay(new Choice(title, cards, { ...opts, onPick: (i, c) => res(i) }))); }

// ---- announcements (trainer beaten, revived, curse lifted, boss phases): a FireRed sign window (std frame at 2x,
// like the map name popup) that drops in at the top centre. Area names use the map popup (scenes/transitions.js)
// and boss intros the VS mugshot.
export class Banner {
  constructor(title, sub, opts = {}) { this.title = title; this.sub = sub; this.t = 0; this.life = opts.life || 2.4; this.color = opts.color || '#f8d030'; }
  update(dt) { this.t += dt; return this.t < this.life; }
  draw(ctx) {
    const k = this.t / this.life, kin = Math.min(1, this.t / 0.14);
    const a = k > 0.85 ? (1 - k) / 0.15 : kin;
    const tw = measure(this.title, 'normal') * 2, sw = this.sub ? measure(this.sub) : 0;
    const w = Math.ceil((Math.max(tw, sw) + 44) / 4) * 4, h = this.sub ? 64 : 46;
    const x = Math.round((W - w) / 2), y = Math.round(H * 0.17 - (1 - kin) * 14);
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    ctx.save(); ctx.translate(x, y); ctx.scale(2, 2); windowFrame(ctx, 0, 0, w / 2, h / 2, 'std'); ctx.restore();
    rect(ctx, x + 10, y + 8, w - 20, 2, this.color); // the announcement's colour as a thin rule under the frame
    text(ctx, this.title, W / 2, y + 12, { align: 'center', color: 'dark', scale: 2 });
    if (this.sub) text(ctx, this.sub, W / 2, y + 42, { align: 'center', color: 'dark' });
    ctx.restore();
  }
}

export function typeBadge(ctx, type, x, y) { const im = img(ICON.type(type)); if (ready(im)) ctx.drawImage(im, x, y); else { pixBox(ctx, x, y, 32, 12, TYPE_COLORS[type] || '#888', null, 2); } }

export { hover };
