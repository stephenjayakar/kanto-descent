// Renders a dense battle track with the authentic GBA mixer and with HQ audio and compares them:
// treble energy above 7 kHz (the "crunch"), hard clips, and 8-bit wraps (big sample-to-sample jumps).
// Usage: node tests/audio_hq_check.mjs [song=mus_vs_champion] [seconds=20]
import fs from 'node:fs';
import { createEngine } from '../web/src/audio/m4a-core.js';

const song = process.argv[2] || 'mus_vs_champion', secs = +(process.argv[3] || 20), SR = 48000;
const meta = JSON.parse(fs.readFileSync('web/assets/sound/bank.json', 'utf8'));
const bank = fs.readFileSync('web/assets/sound/bank.bin');
function render(hq) {
  const e = createEngine(new Uint8Array(bank), meta, { sampleRate: SR, hq });
  e.startSong(0, meta.songs[song].header);
  const n = SR * secs, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i += 1024) e.process(L.subarray(i), R.subarray(i), Math.min(1024, n - i));
  return { L, clips: e.peakClip, e };
}
function stats(x) {
  let hp = 0, all = 0, jumps = 0, peak = 0, prev = 0, y1 = 0;
  // crude high-pass (difference of a 3.3 kHz-ish one-pole low-pass) to estimate treble energy
  for (let i = 0; i < x.length; i++) {
    const v = x[i]; all += v * v; peak = Math.max(peak, Math.abs(v));
    y1 += 0.35 * (v - y1); const h = v - y1; hp += h * h;
    if (Math.abs(v - prev) > 0.5) jumps++; prev = v;
  }
  return { rms: Math.sqrt(all / x.length).toFixed(4), trebleShare: (hp / Math.max(1e-9, all)).toFixed(4), bigJumps: jumps, peak: peak.toFixed(3) };
}
const a = render(false), h = render(true);
console.log(song, secs + 's');
console.log('authentic GBA', JSON.stringify({ ...stats(a.L), hardClips: a.clips, voices: a.e.maxChans }));
console.log('HQ          ', JSON.stringify({ ...stats(h.L), hardClips: h.clips, voices: h.e.maxChans }));
// write both as 16-bit WAVs to listen to side by side
function wav(path, x) {
  const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path, b);
}
fs.mkdirSync('tests/out/audio', { recursive: true });
wav(`tests/out/audio/${song}_gba.wav`, a.L); wav(`tests/out/audio/${song}_hq.wav`, h.L);
console.log('wrote tests/out/audio/' + song + '_{gba,hq}.wav');
