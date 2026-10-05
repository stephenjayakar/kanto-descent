// Title screen: FireRed's own title (black, teal band, logo, Charizard and its flames) at 2x, then
// Continue / New run / Records / Settings / How to play / patch notes, and cloud sign-in (Convex).
// Keyboard and gamepad: arrows / d-pad move the focus, Enter / Z / E (A) confirm.
import { Engine, W, H, setScene, pushOverlay } from '../engine/core.js';
import { draw } from '../engine/assets.js';
import { text, measure } from '../engine/font.js';
import { frBackdrop, button, panel, rect, drawTips, THEME } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { G, loadRunSave, saveMeta } from '../game/run.js';
import { Cloud, signIn, signOut, createInviteLink } from '../game/cloud.js';
import { toHub, continueRun } from './rewards.js';
import { preloadPmd } from '../game/pmd.js';
import { VERSION, PATCH_NOTES, LATEST_NOTES } from '../game/version.js';
import { FocusNav, Modal, ChoiceModal, scrollArea, drawSections } from './modal.js';
import { RecordsScene } from './records.js';
import { Coop, hostCoop } from '../game/coop.js';

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
    // FireRed's own title screen at 2x (tools/extract_title_fixed.py has the real colours): black with the teal band,
    // the logo top-left, Charizard on the right with the title flames rising in front of it.
    frBackdrop(ctx);
    draw(ctx, 'gfx/ui/title/charizard.png', 506, 84 + Math.round(Math.sin(Engine.time * 1.5)) * 2, { scale: 2 });
    for (let i = 0; i < 9; i++) { // flames: 7 frames of 16x16 rising out of the bottom of the band
      const life = ((Engine.time * 40 + i * 37) % 150) / 150;
      const fx = 470 + i * 30 + Math.round(Math.sin(Engine.time * 2 + i) * 2) * 2;
      const fy = 300 - Math.round(life * 75) * 2;
      draw(ctx, 'gfx/ui/title/flames.png', fx, fy, { sx: 0, sy: Math.min(6, Math.floor(life * 7)) * 16, sw: 16, sh: 16, scale: 2 });
    }
    draw(ctx, 'gfx/ui/title/logo.png', 40, 12, { scale: 2 });
    const cx = 206;
    text(ctx, 'KANTO DESCENT', cx, 232, { align: 'center', color: ['#ffffff', '#d64229'], scale: 2 });
    text(ctx, 'a FireRed x Hades roguelike', cx, 262, { align: 'center', color: 'whiteSoft', font: 'small' });

    if (!this.started) {
      if (Math.floor(Engine.time * 1.5) % 3 !== 2) text(ctx, 'CLICK OR PRESS ENTER TO START', cx, 318, { align: 'center', color: 'white' }); // FireRed's PRESS START blink
      this.footer(ctx);
      return;
    }

    const nav = this.nav;
    nav.begin(Engine.overlays.length > 0 || !!this.input);
    const bx = cx - 110, bw = 220;
    let y = 282;
    const save = loadRunSave();
    if (save) {
      nav.button(ctx, 'continue', 'CONTINUE', bx, y, bw, 24, { color: THEME.green }, () => this.continue());
      text(ctx, save.label || 'run in progress', cx, y + 25, { align: 'center', color: 'lime', font: 'small' });
      y += 40;
    } else y += 14;
    nav.button(ctx, 'new', save ? 'NEW RUN' : 'START', bx, y, bw, 24, { color: THEME.play }, () => this.newRun(!!save));
    y += 28;
    nav.button(ctx, 'records', 'RECORDS', bx, y, 108, 22, { color: '#c09020', font: 'small' }, () => setScene(new RecordsScene()));
    nav.button(ctx, 'settings', 'SETTINGS', bx + 112, y, 108, 22, { font: 'small' }, () => pushOverlay(new SettingsModal()));
    // top right, over the black above the band: how to play, version + patch notes
    const vl = `${VERSION} · PATCH NOTES`, vw = measure(vl, 'small') + 16;
    nav.button(ctx, 'notes', vl, W - vw - 10, 20, vw, 20, { font: 'small' }, () => pushOverlay(new PatchNotesModal()));
    nav.button(ctx, 'about', 'HOW TO PLAY', W - vw - 120, 20, 104, 20, { color: THEME.green, font: 'small' }, () => pushOverlay(new AboutModal()));
    this.account(ctx, nav);
    nav.end();

    // the patch notes open by themselves once for each new set of notes
    if (G.meta.seenVersion !== LATEST_NOTES && !Engine.overlays.length) { G.meta.seenVersion = LATEST_NOTES; saveMeta(); pushOverlay(new PatchNotesModal()); }

    const status = Cloud.error && !Cloud.email ? Cloud.error : !Cloud.url ? 'Saves are kept in this browser.' : !Cloud.email ? 'Saves are kept in this browser. Sign in to sync them to the cloud.' : Cloud.status === 'offline' ? 'Cloud offline - saving locally, will sync later.' : Cloud.status === 'syncing' ? 'Syncing...' : 'Synced to the cloud.';
    const m = this.msg || status;
    text(ctx, m.replace(/@/g, ' at '), W / 2, H - 38, { align: 'center', font: 'small', color: this.msg ? 'lime' : 'gray' });
    this.footer(ctx);
    drawTips(ctx);
  }

  // Sign in / signed-in account / invite link, under Charizard.
  account(ctx, nav) {
    if (!Cloud.url) return;
    const ax = 500, aw = 236, acx = ax + aw / 2, y = 298;
    if (Cloud.email) {
      const coopLabel = Coop.role === 'host' && Coop.status === 'connected' ? 'CO-OP: PLAYER 2 CONNECTED' : Coop.role === 'host' && Coop.code ? `CO-OP CODE ${Coop.code} (SHOW LINK)` : 'HOST CO-OP (BETA)';
      nav.button(ctx, 'coop', coopLabel, ax, y, aw, 20, { color: THEME.play, font: 'small' }, () => this.hostCoop());
      const who = Cloud.me?.name ? `TRAINER ${Cloud.me.name}` : 'SIGNED IN';
      text(ctx, who, acx, y + 25, { align: 'center', color: 'gold', font: 'small' });
      text(ctx, Cloud.email.replace('@', ' at '), acx, y + 37, { align: 'center', color: 'whiteSoft', font: 'small' });
      const inv = !!Cloud.me?.canInvite;
      const w = inv ? 112 : aw;
      nav.button(ctx, 'signout', 'SIGN OUT', ax, y + 54, w, 20, { font: 'small' }, () => signOut());
      if (inv) nav.button(ctx, 'invite', 'MAKE INVITE LINK', ax + aw - 120, y + 54, 120, 20, { color: THEME.green, font: 'small' }, () => this.makeInvite());
    } else {
      text(ctx, 'Not signed in', acx, y + 36, { align: 'center', color: 'gray', font: 'small' });
      nav.button(ctx, 'signin', 'SIGN IN WITH GOOGLE', ax, y + 54, aw, 20, { color: THEME.play, font: 'small' }, () => signIn().catch(e => { this.msg = e.message; }));
    }
  }

  // on the dark red bar, where FireRed prints its copyright line
  footer(ctx) {
    text(ctx, 'Fan project. Pokémon (c) Nintendo/Game Freak/Creatures. Sprites: PMDCollab (CC BY-NC).', 10, H - 17, { font: 'small', color: ['#ffffff', '#5a0000'] });
    if (this.started) text(ctx, `Runs ${G.meta.runs}  ·  Escapes ${G.meta.wins}`, W - 10, H - 17, { align: 'right', font: 'small', color: ['#ffffff', '#5a0000'] });
  }

  // Co-op (beta): open a room and share the link; then start or continue a run as usual.
  async hostCoop() {
    if (!(Coop.role === 'host' && Coop.code && Coop.status !== 'lost' && Coop.status !== 'error')) {
      this.msg = 'Opening a co-op room...';
      await hostCoop();
      if (Coop.status === 'error') { this.msg = Coop.error; return; }
    }
    let copied = false;
    try { await navigator.clipboard.writeText(Coop.link); copied = true; } catch { /* clipboard blocked */ }
    this.msg = copied ? 'Co-op link copied to the clipboard.' : '';
    pushOverlay(new ChoiceModal({ title: `CO-OP ROOM ${Coop.code}`, w: 500,
      body: `Send this link to player 2:
${Coop.link}

${copied ? 'It is copied to your clipboard. ' : ''}They sign in, pick a POKéMON and join your game as player 2. You run the game; they see a live stream of your screen and control their own POKéMON (keyboard, mouse or gamepad). Start or continue a run whenever you like; they can join at any time.

Beta: the stream adds a little delay for player 2, and some strict networks can't connect yet.`,
      options: [{ label: 'OK', value: 0 }] }));
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
    const w = 300, h = 212, x = (W - w) / 2, y = (H - h) / 2;
    panel(ctx, x, y, w, h);
    text(ctx, 'SETTINGS', W / 2, y + 9, { align: 'center', color: 'blue' });
    const row = (key, label, val, cy, set) => {
      text(ctx, label, x + 18, cy + 3, { color: 'dark' });
      text(ctx, `${Math.round(val * 10)}/10`, x + 207, cy + 3, { align: 'center', color: 'blue' });
      this.btn(ctx, key + '-', '-', x + 160, cy, 24, 20, {}, () => set(Math.max(0, Math.round(val * 10 - 1) / 10)));
      this.btn(ctx, key + '+', '+', x + 230, cy, 24, 20, {}, () => set(Math.min(1, Math.round(val * 10 + 1) / 10)));
    };
    const toggle = (key, label, on, cy, onLabel, offLabel, fn) => {
      text(ctx, label, x + 18, cy + 3, { color: 'dark' });
      this.btn(ctx, key, on ? onLabel : offLabel, x + 176, cy, 62, 20, { color: on ? THEME.green : THEME.discard }, fn);
    };
    row('music', 'MUSIC', s.music, y + 32, v => { s.music = v; Sound.setMusicVolume(v); saveMeta(); });
    row('sfx', 'SOUND FX', s.sfx, y + 58, v => { s.sfx = v; Sound.setSfxVolume(v); saveMeta(); Sound.playSE('se_select'); });
    toggle('shake', 'SCREEN SHAKE', !!s.shake, y + 84, 'ON', 'OFF', () => { s.shake = s.shake ? 0 : 1; saveMeta(); });
    const rumble = s.rumble !== false;
    toggle('rumble', 'RUMBLE (PAD)', rumble, y + 110, 'ON', 'OFF', () => { s.rumble = !rumble; Input.rumbleOn = s.rumble; saveMeta(); Input.rumble(200, 0.5, 0.5); });
    const hq = s.hqAudio !== false;
    toggle('hq', 'HQ AUDIO', hq, y + 136, 'ON', 'GBA', () => { s.hqAudio = !hq; Sound.setHQ(s.hqAudio); saveMeta(); });
    this.btn(ctx, 'close', 'CLOSE', W / 2 - 45, y + h - 36, 90, 22, {}, () => this.close());
    this.nav.end();
    text(ctx, 'ESC / X: close', x + w - 14, y + h - 30, { align: 'right', color: 'dark', font: 'small' });
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
    text(ctx, `PATCH NOTES  ${notes.v}`, W / 2, y + 9, { align: 'center', color: 'blue' });
    if (notes.v === VERSION) text(ctx, 'current version', x + w - 16, y + 11, { align: 'right', color: 'green', font: 'small' });
    scrollArea(ctx, this, x + 10, y + 28, w - 20, y + h - 40, cy => drawSections(ctx, notes.sections, x + 18, cy, w - 44));
    // mouse only (the keyboard uses left/right and confirm, so up/down can scroll)
    this.nav.begin(); this.nav.end();
    const by = y + h - 30;
    if (p + 1 < PATCH_NOTES.length && buttonAt(ctx, 'OLDER', x + 14, by, 74)) { this.page = p + 1; this.scroll = 0; }
    if (p > 0 && buttonAt(ctx, 'NEWER', x + 94, by, 74)) { this.page = p - 1; this.scroll = 0; }
    text(ctx, 'LEFT/RIGHT: versions', x + w - 108, by + 4, { align: 'right', color: 'dark', font: 'small' });
    if (buttonAt(ctx, 'CLOSE', x + w - 98, by, 82)) this.close();
    drawTips(ctx);
  }
}

