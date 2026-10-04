// In-run HUD: HP/level, move slots with cooldowns, dash pips, call gauge, money, boons, boss bars.
import { W, H, Engine } from '../engine/core.js';
import { img, ready } from '../engine/assets.js';
import { text, measure } from '../engine/font.js';
import { pixBox, rect } from '../engine/ui.js';
import { D, TYPE_COLORS } from '../game/data.js';
import { BOONS, LEGENDS, RARITY } from '../game/boons.js';
import { BIOMES, HELD, areaOf } from '../game/content.js';
import { Input } from '../engine/input.js';
import { expProgress } from '../game/run.js';
import { drawPortrait, ICON } from './ui.js';
import { profile } from '../game/moves_rt.js';

function hpColor(f) { return f > 0.5 ? ['#70f8a8', '#58d080'] : f > 0.2 ? ['#f8e038', '#c8a808'] : ['#f85838', '#a84048']; }

export function drawHud(ctx, world, run, opts = {}) {
  const p = world.player;
  if (!p) return;
  // ---- player panel (bottom left)
  const px = 8, py = H - 58;
  drawPortrait(ctx, D.species[run.species].dex, px + 2, py + 6, p.hp < p.maxHp * 0.25 ? 'Pain' : 'Normal');
  pixBox(ctx, px + 46, py + 8, 190, 42, 'rgba(24,28,40,0.85)', '#0d1018', 3);
  text(ctx, D.species[run.species].name, px + 52, py + 9, { color: 'white' });
  text(ctx, `Lv${run.level}`, px + 228, py + 9, { color: 'white', align: 'right' });
  const f = Math.max(0, p.hp / p.maxHp), hw = 176;
  rect(ctx, px + 52, py + 26, hw, 7, '#384040');
  const c = hpColor(f);
  rect(ctx, px + 52, py + 26, Math.round(hw * f), 7, c[1]); rect(ctx, px + 52, py + 26, Math.round(hw * f), 4, c[0]);
  text(ctx, `${Math.max(0, Math.ceil(p.hp))}/${p.maxHp}`, px + 228, py + 33, { color: 'white', font: 'small', align: 'right' });
  // exp bar
  rect(ctx, px + 52, py + 44, hw, 3, '#203040'); rect(ctx, px + 52, py + 44, Math.round(hw * expProgress(run)), 3, '#40c8f8');
  // revives
  // revives: the 24x24 REVIVE icon at 1:1 above the panel, with a count
  if (run.revives > 0) { const im = img('gfx/items/revive.png'); if (ready(im)) ctx.drawImage(im, px + 196, py - 16); if (run.revives > 1) text(ctx, `×${run.revives}`, px + 220, py - 6, { font: 'small', color: 'white' }); }

  // ---- slots (bottom right)
  const slots = [['attack', Input.label('attack'), 'ATK'], ['special', Input.label('special'), 'SP'], ['cast', Input.label('cast'), 'CAST']];
  let sx = W - 8 - slots.length * 76;
  const sy = H - 46;
  for (const [slot, key, label] of slots) {
    const mv = run.slots[slot];
    const pr = mv ? profile(mv) : null;
    const col = pr ? TYPE_COLORS[pr.type] : '#555';
    pixBox(ctx, sx, sy, 72, 38, 'rgba(24,28,40,0.88)', col, 3);
    text(ctx, label, sx + 5, sy + 2, { font: 'small', color: [col, '#101010'] });
    text(ctx, key, sx + 66, sy + 2, { font: 'small', color: 'gray', align: 'right' });
    if (pr) {
      const name = pr.name.length > 11 ? pr.name.slice(0, 11) : pr.name;
      text(ctx, name, sx + 36, sy + 17, { font: measure(name) > 66 ? 'small' : 'normal', color: 'white', align: 'center' });
      const boon = run.boons.find(b => BOONS[b.key].slot === slot);
      if (boon) { const L = LEGENDS[BOONS[boon.key].legend]; rect(ctx, sx + 3, sy + 33, 66, 2, L.color); }
      const cd = p.cds['slot_' + slot] || 0, max = p.cdMax?.['slot_' + slot] || 1;
      if (cd > 0.05) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx + 2, sy + 2, Math.round(68 * (cd / max)), 34); }
    }
    sx += 76;
  }
  // dash pips + balls + call gauge
  const dl = p.pc?.dashLeft ?? p.dashCharges;
  for (let i = 0; i < p.dashCharges; i++) {
    const x = W - 8 - slots.length * 76 + i * 12, y = sy - 12;
    pixBox(ctx, x, y, 10, 8, i < dl ? '#80d8ff' : '#304050', '#0d1018', 2);
  }
  text(ctx, Input.usingPad ? 'DASH ' + Input.label('dash') : 'DASH', W - 8 - slots.length * 76 + p.dashCharges * 12 + 2, sy - 15, { font: 'small', color: 'gray' });
  // balls
  const bim = img(`gfx/ui/balls/${run.ballType.replace("_ball", "")}.png`);
  const bx = W - 92;
  if (ready(bim)) ctx.drawImage(bim, 0, 0, 16, 16, bx, sy - 20, 16, 16);
  text(ctx, `×${run.balls}`, bx + 18, sy - 18, { color: 'white', font: 'small' });
  text(ctx, Input.label('ball'), bx + 40, sy - 18, { color: 'gray', font: 'small' });
  // call gauge
  const cx = W - 8 - slots.length * 76 - 64, cy = H - 46;
  pixBox(ctx, cx, cy, 58, 38, 'rgba(24,28,40,0.88)', run.callGauge >= 1 ? '#f8d030' : '#405060', 3);
  if (run.partner) {
    const ic = img(`gfx/pokemon/${D.species[run.partner.species].sprites.icon.split('/')[0]}/icon.png`);
    if (ready(ic)) ctx.drawImage(ic, 0, Math.floor(Engine.time * 4) % 2 * 32, 32, 32, cx + 2, cy + 1, 32, 32);
    text(ctx, Input.label('call'), cx + 52, cy + 2, { font: 'small', color: 'gray', align: 'right' });
  } else text(ctx, 'no partner', cx + 29, cy + 12, { font: 'small', color: 'gray', align: 'center' });
  rect(ctx, cx + 4, cy + 32, 50, 3, '#203040'); rect(ctx, cx + 4, cy + 32, Math.round(50 * run.callGauge), 3, run.callGauge >= 1 ? '#f8d030' : '#a0a0ff');

  // ---- top left: money, area, boons
  pixBox(ctx, 6, 6, 150, 20, 'rgba(24,28,40,0.8)', '#0d1018', 3);
  text(ctx, `¥${run.money}`, 12, 8, { color: 'gold' });
  const B = areaOf(run);
  if (B && !opts.hub) text(ctx, `${B.name} ${Math.min(run.roomInBiome + 1, B.rooms + 1)}/${B.rooms + 1}`, 150, 10, { font: 'small', color: 'whiteSoft', align: 'right' });
  if (run.heat) text(ctx, `HEAT ${run.heat}`, 12, H - 74, { font: 'small', color: ['#ff6040', '#301000'] });
  let by = 30;
  for (const b of run.boons) {
    const def = BOONS[b.key]; const L = LEGENDS[def.legend];
    const ic = img(ICON.portrait(L.dex));
    pixBox(ctx, 6, by, 24, 24, RARITY[b.rarity].color, '#0d1018', 2);
    if (ready(ic)) ctx.drawImage(ic, 8, by + 2, 20, 20); // 40x40 portraits at exactly half size
    if (b.level > 1) text(ctx, String(b.level), 32, by + 12, { font: 'small', color: 'white' });
    by += 26;
    if (by > H - 90) break;
  }
  if (run.held) { const im = img(ICON.item(run.held)); pixBox(ctx, 160, 6, 22, 22, 'rgba(24,28,40,0.8)', '#0d1018', 3); if (ready(im)) ctx.drawImage(im, 159, 5); }
  // chaos curses
  const curse = run.chaos.find(c => !c.active);
  if (curse) text(ctx, `DEOXYS: ${curse.curse.name} (${curse.rooms})`, 188, 10, { font: 'small', color: 'pink' });

  // ---- boss bars
  const bosses = world.actors.filter(a => a.boss && !a.dead && a.spawnT <= 0);
  bosses.forEach((b, i) => {
    const bw = 300, x = (W - bw) / 2, y = 10 + i * 26;
    pixBox(ctx, x - 4, y - 2, bw + 8, 22, 'rgba(16,10,14,0.85)', '#000', 3);
    text(ctx, b.ghostly ? 'GHOST' : `${b.name}  Lv${b.level}`, x + 2, y - 1, { font: 'small', color: 'white' });
    const fr = Math.max(0, b.hp / b.maxHp);
    rect(ctx, x, y + 11, bw, 6, '#401018'); rect(ctx, x, y + 11, Math.round(bw * fr), 6, '#e83838'); rect(ctx, x, y + 11, Math.round(bw * fr), 2, '#ff8080');
    if (b.barrier > 0) rect(ctx, x, y + 11, Math.round(bw * Math.min(1, b.barrier / (b.maxHp * 0.08))), 2, '#80c0ff');
    if (b.vulnerable > 0 && Math.floor(Engine.time * 8) % 2) text(ctx, 'VULNERABLE', x + bw, y - 1, { font: 'small', color: 'gold', align: 'right' });
  });
}

export function drawControlsHint(ctx, lines) {
  let y = H - 70 - lines.length * 12;
  for (const l of lines) { text(ctx, l, W - 10, y, { font: 'small', color: 'whiteSoft', align: 'right' }); y += 12; }
}
export { HELD };
