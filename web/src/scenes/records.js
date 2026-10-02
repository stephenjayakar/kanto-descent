// Records (from Kanto Spire's records screen): everyone's runs, your runs and the best trainers, from
// Convex. Signed out, MY RUNS shows the runs saved in this browser. Also the trainer-name prompt.
import { Engine, W, H, setScene, pushOverlay, hover } from '../engine/core.js';
import { img, ready } from '../engine/assets.js';
import { text, wrap } from '../engine/font.js';
import { swirlBackground, panel, pixBox, drawTips, tip, THEME } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { D } from '../game/data.js';
import { G } from '../game/run.js';
import { BIOMES, STARTERS } from '../game/content.js';
import { Cloud, rename, signOut, createInviteLink, leaderboard, topTrainers, myRuns } from '../game/cloud.js';
import { scoreRun } from '../game/score.js';
import { VERSION, PATCH_NOTES } from '../game/version.js';
import { FocusNav, Modal, ChoiceModal } from './modal.js';
import { TitleScene } from './title.js';
import { toHub } from './rewards.js';

const TABS = [
  { key: 'all', label: 'ALL RUNS' },
  { key: 'mine', label: 'MY RUNS' },
  { key: 'trainers', label: 'TRAINERS' },
];
// Version filter: ALL first (the default), then every version with patch notes, newest first.
const VERSIONS = [...new Set([VERSION, ...PATCH_NOTES.map(p => p.v)])];
const VERSION_FILTERS = ['all', ...VERSIONS];
const STARTER_FILTERS = ['all', ...STARTERS.map(s => s.species)];
const RESULT = { win: ['ESCAPED', 'green'], lose: ['LOST', 'red'] };
const ROWS = 11;

