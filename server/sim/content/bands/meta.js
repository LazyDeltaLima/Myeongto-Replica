// server/sim/content/bands/meta.js — prep side of the 40 strategies (bands, data/bands.json).
//
// Every band handler is assembled from the band's buffs by their official buff key (numbers from bb / bbStr, never
// hard-coded); keys that only act in battle (env_gbuff_new_with_verify, auto_chess_change_map) live in battle.js.
// Starting LP (totalHp) and 坎诺特's leftover funds are the match's own rules.
//
//   prep_finish_char_bond_add_layer {layer}            华法琳   prep end: per distinct board tier, 1 random op → its bonds +layer (无需激活)
//   band_first_self_refresh_present_char {count,bond}  杜遥夜   first 2 manual refreshes/round: ≥count <bond> chess (tier ≤ shop level)
//   band_shop_refresh_copy_max_lv_char {count}         梓兰     every manual refresh: highest-tier shop chess copied into another slot, copy frozen
//   preparation_start_gain_chess_from_round {round}    梓兰/小贾斯汀/昆图斯/马克维茨/变形者集群/Pith/夕/杰西卡/缪尔赛思/芬  prep start of `round`: bbStr.chess
//   preparation_start_gain_chess_every_n_round {round} 杜宾     prep start, every `round` rounds (round % n = 0): bbStr.chess
//   give_coin_in_round {round,coin}                    老鲤     income of round `round` = coin (R1/R2 0, R3 15)
//   prep_start_gain_chess_from_pool_in_round {round}   老鲤     prep start of `round`: 1 chess of pool
//   band_coin_cost_gain_random_char_by_shop_level      绮良     every coin_cnt funds spent → count random chess ≤ shop level
//   up_shop_next_refresh_must_present_bond_char        佩佩     level-up to a level of lvlist → the next manual refresh (its usual
//                                                               price) prefers <bond>; at most one pending
//   gain_bond_char_per_round {round,preround,bond}     哈洛德   rounds round, round+preround, …: a <bond> chess ≤ shop level (none that low: nothing)
//   first_buy_in_round_char_price_change {price,bond}  休露丝   first <bond> chess of the round costs `price` (bought in the
//                                                               shop: onBuy — a free pick / grant never uses it up)
//   band_cost_coin_reach_cnt_gain_chess_from_pool      潘格尼尼 once coin_cnt funds spent in total: 1 chess of pool (elite 拉特兰 ≥ T4)
//   round_start_bond_check_gain_layer                  余       round start of `round`: exactly factioncount active bonds → +count1, else each active +count2
//   up_shop_add_special_goods {count,choice,pool}      凯瑟琳   every level-up: pick 1 of `count` items of pool (free); 突变细胞 once per match
//   coin_carry_over {capital,interest,max}             坎诺特   leftover ≥ capital at round start → +min(max, ⌊left/capital⌋×interest) income
//   round_start_all_player_change_enemy_2              鸭爵     global: every alive player's battle from `round` (own + teammates;
//                                                                normal, Final Assault, Hidden Core — on the player's half of a
//                                                                pair field): 0–2 ground enemies (the count shared by
//                                                                every player of the round) → one enemylist enemy each
//   round_start_activate_char_chess_effect_in_board    铃兰     round start: 获得时 traits of the right-most (then bottom-most) board op with one
//   first_sell_char_chess_exchange_char_chess_in_shop  巫恋     first sale of a normal op per round: swapped with a random shop chess (sells at 0; 温蒂 keeps 3)
//   round_start_gain_char_chess_in_shop_every_n_round  松桐     prep start, round % n = 0: a random shop chess for free (its slot empties)
//   round_start_gain_coin_by_bond_char_chess_buy       玛恩纳   each <bond> chess bought → +count funds next round (≤ max_count / round)
//   refresh_shop_count_gain_coin_bond_char_chess       贾维     every refresh_count manual refreshes (match total) → <bond> chess ≤ shop level (≤ max_count / round)
//   preparation_start_add_special_goods_every_n_round  娜仁图亚 prep start, round % n = 0: pick choice_cnt of refresh_cnt items of pool (free)
// "进入休整期时" / "休整期开始时" = onPrepStart: PREP opens after the round's 机变 draft (the client's game states SP_PREPARE →
// PREPARE; research 01 §4.1 steps 4 and 6; upstream #851: 老鲤's R3 operators came before the R3 draft). The five keys above
// marked "prep start" run there, by their text (老鲤 「第3回合进入休整期时」, 松桐 「偶数回合的休整期开始时」, 娜仁图亚 / 小贾斯汀 /
// 杰西卡 「进入休整期时」) or their key (preparation_start_*); the whole key moves, so 缪尔赛思's 「在第1回合开始时」 and the texts
// with no time (杜宾 「每2个回合获得」) follow it [ASSUMED: which step of the round grants what is server-side]. Funds
// (onIncome) and the shop refresh stay at the round start, before the draft (official screenshots show the funds behind the
// 机变 screen). "回合开始时" (余, 铃兰) and 哈洛德's gain_bond_char_per_round stay onRoundStart; the operators' 「<进入休整期时>」
// traits (SERVER_PREP_START) run on onPrepStart too (server/match/effectsMeta.js GARRISON_HOOK), after the strategy's grants
// of the same dispatch (global → band → bonds → garrisons). A round without a 机变 draft keeps the old moment.

import { GEO, ERR, gateOf } from '../../../../shared/constants.js';
import { buffsOf, num, bandRecord, gameData, itemIdOfKey } from '../support/index.js';
import { metaBonds } from '../support/meta.js';
import * as garrisons from '../garrisons.js';

/** @import { MetaCtx, MetaHandlers, MetaHook, MetaRegistry } from '../../../match/effectsMeta.js' */
/** @import { SpawnSpec } from '../../../match/waves.js' */
/** @import { ShopSlot } from '../../../match/player/economy.js' */
/** @import { StageCtx } from './progress.js' */
/**
 * The hooks of one buff key of a strategy stage (K): the params of every buff of that key in the stage (`ps`), the
 * strategy id and the stage record.
 * @typedef {(ps: Record<string, any>[], bandId: string, stage: Record<string, any>) => MetaHandlers} BandKeyFn
 */

