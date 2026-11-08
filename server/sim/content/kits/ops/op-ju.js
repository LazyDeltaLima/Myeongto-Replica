// server/sim/content/kits/ops/op-ju.js — 矩 (char_4221_ju) kit: 5★ 攻城手 (狙击), a tier-2 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 ○○」); both skills, the talent, the trait and SIE-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, SIE-X stage 1.
// Sources: the record's tables; PRTS 矩 (墨守 备注 "自身造成的伤害不会致命（至多使目标生命值降至1点），成功造成伤害后若目标生命值小于等于1则为
// 目标附加重伤"; S2 备注 "独立于攻击的、检测周期0.2秒的光环效果，通过检测后至少延迟0.9秒才能造成额外伤害，延迟结束时若目标受无法选择类效果影响则不会
// 造成额外伤害。每0.3秒至多对一个目标造成额外伤害，对其他目标造成额外伤害将会相应延迟", "非首次标记…在多个矩之间通用且不会因技能结束或矩离场而解除"); PRTS 术语释义
// 重伤; buff_template_data ju_t_1, cripple, ju_s_2, ju_s_2[damage_dalay], ju_s_2[damage_trigger], ju_s_2[damage], ju_e_002[atk],
// ju_e_002_t_scale; charpack char_4221_ju and skill prefabs skchr_ju_1 / skchr_ju_2.
// - Trait (攻城手) "优先攻击重量最重的敌人": every attack selector's `_postFilter` MASS_DES (priority 'heaviest'), `_buffKeyExcluded` cripple
//   ("矩不攻击重伤单位": skipEnemy). SIE-X "攻击重量较重（重量等级大于等于3）的敌人时，攻击力提升至115%" (the module's talent change, bb atk_scale,
//   value; ju_e_002[atk] AtkScaleUp at ON_CALCULATE_DAMAGE: every damage of his, as an attack multiplier: the amount before DEF).
//   Stages 2–3's "ju_e_002_t_scale" (hp_ratio, damage_scale) read if the record has them: this season's pieces are stage 1.
// - T1 墨守: ju_t_1 sets DAMAGE_IS_UNDEADABLE_THIS_TIME on every damage of his (a `fatal` hook keeps the enemy at 1 HP) and, after a damage with
//   the target at ≤ 1 HP and no `cripple`, creates `cripple` on it: move speed ×(1 + move_speed), 禁疗, 禁用近战 (unblockable), HP regeneration 0;
//   it dies `interval` s later (无来源, InstantKill), not while 消失, at once coming back from 消失; whoever kills it gets `sp` SP
//   (cripple ON_OWNER_KILLED_BY_MAIN_TARGET). A shared-pool leader takes no 重伤 [추정·서버: the client reports a boss's damage to the server].
// - S1 良弓难张 (AUTO, 2 charges, a ReplacementSkill): its trigger searches its own selector (HP ratio ≤ 0.5, no cripple): the moment one is in range
//   the charge is spent and that selector replaces his attack's (`TryHookSearchTarget`, `_cancelIfSearchTargetFailed` off) until that attack goes:
//   with no such enemy he does not attack. atk_scale_s1 × ATK, projectile_chr_ju_s1. The selector's `_maxNum` is 2, so the attack strikes up to two
//   such enemies [추정·화면: the text names no second target, PRTS neither; official screen needed].
// - S2 良翼难乘 (MANUAL): ATK +atk, attack@max_target_s2 targets. Beside the attack, ExtraAbility0 holds ju_s_2 (ON_BUFF_TRIGGER every 0.2 s from
//   when an enemy enters his range) on every enemy in range: while the skill runs, HP ratio < hp_ratio and no ju_s_2[done] (from any 矩; it stays:
//   the 「非首次标记」) → the mark, and after S2_START_DELAY a place in his queue (damage_trigger: while he lives). The queue starts one per
//   S2_GAP (ju_s_2[source]), each landing S2_GAP after its start: atk_scale_s2_extra × his ATK at that moment physical on a target still alive
//   and selectable, with hit_02 and its signal; hit_01 / hit_04 play at the start, by turns (his ju_s_2[host] `isFront`). Waiting order: first in,
//   first out [추정·엔진: the client's order is its buffs' update order].

import { num, talentBb, skillRec, giveSp, up } from '../shared/tier1.js';
import { canTargetEnemy } from '../../../targeting.js';

const S1 = 'skchr_ju_1';
const S2 = 'skchr_ju_2';
/** ju_s_2's `triggerInterval`. */
export const S2_CHECK = 0.2;
/** ju_s_2[damage_dalay]'s `lifeTime` (blackboard `start_delay` absent). */
export const S2_START_DELAY = 0.6;
/** ju_s_2[damage] / ju_s_2[source] `lifeTime` (blackboard `s2_delay` absent). */
export const S2_GAP = 0.3;
/** 重伤, the client's buff key: one per enemy ("重伤期间的单位无法再被施加重伤"). */
export const CRIPPLE = 'cripple';
/** The 「非首次标记」, shared by every 矩. */
export const DONE = 'ju_s_2[done]';
const ANY = Object.freeze({ canHitFly: true });

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const on = (u) => !!(u.skill && u.skill.active && u.skill.id === S2);
/** Is `e` 重伤 (whoever put it there)? */
export const isCrippled = (e) => !!(e && typeof e.findBuff === 'function' && e.findBuff(CRIPPLE));

