// Run state (one escape attempt) and the persistent save (meta progression).
import { D, monStats, expForLevel, movesLearnedAt, levelEvolution, easyEvolution } from './data.js';
import { RNG, randomSeedString } from '../engine/rng.js';
import { Cloud } from './cloud.js';
import { VERSION } from './version.js';
import { scoreRun } from './score.js';
import { makeActor } from './combat.js';
import { BOONS, LEGENDS, CHAOS, RARITY, legendBoonPool, rollRarity, boonInstance } from './boons.js';
import { BIOMES, STARTERS, HELD, RESEARCH, SPECIAL_EVOS } from './content.js';
import { profile, slotFor } from './moves_rt.js';

// Every player POKéMON levels on the same curve, so slow-growing species (DRATINI) aren't behind.
export const PLAYER_CURVE = 'MEDIUM_SLOW';
// Moves that hurt the user too much in realtime are never offered to the player.
export const PLAYER_BANNED = new Set(['EXPLOSION', 'SELF_DESTRUCT', 'DESTINY_BOND', 'MEMENTO', 'PERISH_SONG', 'CURSE', 'SPITE', 'MEAN_LOOK', 'BIDE', 'SKETCH', 'TRANSFORM', 'MIMIC', 'SPLASH', 'TELEPORT', 'FOCUS_PUNCH', 'RAGE', 'COUNTER', 'MIRROR_COAT', 'ENDEAVOR', 'PAIN_SPLIT', 'FLAIL', 'REVERSAL']);

// ---------------------------------------------------------------- meta (localStorage)
const SAVE_KEY = 'kanto-descent-v1';
export const G = { meta: null, run: null, save: undefined, cloudRuns: [] };

export function normalizeMeta(m) {
  const meta = Object.assign({
    stardust: 0, totalStardust: 0, research: {}, badges: [], dex: { seen: {}, caught: {} }, runs: 0, wins: 0, bestTime: null,
    deaths: 0, heat: 0, maxHeatWon: -1, bossKills: {}, settings: { music: 0.7, sfx: 0.8, shake: 1 }, history: [], lastStarter: 'CHARMANDER', seenIntro: false,
  }, m || {});
  if (meta.wins > 0 && (meta.maxHeatWon ?? -1) < 0) meta.maxHeatWon = 0;
  for (const r of RESEARCH) if ((meta.research[r.key] || 0) > r.max) meta.research[r.key] = r.max;
  return meta;
}
export function loadMeta() {
  let m = null;
  try { m = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { m = null; }
  G.meta = normalizeMeta(m);
  return G.meta;
}
export function saveMeta() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.meta)); } catch { /* storage full */ }
  Cloud.pushMeta(G.meta);
}

// ---------------------------------------------------------------- run in progress (save & quit)
// A snapshot is taken at the start of every room (before it rolls its enemies), so quitting and
// resuming puts you back at the start of that room, like Hades.
const RUN_KEY = 'kanto-descent-run';
export function serializeRun(run) {
  const o = { ...run, rng: run.rng.state, chaos: run.chaos.map(c => ({ curse: c.curse.key, blessing: c.blessing.key, rooms: c.rooms, active: c.active })) };
  return JSON.parse(JSON.stringify(o));
}
export function restoreRun(o) {
  const run = { ...o };
  run.rng = new RNG(1); run.rng.state = o.rng;
  run.chaos = (o.chaos || []).map(c => ({ curse: CHAOS.curses.find(x => x.key === c.curse) || CHAOS.curses[0], blessing: CHAOS.blessings.find(x => x.key === c.blessing) || CHAOS.blessings[0], rooms: c.rooms, active: c.active }));
  G.run = run;
  return run;
}
export function saveRunSnapshot(run, spec) {
  const save = { run: serializeRun(run), spec: JSON.parse(JSON.stringify(spec)), at: Date.now(), label: runLabel(run) };
  G.save = save;
  try { localStorage.setItem(RUN_KEY, JSON.stringify(save)); } catch { /* storage full */ }
  Cloud.putSave(save);
  return save;
}
export function loadRunSave() {
  if (G.save !== undefined) return G.save;
  try { G.save = JSON.parse(localStorage.getItem(RUN_KEY) || 'null'); } catch { G.save = null; }
  return G.save;
}
export function clearRunSave() {
  G.save = null;
  try { localStorage.removeItem(RUN_KEY); } catch { /* storage off */ }
  Cloud.putSave(null);
}
export function runLabel(run) {
  const B = BIOMES[run.biome];
  return `${D.species[run.species]?.name || run.species} Lv${run.level} - ${B ? B.name : ''} ${run.roomInBiome + 1}/${(B?.rooms || 0) + 1}`;
}
// finished runs go to the cloud history too (tagged with the game version, partner and score; the
// entry is the same object as G.meta.history[0], so the local history gets these fields as well)
export function recordRun(entry) {
  entry.version = VERSION;
  if (entry.partner === undefined) entry.partner = G.run?.partner?.species || null;
  entry.score = scoreRun(entry);
  Cloud.addRun(entry);
  recordRun.after?.(entry); // co-op: the guest gets the run too
}

