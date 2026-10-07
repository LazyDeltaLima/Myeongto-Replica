// render/fxmap.js — which extracted effect plays for which battle event (local patch, docs/LOCAL-PATCH.md).
//
// Effect bundles are named after the operator (battle/prefabs/effects/<name>.ab, the charId without its char_NNN_
// prefix: char_1050_chen3 → chen3) and the prefabs follow the client's naming: <name>_attack_start_01 / _attack_hit_01,
// <name>_skill_0N_start_01 / _buff_01 / _hit_01, <name>_birth_01_start. Skin / collab variants carry a suffix
// (_iteration#4, _sale#14, _avemujica#1 …) and are left out: the remake draws the default skin.
// [ASSUMED] the mapping by name; the client binds effects per ability in its charpack prefabs (`_startEffect` …).

import { skillModeIndex } from '../../../shared/skill-modes.js';

/** Effect bundle of an operator (charId without its numeric prefix). */
export const fxBundleOf = (charId) => String(charId || '').replace(/^char_\d+_/, '');

/** A skin / collab variant of a prefab (not the default skin). */
export const isVariant = (name) => /#\d+|_sale|_iteration|_avemujica|_cn_topolect/i.test(name);

/**
 * Prefabs of a bundle grouped by use: attack, skill1..3, birth, other (variants dropped).
 * @param {string[]} prefabs
 */
/** The name after the operator key (whitw2_… : the key itself must not match "hit"). */
const tail = (p) => p.slice(p.indexOf('_'));
/** A mode variant (_combat_: 仇白's other attack) only when the plain attack effect is missing. */
const plainFirst = (list) => { const plain = list.filter((p) => !/_combat_/i.test(p)); return plain.length ? plain : list; };
/** A second / third alternative version of an attack effect (_b, _c, _B; the first one is kept). */
const ALT_RE = /_[bcBC](_|$)/;

/** A copy of an effect for an up / down / left / back facing (the remake draws units facing left or right). */
export const isDirectional = (name) => /_(up|down|left|back)(_|$)/i.test(name);

export function effectGroups(prefabs) {
  const g = { attack: [], skill1: [], skill2: [], skill3: [], birth: [], other: [] };
  for (const p of prefabs || []) {
    if (isVariant(p) || isDirectional(p)) continue;
    const m = /_skill_?0?(\d)/i.exec(p); // _skill_03_ / _skill_3_ (angel2) / skill3_ (yu)
    if (m && g[`skill${m[1]}`]) g[`skill${m[1]}`].push(p);
    else if (/_attack/i.test(p) || /^[a-z0-9]+_hit_\d/i.test(p)) g.attack.push(p); // yu_hit_01 / whitw2_hit_01: the attack's hit
    else if (/_birth|_born/i.test(p)) g.birth.push(p);
    else g.other.push(p);
  }
  for (const k of Object.keys(g)) g[k].sort();
  return g;
}

/**
 * Effects of a battle event for an operator, from its bundle's prefab list:
 *   'attackStart' (on the attacker), 'attackHit' (on the target), 'skillStart' / 'skillBuff' (looping while the skill
 *   is active) / 'skillHit' (on the target, during the skill) of skill index `skillIndex` (0-based), 'birth'.
 * @returns {string[]} prefab names (several play together: e.g. _start_01 and _start_02)
 */
export function effectsFor(prefabs, kind, skillIndex = 0) {
  const g = effectGroups(prefabs);
  const s = g[`skill${skillIndex + 1}`] || [];
  switch (kind) {
    // normal attacks: _attack_start_01, _attack_01_start, _attack_a_start, yu_attack_01 … (hits: _attack_hit_01,
    // _attack_01_hit, yu_hit_01); an operator with alternative versions (_a/_b/_c, _A/_B: one per attack or per mode)
    // keeps the first one; trails / ranges / lines are a projectile's or a mode's, not the attack's
    case 'attackStart': return plainFirst(g.attack.filter((p) => !/hit|trail|range|line/i.test(tail(p)) && !ALT_RE.test(p)));
    case 'attackHit': return plainFirst(g.attack.filter((p) => /hit/i.test(tail(p)) && !ALT_RE.test(p))).slice(0, 1);
    case 'skillStart': return s.filter((p) => /_start/i.test(p));
    // local patch: plus one lasting range display (`…_range` / `…_range_0N`, not a `_start` / `_end` / `_hit` one-shot) — the skills
    // without mode bindings (사리아 skgoat_skill_01_range); the bound ones get theirs from modes.json `attach`
    case 'skillBuff': return [...s.filter((p) => /_buff/i.test(p) && !/_[BF]_/.test(p)).slice(0, 2),
      ...s.filter((p) => /_range(_0\d)?$/i.test(p)).slice(0, 1)];
    case 'skillHit': return s.filter((p) => /_hit/i.test(p)).slice(0, 1);
    case 'skillTrail': return s.filter((p) => /_trail_01$/i.test(p)).slice(0, 1);
    case 'birth': return g.birth.filter((p) => /start|_01/.test(p)).slice(0, 1);
    default: return [];
  }
}

