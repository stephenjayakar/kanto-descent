import os
os.chdir('/e/BigData/games/firered-hades' if os.path.exists('/e') else 'E:/BigData/games/firered-hades')

def patch(f, pairs):
    s = open(f, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (f, a[:90])
        s = s.replace(a, b, 1)
    open(f, 'w', encoding='utf8').write(s)

# ---- research nerfs + heat definitions
patch('web/src/game/content.js', [
("""  { key: 'hp', name: 'HP UP study', desc: r => `+${r * 6}% max HP`, max: 5, cost: [15, 30, 50, 75, 100], icon: 'hp_up' },
  { key: 'power', name: 'PROTEIN study', desc: r => `+${r * 5}% damage`, max: 5, cost: [20, 40, 60, 90, 120], icon: 'protein' },
  { key: 'revive', name: 'REVIVAL HERB', desc: r => `${r} Revive${r === 1 ? '' : 's'} per run (rise with 50% HP)`, max: 2, cost: [60, 200], icon: 'revival_herb' },
  { key: 'level', name: "OAK's training", desc: r => `Start runs at Lv. ${5 + r * 2}`, max: 3, cost: [30, 70, 130], icon: 'rare_candy' },""",
"""  { key: 'hp', name: 'HP UP study', desc: r => `+${r * 4}% max HP`, max: 5, cost: [15, 30, 50, 75, 100], icon: 'hp_up' },
  { key: 'power', name: 'PROTEIN study', desc: r => `+${r * 3}% damage`, max: 5, cost: [20, 40, 60, 90, 120], icon: 'protein' },
  { key: 'revive', name: 'REVIVAL HERB', desc: r => r ? '1 Revive per run (rise with 50% HP)' : 'A Revive each run', max: 1, cost: [100], icon: 'revival_herb' },
  { key: 'level', name: "OAK's training", desc: r => `Start runs at Lv. ${5 + r * 2}`, max: 2, cost: [40, 90], icon: 'rare_candy' },"""),
("""  { key: 'reroll', name: 'ITEMFINDER', desc: r => `${r} door reroll${r === 1 ? '' : 's'} per run (press R at a door)`, max: 3, cost: [50, 100, 160], icon: 'itemfinder' },""",
"""  { key: 'reroll', name: 'ITEMFINDER', desc: r => `${r} door reroll${r === 1 ? '' : 's'} per run (press E at a door)`, max: 3, cost: [40, 80, 130], icon: 'itemfinder' },"""),
("""export const BOSS_UNLOCK_TEXT = {""", """// HEAT (Hades' Pact of Punishment): unlocked by escaping once. Each level adds one rule, cumulative,
// and raises STARDUST earned by 10%.
export const HEAT = [
  null,
  'Foes deal 15% more damage',
  'Foes have 15% more HP',
  'Bosses have 15% more HP and attack faster',
  'Elite foes appear more often',
  'Foes\\' projectiles fly 15% faster',
  'NURSE JOY heals 25% less',
  'One more foe in every wave',
  'Foes deal another 15% more damage',
  'Bosses deal 20% more damage',
  'MEWTWO is enraged from the start',
];
export const heatAt = (run, n) => (run?.heat || 0) >= n;

export const BOSS_UNLOCK_TEXT = {"""),
])

patch('web/src/game/run.js', [
("""  const level = 5 + rank('level') * 2;""", """  const level = 5 + rank('level') * 2;
  const heat = G.meta.heat || 0;"""),
("""    callBonus: rank('call') * 2,""", """    callBonus: rank('call') * 2, heat,"""),
("""    deaths: 0, bossKills: {}, settings""", """    deaths: 0, heat: 0, maxHeatWon: -1, bossKills: {}, settings"""),
("""  a.dmgMul = 1 + rank('power') * 0.05;""", """  a.dmgMul = 1 + rank('power') * 0.03;"""),
("""    slots: { ...kit.slots }, known: Object.values(kit.slots), hp: null, maxHpMul: 1 + rank('hp') * 0.06,""", """    slots: { ...kit.slots }, known: Object.values(kit.slots), hp: null, maxHpMul: 1 + rank('hp') * 0.04,"""),
])

# heat effects on enemies
patch('web/src/game/spawn.js', [
("""import { BIOMES, TUNING } from './content.js';""", """import { BIOMES, TUNING, heatAt } from './content.js';"""),
("""  a.dmgScale ??= ENEMY_DMG(world.run?.biome || 0);""", """  a.dmgScale ??= ENEMY_DMG(world.run?.biome || 0);
  const run = world.run;
  if (heatAt(run, 1)) a.dmgScale *= 1.15;
  if (heatAt(run, 8)) a.dmgScale *= 1.15;
  if (heatAt(run, 2)) { a.maxHp = Math.round(a.maxHp * 1.15); a.hp = a.maxHp; }"""),
])
patch('web/src/game/combat.js', [
("""    const sp = (p.speed || 200) * (a.team === 'enemy' ? (a.boss ? 0.85 : 0.72) : 1);""", """    const sp = (p.speed || 200) * (a.team === 'enemy' ? (a.boss ? 0.85 : 0.72) * ((this.run?.heat || 0) >= 5 ? 1.15 : 1) : 1);"""),
])
patch('web/src/game/bosses.js', [
("""import { TUNING } from './content.js';""", """import { TUNING, heatAt } from './content.js';"""),
("""  a.maxHp = a.hp = bossHp(world, a, m.secs * TUNING.bossSecs * (world.run.bossHpMul || 1));
  a.dmgScale = m.dmg * TUNING.bossDmg;""", """  a.maxHp = a.hp = bossHp(world, a, m.secs * TUNING.bossSecs * (heatAt(world.run, 3) ? 1.15 : 1));
  a.dmgScale = m.dmg * TUNING.bossDmg * (heatAt(world.run, 9) ? 1.2 : 1) * (heatAt(world.run, 1) ? 1.15 : 1);"""),
("""  a.bd = { cool: 1.5, used: {} }; a.spawnT = 0.01; a.poise = 1; a.tempo = m.tempo || 1;""", """  a.bd = { cool: 1.5, used: {} }; a.spawnT = 0.01; a.poise = 1; a.tempo = (m.tempo || 1) * (heatAt(world.run, 3) ? 0.9 : 1);"""),
("""  const newPhase = frac < 0.25 && a.species === 'MEWTWO' ? 2 : frac < 0.5 ? 1 : 0;""", """  const enraged = a.species === 'MEWTWO' && heatAt(world.run, 10);
  const newPhase = frac < (enraged ? 0.5 : 0.25) && a.species === 'MEWTWO' ? 2 : (frac < 0.5 || enraged) ? 1 : 0;"""),
])
patch('web/src/scenes/room.js', [
("""      const n = run.rng.int(B.perWave[0], B.perWave[1]) + Math.floor(run.roomInBiome / 3);
      this.waves.push(rollWave(run, n).map(e => ({ ...e, elite: run.depth > 2 && run.rng.chance(0.08 + run.biome * 0.03) })));""",
"""      const n = run.rng.int(B.perWave[0], B.perWave[1]) + Math.floor(run.roomInBiome / 3) + (run.heat >= 7 ? 1 : 0);
      this.waves.push(rollWave(run, n).map(e => ({ ...e, elite: run.depth > 2 && run.rng.chance(0.08 + run.biome * 0.03 + (run.heat >= 4 ? 0.1 : 0)) })));"""),
])
patch('web/src/scenes/rewards.js', [
("""  const amt = Math.round(p.maxHp * (scene.spec.preBoss ? 0.6 : 0.5));""", """  const amt = Math.round(p.maxHp * (scene.spec.preBoss ? 0.6 : 0.5) * (run.heat >= 6 ? 0.75 : 1));"""),
# stardust bonus from heat
("""    case 'stardust': case 'star_piece': { const n = r.kind === 'star_piece' ? 40 + run.biome * 8 : run.rng.int(10, 16) + run.biome * 4;""",
"""    case 'stardust': case 'star_piece': { const n = Math.round((r.kind === 'star_piece' ? 40 + run.biome * 8 : run.rng.int(10, 16) + run.biome * 4) * (1 + 0.1 * (run.heat || 0)));"""),
("""  const dust = first ? 60 + run.biome * 20 : 25 + run.biome * 8;""", """  const dust = Math.round((first ? 60 + run.biome * 20 : 25 + run.biome * 8) * (1 + 0.1 * (run.heat || 0)));"""),
# record heat on victory
("""  G.meta.wins++;
  if (!G.meta.bestTime""", """  G.meta.wins++;
  G.meta.maxHeatWon = Math.max(G.meta.maxHeatWon ?? -1, run.heat || 0);
  if (!G.meta.bestTime"""),
# rival offers heat once you've escaped
("""  scene.addNpc({ sprite: 'blue', ...at(5, 4), dir: 'down', name: 'RIVAL', onTalk: () => say([{ text: rivalLine(), name: 'RIVAL' }]) });""",
"""  scene.addNpc({ sprite: 'blue', ...at(5, 4), dir: 'down', name: 'RIVAL', label: G.meta.wins ? `HEAT ${G.meta.heat || 0}` : '', onTalk: () => rivalTalk(scene) });"""),
("""function rivalLine() {""", """async function rivalTalk(scene) {
  if (!G.meta.wins) return say([{ text: rivalLine(), name: 'RIVAL' }]);
  await say([{ text: "So you escaped CERULEAN CAVE. Bet you can't do it with my rules. Pick your HEAT.", name: 'RIVAL' }]);
  const max = Math.min(HEAT.length - 1, (G.meta.maxHeatWon ?? -1) + 1);
  const cards = [];
  for (let h = 0; h <= max; h++) cards.push({ title: `HEAT ${h}`, sub: h ? `+${h * 10}% STARDUST` : '', desc: h ? HEAT.slice(1, h + 1).join(' · ') : 'The normal rules.', accent: h ? '#e04020' : '#808080', badge: h <= (G.meta.maxHeatWon ?? -1) ? 'CLEARED' : '', badgeColor: '#30a050' });
  const i = await choose('Choose your HEAT', cards, { cardH: 44, canSkip: true, footer: 'Each level adds the rules of the ones before it. X: cancel' });
  if (i < 0) return;
  G.meta.heat = i; saveMeta();
  newRun(G.meta.lastStarter); refreshPlayer(scene); scene.world.player.brain = hubBrain(scene.world.player.brain);
  const n = scene.npcs.find(x => x.name === 'RIVAL'); if (n) n.label = `HEAT ${i}`;
}
function rivalLine() {"""),
("""import { BIOMES, STARTERS, HELD, RESEARCH, EEVEE_CHOICES, BOSS_UNLOCK_TEXT } from '../game/content.js';""", """import { BIOMES, STARTERS, HELD, RESEARCH, EEVEE_CHOICES, BOSS_UNLOCK_TEXT, HEAT } from '../game/content.js';"""),
])
# show heat on HUD
patch('web/src/scenes/hud.js', [
("""  if (B && !opts.hub) text(ctx, `${B.name} ${Math.min(run.roomInBiome + 1, B.rooms + 1)}/${B.rooms + 1}`, 150, 10, { font: 'small', color: 'whiteSoft', align: 'right' });""",
"""  if (B && !opts.hub) text(ctx, `${B.name} ${Math.min(run.roomInBiome + 1, B.rooms + 1)}/${B.rooms + 1}`, 150, 10, { font: 'small', color: 'whiteSoft', align: 'right' });
  if (run.heat) text(ctx, `HEAT ${run.heat}`, 12, H - 74, { font: 'small', color: ['#ff6040', '#301000'] });"""),
])
print('ok')
