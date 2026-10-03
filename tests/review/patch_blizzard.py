def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/game/moves_rt.js', [
    ("  BLIZZARD: { kind: 'strike', radius: 22, delay: 0.5, count: 5, scatter: 40, cd: 2.2, fx: 'ice', sfx: 'se_m_blizzard' },",
     "  BLIZZARD: { kind: 'strike', radius: 22, delay: 0.5, count: 5, scatter: 40, cd: 2.2, fx: 'ice', sfx: 'se_m_blizzard', blizzard: true },"),
])
rep('web/src/game/combat.js', [
    ("""          this.strikes.push({ owner: a, act, x: pt.x, y: pt.y, r: p.radius || 20, t: -(i * 0.12), delay, p, slot: act.slot, team: a.team });
        }
        act.dur = 0.15;""", """          this.strikes.push({ owner: a, act, x: pt.x, y: pt.y, r: p.radius || 20, t: -(i * 0.12), delay, p, slot: act.slot, team: a.team });
          if (p.blizzard) this.vfx.push({ kind: 'icefall', x: pt.x, y: pt.y, t: -(i * 0.12), life: delay });
        }
        // Blizzard: a snowstorm sweeps over the whole area while the ice comes down
        if (p.blizzard) this.vfx.push({ kind: 'blizzard', x: tp.x, y: tp.y, r: (p.scatter || 0) + (p.radius || 20) + 16, t: 0, life: (p.delay ?? 0.4) + n * 0.12 + 0.9 });
        act.dur = 0.15;"""),
    ("        if (s.p.fx === 'rock' || s.p.fx === 'quake') this.shake = Math.max(this.shake, 3);",
     "        if (s.p.fx === 'rock' || s.p.fx === 'quake') this.shake = Math.max(this.shake, 3);\n        if (s.p.blizzard) { this.vfx.push({ kind: 'iceburst', x: s.x, y: s.y, r: s.r, t: 0, life: 0.55 }); this.shake = Math.max(this.shake, 3); }"),
])
rep('web/src/game/render.js', [
    ("    case 'custom': v.draw?.(ctx, v, k); break;", r"""    case 'custom': v.draw?.(ctx, v, k); break;
    // Blizzard: a frosty haze with wind-driven snow over the target area
    case 'blizzard': {
      const a = Math.min(1, v.t / 0.2, (v.life - v.t) / 0.35);
      const g = ctx.createRadialGradient(v.x, v.y, 4, v.x, v.y, v.r * 1.3);
      g.addColorStop(0, `rgba(220,240,255,${0.35 * a})`); g.addColorStop(1, 'rgba(220,240,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r * 1.3, v.r, 0, 0, Math.PI * 2); ctx.fill();
      const W2 = v.r * 2.6, H2 = v.r * 2;
      for (let i = 0; i < 70; i++) {
        const sx = ((i * 97.13 + v.t * (150 + (i % 5) * 25)) % W2) - W2 / 2, sy = ((i * 53.71 + v.t * (55 + (i % 3) * 20)) % H2) - H2 / 2;
        if ((sx * sx) / (W2 * W2 / 4) + (sy * sy) / (H2 * H2 / 4) > 1) continue;
        const big = i % 7 === 0;
        ctx.fillStyle = `rgba(255,255,255,${(big ? 0.95 : 0.7) * a})`;
        ctx.fillRect(Math.round(v.x + sx), Math.round(v.y + sy - 10), big ? 2 : 1, big ? 2 : 1);
        if (i % 4 === 0) { ctx.fillStyle = `rgba(230,245,255,${0.35 * a})`; ctx.fillRect(Math.round(v.x + sx - 6), Math.round(v.y + sy - 10), 6, 1); } // wind streaks
      }
      break;
    }
    // an ice chunk drops from the sky onto its warning circle
    case 'icefall': {
      if (v.t < 0) break;
      const f = Math.min(1, v.t / v.life), fall = (1 - f * f) * 130;
      ctx.fillStyle = `rgba(150,210,255,${0.25 + 0.25 * f})`; ctx.beginPath(); ctx.ellipse(v.x, v.y, 4 + 8 * f, 3 + 5 * f, 0, 0, Math.PI * 2); ctx.fill(); // its shadow
      if (!drawBA(ctx, 'ice_chunk', v.x, v.y - 8 - fall, 0, { scale: 0.9 })) { ctx.fillStyle = '#c8ecff'; ctx.fillRect(v.x - 3, v.y - 14 - fall, 6, 10); }
      ctx.strokeStyle = `rgba(220,245,255,${0.5 * f})`; ctx.beginPath(); ctx.moveTo(v.x, v.y - 8 - fall - 4); ctx.lineTo(v.x - 3, v.y - 8 - fall - 22); ctx.stroke(); // falling streak
      break;
    }
    // impact: ice spikes burst out, frost spreads and crystals scatter
    case 'iceburst': {
      ctx.fillStyle = `rgba(200,240,255,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r * (0.6 + 0.6 * k), v.r * 0.75 * (0.6 + 0.6 * k), 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
      drawBA(ctx, 'ice_spikes', v.x, v.y - 6, v.t, { anim: true, scale: Math.max(0.8, v.r / 18), alpha: 1 - k * 0.6 });
      for (let i = 0; i < 6; i++) drawBA(ctx, 'ice_crystals__8x16', v.x + Math.cos(i * 1.05) * v.r * 1.1 * k, v.y + Math.sin(i * 1.05) * v.r * 0.8 * k - 6, 0, { frame: i % 3, alpha: 1 - k });
      break;
    }"""),
])
print('ok')
