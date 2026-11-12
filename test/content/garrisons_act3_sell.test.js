// 卫戍协议：规程's 特质 on sell prices and the special refresh (server/sim/content/garrisons/prep/*.js): 海沫 garrison_27,
// 旅骨 28, 温蒂 30, 棘刺 32 (PlayerState.sellPriceOf, GameData.sellPrice) and 灵知 55, through a real match on the season's
// data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, legalTileFor } from '../match/harness.js';
import { registryFor } from '../../server/match/effectsMeta.js';
import { collectViolations } from '../../server/match/invariants.js';
import { tileKey } from '../../server/match/board.js';

const REG = registryFor(ACT3_ON_BASE_FIELD);
const GB = (gid) => ACT3.garrisons[gid].bb;

function setup({ seed = 43, active = [] } = {}) {
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: REG, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0;
  ps.funds = 50; ps.layers = {}; ps.pendingFunds = 0; ps.shop.freeRefreshes = 0; ps.counters = {};
  ps.bandId = null;
  for (const b of active) ps.bondCountBonus[b] = 12;
  ps.recompute();
  return { h, m, ps };
}
const place = (m, ps, id) => give(m, ps, id, 'board', legalTileFor(m, ps, id, new Set([...ps.board.keys()])));
const noViolations = (m) => assert.deepEqual(collectViolations(m), []);
const viewOf = (ps, uid) => [...ps.privateView().board, ...ps.privateView().hand].find((v) => v && v.uid === uid);

test('海沫 garrison_27: each 休整期结束 raises its own sell price by 1 (精锐 2) up to 4 (8); in the hand it does not; selling pays it', () => {
  for (const [id, step, top] of [['chess_char_3_04_a', 1, 4], ['chess_char_3_04_b', 2, 8]]) {
    assert.equal(1 + GB(id.endsWith('_a') ? 'garrison_27_a' : 'garrison_27_b').max, top);
    const { m, ps } = setup();
    const p = place(m, ps, id);
    const inHand = give(m, ps, id, 'hand');
    const seen = [];
    for (let i = 0; i < 5; i++) { m.dispatch(ps, 'onPrepEnd', { round: m.round }); seen.push(ps.sellPriceOf(p)); }
    assert.deepEqual(seen, Array.from({ length: 5 }, (_, i) => Math.min(top, 1 + step * (i + 1))), id);
    assert.equal(ps.sellPriceOf(inHand), 1, 'the hand copy keeps its price');
    assert.equal(viewOf(ps, p.uid).sellPrice, top, 'the view carries it');
    assert.equal(viewOf(ps, inHand.uid).sellPrice, undefined, 'none when it is the record\'s');
    ps.hand[ps.hand.indexOf(inHand)] = null; ps.returnCopies(inHand);
    const f0 = ps.funds;
    assert.equal(ps.sell(p.uid).ok, true);
    assert.equal(ps.funds - f0, top, 'selling pays the raised price');
    noViolations(m);
  }
});

test('温蒂 garrison_30: sells for 3, its elite for 6 — a merged elite too', () => {
  const { m, ps } = setup();
  assert.equal(m.gd.sellPrice('chess_char_4_05_a'), GB('garrison_30_a').price);
  assert.equal(m.gd.sellPrice('chess_char_4_05_b'), GB('garrison_30_b').price);
  assert.equal(m.gd.sellPrice('chess_char_3_04_a'), 1, 'others as their record');
  const p = give(m, ps, 'chess_char_4_05_a', 'hand');
  assert.equal(viewOf(ps, p.uid).sellPrice, 3);
  let f0 = ps.funds;
  assert.equal(ps.sell(p.uid).ok, true);
  assert.equal(ps.funds - f0, 3);
  // a merged elite (no 获得时 run)
  const need = m.gd.chess('chess_char_4_05_a').upgradeNum ?? 3;
  for (let i = 0; i < need; i++) ps.acquireChess('chess_char_4_05_a', { source: 'buy' });
  const elite = ps.hand.find((x) => x && x.id === 'chess_char_4_05_b');
  assert.ok(elite, 'merged');
  f0 = ps.funds;
  assert.equal(ps.sell(elite.uid).ok, true);
  assert.equal(ps.funds - f0, 6);
  noViolations(m);
});

