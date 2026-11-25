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
// The match reads the custom settings through its GameData (server/match/gamedata.js: the round plan, the bans, the
// prep, the 目标生命值 rules, the layer cap, the enemy and leader stats, the shop pool sizes) and its battles through simRuleFlags (限伤, the
// layer cap). docs/rules/ui.md 「규칙 모드」 has the rules and their evidence.

import { N_ } from './i18n.js';
import { BOSS_HIT_LIMIT, LARGE_SEATS } from './constants.js';
import { seasonFeature } from './seasons.js';

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
 * The ranges of the numeric settings (maintainer decisions 2026-10-18). The bond ban counts keep the official range of
 * the season (customBanLimits: 盟约 0–3 core, 0–4 add-on; 规程 0–5 each); these two are the widest any season has, what
 * the wire takes.
 */
export const CUSTOM_LIMITS = Object.freeze({
  pct: Object.freeze([10, 1000]),
  banCore: Object.freeze([0, 5]),
  banAddon: Object.freeze([0, 5]),
  rounds: Object.freeze([6, 20]),
  prepSec: Object.freeze([30, 600]),
  hitLimit: Object.freeze([100000, 5000000]),
  /** 特训敌人 types per match: the 15 round slots hold five types of three (factions.json maxLevelCnt / types[].count) */
  types: Object.freeze([0, 5]),
  /** the enemies' rise per official stat step (enemies.stepHp / stepAtk), in hundredths: ×1.00 – ×2.00 */
  step: Object.freeze([100, 200]),
  /** list / map sizes: far above the data's 23 bonds, 10 leaders and 11 stages */
  ids: 48,
});

/**
 * The quick picks of the enemies' rise per step (the dialog's 快速选择, stepPreset): the power each puts on the mode's
 * official multiplier per step — gentle ¾, steep 1¼, flat none (round 1's stats the whole match) [ASSUMED·자료 없음: the shapes are
 * this remake's, maintainer decision 2026-10-18 named them only; the first powers ½ / 1½ were too far apart, maintainer
 * feedback the same day]. Since maintainer decision 2026-11-15 they only fill enemies.stepHp / stepAtk; settings saved
 * with the former `curve` field read as these (sanitizeCustom).
 */
/** @type {Readonly<Record<string, number>>} */
export const CUSTOM_STEP_PRESETS = Object.freeze({ gentle: 0.75, steep: 1.25, flat: 0 });
/** What a hit of the limit or more on a leader does: cancelled (official), lands as the limit, no limit. */
export const CUSTOM_HIT_MODES = Object.freeze(['void', 'clamp', 'none']);
/** The prep length (co-op only): official, ×1.5, ×2, or a fixed number of seconds (`prepSec`). */
export const CUSTOM_PREP_MODES = Object.freeze(['official', 'x1.5', 'x2', 'fixed']);
/** A bond's setting: random (absent: left to the draw), always banned (official absence), never drawn. */
export const CUSTOM_BOND_PICKS = Object.freeze(['ban', 'allow']);
/**
 * A 特训敌人 type's setting: random (absent: left to the draw), never drawn, always drawn; 'allow' joins another
 * season's type to the draw (shared/seasonBorrow.js — absent, such a type stays out).
 */
export const CUSTOM_TYPE_PICKS = Object.freeze(['ban', 'force', 'allow']);
/** The official number of 特训敌人 types a match draws (factions.json specialEnemyNum, both seasons). */
export const OFFICIAL_TYPE_COUNT = 3;

/**
 * Every custom setting at its official value. `null` = the difficulty's own value (the bond ban counts, the round count).
 *   bonds    banCore / banAddon: bonds drawn absent each match · noLayerCap: no 999-layer cap · pick: { bondId: 'ban'|'allow' }
 *   enemies  normal enemies (特训 enemies, escorts, parts too): percent of hp / atk / def / res / speed · stepHp /
 *            stepAtk: the multiplier per official stat step in hundredths, the leaders' too (null = the official one;
 *            stepScale)
 *   leaders  the leaders of 最终攻势 / 隐秘核心 and their summons: percent of hp (the shared pool) / atk / def / res
 *   types    the 特训敌人 types of the match (factions.json types with involveRandom): count — how many are drawn (null =
 *            the official 3) · pick: { type: 'ban'|'force'|'allow' } — never / always drawn, another season's
 *            type joining the draw (customEnemyTypes, shared/seasonBorrow.js)
 *   bosses   ban: leader ids never drawn (one of each group stays) · hitMode / hitLimit: 限伤
 *   stages   info: the briefing's battlefield card · reroll: its 重新抽取 vote · firstHalf: the 上半 stages of
 *            CUSTOM_FIRST_HALF_STAGES join the pool · ban: stage ids never drawn (one stays) · extra: other
 *            seasons' stages joining the pool (shared/seasonBorrow.js)
 *   flow     rounds · prep / prepSec · lpCapOff: no 10-per-round cap · lpShared: one 目标生命值 for the
 *            alliance in every round · routePreview: the walking leader's route · bandDup: teammates may pick the
 *            same strategy (the official draft marks a teammate's pick 队友已选 and refuses it; co-op only — GameData.bandDup)
 *   pool     chess / items: percent of the shared chess pool's copies and of the shop equipment stock (customPoolCount)
 */
