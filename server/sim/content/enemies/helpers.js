// server/sim/content/enemies/helpers.js — shared helpers of the enemy kits (split from content/enemies.js; the module
// map is in its header): the constants several families use, the per-battle state, the ability bookkeeping (abOf /
// attach / dispatch, T, canCast …) and the selection and damage helpers (elem, hurt, areaAllies & friends, zone,
// spawnChildren, setForm, lpLoss, expose …).

import { ELEMENT, ALLY_COLLIDER_RADIUS, TICK } from '../../constants.js';
import { canTargetAlly, sortAllyTargets, areaSelectable, auraSelectable } from '../../targeting.js';
import { mitigate } from '../../damage.js';
import { hypot } from '../../detmath.js';
import { normShot } from '../../simdata.js';
import { enemyMode } from '../../ai.js';
/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */
/** @import { AbState, AbSkill, AbCtx, AbList } from '../enemies.js' */
/**
 * The enemy kits' per-battle state (stOf): the match's LP loss, the 解放 flag, the units watching every death, plus the
 * fields content/enemies.js and the kits keep there (`installed`, 黑雾, the chalices …).
 * @typedef {{ [key: string]: any, lpLoss: number, freedAll: boolean, deathWatch: Set<Unit> }} EnemyBattleState
 * A route a summon or a held enemy takes (remainingRoute, stayRoute): spawnEnemy's `route`.
 * @typedef {{ motion: string, start: number[], end: number[], checkpoints?: unknown[], steps?: Record<string, unknown>[] }} ChildRoute
 * spawnChildren's options (see there).
 * @typedef {{ route?: ChildRoute | null, mods?: Record<string, any> | null, spot?: { bound?: number, walk?: boolean,
 *   map?: boolean, delay?: number } | null, pos?: number[], tag?: string | null, countInTotal?: boolean }} SpawnChildOpts
 * A buff's `onTick` / `onExpire` argument (battle/status.js).
 * @typedef {{ battle: Battle, unit: Unit, buff: Record<string, any> }} BuffTick
 */

// ---------------------------------------------------------------------------------------------------------------
// constants (numbers that exist nowhere in the data)

/** 侵蚀 → engine gauge. */
export const EROSION = 'erosion';

/** Official erosion burst on operators (gamedata_const termDescriptionDict ba.dt.erosion; engine constants ELEMENT.erosion.ally). */
export const EROSION_BURST = Object.freeze({ defDown: ELEMENT.erosion.ally.defDown, physDamage: ELEMENT.erosion.ally.damage });

/** 重生 of a Revive[Trigger] knock-out before its husk (PRTS 深池逐火战士 and 假想敌：再生 天赋: "被击倒后重生，持续1s，随后变为
 *  怨恨的余烬 / 再生状态，1s内不移动且持有无敌+无法阻挡+失衡免疫"; both models' knock-out clips last 1 s). */
export const HUSK_REBIRTH = 1;

/** Death-explosion radius when the enemy has no official radius [ASSUMED]. */
const BOOM_RADIUS = 1.25;

/** 【污染秽蚀】 ticks once per second; "同名效果不叠加": a unit inside several zones takes one tick per second. */
const POLLUTION_INTERVAL = 1;

/**
 * 隐匿 that comes back sooner after a block than the general 3 s (PRTS 作战机制 §隐匿 "对于绝大部分可隐匿的敌人而言…不被阻挡的
 * 3秒后重新进入隐匿"; engine STEALTH_RESTORE): the enemy pages' 天赋 "隐匿（解除阻挡N秒后恢复）" — PRTS text search
 * "解除阻挡0秒后恢复" (21 enemies; these 6 are in this mode) and "解除阻挡1秒后恢复" (the two 家族灭迹人), checked
 * 2026-10-03. Every other stealthy enemy here has a plain "隐匿" (3 s), the 深池逐火 embers included. 清明 / 堂皇's veil
 * ("获得隐匿（解除阻挡0秒后恢复）") is kitInvisShield's.
 */
const STEALTH_RESTORE_BY_KEY = /** @type {Readonly<Record<string, number>>} */ (Object.freeze({
  enemy_10031_cnvsld: 0,     // 业余竞演者
  enemy_10034_cnvsax: 0,     // 节日爵士乐手
  enemy_9008_acbunn: 0,      // 假想敌：骨刺
  enemy_2034_sythef: 0,      // 流泪小子
  enemy_2034_sythef_2: 0,    // 流泪小子 (its stronger copy)
  enemy_1389_winbab_2: 0,    // 访问团强攻冠军
  enemy_1283_sgkill: 1,      // 家族灭迹人
  enemy_1283_sgkill_2: 1,    // 家族暗影灭迹人
}));

/**
 * 隐匿 of the 鸭爵 strategy's swapped-in enemies (spawn tag 'duck': content/bands/meta.js duckReplace) comes back no sooner
 * than this many seconds after a block ends — in practice 流泪小子 (enemy_2034_sythef_2, the only one of the four with 隐匿;
 * officially 0 s, STEALTH_RESTORE_BY_KEY). A deliberate deviation from the official game: the owner's decision of
 * 2026-10-07 「鸭爵策略产生的泪眼汪汪…要不等待个1秒这样再重新隐匿」 (community report of 2026-10-07, GitHub #214). The same
 * enemy anywhere else — the 流泪小子 of a bounty card (enemy_2034_sythef), a test spawn — keeps the official time.
 */
const DUCK_STEALTH_RESTORE = 1;

/** Splash radius (中点判定 around the target) of 烹泉 / 沏虹's attack (PRTS 天赋 "普通攻击对目标对及目标周围半径1.0范围内的所有
 *  我方单位造成法术普通伤害（无视迷彩，不可对空）") and of 集团军重型火炮's shell (PRTS "对目标半径1.0范围内的所有我方单位造成攻击力
 *  100%的物理伤害（此弹道会强制击中主目标，碰撞无视迷彩，不可对空）"). */
const TEA_SPLASH_RADIUS = 1, SHELL_SPLASH_RADIUS = 1;

/** Every Nth attack for "数次攻击后" abilities without an SP cost in the data [ASSUMED]; with a cost N = spCost + 1
 *  (official 粉碎攻坚手 text for spCost 2: "攻击2次后，下一次攻击" ⇒ 3rd; 码头水手 / 澪 / 清扫小队 spCost 3 ⇒ 4th). */
const NTH_ATTACK = 3;

/** @param {AbSkill | null | undefined} s */
export const nthOf = (s) => (s && s.sp > 0 ? s.sp + 1 : NTH_ATTACK);

// ---------------------------------------------------------------------------------------------------------------
// per-battle state + installation

/** @type {WeakMap<Battle, EnemyBattleState>} */
const STATE = new WeakMap();

/** @param {Battle} b @returns {EnemyBattleState} */
function stOf(b) {
  let st = STATE.get(b);
  if (!st) { st = { lpLoss: 0, freedAll: false, deathWatch: new Set() }; STATE.set(b, st); }
  return st;
}

// ---------------------------------------------------------------------------------------------------------------
// ability bookkeeping