const int = (/** @type {unknown} */ v, d = 0) => Math.trunc(num(v, d));
const list = (/** @type {unknown} */ s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const hasBond = (/** @type {MetaCtx} */ ctx, /** @type {string} */ id, /** @type {unknown} */ bond) => { const c = ctx.gd.chess(id); return !!(c && Array.isArray(c.bonds) && c.bonds.includes(bond)); };
const isNormalChess = (/** @type {MetaCtx} */ ctx, /** @type {string} */ id) => { const c = ctx.gd.chess(id); return !!(c && !c.isGolden); };

/** Per-round counter: reset lazily when the round changes. @param {MetaCtx} ctx @param {string} key */
function roundCounter(ctx, key) {
  if (ctx.counter(`${key}:r`) !== ctx.round) { ctx.setCounter(`${key}:r`, ctx.round); ctx.setCounter(key, 0); }
  return ctx.counter(key);
}
const bumpRound = (/** @type {MetaCtx} */ ctx, /** @type {string} */ key, n = 1) => { roundCounter(ctx, key); return ctx.incCounter(key, n); };
/** The same counter read without writing (price queries must be pure): 0 when it was last written in another round. */
const roundCount = (/** @type {MetaCtx} */ ctx, /** @type {string} */ key) => (ctx.counter(`${key}:r`) === ctx.round ? ctx.counter(key) : 0);

/** Grant a chess or an item by id. @param {MetaCtx} ctx @param {string} id @param {Record<string, any>} [opts] */
function grant(ctx, id, opts = {}) {
  if (ctx.gd.item(id)) return ctx.grantItem(id, opts);
  if (ctx.gd.chess(id)) return ctx.grantChess(id, opts);
  return null;
}

/** Indices of unsold chess slots of the shop (their slots are filled: a read of one is cast to ShopSlot). */
const chessSlots = (/** @type {MetaCtx} */ ctx) => ctx.shopSlots().map((s, i) => (s && s.kind === 'chess' && !s.sold ? i : -1)).filter((i) => i >= 0);

/**
 * Up to `n` distinct item ids of an equip pool, none of `exclude`.
 * @param {MetaCtx} ctx @param {string} poolId @param {number} n @param {string[]} [exclude]
 */
function rollItems(ctx, poolId, n, exclude = []) {
  /** @type {string[]} */
  const out = [];
  if (exclude.length) {
    // [ASSUMED] (upstream f8bca717 / 83ccfcd7): with ids excluded, draw without replacement — the excluded and the
    // already drawn ids leave the candidates before each draw, so the offer is short only when the pool runs out
    for (let k = 0; k < n; k++) {
      const r = ctx.rollPool(poolId, { exclude: [...exclude, ...out] });
      if (!r || r.kind !== 'item') break;
      out.push(r.id);
    }
    return out;
  }
  for (let k = 0; k < n * 6 && out.length < n; k++) {
    const r = ctx.rollPool(poolId);
    if (!r || r.kind !== 'item') break;
    if (!out.includes(r.id)) out.push(r.id);
  }
  return out;
}

/** Random chess of `bond`, tier ≤ shop level; null when the pool has none that low. @param {MetaCtx} ctx @param {string} bond */
function rollBond(ctx, bond) {
  return ctx.rollChess({ bond, maxTier: Math.max(1, ctx.shopLevel()) });
}

// ---------------------------------------------------------------------------------------------------------------
// buff key → (params[], bandId) → hooks

/** @type {Record<string, BandKeyFn>} */
const K = {};

// 规程's 华法琳 says 「所属的已激活盟约层数」: only the active bonds gain (the default season's text has no 已激活 —
// 无需激活); the stage's text decides (`stage.desc`)
K.prep_finish_char_bond_add_layer = (ps, bandId, stage) => ({
  onPrepEnd(ctx) {
    const n = int(ps[0].layer, 0);
    const requireActive = /已激活/.test(String(stage?.desc ?? ''));
    if (n <= 0) return;
    const byTier = new Map();
    for (const p of ctx.board()) {
      if (!p || p.kind !== 'chess') continue;
      const t = p.tier ?? ctx.gd.tierOf(p.id);
      if (!byTier.has(t)) byTier.set(t, []);
      byTier.get(t).push(p);
    }
    for (const t of [...byTier.keys()].sort((a, b) => a - b)) {
      const p = ctx.rng.pick(byTier.get(t));
      for (const b of metaBonds(ctx, p)) ctx.addLayers(b, n, { requireActive, reason: 'band' });
    }
  },
});

K.band_first_self_refresh_present_char = (ps) => ({
  onRefresh(ctx) {
    const p = ps[0];
    if ((ctx.roundStats().refreshes || 0) > 2) return;
    const need = Math.max(1, int(p.count, 1));
    const idx = chessSlots(ctx);
    const slots = ctx.shopSlots();
    let have = idx.filter((i) => hasBond(ctx, /** @type {ShopSlot} */ (slots[i]).id, p.bond)).length;
    const others = ctx.rng.shuffle(idx.filter((i) => !hasBond(ctx, /** @type {ShopSlot} */ (slots[i]).id, p.bond)));
    for (const i of others) {
      if (have >= need) break;
      const id = rollBond(ctx, p.bond);
      if (!id) break;
      ctx.setShopSlot(i, { kind: 'chess', id });
      have++;
    }
  },
});

K.band_shop_refresh_copy_max_lv_char = () => ({
  onRefresh(ctx) {
    const slots = ctx.shopSlots();
    const idx = chessSlots(ctx);
    if (idx.length < 2) return;
    let best = -1;
    for (const i of idx) best = Math.max(best, ctx.gd.tierOf(/** @type {ShopSlot} */ (slots[i]).id));
    const src = ctx.rng.pick(idx.filter((i) => ctx.gd.tierOf(/** @type {ShopSlot} */ (slots[i]).id) === best));
    const dst = ctx.rng.pick(idx.filter((i) => i !== src));
    ctx.setShopSlot(dst, { kind: 'chess', id: /** @type {ShopSlot} */ (slots[src]).id, frozen: true });
  },
});

K.preparation_start_gain_chess_from_round = (ps) => ({
  onPrepStart(ctx) {
    for (const p of ps) {
      const id = p.chess ?? p.chess_id;
      if (ctx.round !== int(p.round, -1) || !id) continue;
      // a grant of one of the four operators' trait-fixed items runs outside the shared item stock like the trait
      // itself (变形者集群's 变形同构体 — 路标月报#2 item 7); ordinary items stay stock-bound (#466)
      for (let k = 0; k < Math.max(1, int(p.count, 1)); k++) grant(ctx, id, { requirePool: false, source: 'band', noPool: ctx.gd.isTraitFixedItem(id) });
    }
  },
});

K.preparation_start_gain_chess_every_n_round = (ps) => ({
  onPrepStart(ctx) {
    for (const p of ps) {
      const n = int(p.round, 0);
      const id = p.chess ?? p.chess_id;
      if (n <= 0 || ctx.round % n !== 0 || !id) continue;
      for (let k = 0; k < Math.max(1, int(p.count, 1)); k++) grant(ctx, id, { source: 'band' });
    }
  },
});

K.give_coin_in_round = (ps) => ({
  onIncome(ctx, ev) {
    for (const p of ps) if (ctx.round === int(p.round, -1)) ev.income = Math.max(0, int(p.coin, 0));
  },
});

K.prep_start_gain_chess_from_pool_in_round = (ps) => ({
  onPrepStart(ctx) {
    for (const p of ps) {
      if (ctx.round !== int(p.round, -1)) continue;
      for (let k = 0; k < Math.max(1, int(p.count, 1)); k++) {
        const r = ctx.rollPool(p.pool);
        if (r) grant(ctx, r.id, { source: 'band' });
      }
    }
  },
});

K.band_coin_cost_gain_random_char_by_shop_level = (ps) => ({
  onSpend(ctx, ev) {
    const p = ps[0];
    const step = int(p.coin_cnt, 0);
    if (step <= 0 || !(ev.amount > 0)) return;
    let acc = ctx.incCounter('band:kirara:acc', ev.amount);
    while (acc >= step) {
      acc = ctx.incCounter('band:kirara:acc', -step);
      for (let k = 0; k < Math.max(1, int(p.count, 1)); k++) {
        const id = ctx.rollChess({ maxTier: Math.max(1, ctx.shopLevel()) });
        if (id) ctx.grantChess(id, { source: 'band' });
      }
    }
  },
});

// 佩佩 博学多通 "升级调度中心至2、4和6级后，获得1次特殊刷新：此次刷新出现的干员优先为<萨尔贡>干员": the special refresh is the
// player's next manual refresh, paid as usual — the text gives no 免费 (德克萨斯's trait says 「获得1次免费刷新」 for a free
// one), and the community report of 2026-10-06 「佩佩策略的特殊刷新也是要花钱的，不是免费」. Until 0.2.0 a free refresh came
// with it (blackboard `price` 0 read as its price) [ASSUMED: `cnt` / `price` 0 change nothing]. The pending refreshes do
// not stack: one saved from Lv2 and the one of Lv4 still make one special refresh (official play report of 2026-10-26;
// the client only gets a 「specialRefresh」 flag).
K.up_shop_next_refresh_must_present_bond_char = (ps) => ({
  onLevelUp(ctx, ev) {
    const p = ps[0];
    if (!list(p.lvlist).map(Number).includes(ev.level)) return;
    ctx.setCounter('band:pepe:special', 1);
  },
  onRefresh(ctx) {
    if (ctx.counter('band:pepe:special') <= 0) return;
    ctx.incCounter('band:pepe:special', -1);
    const bond = ps[0].bond;
    const slots = ctx.shopSlots();
    for (const i of chessSlots(ctx)) {
      if (hasBond(ctx, /** @type {ShopSlot} */ (slots[i]).id, bond)) continue;
      const id = rollBond(ctx, bond);
      if (!id) break;
      ctx.setShopSlot(i, { kind: 'chess', id });
    }
  },
});

// 规程's name of the same rule (its text unchanged but for 「被动效果」)
K.shop_up_bond_refresh_once = K.up_shop_next_refresh_must_present_bond_char;

// 哈洛德 人才盲盒: a <bond> chess of tier ≤ shop level, and a round whose pool has none that low grants nothing. 规程's text
// says so (「（等阶不高于当前调度中心）」); 盟约's names no tier and takes the same rule [ASSUMED·server: maintainer decision
// 2026-11-18, provisional — the server runs the grant, so the client cannot settle it]. What the official server does
// when nothing is that low is server-side too. The cap matters when the bond itself is absent: 维多利亚 off leaves only
// the operators with another core bond on (烛煌 T6 alone in 规程 when 谢拉格 is off too).
K.gain_bond_char_per_round = (ps) => ({
  onRoundStart(ctx) {
    const p = ps[0];
    const r0 = int(p.round, 1), every = Math.max(1, int(p.preround, 1));
    if (ctx.round < r0 || (ctx.round - r0) % every !== 0) return;
    for (let k = 0; k < Math.max(1, int(p.count, 1)); k++) {
      const id = rollBond(ctx, p.bond);
      if (id) ctx.grantChess(id, { source: 'band' });
    }
  },
});

// 休露丝 雪域礼赠: the round's first <bond> chess bought costs `price`; 规程's round_buy_bond_char_price is the same with
// `n`, the number of such buys a round (1)
K.first_buy_in_round_char_price_change = (ps) => ({
  onPrice(ctx, ev) {
    const p = ps[0];
    if (ev.kind !== 'chess' || !hasBond(ctx, ev.id, p.bond)) return;
    if (roundCounter(ctx, 'band:sciurus') >= Math.max(1, int(p.n, 1))) return;
    ctx.setPrice(Math.min(num(ev.price, 0), int(p.price, 1)));
  },
  onBuy(ctx, ev) {
    if (ev.kind === 'chess' && hasBond(ctx, ev.slot.id, ps[0].bond)) bumpRound(ctx, 'band:sciurus');
  },
});
K.round_buy_bond_char_price = K.first_buy_in_round_char_price_change;

K.band_cost_coin_reach_cnt_gain_chess_from_pool = (ps) => ({
  onSpend(ctx, ev) {
    const p = ps[0];
    if (ctx.counter('band:paganini:done') > 0) return;
    const spent = ctx.incCounter('band:paganini:spent', Math.max(0, int(ev.amount, 0)));
    if (spent < int(p.coin_cnt, 0)) return;
    const r = ctx.rollPool(p.pool);
    if (r && grant(ctx, r.id, { source: 'band' })) ctx.setCounter('band:paganini:done', 1);
  },
});

K.round_start_bond_check_gain_layer = (ps) => ({
  onRoundStart(ctx) {
    const p = ps[0];
    if (ctx.round !== int(p.round, -1)) return;
    const active = Object.entries(ctx.bonds()).filter(([, b]) => b && b.active).map(([id]) => id);
    if (active.length === int(p.factioncount, 1)) {
      for (const b of active) ctx.addLayers(b, int(p.count1, 0), { requireActive: true, reason: 'band' });
    } else {
      for (const b of active) ctx.addLayers(b, int(p.count2, 0), { requireActive: true, reason: 'band' });
    }
  },
});

// 凯瑟琳 gives 突变细胞 at most once per player and match (upstream #677, maintainer decision 2026-10-22 taking the
// upstream maintainer's official play memory; activity_table aceffect_band_26 names no limit) [ASSUMED]: once a pick
// from her offer took the cell (player/prep.js pickReward → counter band:cathy:cellTaken), her later offers leave it
// out. 昆图斯's fixed cell does not use the allowance [ASSUMED].
K.up_shop_add_special_goods = (ps, bandId) => ({
  onLevelUp(ctx) {
    const p = ps[0];
    const cathy = bandId === 'band_cathy';
    // 突变细胞 by the default season's key (another season's id of the same item: support itemIdOfKey)
    const cell = itemIdOfKey('chess_item_5_08_e', ctx);
    const exclude = cathy && cell && ctx.counter('band:cathy:cellTaken') ? [cell] : [];
    const ids = rollItems(ctx, p.pool, Math.max(1, int(p.count, 3)), exclude);
    if (ids.length) ctx.offerItems(ids, { source: cathy ? 'band:band_cathy' : 'band' });
  },
});

K.coin_carry_over = (ps) => ({
  onIncome(ctx, ev) {
    const p = ps[0];
    const cap = int(p.capital, 0), left = ctx.funds();
    if (cap <= 0 || left < cap) return;
    const bonus = Math.min(int(p.max, Infinity), Math.floor(left / cap) * int(p.interest, 0));
    if (bonus > 0) ev.income = int(ev.income, 0) + bonus;
  },
});

K.round_start_activate_char_chess_effect_in_board = (ps) => ({
  onRoundStart(ctx) {
    const p = ps[0];
    const event = p.event_type || 'SERVER_GAIN';
    const cands = ctx.board().filter((v) => v && v.kind === 'chess' && ctx.garrisonsOf(v.uid).some((g) => g.eventType === event));
    if (!cands.length) return;
    /** @type {Array<{ row: number, col: number }>} */ (cands).sort((a, b) => (b.col - a.col) || (a.row - b.row)); // board pieces
    for (const v of cands.slice(0, Math.max(1, int(p.count, 1)))) {
      if (event === 'SERVER_GAIN' && typeof garrisons.triggerGainEffects === 'function') garrisons.triggerGainEffects(ctx, v);
      else ctx.triggerGarrisons(v.uid, event);
    }
  },
});

// 巫恋 「每回合首次出售初始干员时，改为与调度中心中随机1名干员交换」: while the swap is pending (this round's count not
// reached, a normal operator, an unsold operator card in the shop) a normal operator's sell price is 0 — shown so on
// the piece and paid so (onSellPrice: PlayerState.sellGainOf) —, its 出售时 特质 still run (波登可, 吉星, 伊桑), a price
// 海沫 raised shows and pays 0, but 温蒂's fixed 「售出价格为3」 stays (shown 3, paid 3 with the swap): a CN player's report
// of the official game. With no operator card in the shop there is no swap and the operator sells as usual
// [추정·화면: the shown price of that case]. The 特质 that read a sell price (旅骨, 棘刺) read the operator's own price
// [추정·화면: 0 not seen on an official screen].
const vodfoxPending = (/** @type {MetaCtx} */ ctx, /** @type {Record<string, any>[]} */ ps, /** @type {Record<string, any> | null | undefined} */ piece) => !!(piece && piece.kind === 'chess' && isNormalChess(ctx, piece.id)
  && roundCount(ctx, 'band:vodfox') < Math.max(1, int(ps[0].count, 1)) && chessSlots(ctx).length);
K.first_sell_char_chess_exchange_char_chess_in_shop = (ps) => ({
  onSellPrice(ctx, ev) {
    if (vodfoxPending(ctx, ps, ev.piece)) ev.price = ctx.gd.fixedSellPrice(ev.piece.id) ?? 0;
  },
  onSold(ctx, ev) {
    const piece = ev.piece;
    if (!vodfoxPending(ctx, ps, piece)) return;
    const slots = ctx.shopSlots();
    const i = ctx.rng.pick(chessSlots(ctx));
    const got = ctx.grantChess(/** @type {ShopSlot} */ (slots[i]).id, { source: 'band' });
    // no swap after all: the operator's own price (sellGainOf took the swap's)
    if (!got) { ev.gain = Number.isFinite(piece.sellPrice) && piece.sellPrice >= 0 ? piece.sellPrice : ctx.gd.sellPrice(piece.id); return; }
    ctx.setShopSlot(i, { kind: 'chess', id: piece.id });
    bumpRound(ctx, 'band:vodfox');
  },
});

// 规程's 巫恋 (band_substitute) 替身娃娃: the same text under a new key and strategy id
K.sell_char_swap_shop_char = K.first_sell_char_chess_exchange_char_chess_in_shop;

K.round_start_gain_char_chess_in_shop_every_n_round = (ps) => ({
  onPrepStart(ctx) {
    const p = ps[0];
    const n = int(p.round, 0);
    if (n <= 0 || ctx.round % n !== 0) return;
    for (let k = 0; k < Math.max(1, int(p.count, 1)); k++) {
      const idx = chessSlots(ctx);
      if (!idx.length) return;
      const i = ctx.rng.pick(idx);
      if (ctx.grantChess(/** @type {ShopSlot} */ (ctx.shopSlots()[i]).id, { source: 'band' })) ctx.setShopSlot(i, null);
    }
  },
});

K.round_start_gain_coin_by_bond_char_chess_buy = (ps) => ({
  onBuy(ctx, ev) {
    const p = ps[0];
    if (ev.kind !== 'chess' || !hasBond(ctx, ev.slot.id, p.bond)) return;
    const n = int(p.count, 1), max = int(p.max_count, Infinity);
    const used = roundCounter(ctx, 'band:mlynar');
    const add = Math.min(n, max - used);
    if (add <= 0) return;
    ctx.addPendingFunds(add);
    bumpRound(ctx, 'band:mlynar', add);
  },
});

// 规程's 玛恩纳 业务指标: the same text under a new key
K.buy_bond_char_gain_coin = K.round_start_gain_coin_by_bond_char_chess_buy;

K.refresh_shop_count_gain_coin_bond_char_chess = (ps) => ({
  onRefresh(ctx) {
    const p = ps[0];
    const every = int(p.refresh_count, 0);
    if (every <= 0) return;
    if (ctx.incCounter('band:chiave:refreshes', 1) % every !== 0) return;
    if (roundCounter(ctx, 'band:chiave') >= int(p.max_count, Infinity)) return;
    const id = rollBond(ctx, p.bond);
    if (id && ctx.grantChess(id, { source: 'band' })) bumpRound(ctx, 'band:chiave');
  },
});

K.preparation_start_add_special_goods_every_n_round = (ps) => ({
  onPrepStart(ctx) {
    const p = ps[0];
    const n = int(p.round, 0);
    if (n <= 0 || ctx.round % n !== 0) return;
    const ids = rollItems(ctx, p.pool, Math.max(1, int(p.refresh_cnt, 2)));
    for (let k = 0; k < Math.max(1, int(p.choice_cnt, 1)) && ids.length; k++) ctx.offerItems(ids, { source: 'band' });
  },
});

// ---- 规程 (act3autochess) passives

// 奥达 全力熔铸 "在第3、6、9、12、14回合进入休整期时获得1件当前调度中心等级的随机装备": one buff per round; the item is
// one of the shop's items of exactly the shop level's tier (Match.rollItemId tier)
K.prep_start_random_equip_in_round = (ps) => ({
  onPrepStart(ctx) {
    for (const p of ps) {
      if (ctx.round !== int(p.round, -1)) continue;
      for (let k = 0; k < Math.max(1, int(p.count, 1)); k++) {
        const id = ctx.rollItem({ tier: Math.max(1, Math.min(6, ctx.shopLevel())) });
        if (id) ctx.grantItem(id, { source: 'band' });
      }
    }
  },
});

// 复奏 二重奏 "每回合首次晋升精锐干员时，获得1次额外的晋升奖励": the round's first `count` merges into an elite (晋升) queue
// `n` more promotion rewards (晋升奖励, the merge's own offer — PlayerState.pushRewardOffer('merge')); an elite made by an
// effect (升华, 博士投影: PlayerState.promote) is no 晋升 and gives no reward, so it uses none [ASSUMED·화면: 효과로 정예가 된
// 경우는 공식 화면 미확인]
K.promote_char_extra_award = (ps) => ({
  onMerge(ctx, ev) {
    if (!ev || ev.kind !== 'chess') return;
    const p = ps[0];
    if (roundCounter(ctx, 'band:bonus') >= Math.max(1, int(p.count, 1))) return;
    bumpRound(ctx, 'band:bonus');
    for (let k = 0; k < Math.max(1, int(p.n, 1)); k++) ctx.promotionReward();
  },
});

// 机械师 精巧设计's passive "每回合首次装备合并进阶时，在调度中心出现3件装备（可能出现更高一阶的装备）免费获取其中1件": the round's
// first `n` item merges into the 进阶 copy (PlayerState._mergeItem onMerge kind 'item'; a 规程 组合 too — _fuseItem, maintainer
// decision 2026-11-15 — on the same round counter) offer
// `count` different items, `select_count` taken free (one pick-one offer each), as 寻呼模块's 调度中心 offer is played. The
// items are drawn from the shop's items up to one tier above the shop level (at most 6), the stock gating as everywhere
// [ASSUMED·화면: "可能出现更高一阶" 의 확률 — 공식 화면 미확인, 티어 상한만 한 단계 위로]. The active part
// (skill_change_shop_equip) is the 指令 side.
K.promote_equip_extra_award = (ps) => ({
  onMerge(ctx, ev) {
    if (!ev || ev.kind !== 'item') return;
    const p = ps[0];
    if (roundCounter(ctx, 'band:equipbonus') >= Math.max(1, int(p.n, 1))) return;
    bumpRound(ctx, 'band:equipbonus');
    const maxTier = Math.min(6, Math.max(1, ctx.shopLevel()) + 1);
    for (let k = 0; k < Math.max(1, int(p.select_count, 1)); k++) {
      const ids = [];
      for (let j = 0; j < Math.max(1, int(p.count, 3)); j++) { const id = ctx.rollItem({ maxTier, exclude: ids }); if (id) ids.push(id); }
      if (ids.length) ctx.offerItems(ids, { source: 'band' });
    }
  },
});

// 娜仁图亚 沙洲梦魇 "获得3名【萨尔贡】干员后使当前调度中心升级消耗资金-3，调度中心每个等级至多生效1次": every <bond> chess gained
// (bought, granted, a merge's elite: one onGain each) counts; once `count` are counted and the current 调度中心 level has had
// no discount yet, its level-up price drops by `value` (not below 0) and `count` are used up. Counted ones past that wait
// for the next level (checked again after a level-up) [ASSUMED·화면: 이미 할인된 등급에서 센 수가 다음 등급으로 넘어가는지 —
// 「{@tag}」 진행 표시를 공식 화면으로 확인 전]
/** @param {MetaCtx} ctx @param {Record<string, any>} p */
function sandDiscount(ctx, p) {
  const need = Math.max(1, int(p.count, 3));
  if (ctx.counter('band:narant:gained') < need) return;
  if (ctx.counter('band:narant:level') === ctx.shopLevel()) return;
  if (ctx.shopLevel() >= ctx.gd.maxShopLevel) return;
  ctx.incCounter('band:narant:gained', -need);
  ctx.setCounter('band:narant:level', ctx.shopLevel());
  ctx.discountLevelUp(Math.max(0, int(p.value, 0)));
}
K.gain_bond_cnt_shop_up_discount = (ps) => ({
  onGain(ctx, ev) {
    if (!ev || ev.kind !== 'chess' || !ev.piece || !hasBond(ctx, ev.piece.id, ps[0].bond)) return;
    ctx.incCounter('band:narant:gained', 1);
    sandDiscount(ctx, ps[0]);
  },
  onLevelUp(ctx) { sandDiscount(ctx, ps[0]); },
});

// 洛洛 自发制造 "每购买3名【维多利亚】干员，获得1件随机装备（等阶不高于当前调度中心）": every `count`-th <bond> chess bought in the
// match → `count2` random shop items of tier ≤ the 调度中心 level
K.buy_bond_char_cnt_gain_equip = (ps) => ({
  onBuy(ctx, ev) {
    const p = ps[0];
    if (ev.kind !== 'chess' || !hasBond(ctx, ev.slot.id, p.bond)) return;
    const every = Math.max(1, int(p.count, 3));
    if (ctx.incCounter('band:lolo:bought', 1) % every !== 0) return;
    for (let k = 0; k < Math.max(1, int(p.count2, 1)); k++) {
      const id = ctx.rollItem({ maxTier: Math.max(1, ctx.shopLevel()) });
      if (id) ctx.grantItem(id, { source: 'band' });
    }
  },
});

// 裁度 量体裁衣 "每回合首次主动刷新后获得1资金": in a round with round % `round` = 0, the `refresh_count`-th manual refresh of
// the round (onRefresh is the manual one; a free refresh counts) → +coin funds at once
K.n_round_refresh_cnt_gain_coin = (ps) => ({
  onRefresh(ctx) {
    const p = ps[0];
    const every = Math.max(1, int(p.round, 1));
    if (ctx.round % every !== 0) return;
    if ((ctx.roundStats().refreshes || 0) !== Math.max(1, int(p.refresh_count, 1))) return;
    const coin = int(p.coin, 0);
    if (coin > 0) ctx.addFunds(coin, 'band');
  },
});

// “追随者们” 好多委托 「被动效果：每次进入休整期时，从2个随机指令中选择1个并替换当前指令」: gain_band_skill_from_pool_in_prep
// { choice_event: skill_change_2 } — at every prep start a personal choice (the table's choice event, choiceType
// SKILL_CHANGE) between that many 指令 of the pool; the pick becomes the player's 指令 (server/match/match/bandSkill.js
// offerBandSkillChoice — the pool, the swap and what the strategy keeps). The count is the text's (no blackboard field).
K.gain_band_skill_from_pool_in_prep = (ps, bandId, stage) => ({
  onPrepStart(ctx) {
    ctx.offerBandSkillChoice({ choiceEvent: ps[0].choice_event, desc: stage?.desc ?? '', sourceBandId: bandId });
  },
});

// 规程's active 指令 (g.bandSkill, server/match/match/bandSkill.js: the gate, the target, the cost and the use limits are
// the server's; these hooks are only the effect).
// 小贾斯汀 私募基金 「点击使用：随机获得1-6资金（冷却回合数等同于获得资金）」: mingold..maxgold funds at once, and the stage's
// COOLDOWN is that many rounds [ASSUMED·서버: an even draw over the range — the roll is the server's]
K.skill_gain_gold_cd_by_gold = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0];
    const lo = Math.max(0, int(p.mingold, 1));
    const hi = Math.max(lo, int(p.maxgold, lo));
    const gold = lo + ctx.rng.int(hi - lo + 1);
    ctx.addFunds(gold, 'band');
    ev.cooldown = gold;
    ev.handled = true;
  },
});

