// server/sim/content/kits/ops/op-alga.js — 奥尔佳 (char_4245_alga) kit: 5★ 教官 (近卫), a tier-3 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 메테오라이트·올가·아미야」); both skills, the talent and INS-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, INS-X stage 1.
// Sources: the record's tables (a CN-only operator); the CN client's charpack char_4245_alga (Modes/Default, Modes/Skill2, Talents/1,
// Trait), skill prefabs skchr_alga_1 / _2, buff templates alga_tr, alga[check_enemy], alga_2[mode], alga_2[try_add], alga_2.
// - Trait (教官) "攻击自身未阻挡的敌人时攻击力提升至120%" (alga_tr: atk_scale unless she blocks the target): the instructor profile.
//   INS-X raises it to 130% (trait bb). Her attack selector is ground-only (`_targetMotion` 1).
// - T1 先声夺人: an aura on the operators of the talent grid (her and the 8 tiles around, professionMask 639 = every class, no
//   summon or device), alga[check_enemy] every 0.1 s: ATK +alga[atk_up].atk (MULTIPLIER), + alga[check_enemy].atk while an ELITE /
//   BOSS enemy is in her attack range or she blocks one; one per 奥尔佳 (`independentCharacterSource`). Her attack takes the highest-ATK
//   elite / leader enemy first (priority eliteAtk) [추정·CN: the selector's `_postFilter` 80 is a filter newer than the EN client, the
//   order is the talent text's].
// - S1 交叉施压 (ReplacementSkill, attack SP, MultiMeleeAttack `_additionalTimes` 1, `_triggerDelta` 0.1): the next attack at atk_scale
//   strikes twice, S1_DELTA apart, the same target while it lives and she can act.
// - S2 只为我的答案 (MANUAL, 15 s): mode Skill2 (the skill's range 3-2, "攻击距离延长"), ATK +atk (alga_2[mode]), the talent's values
//   × talent_scale (Skill2's talent `_applyTalentScale`), and every physical attack damage of hers puts alga_2 on its target for
//   debuff_duration s: 停顿 (sluggish) and alga_2[taunt] (taunt level +attack@taunt_level — 更容易受到友方攻击), which leaves every other
//   enemy she gave it (FinishBuffsOfEveryEnemyById with the source).

import { resolveHit } from '../../../ai.js';
import { absoluteRangeKeys } from '../../../targeting.js';
import { bodyInRange } from '../../../body.js';
import { num, talentBb, talentGrid, skillRec, up, installAura, instantKind } from '../shared/tier1.js';
import { COLS } from '../../../constants.js';

const S1 = 'skchr_alga_1';
const S2 = 'skchr_alga_2';
/** skchr_alga_1 `_triggerDelta` (s). */
export const S1_DELTA = 0.1;
/** alga[check_enemy] `triggerInterval` (s). */
const AURA_IV = 0.1;
const AURA = 'alga[check_enemy]';
const TAUNT = 'alga_2[taunt]';
/** professionMask 639: every operator class, no summon (TOKEN) or device (TRAP). */
const isOperator = (a) => a.kind === 'op';
const isElite = (e) => !!e && (e.isBoss || e.def?.rank === 'ELITE' || e.def?.rank === 'BOSS');
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_4245_alga: (_bb, chess) => {
    const t0 = talentBb(chess, 0), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const grid = talentGrid(chess, 0);
    const base = num(t0['alga[atk_up].atk']), extra = num(t0['alga[check_enemy].atk']);
    const scale = num(b2.talent_scale, 1), debuff = num(b2['attack@debuff_duration']), taunt = num(b2['attack@taunt_level']);
    const on2 = (u) => !!(u.skill && u.skill.active && u.skill.id === S2);
    /** An elite / leader enemy in her attack range, or one she blocks (CheckEnemyLevelMaskInRange, CheckBlockEnemysLevelType). */
    const eliteNear = (battle, unit) => unit.blocking.some(isElite)
      || battle.enemies.some((e) => e.alive && !e.hidden && isElite(e) && bodyInRange(e, unit.rangeKeySet ?? new Set(unit.rangeKeys)));
    const secondStrike = ({ battle, unit, target }) => {
      if (!target) return;
      const prof = { ...battle.effectiveProfile(unit), skillOnHit: null };
      const attackId = battle._attackSeq, seq = unit.deploySeq;
      battle.after(S1_DELTA, (b) => {
        if (!target.alive || !unit.alive || !unit.deployed || unit.deploySeq !== seq || !unit.canAct) return;
        resolveHit(b, unit, prof, target, { isSkill: true, index: 0, attackId }, target.x, target.y);
      }, { owner: unit });
    };
    return {
      trait: { priority: 'eliteAtk' },
      skills: {
        [S1]: {
          kind: instantKind({ skill: { maxCharges: num(skillRec(chess, S1)?.maxChargeTime, 1) } }),
          attack: { atkScale: num(b1.atk_scale, 1), onHit: secondStrike },
        },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk) },
          targeting: skillRec(chess, S2)?.rangeGrid ? { rangeGrid: skillRec(chess, S2).rangeGrid } : undefined,
          onEnd({ battle, unit }) {
            for (const e of battle.enemies) {
              const b = e.findBuff(TAUNT);
              if (b && b.source === unit) battle.removeBuff(e, TAUNT);
            }
          },
        },
      },
      talents: [{ install(battle, unit) {
        if (!grid || !(base || extra)) return;
        installAura(battle, unit, {
          key: `${AURA}:${unit.id}`, interval: AURA_IV, visible: true,
          select: (a) => up(a) && isOperator(a) && new Set(absoluteRangeKeys(grid, unit.tileR, unit.tileC, unit.dir, 0)).has(a.tileR * COLS + a.tileC),
          mods: () => ({ atkPct: (base + (eliteNear(battle, unit) ? extra : 0)) * (on2(unit) ? scale : 1) }),
        });
      } }, { install(battle, unit) {
        if (!(debuff > 0)) return;
        // alga_2[try_add]: her physical attack damage while S2 is on (ON_AFTER_OUTPUT_DAMAGE, NORMAL, PHYSICAL)
        battle.on('damaged', (c) => {
          const e = c.target, d = c.dmg;
          if (c.source !== unit || !on2(unit) || !e || e.side !== 'enemy' || !e.alive || !d?.isAttack || d.type !== 'phys') return;
          battle.applyStatus(e, 'sluggish', { duration: debuff, source: unit });
          if (taunt) {
            for (const o of battle.enemies) {
              const b = o !== e ? o.findBuff(TAUNT) : null;
              if (b && b.source === unit) battle.removeBuff(o, TAUNT);
            }
            battle.addBuff(e, { key: TAUNT, source: unit, duration: debuff, refresh: 'replace', mods: { taunt }, visible: true, tags: ['skill'] });
          }
        }, { owner: unit });
      } }],
    };
  },
};
