// server/sim/skills.js — skill runtime: SP, charges, trigger rules, kinds, SkillSpec interpretation (DESIGN §5.6).
//
// SP types: 'time' (+spRecovery/s), 'attack' (+1 per attack), 'hurt' (+1 per hit taken), 'none'.
// No SP gain while a duration/ammo/toggle skill is active, or while the unit has the noSp flag (阻回: no SP gain of any
// kind — time, attack, hurt or granted). A stunned / frozen / levitated unit (canAct false) neither attacks nor casts, but
// its time SP keeps recovering (PRTS: only 阻回 pauses the SP cooldown; 晕眩 does not — community report #18).
// Charges (maxCharges > 1): SP fills to spCost → +1 charge (SP restarts) until charges == max (SP stays full).
// Trigger rules (the official 技能策略, PRTS 卫戍协议/帮助 §作战阶段 技能操作; data: tools/build-data.mjs resolveTrigger):
//   DEFAULT — the basic strategy: ready + about to attack/heal + enemy / injured ally in the INITIAL range (or blocked by
//   a melee unit) — or, checked every tick, an enemy inside one of the content trigger ranges added with
//   addTriggerRange: 海嗣, 流形;
//   SKILL_RANGE — a MANUAL skill with a 技能范围 of its own: "不通过普通攻击/治疗触发技能，仅在技能范围内存在敌人（无视其
//   不可选中）时释放技能": any living enemy on the trigger grid (the skill range; stealthed / untargetable / flying ones
//   too), checked every tick, no attack needed. Kit option `trigger.allies` (+ `hpAtMost`, default 1): a healable,
//   injured ally of the grid whose HP ratio is at most that instead (an AUTO heal skill's own rule — 古米 S1 waits in
//   its heal mode until it has healed);
//   ACTIVE_RANGE — a kit rule (the data's until maintainer decision 2026-10-11: the owner's rule of 2026-10-05 for a MANUAL
//   skill whose running attack range strictly contains the unit's own range; Touch's 恳切福音 still uses it) checks the DEFAULT condition on that larger range (trigger grid = the running
//   range, grown by the unit's permanent rangeExtend unless the skill ignores 攻击距离), every tick, no attack needed —
//   an enemy the unit can target there (or one it blocks), a heal skill an injured ally;
//   TAKE_DAMAGE (ready + just took a hit, cast on the hit: 重装 "不受技能范围影响，受到伤害时释放技能"; client born buff
//   `autochess_trigger_skill[on_take_damage]`), SP_FULL/ALWAYS (as soon as ready),
//   CUSTOM_RANGE (enemy inside the custom trigger grid), SEARCH (an enemy inside the INITIAL range, checked every tick
//   without waiting for an attack: "不受基础策略影响，在初始攻击范围内存在敌人时释放技能" — not any enemy on the field,
//   which burnt the skill on enemies that had just spawned), GDGLOW_SKILL_2 ("全场存在可选目标时释放技能": any enemy on the
//   field — the client's `_GdglowSearchEnemy` counts `UnitManager.enemyCnt`, targetable or not), NEVER/MANUAL (never
//   auto-cast: the kit calls skill.activate() itself); any unknown rule falls back to DEFAULT. Units that never attack
//   (noAttack profiles) evaluate DEFAULT every tick instead. DEFAULT with `trigger.allies` (+ `hpAtMost`): the basic
//   rule replaced by such an ally on the trigger grid, checked every tick — the cast spends its 技力 at once and its heal
//   replaces the unit's next attack (塞雷娅 S1 "触发时会替换当次攻击"); should that ally condition fail before the attack,
//   the cast is dropped and its 技力 lost.
// MANUAL skills (def.skillType) are cast by the battle's automatic operations (the client's `AutoChessBattleTrigger`;
//   maintainer decision 2026-10-11): every 0.2 s one pass (Battle._autoTriggerPass → autoTrigger below) checks the rules
//   above and casts at once — the first cast ends the pass (one per pass in the whole battle) and blocks its unit for
//   BLOCK_SKILL_TICK passes (`blockTicks`; a charged skill spends its charges ≈ 2.2 s apart); for BORN_TIME after any
//   deployment the unit is in its born state and casts nothing (`bornUntil`, `CastSkill.UseSkill`). DEFAULT for a MANUAL skill (`_DefaultTriggerSkill`): with a trigger
//   grid (its rangeId) a selectable enemy, ground or air, there; without one, the unit attacking (an attack target in its
//   initial range or one it blocks — its ATTACK / COMBAT state). TAKE_DAMAGE: the hit itself (onDamaged), or one the cast
//   could not use, seen by the next pass — and every pass SEARCH's condition too (the client sends type 12 down SEARCH's
//   branch, `_TrySearchTarget`: the unit's attack trigger finds a target).
//   AUTO skills fire by their own rule (tick, onAboutToAttack, onDamaged — not operations). A kit with its own automatic
//   cast checks `opCooling`; a cast made by activate() directly is not held back (it still starts the block). While a cast
//   "next attack" waits for its attack, no further charge is cast; a swing of it that ends without its attack (cut, a
//   whiff) spends it (ai.js dropNextAttack).
// Kinds: duration (mods for `duration` s), ammo (mods until `ammo` attacks were made; optional duration cap),
//   instant (onStart + optional one-shot attack override for the next attack), charges (= instant with charges),
//   passive (always on from deployment, no SP), toggle (stays on until death once activated).
// SkillSpec fields (all optional): kind, duration, ammo, spCost, initSp, charges, spType, trigger,
//   mods, flags, targeting {maxTargets, rangeGrid, priority, allInRange, rangeExtend, noRangeExtend (the range ignores
//   the unit's 攻击距离), showOwnRange (rangeGrid only selects targets: the detail card keeps the unit's own range)},
//   attack {dmgType, atkScale, splashRadius, splashScale, hits, projectile, maxTargets, dmgMul, onHit, heal…},
//   heal (bool: heal-type skill for the trigger rule), inAttack (bool: the kit casts the skill inside the attack about to
//   land and makes that attack the skill's — a ReplacementSkill whose replaced attack the kit models itself, 华法琳 S1:
//   the engine does not hold the cast for the next attack), onStart(ctx), onEnd(ctx), onHit(ctx), onAttack(ctx), onTick(ctx).
// ctx passed to spec callbacks: { battle, unit, skill, bb, target?, dealt?, targets?, dt?, reason? }; onAttack's ctx
//   also carries `noAmmo` (set it to true: this attack spends no ammo). onEnd runs while the skill's mods / range are
//   still applied (`active` is already false); they are removed right after it (unless onEnd re-activated the skill).

