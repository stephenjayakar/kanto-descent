// Reproduces the hosted build locally: serves dist/ and answers Convex calls (auth, manifest, /pack) with mocks,
// so the asset-pack code path runs in headless Chrome without Google sign-in.
// Usage: node tools/build_site.mjs && node tests/packs_repro.mjs [out.png] [extra js to eval after boot]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { chromium, firefox } from 'playwright';
import { listAssets, assetsDir, root } from '../tools/asset_list.mjs';

const out = process.argv[2] || path.join(root, 'tests/out/packs_repro.png');
const extra = process.argv[3] || '';

// one pack per top-level folder (same KSP1 format as tools/upload_packs.mjs)
const { files } = await listAssets();
const groups = {};
for (const rel of files.sort()) (groups[rel.split('/')[0]] ||= []).push(rel);
const packs = Object.entries(groups).map(([name, list]) => {
  const hdr = {}, bufs = [];
  let off = 0;
  for (const rel of list) { const b = fs.readFileSync(path.join(assetsDir, rel)); hdr[rel] = [off, b.length]; bufs.push(b); off += b.length; }
  const header = Buffer.from(JSON.stringify({ files: hdr }));
  const head = Buffer.alloc(8); head.write('KSP1', 0, 'latin1'); head.writeUInt32LE(header.length, 4);
  const data = Buffer.concat([head, header, ...bufs]);
  return { name, data, hash: crypto.createHash('sha256').update(data).digest('hex'), size: data.length };
});

const dist = path.join(root, 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(dist, p), (err, d) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(8095);

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 86400 })}.x`;
const me = { email: 'tester@example.com', allowed: true, canInvite: true, admin: true, name: 'TESTER' };
const browser = process.env.FF ? await firefox.launch({ headless: true, firefoxUserPrefs: process.env.RFP ? { 'privacy.resistFingerprinting': true, 'privacy.fingerprintingProtection': true, 'privacy.fingerprintingProtection.overrides': '+AllTargets' } : {} }) : await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.route(/convex\.(cloud|site)/, async route => {
  const u = new URL(route.request().url());
  if (u.pathname === '/pack') { const p = packs.find(x => x.name === u.searchParams.get('name')); return route.fulfill({ status: 200, body: p.data, headers: { 'access-control-allow-origin': '*' } }); }
  const body = JSON.parse(route.request().postData() || '{}');
  const value = { 'game:me': me, 'packs:manifest': packs.map(({ name, hash, size }) => ({ name, hash, size })), 'game:load': { email: me.email, meta: null, save: null, runs: [] } }[body.path] ?? null;
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 'success', value }) });
});
await page.addInitScript(t => localStorage.setItem('kanto-descent.auth.v1', JSON.stringify({ token: t, refreshToken: 'r' })), jwt);
await page.goto(process.env.URL || 'http://127.0.0.1:8095/');
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 }).catch(() => logs.push('[repro] never ready'));
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
if (extra) logs.push('[eval] ' + JSON.stringify(await page.evaluate(extra).catch(e => String(e))));
await page.screenshot({ path: out });
console.log(logs.filter(l => !/AudioWorklet|ScriptProcessor/.test(l)).join('\n'));
await browser.close(); server.close();
