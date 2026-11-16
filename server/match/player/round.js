// server/match/player/round.js — PlayerState methods: the round lifecycle the match calls — startRound (income, pending
// coins, the shop, summon stacks topped up), endPrep, eliminate (every copy back to the pool), recompute (legality,
// out-of-range summons, temp pieces into free hand slots, bonds; onActiveBonds when the set of active bonds changed),
// the bond views — and battleInput (the player's PlayerBattleInput: board units with their loadout, their 补位 mark or
// their 自选 pick, carried 联防 state, the hand pieces a bond may field, the reached layers).
// Installed on PlayerState.prototype by server/match/PlayerState.js (a method container: never instantiated; `this` is
// the player state).

import { boardOrder, pieceDir } from '../board.js';
import { computeBonds, bondSnapshot, activatedLayers, bondsWithGains, pieceBonds } from '../bondsMeta.js';
import { handRules, swapBondRecord } from '../../sim/content/bonds/dispatch.js';
import { handRules as switchHandRules } from '../../sim/content/garrisons/effects/switch.js';
import { BAND_MARK, BAND_CHEST, STAGE_COUNTER, COMMAND_STAGE_COUNTER } from '../../sim/content/bands/meta.js';
import { markInputNeeds } from '../../sim/content/bands/battle.js';

export class PlayerRound {
  startRound(r) {
    this.round = { refreshes: 0, buys: 0, sells: 0, spent: 0, gainedChess: 0, arts: 0 };
    this.pendingLayerGains = null; // settled (or lapsed) at the last SETTLE
    if (r > 1) this.shop.upgradePrice = Math.max(0, this.shop.upgradePrice - 1);
    // onIncome handlers may rewrite ev.income / ev.pending (e.g. 老鲤 withholds R1–R2 income until R3)
    const ev = { round: r, income: this.gd.income(r), pending: this.pendingFunds };
    this.pendingFunds = 0;
    this.m.dispatch(this, 'onIncome', ev);
    const nonNeg = (v) => (Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0);
    this.addFunds(nonNeg(ev.income) + nonNeg(ev.pending), { reason: 'income' });
    // temp is NOT wiped here: the last prep's deadline resolved what the player could act on (endPrep); what overflowed
    // after it (battle-result grants, SETTLE merges, returned equipment) is shown and usable in this prep (tempDue).
    // Likewise reward offers of the last prep already expired at its end; what is still queued was earned after it —
    // a merge completed during SETTLE / the Final Assault (突变细胞, battle-result grants) — and is shown in this prep
    this.ready = false;
    // summon stacks removed from temp at the last prep deadline come back (PRTS 卫戍协议/帮助 §手牌区); full hand ⇒ temp
    for (const p of [...this.board.values()]) if (p.kind === 'chess') this.grantTokensFor(p);
    this.rollShop({ keepFrozen: true });
    this.shop.frozen = false;
    for (const s of this.shop.slots) if (s) s.frozen = false;
    this.recompute();
  }

  /**
   * Prep deadline (Match.endPrep, after the <休整期结束时> onPrepEnd effects): the temp pieces due at this prep are
   * resolved; what overflowed after Ready or during onPrepEnd stays for the next prep, which `prepsEnded` now names.
   */
  endPrep() {
    this.resolveTemp();
    this.prepsEnded++;
    for (const uid of [...this._tempDue.keys()]) if (!this.temp.some((p) => p && p.uid === uid)) this._tempDue.delete(uid);
    this.offers = [];
    this.clearUnfrozenShop();
    // 坎诺特 利滚利 keeps the leftover, also as a 指令 taken from it (更换指令: bandCommand)
    if (!this.gd.leftoverKeptBands.includes(this.bandId) && !this.gd.leftoverKeptBands.includes(this.bandCommand)) this.funds = 0;
    this.ready = true;
    this.dirty();
  }

  // `effects` are kept: a 信标 gift still pending is delivered to the teammate at the next round start (builtin_gift is
  // flagged afterElimination — GitHub #86); nothing else of an eliminated player is dispatched.
  eliminate(round) {
    this.alive = false;
    this.ready = false;
    this.eliminatedRound = round;
    const all = [];
    for (const p of this.board.values()) all.push(p);
    for (const p of this.hand) if (p) all.push(p);
    for (const p of this.temp) if (p) all.push(p);
    for (const p of all) this.returnCopies(p);
    this.board.clear();
    this.hand.fill(null);
    this.temp.fill(null);
    this._tempDue.clear();
    this.offers = [];
    this.bounties = [];
    this.personalChoice = null;
    this.shop.slots = [];
    this.shop.kinds = [];
    this.funds = 0;
    this.pendingFunds = 0;
    this.recompute();
  }

