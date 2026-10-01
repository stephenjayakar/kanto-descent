// Expected player level per biome for a typical run (expected-value model of the room/wave code).
const L = require('./lib.cjs');
const BIOMES = [
  { key: 'forest', rooms: 6, enc: ['MAP_VIRIDIAN_FOREST', 'MAP_ROUTE2'], tmaps: ['MAP_VIRIDIAN_FOREST'], lb: [0, 3], waves: [1, 2], per: [3, 4], boss: [['ONIX', 14, 1]], adds: ['GEODUDE', 12, 4, true] },
  { key: 'mtmoon', rooms: 7, enc: ['MAP_MT_MOON_1F', 'MAP_MT_MOON_B1F', 'MAP_MT_MOON_B2F'], tmaps: ['MAP_MT_MOON_1F', 'MAP_MT_MOON_B2F'], lb: [1, 4], waves: [2, 2], per: [3, 5], boss: [['STARMIE', 21, 1]], adds: ['STARYU', 18, 1, true] },
  { key: 'tower', rooms: 7, enc: ['MAP_POKEMON_TOWER_3F', 'MAP_POKEMON_TOWER_4F', 'MAP_POKEMON_TOWER_5F', 'MAP_POKEMON_TOWER_6F'], tmaps: ['MAP_POKEMON_TOWER_3F', 'MAP_POKEMON_TOWER_4F', 'MAP_POKEMON_TOWER_5F'], lb: [1, 4], waves: [2, 3], per: [3, 5], boss: [['MAROWAK', 30, 1]], adds: ['GASTLY', 22, 4, false] },
  { key: 'silph', rooms: 7, enc: [], tmaps: ['MAP_SILPH_CO_2F', 'MAP_SILPH_CO_3F', 'MAP_SILPH_CO_4F', 'MAP_SILPH_CO_5F', 'MAP_SILPH_CO_6F', 'MAP_SILPH_CO_7F', 'MAP_SILPH_CO_8F', 'MAP_SILPH_CO_9F', 'MAP_SILPH_CO_10F'], lb: [0, 3], waves: [2, 3], per: [3, 4], boss: [['RHYHORN', 37, 1], ['KANGASKHAN', 35, 1], ['NIDOQUEEN', 41, 1]], trainerOnly: true },
  { key: 'cave', rooms: 3, enc: ['MAP_CERULEAN_CAVE_1F', 'MAP_CERULEAN_CAVE_2F', 'MAP_CERULEAN_CAVE_B1F'], tmaps: [], lb: [-12, -6], waves: [2, 3], per: [3, 4], boss: [['MEWTWO', 70, 1]] },
];
const trainersFor = b => Object.values(L.TR).filter(t => !t.dummy && !t.rematchOf && t.party?.length && t.maps?.some(m => b.tmaps.includes(m)) && !/LEADER|BOSS|RIVAL|CHAMPION|ELITE/.test(t.key));
function pool(b) { const p = []; for (const m of b.enc) for (const s of L.E[m]?.land || []) p.push(s); if (!p.length) for (const t of trainersFor(b)) for (const x of t.party) p.push({ species: x.species, min: x.level, max: x.level, rate: 10 }); return p; }
const lvl = (b, r, base) => Math.max(2, Math.round(base + b.lb[0] + (b.lb[1] - b.lb[0]) * r / Math.max(1, b.rooms - 1)));
const expFor = (sp, level, trainer, mul, boss) => Math.max(1, Math.round(Math.floor((L.S[sp].expYield || 50) * level / 7) * (trainer ? 1.5 : 1) * mul * (boss ? 2 : 1)));
const avg = (a, b) => (a + b) / 2;
// expected EXP from one wild enemy in biome b room r
function wildExp(b, r, mul) { const p = pool(b); const tot = p.reduce((s, x) => s + x.rate, 0); return p.reduce((s, x) => s + x.rate / tot * expFor(x.species, lvl(b, r, avg(x.min, x.max)), false, mul), 0); }
function wildLvl(b, r) { const p = pool(b); const tot = p.reduce((s, x) => s + x.rate, 0); return p.reduce((s, x) => s + x.rate / tot * lvl(b, r, avg(x.min, x.max)), 0); }
function trainerExp(b, r, mul, bonus) { const ts = trainersFor(b); let s = 0; for (const t of ts) { for (const x of t.party) s += expFor(x.species, Math.max(2, x.level + bonus + Math.round(b.lb[0] * 0.3)), true, mul); if (t.party.length < 3) s += (2 + Math.floor(r / 3)) * wildExp(b, r, mul) * 1.5; } return s / ts.length; }
const growth = sp => L.S[sp].growthRate;
function levelFromExp(sp, exp) { let l = 1; while (l < 100 && exp >= L.expForLevel(growth(sp), l + 1)) l++; return l; }

