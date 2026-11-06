// server/sim/content/kits/ops/op-taraxa.js — 风絮 (char_4222_taraxa) kit: 5★ 守望者 (医疗), a tier-3 piece of the season not out yet
// (shared/seasons.js `next`, docs/rules/diy.md 「새 시즌 ○○」); both skills, the talent and the trait in both forms (she has no module with a battle record).
//
// Forms (data/seasons/next/chess.json): normal = E2 Lv1, skills at rank 4; elite = E2 Lv60, rank 7.
// Sources: the record's tables; gamedata_const ba.liftoff; PRTS 风絮 (定风絮 备注 "天赋增益仅对能够阻挡飞行敌人的单位（阻挡类型为空中阻挡）生效，对实际的飞行单位…不会生效"，"阻挡模式发生更变时，立刻
// …重新判定"; S2 备注 "此技能的额外治疗只以能够阻挡飞行敌人…的单位生效"); buff_template_data taraxa_*; charpack char_4222_taraxa (modes Default, S1_FlyStart, S1_FlyLoop, S1_FlyEnd,
// S2_FlyStart, S2_FlyLoop, S2_FlyEnd), skill prefabs skchr_taraxa_1 / _2, projectile_chr_taraxa_s2_1 / _2.
// - 起飞 (taraxa_fly_mode: ChangeCharBlockMode FLY; flags `liftoff` + `blockFly`, as 蒂比's and 予愿安洁莉娜's): from the cast until the FlyEnd clip has played. Each skill is
//   SwitchMode FlyStart (its begin clip, FLY_CLIP s, no heal), FlyLoop for its `duration`, then FlyEnd (its end clip, FLY_CLIP s, still airborne, no heal), then Default (taraxa_try_ground).
// - T1 定风絮 "攻击范围内飞行的友方单位获得N%的庇护，阻挡数+1" (taraxa_t[aura]): every ally in her current range — her too: the validator takes her, `_selfOption` default — whose
//   block mode is air (flag `liftoff`; a real flyer has none) holds 庇护 damage_resistance (the shared PROTECT, 同名效果取最高) and taraxa_t[block] (one per ally whatever the source). Re-judged
//   every tick (ON_OWNER_BLOCK_MODE_CHANGED: at once).
// - S1 何处着: attack interval ×attack@base_attack_time (taraxa_s1[atk_time], FINAL_SCALER), each attack an instant `Heal` (no projectile) of attack@heal_scale × ATK on a random injured unit of
//   her range (`_postFilter` HP_NOT_FULL_RANDOM).
// - S2 扶风起: ATK +attack@atk; her heal (projectile_chr_taraxa_s2_1) goes to the injured unit of lowest HP ratio, air block mode first (`_postFilter` HP_RATIO_NOT_FULL_ASC_FLY_FIRST:
//   `FilterUtil._Filter_HpRatioNotFullAscFlyFirst` reads `Character.blockMode`). When that target's block mode is air (taraxa_s2[second_heal] ON_ABILITY_CAST_ON_TARGET CheckBlockMode TARGET FLY —
//   the 「额外治疗条件」 of PRTS) a second shot goes to the lowest other injured unit in range (SecondSelector, `_excludeTarget`), attack@heal_scale × ATK. As the main shot lands
//   (taraxa_s2[splash] `_activeBuffs`) up to attack@splash_num other injured units in the 3×3 around its target (SplashSelector x-4, lowest HP ratio first) get a shot (projectile_chr_taraxa_s2_2,
//   speed 5) healing attack@heal_scale_2 × ATK. The second shot carries no splash: `_activeBuffs` are the attack's.

import { num, talentBb, skillRec, batMod, up, holdProtect, PROTECT_TICK_HOLD } from '../shared/tier1.js';
import { absoluteRangeKeys } from '../../../targeting.js';
import { COLS } from '../../../constants.js';
import { hypot } from '../../../detmath.js';

const S1 = 'skchr_taraxa_1';
const S2 = 'skchr_taraxa_2';
/** Skill_1_Begin, Skill_1_End, Skill_2_Begin, Skill_2_End are all this long (data/assets.json `animations`; test/content/op_taraxa.test.js). */
export const FLY_CLIP = 1;
/** projectile_chr_taraxa_s2_1 / _2 `_speed`. */
const SECOND_SPEED = 10, SPLASH_SPEED = 5;
/** range x-4: the tile and the eight around it. */
const X4 = Object.freeze([[1, -1], [1, 0], [1, 1], [0, -1], [0, 0], [0, 1], [-1, -1], [-1, 0], [-1, 1]]);
const FLY_KEY = 'taraxa_fly_mode';
const LIFTOFF = Object.freeze({ liftoff: true, blockFly: true });
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const airBlock = (a) => !!a.s.flags.liftoff;