/** @type {CustomSettings} */
export const CUSTOM_OFFICIAL = deepFreeze({
  v: CUSTOM_VERSION,
  bonds: { banCore: null, banAddon: null, noLayerCap: false, pick: {} },
  enemies: { hp: 100, atk: 100, def: 100, res: 100, speed: 100, stepHp: null, stepAtk: null },
  leaders: { hp: 100, atk: 100, def: 100, res: 100 },
  types: { count: null, pick: {} },
  bosses: { ban: [], hitMode: 'void', hitLimit: BOSS_HIT_LIMIT },
  stages: { info: false, reroll: false, firstHalf: false, ban: [], extra: [] },
  flow: { rounds: null, prep: 'official', prepSec: 90, lpCapOff: false, lpShared: false, routePreview: false, bandDup: false },
  pool: { chess: 100, items: 100 },
});

/**
 * Custom settings, every field present (sanitizeCustom; the fields above).
 * @typedef {{
 *   v: number,
 *   bonds: { banCore: number|null, banAddon: number|null, noLayerCap: boolean, pick: Record<string, string> },
 *   enemies: { hp: number, atk: number, def: number, res: number, speed: number, stepHp: number|null, stepAtk: number|null },
 *   leaders: { hp: number, atk: number, def: number, res: number },
 *   types: { count: number|null, pick: Record<string, string> },
 *   bosses: { ban: string[], hitMode: string, hitLimit: number },
 *   stages: { info: boolean, reroll: boolean, firstHalf: boolean, ban: string[], extra: string[] },
 *   flow: { rounds: number|null, prep: string, prepSec: number, lpCapOff: boolean, lpShared: boolean, routePreview: boolean, bandDup: boolean },
 *   pool: { chess: number, items: number },
 * }} CustomSettings
 */

/** The settings field of each boolean option (the custom ruleset's options are read from them). */
/** @type {Readonly<Record<string, (c: CustomSettings) => boolean>>} */
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

/** @template T @param {T} o @returns {T} */
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isIdStr = (/** @type {unknown} */ v) => typeof v === 'string' && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9_\-.]+$/.test(v);
/** @template {number | null} D @param {unknown} v @param {readonly number[]} range @param {D} dflt @returns {number | D} */
const intIn = (v, range, dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(range[1], Math.max(range[0], Math.round(v))) : dflt);
/** @param {unknown} v @param {readonly number[]} range */
const intOrNull = (v, range) => (typeof v !== 'number' || !Number.isFinite(v) ? null : intIn(v, range, null));
/** @template T @param {unknown} v @param {readonly T[]} list @param {T} dflt @returns {T} */
const oneOf = (v, list, dflt) => (/** @type {readonly unknown[]} */ (list).includes(v) ? /** @type {T} */ (v) : dflt);
/** @template T @param {unknown} v @param {T} dflt */
const bool = (v, dflt) => (typeof v === 'boolean' ? v : dflt);
const idList = (/** @type {unknown} */ v) => (Array.isArray(v) ? [...new Set(v.filter(isIdStr))].sort().slice(0, CUSTOM_LIMITS.ids) : []);

/**
 * Custom settings as a match may use them: every field present, each number rounded into its range, unknown values at
 * their official default, unknown keys dropped, the id lists deduplicated and sorted (so equal settings serialize the
 * same: sameRuleset). Ids are only checked for their form here — the match keeps those its data knows. Never throws.
 * @param {unknown} raw
 * @returns {Readonly<typeof CUSTOM_OFFICIAL>} a new frozen object
 */
