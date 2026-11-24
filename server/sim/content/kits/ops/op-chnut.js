// server/sim/content/kits/ops/op-chnut.js — 褐果 (char_4041_chnut) kit: 4★ 行医 (医疗), a tier-1 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 재키·체스트넛·시데로카·레이지 아이언하이드」); both skills, the talent and WDM-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv55, skills at rank 4, no module; elite = E2 Lv50, rank 7, WDM-X stage 1.
// Sources: the record's tables; charpack char_4041_chnut (Modes/Default, S2, S2(Down) Body/Attack, Talents/1), skill prefabs
// skchr_chnut_1 / _2, buff_template_data chnut_t_1, chnut_s_1, chnut_s_2[switch_mode].
// - Trait 行医: the heal recovers ep_heal_ratio × ATK of 元素损伤 too (the wandermedic profile; WDM-X raises the trait's ratio).
// - T1 脚踏实地 (chnut_t_1, ON_OUTPUT_MODIFIER IsElementHeal + CheckHeightTypeOfCharacterRootTile LOWLAND): her element recovery on an
//   ally standing on low ground × ep_heal_scale.
// - S1 积微成著 (MANUAL, charges, `_switchToState` 1, `_useTriggerInManualMode`): at the Skill clip's strike one heal of ATK on the ally her
//   skill trigger picks (元素损伤 first, then the HP ratio — `_postFilter` HP_RATIO_ASC_EP_MIN_ASC_FIRST_NOT_ALL_FULL), its element recovery
//   × trait_scale (chnut_s_1); the talent applies to it too.
// - S2 厚土迸发 (MANUAL, 30 / 35 s): mode S2 (S2(Down) facing down — the same attack), the skill's range 3-2, ASPD +attack_speed. Its
//   attack is a ContinuouslyRangedHeal: a heal on the same ally as the attack before it heals × attack@heal_continuously_scale, its
//   element recovery too (`_applyScaleForEPHeal`); the first heal of the skill has no such ally before it.

import { num, talentBb, traitBb, skillRec, up, instantKind } from '../shared/tier1.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */

const S1 = 'skchr_chnut_1';
const S2 = 'skchr_chnut_2';
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_4041_chnut: (_bb, chess, def) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const ground = num(t0.ep_heal_scale, 1), traitScale = num(b1.trait_scale, 1), again = num(b2['attack@heal_continuously_scale'], 1);
    const epRatio = num(tb.ep_heal_ratio, 0.5);
    /** @param {Battle} battle @param {Unit | null | undefined} a */
    const lowland = (battle, a) => !!a && a.ground !== false && battle.grid.isLow(a.tileR, a.tileC);
    const s2Grid = skillRec(chess, S2)?.rangeGrid;
    /** Her heal's scales on `a`: the talent on low ground, S2's repeated ally (unit.mem.chnutAgain, set as the attack starts). @param {Battle} battle @param {Unit} unit @param {Unit | null | undefined} a */
    const scaleOn = (battle, unit, a) => {
      const rep = unit.mem.chnutAgain === a && unit.skill?.active && unit.skill.id === S2 ? again : 1;
      return { hp: rep, ep: rep * (lowland(battle, a) ? ground : 1) };
    };
    return {
      trait: { heal: { mode: 'single', elementHealRatio: epRatio, scaleOn } },
      skills: {
        [S1]: {
          kind: instantKind(def),
          // the ally her skill trigger holds (`_useTriggerInManualMode`: CastSkill.DoCast searches it and casts at its target —
          // skills.js trigTarget: the most 元素损伤 first, then the lowest HP ratio)
          onStart({ battle, unit, skill }) {
            const t = skill.cast?.trig ? skill.trigTarget(skill.cast.trig) : undefined;
            skill.castPick = t !== undefined ? t : battle.injuredAlliesInKeys(unit.rangeKeys, unit, true)[0] ?? null;
          },
          onStrike({ battle, unit, skill }) {
            const t = skill.castPick;
            if (!up(unit) || !t?.alive || !t.deployed) return;
            const atk = unit.s.atk;
            battle.reduceElement(t, atk * epRatio * traitScale * (lowland(battle, t) ? ground : 1));
            battle.heal(unit, t, atk, { isSkill: true, tags: ['skill'] });
          },
        },
        [S2]: {
          kind: 'duration', mods: { aspd: num(b2.attack_speed) },
          targeting: s2Grid ? { rangeGrid: s2Grid } : undefined,
          onStart({ unit }) { unit.mem.chnutLast = null; unit.mem.chnutAgain = null; },
        },
      },
      talents: [],
      install(battle, unit) {
        // ContinuouslyRangedHeal.OnCastStart: is this attack's ally the one before it
        battle.on('beforeAttack', (c) => {
          if (c.attacker !== unit || !up(unit)) return;
          const t = c.targets?.[0] ?? null;
          const on = !!(unit.skill?.active && unit.skill.id === S2);
          unit.mem.chnutAgain = on && t && unit.mem.chnutLast === t ? t : null;
          if (on) unit.mem.chnutLast = t;
          // its shot: `_secondProjectileKey` projectile_chr_chnut_3 (chnut_skill_02_hit_02) — the 'atk' signal (char_modes.py talentAtk)
          if (unit.mem.chnutAgain) c.signal = 'Second';
        }, { owner: unit, priority: -50 });
      },
    };
  },
};
