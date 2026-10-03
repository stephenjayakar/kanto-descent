def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)
rep('web/src/game/coop.js', [("  if (!t || Coop.ctl?.readyState !== 'open') return;", "  if (!t || Coop.role !== 'host' || Coop.ctl?.readyState !== 'open') return;")])
rep('web/src/scenes/guest.js', [
    ("import { G, starterUnlocked } from '../game/run.js';", "import { G, starterUnlocked, recordRun, saveMeta } from '../game/run.js';"),
    ("  enter() {\n    Input.clear();", "  enter() {\n    Input.clear();\n    // the host's run ended: keep it in this account's records too (as player 2)\n    Coop.onRun = entry => { G.meta.history.unshift(entry); G.meta.history = G.meta.history.slice(0, 20); saveMeta(); recordRun(entry); this.lastRun = entry; };"),
])
rep('convex/game.ts', [
    ("    time: Number(e.time) || 0, kills: Number(e.kills) || 0, at: r.at,\n  };",
     "    time: Number(e.time) || 0, kills: Number(e.kills) || 0, at: r.at,\n    // co-op: the teammate (name and POKéMON only)\n    coop: e.coop && typeof e.coop === \"object\" ? { name: String(e.coop.name || \"\").slice(0, 12), species: typeof e.coop.species === \"string\" ? e.coop.species : null } : null,\n  };"),
])
rep('web/src/scenes/records.js', [
    ("      if (r.partner) drawMonIcon(ctx, r.partner, 354, y - 6);",
     "      if (r.coop?.species) drawMonIcon(ctx, r.coop.species, 354, y - 6); // co-op teammate\n      else if (r.partner) drawMonIcon(ctx, r.partner, 354, y - 6);"),
    ("${r.partner ? `Partner: ${speciesName(r.partner)}.` : 'No partner caught.'}",
     "${r.coop ? `Co-op with ${r.coop.name} (${speciesName(r.coop.species)}). ` : ''}${r.partner ? `Partner: ${speciesName(r.partner)}.` : 'No partner caught.'}"),
])
print('ok')