export function sanitizeCustom(raw) {
  /** @type {Record<string, unknown>} */
  const r = isObj(raw) ? raw : {};
  /** @param {string} k @returns {Record<string, unknown>} */
  const sec = (k) => { const v = r[k]; return isObj(v) ? v : {}; };
  const O = CUSTOM_OFFICIAL;
  const b = sec('bonds'), e = sec('enemies'), l = sec('leaders'), ty = sec('types'), bo = sec('bosses'), s = sec('stages'), f = sec('flow'), p = sec('pool');
  const pct = (/** @type {unknown} */ v, /** @type {number} */ d) => intIn(v, CUSTOM_LIMITS.pct, d);
  /** @param {unknown} m @param {readonly string[]} list */
  const picks = (m, list) => {
    /** @type {Record<string, string>} */
    const out = {};
    if (isObj(m)) for (const k of Object.keys(m).filter(isIdStr).sort().slice(0, CUSTOM_LIMITS.ids)) { const v = m[k]; if (typeof v === 'string' && list.includes(v)) out[k] = v; }
    return out;
  };
  const pick = picks(b.pick, CUSTOM_BOND_PICKS);
  // the former `curve` field (settings saved before maintainer decision 2026-11-15): a shaped curve reads as its quick
  // pick at the 盟约 steps (stepPreset without a mode), 'step' / 'official' as the multipliers given
  const legacy = typeof e.curve === 'string' && Object.hasOwn(CUSTOM_STEP_PRESETS, e.curve) ? stepPreset(null, e.curve) : null;
  const steps = e.curve === 'official' ? { stepHp: null, stepAtk: null } : legacy ?? e;
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
      stepHp: intOrNull(steps.stepHp, CUSTOM_LIMITS.step),
      stepAtk: intOrNull(steps.stepAtk, CUSTOM_LIMITS.step),
    },
    leaders: { hp: pct(l.hp, 100), atk: pct(l.atk, 100), def: pct(l.def, 100), res: pct(l.res, 100) },
    types: { count: intOrNull(ty.count, CUSTOM_LIMITS.types), pick: picks(ty.pick, CUSTOM_TYPE_PICKS) },
    bosses: {
      ban: idList(bo.ban),
      hitMode: oneOf(bo.hitMode, CUSTOM_HIT_MODES, O.bosses.hitMode),
      hitLimit: intIn(bo.hitLimit, CUSTOM_LIMITS.hitLimit, O.bosses.hitLimit),
    },
    stages: {
      info: bool(s.info, O.stages.info), reroll: bool(s.reroll, O.stages.reroll), firstHalf: bool(s.firstHalf, O.stages.firstHalf),
      ban: idList(s.ban), extra: idList(s.extra),
    },
    flow: {
      rounds: intOrNull(f.rounds, CUSTOM_LIMITS.rounds),
      prep: oneOf(f.prep, CUSTOM_PREP_MODES, O.flow.prep),
      prepSec: intIn(f.prepSec, CUSTOM_LIMITS.prepSec, O.flow.prepSec),
      lpCapOff: bool(f.lpCapOff, O.flow.lpCapOff),
      lpShared: bool(f.lpShared, O.flow.lpShared),
      routePreview: bool(f.routePreview, O.flow.routePreview),
      bandDup: bool(f.bandDup, O.flow.bandDup),
    },
    pool: { chess: pct(p.chess, 100), items: pct(p.items, 100) },
  });
}

/**
 * The entries of `list` a custom ban list leaves (stages, the leaders of one group), or `list` itself when the bans would
 * leave none (the settings dialog keeps one; a hand-made code may not). Filtering a weighted list keeps its one draw.
 * @template T @param {T[]} list @param {(x: T) => string} idOf @param {readonly string[] | null | undefined} ban
 * @returns {T[]}
 */
export function keepUnbanned(list, idOf, ban) {
  if (!ban || !ban.length) return list;
  const kept = list.filter((x) => !ban.includes(idOf(x)));
  return kept.length ? kept : list;
}

/**
 * The 规程 band-skill effects that act on the player's own 目标生命值 against the other players' (server/sim/content/bands/
 * meta.js: 信仰搅拌机 献身护卫 `skill_drop_hp_to_low_gain_coin` — refused while the alliance shares one 目标生命值).
 */
export const OWN_LP_BAND_SKILLS = Object.freeze(['skill_drop_hp_to_low_gain_coin']);

/**
 * Whether the custom 「所有回合共享目标生命值」 (flow.lpShared, never solo) leaves a strategy out of the draft: one whose
 * band skill (bands.json `skills[].buffs[].key`) is an OWN_LP_BAND_SKILLS effect would do nothing the whole match — the
 * pool is merged right after the draft (maintainer decision 2026-11-21). The server's GameData.bandAllowed and the
 * client's allowedBands both ask this.
 * @param {{ skills?: unknown } | null | undefined} band a bands.json record
 * @param {boolean} lpShared the match shares one 目标生命值 in every round
 */
