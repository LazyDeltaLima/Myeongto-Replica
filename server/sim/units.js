// server/sim/units.js — Unit model (operators, tokens, enemies, devices) and stat aggregation (DESIGN §5.2).
//
// Aggregation (recomputed lazily whenever buffs change — `unit.markDirty()`):
//   ATK/DEF/maxHp = (base + Σflat) × (1 + Σpct) × Πmul        (Πmul includes the unit's 练度 `cultMul`, 0.2.2)
//   res           = clamp((base + Σflat) × Πmul, 0, 100)
//   aspd          = clamp(base + Σaspd, 20, 600)          (base is 100 for almost everyone; floor 20 = PRTS 数值范围)
//   interval      = bat × (1 + ΣbatPct) × 100 / aspd      (ΣbatPct floored at −0.9)
//   moveSpeed     = (base + ΣmoveFlat) × ΠmoveMul          (tiles/s = moveSpeed × MOVE_SCALE; floor 0.1 = PRTS 数值范围
//                                                          when base > 0 and no noMove state — MOVE_SPEED_MIN)
//   massLevel     = max(0, base + ΣmassFlat)                (重量: displacement, 浮空 halving; 失重 = massFlat −1)
// Changing maxHp keeps the HP ratio. The sim keeps floats; rounding happens only in snapshots.

import { aggregateMods } from './buffs.js';
import { flagsOf } from './snapshot.js';
import { ASPD_MIN, ASPD_MAX, MOVE_SPEED_MIN, ELEMENT_GAUGE_MAX, ELEMENT_GAUGE_MAX_LEADER } from './constants.js';
import { DIR_VEC, normDir } from './dir.js';
/** @import { SkillRuntime } from './skills.js' */

/** @param {number} v @param {number} a @param {number} b */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const EMPTY = Object.freeze({});
/** No 练度 multiplier (a unit without one: enemies, summons, stand-ins, a raw spec unit). */
const NO_MUL = Object.freeze({ atk: 1, def: 1, hp: 1 });
/** Aggregates can overflow (huge stacked *Mul mods → Infinity) — fall back to `d` so no stat is ever non-finite. */
/** @param {number} v @param {number} d */
const fin = (v, d) => (Number.isFinite(v) ? v : d);
/** 移动速度 after its mods: never below MOVE_SPEED_MIN for a unit that walks (base > 0) unless a noMove state holds it. */
/** @param {{ moveSpeed: number }} b @param {number} v @param {Record<string, any> | null | undefined} flags */
const moveSpeedOf = (b, v, flags) => (b.moveSpeed > 0 && !(flags && flags.noMove) ? Math.max(MOVE_SPEED_MIN, v) : Math.max(0, v));

/**
 * A swing whose strike is not reached yet (ai.js startSwing, the enemies' swing): the time to its strike, its targets
 * (null: the strike picks them), the strike's selection and, for an ally, the profile it was swung with.
 * @typedef {{ left: number, targets: Unit[] | null, sel: number, isSkill?: boolean, signal?: string | null,
 *   prof?: Record<string, any> | null, replace?: SkillRuntime }} Swing
 * A leaders' shared HP pool (the match's SharedBossPool, server/match; the browser's LocalBossPool, spec.js): the HP
 * the sim reads and writes, and the rest of its record.
 * @typedef {{ hp: number, maxHp: number, [key: string]: any }} BossPool
 * A unit's profession runtime state (`Unit.trait`): the fields the profession install helpers (professions.js) keep —
 * 傀儡师's form, 解放者's ramp, 猎手's rounds, 回环射手's boomerangs out, 秘术师's stored energies, 战术家's 援军, 驭械术师's
 * ramp — and the kits' own entries.
 * @typedef {{ [key: string]: any, doll?: boolean, dollSwitching?: boolean, ramp?: number, ammo?: number,
 *   reloading?: boolean, reloadCd?: number, boomerangsOut?: number, stored?: number, reinforcement?: Unit | null,
 *   funnelTarget?: Unit['id'] | null, funnelScale?: number }} ProfessionState
 */

