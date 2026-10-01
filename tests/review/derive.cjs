const SPRITE_FOR_TYPE = { FIRE: 'ember', WATER: 'water', GRASS: 'leaf', ELECTRIC: 'orb_yellow', ICE: 'snow', PSYCHIC: 'orb_psychic', DRAGON: 'dragon', DARK: 'shadow', GHOST: 'shadow', POISON: 'sludge', ROCK: 'rock', GROUND: 'mud', BUG: 'needle', FLYING: 'wind', STEEL: 'star', NORMAL: 'star', FIGHTING: 'fist' };
const FX_FOR_TYPE = { FIRE: 'fire', WATER: 'water', GRASS: 'vine', ELECTRIC: 'spark', ICE: 'ice', PSYCHIC: 'psychic', DRAGON: 'dragon', DARK: 'bite', GHOST: 'ghost', POISON: 'sludge', ROCK: 'rock', GROUND: 'quake', BUG: 'claw', FLYING: 'wind', STEEL: 'claw', NORMAL: 'impact', FIGHTING: 'fist' };

function derive(m) {
  const contact = m.flags?.includes('MAKES_CONTACT');
  const pw = m.power || 0;
  const eff = m.effect;
  if (pw === 0) {
    if (/_UP(_2)?$/.test(eff) || eff === 'EVASION_UP' || eff === 'FOCUS_ENERGY') {
      const st = eff.startsWith('ATTACK') ? 'atk' : eff.startsWith('DEFENSE') ? 'def' : eff.startsWith('SPEED') ? 'spe' : eff.startsWith('SPECIAL_ATTACK') ? 'spa' : eff.startsWith('SPECIAL_DEFENSE') ? 'spd' : eff === 'EVASION_UP' ? 'eva' : 'crit';
      return { kind: 'buff', stat: st, stages: eff.endsWith('_2') ? 2 : 1, cd: 6, fx: 'shine', sfx: 'se_m_stat_increase' };
    }
    if (/_DOWN(_2)?$/.test(eff)) {
      const st = eff.startsWith('ATTACK') ? 'atk' : eff.startsWith('DEFENSE') ? 'def' : eff.startsWith('SPEED') ? 'spe' : eff.startsWith('ACCURACY') ? 'acc' : eff.startsWith('EVASION') ? 'eva' : 'spd';
      return { kind: 'debuff', stat: st, stages: eff.endsWith('_2') ? 2 : 1, radius: 56, at: 'front', cd: 6, fx: 'sound', sfx: 'se_m_stat_decrease' };
    }
    if (eff === 'SLEEP') return { kind: 'proj', speed: 130, size: 6, count: 1, life: 1.1, cd: 7, sprite: 'ring', status: { kind: 'sleep', chance: 1 }, sfx: 'se_m_sing' };
    if (eff === 'PARALYZE') return { kind: 'proj', speed: 200, size: 5, count: 1, life: 0.8, cd: 5, sprite: 'orb_yellow', status: { kind: 'para', chance: 1 }, sfx: 'se_m_thunder_wave' };
    if (eff === 'POISON' || eff === 'TOXIC') return { kind: 'proj', speed: 170, size: 5, count: 1, life: 0.8, cd: 5, sprite: 'sludge', status: { kind: 'poison', chance: 1 }, sfx: 'se_m_toxic' };
    if (eff === 'CONFUSE' || eff === 'SWAGGER' || eff === 'FLATTER' || eff === 'TEETER_DANCE') return { kind: 'proj', speed: 140, size: 6, count: 1, life: 1.2, cd: 5, sprite: 'ring', status: { kind: 'confuse', chance: 1 }, sfx: 'se_m_supersonic' };
    if (eff === 'WILL_O_WISP') return { kind: 'proj', speed: 120, size: 6, count: 1, life: 1.4, homing: 3, cd: 5, sprite: 'orb_ghost', status: { kind: 'burn', chance: 1 }, sfx: 'se_m_ember' };
    if (['RESTORE_HP', 'SOFTBOILED', 'SYNTHESIS', 'MORNING_SUN', 'MOONLIGHT', 'SWALLOW', 'WISH', 'INGRAIN'].includes(eff)) return { kind: 'heal', amount: 0.25, cd: 12, sfx: 'se_m_moonlight' };
    if (eff === 'PROTECT' || eff === 'ENDURE') return { kind: 'protect', dur: 0.8, cd: 4, sfx: 'se_m_detect' };
    return { kind: 'buff', stat: 'def', cd: 6, fx: 'shine', sfx: 'se_m_stat_increase' };
  }
  if (contact) {
    if (eff === 'QUICK_ATTACK' || eff === 'FAKE_OUT' || eff === 'PURSUIT') return { kind: 'lunge', dist: 50, range: 14, dur: 0.12, cd: 0.32, fx: FX_FOR_TYPE[m.type] };
    if (eff === 'RECOIL' || eff === 'DOUBLE_EDGE' || eff === 'RECOIL_IF_MISS' || eff === 'RAMPAGE') return { kind: 'charge', dist: 80, dur: 0.26, range: 17, cd: 0.8, fx: FX_FOR_TYPE[m.type], recoil: 0.15 };
    if (eff === 'MULTI_HIT' || eff === 'DOUBLE_HIT' || eff === 'TRIPLE_KICK' || eff === 'TWINEEDLE' || eff === 'FURY_CUTTER') return { kind: 'multi', hits: eff === 'DOUBLE_HIT' ? 2 : 3, range: 22, arc: 1.6, cd: 0.45, fx: FX_FOR_TYPE[m.type] };
    if (pw >= 80) return { kind: 'lunge', dist: 32, range: 20, cd: 0.55, fx: FX_FOR_TYPE[m.type], knock: 160 };
    return { kind: 'swipe', range: 20 + Math.min(10, pw / 10), arc: 1.7, combo: pw >= 60 ? 2 : 3, cd: 0.2, fx: FX_FOR_TYPE[m.type] };
  }
  // non-contact damaging
  if (eff === 'EARTHQUAKE' || eff === 'MAGNITUDE' || eff === 'EXPLOSION') return { kind: 'nova', radius: 60, cd: 2, fx: FX_FOR_TYPE[m.type], grounded: eff !== 'EXPLOSION' };
  if (eff === 'SOLAR_BEAM' || eff === 'RECHARGE' || pw >= 110) return { kind: 'beam', len: 160, width: 14, windup: 0.5, dur: 0.4, cd: 2.2, fx: FX_FOR_TYPE[m.type] };
  if (eff === 'THUNDER' || eff === 'FUTURE_SIGHT') return { kind: 'strike', radius: 24, delay: 0.45, count: 1, cd: 1.4, fx: FX_FOR_TYPE[m.type] };
  if (eff === 'ABSORB') return { kind: 'proj', speed: 200, size: 6, count: 1, life: 0.8, cd: 0.5, sprite: 'orb_green', drain: 0.5 };
  if (eff === 'TRAP') return { kind: 'cloud', radius: 24, dur: 3, at: 'target', cd: 1.6, tick: 0.35, sprite: SPRITE_FOR_TYPE[m.type], status: { kind: 'trap', chance: 1 } };
  if (pw >= 85) return { kind: 'proj', speed: 180, size: 9, count: 1, life: 1.0, cd: 1.1, sprite: SPRITE_FOR_TYPE[m.type], explode: 26 };
  return { kind: 'proj', speed: 210, size: 5, count: 1, life: 0.8, cd: pw >= 60 ? 0.5 : 0.32, sprite: SPRITE_FOR_TYPE[m.type] };
}

function defaultWindup(p) {
  switch (p.kind) {
    case 'swipe': case 'multi': return 0.38;
    case 'lunge': return 0.45;
    case 'charge': return 0.6;
    case 'proj': case 'seed': return 0.4;
    case 'stream': return 0.45;
    case 'beam': return 0.6;
    case 'chain': return 0.45;
    case 'nova': return 0.55;
    case 'strike': return 0.1;
    case 'cloud': return 0.4;
    default: return 0.3;
  }
}

function estimateRange(p) {
  switch (p.kind) {
    case 'swipe': case 'multi': return 24;
    case 'lunge': return (p.dist || 26) + 14;
    case 'charge': return (p.dist || 70) + 10;
    case 'proj': case 'seed': return Math.min(160, (p.speed || 200) * (p.life || 0.8));
    case 'stream': return (p.speed || 200) * (p.life || 0.5);
    case 'beam': return p.len || 150;
    case 'chain': return p.range || 100;
    case 'nova': return (p.radius || 40) * 0.8;
    case 'strike': return 140;
    case 'cloud': return p.at === 'self' ? 30 : 70;
    case 'debuff': return p.radius || 60;
    default: return 60;
  }
}

module.exports={derive,defaultWindup,estimateRange};
