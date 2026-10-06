// Damage report drawing (FireRed windows): a player's card with totals, biggest hit and top sources, used by the
// Hall of Fame's DAMAGE REPORT page, the blackout summary and the RECORDS run details. Summaries come from
// dmgSummary() in run.js: { dealt, taken, partner, best: [n, key], top: [[key, n], ...] }.
import { img, ready } from '../engine/assets.js';
import { text, measure } from '../engine/font.js';
import { windowFrame, rect } from '../engine/ui.js';
import { D, TYPE_COLORS } from '../game/data.js';
import { LEGENDS } from '../game/boons.js';

const STATUS = { burn: ['BURN', '#f08030'], poison: ['POISON', '#a040a0'], trap: ['TRAP', '#a8a878'], seed: ['LEECH SEED', '#78c850'], status: ['STATUS', '#a8a878'] };
const nf = n => Math.round(n || 0).toLocaleString('en-US');
export const fmtDmg = nf;

// a source key -> [label, bar colour]
export function dmgLabel(key) {
  const [kind, k] = [String(key || '').slice(0, 1), String(key || '').slice(2)];
  if (kind === 'm') { const m = D.moves?.[k]; return [m?.name || k, TYPE_COLORS[m?.type] || '#a8a878']; }
  if (kind === 'p') { const s = D.species?.[k]; return [`${s?.name || k} (partner)`, TYPE_COLORS[s?.types?.[0]] || '#a8a878']; }
  if (kind === 'b') { const L = LEGENDS[k]; return [L ? `${L.name} blessings` : `${k} blessings`, L?.color || '#f8d030']; }
  if (kind === 's') return STATUS[k] || STATUS.status;
  return [k === 'boon' ? 'Blessings' : 'Other', '#a8a878'];
}

export function drawMonIcon(ctx, key, x, y) {
  const sp = D.species?.[key];
  if (!sp?.sprites?.icon) return;
  const im = img(`gfx/pokemon/${sp.sprites.icon.split('/')[0]}/icon.png`);
  if (ready(im)) ctx.drawImage(im, 0, 0, 32, 32, Math.round(x), Math.round(y), 32, 32);
}

// One compact line for the blackout summary.
export function dmgLine(sum) {
  if (!sum) return 'not recorded';
  const top = sum.top?.[0];
  return `${nf(sum.dealt)} dealt · ${nf(sum.taken)} taken${top ? ` · most with ${dmgLabel(top[0])[0]}` : ''}`;
}

// A player's damage card in a FireRed window.
// p: { title, species, starter, level, partner, sum, share (0..1, co-op), rows (max source rows) }
export function drawDmgCard(ctx, x, y, w, h, p) {
  windowFrame(ctx, x, y, w, h, 'type1');
  const L = x + 14, R = x + w - 14;
  drawMonIcon(ctx, p.species, L - 4, y + 6);
  text(ctx, p.title || '', L + 30, y + 10, { color: 'black' });
  const sp = D.species?.[p.species]?.name || p.species || '';
  const from = p.starter && p.starter !== p.species ? ` (from ${D.species?.[p.starter]?.name || p.starter})` : '';
  text(ctx, `${sp}${p.level ? ` Lv${p.level}` : ''}${from}`, L + 30, y + 25, { color: 'dark', font: 'small' });
  const s = p.sum;
  let cy = y + 44;
  if (!s) { text(ctx, 'No damage recorded for this run.', L, cy + 4, { color: 'gray', font: 'small' }); return; }
  text(ctx, 'DEALT', L, cy + 4, { color: 'blue', font: 'small' });
  text(ctx, nf(s.dealt), L + 40, cy, { color: 'black', scale: 2 });
  const tx = L + 48 + measure(nf(s.dealt)) * 2;
  if (p.share != null) text(ctx, `${Math.round(p.share * 100)}% of the team`, tx, cy + 4, { color: 'green', font: 'small' });
  text(ctx, `TAKEN ${nf(s.taken)}`, R, cy + 4, { color: 'red', font: 'small', align: 'right' });
  cy += 26;
  if (s.best) text(ctx, `BIGGEST HIT ${nf(s.best[0])} · ${dmgLabel(s.best[1])[0]}`, L, cy, { color: 'dark', font: 'small' });
  if (p.partner || s.partner) text(ctx, `PARTNER ${p.partner ? (D.species?.[p.partner]?.name || p.partner) + ' ' : ''}${nf(s.partner)}`, R, cy, { color: 'dark', font: 'small', align: 'right' });
  cy += 16;
  const rows = (s.top || []).slice(0, p.rows || 8), max = Math.max(1, ...rows.map(r => r[1]));
  const labelW = Math.min(150, Math.round((w - 28) * 0.42)), barX = L + labelW, numW = 74, barW = Math.max(20, R - numW - barX - 4);
  for (const [k, n] of rows) {
    if (cy + 12 > y + h - 8) break;
    const [label, color] = dmgLabel(k);
    let lb = label; while (lb.length > 3 && measure(lb, 'small') > labelW - 6) lb = lb.slice(0, -2) + '.';
    text(ctx, lb, L, cy, { color: 'black', font: 'small' });
    rect(ctx, barX, cy + 2, barW, 7, '#d6d6de');
    rect(ctx, barX, cy + 2, Math.max(2, Math.round(barW * n / max)), 7, color);
    text(ctx, `${nf(n)}  ${Math.round(100 * n / Math.max(1, s.dealt))}%`, R, cy, { color: 'dark', font: 'small', align: 'right' });
    cy += 14;
  }
}
