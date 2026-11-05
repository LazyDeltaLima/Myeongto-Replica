// server/sim/content/kits/ops/op-leto.js — 烈夏 (char_194_leto) kit: 5★ 领主 (近卫), a tier-1 piece of the season not out yet
// (shared/seasons.js `next`, docs/rules/diy.md 「새 시즌 ○○」); both skills, the talent, the trait and LOR-Y in both forms.
//
// Forms (data/seasons/next/chess.json): normal = E1 Lv55, skills at rank 4, no module; elite = E2 Lv50, rank 7, LOR-Y stage 1.
// Sources: the record's tables; PRTS 烈夏 (备注 of T1, S2 and LOR-Y); buff_template_data leto_skill_judge, leto_t_1[filter_tag], leto_s_2,
// leto_s_2[filter_tag], leto_e_002_tr; charpack char_194_leto (Talents/1, Modes/S2) and skill prefab skchr_leto_2.
// - Trait (领主): the profession (melee at 100%, ranged at atk_scale). LOR-Y "攻击范围内存在2名及以上敌人时攻击速度+12" (module talent bb cnt,
//   attack_speed; leto_e_002_tr CheckHasEnemyInRange on 3-12, `_useAttackRange` off): every 0.1 s by her initial range, the tile of each enemy
//   (PRTS "每隔0.1秒依初始攻击范围判断敌人数量（格子判定）"), whether it can be selected or not.
// - T1 快点快点！ "开启技能时，【乌萨斯学生自治团】干员攻击速度+N，持续至技能结束": any skill of hers (leto_skill_judge: ON_SKILL_START / ON_SKILL_FINISH) turns on
//   a GlobalAuraAbility (`_selfOption`: herself too) whose leto_t_1[filter_tag] gives ASPD to an ally of group tag `student`, wherever it stands
//   (PRTS: one deployed during the skill too); `_removeBuffWhenAbilityDetached`: it ends as she leaves.
// - S1 迅捷打击·γ型: ATK, ASPD.
// - S2 一呼百应: ATK +atk, the mode S2 (attack@max_target enemies, no UpdateAtkScaleByTraitData: ranged at 100%). At its start leto_s_2 runs
//   leto_s_2[filter_tag] on every ally: a `student` one's skill goes off (TriggerSkill `_checkBeforeTrigger` off → Character.RemoteTrigSkill →
//   BasicSkill.IsTriggerable → UseSkill, outside the 卫戍协议 automatic operations' conditions; PRTS "不会改变手动触发技能的本质": only a MANUAL one, as
//   op-tocka.js's same node).

import { num, talentBb, moduleBb, skillRec, up } from '../shared/tier1.js';
import { hasPower } from '../shared/powers.js';
import { absoluteRangeKeys } from '../../../targeting.js';
import { COLS } from '../../../constants.js';

const S1 = 'skcom_quickattack[3]';
const S2 = 'skchr_leto_2';
const STUDENT = 'student';
const T1 = 'leto_t_1[attack_speed]';
const LOR = 'leto_e_002_tr[atk_speed]';
/** leto_e_002_tr's trigger period (PRTS 备注). */
const LOR_IV = 0.1;
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** BasicSkill.IsTriggerable of an ally's skill: on the field, able to act, not silenced, ready, not running, no cast waiting. */
const triggerable = (a) => up(a) && !a.hidden && a.canAct && !a.s.flags.silence && !!a.skill && !a.skill.noSkill && a.skill.kind !== 'passive'
  && a.skill.ready && !(a.skill.active && a.skill.isTimed) && !a.skill.pending;

export default {
  char_194_leto: (bb, chess) => {
    const t0 = talentBb(chess, 0), mb = moduleBb(chess);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(b1.atk), aspd: num(b1.attack_speed) } },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk) },
          targeting: { maxTargets: num(b2['attack@max_target'], 2) },
          attack: { dmgMul: () => 1 },
          onStart({ battle, unit }) {
            battle.addBuff(unit, { key: 'leto_s_2', visible: true });
            for (const a of battle.allyUnits) if (a !== unit && a.kind === 'op' && hasPower(a, STUDENT) && a.skill?.manual && triggerable(a)) a.skill.activate('leto');
          },
          onEnd({ battle, unit }) { battle.removeBuff(unit, 'leto_s_2'); },
        },
      },
      talents: [{ install(battle, unit) {
        // T1: every student on the field for as long as a skill of hers runs
        const v = num(t0.attack_speed);
        let was = false;
        if (v) battle.on('tick', () => {
          const on = up(unit) && !!unit.skill?.active;
          if (!on && !was) return;
          was = on;
          for (const a of battle.allyUnits) {
            if (!hasPower(a, STUDENT)) continue;
            const has = a.findBuff(T1);
            if (on && up(a) && !has) battle.addBuff(a, { key: T1, mods: { aspd: v }, source: unit, visible: true, tags: ['aura'] });
            else if (!on && has) battle.removeBuff(a, T1);
          }
        }, { owner: unit });
        // LOR-Y
        const cnt = num(mb.cnt), lor = num(mb.attack_speed);
        const grid = chess?.rangeGrid;
        if (cnt > 0 && lor && grid) battle.every(LOR_IV, () => {
          if (!up(unit)) return;
          const keys = new Set(absoluteRangeKeys(grid, unit.tileR, unit.tileC, unit.dir, 0));
          let n = 0;
          for (const e of battle.enemies) if (e.alive && e.deployed && keys.has(e.tileR * COLS + e.tileC)) n++;
          const has = unit.findBuff(LOR);
          if (n >= cnt && !has) battle.addBuff(unit, { key: LOR, mods: { aspd: lor }, tags: ['talent'] });
          else if (n < cnt && has) battle.removeBuff(unit, LOR);
        }, { owner: unit });
      } }],
    };
  },
};
