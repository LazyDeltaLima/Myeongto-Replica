// server/sim/content/kits/ops/op-heyak.js — 霍尔海雅 (char_4027_heyak) 自选 operator kit: 6★ 中坚术师 (术师), an owned-6★
// pick of the tier-5 and tier-6 自选 slots; every skill, both talents, the trait and the three modules at every form.
// Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_4027_heyak, the DIY slot statuses): normal = E2 Lv1, skills at rank 4, no module;
// elite = E2 Lv60, rank 7, the picked module at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / battle_equip_table (zh_CN, as built into backups.json) and PRTS 霍尔海雅
// (传承终焉 备注 "技能触发的浮空效果于本天赋结算前进行结算"; S1 备注 "“仅攻击到1名目标”仅判定实际发射的弹道数"; S3 备注 "攻击以自身格
// 中心处为准，于此处、左1.0、右1.0格在0~0.3s内随机延迟后生成三股旋风", "移动速度1.0，碰撞范围为1×1的正方形，旋风移动至5格远处中心点
// 自然消失，造成伤害时实时应用霍尔海雅的当前攻击力", "旋风在生成后1.77s内，攻击倍率由最低值线性递增至最大值", "霍尔海雅离场时已存在的旋风
// 不会因此立刻消失，但其命中敌人时不享受模组加成，不触发第一天赋").
// - Trait (中坚术师) "攻击造成法术伤害": the profession default (ranged arts, hits air, block 1). Module CCR-X “图书馆” adds
//   "无视目标10点法术抗性" (trait bb magic_resist_penetrate_fixed: a permanent resIgnoreFlat), CCR-Y “羽蛇的时间博物馆”
//   "普通攻击命中精英或领袖敌人时获得1点技力" (trait bb sp: per hit of one of her attacks on an elite / leader; a running timed
//   skill takes no SP). ISW-A “霍尔海雅特限证章”: its trait "在集成战略中，无视目标10点法术抗性，每个敌人首次进入目标点所在地块时，恢复
//   自身30%的技力" and its hidden talents (首次部署 1 点临时目标生命值, the goal-tile 浮空 15 s, stage 3's radius-1.1 skill
//   splash "自身技能会对敌人及其周围的目标同时造成浮空效果和伤害效果") are battle_equip_table parts with `validInGameTag:
//   roguelike` — N/A here; what applies is its stats and, at stage 2+, 传承终焉's new numbers (a TALENT_DATA_ONLY part with
//   no game tag: 148 % / 5 s at stage 3).
// - T1 传承终焉 "攻击空中目标时攻击力提升至120%，并使其特殊能力失效3秒" (full potential: 123%): every hit of her attacks on an
//   air unit (flying, 近地悬浮 or 浮空) at the hit is × atk_scale and silences it for `silence` s. Her skills' 浮空 of that
//   very hit resolve first (PRTS 备注), so a target her S1 / S2 / S3 lifts takes the ×atk_scale of that hit: the S1 / S2
//   lifts land in the hit's `hit` step, ahead of this talent (a dodged hit has lifted already [ASSUMED·engine: the order of a dodge and an ability's buffs was not read]). CCR-X stage 3:
//   138 % / 5 s, ISW-A stage 3: 148 % / 5 s (the talent's merged bb).
// - T2 曾有羽翼 "攻击范围内所有生命值高于80%的敌人失重": every enemy of her current attack range (a running S3's included) above
//   hp_ratio of its HP is 失重 (weight −1 level, 同名效果不可叠加: none of hers while another source's 失重 is on it), off
//   again at once below it or outside the range. CCR-Y stage 3 lowers it to 50 % and adds "生命值低于50%的敌人获得20%的
//   【法术脆弱】" (its hidden talent: damage_scale 1.2, hp_ratio 0.5): the 法术脆弱 status, renewed every 0.2 s for 0.3 s
//   (as 史尔特尔 AFT-Y's).
// - S1 但为求索 (AUTO, 可充能 1 / 2, data DEFAULT): the next attack hits one more target (2), atk_scale × ATK arts each; when
//   it fires at one target only it lifts it (浮空) `levitate` s — counted at the shot (PRTS 备注).
// - S2 群星逶迤 (MANUAL, 16 s, data DEFAULT): each attack is SHOTS (9, the text's "9连发": the mode's MultiRangedAttack,
//   `_additionalTimes` 8) shots of attack@atk_scale × ATK, SHOT_GAP (`_triggerDelta` 0.05) s apart from the attack's strike, each at
//   a random enemy of her range taken as it leaves (`_selectNum` 1, `_selectTargetTiming` 1), each with attack@prob to lift it
//   attack@levitate s; a stun ends the shots still to come.
// - S3 博览者的狂语 (MANUAL, 45 s, data DEFAULT with the box 3-10): attack range 3-10 while it runs, attack interval +1.4 s
//   (base_attack_time, flat); each attack (the mode's Attack ability: `Skill_3_Loop`, no projectile of its own, on to `WindAttack`)
//   releases on its strike three whirlwinds (R1–R3, `projectile_chr_heyak_s3`) from the centre of her tile and the tiles left and
//   right of it, each after its own random 0–0.3 s delay (`_randomDelayToBorn`). A whirlwind flies straight forward at 1 tile/s for
//   its 4 s life (`_speed` 1, `_lifeTime` 4: PRTS's "5格远处中心点" counts her own tile; a 1×1 square), hits the first enemy it
//   touches — selector `_targetMotion` 3, air units too; of several touched at once its `_postFilter` 4 HATRED_DES first — lifting it
//   attack@levitate s and then dealing (min + (max − min) × min(1, age / 1.77 s)) × her current ATK arts (`_scaleCurve` reaches 1 at
//   0.4428 of the life; attack@min_atk_scale → attack@max_atk_scale), and is gone. A whirlwind out when she leaves the field flies
//   on, without 传承终焉 and without her module's RES ignore [ASSUMED·no source: "模组加成" = the module's trait; its attributes stay in her ATK].
// - No summon (the forms list no token).

