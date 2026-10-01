// Test bot: plays through rooms quickly (god mode by default) to smoke-test the whole run flow.
//   import('./src/dev/autoplay.js').then(m => m.start({ god: true }))
import { Engine } from '../engine/core.js';

const key = k => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: k })), 30); };

// ---- a crude "skilled player": dodge telegraphs, kite with Special, melee when safe
const held = new Set();
const hold = k => { if (!held.has(k)) { held.add(k); window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); } };
const unhold = k => { if (held.has(k)) { held.delete(k); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); } };
function release() { for (const k of [...held]) unhold(k); }
function steer(dx, dy) {
  const want = new Set();
  if (dx > 0.3) want.add('d'); if (dx < -0.3) want.add('a'); if (dy > 0.3) want.add('s'); if (dy < -0.3) want.add('w');
  for (const k of ['w', 'a', 's', 'd']) want.has(k) ? hold(k) : unhold(k);
}
function danger(w, p) {
  // returns a unit vector away from the most urgent threat, or null
  let best = null, urgency = 0;
  for (const v of w.vfx) if (v.kind === 'tele' && !v.dead) {
    const k = v.t / Math.max(0.01, v.life); if (k < 0.35) continue;
    let inside = false, ax = p.x - v.x, ay = p.y - v.y;
    if (v.shape === 'circle') inside = Math.hypot(ax, ay / 0.75) < v.r + 8;
    else if (v.shape === 'arc') inside = Math.hypot(ax, ay) < v.r + 8;
    else if (v.shape === 'line') { const c = Math.cos(v.ang), s2 = Math.sin(v.ang); const al = ax * c + ay * s2, pe = Math.abs(-ax * s2 + ay * c); inside = al > -8 && al < v.len + 8 && pe < (v.width || 4) / 2 + 12; if (inside) { ax = -s2 * Math.sign(-ax * s2 + ay * c || 1); ay = c * Math.sign(-ax * s2 + ay * c || 1); } }
    if (inside && k > urgency) { urgency = k; const l = Math.hypot(ax, ay) || 1; best = { x: ax / l, y: ay / l, k }; }
  }
  for (const s3 of w.strikes) if (s3.team === 'enemy' && !s3.done && Math.hypot(p.x - s3.x, (p.y - s3.y) / 0.75) < s3.r + 8) { const ax = p.x - s3.x, ay = p.y - s3.y, l = Math.hypot(ax, ay) || 1; if (s3.t / s3.delay > urgency) { urgency = s3.t / s3.delay; best = { x: ax / l, y: ay / l, k: urgency }; } }
  for (const pr of w.projectiles) if (pr.team === 'enemy') { const d = Math.hypot(pr.x - p.x, pr.y + 8 - p.y); if (d < 30) { const vx = pr.vx, vy = pr.vy, l = Math.hypot(vx, vy) || 1; if (((p.x - pr.x) * vx + (p.y - pr.y) * vy) > 0 && 0.9 > urgency) { urgency = 0.9; best = { x: -vy / l, y: vx / l, k: 0.9 }; } } }
  return best;
}
function smartFight(w, p, foes) {
  const run = G.run;
  let e = foes[0], ed = 1e9;
  for (const f of foes) { const d = Math.hypot(f.x - p.x, f.y - p.y); if (d < ed) { ed = d; e = f; } }
  const dz = danger(w, p);
  if (dz) {
    steer(dz.x, dz.y);
    if (dz.k > 0.7 && (p.pc?.dashLeft || 0) > 0) key(' ');
    return;
  }
  const atkRange = 26 + e.r, lowHp = p.hp < p.maxHp * 0.35;
  const spReady = !(p.cds.slot_special > 0);
  const dx = (e.x - p.x) / (ed || 1), dy = (e.y - p.y) / (ed || 1);
  // aim by facing the target (keyboard aim): steer toward it briefly
  if (spReady && ed < 140 && ed > 40) { steer(dx, dy); key('k'); return; }
  if (ed > atkRange - 4) { steer(dx, dy); }
  else { steer(0, 0); p.facing = Math.atan2(dy, dx); key('j'); }
  if (run.callGauge >= 1 && run.partner) key('f');
  if (!(p.cds.slot_cast > 0) && ed < 60) key('q');
  if (e.hp < e.maxHp * 0.3 && !e.trainerMon && !e.boss && run.balls > 0 && !run.partner) key('r');
  if (lowHp && ed < 40) steer(-dx, -dy);
}

export function start(opts = {}) {
  const log = [];
  window.__autolog = log;
  let last = '', stuck = 0;
  const iv = setInterval(() => {
    try {
      const top = Engine.overlays[Engine.overlays.length - 1];
      const r = window.__room;
      if (top) {
        const n = top.constructor.name;
        if (n === 'Choice') {
          if (top.opts?.canSkip && /MART|RESEARCH/.test(top.title)) key('x'); else key('Enter');
        } else key('Enter');
        return;
      }
      if (!r || r.state !== 'play') { if (Engine.scene?.constructor?.name !== 'RoomScene') key('Enter'); return; }
      const w = r.world, p = w.player;
      if (opts.god) { p.iframes = 999; p.dmgMul = 40; p.hp = p.maxHp; for (const b of w.actors) if (b.boss && !b._nerf) { b._nerf = 1; b.hp = b.maxHp = Math.min(b.maxHp, 40); } }
      const sig = `${r.spec.kind}:${r.spec.layout}:${G.run.biome}:${G.run.roomInBiome}`;
      if (sig !== last) { last = sig; stuck = 0; log.push(sig); }
      if (++stuck > 400) { log.push('STUCK ' + sig + ' cleared=' + r.cleared + ' doors=' + r.doors.length); stuck = 0; }
      // talk to NPCs in service rooms once
      if ((r.spec.kind === 'center' || r.spec.kind === 'shop' || r.spec.kind === 'chaos') && !r._talked && r.npcs[0]) {
        r._talked = true; const n = r.npcs[0]; p.x = n.x; p.y = n.y + 14; setTimeout(() => key('e'), 50); return;
      }
      const foes = w.enemies().filter(e => e.spawnT <= 0 && !e.untargetable);
      if (foes.length && opts.smart) { smartFight(w, p, foes); return; }
      if (opts.smart) release();
      if (foes.length) {
        const e = foes[0];
        p.x = e.x - 16; p.y = e.y; p.facing = 0;
        if (!w.collides(p.x, p.y, p.r, 'walk')) { /* ok */ } else { p.x = e.x; p.y = e.y + 16; p.facing = -Math.PI / 2; }
        key(Math.random() < 0.5 ? 'j' : 'k');
        return;
      }
      if (r.rewardPickup && !r.rewardPickup.dead) { p.x = r.rewardPickup.x; p.y = r.rewardPickup.y; return; }
      if (r.doorsOpen && r.doors.length) {
        const d = r.doors[0];
        if (!d.armed) { p.x = d.x + 40 * (d.x < 100 ? 1 : -1); p.y = d.y; d.armed = true; return; }
        p.x = d.x; p.y = d.y; return;
      }
    } catch (e) { log.push('ERR ' + e.message); }
  }, 60);
  return () => clearInterval(iv);
}
