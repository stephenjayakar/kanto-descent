// Room flow helpers: rewards, prompts (level-up moves, evolution), shop, center, Deoxys, hub,
// pause, death, victory and moving between rooms.
import { Engine, W, H, setScene, pushOverlay, popOverlay } from '../engine/core.js';
import { img, ready, preload, tinted } from '../engine/assets.js';
import { text, measure, wrap } from '../engine/font.js';
import { pixBox, rect, windowFrame } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { D, TYPE_COLORS } from '../game/data.js';
import { TILE, setAnim } from '../game/combat.js';
import { profile, slotFor } from '../game/moves_rt.js';
import { serializeRun, restoreRun, loadRunSave, clearRunSave, recordRun, runLabel } from '../game/run.js';
import { Cloud } from '../game/cloud.js';
import { G, newRun, makePlayer, buildHooks, gainExp, evolve, learnMove, boonChoices, addBoon, tmChoices, heldChoices, chaosOffer, saveMeta, rank, playerMaxHp, REWARD_INFO, starterUnlocked } from '../game/run.js';
import { BOONS, LEGENDS, RARITY, SLOT_NAMES, boonInstance } from '../game/boons.js';
import { BIOMES, STARTERS, HELD, RESEARCH, EEVEE_CHOICES, BOSS_UNLOCK_TEXT, HEAT, ACTS, STAGES, areaOf, areaAt, areaByKey, actOf } from '../game/content.js';
import { BOSSES } from '../game/bosses.js';
import { candidates } from '../game/rooms.js';
import { preloadPmd, drawPmd } from '../game/pmd.js';
import { say, choose, chooseBoth, Banner, drawPortrait, ICON, drawOW, Choice } from './ui.js';
import { Coop, asP2, coopHeal, coopRefreshP2, coopWrapHooks, coopTeam, coopSendRun, coopResetP2 } from '../game/coop.js';
recordRun.after = entry => coopSendRun(entry, Cloud.me?.name || 'P1');
import { drawBA } from '../game/render.js';

let RoomSceneRef = null;
export function registerRoomScene(cls) { RoomSceneRef = cls; }
const go = spec => setScene(new RoomSceneRef(spec));

// ---------------------------------------------------------------- moving between rooms
function pickRoom(run) {
  const B = areaOf(run);
  const opts = [];
  for (const [layout, idxs] of B.pools) for (const i of idxs) if (candidates(layout)[i]) opts.push({ layout, cropIndex: i });
  const fresh = opts.filter(o => !run.lastLayouts.includes(o.layout + o.cropIndex));
  const pick = run.rng.pick(fresh.length ? fresh : opts);
  run.lastLayouts = [...run.lastLayouts.slice(-3), pick.layout + pick.cropIndex];
  return pick;
}

export function goNext(scene, reward) {
  const run = G.run;
  if (scene.spec.kind === 'hub') {
    run.biome = 0; run.roomInBiome = 0; run.depth = 0;
    G.meta.runs++; saveMeta();
    return go({ kind: 'combat', ...pickRoom(run), reward: { kind: 'boon', legend: run.rng.pick(['ZAPDOS', 'ARTICUNO', 'MOLTRES', 'MEW', 'LUGIA', 'HOOH']) }, first: true });
  }
  run.depth++;
  if (reward.kind === 'victory') return victory();
  if (reward.kind === 'next') {
    run.biome++; run.roomInBiome = 0; run.focusUsed = false;
    return go({ kind: 'combat', ...pickRoom(run), reward: { kind: 'boon', legend: run.rng.pick(['ZAPDOS', 'ARTICUNO', 'MOLTRES', 'MEW', 'LUGIA', 'HOOH']) }, first: true });
  }
  run.roomInBiome++;
  const B = areaOf(run);
  switch (reward.kind) {
    case 'boss': return go({ kind: 'boss', layout: B.bossRoom[0], cropIndex: B.bossRoom[1], boss: B.boss });
    case 'center': (run.visited.center ??= {})[run.biome] = true; return go({ kind: 'center', layout: 'LAYOUT_POKEMON_CENTER_1F', cropIndex: 0, preBoss: run.roomInBiome >= B.rooms - 1, shopRoom: true });
    case 'shop': (run.visited.shop ??= {})[run.biome] = true; return go({ kind: 'shop', layout: 'LAYOUT_MART', cropIndex: 0, shopRoom: true });
    case 'chaos': return go({ kind: 'chaos', ...pickRoom(run) });
    case 'trainer': (run.visited.trainer ??= {})[run.biome] = true; return go({ kind: 'trainer', ...pickRoom(run), reward: { kind: 'held' } });
    default: return go({ kind: 'combat', ...pickRoom(run), reward });
  }
}

export function rewardLabel(r) {
  if (r.kind === 'boon') return `${LEGENDS[r.legend].name}'s blessing`;
  if (r.kind === 'next') return `Onward to ${G.run.biome + 1 < STAGES ? areaAt(G.run, G.run.biome + 1).name : '...'}`;
  if (r.kind === 'victory') return 'Leave CERULEAN CAVE';
  if (r.kind === 'start') return 'Head out toward CERULEAN CAVE';
  if (r.kind === 'boss') return `${areaOf(G.run).name}: the boss awaits`;
  return REWARD_INFO[r.kind]?.name + (REWARD_INFO[r.kind]?.desc ? ` - ${REWARD_INFO[r.kind].desc}` : '');
}

// Doors: FireRed's blinking warp arrow (gfx/misc/field_effects/arrow.png, 16x16 frames: up, up, down, down,
// left, left, right, right) on the exit, pointing out of the room. The reward floats above it in a FireRed
// window (drawDoorIcon, drawn as a vfx so it sits above the sprites and the dark crop mask).
const ARROW = 'gfx/misc/field_effects/arrow.png';
const ARROW_ROW = { up: 0, down: 2, left: 4, right: 6 };
export function drawWarpArrow(ctx, dir, x, y, t) {
  const im = img(ARROW);
  if (!ready(im)) return;
  const f = ARROW_ROW[dir] + (Math.floor(t * 3.75) % 2);
  ctx.drawImage(im, 0, f * 16, 16, 16, Math.round(x - 8), Math.round(y - 8), 16, 16);
}
// which way an exit leads: the room edge it's on, else the side that's blocked (a door in a wall), else away from the middle
export function exitDir(room, d) {
  const w = room.w, h = room.h, tx = d.tx ?? Math.floor(d.x / TILE), ty = d.ty ?? Math.floor(d.y / TILE);
  if (ty <= 1) return 'up';
  if (tx <= 1) return 'left';
  if (tx >= w - 2) return 'right';
  if (ty >= h - 2) return 'down';
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (!room.reach || room.reach[y * w + x]);
  if (!open(tx, ty - 1)) return 'up';
  if (!open(tx, ty + 1)) return 'down';
  if (!open(tx - 1, ty)) return 'left';
  if (!open(tx + 1, ty)) return 'right';
  const c = room.center || { x: w * 8, y: h * 8 }, dx = d.x - c.x, dy = d.y - c.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}
export function drawDoor(ctx, scene, d) {
  d.dir ??= exitDir(scene.room, d);
  const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d.dir];
  drawWarpArrow(ctx, d.dir, d.x + v[0] * 2, d.y + v[1] * 2, d.t || 0);
}
// The picture for a reward, at world scale (1 unit = 1 GBA pixel). Portraits are 40x40 and drawn at exactly half
// size, which is 1:1 on screen since the world is drawn at 2x.
function rewardSprite(r) {
  const info = REWARD_INFO[r.kind] || {};
  if (r.kind === 'boon') return { src: ICON.portrait(LEGENDS[r.legend].dex), w: 20, h: 20, sw: 40, sh: 40 };
  if (r.kind === 'chaos') return { src: ICON.portrait(386), w: 20, h: 20, sw: 40, sh: 40 };
  if (r.kind === 'boss' || r.kind === 'next' || r.kind === 'victory') return { src: 'gfx/misc/emotes/double_exclamation.png', w: 16, h: 16, sw: 16, sh: 16 };
  if (info.ow) return { src: ICON.ow(info.ow), w: 16, h: 22, sw: 16, sh: 22, sy: 10 }; // the clerk / Nurse Joy (frame 0, minus empty rows)
  if (info.icon) return { src: info.icon, w: 24, h: 24, sw: 24, sh: 24, pad: 0 }; // item icons have their own margins
  return null;
}
// a reward picture in a small FireRed window, centred on (x, y) in world units
export function drawRewardIcon(ctx, r, x, y) {
  const s = rewardSprite(r);
  if (!s) return;
  const pad = s.pad ?? 3, bw = s.w + 2 * pad + 4, bh = s.h + 2 * pad + 4;
  x = Math.round(x); y = Math.round(y);
  const bx = x - Math.round(bw / 2), by = y - Math.round(bh / 2);
  const portrait = s.sw === 40;
  if (portrait) { // a portrait fills its window: a thin frame in the legend's colour reads better than a white border
    const col = r.kind === 'boon' ? LEGENDS[r.legend].color : r.kind === 'chaos' ? '#d050a0' : '#f8f8f8';
    pixBox(ctx, x - 12, y - 12, 24, 24, '#f8f8f8', '#283040', 2);
    rect(ctx, x - 11, y - 11, 22, 22, col);
  } else windowFrame(ctx, bx, by, bw, bh, 'type1');
  const im = img(s.src);
  if (ready(im)) ctx.drawImage(im, 0, s.sy || 0, s.sw, s.sh, x - s.w / 2, y - s.h / 2, s.w, s.h);
}
export function drawDoorIcon(ctx, scene, d) {
  if (d.used && scene.state === 'exiting') return;
  drawRewardIcon(ctx, d.reward, d.x, d.y - 22 + Math.round(Math.sin((d.t || 0) * 3) * 1.5));
}
// doors get their floating icon as a long-lived vfx (above sprites and the map's over layer)
export function addDoorIcons(scene) {
  for (const d of scene.doors) scene.world.vfx.push({ kind: 'custom', t: 0, life: 1e9, door: d, draw: c => drawDoorIcon(c, scene, d) });
}

