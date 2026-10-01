// Enemy creation from real FireRed encounter tables and trainer parties.
import { D, defaultMoves } from './data.js';
import { makeActor } from './combat.js';
import { wildBrain, enemyMoves } from './ai.js';
import { BIOMES, TUNING, heatAt } from './content.js';
import { profile } from './moves_rt.js';

const CLASS_SPRITE = {
  'BUG CATCHER': 'bug_catcher', HIKER: 'hiker', 'TEAM ROCKET': 'rocket_m', CHANNELER: 'channeler', SCIENTIST: 'scientist',
  'SUPER NERD': 'poke_maniac', LASS: 'lass', YOUNGSTER: 'youngster', BURGLAR: 'man', ROCKER: 'rocker', JUGGLER: 'balding_man',
  'POKéMANIAC': 'poke_maniac', 'COOLTRAINER': 'cooltrainer_m', GENTLEMAN: 'gentleman', ENGINEER: 'worker_m', FISHERMAN: 'fisher',
  CAMPER: 'camper', PICNICKER: 'picnicker', BEAUTY: 'beauty', BIKER: 'biker', 'BLACK BELT': 'black_belt', PSYCHIC: 'youngster', RIVAL: 'blue',
  'GAMER': 'balding_man', TAMER: 'balding_man', BIRD_KEEPER: 'man', 'BIRD KEEPER': 'man', SAILOR: 'sailor', SWIMMER: 'swimmer_m_land',
};
export function trainerSprite(t) {
  if (t.className === 'TEAM ROCKET' && t.female) return 'rocket_f';
  return CLASS_SPRITE[t.className] || (t.female ? 'woman_1' : 'man');
}

export function wildPool(biome) {
  const pool = [];
  for (const m of biome.encounters) for (const s of D.encounters[m]?.land || []) pool.push(s);
  if (!pool.length) // no wild POKéMON here (SILPH CO.): use the trainers' POKéMON
    for (const t of trainersFor(biome)) for (const p of t.party) pool.push({ species: p.species, min: p.level, max: p.level, rate: 10 });
  return pool;
}

export function trainersFor(biome) {
  return Object.values(D.trainers).filter(t => !t.dummy && !t.rematchOf && t.party?.length && t.maps?.some(m => biome.trainerMaps.includes(m)) && !/LEADER|BOSS|RIVAL|CHAMPION|ELITE/.test(t.key));
}

// Enemy level grows across a biome: start of biome uses the table levels, later rooms add a bonus.
export function enemyLevel(run, base) {
  const b = BIOMES[run.biome];
  const k = run.roomInBiome / Math.max(1, b.rooms - 1);
  return Math.max(2, Math.round(base + b.levelBonus[0] + (b.levelBonus[1] - b.levelBonus[0]) * k));
}

// enemy damage multiplier per area (realtime hits land far more often than turn-based ones)
export const ENEMY_DMG = biome => (0.8 + 0.05 * biome) * TUNING.enemyDmg;

export function makeEnemy(world, speciesKey, level, opts = {}) {
  const moves = opts.moves?.filter(m => D.moves[m]) || enemyMoves(speciesKey, level);
  const a = makeActor(speciesKey, level, 'enemy', { ...opts, moves, hpMul: opts.hpMul ?? 1.7 });
  a.brain = opts.brain || wildBrain;
  a.spawnT = opts.spawnT ?? 0.7; a.spawnMax = a.spawnT;
  if (opts.elite) { a.maxHp = Math.round(a.maxHp * 1.8); a.hp = a.maxHp; a.dmgScale = ENEMY_DMG(world.run?.biome || 0) * 1.3; a.poise = 1; a.coolBase = 0.8; }
  a.dmgScale ??= ENEMY_DMG(world.run?.biome || 0);
  const run = world.run;
  if (heatAt(run, 1)) a.dmgScale *= 1.15;
  if (heatAt(run, 8)) a.dmgScale *= 1.25;
  a.dmgScale *= 1 + 0.03 * (run?.heat || 0); // every HEAT level also sharpens foes a little
  if (heatAt(run, 2)) { a.maxHp = Math.round(a.maxHp * 1.15); a.hp = a.maxHp; }
  return a;
}

// pick n wild enemies for a wave
export function rollWave(run, n) {
  const biome = BIOMES[run.biome];
  const pool = wildPool(biome);
  const out = [], count = {};
  const cap = Math.max(1, Math.ceil(n * 0.4)); // no species above ~40% of a wave, for variety
  for (let i = 0; i < n; i++) {
    const ok = pool.filter(x => (count[x.species] || 0) < cap);
    const s = run.rng.weighted(ok.length ? ok : pool, x => x.rate);
    count[s.species] = (count[s.species] || 0) + 1;
    out.push({ species: s.species, level: enemyLevel(run, run.rng.int(s.min, s.max)) });
  }
  return out;
}

// silph/tower trainers: use their parties as enemy waves
export function rollTrainer(run, used = new Set()) {
  const biome = BIOMES[run.biome];
  const list = trainersFor(biome).filter(t => !used.has(t.key));
  if (!list.length) return null;
  return run.rng.pick(list);
}

export function trainerParty(run, t, bonus = 0) {
  return t.party.map(p => ({ species: p.species, level: Math.max(2, p.level + bonus + Math.round(BIOMES[run.biome].levelBonus[0] * 0.3)), moves: p.moves || defaultMoves(p.species, p.level) }));
}

// how dangerous a species is (for wave budgets)
export function threat(speciesKey, level) {
  const s = D.species[speciesKey];
  const bst = Object.values(s.stats).reduce((a, b) => a + b, 0);
  return bst / 300 * (0.6 + level / 40);
}

export { profile };
