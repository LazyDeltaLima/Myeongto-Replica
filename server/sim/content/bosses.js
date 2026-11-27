// server/sim/content/bosses.js — scripted leaders (boss_1…boss_10) and their parts (DESIGN §7, research 05 §5, 06 §10.1).
//
// install(battle) ensures the enemy dispatch hooks (enemies.js) and attaches a boss kit to every spawned leader / part
// listed in BOSS_KITS. Damage dealt TO a leader routes to the shared boss pool through the engine (tag 'boss' +
// sharedBoss); parts that "传递伤害" push the damage they take into the pool with a 无来源 battle.loseHp(leader, …)
// credited to the attacker (PART_TRANSFER = 1, "等量"). Numbers come from the (template-overridden) talent / skill blackboards; the rest are named
// constants ([ASSUMED] or PRTS-sourced). Boss HP rules ("<20 %", "≤50 %") read the leader's HP ratio, which the engine
// syncs from the shared pool, so both mirrored copies switch phase together.
//
// Wave template: branches / extraRoutes / devices are read from the template the battle was built
// from — `opts.waveTemplate|template|templateId|waveId` when the match passes it, else inferred from data/waves.json
// (the template whose leader spawn matches and whose route list equals battle.routes). Without a template the
// fallbacks spawn summons at the leader and route them to the nearest goal. Branch spawns keep their literal key
// unless the match passes the round's placeholder replacements as `opts.slotKeys` ({ NF: key, N: key, … }).
//   · patrol: a leader / part on PATROL_MOVE checkpoints loops them by the route itself (ai.js patrolNext — never
//     reaches the goal: 卢西恩 lpr 30, 铳, 碎铳之簧).
//   · 'boss_battle_multi_player' (铳, 卢西恩): with ≥2 players on the field the mirrored copy is spawned from the branch
//     (skipped if the match already spawned a second copy, or opts.bossMirror === false).
//
// Leaders (see each kit for details):
//   boss_1/8 假想敌：胄      random arts beam (range 8); 灭顶之灾 one 刺胄之弹 at the highest-ATK operator in range (8-hit
//                            flying shell; on arrival a 9.95 s 3×3 zone: stun + phys every 1 s); <20 %: damage ×0.5 (no extra shell: PRTS
//                            能力修正); 死亡集群 drones — a drone that dies costs the leader 2 % of its max HP = the shared
//                            pool's (DRONE_LINK_BASE, [ASSUMED] reading), past 限伤 (a share, no hit). boss_8 adds 斩胄之剑 /
//                            破胄之锤.
//   斩胄之剑 / 破胄之锤      初始模式: hover invulnerable next to 胄, AoE attacks (锤 150 % ATK). 出击模式: blink to the
//                            level's blink route, fly at the lowest-ATK operator (3×3 stun + DoT); 15 hits shoot it
//                            down (瘫痪: stun 10 s, ground unit, damage ×1.3). Either way a new 初始模式 copy with its HP
//                            replaces it at home. Every damage it takes costs 胄 as much (PART_TRANSFER, 无来源, 等量) —
//                            grounded per both texts, during the dive per the PRTS talent [ASSUMED]. The shell, 剑 and
//                            锤 are 失衡免疫 + 静态刚体 (PRTS 天赋): no push or pull moves them.
//   boss_2/9 假想敌：铳      unblockable (规程: only while charging, and blocked it shoots its blocker); highest-DEF
//                            target in range; erosion; ASPD +80 per attack on the same target (max 5, a new target
//                            restarts at 1; floor 20 before the first attack); 最终之罚 charge at the highest-DEF ground
//                            unit (disabled by the h07_02 override).
//                            boss_9: damage ×0.2 while the one companion picked 0.03 s after it appears lives (未尽的告解),
//                            盲信之誓 links (100 phys/s on the lines), 末日布道 dash.
//   碎铳之簧 a/b/c           always unblockable; highest-DEF target in range; arts barrier (absorbs arts after RES; phys
//                            ×0.1, counter phys + erosion) / element shield (phys+arts ×0.1, broken by its own element
//                            burst; the (spCost+1)-th attack is a bouncing bullet: phys ×0.8 per bounce + erosion, 4 hits) /
//                            5-hit shield (the (spCost+1)-th attack is ten shots 0.1 s apart); the skills need the shield;
//                            shield back 25 s after breaking (SP cleared); every damage taken costs 铳 as much
//                            (PART_TRANSFER, 无来源), nobody else.
//   boss_3/10 假想敌：管     summons 余音 (dark) every 40 s (20 s < 50 %); whole-field normal attack of 3 shots (r 1.8 arts)
//                            on a dark 余音 (which takes the hit and pulses), else on an operator; 10 % evade < 50 % HP;
//                            裂管之奏 3 shots on every dark 余音 (r 1.8 arts + apoptosis, 0.8 apoptosis around each unit hit).
//                            boss_10 + 假想敌：弦 (invulnerable, gold 余音 else an operator, 1 shot r 1.6; 断弦之奏 AoE + flips
//                            them dark; leaves with 管).
//   余音                     10-hit unit, block ≥ 2 only; gold (ASPD +50) / dark (ATK +50 %, move +20 %) forms that swap
//                            after 10 strikes; pulses on every hit taken; 合奏 SP +1 per damage taken (max 12): one full
//                            echo makes every echo play its ensemble at once (checked every 1 s).
//   boss_4 盐风主教昆图斯     2 highest-DEF targets (+ neural); 3 growth stages (33 % HP lost or 75 s / 200 s): 大潮 global
//                            arts + neural, 崩坍 delayed strikes on 2/4/8 highest-DEF units, 断裂生殖 switches on the
//                            template's 子代 (隐匿 12 s, then 摄食: before every hit the nearest operator within 1, ATK
//                            phys + neural + 1 s stun every 1 s; withdraws 35 s after it appears; switched on again while
//                            alive: a new one replaces it), 物种爆发 LP loss (stage 3).
//   boss_5 卢西恩            evade 40 % while unblocked, DEF pen 40 %, neural on hit; AoE skill (radius 2); blinks past its
//                            blocker leaving a 不祥幻影 (same kit minus blink). Template overrides (0.2 / 0.12) apply.
//   boss_6 阿利斯泰尔        王权号令 (SP 1/s, plus-shaped 200 % strike + random equipment drop, an operator's tile or one no
//                            operator can stand on too: the operator on a piece's tile picks it up — sword ATK +30 %, vest
//                            DEF +30 %, wand 800 arts + 战栗 after a skill); 莫非王土 animates the oldest piece — any with an operator in range, else a vest
//                            or wand; a lone sword waits — (2 s after it appears, then once per 王权号令 cycle) (sword
//                            strike / directional vest (first its front) + barrier / wand → 黄金回响 device on its
//                            tile); ≤50 %: DEF +100 %, RES +45, animates 2; 斥退 at 999 s.
//   boss_7 “萨米的意志”      冰凌 (its normal attack) runs down a whole column from the stage's top row, tile by tile
//                            (each tile's ally hit 1 s after the ice reaches it); 自然涌动 stun + arts DoT; <50 %: damage taken
//                            ×(1−0.6), 2 targets; Doom at 600 s (LP −30). Targets via fairOrder (two players alternate).
// The huge leaders (SELF_BOUND: 胄 ×2, 管 ×2, 昆图斯, 阿利斯泰尔, 萨米的意志 — the 巨型单位 of the default season's data) are
// 自缚 + 无法被阻挡 (PRTS 天赋): a persistent noMove + unblockable buff from spawn, so they never walk their route.
// Every leader (tag boss) takes 侵蚀 gauge damage like any enemy (no official table, prefab or level grants an immunity:
// docs/rules/sim.md 「리더 적의 침식」).
// An airborne (起飞) operator is no selection of a ground leader or part (对地规避: canTargetAlly, the damage pipeline,
// the area selectors); still reach it (`ignoreSelect`): the 刺胄之弹 zone / 剑 / 锤 blasts (flying units, 无来源 hits; 掷剑 /
// 掷锤 pick their operator "（无视无法选择）"), the 盲信之誓 chains ("无视无法选择"), the 法术护盾 counter on its attacker
// (a direct pick) and the ticks of a debuff already on it (【自然涌动】: a tick selects nobody).
// Every area effect of a leader or part — pulses, strikes around an echo, blasts, charges and tramples, crosses, columns,
// whole-field skills — selects with enemies/helpers.js areaAllies / areaAlliesInTiles / fieldAllies (targeting.js
// areaSelectable): no 隐匿 operator, the one blocking the unit included (GitHub #97), no untargetable or sleeping one, no 起飞 one for a
// ground unit; 迷彩 is not checked (splash-type, 中点判定 / 格子判定 or "无视迷彩" on PRTS; the rest [ASSUMED], DESIGN
// §22.12). Only 【盲信之誓】 ("无视无法选择、迷彩") takes everyone on its lines.
// LP effects ('lpLoss' hook + result.lpLoss) must be applied by the match (see the report of this module's owner).
// fx kinds: 'beam' 'shell' 'explode' 'telegraph' 'charge' 'link' 'dash' 'column' 'tide' 'rockfall' 'tentacle' 'equip'
//   'sword' 'vest' 'blink' 'summon' 'grow' 'phase' 'lpLoss' (x, y + extra {id, r, tiles, kind, tx, ty …}).

import { MOVE_SCALE, ROWS, COLS, ALLY_COLLIDER_RADIUS, TICK } from '../constants.js';
import { GEO } from '../../../shared/constants.js';
import { aggroCmp, areaSelectable } from '../targeting.js';
import { attackWindup, enemyMode } from '../ai.js';
import { normalizeRoute } from '../simdata.js';
import {
  ensureInstalled, abOf, attach, T, elem, hurt, targetsNear, allTargets, byPriority, areaAllies, areaAlliesInTiles, fieldAllies, auraAllies,
  remainingRoute, stayRoute, stepToward, setHits, hitCount, setForm, lpLoss, blinkForward, canCast, unbalancedNow, absorbArts, shoot,
  castStrikeAt,
} from './enemies.js';
import { hypot, powi } from '../detmath.js';
import { hitRect, bodyInRadius } from '../body.js';
import { effectRecord } from './support/index.js';
import { isNormalDamage } from '../damage.js';
/** @import { Battle } from '../Battle.js' */
/** @import { Unit } from '../units.js' */
/** @import { AttackProfile } from '../ai.js' */
/** @import { AbState, AbSkill, AbList, EnemyAbility, DamageRec } from './enemies.js' */
/** @import { Buff } from '../battle/status.js' */
/** @import { EnemyMods } from '../battle/spawns.js' */
/**
 * A spawn of a wave template (data/waves.json `spawns`, a branch phase's entries), read field by field.
 * @typedef {{ [key: string]: unknown, key: string, enemyKey?: string, time: number, count: number, routeIndex: number,
 *   slot?: string, tag?: string, action?: string, unharmful?: boolean }} WaveSpawn
 * A stage token a leader switches on (data/waves.json `devices`; 黄金回响 data/enemies.json `raw.devices`), read field by field.
 * @typedef {{ [key: string]: unknown, key: string, alias?: string | null, pos?: number[] | null, name?: string, dmgType?: string,
 *   stats?: DeviceStats | null, talent?: Record<string, unknown> | null, skill?: DeviceSkill | null }} WaveDevice
 * @typedef {{ [key: string]: unknown, maxHp?: number, atk?: number, def?: number, res?: number, bat?: number, aspd?: number,
 *   massLevel?: number }} DeviceStats
 * @typedef {{ [key: string]: unknown, skillId?: string, prefabId?: string, spCost?: number, bb?: Record<string, unknown> }} DeviceSkill
 * A route of a wave template (data/waves.json `routes` / `extraRoutes`: spawnEnemy's `route`), read field by field.
 * @typedef {{ [key: string]: unknown, motion: string, start: number[], end: number[], checkpoints: unknown[] }} WaveRoute
 * A wave template (data/waves.json) read field by field, or null without one.
 * @typedef {{ [key: string]: unknown, spawns?: WaveSpawn[], routes?: WaveRoute[], extraRoutes?: WaveRoute[],
 *   branches?: Record<string, WaveSpawn[][]>, devices?: WaveDevice[] } | null} Tpl
 * A leader's or a stage token's kit: an enemy kit (content/enemies.js EnemyKit) that is always given the wave template.
 * @typedef {(ab: AbState, e: Unit, b: Battle, tpl: Tpl) => AbList} BossKit
 * The time SP of a leader's skill (skillSp): its SP, cap and cost, and the ability that fills it.
 * @typedef {{ sp: number, max: number, cost: number, ready: () => boolean, spend: (e2: Unit) => void, ab: EnemyAbility }} SkillSp
 * What a buff's `onTick` is called with (battle/status.js).
 * @typedef {{ battle: Battle, unit: Unit }} BuffTick
 */

// ---------------------------------------------------------------------------------------------------------------
// constants

/**
 * Share of the damage a 剑/锤 or a 碎铳之簧 takes that its leader loses: 1, 等量 — PRTS talents (“斩胄之剑” / “破胄之锤”
 * "受到伤害时令假想敌：胄受到等量的无来源生命流失"; 碎铳之簧 (all three) "…令全场范围内仇恨值最高的1名假想敌：铳受到等量的无来源
 * 生命流失"); the enemy data carries no ratio blackboard (the handbook's "以一定比例" is that 1). The loss is 无来源 (hooks see
 * no source; the attacker keeps the credit — stats, the per-player pool tally) and follows EVERY damage taken: a
 * 剑/锤 only takes damage outside its invulnerable 初始模式 (its 出击模式 dive and 【瘫痪】). The two official texts
 * disagree on the dive: the PRTS talent says "受到伤害时" (any damage), the in-game handbook (data/enemies.json abilities,
 * PRTS 能力) "被击落时受到伤害以一定比例传递" (only once shot down) — the dive hits passing on is [ASSUMED] (the talent
 * text; ≤ 15 hits per dive). A loss passed on to a leader is one hit for 限伤 (sim/damage.js leaderHitLimit, via
 * Battle.loseHp). v2.5: 0.5 [ASSUMED], and a 剑/锤 passed damage on only while grounded (DESIGN §20.10, §20.13).
 */
export const PART_TRANSFER = 1;
/** The 斩胄之剑 / 破胄之锤 share — the same PRTS 等量 as PART_TRANSFER (kept as a name for the blade kit and its tests). */
export const BLADE_TRANSFER = PART_TRANSFER;
/** 破胄之锤 normal attack: 150 % ATK (PRTS 天赋 "普通攻击对攻击范围内的所有我方单位造成攻击力150%的物理普通伤害"; 斩胄之剑 100 %). */
/** @type {Readonly<Record<string, number>>} */
const BLADE_ATK_SCALE = Object.freeze({ enemy_9015_acstmb: 1.5 });
/**
 * Level branches of each part (act1autochess_h08_01 / _s): 斩胄之剑 spawns on the start of `left_hand_origin` (3,12),
 * 破胄之锤 on `right_hand_origin` (3,8). `<hand>_blink` = the preset route 掷剑 blinks to (its start; PRTS "将自身路径改为
 * 关卡预设路径并闪现至路径起点"), `<hand>_origin` = the route the new 初始模式 copy is summoned on ("以关卡预设路径召唤").
 */
/** @type {Readonly<Record<string, string>>} */
const BLADE_HAND = Object.freeze({ enemy_9014_acstma: 'left_hand', enemy_9015_acstmb: 'right_hand' });
/**
 * 死亡集群: a drone that dies (PRTS 能力修正 "该无人机单位死亡时", whoever kills it) costs 胄 `hp_ratio` (2 %) of "最大生命值"
 * (PRTS 假想敌：胄 "该妖怪死亡时令假想敌：胄受到最大生命值2%的真实伤害"). WHICH max HP is not documented [ASSUMED reading]:
 *   'pool' (default, = v2.5): the leader's max HP as the battle shows it — the shared pool (the engine syncs the unit's
 *          HP to it). It is the same HP the "自身生命值低于20%" talent reads, and that one must read the pool (the
 *          unit's data 600 000 is above the 标准 pool 247 500 of one player, solo or co-op, where a fixed 600 000
 *          would never drop below 20 %). A drone = 2 % of the leader bar in every mode and difficulty (终极 72 000).
 *   'unit': the in-battle unit's data max HP (600 000 / hidden 1 200 000, 不死) — 12 000 / 24 000 per drone at every
 *          difficulty: 0.33 % of the 终极 bar but 4.8 % of the solo 标准 bar (247 500).
 * Round 2 of the boss-HP review tried 'unit'; the review measured the solo regression, so the default is back to 'pool'.
 * 限伤 (shared/constants.js BOSS_HIT_LIMIT): the share is no hit and passes the limit (Battle.loseHp `noHitLimit`).
 * Since the pool counts every player alive at the fight's start (DESIGN §25.13.4, the owner's decision of 2026-10-06),
 * the hidden 胄 终极 pool reaches 21 600 000 / 28 800 000 with 3 / 4 players — a drone 432 000 / 576 000, which the
 * limit (ceil ≥ 300000) would cancel, so drones would stop counting exactly in the largest fights. [ASSUMED]: the
 * official client checks every damage modifier on a leader (research 11 §2.1) and PRTS calls the drone's 2 % 真实伤害,
 * but which max HP it reads is not documented; the remake reads the pool and keeps the 2 % share.
 */
export const DRONE_LINK_BASE = 'pool';
/** 卢西恩 / 不祥幻影 AoE radius (PRTS "半径2"). */
const LUCIEN_AOE_RADIUS = 2;
/** 余音 on-hit pulse radius (PRTS 1.6) and 合奏 radii per form (PRTS gold 0.8 / dark 1.6). */
const ECHO_PULSE_RADIUS = 1.6;
const ECHO_ENSEMBLE_RADIUS = Object.freeze({ gold: 0.8, dark: 1.6 });
/** "只能被阻挡数大于等于2的单位阻挡". */
const ECHO_BLOCK_WEIGHT = 2;
/** 管 / 弦 shot spacing (s): the prefab Attack and Skills/1 `_triggerDelta` 0.25 between the `_additionalTimes` shots
 *  (until 2026-10-15 0.4 s, skill only). */
const PIPE_STRIKE_GAP = 0.25;
/** 管 / 弦 shot burst radius: the CircleCollider2D of projectile_enemy_acduml (1.8) / _acdumm (1.6), no `range_scale`
 *  (research boss-patterns §2). PRTS gives 弦 3.0, which no client value backs. */
/** @type {Readonly<Record<string, number>>} */
const PIPE_SHOT_RADIUS = Object.freeze({ acduml: 1.8, acdumm: 1.6 });
/** Shots per normal attack: 管 3 (prefab Attack `_additionalTimes` 2), 弦 1. */
/** @type {Readonly<Record<string, number>>} */
const PIPE_SHOTS = Object.freeze({ acduml: 3, acdumm: 1 });
/** Damage tag of a 管 / 弦 shot on a “余音”: the echo pulses as it does under an operator's hit. */
const ECHO_STRIKE = 'echoStrike';
/**
 * 子代 (trap_039_dstnta, 【断裂生殖】): 摄食's reach — the skill's Trigger CircleCollider2D radius 1.0 around the token
 * (sktok_dstnta prefab; PRTS 「周围四格」: its tile and the four next to it) —, its hit interval (`_triggerDelta` 1.0) and
 * the stun of each hit (trap_tentac_s[stun] `lifeTime` 1.0, renewed by the next hit).
 */
const BROOD_KEY = 'trap_039_dstnta', BROOD_REACH = 1, BROOD_HIT_EVERY = 1, BROOD_STUN = 1;
/**
 * 子代's clip times (its skeleton): Grow plays Start_02 (1 s) — 隐匿 ends as it starts (trap_tentac_finish_invisible on
 * ON_CAST_START), the GrowUp mode comes as it ends (switch_mode on ON_CAST_END); 摄食 waits for its attack event
 * (`_waitForAttackEvent`): Attack_Begin (0.833 s), then OnAttack 0.1 s into Attack_Loop.
 */
const BROOD_GROW_ANIM = 1, BROOD_FIRST_HIT = 0.933;
/** 崩坍 delay (PRTS 1 s), targets per growth stage (PRTS 2/4/8) and 物种爆发 delay (PRTS 4 s). */
const ROCKFALL_DELAY = 1, ROCKFALL_TARGETS = [2, 4, 8], DOOM_DELAY = 4;
/** 铳: minimum attack speed (PRTS "最低20") and charge hit radius (PRTS 0.35 — also “碎铳之簧”'s 追逐模式 trample). */
const ASPD_FLOOR = 20, CHARGE_RADIUS = 0.35;
/**
 * 铳 【最终之罚】's trace (client prefab Modes/S1/Body/GeneralAbilities/TraceEnemy, a SimpleTraceTargetAbility): every
 * `_searchCoolDown` 0.3 s it re-routes when its target has moved more than √`_updateDistSqrEps` (0.1) since the last route,
 * and ends the charge once within `_reachedThreshold` 0.4 of the traced tile's centre; it walks to that centre moved by
 * a random offset of ±`_traceRandomOffset` (0.4, 0.4) per axis (TracePositionCursor.ResetReachedOffset →
 * RandomExtensions.RandomVector2: −r + U·2r).
 */
const TRACE_SEARCH = 0.3, TRACE_MOVE_SQR = 0.1, TRACE_REACHED = 0.4, TRACE_OFFSET = 0.4;
/** `_findNearbyReachableTile`: the 8 neighbours tried when the target's own tile cannot be reached. */
const TRACE_NEAR = Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]);
/** 盲信之誓 link half-width (PRTS 0.5). */
const LINK_WIDTH = 0.5;
/** 未尽的告解: `achunt_passive` triggers once, `triggerInterval` 0.03 s after the hidden 铳 appears (prefab CommonAbilities/Ability0). */
const CONFESSION_PICK = 0.03;
/**
 * “碎铳之簧” skill shots (official client, research boss-patterns §1 #8 / #12). 元素护盾 bullet (projectile_enemy_actrpb):
 * the damage × `_atkScaleRatePerBounce` 0.8 per bounce, the next target within the selector circle 1.7
 * (`_ignoreRangeScale`), a unit hit less than `_keepAlreadyHitTime` 0.7 s ago is not picked again unless nobody else is
 * there (`_allowRepetitionIfNoTarget`: the same one again), bounces fly `_speedAfterFirstReach` 6 tiles/s.
 * 频次护盾 十连击 (Skills/1): 1 + `_additionalTimes` 9 shots `_triggerDelta` 0.1 s apart.
 */
const SPRING_BOUNCE_FALLOFF = 0.8, SPRING_BOUNCE_RANGE = 1.7, SPRING_BOUNCE_KEEP = 0.7, SPRING_BOUNCE_SPEED = 6;
const SPRING_COMBO_HITS = 10, SPRING_COMBO_GAP = 0.1;
/**
 * Leaders that are 自缚 and cannot be blocked — the 天赋 line of every 巨型单位 page (PRTS 假想敌：胄 (both copies) "自缚、
 * 不可阻挡", 假想敌：管 (+ 隐秘核心) / 盐风主教昆图斯 / 阿利斯泰尔，帝国余晖 / “萨米的意志” "自缚 … 无法被阻挡"). 自缚 (PRTS
 * 异常效果 UNMOVABLE_PRIVATE) = 无法移动, like 束缚 but never recognised as 束缚: flag noMove, not bind. They stand where
 * they spawn whatever their route says (the official routes walk to a goal; only the talent holds them), so their
 * hit area (body.js) stays on the pipe block. These are exactly the default season's enemies with a data `hitArea`
 * (规程's 械 / 茧 are held by their own talents, its 冲击之械 by its kit).
 */
export const SELF_BOUND = Object.freeze([
  'enemy_9013_acstmk', 'enemy_9013_acstmk_2', 'enemy_9021_acduml', 'enemy_9021_acduml_2', 'enemy_1521_dslily',
  'enemy_9032_aclionk', 'enemy_9033_acdeer',
]);
/** Enemy SP per second when a time-SP record gives no `increment` (the four that have one give 1); 阿利斯泰尔's 莫非王土
 * delay after each 王权号令 [ASSUMED]. */
const ENEMY_SP_PER_SEC = 1, ANIMATE_DELAY = 2;

/**
 * Is one of enemy `e`'s skills casting now (content/enemies.js onSkillSlot `ab.casting`, until its end or its cut)? The
 * official client's casting EnemySkill registers itself on its enemy as an attribute modifier from `CastToTarget` to
 * `_OnCastFinish` (`registeredAsModifier`) and its `abnormalFlagMask` is SP_RECOVER_STOPPED (`recoverSpWhenAffecting`
 * is false for every enemy skill), so the enemy's SP stands still while any of its skills casts.
 * @param {Battle} b @param {Unit} e
 */
function enemyCasting(b, e) {
  const k = e.mem.ab && e.mem.ab.casting;
  return !!k && b.time < k.until - 1e-9;
}
/** The time-SP gain of enemy `e` over `dt` (spData INCREASE_WITH_TIME `increment` a second): see skillSp. @param {Battle} b @param {Unit} e @param {{ increment?: number }} d @param {number} dt */
function spGain(b, e, d, dt) {
  if (e.hidden || enemyCasting(b, e)) return 0;
  return dt * (Number.isFinite(d && d.increment) && /** @type {number} */ (d.increment) > 0 ? /** @type {number} */ (d.increment) : ENEMY_SP_PER_SEC);
}

/**
 * The official enemy SP of a skill with an SP cost (enemy_database spData INCREASE_WITH_TIME — 管 0/50 +1/s with 裂管之奏
 * spCost 50, PRTS 「技力 0/50 自动回复 1.0 SP/s」; 弦 0/35 with 断弦之奏 25; 规程's 械 25 / 45), as the official client
 * (maintainer decision 2026-10-07 「공식과 같은 a안」 for showing it, docs/rules/ui.md 「전투 화면 UI」 보스 SP 바):
 * `EnemySkill.CheckAvailable` casts the skill only once its cooldown is over AND the enemy's SP ≥ its spCost (with its
 * mode, its trigger count and, unless `_ignoreSilence`, no silence or stun), and `CastToTarget` spends the cost as the
 * cast begins (`TryReduceSp`). The SP grows every second (`Entity.OnTick` → `SpController.OnTick`) unless the flag
 * SP_RECOVER_STOPPED is on — a stun or a 失衡 does not set it; the enemy's own cast does (enemyCasting): the SP stands
 * still while it casts, so a skill whose cooldown is 0 is ready again its cost in seconds after the cast's END. The
 * client counts whole points (a periodic timer that keeps its part-second while stopped); the sum here reaches the cost
 * at the same moment. `e.mem.lpSp` = [sp, max] feeds the boss SP bar (server/sim/local-hud.js). Null without such data.
 * @param {Unit} e @param {AbSkill | null | undefined} s
 */
function skillSp(e, s) {
  const d = e.def && e.def.raw && e.def.raw.sp;
  if (!s || !(s.sp > 0) || !d || d.type !== 'INCREASE_WITH_TIME') return null;
  const max = Math.max(s.sp, Number(d.maxSp) || 0);
  const st = /** @type {SkillSp} */ ({ sp: Math.min(max, Number(d.initSp) || 0), max, cost: s.sp });
  st.ready = () => st.sp >= st.cost - 1e-9;
  st.spend = (e2) => { st.sp = Math.max(0, st.sp - st.cost); e2.mem.lpSp = [st.sp, max]; };
  st.ab = { tick(b2, e2, a, dt) { st.sp = Math.min(max, st.sp + spGain(b2, e2, d, dt)); e2.mem.lpSp = [st.sp, max]; } };
  return st;
}
/**
 * Runs `fn` at the frame skill `s`'s ability waits for before its spell (content/enemies.js castStrikeAt; docs/rules/sim.md
 * 「적 스킬 = 일반 공격 차례」 효과가 나는 때), as the engine runs an `atStrike` fire: only for the cast of the attack slot
 * (`ab.casting`, onSkillSlot), not at all when that cast is cut, the enemy gone or another cast begun first; its fx name the
 * ability (`b._castAbility`: battle/events.js). For a kit whose cast start has a part of its own (the SP it spends as the
 * cast begins), which therefore cannot say `atStrike`.
 * @param {Battle} b @param {Unit} e @param {AbSkill} s @param {() => void} fn
 */
function atSpell(b, e, s, fn) {
  const run = () => {
    const prev = b._castAbility;
    b._castAbility = { id: e.id, ability: s.name };
    try { fn(); } finally { b._castAbility = prev; }
  };
  const k = e.mem.ab && e.mem.ab.casting;
  // (castStrikeAt's null — a parallel group, a sequence after a projectile — compares as no frame, like 0)
  const at = k && k.a && k.a.name === s.name ? /** @type {number} */ (castStrikeAt(e, s.cast, s.bb)) : 0;
  if (!(at > 1e-9)) { run(); return; }
  // (still this cast: a cut clears `ab.casting` (content/enemies.js onSkillCut); a cast a kit's own attack loop plays
  // (ownAttackTurn without `engineCast`) has no `castLeft` — its time is `until`)
  b.after(at - 1e-9, () => { if (e.alive && e.mem.ab.casting === k && !e.castSwing && b.time <= k.until + 1e-6) run(); }, { owner: e });
}
const EQUIP_KEYS = Object.freeze(['enemy_10028_vtswd', 'enemy_10029_vtshld', 'enemy_10030_vtwand']);
const SWORD_KEY = 'enemy_10028_vtswd', VEST_KEY = 'enemy_10029_vtshld', WAND_KEY = 'enemy_10030_vtwand';
/** The buff an operator holding one of 王权号令's pieces carries, by the piece (one piece per operator). */
/** @type {Readonly<Record<string, string>>} */
export const HELD_BUFF = Object.freeze({ [SWORD_KEY]: 'boss:heldSword', [VEST_KEY]: 'boss:heldVest', [WAND_KEY]: 'boss:heldWand' });
/**
 * 黄金回响 (trap_185_vtlntw, 莫非王土 on a 冲击式施术单元 — data/enemies.json 阿利斯泰尔 `devices[]`): its range `x-1` is the
 * 13 tiles within Manhattan 2 of its tile — the engine's range circle (GOLDEN_RADIUS + the ally collider) with the tile
 * rule on top; its shot projectile_trap_vtlntw (TRACE_TARGET_WITH_SPEED 10).
 */
