// Boss fights. Each boss is a big actor with a pattern brain: it picks attacks from a weighted list
// (gated by phase), moves between them, and can call in helpers. Attacks reuse combat kinds with
// custom profiles, so they telegraph like everything else.
import { D, typeEffect as typeEffectOf } from './data.js';
import { profile } from './moves_rt.js';
import { makeActor, moveSpeed, setAnim, statOf } from './combat.js';
import { makeEnemy } from './spawn.js';
import { wildBrain, enemyMoves } from './ai.js';
import { Sound } from '../audio/sound.js';
import { TUNING, heatAt } from './content.js';

const P = (base, over = {}) => ({ ...profile(base), ...over });

export const BOSSES = {
  BROCK: {
    trainer: 'LEADER_BROCK', sprite: 'brock', title: 'PEWTER GYM LEADER', music: 'mus_vs_gym_leader', badge: 'BOULDER BADGE', badgeKey: 'BOULDER',
    intro: ["I'm BROCK! I'm PEWTER's GYM LEADER!", "My rock-hard willpower is evident in my POKéMON. Show me what you've got!"],
    outro: ["I took you for granted.", "As proof of your victory, here's the BOULDERBADGE!"],
    refLevel: 15, mons: [{ species: 'ONIX', level: 14, secs: 22, scale: 1, dmg: 0.7 }],
    adds: { at: [0.6, 0.3], species: 'GEODUDE', level: 12, n: 2, text: 'BROCK sent out GEODUDE!' },
  },
  MISTY: {
    trainer: 'LEADER_MISTY', sprite: 'misty', title: 'CERULEAN GYM LEADER', music: 'mus_vs_gym_leader', badge: 'CASCADE BADGE', badgeKey: 'CASCADE',
    intro: ["Hi, you're a new face!", "My policy is an all-out offensive with WATER-type POKéMON!"],
    outro: ["Wow! You're too much!", "All right! You can have the CASCADEBADGE to show you beat me!"],
    refLevel: 24, mons: [{ species: 'STARMIE', level: 21, secs: 22, dmg: 0.72, tempo: 0.85 }],
    adds: { at: [0.5], species: 'STARYU', level: 18, n: 1, text: 'MISTY sent out STARYU!' },
  },
  MAROWAK: {
    sprite: null, title: 'THE RESTLESS SPIRIT', music: 'mus_encounter_gym_leader', badge: 'SILPH SCOPE', badgeKey: 'SPIRIT',
    intro: ['GHOST: Be gone... Intruders...', 'The GHOST blocks the way!'],
    outro: ["The mother's soul was calmed.", 'It departed to the afterlife...'],
    refLevel: 34, mons: [{ species: 'MAROWAK', level: 30, secs: 28, dmg: 0.7, ghostly: true }],
    adds: { at: [0.66, 0.33], species: 'GASTLY', level: 22, n: 2, text: 'Restless spirits gather!' },
    music2: 'mus_poke_tower',
  },
  GIOVANNI: {
    trainer: 'BOSS_GIOVANNI_2', sprite: 'giovanni', title: 'TEAM ROCKET BOSS', music: 'mus_vs_gym_leader', badge: 'MASTER BALL', badgeKey: 'ROCKET',
    intro: ["Ah, so you are the one who interfered with TEAM ROCKET's business.", "SILPH CO. is mine! Now, for your insolence... you will experience pain!"],
    outro: ["Arrgh!! I lost again!?", "Blast it all! You ruined our plans for SILPH!"],
    refLevel: 41, mons: [{ species: 'RHYHORN', level: 37, secs: 15, dmg: 1.0, tempo: 0.7 }, { species: 'KANGASKHAN', level: 35, secs: 15, dmg: 1.0, tempo: 0.7 }],
    finale: { species: 'NIDOQUEEN', level: 41, secs: 20, dmg: 0.85, tempo: 0.85, text: 'GIOVANNI sent out NIDOQUEEN!' },
  },
  LT_SURGE: {
    trainer: 'LEADER_LT_SURGE', sprite: 'lt_surge', title: 'VERMILION GYM LEADER', music: 'mus_vs_gym_leader', badge: 'THUNDER BADGE', badgeKey: 'THUNDER',
    intro: ["Hey, kid! What do you think you're doing here?", "You won't live long in combat! That's for sure!"],
    outro: ["Whoa! You're the real deal, kid!", "Fine, then, take the THUNDERBADGE!"],
    refLevel: 24, mons: [{ species: 'RAICHU', level: 24, secs: 27, dmg: 0.62, tempo: 0.85 }],
    adds: { at: [0.5], species: 'VOLTORB', level: 20, n: 2, text: 'LT. SURGE sent out VOLTORB!' },
  },
  LORELEI: {
    trainer: 'ELITE_FOUR_LORELEI', sprite: 'lorelei', title: 'ELITE FOUR', music: 'mus_vs_gym_leader', badge: "LORELEI'S SEAL", badgeKey: 'ICE',
    intro: ['Welcome to the POKéMON LEAGUE. I am LORELEI of the ELITE FOUR.', 'No one can best me when it comes to icy POKéMON. Freezing moves are powerful!'],
    outro: ["...Things shouldn't be this way!", "You're better than I thought. Go on ahead."],
    refLevel: 41, mons: [{ species: 'LAPRAS', level: 38, secs: 30, dmg: 0.68, tempo: 0.85 }],
    adds: { at: [0.6, 0.3], species: 'DEWGONG', level: 34, n: 1, text: 'LORELEI sent out DEWGONG!' },
  },
  MEWTWO: {
    sprite: null, title: 'THE GENETIC POKéMON', music: 'mus_vs_mewtwo', badge: 'MEWTWO', badgeKey: 'MEWTWO',
    intro: ['...', 'MEWTWO: Mew!'],
    outro: ['MEWTWO is exhausted...', 'The power in the cave fades.'],
    refLevel: 45, mons: [{ species: 'MEWTWO', level: 62, secs: 72, dmg: 0.47, scale: 1 }],
  },
};

