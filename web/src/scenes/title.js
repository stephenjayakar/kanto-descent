// Title screen (in the style of Kanto Spire's): FireRed's Charizard, flames and logo over a swirl, then
// Continue / New run / Records / Settings / How to play / patch notes, and cloud sign-in (Convex).
// Keyboard and gamepad: arrows / d-pad move the focus, Enter / Z / E (A) confirm.
import { Engine, W, H, setScene, pushOverlay } from '../engine/core.js';
import { draw } from '../engine/assets.js';
import { text, measure } from '../engine/font.js';
import { swirlBackground, BG_THEMES, button, panel, rect, drawTips, THEME } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { G, loadRunSave, saveMeta } from '../game/run.js';
import { Cloud, signIn, signOut, createInviteLink } from '../game/cloud.js';
import { toHub, continueRun } from './rewards.js';
import { preloadPmd } from '../game/pmd.js';
import { VERSION, PATCH_NOTES, LATEST_NOTES } from '../game/version.js';
import { FocusNav, Modal, ChoiceModal, scrollArea, drawSections } from './modal.js';
import { RecordsScene } from './records.js';

export class TitleScene {
  // opts.saved: back from Save & quit. opts.started: skip "CLICK TO START" (coming back from RECORDS).
  constructor(opts = {}) {
    this.t = 0; this.opts = opts;
    this.started = !!(opts.saved || opts.started);
    this.msg = opts.saved ? 'Saved! Your run will continue from the start of that room.' : '';
    this.nav = new FocusNav(loadRunSave() ? 'continue' : 'new');
  }
  enter() { Sound.playBGM('mus_title'); preloadPmd([4, 1, 7, 150]); Input.clear(); }
  exit() { this.closeInput(); }

  update(dt) {
    this.t += dt;
    if (this.input) return; // the invite-link box is open
    Input.poll();
    if (!this.started) {
      if (this.t > 0.3 && (Engine.mouse.clicked || Input.justPressed('confirm') || Engine.pressed.has(' '))) {
        this.started = true; this.t = 0;
        Sound.unlock?.(); Sound.playSE('se_select');
        Engine.mouse.clicked = false; Input.clear();
      }
      return;
    }
    if (this.t > 0.25) this.nav.update();
  }