import { absoluteRangeKeys } from './targeting.js';
import { castFace } from './ai.js';
import { BLOCK_SKILL_TICK, COLS, MIN_ANIM_SCALE } from './constants.js';

const TICK_RULES = new Set(['SP_FULL', 'SEARCH', 'CUSTOM_RANGE', 'SKILL_RANGE', 'ACTIVE_RANGE', 'GDGLOW_SKILL_2']);
/** True when a SkillSpec `targeting` changes the unit's range while the skill runs (Battle._refreshRange). */
const changesRange = (tg) => !!(tg && (tg.rangeGrid || tg.rangeExtend || tg.noRangeExtend));
/** Enemies that satisfy a content trigger range (any targetable enemy, flyers included). */
const TRIGGER_PROFILE = Object.freeze({ canHitFly: true });

/**
 * The 'skill' animation window the sim reports to the client: `unit.skillAnimUntil` (snapshot.js `animOf` → ANIM.SKILL,
 * and the `['skill', id, 1]` / `0` events). An instant cast and a deploy-time passive both use it.
 */
const SKILL_ANIM_WINDOW = 0.5;

export class SkillRuntime {
  /**
   * @param {object} battle
   * @param {object} unit
   * @param {object|null} def normalised skill def (data)
   * @param {object|null} spec SkillSpec from the kit
   * @param {object} bb blackboard
   */
  constructor(battle, unit, def, spec, bb = {}) {
    Object.defineProperty(this, 'battle', { value: battle, writable: true, enumerable: false });
    Object.defineProperty(this, 'unit', { value: unit, writable: true, enumerable: false });
    this.def = def || {};
    this.spec = spec || {};
    this.bb = bb;
    const s = this.spec;
    const d = this.def;
    this.id = s.id ?? d.id ?? 'skill';
    this.name = s.name ?? d.name ?? '';
    this.kind = s.kind ?? 'instant';
    this.duration = Number.isFinite(+s.duration) ? +s.duration : (d.duration > 0 ? d.duration : 0);
    this.ammo = Math.max(0, Math.floor(+s.ammo || 0));
    this.baseSpCost = Math.max(0, Number.isFinite(+s.spCost) ? +s.spCost : (d.spCost ?? 0));
    this.initSp = Math.max(0, Number.isFinite(+s.initSp) ? +s.initSp : (d.initSp ?? 0));
    this.maxCharges = Math.max(1, Math.floor(s.charges ?? d.maxCharges ?? 1));
    this.spType = s.spType ?? d.spType ?? 'time';
    const trig = typeof s.trigger === 'string' ? { rule: s.trigger } : (s.trigger || d.trigger || {});
    this.rule = String(trig.rule ?? 'DEFAULT').toUpperCase();
    if (this.rule === 'ALWAYS') this.rule = 'SP_FULL';
    if (this.rule === 'MANUAL') this.rule = 'NEVER';
    if (this.rule.startsWith('CUSTOM_RANGE')) this.rule = 'CUSTOM_RANGE';
    this.triggerGrid = trig.grid ?? trig.rangeGrid ?? d.trigger?.grid ?? null;
    // kit options: an injured, healable ally of the trigger grid with an HP ratio of at most `hpAtMost` (SKILL_RANGE:
    // instead of an enemy; DEFAULT: in addition to the basic rule)
    this.triggerAllies = !!trig.allies;
    this.triggerHpAtMost = Number.isFinite(+trig.hpAtMost) && +trig.hpAtMost > 0 ? +trig.hpAtMost : 1;
    this.healSkill = s.heal ?? (unit.profile && unit.profile.dmgType === 'heal' && !!unit.profile.heal);
    // the official skill strategies automate the manual 开启: only MANUAL skills wait for the operation cooldown
    this.manual = String(d.skillType ?? 'MANUAL').toUpperCase() === 'MANUAL';
    this.blockTicks = 0;          // automatic-operation passes this unit still sits out (BLOCK_SKILL_TICK)
    this._hurt = false;           // TAKE_DAMAGE of an automatic operation: a hit since the unit's last pass
    this.nextCastAt = -Infinity;  // instant / charges with no attack of its own: no cast before (_paceInstant, GitHub #298)
    // how the client casts it (data `cast`, simdata.js normSkillCast; docs/rules/sim.md 「즉발 스킬의 시전」): 'replace' —
    // the cast replaces the unit's next attack; 'state' — the unit stays in its Skill state while the skill ability
    // plays; 'free' — no state change. null (not read): the one-attack-interval rule of #298
    this.cast = d.cast ?? null;
    this._replace = null;         // a 'replace' cast waiting for the unit's next attack: { reason }
    if (this.kind === 'passive') this.baseSpCost = 0;
    this._spCostMul = 1;          // content may set spCostMul (e.g. 绝技 ×0.7) — see the accessor below
    this.sp = 0;
    this.charges = 0;
    this.active = false;
    this.timeLeft = 0;
    this.ammoLeft = 0;
    this.ammoMax = 0;             // ammo kind: the most bullets this activation held (snapshot's draining bar)
    this.pending = false;         // instant/charges: next attack uses spec.attack
    this.activations = 0;
    this.lastStart = -Infinity;
    this._buffKey = `skill:${unit.id}`;
    this._trigKeys = null;
    this._trigSet = null;
    this.triggerRanges = [];      // content trigger ranges (addTriggerRange)
    this.noSkill = !spec;         // unit without any skill spec
  }

  /**
   * Change the trigger rule and grid mid-battle — a kit whose skill's running range changes with its own use (薇薇安娜 S3:
   * "首次技能结束后，本技能的技能范围永久扩大至3-2" — ACTIVE_RANGE on 3-2 from then, DEFAULT again at her next deployment).
   * `grid`: a facing-RIGHT [dRow, dCol] grid (ACTIVE_RANGE / SKILL_RANGE / CUSTOM_RANGE), or null. (0.2.0 WE2, additive.)
   * @param {string} rule @param {number[][]|null} [grid]
   */
  setTrigger(rule, grid = null) {
    this.rule = String(rule ?? 'DEFAULT').toUpperCase();
    this.triggerGrid = Array.isArray(grid) && grid.length ? grid : null;
    this._trigKeys = null;
    this._trigSet = null;
  }

