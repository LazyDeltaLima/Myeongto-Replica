// server/match/player/views.js — PlayerState methods: the views — pieceView, effectsView (the effects column: 策略 / 机变 /
// 悬赏 …) and m.private (privateView).
// Installed on PlayerState.prototype by server/match/PlayerState.js (a method container: never instantiated; `this` is
// the player state).

/** @import { PlayerState } from '../PlayerState.js' */
/** @import { Piece } from './pieces.js' */
import { PHASE } from '../../../shared/constants.js';
import { boardOrder, pieceDir } from '../board.js';
import { bondList, offBondCounts } from '../bondsMeta.js';
import { bountyText, bountyCard } from '../choices.js';
import { hasShowTag, garrisonShowValue, itemShowValue } from '../../../shared/showTag.js';

/** The 特质 records whose text carries 「{showtag_value_1}」 (规程: ten 特质, normal and elite), per game data. */
const SHOW_TAG_GARRISONS = new WeakMap();
/** @param {import('../gamedata.js').GameData} gd */
function showTagGarrisons(gd) {
  let list = SHOW_TAG_GARRISONS.get(gd);
  if (!list) {
    list = Object.values(gd.raw?.garrisons || {}).filter((g) => g && (hasShowTag(g.desc) || hasShowTag(g.descRaw)));
    SHOW_TAG_GARRISONS.set(gd, list);
  }
  return list;
}

export class PlayerViews {
  /**
   * The outfit a piece wears (docs/rules/upstream.md 「오퍼레이터 스킨」), or null: an operator its player's choice for
   * the operator of its body (skinFor: a 补位 stand-in's body, a 自选 slot's pick); a summon its owner piece's — the
   * owner's skinId, which the client turns into the summon's own outfit through the skin's `tokenSkinMap`; an item none.
   * @param {any} p a board / hand / temp piece
   * @returns {string|null}
   * @this {PlayerState}
   */
  pieceSkin(p) {
    if (!p || !this.skins || !Object.keys(this.skins).length) return null;
    if (p.kind === 'chess') {
      const pick = this.diyPickOf(p.id);
      return this.skinFor(this.gd.chess(p.id), pick ? pick.charId : null);
    }
    if (p.kind !== 'token' || p.ownerUid == null) return null;
    const owner = this.find(p.ownerUid)?.piece;
    return owner && owner.kind === 'chess' ? this.pieceSkin(owner) : null;
  }

  /** @param {Piece} p @param {number[] | null} [rc] the board tile [row, col] @this {PlayerState} */
  pieceView(p, rc = null) {
    const rec = p.kind === 'item' ? this.gd.item(p.id) : p.kind === 'token' ? this.gd.token(p.id) : this.gd.chess(p.id);
    /**
     * @type {{ uid: number, kind: string, id: string, golden: boolean, tier: number | null, items: { uid: number, id: string }[],
     *   count: number, ownerUid: number | null, skin?: string, sellPrice?: number, row?: number, col?: number, dir?: string,
     *   showTag?: number }}
     */
    const v = {
      uid: p.uid,
      kind: p.kind,
      id: p.id,
      golden: !!(rec && rec.isGolden),
      tier: rec && Number.isInteger(rec.tier) ? rec.tier : null,
      items: p.kind === 'chess' ? (p.items || []).map((it) => ({ uid: it.uid, id: it.id })) : [],
      count: p.kind === 'token' ? (p.count || 1) : 1,
      ownerUid: p.kind === 'token' ? p.ownerUid ?? null : null,
    };
    // operator skins: the prep board / hand / temp pieces show their outfit before they fight (pieceSkin)
    const skin = this.pieceSkin(p);
    if (skin) v.skin = skin;
    // the sell price when it is not the record's (规程's 海沫 / 温蒂, 巫恋's pending swap: economy.js sellGainOf, the price
    // the sale pays) — the detail panel shows it
    if (p.kind === 'chess') { const sp = this.sellGainOf(p); if (sp !== (rec?.sellPrice ?? 1)) v.sellPrice = sp; }
    if (rc) { v.row = rc[0]; v.col = rc[1]; v.dir = pieceDir(p); }
    // 定期存折's funds now — its card's 「{showtag_value_1}」 (shared/showTag.js; items/meta.js pays the same number)
    if (p.kind === 'item' && hasShowTag(rec?.desc)) {
      const n = itemShowValue(rec, Number.isInteger(p.boughtRound) ? this.m.round - p.boughtRound : 0);
      if (Number.isFinite(n)) v.showTag = /** @type {number} */ (n);
    }
    return v;
  }

