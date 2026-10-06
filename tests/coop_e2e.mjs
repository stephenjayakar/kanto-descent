// Co-op end to end in headless Chrome: a host page and a guest page, Convex mocked in-process (auth, coop
// signalling), real WebRTC between the two pages. Checks the guest gets the stream and its keys move player 2.
// Usage: node serve.cjs 8093 &  then  node tests/coop_e2e.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8093/';
const rooms = new Map();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 86400 })}.x`;

// two separate browsers, like two players (pages sharing a browser throttle whichever one is in the background)
const args = ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
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
// the guest's view is its own: P2's healthbox and moves where player 1's are on the host's screen, P1 as the ally
// panel. The received video's HUD regions are compared with both players' HUDs drawn on the host (test code may
// read pixels; the game never does).
await guest.waitForTimeout(1500); // cooldowns run out
await guest.screenshot({ path: 'tests/out/coop_guest_hud.png' });
await host.screenshot({ path: 'tests/out/coop_host_hud.png' });
const REGIONS = { healthbox: [24, 358, 176, 22], moves: [528, 400, 234, 20], ally: [280, 358, 176, 22] };
const grab = (x, R) => Object.fromEntries(Object.entries(R).map(([k, [rx, ry, rw, rh]]) => [k, Array.from(x.getImageData(rx, ry, rw, rh).data)]));
const frame = await guest.evaluate(([R, grabSrc]) => {
  const v = document.querySelector('video'), c = document.createElement('canvas'); c.width = 768; c.height = 432;
  const x = c.getContext('2d'); x.drawImage(v, 0, 0, 768, 432); return eval(grabSrc)(x, R);
}, [REGIONS, grab.toString()]);
const refs = await host.evaluate(async ([R, grabSrc]) => {
  const { drawHud, drawCoopPanel } = await import('/src/scenes/hud.js'); const { Coop } = await import('/src/game/coop.js'); const { G } = await import('/src/game/run.js');
  const r = window.__room, w = r.world;
  const shot = fn => { const c = document.createElement('canvas'); c.width = 768; c.height = 432; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; fn(x); return eval(grabSrc)(x, R); };
  return {
    p2: shot(x => { drawHud(x, w, Coop.p2.run, { player: w.p2, p2: true, cam: r.cam }); drawCoopPanel(x, w.player, 258, 432 - 80, 0, { run: G.run }); }),
    p1: shot(x => { drawHud(x, w, G.run, { cam: r.cam }); drawCoopPanel(x, w.p2, 258, 432 - 80); }),
    names: { p1: w.player.species, p2: w.p2.species, p2moves: Object.values(Coop.p2.run.slots) },
  };
}, [REGIONS, grab.toString()]);
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return +(s / (a.length / 4) / 3).toFixed(1); };
const hud = Object.fromEntries(Object.keys(REGIONS).map(k => [k, { vsP2: diff(frame[k], refs.p2[k]), vsP1: diff(frame[k], refs.p1[k]) }]));
const hudOk = Object.values(hud).every(d => d.vsP2 < d.vsP1 / 2); if (!hudOk) process.exitCode = 1;
console.log(`guest HUD ${hudOk ? 'OK' : 'FAIL'}: bottom-left healthbox shows ${refs.names.p2} (P2), bottom-right slots ${refs.names.p2moves.join('/')}, ally panel ${refs.names.p1} (P1); mean pixel diff of the stream vs each layout:`, JSON.stringify(hud));
// what drawing the guest's view costs the host: frame draw time with and without it
console.log('perf', JSON.stringify(await host.evaluate(async () => {
  const { Engine } = await import('/src/engine/core.js'); const { coopView } = await import('/src/game/coop.js');
  const sc = Engine.scene, draw = sc.draw, after = Engine.afterDraw;
  const measure = async () => { const ts = []; sc.draw = function (c) { const t0 = performance.now(); draw.call(this, c); ts.push(performance.now() - t0); }; Engine.afterDraw = () => { const t0 = performance.now(); after?.(); ts[ts.length - 1] += performance.now() - t0; }; await new Promise(r => setTimeout(r, 2000)); sc.draw = draw; Engine.afterDraw = after; ts.sort((a, b) => a - b); return { n: ts.length, median: +ts[ts.length >> 1].toFixed(2), p90: +ts[Math.floor(ts.length * 0.9)].toFixed(2) }; };
  const withView = await measure();
  const ctx = coopView.ctx; coopView.ctx = null; const without = await measure(); coopView.ctx = ctx;
  return { drawMsWithGuestView: withView, drawMsHostOnly: without };
})));
// per-player rewards: a blessing for each player, chosen on each player's own keyboard
await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); window.__rw = R.applyReward(window.__room, { kind: 'boon', legend: 'ZAPDOS' }).then(() => (window.__rwDone = true)); });
await host.waitForTimeout(900);
await guest.screenshot({ path: 'tests/out/coop_guest_choice.png' }); // both columns at once
await host.keyboard.press('Enter'); // P1 picks the first card
await host.waitForTimeout(600);
await guest.screenshot({ path: 'tests/out/coop_guest_choice2.png' });
await guest.keyboard.press('ArrowDown'); await guest.waitForTimeout(150); await guest.keyboard.press('Enter'); // P2 picks the second
await host.waitForTimeout(800);
const boons = await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); const { G } = await import('/src/game/run.js'); return { done: !!window.__rwDone, p1: G.run.boons.map(b => b.key), p2: Coop.p2.run.boons.map(b => b.key), isP2: !!G.run.isP2 }; });
console.log('boons', JSON.stringify(boons));
// TM for each
await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); window.__rwDone = false; R.applyReward(window.__room, { kind: 'tm' }).then(() => (window.__rwDone = true)); });
await host.waitForTimeout(900); await host.keyboard.press('Enter'); await host.waitForTimeout(700);
for (let i = 0; i < 4; i++) { await host.keyboard.press('Enter'); await host.waitForTimeout(450); } // slot prompt / dialogs
await guest.waitForTimeout(600); await guest.screenshot({ path: 'tests/out/coop_guest_tm.png' }); await guest.keyboard.press('Enter');
for (let i = 0; i < 4; i++) { await guest.waitForTimeout(450); await guest.keyboard.press('Enter'); }
await host.waitForTimeout(800);
const moves = await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); const { G } = await import('/src/game/run.js'); return { done: !!window.__rwDone, p1: G.run.slots, p2: Coop.p2.run.slots, p2actor: window.__room.world.p2.slots || window.__room.world.p2.run.slots }; });
console.log('moves', JSON.stringify(moves));
// P2 shops on its own (shared money; the POTION heals P2)
const shop0 = await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); const { G } = await import('/src/game/run.js'); const r = window.__room; G.run.money = 500; r.world.p2.hp = 10; window.__shopDone = false; R.coopTalk(r, { name: 'CLERK', onTalk: () => R.openShop(r) }).then(() => (window.__shopDone = true)); return { money: G.run.money }; });
await guest.waitForTimeout(700); await guest.keyboard.press('Enter'); // "Hi there!"
await guest.waitForTimeout(500); await guest.screenshot({ path: 'tests/out/coop_guest_shop.png' });
await guest.waitForTimeout(700); await guest.keyboard.press('Enter'); // buy the first item (POTION)
await guest.waitForTimeout(700); await guest.keyboard.press('x');     // leave
await guest.waitForTimeout(700);
console.log('shop', JSON.stringify({ before: shop0, after: await host.evaluate(async () => { const { G } = await import('/src/game/run.js'); const a = window.__room.world.p2; return { money: G.run.money, p2hp: a.hp, done: window.__shopDone, isP2: !!G.run.isP2 }; }) }));
// heal reaches P2
const heal = await host.evaluate(async () => { const { coopHeal } = await import('/src/game/coop.js'); const a = window.__room.world.p2; a.hp = 5; coopHeal(window.__room, 0.5); return { hp: a.hp, max: a.maxHp }; });
console.log('heal', JSON.stringify(heal));
// the guest's view of player 1's pause menu (P2's own build and controls) and of P2 fainting (its countdown tag)
await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); R.openPause(window.__room); });
await host.waitForTimeout(500); await guest.waitForTimeout(300); await guest.screenshot({ path: 'tests/out/coop_guest_pause.png' });
await host.evaluate(async () => { const { popOverlay } = await import('/src/engine/core.js'); popOverlay(); const w = window.__room.world; w.p2.hp = 0; w.kill(w.p2, null); });
await host.waitForTimeout(1500); await guest.screenshot({ path: 'tests/out/coop_guest_fainted.png' });
console.log('p2 fainted', JSON.stringify(await host.evaluate(async () => { const { coopHeal } = await import('/src/game/coop.js'); const a = window.__room.world.p2, dead = a.dead; coopHeal(window.__room, 1); return { dead, back: !a.dead }; })));
await host.screenshot({ path: 'tests/out/coop_host.png' });
// co-op rooms have twice the foes
console.log('waves', JSON.stringify(await host.evaluate(async () => {
  const { Coop } = await import('/src/game/coop.js'); const r = window.__room, keep = r.waves, rng = r.run.rng.state ?? null;
  const count = () => { r.waves = []; r.setupWaves(); return r.waves.reduce((n, w) => n + w.length, 0); };
  let solo = 0, coop = 0;
  for (let i = 0; i < 20; i++) coop += count();
  const g = Coop.guest; Coop.guest = null; for (let i = 0; i < 20; i++) solo += count(); Coop.guest = g;
  r.waves = keep; return { solo: solo / 20, coop: coop / 20, maxAttackers: r.world.maxAttackers };
})));
// a new run resets player 2 to its starter (it used to stay evolved)
await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); Coop.p2.run.species = 'VENUSAUR'; const R = await import('/src/scenes/rewards.js'); R.toHub(); });
await host.waitForTimeout(3500);
console.log('after new run', JSON.stringify(await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); const a = window.__room?.world?.p2; return { spec: window.__room?.spec?.kind, p2: a?.species, runSpecies: Coop.p2?.run.species, level: a?.level }; })));
// the run's record reaches the guest's own account (as player 2)
await host.evaluate(async () => { const { G, recordRun } = await import('/src/game/run.js'); const { coopTeam } = await import('/src/game/coop.js'); const run = G.run; recordRun({ starter: run.starter, species: run.species, level: run.level, biome: 2, room: 3, time: 600, won: false, kills: 40, heat: 0, boons: [], at: Date.now(), coop: coopTeam() }); });
await guest.waitForTimeout(800);
console.log('guest record', JSON.stringify(await guest.evaluate(async () => { const { G } = await import('/src/game/run.js'); const e = G.meta.history[0]; return e ? { starter: e.starter, coop: e.coop, guest: e.coopGuest, score: e.score } : null; })));
await guest.screenshot({ path: 'tests/out/coop_guest.png' });
console.log(logs.filter(l => !/AudioWorklet|ScriptProcessor/.test(l)).join('\n'));
for (const b of browsers) await b.close();