// The other click 指令 (「点击使用」). Shared rules [ASSUMED·CN: the client's skill classes exist only in the CN client;
// the table texts say what, not these edges]: a 指令 that would do nothing (no operator card in the shop, no operator of
// the bond left, no item card) is refused and costs nothing; an operator a 指令 gives arrives as any gained operator (the
// 整备区, else the overflow — grantChess, like the strategies' other gifts), a full 整备区 refuses nothing; a shop card it
// takes is taken as it shows, as a purchase would (no free copy needed: buy's #498 rule), its slot empties (松桐); a
// 「刷新调度中心」 is the manual refresh without its price (PlayerState.effectRefresh: the freeze ends, it counts and
// dispatches as one), the 指令's 「必定包含 / 优先」 written over the new cards before anyone sees them.

/** ev.error for a 指令 that has nothing to act on (bandSkill.js returns it as it is; nothing is paid). */
const nothing = (/** @type {Record<string, any>} */ ev, /** @type {string} */ detail) => { ev.error = { error: ERR.BAD_TARGET, detail }; };

/** Take shop slot `i`'s operator card for free (its slot empties); false when it is no unsold operator card. @param {MetaCtx} ctx @param {number} i */
function takeShopChess(ctx, i) {
  const s = ctx.shopSlots()[i];
  if (!s || s.kind !== 'chess' || s.sold) return false;
  if (!ctx.grantChess(s.id, { source: 'band', requirePool: false })) return false;
  ctx.setShopSlot(i, null);
  return true;
}

