// Room geometry audit: rebuilds every room the game can load (combat pools, boss rooms, Center, Mart, hub)
// with the real web/src/game/rooms.js buildRoom, flags collision that doesn't match the map, and renders
// one small contact sheet per area with a collision overlay (tools/room_audit_sheet.py).
//
//   node tools/room_audit.mjs                 # report + sheets in tools/maps_verify/audit/
//   node tools/room_audit.mjs --no-sheets     # report only
//   node tools/room_audit.mjs --strict        # exit 1 if any room has an ERROR flag (for CI-style checks)
//   node tools/room_audit.mjs --area=tower    # one area
//   node tools/room_audit.mjs --crop=LAYOUT_SEAFOAM_ISLANDS_B4F:12,1,22,10   # try a crop (sheet: explore.png)
//
// Flags (per room):
//   ERROR  stuck-entry / unreachable-exit (fat-footprint walk from the entry, r=6 player, r=8 boss), spawn in wall,
//          walk-through-solid (a reachable walkable cell whose metatile is solid nearly everywhere else in the game),
//          elevation-edge-open (two walkable neighbours on different heights with no stairs and no thin wall between),
//          dash-through-solid / dash-teleport / dash-stranded (real dashes from every reachable cell, 8 directions)
//   WARN   walk-only-block (blocks walking, not dashes, and isn't water or a ledge),
//          blocked-looking-open (a solid cell whose metatile is open nearly everywhere else),
//          door-into-wall (an edge exit that leads into solid map outside the crop), small arena / low reach,
//          walkable pockets the player can't reach.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import '../tests/sim/env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAPS = path.join(ROOT, 'web/assets/maps');
const OUT = path.join(ROOT, 'tools/maps_verify/audit');
const args = process.argv.slice(2);
const flag = k => args.includes(k);
const areaArg = (args.find(a => a.startsWith('--area=')) || '').slice(7);

const rooms = await import('../web/src/game/rooms.js');
const { BIOMES } = await import('../web/src/game/content.js');
await rooms.loadMapIndex();
const TILE = 16;
const meta = id => JSON.parse(fs.readFileSync(path.join(MAPS, id, 'meta.json'), 'utf8'));

// ---- metatile statistics over every layout: how often is metatile M of tileset T solid?
// Primary metatiles (< 0x280) are shared by every layout on that primary tileset; secondary ones by the pair.
const stats = new Map();
const keyOf = (M, mt) => mt < 640 ? `${M.primary}:${mt}` : `${M.primary}+${M.secondary}:${mt}`;
for (const d of fs.readdirSync(MAPS)) {
  const f = path.join(MAPS, d, 'meta.json'); if (!fs.existsSync(f)) continue;
  const M = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (let i = 0; i < M.w * M.h; i++) {
    const k = keyOf(M, M.metatile[i]); let s = stats.get(k); if (!s) stats.set(k, s = { solid: 0, open: 0, layouts: new Set() });
    if (M.collision[i] !== '0') s.solid++; else s.open++;
    s.layouts.add(d);
  }
}
const solidShare = (M, mt) => { const s = stats.get(keyOf(M, mt)); return s ? { n: s.solid + s.open, p: s.solid / (s.solid + s.open) } : { n: 0, p: 0 }; };

// ---- the game's own collision (combat.js World) for footprint reachability and dash probes
const { World } = await import('../web/src/game/combat.js');
const { DASH_DIST, DASH_TIME } = await import('../web/src/game/player.js');
function fatReach(w, r, from) {
  const R = w.room, G = 2, gw = Math.ceil(R.w * TILE / G), gh = Math.ceil(R.h * TILE / G);
  const P = (g) => g * G + 1;
  const ok = (gx, gy) => gx >= 0 && gy >= 0 && gx < gw && gy < gh && !w.collides(P(gx), P(gy), r, 'walk');
  const seen = new Uint8Array(gw * gh), q = [];
  const sx = Math.floor(from.x / G), sy = Math.floor(from.y / G);
  for (let d = 0; d <= 3 && !q.length; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (ok(sx + dx, sy + dy)) { const j = (sy + dy) * gw + sx + dx; if (!seen[j]) { seen[j] = 1; q.push(j); } }
  if (!q.length) return null;
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % gw, y = (i / gw) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const j = ny * gw + nx; if (ok(nx, ny) && !seen[j] && !w.crossesEdge(P(x), P(y), P(nx), P(ny), r, 'walk')) { seen[j] = 1; q.push(j); } }
  }
  return { seen, G, gw, gh };
}
const touches = (fr, pt, rad) => { const G = fr.G; for (let gy = Math.max(0, Math.floor((pt.y - rad) / G)); gy <= Math.min(fr.gh - 1, Math.ceil((pt.y + rad) / G)); gy++) for (let gx = Math.max(0, Math.floor((pt.x - rad) / G)); gx <= Math.min(fr.gw - 1, Math.ceil((pt.x + rad) / G)); gx++) if (fr.seen[gy * fr.gw + gx] && Math.hypot(gx * G + 1 - pt.x, gy * G + 1 - pt.y) < rad) return true; return false; };
// a real dash (combat.js tickActive 'dash') from (x,y) at angle ang; returns the path and where it ends
function dashProbe(w, x, y, ang) {
  const a = { r: 8.3, x, y, z: 0, dex: 4, dir: 0, anim: 'Walk', animT: 0, dashing: true, team: 'player' };
  const act = a.action = { p: { kind: 'dash' }, stage: 'active', t: 0, dur: DASH_TIME, hits: new Set(), vx: Math.cos(ang) * DASH_DIST / DASH_TIME, vy: Math.sin(ang) * DASH_DIST / DASH_TIME };
  const path = [[x, y]];
  for (let k = 0; k < 40; k++) { act.t += 1 / 60; const done = w.tickActive(a, act, 1 / 60); path.push([a.x, a.y]); if (done) break; }
  w.vfx.length = 0;
  return { path, x: a.x, y: a.y };
}

