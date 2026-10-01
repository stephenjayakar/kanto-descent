const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '../../web/assets');
const S = path.join(__dirname, '../../web/src');
const J = f => JSON.parse(fs.readFileSync(path.join(A, f), 'utf8'));
const sp = J('data/species.json'), mv = J('data/moves.json'), tr = J('data/trainers.json'), en = J('data/encounters.json');
const pmd = J('pmd/index.json'), ba = J('gfx/battle_anims/manifest.json'), bank = J('sound/bank.json'), cands = J('maps/rooms_candidates.json');
const src = {}; for (const f of require('child_process').execSync(`find ${S} -name '*.js'`).toString().trim().split('\n')) src[f] = fs.readFileSync(f, 'utf8');
const all = Object.values(src).join('\n');
const out = [];
const bad = (...a) => out.push(a.join(' '));
// sounds
const songs = new Set(Object.keys(bank.songs));
for (const m of new Set(all.match(/'(se|mus)_[a-z0-9_]+'/g))) { const n = m.slice(1, -1); if (!songs.has(n)) bad('SOUND missing', n); }
// moves referenced: moves_rt P keys, bosses P('X'), starters
const mrt = src[Object.keys(src).find(f => f.endsWith('moves_rt.js'))];
for (const m of mrt.matchAll(/^\s+([A-Z_]+): \{ kind/gm)) if (!mv[m[1]]) bad('MOVE profile for missing move', m[1]);
const bos = src[Object.keys(src).find(f => f.endsWith('bosses.js'))];
for (const m of bos.matchAll(/P\('([A-Z_]+)'/g)) if (!mv[m[1]]) bad('MOVE in bosses missing (falls back to TACKLE type/power)', m[1]);
const content = src[Object.keys(src).find(f => f.endsWith('content.js'))];
for (const m of content.matchAll(/(attack|special|cast): '([A-Z_]+)'/g)) if (!mv[m[2]]) bad('STARTER move missing', m[2]);
// species referenced
for (const m of new Set([...content.matchAll(/'([A-Z][A-Z_]+)'/g)].map(x => x[1]))) if (!sp[m] && !/^(LAYOUT|MAP|FIRE|WATER|GRASS|ELECTRIC|ICE|PSYCHIC|GHOST|FIGHTING|GROUND|ROCK|FLYING|POISON|BUG|DRAGON|DARK|STEEL|NORMAL|BROCK|MISTY|MAROWAK|GIOVANNI|MEWTWO|BOULDER)/.test(m) && m.length > 3) bad('content.js ident not a species (check):', m);
for (const m of bos.matchAll(/species: '([A-Z_]+)'/g)) if (!sp[m[1]]) bad('BOSS species missing', m[1]);
// pmd coverage
const dexOf = k => sp[k]?.dex;
const need = new Map();
const addSp = (k, why) => { if (!sp[k]) return bad('species missing', k, why); if (!need.has(k)) need.set(k, why); };
// biomes (parse by eval of content.js BIOMES)
const BIOMES = eval(content.match(/export const BIOMES = (\[[\s\S]*?\n\]);/)[1]);
for (const B of BIOMES) {
  for (const m of B.encounters) { const land = en[m]?.land || []; if (!land.length) bad('ENCOUNTER table empty/missing', B.key, m); for (const s of land) addSp(s.species, 'enc ' + m); }
  const trs = Object.values(tr).filter(t => !t.dummy && !t.rematchOf && t.party?.length && t.maps?.some(m => B.trainerMaps.includes(m)) && !/LEADER|BOSS|RIVAL|CHAMPION|ELITE/.test(t.key));
  if (B.trainerMaps.length && !trs.length) bad('NO TRAINERS for biome', B.key);
  out.push(`info ${B.key}: ${trs.length} trainers, wild pool ${B.encounters.reduce((n, m) => n + (en[m]?.land || []).length, 0)}`);
  for (const t of trs) {
    if (!fs.existsSync(path.join(A, `gfx/trainers/${t.pic}.png`))) bad('TRAINER pic missing', t.key, t.pic);
    if (t.encounterSong && !songs.has(t.encounterSong.toLowerCase())) bad('TRAINER encounter song missing', t.key, t.encounterSong);
    for (const p of t.party) { addSp(p.species, 'trainer ' + t.key); for (const m of p.moves || []) if (!mv[m]) bad('TRAINER move missing', t.key, m); }
  }
  for (const [lay, idx] of B.pools) for (const i of idx) { if (!cands[lay]?.candidates?.[i]) bad('POOL crop missing', B.key, lay, i); if (!fs.existsSync(path.join(A, 'maps', lay, 'meta.json'))) bad('layout missing', lay); }
  if (!cands[B.bossRoom[0]]?.candidates?.[B.bossRoom[1]]) bad('BOSS room crop missing', B.key, B.bossRoom);
}
for (const L of ['LAYOUT_POKEMON_CENTER_1F', 'LAYOUT_MART', 'LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB']) { if (!fs.existsSync(path.join(A, 'maps', L, 'meta.json'))) bad('layout missing', L); if (!cands[L]?.candidates?.[0]) out.push('info no candidate 0 for ' + L + ' (falls back to full map)'); }
// starters + evolution lines
const STARTERS = ['CHARMANDER', 'BULBASAUR', 'SQUIRTLE', 'PIKACHU', 'EEVEE', 'GASTLY', 'DRATINI'];
const line = k => { const r = [k]; for (const e of sp[k]?.evolutions || []) r.push(...line(e.into)); return r; };
for (const s of STARTERS) for (const k of line(s)) addSp(k, 'starter line ' + s);
for (const k of ['RAICHU', 'GENGAR', 'VAPOREON', 'JOLTEON', 'FLAREON', 'ONIX', 'GEODUDE', 'STARMIE', 'STARYU', 'MAROWAK', 'GASTLY', 'RHYHORN', 'KANGASKHAN', 'NIDOQUEEN', 'MEWTWO']) addSp(k, 'boss/evo');
for (const [k, why] of need) { const d = dexOf(k); if (!pmd[d]) bad('PMD missing', k, d, why); else { if (!fs.existsSync(path.join(A, 'pmd', String(d), 'anim.json'))) bad('PMD anim.json missing', k, d); if (!fs.existsSync(path.join(A, 'pmd', String(d), 'portrait_Normal.png'))) bad('PMD portrait missing', k, d, why); } }
for (const d of [144, 145, 146, 151, 249, 250, 386, 150]) { if (!fs.existsSync(path.join(A, 'pmd', String(d), 'portrait_Normal.png'))) bad('legend portrait missing', d); if (!fs.existsSync(path.join(A, 'pmd', String(d), 'anim.json'))) bad('legend anim missing', d); }
// levels: learnset moves exist
for (const [k] of need) for (const [, m] of sp[k].learnset || []) if (!mv[m]) bad('learnset move missing', k, m);
// battle anim tags
const rnd = src[Object.keys(src).find(f => f.endsWith('render.js'))];
const tags = new Set([...rnd.matchAll(/tag: '([a-z0-9_]+)'/g)].map(m => m[1]));
for (const m of rnd.matchAll(/^const (CLOUD|SWIPE_FX) = \{([\s\S]*?)\};/gm)) for (const x of m[2].matchAll(/: '([a-z0-9_]+)'/g)) tags.add(x[1]);
for (const m of all.matchAll(/drawBA\([^,]+, *'([a-z0-9_]+)'/g)) tags.add(m[1]);
for (const m of rnd.matchAll(/'([a-z0-9_]+__\d+x\d+|[a-z_]+_\d)'/g)) tags.add(m[1]);
for (const t of tags) if (!ba[t]) bad('BA tag missing', t); else if (!fs.existsSync(path.join(A, 'gfx/battle_anims', ba[t].file))) bad('BA file missing', t);
// sprite keys used by moves_rt (sprite: 'x') must exist in render SPR
const spr = new Set([...rnd.matchAll(/^\s*([a-z_]+): \{ tag/gm)].map(m => m[1]).concat([...rnd.matchAll(/ ([a-z_]+): \{ tag/g)].map(m => m[1])));
for (const m of new Set([...all.matchAll(/sprite: '([a-z_]+)'/g)].map(m => m[1]))) if (!spr.has(m)) out.push('info sprite key not in SPR (maybe CLOUD): ' + m);
console.log([...new Set(out)].join('\n'));
