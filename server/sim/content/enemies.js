// server/sim/content/enemies.js — enemy special types (特训敌人) and individual enemy abilities (DESIGN §7).
//
// Battle side: install(battle) registers ONE set of global dispatch hooks per battle (ensureInstalled — idempotent,
// bosses.js calls it too) and attaches an ability list to every spawned enemy whose key has a kit in KITS.
// Every number comes from the enemy's talent / skill blackboard (data/enemies.json, merged with the wave template's
// `overrides[key].talents/skills` — the engine only applies `overrides.stats`). Numbers that exist nowhere in the
// data are named constants (enemies/helpers.js when several kit families use them, else in the family's file), marked
// [ASSUMED] or sourced from the official term table (gamedata_const termDescriptionDict) / PRTS.
//
// Runtime model: `enemy.mem.ab = { key, t (talent bb), tS (talent bbStr), sk {prefabKey → {cd, icd, sp, bb, bs}},
//   list [abilities], times, hitShield, atkType, immune, … }`. An ability is a plain object with optional methods
//   spawn(b,e,a,ab) · dealt(c,…) ('damaged' by one of e's ATTACKS on an ally, non-element) · taken(c,…) ('damaged' on e,
//   non-element) · gauge(c,…) ('damaged' on e by an element gauge hit, 元素损伤) · healed(c,…) ('heal' on e, natural
//   regeneration aside; `c.amount` before the max-HP clamp) · hitIn(c,…) ('hit' on e, late: after every other hit
//   handler) · hitOut(c,…) ('hit' from e, early) ·
//   (`c.source` is null for 无来源 damage — element bursts; target-side reactions that must still fire, e.g. damage
//   sharing, read `c.source || c.credit`, `credit` naming the unit that filled the gauge) ·
//   before(c,…) (beforeAttack of e) · attack(c,…) · blocked(c,…) · killed(c,…) (return true = revived; the kill is then
//   hidden from later 'kill' handlers) · death(c,…) · status(c,…) (statusApplied on e) · burst(c,…) (elementBurst on e)
//   · tick(b,e,a,dt) every `iv` s (every tick when iv is 0) · skill: `cd`/`left`(=icd)/`cond`/`fire` (cooldown runs
//   continuously; fires when ready, the enemy can act and `cond` holds — a skill of the enemy's table on an armed enemy
//   only at an attack slot, in place of the normal attack: onSkillSlot). `sil: true` = the ability's handbook line
//   is flagged SILENCE (沉默 disables it: exactly the data's `format: "SILENCE"` lines — and 萨卡兹枯朽战士 / 组长's
//   死亡爆炸, a NORMAL line whose client template checks 沉默: archetypes.js kitPolluted); stun / freeze / sleep block
//   skills. Enemy SP skills ("数次攻击后…"): SP +1 per attack, the (spCost+1)-th attack is the skill attack (official
//   粉碎攻坚手 text: spCost 2 = "攻击2次后，下一次攻击").
// Shared mechanics: reborn() — "首次被击倒后重生 / 第二形态" (the first KO is hidden from kill credit and bounty; a
//   rebirth of Reborn.duration s, untargetable and inert, then the new form); artsBarrier() — "吸收法术伤害的屏障"
//   (absorbs arts after RES); frontGuard() — "来自正面的伤害降低" (facing = walking direction or the bigger crowd);
//   unbalanced() — 失衡 detection (displacement beyond the enemy's own speed; engine displace() has no hook);
//   husk() — "被击倒时暂时变为…，一段时间后重生" (Revive[Trigger]: every knock-out of the first form ⇒ 1 s 重生 ⇒ a walking
//   hit-count husk — 隐匿 逐火 embers, the unblockable 再生 puppet — until the real death or its revival); every 重生
//   (reborn / husk / statue) clears the enemy's statuses and the buffs allies gave it (rebirthCleanse, PRTS 特殊机制
//   §重生 "清空自身身上除白名单外所有Buff"); a data-unarmed
//   enemy armed by a form (转译基底) sets `e.profile` noAttack / melee / dmgType / maxTargets and attacks through the
//   engine (ai.js enemyAttack); float() — 近地悬浮 (an air unit that
//   keeps its ground path, Unit.isFlying; kitSyufo / kitParrot lose it when stunned). `e.profile.canTarget(ally)` = the
//   enemy's own target rule (只攻击地面单位 …), applied by the engine to the candidates before its priority order; a
//   special priority (优先攻击防御力最高的… / 生命上限最高的…) sorts by its key, ties by taunt then latest deployed
//   (targeting.js aggroCmp — PRTS 索敌: 特殊优先级 → 仇恨值). Area effects — splash, blasts, area skills and statuses,
//   pulses, the zones an enemy leaves, chain / bounce jumps, 周围四格 additions, whole-column / whole-field skills —
//   select with areaAllies / areaAlliesInTiles / fieldAllies (targeting.js areaSelectable; PRTS 作战机制 §AOE伤害判定
//   "AOE的判定是对攻击范围内的每个可以被选中的敌人进行判定"): no 隐匿 ally, the one blocking the enemy included (GitHub #97), no untargetable
//   or sleeping one, no airborne 起飞 one for a ground enemy; 迷彩 is not checked (splash-type, 中点判定 / 格子判定 and
//   aura effects ignore it — ba.camou "无法躲避溅射类攻击", PRTS 异常效果 迷彩; the sites with no such reading are
//   [ASSUMED] in DESIGN §22.12). Buff auras select with auraAllies (auraSelectable: 隐匿 kept out, 起飞 not). A locked
//   target (an attack's, a channel's, a C4's) is hit as a direct pick, only the others around it as an area
//   (targetAndArea). Until 0.1.2 they took every ally in the area (GitHub issue #32 item 6; DESIGN §22.12). An airborne ally
//   (起飞, flag `liftoff`) is no target of a ground enemy (对地规避, targeting.js evadesGround): targetsNear / allTargets
//   skip it through canTargetAlly, the area selectors through areaSelectable, and the engine refuses a ground enemy's
//   damage and statuses on it. Not selections, so they still reach it (`ignoreSelect`): abilities PRTS marks "无视无法
//   选择 / 无视(目标)可选性" (【污染秽蚀】, 【盲信之誓】, 萨卡兹悖谬暴虐兵长's 暴击 splash, 假想敌：淤困's burst spread),
//   direct picks of the attacker (碎铳之簧's counter — PRTS 异常效果 "'直接选中'的能力…不受这些仅在选择时生效的异常效果
//   制约"), the blasts of flying units credited to a ground leader (刺胄之弹, 斩胄之剑 / 破胄之锤) and the ticks of a debuff
//   already on it (出血, 沙狱, “庞贝”'s burning, 淤困, 【自然涌动】 — a tick selects nobody). Ground enemies' buff auras
//   (深池伙友卫队, 扎罗's 远古威慑) and the sourceless 毒雾 of 假想敌：蚀裂 still reach it [ASSUMED, §21.22] while keeping
//   a 隐匿 ally out; 寒霜's aura (PRTS: its debuff "无视隐匿状态起作用") and map / tile effects (“墓碑” — PRTS: a map effect —,
//   【国度】, the chimera's 源石污染区 [ASSUMED]) reach every ally.
//
// Special types (factions.json):
//   FLY        — engine (FLY motion, ranged-only targeting). Flyer kits in enemies/fly.js (御4, 护障, 寒霜, 萨科塔之翼/眼, 黑云 …).
//   TIMES 频次 — "需要N次伤害击倒": maxHp := N hits; engine buff flag hitCount — every damage instance (any type, element
//                bursts included) removes exactly 1 on its own DamageInfo (茶器 hitCountArts: arts and true only); HP loss
//                (loseHp) bypasses the rule. The faction's enemies
//                create those units (death spawns, embers, blades, 再生).
//   ELEMENT    — element damage on hit = ATK × ep_damage_ratio into the ally's gauge. 侵蚀 (erosion) is an engine
//                gauge whose burst is the official one (termDescription ba.dt.erosion: "永久降低100点防御力并受到800点物理伤害").
//   DOT        — damage zones (污染秽蚀: true damage, one tick per second however many cover a unit, "可对空，无视无法选择"
//                — `ignoreSelect`, 起飞 / 隐匿 allies included; 燃烧区域: the enemy's area selection — PRTS 集团军重型火炮
//                "碰撞不受迷彩制约，不可对空", no 无视无法选择 —, so no 起飞 or 隐匿 ally; 假想敌：蚀裂's sourceless
//                毒雾 skips a 隐匿 ally, not a 起飞 one), bleeding (removed by healing), pulsing damage around an enemy
//                (area selection).
//   INVISIBLE  — permanent `stealth` flag (engine: untargetable unless blocked or revealed). An operator's radius area
//                damage skips an unblocked one too (Battle.foesInRadius: profession splash around a struck target,
//                skill circles — PRTS 作战机制 §AOE伤害判定 "对攻击范围内的每个可以被选中的敌人进行判定"; until 0.1.1 it
//                still hit it); tile selectors (enemiesInKeys) always skipped it. After a block it hides again only
//                STEALTH_RESTORE (3) s later — or after the "（解除阻挡N秒后恢复）" of its PRTS page (STEALTH_RESTORE_BY_KEY,
//                清明's veil 0 s) — Battle._stealthSwitch / targeting.js enemyStealthed (until 0.1.2: at once).
//                The mirror rule for an ally's 隐匿 — enemy area effects skip it even when it blocks the enemy (0.1.3, GitHub #97) — is areaAllies.
//   REFLECTION — 折射 (ba.refraction "生效时，法术抗性+70"): RES +refracting.magic_resistance while NOT silenced
//                (the ability line is SILENCE-flagged: silencing turns it off); 镜膜 also gets max HP +100 % until its first silence, which permanently stops its fan.
//   REBORN 复苏 (规程) — "首次被击倒后会重生": the main story's 萨卡兹子裔 summon a 重生造物 on their first knock-out
//                (enemies/reborn.js; its header has the official templates).
//   CRITIC 精锐 (规程) — main-story enemies with no rule of the type's own: enemies/critic.js.
//   SPECIAL    — mostly stats; prisoners, 穿刺手, 暴虐兵长, 镜卫, 动力装甲 … in enemies/special.js.
// Every enemy key of data/enemies.json is either in KITS (this file), BOSS_KEYS (bosses.js) or STATS_ONLY (with the
// reason) — pinned by test/content/enemies_bosses.test.js. Bounty (悬赏) leaders are included: multi-form ones
// (巨大的丑东西, 杰斯顿, 自在, 锏, 扎罗) get their second form; event-only mechanics (芦苇, 摄影区, 狂欢时刻, 悬索桥, 唤血祭坛,
// 封冻/供暖器, 赘生甲壳, 锁链, 血债账款, 晦明) have no counterpart in this mode and are listed where they apply.
//
// fx kinds emitted (battle.fx(kind, {x, y, …})): 'explode' {r, kind} · 'zone' {r, dur, kind} · 'telegraph' {r, dur,
//   kind, tiles?, id?, form?} (delayed strikes, charges, 'reborn' with form 'reborn') · 'beam' {from, to, kind} ·
//   'summon' {id, key} · 'ember' {id, hits, dur, form: 'husk'} · 'revive' {id, kind?, form: 'form2' | 'revived' | 'fly'}
//   · 'stone' {id, dur, form: 'stone'} · 'blink' {id, fx, fy} · 'charge' {id, tx, ty} · 'expose' {id} · 'shieldBreak'
//   {id} · 'liberate' {id, form: 'liberty'} · 'phase' {id, kind, dur?, form?} (form changes — 掠海漂移体 'crawl', 暴鸰
//   'bombed', translator_*, a prisoner's 'warning' — and barrier / charge states) · 'lpLoss' {value, reason} · 'steal' · 'ignite'. Forms go through
//   setForm(): the unit keeps it (`e.form`, UnitInfo `form`) and the fx's `form` is the model's clip set from then on
//   (render/app.js → UnitView.setForm, units.js FORMS); the client keeps every fx with a `form` through catch-ups and
//   hidden tabs (shared/protocol.js fxForm).
// Custom hook: 'lpLoss' {amount, reason, source} — leader "扣除目标生命" effects; also summed into result.lpLoss.
//
// Code layout (0.2.0): this file installs the battle-wide dispatch hooks (ensureInstalled), runs the global
// dispatchers, builds KITS from the kit families and lists STATS_ONLY; the rest lives in server/sim/content/enemies/ —
//   helpers.js      constants several families use, per-battle state, ability bookkeeping (abOf / attach / dispatch, T,
//                   canCast …), selection and damage helpers (elem, hurt, areaAllies & friends, zone, spawnChildren,
//                   setForm, lpLoss, expose, absorbArts …)
//   archetypes.js   ability building blocks (stealth, splashAttack, deathBoom, refraction, float, reborn, husk, statue,
//                   artsBarrier, bleed, pollution, dmgZone, skill(), blinkForward …) and the archetype kits reused by
//                   several keys (kitEp, kitStealth, kitTimes, kitRefraction, kitPrisoner, kitDeathSpawn, kitStun3 …)
//   invisible.js, times.js, element.js, dot.js, reflection.js, reborn.js, critic.js, fly.js, special.js — one file per special type
//                   (factions.json): its kits, its kit-only constants and its part of KITS
//   bounty.js       the main-story enemies only 规程's 悬赏 cards bring (not the bounty leaders below)
//   leaders.js      bounty (悬赏) leaders: kitLeaderMisc (single form) and the multi-form kits
// Every name this file exported before the split is still exported from here.

