// server/match/player/economy.js — PlayerState methods: the economy — funds, spending (onSpend), prep-side bond layer
// gains (clamped by layerGainRoom), the shop (onPrice prices, copy-weighted rolls from the shared pool plus the player's
// own 自选 stock — player/diy.js —, freeze) and its intents: g.buy, g.refresh, g.freeze, g.levelUp, g.sell.
// Installed on PlayerState.prototype by server/match/PlayerState.js (a method container: never instantiated; `this` is
// the player state).

/** @import { PlayerState } from '../PlayerState.js' */
import { ERR, PHASE, layerGainRoom } from '../../../shared/constants.js';
import { OK, fail } from './common.js';

/** The phases whose layer gains the owner hears (m.layer); a battle's gains sound from its own 'layer' events. */
/** @type {Set<string>} */
const LIVE_LAYER_PHASES = new Set([PHASE.ROUND_START, PHASE.SP_DRAFT, PHASE.PREP]);

export class PlayerEconomy {
  /** @this {PlayerState} */
  addFunds(n, { reason = '' } = {}) {
    if (!Number.isFinite(n) || n === 0) return 0;
    const v = Math.trunc(n);
    const before = this.funds;
    this.funds = Math.max(0, this.funds + v);
    if (v > 0) this.stats.fundsGained += v;
    this.dirty();
    return this.funds - before;
  }

  /** @this {PlayerState} */
  spend(n) {
    const v = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    if (v > this.funds) return false;
    this.funds -= v;
    this.stats.gold += v;
    this.round.spent += v;
    this.dirty();
    return true;
  }

  /**
   * onSpend, dispatched once a payment's action is complete (buy / refresh / levelUp / reward / effect).
   * @this {PlayerState}
   */
  _afterSpend(amount, reason) {
    if (!(amount > 0)) return;
    this.m.dispatch(this, 'onSpend', { amount, reason, total: this.stats.gold });
  }

  /**
   * Bond layer gain (prep-side). `requireActive` = "使已激活的【X】层数+N". Returns layers added: at most the room left
   * under the match's cap (GameData.layerCap: BOND_LAYER_CAP 999, shared/constants.js; none under the custom setting) — a
   * gain at the cap adds 0 and dispatches nothing.
   * @this {PlayerState}
   */
  addLayers(bondId, n, { requireActive = false, reason = '' } = {}) {
    if (!this.gd.bond(bondId) || !Number.isFinite(n) || n <= 0) return 0;
    if (requireActive && !(this.bonds[bondId] && this.bonds[bondId].active)) return 0;
    const before = this.layers[bondId] || 0;
    const add = layerGainRoom(before, Math.floor(n), this.gd.layerCap);
    if (add <= 0) return 0;
    this.layers[bondId] = before + add;
    this.recompute();
    // upstream #482: the owner's layer-up sound (m.layer) for a live gain of 回合开始 / 机变 / 休整期 — not a view: a
    // reconnect or a battle's settlement (the IN_BATTLE gains carried over) sends none
    if (LIVE_LAYER_PHASES.has(this.m.phase)) this.m.sendTo(this.playerId, { t: 'm.layer', playerId: this.playerId, bondId, add });
    this.m.dispatch(this, 'onLayers', { bondId, from: before, to: before + add, reason });
    return add;
  }

  /**
   * Effective price of a shop slot after onPrice modifiers (never negative).
   * @this {PlayerState}
   */
  priceOf(slot) {
    if (!slot) return 0;
    const ev = { slot, kind: slot.kind, id: slot.id, price: slot.basePrice };
    this.m.dispatch(this, 'onPrice', ev, { quiet: true });
    const p = Number(ev.price);
    return Number.isFinite(p) ? Math.max(0, Math.round(p)) : slot.basePrice;
  }

  /** @this {PlayerState} */
  _rollChessSlot() {
    // the slotted 自选 pieces join the draw once the 调度中心 reaches their slot's level (player/diy.js diyRollEntries)
    const id = this.m.pool.roll(this.m.rngShop, { maxTier: this.shop.level, extra: this.diyRollEntries() });
    return id ? { kind: 'chess', id, basePrice: this.gd.chessPrice(id), frozen: false, sold: false } : null;
  }

  /** @this {PlayerState} */
  _rollItemSlot() {
    const id = this.m.pool.rollItem(this.m.rngShop, this.shop.level, this.m.itemPool);
    return id ? { kind: 'item', id, basePrice: this.gd.itemPrice(id), frozen: false, sold: false } : null;
  }