const compat = (a, b) => a === 0 || b === 0 || a === 15 || b === 15 || a === b;

function audit(label, area, layout, cropIndex, opts, extra = {}) {
  const L = { id: layout, meta: meta(layout), under: null, over: null, anim: null };
  const crop = typeof cropIndex === 'object' ? cropIndex : rooms.candidates(layout)[cropIndex];
  if (!crop) return { label, area, layout, cropIndex, missing: true, flags: [{ sev: 'ERROR', kind: 'missing-crop' }] };
  const R = rooms.buildRoom(L, crop, opts);
  const w = new World(R, { rng: () => 0.5 });
  const M = L.meta, names = M.behaviorNames || {}, W = M.w;
  const flags = [], cells = [];
  const add = (sev, kind, x, y, note) => { flags.push({ sev, kind, x, y, note }); if (x !== undefined) cells.push([x, y, kind]); };
  const at = (x, y) => (crop.y + y) * W + crop.x + x;
  const isWarp = (x, y) => R.warps.some(q => q.x === x && q.y === y);
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
    const i = y * R.w + x, mi = at(x, y), mt = M.metatile[mi], bn = names[M.behavior[mi]] || '';
    const sh = solidShare(M, mt);
    if (!R.walk[i] && R.reach[i] && !isWarp(x, y) && sh.n >= 4 && sh.p >= 0.85 && M.collision[mi] === '0') add('ERROR', 'walk-through-solid', x, y, `mt ${mt} solid in ${(sh.p * 100) | 0}% of ${sh.n} uses (${bn})`);
    if (R.walk[i] && !R.water[i] && M.collision[mi] !== '0' && sh.n >= 4 && sh.p <= 0.1) add('WARN', 'blocked-looking-open', x, y, `mt ${mt} open in ${((1 - sh.p) * 100) | 0}% of ${sh.n} uses (${bn})`);
    // dash/fly mode: may cross walk-blocked cells only when they're gaps (water, ledges); solid art must stop it
    if (R.walk[i] && !R.shot[i] && !R.water[i] && !/JUMP_/.test(bn)) add('WARN', 'walk-only-block', x, y, `${bn} col=${M.collision[mi]}: dashes cross it`);
    // GBA elevation: stepping between two heights (neither 0 = any, nor 15 = bridge) is blocked in the real game;
    // rooms.js must turn that into a thin wall (room.edge) or the player walks up and down cliff rims
    for (const [dx, dy, bit] of [[1, 0, 8], [0, 1, 2]]) {
      const X = x + dx, Y = y + dy; if (X >= R.w || Y >= R.h) continue;
      const j = Y * R.w + X;
      if (R.walk[i] || R.walk[j]) continue;
      const e0 = parseInt(M.elevation[mi], 16), e1 = parseInt(M.elevation[at(X, Y)], 16);
      if (!compat(e0, e1) && !(R.edge?.[i] & bit)) add('ERROR', 'elevation-edge-open', x, y, `z${e0}|z${e1} to ${dx ? 'E' : 'S'}`);
    }
  }
  // reachability for the player's terrain footprint (r=6) and a boss's (r=8)
  let walkable = 0, reach = 0, pockets = 0;
  for (let i = 0; i < R.w * R.h; i++) if (!R.walk[i]) { walkable++; if (R.reach[i]) reach++; else pockets++; }
  for (const r of [6, 8]) {
    if (r === 8 && opts.exits !== 1) continue; // only boss rooms host r=8 actors that must reach the player
    const fr = fatReach(w, r, R.entry);
    if (!fr) { add('ERROR', 'stuck-entry', Math.floor(R.entry.x / TILE), Math.floor(R.entry.y / TILE), `r=${r}`); continue; }
    R.exits.forEach((e, k) => { if (!touches(fr, e, 12)) add('ERROR', 'unreachable-exit', e.tx, e.ty, `exit ${k} r=${r}`); });
    let cov = 0, tot = 0; // reach cells a footprint can't get to (narrow necks)
    for (let i = 0; i < R.w * R.h; i++) if (R.reach[i]) { tot++; const cx = (i % R.w) * TILE + 8, cy = ((i / R.w) | 0) * TILE + 8; if (touches(fr, { x: cx, y: cy }, 8)) cov++; }
    if (cov < tot * 0.95) add('WARN', 'narrow-reach', undefined, undefined, `r=${r} reaches ${cov}/${tot} reachable cells`);
  }
  for (const [n, pt, r] of extra.points || []) if (w.collides(pt.x, pt.y, Math.min(r, 8), 'walk') || !w.reachable(pt.x, pt.y)) add('ERROR', 'spawn-in-wall', Math.floor(pt.x / TILE), Math.floor(pt.y / TILE), n);
  // dashes from every reachable cell in 8 directions: never through solid cells, never dropped on the far side of a wall
  const solidAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx < 0 || ty < 0 || tx >= R.w || ty >= R.h || (R.walk[ty * R.w + tx] && R.shot[ty * R.w + tx]); };
  const dashBad = new Set();
  for (let i = 0; i < R.w * R.h; i++) {
    if (!R.reach[i]) continue;
    const x0 = (i % R.w) * TILE + 8, y0 = ((i / R.w) | 0) * TILE + 8;
    if (w.collides(x0, y0, 6, 'walk')) continue;
    for (let k = 0; k < 8; k++) {
      const d = dashProbe(w, x0, y0, k * Math.PI / 4);
      let bad = d.path.some(([x, y]) => solidAt(x, y)) ? 'dash-through-solid' : '';
      const step = [Math.cos(k * Math.PI / 4) * DASH_DIST / DASH_TIME / 60, Math.sin(k * Math.PI / 4) * DASH_DIST / DASH_TIME / 60];
      for (let j = 1; j < d.path.length && !bad; j++) { // a drop must be in plain view (from before or after that frame's move)
        const [px, py] = d.path[j - 1], [cx, cy] = d.path[j];
        const backOnPath = d.path.slice(0, j).some(([qx, qy]) => Math.hypot(qx - cx, qy - cy) < 1); // dropped back where it left the ground
        if (!backOnPath && !w.lineClear(px, py, cx, cy, 'dash') && !w.lineClear(px + step[0], py + step[1], cx, cy, 'dash')) bad = 'dash-teleport';
      }
      if (!bad && (w.collides(d.x, d.y, 6, 'walk') || !w.reachable(d.x, d.y))) bad = 'dash-stranded';
      if (bad && !dashBad.has(i)) { dashBad.add(i); add('ERROR', bad, i % R.w, (i / R.w) | 0, `dash ${k * 45}deg ends (${(d.x / TILE).toFixed(1)},${(d.y / TILE).toFixed(1)})`); }
    }
  }
  // exits that open onto solid map just outside the crop ("doors into walls")
  for (const e of R.exits) {
    if (e.warp) continue;
    // the arrow's direction, as rewards.js exitDir picks it for edge cells
    const dirs = [e.ty <= 1 ? [0, -1] : e.tx <= 1 ? [-1, 0] : e.tx >= R.w - 2 ? [1, 0] : e.ty >= R.h - 2 ? [0, 1] : null].filter(Boolean);
    for (const [dx, dy] of dirs) {
      let x = crop.x + e.tx, y = crop.y + e.ty, solid = 0, n = 0;
      for (let k = 1; k <= 3; k++) { const X = x + dx * k, Y = y + dy * k; if (X < 0 || Y < 0 || X >= W || Y >= M.h) { solid++; n++; continue; } n++; if (M.collision[Y * W + X] !== '0') solid++; }
      if (solid >= 2) add('WARN', 'door-into-wall', e.tx, e.ty, `${solid}/${n} solid beyond the edge`);
    }
  }
  const area_ = R.w * R.h;
  // arena-ness: reachable cells whose whole 3x3 block is reachable floor with no thin walls (room to fight, not corridors)
  let open3 = 0;
  for (let y = 1; y < R.h - 1; y++) for (let x = 1; x < R.w - 1; x++) {
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) { const j = (y + dy) * R.w + x + dx; if (!R.reach[j] || R.edge?.[j] && dx === 0 && dy === 0) ok = false; }
    if (ok) open3++;
  }
  if (reach < 110) add('WARN', 'small-arena', undefined, undefined, `${reach} reachable cells`);
  if (open3 < reach * 0.3) add('WARN', 'cramped', undefined, undefined, `only ${open3}/${reach} cells have open floor all around`);
  if (reach < walkable * 0.85) add('WARN', 'low-reach', undefined, undefined, `${reach}/${walkable} walkable cells reachable`);
  if (pockets) add('WARN', 'pockets', undefined, undefined, `${pockets} walkable cells unreachable`);
  if (opts.exits !== 1 && !opts.exitAtWarps && R.exits.length < 3) add('WARN', 'few-exits', undefined, undefined, `${R.exits.length} exits`);
  return {
    label, area, layout, cropIndex, crop, w: R.w, h: R.h, entry: R.entry, exits: R.exits, warps: R.warps, center: R.center,
    walk: Array.from(R.walk), shot: Array.from(R.shot), water: Array.from(R.water), reach: Array.from(R.reach), edge: Array.from(R.edge || []),
    stats: { cells: area_, walkable, reach, pockets, open3 }, flags, cells,
  };
}