import { TICK } from '../constants.js';
import { stOf, abOf, attach, safe, dispatch, canCast, elem, alliesInTiles, castLength, castStrikeAt } from './enemies/helpers.js';
import { INVISIBLE_KITS } from './enemies/invisible.js';
import { TIMES_KITS } from './enemies/times.js';
import { ELEMENT_KITS } from './enemies/element.js';
import { DOT_KITS } from './enemies/dot.js';
import { REFLECTION_KITS } from './enemies/reflection.js';
import { REBORN_KITS } from './enemies/reborn.js';
import { CRITIC_KITS } from './enemies/critic.js';
import { FLY_KITS } from './enemies/fly.js';
import { SPECIAL_KITS } from './enemies/special.js';
import { BOUNTY_KITS } from './enemies/bounty.js';
import { LEADER_KITS } from './enemies/leaders.js';
import { hypot } from '../detmath.js';
import { enemyHasAttack, interruptEnemyCast } from '../ai.js';

export {
  EROSION, EROSION_BURST, HUSK_REBIRTH, nthOf, abOf, attach, T, silenced, canCast, unbalancedNow, elem, hurt, shoot, alliesInTiles,
  targetsNear, allTargets, areaAllies, areaAlliesInTiles, fieldAllies, auraAllies, targetAndArea, byPriority, zone,
  remainingRoute, stayRoute, spawnChildren, stepToward, setHits, hitCount, isHitCount, setForm, lpLoss, expose,
  expectedFinal, absorbArts,
  // a skill's cast length and the frame of its effect (kept beside atCastEvent, which the kits time their parts with)
  castLength, castStrikeAt,
} from './enemies/helpers.js';
export { TRANSLATOR_CHANGE } from './enemies/leaders.js';
export { BOMBD_RELEASE, BOMBD_POST_DELAY } from './enemies/fly.js';
export { HOVER_KEYS, blinkForward } from './enemies/archetypes.js';