  /** @this {PlayerState} */
  effectsView() {
    const out = [];
    const band = this.bandId ? this.gd.band(this.bandId) : null;
    if (band) out.push({ id: band.effectId || band.bandId, name: band.effectName || band.name, desc: band.desc || '', iconKind: 'band', iconId: band.iconId || band.bandId });
    // 精打细算玩偶 (builtinMeta.js gain_coin_when_round_start: one effect per doll used): one entry at the first doll's place,
    // `roundFunds` = the funds they add at every round start together, `stack` = how many (maintainer decision 2026-10-25:
    // one icon, the tooltip names the real per-round gain — ui/effectsList.js)
    let dolls = null;
    for (const e of this.effects) {
      if (e.hidden) continue;
      if (e.key === 'effect:builtin_round_coin') {
        const n = Math.max(0, Math.trunc(Number(e.params && e.params.count) || 0));
        if (dolls) { dolls.roundFunds += n; dolls.stack++; continue; }
        dolls = { id: e.id, name: e.name || e.id, desc: e.desc || '', iconKind: e.iconKind || 'item', iconId: e.iconId || e.id, roundFunds: n, stack: 1 };
        out.push(dolls);
        continue;
      }
      /** @type {{ id: string, name: string, desc: string, iconKind: string, iconId: string, effectId?: string, counter?: unknown }} */
      const v = { id: e.id, name: e.name || e.id, desc: e.desc || '', iconKind: e.iconKind || 'choice', iconId: e.iconId || e.id };
      // the record the text was copied from: a 机变 card's entry is `<effectId>#<n>` with the card type's icon
      // (icon_team_buff …), neither of them a record id — ui/effectsList.js effectDesc localizes the text by it
      if (e.data && typeof e.data.effectId === 'string' && e.data.effectId) v.effectId = e.data.effectId;
      if (e.counter != null) v.counter = e.counter;
      out.push(v);
    }
    for (const b of this.bounties) {
      // the battles the bounty's enemies still come for (an official multi-round card: every battle, no counter) and
      // the card's official rich text (blue "下场作战" / "两场作战", red "每场"; a multi-round card reads as long as it
      // lasts — choices.js bountyText, MULTI_ROUND_BOUNTY_BATTLES) — user playtest #6 item 4
      const left = b.roundsLeft >= 90 ? null : b.roundsLeft;
      const eff = b.card.effectId ? this.gd.effect(b.card.effectId) : null;
      out.push({
        id: b.id, name: b.card.name || '悬赏', desc: bountyText((eff && eff.descRaw) || b.card.desc || '', b.card), iconKind: 'choice', iconId: b.card.effectId || 'bounty', // i18n-ignore: a data-less card's fallback name
        counter: left, counterText: left == null ? '之后的每场作战' : `还剩 ${left} 场作战`, // i18n-ignore: older clients (ui/effectsList.js builds it from counter)
      });
    }
    return out;
  }

  /**
   * m.private `showTags`: { [garrisonId]: number } — the player's number of every 特质 whose text carries
   * 「{showtag_value_1}」 (this round's spent funds / refreshes / operators gained, a growing 特质's next value).
   * @this {PlayerState}
   */
  showTagsView() {
    const st = { round: this.round, counter: (/** @type {string} */ k) => (Number.isFinite(this.counters?.[k]) ? this.counters[k] : 0) };
    /** @type {Record<string, number>} */
    const out = {};
    for (const g of showTagGarrisons(this.gd)) {
      const v = garrisonShowValue(g, st);
      if (Number.isFinite(v)) out[g.garrisonId] = /** @type {number} */ (v);
    }
    return out;
  }