  draw(ctx) {
    swirlBackground(ctx, BG_THEMES.title, 0.6);
    // GBA title art, 2x: Charizard on the right with flames rising in front, the logo top-left
    ctx.save(); ctx.globalAlpha = 0.95;
    draw(ctx, 'gfx/ui/title/charizard.png', 488, 74 + Math.sin(Engine.time * 1.5) * 2, { scale: 2 });
    ctx.restore();
    for (let i = 0; i < 10; i++) {
      const fx = 462 + i * 26 + Math.sin(Engine.time * 2 + i) * 4;
      const life = ((Engine.time * 40 + i * 37) % 130) / 130;
      const fy = 318 - life * 130;
      const frame = Math.min(6, Math.floor(life * 7));
      draw(ctx, 'gfx/ui/title/flames.png', fx, fy, { sx: 0, sy: frame * 16, sw: 16, sh: 16, scale: 2, alpha: 0.85 });
    }
    draw(ctx, 'gfx/ui/title/logo.png', 56, 14, { scale: 2 });
    // name banner
    const cx = 222, by = 204;
    rect(ctx, 0, by, 444, 36, '#00000088');
    text(ctx, 'KANTO DESCENT', cx, by + 4, { align: 'center', color: 'gold', scale: 2 });
    text(ctx, 'a FireRed x Hades roguelike', cx, by + 40, { align: 'center', color: 'whiteSoft', font: 'small' });

    if (!this.started) {
      if (Math.floor(Engine.time * 2) % 2 === 0) text(ctx, 'CLICK OR PRESS ENTER TO START', cx, 300, { align: 'center', color: 'white' });
      this.footer(ctx);
      return;
    }

    const nav = this.nav;
    nav.begin(Engine.overlays.length > 0 || !!this.input);
    const bx = cx - 110, bw = 220;
    let y = 262;
    const save = loadRunSave();
    if (save) {
      nav.button(ctx, 'continue', 'CONTINUE', bx, y, bw, 26, { color: THEME.green }, () => this.continue());
      text(ctx, save.label || 'run in progress', cx, y + 27, { align: 'center', color: 'lime', font: 'small' });
      y += 41;
    }
    nav.button(ctx, 'new', save ? 'NEW RUN' : 'START', bx, y, bw, 26, { color: THEME.play }, () => this.newRun(!!save));
    y += 30;
    nav.button(ctx, 'records', 'RECORDS', bx, y, 108, 22, { color: '#c09020', font: 'small' }, () => setScene(new RecordsScene()));
    nav.button(ctx, 'settings', 'SETTINGS', bx + 112, y, 108, 22, { color: '#506080', font: 'small' }, () => pushOverlay(new SettingsModal()));
    // corners: how to play, version + patch notes
    nav.button(ctx, 'about', 'HOW TO PLAY', 8, 6, 96, 20, { color: '#3a7a58', font: 'small' }, () => pushOverlay(new AboutModal()));
    const vl = `${VERSION} · PATCH NOTES`, vw = measure(vl, 'small');
    nav.button(ctx, 'notes', vl, W - vw - 20, 6, vw + 12, 20, { color: '#405070', font: 'small' }, () => pushOverlay(new PatchNotesModal()));
    this.account(ctx, nav);
    nav.end();

    // the patch notes open by themselves once for each new set of notes
    if (G.meta.seenVersion !== LATEST_NOTES && !Engine.overlays.length) { G.meta.seenVersion = LATEST_NOTES; saveMeta(); pushOverlay(new PatchNotesModal()); }

    const status = Cloud.error && !Cloud.email ? Cloud.error : !Cloud.url ? 'Saves are kept in this browser.' : !Cloud.email ? 'Saves are kept in this browser. Sign in to sync them to the cloud.' : Cloud.status === 'offline' ? 'Cloud offline - saving locally, will sync later.' : Cloud.status === 'syncing' ? 'Syncing...' : 'Synced to the cloud.';
    const m = this.msg || status;
    text(ctx, m.replace(/@/g, ' at '), W / 2, H - 30, { align: 'center', font: 'small', color: this.msg ? 'lime' : 'gray' });
    this.footer(ctx);
    drawTips(ctx);
  }

  // Sign in / signed-in account / invite link, under Charizard.
  account(ctx, nav) {
    if (!Cloud.url) return;
    const ax = 492, aw = 236, acx = ax + aw / 2, y = 336;
    if (Cloud.email) {
      const who = Cloud.me?.name ? `TRAINER ${Cloud.me.name}` : 'SIGNED IN';
      text(ctx, who, acx, y - 2, { align: 'center', color: 'gold', font: 'small' });
      text(ctx, Cloud.email.replace('@', ' at '), acx, y + 10, { align: 'center', color: 'whiteSoft', font: 'small' });
      const inv = !!Cloud.me?.canInvite;
      const w = inv ? 112 : aw;
      nav.button(ctx, 'signout', 'SIGN OUT', ax, y + 26, w, 20, { color: '#605070', font: 'small' }, () => signOut());
      if (inv) nav.button(ctx, 'invite', 'MAKE INVITE LINK', ax + aw - 120, y + 26, 120, 20, { color: '#3a9a58', font: 'small' }, () => this.makeInvite());
    } else {
      text(ctx, 'Not signed in', acx, y + 8, { align: 'center', color: 'gray', font: 'small' });
      nav.button(ctx, 'signin', 'SIGN IN WITH GOOGLE', ax, y + 26, aw, 20, { color: '#3060c0', font: 'small' }, () => signIn().catch(e => { this.msg = e.message; }));
    }
  }

  footer(ctx) {
    text(ctx, 'Fan project. Pokémon (c) Nintendo/Game Freak/Creatures. Sprites: PMDCollab (CC BY-NC).', 10, H - 16, { font: 'small', color: 'gray' });
    if (this.started) text(ctx, `Runs ${G.meta.runs}  ·  Escapes ${G.meta.wins}`, W - 10, H - 16, { align: 'right', font: 'small', color: 'gray' });
  }