/** @import { Battle } from '../Battle.js' */
/** @import { Unit } from '../units.js' */
/** @import { HitEv, DamagedEv, AttackEv, KillEv, DeathEv, StatusEv, HealEv, BurstEv } from './support/index.js' */
/** @import { AttackProfile } from '../ai.js' */
/** @import { Buff } from '../battle/status.js' */
/** @import { EnemyShot } from './enemies/helpers.js' */
/** @import { Tpl } from './bosses.js' */
/**
 * The runtime model of the header, as the kits (enemies/*.js, bosses.js) build and read it. A hook gets the engine's
 * payload of its event (support/index.js HitEv, DamagedEv …; the two below are ai.js's and battle/blocking.js's).
 * @typedef {{ attacker: Unit, targets: Unit[], isSkill: boolean, profile: AttackProfile | null, signal?: string | null }} BeforeAttackEv
 * @typedef {{ blocker: Unit, enemy: Unit }} BlockedEv
 * `killed`: a handler that revives the enemy returns true and the dispatcher stops the event (`stopPropagation`).
 * @typedef {KillEv & { stopPropagation?: boolean }} KilledEv
 * A damage instance as the kits read and change it (damage.js dealDamage's record, the `dmg` of 'hit' / 'damaged').
 * @typedef {{ [key: string]: unknown, type: string, amount: number, cancel?: boolean, isAttack?: boolean, isSkill?: boolean,
 *   sourceless?: boolean, tags?: string[], mul?: number, defIgnorePct?: number, defIgnoreFlat?: number, resIgnorePct?: number,
 *   resIgnoreFlat?: number }} DamageRec
 * A payload a kit builds for a part it shares between hooks, read field by field.
 * @typedef {{ [key: string]: unknown, source?: Unit | null, target?: Unit | null, dmg?: DamageRec | null }} AbCtx
 * One skill of the enemy's table (enemies/helpers.js abOf): its prefab key, cooldowns, SP cost, priority, blackboards,
 * projectile and cast record.
 * @typedef {{ name: string, cd: number, icd: number, sp: number, pri: number, bb: Record<string, number>,
 *   bs: Record<string, string>, proj: EnemyShot | null, cast: AbCastRec | null }} AbSkill
 * A skill's cast record (data/enemies.json `skillCast[prefabKey]`, tools/build-data.mjs enemySkillCast; helpers.js
 * castLength reads the kinds): a group's `kind` and `subs`, an animated ability's clip `dur` and times.
 * @typedef {{ [key: string]: unknown, family?: number, kind?: string, subs?: AbCastRec[], one?: boolean, main?: number,
 *   miss?: boolean, dur?: number, time?: number, cd?: number, cdKey?: string, max?: number, wait?: number, pre?: number,
 *   hit?: number, proj?: boolean, chan?: ChanRec | null, chanBegin?: CastClip | null, chanLoop?: CastClip | null,
 *   chanEnd?: CastClip | null, resetMain?: boolean, waitFirst?: boolean }} AbCastRec
 * @typedef {{ dur: number, hit?: number }} CastClip
 * A three-part channel (ThreePartChannelingAnimation: its loop clip, `wait` = `_waitForAttachFinishEvent`).
 * @typedef {{ [key: string]: unknown, loop?: unknown, wait?: boolean | number }} ChanRec
 * The cast an attack slot opened (onSkillSlot `ab.casting`).
 * @typedef {{ a: EnemyAbility, cast: AbCastRec, until: number, open: boolean, min?: number, chan?: boolean,
 *   hold?: boolean }} AbCast
 * An enemy's ability state `e.mem.ab` (enemies/helpers.js abOf), plus the fields its kit keeps there.
 * @typedef {{ [key: string]: unknown, key: string, t: Record<string, number>, tS: Record<string, string>,
 *   sk: Record<string, AbSkill>, list: EnemyAbility[], hitShield: number, atkType: string | null,
 *   immune: Set<string> | null, casting?: AbCast | null, ownAttack?: boolean }} AbState
 * An ability (the header's methods; the kit's own fields beside them).
 * @typedef {{ [key: string]: unknown, name?: string | null, cd?: number, icd?: number, left?: number, iv?: number, sil?: boolean,
 *   atStrike?: boolean | ((b: Battle, e: Unit, a: EnemyAbility) => unknown),
 *   spawn?(b: Battle, e: Unit, a: EnemyAbility, ab: AbState): unknown,
 *   tick?(b: Battle, e: Unit, a: EnemyAbility, dt: number): unknown,
 *   cond?: ((b: Battle, e: Unit, a: EnemyAbility) => unknown) | null,
 *   fire?(b: Battle, e: Unit, a: EnemyAbility): unknown,
 *   refresh?(b: Battle, e: Unit, a: EnemyAbility): unknown,
 *   liberate?(b: Battle, e: Unit, a: EnemyAbility, forced?: boolean): unknown,
 *   pause?(b: Battle, e: Unit): unknown,
 *   projAlive?(b: Battle, e: Unit, a: EnemyAbility): unknown,
 *   onCut?(b: Battle, e: Unit, a: EnemyAbility): unknown,
 *   dealt?: AbHook<DamagedEv>, taken?: AbHook<DamagedEv>, gauge?: AbHook<DamagedEv>, healed?: AbHook<HealEv>,
 *   hitIn?: AbHook<HitEv>, hitOut?: AbHook<HitEv>, before?: AbHook<BeforeAttackEv>, attack?: AbHook<AttackEv>,
 *   blocked?: AbHook<BlockedEv>, killed?: AbHook<KilledEv>, death?: AbHook<DeathEv>, otherDeath?: AbHook<DeathEv>,
 *   status?: AbHook<StatusEv>, burst?: AbHook<BurstEv>, _acc?: number, casts?: number }} EnemyAbility
 * The hooks an ability may have (dispatch's `name`).
 * @typedef {'dealt' | 'taken' | 'gauge' | 'healed' | 'hitIn' | 'hitOut' | 'before' | 'attack' | 'blocked' | 'killed'
 *   | 'death' | 'otherDeath' | 'status' | 'burst'} AbHookName
 */
