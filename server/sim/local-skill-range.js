// Local patch (docs/LOCAL-PATCH.md 「스킬 범위가 넓은 스킬의 자동 발동」, user decision 2026-10-07): an operator's MANUAL skill
// whose 技能范围 reaches tiles its attack range does not is also cast once an enemy it could hit stands on that skill range
// — no normal attack needed. Upstream follows the official 技能策略 here: such a skill (「攻击范围扩大」 and the like) is on
// the basic strategy (DEFAULT: right before a normal attack, with an enemy in the INITIAL attack range), so 赤刃明霄陈 S3,
// 望 S3, 莫斯提马 S3 … waited for an enemy to come into their small normal range first.
//
// Only skills the data leaves on DEFAULT (no class row such as 重装 TAKE_DAMAGE / SEARCH, no official SKILL_RANGE, no rule
// set by the kit), and no heal skill (their skill strategy looks at allies). The basic rule stays: the skill range is a
// DEFAULT trigger range (SkillRuntime.addTriggerRange, checked every tick), so an enemy in the attack range still casts
// it as before. The automatic-operation cooldown (3 s, AUTO_OP_COOLDOWN) still applies.
//
// Which enemies count: targetable ones (no unrevealed 隐匿 / untargetable), flying ones only when the skill can hit air
// (user: 赤刃明霄陈 S3's 剑气 hits flyers although he cannot) — the kit's `hitsFly` on the skill spec, else the skill's
// `targeting.canHitFly`, else the unit's own profile (a melee 「攻击范围扩大」 skill ignores flyers it could not hit).

import { absoluteRangeKeys } from './targeting.js';

/**
 * Off ⇒ the official 技能策略 again (upstream behaviour). The rule rests on the user's memory and a player's report, not on
 * client data — kept switchable until it is confirmed (STRONGHOLD.md §11).
 */
export const WIDE_SKILL_RANGE_TRIGGER = true;

const pairKey = (p) => `${p[0]},${p[1]}`;

/**
 * True when `skillGrid` holds a [dr, dc] offset that `attackGrid` does not.
 * @param {Array<[number, number]>|null|undefined} skillGrid
 * @param {Array<[number, number]>|null|undefined} attackGrid
 */
export function reachesPastAttackRange(skillGrid, attackGrid) {
  if (!Array.isArray(skillGrid) || !skillGrid.length) return false;
  const own = new Set((Array.isArray(attackGrid) ? attackGrid : []).filter(Array.isArray).map(pairKey));
  return skillGrid.some((p) => Array.isArray(p) && !own.has(pairKey(p)));
}

/**
 * Install the skill-range trigger on an operator's skill runtime when it qualifies (Battle._setupKit, after the
 * SkillRuntime is made). Returns true when installed.
 * @param {object} unit battle unit (u.skill = SkillRuntime)
 */
export function installWideSkillRange(unit) {
  const sk = unit?.skill;
  const d = sk?.def;
  if (!WIDE_SKILL_RANGE_TRIGGER || !sk || sk.noSkill || !d || unit.side !== 'ally' || unit.def?.type !== 'chess') return false;
  if (sk.rule !== 'DEFAULT' || !sk.manual || sk.healSkill || sk.kind === 'passive' || sk.spec?.trigger) return false;
  const grid = Array.isArray(d.rangeGrid) ? d.rangeGrid : null;
  if (!reachesPastAttackRange(grid, unit.def.rangeGrid)) return false;
  const s = sk.spec || {};
  const canHitFly = !!(s.hitsFly ?? s.targeting?.canHitFly ?? unit.profile?.canHitFly);
  const profile = Object.freeze({ canHitFly });
  let tile = -1, dir = null, keys = null;
  sk.wideRange = { grid, canHitFly };
  sk.addTriggerRange(() => {
    const t = unit.tileR * 1000 + unit.tileC;
    if (!keys || t !== tile || unit.dir !== dir) {
      keys = absoluteRangeKeys(grid, unit.tileR, unit.tileC, unit.dir, 0);
      tile = t;
      dir = unit.dir;
    }
    return [{ keys, profile }];
  });
  return true;
}
