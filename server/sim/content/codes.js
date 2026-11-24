// server/sim/content/codes.js — the enumerated values (numeric and string codes) the content handlers read from the
// tables, one entry per (handler, field): which records carry the field, which values the handler knows, and where.
//
// A handler reads such a code through a table of its own (a switch, a map) and does nothing on a value that table lacks —
// never its first case or a "most likely" one (妮芙's check_ab_flag 33 = 恐惧 read as 16 = 冻结 once left her 特质 dead).
// content/coverage.js turns this list into the `codes` rows (`partial` names each value no handler knows, with the
// records that carry it), so a season whose tables bring a new code shows up in tools/season-coverage.mjs and fails
// test/content/coverage.test.js instead of falling silent in a match.
//
//   table     'garrisons'  特质 records, matched by effectKey (`keys`; null: every record of eventType `event`, or of
//                          every other event type when `event` is '!IN_BATTLE'); the value is bb[field] ?? bbStr[field]
//             'buffs'      every buff of items, bonds, effects and strategy stages, matched by key or bbStr.key
//             'bandNext'   the `next` of every strategy stage (field unlockType)
//   known     the values read (numbers compare as text), a function of the record's key, or 'garrisonEvents' — the
//             特质 event types the match runs (effectsMeta.js GARRISON_HOOK, passed to coverage by its caller)
//
// Option values every layer-event 特质 shares (bond_type, bond_add_type, conditionkey, range_id, garrison_type) are
// checked by the garrison rows themselves (garrisons/effects/events.js GARRISON_OPTIONS).

import { AB_FLAG_STATUS } from './garrisons/effects/events.js';
import { AB_FLAG_CHECK } from './garrisons/effects/hits.js';
import { EP_BURST } from './garrisons/effects/stats.js';
import { RANGE_GRIDS } from './garrisons/shared.js';
import { ADD_METHODS, POSITION_DIRS } from './garrisons/prep/layers.js';
import { TRIGGER_SCOPES } from './garrisons/prep/triggers.js';
import { PREP_CONDITIONS } from './garrisons/prep/shared.js';
import { UNLOCK_TYPES, MARK_CONDS } from './bands/meta.js';
import { AMEDIC_CONDS, BAND13_ADD_TYPES } from './bands/battle.js';
import { ENEMY_RANKS } from './choices.js';

const keysOf = (/** @type {object} */ o) => Object.freeze(Object.keys(o));

/** @type {ReadonlyArray<{ table: 'garrisons' | 'buffs' | 'bandNext', keys: readonly string[] | null, event?: string, field: string, known: readonly (string | number)[] | ((key: string) => readonly string[]) | 'garrisonEvents', side: 'battle' | 'prep', where: string }>} */
export const TABLE_CODES = Object.freeze([
  // 特质, battle side
  { table: 'garrisons', keys: ['act1autochess_gar_event_enemy_abflag_inrange'], field: 'check_ab_flag', known: keysOf(AB_FLAG_STATUS), side: 'battle', where: 'garrisons/effects/events.js AB_FLAG_STATUS' },
  { table: 'garrisons', keys: ['act2autochess_gar_eff_ab_damageScaleByBond'], field: 'check_ab_flag', known: keysOf(AB_FLAG_CHECK), side: 'battle', where: 'garrisons/effects/hits.js AB_FLAG_CHECK' },
  { table: 'garrisons', keys: ['act3autochess_gar_effect_block_eprecoverspeed_inrange'], field: 'ep_type', known: keysOf(EP_BURST), side: 'battle', where: 'garrisons/effects/stats.js EP_BURST' },
  { table: 'garrisons', keys: null, event: 'IN_BATTLE', field: 'bond_range_id', known: keysOf(RANGE_GRIDS), side: 'battle', where: 'garrisons/shared.js RANGE_GRIDS' },
  // 特质, prep side
  { table: 'garrisons', keys: ['SERVER_ADD_BOND_METHOD'], field: 'add_method', known: ADD_METHODS, side: 'prep', where: 'garrisons/prep/layers.js ADD_METHODS' },
  { table: 'garrisons', keys: ['SERVER_ADD_BOND_POSITION', 'SERVER_ADD_BOND_POSITION_COUNT_SELL_PRICE'], field: 'dir', known: POSITION_DIRS, side: 'prep', where: 'garrisons/prep/layers.js POSITION_DIRS' },
  { table: 'garrisons', keys: ['SERVER_TRIGGER_ANOTHER'], field: 'scope', known: TRIGGER_SCOPES, side: 'prep', where: 'garrisons/prep/triggers.js TRIGGER_SCOPES' },
  { table: 'garrisons', keys: ['SERVER_TRIGGER_ANOTHER', 'SERVER_TRIGGER_FRONT_COUNT'], field: 'event', known: 'garrisonEvents', side: 'prep', where: 'garrisons/prep/triggers.js runGarrisonsOf' },
  { table: 'garrisons', keys: null, event: '!IN_BATTLE', field: 'conditionkey', known: (k) => PREP_CONDITIONS[k] ?? PREP_CONDITIONS['*'], side: 'prep', where: 'garrisons/prep/shared.js PREP_CONDITIONS' },
  // strategies
  { table: 'bandNext', keys: null, field: 'unlockType', known: UNLOCK_TYPES, side: 'prep', where: 'bands/meta.js UNLOCK_TYPES' },
  { table: 'buffs', keys: ['round_start_activate_char_chess_effect_in_board'], field: 'event_type', known: 'garrisonEvents', side: 'prep', where: 'bands/meta.js round_start_activate_char_chess_effect_in_board' },
  { table: 'buffs', keys: ['skill_trigger_garr_event', 'skill_garr_event_extra_exec'], field: 'event', known: 'garrisonEvents', side: 'prep', where: 'bands/meta.js hasTrait' },
  { table: 'buffs', keys: ['skill_mark_char_inst_tag'], field: 'cond', known: MARK_CONDS, side: 'prep', where: 'bands/meta.js MARK_CONDS' },
  { table: 'buffs', keys: ['auto_chess_change_map'], field: 'common_condition', known: AMEDIC_CONDS, side: 'battle', where: 'bands/battle.js AMEDIC_CONDS' },
  { table: 'buffs', keys: ['act1autochess_band13_buff'], field: 'bond_add_type', known: BAND13_ADD_TYPES, side: 'battle', where: 'bands/battle.js BAND13_ADD_TYPES' },
  // 机变 cards and other effects
  { table: 'buffs', keys: ['enemy_attribute_mul', 'enemy_attribute_add'], field: 'enemy_level_type', known: ENEMY_RANKS, side: 'battle', where: 'choices.js ENEMY_RANKS' },
]);