export function lpSharedBandOff(band, lpShared) {
  if (!lpShared || !band || !Array.isArray(band.skills)) return false;
  return band.skills.some((/** @type {{ buffs?: Array<{ key?: string } | null> } | null} */ s) => Array.isArray(s?.buffs) && s.buffs.some((b) => OWN_LP_BAND_SKILLS.includes(/** @type {string} */ (b?.key))));
}

/**
 * The 特训敌人 types a custom match draws from the season's `random` ones (factions.json types with involveRandom, sorted)
 * and the `borrowed` ones (other seasons' types its settings pick 'allow' / 'force': shared/seasonBorrow.js, sorted):
 * every 'force' type, then the rest of the count from the types left to the draw, shuffled with `shuffle` (the match's
 * setup rng) — no 'ban' type. The count is the setting's (null: `n`, the official 3), raised to the forced types, at
 * most CUSTOM_LIMITS.types[1] (the 15 round slots); fewer types than the count leave more rounds to 特训敌人·特异 (the
 * schedule fills them: server/match/waves.js makeTypeSchedule). Returns null while the settings change nothing, so the
 * official draw — and its rng stream — stays as it was.
 * @param {readonly string[]} random @param {number} n @param {{ types?: { count?: unknown, pick?: unknown } } | null | undefined} custom
 * @param {(list: string[]) => void} shuffle
 * @param {readonly string[]} [borrowed]
 * @returns {string[] | null}
 */
export function customEnemyTypes(random, n, custom, shuffle, borrowed = []) {
  const ty = custom?.types;
  /** @type {Record<string, unknown>} */
  const pick = ty && isObj(ty.pick) ? ty.pick : {};
  const set = (/** @type {string} */ k) => pick[k] === 'ban' || pick[k] === 'force';
  if (!ty || (ty.count == null && !random.some(set) && !borrowed.length)) return null;
  const all = [...random, ...borrowed.filter((k) => !random.includes(k))];
  const forced = all.filter((k) => pick[k] === 'force');
  const want = Math.min(CUSTOM_LIMITS.types[1], Math.max(forced.length, Number.isInteger(ty.count) ? /** @type {number} */ (ty.count) : n));
  const rest = all.filter((k) => !set(k));
  shuffle(rest);
  return [...forced, ...rest].slice(0, want);
}

/**
 * The 上半 (act1) stages a custom ruleset may add to the pool (stages.firstHalf): those whose mechanics the sim has —
 * 战场#06 沙尘暴/土石结构 (server/sim/content/devices.js). 战场#05 涨潮/特制水上平台 and #07 树丛 wait for theirs (maintainer
 * decision 2026-10-18).
 */
export const CUSTOM_FIRST_HALF_STAGES = Object.freeze(['act1autochess_m06']);
/**
 * The weight of an added 上半 stage: the official act1autochess table weighs 战场#06 as 战场#01–#04 (60 each), so it
 * takes 战场#01's weight in this season's pool [ASSUMED: the two seasons were never drawn together].
 */
export const CUSTOM_FIRST_HALF_WEIGHT_OF = 'act1autochess_m01';

/**
 * The stage ids a match draws from: the mode's pool, then the 上半 stages when custom settings add them and the season
 * has them, then the other seasons' stages they add (stages.extra: shared/seasonBorrow.js) — before the bans:
 * keepUnbanned. `ownStage(id)` says whether the season's own data has a stage (a borrowed record is not its own): an
 * own stage joins only through the mode's pool or the 上半 switch, so settings made in another season (stages.extra
 * naming this season's stage, a share code) never add a stage the difficulty's pool lacks. Required: without it the
 * function throws, so no caller can draw from a pool the server does not.
 * @param {readonly string[] | null | undefined} stageIds @param {{ stages?: { firstHalf?: unknown, extra?: unknown } } | null | undefined} custom
 * @param {(id: string) => boolean} ownStage
 * @returns {string[]}
 */
export function customStagePool(stageIds, custom, ownStage) {
  if (typeof ownStage !== 'function') throw new TypeError('customStagePool: ownStage(id) is required');
  const ids = Array.isArray(stageIds) ? [...stageIds] : [];
  if (custom?.stages?.firstHalf) for (const id of CUSTOM_FIRST_HALF_STAGES) if (!ids.includes(id) && ownStage(id)) ids.push(id);
  const extra = custom?.stages?.extra;
  for (const id of Array.isArray(extra) ? extra : []) if (typeof id === 'string' && !ids.includes(id) && !ownStage(id)) ids.push(id);
  return ids;
}

/**
 * The bond ban count ranges of a season (maintainer decision 2026-10-18 「the official range」): 0 to the most any
 * difficulty of its config.json bans draws, within CUSTOM_LIMITS — 盟约 3 core / 4 add-on, 规程 5 / 5. The settings
 * dialog's steppers and the match (GameData.bans) keep to them.
 * @param {{ bans?: unknown } | null | undefined} config data/config.json of the season
 * @returns {{ core: [number, number], addon: [number, number] }}
 */
