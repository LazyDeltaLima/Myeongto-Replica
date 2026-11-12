// 卫戍协议：规程's 装备区: equipment and 秘术 wait in a zone of their own (constData maxDeckEquipmentChessCnt 5 → economy
// equipHandSize) on the five tiles that were the 临时整备区 (the season's map files mark them tile_acbag, the ten hand
// tiles tile_achand; the official client keeps separate char / equip hand areas with a full and an overflow flag each),
// the hand keeps operators and summon stacks. What does not fit its zone waits in the hidden queue behind the five until
// its prep deadline — PlayerState bagMode (player/basics.js, _stowZone / _fillZones in player/pieces.js). The default
// season keeps the shared hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERR, GEO } from '../../shared/constants.js';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, DATA } from '../match/harness.js';
import { registryFor } from '../../server/match/effectsMeta.js';
import { collectViolations } from '../../server/match/invariants.js';
import { GameData } from '../../server/match/gamedata.js';
import { placementContext, canPlace, dropIntent } from '../../public/js/ui/gameLogic/placement.js';
import { zoneFull, bagFull, overflowOf, shopBlockReason, readyOverflowPrompt } from '../../public/js/ui/gameLogic/shop.js';
import { bottomTipType } from '../../public/js/ui/battleArt.js';
import { tempInfo } from '../../public/js/ui/hud.js';
import { C2S } from '../../shared/protocol.js';

const REG = registryFor(ACT3_ON_BASE_FIELD);

function setup(t, { season = 'act3autochess' } = {}) {
  const act3 = season === 'act3autochess';
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 77, ...(act3 ? { registry: REG, fake: true, data: ACT3_ON_BASE_FIELD, season } : {}) }).start();
  h.toPrep(1, { band: 'band_amiya' });
  t.after(() => h.m.dispose());
  const { m } = h;
  const ps = h.ps('p_0');
  for (const p of ps.allChess()) ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.length = GEO.TEMP_SIZE; ps.temp.fill(null); ps.offers.length = 0;
  ps.funds = 99; ps.layers = {}; ps.pendingFunds = 0; ps.counters = {}; ps.bandId = null;
  ps._tempDue.clear();
  ps.recompute();
  return { h, m, ps };
}

/** `n` different plain equipment ids (no merge or 组合 partner among them) of the player's data. */
function plainItems(ps, n) {
  const items = Object.values(ps.gd.raw.items).filter((r) => r.itemType === 'EQUIP' && !r.isGolden && !r.fuseWith && !r.isDiy && r.visible !== false);
  const out = [];
  for (const r of items.sort((a, b) => (a.id < b.id ? -1 : 1))) if (!out.includes(r.id)) out.push(r.id);
  assert.ok(out.length >= n);
  return out.slice(0, n);
}
/** `n` different normal operators the pool has. */
function chessIds(m, n) {
  const ids = Object.values(m.gd.raw.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy && m.pool.has(c.chessId) && m.pool.left(c.chessId) > 0)
    .map((c) => c.chessId).sort();
  assert.ok(ids.length >= n);
  return ids.slice(0, n);
}
const item = (ps, id) => ps.acquireItem(id, { silent: true, noPool: true });
const chess = (ps, id) => ps.acquireChess(id, { silent: true });
const noViolations = (m) => assert.deepEqual(collectViolations(m), []);
const ids = (list) => list.map((p) => (p ? p.id : null));

// ---------------------------------------------------------------------------------------------------------------
// data

test('规程 economy: equipHandSize 5 from maxDeckEquipmentChessCnt; the default season has none', () => {
  assert.equal(ACT3.config.economy.equipHandSize, 5);
  assert.equal(new GameData(ACT3).equipHandSize, 5);
  assert.equal('equipHandSize' in DATA.config.economy, false);
  assert.equal(new GameData(DATA).equipHandSize, 0);
  assert.equal(GEO.TEMP_SIZE, 5, 'the 装备区 is drawn on the five temp tiles');
});