function applyCripple(battle, unit, e, { sp, life, ms }) {
  if (!e || !e.alive || isCrippled(e)) return;
  battle.addBuff(e, {
    key: CRIPPLE, source: unit, visible: true,
    mods: { moveMul: Math.max(0, 1 + ms), hpRegen: -1e9 },
    flags: { unblockable: true, healFree: true, noHeal: true },
    data: { sp, until: battle.time + life, hidden: !!e.hidden },
    onTick: ({ battle: b, unit: x, buff }) => {
      const d = buff.data;
      if ((d.hidden && !x.hidden) || (!x.hidden && b.time + 1e-9 >= d.until)) { b.kill(x, null); return; }
      d.hidden = !!x.hidden;
    },
  });
}

export default {
  char_4221_ju: (bb, chess) => {
    const t0 = talentBb(chess, 0);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const s1 = skillRec(chess, S1);
    const s1Pick = Object.freeze({ canHitFly: true, skipEnemy: (e) => isCrippled(e) || e.hpRatio > 0.5 + 1e-9 });
    return {
      trait: { priority: 'heaviest', skipEnemy: isCrippled },
      skills: {
        [S1]: {
          kind: num(s1?.maxChargeTime, 1) > 1 ? 'charges' : 'instant', trigger: 'NEVER',
          targeting: { maxTargets: 2 },
          attack: { atkScale: num(b1.atk_scale_s1, 1), skipEnemy: s1Pick.skipEnemy },
        },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk) },
          targeting: { maxTargets: Math.max(1, Math.floor(num(b2['attack@max_target_s2'], 1))) },
        },
      },
      talents: [{ install(battle, unit) {
        // S1's own trigger (NextAttackOrCombatSkill.DoTick: the SP and its selector, every tick)
        battle.on('tick', () => {
          const sk = unit.skill;
          if (!up(unit) || !sk || sk.id !== S1 || !sk.ready || sk.pending || !unit.canAct || unit.s.flags.silence) return;
          if (battle.enemiesInKeys(unit.rangeKeys, unit, s1Pick).length) sk.activate('DEFAULT');
        }, { owner: unit });
        // T1 墨守
        const sp = num(t0.sp), life = num(t0.interval, 10), ms = num(t0.move_speed, -0.8);
        battle.on('fatal', (c) => {
          if (c.source === unit && c.unit && c.unit.side === 'enemy' && !c.prevented) c.prevented = true;
        }, { owner: unit, priority: 100 });
        battle.on('damaged', (c) => {
          const e = c.target;
          if (c.source !== unit || !e || e.side !== 'enemy' || !e.alive || e.bossPool || c.type === 'element' || e.hp > 1) return;
          applyCripple(battle, unit, e, { sp, life, ms });
        }, { owner: unit });
        battle.on('kill', (c) => {
          const d = c.victim && typeof c.victim.findBuff === 'function' ? c.victim.findBuff(CRIPPLE) : null;
          if (!d || d.source !== unit || !c.killer || c.killer.side !== 'ally') return;
          giveSp(c.killer, num(d.data?.sp));
        }, { owner: unit });
        // SIE-X
        const massScale = num(t0.atk_scale, 1), mass = num(t0.value, Infinity);
        const hr = num(t0.hp_ratio), ds = num(t0.damage_scale, 1);
        if (massScale !== 1 || (hr > 0 && ds !== 1)) {
          battle.on('hit', (c) => {
            if (c.source !== unit || !c.target || c.target.side !== 'enemy') return;
            if (massScale !== 1 && c.target.weight >= mass) c.dmg.amount *= massScale;
            if (hr > 0 && ds !== 1 && c.target.hpRatio <= hr) c.dmg.mul *= ds;
          }, { owner: unit });
        }
        // S2's extra damage: the aura's checks and the queue, which outlives the skill (not the unit)
        const hpRatio = num(b2.hp_ratio, 0.5), extra = num(b2.atk_scale_s2_extra, 1);
        const checks = new Map();
        const queue = [];
        let gate = 0, front = true;
        battle.on('deploy', (c) => { if (c.unit === unit) { checks.clear(); queue.length = 0; gate = 0; front = true; } }, { owner: unit });
        const land = (e) => {
          if (!e.alive || !canTargetEnemy(unit, e, ANY)) return;
          battle.fx('kitHit', { x: e.x, y: e.y, id: e.id, k: 'ju_s_2[damage]' });
          battle.dealDamage(unit, e, { amount: unit.s.atk * extra, type: 'phys', isSkill: true, tags: ['ju:extra'], moment: 'ju_s_2[damage]' });
        };
        battle.on('tick', () => {
          if (!up(unit)) return;
          if (on(unit)) {
            const seen = new Set();
            for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, ANY)) {
              seen.add(e);
              const next = checks.get(e);
              if (next !== undefined && battle.time + 1e-9 < next) continue;
              checks.set(e, battle.time + S2_CHECK);
              if (e.findBuff(DONE) || !(e.hpRatio < hpRatio)) continue;
              battle.addBuff(e, { key: DONE });
              queue.push({ e, at: battle.time + S2_START_DELAY });
            }
            for (const e of checks.keys()) if (!seen.has(e)) checks.delete(e);
          } else if (checks.size) checks.clear();
          while (queue.length && queue[0].at <= battle.time + 1e-9 && gate <= battle.time + 1e-9) {
            const { e } = queue.shift();
            gate = battle.time + S2_GAP;
            battle.fx('juExtra', { x: e.x, y: e.y, id: e.id, src: unit.id, front: front ? 1 : 0 });
            front = !front;
            battle.after(S2_GAP, () => land(e));
          }
        }, { owner: unit });
      } }],
    };
  },
};
