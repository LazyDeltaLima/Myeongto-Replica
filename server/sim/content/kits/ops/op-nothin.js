// server/sim/content/kits/ops/op-nothin.js — 乌有 (char_455_nothin) kit: 5★ 行商 (特种), a tier-3 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 ○○」); both skills, the talent, the trait and MER-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, MER-X stage 1.
// Sources: the record's tables; PRTS 乌有 (S2 备注 "每次部署后第一次技能开始动画结束时从三种随机效果种随机选择一个，技能关闭后下次开启时从剩余2个效果中随机选择；再部署时重置上述
// 选择记录", 子虚 减攻速 "于每次即将造成伤害时施加"); buff_template_data nothin_t_1, nothin_s_2[a], nothin_tr; charpack char_455_nothin (Talents/1
// ToggleablePassiveBuffAbility + AdvancedCompoundToggleChecker) and skill prefabs skchr_nothin_1 / _2 (PassiveOneOfBuffAbility `_selectMethod` RANDOM_BUT_NOT_LAST).
// - Trait (行商) "在场时每3秒消耗3点部署费用（不足时自动撤退）": the profession (professions.js merchant; nothin_tr CheckCost / ModifyCost / Withdraw). MER-X: 2 (trait bb cost).
// - T1 出其不意 "如果4秒内没有主动攻击过，下一次攻击的攻击力提升至N%并晕眩目标4秒": the checker starts off (`_isInitToggled` 0) and comes on `delay` s after the deployment
//   (ToggleablePassiveBuffAbility.OnAttached); while on he holds nothin_t_1 and nothin_t_1[eff]. Every damage he deals turns it off and puts it `delay` s ahead
//   (`_disableWhenAttack`, `_OnOutputDamage`: also while off). While on, that damage has atk_scale × as an attack multiplier and stuns the target `stun` s.
// - S1 知难而退 (AUTO, SP 9 / 8, 5 s): "携带此技能时阻挡数+1" (nothin_s_1[passive_block_cnt]); cast the moment his HP ratio is ≤ max_hp_ratio (its selector
//   `_checkHpRatioCondition`, `_maxRatio`): 禁用 (flag disarm: abnormal 11), block count final ×0, taunt_level −1, hp_recovery_per_sec_by_max_hp_ratio.
// - S2 阴晴圆缺 (MANUAL, duration −1): a toggle (`CastToggleSkill` with `_switchToMode` 2, begin clip Skill_2_Begin). This mode never closes it by itself
//   (PRTS 卫戍协议/帮助 技能操作 「通常不会自动关闭技能」), so it runs until he leaves. As the begin clip ends one of nothin_s_2[a] / [b] / [c] by random, never the last one
//   of this deployment: ATK +atk and [a] 子虚 each damage first puts ATTACK_SPEED attack_speed on the target for 5 s (EXTEND, one stack), [b] 乌有 ASPD +attack_speed,
//   [c] 子虚乌有 物理闪避 prob and block +block_cnt.

import { num, talentBb, skillRec, up } from '../shared/tier1.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */

const S1 = 'skchr_nothin_1';
const S2 = 'skchr_nothin_2';
/** Skill_2_Begin's length (data/assets.json `animations`): no attack during it, and the pick at its end (data `cast.begin`, skills.js beginTime). */
export const S2_BEGIN = 1.1;
const SLOW = 'nothin_s_2[a][attack_speed_down]';
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const KEYS = Object.freeze(['nothin_s_2[a]', 'nothin_s_2[b]', 'nothin_s_2[c]']);

/** @type {KitFns} */
export default {
  char_455_nothin: (bb, chess) => {
    const t0 = talentBb(chess, 0);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const picked = chess?.skill?.skillId ?? null;
    const modsOf = {
      'nothin_s_2[a]': { atkPct: num(b2.atk) },
      'nothin_s_2[b]': { atkPct: num(b2.atk), aspd: num(b2.attack_speed) },
      'nothin_s_2[c]': { atkPct: num(b2.atk), blockCnt: num(b2.block_cnt), dodgePhys: num(b2.prob) },
    };
    return {
      skills: {
        [S1]: {
          kind: 'duration', trigger: 'NEVER',
          mods: { taunt: num(b1.taunt_level), hpRegenRatio: num(b1.hp_recovery_per_sec_by_max_hp_ratio) },
          flags: { disarm: true, noBlock: true },
          onStart({ battle, unit }) { battle.releaseBlocked(unit); },
        },
        [S2]: {
          kind: 'toggle',
          // (the engine starts it as Skill_2_Begin ends: data `cast.begin`, skills.js beginTime)
          onStart({ battle, unit }) {
            battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, k: 'nothin:s2' });
            const pool = KEYS.filter((k) => k !== unit.trait.nothinLast);
            const key = battle.rng.pick(pool);
            unit.trait.nothinLast = key;
            battle.addBuff(unit, { key, visible: true, mods: modsOf[/** @type {keyof typeof modsOf} */ (key)] });
          },
          onEnd({ battle, unit }) { for (const k of KEYS) battle.removeBuff(unit, k); },
        },
      },
      talents: [{ install(battle, unit) {
        // S1's passive and its own trigger
        if (picked === S1) {
          battle.addBuff(unit, { key: 'nothin_s_1[passive_block_cnt]', mods: { blockCnt: num(b1.block_cnt) }, persist: true, allowDead: true, tags: ['skill'] });
          const hr = num(b1.max_hp_ratio, 0.2);
          battle.on('tick', () => {
            const sk = unit.skill;
            if (!up(unit) || !sk || sk.id !== S1 || !sk.ready || sk.active || !unit.canAct || unit.s.flags.silence) return;
            if (unit.hpRatio <= hr + 1e-9) sk.activate('DEFAULT');
          }, { owner: unit });
        }
        // T1 出其不意
        const delay = num(t0.delay, 4), scale = num(t0.atk_scale, 1), stun = num(t0.stun);
        let ready = false, nextAt = Infinity;
        const off = () => { ready = false; battle.removeBuff(unit, 'nothin_t_1'); battle.removeBuff(unit, 'nothin_t_1[eff]'); };
        battle.on('deploy', (c) => {
          if (c.unit !== unit) return;
          off();
          nextAt = battle.time + delay;
          unit.trait.nothinLast = null;
        }, { owner: unit });
        battle.on('tick', () => {
          if (ready || !up(unit) || battle.time + 1e-9 < nextAt) return;
          ready = true;
          battle.addBuff(unit, { key: 'nothin_t_1', visible: true });
          battle.addBuff(unit, { key: 'nothin_t_1[eff]', visible: true });
        }, { owner: unit });
        battle.on('hit', (c) => {
          if (c.source !== unit || !c.target || c.target.side !== 'enemy') return;
          if (ready) {
            c.dmg.amount *= scale;
            if (stun > 0 && c.target.alive) battle.applyStatus(c.target, 'stun', { duration: stun, source: unit });
            off();
          }
          nextAt = battle.time + delay;
          // S2 [a]: "于每次即将造成伤害时施加"
          if (unit.findBuff('nothin_s_2[a]')) {
            battle.addBuff(c.target, {
              key: SLOW, source: unit, refresh: 'extend',
              duration: num(b2['nothin_s_2[a][attack_speed_down].duration'], 5), mods: { aspd: num(b2['nothin_s_2[a][attack_speed_down].attack_speed']) },
            });
          }
        }, { owner: unit });
      } }],
    };
  },
};