// ---------------------------------------------------------------------------------------------------------------
// zones

test('规程: an item goes into the 装备区 (right → left), an operator into the hand; a full hand does not stop an item', (t) => {
  const { m, ps } = setup(t);
  assert.equal(ps.bagMode, true);
  const [a, b] = plainItems(ps, 2);
  const pa = item(ps, a);
  const pb = item(ps, b);
  assert.deepEqual(ids(ps.temp), [null, null, null, b, a]);
  assert.equal(ps.hand.some(Boolean), false);
  assert.equal(ps._tempDue.has(pa.uid) || ps._tempDue.has(pb.uid), false, 'nothing in the 装备区 is due');
  for (const id of chessIds(m, 10)) chess(ps, id);
  assert.equal(ps.hand.filter(Boolean).length, 10);
  // the shop: an item still buys into the 装备区, an operator is refused
  const [c] = plainItems(ps, 3).slice(2);
  ps.shop.slots[0] = { kind: 'item', id: c, basePrice: 1, sold: false };
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.buy', slot: 0 }), { ok: true });
  assert.equal(ps.temp[2]?.id, c);
  ps.shop.slots[1] = { kind: 'chess', id: chessIds(m, 11)[10], basePrice: 1, sold: false };
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.buy', slot: 1 }), { error: ERR.HAND_FULL });
  noViolations(m);
});

test('规程: a full 装备区 refuses an item purchase / pick with BAG_FULL while the hand has room', (t) => {
  const { m, ps } = setup(t);
  const list = plainItems(ps, 6);
  for (const id of list.slice(0, 5)) item(ps, id);
  assert.equal(ps.temp.slice(0, 5).every(Boolean), true);
  ps.shop.slots[0] = { kind: 'item', id: list[5], basePrice: 1, sold: false };
  const funds = ps.funds;
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.buy', slot: 0 }), { error: ERR.BAG_FULL });
  assert.equal(ps.funds, funds);
  ps.offers.push({ tier: 1, source: 'test', label: 'x', slots: [{ kind: 'item', id: list[5], price: 0, sold: false }, { kind: 'chess', id: chessIds(m, 1)[0], price: 0, sold: false }] });
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.reward', idx: 0 }), { error: ERR.BAG_FULL });
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.reward', idx: 1 }), { ok: true }, 'an operator still fits the hand');
  noViolations(m);
});

test('规程 overflow: a passive gain past its full zone waits in the hidden queue; a freed slot of its own zone pulls it in', (t) => {
  const { m, ps } = setup(t);
  const cs = chessIds(m, 11);
  const its = plainItems(ps, 6);
  for (const id of cs.slice(0, 10)) chess(ps, id);
  for (const id of its.slice(0, 5)) item(ps, id);
  const lateChess = chess(ps, cs[10]);
  const lateItem = item(ps, its[5]);
  assert.deepEqual(ps.temp.slice(5), [lateChess, lateItem], 'both queue behind the five, in arrival order');
  assert.ok(ps._tempDue.has(lateChess.uid) && ps._tempDue.has(lateItem.uid), 'queued pieces are due');
  assert.equal(ps.tempEmpty, false);
  assert.deepEqual(ps.overflowPieces(), [lateChess, lateItem]);
  noViolations(m);
  // a free hand slot takes the operator, not the item
  assert.deepEqual(ps.sell(ps.hand[0].uid), { ok: true });
  assert.ok(ps.hand.includes(lateChess));
  assert.deepEqual(ps.temp.slice(5), [lateItem]);
  assert.equal(ps._tempDue.has(lateChess.uid), false);
  // a free 装备区 slot takes the item (and its deadline goes)
  const gone = ps.temp[1];
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.destroy', uid: gone.uid }), { ok: true });
  assert.equal(ps.temp.length, 5);
  assert.equal(ps.temp[1], lateItem);
  assert.equal(ps._tempDue.has(lateItem.uid), false);
  assert.equal(ps.tempEmpty, true);
  noViolations(m);
});

