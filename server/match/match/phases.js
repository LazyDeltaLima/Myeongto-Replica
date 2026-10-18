// server/match/match/phases.js — Match methods: the round flow up to the prep — INFO_CHECK (with its reroll vote), the
// strategy draft
// (BAND_DRAFT: one countdown of BAND_TURN_SECONDS per turn, 队友已选, the highlighted strategy on a timeout, skips, then
// the 编队确认 window of DRAFT_CONFIRM_SECONDS, switched off since 2026-10-13),
// BATTLE_CHECK and ROUND_START (the round's enemies — a normal wave or the boss pairing — planned before the players'
// round start).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, ERR } from '../../../shared/constants.js';
import { buildNormalWave, buildBossWave } from '../waves.js';
import { pairPlayers } from '../finalAssault.js';
import { botPickBand } from '../bot.js';
import { OK, fail, DELAYS, BAND_TURN_SECONDS, INFO_CHECK_SECONDS, DRAFT_CONFIRM_SECONDS } from './common.js';

/** The briefing's 重新抽取 is refused this long after INFO_CHECK starts (ms; MatchPhases.voteReroll). */
export const INFO_REROLL_MIN_MS = 1000;

export class MatchPhases {
  enterInfoCheck() {
    this.phase = PHASE.INFO_CHECK;
    this.infoAt = this.sched.now();
    /** the seats voting 重新抽取, in the order they voted (a cancel drops one): [0] is the proposer m.public names */
    this.infoRerollers = [];
    for (const ps of this.order) if (ps.botControlled) ps.infoReady = true;
    // solo: no time limit (the player confirms); co-op: INFO_CHECK_SECONDS (45 s, the remake's; the official guard is
    // 25 s) — a seat that has not voted then counts as ready (maybeEndInfo)
    this.setDeadline(this.soloUntimed ? 0 : INFO_CHECK_SECONDS, () => this.maybeEndInfo(true));
    this.markPublic();
    for (const ps of this.order) this.markPrivate(ps);
    this.flush(true);
    this.maybeEndInfo();
  }

  /**
   * The briefing's vote (feat, maintainer decision 2026-10-09 — the official briefing has 准备就绪 only): two separate
   * votes (maintainer decision 2026-10-13; before, a seat voted one or the other and the larger count won). Every human
   * seat still in the match and not under AI control (an AI seat, or a seat under AI 托管, is ready at once) may press
   * 准备就绪 (infoReady, final) and, independently, 重新抽取 (infoReroll, can be taken back while the vote is open —
   * g.infoReroll { cancel }, maintainer decision 2026-10-12). A unanimous 重新抽取 ends this match for a new one with a
   * new seed (_endInfo('reroll'): the lobby starts it at once, so the boss, the hidden boss, the battlefield, the 特训敌人
   * and the banned bonds are all drawn again); otherwise the strategy draft starts once every seat is ready, or when the
   * co-op INFO_CHECK_SECONDS run out (`timeout`). A single human decides alone (solo, or a 同盟 room with AI teammates
   * only). Spectators hold no seat.
   */
  maybeEndInfo(timeout = false) {
    if (this.phase !== PHASE.INFO_CHECK || this.ended || this.infoOutcome) return;
    const voters = this.order.filter((p) => !p.isBot && !p.left && !p.botControlled);
    if (voters.length && voters.every((p) => p.infoReroll)) {
      this.setDeadline(0);
      this.infoOutcome = 'reroll';
      this.markPublic();
      this.later(0, () => this._endInfo());
      return;
    }
    if (!timeout && !voters.every((p) => p.infoReady)) return;
    this.setDeadline(0);
    this.later(0, () => { if (this.phase === PHASE.INFO_CHECK && !this.ended) this.enterBandDraft(); });
  }

