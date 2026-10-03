// Legendary boons (the Hades god boons). Each legendary offers boons for a slot:
// attack / special / dash / cast / passive. One boon per slot (a new one replaces the old).
// Rarity uses ball tiers: POKé (common) < GREAT < ULTRA < MASTER (duo boons).
// Values scale with rarity and with PP Ups (boon level).
import { Sound } from '../audio/sound.js';
import { profile } from './moves_rt.js';
import { moveSpeed } from './combat.js';

export const LEGENDS = {
  ZAPDOS: { dex: 145, name: 'ZAPDOS', type: 'ELECTRIC', color: '#f8d030', cry: 'zapdos', title: 'Lord of Thunder' },
  ARTICUNO: { dex: 144, name: 'ARTICUNO', type: 'ICE', color: '#98d8f8', cry: 'articuno', title: 'Freezing Wings' },
  MOLTRES: { dex: 146, name: 'MOLTRES', type: 'FIRE', color: '#f88030', cry: 'moltres', title: 'Flame Eternal' },
  MEW: { dex: 151, name: 'MEW', type: 'PSYCHIC', color: '#f8a8d0', cry: 'mew', title: 'The Playful Ancestor' },
  LUGIA: { dex: 249, name: 'LUGIA', type: 'FLYING', color: '#a8c8f8', cry: 'lugia', title: 'Guardian of the Sea' },
  HOOH: { dex: 250, name: 'HO-OH', type: 'FIRE', color: '#f8c040', cry: 'ho_oh', title: 'Rainbow Phoenix' },
  DEOXYS: { dex: 386, name: 'DEOXYS', type: 'PSYCHIC', color: '#d050a0', cry: 'deoxys', title: 'Visitor from Space' },
};
export const RARITY = [
  { key: 'poke', name: 'POKé', color: '#f0f0f0', ball: 'poke_ball', mult: 1 },
  { key: 'great', name: 'GREAT', color: '#60a0ff', ball: 'great_ball', mult: 1.35 },
  { key: 'ultra', name: 'ULTRA', color: '#f8d030', ball: 'ultra_ball', mult: 1.7 },
  { key: 'master', name: 'MASTER', color: '#c070f0', ball: 'master_ball', mult: 2 },
];
export const SLOT_NAMES = { attack: 'ATTACK', special: 'SPECIAL', dash: 'DASH', cast: 'CAST', passive: 'PASSIVE' };

// v(b, base) = value scaled by rarity and PP-up level
const v = (b, base, per = 0.25) => { const x = base * RARITY[b.rarity].mult * (1 + per * (b.level - 1)); return base >= 5 ? Math.round(x) : Math.round(x * 100) / 100; };
const pct = x => Math.round(x * 100) + '%';

// helper: is a hit from this slot?
const fromSlot = (info, slot) => info.slot === slot && info.src?.team === 'player';
// on-hit procs are limited to once per target per 0.25s (stream moves would proc 10x a second otherwise)
const procOk = (w, info, key, cd = 0.25) => { const t = info.target; t._proc ??= {}; if ((t._proc[key] || -9) + cd > w.time) return false; t._proc[key] = w.time; return true; };
// same limiter keyed on an actor (for hooks without a hit info: onSlam, onKill, onTick)
const cdOk = (w, e, key, cd) => { e._proc ??= {}; if ((e._proc[key] || -9) + cd > w.time) return false; e._proc[key] = w.time; return true; };
// a fake player-team source at a point (on-death bursts): uses the player's stats
const ghostSrc = (w, at) => ({ x: at.x, y: at.y, team: 'player', level: w.player.level, stats: w.player.stats, stages: w.player.stages, status: {}, types: w.player.types });
const dmgUp = (info, x) => { info.dmg = Math.round(info.dmg * (1 + x)); };
// boons that call down lightning (prerequisites for the lightning upgrades)
const LIGHTNING = ['Z_ATTACK', 'Z_CAST', 'Z_STATIC', 'Z_JOLT', 'Z_CALL'];

