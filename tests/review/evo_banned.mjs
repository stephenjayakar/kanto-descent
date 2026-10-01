import { loadGame } from '../sim/env.mjs';
const G_ = await loadGame();
const { data, run: RUN } = G_;
const evos = [['CHARMELEON', 16], ['CHARIZARD', 36], ['IVYSAUR', 16], ['VENUSAUR', 32], ['WARTORTLE', 16], ['BLASTOISE', 36], ['RAICHU', 30], ['VAPOREON', 20], ['JOLTEON', 20], ['FLAREON', 20], ['HAUNTER', 25], ['GENGAR', 38], ['DRAGONAIR', 30], ['DRAGONITE', 42]];
for (const [s, l] of evos) { const m = data.movesLearnedAt(s, l); const bad = m.filter(x => RUN.PLAYER_BANNED.has(x)); console.log(s, l, m.join(','), bad.length ? ' BANNED: ' + bad : ''); }
// all levels for starters' lines: banned moves learnable at all (gainExp filters; evolve doesn't)