test('规程 prep deadline: the queue is resolved (operator sold back, item destroyed), the 装备区 is kept', (t) => {
  const { m, ps } = setup(t);
  const cs = chessIds(m, 11);
  const its = plainItems(ps, 6);
  for (const id of cs.slice(0, 10)) chess(ps, id);
  const kept = its.slice(0, 5).map((id) => item(ps, id));
  const lateChess = chess(ps, cs[10]);
  item(ps, its[5]);
  const left = m.pool.left(m.gd.baseIdOf(cs[10]));
  ps.resolveTemp();
  assert.equal(ps.temp.length, 5);
  assert.deepEqual(ps.temp.slice(0, 5).reverse(), kept);
  assert.equal(ps.find(lateChess.uid), null);
  assert.equal(m.pool.left(m.gd.baseIdOf(cs[10])), left + 1, 'the queued operator went back to the pool');
  // a later prep end still keeps the 装备区
  ps.prepsEnded += 3;
  ps.resolveTemp();
  assert.deepEqual(ps.temp.slice(0, 5).reverse(), kept);
  // un-readying does not make a 装备区 item due
  assert.deepEqual(ps.setReady(true), { ok: true });
  assert.deepEqual(ps.setReady(false), { ok: true });
  assert.equal(kept.some((p) => ps._tempDue.has(p.uid)), false);
  noViolations(m);
});

test('规程 moves: an item never into the hand, between the five 装备区 slots it moves or swaps; an operator not into them', (t) => {
  const { m, ps } = setup(t);
  const [a, b] = plainItems(ps, 2);
  const pa = item(ps, a);
  const pb = item(ps, b);
  const [c] = chessIds(m, 1);
  const pc = chess(ps, c);
  const mv = (uid, to) => m.handle(ps.playerId, { t: 'g.move', uid, to });
  assert.equal(mv(pa.uid, { area: 'hand', idx: 0 }).error, ERR.BAD_TARGET);
  assert.deepEqual(mv(pa.uid, { area: 'temp', idx: 0 }), { ok: true });
  assert.deepEqual(ids(ps.temp), [a, null, null, b, null]);
  assert.deepEqual(mv(pb.uid, { area: 'temp', idx: 0 }), { ok: true }, 'onto the other item: swap');
  assert.deepEqual(ids(ps.temp), [b, null, null, a, null]);
  assert.equal(mv(pc.uid, { area: 'temp', idx: 1 }).error, ERR.BAD_TARGET);
  assert.equal(ps._tempDue.size, 0);
  noViolations(m);
});

test('the default season: no 装备区 — an item takes a hand slot, g.move to a temp slot is refused', (t) => {
  const { m, ps } = setup(t, { season: 'act2autochess' });
  assert.equal(ps.bagMode, false);
  const [a] = plainItems(ps, 1);
  const pa = item(ps, a);
  assert.equal(ps.hand[9], pa);
  assert.equal(ps.temp.some(Boolean), false);
  assert.equal(m.handle(ps.playerId, { t: 'g.move', uid: pa.uid, to: { area: 'temp', idx: 0 } }).error, ERR.BAD_TARGET);
  assert.equal(ps.privateView().bag, 0);
  noViolations(m);
});

test('规程: an elite merge sends the copies\' equipment back into the 装备区 (「干员晋级后已配发装备会回收至整备区」)', (t) => {
  const { m, ps } = setup(t);
  const [c] = chessIds(m, 1);
  const [a, b] = plainItems(ps, 2);
  const first = chess(ps, c);
  const second = chess(ps, c);
  const pa = item(ps, a);
  const pb = item(ps, b);
  assert.deepEqual(ps.equip(pa.uid, first.uid), { ok: true });
  assert.deepEqual(ps.equip(pb.uid, second.uid), { ok: true });
  assert.equal(ps.temp.some(Boolean), false);
  const elite = chess(ps, c);
  assert.ok(elite && m.gd.isGolden(elite.id));
  assert.deepEqual(ids(ps.temp.slice(0, 5)).filter(Boolean).sort(), [a, b].sort());
  assert.equal(ps.hand.some((p) => p && p.kind === 'item'), false);
  noViolations(m);
});

