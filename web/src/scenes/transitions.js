// FireRed-style presentation for the room scene: the map name popup sign, the warp fade and battle wipes between
// rooms, and the boss mugshot ("VS") intro.
// Art: gfx/ui/map_popup/*, gfx/ui/mugshot/* (tools/extract_transition_gfx.py, from the decomp's text window and
// battle transition graphics) and gfx/misc/battle_transitions/*.
import { W, H, pushOverlay, popOverlay } from '../engine/core.js';
import { img, ready, tinted } from '../engine/assets.js';
import { text, measure, wrap } from '../engine/font.js';
import { pixBox, rect, windowFrame } from '../engine/ui.js';
import { Input } from '../engine/input.js';

const clamp01 = v => Math.max(0, Math.min(1, v));
const easeOut = k => 1 - (1 - k) * (1 - k);
const easeIn = k => k * k;

// ---------------------------------------------------------------- map name popup
// Task_MapNamePopup: the sign (std window tiles, text window palette 3) slides down 2px a frame for 12 frames,
// stays 120 frames, then slides back up. At rest its top border is off screen: the sign hangs from the top edge.
// Drawn at 2x like the world. A floor number ("SILPH CO. 5F") uses the 19-tile-wide sign.
const POPUP = { s: 2, slide: 0.2 };
export class MapPopup {
  constructor(name, opts = {}) {
    this.name = name; this.sub = opts.sub || ''; this.t = 0; this.hold = opts.hold ?? 2;
    this.wide = !!opts.wide || measure(name, 'normal') > 108;
  }
  get life() { return POPUP.slide * 2 + this.hold; }
  update(dt) { this.t += dt; return this.t < this.life; }
  // 0..1: how far the sign has slid down
  get k() { const t = this.t, sl = POPUP.slide; return t < sl ? t / sl : t > sl + this.hold ? 1 - (t - sl - this.hold) / sl : 1; }
  draw(ctx) {
    const s = POPUP.s, pos = Math.round(clamp01(this.k) * 12) * 2; // the GBA moves it in 2px steps
    const im = img(this.wide ? 'gfx/ui/map_popup/popup_floor.png' : 'gfx/ui/map_popup/popup.png');
    const iw = this.wide ? 152 : 112, y = (pos - 32) * s;
    if (pos <= 0) return;
    if (ready(im)) ctx.drawImage(im, 0, y, im.naturalWidth * s, im.naturalHeight * s);
    else pixBox(ctx, 0, y, (iw + 16) * s, 32 * s, '#ffffff', '#626262', 3);
    text(ctx, this.name, (8 + iw / 2) * s, y + 9 * s, { align: 'center', color: 'dark', scale: s });
    if (this.sub) { // the area's intro line under the sign (not FireRed's, but too good to lose)
      const a = clamp01(pos / 24);
      wrap(this.sub, 360, 'small').slice(0, 3).forEach((ln, i) => text(ctx, ln, 10, y + 32 * s + 4 + i * 12, { font: 'small', color: 'whiteSoft', alpha: a }));
    }
  }
}

// the region-map name of a map with its floor ("SILPH CO. 5F"), as GetMapName + MapNamePopupAppendFloorNum
export function popupName(areaName, map) {
  const f = map?.floor_number || 0;
  if (!f) return { name: areaName, wide: false };
  return { name: `${areaName} ${f === 127 ? 'ROOFTOP' : f < 0 ? `B${-f}F` : `${f}F`}`, wide: true };
}

