// shared/ruleset.js — 규칙 모드: which of this remake's conveniences and rule changes a room's matches turn on (feat,
// maintainer decisions 2026-10-15, 2026-10-18). The official 卫戍协议 has none of them; a room picks a preset:
//
//   classic (经典)  every option at its official value — the official mode as it was
//   casual  (休闲)  the conveniences on: the briefing's battlefield card, its 重新抽取 vote, the boss route preview, and
//                   a relaxed 限伤 on leaders (a hit over the limit lands as the limit instead of being cancelled)
//   custom  (自定义) the room's host picks every setting (CUSTOM_OFFICIAL lists them); never in the public matchmaking
//                   (QUEUE_PRESETS): only for 独立模拟 and the rooms made with a code
//
// RULE_OPTIONS is the one table of the boolean options. Every option has its official value and its casual value; the
// classic preset is derived from the official values, so a new option keeps classic official by construction. A custom
// ruleset reads its options from its settings (optionsOfCustom: each option has one settings field).
//
// The ruleset travels as { preset, options } (room.state.ruleset, m.public.ruleset) — a custom one also as `custom`, its
// settings as sanitizeCustom returns them; options always holds every key. Who reads which option (`scope`):
//   ui     the client only (public/js/screens/briefing.js: battlefieldInfo)
//   match  the server's match flow (server/match/match/phases.js infoReroll, views.js bossRoutePreview)
//   sim    a battle spec flag (simRuleFlags → spec.flags, read by server/sim; set only when it differs from the official
//          value, so a classic battle's spec stays what it was)
// The custom settings beyond the four options are carried and kept (room, match, drain hand-over) but not read yet: the
// match flow and the battles take them in later steps. docs/rules/ui.md 「규칙 모드」 has the rules and their evidence.

import { N_ } from './i18n.js';
import { BOSS_HIT_LIMIT } from './constants.js';

/**
 * `note` = one line for players who do not know the rule (the switch's tooltip; `{n}` = the option's `noteN`).
 * @typedef {{ official: boolean, casual: boolean, scope: 'ui'|'match'|'sim', label: string, flag?: string, note?: string, noteN?: number }} RuleOption
 * @type {Readonly<Record<string, Readonly<RuleOption>>>}
 */
export const RULE_OPTIONS = Object.freeze({
  // the briefing's battlefield card (name, pool and preview picture); the official stage-info view has none
  // (client AutoChessStageInfoGroupViewModel.Input: no stage field) — classic shows the 「未知战场」 card instead
  battlefieldInfo: Object.freeze({ official: false, casual: true, scope: 'ui', label: N_('战场信息') }),
  // the briefing's 重新抽取 vote (server/match/match/phases.js voteReroll); the official briefing has no such button
  infoReroll: Object.freeze({ official: false, casual: true, scope: 'match', label: N_('重新抽取') }),
  // the walking leader's route in the boss rounds' prep (server/match/bossPath.js); not in the official game
  bossRoutePreview: Object.freeze({ official: false, casual: true, scope: 'match', label: N_('移动型领袖路线预览') }),
  // 限伤: a hit of ≥ BOSS_HIT_LIMIT on a leader in a boss battle is cancelled (server/sim/damage.js leaderHitLimit); this
  // option lands it as BOSS_HIT_LIMIT instead, which the official game never does
  bossHitClamp: Object.freeze({ official: false, casual: true, scope: 'sim', label: N_('领袖限伤放宽'), flag: 'bossHitClamp',
    note: N_('对敌方领袖单次造成 {n} 以上的伤害在官方规则下整个无效，放宽后按 {n} 计算'), noteN: BOSS_HIT_LIMIT }),
});

/** The presets of the 规则 switch, in menu order. */
export const RULE_PRESETS = Object.freeze(['classic', 'casual', 'custom']);

/** The presets of the public matchmaking (server/matchmaking.js): custom never queues (maintainer decision 2026-10-18). */
export const QUEUE_PRESETS = Object.freeze(['classic', 'casual']);