export class Unit {
  /**
   * @param {Record<string, any>} init
   */
  constructor(init) {
    // Heavy references are non-enumerable so assertion diffs / logs never walk the whole battle graph.
    for (const k of ['def', 'player', 'ownerUnit', 'kit', 'profile', 'skill', 'route', 'bossPool', 'blockedBy', 'blocking', 'carry', 'mem', 'trait']) {
      Object.defineProperty(this, k, { value: null, writable: true, enumerable: false, configurable: true });
    }
    this.id = init.id;
    this.side = init.side;            // 'ally' | 'enemy'
    this.kind = init.kind;            // 'op' | 'token' | 'enemy' | 'device'
    this.def = init.def;              // normalised def (chess / token / enemy / device)
    this.defId = init.defId ?? init.def?.id ?? 'unknown';
    this.name = init.name ?? init.def?.name ?? this.defId;
    this.ownerId = init.ownerId ?? null;  // playerId (enemies: field owner)
    this.uid = init.uid ?? null;          // match piece uid (ops/tokens from the board)
    this.ownerUnit = init.ownerUnit ?? null; // summoner (tokens)
    // the owning player's outfit (skinId, PlayerBattleInput `skin`; a summon its owner's — battle/players.js, summons.js):
    // display only, carried to UnitInfo.skin — no rule reads it and Battle.result() leaves it out
    // (docs/rules/upstream.md 「오퍼레이터 스킨」)
    this.skin = init.skin ?? null;
    this.x = init.x ?? 0;
    this.y = init.y ?? 0;
    this.tileR = init.tileR ?? Math.round(this.y);
    this.tileC = init.tileC ?? Math.round(this.x);
    this.homeR = this.tileR;
    this.homeC = this.tileC;
    // knocked-out operators (Battle.isDown): [r, c] of the tile the body lies on and the unit comes back on — where it
    // fell, or its home (Battle._layBody); x / y / tileR / tileC keep where it fell
    this.body = /** @type {number[] | null} */ (null);
    // deploy direction (sim/dir.js; allies: from the board piece, default RIGHT); `facing` is its derived horizontal
    // sign (sprite flip only) — a legacy `init.facing` ±1 still maps to RIGHT / LEFT
    this.dir = normDir(init.dir ?? init.facing);
    this.base = {
      maxHp: 1, atk: 0, def: 0, res: 0, aspd: 100, bat: 1, blockCnt: 0, moveSpeed: 0, spRecovery: 1,
      tauntLevel: 0, massLevel: 0, hpRecoveryPerSec: 0, cost: 0, respawnTime: 0, rangeRadius: 0,
      ...(init.base || {}),
    };
    /** @type {object[]} */
    this.buffs = [];
    this._dirty = true;
    this._s = null;
    this.hp = this.base.maxHp;
    this.alive = true;
    this.deployed = false;
    this.removed = false;       // permanently gone (enemies, tokens, retreated-for-good)
    this.blocking = /** @type {Unit[]} */ ([]);         // ops: enemies currently blocked
    this.blockedBy = /** @type {Unit | null} */ (null);      // enemies: blocker unit
    this.blockMove = /** @type {{ x0: number, y0: number, x1: number, y1: number, t: number } | null} */ (null);      // enemies: the slide to the block position (Battle._moveToBlockPosition)
    this.blockSearchTick = 0;   // allies: ticks to the next search for enemies to block (Battle._searchBlockees)
    // enemies: the walk's velocity and the wall's force, read every few ticks (ai.js walkRoute: the client's MoveController)
    this.moveVx = 0;
    this.moveVy = 0;
    this.avoidX = 0;
    this.avoidY = 0;
    this.avoidTick = 0;
    // enemies: listed on more than one tile of the range index (their 0.1 collider straddles an edge), and the tiles
    // they are filed on (battle/queries.js _indexEnemy); declared here so the index writing them never changes a unit's shape
    this._ebMulti = false;
    this._ixT = /** @type {number[] | null} */ (null);
    // null exactly while _ixT is (battle/queries.js reads it after _ixT's check)
    this._ixB = /** @type {number[]} */ (/** @type {unknown} */ (null));
    this._ixX = 0;   // the position it was filed at
    this._ixY = 0;
    this.motion = init.motion ?? 'GROUND'; // enemies: 'WALK' | 'FLY'
    this.profile = /** @type {Record<string, any> | null} */ (null);        // resolved profession/attack profile
    this.skill = /** @type {SkillRuntime | null} */ (null);          // SkillRuntime
    this.kit = /** @type {Record<string, any> | null} */ (null);
    this.atkCd = 0;
    this.atkMode = /** @type {Record<string, any> | null | undefined} */ (undefined);   // ai.js: the attack record (its mode's attack ability) `atkCd` counts for; undefined = not seen yet
    this.atkCombat = false;     // ai.js syncCombat: a mode with a separate `_combat` ability is on it now; `atkCd` is that ability's
    this.atkCdAlt = 0;          //   and this the other one's, which counts down too
    this.atkSub = false;        // ai.js attackRecordOf: its kit says the running skill has switched to the mode it goes on to
    this.swing = /** @type {Swing | null} */ (null);          // a normal attack swung, its strike not reached yet (ai.js startSwing)
    this.swingOff = /** @type {Swing | null} */ (null);       // ai.js: a swing of a mode's attack a mode switch detached, playing on to its strike
    this.castLeft = 0;          // the rest of the swing after its strike (ai.js: the next swing waits for it)
    this.castSwing = false;     // ai.js: an enemy's `castLeft` is its normal swing's (not a skill cast's)
    this.mode = /** @type {string | null} */ (null);           // ai.js enemyMode: an enemy's prefab mode after its first (its attack ability), null = the first
    this.atkSpell = 0;          // ai.js: the attack (1) / combat (2) state its swings run in, 0 none — the next is a first attack
    this.atkSpellExit = 0;      // ai.js endSpell: when a check with no target ends that state (last swing's end + _escapeTime)
    this.faceTgt = /** @type {Unit | null} */ (null);        // the main target its latest swing turned it to (ai.js holdFaceTarget)
    this.faced = false;         // a swing turned it from its deploy direction; 'face' turns it back (ai.js faceIdle)
    this.lastAttackAt = -Infinity;
    this.atkCast = false;       // ai.js: the attack ability its attack / combat state started is casting (swing + recovery)
    this.atkOffLeft = 0;        // ai.js: the rest of such a cast a mode switch detached, playing on beside the new mode's
    this.attackEndAt = -Infinity;   // ai.js noteAttackEnd: when that cast last ended, cut or not (ON_AFTER_ATTACK)
    this.lastHitAt = -Infinity;
    this._dmgEv = /** @type {unknown[] | null} */ (null);         // its last 'dmg' event (damage.js hitFx)
    this.deployedAt = -Infinity;
    this.deathAt = -Infinity;
    this.respawnAt = Infinity;
    this.deploySeq = 0;         // deployment counter; also the identity of one deployment (content: `seq === u.deploySeq`)
    this.aggroSeq = 0;          // 仇恨 order (the later the more attacked): = deploySeq, except summons of the initial deployment
    this.spawnSeq = 0;
    this.elem = /** @type {Record<string, number>} */ ({ burn: 0, neural: 0, apoptosis: 0, erosion: 0 });
    if (this.side === 'enemy') this.elem.rampage = 0;   // 狂躁: enemies only so far (constants.js ELEMENT.rampage)
    this.burstPending = /** @type {Record<string, boolean> | null} */ (null);   // { [element]: true } while that element's burst resolves (damage.js burstLocked)
    this.tags = new Set(init.tags || []);
    /** @type {Record<string, any>} */
    this.mem = {};              // free scratch space for content (per unit)
    // a countdown summon's life on the field ({ from, until } battle times; content/tokens.js startCountdown, cleared by
    // every deployment): its bar shows the time left (snapshot.js unitTuple), its HP never moves (无敌 + 禁疗)
    this.countdown = /** @type {{ from: number, until: number } | null} */ (null);
    // knocked out, the unit lies — and redeploys — on its home tile instead of where it fell (Battle._layBody) while content
    // holds this: 乌尔比安 moved by his S3 (the owner's decision of 2026-10-07, a deviation from PRTS's "where it fell");
    // every deployment clears it (battle/deploy.js _deploy)
    this.downAtHome = false;
    /** @type {ProfessionState} */
    this.trait = {};            // profession runtime state
    // boss: damage to a shared leader pool (damage.js); assist: 联防 knock-outs of other players' enemies, by the leaker
    // (battle/deploy.js, created on the first one) — the settlement's per-operator charts (server/match/unitTally.js)
    // byType: `dmg` by damage type (damage.js, the round damage panel)
    this.stats = { dmg: 0, byType: [0, 0, 0, 0], kills: 0, heal: 0, taken: 0, attacks: 0, boss: 0, assist: /** @type {Record<string, number> | null} */ (null) };
    this.hidden = false;        // enemies inside a DISAPPEAR segment
    this.moving = false;        // enemies: walked this tick (drawn on the move clip; ai.js updateEnemy)
    this.form = /** @type {string | null} */ (null);           // the model's current form (content/enemies/helpers.js setForm, a 傀儡师's 替身 'doll' → snapshot.js unitInfo)
    this.anim = 0;
    this.persist = { redeployMul: 1, freeRedeploys: 0 };
    this.isBoss = false;
    // the HUD capsule's own flag (battle/spawns.js: set on the enemies the field itself scheduled, DESIGN §14); declared
    // here so every unit keeps the same object shape (the hot loops' property reads)
    this.inTotal = false;
    this.bossPool = /** @type {BossPool | null} */ (null);
    // 练度 (自持有, 0.2.2; battle/players.js): the owned operator's tier (0–3, effects.json aceffect_char_1…4) and its
    // char_attribute_mul — ATK / DEF / max HP, a multiplier of its own (never summed with the 直接乘算 percentages)
    this.cultivate = /** @type {number | null} */ (null);
    this.cultMul = /** @type {{ atk: number, def: number, hp: number } | null} */ (null);
  }

