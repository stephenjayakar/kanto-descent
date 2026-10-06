// Player controller: movement, dash, Attack / Special / Cast, Poké Ball throws and the partner Call.
import { Input } from '../engine/input.js';
import { profile } from './moves_rt.js';
import { moveSpeed, angDiff, setAnim, makeActor } from './combat.js';
import { allyBrain, enemyMoves } from './ai.js';
import { D } from './data.js';
import { Sound } from '../audio/sound.js';

export const DASH_DIST = 54, DASH_TIME = 0.13;

export function playerBrain(world, a, dt) {
  const run = a.run || world.run; // co-op: P2 has its own run (moves, blessings, partner)
  const I = a.input || Input; // co-op: P2 is driven by the guest's remote input
  const slots = a.slots || run.slots;
  const pc = a.pc || (a.pc = { dashLeft: a.dashCharges, dashT: 0, combo: 0, comboT: 0, lastDash: -9, castT: 0 });
  // dash recharge
  if (pc.dashLeft < a.dashCharges) { pc.dashT += dt; if (pc.dashT >= a.dashRecharge) { pc.dashT = 0; pc.dashLeft++; } }
  pc.comboT -= dt;
  const mv = I.move;
  const sp = moveSpeed(a);
  if (a.status.confuse) { const t = world.time * 3; mv.x += Math.cos(t) * 0.6; mv.y += Math.sin(t * 1.3) * 0.6; }
  a.vx = mv.x * sp; a.vy = mv.y * sp;
  a.lockFacing = false;

  const aim = playerAim(world, a);
  if (a === world.player) world.playerAim = () => playerAim(world, a);

  // dash (also cancels recovery)
  if (I.pressed('dash') && pc.dashLeft > 0 && !a.status.trap) {
    I.consume('dash');
    pc.dashLeft--; pc.dashT = 0; pc.lastDash = world.time;
    const ang = (mv.x || mv.y) ? Math.atan2(mv.y, mv.x) : a.facing;
    a.facing = ang;
    world.cancelAction(a);
    a.action = {
      p: { kind: 'dash' }, stage: 'active', t: 0, dur: DASH_TIME, canMove: false, hits: new Set(), uninterruptible: true,
      vx: Math.cos(ang) * DASH_DIST / DASH_TIME, vy: Math.sin(ang) * DASH_DIST / DASH_TIME,
    };
    a.dashing = true; a.noCollide = true; a.iframes = Math.max(a.iframes, DASH_TIME + 0.08);
    setAnim(a, 'Walk', true);
    world.vfx.push({ kind: 'dust', x: a.x, y: a.y, t: 0, life: 0.3 });
    Sound.playSE('se_m_double_team');
    world.hooks.onDash?.(world, a);
    return;
  }
  const busy = a.action && a.action.stage !== 'recover';
  if (busy) return;

  const tryUse = (slot) => {
    const key = slots[slot];
    if (!key) return false;
    const p = profile(key);
    const cdKey = 'slot_' + slot;
    if ((a.cds[cdKey] || 0) > 0) return false;
    let opts = { aim, slot };
    // auto target for strikes/clouds: the enemy nearest the aim line, else a point ahead
    if (p.kind === 'strike' || (p.kind === 'cloud' && p.at === 'target') || p.lob) {
      const t = aimTarget(world, a, aim, 170);
      opts.targetPt = t ? { x: t.x, y: t.y } : (I.mouseAiming() && I.mouseWorld ? { ...I.mouseWorld } : { x: a.x + Math.cos(aim) * 70, y: a.y + Math.sin(aim) * 70 });
      opts.target = t;
    }
    // combos for the Attack button
    let comboStep = 0, finisher = false;
    if (slot === 'attack' && (p.combo || 1) > 1) {
      if (pc.comboT > 0) pc.combo = (pc.combo + 1) % p.combo; else pc.combo = 0;
      comboStep = pc.combo; finisher = pc.combo === p.combo - 1;
      pc.comboT = 0.45;
    }
    const dashStrike = world.time - pc.lastDash < 0.25 && slot === 'attack';
    const act = world.useMove(a, key, { ...opts, comboStep });
    act.finisher = finisher;
    if (finisher) act.scaleMul = 1.5;
    if (dashStrike) { act.scaleMul = (act.scaleMul || 1) * 1.3; world.text(a, 'DASH STRIKE', '#ffe080', true, 0.4); }
    // attack cooldown is the move's own; Special and Cast use longer slot cooldowns
    const cd = slot === 'attack' ? (p.cd || 0.25) : slot === 'special' ? Math.max(0.35, (p.cd || 0.6) * 1.2) : 4;
    a.cds[cdKey] = cd * (a.cdMul?.[slot] || 1);
    a.cdMax ??= {}; a.cdMax[cdKey] = a.cds[cdKey];
    if (slot === 'cast') world.hooks.onCast?.(world, a);
    return true;
  };

  if (I.down('attack') || I.pressed('attack')) { if (tryUse('attack')) { I.consume('attack'); return; } }
  if (I.down('special') || I.pressed('special')) { if (tryUse('special')) { I.consume('special'); return; } }
  if (I.pressed('cast')) { if (tryUse('cast')) { I.consume('cast'); return; } }
  if (I.pressed('ball') && !world.noBalls) { I.consume('ball'); throwBall(world, a, aim); return; }
  if (I.pressed('call')) { I.consume('call'); callPartner(world, a); return; }
}


