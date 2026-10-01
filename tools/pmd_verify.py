"""Contact sheet to eyeball PMD sheet slicing / direction order.
python tools/pmd_verify.py [dex ...]  -> tools/pmd_verify/contact.png
Per species row: Walk frame 0 for the 8 direction rows (labelled with the assumed
direction), then every frame of Attack row 0 (Down)."""
import json, os, sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..')
PMD = os.path.join(ROOT, 'web', 'assets', 'pmd')
OUT = os.path.join(os.path.dirname(__file__), 'pmd_verify')
DEFAULT = [1, 4, 7, 25, 133, 150, 151, 144, 145, 146, 74, 95, 92, 94, 104, 41, 35, 249, 250, 386]
DIRS = ['D', 'DR', 'R', 'UR', 'U', 'UL', 'L', 'DL']
CELL, SCALE, LABEL_W = 64, 1, 90


def frame(dex, a, col, row):
    sheet = Image.open(os.path.join(PMD, str(dex), a['file'])).convert('RGBA')
    w, h = a['frameW'], a['frameH']
    return sheet.crop((col * w, row * h, (col + 1) * w, (row + 1) * h))


def fit(im, box):
    s = min(box / im.width, box / im.height, 2)
    s = max(1, int(s)) if s >= 1 else s
    return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.NEAREST)


def main():
    dexes = [int(x) for x in sys.argv[1:]] or DEFAULT
    data = {d: json.load(open(os.path.join(PMD, str(d), 'anim.json'))) for d in dexes}
    max_att = max(len(v['anims']['Attack']['durations']) for v in data.values())
    att_cell = 80
    W = LABEL_W + 8 * CELL + 12 + max_att * att_cell
    H = 18 + len(dexes) * (max(CELL, att_cell) + 4)
    img = Image.new('RGBA', (W, H), (40, 44, 52, 255))
    dr = ImageDraw.Draw(img)
    for i, t in enumerate(DIRS):
        dr.text((LABEL_W + i * CELL + 4, 3), t, fill=(255, 255, 120))
    dr.text((LABEL_W + 8 * CELL + 16, 3), 'Attack row0 frames (hit frame boxed red, rush yellow, return cyan)', fill=(255, 255, 120))
    y = 18
    rowh = max(CELL, att_cell) + 4
    for d in dexes:
        v = data[d]
        walk, att = v['anims']['Walk'], v['anims']['Attack']
        dr.text((4, y + 4), f"#{d}\n{v['name']}\nwalk {walk['frameW']}x{walk['frameH']}\natk {att['frameW']}x{att['frameH']}", fill='white')
        for r in range(walk['rows']):
            f = fit(frame(d, walk, 0, r), CELL - 4)
            x0 = LABEL_W + r * CELL
            dr.rectangle((x0, y, x0 + CELL - 2, y + CELL - 2), fill=(60, 66, 78))
            img.alpha_composite(f, (x0 + (CELL - f.width) // 2, y + (CELL - f.height) // 2))
        for c in range(att['frames']):
            f = fit(frame(d, att, c, 0), att_cell - 4)
            x0 = LABEL_W + 8 * CELL + 12 + c * att_cell
            col = {att['hitFrame']: (220, 60, 60), att['rushFrame']: (220, 200, 60), att['returnFrame']: (60, 200, 220)}.get(c, (60, 66, 78))
            dr.rectangle((x0, y, x0 + att_cell - 2, y + att_cell - 2), fill=(60, 66, 78), outline=col, width=2)
            img.alpha_composite(f, (x0 + (att_cell - f.width) // 2, y + (att_cell - f.height) // 2))
        y += rowh
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, 'contact.png')
    img.save(p)
    print(p, img.size)


if __name__ == '__main__':
    main()
