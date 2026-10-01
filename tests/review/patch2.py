import os
os.chdir('/e/BigData/games/firered-hades' if os.path.exists('/e') else 'E:/BigData/games/firered-hades')

def patch(f, pairs):
    s = open(f, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (f, a[:90])
        s = s.replace(a, b, 1)
    open(f, 'w', encoding='utf8').write(s)

# ---------------- room.js
patch('web/src/scenes/room.js', [
# curses/hooks apply to spawned enemies
("""      a.trainerMon = !!e.trainerMon;
      a.facing = Math.atan2(p.y - a.y, p.x - a.x);
      w.add(a);""", """      a.trainerMon = !!e.trainerMon;
      a.facing = Math.atan2(p.y - a.y, p.x - a.x);
      w.add(a);
      w.hooks.onSpawn?.(w, a);"""),
# Itemfinder reroll on E (R throws balls)
("""    if (this.nearDoor && Input.justPressed('ball') && this.run.rerolls > 0""", """    if (this.nearDoor && Input.justPressed('interact') && !this.nearNpc && this.run.rerolls > 0"""),
("""      this.prompt(ctx, info + (this.run.rerolls > 0 && !['boss', 'center', 'next', 'victory'].includes(this.nearDoor.reward.kind) ? `   (R: reroll ×${this.run.rerolls})` : ''), this.nearDoor.x, this.nearDoor.y - 40);""",
"""      this.prompt(ctx, info + (this.run.rerolls > 0 && !['boss', 'center', 'next', 'victory', 'start'].includes(this.nearDoor.reward.kind) ? `   (E: reroll ×${this.run.rerolls})` : ''), this.nearDoor.x, this.nearDoor.y - 40);"""),
("""!['boss', 'center', 'next', 'victory'].includes(this.nearDoor.reward.kind)) {""", """!['boss', 'center', 'next', 'victory', 'start'].includes(this.nearDoor.reward.kind)) {"""),
])

# wave species variety cap (Pokemon Tower is ~87% Gastly)
patch('web/src/game/spawn.js', [
("""export function rollWave(run, n) {
  const biome = BIOMES[run.biome];
  const pool = wildPool(biome);
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = run.rng.weighted(pool, x => x.rate);
    out.push({ species: s.species, level: enemyLevel(run, run.rng.int(s.min, s.max)) });
  }
  return out;
}""", """export function rollWave(run, n) {
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
}"""),
("""  a.dmgScale ??= 0.55 + 0.03 * (world.run?.biome || 0);""", """  a.dmgScale ??= ENEMY_DMG(world.run?.biome || 0);"""),
("""  if (opts.elite) { a.maxHp = Math.round(a.maxHp * 1.8); a.hp = a.maxHp; a.dmgScale = 0.7; a.poise = 1; a.coolBase = 0.8; }""",
"""  if (opts.elite) { a.maxHp = Math.round(a.maxHp * 1.8); a.hp = a.maxHp; a.dmgScale = ENEMY_DMG(world.run?.biome || 0) * 1.3; a.poise = 1; a.coolBase = 0.8; }"""),
("""export function makeEnemy(world, speciesKey, level, opts = {}) {""", """// enemy damage multiplier per area (realtime hits land far more often than turn-based ones)
export const ENEMY_DMG = biome => 0.8 + 0.05 * biome;

export function makeEnemy(world, speciesKey, level, opts = {}) {"""),
("""  'SUPER NERD': 'super_nerd',""", """  'SUPER NERD': 'poke_maniac',"""),
])

patch('web/src/game/content.js', [
("""    encounters: ['MAP_MT_MOON_1F', 'MAP_MT_MOON_B1F', 'MAP_MT_MOON_B2F'], trainerMaps: ['MAP_MT_MOON_1F', 'MAP_MT_MOON_B2F'], levelBonus: [1, 4],""",
"""    encounters: ['MAP_MT_MOON_1F', 'MAP_MT_MOON_B1F', 'MAP_MT_MOON_B2F'], trainerMaps: ['MAP_MT_MOON_1F', 'MAP_MT_MOON_B2F'], levelBonus: [4, 8],"""),
("""trainerMaps: ['MAP_POKEMON_TOWER_3F', 'MAP_POKEMON_TOWER_4F', 'MAP_POKEMON_TOWER_5F'], levelBonus: [1, 4],""", """trainerMaps: ['MAP_POKEMON_TOWER_3F', 'MAP_POKEMON_TOWER_4F', 'MAP_POKEMON_TOWER_5F'], levelBonus: [5, 9],"""),
("""'MAP_SILPH_CO_9F', 'MAP_SILPH_CO_10F'], levelBonus: [0, 3],""", """'MAP_SILPH_CO_9F', 'MAP_SILPH_CO_10F'], levelBonus: [3, 6],"""),
])

# ---------------- ai.js: enemies attack sooner; enemy chain lightning isn't hitscan
patch('web/src/game/ai.js', [
("""  const ai = a.ai || (a.ai = { cool: 0.8 + world.rand() * 1.2, strafe:""", """  const ai = a.ai || (a.ai = { cool: 0.3 + world.rand() * 0.6, strafe:"""),
])
patch('web/src/game/combat.js', [
("""      if (da < 1.3 && score < best && this.lineClear(a.x, a.y, b.x, b.y)) { best = score; target = b; }""",
"""      if (da < (a.team === 'enemy' ? 0.35 : 1.3) && score < best && this.lineClear(a.x, a.y, b.x, b.y)) { best = score; target = b; }"""),
])

# ---------------- player.js: Cast has a fixed 4s cooldown
patch('web/src/game/player.js', [
("""    const cd = slot === 'attack' ? (p.cd || 0.25) : slot === 'special' ? Math.max(0.35, (p.cd || 0.6) * 1.2) : Math.max(2.5, (p.cd || 5));""",
"""    const cd = slot === 'attack' ? (p.cd || 0.25) : slot === 'special' ? Math.max(0.35, (p.cd || 0.6) * 1.2) : 4;"""),
])

# ---------------- bosses.js
patch('web/src/game/bosses.js', [
("""    mons: [{ species: 'MEWTWO', level: 70, hits: 140, dmg: 0.42, scale: 1 }],""", """    mons: [{ species: 'MEWTWO', level: 62, secs: 50, dmg: 0.36, scale: 1 }],"""),
("""    mons: [{ species: 'ONIX', level: 14, hits: 70, scale: 1, dmg: 0.5 }],""", """    mons: [{ species: 'ONIX', level: 14, secs: 18, scale: 1, dmg: 0.5 }],"""),
("""    mons: [{ species: 'STARMIE', level: 21, hits: 80, dmg: 0.5, swim: true }],""", """    mons: [{ species: 'STARMIE', level: 21, secs: 22, dmg: 0.5, swim: true }],"""),
("""    mons: [{ species: 'MAROWAK', level: 30, hits: 90, dmg: 0.5, ghostly: true }],""", """    mons: [{ species: 'MAROWAK', level: 30, secs: 25, dmg: 0.5, ghostly: true }],"""),
("""    mons: [{ species: 'RHYHORN', level: 37, hits: 55, dmg: 0.45 }, { species: 'KANGASKHAN', level: 35, hits: 55, dmg: 0.45 }],
    finale: { species: 'NIDOQUEEN', level: 41, hits: 70, dmg: 0.5, text: 'GIOVANNI sent out NIDOQUEEN!' },""",
"""    mons: [{ species: 'RHYHORN', level: 37, secs: 12, dmg: 0.45 }, { species: 'KANGASKHAN', level: 35, secs: 12, dmg: 0.45 }],
    finale: { species: 'NIDOQUEEN', level: 41, secs: 16, dmg: 0.5, text: 'GIOVANNI sent out NIDOQUEEN!' },"""),
# phase-behind swipe readable
("""    w.useMove(a, P('BONE_CLUB', { kind: 'swipe', range: 36, arc: 2.6, windup: 0.4 }), { target: t, aim: aimAt(a, t) });""",
"""    w.useMove(a, P('BONE_CLUB', { kind: 'swipe', range: 36, arc: 2.6, windup: 0.55 }), { target: t, aim: aimAt(a, t) });"""),
# DPS-based boss HP
("""export function bossHp(world, boss, hits) {
  const pl = world.player, run = world.run;
  const keys = [run.slots.attack, run.slots.special].filter(Boolean);
  let best = 0;
  for (const k of keys) {
    const p = profile(k); if (!p.damaging) continue;
    const L = pl.level, A = statOf(pl, p.special ? 'spa' : 'atk'), Dv = statOf(boss, p.special ? 'spd' : 'def');
    const base = (((2 * L) / 5 + 2) * Math.max(30, p.power) * A / Math.max(1, Dv)) / 50 + 2;
    const stab = pl.types.includes(p.type) ? 1.5 : 1;
    // type matchups matter, but softened so a bad matchup isn't a slog
    const eff = Math.max(0.25, typeEffectOf(p.type, boss.types));
    best = Math.max(best, base * stab * Math.pow(eff, 0.7) * (pl.dmgMul || 1));
  }
  const lvlGap = Math.max(0.75, Math.min(1.4, 1 + (boss.level - pl.level) * 0.03));
  return Math.max(60, Math.round(Math.max(4, best) * hits * lvlGap));
}""", """// Boss HP = target seconds x the player's sustained damage per second with their Attack + Special,
// so every starter and build gets a boss of similar length. Type matchups still count (clamped 0.5-2).
export function kitDps(world, boss) {
  const pl = world.player, run = world.run;
  let dps = 0;
  for (const slot of ['attack', 'special']) {
    const k = run.slots[slot]; if (!k) continue;
    const p = profile(k); if (!p.damaging) continue;
    let hit;
    if (p.fixed === 'level') hit = pl.level * 1.4;
    else {
      const L = pl.level, A = statOf(pl, p.special ? 'spa' : 'atk'), Dv = statOf(boss, p.special ? 'spd' : 'def');
      hit = ((((2 * L) / 5 + 2) * Math.max(20, p.power) * A / Math.max(1, Dv)) / 50 + 2) * (pl.types.includes(p.type) ? 1.5 : 1);
      hit *= Math.max(0.5, Math.min(2, typeEffectOf(p.type, boss.types) || 0.25));
    }
    const per = p.kind === 'multi' ? Math.sqrt(p.hits || 3) : p.kind === 'proj' ? Math.min(p.count || 1, 3) * 0.8 : p.kind === 'stream' ? (p.dur || 0.6) / (p.rate || 0.05) * 0.22 * 0.6 : p.kind === 'chain' ? 1.2 : 1;
    const combo = slot === 'attack' && (p.combo || 1) > 1 ? 1 + 0.5 / p.combo : 1;
    const interval = (slot === 'attack' ? (p.cd || 0.25) : Math.max(0.35, (p.cd || 0.6) * 1.2)) + 0.12;
    // special shares time with attack: weight it by how often it's ready
    dps += hit * per * combo / interval * (slot === 'special' ? 0.35 : 0.75);
  }
  return Math.max(2, dps * (pl.dmgMul || 1));
}
export function bossHp(world, boss, secs) {
  const lvlGap = Math.max(0.85, Math.min(1.3, 1 + (boss.level - world.player.level) * 0.02));
  return Math.max(60, Math.round(kitDps(world, boss) * secs * lvlGap));
}"""),
("""  a.maxHp = a.hp = bossHp(world, a, m.hits * (world.run.bossHpMul || 1));""", """  a.maxHp = a.hp = bossHp(world, a, m.secs * (world.run.bossHpMul || 1));"""),
("""  if (m.ghostly) { a.ghostly = true; a.ghost = true; }
  a.r = Math.max(a.r, 12);
  world.add(a);""", """  if (m.ghostly) { a.ghostly = true; a.ghost = true; }
  a.r = Math.max(a.r, 12);
  world.add(a);
  world.hooks.onSpawn?.(world, a);"""),
("""    if (a.ghostly && newPhase === 1) { a.ghostly = false; world.text(a, 'The GHOST was MAROWAK!', '#ffffff'); }""",
"""    if (a.ghostly && newPhase === 1) { a.ghostly = false; a.ghost = false; if (!world.reachable(a.x, a.y)) { const q = world.nearestReachable(a.x, a.y); a.x = q.x; a.y = q.y; } world.text(a, 'The GHOST was MAROWAK!', '#ffffff'); }"""),
# Giovanni's pair: only one boss winds up at a time
("""  if (bd.cool <= 0) {
    const avail = a.patterns""", """  const partnerBusy = world.actors.some(o => o !== a && o.boss && !o.dead && o.action && o.action.stage !== 'recover');
  if (bd.cool <= 0 && !partnerBusy) {
    const avail = a.patterns"""),
])
print('ok')