export const BOONS = {
  // ---------------- ZAPDOS
  Z_ATTACK: { legend: 'ZAPDOS', slot: 'attack', name: 'Thunder Fang', desc: b => `Your Attack calls down lightning on foes for ${v(b, 15)} power.`,
    onHit: (w, info, b) => { if (fromSlot(info, 'attack') && !info.p.boonProc && procOk(w, info, 'zf')) w.boonStrike(info.target, { power: v(b, 15), type: 'ELECTRIC', fx: 'lightning', status: b.has('Z_PARA_UP') ? 'para' : null, chance: 0.15 }); } },
  Z_SPECIAL: { legend: 'ZAPDOS', slot: 'special', name: 'Discharge', desc: b => `Your Special arcs to ${Math.round(v(b, 2, 0.5))} more foes for ${v(b, 25)} power.`,
    onHit: (w, info, b) => { if (fromSlot(info, 'special') && !info.p.boonProc && procOk(w, info, 'zd', 0.4)) w.boonChain(info.target, { power: v(b, 25), jumps: Math.round(v(b, 2, 0.5)) }); } },
  Z_DASH: { legend: 'ZAPDOS', slot: 'dash', name: 'Volt Switch', desc: b => `Your Dash zaps nearby foes for ${v(b, 25)} power.`,
    onDash: (w, a, b) => w.boonNova(a, { power: v(b, 25), type: 'ELECTRIC', r: 30, fx: 'spark', delay: 0.15 }) },
  Z_CAST: { legend: 'ZAPDOS', slot: 'cast', name: 'Thunder Cloud', desc: b => `Your Cast also strikes ${Math.round(v(b, 3, 0.4))} foes with Thunder (${v(b, 50)} power).`,
    onCast: (w, a, b) => { const n = Math.round(v(b, 3, 0.4)); w.enemies().sort(() => w.rand() - 0.5).slice(0, n).forEach((e, i) => w.boonStrike(e, { power: v(b, 50), type: 'ELECTRIC', fx: 'lightning', delay: 0.35 + i * 0.1, status: 'para', chance: 0.5 })); } },
  Z_STATIC: { legend: 'ZAPDOS', slot: 'passive', name: 'Static', desc: b => `When hit, shock the attacker for ${v(b, 40)} power and paralyze it.`,
    onHurt: (w, ctx, b) => { if (ctx.src && ctx.src.team === 'enemy' && !ctx.src.dead) w.boonStrike(ctx.src, { power: v(b, 40), type: 'ELECTRIC', fx: 'lightning', status: 'para', chance: 1, delay: 0.05 }); } },
  Z_PARA_UP: { legend: 'ZAPDOS', slot: 'passive', name: 'Paralysis Pulse', req: ['Z_ATTACK', 'Z_SPECIAL', 'Z_CAST', 'Z_STATIC'], desc: b => `Paralyzed foes take +${pct(v(b, 0.25, 0.2))} damage. Thunder Fang may paralyze.`,
    beforeHit: (w, info, b) => { if (info.target.status.para && info.src?.team !== 'enemy') info.dmg = Math.round(info.dmg * (1 + v(b, 0.25, 0.2))); } },
  Z_CHARGE: { legend: 'ZAPDOS', slot: 'passive', name: 'Charge', desc: b => `ELECTRIC damage you deal +${pct(v(b, 0.2, 0.2))}.`,
    beforeHit: (w, info, b) => { if (info.p.type === 'ELECTRIC' && info.src?.team !== 'enemy') info.dmg = Math.round(info.dmg * (1 + v(b, 0.2, 0.2))); } },
  // Hades' Jolted: a marked foe zaps itself when it starts its next attack
  Z_JOLT: { legend: 'ZAPDOS', slot: 'passive', name: 'Electrify', desc: b => `Your hits Electrify foes for 4s. When an Electrified foe starts an attack, lightning strikes it for ${v(b, 35)} power.`,
    onHit: (w, info, b) => { if (info.src === w.player && !info.p.boonProc && info.dmg > 0 && !info.target.dead) info.target._jolt = w.time + 4; },
    onTick: (w, b) => { for (const e of w.enemies()) if (e._jolt > w.time && e.action?.stage === 'windup' && e.spawnT <= 0 && !((e._joltCd || 0) > w.time)) { e._jolt = 0; e._joltCd = w.time + 1; w.boonStrike(e, { power: v(b, 35), type: 'ELECTRIC', fx: 'lightning', delay: 0.05 }); } } },
  Z_FORK: { legend: 'ZAPDOS', slot: 'passive', name: 'Forked Lightning', req: LIGHTNING, desc: b => `Your lightning bolts fork to another foe nearby for ${v(b, 20)} power.`,
    onHit: (w, info, b) => { if (info.src !== w.player || !info.p.boonProc || info.p.fx !== 'lightning' || !procOk(w, info, 'zfork', 0.5)) return; const t = info.target; let nb = null, nd = 70; for (const e of w.enemies()) { if (e === t || e.spawnT > 0 || e.untargetable) continue; const d = Math.hypot(e.x - t.x, e.y - t.y); if (d < nd) { nd = d; nb = e; } } if (nb) { w.vfx.push({ kind: 'bolt', x0: t.x, y0: t.y - 8, x1: nb.x, y1: nb.y - 8, t: 0, life: 0.18 }); w.boonStrike(nb, { power: v(b, 20), type: 'ELECTRIC', fx: 'spark', delay: 0.04 }); } } },
  Z_VOLTAGE: { legend: 'ZAPDOS', slot: 'passive', name: 'Zap Cannon', req: LIGHTNING, desc: b => `Your lightning strikes are ${pct(v(b, 0.4, 0.2))} wider and deal +${pct(v(b, 0.2, 0.2))} damage.`,
    stat: (p, b) => { p.boltR = Math.max(p.boltR || 1, 1 + v(b, 0.4, 0.2)); },
    beforeHit: (w, info, b) => { if (info.src === w.player && info.p.boonProc && info.p.fx === 'lightning') info.dmg = Math.round(info.dmg * (1 + v(b, 0.2, 0.2))); } },
  Z_TERRAIN: { legend: 'ZAPDOS', slot: 'cast', name: 'Electric Terrain', desc: b => `Your Cast electrifies the ground around you for ${v(b, 4, 0.2)}s: foes on it take ${v(b, 18)} power every 0.6s and may be Paralyzed.`,
    onCast: (w, a, b) => { const z = w.addZone({ owner: a, x: a.x, y: a.y, r: 44, dur: v(b, 4, 0.2), team: 'player', tick: 0.6, p: w.boonProfile('ELECTRIC', v(b, 18), { fx: 'spark' }), dmgFrac: 1, status: { kind: 'para', chance: 0.2 }, fxColor: 'rgba(248,208,48,0.16)' }); z.follow = a; Sound.playSE('se_m_thunderbolt'); } },
  // Hades' Clouded Judgment: the partner Call gauge fills faster (and your partner joins the storm)
  Z_CALL: { legend: 'ZAPDOS', slot: 'passive', name: 'Thunder Call', desc: b => `Your partner's Call gauge fills ${pct(v(b, 0.5, 0.25))} faster, and your partner's hits call down lightning (${v(b, 25)} power).`,
    onHit: (w, info, b) => {
      const s = info.src;
      if (s === w.player && b.run && info.dmg > 0) b.run.callGauge = Math.min(1, b.run.callGauge + info.dmg / (info.target.maxHp * 6) * v(b, 0.5, 0.25));
      else if (s?.team === 'ally' && (s.owner || w.player) === w.player && !info.p.boonProc && procOk(w, info, 'zcall', 0.6)) w.boonStrike(info.target, { power: v(b, 25), type: 'ELECTRIC', fx: 'lightning' });
    } },

  // ---------------- ARTICUNO
  A_ATTACK: { legend: 'ARTICUNO', slot: 'attack', name: 'Frost Fang', desc: b => `Your Attack inflicts Chill. 5 Chill freezes a foe. +${pct(v(b, 0.1, 0.3))} damage.`,
    beforeHit: (w, info, b) => { if (fromSlot(info, 'attack')) info.dmg = Math.round(info.dmg * (1 + v(b, 0.1, 0.3))); },
    onHit: (w, info, b) => { if (fromSlot(info, 'attack') && procOk(w, info, 'af')) w.addStatus(info.target, 'chill', info.src, { stacks: info.finisher ? 2 : 1 }); } },
  A_SPECIAL: { legend: 'ARTICUNO', slot: 'special', name: 'Ice Shard', desc: b => `Your Special inflicts 2 Chill and deals +${pct(v(b, 0.15, 0.3))} damage.`,
    beforeHit: (w, info, b) => { if (fromSlot(info, 'special')) info.dmg = Math.round(info.dmg * (1 + v(b, 0.15, 0.3))); },
    onHit: (w, info, b) => { if (fromSlot(info, 'special') && procOk(w, info, 'as', 0.4)) w.addStatus(info.target, 'chill', info.src, { stacks: 2 }); } },
  A_DASH: { legend: 'ARTICUNO', slot: 'dash', name: 'Mist Step', desc: b => `Your Dash leaves freezing mist that chills foes for ${v(b, 2, 0.3)}s.`,
    onDash: (w, a, b) => w.addZone({ owner: a, x: a.x, y: a.y, r: 22, dur: v(b, 2, 0.3), team: 'player', tick: 0.4, onEnter: (w2, e) => w2.addStatus(e, 'chill', a), sprite: 'mist', fxColor: '#c8f0ff' }) },
  A_CAST: { legend: 'ARTICUNO', slot: 'cast', name: 'Sheer Cold', desc: b => `Your Cast releases a blast that adds ${Math.round(v(b, 3, 0.3))} Chill to all nearby foes.`,
    onCast: (w, a, b) => { w.vfx.push({ kind: 'ring', x: a.x, y: a.y, r0: 6, r1: 70, t: 0, life: 0.4, fx: 'ice' }); for (const e of w.enemies()) if (Math.hypot(e.x - a.x, e.y - a.y) < 74) w.addStatus(e, 'chill', a, { stacks: Math.round(v(b, 3, 0.3)) }); } },
  A_ICEBODY: { legend: 'ARTICUNO', slot: 'passive', name: 'Ice Body', req: ['A_ATTACK', 'A_SPECIAL', 'A_DASH', 'A_CAST'], desc: b => `Freezing a foe restores ${pct(v(b, 0.02, 0.3))} of your HP.`,
    onFreeze: (w, e, b) => w.heal(w.player, Math.max(1, Math.round(w.player.maxHp * v(b, 0.02, 0.3)))) },
  A_SHATTER: { legend: 'ARTICUNO', slot: 'passive', name: 'Shatter', req: ['A_ATTACK', 'A_SPECIAL', 'A_DASH', 'A_CAST'], desc: b => `Frozen foes that faint explode for ${v(b, 50)} ICE power.`,
    onKill: (w, e, b) => { if (e.status.freeze || (e.wasFrozen && w.time - e.wasFrozen < 0.2)) w.boonNova({ x: e.x, y: e.y, team: 'player', level: w.player.level, stats: w.player.stats, stages: w.player.stages, status: {}, types: w.player.types }, { power: v(b, 50), type: 'ICE', r: 36, fx: 'ice', status: 'chill', delay: 0.05 }); } },
  A_MIST: { legend: 'ARTICUNO', slot: 'passive', name: 'Mist Veil', desc: b => `Take ${pct(Math.min(0.5, v(b, 0.15, 0.25)))} less damage from Chilled or Frozen foes.`,
    beforeHurt: (w, ctx, b) => { if (ctx.src && (ctx.src.status.chill || ctx.src.status.freeze)) ctx.dmg = Math.round(ctx.dmg * (1 - Math.min(0.5, v(b, 0.15, 0.25)))); } },
  // Hades' Killing Freeze: the last foe standing is chilled (and here, softened up)
  A_HAIL: { legend: 'ARTICUNO', slot: 'passive', name: 'Hail', desc: b => `When only one foe remains, hail Chills it every second and it takes +${pct(v(b, 0.12, 0.25))} damage from you (half against bosses).`,
    onTick: (w, b) => {
      const es = w.enemies().filter(e => e.spawnT <= 0 && !e.untargetable && !e.captured);
      w._hailOne = es.length === 1 ? es[0] : null;
      if (!w._hailOne) { w._hailT = w.time + 0.5; return; }
      if (w.time >= (w._hailT || 0)) { w._hailT = w.time + 1; w.addStatus(w._hailOne, 'chill', w.player); w.vfx.push({ kind: 'ring', x: w._hailOne.x, y: w._hailOne.y, r0: 18, r1: 4, t: 0, life: 0.3, fx: 'ice' }); }
    },
    beforeHit: (w, info, b) => { if (info.src === w.player && info.target === w._hailOne) dmgUp(info, v(b, 0.12, 0.25) * (info.target.boss ? 0.5 : 1)); } },
  // Hades' Snow Burst on Call: your partner arrives in a burst of snow and chills what it hits
  A_POWDER: { legend: 'ARTICUNO', slot: 'passive', name: 'Powder Snow', desc: b => `When you Call your partner it lands in a snow burst (${v(b, 30)} power, 3 Chill), and its hits Chill foes.`,
    onTick: (w, b) => { for (const x of w.actors) if (x.team === 'ally' && !x.dead && !x._snowed && x.spawnT <= 0 && (x.owner || w.player) === w.player) { x._snowed = true; w.boonNova(x, { power: v(b, 30), type: 'ICE', r: 50, fx: 'ice', status: 'chill', delay: 0.02, src: w.player }); w.later(0.06, () => { for (const e of w.enemies()) if (Math.hypot(e.x - x.x, e.y - x.y) < 54) w.addStatus(e, 'chill', w.player, { stacks: 2 }); }); } },
    onHit: (w, info) => { const s = info.src; if (s?.team === 'ally' && (s.owner || w.player) === w.player && procOk(w, info, 'apow', 0.4)) w.addStatus(info.target, 'chill', w.player); } },
  // Hades' Rare Crop: other blessings grow stronger as the run goes on
  A_NEVERMELT: { legend: 'ARTICUNO', slot: 'passive', name: 'Never-Melt Ice', desc: b => `Now and at the start of each new area, ${Math.round(v(b, 1, 0.5))} random other blessing(s) gain a level.`,
    onGain: (run, b) => { const me = run.boons.find(x => x.key === b.key); if (me) me.meltBiome = run.biome; neverMelt(run, b); },
    onRoom: (w, b) => {
      const run = b.run, me = run?.boons.find(x => x.key === b.key);
      if (!me || me.meltBiome === run.biome) return;
      me.meltBiome = run.biome;
      const names = neverMelt(run, b);
      if (names.length && w.player) w.text(w.player, `NEVER-MELT ICE: ${names.join(', ')} Lv UP!`, '#98d8f8');
    } },
  A_AVALANCHE: { legend: 'ARTICUNO', slot: 'attack', name: 'Avalanche', desc: b => `Your Attack deals +${pct(v(b, 0.07, 0.25))} damage for each Chill on the foe (up to 5).`,
    beforeHit: (w, info, b) => { if (fromSlot(info, 'attack') && info.target.status.chill) dmgUp(info, info.target.status.chill.stacks * v(b, 0.07, 0.25)); } },

  // ---------------- MOLTRES
  M_ATTACK: { legend: 'MOLTRES', slot: 'attack', name: 'Fire Fang', desc: b => `Your Attack Burns foes (stacks up to 5) and deals +${pct(v(b, 0.1, 0.3))} damage.`,
    beforeHit: (w, info, b) => { if (fromSlot(info, 'attack')) info.dmg = Math.round(info.dmg * (1 + v(b, 0.1, 0.3))); },
    onHit: (w, info, b) => { if (fromSlot(info, 'attack') && procOk(w, info, 'mf')) w.addStatus(info.target, 'burn', info.src, { power: RARITY[b.rarity].mult }); } },
  M_SPECIAL: { legend: 'MOLTRES', slot: 'special', name: 'Flame Burst', desc: b => `Your Special bursts into flames for ${v(b, 25)} power around the target, and Burns.`,
    onHit: (w, info, b) => { if (fromSlot(info, 'special') && !info.p.boonProc && procOk(w, info, 'ms', 0.4)) w.boonNova(info.target, { power: v(b, 25), type: 'FIRE', r: 26, fx: 'fire', status: 'burn', delay: 0.02, team: 'player', src: info.src }); } },
  M_DASH: { legend: 'MOLTRES', slot: 'dash', name: 'Flame Wheel', desc: b => `Your Dash leaves a trail of fire (${v(b, 20)} power).`,
    onDash: (w, a, b) => { for (let i = 0; i < 4; i++) w.later(i * 0.035, () => w.addZone({ owner: a, x: a.x, y: a.y, r: 11, dur: 2, team: 'player', tick: 0.4, p: w.boonProfile('FIRE', v(b, 20)), dmgFrac: 1, status: { kind: 'burn', chance: 0.5 }, sprite: 'ember', fire: true })); } },
  M_CAST: { legend: 'MOLTRES', slot: 'cast', name: 'Sunny Day', desc: b => `Your Cast makes the sun shine: FIRE damage +${pct(v(b, 0.4, 0.25))} for 7s.`,
    onCast: (w, a, b) => { w.sunny = { t: 7, mult: 1 + v(b, 0.4, 0.25) }; Sound.playSE('se_m_morning_sun'); } },
  M_FLAMEBODY: { legend: 'MOLTRES', slot: 'passive', name: 'Flame Body', desc: b => `Foes that hit you are Burned ${Math.round(v(b, 2, 0.4))} times.`,
    onHurt: (w, ctx, b) => { if (ctx.src && ctx.src.team === 'enemy') for (let i = 0; i < Math.round(v(b, 2, 0.4)); i++) w.addStatus(ctx.src, 'burn', w.player); } },
  M_BLAZE: { legend: 'MOLTRES', slot: 'passive', name: 'Blaze', desc: b => `Below 40% HP, you deal +${pct(v(b, 0.4, 0.25))} damage.`,
    beforeHit: (w, info, b) => { const p = w.player; if (info.src === p && p.hp < p.maxHp * 0.4) info.dmg = Math.round(info.dmg * (1 + v(b, 0.4, 0.25))); } },
  M_INFERNO: { legend: 'MOLTRES', slot: 'passive', name: 'Inferno', req: ['M_ATTACK', 'M_SPECIAL', 'M_DASH', 'M_FLAMEBODY'], desc: b => `Burns deal +${pct(v(b, 0.6, 0.3))} damage.`,
    stat: (p, b) => { p.burnMul = (p.burnMul || 1) + v(b, 0.6, 0.3); } },
  // Hades' Curse of Agony / Doom: hits mark foes, the mark bursts a moment later
  M_DOOM: { legend: 'MOLTRES', slot: 'attack', name: 'Doom Desire', desc: b => `Your Attack marks foes with doom: 1.1s later the mark bursts for ${v(b, 50)} FIRE power (once per foe every 1.1s).`,
    onHit: (w, info, b) => { if (fromSlot(info, 'attack') && !info.p.boonProc && !info.target.dead && procOk(w, info, 'mdoom', 1.1)) w.boonDoom(info.target, { power: v(b, 50), type: 'FIRE', fx: 'fire', delay: 1.1 }); } },
  // Hades' Blade Rift: the Special leaves a lingering, damaging vortex
  M_FIRESPIN: { legend: 'MOLTRES', slot: 'special', name: 'Fire Spin', desc: b => `Your Special leaves a fire vortex on the target for 1.5s (${v(b, 12)} power every 0.4s). It may Trap foes.`,
    onHit: (w, info, b) => { if (fromSlot(info, 'special') && !info.p.boonProc && procOk(w, info, 'mspin', 1)) { const t = info.target; w.addZone({ owner: w.player, x: t.x, y: t.y, r: 20, dur: 1.5, team: 'player', tick: 0.4, p: w.boonProfile('FIRE', v(b, 12), { fx: 'fire' }), dmgFrac: 1, status: { kind: 'trap', chance: 0.25 }, sprite: 'ember', fire: true, fxColor: 'rgba(255,120,40,0.18)' }); } } },
  M_ERUPTION: { legend: 'MOLTRES', slot: 'cast', name: 'Eruption', desc: b => `Your Cast erupts around you for up to ${v(b, 60)} FIRE power (more at high HP), Burning foes.`,
    onCast: (w, a, b) => { const k = 0.5 + 0.5 * Math.max(0, Math.min(1, a.hp / a.maxHp)); w.boonNova(a, { power: Math.max(5, Math.round(v(b, 60) * k / 5) * 5), type: 'FIRE', r: 62, fx: 'fire', status: 'burn', knock: 120, delay: 0.08, src: a }); w.shake = Math.max(w.shake, 4); } },
  // Hades' Urge to Kill / Moxie: each knockout fires you up for the rest of the room
  M_MOXIE: { legend: 'MOLTRES', slot: 'passive', name: 'Moxie', desc: b => `Each foe that faints gives you +${pct(v(b, 0.04, 0.25))} damage until the room ends (up to 5 times).`,
    onKill: (w, e, b) => { if (e.team !== 'enemy') return; const n = Math.min(5, (w._moxie || 0) + 1); if (n !== w._moxie && w.player && !w.player.dead) w.text(w.player, `MOXIE x${n}`, '#ff9040', true, 0.6); w._moxie = n; },
    beforeHit: (w, info, b) => { if (info.src === w.player && w._moxie) dmgUp(info, w._moxie * v(b, 0.04, 0.25)); } },
  M_HEATWAVE: { legend: 'MOLTRES', slot: 'passive', name: 'Heat Wave', req: ['M_ATTACK', 'M_SPECIAL', 'M_DASH', 'M_FLAMEBODY', 'M_FIRESPIN', 'M_ERUPTION', 'H_ATTACK'], desc: b => `When a Burning foe faints, its flames spread: foes nearby are Burned up to ${Math.round(v(b, 2, 0.4))} times.`,
    onKill: (w, e, b) => {
      const s = e.status.burn; if (!s || !w.player) return;
      const n = Math.min(s.stacks || 1, Math.round(v(b, 2, 0.4)));
      w.vfx.push({ kind: 'ring', x: e.x, y: e.y, r0: 6, r1: 56, t: 0, life: 0.35, fx: 'fire' });
      for (const o of w.enemies()) if (o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 56) for (let i = 0; i < n; i++) w.addStatus(o, 'burn', w.player);
    } },

  // ---------------- MEW
  MEW_CRIT: { legend: 'MEW', slot: 'attack', name: 'Fake Out', desc: b => `Your Attack has +${pct(v(b, 0.25, 0.3))} critical chance.`,
    stat: (p, b) => { p.slotCrit.attack = (p.slotCrit.attack || 0) + v(b, 0.25, 0.3); } },
  MEW_SPCRIT: { legend: 'MEW', slot: 'special', name: 'Psych Up', desc: b => `Your Special has +${pct(v(b, 0.3, 0.3))} critical chance.`,
    stat: (p, b) => { p.slotCrit.special = (p.slotCrit.special || 0) + v(b, 0.3, 0.3); } },
  MEW_DASH: { legend: 'MEW', slot: 'dash', name: 'Agility', desc: b => `+1 Dash charge. Dashes recharge ${pct(v(b, 0.2, 0.3))} faster.`,
    stat: (p, b) => { p.dashCharges += 1; p.dashRecharge *= 1 - Math.min(0.3, v(b, 0.2, 0.3)); } },
  MEW_SPEED: { legend: 'MEW', slot: 'passive', name: 'Quick Feet', desc: b => `You move ${pct(v(b, 0.15, 0.25))} faster.`,
    stat: (p, b) => { p.speed *= 1 + v(b, 0.15, 0.25); } },
  MEW_DODGE: { legend: 'MEW', slot: 'passive', name: 'Double Team', desc: b => `${pct(Math.min(0.4, v(b, 0.1, 0.25)))} chance to dodge any hit.`,
    beforeHurt: (w, ctx, b) => { if (ctx.slot !== 'dot' && ctx.slot !== 'self' && w.rand() < Math.min(0.4, v(b, 0.1, 0.25))) { ctx.dmg = 0; w.text(w.player, 'DODGE', '#f8a8d0'); } } },
  MEW_PICKUP: { legend: 'MEW', slot: 'passive', name: 'Pickup', desc: b => `Gain ¥${Math.round(v(b, 60))} now, and +${pct(v(b, 0.3, 0.2))} money from now on.`,
    onGain: (run, b) => { run.money += Math.round(v(b, 60)); }, stat: (p, b) => { p.moneyMul = (p.moneyMul || 1) + v(b, 0.3, 0.2); } },
  MEW_METRONOME: { legend: 'MEW', slot: 'cast', name: 'Metronome', desc: b => `Your Cast also unleashes a random move with +${pct(v(b, 0.5, 0.3))} power.`,
    onCast: (w, a, b) => w.boonMetronome(a, 1 + v(b, 0.5, 0.3)) },
  // Hades' Hyper Sprint: a burst of speed after every dash
  MEW_SPRINT: { legend: 'MEW', slot: 'passive', name: 'Extreme Speed', desc: b => `After you Dash, you move ${pct(v(b, 0.3, 0.25))} faster for 1.2s.`,
    onDash: (w, a, b) => { w._sprintUntil = w.time + 1.33; w._sprintMul = 1 + v(b, 0.3, 0.25); },
    onTick: (w) => {
      const p = w.player; if (!p || p.action) return; // actions (streams, Dig) own speedMul while they run
      if (w.time < (w._sprintUntil || 0)) { p.speedMul = w._sprintMul; w._sprintOn = true; }
      else if (w._sprintOn) { p.speedMul = 1; w._sprintOn = false; }
    } },
  // Hades' Rush Delivery: bonus damage from bonus speed
  MEW_ACRO: { legend: 'MEW', slot: 'passive', name: 'Acrobatics', req: ['MEW_SPEED', 'MEW_SPRINT'], desc: b => `You deal bonus damage equal to ${pct(v(b, 0.6, 0.25))} of your bonus move speed (max +45%).`,
    beforeHit: (w, info, b) => { const p = w.player; if (info.src !== p || !info.dmg) return; const base = 84 + Math.min(36, p.stats.spe * 0.22); const bonus = moveSpeed(p) / base - 1; if (bonus > 0) dmgUp(info, Math.min(0.45, bonus * v(b, 0.6, 0.25))); } },
  // Hades' Quick Recovery: dash right after a hit to win some of it back
  MEW_REGEN: { legend: 'MEW', slot: 'passive', name: 'Regenerator', desc: b => `After you take damage, Dash within 1s to recover ${pct(v(b, 0.35, 0.2))} of it.`,
    onHurt: (w, ctx) => { w._regenAmt = ctx.dmg; w._regenT = w.time; },
    onDash: (w, a, b) => { if (w._regenAmt > 0 && w.time - w._regenT < 1) { w.heal(a, Math.max(1, Math.round(w._regenAmt * Math.min(0.9, v(b, 0.35, 0.2))))); w.vfx.push({ kind: 'heal', x: a.x, y: a.y, t: 0, life: 0.6 }); } w._regenAmt = 0; } },
  // Hades' Side Hustle: money every room
  MEW_PAYDAY: { legend: 'MEW', slot: 'passive', name: 'Pay Day', desc: b => `Gain ¥${v(b, 10)} at the start of every room.`,
    onRoom: (w, b) => { if (!b.run) return; const n = v(b, 10); b.run.money += n; if (w.player) w.texts.push({ str: `¥${n}`, x: w.player.x, y: w.player.y - 24, t: 0, life: 1.2, color: 'gold' }); } },

  // ---------------- LUGIA
  L_ATTACK: { legend: 'LUGIA', slot: 'attack', name: 'Aero Edge', desc: b => `Your Attack knocks foes back hard and deals +${pct(v(b, 0.15, 0.3))} damage. Wall slams hurt.`,
    beforeHit: (w, info, b) => { if (fromSlot(info, 'attack')) { info.dmg = Math.round(info.dmg * (1 + v(b, 0.15, 0.3))); info.knock = (info.knock || 60) + 90; } },
    stat: (p) => { p.slamBonus = Math.max(p.slamBonus || 0, 0.6); } },
  L_SPECIAL: { legend: 'LUGIA', slot: 'special', name: 'Aeroblast', desc: b => `Your Special blasts foes away and deals +${pct(v(b, 0.2, 0.3))} damage.`,
    beforeHit: (w, info, b) => { if (fromSlot(info, 'special')) { info.dmg = Math.round(info.dmg * (1 + v(b, 0.2, 0.3))); info.knock = (info.knock || 40) + 200; } },
    stat: (p) => { p.slamBonus = Math.max(p.slamBonus || 0, 0.6); } },
  L_DASH: { legend: 'LUGIA', slot: 'dash', name: 'Tailwind', desc: b => `Your Dash creates a gust that pushes foes away (${v(b, 15)} power).`,
    onDash: (w, a, b) => w.boonNova(a, { power: v(b, 15), type: 'FLYING', r: 40, fx: 'wind', knock: 260, delay: 0.02 }) },
  L_CAST: { legend: 'LUGIA', slot: 'cast', name: 'Whirlpool', desc: b => `Your Cast creates a vortex that pulls foes in for ${v(b, 3, 0.2)}s, dealing ${v(b, 15)} power.`,
    onCast: (w, a, b) => w.boonVortex(a, { dur: v(b, 3, 0.2), power: v(b, 15) }) },
  L_SLAM: { legend: 'LUGIA', slot: 'passive', name: 'Hydro Slam', desc: b => `Foes knocked into walls take ${pct(v(b, 1.0, 0.3))} of the hit again.`,
    stat: (p, b) => { p.slamBonus = (p.slamBonus || 0.6) + v(b, 0.4, 0.3); } },
  L_RAIN: { legend: 'LUGIA', slot: 'passive', name: 'Rain Dance', desc: b => `WATER and FLYING damage +${pct(v(b, 0.25, 0.2))}. Foes may drop extra money.`,
    beforeHit: (w, info, b) => { if ((info.p.type === 'WATER' || info.p.type === 'FLYING') && info.src?.team !== 'enemy') info.dmg = Math.round(info.dmg * (1 + v(b, 0.25, 0.2))); },
    onKill: (w, e, b) => { if (w.rand() < 0.35) w.emit({ type: 'money', amount: 2 + Math.floor(e.level / 5), x: e.x, y: e.y }); } },
  // Hades' Breaking Wave: wall slams burst into a wave
  L_WAVECRASH: { legend: 'LUGIA', slot: 'passive', name: 'Wave Crash', desc: b => `Foes slammed into walls burst into a wave that hits foes around them for ${v(b, 30)} power.`,
    onSlam: (w, e, b) => { if (w.player && cdOk(w, e, 'lwave', 0.5)) w.boonNova(e, { power: v(b, 30), type: 'WATER', r: 36, fx: 'water', knock: 90, delay: 0.03, skipSelf: true, src: w.player }); } },
  // Hades' Ocean's Bounty / Huge Catch: more money
  L_PEARL: { legend: 'LUGIA', slot: 'passive', name: 'Big Pearl', desc: b => `+${pct(v(b, 0.25, 0.2))} money. Foes slammed into walls shake loose extra money.`,
    stat: (p, b) => { p.moneyMul = (p.moneyMul || 1) + v(b, 0.25, 0.2); },
    onSlam: (w, e) => { if (cdOk(w, e, 'lpearl', 1.5)) w.emit({ type: 'money', amount: 1 + Math.floor(e.level / 10), x: e.x, y: e.y }); } },
  // Lugia's own ability: shrug off hits while healthy
  L_MULTISCALE: { legend: 'LUGIA', slot: 'passive', name: 'Multiscale', desc: b => `While above 80% HP, you take ${pct(Math.min(0.5, v(b, 0.25, 0.25)))} less damage.`,
    beforeHurt: (w, ctx, b) => { const p = w.player; if (ctx.slot !== 'self' && p.hp >= p.maxHp * 0.8) ctx.dmg = Math.round(ctx.dmg * (1 - Math.min(0.5, v(b, 0.25, 0.25)))); } },
  L_HURRICANE: { legend: 'LUGIA', slot: 'cast', name: 'Hurricane', desc: b => `Your Cast whips up a gale around you: ${v(b, 30)} power, blows foes away, and Confuses ${pct(Math.min(0.75, v(b, 0.35, 0.2)))} of them.`,
    onCast: (w, a, b) => {
      w.boonNova(a, { power: v(b, 30), type: 'FLYING', r: 64, fx: 'wind', knock: 300, delay: 0.05, src: a });
      w.later(0.07, () => { for (const e of w.enemies()) if (Math.hypot(e.x - a.x, e.y - a.y) < 72 && w.rand() < Math.min(0.75, v(b, 0.35, 0.2))) w.addStatus(e, 'confuse', a); });
    } },

  // ---------------- HO-OH
  H_REVIVE: { legend: 'HOOH', slot: 'passive', name: 'Sacred Ash', desc: b => `+1 Revive: when you faint, rise again with ${pct(v(b, 0.3, 0.2))} HP.`,
    onGain: (run, b) => { run.revives += 1; run.reviveFrac = Math.max(run.reviveFrac || 0.5, v(b, 0.3, 0.2) + 0.2); } },
  H_DASH: { legend: 'HOOH', slot: 'dash', name: 'Safeguard', desc: b => `Your Dash deflects projectiles back at foes (+${pct(v(b, 0.5, 0.3))} damage).`,
    onDash: (w, a, b) => { a.deflect = true; w.later(0.25, () => { a.deflect = false; }); } },
  H_ATTACK: { legend: 'HOOH', slot: 'attack', name: 'Sacred Fire', desc: b => `Your Attack deals +${pct(v(b, 0.2, 0.3))} damage and may Burn.`,
    beforeHit: (w, info, b) => { if (fromSlot(info, 'attack')) info.dmg = Math.round(info.dmg * (1 + v(b, 0.2, 0.3))); },
    onHit: (w, info, b) => { if (fromSlot(info, 'attack') && procOk(w, info, 'hf') && w.rand() < 0.3) w.addStatus(info.target, 'burn', info.src); } },
  H_WING: { legend: 'HOOH', slot: 'passive', name: 'Rainbow Wing', desc: b => `Restore ${pct(v(b, 0.06, 0.3))} HP whenever you clear a room.`,
    onClear: (w, b) => w.heal(w.player, Math.round(w.player.maxHp * v(b, 0.06, 0.3))) },
  H_GUARD: { legend: 'HOOH', slot: 'passive', name: 'Rebirth Shield', desc: b => `The first ${Math.round(v(b, 1, 0.5))} hit(s) you take in each room deal no damage.`,
    onRoom: (w, b) => { w.player.shieldHits = Math.round(v(b, 1, 0.5)); },
    beforeHurt: (w, ctx) => { const p = w.player; if (p.shieldHits > 0 && ctx.slot !== 'dot' && ctx.slot !== 'self') { p.shieldHits--; ctx.dmg = 0; w.text(p, 'SHIELD', '#f8d060'); Sound.playSE('se_m_reflect'); } } },
  H_CAST: { legend: 'HOOH', slot: 'cast', name: 'Recover', castHits: true, desc: b => `When your Cast hits a foe, restore ${pct(v(b, 0.05, 0.3))} HP (once per Cast).`,
    onCast: (w, a) => { a.recoverUntil = w.time + 2; }, // shots and lobs land a moment later
    onCastHit: (w, e, b) => recoverHeal(w, b),
    onHit: (w, info, b) => { if (fromSlot(info, 'cast')) recoverHeal(w, b); } },
  // Apollo-style blind: foes you dazzle often miss you
  H_FLASH: { legend: 'HOOH', slot: 'special', name: 'Flash', desc: b => `Your Special deals +${pct(v(b, 0.1, 0.3))} damage and Blinds foes for 3s: their attacks miss you ${pct(Math.min(0.6, v(b, 0.3, 0.2)))} of the time (half for bosses).`,
    beforeHit: (w, info, b) => { if (fromSlot(info, 'special')) dmgUp(info, v(b, 0.1, 0.3)); },
    onHit: (w, info) => { const t = info.target; if (!fromSlot(info, 'special') || t.dead) return; if (!(t._blind > w.time)) w.text(t, 'BLINDED', '#fff8c0', true, 0.5); t._blind = w.time + 3; },
    beforeHurt: (w, ctx, b) => { const s = ctx.src; if (s && s._blind > w.time && ctx.slot !== 'dot' && ctx.slot !== 'self' && ctx.dmg > 0 && w.rand() < Math.min(0.6, v(b, 0.3, 0.2)) * (s.boss ? 0.5 : 1)) { ctx.dmg = 0; w.text(w.player, 'MISS', '#fff8c0'); } } },
  // Pokémon's Endure / Hades' Athena: once per room, a lethal hit leaves you hanging on
  H_ENDURE: { legend: 'HOOH', slot: 'passive', name: 'Endure', desc: b => `Once per room, a hit that would make you faint leaves you at 1 HP, invulnerable for ${v(b, 1.5, 0.3)}s.`,
    onRoom: (w) => { w._endure = 1; },
    beforeHurt: (w, ctx, b) => {
      const p = w.player;
      if (!(w._endure > 0) || ctx.slot === 'self' || ctx.dmg < p.hp || p.hp <= 1) return;
      w._endure = 0; ctx.dmg = p.hp - 1; p.iframes = Math.max(p.iframes, v(b, 1.5, 0.3));
      w.text(p, 'ENDURED!', '#f8d060'); Sound.playSE('se_m_reflect');
    } },
  // Hades' Last Stand: one more revive, and rising again scorches everything nearby
  H_HERB: { legend: 'HOOH', slot: 'passive', name: 'Revival Herb', req: ['H_REVIVE'], desc: b => `+1 Revive. When you revive, you erupt in sacred flame (${v(b, 60)} power, Burns).`,
    onGain: (run) => { run.revives += 1; },
    onTick: (w, b) => {
      const r = b.run?.revives; if (r === undefined) return;
      if (w._herbRev !== undefined && r < w._herbRev && w.player && !w.player.dead) w.boonNova(w.player, { power: v(b, 60), type: 'FIRE', r: 72, fx: 'fire', status: 'burn', knock: 220, delay: 0.1, src: w.player });
      w._herbRev = r;
    } },
  H_CURE: { legend: 'HOOH', slot: 'passive', name: 'Natural Cure', desc: b => `Statuses on you wear off ${pct(Math.min(0.8, v(b, 0.4, 0.25)))} faster.`,
    onTick: (w, b) => { const p = w.player; if (!p) return; const k = Math.min(0.8, v(b, 0.4, 0.25)) / 60; for (const s of Object.values(p.status)) if (s && s.t > 0) s.t -= k; } },

  // ---------------- duo boons (MASTER rarity; need one boon from each)
  DUO_STORM: { legend: 'ZAPDOS', duo: ['ZAPDOS', 'ARTICUNO'], slot: 'passive', name: 'Frozen Storm', desc: () => `Paralyzed foes are also Chilled every second, and Frozen foes are struck by lightning (60 power).`,
    onTick: (w) => { if (w.time % 1 >= 1 / 60) return; for (const e of w.enemies()) { if (e.status.para) w.addStatus(e, 'chill', w.player); if (e.status.freeze) w.boonStrike(e, { power: 60, type: 'ELECTRIC', fx: 'lightning', delay: 0.05 }); } } },
  DUO_STEAM: { legend: 'MOLTRES', duo: ['MOLTRES', 'ARTICUNO'], slot: 'passive', name: 'Steam Burst', desc: () => `When a Burning foe becomes Frozen, it explodes in steam for heavy damage.`,
    onFreeze: (w, e) => { if (e.status.burn) w.boonNova({ x: e.x, y: e.y, team: 'player', level: w.player.level, stats: w.player.stats, stages: w.player.stages, status: {}, types: w.player.types }, { power: 90, type: 'WATER', r: 40, fx: 'water', delay: 0.05 }); } },
  DUO_PLASMA: { legend: 'ZAPDOS', duo: ['ZAPDOS', 'MOLTRES'], slot: 'passive', name: 'Plasma Fists', desc: () => `Lightning you call down also Burns its target.`,
    onHit: (w, info) => { if (info.p.boonProc && info.p.type === 'ELECTRIC') w.addStatus(info.target, 'burn', w.player); } },
  DUO_TIDE: { legend: 'LUGIA', duo: ['LUGIA', 'HOOH'], slot: 'passive', name: 'Tidal Rebirth', desc: () => `Wall slams restore 2% HP. Revives restore 80% HP.`,
    onGain: (run) => { run.reviveFrac = 0.8; }, onSlam: (w) => w.heal(w.player, Math.max(1, Math.round(w.player.maxHp * 0.02))) },
  DUO_MIRAGE: { legend: 'MEW', duo: ['MEW', 'LUGIA'], slot: 'passive', name: 'Mirage Gust', desc: () => `Dodging a hit releases a gust that knocks back nearby foes.`,
    onDodge: (w) => w.boonNova(w.player, { power: 30, type: 'PSYCHIC', r: 44, fx: 'psychic', knock: 240, delay: 0.01 }) },
  DUO_PSYBOLT: { legend: 'ZAPDOS', duo: ['ZAPDOS', 'MEW'], slot: 'passive', name: 'Psycho Bolt', desc: b => `Your critical hits call down lightning on the foe (${v(b, 30)} power).`,
    onHit: (w, info, b) => { if (info.crit && info.src === w.player && !info.p.boonProc && !info.target.dead && procOk(w, info, 'dpsy', 0.4)) w.boonStrike(info.target, { power: v(b, 30), type: 'ELECTRIC', fx: 'lightning', delay: 0.08 }); } },
  DUO_GLACIAL: { legend: 'ARTICUNO', duo: ['ARTICUNO', 'LUGIA'], slot: 'passive', name: 'Glacial Tide', desc: b => `Chilled foes are knocked back 50% further, and wall slams add ${Math.round(v(b, 1.5, 0.3))} Chill.`,
    beforeHit: (w, info) => { if (info.src === w.player && info.target.status.chill && info.knock) info.knock = Math.round(info.knock * 1.5); },
    onSlam: (w, e, b) => { if (w.player) w.addStatus(e, 'chill', w.player, { stacks: Math.round(v(b, 1.5, 0.3)) }); } },
  DUO_PYRE: { legend: 'MOLTRES', duo: ['MOLTRES', 'HOOH'], slot: 'passive', name: 'Phoenix Pyre', desc: b => `Burning foes that faint restore ${pct(v(b, 0.01, 0.3))} of your HP.`,
    onKill: (w, e, b) => { const p = w.player; if (e.status.burn && p && !p.dead) w.heal(p, Math.max(1, Math.round(p.maxHp * v(b, 0.01, 0.3)))); } },
  DUO_AURORA: { legend: 'ARTICUNO', duo: ['ARTICUNO', 'HOOH'], slot: 'passive', name: 'Aurora Veil', desc: b => `Shattering a Frozen foe raises a veil that blocks the next hit you take (at most once every ${auroraCd(b)}s).`,
    onHit: (w, info, b) => { if (info.src === w.player && info.target.wasFrozen === w.time && !w._veil && w.time >= (w._veilReady || 0)) { w._veil = true; w._veilReady = w.time + auroraCd(b); w.text(w.player, 'AURORA VEIL', '#c0f0ff', true); } },
    beforeHurt: (w, ctx) => { if (w._veil && ctx.dmg > 0 && ctx.slot !== 'dot' && ctx.slot !== 'self') { w._veil = false; ctx.dmg = 0; w.text(w.player, 'VEIL', '#c0f0ff'); Sound.playSE('se_m_reflect'); } } },
  DUO_WISH: { legend: 'MEW', duo: ['MEW', 'HOOH'], slot: 'passive', name: 'Healing Wish', desc: b => `Dodging or blocking a hit restores ${pct(v(b, 0.015, 0.3))} of your HP (once per second).`,
    onDodge: (w, b) => { const p = w.player; if (p && !p.dead && w.time >= (w._wishT || 0)) { w._wishT = w.time + 1; w.heal(p, Math.max(1, Math.round(p.maxHp * v(b, 0.015, 0.3)))); } } },
  DUO_THUNDERSTORM: { legend: 'LUGIA', duo: ['LUGIA', 'ZAPDOS'], slot: 'passive', name: 'Thunderstorm', desc: b => `Your lightning blows foes back, and wall slams call down lightning (${v(b, 25)} power) that Paralyzes.`,
    beforeHit: (w, info) => { const p = w.player; if (info.src === p && info.p.boonProc && info.p.type === 'ELECTRIC') { info.knock = Math.max(info.knock || 0, 170); info.ang = Math.atan2(info.target.y - p.y, info.target.x - p.x); } },
    onSlam: (w, e, b) => { if (w.player && !e.dead && cdOk(w, e, 'dstorm', 0.6)) w.boonStrike(e, { power: v(b, 25), type: 'ELECTRIC', fx: 'lightning', status: 'para', chance: 1, delay: 0.06 }); } },
};
for (const [k, b] of Object.entries(BOONS)) b.key = k;