  /**
   * The kind ('chess' | 'item') of every shop position, in display order (`shop.kinds`, empty slots included). A shop
   * without it (an older state) had its operator slots first, then the item slots (`shop.layout`).
   * @returns {string[]}
   * @this {PlayerState}
   */
  _shopKinds() {
    const slots = this.shop.slots;
    if (Array.isArray(this.shop.kinds) && this.shop.kinds.length === slots.length) return this.shop.kinds;
    const layout = this.shop.layout || { chess: slots.length, item: 0 };
    return slots.map((s, i) => (s ? s.kind : i < layout.chess ? 'chess' : 'item'));
  }

  /**
   * Reroll the shop. keepFrozen → frozen unsold slots survive (round start); otherwise everything is rerolled
   * (manual refresh). Slot counts follow the current level. The array is the display order, left to right: after a roll
   * the item slot(s) come first, then the operators — local patch (LOCAL-PATCH.md 「상점 칸 배치」, maintainer 2026-10-09: in the
   * game the item is always on the left). A frozen card keeps its place among the slots of its kind. The draws run
   * operators first, then items, as before (the shop RNG sequence is unchanged).
   * @returns {number[]} the positions drawn anew (not kept frozen), left to right
   * @this {PlayerState}
   */
  rollShop({ keepFrozen = false } = {}) {
    const { chess: nChess, item: nItem } = this.gd.shopSlots(this.shop.level);
    const old = this.shop.slots;
    const kinds = this._shopKinds();
    const oldChess = old.filter((_, i) => kinds[i] === 'chess');
    const oldItems = old.filter((_, i) => kinds[i] === 'item');
    const keep = (s, kind) => (keepFrozen && s && s.kind === kind && !s.sold && s.frozen ? { ...s } : null);
    // frozen slots keep their position; sold / empty / unfrozen positions are rerolled
    const fresh = new Set();
    const chess = [];
    for (let i = 0; i < nChess; i++) { const k = keep(oldChess[i], 'chess'); if (!k) fresh.add(`c${i}`); chess.push(k ?? this._rollChessSlot()); }
    const items = [];
    for (let i = 0; i < nItem; i++) { const k = keep(oldItems[i], 'item'); if (!k) fresh.add(`i${i}`); items.push(k ?? this._rollItemSlot()); }
    const slots = [...items, ...chess];
    this.shop.slots = slots;
    this.shop.kinds = [...items.map(() => 'item'), ...chess.map(() => 'chess')];
    this.shop.layout = { chess: nChess, item: nItem };
    for (const s of slots) if (s) s.frozen = this.shop.frozen;
    this.dirty();
    return slots.map((_, i) => i).filter((i) => fresh.has(i < nItem ? `i${i}` : `c${i - nItem}`));
  }

  /**
   * The 调度中心's upgrade opens the new level's extra slots EMPTY, on the left; the cards shown keep their places until
   * the next roll (a refresh or the round start) puts the item back on the left — local patch (LOCAL-PATCH.md 「상점 칸
   * 배치」, maintainer 2026-10-09 from the game). Upstream 0.2.0 filled them with new cards at once (community report of
   * 2026-10-06, item 19); 0.1.x left them empty after the operators.
   * @this {PlayerState}
   */
  _openLevelSlots() {
    const { chess: nChess, item: nItem } = this.gd.shopSlots(this.shop.level);
    const kinds = this._shopKinds();
    const haveChess = kinds.filter((k) => k === 'chess').length;
    const haveItems = kinds.length - haveChess;
    const addChess = Math.max(0, nChess - haveChess), addItems = Math.max(0, nItem - haveItems);
    if (!addChess && !addItems) return;
    this.shop.slots = [...new Array(addItems + addChess).fill(null), ...this.shop.slots];
    this.shop.kinds = [...new Array(addItems).fill('item'), ...new Array(addChess).fill('chess'), ...kinds];
    this.shop.layout = { chess: haveChess + addChess, item: haveItems + addItems };
  }

  /**
   * Combat start: unfrozen slots are emptied (research 01 A1).
   * @this {PlayerState}
   */
  clearUnfrozenShop() {
    this.shop.kinds = this._shopKinds().slice();
    this.shop.slots = this.shop.slots.map((s) => (s && s.frozen && !s.sold ? s : null));
    this.dirty();
  }