/** A room's preset before anyone picks one, and the ruleset of a match given none (tests, tools, the golden corpus). */
export const DEFAULT_PRESET = 'classic';

/** The presets' names (player-facing, through t()). */
export const PRESET_LABELS = Object.freeze({ classic: N_('经典'), casual: N_('休闲'), custom: N_('自定义') });

/** @param {unknown} v */
export const isRulePreset = (v) => typeof v === 'string' && RULE_PRESETS.includes(v);

/** @param {unknown} v */
export const isQueuePreset = (v) => typeof v === 'string' && QUEUE_PRESETS.includes(v);

// ---- custom settings ---------------------------------------------------------------------------------------------

/** The settings' format version (the stored presets and the share codes carry it; sanitizeCustom reads older ones). */
export const CUSTOM_VERSION = 1;

/** The largest custom settings object the wire takes (JSON length; protocol.js isCustomWire). */
export const CUSTOM_MAX_JSON = 4096;

/**
 * The ranges of the numeric settings (maintainer decisions 2026-10-18). The bond
 * ban counts keep the official range (config.json bans: 0–3 core, 0–4 add-on).
 */
export const CUSTOM_LIMITS = Object.freeze({
  pct: Object.freeze([10, 1000]),
  banCore: Object.freeze([0, 3]),
  banAddon: Object.freeze([0, 4]),
  rounds: Object.freeze([6, 20]),
  prepSec: Object.freeze([30, 600]),
  hitLimit: Object.freeze([100000, 5000000]),
  /** list / map sizes: far above the data's 23 bonds, 10 leaders and 11 stages */
  ids: 48,
});

/** The rise of the enemy stats from round to round: the mode's official curve, or one shaped from it. */
export const CUSTOM_CURVES = Object.freeze(['official', 'gentle', 'steep', 'flat']);
/** What a hit of the limit or more on a leader does: cancelled (official), lands as the limit, no limit. */
export const CUSTOM_HIT_MODES = Object.freeze(['void', 'clamp', 'none']);
/** The prep length (co-op only): official, ×1.5, ×2, or a fixed number of seconds (`prepSec`). */
export const CUSTOM_PREP_MODES = Object.freeze(['official', 'x1.5', 'x2', 'fixed']);
/** A bond's setting: random (absent: left to the draw), always banned (official absence), never drawn. */
export const CUSTOM_BOND_PICKS = Object.freeze(['ban', 'allow']);

/**
 * Every custom setting at its official value. `null` = the difficulty's own value (the bond ban counts, the round count).
 *   bonds    banCore / banAddon: bonds drawn absent each match · noLayerCap: no 999-layer cap · pick: { bondId: 'ban'|'allow' }
 *   enemies  normal enemies (特训 enemies, escorts, parts too): percent of hp / atk / def / res / speed · curve
 *   leaders  the leaders of 最终攻势 / 隐秘核心 and their summons: percent of hp (the shared pool) / atk / def / res
 *   bosses   ban: leader ids never drawn (one of each group stays) · hitMode / hitLimit: 限伤
 *   stages   info: the briefing's battlefield card · reroll: its 重新抽取 vote · ban: stage ids never drawn (one stays)
 *   flow     rounds · prep / prepSec · lpCapOff: no 10-per-round cap · lpShared: one 目标生命值 for the
 *            alliance in every round · routePreview: the walking leader's route
 */
export const CUSTOM_OFFICIAL = deepFreeze({
  v: CUSTOM_VERSION,
  bonds: { banCore: null, banAddon: null, noLayerCap: false, pick: {} },
  enemies: { hp: 100, atk: 100, def: 100, res: 100, speed: 100, curve: 'official' },
  leaders: { hp: 100, atk: 100, def: 100, res: 100 },
  bosses: { ban: [], hitMode: 'void', hitLimit: BOSS_HIT_LIMIT },
  stages: { info: false, reroll: false, ban: [] },
  flow: { rounds: null, prep: 'official', prepSec: 90, lpCapOff: false, lpShared: false, routePreview: false },
});

