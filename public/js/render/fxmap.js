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

// ---- 丰川祥子's notes (kits/ops/op-oblvns.js NOTE; battle.fx 'oblvnsNote', local patch 2026-10-06) ----------------------------
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
//   attach: [[names]…], castOpt?: [{ name: { s, e, o, d?, once? } }…] (castTiming), shotFrom?: [MountPointType|null…] (the
//   shot's start point when not MUZZLE), attachFoe?: [[names]…] + attachFoeMax?: { name: n } (foeEffects) }
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

/**
 * (2026-10-10, maintainer report: 号角's blocked enemies got her ranged blast) a 要塞 mode's `role` ('cast' / 'hit')
 * effects of one attack, extracted only: modes.json `fortress[n]` (char_modes.py: the charpack's MeleeAttack /
 * BlockedMeleeAttack abilities vs its RangedAttack, + that one's projectile hit) — the melee list for an attack of
 * projectile kind 'none' (the sim's 'swing' / 'atk' while the operator blocks), the ranged one for any other kind.
 * null when mode `n` has no such split (or the kind is unknown): the caller uses the mode's whole list (boundEffects).
 * @param {any} bind modes.json entry
 * @param {string[]|null|undefined} prefabs
 * @param {number|null} n
 * @param {'cast'|'hit'} role
 * @param {string|null|undefined} kind
 */
export function fortressEffects(bind, prefabs, n, role, kind) {
  if (!bind || !Array.isArray(prefabs) || !Number.isInteger(n) || n < 0 || typeof kind !== 'string' || !kind) return null;
  const f = bind.fortress?.[n];
  if (!f) return null;
  const list = f[kind === 'none' ? 'melee' : 'ranged']?.[role];
  return Array.isArray(list) ? list.filter((x) => prefabs.includes(x)) : [];
}

/**
 * (2026-10-10, decompile check): the effects of mode `n`'s own buffs that sit on enemies (modes.json `attachFoe`:
 * the buff's ability targets enemies — `_targetOptions.targetSide` 2 or a `_selector` whose range selectors pick side 2), in
 * order, extracted only. A buff effect's owner is the unit holding the buff (client `Effect.Behaviour.owner`).
 * @param {any} bind modes.json entry
 * @param {string[]|null|undefined} prefabs
 * @param {number|null} n
 */
export function foeEffects(bind, prefabs, n) {
  if (!bind || !Array.isArray(prefabs) || !Number.isInteger(n) || n < 0) return [];
  const list = bind.attachFoe?.[n];
  return Array.isArray(list) ? list.filter((x) => prefabs.includes(x)) : [];
}

// ---- cast effect timing (2026-10-10, decompile check) ----------------------------------------------------------
// The client starts an attack's cast effect on its `_startEvent` and ends a loop one (`_oneshot` 0) on its `_endEvent`
// (`CastEffectOptions.OnEvent`, RVA 0xB17C80), on the ability's detach, or at the cast's finish (`OnCastFinish` 0xB17BD0).
// AbilityStandard.Event: 0 ON_ATTACHED, 1 ON_DETACHED, 2 ON_CAST_START — raised in `_DoCast` (0x3505E70) before the pre-delay
// wait, i.e. as the swing starts —, 3 ON_CAST_END, 4 ON_SPELL_ON (the strike), 5 ON_SPELL_END, 6 ON_ATTACK_FINISH, 7
// ON_ATTACK_CHECK_POINT, 8 ON_OVERLOAD. modes.json `castOpt[mode][name]` = { s: start, e: end, o: oneshot, d?: delay of the
// first attack (s, ÷ the ability's playback speed), once?: once per cast }.
export const CAST_EVENT = Object.freeze({ ATTACHED: 0, DETACHED: 1, CAST_START: 2, CAST_END: 3, SPELL_ON: 4, SPELL_END: 5, ATTACK_FINISH: 6 });
/**
 * The timing of cast effect `name` of mode `n` (modes.json castOpt), or null when the entry carries none (an older
 * modes.json: every cast effect then plays at the strike, as before).
 * @param {any} bind
 * @param {number|null} n
 * @param {string} name
 * @returns {{ s: number, e: number, o: number, d?: number, once?: number }|null}
 */