  recompute() {
    this.deployMap(); // a change of the deploy field (a boss round's prep) marks the legality stale
    if (this._legalityStale) this._evictIllegal();
    this._liftOutOfRange();
    // a free regular hand slot pulls a temp piece in (PRTS 卫戍协议/帮助 §手牌区 "常规手牌区出现空位时自动移入")
    this._fillHandFromTemp();
    // the states the last recompute stored: the change since then is reported once (_reportActiveBonds)
    const before = this.bonds;
    this.bonds = computeBonds(this.gd, this);
    this.dirty();
    this._reportActiveBonds(before, this.bonds);
  }

  /**
   * onActiveBonds (docs/META.md §2.2): the set of active bonds differs between `before` and `after` — every path that
   * changes what the bonds count ends in recompute (a board edit in prep: place, move, swap, withdraw; buys, sells,
   * merges, transformations, temp moves, equipment, effects, an eviction). Bonds that light up pay their owed layer
   * milestones at once (维多利亚's hammers, 远见 / 奇迹's funds — the upstream maintainer's report of the official game,
   * 2026-10-15). Each recompute
   * reports the difference to the previous computed state, so a handler's own recompute (a hammer's onGain) reports
   * only what changed after it, and nothing twice. Never for an eliminated player (eliminate clears the board), a
   * detached copy (preview.js previewPlayer: the AI's rehearsals never touch the live state).
   */
  _reportActiveBonds(before, after) {
    if (!this.alive || typeof this.m.dispatch !== 'function') return;
    if (this.m.players && this.m.players.get(this.playerId) !== this) return;
    const activated = [];
    const deactivated = [];
    for (const id of this.gd.bondIds) {
      const was = !!(before && before[id] && before[id].active);
      const is = !!(after && after[id] && after[id].active);
      if (is && !was) activated.push(id);
      else if (was && !is) deactivated.push(id);
    }
    if (activated.length || deactivated.length) this.m.dispatch(this, 'onActiveBonds', { activated, deactivated });
  }

  activatedLayers() { return activatedLayers(this.bonds); }

  /**
   * The bond states the views show (m.private bonds, m.public players[].bonds): the computed states plus the pending
   * in-battle gains of this round's finished normal battle (bondsMeta.bondsWithGains). The 联防 field fights with them too
   * (battleInput `reached`); no other rule reads them.
   */
  bondsView() { return bondsWithGains(this.bonds, this.pendingLayerGains, this.gd.layerCap); }

  /**
   * The PlayerBattleInput entry of a chess piece (board: `pos` = { row, col, dir }; 整备区: { slot }) — its loadout, 补位
   * mark or 自选 pick, potential and 练度, items.
   */
  chessBattleEntry(piece, pos) {
    const u = { uid: piece.uid, kind: 'chess', chessId: piece.id, ...pos, items: (piece.items || []).map((i) => i.id) };
    const pick = this.diyPickOf(piece.id);
    if (pick) {
      // 0.2.0 自选编队: a slotted DIY slot fights as its pick (sim getChess(id, { diy }): the operator's body, the pick's
      // skill and module — no loadout fields, docs/SIM.md §12)
      u.diy = { charId: pick.charId, skillIndex: pick.skillIndex, uniEquipId: pick.uniEquipId };
    } else if (this.fieldsStandIn(piece.id)) {
      // 0.2.0 补位: a chess this player does not own fights as its stand-in (sim getChess(id, { standIn: true }): the
      // backup skill / module — no loadout fields, docs/SIM.md §12)
      u.standIn = true;
    } else {
      // DESIGN §16: the equipped skill / module (elite only) from the loadout (defaults when absent)
      const lo = this.loadoutFor(this.gd.chess(piece.id));
      u.skillIndex = lo.skillIndex;
      u.moduleId = lo.moduleId;
    }
    // 0.2.2: the potential / 练度 of an operator the player owns (the chess as itself, an owned 自选 pick — the player's
    // 干员调配 settings, 潜能 6 / 精英2 Lv.60 by default and for bots; never a stand-in's nor a prototype pick's)
    const cv = u.standIn ? null : this.cultivationFor(this.gd.chess(piece.id));
    if (cv) { u.potential = cv.potential; u.cultivate = cv.cultivate; }
    // operator skins (docs/rules/upstream.md 「오퍼레이터 스킨」): the outfit, carried to Unit.skin and UnitInfo — display
    // only, no rule reads it (a 自选 slot wears its pick's operator's: skinFor)
    const skin = this.skinFor(this.gd.chess(piece.id), pick ? pick.charId : null);
    if (skin) u.skin = skin;
    return u;
  }

