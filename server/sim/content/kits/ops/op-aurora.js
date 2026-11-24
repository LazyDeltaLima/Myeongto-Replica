// server/sim/content/kits/ops/op-aurora.js — 极光 (char_422_aurora) kit: 5★ 决战者 (重装), a tier-3 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 무스·미스 크리스틴·브리지드·오로라」); both skills, the talent, the trait and HES-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, HES-X stage 1.
// Sources: the record's tables; PRTS 极光 (备注 of T1, HES-X); charpack char_422_aurora (Trait, Modes/Default/Talents/1, Modes/S2/Body/Attack), skill prefabs
// skchr_aurora_1 / _2, buff_template_data aurora_s_2[freezeattack], aurora_s_2[freezeattack2].
// - Trait 决战者: no SP unless she blocks (SP_RECOVER_STOPPED); HES-X: blocking nobody, SP recovery ×(1 + sp_recover_ratio) instead.
// - T1 低温休憩 (Default mode's ToggleablePassiveBuffAbility + SpRatioToggleChecker): with her skill off and SP at or below sp_ratio of its maximum: DISARMED and HP regen
//   hp_recovery_per_sec_by_max_hp_ratio × max HP per second (PRTS: the 生命回复速度 attribute, no heal bonus, no 禁疗).
// - S1 固守家园 (`_switchToState` 1, `_beginAnim` Skill_Begin): block +block_cnt, DEF +def, 抵抗 (one_minus_status_resistance); stun `stun` s as it ends.
// - S2 人工降雪 (`_switchToState` 1, `_beginAnim` Skill_2_Begin, 9 attacks: `_triggerTimeCount`): ATK +atk, base attack time ×(1 + base_attack_time).
//   Her attack on a FROZEN target has ATK × atk_scale (freezeattack2), on any other target it gives c2e_cold for attack@cold s (freezeattack).

import { num, talentBb, traitBb, skillRec, up, toggleBuff } from '../shared/tier1.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */
/** @import { Unit } from '../../../units.js' */

const S1 = 'skchr_aurora_1';
const S2 = 'skchr_aurora_2';
const REST = 'aurora_t_1';
/** skchr_aurora_2's attack (Modes/S2/Body/Attack `_triggerTimeCount`); the text's 9 too. */
export const S2_BULLETS = 9;
/** Skill_Begin, Skill_2_Begin (data/assets.json `animations`): `BasicSkill.PlayBeginAnimation` waits them out before the skill starts, no attack meanwhile (data `cast.begin`, skills.js beginTime). */
export const S1_BEGIN = 0.5;
export const S2_BEGIN = 0.667;
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** @param {Unit | null | undefined} e */
const frozen = (e) => !!e?.s?.flags?.freeze;

/** @type {KitFns} */
export default {
  char_422_aurora: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const regen = num(t0.hp_recovery_per_sec_by_max_hp_ratio), spRatio = num(t0.sp_ratio);
    return {
      skills: {
        [S1]: {
          kind: 'duration', mods: { defPct: num(b1.def), blockCnt: num(b1.block_cnt) },
          onStart({ battle, unit, skill }) {
            const v = Math.min(0.95, Math.max(0, -num(b1.one_minus_status_resistance)));
            if (v > 0) battle.applyStatus(unit, 'resist', { duration: skill.timeLeft, value: v, source: unit });
          },
          onEnd({ battle, unit }) {
            if (up(unit)) battle.applyStatus(unit, 'stun', { duration: num(b1.stun), source: unit });
          },
        },
        [S2]: {
          kind: 'ammo', ammo: S2_BULLETS, mods: { atkPct: num(b2.atk), batPct: num(b2.base_attack_time) },
        },
      },
      talents: [{ install(battle, unit) {
        if (!(regen > 0)) return;
        const low = () => {
          const sk = unit.skill;
          return !!sk && !sk.active && sk.spCost > 0 && sk.sp / sk.spCost <= spRatio + 1e-9;
        };
        toggleBuff(battle, unit, REST, low, { hpRegenRatio: regen }, { flags: { disarm: true }, visible: true });
      } }],
      install(battle, unit) {
        // as the hit is calculated: on a frozen target the × (freezeattack2, AtkScaleUp: before DEF), on any other the cold (freezeattack)
        battle.on('hit', (c) => {
          if (c.source !== unit || !c.dmg?.isAttack || !unit.skill?.active || unit.skill.id !== S2 || c.target?.side !== 'enemy') return;
          if (frozen(c.target)) c.dmg.amount *= num(b2.atk_scale, 1);
          else battle.applyStatus(c.target, 'cold', { duration: num(b2['attack@cold']), source: unit });
        }, { owner: unit });
        const notBlocking = () => unit.blocking.length === 0;
        if (tb.sp_recover_ratio == null) toggleBuff(battle, unit, 'trait:aurora:duel', notBlocking, null, { flags: { noSp: true } });
        else toggleBuff(battle, unit, 'trait:aurora:duel', notBlocking, { spRecoveryMul: Math.max(0, 1 + num(tb.sp_recover_ratio)) });
      },
    };
  },
};
