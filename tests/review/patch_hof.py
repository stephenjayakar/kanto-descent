def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/game/coop.js', [
    # guest: record the run on its own account when the host sends it
    ("    else { Coop.ctl = e.channel; e.channel.onopen = () => e.channel.send(JSON.stringify({ type: 'hello', ...hello })); }",
     "    else {\n      Coop.ctl = e.channel; e.channel.onopen = () => e.channel.send(JSON.stringify({ type: 'hello', ...hello }));\n      e.channel.onmessage = ev => { try { const m = JSON.parse(ev.data); if (m.type === 'run' && m.entry) Coop.onRun?.(m.entry); } catch { /* bad message */ } };\n    }"),
    ("// Host overlay: the code while waiting", """// The run ended: who played player 2 (for the record and the Hall of Fame), and tell the guest so the run is
// saved on its own account too (from its point of view).
export function coopTeam() {
  if (!Coop.p2 || !Coop.guest) return null;
  const r2 = Coop.p2.run;
  return { name: Coop.guest.name, starter: r2.starter, species: r2.species, partner: r2.partner?.species || null, boons: r2.boons.map(b => b.key) };
}
export function coopSendRun(entry, hostName) {
  const t = entry.coop;
  if (!t || Coop.ctl?.readyState !== 'open') return;
  const mine = { ...entry, starter: t.starter, species: t.species, partner: t.partner, boons: t.boons, coop: { name: hostName, starter: entry.starter, species: entry.species, partner: entry.partner }, coopGuest: true };
  try { Coop.ctl.send(JSON.stringify({ type: 'run', entry: mine })); } catch { /* channel closing */ }
}

// Host overlay: the code while waiting"""),
])
rep('web/src/game/run.js', [
    ("export function recordRun(entry) {\n  entry.version = VERSION;\n  if (entry.partner === undefined) entry.partner = G.run?.partner?.species || null;\n  entry.score = scoreRun(entry);\n  Cloud.addRun(entry);\n}",
     "export function recordRun(entry) {\n  entry.version = VERSION;\n  if (entry.partner === undefined) entry.partner = G.run?.partner?.species || null;\n  entry.score = scoreRun(entry);\n  Cloud.addRun(entry);\n  recordRun.after?.(entry); // co-op: the guest gets the run too\n}"),
])
rep('web/src/scenes/rewards.js', [
    ("  const entry = { starter: run.starter, species: run.species, level: run.level, biome: run.biome, room: run.roomInBiome, time: Math.round(run.time), won: false, kills: run.kills, dust: run.stardustGained, heat: run.heat || 0, boons: run.boons.map(b => b.key), at: Date.now() };",
     "  const entry = { starter: run.starter, species: run.species, level: run.level, biome: run.biome, room: run.roomInBiome, time: Math.round(run.time), won: false, kills: run.kills, dust: run.stardustGained, heat: run.heat || 0, boons: run.boons.map(b => b.key), at: Date.now(), coop: coopTeam() };"),
    ("  const entry = { starter: run.starter, species: run.species, level: run.level, biome: run.biome, room: run.roomInBiome, time: Math.round(run.time), won: true, kills: run.kills, dust: run.stardustGained, heat: run.heat || 0, boons: run.boons.map(b => b.key), at: Date.now() };",
     "  const entry = { starter: run.starter, species: run.species, level: run.level, biome: run.biome, room: run.roomInBiome, time: Math.round(run.time), won: true, kills: run.kills, dust: run.stardustGained, heat: run.heat || 0, boons: run.boons.map(b => b.key), at: Date.now(), coop: coopTeam() };\n  run.coopTeam = entry.coop; // the Hall of Fame shows both players"),
    ("import { Coop, asP2, coopHeal, coopRefreshP2, coopWrapHooks } from '../game/coop.js';",
     "import { Coop, asP2, coopHeal, coopRefreshP2, coopWrapHooks, coopTeam, coopSendRun } from '../game/coop.js';\nrecordRun.after = entry => coopSendRun(entry, Cloud.me?.name || 'P1');"),
    # Hall of Fame with both players
    ("    ctx.save(); ctx.scale(3, 3); drawPmd(ctx, D.species[run.species].dex, W / 6, 50, { anim: 'Idle', t: this.t }); ctx.restore();\n    if (run.partner) { ctx.save(); ctx.scale(2, 2); drawPmd(ctx, D.species[run.partner.species].dex, W / 4 + 60, 85, { anim: 'Idle', t: this.t }); ctx.restore(); }",
     "    const team = run.coopTeam;\n    ctx.save(); ctx.scale(3, 3); drawPmd(ctx, D.species[run.species].dex, team ? W / 6 - 34 : W / 6, 50, { anim: 'Idle', t: this.t });\n    if (team) drawPmd(ctx, D.species[team.species].dex, W / 6 + 34, 50, { anim: 'Idle', t: this.t, dir: 0 });\n    ctx.restore();\n    if (run.partner) { ctx.save(); ctx.scale(2, 2); drawPmd(ctx, D.species[run.partner.species].dex, team ? W / 4 - 100 : W / 4 + 60, 85, { anim: 'Idle', t: this.t }); ctx.restore(); }\n    if (team?.partner) { ctx.save(); ctx.scale(2, 2); drawPmd(ctx, D.species[team.partner].dex, W / 4 + 100, 85, { anim: 'Idle', t: this.t }); ctx.restore(); }"),
    ("    text(ctx, `${D.species[run.species].name} calmed MEWTWO and escaped CERULEAN CAVE!`, W / 2, H - 110, { align: 'center', color: 'white' });",
     "    text(ctx, team ? `${D.species[run.species].name} and ${team.name}'s ${D.species[team.species].name} calmed MEWTWO and escaped!` : `${D.species[run.species].name} calmed MEWTWO and escaped CERULEAN CAVE!`, W / 2, H - 110, { align: 'center', color: 'white' });"),
])
print('ok')