  /**
   * g.buy {slot}. A full regular hand refuses every purchase, also one whose copy would complete a merge at once (PRTS
   * 卫戍协议/帮助 §手牌区 "当常规手牌区全满无空位时，玩家将无法执行使手牌溢出的操作" — "例如招募/购入等通常情况下会增加手牌的
   * 操作"; BWIKI 盟约 "当整备区达到上限后将无法进行涉及到整备区的操作（购买、撤回等）"; GitHub #82: the reporter's first-hand
   * check in the official game, "哪怕是已经有了两个相同干员情况"). Until 0.1.3 such a purchase was let through.
   * @this {PlayerState}
   */
  buy(slotIdx) {
    const g = this._gate(); if (g) return g;
    if (!Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx >= this.shop.slots.length) return fail(ERR.BAD_TARGET);
    const slot = this.shop.slots[slotIdx];
    if (!slot) return fail(ERR.BAD_TARGET);
    if (slot.sold) return fail(ERR.SOLD_OUT);
    const price = this.priceOf(slot);
    if (this.funds < price) return fail(ERR.NO_FUNDS);
    // a full zone refuses it: the hand, or 规程's 装备区 for an item (bagMode)
    const handFull = this.freeZoneSlot(slot.kind) < 0;
    let piece;
    if (slot.kind === 'chess') {
      const rec = this.gd.chess(slot.id);
      // a DIY slot sells only as this player's own 自选 piece (a slotted slot's record carries `diyFor`)
      if (!rec || (rec.isDiy && !rec.diyFor)) return fail(ERR.BAD_TARGET);
      // An operator card the shop already shows stays buyable when the stock has run out since the roll: the stock only
      // decides what the shop draws (路标月报#2, bilibili BV1eLXXBqEgF ~2:55 — nine 星源 shown at once, all bought, the
      // team owning 13+; GitHub #498). acquireChess takes the copies with overdraw, so the raw balance goes negative
      // and `left + held == cap` still holds (pool.js). [ASSUMED] the same for a 自选 slot and this player's 自选 stock.
      if (handFull) return fail(ERR.HAND_FULL);
      this.spend(price);
      slot.sold = true;
      piece = this.acquireChess(slot.id, { source: 'buy' });
    } else {
      if (!this.gd.item(slot.id)) return fail(ERR.BAD_TARGET);
      if (!this.m.itemPool.canGain(slot.id)) return fail(ERR.SOLD_OUT);
      if (handFull) return fail(this.zoneFullError('item'));
      this.spend(price);
      slot.sold = true;
      piece = this.acquireItem(slot.id, { source: 'buy' });
    }
    this.stats.buys++;
    this.round.buys++;
    this.m.dispatch(this, 'onBuy', { piece, slot, price, kind: slot.kind });
    this._afterSpend(price, 'buy');
    this.recompute();
    return OK;
  }

  /** @this {PlayerState} */
  refresh() {
    const g = this._gate(); if (g) return g;
    const free = this.shop.freeRefreshes > 0;
    const price = free ? 0 : this.gd.refreshPrice;
    if (!free && this.funds < price) return fail(ERR.NO_FUNDS);
    if (free) this.shop.freeRefreshes--;
    else this.spend(price);
    // A manual refresh cancels the freeze: the new cards are not frozen (official play reported by the upstream
    // maintainer, upstream #584). A refresh that fails (funds, phase) returns above and leaves the freeze on.
    this.shop.frozen = false;
    this.rollShop({ keepFrozen: false });
    this.stats.refreshes++;
    this.round.refreshes++;
    this.m.dispatch(this, 'onRefresh', { slots: this.shop.slots, free, price });
    this._afterSpend(price, 'refresh');
    this.dirty();
    return OK;
  }

  /**
   * A refresh an effect carries out and pays for itself (规程's 指令 「刷新调度中心」: content/bands/meta.js): the manual
   * refresh without its price — the freeze is cancelled, every slot rerolled, `adjust()` may then rewrite slots (the
   * 指令's own 「必定包含 / 优先」), and it counts and dispatches as a manual refresh (onRefresh `free`, `source`)
   * [ASSUMED·CN: whether a 指令's refresh counts as a 主动刷新 for the 特质 and strategies that count those — the client's
   * skill classes exist only in the CN client]. `adjust()` returns how many of the rightmost operator cards it fixed
   * (雅拉's 人才锁定), passed on as onRefresh `pinned`: 奇迹's guaranteed card then takes the card left of them.
   * @param {(() => number | void) | null} [adjust]
   * @param {string} [source]
   * @this {PlayerState}
   */
  effectRefresh(adjust = null, source = 'effect') {
    this.shop.frozen = false;
    this.rollShop({ keepFrozen: false });
    const pinned = /** @type {number | undefined} */ (typeof adjust === 'function' ? adjust() : 0);
    this.stats.refreshes++;
    this.round.refreshes++;
    this.m.dispatch(this, 'onRefresh', { slots: this.shop.slots, free: true, price: 0, source, pinned: Number.isInteger(pinned) && pinned > 0 ? pinned : 0 });
    this.dirty();
  }

