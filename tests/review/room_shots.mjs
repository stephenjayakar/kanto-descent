// Spot screenshots of rooms in a muted headless Chrome, with the player pushed into nearby walls
// (to eyeball whether collision matches the art).
//   node tests/review/room_shots.mjs [port=8121] LAYOUT_X:crop[:area[:biome[:boss]]] ...   (crop = index or x,y,w,h)
//   e.g. node tests/review/room_shots.mjs 8121 LAYOUT_VIRIDIAN_FOREST:1:forest:0 LAYOUT_SILPH_CO_11F:0:silph:2:boss
// Writes tests/out/room_shots/<layout>_<crop>.png (gitignored scratch).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const port = /^\d+$/.test(args[0] || '') ? args.shift() : '8121';
const OUT = path.join(HERE, '../out/room_shots');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 768, height: 432 } });
page.on('pageerror', e => console.log('pageerror', e.message));
for (const spec of args) {
  const [layout, crop = '0', area = 'forest', biome = '0', kind = 'combat'] = spec.split(':');
  await page.goto(`http://localhost:${port}/?dev=${kind}&biome=${biome}&area=${area}&layout=${layout}&crop=${crop}&level=${process.env.LEVEL || 30}`);
  await page.waitForFunction(() => window.__room && window.__room.state !== 'loading' && window.__room.world, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  // no enemies; walk the player into walls at a few probe points and leave it pressed against the last one
  if (kind === 'boss') { await page.waitForTimeout(500); const f = path.join(OUT, `${layout.replace('LAYOUT_', '')}_boss.png`); await page.screenshot({ path: f }); console.log(f, await page.evaluate(() => JSON.stringify({ npcs: window.__room.npcs.map(n => [n.name, n.x, n.y]), boss: window.__room.bossSpawnAt, entry: window.__room.room.entry, exit: window.__room.room.exits[0] }))); continue; }
  const info = await page.evaluate(() => {
    const sc = window.__room, w = sc.world, p = w.player, R = w.room, T = 16;
    sc.waves = []; w.actors = w.actors.filter(a => a.team !== 'enemy'); sc.trainer = null;
    const probes = [];
    for (let ty = 1; ty < R.h - 1; ty++) for (let tx = 1; tx < R.w - 1; tx++) {
      const i = ty * R.w + tx; if (R.walk[i] || !R.reach[i]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) if (R.walk[i + dy * R.w + dx] && R.shot[i + dy * R.w + dx]) probes.push([tx, ty, dx, dy]);
    }
    const pick = probes[Math.floor(probes.length / 2)] || [Math.floor(R.w / 2), Math.floor(R.h / 2), 1, 0];
    p.x = pick[0] * T + 8; p.y = pick[1] * T + 8;
    for (let k = 0; k < 40; k++) w.moveBy(p, pick[2] * 2, pick[3] * 2);
    return { pick, x: p.x, y: p.y, r: p.r };
  });
  await page.waitForTimeout(400);
  const f = path.join(OUT, `${layout.replace('LAYOUT_', '')}_${crop.replace(/,/g, '_')}.png`);
  await page.screenshot({ path: f });
  console.log(f, JSON.stringify(info));
}
await browser.close();
