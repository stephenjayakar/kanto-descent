// Money income per biome vs shop prices, and stardust income vs research costs.
const L = require('./lib.cjs');
const { BIOMES, pool, lvl, trainersFor } = require('./progression.cjs');
const avg = (a, b) => (a + b) / 2;
const TC = require('../../web/assets/data/trainer_classes.json');
let cum = 0;
console.log('biome | combat rooms | KOs | kill money | trainer prize | nugget | total/biome | cumulative | prices: candy / HP UP / held / Sacred Ash / Star Piece');
BIOMES.forEach((b, bi) => {
  const rooms = b.rooms - 1; let kills = 0, money = 0;
  const p = pool(b); const tot = p.reduce((s, x) => s + x.rate, 0);
  for (let r = 0; r < rooms; r++) {
    if (r === 2 && bi < 4) continue; // shop room
    const n = avg(...b.waves) * (avg(...b.per) + Math.floor(r / 3));
    const lv = p.reduce((s, x) => s + x.rate / tot * lvl(b, r, avg(x.min, x.max)), 0);
    const trainerMul = b.trainerOnly ? (0.6 * 0.5 + 0.4) : 1;
    kills += n; money += n * Math.round(2 + lv * 0.6) * trainerMul;
  }
  const ts = trainersFor(b); const prize = ts.length ? ts.reduce((s, t) => s + (Math.round(TC[t.class]?.money || 10) * 4 + 20), 0) / ts.length : 0;
  const prizes = b.trainerOnly ? prize * 0.6 * (rooms - 1) : (ts.length ? prize : 0);
  const nugget = 60 + bi * 35 + 15;
  const total = money + prizes; cum += total;
  console.log(`${b.key.padEnd(6)} | ${rooms} | ${kills.toFixed(0)} | ${money.toFixed(0)} | ${prizes.toFixed(0)} | (+${nugget} if taken) | ${total.toFixed(0)} | ${cum.toFixed(0)} | ${100 + bi * 40} / ${130 + bi * 30} / ${150 + bi * 30} / ${260 + bi * 40} / 90`);
});
const RES = { hp: [15, 30, 50, 75, 100], power: [20, 40, 60, 90, 120], revive: [60, 200], level: [30, 70, 130], dash: [150], money: [15, 25, 40, 60], balls: [20, 40, 70], exp: [25, 50, 90], luck: [40, 80, 140], reroll: [50, 100, 160], call: [30, 60, 100] };
const all = Object.values(RES).flat().reduce((a, b) => a + b, 0);
console.log('\nresearch total cost', all, Object.fromEntries(Object.entries(RES).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0)])));
// stardust per run outcome
const dustDoor = bi => 13 + bi * 4, piece = bi => 40 + bi * 8, bossFirst = bi => 60 + bi * 20, bossRep = bi => 25 + bi * 8;
for (const reach of [0, 1, 2, 3, 4, 5]) {
  let first = 0, rep = 0; for (let bi = 0; bi < reach; bi++) { first += bossFirst(bi); rep += bossRep(bi); }
  const doors = Math.min(reach + 1, 5) * 1 * dustDoor(Math.min(reach, 4)); // ~1 stardust door taken per biome
  console.log(`beat ${reach} bosses: first-time ${first + doors}, repeat ${rep + doors} stardust (+5/new dex catch, +25 per 90¥ STAR PIECE)`);
}
