// which enemies (wild pools + trainer parties + boss adds) can use a given move: node tests/review/scan_moves.mjs DISABLE SING ...
import { loadGame } from '../sim/env.mjs';
const G_ = await loadGame();
const { content, data } = G_;
const spawn = await import('../../web/src/game/spawn.js');
const ai = await import('../../web/src/game/ai.js');
const want = new Set(process.argv.slice(2));
for (const [bi, B] of content.BIOMES.entries()) {
  const hits = new Set();
  for (const s of spawn.wildPool(B)) for (let l = s.min; l <= s.max + B.levelBonus[1]; l++) for (const m of ai.enemyMoves(s.species, l)) if (want.has(m)) hits.add(`${s.species}(wild ~L${l})>${m}`);
  for (const t of spawn.trainersFor(B)) for (const p of t.party) for (const m of (p.moves || data.defaultMoves(p.species, p.level))) if (want.has(m)) hits.add(`${p.species}(${t.key})>${m}`);
  console.log(B.key, [...hits].slice(0, 12).join('  '), hits.size > 12 ? `... (${hits.size})` : '');
}
