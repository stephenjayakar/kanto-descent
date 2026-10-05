#!/usr/bin/env python3
"""FireRed map-name popup sign and mugshot (VS) banner, rendered from the pokefirered decomp.

Writes NEW files only (never overwrites existing assets):
  web/assets/gfx/ui/map_popup/popup.png        the map name sign (std window tiles, text-window palette 3),
                                                14x2 tile interior + 1 tile border = 128x32, as MapNamePopupCreateWindow
  web/assets/gfx/ui/map_popup/popup_floor.png  the 19-tile-wide variant used for maps with a floor number (168x32)
  web/assets/gfx/ui/mugshot/banner_<pal>.png   the 256x160 mugshot transition BG (one full BG width: it wraps when scrolled) (vsbar_tilemap.bin over
                                                mugshot_banner.4bpp tiles) with each Elite Four / rival palette,
                                                the player's (red_bg) palette in slots 10-15 as Mugshot_SetGfx does

Usage: python tools/extract_transition_gfx.py [path/to/pokefirered]   (default: ../firered-hades/pokefirered)
"""
import os, struct, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DECOMP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'firered-hades', 'pokefirered')
OUT = os.path.join(ROOT, 'web', 'assets', 'gfx', 'ui')


def jasc(path):
    lines = open(path).read().split('\n')
    n = int(lines[2])
    return [tuple(int(v) for v in lines[3 + i].split()) for i in range(n)]


def indices(path):
    """palette indices of a decomp png (P mode, or L mode greyscale = index * 17)"""
    im = Image.open(path)
    if im.mode == 'P':
        return im, lambda x, y: im.getpixel((x, y))
    im = im.convert('L')
    return im, lambda x, y: im.getpixel((x, y)) // 17


def save_new(img, rel):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        print('exists, kept:', rel)
        return
    img.save(path)
    print('wrote', rel, img.size)


def popup():
    tw = os.path.join(DECOMP, 'graphics', 'text_window')
    pal = jasc(os.path.join(tw, 'stdpal_3.pal'))
    im, ix = indices(os.path.join(tw, 'std.png'))  # 24x24 = 3x3 tiles: corners, edges, fill (tileNum + 0..8)

    def tile(n):
        t = Image.new('RGBA', (8, 8))
        tx, ty = (n % 3) * 8, (n // 3) * 8
        for y in range(8):
            for x in range(8):
                i = ix(tx + x, ty + y)
                t.putpixel((x, y), (0, 0, 0, 0) if i == 0 else pal[i] + (255,))
        return t

    tiles = [tile(n) for n in range(9)]
    def sign(width, height=2):
        s = Image.new('RGBA', ((width + 2) * 8, (height + 2) * 8))
        for ty in range(height + 2):
            for tx in range(width + 2):
                r = 0 if ty == 0 else 2 if ty == height + 1 else 1
                c = 0 if tx == 0 else 2 if tx == width + 1 else 1
                s.paste(tiles[r * 3 + c], (tx * 8, ty * 8))
        # the window's pixel buffer is filled with PIXEL_FILL(1): palette colour 1 (white)
        for y in range(8, (height + 1) * 8):
            for x in range(8, (width + 1) * 8):
                s.putpixel((x, y), pal[1] + (255,))
        return s

    save_new(sign(14), 'map_popup/popup.png')
    save_new(sign(19), 'map_popup/popup_floor.png')


def mugshot():
    bt = os.path.join(DECOMP, 'graphics', 'battle_transitions')
    im, ix = indices(os.path.join(bt, 'mugshot_banner.png'))
    ntiles = (im.width // 8) * (im.height // 8)
    raw = open(os.path.join(bt, 'vsbar_tilemap.bin'), 'rb').read()
    tmap = struct.unpack('<%dH' % (len(raw) // 2), raw)
    player = jasc(os.path.join(bt, 'red_bg.pal'))
    for name in ['lorelei', 'bruno', 'agatha', 'lance', 'blue']:  # opponents (red/green are the player's palettes)
        pal = list(jasc(os.path.join(bt, name + '_bg.pal')))
        pal[10:16] = player[:6]
        out = Image.new("RGBA", (256, 160))
        for row in range(20):
            for col in range(32):  # the whole 256px BG, so it tiles when scrolled
                e = tmap[row * 32 + col]
                t, hf, vf = e & 0x3ff, e & 0x400, e & 0x800
                if t >= ntiles:
                    continue
                tx, ty = (t % (im.width // 8)) * 8, (t // (im.width // 8)) * 8
                for y in range(8):
                    for x in range(8):
                        sx = 7 - x if hf else x
                        sy = 7 - y if vf else y
                        i = ix(tx + sx, ty + sy)
                        out.putpixel((col * 8 + x, row * 8 + y), (0, 0, 0, 0) if i == 0 else pal[i] + (255,))
        save_new(out, 'mugshot/banner_%s.png' % name)


if __name__ == '__main__':
    popup()
    mugshot()