  /**
   * g.infoReroll { cancel? }: the seat's 重新抽取 vote (maybeEndInfo), or with `cancel` its withdrawal (maintainer
   * decision 2026-10-12); a seat that is already ready may still vote (maintainer decision 2026-10-13). The vote is refused within INFO_REROLL_MIN_MS of the briefing's start,
   * so one held button cannot spin up matches back to back. infoRerollers keeps the voters in order: the first one still
   * voting is the proposer the briefing names (m.public.rerollBy). A 休闲 convenience (shared/ruleset.js infoReroll,
   * maintainer decision 2026-10-15): the classic ruleset refuses the vote (BAD_TARGET; its briefing shows no button).
   */
  voteReroll(ps, cancel = false) {
    if (!this.ruleset.options.infoReroll) return fail(ERR.BAD_TARGET, 'the ruleset has no reroll vote');
    if (this.phase !== PHASE.INFO_CHECK || this.ended || this.infoOutcome) return fail(ERR.WRONG_PHASE);
    if (!Array.isArray(this.infoRerollers)) this.infoRerollers = [];
    if (cancel) {
      if (!ps.infoReroll) return OK;
      ps.infoReroll = false;
      this.infoRerollers = this.infoRerollers.filter((id) => id !== ps.playerId);
      this.markPublic();
      return OK;
    }
    if (ps.infoReroll) return OK;
    if (this.sched.now() - (this.infoAt ?? 0) < INFO_REROLL_MIN_MS) return fail(ERR.RATE, 'the briefing just started');
    ps.infoReroll = true;
    if (!this.infoRerollers.includes(ps.playerId)) this.infoRerollers.push(ps.playerId);
    this.markPublic();
    this.maybeEndInfo();
    return OK;
  }

  /** The first seat still voting 重新抽取 (m.public.rerollBy), or null. */
  rerollProposer() {
    for (const id of this.infoRerollers || []) {
      const p = this.players.get(id);
      if (p && p.infoReroll && !p.left) return id;
    }
    return null;
  }

  /**
   * The vote ended the match before its first round (this.infoOutcome 'reroll'): no m.result — the last
   * m.public carries `infoOutcome`, then onEnd({ reason }) hands the room back to the lobby, which starts the new
   * match for a reroll (server/lobby.js onMatchEnd). Nothing was played: no [stats] line, no replay.
   */
  _endInfo() {
    if (this.ended || this.disposed || this.phase !== PHASE.INFO_CHECK) return;
    this.ended = true;
    this.cancel(this._phaseTimer);
    for (const h of this._timers) { try { this.sched.clearTimeout(h); } catch { /* ignore */ } }
    this._timers.clear();
    this.deadline = 0;
    this.markPublic();
    try { this.flush(true); } catch (e) { this.reportError('flush', e); }
    const summary = { reason: this.infoOutcome, modeId: this.modeId, difficulty: this.difficulty, stageId: this.stageId, bossId: this.bossId, players: [] };
    try { this.onEndFn(summary); } catch (e) { this.reportError('onEnd', e); }
  }

  /**
   * The strategy draft (user playtest #4 item 4): ONE countdown — every turn has the same clock, BAND_TURN_SECONDS, and
   * m.public.deadline is the current turn's end (= draft.turnDeadline; the step header and the turn indicator show the
   * same number). No separate step cap: the turns bound the step (≤ (seats + skips) × turn). AI seats pick at once. A
   * turn that runs out takes the strategy the player has highlighted (g.bandFocus) while it is free, else the default
   * (timeoutBand). The draft ends with the last pick: the 编队确认 window after it (enterDraftConfirm) is switched off
   * (maintainer decision 2026-10-13, startDraftTurn). Solo, and any single-human match (soloUntimed): untimed. Solo also keeps seat order and has no skip.
   */
  enterBandDraft() {
    if (this.phase !== PHASE.INFO_CHECK || this.ended || this.infoOutcome) return;
    this.phase = PHASE.BAND_DRAFT;
    let order = this.order.map((p) => p.playerId);
    if (!this.isSolo) this.rngDraft.shuffle(order);
    order = this.humansFirst(order);
    const skips = this.isSolo ? 0 : this.gd.bandDraft.skipsPerPlayer;
    const untimed = this.soloUntimed;
    this.draft = {
      order, idx: 0, picks: {}, skipsLeft: Object.fromEntries(order.map((pid) => [pid, skips])), untimed, turnDeadline: 0,
      /** playerId → the strategy highlighted in the draft screen (g.bandFocus) */
      focus: new Map(),
    };
    this.setDeadline(0);
    this.startDraftTurn();
    this.markPublic();
  }

