def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:80]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/scenes/room.js', [
    ("import { drawWorld, drawVignette, drawBA } from '../game/render.js';", "import { drawWorld, drawWorldTexts, drawVignette, drawBA } from '../game/render.js';"),
    ("      extraSprites: items => { for (const n of this.npcs) items.push({ y: n.y - 2, draw: c => this.drawNpc(c, n) }); },\n    });\n    ctx.restore();",
     "      extraSprites: items => { for (const n of this.npcs) items.push({ y: n.y - 2, draw: c => this.drawNpc(c, n) }); },\n      screenTexts: true,\n    });\n    ctx.restore();\n    // a move's battle background flashes over the screen (FireRed's Psychic etc.)\n    if (w.bgFlash) { const f = w.bgFlash, k = f.t / f.life; if (k >= 1) w.bgFlash = null; else { const im = img(`gfx/battle_anims/backgrounds/${f.bg}.png`); if (ready(im)) { ctx.save(); ctx.globalAlpha = 0.22 * Math.sin(k * Math.PI); const ox = (this.t * 40) % im.naturalWidth; for (let x = -ox; x < W; x += im.naturalWidth * 2) for (let y = 0; y < H; y += im.naturalHeight * 2) ctx.drawImage(im, x, y, im.naturalWidth * 2, im.naturalHeight * 2); ctx.restore(); } } }\n    drawWorldTexts(ctx, w, { x: cx, y: cy });"),
])
# world-side: bgFlash timer
rep('web/src/game/combat.js', [
    ("    this.updateStrikes(dt);\n", "    this.updateStrikes(dt);\n    if (this.bgFlash) this.bgFlash.t += dt;\n"),
    # floating numbers: fan out when several land on one target, merge damage-over-time ticks, no label echo of the status icon
    ("    this.texts.push({ str: String(dmg) + (o.crit ? '!' : ''), x: b.x + (this.rand() - 0.5) * 8, y: b.y - 18 - b.r, t: 0, life: 0.7, color: col, big: o.crit || o.eff > 1 });",
     """    if (o.slot === 'dot') { // damage-over-time ticks add up in one number per target
      const prev = this.texts.find(t => t.tid === b.id && t.dot && t.t < 0.5);
      if (prev) { prev.n += dmg; prev.str = String(prev.n); prev.t = Math.min(prev.t, 0.15); }
      else this.texts.push({ str: String(dmg), n: dmg, dot: true, tid: b.id, x: b.x, y: b.y - 16 - b.r, t: 0, life: 0.7, color: col });
    } else {
      const near = this.texts.filter(t => t.tid === b.id && !t.dot && t.t < 0.25).length; // fan out stacked hits
      this.texts.push({ str: String(dmg) + (o.crit ? '!' : ''), tid: b.id, x: b.x, dx: near ? (near % 2 ? 1 : -1) * (4 + 3 * Math.floor((near - 1) / 2)) : 0, y: b.y - 18 - b.r - near * 3, t: 0, life: 0.7, color: col, big: o.crit || o.eff > 1 });
    }"""),
    ("    this.text(a, { burn: 'BRN', poison: 'PSN', toxic: 'PSN', para: 'PAR', sleep: 'SLP', confuse: '???', freeze: 'FRZ', trap: 'TRAPPED', slow: 'SLOW' }[kind] || '', '#ffd0a0', true);",
     "    if (a.team === 'player' || !['burn', 'poison', 'toxic', 'para', 'sleep', 'freeze'].includes(kind)) this.text(a, { burn: 'BRN', poison: 'PSN', toxic: 'PSN', para: 'PAR', sleep: 'SLP', confuse: '???', freeze: 'FRZ', trap: 'TRAPPED', slow: 'SLOW' }[kind] || '', '#ffd0a0', true); // foes show the status icon instead"),
])
# Mewtwo's psychic attacks flash FireRed's Psychic background
rep('web/src/game/bosses.js', [
    ("function psychicTriple(w, a, t) {", "function psychicTriple(w, a, t) {\n  w.bgFlash = { bg: 'psychic', t: 0, life: 1.1 };"),
    ("function psystrikeStorm(w, a, t) {", "function psystrikeStorm(w, a, t) {\n  w.bgFlash = { bg: 'psychic', t: 0, life: 1.6 };"),
])
# wild spawns pop out of tall grass / kick up dust (FireRed field effects) instead of a leaf puff
s = open('web/src/scenes/room.js', encoding='utf8').read()
a = "      else w.vfx.push({ kind: 'custom', t: 0, life: 0.5, draw: (ctx, v, k) => { drawBA(ctx, 'leaf',"
if a in s:
    i = s.index(a); j = s.index('\n', i)
    s = s[:i] + "      else w.vfx.push({ kind: 'custom', t: 0, life: 0.45, draw: (ctx, v, k) => { const grass = w.room.grass?.[Math.floor(a.y / TILE) * w.room.w + Math.floor(a.x / TILE)]; const im = img(`gfx/misc/field_effects/${grass ? 'jump_tall_grass' : 'ground_impact_dust'}.png`); if (!ready(im)) return; if (grass) { const f = Math.min(3, Math.floor(k * 4)); ctx.drawImage(im, 0, f * 16, 16, 16, Math.round(a.x - 8), Math.round(a.y - 12), 16, 16); } else { const f = Math.min(2, Math.floor(k * 3)); ctx.drawImage(im, 0, f * 8, 16, 8, Math.round(a.x - 8), Math.round(a.y - 6), 16, 8); } } }); // FireRed field effects: grass rustle / ground dust" + s[j:]
    open('web/src/scenes/room.js', 'w', encoding='utf8').write(s)
    print('spawn fx replaced')
else:
    print('spawn fx line not found')
print('ok')