/**
 * A hook method of an ability (dispatch: the payload, then the battle, the enemy, the ability and its state).
 * @template C
 * @typedef {(c: C, b: Battle, e: Unit, a: EnemyAbility, ab: AbState) => unknown} AbHook
 */
/**
 * What a kit returns: its abilities, a falsy entry for one it leaves out (`s1 && { … }`).
 * @typedef {Array<EnemyAbility | null | undefined | false | 0 | ''>} AbList
 * The wave template bosses.js passes a leader's kit (data/waves.json, read field by field there; null in tests and tools).
 * @typedef {Tpl} KitTpl
 * A kit: enemyKey → (ab, e, battle) => its abilities (bosses.js passes the wave template as well).
 * @typedef {(ab: AbState, e: Unit, b: Battle, tpl?: KitTpl) => AbList} EnemyKit
 * A kit that reads only the ability state: another kit can call it with that alone (`kitDeathSpawn()(ab)`).
 * @typedef {(ab: AbState) => AbList} AbKit
 * A part of an ability called with the battle, the enemy and the ability (fire, cond, a split `atStrike` …).
 * @typedef {(b: Battle, e: Unit, a: EnemyAbility) => unknown} AbFn
 */

/** An enemy skill's `_familyMask` bits (client enum `Ability.FamilyGroup` ATTACK 0, COMBAT 1; data/enemies.json `skillCast.family`). */
const FAMILY_ATTACK = 1, FAMILY_COMBAT = 2;

// ---------------------------------------------------------------------------------------------------------------
// per-battle state + installation

/** Register the global dispatch hooks once per battle (idempotent). @param {Battle} b */
export function ensureInstalled(b) {
  const st = stOf(b);
  if (st.installed) return st;
  st.installed = true;
  b.on('enemySpawn', ({ enemy }) => onSpawn(b, enemy), { priority: 100 });
  b.on('hit', (c) => onHitOut(b, c), { priority: 200 });
  b.on('hit', (c) => chaliceShare(b, c), { priority: -400 });
  b.on('hit', (c) => onHitIn(b, c), { priority: -500 });
  b.on('damaged', (c) => onDamaged(b, c), { priority: 50 });
  b.on('beforeAttack', (c) => onBeforeAttack(b, c), { priority: 50 });
  b.on('attack', (c) => { if (c.attacker && c.attacker.side === 'enemy') dispatch(b, c.attacker, 'attack', c); }, { priority: 50 });
  b.on('blocked', (c) => dispatch(b, c.enemy, 'blocked', c), { priority: 50 });
  b.on('kill', (c) => onKill(b, c), { priority: 1000 });
  b.on('death', (c) => onDeath(b, c), { priority: 50 });
  b.on('beforeStatus', (c) => {
    const ab = c.target && c.target.mem && c.target.mem.ab;
    if (!ab) return;
    if (ab.immune && ab.immune.has(c.status)) c.cancel = true;
  }, { priority: 50 });
  b.on('statusApplied', (c) => { if (c.target && c.target.side === 'enemy') dispatch(b, c.target, 'status', c); }, { priority: 50 });
  b.on('heal', (c) => {
    // 逐腐兽 bleeding ends when the target receives healing (natural regeneration excluded)
    if (c.amount > 0 && c.target && c.target.side === 'ally' && !(c.opts && c.opts.regen) && c.target.findBuff('ab:bleed')) b.removeBuff(c.target, 'ab:bleed');
    if (c.amount > 0 && c.target && c.target.side === 'enemy' && c.target.mem.ab && !(c.opts && c.opts.regen)) dispatch(b, c.target, 'healed', c);
  }, { priority: -50 });
  b.on('elementBurst', (c) => onBurst(b, c), { priority: 50 });
  b.on('tick', (c) => onTick(b, c.dt), { priority: 50 });
  b.on('enemySkillSlot', (c) => onSkillSlot(b, c), { priority: 50 });
  b.on('enemySkillCut', (c) => onSkillCut(b, c), { priority: 50 });
  b.on('battleEnd', ({ result }) => { if (st.lpLoss > 0 && result) result.lpLoss = (result.lpLoss ?? 0) + st.lpLoss; });
  return st;
}

/** @param {Battle} battle */
export function install(battle) { ensureInstalled(battle); }

export function registerMeta() {}

// ---------------------------------------------------------------------------------------------------------------
// global dispatchers

/** @param {Battle} b @param {Unit} e */
function onSpawn(b, e) {
  const kit = KITS[e.defId];
  if (typeof kit !== 'function') return;
  const ab = abOf(b, e);
  const list = safe(b, e, () => kit(ab, e, b)) || [];
  attach(b, e, list);
}

/** @param {Battle} b @param {HitEv} c */
function onHitOut(b, c) {
  const s = c.source;
  if (!s || s.side !== 'enemy' || !s.mem.ab || c.dmg.cancel) return;
  const ab = s.mem.ab;
  if (ab.atkType && c.dmg.isAttack && c.dmg.type !== 'element') c.dmg.type = ab.atkType;
  dispatch(b, s, 'hitOut', c);
}

/** @param {Battle} b @param {HitEv} c */
function onHitIn(b, c) {
  const t = c.target;
  if (!t || t.side !== 'enemy' || !t.mem.ab || c.dmg.cancel) return;
  const ab = t.mem.ab;
  dispatch(b, t, 'hitIn', c);
  if (c.dmg.cancel) return;
  const ty = c.dmg.type;
  if (ab.hitShield > 0 && (ty === 'phys' || ty === 'arts')) {
    // "可以抵挡一次物理或法术伤害" / 再生's aura shield: the whole instance is negated
    c.dmg.cancel = true;
    ab.hitShield--;
    if (ab.hitShield <= 0) b.fx('shieldBreak', { x: t.x, y: t.y, id: t.id });
  }
}

