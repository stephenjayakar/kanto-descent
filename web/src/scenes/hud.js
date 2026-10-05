// In-run HUD, built from FireRed's battle interface (gfx/ui/battle) at 2x, the world's scale: the player's healthbox
// (name, Lv, HP bar from the hpbar_*_strip tiles, HP numbers, EXP bar, status icon) bottom left, move slots with type
// badges and cooldowns, dash pips, POKé BALLs and the partner's Call gauge bottom right, money / area / held item /
// blessings top left, and the bosses' opponent healthboxes at the top.
import { W, H, Engine } from '../engine/core.js';
import { img, ready } from '../engine/assets.js';
import { text, measure } from '../engine/font.js';
import { pixBox, rect, frBox } from '../engine/ui.js';
import { D, TYPE_COLORS } from '../game/data.js';
import { BOONS, LEGENDS, RARITY } from '../game/boons.js';
import { HELD, areaOf } from '../game/content.js';
import { Input } from '../engine/input.js';
import { expProgress } from '../game/run.js';
import { ICON } from './ui.js';
import { profile } from '../game/moves_rt.js';

const BATTLE = 'gfx/ui/battle/';
const STATUS_ICON = { burn: 'brn', poison: 'psn', toxic: 'psn', para: 'par', sleep: 'slp', freeze: 'frz' };
const CREAM = '#ffffde'; // the healthbox's fill
const HP_TEXT = ['#424242', '#dedbb5']; // FireRed's healthbox text: dark grey with a cream shadow

function hpColor(f) { return f > 0.5 ? 'green' : f > 0.2 ? 'yellow' : 'red'; }
// FireRed's HP bar tiles at s x (2 = the world's scale): each 8x8 frame of the strip holds 0-8 px of fill; tiles = 8px (1x) each
function hpTiles(ctx, x, y, tiles, frac, s = 2) {
  const im = img(`${BATTLE}hpbar_${hpColor(frac)}_strip.png`);
  const px = Math.round(Math.max(0, Math.min(1, frac)) * tiles * 8);
  if (!ready(im)) { rect(ctx, x, y + 2 * s, tiles * 8 * s, 4 * s, '#4a425a'); rect(ctx, x, y + 3 * s, Math.round(px * s), 3 * s, '#5ad684'); return; }
  for (let i = 0; i < tiles; i++) ctx.drawImage(im, Math.max(0, Math.min(8, px - i * 8)) * 8, 0, 8, 8, x + i * 8 * s, y, 8 * s, 8 * s);
}
function statusOf(a) { return Object.keys(a.status || {}).find(k => STATUS_ICON[k]); }
// the bar drains smoothly like the games' (per actor, frame-rate independent)
function shownFrac(a, frac) {
  const dt = Math.min(0.1, Math.max(0, Engine.time - (a._hudT ?? Engine.time))); a._hudT = Engine.time;
  if (a._hudF === undefined || frac > a._hudF) a._hudF = frac; // heals jump up
  else a._hudF = Math.max(frac, a._hudF - dt * 1.5);
  return a._hudF;
}