// Signing in: take whichever progression is further along, and the newer run in progress.
export async function syncFromCloud() {
  const remote = await Cloud.load();
  if (!remote) return false;
  const local = G.meta;
  const score = m => (m?.totalStardust || 0) + (m?.runs || 0) * 10 + (m?.wins || 0) * 1000;
  if (remote.meta && score(remote.meta) >= score(local)) { G.meta = normalizeMeta(remote.meta); try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.meta)); } catch { /* */ } }
  else Cloud.pushMeta(local);
  const ls = loadRunSave();
  if (remote.save && (!ls || remote.save.at > ls.at)) { G.save = remote.save; try { localStorage.setItem(RUN_KEY, JSON.stringify(remote.save)); } catch { /* */ } }
  else if (ls && (!remote.save || ls.at > remote.save.at)) Cloud.putSave(ls);
  G.cloudRuns = remote.runs || [];
  return true;
}

export const rank = key => G.meta.research[key] || 0;
export function starterUnlocked(s) { return !s.unlock || G.meta.badges.includes(s.unlock); }

// ---------------------------------------------------------------- new run
export function newRun(starterSpecies, seed = randomSeedString()) {
  const kit = STARTERS.find(s => s.species === starterSpecies) || STARTERS[0];
  const rng = new RNG(seed);
  const level = 5 + rank('level') * 2;
  const heat = G.meta.heat || 0;
  const run = {
    seed, rng, starter: kit.species, species: kit.species, level, exp: expForLevel(PLAYER_CURVE, level),
    slots: { ...kit.slots }, known: Object.values(kit.slots), hp: null, maxHpMul: 1 + rank('hp') * 0.04,
    boons: [], chaos: [], held: null, money: 50 + rank('money') * 25, balls: 3 + rank('balls'), ballType: 'poke_ball',
    callBonus: rank('call') * 2, heat,
    partner: null, callGauge: 0, revives: rank('revive'), reviveFrac: 0.3, rerolls: rank('reroll'),
    biome: 0, roomInBiome: 0, depth: 0, kills: 0, time: 0, stardustGained: 0, caught: [],
    pendingLearn: [], pendingEvo: null, focusUsed: false, visited: {}, lastLayouts: [],
    history: [], over: false, won: false,
  };
  G.run = run;
  run.hp = playerMaxHp(run);
  return run;
}

// The player's POKéMON gets floors on HP and defenses (like Hades giving every weapon the same health),
// so frail picks such as GASTLY or PIKACHU are a different playstyle rather than a handicap.
export function playerStats(run) {
  const st = monStats(run.species, run.level, 20);
  st.hp = Math.max(st.hp, floorStat(run.level, 70, true));
  st.def = Math.max(st.def, floorStat(run.level, 70));
  st.spd = Math.max(st.spd, floorStat(run.level, 70));
  return st;
}
function floorStat(level, base, hp) { const c = Math.floor(((2 * base + 20) * level) / 100); return hp ? c + level + 10 : c + 5; }
export function playerMaxHp(run) {
  let mul = run.maxHpMul;
  for (const c of run.chaos) if (c.active && c.blessing.hp) mul += c.blessing.hp;
  return Math.round(playerStats(run).hp * 3 * mul);
}

