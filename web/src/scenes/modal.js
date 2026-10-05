// Menu helpers for the title and records screens (ported from Kanto Spire's scenes/common.js and made
// keyboard/gamepad friendly): canvas modals, keyboard focus over ui.js buttons, and a scroll area.
import { Engine, W, H, popOverlay, inRect } from '../engine/core.js';
import { text, wrap, textBlock } from '../engine/font.js';
import { button, panel, rect, drawTips } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';

// ---- keyboard focus ---------------------------------------------------------------------------
// Buttons are registered while drawing (nav.button); update() moves the focus with the arrows / d-pad
// (to the nearest button in that direction) and activates it with confirm. Hovering focuses too.
export class FocusNav {
  constructor(first = null) { this.items = []; this.next = []; this.focus = first; this.mx = -1; this.my = -1; }
  // blocked: an overlay is open on top, so this screen's buttons must ignore the mouse
  begin(blocked = false) { this.next = []; this.blocked = blocked; }
  end() {
    if (!this.blocked) { this.mx = Engine.mouse.x; this.my = Engine.mouse.y; } // hover focuses only when the mouse moves
    this.items = this.next; if (!this.items.some(i => i.key === this.focus) && this.items.length) this.focus = this.items[0].key; }
  has(key) { return this.items.some(i => i.key === key); }
  button(ctx, key, label, x, y, w, h, opts, fn) {
    this.next.push({ key, x, y, w, h, fn, disabled: opts?.disabled });
    const m = Engine.mouse;
    let hit;
    if (this.blocked) {
      const saved = { x: m.x, y: m.y, clicked: m.clicked, down: m.down };
      m.x = m.y = -9999; m.clicked = m.down = false;
      try { hit = button(ctx, label, x, y, w, h, opts); } finally { Object.assign(m, saved); }
    } else {
      if ((m.x !== this.mx || m.y !== this.my) && inRect(x, y, w, h)) this.focus = key;
      hit = button(ctx, label, x, y, w, h, { ...opts, focused: key === this.focus }); // focus: pale fill + the red arrow
    }
    if (hit) fn?.();
    return hit;
  }
  // Call once per frame from update(), after Input.poll(). Returns true if it did something.
  update() {
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    for (const [d, v] of Object.entries(dirs)) {
      if (!Input.justPressed(d)) continue;
      const nk = spatialNext(this.items, this.focus, v);
      if (nk && nk !== this.focus) { this.focus = nk; Sound.playSE('se_select'); }
      return true;
    }
    if (Input.justPressed('confirm')) {
      const it = this.items.find(i => i.key === this.focus);
      if (it && !it.disabled) { Sound.playSE('se_select'); Input.clear(); it.fn?.(); return true; }
    }
    return false;
  }
}

export function focusRing(ctx, x, y, w, h) {
  const a = 0.65 + 0.35 * Math.sin(Engine.time * 8);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(x) - 2, Math.round(y) - 2, Math.round(w) + 4, Math.round(h) + 4);
  ctx.restore();
}

// The nearest item in direction v from the current one, within a 60-degree-ish cone (off-axis distance
// counts double). With nothing that way, wrap around to the furthest item on the other side.
function spatialNext(items, cur, v) {
  if (!items.length) return null;
  const c = items.find(i => i.key === cur);
  if (!c) return items[0].key;
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  let best = null, bestD = Infinity, wrapBest = null, wrapD = -Infinity;
  for (const it of items) {
    if (it === c) continue;
    const dx = it.x + it.w / 2 - cx, dy = it.y + it.h / 2 - cy;
    const along = dx * v[0] + dy * v[1], across = Math.abs(dx * v[1] - dy * v[0]);
    if (across > Math.abs(along) * 2) continue;
    if (along > 2) { const d = along + across * 2; if (d < bestD) { bestD = d; best = it; } }
    else if (along < -2) { const d = -along - across * 2; if (d > wrapD) { wrapD = d; wrapBest = it; } }
  }
  return (best || wrapBest || c).key;
}

