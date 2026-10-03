def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/game/coop.js', [
    ("// Heals from Nurse Joy, potions,", """// Same as asP2 for code with no menus or awaits (a catch): swap, run, swap back right away.
export function asP2Sync(scene, fn) {
  if (!Coop.p2 || G.run?.isP2) return fn();
  const host = G.run; G.run = Coop.p2.run;
  try { return fn(); } finally { G.run = host; coopRefreshP2(scene); }
}

// Heals from Nurse Joy, potions,"""),
])
rep('web/src/scenes/rewards.js', [
    ("import { say, choose, Banner, drawPortrait, ICON, drawOW, Choice } from './ui.js';",
     "import { say, choose, Banner, drawPortrait, ICON, drawOW, Choice } from './ui.js';\nimport { Coop, asP2, coopHeal, coopRefreshP2, coopWrapHooks } from '../game/coop.js';"),
    # per-player rewards
    ("    case 'boon': await offerBoons(scene, r.legend); break;", "    case 'boon': await offerBoons(scene, r.legend); await asP2(scene, () => offerBoons(scene, r.legend)); break; // co-op: each player picks their own"),
    ("    case 'hp_up': run.maxHpMul += 0.15; refreshPlayer(scene); w.heal(w.player, Math.round(w.player.maxHp * 0.25)); run.hp = w.player.hp; Sound.playSE('se_m_stat_increase'); await say(['Max HP rose by 15%!']); break;",
     "    case 'hp_up': run.maxHpMul += 0.15; refreshPlayer(scene); w.heal(w.player, Math.round(w.player.maxHp * 0.25)); run.hp = w.player.hp;\n      if (Coop.p2) { Coop.p2.run.maxHpMul += 0.15; coopRefreshP2(scene); coopHeal(scene, 0.25); }\n      Sound.playSE('se_m_stat_increase'); await say([Coop.p2 ? 'Max HP rose by 15% for both of you!' : 'Max HP rose by 15%!']); break;"),
    ("    case 'pp_up': await ppUp(scene); break;", "    case 'pp_up': await ppUp(scene); await asP2(scene, () => ppUp(scene)); break;"),
    ("    case 'tm': await offerTMs(scene); break;", "    case 'tm': await offerTMs(scene); await asP2(scene, () => offerTMs(scene)); break;"),
    ("    case 'held': await offerHeld(scene); break;", "    case 'held': await offerHeld(scene); await asP2(scene, () => offerHeld(scene)); break;"),
    # refreshPlayer: P2 context rebuilds P2; host rebuild keeps the co-op hook routing
    ("  const run = G.run, w = scene.world, old = w.player;\n  if (!old || old.dead) return;",
     "  if (G.run?.isP2) return coopRefreshP2(scene); // a P2 reward/level-up flow\n  const run = G.run, w = scene.world, old = w.player;\n  if (!old || old.dead) return;"),
    ("  w.hooks = buildHooks(run, w);\n  preloadPmd([old.dex]);", "  w.hooks = buildHooks(run, w);\n  coopWrapHooks(w);\n  preloadPmd([old.dex]);"),
    # heals reach P2
    ("function healPct(scene, f) { const p = scene.world.player; scene.world.heal(p, Math.round(p.maxHp * f)); G.run.hp = p.hp; Sound.playSE('se_use_item'); }",
     "function healPct(scene, f) { const p = scene.world.player; scene.world.heal(p, Math.round(p.maxHp * f)); G.run.hp = p.hp; coopHeal(scene, f); Sound.playSE('se_use_item'); }"),
    ("  scene.world.heal(p, amt); p.status = {}; run.hp = p.hp;", "  scene.world.heal(p, amt); p.status = {}; run.hp = p.hp;\n  coopHeal(scene, amt / p.maxHp);"),
    ("  const p = scene.world.player; scene.world.heal(p, Math.round(p.maxHp * 0.25)); run.hp = p.hp;\n  await levelPrompts(scene);",
     "  const p = scene.world.player; scene.world.heal(p, Math.round(p.maxHp * 0.25)); run.hp = p.hp; coopHeal(scene, 0.25);\n  await levelPrompts(scene);"),
])
# level-up prompts: P2's own moves/evolution right after P1's
s = open('web/src/scenes/rewards.js', encoding='utf8').read()
i = s.index('export async function levelPrompts(scene) {')
j = s.index('\n}\n', i)
body = s[i:j]
assert 'await assignMove' in body
s = s[:j] + "\n  if (!G.run.isP2) await asP2(scene, () => levelPrompts(scene)); // co-op: then player 2's own" + s[j:]
open('web/src/scenes/rewards.js', 'w', encoding='utf8').write(s)
rep('web/src/scenes/room.js', [
    ("      case 'catch': R.onCatch(this, e.actor, e.ball); break;", "      case 'catch': if (e.by?.p2) asP2Sync(this, () => R.onCatch(this, e.actor, e.ball)); else R.onCatch(this, e.actor, e.ball); break; // co-op: P2's catch is P2's partner"),
    ("import { Coop, coopFrame, coopStatusText } from '../game/coop.js';", "import { Coop, coopFrame, coopStatusText, asP2Sync } from '../game/coop.js';"),
    ("    if (Coop.p2) dexes.push(D.species[Coop.p2.species].dex);", "    if (Coop.p2) dexes.push(D.species[Coop.p2.run.species].dex);"),
])
print('ok')
