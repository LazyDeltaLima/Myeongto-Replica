// server/sim/content/kits/ops/op-kichi.js — 吉星 (char_4203_kichi) kit: 5★ 散射手 (reaperrange), a tier-3 piece of 规程 (act3autochess) (shared/seasons.js `act3autochess`,
// docs/rules/diy.md 「새 시즌 그레이스롯·아스트젠·그레이 더 라이트닝베어러·키치세이」); both skills, the talent and RPR-X in both forms. The trait is the branch's (professions.js reaperrange: every enemy in range,
// atk_scale on the trait's tiles, RPR-X's 1.6 from the module's trait).
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, RPR-X stage 1.
// Sources: the record's tables; PRTS 吉星 (备注 of the talent and of S2); charpack char_4203_kichi (Others/Direction/Talents/1, Others/Direction/Trait, Modes/*/Body/Attack), skill prefabs skchr_kichi_1 / _2,
// buff_template_data kichi_t, kichi_t[atk_scale], kichi_skchr_01[listener], kichi_skchr_02[listener], kichi_skchr_02[debuff]; DamageScale `_isStackable` = × (1 + value × stacks).
// - T1 好运连击！ (kichi_t ON_TARGET_KILLED): each new enemy id she fells adds a stack up to max_stack_cnt; every damage of hers × (1 + damage_scale × stacks) (PRTS "伤害倍率", any damage). A withdrawal clears the ids (PRTS).
// - S1 欢迎您来！ (mode S1): base attack time +base_attack_time s; after each attack a stack of ATK +atk, up to max_stack_cnt, all gone with the skill (`_decCntIfStack` off).
// - S2 吉星高照！ (mode S2): ATK +atk, base attack time +base_attack_time s; every attack puts one state on all it hits, changing after each attack and starting over with each cast (flags of kichi_skchr_02[listener], PRTS):
//   停顿 attack@sluggish s → 束缚 attack@unmoveable s (abnormal flag UNMOVABLE) → 晕眩 attack@stun s.

import { num, talentBb, skillRec, batMod, onHitBy } from '../shared/tier1.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */
/** @import { BuffRec } from '../../bonds/shared.js' */

const S1 = 'skchr_kichi_1';
const S2 = 'skchr_kichi_2';
const TALENT = 'kichi_t[cnt]';
const RAMP = 'skchr_kichi_01[atk_scale]';
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_4203_kichi: (bb, chess) => {
    const t0 = talentBb(chess, 0), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    /** @type {[string, number][]} */
    const states = [
      ['sluggish', num(b2['attack@sluggish'])],
      ['bind', num(b2['attack@unmoveable'])],
      ['stun', num(b2['attack@stun'])],
    ];
    return {
      skills: {
        [S1]: {
          kind: 'duration', mods: { batPct: batMod(b1.base_attack_time, chess) },
          onEnd({ battle, unit }) { battle.removeBuff(unit, RAMP); },
        },
        [S2]: {
          kind: 'duration', mods: { atkPct: num(b2.atk), batPct: batMod(b2.base_attack_time, chess) },
          onStart({ unit }) { unit.mem.kichiState = 0; unit.mem.kichiAttack = null; },
          attack: {
            onEachHit({ battle, unit, target, attackId }) {
              // the state changes after each attack: on this skill's next attack, seen by its id
              if (unit.mem.kichiAttack !== attackId) {
                if (unit.mem.kichiAttack !== null) unit.mem.kichiState = (unit.mem.kichiState + 1) % states.length;
                unit.mem.kichiAttack = attackId;
              }
              const [key, duration] = states[unit.mem.kichiState];
              if (target?.alive) battle.applyStatus(target, key, { duration, source: unit });
            },
          },
        },
      },
      talents: [{ install(battle, unit) {
        const ds = num(t0.damage_scale), max = Math.floor(num(t0.max_stack_cnt));
        if (!(ds > 0 && max > 0)) return;
        battle.on('deploy', (c) => { if (c.unit === unit) unit.mem.kichiFelled = new Set(); }, { owner: unit });
        battle.on('kill', ({ killer, victim }) => {
          if (killer !== unit || victim?.side !== 'enemy') return;
          const seen = (unit.mem.kichiFelled ??= new Set());
          if (seen.has(victim.defId) || seen.size >= max) return;
          seen.add(victim.defId);
          battle.addBuff(unit, { key: TALENT, refresh: 'stack', stacks: 1, maxStacks: max, visible: true, tags: ['talent'] });
        }, { owner: unit });
        onHitBy(battle, unit, ({ dmg }) => {
          const n = /** @type {BuffRec | null} */ (unit.findBuff(TALENT))?.stacks ?? 0;
          if (n > 0) dmg.mul *= 1 + ds * n;
        });
      } }],
      install(battle, unit) {
        const v = num(b1.atk), cap = Math.floor(num(b1.max_stack_cnt));
        battle.on('attack', ({ attacker }) => {
          if (attacker !== unit || !unit.skill?.active || unit.skill.id !== S1) return;
          if (v > 0 && cap > 0) battle.addBuff(unit, { key: RAMP, refresh: 'stack', stacks: 1, maxStacks: cap, mods: { atkPct: v }, tags: ['skill'] });
        }, { owner: unit });
      },
    };
  },
};