// ---------------------------------------------------------------- rewards in the room
export function spawnReward(scene, reward, at) {
  const w = scene.world;
  const info = REWARD_INFO[reward.kind] || {};
  const pt = w.reachable(at.x, at.y) ? at : w.nearestReachable(at.x, at.y);
  const k = { x: pt.x, y: pt.y, z: 20, vz: 60, t: 0, magnet: false, reward, icon: reward.kind === 'boon' ? ICON.portrait(LEGENDS[reward.legend].dex) : reward.kind === 'held' ? 'gfx/items/leftovers.png' : info.icon };
  if (reward.kind === 'boon') { k.icon = BALL_ICON; k.boon = reward.legend; }
  w.pickups.push(k);
  scene.rewardPickup = k;
  // a boon pickup is FireRed's overworld item ball on a ring of the legend's colour, its portrait bobbing above
  if (k.boon) w.vfx.push({ kind: 'custom', t: 0, life: 9999, pick: k, draw: (ctx) => { if (!k.dead) drawBoonBall(ctx, k, w.time); } });
  Sound.playSE('se_ball_bounce_1');
}

const BALL_ICON = 'gfx/overworld/misc/item_ball.png';
function drawBoonBall(ctx, k, t) {
  const L = LEGENDS[k.boon], gx = Math.round(k.x), gy = Math.round(k.y + 5);
  // the ring on the ground, pulsing, in the legend's colour
  const p = 0.5 + 0.5 * Math.sin(t * 4);
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.25 * p; ctx.fillStyle = L.color;
  ctx.beginPath(); ctx.ellipse(gx, gy, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = L.color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(gx, gy, 10 + p * 2, 4.5 + p, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // the ball again on top of the ring (same bob as the pickup itself)
  const by = k.y - (k.z || 0) - Math.sin(t * 4 + k.x) * 1.5;
  const bim = img(BALL_ICON);
  if (ready(bim)) ctx.drawImage(bim, Math.round(k.x - 8), Math.round(by - 8));
  // the legend's portrait above, 1:1 on screen (40x40 drawn at half size in the 2x world)
  if ((k.z || 0) > 2) return;
  const py = Math.round(k.y - 22 + Math.sin(t * 3) * 2);
  drawRewardIcon(ctx, { kind: 'boon', legend: k.boon }, k.x, py);
  // FireRed's small field sparkle twinkling at the window's corners (2 frames: small, big)
  const sp = img('gfx/misc/field_effects/small_sparkle.png');
  if (ready(sp)) { const n = Math.floor(t * 2.5), corner = n % 4, f = Math.floor(t * 10) % 2; ctx.drawImage(sp, 0, f * 16, 16, 16, Math.round(k.x + (corner % 2 ? 9 : -9) - 8), Math.round(py + (corner < 2 ? -9 : 9) - 8), 16, 16); }
}

export async function onPickup(scene, k) {
  if (!k.reward) return;
  for (const v of scene.world.vfx) if (v.pick === k) v.gone = true;
  await applyReward(scene, k.reward);
  scene.openDoors();
}

export async function applyReward(scene, r) {
  const run = G.run, w = scene.world;
  const mm = w.player.moneyMul || 1;
  switch (r.kind) {
    case 'boon': await offerBoons(scene, r.legend); break; // co-op: both players pick their own at the same time
    case 'rare_candy': {
      Sound.playFanfare('mus_level_up');
      const target = run.level + 2;
      const rate = 'MEDIUM_SLOW';
      const { expForLevel } = await import('../game/data.js');
      gainExp(run, expForLevel(rate, target) - run.exp);
      await say([`${D.species[run.species].name} grew to Lv. ${run.level}!`]);
      refreshPlayer(scene);
      await levelPrompts(scene);
      break;
    }
    case 'hp_up': run.maxHpMul += 0.15; refreshPlayer(scene);
      if (run.isP2) coopHeal(scene, 0.25); else { w.heal(w.player, Math.round(w.player.maxHp * 0.25)); run.hp = w.player.hp; }
      if (Coop.p2 && !run.isP2 && !r.mine) { Coop.p2.run.maxHpMul += 0.15; coopRefreshP2(scene); coopHeal(scene, 0.25); }
      Sound.playSE('se_m_stat_increase'); await say([Coop.p2 ? 'Max HP rose by 15% for both of you!' : 'Max HP rose by 15%!']); break;
    case 'pp_up': await ppUp(scene); await asP2(scene, () => ppUp(scene)); break;
    case 'money': { const n = Math.round((70 + run.biome * 30 + run.rng.int(0, 20)) * mm); run.money += n; Sound.playSE('se_shop'); scene.banners.push(new Banner(`¥${n}`, 'You sold the NUGGET.', { life: 1.4, color: '#f8d030' })); break; }
    case 'tm': await offerTMs(scene); await asP2(scene, () => offerTMs(scene)); break;
    case 'stardust': case 'star_piece': { const n = Math.round((r.kind === 'star_piece' ? 40 + run.biome * 8 : run.rng.int(10, 16) + run.biome * 4) * (1 + 0.1 * (run.heat || 0))); G.meta.stardust += n; G.meta.totalStardust += n; run.stardustGained += n; saveMeta(); Sound.playSE('se_shiny'); scene.banners.push(new Banner(`+${n} STARDUST`, "Bring it to PROF. OAK.", { life: 1.4, color: '#c0e0ff' })); break; }
    case 'balls': run.balls += 3; Sound.playSE('se_ball_tray_ball'); scene.banners.push(new Banner('+3 POKé BALLS', '', { life: 1.2 })); break;
    case 'held': await offerHeld(scene); await asP2(scene, () => offerHeld(scene)); break;
  }
}

async function offerBoons(scene, legend) {
  if (Coop.active && scene.world?.p2 && Coop.p2 && !G.run.isP2) return offerBoonsBoth(scene, legend);
  const run = G.run, L = LEGENDS[legend];
  Sound.playCry(L.cry);
  const ch = boonChoices(run, legend);
  if (!ch.length) { await say([{ text: `${L.name} has nothing more to offer. It leaves you a RARE CANDY.`, portrait: L.dex }]); await applyReward(scene, { kind: 'rare_candy' }); return; }
  const cards = ch.map(c => boonCard(run, c));
  const i = await choose(`${L.name}`, cards, {
    header: (ctx, y, cx) => {
      drawPortrait(ctx, L.dex, cx - 150, y - 56, 'Normal');
      text(ctx, L.name, cx - 100, y - 54, { color: [L.color, '#202020'], scale: 2 });
      text(ctx, L.title + ' offers you its power.', cx - 100, y - 24, { color: 'whiteSoft', font: 'small' });
    },
    side: (ctx, o) => drawOwnedBoons(ctx, run, BOONS[ch[o.sel]?.key]?.slot),
    footer: 'One blessing per slot. Replacing one comes a rarity higher.',
    canSkip: true,
  });
  if (i >= 0) {
    addBoon(run, ch[i]);
    refreshPlayer(scene);
    Sound.playSE('se_m_stat_increase');
  }
}

// Co-op: the legend offers each player their own three blessings, picked at the same time.
async function offerBoonsBoth(scene, legend) {
  const L = LEGENDS[legend], runs = [G.run, Coop.p2.run];
  const chs = runs.map(r => boonChoices(r, legend));
  if (!chs[0].length && !chs[1].length) { await say([{ text: `${L.name} has nothing more to offer. It leaves you a RARE CANDY.`, portrait: L.dex }]); return applyReward(scene, { kind: 'rare_candy' }); }
  Sound.playCry(L.cry);
  const picks = await chooseBoth(runs.map((r, i) => ({
    title: i === 0 ? `PLAYER 1 - ${Cloud.me?.name || 'YOU'}` : `PLAYER 2 - ${Coop.guest?.name || 'P2'}`,
    cards: chs[i].map(c => boonCard(r, c)),
    empty: `${L.name} has nothing more for this player.`,
    owned: (ctx, x, y, w, sel) => drawOwnedCompact(ctx, r, BOONS[chs[i][sel]?.key]?.slot, x, y, w),
  })), {
    header: ctx => {
      drawPortrait(ctx, L.dex, W / 2 - 120, 10, 'Normal');
      text(ctx, L.name, W / 2 - 70, 12, { color: [L.color, '#202020'], scale: 2 });
      text(ctx, L.title + ' offers each of you its power.', W / 2 - 70, 42, { color: 'whiteSoft', font: 'small' });
    },
  });
  picks.forEach((p, i) => { if (p >= 0) addBoon(runs[i], chs[i][p]); });
  refreshPlayer(scene); coopRefreshP2(scene);
  if (picks.some(p => p >= 0)) Sound.playSE('se_m_stat_increase');
}
function drawOwnedCompact(ctx, run, slot, x, y, w) {
  const list = [...run.boons];
  text(ctx, list.length ? 'BLESSINGS' : 'No blessings yet.', x + 4, y, { font: 'small', color: 'gray' });
  list.slice(0, 8).forEach((b, i) => {
    const def = BOONS[b.key], rar = RARITY[b.rarity], cx = x + 4 + (i % 2) * (w / 2), cy = y + 12 + Math.floor(i / 2) * 11;
    const repl = slot && slot !== 'passive' && def.slot === slot;
    text(ctx, (repl ? 'x ' : '') + def.name, cx, cy, { font: 'small', color: repl ? 'red' : [rar.color, '#202020'] });
  });
}

// Left panel on the boon screen: the blessings you already have; the one the highlighted card would replace is marked.
function drawOwnedBoons(ctx, run, slot) {
  const x = 12, y = 40, w = 264;
  const list = [...run.boons].sort((a, b) => Object.keys(SLOT_NAMES).indexOf(BOONS[a.key].slot) - Object.keys(SLOT_NAMES).indexOf(BOONS[b.key].slot));
  const rowH = list.length > 7 ? 24 : 40, h = Math.max(60, 26 + list.length * rowH + 4);
  pixBox(ctx, x, y, w, Math.min(h, H - 80), '#141824', '#404860', 3);
  text(ctx, 'YOUR BLESSINGS', x + 10, y + 7, { color: 'gold', font: 'small' });
  if (!list.length) text(ctx, 'None yet.', x + 10, y + 26, { color: 'gray', font: 'small' });
  list.forEach((b, i) => {
    const def = BOONS[b.key], rar = RARITY[b.rarity], ry = y + 24 + i * rowH;
    if (ry + rowH > H - 80) return;
    const repl = slot && slot !== 'passive' && def.slot === slot;
    if (repl) pixBox(ctx, x + 4, ry - 2, w - 8, rowH - 2, '#401818', '#e04040', 2);
    text(ctx, def.name, x + 10, ry, { font: 'small', color: [rar.color, '#202020'] });
    const tag = repl ? 'REPLACED' : `${SLOT_NAMES[def.slot]}${b.level > 1 ? ' Lv' + b.level : ''}`;
    text(ctx, tag, x + w - 10, ry, { align: 'right', font: 'small', color: repl ? 'red' : 'gray' });
    if (rowH > 30) text(ctx, wrap(def.desc(boonInstance(run, b)), w - 20, 'small')[0] || '', x + 10, ry + 12, { font: 'small', color: 'whiteSoft' });
  });
}

function boonCard(run, c) {
  const def = BOONS[c.key], L = LEGENDS[def.legend], rar = RARITY[c.rarity];
  const inst = boonInstance(run, c);
  const replacing = def.slot !== 'passive' ? run.boons.find(b => BOONS[b.key].slot === def.slot) : null;
  return {
    title: def.name, sub: SLOT_NAMES[def.slot], desc: def.desc(inst) + (replacing ? `  (Replaces ${BOONS[replacing.key].name})` : ''),
    portrait: L.dex, badge: rar.name + (def.duo ? ' DUO' : ''), badgeColor: { poke: '#606878', great: '#3060c0', ultra: '#b08000', master: '#8030c0' }[rar.key], accent: L.color,
  };
}

// "Strikes for 15 power and 20% ..." vs the next level -> "Strikes for 15→19 power and 20→25% ..."
function diffDesc(a, b) {
  const num = /(\d+(?:\.\d+)?)/;
  const pa = a.split(num), pb = b.split(num);
  if (pa.length !== pb.length) return b;
  return pb.map((t, i) => (i % 2 && t !== pa[i] ? `${pa[i]}→${t}` : t)).join('');
}

async function ppUp(scene) {
  const run = G.run;
  if (!run.boons.length) return;
  const opts = run.rng.sample(run.boons, Math.min(3, run.boons.length));
  const cards = opts.map(b => { const def = BOONS[b.key]; const next = { ...b, level: b.level + 1 }; return { title: `${def.name} Lv${b.level} → ${b.level + 1}`, desc: diffDesc(def.desc(boonInstance(run, b)), def.desc(boonInstance(run, next))), portrait: LEGENDS[def.legend].dex, accent: LEGENDS[def.legend].color }; });
  const i = await choose('PP UP', cards, { footer: 'Choose a blessing to power up.' });
  if (i >= 0) { opts[i].level++; refreshPlayer(scene); Sound.playSE('se_m_stat_increase'); }
}

async function offerTMs(scene) {
  const run = G.run;
  const tms = tmChoices(run);
  if (!tms.length) { await applyReward(scene, { kind: 'money' }); return; }
  const cards = tms.map(m => moveCard(m));
  const i = await choose('Choose a TM', cards, { canSkip: true });
  if (i >= 0) await assignMove(scene, tms[i], `${D.species[run.species].name} can learn ${D.moves[tms[i]].name}!`);
}

export function moveCard(m, extra = {}) {
  const mv = D.moves[m], p = profile(m);
  const kindName = { swipe: 'melee combo', lunge: 'lunge', charge: 'charge', multi: 'flurry', proj: 'projectile', stream: 'stream', beam: 'beam', chain: 'chain lightning', nova: 'burst around you', strike: 'targeted blast', cloud: 'lingering cloud', debuff: 'lowers foe stats', buff: 'raises your stats', heal: 'heals you', protect: 'blocks attacks', teleport: 'teleport', seed: 'drain seed', dig: 'burrow & erupt', metronome: 'random move' }[p.kind] || p.kind;
  return {
    title: mv.name, sub: `${mv.type} · ${mv.power ? mv.power + ' power' : 'status'} · ${kindName}`, subColor: [TYPE_COLORS[mv.type], '#202020'],
    desc: mv.desc, icon: ICON.type(mv.type), accent: TYPE_COLORS[mv.type], ...extra,
  };
}

async function assignMove(scene, move, title) {
  const run = G.run;
  const best = slotFor(move);
  const order = [best, ...['attack', 'special', 'cast'].filter(s => s !== best)];
  const newName = D.moves[move].name;
  const brief = m => { const mv = D.moves[m], c = moveCard(m); return `${mv.name} (${c.sub})`; };
  const cards = order.map(s => {
    const cur = run.slots[s];
    const curName = cur ? D.moves[cur].name : 'nothing';
    return {
      title: `Forget ${curName}`, sub: `→ ${newName} becomes your ${SLOT_NAMES[s]}${s === best ? '  (suggested)' : ''}`, subColor: s === best ? 'green' : 'blue',
      desc: cur ? `You lose ${brief(cur)}.` : 'This slot is empty.',
      icon: cur ? ICON.type(D.moves[cur].type) : null, accent: s === best ? '#40b050' : TYPE_COLORS[D.moves[cur]?.type] || '#808080',
    };
  });
  cards.push({ title: `Don't learn ${newName}`, desc: 'Keep all your current moves.', accent: '#808080' });
  const nc = moveCard(move);
  const i = await choose(title, cards, { cardH: 46, top: 150, header: () => {}, footer: 'Learning a move means forgetting the one in that slot.', drawTop: ctx => {
    // the new move, shown big above the choices
    const bx = (W - 460) / 2, by = 34;
    text(ctx, title, W / 2, by - 24, { align: 'center', color: 'white' });
    pixBox(ctx, bx, by, 460, 96, '#fffef0', nc.accent, 3);
    text(ctx, 'NEW MOVE', bx + 10, by + 6, { font: 'small', color: 'green' });
    const im = img(nc.icon); if (ready(im)) ctx.drawImage(im, bx + 10, by + 24);
    text(ctx, newName, bx + 50, by + 21, { color: 'dark', scale: 2 });
    text(ctx, nc.sub, bx + 10, by + 50, { font: 'small', color: nc.subColor });
    wrap(nc.desc || '', 440, 'small').slice(0, 2).forEach((ln, j) => text(ctx, ln, bx + 10, by + 64 + j * 12, { font: 'small', color: 'dark' }));
  } });
  if (i >= 0 && i < 3) { learnMove(run, move, order[i]); Sound.playFanfare('mus_level_up'); refreshPlayer(scene); }
  else if (!run.known.includes(move)) run.known.push(move);
}

async function offerHeld(scene) {
  const run = G.run;
  const ks = heldChoices(run);
  const cards = ks.map(k => ({ title: HELD[k].name, desc: HELD[k].desc, icon: ICON.item(k), accent: '#c0a040', sub: run.held ? `replaces ${HELD[run.held].name}` : '' }));
  const i = await choose('Choose an item to hold', cards, { canSkip: true, footer: 'Held items stay with you for the run.' });
  if (i >= 0) { run.held = ks[i]; refreshPlayer(scene); Sound.playSE('se_m_stat_increase'); }
}

// Rebuild the player's stats/kit from the run but keep the same actor object (enemies, seeds and
// homing shots keep pointing at it) and its transient state (statuses, stages, cooldowns, shields).
export function refreshPlayer(scene) {
  if (G.run?.isP2) return coopRefreshP2(scene); // a P2 reward/level-up flow
  const run = G.run, w = scene.world, old = w.player;
  if (!old || old.dead) return;
  scene.run = w.run = run; // Oak's lab makes a fresh run when you switch starters: moves must follow it
  const np = makePlayer(run, old.x, old.y);
  const keep = ['x', 'y', 'facing', 'brain', 'pc', 'cds', 'cdMax', 'status', 'stages', 'stageTimers', 'iframes', 'id', 'action', 'seeded', 'shieldHits', 'kx', 'ky', 'dashing', 'noCollide', 'anim', 'animT', 'protect', 'deflect', 'untargetable', 'burrowed', 'speedMul', 'z', 'stun', 'lockFacing', 'hidden', 'animLock'];
  const saved = {}; for (const k of keep) saved[k] = old[k];
  for (const k of Object.keys(old)) delete old[k];
  Object.assign(old, np, saved);
  old.hp = Math.min(old.maxHp, Math.max(1, run.hp));
  old._top = 0;
  if (old.pc) old.pc.dashLeft = Math.min(old.pc.dashLeft, old.dashCharges);
  w.hooks = buildHooks(run, w);
  coopWrapHooks(w);
  preloadPmd([old.dex]);
}

// ---------------------------------------------------------------- level-up prompts (at room clear)
export async function levelPrompts(scene) {
  const run = G.run;
  if (run.partnerEvo) {
    const [from, into] = run.partnerEvo; run.partnerEvo = null;
    Sound.playFanfare('mus_evolved');
    await say([`Your partner ${D.species[from].name} evolved into ${D.species[into].name}!`]);
  }
  if (run.pendingEvo) await evolutionSequence(scene);
  while (run.pendingLearn.length) {
    const mv = run.pendingLearn.shift();
    if (run.known.includes(mv) || !D.moves[mv]) continue;
    await assignMove(scene, mv, `${D.species[run.species].name} wants to learn ${D.moves[mv].name}!`);
  }
  if (!G.run.isP2) await asP2(scene, () => levelPrompts(scene)); // co-op: then player 2's own
}

async function evolutionSequence(scene) {
  const run = G.run;
  let into = run.pendingEvo;
  if (into === 'CHOICE') {
    const i = await choose('EEVEE is ready to evolve!', EEVEE_CHOICES.map(s => ({ title: D.species[s].name, desc: D.species[s].dexText, portrait: D.species[s].dex, accent: TYPE_COLORS[D.species[s].types[0]] })), {});
    into = EEVEE_CHOICES[Math.max(0, i)];
  }
  const fromDex = D.species[run.species].dex, toDex = D.species[into].dex;
  await preloadPmd([toDex]);
  await preload([run.species, into].map(s => `gfx/pokemon/${D.species[s].sprites.front}`)); // the real front sprites (PMD fallback if missing)
  await new Promise(res => pushOverlay(new EvolutionOverlay(fromDex, toDex, run.species, into, res)));
  evolve(run, into);
  refreshPlayer(scene);
}

class EvolutionOverlay {
  constructor(fromDex, toDex, from, to, done) { this.f = fromDex; this.tdex = toDex; this.from = from; this.to = to; this.done = done; this.t = 0; this.stage = 0; }
  enter() { Sound.playBGM('mus_evolution'); Sound.playCry(this.from); }
  update(dt) {
    Input.poll();
    this.t += dt;
    if (this.stage === 0 && this.t > 5) { this.stage = 1; this.t = 0; Sound.playFanfare('mus_evolved'); Sound.playCry(this.to); }
    if (this.stage === 1 && this.t > 0.6 && (Input.justPressed('confirm') || Engine.mouse.clicked || this.t > 4)) { popOverlay(this); Sound.playBGM(areaOf(G.run)?.music || 'mus_pallet'); this.done(); }
  }
  // FireRed's evolution scene at 2x: the static background's top 112 rows (its bottom 48 are the textbox's
  // magenta placeholder), the battle textbox below, and the real front sprites (PMD fallback while they load).
  // While evolving: the swirl background (4 frames, ~8 fps), white silhouettes of both forms trading size
  // faster and faster, and sparkles spiralling in, then a white flash.
  draw(ctx) {
    const X = (W - 480) / 2, Y = (H - 320) / 2, t = this.t;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const evolving = this.stage === 0 && t > 1 && t < 4.7;
    if (evolving) { const sw = img('gfx/misc/evolution/swirl_frames.png'); if (ready(sw)) ctx.drawImage(sw, (Math.floor(t * 8) % 4) * 240, 22, 240, 112, X, Y, 480, 224); } // its eye (row 80) behind the POKéMON
    else { const bg = img('gfx/misc/evolution/static_bg.png'); if (ready(bg)) ctx.drawImage(bg, 0, 0, 240, 112, X, Y, 480, 224); }
    const cx = W / 2, cy = Y + 116; // the sprite's centre: FireRed puts the POKéMON in the middle of the top area
    if (this.stage === 0) {
      if (t <= 1) this.drawMon(ctx, this.from, this.f, cx, cy, 1, Math.max(0, t - 0.4) / 0.6);
      else if (t < 4.7) {
        // the two forms trade places, faster and faster (FireRed's shrinking/growing silhouettes)
        const k = (t - 1) / 3.7, ph = Math.sin((t - 1) * (2.2 + k * 9) * Math.PI);
        const sFrom = Math.max(0, ph), sTo = Math.max(0, -ph);
        if (sFrom > 0.02) this.drawMon(ctx, this.from, this.f, cx, cy, 0.25 + 0.75 * sFrom, 1);
        if (sTo > 0.02) this.drawMon(ctx, this.to, this.tdex, cx, cy, 0.25 + 0.75 * sTo, 1);
        this.drawSparkles(ctx, cx, cy, t - 1);
      } else this.drawMon(ctx, this.to, this.tdex, cx, cy, 1, 1);
      if (t > 4.4) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (t - 4.4) / 0.3) * (t > 4.7 ? Math.max(0, 1 - (t - 4.7) / 0.3) : 1)})`; ctx.fillRect(X, Y, 480, 224); }
      this.textbox(ctx, X, Y, [`What? ${D.species[this.from].name} is evolving!`]);
    } else {
      this.drawMon(ctx, this.to, this.tdex, cx, cy, 1, Math.max(0, 1 - t * 2));
      this.textbox(ctx, X, Y, [`Congratulations! Your ${D.species[this.from].name}`, `evolved into ${D.species[this.to].name}!`]);
    }
  }
  // the front sprite (64x64, drawn 2x), as a white silhouette when white = 1; scale for the size trading
  drawMon(ctx, species, dex, cx, cy, scale, white) {
    const path = `gfx/pokemon/${D.species[species].sprites.front}`;
    const im = img(path);
    if (ready(im)) {
      const s = Math.round(128 * scale / 2) * 2;
      ctx.drawImage(im, Math.round(cx - s / 2), Math.round(cy - s / 2), s, s);
      if (white > 0) { const wt = tinted(path, '#ffffff', 1); if (wt) { ctx.globalAlpha = Math.min(1, white); ctx.drawImage(wt, Math.round(cx - s / 2), Math.round(cy - s / 2), s, s); ctx.globalAlpha = 1; } }
      return;
    }
    ctx.save(); ctx.scale(3, 3); // fallback (front sprites not in the asset pack): the PMD sprite
    drawPmd(ctx, dex, cx / 3, (cy + 16) / 3, { anim: 'Idle', t: this.t, tint: '#ffffff', tintA: Math.min(1, white), scale });
    ctx.restore();
  }
  drawSparkles(ctx, cx, cy, t) {
    const sp = img('gfx/misc/evolution/sparkle.png');
    if (!ready(sp)) return;
    for (let i = 0; i < 8; i++) { // spiralling in from the edges, fading as they reach the POKéMON
      const life = (t * 0.6 + i / 8) % 1, a = i / 8 * Math.PI * 2 + t * 2.4;
      const r = 170 * (1 - life);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.5;
      ctx.globalAlpha = Math.min(1, life * 4, (1 - life) * 3) * 0.9;
      ctx.drawImage(sp, Math.round(x - 8), Math.round(y - 8), 16, 16);
    }
    ctx.globalAlpha = 1;
  }
  // FireRed's battle textbox (240x48, 2x) with white text, 2x when it fits
  textbox(ctx, X, Y, lines) {
    const tb = img('gfx/ui/battle/textbox.png');
    if (ready(tb)) ctx.drawImage(tb, X, Y + 224, 480, 96); else windowFrame(ctx, X, Y + 224, 480, 96, 'std');
    const big = lines.every(l => measure(l) * 2 <= 480 - 40);
    lines.forEach((l, i) => text(ctx, l, X + 22, Y + 224 + (big ? 14 + i * 32 : 26 + i * 18), { color: 'white', scale: big ? 2 : 1 }));
  }
}

// ---------------------------------------------------------------- catching
export async function onCatch(scene, a, ball) {
  const run = G.run;
  const first = !G.meta.dex.caught[a.species];
  G.meta.dex.caught[a.species] = true; G.meta.dex.seen[a.species] = true;
  const prev = run.partner;
  run.partner = { species: a.species, level: a.level, moves: a.moves.slice() };
  run.caught.push(a.species);
  Sound.playFanfare('mus_caught');
  scene.banners.push(new Banner(`Gotcha! ${a.name} was caught!`, prev ? `${D.species[prev.species].name} was sent to the PC. ${a.name} is your partner now (F).` : `${a.name} is your partner! Press F to call it.`, { life: 2.8, color: '#f8f8f8' }));
  if (first) { G.meta.stardust += 5; G.meta.totalStardust += 5; run.stardustGained += 5; scene.world.text(scene.world.player, 'New DEX entry! +5 STARDUST', '#c0e0ff'); }
  run.callGauge = Math.max(run.callGauge, 0.5);
  saveMeta();
}

// ---------------------------------------------------------------- shop / center / deoxys
function shopStock(run, center) {
  const b = run.biome;
  const all = [
    { key: 'POTION', name: 'POTION', price: 30 + b * 15, desc: 'Restore 25% HP.', buy: (s) => healPct(s, 0.25) },
    { key: 'SUPER_POTION', name: 'SUPER POTION', price: 60 + b * 25, desc: 'Restore 50% HP.', buy: (s) => healPct(s, 0.5) },
    { key: 'RARE_CANDY', name: 'RARE CANDY', price: 100 + b * 40, desc: '+2 levels.', buy: (s) => applyReward(s, { kind: 'rare_candy' }) },
    { key: 'PP_UP', name: 'PP UP', price: 120 + b * 40, desc: 'Power up a blessing.', buy: (s) => applyReward(s, { kind: 'pp_up' }), need: r => r.boons.length > 0 },
    { key: 'POKE_BALL', name: 'POKé BALL ×3', price: 40 + b * 10, desc: 'Weaken a wild POKéMON, then throw (R).', buy: () => { run.balls += 3; } },
    { key: 'GREAT_BALL', name: 'GREAT BALL ×2', price: 90 + b * 15, desc: 'Better catch rate. Upgrades your balls.', buy: () => { run.balls += 2; if (run.ballType === 'poke_ball') run.ballType = 'great_ball'; } },
    { key: 'ULTRA_BALL', name: 'ULTRA BALL ×2', price: 150 + b * 20, desc: 'Best catch rate.', buy: () => { run.balls += 2; run.ballType = 'ultra_ball'; }, need: () => b >= 2 },
    { key: 'HP_UP', name: 'HP UP', price: 80 + b * 25, desc: '+15% max HP, heal 25%.', buy: (s) => applyReward(s, { kind: 'hp_up', mine: true }) },
    { key: 'TM01', name: 'TM', price: 110 + b * 30, desc: 'Teach a new move.', buy: (s) => applyReward(s, { kind: 'tm' }) },
    { key: 'LEFTOVERS', name: 'HELD ITEM', price: 150 + b * 30, desc: 'Choose an item to hold.', buy: (s) => applyReward(s, { kind: 'held' }) },
    { key: 'SACRED_ASH', name: 'SACRED ASH', price: 260 + b * 40, desc: '+1 Revive this run.', buy: () => { run.revives++; } },
    { key: 'STAR_PIECE', name: 'STAR PIECE', price: 90 + b * 30, desc: '+25 STARDUST for Oak.', buy: () => { G.meta.stardust += 25; G.meta.totalStardust += 25; run.stardustGained += 25; saveMeta(); } },
  ];
  // the Pokémon Center's clerk sells no healing: Nurse Joy heals you for free
  const pool = center ? all.filter(x => !['POTION', 'SUPER_POTION'].includes(x.key)) : all;
  const always = pool.filter(x => ['POTION', 'POKE_BALL'].includes(x.key));
  const rest = run.rng.sample(pool.filter(x => !always.includes(x) && (!x.need || x.need(run))), 5);
  return [...always, ...rest];
}
function healPct(scene, f) {
  if (G.run.isP2) { coopHeal(scene, f); Sound.playSE('se_use_item'); return; } // P2 bought it
  const p = scene.world.player; scene.world.heal(p, Math.round(p.maxHp * f)); G.run.hp = p.hp; Sound.playSE('se_use_item');
}

export async function openShop(scene) {
  const run = G.run;
  scene.stock ??= shopStock(run, scene.spec?.kind === 'center');
  await say([{ text: 'Hi there! May I help you?', name: 'CLERK' }]);
  while (true) {
    const cards = scene.stock.map(s => ({ title: s.name, sub: s.sold ? 'SOLD' : `¥${s.price}`, subColor: run.money >= s.price ? 'green' : 'red', desc: s.desc, icon: ICON.item(s.key), accent: '#3070c0', disabled: s.sold || run.money < s.price }));
    const i = await choose(`POKé MART   ¥${run.money}`, cards, { cardH: 36, canSkip: true, skipLabel: 'LEAVE (X)' });
    if (i < 0) break;
    const s = scene.stock[i];
    run.money -= s.price; s.sold = true; Sound.playSE('se_shop');
    await s.buy(scene);
  }
}

// Co-op: player 2 talks to an NPC. The shop and Nurse Joy work for P2 (shared money; purchases are P2's),
// the starter POKé BALLs in OAK's lab change P2's starter, and the rest belongs to player 1.
export async function coopTalk(scene, n) {
  const a = scene.world.p2;
  if (n.name === 'CLERK' || n.name === 'NURSE JOY') return asP2(scene, () => n.onTalk(n));
  if (/BALL$/.test(n.name)) {
    const list = STARTERS.filter(starterUnlocked);
    Coop.menuP2 = true;
    let i = -1;
    try {
      i = await choose('PLAYER 2: choose your partner POKéMON', list.map(s => { const sp = D.species[s.species]; return { title: sp.name, sub: sp.types.join('/'), portrait: sp.dex, accent: TYPE_COLORS[sp.types[0]], desc: `${s.blurb}  ${D.moves[s.slots.attack].name} / ${D.moves[s.slots.special].name} / ${D.moves[s.slots.cast].name}` }; }), { cardH: 46, canSkip: true, skipLabel: 'CANCEL (X)' });
    } finally { Coop.menuP2 = false; }
    if (i >= 0) { coopResetP2(scene, list[i].species); Sound.playCry(list[i].species); }
    return;
  }
  scene.world.text(a, `${n.name}: player 1 handles that.`, '#ffffff', true, 1.6);
}

export async function nurse(scene) {
  const run = G.run, p = scene.world.player;
  if (scene.healed) { await say([{ text: 'We hope to see you again!', name: 'NURSE JOY' }]); return; }
  await say([{ text: 'Welcome to our POKéMON CENTER! We restore your tired POKéMON to full health.', name: 'NURSE JOY' }]);
  scene.healed = true;
  Sound.playFanfare('mus_heal');
  const amt = Math.round(p.maxHp * (scene.spec.preBoss ? 0.6 : 0.5) * (run.heat >= 6 ? 0.75 : 1));
  scene.world.heal(p, amt); p.status = {}; run.hp = p.hp;
  coopHeal(scene, amt / p.maxHp);
  scene.world.vfx.push({ kind: 'heal', x: p.x, y: p.y, t: 0, life: 1 });
  await say([{ text: "Thank you for waiting. We've restored your POKéMON. We hope to see you again!", name: 'NURSE JOY' }]);
}

export async function chaosBargain(scene) {
  const run = G.run;
  if (scene.bargained) return;
  Sound.playCry('DEOXYS');
  const offers = chaosOffer(run);
  const cards = offers.map(o => ({ title: o.blessing.name, sub: `after ${o.rooms} rooms`, desc: `CURSE until then: ${o.curse.name}.`, portrait: 386, accent: '#d050a0', badge: 'CHAOS', badgeColor: '#a03080' }));
  cards.push({ title: 'Leave it be', desc: 'Walk away from the strange visitor.', accent: '#808080' });
  const i = await choose('DEOXYS', cards, { header: (ctx, y) => { drawPortrait(ctx, 386, W / 2 - 150, y - 56); text(ctx, 'DEOXYS', W / 2 - 100, y - 54, { color: 'pink', scale: 2 }); text(ctx, 'It offers a bargain. Accepting costs 15% of your HP.', W / 2 - 100, y - 24, { color: 'whiteSoft', font: 'small' }); } });
  scene.bargained = true;
  if (i >= 0 && i < offers.length) {
    const p = scene.world.player;
    p.hp = Math.max(1, p.hp - Math.round(p.maxHp * 0.15)); run.hp = p.hp;
    run.chaos.push(offers[i]);
    Sound.playSE('se_deoxys_move');
    scene.world.shake = 6;
  }
  scene.npcs = scene.npcs.filter(n => n.dex !== 386);
  scene.world.vfx.push({ kind: 'ring', x: scene.room.center.x, y: scene.room.center.y, r0: 30, r1: 2, t: 0, life: 0.4, fx: 'psychic' });
}

// ---------------------------------------------------------------- bosses
export async function bossDefeated(scene) {
  if (scene.bossDone) return;
  scene.bossDone = true; scene.cleared = true;
  const run = G.run, def = BOSSES[scene.bossKey], key = scene.bossKey;
  const w0 = scene.world;
  for (const e of w0.enemies()) { e.dead = true; e.deathT = 0; e.noExp = true; w0.vfx.push({ kind: 'sendout', x: e.x, y: e.y, t: 0, life: 0.4, recall: true }); }
  w0.strikes = w0.strikes.filter(s => s.team !== 'enemy'); w0.projectiles = w0.projectiles.filter(p => p.team !== 'enemy'); w0.zones = w0.zones.filter(z => z.team !== 'enemy');
  w0.player.iframes = 99; w0.player.status = {};
  Input.rumble(450, 0.9, 0.6); // the boss goes down
  Sound.playBGM(key === 'MEWTWO' || key === 'MAROWAK' ? 'mus_victory_wild' : 'mus_victory_gym_leader');
  const name = def.sprite ? (D.trainers[def.trainer]?.name || key) : key === 'MAROWAK' ? 'MAROWAK' : 'MEWTWO';
  await new Promise(r => setTimeout(r, 900));
  const tr = def.trainer && D.trainers[def.trainer];
  await say(def.outro.map(t => ({ text: t, name: key === 'MAROWAK' || key === 'MEWTWO' ? '' : name })), { pic: tr ? `gfx/trainers/${tr.pic}.png` : null });
  const first = !G.meta.badges.includes(key);
  const dust = Math.round((first ? 60 + run.biome * 20 : 25 + run.biome * 8) * (1 + 0.1 * (run.heat || 0)));
  G.meta.stardust += dust; G.meta.totalStardust += dust; run.stardustGained += dust;
  G.meta.bossKills[key] = (G.meta.bossKills[key] || 0) + 1;
  if (first) G.meta.badges.push(key);
  saveMeta();
  Sound.playFanfare('mus_obtain_badge');
  const lines = [`You obtained the ${def.badge}! +${dust} STARDUST.`];
  if (first && BOSS_UNLOCK_TEXT[key]) lines.push(BOSS_UNLOCK_TEXT[key]);
  await say(lines);
  // heal a bit between areas, like reaching a new town
  const p = scene.world.player; scene.world.heal(p, Math.round(p.maxHp * 0.25)); run.hp = p.hp; coopHeal(scene, 0.25);
  await levelPrompts(scene);
  scene.openDoors();
  Sound.playBGM(areaOf(run)?.music || 'mus_pallet');
}

// ---------------------------------------------------------------- pause
export function openPause(scene) { pushOverlay(new PauseOverlay(scene)); }
class PauseOverlay {
  constructor(scene) { this.scene = scene; this.sel = 0; }
  enter() { Input.clear(); Sound.playSE('se_win_open'); }
  update() {
    Input.poll();
    const items = this.items();
    if (Input.justPressed('up')) this.sel = (this.sel + items.length - 1) % items.length;
    if (Input.justPressed('down')) this.sel = (this.sel + 1) % items.length;
    if (Input.justPressed('pause') || Input.justPressed('back')) { popOverlay(this); return; }
    if (Input.justPressed('confirm')) items[this.sel].fn();
  }
  items() {
    return [
      { label: 'Resume', fn: () => popOverlay(this) },
      { label: `Music ${Math.round(G.meta.settings.music * 10)}/10`, fn: () => { G.meta.settings.music = (Math.round(G.meta.settings.music * 10) + 2) % 12 / 10; Sound.setMusicVolume(G.meta.settings.music); saveMeta(); } },
      { label: `Sound ${Math.round(G.meta.settings.sfx * 10)}/10`, fn: () => { G.meta.settings.sfx = (Math.round(G.meta.settings.sfx * 10) + 2) % 12 / 10; Sound.setSfxVolume(G.meta.settings.sfx); saveMeta(); } },
      { label: `Screen shake ${G.meta.settings.shake ? 'ON' : 'OFF'}`, fn: () => { G.meta.settings.shake = G.meta.settings.shake ? 0 : 1; saveMeta(); } },
      ...(this.scene.spec.kind === 'hub' ? [] : [{ label: 'Save & quit to title', fn: () => saveAndQuit(this) }]),
      ...(this.scene.spec.kind === 'hub' ? [] : [{ label: 'Give up the run', fn: () => { popOverlay(this); const w = this.scene.world; w.forceDeath = true; w.player.hp = 0; w.kill(w.player, null); } }]),
    ];
  }
  draw(ctx) {
    // FireRed START-menu style: white type1 windows with dark text and the red arrow cursor
    const run = G.run, items = this.items();
    ctx.fillStyle = 'rgba(8,10,20,0.55)'; ctx.fillRect(0, 0, W, H);
    const mx = 12, my = 12, mw = 236, mh = 36 + items.length * 18 + 8;
    windowFrame(ctx, mx, my, mw, mh, 'type1');
    text(ctx, 'PAUSED', mx + 14, my + 10, { color: 'blue' });
    items.forEach((it, i) => { const iy = my + 32 + i * 18; if (i === this.sel) { const im = img('gfx/ui/cursors/red_arrow.png'); if (ready(im)) ctx.drawImage(im, mx + 12, iy + 2); } text(ctx, it.label, mx + 30, iy, { color: 'dark' }); });
    // controls
    const ctl = ['WASD / arrows: move', 'J or Left click: ATTACK', 'K or Right click: SPECIAL', 'Q: CAST (status move)', 'SPACE / SHIFT: DASH', 'R: throw POKé BALL (weak wild foes)', 'F: call your partner', 'E: talk / interact', 'Mouse aims when moved; gamepad too'];
    const cy0 = my + mh + 8;
    windowFrame(ctx, mx, cy0, mw, 30 + ctl.length * 13, 'type1');
    text(ctx, 'CONTROLS', mx + 14, cy0 + 8, { color: 'blue', font: 'small' });
    ctl.forEach((c, i) => text(ctx, c, mx + 14, cy0 + 22 + i * 13, { font: 'small', color: 'dark' }));
    // the POKéMON, its moves, item, partner and blessings
    const bx = 260, bw = W - bx - 12;
    const rowsH = run.boons.reduce((s, b) => s + Math.max(28, 11 * (1 + Math.min(2, wrap(BOONS[b.key].desc(boonInstance(run, b)), bw - 60, 'small').length)) + 5), 0);
    const bh = Math.min(H - 24, Math.max(mh, 10 + 18 + 42 + (run.held ? 12 : 0) + (run.partner ? 12 : 0) + 6 + 18 + rowsH + run.chaos.length * 12 + 12)), bottom = 12 + bh - 14;
    windowFrame(ctx, bx, 12, bw, bh, 'type1');
    let x = bx + 14, y = 22;
    text(ctx, `${D.species[run.species].name}  Lv${run.level}`, x, y, { color: 'dark' }); y += 18;
    for (const s of ['attack', 'special', 'cast']) {
      const m = run.slots[s];
      if (m) { const ti = img(ICON.type(D.moves[m].type)); if (ready(ti)) ctx.drawImage(ti, x, y); }
      text(ctx, `${SLOT_NAMES[s]}: ${m ? D.moves[m].name : '-'}`, x + 38, y, { font: 'small', color: m ? 'dark' : 'gray' }); y += 14;
    }
    if (run.held) { text(ctx, `HELD: ${HELD[run.held].name} - ${HELD[run.held].desc}`, x, y, { font: 'small', color: 'dark' }); y += 12; }
    if (run.partner) { text(ctx, `PARTNER: ${D.species[run.partner.species].name} Lv${run.partner.level}`, x, y, { font: 'small', color: 'dark' }); y += 12; }
    y += 6;
    text(ctx, run.boons.length ? 'BLESSINGS' : 'BLESSINGS: none yet', x, y, { color: 'blue' }); y += 18;
    for (const b of run.boons) {
      const def = BOONS[b.key], L = LEGENDS[def.legend], rar = RARITY[b.rarity];
      const lines = wrap(def.desc(boonInstance(run, b)), bw - 60, 'small').slice(0, 2);
      if (y + 11 * (1 + lines.length) > bottom) { text(ctx, '...', x, y, { font: 'small', color: 'gray' }); break; }
      pixBox(ctx, x, y, 24, 24, rar.color, '#283040', 2);
      const pim = img(ICON.portrait(L.dex)); if (ready(pim)) ctx.drawImage(pim, x + 2, y + 2, 20, 20);
      text(ctx, `${def.name}  (${SLOT_NAMES[def.slot]}${b.level > 1 ? ' Lv' + b.level : ''})`, x + 30, y, { font: 'small', color: 'black' });
      lines.forEach((ln, j) => text(ctx, ln, x + 30, y + 11 + j * 11, { font: 'small', color: 'dark' }));
      y += Math.max(28, 11 * (1 + lines.length) + 5);
    }
    for (const c of run.chaos) { if (y > bottom) break; text(ctx, c.active ? `DEOXYS: ${c.blessing.name}` : `DEOXYS curse: ${c.curse.name} (${c.rooms} rooms)`, x, y, { font: 'small', color: 'red' }); y += 12; }
  }
}

// ---------------------------------------------------------------- death & victory
export async function gameOver(scene) {
  const run = G.run;
  G.meta.deaths++;
  const entry = { starter: run.starter, species: run.species, level: run.level, biome: run.biome, room: run.roomInBiome, time: Math.round(run.time), won: false, area: areaOf(run).key, kills: run.kills, dust: run.stardustGained, heat: run.heat || 0, boons: run.boons.map(b => b.key), at: Date.now(), coop: coopTeam() };
  G.meta.history.unshift(entry);
  clearRunSave(); recordRun(entry);
  G.meta.history = G.meta.history.slice(0, 20);
  saveMeta();
  Sound.stopBGM();
  pushOverlay(new SummaryOverlay(false));
}
function victory() {
  const run = G.run;
  G.meta.wins++;
  G.meta.maxHeatWon = Math.max(G.meta.maxHeatWon ?? -1, run.heat || 0);
  if (!G.meta.bestTime || run.time < G.meta.bestTime) G.meta.bestTime = Math.round(run.time);
  const entry = { starter: run.starter, species: run.species, level: run.level, biome: run.biome, room: run.roomInBiome, time: Math.round(run.time), won: true, area: areaOf(run).key, kills: run.kills, dust: run.stardustGained, heat: run.heat || 0, boons: run.boons.map(b => b.key), at: Date.now(), coop: coopTeam() };
  run.coopTeam = entry.coop; // the Hall of Fame shows both players
  G.meta.history.unshift(entry);
  clearRunSave(); recordRun(entry);
  saveMeta();
  setScene(new VictoryScene());
}

class SummaryOverlay {
  constructor(won) { this.won = won; this.t = 0; }
  enter() { Input.clear(); }
  update(dt) { Input.poll(); this.t += dt; if (this.t > 1.2 && (Input.justPressed('confirm') || Engine.mouse.clicked)) { popOverlay(this); toHub(); } }
  draw(ctx) {
    const run = G.run, k = Math.min(1, this.t * 2);
    ctx.fillStyle = `rgba(0,0,0,${0.85 * k})`; ctx.fillRect(0, 0, W, H);
    text(ctx, `${D.species[run.species].name} fainted!`, W / 2, 80, { align: 'center', color: 'white', scale: 2 });
    text(ctx, 'You blacked out... and woke up in PROF. OAK\'s lab.', W / 2, 120, { align: 'center', color: 'whiteSoft' });
    const lines = [
      `Reached: ${areaOf(run).name} (${ACTS[actOf(run.biome)].name}), room ${run.roomInBiome + 1}`, `Level ${run.level}   KOs ${run.kills}   Time ${fmtTime(run.time)}`,
      `STARDUST earned: ${run.stardustGained}  (total ${G.meta.stardust})`, `Blessings: ${run.boons.map(b => BOONS[b.key].name).join(', ') || 'none'}`,
    ];
    lines.forEach((l, i) => text(ctx, l, W / 2, 170 + i * 20, { align: 'center', color: 'white', font: i === 3 ? 'small' : 'normal' }));
    if (this.t > 1.2) text(ctx, 'Press ENTER', W / 2, H - 50, { align: 'center', color: 'gold', alpha: 0.5 + 0.5 * Math.sin(this.t * 4) });
  }
}
export const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

class VictoryScene {
  constructor() { this.t = 0; }
  enter() { Sound.playBGM('mus_hall_of_fame'); Input.clear(); }
  update(dt) { Input.poll(); this.t += dt; if (this.t > 3 && (Input.justPressed('confirm') || Engine.mouse.clicked)) toHub(); }
  draw(ctx) {
    const run = G.run;
    const im = img('gfx/misc/hall_of_fame/bg.png');
    ctx.fillStyle = '#101828'; ctx.fillRect(0, 0, W, H);
    if (ready(im)) ctx.drawImage(im, (W - 480) / 2, 20, 480, 320);
    const team = run.coopTeam;
    ctx.save(); ctx.scale(3, 3); drawPmd(ctx, D.species[run.species].dex, team ? W / 6 - 34 : W / 6, 50, { anim: 'Idle', t: this.t });
    if (team) drawPmd(ctx, D.species[team.species].dex, W / 6 + 34, 50, { anim: 'Idle', t: this.t, dir: 0 });
    ctx.restore();
    if (run.partner) { ctx.save(); ctx.scale(2, 2); drawPmd(ctx, D.species[run.partner.species].dex, team ? W / 4 - 100 : W / 4 + 60, 85, { anim: 'Idle', t: this.t }); ctx.restore(); }
    if (team?.partner) { ctx.save(); ctx.scale(2, 2); drawPmd(ctx, D.species[team.partner].dex, W / 4 + 100, 85, { anim: 'Idle', t: this.t }); ctx.restore(); }
    text(ctx, 'HALL OF FAME', W / 2, 24, { align: 'center', color: 'gold', scale: 2 });
    text(ctx, team ? `${D.species[run.species].name} and ${team.name}'s ${D.species[team.species].name} calmed MEWTWO and escaped!` : `${D.species[run.species].name} calmed MEWTWO and escaped CERULEAN CAVE!`, W / 2, H - 110, { align: 'center', color: 'white' });
    text(ctx, `Level ${run.level}   Time ${fmtTime(run.time)}   KOs ${run.kills}   Wins ${G.meta.wins}`, W / 2, H - 88, { align: 'center', color: 'whiteSoft' });
    if (this.t > 3) text(ctx, 'Press ENTER to return to the lab', W / 2, H - 50, { align: 'center', color: 'gold', alpha: 0.5 + 0.5 * Math.sin(this.t * 4) });
  }
}