/** The settings field of each boolean option (the custom ruleset's options are read from them). */
const OPTION_FIELDS = Object.freeze({
  battlefieldInfo: (c) => c.stages.info,
  infoReroll: (c) => c.stages.reroll,
  bossRoutePreview: (c) => c.flow.routePreview,
  bossHitClamp: (c) => c.bosses.hitMode === 'clamp',
});

/** The custom settings of the casual preset: the official ones with the casual conveniences (the dialog's 休闲 reset). */
export const CUSTOM_CASUAL = deepFreeze({
  ...CUSTOM_OFFICIAL,
  bosses: { ...CUSTOM_OFFICIAL.bosses, hitMode: 'clamp' },
  stages: { ...CUSTOM_OFFICIAL.stages, info: true, reroll: true },
  flow: { ...CUSTOM_OFFICIAL.flow, routePreview: true },
});

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isIdStr = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9_\-.]+$/.test(v);
/** @param {any} v @param {readonly number[]} range @param {any} dflt */
const intIn = (v, range, dflt) => (Number.isFinite(v) ? Math.min(range[1], Math.max(range[0], Math.round(v))) : dflt);
/** @param {any} v @param {readonly number[]} range */
const intOrNull = (v, range) => (v === null || v === undefined || !Number.isFinite(v) ? null : intIn(v, range, null));
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
const bool = (v, dflt) => (typeof v === 'boolean' ? v : dflt);
const idList = (v) => (Array.isArray(v) ? [...new Set(v.filter(isIdStr))].sort().slice(0, CUSTOM_LIMITS.ids) : []);

/**
 * Custom settings as a match may use them: every field present, each number rounded into its range, unknown values at
 * their official default, unknown keys dropped, the id lists deduplicated and sorted (so equal settings serialize the
 * same: sameRuleset). Ids are only checked for their form here — the match keeps those its data knows. Never throws.
 * @param {unknown} raw
 * @returns {Readonly<typeof CUSTOM_OFFICIAL>} a new frozen object
 */
export function sanitizeCustom(raw) {
  const r = isObj(raw) ? /** @type {any} */ (raw) : {};
  const sec = (k) => (isObj(r[k]) ? r[k] : {});
  const O = CUSTOM_OFFICIAL;
  const b = sec('bonds'), e = sec('enemies'), l = sec('leaders'), bo = sec('bosses'), s = sec('stages'), f = sec('flow');
  const pct = (v, d) => intIn(v, CUSTOM_LIMITS.pct, d);
  const pick = {};
  if (isObj(b.pick)) {
    for (const k of Object.keys(b.pick).filter(isIdStr).sort().slice(0, CUSTOM_LIMITS.ids)) {
      if (CUSTOM_BOND_PICKS.includes(b.pick[k])) pick[k] = b.pick[k];
    }
  }
  return deepFreeze({
    v: CUSTOM_VERSION,
    bonds: {
      banCore: intOrNull(b.banCore, CUSTOM_LIMITS.banCore),
      banAddon: intOrNull(b.banAddon, CUSTOM_LIMITS.banAddon),
      noLayerCap: bool(b.noLayerCap, O.bonds.noLayerCap),
      pick,
    },
    enemies: {
      hp: pct(e.hp, 100), atk: pct(e.atk, 100), def: pct(e.def, 100), res: pct(e.res, 100), speed: pct(e.speed, 100),
      curve: oneOf(e.curve, CUSTOM_CURVES, O.enemies.curve),
    },
    leaders: { hp: pct(l.hp, 100), atk: pct(l.atk, 100), def: pct(l.def, 100), res: pct(l.res, 100) },
    bosses: {
      ban: idList(bo.ban),
      hitMode: oneOf(bo.hitMode, CUSTOM_HIT_MODES, O.bosses.hitMode),
      hitLimit: intIn(bo.hitLimit, CUSTOM_LIMITS.hitLimit, O.bosses.hitLimit),
    },
    stages: { info: bool(s.info, O.stages.info), reroll: bool(s.reroll, O.stages.reroll), ban: idList(s.ban) },
    flow: {
      rounds: intOrNull(f.rounds, CUSTOM_LIMITS.rounds),
      prep: oneOf(f.prep, CUSTOM_PREP_MODES, O.flow.prep),
      prepSec: intIn(f.prepSec, CUSTOM_LIMITS.prepSec, O.flow.prepSec),
      lpCapOff: bool(f.lpCapOff, O.flow.lpCapOff),
      lpShared: bool(f.lpShared, O.flow.lpShared),
      routePreview: bool(f.routePreview, O.flow.routePreview),
    },
  });
}

