p = 'web/src/game/render.js'
s = open(p, encoding='utf8').read()
a = """  if (z.vortex) {
    ctx.strokeStyle = 'rgba(120,180,255,0.6)';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.3 + 0.3 * i) * (1 + 0.1 * Math.sin(w.time * 6 + i)), w.time * 5 + i, w.time * 5 + i + 4); ctx.stroke(); }
  } else"""
b = """  if (z.vortex) drawWhirlpool(ctx, z, w);
  else"""
assert a in s; s = s.replace(a, b, 1)
a = "function drawZone(ctx, z, w) {"
b = r"""// A whirlpool (LUGIA's Whirlpool, Fire Spin...): a basin that's darkest in the middle, spiral arms of foam turning
// inward, spray being sucked in, and a churning rim. Fire vortexes use the same shape in flame colours.
function drawWhirlpool(ctx, z, w) {
  const fire = z.p?.type === 'FIRE' || z.fire;
  const rim = fire ? '255,170,60' : '210,240,255', arm = fire ? '255,220,120' : '255,255,255';
  const rx = z.r, ry = z.r * 0.62, spin = w.time * 4.2;
  const g = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, rx);
  if (fire) { g.addColorStop(0, 'rgba(90,10,0,0.75)'); g.addColorStop(0.55, 'rgba(220,70,10,0.45)'); g.addColorStop(1, 'rgba(255,150,40,0.08)'); }
  else { g.addColorStop(0, 'rgba(10,30,90,0.8)'); g.addColorStop(0.55, 'rgba(40,110,210,0.5)'); g.addColorStop(1, 'rgba(120,190,255,0.1)'); }
  ctx.save(); ctx.translate(z.x, z.y); ctx.scale(1, ry / rx);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
  // spiral arms of foam, turning inward
  ctx.lineCap = 'round';
  for (let arm_i = 0; arm_i < 4; arm_i++) {
    const base = spin + arm_i * Math.PI / 2;
    ctx.strokeStyle = `rgba(${arm},${0.55 - arm_i * 0.05})`; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let j = 0; j <= 18; j++) { const t = j / 18, r = rx * (0.95 - 0.85 * t), a2 = base + t * 4.2; const px = Math.cos(a2) * r, py = Math.sin(a2) * r; if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke();
  }
  // spray / bubbles being sucked toward the middle
  for (let i = 0; i < 16; i++) {
    const life = ((w.time * 0.7 + i * 0.0625) % 1), r = rx * (1 - life) * 0.95, a2 = i * 2.4 + spin * 1.3 + life * 5;
    ctx.fillStyle = `rgba(${arm},${0.8 * (1 - life)})`; ctx.fillRect(Math.round(Math.cos(a2) * r), Math.round(Math.sin(a2) * r), 2, 2);
  }
  // churning rim
  ctx.strokeStyle = `rgba(${rim},0.7)`; ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) { const a2 = -spin * 0.6 + i * Math.PI / 3; ctx.beginPath(); ctx.arc(0, 0, rx * (0.97 + 0.04 * Math.sin(w.time * 9 + i)), a2, a2 + 0.7); ctx.stroke(); }
  ctx.lineWidth = 1; ctx.lineCap = 'butt';
  ctx.restore();
  if (!fire) drawBA(ctx, 'water_orb', z.x + Math.cos(spin * 1.5) * rx * 0.35, z.y + Math.sin(spin * 1.5) * ry * 0.35 - 4, w.time, { anim: true, scale: 0.6, alpha: 0.7 });
}

function drawZone(ctx, z, w) {"""
assert a in s; s = s.replace(a, b, 1)
open(p, 'w', encoding='utf8').write(s)
print('ok')
