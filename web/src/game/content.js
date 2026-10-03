// Biomes, starters, held items and shop stock.

// Global difficulty knobs (tuned with tests/sim: a decent player with no research should win ~1 run in 4).
export const TUNING = { enemyDmg: 1.8, bossDmg: 0.78, bossSecs: 4.2 }; // v0.0.2: boss HP doubled (bossSecs 2.1 -> 4.2), each hit softer

export const BIOMES = [
  {
    key: 'forest', name: 'VIRIDIAN FOREST', music: 'mus_viridian_forest', rooms: 6, vignette: 0.25, design: 0,
    pools: [['LAYOUT_VIRIDIAN_FOREST', [0, 1, 2, 3, 4, 5, 6, 7]]],
    encounters: ['MAP_VIRIDIAN_FOREST', 'MAP_ROUTE2'], trainerMaps: ['MAP_VIRIDIAN_FOREST'], levelBonus: [0, 3],
    boss: 'BROCK', bossRoom: ['LAYOUT_PEWTER_CITY_GYM', 0], waves: [1, 2], perWave: [3, 4], maxAttackers: 2,
    intro: 'Bug-filled woods between Viridian and Pewter.',
  },
  {
    key: 'mtmoon', name: 'MT. MOON', music: 'mus_mt_moon', rooms: 7, vignette: 0.45, design: 1,
    pools: [['LAYOUT_MT_MOON_1F', [0, 1, 2, 3, 4]], ['LAYOUT_MT_MOON_B1F', [0]], ['LAYOUT_MT_MOON_B2F', [0, 1, 2, 3]]],
    encounters: ['MAP_MT_MOON_1F', 'MAP_MT_MOON_B1F', 'MAP_MT_MOON_B2F'], trainerMaps: ['MAP_MT_MOON_1F', 'MAP_MT_MOON_B2F'], levelBonus: [4, 8],
    boss: 'MISTY', bossRoom: ['LAYOUT_CERULEAN_CITY_GYM', 0], waves: [2, 2], perWave: [3, 5], maxAttackers: 2,
    intro: 'A dark cave said to hold fallen stars. Team Rocket is digging for fossils.',
  },
  {
    key: 'tower', name: 'POKéMON TOWER', music: 'mus_poke_tower', rooms: 7, vignette: 0.6, dark: true, design: 2,
    pools: [['LAYOUT_POKEMON_TOWER_1F', [0, 1]], ['LAYOUT_POKEMON_TOWER_2F', [0, 1]], ['LAYOUT_POKEMON_TOWER_3F', [0, 1]], ['LAYOUT_POKEMON_TOWER_4F', [0, 1]], ['LAYOUT_POKEMON_TOWER_5F', [0, 1]]],
    encounters: ['MAP_POKEMON_TOWER_3F', 'MAP_POKEMON_TOWER_4F', 'MAP_POKEMON_TOWER_5F', 'MAP_POKEMON_TOWER_6F'], trainerMaps: ['MAP_POKEMON_TOWER_3F', 'MAP_POKEMON_TOWER_4F', 'MAP_POKEMON_TOWER_5F'], levelBonus: [2, 5],
    boss: 'MAROWAK', bossRoom: ['LAYOUT_POKEMON_TOWER_6F', 0], waves: [2, 3], perWave: [3, 5], maxAttackers: 3,
    intro: 'Lavender\'s resting place for departed POKéMON. Something restless haunts the upper floors.',
  },
  {
    key: 'silph', name: 'SILPH CO.', music: 'mus_silph', rooms: 7, vignette: 0.2, design: 3,
    pools: [['LAYOUT_SILPH_CO_2F', [0]], ['LAYOUT_SILPH_CO_3F', [0]], ['LAYOUT_SILPH_CO_4F', [0]], ['LAYOUT_SILPH_CO_5F', [0]], ['LAYOUT_SILPH_CO_6F', [0]], ['LAYOUT_SILPH_CO_7F', [0]], ['LAYOUT_SILPH_CO_8F', [0]], ['LAYOUT_SILPH_CO_9F', [0]]],
    encounters: [], trainerMaps: ['MAP_SILPH_CO_2F', 'MAP_SILPH_CO_3F', 'MAP_SILPH_CO_4F', 'MAP_SILPH_CO_5F', 'MAP_SILPH_CO_6F', 'MAP_SILPH_CO_7F', 'MAP_SILPH_CO_8F', 'MAP_SILPH_CO_9F', 'MAP_SILPH_CO_10F'], levelBonus: [3, 6],
    boss: 'GIOVANNI', bossRoom: ['LAYOUT_SILPH_CO_11F', 0], waves: [2, 3], perWave: [3, 4], maxAttackers: 3, trainerOnly: true,
    intro: 'Team Rocket has seized the SILPH CO. tower in Saffron.',
  },
  {
    key: 'cave', name: 'CERULEAN CAVE', music: 'mus_rocket_hideout', rooms: 6, vignette: 0.55, design: 4, // v0.0.3: twice as long
    pools: [['LAYOUT_CERULEAN_CAVE_1F', [0, 1]], ['LAYOUT_CERULEAN_CAVE_2F', [0]], ['LAYOUT_CERULEAN_CAVE_B1F', [1]]],
    encounters: ['MAP_CERULEAN_CAVE_1F', 'MAP_CERULEAN_CAVE_2F', 'MAP_CERULEAN_CAVE_B1F'], trainerMaps: [], levelBonus: [-12, -6],
    boss: 'MEWTWO', bossRoom: ['LAYOUT_CERULEAN_CAVE_B1F', 0], waves: [2, 3], perWave: [3, 4], maxAttackers: 3,
    intro: 'The deepest cave in KANTO. An immense power waits at the bottom.',
  },
  // v0.0.3 areas (appended so old records' area indices stay valid)
  {
    key: 'rocktunnel', name: 'ROCK TUNNEL', music: 'mus_mt_moon', rooms: 7, vignette: 0.7, dark: true, design: 1,
    pools: [['LAYOUT_ROCK_TUNNEL_1F', [0, 1, 2, 3]], ['LAYOUT_ROCK_TUNNEL_B1F', [0, 1, 2]]],
    encounters: ['MAP_ROCK_TUNNEL_1F', 'MAP_ROCK_TUNNEL_B1F'], trainerMaps: ['MAP_ROCK_TUNNEL_1F', 'MAP_ROCK_TUNNEL_B1F'], levelBonus: [0, 4],
    boss: 'LT_SURGE', bossRoom: ['LAYOUT_VERMILION_CITY_GYM', 0], waves: [2, 2], perWave: [3, 5], maxAttackers: 2,
    intro: 'A pitch-black tunnel to Lavender. Hikers say the walls hum with electricity.',
  },
  {
    key: 'seafoam', name: 'SEAFOAM ISLANDS', music: 'mus_viridian_forest', rooms: 7, vignette: 0.4, design: 3,
    pools: [['LAYOUT_SEAFOAM_ISLANDS_1F', [0]], ['LAYOUT_SEAFOAM_ISLANDS_B1F', [0]], ['LAYOUT_SEAFOAM_ISLANDS_B2F', [0, 1]], ['LAYOUT_SEAFOAM_ISLANDS_B3F', [0]], ['LAYOUT_SEAFOAM_ISLANDS_B4F', [0]]],
    encounters: ['MAP_SEAFOAM_ISLANDS_1F', 'MAP_SEAFOAM_ISLANDS_B1F', 'MAP_SEAFOAM_ISLANDS_B2F', 'MAP_SEAFOAM_ISLANDS_B3F', 'MAP_SEAFOAM_ISLANDS_B4F'], trainerMaps: [], levelBonus: [-4, 0],
    boss: 'LORELEI', bossRoom: ['LAYOUT_POKEMON_LEAGUE_LORELEIS_ROOM', 0], waves: [2, 3], perWave: [3, 4], maxAttackers: 3,
    intro: 'Frozen caves under the sea between Fuchsia and Cinnabar. The ELITE FOUR\'s ice master trains here.',
  },
];

