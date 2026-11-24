// server/sim/battle/lifecycle.js — Battle methods: lifecycle: start (the battle-start deployment: by column, operators
// then summons, one piece every `prebuiltInterval`; then the wave clock: 联防 forced exits, `battleStart`), step (the tick order of the Battle.js header), the end checks, timeout
// / forced / cleared finishes and the BattleResult.
// Installed on Battle.prototype by server/sim/Battle.js (a method container: never instantiated; `this` is the battle).

/** @import { Battle } from '../Battle.js' */
/** @import { Unit } from '../units.js' */
/** @import { LeakEntry } from './deploy.js' */
/** @import { BattlePlayer } from './players.js' */
/**
 * A projectile in flight as the line of _tickUnits reads it (projectiles.js: `seq` on the units' counter).
 * @typedef {{ done?: boolean, firedAt?: number, seq: number }} Shot
 * An operator / board summon at the end of the battle (`unitsEnd`: the 联防 carry, match/unite.js).
 * @typedef {{ uid: number | null, id: number, defId: string, hpPct: number, sp: number, skillActive: boolean,
 *   alive: boolean, respawnLeft?: number }} UnitEnd
 * A unit's tally for the settlement charts (`unitStats`, server/match/unitTally.js).
 * @typedef {{ id: number, uid: number | null, defId: string, name: string, kind: string, dmg: number, kills: number,
 *   heal: number, taken: number, attacks: number, byType?: number[], boss?: number, assist?: Record<string, number>,
 *   ownerUid?: number }} UnitStat
 * A player's part of the BattleResult (`_perPlayer`; `resolved` derived at result time).
 * @typedef {{ killed: number, total: number, leaked: LeakEntry[], perfect: boolean, killedInTotal: number,
 *   leakedInTotal: number, layerGains: Record<string, number>, tempLayerGains?: Record<string, number>, coins: number,
 *   damageDealt: number, bossDamage: number, healingDone: number, deaths: number, unitsEnd: UnitEnd[],
 *   unitStats: UnitStat[], resolved?: number }} PlayerResult
 * A queued spawn the time limit dropped (`result().unspawned`).
 * @typedef {{ enemyKey: string, time: number, tag: string | null, sourcePlayerId: string | null }} Unspawned
 * The BattleResult (DESIGN §5.1).
 * @typedef {{ time: number, reason: string | null, perPlayer: Record<string, PlayerResult>, killed: number,
 *   total: number, resolved: number, errors: number, unspawned?: Unspawned[], bossHpLeft?: number,
 *   synthetic?: boolean }} BattleResult `synthetic`: a stand-in for a field no battle finished (match/fields.js)
 */
import { BLOCK_SKILL_TICK, FORCED_EXIT, MAX_BATTLE_TIME } from '../constants.js';
import { updateAlly, updateEnemy } from '../ai.js';
import { seasonFeature } from '../../../shared/seasons.js';

const byDeploySeq = (/** @type {Unit} */ a, /** @type {Unit} */ b) => a.deploySeq - b.deploySeq;

