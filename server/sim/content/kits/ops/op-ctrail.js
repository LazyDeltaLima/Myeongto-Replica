// server/sim/content/kits/ops/op-ctrail.js — 云迹 (char_4165_ctrail) kit: 4★ 巡空者 (特种), a tier-2 piece of the season not out yet (shared/seasons.js `next`,
// docs/rules/diy.md 「새 시즌 아스테시아·콘트레일·에단」); both skills and the talent in both forms (she has no module). The same graph as 蒂比's and 予愿安洁莉娜's take-offs (flags `liftoff` + `blockFly`,
// the fx 'takeoff', render/units.js LIFTOFF_HEIGHT, the `_TakeOff` / `_Landing` clips of tools/assets/anim-keys.mjs); here the two clips also take their time, as 风絮's.
//
// Forms (data/seasons/next/chess.json): normal = E1 Lv60, skills at rank 4; elite = E2 Lv55, rank 7.
// Sources: the record's tables; gamedata_const ba.liftoff; PRTS 云迹 (备注 of S2); charpack char_4165_ctrail (modes Default, S1_TakeOff, S1, S1_Landing, S2_TakeOff, S2, S2_Landing, Default_S1),
// skill prefabs skchr_ctrail_1 / _2, buff_template_data ctrail_tr[*], ctrail_t_1, ctrail_s_1, ctrail_s_2, ctrail_s_2[sluggish], ctrail_height_ctrl[*].
// - Trait "起飞后能够阻挡2个飞行敌人": she blocks ground enemies on the ground, flyers only in the air (ctrail_tr[fly][core]: ChangeCharBlockMode FLY, MOTION_TARGET_FREE; ctrail_tr[ground] in her default modes ends it).
//   Every mode's attack shoots (`_projectileKey` projectile_chr_ctrail, _s2), ground and air targets.
// - 起飞 runs from the start of the TakeOff clip until the Landing clip has played. The clips are the mode's attack ability (`_timeMode` 1, `_allowNoTarget`): no attack through them. After a deployment the clip waits for
//   the born state, the state the attack ability runs after.
// - T1 低空乱流: on the ground (Default, Default_S1) DEF +def (ctrail_t_1, an attribute); in the other modes each of her damages has ATK ×atk_scale (ctrail_t_1 AtkScaleUp, before DEF).
// - S1 紧急升空 (PASSIVE, `_castOnLocate`): from each deployment, for its duration, ATK +atk and phys dodge prob (ctrail_s_1 Evade PHYSICAL). `_rangeIdModeIndex` 2 and `_extraRangeIdModeIndices` [1, 3, 7] give the modes
//   around it and Default_S1, her default mode with this skill (`_defaultModeIndex` 7), the skill's range: it stays 2-3 after she lands, for the whole deployment.
// - S2 掠空飞翎 (modes 4–6 on the skill's 3-1): ATK +atk. PRTS 备注: "先选择最多3个飞行目标与最多2个地面目标，随后在这些目标中选择最多3个目标（优先级：自身阻挡>仇恨值）" (Selector0 `_targetMotion` ground attack@max_walk_target,
//   Selector1 air attack@max_target, the group attack@max_target). A flyer hit: attack@sluggish s of 停顿 (ctrail_s_2[sluggish] IfTarget FLY_ONLY).

import { num, talentBb, skillRec, up, toggleBuff } from '../shared/tier1.js';

const S1 = 'skchr_ctrail_1';
const S2 = 'skchr_ctrail_2';
/** Skill_Begin, Skill_End, Skill_2_Begin, Skill_2_End are all this long (data/assets.json `animations`; test/content/op_ctrail.test.js). */
export const FLY_CLIP = 1;
const FLY_KEY = 'ctrail_tr[fly]';
const LIFTOFF = Object.freeze({ liftoff: true, blockFly: true });
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

function takeOff({ battle, unit, reason }) {
  // (a deployment's cast comes before Battle sets `bornUntil`)
  const wait = reason === 'deploy' ? battle.flags.bornTime : Math.max(0, (unit.bornUntil ?? -Infinity) - battle.time);
  unit.skillStateUntil = battle.time + wait + FLY_CLIP;
  const go = () => {
    battle.addBuff(unit, { key: FLY_KEY, flags: LIFTOFF, tags: ['skill'] });
    battle.releaseBlocked(unit);   // the ground enemies she held walk on
    battle.fx('takeoff', { x: unit.x, y: unit.y, id: unit.id });
  };
  if (!(wait > 1e-9)) { go(); return; }
  const seq = unit.deploySeq;
  battle.after(wait, () => { if (up(unit) && unit.deploySeq === seq) go(); }, { owner: unit });
}
function land({ battle, unit, reason }) {
  if (reason !== 'duration' && reason !== 'stop') { battle.removeBuff(unit, FLY_KEY); return; }
  unit.skillStateUntil = battle.time + FLY_CLIP;
  const seq = unit.deploySeq;
  battle.after(FLY_CLIP, () => {
    if (!up(unit) || unit.deploySeq !== seq || (unit.skill && unit.skill.active)) return;
    battle.removeBuff(unit, FLY_KEY);
    battle.releaseBlocked(unit);   // the flyers she held
  }, { owner: unit });
}

export default {
  char_4165_ctrail: (bb, chess) => {
    const t0 = talentBb(chess, 0), r1 = skillRec(chess, S1), r2 = skillRec(chess, S2), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const maxWalk = Math.floor(num(b2['attack@max_walk_target'], 2));
    return {
      trait: { blockFly: false, attack: 'ranged', projectile: 'arrow' },
      skills: {
        [S1]: {
          kind: 'duration', duration: num(r1?.duration), activateOnDeploy: true, spCost: 0, spType: 'none', trigger: 'NEVER',
          mods: { atkPct: num(b1.atk), dodgePhys: num(b1.prob) },
          targeting: { rangeGrid: r1?.rangeGrid ?? null },
          onStart: takeOff, onEnd: land,
        },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk) },
          targeting: { rangeGrid: r2?.rangeGrid ?? null, maxTargets: Math.max(1, Math.floor(num(b2['attack@max_target'], 3))) },
          attack: {
            pickEnemies: (cands) => { let g = 0; return cands.filter((e) => e.isFlying || ++g <= maxWalk); },
            onEachHit({ battle, unit, target }) {
              if (target?.alive && target.isFlying) battle.applyStatus(target, 'sluggish', { duration: num(b2['attack@sluggish']), source: unit });
            },
          },
          onStart: takeOff, onEnd: land,
        },
      },
      talents: [{ install(battle, unit) {
        battle.removeBuff(unit, 'trait:skywalker');   // the profession's permanent air block: only while airborne here
        if (chess.skill?.skillId === S1 && r1?.rangeGrid) unit.rangeGrid = r1.rangeGrid;
        const air = () => !!unit.s.flags.liftoff || !!unit.skill?.active;
        toggleBuff(battle, unit, 'ctrail_t_1[def]', () => !air(), { defPct: num(t0.def) });
        const sc = num(t0.atk_scale, 1);
        battle.on('hit', (c) => {
          if (c.source === unit && c.target?.side === 'enemy' && air()) c.dmg.amount *= sc;
        }, { owner: unit });
      } }],
    };
  },
};
