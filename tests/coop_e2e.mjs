// Co-op end to end in headless Chrome: a host page and a guest page, Convex mocked in-process (auth, coop
// signalling), real WebRTC between the two pages. Checks the guest gets the stream and its keys move player 2.
// Usage: node serve.cjs 8093 &  then  node tests/coop_e2e.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8093/';
const rooms = new Map();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 86400 })}.x`;

// two separate browsers, like two players (pages sharing a browser throttle whichever one is in the background)
const args = ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const browsers = [await chromium.launch({ channel: 'chrome', headless: true, args }), await chromium.launch({ channel: 'chrome', headless: true, args })];
const [hctx, gctx] = await Promise.all(browsers.map(b => b.newContext({ viewport: { width: 1536, height: 864 } })));
const mock = async route => {
  const body = JSON.parse(route.request().postData() || '{}'), a = body.args || {};
  let value = null;
  switch (body.path) {
    case 'game:me': value = { email: 'tester@example.com', allowed: true, canInvite: false, name: 'TESTER' }; break;
    case 'game:load': value = { email: 'tester@example.com', meta: null, save: null, runs: [] }; break;
    case 'coop:create': { const code = 'TEST' + (rooms.size + 1); rooms.set(code, { offer: a.offer }); value = { code }; break; }
    case 'coop:get': { const r = rooms.get(a.code); value = r ? { offer: r.offer, answer: r.answer || null, hostName: 'HOSTY', taken: !!r.answer } : null; break; }
    case 'coop:answer': rooms.get(a.code).answer = a.answer; break;
  }
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 'success', value }) });
};
for (const c of [hctx, gctx]) { await c.addInitScript(t => localStorage.setItem('kanto-descent.auth.v1', JSON.stringify({ token: t, refreshToken: 'r' })), jwt); await c.route(/convex\.(cloud|site)/, mock); }
const logs = [];
const host = await hctx.newPage(), guest = await gctx.newPage();
for (const [n, p] of [['host', host], ['guest', guest]]) { p.on('pageerror', e => logs.push(`[${n} pageerror] ${e.message}`)); p.on('console', m => { if (m.type() === 'error') logs.push(`[${n}] ${m.text()}`); }); }

await host.goto(base + '?dev=combat&biome=0&level=12');
await host.waitForFunction(() => window.__ready, null, { timeout: 30000 });
await host.waitForTimeout(1500);
const code = await host.evaluate(async () => {
  const { Coop, hostCoop } = await import('/src/game/coop.js');
  const { Engine } = await import('/src/engine/core.js');
  for (const e of Engine.scene.world.enemies()) e.brain = () => { e.vx = e.vy = 0; }; // keep the test calm
  await hostCoop();
  return Coop.code;
});
console.log('room', code);
await guest.goto(base + '?coop=' + code);
await guest.waitForFunction(() => window.__ready, null, { timeout: 30000 });
await guest.waitForTimeout(800);
await guest.keyboard.press('ArrowDown'); await guest.waitForTimeout(150); // pick the second starter
await guest.keyboard.press('Enter');
let st = 'timeout';
for (let i = 0; i < 60; i++) { // (waitForFunction treats an async predicate's Promise as truthy, so poll by hand)
  if (await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); return Coop.active && !!window.__room?.world?.p2; })) { st = `ok after ${i * 0.3}s`; break; }
  await host.waitForTimeout(300);
}
console.log('host sees player 2:', st);
await guest.waitForTimeout(1500);
console.log('diag', await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); const r = window.__room; return JSON.stringify({ status: Coop.status, guest: Coop.guest, log: Coop.log, roomState: r?.state, spec: r?.spec?.kind, p2: !!r?.world?.p2, actors: r?.world?.actors.map(a => a.team + ':' + a.species + (a.p2 ? '*' : '')).join(' ') }); }));
const before = await host.evaluate(() => { const a = window.__room.world.p2; return a ? { x: Math.round(a.x), y: Math.round(a.y), species: a.species, slots: a.slots } : null; });
await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); window.__mx = []; const r = Coop.remote.receive.bind(Coop.remote); Coop.remote.receive = m => { window.__mx.push(m.mx); r(m); }; });
await guest.keyboard.down('w'); await guest.waitForTimeout(700);
console.log('mid', await host.evaluate(() => { const a = window.__room.world.p2; return JSON.stringify({ x: Math.round(a.x), vx: a.vx, mx: window.__mx.slice(-5), n: window.__mx.length, act: a.action?.p?.kind, stage: a.action?.stage, stun: a.stun, status: Object.keys(a.status) }); }));
await guest.keyboard.up('w');
await guest.keyboard.down('a'); await guest.waitForTimeout(400); await guest.keyboard.up('a');
await guest.keyboard.press('j'); await guest.waitForTimeout(80);
const after = await host.evaluate(() => { const a = window.__room.world.p2; return a ? { x: Math.round(a.x), y: Math.round(a.y), acting: !!a.action, hp: a.hp, max: a.maxHp } : null; });
const gv = await guest.evaluate(() => { const v = document.querySelector('video'); return v ? { ready: v.readyState, w: v.videoWidth, h: v.videoHeight, paused: v.paused, audio: v.srcObject?.getAudioTracks().length } : null; });
console.log('p2 before', JSON.stringify(before), 'after', JSON.stringify(after));
console.log('guest video', JSON.stringify(gv));
await host.screenshot({ path: 'tests/out/coop_host.png' });
await guest.screenshot({ path: 'tests/out/coop_guest.png' });
console.log(logs.filter(l => !/AudioWorklet|ScriptProcessor/.test(l)).join('\n'));
for (const b of browsers) await b.close();
