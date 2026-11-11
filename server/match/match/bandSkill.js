// server/match/match/bandSkill.js — Match methods: 规程's active 指令 (a strategy stage of `type` ACTIVE, bands.json
// `skills`): g.bandSkill — its gate, its target, its cost and its use limits — and the player's skill status
// (m.private `bandSkill`, bandSkillView).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).
//
// The stage the player uses is its current one (content/bands/meta.js bandStageIndex, moved on before the check). A
// stage says (tools/build-data.mjs bandSeasonFields, from the table's skillInfoDataDict):
//   type     ACTIVE (usable) · PASSIVE · NONE (a locked stage: 「…-未解锁」, its `next` names what unlocks the next one)
//   target   { type, filter } — NO_TARGET (「点击使用」), COMMON_CHESS CHAR (an own operator: on the board or in the 整备区 —
//            the official drag hint 「请指向战场或整备区的干员」), SHOP_SLOT CHAR | EQUIP (an unsold 调度中心 slot of that kind),
//            MAP_TILE PASSABLE | PASSABLE_AND_BUILDABLE (a tile of the player's own field that ground enemies walk;
//            the second also one an operator could stand on: the stage legend's `buildable`, no piece on it; the
//            maintainer's provisional 「지상 타일」 of 2026-11-08) — 「拖拽使用」 for every target but NO_TARGET
//   cost     funds (skillCost) + the counter COST_DELTA the cost keys write (skill_cost_*: their own handlers)
//   avail    ROUND_RESET n (n uses a round) · ALL_LIMIT n (n a match) · COOLDOWN n (n rounds after a use; a handler may
//            set `ev.cooldown`: 私募基金's 「冷却回合数等同于获得资金」) · DEFAULT (no limit: the cost keys price it)
//   unusableAtSpecialRecruit — refused while a reward offer holds the shop row (the client's isSpecialRecruit: the same
//            flag refuses 刷新 / 冻结, server/local-patch.js 「특수 상품 연출」)
// The client's skill classes exist only in the CN client (AutoChessPlayerSkillStatus, AutoChessBattleSceneUsePlayerSkillUp);
// what they check is read from the table's fields and texts. [ASSUMED·CN] PREP only, and not after Ready (as every prep
// intent: player/prep.js _gate); a COOLDOWN of n used in round r is ready again in round r + n (it counts down at each
// round start); the 临时整备区 holds no target operator.
//
// The effect is the strategy's: its stage handler's hook `onBandSkill` (content/bands/meta.js, run through the band's
// registry entry, so a staged strategy runs the hook of its current stage) gets
//   ev = { round, bandId, stageIndex, stage, effectId, target, cost, handled: false, error: null, cooldown: null }
// target: null | { kind: 'chess', uid, area: 'board'|'hand' } | { kind: 'shop', slot, id, slotKind: 'chess'|'item' } |
//         { kind: 'tile', row, col } (board coordinates).
// The handler checks first and refuses by setting `ev.error` (a fail(...) result) before it changes anything; a use it
// carried out sets `ev.handled`. A use nobody handled is refused (`BAD_MSG 'band skill not implemented'`) and changes
// nothing. After a handled use the cost is paid (onSpend, reason 'bandSkill'), the use is counted, and `onBandSkillUsed`
// runs on the same handler (`{ ...ev }`: the cost keys reset or raise COST_DELTA there).

import { PHASE, ERR } from '../../../shared/constants.js';
import { OK, fail } from './common.js';
import { inField, fieldTile, tileKey } from '../board.js';
import { bandStages, bandStageIndex, SKILL_COST_COUNTER } from '../../sim/content/bands/meta.js';

/** Uses this round (with USED_ROUND, the round they count for). */
export const USED = 'band:skill:used';
const USED_ROUND = 'band:skill:used:r';
/** Uses this match. */
export const TOTAL = 'band:skill:total';
/** COOLDOWN: the round the skill is usable again (0: now). */
export const READY_ROUND = 'band:skill:ready';
/** Funds added to the stage's cost by the cost keys (skill_cost_*: content/bands/meta.js, which names the counter). */
export const COST_DELTA = SKILL_COST_COUNTER;