  /**
   * The co-op room option 「AI 队友最后选择」 (this.aiPicksLast, GitHub #338): every human seat before every AI seat, each
   * group in the order the draft drew (a stable partition applied AFTER the shuffle — no extra random draw: the order
   * with the option off is unchanged, and with it on every random stream stands where it would without it; only the
   * picks made in the new order can differ). A human is any seat that is not an AI seat (room.addBot): under AI 托管,
   * disconnected or departed it still counts as a human. Used by the strategy draft and the 机变 draft
   * (MatchSpDraft.enterSpDraft).
   * @param {string[]} order playerIds in drawn order
   * @returns {string[]}
   */
  humansFirst(order) {
    if (!this.aiPicksLast) return order;
    const bot = (pid) => !!this.players.get(pid)?.isBot;
    return [...order.filter((pid) => !bot(pid)), ...order.filter(bot)];
  }

  draftTurn() {
    const d = this.draft;
    if (!d) return null;
    return d.order[d.idx] ?? null;
  }

  /** Real ms of one strategy-draft turn (BAND_TURN_SECONDS × timerScale). */
  bandTurnMs() { return this.scaled(BAND_TURN_SECONDS * 1000); }

  startDraftTurn() {
    const d = this.draft;
    this.cancel(this._turnTimer);
    this._turnTimer = null;
    while (d.idx < d.order.length && d.picks[d.order[d.idx]]) d.idx++;
    if (d.idx >= d.order.length) {
      d.turnDeadline = 0;
      this.deadline = 0;
      // 编队确认 is switched off (maintainer decision 2026-10-13): the draft ends with the last pick. Kept for a return —
      // put these two lines back in place of the third:
      // if (d.untimed || d.confirm) this.later(0, () => this.finishBandDraft(false));
      // else this.enterDraftConfirm();
      this.later(0, () => this.finishBandDraft(false));
      return;
    }
    const token = ++this._turnToken;
    if (!d.untimed) {
      const ms = this.bandTurnMs();
      d.turnDeadline = this.sched.now() + ms;
      // the step's countdown IS the turn's (one number everywhere)
      this.deadline = d.turnDeadline;
      this._turnTimer = this.later(ms, () => {
        if (this.phase !== PHASE.BAND_DRAFT || token !== this._turnToken) return;
        const pid = this.draftTurn();
        if (pid) this._applyBand(this.players.get(pid), this.timeoutBand(pid));
      });
    } else {
      d.turnDeadline = 0;
      this.deadline = 0;
    }
    const cur = this.players.get(this.draftTurn());
    if (cur && cur.botControlled) this.scheduleBandBot();
    this.markPublic();
  }

  /** An AI seat's (or an AI 托管 seat's) turn: it picks at once (user playtest #4 item 4 — nobody waits on the AI). */
  scheduleBandBot() {
    const token = this._turnToken;
    this.later(0, () => {
      if (this.phase !== PHASE.BAND_DRAFT || token !== this._turnToken) return;
      const ps = this.players.get(this.draftTurn());
      if (!ps || !ps.botControlled) return;
      // a strategy a teammate already took is not selectable (队友已选): the bot re-draws, else the first free one
      let id = botPickBand(this, ps);
      for (let k = 0; k < 8 && this.bandTaken(id, ps.playerId); k++) id = botPickBand(this, ps);
      if (this.bandTaken(id, ps.playerId)) id = this.gd.bandIds().find((b) => !this.bandTaken(b, ps.playerId)) || id;
      this._applyBand(ps, id, { dedupe: true });
    });
  }

