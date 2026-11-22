// server/match/match/diyChoose.js — Match methods: 确定自选编队 (PHASE.DIY_CHOOSE), the third start step of 规程 (the
// official step list's CUSTOM_CHECK 「选择自编」, 30 s, between the strategy draft and 协议启动; the screen's header reads
// 「3/3 确定自选编队」). GameData.diyChoose says whether the season has it: 规程 by its tables, 盟约 too (a remake rule,
// maintainer decision 2026-11-19: tools/build-data.mjs extendDefaultSeasonDiy gives 盟约's tables 规程's twelve slots, the
// per-tier limit and this step), so every match of both enters it. A season without it keeps the picks as the match's.
//
// In such a season a seat's `diy` picks (room.diy) are its 自选编队 — up to six slots per tier — and the match fields
// none of them until this step: each human seat picks at most `perTier[tier]` of each tier (activity constData
// diyCharLimitForLevels { 5: 2, 6: 2 }: 「每次模拟开始时，可从中选择每等阶各2名，至多4名干员进入模拟」, the official lineup
// screen) and presses 准备就绪 (取消准备 unlocks the choice again). The step ends once every awaited seat — a connected
// human not under AI control — is ready, or when its time runs out; each seat then fields the slots it chose
// (PlayerState.setDiy) and gets their stock (initDiyStock; no randomness is drawn).
//
// [ASSUMED·서버·화면: the server decides these, and only official screens of a 4-player co-op start were seen] — nothing
// is chosen at the start (the official screen shows 0/2 before a pick), a seat that runs out of time or is under AI 托管
// / an AI seat fields what it has chosen (none: no 自选 operator), and a single human (solo, or a co-op room with AI
// teammates only) has the step too, untimed like the other start steps (infra.js soloUntimed).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

/** @import { Match } from '../Match.js' */
import { PHASE, ERR } from '../../../shared/constants.js';
import { diySlot } from '../../../shared/diy.js';
import { OK, fail } from './common.js';

const EMPTY = Object.freeze({});

export class MatchDiyChoose {
  /**
   * The constructor's part: in a season with the step, each seat's checked picks become its 自选编队 (`diyLineup`) and
   * it fields none of them yet (PlayerState.setDiy({}) — the match's own data, no stock). A season without the step
   * leaves every seat as it is.
   * @this {Match}
   */
  initDiyLineups() {
    if (!this.gd.diyChoose) return;
    for (const ps of this.order) {
      ps.diyLineup = ps.isBot ? EMPTY : ps.diy;
      /** @type {string[]} the lineup's slots chosen for this match (slot base ids, lineup order) */
      ps.diyChosen = [];
      ps.diyChooseReady = false;
      if (!ps.isBot && Object.keys(ps.diy).length) ps.setDiy({});
    }
  }

  /**
   * A new 自选编队 for this match (platform.js setDiy, during the briefing, the strategy draft and — until the seat readies
   * — this step: the preset box of the screen, maintainer decision 2026-11-13): re-checked like the seat's picks
   * (PlayerState.setDiy), kept as the lineup; a chosen slot stays chosen only while it holds the same operator.
   * @returns {boolean} false when the picks do not match the game data
   * @this {Match}
   */
  setDiyLineup(ps, picks) {
    const was = ps.diyLineup || EMPTY;
    if (!ps.setDiy(picks)) return false;
    ps.diyLineup = ps.diy;
    ps.setDiy({});
    const lineup = ps.diyLineup;
    ps.diyChosen = (ps.diyChosen || []).filter((id) => Object.hasOwn(lineup, id) && lineup[id].charId === was[id]?.charId);
    return true;
  }

  /** @this {Match} */
  enterDiyChoose() {
    if (this.phase !== PHASE.BAND_DRAFT || this.ended) return;
    this.phase = PHASE.DIY_CHOOSE;
    const dc = this.gd.diyChoose;
    for (const ps of this.order) if (ps.botControlled) ps.diyChooseReady = true;
    this._diyChooseToken = (this._diyChooseToken || 0) + 1;
    this.setDeadline(this.soloUntimed ? 0 : dc.seconds, () => this.finishDiyChoose());
    this.markPublic();
    for (const ps of this.order) this.markPrivate(ps);
    this.maybeEndDiyChoose();
  }

