// Node stubs so the browser game modules run headless: fetch from disk, Image, localStorage,
// a simulated-time setTimeout, and silent audio.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');
export const sim = { time: 0, timers: [] };

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.document = { getElementById: () => null, createElement: () => ({ getContext: () => null }) };
globalThis.navigator ??= {};
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, clear() { this._d = {}; } };
globalThis.Image = class { constructor() { this.complete = true; this.naturalWidth = 1; this.naturalHeight = 1; } addEventListener() {} set src(v) { this._src = v; } };
globalThis.fetch = async (url) => {
  const p = path.join(ROOT, decodeURIComponent(String(url).split('?')[0]));
  try { const txt = fs.readFileSync(p, 'utf8'); return { ok: true, json: async () => JSON.parse(txt), text: async () => txt }; }
  catch { return { ok: false, json: async () => { throw new Error('404 ' + url); } }; }
};
globalThis.setTimeout = (fn, ms = 0) => { sim.timers.push({ t: sim.time + ms / 1000, fn }); return sim.timers.length; };
export function tickTimers(dt) {
  sim.time += dt;
  const due = sim.timers.filter(t => t.t <= sim.time);
  sim.timers = sim.timers.filter(t => t.t > sim.time);
  for (const t of due) t.fn();
}

export async function loadGame() {
  const S = await import('../../web/src/audio/sound.js');
  for (const k of Object.keys(S.Sound)) if (typeof S.Sound[k] === 'function') S.Sound[k] = () => Promise.resolve();
  const data = await import('../../web/src/game/data.js');
  await data.loadData(async f => JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data', f), 'utf8')));
  const rooms = await import('../../web/src/game/rooms.js');
  await rooms.loadMapIndex();
  const run = await import('../../web/src/game/run.js');
  run.loadMeta();
  const room = await import('../../web/src/scenes/room.js');
  const rewards = await import('../../web/src/scenes/rewards.js');
  rewards.registerRoomScene(room.RoomScene);
  const core = await import('../../web/src/engine/core.js');
  const input = await import('../../web/src/engine/input.js');
  const combat = await import('../../web/src/game/combat.js');
  const moves = await import('../../web/src/game/moves_rt.js');
  const content = await import('../../web/src/game/content.js');
  const boons = await import('../../web/src/game/boons.js');
  return { data, rooms, run, room, rewards, core, input, combat, moves, content, boons, S };
}
