// server/sim/content/kits/ops/op-aosta.js — 奥斯塔 (char_346_aosta) kit: 5★ 散射手 (狙击), a tier-2 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 디아만테·리프레사·체르니·아오스타」); both skills, the talent, the trait (professions.js reaperrange) and RPR-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, RPR-X stage 1 (trait atk_scale, read by the profile).
// Sources: the record's tables; PRTS 奥斯塔 (备注 of T1); charpack char_346_aosta (Modes/Default/Body/Talent/1, Modes/S2/Body/Talent/1, Modes/S2/Body/Attack), skill prefab
// skchr_aosta_2, buff_template_data aosta_t_1.
// - T1 尖钉 (`_additiveActiveBuffs` aosta_t_1, overrideType EXTEND, takeSnapshotWhenExtend, one per enemy whoever shot it): every enemy her attack hits holds it for
//   duration s; each second, unless blocked then (CheckBlocked, IfNot), atk_scale × her ATK of when it was last given as arts, outside her trait's front ×. Under S2 ×
//   talent_scale (`_applyTalentScale`). The first tick comes after 1 s (`waitFirstTriggerInterval`).
// - S1 迅捷打击·γ型: ATK +atk, ASPD +attack_speed.
// - S2 影钉: base attack time ×(1 + base_attack_time) (the buff's MULTIPLIER, PRTS +50%), ATK +atk, every enemy hit is bound attack@frozen_duration s (aosta_s_2[unmovable]).

import { num, talentBb, skillRec } from '../shared/tier1.js';

const S1 = 'skcom_quickattack[3]';
const S2 = 'skchr_aosta_2';
const BLEED = 'aosta_t_1';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_346_aosta: (bb, chess) => {
    const t0 = talentBb(chess, 0), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(b1.atk), aspd: num(b1.attack_speed) } },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk), batPct: num(b2.base_attack_time) },
          attack: {
            onEachHit({ battle, unit, target }) {
              if (target?.alive) battle.applyStatus(target, 'bind', { duration: num(b2['attack@frozen_duration']), source: unit });
            },
          },
        },
      },
      talents: [{ install(battle, unit) {
        const scale = num(t0.atk_scale), dur = num(t0.duration);
        if (!(scale > 0 && dur > 0)) return;
        battle.on('damaged', (c) => {
          if (c.source !== unit || !c.dmg?.isAttack || c.target?.side !== 'enemy' || !c.target.alive) return;
          const e = c.target, sk = unit.skill;
          const data = { amount: unit.s.atk * scale * (sk?.active && sk.id === S2 ? num(b2.talent_scale, 1) : 1), from: unit };
          const had = e.findBuff(BLEED);
          if (had) Object.assign(had.data, data);
          battle.addBuff(e, {
            key: BLEED, source: unit, duration: dur, interval: 1, refresh: 'extend', visible: true, data, tags: ['talent', 'dot'],
            onTick: ({ battle: b, unit: x, buff }) => {
              if (x.blockedBy) return;
              b.dealDamage(buff.data.from, x, { amount: buff.data.amount, type: 'arts', ignoreSelect: true, tags: ['talent', 'dot', 'periodic'] });
            },
          });
        }, { owner: unit });
      } }],
    };
  },
};
