// Rooms are crops of real FireRed map layouts (rendered by tools/extract_maps.py).
// A room carries collision grids for the World plus entry/exit points.
import { img, ready, BASE } from '../engine/assets.js';
import { TILE } from './combat.js';

const layouts = new Map();
let INDEX = null, CANDS = null;

export async function loadMapIndex() {
  [INDEX, CANDS] = await Promise.all([
    fetch(BASE + 'maps/index.json').then(r => r.json()),
    fetch(BASE + 'maps/rooms_candidates.json').then(r => r.json()),
  ]);
  return INDEX;
}
export const mapIndex = () => INDEX;
export const candidates = id => CANDS?.[id]?.candidates || [];
// an area's combat rooms: pools list [layout, [entries]], where an entry is an index into rooms_candidates.json
// or a hand-picked crop {x, y, w, h} (metatiles). key identifies the room for "don't repeat it soon".
export function areaRooms(B) {
  const out = [];
  for (const [layout, entries] of B.pools) for (const e of entries) {
    if (typeof e === 'object') out.push({ layout, crop: { x: e.x, y: e.y, w: e.w, h: e.h }, key: `${layout}@${e.x},${e.y}` });
    else if (candidates(layout)[e]) out.push({ layout, cropIndex: e, key: layout + e });
  }
  return out;
}

export function loadLayout(id) {
  if (layouts.has(id)) return layouts.get(id);
  const p = fetch(`${BASE}maps/${id}/meta.json`).then(r => r.json()).then(async meta => {
    const under = img(`maps/${id}/under.png`), over = img(`maps/${id}/over.png`);
    let anim = null;
    if (meta.hasAnim) { try { anim = await fetch(`${BASE}maps/${id}/anim.json`).then(r => r.json()); for (const a of anim.anims) a.img = img(`maps/${id}/${a.sheet}`); } catch { anim = null; } }
    await Promise.all([under, over].map(im => ready(im) ? 0 : new Promise(res => { im.addEventListener('load', res, { once: true }); im.addEventListener('error', res, { once: true }); })));
    return { id, meta, under, over, anim };
  });
  layouts.set(id, p);
  return p;
}

const WATER = /WATER|POND|OCEAN|SEAWEED|WATERFALL|CURRENT|DIVE|PUDDLE_DEEP/;
const LEDGE = /JUMP_/;
const BLOCKS_WALK = /COUNTER|HOLE|CRACKED_ICE|BOOKSHELF|PC$|CABINET|TV/;
// Thin walls on a cell's sides (room.edge bits). FireRed blocks a step between two cells when
//  - the cell being left or entered has a one-way MB_IMPASSABLE_* side there (event_object_movement.c
//    IsMetatileDirectionallyImpassable: cliff rims, the floor in front of desks, map borders), or
//  - the two cells are on different heights (IsElevationMismatchAt: elevation 0 = stairs/any, 15 = bridge).
// The cells themselves stay walkable floor; only the step across that side is blocked (for walking and dashes).
export const EDGE_N = 1, EDGE_S = 2, EDGE_W = 4, EDGE_E = 8;
const DIR_SIDES = {
  MB_IMPASSABLE_NORTH: EDGE_N, MB_IMPASSABLE_SOUTH: EDGE_S, MB_IMPASSABLE_WEST: EDGE_W, MB_IMPASSABLE_EAST: EDGE_E,
  MB_IMPASSABLE_NORTHEAST: EDGE_N | EDGE_E, MB_IMPASSABLE_NORTHWEST: EDGE_N | EDGE_W,
  MB_IMPASSABLE_SOUTHEAST: EDGE_S | EDGE_E, MB_IMPASSABLE_SOUTHWEST: EDGE_S | EDGE_W,
};
const heightsMeet = (a, b) => a === 0 || b === 0 || a === 15 || b === 15 || a === b;
// the four steps out of a cell: [dx, dy, side bit on this cell, side bit on the neighbour]
export const STEPS = [[1, 0, EDGE_E, EDGE_W], [-1, 0, EDGE_W, EDGE_E], [0, 1, EDGE_S, EDGE_N], [0, -1, EDGE_N, EDGE_S]];

