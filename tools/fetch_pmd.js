#!/usr/bin/env node
// Fetch PMDCollab SpriteCollab sprites + portraits for a list of national dex numbers.
//   node tools/fetch_pmd.js            -> default list (Kanto 1-151 + selected extras)
//   node tools/fetch_pmd.js 1 4 7      -> just these
//   flags: --force (re-download everything)
// Output: web/assets/pmd/<dex>/{anim.json, <Anim>-Anim.png, portrait_<Emotion>.png, credits.txt}
//         web/assets/pmd/index.json
// Source: https://github.com/PMDCollab/SpriteCollab pinned at the commit used by
// GBurgardt/pokemon-emerald-arena; falls back to master on 404.
// License of the art: CC BY-NC 4.0 (non-commercial, credit required) -- see credits.txt per species.
'use strict';
const fs = require('fs'), path = require('path');

const PIN = 'd25607ff4746957df10bdb78db090887cd94f1f8';
const RAW = ref => `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${ref}/`;
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', 'pmd');
const CACHE = path.join(__dirname, '.pmd_cache');
const CONCURRENCY = 8;
const FORCE = process.argv.includes('--force');

const KEEP_ANIMS = ['Idle', 'Walk', 'Attack', 'Hurt', 'Sleep', 'Shoot', 'Strike', 'Charge', 'Swing', 'Double',
  'Hop', 'Rotate', 'Pose', 'Faint', 'Special', 'Shock', 'Kick', 'Dance', 'Tumble', 'Withdraw'];
const EMOTIONS = ['Normal', 'Happy', 'Angry', 'Determined', 'Pain', 'Surprised', 'Inspired', 'Joyous'];
// Row order of 8-direction sheets (verified visually with tools/pmd_verify.py).
const DIRECTIONS = ['Down', 'DownRight', 'Right', 'UpRight', 'Up', 'UpLeft', 'Left', 'DownLeft'];

const DEFAULT_DEX = [...Array(151)].map((_, i) => i + 1).concat(
  [243, 244, 245, 249, 250, 386, 172, 196, 197, 169, 208, 212, 230, 233, 242, 198, 200, 227, 248, 246, 247]);

// ---------------------------------------------------------------- net helpers
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bytesDown = 0, filesDown = 0, filesSkipped = 0, pinMisses = [];

// GET a repo-relative path. Returns Buffer, or null if 404 at both pin and master.
async function getRaw(rel, { tries = 4 } = {}) {
  for (const ref of [PIN, 'master']) {
    for (let a = 0; a < tries; a++) {
      try {
        const res = await fetch(RAW(ref) + rel);
        if (res.status === 404) break; // try next ref
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        bytesDown += buf.length; filesDown++;
        if (ref !== PIN) pinMisses.push(rel);
        return buf;
      } catch (e) {
        if (a === tries - 1) throw new Error(`${rel}: ${e.message}`);
        await sleep(500 * 2 ** a);
      }
    }
  }
  return null;
}