/** The enemy's ability record (created on demand). @param {Battle} b @param {Unit} e @returns {AbState} */
export function abOf(b, e) {
  if (e.mem.ab) return e.mem.ab;
  const key = e.defId;
  const ov = (b.enemyOverrides && (b.enemyOverrides[key] ?? b.enemyOverrides[e.def && e.def.key])) || null;
  const raw = (e.def && e.def.raw) || {};
  const t = { ...((e.def && e.def.talent) || {}), ...((ov && ov.talents && ov.talents.bb) || {}) };
  const tS = { ...((raw.talents && raw.talents.bbStr) || {}), ...((ov && ov.talents && ov.talents.bbStr) || {}) };
  /** @type {Record<string, AbSkill>} */
  const sk = {};
  const casts = raw.skillCast || null;
  for (const s of (ov && Array.isArray(ov.skills) ? ov.skills : (e.def && e.def.skills) || [])) {
    if (!s || s.prefabKey == null) continue;
    // `name`: the official ability name (the gamedata prefabKey — the prefab's `Skills/<name>`, case aside), carried by the
    // cast's events (content/enemies.js onTick: fx 'enemySkill' and the `ability` of the fx made by the cast); `proj`: its
    // official projectile (data/enemies.json skills[i].proj, simdata.js normShot — plus its `life`, SimpleProjectile
    // `_lifeTime`: a FIXED_DIRECTION shot's flight, lineShot), null when it has none; `pri`: its table priority and `cast`:
    // how the client casts it (data/enemies.json `skillCast`, by its name case aside) — an attack-slot skill
    // (content/enemies.js skillSlot), null when the prefab was not read
    const proj = normShot(s.proj);
    if (proj && s.proj.life > 0) /** @type {Record<string, any>} */ (proj).life = s.proj.life;
    const cast = (casts && casts[String(s.prefabKey).toLowerCase()]) || null;
    sk[s.prefabKey] = { name: s.prefabKey, cd: num(s.cooldown, 0), icd: num(s.initCooldown, 0), sp: num(s.spCost, 0), pri: num(s.priority, 0), bb: s.bb || {}, bs: s.bbStr || {}, proj, cast };
  }
  e.mem.ab = { key, t, tS, sk, list: [], times: null, hitShield: 0, atkType: null, immune: null, origMaxHp: e.base.maxHp };
  return e.mem.ab;
}

/** Attach abilities to an enemy (calls their spawn()). @param {Battle} b @param {Unit} e @param {AbList} list */
export function attach(b, e, list) {
  const ab = abOf(b, e);
  for (const a of list) {
    if (!a) continue;
    if (a.cd != null) a.left = num(a.left, num(a.icd, 0));
    ab.list.push(a);
    if (a.spawn) safe(b, e, () => /** @type {NonNullable<typeof a.spawn>} */ (a.spawn)(b, e, a, ab));
  }
  return ab;
}

/** @param {Battle} b @param {Unit | null} e @param {() => any} fn what the handler returns (a kit's `fire` its target …) @returns {any} */
function safe(b, e, fn) {
  try { return fn(); } catch (err) { b._handlerError('content:enemies', e, err); return undefined; }
}

/** @param {Battle} b @param {Unit | null | undefined} e @param {string} name @param {AbCtx} c @returns {boolean} */
function dispatch(b, e, name, c) {
  const ab = e && e.mem && e.mem.ab;
  if (!ab) return false;
  let any = false;
  for (const a of ab.list) {
    const f = a[name];
    if (!f) continue;
    if (a.sil && e.s.flags.silence) continue;
    try { if (f.call(a, c, b, e, a, ab)) any = true; } catch (err) { b._handlerError(`enemies:${name}`, e, err); }
  }
  return any;
}

/** @param {unknown} v @param {number} d @returns {number} */
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** First finite talent value among keys. @param {AbState} ab @param {...string} keys @returns {number | undefined} */
export function T(ab, ...keys) { for (const k of keys) { const v = ab.t[k]; if (typeof v === 'number' && Number.isFinite(v)) return v; } return undefined; }

/** @param {Unit} e */
export function silenced(e) { return !!e.s.flags.silence; }

/**
 * Is enemy `e` in its 失衡 (UNBALANCE) state now (battle/displacement.js _unbalance; the 1e-9 keeps a float-summed
 * end — 35/30 s — on its frame)? PRTS 异常效果图鉴/失衡免疫: 「失衡期间无法自主移动、发动攻击、使用技能」 — content skills
 * (canCast), blinks and scripted moves wait for its end.
 * @param {Battle | null | undefined} b @param {Unit | null | undefined} e
 */
export function unbalancedNow(b, e) { return !!(b && e && b.time < /** @type {number} */ (e.unbalanceUntil) - 1e-9); }

/** Can enemy `e` use a skill now: alive, on the field, not stunned, not silenced (`sil`), not in its 失衡 state (`b` given).
 * @param {Unit} e @param {unknown} sil @param {Battle | null} [b] */
export function canCast(e, sil, b = null) { return e.alive && !e.hidden && !e.s.flags.stun && !(sil && e.s.flags.silence) && !unbalancedNow(b, e); }

// ---------------------------------------------------------------------------------------------------------------
// helpers (exported for bosses.js)

/** Element damage (erosion mapped onto the engine gauge); `ignoreSelect` / `tags` as hurt().
 * @param {Battle} b @param {Unit | null} src @param {Unit | null | undefined} tgt @param {string} el
 * @param {number} amount @param {{ ignoreSelect?: boolean, tags?: string[] }} [opts] */
export function elem(b, src, tgt, el, amount, { ignoreSelect = false, tags = [] } = {}) {
  if (!tgt || !tgt.alive || !(amount > 0)) return 0;
  const element = el === 'erosion' ? EROSION : el;
  return b.dealDamage(src, tgt, { type: 'element', element, amount, ignoreSelect, tags: ['enemyAbility', ...tags] });
}

/**
 * Skill / ability damage (no dodge unless asked). `ignoreSelect` = no selection the target's 无法选择 effects stop
 * (abilities that "无视无法选择", direct picks, a flying unit's blast credited to a ground leader): it also reaches an
 * airborne 起飞 ally, which a ground enemy's damage otherwise skips (damage.js, targeting.js evadesGround).
 * `sourceless` = 无来源 damage (damage.js): `src` keeps the credit, hooks and the source's damage-dealt stats do not see it.
 * @param {Battle} b @param {Unit | null} src @param {Unit | null | undefined} tgt @param {number} amount
 * @param {string} [type] @param {{ canDodge?: boolean, tags?: string[], isSkill?: boolean, ignoreSelect?: boolean,
 *   sourceless?: boolean }} [opts]
 */
export function hurt(b, src, tgt, amount, type = 'phys', { canDodge = false, tags = [], isSkill = true, ignoreSelect = false, sourceless = false } = {}) {
  if (!tgt || !tgt.alive || !(amount > 0)) return 0;
  return b.dealDamage(src, tgt, { amount, type, canDodge, isSkill, ignoreSelect, sourceless, tags: ['enemyAbility', ...tags] });
}

/** Allies whose tile is within `n` of (r, c): 'plus' = Manhattan (周围四格), 'box' = Chebyshev (周围8格).
 * @param {Battle} b @param {number} r @param {number} c @param {string} [shape] @param {number} [n] */