  /**
   * Extra DEFAULT-trigger range (海嗣 "攻击范围视为自身攻击范围的延伸", 流形): `fn(battle, unit)` returns a list whose
   * entries are ally units (their current `rangeKeys` count while they are on the field), arrays of absolute tile
   * keys, or `{ keys, profile }` — tile keys with the enemy profile the effect selects by (`canHitFly` false: ground
   * enemies only — 0.2.0 WV, additive; the summon areas of upstream's 召唤师 自选 kits used it). A targetable enemy (flyers included unless the entry's profile says otherwise) on those tiles
   * satisfies the DEFAULT rule (and unknown DEFAULT-like rules); it is checked every tick, since the unit itself may
   * have nothing to attack. Returns an unregister fn.
   */
  addTriggerRange(fn) {
    if (typeof fn !== 'function') return () => {};
    this.triggerRanges.push(fn);
    return () => { const i = this.triggerRanges.indexOf(fn); if (i >= 0) this.triggerRanges.splice(i, 1); };
  }

  /** An enemy inside one of the content trigger ranges. */
  _extraTriggerSatisfied() {
    const b = this.battle;
    const u = this.unit;
    for (const fn of this.triggerRanges) {
      const list = b._safe(() => fn(b, u), 'skill.triggerRange', u);
      if (!list || typeof list[Symbol.iterator] !== 'function') continue;
      for (const x of list) {
        let keys = null, prof = TRIGGER_PROFILE;
        if (Array.isArray(x)) keys = x;
        else if (x && typeof x === 'object' && x.side === 'ally' && x.alive && x.deployed && !x.hidden) keys = x.rangeKeys;
        else if (x && typeof x === 'object' && Array.isArray(x.keys)) { keys = x.keys; if (x.profile) prof = x.profile; }
        if (keys && keys.length && b.enemiesInKeys(keys, u, prof).length) return true;
      }
    }
    return false;
  }

  get spCost() {
    const c = Math.floor(this.baseSpCost * this.spCostMul + (this.unit.s ? this.unit.s.spCostFlat : 0));
    // content writes spCostMul / spCostFlat: a NaN/Infinity cost would freeze SP forever — use the base cost instead
    return Number.isFinite(c) ? Math.max(0, c) : this.baseSpCost;
  }

  /** SP cost multiplier (content-writable). Invalid values count as 1; SP/charges are re-normalised immediately. */
  get spCostMul() { return this._spCostMul; }
  set spCostMul(v) {
    this._spCostMul = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 1;
    if (this.unit) this._normalize();
  }

  get ready() { return !this.noSkill && this.kind !== 'passive' && this.charges >= 1; }

  get isTimed() { return this.kind === 'duration' || this.kind === 'ammo' || this.kind === 'toggle'; }

  _ctx(extra) { return { battle: this.battle, unit: this.unit, skill: this, bb: this.bb, ...extra }; }

  _call(fnName, extra) {
    const fn = this.spec[fnName];
    if (typeof fn !== 'function') return undefined;
    return this.battle._safe(() => fn(this._ctx(extra)), `skill.${fnName}`, this.unit);
  }

  /**
   * The official 技力 (PRTS 技能: "可充能X次…当前技力上限等于该技能技力需求的X倍"): the stored charges × cost plus the SP
   * towards the next one — what 联防 carries (BattleResult unitsEnd `sp`; reset rebuilds the charges from it).
   */
  get spTotal() {
    if (this.noSkill || this.kind === 'passive') return 0;
    const cost = this.spCost;
    return this.charges >= this.maxCharges ? this.maxCharges * cost : this.charges * cost + this.sp;
  }

  /**
   * Set the official 技力 to `total` (charges rebuilt, nothing fired — a 修改, not a gain): the 联防 carry, applied again
   * once the deployment is done (Battle._deploy). A passive skill, or a timed one that runs already, is left as it is.
   */
  setSpTotal(total) {
    if (this.noSkill || this.kind === 'passive' || (this.active && this.isTimed) || !Number.isFinite(total)) return;
    this.sp = 0;
    this.charges = 0;
    this.gainSp(Math.max(0, total), 'init', true);
    if (this.spCost <= 0) this.charges = this.maxCharges;
  }

  /**
   * Called on every (re)deployment. `carry` = { sp } for unite (联防) helpers: their 技力 at the end of their own combat
   * (unitsEnd `sp` = spTotal, rebuilt into charges here). Nothing else of the skill is carried — PRTS 卫戍协议/帮助 §联防阶段
   * "将对应单位的生命比例、技力修改至与上一阶段结束时相同": a skill that was running enters 联防 switched off, with the SP it
   * had left (spent at its activation: 0 for a one-charge skill — PRTS 技能 "触发技能后…消耗相应的技力").
   */
  reset(carry = null) {
    this.active = false;
    this.pending = false;
    this.timeLeft = 0;
    this.ammoLeft = 0;
    this.ammoMax = 0;
    this.charges = 0;
    this.sp = 0;
    this._trigKeys = null;
    this._trigSet = null;
    this.blockTicks = 0;
    this._hurt = false;
    this.nextCastAt = -Infinity;
    this._replace = null;
    if (this.unit) this.unit.skillStateUntil = 0;
    if (this.noSkill) return;
    if (this.kind === 'passive') {
      this._startPassive();
      return;
    }
    this.sp = 0;
    this.gainSp(carry && Number.isFinite(carry.sp) ? carry.sp : this.initSp, 'init', true);
    // a free (spCost 0) non-passive skill is available once per deployment
    if (this.spCost <= 0) this.charges = this.maxCharges;
    if (this.spec.activateOnDeploy) this.activate('deploy');
  }

  _startPassive() {
    this.active = true;
    this._applyMods();
    this._call('onStart', { reason: 'passive' });
    // A deploy-time passive (琳琅诗怀雅 S1 仗义疏财 / S2 “见面礼”: kind 'passive' with no duration) never goes through
    // `activate()`, so the client saw no 'skill' event at all and its model never played the skill clip the manifest
    // carries for it (player report follow-up: the 57 instant clips with no Begin / own Idle — 2 of them passives;
    // 凯瑟琳 S1 is `kind: instant` in the sim and already casts). Fire the same bounded window an instant cast uses, so
    // the actor plays that clip once and then goes back to its idle with attacks on the normal clip. A passive WITH a
    // duration (缄默德克萨斯 S1–S3, 野鬃 S1, 伊内丝 S3, 耀骑士临光 S2) is left alone: the sim keeps it active until
    // death, so "how long should its stance show" is a separate question.
    if (!this.noSkill && !(this.duration > 0)) {
      const b = this.battle;
      const u = this.unit;
      b._ev(['skill', u.id, 1]);
      u.skillAnimUntil = b.time + SKILL_ANIM_WINDOW;
      b.after(SKILL_ANIM_WINDOW, () => { if (u.alive) b._ev(['skill', u.id, 0]); }, { owner: u });
    }
  }

