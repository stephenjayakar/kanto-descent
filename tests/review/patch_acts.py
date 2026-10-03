import re
def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

# ---------------------------------------------------------------- content: acts, new areas, routes
rep('web/src/game/content.js', [
    ("    key: 'forest', name: 'VIRIDIAN FOREST', music: 'mus_viridian_forest', rooms: 6, vignette: 0.25,",
     "    key: 'forest', name: 'VIRIDIAN FOREST', music: 'mus_viridian_forest', rooms: 6, vignette: 0.25, design: 0,"),
    ("    key: 'mtmoon', name: 'MT. MOON', music: 'mus_mt_moon', rooms: 7, vignette: 0.45,",
     "    key: 'mtmoon', name: 'MT. MOON', music: 'mus_mt_moon', rooms: 7, vignette: 0.45, design: 1,"),
    ("    key: 'tower', name: 'POKéMON TOWER', music: 'mus_poke_tower', rooms: 7, vignette: 0.6, dark: true,",
     "    key: 'tower', name: 'POKéMON TOWER', music: 'mus_poke_tower', rooms: 7, vignette: 0.6, dark: true, design: 2,"),
    ("    key: 'silph', name: 'SILPH CO.', music: 'mus_silph', rooms: 7, vignette: 0.2,",
     "    key: 'silph', name: 'SILPH CO.', music: 'mus_silph', rooms: 7, vignette: 0.2, design: 3,"),
    ("    key: 'cave', name: 'CERULEAN CAVE', music: 'mus_rocket_hideout', rooms: 3, vignette: 0.55,",
     "    key: 'cave', name: 'CERULEAN CAVE', music: 'mus_rocket_hideout', rooms: 6, vignette: 0.55, design: 4, // v0.0.3: twice as long"),
    ("""    intro: 'The deepest cave in KANTO. An immense power waits at the bottom.',
  },
];""", """    intro: 'The deepest cave in KANTO. An immense power waits at the bottom.',
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
    intro: 'Frozen caves under the sea between Fuchsia and Cinnabar. The ELITE FOUR\\'s ice master trains here.',
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
export const levelShift = run => STAGE_LEVEL[run.biome] - STAGE_LEVEL[areaOf(run).design ?? run.biome];"""),
])