// Build a room from a layout and a crop {x,y,w,h} (in metatiles).
export function buildRoom(L, crop, opts = {}) {
  const M = L.meta, w = crop.w, h = crop.h;
  const walk = new Uint8Array(w * h), shot = new Uint8Array(w * h), grass = new Uint8Array(w * h), water = new Uint8Array(w * h);
  const names = M.behaviorNames || {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const mi = (crop.y + y) * M.w + (crop.x + x), i = y * w + x;
    const col = M.collision[mi] !== '0';
    const bn = names[M.behavior[mi]] || '';
    const isWater = WATER.test(bn) && !/PUDDLE$/.test(bn);
    const ledge = LEDGE.test(bn);
    walk[i] = col || isWater || ledge || BLOCKS_WALK.test(bn) ? 1 : 0;
    shot[i] = col && !isWater ? 1 : 0;
    if (opts.waterWalk && isWater) walk[i] = 0;
    if (isWater) water[i] = 1;
    if (/TALL_GRASS|LONG_GRASS/.test(bn)) grass[i] = 1;
  }
  // warps (stairs, ladders, doors) inside the crop, from every map using this layout
  const warps = [];
  for (const mapId of M.maps || []) for (const wv of INDEX?.maps?.[mapId]?.warp_events || []) {
    const x = wv.x - crop.x, y = wv.y - crop.y;
    if (x >= 0 && y >= 0 && x < w && y < h && !warps.some(q => q.x === x && q.y === y)) warps.push({ x, y, dest: wv.dest_map });
  }
  for (const q of warps) walk[q.y * w + q.x] = 0;
  // thin walls (see DIR_SIDES): one-way sides and height changes between two walkable cells
  const edge = new Uint8Array(w * h);
  const elev = (x, y) => parseInt(M.elevation?.[(crop.y + y) * M.w + crop.x + x] ?? '0', 16);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, sides = !walk[i] && DIR_SIDES[names[M.behavior[(crop.y + y) * M.w + crop.x + x]]];
    if (sides) for (const [dx, dy, me, them] of STEPS) if (sides & me) {
      edge[i] |= me;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) edge[ny * w + nx] |= them;
    }
    if (walk[i]) continue;
    for (const [dx, dy, me, them] of STEPS) {
      const nx = x + dx, ny = y + dy;
      if (dx < 0 || dy < 0 || nx >= w || ny >= h || walk[ny * w + nx]) continue;
      if (!heightsMeet(elev(x, y), elev(nx, ny))) { edge[i] |= me; edge[ny * w + nx] |= them; }
    }
  }
  const room = { layout: L.id, crop, w, h, ox: crop.x * TILE, oy: crop.y * TILE, walk, shot, grass, water, edge, under: L.under, over: L.over, anim: L.anim, warps, fullW: M.w, fullH: M.h };
  // walkable in the whole layout (outside the crop too): an exit should lead on into the map, not into a wall
  const fullWalk = (x, y) => {
    const lx = crop.x + x, ly = crop.y + y;
    if (lx < 0 || ly < 0 || lx >= M.w || ly >= M.h) return false;
    const mi = ly * M.w + lx, bn = names[M.behavior[mi]] || '';
    return M.collision[mi] === '0' && !WATER.test(bn) && !LEDGE.test(bn) && !BLOCKS_WALK.test(bn);
  };
  placeEntryExits(room, opts, fullWalk);
  return room;
}

function bfs(room, sx, sy) {
  const { w, h, walk, edge } = room;
  const d = new Int16Array(w * h).fill(-1);
  const q = [sy * w + sx]; d[q[0]] = 0;
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w, y = (i / w) | 0;
    for (const [dx, dy, side] of STEPS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || (edge && edge[i] & side)) continue;
      const j = ny * w + nx;
      if (d[j] >= 0 || walk[j]) continue;
      d[j] = d[i] + 1; q.push(j);
    }
  }
  return d;
}

