p = 'web/src/game/combat.js'
s = open(p, encoding='utf8').read()
a = """    } else if (a.team === 'enemy' && (a.ghost || a.flying) && (a.x < 0 || a.y < 0 || a.x > this.room.w * TILE || a.y > this.room.h * TILE)) { const q = this.nearestReachable(a.x, a.y); a.x = q.x; a.y = q.y; }"""
b = """    } else if (a.team === 'enemy' && (a.ghost || a.flying) && (a.x < 0 || a.y < 0 || a.x > this.room.w * TILE || a.y > this.room.h * TILE)) { const q = this.nearestReachable(a.x, a.y); a.x = q.x; a.y = q.y; }
    // players too: a dash over water that got cut short (hit, stun) must not leave you stranded on a gap
    if (a.team === 'player' && !a.dashing && !(a.action?.p.kind === 'dash') && !(a.z > 0)) {
      if (this.collides(a.x, a.y, Math.min(a.r, 6), 'walk') || !this.reachable(a.x, a.y)) { a.offT = (a.offT || 0) + dt; if (a.offT > 0.25) { const q = this.nearestReachable(a.x, a.y); a.x = q.x; a.y = q.y; a.offT = 0; a.kx = a.ky = 0; } }
      else a.offT = 0;
    }"""
assert a in s; s = s.replace(a, b, 1)
open(p, 'w', encoding='utf8').write(s)
print('ok')