/** @param {Battle} b @param {DamagedEv} c */
function onDamaged(b, c) {
  const { source: s, target: t, dmg } = c;
  if (!dmg) return;
  if (dmg.type === 'element') { if (t && t.side === 'enemy' && t.mem.ab) dispatch(b, t, 'gauge', c); return; }
  if (t && t.side === 'enemy' && t.mem.ab) dispatch(b, t, 'taken', c);
  if (s && s.side === 'enemy' && s.mem.ab && dmg.isAttack && t && t.side === 'ally') dispatch(b, s, 'dealt', c);
}

/** @param {Battle} b @param {BeforeAttackEv} c */
function onBeforeAttack(b, c) {
  const a = c.attacker;
  if (a && a.side === 'enemy' && a.mem.ab) dispatch(b, a, 'before', c);
}

/** @param {Battle} b @param {KilledEv} c */
function onKill(b, c) {
  const v = c.victim;
  if (!v || v.side !== 'enemy' || !v.mem.ab) return;
  if (dispatch(b, v, 'killed', c) && v.hp > 0) c.stopPropagation = true; // revived: not a kill for anyone else
}

/** @param {Battle} b @param {DeathEv} c */
function onDeath(b, c) {
  const u = c.unit;
  const st = stOf(b);
  if (u && u.side === 'enemy' && u.mem.ab) dispatch(b, u, 'death', c);
  if (st.deathWatch.size) for (const w of [...st.deathWatch]) { if (!w.alive) { st.deathWatch.delete(w); continue; } dispatch(b, w, 'otherDeath', c); }
}

/** @param {Battle} b @param {BurstEv} c */
function onBurst(b, c) {
  const t = c.target;
  if (!t) return;
  if (t.side === 'enemy') { if (t.mem.ab) dispatch(b, t, 'burst', c); return; }
  // 假想敌：淤困 parasite: the host's burst spreads the same element to the 4 neighbouring allies — PRTS 天赋 "（中点判定，
  // 无视目标可选性，不受迷彩制约）": every ally there, 隐匿 / untargetable / airborne 起飞 ones included (`ignoreSelect`)
  const par = /** @type {Buff | null} */ (t.findBuff('ab:parasite'));
  if (par && par.data && par.data.src) {
    const src = par.data.src;
    for (const o of alliesInTiles(b, t.tileR, t.tileC, 'plus', 1)) if (o !== t) elem(b, src, o, c.element, par.data.spread, { ignoreSelect: true });
  }
}

/** @param {Battle} b @param {number} dt */
function onTick(b, dt) {
  const list = b.enemies;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const e = list[i];
    if (!e || !e.alive || !e.mem.ab) continue;
    const ab = e.mem.ab;
    for (let j = 0; j < ab.list.length; j++) {
      const a = ab.list[j];
      if (!e.alive) break;
      if (a.tick) {
        if (!(a.sil && e.s.flags.silence)) {
          if (!(a.iv > 0)) safe(b, e, () => a.tick(b, e, a, dt));
          else {
            a._acc = (a._acc ?? 0) + dt;
            let k = 0;
            while (a._acc >= a.iv - 1e-9 && k++ < 4 && e.alive) { a._acc -= a.iv; safe(b, e, () => a.tick(b, e, a, a.iv)); }
          }
        }
      }
      if (a.fire && a.cd != null) {
        // `pause(b, e)`: the skill's prefab mode is not the current one — `Enemy.OnSwitchMode` detaches the skills of the mode
        // it leaves (EnemySkill.Detach: disabled) and `Enemy.OnTick` ticks the enabled ones only, so its cooldown stands
        // still until the mode comes back (EnemySkill.Attach keeps the timer; 공식 클라에서 확인 2026-11-14)
        if (!(a.pause && a.pause(b, e))) a.left -= dt;
        // an attack-slot skill waits for its enemy's attack slot (skillSlot); the others fire on their own cooldown
        if (slotSkill(e, ab, a)) continue;
        if (a.left <= 1e-9 && canCast(e, a.sil, b) && (!a.cond || safe(b, e, () => a.cond(b, e, a)))) {
          a.left = Math.max(TICK, a.cd);
          castSkill(b, e, a);
        }
      }
    }
    if (ab.casting && ab.casting.open && e.alive) projCastOver(b, e, ab);
    // a held channel's cast played out (castLength: its `until`) — the cuts and the open casts end through onSkillCut
    if (ab.casting && ab.casting.hold && !ab.casting.open && ab.casting.chan && b.time >= ab.casting.until - 1e-9) chanEnd(b, e, ab.casting);
  }
}

/**
 * Cast skill ability `a` of enemy `e` now (its cooldown already set); `k` = the cast record onSkillSlot just opened
 * (`ab.casting`), null for a skill on its own cooldown (onTick).
 * @param {Battle} b @param {Unit} e @param {EnemyAbility} a @param {AbCast | null} [k]
 */
function castSkill(b, e, a, k = null) {
  a.casts = (a.casts ?? 0) + 1;
  e.skillAnimUntil = b.time + 0.5;
  // the cast's events name the official ability (docs/SIM.md events; the client binds the enemy's effects and
  // sounds by it — the prefab's `Skills/<name>`, research of the client's UnitMode.GenerateSignalId): fx
  // 'enemySkill' { id, ability, n } as it starts, and `ability` / `caster` on every fx the cast makes now. A skill whose
  // ability plays a three-part channel (`skillCast.*.chan`, chanCast) tells the view how long it lasts (chanView). When
  // its fire (the cast's start) returns the unit it casts on — or the units, first the main one — that target is `tgt`
  // (and all of them `tgts` when there are more): the channel's link line and the way it faces, the effects the
  // client plays on the cast's targets as it starts (`_castTargetEffects`, ON_CAST_START — 鼠王's DriftSand / SandStorm,
  // 乌顶巨角卢鲁's skill, 假想敌：械's SommonSquad)
  const s = a.name ? e.mem.ab.sk[a.name] : null;
  const ch = chanCast(s && s.cast);
  const p = a.name ? b.fx('enemySkill', { x: e.x, y: e.y, id: e.id, ability: a.name, n: a.casts, ...(ch ? chanView(e, ch, s.bb) : null) }) : null;
  if (ch && k) { k.chan = true; k.hold = !!ch.chan.wait; }
  // `atStrike`: its effect waits for the frame its ability waits for (castStrikeAt) — nothing when the cast is cut, the enemy
  // gone or another cast begun before it. As a function it is that effect, and `fire` the cast's start (what lasts while
  // it casts: BuffDuringCasting's buffs, its target taken)
  const run = (/** @type {AbFn} */ fn) => {
    const prev = b._castAbility;
    b._castAbility = a.name ? { id: e.id, ability: a.name } : null;
    try { return safe(b, e, () => fn(b, e, a)); } finally { b._castAbility = prev; }
  };
  // (a skill on its own cooldown, `k` null, casts no attack slot: a plain `atStrike` fires at once, a split one keeps its
  // two parts apart by the same frame, cut only by the enemy's death)
  const part = typeof a.atStrike === 'function' ? a.atStrike : null;
  // (castStrikeAt's null — a parallel group, a sequence after a projectile — compares as no frame, like 0)
  const at = a.atStrike && (k || part) && s ? /** @type {number} */ (castStrikeAt(e, s.cast, s.bb)) : 0;
  const t = at > 1e-9 && !part ? null : run(/** @type {AbFn} */ (a.fire));
  if (p) castTargets(p, e, t);
  if (at > 1e-9) {
    b.after(at - 1e-9, () => {
      if (!e.alive || (k && (e.mem.ab.casting !== k || !(e.castLeft > 0) || e.castSwing))) return;
      run(part ?? /** @type {AbFn} */ (a.fire));
    }, { owner: e });
  } else if (part) run(part);
}