// ---- 丰川祥子's notes (kits/diy.js NOTE; battle.fx 'oblvnsNote', local patch 2026-10-06) ----------------------------
// The client's note projectiles (EN [uc]projectiles.ab projectile_chr_oblvns*: `_mainEffect` = the trail, `_effectsWhenHit`
// = the hit) per sim note mode, and their flight (a copy of the sim's NOTE — test/local-patch.test.js keeps them equal;
// `sine` the 扩张正弦 amplitude of the free flight, drawn here only; `pass` the piano note's 【已命中】 flight on through
// its target: PRTS "固定3.0速度当前方向移动，持续0.5s").
export const NOTE_FX = Object.freeze({
  base: { trail: 'oblvns_attack_01_trail', hit: 'oblvns_attack_01_hit' },     // projectile_chr_oblvns
  talent: { trail: 'oblvns_talent_trail', hit: 'oblvns_attack_01_hit' },      // _talent (持续攻击, no skill)
  s1: { trail: 'oblvns_skill_01_trail', hit: 'oblvns_skill_01_hit' },         // _s1_1 … _s1_8 (trail, trail_02 … _08)
  piano: { trail: 'oblvns_skill_02_trail_02', hit: 'oblvns_skill_02_hit_02' }, // _s2 / _s2_t
  organ: { trail: 'oblvns_skill_02_trail', hit: 'oblvns_skill_02_hit' },       // _s2_slow / _s2_slow_t
  s3: { trail: 'oblvns_skill_03_trail_02', hit: 'oblvns_skill_03_hit_02' },    // _s3_phy
  s3m: { trail: 'oblvns_skill_03_trail', hit: 'oblvns_skill_03_hit' },         // _s3_mag
});
export const NOTE_FLIGHT = Object.freeze({
  base: { free: 2.0, track: 2.0, turn: 5 },
  talent: { free: 1.3, sine: 0.3, track: 2.0, turn: 7 },
  s1: { free: 1.7, track: 2.2, turn: 5 },
  piano: { free: 1.9, sine: 0.4, track: 3.5, turn: 15, pass: { speed: 3.0, time: 0.5 } },
  organ: { free: 0.7, sine: 0.15, track: 1.0, turn: 2.5 },
  s3: { free: 0.8, sine: 0.5, track: 1.3, turn: 7.5 },
  s3m: { free: 0.8, sine: 0.5, track: 1.3, turn: 7.5 },
});
/** Trail / hit prefab of a note (`fan` 1–8: the S1 note's own trail). null for an unknown mode. */
export function noteEffects(mode, fan = 0) {
  const fx = NOTE_FX[mode];
  if (!fx) return null;
  if (mode === 's1' && fan > 1 && fan <= 8) return { trail: `${fx.trail}_0${fan}`, hit: fx.hit };
  return fx;
}

// ---- attack-mode bindings (local patch 2026-10-07, docs/LOCAL-PATCH.md 「스킬 중 공격 이펙트」) ---------------------------
// /assets/local/fx/modes.json[charId] = { modes: [Default, S2, …], skillMode?: [mode|null per skill], cast: [[names]…], hit: [[names]…], trail: [[names]…],
//   attach: [[names]…] }
// (tools/local-extract/char_modes.py: the character prefab's attack modes and the effects their attacks bind).

/**
 * The attack mode an operator's attack uses: the running skill's mode (shared/skill-modes.js) or Default 0; -1 for a
 * running skill that switches no mode; null without bindings.
 * @param {any} bind modes.json entry
 * @param {boolean} skillOn
 * @param {number} skillIndex 0-based
 */
export function attackMode(bind, skillOn, skillIndex) {
  if (!bind || !Array.isArray(bind.modes)) return null;
  return skillOn ? skillModeIndex(bind.modes, skillIndex, bind.skillMode) : 0;
}

/**
 * The extracted prefabs mode `n` binds for `role` ('cast' on the attacker, 'hit' on the target, 'trail'), in order; [] for
 * no mode / nothing extracted.
 * @param {any} bind modes.json entry
 * @param {string[]|null|undefined} prefabs the operator's extracted prefabs (index.json bundles[bundle])
 * @param {number|null} n
 * @param {'cast'|'hit'|'trail'|'attach'} role
 */
export function boundEffects(bind, prefabs, n, role) {
  if (!bind || !Array.isArray(prefabs) || !Number.isInteger(n) || n < 0) return [];
  const list = bind[role]?.[n];
  return Array.isArray(list) ? list.filter((x) => prefabs.includes(x)) : [];
}