// 琳琅诗怀雅 最佳品味 「随机获取当前调度中心内的1名干员」 (2级: 2名): `count` random operator cards of the shop, free
K.skill_take_shop_char = (ps) => ({
  onBandSkill(ctx, ev) {
    if (!chessSlots(ctx).length) return nothing(ev, 'no operator in the shop');
    for (let k = 0; k < Math.max(1, int(ps[0].count, 1)); k++) {
      const idx = chessSlots(ctx);
      if (!idx.length) break;
      takeShopChess(ctx, ctx.rng.pick(idx));
    }
    ev.handled = true;
  },
});

// 拜松 打包速递 「获得当前调度中心中的所有干员」: every operator card of the shop, free, left to right
K.skill_gain_all_shop_char = () => ({
  onBandSkill(ctx, ev) {
    const idx = chessSlots(ctx);
    if (!idx.length) return nothing(ev, 'no operator in the shop');
    for (const i of idx) takeShopChess(ctx, i);
    ev.handled = true;
  },
});

// 焰尾 骑士团长 · 歌蕾蒂娅 猎人战法 · 车尔尼 流动乐章 · 怒潮凛冬 无惧风雪 「获得1名【X】干员（等阶不高于当前调度中心）」: `count`
// random <bond> operators of tier ≤ the 调度中心 level from the shared pool (rollBond, copy-weighted like the shop)
K.skill_gain_bond_char = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0];
    const ids = [];
    for (let k = 0; k < Math.max(1, int(p.count, 1)); k++) { const id = rollBond(ctx, p.bond); if (id) ids.push(id); }
    if (!ids.length) return nothing(ev, 'no operator of the bond left');
    for (const id of ids) ctx.grantChess(id, { source: 'band' });
    ev.handled = true;
  },
});

// The cost keys: COST_DELTA (server/match/match/bandSkill.js adds it to the stage's skillCost; the cost never falls below 0,
// so a cut stops at the stage's cost).
export const SKILL_COST_COUNTER = 'band:skill:cost';
const cutCost = (/** @type {MetaCtx} */ ctx, /** @type {Record<string, any> | null | undefined} */ stage, /** @type {number} */ n) => {
  const base = Math.max(0, int(stage?.cost, 0));
  ctx.setCounter(SKILL_COST_COUNTER, Math.max(-base, ctx.counter(SKILL_COST_COUNTER) - Math.max(0, n)));
};
// 打包速递 / 骑士团长 「每回合休整期结束时指令消耗资金-N，使用后指令重置并可再次使用」: −delta at every prep end, back to the
// table's cost after a use
K.skill_cost_round_grow_reset_on_use = (ps, _bandId, stage) => ({
  onPrepEnd(ctx) { cutCost(ctx, stage, int(ps[0].delta, 0)); },
  onBandSkillUsed(ctx) { ctx.setCounter(SKILL_COST_COUNTER, 0); },
});
// 流动乐章 「每次使用后指令消耗资金永久+1」
K.skill_cost_grow_per_use = (ps) => ({
  onBandSkillUsed(ctx) { ctx.incCounter(SKILL_COST_COUNTER, Math.max(0, int(ps[0].count, 1))); },
});
// 无惧风雪 「每次购买【乌萨斯】干员时指令消耗资金-1，使用后指令重置并可再次使用」: a <bond> operator bought in the shop (onBuy:
// a gift or a 指令's operator is no purchase)
K.skill_cost_reduce_on_buy_bond = (ps, _bandId, stage) => ({
  onBuy(ctx, ev) {
    if (ev.kind !== 'chess' || !hasBond(ctx, ev.slot.id, ps[0].bond)) return;
    cutCost(ctx, stage, int(ps[0].count, 1));
  },
  onBandSkillUsed(ctx) { ctx.setCounter(SKILL_COST_COUNTER, 0); },
});

// 天空盒 内部货源 「下一件购买的装备价格-1（最多减至0）」: the next `times` item cards bought cost `count` less. An unused
// discount waits for the next purchase, also in a later round, and uses add up [ASSUMED·CN: the text says 「下一件」 only]
const DISCOUNT = 'band:skill:itemDiscount';
K.skill_next_equip_buy_discount = (ps) => ({
  onBandSkill(ctx, ev) {
    ctx.incCounter(DISCOUNT, Math.max(1, int(ps[0].times, 1)));
    ev.handled = true;
  },
  onPrice(ctx, ev) {
    if (ev.kind === 'item' && ctx.counter(DISCOUNT) > 0) ctx.modifyPrice(-Math.max(0, int(ps[0].count, 1)));
  },
  onBuy(ctx, ev) {
    if (ev.kind === 'item' && ctx.counter(DISCOUNT) > 0) ctx.incCounter(DISCOUNT, -1);
  },
});

/** Operator card slots of the shop now, as { i, id } (after a refresh). */
const chessCards = (/** @type {MetaCtx} */ ctx) => { const s = ctx.shopSlots(); return chessSlots(ctx).map((i) => ({ i, id: /** @type {ShopSlot} */ (s[i]).id })); };

// 雅拉 人才锁定 「刷新调度中心，必定包含1名比当前调度中心等级更高一阶（最高不超过6阶）的干员」: a refresh whose `count`
// RIGHTMOST operator cards are drawn again at tier min(6, level + lv_up) — the rightmost card, as 奇迹's guaranteed one,
// which then goes left of it (official CN recordings, maintainer decision 2026-11-22: level 6 with 奇迹 100, the two
// rightmost tier 6, the others drawn as usual). Returns the cards it fixed (effectRefresh → onRefresh `pinned`).
K.skill_refresh_shop_high_tier = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0];
    const tier = Math.min(6, Math.max(1, ctx.shopLevel()) + Math.max(1, int(p.lv_up, 1)));
    const need = Math.max(1, int(p.count, 1));
    ctx.refreshShop(() => {
      const cards = chessCards(ctx);
      let pinned = 0;
      for (const c of cards.slice(-need).reverse()) {
        const id = ctx.rollChess({ tier });
        if (!id) break;
        ctx.setShopSlot(c.i, { kind: 'chess', id });
        pinned++;
      }
      return pinned;
    });
    ev.handled = true;
  },
});

// 杜遥夜 广交豪杰 「刷新调度中心，优先刷新出1名【炎】干员」: a refresh with at least `count` <bond> cards (tier ≤ the 调度中心
// level) while the pool has them — 杜遥夜's passive rule of the default season (band_first_self_refresh_present_char)
K.skill_refresh_shop_bond_char = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0];
    const need = Math.max(1, int(p.count, 1));
    ctx.refreshShop(() => {
      const cards = chessCards(ctx);
      let have = cards.filter((c) => hasBond(ctx, c.id, p.bond)).length;
      for (const c of ctx.rng.shuffle(cards.filter((x) => !hasBond(ctx, x.id, p.bond)))) {
        if (have >= need) break;
        const id = rollBond(ctx, p.bond);
        if (!id) break;
        ctx.setShopSlot(c.i, { kind: 'chess', id });
        have++;
      }
    });
    ev.handled = true;
  },
});

// 渡桥 专享情报 「进行一次特殊刷新：此次刷新出现的干员优先为已部署在场上的干员」: a refresh whose every operator card is, while the
// pool has copies, one of the operators on the player's board (their normal ids, copy-weighted) [ASSUMED·CN: any tier —
// the text names the deployed operators, not the 调度中心 level; a card that is already one stays]
K.skill_refresh_shop_board_char = () => ({
  onBandSkill(ctx, ev) {
    const onBoard = new Set(ctx.board().filter((p) => p && p.kind === 'chess').map((p) => ctx.gd.baseIdOf(p.id)));
    ctx.refreshShop(() => {
      if (!onBoard.size) return;
      for (const c of chessCards(ctx)) {
        if (onBoard.has(ctx.gd.baseIdOf(c.id))) continue;
        const id = ctx.rollChess({ maxTier: 6, filter: (x) => onBoard.has(x) });
        if (!id) break;
        ctx.setShopSlot(c.i, { kind: 'chess', id });
      }
    });
    ev.handled = true;
  },
});

// Mechanist 精巧设计 「使调度中心出现1件新的装备并替换」: the shop's first item card (sold or not) becomes a new one of the shop's
// own draw [ASSUMED·CN: which card when the shop shows two]
K.skill_change_shop_equip = () => ({
  onBandSkill(ctx, ev) {
    const slots = ctx.shopSlots();
    const kinds = ctx.shopKinds();
    const i = kinds.indexOf('item');
    if (i < 0) return nothing(ev, 'no item card');
    const id = ctx.rollShopItem(slots[i] ? [slots[i].id] : []);
    if (!id) return nothing(ev, 'no item left');
    ctx.setShopSlot(i, { kind: 'item', id, frozen: false });
    ev.handled = true;
  },
});

