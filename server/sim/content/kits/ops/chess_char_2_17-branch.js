// server/sim/content/kits/ops/chess_char_2_17-branch.js — 折桠 (char_4207_branch) kit, tier 2.
// Conventions of the tier-2 kits: ../shared/tier2.js; kit contract and rules: ../README.md.

import { num, talentBb, traitBb, onHitOn, enemiesInGrid } from '../shared/tier1.js';

/** Skill_2_Begin, the clip of her S2 first attack: its length and OnAttack frame (s). */
const FIRST_CLIP = 1, FIRST_HIT = 0.6;

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 2_17 折桠 生存决心: ATK +atk, DEF +def, hits every blocked enemy. Her first attack of the cast (mode S2's FirstAttack, while
  // branch_s_2[first] holds; clip Skill_2_Begin, on the attack interval as any swing) deals no damage: at its strike the skill's
  // SpAttack makes the ground enemies around her (skill grid) 战栗 (tremble: "被阻挡后无法进行普通攻击") for not_combat s. No enemy in
  // her range, no first attack. 简易包扎: heals hp_ratio × max HP when the skill ends.
  // Elite module (UNY-X, trait damage_scale): damage from enemies she blocks ×damage_scale.
  // S1 绝境抵抗 (alt, TAKE_DAMAGE / hurt SP from data): DEF +def and 抵抗 (−one_minus_status_resistance: control
  // statuses last half as long) for its duration; 简易包扎 heals at its end too.
  chess_char_2_17_a: (bb, chess, def) => {
    const t = talentBb(chess, 0);
    const tb = traitBb(chess);
    return {
      skill: {
        kind: 'duration', mods: { atkPct: num(bb.atk), defPct: num(bb.def) }, attack: { hitAllBlocked: true },
        onStart({ unit }) { unit.mem.branchFirst = true; },
        onEnd({ unit }) { unit.mem.branchFirst = false; },
      },
      skills: {
        skchr_branch_1: {
          kind: 'duration', mods: { defPct: num(bb.def) },
          onStart({ battle, unit, skill }) {
            const v = Math.min(0.95, Math.max(0, -num(bb.one_minus_status_resistance)));
            if (v > 0) battle.applyStatus(unit, 'resist', { duration: skill.timeLeft, value: v, source: unit });
          },
        },
      },
      talents: [{ install(battle, unit) {
        if (unit.skill?.id !== 'skchr_branch_1') {
          // the first attack: its own clip, on the attack interval (`_timeMode` 0, `_maxAnimScale` 1)
          battle.on('swing', (c) => {
            if (c.unit !== unit || !unit.mem.branchFirst) return;
            const iv = unit.s.interval, scale = Math.max(0.1, Math.min(1, iv / FIRST_CLIP));
            c.timing = { strike: FIRST_HIT * scale, action: FIRST_CLIP * scale, cooldown: iv };
          }, { owner: unit });
          // its strike: SpAttack instead of a hit (`_runActionOnEvent` ON_SPELL_ON ends branch_s_2[first])
          battle.on('beforeAttack', (ctx) => {
            if (ctx.attacker !== unit || !unit.mem.branchFirst) return;
            unit.mem.branchFirst = false;
            ctx.targets = [];
            const grid = def?.skill?.rangeGrid;
            const foes = grid ? enemiesInGrid(battle, unit, grid, { canHitFly: false, groundOnly: true }) : battle.foesInRadius(unit.x, unit.y, 1.5).filter((e) => !e.isFlying);
            battle.fx('aoe', { x: unit.x, y: unit.y, radius: 1.5, id: unit.id, skill: 'resolve' });
            for (const e of foes) battle.applyStatus(e, 'tremble', { duration: num(bb.not_combat), source: unit });
          }, { owner: unit });
        }
        const hr = num(t.hp_ratio);
        if (hr > 0) {
          battle.on('skillEnd', ({ unit: u, reason }) => {
            if (u === unit && reason !== 'death' && unit.alive) battle.heal(unit, unit, unit.s.maxHp * hr, { self: true, tags: ['talent'], moment: 'branch_t_1' });
          }, { owner: unit });
        }
        if (tb.damage_scale != null) onHitOn(battle, unit, ({ source, dmg }) => { if (source && source.blockedBy === unit) dmg.mul *= num(tb.damage_scale, 1); });
      } }],
    };
  },
};