  /** @this {PlayerState} */
  privateView() {
    const slots = this.shop.slots.map((s) => (s ? { kind: s.kind, id: s.id, price: this.priceOf(s), basePrice: s.basePrice, sold: !!s.sold, frozen: !!s.frozen } : null));
    const offer = this.offers[0] || null;
    const free = this.shop.freeRefreshes > 0;
    const board = [];
    for (const { r, c, piece } of boardOrder(this.board)) board.push(this.pieceView(piece, [r, c]));
    // a boss round's prep: the partner's board on its half of the boss field (Match.bossMateView, item 51)
    const bossMate = typeof this.m.bossMateView === 'function' ? this.m.bossMateView(this) : null;
    return {
      t: 'm.private',
      playerId: this.playerId,
      seat: this.seat,
      alive: this.alive,
      lp: this.lp,
      funds: this.funds,
      bandId: this.bandId,
      // 规程's active 指令: stage, cost, uses, cooldown, usable (server/match/match/bandSkill.js bandSkillView)
      bandSkill: typeof this.m.bandSkillView === 'function' ? this.m.bandSkillView(this) : null,
      ready: this.ready,
      canReady: this.alive && !this.personalChoice && this.m.phase === PHASE.PREP,
      personalChoice: this.personalChoice ? {
        id: this.personalChoice.id,
        round: this.personalChoice.round,
        sourceItemId: this.personalChoice.sourceItemId,
        // 'bounty' (教鞭) or 'bandSkill' (规程's 更换指令: cards of 指令, server/match/match/bandSkill.js bandCommandCard)
        kind: this.personalChoice.kind === 'bandSkill' ? 'bandSkill' : 'bounty',
        choiceEvent: this.personalChoice.choiceEvent ?? null,
        cards: this.personalChoice.kind === 'bandSkill'
          ? this.personalChoice.cards.map((c) => this.m.bandCommandCard(this, c))
          : this.personalChoice.cards.map((c) => bountyCard(this.gd, c)),
      } : null,
      shop: {
        level: this.shop.level,
        maxLevel: this.gd.maxShopLevel,
        upgradePrice: this.shop.level >= this.gd.maxShopLevel ? 0 : this.shop.upgradePrice,
        refreshPrice: free ? 0 : this.gd.refreshPrice,
        freeRefreshes: this.shop.freeRefreshes,
        // the player's 刷新 count this match: the bar plays the official card_item_refresh when it goes up (ui/shopBar.js)
        refreshes: this.stats.refreshes,
        frozen: this.shop.frozen,
        slots,
        // the kind of every slot in display order, empty ones included (an empty item slot draws as one)
        kinds: this._shopKinds().slice(),
        // `source` 'merge' = the promotion reward (晋升奖励); any other offer (a strategy, an item, a 特质) carries the
        // `label` the bar shows instead; `queued` = offers waiting behind it (player report #6 after 0.1.0)
        rewardOffer: offer ? { tier: offer.tier, source: offer.source === 'merge' ? 'merge' : 'special', label: offer.label || null, queued: this.offers.length - 1, slots: offer.slots.map((s) => ({ kind: s.kind === 'item' ? 'item' : 'chess', id: s.id, price: s.price, sold: !!s.sold })) } : null,
      },
      hand: this.hand.map((p) => (p ? this.pieceView(p) : null)),
      // the whole temp row, the hidden queue behind the five visible 临时整备区 slots included; the client draws only the five
      // (render/app.js; PRTS 卫戍协议/帮助 §手牌区 "溢出单位无法查看，在临时手牌区出现空位时自动移入", as upstream 92b97ecb —
      // maintainer decision 2026-10-17, see docs/rules/sim.md 「임시 정비 구역 뒤 숨은 대기열」)
      temp: this.temp.map((p) => (p ? this.pieceView(p) : null)),
      // 规程's 装备区 (GameData.equipHandSize; 0 = none): the five visible temp slots are the equipment zone, not overflow —
      // only the queue behind them is (docs/rules/sim.md 「규정 장비 구역」)
      bag: this.gd.equipHandSize,
      board,
      // The stage's 外勤医疗 reserve medic is present during prep, but is not a draggable board piece.
      prepMapChars: this.m.prepMapChars(this),
      deployCap: this.deployCap,
      deployCount: this.deployCount,
      // + the mode-off bonds it has members of (`off: true`, the strip's grey 本局禁用 discs — bondsMeta.offBondCounts)
      bonds: bondList(this.gd, this.bondsView(), { full: true, off: offBondCounts(this.gd, this) }),
      effects: this.effectsView(),
      // the numbers of the 特质 texts' 「{showtag_value_1}」 (showTagsView; ui/detailPanel.js GarrisonBlock)
      showTags: this.showTagsView(),
      nextEnemies: this.m.nextEnemiesFor(this),
      // DESIGN §16: the effective operator loadout ({ [baseChessId]: { skill, module } }; chess not listed use defaults)
      loadout: this.loadout,
      // 0.2.2: the effective per-operator 潜能 / 练度 ({ [charId]: { potential, cultivate } }; operators not listed: 潜能 6,
      // 精英2 Lv.60) — the client's cards compose the numbers from it (shared/potential.js)
      ops: this.ops,
      // 0.2.0 补位: the base chess ids this player fields as their stand-ins in this match (the not-owned list the seat had
      // at the match start; [] = every operator owned) — the client shows these as their stand-ins (cards, pieces, the
      // detail card, with a small 「替补」 mark)
      standIns: this.standIns,
      // 0.2.0 自选编队: this player's 自选 picks in this match ({ [slotBaseId]: { charId, skillIndex, uniEquipId } } — the seat's
      // when the match started; {} = none) — the client composes the operator's record for its own cards and pieces
      // (shared/diy.js diyRecord); `diyBanned`: the slotted slots out of the shop this match (every bond of the operator
      // switched off)
      diy: this.diy,
      diyBanned: this.diyBanned,
      // 规程's 确定自选编队 (match/diyChoose.js diyChooseView): the 自选编队 the seat chooses from, the slots chosen, whether it
      // is ready and the limit per tier — absent in a season without the step
      ...(this.m.gd.diyChoose && !this.isBot ? { diyChoose: this.m.diyChooseView(this) } : {}),
      // 最终攻势 / 隐秘核心 prep (community report of 2026-10-06, item 51): `{ playerId, side, units }` — the pair partner's
      // board pieces as UnitInfo on its half of the boss field (mirrored on the right half, as the battle places them);
      // the own prep view draws them beside the own half, read-only. Absent otherwise.
      ...(bossMate ? { bossMate } : {}),
      stats: {
        dmgDealt: Math.round(this.stats.dmgDealt), kills: this.stats.kills, leaks: this.stats.leaks, gold: this.stats.gold,
        refreshes: this.stats.refreshes, merges: this.stats.merges,
      },
    };
  }
}