export class BattleLifecycle {
  /** @this {Battle} */
  start() {
    if (this.started) return;
    this.started = true;
    this._safe(() => this._spawnStageDevices(), 'stageDevices');
    // PRTS 卫戍协议/帮助 §作战阶段: "按从上到下>从左到右的顺序部署。优先部署干员，随后为召唤物（如果有）", noted "自卫戍协议：
    // 盟约 下半（2026/3/14）起，部署顺序由“从左到右>从下到上”更改为“从上到下>从左到右”" — a scanning order: down each column
    // (top first), the columns from left to right; act 1's along each row, the rows from the bottom. It is the order PRTS
    // gives the 阿戈尔 devour ("从最先部署（更靠左和靠上的）的【阿戈尔】干员开始", content/bonds/nation/egir.js egirOrder) and the one
    // act-2 videos show. Per player the operators, left column first, top to bottom within a column (the mirrored right
    // boss side from its own left, i.e. the highest field column — PRTS "部署顺序…左右镜像", research 01 §4.3), then the
    // summon pieces in the same order. Until 0.1.3 the top row came first (row-major). [ASSUMED] On a shared field (联防,
    // boss) the players' fields deploy at the same time (PRTS: one unit after another with a fixed delay, from the battle
    // start), so the i-th operators of all players come in together (in `players` order), then the summons likewise.
    // One such group every `flags.prebuiltInterval` game seconds (client `_Prebuilt`: a piece, then WaitForFixedSeconds
    // 0.2 — constants.js PREBUILT_INTERVAL, maintainer decision 2026-10-10; until then all at 0 s), the first at once; the
    // wave clock starts one interval after the last (_beginWave). Units already down act meanwhile (SP, auras — no enemy
    // is out yet).
    const seq0 = this._deploySeq;
    const lists = /** @type {BattlePlayer[]} */ (this.players).map((ps) => ps.units.filter((u) => u.kind === 'op' || u.kind === 'token').slice().sort((a, b) =>
      (ps.mirror ? b.homeC - a.homeC : a.homeC - b.homeC) || b.homeR - a.homeR || a.id - b.id));
    // a summon piece flagged `deferDeploy` by content (one its owner's loadout does not make — 赫默 on S1 with a drone
    // piece —, or a skill's summon when shared/constants.js SKILL_SUMMON_START_DEPLOY is off: content/tokens.js
    // dockSkillSummons) stays off the field, its tile reserved (isReservedTile), until content deploys it
    // (_startDeploying: a board piece content brings in during this deployment — a tactician's 流形 / 狼群 comes with
    // its owner's deploy — takes its 联防 carry on that first deployment too)
    const groups = [];
    for (const kind of ['op', 'token']) {
      const per = lists.map((l) => l.filter((u) => u.kind === kind && !u.deferDeploy));
      const n = Math.max(0, ...per.map((l) => l.length));
      for (let i = 0; i < n; i++) groups.push(per.map((l) => l[i]).filter(Boolean));
    }
    this._prebuilt = { groups, k: 0, t0: this.time, seq0 };
    this._prebuiltStep();
  }

  /**
   * The battle-start deployment's next groups whose time has come (start: _prebuilt `t0` + k × prebuiltInterval), then —
   * one interval after the last — the wave clock (_beginWave). Runs from start() and every tick until the wave began.
   * @this {Battle}
   */
  _prebuiltStep() {
    const P = this._prebuilt;
    if (!P) return;
    const iv = this.flags.prebuiltInterval;
    const now = this.time + 1e-9;
    while (P.k < P.groups.length && P.t0 + P.k * iv <= now) {
      const g = P.groups[P.k++];
      this._startDeploying = true;
      for (const u of g) this._safe(() => this._deploy(u, { initial: true }), 'initialDeploy', u);
      this._startDeploying = false;
    }
    if (P.k >= P.groups.length && P.t0 + P.groups.length * iv <= now) {
      this._prebuilt = null;
      this._beginWave(P.seq0);
    }
  }

  /**
   * The wave clock starts (client ON_BATTLE_STARTED, then `Scheduler.Init` / `DoSchedule`): the stage's spawn times count
   * from now (`waveT0`; the time limit from the battle start), the start-of-battle summons rank in aggro, 联防 forced exits, `battleStart`.
   * @param {number} seq0
   * @this {Battle}
   */
  _beginWave(seq0) {
    this.waveT0 = this.time;
    if (this.waveT0 > 0) for (const p of this._pending) p.time += this.waveT0;
    // 仇恨 (targeting.js sortAllyTargets: the later deployed is attacked first): every summon that came in during the
    // initial deployment — also one an operator's deploy brought along (a tactician's 援军, a start-of-battle summon)
    // — ranks after all the operators (of every player on the field [ASSUMED]), in the order it came
    const summons = this.allyUnits.filter((u) => u.kind === 'token' && u.alive && u.deployed && u.deploySeq > seq0).sort((a, b) => a.deploySeq - b.deploySeq);
    for (const t of summons) t.aggroSeq = ++this._deploySeq;
    // 联防 (PRTS 卫戍协议/帮助 "部署完成后…上一阶段为退场状态的干员强制退场"): an operator knocked out at the end of its
    // own combat is withdrawn right after the deployment — down on its tile, its redeploy timer starting now (re-read
    // after battleStart below; DESIGN §5.5). Its HP ratio is the end-of-phase one (0, as after kill()) until it
    // redeploys at full HP.
    for (const u of this.allyUnits) {
      if (u.kind === 'op' && u.alive && u.carry && u.carry.down === true) {
        this._safe(() => { u.hp = 0; this.retreat(u, { reason: FORCED_EXIT }); }, 'forcedExit', u);
      }
    }
    this.emit('battleStart', {});
    // redeploy-time effects that start with the battle (机变 征召 "所有干员的再部署时间-50%", added by a battleStart
    // handler) cover the operators forced out above too: their timer is re-read with them, as a later knock-out's is
    // — except in a season where it keeps the rest of its own combat's timer (shared/seasons.js uniteKeepsRedeploy, PRTS
    // "规程·序列Ⅰ起…继承剩余再部署时间": carryState.respawnLeft, match/unite.js), which this battle's effects leave as it is
    // [ASSUMED·자료 없음: whether a redeploy-time effect of the 联防 field shortens the inherited rest again]
    for (const u of this.allyUnits) {
      if (u.kind !== 'op' || u.alive || u.removed || u.removeReason !== FORCED_EXIT) continue;
      const left = u.carry && Number.isFinite(u.carry.respawnLeft) ? Math.max(0, u.carry.respawnLeft) : null;
      u.respawnAt = u.deathAt + (left ?? Math.max(0, u.base.respawnTime * u.persist.redeployMul * u.s.redeployMul));
    }
  }

