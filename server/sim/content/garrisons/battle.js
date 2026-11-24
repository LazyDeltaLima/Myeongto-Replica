// server/sim/content/garrisons/battle.js — IN_BATTLE 特质 (garrisons) of the operators on the field.
//
// Each operator carries `unit.def.raw.garrisonIds` (elite chess carry the `_b` garrisons); the IN_BATTLE ones are
// dispatched here by their effectKey (bbStr.key for battle runes, else effectType — docs/DATA.md §4):
//
//   ADD_BOND            grants `give_garrison_id` to other operators before the first deployment (targets by the
//                       battleRuneKey: front / back tile, rightmost of the row, all of the player; effects/grants.js).
//                       Every grant is a copy of its own, as in the official client (each grant appends a rune of its
//                       own to the target; the global buffs of these traits are outside any override group): two
//                       华法琳 facing one operator give it two garrison_95, +2 per skill. A granted trait keeps its data
//                       cap like a native one, per operator and trait id, shared by the copies (the client counts it
//                       on the operator under the trait's garrison_key): 华法琳's garrison_95 stops at 7 / 14 layers per
//                       battle however many grant it (PRTS 下半 3月27日更新#2: 「从 初始12/精锐24 降低至 初始7/精锐14」;
//                       GitHub #175, PR #192 by @kukiC).
//   layer events        act1autochess_gar_event_useskill (skillStart) · _selfkillenemy (kill, every check_cnt
//                       kills since its last deployment) ·
//                       _selfdead (death 'killed'; texts with 替身 / 傀儡 also on every substitute ⇄ body swap: the
//                       engine's dollSwap, never the 替身's knock-out — effects/events.js countsSwaps) · _consume_ammo (ammoUsed; range_id 0-1 self, 1-1 front tile,
//                       x-5 self + 4 adjacent, pooled counter) · _enemy_abflag_inrange (an enemy in range ENTERS
//                       'freeze', × prob) · act2autochess_gar_event_onstart (every deploy) ·
//                       act2autochess_gar_event_allyenemy_sleepstun_inrange (an enemy or operator in range ENTERS
//                       sleep / stun). "进入…时": re-applying a running status (a refresh) is not a new entry
//                       (engine statusApplied ctx.entered) — except a pulse that re-applies its own short status as a
//                       fresh one (applyStatus `reenter`: 缇缇 S2's sleep ward, DESIGN §24.8).
//                       Targets: bond_by_id / bond_self (own active bonds) / bond_actived_maxstack;
//                       amounts: by_count / by_charcount_samerow / by_charlevel; conditions character_same_row /
//                       character_same_col (≥ check_count incl. self). Gains go through support.gainLayers with
//                       reason 'garrison', source = the trait's owner, cap = max_add_count_per_battle per (instance, bond)
//                       — per instance for bond_actived_maxstack (塑心: the highest bond may change, the cap does not).
//   act1autochess_gar_event_addition_cnt (魔王)  layerGain: a 'garrison' gain whose source stands on the tile in front
//                       of 魔王 (range_id 1-1) — or was knocked out there this instant (幽灵鲨 "被击倒时"; engine ctx.tile)
//                       — gets +extra_cnt per bond (the extra does not count toward the source's per-battle cap).
//   stat traits         GAIN_BUFF (battleRuneKey char_attribute_mul "攻击力和生命值+20%": a rune on the chess's base
//                       attributes, so atkMul / hpMul), attr_common_global_buff (spRecoveryFlat; "+X%" ATK / HP would be
//                       直接乘算), attrByBond ("每叠加N层…+X%": 直接乘算, support directMods),
//                       respawnTimeByBond, attrByBond_add_onstart, ab_damageScaleByBond — layer readers use
//                       floor(Σ layers of the listed ACTIVE bonds / divide_num) (research 02 §5 [ASSUMED] only active
//                       bonds count); attrByBond and attrByBond_add_onstart at each deployment only (client buff
//                       templates: ON_BUFF_START), the others recomputed after every layer gain.
//   hit modifiers       act1autochess_gar_eff_attack_enemy (dmg.amount × atk vs check_tag enemies),
//                       ab_damageScaleByBond (bound / sluggish targets), _chaos (弱点伤害, research 04 glossary:
//                       phys/arts → whichever deals MORE after the engine's mitigation incl. the attacker's DEF/RES
//                       ignore, never the dealt/taken multipliers; a tie keeps the type).
//   NONE                风丸 "2 copies merge" — prep rule (chess.upgradeNum 2), nothing in battle.
//
// Hooks: priority 0, except 弱点伤害 (hit, WEAKNESS_PRIORITY −10: decided on the final amount after the ATK
// multipliers). install() registers nothing when no operator carries an IN_BATTLE garrison.
//
// Files, by effect-key family: effects/grants.js (ADD_BOND targets), effects/events.js (the layer events, fireGain,
// 魔王's extra), effects/stats.js (the fixed stat 特质 and the layer readers), effects/hits.js (the hit modifiers, 弱点伤害);
// effects/switch.js (规程's hand switches: the candidates, reserve()); shared.js what they share. install() keeps one order, so the hooks register as before: the grants, then the installers
// by effect key in the order the carriers' 特质 first appear, then the hit modifiers, then the layer readers.

import * as S from '../support/index.js';
import { EMPTY } from './shared.js';
import { grantTargets } from './effects/grants.js';
import { EVENTS } from './effects/events.js';
import { STAT_INSTALLERS, READERS, installReaders } from './effects/stats.js';
import { HIT_KEYS, installHitMods, DAMAGE_INSTALLERS } from './effects/hits.js';
import { TRIGGERED_KEYS } from './effects/triggered.js';
import { SWITCH_INSTALLERS } from './effects/switch.js';

