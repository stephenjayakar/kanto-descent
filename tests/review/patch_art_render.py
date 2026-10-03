def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:80]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

R = 'web/src/game/render.js'
rep(R, [
    # projectile sprites: water droplets, sparks, dragon fire (FireRed's own choices)
    ("  water: { tag: 'water_orb', anim: true },", "  water: { tag: 'small_bubbles', frame: 1, rotate: true, rotOff: Math.PI / 2 }, // Water Gun's droplet (the orb is only ever drawn blended, in groups)\n  spark: { tag: 'spark__8x16', anim: true, fps: 16, rotate: true, rotOff: Math.PI / 2 },"),
    ("  dragon: { tag: 'purple_flame', anim: true },", "  dragon: { tag: 'fire_plume', anim: true, scale: 0.5 }, // Dragon Rage / Breath use fire, not Grudge's navy flame"),
    ("  dragon: 'purple_flame', rock: 'rocks',", "  dragon: 'fire_plume', rock: 'rocks',"),
    # drawBA: snap scales to multiples of 0.5 so nearest-neighbour never drops pixels unevenly
    ("  const s = opts.scale || 1;\n  ctx.save();\n  ctx.translate(Math.round(x), Math.round(y));",
     "  const s = Math.max(0.5, Math.round((opts.scale || 1) * 2) / 2); // only x0.5 / x1 / x1.5...: odd scales mangle pixel art\n  ctx.save();\n  ctx.translate(Math.round(x), Math.round(y));"),
    # FireRed's field-effect shadows instead of ellipses
    ("""const shadowCache = new Map();
function shadow(ctx, x, y, w, a = 0.35) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), w, Math.max(2, w * 0.4), 0, 0, Math.PI * 2); ctx.fill();
}""", """// FireRed's overworld shadows (field_effects/shadow_*), picked by width; drawn see-through like the game does
const SHADOWS = [[10, 'shadow_small', 8, 8], [20, 'shadow_medium', 16, 8], [40, 'shadow_large', 32, 8], [1e9, 'shadow_extra_large', 64, 32]];
function shadow(ctx, x, y, w, a = 0.35) {
  const [, name, sw, sh] = SHADOWS.find(s => w * 2 <= s[0]);
  const im = img(`gfx/misc/field_effects/${name}.png`);
  if (!ready(im)) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), w, Math.max(2, w * 0.4), 0, 0, Math.PI * 2); ctx.fill(); return; }
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * Math.min(1, a * 1.6);
  ctx.drawImage(im, Math.round(x - sw / 2), Math.round(y - (name === 'shadow_extra_large' ? sh / 2 : sh / 2)));
  ctx.globalAlpha = ga;
}"""),
    # effects stay inside the arena (they used to paint over the darkened surroundings)
    ("""  // effects
  for (const v of w.vfx) if (v.kind !== 'tele' && v.kind !== 'afterimage') drawVfx(ctx, v, w);""",
     """  // effects (clipped to the arena so storms and long beams don't paint over the darkened surroundings)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, R.w * TILE, R.h * TILE); ctx.clip();
  for (const v of w.vfx) if (v.kind !== 'tele' && v.kind !== 'afterimage') drawVfx(ctx, v, w);
  ctx.restore();"""),
    # floating text moves to a crisp screen-space pass (drawWorldTexts), called by the room after the camera transform
    ("""  // floating text
  for (const tx of w.texts) {
    const k = tx.t / tx.life;
    const y = tx.y - (tx.label ? 10 * k : 18 * Math.sqrt(k));
    const alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    if (tx.label) text(ctx, tx.str, tx.x, y, { align: 'center', color: [tx.color, '#202020'], font: 'small', alpha });
    else text(ctx, tx.str, tx.x, y, { align: 'center', color: tx.color, font: tx.big ? 'normal' : 'small', alpha, scale: 1 });
  }
}""", """  // floating text: in world space only if the caller doesn't draw it on screen (drawWorldTexts)
  if (!opts.screenTexts) for (const tx of w.texts) {
    const k = tx.t / tx.life;
    const y = tx.y - (tx.label ? 10 * k : 18 * Math.sqrt(k));
    const alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    if (tx.label) text(ctx, tx.str, tx.x, y, { align: 'center', color: [tx.color, '#202020'], font: 'small', alpha });
    else text(ctx, tx.str, tx.x, y, { align: 'center', color: tx.color, font: tx.big ? 'normal' : 'small', alpha, scale: 1 });
  }
}

// Damage numbers and labels at 1x on screen (crisp and half the size of world-space text). cam = camera
// top-left in world px; the world is drawn at 2x.
export function drawWorldTexts(ctx, w, cam) {
  for (const tx of w.texts) {
    const k = tx.t / tx.life;
    const y = tx.y - (tx.label ? 8 * k : 14 * Math.sqrt(k));
    const alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    const sx = Math.round((tx.x + (tx.dx || 0) - cam.x) * 2), sy = Math.round((y - cam.y) * 2);
    if (tx.label) text(ctx, tx.str, sx, sy, { align: 'center', color: [tx.color, '#202020'], font: 'small', alpha });
    else text(ctx, tx.str, sx, sy, { align: 'center', color: [COLOR_HEX[tx.color] || tx.color, '#202020'], font: tx.big ? 'normal' : 'small', alpha });
  }
}
const COLOR_HEX = { red: '#ff6858', gold: '#f8d030', orange: '#f8a048', gray: '#c0c0c0', white: '#ffffff', green: '#78e878', blue: '#80b0ff', purple: '#d080f0' };"""),
    # sleep: FireRed's small drifting Zs; burn/para particles at clean scales
    ("  if (a.status.sleep) drawBA(ctx, 'letter_z', a.x + 8, a.y - 24 - a.r - Math.sin(w.time * 3) * 3, w.time, { anim: true, alpha: 0.9 });",
     "  if (a.status.sleep) for (let i = 0; i < 2; i++) { const k = (w.time * 0.9 + i * 0.5) % 1; drawBA(ctx, 'letter_z', a.x + 4 + k * 8, a.y - spriteTop(a) + 4 - k * 10, 0, { scale: 0.5, alpha: k < 0.8 ? 1 : (1 - k) / 0.2 }); } // Status_Sleep: Zs drift up and fade"),
    ("  if (a.status.confuse || a.confused) drawBA(ctx, 'duck', a.x + Math.cos(w.time * 5) * 8, a.y - 20 - a.r, w.time, { anim: true, scale: 0.6 });",
     "  if (a.status.confuse || a.confused) drawBA(ctx, 'duck', a.x + Math.cos(w.time * 5) * 8, a.y - spriteTop(a) + 2, w.time, { anim: true, scale: 0.5 });"),
    ("  if (a.status.para && Math.floor(w.time * 10) % 3 === 0) drawBA(ctx, 'spark_2', a.x + (Math.random() - 0.5) * a.r, a.y - 10 - Math.random() * a.r, 0, { frame: Math.floor(Math.random() * 3), scale: 0.7 });",
     "  if (a.status.para && Math.floor(w.time * 10) % 3 === 0) drawBA(ctx, 'spark_2', a.x + (Math.random() - 0.5) * a.r, a.y - 10 - Math.random() * a.r, 0, { frame: Math.floor(Math.random() * 3), scale: 0.5 });"),
    ("  if (a.status.burn && Math.floor(w.time * 8) % 4 === 0) drawBA(ctx, 'small_ember', a.x + (Math.random() - 0.5) * a.r, a.y - 6 - Math.random() * a.r, w.time, { anim: true, scale: 0.4 });",
     "  if (a.status.burn && Math.floor(w.time * 8) % 4 === 0) drawBA(ctx, 'small_ember', a.x + (Math.random() - 0.5) * a.r, a.y - 6 - Math.random() * a.r, w.time, { anim: true, scale: 0.5 });"),
    ("  if (a.shieldHits > 0 && a.team === 'player') { ctx.strokeStyle = 'rgba(248,208,96,0.5)'; ctx.beginPath(); ctx.arc(a.x, a.y - 8, a.r + 6, 0, Math.PI * 2); ctx.stroke(); }",
     "  if (a.shieldHits > 0 && a.team === 'player') drawBA(ctx, 'protect', a.x, a.y - 10, 0, { scale: 0.5, alpha: 0.35 + 0.15 * Math.sin(w.time * 4) }); // Rebirth Shield: a faint Protect bubble"),
    ("  if (a.seeded) drawBA(ctx, 'seed', a.x - 6, a.y - 4 - a.r, 0, { frame: 0, scale: 0.7 });", "  if (a.seeded) drawBA(ctx, 'seed', a.x - 6, a.y - 4 - a.r, 0, { frame: 0, scale: 0.5 });"),
    # enemy HP bars: the GBA's own bar tiles (0-8 px of fill per 8x8 tile), status icon at its left, caught-ball marker
    ("""function drawActorBar(ctx, a) {
  const w = Math.max(18, Math.min(32, a.r * 2.4));
  const x = Math.round(a.x - w / 2), y = Math.round(a.y - spriteTop(a) - 4);
  const frac = Math.max(0, a.hp / a.maxHp);
  ctx.fillStyle = '#202820'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
  ctx.fillStyle = a.team === 'ally' ? '#4080ff' : frac > 0.5 ? '#58d080' : frac > 0.2 ? '#f8c838' : '#f85838';
  ctx.fillRect(x, y, Math.ceil(w * frac), 2);
  if (a.elite) { ctx.fillStyle = '#f8d030'; ctx.fillRect(x - 3, y - 1, 2, 4); ctx.fillRect(x + w + 1, y - 1, 2, 4); }
  // catchable hint
  if (a.team === 'enemy' && !a.trainerMon && frac <= 0.45) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w + 2, y - 1, 3, 3); ctx.fillStyle = '#e83030'; ctx.fillRect(x + w + 2, y - 1, 3, 1); }
  // status icon
  const st = Object.keys(a.status).find(k => STATUS_ICON[k]);
  if (st) { const im = img(`gfx/ui/battle/status_${STATUS_ICON[st]}.png`); if (ready(im)) ctx.drawImage(im, x + w / 2 - 12, y - 9); }
  // stage arrows
  let sx = x;
  for (const k of ['atk', 'def', 'spe']) { const s = a.stages[k]; if (s) { ctx.fillStyle = s > 0 ? '#80c8ff' : '#ff8080'; ctx.fillRect(sx, y + 3, 3, 1); sx += 4; } }
}""", """// FireRed HP bar, built like the GBA does: 8x8 tiles each holding 0-8 px of fill (ui/battle/hpbar_*_strip.png),
// drawn at 0.5 so one source pixel is one screen pixel. Status icon to the left (like the healthbox), the
// caught-ball mark when it's weak enough to catch, and stat-stage arrows.
export function drawHpTiles(ctx, x, y, tiles, frac, color) {
  const im = img(`gfx/ui/battle/hpbar_${color}_strip.png`);
  if (!ready(im)) { ctx.fillStyle = '#202820'; ctx.fillRect(x, y, tiles * 4, 4); ctx.fillStyle = color === 'red' ? '#f85838' : color === 'yellow' ? '#f8c838' : '#58d080'; ctx.fillRect(x, y + 1.5, tiles * 4 * frac, 1.5); return; }
  const px = Math.round(frac * tiles * 8);
  for (let i = 0; i < tiles; i++) { const f = Math.max(0, Math.min(8, px - i * 8)); ctx.drawImage(im, f * 8, 0, 8, 8, x + i * 4, y, 4, 4); }
}
function drawActorBar(ctx, a) {
  const tiles = Math.max(4, Math.min(8, Math.round(a.r * 2.4 / 4)));
  const w = tiles * 4;
  const x = Math.round(a.x - w / 2), y = Math.round(a.y - spriteTop(a) - 5);
  const frac = Math.max(0, a.hp / a.maxHp);
  drawHpTiles(ctx, x, y, tiles, frac, frac > 0.5 || a.team === 'ally' ? 'green' : frac > 0.2 ? 'yellow' : 'red');
  if (a.elite) drawBA(ctx, 'sparkle_4', x - 3, y + 2, 0, { frame: 1, scale: 0.5 });
  // catchable: the healthbox's caught-ball mark
  if (a.team === 'enemy' && !a.trainerMon && frac <= 0.45) { const im = img('gfx/ui/battle/ball_caught.png'); if (ready(im)) ctx.drawImage(im, x + w + 1, y, 4, 4); }
  // status icon (24x8) to the left of the bar
  const st = Object.keys(a.status).find(k => STATUS_ICON[k]);
  if (st) { const im = img(`gfx/ui/battle/status_${STATUS_ICON[st]}.png`); if (ready(im)) ctx.drawImage(im, x - 13, y, 12, 4); }
  // stat stages: FireRed's scroll arrows (up if any stat is raised, down if any is lowered)
  const up = ['atk', 'def', 'spe'].some(k => a.stages[k] > 0), down = ['atk', 'def', 'spe'].some(k => a.stages[k] < 0);
  if (up || down) { const im = img(`gfx/ui/cursors/scroll_${up ? 'up' : 'down'}.png`); if (ready(im)) ctx.drawImage(im, x + w + (frac <= 0.45 ? 6 : 1), y - 2, 8, 8); }
}"""),
    # pickups: FireRed's item ball instead of a gold square
    ("  else { ctx.fillStyle = '#f8d038'; ctx.fillRect(Math.round(k.x - 2), Math.round(y - 2), 4, 4); }",
     "  else { const im = img('gfx/overworld/misc/item_ball.png'); if (ready(im)) ctx.drawImage(im, 0, 0, 16, 16, Math.round(k.x - 8), Math.round(y - 8), 16, 16); }"),
])

