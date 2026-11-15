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
//            MAP_TILE PASSABLE | PASSABLE_AND_BUILDABLE (a tile of the player's own field that ground enemies walk, not
//            the enemies' red / blue door — shared/bandSkillTile.js; the second also one an operator could stand on: the stage legend's `buildable`, no piece on it; the
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
import { bandSkillTileOk } from '../../../shared/bandSkillTile.js';
import {
  bandStages, bandStageIndex, SKILL_COST_COUNTER, STAGE_COUNTER, COMMAND_STAGE_COUNTER, bandCommandKey, hasCommandStages,
  commandStageActs, COMMAND_CHOICE_KEY, TEAM_UNIQUE_KEYS,
} from '../../sim/content/bands/meta.js';
import { stageTag, stageUnlock } from '../../sim/content/bands/progress.js';
import { bondEffectReplacements, unwrittenTemplates } from '../../sim/content/bonds/dispatch.js';

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
      roundStats: () => ps.round,
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
    // a 指令 taken from another strategy (setBandCommand) is that strategy's, staged on its own counter
    const src = ps.bandCommand || ps.bandId;
    const rec = src ? gd.band(src) : null;
    const stages = bandStages(rec);
    if (!stages.some((s) => s && s.type === 'ACTIVE')) return null;
    const ctx = this._bandSkillCtx(ps, write);
    const stageIndex = bandStageIndex(ctx, stages, ps.bandCommand ? COMMAND_STAGE_COUNTER : STAGE_COUNTER);
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
    // the tile itself: ground passable, not a door, buildable for PASSABLE_AND_BUILDABLE (shared with the drag highlight)
    if (!bandSkillTileOk(tile, filter)) return false;
    // an active obstacle device on the tile (a crate, a mound) closes it as it closes deployment (board.js)
    for (const d of Array.isArray(stage.devices) ? stage.devices : []) {
      if (!d || !Array.isArray(d.pos) || d.pos[0] !== sr || d.pos[1] !== sc || !OBSTACLE_ROLES.has(d.role)) continue;
      const over = ps.deviceOverrides && d.alias != null && Object.hasOwn(ps.deviceOverrides, d.alias) ? !!ps.deviceOverrides[d.alias] : null;
      if (over ?? (typeof d.active === 'boolean' ? d.active : !d.hidden)) return false;
    }
    if (filter === 'PASSABLE_AND_BUILDABLE') {
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
    const src = ps.bandCommand || ps.bandId;
    const key = ps.bandCommand ? bandCommandKey(src) : `band:${src}`;
    const source = { kind: 'band', bandId: src, band: st.rec };
    const ev = {
      round: this.round, bandId: src, stageIndex: st.stageIndex, stage: st.stage, effectId: st.stage.effectId ?? null,
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
   * PlayerState bandMarksNow), chests (宝藏探机's chests standing on the board: [{ row, col, enemyId }] — bandChestsNow),
   * showTag (the stage's table field), tag / unlock (the stage's progress { value, target } or null — content/bands/
   * progress.js), bondSwaps ({ bondId: effectId } — the bond directions the strategy switches, _bandBondSwaps) }.
   * A 规程 strategy without an active stage gets the same shape from _bandPassiveView.
   * The target is not part of `usable` (the client highlights the targets its filter allows).
   */
  bandSkillView(ps) {
    const st = this._bandSkillState(ps, false);
    if (!st) return this._bandPassiveView(ps);
    const b = this._bandSkillBlock(ps, st);
    const t = st.stage.target && typeof st.stage.target === 'object' ? st.stage.target : null;
    const ctx = this._bandSkillCtx(ps, false);
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
      showTag: st.stage.showTag ?? null,
      tag: stageTag(ctx, st.stage),
      unlock: stageUnlock(ctx, st.stage),
      // the strategy whose 指令 this is when it is not the player's own (setBandCommand); the bond directions stay the
      // own strategy's (its passive part)
      commandBandId: ps.bandCommand ?? null,
      bondSwaps: this._bandBondSwaps(ps, ps.bandId ? (ps.gd || this.gd).band(ps.bandId) : null),
      marks: ps.bandMarksNow().map((mk) => ({
        effectId: mk.effectId, ...(mk.uid != null ? { uid: mk.uid } : null), ...(mk.itemId ? { itemId: mk.itemId } : null),
        ...(mk.row != null ? { row: mk.row, col: mk.col } : null),
      })),
      chests: ps.bandChestsNow().map((x) => ({ row: x.row, col: x.col, enemyId: x.enemyId })),
    };
  }

  /**
   * The view of a 规程 passive 指令 (its stages are all PASSIVE / NONE) — the own strategy's, or a passive 指令 taken
   * from another strategy (setBandCommand) —: the same shape, never usable (`blocked` 'passive'), so the HUD shows its
   * portrait, its stage's text and progress — the official panel has a passive ring (autochess_hud_panel `skill_view`
   * variant_passive). Null for a strategy without a stage table (the default season's: no panel there).
   */
  _bandPassiveView(ps) {
    const gd = ps.gd || this.gd;
    const src = ps.bandCommand || ps.bandId;
    const rec = src ? gd.band(src) : null;
    if (!hasCommandStages(rec)) return null;
    const stages = bandStages(rec);
    const ctx = this._bandSkillCtx(ps, false);
    const stageIndex = bandStageIndex(ctx, stages, ps.bandCommand ? COMMAND_STAGE_COUNTER : STAGE_COUNTER);
    const stage = stages[stageIndex];
    return {
      stage: stageIndex,
      stageCount: stages.length,
      effectId: stage.effectId ?? null,
      type: stage.type || 'PASSIVE',
      target: null,
      cost: 0,
      avail: { type: 'DEFAULT', count: 0 },
      usesLeft: null,
      cooldown: 0,
      usable: false,
      blocked: 'passive',
      showTag: stage.showTag ?? null,
      tag: stageTag(ctx, stage),
      unlock: stageUnlock(ctx, stage),
      commandBandId: ps.bandCommand ?? null,
      // the bond directions stay the own strategy's (a taken 指令 never brings its strategy's 变约)
      bondSwaps: this._bandBondSwaps(ps, ps.bandId ? gd.band(ps.bandId) : null),
      marks: [],
      chests: [],
    };
  }

  /**
   * The bonds whose effect the strategy switches for this player ({ bondId: effectId }, content/bonds/dispatch.js
   * swapBondRecord — only a direction the battle runs: a written one), so the bond dialog shows that direction's text.
   */
  _bandBondSwaps(ps, rec) {
    const rep = bondEffectReplacements(rec);
    if (!rep.size) return {};
    const gd = ps.gd || this.gd;
    const out = {};
    for (const id of gd.bondIds) {
      const to = rep.get(gd.bond(id)?.effectId);
      const eff = to ? gd.effect(to) : null;
      if (eff && !unwrittenTemplates(eff).length) out[id] = to;
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 更换指令 — the table's choice events skill_change_1 / skill_change_2 (choiceType SKILL_CHANGE, effectType BAND_SKILL,
  // name 「更换指令」): “追随者们” 好多委托 「每次进入休整期时，从2个随机指令中选择1个并替换当前指令」 (content/bands/meta.js
  // gain_band_skill_from_pool_in_prep) and 投机骰子 「装备时销毁，从3个指令中选择1个替换当前指令」 (content/items/meta.js
  // equip_destory_skill_pool). The offer is a personal choice of the owner (ps.personalChoice `kind` 'bandSkill', the
  // Art 教鞭's slot: m.private only, picked with g.choice { idx, choiceId }, Ready refused while it is open, the prep's
  // deadline or the bot resolves it — match/spDraft.js). No table lists the pool: the server draws it.
  // No table lists the pool: the server draws it. The pool holds passive 指令 too (maintainer decision 2026-11-15, from
  // nine official screenshots of 好多委托's offer: 13 指令, 8 of them PASSIVE stages), so it is every strategy this mode
  // offers (gd.bandIds: inactiveModeIds left out) with a 指令 (bands.json `skills`) but “追随者们” itself, the current
  // 指令 left out, each at the stage the match's progress gives it now (the round, the funds spent, the 调度中心 level, the
  // bond counts — bandStageIndex from 0 on its own counter, as if held from the start). [ASSUMED·서버, maintainer decisions
  // 2026-11-12 and 2026-11-15] A passive 指令 that would do nothing more is left out: an empty one (歌利亚 — its effect is
  // the starting target HP) and one whose gifts are all of rounds already played (a missed one-time gift is not given
  // late — content/bands/meta.js commandStageActs), and a team-wide one a living teammate already holds as its strategy
  // or its taken 指令 (Touch 外勤医疗, 鸭爵 — TEAM_UNIQUE_KEYS: a second one adds nothing; maintainer decision 2026-11-15,
  // as upstream PR #952). The pick replaces only the 指令: the own strategy keeps its passive part (好多委托 itself,
  // Mechanist's 精巧设计 passive, a strategy's bond directions — bandPassiveKey; a passive strategy all of it); a taken
  // passive 指令 runs all of its prep hooks and battle buffs but its strategy's bond directions (变约: its owner's only);
  // its uses, cooldown and cost changes start afresh. Taking the own strategy's 指令 back makes it the own one again.
  // The cards are drawn without repeats from the meta rng.

  /** The stage strategy `bandId`'s 指令 has (would have) for the player now: its own counter's, or from 0 on. */
  _commandStageNow(ps, bandId) {
    const gd = ps.gd || this.gd;
    const stages = bandStages(gd.band(bandId));
    const base = this._bandSkillCtx(ps, false);
    if (bandId === ps.bandId) return bandStageIndex(base, stages, STAGE_COUNTER);
    if (bandId === ps.bandCommand) return bandStageIndex(base, stages, COMMAND_STAGE_COUNTER);
    const ctx = Object.create(base);
    ctx.counter = (k) => (k === COMMAND_STAGE_COUNTER ? 0 : base.counter(k));
    return bandStageIndex(ctx, stages, COMMAND_STAGE_COUNTER);
  }

  /** The strategies whose 指令 the player may be offered now (ids in the mode's strategy order; the header's pool). */
  _bandCommandPool(ps) {
    const gd = ps.gd || this.gd;
    const current = ps.bandCommand || ps.bandId;
    return gd.bandIds().filter((id) => {
      const rec = gd.band(id);
      if (id === current || !hasCommandStages(rec) || isCommandChoice(rec)) return false;
      if (id === ps.bandId) return true; // the own 指令 back
      if (isTeamUnique(rec) && this.alivePlayers().some((p) => p !== ps && (p.bandId === id || p.bandCommand === id))) return false;
      return commandStageActs(bandStages(rec)[this._commandStageNow(ps, id)], this.round);
    });
  }

  /**
   * Open the player's 更换指令 choice: { choiceEvent, desc (the text that says how many: 「从N个…指令」), sourceItemId?,
   * sourceBandId? }. Refused — before an rng draw — outside the player's PREP, after Ready, while another personal choice
   * is open or when the pool is empty.
   */
  offerBandSkillChoice(ps, { choiceEvent = null, desc = '', sourceItemId = null, sourceBandId = null } = {}) {
    if (this.phase !== PHASE.PREP) return fail(ERR.WRONG_PHASE);
    if (!ps.alive) return fail(ERR.ELIMINATED);
    if (ps.ready) return fail(ERR.WRONG_PHASE, 'ready');
    if (ps.personalChoice) return fail(ERR.BAD_TARGET, 'a personal choice is open');
    const pool = this._bandCommandPool(ps);
    if (!pool.length) return fail(ERR.BAD_TARGET, 'no band skill to offer');
    const gd = ps.gd || this.gd;
    const cards = this.rngMeta.shuffle(pool.slice()).slice(0, offerCount(desc))
      .map((bandId) => ({ bandId, effectId: gd.band(bandId).effectId ?? bandId }));
    ps.personalChoice = {
      id: `${this.battlePrefix}.choice.${this.nextUid()}`, round: this.round, kind: 'bandSkill',
      choiceEvent: typeof choiceEvent === 'string' ? choiceEvent : null, sourceItemId, sourceBandId, cards,
    };
    ps.dirty();
    return OK;
  }

  /** The player's 指令 becomes strategy `bandId`'s (the header's rules); false when it has no 指令 or is “追随者们”. */
  setBandCommand(ps, bandId) {
    const gd = ps.gd || this.gd;
    const rec = typeof bandId === 'string' ? gd.band(bandId) : null;
    if (!hasCommandStages(rec) || (bandId !== ps.bandId && isCommandChoice(rec))) return false;
    ps.bandCommand = bandId === ps.bandId ? null : bandId;
    for (const k of [USED, USED_ROUND, TOTAL, READY_ROUND, COST_DELTA, COMMAND_STAGE_COUNTER]) delete ps.counters[k];
    if (ps.bandCommand) bandStageIndex(this._bandSkillCtx(ps, true), bandStages(gd.band(bandId)), COMMAND_STAGE_COUNTER);
    ps.dirty();
    return true;
  }

  /**
   * One card of the 更换指令 choice as m.private shows it: the 指令's strategy and the stage it would have if taken now
   * (read, never stored) — the fields the 机变 cards carry (`name`, `desc`, `descRaw`) plus the 指令's own.
   */
  bandCommandCard(ps, c) {
    const gd = ps.gd || this.gd;
    const rec = c && gd.band(c.bandId);
    const stages = bandStages(rec);
    if (!stages.length) return { kind: 'bandSkill', id: c?.effectId ?? null, bandId: c?.bandId ?? null, name: '', desc: '' };
    const i = this._commandStageNow(ps, c.bandId);
    const st = stages[i];
    return {
      kind: 'bandSkill', id: c.effectId, bandId: c.bandId, bandName: rec.name ?? null, iconId: rec.iconId ?? null,
      name: st.name ?? rec.effectName ?? '', desc: st.desc ?? '', descRaw: st.descRaw ?? null,
      // a passive 指令 has no cost (the card shows none)
      stage: i, stageCount: stages.length, type: st.type ?? null, cost: st.type === 'PASSIVE' ? null : Math.max(0, int(st.cost)),
    };
  }
}

/** Is the strategy “追随者们” (its 指令 opens 更换指令 itself: never in the pool)? */
function isCommandChoice(rec) {
  return bandStages(rec).some((st) => (st?.buffs || []).some((b) => b && b.key === COMMAND_CHOICE_KEY));
}

/** Does the strategy act once for the whole team (TEAM_UNIQUE_KEYS: Touch, 鸭爵)? */
function isTeamUnique(rec) {
  return bandStages(rec).some((st) => (st?.buffs || []).some((b) => b && TEAM_UNIQUE_KEYS.includes(b.key)));
}

/** How many 指令 an offer shows: the N of its text's 「从N个…指令」 (no blackboard field holds it), 1–3. */
function offerCount(desc) {
  const m = /从\s*(\d+)\s*个/.exec(String(desc ?? ''));
  return Math.max(1, Math.min(3, m ? Number(m[1]) : 3));
}