// v0.0.3: a run is 3 acts. Acts 1 and 2 each draw two of their three areas (random order), act 3 is CERULEAN CAVE.
// run.biome is the STAGE (0..4, drives scaling everywhere); run.route[stage] is which area that stage is.
export const ACTS = [
  { name: 'ACT 1', stages: 2, pool: ['forest', 'mtmoon', 'rocktunnel'] },
  { name: 'ACT 2', stages: 2, pool: ['tower', 'silph', 'seafoam'] },
  { name: 'ACT 3', stages: 1, pool: ['cave'] },
];
export const STAGES = ACTS.reduce((n, a) => n + a.stages, 0);
const BY_KEY = Object.fromEntries(BIOMES.map(b => [b.key, b]));
export const areaByKey = k => BY_KEY[k];
export function rollRoute(rng) {
  const route = [];
  for (const act of ACTS) route.push(...rng.sample(act.pool, act.stages));
  return route;
}
// the area the run is in at a stage (old saves without a route follow the original order)
export function areaAt(run, stage = run.biome) { return BY_KEY[run.route?.[stage]] || BIOMES[stage] || BIOMES[0]; }
export const areaOf = run => areaAt(run, run.biome);
export function actOf(stage) { let s = stage; for (let i = 0; i < ACTS.length; i++) { if (s < ACTS[i].stages) return i; s -= ACTS[i].stages; } return ACTS.length - 1; }
// typical enemy level at each stage; an area played earlier/later than it was designed for is shifted
export const STAGE_LEVEL = [6, 16, 22, 32, 46];
export const levelShift = run => STAGE_LEVEL[run.biome] - STAGE_LEVEL[areaOf(run).design ?? run.biome];