/**
 * Put the target(s) a cast's fire returned on its 'enemySkill' payload `p`: `tgt` the first unit other than the caster, `tgts`
 * every one when there are more (a fire's other return values — an fx payload, a flag — name no target).
 * @param {Record<string, unknown>} p @param {Unit} e @param {unknown} t
 */
function castTargets(p, e, t) {
  const ids = (Array.isArray(t) ? t : [t]).filter((u) => isUnit(u) && u !== e).map((u) => /** @type {Unit} */ (u).id);
  if (!ids.length) return;
  p.tgt = ids[0];
  if (ids.length > 1) p.tgts = ids;
}

/** Whether `u` is a unit of the battle (an operator, a summon, an enemy). @param {unknown} u @returns {u is Unit} */
const isUnit = (u) => !!u && typeof u === 'object' && 'side' in u && (u.side === 'ally' || u.side === 'enemy') && 'id' in u && u.id != null;

/** The cast record of `cast` that plays a three-part channel — itself, else a child of its sequence (死亡之眼's LineAttack) — or null. @param {AbCastRec | null | undefined} cast @returns {AbCastRec & { chan: ChanRec } | null} */
function chanCast(cast) {
  if (!cast) return null;
  if (cast.chan && cast.chan.loop) return /** @type {AbCastRec & { chan: ChanRec }} */ (cast);
  for (const c of cast.subs || []) { const r = chanCast(c); if (r) return r; }
  return null;
}

/**
 * How long the view plays a skill's three-part channel (ThreePartChannelingAnimation, `skillCast.*.chan`; render/units.js
 * onEnemySkill reads its clips from the same record): `UpdatePlaybackSpeed` fits begin, loop and end into the ability's
 * time (`get_cooldown` — castLength of the channel's record) → `dur`; with `_waitForAttachFinishEvent` (`chan.wait`) the
 * loop lasts until the ability's attack-finish event instead (`DoPlayAnimation`, at most 360 s) → `hold` 1, and the cast's
 * end sends 'enemySkillEnd' (onSkillCut, onTick) [ASSUMED·미조사: that event is taken to come as the cast ends — what fires
 * it for a RangedAttack waiting for its projectile without `_fireAttackFinishWhenProjectileInvalid` (节日爵士乐手,
 * 萨卡兹王庭军精锐术师) was not read]. 공식 클라에서 확인 (both paths of DoPlayAnimation).
 * @param {Unit} e @param {AbCastRec & { chan: ChanRec }} ch @param {Record<string, number>} bb
 */
function chanView(e, ch, bb) {
  if (ch.chan.wait) return { hold: 1 };
  const dur = castLength(e, ch, bb);
  return dur > 0 ? { dur: Math.round(dur * 1000) / 1000 } : null;
}

/**
 * The channel of cast record `k` (castSkill marked it `chan`) is over — cut, an open cast's projectile gone, or a held
 * channel's (`hold`) time run: the view closes it on its end clip ('enemySkillEnd'; once).
 * @param {Battle} b @param {Unit} e @param {AbCast} k
 */
function chanEnd(b, e, k) {
  if (!k.chan || !k.a.name) return;
  k.chan = false;
  if (e.alive) b.fx('enemySkillEnd', { x: e.x, y: e.y, id: e.id, ability: k.a.name });
}

/**
 * Whether cooldown ability `a` of enemy `e` is cast at an attack slot: a skill of the enemy's table whose prefab was read
 * (`ab.sk[name].cast`, data/enemies.json `skillCast` — every one of the mode has the ATTACK and / or COMBAT family), on
 * an enemy that makes normal attacks — through the engine (ai.js enemyHasAttack) or through its kit's own attack loop
 * (`ab.ownAttack`: 假想敌：管 / 弦, “萨米的意志”, bosses.js ownAttackTurn — the loop offers its turn through the same hook).
 * An unarmed enemy (applyWay NONE / ATK 0) whose prefab's mode has an Attack ability that can be ready (enemies.json
 * `attackAbility`: one with a clip, or the clip-less EmptyActiveAbility of 枯朽萃聚使徒, cooldown 0) has the slot too,
 * without swinging: the client's `AttackWrapper.SearchTarget` asks `Unit.hasAttack` (= the mode's `_attack` ability), not
 * the table, then whether it `isReady` (a passive EmptyAbility, 圆仔's, never is). One without casts no skill at the
 * attack slot: the mode's other enemies of that kind (圆仔 `Show`, 转译基底·α `ChangeTo*`, 刺胄之弹 `Boom`) have their
 * skills cast by their talents' `TriggerEnemySkill`, which their kits model as their own triggers (공식 클라에서 확인).
 * @param {Unit} e @param {AbState} ab @param {EnemyAbility} a
 */
function slotSkill(e, ab, a) {
  const s = a.name != null ? ab.sk[a.name] : null;
  const slot = enemyHasAttack(e) || !!ab.ownAttack || !!(e.def && e.def.raw && e.def.raw.attackAbility && !(e.profile && e.profile.noAttack));
  return !!(s && s.cast) && slot;
}

