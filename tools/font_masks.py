# Splits each 2-channel font atlas (gfx/fonts/<font>_rg.png: R = fill, G = shadow) into white alpha masks
# <font>_fill.png and <font>_shadow.png. font.js tints those with canvas compositing, so text never needs
# getImageData (which privacy settings such as Firefox's fingerprinting protection blank out).
# Usage: python tools/font_masks.py
import json, os
from PIL import Image

D = os.path.join(os.path.dirname(__file__), '..', 'web', 'assets', 'gfx', 'fonts')
meta = json.load(open(os.path.join(D, 'fonts.json'), encoding='utf8'))
for name, f in meta['fonts'].items():
    src = Image.open(os.path.join(D, os.path.basename(f['rg']))).convert('RGBA')
    for kind, ch in (('fill', 0), ('shadow', 1)):
        out = Image.new('RGBA', src.size, (0, 0, 0, 0))
        px, op = src.load(), out.load()
        for y in range(src.height):
            for x in range(src.width):
                p = px[x, y]
                if p[3] and p[ch] > 128 and (ch == 0 or p[0] <= 128): op[x, y] = (255, 255, 255, 255)
        out.save(os.path.join(D, f'{name}_{kind}.png'))
        print(name, kind)
