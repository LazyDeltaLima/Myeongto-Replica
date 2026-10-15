// shared/ruleset.js — 규칙 모드: which of this remake's conveniences a room's matches turn on (feat, maintainer decision
// 2026-10-15). The official 卫戍协议 has none of them; a room picks a preset:
//
//   classic (经典)  every option at its official value — the official mode as it was
//   casual  (休闲)  the conveniences on: the briefing's battlefield card, its 重新抽取 vote, the boss route preview, and
//                   no 限伤 on leaders
//
// RULE_OPTIONS is the one table of options. Every option has its official value and its casual value; the classic preset
// is derived from the official values, so a new option keeps classic official by construction. A later 'custom' preset
// (each option picked by the room) only needs a preset entry, an `options` field on the wire and its matchmaking key
// (rulesetKey) — the server and the client already read every option through the resolved ruleset.
//
// The ruleset travels as { preset, options } (room.state.ruleset, m.public.ruleset); options always holds every key.
// Who reads which option (`scope`):
//   ui     the client only (public/js/screens/briefing.js: battlefieldInfo)
//   match  the server's match flow (server/match/match/phases.js infoReroll, views.js bossRoutePreview)
//   sim    a battle spec flag (simRuleFlags → spec.flags, read by server/sim; set only when it differs from the official
//          value, so a classic battle's spec stays what it was)
// docs/rules/ui.md 「규칙 모드」 has the rules and their evidence.

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
  bossRoutePreview: Object.freeze({ official: false, casual: true, scope: 'match', label: N_('领袖路线预览') }),
  // 限伤: a hit of ≥ BOSS_HIT_LIMIT on a leader in a boss battle is cancelled (server/sim/damage.js leaderHitCancelled)
  bossHitLimit: Object.freeze({ official: true, casual: false, scope: 'sim', label: N_('领袖限伤'), flag: 'noBossHitLimit',
    note: N_('对敌方领袖单次造成 {n} 以上的伤害会整个无效'), noteN: BOSS_HIT_LIMIT }),
});

/** The presets a room may pick, in menu order. */
export const RULE_PRESETS = Object.freeze(['classic', 'casual']);

/** A room's preset before anyone picks one, and the ruleset of a match given none (tests, tools, the golden corpus). */
export const DEFAULT_PRESET = 'classic';

/** The presets' names (player-facing, through t()). */
export const PRESET_LABELS = Object.freeze({ classic: N_('经典'), casual: N_('休闲') });

/** @param {unknown} v */
export const isRulePreset = (v) => typeof v === 'string' && RULE_PRESETS.includes(v);

/** @typedef {{ preset: string, options: Readonly<Record<string, boolean>> }} Ruleset */

const PRESET_RULESETS = Object.freeze(Object.fromEntries(RULE_PRESETS.map((preset) => {
  const pick = preset === 'casual' ? 'casual' : 'official';
  const options = Object.freeze(Object.fromEntries(Object.entries(RULE_OPTIONS).map(([k, o]) => [k, o[pick]])));
  return [preset, Object.freeze({ preset, options })];
})));

/**
 * The frozen ruleset of a preset name or a { preset } object; anything else (missing, unknown, malformed) is the
 * default preset.
 * @param {unknown} v
 * @returns {Ruleset}
 */
export function resolveRuleset(v) {
  const preset = typeof v === 'string' ? v : v && typeof v === 'object' ? /** @type {any} */ (v).preset : null;
  return PRESET_RULESETS[isRulePreset(preset) ? preset : DEFAULT_PRESET];
}

/** The matchmaking key of a ruleset: players wait together only under the same key (server/matchmaking.js). */
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