  /**
   * The 规程 marks the player's drag 指令 left for this round's battle (content/bands/meta.js addMark):
   * [{ effectId, uid?, itemId?, capAdd?, row?, col? }] — an operator mark only while the operator is still the player's;
   * a tile mark (溃心领域) in board coordinates.
   */
  bandMarksNow() {
    const out = [];
    for (const e of this.effects) {
      if (!e || e.key !== BAND_MARK || !e.data || e.data.round !== this.m.round || typeof e.data.effectId !== 'string') continue;
      const d = e.data;
      if (d.uid != null && !this.find(d.uid)) continue;
      out.push({
        effectId: d.effectId, ...(d.uid != null ? { uid: d.uid } : null), ...(d.itemId ? { itemId: d.itemId } : null), ...(d.capAdd ? { capAdd: d.capAdd } : null),
        ...(Number.isInteger(d.row) && Number.isInteger(d.col) ? { row: d.row, col: d.col } : null),
      });
    }
    return out;
  }

  /**
   * 宝藏探机's chests standing on the player's board (content/bands/meta.js BAND_CHEST): [{ id, row, col, enemyId, coin }]
   * in board coordinates, oldest first. They stay until a battle reports them touched.
   */
  bandChestsNow() {
    const out = [];
    for (const e of this.effects) {
      if (!e || e.key !== BAND_CHEST || !e.data || !Number.isInteger(e.data.row) || !Number.isInteger(e.data.col) || typeof e.data.enemyId !== 'string') continue;
      out.push({ id: e.id, row: e.data.row, col: e.data.col, enemyId: e.data.enemyId, coin: Number(e.data.coin) || 0 });
    }
    return out;
  }