// Download rel -> dest unless dest exists. Returns true if file present afterwards.
async function fetchTo(rel, dest) {
  if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 0) { filesSkipped++; return true; }
  const buf = await getRaw(rel);
  if (!buf) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + '.tmp', buf);
  fs.renameSync(dest + '.tmp', dest);
  return true;
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all([...Array(Math.min(n, items.length))].map(async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png: ' + file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ---------------------------------------------------------------- AnimData.xml
function parseAnimData(xml) {
  const num = (s, tag) => { const m = s.match(new RegExp(`<${tag}>\\s*(-?\\d+)\\s*</${tag}>`)); return m ? +m[1] : undefined; };
  const str = (s, tag) => { const m = s.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`)); return m ? m[1] : undefined; };
  const shadowSize = num(xml, 'ShadowSize');
  const anims = {};
  for (const m of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const s = m[1];
    const name = str(s, 'Name');
    const a = { index: num(s, 'Index') };
    const copyOf = str(s, 'CopyOf');
    if (copyOf) a.copyOf = copyOf;
    else {
      a.frameW = num(s, 'FrameWidth'); a.frameH = num(s, 'FrameHeight');
      a.durations = [...s.matchAll(/<Duration>\s*(\d+)\s*<\/Duration>/g)].map(d => +d[1]);
      a.rushFrame = num(s, 'RushFrame'); a.hitFrame = num(s, 'HitFrame'); a.returnFrame = num(s, 'ReturnFrame');
    }
    anims[name] = a;
  }
  return { shadowSize, anims };
}

// ---------------------------------------------------------------- shared metadata
async function cached(rel) {
  const f = path.join(CACHE, rel);
  if (!fs.existsSync(f)) {
    console.log('downloading', rel, '...');
    const buf = await getRaw(rel);
    if (!buf) throw new Error('missing ' + rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
  }
  return fs.readFileSync(f, 'utf8');
}

let TRACKER = {}, CREDIT_NAMES = {};
async function loadMeta() {
  try { TRACKER = JSON.parse(await cached('tracker.json')); } catch (e) { console.warn('tracker.json unavailable:', e.message); }
  try {
    for (const line of (await cached('credit_names.txt')).split(/\r?\n/).slice(1)) {
      const [id, discord, contact] = line.split('\t');
      if (id) CREDIT_NAMES[id] = { discord, contact };
    }
  } catch (e) { console.warn('credit_names.txt unavailable:', e.message); }
}

function creditLines(txt) {
  // credits.txt rows: date \t creditId \t status \t license \t anims/emotions
  return txt.split(/\r?\n/).filter(Boolean).map(l => {
    const [date, id, , , parts] = l.split('\t');
    const n = CREDIT_NAMES[id];
    const who = n && n.contact && n.contact !== id ? `${id} (${n.contact})` : id;
    return `  ${(date || '').slice(0, 10)}  ${who}: ${parts || ''}`;
  });
}

// ---------------------------------------------------------------- per species
async function doSpecies(dex) {
  const id = String(dex).padStart(4, '0');
  const dir = path.join(OUT, String(dex));
  const tr = TRACKER[id] || {};
  const result = { dex, name: tr.name || null, missing: false, missingAnims: [], aliases: {} };

  // --- sprite
  const rawXml = path.join(CACHE, 'sprite', id, 'AnimData.xml');
  const haveXml = await fetchTo(`sprite/${id}/AnimData.xml`, rawXml);
  const animJson = { dex, name: tr.name || null, shadowSize: null, directions: DIRECTIONS, anims: {} };
  if (!haveXml) {
    result.missing = true;
  } else {
    const ad = parseAnimData(fs.readFileSync(rawXml, 'utf8'));
    animJson.shadowSize = ad.shadowSize;
    const wanted = KEEP_ANIMS.filter(n => ad.anims[n]);
    result.missingAnims = KEEP_ANIMS.filter(n => !ad.anims[n] && ['Idle', 'Walk', 'Attack', 'Hurt'].includes(n));
    // which sheets do we need (resolve CopyOf, no chaining per spec but follow defensively)
    const resolve = n => { let s = n, g = 0; while (ad.anims[s] && ad.anims[s].copyOf && g++ < 8) s = ad.anims[s].copyOf; return s; };
    const sheets = [...new Set(wanted.map(resolve))].filter(s => ad.anims[s]);
    const okSheets = new Set();
    await pool(sheets, 4, async s => {
      if (await fetchTo(`sprite/${id}/${s}-Anim.png`, path.join(dir, `${s}-Anim.png`))) okSheets.add(s);
    });
    for (const n of wanted) {
      const src = resolve(n), a = ad.anims[src];
      if (!okSheets.has(src)) { result.missingAnims.push(n + '(png)'); continue; }
      const { w, h } = pngSize(path.join(dir, `${src}-Anim.png`));
      const frames = Math.round(w / a.frameW), rows = Math.round(h / a.frameH);
      const last = a.durations.length - 1;
      const ret = a.returnFrame ?? last;
      const e = {
        file: `${src}-Anim.png`,
        frameW: a.frameW, frameH: a.frameH,
        frames, rows,                     // rows: 8 (one per direction) or 1 (direction-less)
        durations: a.durations,           // ticks @ 60 fps, one per frame column
        rushFrame: a.rushFrame ?? 0,      // 0-based frame indices; defaults per SpriteCollab guide
        hitFrame: a.hitFrame ?? ret,
        returnFrame: ret,
      };
      if (src !== n) { e.copyOf = src; result.aliases[n] = src; }
      if (frames !== a.durations.length) console.warn(`  ! ${dex} ${n}: ${frames} columns but ${a.durations.length} durations`);
      if (rows !== 1 && rows !== 8) console.warn(`  ! ${dex} ${n}: ${rows} rows`);
      animJson.anims[n] = e;
    }
  }

  // --- portraits
  const portraits = [];
  const known = tr.portrait_files ? Object.keys(tr.portrait_files) : null; // keys present = file exists
  const emos = known ? EMOTIONS.filter(e => known.includes(e)) : EMOTIONS;
  await pool(emos, 4, async e => {
    if (await fetchTo(`portrait/${id}/${e}.png`, path.join(dir, `portrait_${e}.png`))) portraits.push(e);
  });
  portraits.sort((a, b) => EMOTIONS.indexOf(a) - EMOTIONS.indexOf(b));
  result.portraits = portraits;

  if (result.missing && !portraits.length) return result;
  fs.mkdirSync(dir, { recursive: true });
  if (!result.missing) fs.writeFileSync(path.join(dir, 'anim.json'), JSON.stringify(animJson, null, 1));

  // --- credits
  const credDest = path.join(dir, 'credits.txt');
  if (FORCE || !fs.existsSync(credDest)) {
    const sc = !result.missing ? await getRaw(`sprite/${id}/credits.txt`) : null;
    const pc = portraits.length ? await getRaw(`portrait/${id}/credits.txt`) : null;
    const lines = [
      `${tr.name || 'Species'} (#${dex}) -- PMDCollab SpriteCollab, https://github.com/PMDCollab/SpriteCollab (commit ${PIN})`,
      `License: CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/) -- non-commercial use, credit required.`,
      `Browse: https://sprites.pmdcollab.org/#/${id}`,
      '',
      `Sprite credits${tr.sprite_credit ? ` (primary: ${tr.sprite_credit.primary}${tr.sprite_credit.secondary?.length ? '; also ' + tr.sprite_credit.secondary.join(', ') : ''})` : ''}:`,
      ...(sc ? creditLines(sc.toString('utf8')) : ['  (none)']),
      '',
      `Portrait credits${tr.portrait_credit ? ` (primary: ${tr.portrait_credit.primary}${tr.portrait_credit.secondary?.length ? '; also ' + tr.portrait_credit.secondary.join(', ') : ''})` : ''}:`,
      ...(pc ? creditLines(pc.toString('utf8')) : ['  (none)']),
      '',
    ];
    fs.writeFileSync(credDest, lines.join('\n'));
  }

  result.anims = Object.keys(animJson.anims);
  result.frameSizes = Object.fromEntries(Object.entries(animJson.anims).map(([n, a]) => [n, [a.frameW, a.frameH]]));
  return result;
}

// ---------------------------------------------------------------- main
(async () => {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--')).map(Number).filter(n => n > 0);
  const list = args.length ? args : DEFAULT_DEX;
  fs.mkdirSync(OUT, { recursive: true });
  await loadMeta();
  const t0 = Date.now();
  let done = 0;
  const results = await pool(list, CONCURRENCY, async dex => {
    try {
      const r = await doSpecies(dex);
      done++;
      process.stdout.write(`\r[${done}/${list.length}] #${dex} ${r.name || ''}${r.missing ? ' (NO SPRITE)' : ''}            `);
      return r;
    } catch (e) {
      console.error(`\n#${dex} failed: ${e.message}`);
      return { dex, error: e.message };
    }
  });
  console.log();

  // merge into index.json (keep entries for dex not in this run)
  const idxFile = path.join(OUT, 'index.json');
  let index = {};
  try { index = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch {}
  for (const r of results) {
    if (r.error) continue;
    if (r.missing) { index[r.dex] = { name: r.name, missing: true, portraits: r.portraits }; continue; }
    index[r.dex] = { name: r.name, anims: r.anims, portraits: r.portraits, frameSizes: r.frameSizes };
    if (Object.keys(r.aliases).length) index[r.dex].aliases = r.aliases;
  }
  const sorted = Object.fromEntries(Object.keys(index).sort((a, b) => a - b).map(k => [k, index[k]]));
  fs.writeFileSync(idxFile, JSON.stringify(sorted, null, 1));

  const missing = results.filter(r => r.missing).map(r => r.dex);
  const errors = results.filter(r => r.error).map(r => r.dex);
  const noCore = results.filter(r => r.missingAnims && r.missingAnims.length).map(r => `${r.dex}:${r.missingAnims.join('/')}`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s: downloaded ${filesDown} files (${(bytesDown / 1048576).toFixed(1)} MB), skipped ${filesSkipped} existing`);
  if (pinMisses.length) console.log(`fetched from master (404 at pin): ${pinMisses.join(', ')}`);
  console.log(`missing species: ${missing.length ? missing.join(' ') : 'none'}`);
  console.log(`missing core anims: ${noCore.length ? noCore.join(' ') : 'none'}`);
  if (errors.length) { console.log(`errors (re-run to retry): ${errors.join(' ')}`); process.exitCode = 1; }
})();
