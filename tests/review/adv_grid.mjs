import { loadGame } from '../sim/env.mjs';
const G_ = await loadGame();
const { combat, rooms, run: RUN } = G_;
const [lay, idx, sp, ex] = process.argv.slice(2);
const R = rooms.buildRoom(await rooms.loadLayout(lay), rooms.candidates(lay)[+idx], { exits: +(ex || 3) });
for (let y = 0; y < R.h; y++) { let s = ''; for (let x = 0; x < R.w; x++) { const e = R.exits.findIndex(q => q.tx === x && q.ty === y); s += e >= 0 ? e : R.walk[y * R.w + x] ? '#' : '.'; } console.log(s); }
const r = RUN.newRun('CHARMANDER', 'S'); const w = new combat.World(R, { rng: r.rng });
const ok = [];
for (let x0 = 2; x0 <= R.w * 16 - 2; x0 += 0.5) { const a = combat.makeActor(sp, 20, 'player', { x: x0, y: 5 * 16 + 8 }); if (w.collides(a.x, a.y, a.r, 'walk')) continue; for (let i = 0; i < 120; i++) w.moveBy(a, 0, -1.8); if (a.y < 4 * 16) ok.push(x0 + '->' + a.y.toFixed(1)); }
console.log('passed row4 from x:', ok.join(' '));
process.exit(0);
