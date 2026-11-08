// server/sim/content/kits/ops/op-halo.js — 星源 (char_135_halo) kit: 5★ 链术师, a tier-2 piece of 规程 (act3autochess) (shared/seasons.js `act3autochess`,
// docs/rules/diy.md 「새 시즌 그레이스롯·아스트젠·그레이 더 라이트닝베어러·키치세이」); both skills, the talent and CHA-Y in both forms. The trait is the branch's (professions.js chain: 3 enemies, −15 %;
// the elite's CHA-Y 4 enemies, no falloff, from its trait text and `attack@chain.atk_scale`).
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, CHA-Y stage 1.
// Sources: the record's tables; PRTS 星源; charpack char_135_halo (Others/Direction/Talents/1, Modes/S2/Body/Attack), skill prefabs skchr_halo_1 / _2, projectiles projectile_chr_halo / _s1 / _s2 (ChainLightningHitBehaviour
// `_useChainPrefix`, `_atkScale` 0.85), buff_template_data halo_t_1.
// - T1 科研热忱 (halo_t_1, triggered every `interval` s, the first after one interval): attack_speed per stack up to max_stack_cnt, counted from the deployment; at the full count the buff halo_t_1[effect] (its effect).
// - S1 双端导流 (ReplacementSkill, AUTO, `ct` charges): the next attack at atk_scale strikes max_target targets, each its own chain over chain.max_target enemies (one projectile each, so two chains may share enemies);
//   the falloff is the trait's, CHA-Y's `skill@chain.atk_scale` 1 on the elite.
// - S2 星束交汇 (mode S2, its range 3-3): ATK +atk, attack@max_target targets, each with the trait's chain.

import { num, talentBb, skillRec, up } from '../shared/tier1.js';

const S1 = 'skchr_halo_1';
const S2 = 'skchr_halo_2';
const STACK = 'halo_t_1[stack]';
const FULL = 'halo_t_1[effect]';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_135_halo: (bb, chess) => {
    const t0 = talentBb(chess, 0), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), s2 = skillRec(chess, S2);
    return {
      skills: {
        [S1]: { kind: num(skillRec(chess, S1)?.maxChargeTime, 1) > 1 ? 'charges' : 'instant', attack: { atkScale: num(b1.atk_scale, 1), maxTargets: Math.max(1, Math.floor(num(b1.max_target, 1))) } },
        [S2]: {
          kind: 'duration', mods: { atkPct: num(b2.atk) },
          targeting: { rangeGrid: s2?.rangeGrid ?? null, maxTargets: Math.max(1, Math.floor(num(b2['attack@max_target'], 1))) },
        },
      },
      talents: [{ install(battle, unit) {
        const v = num(t0.attack_speed), every = num(t0.interval), max = Math.floor(num(t0.max_stack_cnt));
        if (!(v > 0 && every > 0 && max > 0)) return;
        battle.on('tick', () => {
          if (!up(unit)) return;
          const want = Math.min(max, Math.floor((battle.time - (unit.deployedAt ?? 0)) / every));
          for (let have = unit.findBuff(STACK)?.stacks ?? 0; have < want; have++) {
            battle.addBuff(unit, { key: STACK, refresh: 'stack', stacks: 1, maxStacks: max, mods: { aspd: v }, tags: ['talent'] });
          }
          if (want >= max && !unit.findBuff(FULL)) battle.addBuff(unit, { key: FULL, visible: true, tags: ['talent'] });
        }, { owner: unit });
      } }],
      install(battle, unit) {
        // the chain's shape comes from the resolved profile (its falloff included); S1 goes over its own count of enemies
        const ch = unit.profile.chain, spec = unit.skill?.id === S1 ? unit.skill.spec.attack : null;
        if (spec) spec.chain = { ...ch, count: Math.max(1, Math.floor(num(b1['chain.max_target'], ch?.count ?? 3))), sluggish: num(b1.sluggish, ch?.sluggish ?? 0.5) };
      },
    };
  },
};
