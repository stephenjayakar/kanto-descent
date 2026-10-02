// Packs the game's (pruned) assets into a few files and uploads the changed ones to Convex file storage,
// where GET /pack serves them to allowlisted accounts only. The public static site has no assets.
// Usage: node tools/upload_packs.mjs [--prod] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { listAssets, assetsDir, root } from './asset_list.mjs';

const prod = process.argv.includes('--prod'), dry = process.argv.includes('--dry');
const MAX = 12 * 1024 * 1024; // keep each pack well under the 20 MB HTTP action response limit

// group: data / sound / gfx / maps / pmd, then split big groups into numbered chunks
const groupOf = rel => rel.split('/')[0];
function build(files) {
  const groups = {};
  for (const rel of files.sort()) (groups[groupOf(rel)] ||= []).push(rel);
  const packs = [];
  for (const [g, list] of Object.entries(groups)) {
    let chunk = [], size = 0, n = 0;
    const flush = () => { if (chunk.length) packs.push({ name: `${g}${n ? '-' + n : ''}`, list: chunk }); chunk = []; size = 0; n++; };
    for (const rel of list) {
      const s = fs.statSync(path.join(assetsDir, rel)).size;
      if (size + s > MAX && chunk.length) flush();
      chunk.push(rel); size += s;
    }
    flush();
  }
  // "KSP1", u32 LE header length, JSON header {files: {path: [offset, length]}}, then the bytes
  return packs.map(({ name, list }) => {
    const filesHdr = {}, bufs = [];
    let off = 0;
    for (const rel of list) { const b = fs.readFileSync(path.join(assetsDir, rel)); filesHdr[rel] = [off, b.length]; bufs.push(b); off += b.length; }
    const header = Buffer.from(JSON.stringify({ files: filesHdr }));
    const head = Buffer.alloc(8); head.write('KSP1', 0, 'latin1'); head.writeUInt32LE(header.length, 4);
    const data = Buffer.concat([head, header, ...bufs]);
    return { name, data, hash: crypto.createHash('sha256').update(data).digest('hex'), count: list.length };
  });
}

function convex(fn, args) {
  const cli = path.join(root, 'node_modules', 'convex', 'bin', 'main.js');
  const out = execFileSync(process.execPath, [cli, 'run', fn, JSON.stringify(args || {}), ...(prod ? ['--prod'] : [])], { cwd: root, encoding: 'utf8' });
  const t = out.trim();
  return t ? JSON.parse(t.slice(t.search(/[[{"0-9]/))) : null;
}

const { files } = await listAssets();
const packs = build(files);
for (const p of packs) console.log(`${p.name.padEnd(10)} ${String(p.count).padStart(5)} files ${(p.data.length / 1048576).toFixed(2)} MB ${p.hash.slice(0, 12)}`);
if (!dry) {
  const current = Object.fromEntries((convex('packs:list') || []).map(p => [p.name, p.hash]));
  for (const p of packs) {
    if (current[p.name] === p.hash) { console.log(`${p.name}: unchanged`); continue; }
    const url = convex('packs:uploadUrl');
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: p.data });
    if (!res.ok) throw new Error(`upload ${p.name}: HTTP ${res.status} ${await res.text()}`);
    const { storageId } = await res.json();
    convex('packs:record', { name: p.name, storageId, hash: p.hash, size: p.data.length });
    console.log(`${p.name}: uploaded`);
  }
  const removed = convex('packs:prune', { keep: packs.map(p => p.name) });
  if (removed) console.log(`pruned ${removed} old pack(s)`);
  console.log(`done (${prod ? 'prod' : 'dev'})`);
}
