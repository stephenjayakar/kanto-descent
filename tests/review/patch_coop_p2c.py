def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/game/player.js', [
    ("export function playerBrain(world, a, dt) {\n  const run = world.run;", "export function playerBrain(world, a, dt) {\n  const run = a.run || world.run; // co-op: P2 has its own run (moves, blessings, partner)"),
    ("if (I.pressed('ball') && !world.noBalls && !a.p2)", "if (I.pressed('ball') && !world.noBalls)"),
    ("if (I.pressed('call') && !a.p2) {", "if (I.pressed('call')) {"),
    ("function throwBall(world, a, aim) {\n  const run = world.run;", "function throwBall(world, a, aim) {\n  const run = world.run; // POKé BALLS are shared in co-op"),
    ("ball: run.ballType || 'poke_ball', state: 'fly' });", "ball: run.ballType || 'poke_ball', state: 'fly', by: a });"),
    ("world.emit({ type: 'catch', actor: e, ball: b.ball });", "world.emit({ type: 'catch', actor: e, ball: b.ball, by: b.by });"),
    ("function callPartner(world, a) {\n  const run = world.run;", "function callPartner(world, a) {\n  const run = a.run || world.run;"),
    ("ally.brain = allyBrain; ally.lifeT", "ally.owner = a; ally.brain = allyBrain; ally.lifeT"),
])
rep('web/src/game/combat.js', [
    ("if (act.slot === 'cast' && a === this.player) this.hooks.onCastHit?.(this, b);", "if (act.slot === 'cast' && (a === this.player || a.p2)) this.hooks.onCastHit?.(this, b, a);"),
])
print('ok')
