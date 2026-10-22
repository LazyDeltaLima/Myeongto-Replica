// server/sim/battle/lifecycle.js — Battle methods: lifecycle: start (the battle-start deployment: by column, operators
// then summons, one piece every `prebuiltInterval`; then the wave clock: 联防 forced exits, `battleStart`), step (the tick order of the Battle.js header), the end checks, timeout
// / forced / cleared finishes and the BattleResult.
// Installed on Battle.prototype by server/sim/Battle.js (a method container: never instantiated; `this` is the battle).

import { BLOCK_SKILL_TICK, FORCED_EXIT, MAX_BATTLE_TIME } from '../constants.js';
import { updateAlly, updateEnemy } from '../ai.js';

export class BattleLifecycle {
  start() {
    if (this.started) return;
    this.started = true;
    this._safe(() => this._spawnStageDevices(), 'stageDevices');
    // PRTS 卫戍协议/帮助 §作战阶段: "按从上到下>从左到右的顺序部署。优先部署干员，随后为召唤物（如果有）", noted "自卫戍协议：
    // 盟约 下半（2026/3/14）起，部署顺序由“从左到右>从下到上”更改为“从上到下>从左到右”" — a scanning order: down each column
    // (top first), the columns from left to right; act 1's along each row, the rows from the bottom. It is the order PRTS
    // gives the 阿戈尔 devour ("从最先部署（更靠左和靠上的）的【阿戈尔】干员开始", content/bonds/core.js egirOrder) and the one
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
    const lists = this.players.map((ps) => ps.units.filter((u) => u.kind === 'op' || u.kind === 'token').slice().sort((a, b) =>
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
    for (const u of this.allyUnits) {
      if (u.kind !== 'op' || u.alive || u.removed || u.removeReason !== FORCED_EXIT) continue;
      u.respawnAt = u.deathAt + Math.max(0, u.base.respawnTime * u.persist.redeployMul * u.s.redeployMul);
    }
  }

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
      this._phase('buffs', () => this._tickBuffs(dt));
      this._phase('enemies', () => {
        // enemies spawned by hooks during this loop start moving next tick (a leak hook that spawns an enemy which
        // leaks at once would otherwise loop forever inside a single tick)
        const list = this.enemies;
        for (let i = 0, n = list.length; i < n && !this._endReq; i++) {
          const e = list[i];
          if (!e.alive) continue;
          try { updateEnemy(this, e, dt); } catch (err) { this._internalError('updateEnemy', err); }
          this._clampPos(e);
        }
      });
      this._compactEnemies();
      this._phase('enemyIndex', () => this._buildEnemyIndex());
      this._phase('allies', () => {
        const list = this.allyUnits;
        for (let i = 0; i < list.length && !this._endReq; i++) {
          const u = list[i];
          if (!u.alive || !u.deployed) continue;
          try {
            if (u.skill) u.skill.tick(dt);
            if (u.alive && u.kind !== 'device') updateAlly(this, u, dt);
          } catch (err) { this._internalError('updateAlly', err); }
        }
      });
      // the automatic skill operations, one pass every AUTO_TRIGGER_INTERVAL s after the allies' own tick (skills.js
      // autoTrigger; a cast there acts from the next tick, as a tick-rule cast did)
      if (this.tickCount % this._autoTriggerTicks === 0) this._phase('autoTrigger', () => this._autoTriggerPass());
      this._phase('projectiles', () => this.projectiles.update(dt));
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
   * One pass of the automatic skill operations (client code `AutoChessBattleTrigger._TryTriggerAvailableSkills`, every
   * 0.2 s: `AutoTrigger` → `WaitForFixedSeconds(AUTO_TRIGGER_INTERVAL)`; maintainer decision 2026-10-11): over the
   * characters in deployment order, one whose block runs counts it down and is skipped; the first whose MANUAL skill
   * casts (SkillRuntime.autoTrigger) is blocked BLOCK_SKILL_TICK passes and the pass ends there — one automatic cast per
   * pass in the whole battle. [ASSUMED] one pass for every player's units of the field (the client runs one trigger per
   * battle) and the order of `allyUnits`.
   */
  _autoTriggerPass() {
    const list = this.allyUnits;
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

  /** Last-resort finish when building the normal result threw (never throws itself). */
  _hardFinish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.reason = reason === 'timeout' ? 'timeout' : 'forced';
    this._endReq = null;
    try { this._result = this._buildResult(); } catch { this._result = { time: this.time, reason: this.reason, perPlayer: {}, killed: this.killed, total: this.total, resolved: this.resolved, errors: this.errorCount }; }
    this.projectiles.clear();
  }

  /** Run until finished or `maxSeconds` of game time elapsed. Returns the result when finished. */
  runToEnd(maxSeconds = MAX_BATTLE_TIME) {
    const limit = this.time + maxSeconds;
    while (!this.finished && this.time < limit) this.step();
    return this.finished ? this.result() : null;
  }

  _phase(name, fn) {
    if (this.finished || this._endReq) return;
    try { fn(); } catch (e) { this._internalError(name, e); }
  }

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

  _hasPendingEnemySchedules() {
    for (const s of this._sched) if (!s.cancelled && s.holdsBattle) return true;
    return false;
  }

  _timeout() {
    // Remaining non-boss enemies on the field count as leaked (DESIGN §5.5). Spawns that never happened before the
    // limit are dropped: they are removed from `total` and reported in `result().unspawned` (not leaks). A content-made
    // neutral (`mem.noLeak`: 隐德来希's 心烛, which follows its original) is never a leak — it is in no spawn schedule, so
    // a client result listing it would be rejected (fields.js validateClientResult 'leak key').
    for (const e of this.enemies) {
      if (!e.alive || e.isBoss || e.mem.noLeak) continue;
      this._recordLeak(e, true);
    }
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

  forceEnd(reason = 'forced') {
    if (this.finished) return;
    if (this._stepping) { if (!this._endReq) this._endReq = reason; return; } // finalised when step() unwinds
    this._endReq = null;
    if (!this.started) this.start();
    if (this.finished) return;
    if (reason === 'timeout') this._timeout();
    else this._finish('forced');
  }

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
      pp.perfect = !pp.leaked.some((l) => l.counted !== false);
    }
    this.projectiles.clear();
  }