/** The boolean options of custom settings. @param {Readonly<typeof CUSTOM_OFFICIAL>} c */
export function optionsOfCustom(c) {
  return Object.freeze(Object.fromEntries(Object.keys(RULE_OPTIONS).map((k) => [k, !!OPTION_FIELDS[k](c)])));
}

/**
 * The settings that differ from the official ones, as dotted paths grouped by the dialog's tab (`bonds.banCore`,
 * `bonds.pick.yanShip`, `bosses.ban.boss_5` …: one per bond, leader and stage). `base` gives the difficulty's own values
 * of the `null` fields (bans { core, addon }, rounds): an explicit value equal to them is no difference.
 * @param {unknown} raw
 * @param {{ bans?: { core?: number, addon?: number } | null, rounds?: number | null }} [base]
 * @returns {string[]}
 */
export function customDiffs(raw, base = {}) {
  const c = sanitizeCustom(raw);
  const O = CUSTOM_OFFICIAL;
  const out = [];
  const same = (v, dflt) => v === null || (dflt != null && v === dflt);
  if (!same(c.bonds.banCore, base.bans?.core)) out.push('bonds.banCore');
  if (!same(c.bonds.banAddon, base.bans?.addon)) out.push('bonds.banAddon');
  if (c.bonds.noLayerCap !== O.bonds.noLayerCap) out.push('bonds.noLayerCap');
  for (const k of Object.keys(c.bonds.pick)) out.push(`bonds.pick.${k}`);
  for (const sec of ['enemies', 'leaders']) {
    for (const [k, v] of Object.entries(c[sec])) if (v !== O[sec][k]) out.push(`${sec}.${k}`);
  }
  for (const id of c.bosses.ban) out.push(`bosses.ban.${id}`);
  if (c.bosses.hitMode !== O.bosses.hitMode) out.push('bosses.hitMode');
  if (c.bosses.hitMode !== 'none' && c.bosses.hitLimit !== O.bosses.hitLimit) out.push('bosses.hitLimit');
  if (c.stages.info !== O.stages.info) out.push('stages.info');
  if (c.stages.reroll !== O.stages.reroll) out.push('stages.reroll');
  for (const id of c.stages.ban) out.push(`stages.ban.${id}`);
  if (!same(c.flow.rounds, base.rounds)) out.push('flow.rounds');
  if (c.flow.prep !== O.flow.prep) out.push('flow.prep');
  for (const k of ['lpCapOff', 'lpShared', 'routePreview']) if (c.flow[k] !== O.flow[k]) out.push(`flow.${k}`);
  return out;
}

// ---- the custom round plan and stat curve -----------------------------------------------------------------------

/**
 * The step count of an enemy stat in a round under a curve: the mode's official step `k` (hp ×1.2^k, atk ×1.1^k —
 * tools/build-data.mjs enemyScaleFor), or one shaped from it around round 1's `k1` — gentle half the rise, steep one and
 * a half times it, flat none [ASSUMED: the shapes are this remake's, maintainer decision 2026-10-18 named them only].
 * @param {number} k @param {number} k1 @param {string} curve
 */