test('旅骨 garrison_28: at 休整期结束 its own and the operator in front\'s active bonds gain each one\'s sell price (精锐 ×2)', () => {
  for (const [id, multi] of [['chess_char_3_05_a', 1], ['chess_char_3_05_b', 2]]) {
    const own = ACT3.chess[id].bonds;
    const front = Object.values(ACT3.chess).find((c) => c.visible && !c.isGolden && !(c.garrisonIds || []).some((g) => ACT3.garrisons[g]?.eventType === 'SERVER_PREP_FIN') && !c.bonds.some((b) => own.includes(b)));
    const { m, ps } = setup({ active: [...own, ...front.bonds] });
    const me = place(m, ps, id);
    me.dir = 'RIGHT';
    const [r, c] = [...ps.board.entries()].find(([, x]) => x === me)[0].split(',').map(Number);
    const other = give(m, ps, front.chessId, 'board', [r, c + 1]);
    other.sellPrice = 3; // (as 海沫 raises its own)
    ps.recompute();
    m.dispatch(ps, 'onPrepEnd', { round: m.round });
    const want = {};
    for (const b of own) want[b] = (want[b] ?? 0) + 1 * multi;
    for (const b of front.bonds) want[b] = (want[b] ?? 0) + 3 * multi;
    for (const [b, n] of Object.entries(want)) assert.equal(ps.layers[b] ?? 0, n, `${id} ${b}`);
    assert.ok(ps.board.get(tileKey(r, c + 1)) === other);
  }
});

test('棘刺 garrison_32: at 休整期结束 the active 伊比利亚 gains the board\'s sell prices (精锐 ×2), at most 12 (24)', () => {
  for (const [id, multi, cap] of [['chess_char_5_04_a', 1, 12], ['chess_char_5_04_b', 2, 24]]) {
    const { m, ps } = setup({ active: ['iberiaShip'] });
    place(m, ps, id);
    const a = place(m, ps, 'chess_char_4_05_a'); // 温蒂: 3
    place(m, ps, 'chess_char_1_01_a');
    give(m, ps, 'chess_char_4_05_a', 'hand');     // the hand does not count
    ps.recompute();
    m.dispatch(ps, 'onPrepEnd', { round: m.round });
    assert.equal(ps.layers.iberiaShip ?? 0, (1 + 3 + 1) * multi, id);
    a.sellPrice = 30;
    m.dispatch(ps, 'onPrepEnd', { round: m.round });
    assert.equal(ps.layers.iberiaShip, (1 + 3 + 1) * multi + cap, `${id}: at most ${cap}`);
    noViolations(m);
  }
});

test('灵知 garrison_55: 获得时, the next manual refresh (paid) shows at least 1 (精锐 2) 谢拉格 operator, even after selling it; once', () => {
  const kjerag = (m, ps) => ps.shop.slots.filter((s) => s && s.kind === 'chess' && m.gd.chess(s.id)?.bonds.includes('kjeragShip')).length;
  for (const [id, need] of [['chess_char_4_09_a', 1], ['chess_char_4_09_b', 2]]) {
    assert.equal(GB(`garrison_55_${id.slice(-1)}`).count, need);
    let fewer = 0;
    for (let seed = 1; seed <= 12; seed++) {
      {
        // without 灵知 the same refresh often shows fewer
        const { m, ps } = setup({ seed });
        ps.refresh();
        if (kjerag(m, ps) < need) fewer++;
      }
      const { m, ps } = setup({ seed });
      const p = give(m, ps, id, 'hand');
      m.dispatch(ps, 'onGain', { piece: p });
      assert.equal(ps.sell(p.uid).ok, true, 'sold before the refresh');
      const f0 = ps.funds;
      assert.equal(ps.refresh().ok, true);
      assert.equal(f0 - ps.funds, m.gd.refreshPrice, 'paid as usual');
      assert.ok(kjerag(m, ps) >= need, `${id} seed ${seed}: ${kjerag(m, ps)} 谢拉格`);
      assert.equal(ps.counters['gar:specialRefresh:kjeragShip'] ?? 0, 0, 'once');
      noViolations(m);
    }
    assert.ok(fewer > 0, `${id}: some seeds roll fewer without it (${fewer})`);
  }
});
