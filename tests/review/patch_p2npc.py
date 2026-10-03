def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/game/combat.js', [
    ("""  updatePickups(dt) {
    const p = this.player; if (!p) return;
    for (const k of this.pickups) {
      k.t += dt;""", """  updatePickups(dt) {
    if (!this.player) return;
    const players = [this.player, this.p2].filter(a => a && !a.dead); // co-op: either player collects
    for (const k of this.pickups) {
      k.t += dt;
      const p = players.reduce((b, a) => (Math.hypot(a.x - k.x, a.y - k.y) < Math.hypot(b.x - k.x, b.y - k.y) ? a : b), players[0] || this.player);"""),
    ("      if (k.t > 0.4 && d < 10) { k.dead = true; this.emit({ type: 'pickup', pickup: k }); }", "      if (k.t > 0.4 && d < 10) { k.dead = true; this.emit({ type: 'pickup', pickup: k, by: p }); }"),
])
rep('web/src/game/coop.js', [
    ("function removeP2(w) {", """// P2 picked another starter (Oak's lab): start its run state over and swap the actor.
export function coopResetP2(scene, starter) {
  if (!Coop.guest) return;
  Coop.guest.starter = starter; Coop.p2 = null;
  removeP2(scene.world);
  coopSpawnP2(scene);
}

function removeP2(w) {"""),
])
rep('web/src/scenes/room.js', [
    ("""    if (near && Input.justPressed('interact') && !topOverlay()) { Input.consume('interact'); Sound.playSE('se_select'); near.onTalk(near); }
  }""", """    if (near && Input.justPressed('interact') && !topOverlay()) { Input.consume('interact'); Sound.playSE('se_select'); near.onTalk(near); }
    // co-op: player 2 talks to NPCs with its own interact button
    const a = this.world.p2;
    this.nearNpc2 = null;
    if (!a || a.dead || !Coop.active || topOverlay()) return;
    let nd2 = 1e9;
    for (const n of this.npcs) { if (!n.onTalk) continue; const d = Math.hypot(n.x - a.x, n.y - 8 - a.y); if (d < (n.range || 30) && d < nd2) { nd2 = d; this.nearNpc2 = n; } }
    if (this.nearNpc2 && Coop.remote.pressed('interact')) { Coop.remote.consume('interact'); Sound.playSE('se_select'); R.coopTalk(this, this.nearNpc2); }
  }"""),
    ("    const s = coopStatusText();", "    if (this.nearNpc2 && !topOverlay()) this.prompt(ctx, `${this.world.p2?.label || 'P2'}: E to ${this.nearNpc2.verb || 'talk'}`, this.nearNpc2.x, this.nearNpc2.y - 54);\n    const s = coopStatusText();"),
])
rep('web/src/scenes/rewards.js', [
    ("import { Coop, asP2, coopHeal, coopRefreshP2, coopWrapHooks, coopTeam, coopSendRun } from '../game/coop.js';",
     "import { Coop, asP2, coopHeal, coopRefreshP2, coopWrapHooks, coopTeam, coopSendRun, coopResetP2 } from '../game/coop.js';"),
    # potions bought by P2 heal P2
    ("function healPct(scene, f) { const p = scene.world.player; scene.world.heal(p, Math.round(p.maxHp * f)); G.run.hp = p.hp; coopHeal(scene, f); Sound.playSE('se_use_item'); }",
     "function healPct(scene, f) {\n  if (G.run.isP2) { coopHeal(scene, f); Sound.playSE('se_use_item'); return; } // P2 bought it\n  const p = scene.world.player; scene.world.heal(p, Math.round(p.maxHp * f)); G.run.hp = p.hp; Sound.playSE('se_use_item');\n}"),
    # HP UP: for whoever got it (from a door it's both; P2's shop purchase is P2's)
    ("    case 'hp_up': run.maxHpMul += 0.15; refreshPlayer(scene); w.heal(w.player, Math.round(w.player.maxHp * 0.25)); run.hp = w.player.hp;\n      if (Coop.p2) { Coop.p2.run.maxHpMul += 0.15; coopRefreshP2(scene); coopHeal(scene, 0.25); }",
     "    case 'hp_up': run.maxHpMul += 0.15; refreshPlayer(scene);\n      if (run.isP2) coopHeal(scene, 0.25); else { w.heal(w.player, Math.round(w.player.maxHp * 0.25)); run.hp = w.player.hp; }\n      if (Coop.p2 && !run.isP2 && !r.mine) { Coop.p2.run.maxHpMul += 0.15; coopRefreshP2(scene); coopHeal(scene, 0.25); }"),
    ("    { key: 'HP_UP', name: 'HP UP', price: 80 + b * 25, desc: '+15% max HP, heal 25%.', buy: (s) => applyReward(s, { kind: 'hp_up' }) },",
     "    { key: 'HP_UP', name: 'HP UP', price: 80 + b * 25, desc: '+15% max HP, heal 25%.', buy: (s) => applyReward(s, { kind: 'hp_up', mine: true }) },"),
    ("export async function nurse(scene) {", """// Co-op: player 2 talks to an NPC. The shop and Nurse Joy work for P2 (shared money; purchases are P2's),
// the starter POKé BALLs in OAK's lab change P2's starter, and the rest belongs to player 1.
export async function coopTalk(scene, n) {
  const a = scene.world.p2;
  if (n.name === 'CLERK' || n.name === 'NURSE JOY') return asP2(scene, () => n.onTalk(n));
  if (/BALL$/.test(n.name)) {
    const list = STARTERS.filter(starterUnlocked);
    Coop.menuP2 = true;
    let i = -1;
    try {
      i = await choose('PLAYER 2: choose your partner POKéMON', list.map(s => { const sp = D.species[s.species]; return { title: sp.name, sub: sp.types.join('/'), portrait: sp.dex, accent: TYPE_COLORS[sp.types[0]], desc: `${s.blurb}  ${D.moves[s.slots.attack].name} / ${D.moves[s.slots.special].name} / ${D.moves[s.slots.cast].name}` }; }), { cardH: 46, canSkip: true, skipLabel: 'CANCEL (X)' });
    } finally { Coop.menuP2 = false; }
    if (i >= 0) { coopResetP2(scene, list[i].species); Sound.playCry(list[i].species); }
    return;
  }
  scene.world.text(a, `${n.name}: player 1 handles that.`, '#ffffff', true, 1.6);
}

export async function nurse(scene) {"""),
])
print('ok')