// Starter kits. Unlocks come from defeating bosses (meta.badges).
export const STARTERS = [
  { species: 'CHARMANDER', slots: { attack: 'SCRATCH', special: 'EMBER', cast: 'GROWL' }, blurb: 'Claw combos and fireballs. Evolves at 16 and 36.' },
  { species: 'BULBASAUR', slots: { attack: 'VINE_WHIP', special: 'RAZOR_LEAF', cast: 'LEECH_SEED' }, blurb: 'Long whip reach and spread leaves. Sturdy.' },
  { species: 'SQUIRTLE', slots: { attack: 'TACKLE', special: 'BUBBLE', cast: 'WITHDRAW' }, blurb: 'Tough shell, lunging tackles, bubble spreads.' },
  { species: 'PIKACHU', slots: { attack: 'QUICK_ATTACK', special: 'THUNDER_SHOCK', cast: 'THUNDER_WAVE' }, blurb: 'Fast. Dashing strikes and chain lightning.', unlock: ['BROCK', 'LT_SURGE'] },
  { species: 'EEVEE', slots: { attack: 'TACKLE', special: 'SWIFT', cast: 'SAND_ATTACK' }, blurb: 'Homing stars. Picks an evolution at level 20.', unlock: 'MISTY' },
  { species: 'GASTLY', slots: { attack: 'SHADOW_PUNCH', special: 'NIGHT_SHADE', cast: 'HYPNOSIS' }, blurb: 'Fragile ghost. Night Shade ignores defenses.', unlock: 'MAROWAK' },
  { species: 'DRATINI', slots: { attack: 'TWISTER', special: 'DRAGON_RAGE', cast: 'THUNDER_WAVE' }, blurb: 'Slow to start, a dragon by the end.', unlock: ['GIOVANNI', 'LORELEI'] },
];
// Starters that evolve by stone or trade evolve at these levels in this game.
export const SPECIAL_EVOS = {
  PIKACHU: [30, 'RAICHU'], DRAGONAIR: [42, 'DRAGONITE'], HAUNTER: [38, 'GENGAR'], KADABRA: [38, 'ALAKAZAM'], MACHOKE: [38, 'MACHAMP'], GRAVELER: [38, 'GOLEM'],
};
export const EEVEE_CHOICES = ['VAPOREON', 'JOLTEON', 'FLAREON'];

// Held items (one slot; Hades keepsakes). FireRed item icons.
export const HELD = {
  LEFTOVERS: { name: 'LEFTOVERS', desc: 'Restore 1% HP every 2 seconds in battle.' },
  QUICK_CLAW: { name: 'QUICK CLAW', desc: '+1 Dash charge.', stat: p => { p.dashCharges += 1; } },
  SCOPE_LENS: { name: 'SCOPE LENS', desc: '+10% critical hit chance.', stat: p => { p.critBonus = (p.critBonus || 0) + 0.1; } },
  SHELL_BELL: { name: 'SHELL BELL', desc: 'Restore 3% HP when you knock out a foe.' },
  FOCUS_BAND: { name: 'FOCUS BAND', desc: 'Once per area, survive a fatal hit with 1 HP.' },
  KINGS_ROCK: { name: "KING'S ROCK", desc: 'Attacks have a 12% chance to make foes flinch.' },
  LUCKY_EGG: { name: 'LUCKY EGG', desc: '+50% EXP.' },
  AMULET_COIN: { name: 'AMULET COIN', desc: '+50% money.', stat: p => { p.moneyMul = (p.moneyMul || 1) + 0.5; } },
  EXP_SHARE: { name: 'EXP. SHARE', desc: 'Your partner\'s Call gauge fills 60% faster.' },
  BRIGHT_POWDER: { name: 'BRIGHTPOWDER', desc: '12% chance to dodge any hit.' },
  CHOICE_BAND: { name: 'CHOICE BAND', desc: 'Attack deals +40% damage. Special cooldowns are 30% longer.', stat: p => { p.slotMul.attack = (p.slotMul.attack || 1) * 1.4; p.cdMul.special = 1.3; } },
  CHARCOAL: { name: 'CHARCOAL', type: 'FIRE' }, MYSTIC_WATER: { name: 'MYSTIC WATER', type: 'WATER' }, MIRACLE_SEED: { name: 'MIRACLE SEED', type: 'GRASS' },
  MAGNET: { name: 'MAGNET', type: 'ELECTRIC' }, NEVER_MELT_ICE: { name: 'NEVERMELTICE', type: 'ICE' }, TWISTED_SPOON: { name: 'TWISTEDSPOON', type: 'PSYCHIC' },
  SPELL_TAG: { name: 'SPELL TAG', type: 'GHOST' }, BLACK_BELT: { name: 'BLACK BELT', type: 'FIGHTING' }, SOFT_SAND: { name: 'SOFT SAND', type: 'GROUND' },
  HARD_STONE: { name: 'HARD STONE', type: 'ROCK' }, SHARP_BEAK: { name: 'SHARP BEAK', type: 'FLYING' }, POISON_BARB: { name: 'POISON BARB', type: 'POISON' },
  SILVER_POWDER: { name: 'SILVERPOWDER', type: 'BUG' }, DRAGON_FANG: { name: 'DRAGON FANG', type: 'DRAGON' }, BLACK_GLASSES: { name: 'BLACKGLASSES', type: 'DARK' },
  METAL_COAT: { name: 'METAL COAT', type: 'STEEL' }, SILK_SCARF: { name: 'SILK SCARF', type: 'NORMAL' },
};
for (const [k, h] of Object.entries(HELD)) { h.key = k; if (h.type) h.desc = `${h.type} moves deal +25% damage.`; }