// ---------------------------------------------------------------- warp fades and battle wipes
// Each draws the black that covers the screen at progress k (0 = nothing, 1 = all black), in screen space.
// o: { t: seconds since the wipe started, cx, cy: screen point the iris closes on }
const BALL = 'gfx/misc/battle_transitions/sliding_pokeball.png';
const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
export const WIPES = {
  // the plain warp fade (doors, stairs): FireRed fades the palette to black
  fade(ctx, k) { ctx.fillStyle = `rgba(0,0,0,${clamp01(k)})`; ctx.fillRect(0, 0, W, H); },
  // Task_Slice: alternate 2-line strips slide away to opposite sides
  slice(ctx, k) {
    const e = easeIn(clamp01(k)); ctx.fillStyle = '#000';
    for (let y = 0, i = 0; y < H; y += 4, i++) { const w = Math.ceil(W * e); if (i % 2) ctx.fillRect(W - w, y, w, 4); else ctx.fillRect(0, y, w, 4); }
  },
  // Task_PokeballsTrail: Poké Balls roll across in rows, alternating sides, trailing black
  pokeballs(ctx, k) {
    const rows = 7, rh = Math.ceil(H / rows), im = img(BALL);
    ctx.fillStyle = '#000';
    for (let r = 0; r < rows; r++) {
      const d = (r % 2 ? 0.12 : 0) + (r >> 1) * 0.04, p = clamp01((k - d) / (1 - 0.3));
      const x = -rh / 2 + p * (W + rh); // the ball's centre
      const ltr = r % 2 === 0, cx = ltr ? x : W - x, y = r * rh;
      if (ltr) ctx.fillRect(0, y, Math.max(0, cx), rh); else ctx.fillRect(cx, y, W - cx, rh);
      if (p > 0 && p < 1 && ready(im)) {
        ctx.save(); ctx.translate(Math.round(cx), Math.round(y + rh / 2)); ctx.rotate((ltr ? 1 : -1) * (x / (rh / 2)));
        ctx.drawImage(im, -rh / 2, -rh / 2, rh, rh); ctx.restore();
      }
    }
  },
  // Task_GridSquares: black squares grow out of a grid in a scattered order
  grid(ctx, k) {
    const c = 32; ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += c) for (let x = 0; x < W; x += c) {
      const s = Math.round(c * clamp01(k * 1.7 - hash(x, y) * 0.7) / 2) * 2;
      if (s > 0) ctx.fillRect(x + (c - s) / 2, y + (c - s) / 2, s, s);
    }
  },
  // Task_ClockwiseWipe: black sweeps round the screen from twelve o'clock
  clockwise(ctx, k) {
    const a = clamp01(k) * Math.PI * 2; if (a <= 0) return;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, W, -Math.PI / 2, -Math.PI / 2 + a); ctx.closePath(); ctx.fill();
  },
  // boss rooms: the battle intro blinks twice, then a circle closes on the player (BigPokeball's circular mask)
  boss(ctx, k, o) {
    if (k < 0.4) { const b = Math.sin(k / 0.4 * Math.PI * 2); ctx.fillStyle = `rgba(0,0,0,${0.7 * b * b})`; ctx.fillRect(0, 0, W, H); return; }
    const e = easeIn((k - 0.4) / 0.6), cx = o.cx ?? W / 2, cy = o.cy ?? H / 2;
    const r = (1 - e) * Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2, true); ctx.fill('evenodd');
  },
};
// how long each takes (s); rooms change often, so all of them are short
export const WIPE_TIME = { fade: 0.3, slice: 0.42, pokeballs: 0.5, grid: 0.42, clockwise: 0.42, boss: 0.8 };
export const BATTLE_WIPES = ['slice', 'pokeballs', 'grid', 'clockwise'];
export function drawWipe(ctx, kind, k, o = {}) { (WIPES[kind] || WIPES.fade)(ctx, k, o); }

