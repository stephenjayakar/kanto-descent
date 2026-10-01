// Title screen: FireRed's title art (Charizard + flames) with our name.
import { Engine, W, H } from '../engine/core.js';
import { img, ready } from '../engine/assets.js';
import { text } from '../engine/font.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { G } from '../game/run.js';
import { toHub } from './rewards.js';
import { drawPmd, preloadPmd } from '../game/pmd.js';

export class TitleScene {
  constructor() { this.t = 0; }
  enter() { Sound.playBGM('mus_title'); preloadPmd([4, 1, 7, 150]); Input.clear(); }
  update(dt) {
    Input.poll(); this.t += dt;
    if (this.t > 0.5 && (Input.justPressed('confirm') || Input.justPressed('interact') || Engine.mouse.clicked)) { Sound.playSE('se_select'); toHub(); }
  }
  draw(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const bg = img('gfx/ui/title/title_screen.png');
    const s = 2, bw = 240 * s, bh = 160 * s, bx = (W - bw) / 2, by = 0;
    if (ready(bg)) ctx.drawImage(bg, bx, by, bw, bh);
    // fade the "FireRed" logo area into our title band
    ctx.fillStyle = '#000'; ctx.fillRect(0, bh - 46, W, H - bh + 46);
    text(ctx, 'KANTO DESCENT', W / 2, bh - 40, { align: 'center', color: ['#f8d030', '#702000'], scale: 3 });
    text(ctx, 'a FireRed x Hades roguelike', W / 2, bh + 6, { align: 'center', color: 'whiteSoft' });
    if (Math.floor(this.t * 2) % 2 === 0) text(ctx, 'PRESS ENTER', W / 2, H - 56, { align: 'center', color: 'white' });
    text(ctx, `Runs ${G.meta.runs}  ·  Escapes ${G.meta.wins}`, W - 10, H - 18, { align: 'right', font: 'small', color: 'gray' });
    text(ctx, 'Fan project. Pokémon (c) Nintendo/Game Freak/Creatures. Sprites: PMDCollab (CC BY-NC).', 10, H - 18, { font: 'small', color: 'gray' });
  }
}