export { GARRISON_OPTIONS, fireGain } from './effects/events.js';
export { TRIGGERED_KEYS } from './effects/triggered.js';
export { stepsOf } from './effects/stats.js';
export { weaknessType, WEAKNESS_PRIORITY } from './effects/hits.js';
export { reserve, handRules as switchHandRules } from './effects/switch.js';
/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */
/** @import { GarrisonInst, Installer } from './shared.js' */

/** @param {Unit} u @returns {readonly string[]} */
function garrisonIdsOf(u) {
  const list = u?.def?.raw?.garrisonIds ?? u?.def?.garrisonIds;
  return Array.isArray(list) ? list : EMPTY;
}

/** Installers by effect key, in this order (an effect key in two families throws). */
const INSTALLERS = (() => {
  /** @type {Record<string, Installer>} */
  const out = {};
  // a garrison_trigger_buff effect garrison does nothing on its own: its event 特质 runs it (effects/triggered.js) — but
  // for the switch's handler, installed with the battle (effects/switch.js)
  const triggered = Object.fromEntries(TRIGGERED_KEYS.filter((k) => !Object.hasOwn(SWITCH_INSTALLERS, k)).map((k) => [k, () => {}]));
  for (const t of [EVENTS, STAT_INSTALLERS, DAMAGE_INSTALLERS, SWITCH_INSTALLERS, triggered, {
    // grants are resolved in install(); 风丸's rule lives in the prep economy
    ADD_BOND() {},
    NONE() {},
  }]) {
    for (const [k, v] of Object.entries(t)) {
      if (Object.hasOwn(out, k)) throw new Error(`garrisons/effects: effect key ${k} twice`);
      out[k] = v;
    }
  }
  return Object.freeze(out);
})();

// ---------------------------------------------------------------------------------------------------------------------
// install

/** @param {Battle} battle */
export function install(battle) {
  /** @type {GarrisonInst[]} */
  const all = [];
  /** @type {Map<Unit, Map<string, number>>} */
  const owned = new Map(); // unit → Map(garrisonId → copies)
  const add = (/** @type {Unit} */ unit, /** @type {Record<string, any>} */ g, /** @type {GarrisonInst | null} */ grantedBy = null) => {
    let held = owned.get(unit);
    if (!held) { held = new Map(); owned.set(unit, held); }
    const n = (held.get(g.garrisonId) ?? 0) + 1;
    if (!grantedBy && n > 1) return null; // the chess's own list names an id once
    held.set(g.garrisonId, n);
    const bb = g.bb || {};
    const cap = S.num(bb.max_add_count_per_battle, 0) > 0 ? S.num(bb.max_add_count_per_battle) : Infinity;
    const it = {
      unit, g, gid: g.garrisonId, key: g.effectKey, bb, bbStr: g.bbStr || {}, grantedBy,
      // the per-battle cap is the operator's per trait id, shared by its copies; each copy's buff is its own
      cap, capKey: `gar:${g.garrisonId}:${unit.id}`, buffKey: n > 1 ? `gar:${g.garrisonId}#${n}` : `gar:${g.garrisonId}`, cnt: 0, k: -1,
    };
    all.push(it);
    return it;
  };
  for (const u of battle.allyUnits) {
    if (!S.isOp(u)) continue;
    for (const gid of garrisonIdsOf(u)) {
      const g = S.garrisonRecord(gid, battle);
      if (g && g.eventType === 'IN_BATTLE') add(u, g);
    }
  }
  if (!all.length) return;

  /** @type {GarrisonInst[]} */
  const grants = [];
  for (const it of all.slice()) {
    if (it.key !== 'ADD_BOND') continue;
    const g2 = S.garrisonRecord(it.bbStr.give_garrison_id, battle);
    if (!g2 || g2.eventType !== 'IN_BATTLE') continue;
    for (const t of grantTargets(battle, it)) {
      const got = add(t, g2, it);
      if (got) grants.push(got);
    }
  }

  /** @type {Map<string, GarrisonInst[]>} */
  const by = new Map();
  for (const it of all) {
    let arr = by.get(it.key);
    if (!arr) { arr = []; by.set(it.key, arr); }
    arr.push(it);
  }
  for (const [key, list] of by) {
    const inst = INSTALLERS[key];
    if (inst) inst(battle, list);
  }
  installHitMods(battle, by);
  installReaders(battle, by);

  if (grants.length) {
    battle.on('battleStart', () => {
      // a grant always has its granter (add's third argument above)
      for (const it of grants) S.fxOn(battle, 'garrisonGrant', it.unit, `gar:${/** @type {GarrisonInst} */ (it.grantedBy).gid}`, it.gid, { from: /** @type {GarrisonInst} */ (it.grantedBy).unit.id });

    });
  }
}

/**
 * Every IN_BATTLE effectKey this file acts on (INSTALLERS, the layer READERS, ADD_BOND grants, the hit modifiers, 混沌);
 * `NONE` (只需2个…合成精锐) is no battle effect: the merge count is the chess's `upgradeNum`. A key outside it does
 * nothing in battle (test/content/garrisons_battle.test.js: none of the current season's chess carries one).
 */
export const BATTLE_GARRISON_KEYS = Object.freeze([...Object.keys(INSTALLERS), ...READERS, 'ADD_BOND',
  ...HIT_KEYS]);