// ---------------------------------------------------------------- boss mugshot
// FireRed's Elite Four / Champion mugshot transition (DoMugshotTransition): two banners sweep in from opposite
// sides with a wavy edge, the opponent slides in on the top one and the player on the bottom one, "VS", then the
// screen fades to white. Here the white then clears to the arena and the fight starts.
// o: { pal ('lance', 'bruno', ...), name, title, pic (trainer picture path) | portrait (dex), silhouette, playerDex, playerName }
const MUG = { band: 128, end: 2.15, white: 1.55, clear: 1.85 };
export class Mugshot {
  constructor(o) { this.o = o; this.t = 0; this.hidesHud = true; }
  enter() { Input.clear?.(); }
  update(dt) {
    Input.poll?.();
    this.t += dt;
    if (this.t > 0.8 && this.t < MUG.white && Input.justPressed('confirm')) this.t = MUG.white; // skippable once it's shown
    if (this.t >= MUG.end) { popOverlay(this); this.o.onDone?.(); }
  }
  draw(ctx) {
    const t = this.t, o = this.o, B = MUG.band, y0 = Math.round(H / 2 - B), y1 = y0 + B;
    if (t < MUG.clear) {
      const ban = img(`gfx/ui/mugshot/banner_${o.pal || 'lance'}.png`);
      const p = easeOut(clamp01(t / 0.32)); // the banners' leading edges
      const scroll = t * 90 + easeOut(clamp01(t / 0.32)) * 360;
      // top banner from the left, bottom from the right, wavy edges (Mugshot_ShowBanner's sine)
      for (let yy = 0; yy < B; yy += 4) {
        const wv = Math.sin((yy / 4 + t * 60) * 16 / 256 * Math.PI * 2) * 16;
        const xe = Math.min(W, Math.max(0, p * (W + 32) + wv));
        this.bandRow(ctx, ban, 16 + yy / 2, 0, xe, y0 + yy, -scroll);
        const xb = W - Math.min(W, Math.max(0, p * (W + 32) - wv));
        this.bandRow(ctx, ban, 80 + yy / 2, xb, W, y1 + yy, scroll);
      }
      // the opponent slides in from the right (fast, then slow), the player from the left
      const ko = clamp01((t - 0.22) / 0.4), kp = clamp01((t - 0.36) / 0.4);
      const ox = Math.round(W + 40 - easeOut(ko) * (W * 0.34 + 40) - Math.max(0, t - 0.62) * 14);
      this.drawOpponent(ctx, ox, y0, B);
      const px = Math.round(-120 + easeOut(kp) * (W * 0.22 + 120) + Math.max(0, t - 0.76) * 14);
      this.drawPlayer(ctx, px, y1, B);
      // names
      const ta = clamp01((t - 0.5) / 0.15);
      if (ta > 0) {
        text(ctx, o.name, 40, y0 + 34, { scale: 2, color: ['#ffffff', '#202020'], alpha: ta });
        if (o.title) text(ctx, o.title, 42, y0 + 70, { color: ['#ffffff', '#202020'], alpha: ta });
        if (o.playerName) text(ctx, o.playerName, W - 40, y1 + 46, { align: 'right', scale: 2, color: ['#ffffff', '#202020'], alpha: ta });
      }
      // VS punches in
      const kv = clamp01((t - 0.6) / 0.14), VS = 'gfx/misc/battle_transitions/vs_letters.png', vs = img(VS);
      if (kv > 0 && ready(vs)) { // the link-battle VS letters (one flat colour) with a dark outline and a red shadow
        const s = 1 + (1 - easeOut(kv)) * 1.6, w = Math.round(64 * s), h = Math.round(128 * s), x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2);
        const ink = tinted(VS, '#202020'), red = tinted(VS, '#e83010');
        ctx.save(); ctx.globalAlpha = kv;
        if (ink) for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2]]) ctx.drawImage(ink, x + dx, y + dy, w, h);
        if (red) ctx.drawImage(red, x + 4, y + 4, w, h);
        if (ink) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.drawImage(ink, x + dx, y + dy, w, h);
        ctx.drawImage(vs, x, y, w, h); ctx.restore();
      }
    }
    // Mugshot_GradualWhiteFade, then the white clears onto the arena
    const wa = t < MUG.white ? 0 : t < MUG.clear ? (t - MUG.white) / (MUG.clear - MUG.white) : 1 - (t - MUG.clear) / (MUG.end - MUG.clear);
    if (wa > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp01(wa)})`; ctx.fillRect(0, 0, W, H); }
  }
  // one 2-line strip of the banner art (256px wide BG, repeated) at 2x between screen x a..b
  bandRow(ctx, ban, sy, a, b, y, off) {
    if (b - a <= 0) return;
    if (!ready(ban)) { rect(ctx, a, y, b - a, 4, sy < 80 ? '#3040c0' : '#a0a0a0'); return; }
    ctx.save(); ctx.beginPath(); ctx.rect(Math.round(a), y, Math.round(b - a), 4); ctx.clip();
    const tw = 512, start = ((off % tw) + tw) % tw - tw;
    for (let x = start; x < W; x += tw) ctx.drawImage(ban, 0, sy, 256, 2, Math.round(x), y, tw, 4);
    ctx.restore();
  }
  drawOpponent(ctx, x, y0, B) {
    const o = this.o;
    if (o.pic) { const im = img(o.pic); if (ready(im)) { ctx.drawImage(im, x, y0, B, B); return; } if (!im._failed) return; }
    if (o.portrait) { // wild bosses: their portrait in a FireRed frame, or a silhouette while unidentified
      const path = `pmd/${o.portrait}/portrait_${o.emotion || 'Normal'}.png`;
      const im = o.silhouette ? tinted(path, '#281838') : img(path);
      windowFrame(ctx, x + 16, y0 + 12, 104, 104, 'std');
      if (im && (im.getContext || ready(im))) ctx.drawImage(im, x + 28, y0 + 24, 80, 80);
    }
  }
  drawPlayer(ctx, x, y1, B) {
    const o = this.o; if (!o.playerDex) return;
    const im = img(`pmd/${o.playerDex}/portrait_Normal.png`);
    windowFrame(ctx, x, y1 + 12, 104, 104, 'std');
    if (ready(im)) ctx.drawImage(im, x + 12, y1 + 24, 80, 80);
  }
}
export function mugshot(o) { return new Promise(res => pushOverlay(new Mugshot({ ...o, onDone: res }))); }

// which mugshot palette each boss uses (the decomp only has the Elite Four's and the rival's)
export const MUGSHOT_PAL = { BROCK: 'bruno', MISTY: 'lance', LT_SURGE: 'blue', MAROWAK: 'agatha', GIOVANNI: 'bruno', LORELEI: 'lorelei', MEWTWO: 'lorelei' };