// ---------------------------------------------------------------- hub (Oak's lab)
export function toHub() {
  newRun(G.meta.lastStarter || 'CHARMANDER');
  go({ kind: 'hub', layout: 'LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB', cropIndex: 0, entry: { x: 7, y: 5 }, shopRoom: true });
}

export function setupHub(scene) {
  const crop = scene.room.crop;
  const at = (x, y) => ({ tx: x - crop.x, ty: y - crop.y });
  scene.addNpc({ sprite: 'prof_oak', ...at(6, 3), dir: 'down', name: 'PROF. OAK', label: 'RESEARCH', range: 30, onTalk: () => oakResearch(scene) });
  const ballNpc = (x, label) => scene.addNpc({ ...at(x, 4), name: 'POKé BALL', label, verb: 'Choose POKéMON', range: 34, onTalk: () => chooseStarter(scene) });
  ballNpc(8, ''); ballNpc(9, 'STARTERS'); ballNpc(10, '');
  scene.addNpc({ sprite: 'scientist', ...at(11, 10), dir: 'left', name: 'AIDE', label: 'RECORDS', onTalk: () => records(scene) });
  scene.addNpc({ sprite: 'worker_f', ...at(2, 10), dir: 'right', name: 'AIDE', label: 'HOW TO PLAY', onTalk: () => tutorial(scene) });
  scene.addNpc({ sprite: 'blue', ...at(5, 4), dir: 'down', name: 'RIVAL', label: G.meta.wins ? `HEAT ${G.meta.heat || 0}` : '', onTalk: () => rivalTalk(scene) });
  // the lab door is the way out
  const ex = scene.room.exits[0];
  scene.doors = [{ ...ex, reward: { kind: 'start' }, t: 0 }];
  scene.doorsOpen = true; scene.cleared = true;
  addDoorIcons(scene);
  scene.world.noBalls = true;
  scene.world.player.brain = hubBrain(scene.world.player.brain);
  if (!G.meta.seenIntro) { G.meta.seenIntro = true; saveMeta(); setTimeout(() => tutorial(scene, true), 600); }
}
function hubBrain(inner) {
  return (w, a, dt) => { inner(w, a, dt); };
}
async function rivalTalk(scene) {
  if (!G.meta.wins) return say([{ text: rivalLine(), name: 'RIVAL' }]);
  await say([{ text: "So you escaped CERULEAN CAVE. Bet you can't do it with my rules. Pick your HEAT.", name: 'RIVAL' }]);
  const max = Math.min(HEAT.length - 1, (G.meta.maxHeatWon ?? -1) + 1);
  const cards = [];
  for (let h = 0; h <= max; h++) cards.push({ title: `HEAT ${h}`, sub: h ? `+${h * 10}% STARDUST` : '', desc: h ? HEAT.slice(1, h + 1).join(' · ') : 'The normal rules.', accent: h ? '#e04020' : '#808080', badge: h <= (G.meta.maxHeatWon ?? -1) ? 'CLEARED' : '', badgeColor: '#30a050' });
  const i = await choose('Choose your HEAT', cards, { cardH: 44, canSkip: true, skipLabel: 'CANCEL (X)', footer: 'Each level adds the rules of the ones before it.' });
  if (i < 0) return;
  G.meta.heat = i; saveMeta();
  newRun(G.meta.lastStarter); refreshPlayer(scene); scene.world.player.brain = hubBrain(scene.world.player.brain);
  const n = scene.npcs.find(x => x.name === 'RIVAL'); if (n) n.label = `HEAT ${i}`;
}
function rivalLine() {
  const d = G.meta.deaths, wins = G.meta.wins;
  if (wins) return `Smell ya later! ...Wait, you actually beat MEWTWO? ${wins} time${wins > 1 ? 's' : ''}?! No way!`;
  if (d > 5) return `Fainted again? I've been to CERULEAN CAVE ${d + 3} times. Just kidding. Keep at it.`;
  return 'Gramps keeps talking about some POKéMON in CERULEAN CAVE. I\'ll get there before you!';
}