  markDirty() { this._dirty = true; }

  /** Horizontal sign of the direction (LEFT ⇒ −1, else +1): sprite flip only — geometry uses `dir` / `fwd`. */
  get facing() { return this.dir === 'LEFT' ? -1 : 1; }
  /** Legacy setter: ±1 ⇒ RIGHT / LEFT (prefer assigning `dir`). */
  set facing(v) { this.dir = normDir(v, this.dir); }
  /** Forward vector [dRow, dCol] (UP = +row). */
  get fwd() { return DIR_VEC[this.dir] ?? DIR_VEC.RIGHT; }

  /** Aggregated stats (lazy: never null once read). @returns {NonNullable<Unit['_s']>} */
  get s() {
    if (this._dirty) this._recalc();
    return /** @type {NonNullable<Unit['_s']>} */ (this._s);
  }

  get maxHp() { return this.s.maxHp; }
  get atk() { return this.s.atk; }

  _recalc() {
    const prevMax = this._s ? this._s.maxHp : this.base.maxHp;
    const { add, mul, flags, shield, permRangeExtend } = aggregateMods(this.buffs);
    const a = (/** @type {string} */ k) => add[k] ?? 0;
    const m = (/** @type {string} */ k) => mul[k] ?? 1;
    const b = this.base;
    const cm = this.cultMul || NO_MUL;
    const bHp = fin(b.maxHp, 1) > 0 ? fin(b.maxHp, 1) : 1;
    const maxHp = Math.max(1, fin((bHp + a('hpFlat')) * Math.max(0, 1 + a('hpPct')) * m('hpMul') * cm.hp, bHp));
    // PRTS 游戏数据基础 属性基本公式 A_f = F_t[(A + D_p)(1 + D_t) + F_p]: `atkFinal` is the 最终加算 (FINAL_ADDITION) —
    // added after the percentages, inside the Πmul (阿戈尔's devoured base ATK, DESIGN §24.7)
    const atk = Math.max(0, fin(((b.atk + a('atkFlat')) * Math.max(0, 1 + a('atkPct')) + a('atkFinal')) * m('atkMul') * cm.atk, fin(b.atk, 0)));
    const def = Math.max(0, fin((b.def + a('defFlat')) * Math.max(0, 1 + a('defPct')) * m('defMul') * cm.def, fin(b.def, 0)));
    const res = clamp(fin((b.res + a('resFlat')) * m('resMul'), fin(b.res, 0)), 0, 100);
    const aspd = clamp(fin((b.aspd + a('aspd')) * Math.max(0, 1 + a('aspdPct')), 100), ASPD_MIN, ASPD_MAX);
    const bBat = fin(b.bat, 1) > 0 ? fin(b.bat, 1) : 1;
    const bat = fin(bBat * Math.max(0.1, 1 + a('batPct')), bBat);
    const s = {
      maxHp, atk, def, res, aspd, bat,
      interval: (bat * 100) / aspd,
      blockCnt: Math.max(0, fin(Math.round(b.blockCnt + a('blockCnt')), 0)),
      moveSpeed: moveSpeedOf(b, fin((b.moveSpeed + a('moveFlat')) * m('moveMul'), fin(b.moveSpeed, 0)), flags),
      rangeExtend: Math.max(0, Math.round(a('rangeExtend'))),
      // 阻挡半径倍率 − 1 (PRTS 数值范围 BLOCK_RADIUS_SCALE "影响阻挡模式为飞行阻挡的单位的阻挡半径"): Battle._searchBlockees
      blockRadiusScale: Math.max(0, fin(a('blockRadiusScale'), 0)),
      baseRangeExtend: Math.max(0, fin(Math.round(permRangeExtend), 0)),   // permanent part (initial range)
      massLevel: Math.max(0, fin(fin(b.massLevel, 0) + a('massFlat'), 0)),
      maxTargets: a('maxTargets'),
      // DESIGN §5.3 lists `taunt` as a buff flag (+aggro) as well as a numeric mod: the flag counts as +1 level
      taunt: (Number.isFinite(b.tauntLevel) ? b.tauntLevel : 0) + a('taunt') + (flags.taunt === true ? 1 : 0),
      dodgePhys: clamp(a('dodgePhys'), 0, 1),
      dodgeArts: clamp(a('dodgeArts'), 0, 1),
      defIgnoreFlat: a('defIgnoreFlat'),
      defIgnorePct: clamp(a('defIgnorePct'), 0, 1),
      resIgnoreFlat: a('resIgnoreFlat'),
      resIgnorePct: clamp(a('resIgnorePct'), 0, 1),
      dmgDealtMul: m('dmgDealtMul'),
      physDealtMul: m('physDealtMul'),
      artsDealtMul: m('artsDealtMul'),
      dmgTakenMul: m('dmgTakenMul'),
      physTakenMul: m('physTakenMul'),
      artsTakenMul: m('artsTakenMul'),
      trueTakenMul: m('trueTakenMul'),
      elemTakenMul: m('elemTakenMul'),           // 元素损伤倍率: element gauge fills (damage.js applyElement)
      elementalTakenMul: m('elementalTakenMul'), // 元素脆弱: 元素伤害 (the 'elemental' HP damage type)
      healingDealtMul: m('healingDealtMul'),
      healingTakenMul: m('healingTakenMul'),
      atkScaleMul: m('atkScaleMul'),
      spRecovery: Math.max(0, fin((b.spRecovery + a('spRecoveryFlat')) * m('spRecoveryMul'), 0)),
      spCostFlat: a('spCostFlat'),
      redeployMul: m('redeployMul'),
      hpRegen: fin(b.hpRecoveryPerSec + a('hpRegen') + a('hpRegenRatio') * maxHp, 0),
      shield,
      flags: flags || EMPTY,
    };
    s.flags.stun = !!(flags.stun || flags.freeze || flags.sleep || flags.levitate);
    // a new attack interval re-times the running attack cooldown keeping its progress (the client's
    // `AbstractAnimatedAbility.OnAttackTimeChanged` → `PeriodicTimer.ResetButKeepProgress`: remaining × new ÷ old;
    // docs/rules/sim.md 「일반 공격 타이밍」) — not the seconds left
    const was = this._s ? this._s.interval : 0;
    if (this.atkCd > 0 && was !== s.interval) this.atkCd = was > 0 ? this.atkCd * (s.interval / was) : 0;
    if (this.atkCdAlt > 0 && was !== s.interval) this.atkCdAlt = was > 0 ? this.atkCdAlt * (s.interval / was) : 0;
    this._s = s;
    this._dirty = false;
    if (this.alive && prevMax > 0 && Math.abs(prevMax - maxHp) > 1e-9) {
      this.hp = clamp(fin(this.hp * (maxHp / prevMax), maxHp), 0, maxHp);
    }
  }

