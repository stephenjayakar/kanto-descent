def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)
rep('web/src/scenes/room.js', [
    ("      const n = run.rng.int(B.perWave[0], B.perWave[1]) + Math.floor(run.roomInBiome / 3) + (run.heat >= 7 ? 1 : 0);",
     "      const n = (run.rng.int(B.perWave[0], B.perWave[1]) + Math.floor(run.roomInBiome / 3) + (run.heat >= 7 ? 1 : 0)) * (Coop.active ? 2 : 1); // co-op: twice the foes"),
    ("    for (let i = 0; i < party.length; i += 2) this.waves.push(party.slice(i, i + 2).map(e => ({ ...e, trainerMon: true, elite: this.spec.kind === 'trainer' })));",
     "    const per = Coop.active ? 4 : 2; // co-op: the party comes out twice as fast, plus a second helping of wild ones\n    for (let i = 0; i < party.length; i += per) this.waves.push(party.slice(i, i + per).map(e => ({ ...e, trainerMon: true, elite: this.spec.kind === 'trainer' })));\n    if (Coop.active) this.waves.push(rollWave(run, party.length + Math.floor(run.roomInBiome / 3)).map(e => ({ ...e, trainerMon: true })));"),
    ("    world.maxAttackers = BIOMES[run.biome]?.maxAttackers ?? 2;", "    world.maxAttackers = (BIOMES[run.biome]?.maxAttackers ?? 2) * (Coop.active ? 2 : 1); // co-op: two players to pressure"),
    ("    this.world.maxAttackers = Math.max(BIOMES[this.run.biome]?.maxAttackers ?? 2, 1);", "    this.world.maxAttackers = Math.max(BIOMES[this.run.biome]?.maxAttackers ?? 2, 1) * (Coop.active ? 2 : 1);"),
])
print('ok')
