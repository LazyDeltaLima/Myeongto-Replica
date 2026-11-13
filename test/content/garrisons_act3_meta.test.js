// 卫戍协议：规程's 特质 on the prep side (server/sim/content/garrisons/prep/*.js — the season's new SERVER_* keys) through a
// real match on the season's data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, giveItem, legalTileFor } from '../match/harness.js';
import { registryFor } from '../../server/match/effectsMeta.js';
import { collectViolations } from '../../server/match/invariants.js';

const REG = registryFor(ACT3_ON_BASE_FIELD);

function setup({ seed = 43, active = [] } = {}) {
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: REG, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0;
  ps.funds = 50; ps.layers = {}; ps.pendingFunds = 0; ps.shop.freeRefreshes = 0; ps.counters = {};
  ps.bandId = null;
  // the bonds these tests need active: a count bonus well above every threshold
  for (const b of active) ps.bondCountBonus[b] = 12;
  ps.recompute();
  return { h, m, ps };
}
const place = (m, ps, id) => give(m, ps, id, 'board', legalTileFor(m, ps, id, new Set([...ps.board.keys()])));
const ownedItems = (ps) => [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'item').map((p) => p.id);
const noViolations = (m) => assert.deepEqual(collectViolations(m), []);

test('极光 garrison_50: each 获得时 gives 谢拉格 1, 2, 3 … layers (no active bond needed), at most 12 a time', () => {
  const { m, ps } = setup();
  const seen = [];
  for (let i = 0; i < 13; i++) {
    const before = ps.layers.kjeragShip ?? 0;
    const p = give(m, ps, 'chess_char_3_07_a', 'hand');
    m.dispatch(ps, 'onGain', { piece: p });
    seen.push((ps.layers.kjeragShip ?? 0) - before);
    ps.hand[ps.hand.indexOf(p)] = null;
    ps.returnCopies(p);
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12]);
  noViolations(m);
});

test('忍冬 garrison_74: 获得时 1, 1, 2, 2, 3, 3 … free refreshes (up a step every 2 runs, at most 3)', () => {
  const { m, ps } = setup();
  const seen = [];
  for (let i = 0; i < 7; i++) {
    const before = ps.shop.freeRefreshes;
    const p = give(m, ps, 'chess_char_3_13_a', 'hand');
    m.dispatch(ps, 'onGain', { piece: p });
    seen.push(ps.shop.freeRefreshes - before);
    ps.hand[ps.hand.indexOf(p)] = null;
    ps.returnCopies(p);
  }
  assert.deepEqual(seen, [1, 1, 2, 2, 3, 3, 3]);
});

test('流明 garrison_31 / 夜莺 163: the battle\'s surviving operators × 1 / 2 → 伊比利亚·聚合 / its own active bonds (夜莺 at most 9 / 18)', () => {
  const units = (alive, dead) => [
    ...Array.from({ length: alive }, (_, i) => ({ uid: 100 + i, defId: 'chess_char_1_01_a', alive: true })),
    ...Array.from({ length: dead }, (_, i) => ({ uid: 200 + i, defId: 'chess_char_1_02_a', alive: false })),
    { uid: 300, defId: 'token_not_a_chess', alive: true },
  ];
  {
    const { m, ps } = setup({ active: ['iberiaShip', 'docShip'] });
    place(m, ps, 'chess_char_4_06_a');
    m.dispatch(ps, 'onBattleResult', { result: { unitsEnd: units(5, 2) } });
    assert.deepEqual([ps.layers.iberiaShip, ps.layers.docShip], [5, 5]);
    noViolations(m);
  }
  {
    const { m, ps } = setup({ active: ['iberiaShip'] });
    place(m, ps, 'chess_char_4_06_a');
    m.dispatch(ps, 'onBattleResult', { result: { unitsEnd: units(5, 0) } });
    assert.deepEqual([ps.layers.iberiaShip, ps.layers.docShip ?? 0], [5, 0], '聚合 not active');
  }
  for (const [id, per, cap] of [['chess_char_4_22_a', 1, 9], ['chess_char_4_22_b', 2, 18]]) {
    const own = ACT3.chess[id].bonds;
    const { m, ps } = setup({ active: own });
    place(m, ps, id);
    m.dispatch(ps, 'onBattleResult', { result: { unitsEnd: units(4, 0) } });
    for (const b of own) assert.equal(ps.layers[b], 4 * per, `${id} ${b}`);
    m.dispatch(ps, 'onBattleResult', { result: { unitsEnd: units(12, 0) } });
    for (const b of own) assert.equal(ps.layers[b], 4 * per + Math.min(cap, 12 * per), `${id} ${b}: max_count`);
  }
});

