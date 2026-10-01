import { loadGame } from '../sim/env.mjs';
const G_ = await loadGame();
const { run: RUN } = G_;
const { RoomScene } = await import('../../web/src/scenes/room.js');
RUN.newRun('EEVEE', 'X');
const sc = new RoomScene({ kind: 'combat', layout: 'LAYOUT_SILPH_CO_9F', cropIndex: 0, reward: { kind: 'money' } });
await sc.enter();
const w = sc.world, p = w.player;
p.brain = null;
for (const [x0, y0, vx, vy] of [[244, 32, 0, -100], [244, 34, 0, -100], [240, 32, 0, -100]]) {
  p.x = x0; p.y = y0; p.vx = vx; p.vy = vy;
  for (let i = 0; i < 30; i++) w.moveBy(p, vx / 60, vy / 60);
  console.log('from', x0, y0, '->', p.x.toFixed(1), p.y.toFixed(1), 'collides now', w.collides(p.x, p.y, 6, 'walk'));
}
