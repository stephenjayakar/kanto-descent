p = 'tests/coop_e2e.mjs'
s = open(p, encoding='utf8').read()
a = "await host.screenshot({ path: 'tests/out/coop_host.png' });"
b = r"""await host.screenshot({ path: 'tests/out/coop_host.png' });
// a new run resets player 2 to its starter (it used to stay evolved)
await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); Coop.p2.run.species = 'VENUSAUR'; const R = await import('/src/scenes/rewards.js'); R.toHub(); });
await host.waitForTimeout(3500);
console.log('after new run', JSON.stringify(await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); const a = window.__room?.world?.p2; return { spec: window.__room?.spec?.kind, p2: a?.species, runSpecies: Coop.p2?.run.species, level: a?.level }; })));
// the run's record reaches the guest's own account (as player 2)
await host.evaluate(async () => { const { G, recordRun } = await import('/src/game/run.js'); const { coopTeam } = await import('/src/game/coop.js'); const run = G.run; recordRun({ starter: run.starter, species: run.species, level: run.level, biome: 2, room: 3, time: 600, won: false, kills: 40, heat: 0, boons: [], at: Date.now(), coop: coopTeam() }); });
await guest.waitForTimeout(800);
console.log('guest record', JSON.stringify(await guest.evaluate(async () => { const { G } = await import('/src/game/run.js'); const e = G.meta.history[0]; return e ? { starter: e.starter, coop: e.coop, guest: e.coopGuest, score: e.score } : null; })));"""
assert a in s; s = s.replace(a, b, 1)
open(p, 'w', encoding='utf8').write(s)
print('ok')