// ---- how to play ---------------------------------------------------------------------------------
const ABOUT = [
  ['', ['Kanto Descent is a realtime roguelike: FireRed’s POKéMON, maps and music with the fighting and the runs of Hades. Your partner sets out from PROF. OAK’s lab towards CERULEAN CAVE, one room at a time. If it faints, you wake up back in the lab and try again, a little stronger.']],
  ['CONTROLS (KEYBOARD / GAMEPAD)', [
    'Move: WASD or the arrow keys (left stick / d-pad).',
    'ATTACK: J or left click (X). SPECIAL: K or right click (Y). CAST your status move: Q or L (B).',
    'DASH: SPACE or SHIFT (A). You can’t be hit mid-dash.',
    'Throw a POKé BALL: R (LT). CALL your partner: F (RT). Talk / doors: E or ENTER (RB). On an Xbox pad the layout is Hades’.',
    'Pause and controls: ESC or P (START). From the pause menu you can Save & quit to the title.',
    'The mouse aims once you move it; otherwise attacks auto-aim at the nearest foe.',
    'Menus: arrows or d-pad to choose, ENTER / Z / E (A) to confirm, ESC / X (B) to go back.',
  ]],
  ['A RUN', [
    'Clear each room of foes, take the reward, then pick the next door. The icon above a door shows what’s behind it: legendary blessings, RARE CANDY, TMs, items, money, a Mart or a POKéMON CENTER.',
    'Three acts, five areas, each ending in a boss. Acts 1 and 2 each pick two of three areas (a different route every run); act 3 is CERULEAN CAVE and MEWTWO.',
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
    text(ctx, 'HOW TO PLAY', W / 2, y + 9, { align: 'center', color: 'blue' });
    scrollArea(ctx, this, x + 10, y + 28, w - 20, y + h - 40, cy => drawSections(ctx, ABOUT, x + 18, cy, w - 44));
    this.nav.begin(); this.nav.end();
    text(ctx, 'ENTER / ESC: close', x + w - 108, y + h - 26, { align: 'right', color: 'dark', font: 'small' });
    if (buttonAt(ctx, 'CLOSE', x + w - 98, y + h - 30, 82)) this.close();
    drawTips(ctx);
  }
}

// a small modal footer button (mouse)
function buttonAt(ctx, label, x, y, w) { return button(ctx, label, x, y, w, 20, { font: 'small' }); }