// ---- the player's healthbox: healthbox_singles_player.png (104x39) at 2x = 208x78
const HB_W = 208, HB_H = 78;
function drawPlayerBox(ctx, p, run, hx, hy) {
  const box = img(`${BATTLE}healthbox_singles_player.png`);
  if (ready(box)) ctx.drawImage(box, hx, hy, HB_W, HB_H);
  else { frBox(ctx, hx + 18, hy + 4, HB_W - 26, HB_H - 10, 'type1', CREAM); }
  // name (small font, 2x) and level after the box's own "Lv" (1x col 64-71)
  const name = D.species[run.species].name, nw = measure(name, 'small');
  text(ctx, name, hx + (nw > 48 ? 24 : 28), hy + 10, { font: 'small', scale: 2, color: HP_TEXT });
  text(ctx, String(run.level), hx + 144, hy + 10, { font: 'small', scale: 2, color: HP_TEXT });
  // HP: the label (1x 32,16) then 6 tiles up to the box's end cap
  const f = Math.max(0, p.hp / p.maxHp);
  const lab = img(`${BATTLE}hp_label.png`);
  if (ready(lab)) ctx.drawImage(lab, hx + 64, hy + 32, 32, 16);
  hpTiles(ctx, hx + 96, hy + 32, 6, shownFrac(p, f));
  // HP numbers either side of the box's "/" (1x col 64-70, rows 25-31)
  text(ctx, String(Math.max(0, Math.ceil(p.hp))), hx + 126, hy + 42, { font: 'small', scale: 2, color: HP_TEXT, align: 'right' });
  text(ctx, String(p.maxHp), hx + 144, hy + 42, { font: 'small', scale: 2, color: HP_TEXT });
  // status (24x8) bottom left of the box, where FireRed puts it
  const st = statusOf(p);
  if (st) { const im = img(`${BATTLE}status_${STATUS_ICON[st]}.png`); if (ready(im)) ctx.drawImage(im, hx + 28, hy + 48, 48, 16); }
  // EXP: 8 tiles of expbar_strip under the box (1x 32,32)
  const ex = img(`${BATTLE}expbar_strip.png`), epx = Math.round(Math.max(0, Math.min(1, expProgress(run))) * 64);
  if (ready(ex)) for (let i = 0; i < 8; i++) ctx.drawImage(ex, Math.max(0, Math.min(8, epx - i * 8)) * 8, 0, 8, 8, hx + 64 + i * 16, hy + 64, 16, 16);
}

// ---- a boss: healthbox_singles_opponent.png (101x31) at 2x, stretched sideways (left 24 cols, a blank middle column,
// right 24 cols with the HP bar's end cap at col 86 of the original), with its name, Lv, status and a long HP bar
const OPP_L = 24, OPP_R = 77, OPP_CAP = 86 - OPP_R;
export const BOSS_BOX_H = 62;
function drawBossBox(ctx, b, x, y, w) {
  const im = img(`${BATTLE}healthbox_singles_opponent.png`);
  const rx = x + w - (101 - OPP_R) * 2;
  if (ready(im)) {
    ctx.drawImage(im, 0, 0, OPP_L, 31, x, y, OPP_L * 2, 62);
    ctx.drawImage(im, 40, 0, 1, 31, x + OPP_L * 2, y, rx - x - OPP_L * 2, 62);
    ctx.drawImage(im, OPP_R, 0, 101 - OPP_R, 31, rx, y, (101 - OPP_R) * 2, 62);
  } else frBox(ctx, x + 2, y + 4, w - 10, 50, 'type1', CREAM);
  const lvGlyph = ready(im); // the box's own "Lv" (cols 55-62, rows 10-15) drawn where it fits the stretched box
  const name = b.ghostly ? 'GHOST' : b.name, lv = b.ghostly ? '??' : String(b.level);
  const capX = rx + OPP_CAP * 2;
  const lvW = measure(lv, 'small') * 2;
  text(ctx, lv, capX - lvW, y + 10, { font: 'small', scale: 2, color: HP_TEXT });
  if (lvGlyph) ctx.drawImage(im, 55, 10, 8, 6, capX - lvW - 18, y + 20, 16, 12);
  text(ctx, name, x + 16, y + 10, { font: 'small', scale: 2, color: HP_TEXT });
  // HP bar ending at the cap
  const tiles = Math.max(4, Math.floor((capX - x - 60 - 32) / 16));
  const barX = capX - tiles * 16, labX = barX - 32;
  const lab = img(`${BATTLE}hp_label.png`);
  if (ready(lab)) ctx.drawImage(lab, labX, y + 32, 32, 16);
  const fr = Math.max(0, b.hp / b.maxHp);
  hpTiles(ctx, barX, y + 32, tiles, shownFrac(b, fr));
  if (b.barrier > 0) rect(ctx, barX, y + 37, Math.round(tiles * 16 * Math.min(1, b.barrier / (b.maxHp * 0.08))), 2, '#84c6ff');
  const st = statusOf(b);
  if (st && labX - 52 > x + 12) { const si = img(`${BATTLE}status_${STATUS_ICON[st]}.png`); if (ready(si)) ctx.drawImage(si, labX - 52, y + 32, 48, 16); }
  if (b.vulnerable > 0 && Math.floor(Engine.time * 8) % 2) text(ctx, 'VULNERABLE', x + w / 2, y + BOSS_BOX_H - 2, { font: 'small', color: 'gold', align: 'center' });
}