// ---- every room the game loads (or, with --crop=LAYOUT:x,y,w,h ..., just those crops, as area "explore")
const out = [];
const explore = args.filter(a => a.startsWith('--crop=')).map(a => a.slice(7).split(':'));
for (const [lay, c] of explore) {
  const [x, y, w_, h] = c.split(',').map(Number);
  out.push(audit(`explore ${lay.replace('LAYOUT_', '')}@${c}`, 'explore', lay, { x, y, w: w_, h }, { exits: 3, waterWalk: false }));
}
const radius = h => Math.max(6, Math.min(15, 5 + (h || 8) * 0.55));
for (const B of explore.length ? [] : BIOMES) {
  if (areaArg && B.key !== areaArg) continue;
  for (const r of rooms.areaRooms(B)) out.push(audit(`${B.key} ${r.layout.replace('LAYOUT_', '')}${r.crop ? `@${r.crop.x},${r.crop.y},${r.crop.w},${r.crop.h}` : `#${r.cropIndex}`}`, B.key, r.layout, r.crop || r.cropIndex, { exits: 3, waterWalk: false }));
  const [bl, bi] = B.bossRoom;
  const R0 = rooms.buildRoom({ id: bl, meta: meta(bl) }, rooms.candidates(bl)[bi], { exits: 1 });
  const sp = rooms.bossSpots(R0); // what room.js setupBoss uses
  out.push(audit(`${B.key} BOSS ${bl.replace('LAYOUT_', '')}#${bi}`, B.key, bl, bi, { exits: 1, waterWalk: false }, { points: [['boss spawn', sp.boss, 8], ['boss trainer', sp.trainer, 4], ['arena centre', R0.center, 8]] }));
}
if (!explore.length && (!areaArg || areaArg === 'special')) {
  out.push(audit('special CENTER', 'special', 'LAYOUT_POKEMON_CENTER_1F', 0, { exits: 3, exitAtWarps: true }));
  out.push(audit('special MART', 'special', 'LAYOUT_MART', 0, { exits: 3, exitAtWarps: true }));
  out.push(audit('special HUB', 'special', 'LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB', 0, { exits: 1, entry: { x: 7, y: 5 }, exitAtWarps: true }));
}

// ---- report
let errors = 0;
const byArea = {};
for (const r of out) {
  (byArea[r.area] ||= []).push(r);
  const grp = {};
  for (const f of r.flags) { const k = `${f.sev} ${f.kind}`; (grp[k] ||= []).push(f); }
  const errs = r.flags.filter(f => f.sev === 'ERROR').length; errors += errs;
  const s = r.stats ? `${r.w}x${r.h} reach ${r.stats.reach}/${r.stats.cells} (${Math.round(100 * r.stats.reach / r.stats.cells)}%) open ${r.stats.open3} exits ${r.exits.length}` : '';
  console.log(`${errs ? '!!' : r.flags.length ? ' ~' : '  '} ${r.label.padEnd(44)} ${s}`);
  for (const [k, fs_] of Object.entries(grp)) console.log(`      ${k} x${fs_.length}: ${fs_.slice(0, 4).map(f => (f.x !== undefined ? `(${f.x},${f.y}) ` : '') + (f.note || '')).join('; ')}${fs_.length > 4 ? ' ...' : ''}`);
}
console.log(`\n${out.length} rooms, ${errors} errors`);
for (const [a, rs] of Object.entries(byArea)) if (a !== 'special') console.log(`  ${a}: ${rs.filter(r => !/BOSS/.test(r.label)).length} combat rooms + boss`);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(out));
if (!flag('--no-sheets')) {
  const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(ROOT, 'tools/room_audit_sheet.py'), path.join(OUT, 'audit.json'), OUT], { stdio: 'inherit' });
  if (py.status) console.error('sheet render failed');
}
if (flag('--strict') && errors) process.exit(1);
