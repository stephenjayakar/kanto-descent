// pressing R in the hub (Oak's lab) spends the run's starting POKé BALLS (world.noBalls is never set)
import { loadGame, tickTimers } from '../sim/env.mjs';
const G_ = await loadGame();
const { run: RUN, core } = G_;
const { RoomScene } = await import('../../web/src/scenes/room.js');
RUN.newRun('CHARMANDER', 'H'); RUN.G.meta.seenIntro = true;
const sc = new RoomScene({ kind: 'hub', layout: 'LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB', cropIndex: 0, entry: { x: 7, y: 5 }, shopRoom: true });
await sc.enter(); core.setScene(sc); sc.state = 'play';
const b0 = RUN.G.run.balls;
for (let i = 0; i < 3; i++) { core.Engine.pressed.add('r'); core.Engine.keys.add('r'); sc.update(1 / 60); core.Engine.keys.delete('r'); core.Engine.pressed.clear(); for (let k = 0; k < 20; k++) sc.update(1 / 60); }
console.log('hub: balls', b0, '->', RUN.G.run.balls, ' world.noBalls =', sc.world.noBalls, ' same run object used when leaving the lab: goNext keeps G.run');
process.exit(0);
