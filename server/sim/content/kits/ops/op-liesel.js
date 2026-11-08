// server/sim/content/kits/ops/op-liesel.js — 复奏 (char_4031_liesel) kit: 5★ 扩散术师 (术师), a tier-2 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 디아만테·리프레사·체르니·아오스타」); both skills, the talent and the trait (professions.js splashcaster) in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, SPC-Y stage 1 (its talent change starts at stage 2).
// Sources: the record's tables; PRTS 复奏 (备注 of S1 and S2); charpack char_4031_liesel (Talents/0, Modes/Default), skill prefabs skchr_liesel_1 / _2,
// projectiles projectile_chr_liesel_s2_1 / _2 / _3, buff_template_data liesel_t, liesel_s_2[dot].
// - T1 执棒素养 (liesel_t): an attack with min_target_cnt or more enemies in its splash deals × damage_scale. Its dot does not count (modifier key `dot`).
// - S1 合奏起拍 (ReplacementSkillFixed, charges by the table): the next attack at atk_scale, splash radius 1.7 (PRTS).
// - S2 直到终曲 (`_switchToState` 1, MultiRangedAttack `_additionalTimes` 2, `_triggerDelta` 0, `_selectTargetTiming` 1): at the clip's OnAttack frame three shots,
//   each choosing its own main target (`_maxNum` 1, `_allowNoTarget`). A chosen enemy gets liesel_s_2[exclude] for 1.5 s and cannot be chosen again by her
//   (`_filterBuffSource`, `independentCharacterSource`; PRTS reads "any 复奏"), so fewer enemies take fewer shots.
//   A shot follows its target and lands 1.2 / 1.6 / 2.0 s later (`_delayToStart` 1.1 / 1.5 / 1.9, PRTS) with a splash of 1.7, unless she is gone (CheckUnitAlive SOURCE).
//   Its damage reads her ATK on landing (PRTS: no cached ATK), × damage_scale when `projectile_targets_count` ≥ 3 (modifier key damage_up, else ignore_damage_up).
//   Every enemy hit gets liesel_s_2[dot]: each second atk_scale × her ATK when the shot left, no source (PRTS), EXTEND with snapshot, one per 复奏 (`independentCharacterSource`).

import { num, talentBb, skillRec, up, instantKind } from '../shared/tier1.js';
import { sortEnemyTargets } from '../../../targeting.js';

const S1 = 'skchr_liesel_1';
const S2 = 'skchr_liesel_2';
/** PRTS 备注 of S1 and S2: 溅射半径1.7. */
export const SKILL_SPLASH = 1.7;
/** After the shot leaves, in order (PRTS 备注 of S2; the prefabs' `_delayToStart` + 0.1). */
export const LANDS = Object.freeze([1.2, 1.6, 2.0]);
const LOCK = 1.5;
const DOT = 'liesel_s_2[dot]';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** The next main target of S2 among the enemies in her range, the ones she chose in the last LOCK seconds left out. */
function nextTarget(battle, unit, lock) {
  const cands = battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile).filter((e) => !e.findBuff(lock));
  return sortEnemyTargets(battle, unit, cands, unit.profile.priority)[0] ?? null;
}

export default {
  char_4031_liesel: (bb, chess) => {
    const t0 = talentBb(chess, 0), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const scale = num(t0.damage_scale, 1), minCnt = num(t0.min_target_cnt, 3);
    return {
      skills: {
        [S1]: { kind: instantKind({ skill: { maxCharges: num(skillRec(chess, S1)?.maxChargeTime, 1) } }), attack: { atkScale: num(b1.atk_scale, 1), splashRadius: SKILL_SPLASH } },
        [S2]: {
          kind: instantKind({ skill: { maxCharges: num(skillRec(chess, S2)?.maxChargeTime, 1) } }),
          onStrike({ battle, unit }) {
            const lock = `liesel_s_2[exclude]:${unit.id}`, dot = `${DOT}:${unit.id}`;
            const dps = num(b2['liesel_s_2[dot].atk_scale']), dur = num(b2['liesel_s_2[dot].duration']);
            let fired = false;
            for (const land of LANDS) {
              const t = nextTarget(battle, unit, lock);
              if (!t) return;
              if (!fired) { fired = true; battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, k: 'liesel:s2on' }); } // the skill ability's ON, once
              battle.addBuff(t, { key: lock, duration: LOCK, source: unit, tags: ['skill'] });
              const cached = unit.s.atk;
              battle.after(land, () => {
                if (!up(unit)) return;
                const hits = battle.foesInRadius(t.x, t.y, SKILL_SPLASH, true);
                const mul = hits.length >= minCnt ? scale : 1;
                for (const e of hits) {
                  battle.dealDamage(unit, e, { amount: unit.s.atk * num(b2.atk_scale, 1), mul, type: 'arts', isAttack: true, isSkill: true, tags: ['liesel:shot'] });
                  if (!e.alive || !(dur > 0) || !(dps > 0)) continue;
                  const had = e.findBuff(dot);
                  if (had) had.data.atk = cached;
                  battle.addBuff(e, {
                    key: dot, source: unit, duration: dur, interval: 1, refresh: 'extend', visible: true, data: { atk: cached }, tags: ['skill', 'dot'],
                    onTick: ({ battle: b, unit: x, buff }) => {
                      b.dealDamage(unit, x, { amount: buff.data.atk * dps, type: 'arts', isSkill: true, sourceless: true, showSource: true, ignoreSelect: true, tags: ['dot', 'periodic'] });
                    },
                  });
                }
                battle.fx('aoe', { x: t.x, y: t.y, id: unit.id, r: SKILL_SPLASH, skill: 'liesel' });
              }, { owner: unit });
            }
          },
        },
      },
      talents: [{ install(battle, unit) {
        if (!(scale > 1)) return;
        // one count per attack (its damage instances share attackId; the main target comes first), the splash the attack was fired with
        let seen = null, many = false;
        battle.on('hit', (c) => {
          const d = c.dmg;
          if (c.source !== unit || !d?.isAttack || d.tags?.includes('liesel:shot')) return;
          if (d.attackId !== seen) {
            seen = d.attackId;
            const r = d.isSkill ? SKILL_SPLASH : unit.profile.splashRadius;
            many = battle.foesInRadius(c.target.x, c.target.y, r, true).length >= minCnt;
          }
          if (many) d.mul *= scale;
        }, { owner: unit });
      } }],
    };
  },
};