export function playerAim(world, a) {
  const I = a.input || Input;
  if (I.aim) return Math.atan2(I.aim.y, I.aim.x);
  if (I.mouseAiming() && I.mouseWorld) return Math.atan2(I.mouseWorld.y - (a.y - 6), I.mouseWorld.x - a.x);
  let ang = (I.move.x || I.move.y) ? Math.atan2(I.move.y, I.move.x) : a.facing;
  // soft auto-aim toward the nearest foe close to the aim direction
  const t = aimTarget(world, a, ang, 150, 0.6);
  if (t) ang = Math.atan2(t.y - a.y, t.x - a.x);
  return ang;
}

function aimTarget(world, a, ang, range, cone = 0.9) {
  let best = null, bs = 1e9;
  for (const e of world.enemies()) {
    if (e.spawnT > 0 || e.untargetable) continue;
    const d = Math.hypot(e.x - a.x, e.y - a.y); if (d > range) continue;
    const da = Math.abs(angDiff(ang, Math.atan2(e.y - a.y, e.x - a.x)));
    if (da > cone) continue;
    const s = d * (1 + da * 2);
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}

// ---- Poké Balls: weaken a wild Pokémon and throw (R). A catch makes it your partner.
function throwBall(world, a, aim) {
  const run = world.run; // POKé BALLS are shared in co-op
  if (run.balls <= 0) { world.text(a, 'No POKé BALLS!', '#ffffff'); Sound.playSE('se_failure'); return; }
  run.balls--;
  Sound.playSE('se_ball_throw');
  const t = aimTarget(world, a, aim, 160, 0.7);
  const to = t ? { x: t.x, y: t.y } : { x: a.x + Math.cos(aim) * 90, y: a.y + Math.sin(aim) * 90 };
  world.balls ??= [];
  world.balls.push({ x: a.x, y: a.y - 8, from: { x: a.x, y: a.y - 8 }, to, target: t, t: 0, life: 0.45, ball: run.ballType || 'poke_ball', state: 'fly', by: a });
}

export function updateBalls(world, dt) {
  if (!world.balls) return;
  for (const b of world.balls) {
    b.t += dt;
    if (b.state === 'fly') {
      const k = Math.min(1, b.t / b.life);
      b.x = b.from.x + (b.to.x - b.from.x) * k; b.y = b.from.y + (b.to.y - b.from.y) * k - Math.sin(k * Math.PI) * 28;
      if (k >= 1) {
        const e = b.target && !b.target.dead ? b.target : world.enemies().find(e => Math.hypot(e.x - b.to.x, e.y - b.to.y) < e.r + 8);
        if (!e || e.boss || e.trainerMon || e.spawnT > 0 || e.captured) {
          b.state = 'miss'; b.t = 0; Sound.playSE('se_ball_bounce_1');
          if (e && (e.boss || e.trainerMon)) world.text(e, e.boss ? "It dodged the ball!" : "Can't catch a trainer's POKéMON!", '#ffffff');
          continue;
        }
        b.state = 'shake'; b.t = 0; b.target = e; b.x = e.x; b.y = e.y - 4;
        b.shakes = catchShakes(world, e, b.ball); // status bonuses count, so read them first
        world.cancelAction(e); e.captured = true; e.untargetable = true; e.vx = e.vy = 0; e.status = {}; e.confused = false;
        Sound.playSE('se_ball_open');
      }
    } else if (b.state === 'shake') {
      const e = b.target;
      const n = Math.floor(b.t / 0.55);
      if (n > (b.lastShake ?? -1) && n >= 1 && n <= Math.min(3, b.shakes)) { b.lastShake = n; Sound.playSE('se_ball'); }
      if (b.shakes < 4 && b.t > 0.55 * (b.shakes + 1)) { // breaks free
        e.captured = false; e.untargetable = false; e.stun = 0.4; world.text(e, 'Oh no! It broke free!', '#ffffff');
        world.vfx.push({ kind: 'sendout', x: b.x, y: b.y + 4, t: 0, life: 0.45, ball: b.ball }); // the ball bursts open (visual only)
        Sound.playSE('se_ball_open'); b.dead = true;
      } else if (b.shakes >= 4 && b.t > 2.0) {
        Sound.playSE('se_ball_click');
        b.dead = true;
        world.emit({ type: 'catch', actor: e, ball: b.ball, by: b.by });
        e.dead = true; e.deathT = 9; e.hp = 0;
        if (!world.enemies().length) world.slowmo = 0.5;
      }
    } else if (b.state === 'miss') { if (b.t > 0.5) b.dead = true; }
  }
  world.balls = world.balls.filter(b => !b.dead);
}

// Gen 3 catch formula -> number of successful shakes (4 = caught)
function catchShakes(world, e, ball) {
  const ballMul = { poke_ball: 1, great_ball: 1.5, ultra_ball: 2, master_ball: 255 }[ball] || 1;
  const statusMul = e.status.sleep || e.status.freeze ? 2 : (e.status.para || e.status.burn || e.status.poison || e.status.toxic) ? 1.5 : 1;
  const rate = (e.catchRate || 45) * (world.run?.catchMul || 1);
  const x = Math.floor(((3 * e.maxHp - 2 * e.hp) * rate * ballMul) / (3 * e.maxHp)) * statusMul;
  if (x >= 255) return 4;
  const y = Math.floor(1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(16711680 / x))))));
  let s = 0;
  for (let i = 0; i < 4; i++) { if (Math.floor(world.rand() * 65536) < y) s++; else break; }
  return s;
}