  /** @this {Battle} */
  step() {
    if (this.finished || this._stepping) return; // re-entrant step() from a hook is a no-op
    // forceEnd() requested while stepping (content hook, repeated engine errors) is deferred to the end of the
    // current phase: the remaining phases are skipped and the result is built once, so nothing mutates it later.
    this._stepping = true;
    try {
      if (!this.started) this._phase('start', () => this.start());
      else if (this._prebuilt) this._phase('prebuilt', () => this._prebuiltStep());
      const dt = this.dt;
      this._phase('scheduled', () => this._runScheduled());
      this._phase('spawns', () => this._processSpawns());
      this._phase('dp', () => {
        for (const ps of this.players) ps.dp = Math.min(this.flags.dpMax, ps.dp + this.flags.dpPerSec * dt);
      });
      this._phase('units', () => this._tickUnits(dt));
      this._compactEnemies();
      // the automatic skill operations, one pass every AUTO_TRIGGER_INTERVAL s after the units' own ticks (skills.js
      // autoTrigger; a cast there acts from the next tick, as a tick-rule cast did)
      if (this.tickCount % this._autoTriggerTicks === 0) this._phase('autoTrigger', () => this._autoTriggerPass());
      this._phase('redeploy', () => this._checkRedeploys());
      this._phase('boss', () => this._bossSync());
      if (this._hooks.tick) this._phase('tickHook', () => this.emit('tick', { dt }));
      this._compactEnemies();
      if (this._toRelease.length) this._releaseRemoved();
      if (!this._endReq && !this.finished) {
        this.tickCount++;
        this.time = this.tickCount * dt; // no floating drift over long battles
        this._phase('endCheck', () => this._checkEnd());
      }
    } finally {
      this._stepping = false;
    }
    if (this._endReq && !this.finished) {
      try { this.forceEnd(this._endReq); } catch (e) { this._handlerError('internal:forceEnd', null, e); this._hardFinish(this._endReq); }
    }
  }