# ---------------------------------------------------------------- vfx cases
rep(R, [
    # beams: a stream of FireRed particles (like the game's beam moves), with a matching impact
    ("""    case 'beam': {
      const col = TYPE_COLORS[v.type] || '#fff';
      const fade = k > 0.7 ? (1 - k) / 0.3 : 1;
      const wd = v.width * (k < 0.15 ? k / 0.15 : 1);
      ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.ang); ctx.globalAlpha = fade;
      ctx.fillStyle = col; ctx.fillRect(0, -wd / 2, v.len, wd);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -wd / 5, v.len, wd / 2.5);
      for (let d = 0; d < v.len; d += 12) { ctx.fillStyle = col; ctx.fillRect(d + ((w.time * 200) % 12), -wd / 2 - 2, 4, 2); ctx.fillRect(d + ((w.time * 160) % 12), wd / 2, 4, 2); }
      ctx.restore();
      drawBA(ctx, v.fx === 'water' ? 'water_impact' : v.fx === 'ice' ? 'ice_crystals__16x16' : 'explosion', v.x + Math.cos(v.ang) * v.len, v.y + Math.sin(v.ang) * v.len, v.t, { anim: true, alpha: fade });
      break;
    }""", """    case 'beam': {
      const fade = k > 0.7 ? (1 - k) / 0.3 : 1;
      const B = beamStyle(v);
      const c = Math.cos(v.ang), s2 = Math.sin(v.ang), lanes = v.width >= 12 ? [-v.width / 4, v.width / 4] : [0];
      const grow = Math.min(1, k / 0.15);
      for (const lane of lanes) for (let d = (w.time * B.speed) % B.step; d < v.len * grow; d += B.step) {
        const jit = Math.sin(d * 0.7 + w.time * 20) * B.wobble;
        drawBA(ctx, B.tag, v.x + c * d - s2 * (lane + jit), v.y + s2 * d + c * (lane + jit), w.time + d * 0.01, { anim: B.anim, frame: B.frame, scale: B.scale, alpha: fade * B.alpha, rot: B.rotate ? v.ang + (B.rotOff || 0) : 0 });
      }
      drawBA(ctx, B.hit, v.x + c * v.len, v.y + s2 * v.len, v.t, { anim: true, scale: 0.5, alpha: fade });
      break;
    }"""),
    # bolts: chains of FireRed spark tiles; big strikes are a column of lightning frames
    ("""    case 'bolt': {
      ctx.strokeStyle = `rgba(255,248,140,${1 - k})`; ctx.lineWidth = v.big ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(v.x0, v.y0);
      const n = 6;
      for (let i = 1; i < n; i++) { const t = i / n; ctx.lineTo(v.x0 + (v.x1 - v.x0) * t + (Math.random() - 0.5) * 8, v.y0 + (v.y1 - v.y0) * t + (Math.random() - 0.5) * 8); }
      ctx.lineTo(v.x1, v.y1); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 1; ctx.stroke();
      if (v.big) drawBA(ctx, 'lightning', v.x1, v.y1 - 16, v.t, { anim: true });
      break;
    }""", """    case 'bolt': {
      const a = 1 - k;
      if (v.big) { // Thunder: a column of lightning frames down onto the target
        for (let i = 0; i < 3; i++) drawBA(ctx, 'lightning', v.x1, v.y1 - 16 - i * 30, v.t + i * 0.04, { anim: true, alpha: a });
      } else { // Thunderbolt-style chain: spark tiles laid end to end along the arc
        const dx = v.x1 - v.x0, dy = v.y1 - v.y0, len = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
        v.jit ??= Array.from({ length: 16 }, () => (Math.random() - 0.5) * 6);
        for (let d = 0, i = 0; d < len; d += 7, i++) drawBA(ctx, 'spark__8x16', v.x0 + dx * d / len - Math.sin(ang) * v.jit[i % 16], v.y0 + dy * d / len + Math.cos(ang) * v.jit[i % 16], v.t + i * 0.03, { anim: true, fps: 16, rot: ang + Math.PI / 2, scale: 0.5, alpha: a });
        drawBA(ctx, 'spark_2', v.x1, v.y1, v.t, { frame: Math.floor(v.t * 20) % 3, scale: 0.5, alpha: a });
      }
      break;
    }"""),
    # rings: a ring of the move's own particles instead of a thin coloured ellipse
    ("""    case 'ring': {
      const r = v.r0 + (v.r1 - v.r0) * Math.sqrt(k);
      const col = v.fx === 'fire' ? '255,140,40' : v.fx === 'ice' ? '170,230,255' : v.fx === 'water' ? '100,150,255' : v.fx === 'spark' ? '255,240,100' : v.fx === 'psychic' ? '255,120,200' : v.fx === 'quake' ? '200,170,100' : v.fx === 'explosion' ? '255,200,80' : v.fx === 'wind' ? '220,240,255' : v.fx === 'sound' ? '255,255,255' : '255,255,255';
      ctx.strokeStyle = `rgba(${col},${(1 - k) * 0.9})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(v.x, v.y, r, r * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;""", """    case 'ring': {
      const r = v.r0 + (v.r1 - v.r0) * Math.sqrt(k);
      const RS = RING_SPRITE[v.fx];
      if (RS) { // ring of the move's particles (FireRed builds its bursts out of sprites, not lines)
        const n = Math.max(6, Math.min(16, Math.round(r / 5)));
        for (let i = 0; i < n; i++) { const an = i / n * Math.PI * 2 + (RS.spin ? v.t * 3 : 0); drawBA(ctx, RS.tag, v.x + Math.cos(an) * r, v.y + Math.sin(an) * r * 0.75 - 4, v.t + i * 0.05, { anim: RS.anim, frame: RS.frame, scale: RS.scale || 0.5, alpha: 1 - k, rot: RS.rotate ? an + Math.PI / 2 : 0 }); }
        if (v.fx === 'quake' && k < 0.5) drawBA(ctx, 'flying_dirt', v.x, v.y - 6, 0, { scale: Math.min(1.5, r / 32), alpha: (0.5 - k) * 2 });
        break;
      }
      const col = v.fx === 'wind' ? '220,240,255' : '255,255,255';
      ctx.strokeStyle = `rgba(${col},${(1 - k) * 0.9})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(v.x, v.y, r, r * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;"""),
    # explosions: ghost/dark impacts use Shadow Ball, not the navy Grudge flame
    ("v.type === 'GHOST' || v.type === 'DARK' ? 'purple_flame' : 'explosion';", "v.type === 'GHOST' || v.type === 'DARK' ? 'shadow_ball' : 'explosion';"),
    ("      const s = Math.max(0.6, Math.min(1.6, v.r / 18));\n      if (tag) drawBA(ctx, tag, v.x, v.y - 4, v.t, { anim: true, scale: s, alpha: 1 - k * 0.5, frame: tag === 'rocks' ? 3 : undefined });\n      ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.6})`; ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r * k, v.r * 0.75 * k, 0, 0, Math.PI * 2); ctx.stroke();",
     "      const s = v.r >= 26 ? 1 : 0.5;\n      if (tag) drawBA(ctx, tag, v.x, v.y - 4, v.t, { anim: true, scale: s, alpha: 1 - k * 0.5, frame: tag === 'rocks' ? 3 : undefined });\n      if (v.r >= 20) for (let i = 0; i < 6; i++) { const an = i * 1.05; drawBA(ctx, 'impact', v.x + Math.cos(an) * v.r * k, v.y + Math.sin(an) * v.r * 0.75 * k - 4, 0, { scale: 0.5, alpha: (1 - k) * 0.7 }); }"),
    # dust: FireRed's ground-impact dust
    ("    case 'dust': for (let i = 0; i < 3; i++) { ctx.fillStyle = `rgba(230,220,200,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(v.x + (i - 1) * 5, v.y - k * 4, 2 + k * 3, 0, Math.PI * 2); ctx.fill(); } break;",
     "    case 'dust': { const im = img('gfx/misc/field_effects/ground_impact_dust.png'); if (ready(im)) { const f = Math.min(2, Math.floor(k * 3)); ctx.drawImage(im, 0, f * 8, 16, 8, Math.round(v.x - 8), Math.round(v.y - 6), 16, 8); } break; } // field_effects/ground_impact_dust: 3 frames of 16x8"),
    # Blizzard: FireRed's ice crystals streaming through the haze instead of drawn flakes
    ("""      const W2 = v.r * 2.6, H2 = v.r * 2;
      for (let i = 0; i < 70; i++) {
        const sx = ((i * 97.13 + v.t * (150 + (i % 5) * 25)) % W2) - W2 / 2, sy = ((i * 53.71 + v.t * (55 + (i % 3) * 20)) % H2) - H2 / 2;
        if ((sx * sx) / (W2 * W2 / 4) + (sy * sy) / (H2 * H2 / 4) > 1) continue;
        const big = i % 7 === 0;
        ctx.fillStyle = `rgba(255,255,255,${(big ? 0.95 : 0.7) * a})`;
        ctx.fillRect(Math.round(v.x + sx), Math.round(v.y + sy - 10), big ? 2 : 1, big ? 2 : 1);
        if (i % 4 === 0) { ctx.fillStyle = `rgba(230,245,255,${0.35 * a})`; ctx.fillRect(Math.round(v.x + sx - 6), Math.round(v.y + sy - 10), 6, 1); } // wind streaks
      }
      break;""", """      const W2 = v.r * 2.6, H2 = v.r * 2;
      for (let i = 0; i < 28; i++) { // sBlizzardIceCrystalSpriteTemplate: crystals blown diagonally across
        const sx = ((i * 97.13 + v.t * (150 + (i % 5) * 25)) % W2) - W2 / 2, sy = ((i * 53.71 + v.t * (55 + (i % 3) * 20)) % H2) - H2 / 2;
        if ((sx * sx) / (W2 * W2 / 4) + (sy * sy) / (H2 * H2 / 4) > 1) continue;
        drawBA(ctx, i % 3 ? 'ice_crystals__8x16' : 'ice_crystals__16x16', v.x + sx, v.y + sy - 10, v.t + i * 0.07, { anim: true, fps: 10, scale: 0.5, alpha: a * 0.95, rot: 0.6 });
      }
      break;"""),
])
# zones: Smokescreen's sprite was never drawn (the smoke check came first); whirlpools use FireRed's spiralling orbs
rep(R, [
    ("""  } else if (z.sprite === 'smoke' || z.blind) {
    ctx.fillStyle = 'rgba(40,40,48,0.55)';
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + w.time * 0.4; ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * z.r * 0.5, z.y + Math.sin(a) * z.r * 0.35, z.r * 0.55, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();""", """  } else if (z.sprite === 'smoke' || z.blind) { // Smokescreen: FireRed's black smoke puffs
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + w.time * 0.4; drawBA(ctx, 'black_smoke', z.x + Math.cos(a) * z.r * 0.5, z.y + Math.sin(a) * z.r * 0.35 - 4, 0, { scale: 1, alpha: 0.85 }); }
  } else {
    if (!tag) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); } // sprite clouds don't need a disc under them"""),
    ("""  // spiral arms of foam, turning inward
  ctx.lineCap = 'round';
  for (let arm_i = 0; arm_i < 4; arm_i++) {
    const base = spin + arm_i * Math.PI / 2;
    ctx.strokeStyle = `rgba(${arm},${0.55 - arm_i * 0.05})`; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let j = 0; j <= 18; j++) { const t = j / 18, r = rx * (0.95 - 0.85 * t), a2 = base + t * 4.2; const px = Math.cos(a2) * r, py = Math.sin(a2) * r; if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke();
  }""", """  ctx.restore();
  // Status_Whirlpool / Fire Spin: the move's own particles spiralling inward (water orbs blended, embers)
  for (let i = 0; i < 16; i++) {
    const life = ((w.time * 0.55 + i / 16) % 1), r = rx * (1 - life * 0.85), a2 = i * 2.4 + spin + life * 5;
    drawBA(ctx, fire ? 'small_ember' : 'water_orb', z.x + Math.cos(a2) * r, z.y + Math.sin(a2) * r * (ry / rx) - 2, w.time + i * 0.1, { anim: true, scale: 0.5, alpha: (fire ? 0.9 : 0.6) * Math.min(1, (1 - life) * 3) });
  }
  ctx.save(); ctx.translate(z.x, z.y); ctx.scale(1, ry / rx); ctx.lineCap = 'round';"""),
])
# tables used above
rep(R, [
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
  return { tag: 'orbs', anim: true, scale: 1, step: 6, speed: 160, wobble: 1, alpha: 1, hit: 'impact' }; // Hyper Beam / Aurora-ish
}
const RING_SPRITE = {
  fire: { tag: 'small_ember', anim: true }, ice: { tag: 'ice_crystals', anim: true, scale: 1 }, water: { tag: 'small_bubbles', frame: 0 },
  spark: { tag: 'spark_2', frame: 1 }, psychic: { tag: 'gold_ring', rotate: true }, sound: { tag: 'noise_line', anim: true, rotate: true },
  quake: { tag: 'mud_sand__16x16', frame: 2 }, explosion: { tag: 'explosion', anim: true }, shine: { tag: 'sparkle_4', anim: true }, sludge: { tag: 'poison_bubble', anim: true },
};
const CLOUD = {"""),
])
print('ok')
