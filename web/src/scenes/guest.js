// Co-op guest (staging prototype): pick a starter, then watch the host's game stream and play player 2.
// Inputs (keyboard, mouse, gamepad) go to the host every frame; the video is the host's canvas.
import { Engine, W, H } from '../engine/core.js';
import { text, wrap } from '../engine/font.js';
import { swirlBackground, pixBox } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { D, TYPE_COLORS } from '../game/data.js';
import { STARTERS } from '../game/content.js';
import { G, starterUnlocked, recordRun, saveMeta } from '../game/run.js';
import { Cloud } from '../game/cloud.js';
import { Coop, joinCoop, guestPacket } from '../game/coop.js';
import { choose } from './ui.js';

export class GuestScene {
  constructor(code) { this.code = code.toUpperCase(); this.t = 0; this.stage = 'pick'; this.msg = ''; }
  enter() {
    Input.clear();
    // the host's run ended: keep it in this account's records too (as player 2)
    Coop.onRun = entry => { G.meta.history.unshift(entry); G.meta.history = G.meta.history.slice(0, 20); saveMeta(); recordRun(entry); this.lastRun = entry; };
    const v = this.video = document.createElement('video');
    v.autoplay = true; v.playsInline = true;
    Object.assign(v.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
    document.body.appendChild(v);
    this.pick();
  }
  exit() { this.video?.remove(); }

  async pick() {
    const list = STARTERS.filter(starterUnlocked);
    const cards = list.map(s => { const sp = D.species[s.species]; return { title: sp.name, sub: sp.types.join('/'), portrait: sp.dex, accent: TYPE_COLORS[sp.types[0]], desc: `${s.blurb}  ${D.moves[s.slots.attack].name} / ${D.moves[s.slots.special].name} / ${D.moves[s.slots.cast].name}` }; });
    const i = await choose('CO-OP: pick your POKéMON', cards, { cardH: 46, footer: `Joining game ${this.code}. You share the host's level, blessings and money.` });
    this.starter = list[Math.max(0, i)].species;
    this.stage = 'connecting';
    Sound.unlock?.();
    try {
      await joinCoop(this.code, this.video, { starter: this.starter, name: (Cloud.me?.name || Cloud.me?.email?.split('@')[0] || 'P2').toUpperCase() });
      this.stage = 'play';
    } catch (e) { this.stage = 'error'; this.msg = e.message; }
  }

  update(dt) {
    this.t += dt;
    Input.poll();
    if (this.stage === 'play' && Coop.input?.readyState === 'open') {
      try { Coop.input.send(guestPacket(Input, Engine.mouse)); } catch { /* channel closing */ }
    }
    if (this.video?.paused && this.video.srcObject && (Engine.mouse.clicked || Input.justPressed('confirm'))) this.video.play().catch(() => {});
  }

  draw(ctx) {
    const v = this.video;
    if (this.stage === 'play' && v && v.readyState >= 2 && Coop.status === 'connected') {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(v, 0, 0, W, H);
      if (v.paused) this.banner(ctx, 'Click to start the stream (and its sound).');
      return;
    }
    swirlBackground(ctx, ['#102040', '#204080', '#183060'], 0.4);
    text(ctx, 'CO-OP', W / 2, 120, { align: 'center', color: 'gold', scale: 2 });
    const lines = this.stage === 'error' ? [this.msg || 'Could not join.']
      : Coop.status === 'lost' ? [Coop.error || 'Connection lost.', 'Reload the page to try again.']
      : this.stage === 'pick' ? ['']
      : [`Connecting to ${Coop.hostName ? Coop.hostName + "'s" : 'the'} game ${this.code}...`, 'This takes a few seconds. Some strict networks can’t connect yet.'];
    lines.forEach((l, i) => wrap(l, 600, 'normal').forEach((w, j) => text(ctx, w, W / 2, 170 + (i * 2 + j) * 18, { align: 'center', color: this.stage === 'error' ? 'red' : 'whiteSoft' })));
  }

  banner(ctx, s) {
    pixBox(ctx, W / 2 - 200, H / 2 - 14, 400, 28, 'rgba(16,20,32,0.9)', '#80d0ff', 2);
    text(ctx, s, W / 2, H / 2 - 7, { align: 'center', color: 'white', font: 'small' });
  }
}