  /** Current flags object (stun/freeze/sleep/…) */
  get flags() { return this.s.flags; }

  /** Can act at all this tick (not stunned/frozen/sleeping/levitated). */
  get canAct() { return this.alive && this.deployed && !this.hidden && !this.s.flags.stun; }

  /** @param {string} k */
  hasFlag(k) { return !!this.s.flags[k]; }

  /**
   * Air unit (空中单位) for every targeting / ground-only rule: FLY movers, and enemies that hover (近地悬浮, buff flag
   * `float` — PRTS 术语释义 ba.float "算作空中单位"; they keep walking the ground path) or are levitated (浮空, gamedata_const
   * ba.levitate "变为空中单位"). A 缚地 enemy (status `groundbind`, ba.groundbind "目标变为地面单位") is a ground unit
   * meanwhile — unless a 浮空 lifts it again (浮空 lands on a 缚地 flyer: Battle.applyStatus). Movement and pathing read
   * `motion`, never this.
   */
  get isFlying() {
    if (this.side === 'enemy') {
      const f = this.s.flags;
      if (f.levitate) return true;
      if (f.groundbind) return false;
      return this.motion === 'FLY' || !!f.float;
    }
    return this.motion === 'FLY';
  }

  get hpRatio() { const mh = this.s.maxHp; return mh > 0 ? this.hp / mh : 0; }