// Build the player actor for a room from the run state.
export function makePlayer(run, x, y) {
  const a = makeActor(run.species, run.level, 'player', { x, y, iv: 20, hpMul: 3 });
  a.stats = playerStats(run);
  a.maxHp = playerMaxHp(run); a.hp = Math.min(run.hp, a.maxHp);
  a.ghost = false; // the player never phases through walls
  a.flying = false;
  a.dashCharges = 1 + rank('dash'); a.dashRecharge = 0.55;
  a.slotMul = {}; a.slotCrit = {}; a.cdMul = {}; a.critBonus = 0; a.moneyMul = 1;
  a.dmgMul = 1 + rank('power') * 0.03;
  for (const b of run.boons) BOONS[b.key]?.stat?.(a, boonInstance(run, b));
  for (const c of run.chaos) if (c.active) c.blessing.stat?.(a);
  if (run.held) HELD[run.held]?.stat?.(a);
  if (run.held && HELD[run.held].type) a.typeBoost = { type: HELD[run.held].type, mult: 1.25 };
  return a;
}

// ---------------------------------------------------------------- combat hooks (boons, items, chaos)
export function buildHooks(run, world) {
  const list = run.boons.map(b => ({ def: BOONS[b.key], inst: boonInstance(run, b) })).filter(x => x.def);
  const each = (name, ...args) => { for (const { def, inst } of list) def[name]?.(...args, inst); };
  const held = run.held;
  const hurtMul = run.chaos.filter(c => !c.active && c.curse.hurt).reduce((m, c) => m * c.curse.hurt, 1);
  const healMul = run.chaos.filter(c => !c.active && c.curse.healMul).reduce((m, c) => m * c.curse.healMul, 1);
  // wrap heal once per world (buildHooks runs again on every refresh)
  world._baseHeal ??= world.heal.bind(world);
  world.heal = healMul === 1 ? world._baseHeal : (a, amt) => world._baseHeal(a, a.team === 'player' ? Math.round(amt * healMul) : amt);
  return {
    beforeHit(w, info) {
      if (info.src?.team === 'player' && info.src.typeBoost && info.p.type === info.src.typeBoost.type) info.dmg = Math.round(info.dmg * info.src.typeBoost.mult);
      each('beforeHit', w, info);
    },
    onHit(w, info) {
      if (info.src === w.player) {
        run.callGauge = Math.min(1, run.callGauge + (info.dmg || 0) / (info.target.maxHp * 6) * (held === 'EXP_SHARE' ? 1.6 : 1) * (1 + rank('call') * 0.2) + 0.004);
        if (held === 'KINGS_ROCK' && info.slot === 'attack' && w.rand() < 0.12) w.addStatus(info.target, 'flinch', info.src);
      }
      each('onHit', w, info);
    },
    beforeHurt(w, ctx) {
      if (ctx.target !== w.player) return;
      ctx.dmg = Math.round(ctx.dmg * hurtMul);
      if (held === 'BRIGHT_POWDER' && ctx.slot !== 'dot' && ctx.slot !== 'self' && w.rand() < 0.12) { ctx.dmg = 0; w.text(w.player, 'DODGE', '#ffffff'); return; }
      const before = ctx.dmg;
      each('beforeHurt', w, ctx);
      if (before > 0 && ctx.dmg === 0) { for (const { def, inst } of list) def.onDodge?.(w, inst); return; }
      if (ctx.dmg > 0 && ctx.slot !== 'dot') { each('onHurt', w, ctx); run.callGauge = Math.min(1, run.callGauge + 0.03); }
    },
    beforeDeath(w, ctx) {
      if (ctx.target !== w.player) return;
      const p = w.player;
      if (held === 'FOCUS_BAND' && !run.focusUsed) { run.focusUsed = true; p.hp = 1; ctx.prevent = true; w.text(p, 'hung on using its FOCUS BAND!', '#ffd080'); p.iframes = 1.5; return; }
      if (run.revives > 0) {
        run.revives--; ctx.prevent = true; p.hp = Math.round(p.maxHp * run.reviveFrac); p.iframes = 2.5;
        w.emit({ type: 'revive' });
      }
    },
    onKill(w, e, src) {
      if (held === 'SHELL_BELL') w.heal(w.player, Math.max(1, Math.round(w.player.maxHp * 0.03)));
      each('onKill', w, e);
    },
    onDash(w, a) { each('onDash', w, a); },
    onCast(w, a) { each('onCast', w, a); },
    onCastHit(w, e) { each('onCastHit', w, e); }, // a Cast debuff (Growl...) touched a foe
    onFreeze(w, e) { each('onFreeze', w, e); },
    onSlam(w, e) { each('onSlam', w, e); },
    onTick(w, dt) {
      if (held === 'LEFTOVERS' && w.player && !w.player.dead && w.enemies().length) {
        w.leftT = (w.leftT || 0) + dt;
        if (w.leftT > 2) { w.leftT = 0; if (w.player.hp < w.player.maxHp) w.heal(w.player, Math.max(1, Math.round(w.player.maxHp * 0.01))); }
      }
      for (const { def, inst } of list) def.onTick?.(w, inst);
    },
    onRoomStart(w) { each('onRoom', w); },
    onSpawn(w, e) { for (const c of run.chaos) if (!c.active) c.curse.spawn?.(e); },
    onRoomClear(w) { each('onClear', w); },
  };
}