/**
 * An attack slot of enemy `e` (the `enemySkillSlot` hook, ai.js enemyAttack; docs/rules/sim.md 「적 스킬 = 일반 공격 차례」):
 * the client's `Enemy.AttackWrapper.SearchTarget` — with the main attack ready, the enemy's skills of the attack family
 * that are available (`EnemySkill.CheckAvailable`: cooldown over, not silenced unless `_ignoreSilence` (our `sil`),
 * not stunned) and find their targets (our `cond`) are gathered, the highest `priority` wins and ties are drawn
 * (`IBattleRandom.Uniform`) — then `Cast` casts it in place of the normal attack and restarts the main attack's cooldown
 * (`ResetCooldown(true)`). The skill's own cooldown stands still while it casts (`EnemySkill.OnTick`: not while
 * `isCasting`) and restarts as the cast ends (`_OnCastFinish` → `m_cooldownTimer.Reset`): ready again cooldown + cast
 * later. `resetMain` (`_resetMainAbilityCdWhenCastEnd`): the main attack's cooldown restarts as the cast ends too, the
 * full interval (`waitFirst`) or none. Which wrapper looks depends on the block: a blocked enemy is in the COMBAT state
 * (`Enemy.States.MoveState.OnTick` switches to it as soon as `blocker` is set, before `_SearchAttackTarget`) and
 * `CombatWrapper._PickAbility` takes only the COMBAT family, an unblocked one only the ATTACK family (`skillCast.family`
 * = `_familyMask`: bit 1 ATTACK, bit 2 COMBAT; `EnemySkill.CheckFamilyMask`). A cast already started goes on when a block
 * comes (`AttackState.OnTick` does not look at the blocker).
 * @param {Battle} b @param {{ enemy: Unit, cast: { dur: number, atkCd?: number } | null }} c
 */
function onSkillSlot(b, c) {
  const e = c.enemy;
  const ab = e && e.mem && e.mem.ab;
  if (!ab || c.cast || !e.alive) return;
  const family = e.blockedBy ? FAMILY_COMBAT : FAMILY_ATTACK;
  const ready = [];
  for (const a of ab.list) {
    if (!a.fire || a.cd == null || !(a.left <= 1e-9) || !slotSkill(e, ab, a) || !canCast(e, a.sil, b)) continue;
    if (!((ab.sk[a.name].cast.family ?? FAMILY_ATTACK | FAMILY_COMBAT) & family)) continue;
    if (a.cond && !safe(b, e, () => a.cond(b, e, a))) continue;
    ready.push(a);
  }
  if (!ready.length) return;
  let top = -Infinity;
  for (const a of ready) top = Math.max(top, ab.sk[a.name].pri);
  const best = ready.filter((a) => ab.sk[a.name].pri === top);
  const a = best.length > 1 ? b.rng.pick(best) : best[0];
  const cast = ab.sk[a.name].cast;
  // a cast that waits for its projectile (`proj`) and whose kit tells when that projectile is gone (`a.projAlive`): open,
  // until onTick sees it gone (projCastOver) and the ability's own time has run (`min`), at most PROJ_WAIT_MAX
  const open = !!(a.projAlive && waitsProj(cast));
  const own = castLength(e, cast, ab.sk[a.name].bb);
  const dur = open ? PROJ_WAIT_MAX : own;
  a.left = Math.max(TICK, a.cd + dur);
  c.cast = { dur, atkCd: cast.resetMain && !open ? dur + (cast.waitFirst ? e.s.interval : 0) : e.s.interval };
  ab.casting = dur > 0 ? { a, cast, until: b.time + dur, open, min: open ? b.time + own : 0 } : null;
  castSkill(b, e, a, ab.casting);
  // a skill whose spell casts another one at once (TriggerEnemySkill with `_interruptCurAbility`, e.g. 复核洋流使者's
  // `0` → `1`): its fire hands that cast back (`a.next` = { dur }) and the slot plays it instead, cut like any skill cast
  const nx = /** @type {{ dur: number, a?: EnemyAbility, cast?: AbCastRec } | null | undefined} */ (a.next);
  if (nx) {
    a.next = null;
    c.cast = { dur: nx.dur, atkCd: e.s.interval };
    ab.casting = nx.dur > 0 ? { a: nx.a ?? a, cast: nx.cast ?? cast, until: b.time + nx.dur, open: false } : null;
  }
}

/** Does cast record `cast` wait for a projectile — itself, or a child of its sequence (死亡之眼's LineAttack)? */
/** @param {AbCastRec | null | undefined} cast @returns {boolean} */
const waitsProj = (cast) => !!cast && (!!cast.proj || (cast.kind === 'seq' && (cast.subs || []).some(waitsProj)));

/**
 * The longest an open cast (projCastOver) lasts, s: a finite bound standing for the client's `LARGE_TIME` wait — the
 * cast's end is sent as a cut stand (snapshot `standCut`) when the projectile goes; every kit's channel ends far earlier.
 */
const PROJ_WAIT_MAX = 60;

/**
 * The open cast of enemy `e` (onSkillSlot: a ranged ability with `_waitForProjectileInvalid` whose kit gives
 * `projAlive(b, e, a)`) ends as soon as its projectile is gone and the ability's own time is over — the client's
 * `RangedAttack.<OnWaitForPostDelay>` waits while `_CheckProjectileValid` (`AsyncUtil.WaitWhileForFixedSeconds`), then,
 * without `_waitForAnimEndWhenProjectileInvalid` (none of the kits that open one; `_minPostDelayWhenProjectileInvalid` is
 * read only with it), waits what is left of the ability's duration (`m_cachedDuration` − the time since the cast began,
 * when positive — our castLength: W `C4`'s clip 4.8 s outlasts its 3.2 s charge, a channel without a clip has its attack
 * time, the enemy's attack interval for `_timeMode` 0) and finishes: the enemy walks and attacks again and the skill's
 * cooldown restarts then (`EnemySkill._OnCastFinish`; the finish runs through the same path as a cut, interruptEnemyCast →
 * onSkillCut). 공식 클라에서 확인 2026-11-14.
 * @param {Battle} b @param {Unit} e @param {AbState} ab
 */
function projCastOver(b, e, ab) {
  const k = ab.casting;
  if (!k || !k.open || b.time < /** @type {number} */ (k.min) - 1e-9 || safe(b, e, () => /** @type {AbFn} */ (k.a.projAlive)(b, e, k.a))) return;
  interruptEnemyCast(b, e);
  if (ab.casting === k) ab.casting = null;   // the cast was no longer playing (castLeft cut elsewhere)
}

/**
 * Enemy `e`'s skill cast was cut short (the `enemySkillCut` hook: ai.js cutEnemySwing — a stun, freeze, sleep, 浮空, 失衡,
 * fear, leaving the field, or its kit's interruptEnemyCast). The client finishes the ability INTERRUPTED and
 * `EnemySkill._OnCastFinish` runs for any reason: the skill's cooldown restarts now (`m_cooldownTimer.Reset`, paused while
 * it cast), the main attack's too with `resetMain` (`ResetCooldown(_resetCdWaitFirstPeriod)`); the ability's `onCut` ends
 * what lasted only while it cast (BuffDuringCasting's buffs).
 * @param {Battle} b @param {{ enemy: Unit }} c
 */