// ---- modals ------------------------------------------------------------------------------------
export class Modal {
  constructor(opts) { Object.assign(this, opts); this.t = 0; this.nav = new FocusNav(this.focus || null); }
  enter() { Input.clear(); }
  update(dt) {
    this.t += dt;
    Input.poll();
    if (this.cancelable !== false && (Input.justPressed('back') || Engine.mouse.rclicked)) { this.close(null); return; }
    this.keys?.();
    if (this.t > 0.15) this.nav.update();
  }
  close(v) { popOverlay(this); this.onClose?.(v); }
  dim(ctx) { ctx.save(); ctx.globalAlpha = Math.min(0.6, this.t * 4); rect(ctx, 0, 0, W, H, '#000'); ctx.restore(); }
  // Draw buttons through these so the keyboard can reach them.
  btn(ctx, key, label, x, y, w, h, opts, fn) { return this.nav.button(ctx, key, label, x, y, w, h, opts, fn); }
}

// Pick one of several labelled options: { title, body, options: [{label, value, color}], onClose(value) }.
export class ChoiceModal extends Modal {
  draw(ctx) {
    this.dim(ctx);
    this.nav.begin();
    const w = this.w || 320, n = this.options.length, bh = 26;
    const bodyLines = this.body ? this.body.split('\n').flatMap(p => (p ? wrap(p, w - 24, 'small') : [''])) : [];
    const h = 50 + n * (bh + 4) + bodyLines.length * 11 + (bodyLines.length ? 9 : 0);
    const x = (W - w) / 2, y = (H - h) / 2;
    panel(ctx, x, y, w, h);
    text(ctx, this.title || '', W / 2, y + 9, { align: 'center', color: 'blue' });
    let cy = y + 29;
    for (const l of bodyLines) { text(ctx, l, x + 14, cy, { color: 'dark', font: 'small' }); cy += 11; }
    if (bodyLines.length) cy += 9;
    this.options.forEach((o, i) => {
      this.btn(ctx, 'o' + i, o.label, x + 20, cy, w - 40, bh, { color: o.color || '#506080' }, () => this.close(o.value));
      cy += bh + 4;
    });
    this.nav.end();
    drawTips(ctx);
  }
}

// ---- scrolling ---------------------------------------------------------------------------------
// A scrollable text area: mouse wheel, up/down (keys or d-pad), PageUp/PageDown, or drag (touch too).
// m is the object that keeps the scroll state; drawContent(y) draws from y and returns the end y.
export function scrollArea(ctx, m, x, top, w, bottom, drawContent) {
  const viewH = bottom - top;
  const maxScroll = Math.max(0, (m.contentH || 0) - viewH);
  const over = Engine.mouse.x >= x && Engine.mouse.x <= x + w && Engine.mouse.y >= top && Engine.mouse.y <= bottom;
  let sc = m.scroll || 0;
  if (over && Engine.mouse.wheel) sc += Engine.mouse.wheel * 24;
  if (Input.down('down')) sc += 4;
  if (Input.down('up')) sc -= 4;
  if (Engine.pressed.has('PageDown')) sc += viewH - 20;
  if (Engine.pressed.has('PageUp')) sc -= viewH - 20;
  if (Engine.mouse.justPressed && over) m.dragY = Engine.mouse.y;
  if (!Engine.mouse.down) m.dragY = null;
  if (m.dragY != null) { sc -= Engine.mouse.y - m.dragY; m.dragY = Engine.mouse.y; }
  m.scroll = Math.max(0, Math.min(maxScroll, sc));
  ctx.save();
  ctx.beginPath(); ctx.rect(x, top, w, viewH); ctx.clip();
  const end = drawContent(top - m.scroll);
  ctx.restore();
  m.contentH = end - (top - m.scroll);
  if (maxScroll > 0) {
    const barH = Math.max(16, viewH * viewH / m.contentH), barY = top + (viewH - barH) * (m.scroll / maxScroll);
    rect(ctx, x + w - 4, top, 3, viewH, '#d6d6de');
    rect(ctx, x + w - 4, barY, 3, barH, '#736b84');
    if (m.scroll < maxScroll) text(ctx, 'scroll for more (up/down)', x + w / 2, bottom + 9, { align: 'center', color: 'dark', font: 'small' });
  }
}

// Sections of notes: [[TITLE, [lines]]], drawn as bullets. Returns the end y.
export function drawSections(ctx, sections, x, y, w, opts = {}) {
  for (const [title, lines] of sections) {
    if (title) { text(ctx, title, x, y, { color: opts.titleColor || 'blue', font: 'small' }); y += 13; }
    for (const l of lines) y += textBlock(ctx, (title ? '· ' : '') + l, x + (title ? 6 : 0), y, w - 6, { color: 'dark', font: 'small', lineHeight: 11 }) + 3;
    y += 5;
  }
  return y;
}