// pick the largest walkable region, an entry near the bottom and up to 3 exits far from it
function placeEntryExits(room, opts, fullWalk = () => true) {
  const { w, h, walk } = room;
  // largest component
  const seen = new Uint8Array(w * h); let best = null;
  for (let i = 0; i < w * h; i++) {
    if (walk[i] || seen[i]) continue;
    const d = bfs(room, i % w, (i / w) | 0);
    const cells = []; for (let j = 0; j < w * h; j++) if (d[j] >= 0) { seen[j] = 1; cells.push(j); }
    if (!best || cells.length > best.length) best = cells;
  }
  const comp = new Set(best || []);
  room.reach = new Uint8Array(w * h); for (const j of comp) room.reach[j] = 1;
  const open = (x, y) => comp.has(y * w + x) && isRoomy(room, x, y);
  // entry: bottom-centre-most reachable cell
  let entry = null, es = -1e9;
  const pref = opts.entry;
  for (const j of comp) {
    const x = j % w, y = (j / w) | 0;
    if (!isRoomy(room, x, y)) continue;
    const s = pref ? -Math.hypot(x - pref.x, y - pref.y) : y * 3 - Math.abs(x - w / 2) * 1.2;
    if (s > es) { es = s; entry = { x, y }; }
  }
  entry ||= { x: (best[0] % w), y: (best[0] / w) | 0 };
  room.entry = { x: entry.x * TILE + 8, y: entry.y * TILE + 8 };
  if (opts.exitAtWarps && room.warps.length) { // shops/centers: you leave by the door you came in
    const ws = room.warps.filter(q => comp.has(q.y * w + q.x) || comp.has((q.y - 1) * w + q.x));
    const mid = ws[Math.floor(ws.length / 2)] || room.warps[0];
    room.entry = opts.entry ? { x: opts.entry.x * TILE + 8, y: opts.entry.y * TILE + 8 } : { x: mid.x * TILE + 8, y: (mid.y - 1) * TILE + 8 };
    room.exits = [{ tx: mid.x, ty: mid.y, x: mid.x * TILE + 8, y: mid.y * TILE + 10, warp: true }];
    room.center = centroid(room, comp);
    return;
  }
  const dist = bfs(room, entry.x, entry.y);
  // exit candidates: warps first, then cells on the top/left/right edge of the walkable area
  const cand = [];
  for (const q of room.warps) {
    for (const [dx, dy] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const x = q.x + dx, y = q.y + dy;
      if (x >= 0 && y >= 0 && x < w && y < h && comp.has(y * w + x)) { cand.push({ x, y, warp: true, score: dist[y * w + x] + 30 }); break; }
    }
  }
  for (const j of comp) {
    const x = j % w, y = (j / w) | 0;
    if (!open(x, y)) continue;
    const edge = y <= 1 || x <= 1 || x >= w - 2;
    if (!edge) continue;
    // the door's arrow points out of the room (rewards.js exitDir); prefer cells where the map carries on that way
    const [dx, dy] = y <= 1 ? [0, -1] : x <= 1 ? [-1, 0] : [1, 0];
    let on = 0; while (on < 3 && fullWalk(x + dx * (on + 1), y + dy * (on + 1))) on++;
    cand.push({ x, y, score: dist[j] + (y <= 1 ? 10 : 0) + (on >= 2 ? 25 : on ? 0 : -25) });
  }
  cand.sort((a, b) => b.score - a.score);
  const exits = [];
  const n = opts.exits ?? 3;
  for (const c of cand) {
    if (exits.length >= n) break;
    if (Math.hypot(c.x - entry.x, c.y - entry.y) < 7) continue;
    if (exits.some(e => Math.hypot(e.tx - c.x, e.ty - c.y) < 6)) continue;
    exits.push({ tx: c.x, ty: c.y, x: c.x * TILE + 8, y: c.y * TILE + 8, warp: !!c.warp });
  }
  if (!exits.length) { // fallback: farthest reachable cell
    let fj = best[0]; for (const j of comp) if (dist[j] > dist[fj]) fj = j;
    exits.push({ tx: fj % w, ty: (fj / w) | 0, x: (fj % w) * TILE + 8, y: ((fj / w) | 0) * TILE + 8 });
  }
  room.exits = exits;
  room.center = centroid(room, comp);
}