test('涤火杰西卡 garrison_83: 休整期结束时 each board operator carrying equipment → 维多利亚·坚守 +2 (elite +4)', () => {
  for (const [id, per] of [['chess_char_4_14_a', 2], ['chess_char_4_14_b', 4]]) {
    const { m, ps } = setup({ active: ['victoriaShip', 'steadShip'] });
    const j = place(m, ps, id);
    const a = place(m, ps, 'chess_char_1_01_a');
    place(m, ps, 'chess_char_1_02_a');
    for (const holder of [j, a]) {
      const it = giveItem(m, ps, 'chess_item_1_01_e_a', 'hand');
      ps._detach(ps.find(it.uid)); // (规程 moved it into the 装备区)
      holder.items.push(it);
    }
    ps.recompute();
    m.dispatch(ps, 'onPrepEnd', { round: m.round });
    assert.deepEqual([ps.layers.victoriaShip, ps.layers.steadShip], [2 * per, 2 * per], id);
  }
});

test('白铁 garrison_84: 进入休整期时 its equipment becomes the elite version', () => {
  const { m, ps } = setup();
  const w = place(m, ps, 'chess_char_4_15_a');
  const it = giveItem(m, ps, 'chess_item_1_01_e_a', 'hand');
  ps._detach(ps.find(it.uid)); // (规程 moved it into the 装备区)
  w.items.push(it);
  ps.recompute();
  m.dispatch(ps, 'onPrepStart', { round: m.round });
  assert.equal(w.items[0].id, 'chess_item_1_01_e_b');
  noViolations(m);
});

test('酒神 garrison_158 / 159: 进入休整期时 one / two random equipment of at most the 调度中心 level', () => {
  for (const [id, n] of [['chess_char_6_07_a', 1], ['chess_char_6_07_b', 2]]) {
    const { m, ps } = setup();
    place(m, ps, id);
    const before = ownedItems(ps).length;
    // (two of a kind would merge into its elite: count the grants)
    let grants = 0;
    const orig = ps.acquireItem.bind(ps);
    ps.acquireItem = (...args) => { grants++; return orig(...args); };
    m.dispatch(ps, 'onPrepStart', { round: m.round });
    ps.acquireItem = orig;
    const got = ownedItems(ps).slice(before);
    assert.equal(grants, n, `${id}: the elite's two 「两件」 records give two in all`);
    for (const g of got) assert.ok(ACT3.items[g].tier <= ps.shop.level, `${g} tier ${ACT3.items[g].tier}`);
    noViolations(m);
  }
});

test('「每回合至多叠加N层」: 타락사쿰 36 · 클로저 125 · 시 128 (per operator gained) and 아스트젠 더 라이트체이서 121 (per 3 funds spent) stop at bb.max', () => {
  const cases = [
    // [chess, its active bonds, the round stat, a value under the cap → layers, a value past it → the cap]
    ['chess_char_3_06_a', ['yanShip', 'docShip'], 'gainedChess', [3, 6], [20, 16]],
    ['chess_char_3_06_b', ['yanShip', 'docShip'], 'gainedChess', [3, 12], [20, 32]],
    ['chess_char_5_21_a', ['investShip'], 'gainedChess', [5, 10], [9, 16]],
    ['chess_char_6_17_b', ['yanShip', 'arcaneShip'], 'gainedChess', [4, 16], [30, 48]],
    ['chess_char_5_18_a', ['arcaneShip'], 'spent', [10, 6], [40, 18]],
    ['chess_char_5_18_b', ['arcaneShip'], 'spent', [10, 12], [40, 36]],
  ];
  for (const [id, bonds, stat, ...runs] of cases) {
    for (const [v, want] of runs) {
      const { m, ps } = setup({ active: bonds });
      place(m, ps, id);
      ps.round[stat] = v;
      m.dispatch(ps, 'onPrepEnd', { round: m.round });
      for (const b of bonds) assert.equal(ps.layers[b] ?? 0, want, `${id} ${stat} ${v}: ${b}`);
      noViolations(m);
    }
  }
});
