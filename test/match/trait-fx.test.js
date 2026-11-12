// m.trait (docs/rules/fx.md 「규정 특질 발동 이펙트」): 规程's prep 特质 effect — the owner's live { uid, fx } when a piece's
// 特质 runs: 雪猎 (「获得时」 谢拉格·精准 layers, a bond 特质 → map_v079_buff01) on a real g.buy and when its 「获得时」 runs
// again (铃兰's 指令: the dispatcher's triggerGarrisons); 投资人's repeat is one; a shop price (onPrice) sends nothing; the
// default season (no eventEffect in its table) sends nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give } from './harness.js';
import { registryFor } from '../../server/match/effectsMeta.js';
import { S2C } from '../../shared/protocol.js';

const REG = registryFor(ACT3_ON_BASE_FIELD);
const traits = (h) => h.sent.filter(([, msg]) => msg.t === 'm.trait');
const SNOW = 'chess_char_2_05_a'; // 雪猎 garrison_51_a: <获得时>【谢拉格】【精准】层数+4

function act3(t) {
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 43, registry: REG, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  t.after(() => h.m.dispose());
  h.toPrep(1, { band: 'band_amiya' });
  const ps = h.ps('p_0');
  ps.funds = 50;
  h.sent.length = 0;
  return { h, m: h.m, ps };
}
const buy = (m, ps, id) => {
  ps.shop.slots[0] = { kind: 'chess', id, basePrice: m.gd.chessPrice(id), frozen: false, sold: false };
  return m.handle(ps.playerId, { t: 'g.buy', slot: 0 });
};

test('m.trait is a server message type', () => {
  assert.ok(S2C.includes('m.trait'));
});

test('规程: buying 雪猎 sends its owner one m.trait with the bought piece and the chain link', (t) => {
  const { h, m, ps } = act3(t);
  assert.ok(buy(m, ps, SNOW).ok);
  const p = [...ps.hand, ...ps.board.values()].find((x) => x && x.id === SNOW);
  assert.ok(p);
  assert.deepEqual(traits(h), [['p_0', { t: 'm.trait', uid: p.uid, fx: 'map_v079_buff01' }]]);
  assert.equal(h.bc.some((msg) => msg.t === 'm.trait'), false, 'never broadcast');
  // the shop reads prices (onPrice) on every view: no event
  ps.privateView(); m.publicView();
  assert.equal(traits(h).length, 1);
});

test('规程: running 雪猎\'s 「获得时」 again (铃兰\'s 指令) sends it again; 投资人\'s ×2 is one effect', (t) => {
  const { h, m, ps } = act3(t);
  const p = give(m, ps, SNOW, 'hand');
  h.sent.length = 0;
  assert.ok(m.dispatcher.triggerGarrisons(ps, p, 'SERVER_GAIN') > 0);
  assert.deepEqual(traits(h), [['p_0', { t: 'm.trait', uid: p.uid, fx: 'map_v079_buff01' }]]);
  ps.bondCountBonus.investShip = 12; ps.recompute();
  assert.ok(ps.bonds.investShip?.active);
  h.sent.length = 0;
  const before = ps.layers.kjeragShip ?? 0;
  m.dispatcher.triggerGarrisons(ps, p, 'SERVER_GAIN');
  assert.equal((ps.layers.kjeragShip ?? 0) - before, 8, 'ran twice');
  assert.equal(traits(h).length, 1);
});

test('the default season: a 获得时 特质 sends no m.trait', (t) => {
  const h = makeMatch({ mode: 'coop', humans: 2, fake: true }).start().toPrep(1);
  t.after(() => h.m.dispose());
  const p = h.ps('p_0');
  p.funds = 20;
  h.sent.length = 0;
  assert.ok(buy(h.m, p, 'chess_char_1_02_a').ok); // 角峰 <获得时> 自身所属盟约层数+2
  assert.ok(h.sent.some(([, msg]) => msg.t === 'm.layer'), 'the 特质 ran');
  assert.deepEqual(traits(h), []);
});