// ---------------------------------------------------------------- EXP, levels, evolution
export function expFor(run, enemy, trainer) {
  const base = Math.floor((enemy.expYield || 50) * enemy.level / 7) * (trainer ? 1.5 : 1);
  let mul = 1.25 * (1 + rank('exp') * 0.05) * (run.held === 'LUCKY_EGG' ? 1.5 : 1);
  if (enemy.boss) mul *= 2;
  return Math.max(1, Math.round(base * mul));
}

// returns events [{type:'level', level}] and queues learn/evolve prompts for the next room clear
export function gainExp(run, amount) {
  const ev = [];
  const rate = PLAYER_CURVE;
  run.exp += amount;
  while (run.level < 100 && run.exp >= expForLevel(rate, run.level + 1)) {
    const beforeMax = playerMaxHp(run);
    run.level++;
    run.hp += playerMaxHp(run) - beforeMax;
    ev.push({ type: 'level', level: run.level });
    for (const mv of movesLearnedAt(run.species, run.level)) if (!PLAYER_BANNED.has(mv) && !run.known.includes(mv) && !run.pendingLearn.includes(mv)) run.pendingLearn.push(mv);
    checkEvolution(run);
  }
  return ev;
}
// Every evolution method has a level here, so every line can finish evolving in a run:
// level methods at their level, trade/friendship/beauty at 30, stones at 32, SPECIAL_EVOS overrides.
export function nextEvolution(sp, level, stats) {
  if (SPECIAL_EVOS[sp] && level >= SPECIAL_EVOS[sp][0]) return SPECIAL_EVOS[sp][1];
  const into = levelEvolution(sp, level, stats) || easyEvolution(sp, level);
  if (into) return into;
  for (const e of D.species[sp]?.evolutions || []) {
    if (/^LEVEL/.test(e.method) && e.method !== 'LEVEL_SHEDINJA' && level >= e.param) return e.into; // Tyrogue without stats, Wurmple, Nincada
    if ((e.method === 'ITEM' && level >= 32) || (e.method === 'BEAUTY' && level >= 30)) return e.into;
  }
  return null;
}
export function partnerLevel(run) { return Math.max(run.partner?.level || 1, run.level - 2); }
// The caught partner grows with you: evolve it as far as its level allows (returns the old species if it changed).
export function evolvePartner(run) {
  const pt = run.partner;
  if (!pt) return null;
  const from = pt.species;
  for (let i = 0; i < 3; i++) { const into = nextEvolution(pt.species, partnerLevel(run)); if (!into || !D.species[into]) break; pt.species = into; }
  return pt.species !== from ? from : null;
}

export function checkEvolution(run) {
  const was = evolvePartner(run);
  if (was) run.partnerEvo = [was, run.partner.species];
  if (run.pendingEvo) return;
  const sp = run.species;
  let into = nextEvolution(sp, run.level, playerStats(run));
  if (sp === 'EEVEE' && run.level >= 20) into = 'CHOICE';
  if (into && (into === 'CHOICE' || D.species[into])) run.pendingEvo = into;
}
export function evolve(run, into) {
  const beforeMax = playerMaxHp(run);
  run.species = into;
  run.exp = Math.max(run.exp, expForLevel(PLAYER_CURVE, run.level));
  run.hp += playerMaxHp(run) - beforeMax;
  run.pendingEvo = null;
  for (const mv of movesLearnedAt(into, run.level)) if (!run.known.includes(mv) && !run.pendingLearn.includes(mv)) run.pendingLearn.push(mv);
  // offer the best move of the new form's own type it could already know (Eevee -> Flareon gets Ember)
  const types = D.species[into].types;
  const own = (D.species[into].learnset || []).filter(([l, m]) => l <= run.level && D.moves[m] && types.includes(D.moves[m].type) && D.moves[m].power > 0 && !run.known.includes(m) && !run.pendingLearn.includes(m));
  if (own.length && !Object.values(run.slots).some(m => types.includes(D.moves[m]?.type))) run.pendingLearn.push(own[own.length - 1][1]);
}
export function learnMove(run, move, slot) {
  if (slot) run.slots[slot] = move;
  if (!run.known.includes(move)) run.known.push(move);
}
export function expProgress(run) {
  const rate = PLAYER_CURVE;
  const a = expForLevel(rate, run.level), b = expForLevel(rate, run.level + 1);
  return Math.max(0, Math.min(1, (run.exp - a) / Math.max(1, b - a)));
}

