// Rebuilds rooms exactly like web/src/game/rooms.js and checks geometry problems:
//  - exits reachable from the entry for actors of different collision radius (World.collides sampling)
//  - boss spawn points / NPC points inside walls
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '../../web/assets');
const J = f => JSON.parse(fs.readFileSync(path.join(A, f), 'utf8'));
const INDEX = J('maps/index.json'), CANDS = J('maps/rooms_candidates.json');
const TILE = 16;
const WATER = /WATER|POND|OCEAN|SEAWEED|WATERFALL|CURRENT|DIVE|PUDDLE_DEEP/, LEDGE = /JUMP_/, BLOCKS_WALK = /COUNTER|IMPASSABLE|HOLE|CRACKED_ICE|BOOKSHELF|PC$|CABINET|TV/;
function buildRoom(id, crop, opts) {
  const M = J(`maps/${id}/meta.json`); const w = crop.w, h = crop.h;
  const walk = new Uint8Array(w * h), shot = new Uint8Array(w * h);
  const names = M.behaviorNames || {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const mi = (crop.y + y) * M.w + (crop.x + x), i = y * w + x;
    const col = M.collision[mi] !== '0'; const bn = names[M.behavior[mi]] || '';
    const isWater = WATER.test(bn) && !/PUDDLE$/.test(bn); const ledge = LEDGE.test(bn);
    walk[i] = col || isWater || ledge || BLOCKS_WALK.test(bn) ? 1 : 0; shot[i] = col && !isWater ? 1 : 0;
  }
  const warps = [];
  for (const mapId of M.maps || []) for (const wv of INDEX.maps?.[mapId]?.warp_events || []) {
    const x = wv.x - crop.x, y = wv.y - crop.y;
    if (x >= 0 && y >= 0 && x < w && y < h && !warps.some(q => q.x === x && q.y === y)) warps.push({ x, y });
  }
  for (const q of warps) walk[q.y * w + q.x] = 0;
  const room = { id, crop, w, h, walk, shot, warps };
  placeEntryExits(room, opts);
  return room;
}
function bfs(room, sx, sy) {
  const { w, h, walk } = room; const d = new Int16Array(w * h).fill(-1); const q = [sy * w + sx]; d[q[0]] = 0;
  for (let k = 0; k < q.length; k++) { const i = q[k], x = i % w, y = (i / w) | 0; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (d[j] >= 0 || walk[j]) continue; d[j] = d[i] + 1; q.push(j); } }
  return d;
}
function isRoomy(room, x, y) { let n = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < room.w && ny < room.h && !room.walk[ny * room.w + nx]) n++; } return n >= 2; }
function centroid(room, comp) { let sx = 0, sy = 0, n = 0; for (const j of comp) { sx += j % room.w; sy += (j / room.w) | 0; n++; } let cx = sx / n, cy = sy / n, bd = 1e9, bj = 0; for (const j of comp) { const d = Math.hypot((j % room.w) - cx, ((j / room.w) | 0) - cy); if (d < bd && isRoomy(room, j % room.w, (j / room.w) | 0)) { bd = d; bj = j; } } return { x: (bj % room.w) * TILE + 8, y: ((bj / room.w) | 0) * TILE + 8 }; }
function placeEntryExits(room, opts) {
  const { w, h, walk } = room; const seen = new Uint8Array(w * h); let best = null;
  for (let i = 0; i < w * h; i++) { if (walk[i] || seen[i]) continue; const d = bfs(room, i % w, (i / w) | 0); const cells = []; for (let j = 0; j < w * h; j++) if (d[j] >= 0) { seen[j] = 1; cells.push(j); } if (!best || cells.length > best.length) best = cells; }
  const comp = new Set(best || []); room.comp = comp;
  room.reach = new Uint8Array(w * h); for (const j of comp) room.reach[j] = 1;
  const open = (x, y) => comp.has(y * w + x) && isRoomy(room, x, y);
  let entry = null, es = -1e9; const pref = opts.entry;
  for (const j of comp) { const x = j % w, y = (j / w) | 0; if (!isRoomy(room, x, y)) continue; const s = pref ? -Math.hypot(x - pref.x, y - pref.y) : y * 3 - Math.abs(x - w / 2) * 1.2; if (s > es) { es = s; entry = { x, y }; } }
  entry ||= { x: (best[0] % w), y: (best[0] / w) | 0 };
  room.entry = { x: entry.x * TILE + 8, y: entry.y * TILE + 8 };
  if (opts.exitAtWarps && room.warps.length) {
    const ws = room.warps.filter(q => comp.has(q.y * w + q.x) || comp.has((q.y - 1) * w + q.x));
    const mid = ws[Math.floor(ws.length / 2)] || room.warps[0];
    room.entry = opts.entry ? { x: opts.entry.x * TILE + 8, y: opts.entry.y * TILE + 8 } : { x: mid.x * TILE + 8, y: (mid.y - 1) * TILE + 8 };
    room.exits = [{ tx: mid.x, ty: mid.y, x: mid.x * TILE + 8, y: mid.y * TILE + 10, warp: true }];
    room.center = centroid(room, comp); return;
  }
  const dist = bfs(room, entry.x, entry.y); const cand = [];
  for (const q of room.warps) for (const [dx, dy] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) { const x = q.x + dx, y = q.y + dy; if (x >= 0 && y >= 0 && x < w && y < h && comp.has(y * w + x)) { cand.push({ x, y, warp: true, score: dist[y * w + x] + 30 }); break; } }
  for (const j of comp) { const x = j % w, y = (j / w) | 0; if (!open(x, y)) continue; const edge = y <= 1 || x <= 1 || x >= w - 2; if (!edge) continue; cand.push({ x, y, score: dist[j] + (y <= 1 ? 10 : 0) }); }
  cand.sort((a, b) => b.score - a.score);
  const exits = []; const n = opts.exits ?? 3;
  for (const c of cand) { if (exits.length >= n) break; if (Math.hypot(c.x - entry.x, c.y - entry.y) < 7) continue; if (exits.some(e => Math.hypot(e.tx - c.x, e.ty - c.y) < 6)) continue; exits.push({ tx: c.x, ty: c.y, x: c.x * TILE + 8, y: c.y * TILE + 8, warp: !!c.warp }); }
  if (!exits.length) { let fj = best[0]; for (const j of comp) if (dist[j] > dist[fj]) fj = j; exits.push({ tx: fj % w, ty: (fj / w) | 0, x: (fj % w) * TILE + 8, y: ((fj / w) | 0) * TILE + 8 }); }
  room.exits = exits; room.center = centroid(room, comp);
}
// World.blocked/collides (walk mode)
const blocked = (R, px, py) => { const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE); if (tx < 0 || ty < 0 || tx >= R.w || ty >= R.h) return true; return R.walk[ty * R.w + tx] !== 0; };
const collides = (R, x, y, r) => { const s = r * 0.75; return blocked(R, x - s, y - s * 0.5) || blocked(R, x + s, y - s * 0.5) || blocked(R, x - s, y + s * 0.5) || blocked(R, x + s, y + s * 0.5) || blocked(R, x, y); };
// reachability on a 2px grid for a disc of radius r, moving in 2px axis steps (like moveBy with walking speed)
function fatReach(R, r, from) {
  const G = 2, gw = Math.ceil(R.w * TILE / G), gh = Math.ceil(R.h * TILE / G);
  const ok = (gx, gy) => !collides(R, gx * G + 1, gy * G + 1, r);
  const seen = new Uint8Array(gw * gh); const sx = Math.floor(from.x / G), sy = Math.floor(from.y / G);
  const q = [];
  if (ok(sx, sy)) { q.push(sy * gw + sx); seen[q[0]] = 1; } else { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx === 0 || dy === 0) && ok(sx + dx, sy + dy)) { const j = (sy + dy) * gw + sx + dx; if (!seen[j]) { seen[j] = 1; q.push(j); } } if (!q.length) return { stuck: true, seen, G, gw }; }
  for (let k = 0; k < q.length; k++) { const i = q[k], x = i % gw, y = (i / gw) | 0; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const j = ny * gw + nx; if (seen[j] || !ok(nx, ny)) continue; seen[j] = 1; q.push(j); } }
  return { seen, G, gw };
}
const canTouch = (fr, pt, rad) => { // any reachable grid cell within rad px of pt
  for (let i = 0; i < fr.seen.length; i++) if (fr.seen[i]) { const x = (i % fr.gw) * fr.G + 1, y = ((i / fr.gw) | 0) * fr.G + 1; if (Math.hypot(x - pt.x, y - pt.y) < rad) return true; }
  return false;
};
const content = fs.readFileSync(path.join(__dirname, '../../web/src/game/content.js'), 'utf8');
const BIOMES = eval(content.match(/export const BIOMES = (\[[\s\S]*?\n\]);/)[1]);
const sp = J('data/species.json');
const radius = k => Math.max(6, Math.min(15, 5 + (sp[k].height || 8) * 0.55));
const SIZES = process.env.R6 ? { TERRAIN6: 6, BOSS8: 8 } : { CHARMANDER: radius("CHARMANDER"), CHARMELEON: radius("CHARMELEON"), GASTLY: radius("GASTLY"), DRATINI: radius("DRATINI"), CHARIZARD: radius("CHARIZARD"), BLASTOISE: radius("BLASTOISE"), VENUSAUR: radius("VENUSAUR") };
console.log('player radii', SIZES);
const report = [];
const check = (label, id, crop, opts, extra = {}) => {
  const R = buildRoom(id, crop, opts);
  const issues = [];
  for (const [name, r] of Object.entries(SIZES)) {
    const fr = fatReach(R, r, R.entry);
    if (fr.stuck) { issues.push(`${name}(r=${r.toFixed(1)}) STUCK at entry`); continue; }
    R.exits.forEach((e, i) => { if (!canTouch(fr, e, 10)) issues.push(`${name}(r=${r.toFixed(1)}) cannot reach exit#${i} (${e.tx},${e.ty})`); });
    for (const [n, pt, rng] of extra.npcs || []) if (!canTouch(fr, pt, rng)) issues.push(`${name} cannot get within ${rng}px of NPC ${n}`);
  }
  for (const [n, pt, r] of extra.points || []) if (collides(R, pt.x, pt.y, r)) issues.push(`point ${n} (${pt.x},${pt.y}) r=${r.toFixed(1)} collides with walls`);
  if (issues.length) report.push(`${label} ${id}#${JSON.stringify(crop)}:\n   ` + issues.join('\n   '));
  return R;
};
for (const B of BIOMES) {
  for (const [lay, idx] of B.pools) for (const i of idx) { const c = CANDS[lay]?.candidates?.[i]; if (c) check(B.key, lay, c, { exits: 3 }); }
  const [bl, bi] = B.bossRoom; const c = CANDS[bl].candidates[bi];
  const R0 = buildRoom(bl, c, { exits: 1 });
  const at = R0.exits[0] ? { x: R0.center.x, y: (R0.center.y + R0.exits[0].y) / 2 } : R0.center;
  const mons = { forest: [['ONIX', 0]], mtmoon: [['STARMIE', 0]], tower: [['MAROWAK', 0]], silph: [['RHYHORN', -24], ['KANGASKHAN', 24]], cave: [['MEWTWO', 0]] }[B.key];
  const pts = mons.map(([k, dx]) => [`boss ${k}`, { x: at.x + dx, y: at.y }, Math.max(radius(k), 12)]);
  if (B.key === 'silph') pts.push(['finale NIDOQUEEN @center', R0.center, Math.max(radius('NIDOQUEEN'), 12)]);
  pts.push(['boss trainer NPC', { x: at.x, y: at.y - 30 }, 4]);
  check(B.key + ' BOSS', bl, c, { exits: 1 }, { points: pts });
}
// shop / center / hub NPCs
const atP = (crop, x, y) => ({ x: (x - crop.x) * TILE + 8, y: (y - crop.y) * TILE + 16 - 8 });
{ const c = CANDS.LAYOUT_MART.candidates[0]; check('SHOP', 'LAYOUT_MART', c, { exits: 3, exitAtWarps: true }, { npcs: [['clerk', atP(c, 2, 3), 40]] }); }
{ const c = CANDS.LAYOUT_POKEMON_CENTER_1F.candidates[0]; check('CENTER', 'LAYOUT_POKEMON_CENTER_1F', c, { exits: 3, exitAtWarps: true }, { npcs: [['nurse', atP(c, 7, 2), 40], ['clerk', atP(c, 12, 5), 30]] }); }
{ const c = CANDS.LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB.candidates[0]; check('HUB', 'LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB', c, { exits: 1, entry: { x: 7, y: 5 }, exitAtWarps: true }, { npcs: [['oak', atP(c, 6, 3), 30], ['balls', atP(c, 9, 4), 34], ['aide R', atP(c, 11, 10), 30], ['aide L', atP(c, 2, 10), 30], ['rival', atP(c, 5, 4), 30]] }); }
console.log(report.join('\n') || 'no geometry issues');

