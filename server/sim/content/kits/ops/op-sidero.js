// server/sim/content/kits/ops/op-sidero.js — 铸铁 (char_333_sidero) kit: 5★ 术战者 (近卫), a tier-2 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 재키·체스트넛·시데로카·레이지 아이언하이드」); both skills, the talent and AFT-Y in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv60, skills at rank 4, no module, no talent yet (the record has none);
// elite = E2 Lv55, rank 7, AFT-Y stage 1.
// Sources: the record's tables; charpack char_333_sidero (Modes/Default, S2 Body/Attack, Talents/1), skill prefabs skcom_heal_self /
// skchr_sidero_2, buff_template_data sidero_t_1[listener], sidero_t_1[stack], sidero_e_002_trait.
// - Trait 术战者: arts damage (the artsfghter profile). AFT-Y (elite): the enemies she blocks take weak[magic][inf] — 法术脆弱
//   damage_scale − 1 (trait bb), on while she blocks them (sidero_e_002_trait, ON_OWNER_BLOCKEE_CHANGED, a derived buff).
// - T1 佣兵之韧 (sidero_t_1[listener] → `times` stacks of sidero_t_1[stack]): each enemy she knocks out takes one stack off; the last
//   one gives ASPD +attack_speed and 抵抗 (status_resistance[inf]: −one_minus_status_resistance), both to the end of the deployment.
// - S1 生命回复·γ型 (skcom_heal_self, MANUAL instant, `_isHpRatio`): heals her heal_scale × max HP at once.
// - S2 破浪回神 (MANUAL, 26 / 27 s): mode S2, the skill's range 0-1 (her own tile: the enemies she blocks), ATK +atk, HP regen
//   hp_recovery_per_sec_by_max_hp_ratio × max HP per second (the 生命回复速度 attribute).

import { num, talentBb, traitBb, skillRec, up } from '../shared/tier1.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */

const S1 = 'skcom_heal_self[3]';
const S2 = 'skchr_sidero_2';
const TALENT = 'sidero_t_1';
/** The AFT-Y fragility is kept on her blockees (the derived buff follows ON_OWNER_BLOCKEE_CHANGED). */
const FRAGILE_IV = 0.1;
const FRAGILE_DUR = 0.25;
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_333_sidero: (_bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const s2Grid = skillRec(chess, S2)?.rangeGrid;
    return {
      skills: {
        [S1]: {
          kind: 'instant',
          onStart({ battle, unit }) { battle.heal(unit, unit, unit.s.maxHp * num(b1.heal_scale), { self: true, isSkill: true, tags: ['skill'] }); },
        },
        [S2]: {
          kind: 'duration', mods: { atkPct: num(b2.atk), hpRegenRatio: num(b2.hp_recovery_per_sec_by_max_hp_ratio) },
          targeting: s2Grid ? { rangeGrid: s2Grid } : undefined,
        },
      },
      talents: [{ install(battle, unit) {
        const times = Math.floor(num(t0.times)), aspd = num(t0.attack_speed);
        const resist = Math.min(0.95, Math.max(0, -num(t0.one_minus_status_resistance)));
        if (!(times > 0)) return;
        let left = times;
        battle.on('deploy', (c) => { if (c.unit === unit) left = times; }, { owner: unit });
        battle.on('kill', (c) => {
          if (c.killer !== unit || c.victim?.side !== 'enemy' || left <= 0 || !unit.alive) return;
          left -= 1;
          if (left > 0) return;
          if (aspd) battle.addBuff(unit, { key: `${TALENT}[attack_speed]`, mods: { aspd }, visible: true, tags: ['talent'] });
          if (resist > 0) battle.applyStatus(unit, 'resist', { duration: Infinity, value: resist, source: unit });
        }, { owner: unit });
      } }],
      install(battle, unit) {
        const fragile = num(tb.damage_scale, 1) - 1;
        if (!(fragile > 0)) return;
        battle.every(FRAGILE_IV, () => {
          if (!up(unit)) return;
          for (const e of unit.blocking) if (e.alive) battle.applyStatus(e, 'artsFragile', { duration: FRAGILE_DUR, value: fragile, source: unit });
        }, { owner: unit });
      },
    };
  },
};