// ---------------------------------------------------------------- rewards
export const REWARD_INFO = {
  boon: { name: 'Legendary blessing' },
  rare_candy: { name: 'RARE CANDY', icon: 'gfx/items/rare_candy.png', desc: '+2 levels' },
  hp_up: { name: 'HP UP', icon: 'gfx/items/hp_up.png', desc: '+15% max HP, heal 25%' },
  pp_up: { name: 'PP UP', icon: 'gfx/items/pp_up.png', desc: 'Power up a blessing' },
  money: { name: 'NUGGET', icon: 'gfx/items/nugget.png', desc: 'Money' },
  tm: { name: 'TM', icon: 'gfx/items/tm01.png', desc: 'Learn a new move' },
  stardust: { name: 'STARDUST', icon: 'gfx/items/stardust.png', desc: 'For Oak\'s research' },
  star_piece: { name: 'STAR PIECE', icon: 'gfx/items/star_piece.png', desc: 'Lots of STARDUST' },
  balls: { name: 'POKé BALLS', icon: 'gfx/items/poke_ball.png', desc: '+3 POKé BALLS' },
  held: { name: 'HELD ITEM', icon: 'gfx/items/leftovers.png', desc: 'An item to hold' },
  shop: { name: 'POKé MART', icon: 'gfx/items/poke_doll.png', desc: 'Buy items' },
  center: { name: 'POKéMON CENTER', icon: 'gfx/items/full_restore.png', desc: 'Heal up' },
  chaos: { name: 'DEOXYS', desc: 'A strange bargain' },
  trainer: { name: 'TRAINER BATTLE', icon: 'gfx/items/exp_share.png', desc: 'Tough fight, a held item' },
  boss: { name: 'BOSS', desc: '' },
};

const LEGEND_KEYS = ['ZAPDOS', 'ARTICUNO', 'MOLTRES', 'MEW', 'LUGIA', 'HOOH'];

// Pick 1-3 door rewards for the rooms after this one.
export function rollDoors(run, nExits) {
  const rng = run.rng;
  const biome = BIOMES[run.biome];
  const next = run.roomInBiome + 1;
  const last = next >= biome.rooms; // next room is the boss
  if (last) return [{ kind: 'boss' }];
  if (next === biome.rooms - 1) return [{ kind: 'center' }]; // rest stop before the boss
  const n = Math.max(1, Math.min(nExits, rng.chance(0.25) ? 3 : 2));
  const pool = [];
  const add = (kind, w, extra = {}) => pool.push({ kind, w, ...extra });
  const ownedLegends = [...new Set(run.boons.map(b => BOONS[b.key].legend))];
  // boons are the most common reward; prefer legends you already have a little less once you have 3
  for (const L of LEGEND_KEYS) add('boon', run.boons.length < 2 ? 3 : 1.6, { legend: L });
  add('rare_candy', 2.2); add('hp_up', 1.4); add('money', 1.5); add('tm', 1.3); add('stardust', 1.4);
  if (run.boons.length) add('pp_up', 1.4);
  if (run.balls < 3) add('balls', 1.0);
  if (!run.visited.shop?.[run.biome] && next >= 2) add('shop', 2.4);
  if (!run.visited.center?.[run.biome] && next >= 3 && next <= biome.rooms - 3) add('center', 1.0);
  if (!run.visited.trainer?.[run.biome] && next >= 2 && !biome.trainerOnly) add('trainer', 1.6);
  if (run.depth > 3 && rng.chance(0.25) && !run.chaos.some(c => !c.active)) add('chaos', 1.2);
  if (rng.chance(0.15)) add('star_piece', 0.8);
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const pick = rng.weighted(pool, x => x.w);
    out.push({ kind: pick.kind, legend: pick.legend });
    // no duplicate kinds (or same legend) among the doors
    for (let j = pool.length - 1; j >= 0; j--) if (pool[j].kind === pick.kind && (pick.kind !== 'boon' || pool[j].legend === pick.legend || ownedLegends.length > 4)) pool.splice(j, 1);
  }
  return out;
}