const TARGET_FIELDS = ['uid', 'slot', 'row', 'col'];
const OBSTACLE_ROLES = new Set(['crate', 'mound']);
const int = (v, d = 0) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : d; };

export class MatchBandSkill {
  /**
   * The few reads bandStageIndex needs, on the player (no makeCtx: the view asks on every m.private). `write` false: the
   * stage is computed, never stored.
   */
  _bandSkillCtx(ps, write) {
    const m = this;
    return {
      get round() { return m.round; },
      shopLevel: () => ps.shop.level,
      stats: () => ps.stats,
      bondCount: (id) => (ps.bonds[id] ? ps.bonds[id].count : 0),
      counter: (k) => (Number.isFinite(ps.counters[k]) ? ps.counters[k] : 0),
      setCounter: (k, v) => { if (write && Number.isFinite(v)) ps.counters[k] = v; return v; },
    };
  }

  /**
   * The player's active 指令 now: null when the strategy has no ACTIVE stage at all; else its current stage and what
   * limits it. `write`: move the stage counter on (a use) or only read it (the view).
   */
  _bandSkillState(ps, write = false) {
    const gd = ps.gd || this.gd;
    const rec = ps.bandId ? gd.band(ps.bandId) : null;
    const stages = bandStages(rec);
    if (!stages.some((s) => s && s.type === 'ACTIVE')) return null;
    const ctx = this._bandSkillCtx(ps, write);
    const stageIndex = bandStageIndex(ctx, stages);
    const stage = stages[stageIndex];
    const avail = stage.avail && typeof stage.avail === 'object' ? stage.avail : { type: 'DEFAULT', count: 0 };
    const count = Math.max(0, int(avail.count));
    const usedThisRound = ctx.counter(USED_ROUND) === this.round ? ctx.counter(USED) : 0;
    const total = ctx.counter(TOTAL);
    let usesLeft = null;
    let cooldown = 0;
    if (avail.type === 'ROUND_RESET') usesLeft = Math.max(0, count - usedThisRound);
    else if (avail.type === 'ALL_LIMIT') usesLeft = Math.max(0, count - total);
    else if (avail.type === 'COOLDOWN') cooldown = Math.max(0, ctx.counter(READY_ROUND) - this.round);
    const cost = Math.max(0, int(stage.cost) + ctx.counter(COST_DELTA));
    return { rec, stages, stageIndex, stage, avail: { type: avail.type, count }, usesLeft, cooldown, cost, usedThisRound, total };
  }

  /** Why the player cannot use its 指令 now (an ERR code + detail), or null — the gate before the target. */
  _bandSkillBlock(ps, st) {
    if (!ps.alive) return fail(ERR.ELIMINATED);
    if (this.phase !== PHASE.PREP) return fail(ERR.WRONG_PHASE);
    if (ps.ready) return fail(ERR.WRONG_PHASE, 'ready');
    if (!st) return fail(ERR.BAD_TARGET, 'no active band skill');
    if (st.stage.type !== 'ACTIVE') return fail(ERR.WRONG_PHASE, 'locked');
    if (st.usesLeft === 0) return fail(ERR.ALREADY, 'no uses left');
    if (st.cooldown > 0) return fail(ERR.ALREADY, 'cooldown');
    if (st.stage.unusableAtSpecialRecruit && ps.offers.length > 0) return fail(ERR.WRONG_PHASE, 'reward offer');
    if (st.cost > ps.funds) return fail(ERR.NO_FUNDS);
    return null;
  }