// ---- move slots: thin FireRed windows with the move's type badge, the key, the name and a cooldown shade
const SLOT_W = 76, SLOT_H = 40, SLOT_GAP = 3;
function drawSlot(ctx, run, p, slot, key, label, x, y) {
  const mv = run.slots[slot], pr = mv ? profile(mv) : null;
  frBox(ctx, x, y, SLOT_W, SLOT_H, 'type1', '#ffffff');
  const ti = pr && img(ICON.type(pr.type));
  if (ti && ready(ti)) ctx.drawImage(ti, x + 4, y + 4);
  else text(ctx, label, x + 5, y + 3, { font: 'small', color: 'dark' });
  text(ctx, ti ? key : `${key}`, x + SLOT_W - 5, y + 3, { font: 'small', color: 'blue', align: 'right' });
  if (ti) text(ctx, label, x + SLOT_W - 7 - measure(key, 'small'), y + 3, { font: 'small', color: 'gray', align: 'right' });
  if (!pr) { text(ctx, '-', x + SLOT_W / 2, y + 19, { color: 'gray', align: 'center' }); return; }
  const name = pr.name.length > 12 ? pr.name.slice(0, 12) : pr.name;
  text(ctx, name, x + SLOT_W / 2, y + (measure(name) > SLOT_W - 10 ? 20 : 18), { font: measure(name) > SLOT_W - 10 ? 'small' : 'normal', color: 'dark', align: 'center' });
  const boon = run.boons.find(b => BOONS[b.key].slot === slot);
  if (boon) rect(ctx, x + 4, y + SLOT_H - 6, SLOT_W - 8, 2, LEGENDS[BOONS[boon.key].legend].color); // its blessing's colour
  const cd = p.cds['slot_' + slot] || 0, max = p.cdMax?.['slot_' + slot] || 1;
  if (cd > 0.05) { ctx.fillStyle = 'rgba(41,49,49,0.5)'; ctx.fillRect(x + 3, y + 3, Math.round((SLOT_W - 6) * Math.min(1, cd / max)), SLOT_H - 6); }
}

