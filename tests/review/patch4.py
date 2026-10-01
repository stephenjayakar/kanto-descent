import os
os.chdir('/e/BigData/games/firered-hades' if os.path.exists('/e') else 'E:/BigData/games/firered-hades')

def patch(f, pairs):
    s = open(f, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (f, a[:100])
        s = s.replace(a, b, 1)
    open(f, 'w', encoding='utf8').write(s)

# 1 + design: boss HP vs a reference kit at the EXPECTED level, so levels/upgrades/boons shorten fights
patch('web/src/game/bosses.js', [
("""    mons: [{ species: 'ONIX', level: 14,""", """    refLevel: 15, mons: [{ species: 'ONIX', level: 14,"""),
("""    mons: [{ species: 'STARMIE', level: 21,""", """    refLevel: 24, mons: [{ species: 'STARMIE', level: 21,"""),
("""    mons: [{ species: 'MAROWAK', level: 30,""", """    refLevel: 34, mons: [{ species: 'MAROWAK', level: 30,"""),
("""    mons: [{ species: 'RHYHORN', level: 37,""", """    refLevel: 41, mons: [{ species: 'RHYHORN', level: 37,"""),
("""    mons: [{ species: 'MEWTWO', level: 62,""", """    refLevel: 45, mons: [{ species: 'MEWTWO', level: 62,"""),
("""    if (p.fixed === 'level') hit = pl.level * 1.4;
    else {""", """    if (p.fixed === 'level') hit = pl.level * 1.4;
    else if (p.fixed) hit = p.fixed * pl.level / 20;
    else {"""),
("""  return Math.max(2, dps * (pl.dmgMul || 1));
}
export function bossHp(world, boss, secs) {
  const lvlGap = Math.max(0.85, Math.min(1.3, 1 + (boss.level - world.player.level) * 0.02));
  return Math.max(60, Math.round(kitDps(world, boss) * secs * lvlGap));
}""", """  // never below a plain STAB power-60 move, so status-only kits can't shrink bosses
  const L = pl.level, A = Math.max(statOf(pl, 'atk'), statOf(pl, 'spa')), Dv = Math.max(statOf(boss, 'def'), statOf(boss, 'spd'));
  const ref = ((((2 * L) / 5 + 2) * 60 * A / Math.max(1, Dv)) / 50 + 2) * 1.5 / 0.4 * 0.75;
  return Math.max(ref, dps);
}
// HP = target seconds x DPS measured at the level you're expected to have here. Being over-leveled,
// upgraded (PROTEIN) or boon-buffed therefore shortens the fight, like a real power curve.
export function bossHp(world, boss, secs, refLevel) {
  const L = world.player.level, ref = refLevel || L;
  const levelFactor = Math.max(0.55, Math.min(1.6, Math.pow(ref / L, 1.6)));
  return Math.max(60, Math.round(kitDps(world, boss) * secs * levelFactor));
}"""),
("""  a.maxHp = a.hp = bossHp(world, a, m.secs * TUNING.bossSecs * (heatAt(world.run, 3) ? 1.15 : 1));""",
"""  a.maxHp = a.hp = bossHp(world, a, m.secs * TUNING.bossSecs * (heatAt(world.run, 3) ? 1.15 : 1), world.bossDef?.refLevel);"""),
# 12: adds get spawn hooks (curses)
("""        e.trainerMon = !!def.trainer; if (def.adds.swim) e.flying = true;
        world.add(e);""", """        e.trainerMon = !!def.trainer; if (def.adds.swim) e.flying = true;
        world.add(e);
        world.hooks.onSpawn?.(world, e);"""),
])
# spawnBoss sets bossDef after spawning mons: set it before
patch('web/src/game/bosses.js', [
("""export function spawnBoss(world, key, at) {
  const def = BOSSES[key];
  const list = [];""", """export function spawnBoss(world, key, at) {
  const def = BOSSES[key];
  world.bossDef = def;
  const list = [];"""),
])

# 2 + 10: catch reads status before clearing; confusion cleared
patch('web/src/game/player.js', [
("""        world.cancelAction(e); e.captured = true; e.untargetable = true; e.vx = e.vy = 0; e.status = {};
        Sound.playSE('se_ball_open');
        b.shakes = catchShakes(world, e, b.ball);""", """        b.shakes = catchShakes(world, e, b.ball); // status bonuses count, so read them first
        world.cancelAction(e); e.captured = true; e.untargetable = true; e.vx = e.vy = 0; e.status = {}; e.confused = false;
        Sound.playSE('se_ball_open');"""),
])

# 3: Disable on the player: short, respects i-frames and dashes; debuffs skip invulnerable players
patch('web/src/game/combat.js', [
("""    if (kind === 'stun') { if (a.boss && (a.stunImmune || 0) > this.time) return;""", """    if (kind === 'stun' && a.team === 'player') { if (a.iframes > 0 || a.action?.uninterruptible) return; a.stun = Math.max(a.stun, 0.4); this.text(a, 'DISABLED', '#ffb0b0', true); return; }
    if (kind === 'stun') { if (a.boss && (a.stunImmune || 0) > this.time) return;"""),
("""        for (const b of this.foesOf(a)) if (Math.hypot(b.x - pt.x, b.y - pt.y) < r + b.r) {
          if (p.stat) this.changeStage(b, p.stat, -(p.stages || 1));""", """        for (const b of this.foesOf(a)) if (Math.hypot(b.x - pt.x, b.y - pt.y) < r + b.r) {
          if (b.team === 'player' && b.iframes > 0) continue;
          if (p.stat) this.changeStage(b, p.stat, -(p.stages || 1));"""),
# 14: fixed-level damage: player gets crits/freeze/vulnerable/slot boosts; enemy version grows gently
("""      return { dmg: Math.max(1, Math.round((src?.level || 10) * (src?.team === 'enemy' ? 0.45 * (src.dmgScale ?? 0.55) / 0.55 : 1.4) * scale * (src?.dmgMul || 1))), crit: false, eff: 1 };""",
"""      if (src?.team === 'enemy') return { dmg: Math.max(1, Math.round((src.level || 10) * 0.5 * Math.sqrt((src.dmgScale ?? 0.55) / 0.55) * scale)), crit: false, eff: 1 };
      const crit = this.rand() < (p.crit || 0.0625) + (src?.critBonus || 0) + (info.slot && src?.slotCrit?.[info.slot] || 0);
      let d = (src?.level || 10) * 1.4 * scale * (src?.dmgMul || 1) * (crit ? 2 : 1) * (src?.slotMul?.[info.slot] || 1);
      if (b.status.freeze) d *= 1.5; if (b.vulnerable > 0) d *= 1.5;
      return { dmg: Math.max(1, Math.round(d)), crit, eff: 1 };"""),
# 15: confused owners' strikes hit their own side too
("""          if (s.team === 'enemy' ? b.team === 'enemy' : b.team !== 'enemy') continue;""", """          if ((s.team === 'enemy' ? b.team === 'enemy' : b.team !== 'enemy') && !(s.owner?.confused && b !== s.owner)) continue;"""),
])

# 4: no ball throws in the lab
patch('web/src/scenes/rewards.js', [
("""  scene.doorsOpen = true; scene.cleared = true;
  scene.world.player.brain = hubBrain(scene.world.player.brain);""", """  scene.doorsOpen = true; scene.cleared = true;
  scene.world.noBalls = true;
  scene.world.player.brain = hubBrain(scene.world.player.brain);"""),
# 7: winning can't turn into a loss
("""  for (const e of scene.world.enemies()) { e.dead = true; e.deathT = 0; e.noExp = true; scene.world.vfx.push({ kind: 'sendout', x: e.x, y: e.y, t: 0, life: 0.4, recall: true }); }""",
"""  const w0 = scene.world;
  for (const e of w0.enemies()) { e.dead = true; e.deathT = 0; e.noExp = true; w0.vfx.push({ kind: 'sendout', x: e.x, y: e.y, t: 0, life: 0.4, recall: true }); }
  w0.strikes = w0.strikes.filter(s => s.team !== 'enemy'); w0.projectiles = w0.projectiles.filter(p => p.team !== 'enemy'); w0.zones = w0.zones.filter(z => z.team !== 'enemy');
  w0.player.iframes = 99; w0.player.status = {};"""),
# 9: refreshPlayer keeps more transient state
("""  const keep = ['x', 'y', 'facing', 'brain', 'pc', 'cds', 'cdMax', 'status', 'stages', 'stageTimers', 'iframes', 'id', 'action', 'seeded', 'shieldHits', 'kx', 'ky', 'dashing', 'noCollide', 'anim', 'animT', 'protect', 'deflect'];""",
"""  const keep = ['x', 'y', 'facing', 'brain', 'pc', 'cds', 'cdMax', 'status', 'stages', 'stageTimers', 'iframes', 'id', 'action', 'seeded', 'shieldHits', 'kx', 'ky', 'dashing', 'noCollide', 'anim', 'animT', 'protect', 'deflect', 'untargetable', 'burrowed', 'speedMul', 'z', 'stun', 'lockFacing', 'hidden', 'animLock'];"""),
])
patch('web/src/scenes/room.js', [
("""    if (w.player.dead && !this.dying) this.die();""", """    if (w.player.dead && !this.dying && !this.bossDone) this.die();"""),
# 5: gamepad A both dashes and interacts; don't spend a reroll on a dash frame
("""    if (this.nearDoor && Input.justPressed('interact') && !this.nearNpc && this.run.rerolls > 0""", """    if (this.nearDoor && Input.justPressed('interact') && !Input.down('dash') && !this.nearNpc && this.run.rerolls > 0"""),
])
patch('web/src/engine/input.js', [
("""  attack: [2], special: [3], dash: [0, 5], cast: [1], call: [4], ball: [7], interact: [0], pause: [9],""", """  attack: [2], special: [3], dash: [5, 6], cast: [1], call: [4], ball: [7], interact: [0], pause: [9],"""),
])

# 6: browser key-repeat never counts as a new press; keys released by a menu stay suppressed until key-up
patch('web/src/engine/core.js', [
("""  window.addEventListener('keydown', e => {
    const k = norm(e.key);
    if (!Engine.keys.has(k)) Engine.pressed.add(k);
    Engine.keys.add(k);""", """  window.addEventListener('keydown', e => {
    const k = norm(e.key);
    if (e.repeat || Engine.suppressed.has(k)) { if ([' ', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key)) e.preventDefault(); return; }
    if (!Engine.keys.has(k)) Engine.pressed.add(k);
    Engine.keys.add(k);"""),
("""  window.addEventListener('keyup', e => Engine.keys.delete(norm(e.key)));""", """  window.addEventListener('keyup', e => { Engine.keys.delete(norm(e.key)); Engine.suppressed.delete(norm(e.key)); });"""),
("""  Engine.keys.delete('Enter'); Engine.pressed.clear(); window.__input?.clear?.();""", """  for (const k of ['Enter', 'z', 'e']) if (Engine.keys.has(k)) { Engine.keys.delete(k); Engine.suppressed.add(k); }
  Engine.pressed.clear(); window.__input?.clear?.();"""),
("""  keys: new Set(), pressed: new Set(),""", """  keys: new Set(), pressed: new Set(), suppressed: new Set(),"""),
])

# 8: flyers path around walls when they can't see the player
patch('web/src/game/ai.js', [
("""    if (los || mode !== 'walk') { mx = dx / d; my = dy / d; }""", """    if (los || mode === 'ghost') { mx = dx / d; my = dy / d; }"""),
])

# 11: old saves: migrate heat and clamp research ranks
patch('web/src/game/run.js', [
("""  }, m || {});
  return G.meta;""", """  }, m || {});
  if (G.meta.wins > 0 && (G.meta.maxHeatWon ?? -1) < 0) G.meta.maxHeatWon = 0;
  for (const r of RESEARCH) if ((G.meta.research[r.key] || 0) > r.max) G.meta.research[r.key] = r.max;
  return G.meta;"""),
# 13: the mid-area center never sits right before the pre-boss center
("""  if (!run.visited.center?.[run.biome] && next >= 3) add('center', 1.0);""", """  if (!run.visited.center?.[run.biome] && next >= 3 && next <= biome.rooms - 3) add('center', 1.0);"""),
])
print('ok')
