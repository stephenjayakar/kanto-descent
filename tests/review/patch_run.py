import os
os.chdir('/e/BigData/games/firered-hades' if os.path.exists('/e') else 'E:/BigData/games/firered-hades')

def patch(f, pairs):
    s = open(f, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (f, a[:90])
        s = s.replace(a, b, 1)
    open(f, 'w', encoding='utf8').write(s)

patch('web/src/game/boons.js', [
("""    { key: 'C_SPEED', name: 'Foes move 25% faster', apply: w => { for (const e of w.enemies()) e.speed *= 1.25; } },
    { key: 'C_HP', name: 'Foes have +30% HP', apply: w => { for (const e of w.enemies()) { e.maxHp = Math.round(e.maxHp * 1.3); e.hp = e.maxHp; } } },
    { key: 'C_DMG', name: 'You take 20% more damage', hurt: 1.2 },""",
"""    { key: 'C_SPEED', name: 'Foes move 30% faster', spawn: e => { e.speed *= 1.3; } },
    { key: 'C_HP', name: 'Foes have +60% HP', spawn: e => { e.maxHp = Math.round(e.maxHp * 1.6); e.hp = e.maxHp; } },
    { key: 'C_DMG', name: 'You take 50% more damage', hurt: 1.5 },"""),
])

patch('web/src/game/run.js', [
("""    onRoomStart(w) { each('onRoom', w); for (const c of run.chaos) if (!c.active) c.curse.apply?.(w); },""",
"""    onRoomStart(w) { each('onRoom', w); },
    onSpawn(w, e) { for (const c of run.chaos) if (!c.active) c.curse.spawn?.(e); },"""),
("""  if (healMul !== 1) { const h = world.heal.bind(world); world.heal = (a, amt) => h(a, a.team === 'player' ? Math.round(amt * healMul) : amt); }""",
"""  // wrap heal once per world (buildHooks runs again on every refresh)
  world._baseHeal ??= world.heal.bind(world);
  world.heal = healMul === 1 ? world._baseHeal : (a, amt) => world._baseHeal(a, a.team === 'player' ? Math.round(amt * healMul) : amt);"""),
("""    boons: [], chaos: [], held: null, money: rank('money') * 40, balls: 3 + rank('balls'), ballType: 'poke_ball',""",
"""    boons: [], chaos: [], held: null, money: 50 + rank('money') * 40, balls: 3 + rank('balls'), ballType: 'poke_ball',
    callBonus: rank('call') * 2,"""),
("""  run.pendingEvo = null;
  for (const mv of movesLearnedAt(into, run.level)) if (!run.known.includes(mv) && !run.pendingLearn.includes(mv)) run.pendingLearn.push(mv);
}""", """  run.pendingEvo = null;
  for (const mv of movesLearnedAt(into, run.level)) if (!run.known.includes(mv) && !run.pendingLearn.includes(mv)) run.pendingLearn.push(mv);
  // offer the best move of the new form's own type it could already know (Eevee -> Flareon gets Ember)
  const types = D.species[into].types;
  const own = (D.species[into].learnset || []).filter(([l, m]) => l <= run.level && D.moves[m] && types.includes(D.moves[m].type) && D.moves[m].power > 0 && !run.known.includes(m) && !run.pendingLearn.includes(m));
  if (own.length && !Object.values(run.slots).some(m => types.includes(D.moves[m]?.type))) run.pendingLearn.push(own[own.length - 1][1]);
}"""),
("""    curse: rng.pick(CHAOS.curses), blessing: rng.pick(CHAOS.blessings), rooms: rng.int(2, 4), active: false,""",
"""    curse: rng.pick(CHAOS.curses), blessing: rng.pick(CHAOS.blessings), rooms: rng.int(3, 5), active: false,"""),
("""  if (!run.visited.shop?.[run.biome] && next >= 2) add('shop', 2.4);""", """  if (!run.visited.shop?.[run.biome] && next >= 2) add('shop', 2.4);
  if (!run.visited.center?.[run.biome] && next >= 3) add('center', 1.0);"""),
("""  hp_up: { name: 'HP UP', icon: 'gfx/items/hp_up.png', desc: '+10% max HP, heal 10%' },""",
"""  hp_up: { name: 'HP UP', icon: 'gfx/items/hp_up.png', desc: '+15% max HP, heal 25%' },"""),
])

patch('web/src/scenes/rewards.js', [
("""    case 'center': return go({ kind: 'center', layout: 'LAYOUT_POKEMON_CENTER_1F', cropIndex: 0, preBoss: run.roomInBiome >= B.rooms - 1, shopRoom: true });""",
"""    case 'center': (run.visited.center ??= {})[run.biome] = true; return go({ kind: 'center', layout: 'LAYOUT_POKEMON_CENTER_1F', cropIndex: 0, preBoss: run.roomInBiome >= B.rooms - 1, shopRoom: true });"""),
("""  if (r.kind === 'victory') return 'Leave CERULEAN CAVE';""", """  if (r.kind === 'victory') return 'Leave CERULEAN CAVE';
  if (r.kind === 'start') return 'Head out toward CERULEAN CAVE';"""),
("""  const pt = w.blocked(at.x, at.y) ? scene.room.center : at;""", """  const pt = w.reachable(at.x, at.y) ? at : w.nearestReachable(at.x, at.y);"""),
("""    case 'hp_up': run.maxHpMul += 0.1; refreshPlayer(scene); w.heal(w.player, Math.round(w.player.maxHp * 0.1)); Sound.playSE('se_m_stat_increase'); await say(['Max HP rose by 10%!']); break;""",
"""    case 'hp_up': run.maxHpMul += 0.15; refreshPlayer(scene); w.heal(w.player, Math.round(w.player.maxHp * 0.25)); run.hp = w.player.hp; Sound.playSE('se_m_stat_increase'); await say(['Max HP rose by 15%!']); break;"""),
("""    case 'money': { const n = Math.round((60 + run.biome * 35 + run.rng.int(0, 30)) * mm);""",
"""    case 'money': { const n = Math.round((120 + run.biome * 50 + run.rng.int(0, 30)) * mm);"""),
("""    { key: 'HP_UP', name: 'HP UP', price: 130 + b * 30, desc: '+10% max HP.',""", """    { key: 'HP_UP', name: 'HP UP', price: 80 + b * 25, desc: '+15% max HP, heal 25%.',"""),
("""    { key: 'STAR_PIECE', name: 'STAR PIECE', price: 90, desc: '+25 STARDUST for Oak.',""", """    { key: 'STAR_PIECE', name: 'STAR PIECE', price: 90 + b * 30, desc: '+25 STARDUST for Oak.',"""),
("""      ...(this.scene.spec.kind === 'hub' ? [] : [{ label: 'Give up the run', fn: () => { popOverlay(this); this.scene.world.player.hp = 0; this.scene.world.kill(this.scene.world.player, null); } }]),""",
"""      ...(this.scene.spec.kind === 'hub' ? [] : [{ label: 'Give up the run', fn: () => { popOverlay(this); const w = this.scene.world; w.forceDeath = true; w.player.hp = 0; w.kill(w.player, null); } }]),"""),
("""export function refreshPlayer(scene) {
  const run = G.run, w = scene.world, old = w.player;
  const np = makePlayer(run, old.x, old.y);
  np.hp = Math.min(np.maxHp, Math.max(1, run.hp)); np.facing = old.facing; np.brain = old.brain; np.pc = old.pc; np.cds = old.cds; np.cdMax = old.cdMax;
  np.status = old.status; np.stages = old.stages; np.iframes = old.iframes; np.id = old.id;
  if (np.pc) np.pc.dashLeft = Math.min(np.pc.dashLeft, np.dashCharges);
  w.actors[w.actors.indexOf(old)] = np; w.player = np;
  w.hooks = buildHooks(run, w);
  preloadPmd([np.dex]);
}""", """// Rebuild the player's stats/kit from the run but keep the same actor object (enemies, seeds and
// homing shots keep pointing at it) and its transient state (statuses, stages, cooldowns, shields).
export function refreshPlayer(scene) {
  const run = G.run, w = scene.world, old = w.player;
  if (!old || old.dead) return;
  const np = makePlayer(run, old.x, old.y);
  const keep = ['x', 'y', 'facing', 'brain', 'pc', 'cds', 'cdMax', 'status', 'stages', 'stageTimers', 'iframes', 'id', 'action', 'seeded', 'shieldHits', 'kx', 'ky', 'dashing', 'noCollide', 'anim', 'animT', 'protect', 'deflect'];
  const saved = {}; for (const k of keep) saved[k] = old[k];
  for (const k of Object.keys(old)) delete old[k];
  Object.assign(old, np, saved);
  old.hp = Math.min(old.maxHp, Math.max(1, run.hp));
  old._top = 0;
  if (old.pc) old.pc.dashLeft = Math.min(old.pc.dashLeft, old.dashCharges);
  w.hooks = buildHooks(run, w);
  preloadPmd([old.dex]);
}"""),
("""  scene.bossDone = true; scene.cleared = true;
  const run = G.run, def = BOSSES[scene.bossKey], key = scene.bossKey;""", """  scene.bossDone = true; scene.cleared = true;
  const run = G.run, def = BOSSES[scene.bossKey], key = scene.bossKey;
  for (const e of scene.world.enemies()) { e.dead = true; e.deathT = 0; e.noExp = true; scene.world.vfx.push({ kind: 'sendout', x: e.x, y: e.y, t: 0, life: 0.4, recall: true }); }"""),
])

patch('web/src/game/combat.js', [
("""    if (b.team === 'player' || b.team === 'ally') {
      const ctx = { target: b, prevent: false };""", """    if ((b.team === 'player' || b.team === 'ally') && !this.forceDeath) {
      const ctx = { target: b, prevent: false };"""),
])
print('ok')
