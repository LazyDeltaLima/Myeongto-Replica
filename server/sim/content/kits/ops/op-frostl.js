// server/sim/content/kits/ops/op-frostl.js — 霜叶 (char_193_frostl) kit: 4★ 领主 (近卫), a tier-1 piece of the season not out yet (shared/seasons.js `next`,
// docs/rules/diy.md 「새 시즌 팽 더 파이어 샤픈드·폰사이러스·프로스트리프·바르카리스」); both skills, the talent and LOR-X (stage 1) in both forms. The trait is the branch's (professions.js lord: ×atk_scale at range).
//
// Forms (data/seasons/next/chess.json): normal = E1 Lv55, skills at rank 4, no module, no talent yet; elite = E2 Lv50, rank 7, LOR-X stage 1.
// Sources: the record's tables; PRTS 霜叶 (备注 of T1, S1, LOR-X); charpack char_193_frostl (Talents/1, Modes/S2), skill prefabs skchr_frostl_1 / _2, buff_template_data frostl_e_002_tr.
// - T1 掩护打击 (elite): BAT +base_attack_time, its range replaces hers (`_overrideDefaultRangeId`; PRTS 备注 "将覆写霜叶的默认攻击范围"). Stages 2–3's 寒冷 are not this season's: its pieces are stage 1.
// - LOR-X: atk_scale_m × ATK arts after each hit (frostl_e_002_tr ON_CALCULATE_DAMAGE, attack type ADDITION; PRTS 备注 "预计算的法术附加伤害"), as 荆棘 / 白金's.
// - S1 寒霜枪刃 (ReplacementSkill, RangedAttack): her next attack at atk_scale, physical, without the trait's ×0.8 (PRTS 备注), at any range; the target's move speed ×(1 + move_speed) for
//   `duration` s (frostl_s_1, `_activeBuffs`).
// - S2 凝冰枪刃 (`_switchToState` 1): ASPD +attack_speed; each hit (both her melee and ranged attacks, `_targetFamilyMask` 3): move speed ×(1 + move_speed) for `debuff` s (frostl_s_2[slow]) and
//   with chance prob 束缚 for `debuff` s (frostl_s_2[frozen] abnormal UNMOVABLE). Her attacks keep the trait's ×0.8 (mode S2's `_defaultValue`).

import { num, talentBb, talentGrid, traitBb, skillRec } from '../shared/tier1.js';
import { batFlat } from '../shared/tier4.js';

const S1 = 'skchr_frostl_1';
const S2 = 'skchr_frostl_2';
const S1_SLOW = 'frostl_s_1';
const S2_SLOW = 'frostl_s_2[slow]';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const noRangedCut = () => 1;

export default {
  char_193_frostl: (bb, chess, def) => {
    const t0 = talentBb(chess, 0), grid = talentGrid(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const slow = (battle, unit, target, key, v, duration) => {
      if (target?.alive && target.side === 'enemy' && duration > 0) {
        battle.addBuff(target, { key, source: unit, duration, refresh: 'replace', mods: { moveMul: Math.max(0, 1 + v) }, visible: true, tags: ['skill'] });
      }
    };
    return {
      skills: {
        [S1]: {
          kind: 'instant',
          attack: {
            atkScale: num(b1.atk_scale, 1), dmgMul: noRangedCut,
            onEachHit({ battle, unit, target }) { slow(battle, unit, target, S1_SLOW, num(b1.move_speed), num(b1.duration)); },
          },
        },
        [S2]: {
          kind: 'duration', mods: { aspd: num(b2.attack_speed) },
          attack: {
            onEachHit({ battle, unit, target }) {
              const dur = num(b2.debuff);
              slow(battle, unit, target, S2_SLOW, num(b2.move_speed), dur);
              if (target?.alive && battle.rng.chance(num(b2.prob))) battle.applyStatus(target, 'bind', { duration: dur, source: unit });
            },
          },
        },
      },
      talents: [{ install(battle, unit) {
        const bat = num(t0.base_attack_time);
        if (bat) battle.addBuff(unit, { key: 'frostl_t_1', persist: true, allowDead: true, mods: { batPct: batFlat(def, bat) }, tags: ['talent'] });
        if (grid) unit.rangeGrid = grid;
        const m = num(tb.atk_scale_m);
        if (m > 0) {
          battle.on('damaged', (c) => {
            if (c.source !== unit || !c.dmg?.isAttack || !c.target?.alive || c.target.side !== 'enemy') return;
            battle.dealDamage(unit, c.target, { amount: unit.s.atk * m, type: 'arts', tags: ['module', 'addition'] });
          }, { owner: unit });
        }
      } }],
    };
  },
};
