// server/match/match/restart.js — Match methods: the in-match 重新开始 vote (feat, maintainer decision 2026-10-31; the
// official mode has none): a seat proposes, every voter must agree within RESTART_VOTE_MS, and the match ends for a new
// one that starts at the briefing with a new seed — the lobby path of the briefing's 重新抽取 (phases.js _endInfo,
// server/lobby.js onMatchEnd).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, ERR } from '../../../shared/constants.js';
import { msg } from '../../../shared/i18n.js';
import { nameParam } from '../../../shared/botNames.js';
import { OK, fail } from './common.js';

/** How long a restart vote stays open (ms of match time). */
export const RESTART_VOTE_MS = 30000;
/** After a vote of theirs fails, a seat waits this long before it proposes again (ms; one held button, no spam). */
export const RESTART_RETRY_MS = 60000;

/** The phases a restart can be proposed in: from the first round on — never the briefing (重新抽取) or the draft. */
const RESTART_PHASES = new Set([PHASE.BATTLE_CHECK, PHASE.ROUND_START, PHASE.SP_DRAFT, PHASE.PREP, PHASE.COMBAT, PHASE.UNITE,
  PHASE.SETTLE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]);

export class MatchRestart {
  /**
   * The seats a restart needs (maintainer decisions 2026-10-31): every human still in the match and not under AI 托管 —
   * the eliminated ones too, since the whole room starts again. Spectators hold no seat; AI seats have no say.
   */
  restartVoters() {
    return this.order.filter((p) => !p.isBot && !p.left && !p.botControlled);
  }

  /**
   * g.restart { op }: 'propose' opens the vote (the proposer agrees), 'yes' / 'no' answer it, 'cancel' takes the
   * proposer's back. One 'no' ends the vote at once; so do the proposer leaving and the time running out. Every voter
   * agreeing ends the match (_endRestart) — at once when the proposer is the only voter (solo, or AI teammates only).
   * Any 规则 mode (maintainer decision 2026-10-31: a convenience, unlike the 休闲-only 重新抽取).
   */
  voteRestart(ps, op) {
    if (this.ended || this.restartOutcome) return fail(ERR.WRONG_PHASE);
    if (ps.isBot || ps.left || ps.botControlled) return fail(ERR.BAD_TARGET, 'not a voter');
    const v = this.restartVote;
    if (op === 'propose') {
      if (!RESTART_PHASES.has(this.phase)) return fail(ERR.WRONG_PHASE, 'restart opens from the first round');
      if (v) return fail(ERR.WRONG_PHASE, 'a restart vote is open');
      const until = this.restartRetryAt?.get(ps.playerId) ?? 0;
      if (this.sched.now() < until) return fail(ERR.RATE, 'restart proposed too recently');
      const ms = this.scaled(RESTART_VOTE_MS);
      this.restartVote = {
        by: ps.playerId, yes: new Set([ps.playerId]), deadline: this.sched.now() + ms, ms,
        timer: this.later(ms, () => this._closeRestart('timeout')),
      };
      this.markPublic();
      this.maybeEndRestart();
      return OK;
    }
    if (!v) return fail(ERR.WRONG_PHASE, 'no restart vote');
    if (op === 'cancel') {
      if (v.by !== ps.playerId) return fail(ERR.BAD_TARGET, 'only the proposer cancels');
      this._closeRestart('cancel', ps);
      return OK;
    }
    if (op === 'no') { this._closeRestart('no', ps); return OK; }
    v.yes.add(ps.playerId);
    this.markPublic();
    this.maybeEndRestart();
    return OK;
  }

  /**
   * Recount an open vote (a vote, a seat leaving or going under AI 托管): the proposer gone ends it; every voter agreeing
   * passes it.
   */
  maybeEndRestart() {
    const v = this.restartVote;
    if (!v || this.ended || this.restartOutcome) return;
    const voters = this.restartVoters();
    if (!voters.some((p) => p.playerId === v.by)) { this._closeRestart('gone'); return; }
    if (!voters.every((p) => v.yes.has(p.playerId))) return;
    this.cancel(v.timer);
    this.restartVote = null;
    this.restartOutcome = 'restart';
    this.markPublic();
    this.later(0, () => this._endRestart());
  }

  /** The vote failed: the proposer waits RESTART_RETRY_MS, every human hears why (m.toast). */
  _closeRestart(why, ps = null) {
    const v = this.restartVote;
    if (!v) return;
    this.cancel(v.timer);
    this.restartVote = null;
    if (!this.restartRetryAt) this.restartRetryAt = new Map();
    this.restartRetryAt.set(v.by, this.sched.now() + this.scaled(RESTART_RETRY_MS));
    const text = why === 'no' ? msg('{name}反对重新开始', { name: nameParam(ps.name) })
      : why === 'cancel' ? msg('{name}撤回了重新开始的提议', { name: nameParam(ps.name) })
      : msg('重新开始投票未通过');
    for (const p of this._viewers()) this.toast(p, why === 'no' ? 'warn' : 'info', text);
    this.markPublic();
  }

  /**
   * The vote passed: end the match without a settlement (no m.result) — the last m.public carries `restarted`, then
   * onEnd({ reason: 'restart' }) hands the room to the lobby, which starts the new match at once (server/lobby.js
   * onMatchEnd). The page records the match as 中途退出 (public/js/main.js, ui/stats.js recordQuit; maintainer decision
   * 2026-10-31). The teardown is finish()'s (settle.js).
   */
  _endRestart() {
    if (this.ended || this.disposed) return;
    this.ended = true;
    if (this.runner) { try { this.runner.stop(); } catch { /* ignore */ } this.runner = null; }
    this._stopClientCombat();
    this.cancel(this._phaseTimer);
    this.cancel(this._turnTimer);
    for (const h of this._timers) { try { this.sched.clearTimeout(h); } catch { /* ignore */ } }
    this._timers.clear();
    this.deadline = 0;
    for (const f of this.fields) f.live = false;
    this.markPublic();
    try { this.flush(true); } catch (e) { this.reportError('flush', e); }
    const summary = { reason: 'restart', modeId: this.modeId, difficulty: this.difficulty, stageId: this.stageId, bossId: this.bossId, round: this.round, players: [] };
    try { this.onEndFn(summary); } catch (e) { this.reportError('onEnd', e); }
  }
}
