// Superseded by tools/room_audit.mjs, which rebuilds every room with the game's own rooms.js/combat.js
// (thin walls, footprint reachability, dash probes, spawn points, crop sanity) and draws contact sheets.
// Kept as a shortcut: node tests/review/rooms_check.cjs  ==  node tools/room_audit.mjs --no-sheets --strict
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync(process.execPath, [path.join(__dirname, '../../tools/room_audit.mjs'), '--no-sheets', '--strict', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
