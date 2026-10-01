// Relative value of ATTACK-slot boons for a combo user, and %maxHP DOT/flinch effects vs bosses.
const L = require('./lib.cjs');
const RM = [1, 1.35, 1.7, 2];
function strikeVsScratch(pSp, pL, tSp, tL, power) { // Thunder Fang strike (special, ELECTRIC, 30 power) vs one Scratch hit
  const a = L.stats(pSp, pL, 20), d = L.stats(tSp, tL); const base = (P, A, D) => (((2 * pL) / 5 + 2) * P * A / D) / 50 + 2;
  const stab = L.S[pSp].types.includes('ELECTRIC') ? 1.5 : 1;
  return { tf: base(power, a.spa, d.spd) * stab * L.eff('ELECTRIC', L.S[tSp].types), sc: base(40, a.atk, d.def) * L.eff('NORMAL', L.S[tSp].types) };
}
const cases = [['CHARMELEON', 22, 'STARMIE', 21], ['CHARIZARD', 44, 'MEWTWO', 70], ['WARTORTLE', 22, 'STARMIE', 21], ['IVYSAUR', 22, 'STARMIE', 21]];
console.log('ATTACK boons, Scratch-like 3-combo (units 3.5 per combo of 3 hits), relative DPS gain:');
for (const [p, pl, t, tl] of cases) {
  for (const r of [0, 2]) {
    const { tf, sc } = strikeVsScratch(p, pl, t, tl, 30 * RM[r]);
    const tfGain = (3 * tf) / (3.5 * sc); // TF procs once per hit, not boosted by finisher
    console.log(`  ${p}${pl} vs ${t}${tl} [${['POKE', 'GREAT', 'ULTRA'][r]}]: Thunder Fang +${(tfGain * 100).toFixed(0)}% | Fire Fang +${(10 * RM[r]).toFixed(0)}% (+burn) | Sacred Fire +${(20 * RM[r]).toFixed(0)}% | Aero Edge +${(15 * RM[r]).toFixed(0)}% | Frost Fang +${(10 * RM[r]).toFixed(0)}% | Fake Out +${(12 * RM[r] * 1).toFixed(0)}% (crit chance x1 extra dmg)`);
  }
}
console.log('\nBurn DOT vs a boss (combat.js: 0.012*maxHp*(1+(stacks-1)*0.5)*0.35*power*burnMul per 0.5s):');
for (const [r, inf] of [[0, 0], [1, 0], [2, 0], [2, 2], [3, 3]]) {
  const burnMul = inf ? 1 + 0.6 * RM[inf] : 1; const perS = 0.012 * 3 * 0.35 * RM[r] * burnMul * 2;
  console.log(`  Fire Fang ${['POKE', 'GREAT', 'ULTRA', 'MASTER'][r]}${inf ? ' + Inferno ' + ['', '', 'ULTRA', 'MASTER'][inf] : ''}: ${(perS * 100).toFixed(1)}% boss maxHP/s -> kills any boss alone in ${(1 / perS).toFixed(0)}s (independent of bossHp scaling)`);
}
console.log('  Leech Seed vs boss: seed 1%/s + poison 0.016*0.35*2 = 1.1%/s -> ' + (1 / (0.01 + 0.0112)).toFixed(0) + 's solo, refreshed every 4s cast');
console.log('\nFlinch vs bosses (bosses are NOT flinch-immune): Bite (30% x0.8) at ~4.2 hits/s =', (4.2 * 0.24).toFixed(2), 'flinches/s; King\'s Rock 12% on Scratch at 5.9 hits/s =', (5.9 * 0.12).toFixed(2), '/s');
for (const rate of [0.5, 0.7, 1.0, 1.4]) console.log(`  flinch rate ${rate}/s: P(boss completes a 0.6s windup) = ${(Math.exp(-rate * 0.6) * 100).toFixed(0)}%`);
console.log('\nStat-stage stacking (cast cd vs 10-12s stage timer -> perpetual):');
console.log('  Swords Dance (+2/7s, timer 12s): +6 after 3 casts => Atk x' + ((2 + 6) / 2));
console.log('  Tail Whip/Leer on boss (-1/5s, timer 10s): -6 after 6 casts => player physical dmg x' + ((2 + 6) / 2) + ' (DEF x0.25)');
console.log('  Growl on boss: -6 => boss physical dmg x0.25;  Sand Attack -6 => boss misses ' + Math.round((1 - 0.33) * 100) + '% of hits');
console.log('  Double Team (Pikachu L15, +1 eva/6s): +6 => enemies miss 67%; + Mew Double Team 40% + BrightPowder 12% => total dodge ' + Math.round((1 - 0.33 * 0.6 * 0.88) * 100) + '%');
console.log('\nAgility (Mew dash) recharge: 0.55*(1-min(0.6,v)); v ULTRA L1=0.34 ->', (0.55 * (1 - 0.34)).toFixed(2), 's; cap 0.6 ->', (0.55 * 0.4).toFixed(2), 's vs dash i-frames 0.21s =>', Math.round(0.21 / (0.55 * 0.4) * 100) + '% invulnerable when chain-dashing');