  _applyMods() {
    const s = this.spec;
    if (s.mods || s.flags) {
      this.battle.addBuff(this.unit, { key: this._buffKey, mods: s.mods || null, flags: s.flags || null, tags: ['skill'] });
    }
    if (changesRange(s.targeting)) this.battle._refreshRange(this.unit);
  }

  _removeMods() {
    this.battle.removeBuff(this.unit, this._buffKey);
    if (changesRange(this.spec.targeting)) this.battle._refreshRange(this.unit);
  }

  /** Add SP (fires the `spGain` hook). Ignored while a duration/ammo/toggle skill runs (its bar shows the skill). */
  // ignoreLock is reserved for explicitly documented exceptions (黄沙罗盘), not ordinary SP gifts.
  gainSp(amount, reason = 'time', silent = false, { ignoreLock = false } = {}) {
    if (this.noSkill || this.kind === 'passive' || !(amount > 0)) return 0;
    if (this.active && this.isTimed && reason !== 'init' && !ignoreLock) return 0;
    // 阻回 (the operators' 凋亡 burst, damage.js): "停止并阻止任意形式的技力回复" — no SP of any kind (time, attack, hurt, gifts)
    if (reason !== 'init' && !ignoreLock && this.unit.s.flags.noSp) return 0;
    let cost = this.spCost;
    if (this.charges >= this.maxCharges && this.sp >= cost) return 0;
    let amt = amount;
    const b = this.battle;
    if (!silent && b._hooks.spGain) {
      const ctx = { unit: this.unit, amount: amt, reason, skill: this };
      b.emit('spGain', ctx);
      amt = Number.isFinite(ctx.amount) ? ctx.amount : 0;
      if (!(amt > 0)) return 0;
      // handlers may change the cost (spCostMul), end the skill or kill the unit: re-read, never use a stale cost
      if (this.kind === 'passive' || this.noSkill) return 0;
      cost = this.spCost;
      if (this.charges >= this.maxCharges && this.sp >= cost) return 0;
    }
    if (cost <= 0) return 0; // free skills never recharge (see reset)
    this.sp += amt;
    // within 1e-9 of the cost is the cost (the timer tolerance of `timeLeft` below; PR #402): 300 time gains of 1/30 SP
    // add up to 9.999999999999975 in floating point, which held a 10-SP charge one tick
    while (this.sp > cost - 1e-9 && this.charges < this.maxCharges) {
      this.charges++;
      if (this.charges < this.maxCharges) this.sp = Math.max(0, this.sp - cost);
      else this.sp = cost;
    }
    if (this.charges >= this.maxCharges) this.sp = cost;
    return amt;
  }

  /** Re-establish sp/charges invariants after an SP-cost change (e.g. content sets spCostMul mid-battle). */
  _normalize() {
    if (this.noSkill || this.kind === 'passive') return;
    const cost = this.spCost;
    if (cost <= 0) { if (this.sp > 0) { this.sp = 0; this.charges = this.maxCharges; } return; } // became free
    while (this.sp > cost - 1e-9 && this.charges < this.maxCharges) {   // (the 1e-9 of gainSp)
      this.charges++;
      this.sp = this.charges < this.maxCharges ? Math.max(0, this.sp - cost) : cost;
    }
    if (this.sp > cost) this.sp = cost;
  }