export function alliesInTiles(b, r, c, shape = 'plus', n = 1) {
  const out = [];
  for (const a of b.allies()) {
    if (a.hidden) continue;
    const dr = Math.abs(a.tileR - r), dc = Math.abs(a.tileC - c);
    if (shape === 'plus' ? dr + dc <= n : Math.max(dr, dc) <= n) out.push(a);
  }
  return out;
}

/** Allies within radius that enemy `e` could target (ranged rules: stealth / untargetable skipped).
 * @param {Battle} b @param {Unit} e @param {number} r @param {{ ranged?: boolean, x?: number, y?: number }} [opts] */
export function targetsNear(b, e, r, { ranged = true, x = e.x, y = e.y } = {}) {
  return b.alliesInRadius(x, y, r).filter((a) => canTargetAlly(e, a, ranged) && !(e.lpGroundPicks && a.isFlying)); // local patch: client skill selector 1 (local-patch.js NO_AIR_PICKS)
}

/** Every targetable ally on the field. @param {Battle} b @param {Unit} e */
export function allTargets(b, e) {
  return b.allies().filter((a) => canTargetAlly(e, a, true) && !(e.lpGroundPicks && a.isFlying)); // local patch: client skill selector 1 (local-patch.js NO_AIR_PICKS)
}

/**
 * The allies an AREA effect of enemy `src` selects within `r` of (x, y) — splash, blast, area skill / status, pulse, zone
 * tick, chain or bounce jump (targeting.js areaSelectable: no 隐匿 ally, the blocker included, no untargetable or sleeping ally, no 起飞 one
 * for a ground `src`; 迷彩 is not checked). `src` = the enemy whose effect it is (null: none — 隐匿 still applies). A
 * locked target goes first through targetAndArea. Abilities PRTS marks "无视无法选择 / 无视可选性" use b.alliesInRadius with
 * `ignoreSelect` instead.
 * @param {Battle} b @param {Unit | null} src @param {number} x @param {number} y @param {number} r
 */
export function areaAllies(b, src, x, y, r) {
  return b.alliesInRadius(x, y, r).filter((a) => areaSelectable(src, a));
}

/** alliesInTiles for an area effect of `src` (周围四格 / 周围八格 / cross / 3×3 areas — 格子判定): areaSelectable.
 * @param {Battle} b @param {Unit | null} src @param {number} r @param {number} c @param {string} [shape] @param {number} [n] */
export function areaAlliesInTiles(b, src, r, c, shape = 'plus', n = 1) {
  return alliesInTiles(b, r, c, shape, n).filter((a) => areaSelectable(src, a));
}

/** Every ally on the field a whole-field ability of `src` selects ("对场上所有我方单位…": 【大潮】, 【斥退】 …). @param {Battle} b @param {Unit | null} src */
export function fieldAllies(b, src) {
  return b.allies().filter((a) => areaSelectable(src, a));
}

/**
 * The allies within `r` of (x, y) a buff aura of enemy `src` takes (targeting.js auraSelectable: no 隐匿 ally, the blocker included,
 * untargetable or sleeping ally — PRTS "隐匿状态下的单位一般无法被敌方的…Buff选择器选中"; an airborne 起飞 ally is still
 * taken [ASSUMED, §21.22]). 寒霜's aura, which PRTS says ignores 隐匿, keeps b.alliesInRadius (allyAura).
 * @param {Battle} b @param {Unit | null} src @param {number} x @param {number} y @param {number} r
 */
export function auraAllies(b, src, x, y, r) {
  return b.alliesInRadius(x, y, r).filter((a) => auraSelectable(src, a));
}

/**
 * A locked target `t` and the allies an area takes around it: the target was picked directly when the ability started
 * (an attack's target, a channel's or a C4's lock), so a 隐匿 it gains meanwhile does not save it — PRTS 异常效果 "'直接选中'
 * 的能力不会进行具体的目标选择，故同样不受这些仅在选择时生效的异常效果制约"; only the others are an area selection (`area`).
 * @param {Unit | null | undefined} t @param {Unit[]} area
 */
export function targetAndArea(t, area) {
  return t && t.alive && t.deployed ? [t, ...area.filter((u) => u !== t)] : area;
}

/** Engine priority (blocker → taunt → latest deployed) on a copy. @param {Unit} e @param {Unit[]} list */
export function byPriority(e, list) { return sortAllyTargets(e, list.slice()); }

/**
 * An HP-loss / damage zone. `tick(units)` runs every `iv` s for `life` s on the allies inside: `pick(x, y, r)` chooses
 * them — by default every ally in the circle (【污染秽蚀】 "无视无法选择"); the other zones (dmgZone, 烹泉's steam) pass
 * their area selection (areaAllies). `src` + `ability`: the enemy whose official ability leaves it (the prefab's
 * `Skills/<name>` / `Talent/<name>`) — the fx 'zone' names them, so the render draws that ability's projectile effects there.
 * @param {Battle} b @param {{ x: number, y: number, r: number, life: number, iv?: number, kind?: string, tick: (units: Unit[]) => void,
 *   pick?: ((x: number, y: number, r: number) => Unit[]) | null, src?: Record<string, any> | null,
 *   ability?: string | null }} opts
 */
export function zone(b, { x, y, r, life, iv = 1, kind = 'zone', tick, pick = null, src = null, ability = null }) {
  b.fx('zone', { x, y, r, dur: life, kind, ...(src && src.id != null && ability ? { id: src.id, ability } : {}) });
  let left = life;
  const h = b.every(iv, () => {
    tick(pick ? pick(x, y, r) : b.alliesInRadius(x, y, r));
    left -= iv;
    if (left <= 1e-6) h.cancel();
  });
  return h;
}

/** Remaining route of an enemy from its current position (for summons / phantoms that continue its path). @param {Unit} e @returns {ChildRoute} */
export function remainingRoute(e) {
  const R = e.route;
  const here = [e.y, e.x];
  if (!R || !Array.isArray(R.legs) || !R.legs.length) return { motion: e.motion === 'FLY' ? 'FLY' : 'WALK', start: here, end: here, checkpoints: [] };
  const steps = [];
  let end = null;
  for (let i = Math.max(0, R.legIdx); i < R.legs.length; i++) {
    const L = R.legs[i];
    if (L.final) { end = [L.r, L.c]; break; }
    if (L.t === 'move') steps.push(L.dr != null ? { t: 'move', p: [L.r, L.c], o: [L.dr, L.dc] } : { t: 'move', p: [L.r, L.c] });
    else if (L.t === 'wait') steps.push({ t: 'wait', s: i === R.legIdx && R.waitLeft != null ? R.waitLeft : L.time });
    else if (L.t === 'disappear') steps.push({ t: 'disappear' });
    else if (L.t === 'appear') steps.push({ t: 'appear', p: [L.r, L.c] });
  }
  if (!end) { const last = R.legs[R.legs.length - 1]; end = last && last.r != null ? [last.r, last.c] : [Math.round(e.y), Math.round(e.x)]; }
  /** @type {ChildRoute} */
  const route = { motion: e.motion === 'FLY' ? 'FLY' : 'WALK', start: here, end, checkpoints: [] };
  if (steps.length) route.steps = steps;
  return route;
}