  continue() { if (!continueRun()) toHub(); }
  newRun(hasSave) {
    if (!hasSave) return toHub();
    pushOverlay(new ChoiceModal({
      title: 'Abandon your current run?', body: 'Your saved run will be lost when you leave the lab.',
      options: [{ label: 'No, keep it', value: 0 }, { label: "Yes, go to OAK's lab", value: 1, color: THEME.discard }],
      onClose: v => { if (v === 1) toHub(); },
    }));
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

// ---- settings (the same options as the pause menu) ----------------------------------------------
export class SettingsModal extends Modal {
  draw(ctx) {
    this.dim(ctx);
    this.nav.begin();
    const s = G.meta.settings;
    const w = 300, h = 160, x = (W - w) / 2, y = (H - h) / 2;
    panel(ctx, x, y, w, h);
    text(ctx, 'SETTINGS', W / 2, y + 8, { align: 'center', color: 'white' });
    const row = (key, label, val, cy, set) => {
      text(ctx, label, x + 16, cy + 3, { color: 'white' });
      text(ctx, `${Math.round(val * 10)}/10`, x + 206, cy + 3, { align: 'center', color: 'gold' });
      this.btn(ctx, key + '-', '-', x + 160, cy, 24, 20, { color: '#506080' }, () => set(Math.max(0, Math.round(val * 10 - 1) / 10)));
      this.btn(ctx, key + '+', '+', x + 230, cy, 24, 20, { color: '#506080' }, () => set(Math.min(1, Math.round(val * 10 + 1) / 10)));
    };
    row('music', 'MUSIC', s.music, y + 32, v => { s.music = v; Sound.setMusicVolume(v); saveMeta(); });
    row('sfx', 'SOUND FX', s.sfx, y + 58, v => { s.sfx = v; Sound.setSfxVolume(v); saveMeta(); Sound.playSE('se_select'); });
    text(ctx, 'SCREEN SHAKE', x + 16, y + 87, { color: 'white' });
    this.btn(ctx, 'shake', s.shake ? 'ON' : 'OFF', x + 176, y + 84, 62, 20, { color: s.shake ? THEME.green : '#806060' }, () => { s.shake = s.shake ? 0 : 1; saveMeta(); });
    this.btn(ctx, 'close', 'CLOSE', W / 2 - 45, y + h - 32, 90, 22, { color: '#506080' }, () => this.close());
    this.nav.end();
    text(ctx, 'ESC / X: close', x + w - 10, y + h - 14, { align: 'right', color: 'gray', font: 'small' });
  }
}

// ---- patch notes ---------------------------------------------------------------------------------
export class PatchNotesModal extends Modal {
  keys() {
    const p = this.page || 0;
    if (Input.justPressed('left') && p + 1 < PATCH_NOTES.length) { this.page = p + 1; this.scroll = 0; Sound.playSE('se_select'); }
    if (Input.justPressed('right') && p > 0) { this.page = p - 1; this.scroll = 0; Sound.playSE('se_select'); }
    if (Input.justPressed('confirm')) { this.close(); Input.clear(); }
  }
  draw(ctx) {
    this.dim(ctx);
    const x = 40, y = 8, w = W - 80, h = H - 16;
    panel(ctx, x, y, w, h);
    const p = this.page || 0, notes = PATCH_NOTES[p];
    text(ctx, `PATCH NOTES  ${notes.v}`, W / 2, y + 8, { align: 'center', color: 'gold', scale: 1 });
    if (notes.v === VERSION) text(ctx, 'current version', x + w - 12, y + 10, { align: 'right', color: 'lime', font: 'small' });
    scrollArea(ctx, this, x + 8, y + 28, w - 16, y + h - 34, cy => drawSections(ctx, notes.sections, x + 16, cy, w - 40));
    // mouse only (the keyboard uses left/right and confirm, so up/down can scroll)
    this.nav.begin(); this.nav.end();
    const by = y + h - 26;
    if (p + 1 < PATCH_NOTES.length && buttonAt(ctx, 'OLDER', x + 12, by, 74)) { this.page = p + 1; this.scroll = 0; }
    if (p > 0 && buttonAt(ctx, 'NEWER', x + 92, by, 74)) { this.page = p - 1; this.scroll = 0; }
    text(ctx, 'LEFT/RIGHT: older/newer · ENTER: close', x + w - 104, by + 5, { align: 'right', color: 'gray', font: 'small' });
    if (buttonAt(ctx, 'CLOSE', x + w - 94, by, 82)) this.close();
    drawTips(ctx);
  }
}

// ---- how to play ---------------------------------------------------------------------------------
const ABOUT = [
  ['', ['Kanto Descent is a realtime roguelike: FireRed’s POKéMON, maps and music with the fighting and the runs of Hades. Your partner sets out from PROF. OAK’s lab towards CERULEAN CAVE, one room at a time. If it faints, you wake up back in the lab and try again, a little stronger.']],
  ['CONTROLS (KEYBOARD / GAMEPAD)', [
    'Move: WASD or the arrow keys (left stick / d-pad).',
    'ATTACK: J or left click (X). SPECIAL: K or right click (Y). CAST your status move: Q or L (B).',
    'DASH: SPACE or SHIFT (RB / LT). You can’t be hit mid-dash.',
    'Throw a POKé BALL: R (RT). CALL your partner: F (LB). Talk / doors: E or ENTER (A).',
    'Pause and controls: ESC or P (START). From the pause menu you can Save & quit to the title.',
    'The mouse aims once you move it; otherwise attacks auto-aim at the nearest foe.',
    'Menus: arrows or d-pad to choose, ENTER / Z / E (A) to confirm, ESC / X (B) to go back.',
  ]],
  ['A RUN', [
    'Clear each room of foes, take the reward, then pick the next door. The icon above a door shows what’s behind it: legendary blessings, RARE CANDY, TMs, items, money, a Mart or a POKéMON CENTER.',
    'Five areas, each ending in a boss: BROCK, MISTY, the GHOST of POKéMON TOWER, GIOVANNI and finally MEWTWO.',
    'Red markings on the ground show where a foe’s attack will land. Dash out of them!',
    'Level up, learn moves (pick a slot or skip) and evolve at the real levels.',
    'Blessings from ZAPDOS, ARTICUNO, MOLTRES, MEW, LUGIA and HO-OH upgrade your moves and dash. Two legends together can grant a duo blessing.',
    'Weaken a wild POKéMON below 35% HP and throw a POKé BALL to catch it. It becomes your partner, ready to CALL when the gauge is full.',
  ]],
  ['BETWEEN RUNS', [
    'Bring STARDUST back to PROF. OAK for permanent research: more HP and damage, revivals, extra dashes and more.',
    'Beat bosses to unlock new starters at the POKé BALLS on the lab table.',
    'After your first escape, your rival offers HEAT: harder rules for more STARDUST.',
    'RECORDS on the title screen shows everyone’s runs, your own runs and the best trainers.',
  ]],
];

export class AboutModal extends Modal {
  keys() { if (Input.justPressed('confirm')) { this.close(); Input.clear(); } }
  draw(ctx) {
    this.dim(ctx);
    const x = 40, y = 8, w = W - 80, h = H - 16;
    panel(ctx, x, y, w, h);
    text(ctx, 'HOW TO PLAY', W / 2, y + 8, { align: 'center', color: 'gold' });
    scrollArea(ctx, this, x + 8, y + 28, w - 16, y + h - 34, cy => drawSections(ctx, ABOUT, x + 16, cy, w - 40));
    this.nav.begin(); this.nav.end();
    text(ctx, 'ENTER / ESC: close', x + w - 104, y + h - 21, { align: 'right', color: 'gray', font: 'small' });
    if (buttonAt(ctx, 'CLOSE', x + w - 94, y + h - 26, 82)) this.close();
    drawTips(ctx);
  }
}

// a small modal footer button (mouse)
function buttonAt(ctx, label, x, y, w) { return button(ctx, label, x, y, w, 20, { color: '#506080', font: 'small' }); }
