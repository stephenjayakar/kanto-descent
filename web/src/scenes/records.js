// Records (from Kanto Spire's records screen): everyone's runs, your runs and the best trainers, from
// Convex. Signed out, MY RUNS shows the runs saved in this browser. Also the trainer-name prompt.
import { Engine, W, H, setScene, pushOverlay, hover, inRect } from '../engine/core.js';
import { text, wrap, measure } from '../engine/font.js';
import { frBackdrop, panel, rect, drawTips, tip, THEME } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { D } from '../game/data.js';
import { G } from '../game/run.js';
import { BIOMES, STARTERS, areaByKey } from '../game/content.js';
import { BOONS } from '../game/boons.js';
import { Cloud, rename, signOut, createInviteLink, leaderboard, topTrainers, myRuns, starterRecords } from '../game/cloud.js';
import { scoreRun } from '../game/score.js';
import { VERSION, PATCH_NOTES } from '../game/version.js';
import { FocusNav, Modal, ChoiceModal, focusRing } from './modal.js';
import { drawMonIcon, drawDmgCard, dmgLabel, fmtDmg } from './dmgpanel.js';
import { TitleScene } from './title.js';
import { toHub } from './rewards.js';

const TABS = [
  { key: 'all', label: 'ALL RUNS' },
  { key: 'mine', label: 'MY RUNS' },
  { key: 'trainers', label: 'TRAINERS' },
  { key: 'starters', label: 'BY POKéMON' }, // each starter is its own challenge (pick one for your runs with it)
];
// Version filter: ALL first (the default), then every version with patch notes, newest first.
const VERSIONS = [...new Set([VERSION, ...PATCH_NOTES.map(p => p.v)])];
const VERSION_FILTERS = ['all', ...VERSIONS];
const STARTER_FILTERS = ['all', ...STARTERS.map(s => s.species)];
const RESULT = { win: ['ESCAPED', 'green'], lose: ['LOST', 'red'] };
const ROWS = 11, ROW_H = 28; // runs / trainers rows inside the FireRed window
const ROW_BG = ['#ffffff', '#eef2f8'], ME_BG = '#fff4c8';
const ON_BAR = ['#ffffff', '#5a0000']; // text on the title screen's dark red bar