export function customBanLimits(config) {
  const bans = config?.bans;
  const rows = isObj(bans) ? Object.values(bans).filter(isObj) : [];
  /** @param {string} k @param {readonly number[]} lim */
  const most = (k, lim) => {
    const v = Math.max(0, ...rows.map((b) => { const x = b[k]; return typeof x === 'number' && Number.isInteger(x) ? x : 0; }));
    return /** @type {[number, number]} */ ([lim[0], Math.min(lim[1], v || lim[1])]);
  };
  return { core: most('core', CUSTOM_LIMITS.banCore), addon: most('addon', CUSTOM_LIMITS.banAddon) };
}

/** The boolean options of custom settings. @param {Readonly<typeof CUSTOM_OFFICIAL>} c */
export function optionsOfCustom(c) {
  return Object.freeze(Object.fromEntries(Object.keys(RULE_OPTIONS).map((k) => [k, !!OPTION_FIELDS[k](c)])));
}

/**
 * The official bond ban counts { core, addon } of a difficulty (config.json bans[difficulty]; an 8-seat room's:
 * config.eightPlayer.bans[difficulty] when the config has it — shared/constants.js LARGE_SEATS; it has none, so the same
 * table), null when the config has none. The custom
 * dialog's 「官方值」, its differences (customDiffs `base.bans`) and the summaries compare with it.
 * @param {{ bans?: Record<string, BanCounts>, eightPlayer?: { bans?: Record<string, BanCounts> } } | null | undefined} config
 *   data/config.json
 * @param {string} difficulty @param {number} [size] the room size (4 | 8)
 * @returns {BanCounts | null}
 */
export function officialBans(config, difficulty, size) {
  const big = size === LARGE_SEATS ? config?.eightPlayer?.bans?.[difficulty] : null;
  return big || config?.bans?.[difficulty] || null;
}

/** @typedef {{ core?: number, addon?: number }} BanCounts a difficulty's bond ban counts (config.json bans[difficulty]) */

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
  const same = (/** @type {unknown} */ v, /** @type {unknown} */ dflt) => v === null || (dflt != null && v === dflt);
  if (!same(c.bonds.banCore, base.bans?.core)) out.push('bonds.banCore');
  if (!same(c.bonds.banAddon, base.bans?.addon)) out.push('bonds.banAddon');
  if (c.bonds.noLayerCap !== O.bonds.noLayerCap) out.push('bonds.noLayerCap');
  for (const k of Object.keys(c.bonds.pick)) out.push(`bonds.pick.${k}`);
  for (const sec of /** @type {const} */ (['enemies', 'leaders'])) {
    for (const [k, v] of Object.entries(c[sec])) if (v !== /** @type {Record<string, unknown>} */ (O[sec])[k]) out.push(`${sec}.${k}`);
  }
  if (!same(c.types.count, OFFICIAL_TYPE_COUNT)) out.push('types.count');
  for (const k of Object.keys(c.types.pick)) out.push(`types.pick.${k}`);
  for (const id of c.bosses.ban) out.push(`bosses.ban.${id}`);
  if (c.bosses.hitMode !== O.bosses.hitMode) out.push('bosses.hitMode');
  if (c.bosses.hitMode !== 'none' && c.bosses.hitLimit !== O.bosses.hitLimit) out.push('bosses.hitLimit');
  if (c.stages.info !== O.stages.info) out.push('stages.info');
  if (c.stages.reroll !== O.stages.reroll) out.push('stages.reroll');
  if (c.stages.firstHalf !== O.stages.firstHalf) out.push('stages.firstHalf');
  for (const id of c.stages.ban) out.push(`stages.ban.${id}`);
  for (const id of c.stages.extra) out.push(`stages.extra.${id}`);
  if (!same(c.flow.rounds, base.rounds)) out.push('flow.rounds');
  if (c.flow.prep !== O.flow.prep) out.push('flow.prep');
  for (const k of /** @type {const} */ (['lpCapOff', 'lpShared', 'routePreview', 'bandDup'])) if (c.flow[k] !== O.flow[k]) out.push(`flow.${k}`);
  for (const k of /** @type {const} */ (['chess', 'items'])) if (c.pool[k] !== O.pool[k]) out.push(`pool.${k}`);
  return out;
}