  /**
   * The units' own ticks (the client's BattleController.OnTick: BattleTweenMgr.Tick, then ObjectManager.OnFixedUpdate).
   * First every enemy's block slide (_tickBlockMove: the tweens run before any object), then every living unit — enemies,
   * operators, summons and devices alike — and every projectile in flight (the client's Projectile is a BObject too:
   * projectiles.js step) in one line by `deploySeq`, the order they came onto the field or were fired: the client
   * ticks its objects by `instanceUid` (BObject.CompareTo: `priority` first, which no battle object changes), numbered
   * from one counter as each is taken from the pool (BObject.OnAllocate) — a redeployment or 【移动】 is a new one. The
   * line is the units alive as the pass starts (the client copies the `validAndBorned` objects into `m_cachedList`
   * first): one made, spawned or redeployed during the pass ticks from the next step, one that went down before its turn
   * is passed over.
   * An enemy (Enemy.OnTick → Entity.OnTick: its state machine — attack, move —, then BuffContainer.Tick and the HP
   * recovery): updateEnemy, then its buffs. An ally (Character.OnTick: Unit.OnTick — its abilities, the skill's timer
   * among them, last —, then `_SearchBlockee`, then BasicSkill.Tick — the SP recovery and the skill's own tick):
   * updateAlly (a device has no attack), its buffs, its running skill's duration (skills.js tickActive), its search for
   * enemies to block when due (battle/blocking.js), then its skill (skills.js tick: SP, the automatic casts).
   * The enemy tile index (queries.js _indexEnemy) is filed anew as the pass starts and refiles each enemy after its own
   * tick and as another unit moves it (battle/displacement.js displace, a teleport), so a unit sees every enemy where it
   * is now — the client's `LitePhysicsUtil.FindTargetsInBox` goes over the side's units (`UnitManager
   * .GetUnitsBySingleSide`) and reads each one's position (`_CheckContainsPosition`); it keeps no index.
   * @param {number} dt
   * @this {Battle}
   */
  _tickUnits(dt) {
    const enemies = this.enemies;
    for (let i = 0, n = enemies.length; i < n; i++) {   // the slides, then each enemy filed where it stands
      const e = enemies[i];
      if (e.alive && e.blockMove) this._tickBlockMove(e, dt);
      this._indexEnemy(e);
    }
    // the line: the deployed allies by deploySeq merged with the enemies (already in that order: spawns.js) and the
    // projectiles in flight (numbered on the same counter as they are fired: projectiles.js); `kinds` keeps which list
    // each came from (the loop then reads one shape per branch)
    const allies = this._lineAllies, line = this._line, seqs = this._lineSeq, kinds = this._lineKind;
    allies.length = 0; line.length = 0; seqs.length = 0; kinds.length = 0;
    for (const u of this.allyUnits) if (u.alive && u.deployed) allies.push(u);
    if (allies.length > 1) allies.sort(byDeploySeq);
    const pl = this.projectiles, shots = /** @type {Shot[]} */ (pl.list);
    let ai = 0, ei = 0, pi = 0;
    const na = allies.length, ne = enemies.length, np = shots.length;
    for (;;) {
      while (ei < ne && !enemies[ei].alive) ei++;
      while (pi < np && (shots[pi].done || shots[pi].firedAt === this.tickCount)) pi++;
      const as = ai < na ? allies[ai].deploySeq : Infinity;
      const es = ei < ne ? enemies[ei].deploySeq : Infinity;
      const ps = pi < np ? shots[pi].seq : Infinity;
      if (es < as && es < ps) { line.push(enemies[ei++]); seqs.push(es); kinds.push(0); }
      else if (as < ps) { line.push(allies[ai++]); seqs.push(as); kinds.push(1); }
      else if (ps < Infinity) { line.push(shots[pi++]); seqs.push(ps); kinds.push(2); }
      else break;
    }
    let shotList = shots, live = null;
    for (let i = 0, n = line.length; i < n && !this._endReq; i++) {
      const k = kinds[i];
      if (k === 0) this._tickEnemy(line[i], dt);
      else if (k === 1) this._tickAlly(line[i], seqs[i], dt);
      else {
        const p = line[i];
        if (p.done) continue;
        // content may replace the list (op-logos.js clears the enemy shots on its range): the ones it dropped are gone
        if (pl.list !== shotList) { shotList = /** @type {Shot[]} */ (pl.list); live = new Set(shotList); }
        if (live && !live.has(p)) continue;
        try { pl.step(p, dt); } catch (err) { this._internalError('projectiles', err); }
      }
    }
    line.length = 0; seqs.length = 0; kinds.length = 0; allies.length = 0;
    pl.compact();
  }

  /**
   * Enemy `e`'s own tick in the line (_tickUnits): its attack / move, then its buffs.
   * @param {Unit} e @param {number} dt
   * @this {Battle}
   */
  _tickEnemy(e, dt) {
    if (!e.alive) return;
    try { updateEnemy(this, e, dt); } catch (err) { this._internalError('updateEnemy', err); }
    this._clampPos(e);
    this._indexEnemy(e);
    if (e.alive) this._tickUnitBuffs(e, dt);
  }