// Chaos (Deoxys) bargains: a curse for N rooms, then a blessing for the rest of the run.
export const CHAOS = {
  curses: [
    { key: 'C_SPEED', name: 'Foes move 30% faster', spawn: e => { e.speed *= 1.3; } },
    { key: 'C_HP', name: 'Foes have +60% HP', spawn: e => { e.maxHp = Math.round(e.maxHp * 1.6); e.hp = e.maxHp; } },
    { key: 'C_DMG', name: 'You take 50% more damage', hurt: 1.5 },
    { key: 'C_NOHEAL', name: 'Healing is halved', healMul: 0.5 },
  ],
  blessings: [
    { key: 'B_ATK', name: '+30% Attack damage', stat: p => { p.slotMul.attack = (p.slotMul.attack || 1) * 1.3; } },
    { key: 'B_SPA', name: '+35% Special damage', stat: p => { p.slotMul.special = (p.slotMul.special || 1) * 1.35; } },
    { key: 'B_HP', name: '+25% max HP', hp: 0.25 },
    { key: 'B_MONEY', name: '+50% money', stat: p => { p.moneyMul = (p.moneyMul || 1) + 0.5; } },
    { key: 'B_DASH', name: '+1 Dash charge', stat: p => { p.dashCharges += 1; } },
    { key: 'B_CRIT', name: '+10% critical chance', stat: p => { p.critBonus = (p.critBonus || 0) + 0.1; } },
    { key: 'B_CAST', name: 'Cast recharges 30% faster', stat: p => { p.cdMul.cast = (p.cdMul.cast || 1) * 0.7; } },
    { key: 'B_SPEED', name: '+12% move speed', stat: p => { p.speed *= 1.12; } },
  ],
};