export function castTiming(bind, n, name) {
  const m = Number.isInteger(n) && n >= 0 ? bind?.castOpt?.[n] : null;
  const o = m && typeof m === 'object' ? m[name] : null;
  return o && typeof o === 'object' && Number.isInteger(o.s) ? o : null;
}
/**
 * Which moment of an attack a cast effect starts at: 'swing' (ON_CAST_START: as its swing starts — the sim's 'swing'
 * event) or 'strike' (ON_SPELL_ON / ON_SPELL_END …: the 'atk' event). Without a timing (older modes.json) 'strike'.
 * @param {{ s: number }|null} opt
 * @returns {'swing'|'strike'}
 */
export const castPhase = (opt) => (opt && opt.s === CAST_EVENT.CAST_START ? 'swing' : 'strike');

// ---- a skill activation's effects (local patch, maintainer report 2026-10-07, 11 items) ------------------------------------------
// modes.json[charId].skills[i] = { cast, castLoop, buff, target, targetBuff, end?: { cast, hit }, zone?: { fx, aura, onProj } } — the skill's own effects
// (char_modes.py from battle/prefabs/[uc]skills.ab); turn = the prefabs the client turns to the unit's facing.

/**
 * What a skill activation plays on the caster: `start` once (each until its prefab ends), `loops` while the skill lasts —
 * the name mapping (effectsFor) ∪ the skill's own effects, minus
 *  - a prefab the operator's modes bind as an attack's cast / hit / trail: that attack's (수르트 S3's range is its hit on the
 *    target, 무에나 S3's range_01 the cast of each attack — 85d83c89's `_range` rule played them on the caster once more),
 *  - a prefab the skill puts on its targets or plays at its end (德克萨斯 S2's falling sword, 戴菲恩 S3's finisher pieces),
 *  - `kitOwned`: prefabs a kit event draws instead (余 S3's wall piece);
 * a prefab the skill itself casts plays once (start), not as a loop.
 * A skill mode with bound cast effects plays those on every attack, not here.
 * @param {any} bind modes.json entry (or null)
 * @param {string[]} prefabs the operator's extracted prefabs
 * @param {number} skillIndex 0-based
 * @param {Set<string>} [kitOwned]
 */
export function activationEffects(bind, prefabs, skillIndex, kitOwned = new Set()) {
  const pre = prefabs || [];
  const n = attackMode(bind, true, skillIndex) ?? -1;
  const sk = bind?.skills?.[skillIndex] || null;
  const has = (list) => (Array.isArray(list) ? list.filter((x) => pre.includes(x)) : []);
  const modeOwn = new Set(['cast', 'hit', 'trail'].flatMap((r) => (bind?.[r] || []).flat()));
  // (2026-10-10) the effects of its projectile's lasting reach / aura (`zone`: 쏜즈 더 로드스타's token / range) sit at that
  // projectile — render/fxgame.js zoneFx; 85d83c89's `_range` name rule put thorn2_skill_02_range on her for the whole battle
  const notCaster = new Set([...(sk?.target || []), ...(sk?.targetBuff || []), ...(sk?.end?.cast || []), ...(sk?.end?.hit || []),
    ...(sk?.zone?.fx || []), ...(sk?.zone?.aura || [])]);
  // (2026-10-10) a mode buff whose ability selects enemies (`attachFoe`: 아스트젠 더 라이트체이서 S3's link) is on the enemy, not here
  const foe = new Set(foeEffects(bind, pre, n));
  const keep = (x) => !modeOwn.has(x) && !notCaster.has(x) && !kitOwned.has(x) && !foe.has(x);
  // a prefab the skill casts (`_castEffects`, ending with its cast) is not a loop for the whole skill even if named _buff / _range
  const cast = new Set([...(sk?.cast || []), ...(sk?.castLoop || [])]);
  const loops = [...new Set([...effectsFor(pre, 'skillBuff', skillIndex).filter((x) => keep(x) && !cast.has(x)), ...has(sk?.buff),
    ...boundEffects(bind, pre, n, 'attach').filter((x) => !foe.has(x))])];
  const modeCast = boundEffects(bind, pre, n, 'cast');
  const start = [...new Set([...(modeCast.length ? [] : effectsFor(pre, 'skillStart', skillIndex)), ...has(sk?.cast), ...has(sk?.castLoop)])]
    .filter((x) => keep(x) && !loops.includes(x));
  return { start, loops };
}