export function drawHubHints(ctx, scene) {
  text(ctx, `STARDUST: ${G.meta.stardust}`, W - 12, 10, { align: 'right', color: [ '#c0e0ff', '#203040' ] });
  text(ctx, 'Walk out the door to begin. ESC: pause/controls', W - 12, 26, { align: 'right', font: 'small', color: 'whiteSoft' });
}

async function chooseStarter(scene) {
  const cards = STARTERS.map(s => {
    const sp = D.species[s.species], ok = starterUnlocked(s);
    return { title: sp.name, sub: ok ? sp.types.join('/') : 'LOCKED', subColor: ok ? 'blue' : 'red', desc: ok ? `${s.blurb}  ${D.moves[s.slots.attack].name} / ${D.moves[s.slots.special].name} / ${D.moves[s.slots.cast].name}` : `Defeat ${[].concat(s.unlock).map(k => D.trainers[BOSSES[k]?.trainer]?.name || k).join(' or ')} to unlock.`, portrait: ok ? sp.dex : null, icon: ok ? null : 'gfx/overworld/misc/item_ball.png', accent: ok ? TYPE_COLORS[sp.types[0]] : '#606060', disabled: !ok };
  });
  const i = await choose('Choose your partner POKéMON', cards, { cardH: 46, canSkip: true, skipLabel: 'CANCEL (X)' });
  if (i < 0) return;
  const s = STARTERS[i];
  G.meta.lastStarter = s.species; saveMeta();
  newRun(s.species);
  Sound.playCry(s.species);
  refreshPlayer(scene);
  scene.world.player.brain = hubBrain(scene.world.player.brain);
}

