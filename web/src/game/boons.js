// Legendary boons (the Hades god boons). Each legendary offers boons for a slot:
// attack / special / dash / cast / passive. One boon per slot (a new one replaces the old).
// Rarity uses ball tiers: POKé (common) < GREAT < ULTRA < MASTER (duo boons).
// Values scale with rarity and with PP Ups (boon level).
import { Sound } from '../audio/sound.js';

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
  H_CAST: { legend: 'HOOH', slot: 'cast', name: 'Recover', desc: b => `Your Cast also restores ${pct(v(b, 0.05, 0.3))} HP.`,
    onCast: (w, a, b) => w.heal(a, Math.round(a.maxHp * v(b, 0.05, 0.3))) },

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
  ],
};

export function legendBoonPool(legend, run) {
  const owned = new Set(run.boons.map(b => b.key));
  const ownedLegends = new Set(run.boons.map(b => BOONS[b.key]?.legend));
  const slotsTaken = Object.fromEntries(run.boons.filter(b => BOONS[b.key].slot !== 'passive').map(b => [BOONS[b.key].slot, b.key]));
  return Object.values(BOONS).filter(b => {
    if (b.legend !== legend && !(b.duo && b.duo.includes(legend))) return false;
    if (owned.has(b.key)) return false;
    if (b.duo) return b.duo.every(l => ownedLegends.has(l));
    if (b.req && !b.req.some(r => owned.has(r))) return false;
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
  return { ...entry, has: k => run.boons.some(b => b.key === k) };
}
