#!/usr/bin/env python3
"""
Poké Ball open particles (the burst when a ball opens in battle).

    python tools/extract_ball_particles.py      # writes web/assets/gfx/battle_anims/ball_particles.png

Source: graphics/battle_anims/sprites/particles.png (8x64, eight 8x8 frames) drawn with the circle_impact
palette, as gBallParticleSpritesheets / gBallParticlePalettes in src/battle_anim_special.c set it up.
Frames per ball (sBallParticleAnimNums -> sAnims_BallParticles): POKé/GREAT/SAFARI cycle 0,1,2,0(hflip),2,1
every frame; MASTER 3; NET/DIVE 4; NEST 5; LUXURY/PREMIER 6,7 (4 frames each); ULTRA/REPEAT/TIMER 7.

The game registers the strip in render.js (BALL_PARTICLES) rather than in battle_anims/manifest.json, so this
never has to rewrite the generated manifest.
"""
import os
from pathlib import Path

from PIL import Image

from extract_battle_anims import PRET, OUT, png_tiles, tiles_to_frames, png_palette, colorize


def main():
    pret = Path(os.environ.get("PRET", PRET))  # worktrees have no pokefirered/: PRET=<main checkout>/pokefirered
    sprites = pret / "graphics" / "battle_anims" / "sprites"
    tiles = png_tiles(sprites / "particles.png")             # 8 tiles of 8x8
    strip, n = tiles_to_frames(tiles, 8, 8)                  # -> 8 x 64 strip, 8 frames
    rgba = colorize(strip, png_palette(sprites / "circle_impact.png"))
    out = OUT / "ball_particles.png"
    Image.fromarray(rgba, "RGBA").save(out)
    print(f"{out}: {n} frames of 8x8")


if __name__ == "__main__":
    main()