function ago(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
const speciesName = k => D.species?.[k]?.name || k || '?';
const reachedOf = r => {
  if (r.result === 'win') return 'ESCAPED';
  const B = (r.area && areaByKey(r.area)) || BIOMES[r.biome];
  return B ? `${B.name} ${r.room >= B.rooms ? 'BOSS' : `${r.room + 1}/${B.rooms + 1}`}` : '?';
};
// a run saved in this browser (G.meta.history) in the same shape as the server's rows
function localRow(e) {
  return {
    name: Cloud.me?.name || 'YOU', me: true, score: e.score ?? scoreRun(e), result: e.won ? 'win' : 'lose', version: e.version || 'v0.0.1',
    heat: e.heat || 0, starter: e.starter, species: e.species, partner: e.partner || null, level: e.level || 0,
    biome: e.biome || 0, room: e.room || 0, area: e.area || null, time: e.time || 0, kills: e.kills || 0, at: e.at || Date.now(), coop: e.coop || null,
    boons: e.boons || [], dmg: e.dmg || null, dmg2: e.dmg2 || null,
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
    if (tab === 'starters' && !(signedIn && Cloud.url)) { // signed out: your record per starter from this browser
      const rows = (G.meta.history || []).map(localRow).filter(r => !version || r.version === version);
      this.local = !signedIn;
      this.rows = STARTERS.map(s => {
        const mine = rows.filter(r => r.starter === s.species), best = mine.reduce((b, r) => (!b || r.score > b.score ? r : b), null);
        return { starter: s.species, best: null, mine: { runs: mine.length, wins: mine.filter(r => r.result === 'win').length, bestScore: best?.score || 0, best } };
      });
      return;
    }
    const starter = this.starter === 'all' ? null : this.starter;
    if (!signedIn && tab === 'mine') {
      // runs kept in this browser
      const rows = (G.meta.history || []).map(localRow).filter(r => (!version || r.version === version) && (!starter || r.starter === starter));
      this.local = true; this.rows = rows.slice(0, ROWS);
      this.mine = { player: { name: 'THIS BROWSER', runs: starter ? rows.length : G.meta.runs || rows.length, wins: starter ? rows.filter(r => r.result === 'win').length : G.meta.wins || 0, bestScore: Math.max(0, ...rows.map(r => r.score)) } };
      return;
    }
    if (!Cloud.url) { this.error = 'Online records are off in this build. MY RUNS shows the runs saved in this browser.'; return; }
    if (!signedIn) { this.error = 'Sign in with Google on the title screen to see everyone’s records. MY RUNS shows the runs saved in this browser.'; return; }
    try {
      let rows;
      if (tab === 'trainers') rows = await topTrainers(version, ROWS);
      else if (tab === 'starters') rows = await starterRecords(STARTERS.map(s => s.species), version);
      else if (tab === 'mine') { const r = await myRuns(version, ROWS, starter); if (this.loadToken === token) this.mine = r; rows = r ? r.recent : []; }
      else rows = await leaderboard({ version, sort: this.sort, starter, limit: ROWS });
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
    frBackdrop(ctx, { band: [0, 0] }); // the title screen's black, orange stripe and red bar
    const nav = this.nav;
    nav.begin(Engine.overlays.length > 0);
    text(ctx, 'RECORDS', 12, 10, { color: ['#ffffff', '#d64229'], scale: 2 });
    const p = Cloud.email ? Cloud.me : null;
    text(ctx, p ? `TRAINER ${p.name || '?'}` : 'Not signed in', 170, 9, { color: p ? 'gold' : 'gray' });
    text(ctx, p ? `${Cloud.email.replace('@', ' at ')} · ${Cloud.status === 'offline' ? 'offline' : 'synced'}` : this.local ? 'Showing the runs saved in this browser' : 'Sign in on the title screen', 170, 23, { color: 'gray', font: 'small' });

    // top-right buttons
    let bx = W - 80;
    nav.button(ctx, 'back', 'BACK', bx, 10, 70, 22, { color: THEME.discard }, () => this.back());
    if (p) {
      bx -= 86; nav.button(ctx, 'signout', 'SIGN OUT', bx, 10, 80, 22, { font: 'small' }, () => signOut());
      bx -= 82; nav.button(ctx, 'rename', 'RENAME', bx, 10, 76, 22, { font: 'small' }, () => pushOverlay(new NameModal({ onClose: v => { if (v) this.load(); } })));
      if (p.canInvite) { bx -= 76; nav.button(ctx, 'invite', this.inviting ? '...' : 'INVITE', bx, 10, 70, 22, { color: THEME.green, font: 'small' }, () => this.makeInvite()); }
    }

    // tabs and filters
    TABS.forEach((t, i) => {
      nav.button(ctx, 'tab-' + t.key, t.label, 12 + i * 90, 36, 86, 20, { color: this.tab === t.key ? THEME.play : null, selected: this.tab === t.key, font: 'small' }, () => { if (this.tab !== t.key) { this.tab = t.key; this.load(); } });
    });
    if (this.tab === 'all' || this.tab === 'mine') {
      const fx = 384, fw = 116;
      const label = this.starter === 'all' ? 'ALL POKéMON' : speciesName(this.starter);
      nav.button(ctx, 'starter', label, fx, 36, fw, 20, { color: this.starter === 'all' ? null : THEME.discard, font: 'small' }, () => {
        this.starter = STARTER_FILTERS[(STARTER_FILTERS.indexOf(this.starter) + 1) % STARTER_FILTERS.length]; this.load();
      });
      if (hover(fx, 36, fw, 20)) tip('STARTER', 'Show runs with one starter POKéMON, or all of them. Click to switch. BY POKéMON has a row for each.', { width: 200 });
    }
    if (this.tab === 'all') {
      const sx = 384 + 116 + 6, sw = 96;
      nav.button(ctx, 'sort', this.sort === 'recent' ? 'NEWEST' : 'TOP SCORE', sx, 36, sw, 20, { font: 'small' }, () => { this.sort = this.sort === 'recent' ? 'score' : 'recent'; this.load(); });
      if (hover(sx, 36, sw, 20)) tip('SORT', 'NEWEST: most recent runs first. TOP SCORE: highest scores first. Click to switch.', { width: 200 });
    }
    const vx = W - 160, vw = 150;
    nav.button(ctx, 'version', this.version === 'all' ? 'ALL VERSIONS' : `VERSION ${this.version}`, vx, 36, vw, 20, { color: this.version === 'all' ? null : THEME.play, font: 'small' }, () => {
      this.version = VERSION_FILTERS[(VERSION_FILTERS.indexOf(this.version) + 1) % VERSION_FILTERS.length]; this.load();
    });
    if (hover(vx, 36, vw, 20)) tip('GAME VERSION', `Show records from one version of the game, or all of them. Click to switch (${VERSION_FILTERS.map(v => v === 'all' ? 'ALL' : v).join(' / ')}).`, { width: 210 });

    panel(ctx, 6, 62, W - 12, H - 86);
    this.drawList(ctx); // its rows are focusable too
    nav.end();
    text(ctx, `ARROWS: move · ${Input.label('confirm')}: select · ${Input.label('back')}: back`, W - 10, H - 17, { align: 'right', color: ON_BAR, font: 'small' });
    if (this.tab === 'mine' && this.mine) {
      const m = this.mine.player;
      text(ctx, `${this.starter === 'all' ? '' : speciesName(this.starter) + ': '}${m.runs} runs · ${m.wins} escapes · best ${m.bestScore.toLocaleString()}`, 10, H - 17, { color: ['#ffd84a', '#5a0000'], font: 'small' });
    } else if (this.tab !== 'trainers' && this.rows?.length) text(ctx, this.tab === 'starters' ? 'Pick a POKéMON to see your runs with it' : 'Pick a run to see its team and damage', 10, H - 17, { color: ON_BAR, font: 'small' });
    drawTips(ctx);
  }

  // a list row the keyboard can focus (a FocusNav item) and the mouse can pick
  row(ctx, key, x, y, w, h, fn) {
    const nav = this.nav, m = Engine.mouse;
    nav.next.push({ key, x, y, w, h, fn });
    if (nav.blocked) return;
    if ((m.x !== nav.mx || m.y !== nav.my) && inRect(x, y, w, h)) nav.focus = key;
    if (nav.focus === key) focusRing(ctx, x, y, w, h);
    if (m.clicked && inRect(x, y, w, h)) { m.clicked = false; Sound.playSE('se_select'); fn(); }
  }
  openRun(r) { pushOverlay(new RunDetailModal({ run: r })); }

  drawList(ctx) {
    const cy = 200;
    if (this.error) { wrapCenter(ctx, this.error, cy, 'dark'); return; }
    if (!this.rows) { text(ctx, 'Loading...', W / 2, cy, { align: 'center', color: 'gray' }); return; }
    if (!this.rows.length) {
      const what = this.tab === 'mine' ? 'You have no runs' : 'No runs recorded';
      text(ctx, this.version === 'all' ? `${what} yet. Head for CERULEAN CAVE!` : `${what} on ${this.version} yet. Head for CERULEAN CAVE!`, W / 2, cy, { align: 'center', color: 'dark' });
      return;
    }
    if (this.tab === 'trainers') this.drawTrainers(ctx); else if (this.tab === 'starters') this.drawStarters(ctx); else this.drawRuns(ctx);
  }

  drawRuns(ctx) {
    const y0 = 72;
    const cols = [['NO.', 18], ['TRAINER', 44], ['SCORE', 150], ['RESULT', 214], ['HEAT', 282], ['POKéMON', 326], ['REACHED', 470], ['DAMAGE', 584], ['WHEN', 648]];
    for (const [h, x] of cols) text(ctx, h, x, y0, { color: 'blue', font: 'small' });
    this.rows.slice(0, ROWS).forEach((r, i) => {
      const y = y0 + 16 + i * ROW_H;
      rect(ctx, 12, y - 2, W - 24, ROW_H - 2, r.me && this.tab !== 'mine' ? ME_BG : ROW_BG[i % 2]);
      this.row(ctx, 'run-' + i, 12, y - 2, W - 24, ROW_H - 2, () => this.openRun(r));
      const [label, color] = RESULT[r.result] || RESULT.lose;
      const ty = y + 6;
      text(ctx, String(i + 1), 20, ty, { color: i < 3 && this.tab === 'all' && this.sort === 'score' ? 'red' : 'dark', font: 'small' });
      text(ctx, r.name, 44, ty, { color: r.me ? 'blue' : 'black', font: 'small' });
      text(ctx, (r.score || 0).toLocaleString(), 150, ty, { color: 'dark', font: 'small' });
      text(ctx, label, 214, r.coop ? y : ty, { color, font: 'small' });
      if (r.coop) text(ctx, 'CO-OP', 214, y + 12, { color: 'blue', font: 'small' }); // co-op runs are marked
      text(ctx, r.heat ? String(r.heat) : '-', 290, ty, { color: r.heat ? 'red' : 'gray', font: 'small', align: 'center' });
      // team: the starter (as it ended up) and the partner caught on the way
      const mon = r.species || r.starter;
      drawMonIcon(ctx, mon, 322, y - 7);
      if (r.coop?.species) drawMonIcon(ctx, r.coop.species, 354, y - 7); // co-op teammate
      else if (r.partner) drawMonIcon(ctx, r.partner, 354, y - 7);
      if (hover(322, y - 2, 140, ROW_H - 2)) tip(speciesName(mon) + (r.level ? ` Lv${r.level}` : ''), `${r.starter && r.starter !== mon ? `Started as ${speciesName(r.starter)}. ` : ''}${r.coop ? `Co-op with ${r.coop.name} (${speciesName(r.coop.species)}). ` : ''}${r.partner ? `Partner: ${speciesName(r.partner)}.` : 'No partner caught.'}${r.kills ? ` ${r.kills} KOs.` : ''}${r.time ? ` Time ${fmt(r.time)}.` : ''}`, { width: 200 });
      // the POKéMON as it ended up (evolved), its level and the starter it began as
      text(ctx, speciesName(mon), 390, y, { color: 'black', font: 'small' });
      text(ctx, `${r.level ? `Lv${r.level}` : ''}${r.starter && r.starter !== mon ? ` ${speciesName(r.starter).slice(0, 10)}` : ''}`, 390, y + 12, { color: 'dark', font: 'small' });
      text(ctx, reachedOf(r), 470, ty, { color: r.result === 'win' ? 'green' : 'dark', font: 'small' });
      if (r.dmg) {
        text(ctx, fmtDmg(r.dmg.dealt), 584, r.dmg2 ? y : ty, { color: 'black', font: 'small' });
        if (r.dmg2) text(ctx, `+${fmtDmg(r.dmg2.dealt)}`, 584, y + 12, { color: 'blue', font: 'small' }); // the co-op teammate
        if (hover(580, y - 2, 64, ROW_H - 2)) tip('DAMAGE', `Dealt ${fmtDmg(r.dmg.dealt)}, took ${fmtDmg(r.dmg.taken)}.${r.dmg.top?.[0] ? ` Most with ${dmgLabel(r.dmg.top[0][0])[0]}.` : ''}${r.dmg2 ? ` ${r.coop?.name || 'P2'} dealt ${fmtDmg(r.dmg2.dealt)}.` : ''} Pick the run for the full report.`, { width: 200 });
      } else text(ctx, '-', 584, ty, { color: 'gray', font: 'small' });
      text(ctx, ago(r.at), 648, y, { color: 'dark', font: 'small' });
      text(ctx, r.version || '', 648, y + 12, { color: r.version === VERSION ? 'green' : ['#8040c0', '#e0d0f0'], font: 'small' });
    });
  }

  // one row per starter: your record with it, and the best run anyone has with it
  drawStarters(ctx) {
    const y0 = 72;
    for (const [h, x] of [['STARTER', 18], ['YOUR RUNS', 190], ['ESCAPES', 270], ['YOUR BEST', 350], ['RECORD', 540]]) text(ctx, h, x, y0, { color: 'blue', font: 'small' });
    this.rows.forEach((s, i) => {
      const y = y0 + 16 + i * 38;
      const m = s.mine || {}, unlocked = s.best || m.runs;
      rect(ctx, 12, y - 2, W - 24, 36, ROW_BG[i % 2]);
      this.row(ctx, 'mon-' + s.starter, 12, y - 2, W - 24, 36, () => { this.tab = 'mine'; this.starter = s.starter; this.load(); }); // your runs with it
      drawMonIcon(ctx, s.starter, 16, y - 2);
      text(ctx, speciesName(s.starter), 52, y + 9, { color: unlocked ? 'black' : 'gray' });
      text(ctx, String(m.runs || 0), 210, y + 10, { color: 'dark', font: 'small', align: 'center' });
      text(ctx, m.runs ? `${m.wins} (${Math.round(100 * m.wins / m.runs)}%)` : '-', 270, y + 10, { color: m.wins ? 'green' : 'dark', font: 'small' });
      if (m.best) {
        text(ctx, m.bestScore.toLocaleString(), 350, y + 4, { color: 'blue', font: 'small' });
        text(ctx, reachedOf(m.best), 350, y + 16, { color: m.best.result === 'win' ? 'green' : 'dark', font: 'small' });
        if (m.best.species) { // what your best run ended as
          drawMonIcon(ctx, m.best.species, 494, y - 2);
          if (hover(494, y - 2, 32, 32)) tip(speciesName(m.best.species), `Your best run ended as ${speciesName(m.best.species)}${m.best.level ? ` Lv${m.best.level}` : ''}.`, { width: 180 });
        }
      } else text(ctx, '-', 350, y + 10, { color: 'gray', font: 'small' });
      if (s.best) {
        text(ctx, `${s.best.name}  ${s.best.score.toLocaleString()}`, 540, y + 4, { color: s.best.me ? 'blue' : 'black', font: 'small' });
        text(ctx, `${reachedOf(s.best)}${s.best.heat ? ` · HEAT ${s.best.heat}` : ''}`, 540, y + 16, { color: s.best.result === 'win' ? 'green' : 'dark', font: 'small' });
        if (s.best.species) drawMonIcon(ctx, s.best.species, W - 52, y - 2);
      } else text(ctx, this.local ? 'sign in to see' : 'no runs yet', 540, y + 10, { color: 'gray', font: 'small' });
    });
  }

  drawTrainers(ctx) {
    const y0 = 72;
    for (const [h, x] of [['NO.', 18], ['TRAINER', 44], ['BEST SCORE', 230], ['RUNS', 370], ['ESCAPES', 450], ['ESCAPE RATE', 550]]) text(ctx, h, x, y0, { color: 'blue', font: 'small' });
    if (this.version !== 'all') text(ctx, `on ${this.version}`, W - 20, y0, { align: 'right', color: 'red', font: 'small' });
    this.rows.slice(0, ROWS).forEach((p, i) => {
      const y = y0 + 16 + i * ROW_H;
      rect(ctx, 12, y - 2, W - 24, ROW_H - 2, p.me ? ME_BG : ROW_BG[i % 2]);
      text(ctx, String(i + 1), 20, y + 6, { color: i < 3 ? 'red' : 'dark', font: 'small' });
      text(ctx, p.name, 44, y + 4, { color: p.me ? 'blue' : 'black' });
      text(ctx, p.bestScore.toLocaleString(), 230, y + 6, { color: 'dark', font: 'small' });
      text(ctx, String(p.runs), 370, y + 6, { color: 'dark', font: 'small' });
      text(ctx, String(p.wins), 450, y + 6, { color: 'dark', font: 'small' });
      text(ctx, p.runs ? Math.round((100 * p.wins) / p.runs) + '%' : '-', 550, y + 6, { color: 'dark', font: 'small' });
    });
  }
}

// One run in full: the team (starter -> what it evolved into, partner, the co-op teammate), how far it got,
// its blessings and the damage report of each player.
class RunDetailModal extends Modal {
  draw(ctx) {
    this.dim(ctx);
    this.nav.begin();
    const r = this.run, x = 16, y = 12, w = W - 32, h = H - 24;
    panel(ctx, x, y, w, h);
    const [label, color] = RESULT[r.result] || RESULT.lose;
    text(ctx, `${r.name}'s run`, x + 16, y + 12, { color: r.me ? 'blue' : 'black', scale: 2 });
    text(ctx, `${label}${r.coop ? ' · CO-OP' : ''}`, x + 26 + measure(`${r.name}'s run`) * 2, y + 18, { color, font: 'small' });
    text(ctx, `SCORE ${(r.score || 0).toLocaleString()}${r.heat ? ` · HEAT ${r.heat}` : ''} · ${r.version || ''} · ${ago(r.at)}`, x + w - 16, y + 18, { color: 'dark', font: 'small', align: 'right' });
    const team = (sp, st, lv, partner) => `${speciesName(sp)}${lv ? ` Lv${lv}` : ''}${st && st !== sp ? ` (started as ${speciesName(st)})` : ''} · partner: ${partner ? speciesName(partner) : 'none'}`;
    let cy = y + 44;
    text(ctx, 'TEAM', x + 16, cy, { color: 'blue', font: 'small' });
    text(ctx, team(r.species || r.starter, r.starter, r.level, r.partner), x + 74, cy, { color: 'dark', font: 'small' });
    if (r.coop) { cy += 13; text(ctx, `${String(r.coop.name || 'P2').slice(0, 10)}`, x + 16, cy, { color: 'green', font: 'small' }); text(ctx, team(r.coop.species, r.coop.starter, r.level, r.coop.partner), x + 74, cy, { color: 'dark', font: 'small' }); }
    cy += 13;
    text(ctx, 'REACHED', x + 16, cy, { color: 'blue', font: 'small' });
    text(ctx, `${r.result === 'win' ? 'ESCAPED CERULEAN CAVE' : reachedOf(r)}${r.time ? ` · time ${fmt(r.time)}` : ''}${r.kills ? ` · ${r.kills} KOs` : ''}`, x + 74, cy, { color: r.result === 'win' ? 'green' : 'dark', font: 'small' });
    cy += 13;
    text(ctx, 'BLESSINGS', x + 16, cy, { color: 'blue', font: 'small' });
    const names = (r.boons || []).map(k => BOONS[k]?.name || k).join(', ') || 'none';
    wrap(names, w - 100, 'small').slice(0, 2).forEach((l, i) => text(ctx, l, x + 74, cy + i * 12, { color: 'dark', font: 'small' }));
    cy += 30;
    // the damage report: one card per player
    const cards = [{ title: r.name, species: r.species || r.starter, starter: r.starter, level: r.level, partner: r.partner, sum: r.dmg }];
    if (r.coop) cards.push({ title: r.coop.name || 'P2', species: r.coop.species, starter: r.coop.starter, level: r.level, partner: r.coop.partner, sum: r.dmg2 });
    const total = cards.reduce((n, c) => n + (c.sum?.dealt || 0), 0);
    const gap = 8, cw = Math.floor((w - 24 - gap * (cards.length - 1)) / cards.length), ch = y + h - 44 - cy;
    cards.forEach((c, i) => drawDmgCard(ctx, x + 12 + i * (cw + gap), cy, cw, ch, { ...c, share: r.coop && total ? (c.sum?.dealt || 0) / total : null }));
    if (!r.dmg && !r.dmg2) text(ctx, 'This run is from before damage was recorded.', W / 2, cy + ch / 2 + 20, { align: 'center', color: 'gray', font: 'small' });
    this.btn(ctx, 'close', 'BACK', W / 2 - 50, y + h - 36, 100, 24, { color: THEME.discard }, () => this.close(null));
    this.nav.end();
    drawTips(ctx);
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
    text(ctx, 'CHANGE TRAINER NAME', W / 2, y + 9, { align: 'center', color: 'blue' });
    text(ctx, 'Everyone sees your runs under this name (2-12 letters).', W / 2, y + 28, { align: 'center', color: 'dark', font: 'small' });
    if (this.error) text(ctx, this.error, W / 2, y + 72, { align: 'center', color: 'red', font: 'small' });
    this.btn(ctx, 'ok', this.busy ? 'SAVING...' : 'OK', W / 2 - 104, y + h - 34, 100, 24, { color: THEME.green, disabled: this.busy }, () => this.submit());
    this.btn(ctx, 'cancel', 'CANCEL', W / 2 + 4, y + h - 34, 100, 24, {}, () => this.close(null));
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