async function oakResearch(scene) {
  await say([{ text: "Ah, the STARDUST you collect lets me study POKéMON further. What should I research?", name: 'PROF. OAK' }]);
  while (true) {
    const cards = RESEARCH.map(r => {
      const rk = rank(r.key), maxed = rk >= r.max, cost = r.cost[rk];
      return { title: `${r.name}  ${'★'.repeat(rk)}${'·'.repeat(r.max - rk)}`, sub: maxed ? 'DONE' : `${cost} dust`, subColor: maxed ? 'gray' : G.meta.stardust >= cost ? 'green' : 'red', desc: `Now: ${rk ? r.desc(rk) : 'nothing'}${maxed ? '' : `   Next: ${r.desc(rk + 1)}`}`, icon: ICON.item(r.icon), accent: '#40a060', disabled: maxed || G.meta.stardust < cost };
    });
    const i = await choose(`OAK's RESEARCH   STARDUST: ${G.meta.stardust}`, cards, { cardH: 40, canSkip: true, skipLabel: 'DONE (X)' });
    if (i < 0) break;
    const r = RESEARCH[i];
    G.meta.stardust -= r.cost[rank(r.key)];
    G.meta.research[r.key] = rank(r.key) + 1;
    saveMeta();
    Sound.playFanfare('mus_obtain_item');
  }
  newRun(G.meta.lastStarter); refreshPlayer(scene); scene.world.player.brain = hubBrain(scene.world.player.brain);
}