  /** The intent's target for the stage, or a fail(...) result. */
  _bandSkillTarget(ps, stage, msg) {
    const t = stage.target && typeof stage.target === 'object' ? stage.target : { type: 'NO_TARGET', filter: null };
    const given = TARGET_FIELDS.filter((k) => msg[k] !== undefined && msg[k] !== null);
    const only = (...keys) => given.every((k) => keys.includes(k)) && keys.every((k) => given.includes(k));
    switch (t.type) {
      case 'NO_TARGET':
        return given.length ? fail(ERR.BAD_TARGET, 'no target') : { target: null };
      case 'COMMON_CHESS': {
        if (!only('uid')) return fail(ERR.BAD_TARGET);
        const l = ps.find(msg.uid);
        if (!l || (l.area !== 'board' && l.area !== 'hand')) return fail(ERR.BAD_TARGET);
        if (t.filter === 'CHAR' && l.piece.kind !== 'chess') return fail(ERR.BAD_TARGET);
        return { target: { kind: 'chess', uid: l.piece.uid, area: l.area } };
      }
      case 'SHOP_SLOT': {
        if (!only('slot')) return fail(ERR.BAD_TARGET);
        const s = ps.shop.slots[msg.slot];
        if (!s || s.sold) return fail(ERR.BAD_TARGET);
        const want = t.filter === 'EQUIP' ? 'item' : t.filter === 'CHAR' ? 'chess' : null;
        if (want && s.kind !== want) return fail(ERR.BAD_TARGET);
        return { target: { kind: 'shop', slot: msg.slot, id: s.id, slotKind: s.kind } };
      }
      case 'MAP_TILE': {
        if (!only('row', 'col')) return fail(ERR.BAD_TARGET);
        const { row, col } = msg;
        if (!this._bandSkillTile(ps, row, col, t.filter)) return fail(ERR.BAD_TILE);
        return { target: { kind: 'tile', row, col } };
      }
      default:
        return fail(ERR.BAD_TARGET, 'unknown target');
    }
  }

  /** Is board tile (row, col) of the player's field a MAP_TILE target of `filter`? */
  _bandSkillTile(ps, row, col, filter) {
    if (!inField(row, col)) return false;
    const stage = this.stage;
    if (!stage || !Array.isArray(stage.rows)) return false;
    const field = typeof this.deployFieldOf === 'function' ? this.deployFieldOf(ps) : 'normal';
    const [sr, sc] = fieldTile(field, row, col);
    const line = typeof stage.rows[sr] === 'string' ? stage.rows[sr] : null;
    const g = line ? line[sc] : null;
    const tile = g != null && stage.tiles && Object.hasOwn(stage.tiles, g) ? stage.tiles[g] : null;
    if (!tile || tile.groundPassable !== true) return false;
    // an active obstacle device on the tile (a crate, a mound) closes it as it closes deployment (board.js)
    for (const d of Array.isArray(stage.devices) ? stage.devices : []) {
      if (!d || !Array.isArray(d.pos) || d.pos[0] !== sr || d.pos[1] !== sc || !OBSTACLE_ROLES.has(d.role)) continue;
      const over = ps.deviceOverrides && d.alias != null && Object.hasOwn(ps.deviceOverrides, d.alias) ? !!ps.deviceOverrides[d.alias] : null;
      if (over ?? (typeof d.active === 'boolean' ? d.active : !d.hidden)) return false;
    }
    if (filter === 'PASSABLE_AND_BUILDABLE') {
      if (!tile.buildable || tile.buildable === 'NONE') return false;
      if (ps.board.has(tileKey(row, col))) return false;
      // a 宝藏探机 chest makes its tile undeployable while it stands (content/bands/meta.js BAND_CHEST)
      if (ps.bandChestsNow().some((x) => x.row === row && x.col === col)) return false;
    }
    return true;
  }