const GOLDEN_KEY = 'trap_185_vtlntw', GOLDEN_RADIUS = 2, GOLDEN_SHOT = Object.freeze({ key: 'projectile_trap_vtlntw', move: 'TRACE_TARGET_WITH_SPEED', speed: 10 });
/** Its attack clip (token model `Attack` 1.633 s, OnAttack at 0.6 s — tools/assets/local-token-spines.json; prefab Attack `_maxAnimScale` −1). */
const GOLDEN_ANIM = Object.freeze({ clip: 'Attack', dur: 1.633, hit: 0.6, max: -1 });
const SHELL_KEY = 'enemy_9016_acstmr', ECHO_KEY = 'enemy_9023_acdums', PHANTOM_KEY = 'enemy_2017_csphts';

// ---------------------------------------------------------------------------------------------------------------
// per-battle state, template resolution

const STATE = new WeakMap();
/** @param {Battle} b */
function stOf(b) {
  let st = STATE.get(b);
  if (!st) { st = { tpl: undefined, mirrored: new Set() }; STATE.set(b, st); }
  return st;
}

/** @param {unknown} a @param {unknown} b */
const pairEq = (a, b) => Array.isArray(a) && Array.isArray(b) && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** The wave template this battle was built from (or null). @param {Battle} b @returns {Tpl} */
export function templateOf(b) {
  const st = stOf(b);
  if (st.tpl !== undefined) return st.tpl;
  const o = b.opts || {};
  for (const cand of [o.waveTemplate, o.template, o.templateId, o.waveId]) {
    if (!cand) continue;
    const t = typeof cand === 'string' ? b.data.getWave(cand) : cand;
    if (t && typeof t === 'object') { st.tpl = t; return t; }
  }
  let best = null, bestScore = 0;
  const ids = typeof b.data.waveIds === 'function' ? b.data.waveIds() : [];
  for (const id of ids) {
    const w = b.data.getWave(id);
    if (!w || !Array.isArray(w.spawns) || !Array.isArray(w.routes)) continue;
    if (!w.spawns.some((/** @type {WaveSpawn | null} */ s) => s && s.tag === 'boss' && BOSS_KITS[s.key ?? s.enemyKey])) continue;
    if (w.routes.length !== b.routes.length) continue;
    let score = 1;
    if (w.routes.every((/** @type {Record<string, unknown>} */ r, /** @type {number} */ i) => { const n = /** @type {{ start: unknown, end: unknown }} */ (normalizeRoute(r)); const m = b.routes[i]; return m && pairEq(n.start, m.start) && pairEq(n.end, m.end); })) score += 8;
    if (/_s$/.test(id) === (b.players.length <= 1)) score += 1;
    if (score > bestScore) { best = w; bestScore = score; }
  }
  st.tpl = bestScore >= 9 ? best : null;
  return st.tpl;
}

/** Fallback route from a position to the nearest goal. @param {Battle} b @param {number} x @param {number} y @param {string} [motion] */
function toGoal(b, x, y, motion = 'WALK') {
  const ends = b.grid.specialTiles('end');
  let best = ends[0] ?? [Math.round(y), Math.round(x)], bd = Infinity;
  for (const p of ends) { const d = hypot(p[0] - y, p[1] - x); if (d < bd) { bd = d; best = p; } }
  return { motion, start: [y, x], end: best, checkpoints: [] };
}

/** A template's extra route `i` (data/waves.json `extraRoutes`: a spawn's `routeIndex`), or null. @param {Tpl} tpl @param {number} i @returns {WaveRoute | null} */
function extraRoute(tpl, i) {
  return (tpl && tpl.extraRoutes && tpl.extraRoutes[i]) || null;
}

/** The extra route of a template branch's first spawn (or null). @param {Tpl} tpl @param {string} name */
function branchRoute(tpl, name) {
  const br = tpl && tpl.branches && tpl.branches[name];
  const s = Array.isArray(br) && Array.isArray(br[0]) ? br[0][0] : null;
  return s ? extraRoute(tpl, s.routeIndex) : null;
}

/**
 * Spawn one phase of a template branch. Returns the spawned enemies.
 * @param {Battle} b @param {Tpl} tpl @param {string} name @param {number} phaseIdx
 * @param {{ fallback?: (() => Array<Unit | null>) | null, mods?: EnemyMods | null, at?: { x: number, y: number } | null }} [opts]
 * @returns {Unit[]}
 */
function branchSpawn(b, tpl, name, phaseIdx, { fallback = null, mods = null, at = null } = {}) {
  const br = tpl && tpl.branches && tpl.branches[name];
  if (!Array.isArray(br) || !br.length) return fallback ? /** @type {Unit[]} */ (fallback()) : [];
  const phase = br[Math.max(0, Math.min(phaseIdx, br.length - 1))] || [];
  const out = [];
  for (const s of phase) {
    if (!s || (s.action && String(s.action).toUpperCase() !== 'SPAWN')) continue;
    // placeholder slots (NF/N…) of branch spawns: the match may pass the round's replacements as opts.slotKeys
    const key = (s.slot && b.opts && b.opts.slotKeys && b.opts.slotKeys[s.slot]) || s.key || s.enemyKey;
    if (!key || !String(key).startsWith('enemy_')) continue;
    const route = extraRoute(tpl, s.routeIndex);
    for (let i = 0; i < Math.max(1, s.count ?? 1); i++) {
      const u = b.spawnEnemy(key, { route: route || (at ? toGoal(b, at.x, at.y) : undefined), pos: route ? undefined : at ? [at.y, at.x] : undefined, tag: s.tag ?? null, countInTotal: s.unharmful ? false : undefined, mods });
      if (u) out.push(u);
    }
  }
  return out;
}

/**
 * Spawn mods of a leader's mid-fight summon (死亡集群's 妖怪, 刺胄之弹, “裂管之音”/“断弦之音”, 不祥幻影): the round's enemy
 * effects (攻坚装备 / II / III, 补给线 / II, 急行军 — `enemy_attribute_mul` / `enemy_move_speed_mul` on 所有敌人, `enemy_exclude`
 * only 炎佑 and, for 补给线, the 器物) reach a summon like any enemy; only the leader's own HP, the server pool, is exempt
 * ("领袖单位于服务器的生命值加成不受上述加成影响", PRTS 下半). They come as the battle's `flags.enemyScale` (gd.leaderScale of
 * the boss round, set by the match — a BattleSpec flag, so browsers run the same; a custom 规则 match's 敌方领袖 percents
 * reach the summons too, `defMul` / `resMul` included when it sets them); `hpRatio` = the skill's own summon HP ratio
 * (死亡集群 `summon.hp_ratio`), multiplied in. No flags (tests, tools): the ratio alone. Until 0.2.1 the summons took no
 * round effect at all (PR #272). 王权号令's equipment is left out: invulnerable, untargetable, it never fights. So are the
 * tokens 子代 and 黄金回响 (`Trap`, not `Enemy`: the client's enemy runes skip them — spawnBrood, goldenDef).
 * `key` = the summon's enemy key: when the battle's season lists it in its 补给线 effects' `enemy_exclude` (supplyExcluded —
 * 规程 leaves out 刺胄之弹 and “裂管之音”/“断弦之音”, 盟约 does not), the 补给线 share (`supplyHpMul`) comes out of its HP.
 * @param {Battle} b @param {number | null} [hpRatio] @param {string | null} [key]
 */
function summonMods(b, hpRatio = null, key = null) {
  const s = b.flags && b.flags.enemyScale;
  if (!s || typeof s !== 'object') return hpRatio ? { hpMul: hpRatio } : null;
  const supply = Number.isFinite(s.supplyHpMul) && s.supplyHpMul > 0 ? s.supplyHpMul : null;
  const out = supply != null && key != null && supplyExcluded(b, key);
  /** @type {EnemyMods & { supplyHpMul?: number }} */
  const m = { hpMul: (Number.isFinite(s.hpMul) && s.hpMul > 0 ? s.hpMul : 1) * (hpRatio || 1) / (out ? supply : 1), atkMul: s.atkMul, speedMul: s.speedMul };
  if (s.supplyHpMul != null && !out) m.supplyHpMul = s.supplyHpMul;
  if (s.aspdAdd != null) m.aspdAdd = s.aspdAdd;
  if (s.defMul != null) m.defMul = s.defMul;
  if (s.resMul != null) m.resMul = s.resMul;
  return m;
}

/** The 补给线 effects (data/effects.json): their HP-only `enemy_attribute_mul` is the round scale's `supplyHpMul` share. */
const SUPPLY_EFFECTS = Object.freeze(['aceffect_enemy_2', 'aceffect_enemy_2_2']);
/** @type {WeakMap<object, Set<string>>} */
const SUPPLY_EXCLUDED = new WeakMap();
/** Whether the battle's season leaves enemy `key` out of its 补给线 effects (`enemy_exclude`, any of their buffs). @param {Battle} b @param {string} key */
function supplyExcluded(b, key) {
  const scope = effectRecord(SUPPLY_EFFECTS[0], b) ?? effectRecord(SUPPLY_EFFECTS[1], b);
  if (!scope) return false;
  let set = SUPPLY_EXCLUDED.get(scope);
  if (!set) {
    set = new Set();
    for (const id of SUPPLY_EFFECTS) {
      for (const bf of effectRecord(id, b)?.buffs ?? []) {
        const ex = bf && bf.bbStr && bf.bbStr.enemy_exclude;
        if (typeof ex === 'string') for (const k of ex.split('|')) if (k) set.add(k);
      }
    }
    SUPPLY_EXCLUDED.set(scope, set);
  }
  return set.has(key);
}

// ---------------------------------------------------------------------------------------------------------------
// install

/** @param {Battle} battle */
export function install(battle) {
  ensureInstalled(battle);
  battle.on('enemySpawn', ({ enemy }) => onSpawn(battle, enemy), { priority: 90 });
}
export function registerMeta() {}

/** @param {Battle} b @param {Unit} e */
function onSpawn(b, e) {
  const kit = BOSS_KITS[e.defId] ?? DEVICE_KITS[e.defId];
  if (typeof kit !== 'function') return;
  if (SELF_BOUND.includes(e.defId)) b.addBuff(e, { key: 'boss:selfBound', persist: true, flags: { noMove: true, selfBound: true, unblockable: true } });
  const tpl = templateOf(b);
  const ab = abOf(b, e);
  /** @type {AbList} */
  let list = [];
  try { list = kit(ab, e, b, tpl) || []; } catch (err) { b._handlerError('content:bosses', e, err); }
  attach(b, e, list);
  // (a patrol route loops by itself: ai.js patrolNext)
  // mirrored leader for 2 players (boss_battle_multi_player)
  if (e.isBoss || e.tag === 'boss') mirror(b, e, tpl);
}

