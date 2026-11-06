// server/sim/content/kits/ops/op-cuttle.js — 安哲拉 (char_218_cuttle) kit: 5★ 神射手 (狙击), a tier-2 piece of the season not out yet
// (shared/seasons.js `next`, docs/rules/diy.md 「새 시즌 블루포이즌·하이모어·홈바운드·안드레아나」); both skills, the talent, the trait (professions.js longrange) and DEA-X in both forms.
//
// Forms (data/seasons/next/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, DEA-X stage 1.
// Sources: the record's tables; PRTS 安哲拉 (module 备注); charpack char_218_cuttle (Talents/1, Modes/S2), skill prefab skchr_cuttle_2, buff_template_data cuttle_e_trait.
// - T1 深海直觉 (`_deckBuffs` cuttle_t_1, `filterTag` abyssal, `disableOverride`): every 深海猎人 of her player, herself too, has ASPD +attack_speed for the
//   whole battle, deployed or not; two 安哲拉 add up (the buff of each stays).
// - S1 攻击力强化·γ型: ATK +atk.
// - S2 阻滞射击战术 (`_switchToState` 1, `_beginAnim` Skill2_Begin: no attack during it): ATK +atk, mode S2, whose Trigger keeps only enemies of HP ratio ≥ 0.5
//   (`_filterMinHp`, `_minHpRatio`; PRTS 不再以生命值低于50%的敌人为目标), so with none left she does not attack; a hit puts cuttle_s_2[debuff] on its target: MOVE_SPEED
//   FINAL_SCALER, attack@duration s, one per enemy.
// - DEA-X (cuttle_e_trait, DamageScaleBaseOnDistance): × up to 1 + damage_scale, linear from min_dist to max_dist.

import { num, talentBb, traitBb, skillRec } from '../shared/tier1.js';
import { hasPower } from '../shared/powers.js';
import { hypot } from '../../../detmath.js';

const S1 = 'skcom_atk_up[3]';
const S2 = 'skchr_cuttle_2';
/** Skill2_Begin's length (data/assets.json `animations`). */
export const S2_BEGIN = 0.667;
const MIN_HP = 0.5;
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_218_cuttle: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const slow = Math.max(0, 1 + num(b2['attack@move_speed'])), slowFor = num(b2['attack@duration']);
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(b1.atk) } },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk) },
          attack: {
            skipEnemy: (e) => e.hpRatio < MIN_HP - 1e-9,
            onEachHit({ battle, unit, target }) {
              if (target?.alive && slowFor > 0) battle.addBuff(target, { key: 'cuttle_s_2[debuff]', source: unit, duration: slowFor, mods: { moveMul: slow }, visible: true, tags: ['skill'] });
            },
          },
          onStart({ battle, unit }) { unit.skillStateUntil = battle.time + S2_BEGIN; },
        },
      },
      talents: [{ install(battle, unit) {
        const v = num(t0.attack_speed);
        if (!v) return;
        for (const a of battle.allyUnits) {
          if (a.kind === 'op' && a.ownerId === unit.ownerId && hasPower(a, 'abyssal')) {
            battle.addBuff(a, { key: `cuttle_t_1:${unit.id}`, mods: { aspd: v }, persist: true, allowDead: true, source: unit, tags: ['talent'] });
          }
        }
      } }],
      install(battle, unit) {
        const ds = num(tb.damage_scale), lo = num(tb.min_dist, 1), hi = num(tb.max_dist, 4.5);
        if (!(ds > 0)) return;
        battle.on('hit', (c) => {
          if (c.source !== unit || !c.dmg?.isAttack) return;
          const d = hypot(c.target.x - unit.x, c.target.y - unit.y);
          c.dmg.mul *= 1 + ds * Math.max(0, Math.min(1, (d - lo) / Math.max(1e-6, hi - lo)));
        }, { owner: unit });
      },
    };
  },
};
