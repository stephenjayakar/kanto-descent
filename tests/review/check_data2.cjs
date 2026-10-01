// Part 2 of the data check (icons, gfx paths, overworld sprites, trainer classes).
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '../../web/assets');
const S = path.join(__dirname, '../../web/src');
const J = f => JSON.parse(fs.readFileSync(path.join(A, f), 'utf8'));
const tr = J('data/trainers.json');
const src = {}; for (const f of require('child_process').execSync(`find ${S} -name '*.js'`).toString().trim().split('\n')) src[f] = fs.readFileSync(f, 'utf8');
const all = Object.values(src).join('\n');
const out = [];
const bad = (...a) => out.push(a.join(' '));
const content = src[Object.keys(src).find(f => f.endsWith('content.js'))];
const BIOMES = eval(content.match(/export const BIOMES = (\[[\s\S]*?\n\]);/)[1]);
const ITEMS = ['POTION', 'SUPER_POTION', 'RARE_CANDY', 'PP_UP', 'POKE_BALL', 'GREAT_BALL', 'ULTRA_BALL', 'HP_UP', 'TM01', 'LEFTOVERS', 'SACRED_ASH', 'STAR_PIECE',
  'QUICK_CLAW', 'SCOPE_LENS', 'SHELL_BELL', 'FOCUS_BAND', 'KINGS_ROCK', 'LUCKY_EGG', 'AMULET_COIN', 'EXP_SHARE', 'BRIGHT_POWDER', 'CHOICE_BAND',
  'CHARCOAL', 'MYSTIC_WATER', 'MIRACLE_SEED', 'MAGNET', 'NEVER_MELT_ICE', 'TWISTED_SPOON', 'SPELL_TAG', 'BLACK_BELT', 'SOFT_SAND', 'HARD_STONE',
  'SHARP_BEAK', 'POISON_BARB', 'SILVER_POWDER', 'DRAGON_FANG', 'BLACK_GLASSES', 'METAL_COAT', 'SILK_SCARF',
  'hp_up', 'protein', 'revival_herb', 'rare_candy', 'quick_claw', 'amulet_coin', 'poke_ball', 'lucky_egg', 'star_piece', 'itemfinder', 'exp_share', 'great_ball', 'ultra_ball', 'master_ball'];
for (const k of ITEMS) if (!fs.existsSync(path.join(A, `gfx/items/${k.toLowerCase()}.png`))) bad('ITEM icon missing', k);
for (const m of new Set(all.match(/gfx\/[a-z_\/0-9]+\.png/g))) if (!fs.existsSync(path.join(A, m))) bad('GFX path missing', m);
const OW = ['clerk', 'nurse', 'prof_oak', 'scientist', 'worker_f', 'blue', 'brock', 'misty', 'giovanni', 'woman_1', 'man', 'rocket_f', 'rocket_m', 'bug_catcher', 'hiker', 'channeler', 'super_nerd', 'lass', 'youngster', 'rocker', 'balding_man', 'poke_maniac', 'cooltrainer_m', 'gentleman', 'worker_m', 'fisher', 'camper', 'picnicker', 'beauty', 'biker', 'black_belt', 'sailor', 'swimmer_m_land'];
for (const o of OW) if (!fs.existsSync(path.join(A, `gfx/overworld/people/${o}.png`))) bad('OW sprite missing', o);
const spawnSrc = src[Object.keys(src).find(f => f.endsWith('spawn.js'))];
const classes = new Map();
for (const B of BIOMES) for (const t of Object.values(tr).filter(t => !t.dummy && !t.rematchOf && t.party?.length && t.maps?.some(m => B.trainerMaps.includes(m)) && !/LEADER|BOSS|RIVAL|CHAMPION|ELITE/.test(t.key))) {
  if (!spawnSrc.includes(`'${t.className}'`) && !spawnSrc.includes(` ${t.className}:`)) classes.set(t.className, B.key);
}
for (const [c, b] of classes) out.push(`info unmapped trainer class ${c} (${b}) -> generic sprite`);
for (const k of ['LEADER_BROCK', 'LEADER_MISTY', 'BOSS_GIOVANNI_2']) { const t = tr[k]; if (!t) bad('BOSS trainer missing', k); else if (!fs.existsSync(path.join(A, `gfx/trainers/${t.pic}.png`))) bad('BOSS trainer pic missing', k, t.pic); }
for (const f of ['gfx/misc/emotes/exclamation.png', 'gfx/misc/emotes/double_exclamation.png', 'gfx/ui/cursors/text_advance_arrow.png', 'gfx/ui/cursors/red_arrow.png', 'gfx/misc/evolution/static_bg.png', 'gfx/misc/hall_of_fame/bg.png', 'gfx/overworld/misc/item_ball.png']) if (!fs.existsSync(path.join(A, f))) bad('GFX missing', f);
console.log(out.join('\n') || 'part2 OK');
