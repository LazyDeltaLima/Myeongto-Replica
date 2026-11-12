// server/sim/content/kits/ops/chess_char_2_13-tippi.js — 蒂比 (char_4191_tippi) kit, tier 2.
// Conventions of the tier-2 kits: ../shared/tier2.js; kit contract and rules: ../README.md.

import { num, talentBb, up, onHitOn } from '../shared/tier1.js';
import { onDefaultSkill } from '../shared/tier2.js';
import { LIFTOFF_FLAGS, holdTakeOff, landAfter } from '../shared/liftoff.js';

/**
 * 起飞 of 蒂比's skills (gamedata_const ba.liftoff "不阻挡地面敌人且不会被地面敌人攻击，可以阻挡飞行敌人"): the skill's flags
 * `liftoff` (no ground enemy blocked — Battle._blockerFor; 对地规避 — targeting.js evadesGround: no ground enemy selects
 * her, while what selects nobody still lands — 无视无法选择 abilities, direct picks, flying units' blasts, 无来源 damage, the
 * ticks of a debuff already on her) and `blockFly` (blocks flyers at the air radius). She stays a ground unit on her tile (PRTS 行动方式 "起飞的
 * 干员仍然是地面单位": `unit.ground` unchanged — 隐德来希's 血镰 still counts her; 地面干员 bonds / items read her position).
 */
/**
 * Skill_Begin, Skill_End, Skill_2_Begin, Skill_2_End are all this long (data/assets.json `animations`; test/content/kits_alt_t2.test.js, test/sim/feedback1f-liftoff.test.js):
 * the attack abilities of her modes S1_TakeOff / S1_Landing / S2_TakeOff / S2_Landing (`_timeMode` 1) — no attack while they
 * play (shared/liftoff.js).
 */
export const FLY_CLIP = 1;
const LAND_KEY = 'tippi:landing';
/** 蒂比 take-off: the ground enemies she blocked walk on; no attack during the take-off clip. */
function tippiTakeOff({ battle, unit }) {
  battle.releaseBlocked(unit);
  battle.fx('takeoff', { x: unit.x, y: unit.y, id: unit.id });
  holdTakeOff(battle, unit, FLY_CLIP);
}
/** 蒂比 landing when the airborne skill ends: the landing clip in the air, then the flyers she held are released. */
function tippiLand({ battle, unit, reason }) {
  landAfter(battle, unit, FLY_CLIP, { key: LAND_KEY, reason, onLanded: () => battle.releaseBlocked(unit) });
}

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 2_13 蒂比 紧急赶场通知 (AUTO): "受到攻击后触发" is officially "受到伤害前触发" (PRTS 修正 原因 6; 备注 "在受到伤害前自动
  // 触发技能…若本次伤害为物理或法术，再将本次伤害闪避") — any incoming damage instance (an attack, a zone tick, the 源石溶剂
  // drain; never a 流失, which has no `hit`) sets it off (the kit is the only trigger: the engine rule is disabled) and a
  // physical/arts one is dodged; takes off for the duration: skill range, ATK +atk, attacks become 3 shots, blocks flying
  // (not ground) enemies. Trait "起飞后能够阻挡2个飞行敌人": flying enemies are blocked only while airborne. 片场工作指南
  // ("若最近N秒内未受伤害" — 修正 原文 攻击): if no damage for stack_time s, the next physical/arts damage is dodged (prob);
  // a damage instance restarts that timer while she is not ready (a 流失 does not — PRTS 备注; the client's graph below).
  // S1 专业喷绘技巧 (alt, DEFAULT trigger from data): takes off at once for its duration — skill range, ATK +atk, blocks
  // flyers only; no triple shot, and incoming attacks never set it off.
  // 片场工作指南 as the client's graph (buff_template_data tippi_t / [timer] / [evade]): the timer starts at each deployment
  // and makes her ready after stack_time s (not at once); while not ready any damage restarts it; once ready (the held
  // [evade]) only an uncancelled physical/arts damage that wins `prob` takes it (Nodes.Evade fails otherwise, so a pure
  // damage, a lost roll or a hit S2 already dodged leave it held, and the timer does not restart).
  // Both take off as 起飞 (LIFTOFF_FLAGS): she blocks no ground enemy and none selects her (对地规避), so a ground enemy's
  // selected damage refused on the way never reaches her `hit` and neither sets off S2 nor restarts 片场工作指南.
  chess_char_2_13_a: (bb, chess, def) => {
    const t = talentBb(chess, 0);
    const s2 = onDefaultSkill(chess);
    return {
      // the official client's attacks are shots in every mode (charpack `Modes/Default|S1|S2/Body/Attack` `_projectileKey`
      // projectile_chr_tippi(_s1|_s2), TRACE 10; no `Body/Combat`, so a blocked enemy is shot too), not the 特种 melee default
      trait: { blockFly: false, attack: 'ranged', projectile: 'arrow' },
      skill: {
        kind: 'duration', trigger: { rule: 'CUSTOM_RANGE', grid: [] }, // never by the engine: the hit handler below
        mods: { atkPct: num(bb.atk) }, flags: LIFTOFF_FLAGS,
        targeting: { rangeGrid: def?.skill?.rangeGrid ?? null },
        attack: { hits: 3 },
        onStart: tippiTakeOff,
        onEnd: tippiLand,
      },
      skills: {
        skchr_tippi_1: {
          kind: 'duration', mods: { atkPct: num(bb.atk) }, flags: LIFTOFF_FLAGS,
          targeting: { rangeGrid: def?.skill?.rangeGrid ?? null },
          onStart: tippiTakeOff,
          onEnd: tippiLand,
        },
      },
      talents: [{ install(battle, unit) {
        battle.removeBuff(unit, 'trait:skywalker'); // the profession grants blockFly permanently; here only airborne
        const st = num(t.stack_time), p = num(t.prob, 1);
        let last = -Infinity;
        battle.on('deploy', ({ unit: u }) => {
          if (u !== unit) return;
          last = battle.time;
          if (unit.hasBuff('tippi:evade')) battle.removeBuff(unit, 'tippi:evade');
        }, { owner: unit });
        // the dodge held: tippi_t[evade]'s effect from the moment it is ready until a damage takes it (render/fxstatus.js KEY_FX)
        const ready = () => st > 0 && (unit.hasBuff('tippi:evade') || battle.time - last + 1e-9 >= st);
        battle.on('tick', () => {
          if (!up(unit) || unit.hasBuff('tippi:evade') || !ready()) return;
          battle.addBuff(unit, { key: 'tippi:evade', visible: true });
        }, { owner: unit });
        onHitOn(battle, unit, (ctx) => {
          const { dmg } = ctx;
          if (!dmg || dmg.cancel || !up(unit)) return;
          const dodgeable = dmg.type === 'phys' || dmg.type === 'arts';
          const sk = unit.skill;
          let s2Dodged = false, dodged = false;
          if (s2 && sk && sk.ready && !sk.active && unit.canAct && !unit.s.flags.silence && sk.activate('TAKE_DAMAGE')) s2Dodged = dodgeable;
          if (!ready()) last = battle.time;
          else if (!s2Dodged && dodgeable && battle.rng.chance(p)) {
            dodged = true;
            last = battle.time;
            if (unit.hasBuff('tippi:evade')) battle.removeBuff(unit, 'tippi:evade');
          }
          if (s2Dodged || dodged) { dmg.cancel = true; battle.fx('dodge', { x: unit.x, y: unit.y, id: unit.id }); }
        }, 5);
      } }],
    };
  },
};
