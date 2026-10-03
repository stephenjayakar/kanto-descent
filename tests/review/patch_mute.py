def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

# Test browsers must never play sound through the owner's speakers.
rep('tests/browserd.cjs', [("args: ['--autoplay-policy=no-user-gesture-required'] });", "args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] }); // silent: never play sound on the owner's speakers")])
rep('tests/coop_e2e.mjs', [("const args = ['--autoplay-policy=no-user-gesture-required',", "const args = ['--mute-audio', '--autoplay-policy=no-user-gesture-required',")])
rep('tests/packs_repro.mjs', [
    ("firefoxUserPrefs: process.env.RFP ? { 'privacy.resistFingerprinting': true, 'privacy.fingerprintingProtection': true, 'privacy.fingerprintingProtection.overrides': '+AllTargets' } : {} })",
     "firefoxUserPrefs: { 'media.volume_scale': '0.0', ...(process.env.RFP ? { 'privacy.resistFingerprinting': true, 'privacy.fingerprintingProtection': true, 'privacy.fingerprintingProtection.overrides': '+AllTargets' } : {}) } })"),
    ("await chromium.launch({ channel: 'chrome', headless: true });", "await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] }); // silent"),
])
print('ok')