# ---------------------------------------------------------------- replace area lookups
subs = [
    ('web/src/game/run.js', [("  const B = BIOMES[run.biome];", "  const B = areaOf(run);"), ("  const biome = BIOMES[run.biome];", "  const biome = areaOf(run);"),
                             ("export function roomsLeftInBiome(run) { return BIOMES[run.biome].rooms - run.roomInBiome; }", "export function roomsLeftInBiome(run) { return areaOf(run).rooms - run.roomInBiome; }")]),
    ('web/src/game/spawn.js', [("  const b = BIOMES[run.biome];\n  const k = run.roomInBiome / Math.max(1, b.rooms - 1);\n  return Math.max(2, Math.round(base + b.levelBonus[0] + (b.levelBonus[1] - b.levelBonus[0]) * k));",
                                "  const b = areaOf(run);\n  const k = run.roomInBiome / Math.max(1, b.rooms - 1);\n  return Math.max(2, Math.round(base + levelShift(run) + b.levelBonus[0] + (b.levelBonus[1] - b.levelBonus[0]) * k));"),
                               ("  const biome = BIOMES[run.biome];", "  const biome = areaOf(run);"), ("  const biome = BIOMES[run.biome];", "  const biome = areaOf(run);"),
                               ("level: Math.max(2, p.level + bonus + Math.round(BIOMES[run.biome].levelBonus[0] * 0.3))", "level: Math.max(2, p.level + bonus + levelShift(run) + Math.round(areaOf(run).levelBonus[0] * 0.3))"),
                               ("import { BIOMES, TUNING, heatAt } from './content.js';", "import { BIOMES, TUNING, heatAt, areaOf, levelShift } from './content.js';")]),
    ('web/src/scenes/hud.js', [("  const B = BIOMES[run.biome];", "  const B = areaOf(run);")]),
    ('web/src/scenes/rewards.js', [
        ("  const B = BIOMES[run.biome];", "  const B = areaOf(run);"), ("  const B = BIOMES[run.biome];", "  const B = areaOf(run);"),
        ("  if (r.kind === 'next') return `Onward to ${BIOMES[G.run.biome + 1]?.name || '...'}`;", "  if (r.kind === 'next') return `Onward to ${G.run.biome + 1 < STAGES ? areaAt(G.run, G.run.biome + 1).name : '...'}`;"),
        ("  if (r.kind === 'boss') return `${BIOMES[G.run.biome].name}: the boss awaits`;", "  if (r.kind === 'boss') return `${areaOf(G.run).name}: the boss awaits`;"),
        ("Sound.playBGM(BIOMES[G.run.biome]?.music || 'mus_pallet'); this.done(); }", "Sound.playBGM(areaOf(G.run)?.music || 'mus_pallet'); this.done(); }"),
        ("  Sound.playBGM(BIOMES[run.biome]?.music || 'mus_pallet');", "  Sound.playBGM(areaOf(run)?.music || 'mus_pallet');"),
        ("      `Reached: ${BIOMES[run.biome].name}, room ${run.roomInBiome + 1}`,", "      `Reached: ${areaOf(run).name} (${ACTS[actOf(run.biome)].name}), room ${run.roomInBiome + 1}`,"),
        ("reached ${BIOMES[last.biome].name} (", "reached ${(last.area ? areaByKey(last.area) : BIOMES[last.biome])?.name || '?'} ("),
        ("  if (kind === 'boss') { run.roomInBiome = BIOMES[run.biome].rooms; return goNext({ spec: { kind: 'x' } }, { kind: 'boss' }) || run; }",
         "  if (kind === 'boss') { run.roomInBiome = areaOf(run).rooms; return goNext({ spec: { kind: 'x' } }, { kind: 'boss' }) || run; }"),
        ("  run.biome = +(q.get('biome') || 0); run.roomInBiome = +(q.get('room') || 1);", "  run.biome = +(q.get('biome') || 0); run.roomInBiome = +(q.get('room') || 1);\n  if (q.get('area')) run.route[run.biome] = q.get('area'); // dev: force an area at this stage"),
        ("import { BIOMES, STARTERS, HELD, RESEARCH, EEVEE_CHOICES, BOSS_UNLOCK_TEXT, HEAT } from '../game/content.js';",
         "import { BIOMES, STARTERS, HELD, RESEARCH, EEVEE_CHOICES, BOSS_UNLOCK_TEXT, HEAT, ACTS, STAGES, areaOf, areaAt, areaByKey, actOf } from '../game/content.js';"),
    ]),
    ('web/src/scenes/room.js', [
        ("    world.maxAttackers = (BIOMES[run.biome]?.maxAttackers ?? 2) * (Coop.active ? 2 : 1);", "    world.maxAttackers = (areaOf(run)?.maxAttackers ?? 2) * (Coop.active ? 2 : 1);"),
        ("    const spec = this.spec, run = this.run, w = this.world, B = BIOMES[run.biome];", "    const spec = this.spec, run = this.run, w = this.world, B = areaOf(run);"),
        ("    const run = this.run, B = BIOMES[run.biome];", "    const run = this.run, B = areaOf(run);"),
        ("    this.world.maxAttackers = Math.max(BIOMES[this.run.biome]?.maxAttackers ?? 2, 1) * (Coop.active ? 2 : 1);", "    this.world.maxAttackers = Math.max(areaOf(this.run)?.maxAttackers ?? 2, 1) * (Coop.active ? 2 : 1);"),
        ("    const B = BIOMES[this.run.biome];", "    const B = areaOf(this.run);"),
        ("      const last = run.biome >= BIOMES.length - 1;", "      const last = run.biome >= STAGES - 1;"),
        ("import { BIOMES } from '../game/content.js';", "import { BIOMES, STAGES, areaOf } from '../game/content.js';"),
    ]),
]
for p, pairs in subs:
    rep(p, pairs)

# run.js imports + newRun route
s = open('web/src/game/run.js', encoding='utf8').read()
s = s.replace("import { BIOMES, STARTERS, HELD, RESEARCH, SPECIAL_EVOS } from './content.js';", "import { BIOMES, STARTERS, HELD, RESEARCH, SPECIAL_EVOS, areaOf, rollRoute } from './content.js';", 1)
a = "    biome: 0, roomInBiome: 0, depth: 0, kills: 0, time: 0, stardustGained: 0, caught: [],"
assert a in s
s = s.replace(a, "    biome: 0, roomInBiome: 0, depth: 0, kills: 0, time: 0, stardustGained: 0, caught: [], route: rollRoute(rng), // v0.0.3: areas change every run", 1)
open('web/src/game/run.js', 'w', encoding='utf8').write(s)
print('ok')