/** A route that keeps an enemy in place (content moves it by hand). @param {Unit} e @param {number} [secs] @returns {ChildRoute} */
export function stayRoute(e, secs = 99999) {
  const p = [Math.round(e.y), Math.round(e.x)];
  return { motion: e.motion === 'FLY' ? 'FLY' : 'WALK', start: p, end: p, steps: [{ t: 'wait', s: secs }] };
}

/**
 * Mods copied onto a split or summoned child. The parent's stat multipliers travel; a kill bounty does not
 * (owner 2026-10-04: the main body alone carries it — GitHub #67, #89-2). `bountyId` is the 悬赏 card and
 * `bountyCoins` is the coin copy the match writes for 联防. The parent object is left as it is.
 * @param {Record<string, any> | null | undefined} mods
 */
function modsWithoutBounty(mods) {
  if (!mods || typeof mods !== 'object') return mods ?? null;
  if (mods.bountyId == null && mods.bountyCoins == null) return mods;
  const copy = { ...mods };
  delete copy.bountyId;
  delete copy.bountyCoins;
  return copy;
}

/**
 * The tile a summon node spawns on (LitePhysicsUtil.FindNearestPassableTile): the nearest tile to (x, y) that `walk`
 * (the node's `_passableMask` WALK_ONLY) lets a ground unit through — any tile with NONE —, the first in row order on a
 * tie (a strict less-than); null when there is none. (Its `_trySummonOutsideWhenInObstacle` weight is not modelled: no
 * 规程 summoner stands on an obstacle.)
 * @param {Battle} b @param {number} x @param {number} y @param {boolean} walk @returns {number[] | null}
 */
function summonTile(b, x, y, walk) {
  const g = b.grid, R = g.rect;
  let best = null, bd = Infinity;
  for (let r = R.r0; r <= R.r1; r++) {
    for (let c = R.c0; c <= R.c1; c++) {
      if (walk && !g.groundPassable(r, c)) continue;
      const d = (c - x) * (c - x) + (r - y) * (r - y);
      if (d < bd - 1e-12) { bd = d; best = [r, c]; }
    }
  }
  return best;
}

/**
 * Where a child of the side-by-side spread stands: its spot when a ground unit walks there, else the parent's — the
 * official dead-spawn node (enemy_dead_spawn: `_passableMask` WALK_ONLY, a spot kept only where Route.CheckReachable,
 * else the centre) —, else (a parent that died with its centre just over a wall's edge: the walk's bounce lets a body
 * graze it) that position pulled into the nearest tile a ground unit walks, 0.45 at most from its centre
 * [추정·엔진: the official host never stands in a wall]. A child left inside a wall tile walks straight through it to
 * the goal (歌蕾蒂娅 S3's 捕网 pressing 磨砻 against 战场 #05's wall: its 木制瑞印 crossed to her side;
 * docs/rules/sim.md 「사망 소환물의 자리」).
 * @param {Battle} b @param {number[]} pos @param {Unit} parent @returns {number[]}
 */
function groundSpot(b, pos, parent) {
  const g = b.grid;
  /** @param {number[]} p */
  const ok = (p) => g.groundPassable(Math.round(p[0]), Math.round(p[1]), true);
  if (ok(pos)) return pos;
  const home = [parent.y, parent.x];
  if (ok(home)) return home;
  const t = summonTile(b, parent.x, parent.y, true);
  if (!t) return home;
  /** @param {number} v @param {number} c */
  const clamp = (v, c) => Math.max(c - 0.45, Math.min(c + 0.45, v));
  return [clamp(parent.y, t[0]), clamp(parent.x, t[1])];
}

/**
 * Spawn `n` enemies at the parent's position that continue its route. Returns the spawned units.
 * `opts.spot` { bound, walk, map, delay }: the official summon nodes' spot (SummonEnemiesFollowMyRoute / …WithBuff,
 * Scheduler.SpawnSummonedEnemyTrackedInGameMode): with `_useMapPosition` off the centre of summonTile(the source spot),
 * with it on (`map`) the source spot itself; then — `_ignoreOffset` off — each one at that point + (Range(−bound, bound),
 * Range(−bound, bound)) (x drawn first; `bound` = the blackboard `offset_bound` over the node's `_randomOffsetBound`), kept
 * only where its route can reach (Route.CheckReachable: a tile a ground unit walks), else that point — for `map` and a
 * ground parent through groundSpot (a parent that died grazing a wall). `delay` (`_useRandomDelay` with its
 * `_randomDelayRange`): the node draws each one's wait, Range(0, delay), as it runs, and each spawns that much later — its
 * jitter drawn then — on the route and from the point taken at the call; the battle waits for them (`holdsBattle`), and
 * nothing is returned. Without `spot`: the source spot, several 0.2 apart — a ground parent's children each where a
 * ground unit walks (groundSpot).
 * @param {Battle} b @param {Unit} parent @param {string} key @param {number} n @param {SpawnChildOpts} [opts] @returns {Unit[]}
 */
export function spawnChildren(b, parent, key, n, opts = {}) {
  /** @type {Unit[]} */
  const out = [];
  const route = opts.route ?? remainingRoute(parent);
  const cnt = Math.max(0, Math.min(20, Math.floor(n)));
  const mods = modsWithoutBounty(opts.mods ?? parent.mods ?? null);
  const spot = opts.spot ?? null;
  const sp = spot ? (opts.pos ?? [parent.y, parent.x]) : null;
  // (`sp` is set only with `spot`)
  const tile = sp && !/** @type {NonNullable<typeof spot>} */ (spot).map ? summonTile(b, sp[1], sp[0], /** @type {NonNullable<typeof spot>} */ (spot).walk !== false) : null;
  const bound = spot ? Math.max(0, Number(spot.bound) || 0) : 0;
  const ground = parent.motion !== 'FLY';
  const at = { x: parent.x, y: parent.y, id: parent.id };
  const owners = { ownerPlayerId: parent.ownerId ?? null, sourcePlayerId: parent.sourcePlayerId ?? null };
  /** @param {number} i */
  const place = (i) => {
    if (!sp) {
      const off = cnt > 1 ? (i - (cnt - 1) / 2) * 0.2 : 0;
      const pos = opts.pos ?? [parent.y, parent.x + off];
      return !opts.pos && ground ? groundSpot(b, pos, parent) : pos;
    }
    let pos = tile ? [tile[0], tile[1]] : sp;
    if (bound > 0) {
      const dx = b.rng.range(-bound, bound), dy = b.rng.range(-bound, bound);
      const y = pos[0] + dy, x = pos[1] + dx;
      if (b.grid.groundPassable(Math.round(y), Math.round(x))) pos = [y, x];
    }
    return /** @type {NonNullable<typeof spot>} */ (spot).map && ground ? groundSpot(b, pos, parent) : pos;
  };
  /** @param {number} i */
  const make = (i) => b.spawnEnemy(key, { pos: place(i), route, mods, tag: opts.tag ?? null, countInTotal: opts.countInTotal, ...owners });
  const wait = spot ? Math.max(0, Number(spot.delay) || 0) : 0;
  if (wait > 0) {
    for (let i = 0; i < cnt; i++) {
      b.after(b.rng.range(0, wait), () => { if (make(i)) b.fx('summon', { ...at, key, n: 1 }); }, { holdsBattle: true });
    }
    return out;
  }
  for (let i = 0; i < cnt; i++) {
    const c = make(i);
    if (c) out.push(c);
  }
  if (out.length) b.fx('summon', { ...at, key, n: out.length });
  return out;
}

