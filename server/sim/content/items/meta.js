// server/sim/content/items/meta.js — prep side of the items (docs/META.md registry API).
//
// The engine built-ins (server/match/builtinMeta.js) already implement most consume-on-equip items and Arts from the
// concrete item's params; they are reviewed and kept (盟约之币, 骑士储蓄罐, 随身身份牌, 精打细算玩偶, 简易通讯机 (tier ≤
// shop level), 见钱眼开玩偶, 人事部文档 (cap 9), 博士投影 (golden now / normal at the next round start), 拟态物质, 信标,
// 商业包装方案 (count from the concrete record: 8 / golden 7), 突变细胞 (after the battle the carrier is destroyed, its
// equipment — the cell too, which is not consumed (player feedback after 0.1.0) — returns to the hand, then a NORMAL
// random tier+1 operator, max 6, is gained into the hand, not onto the carrier's tile (PR #2)). The Arts' rangeGrid
// (画卷 = placed tile + the tile in front) and the per-round limit are engine rules.
// Overridden / added here, by the official buff key of the record (a season's item gets the behaviour of the buffs it
// carries, whatever its id — items/aliases.js reads a renamed key as the default season's; a built-in, when present,
// is wrapped — never re-implemented):
//   画卷         the copy keeps the target's items; a copied normal item that pairs with an owned one merges and the
//               golden stays in the hand (the built-in equipped the merged golden on the copy, and its live loop over
//               the target's items skipped the item after a merge)
//   紧急调度券   a shop operator leaves its slot only when it was actually granted (built-in cleared the slot first)
//   寻呼模块     the special refresh shows `refresh_cnt` DIFFERENT operators (fewer when the pool has no more)
//   教鞭       trap_create_self_choice {choice_event: hunter_band_1, choiceType PERSONAL_CHOOSE}: a personal choice of
//               one of THREE 战术特训 cards (choices.json cards.bounty payout `perfect`, e.g. 战术特训·飞行I "若各自行动阶段就
//               达成完美作战，获得1资金") whose enemy the mode can field — PRTS 卫戍协议：盟约 下半/PRTS盟约记录 §法术 教鞭
//               "使用后销毁，于3个战术特训的悬赏任务中选择一项", §机变阶段 "※以下悬赏任务仅由法术教鞭生成", and 杜宾 加练！
//               "<教鞭>：使用后为下场战斗添加额外敌人，若自身战斗完美作战可获得资金". onArt → ctx.offerBountyChoice
//               (Match.offerBountyChoice): the three cards go to the owner alone, who confirms one inside the PREP
//               (g.choice with the offer's id); the prep's deadline or an AI seat resolves it (docs/META.md §2.5). Until
//               0.2.2 the engine took one of the three at random (maintainer playtest #6 item 4 review; the built-in drew any
//               tier ≤ II kill bounty, and research 04 §7 [ASSUMED] the band family `enemyeffect_b_*`).
//   “神秘顾客”  the same trap_create_self_choice ("选择一项特殊悬赏任务"; no band grants it in act2, research 04, and PRTS
//               lists no pool): still [ASSUMED simplification] 3 band bounties `enemyeffect_b_*` (research 04 §7 [ASSUMED]:
//               "adds 1 enemy to your next battle, killer gets `coin` funds") whose enemy can appear in the mode, one of them
//               taken at random; the built-in runs when the family is empty.
//   “神秘顾客”  trap_disney_special: when actively destroyed, +count funds and the Art passes to the next alive player
//               (seat order, cyclic)
//   天师古鼎     equip_with_another_gain_coin_when_gain_char: a 【炎】 carrier also holding 炎国短刀 (either quality)
//               gains `count` funds every time the player gains an operator, at most `max` times per round per item

import { itemKeyOf, isCoreBond, gameData } from '../support/index.js';
import { metaBonds } from '../support/meta.js';
import { canonicalBuffKey } from './aliases.js';
import { msg, dn } from '../../../../shared/i18n.js';
import { bankbookShowValue } from '../../../../shared/showTag.js';