export function curveStep(k, k1, curve) {
  if (curve === 'gentle') return k1 + (k - k1) * 0.5;
  if (curve === 'steep') return k1 + (k - k1) * 1.5;
  if (curve === 'flat') return k1;
  return k;
}

/**
 * The rounds of a custom round count: for each round 1..n its `src` (the official round whose waves, timers and
 * stat steps it uses) and `kind` — 'normal', 'sp' (a 机变 round), 'ext' (an added round), 'boss' (最终攻势, always the
 * last) — and `kHp` / `kAtk`, the official stat steps it takes; `hidden` = the 隐秘核心 after it (src = the mode's), or
 * null. Fewer rounds drop normal rounds from the middle, first those whose stat steps another kept round has (the 机变
 * rounds, round 1 and the final assault stay); more rounds keep 1..last−1 and add rounds that cycle the three late waves
 * before the final assault (last−3..last−1), their steps rising on from the last of them by the slope of those three
 * [ASSUMED], the final assault and the hidden core rising as much.
 * @param {{ lastRound: number, hiddenRound?: number | null, spRounds?: number[], enemyScale?: Record<string, { kHp?: number, kAtk?: number }> }} mode
 * @param {number | null} [n] the custom count (null = the mode's)
 * @returns {{ rounds: { src: number, kind: 'normal'|'sp'|'ext'|'boss', kHp: number, kAtk: number }[], hidden: { src: number, kHp: number, kAtk: number } | null }}
 */
export function customRoundPlan(mode, n = null) {
  const last = Number.isInteger(mode?.lastRound) && mode.lastRound > 0 ? mode.lastRound : 14;
  const sp = new Set((Array.isArray(mode?.spRounds) ? mode.spRounds : []).filter(Number.isInteger));
  const steps = (r) => {
    const e = mode?.enemyScale?.[r];
    return { kHp: Number.isFinite(e?.kHp) ? e.kHp : 0, kAtk: Number.isFinite(e?.kAtk) ? e.kAtk : 0 };
  };
  const want = Number.isInteger(n) ? n : last;
  /** @type {(r: number) => 'normal'|'sp'|'boss'} */
  const kindOf = (r) => (r === last ? 'boss' : sp.has(r) ? 'sp' : 'normal');
  /** @type {{ src: number, kind: 'normal'|'sp'|'ext'|'boss', kHp: number, kAtk: number }[]} */
  let list = [];
  let lift = { kHp: 0, kAtk: 0 };
  if (want <= last) {
    const kept = Array.from({ length: last }, (_, i) => i + 1);
    const mid = (last + 1) / 2;
    const key = (r) => { const s = steps(r); return `${s.kHp}/${s.kAtk}`; };
    while (kept.length > Math.max(1, want)) {
      const removable = kept.filter((r) => kindOf(r) === 'normal' && r !== 1);
      if (!removable.length) break;
      const dup = removable.filter((r) => kept.some((o) => o !== r && key(o) === key(r)));
      const pool = dup.length ? dup : removable;
      pool.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
      kept.splice(kept.indexOf(pool[0]), 1);
    }
    list = kept.map((r) => ({ src: r, kind: kindOf(r), ...steps(r) }));
  } else {
    for (let r = 1; r < last; r++) list.push({ src: r, kind: kindOf(r), ...steps(r) });
    const late = [last - 3, last - 2, last - 1].filter((r) => r >= 1);
    const a = steps(late[0] ?? 1), b = steps(late[late.length - 1] ?? 1);
    const per = late.length > 1 ? { kHp: (b.kHp - a.kHp) / (late.length - 1), kAtk: (b.kAtk - a.kAtk) / (late.length - 1) } : { kHp: 0, kAtk: 0 };
    const extra = want - last;
    for (let i = 1; i <= extra; i++) {
      list.push({ src: late[(i - 1) % late.length], kind: 'ext', kHp: b.kHp + per.kHp * i, kAtk: b.kAtk + per.kAtk * i });
    }
    lift = { kHp: per.kHp * extra, kAtk: per.kAtk * extra };
    const s = steps(last);
    list.push({ src: last, kind: 'boss', kHp: s.kHp + lift.kHp, kAtk: s.kAtk + lift.kAtk });
  }
  const h = Number.isInteger(mode?.hiddenRound) ? mode.hiddenRound : null;
  const hs = h ? steps(h) : null;
  return { rounds: list, hidden: h ? { src: h, kHp: hs.kHp + lift.kHp, kAtk: hs.kAtk + lift.kAtk } : null };
}

