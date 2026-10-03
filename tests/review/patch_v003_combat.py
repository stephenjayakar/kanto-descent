def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/game/combat.js', [
    # abilities on every actor (first listed ability)
    ("    id: nextId++, team, species: speciesKey, dex: sp.dex, level, stats: st, types: sp.types.slice(),",
     "    id: nextId++, team, species: speciesKey, dex: sp.dex, level, stats: st, types: sp.types.slice(), ability: sp.abilities?.[0] || null,"),
    # contact abilities (Gen 3 rules, tuned for realtime: 12% per contact hit, at most once per 0.6s per pair)
    ("""    if (p.status && !b.dead && this.rand() < (p.status.chance ?? 1) * (src?.team === 'player' && p.status.kind !== 'trap' ? 0.8 : 1)) this.addStatus(b, p.status.kind, src);
    this.hooks.onHit?.(this, info);
  }""", """    if (p.status && !b.dead && this.rand() < (p.status.chance ?? 1) * (src?.team === 'player' && p.status.kind !== 'trap' ? 0.8 : 1)) this.addStatus(b, p.status.kind, src);
    // contact abilities: touching a STATIC / POISON POINT / FLAME BODY / EFFECT SPORE POKéMON can backfire
    const ca = CONTACT_ABILITY[b.ability];
    if (ca && p.melee && src && !src.dead && src.team !== b.team && !(src.iframes > 0 && src.team === 'player') && this.rand() < 0.12) {
      const key = b.id + ':' + src.id; this._contactT ??= new Map();
      if ((this._contactT.get(key) || -9) < this.time - 0.6) {
        this._contactT.set(key, this.time);
        const kind = Array.isArray(ca.kind) ? ca.kind[Math.floor(this.rand() * ca.kind.length)] : ca.kind;
        this.addStatus(src, kind, b); this.text(src, ca.name, ca.color, true);
      }
    }
    this.hooks.onHit?.(this, info);
  }"""),
    # Fire Blast: a real explosion (big blast + burning ground)
    ("""  explodeProjectile(pr) {
    const r = pr.explode || 16;
    this.vfx.push({ kind: 'explode', x: pr.x, y: pr.y, r, t: 0, life: 0.3, type: pr.type, sprite: pr.sprite });""",
     """  explodeProjectile(pr) {
    const r = pr.explode || 16;
    this.vfx.push({ kind: 'explode', x: pr.x, y: pr.y, r, t: 0, life: 0.3, type: pr.type, sprite: pr.sprite });
    if (pr.p.blast) { // FIRE BLAST: the 大-shaped fire burst, a shockwave and burning ground
      this.vfx.push({ kind: 'fireblast', x: pr.x, y: pr.y, r, t: 0, life: 0.7 });
      this.vfx.push({ kind: 'ring', x: pr.x, y: pr.y, r0: 6, r1: r * 1.5, t: 0, life: 0.4, fx: 'fire' });
      this.shake = Math.max(this.shake, 6); this.hitstop = Math.max(this.hitstop, 0.05);
      this.addZone({ owner: pr.owner, x: pr.x, y: pr.y + 6, r: r * 0.8, dur: 2.2, p: pr.p, slot: pr.slot, team: pr.team, tick: 0.5, fire: true, sprite: 'ember', dmgFrac: 0.12, status: { kind: 'burn', chance: 0.3 } });
    }"""),
    # lunges/charges: a quick run with afterimages instead of the in-place Attack animation (which double-moved)
    ("  if (p.kind === 'lunge' || p.kind === 'charge') return p.roll ? 'Rotate' : 'Attack';", "  if (p.kind === 'lunge' || p.kind === 'charge') return p.roll ? 'Rotate' : 'Walk';"),
    ("""      case 'lunge': case 'charge': {
        let r;""", """      case 'lunge': case 'charge': {
        act.ghostT = (act.ghostT || 0) - dt;
        if (act.ghostT <= 0 && !p.roll) { act.ghostT = 0.035; this.vfx.push({ kind: 'afterimage', dex: a.dex, x: a.x, y: a.y, dir: a.dir, anim: 'Walk', animT: a.animT, t: 0, life: 0.18 }); }
        let r;"""),
])
rep('web/src/game/combat.js', [
    ("export function makeActor(speciesKey, level, team, opts = {}) {", """// Gen 3 contact abilities (the defender's)
const CONTACT_ABILITY = {
  STATIC: { kind: 'para', name: 'STATIC', color: '#f8d030' },
  POISON_POINT: { kind: 'poison', name: 'POISON POINT', color: '#c060c0' },
  FLAME_BODY: { kind: 'burn', name: 'FLAME BODY', color: '#f08030' },
  EFFECT_SPORE: { kind: ['poison', 'para', 'sleep'], name: 'EFFECT SPORE', color: '#78c850' },
};

export function makeActor(speciesKey, level, team, opts = {}) {"""),
])
rep('web/src/game/moves_rt.js', [
    ("  FIRE_BLAST: { kind: 'proj', speed: 160, size: 11, count: 1, life: 1.2, cd: 1.6, sprite: 'fireblast', explode: 34, sfx: 'se_m_flame_wheel' },",
     "  FIRE_BLAST: { kind: 'proj', speed: 160, size: 11, count: 1, life: 1.2, cd: 1.6, sprite: 'fireblast', explode: 40, blast: true, sfx: 'se_m_flame_wheel' },"),
])
rep('web/src/game/render.js', [
    ("    // Blizzard: a frosty haze with wind-driven snow over the target area", r"""    // Fire Blast: flames shoot out in the 大 shape, then a fireball core lingers
    case 'fireblast': {
      const arms = [-Math.PI / 2, Math.PI, 0, Math.PI * 0.75, Math.PI * 0.25];
      const reach = v.r * 1.3 * Math.min(1, k * 2.5), fade = k > 0.6 ? (1 - k) / 0.4 : 1;
      ctx.fillStyle = `rgba(255,190,80,${0.45 * fade})`; ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r * (0.5 + 0.5 * k), v.r * 0.75 * (0.5 + 0.5 * k), 0, 0, Math.PI * 2); ctx.fill();
      for (const ang of arms) for (let i = 1; i <= 3; i++) {
        const d = reach * i / 3;
        drawBA(ctx, 'fire_plume', v.x + Math.cos(ang) * d, v.y + Math.sin(ang) * d * 0.75 - 6, v.t + i * 0.05, { anim: true, scale: 0.9 - i * 0.12, alpha: fade });
      }
      drawBA(ctx, 'explosion', v.x, v.y - 6, v.t, { anim: true, scale: 1.4, alpha: fade });
      break;
    }
    // Blizzard: a frosty haze with wind-driven snow over the target area"""),
])
# enemy AI unstick (from upstream pokemon-emerald-arena 0.12): trying to move but not getting anywhere -> new route
rep('web/src/game/ai.js', [
    ("""  const l = Math.hypot(mx, my);
  if (l > 0.01) { a.vx = (mx / l) * sp; a.vy = (my / l) * sp; } else { a.vx = a.vy = 0; }
  // face the target while strafing""", """  // unstick: wanting to move but barely moving for 0.4s -> flip the strafe and follow the path field for a moment
  ai.stuckT = (ai.stuckT || 0) + dt; ai.lx ??= a.x; ai.ly ??= a.y;
  if (ai.stuckT >= 0.4) {
    if (Math.hypot(mx, my) > 0.1 && Math.hypot(a.x - ai.lx, a.y - ai.ly) < 1.5 && !a.flying && mode !== 'ghost') { ai.strafe *= -1; ai.think = 0; ai.flowT = 0.6; }
    ai.stuckT = 0; ai.lx = a.x; ai.ly = a.y;
  }
  if (ai.flowT > 0) { ai.flowT -= dt; const f = world.flowDir(a.x, a.y); if (f) { mx = f.x; my = f.y; } }
  const l = Math.hypot(mx, my);
  if (l > 0.01) { a.vx = (mx / l) * sp; a.vy = (my / l) * sp; } else { a.vx = a.vy = 0; }
  // face the target while strafing"""),
])
# co-op is harder: enemies hit 25% harder, bosses 20% harder with 1.8x HP; P2 revives after 15s
rep('web/src/game/coop.js', [
    ("    onSpawn: (W, e) => host.onSpawn?.(W, e),", """    onSpawn: (W, e) => {
      host.onSpawn?.(W, e);
      if (e.team === 'enemy' && !e.coopScaled) { // co-op: two players' worth of pressure
        e.coopScaled = true;
        e.dmgScale = (e.dmgScale || 1) * (e.boss ? 1.2 : 1.25);
        if (e.boss) e.maxHp = e.hp = Math.round(e.maxHp * 1.8);
      }
    },"""),
    ("    if (st.downT > 8 || scene.cleared) reviveP2(w, a, 0.5); // back up next to P1 with half HP", "    if (st.downT > 15 || scene.cleared) reviveP2(w, a, 0.5); // back up next to P1 with half HP"),
])
rep('web/src/scenes/room.js', [
    ("      if (a.dead) text(ctx, `${a.label || 'P2'} fainted · back in ${Math.max(0, Math.ceil(8 - (Coop.p2?.downT || 0)))}s`", "      if (a.dead) text(ctx, `${a.label || 'P2'} fainted · back in ${Math.max(0, Math.ceil(15 - (Coop.p2?.downT || 0)))}s`"),
    # music: the trainer victory theme gives way to the area music again
    ("      if (this.trainer) { Sound.playBGM('mus_victory_trainer');", "      if (this.trainer) { Sound.playBGM('mus_victory_trainer'); this.musicBackAt = this.t + 6;"),
    ("    if (Coop.role === 'host') coopFrame(this, dt); // co-op: the guest's input drives player 2",
     "    if (Coop.role === 'host') coopFrame(this, dt); // co-op: the guest's input drives player 2\n    if (this.musicBackAt && this.t > this.musicBackAt) { this.musicBackAt = 0; Sound.playBGM(areaOf(this.run)?.music || 'mus_pallet'); } // back to the area's music after a win"),
    # act shown on the first room banner
    ("      if (spec.first) this.banners.push(new Banner(B.name, B.intro, { life: 3.2 }));", "      if (spec.first) this.banners.push(new Banner(`${ACTS[actOf(run.biome)].name}: ${B.name}`, B.intro, { life: 3.4 }));"),
    ("import { BIOMES, STAGES, areaOf } from '../game/content.js';", "import { BIOMES, STAGES, ACTS, areaOf, actOf } from '../game/content.js';"),
])
# records: area key + co-op tag
rep('web/src/scenes/rewards.js', [
    ("time: Math.round(run.time), won: false, kills: run.kills,", "time: Math.round(run.time), won: false, area: areaOf(run).key, kills: run.kills,"),
    ("time: Math.round(run.time), won: true, kills: run.kills,", "time: Math.round(run.time), won: true, area: areaOf(run).key, kills: run.kills,"),
])
rep('convex/game.ts', [
    ("    level: Number(e.level) || 0, biome: Number(e.biome) || 0, room: Number(e.room) || 0,",
     "    level: Number(e.level) || 0, biome: Number(e.biome) || 0, room: Number(e.room) || 0, area: typeof e.area === \"string\" ? e.area : null,"),
])
s = open('web/src/scenes/records.js', encoding='utf8').read()
s = s.replace("import { BIOMES, STARTERS } from '../game/content.js';", "import { BIOMES, STARTERS, areaByKey } from '../game/content.js';", 1)
s = s.replace("      const B = BIOMES[r.biome];", "      const B = (r.area && areaByKey(r.area)) || BIOMES[r.biome];", 1)
s = s.replace("const B = BIOMES[r.biome]; return B ?", "const B = (r.area && areaByKey(r.area)) || BIOMES[r.biome]; return B ?", 1)
s = s.replace("biome: e.biome || 0, room: e.room || 0, time: e.time || 0,", "biome: e.biome || 0, room: e.room || 0, area: e.area || null, time: e.time || 0,", 1)
a = "      text(ctx, label, 214, ty, { color, font: 'small' });"
assert a in s
s = s.replace(a, "      text(ctx, label, 214, r.coop ? y + 1 : ty, { color, font: 'small' });\n      if (r.coop) text(ctx, 'CO-OP', 214, y + 13, { color: 'cyan', font: 'small' }); // co-op runs are marked", 1)
open('web/src/scenes/records.js', 'w', encoding='utf8').write(s)
print('ok')