/**
 * A shop pool size under a custom percent (pool.chess / pool.items): the official count of the match — the room size's
 * multiplier already in it (co-op ×2, 8 players ×4, the 8 players' equipment ×2: server/match/gamedata.js poolCopies /
 * itemPoolCopies) — × pct ÷ 100, rounded, never below 1 while the official count is above 0. No percent: the count.
 * @param {number} n @param {number | null | undefined} pct
 */
export function customPoolCount(n, pct) {
  if (!Number.isFinite(pct) || pct === 100 || !(n > 0)) return n;
  return Math.max(1, Math.round((n * /** @type {number} */ (pct)) / 100));
}

// ---- the custom round plan and stat steps ------------------------------------------------------------------------

/**
 * The official multiplier of one stat step of a mode (config.json enemyScale: hp = base × step^kHp, atk = base ×
 * step^kAtk) — read off its rows with the fewest and the most steps, HP from the rows without a 补给线 share (supplyHp:
 * co-op 终极's HP rows carry it on top): 盟约 HP ×1.2, ATK ×1.1, 规程 ATK ×1.11. A mode
 * whose rows never step: ×1.2 / ×1.1. @param {StepMode | null | undefined} mode @param {'hp'|'atk'} stat
 */
export function officialStep(mode, stat) {
  const kKey = stat === 'hp' ? 'kHp' : 'kAtk';
  const scale = mode?.enemyScale;
  /** @type {{ k: number, v: number }[]} */
  const rows = [];
  for (const e of isObj(scale) ? Object.values(scale) : []) {
    if (!isObj(e)) continue;
    const k = e[kKey], v = Number(e[stat]);
    if (typeof k === 'number' && Number.isFinite(k) && v > 0 && (stat !== 'hp' || e.supplyHp == null || e.supplyHp === 1)) rows.push({ k, v });
  }
  /** @type {{ k: number, v: number } | null} */
  let lo = null;
  /** @type {{ k: number, v: number } | null} */
  let hi = null;
  for (const e of rows) {
    if (!lo || e.k < lo.k) lo = e;
    if (!hi || e.k > hi.k) hi = e;
  }
  if (!lo || !hi || hi.k === lo.k) return stat === 'hp' ? 1.2 : 1.1;
  return Math.round((hi.v / lo.v) ** (1 / (hi.k - lo.k)) * 1e4) / 1e4;
}

/** A mode record as officialStep / stepPreset read it (config.json modes[id]: its enemyScale rows). @typedef {{ enemyScale?: unknown }} StepMode */

/**
 * The multipliers a quick pick (CUSTOM_STEP_PRESETS) fills in, in hundredths: the mode's official step to the pick's
 * power, rounded — 盟约 gentle ×1.15 HP / ×1.07 ATK, steep ×1.26 / ×1.13, flat ×1.00 / ×1.00. Another name (official)
 * gives nulls, the official steps. @param {StepMode | null | undefined} mode (null: the 盟约 steps, officialStep's own) @param {string} name
 * @returns {{ stepHp: number | null, stepAtk: number | null }}
 */
export function stepPreset(mode, name) {
  const p = Object.hasOwn(CUSTOM_STEP_PRESETS, name) ? CUSTOM_STEP_PRESETS[name] : null;
  if (p == null) return { stepHp: null, stepAtk: null };
  const at = (/** @type {'hp'|'atk'} */ stat) => intIn(100 * officialStep(mode, stat) ** p, CUSTOM_LIMITS.step, null);
  return { stepHp: at('hp'), stepAtk: at('atk') };
}

/**
 * A stat multiplier of a round under custom steps (enemies.stepHp / stepAtk): the official multiplier `m` with each
 * official step it took after round 1 (`k − k1`) at `step` instead of the official `official` — round 1 stays as it is
 * (maintainer decision 2026-11-15: the multiplier per step, the official step rounds kept). @param {number} m
 * @param {number} k @param {number} k1 @param {number} step @param {number} official
 */
export function stepScale(m, k, k1, step, official) {
  if (!(official > 0) || !(step > 0) || step === official || !Number.isFinite(k - k1)) return m;
  return m * (step / official) ** (k - k1);
}

/**
 * The rounds of a custom round count: for each round 1..n its `src` (the official round whose waves, timers and
 * stats it uses) and `kind` — 'normal', 'sp' (a 机变 round), 'ext' (an added round), 'boss' (最终攻势, always the
 * last) —, `kHp` / `kAtk`, the official stat steps it takes, and `hp` / `atk`, its official multipliers (config.json
 * enemyScale: a step is officialStep — 盟约 ×1.2 hp, ×1.1 atk — on the mode's base); `hidden` = the 隐秘核心 after it (src = the mode's), or
 * null. Fewer rounds drop normal rounds from the middle, first those whose stat steps another kept round has (the 机变
 * rounds, round 1 and the final assault stay); more rounds keep 1..last−1 and add rounds that cycle the three late waves
 * before the final assault (last−3..last−1), their steps rising on from the last of them by the slope of those three
 * [ASSUMED], the final assault and the hidden core rising as much.
 * @param {{ lastRound?: number, hiddenRound?: number | null, spRounds?: number[], enemyScale?: Record<string, { kHp?: number, kAtk?: number, hp?: number, atk?: number }> }} mode
 * @param {number | null} [n] the custom count (null = the mode's)
 * @returns {{ rounds: PlanRound[], hidden: { src: number, kHp: number, kAtk: number, hp: number, atk: number } | null }}
 */