// ---- resolution --------------------------------------------------------------------------------------------------

/** @typedef {{ preset: string, options: Readonly<Record<string, boolean>>, custom?: Readonly<typeof CUSTOM_OFFICIAL> }} Ruleset */

const PRESET_RULESETS = Object.freeze(Object.fromEntries(QUEUE_PRESETS.map((preset) => {
  const pick = preset === 'casual' ? 'casual' : 'official';
  const options = Object.freeze(Object.fromEntries(Object.entries(RULE_OPTIONS).map(([k, o]) => [k, o[pick]])));
  return [preset, Object.freeze({ preset, options })];
})));

/** The custom rulesets resolveRuleset made (returned as they are when they come back). */
const resolvedCustom = new WeakSet();

/** @param {unknown} custom @returns {Ruleset} */
function customRuleset(custom) {
  const c = sanitizeCustom(custom);
  const rs = Object.freeze({ preset: 'custom', options: optionsOfCustom(c), custom: c });
  resolvedCustom.add(rs);
  return rs;
}

/**
 * The frozen ruleset of a preset name or a { preset, custom? } object; anything else (missing, unknown, malformed) is
 * the default preset. 'custom' takes its settings from `custom` (sanitizeCustom; none = every official value).
 * @param {unknown} v
 * @returns {Ruleset}
 */
export function resolveRuleset(v) {
  if (v && typeof v === 'object' && resolvedCustom.has(v)) return /** @type {Ruleset} */ (v);
  const preset = typeof v === 'string' ? v : v && typeof v === 'object' ? /** @type {any} */ (v).preset : null;
  if (preset === 'custom') return customRuleset(v && typeof v === 'object' ? /** @type {any} */ (v).custom : null);
  return PRESET_RULESETS[isQueuePreset(preset) ? preset : DEFAULT_PRESET];
}

/** Whether two rulesets are the same (preset and, for custom, every setting). @param {unknown} a @param {unknown} b */
export function sameRuleset(a, b) {
  const x = resolveRuleset(a), y = resolveRuleset(b);
  if (x === y) return true;
  return x.preset === y.preset && JSON.stringify(x.custom ?? null) === JSON.stringify(y.custom ?? null);
}

/** The wire form of a ruleset (room.create / room.setRuleset fields, the drain hand-over): { preset, custom? }. */
export function rulesetWire(rs) {
  const r = resolveRuleset(rs);
  return r.custom ? { preset: r.preset, custom: r.custom } : { preset: r.preset };
}

/**
 * The key a ruleset is counted under: the matchmaking queues (server/matchmaking.js, classic / casual only — custom
 * never queues) and the stats records (public/js/ui/stats.js: custom matches count apart, maintainer decision 2026-10-18).
 */
export const rulesetKey = (rs) => resolveRuleset(rs).preset;

/**
 * The battle spec flags of a ruleset's `sim` options: only those that differ from the official value, so a classic
 * battle's spec (and its golden digest) is unchanged.
 * @param {unknown} rs
 * @returns {Record<string, true>}
 */
export function simRuleFlags(rs) {
  const { options } = resolveRuleset(rs);
  /** @type {Record<string, true>} */
  const flags = {};
  for (const [k, o] of Object.entries(RULE_OPTIONS)) {
    if (o.scope === 'sim' && o.flag && options[k] !== o.official) flags[o.flag] = true;
  }
  return flags;
}
