// server/sim/content/kits/ops/op-frncat.js — 慕斯 (char_185_frncat) kit: 4★ 法术近卫 (近卫), a tier-1 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 무스·미스 크리스틴·브리지드·오로라」); both skills, the talent and AFT-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv55, skills at rank 4, no module; elite = E2 Lv50, rank 7, AFT-X stage 1.
// Sources: the record's tables; PRTS 慕斯 (备注 of S1); charpack char_185_frncat (Talents/1, Modes/Default/Body/Attack), skill prefabs skchr_frncat_1 / _2.
// - T1 连击 (ProbReplaceNextAtkTalent, `_probKey`, family mask 15): with chance prob the attack is the talent's MultiMeleeAttack (`_additionalTimes` 1,
//   `_waitAttackEventForAllAttacks`): clip Attack_2's two OnAttack frames, each a hit of the same attack; `_timeMode` 1, its time is the clip's, whatever her ASPD. Rolled as the swing
//   starts (OnBeforeAttack); that swing carries 'T.1' (its clip and sounds).
// - S1 挠伤 (PassiveAttachmentAbility, attack SP): PRTS: not an AUTO cast, no start or end events; with SP full and not silenced it spends the SP before an
//   attack, that attack has ATK +atk and hits give frncat_s_1[debuff] (ATK +frncat_s_1[debuff].atk for its duration, one per 慕斯: `independentCharacterSource`), and
//   the attack recovers no SP.
// - S2 炸毛: ATK +atk, DEF +def.
// - AFT-X: ASPD +attack_speed while she blocks nobody (trait bb).

import { resolveHit } from '../../../ai.js';
import { num, talentBb, traitBb, skillRec, up, toggleBuff, instantKind } from '../shared/tier1.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */

const S1 = 'skchr_frncat_1';
const S2 = 'skchr_frncat_2';
const NEXT_ATK = 'frncat_s_1';
const DEBUFF = 'frncat_s_1[debuff]';
// What the view draws of frncat_s_1 (`common_next_atk_buff`): the client attaches the skill's ability as the attack starts
// (NextAttackOrCombatSkill.OnBeforeAttack) and detaches it as that attack ends (NextAtkAdditionSkill.CancelAfterAttack, any
// reason). NEXT_ATK itself holds the ATK only from the strike
const NEXT_ATK_FX = 'skill:frncat:nextAtk';
const TALENT_ATTACK = 'T.1';
/** Attack_2 (data/assets.json `animations`): its length and OnAttack frames. */
export const DOUBLE = Object.freeze({ dur: 1.2, first: 0.367, second: 0.633 });
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_185_frncat: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const prob = num(t0.prob), aspd = num(tb.attack_speed);
    return {
      skills: {
        [S1]: {
          kind: instantKind({ skill: { maxCharges: num(skillRec(chess, S1)?.maxChargeTime, 1) } }),
          attack: {
            onEachHit({ battle, unit, target }) {
              if (!target?.alive) return;
              battle.addBuff(target, {
                key: `${DEBUFF}:${unit.id}`, source: unit, duration: num(b1[`${DEBUFF}.duration`]), mods: { atkPct: num(b1[`${DEBUFF}.atk`]) }, visible: true, tags: ['skill'],
              });
            },
            afterAttack(battle, unit) { if (!unit.mem.frncatSecond) { battle.removeBuff(unit, NEXT_ATK); battle.removeBuff(unit, NEXT_ATK_FX); } },
          },
          onEnd({ battle, unit }) { if (!unit.mem.frncatSecond) battle.removeBuff(unit, NEXT_ATK_FX); },
        },
        [S2]: { kind: 'duration', mods: { atkPct: num(b2.atk), defPct: num(b2.def) } },
      },
      talents: [{ install(battle, unit) {
        battle.on('swing', (c) => {
          if (c.unit !== unit) return;
          if (c.isSkill && unit.skill?.id === S1) battle.addBuff(unit, { key: NEXT_ATK_FX, visible: true, tags: ['skill'] });
          unit.mem.frncatDouble = prob > 0 && battle.rng.chance(prob);
          if (!unit.mem.frncatDouble) return;
          c.signal = TALENT_ATTACK;
          c.timing = { strike: DOUBLE.first, action: DOUBLE.dur, cooldown: DOUBLE.dur };
        }, { owner: unit });
        battle.on('beforeAttack', (c) => {
          if (c.attacker !== unit || !up(unit)) return;
          // S1's ATK is the attack's own buff, on as it strikes and until its last hit
          if (c.isSkill && unit.skill?.id === S1) battle.addBuff(unit, { key: NEXT_ATK, mods: { atkPct: num(b1.atk) }, tags: ['skill'] });
          if (!unit.mem.frncatDouble) return;
          unit.mem.frncatDouble = false;
          unit.mem.frncatSecond = true;
          const t = c.targets[0], prof = c.profile, isSkill = c.isSkill, attackId = battle._attackSeq + 1;
          battle.after(DOUBLE.second - DOUBLE.first, () => {
            unit.mem.frncatSecond = false;
            if (up(unit) && unit.canAct && t.alive && !t.hidden) resolveHit(battle, unit, prof, t, { isSkill, index: 0, attackId, signal: TALENT_ATTACK }, t.x, t.y);
            battle.removeBuff(unit, NEXT_ATK);
          }, { owner: unit });
        }, { owner: unit });
      } }],
      install(battle, unit) {
        if (aspd) toggleBuff(battle, unit, 'frncat_e_002_tr', () => unit.blocking.length === 0, { aspd });
      },
    };
  },
};