  /**
   * Ally `u`'s own tick in the line (_tickUnits): its attack, its buffs, its skill's duration, its block search when due,
   * its skill. `seq`: its
   * deploySeq as the pass started (a unit redeployed since is a new one: it waits for the next step).
   * @param {Unit} u @param {number} seq @param {number} dt
   * @this {Battle}
   */
  _tickAlly(u, seq, dt) {
    if (!u.alive || !u.deployed || u.deploySeq !== seq) return;
    if (u.kind !== 'device') {
      try { updateAlly(this, u, dt); } catch (err) { this._internalError('updateAlly', err); }
    }
    if (u.alive) this._tickUnitBuffs(u, dt);
    if (u.alive && u.deployed && u.skill) {
      try { u.skill.tickActive(dt); } catch (err) { this._internalError('updateAlly', err); }
    }
    if (u.alive && u.deployed && this._blockSearchDue(u)) {
      try { this._searchBlockees(u); } catch (err) { this._internalError('searchBlockees', err); }
    }
    if (u.alive && u.deployed && u.skill) {
      try { u.skill.tick(dt); } catch (err) { this._internalError('updateAlly', err); }
    }
  }

  /**
   * One pass of the automatic skill operations (the client's `AutoChessBattleTrigger._TryTriggerAvailableSkills`, every
   * 0.2 s: `AutoTrigger` → `WaitForFixedSeconds(AUTO_TRIGGER_INTERVAL)`; maintainer decision 2026-10-11): over the
   * characters, one whose block runs counts it down and is skipped; the first whose MANUAL skill casts
   * (SkillRuntime.autoTrigger) is blocked BLOCK_SKILL_TICK passes and the pass ends there — one automatic cast per pass in
   * the whole battle. The client runs one trigger per battle over `UnitManager.characters`, whoever's side (a shared
   * field: every player's units in one pass); that list is `_chars` (Battle._deploy appends, _remove moves the last
   * into the hole).
   * @this {Battle}
   */
  _autoTriggerPass() {
    const list = this._chars;
    for (let i = 0; i < list.length && !this._endReq; i++) {
      const u = list[i];
      const sk = u.skill;
      if (!u.alive || !u.deployed || !sk || !sk.autoOp) continue;
      if (sk.blockTicks > 0) { sk.blockTicks--; sk._hurt = false; continue; }
      let cast = false;
      try { cast = sk.autoTrigger(); } catch (err) { this._internalError('autoTrigger', err); }
      if (cast) { sk.blockTicks = BLOCK_SKILL_TICK; return; }
    }
  }