// Oak's research (Mirror of Night). cost[rank] in STARDUST.
export const RESEARCH = [
  { key: 'hp', name: 'HP UP study', desc: r => `+${r * 4}% max HP`, max: 5, cost: [15, 30, 50, 75, 100], icon: 'hp_up' },
  { key: 'power', name: 'PROTEIN study', desc: r => `+${r * 3}% damage`, max: 5, cost: [20, 40, 60, 90, 120], icon: 'protein' },
  { key: 'revive', name: 'REVIVAL HERB', desc: r => r ? '1 Revive per run (rise with 30% HP)' : 'A Revive each run', max: 1, cost: [160], icon: 'revival_herb' },
  { key: 'level', name: "OAK's training", desc: r => `Start runs at Lv. ${5 + r * 2}`, max: 2, cost: [40, 90], icon: 'rare_candy' },
  { key: 'dash', name: 'QUICK FEET', desc: r => r ? '+1 Dash charge' : 'Unlock a second Dash charge', max: 1, cost: [200], icon: 'quick_claw' },
  { key: 'money', name: 'AMULET COIN', desc: r => `Start runs with ¥${50 + r * 25}`, max: 4, cost: [15, 25, 40, 60], icon: 'amulet_coin' },
  { key: 'balls', name: 'BALL POUCH', desc: r => `Start with ${3 + r} POKé BALLS`, max: 3, cost: [20, 40, 70], icon: 'poke_ball' },
  { key: 'exp', name: 'LUCKY EGG', desc: r => `+${r * 5}% EXP`, max: 3, cost: [25, 50, 90], icon: 'lucky_egg' },
  { key: 'luck', name: 'SHINY CHARM', desc: r => `Rarer boons more often (+${r * 6}%)`, max: 3, cost: [40, 80, 140], icon: 'star_piece' },
  { key: 'reroll', name: 'ITEMFINDER', desc: r => `${r} door reroll${r === 1 ? '' : 's'} per run (press E at a door)`, max: 3, cost: [40, 80, 130], icon: 'itemfinder' },
  { key: 'call', name: 'EXP. SHARE', desc: r => `Partner stays ${r * 2}s longer, gauge fills ${r * 20}% faster`, max: 3, cost: [30, 60, 100], icon: 'exp_share' },
];

// HEAT (Hades' Pact of Punishment): unlocked by escaping once. Each level adds one rule, cumulative,
// raises foe damage a further 3%, and raises STARDUST earned by 10%.
export const HEAT = [
  null,
  'Foes deal 15% more damage',
  'Foes have 15% more HP',
  'Bosses have 15% more HP and attack faster',
  'Elite foes appear more often',
  'Foes\' projectiles fly 15% faster',
  'NURSE JOY heals 25% less',
  'One more foe in every wave',
  'Foes deal another 25% more damage',
  'Bosses deal 30% more damage',
  'MEWTWO is enraged from the start',
];
export const heatAt = (run, n) => (run?.heat || 0) >= n;

export const BOSS_UNLOCK_TEXT = {
  BROCK: 'PIKACHU can now be chosen at the lab!',
  MISTY: 'EEVEE can now be chosen at the lab!',
  MAROWAK: 'GASTLY can now be chosen at the lab!',
  GIOVANNI: 'DRATINI can now be chosen at the lab!',
  LT_SURGE: 'PIKACHU can now be chosen at the lab!',
  LORELEI: 'DRATINI can now be chosen at the lab!',
};
