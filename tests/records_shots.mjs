// Run records + damage report, end to end in headless Chrome (muted), Convex mocked in-process:
// a co-op host and guest fight a room (real WebRTC, the guest's keys drive player 2), then the run ends in a
// blackout and in an escape. Checks each player's damage is tallied separately, the guest's copy of the record
// is from its own point of view, and saves screenshots of the summary, the Hall of Fame DAMAGE REPORT and RECORDS.
// Usage: node serve.cjs 8124 &  then  node tests/records_shots.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'fs';

const base = process.argv[2] || 'http://127.0.0.1:8124/';
const out = process.argv[3] || 'tests/out/fix-records';
fs.mkdirSync(out, { recursive: true });
const rooms = new Map(), runs = [];
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 86400 })}.x`;
// the records queries, answered from the runs this test uploaded (the shape of game.ts publicRun)
const pub = e => ({ name: 'TESTER', me: true, score: e.score || 0, result: e.won ? 'win' : 'lose', version: e.version, heat: e.heat || 0, starter: e.starter, species: e.species, partner: e.partner || null,
  level: e.level, biome: e.biome, room: e.room, area: e.area || null, time: e.time, kills: e.kills, at: e.at, coop: e.coop ? { name: e.coop.name, species: e.coop.species, starter: e.coop.starter, partner: e.coop.partner } : null,
  boons: e.boons || [], dmg: e.dmg || null, dmg2: e.dmg2 || null });

const args = ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const browsers = [await chromium.launch({ channel: 'chrome', headless: true, args }), await chromium.launch({ channel: 'chrome', headless: true, args })];
const [hctx, gctx] = await Promise.all(browsers.map(b => b.newContext({ viewport: { width: 768, height: 432 } })));
const mock = async route => {
  const body = JSON.parse(route.request().postData() || '{}'), a = body.args || {};
  let value = null;
  switch (body.path) {
    case 'game:me': value = { email: 'tester@example.com', allowed: true, canInvite: false, name: 'TESTER' }; break;
    case 'game:load': value = { email: 'tester@example.com', meta: null, save: null, runs: [] }; break;
    case 'game:addRun': if (!a.entry?.coopGuest) runs.unshift(a.entry); value = { score: a.entry?.score || 0 }; break;
    case 'game:leaderboard': value = runs.filter(e => !a.starter || e.starter === a.starter).map(pub); break;
    case 'game:myRuns': { const rs = runs.filter(e => !a.starter || e.starter === a.starter).map(pub); value = { player: { name: 'TESTER', runs: rs.length, wins: rs.filter(r => r.result === 'win').length, bestScore: Math.max(0, ...rs.map(r => r.score)) }, recent: rs }; break; }
    case 'game:starterRecords': value = a.starters.map(s => { const rs = runs.filter(e => e.starter === s).map(pub), best = rs.sort((x, y) => y.score - x.score)[0] || null; return { starter: s, best, mine: { runs: rs.length, wins: rs.filter(r => r.result === 'win').length, bestScore: best?.score || 0, best } }; }); break;
    case 'game:topTrainers': value = []; break;
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
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });
const fail = [];
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fail.push(what); };

await host.goto(base + '?dev=combat&biome=1&level=24&starter=CHARMANDER');
await host.waitForFunction(() => window.__ready, null, { timeout: 30000 });
await host.waitForTimeout(1500);
const code = await host.evaluate(async () => { const { Coop, hostCoop } = await import('/src/game/coop.js'); await hostCoop(); return Coop.code; });
await guest.goto(base + '?coop=' + code);
await guest.waitForFunction(() => window.__ready, null, { timeout: 30000 });
await guest.waitForTimeout(800);
await guest.keyboard.press('ArrowDown'); await guest.waitForTimeout(150); await guest.keyboard.press('Enter'); // P2: the second starter
for (let i = 0; i < 60 && !(await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); return Coop.active && !!window.__room?.world?.p2; })); i++) await host.waitForTimeout(300);

// fight: both players stand next to foes (kept alive), P1 attacks from the host's keyboard, P2 from the guest's
async function fight(secs, coop = true) {
  await host.evaluate(async () => {
    const { G } = await import('/src/game/run.js');
    const key = k => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: k })), 30); };
    window.__fight = setInterval(() => {
      const r = window.__room, w = r?.world; if (!w || r.state !== 'play') return;
      const foes = w.enemies().filter(e => e.spawnT <= 0 && !e.untargetable);
      for (const [i, p] of [[0, w.player], [1, w.p2]]) {
        if (!p || p.dead) continue;
        p.hp = Math.max(p.hp, p.maxHp * 0.6);
        const e = foes[i % Math.max(1, foes.length)]; if (!e) continue;
        p.x = e.x - 18; p.y = e.y; p.facing = 0;
      }
      key(G.run.partner && G.run.callGauge >= 1 ? 'f' : Math.random() < 0.6 ? 'j' : 'k'); // call the partner when the gauge is full
    }, 120);
  });
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) { if (coop) await guest.keyboard.press(Math.random() < 0.6 ? 'j' : 'k'); await host.waitForTimeout(110); }
  await host.evaluate(() => clearInterval(window.__fight));
}
const dealt = () => host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); const { G } = await import('/src/game/run.js'); return [G.run.dmg?.dealt || 0, Coop.p2?.run.dmg?.dealt || 0]; });
for (let i = 0; i < 4 && (await dealt()).includes(0); i++) await fight(6); // the scripted fight can whiff (a foe behind a wall)
const tally = await host.evaluate(async () => {
  const { Coop } = await import('/src/game/coop.js'); const { G, dmgSummary } = await import('/src/game/run.js');
  return { p1: dmgSummary(G.run), p2: dmgSummary(Coop.p2.run), own: Object.prototype.hasOwnProperty.call(Coop.p2.run, 'dmg') };
});
console.log('tally', JSON.stringify(tally), await host.evaluate(async () => { const { G } = await import('/src/game/run.js'); return JSON.stringify({ partner: G.run.partner, gauge: G.run.callGauge, isP2: !!G.run.isP2 }); }));
check(tally.p1?.dealt > 0 && tally.p2?.dealt > 0, 'both players dealt damage');
check(tally.own && tally.p1.dealt !== tally.p2.dealt, 'P2 has its own tally');
check((tally.p2?.top || []).some(([k]) => /^m:/.test(k)), 'P2 damage is broken down by move');

// co-op blackout: the summary lists both players' damage
await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); R.gameOver(window.__room); });
await host.waitForTimeout(1500);
await shot(host, 'summary_coop');
const rec = runs[0];
check(rec?.dmg?.dealt > 0 && rec?.dmg2?.dealt > 0, 'the uploaded record has dmg and dmg2');
await guest.waitForTimeout(800);
const gRec = await guest.evaluate(async () => { const { G } = await import('/src/game/run.js'); const e = G.meta.history[0]; return e ? { dmg: e.dmg, dmg2: e.dmg2, guest: e.coopGuest } : null; });
check(gRec?.guest && gRec.dmg?.dealt === rec?.dmg2?.dealt && gRec.dmg2?.dealt === rec?.dmg?.dealt, "the guest's copy has its own damage as dmg");
await host.keyboard.press('Enter'); await host.waitForTimeout(2500); // back to the lab

// a second co-op run that escapes: Hall of Fame, then the DAMAGE REPORT page
await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); R.devStart(new URLSearchParams('dev=combat&biome=4&level=50&area=cave&starter=CHARMANDER&boons=Z_ATTACK,M_ATTACK')); });
await host.waitForTimeout(2500);
await host.evaluate(async () => { const { G } = await import('/src/game/run.js'); const R = await import('/src/scenes/rewards.js'); const r = G.run; r.species = 'CHARIZARD'; r.partner = { species: 'PIDGEOT', level: 48 }; r.callGauge = 1; R.refreshPlayer(window.__room); });
await fight(10);
const p1 = await host.evaluate(async () => { const { G, dmgSummary } = await import('/src/game/run.js'); return dmgSummary(G.run); });
check(p1?.partner > 0 && p1.top.some(([k]) => k === 'p:PIDGEOT'), 'the called partner is tallied for its trainer');
await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); R.goNext(window.__room, { kind: 'victory' }); });
await host.waitForTimeout(3600);
await shot(host, 'victory_hof_coop');
await host.keyboard.press('Enter'); await host.waitForTimeout(900);
await shot(host, 'victory_damage_report_coop');
await host.keyboard.press('Enter'); await host.waitForTimeout(2500);

// RECORDS: MY RUNS (with the DAMAGE column), a run's details, BY POKéMON
await host.evaluate(async () => { const { RecordsScene } = await import('/src/scenes/records.js'); const { setScene } = await import('/src/engine/core.js'); const s = new RecordsScene(); setScene(s); window.__rec = s; s.tab = 'mine'; s.load(); });
await host.waitForTimeout(1200);
await shot(host, 'records_my_runs');
await host.mouse.click(300, 98); await host.waitForTimeout(600); // the newest run
await shot(host, 'records_run_detail');
await host.keyboard.press('Escape'); await host.waitForTimeout(400);
await host.evaluate(() => { const s = window.__rec; s.tab = 'starters'; s.load(); });
await host.waitForTimeout(1000);
await shot(host, 'records_by_pokemon');
await host.mouse.click(120, 98); await host.waitForTimeout(1000); // CHARMANDER -> your runs with it
const after = await host.evaluate(() => ({ tab: window.__rec.tab, starter: window.__rec.starter, rows: window.__rec.rows?.length }));
check(after.tab === 'mine' && after.starter === 'CHARMANDER' && after.rows >= 1, 'picking a POKéMON opens your runs with it');
await shot(host, 'records_my_runs_charmander');

// solo: a blackout summary and the one-card report
await guest.close();
await host.evaluate(async () => { const { Coop, coopLeave } = await import('/src/game/coop.js'); try { coopLeave?.(); } catch { /* */ } Coop.active = false; Coop.guest = null; Coop.p2 = null; });
await host.goto(base + '?dev=combat&biome=2&level=30&starter=SQUIRTLE');
await host.waitForFunction(() => window.__ready, null, { timeout: 30000 });
await host.waitForTimeout(1500);
await fight(7, false);
await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); R.gameOver(window.__room); });
await host.waitForTimeout(1500);
await shot(host, 'summary_solo');
await host.goto(base + '?dev=combat&biome=4&level=50&area=cave&starter=PIKACHU');
await host.waitForFunction(() => window.__ready, null, { timeout: 30000 });
await host.waitForTimeout(1500);
await fight(7, false);
await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); R.goNext(window.__room, { kind: 'victory' }); });
await host.waitForTimeout(3600); await host.keyboard.press('Enter'); await host.waitForTimeout(900);
await shot(host, 'victory_damage_report_solo');

const errs = logs.filter(l => !/AudioWorklet|ScriptProcessor|favicon|404/.test(l));
if (errs.length) console.log(errs.join('\n'));
check(!errs.some(l => /pageerror/.test(l)), 'no page errors');
for (const b of browsers) await b.close();
console.log(fail.length ? `${fail.length} FAILED` : 'all ok');
process.exit(fail.length ? 1 : 0);