// 信仰搅拌机 献身护卫 「自身目标生命值降至与场上最低的玩家相同并获得等同损失生命值的资金（至多10资金），在<休整期结束时>为该玩家回复
// 等额目标生命值」: the player's LP drops to the lowest other alive player's, it gains that many funds (at most max_count),
// and at this prep's end that player gains back the LP the player lost. Refused when no other player is lower, and while
// the alliance shares one LP (a share is no LP of its own; the custom 「共享」 for every round leaves the strategy out of the
// draft instead: shared/ruleset.js OWN_LP_BAND_SKILLS). [ASSUMED·CN: 「等额」 = the LP lost, not the capped funds; a
// tie for the lowest goes to the first seat]
const DEVOTE_SEAT = 'band:skill:devoteSeat';
const DEVOTE_LP = 'band:skill:devoteLp';
K.skill_drop_hp_to_low_gain_coin = (ps) => ({
  onBandSkill(ctx, ev) {
    if (ctx.lpShared()) return nothing(ev, 'shared LP');
    let low = null;
    for (const o of ctx.teammates()) if (!low || o.lp() < low.lp() || (o.lp() === low.lp() && o.seat < low.seat)) low = o;
    const lost = low ? ctx.lp() - low.lp() : 0;
    if (!(lost > 0)) return nothing(ev, 'no lower player');
    ctx.addLp(-lost);
    ctx.addFunds(Math.min(lost, Math.max(0, int(ps[0].max_count, 10))), 'band');
    ctx.setCounter(DEVOTE_SEAT, /** @type {MetaCtx} */ (low).seat + 1); // lost > 0: a lower player
    ctx.incCounter(DEVOTE_LP, lost);
    ev.handled = true;
  },
  onPrepEnd(ctx) {
    const seat = ctx.counter(DEVOTE_SEAT) - 1;
    const lp = ctx.counter(DEVOTE_LP);
    ctx.setCounter(DEVOTE_SEAT, 0);
    ctx.setCounter(DEVOTE_LP, 0);
    if (seat < 0 || !(lp > 0)) return;
    const to = ctx.teammates().find((o) => o.seat === seat);
    if (to) to.addLp(lp);
  },
});

// The drag 指令 (「拖拽使用」) on an operator of the player (COMMON_CHESS CHAR: on the board or in the 整备区 — the
// official drag hint 「请指向战场或整备区的干员」) or on an operator card of the shop (SHOP_SLOT CHAR). The target is
// bandSkill.js's (ev.target), checked again here only for what the effect needs. The shared rules of the click 指令 hold
// (a 指令 with nothing to act on is refused and costs nothing) [ASSUMED·CN: the client's skill classes exist only in the CN
// client; the table texts say what, not these edges].

/** The target operator of a COMMON_CHESS 指令 (its view), or null. */
const targetChess = (/** @type {MetaCtx} */ ctx, /** @type {Record<string, any>} */ ev) => {
  const v = ev.target && ev.target.kind === 'chess' ? ctx.piece(ev.target.uid) : null;
  return v && v.kind === 'chess' ? v : null;
};
/** The target card of a SHOP_SLOT 指令 ({ i, id, tier }), or null. */
const targetCard = (/** @type {MetaCtx} */ ctx, /** @type {Record<string, any>} */ ev) => {
  if (!ev.target || ev.target.kind !== 'shop') return null;
  const s = ctx.shopSlots()[ev.target.slot];
  return s && s.kind === 'chess' && !s.sold ? { i: ev.target.slot, id: s.id, tier: ctx.gd.tierOf(s.id) } : null;
};
/** Does the operator have a 特质 of `event` that runs where it stands (a hand piece skips the board-only ones)? */
const hasTrait = (/** @type {MetaCtx} */ ctx, /** @type {Record<string, any>} */ v, /** @type {string} */ event) => ctx.garrisonsOf(v.uid)
  .some((/** @type {Record<string, any>} */ g) => g.eventType === event && !(v.area !== 'board' && g.bbStr.conditionkey === 'character_target_inboard'));

// 望 黑白相易 「选择一名我方干员移除，获得1名不高于该干员等阶的【炎】干员」 (in_shop 0): the operator is destroyed — no sale, no
// funds, its equipment back to the 整备区, its copies back to the pool (ctx.destroyPiece) — and a random <bond> operator of
// tier ≤ its tier is gained (copy-weighted, an elite counting its own tier).
// 引星棘刺 出航时刻 「选择一名调度中心内的干员，使其替换为不高于该干员等阶的【伊比利亚】干员」 (in_shop 1): the card becomes one of a
// random <bond> operator of tier ≤ the card's, no longer frozen (maintainer decision 2026-11-20, as 纸片替身 below).
K.skill_remove_gain_bond_char = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0];
    if (int(p.in_shop, 0) > 0) {
      const c = targetCard(ctx, ev);
      if (!c) return nothing(ev, 'no operator card');
      const id = ctx.rollChess({ bond: p.bond, maxTier: c.tier });
      if (!id) return nothing(ev, 'no operator of the bond left');
      ctx.setShopSlot(c.i, { kind: 'chess', id, frozen: false });
      ev.handled = true;
      return;
    }
    const v = targetChess(ctx, ev);
    if (!v) return nothing(ev, 'no operator');
    const id = ctx.rollChess({ bond: p.bond, maxTier: Math.max(1, v.tier ?? 1) });
    if (!id) return nothing(ev, 'no operator of the bond left');
    ctx.destroyPiece(v.uid);
    ctx.grantChess(id, { source: 'band' });
    ev.handled = true;
  },
});

// 风丸 纸片替身 「选择一名调度中心内的干员，使其变为相同等阶的随机干员」: the card becomes a random other operator of the same tier
// (copy-weighted; refused when the tier has no other one left). A frozen card's freeze ends with it (the official game, a
// maintainer report 2026-11-20; setShopSlot alone would keep it).
K.skill_transform_char_same_tier = () => ({
  onBandSkill(ctx, ev) {
    const c = targetCard(ctx, ev);
    if (!c) return nothing(ev, 'no operator card');
    const base = ctx.gd.baseIdOf(c.id);
    const id = ctx.rollChess({ tier: c.tier, filter: (x) => x !== base });
    if (!id) return nothing(ev, 'no other operator of the tier');
    ctx.setShopSlot(c.i, { kind: 'chess', id, frozen: false });
    ev.handled = true;
  },
});

// 但书 条文修正 「使该干员已激活的所有盟约层数+9」: every active bond the operator counts for (its own and those its equipment
// gives: metaBonds) gains initial_count layers — + delta_count for every n earlier uses, at most max_count (9, 0, 1, 9 in
// the table: always 9) [ASSUMED·CN: the growth keys' reading; refused when none of its bonds is active]
const BOND_USES = 'band:skill:bondUses';
K.skill_act_bond_grow_garr_cnt = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0];
    const v = targetChess(ctx, ev);
    if (!v) return nothing(ev, 'no operator');
    const bonds = metaBonds(ctx, v).filter((b) => ctx.bondActive(b));
    if (!bonds.length) return nothing(ev, 'no active bond');
    const uses = ctx.counter(BOND_USES);
    const step = Math.floor(uses / Math.max(1, int(p.n, 1))) * int(p.delta_count, 0);
    const max = int(p.max_count, Infinity);
    const n = Math.min(Number.isFinite(max) && max > 0 ? max : Infinity, int(p.initial_count, 0) + step);
    for (const b of bonds) ctx.addLayers(b, n, { requireActive: true, reason: 'band' });
    ctx.incCounter(BOND_USES, 1);
    ev.handled = true;
  },
});

// 苏苏洛 强制休整 「使该干员的<休整期结束时>类特质本回合可以额外触发一次」: at this round's prep end, the operator's 特质 of
// bbStr.event (SERVER_PREP_FIN) run `count` more times, after the strategy's own prep-end turn and before the 特质' own
// (the dispatch order: band → bonds → garrisons) [ASSUMED·CN: the order of the extra run; an operator sold or merged
// before the prep end loses it]. Refused when the operator has no such 特质 that runs where it stands.
const EXTRA_EXEC = 'band:skill:extraExec:';
K.skill_garr_event_extra_exec = (ps) => ({
  onBandSkill(ctx, ev) {
    const v = targetChess(ctx, ev);
    if (!v) return nothing(ev, 'no operator');
    if (!hasTrait(ctx, v, ps[0].event)) return nothing(ev, 'no trait of the event');
    ctx.incCounter(`${EXTRA_EXEC}${v.uid}`, Math.max(1, int(ps[0].count, 1)));
    ctx.setCounter(`${EXTRA_EXEC}r`, ctx.round);
    ev.handled = true;
  },
  onPrepEnd(ctx) {
    if (ctx.counter(`${EXTRA_EXEC}r`) !== ctx.round) return;
    ctx.setCounter(`${EXTRA_EXEC}r`, 0);
    for (const v of [...ctx.board(), ...ctx.hand()]) {
      if (!v || v.kind !== 'chess') continue;
      const k = `${EXTRA_EXEC}${v.uid}`;
      const n = ctx.counter(k);
      if (!(n > 0)) continue;
      ctx.setCounter(k, 0);
      const at = ctx.piece(v.uid);
      if (!at || !hasTrait(ctx, at, ps[0].event)) continue;
      for (let i = 0; i < n; i++) ctx.triggerGarrisons(v.uid, ps[0].event);
    }
  },
});

// 铃兰 御守之力 「选择一名我方干员，触发该干员的<获得时>类特质」: the operator's 特质 of bbStr.event (SERVER_GAIN) run `count`
// times now, as 铃兰's passive of the default season runs them (ctx.triggerGarrisons; 投资人 multiplies a SERVER_GAIN as
// always). Refused when it has no such 特质.
K.skill_trigger_garr_event = (ps) => ({
  onBandSkill(ctx, ev) {
    const v = targetChess(ctx, ev);
    if (!v) return nothing(ev, 'no operator');
    if (!hasTrait(ctx, v, ps[0].event)) return nothing(ev, 'no trait of the event');
    for (let i = 0; i < Math.max(1, int(ps[0].count, 1)); i++) ctx.triggerGarrisons(v.uid, ps[0].event);
    ev.handled = true;
  },
});

// 夕 幻画为真 「选择一名我方干员，获得他的复制体，包括精锐状态和携带的装备」: a copy of the operator (its elite id when it is one,
// past the stock as 投影 makes one) is gained like any gained operator, then a copy of each of its items is gained and put
// on it without equip effects — the default season's 复制 trap (builtinMeta.js trap_copy_front_char), same rules [ASSUMED·CN:
// the item copies take the shared equipment stock like that trap's; a copy that completes a merge is merged as usual — a
// mergeable item meets the original's copy and becomes the 进阶 one, which the copy then wears]
K.skill_copy_char_with_equip = () => ({
  onBandSkill(ctx, ev) {
    const v = targetChess(ctx, ev);
    if (!v) return nothing(ev, 'no operator');
    const copy = ctx.grantChess(v.id, { source: 'band', requirePool: false });
    if (!copy) return nothing(ev, 'no copy');
    for (const it of v.items || []) {
      const item = ctx.grantItem(it.id, { source: 'band' });
      if (item) ctx.equipDirect(item.uid, copy.uid);
    }
    ev.handled = true;
  },
});