export function customRoundPlan(mode, n = null) {
  const lr = mode?.lastRound;
  const last = typeof lr === 'number' && Number.isInteger(lr) && lr > 0 ? lr : 14;
  const sp = new Set((Array.isArray(mode?.spRounds) ? mode.spRounds : []).filter(Number.isInteger));
  const num = (/** @type {unknown} */ v, /** @type {number} */ d) => (Number.isFinite(v) ? /** @type {number} */ (v) : d);
  const stats = (/** @type {number} */ r) => {
    const e = mode?.enemyScale?.[r];
    return { kHp: num(e?.kHp, 0), kAtk: num(e?.kAtk, 0), hp: num(e?.hp, 1), atk: num(e?.atk, 1) };
  };
  /** steps added on top of a round's own (an added round, or what the added rounds lift the final rounds by) */
  const sHp = officialStep(mode, 'hp'), sAtk = officialStep(mode, 'atk');
  /** @param {{ kHp: number, kAtk: number, hp: number, atk: number }} st @param {number} dHp @param {number} dAtk */
  const lifted = (st, dHp, dAtk) => ({ kHp: st.kHp + dHp, kAtk: st.kAtk + dAtk, hp: st.hp * sHp ** dHp, atk: st.atk * sAtk ** dAtk });
  const want = Number.isInteger(n) ? /** @type {number} */ (n) : last;
  /** @type {(r: number) => 'normal'|'sp'|'boss'} */
  const kindOf = (r) => (r === last ? 'boss' : sp.has(r) ? 'sp' : 'normal');
  /** @type {PlanRound[]} */
  let list = [];
  let lift = { kHp: 0, kAtk: 0 };
  if (want <= last) {
    const kept = Array.from({ length: last }, (_, i) => i + 1);
    const mid = (last + 1) / 2;
    const key = (/** @type {number} */ r) => { const s = stats(r); return `${s.kHp}/${s.kAtk}`; };
    while (kept.length > Math.max(1, want)) {
      const removable = kept.filter((r) => kindOf(r) === 'normal' && r !== 1);
      if (!removable.length) break;
      const dup = removable.filter((r) => kept.some((o) => o !== r && key(o) === key(r)));
      const pool = dup.length ? dup : removable;
      pool.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
      kept.splice(kept.indexOf(pool[0]), 1);
    }
    list = kept.map((r) => ({ src: r, kind: kindOf(r), ...stats(r) }));
  } else {
    for (let r = 1; r < last; r++) list.push({ src: r, kind: kindOf(r), ...stats(r) });
    const late = [last - 3, last - 2, last - 1].filter((r) => r >= 1);
    const a = stats(late[0] ?? 1), b = stats(late[late.length - 1] ?? 1);
    const per = late.length > 1 ? { kHp: (b.kHp - a.kHp) / (late.length - 1), kAtk: (b.kAtk - a.kAtk) / (late.length - 1) } : { kHp: 0, kAtk: 0 };
    const extra = want - last;
    for (let i = 1; i <= extra; i++) {
      list.push({ src: late[(i - 1) % late.length], kind: 'ext', ...lifted(b, per.kHp * i, per.kAtk * i) });
    }
    lift = { kHp: per.kHp * extra, kAtk: per.kAtk * extra };
    list.push({ src: last, kind: 'boss', ...lifted(stats(last), lift.kHp, lift.kAtk) });
  }
  const h = Number.isInteger(mode?.hiddenRound) ? mode.hiddenRound : null;
  return { rounds: list, hidden: h ? { src: h, ...lifted(stats(h), lift.kHp, lift.kAtk) } : null };
}

/** @typedef {{ src: number, kind: 'normal'|'sp'|'ext'|'boss', kHp: number, kAtk: number, hp: number, atk: number }} PlanRound */

/** The multiplier of each prep length setting (`fixed` takes flow.prepSec instead). */
/** @type {Readonly<Record<string, number>>} */
export const CUSTOM_PREP_MUL = Object.freeze({ official: 1, 'x1.5': 1.5, x2: 2 });