function isRoomy(room, x, y) {
  // a cell with open neighbours, so an entity can stand there
  let n = 0;
  for (const [dx, dy, side] of STEPS) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < room.w && ny < room.h && !room.walk[ny * room.w + nx] && !(room.edge && room.edge[y * room.w + x] & side)) n++;
  }
  return n >= 2;
}

// the centre of the reachable, roomy cell nearest to (x, y) in pixels (boss and NPC spots: never inside a wall;
// a cell centre is clear for any terrain footprint up to r=8)
export function openSpot(room, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx >= 0 && ty >= 0 && tx < room.w && ty < room.h && room.reach?.[ty * room.w + tx] && isRoomy(room, tx, ty)) return { x: tx * TILE + 8, y: ty * TILE + 8 };
  let best = null, bd = 1e9;
  for (let j = 0; j < room.w * room.h; j++) {
    if (!room.reach?.[j]) continue;
    const cx = j % room.w, cy = (j / room.w) | 0;
    if (!isRoomy(room, cx, cy)) continue;
    const d = Math.hypot(cx * TILE + 8 - x, cy * TILE + 8 - y);
    if (d < bd) { bd = d; best = { x: cx * TILE + 8, y: cy * TILE + 8 }; }
  }
  return best || { x, y };
}
// where a boss room puts the boss and its trainer: between the centre and the exit, the trainer just above
export function bossSpots(room) {
  const c = room.exits[0] ? { x: room.center.x, y: (room.center.y + room.exits[0].y) / 2 } : room.center;
  const boss = openSpot(room, c.x, c.y);
  let trainer = null;
  for (const [dx, dy] of [[0, -30], [0, -22], [0, -38], [-16, -30], [16, -30], [-16, -22], [16, -22], [0, -14]]) {
    const q = { x: boss.x + dx, y: boss.y + dy }, tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE);
    if (tx >= 0 && ty >= 0 && tx < room.w && ty < room.h && room.reach?.[ty * room.w + tx]) { trainer = q; break; }
  }
  return { boss, trainer: trainer || openSpot(room, boss.x, boss.y - 30) };
}

function centroid(room, comp) {
  let sx = 0, sy = 0, n = 0;
  for (const j of comp) { sx += j % room.w; sy += (j / room.w) | 0; n++; }
  let cx = sx / n, cy = sy / n, bd = 1e9, bj = 0;
  for (const j of comp) { const d = Math.hypot((j % room.w) - cx, ((j / room.w) | 0) - cy); if (d < bd && isRoomy(room, j % room.w, (j / room.w) | 0)) { bd = d; bj = j; } }
  return { x: (bj % room.w) * TILE + 8, y: ((bj / room.w) | 0) * TILE + 8 };
}

// tile animation (water, flowers): draws animated 8x8 cells over the under layer
export function drawTileAnims(ctx, room, tick) {
  const A = room.anim; if (!A) return;
  const x0 = room.ox - 200, y0 = room.oy - 140, x1 = room.ox + room.w * TILE + 200, y1 = room.oy + room.h * TILE + 140;
  for (const a of A.anims) {
    if (a.layer !== 'under' || !ready(a.img)) continue;
    const f = Math.floor((tick - (a.phase || 0)) / a.interval) % a.frames;
    if (f < 0) continue;
    for (const [px, py, slot] of a.cells) {
      if (px < x0 - 8 || py < y0 - 8 || px > x1 || py > y1) continue;
      const sx = (slot % a.cols) * 8, sy = (f * a.rowsPerFrame + Math.floor(slot / a.cols)) * 8;
      ctx.drawImage(a.img, sx, sy, 8, 8, px, py, 8, 8);
    }
  }
}