function onSkillCut(b, c) {
  const e = c.enemy;
  const ab = e && e.mem && e.mem.ab;
  const k = ab && ab.casting;
  if (!k) return;
  ab.casting = null;
  if (!(b.time < k.until - 1e-9)) return;
  chanEnd(b, e, k);
  k.a.left = Math.max(TICK, k.a.cd);
  if (k.cast.resetMain) e.atkCd = k.cast.waitFirst ? e.s.interval : 0;
  if (k.a.onCut) safe(b, e, () => k.a.onCut(b, e, k.a));
}

// ---------------------------------------------------------------------------------------------------------------
// KITS: enemyKey → (ab, e, battle) => ability list. One line per key (name · what), in the family files
// (enemies/*.js); spread here in the original order — the same keys in the same order as before the split.

export const KITS = /** @type {Readonly<Record<string, EnemyKit>>} */ (Object.freeze({
  ...INVISIBLE_KITS,
  ...TIMES_KITS,
  ...ELEMENT_KITS,
  ...DOT_KITS,
  ...REFLECTION_KITS,
  ...REBORN_KITS,
  ...CRITIC_KITS,
  ...FLY_KITS,
  ...SPECIAL_KITS,
  ...BOUNTY_KITS,
  ...LEADER_KITS,
}));

/** Keys deliberately left to their data stats (reason). */
export const STATS_ONLY = Object.freeze({
  enemy_1000_gopro_2: 'plain melee', enemy_1001_bigbo: 'plain leader (bounty)', enemy_1005_yokai: 'FLY, no attack (engine)',
  enemy_1005_yokai_2: 'FLY ranged (engine)', enemy_1005_yokai_3: 'FLY ranged (engine)', enemy_1006_shield: 'heavy defender',
  enemy_1006_shield_2: 'heavy defender', enemy_1006_shield_3: 'heavy defender', enemy_1007_slime: 'plain',
  enemy_1010_demon: 'plain', enemy_1010_demon_2: 'plain', enemy_1041_lazerd: 'FLY arts (engine)', enemy_1041_lazerd_2: 'FLY arts (engine)',
  enemy_1043_zomsbr: 'regen is data (hpRecoveryPerSec 80)', enemy_1061_zomshd: 'regen is data (hpRecoveryPerSec 200)',
  enemy_1046_agent: 'plain', enemy_1071_dftman: 'plain', enemy_1092_mdgint: 'plain (bounty)',
  enemy_1251_lysyta: 'R-series armour interaction absent', enemy_1251_lysyta_2: 'same',
  enemy_1252_lysytb_2: 'same', enemy_1254_lypa_2: 'no listed ability', enemy_1325_cbgpro: 'plain', enemy_1325_cbgpro_2: 'plain',
  enemy_1381_winman: 'plain', enemy_1381_winman_2: 'plain', enemy_1387_winshd: '封冻/供暖器 zones absent', enemy_1415_mmkabi_2: 'chains absent',
  enemy_1137_plasm: 'plain', enemy_1433_dsbasi: 'plain', enemy_1433_dsbasi_2: 'plain',
  enemy_2002_bearmi: 'plain', enemy_2002_bearmi_2: 'plain',
  enemy_9012_acloon: '炎佑 is a bond summon (bonds.js)', enemy_9024_acsgnt: '“不眠雪山” is a bond summon (bonds/giant.js)',
  enemy_10040_cnvbln: '狂欢时刻 absent', enemy_10043_sailor: 'bridges/cannons absent',
  enemy_10073_mpcar: 'plain', enemy_10124_uashld_2: 'taunt is data; 矿工游击队 absent',
  // 规程's own units of our side, named only by its enemy effects' `enemy_exclude` (they are no enemy there): 莱塔尼亚's
  // summons (bonds/walker.js) and 宝藏探机's chest (bands/battle.js)
  enemy_9025_aclts: '“一个小节” is a bond summon (bonds/walker.js)', enemy_9026_acltm: '“一个乐部” is a bond summon (bonds/walker.js)',
  enemy_9038_achest: '“模拟宝藏” is a 指令 device of our side (bands/battle.js)',
});

// 圣杯 damage sharing (PRTS 愧悔魂灵圣杯: "令半径1.7范围内未受其他…圣杯影响的行动方式为地面的敌方单位受到的伤害降低至5%
// （…对斩杀伤害无效，不可对空），以此减少的伤害以真实伤害的形式由自身承担"; official buff enemy_lrrook[dmgCore] ON_TAKE_DAMAGE:
// skip a damage flagged INSTANT_KILL_LIKE_DAMAGE → CheckMotionMode WALK → DamageScale (ANY_ATTACK, × takeDmg.damage_scale,
// the removed part to `delta_damage`) → FixedValueDamage PURE of |delta_damage| on the chalice): a ground enemy near a
// living chalice keeps `share` (0.05) of the damage, the chalice takes the rest as true damage; the first chalice in
// range takes it. Until upstream 0f88afbb the enemy kept 95 % and the chalice took 5 % of the same type.
// [추정·엔진: the split is on the 'hit' amount, before DEF / RES — the stage of the other ON_TAKE_DAMAGE nodes here
// (Evade, DamageScale), PRTS's priority −3000 not modelled]
/** @param {Battle} b @param {HitEv} c */
function chaliceShare(b, c) {
  const st = stOf(b);
  if (!(st.chalices != null && st.chalices > 0)) return;
  const t = c.target;
  if (!t || t.side !== 'enemy' || t.isFlying || c.dmg.cancel || c.dmg.type === 'element') return;
  if (c.dmg.tags && (c.dmg.tags.includes('chalice') || c.dmg.tags.includes('execute'))) return; // (斩杀: 洛格斯 S1)
  for (const o of b.enemies) {
    if (!o.alive || o === t || o.defId !== 'enemy_1430_lrrook' || !o.mem.ab) continue;
    const a = o.mem.ab.list[0];
    if (!a || !(a.share > 0) || hypot(o.x - t.x, o.y - t.y) > a.r) continue;
    const kept = c.dmg.amount * a.share;
    const part = c.dmg.amount - kept;
    c.dmg.amount = kept;
    // a 无来源 burst's share stays 无来源, credited like the burst (damage.js)
    b.dealDamage(c.dmg.sourceless ? /** @type {Unit | null} */ (c.credit) : c.source, o, { amount: part, type: 'true', canDodge: false, sourceless: c.dmg.sourceless, tags: [...(c.dmg.tags || []), 'chalice'] });
    // enemy_lrrook[dmgCore] gives the hurt enemy enemy_lrrook[audio] (audioSignal enemy_lrrook_take_dmg) — a sound only
    b.fx('kitHit', { x: t.x, y: t.y, id: o.id, k: 'lrrook:share' });
    break;
  }
}
