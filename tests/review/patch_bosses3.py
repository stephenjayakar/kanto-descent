def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/game/bosses.js', [
    ("""  MEWTWO: {
    sprite: null, title: 'THE GENETIC POKéMON',""", """  LT_SURGE: {
    trainer: 'LEADER_LT_SURGE', sprite: 'lt_surge', title: 'VERMILION GYM LEADER', music: 'mus_vs_gym_leader', badge: 'THUNDER BADGE', badgeKey: 'THUNDER',
    intro: ["Hey, kid! What do you think you're doing here?", "You won't live long in combat! That's for sure!"],
    outro: ["Whoa! You're the real deal, kid!", "Fine, then, take the THUNDERBADGE!"],
    refLevel: 24, mons: [{ species: 'RAICHU', level: 24, secs: 22, dmg: 0.8, tempo: 0.85 }],
    adds: { at: [0.5], species: 'VOLTORB', level: 20, n: 2, text: 'LT. SURGE sent out VOLTORB!' },
  },
  LORELEI: {
    trainer: 'ELITE_FOUR_LORELEI', sprite: 'lorelei', title: 'ELITE FOUR', music: 'mus_vs_gym_leader', badge: "LORELEI'S SEAL", badgeKey: 'ICE',
    intro: ['Welcome to the POKéMON LEAGUE. I am LORELEI of the ELITE FOUR.', 'No one can best me when it comes to icy POKéMON. Freezing moves are powerful!'],
    outro: ["...Things shouldn't be this way!", "You're better than I thought. Go on ahead."],
    refLevel: 41, mons: [{ species: 'LAPRAS', level: 38, secs: 24, dmg: 0.85, tempo: 0.85 }],
    adds: { at: [0.6, 0.3], species: 'DEWGONG', level: 34, n: 1, text: 'LORELEI sent out DEWGONG!' },
  },
  MEWTWO: {
    sprite: null, title: 'THE GENETIC POKéMON',"""),
    ("""  MEWTWO: [
    { w: 3, cd: 0.9, run: (w, a, t) => psychicTriple(w, a, t) },""", """  RAICHU: [
    { w: 2.5, cd: 1.1, run: (w, a, t) => storm(w, a, t, 'THUNDER', { n: 9, r: 20, every: 0.13, text: 'THUNDER', color: '#f8d030', fx: 'lightning' }) },
    { w: 2.5, cd: 0.9, run: (w, a, t) => w.useMove(a, P('THUNDERBOLT', { kind: 'chain', jumps: 3, range: 220, windup: 0.55 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 0.8, run: (w, a, t) => w.useMove(a, P('QUICK_ATTACK', { kind: 'charge', dist: 160, dur: 0.32, range: 20, windup: 0.5 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.1, run: (w, a, t) => w.useMove(a, P('DISCHARGE', { kind: 'nova', radius: 72, windup: 0.7, fx: 'spark', type: 'ELECTRIC', power: 60, status: { kind: 'para', chance: 0.3 } }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.5, phase: 1, cd: 0.9, run: (w, a, t) => w.useMove(a, P('SHOCK_WAVE', { kind: 'radial', count: 12, speed: 130, size: 6, life: 2.4, windup: 0.6, sprite: 'spark' }), { target: t, aim: aimAt(a, t) }) },
  ],
  VOLTORB: null,
  LAPRAS: [
    { w: 2.5, cd: 1.2, run: (w, a, t) => w.useMove(a, P('ICE_BEAM', { kind: 'sweep', sweep: 1.1, len: 320, width: 12, dur: 1.1, windup: 0.75, dir: w.rand() < 0.5 ? 1 : -1, status: { kind: 'chill', chance: 0.5 } }), { target: t, aim: aimAt(a, t) }) },
    { w: 2.5, cd: 1.1, run: (w, a, t) => w.useMove(a, P('BLIZZARD', { count: 7, scatter: 70, delay: 0.9, radius: 24 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.0, run: (w, a, t) => w.useMove(a, P('SURF', { kind: 'radial', count: a.phase >= 1 ? 18 : 14, speed: 110, size: 7, life: 2.8, windup: 0.6, sprite: 'water', knock: 120 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.5, cd: 1.0, run: (w, a, t) => w.useMove(a, P('BODY_SLAM', { kind: 'charge', dist: 170, dur: 0.6, range: 24, windup: 0.65, status: { kind: 'para', chance: 0.3 } }), { target: t, aim: aimAt(a, t) }) },
    { w: 1, phase: 1, cd: 1.2, once: 0.4, run: (w, a) => w.useMove(a, { ...P('REST'), kind: 'channel', dur: 1.8, heal: 0.1, breakFrac: 0.05, windup: 0.2, breakText: 'LAPRAS woke up!' }, { aim: a.facing }) },
  ],
  DEWGONG: null,
  MEWTWO: [
    { w: 3, cd: 0.9, run: (w, a, t) => psychicTriple(w, a, t) },"""),
    # stage scaling
    ("""export function spawnBoss(world, key, at) {
  const def = BOSSES[key];""", """// v0.0.3: areas come in any order within an act, so a boss scales to the stage it appears at.
const BOSS_REF = [15, 24, 34, 41, 45]; // the original refLevel of the boss at each stage
export function scaledBoss(key, stage) {
  const def = BOSSES[key], shift = BOSS_REF[Math.min(stage, BOSS_REF.length - 1)] - def.refLevel;
  if (!shift) return def;
  const lv = m => ({ ...m, level: Math.max(5, m.level + shift) });
  return { ...def, refLevel: def.refLevel + shift, mons: def.mons.map(lv), adds: def.adds && lv(def.adds), finale: def.finale && lv(def.finale) };
}

export function spawnBoss(world, key, at) {
  const def = scaledBoss(key, world.run?.biome ?? 0);"""),
])
rep('web/src/game/content.js', [
    ("  { species: 'PIKACHU', slots: { attack: 'QUICK_ATTACK', special: 'THUNDER_SHOCK', cast: 'THUNDER_WAVE' }, blurb: 'Fast. Dashing strikes and chain lightning.', unlock: 'BROCK' },",
     "  { species: 'PIKACHU', slots: { attack: 'QUICK_ATTACK', special: 'THUNDER_SHOCK', cast: 'THUNDER_WAVE' }, blurb: 'Fast. Dashing strikes and chain lightning.', unlock: ['BROCK', 'LT_SURGE'] },"),
    ("blurb: 'Slow to start, a dragon by the end.', unlock: 'GIOVANNI' },", "blurb: 'Slow to start, a dragon by the end.', unlock: ['GIOVANNI', 'LORELEI'] },"),
    ("  GIOVANNI: 'DRATINI can now be chosen at the lab!',\n};", "  GIOVANNI: 'DRATINI can now be chosen at the lab!',\n  LT_SURGE: 'PIKACHU can now be chosen at the lab!',\n  LORELEI: 'DRATINI can now be chosen at the lab!',\n};"),
])
rep('web/src/game/run.js', [("export function starterUnlocked(s) { return !s.unlock || G.meta.badges.includes(s.unlock); }",
                             "export function starterUnlocked(s) { return !s.unlock || [].concat(s.unlock).some(k => G.meta.badges.includes(k)); }")])
rep('web/src/scenes/rewards.js', [("`Defeat ${s.unlock} to unlock.`", "`Defeat ${[].concat(s.unlock).map(k => D.trainers[BOSSES[k]?.trainer]?.name || k).join(' or ')} to unlock.`")])
rep('tools/asset_list.mjs', [("const keys = new Set(['ONIX', 'GEODUDE', 'STARMIE', 'STARYU', 'MAROWAK', 'GASTLY', 'RHYHORN', 'KANGASKHAN', 'NIDOQUEEN', 'MEWTWO']);",
                              "const keys = new Set(['ONIX', 'GEODUDE', 'STARMIE', 'STARYU', 'MAROWAK', 'GASTLY', 'RHYHORN', 'KANGASKHAN', 'NIDOQUEEN', 'MEWTWO', 'RAICHU', 'VOLTORB', 'LAPRAS', 'DEWGONG']);")])
print('ok')