// ---------------------------------------------------------------------------------------------------------------
// what the client reads (m.private bag) and mirrors

test('m.private bag and the client: zone fullness, overflow, the bottom band and drops into the 装备区', (t) => {
  const { m, ps } = setup(t);
  const cs = chessIds(m, 11);
  const its = plainItems(ps, 6);
  for (const id of its.slice(0, 5)) item(ps, id);
  let priv = ps.privateView();
  assert.equal(priv.bag, 5);
  assert.equal(bagFull(priv), true);
  assert.equal(zoneFull(priv, 'item'), true);
  assert.equal(zoneFull(priv, 'chess'), false);
  assert.equal(overflowOf(priv).length, 0, 'the 装备区 is no overflow');
  assert.equal(tempInfo(priv).count, 0);
  assert.equal(readyOverflowPrompt(priv, { ready: true }), null);
  const editable = { priv: { ...priv, funds: 99 }, editable: true };
  assert.ok(shopBlockReason('buy', { ...editable, slot: { kind: 'item', id: its[5], price: 1 } }));
  assert.equal(shopBlockReason('buy', { ...editable, slot: { kind: 'chess', id: cs[0], price: 1 } }), null);
  assert.equal(bottomTipType({ prep: true, watching: false, ready: false, overflow: false, full: false, alive: true, ownDone: false, bag: true, bagFull: true }), 'HAND_EQUIP_FULL');
  for (const id of cs.slice(0, 11)) chess(ps, id);
  priv = ps.privateView();
  assert.equal(overflowOf(priv).length, 1);
  assert.equal(tempInfo(priv).count, 1);
  assert.ok(readyOverflowPrompt(priv, { ready: true }));
  assert.equal(bottomTipType({ prep: true, watching: false, ready: false, overflow: false, full: true, alive: true, ownDone: false, bag: true, bagFull: true }), 'HAND_CHAR_FULL');
  // drops: an item onto a hand operator equips, onto another 装备区 slot moves, onto an empty hand slot (none here) or a
  // non-operator is refused
  ps.sell(ps.hand[0].uid); // the queued operator takes that slot
  ps.sell(ps.hand[1].uid);
  priv = ps.privateView();
  const ctx = placementContext({ priv, getChess: (id) => m.gd.chess(id), getItem: (id) => m.gd.item(id), getToken: (id) => m.gd.token(id), editable: true });
  assert.equal(ctx.bag, true);
  const bagItem = priv.temp[4];
  const emptyHand = priv.hand.findIndex((p) => p == null);
  assert.ok(emptyHand >= 0);
  assert.equal(canPlace(ctx, bagItem.uid, { area: 'hand', idx: emptyHand }).ok, false);
  const opIdx = priv.hand.findIndex((p) => p && p.kind === 'chess');
  assert.equal(canPlace(ctx, bagItem.uid, { area: 'hand', idx: opIdx }).action, 'equip');
  assert.deepEqual(dropIntent(ctx, bagItem.uid, { area: 'temp', idx: 0 }), { t: 'g.move', fields: { uid: bagItem.uid, to: { area: 'temp', idx: 0 } } });
  assert.equal(canPlace(ctx, priv.hand[opIdx].uid, { area: 'temp', idx: 0 }).ok, false);
  assert.equal(C2S['g.move'].to({ area: 'temp', idx: 4 }), true);
  assert.equal(C2S['g.move'].to({ area: 'temp', idx: 5 }), false, 'the queue is not a target');
  noViolations(m);
});