export function drawHud(ctx, world, run, opts = {}) {
  const p = world.player;
  if (!p) return;
  // ---- player healthbox (bottom left)
  const hx = 2, hy = H - HB_H - 2;
  drawPlayerBox(ctx, p, run, hx, hy);
  // revives: the 24x24 REVIVE icon at 1:1 above the box's right end, with a count
  if (run.revives > 0) { const im = img('gfx/items/revive.png'); if (ready(im)) ctx.drawImage(im, hx + 168, hy - 18); if (run.revives > 1) text(ctx, `×${run.revives}`, hx + 192, hy - 8, { font: 'small', color: 'white' }); }
  if (run.heat) text(ctx, `HEAT ${run.heat}`, hx + 22, hy - 8, { font: 'small', color: ['#ff6040', '#301000'] });

  // ---- slots (bottom right)
  const slots = [['attack', Input.label('attack'), 'ATK'], ['special', Input.label('special'), 'SP'], ['cast', Input.label('cast'), 'CAST']];
  const sx0 = W - 6 - slots.length * (SLOT_W + SLOT_GAP) + SLOT_GAP, sy = H - SLOT_H - 6;
  slots.forEach(([slot, key, label], i) => drawSlot(ctx, run, p, slot, key, label, sx0 + i * (SLOT_W + SLOT_GAP), sy));
  // dash pips (FireRed's EXP blue) above the slots
  const dl = p.pc?.dashLeft ?? p.dashCharges;
  for (let i = 0; i < p.dashCharges; i++) {
    const x = sx0 + i * 13, y = sy - 11;
    pixBox(ctx, x, y, 11, 7, i < dl ? '#42ceff' : '#526b63', '#293131', 2);
    if (i < dl) rect(ctx, x + 2, y + 1, 7, 1, '#b5efff');
  }
  text(ctx, Input.usingPad ? 'DASH ' + Input.label('dash') : 'DASH', sx0 + p.dashCharges * 13 + 2, sy - 15, { font: 'small', color: 'whiteSoft' });
  // POKé BALLs: the ball icon, count and key, right-aligned above the slots
  const bim = img(`gfx/ui/balls/${run.ballType.replace('_ball', '')}.png`);
  const bkey = Input.label('ball'), bkw = measure(bkey, 'small'), cnt = `×${run.balls}`, cw = measure(cnt, 'small');
  const bx = W - 8 - bkw - 6 - cw - 18;
  if (ready(bim)) ctx.drawImage(bim, 0, 0, 16, 16, bx, sy - 19, 16, 16);
  text(ctx, cnt, bx + 17, sy - 16, { color: 'white', font: 'small' });
  text(ctx, bkey, W - 8, sy - 16, { color: 'whiteSoft', font: 'small', align: 'right' });
  // the partner and its Call gauge (EXP-bar tiles; gold frame and blinking when ready)
  const cx = sx0 - 62, cy = sy, full = run.callGauge >= 1; // clear of the co-op P2 panel (room.js, x 258-458)
  frBox(ctx, cx, cy, 58, SLOT_H, full ? 'gold' : 'type1', full && Math.floor(Engine.time * 4) % 2 ? '#fff8d0' : '#ffffff');
  if (run.partner) {
    const ic = img(`gfx/pokemon/${D.species[run.partner.species].sprites.icon.split('/')[0]}/icon.png`);
    if (ready(ic)) ctx.drawImage(ic, 0, Math.floor(Engine.time * 4) % 2 * 32, 32, 32, cx + 2, cy + 1, 32, 32);
    text(ctx, Input.label('call'), cx + 53, cy + 3, { font: 'small', color: 'blue', align: 'right' });
  } else text(ctx, 'no partner', cx + 29, cy + 12, { font: 'small', color: 'gray', align: 'center' });
  const gx = img(`${BATTLE}expbar_strip.png`), gpx = Math.round(Math.max(0, Math.min(1, run.callGauge)) * 48);
  if (ready(gx)) for (let i = 0; i < 6; i++) ctx.drawImage(gx, Math.max(0, Math.min(8, gpx - i * 8)) * 8, 0, 8, 8, cx + 5 + i * 8, cy + SLOT_H - 11, 8, 8);
  if (full && run.partner) text(ctx, 'CALL!', cx + 54, cy + 17, { font: 'small', color: 'red', align: 'right' });

  // ---- top left: money and area (a FireRed window), held item, blessings
  const B = areaOf(run), money = `¥${run.money}`;
  const area = B && !opts.hub ? `${B.name} ${Math.min(run.roomInBiome + 1, B.rooms + 1)}/${B.rooms + 1}` : '';
  const mw = area ? Math.max(156, measure(money) + measure(area, 'small') + 28) : measure(money) + 22;
  frBox(ctx, 4, 4, mw, 24, 'type1', '#ffffff');
  text(ctx, money, 10, 9, { color: 'dark' });
  if (area) text(ctx, area, 4 + mw - 6, 10, { font: 'small', color: 'blue', align: 'right' });
  if (run.held) { const im = img(ICON.item(run.held)); frBox(ctx, mw + 6, 4, 24, 24, 'type1', '#ffffff'); if (ready(im)) ctx.drawImage(im, mw + 6, 4); }
  const top = Math.max(32, (opts.top || 0) + 4); // below the map name popup while it's showing (room.js)
  let by = top;
  // Deoxys' curse: a window under the money window (the blessings below it)
  const curse = run.chaos.find(c => !c.active);
  if (curse) {
    const s = `DEOXYS: ${curse.curse.name} (${curse.rooms})`, cw = measure(s, 'small') + 14;
    frBox(ctx, 4, by, cw, 18, 'type1', '#ffffff');
    text(ctx, s, 11, by + 3, { font: 'small', color: ['#c02878', '#f8c8e0'] });
    by += 22;
  }
  for (const b of run.boons) {
    const def = BOONS[b.key]; const L = LEGENDS[def.legend];
    const ic = img(ICON.portrait(L.dex));
    pixBox(ctx, 4, by, 24, 24, RARITY[b.rarity].color, '#293131', 2);
    if (ready(ic)) ctx.drawImage(ic, 6, by + 2, 20, 20); // 40x40 portraits at exactly half size
    if (b.level > 1) text(ctx, String(b.level), 30, by + 12, { font: 'small', color: 'white' });
    by += 26;
    if (by > H - HB_H - 48) break;
  }

  // ---- bosses: opponent healthboxes at the top (side by side when there are two)
  const bosses = world.actors.filter(a => a.boss && !a.dead && a.spawnT <= 0);
  if (bosses.length) {
    const n = bosses.length, gap = 8;
    const left = mw + (run.held ? 36 : 10); // clear of the money / held item windows
    const bw = n === 1 ? 320 : Math.min(240, Math.floor((W - left - 8 - gap * (n - 1)) / n / 2) * 2);
    const total = n * bw + (n - 1) * gap, x0 = n === 1 ? (W - bw) / 2 : Math.max(left, (W - total) / 2);
    // a boss walking up under the boxes shows through them
    const under = (x, w) => opts.cam && bosses.some(b => { const sx = (b.x - opts.cam.x) * 2, sy = (b.y - opts.cam.y) * 2; return sy - 64 < BOSS_BOX_H + 2 && sy > 0 && sx > x - 24 && sx < x + w + 24; });
    bosses.forEach((b, i) => {
      const x = Math.round(x0 + i * (bw + gap)), see = under(x, bw);
      if (see) { ctx.save(); ctx.globalAlpha = 0.45; }
      drawBossBox(ctx, b, x, 2, bw);
      if (see) ctx.restore();
    });
  }
}

