// Enemy and ally brains. A brain sets a.vx/a.vy (desired velocity) and starts moves via world.useMove.
import { D, defaultMoves } from './data.js';
import { profile } from './moves_rt.js';
import { moveSpeed } from './combat.js';

// Give a species a usable moveset: its real level-up moves, topped up from its pre-evolution
// when it only knows status moves (Metapod, Kakuna...).
export function enemyMoves(speciesKey, level) {
  let mv = defaultMoves(speciesKey, level);
  const dmg = m => profile(m).damaging;
  if (!mv.some(dmg)) {
    const pre = D.species[speciesKey]?.preEvolution;
    if (pre) mv = [...new Set([...defaultMoves(pre, level).filter(dmg), ...mv])].slice(-4);
  }
  if (!mv.some(dmg)) mv = ['TACKLE', ...mv].slice(0, 4);
  return mv;
}

function pickTarget(world, a) {
  if (a.confused) {
    const others = world.actors.filter(b => b !== a && !b.dead && b.spawnT <= 0 && b.team === 'enemy');
    if (others.length && (a.ai.confT = (a.ai.confT || 0) - 1 / 60) < 0) { a.ai.confT = 1; a.ai.confTarget = others[Math.floor(world.rand() * others.length)]; }
    if (a.ai.confTarget && !a.ai.confTarget.dead) return a.ai.confTarget;
  }
  let best = null, bd = 1e9;
  for (const b of world.actors) {
    if (b.dead || b.team === 'enemy' || b.spawnT > 0 || b.untargetable) continue;
    const d = Math.hypot(b.x - a.x, b.y - a.y) * (b.team === 'ally' ? 1.3 : 1) * (b.decoy ? 0.7 : 1);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function attackersBusy(world) {
  let n = 0;
  for (const b of world.actors) if (b.team === 'enemy' && !b.dead && b.action && !b.boss) n++;
  return n;
}

// Generic wild/trainer Pokémon brain driven by its moveset.
export function wildBrain(world, a, dt) {
  const ai = a.ai || (a.ai = { cool: 0.3 + world.rand() * 0.6, strafe: world.rand() < 0.5 ? -1 : 1, strafeT: 0, wander: 0, think: 0 });
  ai.cool -= dt; ai.strafeT -= dt; ai.think -= dt;
  const tgt = pickTarget(world, a);
  if (!tgt) { a.vx = a.vy = 0; return; }
  const dx = tgt.x - a.x, dy = tgt.y - a.y, d = Math.hypot(dx, dy) || 1;
  const mode = world.moveMode(a);
  const los = world.lineClear(a.x, a.y - 4, tgt.x, tgt.y - 4, 'shot');
  const inWall = mode === 'ghost' && world.blocked(a.x, a.y, 'walk'); // ghosts drift through walls but never lurk inside one
  // choose the move we're working toward
  if (!ai.move || ai.think <= 0 || (a.cds[ai.move] || 0) > 0) {
    ai.think = 1.2;
    const ready = a.moves.filter(m => (a.cds[m] || 0) <= 0);
    const scored = ready.map(m => {
      const p = profile(m);
      let s = p.damaging ? 1 + p.power / 60 : 0.45;
      if (!p.damaging && (p.kind === 'buff' || p.kind === 'heal') && a.usedBuff?.[m]) s *= 0.15;
      if (p.kind === 'heal' && a.hp > a.maxHp * 0.5) s = 0;
      if (p.melee && d > 90) s *= 0.6;
      if (!p.melee && d < 30) s *= 0.7;
      return [m, s * (0.6 + world.rand() * 0.8)];
    }).filter(x => x[1] > 0).sort((x, y) => y[1] - x[1]);
    ai.move = scored[0]?.[0] || null;
  }
  const p = ai.move ? profile(ai.move) : null;
  // ranged moves are used from their full reach (enemy shots live longer to match); lunges start further out
  const lunge = p && (p.kind === 'lunge' || p.kind === 'charge');
  const range = !p ? 60 : lunge ? Math.max(18, ((p.dist || 30) + p.range) * 0.8) : Math.max(18, p.range * (p.melee ? 0.9 : 1.05));
  const sp = moveSpeed(a) * (a.elite ? 1.1 : 1);
  const ranged = p && !p.melee && p.kind !== 'nova' && p.kind !== 'debuff' && !(p.kind === 'cloud' && p.at === 'self');
  const wantD = ranged ? Math.min(range * 0.8, 150) : range * 0.6;
  // attack if we can
  const busy = attackersBusy(world);
  const maxBusy = a.maxBusy ?? world.maxAttackers ?? 2;
  if (p && ai.cool <= 0 && d < range + tgt.r && (los || mode === 'ghost' && p.kind !== 'proj') && !inWall && busy < maxBusy && !a.status.trap) {
    let aim = Math.atan2(dy, dx);
    if (p.kind === 'proj' && !p.homing && !p.lob) { // lead the target a little
      const t = d / (p.speed || 200) * 0.5;
      aim = Math.atan2(dy + (tgt.vy || 0) * t, dx + (tgt.vx || 0) * t);
    }
    if (a.confused) aim += (world.rand() - 0.5) * 1.6;
    world.useMove(a, ai.move, { aim, target: tgt, slot: 'enemy' });
    a.cds[ai.move] = (p.cd || 0.6) * 1.5 + (p.damaging ? 0.6 : 3);
    if (!p.damaging) { a.usedBuff ??= {}; a.usedBuff[ai.move] = true; }
    ai.cool = (a.coolBase ?? 1.1) * (0.7 + world.rand() * 0.8) * (a.elite ? 0.75 : 1);
    ai.move = null;
    a.vx = a.vy = 0;
    return;
  }
  // movement
  let mx = 0, my = 0;
  if (d > wantD + 8 || !los || inWall) {
    if (los || mode === 'ghost') { mx = dx / d; my = dy / d; }
    else { const f = world.flowDir(a.x, a.y); if (f) { mx = f.x; my = f.y; } else { mx = dx / d; my = dy / d; } }
  } else if (d < wantD - 16 && ranged) { mx = -dx / d; my = -dy / d; }
  // strafe around the target when in range
  if (d < wantD + 30 && los && !inWall) {
    if (ai.strafeT <= 0) { ai.strafeT = 1 + world.rand() * 1.5; if (world.rand() < 0.4) ai.strafe *= -1; }
    mx += (-dy / d) * ai.strafe * 0.7; my += (dx / d) * ai.strafe * 0.7;
  }
  if (a.flying) { mx += Math.cos(world.time * 3 + a.id) * 0.25; my += Math.sin(world.time * 2.3 + a.id) * 0.25; }
  // unstick: wanting to move but barely moving for 0.4s -> flip the strafe and follow the path field for a moment
  ai.stuckT = (ai.stuckT || 0) + dt; ai.lx ??= a.x; ai.ly ??= a.y;
  if (ai.stuckT >= 0.4) {
    if (Math.hypot(mx, my) > 0.1 && Math.hypot(a.x - ai.lx, a.y - ai.ly) < 1.5 && !a.flying && mode !== 'ghost') { ai.strafe *= -1; ai.think = 0; ai.flowT = 0.6; }
    ai.stuckT = 0; ai.lx = a.x; ai.ly = a.y;
  }
  if (ai.flowT > 0) { ai.flowT -= dt; const f = world.flowDir(a.x, a.y); if (f) { mx = f.x; my = f.y; } }
  const l = Math.hypot(mx, my);
  if (l > 0.01) { a.vx = (mx / l) * sp; a.vy = (my / l) * sp; } else { a.vx = a.vy = 0; }
  // face the target while strafing
  if (d < wantD + 40) { a.lockFacing = true; a.facing = Math.atan2(dy, dx); } else a.lockFacing = false;
}

// Assist Pokémon (the player's partner via Call): hunt the nearest enemy with its moves.
export function allyBrain(world, a, dt) {
  const ai = a.ai || (a.ai = { cool: 0.2 });
  ai.cool -= dt;
  let tgt = null, bd = 1e9;
  for (const b of world.enemies()) { if (b.spawnT > 0 || b.untargetable) continue; const d = Math.hypot(b.x - a.x, b.y - a.y); if (d < bd) { bd = d; tgt = b; } }
  const pl = world.player;
  if (!tgt) { // follow the player
    const d = Math.hypot(pl.x - a.x, pl.y - a.y);
    if (d > 30) {
      let dir = { x: (pl.x - a.x) / d, y: (pl.y - a.y) / d };
      if (!a.flying && !world.lineClear(a.x, a.y, pl.x, pl.y, 'walk')) dir = world.flowDir(a.x, a.y) || dir; // around walls, not through them
      const sp = moveSpeed(a); a.vx = dir.x * sp; a.vy = dir.y * sp;
    } else a.vx = a.vy = 0;
    return;
  }
  const moves = a.moves.filter(m => profile(m).damaging);
  const m = moves.sort((x, y) => (a.cds[x] || 0) - (a.cds[y] || 0))[0] || a.moves[0];
  const p = profile(m);
  const range = Math.max(20, p.range * 0.8);
  if (bd < range + tgt.r && ai.cool <= 0 && (a.cds[m] || 0) <= 0) {
    world.useMove(a, m, { aim: Math.atan2(tgt.y - a.y, tgt.x - a.x), target: tgt, slot: 'assist', windup: 0.05 });
    a.cds[m] = (p.cd || 0.5) * 1.2 + 0.2; ai.cool = 0.25;
    a.vx = a.vy = 0; return;
  }
  const sp = moveSpeed(a) * 1.3;
  const d = bd || 1;
  let dir = { x: (tgt.x - a.x) / d, y: (tgt.y - a.y) / d };
  if (!a.flying && !world.lineClear(a.x, a.y, tgt.x, tgt.y, 'walk')) dir = world.flowDir(a.x, a.y) || dir;
  a.vx = dir.x * sp; a.vy = dir.y * sp;
  if (bd < range * 0.6) a.vx = a.vy = 0;
}
