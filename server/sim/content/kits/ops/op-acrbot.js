// server/sim/content/kits/ops/op-acrbot.js — “暴躁铁皮” (char_618_acrbot) kit: 6★ 不屈者 (重装), the hidden tier-5 piece of 规程
// (act3autochess, `chess_char_5_22`; shared/seasons.js; docs/rules/diy.md 「새 시즌 재키·체스트넛·시데로카·레이지 아이언하이드」) that the
// strategy 【暴躁铁皮】 (band_mech) hands out; its skill, both talents and UNY-X in both forms. A CN-only operator: the CN client.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skill at rank 4, no module; elite = E2 Lv60, rank 7, UNY-X stage 1.
// Sources: the record's tables; CN charpack char_618_acrbot (Modes/Default and Sk1 Body/Combat + Attack, Talents/1 and /2,
// CommonAbilities/Ability0), CN skill prefab skchr_acrbot_1, buff_template_data acrbot[t2], acrbot_e_002_tr, acrbot[equip-vfx].
// - Trait 不屈者 "无法被友方角色治疗": the unyield profile (`noHeal`; acrbot[equip-vfx] HEAL_FREE). UNY-X (elite): damage from a unit it
//   blocks × damage_scale (acrbot_e_002_tr, CheckBlocked + DamageScale).
// - Its attack selectors (Default and Sk1, Combat and Attack) carry `_limitedMaxTargetNumToBlockedCnt` and no target cap: it strikes up
//   to its block count of targets, the blocked ones first (`hitAllBlocked`, the 强攻手 rule — ai.js targetCount).
// - T1 荒蛮之心 (acrbot[t2], ON_OWNER_KILLED EmitProjectileOnSourceRootTile projectile_chr_acrbot_t2): knocked out, it bursts on its tile:
//   atk_scale × ATK arts damage (`_forceUseProjectileCachedAtk`: its ATK as it falls) on every enemy within projectile_range, each one
//   stunned for `stun` s.
// - T2 酋长之威 (acrbot[t1]): block +block_cnt and its range ability_range_forward_extend tiles longer (1, the elite 2); the equipment
//   slots of the line (4, elite 6: the record's equipSlotNum) belong to the equipment rules, not to this kit.
// - S1 大丑的愤怒 (MANUAL, attack SP, 20 s; acrbot[sk1] switch_mode_restart_fsm_if_alive → mode Sk1): base attack time −0.6 s
//   (ADDITION), ATK +atk, max HP +max_hp, immune to 晕眩 冻结 沉默 浮空 沉睡 (and 昏睡: abnormalImmunes STUNNED FROZEN SILENCED LEVITATE
//   DOZE, combo SLEEPING). Mode Sk1's selectors take both sides but itself (`_targetSide` ALL, `_excludeOwner`): it strikes the
//   allies of its range too, with no enemy there as well (`alliesToo`). [추정·CN: the order of enemies and allies in one list
//   (`_postFilter` HATRED_DES) is not readable — the enemies first; with targets up to its block count it reaches all of them anyway
//   on a range of 2–3 tiles]

import { num, talentBb, traitBb, skillRec, statBuff, batMod } from '../shared/tier1.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */

const S1 = 'skchr_acrbot_1';
/** acrbot[sk1]'s abnormalImmunes as this engine's statuses. */
const S1_IMMUNE = Object.freeze(new Set(['stun', 'freeze', 'silence', 'levitate', 'sleep']));
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_618_acrbot: (_bb, chess) => {
    const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1), tb = traitBb(chess), b1 = bbOf(chess, S1);
    return {
      trait: { hitAllBlocked: true },
      skills: {
        [S1]: {
          kind: 'duration',
          mods: { batPct: batMod(b1.base_attack_time, chess), atkPct: num(b1.atk), hpPct: num(b1.max_hp) },
          attack: { alliesToo: true },
        },
      },
      talents: [
        { install(battle, unit) {
          const scale = num(t0.atk_scale), stun = num(t0.stun), radius = num(t0.projectile_range);
          if (!(radius > 0)) return;
          battle.on('death', (c) => {
            if (c.unit !== unit || c.reason !== 'killed') return;
            const atk = unit.s.atk, x = unit.x, y = unit.y;
            battle.fx('aoe', { x, y, r: radius, id: unit.id, skill: 'acrbot_t2' });
            for (const e of battle.foesInRadius(x, y, radius, true)) {
              battle.dealDamage(unit, e, { amount: atk * scale, type: 'arts', isSkill: false, tags: ['talent'] });
              if (e.alive && stun > 0) battle.applyStatus(e, 'stun', { duration: stun, source: unit });
            }
          }, { owner: unit });
        } },
        { install(battle, unit) {
          statBuff(battle, unit, 'talent:acrbot:block', { blockCnt: num(t1.block_cnt) });
          const ext = Math.round(num(t1.ability_range_forward_extend));
          if (ext > 0) battle.addBuff(unit, { key: 'talent:acrbot:range', mods: { rangeExtend: ext }, persist: true, allowDead: true, tags: ['talent'] });
        } },
      ],
      install(battle, unit) {
        battle.on('beforeStatus', (c) => {
          if (c.target === unit && unit.skill?.active && unit.skill.id === S1 && S1_IMMUNE.has(c.status)) c.cancel = true;
        }, { owner: unit });
        const cut = num(tb.damage_scale, 1);
        if (cut > 0 && cut < 1) {
          battle.on('hit', (c) => { if (c.target === unit && c.source && c.source.blockedBy === unit) c.dmg.mul *= cut; }, { owner: unit });
        }
      },
    };
  },
};
