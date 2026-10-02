// Title screen: FireRed's title art (Charizard + flames) with our name, Continue / New run, and cloud
// sign-in (email-keyed saves in Convex).
import { Engine, W, H, inRect } from '../engine/core.js';
import { img, ready } from '../engine/assets.js';
import { text, measure } from '../engine/font.js';
import { pixBox } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { G, loadRunSave } from '../game/run.js';
import { Cloud, signIn, signOut, createInviteLink } from '../game/cloud.js';
import { toHub, continueRun } from './rewards.js';
import { preloadPmd } from '../game/pmd.js';

export class TitleScene {
  constructor(opts = {}) { this.t = 0; this.sel = 0; this.opts = opts; this.msg = opts.saved ? 'Saved! Your run will continue from the start of that room.' : ''; }
  enter() { Sound.playBGM('mus_title'); preloadPmd([4, 1, 7, 150]); Input.clear(); }
  exit() { this.closeInput(); }

  items() {
    const save = loadRunSave();
    const list = [];
    if (save) list.push({ label: `Continue: ${save.label || 'run in progress'}`, fn: () => { Sound.playSE('se_select'); if (!continueRun()) toHub(); } });
    list.push({ label: save ? "New run (Oak's lab)" : "Start (Oak's lab)", fn: () => { Sound.playSE('se_select'); toHub(); } });
    if (Cloud.url) {
      if (Cloud.email) list.push({ label: `Signed in: ${Cloud.email} (sign out)`, fn: () => signOut() });
      else list.push({ label: 'Sign in with Google to sync saves', fn: () => signIn().catch(e => { this.msg = e.message; }) });
      if (Cloud.me?.canInvite) list.push({ label: 'Make an invite link', fn: () => this.makeInvite() });
    }
    return list;
  }

  update(dt) {
    this.t += dt;
    if (this.input) return; // typing in the email box
    Input.poll();
    const items = this.items();
    if (Input.justPressed('up')) { this.sel = (this.sel + items.length - 1) % items.length; Sound.playSE('se_select'); }
    if (Input.justPressed('down')) { this.sel = (this.sel + 1) % items.length; Sound.playSE('se_select'); }
    this.sel = Math.min(this.sel, items.length - 1);
    const boxes = this.boxes(items);
    boxes.forEach((b, i) => { if (inRect(b.x, b.y, b.w, b.h) && (Engine.mouse.x !== this.mx || Engine.mouse.y !== this.my)) this.sel = i; });
    this.mx = Engine.mouse.x; this.my = Engine.mouse.y;
    if (this.t > 0.5 && (Input.justPressed('confirm') || (Engine.mouse.clicked && boxes.some(b => inRect(b.x, b.y, b.w, b.h))))) items[this.sel].fn();
  }

  boxes(items) {
    const w = 360, h = 20, y0 = 326;
    return items.map((_, i) => ({ x: (W - w) / 2, y: y0 + i * (h + 4), w, h }));
  }

  draw(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const bg = img('gfx/ui/title/title_screen.png');
    const s = 2, bw = 240 * s, bh = 160 * s, bx = (W - bw) / 2;
    if (ready(bg)) ctx.drawImage(bg, bx, 0, bw, bh);
    ctx.fillStyle = '#000'; ctx.fillRect(0, bh - 70, W, H - bh + 70);
    text(ctx, 'KANTO DESCENT', W / 2, bh - 64, { align: 'center', color: ['#f8d030', '#702000'], scale: 3 });
    text(ctx, 'a FireRed x Hades roguelike', W / 2, bh - 20, { align: 'center', color: 'whiteSoft' });
    const items = this.items();
    this.boxes(items).forEach((b, i) => {
      const on = i === this.sel;
      pixBox(ctx, b.x, b.y, b.w, b.h, on ? '#283048' : '#141824', on ? '#f8d030' : '#404860', 3);
      const label = items[i].label;
      if (label.includes('@')) mixedText(ctx, label, W / 2, b.y + 3, on ? '#f8d030' : '#ffffff');
      else text(ctx, label, W / 2, b.y + 4, { align: 'center', color: on ? 'gold' : 'white', font: measure(label) > b.w - 16 ? 'small' : 'normal' });
    });
    const status = Cloud.error && !Cloud.email ? Cloud.error : !Cloud.email ? 'Saves are kept in this browser. Sign in to sync them to the cloud.' : Cloud.status === 'offline' ? 'Cloud offline - saving locally, will sync later.' : Cloud.status === 'syncing' ? 'Syncing...' : 'Synced to the cloud.';
    const m = this.msg || status;
    if (m.includes('@')) mixedText(ctx, m, W / 2, H - 32, this.msg ? '#a8ff60' : '#a0a0a0', true);
    else text(ctx, m, W / 2, H - 32, { align: 'center', font: 'small', color: this.msg ? 'lime' : 'gray' });
    text(ctx, `Runs ${G.meta.runs}  ·  Escapes ${G.meta.wins}`, W - 10, H - 16, { align: 'right', font: 'small', color: 'gray' });
    text(ctx, 'Fan project. Pokémon (c) Nintendo/Game Freak/Creatures. Sprites: PMDCollab (CC BY-NC).', 10, H - 16, { font: 'small', color: 'gray' });
  }

  // ---- invite links (owner only): a one-time link that adds whoever signs in with it
  async makeInvite() {
    if (this.input) return;
    this.msg = 'Making an invite link...';
    let link;
    try { link = await createInviteLink(); } catch (e) { this.msg = e.message; return; }
    try { await navigator.clipboard?.writeText(link); } catch { /* clipboard blocked */ }
    this.msg = 'Invite link copied to the clipboard.';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:10;font:15px monospace;';
    wrap.innerHTML = `<div style="background:#f8f8f0;border:3px solid #283040;border-radius:6px;padding:18px 20px;width:460px;color:#303030">
      <div style="font-weight:bold;margin-bottom:6px">One-time invite link</div>
      <div style="font-size:13px;margin-bottom:10px">The first person to sign in with this link joins the playtest. It expires in 14 days.</div>
      <input readonly style="width:100%;box-sizing:border-box;padding:8px;font:13px monospace;border:2px solid #506878;border-radius:4px">
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
        <button type="button" data-a="copy" style="padding:6px 12px">Copy</button>
        <button type="button" data-a="close" style="padding:6px 14px;background:#3060c0;color:#fff;border:0;border-radius:4px">Done</button>
      </div></div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('input');
    input.value = link; input.select();
    wrap.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') this.closeInput(); });
    wrap.addEventListener('keyup', e => e.stopPropagation());
    wrap.querySelector('[data-a="copy"]').onclick = async () => { input.select(); try { await navigator.clipboard.writeText(link); } catch { document.execCommand?.('copy'); } this.msg = 'Invite link copied.'; };
    wrap.querySelector('[data-a="close"]').onclick = () => this.closeInput();
    this.input = wrap;
  }
  closeInput() {
    if (!this.input) return;
    this.input.remove(); this.input = null;
    Engine.keys.clear(); Input.clear();
    document.getElementById('game')?.focus();
  }
}

// The FireRed font has no "@": draw text containing an email with a plain monospace font.
function mixedText(ctx, str, cx, y, color, small) {
  ctx.save();
  ctx.font = `${small ? 11 : 13}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#202020'; ctx.fillText(str, cx + 1, y + 2);
  ctx.fillStyle = color; ctx.fillText(str, cx, y + 1);
  ctx.restore();
}