function ago(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
const speciesName = k => D.species?.[k]?.name || k || '?';
function drawMonIcon(ctx, key, x, y) {
  const sp = D.species?.[key];
  if (!sp?.sprites?.icon) return;
  const im = img(`gfx/pokemon/${sp.sprites.icon.split('/')[0]}/icon.png`);
  if (ready(im)) ctx.drawImage(im, 0, 0, 32, 32, Math.round(x), Math.round(y), 32, 32);
}
// a run saved in this browser (G.meta.history) in the same shape as the server's rows
function localRow(e) {
  return {
    name: Cloud.me?.name || 'YOU', me: true, score: e.score ?? scoreRun(e), result: e.won ? 'win' : 'lose', version: e.version || 'v0.0.1',
    heat: e.heat || 0, starter: e.starter, species: e.species, partner: e.partner || null, level: e.level || 0,
    biome: e.biome || 0, room: e.room || 0, time: e.time || 0, kills: e.kills || 0, at: e.at || Date.now(),
  };
}

export class RecordsScene {
  // opts.fromHub: opened by the AIDE in OAK's lab, so BACK returns there
  constructor(opts = {}) { this.opts = opts; this.nav = new FocusNav('tab-all'); }
  enter() { this.t = 0; this.tab = 'all'; this.version = 'all'; this.starter = 'all'; this.sort = 'recent'; Input.clear(); this.load(); }
  back() { if (this.opts.fromHub) toHub(); else setScene(new TitleScene({ started: true })); }

  async load() {
    const tab = this.tab, version = this.version === 'all' ? null : this.version;
    const token = this.loadToken = (this.loadToken || 0) + 1; // a newer load (tab or filter change) wins
    this.rows = null; this.error = null; this.mine = null; this.local = false;
    const signedIn = !!Cloud.email;
    if (!signedIn && tab === 'mine') {
      // runs kept in this browser
      const rows = (G.meta.history || []).map(localRow).filter(r => !version || r.version === version);
      this.local = true; this.rows = rows.slice(0, ROWS);
      this.mine = { player: { name: 'THIS BROWSER', runs: G.meta.runs || rows.length, wins: G.meta.wins || 0, bestScore: Math.max(0, ...rows.map(r => r.score)) } };
      return;
    }
    if (!Cloud.url) { this.error = 'Online records are off in this build. MY RUNS shows the runs saved in this browser.'; return; }
    if (!signedIn) { this.error = 'Sign in with Google on the title screen to see everyone’s records. MY RUNS shows the runs saved in this browser.'; return; }
    try {
      let rows;
      if (tab === 'trainers') rows = await topTrainers(version, ROWS);
      else if (tab === 'mine') { const r = await myRuns(version, ROWS); if (this.loadToken === token) this.mine = r; rows = r ? r.recent : []; }
      else rows = await leaderboard({ version, sort: this.sort, starter: this.starter === 'all' ? null : this.starter, limit: ROWS });
      if (this.loadToken === token) this.rows = rows;
    } catch (e) { if (this.loadToken === token) this.error = e.message; }
  }

  update(dt) {
    this.t += dt;
    Input.poll();
    if (Input.justPressed('back') && this.t > 0.2) { Sound.playSE('se_select'); return this.back(); }
    if (this.t > 0.2) this.nav.update();
  }

  // A one-time invite link, copied to the clipboard (owner only; the server checks too).
  async makeInvite() {
    if (this.inviting) return;
    this.inviting = true;
    try {
      const link = await createInviteLink();
      let copied = false;
      try { await navigator.clipboard.writeText(link); copied = true; } catch { /* clipboard blocked */ }
      pushOverlay(new ChoiceModal({ title: 'ONE-TIME INVITE LINK', w: 460,
        body: `${link}\n\n${copied ? 'Copied to your clipboard. ' : ''}The first Google account that signs in with it can play. It expires in 14 days.`,
        options: [{ label: 'OK', value: 0 }] }));
    } catch (e) {
      pushOverlay(new ChoiceModal({ title: 'Could not make a link', body: e.message, options: [{ label: 'OK', value: 0 }] }));
    }
    this.inviting = false;
  }

  draw(ctx) {
    swirlBackground(ctx, ['#102040', '#204080', '#183060'], 0.3);
    const nav = this.nav;
    nav.begin(Engine.overlays.length > 0);
    text(ctx, 'RECORDS', 12, 6, { color: 'white', scale: 2 });
    const p = Cloud.email ? Cloud.me : null;
    text(ctx, p ? `TRAINER ${p.name || '?'}` : 'Not signed in', 170, 6, { color: p ? 'gold' : 'gray' });
    text(ctx, p ? `${Cloud.email.replace('@', ' at ')} · ${Cloud.status === 'offline' ? 'offline' : 'synced'}` : this.local ? 'Showing the runs saved in this browser' : 'Sign in on the title screen', 170, 21, { color: 'gray', font: 'small' });

    // top-right buttons
    let bx = W - 80;
    nav.button(ctx, 'back', 'BACK', bx, 6, 70, 22, { color: '#806060' }, () => this.back());
    if (p) {
      bx -= 86; nav.button(ctx, 'signout', 'SIGN OUT', bx, 6, 80, 22, { color: '#605070', font: 'small' }, () => signOut());
      bx -= 82; nav.button(ctx, 'rename', 'RENAME', bx, 6, 76, 22, { color: '#506080', font: 'small' }, () => pushOverlay(new NameModal({ onClose: v => { if (v) this.load(); } })));
      if (p.canInvite) { bx -= 76; nav.button(ctx, 'invite', this.inviting ? '...' : 'INVITE', bx, 6, 70, 22, { color: '#3a9a58', font: 'small' }, () => this.makeInvite()); }
    }

    // tabs and filters
    TABS.forEach((t, i) => {
      nav.button(ctx, 'tab-' + t.key, t.label, 12 + i * 90, 36, 86, 20, { color: this.tab === t.key ? THEME.play : '#404860', font: 'small' }, () => { if (this.tab !== t.key) { this.tab = t.key; this.load(); } });
    });
    if (this.tab === 'all') {
      const fx = 290, fw = 120;
      const label = this.starter === 'all' ? 'ALL STARTERS' : speciesName(this.starter);
      nav.button(ctx, 'starter', label, fx, 36, fw, 20, { color: this.starter === 'all' ? '#404860' : '#7a4a30', font: 'small' }, () => {
        this.starter = STARTER_FILTERS[(STARTER_FILTERS.indexOf(this.starter) + 1) % STARTER_FILTERS.length]; this.load();
      });
      if (hover(fx, 36, fw, 20)) tip('STARTER', 'Show runs with one starter, or all of them. Click to switch.', { width: 190 });
      const sx = fx + fw + 6, sw = 96;
      nav.button(ctx, 'sort', this.sort === 'recent' ? 'NEWEST' : 'TOP SCORE', sx, 36, sw, 20, { color: '#404860', font: 'small' }, () => { this.sort = this.sort === 'recent' ? 'score' : 'recent'; this.load(); });
      if (hover(sx, 36, sw, 20)) tip('SORT', 'NEWEST: most recent runs first. TOP SCORE: highest scores first. Click to switch.', { width: 200 });
    }
    const vx = W - 160, vw = 150;
    nav.button(ctx, 'version', this.version === 'all' ? 'ALL VERSIONS' : `VERSION ${this.version}`, vx, 36, vw, 20, { color: this.version === 'all' ? '#404860' : '#5a4a8a', font: 'small' }, () => {
      this.version = VERSION_FILTERS[(VERSION_FILTERS.indexOf(this.version) + 1) % VERSION_FILTERS.length]; this.load();
    });
    if (hover(vx, 36, vw, 20)) tip('GAME VERSION', `Show records from one version of the game, or all of them. Click to switch (${VERSION_FILTERS.map(v => v === 'all' ? 'ALL' : v).join(' / ')}).`, { width: 210 });
    nav.end();

    panel(ctx, 8, 62, W - 16, H - 70);
    this.drawList(ctx);
    text(ctx, 'ARROWS: move · ENTER: select · ESC: back', W - 14, H - 18, { align: 'right', color: 'gray', font: 'small' });
    drawTips(ctx);
  }

  drawList(ctx) {
    const cy = 200;
    if (this.error) { wrapCenter(ctx, this.error, cy, 'whiteSoft'); return; }
    if (!this.rows) { text(ctx, 'Loading...', W / 2, cy, { align: 'center', color: 'gray' }); return; }
    if (!this.rows.length) {
      const what = this.tab === 'mine' ? 'You have no runs' : 'No runs recorded';
      text(ctx, this.version === 'all' ? `${what} yet. Head for CERULEAN CAVE!` : `${what} on ${this.version} yet. Head for CERULEAN CAVE!`, W / 2, cy, { align: 'center', color: 'whiteSoft' });
      return;
    }
    if (this.tab === 'trainers') this.drawTrainers(ctx); else this.drawRuns(ctx);
  }

  drawRuns(ctx) {
    const y0 = 70;
    const cols = [['NO.', 18], ['TRAINER', 44], ['SCORE', 150], ['RESULT', 214], ['HEAT', 282], ['TEAM', 326], ['REACHED', 466], ['WHEN', 648]];
    for (const [h, x] of cols) text(ctx, h, x, y0, { color: 'gray', font: 'small' });
    if (this.tab === 'mine' && this.mine) {
      const m = this.mine.player;
      text(ctx, `${m.runs} runs · ${m.wins} escapes · best score ${m.bestScore.toLocaleString()}`, 290, 41, { color: 'gold', font: 'small' });
    }
    this.rows.slice(0, ROWS).forEach((r, i) => {
      const y = y0 + 14 + i * 30;
      pixBox(ctx, 14, y - 2, W - 28, 28, r.me && this.tab !== 'mine' ? '#34406a' : i % 2 ? '#262c3c' : '#2e3548', null, 2);
      const [label, color] = RESULT[r.result] || RESULT.lose;
      const ty = y + 7;
      text(ctx, String(i + 1), 20, ty, { color: i < 3 && this.tab === 'all' && this.sort === 'score' ? 'gold' : 'white', font: 'small' });
      text(ctx, r.name, 44, ty, { color: r.me ? 'gold' : 'white', font: 'small' });
      text(ctx, (r.score || 0).toLocaleString(), 150, ty, { color: 'white', font: 'small' });
      text(ctx, label, 214, ty, { color, font: 'small' });
      text(ctx, r.heat ? String(r.heat) : '-', 290, ty, { color: r.heat ? 'orange' : 'gray', font: 'small', align: 'center' });
      // team: the starter (as it ended up) and the partner caught on the way
      const mon = r.species || r.starter;
      drawMonIcon(ctx, mon, 322, y - 6);
      if (r.partner) drawMonIcon(ctx, r.partner, 354, y - 6);
      if (hover(322, y - 2, 64, 28)) tip(speciesName(mon) + (r.level ? ` Lv${r.level}` : ''), `${r.starter && r.starter !== mon ? `Started as ${speciesName(r.starter)}. ` : ''}${r.partner ? `Partner: ${speciesName(r.partner)}.` : 'No partner caught.'}${r.kills ? ` ${r.kills} KOs.` : ''}${r.time ? ` Time ${fmt(r.time)}.` : ''}`, { width: 200 });
      if (r.level) text(ctx, `Lv${r.level}`, 392, ty, { color: 'whiteSoft', font: 'small' });
      const B = BIOMES[r.biome];
      const reached = r.result === 'win' ? 'ESCAPED CERULEAN CAVE' : B ? `${B.name} ${r.room >= B.rooms ? 'BOSS' : `${r.room + 1}/${B.rooms + 1}`}` : '?';
      text(ctx, reached, 466, ty, { color: r.result === 'win' ? 'lime' : 'whiteSoft', font: 'small' });
      text(ctx, ago(r.at), 648, y + 1, { color: 'gray', font: 'small' });
      text(ctx, r.version || '', 648, y + 13, { color: r.version === VERSION ? 'lime' : 'purple', font: 'small' });
    });
  }

  drawTrainers(ctx) {
    const y0 = 70;
    for (const [h, x] of [['NO.', 18], ['TRAINER', 44], ['BEST SCORE', 230], ['RUNS', 370], ['ESCAPES', 450], ['ESCAPE RATE', 550]]) text(ctx, h, x, y0, { color: 'gray', font: 'small' });
    if (this.version !== 'all') text(ctx, `on ${this.version}`, W - 20, y0, { align: 'right', color: 'gold', font: 'small' });
    this.rows.slice(0, ROWS).forEach((p, i) => {
      const y = y0 + 14 + i * 30;
      pixBox(ctx, 14, y - 2, W - 28, 28, p.me ? '#34406a' : i % 2 ? '#262c3c' : '#2e3548', null, 2);
      text(ctx, String(i + 1), 20, y + 6, { color: i < 3 ? 'gold' : 'white', font: 'small' });
      text(ctx, p.name, 44, y + 5, { color: p.me ? 'gold' : 'white' });
      text(ctx, p.bestScore.toLocaleString(), 230, y + 6, { color: 'white', font: 'small' });
      text(ctx, String(p.runs), 370, y + 6, { color: 'whiteSoft', font: 'small' });
      text(ctx, String(p.wins), 450, y + 6, { color: 'whiteSoft', font: 'small' });
      text(ctx, p.runs ? Math.round((100 * p.wins) / p.runs) + '%' : '-', 550, y + 6, { color: 'whiteSoft', font: 'small' });
    });
  }
}

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function wrapCenter(ctx, str, y, color) {
  wrap(str, 520, 'normal').forEach((l, i) => text(ctx, l, W / 2, y + i * 16, { align: 'center', color }));
}

// Trainer name prompt: a canvas panel with a real <input> laid over it, so typing works everywhere.
export class NameModal extends Modal {
  enter() {
    super.enter();
    const canvas = Engine.canvas || document.getElementById('game');
    const r = canvas.getBoundingClientRect(), s = r.width / W;
    const el = this.input = document.createElement('input');
    el.maxLength = 12;
    el.value = Cloud.me?.name || '';
    el.placeholder = 'RED';
    Object.assign(el.style, {
      position: 'fixed', left: `${r.left + (W / 2 - 90) * s}px`, top: `${r.top + (H / 2 - 18) * s}px`,
      width: `${180 * s}px`, height: `${22 * s}px`, font: `${12 * s}px monospace`, textAlign: 'center', zIndex: 10,
      background: '#f8f8f8', color: '#202020', border: `${2 * s}px solid #0d1018`, borderRadius: `${3 * s}px`, outline: 'none', textTransform: 'uppercase',
    });
    el.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') this.submit();
      if (e.key === 'Escape') this.close(null);
    });
    el.addEventListener('keyup', e => e.stopPropagation());
    document.body.appendChild(el);
    setTimeout(() => el.focus(), 0);
  }
  update(dt) { this.t += dt; if (Engine.mouse.rclicked) this.close(null); } // typing goes to the <input>
  async submit() {
    if (this.busy) return;
    this.busy = true; this.error = null;
    try { await rename(this.input.value.toUpperCase()); this.close(true); }
    catch (e) { this.error = e.message; this.busy = false; }
  }
  close(v) {
    if (this.closed) return;
    this.closed = true;
    this.input?.remove();
    Engine.keys.clear(); Input.clear();
    Engine.canvas?.focus?.();
    super.close(v);
  }
  draw(ctx) {
    this.dim(ctx);
    this.nav.begin();
    const w = 320, h = 130, x = (W - w) / 2, y = (H - h) / 2 - 10;
    panel(ctx, x, y, w, h);
    text(ctx, 'CHANGE TRAINER NAME', W / 2, y + 8, { align: 'center', color: 'white' });
    text(ctx, 'Everyone sees your runs under this name (2-12 letters).', W / 2, y + 26, { align: 'center', color: 'whiteSoft', font: 'small' });
    if (this.error) text(ctx, this.error, W / 2, y + 72, { align: 'center', color: 'red', font: 'small' });
    this.btn(ctx, 'ok', this.busy ? 'SAVING...' : 'OK', W / 2 - 104, y + h - 32, 100, 24, { color: THEME.green, disabled: this.busy }, () => this.submit());
    this.btn(ctx, 'cancel', 'CANCEL', W / 2 + 4, y + h - 32, 100, 24, { color: '#506080' }, () => this.close(null));
    this.nav.end();
  }
}

// One line for an end-of-run screen: the run's score and whether it reached the cloud.
export function cloudStatusLine() {
  const r = Cloud.lastResult;
  if (!r) return null;
  if (r.status === 'saved') return [`Saved online · score ${(r.score || 0).toLocaleString()}`, 'gold'];
  if (r.status === 'local') return [`Score ${(r.score || 0).toLocaleString()} · sign in to put your runs online`, 'whiteSoft'];
  if (r.status === 'error') return [`Score ${(r.score || 0).toLocaleString()} · not uploaded (${r.message})`, 'orange'];
  return ['Uploading run...', 'gray'];
}
