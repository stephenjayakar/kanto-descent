p = 'web/src/game/coop.js'
s = open(p, encoding='utf8').read()
a = """    focusUsed: false, hp: null, lastLevel: 1,
  });
  syncP2Level(r2); // catch up with the shared level: evolve and offer the moves it would have learned
  return r2;
}"""
b = """    focusUsed: false, hp: null, lastLevel: base.level,
  });
  // joining mid-run: start evolved and with a sensible kit for the shared level (later levels prompt as usual)
  for (let i = 0; i < 3; i++) { const n = nextEvolution(r2.species, base.level); if (!n || !D.species[n] || n === 'CHOICE') break; r2.species = n; }
  r2.slots = { attack: bestMove(r2.species, base.level, 'attack', kit.slots.attack), special: bestMove(r2.species, base.level, 'special', kit.slots.special), cast: kit.slots.cast };
  r2.known = [...new Set([...r2.known, ...Object.values(r2.slots)])];
  return r2;
}

function bestMove(species, level, want, fallback) {
  let best = fallback, bp = fallback ? profile(fallback).power : -1;
  const lines = [species]; for (let s = D.species[species]?.preEvolution; s; s = D.species[s]?.preEvolution) lines.push(s);
  for (const sp of lines) for (const [lv, m] of D.species[sp]?.learnset || []) {
    if (lv > level || !D.moves[m] || PLAYER_BANNED.has(m)) continue;
    const p = profile(m);
    if (!p.damaging || p.melee !== (want === 'attack') || p.power <= bp || p.power > 100) continue;
    best = m; bp = p.power;
  }
  return best;
}"""
assert a in s; s = s.replace(a, b, 1)
s = s.replace("import { G, makePlayer, buildHooks, checkEvolution, PLAYER_BANNED } from './run.js';",
              "import { G, makePlayer, buildHooks, checkEvolution, nextEvolution, PLAYER_BANNED } from './run.js';\nimport { profile } from './moves_rt.js';", 1)
open(p, 'w', encoding='utf8').write(s)
print('ok')
