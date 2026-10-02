// Boot: engine, fonts, data, maps, audio, then the title screen.
import { initEngine, setScene } from './engine/core.js';
import * as engine from './engine/core.js';
import { Input } from './engine/input.js';
import { loadFonts } from './engine/font.js';
import { loadJSON, preload } from './engine/assets.js';
import { loadData, D } from './game/data.js';
import { loadMeta, G, syncFromCloud } from './game/run.js';
import { Cloud, initCloud, signIn, pendingInvite, authToken, packManifest, dropAuth } from './game/cloud.js';
import { loadPacks } from './game/assetpack.js';
import { loadMapIndex } from './game/rooms.js';
import { setBattleAnimManifest } from './game/render.js';
import { Sound } from './audio/sound.js';
import { TitleScene } from './scenes/title.js';
import { RoomScene } from './scenes/room.js';
import { registerRoomScene, toHub } from './scenes/rewards.js';
import * as rewards from './scenes/rewards.js';

// Hosted build: nothing of the game (or its assets) loads until an allowed Google account signs in.
function showSignIn() {
  document.getElementById('loading')?.remove();
  document.getElementById('game').style.display = 'none';
  const page = document.getElementById('signin');
  page.style.display = 'flex';
  const err = document.getElementById('signin-error'), msg = document.getElementById('signin-msg');
  err.textContent = Cloud.error || '';
  if (pendingInvite()) msg.textContent = "You've been invited! Sign in with Google to join.";
  if (Cloud.me && !Cloud.me.allowed) {
    document.getElementById('signin-btn').textContent = 'Use a different Google account';
    document.getElementById('signin-out').style.display = 'inline-block';
  }
  document.getElementById('signin-btn').onclick = async () => {
    if (Cloud.me) dropAuth(null);
    try { await signIn(); } catch (e) { err.textContent = e.message; }
  };
  document.getElementById('signin-out').onclick = () => { dropAuth(null); location.reload(); };
}

async function boot() {
  await initCloud();
  if (Cloud.packs) {
    if (!Cloud.email) return showSignIn();
    const el = document.getElementById('loading');
    try {
      await loadPacks({
        siteUrl: Cloud.siteUrl, token: await authToken(), list: await packManifest(),
        onProgress: (n, total) => { if (el) el.textContent = `Downloading game data... ${Math.round(100 * n / Math.max(1, total))}%`; },
      });
    } catch (e) {
      if (e.status === 401 || e.status === 403) { dropAuth(e.message); return showSignIn(); }
      throw e;
    }
  }
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