  /**
   * Whether `bandId` was already picked by another player of this draft. Research 09 §5 / DESIGN §14 corrections:
   * the strategy draft marks a teammate's pick as 队友已选 and it cannot be chosen again (co-op). The automatic
   * assignments — a turn that runs out and a departing seat — obey the same rule: see timeoutBand / defaultBand.
   */
  bandTaken(bandId, playerId) {
    const picks = this.draft?.picks || {};
    for (const [pid, id] of Object.entries(picks)) if (pid !== playerId && id === bandId) return true;
    return false;
  }

  /**
   * The strategy an automatic assignment gives `playerId` (a departing seat; a timed-out turn without a usable
   * highlight, timeoutBand): the official default 「华法琳」 (bandDraft.timeoutBandId) while no teammate holds it, else the
   * first strategy of the mode (sortId order, gd.bandIds) that nobody else picked — never a duplicate (队友已选; the
   * client shows the same choice: public/js/screens/bandDraft.js timeoutBand). Solo drafts have no teammates, so it is
   * always the default.
   * @param {string} playerId
   */
  defaultBand(playerId) {
    const def = this.gd.bandDraft.timeoutBandId;
    if (!this.bandTaken(def, playerId)) return def;
    return this.gd.bandIds().find((b) => !this.bandTaken(b, playerId)) || def;
  }

  /**
   * What a turn that runs out assigns (user playtest #4 item 4): the strategy the player has highlighted in the draft
   * screen (g.bandFocus — the detail pane's band, the one 确认选择 would take) while it is allowed and no teammate holds
   * it, else defaultBand.
   * @param {string} playerId
   */
  timeoutBand(playerId) {
    const f = this.draft && this.draft.focus instanceof Map ? this.draft.focus.get(playerId) : null;
    if (typeof f === 'string' && this.gd.bandAllowed(f) && !this.bandTaken(f, playerId)) return f;
    return this.defaultBand(playerId);
  }

  /**
   * g.bandFocus { bandId? }: the strategy the player highlights in the draft screen (any time before its pick; also
   * while waiting for its turn). A missing / null bandId clears it. Only a timed-out turn reads it (timeoutBand).
   */
  bandFocus(ps, bandId) {
    if (this.phase !== PHASE.BAND_DRAFT || !this.draft) return fail(ERR.WRONG_PHASE);
    const d = this.draft;
    if (d.picks[ps.playerId]) return fail(ERR.ALREADY);
    if (!(d.focus instanceof Map)) d.focus = new Map();
    if (bandId == null) { d.focus.delete(ps.playerId); return OK; }
    if (typeof bandId !== 'string' || !this.gd.bandAllowed(bandId)) return fail(ERR.BAD_TARGET);
    d.focus.set(ps.playerId, bandId);
    return OK;
  }

  pickBand(ps, bandId) {
    if (this.phase !== PHASE.BAND_DRAFT || !this.draft) return fail(ERR.WRONG_PHASE);
    if (this.draft.picks[ps.playerId]) return fail(ERR.ALREADY);
    if (this.draftTurn() !== ps.playerId) return fail(ERR.NOT_YOUR_TURN);
    if (typeof bandId !== 'string' || !this.gd.bandAllowed(bandId)) return fail(ERR.BAD_TARGET);
    if (this.bandTaken(bandId, ps.playerId)) return fail(ERR.BAD_TARGET, '队友已选'); // i18n-ignore: developer detail (players see ERR_TEXT)
    this._applyBand(ps, bandId);
    return OK;
  }

  _applyBand(ps, bandId, { dedupe = false } = {}) {
    const d = this.draft;
    if (!d || !ps || d.picks[ps.playerId]) return;
    let id = this.gd.bandAllowed(bandId) ? bandId : this.defaultBand(ps.playerId);
    if (dedupe && this.bandTaken(id, ps.playerId)) id = this.gd.bandIds().find((b) => !this.bandTaken(b, ps.playerId)) || id;
    d.picks[ps.playerId] = id;
    ps.bandId = id;
    ps.lp = this.gd.startLp(id);
    this.markPrivate(ps);
    this.markPublic();
    this.startDraftTurn();
  }