/**
 * A co-op round's prep in real seconds under the custom `flow` settings: the official `p` × the setting's multiplier
 * (rounded), or the fixed seconds; an untimed prep (`p` null) stays untimed. The caller leaves 独立模拟 out (its prep is
 * untimed, as the official one).
 * @param {{ prep: string, prepSec: number }} flow @param {number | null} p
 */
export function customPrepSeconds(flow, p) {
  if (!(Number.isFinite(p) && /** @type {number} */ (p) > 0)) return null;
  if (flow.prep === 'fixed') return flow.prepSec;
  return Math.round(/** @type {number} */ (p) * (CUSTOM_PREP_MUL[flow.prep] ?? 1));
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
  const o = isObj(v) ? v : null;
  const preset = typeof v === 'string' ? v : o ? o.preset : null;
  if (preset === 'custom') return customRuleset(o ? o.custom : null);
  return PRESET_RULESETS[typeof preset === 'string' && isQueuePreset(preset) ? preset : DEFAULT_PRESET];
}

/**
 * The options a season's official mode has on although RULE_OPTIONS gives them as conveniences: every preset of that
 * season has them on. 规程 (shared/seasons.js stagePreview): its official stage-info view shows the map preview
 * (auto_chess_stage_info_state), so the briefing's battlefield card is no 休闲 convenience there.
 * @param {unknown} season @returns {Readonly<Partial<Record<keyof typeof RULE_OPTIONS, boolean>>>}
 */
export function seasonOfficialOptions(season) {
  return seasonFeature(season, 'stagePreview') ? SEASON_STAGE_PREVIEW : NO_SEASON_OPTIONS;
}
const SEASON_STAGE_PREVIEW = Object.freeze({ battlefieldInfo: true });
const NO_SEASON_OPTIONS = Object.freeze({});

/** Whether two rulesets are the same (preset and, for custom, every setting). @param {unknown} a @param {unknown} b */
export function sameRuleset(a, b) {
  const x = resolveRuleset(a), y = resolveRuleset(b);
  if (x === y) return true;
  return x.preset === y.preset && JSON.stringify(x.custom ?? null) === JSON.stringify(y.custom ?? null);
}

/** The wire form of a ruleset (room.create / room.setRuleset fields, the drain hand-over): { preset, custom? }. */
/** @param {unknown} rs */
export function rulesetWire(rs) {
  const r = resolveRuleset(rs);
  return r.custom ? { preset: r.preset, custom: r.custom } : { preset: r.preset };
}

/**
 * The key a ruleset is counted under: the matchmaking queues (server/matchmaking.js, classic / casual — a custom
 * room queues alone, filled by quick players) and the stats records (public/js/ui/stats.js: custom matches count apart, maintainer decision 2026-10-18).
 */
export const rulesetKey = (/** @type {unknown} */ rs) => resolveRuleset(rs).preset;

/**
 * The battle spec flags of a ruleset: its `sim` options and a custom ruleset's battle settings, only those that differ
 * from the official value, so a classic battle's spec (and its golden digest) is unchanged. The match puts them on every
 * battle it builds (normal, 联防, boss, the stats preview):
 *   bossHitClamp  true: a leader's hit over the 限伤 lands as the limit (休闲, custom 按上限计算)
 *   bossHitLimit  the custom 限伤 value, 0 = none (custom 不限制) — shared/constants.js bossHitLimitOf
 *   noLayerCap    true: no per-bond layer cap (custom 解除盟约层数上限) — shared/constants.js layerCapOf
 * (the enemy stat settings reach the battles as spawn mods and `flags.enemyScale`: server/match/gamedata.js enemyScale
 * / leaderScale).
 * @param {unknown} rs
 * @returns {{ bossHitClamp?: true, bossHitLimit?: number, noLayerCap?: true }}
 */
export function simRuleFlags(rs) {
  const r = resolveRuleset(rs);
  /** @type {{ bossHitClamp?: true, bossHitLimit?: number, noLayerCap?: true }} */
  const flags = {};
  for (const [k, o] of Object.entries(RULE_OPTIONS)) {
    if (o.scope === 'sim' && o.flag && r.options[k] !== o.official) /** @type {Record<string, unknown>} */ (flags)[o.flag] = true;
  }
  const c = r.custom;
  if (c) {
    if (c.bosses.hitMode === 'none') flags.bossHitLimit = 0;
    else if (c.bosses.hitLimit !== BOSS_HIT_LIMIT) flags.bossHitLimit = c.bosses.hitLimit;
    if (c.bonds.noLayerCap) flags.noLayerCap = true;
  }
  return flags;
}
