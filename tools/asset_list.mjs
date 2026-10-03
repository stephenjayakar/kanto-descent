// The assets the game can actually use (pruned maps / PMD sprites / gfx), as paths relative to web/assets.
// Shared by tools/upload_packs.mjs (hosted build: assets live in Convex) and tools/build_site.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const assetsDir = path.join(root, 'web', 'assets');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
}

export async function listAssets() {
  const J = f => JSON.parse(fs.readFileSync(path.join(assetsDir, f), 'utf8'));
  const { BIOMES, STARTERS, EEVEE_CHOICES, SPECIAL_EVOS } = await import(pathToFileURL(path.join(root, 'web/src/game/content.js')).href);
  const species = J('data/species.json'), encounters = J('data/encounters.json'), trainers = J('data/trainers.json');

  // which POKéMON can ever be on screen
  const keys = new Set(['ONIX', 'GEODUDE', 'STARMIE', 'STARYU', 'MAROWAK', 'GASTLY', 'RHYHORN', 'KANGASKHAN', 'NIDOQUEEN', 'MEWTWO', 'RAICHU', 'VOLTORB', 'LAPRAS', 'DEWGONG']);
  for (const b of BIOMES) {
    for (const m of b.encounters) for (const s of encounters[m]?.land || []) keys.add(s.species);
    for (const t of Object.values(trainers)) if (!t.dummy && t.maps?.some(m => b.trainerMaps.includes(m))) for (const p of t.party || []) keys.add(p.species);
  }
  for (const s of STARTERS) keys.add(s.species);
  for (const s of EEVEE_CHOICES) keys.add(s);
  for (const [, [, into]] of Object.entries(SPECIAL_EVOS)) keys.add(into);
  let grew = true;
  while (grew) { grew = false; for (const k of [...keys]) for (const e of species[k]?.evolutions || []) if (!keys.has(e.into)) { keys.add(e.into); grew = true; } }
  const dexes = new Set([...keys].map(k => species[k]?.dex).filter(Boolean));
  for (const d of [144, 145, 146, 151, 249, 250, 386, 150]) dexes.add(d); // legendary boons, Deoxys, Mewtwo

  // which map layouts
  const layouts = new Set(['LAYOUT_POKEMON_CENTER_1F', 'LAYOUT_MART', 'LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB']);
  for (const b of BIOMES) { for (const [l] of b.pools) layouts.add(l); layouts.add(b.bossRoom[0]); }

  const files = [];
  const add = dir => { for (const f of walk(path.join(assetsDir, dir))) files.push(path.relative(assetsDir, f).split(path.sep).join('/')); };
  add('data'); add('sound'); add('gfx');
  for (const f of ['maps/index.json', 'maps/rooms_candidates.json', 'pmd/index.json']) files.push(f);
  for (const l of layouts) add('maps/' + l);
  for (const d of dexes) add('pmd/' + d);
  // pokemon front/back battle sprites are never drawn (the game uses PMD sprites + menu icons)
  return { files: files.filter(f => !/^gfx\/pokemon\/[^/]+\/(front|back)/.test(f)), dexes, layouts };
}