  /** Snapshot status bitmask (UF bits: blocked, stunned, frozen, stealth, skill, shield, invuln, cold, sleep, flying). */
  get statusFlags() { return flagsOf(this); }
  /** Damage type of the unit's normal attack ('phys' | 'arts' | 'true' | 'heal' | 'none'). */
  get dmgType() { return (this.profile && this.profile.dmgType) || (this.def && this.def.dmgType) || 'phys'; }
  /** Displacement weight (= current massLevel incl. `massFlat` buffs). Enemies also carry `lpr` (LP cost) as a plain field. */
  get weight() { return this.s.massLevel; }

  get spMax() { return this.skill ? this.skill.spCost : 0; }
  get sp() { return this.skill ? this.skill.sp : 0; }

  isOp() { return this.kind === 'op'; }
  isEnemy() { return this.side === 'enemy'; }
  isAlly() { return this.side === 'ally'; }

  /** Element gauge capacity: 1000, leaders (enemy rank BOSS) 2000 (official "·我方" burst terms). */
  get gaugeMax() {
    return this.side === 'enemy' && (this.isBoss || (this.def && this.def.rank === 'BOSS')) ? ELEMENT_GAUGE_MAX_LEADER : ELEMENT_GAUGE_MAX;
  }

  /** Element gauge helper @param {string} el */
  elemRatio(el) { return (this.elem[el] ?? 0) / this.gaugeMax; }

  /** @param {string} key @returns {object | null} */
  findBuff(key) {
    for (const b of /** @type {{ key: string }[]} */ (this.buffs)) if (b.key === key) return b;
    return null;
  }
  /** @param {string} key */
  hasBuff(key) { return this.findBuff(key) !== null; }

  toString() { return `${this.kind}#${this.id}(${this.name})`; }

  /** Compact inspection (avoids dumping the whole battle graph in assertion messages / logs). */
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `Unit<${this.kind}#${this.id} ${this.defId} hp=${Math.round(this.hp)}${this.alive ? '' : ' dead'} @${this.x.toFixed(2)},${this.y.toFixed(2)}>`;
  }
}