  skipBand(ps) {
    if (this.phase !== PHASE.BAND_DRAFT || !this.draft) return fail(ERR.WRONG_PHASE);
    const d = this.draft;
    if (this.isSolo) return fail(ERR.WRONG_PHASE, 'no skip in solo');
    if (d.picks[ps.playerId]) return fail(ERR.ALREADY);
    if (this.draftTurn() !== ps.playerId) return fail(ERR.NOT_YOUR_TURN);
    if (!(d.skipsLeft[ps.playerId] > 0)) return fail(ERR.ALREADY, 'no skip left');
    if (d.order.length - d.idx <= 1) return fail(ERR.BAD_TARGET, 'nobody to pass to');
    d.skipsLeft[ps.playerId]--;
    d.order.splice(d.idx, 1);
    // the skipper goes to the end; with 「AI 队友最后选择」 to the end of the humans still to pick — behind them, ahead of
    // the AI seats — and to the very end only when no other human is left to pass to [ASSUMED: the option's intent,
    // humans before AI, kept through a skip; no source, a remake option]
    let at = d.order.length;
    if (this.aiPicksLast) {
      for (let j = d.order.length - 1; j >= d.idx; j--) {
        if (!this.players.get(d.order[j])?.isBot) { at = j + 1; break; }
      }
    }
    d.order.splice(at, 0, ps.playerId);
    this.startDraftTurn();
    return OK;
  }

  /**
   * 编队确认 (feat, maintainer decision 2026-10-12; switched off 2026-10-13 — startDraftTurn no longer calls it): every seat has its strategy, and a timed draft stays up
   * DRAFT_CONFIRM_SECONDS more so the last picker can still change its 自选 picks (match.setDiy is accepted during
   * BAND_DRAFT; the client applies the strategy's linked 맹약 preset when the pick lands). It ends at its deadline, or as
   * soon as every awaited seat — a connected human not under AI control — has sent g.draftReady (maybeEndDraftConfirm).
   * m.public.deadline is its end; m.public.draft.confirm { deadline, ready, seconds }.
   */
  enterDraftConfirm() {
    const d = this.draft;
    if (this.phase !== PHASE.BAND_DRAFT || !d || d.confirm) return;
    const ms = this.scaled(DRAFT_CONFIRM_SECONDS * 1000);
    d.confirm = { deadline: this.sched.now() + ms, ready: new Set() };
    this.deadline = d.confirm.deadline;
    const token = ++this._turnToken;
    this._turnTimer = this.later(ms, () => {
      if (this.phase !== PHASE.BAND_DRAFT || token !== this._turnToken) return;
      this.finishBandDraft(true);
    });
    this.markPublic();
    this.maybeEndDraftConfirm();
  }

  /** The seats 编队确认 waits for: connected humans still in, not under AI control (AI 托管 / an AI seat). */
  draftConfirmAwaited() {
    return this.order.filter((p) => !p.botControlled && p.connected);
  }

  /** g.draftReady: the seat is done with 编队确认. */
  draftReady(ps) {
    const d = this.draft;
    if (this.phase !== PHASE.BAND_DRAFT || !d || !d.confirm) return fail(ERR.WRONG_PHASE);
    if (d.confirm.ready.has(ps.playerId)) return OK;
    d.confirm.ready.add(ps.playerId);
    this.markPublic();
    this.maybeEndDraftConfirm();
    return OK;
  }

  /** Ends 编队确认 once every awaited seat is ready (also re-checked when a seat leaves, drops or goes AI 托管). */
  maybeEndDraftConfirm() {
    const d = this.draft;
    if (this.phase !== PHASE.BAND_DRAFT || !d || !d.confirm || this.ended) return;
    if (!this.draftConfirmAwaited().every((p) => d.confirm.ready.has(p.playerId))) return;
    const token = ++this._turnToken;
    this.later(0, () => { if (token === this._turnToken) this.finishBandDraft(false); });
  }