/** S1's pick: one injured unit at random (battle.rng). */
const randomInjured = (b, u, cands) => (cands.length > 1 ? [b.rng.pick(cands)] : cands);
/** S2's pick: air block mode first, the HP ratio order kept. */
const airFirst = (b, u, cands) => [...cands.filter(airBlock), ...cands.filter((a) => !airBlock(a))];

function takeOff({ battle, unit, skill }) {
  unit.skillStateUntil = battle.time + FLY_CLIP;
  battle.addBuff(unit, { key: FLY_KEY, flags: LIFTOFF, tags: ['skill'] });
  battle.releaseBlocked(unit);
  battle.fx('taraxaFly', { x: unit.x, y: unit.y, id: unit.id, up: 1 });
  battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, k: skill.id === S1 ? 'taraxa:up1' : 'taraxa:up2' });
}
function land({ battle, unit, reason }) {
  if (reason !== 'duration' && reason !== 'stop') { battle.removeBuff(unit, FLY_KEY); return; }
  unit.skillStateUntil = battle.time + FLY_CLIP;
  battle.fx('taraxaFly', { x: unit.x, y: unit.y, id: unit.id, up: 0 });
  const seq = unit.deploySeq;
  battle.after(FLY_CLIP, () => {
    if (!up(unit) || unit.deploySeq !== seq || (unit.skill && unit.skill.active)) return;
    battle.removeBuff(unit, FLY_KEY);
    battle.releaseBlocked(unit);
  }, { owner: unit });
}

export default {
  char_4222_taraxa: (bb, chess) => {
    const t0 = talentBb(chess, 0);
    const r1 = skillRec(chess, S1);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const healOf = (battle, unit, a, scale, moment) => { if (a.alive && a.deployed) battle.heal(unit, a, unit.s.atk * scale, { isSkill: true, moment }); };
    const secondScale = num(b2['attack@heal_scale'], 1), splashScale = num(b2['attack@heal_scale_2']), splashN = Math.max(0, Math.floor(num(b2['attack@splash_num'], 2)));
    return {
      skills: {
        [S1]: {
          kind: 'duration',
          mods: { batPct: batMod(b1['attack@base_attack_time'], chess, r1?.desc ?? '') },
          attack: { healScale: num(b1['attack@heal_scale'], 1), heal: { mode: 'single', pick: randomInjured } },
          onStart: takeOff, onEnd: land,
        },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2['attack@atk']) },
          attack: { healScale: num(b2['attack@heal_scale'], 1), heal: { mode: 'single', pick: airFirst } },
          onStart: takeOff, onEnd: land,
          onAttack({ battle, unit, targets }) {
            const main = targets?.[0];
            if (!main || !airBlock(main)) return;
            const other = battle.injuredAlliesInKeys(unit.rangeKeys, unit).find((a) => a !== main);
            if (!other) return;
            battle.fx('taraxaSecond', { x: unit.x, y: unit.y, id: unit.id, tgt: [other.id] });
            battle.after(hypot(other.x - unit.x, other.y - unit.y) / SECOND_SPEED, () => healOf(battle, unit, other, secondScale), { owner: unit });
          },
          onHit({ battle, unit, target }) {
            if (!target || !(splashN > 0) || !(splashScale > 0)) return;
            const keys = new Set(absoluteRangeKeys(X4, target.tileR, target.tileC, 'RIGHT', 0));
            const near = battle.injuredAlliesInKeys(keys, unit).filter((a) => a !== target).slice(0, splashN);
            if (near.length) battle.fx('taraxaSplash', { x: target.x, y: target.y, id: unit.id, from: target.id, tgt: near.map((a) => a.id) });
            for (const a of near) battle.after(hypot(a.x - target.x, a.y - target.y) / SPLASH_SPEED, () => healOf(battle, unit, a, splashScale, 'projectile_chr_taraxa_s2_2'), { owner: unit });
          },
        },
      },
      talents: [{ install(battle, unit) {
        const v = num(t0.damage_resistance), n = num(t0.block_cnt);
        battle.on('tick', () => {
          if (!up(unit)) return;
          const set = unit.rangeKeySet;
          for (const a of battle.allyUnits) {
            if (!a.alive || !a.deployed || a.hidden || !airBlock(a) || !set?.has(a.tileR * COLS + a.tileC)) continue;
            if (a !== unit && !battle.allySelectable(a, unit)) continue;
            holdProtect(battle, a, v, PROTECT_TICK_HOLD, unit);
            if (n) battle.addBuff(a, { key: 'taraxa_t[block]', duration: PROTECT_TICK_HOLD, mods: { blockCnt: n }, source: unit });
          }
        }, { owner: unit });
      } }],
    };
  },
};