// 缪尔赛思 至纯凝结 「立即使该干员晋升为精锐干员」: the operator becomes its elite in place (PlayerState.promote, as 升华 does —
// no merge, so no 晋升奖励 offer) [ASSUMED·CN: whether this 晋升 brings the merge's reward]. Refused for an elite.
K.skill_upgrade_char = () => ({
  onBandSkill(ctx, ev) {
    const v = targetChess(ctx, ev);
    if (!v) return nothing(ev, 'no operator');
    if (v.golden || !ctx.gd.goldenIdOf(v.id)) return nothing(ev, 'already elite');
    if (!ctx.promote(v.uid)) return nothing(ev, 'no elite');
    ev.handled = true;
  },
});

// 三船光平 东之极道 「将其出售并为所有已激活盟约叠加等同于该干员等阶的层数」: the operator is sold as the sell intent sells it (its
// price, onSold: 出售时 特质, 巫恋…), then every bond active after the sale gains its tier in layers [ASSUMED·CN: the bonds
// active after the sale — one the sale deactivates gains none]
K.skill_sell_char_bond_layer = () => ({
  onBandSkill(ctx, ev) {
    const v = targetChess(ctx, ev);
    if (!v) return nothing(ev, 'no operator');
    const tier = Math.max(1, v.tier ?? 1);
    if (!ctx.sell(v.uid)) return nothing(ev, 'not sold');
    for (const [b, st] of Object.entries(ctx.bonds())) if (st && st.active) ctx.addLayers(b, tier, { requireActive: true, reason: 'band' });
    ev.handled = true;
  },
});

// 昆图斯 不稳定要素 「立即使其变为更高一阶的随机干员（最高不超过6阶）」: 突变细胞's transformation (builtinMeta.js
// char_chess_transformation_equip, PlayerState.transformChess): the operator is destroyed and a random normal operator of
// tier min(6, its tier + 1) is gained in its place in the 整备区 [ASSUMED·CN: as 突变细胞 — an elite becomes a normal one,
// the tile is freed]
K.skill_transform_char_up_tier = () => ({
  onBandSkill(ctx, ev) {
    const v = targetChess(ctx, ev);
    if (!v) return nothing(ev, 'no operator');
    const id = ctx.rollChess({ tier: Math.min(6, Math.max(1, v.tier ?? 1) + 1) });
    if (!id) return nothing(ev, 'no operator of the tier left');
    if (!ctx.transform(v.uid, ctx.gd.baseIdOf(id))) return nothing(ev, 'not transformed');
    ev.handled = true;
  },
});

// The drag 指令 whose effect waits for the next battle (「下次战斗开始时」 / 「下场战斗」): the use leaves a mark — a hidden
// persistent effect BAND_MARK of the player, `data` { round, bandId, effectId, uid | itemId, capAdd? } — that the
// player's battle input of the same round carries (server/match/player/round.js battleInput `bandMarks`; the 联防 field
// is no next battle of its own [ASSUMED·CN]) and bands/battle.js runs. The mark is gone at the next round start
// (BAND_MARK_EFFECT): one battle. A marked operator that is not on the field when the battle starts (sold, merged, in the
// 整备区) gets nothing [ASSUMED·CN].
export const BAND_MARK = 'effect:band_mark';
const MARK_SEQ = 'band:mark:n';
/** @param {MetaCtx} ctx @param {Record<string, any>} ev @param {Record<string, any>} data */
function addMark(ctx, ev, data) {
  const n = ctx.incCounter(MARK_SEQ, 1);
  ctx.addEffect({
    id: `band:mark:${ctx.round}:${n}`, key: BAND_MARK, hidden: true, battle: false, iconKind: 'band',
    data: { round: ctx.round, bandId: ev.bandId, ...data },
  });
  ev.handled = true;
}
/** The persistent effect of a mark: dropped at the first round start after its round. @type {MetaHandlers} */
export const BAND_MARK_EFFECT = {
  onRoundStart(ctx) {
    const ref = ctx.source && ctx.source.ref;
    if (ref && !(ref.data && ref.data.round >= ctx.round)) ctx.removeEffect(ref.id);
  },
};

// 百炼嘉维尔 意志鼓舞 (eff_band12) · 大嘴莫布 全场聚焦 (eff_band14, bbStr cond "gold": refused for an elite or an operator
// without one [ASSUMED·CN]) · 桑葚 药枚实验 (eff_band17 / eff_band18 by its stage) · Misery 消解空间 (eff_band22):
// skill_mark_char_inst_tag { tag } marks the operator with the effect `tag`; the battle runs its buff (bands/battle.js
// MARK_BY_KEY; 全场聚焦's auto_chess_battle_chess_upgrade is the battle input's: the operator fights as its elite).
/** The bbStr.cond values skill_mark_char_inst_tag reads; a mark under any other is refused (content/coverage.js). */
export const MARK_CONDS = Object.freeze(['gold']);
K.skill_mark_char_inst_tag = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0];
    const v = targetChess(ctx, ev);
    if (!v) return nothing(ev, 'no operator');
    const tag = typeof p.tag === 'string' && p.tag ? p.tag : null;
    if (!tag || !ctx.gd.effect(tag)) return nothing(ev, 'no effect');
    if (p.cond != null && p.cond !== '' && !MARK_CONDS.includes(p.cond)) return nothing(ev, 'unknown condition');
    if (p.cond === 'gold' && (v.golden || !ctx.gd.goldenIdOf(v.id))) return nothing(ev, 'already elite');
    addMark(ctx, ev, { effectId: tag, uid: v.uid });
  },
});

// 坚雷 正直教官 「使其在下场战斗中卫戍能力的叠层上限提升，数量等同于当前回合数」: the operator's 特质 caps (the per-battle
// layer caps, garrisons/effects/triggered.js capOf) + the round of the use in its next battle.
K.skill_layer_limit_grow_round = () => ({
  onBandSkill(ctx, ev) {
    const v = targetChess(ctx, ev);
    if (!v) return nothing(ev, 'no operator');
    addMark(ctx, ev, { effectId: ev.effectId, uid: v.uid, capAdd: ctx.round });
  },
});

// 布丁 电气化！ 「选择调度中心的一件装备使其立刻销毁，并在下次战斗开始时使场上所有还有空栏位的干员暂时获得该装备直到战斗结束（无法对
// <装备时销毁>的装备使用）」: skill_mark_shop_equip_tag { tag: eff_band24 } — the 调度中心's item card is gone at once (its slot
// empty; no copy left the stock, as an unbought card), and the next battle gives that item to every operator on the field
// with a free slot (the battle input's: gamedata equipSlotsOf). Refused for a consume-on-equip item (装备时销毁) and for
// what is no equipment.
K.skill_mark_shop_equip_tag = (ps) => ({
  onBandSkill(ctx, ev) {
    const t = ev.target && ev.target.kind === 'shop' ? ev.target : null;
    const s = t ? ctx.shopSlots()[t.slot] : null;
    if (!s || s.kind !== 'item' || s.sold) return nothing(ev, 'no item card');
    const rec = ctx.gd.item(s.id);
    if (!rec || rec.itemType !== 'EQUIP') return nothing(ev, 'not equipment');
    if (typeof rec.kind === 'string' && rec.kind.startsWith('consume_on_equip')) return nothing(ev, 'consumed on equip');
    const tag = typeof ps[0].tag === 'string' && ps[0].tag ? ps[0].tag : ev.effectId;
    if (!ctx.setShopSlot(t.slot, null)) return nothing(ev, 'not removed');
    addMark(ctx, ev, { effectId: tag, itemId: s.id });
  },
});

// The two MAP_TILE 指令 (target { kind: 'tile', row, col }: board coordinates — the battle maps them onto its field as it
// maps the pieces; the tile check is match/bandSkill.js _bandSkillTile).
const targetTile = (/** @type {Record<string, any>} */ ev) => (ev.target && ev.target.kind === 'tile' && Number.isInteger(ev.target.row) && Number.isInteger(ev.target.col) ? ev.target : null);

// 妮芙 溃心领域 「选择一个可用地块，战斗开始后首次经过该地块的敌人获得恐惧，持续3秒」: skill_mark_pos_grow_use_cnt { tag: eff_band19 } —
// a mark on the tile for the round's battle (addMark, row / col); its uses per round grow by the stage (第4、8、12回合时升级,
// the stages' ROUND_RESET counts — use_count / add_count are 0 in every stage). The battle runs eff_band19's buff
// (bands/battle.js TILE_MARK_BY_KEY). Two uses may mark the same tile [ASSUMED·CN: nothing in the text refuses it].
K.skill_mark_pos_grow_use_cnt = (ps) => ({
  onBandSkill(ctx, ev) {
    const t = targetTile(ev);
    if (!t) return nothing(ev, 'no tile');
    const tag = typeof ps[0].tag === 'string' && ps[0].tag ? ps[0].tag : null;
    if (!tag || !ctx.gd.effect(tag)) return nothing(ev, 'no effect');
    addMark(ctx, ev, { effectId: tag, row: t.row, col: t.col });
  },
});

