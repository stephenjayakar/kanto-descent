"""Re-extract FireRed's title-screen background with the right colours.

extract_gfx.py reads grayscale ("L") PNGs as palette index = value * 15 / 255, but gbagfx inverts grayscale
images (gfx.c: index = 15 - value when the PNG has no palette). graphics/title_screen/border_bg.png is the
only grayscale image the title uses, so BG3 came out light grey instead of FireRed's black bands around a
teal band. This renders the corrected layers as NEW files (the originals are left alone):

  ui/title/border_bg_fixed.png      BG3 alone (240x160): black top/bottom, teal band
  ui/title/title_screen_fixed.png   the whole static screen (BG3 + copyright/PRESS START + Charizard + logo)

Usage: python tools/extract_title_fixed.py [path/to/pokefirered]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_gfx as X  # noqa: E402

pret = Path(sys.argv[1]) if len(sys.argv) > 1 else X.PRET
if not pret.exists():
    pret = Path("E:/BigData/games/firered-hades/pokefirered")
G = pret / "graphics"
_orig_load_idx = X.load_idx


def load_idx_gbagfx(path):
    im = Image.open(path)
    if im.mode == "L":  # gbagfx: grayscale PNGs are inverted (index = 15 - sample)
        a = np.array(im, dtype=np.uint16) * 15 // 255
        return (15 - a).astype(np.uint8)
    return _orig_load_idx(path)


X.load_idx = load_idx_gbagfx

TS = G / "title_screen"
FR = TS / "firered"
logo_pal = X.read_jasc(FR / "game_title_logo.pal")[:208]
bgp = X.read_jasc(FR / "background.pal")
bgpal = X.bg_palette((0, logo_pal), (13, X.read_jasc(FR / "box_art_mon.pal")), (14, bgp), (15, bgp))
L0 = X.render_map(X.tiles_of(X.load_idx(FR / "game_title_logo.png")), X.grid_from(FR / "game_title_logo.bin", 32, 20), bgpal, bpp8=True)
L1 = X.render_map(X.load_tiles(FR / "box_art_mon.png"), X.grid_from(FR / "box_art_mon.bin", 32, 20), bgpal)
L2 = X.render_map(X.load_tiles(TS / "copyright_press_start.png"), X.grid_from(TS / "copyright_press_start.bin", 32, 20), bgpal)
L3 = X.render_map(X.load_tiles(TS / "border_bg.png"), X.grid_from(FR / "border_bg.bin", 32, 20), bgpal)

out = X.OUT / "ui" / "title"
Image.fromarray(X.view(X.screen(L3, backdrop=logo_pal[0]))).save(out / "border_bg_fixed.png")
Image.fromarray(X.view(X.screen(L3, L2, L1, L0, backdrop=logo_pal[0]))).save(out / "title_screen_fixed.png")
print("wrote", out / "border_bg_fixed.png", out / "title_screen_fixed.png")