function simulate(starter, { mul = 1.25, candiesPerBiome = 0, startLevel = 5, shop = true, trainerRoom = true } = {}) {
  let exp = L.expForLevel(growth(starter), startLevel), out = [];
  for (const [bi, b] of BIOMES.entries()) {
    const enter = levelFromExp(starter, exp);
    const combatRooms = b.rooms - 1; // rooms 0..rooms-2 are combat, rooms-1 is the center, then the boss
    let kills = 0;
    for (let r = 0; r < combatRooms; r++) {
      const isShop = shop && r === 2 && bi < 4; // one shop per biome
      const isTrainer = (trainerRoom && r === 3 && !b.trainerOnly && b.tmaps.length) || (b.trainerOnly);
      if (isShop) continue;
      if (isTrainer && trainersFor(b).length) { exp += trainerExp(b, r, mul, b.trainerOnly ? 0 : 2) * (b.trainerOnly ? 0.6 : 1); if (b.trainerOnly) { const n = avg(...b.waves) * (avg(...b.per) + Math.floor(r / 3)); exp += 0.4 * n * wildExp(b, r, mul); kills += 0.4 * n + 0.6 * 3; } else kills += 3; continue; }
      const n = avg(...b.waves) * (avg(...b.per) + Math.floor(r / 3));
      kills += n; exp += n * wildExp(b, r, mul);
    }
    // rare candies (+2 levels each)
    for (let c = 0; c < candiesPerBiome; c++) { const l = levelFromExp(starter, exp); exp = Math.max(exp, L.expForLevel(growth(starter), l + 2)); }
    const preBoss = levelFromExp(starter, exp);
    for (const [sp, l] of b.boss) exp += expFor(sp, l, false, mul, true);
    if (b.adds) exp += b.adds[2] * expFor(b.adds[0], b.adds[1], b.adds[3], mul);
    out.push({ biome: b.key, enter, preBoss, after: levelFromExp(starter, exp), kills: Math.round(kills), wildLvlStart: wildLvl(b, 0).toFixed(1), wildLvlEnd: wildLvl(b, b.rooms - 2).toFixed(1), boss: b.boss.map(x => x[0] + x[1]).join('+') });
  }
  return out;
}
module.exports = { BIOMES, pool, lvl, wildLvl, simulate, trainersFor, levelFromExp };
if (require.main === module) {
  for (const sc of [{ label: 'base x1.25, no candy', o: {} }, { label: 'x1.25 + 1 candy/biome', o: { candiesPerBiome: 1 } }, { label: 'x1.25 + 2 candy/biome', o: { candiesPerBiome: 2 } }, { label: 'x1.25*1.45 (Lucky Egg r3) +1 candy', o: { mul: 1.25 * 1.45, candiesPerBiome: 1 } }, { label: 'x1.25*1.45*1.5 (LuckyEgg r3 + held LUCKY_EGG) +1 candy', o: { mul: 1.25 * 1.45 * 1.5, candiesPerBiome: 1, startLevel: 11 } }, { label: 'x1.0, no candy', o: { mul: 1.0 } }]) {
    console.log('\n== ' + sc.label);
    for (const st of ['CHARMANDER', 'PIKACHU', 'DRATINI']) { const r = simulate(st, sc.o); console.log(st.padEnd(11), r.map(x => `${x.biome}: in L${x.enter} preBoss L${x.preBoss} out L${x.after} (wild ${x.wildLvlStart}-${x.wildLvlEnd}, boss ${x.boss}, ~${x.kills} KOs)`).join('\n            ')); }
  }
}