async function records(scene) {
  const m = G.meta;
  const seen = Object.keys(m.dex.seen).length, caught = Object.keys(m.dex.caught).length;
  const last = m.history[0];
  await say([
    { text: `Runs: ${m.runs}   Escapes: ${m.wins}   Best time: ${m.bestTime ? fmtTime(m.bestTime) : '--'}`, name: 'AIDE' },
    { text: `POKéDEX: seen ${seen}, caught ${caught}. Bosses beaten: ${m.badges.join(', ') || 'none yet'}.`, name: 'AIDE' },
    ...(last ? [{ text: `Last run: ${D.species[last.species]?.name} Lv${last.level}, reached ${(last.area ? areaByKey(last.area) : BIOMES[last.biome])?.name || '?'} (${last.won ? 'ESCAPED!' : 'fainted'}).`, name: 'AIDE' }] : []),
    { text: 'Here are the full RECORDS: everyone\'s runs, yours, and the top trainers.', name: 'AIDE' },
  ]);
  const { RecordsScene } = await import('./records.js'); // BACK returns to the lab
  setScene(new RecordsScene({ fromHub: true }));
}

async function tutorial(scene, first) {
  await say([
    { text: first ? 'Welcome to PROF. OAK\'s lab! Every night, your partner heads out toward CERULEAN CAVE.' : 'Here\'s how it works.', name: 'AIDE' },
    { text: 'Move with WASD. Attack with J or left click, SPECIAL with K or right click, CAST your status move with Q, and DASH with SPACE.', name: 'AIDE' },
    { text: 'Clear each area, then pick a door. The icon shows the reward: LEGENDARY blessings, RARE CANDY, TMs, items...', name: 'AIDE' },
    { text: 'Weaken a wild POKéMON and throw a POKé BALL with R. It becomes your partner. Call it with F when the gauge is full!', name: 'AIDE' },
    { text: 'If you faint, you wake up here. Bring STARDUST to PROF. OAK for permanent upgrades. Beat bosses to unlock new partners.', name: 'AIDE' },
  ]);
}

