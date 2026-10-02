// Builds dist/: the static game for the private ChatGPT Site. Copies the code plus only the assets the game
// can use (pruned maps / PMD sprites / gfx), and writes config.js for the production Convex deployment.
// Usage: node tools/build_site.mjs   (prod URL from CONVEX_URL_PROD or the default below; prod access key
//        from .env.access.prod, which is gitignored)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web'), out = path.join(root, 'dist');
const PROD_URL = process.env.CONVEX_URL_PROD || 'https://enchanted-newt-545.convex.cloud';
const key = (fs.readFileSync(path.join(root, '.env.access.prod'), 'utf8').match(/^ACCESS_KEY=(.*)$/m) || [])[1]?.trim();
if (!key) { console.error('missing .env.access.prod'); process.exit(1); }
const J = f => JSON.parse(fs.readFileSync(path.join(web, 'assets', f), 'utf8'));

const { BIOMES, STARTERS, EEVEE_CHOICES, SPECIAL_EVOS } = await import(pathToFileURL(path.join(web, 'src/game/content.js')).href);
const species = J('data/species.json'), encounters = J('data/encounters.json'), trainers = J('data/trainers.json');

// ---- which POKéMON can ever be on screen
const keys = new Set(['ONIX', 'GEODUDE', 'STARMIE', 'STARYU', 'MAROWAK', 'GASTLY', 'RHYHORN', 'KANGASKHAN', 'NIDOQUEEN', 'MEWTWO']);
for (const b of BIOMES) {
  for (const m of b.encounters) for (const s of encounters[m]?.land || []) keys.add(s.species);
  for (const t of Object.values(trainers)) if (!t.dummy && t.maps?.some(m => b.trainerMaps.includes(m))) for (const p of t.party || []) keys.add(p.species);
}
for (const s of STARTERS) keys.add(s.species);
for (const s of EEVEE_CHOICES) keys.add(s);
for (const [, [, into]] of Object.entries(SPECIAL_EVOS)) keys.add(into);
// whole evolution lines (partners and the player evolve)
let grew = true;
while (grew) { grew = false; for (const k of [...keys]) for (const e of species[k]?.evolutions || []) if (!keys.has(e.into)) { keys.add(e.into); grew = true; } }
const dexes = new Set([...keys].map(k => species[k]?.dex).filter(Boolean));
for (const d of [144, 145, 146, 151, 249, 250, 386, 150]) dexes.add(d); // legendary boons, Deoxys, Mewtwo

// ---- which map layouts
const layouts = new Set(['LAYOUT_POKEMON_CENTER_1F', 'LAYOUT_MART', 'LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB']);
for (const b of BIOMES) { for (const [l] of b.pools) layouts.add(l); layouts.add(b.bossRoom[0]); }

// ---- copy
const sep = '[\\\\/]';
const DEV = new RegExp(`${sep}dev($|${sep})`), FRONTBACK = new RegExp(`${sep}pokemon${sep}[^\\\\/]+${sep}(front|back)`);
fs.rmSync(out, { recursive: true, force: true });
const copy = (rel, filter) => fs.cpSync(path.join(web, rel), path.join(out, rel), { recursive: true, dereference: true, filter });
copy('index.html'); copy('package.json'); copy('src', s => !DEV.test(s));
copy('assets/data'); copy('assets/sound');
copy('assets/gfx', s => !FRONTBACK.test(s));
for (const f of ['index.json', 'rooms_candidates.json']) copy('assets/maps/' + f);
for (const l of layouts) copy('assets/maps/' + l);
copy('assets/pmd/index.json');
for (const d of dexes) if (fs.existsSync(path.join(web, 'assets/pmd', String(d)))) copy('assets/pmd/' + d);
fs.writeFileSync(path.join(out, 'config.js'), `// production config (private site only)\nexport const CONVEX_URL = ${JSON.stringify(PROD_URL)};\nexport const ACCESS_KEY = ${JSON.stringify(key)};\nexport const DEFAULT_EMAIL = 'aj12ay@gmail.com';\n`);

const size = d => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
const count = d => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`dist: ${(size(out) / 1e6).toFixed(1)} MB, ${count(out)} files  (${dexes.size} PMD species, ${layouts.size} map layouts)`);