// ---- co-op: player 2's box, between the player's healthbox and the partner window (x 258-460). FireRed's doubles
// healthbox (the second POKéMON's in a double battle, 101x28) at 2x with P2's name / Lv / HP and its Call gauge in
// the box's empty corner, the player's name above it, and its three moves as thin windows underneath (78px tall
// overall, like the player's healthbox).
export const P2_COLOR = ['#80d0ff', '#202020']; // player 2's colour everywhere (tags, menus)
export function drawCoopPanel(ctx, a, x, y, downT = 0) {
  const box = img(`${BATTLE}healthbox_doubles_player.png`);
  if (ready(box)) ctx.drawImage(box, x, y, 202, 56); else frBox(ctx, x + 18, y + 4, 182, 48, 'type1', CREAM);
  const r2 = a.run, name = D.species[a.species]?.name || '';
  text(ctx, a.label || 'P2', x + 22, y - 10, { font: 'small', color: P2_COLOR });
  text(ctx, name, x + (measure(name, 'small') > 48 ? 24 : 28), y + 10, { font: 'small', scale: 2, color: HP_TEXT });
  text(ctx, String(a.level), x + 144, y + 10, { font: 'small', scale: 2, color: HP_TEXT });
  const lab = img(`${BATTLE}hp_label.png`);
  if (ready(lab)) ctx.drawImage(lab, x + 64, y + 32, 32, 16);
  hpTiles(ctx, x + 96, y + 32, 6, a.dead ? 0 : shownFrac(a, Math.max(0, a.hp / a.maxHp)));
  // the box's empty corner (1x cols 12-31, rows 17-23): the faint countdown, or its partner's Call gauge
  if (a.dead) text(ctx, `${Math.max(0, Math.ceil(15 - downT))}s`, x + 44, y + 35, { font: 'small', color: 'red', align: 'center' });
  else if (r2?.partner) {
    const full = r2.callGauge >= 1, gx = img(`${BATTLE}expbar_strip.png`), gpx = Math.round(Math.max(0, Math.min(1, r2.callGauge)) * 32);
    if (full && Math.floor(Engine.time * 4) % 2) text(ctx, 'CALL!', x + 44, y + 35, { font: 'small', color: 'red', align: 'center' });
    else if (ready(gx)) for (let i = 0; i < 4; i++) ctx.drawImage(gx, Math.max(0, Math.min(8, gpx - i * 8)) * 8, 0, 8, 8, x + 28 + i * 8, y + 38, 8, 8);
  }
  // moves: thin windows with the move type's stripe and a cooldown shade, like the HUD's slots
  ['attack', 'special', 'cast'].forEach((slot, i) => {
    const mv = (a.slots || r2?.slots)?.[slot], pr = mv && D.moves[mv] ? profile(mv) : null, bx = x + i * 68, by = y + 58, cw = 66, ch = 20;
    frBox(ctx, bx, by, cw, ch, 'type1', '#ffffff');
    if (!pr) { text(ctx, '-', bx + cw / 2, by + 4, { font: 'small', color: 'gray', align: 'center' }); return; }
    rect(ctx, bx + 3, by + 3, 3, ch - 6, TYPE_COLORS[pr.type] || '#736b84');
    let nm = pr.name; while (nm.length > 1 && measure(nm, 'small') > cw - 14) nm = nm.slice(0, -1);
    text(ctx, nm, bx + cw / 2 + 2, by + 4, { font: 'small', color: 'dark', align: 'center' });
    const cd = a.cds?.['slot_' + slot] || 0, max = a.cdMax?.['slot_' + slot] || 1;
    if (cd > 0.05) { ctx.fillStyle = 'rgba(41,49,49,0.5)'; ctx.fillRect(bx + 3, by + 3, Math.round((cw - 6) * Math.min(1, cd / max)), ch - 6); }
  });
}
// player 2's tag over its head: a little cream healthbox (blue frame, P2's colour) with its name and a 1x HP bar.
// (sx, sy) = the tag's bottom centre on screen.
export function drawCoopTag(ctx, a, sx, sy, downT = 0) {
  const label = a.label || 'P2';
  if (a.dead) {
    const s = `${label} fainted · back in ${Math.max(0, Math.ceil(15 - downT))}s`, w = measure(s, 'small') + 12;
    const x = Math.round(Math.max(4, Math.min(W - w - 4, sx - w / 2))), y = Math.round(Math.max(4, sy - 18));
    frBox(ctx, x, y, w, 18, 'blue', CREAM);
    text(ctx, s, x + w / 2, y + 3, { font: 'small', color: 'red', align: 'center' });
    return;
  }
  const w = Math.max(measure(label, 'small') + 12, 58), h = 26;
  const x = Math.round(Math.max(4, Math.min(W - w - 4, sx - w / 2))), y = Math.round(Math.max(4, sy - h));
  frBox(ctx, x, y, w, h, 'blue', CREAM);
  text(ctx, label, x + w / 2, y + 2, { font: 'small', color: HP_TEXT, align: 'center' });
  const lab = img(`${BATTLE}hp_label.png`), bx = x + Math.round((w - 48) / 2);
  if (ready(lab)) ctx.drawImage(lab, bx, y + 14, 16, 8);
  hpTiles(ctx, bx + 16, y + 14, 4, shownFrac(a, Math.max(0, a.hp / a.maxHp)), 1);
}

export function drawControlsHint(ctx, lines) {
  let y = H - 70 - lines.length * 12;
  for (const l of lines) { text(ctx, l, W - 10, y, { font: 'small', color: 'whiteSoft', align: 'right' }); y += 12; }
}
export { HELD, TYPE_COLORS };