import { textCount } from '../shared/bounds.js';
import { num, talentBb, traitBb, skillRec, statBuff, batMod, giveSp, onHitBy, up } from '../shared/tier1.js';
import { canTargetEnemy, sortEnemyTargets } from '../../../targeting.js';
import { dirVec, rotateOffset } from '../../../dir.js';
import { hitRect } from '../../../body.js';
import { performAttack } from '../../../ai.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { BuffRec } from '../../bonds/shared.js' */
/** @import { ModuleState } from '../../../../../shared/loadoutRecord.js' */

const S1 = 'skchr_heyak_1';
const S2 = 'skchr_heyak_2';
const S3 = 'skchr_heyak_3';
/** S1 "额外攻击一个目标": the next attack's targets (no blackboard key; `cnt` is the charge count). */
const S1_TARGETS = 2;
/** S2 "9连发": shots per attack when the text gives no number (no blackboard key). */
const SHOTS = 9;
/** S2's MultiRangedAttack `_triggerDelta`. */
const SHOT_GAP = 0.05;
/** S3 whirlwinds (PRTS 备注): lanes (facing-RIGHT row offsets: her row, "左1.0", "右1.0"), spawn delay, speed, flight, box. */
const WIND_LANES = Object.freeze([0, 1, -1]);
const WIND_DELAY = 0.3;
const WIND_SPEED = 1;
const WIND_RANGE = 4;
const WIND_HALF = 0.5;
/** "旋风在生成后1.77s内，攻击倍率由最低值线性递增至最大值". */
const WIND_RAMP = 1.77;
/** S3's 3-10 when the data carries no grid. */
const R310 = Object.freeze([[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [-1, 0], [-1, 1], [-1, 2], [-1, 3], [-1, 4]]);
/** A whirlwind hit after she left the field: no 传承终焉, no module trait (PRTS 备注). */
const AWAY_TAG = 'heyak:away';
const WEIGHTLESS_KEY = 'heyak:weightless';
const FRAGILE_EVERY = 0.2;

/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** An elite or leader enemy (精英或领袖敌人). @param {Unit | null | undefined} e */
const isEliteEnemy = (e) => !!e && e.side === 'enemy' && (e.isBoss || e.def?.rank === 'ELITE' || e.def?.rank === 'BOSS');
/** @param {{ tags?: string[] } | null | undefined} d @param {string} tag */
const tagged = (d, tag) => !!(d && d.tags && d.tags.includes(tag));
/** A module trait that works 在集成战略中 only (ISW-A): nothing of it applies in this mode. @param {KitChess} chess */
const roguelikeOnly = (chess) => /集成战略/.test(String(chess?.trait?.moduleDesc ?? ''));
/** The record's active module, or null. @param {KitChess} chess */
const activeModule = (chess) => (chess?.module?.active ? (chess.modules ?? []).find((m) => m && m.uniEquipId === /** @type {ModuleState} */ (chess.module).id) ?? null : null);
/**
 * A whirlwind of S3 in flight (`unit.mem.heyakWinds`): its tile, its heading, the tiles left, its age, her deployment, its number.
 * @typedef {{ x: number, y: number, dx: number, dy: number, left: number, age: number, seq: number, n: number }} HeyakWind
 */
/** Does the enemy's body touch the 1×1 square centred on (x, y)? @param {Unit} e @param {number} x @param {number} y */
function inBox(e, x, y) {
  const R = hitRect(e);
  if (!R) return Math.abs(e.x - x) <= WIND_HALF + 1e-9 && Math.abs(e.y - y) <= WIND_HALF + 1e-9;
  return R.x0 <= x + WIND_HALF && R.x1 >= x - WIND_HALF && R.y0 <= y + WIND_HALF && R.y1 >= y - WIND_HALF;
}

/** 浮空 from her skills (heyak_s_1[levitate], heyak_s_2 / _3[hit_levitate]: their CreateBuff draws heyak_cyclone_01_emit). @param {Battle} battle @param {Unit} unit @param {Unit} e @param {number} duration */
function lift(battle, unit, e, duration) {
  battle.applyStatus(e, 'levitate', { duration, source: unit });
  battle.fx('kitHit', { x: e.x, y: e.y, id: e.id, src: unit.id, k: 'heyak:lift' });
}

/** @type {KitFns} */
export default {
  char_4027_heyak: (bb, chess) => {
    const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
    const isw = roguelikeOnly(chess);
    const mod = activeModule(chess);
    // CCR-Y's hidden part (the 【法术脆弱】 rider); an ISW module's hidden parts are 集成战略-only
    const rider = isw || !mod ? {} : Object.assign({}, ...(mod.talentChanges ?? []).filter((t) => t && t.talentIndex === -1).map((t) => t.bb ?? {}));
    const tb = isw ? {} : traitBb(chess);
    const pen = num(tb.magic_resist_penetrate_fixed);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const s1 = skillRec(chess, S1), s2 = skillRec(chess, S2), s3 = skillRec(chess, S3);
    const shots = Math.max(1, Math.floor(textCount(String(s2?.desc ?? ''), /(\d+)连发/, SHOTS, 'burst')));

    /** S3: release one attack's three whirlwinds. @param {Battle} battle @param {Unit} unit @param {HeyakWind[]} winds */
    function releaseWinds(battle, unit, winds) {
      const seq = unit.deploySeq;
      const [fr, fc] = dirVec(unit.dir);
      const x0 = unit.tileC, y0 = unit.tileR;
      for (const lane of WIND_LANES) {
        const [dr, dc] = rotateOffset(lane, 0, unit.dir);
        const delay = battle.rng.range(0, WIND_DELAY);
        battle.after(delay, () => {
          // a whirlwind not yet out when she left is never released [ASSUMED·engine: "已存在的旋风" only fly on]
          if (!(unit.alive && unit.deployed && unit.deploySeq === seq)) return;
          const w = { x: x0 + dc, y: y0 + dr, dx: fc, dy: fr, left: WIND_RANGE, age: 0, seq, n: ++unit.mem.heyakWindSeq };
          battle.fx('kitHit', { x: w.x + fc * WIND_RANGE, y: w.y + fr * WIND_RANGE, sx: w.x, sy: w.y, id: unit.id, src: unit.id, n: w.n, k: 'heyak:wind' });
          if (!windHit(battle, unit, w)) winds.push(w);
        }, { owner: unit });
      }
    }
    /** The first enemy the whirlwind touches, struck: 浮空 first (PRTS: before 传承终焉), then the damage. True when it hit. @param {Battle} battle @param {Unit} unit @param {HeyakWind} w */
    function windHit(battle, unit, w) {
      const touched = battle.enemies.filter((e) => e.alive && inBox(e, w.x, w.y) && canTargetEnemy(unit, e, unit.profile));
      if (!touched.length) return false;
      sortEnemyTargets(battle, unit, touched, null);
      const best = touched[0];
      const away = !(unit.alive && unit.deployed && unit.deploySeq === w.seq);
      const lev = num(b3['attack@levitate']);
      if (lev > 0) lift(battle, unit, best, lev);
      const lo = num(b3['attack@min_atk_scale']), hi = num(b3['attack@max_atk_scale'], lo);
      const scale = lo + (hi - lo) * Math.min(1, w.age / WIND_RAMP);
      if (best.alive) {
        battle.dealDamage(unit, best, {
          amount: unit.s.atk * scale, type: 'arts', isAttack: true, isSkill: true,
          ...(away ? { resIgnoreFlat: -pen, tags: [AWAY_TAG] } : null),
        });
      }
      battle.fx('kitHit', { x: w.x, y: w.y, id: best.id, src: unit.id, n: w.n, k: 'heyak:windHit' });
      return true;
    }

    return {
      skills: {
        [S1]: {
          kind: num(s1?.maxChargeTime, 1) > 1 ? 'charges' : 'instant',
          targeting: { maxTargets: S1_TARGETS },
          attack: { atkScale: num(b1.atk_scale, 1) },
        },
        [S2]: {
          kind: 'duration',
          attack: { atkScale: num(b2['attack@atk_scale'], 1) },
        },
        [S3]: {
          kind: 'duration',
          mods: { batPct: batMod(b3.base_attack_time, chess) },
          targeting: { rangeGrid: s3?.rangeGrid ?? R310 },
          attack: { atkScale: 1 },   // the attack's strike is the whirlwinds (install)
        },
      },
      talents: [
        { install(battle, unit) { // 传承终焉: × atk_scale and 沉默 on an air unit hit by her attack
          const sc = num(t0.atk_scale, 1), sil = num(t0.silence);
          onHitBy(battle, unit, (ctx) => {
            const d = ctx.dmg, t = ctx.target;
            if (!d.isAttack || tagged(d, AWAY_TAG) || !t.isFlying) return;
            if (sc !== 1) d.amount *= sc;
            if (sil > 0 && t.alive) battle.applyStatus(t, 'silence', { duration: sil, source: unit });
          });
        } },
        { install(battle, unit) { // 曾有羽翼: 失重 above hp_ratio in her range; CCR-Y stage 3: 【法术脆弱】 below its hp_ratio
          const hiRatio = num(t1.hp_ratio, 1);
          battle.on('tick', () => {
            const on = up(unit);
            const inRange = on ? new Set(battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true })) : null;
            for (const e of battle.enemies) {
              if (!e.alive) continue;
              // (another 霍尔海雅's 失重 carries the same key: it is hers to keep or drop)
              const mine = /** @type {BuffRec | null} */ (e.findBuff(WEIGHTLESS_KEY));
              const want = on && /** @type {Set<Unit>} */ (inRange).has(e) && e.hpRatio > hiRatio + 1e-9
                && !/** @type {BuffRec[]} */ (e.buffs).some((b) => b.status === 'weightless' && b.key !== WEIGHTLESS_KEY);
              if (want && !mine) battle.addBuff(e, { key: WEIGHTLESS_KEY, status: 'weightless', visible: true, mods: { massFlat: -1 }, source: unit });
              else if (!want && mine && mine.source === unit) battle.removeBuff(e, mine);
            }
          }, { owner: unit });
          const fragile = Math.round((num(rider.damage_scale, 1) - 1) * 1e6) / 1e6, loRatio = num(rider.hp_ratio);   // 1.2 → 0.2
          if (fragile > 0) {
            battle.every(FRAGILE_EVERY, () => {
              if (!up(unit)) return;
              for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true })) {
                if (e.hpRatio < loRatio - 1e-9) battle.applyStatus(e, 'artsFragile', { duration: FRAGILE_EVERY + 0.1, value: fragile, source: unit });
              }
            }, { owner: unit, immediate: true });
          }
        } },
      ],
      install(battle, unit) {
        // module traits (none on the normal form, nothing of ISW-A's): CCR-X RES ignore, CCR-Y SP per hit on an elite / leader
        if (pen > 0) statBuff(battle, unit, 'trait:heyak:resIgnore', { resIgnoreFlat: pen });
        const sp = num(tb.sp);
        if (sp > 0) {
          battle.on('damaged', (ctx) => {
            const d = ctx.dmg;
            if (ctx.source !== unit || !d || !d.isAttack || d.isSplash || tagged(d, AWAY_TAG) || !isEliteEnemy(ctx.target)) return;
            giveSp(unit, sp, 'trait');
          }, { owner: unit });
        }
        const sid = unit.skill?.id;
        if (sid === S1) {
          // 但为求索: the shot count decides the 浮空 (PRTS: the shots fired, whatever happens in flight)
          const lev = num(b1.levitate);
          battle.on('beforeAttack', (ctx) => {
            if (ctx.attacker !== unit || !ctx.isSkill) return;
            unit.mem.heyakLift = ctx.targets.length === 1 ? ctx.targets[0] : null;
          }, { owner: unit, priority: -10 });
          onHitBy(battle, unit, (ctx) => { // before 传承终焉 (priority 0): the lift is settled first
            const d = ctx.dmg;
            if (!d.isAttack || !d.isSkill || unit.mem.heyakLift !== ctx.target) return;
            unit.mem.heyakLift = null;
            if (lev > 0) lift(battle, unit, ctx.target, lev);
          }, 10);
        } else if (sid === S2) {
          // 群星逶迤: the nine shots, each at a random enemy of her range, each rolling its 浮空 before 传承终焉
          const prob = num(b2['attack@prob']), lev = num(b2['attack@levitate']);
          /** @param {Record<string, any>} prof */
          const pick = (prof) => {
            const cands = battle.enemiesInKeys(unit.rangeKeys, unit, prof);
            for (const e of battle.blockedTargets(unit, prof)) if (!cands.includes(e)) cands.push(e);
            return cands.length ? battle.rng.pick(cands) : null;
          };
          let burst = false;   // a shot of the burst is no new attack of the skill
          battle.on('beforeAttack', (ctx) => {
            if (burst || ctx.attacker !== unit || !unit.skill?.active || !ctx.targets.length) return;
            const first = pick(ctx.profile);
            if (first) ctx.targets = [first];
            const seq = unit.deploySeq, prof = ctx.profile;
            /** @param {number} left */
            const shot = (left) => {
              if (!up(unit) || unit.deploySeq !== seq || !unit.canAct) return;
              const e = pick(prof);
              if (e) {
                burst = true;
                performAttack(battle, unit, prof, [e], { noAmmo: true, spell: shots - left });   // the cast's spell 1 … 8
                burst = false;
              }
              if (left > 1) battle.after(SHOT_GAP, () => shot(left - 1), { owner: unit });
            };
            if (shots > 1) battle.after(SHOT_GAP, () => shot(shots - 1), { owner: unit }); // loop-cap: textCount burst
          }, { owner: unit });
          onHitBy(battle, unit, (ctx) => {
            const d = ctx.dmg;
            if (!d.isAttack || !d.isSkill || !(prob > 0) || !(lev > 0)) return;
            if (battle.rng.chance(prob)) lift(battle, unit, ctx.target, lev);
          }, 10);
        } else if (sid === S3) {
          // 博览者的狂语: the attack's strike releases the whirlwinds and hits nothing itself; those in flight go on (also after she left the field)
          const winds = (unit.mem.heyakWinds = /** @type {HeyakWind[]} */ ([]));
          unit.mem.heyakWindSeq = 0;
          battle.on('beforeAttack', (ctx) => {
            if (ctx.attacker !== unit || !unit.skill?.active) return;
            const foes = ctx.targets;
            ctx.targets = [];
            unit.lastAttackAt = battle.time;
            unit.stats.attacks++;
            releaseWinds(battle, unit, winds);
            // an attack was performed ("攻击时" content), the whirlwinds still on their way
            if (battle.hasHook('attack')) battle.emit('attack', { attacker: unit, targets: foes.slice(0, 1), isSkill: true });
          }, { owner: unit, priority: 100 });
          battle.on('tick', ({ dt }) => {
            for (let i = winds.length - 1; i >= 0; i--) {
              const w = winds[i];
              const step = Math.min(WIND_SPEED * dt, w.left);
              w.x += w.dx * step;
              w.y += w.dy * step;
              w.left -= step;
              w.age += dt;
              if (windHit(battle, unit, w)) { winds.splice(i, 1); continue; }
              if (w.left <= 1e-9) {
                winds.splice(i, 1);
                battle.fx('kitHit', { x: w.x, y: w.y, id: unit.id, src: unit.id, n: w.n, k: 'heyak:windEnd' });
              }
            }
          }, { owner: unit });
        }
      },
    };
  },
};
