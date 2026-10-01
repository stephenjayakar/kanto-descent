// Monte Carlo of rollDoors (run.js) for a boon-greedy player: boon offers and boons gained per biome.
const rooms = [6, 7, 7, 7, 3]; const N = 20000; const LEG = 6;
let tot = [0, 0, 0, 0, 0], offered = 0, rollsN = 0, candyOff = 0;
const pickW = (pool) => { const s = pool.reduce((a, x) => a + x.w, 0); let r = Math.random() * s; for (const x of pool) { r -= x.w; if (r <= 0) return x; } return pool[pool.length - 1]; };
for (let it = 0; it < N; it++) {
  let boons = 0, depth = 0;
  rooms.forEach((R, bi) => {
    boons++; tot[bi]++; // first room of a biome is always a boon
    let shop = false, trainer = false;
    for (let room = 0; room < R - 2; room++) { // doors after rooms 0..R-3 lead to normal rooms
      depth++; const next = room + 1; const n = Math.random() < 0.25 ? 3 : 2; const pool = [];
      for (let l = 0; l < LEG; l++) pool.push({ k: 'boon' + l, w: boons < 2 ? 3 : 1.6 });
      pool.push({ k: 'rare_candy', w: 2.2 }, { k: 'hp_up', w: 1.4 }, { k: 'money', w: 1.5 }, { k: 'tm', w: 1.3 }, { k: 'stardust', w: 1.4 }, { k: 'pp_up', w: 1.4 });
      if (!shop && next >= 2) pool.push({ k: 'shop', w: 2.4 }); if (!trainer && next >= 2 && bi !== 3) pool.push({ k: 'trainer', w: 1.6 });
      if (depth > 3 && Math.random() < 0.25) pool.push({ k: 'chaos', w: 1.2 });
      const out = []; for (let i = 0; i < n; i++) { const p = pickW(pool); out.push(p.k); pool.splice(pool.indexOf(p), 1); }
      rollsN++; if (out.some(k => k.startsWith('boon'))) { offered++; boons++; tot[bi]++; } if (out.includes('rare_candy')) candyOff++;
    }
  });
}
console.log('P(a boon door is offered) =', (offered / rollsN).toFixed(2), '; P(rare candy offered) =', (candyOff / rollsN).toFixed(2));
console.log('boons per biome if always taken:', tot.map(x => (x / N).toFixed(1)).join(' / '), ' total', (tot.reduce((a, b) => a + b) / N).toFixed(1));