/** Move a unit straight toward (tx, ty) by `dist` tiles. Returns true on arrival. @param {{ x: number, y: number }} u @param {number} tx @param {number} ty @param {number} dist */
export function stepToward(u, tx, ty, dist) {
  const dx = tx - u.x, dy = ty - u.y;
  const d = hypot(dx, dy);
  if (d <= dist + 1e-9) { u.x = tx; u.y = ty; return true; }
  u.x += (dx / d) * dist;
  u.y += (dy / d) * dist;
  return false;
}

/**
 * Set a 频次 unit's hits (maxHp := hits, full): the whole number of hits a max HP of `n` takes, at least 1 — the client's
 * `PropLikeEnemy.DoApplyModifier` takes exactly 1 HP per damage instance and the max HP stays a
 * fixed-point fraction (`Attributes._CalculateAttributeValue`, no rounding), so 2 × 1.08 = 2.16 HP falls on the 3rd hit:
 * ceil(n). (The bar shows whole hits here, the client 1/2.16 steps — display only.)
 * @param {Unit} e @param {number} n
 */
export function setHits(e, n) {
  const h = Math.max(1, Math.ceil(n - 1e-9));
  e.base.maxHp = h;
  e.markDirty();
  void e.s;
  e.hp = h;
}

const HIT_COUNT_KEY = 'ab:hitCount';

/** 频次 on/off: every damage instance removes exactly 1 HP (engine flag; `artsOnly` = 茶器, physical instances remove 0). @param {Battle} b @param {Unit} e @param {unknown} on @param {boolean} [artsOnly] */
export function hitCount(b, e, on, artsOnly = false) {
  if (!on) { b.removeBuff(e, HIT_COUNT_KEY); return; }
  b.addBuff(e, { key: HIT_COUNT_KEY, persist: true, flags: artsOnly ? { hitCountArts: true } : { hitCount: true } });
}

/** @param {Unit} e */
export const isHitCount = (e) => !!e.findBuff(HIT_COUNT_KEY);

/**
 * The enemy's model takes another form (render/units.js FORMS: a clip set of its skeleton): kept on the unit
 * (`e.form`, published by snapshot.js unitInfo — a view built mid-battle from fieldMeta(): a teammate's field watched
 * later, 联防 observers, a reconnect — starts in it) and announced by the fx `fxKind` (+ id, x, y, `params`) carrying it
 * as `form` (a 'phase' fx also as its `kind`). The `form` key marks the fx as state (shared/protocol.js fxForm): the
 * client never drops it, not in a catch-up frame nor while its tab is hidden. Barrier / charge 'phase' kinds are no
 * forms: they go through b.fx directly, without `form`.
 */
/**
 * Fire an enemy ability's official projectile `shot` (data/enemies.json `skills[i].proj` …, simdata.js normShot) from
 * `from` (a unit, or a point with the shooter as `opts.source`) at unit `t`; `onHit(target)` runs as it arrives —
 * `target` null when it fizzled on a dead target with `opts.hitDead`. Timing as the engine's normal attacks (ai.js
 * shotSpeed, docs/rules/sim.md 「적 투사체」): TRACE_TARGET_WITH_SPEED / PARACURVE / HARPOON home at `speed` (a FIXED_DIRECTION
 * one that should fly straight goes through lineShot); ATTACH / NONE / no shot land now. An fx 'enemyShot' { id (shooter), from (the unit it leaves, when not the
 * shooter), tgt, key, move, speed, t (flight s) } lets the client draw the official projectile (docs/SIM.md events);
 * `opts.zone` marks it `zone: 1` — it lands as an area whose fx 'zone' draws the projectile's reach effects (假想敌：蚀裂's
 * 毒雾). `onHit` also gets the projectile's arrival point ({ x, y }; none when it lands at once). Returns the flight time
 * in seconds.
 * @param {Battle} b @param {{ x: number, y: number, id?: number }} from @param {Unit} t
 * @param {Record<string, any> | null | undefined} shot @param {(target: Unit, at?: { x: number, y: number }) => unknown} onHit
 * @param {{ source?: Unit | null, zone?: boolean, visual?: string, hitDead?: boolean }} [opts] @returns {number}
 */
export function shoot(b, from, t, shot, onHit, opts = {}) {
  const src = opts.source ?? (from && from.id != null ? from : null);
  const v = shot && shot.speed > 0 && shot.move !== 'ATTACH' && shot.move !== 'NONE' ? shot.speed : 0;
  const d = hypot(t.x - from.x, t.y - from.y);
  const flight = v > 0 ? d / v : 0;
  if (shot) {
    b.fx('enemyShot', { x: from.x, y: from.y, id: src ? src.id : null, ...(from.id != null && from !== src ? { from: from.id } : {}),
      tgt: t.id, key: shot.key, move: shot.move, speed: v, t: Math.round(flight * 1000) / 1000, ...(opts.zone ? { zone: 1 } : {}) });
  }
  if (!(v > 0) || !(d > 1e-9)) { onHit(t); return 0; }
  b.addProjectile({ from, target: t, speed: v, visual: opts.visual ?? 'enemy', source: src, hitDead: !!opts.hitDead, fixed: shot?.adjust === 0, noWipe: shot?.elim === 0, onHit: (/** @type {{ target: Unit, x: number, y: number }} */ c) => onHit(c.target, c) });
  return flight;
}

/**
 * The allies a 直击 of enemy `e` can aim at: the client's CrossTileRange (every tile of the enemy's own row and column, no
 * distance — CrossTileRange.CheckTargetIn: the selector's grid row or column) through AdvancedSelectorWithTrapSheltr
 * `_checkOnTheSameLine` with the prefab's offsets X −0.5…0.5 / Y −0.5…0.1 (the candidate's position minus the target's,
 * within either), every motion; nearest first. 重弩突袭者 (invisible.js kitCrossbow, prefab Skills/CrossAttack/Selector), 速射轻弩手 /
 * 速射劲弩手 and 马特奥的近卫 (critic.js) all have it.
 * @param {Battle} b @param {Unit} e
 */
export function crossTargets(b, e) {
  const r = Math.round(e.y), c = Math.round(e.x);
  /** @param {number} v @param {number} lo @param {number} hi */
  const between = (v, lo, hi) => v > lo - 1e-9 && v < hi + 1e-9;
  return b.allies().filter((u) => canTargetAlly(e, u, true) && (u.tileR === r || u.tileC === c)
    && (between(e.x - u.x, -0.5, 0.5) || between(e.y - u.y, -0.5, 0.1)))
    .sort((p, q) => hypot(p.x - e.x, p.y - e.y) - hypot(q.x - e.x, q.y - e.y) || p.id - q.id);
}