  /** Per-tick update: durations, SP regen, tick-based triggers. */
  tick(dt) {
    if (this.noSkill) return;
    const u = this.unit;
    if (this.kind !== 'passive' && this.sp > this.spCost) this._normalize();
    if (this.active && this.kind !== 'passive') {
      if (this.spec.onTick) this._call('onTick', { dt });
      if (this.kind === 'duration' || (this.kind === 'ammo' && Number.isFinite(this.timeLeft))) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 1e-9) { this.end('duration'); }
      }
    } else if (this.active && this.kind === 'passive' && this.spec.onTick) {
      this._call('onTick', { dt });
    }
    // natural SP recovery stops only under 阻回 (noSp; a running timed skill holds it too) — not while 晕眩 / 冻结 / 浮空
    // keep the unit from acting: PRTS 技能 "在阻回状态或技力条已满时，保留剩余冷却时间，计时暂停"; PRTS 异常效果 STUNNED
    // "无法攻击、释放技能、阻挡敌人类单位" says nothing of SP (community report #18: 洛洛's S2 self-stun froze her SP)
    if (this.spType === 'time' && !(this.active && this.isTimed) && !u.s.flags.noSp && u.alive && u.deployed && !u.hidden) {
      const rate = u.s.spRecovery;
      if (rate > 0) this.gainSp(rate * dt, 'time');
    }
    if (!u.canAct) return;
    // a DEFAULT cast bound to an ally condition (塞雷娅 S1) waits for the unit's next attack: should the condition have
    // failed before that attack (the ally healed meanwhile), the cast is dropped and its 技力 is lost (official client:
    // `ReplacementSkill.TryHookSearchTarget` with `_cancelIfSearchTargetFailed` unregisters it; only a target dying in
    // the wind-up gives the 技力 back — ai.js dropNextAttack)
    if (this.pending && this.triggerAllies && this.rule !== 'SKILL_RANGE' && !this._allyTriggerSatisfied()) this.end('withdrawn');
    if (!this.ready || u.s.flags.silence) return;
    if (this.active && this.isTimed) return;
    // a MANUAL skill is cast by the automatic operations only (Battle._autoTriggerPass → autoTrigger)
    if (this.autoOp) return;
    // a cast "next attack" still waits for its attack: another charge now would be spent on the same attack
    if (this.pending) return;
    // an instant / charge skill with no attack of its own is cast at most once per attack interval of its unit
    // (activate sets nextCastAt; GitHub #298): the casts checked here wait for it — the unit's attacks are not touched
    if (!this.isTimed && !this.spec.attack && this.battle.time < this.nextCastAt - 1e-9) return;
    // DEFAULT with an ally condition (塞雷娅 S1, an AUTO NextAttackOrCombatSkill — `DoTick`: the 技力 and its trigger's
    // search, every tick): cast the moment such an ally is there, the 技力 spent now; the heal is her next attack
    if (this.triggerAllies && !TICK_RULES.has(this.rule)) {
      if (this._allyTriggerSatisfied()) this.activate('DEFAULT');
      return;
    }
    if (TICK_RULES.has(this.rule)) {
      if (this._tickRuleSatisfied()) this.activate(this.rule);
    } else if (this.rule !== 'TAKE_DAMAGE' && this.rule !== 'NEVER') {
      // DEFAULT (and unknown rules) for units that cannot attack right now: check the initial range every tick;
      // content trigger ranges are checked every tick for everyone (nothing may be in the unit's own range)
      const prof = u.profile;
      if (prof && (prof.noAttack || (prof.noAttackUnlessSkill && !this.active))) {
        if (this._defaultCondition()) this.activate('DEFAULT');
      } else if (this.triggerRanges.length && !this.healSkill && this._extraTriggerSatisfied()) this.activate('DEFAULT');
    }
  }

  /** A skill the battle's automatic operations cast (a MANUAL skill on any rule but NEVER). */
  get autoOp() { return this.manual && !this.noSkill && this.kind !== 'passive' && this.rule !== 'NEVER'; }

  /** The automatic operations of a MANUAL skill are blocked for this unit (BLOCK_SKILL_TICK passes after a cast). */
  _opCooling() { return this.manual && (this.blockTicks > 0 || this._born()); }

  /** The unit is in its born state (constants.js BORN_TIME after a deployment): `CastSkill.UseSkill` refuses. */
  _born() { return this.battle.time < (this.unit.bornUntil ?? -Infinity) - 1e-9; }

  /**
   * One automatic-operation check of this unit's MANUAL skill (Battle._autoTriggerPass; the client's
   * `AutoChessBattleTrigger._TryTriggerSkill` → `_DoDefaultCheck` → the rule): ready, able, not held by its skill ability
   * (nextCastAt) and its rule met → cast at once (`UseSkill`: a 'state' cast cuts the swing, a 'replace' one arms the next
   * attack). Returns true when it cast.
   */
  autoTrigger() {
    const hurt = this._hurt;
    this._hurt = false;
    if (!this.autoOp) return false;
    const u = this.unit;
    if (!u.alive || !u.deployed) return false;
    // a rule of the skill's own (流形's MLYSS_WTRMAN token branch, content/tokens.js): it checks what it needs (canAutoCast)
    if (this.spec.autoTrigger) return this._call('autoTrigger', {}) === true;
    if (!this.canAutoCast) return false;
    let ok;
    // TAKE_DAMAGE: a hit the born buff could not cast on (onDamaged), or SEARCH's condition — the client pass sends type 12
    // down SEARCH's branch (`_TryTriggerSkill` jump table: types 2 and 12 → `_DoDefaultCheck` + `_TrySearchTarget`), and
    // `_TrySearchTarget` asks the unit's attack trigger (`Character.attackTrigger.Search(false)`; a NeverTrigger attack:
    // its `rangeToShow` selector) — a target of its attack in range, or one it blocks; no skill-specific part
    if (this.rule === 'TAKE_DAMAGE') ok = hurt || this._defaultCondition();
    else if (TICK_RULES.has(this.rule)) ok = this._tickRuleSatisfied();
    else ok = this._autoDefault();
    if (!ok) return false;
    return this.activate(TICK_RULES.has(this.rule) || this.rule === 'TAKE_DAMAGE' ? this.rule : 'DEFAULT');
  }

  /**
   * DEFAULT of a MANUAL skill (the client's `AutoChessBattleTrigger._DefaultTriggerSkill`): a trigger grid (the skill's
   * rangeId, data customRangeGrid) — a selectable enemy, ground or air, on those cells as the unit faces
   * (`LitePhysicsUtil.FindTargetsInBox`, the trigger's ALL-motion options; no 攻击距离 added); none — the unit attacking
   * (`Character.isInAttackState || isInCombatState`): a target of its attack in its initial range — a heal skill an
   * injured ally — or an enemy it blocks (_defaultCondition). Content trigger ranges count too; `trigger.allies` adds the
   * ally condition.
   */
  _autoDefault() {
    const b = this.battle;
    const u = this.unit;
    let ok;
    // the rangeId tiles take an enemy by its position's tile (`LitePhysicsUtil._CheckContainsPosition`), not its collider
    if (this.triggerGrid) ok = b.enemiesOnTiles(this._triggerKeys(), u, TRIGGER_PROFILE).length > 0 || (this.triggerRanges.length > 0 && this._extraTriggerSatisfied());
    else ok = this._defaultCondition();
    return ok && (!this.triggerAllies || this._allyTriggerSatisfied());
  }

  /**
   * The automatic operations may cast this skill now, its rule aside (`_DoDefaultCheck` and what `UseSkill` refuses): the
   * unit on the field, able, out of its born state, the skill ready, not silenced, not running, no cast waiting for its
   * attack, and an instant one past its unit's attack interval (nextCastAt).
   */
  get canAutoCast() {
    const u = this.unit;
    if (!u.alive || !u.deployed || u.hidden || !u.canAct || this._born()) return false;
    if (!this.ready || u.s.flags.silence || (this.active && this.isTimed) || this.pending) return false;
    return this.isTimed || !!this.spec.attack || this.battle.time >= this.nextCastAt - 1e-9;
  }

  /** Public form of the operation cooldown, for kits with their own automatic cast of a MANUAL skill. */
  get opCooling() { return this._opCooling(); }

  /**
   * Absolute tile keys of the trigger grid at the unit's current tile and direction (cached, with their Set). ACTIVE_RANGE
   * grows it by the unit's permanent rangeExtend (the range the skill would run with — Battle._refreshRange) unless the
   * skill's range ignores 攻击距离 (targeting.noRangeExtend).
   */
  _triggerKeys() {
    const u = this.unit;
    const tile = u.tileR * COLS + u.tileC;
    const ext = this.rule === 'ACTIVE_RANGE' && !this.spec.targeting?.noRangeExtend ? (u.s.baseRangeExtend || 0) : 0;
    if (!this._trigKeys || this._trigTile !== tile || this._trigDir !== u.dir || this._trigExt !== ext) {
      this._trigKeys = absoluteRangeKeys(this.triggerGrid, u.tileR, u.tileC, u.dir, ext);
      this._trigSet = new Set(this._trigKeys);
      this._trigTile = tile;
      this._trigDir = u.dir;
      this._trigExt = ext;
    }
    return this._trigKeys;
  }

  /** `trigger.allies`: an injured, healable ally on the trigger grid (the unit's own range without one) ≤ hpAtMost. */
  _allyTriggerSatisfied() {
    const b = this.battle;
    const u = this.unit;
    let keys;
    if (this.triggerGrid) { this._triggerKeys(); keys = this._trigSet; } else keys = u.baseRangeKeys || u.rangeKeys;
    const lim = this.triggerHpAtMost + 1e-9;
    return b.injuredAlliesInKeys(keys, u).some((a) => a.hpRatio <= lim);
  }

  _tickRuleSatisfied() {
    const b = this.battle;
    const u = this.unit;
    if (this.rule === 'SP_FULL') return true;
    // SEARCH: an enemy inside the initial attack range, every tick (librators / phalanxes and 安洁莉娜 do not attack
    // while the skill is off, so DEFAULT's "about to attack" never comes)
    if (this.rule === 'SEARCH') return this._defaultCondition();
    // CUSTOM_RANGE (`_TrySearchWithCustomRange_FindEnemy`): the act2autochess skillRangeDict range as the unit faces, an
    // enemy there, ground or air (the trigger's ALL-motion options); a skill missing from the dict casts once not running
    if (this.rule === 'CUSTOM_RANGE') {
      if (!this.triggerGrid) return !this.active;
      return b.enemiesOnTiles(this._triggerKeys(), u, { canHitFly: true }).length > 0;
    }
    if (this.rule === 'SKILL_RANGE') {
      if (this.triggerAllies) return this._allyTriggerSatisfied();
      if (!this.triggerGrid) return this._defaultCondition();
      return b.anyEnemyOnTiles(this._triggerKeys());
    }
    if (this.rule === 'ACTIVE_RANGE') return this._defaultCondition(this.triggerGrid ? this._triggerKeys() : null);
    // GDGLOW_SKILL_2 "全场存在可选目标时释放技能" (`_GdglowSearchEnemy`): `UnitManager.enemyCnt > 0` — any enemy on the
    // field, stealthed or untargetable included; no ally variant
    if (this.rule === 'GDGLOW_SKILL_2') return b.enemies.some((e) => e.alive);
    return false;
  }

  /**
   * DEFAULT rule condition: an enemy (or injured ally for heal skills) inside the initial range (baseRangeKeys: own
   * grid + permanent rangeExtend), or an enemy inside a content trigger range (addTriggerRange; not for heal skills).
   * `range` (ACTIVE_RANGE): those absolute tile keys instead of the initial range.
   */
  _defaultCondition(range = null) {
    const b = this.battle;
    const u = this.unit;
    if (b.rangeChanged(u)) b._refreshRange(u);
    const keys = range || u.baseRangeKeys || u.rangeKeys;
    if (keys) {
      // (a heal that also restores 元素损伤 heals an ally whose HP is full but whose gauge is not: 赫德雷 … PR #459)
      if (this.healSkill) return b.injuredAlliesInKeys(keys, u, !!u.profile?.heal?.elementHealRatio).length > 0;
      // the unit's own attack range: its attack search (colliders, enemiesInKeys); a trigger grid (`range`, ACTIVE_RANGE):
      // the auto-trigger's tile check (the point, enemiesOnTiles)
      if ((range ? b.enemiesOnTiles(keys, u, u.profile) : b.enemiesInKeys(keys, u, u.profile)).length > 0) return true;
    }
    // the enemies a unit blocks are always its targets (Battle.blockedTargets), in range or not — PRTS 卫戍协议/帮助
    // "敌人被近战干员自身阻挡" satisfies the target condition of the basic strategy (a ranged blocker too: user playtest #6)
    if (!this.healSkill && u.blocking.length && b.blockedTargets(u, u.profile).length > 0) return true;
    return !this.healSkill && this.triggerRanges.length > 0 && this._extraTriggerSatisfied();
  }

  /** Called by the attack loop right before a normal attack/heal. Returns true when the skill fired. */
  onAboutToAttack() {
    if (!this.ready || this.unit.s.flags.silence) return false;
    if (this.active && this.isTimed) return false;
    if (this.rule === 'TAKE_DAMAGE' || this.rule === 'NEVER' || TICK_RULES.has(this.rule)) return false;
    if (this.autoOp || this.pending) return false;   // (a MANUAL skill: the automatic operations — autoTrigger)
    // (a skill read from the client: its skill ability's cooldown and action hold the next cast — _paceInstant)
    if (this.cast && !this.isTimed && !this.spec.attack && this.battle.time < this.nextCastAt - 1e-9) return false;
    // an ally-rule heal (trigger.allies) is cast by the tick (above), not by the attack
    if (this.triggerAllies || !this._defaultCondition()) return false;
    this._beforeAttack = true;   // the attack follows this cast in the same check (ai.js updateAlly): attacks pace it
    try { return this.activate('DEFAULT'); } finally { this._beforeAttack = false; }
  }

  /** TAKE_DAMAGE trigger + INCREASE_WHEN_TAKEN_DAMAGE SP. */
  onDamaged() {
    if (this.noSkill) return;
    if (this.spType === 'hurt' && !(this.active && this.isTimed)) this.gainSp(1, 'hurt');
    if (this.rule !== 'TAKE_DAMAGE') return;
    // the hit casts at once, outside the 0.2 s passes: the client's `AutoChessBattleTrigger._OnUnitBorn` gives a
    // TAKE_DAMAGE (12) character the buff `autochess_trigger_skill[on_take_damage]`, whose ON_TAKE_DAMAGE node triggers the
    // skill (`_checkBeforeTrigger`); a hit the cast could not use is still seen by the next pass (_hurt)
    if (this.autoOp) this._hurt = true;
    if (this.ready && !this.pending && !(this.active && this.isTimed) && this.unit.canAct && !this.unit.s.flags.silence && !this._born()) this.activate('TAKE_DAMAGE');
  }

  /**
   * The 'skill' on event — `['skill', id, 1, variant]` when the spec's `castVariant(ctx)` names one for this cast: the
   * clip variant the client plays (render: anims skill `variants`, docs/rules/render.md 「Spine 클립 커버리지」 G — 灵知's
   * charged S2, 缄默德克萨斯's S3 recast). A display field: no rule reads it.
   */
  _evOn(reason) {
    const v = typeof this.spec.castVariant === 'function' ? this._call('castVariant', { reason }) : null;
    this.battle._ev(typeof v === 'string' && v ? ['skill', this.unit.id, 1, v] : ['skill', this.unit.id, 1]);
  }

  /** Activate now (consumes one charge). Returns true on success. */
  activate(reason = 'manual', { free = false } = {}) {
    if (this.noSkill || this.kind === 'passive') return false;
    if (!free && !this.ready) return false;
    if (this.active && this.isTimed) return false;
    const u = this.unit;
    if (!u.alive || !u.deployed) return false;
    if (!free) {
      const wasFull = this.charges >= this.maxCharges;
      this.charges--;
      if (this.maxCharges === 1 || wasFull) this.sp = 0;
    }
    this.activations++;
    this.lastStart = this.battle.time;
    const b = this.battle;
    if (this.manual) this.blockTicks = BLOCK_SKILL_TICK;
    if (this.isTimed) {
      this.active = true;
      this.timeLeft = this.kind === 'duration' ? Math.max(0.01, this.duration) : (this.kind === 'ammo' && this.duration > 0 ? this.duration : Infinity);
      this.ammoLeft = this.kind === 'ammo' ? Math.max(1, this.ammo) : 0;
      this.ammoMax = this.ammoLeft;
      this._applyMods();
    } else {
      // instant / charges
      this.active = true;
      this.pending = !!this.spec.attack;
      // (a targeting-only instant skill must still switch to its skill range for the pending attack)
      if (this.spec.mods || this.spec.flags || this.spec.targeting) this._applyMods();
      // a ReplacementSkill (the client's `ReplacementSkill.ApplyModification` → `Character.RegisterReplacement`): the SP
      // is spent now, the skill goes out as the unit's next attack — ai.js startReplacement, fireReplacement below
      if (!this.pending && this._replacesAttack()) {
        this.pending = true;
        this._replace = { reason };
        return true;
      }
    }
    this._evOn(reason);
    u.skillAnimUntil = b.time + SKILL_ANIM_WINDOW;
    // a CastSkill casts its skill ability now: the unit turns by its flags (ai.js castFace; a 'replace' cast turns as
    // its attack starts — ai.js startReplacement / swingFace)
    if (this.cast && this.cast.mode !== 'replace' && this.cast.time != null) castFace(b, u, this.cast.face);
    this._call('onStart', { reason });
    if (b._hooks.skillStart) b.emit('skillStart', { unit: u, skill: this, reason });
    // bullets added in skillStart (拉特兰's round(ammo × (0.05 + 0.015 × layers)), 逃犯引渡手续, talents): the bar's full mark
    // (community report #35: the extra bullets sat above a full bar until fewer than the base count were left)
    if (this.active && this.ammoLeft > this.ammoMax) this.ammoMax = this.ammoLeft;
    if (!this.isTimed && !this.pending) {
      this.end('instant');
      // (a cast onEnd opened again owns its own gap)
      if (!this.active && !this.spec.attack && u.alive) this._paceInstant();
    }
    return true;
  }

  /** A 'replace' cast of this unit: an instant / charge skill with no attack override, cast by a unit that attacks. */
  _replacesAttack() {
    const p = this.unit.profile;
    return this.cast?.mode === 'replace' && !this.spec.attack && !this.spec.inAttack && !this.isTimed && !!p && !p.noAttack && !p.noAttackUnlessSkill;
  }

  /** A 'replace' cast waits for the unit's next attack (ai.js updateAlly). */
  get replacing() { return this.pending && !!this._replace; }

  /**
   * The time of the skill ability for this unit now (the client's `AbstractAnimatedAbility.get_cooldown` / `DoAttach` /
   * `UpdatePlaybackSpeed`): its time `t` — `time` 0 FROM_ATTACK_SPEED the unit's attack interval, 1 FROM_ANIMATION its
   * clip (`DoAttach` writes `Entity.GetAnimationTime(_animKey)` into `_cooldown`; [ASSUMED] the attack interval when the
   * skeleton has no such clip), 2 / 3 `cd` — is its cooldown; its clip plays scaled to `t` within [MIN_ANIM_SCALE,
   * `max`] as an attack's (ai.js attackTiming): `action` = scale × clip (no clip known: `t`), `strike` = its OnAttack
   * frame × scale (`wait` off: `pre` × scale; no OnAttack frame: the action's end). No skill ability: all 0.
   * @returns {{ action: number, strike: number, cooldown: number }}
   */
  castTiming(out = { action: 0, strike: 0, cooldown: 0 }) {
    const c = this.cast;
    const iv = this.unit.s?.interval > 0 ? this.unit.s.interval : 0;
    if (!c || c.time == null) { out.action = 0; out.strike = 0; out.cooldown = 0; return out; }
    const t = c.time === 1 ? (c.dur ?? iv) : c.time === 2 || c.time === 3 ? c.cd : iv;
    let action = t, strike;
    if (c.dur) {
      let scale = t / c.dur;
      if (!(scale >= MIN_ANIM_SCALE)) scale = MIN_ANIM_SCALE;
      if (scale > c.max) scale = c.max;
      action = scale * c.dur;
      strike = c.wait ? (c.hit != null ? c.hit * scale : action) : Math.min(action, c.pre * scale);
    } else strike = c.wait ? action : Math.min(action, c.pre);
    out.action = action;
    out.strike = strike;
    out.cooldown = t;
    return out;
  }

  /**
   * After an instant / charge cast with no attack of its own (a throw, a heal, a buff, DP …): when may it be cast again,
   * and does the unit stop attacking meanwhile (docs/rules/sim.md 「즉발 스킬의 시전」, maintainer decision 2026-10-11:
   * the client's classes). The skill ability must be ready again (`CastSkill.IsAvailable` → `Ability.isReady`: its
   * cooldown from the cast and not casting): 'free' (`_switchToState` 0) waits its cooldown only and leaves the unit's
   * attacks alone; 'state' (`_switchToState` 1, `Character.States.SkillState`) also cuts the swing in progress (the
   * attack cooldown is kept and keeps running) and keeps the unit from attacking until the skill ability's action ends
   * (`unit.skillStateUntil`; a stun / freeze ends it — `SkillState.OnTick`), the next cast waiting for that end and the
   * cooldown — only for the end with `resetCd` (`CastSkill.OnCastFinish` resets the ability). A buff-only cast (no
   * animated ability; `ActiveBuffAbility.cooldown` = its buffs' lifetime, instant ones here) waits for nothing but SP.
   * Not read from the client (no `cast`): one attack interval of its unit before it is cast again from the tick
   * (GitHub #298, the rule up to 2026-10-11), a cast right before an attack (DEFAULT) paced by those attacks.
   */
  _paceInstant() {
    const b = this.battle;
    const u = this.unit;
    const c = this.cast;
    if (!c) {
      if (!this._beforeAttack && u.s.interval > 0) this.nextCastAt = b.time + u.s.interval;
      return;
    }
    if (c.time == null) return;
    const t = this.castTiming();
    if (c.mode === 'state') {
      u.swing = null;
      u.castLeft = 0;
      u.skillStateUntil = b.time + t.action;
      if (t.action > SKILL_ANIM_WINDOW) u.skillAnimUntil = b.time + t.action;
      this.nextCastAt = b.time + (c.resetCd ? t.action : Math.max(t.action, t.cooldown));
    } else this.nextCastAt = b.time + t.cooldown;
  }

  /** A 'replace' cast's attack starts (ai.js startReplacement): the skill clip plays for its action. */
  beginReplacement(action) {
    const b = this.battle;
    const u = this.unit;
    this._evOn(this._replace?.reason ?? 'DEFAULT');
    u.skillAnimUntil = b.time + (action > SKILL_ANIM_WINDOW ? action : SKILL_ANIM_WINDOW);
  }

  /**
   * The strike of a 'replace' cast's attack (its OnAttack frame): the skill's effect (onStart — the kit picks its own
   * targets, as the client's `ReplacementSkill.TryHookSearchTarget` does: no enemy needed), then the cast ends. The
   * unit's next attack comes one attack interval after this attack's start (`Character.ClearReplacement` hands the skill
   * ability's cooldown, matched to the attack's at the cast, back to the attack). Returns true when it fired.
   */
  fireReplacement() {
    const r = this._replace;
    if (!r || !this.pending || !this.active) return false;
    this._replace = null;
    this.pending = false;
    const b = this.battle;
    const u = this.unit;
    this._call('onStart', { reason: r.reason });
    if (b._hooks.skillStart) b.emit('skillStart', { unit: u, skill: this, reason: r.reason });
    if (this.active && !this.isTimed && !this.pending) this.end('instant');
    return true;
  }

  /**
   * Called after each attack/heal performed by the unit. `noAmmo` (Battle.forceAttack opts, or `ctx.noAmmo = true`
   * set by the spec's onAttack) = this attack spends no ammo of a running ammo skill (no `ammoUsed`).
   */
  onAttackPerformed(targets, usedOverride, noAmmo = false) {
    if (this.noSkill) return;
    const b = this.battle;
    // AK: attacks made by the skill (the "next attack" of an instant/charge skill, every attack of a running timed
    // skill — including the one that ends it) never recover attack-type SP ⇒ a cost-N skill fires every N+1 attacks.
    const skillAttack = this.active && (this.isTimed || (!!usedOverride && this.pending));
    if (this.active && typeof this.spec.onAttack === 'function') {
      const fn = this.spec.onAttack;
      const ctx = this._ctx({ targets, noAmmo: !!noAmmo });
      b._safe(() => fn(ctx), 'skill.onAttack', this.unit);
      noAmmo = !!ctx.noAmmo;
    }
    if (this.active && this.kind === 'ammo' && noAmmo) {
      // an extra attack that spends no bullet
    } else if (this.active && this.kind === 'ammo') {
      this.ammoLeft--;
      if (b._hooks.ammoUsed) b.emit('ammoUsed', { unit: this.unit, left: this.ammoLeft, skill: this });
      if (this.ammoLeft <= 0) this.end('ammo');
    } else if (usedOverride && this.pending && !this.isTimed) {
      this.pending = false;
      this.end('instant');
    }
    if (this.spType === 'attack' && !skillAttack && !(this.active && this.isTimed)) this.gainSp(1, 'attack');
  }

  /**
   * End the active skill. onEnd runs while the skill's mods / range are still applied (end-of-skill effects — finishers,
   * bombardments — use the skill's stats and range; `active` is already false), then they are removed and `skillEnd`
   * fires — neither when onEnd re-activated the skill (the new cast owns both).
   */
  end(reason = 'end') {
    if (!this.active || this.kind === 'passive' && reason !== 'death') return;
    const u = this.unit;
    const b = this.battle;
    this.active = false;
    this.pending = false;
    this._replace = null;
    this.timeLeft = 0;
    this.ammoLeft = 0;
    this.ammoMax = 0;
    const n = this.activations;
    this._call('onEnd', { reason });
    // onEnd started the next cast (耀骑士临光 S2 retreats on its duration end and 不屈 redeploys her inside that call; the
    // deploy-timed skill starts again, PR #109): that cast owns the mods and its events — a trailing skillEnd would make
    // listeners (骑士戒律) clear the new cast and the client would see the skill off while it runs
    if (this.active || this.activations !== n) return;
    this._removeMods();
    if (b._hooks.skillEnd) b.emit('skillEnd', { unit: u, skill: this, reason });
    if (this.kind !== 'passive') b._ev(['skill', u.id, 0]);
  }

  /** The attack override to use for the next attack, or null. */
  attackOverride() {
    if (!this.active) return null;
    if (this.isTimed || this.kind === 'passive') return this.spec.attack || null;
    return this.pending ? (this.spec.attack || null) : null;
  }

  targetingOverride() {
    if (!this.active || !this.spec.targeting) return null;
    if (!this.isTimed && this.kind !== 'passive' && !this.pending) return null;
    return this.spec.targeting;
  }

  // ---- helpers for content -------------------------------------------------------------------------------
  // (non-finite arguments are ignored: a NaN timer/ammo count would keep the skill active forever)
  // (bullets added above the activation's most so far raise the bar's full mark: the bar drains one bullet at a time)
  addAmmo(n) {
    if (!this.active || this.kind !== 'ammo' || !Number.isFinite(n)) return;
    this.ammoLeft += n;
    if (this.ammoLeft > this.ammoMax) this.ammoMax = this.ammoLeft;
  }
  extend(seconds) { if (this.active && Number.isFinite(this.timeLeft) && Number.isFinite(seconds)) this.timeLeft += seconds; }
  addCharge(n = 1) { if (!Number.isFinite(n)) return; this.charges = Math.max(0, Math.min(this.maxCharges, this.charges + n)); if (this.charges >= this.maxCharges) this.sp = this.spCost; }
  stop() { this.end('stopped'); }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `Skill<${this.id} ${this.kind} sp=${this.sp.toFixed(2)}/${this.spCost} ch=${this.charges}${this.active ? ' active' : ''}>`;
  }
}