  /**
   * A new shop item card of the shop's draw (the shop RNG and level), none of `exclude`; null when none is left.
   * @this {PlayerState}
   */
  rollShopItem(exclude = []) {
    for (let k = 0; k < 8; k++) {
      const s = this._rollItemSlot();
      if (!s) return null;
      if (!exclude.includes(s.id)) return s;
    }
    return null;
  }

  /** @this {PlayerState} */
  freeze() {
    const g = this._gate(); if (g) return g;
    this.shop.frozen = !this.shop.frozen;
    for (const s of this.shop.slots) if (s && !s.sold) s.frozen = this.shop.frozen;
    this.dirty();
    return OK;
  }

  /** @this {PlayerState} */
  levelUp() {
    const g = this._gate(); if (g) return g;
    if (this.shop.level >= this.gd.maxShopLevel) return fail(ERR.MAX_LEVEL);
    const price = Math.max(0, this.shop.upgradePrice);
    if (this.funds < price) return fail(ERR.NO_FUNDS);
    this.spend(price);
    this.shop.level++;
    this.shop.upgradePrice = this.gd.upgradeBase(this.shop.level) ?? 0;
    this._openLevelSlots();
    this.m.tickerFor('SHOP_LEVEL', [this.name, String(this.shop.level)], { playerId: this.playerId, param: String(this.shop.level) });
    this.m.dispatch(this, 'onLevelUp', { level: this.shop.level, price });
    this._afterSpend(price, 'levelUp');
    this.dirty();
    return OK;
  }

  /**
   * What selling a chess piece pays: the price a 特质 gave this piece (piece.sellPrice — 规程's 海沫 「自身售出价格+1」,
   * garrisons/prep/shop.js), else its chess's (GameData.sellPrice, 温蒂's fixed price included).
   * @this {PlayerState}
   */
  sellPriceOf(piece) {
    if (!piece || piece.kind !== 'chess') return 0;
    if (Number.isFinite(piece.sellPrice) && piece.sellPrice >= 0) return piece.sellPrice;
    return this.gd.sellPrice(piece.id);
  }

  /**
   * What selling this owned chess piece pays now: its own price (sellPriceOf) as the strategies change it (onSellPrice —
   * 巫恋's swap pending: 0, 温蒂's fixed price kept). The one price both the sale and the piece view (player/views.js) use,
   * so the price shown is the price paid. The 特质 that read a sell price (旅骨, 棘刺, 海沫's raise) read sellPriceOf.
   * @this {PlayerState}
   */
  sellGainOf(piece) {
    if (!piece || piece.kind !== 'chess') return 0;
    const ev = this.m.dispatch(this, 'onSellPrice', { piece, price: this.sellPriceOf(piece) });
    return Number.isFinite(ev?.price) ? Math.max(0, Math.trunc(ev.price)) : this.sellPriceOf(piece);
  }

  /** @this {PlayerState} */
  sell(uid) {
    const g = this._gate(); if (g) return g;
    const loc = this.find(uid);
    if (!loc) return fail(ERR.BAD_TARGET);
    if (loc.piece.kind !== 'chess') return fail(ERR.BAD_TARGET, loc.piece.kind === 'item' ? 'items cannot be sold' : 'tokens cannot be sold');
    const piece = loc.piece;
    // the price shown on the piece (taken while it is still owned, as the view takes it)
    const price = this.sellGainOf(piece);
    // Returned equipment can always wait in the overflow queue, even when all fifteen visible slots are occupied.
    this._detach(loc);
    this.removeTokensOf(piece.uid);
    for (const it of piece.items || []) this.stow(it, { allowTemp: true });
    piece.items = [];
    this.returnCopies(piece);
    const ev = { piece, gain: price };
    this.m.dispatch(this, 'onSold', ev);
    const gain = Number.isFinite(ev.gain) ? Math.max(0, Math.trunc(ev.gain)) : 1;
    this.addFunds(gain, { reason: 'sell' });
    this.stats.sells++;
    this.round.sells++;
    this.checkItemMerges();
    this.recompute();
    return OK;
  }
}