/**
 * Fire an official FIXED_DIRECTION projectile (`shot`: data/enemies.json `skills[i].proj`, move FIXED_DIRECTION — 重弩突袭者
 * 直击's projectile_enemy_msnip) from `from` the way of `aim` (a unit or point): it flies straight along the nearest of the
 * four map axes and ends on the first ally it touches — `onHit(target, { x, y })` then, with where it stopped — or, touching none, after `shot.life` s
 * (`onExpire()`). Official client (EN, docs/rules/sim.md 「FIXED_DIRECTION 투사체」): FarthestPointMovement._SetTargetPosAndDirection
 * (`_useDirToTarget` → MapUtil.NormalizeDirectionToFourWays) and AdvancedMovement.OnInit (no reach point for FIXED_DIRECTION:
 * it never "arrives"); its SelectorHitBehaviour (`_hitPasserby`, every `_interval` 0.03 s) takes the allies whose collider
 * meets the projectile's circle (`opts.radius`, prefab CircleCollider2D 0.3), at most one, and SimpleProjectile (LIMITED
 * `_maxHitNum` 1, `_stopAfterMaxHit`) stops it there; `_lifeTime` ends it otherwise. `opts.canHit(u)` filters the allies
 * (default areaSelectable — a projectile's collision ignores 迷彩). An fx 'enemyShot' { id, tgt, key, move, speed, t, dir,
 * range } announces it with the hit the field as it stands predicts: `tgt` that ally (null: none), `t` the flight to it,
 * `dir` [dx, dy] the axis (stage grid: +x = right, +y = up a row), `range` the tiles it covers (to that hit, else speed ×
 * life). `opts.at` ({ x, y }): where it leaves — its mount point, from which the axis is taken too (the client's start
 * position; default `from`). Returns the projectile.
 * @param {Battle} b @param {Unit} unit @param {{ x: number, y: number }} aim @param {Record<string, any> | null | undefined} shot
 * @param {(target: Unit, at: { x: number, y: number }) => unknown} onHit
 * @param {{ source?: Unit | null, at?: { x: number, y: number }, radius?: number, canHit?: (u: Unit) => boolean,
 *   visual?: string, onExpire?: () => unknown }} [opts]
 */
export function lineShot(b, unit, aim, shot, onHit, opts = {}) {
  const src = opts.source ?? (unit && unit.id != null ? unit : null);
  const from = opts.at ?? unit;
  const ax = aim.x - from.x, ay = aim.y - from.y;
  const dir = Math.abs(ax) >= Math.abs(ay) ? [Math.sign(ax) || 1, 0] : [0, Math.sign(ay)];
  const speed = shot && shot.speed > 0 ? shot.speed : 5;
  const life = shot && shot.life > 0 ? shot.life : 10;
  const reach = (opts.radius ?? 0.3) + ALLY_COLLIDER_RADIUS;
  const canHit = opts.canHit ?? ((/** @type {Unit} */ u) => areaSelectable(src, u));
  /** @param {number} x @param {number} y */
  const touching = (x, y) => {
    let best = null, bd = Infinity;
    for (const u of b.allies()) {
      if (!u.alive || !u.deployed || !canHit(u)) continue;
      const d = hypot(u.x - x, u.y - y);
      if (d <= reach + 1e-9 && (d < bd || (d === bd && best && u.id < best.id))) { best = u; bd = d; }
    }
    return best;
  };
  // the hit the field as it stands predicts (the client's draw; the sim sweeps every step)
  let first = null, at = speed * life;
  for (const u of b.allies()) {
    if (!u.alive || !u.deployed || !canHit(u)) continue;
    const along = (u.x - from.x) * dir[0] + (u.y - from.y) * dir[1];
    const perp = Math.abs((u.x - from.x) * dir[1] - (u.y - from.y) * dir[0]);
    if (perp > reach || along < 0) continue;
    const d = Math.max(0, along - Math.sqrt(reach * reach - perp * perp));
    if (d < at || (d === at && first && u.id < first.id)) { first = u; at = d; }
  }
  if (shot) {
    b.fx('enemyShot', { x: from.x, y: from.y, id: src ? src.id : null, tgt: first ? first.id : null, key: shot.key, move: shot.move, speed,
      t: Math.round((at / speed) * 1000) / 1000, dir, range: Math.round(at * 1000) / 1000 });
  }
  return b.addProjectile({ from: { x: from.x, y: from.y }, dir: { x: dir[0], y: dir[1] }, speed, maxAge: life, visual: opts.visual ?? 'enemy', source: src, fixed: shot?.adjust === 0, noWipe: shot?.elim === 0,
    sweep: (/** @type {{ x: number, y: number }} */ p) => touching(p.x, p.y), onHit: (/** @type {Record<string, any>} */ c) => onHit(c.target, { x: c.x, y: c.y }), onExpire: () => opts.onExpire?.() });
}

/**
 * The length of a skill's cast (docs/rules/sim.md 「적 스킬 = 일반 공격 차례」 시전 길이), by the class of its ability
 * (`skillCast.kind`, tools/local-extract/attack_timing.py cast_fields):
 * - an animated ability: the attack time it plays to — the client's `AbstractAnimatedAbility.get_cooldown` by `_timeMode`
 *   (`time`): 0 the enemy's attack interval, 1 its clip (`DoAttach` writes the clip's length into `_cooldown`; without a
 *   clip the prefab's `_cooldown`, 0 in this mode), 2 its `_cooldown` (`cd`), 3 the skill blackboard's `_cooldownKey`
 *   (`cdKey`, read at attach). With a clip the cast is the clip × clamp(attack time / clip, 0.1, `max`), `max` −1 = no
 *   bound (`UpdatePlaybackSpeed`, as ai.js attackTiming) — so `_timeMode` 1 plays the clip as it is. Without one
 *   (`UpdatePlaybackSpeed`: `GetAnimationTime` fails → `m_attackTime` = that attack time, scale 1) it casts the attack time
 *   itself (`EasyToStartAbility.OnCastStart`: `m_cachedDuration` = `GetDuration` = `m_attackTime`; the post-delay waits out
 *   the rest) — the channels' ThreePartChannelingAnimation stretches its loop to the same total;
 * - `buff` (ActiveBuffAbility, none of this mode's with `_waitForCasting`): one fixed update before its spell and one after
 *   (`<OnWaitForPreDelay>` / `<OnWaitForPostDelay>` yield `sharedWaitForFixedUpdate`) — two ticks;
 * - `seq` (AbilitySequenceGroup): its children one after another (`_MoveToNextActiveAbility` as each finishes), the sum;
 * - `par` (AbilityParallelGroup): its children cast together and it finishes as the last one does (`_OnSubAbilityFinished`
 *   counts them down), the longest; with `_finishAllAbilitiesIfOneFinish` (`one`) the finish of its `_mainAbility`
 *   (`main`, the index among `subs`), or without one the first child's to finish, ends the others — that child's length;
 * - `sel` (AbilitySelectableGroup): one child per cast (the first ready one whose trigger finds a target, or the next in
 *   turn with `_selectAbilitySequentially`), finishing as it does — read as the first child's length (the children of each
 *   such skill in this mode are alike: 【悲惨之雨】's Left / Right both play `Skill_2`);
 * - 0 for a clip the data lacks (`miss`, none since 2026-11-14).
 * A RangedAttack with `_waitForProjectileInvalid` (`proj`) casts until its projectile is gone (onSkillSlot's open cast) and
 * at least this: its `m_cachedDuration` is the same `GetDuration` — with no clip the attack time too (`RangedAttack.
 * OnCastStart` → … → `EasyToStartAbility.OnCastStart` after `AbilityStandard.OnCastStart` updated the playback speed).
 * @param {Unit} e @param {Record<string, any> | null | undefined} cast @param {Record<string, any> | null | undefined} bb @returns {number}
 */
