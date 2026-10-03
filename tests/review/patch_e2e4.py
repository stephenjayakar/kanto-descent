p = 'tests/coop_e2e.mjs'
s = open(p, encoding='utf8').read()
a = "// a new run resets player 2 to its starter"
b = r"""// co-op rooms have twice the foes
console.log('waves', JSON.stringify(await host.evaluate(async () => {
  const { Coop } = await import('/src/game/coop.js'); const r = window.__room, keep = r.waves, rng = r.run.rng.state ?? null;
  const count = () => { r.waves = []; r.setupWaves(); return r.waves.reduce((n, w) => n + w.length, 0); };
  let solo = 0, coop = 0;
  for (let i = 0; i < 20; i++) coop += count();
  const g = Coop.guest; Coop.guest = null; for (let i = 0; i < 20; i++) solo += count(); Coop.guest = g;
  r.waves = keep; return { solo: solo / 20, coop: coop / 20, maxAttackers: r.world.maxAttackers };
})));
// a new run resets player 2 to its starter"""
assert a in s; s = s.replace(a, b, 1)
open(p, 'w', encoding='utf8').write(s)
print('ok')