  /**
   * Last-resort finish when building the normal result threw (never throws itself).
   * @param {string} reason
   * @this {Battle}
   */
  _hardFinish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.reason = reason === 'timeout' ? 'timeout' : 'forced';
    this._endReq = null;
    try { this._result = this._buildResult(); } catch { this._result = { time: this.time, reason: this.reason, perPlayer: {}, killed: this.killed, total: this.total, resolved: this.resolved, errors: this.errorCount }; }
    this.projectiles.clear();
  }

  /**
   * Run until finished or `maxSeconds` of game time elapsed. Returns the result when finished.
   * @param {number} [maxSeconds] @returns {BattleResult | null}
   * @this {Battle}
   */
  runToEnd(maxSeconds = MAX_BATTLE_TIME) {
    const limit = this.time + maxSeconds;
    while (!this.finished && this.time < limit) this.step();
    return this.finished ? this.result() : null;
  }

  /**
   * @param {string} name @param {() => void} fn
   * @this {Battle}
   */
  _phase(name, fn) {
    if (this.finished || this._endReq) return;
    try { fn(); } catch (e) { this._internalError(name, e); }
  }

  /** @this {Battle} */
  _checkEnd() {
    if (this.finished) return;
    if (this.sharedBoss && this.sharedBoss.hp <= 0) { this._finish('cleared'); return; }
    // A boss / hidden field with a shared pool ends only when the pool is empty or the match forces an end (DESIGN
    // §5.5) — never merely because it emptied: the h07_04 pair leader (official route: no wait) can walk into the
    // objective, and the field then idles while another field may still empty the pool or the overtime drain ends it.
    const poolHolds = !!this.sharedBoss && (this.kind === 'boss' || this.kind === 'hidden');
    // the time limit counts from the battle start, the deployment included (maintainer confirmation 2026-10-10: the
    // official countdown runs while the pieces come in — docs/rules/sim.md 「작전 시작 차례 배치」); only the spawns wait
    // for the wave clock
    if (this.time >= this.timeLimit - 1e-9) { this._timeout(); return; }
    if (this.waveT0 == null) { if (this.time >= MAX_BATTLE_TIME) this._timeout(); return; } // the battle-start deployment runs
    if (this.autoFinish && !poolHolds && !this._pending.length && !this.enemies.some((e) => e.alive) && this.started) {
      if (!this._hasPendingEnemySchedules()) { this._finish('cleared'); return; }
    }
    if (this.time >= MAX_BATTLE_TIME) { this._timeout(); return; }
  }

  /** @this {Battle} */
  _hasPendingEnemySchedules() {
    for (const s of this._sched) if (!s.cancelled && s.holdsBattle) return true;
    return false;
  }

  /** @this {Battle} */
  _timeout() {
    // Remaining non-boss enemies on the field count as leaked (DESIGN §5.5). Spawns that never happened before the
    // limit are dropped: they are removed from `total` and reported in `result().unspawned` (not leaks). A content-made
    // neutral (`mem.noLeak`: 隐德来希's 心烛, which follows its original) is never a leak — it is in no spawn schedule, so
    // a client result listing it would be rejected (fields.js validateClientResult 'leak key').
    for (const e of this.enemies) {
      if (!e.alive || e.isBoss || e.mem.noLeak) continue;
      this._recordLeak(e, true);
    }
    /** @type {Unspawned[]} */
    this.unspawned = [];
    for (const p of this._pending) {
      if (p.precounted) {
        this.total--;
        const pp = this._pp(p.ownerPlayerId ?? this._ownerForTile(p.pos ?? this._routeFor(p.routeIndex, p.route)?.start));
        if (pp) pp.total--;
      }
      this.unspawned.push({ enemyKey: p.enemyKey, time: p.time, tag: p.tag ?? null, sourcePlayerId: p.sourcePlayerId ?? null });
    }
    this._pending = [];
    this._finish('timeout');
  }

  /**
   * @param {string} [reason]
   * @this {Battle}
   */
  forceEnd(reason = 'forced') {
    if (this.finished) return;
    if (this._stepping) { if (!this._endReq) this._endReq = reason; return; } // finalised when step() unwinds
    this._endReq = null;
    if (!this.started) this.start();
    if (this.finished) return;
    if (reason === 'surrender') this.surrender();
    else if (reason === 'timeout') this._timeout();
    else this._finish('forced');
  }

  /**
   * Voluntary defeat: charge every unresolved enemy, including the queued wave, without granting kills.
   * @this {Battle}
   */
  surrender() {
    if (this.finished) return;
    if (this._stepping) { this._endReq = 'surrender'; return; }
    if (!this.started) this.start();
    if (this.finished) return;
    this.surrendered = true;
    for (const e of this.enemies) {
      if (e.alive && !e.isBoss && !e.mem.noLeak) this._recordLeak(e, true);
    }
    for (const p of this._pending) {
      if (p.tag === 'boss') continue;
      const def = this.data.getEnemy(p.enemyKey);
      const overrides = this.enemyOverrides[def?.key ?? p.enemyKey] ?? this.enemyOverrides[p.enemyKey];
      const owner = p.ownerPlayerId ?? this._ownerForTile(p.pos ?? this._routeFor(p.routeIndex, p.route)?.start);
      const pp = this._pp(owner);
      if (!p.precounted && p.inTotal) { this.total++; if (pp) pp.total++; }
      this._recordLeak({ ownerId: owner, defId: p.enemyKey, mods: p.mods, lpr: overrides?.stats?.lpr ?? def?.lpr ?? 1,
        sourcePlayerId: p.sourcePlayerId, tag: p.tag, counted: p.counted, inTotal: p.inTotal, isBoss: false }, true);
      // Kept distinct for 联防: a queued enemy never entered the first field.
      if (pp?.leaked.length) pp.leaked.at(-1).spawned = false;
    }
    this._pending = [];
    this._finish('forced');
  }

  /**
   * @param {string} reason
   * @this {Battle}
   */
  _finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.reason = reason;
    this._endReq = null;
    const res = this._buildResult();
    this._result = res;
    this.emit('battleEnd', { result: res });
    // re-sync fields that battleEnd handlers may have changed (layer gains / coins live in perPlayer objects)
    for (const pid of Object.keys(res.perPlayer)) {
      const pp = res.perPlayer[pid];
      pp.perfect = !this.surrendered && !pp.leaked.some((l) => l.counted !== false);
    }
    this.projectiles.clear();
  }

  /**
   * @returns {BattleResult}
   * @this {Battle}
   */
  _buildResult() {
    /** @type {Record<string, PlayerResult>} */
    const perPlayer = {};
    // the battle's season (Battle `season`, from the match / spec): the browser's sim data has no config file
    const keepRedeploy = seasonFeature(this.season, 'uniteKeepsRedeploy');
    for (const ps of /** @type {BattlePlayer[]} */ (this.players)) {
      const pp = /** @type {PlayerResult} */ (this._perPlayer[ps.playerId]);
      pp.perfect = !this.surrendered && !pp.leaked.some((l) => l.counted !== false);
      // the HUD capsule's numerator of this field (DESIGN §14): this player's own scheduled enemies resolved — knocked
      // down or leaked (`counted` keeps the LP / 完美作战 reading, runtime splits and summons included — a 联防 field
      // tags its runtime spawns `uniteRuntime`, spawns.js, which only its billing reads)
      pp.resolved = Math.min(pp.total, pp.killedInTotal + pp.leakedInTotal);
      // the operators and the board's summon pieces (a board uid): 联防 carries an operator's HP ratio and SP, a summon's
      // SP only (match/unite.js). `sp` is the official 技力 — stored charges included (PRTS 技能 "可充能X次…当前技力上限等于该
      // 技能技力需求的X倍"); a running skill spent its SP at activation, so it reports what was left (0 for one charge).
      // `skillActive` is reported, never carried.
      // (a reserve operator — a 整备区 piece content may field, players.js createReserveAlly — only once fielded)
      // A knocked-out operator also reports the rest of its redeploy timer (`respawnLeft`, 0 once only DP or its tile holds
      // it) in a season whose 联防 inherits it (shared/seasons.js uniteKeepsRedeploy; the 盟约 result has no such field)
      const units = ps.units.filter((u) => !(u.reserve && !(u.deploySeq > 0)));
      pp.unitsEnd = units.filter((u) => u.kind === 'op' || (u.kind === 'token' && u.uid != null)).map((u) => {
        const e = /** @type {UnitEnd} */ ({
          uid: u.uid, id: u.id, defId: u.defId,
          hpPct: u.alive ? Math.max(0, Math.min(1, u.hp / u.s.maxHp)) : 0,
          sp: u.skill && !u.skill.noSkill ? Math.round(u.skill.spTotal * 100) / 100 : 0,
          skillActive: !!(u.skill && u.skill.active && u.skill.kind !== 'passive'),
          alive: !!u.alive,
        });
        if (keepRedeploy && u.kind === 'op' && !u.alive && this.isDown(u)) e.respawnLeft = Math.round(Math.max(0, u.respawnAt - this.time) * 100) / 100;
        return e;
      });
      // `boss` / `assist` / `ownerUid` feed the settlement's per-operator charts (server/match/unitTally.js): a unit the
      // battle created (no board uid) names the nearest summoner up its chain that has one, so it counts for that operator
      pp.unitStats = units.map((u) => {
        const e = /** @type {UnitStat} */ ({
          id: u.id, uid: u.uid, defId: u.defId, name: u.name, kind: u.kind,
          dmg: Math.round(u.stats.dmg), kills: u.stats.kills, heal: Math.round(u.stats.heal), taken: Math.round(u.stats.taken), attacks: u.stats.attacks,
        });
        if (u.stats.dmg > 0) e.byType = u.stats.byType.map(Math.round);
        if (u.stats.boss > 0) e.boss = Math.round(u.stats.boss);
        if (u.stats.assist) e.assist = { ...u.stats.assist };
        let o = u.ownerUnit;
        for (let i = 0; o && o.uid == null && i < 8; i++) o = o.ownerUnit;
        if (o && o.uid != null && o !== u) e.ownerUid = o.uid;
        return e;
      });
      perPlayer[ps.playerId] = pp;
    }
    const res = /** @type {BattleResult} */ ({ time: Math.round(this.time * 1000) / 1000, reason: this.reason, perPlayer, killed: this.killed, total: this.total, resolved: this.resolved, errors: this.errorCount });
    if (this.unspawned && this.unspawned.length) res.unspawned = this.unspawned;
    if (this.sharedBoss) res.bossHpLeft = Math.max(0, this.sharedBoss.hp);
    return res;
  }

  /**
   * BattleResult (valid once finished; a provisional result before).
   * @returns {BattleResult}
   * @this {Battle}
   */
  result() {
    if (this._result) return this._result;
    return this._buildResult();
  }
}