export { STARTERS };

// ---------------------------------------------------------------- dev / test entry points
// ?dev=combat|boss|shop|center|chaos|trainer&biome=N&starter=X&level=L
export function devStart(q) {
  const run = newRun(q.get('starter') || G.meta.lastStarter || 'CHARMANDER', q.get('seed') || undefined);
  run.biome = +(q.get('biome') || 0); run.roomInBiome = +(q.get('room') || 1);
  if (q.get('area')) run.route[run.biome] = q.get('area'); // dev: force an area at this stage run.depth = run.biome * 7 + run.roomInBiome;
  const lvl = +(q.get('level') || 0);
  if (lvl) { run.level = lvl; run.exp = 0; run.hp = playerMaxHp(run); }
  if (q.get('boons')) for (const k of q.get('boons').split(',')) addBoon(run, { key: k, rarity: 1, level: 1 });
  const kind = q.get('dev');
  if (kind === 'boss') { run.roomInBiome = areaOf(run).rooms; return goNext({ spec: { kind: 'x' } }, { kind: 'boss' }) || run; }
  run.roomInBiome--; run.depth--;
  goNext({ spec: { kind: 'x' } }, kind === 'combat' ? { kind: 'rare_candy' } : { kind });
}

// ---------------------------------------------------------------- save & quit / continue
async function saveAndQuit(pause) {
  popOverlay(pause);
  // the snapshot taken at the start of this room is the save; just make sure everything is flushed
  saveMeta();
  await Cloud.flushMeta();
  Sound.playSE('se_save');
  const { TitleScene } = await import('./title.js');
  setScene(new TitleScene({ saved: true }));
}
export function continueRun() {
  const s = loadRunSave();
  if (!s) return false;
  restoreRun(s.run);
  go({ ...s.spec });
  return true;
}
export { runLabel };