/** @import { MetaCtx, MetaHandlers, MetaRegistry } from '../../../match/effectsMeta.js' */
/** @import { PieceView } from '../support/meta.js' */
/** @import { ShopSlot } from '../../../match/player/economy.js' */
/** A bounty card of the season's choices (choices.json cards.bounty), read field by field. @typedef {Record<string, any>} BountyCard */

const int = (/** @type {number} */ v, d = 0) => (Number.isFinite(v) ? Math.trunc(v) : d);

/**
 * Params `{ ...bb, ...bbStr }` of the concrete record's buff with official key `key` — or a key a season renamed it to
 * (items/aliases.js) — null when absent.
 * @param {MetaCtx} ctx @param {string | null | undefined} itemId @param {string} key @returns {Record<string, any> | null}
 */
function buffP(ctx, itemId, key) {
  const rec = itemId ? ctx.gd.item(itemId) : null;
  for (const b of (rec && Array.isArray(rec.buffs) ? rec.buffs : [])) if (b && canonicalBuffKey(b.key) === key) return { ...(b.bb || {}), ...(b.bbStr || {}) };
  return null;
}

/**
 * 【X】盟约干员 on the prep side: own bonds + 变形同构体 grants, or 调和 (maniShip) members while both bonds are active.
 * @param {MetaCtx} ctx @param {PieceView} piece @param {string} bondId
 */
function pieceIsMember(ctx, piece, bondId) {
  const bonds = metaBonds(ctx, piece);
  if (bonds.includes(bondId)) return true;
  return bonds.includes('maniShip') && isCoreBond(bondId, ctx) && ctx.bondActive('maniShip') && ctx.bondActive(bondId);
}

/** Cards drawn before “神秘顾客” takes one at random. */
const OFFER_SIZE = 3;
/**
 * cards.bounty entries matching `test` whose enemy can appear in this mode.
 * @param {MetaCtx} ctx @param {(c: BountyCard) => boolean} test @returns {BountyCard[]}
 */
function bountyCards(ctx, test) {
  const all = ctx.data && ctx.data.choices && ctx.data.choices.cards && Array.isArray(ctx.data.choices.cards.bounty) ? ctx.data.choices.cards.bounty : [];
  const inactive = ctx.gd.inactiveEnemies instanceof Set ? ctx.gd.inactiveEnemies : new Set();
  return all.filter((/** @type {BountyCard | null} */ c) => c && test(c) && ctx.gd.enemy(c.enemyKey) && !inactive.has(c.enemyKey));
}
/** The 战术特训 cards (perfect payout: the chooser's own phase perfect) — what 教鞭 offers. */
const isTraining = (/** @type {BountyCard} */ c) => c.payout === 'perfect';
/** The band bounty family `enemyeffect_b_*` — what “神秘顾客” offers [ASSUMED]. */
const isBandBounty = (/** @type {BountyCard} */ c) => /^enemyeffect_b_\d+$/.test(String(c.effectId));

/**
 * The prep behaviours, by official buff key: [buff key, when (the item's buff keys → runs?) or null, hooks(base) → the
 * handler's hooks over `base` (what the item key had: a built-in, an earlier entry)]. Registered in this order on every
 * item key of the season whose records carry the key.
 * @type {[string, ((keys: Set<string>) => boolean) | null, (base: MetaHandlers) => MetaHandlers][]}
 */
