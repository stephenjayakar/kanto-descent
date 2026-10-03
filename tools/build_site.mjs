// Builds dist/: the static game for the public ChatGPT Site. CODE ONLY: the extracted game assets are
// never on the static site; after Google sign-in the game downloads them from Convex (tools/upload_packs.mjs).
// Usage: node tools/build_site.mjs  (prod Convex URL from CONVEX_URL_PROD or the default below)
import fs from 'node:fs';
import path from 'node:path';
import { root } from './asset_list.mjs';

// OUT=dist-staging CONVEX_URL_PROD=<dev url> builds the staging site (co-op beta) instead
const web = path.join(root, 'web'), out = path.join(root, process.env.OUT || 'dist');
const PROD_URL = process.env.CONVEX_URL_PROD || 'https://enchanted-newt-545.convex.cloud';
const sep = '[\\\\/]';
const DEV = new RegExp(`${sep}dev($|${sep})`);

fs.rmSync(out, { recursive: true, force: true });
const copy = (rel, filter) => fs.cpSync(path.join(web, rel), path.join(out, rel), { recursive: true, dereference: true, filter });
copy('index.html'); copy('package.json'); copy('src', s => !DEV.test(s));
fs.writeFileSync(path.join(out, 'config.js'), `// production config\nexport const CONVEX_URL = ${JSON.stringify(PROD_URL)};\nexport const PACKS = true;\n`);

// refuse to ship anything that looks like a game asset
const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f, acc); else acc.push(f); } return acc; };
const files = walk(out);
const bad = files.filter(f => /\.(png|wav|bin|gba)$/i.test(f) || /[\\/]assets[\\/]/.test(f));
if (bad.length) { console.error('dist must not contain assets:', bad.slice(0, 5)); process.exit(1); }
console.log(`dist: ${files.length} files, ${(files.reduce((s, f) => s + fs.statSync(f).size, 0) / 1e3).toFixed(0)} KB (code only)`);