// ---- partner Call (F): your caught partner fights at your side for a while.
function callPartner(world, a) {
  const run = a.run || world.run;
  if (!run.partner) { world.text(a, 'No partner yet! Catch one with R', '#ffffff', true); Sound.playSE('se_failure'); return; }
  if (run.callGauge < 1) { world.text(a, 'Call gauge not full', '#ffffff', true); Sound.playSE('se_failure'); return; }
  if (world.actors.some(x => x.team === 'ally' && !x.dead && (x.owner || world.player) === a)) return; // one partner out per player
  run.callGauge = 0;
  const pt = run.partner;
  const lvl = Math.max(pt.level, run.level - 2);
  const ally = makeActor(pt.species, lvl, 'ally', { x: a.x + Math.cos(a.facing) * 18, y: a.y + Math.sin(a.facing) * 18, moves: enemyMoves(pt.species, lvl), hpMul: 3 });
  ally.owner = a; ally.brain = allyBrain; ally.lifeT = 10 + (run.callBonus || 0); ally.spawnT = 0.35; ally.iframes = 99; ally.dmgMul = 0.8 + (run.callPower || 0);
  ally.ghost = false; // like the player, a partner never phases through walls (flyers still cross water)
  if (world.collides(ally.x, ally.y, 6, 'walk') || world.crossesEdge(a.x, a.y, ally.x, ally.y, 6, 'walk') || !world.lineClear(a.x, a.y, ally.x, ally.y, 'walk')) { ally.x = a.x; ally.y = a.y; }
  world.add(ally);
  world.vfx.push({ kind: 'sendout', x: ally.x, y: ally.y, t: 0, life: 0.5 });
  Sound.playSE('se_ball_open');
  Sound.playCry(pt.species);
  world.text(ally, `Go! ${D.species[pt.species].name}!`, '#ffffff');
}

export function updateAllies(world, dt) {
  for (const x of world.actors) if (x.team === 'ally' && !x.dead && x.spawnT <= 0) {
    x.lifeT -= dt;
    if (x.lifeT <= 0) { x.dead = true; x.deathT = 9; world.vfx.push({ kind: 'sendout', x: x.x, y: x.y, t: 0, life: 0.4, recall: true, dex: x.dex, dir: x.dir, scale: x.scale }); Sound.playSE('se_ball_tray_exit'); }
  }
}
