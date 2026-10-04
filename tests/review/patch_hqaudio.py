def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:80]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

C = 'web/src/audio/m4a-core.js'
rep(C, [
    ("// * Output: DirectSound ring played one frame late (like the DMA), upsampled from 13379 Hz",
     "// * HQ mode (opts.hq, Kanto Descent's default): the same driver, but mixed at full precision (no 8-bit wrap),\n//   12 DirectSound voices instead of 5, linear upsampling, soft-limited peaks and a 6.5 kHz low-pass that\n//   removes the zero-order-hold images the GBA speaker used to hide. hq=false is the authentic sound.\n// * Output: DirectSound ring played one frame late (like the DMA), upsampled from 13379 Hz"),
    ("    this.interpolation = opts.interpolation || 'hold';\n    this.masterGain = opts.masterGain ?? 1;",
     "    this.interpolation = opts.interpolation || 'hold';\n    this.masterGain = opts.masterGain ?? 1;\n    this.hq = !!opts.hq;"),
    ("""    // PCM DMA ring: 7 blocks of 224 samples; A = right (FIFO A), B = left (FIFO B)
    this.pcmA = new Int8Array(PCM_DMA_PERIOD * PCM_SAMPLES_PER_FRAME);
    this.pcmB = new Int8Array(PCM_DMA_PERIOD * PCM_SAMPLES_PER_FRAME);""",
     """    // PCM DMA ring: 7 blocks of 224 samples; A = right (FIFO A), B = left (FIFO B).
    // Authentic: signed 8-bit, so loud mixes wrap like the real FIFO. HQ: float, no wrap.
    this.allocRing();"""),
    ("    this.peakClip = 0;\n  }", """    this.peakClip = 0;
    this.lpL = { x1: 0, x2: 0, y1: 0, y2: 0 }; this.lpR = { x1: 0, x2: 0, y1: 0, y2: 0 };
    this.setHQ(this.hq);
  }

  allocRing() {
    const n = PCM_DMA_PERIOD * PCM_SAMPLES_PER_FRAME;
    this.pcmA = this.hq ? new Float32Array(n) : new Int8Array(n);
    this.pcmB = this.hq ? new Float32Array(n) : new Int8Array(n);
  }
  /** Switch between the authentic GBA mixer and HQ (see the header). */
  setHQ(on) {
    on = !!on;
    const changed = on !== (this.pcmA instanceof Float32Array);
    this.hq = on;
    if (changed) this.allocRing();
    this.maxChans = on ? 12 : 5;
    if (on) this.interpolation = 'linear';
    // 2-pole Butterworth low-pass at 6.5 kHz (RBJ biquad) for HQ output
    const f0 = Math.min(6500, this.sampleRate * 0.45), w0 = 2 * Math.PI * f0 / this.sampleRate, al = Math.sin(w0) / (2 * Math.SQRT1_2), cs = Math.cos(w0), a0 = 1 + al;
    this.lp = { b0: (1 - cs) / 2 / a0, b1: (1 - cs) / a0, b2: (1 - cs) / 2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0 };
  }"""),
    # output stage: HQ = soft limiter + low-pass instead of the 10-bit hard clip
    ("""      if (l > 511) { l = 511; this.peakClip++; } else if (l < -512) { l = -512; this.peakClip++; }
      if (r > 511) { r = 511; this.peakClip++; } else if (r < -512) { r = -512; this.peakClip++; }""",
     """      if (this.hq) { // soft-limit peaks (linear up to 75% of full scale, then a smooth knee) instead of a hard clip
        l = softLimit(l / 512) * 512; r = softLimit(r / 512) * 512;
      } else {
        if (l > 511) { l = 511; this.peakClip++; } else if (l < -512) { l = -512; this.peakClip++; }
        if (r > 511) { r = 511; this.peakClip++; } else if (r < -512) { r = -512; this.peakClip++; }
      }"""),
    ("""      outL[offset + i] = yl * g;
      outR[offset + i] = yr * g;""", """      if (this.hq) { // low-pass: removes the harsh images above ~6.7 kHz that the GBA's speaker used to hide
        const c = this.lp, L1 = this.lpL, R1 = this.lpR;
        const fl = c.b0 * yl + c.b1 * L1.x1 + c.b2 * L1.x2 - c.a1 * L1.y1 - c.a2 * L1.y2; L1.x2 = L1.x1; L1.x1 = yl; L1.y2 = L1.y1; L1.y1 = fl;
        const fr2 = c.b0 * yr + c.b1 * R1.x1 + c.b2 * R1.x2 - c.a1 * R1.y1 - c.a2 * R1.y2; R1.x2 = R1.x1; R1.x1 = yr; R1.y2 = R1.y1; R1.y1 = fr2;
        outL[offset + i] = fl * g; outR[offset + i] = fr2 * g;
      } else {
        outL[offset + i] = yl * g;
        outR[offset + i] = yr * g;
      }"""),
    ("const s16 = (v) => (v << 16) >> 16;", "const s16 = (v) => (v << 16) >> 16;\nfunction softLimit(x) { const a = Math.abs(x); if (a <= 0.75) return x; return Math.sign(x) * (0.75 + 0.25 * Math.tanh((a - 0.75) / 0.25)); }"),
    ("        sampleRate: this.sampleRate, stereo: m.stereo !== false, interpolation: m.interpolation || 'hold',\n      });",
     "        sampleRate: this.sampleRate, stereo: m.stereo !== false, interpolation: m.interpolation || 'hold', hq: !!m.hq,\n      });"),
    ("        if ('interpolation' in m) e.interpolation = m.interpolation;\n        break;",
     "        if ('interpolation' in m) e.interpolation = m.interpolation;\n        if ('hq' in m) { e.setHQ(m.hq); if (!m.hq) e.interpolation = 'hold'; }\n        break;"),
])
S = 'web/src/audio/sound.js'
rep(S, [
    ("        stereo: opts.stereo !== false, interpolation: opts.interpolation || 'hold',",
     "        stereo: opts.stereo !== false, interpolation: opts.interpolation || 'hold', hq: opts.hq !== false,"),
    ("  setInterpolation(mode) { post({ type: 'option', interpolation: mode === 'linear' ? 'linear' : 'hold' }); },",
     "  setInterpolation(mode) { post({ type: 'option', interpolation: mode === 'linear' ? 'linear' : 'hold' }); },\n  /** HQ audio (default) vs the authentic GBA mixer (13 kHz, 8-bit wrap, 5 voices, no smoothing). */\n  setHQ(on) { post({ type: 'option', hq: !!on }); },"),
    ("  'playCry', 'stopAll', 'setStereo', 'setInterpolation']) Sound[k] = deferred(Sound[k]);", "  'playCry', 'stopAll', 'setStereo', 'setInterpolation', 'setHQ']) Sound[k] = deferred(Sound[k]);"),
])
rep('web/src/main.js', [
    ("  const soundP = Sound.init('assets/sound/').then(() => {", "  const soundP = Sound.init('assets/sound/', { hq: G.meta.settings?.hqAudio !== false }).then(() => {"),
])
rep('web/src/scenes/title.js', [
    ("    const w = 300, h = 186, x = (W - w) / 2, y = (H - h) / 2;", "    const w = 300, h = 212, x = (W - w) / 2, y = (H - h) / 2;"),
    ("    text(ctx, 'RUMBLE (PAD)', x + 16, y + 113, { color: 'white' });",
     "    text(ctx, 'HQ AUDIO', x + 16, y + 139, { color: 'white' });\n    const hq = s.hqAudio !== false;\n    this.btn(ctx, 'hq', hq ? 'ON' : 'GBA', x + 176, y + 136, 62, 20, { color: hq ? THEME.green : '#806060' }, () => { s.hqAudio = !hq; Sound.setHQ(s.hqAudio); saveMeta(); });\n    text(ctx, 'RUMBLE (PAD)', x + 16, y + 113, { color: 'white' });"),
])
print('ok')