  finishBandDraft(timeout) {
    if (this.phase !== PHASE.BAND_DRAFT) return;
    ++this._turnToken;
    this.cancel(this._turnTimer);
    this._turnTimer = null;
    for (const ps of this.order) {
      if (!this.draft.picks[ps.playerId]) {
        // one after another in seat order, so each default sees the ones assigned before it (no duplicates)
        const id = this.defaultBand(ps.playerId);
        this.draft.picks[ps.playerId] = id;
        ps.bandId = id;
        ps.lp = this.gd.startLp(id);
      }
      this.markPrivate(ps);
    }
    void timeout;
    this.enterBattleCheck();
  }

  enterBattleCheck() {
    this.phase = PHASE.BATTLE_CHECK;
    // a custom 「共享」 match: one team LP from round 1 (the starting LPs added up), as the Final Assault's
    if (this.gd.lpShared) {
      this._mergeTeamLp();
      for (const ps of this.alivePlayers()) ps.lpStart = ps.lp;
    }
    this.setDeadline(this.gd.timer('battleCheck'), () => this.startRound(1), { silent: this.soloUntimed });
    this.markPublic();
  }

  startRound(r) {
    this.phase = PHASE.ROUND_START;
    this.round = r;
    this.fields = [];
    this.watchers.clear();
    this.unitePlan = null;
    this.uniteResultView = null;
    this.roundLossesView = null;
    this.sp = null;
    this.wave = null;
    this.bossWaves = null;
    const alive = this.alivePlayers();
    // the round's enemies (shared composition, generated now so the prep preview is exact). Planned BEFORE the players'
    // round start: its recompute() checks the board on the field the player deploys on this round (deployFieldOf reads
    // the boss pairing), so R14 → R15 never re-checks a boss-field board against the normal field (user playtest #5
    // item 7). rngWaves is used only here, so the order leaves every random stream unchanged.
    const isBoss = r === this.gd.bossRound || r === this.gd.hiddenRound;
    if (isBoss) {
      this._planBossWaves();
    } else {
      this.wave = buildNormalWave(this.gd, this.rngWaves, this.factions, r);
    }
    for (const ps of alive) ps.startRound(r);
    for (const ps of alive) this.dispatch(ps, 'onRoundStart', { round: r });
    // an eliminated player's pending 信标 gift still goes to its teammate (effects flagged afterElimination; GitHub #86)
    for (const ps of this.order) {
      if (ps.alive) continue;
      try { this.dispatcher.dispatchEliminated(ps, 'onRoundStart', { round: r }); } catch (e) { this.reportError('dispatch onRoundStart (eliminated)', e); }
    }
    for (const ps of alive) ps.recompute();
    this.setDeadline(DELAYS.ROUND_START / 1000, () => this.afterRoundStart(), { silent: this.soloUntimed });
    this.markPublic();
    // eliminated humans and spectator seats scout the board of the player they follow through the round's prep, not
    // their own empty board (community report of 2026-10-06, item 56; MatchWatch._followScout)
    for (const ps of this._viewers()) this._followScout(ps);
  }

  /** The boss round's fields (seat pairs of the alive players) and their templates, generated for the prep preview. */
  _planBossWaves() {
    const r = this.round;
    const bossId = r === this.gd.hiddenRound && r !== this.gd.bossRound ? this.hiddenBossId : this.bossId;
    this.bossWaves = pairPlayers(this.alivePlayers()).map((g) => ({
      players: g.map((p) => p.playerId),
      wave: buildBossWave(this.gd, this.rngWaves, this.factions, r, { bossId, solo: this.isSolo || g.length === 1 }),
    }));
  }

  afterRoundStart() {
    if (this.gd.spRounds().includes(this.round)) this.enterSpDraft();
    else this.enterPrep();
  }
}
