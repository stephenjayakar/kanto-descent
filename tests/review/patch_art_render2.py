def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:80]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

R = 'web/src/game/render.js'
s = open(R, encoding='utf8').read()
i = s.index('function drawWhirlpool(ctx, z, w) {'); j = s.index('function drawZone(ctx, z, w) {')
s = s[:i] + r"""function drawWhirlpool(ctx, z, w) {
  const fire = z.p?.type === 'FIRE' || z.fire;
  const rx = z.r, ry = z.r * 0.62, spin = w.time * 4.2;
  // a soft basin, darkest in the middle
  ctx.save(); ctx.translate(z.x, z.y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, rx);
  if (fire) { g.addColorStop(0, 'rgba(90,10,0,0.55)'); g.addColorStop(0.6, 'rgba(220,70,10,0.3)'); g.addColorStop(1, 'rgba(255,150,40,0)'); }
  else { g.addColorStop(0, 'rgba(10,30,90,0.6)'); g.addColorStop(0.6, 'rgba(40,110,210,0.35)'); g.addColorStop(1, 'rgba(120,190,255,0)'); }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Status_Whirlpool / Fire Spin: the move's own particles spiralling inward (water orbs blended, embers)
  for (let i = 0; i < 18; i++) {
    const life = (w.time * 0.55 + i / 18) % 1, r = rx * (1 - life * 0.85), a2 = i * 2.4 + spin + life * 5;
    drawBA(ctx, fire ? 'small_ember' : 'water_orb', z.x + Math.cos(a2) * r, z.y + Math.sin(a2) * r * (ry / rx) - 2, w.time + i * 0.1, { anim: true, scale: 0.5, alpha: (fire ? 0.9 : 0.6) * Math.min(1, (1 - life) * 3) });
  }
}

""" + s[j:]
open(R, 'w', encoding='utf8').write(s)
rep(R, [
    ("""  else if (z.sprite === 'smoke' || z.blind) {
    ctx.fillStyle = 'rgba(40,40,48,0.55)';
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + w.time * 0.4; ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * z.r * 0.5, z.y + Math.sin(a) * z.r * 0.35, z.r * 0.55, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();""", """  else if (z.sprite === 'smoke' || z.blind) { // Smokescreen: FireRed's black smoke puffs (this used to skip the sprite)
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + w.time * 0.4; drawBA(ctx, 'black_smoke', z.x + Math.cos(a) * z.r * 0.5, z.y + Math.sin(a) * z.r * 0.35 - 4, 0, { scale: 1, alpha: 0.85 }); }
  } else {
    if (!tag) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); } // sprite clouds need no disc under them"""),
    ("        drawBA(ctx, tag, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.6 - 4, z.t + i * 0.13, { anim: true, scale: z.fire ? 0.5 : 0.8, alpha: 0.9 });",
     "        drawBA(ctx, tag, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.6 - 4, z.t + i * 0.13, { anim: true, scale: z.fire ? 0.5 : 1, alpha: 0.9 });"),
    ("const CLOUD = {", """// beam moves as particle streams (from FireRed's move animations)
function beamStyle(v) {
  const fx = v.fx, ty = v.type;
  if (fx === 'water' || ty === 'WATER') return { tag: 'water_orb', anim: true, scale: 0.5, step: 6, speed: 140, wobble: 1.5, alpha: 0.65, hit: 'water_impact' };
  if (fx === 'ice' || ty === 'ICE') return { tag: 'ice_crystals', anim: true, scale: 1, step: 6, speed: 120, wobble: 2, alpha: 1, hit: 'ice_crystals__16x16' };
  if (fx === 'psychic' || ty === 'PSYCHIC') return { tag: 'gold_ring', scale: 0.5, step: 8, speed: 160, wobble: 0, alpha: 0.9, rotate: true, rotOff: Math.PI / 2, hit: 'gold_ring' };
  if (fx === 'fire' || ty === 'FIRE') return { tag: 'small_ember', anim: true, scale: 0.5, step: 6, speed: 150, wobble: 2, alpha: 1, hit: 'fire_plume' };
  if (fx === 'spark' || ty === 'ELECTRIC') return { tag: 'spark__8x16', anim: true, scale: 0.5, step: 6, speed: 180, wobble: 2.5, alpha: 1, rotate: true, rotOff: Math.PI / 2, hit: 'shock_3' };
  if (ty === 'GRASS') return { tag: 'orbs__16x16', anim: true, scale: 0.5, step: 7, speed: 150, wobble: 1, alpha: 1, hit: 'impact' };
  if (ty === 'DRAGON') return { tag: 'fire_plume', anim: true, scale: 0.5, step: 7, speed: 150, wobble: 2, alpha: 1, hit: 'fire_plume' };
  return { tag: 'orbs', anim: true, scale: 1, step: 6, speed: 160, wobble: 1, alpha: 1, hit: 'impact' }; // Hyper Beam and other normal beams
}
const RING_SPRITE = {
  fire: { tag: 'small_ember', anim: true }, ice: { tag: 'ice_crystals', anim: true, scale: 1 }, water: { tag: 'small_bubbles', frame: 0 },
  spark: { tag: 'spark_2', frame: 1 }, psychic: { tag: 'gold_ring', rotate: true }, sound: { tag: 'noise_line', anim: true, rotate: true },
  quake: { tag: 'mud_sand__16x16', frame: 2 }, explosion: { tag: 'explosion', anim: true }, shine: { tag: 'sparkle_4', anim: true }, sludge: { tag: 'poison_bubble', anim: true },
};
const CLOUD = {"""),
])
print('ok')