/** @param {Battle} b @param {Unit} e @param {Tpl} tpl */
function mirror(b, e, tpl) {
  const st = stOf(b);
  const br = tpl && tpl.branches && tpl.branches.boss_battle_multi_player;
  if (!Array.isArray(br) || !br.length || st.mirrored.has(e.defId) || (b.opts && b.opts.bossMirror === false)) return;
  if (b.players.length < 2 || e.mem.mirror) return;
  st.mirrored.add(e.defId);
  for (const s of br[0] || []) {
    const key = s.key ?? s.enemyKey;
    if (key !== e.defId) continue;
    b.after(Math.max(0, (s.time ?? 0) - b.time), () => {
      if (b.aliveEnemies().filter((o) => o.defId === key && o.isBoss).length >= 2) return; // the match already did it
      const route = extraRoute(tpl, s.routeIndex);
      const u = b.spawnEnemy(key, { route: route || undefined, tag: 'boss', mods: e.mods });
      if (u) u.mem.mirror = true;
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// shared bits

/** @param {Unit[]} list */
const opsOnly = (list) => list.filter((u) => u.kind === 'op');
/** @param {Battle} b @param {Unit} e @param {(o: Unit) => unknown} pred */
const nearestOf = (b, e, pred) => {
  let best = null, bd = Infinity;
  for (const o of b.enemies) { if (!o.alive || o === e || !pred(o)) continue; const d = hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; best = o; } }
  return best;
};
/**
 * Apply a floor to an enemy whose data attack speed is 0 (skill-driven leaders: 铳/管/弦): the floor (or the talent
 * stacks in `extra`, whichever is higher) is its attack speed. A round's added attack speed (`aspdAdd`, 规程 co-op 终极's
 * round effects: spawns.js sets `base.aspd` = data + aspdAdd) stays on top, so the buff counts from the data's value,
 * not the whole base — counted from the base, the round's bonus cancelled out (upstream PR #1013's merge fix)
 * [ASSUMED·자료 없음: how the official client scales these skill-driven attacks under a global attack-speed effect].
 * @param {Battle} b @param {Unit} e @param {number} [extra]
 */
function aspdFloor(b, e, extra = 0) {
  const rawAspd = e.def.raw && e.def.raw.stats ? Number(e.def.raw.stats.aspd) : NaN;
  if (!(rawAspd === 0)) return;
  const dataAspd = Number.isFinite(e.def.aspd) ? e.def.aspd : e.base.aspd;
  b.addBuff(e, { key: 'boss:aspd', persist: true, mods: { aspd: Math.max(ASPD_FLOOR, rawAspd + extra) - dataAspd } });
}
/**
 * Engine target priority (blocker → taunt → latest deployed), made fair for two players on one boss field: within the top
 * priority tier the picks alternate between the players' units, starting with the other player each call. Both
 * players deploy at t = 0, so "latest deployed" alone would always single out the second player [ASSUMED fairness
 * rule]. `P.turn` keeps the rotation.
 */
/**
 * The attack's turn of a leader whose kit swings its own normal attack (假想敌：管 / 弦 pipeCore, “萨米的意志” kitDeer — it
 * sets `ab.ownAttack`): offered to its skills first, as the engine does for every armed enemy (the `enemySkillSlot` hook,
 * ai.js enemySkillSlot → enemies.js onSkillSlot; docs/rules/sim.md 「적 스킬 = 일반 공격 차례」 — the client's
 * `Enemy.AttackWrapper.SearchTarget` looks at the skills before the normal attack). A skill cast in its place puts the
 * loop's next attack `atkCd` later (its accumulator `P[acc]` counts up to the attack interval) and not before the cast
 * has played out (`P.castEnd`). True = a skill took the turn. `engineCast`: the cast is the engine's (`castLeft`, as
 * ai.js enemySkillSlot sets it) — it stands, a stun / freeze / 浮空 cuts it (ai.js cutEnemySwing → enemySkillCut) and an
 * open cast ends with its projectile (content/enemies.js projCastOver); the loop then waits on `castLeft`, not `castEnd`.
 * @param {Battle} b @param {Unit} e @param {{ [key: string]: unknown, castEnd: number }} P the kit's state @param {string} acc @param {{ engineCast?: boolean }} [opts]
 */
function ownAttackTurn(b, e, P, acc, { engineCast = false } = {}) {
  if (!b._hooks.enemySkillSlot) return false;
  /** @type {{ enemy: Unit, cast: { dur: number, atkCd?: number } | null }} */
  const c = { enemy: e, cast: null };
  b.emit('enemySkillSlot', c);
  if (!c.cast) return false;
  P[acc] = e.s.interval - (c.cast.atkCd ?? e.s.interval);
  const dur = c.cast.dur > 0 ? c.cast.dur : 0;
  if (engineCast) {
    e.castLeft = dur;
    e.castSwing = false;
    if (dur > 0 && !(e.profile?.attackMoves ?? e.def.attackMoves)) e.atkStandUntil = Math.max(/** @type {number} */ (e.atkStandUntil), b.time + dur);
    P.castEnd = -Infinity;
  } else P.castEnd = b.time + dur;
  return true;
}

/** @param {Battle} b @param {Unit} e @param {Unit[]} list @param {{ turn?: number }} P the kit's state (`turn`: the rotation) @returns {Unit[]} */
export function fairOrder(b, e, list, P) {
  const l = byPriority(e, list);
  if (b.players.length < 2 || l.length < 2) return l;
  const key = (/** @type {Unit} */ u) => `${e.blockedBy === u ? 0 : 1}|${u.s.taunt || 0}`;
  const top = key(l[0]);
  const tier = l.filter((u) => key(u) === top), rest = l.filter((u) => key(u) !== top);
  const ids = b.players.map((p) => p.playerId);
  P.turn = ((P.turn ?? -1) + 1) % ids.length;
  const queues = ids.map((pid) => tier.filter((u) => u.ownerId === pid));
  /** @type {Unit[]} */
  const out = [];
  for (let k = 0; out.length < tier.length && k < tier.length * ids.length + ids.length; k++) {
    const q = queues[(P.turn + k) % ids.length];
    if (q.length) out.push(/** @type {Unit} */ (q.shift()));
  }
  for (const u of tier) if (!out.includes(u)) out.push(u);
  return out.concat(rest);
}

/**
 * Stun + phys DoT on the 3×3 around (r, c), credited to `src` (胄) — the 剑 / 锤 dive blast, a snapshot of the units there
 * (刺胄之弹's lasting zone: shellZone, the same selection). The blast is a flying unit's — `by`: 斩胄之剑 / 破胄之锤 / 刺胄之弹
 * (PRTS 行动方式 飞行) — and its damage 无来源, so 对地规避 does not stop it: `ignoreSelect` (an airborne
 * 起飞 ally in the 3×3 is stunned and hurt like the others, although the credited 胄 walks). It is still that unit's area
 * selection (PRTS: "令自身周围8格内的所有我方单位…" / "…无视迷彩，可对空", no 无视无法选择): areaAlliesInTiles of `by` — no
 * 隐匿 ally, the one blocking it included (GitHub #97; 掷剑 / 掷锤's "无视无法选择" is their pick of the operator they fly at, not the blast).
 * @param {Battle} b @param {Unit} src @param {Unit} by @param {number} r @param {number} c @param {number} stun @param {number} dot @param {number} dur @param {string} kind
 */
function stunBlast(b, src, by, r, c, stun, dot, dur, kind) {
  b.fx('explode', { x: c, y: r, r: 1.5, kind, tiles: 'box' });
  for (const u of areaAlliesInTiles(b, by, r, c, 'box', 1)) {
    if (stun > 0) b.applyStatus(u, 'stun', { duration: stun, source: src, ignoreSelect: true });
    if (dot > 0 && dur > 0) b.addBuff(u, { key: `boss:${kind}Dot`, duration: dur, refresh: 'replace', interval: 1, visible: true,
      onTick: (/** @type {BuffTick} */ { battle, unit }) => battle.dealDamage(src, unit, { amount: dot, type: 'phys', canDodge: false, ignoreSelect: true, tags: ['enemyAbility', kind] }) });
  }
}
/** Distance from point p to segment a–b. @param {number} px @param {number} py @param {number} ax @param {number} ay @param {number} bx @param {number} by */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：胄 (boss_1 / boss_8) + 刺胄之弹 + 斩胄之剑 / 破胄之锤

/** @param {AbState} ab @param {Unit} e @param {Battle} b @param {Tpl} tpl @returns {AbList} */
function kitHelm(ab, e, b, tpl) {
  const s1 = ab.sk['1'], s2 = ab.sk['2'];
  const lowRatio = T(ab, '1.hp_ratio') ?? 0, lowScale = T(ab, '1.damage_scale') ?? 1;
  const P = { low: false };
  const range = () => e.base.rangeRadius || 8;
  // 灭顶之灾 "触发索敌和普通攻击相同：选择攻击范围内攻击力最高的1名我方干员" (PRTS 技能, both copies)
  const shellTargets = (/** @type {Battle} */ b2) => opsOnly(targetsNear(b2, e, range()));
  return [
    {
      spawn(b2, e2, a, ab2) { ab2.atkType = 'arts'; },
      before(c, b2, e2) { const l = targetsNear(b2, e2, range()); if (l.length) c.targets = [b2.rng.pick(l)]; }, // 随机选择目标
      attack(c, b2, e2) { const t = c.targets[0]; if (t) b2.fx('beam', { x: e2.x, y: e2.y, from: e2.id, to: t.id, kind: 'helmRay' }); },
      iv: 0.25,
      tick(b2, e2) {
        if (P.low || !(e2.hpRatio < lowRatio)) return;
        P.low = true;                                     // <20 %: damage taken ×0.5 (no extra shell: see 灭顶之灾)
        b2.addBuff(e2, { key: 'boss:helmGuard', persist: true, visible: true, mods: { physTakenMul: lowScale, artsTakenMul: lowScale } }); // 物理与法术伤害降低
        b2.fx('phase', { x: e2.x, y: e2.y, id: e2.id, kind: 'helmLow' });
      },
    },
    s1 && {
      name: s1.name, cd: s1.cd, icd: s1.icd, atStrike: true, cond: (b2) => shellTargets(b2).length > 0,
      // 【灭顶之灾】 one shell, also below 20 %: the handbook's "额外发射<刺胄之弹>" is wrong in game (PRTS 能力修正 原因 6
      // "描述与游戏实际表现不符合": "【灭顶之灾】不会额外发射") and no blackboard holds a second shell (skill 1 has none)
      fire(b2, e2) {
        const t = shellTargets(b2).sort((p, q) => q.s.atk - p.s.atk || aggroCmp(p, q))[0];
        if (t) fireShell(b2, e2, t, s1.name, s1.proj ? s1.proj.speed : 0);
      },
    },
    s2 && {
      name: s2.name, cd: s2.cd, icd: s2.icd, atStrike: true,
      // 【死亡集群】: a drone on the branch route; when it dies (PRTS 能力修正 "该无人机单位死亡时", whoever kills it) the leader
      // loses hp_ratio × max HP. Drone HP: `summon.hp_ratio` (隐秘核心 only) scales it [ASSUMED: the summon's max HP]; the
      // `max_hp` 0.5 both copies carry is not read [ASSUMED] — no source says what it does (PRTS 技能 lists the 2 % only,
      // the 妖怪 page has no summon rule, the level gives the 妖怪 no override; as an attribute key it would be +50 %).
      fire(b2, e2) {
        const hpMul = s2.bb['summon.hp_ratio'] > 0 ? s2.bb['summon.hp_ratio'] : null;
        const key = s2.bs.enemy_key ?? 'enemy_1005_yokai';
        const drones = branchSpawn(b2, tpl, s2.bs.branch_id ?? 'boss_summon_enemy', 0, {
          mods: summonMods(b2, hpMul, key), at: { x: e2.x, y: e2.y },
          fallback: () => [b2.spawnEnemy(key, { pos: [e2.y, e2.x], route: toGoal(b2, e2.x, e2.y, 'FLY'), mods: summonMods(b2, hpMul, key) })].filter(Boolean),
        });
        b2.fx('summon', { x: e2.x, y: e2.y, id: e2.id, key, n: drones.length });
        const ratio = s2.bb.hp_ratio ?? 0;
        for (const d of drones) attach(b2, d, [{
          death(c, b3) {
            if (c.reason !== 'killed' || !(ratio > 0)) return;                 // a leak is no death
            const boss = e2.alive ? e2 : b3.aliveEnemies().find((o) => o.isBoss && o.defId === e2.defId);
            const by = c.killer && c.killer.side === 'ally' ? c.killer : null;  // credited to the killing operator
            // (silent: acstmk_s_2[to_enemy]'s DamageViaMaxHpRatio on 胄 creates no effect — docs/rules/fx.md 「효과 없는 주기적 유실」)
            if (boss) { b3.loseHp(boss, droneLinkBase(boss) * ratio, { silent: true, source: by, noHitLimit: true }); b3.fx('beam', { x: d.x, y: d.y, from: d.id, to: boss.id, kind: 'droneLink' }); }
          },
        }]);
      },
    },
  ];
}

/**
 * Max HP the 死亡集群 drone link reads (DRONE_LINK_BASE): 'pool' = the leader's shown max HP (the shared pool), 'unit' =
 * the unit's data max HP (template × spawn hpMul).
 * @param {Unit} boss @param {string} [base]
 */
export function droneLinkBase(boss, base = DRONE_LINK_BASE) {
  if (base !== 'unit' || !boss.def || !(boss.def.maxHp > 0)) return boss.s.maxHp;
  const m = boss.mods && Number(boss.mods.hpMul);
  return boss.def.maxHp * (Number.isFinite(m) && m > 0 ? m : 1);
}

/**
 * Launch a 刺胄之弹 from `boss` at `target`'s tile. Official: the boss's skill `skill` fires projectile_enemy_acstmr, which
 * carries the shell enemy (its SummonEnemyBehaviour `_enemyKey`) and plays its `_effectsWhenReached` enemy_acstmr_explode
 * where it arrives. The shell (a BObjectFollowerEnemy) takes the projectile's position every tick, so it flies at the
 * projectile's `speed` (TRACE_TARGET_WITH_SPEED 0.45 tiles/s), not at its own move speed, and no slow touches it. The
 * projectile traces the target's mount point while the target is valid and its last spot after: an operator does not
 * leave its tile, so the target's tile it is.
 * @param {Battle} b @param {Unit} boss @param {Unit} target @param {string} skill @param {number} speed
 */
function fireShell(b, boss, target, skill, speed) {
  const tr = target.tileR, tc = target.tileC;
  const sh = b.spawnEnemy(SHELL_KEY, { pos: [boss.y, boss.x], route: { motion: 'FLY', start: [boss.y, boss.x], end: [tr, tc], steps: [{ t: 'wait', s: 99999 }] }, tag: 'part', countInTotal: false, ownerPlayerId: boss.ownerId, mods: summonMods(b, null, SHELL_KEY) });
  if (!sh) return null;
  sh.mem.ab.shell = { tr, tc, boss, skill, speed: speed > 0 ? speed : 0 };
  b.fx('shell', { x: boss.x, y: boss.y, id: sh.id, aim: target.id, tx: tc, ty: tr, r: 1.5, kind: 'helmShell' });
  return sh;
}

/**
 * 刺胄之弹's arrival (official client: on its death it leaves projectile_enemy_acstmr_s1 — lifetime 9.95 s, range `x-4`
 * = the 3×3 around its tile, `_keepAlreadyHitTime` 1 s): a lasting zone. Every operator in the 3×3 — airborne 起飞 ones
 * too (the shell flies), 迷彩 not checked, no 隐匿 one (areaAlliesInTiles of the shell) — is hit at once and then again
 * every 1 s while it stays (each its own 1 s): `killed.value` 无来源 physical splash damage + `killed.stun` s stun, credited
 * to 胄 as before. Units deployed or moved into it later are hit too. Until 2026-10-14 the units standing there at the
 * arrival took a `killed.duration` (10) s stun and a 10-tick DoT instead (the 剑 / 锤 dive blast — acstma_s_1[reach_target],
 * a snapshot — stays stunBlast).
 */
const SHELL_ZONE_LIFE = 9.95, SHELL_ZONE_REHIT = 1;
/** @param {Battle} b @param {Unit} src @param {Unit} by @param {number} r @param {number} c @param {number} dmg @param {number} stun @param {string} skill */
function shellZone(b, src, by, r, c, dmg, stun, skill) {
  const kind = 'helmShell';
  // the boss's skill names the projectile that carried the shell: the render plays its reach effect (enemy_acstmr_explode)
  b.fx('explode', { x: c, y: r, r: 1.5, kind, tiles: 'box', ...(src !== by && skill ? { id: src.id, ability: skill } : {}) });
  // its talent `killed` names the projectile whose reach effect (enemy_acstmr_explode_range) the render draws for the zone
  b.fx('zone', { x: c, y: r, r: 1.5, dur: SHELL_ZONE_LIFE, kind, tiles: 'box', id: by.id, ability: 'killed' });
  const last = new Map();                                   // unit → time of its last hit (_keepAlreadyHitTime)
  const end = b.time + SHELL_ZONE_LIFE;
  const sweep = () => {
    for (const u of areaAlliesInTiles(b, by, r, c, 'box', 1)) {
      const t = last.get(u);
      if (t != null && b.time - t < SHELL_ZONE_REHIT - 1e-9) continue;
      last.set(u, b.time);
      if (stun > 0) b.applyStatus(u, 'stun', { duration: stun, source: src, ignoreSelect: true });
      if (dmg > 0 && u.alive) b.dealDamage(src, u, { amount: dmg, type: 'phys', canDodge: false, ignoreSelect: true, tags: ['enemyAbility', 'splash', kind] });
    }
  };
  sweep();
  const h = b.every(TICK, () => { if (b.time > end + 1e-9) { h.cancel(); return; } sweep(); });
  return h;
}

/** @param {AbState} ab @param {Unit} e @returns {AbList} */
function kitShell(ab, e) {
  const stun = T(ab, 'killed.stun') ?? 0, dmg = T(ab, 'killed.value') ?? 0;
  return [{
    spawn(b, e2) {
      setHits(e2, e2.base.maxHp); hitCount(b, e2, true);                      // 需要数次攻击击倒 (× the round's HP: summonMods)
      b.addBuff(e2, { key: 'boss:shellGuard', persist: true, flags: { noDisplace: true } }); // 失衡免疫 (PRTS 天赋; also 静态刚体)
    },
    tick(b, e2, a, dt) {
      const s = e2.mem.ab.shell;
      if (!s || a.done) return;
      if (!stepToward(e2, s.tc, s.tr, (s.speed || e2.s.moveSpeed * MOVE_SCALE) * dt)) return;
      a.done = true;                                            // arrival: the lasting 3×3 zone (stun + 无来源 phys every 1 s)
      shellZone(b, s.boss && s.boss.alive ? s.boss : e2, e2, s.tr, s.tc, dmg, stun, s.skill);
      b.kill(e2, null);
    },
  }];
}

/**
 * “斩胄之剑” / “破胄之锤” (PRTS 天赋 + 技能 掷剑 / 掷锤; numbers from skill 1's blackboard).
 *   初始模式 ('hover'): 无敌 + 自缚 [ASSUMED: also untargetable, so operators spend no attacks on it]; AoE physical attack
 *     on every ally in its range (锤 150 % ATK, BLADE_ATK_SCALE).
 *   掷剑 (skill 1 cd / icd, an operator on the field) → 出击模式 ('dive'): no normal attack, vulnerable; blinks to the start
 *     of its `<hand>_blink` route and flies at the tile of the lowest-ATK operator (无视无法选择).
 *   Arriving (no 【瘫痪】): `stun` s stun + `dot_damage`/s for `dot_duration` s on the 3×3 around it, then it is replaced.
 *   Once, after `max_hit_cnt` damage instances: 【瘫痪】 ('down') — `special_stun_duration` s, but it ends with its own
 *     `stun` s stun ("该晕眩结束时也会结束【瘫痪】"): ground unit, damage taken ×`damage_scale`; when it ends, replaced.
 *   Replaced: a new 初始模式 copy with its current HP is summoned on its `<hand>_origin` route (at home without a template),
 *     then it is killed (强制击杀自身; a part: no kill count, no bounty). The copy is a new unit [ASSUMED: only its HP is
 *     inherited] — its 掷剑 starts from the initial cooldown again, so the data's cooldown (80 s) never comes into play.
 *     The copy's mode in the client is Back_End (mode 2): the same passive [unmovable], attack and 掷剑 (cooldowns too) as
 *     the first mode — only its entrance clip (Back_End, facing its default way) and effect differ — so it plays as 初始模式.
 *   Every damage it takes is lost by 假想敌：胄 too (BLADE_TRANSFER = PART_TRANSFER 1, 无来源, credited to the attacker).
 * @param {AbState} ab @param {Unit} e @param {Battle} b @param {Tpl} tpl @returns {AbList}
 */
function kitBlade(ab, e, b, tpl) {
  const s = ab.sk['1'];
  const bb = s ? s.bb : {};
  const hand = BLADE_HAND[e.defId];
  /** @type {{ state: string, home: { x: number, y: number }, hits: number, target: { r: number, c: number } | null }} the kit's state */
  const P = { state: 'hover', home: { x: e.x, y: e.y }, hits: 0, target: null };
  const leader = (/** @type {Battle} */ b2) => nearestOf(b2, e, (o) => o.isBoss && /enemy_9013_acstmk/.test(o.defId));
  const hover = (/** @type {Battle} */ b2, /** @type {boolean} */ on) => {
    // the client's GeneralAbilities passive acstma/acstmb_passive[unmovable] (enemy_acstma_invincible) of its hovering modes
    if (on) b2.addBuff(e, { key: 'boss:hover', persist: true, visible: true, flags: { invulnerable: true, untargetable: true },
      fxTag: 'buff:acstma_passive[unmovable]|acstmb_passive[unmovable]' });
    else b2.removeBuff(e, 'boss:hover');
  };
  const replace = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => { // 以关卡预设路径召唤一个继承自身生命值的初始模式的 copy，随后强制击杀自身
    P.state = 'gone';
    e2.motion = 'FLY';
    const origin = hand ? branchRoute(tpl, `${hand}_origin`) : null;
    const home = [P.home.y, P.home.x];
    const n = b2.spawnEnemy(e2.defId, {
      route: origin || { motion: 'FLY', start: home, end: home, steps: [{ t: 'wait', s: 99999 }] }, pos: origin ? undefined : home,
      tag: e2.tag, countInTotal: false, mods: e2.mods, ownerPlayerId: e2.ownerId,
    });
    if (n) {
      n.hp = Math.min(n.s.maxHp, e2.hp);
      b2.fx('blink', { x: n.x, y: n.y, id: n.id, fx: e2.x, fy: e2.y });
      // its [copy_health] switches it to Back_End (mode 2), whose passive [unmovable] sounds as it attaches; (2026-11-14) the
      // view draws that mode (form 'backEnd': its entrance clip Back_End and BornAnim effect, render/units.js FORMS) — the
      // same moves and timing as the first mode (e.form only names the clip set)
      setForm(b2, n, 'backEnd', 'kitHit', { k: n.defId === 'enemy_9015_acstmb' ? 'acstmb:back' : 'acstma:back' });
    }
    b2.kill(e2, null);
  };
  const shotDown = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => { // 【瘫痪】
    P.state = 'down';
    e2.motion = 'WALK';                                              // 变为地面单位（不改变寻路方式）
    const stun = bb.stun ?? 0;
    b2.applyStatus(e2, 'stun', { duration: stun, source: null, force: true });
    b2.addBuff(e2, { key: 'boss:downed', duration: Math.min(bb.special_stun_duration ?? stun, stun), visible: true,
      mods: { dmgTakenMul: bb.damage_scale ?? 1 }, onExpire: () => { if (e2.alive && P.state === 'down') replace(b2, e2); } });
    b2.fx('phase', { x: e2.x, y: e2.y, id: e2.id, kind: 'shotDown' });
  };
  return [
    {
      spawn(b2, e2) {
        hover(b2, true);
        // 自缚 (moved by hand) · 不可阻挡 · 失衡免疫 (PRTS 天赋 "{{特殊机制|静态刚体}}，不可阻挡、失衡免疫…" — data `staticBody` too)
        b2.addBuff(e2, { key: 'boss:anchor', persist: true, flags: { noMove: true, selfBound: true, unblockable: true, noDisplace: true } });
        if (BLADE_ATK_SCALE[e2.defId]) /** @type {AttackProfile} */ (e2.profile).atkScale = BLADE_ATK_SCALE[e2.defId];
        /** @type {AttackProfile} */ (e2.profile).canTarget = (/** @type {Unit} */ u) => !u.isFlying;   // "…不可对空" (below)
      },
      // 范围物理伤害 — "普通攻击对攻击范围内的所有我方单位造成…物理普通伤害，不可对空": a normal attack on every operator it can target
      // (canTargetAlly: no 隐匿 or 迷彩 one — it is never blocked —, PRTS 选择器: a normal attack does not ignore 迷彩; until
      // 0.1.2 it took them all, `ranged: false`), never a flying ally (the 炎佑 dragon — until 0.2.1 it was hit)
      before(c, b2, e2) { const l = targetsNear(b2, e2, e2.base.rangeRadius || 1.6).filter((/** @type {Unit} */ u) => !u.isFlying); if (l.length) c.targets = l; },
      taken(c, b2, e2) {
        if (c.amount > 0) { // 受到伤害时令假想敌：胄受到等量的无来源生命流失 (【瘫痪】; 出击模式 [ASSUMED], see PART_TRANSFER)
          const L = leader(b2);
          const src = c.source || c.credit;                                    // a 无来源 burst still passes on (credited)
          // (silent: acstma_hp_trans's FixedValueDamage creates no effect — docs/rules/fx.md 「효과 없는 주기적 유실」)
          if (L) b2.loseHp(L, c.amount * BLADE_TRANSFER, { silent: true, source: src && src.side === 'ally' ? src : null, from: c.dmg, sourceless: true });
        }
        if (P.state === 'dive' && e2.alive && ++P.hits >= (bb.max_hit_cnt ?? Infinity)) shotDown(b2, e2); // 仅1次
      },
      tick(b2, e2, a, dt) {
        if (P.state !== 'dive' || !canCast(e2, false, b2)) return;                         // a stunned blade does not fly on
        const t = /** @type {{ r: number, c: number }} */ (P.target);   // (set as it dives)
        if (!stepToward(e2, t.c, t.r, e2.s.moveSpeed * MOVE_SCALE * dt)) return;
        // arrival: 3×3 stun + DoT (无来源: credited to 胄, as the shell's), then the 初始模式 copy takes over
        stunBlast(b2, leader(b2) || e2, e2, t.r, t.c, bb.stun ?? 0, bb.dot_damage ?? 0, bb.dot_duration ?? 0, 'bladeDive');
        replace(b2, e2);
      },
    },
    s && {
      name: s.name, cd: s.cd, icd: s.icd, atStrike: true, cond: (b2) => P.state === 'hover' && opsOnly(allTargets(b2, e)).length > 0, // 存在至少1名可选我方干员
      fire(b2, e2) { // 【掷剑】/【掷锤】 → 出击模式
        const t = opsOnly(b2.allies()).sort((p, q) => p.s.atk - q.s.atk || aggroCmp(p, q))[0];
        if (!t) return;
        P.state = 'dive'; P.hits = 0; P.target = { r: t.tileR, c: t.tileC };
        hover(b2, false);
        b2.addBuff(e2, { key: 'boss:sortie', persist: true, flags: { disarm: true } }); // 出击模式：不进行普通攻击
        const blink = hand ? branchRoute(tpl, `${hand}_blink`) : null;
        if (blink && Array.isArray(blink.start)) {
          const from = { x: e2.x, y: e2.y };
          e2.x = blink.start[1]; e2.y = blink.start[0];
          b2.fx('blink', { x: e2.x, y: e2.y, id: e2.id, fx: from.x, fy: from.y });
        }
        b2.fx('charge', { x: e2.x, y: e2.y, id: e2.id, tx: t.tileC, ty: t.tileR, kind: 'bladeDive' });
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：铳 (boss_2 / boss_9) + 碎铳之簧

/** @param {Unit} o */
const isGun = (o) => /enemy_9017_achunt/.test(o.defId);
/** @param {Unit} o */
const isSpring = (o) => /enemy_90(18|19|20)_actrp/.test(o.defId);
/**
 * The one living enemy a `BossSelector` (`_postFilter` HATRED_DES, max 1) picks among those `pred` accepts. An enemy's hatred
 * is its taunt level × k − its remaining distance to the exit (client Enemy.get_hatred): with equal taunt the one nearest
 * its EXIT; ties go to the earlier spawn.
 * @param {Battle} b @param {(o: Unit) => unknown} pred
 */
function hatredFirst(b, pred) {
  const key = (/** @type {Unit} */ o) => [-(o.s.taunt || 0), b.remainingDistance(o), o.spawnSeq];
  let best = null, bk = null;
  for (const o of b.enemies) {
    if (!o.alive || !pred(o)) continue;
    const k = key(o);
    if (!bk || (k[0] - bk[0] || k[1] - bk[1] || k[2] - bk[2]) < 0) { best = o; bk = k; }
  }
  return best;
}

/** @param {AbState} ab @param {Unit} e @param {Battle} b @returns {AbList} */
function kitGun(ab, e, b) {
  const hidden = /_2$/.test(e.defId);
  const step = T(ab, '2.attack_speed') ?? 0, maxN = T(ab, '2.max_stack_cnt') ?? 0;
  /** A charge (技能 3): its traced unit, the spot it runs for, its end, the next search, the units it hit. @typedef {{ target: Unit | null, tx: number, ty: number, until: number, next: number, hit: Set<Unit> }} GunCharge */
  /** @type {{ last: Unit | null, n: number, charge: GunCharge | null }} the kit's state */
  const P = { last: null, n: 0, charge: null };
  const range = () => e.base.rangeRadius || 2;
  const setAspd = (/** @type {Battle} */ b2) => aspdFloor(b2, e, step * P.n);
  const s1 = ab.sk['1'], s2 = ab.sk['2'], s3 = ab.sk['3'];
  const groundTargets = (/** @type {Battle} */ b2) => allTargets(b2, e).filter((/** @type {Unit} */ u) => u.ground);
  // 无法被阻挡: the default season's table has it as a line of its own and its prefab keeps BLOCK_FREE in a buff of
  // CommonAbilities/Ability0 (always). 规程's table (2.7.91) moves it into 【最终之罚】 (「技能持续期间，无法被阻挡」) and its
  // prefab into the passive buff achunt_s_1[speed] of Modes/S1 (abnormal flag BLOCK_FREE, the charge's duration), while
  // Modes/Default gains a `_combat` ability (the same shot, `_alwaysIncludeTarget`, one target): blocked, the gun shoots
  // its blocker (official CN client prefab enemy_9017_achunt)
  const alwaysFree = (e.def?.abilities ?? []).some((/** @type {{ text?: string } | null} */ a) => a && a.text === '无法被阻挡');
  const endCharge = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => { // achunt_s_1[reached] / achunt_s_1[speed]'s end: SwitchMode back to Default
    P.charge = null;
    e2.trace = null;
    b2.removeBuff(e2, 'boss:charge');
    if (e2.route) e2.route.pts = null;
    enemyMode(b2, e2, null);   // (its Default attack attaches ready)
    setForm(b2, e2, null, 'chargeEnd');
  };
  // _TryUpdateTraceTargetRoute: the target's tile when the gun's path reaches it, else (`_findNearbyReachableTile`) the
  // reachable neighbour of the shortest path ([ASSUMED] ties in TRACE_NEAR order); a new route draws a new offset
  const retrace = (/** @type {Battle} */ b2, /** @type {Unit} */ e2, /** @type {Unit} */ t) => {
    const g = b2.grid, sr = Math.round(e2.y), sc = Math.round(e2.x), k = sr * COLS + sc;
    const tr = Math.round(t.y), tc = Math.round(t.x);
    const len = (/** @type {number} */ r, /** @type {number} */ c) => (g.walkable(r, c) ? g.fieldLength(g.flowField(r, c), k) : Infinity);
    let best = len(tr, tc) < Infinity ? [tr, tc] : null;
    if (!best) {
      let bl = Infinity;
      for (const [dr, dc] of TRACE_NEAR) { const l = len(tr + dr, tc + dc); if (l < bl) { bl = l; best = [tr + dr, tc + dc]; } }
    }
    if (!best) return false;
    e2.trace = { r: best[0], c: best[1], ox: b2.rng.range(-TRACE_OFFSET, TRACE_OFFSET), oy: b2.rng.range(-TRACE_OFFSET, TRACE_OFFSET) };
    /** @type {GunCharge} */ (P.charge).target = t;
    /** @type {GunCharge} */ (P.charge).tx = t.x; /** @type {GunCharge} */ (P.charge).ty = t.y;
    return true;
  };
  const clearTrace = (/** @type {Unit} */ e2) => { e2.trace = null; /** @type {GunCharge} */ (P.charge).target = null; if (e2.route) e2.route.pts = null; }; // _CleanTraceTarget
  /** @type {AbList} the abilities (plain objects, content/enemies.js header) */
  const list = [
    {
      spawn(b2, e2) { if (alwaysFree) b2.addBuff(e2, { key: 'boss:unblockable', persist: true, flags: { unblockable: true } }); setAspd(b2); },
      before(c, b2, e2) {
        const bl = e2.blockedBy;
        if (!alwaysFree && bl && bl.alive && bl.deployed) { c.targets = [bl]; return; } // 规程: Default `_combat` — the blocker
        const l = targetsNear(b2, e2, range()); if (l.length) c.targets = [l.sort((/** @type {Unit} */ p, /** @type {Unit} */ q) => q.s.def - p.s.def || aggroCmp(p, q))[0]]; // 优先攻击防御力最高的单位
      },
      // ASPD stacks (official client BrownbTalent_1.Apply, an attachment of the attack ability: as the attack is cast on
      // its target): a target other than the last one clears the stack group, then the attack ALWAYS adds one stack
      // (+`2.attack_speed`, at most `2.max_stack_cnt`) — the first attack on a new target already leaves 1 stack (until
      // 2026-10-14 it left 0: the floor 20, a 22.5 s wait). The client re-times the running cooldown when ASPD changes
      // keeping its progress ratio (OnAttackTimeChanged, docs/rules/sim.md 「일반 공격 타이밍」): the interval becomes
      // t + (1 − t/T_old)·T_new, t the time since the swing began (until 2026-10-15 the cooldown re-ran from the swing's
      // start at the new ASPD — the same only at t = 0)
      attack(c, b2) {
        const t = c.targets[0];
        if (t !== P.last) { P.last = t; P.n = 0; }
        P.n = Math.min(maxN, P.n + 1);
        setAspd(b2);   // (the engine re-times the running cooldown: units.js _recalc)
      },
      dealt(c, b2, e2) { elem(b2, e2, c.target, 'erosion', e2.s.atk * (T(ab, '1.ep_damage_ratio') ?? 0)); }, // 攻击时附带侵蚀损伤
      // 【最终之罚】 (client prefab Modes/S1 + its TraceEnemy, SimpleTraceTargetAbility.OnTick): the gun walks through the
      // engine (ai.js updateEnemy, `e.trace`) — its speed is the mode's achunt_s_1[speed] (MOVE_SPEED ADDITION
      // +`3.move_speed`, before the multipliers: slows and 停顿 slow the whole charge, 束缚 / 失衡 hold it); every
      // TRACE_SEARCH it re-routes after a target that moved (_UpdateTraceTarget) and checks the reached distance
      // (_CheckReached). A target gone from the field clears the trace only: the mode stays until the speed buff ends,
      // the gun walking its route at the charge speed without attacking (until 2026-10-18 the gun slid in a straight line
      // to where the target had stood at the cast, ignoring every multiplier on the +2 and any 束缚)
      tick(b2, e2) {
        const ch = P.charge;
        if (!ch) return;
        if (b2.time >= ch.until - 1e-9 || !e2.findBuff('boss:charge')) { endCharge(b2, e2); return; }
        // Talents/3 of the mode: "对进入自身0.35半径范围内的我方单位（包括飞行单位）造成一次…" — an area selection (areaAllies)
        let n = 0;
        for (const u of areaAllies(b2, e2, e2.x, e2.y, CHARGE_RADIUS)) if (!ch.hit.has(u)) { ch.hit.add(u); hurt(b2, e2, u, e2.s.atk * (T(ab, '3.atk_scale') ?? 1), 'phys'); n++; }
        // each unit's achunt_s_1[damage] (audioSignal …hit_target) — a sound only (docs/rules/audio.md 「적 버프·커스텀 트리거 소리」)
        if (n) b2.fx('kitHit', { x: e2.x, y: e2.y, id: e2.id, k: 'achunt:charge', n });
        if (b2.time < ch.next - 1e-9) return;
        ch.next += TRACE_SEARCH;
        const t = ch.target;
        if (t) {
          if (!t.alive || !t.deployed) clearTrace(e2);
          else if ((t.x - ch.tx) * (t.x - ch.tx) + (t.y - ch.ty) * (t.y - ch.ty) > TRACE_MOVE_SQR && !retrace(b2, e2, t)) clearTrace(e2);
        }
        if (e2.trace && hypot(e2.x - e2.trace.c, e2.y - e2.trace.r) <= TRACE_REACHED) endCharge(b2, e2);
      },
    },
    s1 && {
      // Skills/1's selector: any unit of ours (`_targetMotion` 3, flyers too), `_minTargetNum` 1
      name: s1.name, cd: s1.cd, icd: s1.icd, atStrike: true, cond: (/** @type {Battle} */ b2) => allTargets(b2, e).length > 0 && !P.charge,
      fire(b2, e2) {
        // achunt_s_1: SwitchMode S1, then TriggerAbilityUseSelector TraceEnemy — the highest-DEF unit on low ground, no
        // flyer (`_targetMotion` 1, `heightType` 0, `_postFilter` DEF_DES); nobody (only flyers) → back to Default at once
        const t = groundTargets(b2).sort((/** @type {Unit} */ p, /** @type {Unit} */ q) => q.s.def - p.s.def || aggroCmp(p, q))[0];
        if (!t) return;
        const dur = T(ab, '3.duration') ?? 0;
        b2._cutAttackStand(e2); e2.atkStandUntil = -Infinity;   // the mode switch's `_restartFSM`: out of its attack recovery
        enemyMode(b2, e2, 'S1');   // the charge mode has no attack ability
        P.charge = { target: null, tx: t.x, ty: t.y, until: b2.time + dur, next: b2.time + TRACE_SEARCH, hit: new Set() };
        b2.addBuff(e2, { key: 'boss:charge', duration: dur, visible: true, mods: { moveFlat: T(ab, '3.move_speed') ?? 0 }, flags: alwaysFree ? { disarm: true } : { disarm: true, unblockable: true } });
        // OnCastOnTarget: no route to the target nor to a tile beside it → no trace (the mode and its speed stay)
        if (!retrace(b2, e2, t)) clearTrace(e2);
        setForm(b2, e2, 'charge', 'charge', { tx: t.x, ty: t.y, kind: 'finalPenance' });
      },
    },
  ];
  if (hidden) {
    // 【未尽的告解】 (official client, the shared 铳 prefab): `achunt_passive` triggers ONCE, CONFESSION_PICK after the gun
    // appears — its BossSelector (own side, buff `achunt_mark`: another 铳 or a “碎铳之簧”, HATRED_DES, max 1, itself
    // excluded) picks one unit and gives it `achunt_mark_by_boss`, whose start gives the gun `achunt_summonee` as a buff
    // DERIVED from that mark (Buff.AddDerivedBuffSafe; the parent's OnFinish → ClearDerivedBuffsIfNot finishes it). So the
    // reduction (`achunt_take_damage`, Talents/4: phys and arts × `4.damage_scale` while the gun holds `achunt_summonee`) ends
    // for good when the picked unit leaves the field; nothing on the field then → never; no second pick. Until 2026-10-17 it
    // held while ANY other gun or spring lived (PRTS wording). Refresh on hit as well so a hit right after the picked unit
    // dies sees it gone, not a stale polling result. Its ON_OWNER_KILLED (kill_achunt_mark_boss: InstantKill of the
    // selector's pick) is left out: a gun only dies when the shared pool runs out, which ends every boss field.
    /** @type {Unit | null} */
    let partner = null;
    const confession = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => {
      if (partner && partner.alive) {
        const m = T(ab, '4.damage_scale') ?? 1;
        b2.addBuff(e2, { key: 'boss:confession', duration: 0.35, refresh: 'replace', mods: { physTakenMul: m, artsTakenMul: m } });
      } else {
        partner = null;
        b2.removeBuff(e2, 'boss:confession');
      }
    };
    list.push({
      spawn(b2, e2) {
        b2.after(CONFESSION_PICK, () => {
          if (!e2.alive) return;
          partner = hatredFirst(b2, (o) => o !== e2 && (isGun(o) || isSpring(o)));
          e2.mem.confessionPartner = partner ? partner.id : null;
          confession(b2, e2);
        }, { owner: e2 });
      },
      iv: 0.25, tick: confession, hitIn(c, /** @type {Battle} */ b2, /** @type {Unit} */ e2) { confession(b2, e2); },
    });
    if (s3) list.push({
      iv: s3.bb.interval ?? 1,
      tick(b2, e2) { // 【盲信之誓】 links: phys per second on operators standing on a line ("无视无法选择、迷彩": 起飞 too)
        for (const sp of b2.enemies) {
          if (!sp.alive || !isSpring(sp)) continue;
          const on = b2.allies().filter((u) => segDist(u.x, u.y, e2.x, e2.y, sp.x, sp.y) <= LINK_WIDTH);
          // `n`: the units on it — achunt_line_damage's chain_hit on each (audio)
          b2.fx('link', { x: e2.x, y: e2.y, from: e2.id, to: sp.id, kind: 'faithLink', dur: s3.bb.interval ?? 1, n: on.length });
          for (const u of on) hurt(b2, e2, u, s3.bb.value ?? 0, 'phys', { ignoreSelect: true, tags: ['faithLink'] });
        }
      },
    });
    if (s2) list.push({
      name: s2.name, cd: s2.cd, icd: s2.icd, cond: (/** @type {Battle} */ b2) => b2.enemies.some((o) => o.alive && isSpring(o)),
      fire(b2, e2) { // 【末日布道】 springs chase 铳 for the whole 5 s gain, invulnerable, trampling operators (kitSpring)
        // PRTS “碎铳之簧” 追逐模式 "不进行普通攻击": `disarm` for the dash (until 0.1.3 it kept shooting while it ran).
        // Each gun casts on its own data timer, and a cast takes every spring — on a pair field the later of the two
        // calls retargets them all to its gun (handbook 「持续召唤场上所有“碎铳之簧”向自身移动」; no stagger, no lock while
        // a chase runs: PR #347's pair coordination is not taken, the data has neither)
        for (const sp of b2.enemies) {
          if (!sp.alive || !isSpring(sp) || !sp.mem.ab) continue;
          sp.mem.ab.dash = { until: b2.time + (s2.bb.dog_duration ?? 0), mul: 1 + (s2.bb.move_speed ?? 0), gun: e2, hit: new Set() };
          // the client's MoveToHunter mode: its Ability0 buff achunt_dog_silence (IMMEDIATELY — the render flashes its effect once)
          enemyMode(b2, sp, 'MoveToHunter');   // (no attack ability; achunt_dog_move SwitchMode 1, 0 as it ends)
          b2.addBuff(sp, { key: 'boss:dash', duration: s2.bb.dog_duration ?? 0, visible: true, flags: { invulnerable: true, noMove: true, unblockable: true, disarm: true },
            fxTag: 'buff:achunt_dog_silence' });
          b2.fx('dash', { x: sp.x, y: sp.y, id: sp.id, tx: e2.x, ty: e2.y });
        }
      },
    });
  }
  return list;
}

/** @param {AbState} ab @param {Unit} e @returns {AbList} */
function kitSpring(ab, e) {
  const kind = /9018/.test(e.defId) ? 'arts' : /9019/.test(e.defId) ? 'element' : 'hits';
  const scale = T(ab, '1.damage_scale') ?? 1, regen = T(ab, '1.regenerate_duration') ?? 0;
  const sk = kind === 'arts' ? null : ab.sk['1'];
  /** @type {{ up: boolean, barrier: number, hits: number, downAt: number | null, sp: number, skill: boolean }} the kit's state */
  const P = { up: false, barrier: 0, hits: 0, downAt: null, sp: 0, skill: false };
  // 【盲信之誓】 the share's receiver: the prefab's BossSelector (one 假想敌：铳, HATRED_DES — hatredFirst): with equal taunt
  // the gun nearest its EXIT (until 2026-10-15 the gun nearest the spring; the 隐秘核心 pair field has two, branch
  // boss_battle_multi_player)
  const gun = (/** @type {Battle} */ b) => hatredFirst(b, isGun);
  // the 追逐模式 fallback when its casting gun is gone: the nearest other gun (the remake's own rule)
  const nearGun = (/** @type {Battle} */ b) => nearestOf(b, e, (o) => isGun(o));
  const range = () => e.base.rangeRadius || 2;
  // 优先攻击防御力最高的单位: the Attack and Skills/1 selectors are `_postFilter` DEF_DES (ties: aggro order)
  const byDef = (/** @type {Unit[]} */ l) => l.sort((p, q) => q.s.def - p.s.def || aggroCmp(p, q))[0];
  const raise = (/** @type {Battle} */ b) => {
    P.up = true;
    P.sp = 0;   // actrpb/c_t_1[regenerate] ends with ClearEnemySp, then the shield
    if (kind === 'arts') P.barrier = e.s.maxHp * (T(ab, '1.shield_ratio') ?? 0);
    if (kind === 'hits') P.hits = T(ab, '1.block_damage_max_times') ?? 0;
    // its client shield buff actrpa/b/c_t_1 (Talents/1; [regenerate]'s end creates it again): enemy_actrpX_shield
    b.addBuff(e, { key: 'boss:springShield', persist: true, visible: true, fxTag: `buff:${(/_(actrp[abc])/.exec(e.defId) || [])[1] || 'actrpa'}_t_1` });
    b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: `spring_${kind}` });
  };
  const drop = (/** @type {Battle} */ b) => { P.up = false; P.downAt = b.time; b.removeBuff(e, 'boss:springShield'); b.fx('shieldBreak', { x: e.x, y: e.y, id: e.id }); };
  /** 【盲信之誓】: the gun loses `c.amount` (taken / healed / gauge below), credited to the ally that caused it. */
  const pass = (/** @type {Battle} */ b, /** @type {{ amount: number, source: Unit | null, credit?: Unit | null, dmg?: Record<string, unknown> | null }} */ c) => {
    if (!(c.amount > 0)) return;
    const s0 = c.source || c.credit;                                       // a 无来源 burst still passes on (credited)
    const src = s0 && s0.side === 'ally' ? s0 : null;
    const g = gun(b);
    // (silent: actrpa_hp_trans's FixedValueDamage creates no effect — docs/rules/fx.md 「효과 없는 주기적 유실」)
    if (g) b.loseHp(g, c.amount * PART_TRANSFER, { silent: true, source: src, from: c.dmg, sourceless: true });
  };
  // the shield's skill (enemy_database spData INCREASE_WHEN_ATTACK: +1 per normal attack, max = spCost): with full SP the
  // next attack IS the skill — no normal hit (until 2026-10-15 it was added on top of every (spCost+1)-th attack). It needs
  // the shield: the broken shield's regenerate buff silences the spring and clears its SP as the shield returns (raise)
  const skillReady = (/** @type {Unit} */ e2) => !!sk && P.up && P.sp >= sk.sp && !e2.s.flags.silence;
  const elementBullet = (/** @type {Battle} */ b, /** @type {Unit} */ e2, /** @type {Unit} */ t0) => { // `times` hits, ATK 100 % phys × 0.8 per bounce + erosion `ep_damage_ratio` each
    const times = /** @type {AbSkill} */ (sk).bb.times || 1, ratio = /** @type {AbSkill} */ (sk).bb.ep_damage_ratio || 0;
    // the bounces fly at SPRING_BOUNCE_SPEED; without a projectile every hit lands at once, as the first one
    const proj = /** @type {AbSkill} */ (sk).proj, bounce = proj && { ...proj, speed: SPRING_BOUNCE_SPEED };
    const lastHit = new Map();
    const fly = (/** @type {Unit} */ from, /** @type {Unit | null} */ t, /** @type {number} */ k) => {
      if (!t || k >= times) return;
      b.fx('beam', { x: from.x, y: from.y, from: from.id, to: t.id, kind: 'springBullet' });
      shoot(b, from, t, k ? bounce : proj, (/** @type {Unit} */ tt) => {
        if (!tt || !tt.alive) return;
        lastHit.set(tt, b.time);
        hurt(b, e2, tt, e2.s.atk * powi(SPRING_BOUNCE_FALLOFF, k), 'phys', { tags: ['springBullet'] });
        elem(b, e2, tt, 'erosion', e2.s.atk * ratio);
        // the next one: the selector's `_postFilter` ALL (no sort) and at most 1 — the first candidate of the range query
        // (until 2026-10-15 the nearest). [ASSUMED] the query's order = the field's ally order (areaAllies); nobody
        // else → the same target again
        const nx = areaAllies(b, e2, tt.x, tt.y, SPRING_BOUNCE_RANGE).find((/** @type {Unit} */ u) => u !== tt && !(b.time - (lastHit.get(u) ?? -Infinity) < SPRING_BOUNCE_KEEP)) || (tt.alive ? tt : null);
        fly(tt, nx, k + 1);
      }, { source: e2 });
    };
    fly(e2, t0, 0);
  };
  const tenHits = (/** @type {Battle} */ b, /** @type {Unit} */ e2, /** @type {Unit} */ t) => { // 十连击: ten shots, ATK × `atk_scale` phys each, at the attack's highest-DEF target
    // the target stays the first shot's (Skills/1 `_selectTargetSource` INPUT_TARGET, `_selectTargetTiming` AT_BEGINING,
    // MultiRangedAttack.UpdateTargets): once it is dead the shots left are lost (until 2026-10-15 they re-picked)
    const shot = () => {
      if (!e2.alive || !t.alive) return;
      b.fx('beam', { x: e2.x, y: e2.y, from: e2.id, to: t.id, kind: 'springCombo' });
      shoot(b, e2, t, /** @type {AbSkill} */ (sk).proj, (/** @type {Unit} */ tt) => hurt(b, e2, tt, e2.s.atk * (/** @type {AbSkill} */ (sk).bb.atk_scale || 0), 'phys', { tags: ['springCombo'] }), { source: e2 });
    };
    for (let k = 0; k < SPRING_COMBO_HITS; k++) if (k === 0) shot(); else b.after(k * SPRING_COMBO_GAP, shot, { owner: e2 });
  };
  return [
    {
      // BLOCK_FREE for good (CommonAbilities/Ability0 `actrp*_passive`: abnormalFlags [3]) — until 2026-10-15 only while shielded
      spawn(b) { b.addBuff(e, { key: 'boss:unblockable', persist: true, flags: { unblockable: true } }); raise(b); },
      before(c, b, e2) {
        const t = byDef(targetsNear(b, e2, range()));
        if (t) c.targets = [t];
        // the skill attack: the engine makes the attack (cooldown, 'atk', the 'attack' hook) without its hit (ai.js deferHit)
        P.skill = skillReady(e2);
        /** @type {AttackProfile} */ (e2.profile).deferHit = P.skill;
        /** @type {AttackProfile} */ (e2.profile).shot = P.skill ? 'springSkill' : undefined;
      },
      attack(c, b, e2, a) {
        if (!P.skill) { if (sk) P.sp = Math.min(sk.sp, P.sp + 1); return; }
        P.skill = false;
        /** @type {AttackProfile} */ (e2.profile).deferHit = false;
        /** @type {AttackProfile} */ (e2.profile).shot = undefined;
        P.sp = 0;
        const t0 = c.targets.find((/** @type {Unit | null} */ u) => u && u.alive);
        if (!t0) return;
        // the cast names the official ability (Skills/1 — Skill_b / Skill_c, its effects; content/enemies.js onTick)
        a.casts = (a.casts ?? 0) + 1;
        e2.skillAnimUntil = b.time + 0.5;
        b.fx('enemySkill', { x: e2.x, y: e2.y, id: e2.id, ability: /** @type {AbSkill} */ (sk).name, n: a.casts });
        const prev = b._castAbility;
        b._castAbility = { id: e2.id, ability: /** @type {AbSkill} */ (sk).name };
        try { if (kind === 'element') elementBullet(b, e2, t0); else tenHits(b, e2, t0); } finally { b._castAbility = prev; }
      },
      hitIn(c, b, e2) {
        if (!P.up) return;
        const ty = c.dmg.type;
        if (kind === 'arts') {                           // 法术屏障: absorbs arts (after RES, like a shield); phys ×0.1 + counter
          if (ty === 'arts') {
            P.barrier -= absorbArts(c, P.barrier);
            if (P.barrier <= 1e-6) { P.barrier = 0; drop(b); }
          } else if (ty === 'phys' && isNormalDamage(c.dmg)) {
            // actrpa_t_1 ON_TAKE_DAMAGE filters SourceAttackType NORMAL + PHYSICAL — the FilterDamageModifer the bonds'
            // 普通伤害 use (damage.js isNormalDamage): attacks and skill hits alike (the skill prefabs' damage nodes are
            // NORMAL by default); a splash, an addition, a status tick or sourceless damage passes in full, without a counter
            c.dmg.mul *= scale;
            // the counter "对来源造成…无来源物理附加伤害" picks its attacker directly — no selection, so an airborne 起飞
            // attacker takes it too (PRTS 异常效果 无法选择: "'直接选中'的能力…不受这些仅在选择时生效的异常效果制约")
            // actrpa_t_1 runs the counter as one action list: the physical hit (`_ignoreMissFlag` / `_ignoreCancelReasonMask`
            // NONE: it can be dodged or blocked), then its effect, sound and erosion. A node runs only when the one before it
            // succeeded (ActionNode PREVIOUS_SUCCEED) and the damage node fails when its modifier is cancelled — so a dodged,
            // blocked or fully absorbed counter brings no erosion (official client; upstream 0.3.2 reached the same).
            // The physical hit is 无来源 (`AdvancedApplyDamage` `_noSource`, `_attackType` ADDITION), the erosion is not
            // (`ApplyElementDamage` `_noSource` false)
            const s = c.source, o = { ignoreSelect: true, tags: ['springCounter'] };
            if (s && s.side === 'ally' && s.alive && hurt(b, e2, s, e2.s.atk * (T(ab, '1.atk_scale') ?? 0), 'phys', { ...o, canDodge: true, sourceless: true }) > 0) {
              b.fx('kitHit', { x: s.x, y: s.y, id: e2.id, k: 'actrpa:shieldhit' });   // its PlayAudio on the attacker (audio)
              elem(b, e2, s, 'erosion', e2.s.atk * (T(ab, '1.ep_damage_ratio') ?? 0), o);
            }
          }
        } else if (kind === 'element') {                 // 元素护盾: phys/arts heavily reduced
          if (ty === 'phys' || ty === 'arts') c.dmg.mul *= scale;
        } else { // 频次护盾: negates N hits of ANY damage — actrpc_t_1's BlockDamage has `_filterDamageType` false, so its
          // PHYSICAL_AND_MAGICAL mask is never read (BlockDamage.Execute: any isDamage modifier): 元素伤害 too (until
          // 2026-10-17 it passed). [ASSUMED] an element gauge hit (元素损伤) is no damage modifier — it never reaches 'hit'
          c.dmg.cancel = true;
          if (--P.hits <= 0) drop(b);
        }
      },
      burst(c, b) { if (kind === 'element' && P.up) drop(b); },  // 自身元素损伤爆发时，护盾消失
      // 【盲信之誓】 受到伤害时令假想敌：铳受到等量的无来源生命流失 (PRTS): the official `actrp*_passive` passes `hp_lose` to the
      // BossSelector's one gun (actrpa_hp_trans, PURE, no source) — and to nobody else (until 2026-10-15 an even split also
      // went to the other springs, after the 隐秘核心 handbook 「传递给…和场上其他“碎铳之簧”」). What passes on differs:
      // 法术护盾's `actrpa_passive` records the value of every modifier applied to it (ON_APPLIED_MODIFIER — PRTS 「调整值
      // 包括伤害、治疗和元素损伤」): damage, healing (natural regeneration aside, the heal before the max-HP clamp) and
      // element gauge hits; 元素护盾 / 频次护盾's `actrpb_passive` / `actrpc_passive` only the damage taken (ON_TAKE_DAMAGE).
      // Until 2026-10-29 the 法术护盾 spring passed on only its damage taken
      taken(c, b) { pass(b, c); },
      healed(c, b) { if (kind === 'arts') pass(b, c); },
      gauge(c, b) { if (kind === 'arts') pass(b, c); },
      tick(b, e2, a, dt) {
        if (!P.up && P.downAt != null && b.time - P.downAt >= regen) raise(b);
        const d = e2.mem.ab.dash;
        if (!d || unbalancedNow(b, e2)) return;                               // (失衡: no scripted move meanwhile)
        // 追逐模式 lasts the whole gain (PRTS 末日布道 "令全场的“碎铳之簧”获得5秒增益…增益期间切换为追逐模式"; “碎铳之簧”
        // 追逐模式 "持续追踪令其进入该形态的场上的假想敌：铳移动" — no arrival clause, unlike the 铳's own 冲锋模式): reaching
        // the gun does not end it, the spring keeps following the gun until the 5 s are over (PR #347 by @CXUtk; until
        // 0.2.1 it ended on arrival or within 1 tile). The casting gun dead: the nearest other gun; none left on the
        // field: it holds still, the gain running on.
        const g = d.gun && d.gun.alive ? d.gun : nearGun(b);
        if (g) stepToward(e2, g.x, g.y, e2.s.moveSpeed * d.mul * MOVE_SCALE * dt);
        // 追逐模式 "对进入自身0.35半径范围内的我方单位（包括飞行单位）造成一次攻击力100%的物理普通伤害" (until 0.1.3: radius 0.5)
        let n = 0;
        for (const u of areaAllies(b, e2, e2.x, e2.y, CHARGE_RADIUS)) if (!d.hit.has(u)) { d.hit.add(u); hurt(b, e2, u, e2.s.atk, 'phys'); n++; }
        if (n) b.fx('kitHit', { x: e2.x, y: e2.y, id: e2.id, k: 'actrp:dash', n });   // actrp*_s_1[damage] (audioSignal achunt_summonee.hit)
        if (b.time >= d.until) { e2.mem.ab.dash = null; b.removeBuff(e2, 'boss:dash'); enemyMode(b, e2, null); if (e2.route) e2.route.pts = null; }
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：管 (boss_3 / boss_10) + 假想敌：弦 + “余音”

/** @param {Battle} b @param {string} form */
const echoesOf = (b, form) => b.enemies.filter((o) => o.alive && o.defId === ECHO_KEY && o.mem.ab && o.mem.ab.form === form);

/** Switch an echo's form (`hit`: its own switch after its hits, acdums_t_1 — the fx `hit` its switch sound, audio). @param {Battle} b @param {Unit} echo @param {string} form @param {boolean} [hit] */
export function setEchoForm(b, echo, form, hit = false) {
  const ab = echo.mem.ab;
  if (!ab) return;
  ab.form = form;
  ab.strikes = 0;
  // gold (Passion): ASPD +`1.attack_speed`; dark (Depression): ATK +`2.atk`, move speed +`2.move_speed` (official prefab
  // Modes/Depression Talents/2: MOVE_SPEED, MULTIPLIER +0.2 — until 2026-10-14 it was −20 %)
  const mods = form === 'gold' ? { aspd: T(ab, '1.attack_speed') ?? 0 } : { atkPct: T(ab, '2.atk') ?? 0, moveMul: 1 + (T(ab, '2.move_speed') ?? 0) };
  b.addBuff(echo, { key: 'boss:echoForm', persist: true, visible: true, mods });
  // the model's form: the prefab mode Depression draws its own clip set (render/units.js FORMS), Passion the first one.
  // The mode itself (its attack Attack_B; acdums_t_1: SwitchMode on the last of `hit_times_to_switch` hits, `_restartFSM`
  // — 공식 클라에서 확인 2026-11-20) cuts the swing running and attaches the new attack ready (ai.js enemyMode)
  echo.form = form === 'dark' ? 'Depression' : null;
  enemyMode(b, echo, echo.form);
  const at = { x: echo.x, y: echo.y, id: echo.id, kind: `echo_${form}`, form: echo.form };
  b.fx('phase', hit ? { ...at, hit: 1 } : at);
}

/** An echo takes a strike/hit: pulse around it (PRTS “余音” "受到伤害时对半径1.6范围内的我方单位造成…": an area selection of the
 *  echo — no unblocking 隐匿 operator) and count towards the form switch. */
/** @param {Battle} b @param {Unit} echo */
export function echoHit(b, echo) {
  const ab = echo.mem.ab;
  if (!ab || !echo.alive) return;
  // [ASSUMED] Resolve recursively earned pulses FIFO after the current pulse. A counter can remove dozens of
  // hit-count HP here; synchronous damaged → counter → pulse nesting used to trip the engine's 32-hook guard.
  // Keep the pulse earned by the lethal hit, too. No timer, extra RNG or skipped damage (upstream f3658a0d).
  (ab.pulses ||= []).push(echo.s.atk);
  if (ab.pulsing) return;
  ab.pulsing = true;
  try {
    for (let i = 0; i < ab.pulses.length; i++) {
      const atk = ab.pulses[i];
      b.fx('explode', { x: echo.x, y: echo.y, r: ECHO_PULSE_RADIUS, kind: 'echoPulse' });
      for (const u of areaAllies(b, echo, echo.x, echo.y, ECHO_PULSE_RADIUS)) {
        hurt(b, echo, u, atk * (T(ab, '3.atk_scale') ?? 0), 'arts');
        elem(b, echo, u, 'apoptosis', atk * (T(ab, '3.ep_damage_ratio') ?? 0));
      }
      const need = /** @type {number} */ (ab.form === 'gold' ? T(ab, '1.hit_times_to_switch') : T(ab, '2.hit_times_to_switch'));
      ab.strikes = (ab.strikes ?? 0) + 1;
      if (echo.alive && need > 0 && ab.strikes >= need) setEchoForm(b, echo, ab.form === 'gold' ? 'dark' : 'gold', true);
    }
  } finally { ab.pulses.length = 0; ab.pulsing = false; }
}

/**
 * 【合奏】 (official client): the echo's SP is INCREASE_WHEN_TAKEN_DAMAGE (enemy_database spData: +1 per damage instance
 * taken, max 12, init 0). Each echo's talent (prefab Talents/4, acdums_skill_trigger) checks its own SP every
 * ECHO_ENSEMBLE_CHECK s, whatever the echo's state: full, it sends acdums_s_1[ability_trigger] to every echo on the field
 * and then clears its own SP (ClearEnemySp). Each echo that receives it casts its form's ensemble — gold PassionSkill
 * (r 0.8, apoptosis `4.ep_damage_ratio_passion`) / dark DepassionSkill (r 1.6, `4.ep_damage_ratio_depassion`), ATK 100 %
 * arts — and clears its SP; one that cannot act (stun / freeze / sleep: `_checkSrcCastable`, Entity.inAbnormalState)
 * stops the chain there — no ensemble AND its SP stays (until 2026-10-15 it was cleared with the others'), so it plays
 * again within 1 s of coming back if its SP is full. The enemy_database skill `Skill` (cd 5 / icd 2) has no prefab
 * ability and is not used (until 2026-10-14 each echo cast it on its own every 5 s).
 */
const ECHO_ENSEMBLE_CHECK = 1;
/** @param {Unit} o */
const isEcho = (o) => o.alive && o.defId === ECHO_KEY && o.mem.ab;

/** @param {Battle} b @param {Unit} echo */
function echoEnsemble(b, echo) {
  const ab = echo.mem.ab;
  const gold = ab.form === 'gold';
  const r = gold ? ECHO_ENSEMBLE_RADIUS.gold : ECHO_ENSEMBLE_RADIUS.dark;
  const ratio = gold ? T(ab, '4.ep_damage_ratio_passion') ?? 0 : T(ab, '4.ep_damage_ratio_depassion') ?? 0;
  const ability = gold ? 'PassionSkill' : 'DepassionSkill';   // the prefab's Skills/<name> (render binding, docs/SIM.md)
  ab.ensembles = (ab.ensembles ?? 0) + 1;
  echo.skillAnimUntil = b.time + 0.5;
  b.fx('enemySkill', { x: echo.x, y: echo.y, id: echo.id, ability, n: ab.ensembles });
  const prev = b._castAbility;
  b._castAbility = { id: echo.id, ability };
  try {
    b.fx('explode', { x: echo.x, y: echo.y, r, kind: gold ? 'ensembleGold' : 'ensembleDark' });
    for (const u of areaAllies(b, echo, echo.x, echo.y, r)) { hurt(b, echo, u, echo.s.atk, 'arts'); elem(b, echo, u, 'apoptosis', echo.s.atk * ratio); }
  } finally { b._castAbility = prev; }
}

/** @param {AbState} ab @param {Unit} e @returns {AbList} */
function kitEcho(ab, e) {
  const d = e.def && e.def.raw && e.def.raw.sp;
  const max = d && d.type === 'INCREASE_WHEN_TAKEN_DAMAGE' ? Number(d.maxSp) || 0 : 0;
  const inc = d && Number.isFinite(d.increment) ? d.increment : 1;
  return [
    {
      spawn(b, e2) {
        setHits(e2, e2.base.maxHp); hitCount(b, e2, true); e2.blockWeight = ECHO_BLOCK_WEIGHT; setEchoForm(b, e2, 'dark'); // hits × the round's HP (summonMods)
        ab.sp = Math.min(max, Number(d && d.initSp) || 0);
      },
      taken(c, b, e2) {
        if (max > 0) ab.sp = Math.min(max, (ab.sp ?? 0) + inc);                        // 合奏 SP: one per damage instance taken
        // 受到伤害时以自身为中心造成一次范围伤害 (a 无来源 burst too; a 管 / 弦 shot as well — pipeBurst)
        const s = c.source || c.credit; if (s && (s.side === 'ally' || /** @type {DamageRec} */ (c.dmg).tags?.includes(ECHO_STRIKE))) echoHit(b, e2);
      },
    },
    max > 0 && {
      iv: ECHO_ENSEMBLE_CHECK,
      tick(b) { // 【合奏】 check: this echo full → every echo that can act plays, then this echo's SP is cleared
        if ((/** @type {number | undefined} */ (ab.sp) ?? 0) < max - 1e-9) return;
        for (const o of b.enemies.filter(isEcho)) {
          if (!canCast(o, false, b)) continue;
          o.mem.ab.sp = 0;
          echoEnsemble(b, o);
        }
        ab.sp = 0;
      },
    },
  ];
}

/**
 * A 管 / 弦 shot lands on `at` (official projectile_enemy_acduml / _acdumm: `_onlyCheckHitWhenReachTarget`, INFINITY hits,
 * `_ignoreCamouflage`): every operator within `r` takes ATK 100 % arts, and a “余音” it was aimed at takes the hit too
 * (`_alwaysHitTraceTargetInTheEnd` — a real damage instance: 1 of its hits, +1 合奏 SP, its pulse). Returns the units hit,
 * the echo first (the skill's `_activeBuffs` land on each).
 * @param {Battle} b @param {Unit} e @param {{ x: number, y: number, defId?: string, alive?: boolean }} at (a “余音” or a spot) @param {number} r @param {string} kind
 */
function pipeBurst(b, e, at, r, kind) {
  b.fx('explode', { x: at.x, y: at.y, r, kind });
  const hit = areaAllies(b, e, at.x, at.y, r);
  for (const u of hit) hurt(b, e, u, e.s.atk, 'arts');
  if (at.defId === ECHO_KEY && at.alive) { hurt(b, e, /** @type {Unit} */ (at), e.s.atk, 'arts', { tags: [ECHO_STRIKE] }); hit.unshift(/** @type {Unit} */ (at)); }
  return hit;
}

/**
 * 管 / 弦 core: summon loop, normal attack, skill. The normal attack (official prefab Modes/Default/Body/Attack, two
 * `_abilityConfigs` tried in order) reaches the whole field (PRTS 「攻击范围扩大至全场」): a “余音” of its form (selector
 * `_filterByEnemiesKey` enemy_9023_acdums, `_enemyMode`) or, when there is none, an operator (selector side ENEMY,
 * `_postFilter` HATRED_DES — aggroCmp); `PIPE_SHOTS` shots `PIPE_STRIKE_GAP` apart, each a pipeBurst of `PIPE_SHOT_RADIUS`
 * (until 2026-10-15 it struck only 余音 and only pulsed them: no damage of its own, no attack without one).
 * @param {AbState} ab @param {Unit} e @param {Battle} b @param {Tpl} tpl @param {{ form: string, prefix: string }} opts @returns {EnemyAbility}
 */
function pipeCore(ab, e, b, tpl, { form, prefix }) {
  const hi = T(ab, `1.${prefix}_t_1[high_hp].interval`) ?? 40, lo = T(ab, `1.${prefix}_t_1[low_hp].interval`) ?? hi, thr = T(ab, '1.hp_ratio') ?? 0;
  const key = ab.tS['1.enemy_key'] ?? ECHO_KEY;
  const P = { acc: 0, atk: Infinity, castEnd: -Infinity };   // first strike as soon as an echo of its form exists (engine attack rule)
  ab.ownAttack = true;   // its skill takes the turn of this loop's attack (ownAttackTurn)
  const summon = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => {
    const got = branchSpawn(b2, tpl, 'summon_enemy', 0, { mods: summonMods(b2, null, key), at: { x: e2.x, y: e2.y }, fallback: () => [b2.spawnEnemy(key, { pos: [e2.y, e2.x], route: toGoal(b2, e2.x, e2.y), mods: summonMods(b2, null, key) })].filter(Boolean) });
    for (const u of got) if (u.defId === ECHO_KEY && form === 'gold') setEchoForm(b2, u, 'gold');
    b2.fx('summon', { x: e2.x, y: e2.y, id: e2.id, key, n: got.length });
  };
  return {
    spawn(b2, e2) { /** @type {AttackProfile} */ (e2.profile).noAttack = true; aspdFloor(b2, e2); },
    tick(b2, e2, a, dt) {
      P.acc += dt;
      if (P.acc >= (e2.hpRatio < thr ? lo : hi)) { P.acc = 0; summon(b2, e2); }
      if (!canCast(e2, false, b2)) return;
      P.atk += dt;
      if (P.atk < e2.s.interval || b2.time < P.castEnd - 1e-9) return;
      if (ownAttackTurn(b2, e2, P, 'atk')) return;               // 裂管之奏 / 断弦之奏 in place of this attack
      const echoes = echoesOf(b2, form);
      const t = echoes.length ? b2.rng.pick(echoes) : allTargets(b2, e2).sort(aggroCmp)[0];   // 优先攻击…形态余音, else an operator
      if (!t) return;
      P.atk = 0;
      e2.lastAttackAt = b2.time;
      e2.stats.attacks++;
      b2.fx('beam', { x: e2.x, y: e2.y, from: e2.id, to: t.id, kind: `${prefix}Strike` });
      // its normal attack's official projectile (data/enemies.json `proj` — projectile_enemy_acduml / _acdumm, TRACE 10
      // tiles/s; enemies/helpers.js shoot), bursting as it arrives
      const shot = () => {
        if (!e2.alive || !t.alive) return;
        shoot(b2, e2, t, e2.def?.proj, (/** @type {Unit | null} */ o) => { if (o && o.alive) pipeBurst(b2, e2, o, PIPE_SHOT_RADIUS[prefix], `${prefix}Hit`); });
      };
      for (let k = 0; k < PIPE_SHOTS[prefix]; k++) {
        if (k === 0) shot(); else b2.after(k * PIPE_STRIKE_GAP, shot, { owner: e2 });
      }
    },
  };
}

/** @param {AbState} ab @param {Unit} e @param {Battle} b @param {Tpl} tpl @returns {AbList} */
function kitPipe(ab, e, b, tpl) {
  const s = ab.sk['1'];
  const g = skillSp(e, s); // local patch: official SP
  const thr = T(ab, '1.hp_ratio') ?? 0, prob = T(ab, '1.prob') ?? 0;
  return [
    pipeCore(ab, e, b, tpl, { form: 'dark', prefix: 'acduml' }),
    {
      death(c, b2) { for (const o of b2.aliveEnemies()) if (o.defId === 'enemy_9022_acdumm') b2.kill(o, null); }, // 弦 leaves with 管
      // below `1.hp_ratio` HP: 物理和法术闪避 `1.prob` (template acduml_t_1 ON_TAKE_DAMAGE: FilterByTargetHpRatio LT 0.5 → Evade
      // PHYSICAL_AND_MAGICAL; PRTS 「自身生命值低于50%时，获得10%物理和法术闪避」; until 2026-10-15 none)
      tick(b2, e2, a) {
        const on = prob > 0 && e2.hpRatio < thr;
        if (on === !!a.on) return;
        a.on = on;
        if (on) b2.addBuff(e2, { key: 'boss:evade', persist: true, mods: { dodgePhys: prob, dodgeArts: prob } });
        else b2.removeBuff(e2, 'boss:evade');
      },
    },
    s && {
      name: s.name, cd: s.cd, icd: s.icd, cond: (b2) => echoesOf(b2, 'dark').length > 0 && (!g || g.ready()), // local patch: + SP
      fire(b2, e2) { // 【裂管之奏】 three strikes on every dark echo (the SP spent as it is cast, the shots at Skill's frame)
        if (g) g.spend(e2); // local patch
        // its echoes are taken as the cast begins (the MultiRangedAttack's own selector, `_selectTargetTiming` 0 —
        // UpdateTargets in CastToTarget) and each shot goes to those still alive (DoCastOnTargets: ValidAndAlive): one
        // summoned in between is not shot (공식 클라에서 확인 — prefab enemy_9021_acduml `Skills/1`; until 2026-11-21 taken at the spell)
        const echoes = echoesOf(b2, 'dark');
        atSpell(b2, e2, s, () => {
          const r = s.bb.range_radius ?? 0, ep = s.bb.ep_damage_ratio ?? 0;
          // each strike is the skill's official projectile (skills `1`.proj — projectile_enemy_acduml, TRACE 10 tiles/s;
          // enemies/helpers.js shoot) at the echo, a pipeBurst of 1.8 as it arrives (until 2026-10-10 at the strike's moment;
          // until 2026-10-15 a burst of `range_radius`). The skill's `_activeBuffs` acduml_s_1 then lands on every unit the
          // shot hit, the echo included: CreateBuffInCircleRange `range_radius` (0.8, 「中点判定」) around it — 凋亡
          // `ep_damage_ratio` to each operator there, selectable or not (PRTS 「无视其可选性」), itself included — and
          // ApplyElementDamage `ep_damage_ratio` on it, the echo too (the node checks no side; until 2026-10-15 the echo took none).
          const strike = (/** @type {Unit} */ echo) => {
            if (!e2.alive || !echo.alive) return;
            shoot(b2, e2, echo, s.proj, (/** @type {Unit | null} */ o) => {
              if (!o || !o.alive) return;
              const hit = pipeBurst(b2, e2, o, PIPE_SHOT_RADIUS.acduml, 'pipeStrike');
              for (const u of hit) {
                for (const v of b2.alliesInRadius(u.x, u.y, r)) elem(b2, e2, v, 'apoptosis', e2.s.atk * ep, { ignoreSelect: true });
                elem(b2, e2, u, 'apoptosis', e2.s.atk * ep);
              }
            });
          };
          for (const echo of echoes) for (let k = 0; k < 3; k++) {
            if (k === 0) strike(echo); else b2.after(k * PIPE_STRIKE_GAP, () => strike(echo), { owner: e2 });
          }
        });
      },
    },
    g && g.ab, // local patch: the SP gain
  ];
}

/** @param {AbState} ab @param {Unit} e @param {Battle} b @param {Tpl} tpl @returns {AbList} */
function kitString(ab, e, b, tpl) {
  const s = ab.sk['1'];
  const g = skillSp(e, s); // local patch: official SP
  return [
    pipeCore(ab, e, b, tpl, { form: 'gold', prefix: 'acdumm' }),
    { spawn(b2, e2) { b2.addBuff(e2, { key: 'boss:eternal', persist: true, flags: { invulnerable: true, untargetable: true } }); } }, // 永久无敌
    s && {
      name: s.name, cd: s.cd, icd: s.icd, cond: (b2) => echoesOf(b2, 'gold').length > 0 && (!g || g.ready()), // local patch: + SP
      fire(b2, e2) { // 【断弦之奏】 AoE on every gold echo, which then turns dark
        if (g) g.spend(e2); // local patch
        // its echoes are taken as the cast begins (the RangedAttack's own selector, `_selectTargetTiming` 0 — UpdateTargets
        // in CastToTarget), the shot going to those still alive at the spell (DoCastOnTargets: ValidAndAlive) — 공식 클라에서
        // 확인, prefab enemy_9022_acdumm `Skills/1`; until 2026-11-21 taken at the spell
        const echoes = echoesOf(b2, 'gold');
        atSpell(b2, e2, s, () => {
          const ep = s.bb.ep_damage_ratio ?? 0;
          // the skill's official projectile (skills `1`.proj — projectile_enemy_acdumm, TRACE 10 tiles/s; enemies/helpers.js
          // shoot) to every gold echo, a pipeBurst as it arrives (until 2026-10-10 at the cast; until 2026-10-15 the echo took
          // no hit). The skill's `_activeBuffs` acdumm_s_1 on every unit hit: 凋亡 `ep_damage_ratio`, and the echo turns dark
          // (CheckEnemyId → SwitchMode 1); as 管's, the echo takes the 凋亡 too (until 2026-10-15 it did not).
          for (const echo of echoes) {
            if (!echo.alive) continue;
            shoot(b2, e2, echo, s.proj, (/** @type {Unit | null} */ o) => {
              if (!o || !o.alive) return;   // a shot in flight lands even if its shooter fell meanwhile
              for (const u of pipeBurst(b2, e2, o, PIPE_SHOT_RADIUS.acdumm, 'stringStrike')) {
                elem(b2, e2, u, 'apoptosis', e2.s.atk * ep);
                if (u.side !== 'ally' && u.alive) setEchoForm(b2, u, 'dark');
              }
            });
          }
        });
      },
    },
    g && g.ab, // local patch: the SP gain
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// 盐风主教昆图斯 (boss_4)

/** @param {AbState} ab @param {Unit} e @param {Battle} b @param {Tpl} tpl @returns {AbList} */
function kitQuintus(ab, e, b, tpl) {
  /** @type {QuintusState} the kit's state */
  const P = { stage: 0, t0: null, stageAt: null, tent: 0 };
  const stageSkills = [['Tidewater', 'Rockfall', 'SummonTentac'], ['TidewaterG1', 'RockfallG1', 'SummonTentacG1'], ['TidewaterG2', 'RockfallG2', 'SummonTentacG2', 'Doom']];
  /** @type {EnemyAbility[]} */
  const skills = [];
  const atkRatio = T(ab, 'epdamage.attack@ep_damage_ratio') ?? 0;
  // 【断裂生殖】 「仅仍有未执行的小队动作指令时可触发」 (PRTS): its level branch (blackboard branch_id; the prefab's
  // MoveNextLevelBranch, not looping), shared by the three forms, is used up after its last phase (7 in the official
  // templates) — then the skill is no longer ready and leaves the attack's turn to the attack (until 2026-10-29 an empty
  // cast still took it). Without the branch (tests, tools: the random-target fallback) no limit.
  const tentLeft = (/** @type {AbSkill} */ s) => {
    const br = tpl && tpl.branches && tpl.branches[s.bs.branch_id ?? 'dslily_dstnta'];
    return Array.isArray(br) && br.length ? br.length : Infinity;
  };
  const mk = (/** @type {string} */ name, /** @type {number} */ stage) => {
    const s = ab.sk[name];
    if (!s) return null;
    const kind = name.replace(/G\d$/, '');
    const phases = kind === 'SummonTentac' ? tentLeft(s) : Infinity;
    const pick = QUINTUS_PICK[kind];
    /** @type {EnemyAbility} */
    const a = { name: s.name, cd: s.cd, icd: s.icd, stage, cond: () => P.stage === stage && P.tent < phases };
    if (pick) { // its units taken as the cast begins, struck at the spell if still alive on the field (QUINTUS_PICK)
      a.fire = (b2, e2, a2) => { a2.picks = pick(b2, e2, P); };
      a.atStrike = (b2, e2, a2) => {
        const picks = (/** @type {Unit[] | null} */ (a2.picks) || []).filter((u) => u.alive && u.deployed);
        a2.picks = null;
        QUINTUS[kind](b2, e2, s, picks);
      };
    } else Object.assign(a, { atStrike: true, fire: (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => QUINTUS[kind](b2, e2, s, P, tpl) });
    skills.push(a);
    return a;
  };
  /** @type {AbList} the abilities (plain objects, content/enemies.js header) */
  const list = [{
    spawn(b2, e2) { P.t0 = b2.time; P.stageAt = b2.time; /** @type {AttackProfile} */ (e2.profile).maxTargets = 2; },
    before(c, b2, e2) { // 同时攻击防御最高的两个单位
      const l = targetsNear(b2, e2, e2.base.rangeRadius || 99).sort((/** @type {Unit} */ p, /** @type {Unit} */ q) => q.s.def - p.s.def || aggroCmp(p, q));
      if (l.length) c.targets = l.slice(0, 2);
    },
    dealt(c, b2, e2) { elem(b2, e2, c.target, 'neural', e2.s.atk * atkRatio); },
    iv: 0.25,
    tick(b2, e2) {
      const lost = 1 - e2.hpRatio;
      if (P.stage === 0 && (lost >= (T(ab, 'growup1.hp_ratio') ?? 1) || b2.time - /** @type {number} */ (P.t0) >= (T(ab, 'growup1.interval') ?? Infinity))) grow(b2, e2, 1);
      else if (P.stage === 1 && (lost >= 2 * (T(ab, 'growup2.hp_ratio') ?? 1) || b2.time - /** @type {number} */ (P.stageAt) >= (T(ab, 'growup2.interval') ?? Infinity))) grow(b2, e2, 2);
    },
  }];
  const grow = (/** @type {Battle} */ b2, /** @type {Unit} */ e2, /** @type {number} */ n) => {
    P.stage = n; P.stageAt = b2.time;
    // the prefab's mode G1 / G2 (dslily_growup[countdown] / dslily_growup_hp_ratio: SwitchMode from the blackboard's
    // `mode`, `_restartFSM` — 공식 클라에서 확인 2026-11-20): the swing or skill cast running is cut, the new attack is ready
    enemyMode(b2, e2, `G${n}`);
    b2.addBuff(e2, { key: 'boss:grow', persist: true, visible: true, mods: { atkPct: T(ab, `atkup${n}.atk`) ?? 0 } });
    for (const a of skills) if (a.stage === n) a.left = a.icd;   // the new form's skills start from their initial cooldown
    b2.fx('grow', { x: e2.x, y: e2.y, id: e2.id, stage: n });
  };
  stageSkills.forEach((names, i) => names.forEach((n) => list.push(mk(n, i))));
  return list;
}

/**
 * The units 【大潮】 / 【崩坍】 (and their G1 / G2 forms) strike, taken as the cast begins: their MeleeAttack's own selector
 * (`_selectTargetSource` 1, `_selectTargetTiming` 0 — UpdateTargets in CastToTarget), the spell going to those still alive
 * on the field (DoCastOnTargets: ValidAndAlive) — one that falls or withdraws in between is not replaced and a unit placed
 * in between is not struck (공식 클라에서 확인 — prefab enemy_1521_dslily `Skills/Tidewater*`·`Rockfall*`; until 2026-11-21
 * taken again at the spell).
 */
/**
 * 盐风主教昆图斯's state (kitQuintus): its stage, its spawn and the time it reached the stage, the 断裂生殖 casts so far and
 * the 子代 they switched on by their device alias.
 * @typedef {{ stage: number, t0: number | null, stageAt: number | null, tent: number, brood?: Map<string, Unit> }} QuintusState
 * A part of QUINTUS: a method signature, so that each part names the 4th argument its call gives (the units QUINTUS_PICK
 * took, else the kit's state).
 * @typedef {{ run(b: Battle, e: Unit, s: AbSkill, arg: Unit[] | QuintusState, tpl?: Tpl): void }} QuintusPart
 */
/** @type {Record<string, (b: Battle, e: Unit, P: QuintusState) => Unit[]>} */
const QUINTUS_PICK = {
  Tidewater: (b, e) => fieldAllies(b, e),   // "对场上所有我方单位…": every operator it can select
  Rockfall: (b, e, P) => {                  // the N highest-DEF units
    const n = ROCKFALL_TARGETS[Math.min(P.stage, ROCKFALL_TARGETS.length - 1)];
    return allTargets(b, e).sort((p, q) => q.s.def - p.s.def || aggroCmp(p, q)).slice(0, n);
  },
};
/** @type {Record<string, QuintusPart['run']>} the 4th argument: the units QUINTUS_PICK took, else the kit's state */
const QUINTUS = {
  Tidewater(b, e, s, /** @type {Unit[]} */ picks) { // 【大潮】 arts + neural on its units (QUINTUS_PICK)
    b.fx('tide', { x: e.x, y: e.y, id: e.id });
    for (const u of picks) { hurt(b, e, u, e.s.atk * (s.bb.atk_scale ?? 0), 'arts'); elem(b, e, u, 'neural', e.s.atk * (s.bb.ep_damage_ratio ?? 0)); }
  },
  Rockfall(b, e, s, /** @type {Unit[]} */ ts) { // 【崩坍】 delayed strikes on its units (QUINTUS_PICK)
    for (const t of ts) {
      b.fx('rockfall', { x: t.x, y: t.y, id: t.id, dur: ROCKFALL_DELAY });
      b.after(ROCKFALL_DELAY, () => { if (e.alive && t.alive) hurt(b, e, t, e.s.atk * (s.bb.atk_scale ?? 0), 'phys'); }, { owner: e });
    }
  },
  SummonTentac(b, e, s, /** @type {QuintusState} */ P, tpl) { // 【断裂生殖】 switches on the template's predefined 子代 (phase i on the i-th cast)
    const br = tpl && tpl.branches && tpl.branches[s.bs.branch_id ?? 'dslily_dstnta'];
    const devs = (tpl && tpl.devices) || [];
    let spots = [];
    const branched = Array.isArray(br) && br.length > 0;
    if (branched) {
      // the prefab's MoveNextLevelBranch (`_isLoop` false): Scheduler.BranchRuntime.TryPickNextPhase picks the phase at
      // the cursor and fails once the cursor is past the last one — from the cast after the last phase on, no 子代
      // (until 2026-10-15 the last phase, all four, came again on every later cast)
      const phase = P.tent < br.length ? br[P.tent] || [] : [];
      for (const a of phase) { const d = devs.find((x) => x.alias === a.key); if (d && d.pos) spots.push(d); }
    }
    // no template (tests, tools): one 子代 on a random operator's tile, from any template device record of the key
    if (!branched && !spots.length) {
      const t = b.rng.pick(allTargets(b, e));
      const d = devs.find((x) => x.key === BROOD_KEY) || broodRecord(b);
      if (t && d) spots = [{ ...d, alias: null, pos: [t.tileR, t.tileC] }];
    }
    P.tent++;
    P.brood = P.brood || new Map();
    for (const d of spots) {
      // ACTIVATE_PREDEFINED makes a NEW token and clears the tile's unit first (BattleController._CreatePredefinedCharacter:
      // CreateToken → Tile.ClearCharacterIfExists → LocateCharacter): a 子代 still there is removed and a new one
      // starts over — 12 s 幼体, 35 s life (the 18 s cast of the last form is shorter than a 子代's 35 s). Until 2026-10-15
      // the live one stayed and nothing happened
      const live = d.alias && P.brood.get(d.alias);
      if (live && live.alive) b.kill(live, null);
      const u = spawnBrood(b, e, d);
      if (u && d.alias) P.brood.set(d.alias, u);
    }
  },
  Doom(b, e, s) { // 【物种爆发】
    b.fx('telegraph', { x: e.x, y: e.y, r: 99, dur: DOOM_DELAY, kind: 'speciesBurst', id: e.id });
    b.after(DOOM_DELAY, () => { if (e.alive) lpLoss(b, Math.abs(s.bb.value ?? 0), 'speciesBurst', e); }, { owner: e });
  },
};

/** A template device record of 子代 (data/waves.json `devices[]`) from any wave template — for a cast without a template. @param {Battle} b @returns {WaveDevice | null} */
function broodRecord(b) {
  const ids = typeof b.data.waveIds === 'function' ? b.data.waveIds() : [];
  for (const id of ids) {
    const d = ((b.data.getWave(id) || {}).devices || []).find((/** @type {WaveDevice | null} */ x) => x && x.key === BROOD_KEY && x.stats);
    if (d) return d;
  }
  return null;
}

/**
 * The enemy record of a 子代 from its template device record (build-data templateDevice: character_table attributes,
 * hidden talent `1.grow_duration` / `1.duration`, skill sktok_dstnta). A token that never moves (static, 失衡免疫 — it
 * is a stage device) and has no normal attack: 摄食 is its only action (kitBrood). No LP, no kill count (a part).
 * @param {WaveDevice} d
 */
function broodDef(d) {
  const st = d.stats || {};
  return {
    name: d.name || d.key, rank: 'NORMAL', applyWay: 'NONE', notCountInTotal: true, staticBody: true, spine: d.key,
    stats: { maxHp: st.maxHp, atk: st.atk, def: st.def, res: st.res, bat: st.bat, aspd: st.aspd, moveSpeed: 0, massLevel: st.massLevel, motion: 'WALK', lpr: 0 },
    talents: { bb: d.talent || {} },
    skills: d.skill ? [{ prefabKey: d.skill.prefabId || d.skill.skillId, cooldown: 0, initCooldown: 0, spCost: d.skill.spCost, bb: d.skill.bb || {} }] : [],
  };
}

/**
 * Switch on one 子代 at its device tile. Its own numbers: the round's enemy HP / ATK effects (rune `enemy_attribute_mul`,
 * EAttribuesMul) work on an `Enemy` only and a 子代 is a token (`Trap`) — until 2026-10-15 they reached it (summonMods).
 * @param {Battle} b @param {Unit} boss @param {WaveDevice} d
 */
function spawnBrood(b, boss, d) {
  const pos = d.pos;
  const u = b.spawnEnemy(d.key, { def: broodDef(d), pos, route: { motion: 'FLY', start: pos, end: pos, steps: [{ t: 'wait', s: 99999 }] },
    tag: 'part', countInTotal: false, ownerPlayerId: boss.ownerId });
  if (u) u.mem.noLeak = true;   // a stage device: never a leak at the time limit (Battle._timeout)
  return u;
}

/**
 * 子代 (trap_039_dstnta; the official token prefab in pkgrps/btl_pfb_tokens_0, skill prefab sktok_dstnta, character_table
 * / skill_table — research boss-patterns 표 6):
 *   幼体 (Default mode) for `1.grow_duration` (12) s: 隐匿 (INVISIBLE), immune to stun, silence and freeze; PRTS gives 10 s,
 *     the client 12.
 *   Grow: 隐匿 ends, and BROOD_GROW_ANIM s later the GrowUp mode starts (the immunities go with the 幼体 mode): SP +1/s.
 *   摄食 (SP `spCost` 1 from 0, a ChannelingMeleeAttack) takes the operator nearest to it within BROOD_REACH
 *     (DIST_TO_SOURCE_ASC: taunt plays no part) and holds it: BROOD_FIRST_HIT s after the pick and then every
 *     BROOD_HIT_EVERY s, ATK × `atk_scale` (absent → 1) physical + ATK × `ep_damage_ratio` (1) 神经 damage and a BROOD_STUN s
 *     stun. Every hit picks its target again (`_selectTargetTiming` BEFORE_SPELL_START): the nearest operator within reach
 *     THEN — a nearer one takes over, one that left is replaced (until 2026-10-15 the first pick was held to the end). The
 *     channel ends when its target dies (`_interuptIfTargetDead`), when nobody is in reach at a hit [ASSUMED: the default
 *     path, not read], or when the 子代 is stunned or silenced (`_canSilenced`); the SP starts from 0 again
 *     (`_resetAbilityCooldownWhenCastEnd`), so the next pick comes 1 s later.
 *   `1.duration` (35) s after it appears it withdraws (trap_tentac[withdraw], suicide_after_buff[switch_to_dead]: no kill).
 * Operators can attack it once 隐匿 ends (character_table "可以受到我方攻击"); its HP is its own (no transfer).
 * Model forms (render units.js FORMS): 'larva' (Start_01 → Idle_01), 'grown' (Start_02 → Idle_02 / Die_02), 'feed' (holding:
 * Attack_Begin → Attack_Loop), 'fed' (Attack_End → Idle_02).
 * @param {AbState} ab @returns {AbList}
 */
function kitBrood(ab) {
  const grow = T(ab, '1.grow_duration') ?? 0, life = T(ab, '1.duration') ?? Infinity;
  const sk = Object.values(ab.sk)[0] || null;
  const cost = sk && sk.sp > 0 ? sk.sp : 1;
  const atkScale = (sk && sk.bb.atk_scale) ?? 1, epr = (sk && sk.bb.ep_damage_ratio) ?? 0;
  /** @type {{ t0: number, stage: number, sp: number, hold: Unit | null, next: number }} the kit's state */
  const P = { t0: 0, stage: 0, sp: 0, hold: null, next: 0 };   // stage 0 幼体, 1 growing, 2 GrowUp
  const release = (/** @type {Battle} */ b, /** @type {Unit} */ e) => {
    if (!P.hold) return;
    P.hold = null; P.sp = 0;
    if (!e.alive) return;
    setForm(b, e, 'fed');
    if (sk) b.fx('enemySkillEnd', { x: e.x, y: e.y, id: e.id, ability: sk.name });   // the cast's end (ON_CAST_END: its held effects end)
  };
  const bite = (/** @type {Battle} */ b, /** @type {Unit} */ e, /** @type {Unit} */ t) => {
    P.next = b.time + BROOD_HIT_EVERY;
    e.lastAttackAt = b.time;
    hurt(b, e, t, e.s.atk * atkScale, 'phys');
    elem(b, e, t, 'neural', e.s.atk * epr);
    if (t.alive) b.applyStatus(t, 'stun', { duration: BROOD_STUN, source: e });
  };
  const nearest = (/** @type {Battle} */ b, /** @type {Unit} */ e) => targetsNear(b, e, BROOD_REACH)
    .sort((/** @type {Unit} */ p, /** @type {Unit} */ q) => hypot(p.x - e.x, p.y - e.y) - hypot(q.x - e.x, q.y - e.y) || aggroCmp(p, q))[0] || null;
  return [{
    spawn(b, e, a, ab2) {
      P.t0 = b.time;
      setForm(b, e, 'larva');
      b.addBuff(e, { key: 'boss:brood', persist: true, flags: { noMove: true, noDisplace: true } });
      if (grow > 0) {
        b.addBuff(e, { key: 'boss:broodLarva', persist: true, flags: { stealth: true } });
        ab2.immune = new Set(['stun', 'silence', 'freeze']);
      } else P.stage = 2;
    },
    tick(b, e, a, dt) {
      const age = b.time - P.t0;
      if (age >= life - 1e-9) { P.hold = null; b.kill(e, null); return; }
      if (P.stage === 0) {
        if (age < grow - 1e-9) return;
        P.stage = 1;
        b.removeBuff(e, 'boss:broodLarva');
        setForm(b, e, 'grown');
        return;
      }
      if (P.stage === 1) {
        if (age < grow + BROOD_GROW_ANIM - 1e-9) return;
        P.stage = 2;
        e.mem.ab.immune = null;
        return;
      }
      if (P.hold) {
        if (!canCast(e, true, b) || !P.hold.alive || !P.hold.deployed) { release(b, e); return; }
        if (b.time < P.next - 1e-9) return;
        const t = nearest(b, e);
        if (!t) { release(b, e); return; }
        P.hold = t;
        bite(b, e, t);
        return;
      }
      if (!canCast(e, true, b)) return;
      P.sp = Math.min(cost, P.sp + dt);
      if (P.sp < cost - 1e-9) return;
      const t = nearest(b, e);
      if (!t) return;
      P.hold = t;
      P.next = b.time + BROOD_FIRST_HIT;
      setForm(b, e, 'feed', 'phase', { tgt: t.id });
      if (sk) b.fx('enemySkill', { x: e.x, y: e.y, id: e.id, ability: sk.name, n: 1, hold: 1 });   // held until 'enemySkillEnd' (release)
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// 卢西恩，“猩红血钻” (boss_5) + 不祥幻影

/** @param {AbState} ab @param {Unit} e @returns {AbList} */
function lucienCore(ab, e) {
  const pen = T(ab, 'penetrate.def_penetrate') ?? 0, prob = T(ab, 'evade.prob') ?? 0, epr = T(ab, 'combat.attack@ep_damage_ratio') ?? 0;
  const s = ab.sk.aoe;
  return [
    {
      spawn(b, e2) { if (pen > 0) b.addBuff(e2, { key: 'boss:pierce', persist: true, mods: { defIgnorePct: pen } }); },
      tick(b, e2, a) { // 未被阻挡时有几率闪避物理与法术攻击
        const on = !e2.blockedBy && prob > 0;
        if (on === a.on) return;
        a.on = on;
        if (on) b.addBuff(e2, { key: 'boss:evade', persist: true, mods: { dodgePhys: prob, dodgeArts: prob } });
        else b.removeBuff(e2, 'boss:evade');
      },
      dealt(c, b, e2) { elem(b, e2, c.target, 'neural', e2.s.atk * epr); },
    },
    s && {
      // cast with a target in the radius (PRTS 技能 "需要目标"; 不祥幻影 "仅在半径2范围内存在我方单位时触发"): the trigger
      // selection (targetsNear — PRTS 选择器 "所有触发选择器通常不无视迷彩"): an airborne (起飞) operator evades a ground
      // leader (对地规避 — counting her spent the skill on nobody, §21.22), nor does an unblocking 隐匿 or 迷彩 one count
      name: s.name, cd: s.cd, icd: s.icd, cond: (b) => targetsNear(b, e, LUCIEN_AOE_RADIUS).length > 0,
      // "该技能伤害无视迷彩": an area selection (areaAllies) — a 迷彩 operator is hit, an unblocking 隐匿 one not. Its units are
      // taken as the cast begins (the MeleeAttack's `_selectTargetTiming` 0 — UpdateTargets in CastToTarget) and hit at the
      // spell if still alive on the field (DoCastOnTargets: ValidAndAlive); until 2026-11-20 taken again at the spell
      fire(b, e2, a) { a.picks = areaAllies(b, e2, e2.x, e2.y, LUCIEN_AOE_RADIUS); },
      atStrike(b, e2, a) {
        const picks = /** @type {Unit[] | null} */ (a.picks) || [];
        a.picks = null;
        b.fx('explode', { x: e2.x, y: e2.y, r: LUCIEN_AOE_RADIUS, kind: 'crimsonAoe' });
        for (const u of picks) {
          if (!u.alive || !u.deployed) continue;
          hurt(b, e2, u, e2.s.atk * (s.bb.atk_scale ?? 0), 'phys');
          elem(b, e2, u, 'neural', e2.s.atk * (s.bb.ep_damage_ratio ?? 0));
        }
      },
    },
  ];
}

/** @param {AbState} ab @param {Unit} e @returns {AbList} */
function kitLucien(ab, e) {
  const s = ab.sk.blink;
  return [...lucienCore(ab, e), s && {
    name: s.name, cd: s.cd, icd: s.icd, atStrike: true, cond: () => !!e.blockedBy,
    fire(b, e2) { // blink past the blocker, leaving a 不祥幻影 on its path
      const route = remainingRoute(e2);
      const from = blinkForward(b, e2, s.bb.dist ?? 1.5);
      if (!from) return;
      const ph = b.spawnEnemy(PHANTOM_KEY, { pos: [from.y, from.x], route, ownerPlayerId: e2.ownerId, sourcePlayerId: e2.sourcePlayerId, mods: summonMods(b, null, PHANTOM_KEY) });
      if (ph) b.fx('summon', { x: from.x, y: from.y, id: e2.id, key: PHANTOM_KEY, n: 1 });
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// 阿利斯泰尔，帝国余晖 (boss_6)

/** @param {AbState} ab @param {Unit} e @param {Battle} b @returns {AbList} */
function kitLion(ab, e, b) {
  const eq = ab.sk.equip, eqA = ab.sk.equipA, st = ab.sk.store, stA = ab.sk.storeA, su = ab.sk.Suicide;
  /** @type {{ sp: number, adv: boolean, nextAnim: number | null, vestSide: number }} the kit's state */
  const P = { sp: 0, adv: false, nextAnim: null, vestSide: 0 };
  /** The x side (±1) the boss faces: its route's first column change from where it stands (none: +1). */
  const frontSide = (/** @type {Unit} */ e2) => {
    for (const l of (e2.route && e2.route.legs) || []) if (l && l.t === 'move' && Number.isFinite(l.c) && Math.abs(l.c - e2.x) > 1e-6) return Math.sign(l.c - e2.x);
    return 1;
  };
  const raw = e.def.raw || {};
  const golden = (raw.devices || b.data.getEnemy(e.defId)?.raw?.devices || []).find((/** @type {WaveDevice | null} */ d) => d && d.key === GOLDEN_KEY) || null;
  const range = () => e.base.rangeRadius || 3.4;
  const cost = eq ? (eq.sp > 0 ? eq.sp : 25) : Infinity;
  const spData = raw.sp || null, spMax = Math.max(Number.isFinite(cost) ? cost : 0, Number(spData && spData.maxSp) || 0);
  /** Equipment lying on this field, oldest first. */
  const equipment = (/** @type {Battle} */ b2) => b2.enemies.filter((q) => q.alive && EQUIP_KEYS.includes(q.defId)).sort((p, q) => p.spawnSeq - q.spawnSeq);
  const decree = (/** @type {Battle} */ b2, /** @type {Unit} */ e2, /** @type {Unit} */ t) => { // 【王权号令】 plus-shaped strike + random equipment, aimed at `t`
    const sk = P.adv && eqA ? eqA : eq;
    if (!t) return false;
    const r0 = t.tileR, c0 = t.tileC;
    const tiles = [[r0, c0], [r0 + 1, c0], [r0 - 1, c0], [r0, c0 + 1], [r0, c0 - 1]];
    b2.fx('telegraph', { x: c0, y: r0, r: 1, kind: 'royalDecree', tiles: 'plus', id: e2.id });
    // projectile_enemy_vtlionk_s1's HitBehaviour strikes the plus's ground units only (`targetMotion` 1); the unit it was
    // aimed at (the skill's selector: any motion) is struck in any case (`_alwaysHitTraceTargetInTheEnd`) — so a flying
    // ally is hit only as the target (until 2026-11-20 one in the plus was hit too)
    for (const u of areaAlliesInTiles(b2, e2, r0, c0, 'plus', 1)) if (!u.isFlying || u === t) hurt(b2, e2, u, e2.s.atk * ((sk && sk.bb.atk_scale) || 0), 'phys');
    // the drop tile (projectile_enemy_vtlionk_s1 selector, ACT37SIDE_EQUIP): any tile of the plus but one where a piece
    // lies (`act37side_equip`) or whose operator holds one (`enemy_vtmstr_equip_char[mark]`) — an operator's tile too,
    // and it picks the piece up (kitEquip). The selector checks no height and no buildable type, only the tile's advanced
    // mask DEFAULT (TileSelector.Options.Verify): every tile of this mode but 深水区 (tile_deepsea DEEP_SEA) — a tile no
    // operator can stand on too (tile_forbidden, tile_fence_bound: maintainer decision 2026-10-15, as the client), where
    // the piece lies for good, nobody to pick it up, still a 莫非王土 target (until 2026-10-15 those tiles were left out;
    // the mode's maps have no hole or wall)
    const taken = equipment(b2);
    const g = b2.grid;
    const free = tiles.filter(([r, c]) => {
      if (!g.inRect(r, c) || g.deepWater[g.key(r, c)]) return false;
      if (taken.some((q) => Math.round(q.y) === r && Math.round(q.x) === c)) return false;
      const u = b2.unitAt(r, c);
      return !(u && holdsEquip(u));
    });
    const spot = b2.rng.pick(free);
    if (spot) {
      const key = b2.rng.pick(EQUIP_KEYS);
      const q = b2.spawnEnemy(key, { pos: spot, route: { motion: 'FLY', start: spot, end: spot, steps: [{ t: 'wait', s: 99999 }] }, tag: 'part', countInTotal: false, ownerPlayerId: e2.ownerId });
      if (q) b2.fx('equip', { x: spot[1], y: spot[0], id: q.id, key });
    }
    return true;
  };
  const animate = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => { // 【莫非王土】 one piece (2 at ≤50 %); false when no branch can cast
    const n = P.adv && stA ? stA.bb.max_target ?? 2 : 1;
    const sk = P.adv && stA ? stA : st;
    // prefab store / storeA: an AbilitySelectableGroup casting its first branch that can (_DoCastInternal walks the
    // configs in order). hasSword — triggered by an operator in its circle (radius 1 × the boss's range 3.4: no
    // `range_radius` in the skill's blackboard → GetModeRangeRadius; the range the sword's s2range shot picks from) — takes any piece (selector buff enemy_vtmstr_equip_tr); else
    // noSword takes a vest or a wand (enemy_vtmstr_mark[not_sword]). A sword with nobody in range waits on the field.
    // Both sort HATRED_DES; a piece never moves, so all tie on hatred and the tie goes to the lower instanceUid
    // (WeightedTarget.CompareTo → Entity.CompareTo): the OLDEST first (until 2026-10-15 the latest)
    const all = equipment(b2);
    const pool = targetsNear(b2, e2, range()).length > 0 ? all : all.filter((q) => q.defId !== SWORD_KEY);
    if (!pool.length) return false;
    for (const q of pool.slice(0, n)) {
      if (q.defId === 'enemy_10028_vtswd') {
        const t = b2.rng.pick(targetsNear(b2, e2, range()));
        if (t) { b2.fx('sword', { x: q.x, y: q.y, from: q.id, to: t.id }); hurt(b2, e2, t, e2.s.atk * ((sk && sk.bb.atk_scale) || 0), 'phys'); }
      } else if (q.defId === 'enemy_10029_vtshld') {
        // the guarded side alternates with every vest activated (official template enemy_vtlionk_shld `front` toggle,
        // the boss buff's `front` starting at 0): the first vest guards the FRONT, the side the boss faces (its route's
        // way: −x, the smaller column, for the official route (3,10) → (2,2)), then the other side each time. Until
        // 2026-10-15 the first was +x; maintainer decision 2026-10-15 [ASSUMED: facing while it waits = its route's way]
        const side = P.vestSide = P.vestSide ? -P.vestSide : frontSide(e2);
        b2.addBuff(e2, { key: 'boss:vest', shield: (sk && sk.bb.dynamic) || 0, persist: true, visible: true, data: { side, cut: (sk && sk.bb.damage_resistance) || 0 } });
        b2.fx('vest', { x: e2.x, y: e2.y, id: e2.id, side });
      } else if (q.defId === WAND_KEY) {
        // enemy_vtlionk_s2: SpawnTokenOnTargetTile trap_185_vtlntw (黄金回响) on the piece's tile
        b2.fx('equip', { x: q.x, y: q.y, id: q.id, key: q.defId, kind: 'wand' });
        if (golden) spawnGolden(b2, e2, golden, [Math.round(q.y), Math.round(q.x)]);
      }
      b2.kill(q, null);
    }
    return true;
  };
  return [
    {
      tick(b2, e2, a, dt) {
        if (!P.adv && e2.hpRatio <= (T(ab, 'advance.hp_ratio') ?? 0)) { // ≤50 %: DEF +100 %, RES +45, animate two
          P.adv = true;
          // enemy_vtlionk_advance: SwitchMode 1 (S1, `_restartFSM`; 공식 클라에서 확인 2026-11-20) — the cast or swing running
          // is cut, S1's attack is ready
          enemyMode(b2, e2, 'S1');
          b2.addBuff(e2, { key: 'boss:advance', persist: true, visible: true, mods: { defPct: T(ab, 'advance.def') ?? 0, resFlat: T(ab, 'advance.magic_resistance') ?? 0 } });
          b2.fx('phase', { x: e2.x, y: e2.y, id: e2.id, kind: 'lionAdvance' });
        }
        // its SP (spData INCREASE_WITH_TIME 0/25 +1/s): on through a stun, still while it casts (skillSp, spGain)
        P.sp = Math.min(spMax, P.sp + spGain(b2, e2, spData, dt));
        if (Number.isFinite(cost)) e2.mem.lpSp = [Math.min(P.sp, cost), cost]; // local patch: the boss SP bar (local-hud.js)
        if (!canCast(e2, false, b2)) return;
        // 【莫非王土】: ANIMATE_DELAY s after equipment first lies on the field, then once per 王权号令 cycle; when no branch
        // can cast (a lone sword, nobody in range) it fires as soon as one can
        const has = equipment(b2).length > 0;
        if (!has) { P.nextAnim = null; return; }
        if (P.nextAnim == null) P.nextAnim = b2.time + ANIMATE_DELAY;
        if (b2.time >= P.nextAnim && animate(b2, e2)) P.nextAnim = b2.time + (Number.isFinite(cost) ? cost : ANIMATE_DELAY);
      },
      // vest: physical / arts damage from its side ×(1 − damage_resistance) while the barrier holds. The side is by grid
      // column, as the official template enemy_vtlionk_shld (ON_TAKE_DAMAGE CheckIfSourceGridPosFaceTargetGridPos,
      // `_targetColOffset` 0, `_faceIfSameCol` NONE; DamageScale PHYSICAL_AND_MAGICAL): an attacker in the boss's column
      // is on neither side, and true damage is never cut (until 2026-11-03 the exact x and every damage type)
      hitIn(c, b2, e2) {
        const v = /** @type {Buff | null} */ (e2.findBuff('boss:vest')), s = c.source, ty = c.dmg.type;
        if (!v || !(v.shield > 0) || !s || (ty !== 'phys' && ty !== 'arts')) return;
        if (Math.sign(Math.round(s.x) - Math.round(e2.x)) === v.data.side) c.dmg.mul *= 1 - v.data.cut;
      },
    },
    // 【王权号令】 (equip, ≤50 % equipA; its cooldown 0): with full SP it waits for the attack's turn and is cast in place of
    // the attack (enemies.js onSkillSlot; until 2026-10-29 at once, on top of the attacks); the SP restarts at the cast
    .../** @type {Array<[AbSkill | undefined, boolean]>} */ ([[eq, false], [eqA, true]]).map(([sk, adv]) => sk && /** @type {EnemyAbility} */ ({
      name: sk.name, cd: 0, icd: 0,
      cond: (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => (P.adv && !!eqA) === adv && P.sp >= cost && targetsNear(b2, e2, range()).length > 0,
      // the SP restarts as it is cast, the strike and the drop come at Skill_1's attack event (castStrikeAt). Its target is
      // taken as the cast begins (the RangedAttack's `_selectTargetTiming` 0, one target with `_alwaysIncludeTarget` — the
      // skill's input target); at the spell the shot goes only to it if still alive on the field (DoCastOnTargets:
      // ValidAndAlive), and without `_allowNoTarget` its `_emitToInputRootTileWhenTargetIsInvalid` is never used — no shot,
      // no strike, no drop (RangedAttack.DoCastOnTargets; 공식 클라에서 확인 — prefab `Skills/equip`·`equipA`; until
      // 2026-11-21 a target taken at the spell)
      fire(b2, e2) {
        P.sp = 0;
        const t = b2.rng.pick(targetsNear(b2, e2, range()));
        atSpell(b2, e2, sk, () => { if (t && t.alive && t.deployed) decree(b2, e2, t); });
      },
    })),
    su && {
      name: su.name, cd: su.cd, icd: su.icd, atStrike: true,
      fire(b2, e2) { // 【斥退】 "对场上所有我方单位…": every operator it can select (fieldAllies)
        b2.fx('telegraph', { x: e2.x, y: e2.y, r: 99, kind: 'repel', id: e2.id });
        for (const u of fieldAllies(b2, e2)) hurt(b2, e2, u, e2.s.atk * (su.bb.atk_scale ?? 0), 'arts');
        lpLoss(b2, Math.abs(su.bb.value ?? 0), 'repel', e2);
      },
    },
  ];
}

/** Whether operator `u` holds one of 王权号令's pieces (enemy_vtmstr_equip_char[A/B/C]). @param {Unit} u */
const holdsEquip = (u) => Object.values(HELD_BUFF).some((k) => u.findBuff(k));

/**
 * 王权号令's pieces (official client — research boss-patterns §2): inert where they lie (invulnerable, untargetable, never
 * move) until 莫非王土 animates one. Each carries an aura on its own tile (prefab Talents/2, range `0-1`) that hands its
 * `[char]` buff to an operator standing there — at any moment, so also one deployed, redeployed or moved there later —
 * of any class (profession mask 639: no summon, no device) on the ground (targetMotion WALK_ONLY: no 起飞 operator). The
 * buff (enemy_vtmstr_equip_A/B/C[char]) refuses an operator that already holds a piece; else the operator keeps it for
 * the battle and the piece is gone (InstantKill, no kill): 未装配刀片 ATK ×(1 + `2.atk`), 防护背心 DEF ×(1 + `2.def`),
 * 冲击式施术单元 the wand effect (equipHooks). Until 2026-10-15 nobody picked a piece up.
 * @param {AbState} ab @param {Unit} e @returns {AbList}
 */
function kitEquip(ab, e) {
  const pickUp = (/** @type {Battle} */ b, /** @type {Unit} */ q, /** @type {Unit} */ u) => {
    const key = HELD_BUFF[q.defId];
    if (q.defId === SWORD_KEY) b.addBuff(u, { key, persist: true, visible: true, mods: { atkPct: T(ab, '2.atk') ?? 0 } });
    else if (q.defId === VEST_KEY) b.addBuff(u, { key, persist: true, visible: true, mods: { defPct: T(ab, '2.def') ?? 0 } });
    else {
      b.addBuff(u, { key, persist: true, visible: true });
      equipHooks(b).set(u, { armed: false, until: -Infinity, value: T(ab, '2.value') ?? 0, window: T(ab, '2.work_time') ?? 0, tremble: T(ab, '2.not_combat') ?? 0 });
    }
    b.fx('equip', { x: u.x, y: u.y, id: u.id, key: q.defId, kind: 'pickup' });
    b.kill(q, null);
  };
  return [{
    spawn(b, q) { b.addBuff(q, { key: 'boss:equip', persist: true, flags: { invulnerable: true, untargetable: true, noMove: true } }); },
    tick(b, q) {
      if (!EQUIP_KEYS.includes(q.defId)) return;
      const u = b.unitAt(Math.round(q.y), Math.round(q.x));
      if (!u || u.kind !== 'op' || !u.deployed || u.hidden || u.s.flags.liftoff || holdsEquip(u)) return;
      pickUp(b, q, u);
    },
  }];
}

/**
 * 冲击式施术单元 held by an operator (enemy_vtmstr_equip_B_disarm[char] → B_attack_disarm[char] → B_instant[char]): every
 * skill it casts arms it; the first damage it then deals to an enemy opens a `2.work_time` (0.1) s window, and that
 * damage and every other one it deals to an enemy in the window add `2.value` (800) 无来源 arts damage (B_damage[char]
 * NoSourceDamage, `_multiplierByKey` false: `cnt` is not read, ×1) and `2.not_combat` (10) s 战栗 (disarmed_combat; a blocked
 * target's swing is cut — ai.js). Element damage (元素损伤) is no "output damage" here (it raises ON_AFTER_OUTPUT_ELEMENT_DAMAGE
 * only; the templates listen to ON_OUTPUT_DAMAGE). Its own 800 is 无来源: the hook sees no
 * source, so it never re-arms the window. One battle-wide pair of hooks; the state per holder (`Map`).
 * @param {Battle} b
 */
function equipHooks(b) {
  const st = stOf(b);
  if (st.wands) return st.wands;
  const wands = st.wands = new Map();
  b.on('skillStart', (c) => { const w = wands.get(c.unit); if (w && c.unit.findBuff(HELD_BUFF[WAND_KEY])) w.armed = true; });
  b.on('damaged', (c) => {
    const u = c.source, t = c.target;
    const w = u && wands.get(u);
    if (!w || c.type === 'element' || !t || t.side !== 'enemy' || !u.findBuff(HELD_BUFF[WAND_KEY])) return;
    if (w.armed) { w.armed = false; w.until = b.time + w.window; } else if (b.time > w.until + 1e-9) return;
    if (t.alive && w.value > 0) b.dealDamage(u, t, { amount: w.value, type: 'arts', canDodge: false, sourceless: true, tags: ['equipWand'] });
    if (t.alive && w.tremble > 0) b.applyStatus(t, 'tremble', { duration: w.tremble, source: u });
  });
  return wands;
}

/**
 * 黄金回响 (trap_185_vtlntw; token prefab in pkgrps/btl_pfb_tokens_1, character_table): an enemy-side device (`_sideType`
 * ENEMY) on the 冲击式施术单元's tile — HP 8000, ATK 425, DEF 150, RES 70; its normal attack every `baseAttackTime` 3.8 s
 * takes one operator of its range `x-1` (engine target order: blocker → taunt → latest deployed = HATRED_DES) for ATK ×1
 * arts (Attack `_damageType` MAGICAL) through projectile_trap_vtlntw. No lifetime: it stays until destroyed (operators can
 * attack it); it never moves and blocks nobody, nor is it blocked. No LP, no kill count (a part). The round's enemy HP / ATK
 * effects do not reach it: the rune `enemy_attribute_mul` (EAttribuesMul) works on an `Enemy` only, and this is a token
 * (`Trap`) — its own numbers (until 2026-10-15 summonMods).
 * @param {WaveDevice} d
 */
function goldenDef(d) {
  const st = d.stats || {};
  return {
    name: d.name || d.key, rank: 'NORMAL', applyWay: 'RANGED', notCountInTotal: true, staticBody: true, spine: d.key,
    stats: { maxHp: st.maxHp, atk: st.atk, def: st.def, res: st.res, bat: st.bat, aspd: st.aspd, moveSpeed: 0, massLevel: st.massLevel,
      motion: 'WALK', lpr: 0, rangeRadius: GOLDEN_RADIUS, dmgType: d.dmgType || 'arts' },
    proj: GOLDEN_SHOT, attackAnim: GOLDEN_ANIM,
  };
}

/** @param {Battle} b @param {Unit} boss @param {WaveDevice} d @param {number[]} pos */
function spawnGolden(b, boss, d, pos) {
  const u = b.spawnEnemy(d.key, { def: goldenDef(d), pos, route: { motion: 'FLY', start: pos, end: pos, steps: [{ t: 'wait', s: 99999 }] },
    tag: 'part', countInTotal: false, ownerPlayerId: boss.ownerId });
  if (u) u.mem.noLeak = true;   // a device: never a leak at the time limit (Battle._timeout)
  return u;
}

/** @returns {AbList} */
function kitGolden() {
  return [{
    spawn(b, e) {
      b.addBuff(e, { key: 'boss:golden', persist: true, flags: { noMove: true, noDisplace: true, unblockable: true } });
      const r0 = Math.round(e.y), c0 = Math.round(e.x);
      // range x-1: the tiles within Manhattan 2 (the radius alone would also take the (1, 2) tiles at 2.24 + collider)
      /** @type {AttackProfile} */ (e.profile).canTarget = (/** @type {Unit} */ a) => Math.abs(a.tileR - r0) + Math.abs(a.tileC - c0) <= 2;
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// “萨米的意志” (boss_7)

/**
 * 【冰凌】 (its normal attack, the client's ProjectileToTileAbility — docs/rules/sim.md 「萨米的意志 冰凌」): the swing takes
 * up to 1 (2 below half HP) targets again at its strike (`_selectTargetTiming` 1) and drops one 冰凌 per distinct column on
 * the stage's TOP tile of the column (SmdeerTileSelector._TryGetTile: row Map.height − 1). projectile_enemy_smdeer then
 * runs DOWN (FarthestPointMovement FIXED_DIRECTION, `_constDirection` DOWN) at its `speed` and, every DEER_DIST tiles from
 * that top tile (SmdeerAttackHitBehaviour._CheckDistanceToEmitProjectile: `dist`, absent from the blackboard → 1),
 * leaves a projectile_enemy_smdeer_2 on the tile — off the stage it stops. Each of those hits, as it ends DEER_SUB_LIFE s
 * later (`_lifeTime` 1; HitBehaviour `_onlyCheckHitWhenStop`), at most one ally within DEER_SUB_RADIUS of the tile centre
 * (CircleCollider2D 0.25, `_maxHitNum` 1) for ATK × `atk_scale_2` (absent → 1) physical — the ally standing there THEN.
 */
const DEER_DIST = 1, DEER_SUB_LIFE = 1, DEER_SUB_RADIUS = 0.25;

/** @param {AbState} ab @param {Unit} e @returns {AbList} */
function kitDeer(ab, e) {
  const dr = T(ab, 'Madness.damage_resistance') ?? 0;
  const atkN = T(ab, 'Madness.enemy_smdeer_mad[attack].max_cnt') ?? 1, skN = T(ab, 'Madness.enemy_smdeer_mad[skill].max_target') ?? 1;
  const lasso = ab.sk.Lasso, doom = ab.sk.Doom;
  const shot = e.def?.proj || null;                    // projectile_enemy_smdeer (data/enemies.json proj)
  const ATK2 = T(ab, 'atk_scale_2') ?? 1;
  const speed = shot && shot.speed > 0 ? shot.speed : 5;
  /** @type {{ low: boolean, acc: number, swing: { left: number } | null, castEnd: number, lassos: Set<{ end: () => void }>, turn?: number }} the kit's state */
  const P = { low: false, acc: Infinity, swing: null, castEnd: -Infinity, lassos: new Set() };   // like engine attacks, the first 冰凌 comes as soon as it has a target
  ab.ownAttack = true;   // 自然涌动 / Doom take the turn of its 冰凌 (ownAttackTurn)
  // the ice of one column: tile k (k tiles below the top row) gets its 冰凌 k·DEER_DIST / speed s after the strike, which
  // hits DEER_SUB_LIFE s after that
  const icicle = (/** @type {Battle} */ b, /** @type {Unit} */ e2, /** @type {number} */ c) => {
    const top = ROWS - 1;
    b.fx('column', { x: c, y: e2.y, c, id: e2.id, key: shot ? shot.key : 'projectile_enemy_smdeer', sub: 'projectile_enemy_smdeer_2', r0: top, dir: [0, -1], speed, dist: DEER_DIST, life: DEER_SUB_LIFE });
    for (let k = 0; top - k * DEER_DIST >= 0; k++) {
      const r = top - k * DEER_DIST;
      b.after(k * DEER_DIST / speed + DEER_SUB_LIFE, () => {
        let best = null, bd = Infinity;
        for (const u of b.allies()) {
          if (!u.alive || !u.deployed || !areaSelectable(e2, u)) continue;   // an area selection: no unblocking 隐匿 operator
          const d = hypot(u.x - c, u.y - r);
          if (d <= DEER_SUB_RADIUS + ALLY_COLLIDER_RADIUS + 1e-9 && (d < bd || (d === bd && best && u.id < best.id))) { best = u; bd = d; }
        }
        // ATK × `atk_scale_2` (ProjectileToTileAbility.CreateAndReplaceDamageNode; no level blackboard names it → 1)
        if (best) b.dealDamage(e2, best, { amount: e2.s.atk * ATK2, type: 'phys', isAttack: true });
      });
    }
  };
  const strike = (/** @type {Battle} */ b, /** @type {Unit} */ e2) => {
    P.swing = null;
    const cands = fairOrder(b, e2, allTargets(b, e2), P);
    if (!cands.length) { P.acc = Infinity; return; }   // nobody at the strike: the cooldown comes back (ai.js, the engine's whiff rule)
    /** @type {number[]} */
    const cols = [];
    for (const t of cands) { if (!cols.includes(t.tileC)) cols.push(t.tileC); if (cols.length >= (P.low ? atkN : 1)) break; }
    for (const c of cols) icicle(b, e2, c);
    e2.lastAttackAt = b.time;
    e2.stats.attacks++;
  };
  return [
    {
      spawn(b, e2) { /** @type {AttackProfile} */ (e2.profile).noAttack = true; },
      tick(b, e2, a, dt) {
        if (!P.low && e2.hpRatio < 0.5) { // <50 %: damage taken reduced, extra targets
          P.low = true;
          b.addBuff(e2, { key: 'boss:madness', persist: true, visible: true, mods: { physTakenMul: 1 - dr, artsTakenMul: 1 - dr } }); // 物理和法术伤害降低
          b.fx('phase', { x: e2.x, y: e2.y, id: e2.id, kind: 'deerMadness' });
        }
        if (P.swing) { // the swing runs to its strike (the Attack clip's OnAttack frame, `_waitForAttackEvent`); the cooldown runs on
          P.acc += dt;
          P.swing.left -= dt;
          if (P.swing.left <= 1e-9) strike(b, e2);
          return;
        }
        if (!canCast(e2, false, b)) return;
        P.acc += dt;
        if (P.acc < e2.s.interval || b.time < P.castEnd - 1e-9 || e2.castLeft > 0) return;
        if (ownAttackTurn(b, e2, P, 'acc', { engineCast: true })) return;   // 自然涌动 casts while its lassos hold
        if (!allTargets(b, e2).length) return;
        P.acc = 0;   // the cooldown restarts as the swing starts (AbilityStandard.CastToTarget)
        const w = attackWindup(e2);
        b._ev(['swing', e2.id, Math.round(w * 1000) / 1000, 'none']);
        P.swing = { left: w };
        if (!(w > 1e-9)) strike(b, e2);
      },
    },
    lasso && {
      // 【自然涌动】 stun + arts per second. 2026-11-14 (공식 클라에서 확인): `Skills/Lasso` is a RangedAttack with
      // `_waitForProjectileInvalid` — one projectile_enemy_smdeer_s per target (a SimpleProjectile attached to it, its life
      // from the blackboard `projectile_life_time`), carrying the ability's buff `enemy_smdeer_lasso_damage` (STUNNED, a hit
      // every 1 s, first after 1 s) for as long as it lives: `_detachAllBuffsWhenStopped` takes the stun and the damage off
      // when it stops — its life over, its target dead or off the field (`_stopIfTargetDead`, `_stopIfTargetDisappeared`),
      // the boss dead (`_stopWhenSourceInvalid`), or the cast cut short (RangedAttack.OnCastEnd clears its projectiles: a
      // stun, freeze or 浮空 on the boss). The cast lasts while a lasso holds (content/enemies.js projCastOver): no 冰凌 and
      // no other skill meanwhile, and the 60 s cooldown restarts as the last lasso ends. Until 2026-11-14 the cast lasted 0
      // (the 冰凌 went on, the cooldown ran from its start) and the stun held its 10 s whatever happened. The lassos leave at
      // the ability's spell, Skill_01_Begin's attack event 1 s in (`atStrike`, content/enemies.js castStrikeAt; until
      // 2026-11-20 as the cast began), none when the cast is cut before it. Their targets are taken as the cast begins (the
      // RangedAttack's `_selectTargetTiming` 0 — UpdateTargets in CastToTarget) and the spell goes to those still alive on
      // the field (DoCastOnTargets: ValidAndAlive); until 2026-11-20 taken again at the spell.
      name: lasso.name, cd: lasso.cd, icd: lasso.icd, cond: (b) => allTargets(b, e).length > 0,
      projAlive: () => P.lassos.size > 0,
      onCut: () => { for (const l of [...P.lassos]) l.end(); },
      fire(b, e2, a) { a.picks = fairOrder(b, e2, allTargets(b, e2), P).slice(0, P.low ? skN : (lasso.bb.max_target ?? 1)); },
      atStrike(b, e2, a) {
        const picks = /** @type {Unit[] | null} */ (a.picks) || [];
        a.picks = null;
        const dur = lasso.bb.projectile_life_time ?? 0;
        if (!(dur > 0)) return;
        for (const t of picks) {
          if (!t.alive || !t.deployed) continue;
          b.fx('beam', { x: e2.x, y: e2.y, from: e2.id, to: t.id, kind: 'naturalSurge', dur });
          b.applyStatus(t, 'stun', { duration: dur, source: e2 });
          const stun = /** @type {Buff[]} */ (t.buffs).find((u) => u.key === 'stun' && u.source === e2) ?? null;
          const surge = b.addBuff(t, { key: 'boss:surge', duration: dur, interval: 1, visible: true,
            onTick: (/** @type {BuffTick} */ { battle, unit }) => battle.dealDamage(e2, unit, { amount: e2.s.atk * (lasso.bb.atk_scale ?? 0), type: 'arts', canDodge: false, ignoreSelect: true, tags: ['enemyAbility'] }) });
          const l = {};
          l.end = () => {
            if (!P.lassos.delete(l)) return;
            watch.cancel(); life.cancel();
            if (b.time < l.until - 1e-9) {   // stopped early: the projectile's buffs come off with it
              if (stun && t.buffs.includes(stun)) b.removeBuff(t, stun);
              if (surge && t.buffs.includes(surge)) b.removeBuff(t, surge);
            }
          };
          l.until = b.time + dur;
          const life = b.after(dur, l.end);
          const watch = b.every(TICK, () => { if (!t.alive || !t.deployed || !e2.alive) l.end(); });
          P.lassos.add(l);
        }
      },
    },
    doom && {
      name: doom.name, cd: doom.cd, icd: doom.icd, atStrike: true,
      fire(b, e2) {
        b.fx('telegraph', { x: e2.x, y: e2.y, r: 99, kind: 'samiDoom', id: e2.id });
        for (const u of fieldAllies(b, e2)) hurt(b, e2, u, e2.s.atk * (doom.bb.atk_scale ?? 0), 'arts');
        lpLoss(b, Math.abs(doom.bb.value ?? 0), 'samiDoom', e2);
      },
    },
  ];
}

/**
 * 量变之械 (规程, a part of 假想敌：械; table 「首次攻击造成的伤害提升」, SILENCE line): its prefab's Talents/FirstAtkDouble
 * gives two buffs (official templates of the season's buff_template_data): acfncb[first-atk-dmg-double] (silenceable) —
 * ON_OUTPUT_DAMAGE: DamageScale × `FirstAtkDouble.damage_scale`, then it finishes — and acfncb[remove-double-buff] (not
 * silenceable) — ON_AFTER_OUTPUT_DAMAGE: finishes the first and itself. So the first damage it deals is doubled, once;
 * dealt while silenced, the bonus is gone unused.
 * @param {AbState} ab @returns {AbList}
 */
function kitFirstDouble(ab) {
  const scale = T(ab, 'FirstAtkDouble.damage_scale') ?? 1;
  return [
    { sil: true, hitOut(c) { if (!ab.firstSpent && c.dmg.amount > 0) c.dmg.amount *= scale; } },
    { dealt() { ab.firstSpent = true; } },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：械 (规程 boss_11 / boss_14 隐秘核心) + 冲击之械 — official CN client prefabs enemy_9029_acfnc(_2) /
// enemy_9027_acfnca and their templates in 规程's buff_template_data (acfnc*, acfnca*), projectiles
// projectile_enemy_acfnc(_2) / projectile_enemy_acfnca

const FNC_PART = 'enemy_9028_acfncb', FNC_ARMOR = 'enemy_9027_acfnca';
/** @param {Unit} o */
const isFncArmor = (o) => o.alive && o.defId === FNC_ARMOR;
/** acfnc[insert-cp]: the part's horizontal direction from the boss (SharedConsts.Direction LEFT = 3) picks the branch. */
const FNC_BRANCH = Object.freeze({ L: 'left_acfncb', R: 'right_acfncb' });
/** The normal attack reaches the whole field (table rangeRadius −1). */
const FNC_FIELD = 99;
/** projectile_enemy_acfnc_2: bounces fly `_speedAfterFirstReach` 4, × `_atkScaleRatePerBounce` 0.8 each. */
const FNC_BOUNCE_SPEED = 4, FNC_BOUNCE_FALLOFF = 0.8;
/**
 * projectile_enemy_acfnca (【威光冲击】's area): a laser from one 冲击之械 to the other — LaserHitBehaviour's box, `_laserWidth`
 * 2.9 wide, from the caster's position to the projectile on the other one (AttachToTarget `_immediatelyReach`), met by an
 * operator's 0.25 collider (ALLY_COLLIDER_RADIUS).
 */
const FNC_LASER_HALF = 2.9 / 2;
/** acfnca[buff_executor] / [fastest_executor] / [falldown-trigger] / [no-char-executor] check every 0.25 / 0.5 s. */
const FNC_FALL_CHECK = 0.25, FNC_AHEAD_CHECK = 0.5;
/**
 * The range boxes of the CN prefabs (PhysicsRange BoxCollider2D, tiles; `dy` rows up, as data `hitArea`): a RANGE-layer box
 * meets the ENEMY / ALLY layers only (the client's Physics2D layer matrix) — an operator's 0.25 collider
 * (ALLY_COLLIDER_RADIUS), a 冲击之械's root box (its data `hitArea` 1 × 2.95). AuraCheck (MoveMode Talents/Falldown, the
 * operators a flying 冲击之械 counts, acfnca[pass-cnt]) 2.95 × 0.9 down 0.5 — its own row and the one below; FalldownImpl's
 * selector (the operator its 砸下 hits, `_maxNum` 1) 2.95 × 1 — its own row; the hidden 械's KillArmorAura (CommonAbilities,
 * SingleIdTargetValidator enemy_9027_acfnca → acfnc[kill-too-close-armor]) 2.95 × 2.95 up 1 — a 冲击之械 born two columns
 * away stays 0.025 clear of it, one pushed back 0.05 meets it.
 */
const FNC_PASS_BOX = Object.freeze({ w: 2.95, h: 0.9, dx: 0, dy: -0.5 });
const FNC_SLAM_BOX = Object.freeze({ w: 2.95, h: 1, dx: 0, dy: 0 });
const FNC_KILL_BOX = Object.freeze({ w: 2.95, h: 2.95, dx: 0, dy: 1 });
/** Does a range box `box` on unit `o` meet operator `u`'s 0.25 collider? @param {Unit} o @param {{ w: number, h: number, dx: number, dy: number }} box @param {Unit} u */
const fncBoxMeets = (o, box, u) => bodyInRadius({ x: o.x, y: o.y, hitArea: box }, u.x, u.y, ALLY_COLLIDER_RADIUS);
/** Does the hidden 械 `boss`'s KillArmorAura box overlap 冲击之械 `o`'s hit box (its data `hitArea`; a point without one)? @param {Unit} boss @param {Unit} o */
function fncKillTouch(boss, o) {
  const A = /** @type {NonNullable<ReturnType<typeof hitRect>>} */ (hitRect({ x: boss.x, y: boss.y, hitArea: FNC_KILL_BOX })), B = hitRect(o) ?? { x0: o.x, x1: o.x, y0: o.y, y1: o.y };
  return A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1;
}
/** Distance from (px, py) to the laser box from (ax, ay) to (bx, by), `half` wide each side (0 inside it). @param {number} px @param {number} py @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} half */
function laserBoxDist(px, py, ax, ay, bx, by, half) {
  const L = hypot(bx - ax, by - ay);
  if (!(L > 1e-9)) return Math.max(0, hypot(px - ax, py - ay) - half);
  const ux = (bx - ax) / L, uy = (by - ay) / L, qx = px - ax, qy = py - ay;
  const t = qx * ux + qy * uy, n = Math.abs(qy * ux - qx * uy);
  return hypot(Math.max(0, -t, t - L), Math.max(0, n - half));
}
// [추정·CN] what the CN client's code decides: the rows HasCharacterInCertainDirection looks along (`_considerLocateRange`, a
// CN-only field — read as the tiles of its EntityLocateRange, which is the root's own colliders: its hit box, rows ± 1), the
// operator its 砸下 hits among those in the selector box (the nearest) and the bounce pick (RANDOM, no radius given: the
// whole field).

/**
 * 假想敌：械. Self-bound (CommonAbilities/Unmovable: UNMOVABLE 束缚 + BLOCK_FREE + UNBALANCE_IMMUNE), it shoots one ground
 * operator anywhere (HATRED_DES, `_targetMotion` 1). Every damage it deals (acfnc_t1, ON_AFTER_OUTPUT_DAMAGE) summons one
 * 量变之械 on the nearest passable tile of the 3×3 (`x-4`) round its target; a part walks to that target's tile first
 * (acfnc[insert-cp] InsertCheckPointInRuntimeRoute, when reachable), then the branch of its side (`left_acfncb` /
 * `right_acfncb`) to the exit. 【洪流攻势】 (SommonSquad — 规程 boss_11: SP 25, boss_14: cooldown 45): the operator with the
 * highest block count (BLOCK_COUNT_DES) and the other player's one (selector 1, `_autoChessFilterType` 1 [추정·CN: read as
 * "another player's"; alone, one target]), each gets a 量变之械 on every passable tile of its four sides (acfnc[skill]).
 * 冲击之械 come from the template branch `acfnca` (two, row 4 beside it) with acfnc[armor]: damage the boss takes from an
 * attacker beyond a 冲击之械 (its grid column on the far side of that 冲击之械, CheckAxisRelativeDirection EQUAL_ALLOW_ZERO
 * negated) × (1 − `Armor.damage_scale`). boss_11 summons them once, at `Armor.hp_ratio` HP (acfnc_t2[summon] every 0.5 s,
 * acfnc[finish_t2]); boss_14 at once (acfnc_t2[summon-immediately]), launches them (LaunchArmor, its WithArmor mode only,
 * cooldown 10 → acfnc[after-launch] back to Default), re-summons them at SP 45 (SkSummonArmor: kills the old ones) and
 * loses them all when one is pushed into it (KillArmorAura); its shot bounces (`attack@hit_times` hits in all, RANDOM next
 * target, the same one if alone, × 0.8 per bounce — projectile_enemy_acfnc_2), each hit summoning a part.
 * @param {AbState} ab @param {Unit} e @param {Battle} b @param {Tpl} tpl @returns {AbList}
 */
function kitMachine(ab, e, b, tpl) {
  const hidden = /_2$/.test(e.defId);
  const cut = T(ab, 'Armor.damage_scale') ?? 0, hpLine = T(ab, 'Armor.hp_ratio');
  const hits = Math.max(1, Math.round(T(ab, 'Summon.attack@hit_times') ?? 1));
  const squad = ab.sk.SommonSquad, launch = ab.sk.LaunchArmor, resummon = ab.sk.SkSummonArmor;
  const gSquad = skillSp(e, squad), gRe = skillSp(e, resummon);
  const P = { armorOn: false, summoned: false, turn: -1 };
  const ground = (/** @type {Battle} */ b2) => allTargets(b2, e).filter((u) => !u.isFlying);
  const mine = (/** @type {Battle} */ b2) => b2.enemies.filter((o) => isFncArmor(o) && o.mem.fnc && o.mem.fnc.host === e);
  const spawnPart = (/** @type {Battle} */ b2, /** @type {Unit | null} */ t, /** @type {number[]} */ tile) => {
    const side = tile[1] < Math.round(e.x) ? 'L' : 'R';
    const br = branchRoute(tpl, FNC_BRANCH[side]);
    const end = br && Array.isArray(br.end) ? br.end : toGoal(b2, tile[1], tile[0]).end;
    const cp = t && b2.grid.walkable(t.tileR, t.tileC) ? [[t.tileR, t.tileC]] : [];
    return b2.spawnEnemy(FNC_PART, { route: { motion: 'WALK', start: tile, end, checkpoints: cp }, pos: tile, countInTotal: false, mods: summonMods(b2, null, FNC_PART) });
  };
  const partNear = (/** @type {Battle} */ b2, /** @type {Unit} */ t) => { // `_summonOnNearestPassableTile` within x-4 (the 3×3) of the target
    let best = null, bd = Infinity;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = t.tileR + dr, c = t.tileC + dc;
      if (!b2.grid.walkable(r, c)) continue;
      const d = hypot(c - t.x, r - t.y);
      if (d < bd - 1e-9) { bd = d; best = [r, c]; }
    }
    if (best) spawnPart(b2, t, best);
  };
  const killArmors = (/** @type {Battle} */ b2) => { for (const o of mine(b2)) b2.kill(o, null); };
  const summonArmor = (/** @type {Battle} */ b2, /** @type {Unit} */ e2, /** @type {boolean} */ kill) => { // acfnc[summon_armor] (kill = EnemyKillToken first) / acfnc_t2[summon-immediately]
    if (kill) killArmors(b2);
    const br = tpl && tpl.branches && tpl.branches.acfnca;
    const phase = Array.isArray(br) && Array.isArray(br[0]) ? br[0] : [];
    const r0 = Math.round(e2.y) + 1, c0 = Math.round(e2.x);
    const list = phase.length ? phase.map((s) => extraRoute(tpl, s.routeIndex)).filter((rt) => rt != null)
      : [{ start: [r0, c0 - 2], end: [r0, b2.rect.c0 + 1] }, { start: [r0, c0 + 2], end: [r0, b2.rect.c1 - 1] }];
    for (const rt of list) {
      const o = b2.spawnEnemy(FNC_ARMOR, { route: { motion: 'FLY', start: rt.start, end: rt.start, checkpoints: [] }, pos: rt.start, countInTotal: false, mods: summonMods(b2, null, FNC_ARMOR) });
      if (!o) continue;
      // acfnca[init]: on the boss's column it kills itself; else is-left / is-right
      if (Math.round(o.x) === c0) { b2.kill(o, null); continue; }
      o.mem.fnc = { host: e2, side: Math.round(o.x) < c0 ? -1 : 1, end: rt.end, state: 'hover' };
    }
    P.armorOn = true;
    enemyMode(b2, e2, 'WithArmor');
    if (launchA) launchA.left = launchA.icd;   // the mode's LaunchArmor attaches anew (`_resetCdWaitFirstPeriod`)
  };
  /** @type {EnemyAbility | null} */
  const launchA = hidden && launch ? {
    name: launch.name, cd: launch.cd, icd: launch.icd, atStrike: true, cond: (/** @type {Battle} */ b2) => P.armorOn && mine(b2).some((o) => o.mem.fnc.state === 'hover'),
    fire(b2, e2) { // acfnc[trigger-armor-launch] on its 冲击之械, then acfnc[after-launch]: Default mode
      for (const o of mine(b2)) if (o.mem.fnc.state === 'hover' && o.mem.ab && o.mem.ab.launch) o.mem.ab.launch(b2, o);
      P.armorOn = false;
      enemyMode(b2, e2, null);
    },
  } : null;
  const bounce = (/** @type {Battle} */ b2, /** @type {Unit} */ e2, /** @type {Unit} */ from, /** @type {number} */ k) => { // the next hop of projectile_enemy_acfnc_2
    if (k >= hits || !e2.alive) return;
    const others = ground(b2).filter((u) => u !== from);
    const nx = others.length ? b2.rng.pick(others) : (from.alive ? from : null);
    if (!nx) return;
    shoot(b2, from, nx, { key: 'projectile_enemy_acfnc_2', move: 'TRACE_TARGET_WITH_SPEED', speed: FNC_BOUNCE_SPEED, delay: 0 }, (/** @type {Unit | null} */ t) => {
      if (!t || !t.alive || !e2.alive) return;   // `_dontHitWhenTargetDead`
      b2.dealDamage(e2, t, { amount: e2.s.atk * powi(FNC_BOUNCE_FALLOFF, k), type: 'phys', isAttack: true, tags: ['fncBounce'] });
      bounce(b2, e2, t, k + 1);
    }, { source: e2 });
  };
  return [
    {
      spawn(b2, e2) {
        b2.addBuff(e2, { key: 'boss:selfBound', persist: true, flags: { bind: true, noMove: true, unblockable: true, noDisplace: true } });
        e2.base.rangeRadius = FNC_FIELD;
        if (hidden) summonArmor(b2, e2, false);
      },
      before(c, b2, e2) { const l = fairOrder(b2, e2, ground(b2), P); if (l.length) c.targets = [l[0]]; },
      dealt(c, b2, e2) {
        const t = c.target;
        if (!t) return;
        if (c.amount > 0) partNear(b2, t);
        if (hidden && !(/** @type {DamageRec} */ (c.dmg).tags || []).includes('fncBounce')) bounce(b2, e2, t, 1);
      },
      hitIn(c, b2) { // acfnc[armor-damage-scale], one per 冲击之械
        const s = c.source;
        if (!s || !(cut > 0) || c.dmg.type === 'element') return;
        const sc = Math.round(s.x);
        for (const o of mine(b2)) if (Math.sign(sc - Math.round(o.x)) === o.mem.fnc.side) c.dmg.mul *= 1 - cut;
      },
    },
    !hidden && hpLine != null && {
      iv: 0.5,
      tick(b2, e2) { // acfnc_t2[summon]: HP ≤ `Armor.hp_ratio` → SummonArmor, once (acfnc[finish_t2])
        if (P.summoned || !(e2.hpRatio <= hpLine + 1e-9)) return;
        P.summoned = true;
        summonArmor(b2, e2, true);
      },
    },
    squad && {
      name: squad.name, cd: squad.cd, icd: squad.icd,
      cond: (b2) => (!gSquad || gSquad.ready()) && ground(b2).some((u) => u.kind === 'op'),
      fire(b2, e2) { // 【洪流攻势】
        if (gSquad) gSquad.spend(e2);
        // its operators are taken as the cast begins (SommonSquad's `_selectTargetTiming` 0 — UpdateTargets in CastToTarget) and
        // the squads come at the spell round those still alive on the field (BuffToCastTargets on the cast's targets); until
        // 2026-11-20 taken again at the spell
        const ops = byPriority(e2, ground(b2).filter((u) => u.kind === 'op')).sort((p, q) => (q.s.blockCnt || 0) - (p.s.blockCnt || 0));
        const first = ops[0];
        const picks = first ? [first] : [];
        const second = first && ops.find((u) => u.ownerId !== first.ownerId);
        if (second) picks.push(second);
        atSpell(b2, e2, squad, () => {
          for (const t of picks.slice(0, squad.bb.batch_max_target ?? 2)) {
            if (!t.alive || !t.deployed) continue;
            let n = 0;
            for (const [dr, dc] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
              if (n >= (squad.bb.cnt ?? 4)) break;
              const r = t.tileR + dr, c = t.tileC + dc;
              if (b2.grid.walkable(r, c) && spawnPart(b2, t, [r, c])) n++;
            }
            b2.fx('summon', { x: t.x, y: t.y, id: e2.id, tgt: t.id, kind: 'acfncSquad' });
          }
        });
        return picks;   // the cast's targets ('enemySkill' tgt / tgts): its `_castTargetEffects` enemy_acfnc_skill_01_locked_01 on each
      },
    },
    launchA,
    hidden && resummon && {
      name: resummon.name, cd: resummon.cd, icd: resummon.icd, cond: () => !gRe || gRe.ready(),
      fire(b2, e2) { if (gRe) gRe.spend(e2); atSpell(b2, e2, resummon, () => summonArmor(b2, e2, true)); },   // 【衰颓与复兴】 (A_Skill_2 has no event: its end)
    },
    hidden && {
      tick(b2, e2) { // KillArmorAura: a 冲击之械 whose hit box meets its box → every 冲击之械 goes, the boss back to Default
        if (!mine(b2).some((o) => fncKillTouch(e2, o))) return;
        killArmors(b2);
        P.armorOn = false;
        enemyMode(b2, e2, null);
      },
    },
    gSquad && gSquad.ab, gRe && gRe.ab,
  ];
}

/**
 * 冲击之械 (no attack; CommonAbilities/Ability0: invincible + UNMOVABLE_PRIVATE + BLOCK_FREE / UNBALANCE_IMMUNE). Only a
 * hidden 械's LaunchArmor launches it ("未释放【威光冲击】时无法被攻击"): Launch → MoveMode (move speed × `MoveSpeed.move_speed`,
 * FINAL_SCALER) along its branch route outward. AuraCheck counts each operator it passes (acfnca[pass-cnt], a stack on it
 * that leaves when that operator does); it comes down (FalldownImpl, ATK × `atk_scale` phys on one operator) where the
 * `Falldown.max_valid_stack_cnt`-th was counted, else past the last operator ahead (acfnca[no-char-executor]), else at its
 * route's end (IsEnemyReached). Down (AfterFalldown) it can be hit, and every `Init.damage_threshold` damage it takes moves it
 * `Init.move_step` back toward the boss (at most `Init.max_offset_per_second`); its Bound casts projectile_enemy_acfnca once
 * at the other 冲击之械 — a laser following it, operators inside get ATTACK_SPEED + `Bound.attack_speed`.
 * @param {AbState} ab @param {Unit} e @returns {AbList}
 */
function kitArmor(ab, e) {
  const fallN = T(ab, 'Falldown.max_valid_stack_cnt') ?? 5, speed = T(ab, 'MoveSpeed.move_speed') ?? 1;
  const thr = T(ab, 'Init.damage_threshold') ?? Infinity, step = T(ab, 'Init.move_step') ?? 0, cap = T(ab, 'Init.max_offset_per_second') ?? 0;
  const slam = ab.sk.FalldownImpl, bound = ab.sk.Bound;
  const F = () => e.mem.fnc || { side: 1, state: 'hover' };
  /** @type {{ passed: Set<Unit>, triggerX: number | null, aheadCheck: number, fallCheck: number, sawAhead: boolean, acc: number, pending: number, laser: Unit | null }} the kit's state */
  const P = { passed: new Set(), triggerX: null, aheadCheck: 0, fallCheck: 0, sawAhead: false, acc: 0, pending: 0, laser: null };
  const ops = (/** @type {Battle} */ b2) => b2.allies().filter((u) => u.alive && u.deployed && u.kind === 'op');
  const ahead = (/** @type {Battle} */ b2, /** @type {boolean} */ self) => { // HasCharacterInCertainDirection: an operator further along its way on the rows of its hit box (its own column with `_includeSelfPos`)
    const c = Math.round(e.x), s = F().side, R = hitRect(e);
    const onRows = (/** @type {Unit} */ u) => (R ? u.tileR + 0.5 > R.y0 && u.tileR - 0.5 < R.y1 : u.tileR === Math.round(e.y));
    return ops(b2).some((u) => onRows(u) && (self ? (u.tileC - c) * s >= 0 : (u.tileC - c) * s > 0));
  };
  const fall = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => { // FalldownImpl
    const f = F();
    f.state = 'down';
    b2.removeBuff(e2, 'boss:hover');
    b2.removeBuff(e2, 'boss:armorFly');
    enemyMode(b2, e2, 'AfterFalldown');
    let best = null, bd = Infinity;
    for (const u of b2.allies()) {
      if (!u.alive || !u.deployed || !areaSelectable(e2, u) || !fncBoxMeets(e2, FNC_SLAM_BOX, u)) continue;
      const d = hypot(u.x - e2.x, u.y - e2.y);
      if (d < bd) { bd = d; best = u; }
    }
    b2.fx('explode', { x: e2.x, y: e2.y, r: 0.6, kind: 'acfncaFall', id: e2.id });
    if (best && slam) hurt(b2, e2, best, e2.s.atk * (slam.bb.atk_scale ?? 1), 'phys', { tags: ['acfncaFall'] });
    // Bound: at the other 冲击之械 that has no laser yet (acfnca[casted-proj] on both ends)
    const other = b2.enemies.find((o) => isFncArmor(o) && o !== e2 && o.mem.fnc && o.mem.fnc.host === f.host && !o.mem.fnc.lasered);
    if (other && !f.lasered) { f.lasered = true; other.mem.fnc.lasered = true; P.laser = other; }
  };
  ab.launch = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => { // Launch → MoveMode
    const f = F();
    f.state = 'fly';
    enemyMode(b2, e2, 'MoveMode');
    b2.addBuff(e2, { key: 'boss:armorFly', persist: true, mods: { moveMul: speed } });
    b2.fx('charge', { x: e2.x, y: e2.y, id: e2.id, tx: f.end ? f.end[1] : e2.x, ty: f.end ? f.end[0] : e2.y, kind: 'acfncaLaunch' });
  };
  return [
    {
      spawn(b2, e2) {
        b2.addBuff(e2, { key: 'boss:hover', persist: true, visible: true, flags: { invulnerable: true, untargetable: true } });
        b2.addBuff(e2, { key: 'boss:anchor', persist: true, flags: { noMove: true, selfBound: true, unblockable: true, noDisplace: true } });
        /** @type {AttackProfile} */ (e2.profile).noAttack = true;
      },
      taken(c) { // SetTakeDamageMoveBackEnemyParam
        if (!(c.amount > 0) || !(thr > 0) || F().state !== 'down') return;
        P.acc += c.amount;
        while (P.acc >= thr) { P.acc -= thr; P.pending += step; }
      },
      tick(b2, e2, a, dt) {
        const f = F();
        if (f.state === 'fly' && canCast(e2, false, b2)) {
          for (const u of ops(b2)) if (fncBoxMeets(e2, FNC_PASS_BOX, u)) P.passed.add(u);   // AuraCheck, once per operator
          for (const u of [...P.passed]) if (!u.alive || !u.deployed) P.passed.delete(u);   // its pass-cnt finishes with it
          const to = f.end || [Math.round(e2.y), e2.x];
          const reached = stepToward(e2, to[1], e2.y, e2.s.moveSpeed * MOVE_SCALE * dt);
          if ((P.fallCheck += dt) >= FNC_FALL_CHECK - 1e-9) {
            P.fallCheck = 0;
            if (P.triggerX == null && P.passed.size >= fallN) P.triggerX = Math.round(e2.x);   // buff_executor: its root tile
          }
          if ((P.aheadCheck += dt) >= FNC_AHEAD_CHECK - 1e-9) {
            P.aheadCheck = 0;
            if (!P.sawAhead) { if (ahead(b2, true)) P.sawAhead = true; }   // fastest_executor
            else if (P.triggerX == null && !ahead(b2, false)) P.triggerX = Math.round(e2.x);   // no-char-executor
          }
          if (P.triggerX != null && (e2.x - P.triggerX) * f.side >= -1e-9) fall(b2, e2);       // falldown-trigger
          else if (reached) fall(b2, e2);                                                     // IsEnemyReached
          return;
        }
        if (f.state !== 'down') return;
        if (P.pending > 0 && f.host && f.host.alive) { // moves back toward the boss
          const d = Math.min(P.pending, cap * dt);
          P.pending -= d;
          e2.x -= f.side * Math.min(d, Math.max(0, (e2.x - f.host.x) * f.side));
        }
        const o = P.laser;
        if (!o) return;
        if (!o.alive || !isFncArmor(o)) { P.laser = null; return; }   // `_stopIfTargetDead`
        for (const u of b2.allies()) {
          if (!u.alive || !u.deployed || !areaSelectable(e2, u) || laserBoxDist(u.x, u.y, e2.x, e2.y, o.x, o.y, FNC_LASER_HALF) > ALLY_COLLIDER_RADIUS + 1e-9) continue;
          b2.addBuff(u, { key: 'boss:acfncaArea', duration: 0.15, refresh: 'replace', visible: true, mods: { aspd: bound ? bound.bb.attack_speed ?? 0 : 0 } });
        }
        if ((/** @type {number | undefined} */ (a.linkAt) ?? -Infinity) <= b2.time - 1 + 1e-9) { a.linkAt = b2.time; b2.fx('link', { x: e2.x, y: e2.y, from: e2.id, to: o.id, kind: 'acfncaLaser', dur: 1 }); }
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：茧 (规程 boss_12 / boss_15 隐秘核心) + 淤困之茧 — official CN client prefabs enemy_9035_acspider(_2) /
// enemy_9036_acweb and their templates in 规程's buff_template_data (acspider*, acspdier[evade], acweb*), projectiles
// projectile_enemy_acspider(_2) / projectile_enemy_acspider_web

const WEB_KEY = 'enemy_9036_acweb';
/** projectile_enemy_acspider_web: TRACE_TARGET_WITH_SPEED (`_moveType` 1) at `_speed` 10 — as the normal attack's two shots. */
const WEB_SHOT = Object.freeze({ key: 'projectile_enemy_acspider_web', move: 'TRACE_TARGET_WITH_SPEED', speed: 10, delay: 0 });
/** The normal attack reaches the whole field (table rangeRadius −1). */
const SPIDER_FIELD = 99;
/** acspider[sk-poison-area]: the tile listener's buff triggers every `triggerInterval` 0.5 s (its damage: the skill's `interval`). */
const RAIN_TICK = 0.5;

/**
 * The players' fields, the leader's own first: a selector without `_autoChessFilterType` takes the leader's own field, one
 * with `_autoChessFilterType` 1 another player's [추정·CN: the field is CN-only, as 假想敌：械's — read as the field the leader
 * stands on and the other one; alone, one field]. A unit's field is its owner's (`ownerId`, the half it was deployed on).
 */
/**
 * The tiles 【悲惨之雨】 is drawn on, [r0, r1, c0, c1]: field `pid`'s board rows (a boss field's rows 2–5 — not its hand /
 * 临时整备区 rows) across that player's half of the battle field (Battle._ownerForTile; the whole width alone). [추정·CN: the
 * official tile listener's selector (AutoChessAdvancedSelector) is CN-only — the whole field, as the sim reads the rain
 * (docs/rules/sim.md 「규정 적·보스」); maintainer decision 2026-11-11] null when the player is not on this field.
 * @param {Battle} b @param {string} pid
 */
function rainTiles(b, pid) {
  const ps = b.players.find((p) => p.playerId === pid);
  const R = b.rect;
  if (!ps || !R) return null;
  const ra = b._boardTile(ps, GEO.FIELD.r0, GEO.FIELD.c0)[0], rb = b._boardTile(ps, GEO.FIELD.r1, GEO.FIELD.c0)[0];
  const r0 = Math.max(R.r0, Math.min(ra, rb)), r1 = Math.min(R.r1, Math.max(ra, rb));
  let c0 = null, c1 = null;
  for (let c = R.c0; c <= R.c1; c++) {
    if (b._ownerForTile([r0, c]) !== pid) continue;
    if (c0 == null) c0 = c;
    c1 = c;
  }
  return c0 == null || r1 < r0 ? null : [r0, r1, c0, c1];
}

/** @param {Battle} b @param {Unit} e */
function spiderFields(b, e) {
  const ids = b.players.map((p) => p.playerId);
  const own = ids.includes(e.ownerId) ? e.ownerId : ids[0];
  return own == null ? [] : [own, ...ids.filter((id) => id !== own)];
}

/**
 * 假想敌：茧. UNMOVABLE_PRIVATE + BLOCK_FREE + UNBALANCE_IMMUNE (Talents/Passive `acspider[passive]`): it never walks its
 * route. Normal attack (Modes/Default Attack): on every field the `Passive.attack@max_target` ground units with the most
 * current HP (selector `_postFilter` HP_DES 15, two selectors — its own field and the other player's, `batch_max_target` in
 * all), one shot each (projectile_enemy_acspider TRACE 10); boss_15's shot (projectile_enemy_acspider_2) adds
 * acspider[poison]: `Poison.attack@damage` 真实 per second for `Poison.attack@duration` s (FixedValueDamage PURE, credited
 * to it). Talents/Evade (acspider[evade-ticker], checked on every damage taken and every 1 s): each time its HP falls below
 * the next `Evade.hp_ratio` step of its max HP (75 / 50 / 25 %), `Evade.duration` s of 伪装 — acspdier[evade]: Evade of
 * physical and arts damage (`PHYSICAL_AND_MAGICAL`) at `Evade.prob`. 【淤困捕食】 (Skills/Net, its cooldown, `_ignoreSilence`):
 * `max_target` random operators (`_postFilter` RANDOM 14, `_professionMask` 639 — no summon or device) on the ground of each
 * field (`batch_max_target` in all) each take a web shot (projectile_enemy_acspider_web) that summons a 淤困之茧 on their own
 * tile (acspider[summon] SummonEnemyWithRuntimeRoute, not the nearest passable tile). boss_15's 【悲惨之雨】 (Skills/AcidRain,
 * its two sub-abilities taken in turn, `_selectAbilitySequentially`: Left = a ground unit of its own field, Right = one of the
 * other player's, `_allowNoTarget`): `duration` s of acid rain on that unit's field — every unit there (any motion,
 * `ignoreTargetFree`) has ATTACK_SPEED + `attack_speed` and takes `damage` 真实 every 0.5 s while it stays (TileListener with
 * acspider[sk-poison-area]). [추정·CN: the rain's tiles are not in the prefab (CN-only tile listener) — read with the
 * handbook's "覆盖一片场地" as the target's whole field; a Right turn without another player rains nowhere].
 * @param {AbState} ab @param {Unit} e @returns {AbList}
 */
function kitSpider(ab, e) {
  const hidden = /_2$/.test(e.defId);
  const maxT = Math.max(1, Math.round(T(ab, 'Passive.attack@max_target') ?? 1));
  const batch = Math.max(maxT, Math.round(T(ab, 'Passive.attack@batch_max_target') ?? maxT));
  const poisonDmg = T(ab, 'Poison.attack@damage') ?? 0, poisonDur = T(ab, 'Poison.attack@duration') ?? 0;
  const step = T(ab, 'Evade.hp_ratio') ?? 0, prob = T(ab, 'Evade.prob') ?? 0, evadeDur = T(ab, 'Evade.duration') ?? 0;
  const net = ab.sk.Net, rain = hidden ? ab.sk.AcidRain : null;
  const P = { evadeAt: 1 - step, rainTurn: 0 };
  const ground = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => allTargets(b2, e2).filter((u) => !u.isFlying);
  const evadeCheck = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => { // acspider[evade-ticker]: one step per check (the next one waits for the next check)
    if (!(step > 0) || !(P.evadeAt > 1e-9) || !(e2.hpRatio < P.evadeAt - 1e-9)) return;
    P.evadeAt = Math.max(0, P.evadeAt - step);
    b2.addBuff(e2, { key: 'boss:acspiderEvade', duration: evadeDur, refresh: 'replace', visible: true, mods: { dodgePhys: prob, dodgeArts: prob }, fxTag: 'buff:acspdier[evade]' });
    b2.fx('phase', { x: e2.x, y: e2.y, id: e2.id, kind: 'acspiderEvade', dur: evadeDur });
  };
  const netTargets = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => { // RANDOM per field, `max_target` each, `batch_max_target` in all
    const per = Math.max(1, Math.round(net.bb.max_target ?? 1)), cap = Math.max(per, Math.round(net.bb.batch_max_target ?? per));
    const ops = ground(b2, e2).filter((u) => u.kind === 'op');
    const out = [];
    for (const pid of spiderFields(b2, e2)) {
      const pool = ops.filter((u) => u.ownerId === pid);
      for (let k = 0; k < per && pool.length && out.length < cap; k++) out.push(pool.splice(Math.floor(b2.rng() * pool.length), 1)[0]);
    }
    return out;
  };
  const rainOn = (/** @type {Battle} */ b2, /** @type {Unit} */ e2, /** @type {string} */ pid) => { // 【悲惨之雨】 on field `pid`
    const dur = /** @type {AbSkill} */ (rain).bb.duration ?? 0, dmg = /** @type {AbSkill} */ (rain).bb.damage ?? 0, aspd = /** @type {AbSkill} */ (rain).bb.attack_speed ?? 0;
    const inField = () => b2.allies().filter((u) => u.alive && u.deployed && !u.hidden && u.ownerId === pid);
    // `tiles` [r0, r1, c0, c1]: the tiles the rain is drawn on — that player's part of the field (render/fxgame.js acBossFx)
    b2.fx('zone', { x: e2.x, y: e2.y, r: 0, dur, kind: 'acspiderRain', field: pid, id: e2.id, ability: /** @type {AbSkill} */ (rain).name, tiles: rainTiles(b2, pid) });
    let left = dur;
    const h = b2.every(RAIN_TICK, () => {
      left -= RAIN_TICK;
      if (!e2.alive || left < -1e-6) { h.cancel(); return; }   // the ability's buffs go with it (`_clearBuffWhenAbilityDetached`)
      for (const u of inField()) {
        b2.addBuff(u, { key: 'boss:acspiderRain', duration: RAIN_TICK + TICK, refresh: 'replace', visible: true, mods: { aspd } });
        if (dmg > 0) b2.dealDamage(e2, u, { amount: dmg, type: 'true', canDodge: false, ignoreSelect: true, tags: ['enemyAbility', 'acspiderRain'] });
      }
      if (left <= 1e-6) h.cancel();
    });
  };
  return [
    {
      spawn(b2, e2) {
        b2.addBuff(e2, { key: 'boss:selfBound', persist: true, flags: { noMove: true, selfBound: true, unblockable: true, noDisplace: true } });
        e2.base.rangeRadius = SPIDER_FIELD;
        /** @type {AttackProfile} */ (e2.profile).maxTargets = batch;
      },
      before(c, b2, e2) { // HP_DES on every field
        const all = byPriority(e2, ground(b2, e2));
        const picks = [];
        for (const pid of spiderFields(b2, e2)) picks.push(...all.filter((u) => u.ownerId === pid).sort((p, q) => q.hp - p.hp).slice(0, maxT));
        c.targets = picks.slice(0, batch);
      },
      dealt(c, b2, e2) { // boss_15: acspider[poison]
        const t = c.target;
        if (!hidden || !t || !t.alive || !(poisonDmg > 0) || !(poisonDur > 0)) return;
        b2.addBuff(t, { key: 'boss:acspiderPoison', duration: poisonDur, refresh: 'replace', interval: 1, visible: true,
          onTick: (/** @type {BuffTick} */ { battle, unit }) => { if (e2.alive) battle.dealDamage(e2, unit, { amount: poisonDmg, type: 'true', canDodge: false, ignoreSelect: true, tags: ['enemyAbility', 'acspiderPoison'] }); } });
      },
      taken(c, b2, e2) { evadeCheck(b2, e2); },
    },
    { iv: 1, tick(b2, e2) { evadeCheck(b2, e2); } },
    net && {
      name: net.name, cd: net.cd, icd: net.icd, atStrike: true,
      cond: (b2, e2) => ground(b2, e2).some((u) => u.kind === 'op'),
      fire(b2, e2) { // 【淤困捕食】
        for (const t of netTargets(b2, e2)) {
          shoot(b2, e2, t, WEB_SHOT, (/** @type {Unit | null} */ t2) => {
            if (!t2 || !t2.alive || !t2.deployed) return;
            const tile = [t2.tileR, t2.tileC];
            const w = b2.spawnEnemy(WEB_KEY, { route: { motion: 'WALK', start: tile, end: tile, checkpoints: [] }, pos: tile, countInTotal: false, mods: summonMods(b2, null, WEB_KEY) });
            if (w) { w.mem.web = { host: e2, hidden }; b2.fx('summon', { x: w.x, y: w.y, id: e2.id, key: WEB_KEY, tgt: t2.id }); }
          }, { source: e2 });
        }
      },
    },
    rain && {
      name: rain.name, cd: rain.cd, icd: rain.icd,
      // 【悲惨之雨】: Left, then Right, in turn — the group takes its next branch as it is cast (AbilitySelectableGroup
      // `_selectAbilitySequentially`), and the branch's tiles are taken then too (a CastOnTileAbility: UpdateTargets in
      // CastToTarget, `_selectTargetTiming` 0); the rain falls at Skill_2's frame on them whatever became of the unit
      // that was found (공식 클라에서 확인 — prefab `Skills/AcidRain/Left`·`Right`; until 2026-11-21 the turn and the field's
      // ground unit were taken at the spell, a cut cast keeping the turn)
      fire(b2, e2, a) {
        const fields = spiderFields(b2, e2);
        const pid = P.rainTurn++ % 2 === 0 ? fields[0] : fields[1];
        a.rainAt = pid != null && ground(b2, e2).some((u) => u.ownerId === pid) ? pid : null;
      },
      atStrike(b2, e2, a) {
        const pid = /** @type {string | null} */ (a.rainAt);
        a.rainAt = null;
        if (pid != null) rainOn(b2, e2, pid);
      },
    },
  ];
}

/**
 * 淤困之茧 (no attack; Ability0: UNBALANCE_IMMUNE, LEVITATE immune; the table: 无法移动，无法被传送, taunt level 1 — "更容易受到
 * 我方单位攻击"). Talents/Bundling: every operator on its tile (`professionMask` 639) is bound — acweb[bundling] with
 * BLOCK_FREE + FORCE_DISARMED + SKILL_NOT_ACTIVATABLE (no block, no attack, no skill start), taken off when that operator
 * leaves the tile (`_removeBuffWhenTargetLeave`) or the web goes (`_removeBuffWhenAbilityDetached`); the operator dying or
 * leaving the field kills the web (ON_OWNER_FINISH → InstantKill of its source). It lives `Bundling.duration` s
 * (acweb[existing] → InstantKill) and loses `Bundling.hp_ratio` of its max HP every 1 s (acweb[bleeding], DamageViaMaxHpRatio
 * PURE on itself, no source).
 * @param {AbState} ab @returns {AbList}
 */
function kitWeb(ab) {
  const life = T(ab, 'Bundling.duration') ?? Infinity, bleed = T(ab, 'Bundling.hp_ratio') ?? 0;
  /** @type {{ left: number, bleedAcc: number, bound: Map<Unit, Buff>, r?: number, c?: number }} the kit's state */
  const P = { left: life, bleedAcc: 0, bound: new Map() };
  const release = (/** @type {Battle} */ b2) => { for (const [u, buff] of P.bound) b2.removeBuff(u, buff); P.bound.clear(); };
  return [
    {
      spawn(b2, e2) {
        b2.addBuff(e2, { key: 'boss:anchor', persist: true, flags: { noMove: true, selfBound: true, noDisplace: true } });
        /** @type {AttackProfile} */ (e2.profile).noAttack = true;
        P.r = Math.round(e2.y); P.c = Math.round(e2.x);
      },
      tick(b2, e2, a, dt) {
        for (const [u, buff] of [...P.bound]) {
          if (!u.alive || !u.deployed) { P.bound.delete(u); release(b2); b2.kill(e2, null); return; }   // ON_OWNER_FINISH
          if (u.tileR !== P.r || u.tileC !== P.c) { b2.removeBuff(u, buff); P.bound.delete(u); }      // left its tile
        }
        for (const u of b2.allies()) {
          if (!u.alive || !u.deployed || u.hidden || u.kind !== 'op' || P.bound.has(u) || u.tileR !== P.r || u.tileC !== P.c) continue;
          // (the web on the operator is the web's own acweb[vfx], which acweb[bundling] creates there: `source` + `fxTag`)
          const buff = b2.addBuff(u, { key: 'boss:acweb', persist: true, refresh: 'independent', visible: true, flags: { noBlock: true, disarm: true, skillLock: true },
            source: e2, fxTag: 'buff:acweb[vfx]' });
          if (buff) P.bound.set(u, buff);
        }
        if (bleed > 0 && (P.bleedAcc += dt) >= 1 - 1e-9) {
          P.bleedAcc -= 1;
          // (silent: acweb[bleeding]'s DamageViaMaxHpRatio creates no effect — docs/rules/fx.md 「효과 없는 주기적 유실」)
          b2.loseHp(e2, e2.s.maxHp * bleed, { silent: true, sourceless: true, tags: ['acwebBleed'] });
          if (!e2.alive) return;
        }
        if ((P.left -= dt) <= 1e-9) b2.kill(e2, null);   // acweb[existing]
      },
      death(c, b2) { release(b2); },
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：鳍 (规程 boss_13 / boss_16 隐秘核心) — official CN client prefabs enemy_9037_aceel(_2), its templates in 规程's
// buff_template_data (aceel*), projectiles projectile_enemy_aceel / _pwratk / _thurder

/** aceel[shield-provider]: `triggerInterval` 0.1 s — how often an unshielded, unblocked 鳍 raises its shield (ShieldGen). */
const EEL_SHIELD_CHECK = 0.1;
/** aceel[thurder-trigger] (Talents/Weather/PassiveTrigger): `triggerInterval` 10 s, the first after 10 s (`waitFirstTriggerInterval`). */
const EEL_THUNDER_EVERY = 10;

/**
 * 假想敌：鳍 (MELEE: it hits its blocker only; arts, `Passive.attack@ep_damage_ratio` of ATK as 神经损伤 on every attack).
 * Talents/BlockedListener (aceel[shield-provider], every 0.1 s): unblocked (not in its COMBAT state) and unshielded, it casts
 * ShieldGen — aceel[shield]: physical and arts damage taken × (1 − `damage_resistance`) (FilterDamageModifer by damage type
 * only, DamageScale `_isOneMinus`). Blocked (aceel[shield] ON_BUFF_START / ON_OWNER_BLOCKEE_CHANGED → CheckBlocked), the
 * shield goes and aceel[power-atk] comes: its next attack (PowerAtk, `_castLikeAttack`) deals × `damage_scale`, then it ends
 * (ON_AFTER_ATTACK). 【离子环波】 (Skills/Discharge, its cooldown): arts ATK × `atk_scale` + `ep_damage_ratio` 神经损伤 on every
 * ground unit within `range_radius` [추정·CN: the range shape's centre is not in the prefab — read as the 鳍 itself, "对范围内
 * 所有我方单位"]. boss_16 adds Talents/Charge: every attack puts one aceel[atk-stack] (at most `Charge.max_stack_cnt`) on the
 * unit it hit (MAIN_TARGET), and its shots (projectile_enemy_aceel / _pwratk) deal × (1 + `Charge.atk` × that unit's stacks)
 * (aceel[self-stack] AtkScaleUp) and jump on from it to `chain.max_target` more ground units, plus `extra_per_stack` per
 * `stack_per_extra` stacks (the projectile selector's `_maxTargetModifier`), each within `projectile_range` of the last one
 * hit, each jump × `chain.atk_scale` again; and Talents/Weather — 雷暴: every 10 s a thunderbolt (projectile_enemy_aceel_thurder)
 * on the operator of its field standing with the most units in its 3×3 (Selector0: the tile weight of its own tile and the
 * eight round it, random among the best), arts ATK × `Weather.atk_scale` + `Weather.ep_damage_ratio` 神经损伤.
 * [추정·CN: the stack comes once per attack (`_onlyApplyOnFirstSpell`), its count read before the hit for the shot and after
 * it for the jumps; each jump × `chain.atk_scale` once more than the last; Selector1's `_autoChessFilterType` 3 read as its
 * own field — the two players each have a 鳍 (`boss_battle_multi_player`)]
 * @param {AbState} ab @param {Unit} e @returns {AbList}
 */
function kitEel(ab, e) {
  const hidden = /_2$/.test(e.defId);
  const shieldSk = ab.sk.ShieldGen, dis = ab.sk.Discharge;
  const resist = shieldSk ? shieldSk.bb.damage_resistance ?? 0 : 0, powerScale = shieldSk ? shieldSk.bb.damage_scale ?? 1 : 1;
  const ep = T(ab, 'Passive.attack@ep_damage_ratio') ?? 0;
  const jumpScale = T(ab, 'Charge.attack@chain.atk_scale') ?? 1, jumps = T(ab, 'Charge.attack@chain.max_target') ?? 0;
  const perStack = T(ab, 'Charge.attack@selector.stack_per_extra') ?? 1, extraPer = T(ab, 'Charge.attack@selector.extra_per_stack') ?? 0;
  const maxStack = T(ab, 'Charge.max_stack_cnt') ?? 0, stackAtk = T(ab, 'Charge.atk') ?? 0, jumpR = T(ab, 'Passive.attack@projectile_range') ?? 0;
  const wAtk = T(ab, 'Weather.atk_scale') ?? 1, wEp = T(ab, 'Weather.ep_damage_ratio') ?? 0;
  /** @type {{ shield: boolean, power: boolean, acc: number, stacks: Map<Unit, number>, chainMain: Unit | null, thunderAcc: number }} the kit's state */
  const P = { shield: false, power: false, acc: 0, stacks: new Map(), chainMain: null, thunderAcc: 0 };
  const stacksOf = (/** @type {Unit | null} */ u) => (u && P.stacks.get(u)) || 0;
  const ground = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => allTargets(b2, e2).filter((u) => !u.isFlying);
  const setShield = (/** @type {Battle} */ b2, /** @type {Unit} */ e2, /** @type {boolean} */ on) => {
    P.shield = on;
    if (on) b2.addBuff(e2, { key: 'boss:aceelShield', persist: true, visible: true, fxTag: 'buff:aceel[shield]' });
    else b2.removeBuff(e2, 'boss:aceelShield');
    b2.fx('phase', { x: e2.x, y: e2.y, id: e2.id, kind: on ? 'aceelShield' : 'aceelShieldEnd' });
  };
  const setPower = (/** @type {Battle} */ b2, /** @type {Unit} */ e2, /** @type {boolean} */ on) => {
    P.power = on;
    if (on) b2.addBuff(e2, { key: 'boss:aceelPower', persist: true, visible: true, fxTag: 'buff:aceel[power-atk]' });
    else b2.removeBuff(e2, 'boss:aceelPower');
  };
  const chain = (/** @type {Battle} */ b2, /** @type {Unit} */ e2, /** @type {Unit} */ main) => { // projectile_enemy_aceel's jumps from `main`
    const n = Math.max(0, Math.round(jumps + Math.floor(stacksOf(main) / Math.max(1, perStack)) * extraPer));
    const hit = new Set([main]);
    let from = main, scale = 1;
    P.chainMain = main;
    for (let k = 0; k < n && e2.alive; k++) {
      let best = null, bd = Infinity;
      for (const u of ground(b2, e2)) {
        if (hit.has(u)) continue;
        const d = hypot(u.x - from.x, u.y - from.y);
        if (d <= jumpR + ALLY_COLLIDER_RADIUS + 1e-9 && (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && best && u.id < best.id))) { best = u; bd = d; }
      }
      if (!best) break;
      scale *= jumpScale;
      hit.add(best);
      // `key`: the shot that jumps (the strong attack's projectile_enemy_aceel_pwratk while aceel[power-atk] is on)
      b2.fx('link', { x: from.x, y: from.y, from: from.id, to: best.id, kind: 'aceelChain', dur: 0.2, id: e2.id, key: P.power ? 'projectile_enemy_aceel_pwratk' : 'projectile_enemy_aceel' });
      b2.dealDamage(e2, best, { amount: e2.s.atk * scale, type: 'arts', isAttack: true, tags: ['aceelChain'] });
      from = best;
    }
    P.chainMain = null;
  };
  const blockCheck = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => { if (P.shield && e2.blockedBy) { setShield(b2, e2, false); setPower(b2, e2, true); } };   // CheckBlocked → aceel[power-atk]
  return [
    {
      before(c, b2, e2) { blockCheck(b2, e2); },   // ON_OWNER_BLOCKEE_CHANGED comes with the block, before any attack on the blocker
      tick(b2, e2, a, dt) {
        blockCheck(b2, e2);
        if ((P.acc += dt) < EEL_SHIELD_CHECK - 1e-9) return;
        P.acc = 0;
        if (!P.shield && !e2.blockedBy && canCast(e2, false, b2)) setShield(b2, e2, true);   // ShieldGen
      },
      hitIn(c) { // aceel[shield]
        if (P.shield && resist > 0 && (c.dmg.type === 'phys' || c.dmg.type === 'arts')) c.dmg.mul *= 1 - resist;
      },
      hitOut(c) {
        if (!c.dmg.isAttack) return;
        const chained = (c.dmg.tags || []).includes('aceelChain');
        if (P.power) c.dmg.amount *= powerScale;                                                // aceel[power-atk]
        if (hidden && stackAtk > 0) c.dmg.amount *= 1 + stackAtk * stacksOf(chained ? P.chainMain : c.target);   // aceel[self-stack]
      },
      dealt(c, b2, e2) {
        const t = c.target;
        if (!t) return;
        if (ep > 0 && t.alive) elem(b2, e2, t, 'neural', e2.s.atk * ep);
        if (!hidden || (/** @type {DamageRec} */ (c.dmg).tags || []).includes('aceelChain')) return;
        if (maxStack > 0) P.stacks.set(t, Math.min(maxStack, stacksOf(t) + 1));                // Charge → aceel[atk-stack]
        if (jumpR > 0) chain(b2, e2, t);
      },
      attack(c, b2, e2) { if (P.power) setPower(b2, e2, false); },                               // ON_AFTER_ATTACK
    },
    dis && {
      // the handbook's SILENCE line; the prefab's Discharge skill, alone of the three, has no `_ignoreSilence`
      name: dis.name, cd: dis.cd, icd: dis.icd, sil: true,
      cond: (b2, e2) => areaAllies(b2, e2, e2.x, e2.y, (dis.bb.range_radius ?? 0) + ALLY_COLLIDER_RADIUS).some((u) => !u.isFlying),
      // 【离子环波】 its units are taken as the cast begins (the MeleeAttack's `_selectTargetTiming` 0 — UpdateTargets in
      // CastToTarget) and hit at the spell if still alive on the field (DoCastOnTargets: ValidAndAlive); until 2026-11-20
      // taken again at the spell
      fire(b2, e2, a) { a.picks = areaAllies(b2, e2, e2.x, e2.y, (dis.bb.range_radius ?? 0) + ALLY_COLLIDER_RADIUS).filter((u) => !u.isFlying); },
      atStrike(b2, e2, a) {
        const picks = /** @type {Unit[] | null} */ (a.picks) || [];
        a.picks = null;
        const r = dis.bb.range_radius ?? 0;
        b2.fx('explode', { x: e2.x, y: e2.y, r, kind: 'aceelDischarge', id: e2.id });
        for (const u of picks) {
          if (!u.alive || !u.deployed) continue;
          hurt(b2, e2, u, e2.s.atk * (dis.bb.atk_scale ?? 1), 'arts', { canDodge: true, tags: ['aceelDischarge'] });
          if (u.alive) elem(b2, e2, u, 'neural', e2.s.atk * (dis.bb.ep_damage_ratio ?? 0));
        }
      },
    },
    hidden && {
      tick(b2, e2, a, dt) { // 雷暴
        if ((P.thunderAcc += dt) < EEL_THUNDER_EVERY - 1e-9 || !canCast(e2, false, b2)) return;
        P.thunderAcc = 0;
        const all = b2.allies().filter((u) => u.alive && u.deployed && !u.hidden);
        const ops = ground(b2, e2).filter((u) => u.kind === 'op' && u.ownerId === e2.ownerId);
        let best = /** @type {Unit[]} */ ([]), bn = -1;
        for (const u of ops) {
          const n = all.filter((o) => Math.abs(o.tileR - u.tileR) <= 1 && Math.abs(o.tileC - u.tileC) <= 1).length;
          if (n > bn) { bn = n; best = [u]; } else if (n === bn) best.push(u);
        }
        if (!best.length) return;
        const t = best.length > 1 ? best[Math.floor(b2.rng() * best.length)] : best[0];
        b2.fx('explode', { x: t.x, y: t.y, r: 0.5, kind: 'aceelThunder', id: e2.id });
        hurt(b2, e2, t, e2.s.atk * wAtk, 'arts', { canDodge: true, tags: ['aceelThunder'] });
        if (t.alive) elem(b2, e2, t, 'neural', e2.s.atk * wEp);
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// 矩兽 (规程 boss_17) — official client prefab enemy_2124_dyjsfg (battle/enm_pfb_28, the same in the EN and CN clients)
// and its templates enemy_dyjsfg_t* in the buff table

/** Talents/Huge: the passive buff enemy_dyjsfg_t `triggerInterval` 0.1 s — how often 【明力】 picks its damage reduction. */
const JU_GUARD_CHECK = 0.1;
/** enemy_dyjsfg_t[combat_damage] (BuffToOwner on Skills/CombatAoe): `triggerInterval` 0.5 s after the skill's attack event. */
const JU_CRUSH_DELAY = 0.5;
/** enemy_dyjsfg_t[kill_all]'s buffs [kill_enemy] / [damage_ally]: `triggerInterval` 0.75 s (`waitFirstTriggerInterval`, one trigger). */
const JU_LAST_DELAY = 0.75;
/** [kill_enemy]: 后兽 (enemy_2123_dyjsww) stays (`CheckEnemyId` `_filterIds`). */
const JU_SPARED = 'enemy_2123_dyjsww';

/**
 * 矩兽. The prefab's `_blockVolume` 3 (the table's blockCnt is 1) and its `Combat` an EmptyAnimatedAbility: blocked, it
 * deals no attack damage — what it deals is its talents'.
 * 【明力】 (Talents/Huge, enemy_dyjsfg_t every 0.1 s): 抵抗 −`one_minus_status_resistance` (the buff's attribute 26
 * ONE_MINUS_STATUS_RESISTANCE); standing still (Enemy.IsStayStill: not in its move state — blocked, stunned, waiting — nor
 * blinking, unbalanced or being born) the derived buff enemy_dyjsfg_low_damage_resistance, else ..._high (template
 * damage_resistance: physical and arts damage taken × (1 − `damage_resistance`)), the other one ended.
 * 【尚同】 (Talents/Trample, from its appearance): every `Trample.interval` (Buff.Reset reads the blackboard `interval` over the
 * prefab's 1 s; the first after one interval) every unit of the player's side within `range_radius` (CreateBuffInRange,
 * all motions) takes physical ATK × `atk_scale` (DamageViaAttr from the source's ATK). Each time it becomes blocked
 * (ToggleablePassiveBuffAbility + BlockedToggleChecker min 1: the toggle turns on) enemy_dyjsfg_t[trigger_aoe] forces
 * Skills/CombatAoe (TriggerEnemySkill, `_interruptCurAbility`): at its attack event its MeleeAttack strikes its own target,
 * the blocker (`_selectTargetSource` FROM_OWNER), physical ATK × 1, and puts enemy_dyjsfg_t[combat_damage] on itself; 0.5 s
 * later every unit of that side within the skill's `range_radius` takes physical ATK × `combat_atk_scale` (AOEDamage,
 * `_useDamageFromBB` off = the source's ATK; `_excludeTarget` leaves out only the leader at its centre). The skill plays its
 * clip (`_animKey` Attack, `_timeMode` 1: the clip as it is, 1.5 s) and waits for its OnAttack frame (0.6 s —
 * data/seasons/act3autochess/enemies.json `skillCast.combataoe.hit`, from the model's skeleton); a stun, a freeze, a
 * sleep, 失衡, fear or 隐匿 before that frame cuts the cast (ai.js cutEnemySwing's states), and so does losing its target
 * (`AbilityStandard.UpdateTargets`: no target and `allowNoTarget` off ends the cast) [추정·엔진: whether CombatAoe's
 * `_allowNoTarget` is off was not read — the blocker gone, neither the strike nor the 0.5 s burst comes].
 * 【非命】 (Talents/Overload, HpRatioToggleChecker `_maxHpRatio` 0.5 `_toggleOnce`): once, at half HP — ATK +`Overload.atk`
 * (MULTIPLIER), move speed × `Overload.move_speed` (FINAL_SCALER), block volume +`block_volume` (AddEnemyBlockVolume only
 * raises Enemy.blockVolumeAddition; a blocker keeps the volume it counted at the block — BlockedEnemyManager.Add — so the
 * extra counts from its next block on).
 * 【兼爱】 (Talents/OutOfControll, enemy_dyjsfg_t[kill_all] ON_OWNER_FINISH: knocked out or leaving): its ATK then
 * (AssignAttributeToBB) is kept; 0.75 s later every enemy but a trap, a token or 后兽 is knocked out (InstantKill, no
 * source), and every operator and summon takes physical that ATK × `OutOfControll.atk_scale`, no source (FixedValueDamage
 * `_noSourceDamage`; CreateBuffToCertainSideUnits selects nothing, so 隐匿 does not save it). A boss field ends as its pool
 * empties (DESIGN §5.5), so this shows only where the battle goes on.
 * @param {AbState} ab @returns {AbList}
 */
function kitJu(ab) {
  const resist = -(T(ab, 'Huge.one_minus_status_resistance') ?? 0);
  const low = T(ab, 'Huge.enemy_dyjsfg_low_damage_resistance.damage_resistance') ?? 0;
  const high = T(ab, 'Huge.enemy_dyjsfg_high_damage_resistance.damage_resistance') ?? 0;
  const trR = T(ab, 'Trample.range_radius') ?? 0, trAtk = T(ab, 'Trample.atk_scale') ?? 1, trEvery = T(ab, 'Trample.interval') ?? 1;
  const crush = ab.sk.CombatAoe;
  const crushR = crush ? crush.bb.range_radius ?? 0 : 0, crushAtk = crush ? crush.bb.combat_atk_scale ?? 1 : 1;
  const strikeAtk = crush ? crush.bb.atk_scale ?? 1 : 1;   // MeleeAttack `_atkScaleKey` atk_scale, else `_atkScale` 1
  const ovAtk = T(ab, 'Overload.atk') ?? 0, ovMove = T(ab, 'Overload.move_speed') ?? 1, ovVol = T(ab, 'Overload.block_volume') ?? 0;
  const lastAtk = T(ab, 'OutOfControll.atk_scale') ?? 1;
  const crushHit = crush && crush.cast && /** @type {number} */ (crush.cast.hit) > 0 ? /** @type {number} */ (crush.cast.hit) : 0;   // the clip's OnAttack frame, s
  /** @type {{ guardAcc: number, guard: number | null, trampleAcc: number, wasBlocked: boolean, over: boolean, volLeft: number, cast: { at: number, tgt: Unit | null } | null }} the kit's state */
  const P = { guardAcc: 0, guard: null, trampleAcc: 0, wasBlocked: false, over: false, volLeft: 0, cast: null };
  const still = (/** @type {Unit} */ e2) => !!e2.blockedBy || !e2.moving || !!e2.s.flags.stun;
  const setGuard = (/** @type {Battle} */ b2, /** @type {Unit} */ e2, /** @type {number} */ dr) => {
    if (P.guard === dr) return;
    P.guard = dr;
    const m = 1 - dr;
    b2.addBuff(e2, { key: 'boss:juGuard', persist: true, refresh: 'replace', mods: { physTakenMul: m, artsTakenMul: m } });
  };
  // the forced cast (TriggerEnemySkill): its clip starts now, its attack event comes at the clip's OnAttack frame
  const crushStart = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => {
    b2.fx('enemySkill', { x: e2.x, y: e2.y, id: e2.id, ability: crush ? crush.name : 'CombatAoe' });
    P.cast = { at: b2.time + crushHit, tgt: e2.blockedBy };
    if (!(crushHit > 0)) crushNow(b2, e2);
  };
  const crushNow = (/** @type {Battle} */ b2, /** @type {Unit} */ e2) => {
    const tgt = P.cast && P.cast.tgt;
    P.cast = null;
    if (!tgt || !tgt.alive || !tgt.deployed) return;
    // the skill's MeleeAttack (`_selectTargetSource` FROM_OWNER: its own target, the blocker; physical, `_atkScale` 1)
    hurt(b2, e2, tgt, e2.s.atk * strikeAtk, 'phys', { canDodge: true, tags: ['dyjsfgStrike'] });
    b2.after(JU_CRUSH_DELAY, () => {
      if (!e2.alive || e2.hidden) return;
      b2.fx('explode', { x: e2.x, y: e2.y, r: crushR, kind: 'dyjsfgCrush', id: e2.id });
      for (const u of areaAllies(b2, e2, e2.x, e2.y, crushR + ALLY_COLLIDER_RADIUS)) hurt(b2, e2, u, e2.s.atk * crushAtk, 'phys', { tags: ['dyjsfgCrush'] });
    }, { owner: e2 });
  };
  return [
    {
      spawn(b2, e2) {
        e2.blockWeight = 3;               // the prefab's `_blockVolume`
        /** @type {AttackProfile} */ (e2.profile).noAttack = true;       // `Combat` = EmptyAnimatedAbility (the table's applyWay NONE says the same)
        if (resist > 0) b2.applyStatus(e2, 'resist', { source: e2, value: Math.min(1, resist) });
      },
      tick(b2, e2, a, dt) {
        if ((P.guardAcc += dt) >= JU_GUARD_CHECK - 1e-9) { P.guardAcc = 0; setGuard(b2, e2, still(e2) && !unbalancedNow(b2, e2) ? low : high); }
        if (P.cast) {
          if (!canCast(e2, false, b2) || e2.s.flags.fear) P.cast = null;     // the cast is cut (ai.js cutEnemySwing)
          else if (b2.time >= P.cast.at - 1e-9) crushNow(b2, e2);
        }
        const blocked = !!e2.blockedBy;
        if (blocked && !P.wasBlocked && crush && canCast(e2, false, b2)) crushStart(b2, e2);   // the toggle turns on (`_interruptCurAbility`: a cast still playing starts over)
        P.wasBlocked = blocked;
        if (!P.over && e2.hp <= e2.s.maxHp * 0.5 + 1e-9) {   // HpRatioToggleChecker `_maxHpRatio` 0.5, once
          P.over = true;
          P.volLeft = ovVol;
          b2.addBuff(e2, { key: 'boss:juOverload', persist: true, visible: true, mods: { atkPct: ovAtk, moveMul: ovMove } });
          b2.fx('phase', { x: e2.x, y: e2.y, id: e2.id, kind: 'dyjsfgOverload' });
        }
        if (P.volLeft && !e2.blockedBy) { /** @type {number} */ (e2.blockWeight) += P.volLeft; P.volLeft = 0; }
        if (e2.hidden || trR <= 0) return;
        if ((P.trampleAcc += dt) < trEvery - 1e-9) return;
        P.trampleAcc -= trEvery;
        b2.fx('explode', { x: e2.x, y: e2.y, r: trR, kind: 'dyjsfgTrample', id: e2.id });
        for (const u of auraAllies(b2, e2, e2.x, e2.y, trR + ALLY_COLLIDER_RADIUS)) hurt(b2, e2, u, e2.s.atk * trAtk, 'phys', { tags: ['dyjsfgTrample'] });
      },
      death(c, b2, e2) {
        const atk = e2.s.atk;
        b2.after(JU_LAST_DELAY, () => {
          b2.fx('explode', { x: e2.x, y: e2.y, r: 0, kind: 'dyjsfgLast', id: e2.id });
          for (const o of b2.aliveEnemies()) if (o !== e2 && o.defId !== JU_SPARED && !/^(trap|token)_/.test(o.defId)) b2.kill(o, null);
          for (const u of b2.allies()) if (u.alive && u.deployed && u.kind !== 'device') hurt(b2, e2, u, atk * lastAtk, 'phys', { ignoreSelect: true, sourceless: true, tags: ['dyjsfgLast'] });
        }, { holdsBattle: true });
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------

/** @type {Readonly<Record<string, BossKit>>} */
export const BOSS_KITS = Object.freeze({
  enemy_9013_acstmk: kitHelm,          // boss_1 假想敌：胄
  enemy_9013_acstmk_2: kitHelm,        // boss_8 假想敌：胄 (隐秘核心)
  enemy_9014_acstma: kitBlade,         // “斩胄之剑”
  enemy_9015_acstmb: kitBlade,         // “破胄之锤”
  enemy_9016_acstmr: kitShell,         // 刺胄之弹
  enemy_9017_achunt: kitGun,           // boss_2 假想敌：铳
  enemy_9017_achunt_2: kitGun,         // boss_9 假想敌：铳 (隐秘核心)
  enemy_9018_actrpa: kitSpring,        // “碎铳之簧” 法术护盾
  enemy_9019_actrpb: kitSpring,        // “碎铳之簧” 元素护盾
  enemy_9020_actrpc: kitSpring,        // “碎铳之簧” 频次护盾
  enemy_9021_acduml: kitPipe,          // boss_3 假想敌：管
  enemy_9021_acduml_2: kitPipe,        // boss_10 假想敌：管 (隐秘核心)
  enemy_9022_acdumm: kitString,        // 假想敌：弦
  enemy_9023_acdums: kitEcho,          // “余音”
  enemy_1521_dslily: kitQuintus,       // boss_4 盐风主教昆图斯
  enemy_2016_csphtm: kitLucien,        // boss_5 卢西恩，“猩红血钻”
  enemy_2017_csphts: lucienCore,       // 不祥幻影
  enemy_9032_aclionk: kitLion,         // boss_6 阿利斯泰尔，帝国余晖
  enemy_10028_vtswd: kitEquip,         // 未装配刀片 (inert until animated or picked up)
  enemy_10029_vtshld: kitEquip,        // 防护背心
  enemy_10030_vtwand: kitEquip,        // 冲击式施术单元
  enemy_9033_acdeer: kitDeer,          // boss_7 “萨米的意志”
  // 规程 (act3autochess) only — data/seasons/act3autochess/enemies.json
  enemy_9028_acfncb: kitFirstDouble,   // 量变之械 (假想敌：械's part)
  enemy_9029_acfnc: kitMachine,        // boss_11 假想敌：械
  enemy_9029_acfnc_2: kitMachine,      // boss_14 假想敌：械 (隐秘核心)
  enemy_9027_acfnca: kitArmor,         // 冲击之械
  enemy_9035_acspider: kitSpider,      // boss_12 假想敌：茧
  enemy_9035_acspider_2: kitSpider,    // boss_15 假想敌：茧 (隐秘核心)
  enemy_9036_acweb: kitWeb,            // 淤困之茧
  enemy_9037_aceel: kitEel,            // boss_13 假想敌：鳍
  enemy_9037_aceel_2: kitEel,          // boss_16 假想敌：鳍 (隐秘核心)
  enemy_2124_dyjsfg: kitJu,            // boss_17 矩兽
});
export const BOSS_KEYS = Object.freeze(Object.keys(BOSS_KITS));
/** Stage tokens a leader switches on (template `devices`, not in data/enemies.json), spawned as enemies with an inline record. */
/** @type {Readonly<Record<string, BossKit>>} */
export const DEVICE_KITS = Object.freeze({
  trap_039_dstnta: kitBrood,           // 子代 (盐风主教昆图斯's 断裂生殖)
  trap_185_vtlntw: kitGolden,          // 黄金回响 (阿利斯泰尔's 莫非王土 on a 冲击式施术单元)
});
