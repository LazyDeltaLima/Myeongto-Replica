/** @import { Match } from '../Match.js' */
import { PHASE, ERR } from '../../../shared/constants.js';
import { OK, fail } from './common.js';
import { syntheticResult } from '../fields.js';

export const SURRENDER_VOTE_MS = 30000;
export const SURRENDER_RETRY_MS = 60000;
/** @type {Set<string>} */
const PHASES = new Set([PHASE.COMBAT, PHASE.UNITE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]);
const leakLp = result => Object.values(result.perPlayer).reduce((n, p) => n + p.leaked.reduce((s, l) => s + (l.lpr ?? 1), 0), 0);

export class MatchSurrender {
  /** @this {Match} */
  surrenderToken(f) { return f.battleId || `${this.battlePrefix}.${this.round}.${this.phase}.${f.fieldId}`; }

  /** @this {Match} */
  surrenderVoters(f) {
    return f.players.map(id => this.players.get(id)).filter(p => p && !p.isBot && !p.left && !p.botControlled);
  }

  // Membership is fixed for an open vote. Disconnects/AI takeover cancel it, never manufacture consent.
  /** @this {Match} */
  reconcileSurrenderVotes() {
    for (const f of this.fields) {
      const v = f.surrenderVote;
      if (!v) continue;
      const voters = this.surrenderVoters(f);
      if (!PHASES.has(this.phase) || !f.live || f.done || f.surrendering || voters.length !== v.voters.length
        || voters.some(p => !p.connected || !v.voters.includes(p.playerId))) this._closeSurrenderVote(f);
    }
  }

  /** @this {Match} */
  _closeSurrenderVote(f) {
    if (!f.surrenderVote) return;
    this.cancel(f.surrenderVote.timer);
    f.surrenderVote = null;
    this.markPublic();
  }

  /** @this {Match} */
  voteSurrender(ps, { fieldId, battleId, op }) {
    if (!PHASES.has(this.phase) || this.ended || this.disposed || this.restartOutcome || this._finalEnding) return fail(ERR.WRONG_PHASE);
    const f = this.fields.find(x => x.fieldId === fieldId && this.surrenderToken(x) === battleId);
    if (!f || !f.live || f.done || f.surrendering || f.verifyJob || f.heldResult || (!f.cc && f.battle.finished)) return fail(ERR.WRONG_PHASE);
    const voters = this.surrenderVoters(f);
    if (!ps.connected || !voters.includes(ps)) return fail(ERR.BAD_TARGET);
    this.reconcileSurrenderVotes();
    const v = f.surrenderVote;
    if (op === 'propose') {
      if (v) return fail(ERR.WRONG_PHASE);
      if ((f.surrenderRetryAt || 0) > this.sched.now()) return fail(ERR.RATE);
      // AI seats have no vote. A single human still confirms in the UI, then ends this field directly.
      if (voters.length === 1) { this._surrenderField(f); return OK; }
      if (voters.some(p => !p.connected)) return fail(ERR.BAD_TARGET);
      const ms = this.scaled(SURRENDER_VOTE_MS);
      f.surrenderVote = { by: ps.playerId, yes: new Set([ps.playerId]), voters: voters.map(p => p.playerId),
        deadline: this.sched.now() + ms, ms,
        timer: this.later(ms, () => this._closeSurrenderVote(f)) };
      f.surrenderRetryAt = this.sched.now() + this.scaled(SURRENDER_RETRY_MS);
      this.markPublic();
      return OK;
    }
    if (!v || this.sched.now() >= v.deadline) { this._closeSurrenderVote(f); return fail(ERR.WRONG_PHASE); }
    if (op === 'cancel') {
      if (v.by !== ps.playerId) return fail(ERR.BAD_TARGET);
      this._closeSurrenderVote(f); return OK;
    }
    if (op === 'no') { this._closeSurrenderVote(f); return OK; }
    if (op !== 'yes') return fail(ERR.BAD_MSG);
    v.yes.add(ps.playerId);
    this.markPublic();
    if (v.voters.every(id => v.yes.has(id))) { this._closeSurrenderVote(f); this._surrenderField(f); }
    return OK;
  }

  /** @this {Match} */
  _surrenderField(f) {
    this._resume();
    this._closeSurrenderVote(f);
    f.surrendering = true;
    f.surrendered = true;
    this.markPublic();
    if (!f.cc) {
      const before = leakLp(f.battle.result());
      f.battle.surrender();
      if (f.kind === 'boss' || f.kind === 'hidden') this._teamLpLoss(Math.max(0, leakLp(f.battle.result()) - before));
      // FieldRunner emits the final snapshot and completes its ordinary settlement on the next tick.
      return;
    }
    const elapsed = this._fieldElapsed(f);
    const wasLiveServer = f.mode === 'server' && (f.kind === 'boss' || f.kind === 'hidden');
    this._clearFieldTimers(f);
    f.mode = 'surrender'; // reject late reports and prevent a disconnect takeover
    for (const pid of this._humansShowing(f)) this.sendTo(pid, { t: 'b.end', battleId: f.battleId, fieldId: f.fieldId, reason: 'surrender' });
    // Reconstruct the authoritative state at the moment of consent, preserving earned kills, funds and layers.
    // Completed headless jobs contain the future, so those must also be replayed to this cutoff.
    const battle = wasLiveServer ? f.battle : this._specBattle(f.spec);
    const finish = () => {
      if (f.done || this.disposed || this.ended || !this.fields.includes(f)) return;
      if (!battle.finished) battle.surrender();
      f.result = battle.result();
      f.resultSource = 'server';
      if (f.kind === 'boss' || f.kind === 'hidden') {
        const lost = leakLp(f.result);
        this._teamLpLoss(Math.max(0, lost - Math.max(f.lpAcked, f.lpCum)));
        if (!wasLiveServer) {
          for (const pid of f.players) f.result.perPlayer[pid].bossDamage = f.bossBy[pid] || 0;
        }
      }
      f.surrendering = false;
      this._fieldDone(f);
      this._checkFinalEnd();
    };
    const slice = () => {
      f.sliceTimer = null;
      if (f.done || this.disposed || this.ended || !this.fields.includes(f)) return;
      try {
        const until = performance.now() + (Number.isFinite(this.headlessSliceMs) ? this.headlessSliceMs : Infinity);
        while (!wasLiveServer && !battle.finished && battle.time < elapsed) {
          battle.step();
          if (performance.now() >= until) { f.sliceTimer = this.later(0, slice); return; }
        }
        finish();
      } catch (e) {
        this.reportError('surrender replay', e);
        f.result = syntheticResult(f.players, { time: elapsed });
        f.resultSource = 'server';
        f.surrendering = false;
        this._fieldDone(f); // an engine error never strands the match or charges invented leaks
        this._checkFinalEnd();
      }
    };
    if (wasLiveServer) slice();
    else f.sliceTimer = this.later(0, slice);
  }
}
