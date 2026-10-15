// m.layer (upstream #482, docs/rules/audio.md 「맹약 층 효과음」): the owner's bond layer gain of 回合开始 / 机变 / 休整期,
// unicast once per real gain for the layer-up sound; nothing in other phases, on a view or a resync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { BOND_LAYER_CAP, PHASE } from '../../shared/constants.js';
import { S2C } from '../../shared/protocol.js';

const cues = (h) => h.sent.filter(([, msg]) => msg.t === 'm.layer');
function prep(t) {
  const h = makeMatch({ mode: 'coop', humans: 2, fake: true }).start().toPrep(1);
  t.after(() => h.m.dispose());
  h.sent.length = 0;
  return h;
}

test('m.layer is a server message type', () => {
  assert.ok(S2C.includes('m.layer'));
});

test('a prep gain is unicast to its owner with the layers actually added, once, even for an inactive bond', (t) => {
  const h = prep(t), p = h.ps('p_0');
  assert.equal(h.m.phase, PHASE.PREP);
  assert.equal(p.bonds.sargonShip?.active ?? false, false);
  assert.equal(p.addLayers('sargonShip', 3), 3);
  assert.deepEqual(cues(h), [['p_0', { t: 'm.layer', playerId: 'p_0', bondId: 'sargonShip', add: 3 }]]);
  assert.equal(h.bc.some((msg) => msg.t === 'm.layer'), false, 'never broadcast');
  p.layers.sargonShip = BOND_LAYER_CAP - 1;
  p.addLayers('sargonShip', 10);
  assert.equal(cues(h).at(-1)[1].add, 1, 'clamped at the cap');
  const n = cues(h).length;
  for (const v of [1, 0, -2, NaN, Infinity]) p.addLayers('sargonShip', v); // at the cap, or no gain
  p.addLayers('not-a-bond', 2);
  p.addLayers('kjeragShip', 2, { requireActive: true });
  assert.equal(p.bonds.kjeragShip?.active ?? false, false);
  assert.equal(cues(h).length, n);
});

test('only 回合开始 / 机变 / 休整期 gains send it — not a settlement, a battle phase, a view or a resync', (t) => {
  const h = prep(t), p = h.ps('p_0');
  for (const phase of Object.values(PHASE)) {
    h.m.phase = phase;
    p.layers.sargonShip = 0;
    h.sent.length = 0;
    p.addLayers('sargonShip', 1);
    assert.equal(cues(h).length, [PHASE.ROUND_START, PHASE.SP_DRAFT, PHASE.PREP].includes(phase) ? 1 : 0, phase);
  }
  h.m.phase = PHASE.PREP;
  h.sent.length = 0;
  p.recompute(); p.privateView(); h.m.publicView();
  assert.equal(cues(h).length, 0);
});

test('a real g.buy: 角峰 (<获得时> 自身所属盟约层数+2, garrison_25_a) sends one m.layer per bond it raises', (t) => {
  const h = prep(t), p = h.ps('p_0');
  const id = 'chess_char_1_02_a';
  p.shop.slots[0] = { kind: 'chess', id, basePrice: h.m.gd.chessPrice(id), frozen: false, sold: false };
  p.funds = 20;
  assert.ok(h.m.handle('p_0', { t: 'g.buy', slot: 0 }).ok);
  assert.deepEqual(cues(h).map(([pid, msg]) => [pid, msg.bondId, msg.add]).sort(), [['p_0', 'kjeragShip', 2], ['p_0', 'steadShip', 2]]);
  assert.equal(h.sent.some(([pid, msg]) => pid === 'p_1' && msg.t === 'm.layer'), false, 'the teammate hears nothing');
});

test('an AI seat gets no frame', (t) => {
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 1, fake: true }).start().toPrep(1);
  t.after(() => h.m.dispose());
  h.sent.length = 0;
  assert.equal(h.ps('ai_0').addLayers('sargonShip', 2), 2);
  assert.equal(cues(h).length, 0);
});