const PREP = [
  // 紧急调度券 — use_equip_reward_random_char_chess_in_shop {count}
  ['use_equip_reward_random_char_chess_in_shop', null, () => ({
    onEquip(ctx, ev) {
      const p = buffP(ctx, ev.item && ev.item.id, 'use_equip_reward_random_char_chess_in_shop') || {};
      const n = Math.max(1, int(p.count, 1));
      /** @type {Set<number>} */
      const tried = new Set();
      for (let k = 0; k < n; k++) {
        const slots = ctx.shopSlots();
        const idx = slots.map((s, i) => (s && s.kind === 'chess' && !s.sold && !tried.has(i) ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) break;
        const i = ctx.rng.pick(idx);
        const got = ctx.grantChess(/** @type {ShopSlot} */ (slots[i]).id); // idx holds filled slots only
        if (got) ctx.setShopSlot(i, null);
        else { tried.add(i); k--; }
      }
    },
  })],

  // 寻呼模块 — use_equip_reward_special_goods_char_chess {refresh_cnt, choice_cnt}
  ['use_equip_reward_special_goods_char_chess', null, () => ({
    onEquip(ctx, ev) {
      const p = buffP(ctx, ev.item && ev.item.id, 'use_equip_reward_special_goods_char_chess') || {};
      const n = Math.max(1, int(p.refresh_cnt, 3));
      const bonds = new Set(ctx.pieceBonds(ev.target.uid));
      const maxTier = ctx.shopLevel();
      const shares = (/** @type {string} */ id) => { const c = ctx.gd.chess(id); return !!(c && Array.isArray(c.bonds) && c.bonds.some((b) => bonds.has(b))); };
      /** @type {string[]} */
      const ids = [];
      for (let k = 0; k < n; k++) {
        // never the same operator twice (user playtest #6 item 19): fewer cards when the pool has no other one
        const id = ctx.rollChess({ maxTier, filter: (x) => shares(x) && !ids.includes(x) });
        if (id) ids.push(id);
      }
      if (ids.length) ctx.offerChess(ids, { source: 'item' });
      // nothing to offer (e.g. 缪尔赛思's 调和 below shop level 6): still destroyed — say why (GitHub #401, builtinMeta toastNothing)
      else ctx.toast(msg('{who}：没有可获得的同盟约干员', { who: dn(ctx.gd.item(ev.item?.id)?.name || '') }), 'warn');
    },
  })],

  // 教鞭 — trap_create_self_choice {choice_event}: the server keeps the offered 战术特训 cards until confirmed. The same
  // buff as “神秘顾客”'s, which carries trap_disney_special besides
  ['trap_create_self_choice', (keys) => !keys.has('trap_disney_special'), () => ({
    onArt(ctx, ev) {
      const result = ctx.offerBountyChoice(bountyCards(ctx, isTraining), ev.item.id);
      if (!result.ok) { ev.error = result.error; ev.detail = result.detail; }
    },
  })],

  // “神秘顾客” — a random band bounty (enemyeffect_b_*).
  ['trap_create_self_choice', (keys) => keys.has('trap_disney_special'), (base) => ({
    onArt(ctx, ev) {
      const cards = bountyCards(ctx, isBandBounty);
      if (!cards.length) { if (typeof base.onArt === 'function') base.onArt.call(base, ctx, ev); return; }
      const offer = ctx.rng.shuffle(cards.slice()).slice(0, OFFER_SIZE);
      const card = ctx.rng.pick(offer);
      if (!card || !ctx.addBounty(card)) { ev.error = 'BAD_TARGET'; ev.detail = 'no bounty available'; }
    },
  })],

  // 画卷 — trap_copy_front_char: copy the operator in range (elite status included) and its equipment. The copied items
  // are gained unequipped, like any gained item — the hand, overflow temp, destroyed with the usual toast when both are
  // full — never put on the copy (PRTS 画卷 备注 "使用后销毁，获得的装备为未装备状态"; until 0.2.2 a copied item that did
  // not merge was equipped onto the copy). A copied normal item that completes a pair with an owned one merges at once,
  // the golden in the hand (research 04 addendum "两个同名道具（无论是否被装备）会自动合并…并自动返回整备区"). A copy that
  // completes a three-copy merge (GitHub #389, PR #390): the promotion returns the copies' equipment to the hand too
  // (PRTS 帮助 "在失去该干员（…合并等）…时自动卸除"), so the elite wears nothing and a copied normal item merges with the
  // returned original.
  ['trap_copy_front_char', null, () => ({
    onArt(ctx, ev) {
      const target = (ev.targets || []).find((/** @type {PieceView | null} */ p) => p && p.kind === 'chess');
      if (!target) { ev.error = 'BAD_TARGET'; ev.detail = 'no operator in range'; return; }
      // snapshot before the gain: a gain that completes a merge consumes the target and empties `target.items`, and an
      // item merge detaches the original's copy from `target.items` while we iterate (the built-in's live loop then
      // skipped the next item)
      const itemIds = (target.items || []).map((/** @type {PieceView} */ it) => it.id);
      const copy = ctx.grantChess(target.id, { requirePool: false, source: 'item:chess_item_6_02_m' });
      if (!copy) { ev.error = 'HAND_FULL'; return; }
      for (const itemId of itemIds) ctx.grantItem(itemId, { source: 'item:chess_item_6_02_m' });
    },
  })],

  // “神秘顾客” — trap_create_self_choice (bounty above) + trap_disney_special {count}
  ['trap_disney_special', null, () => ({
    onDestroy(ctx, ev) {
      if (!ev || ev.reason !== 'player') return;
      const item = ev.item || ctx.source.piece;
      const p = buffP(ctx, item && item.id, 'trap_disney_special') || {};
      const n = int(p.count, 1);
      if (n > 0) ctx.addFunds(n, 'item');
      const mates = ctx.teammates();
      if (!mates.length || !item) return;
      const seat = Number.isInteger(ctx.seat) ? ctx.seat : 0;
      const dist = (/** @type {MetaCtx} */ t) => { const s = Number.isInteger(t.seat) ? t.seat : 0; return ((s - seat) % 64 + 64) % 64 || 64; };
      const next = mates.slice().sort((a, b) => dist(a) - dist(b))[0];
      if (next) next.grantItem(item.id, { source: 'item' });
    },
  })],

  // 天师古鼎 — equip_with_another_gain_coin_when_gain_char {count, max} {other_equip, bond}
  ['equip_with_another_gain_coin_when_gain_char', null, (base) => ({
    onGain(ctx, ev) {
      if (typeof base.onGain === 'function') base.onGain.call(base, ctx, ev);
      if (!ev || ev.kind !== 'chess' || !ev.piece) return;
      const { piece, holder } = ctx.source;
      if (!piece || !holder) return;
      const p = buffP(ctx, piece.id, 'equip_with_another_gain_coin_when_gain_char');
      if (!p) return;
      const bond = typeof p.bond === 'string' && p.bond ? p.bond : 'yanShip';
      const others = String(p.other_equip || '').split(',').map((s) => itemKeyOf(s.trim(), ctx)).filter(Boolean);
      const fresh = ctx.piece(holder.uid) || holder;
      const carries = (fresh.items || []).some((/** @type {PieceView | null} */ it) => it && it.uid !== piece.uid && others.includes(itemKeyOf(it.id, ctx)));
      if (!carries || !pieceIsMember(ctx, fresh, bond)) return;
      const k = `cauldron:${piece.uid}:${ctx.round}`;
      if (ctx.counter(k) >= Math.max(0, int(p.max, 3))) return;
      ctx.incCounter(k);
      ctx.addFunds(int(p.count, 2), 'item');
    },
  })],
];

// ---- 规程 (act3autochess): new keys whose items changed meaning (items/aliases.js keeps the renamed same ones)

/** The operator's 第一盟约: the first bond of its chess record (a 自选 piece: the operator it stands for), or null. */
const firstBond = (/** @type {MetaCtx} */ ctx, /** @type {PieceView | null | undefined} */ piece) => {
  const b = piece && ctx.chessRecord(piece.id)?.bonds;
  return Array.isArray(b) && typeof b[0] === 'string' ? b[0] : null;
};
const hasBondOf = (/** @type {MetaCtx} */ ctx, /** @type {string} */ id, /** @type {string | null} */ bond) => !!(bond && ctx.gd.chess(id)?.bonds?.includes(bond));
const nothingToast = (/** @type {MetaCtx} */ ctx, /** @type {Record<string, any>} */ ev) => ctx.toast(msg('{who}：没有可获得的同盟约干员', { who: dn(ctx.gd.item(ev.item?.id)?.name || '') }), 'warn');

PREP.push(
  // 简易通讯机 — equip_destory_first_bond_char {count}: "装备时销毁，随机获得1名拥有该干员第一盟约的干员" — 盟约's same-bond
  // grant (any bond of the target) narrowed to the first bond, the tier ≤ the shop level as there. With no such operator
  // in the pool, the target operator itself, the 进阶 copy's two as two copies (maintainer decision 2026-11-14, from a CN
  // player's report and a CN play video, https://www.bilibili.com/video/BV1GiWr6AEkS: at shop level 2 “暴躁铁皮” and
  // 盟约·辅助干员 (协防干员 lowest tier 3, 调和), 昆图斯's Mon3tr (two from the 进阶 copy), and 伊桑 and 霍尔海雅 in a match whose
  // bans left no 奥术 operator of tier ≤ 2 each gave themselves) [추정·서버: the draw is the server's — every case seen has no
  // operator of the first bond at tier ≤ the level in the match at all; one that is there but out of copies is unseen;
  // 盟约's 简易通讯机 (aliases.js) keeps giving nothing, maintainer decision 2026-10-07]
  ['equip_destory_first_bond_char', null, () => ({
    onEquip(ctx, ev) {
      const p = buffP(ctx, ev.item && ev.item.id, 'equip_destory_first_bond_char') || {};
      const bond = firstBond(ctx, ev.target);
      const self = ev.target && ev.target.kind === 'chess' ? ctx.gd.baseIdOf(ev.target.id) : null;
      let got = 0;
      for (let k = 0; k < Math.max(1, int(p.count, 1)); k++) {
        const id = (bond ? ctx.rollChess({ maxTier: Math.max(1, ctx.shopLevel()), filter: (x) => hasBondOf(ctx, x, bond) }) : null) ?? self;
        if (id && ctx.grantChess(id)) got++;
      }
      if (!got) nothingToast(ctx, ev);
    },
  })],

  // 投机骰子 — equip_destory_skill_pool {choice_event: skill_change_1}: "装备时销毁，从3个指令中选择1个替换当前指令" — the
  // 更换指令 personal choice of the item's text count (server/match/match/bandSkill.js offerBandSkillChoice: the pool and
  // the swap). Refused — the dice stays where it was — when the choice cannot open (another personal choice is open,
  // nothing to offer).
  ['equip_destory_skill_pool', null, () => ({
    onEquip(ctx, ev) {
      const p = buffP(ctx, ev.item && ev.item.id, 'equip_destory_skill_pool') || {};
      const r = ctx.offerBandSkillChoice({ choiceEvent: p.choice_event, desc: ctx.gd.item(ev.item?.id)?.desc ?? '', sourceItemId: ev.item?.id ?? null });
      if (!r.ok) { ev.error = r.error; ev.detail = r.detail; }
    },
  })],

  // 寻呼模块 — use_equip_spe_goods_first_bond {option_count, select_count}: "在调度中心出现至多3名拥有该干员第一盟约的干员，
  // 免费获取其中1名（不高于当前调度中心等级）" — 盟约's 寻呼模块 (above) on the first bond; `select_count` pick-one offers
  ['use_equip_spe_goods_first_bond', null, () => ({
    onEquip(ctx, ev) {
      const p = buffP(ctx, ev.item && ev.item.id, 'use_equip_spe_goods_first_bond') || {};
      const bond = firstBond(ctx, ev.target);
      /** @type {string[]} */
      const ids = [];
      for (let k = 0; k < Math.max(1, int(p.option_count, 3)) && bond; k++) {
        const id = ctx.rollChess({ maxTier: Math.max(1, ctx.shopLevel()), filter: (x) => hasBondOf(ctx, x, bond) && !ids.includes(x) });
        if (id) ids.push(id);
      }
      if (!ids.length) { nothingToast(ctx, ev); return; }
      for (let k = 0; k < Math.max(1, int(p.select_count, 1)); k++) ctx.offerChess(ids, { source: 'item' });
    },
  })],

  // 拟态物质 — use_equip_reward_same_tier: "装备时销毁，若已拥有至少2名该初始干员，则再获得1名该初始干员；否则随机获得1名同阶
  // 干员" — 盟约's 拟态物质 (builtinMeta use_equip_reward_char_chess: past the stock, any copy owned counts) whose 否则 draws
  // an operator of the target's tier instead of one sharing a bond
  ['use_equip_reward_same_tier', null, () => ({
    onEquip(ctx, ev) {
      const base = ctx.gd.baseIdOf(ev.target.id);
      const owned = [...ctx.board(), ...ctx.hand(), ...ctx.temp()].filter((x) => x && x.kind === 'chess' && !x.golden && ctx.gd.baseIdOf(x.id) === base).length;
      if (owned >= 2) { ctx.grantChess(base, { requirePool: false }); return; }
      const tier = ctx.gd.tierOf(ev.target.id);
      const id = ctx.rollChess({ tier, ignoreCounts: true });
      if (!id) nothingToast(ctx, ev);
      else ctx.grantChess(id, { requirePool: false });
    },
  })],

  // 定期存折 — equip_destory_gain_coin {value, n, delta}: "装备时销毁，获得{showtag_value_1}资金（持有时每回合+1）" — the item
  // grows by `delta` every `n` round starts while it is owned, from `value` [ASSUMED·화면: 산 라운드부터 센다 — 공식 화면의
  // 숫자 표시 미확인]; only worn items run prep hooks, so the count is the rounds since it was gained (piece.boughtRound)
  ['equip_destory_gain_coin', null, () => ({
    onEquip(ctx, ev) {
      const p = buffP(ctx, ev.item && ev.item.id, 'equip_destory_gain_coin') || {};
      const since = Number.isInteger(ev.item?.boughtRound) ? Math.max(0, ctx.round - ev.item.boughtRound) : 0;
      // the same number the card shows (shared/showTag.js; the item piece's `showTag`, player/views.js pieceView)
      const v = bankbookShowValue({ value: int(p.value, 0), delta: int(p.delta, 1), n: int(p.n, 1) }, since);
      if (v > 0) ctx.addFunds(v, 'item');
    },
  })],

  // 一次性促销券 — use_equip_spe_goods_equip {option_count, select_count}: "装备时销毁，在调度中心出现3件装备，免费获取其中1件
  // （不高于当前调度中心等级）" (the 进阶 copy 6 / 2): `select_count` pick-one offers sharing the `option_count` items
  // [ASSUMED·화면: 6개 중 2개 고르기를 3개씩 두 번으로 — 공식 고르기 창 미확인]
  ['use_equip_spe_goods_equip', null, () => ({
    onEquip(ctx, ev) {
      const p = buffP(ctx, ev.item && ev.item.id, 'use_equip_spe_goods_equip') || {};
      /** @type {string[]} */
      const ids = [];
      for (let k = 0; k < Math.max(1, int(p.option_count, 3)); k++) {
        const id = ctx.rollItem({ maxTier: Math.max(1, ctx.shopLevel()), exclude: ids });
        if (id) ids.push(id);
      }
      const picks = Math.max(1, int(p.select_count, 1));
      const per = Math.max(1, Math.ceil(ids.length / picks));
      for (let k = 0; k < picks && k * per < ids.length; k++) ctx.offerItems(ids.slice(k * per, (k + 1) * per), { source: 'item' });
    },
  })],

  // 人事部记录 — equip_use_main_bond: "装备时销毁，立刻特殊刷新1次调度中心，优先出现拥有该干员第一盟约的干员（不高于当前调度中心
  // 等级）" — a special refresh of the whole shop, operator AND equipment positions, empty, bought and frozen ones too
  // (official footage, upstream 6efc0628): an operator position gets a first-bond operator where the pool has one (佩佩's
  // special refresh, bands/meta.js), else any, no operator twice while another is left; an equipment position the shop's
  // own item draw (level, shared stock). Free, not a 主动刷新; a frozen card stays frozen (setShopSlot).
  ['equip_use_main_bond', null, () => ({
    onEquip(ctx, ev) {
      const bond = firstBond(ctx, ev.target);
      const maxTier = Math.max(1, ctx.shopLevel());
      const kinds = ctx.shopKinds();
      /** @type {string[]} */
      const used = [];
      for (let i = 0; i < kinds.length; i++) {
        if (kinds[i] === 'item') {
          const id = ctx.rollShopItem();
          if (id) ctx.setShopSlot(i, { kind: 'item', id });
          continue;
        }
        const fresh = (/** @type {string} */ x) => !used.includes(x);
        const id = (bond && ctx.rollChess({ maxTier, filter: (x) => fresh(x) && hasBondOf(ctx, x, bond) }))
          || ctx.rollChess({ maxTier, filter: fresh }) || ctx.rollChess({ maxTier });
        if (!id) continue;
        used.push(id);
        ctx.setShopSlot(i, { kind: 'chess', id });
      }
    },
  })],

  // 卫戍推荐信 — prep_end_act_bond {count}: "休整期结束时，使携带者所属的已激活盟约层数+1" (worn, not consumed): every bond of
  // the carrier active at the prep's end gains `count` layers
  ['prep_end_act_bond', null, () => ({
    onPrepEnd(ctx) {
      const { piece, holder } = ctx.source;
      if (!piece || !holder) return;
      const n = int((buffP(ctx, piece.id, 'prep_end_act_bond') || {}).count, 1);
      for (const b of ctx.pieceBonds(holder.uid)) if (ctx.bondActive(b)) ctx.addLayers(b, n, { requireActive: true, reason: 'item' });
    },
  })],
);

/** The buff keys items/meta.js acts on (content/coverage.js). */
export const PREP_BUFF_KEYS = Object.freeze([...new Set(PREP.map(([k]) => k))]);

/**
 * Register the prep behaviours on the item keys of the season's data (`data`: shared/seasons.js; absent: the default
 * season's) whose records — the normal, golden and Art record of the key — carry their buff keys.
 * @param {MetaRegistry} registry @param {Record<string, any> | null} [data]
 */
export function registerMeta(registry, data = gameData()) {
  const items = (data && data.items) || {};
  /** item key → the canonical buff keys of its records, in record order @type {Map<string, Set<string>>} */
  const byKey = new Map();
  for (const [id, rec] of Object.entries(items)) {
    if (!rec || !Array.isArray(rec.buffs)) continue;
    const key = itemKeyOf(id, data);
    let keys = byKey.get(key);
    if (!keys) { keys = new Set(); byKey.set(key, keys); }
    for (const b of rec.buffs) if (b && typeof b.key === 'string') keys.add(canonicalBuffKey(b.key));
  }
  for (const [buffKey, when, hooks] of PREP) {
    for (const [key, keys] of byKey) {
      if (!keys.has(buffKey) || (when && !when(keys))) continue;
      const base = registry.get(`item:${key}`) || {};
      registry.item(key, { ...base, ...hooks(base) });
    }
  }
}