// 寻宝人 宝藏探机 「选择一个可用地块，部署1个“模拟宝藏”…“模拟宝藏”：被敌人触碰就会永久消失，战斗结束时若仍存在则获得额外1资金」:
// skill_add_pos_effect_enemy { coin, enemy_id: enemy_9038_achest }. The enemy record's lines say what the chest is: 「友方单位」,
// 「只能部署在可通行地面，并使所在格无法部署」 (PASSABLE_AND_BUILDABLE, and its prefab's achest[tile_buildable] rewrites its tile to
// buildable NONE while it lives), 「被敌人触碰后永久消失」, 「战斗结束后提供1资金」. So a use leaves a chest on the tile — a hidden
// persistent effect BAND_CHEST of the player, `data` { row, col, enemyId, coin } — that stays from battle to battle until an
// enemy touches it: the tile takes no piece meanwhile (PlayerState.deployMap), every battle of the player's own round
// fields it (battle input `bandChests`, bands/battle.js installChests), a battle that ends with it standing pays `coin`,
// and a battle in which it was touched reports it gone (result `bandChestsGone`) — the effect is removed at that
// result (BAND_CHEST_EFFECT). [ASSUMED·CN: the chest stays across battles — read from 「永久消失」 and the undeployable tile
// the record names; not in a 联防 battle (no battle of the player's own field), as the marks.]
export const BAND_CHEST = 'effect:band_chest';
const CHEST_SEQ = 'band:chest:n';
K.skill_add_pos_effect_enemy = (ps) => ({
  onBandSkill(ctx, ev) {
    const t = targetTile(ev);
    if (!t) return nothing(ev, 'no tile');
    const p = ps[0];
    const enemyId = typeof p.enemy_id === 'string' && p.enemy_id ? p.enemy_id : null;
    if (!enemyId) return nothing(ev, 'no enemy id');
    const n = ctx.incCounter(CHEST_SEQ, 1);
    ctx.addEffect({
      id: `band:chest:${n}`, key: BAND_CHEST, hidden: true, battle: false, iconKind: 'band',
      data: { round: ctx.round, bandId: ev.bandId, effectId: ev.effectId, row: t.row, col: t.col, enemyId, coin: Math.max(0, Math.floor(num(p.coin, 0))) },
    });
    ev.handled = true;
  },
});
/** The persistent effect of a chest: gone after a battle result that reports it touched. @type {MetaHandlers} */
export const BAND_CHEST_EFFECT = {
  onBattleResult(ctx, ev) {
    const ref = ctx.source && ctx.source.ref;
    const gone = ev && ev.result && Array.isArray(ev.result.bandChestsGone) ? ev.result.bandChestsGone : null;
    if (ref && gone && gone.includes(ref.id)) ctx.removeEffect(ref.id);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// 鸭爵 “神秘顾客”: "从第5回合起，你和队友遭遇的部分敌人可能会替换为<鸭爵><高普尼克><流泪小子><圆仔>，击倒这些敌人者获得1资金奖励
// （包括联防阶段）". A global handler rewrites the battle spawn list of every alive player while the band is held by that
// player or a teammate: from round `round`, in the normal battle, the Final Assault and the Hidden Core (PRTS 卫戍协议：盟约
// 下半/PRTS盟约记录 鸭爵 备注 "每回合将有0~2名敌人被替换为上述敌人之一…且在最终回合和隐秘核心回合中仍然生效"; the 联防 phase
// replaces nothing: its enemies are leaks, which keep their bounty). The number of swaps, min..max (0–2, uniform
// [ASSUMED]), is rolled once per round and shared by every player (the key's `all_player`; PRTS 「每回合将有0~2名敌人被
// 替换」; upstream #839, whose official recordings show the four players with the same count): a stream of its own from
// the match seed and the round (ctx.sharedRng('duck:<round>')), so the previews and the bot rehearsals see the same
// count and no player's meta stream moves. Each player then rolls one of the four for all of its swaps (「替换为上述敌人
// 之一」; the same recordings show different kinds between players — maintainer decision 2026-10-29) and picks its own
// units: that many of the player's ground enemies from the `minweight`–`maxweight` share of the player's enemies (time
// order) [ASSUMED reading of the two weights] on the **lower lane** only — a route starting at the lower gate
// (shared/constants.js gateOf: normal fields (9,10), not (12,10); leader fields their rows), the report's 「总在下路」 read
// off the reporter's three recordings of the official game (upstream #839; upstream ded5f264 took it, maintainer decision
// 2026-11-07; not seen on an official screen here) — any wave enemy but the leader, its parts, bounties, earlier swaps
// and uncounted units; a player with fewer candidates than the count swaps fewer. Elites are eligible
// too [ASSUMED: the text names no rank; one rule for every battle; about two thirds of the leader rounds' escorts in that
// share are elites, so a NORMAL-only rule would leave most Final Assault halves without a candidate — ≈ 80 % instead of
// ≈ 36 % of the R14 pair-field halves over 40 seeds]. Flyers are never swapped [ASSUMED: the four are ground units and a
// FLY action's route is a FLY route]. A swapped unit becomes a random enemylist enemy (the act2 `_2` versions) at the
// replaced unit's time and route, worth DUCK_COINS to its killer (bounty, also in 联防). A pair boss field has one spawn
// list that its two players' handlers edit in turn; each player's 0–2 come from the enemies whose route ends on that
// player's half (`ev.side` + `ev.routes`, the half rule of the field's bounties, server/match/waves.js routeByMotion), the
// share taken over that half [ASSUMED: "你和队友遭遇的敌人" — the enemies heading for the player's own protection point;
// each official client simulates its own battle, docs/research/08 appendix A]. The originals never exist, so none of
// their death / kill / leak effects happen. Reaching the protection point costs 1 LP ("但进入保护目标点将减少1点目标生命值":
// the enemies' data lpr, tools/build-data.mjs). The swaps carry the spawn tag 'duck': their 隐匿 (流泪小子) comes back no
// sooner than 1 s after a block ends, not the official 0 s (content/enemies/helpers.js DUCK_STEALTH_RESTORE — the owner's
// decision of 2026-10-07, a deliberate deviation).

export const DUCK_BAND = 'band_ducklord';
/** "击倒这些敌人者获得1资金奖励" (the blackboard's `count` is 1 too). */
export const DUCK_COINS = 1;
/** Battle kinds the swap applies to (PRTS: the Final Assault and the Hidden Core too). */
const DUCK_KINDS = new Set(['normal', 'boss', 'hidden']);
/** Boss-field column between the left ('L') and the right ('R') player's half (the goals are at cols 2–3 / 17). */
const BOSS_MID_COL = (GEO.BOSS_RECT.c0 + GEO.BOSS_RECT.c1) / 2;

/** @param {MetaCtx} ctx */
function duckParams(ctx) {
  for (const b of buffsOf(bandRecord(DUCK_BAND, ctx))) if (b.key === 'round_start_all_player_change_enemy_2') return b.p;
  return null;
}

/**
 * The round's swap count, min..max (exported for tests); `rng` is the round's shared stream (duckGlobal).
 * @param {MetaCtx['rng']} rng @param {Record<string, any>} p
 */
export function duckCount(rng, p) {
  const lo = Math.max(0, int(p.min, 0)), hi = Math.max(lo, int(p.max, lo));
  return lo + rng.int(hi - lo + 1);
}

/**
 * Rewrite `spawns` in place (exported for tests). Returns the replaced spawn specs. `want`: the round's shared count
 * (default: rolled from ctx.rng). `side` ('L' | 'R', a pair boss field) limits the swap to the spawns whose route
 * (`routes[routeIndex]`) ends on that half of the field.
 * @param {MetaCtx} ctx @param {Array<SpawnSpec | null>} spawns @param {Record<string, any>} p @param {string} ownerPlayerId
 * @param {{ routes?: Array<Record<string, any> | null> | null, side?: string | null, want?: number | null, leader?: boolean }} [opts]
 */
export function duckReplace(ctx, spawns, p, ownerPlayerId, { routes = null, side = null, want = null, leader = false } = {}) {
  const gd = ctx.gd;
  const ducks = list(p.enemylist).filter((k) => gd.enemy(k));
  if (!ducks.length || !Array.isArray(spawns)) return [];
  if (want == null) want = duckCount(ctx.rng, p);
  if (want <= 0) return [];
  const half = side === 'L' || side === 'R';
  const onHalf = (/** @type {SpawnSpec} */ s) => {
    if (!half) return true;
    const r = Array.isArray(routes) ? routes[s.routeIndex] : null;
    const c = r && Array.isArray(r.end) ? Number(r.end[1]) : NaN;
    return side === 'R' ? c > BOSS_MID_COL : c < BOSS_MID_COL;
  };
  // one entry per enemy of the player (split multi-count specs), in spawn-time order
  const flat = [];
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[i];
    if (!s || !onHalf(s)) continue;
    const cnt = Math.max(1, int(s.count, 1));
    for (let k = 0; k < cnt; k++) flat.push({ i, k, t: num(s.time, 0) + k * num(s.interval, 0) });
  }
  flat.sort((a, b) => a.t - b.t || a.i - b.i || a.k - b.k);
  const w0 = num(p.minweight, 0), w1 = num(p.maxweight, 1);
  const n = flat.length;
  const ok = flat.filter((f, j) => {
    const s = /** @type {SpawnSpec} */ (spawns[f.i]); // flat holds the spawns kept
    const e = gd.enemy(s.enemyKey);
    const frac = n > 1 ? j / (n - 1) : 0;
    // the lower lane only: a route starting at the lower gate (gateOf; no route known → every lane, as before)
    const route = Array.isArray(routes) ? routes[s.routeIndex] : null;
    return !s.tag && s.countInTotal !== false && e && e.rank !== 'BOSS' && !e.notCountInTotal && e.stats?.motion !== 'FLY'
      && frac >= w0 - 1e-9 && frac <= w1 + 1e-9 && gateOf(route?.start, leader) === 'lower';
  });
  const picked = ctx.rng.shuffle(ok).slice(0, want);
  if (!picked.length) return [];
  const enemyKey = ctx.rng.pick(ducks); // one of the four for all of this player's swaps
  const byIdx = new Map();
  for (const f of picked) { if (!byIdx.has(f.i)) byIdx.set(f.i, new Set()); byIdx.get(f.i).add(f.k); }
  const out = [];
  const add = [];
  for (const [i, ks] of byIdx) {
    const s = /** @type {SpawnSpec} */ (spawns[i]); // picked from flat
    const cnt = Math.max(1, int(s.count, 1));
    const keep = cnt - ks.size;
    for (const k of ks) {
      const d = {
        ...s, mods: s.mods ? { ...s.mods } : undefined, count: 1, interval: 0,
        time: num(s.time, 0) + k * num(s.interval, 0), enemyKey, tag: 'duck',
        bounty: { coins: DUCK_COINS, ownerPlayerId },
      };
      if (d.mods) delete d.mods.slot;
      add.push(d);
      out.push(d);
    }
    if (keep <= 0) spawns[i] = null;
    else if (ks.size) {
      // keep the unreplaced copies of a multi-count spec as single specs at their original times
      const rest = [];
      for (let k = 0; k < cnt; k++) if (!ks.has(k)) rest.push({ ...s, mods: s.mods ? { ...s.mods } : undefined, count: 1, interval: 0, time: num(s.time, 0) + k * num(s.interval, 0) });
      spawns[i] = null;
      add.push(...rest);
    }
  }
  for (let i = spawns.length - 1; i >= 0; i--) if (spawns[i] == null) spawns.splice(i, 1);
  spawns.push(...add);
  return out;
}

/** @type {MetaHandlers} */
const duckGlobal = {
  onBattleStart(ctx, ev) {
    if (!ev || !DUCK_KINDS.has(ev.kind) || !Array.isArray(ev.spawns)) return;
    const p = duckParams(ctx);
    if (!p || ctx.round < int(p.round, 1)) return;
    // the strategy, or its 指令 taken by a teammate or the player (更换指令: commandBandId) — one team swap either way
    const holds = (/** @type {MetaCtx} */ c) => c.bandId() === DUCK_BAND || c.commandBandId?.() === DUCK_BAND;
    const held = holds(ctx) || ctx.teammates().some(holds);
    if (!held) return;
    const want = duckCount(ctx.sharedRng(`duck:${ctx.round}`), p);
    duckReplace(ctx, ev.spawns, p, ctx.playerId, { routes: ev.routes, side: ev.side, want, leader: ev.kind !== 'normal' });
  },
};

// ---------------------------------------------------------------------------------------------------------------

/** Merge hook objects (same hook → called in order). @param {MetaHandlers[]} parts @returns {MetaHandlers} */
function merge(parts) {
  /** @type {Record<string, MetaHook>} */
  const out = {};
  for (const h of parts) {
    for (const [name, fn] of Object.entries(h)) {
      if (typeof fn !== 'function') continue;
      const prev = out[name];
      out[name] = prev ? function merged(ctx, ev) { prev(ctx, ev); fn(ctx, ev); } : fn;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// 规程's 指令 stages (bands.json `skills`): a strategy runs the effect of its current stage; a stage's `next` names the
// condition that moves it on — the round (band_skill_load_by_round), the 调度中心 level (…_by_shop_lv), the funds spent in
// the match (…_by_coin_cost: PlayerState.stats.gold, every payment), the counted members of a bond (…_by_bond_act_count:
// 「【伊比利亚】盟约激活人数达到4」 — the bond's activation count). The stage is the player's counter STAGE_COUNTER (index
// into `skills`), checked before every prep hook of the strategy, so it moves on at the first hook after the condition
// holds — the level-up, the payment, the round start, the bond change [ASSUMED·화면: 공식 지령 칸이 단계를 바꾸는 순간 미확인]
// — and never moves back. The battle runs the buffs of the stage reached (the battle input's `bandStage`,
// server/match/player/round.js; bands/battle.js bandBattleBuffs).

export const STAGE_COUNTER = 'band:stage';
/**
 * The stage counter of a 指令 taken from another strategy (PlayerState.bandCommand: “追随者们” 好多委托, 投机骰子 — server/
 * match/match/bandSkill.js setBandCommand): its own, so a staged strategy of the player (华法琳) keeps its stage.
 */
export const COMMAND_STAGE_COUNTER = 'band:cmd:stage';
/**
 * The registry keys of a 规程 strategy beside its whole handler `band:<id>`: `band:<id>#command` — staged on
 * COMMAND_STAGE_COUNTER, run when another player's 指令 is this one: for a strategy with an ACTIVE stage the hooks of the
 * buffs that are its 指令 (a handler with onBandSkill / onBandSkillUsed: the effect and its cost keys), for a passive
 * strategy all of it (its passive is its 指令) —, and for a strategy with an ACTIVE stage `band:<id>#passive` — the rest
 * (Mechanist's 精巧设计 passive), run for the strategy's owner while its 指令 is another's.
 */
export const bandCommandKey = (/** @type {string} */ bandId) => `band:${bandId}#command`;
export const bandPassiveKey = (/** @type {string} */ bandId) => `band:${bandId}#passive`;
/** Does the strategy record have an ACTIVE stage (an active 指令)? */
export const hasActiveStage = (/** @type {Record<string, any> | null | undefined} */ rec) => bandStages(rec).some((s) => s && s.type === 'ACTIVE');
/**
 * Is the strategy a 规程 one with a 指令 (bands.json `skills`: active or passive stages) — one 更换指令 may offer? The
 * default season's strategies have no `skills` and no 指令.
 */
export const hasCommandStages = (/** @type {Record<string, any> | null | undefined} */ rec) => !!rec && Array.isArray(rec.skills) && rec.skills.length > 0;
/** The buff key of “追随者们” 好多委托 (the 指令 that opens 更换指令 itself: never in its pool). */
export const COMMAND_CHOICE_KEY = 'gain_band_skill_from_pool_in_prep';
/** A strategy's bond-direction swap (变约): its owner's only, never part of a 指令 taken from it (bonds/dispatch.js). */
export const BOND_SWAP_KEY = 'auto_chess_effect_replace';
/**
 * Passive keys that act once for the whole team however many hold them (Touch 外勤医疗's map character on every field,
 * 鸭爵 神秘顾客's swaps): a 指令 of them adds nothing while a teammate holds one.
 */
export const TEAM_UNIQUE_KEYS = Object.freeze(['auto_chess_change_map', 'round_start_all_player_change_enemy_2']);
/** Passive keys that act in one fixed round each (their blackboard `round`) and never after it. */
const FIXED_ROUND_KEYS = new Set([
  'preparation_start_gain_chess_from_round', 'prep_start_random_equip_in_round', 'give_coin_in_round',
  'prep_start_gain_chess_from_pool_in_round', 'round_start_bond_check_gain_layer',
]);
/**
 * Would taking stage `stage` as a 指令 in round `round` still do something? An active stage always (it is used); a
 * passive one when one of its buffs — the bond-direction swap left out — is not a fixed-round gift, or is one of a
 * later round (the offer opens in prep, after this round's income, round start and prep start ran). An empty passive
 * (歌利亚 坚不可摧: its effect is the match's starting target HP) does nothing. [ASSUMED·서버: the pool has no table]
 * @param {Record<string, any> | null | undefined} stage @param {number} round
 */
export function commandStageActs(stage, round) {
  if (!stage) return false;
  if (stage.type === 'ACTIVE' || stage.type === 'NONE') return true;
  const buffs = buffsOf(stage).filter((b) => b.key !== BOND_SWAP_KEY);
  return buffs.some((b) => !FIXED_ROUND_KEYS.has(b.key) || int(b.p.round, -1) > round);
}
const COMMAND_HOOKS = ['onBandSkill', 'onBandSkillUsed'];
const isCommandPart = (/** @type {MetaHandlers | null | undefined} */ h) => !!h && COMMAND_HOOKS.some((n) => typeof h[n] === 'function');
/** The hooks a staged strategy listens on to move its stage (besides those its stages use). */
const STAGE_HOOKS = ['onRoundStart', 'onPrepStart', 'onLevelUp', 'onSpend', 'onGain', 'onBuy', 'onSold', 'onMerge', 'onActiveBonds', 'onPrepEnd'];

/**
 * The strategy's stages: bands.json `skills` (规程), else its own buffs as its one stage.
 * @param {Record<string, any> | null | undefined} rec @returns {Record<string, any>[]}
 */
export function bandStages(rec) {
  if (!rec) return [];
  if (Array.isArray(rec.skills) && rec.skills.length) return rec.skills;
  return [{ effectId: rec.effectId ?? null, desc: rec.desc ?? '', buffs: rec.buffs ?? [], next: null }];
}

/**
 * The `next.unlockType` values stageUnlocked and bands/progress.js stageUnlock read; a stage behind any other type never
 * unlocks (content/coverage.js reports it).
 */
export const UNLOCK_TYPES = Object.freeze(['band_skill_load_by_round', 'band_skill_load_by_shop_lv', 'band_skill_load_by_coin_cost', 'band_skill_load_by_bond_act_count']);

/** Does a stage's `next` condition hold for the player now? @param {StageCtx} ctx @param {Record<string, any> | null | undefined} next */
export function stageUnlocked(ctx, next) {
  const a = Array.isArray(next?.unlockParams) ? next.unlockParams : [];
  switch (next?.unlockType) {
    case 'band_skill_load_by_round': return ctx.round >= int(a[0], Infinity);
    case 'band_skill_load_by_shop_lv': return ctx.shopLevel() >= int(a[0], Infinity);
    case 'band_skill_load_by_coin_cost': return (ctx.stats().gold || 0) >= int(a[0], Infinity);
    case 'band_skill_load_by_bond_act_count': return ctx.bondCount(String(a[0] ?? '')) >= int(a[1], Infinity);
    default: return false;
  }
}

/**
 * The player's current stage index of `stages`, moved on as far as the conditions hold (writes the counter `key`:
 * STAGE_COUNTER, or COMMAND_STAGE_COUNTER for a 指令 taken from another strategy).
 * @param {StageCtx} ctx @param {Record<string, any>[]} stages @param {string} [key]
 */
export function bandStageIndex(ctx, stages, key = STAGE_COUNTER) {
  let i = Math.max(0, Math.min(stages.length - 1, int(ctx.counter(key), 0)));
  while (i < stages.length - 1 && stages[i].next && stageUnlocked(ctx, stages[i].next)) i++;
  if (i !== ctx.counter(key)) ctx.setCounter(key, i);
  return i;
}

/**
 * Hooks of one stage's buffs (null when none has a prep effect). `part`: 'all', or only the buffs that are the 指令
 * ('command': a handler with onBandSkill / onBandSkillUsed) or only the others ('passive').
 * @param {Record<string, any>} stage @param {string} bandId @param {string} [part]
 */
function stageHooks(stage, bandId, part = 'all') {
  /** @type {Map<string, Record<string, any>[]>} */
  const groups = new Map();
  for (const b of buffsOf(stage)) {
    if (!b.key || !K[b.key]) continue;
    if (!groups.has(b.key)) groups.set(b.key, []);
    /** @type {Record<string, any>[]} */ (groups.get(b.key)).push(b.p);
  }
  if (!groups.size) return null;
  const parts = [...groups].map(([k, ps]) => K[k](ps, bandId, stage))
    .filter((h) => part === 'all' || (part === 'command') === isCommandPart(h));
  return parts.length ? merge(parts) : null;
}

/**
 * Hooks of one band (null when it has no prep effect), from its record in `data` (default: the default season's).
 * `part` / `counter`: the 指令 or the passive part only (stageHooks), staged on that counter (bandCommandKey).
 * @param {string} bandId @param {Record<string, any> | null} [data] @param {{ part?: string, counter?: string }} [opts]
 * @returns {MetaHandlers | null}
 */
export function bandMetaHandler(bandId, data = null, { part = 'all', counter = STAGE_COUNTER } = {}) {
  const stages = bandStages(bandRecord(bandId, data));
  if (!stages.length) return null;
  const hooks = stages.map((st) => stageHooks(st, bandId, part));
  if (stages.length === 1) return hooks[0];
  if (part !== 'all' && hooks.every((h) => !h)) return null;
  const names = new Set(STAGE_HOOKS);
  for (const h of hooks) for (const n of Object.keys(h || {})) names.add(n);
  /** @type {Record<string, MetaHook>} */
  const out = {};
  for (const name of names) {
    out[name] = function staged(ctx, ev) {
      const f = /** @type {MetaHook | undefined} */ (hooks[bandStageIndex(ctx, stages, counter)]?.[name]);
      if (f) f(ctx, ev);
    };
  }
  return out;
}

/** The prep buff keys this file handles (the coverage report, content/coverage.js). */
export const PREP_BAND_KEYS = Object.freeze(Object.keys(K));

/** @param {MetaRegistry} registry @param {Record<string, any> | null} [data] the season's data the handlers are for (shared/seasons.js) */
export function registerMeta(registry, data = gameData()) {
  for (const id of Object.keys((data && data.bands) || {})) {
    const h = bandMetaHandler(id, data);
    if (h) registry.band(id, h);
    const rec = bandRecord(id, data);
    if (!hasCommandStages(rec)) continue;
    if (!hasActiveStage(rec)) {
      // a passive strategy's 指令 taken by another player: all of it (好多委托 itself is never taken — no key)
      const all = bandStages(rec).some((st) => buffsOf(st).some((b) => b.key === COMMAND_CHOICE_KEY)) ? null
        : bandMetaHandler(id, data, { counter: COMMAND_STAGE_COUNTER });
      if (all) registry.register(bandCommandKey(id), all);
      continue;
    }
    const cmd = bandMetaHandler(id, data, { part: 'command', counter: COMMAND_STAGE_COUNTER });
    if (cmd) registry.register(bandCommandKey(id), cmd);
    const passive = bandMetaHandler(id, data, { part: 'passive' });
    if (passive) registry.register(bandPassiveKey(id), passive);
  }
  registry.global('bands_ducklord', duckGlobal);
  registry.effect(BAND_MARK.slice('effect:'.length), BAND_MARK_EFFECT);
  registry.effect(BAND_CHEST.slice('effect:'.length), BAND_CHEST_EFFECT);
}