  _buildResult() {
    const perPlayer = {};
    for (const ps of this.players) {
      const pp = this._perPlayer[ps.playerId];
      pp.perfect = !pp.leaked.some((l) => l.counted !== false);
      // the HUD capsule's numerator of this field (DESIGN §14): this player's own scheduled enemies resolved — knocked
      // down or leaked (`counted` keeps the LP / 完美作战 reading, runtime splits and summons included — a 联防 field
      // tags its runtime spawns `uniteRuntime`, spawns.js, which only its billing reads)
      pp.resolved = Math.min(pp.total, pp.killedInTotal + pp.leakedInTotal);
      // the operators and the board's summon pieces (a board uid): 联防 carries an operator's HP ratio and SP, a summon's
      // SP only (match/unite.js). `sp` is the official 技力 — stored charges included (PRTS 技能 "可充能X次…当前技力上限等于该
      // 技能技力需求的X倍"); a running skill spent its SP at activation, so it reports what was left (0 for one charge).
      // `skillActive` is reported, never carried.
      pp.unitsEnd = ps.units.filter((u) => u.kind === 'op' || (u.kind === 'token' && u.uid != null)).map((u) => ({
        uid: u.uid, id: u.id, defId: u.defId,
        hpPct: u.alive ? Math.max(0, Math.min(1, u.hp / u.s.maxHp)) : 0,
        sp: u.skill && !u.skill.noSkill ? Math.round(u.skill.spTotal * 100) / 100 : 0,
        skillActive: !!(u.skill && u.skill.active && u.skill.kind !== 'passive'),
        alive: !!u.alive,
      }));
      // `boss` / `assist` / `ownerUid` feed the settlement's per-operator charts (server/match/unitTally.js): a unit the
      // battle created (no board uid) names the nearest summoner up its chain that has one, so it counts for that operator
      pp.unitStats = ps.units.map((u) => {
        const e = {
          id: u.id, uid: u.uid, defId: u.defId, name: u.name, kind: u.kind,
          dmg: Math.round(u.stats.dmg), kills: u.stats.kills, heal: Math.round(u.stats.heal), taken: Math.round(u.stats.taken), attacks: u.stats.attacks,
        };
        if (u.stats.boss > 0) e.boss = Math.round(u.stats.boss);
        if (u.stats.assist) e.assist = { ...u.stats.assist };
        let o = u.ownerUnit;
        for (let i = 0; o && o.uid == null && i < 8; i++) o = o.ownerUnit;
        if (o && o.uid != null && o !== u) e.ownerUid = o.uid;
        return e;
      });
      perPlayer[ps.playerId] = pp;
    }
    const res = { time: Math.round(this.time * 1000) / 1000, reason: this.reason, perPlayer, killed: this.killed, total: this.total, resolved: this.resolved, errors: this.errorCount };
    if (this.unspawned && this.unspawned.length) res.unspawned = this.unspawned;
    if (this.sharedBoss) res.bossHpLeft = Math.max(0, this.sharedBoss.hp);
    return res;
  }

  /** BattleResult (valid once finished; a provisional result before). */
  result() {
    if (this._result) return this._result;
    return this._buildResult();
  }
}
