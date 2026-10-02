// Boot: engine, fonts, data, maps, audio, then the title screen.
import { initEngine, setScene } from './engine/core.js';
import * as engine from './engine/core.js';
import { Input } from './engine/input.js';
import { loadFonts } from './engine/font.js';
import { loadJSON, preload } from './engine/assets.js';
import { loadData, D } from './game/data.js';
import { loadMeta, G, syncFromCloud } from './game/run.js';
import { Cloud } from './game/cloud.js';
import { loadMapIndex } from './game/rooms.js';
import { setBattleAnimManifest } from './game/render.js';
import { Sound } from './audio/sound.js';
import { TitleScene } from './scenes/title.js';
import { RoomScene } from './scenes/room.js';
import { registerRoomScene, toHub } from './scenes/rewards.js';
import * as rewards from './scenes/rewards.js';

async function boot() {
  const canvas = document.getElementById('game');
  initEngine(canvas);
  Input.init(canvas);
  canvas.focus();
  loadMeta();
  registerRoomScene(RoomScene);
  const soundP = Sound.init('assets/sound/').then(() => {
    const s = G.meta.settings;
    Sound.setMusicVolume(s.music); Sound.setSfxVolume(s.sfx);
  }).catch(e => console.warn('audio init failed', e));
  await Promise.all([
    loadFonts(),
    loadData(f => loadJSON('data/' + f)),
    loadMapIndex(),
    loadJSON('gfx/battle_anims/manifest.json').then(setBattleAnimManifest),
    preload(['gfx/ui/title/title_screen.png', 'gfx/ui/text_window/type1.png', 'gfx/ui/text_window/std.png']),
  ]);
  // signed in on this browser: pull cloud progress first (don't hold up the title for more than ~3s)
  if (Cloud.email) await Promise.race([syncFromCloud(), new Promise(r => setTimeout(r, 3000))]);
  document.getElementById('loading')?.remove();
  Object.assign(window, { G, D, __engine: engine, __sound: Sound, __rewards: rewards, __input: Input });
  const q = new URLSearchParams(location.search);
  if (q.has('dev')) rewards.devStart(q); else if (q.has('hub')) toHub(); else setScene(new TitleScene());
  await soundP;
  window.__ready = true;
}

boot().catch(e => {
  console.error(e);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Failed to load: ' + e.message;
});