  /**
   * g.bandSkill { uid? | slot? | row?, col? }: use the strategy's active 指令 on the target its stage asks for (header).
   * @param {import('../PlayerState.js').PlayerState} ps
   */
  useBandSkill(ps, msg) {
    const st = this._bandSkillState(ps, true);
    const blocked = this._bandSkillBlock(ps, st);
    if (blocked) return blocked;
    const tr = this._bandSkillTarget(ps, st.stage, msg);
    if (tr.error) return tr;
    const key = `band:${ps.bandId}`;
    const source = { kind: 'band', bandId: ps.bandId, band: st.rec };
    const ev = {
      round: this.round, bandId: ps.bandId, stageIndex: st.stageIndex, stage: st.stage, effectId: st.stage.effectId ?? null,
      target: tr.target, cost: st.cost, handled: false, error: null, cooldown: null,
    };
    this.dispatcher.runKey(ps, key, 'onBandSkill', source, ev);
    if (ev.error) return ev.error && typeof ev.error.error === 'string' ? ev.error : fail(ERR.BAD_TARGET);
    if (!ev.handled) return fail(ERR.BAD_MSG, 'band skill not implemented');
    // the use stands: pay, count, then the cost keys
    const cost = Math.min(st.cost, ps.funds);
    if (cost > 0 && ps.spend(cost)) ps._afterSpend(cost, 'bandSkill');
    if (ps.counters[USED_ROUND] !== this.round) { ps.counters[USED_ROUND] = this.round; ps.counters[USED] = 0; }
    ps.counters[USED] += 1;
    ps.counters[TOTAL] = (Number.isFinite(ps.counters[TOTAL]) ? ps.counters[TOTAL] : 0) + 1;
    if (st.avail.type === 'COOLDOWN') {
      const n = Number.isFinite(ev.cooldown) ? Math.max(0, Math.trunc(ev.cooldown)) : st.avail.count;
      ps.counters[READY_ROUND] = this.round + n;
    }
    this.dispatcher.runKey(ps, key, 'onBandSkillUsed', source, { ...ev, cost });
    if (tr.target && tr.target.kind === 'tile') ps.invalidateDeployMap(); // a chest closes its tile (PlayerState.deployMap)
    ps.recompute();
    this.markPrivate(ps);
    return OK;
  }

  /**
   * m.private `bandSkill`: the player's active 指令 (null: the strategy has none) — the stage the panel shows and whether
   * it can be used now: { stage, stageCount, effectId, type, target: { type, filter }, cost, avail: { type, count },
   * usesLeft (null: no count), cooldown (rounds left), usable, blocked (the refusal's detail or code when not usable),
   * marks (the marks this round's uses left for the round's battle: [{ effectId, uid? | itemId? | row?, col? }] —
   * PlayerState bandMarksNow), chests (宝藏探机's chests standing on the board: [{ row, col, enemyId }] — bandChestsNow) }.
   * The target is not part of `usable` (the client highlights the targets its filter allows).
   */
  bandSkillView(ps) {
    const st = this._bandSkillState(ps, false);
    if (!st) return null;
    const b = this._bandSkillBlock(ps, st);
    const t = st.stage.target && typeof st.stage.target === 'object' ? st.stage.target : null;
    return {
      stage: st.stageIndex,
      stageCount: st.stages.length,
      effectId: st.stage.effectId ?? null,
      type: st.stage.type,
      target: t ? { type: t.type, filter: t.filter ?? null } : null,
      cost: st.cost,
      avail: st.avail,
      usesLeft: st.usesLeft,
      cooldown: st.cooldown,
      usable: !b,
      blocked: b ? (b.detail || b.error) : null,
      marks: ps.bandMarksNow().map((mk) => ({
        effectId: mk.effectId, ...(mk.uid != null ? { uid: mk.uid } : null), ...(mk.itemId ? { itemId: mk.itemId } : null),
        ...(mk.row != null ? { row: mk.row, col: mk.col } : null),
      })),
      chests: ps.bandChestsNow().map((x) => ({ row: x.row, col: x.col, enemyId: x.enemyId })),
    };
  }
}
