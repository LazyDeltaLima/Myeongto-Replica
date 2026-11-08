// server/sim/content/kits/ops/op-bison.js — 拜松 (char_325_bison) kit: 5★ 铁卫 (重装), a tier-1 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 ○○」); both skills, the talent, the trait and PRO-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv55, skills at rank 4, no module; elite = E2 Lv50, rank 7, PRO-X stage 1.
// Sources: skill_table / character_table / battle_equip_table (as built into the record); PRTS 拜松 (S2 备注 "技能期间，自身丢失全部
// 视野"); the client's battle data: charpack char_325_bison (Talents/1 AuraAbility bison_t_1, Modes/S2) and skill prefab skchr_bison_2.
// - Trait (铁卫) "能够阻挡三个敌人": the profession default. PRO-X "阻挡敌人时防御力+20%" (trait bb def): while he blocks.
// - T1 交叉掩护 "在场时自身防御力+N，自己身后的如果是【先锋】或【近卫】干员也能享受到相同效果" (bb def, flat: bison_t_1 attribute DEF,
//   ADDITION; the talent's grid [[0,-1],[0,0]]): an aura of his grid with `_selfOption` include, the validator's professionMask
//   513 = WARRIOR | PIONEER, so he always holds it and only such an operator on the tile behind him does.
// - S1 防御力强化·γ型: DEF +def for its duration.
// - S2 深化阵线: AuraAbility on the skill's range x-5, `_selfOption` exclude: the others there hold bison_s_2[ally] (DEF +); his
//   passive bison_s_2[self] (DEF +, taunt_level +1, the mode S2 whose attack trigger selects nobody: "停止攻击敌人" = 丢失全部视野).
// Both skills' trigger is the data's TAKE_DAMAGE (the 重装 row).

import { num, talentBb, talentGrid, traitBb, skillRec, up, installAura, toggleBuff } from '../shared/tier1.js';
import { absoluteRangeKeys } from '../../../targeting.js';
import { COLS } from '../../../constants.js';

const S1 = 'skcom_def_up[3]';
const S2 = 'skchr_bison_2';
/** The aura's selection period [추정·엔진: an aura re-selects often enough that a piece deployed behind him holds it at once]. */
const AURA_IV = 0.2;
const COVERED = new Set(['PIONEER', 'WARRIOR']);
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const keySetOf = (unit, grid) => new Set(absoluteRangeKeys(grid, unit.tileR, unit.tileC, unit.dir, 0));
const onTile = (a, set) => set.has(a.tileR * COLS + a.tileC);

export default {
  char_325_bison: (bb, chess) => {
    const t0 = talentBb(chess, 0), grid = talentGrid(chess, 0) ?? [[0, -1], [0, 0]];
    const tb = traitBb(chess);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const s2Grid = skillRec(chess, S2)?.rangeGrid ?? null;
    const on2 = (u) => !!(u.skill && u.skill.active && u.skill.id === S2);
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { defPct: num(b1.def) } },
        [S2]: {
          kind: 'duration',
          mods: { defPct: num(b2['bison_s_2[self].def']), taunt: num(b2['bison_s_2[self].taunt_level']) },
          targeting: s2Grid ? { rangeGrid: s2Grid } : undefined,
          attack: { noAttack: true },
          onStart({ battle, unit }) { battle.addBuff(unit, { key: 'bison_s_2[self]', visible: true }); },
          onEnd({ battle, unit }) { battle.removeBuff(unit, 'bison_s_2[self]'); },
        },
      },
      talents: [{ install(battle, unit) {
        const v = num(t0.def);
        if (v) installAura(battle, unit, {
          key: 'bison_t_1', value: v, interval: AURA_IV, mods: { defFlat: v },
          select: (a) => up(a) && (a === unit || (a.kind === 'op' && COVERED.has(a.def?.profession) && onTile(a, keySetOf(unit, grid)))),
        });
        const ally = num(b2['bison_s_2[ally].def']);
        if (ally && s2Grid) installAura(battle, unit, {
          key: 'bison_s_2[ally]', value: ally, interval: AURA_IV, mods: { defPct: ally }, visible: true,
          select: (a) => a !== unit && up(a) && on2(unit) && onTile(a, keySetOf(unit, s2Grid)),
        });
        if (num(tb.def)) toggleBuff(battle, unit, 'bison:guard', () => unit.blocking.length > 0, { defPct: num(tb.def) });
      } }],
    };
  },
};