// Offer 3 boons from a legend
export function boonChoices(run, legend) {
  const pool = legendBoonPool(legend, run).filter(b => !b.duo);
  const duos = legendBoonPool(legend, run).filter(b => b.duo);
  const rng = run.rng;
  const picks = rng.sample(pool, 3);
  if (duos.length && rng.chance(0.5)) picks[picks.length > 2 ? 2 : picks.length] = rng.pick(duos);
  return picks.filter(Boolean).map(b => {
    let rarity = b.duo ? 3 : rollRarity(rng, rank('luck') * 0.06 + (run.biome * 0.03));
    // replacing another legend's blessing in the same slot: always at least one rarity higher
    const old = b.slot !== 'passive' && run.boons.find(x => BOONS[x.key]?.slot === b.slot);
    if (old) rarity = Math.min(3, Math.max(rarity, old.rarity + 1));
    return { key: b.key, rarity, level: 1 };
  });
}
export function addBoon(run, choice) {
  const def = BOONS[choice.key];
  // one boon per slot: replace another legend's boon in the same slot
  if (def.slot !== 'passive') run.boons = run.boons.filter(b => BOONS[b.key].slot !== def.slot);
  const entry = { key: choice.key, rarity: choice.rarity, level: choice.level || 1 };
  run.boons.push(entry);
  def.onGain?.(run, boonInstance(run, entry));
}

export function tmChoices(run) {
  const sp = D.species[run.species];
  const pool = [...new Set([...(sp.tmhm || []), ...(sp.tutor || [])])].filter(m => D.moves[m] && !PLAYER_BANNED.has(m) && !run.known.includes(m) && !['CUT', 'FLY', 'SURF', 'STRENGTH', 'FLASH', 'ROCK_SMASH', 'WATERFALL', 'DIVE', 'SECRET_POWER', 'FRUSTRATION', 'RETURN', 'HIDDEN_POWER', 'ATTRACT', 'SNORE', 'SUBSTITUTE', 'ROLE_PLAY', 'MIMIC', 'SLEEP_TALK', 'ENDURE', 'CURSE', 'COUNTER', 'MIRROR_COAT', 'NATURE_POWER', 'TORMENT', 'TAUNT', 'FACADE', 'THIEF', 'DEFENSE_CURL', 'SWAGGER', 'DOUBLE_EDGE', 'MEGA_KICK', 'MEGA_PUNCH', 'SOFT_BOILED'].includes(m) || ['DOUBLE_EDGE'].includes(m) && false);
  const scored = pool.map(m => { const mv = D.moves[m]; let s = (mv.power || 30) / 40 + (sp.types.includes(mv.type) ? 1 : 0) + run.rng.next(); if (mv.power > 100 && run.biome < 2) s -= 1; return [m, s]; }).sort((a, b) => b[1] - a[1]);
  return scored.slice(0, 6).sort(() => run.rng.next() - 0.5).slice(0, 3).map(x => x[0]);
}

export function heldChoices(run, n = 3) {
  const keys = Object.keys(HELD).filter(k => k !== run.held);
  const sp = D.species[run.species];
  const w = keys.map(k => [k, HELD[k].type ? (sp.types.includes(HELD[k].type) || Object.values(run.slots).some(m => D.moves[m]?.type === HELD[k].type) ? 1.4 : 0.1) : 1]);
  const out = [];
  while (out.length < n && w.length) { const pick = run.rng.weighted(w, x => x[1]); out.push(pick[0]); w.splice(w.indexOf(pick), 1); }
  return out;
}

export function chaosOffer(run) {
  const rng = run.rng;
  return rng.sample([0, 1, 2], 2).map(() => ({
    curse: rng.pick(CHAOS.curses), blessing: rng.pick(CHAOS.blessings), rooms: rng.int(3, 5), active: false,
  }));
}

export function roomsLeftInBiome(run) { return BIOMES[run.biome].rooms - run.roomInBiome; }

export { LEGENDS, RARITY, BIOMES, STARTERS, RESEARCH, HELD, profile, slotFor };