// ---- per-species pattern lists. Each pattern: {w, phase?, cd, run(world, a, tgt)}.
const PATTERNS = {
  ONIX: [
    { w: 3, cd: 1.1, run: (w, a, t) => w.useMove(a, P('ROCK_TOMB', { count: 5, scatter: 46, radius: 18, delay: 0.75 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2.5, cd: 1.0, run: (w, a, t) => w.useMove(a, P('BIND', { kind: 'swipe', range: 60, arc: 3.4, windup: 0.7, knock: 200 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.4, run: (w, a, t) => w.useMove(a, P('TACKLE', { kind: 'charge', dist: 220, dur: 0.7, range: 22, windup: 0.8, through: true, recharge: 0.6 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.5, cd: 1.0, run: (w, a, t) => w.useMove(a, P('ROCK_THROW', { count: 3, spread: 0.5, windup: 0.6 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.5, phase: 1, cd: 1.2, run: (w, a, t) => w.useMove(a, P('DIG', { kind: 'leap', radius: 46, dur: 0.9, windup: 0.6, fx: 'quake', onLand: ringOfRocks }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.3, run: (w, a, t) => storm(w, a, t, 'ROCK_SLIDE', { n: 10, r: 20, text: 'ROCK SLIDE', color: '#b8a038' }) },
  ],
  GEODUDE: null,
  STARMIE: [
    { w: 3, cd: 0.9, run: (w, a, t) => w.useMove(a, P('SWIFT', { count: 5, spread: 0.9, speed: 150, homing: 2.5, life: 2.4, windup: 0.5 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.2, run: (w, a, t) => storm(w, a, t, 'WATER_GUN', { n: 12, r: 22, every: 0.12, text: 'RAIN DANCE', color: '#6890f0', fx: 'water' }) },
    { w: 1.5, cd: 1.3, run: (w, a, t) => w.useMove(a, P('HYDRO_PUMP', { kind: 'sweep', sweep: 0.9, len: 640, width: 14, dur: 1.1, windup: 0.8, dir: w.rand() < 0.5 ? 1 : -1 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.2, run: (w, a, t) => w.useMove(a, P('WATER_PULSE', { kind: 'nova', radius: 60, wave: true, windup: 0.8, fx: 'water', status: { kind: 'confuse', chance: 0.3 } }), { target: t, aim: aimAt(a, t) }) },
    { w: 2.5, cd: 0.6, run: (w, a, t) => ricochet(w, a, t, 2) },
    { w: 1, phase: 1, cd: 0.8, once: 0.45, run: (w, a) => w.useMove(a, { ...P('RECOVER'), kind: 'channel', dur: 1.6, heal: 0.12, breakFrac: 0.05, windup: 0.2, breakText: 'RECOVER was interrupted!' }, { aim: a.facing }) },
    { w: 1.5, cd: 1.0, run: (w, a, t) => w.useMove(a, P('BUBBLE_BEAM', { kind: 'radial', count: a.phase >= 1 ? 14 : 10, speed: 110, size: 5, life: 3.2, windup: 0.6 }), { target: t, aim: aimAt(a, t) }) },
  ],
  MAROWAK: [
    { w: 3, cd: 1.0, run: (w, a, t) => w.useMove(a, P('BONEMERANG', { count: a.phase >= 1 ? 3 : 1, spread: 0.5, windup: 0.5, speed: 190, life: 1.1 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2.5, cd: 1.0, run: (w, a, t) => w.useMove(a, P('BONE_CLUB', { kind: 'leap', radius: 38, dur: 0.6, windup: 0.55, fx: 'quake', onLand: (w2, b) => shockRing(w2, b, 8, 'bone') }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 0.8, run: (w, a, t) => w.useMove(a, P('BONE_RUSH', { kind: 'charge', dist: 150, dur: 0.55, range: 20, windup: 0.55 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.5, cd: 0.6, run: (w, a, t) => phaseBehind(w, a, t) },
    { w: 1.5, cd: 1.2, run: (w, a, t) => storm(w, a, t, 'SHADOW_BALL', { n: 9, r: 20, text: 'CURSE', color: '#705898' }) },
  ],
  RHYHORN: [
    { w: 3, cd: 1.0, run: (w, a, t) => w.useMove(a, P('HORN_ATTACK', { kind: 'charge', dist: 200, dur: 0.6, range: 22, windup: 0.7 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.0, run: (w, a, t) => w.useMove(a, P('STOMP', { kind: 'nova', radius: 50, windup: 0.6, fx: 'quake', grounded: true }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.2, run: (w, a, t) => w.useMove(a, P('ROCK_TOMB', { count: 4, scatter: 36, delay: 0.7 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.2, cd: 1.3, run: (w, a, t) => storm(w, a, t, 'ROCK_SLIDE', { n: 8, r: 20, text: 'ROCK SLIDE', color: '#b8a038' }) },
  ],
  KANGASKHAN: [
    { w: 3, cd: 0.8, run: (w, a, t) => w.useMove(a, P('COMET_PUNCH', { hits: 5, range: 30, windup: 0.5 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.0, run: (w, a, t) => w.useMove(a, P('MEGA_PUNCH', { kind: 'lunge', dist: 70, range: 22, windup: 0.6, knock: 240 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.5, cd: 1.4, run: (w, a, t) => w.useMove(a, P('EARTHQUAKE', { radius: 90, windup: 0.9 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.2, cd: 1.3, run: (w, a, t) => storm(w, a, t, 'STOMP', { n: 8, r: 24, text: 'STOMP STOMP', color: '#e0c068', fx: 'quake' }) },
  ],
  NIDOQUEEN: [
    { w: 2.5, cd: 1.3, run: (w, a, t) => w.useMove(a, P('EARTHQUAKE', { radius: 100, windup: 0.85 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2.5, cd: 0.9, run: (w, a, t) => w.useMove(a, P('SLUDGE_BOMB', { kind: 'radial', count: 9, speed: 120, size: 7, life: 1.6, explode: 0, puddle: 'poison', windup: 0.6 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.0, run: (w, a, t) => w.useMove(a, P('BODY_SLAM', { kind: 'charge', dist: 180, dur: 0.55, range: 24, windup: 0.6, status: { kind: 'para', chance: 0.3 } }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 0.9, run: (w, a, t) => w.useMove(a, P('POISON_STING', { count: 5, spread: 0.7, speed: 220, windup: 0.45 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.5, cd: 1.3, run: (w, a, t) => storm(w, a, t, 'SLUDGE_BOMB', { n: 10, r: 22, text: 'TOXIC RAIN', color: '#a040a0' }) },
  ],
  RAICHU: [
    { w: 2.5, cd: 1.1, run: (w, a, t) => storm(w, a, t, 'THUNDER', { n: 9, r: 20, every: 0.13, text: 'THUNDER', color: '#f8d030', fx: 'lightning' }) },
    { w: 2.5, cd: 0.9, run: (w, a, t) => w.useMove(a, P('THUNDERBOLT', { kind: 'chain', jumps: 3, range: 220, windup: 0.55 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 0.8, run: (w, a, t) => w.useMove(a, P('QUICK_ATTACK', { kind: 'charge', dist: 160, dur: 0.32, range: 20, windup: 0.5 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.1, run: (w, a, t) => w.useMove(a, P('THUNDER', { kind: 'nova', radius: 72, windup: 0.7, fx: 'spark', type: 'ELECTRIC', power: 60, status: { kind: 'para', chance: 0.3 } }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.5, phase: 1, cd: 0.9, run: (w, a, t) => w.useMove(a, P('SHOCK_WAVE', { kind: 'radial', count: 12, speed: 130, size: 6, life: 2.4, windup: 0.6, sprite: 'spark' }), { target: t, aim: aimAt(a, t) }) },
  ],
  VOLTORB: null,
  LAPRAS: [
    { w: 2.5, cd: 1.2, run: (w, a, t) => w.useMove(a, P('ICE_BEAM', { kind: 'sweep', sweep: 1.1, len: 320, width: 12, dur: 1.1, windup: 0.75, dir: w.rand() < 0.5 ? 1 : -1, status: { kind: 'chill', chance: 0.5 } }), { target: t, aim: aimAt(a, t) }) },
    { w: 2.5, cd: 1.1, run: (w, a, t) => w.useMove(a, P('BLIZZARD', { count: 7, scatter: 70, delay: 0.9, radius: 24 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.0, run: (w, a, t) => w.useMove(a, P('SURF', { kind: 'radial', count: a.phase >= 1 ? 18 : 14, speed: 110, size: 7, life: 2.8, windup: 0.6, sprite: 'water', knock: 120 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.5, cd: 1.0, run: (w, a, t) => w.useMove(a, P('BODY_SLAM', { kind: 'charge', dist: 170, dur: 0.6, range: 24, windup: 0.65, status: { kind: 'para', chance: 0.3 } }), { target: t, aim: aimAt(a, t) }) },
    { w: 1, phase: 1, cd: 1.2, once: 0.4, run: (w, a) => w.useMove(a, { ...P('REST'), kind: 'channel', dur: 1.8, heal: 0.1, breakFrac: 0.05, windup: 0.2, breakText: 'LAPRAS woke up!' }, { aim: a.facing }) },
  ],
  DEWGONG: null,
  MEWTWO: [
    { w: 3, cd: 0.9, run: (w, a, t) => psychicTriple(w, a, t) },
    { w: 2.5, cd: 1.0, run: (w, a, t) => w.useMove(a, P('SWIFT', { count: 8, spread: 1.4, speed: 170, homing: 3, windup: 0.45 }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, cd: 1.2, run: (w, a, t) => w.useMove(a, P('PSYBEAM', { kind: 'sweep', sweep: 1.3, len: 220, width: 14, dur: 1.2, windup: 0.75, dir: w.rand() < 0.5 ? 1 : -1 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1, cd: 0.5, run: (w, a, t) => w.useMove(a, P('TELEPORT', { windup: 0.15 }), { target: t, aim: aimAt(a, t) }) },
    { w: 1.2, cd: 1.0, once: 0.8, run: (w, a) => barrier(w, a) },
    { w: 2.5, phase: 1, cd: 1.0, run: (w, a, t) => w.useMove(a, P('SHADOW_BALL', { kind: 'radial', count: 14, speed: 120, size: 7, life: 2.2, explode: 0, windup: 0.6, offset: w.rand() }), { target: t, aim: aimAt(a, t) }) },
    { w: 2, phase: 1, cd: 1.0, run: (w, a, t) => futureSight(w, a, t) },
    { w: 1, phase: 1, cd: 1.0, once: 0.4, run: (w, a) => w.useMove(a, { ...P('RECOVER'), kind: 'channel', dur: 1.8, heal: 0.1, breakFrac: 0.04, windup: 0.2, breakText: 'MEWTWO lost focus!' }, { aim: a.facing }) },
    { w: 3, phase: 2, cd: 0.6, run: (w, a, t) => psystrikeStorm(w, a, t) },
  ],
};

const aimAt = (a, t) => Math.atan2(t.y - a.y, t.x - a.x);

function ringOfRocks(w, a) { shockRing(w, a, 6, 'rock'); }
function shockRing(w, a, n, kind) {
  const p = P(kind === 'bone' ? 'BONEMERANG' : 'ROCK_THROW', { kind: 'radial', count: n, speed: 130, size: 6, life: 0.9, boomerang: false, lob: false, explode: 0, sprite: kind === 'bone' ? 'bone' : 'rock', windup: 0 });
  const act = { p, slot: 'enemy', hits: new Set(), aim: 0, enemy: true };
  for (let i = 0; i < n; i++) w.spawnProjectile(a, act, (i / n) * Math.PI * 2 + w.rand() * 0.3);
}

function ricochet(w, a, t, n) {
  const go = (k) => {
    if (k <= 0 || a.dead) return;
    const act = w.useMove(a, P('RAPID_SPIN', { kind: 'charge', dist: 170, dur: 0.42, range: 20, windup: k === n ? 0.6 : 0.22, roll: true }), { target: t, aim: aimAt(a, t) });
    act.recover = 0.05;
    act.onDone = () => go(k - 1);
  };
  go(n);
}

function phaseBehind(w, a, t) {
  a.untargetable = true; a.alpha = 0.15;
  const behind = { x: t.x - Math.cos(t.facing) * 34, y: t.y - Math.sin(t.facing) * 34 };
  w.later(0.6, () => {
    if (a.dead) return;
    if (!w.collides(behind.x, behind.y, 8, 'walk')) { a.x = behind.x; a.y = behind.y; }
    a.untargetable = false; a.alpha = 1;
    w.useMove(a, P('BONE_CLUB', { kind: 'swipe', range: 36, arc: 2.6, windup: 0.55 }), { target: t, aim: aimAt(a, t) });
  });
  Sound.playSE('se_m_teleport');
}

function psychicTriple(w, a, t) {
  const p = P('PSYCHIC', { radius: 26, delay: 0.75, knock: 60 });
  for (let i = 0; i < 3; i++) w.later(i * 0.35, () => {
    if (a.dead) return;
    w.strikes.push({ owner: a, act: { p, slot: 'enemy', hits: new Set() }, x: t.x + (w.rand() - 0.5) * 10, y: t.y + (w.rand() - 0.5) * 10, r: 26, t: 0, delay: 0.75, p, slot: 'enemy', team: 'enemy', scale: 0.7 });
  });
  setAnim(a, 'Charge', true);
  Sound.playSE('se_m_psybeam');
  a.action = { p: { kind: 'wait' }, stage: 'active', t: 0, dur: 0.9, hits: new Set(), enemy: true };
}

function futureSight(w, a, t) {
  // marks where the player stands now; it erupts a while later
  const p = P('FUTURE_SIGHT', { radius: 30, delay: 1.6, power: 80, type: 'PSYCHIC', fx: 'psychic' });
  for (let i = 0; i < 4; i++) w.later(i * 0.3, () => {
    if (a.dead) return;
    w.strikes.push({ owner: a, act: { p, slot: 'enemy', hits: new Set() }, x: t.x, y: t.y, r: 30, t: 0, delay: 1.6, p, slot: 'enemy', team: 'enemy' });
  });
  w.text(a, 'FUTURE SIGHT', '#f85888');
  a.action = { p: { kind: 'wait' }, stage: 'active', t: 0, dur: 0.8, hits: new Set(), enemy: true };
}

function psystrikeStorm(w, a, t) {
  const p = P('PSYCHIC', { radius: 22, delay: 0.85, power: 90, knock: 40 });
  for (let i = 0; i < 9; i++) w.later(i * 0.12, () => {
    if (a.dead) return;
    const pt = i % 3 === 0 ? { x: t.x, y: t.y } : w.randomOpenPoint(null);
    w.strikes.push({ owner: a, act: { p, slot: 'enemy', hits: new Set() }, x: pt.x, y: pt.y, r: 22, t: 0, delay: 0.85, p, slot: 'enemy', team: 'enemy', scale: 0.6 });
  });
  a.action = { p: { kind: 'wait' }, stage: 'active', t: 0, dur: 1.2, hits: new Set(), enemy: true };
}

// Arena-wide rain of marked blasts: some under you, the rest anywhere in the arena. Terrain doesn't stop it,
// so every boss always has something that reaches you.
function storm(w, a, t, base, { n = 10, every = 0.14, r = 20, delay = 0.9, aimed = 3, scale = 0.6, text, color = '#ffffff', fx } = {}) {
  const p = P(base, { kind: 'strike', radius: r, delay, ...(fx ? { fx } : {}) });
  for (let i = 0; i < n; i++) w.later(i * every, () => {
    if (a.dead || t.dead) return;
    const pt = i % aimed === 0 ? { x: t.x, y: t.y } : w.randomOpenPoint(null);
    w.strikes.push({ owner: a, act: { p, slot: 'enemy', hits: new Set() }, x: pt.x, y: pt.y, r, t: 0, delay, p, slot: 'enemy', team: 'enemy', scale });
  });
  if (text) w.text(a, text, color);
  setAnim(a, 'Charge', true);
  Sound.playSE(p.sfx || 'se_m_rock_throw');
  a.action = { p: { kind: 'wait' }, stage: 'active', t: 0, dur: 0.5 + n * every * 0.5, hits: new Set(), enemy: true };
}

// The boss lost sight of you behind its own terrain: it burrows / warps to a spot that can see you.
function relocate(w, a, t) {
  for (let i = 0; i < 40; i++) {
    const ang = w.rand() * Math.PI * 2, d = 60 + w.rand() * 50;
    const x = t.x + Math.cos(ang) * d, y = t.y + Math.sin(ang) * d;
    if (!w.reachable(x, y) || w.collides(x, y, a.r, 'walk') || !w.lineClear(x, y - 4, t.x, t.y - 4, 'shot')) continue;
    w.vfx.push({ kind: 'dust', x: a.x, y: a.y, t: 0, life: 0.4 });
    a.x = x; a.y = y; a.kx = a.ky = 0;
    w.vfx.push({ kind: 'dust', x, y, t: 0, life: 0.4 });
    Sound.playSE(a.hover || a.types.includes('PSYCHIC') ? 'se_m_teleport' : 'se_m_dig');
    a.bd.cool = Math.max(a.bd.cool, 0.6); // a beat to react before it attacks from the new spot
    return true;
  }
  return false;
}

function barrier(w, a) {
  a.barrier = Math.round(a.maxHp * 0.08);
  w.text(a, 'BARRIER', '#a0d0ff');
  Sound.playSE('se_m_barrier');
  a.action = { p: { kind: 'wait' }, stage: 'active', t: 0, dur: 0.5, hits: new Set(), enemy: true };
}

// ---- spawning and brains
// HP scales with the player's real damage so fights last about `hits` player hits regardless of matchups.
// Boss HP = target seconds x the player's sustained damage per second with their Attack + Special,
// so every starter and build gets a boss of similar length. Type matchups still count (clamped 0.5-2).
export function kitDps(world, boss) {
  const pl = world.player, run = world.run;
  let dps = 0;
  for (const slot of ['attack', 'special']) {
    const k = run.slots[slot]; if (!k) continue;
    const p = profile(k); if (!p.damaging) continue;
    let hit;
    if (p.fixed === 'level') hit = pl.level * 1.4;
    else if (p.fixed) hit = p.fixed * pl.level / 20;
    else {
      const L = pl.level, A = statOf(pl, p.special ? 'spa' : 'atk'), Dv = statOf(boss, p.special ? 'spd' : 'def');
      hit = ((((2 * L) / 5 + 2) * Math.max(20, p.power) * A / Math.max(1, Dv)) / 50 + 2) * (pl.types.includes(p.type) ? 1.5 : 1);
      // real matchup, compressed: a 4x weakness makes the fight ~25% faster instead of 4x
      hit *= Math.pow(Math.max(0.5, Math.min(4, typeEffectOf(p.type, boss.types) || 0.5)), 0.8);
    }
    const per = p.kind === 'multi' ? Math.sqrt(p.hits || 3) : p.kind === 'proj' ? Math.min(p.count || 1, 3) * 0.8 : p.kind === 'stream' ? (p.dur || 0.6) / (p.rate || 0.05) * 0.22 * 0.6 : p.kind === 'chain' ? 1.2 : 1;
    const combo = slot === 'attack' && (p.combo || 1) > 1 ? 1 + 0.5 / p.combo : 1;
    const interval = (slot === 'attack' ? (p.cd || 0.25) : Math.max(0.35, (p.cd || 0.6) * 1.2)) + 0.12;
    // special shares time with attack: weight it by how often it's ready
    // realistic uptime: melee has to stay in range of a moving boss; homing/auto-target moves almost always land
    const auto = p.homing || p.kind === 'chain' || p.kind === 'strike';
    const uptime = slot === 'attack' ? (p.melee ? 0.5 : auto ? 0.8 : 0.65) : (auto ? 0.55 : 0.35);
    dps += hit * per * combo / interval * uptime;
  }
  // never below a plain STAB power-60 move, so status-only kits can't shrink bosses
  const L = pl.level, A = Math.max(statOf(pl, 'atk'), statOf(pl, 'spa')), Dv = Math.max(statOf(boss, 'def'), statOf(boss, 'spd'));
  const ref = ((((2 * L) / 5 + 2) * 60 * A / Math.max(1, Dv)) / 50 + 2) * 1.5 * 0.7; // ~0.7 STAB power-60 hits per second
  return Math.max(ref, dps);
}
// HP = target seconds x DPS measured at the level you're expected to have here. Being over-leveled,
// upgraded (PROTEIN) or boon-buffed therefore shortens the fight, like a real power curve.
export function bossHp(world, boss, secs, refLevel) {
  const L = world.player.level, ref = refLevel || L;
  const levelFactor = Math.max(0.55, Math.min(1.6, Math.pow(ref / L, 1.6)));
  return Math.max(60, Math.round(kitDps(world, boss) * secs * levelFactor));
}

// v0.0.3: areas come in any order within an act, so a boss scales to the stage it appears at.
const BOSS_REF = [15, 24, 34, 41, 45]; // the original refLevel of the boss at each stage
export function scaledBoss(key, stage) {
  const def = BOSSES[key], shift = BOSS_REF[Math.min(stage, BOSS_REF.length - 1)] - def.refLevel;
  if (!shift) return def;
  const lv = m => ({ ...m, level: Math.max(5, m.level + shift) });
  return { ...def, refLevel: def.refLevel + shift, mons: def.mons.map(lv), adds: def.adds && lv(def.adds), finale: def.finale && lv(def.finale) };
}

export function spawnBoss(world, key, at) {
  const def = scaledBoss(key, world.run?.biome ?? 0);
  world.bossDef = def;
  const list = [];
  def.mons.forEach((m, i) => {
    const a = spawnBossMon(world, m, { x: at.x + (i - (def.mons.length - 1) / 2) * 48, y: at.y });
    list.push(a);
  });
  world.bossDef = def; world.bossKey = key; world.bossAddsDone = new Set();
  return list;
}

export function spawnBossMon(world, m, at) {
  const moves = enemyMoves(m.species, m.level);
  if (!world.reachable(at.x, at.y) || world.collides(at.x, at.y, 8, 'walk')) at = world.nearestReachable(at.x, at.y);
  const a = makeActor(m.species, m.level, 'enemy', { x: at.x, y: at.y, boss: true, moves, hpMul: 1, scale: m.scale || 1 });
  a.maxHp = a.hp = bossHp(world, a, m.secs * TUNING.bossSecs * (heatAt(world.run, 3) ? 1.15 : 1), world.bossDef?.refLevel);
  a.dmgScale = m.dmg * TUNING.bossDmg * (heatAt(world.run, 9) ? 1.3 : 1) * (heatAt(world.run, 1) ? 1.15 : 1) * (1 + 0.03 * (world.run.heat || 0)); a.brain = bossBrain; a.patterns = PATTERNS[m.species] || null; a.phase = 0;
  a.bd = { cool: 1.5, used: {} }; a.spawnT = 0.01; a.poise = 1; a.tempo = (m.tempo || 1) * (heatAt(world.run, 3) ? 0.9 : 1);
  a.hover = a.flying; a.flying = !!m.swim; // bosses stay reachable: hovering is only visual
  if (m.ghostly) { a.ghostly = true; a.ghost = true; }
  a.r = Math.max(a.r, 12);
  world.add(a);
  world.hooks.onSpawn?.(world, a);
  return a;
}

export function bossBrain(world, a, dt) {
  const t = world.player;
  if (!t || t.dead) { a.vx = a.vy = 0; return; }
  const bd = a.bd;
  bd.cool -= dt;
  // phase changes
  const frac = a.hp / a.maxHp;
  const enraged = a.species === 'MEWTWO' && heatAt(world.run, 10);
  const newPhase = frac < (enraged ? 0.5 : 0.25) && a.species === 'MEWTWO' ? 2 : (frac < 0.5 || enraged) ? 1 : 0;
  if (newPhase > a.phase) {
    a.phase = newPhase;
    world.emit({ type: 'bossPhase', actor: a, phase: newPhase });
    a.windupMul = newPhase === 2 ? 0.7 : 0.85; a.recoverMul = 0.8;
    if (a.ghostly && newPhase === 1) { a.ghostly = false; a.ghost = false; if (!world.reachable(a.x, a.y)) { const q = world.nearestReachable(a.x, a.y); a.x = q.x; a.y = q.y; } world.text(a, 'The GHOST was MAROWAK!', '#ffffff'); }
    bd.cool = 0.8;
  }
  if (!a.patterns) return wildBrain(world, a, dt);
  if (!a.ghost && !a.action) {
    const sees = world.lineClear(a.x, a.y - 4, t.x, t.y - 4, 'shot');
    bd.blind = sees ? 0 : (bd.blind || 0) + dt;
    if (bd.blind > 2.2) { bd.blind = 0; if (relocate(world, a, t)) return; }
  }
  const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
  const partnerBusy = world.actors.some(o => o !== a && o.boss && !o.dead && o.action && o.action.stage === 'windup');
  if (bd.cool <= 0 && !partnerBusy) {
    const avail = a.patterns.filter(p => (p.phase || 0) <= a.phase && !(p.once && (bd.used[a.patterns.indexOf(p)] || frac > p.once)));
    const pat = world.rng.weighted ? world.rng.weighted(avail, p => p.w) : avail[Math.floor(world.rand() * avail.length)];
    if (pat) {
      if (pat.once) bd.used[a.patterns.indexOf(pat)] = true;
      a.vx = a.vy = 0;
      pat.run(world, a, t);
      bd.cool = pat.cd * (a.tempo || 1) * (a.phase >= 1 ? 0.8 : 1) * (0.8 + world.rand() * 0.4);
      return;
    }
  }
  // drift toward a comfortable distance and circle
  const want = 70;
  const sp = Math.min(moveSpeed(a) * 0.8, 64); // bosses move deliberately; fast species shouldn't out-run aimed attacks
  let mx = 0, my = 0;
  if (d > want + 20) { mx = dx / d; my = dy / d; if (!a.flying && !a.ghost && !world.lineClear(a.x, a.y, t.x, t.y, 'walk')) { const f = world.flowDir(a.x, a.y); if (f) { mx = f.x; my = f.y; } } }
  else if (d < want - 20) { mx = -dx / d; my = -dy / d; }
  mx += (-dy / d) * 0.5; my += (dx / d) * 0.5;
  const l = Math.hypot(mx, my) || 1;
  a.vx = mx / l * sp; a.vy = my / l * sp;
  a.lockFacing = true; a.facing = Math.atan2(dy, dx);
}

// called each step by the room scene during boss fights: adds and finales
export function bossDirector(world) {
  const def = world.bossDef; if (!def) return;
  const bosses = world.actors.filter(x => x.boss && !x.dead);
  const all = world.actors.filter(x => x.boss);
  const frac = all.reduce((s, x) => s + Math.max(0, x.hp), 0) / Math.max(1, all.reduce((s, x) => s + x.maxHp, 0));
  if (def.adds) for (const th of def.adds.at) {
    if (frac < th && !world.bossAddsDone.has(th) && bosses.length) {
      world.bossAddsDone.add(th);
      for (let i = 0; i < def.adds.n; i++) {
        const pt = world.randomOpenPoint(world.player, 70);
        const e = makeEnemy(world, def.adds.species, def.adds.level, { x: pt.x, y: pt.y, spawnT: 0.8 });
        e.trainerMon = !!def.trainer; if (def.adds.swim) e.flying = true;
        world.add(e);
        world.hooks.onSpawn?.(world, e);
      }
      world.emit({ type: 'banner', text: def.adds.text });
      Sound.playSE('se_ball_open');
    }
  }
  if (def.finale && !bosses.length && !world.finaleDone) {
    world.finaleDone = true;
    const pt = world.room.center;
    const a = spawnBossMon(world, def.finale, pt);
    a.spawnT = 1.0; a.spawnMax = 1.0;
    world.emit({ type: 'banner', text: def.finale.text });
    Sound.playSE('se_ball_open'); Sound.playCry(def.finale.species);
  }
}

export function bossesDefeated(world) {
  const def = world.bossDef;
  if (!def) return false;
  if (def.finale && !world.finaleDone) return false;
  return !world.actors.some(x => x.boss && !x.dead);
}

export { D };
