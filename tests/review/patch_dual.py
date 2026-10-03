def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/scenes/ui.js', [
    ("export function choose(title, cards, opts = {})", r"""// One choice card (used by DualChoice; same look as Choice's cards).
function drawCard(ctx, c, x, y, w, h, sel) {
  pixBox(ctx, x, y, w, h, sel ? '#fffef0' : '#e8e8e0', c.accent || '#283040', 3);
  if (sel) rect(ctx, x + 2, y + 2, 4, h - 4, c.accent || '#f8d030');
  let tx = x + 12;
  if (c.portrait) { drawPortrait(ctx, c.portrait, x + 10, y + (h - 40) / 2, c.emotion || 'Normal'); tx = x + 56; }
  else if (c.icon) { const im = img(c.icon); if (ready(im)) ctx.drawImage(im, x + 12, y + (h - im.naturalHeight) / 2); tx = x + 44; }
  text(ctx, c.title, tx, y + 6, { color: c.titleColor || 'dark' });
  let bw = 0;
  if (c.badge) { bw = measure(c.badge, 'small') + 8; pixBox(ctx, x + w - bw - 8, y + 6, bw, 13, c.badgeColor || '#3060c0', null, 2); text(ctx, c.badge, x + w - bw - 4, y + 6, { font: 'small', color: 'white' }); }
  if (c.sub && tx + measure(c.title) + 8 + measure(c.sub, 'small') < x + w - bw - 12) text(ctx, c.sub, tx + measure(c.title) + 8, y + 7, { font: 'small', color: c.subColor || 'blue' });
  wrap(c.desc || '', w - (tx - x) - 10, 'small').slice(0, 3).forEach((ln, j) => text(ctx, ln, tx, y + 23 + j * 12, { font: 'small', color: c.disabled ? 'gray' : 'dark' }));
}

// Co-op: both players pick from their own cards at the same time (left: player 1 with this keyboard/mouse,
// right: player 2 with the guest's controller). Resolves [pick1, pick2] once both chose (-1 = skipped).
export class DualChoice {
  constructor(sides, opts = {}) { this.sides = sides.map(s => ({ ...s, sel: 0, pick: s.cards.length ? null : -1 })); this.opts = opts; this.t = 0; }
  enter() { Input.clear(); Coop.remote.clear(); Sound.playSE('se_win_open'); }
  rects(i) { const cw = 368, ch = 66, x = i === 0 ? 10 : W - 10 - cw; return this.sides[i].cards.map((c, j) => ({ x, y: 96 + j * (ch + 6), w: cw, h: ch })); }
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
      const R = this.rects(i), x = i === 0 ? 10 : W - 378;
      text(ctx, s.title, x + 4, 80, { font: 'small', color: [i === 0 ? '#f8d030' : '#80d0ff', '#202020'] });
      if (!s.cards.length) text(ctx, s.empty || 'Nothing more to offer.', x + 184, 150, { align: 'center', font: 'small', color: 'gray' });
      s.cards.forEach((c, j) => drawCard(ctx, c, R[j].x, R[j].y, R[j].w, R[j].h, s.pick === null ? j === s.sel : j === s.pick));
      if (s.pick !== null && s.cards.length && !allDone) {
        ctx.fillStyle = 'rgba(8,10,20,0.45)'; ctx.fillRect(x, 92, 368, R.length * 72);
        const lbl = (s.pick >= 0 ? 'CHOSEN' : 'SKIPPED') + ' - waiting for the other player', tw = measure(lbl, 'small') + 14, ly = 92 + R.length * 36 - 8;
        pixBox(ctx, x + 184 - tw / 2, ly, tw, 16, 'rgba(16,20,32,0.95)', '#f8f8f8', 2);
        text(ctx, lbl, x + 184, ly + 1, { align: 'center', font: 'small', color: 'white' });
      }
      s.owned?.(ctx, x, 96 + Math.max(1, R.length) * 72 + 4, 368, s.pick === null ? s.sel : s.pick);
    });
    text(ctx, this.opts.footer || 'Both pick at once.  P1: arrows + Enter (X skips).  P2: their own controls.', W / 2, H - 14, { align: 'center', font: 'small', color: 'whiteSoft' });
  }
}
export function chooseBoth(sides, opts = {}) { return new Promise(res => pushOverlay(new DualChoice(sides, { ...opts, onDone: res }))); }

export function choose(title, cards, opts = {})"""),
])
rep('web/src/scenes/rewards.js', [
    ("import { say, choose, Banner, drawPortrait, ICON, drawOW, Choice } from './ui.js';", "import { say, choose, chooseBoth, Banner, drawPortrait, ICON, drawOW, Choice } from './ui.js';"),
    ("    case 'boon': await offerBoons(scene, r.legend); await asP2(scene, () => offerBoons(scene, r.legend)); break; // co-op: each player picks their own",
     "    case 'boon': await offerBoons(scene, r.legend); break; // co-op: both players pick their own at the same time"),
    ("async function offerBoons(scene, legend) {\n  const run = G.run, L = LEGENDS[legend];",
     "async function offerBoons(scene, legend) {\n  if (Coop.active && scene.world?.p2 && Coop.p2 && !G.run.isP2) return offerBoonsBoth(scene, legend);\n  const run = G.run, L = LEGENDS[legend];"),
    ("// Left panel on the boon screen:", r"""// Co-op: the legend offers each player their own three blessings, picked at the same time.
async function offerBoonsBoth(scene, legend) {
  const L = LEGENDS[legend], runs = [G.run, Coop.p2.run];
  const chs = runs.map(r => boonChoices(r, legend));
  if (!chs[0].length && !chs[1].length) { await say([{ text: `${L.name} has nothing more to offer. It leaves you a RARE CANDY.`, portrait: L.dex }]); return applyReward(scene, { kind: 'rare_candy' }); }
  Sound.playCry(L.cry);
  const picks = await chooseBoth(runs.map((r, i) => ({
    title: i === 0 ? `PLAYER 1 - ${Cloud.me?.name || 'YOU'}` : `PLAYER 2 - ${Coop.guest?.name || 'P2'}`,
    cards: chs[i].map(c => boonCard(r, c)),
    empty: `${L.name} has nothing more for this player.`,
    owned: (ctx, x, y, w, sel) => drawOwnedCompact(ctx, r, BOONS[chs[i][sel]?.key]?.slot, x, y, w),
  })), {
    header: ctx => {
      drawPortrait(ctx, L.dex, W / 2 - 120, 10, 'Normal');
      text(ctx, L.name, W / 2 - 70, 12, { color: [L.color, '#202020'], scale: 2 });
      text(ctx, L.title + ' offers each of you its power.', W / 2 - 70, 42, { color: 'whiteSoft', font: 'small' });
    },
  });
  picks.forEach((p, i) => { if (p >= 0) addBoon(runs[i], chs[i][p]); });
  refreshPlayer(scene); coopRefreshP2(scene);
  if (picks.some(p => p >= 0)) Sound.playSE('se_m_stat_increase');
}
function drawOwnedCompact(ctx, run, slot, x, y, w) {
  const list = [...run.boons];
  text(ctx, list.length ? 'BLESSINGS' : 'No blessings yet.', x + 4, y, { font: 'small', color: 'gray' });
  list.slice(0, 8).forEach((b, i) => {
    const def = BOONS[b.key], rar = RARITY[b.rarity], cx = x + 4 + (i % 2) * (w / 2), cy = y + 12 + Math.floor(i / 2) * 11;
    const repl = slot && slot !== 'passive' && def.slot === slot;
    text(ctx, (repl ? 'x ' : '') + def.name, cx, cy, { font: 'small', color: repl ? 'red' : [rar.color, '#202020'] });
  });
}

// Left panel on the boon screen:"""),
])
print('ok')