  /**
   * The seats the step waits for: connected humans not under AI control (AI 托管 / an AI seat).
   * @this {Match}
   */
  diyChooseAwaited() {
    return this.order.filter((p) => !p.botControlled && p.connected && !p.left);
  }

  /**
   * Whether a seat is done with the step (ready, or nobody waits on it).
   * @this {Match}
   */
  diyChooseDone(ps) {
    return !!ps.diyChooseReady || !this.diyChooseAwaited().includes(ps);
  }

  /**
   * g.diyChoose { slots }: the slots of the seat's lineup it brings into this match — the whole choice, replacing the
   * last one. Refused while the seat is ready, for a slot outside its lineup or twice, and above the tier's limit.
   * @this {Match}
   */
  diyChoose(ps, slots) {
    if (this.phase !== PHASE.DIY_CHOOSE || this.ended) return fail(ERR.WRONG_PHASE);
    if (ps.diyChooseReady) return fail(ERR.ALREADY, 'ready: cancel it first');
    const lineup = ps.diyLineup || EMPTY;
    const perTier = this.gd.diyChoose.perTier;
    const seen = new Set();
    /** @type {Map<number, number>} */
    const count = new Map();
    for (const id of slots) {
      if (!Object.hasOwn(lineup, id) || seen.has(id)) return fail(ERR.BAD_TARGET, `not a slot of the lineup: ${id}`);
      seen.add(id);
      const tier = diySlot(id, this.gd.raw)?.tier;
      const n = (count.get(tier) ?? 0) + 1;
      if (!(n <= (perTier[tier] ?? 0))) return fail(ERR.BAD_TARGET, `more than ${perTier[tier] ?? 0} of tier ${tier}`);
      count.set(tier, n);
    }
    ps.diyChosen = Object.keys(lineup).filter((id) => seen.has(id));
    this.markPrivate(ps);
    return OK;
  }

  /**
   * g.diyReady { cancel? }: the seat's 准备就绪, or 取消准备 while the step runs.
   * @this {Match}
   */
  diyReady(ps, cancel = false) {
    if (this.phase !== PHASE.DIY_CHOOSE || this.ended) return fail(ERR.WRONG_PHASE);
    if (ps.diyChooseReady === !cancel) return OK;
    ps.diyChooseReady = !cancel;
    this.markPublic();
    this.markPrivate(ps);
    this.maybeEndDiyChoose();
    return OK;
  }

  /**
   * Ends the step once every awaited seat is ready (also re-checked when a seat leaves, drops or goes AI 托管).
   * @this {Match}
   */
  maybeEndDiyChoose() {
    if (this.phase !== PHASE.DIY_CHOOSE || this.ended) return;
    if (!this.diyChooseAwaited().every((p) => p.diyChooseReady)) return;
    const token = this._diyChooseToken;
    this.later(0, () => { if (token === this._diyChooseToken) this.finishDiyChoose(); });
  }

  /**
   * Each seat fields the slots it chose (PlayerState.setDiy + initDiyStock), then 协议启动.
   * @this {Match}
   */
  finishDiyChoose() {
    if (this.phase !== PHASE.DIY_CHOOSE || this.ended) return;
    this._diyChooseToken = (this._diyChooseToken || 0) + 1;
    this.setDeadline(0);
    const off = new Set([...this.disabledBonds, ...this.staticInactiveBonds]);
    for (const ps of this.order) {
      if (ps.isBot) continue;
      const lineup = ps.diyLineup || EMPTY;
      const picks = Object.fromEntries((ps.diyChosen || []).filter((id) => Object.hasOwn(lineup, id)).map((id) => [id, lineup[id]]));
      if (!ps.setDiy(picks)) ps.setDiy({});
      ps.initDiyStock(off);
      ps.recompute();
      this.markPrivate(ps);
    }
    this.enterBattleCheck();
  }

  /**
   * m.private `diyChoose` of a seat in a season with the step: its 自选编队 (`lineup`, the picks by slot), the slots
   * chosen, whether it is ready, and the limit per tier. Null in a season without the step.
   * @this {Match}
   */
  diyChooseView(ps) {
    const dc = this.gd.diyChoose;
    if (!dc || ps.isBot) return null;
    return { lineup: ps.diyLineup || EMPTY, chosen: (ps.diyChosen || []).slice(), ready: !!ps.diyChooseReady, perTier: { ...dc.perTier } };
  }
}