export function castLength(e, cast, bb) {
  if (!cast) return 0;
  if (cast.kind === 'buff') return 2 * TICK;
  const subs = cast.subs || [];
  if (cast.kind === 'seq') return subs.reduce((/** @type {number} */ t, /** @type {Record<string, any>} */ c) => t + castLength(e, c, bb), 0);
  if (cast.kind === 'par') {
    if (!subs.length) return 0;
    const lens = subs.map((/** @type {Record<string, any>} */ c) => castLength(e, c, bb));
    if (!cast.one) return Math.max(...lens);
    return cast.main != null && lens[cast.main] != null ? lens[cast.main] : Math.min(...lens);
  }
  if (cast.kind === 'sel') return subs.length ? castLength(e, subs[0], bb) : 0;
  if (cast.kind || cast.miss) return 0;
  const dur = cast.dur > 0 ? cast.dur : 0;
  const time = cast.time ?? 0;
  const at = time === 1 ? dur : time === 2 ? (cast.cd > 0 ? cast.cd : 0)
    : time === 3 ? Math.max(0, Number((bb && bb[cast.cdKey || 'duration']) ?? 0) || 0) : e.s.interval;
  if (!dur) return at;
  const hi = cast.max > 0 ? cast.max : cast.max < 0 ? Infinity : 1;
  const k = Math.min(hi, Math.max(0.1, at / dur));
  return dur * k;
}

/**
 * When the effect of a skill's cast comes, s from the cast's start (docs/rules/sim.md 「적 스킬 = 일반 공격 차례」 효과가 나는 때):
 * the frame its ability waits for before its spell (공식 클라에서 확인 — `EasyToStartAbility.OnCastStart` → `<OnWaitForPreDelay>`
 * → spell; the same for the attack abilities, `AnimatedActionTo*` and `GloballUniqueBuffAbility`):
 * - an animated ability with a clip that waits for its attack event (`_waitForAttackEvent` 1): the clip's first OnAttack frame
 *   (`hit`) × the scale the cast plays at (castLength ÷ clip, `UpdatePlaybackSpeed`); a clip without one: the whole cast
 *   (`WaitForNextEvent` waits up to `m_cachedDuration`); one that does not wait (`wait` 0): its `_preDelay` × that scale;
 * - one without a clip: its attack time, the whole cast (as castLength);
 * - a three-part channel (ThreePartChannelingAnimation, `chan`): chanStrikeAt — the first OnAttack frame of its clips in
 *   the order they play, or `_preDelay` when the ability does not wait for the event;
 * - an ActiveBuffAbility (`buff`): its spell after one fixed update (`<OnWaitForPreDelay>` yields `sharedWaitForFixedUpdate`);
 * - a selectable group (`sel`): its child's; a sequence (`seq`): the last child's, after the others — null when an earlier
 *   child waits for its projectile (`proj`: the next child starts when that projectile is gone, no fixed time — 萨卡兹王庭军
 *   精锐术师 `DeathEye`, whose kit times its parts); a parallel group: null (its children's own frames — no kit casts one at
 *   the attack slot through this path).
 * A kit whose skill fires at that frame says `atStrike` (archetypes.js skill); one with a part at the cast's start keeps
 * `fire` and times its effect itself (atCastEvent, whose default is this frame). Exported by content/enemies.js too.
 * @param {Unit} e @param {Record<string, any> | null | undefined} cast @param {Record<string, any> | null | undefined} bb @returns {number | null}
 */
export function castStrikeAt(e, cast, bb) {
  if (!cast) return 0;
  if (cast.kind === 'buff') return TICK;
  const subs = cast.subs || [];
  if (cast.kind === 'sel') return subs.length ? castStrikeAt(e, subs[0], bb) : 0;
  if (cast.kind === 'seq') {
    if (!subs.length) return 0;
    let t = 0;
    for (let i = 0; i < subs.length - 1; i++) { if (subs[i].proj) return null; t += castLength(e, subs[i], bb); }
    const last = castStrikeAt(e, subs[subs.length - 1], bb);
    return last == null ? null : t + last;
  }
  if (cast.kind === 'par') return null;
  const len = castLength(e, cast, bb);
  if (cast.chan) return chanStrikeAt(cast, len);
  if (!(cast.dur > 0)) return len;
  const scale = len / cast.dur;
  if (cast.wait === 0) return Math.min(len, (cast.pre > 0 ? cast.pre : 0) * scale);
  return Number.isFinite(cast.hit) ? Math.min(len, cast.hit * scale) : len;
}

/**
 * When the spell of a three-part channel's ability comes, s from the cast's start (castStrikeAt; 공식 클라에서 확인): the ability
 * plays no clip of its own — its ThreePartChannelingAnimation plays the begin clip, the loop for what is left of the
 * ability's time `len` and the end clip (`UpdatePlaybackSpeed`: begin and end squeezed into `len` when longer, the loop
 * then 0; `_waitForAttachFinishEvent` (`chan.wait`) holds the loop until the attack-finish event), and the model's Spine
 * OnAttack event in any of them is the entity's attack event (`SpineAnimator._OnEvent`), which the ability waits for
 * (`_waitForAttackEvent`, EasyToStartAbility.<OnWaitForPreDelay>) up to its time — the begin clip's frame (假想敌：黑云
 * `KillOthers` 0.633 s, “萨米的意志” `Lasso` 1 s), else the loop's, else the end clip's (扎罗 【溶血骇惧】 5 s − `A_Skill_End`
 * 1 s + its 0.367 s frame = 4.367 s), else the whole cast. One that does not wait (`wait` 0) casts its spell after
 * `_preDelay` (假想敌：铳 (隐秘核心) 【末日布道】 at once, 魂灵残迹 `Laser` 0.2 s). Data: `skillCast` `chanBegin` / `chanLoop` /
 * `chanEnd` ({ dur, hit? }, tools/build-data.mjs enemySkillCast).
 * @param {Record<string, any>} cast @param {number} len @returns {number}
 */
function chanStrikeAt(cast, len) {
  if (cast.wait === 0) return Math.min(len, cast.pre > 0 ? cast.pre : 0);
  const bg = cast.chanBegin, lp = cast.chanLoop, en = cast.chanEnd;
  const bd = bg && bg.dur > 0 ? bg.dur : 0, ed = en && en.dur > 0 ? en.dur : 0;
  const k = bd + ed > len && bd + ed > 0 ? len / (bd + ed) : 1;
  if (bg && Number.isFinite(bg.hit)) return Math.min(len, bg.hit * k);
  const loop = cast.chan.wait ? Infinity : Math.max(0, len - (bd + ed) * k);
  if (lp && Number.isFinite(lp.hit) && lp.hit < loop) return Math.min(len, bd * k + lp.hit);
  if (en && Number.isFinite(en.hit) && !cast.chan.wait) return Math.max(0, len - ed * k + en.hit * k);
  return len;
}