// Never-Melt Ice: level up n random other blessings (returns their names)
function neverMelt(run, b) {
  const others = run.boons.filter(x => x.key !== b.key && BOONS[x.key]);
  const out = [];
  for (let n = Math.min(others.length, Math.round(v(b, 1, 0.5))); n > 0; n--) {
    const x = others.splice(Math.floor(run.rng.next() * others.length), 1)[0];
    x.level = (x.level || 1) + 1; out.push(BOONS[x.key].name);
  }
  return out;
}
// Aurora Veil's cooldown: 5s at MASTER Lv1, shorter with PP Ups
const auroraCd = b => Math.round(100 / v(b, 1, 0.25)) / 10;

function recoverHeal(w, b) {
  const p = w.player;
  if (!p || !(w.time < p.recoverUntil)) return;
  p.recoverUntil = 0;
  w.heal(p, Math.round(p.maxHp * v(b, 0.05, 0.3)));
}

// can the run's Cast move touch a foe at all? (Withdraw, Agility... can't, so "on Cast hit" boons are useless)
const SELF_KINDS = new Set(['buff', 'heal', 'protect', 'teleport']);
export const castHitsFoes = run => !!run.slots.cast && !SELF_KINDS.has(profile(run.slots.cast).kind);

export function legendBoonPool(legend, run) {
  const owned = new Set(run.boons.map(b => b.key));
  const ownedLegends = new Set(run.boons.map(b => BOONS[b.key]?.legend));
  const slotsTaken = Object.fromEntries(run.boons.filter(b => BOONS[b.key].slot !== 'passive').map(b => [BOONS[b.key].slot, b.key]));
  return Object.values(BOONS).filter(b => {
    if (b.legend !== legend && !(b.duo && b.duo.includes(legend))) return false;
    if (owned.has(b.key)) return false;
    if (b.duo) return b.duo.every(l => ownedLegends.has(l));
    if (b.req && !b.req.some(r => owned.has(r))) return false;
    if (b.castHits && !castHitsFoes(run)) return false;
    if (b.slot !== 'passive' && slotsTaken[b.slot] && BOONS[slotsTaken[b.slot]].legend === legend) return false;
    return true;
  });
}

export function rollRarity(rng, luck = 0) {
  const r = rng.next();
  if (r < 0.06 + luck * 0.5) return 2;
  if (r < 0.28 + luck) return 1;
  return 0;
}

// a boon instance helper with .has() for cross references
export function boonInstance(run, entry) {
  return { ...entry, run, has: k => run.boons.some(b => b.key === k) };
}
