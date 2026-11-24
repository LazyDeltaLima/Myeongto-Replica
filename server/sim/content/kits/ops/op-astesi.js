// server/sim/content/kits/ops/op-astesi.js — 星极 (char_274_astesi) kit: 5★ 术战者 (近卫), a tier-2 piece of 规程 (act3autochess) (shared/seasons.js `act3autochess`,
// docs/rules/diy.md 「새 시즌 아스테시아·콘트레일·에단」); both skills, the talent and the module's trait in both forms. Her arts melee attack is the branch's (professions.js artsfghter).
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, AFT-Y stage 1.
// Sources: the record's tables; PRTS 星极 (no 备注 on her page); charpack char_274_astesi (Talents/1, Modes/S2), skill prefabs skchr_astesi_1 / _2, buff_template_data astesi_t_1, astesi_e_002_trait.
// - T1 天体仪 (astesi_t_1, a template that fires every `interval` s of the deployment, the first after a whole one; the table's 20 s, not the prefab's fallback 30): each adds one stack of
//   astesi_t_1[Stack] (ATTACK_SPEED +attack_speed, at most max_stack_cnt). A new deployment starts over. Its second modifier (DEF) reads a key her table does not have, so 0.
// - Module's trait: every enemy she blocks has 法术脆弱 damage_scale − 1 (astesi_e_002_trait: ON_OWNER_BLOCKEE_CHANGED, weak[magic][inf] on the blockees, gone when the block ends), the status renewed
//   as 薇薇安娜's and 史尔特尔's.
// - S1 星座守护: ATK +atk, DEF +def.
// - S2 星辉剑 (mode S2, its selector `_limitedMaxTargetNumToBlockedCnt`): ATK +atk, DEF +def, block +block_cnt, attacks every enemy she blocks.

import { num, talentBb, traitBb, skillRec, up } from '../shared/tier1.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */

const S1 = 'skchr_astesi_1';
const S2 = 'skchr_astesi_2';
const STACK = 'astesi_t_1[Stack]';
/** How often the 法术脆弱 of her blockees is renewed, and for how long (s). */
const FRAGILE_IV = 0.2, FRAGILE_DUR = 0.3;
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_274_astesi: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(b1.atk), defPct: num(b1.def) } },
        [S2]: { kind: 'duration', mods: { atkPct: num(b2.atk), defPct: num(b2.def), blockCnt: num(b2.block_cnt) }, attack: { hitAllBlocked: true } },
      },
      talents: [
        { install(battle, unit) {
          const iv = num(t0.interval), v = num(t0.attack_speed), max = Math.floor(num(t0.max_stack_cnt));
          if (!(iv > 0 && v > 0 && max > 0)) return;
          let next = Infinity, n = 0;
          battle.on('deploy', ({ unit: u }) => { if (u === unit) { next = battle.time + iv; n = 0; } }, { owner: unit });
          battle.on('tick', () => {
            if (!up(unit) || n >= max || battle.time + 1e-9 < next) return;
            n += 1; next += iv;
            battle.addBuff(unit, { key: STACK, refresh: 'replace', mods: { aspd: n * v }, tags: ['talent'] });
          }, { owner: unit });
        } },
        { install(battle, unit) {
          const fragile = num(tb.damage_scale, 1) - 1;
          if (!(fragile > 0)) return;
          battle.every(FRAGILE_IV, () => {
            if (!up(unit)) return;
            for (const e of unit.blocking) if (e.alive) battle.applyStatus(e, 'artsFragile', { duration: FRAGILE_DUR, value: fragile, source: unit });
          }, { owner: unit });
        } },
      ],
    };
  },
};