/**
 * A skill's effect lands at the frame its ability waits for before its spell (castStrikeAt: the clip's attack event × the
 * scale the cast plays at, `_preDelay` when it does not wait, a sequence's last child after the others …), so a cast cut
 * before it (stun, freeze …) gives nothing; a frame of 0 runs `fn` at once. `at`: another time, s from the cast's start —
 * a MultiRangedAttack's later shots (`_waitAttackEventForAllAttacks`, from castStrikeAt on), or the cast's end (castLength)
 * for what an ON_CAST_END action does. (Until 2026-11-20 the default was the clip's own `hit`, else its length: neither
 * the scale of a `_timeMode` 0 cast nor `wait` 0 nor a sequence's earlier children.)
 * @param {Battle} b @param {Unit} e @param {AbSkill | null | undefined} s @param {() => void} fn @param {number | null} [at]
 */
export function atCastEvent(b, e, s, fn, at = null) {
  const c = s && s.cast;
  const t = at != null ? at : c ? castStrikeAt(e, c, s.bb) ?? castLength(e, c, s.bb) : 0;
  if (!(t > 0)) { fn(); return; }
  b.after(t - 1e-9, () => { if (e.alive && e.castLeft > 0) fn(); }, { owner: e });
}

/**
 * Enemy `e` switches to its prefab's mode `name` (null / the first mode's name = the first): the client's `SwitchMode` —
 * its new mode's attack abilities attach ready; the swing running is cut unless `fsm` is false (the node's `_restartFSM`
 * off) and its ability plays on when detached (ai.js enemyMode; docs/rules/sim.md 「일반 공격 타이밍」 「적의 모드 전환」). A kit
 * calls it where the client's buff or ability switches the mode.
 * @param {Battle} b @param {Unit} e @param {string | null} [name] @param {boolean} [fsm]
 */
export function mode(b, e, name, fsm = true) {
  return enemyMode(b, e, name, fsm);
}

/** @param {Record<string, any> | null} [params] @param {Battle} b @param {Unit} e @param {string | null} form @param {string} [fxKind] */
export function setForm(b, e, form, fxKind = 'phase', params = null) {
  e.form = form;
  b.fx(fxKind, fxKind === 'phase' ? { ...params, x: e.x, y: e.y, id: e.id, kind: form, form } : { ...params, x: e.x, y: e.y, id: e.id, form });
}

/** Leader "扣除目标生命" effects: recorded for the match (hook 'lpLoss' + result.lpLoss).
 * @param {Battle} b @param {number} amount @param {string} reason @param {{ x: number, y: number } | null} [source] */
export function lpLoss(b, amount, reason, source = null) {
  if (!(amount > 0)) return;
  const st = stOf(b);
  st.lpLoss += amount;
  b.fx('lpLoss', { x: source ? source.x : 0, y: source ? source.y : 0, value: amount, reason });
  b.emit('lpLoss', { amount, reason, source });
}

/** 暴露: damage taken ×scale for `dur` s. @param {Battle} b @param {Unit | null | undefined} u @param {number} dur @param {number} scale */
export function expose(b, u, dur, scale) {
  if (!u || !u.alive || !(dur > 0)) return;
  b.addBuff(u, { key: 'ab:exposed', duration: dur, refresh: 'extend', mods: { dmgTakenMul: scale }, visible: true });
  b.fx('expose', { x: u.x, y: u.y, id: u.id });
}

/**
 * Final HP damage the pipeline would deal for a phys/arts/true/elemental `dmg` before shields (mitigation is linear in
 * the amount) — the same terms as damage.js dealDamage (元素伤害: 元素抗性 + elementalTakenMul, no dmgTakenMul).
 * @param {Unit | null | undefined} src @param {Unit} tgt @param {Record<string, any>} dmg @returns {number}
 */
export function expectedFinal(src, tgt, dmg) {
  const ts = tgt.s, ss = src && src.s && !dmg.sourceless ? src.s : null, ty = dmg.type; // 无来源 (bursts): no source stats
  const v = mitigate(dmg.amount, ty, ts, {
    defIgnorePct: (dmg.defIgnorePct || 0) + (ss ? ss.defIgnorePct : 0), defIgnoreFlat: (dmg.defIgnoreFlat || 0) + (ss ? ss.defIgnoreFlat : 0),
    resIgnorePct: (dmg.resIgnorePct || 0) + (ss ? ss.resIgnorePct : 0), resIgnoreFlat: (dmg.resIgnoreFlat || 0) + (ss ? ss.resIgnoreFlat : 0),
    elementalRes: ty === 'elemental' ? (tgt.def?.epDamageResistance ?? 0) : 0,
  });
  let mul = (dmg.mul ?? 1) * (ty === 'elemental' ? 1 : ts.dmgTakenMul); // 脆弱 skips 元素伤害 (damage.js)
  if (ss) mul *= ss.dmgDealtMul * (ty === 'phys' ? ss.physDealtMul : ty === 'arts' ? ss.artsDealtMul : 1);
  mul *= ty === 'phys' ? ts.physTakenMul : ty === 'arts' ? ts.artsTakenMul : ty === 'elemental' ? ts.elementalTakenMul : ts.trueTakenMul;
  const f = v * mul;
  return Number.isFinite(f) && f > 0 ? f : 0;
}

/**
 * "吸收法术伤害的屏障": absorb up to `left` of an arts instance in a `hit` handler (after RES, like a shield) by scaling
 * the instance down (cancelled when fully absorbed). Returns the amount absorbed.
 * @param {AbCtx | null | undefined} c @param {number} left @returns {number}
 */
export function absorbArts(c, left) {
  if (!c || c.dmg.type !== 'arts' || !(left > 0) || c.dmg.cancel) return 0;
  const f = expectedFinal(c.source, c.target, c.dmg);
  if (!(f > 0)) return 0;
  const take = Math.min(left, f);
  if (take >= f - 1e-9) c.dmg.cancel = true;
  else c.dmg.amount *= (f - take) / f;
  return take;
}

/** Timed buff on each unit (same key never stacks: aura semantics). @param {Battle} b @param {Unit} u @param {string} key @param {number} iv @param {Record<string, any>} mods @param {Record<string, boolean> | null} [flags] @param {boolean} [visible] */
function auraBuff(b, u, key, iv, mods, flags = null, visible = false) {
  b.addBuff(u, { key, duration: iv + 0.1, refresh: 'replace', mods, flags, visible });
}

/** Mark an ally/enemy ability as watching every death on the field. @param {Battle} b @param {Unit} e */
function watchDeaths(b, e) { stOf(b).deathWatch.add(e); }

/** @param {{ x: number, y: number }} u @returns {[number, number]} */
const tileOf = (u) => [Math.round(u.y), Math.round(u.x)];

/** @param {Battle} b @param {{ x: number, y: number }} u @param {string} terrain */
const onTerrain = (b, u, terrain) => { const [r, c] = tileOf(u); return b.grid.tile(r, c).terrain === terrain; };

// used by the other enemy modules (content/enemies.js and content/enemies/*.js)
export {
  BOOM_RADIUS, POLLUTION_INTERVAL, STEALTH_RESTORE_BY_KEY, DUCK_STEALTH_RESTORE, TEA_SPLASH_RADIUS, SHELL_SPLASH_RADIUS, stOf, safe, dispatch,
  num, auraBuff, watchDeaths, onTerrain,
};