  /**
   * `reached`: the bonds carry the layers this round's own combat reached (bondsView: the pending in-battle gains, capped
   * like settle()) — the 联防 field (unite.js; PRTS 卫戍协议/帮助 §联防阶段 "将以其阵地当前的状态", [ASSUMED] the current
   * state includes those layers, as the strip shows them). The gains stay pending: settle() adds them once.
   * `marks`: the round's 规程 marks (bandMarksNow) — a battle of the round's own (normal, boss); the 联防 field passes
   * false.
   */
  battleInput({ side = 'L', colOffset = 0, carry = null, reached = false, marks = true } = {}) {
    // a terrain change not yet followed by a recompute (a content hook at the prep end) never fields an illegal board
    this.deployMap();
    if (this._legalityStale) this.recompute();
    // 规程's marks of this round (content/bands/meta.js addMark): 全场聚焦 fields its operator as the elite, 电气化！ gives
    // its item to every board operator with a free slot (the slots of the operator it fights as); the rest goes to the
    // battle (`bandMarks`, content/bands/battle.js)
    const bandMarks = marks ? this.bandMarksNow() : [];
    // 宝藏探机's chests: every battle of the round's own (the 联防 field passes marks false, as for the marks)
    const bandChests = marks ? this.bandChestsNow() : [];
    const upgrade = new Set();
    const gifts = [];
    let wantsHand = false;
    for (const mk of bandMarks) {
      const need = markInputNeeds(this.gd.effect(mk.effectId));
      if (need.upgrade && mk.uid != null) upgrade.add(mk.uid);
      if (need.giveItem && typeof mk.itemId === 'string' && this.gd.item(mk.itemId)) gifts.push(mk.itemId);
      if (need.hand && mk.uid != null && [...this.board.values()].some((p) => p.uid === mk.uid)) wantsHand = true;
    }
    const units = [];
    for (const { r, c, piece } of boardOrder(this.board)) {
      if (piece.kind === 'chess') {
        const golden = upgrade.has(piece.uid) && !this.gd.chess(piece.id)?.isGolden ? this.gd.goldenIdOf(piece.id) : null;
        const fielded = golden && this.gd.chess(golden) ? { ...piece, id: golden } : piece;
        const u = this.chessBattleEntry(fielded, { row: r, col: c, dir: pieceDir(piece) });
        for (const id of gifts) if (u.items.length < this.gd.equipSlotsOf(fielded.id)) u.items.push(id);
        if (carry && carry.has(piece.uid)) u.carryState = carry.get(piece.uid);
        units.push(u);
      } else if (piece.kind === 'token') {
        const u = { uid: piece.uid, kind: 'token', tokenId: piece.id, row: r, col: c, dir: pieceDir(piece), ownerUid: piece.ownerUid };
        if (carry && carry.has(piece.uid)) u.carryState = carry.get(piece.uid); // 联防: { sp } (unite.js)
        units.push(u);
      }
    }
    // the 整备区 operators a battle may field (规程's 卡西米尔 6 switch, content/bonds/nation/kazimierz.js, and the switch
    // 特质): only those a bond or 特质 rule asks for (bonds/dispatch.js handRules — the spec reaches every watcher, the rest of the hand stays
    // private); slot = the hand index (0 the leftmost). The hand does not change during a battle (prep intents only)
    const reserve = [];
    // (the bond as this player's battle runs it: a strategy that switches its direction — 焰尾's 卡西米尔 — swapBondRecord)
    const band = this.bandId ? this.gd.band(this.bandId) : null;
    const rules = handRules((id) => swapBondRecord(this.gd.bond(id), band, (e) => this.gd.effect(e))).filter((x) => { const st = this.bonds?.[x.bond]; return st && st.active && (st.count ?? 0) >= x.need; })
      .map((x) => ({ bonds: [x.bond], position: x.position }));
    // and those a board chess's switch 特质 may call (规程's 耀骑士临光 / 历阵锐枪芬: garrisons/effects/switch.js)
    for (const { piece } of boardOrder(this.board)) {
      if (piece.kind === 'chess') rules.push(...switchHandRules(this.gd.chess(piece.id), (g) => this.gd.garrison(g)));
    }
    if (rules.length || wantsHand) {
      (this.hand || []).forEach((piece, slot) => {
        if (!piece || piece.kind !== 'chess') return;
        const pos = this.gd.chess(piece.id)?.position, bonds = pieceBonds(this.gd, piece);
        // 消解空间 calls the rightmost hand operator of any class (content/bands/battle.js reserve)
        if (wantsHand || rules.some((x) => (x.position == null || pos === x.position) && (bonds.includes('maniShip') || x.bonds.some((b) => bonds.includes(b))))) reserve.push(this.chessBattleEntry(piece, { slot }));
      });
    }
    return {
      playerId: this.playerId,
      seat: this.seat,
      side,
      colOffset,
      units,
      ...(reserve.length ? { reserve } : null),
      bonds: bondSnapshot(reached ? this.bondsView() : this.bonds),
      bandId: this.bandId,
      // the strategy stage the player reached (content/bands/meta.js bandStageIndex) and the round's marks
      ...(this.counters[STAGE_COUNTER] > 0 ? { bandStage: this.counters[STAGE_COUNTER] } : null),
      // a 指令 taken from another strategy (更换指令) and its stage: a passive one brings its battle buffs
      // (content/bands/battle.js install)
      ...(this.bandCommand ? { bandCommand: this.bandCommand } : null),
      ...(this.bandCommand && this.counters[COMMAND_STAGE_COUNTER] > 0 ? { bandCommandStage: this.counters[COMMAND_STAGE_COUNTER] } : null),
      ...(bandMarks.length ? { bandMarks } : null),
      ...(bandChests.length ? { bandChests } : null),
      playerEffects: this.effects.filter((e) => e.battle !== false).map((e) => ({
        id: e.id, key: e.key ?? null, source: e.iconKind ?? null, params: e.params ?? null, counter: e.counter ?? null, data: e.data ?? null,
      })),
      deviceOverrides: { ...this.deviceOverrides },
    };
  }
}
