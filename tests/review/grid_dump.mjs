// dump a room's walk/reach grid: node tests/review/grid_dump.mjs LAYOUT idx
import { loadGame } from '../sim/env.mjs';
const G_ = await loadGame();
const { rooms } = G_;
const [layout, idx] = [process.argv[2], +(process.argv[3] || 0)];
const L = await rooms.loadLayout(layout);
const crop = rooms.candidates(layout)[idx];
const R = rooms.buildRoom(L, crop, { exits: 3, waterWalk: false });
console.log(R.w, R.h, 'entry', R.entry, 'exits', R.exits.map(e => [e.x, e.y]));
for (let y = 0; y < R.h; y++) { let s = String(y).padStart(2) + ' '; for (let x = 0; x < R.w; x++) { const i = y * R.w + x; s += R.walk[i] === 0 ? (R.reach && !R.reach[i] ? 'u' : '.') : R.shot[i] ? '#' : String(R.walk[i]); } console.log(s); }