if (process.argv[2]) { // debug: node rooms_check.cjs LAYOUT idx radius exits
  const [lay, idx, r, ex] = process.argv.slice(2);
  const c = CANDS[lay].candidates[+idx];
  const R = buildRoom(lay, c, { exits: +(ex || 3) });
  const fr = fatReach(R, +r, R.entry);
  const ent = [Math.floor(R.entry.x / 16), Math.floor(R.entry.y / 16)];
  for (let y = 0; y < R.h; y++) { let s = ''; for (let x = 0; x < R.w; x++) { const isE = R.exits.findIndex(e => e.tx === x && e.ty === y); let reach = false; for (let k = 0; k < 64 && !reach; k++) { const gx = (x * 16 + (k % 8) * 2) / 2, gy = (y * 16 + ((k / 8) | 0) * 2) / 2; if (fr.seen[gy * fr.gw + gx]) reach = true; } s += isE >= 0 ? String(isE) : (ent[0] === x && ent[1] === y) ? 'E' : R.walk[y * R.w + x] ? '#' : reach ? '.' : 'o'; } console.log(s); }
}

if (process.env.POCKETS) {
  for (const B of BIOMES) for (const [lay, idx] of B.pools) for (const i of idx) {
    const c = CANDS[lay]?.candidates?.[i]; if (!c) continue;
    const R = buildRoom(lay, c, { exits: 3 });
    let pockets = 0, flyOnly = 0;
    for (let j = 0; j < R.w * R.h; j++) { if (!R.walk[j] && !R.reach[j]) pockets++; }
    // tiles a flyer can stand on (not wall) that the player can't: water/ledges/pockets
    const M = J(`maps/${lay}/meta.json`);
    for (let j = 0; j < R.w * R.h; j++) if (!R.reach[j] && !(R.walk[j] && R.shot[j])) flyOnly++;
    if (pockets) console.log(`${B.key} ${lay}#${i}: ${pockets} walkable tiles outside the reachable component; ${flyOnly} tiles flyers can occupy but the player can't reach`);
  }
}
