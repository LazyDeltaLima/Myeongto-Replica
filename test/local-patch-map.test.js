// Local patch (src/docs/LOCAL-PATCH.md 「배치 UI」·「공식 맵 렌더링」): the official equip-slot popup's state
// (ui/equipHover.js), the blue bench tint (board3d/tileOverlay.js) and what the official stage scene leaves out
// (board3d/scene.js: no procedural 活性源石 crust, no field edges).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placementContext } from '../public/js/ui/gameLogic.js';
import { equipHoverState } from '../public/js/ui/equipHover.js';
import { TINT, BENCH_TINT } from '../public/js/render/board3d/tileOverlay.js';
import { GEO } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const chess = load('chess.json');
const items = load('items.json');
const tokens = load('tokens.json');
const STAGE = load('stages.json').act2autochess_m01;
const getChess = (id) => chess[id] || null;
const getItem = (id) => items[id] || null;
const getToken = (id) => tokens[id] || null;

let uid = 0;
const op = (id, extra = {}) => ({ uid: ++uid, kind: 'chess', id, golden: false, tier: chess[id]?.tier ?? 1, items: [], ...extra });
const item = (id) => ({ uid: ++uid, kind: 'item', id, golden: false, tier: 1 });
function ctxWith(board, hand) {
  const h = new Array(GEO.HAND_SIZE).fill(null);
  for (const [i, p] of hand) h[i] = p;
  const priv = { alive: true, ready: false, funds: 10, board, hand: h, temp: new Array(GEO.TEMP_SIZE).fill(null), deployCap: 8,
    deployCount: board.filter((p) => p.kind === 'chess').length, canReady: true, loadout: null,
    shop: { level: 3, maxLevel: 6, upgradePrice: 8, refreshPrice: 1, freeRefreshes: 0, frozen: false, slots: [] } };
  return placementContext({ priv, stage: STAGE, editable: true, getChess, getItem, getToken });
}

describe('local patch: official equip-slot popup', () => {
  const EQUIP = 'chess_item_1_01_e_a';
  const empty = { ...op('chess_char_1_02_a'), row: 9, col: 3 };
  const one = { ...op('chess_char_1_01_a'), row: 10, col: 4, items: [{ uid: 800, id: 'chess_item_1_02_e_a' }] };
  const full = { ...op('chess_char_1_02_a'), row: 9, col: 5, items: [{ uid: 900, id: 'chess_item_1_02_e_a' }, { uid: 901, id: 'chess_item_1_05_e_a' }] };
  const tok = { uid: ++uid, kind: 'token', id: 'token_10028_vigil_wolf', count: 1, row: 9, col: 4 };
  const bench = op('chess_char_1_01_a');
  const eq = item(EQUIP);
  const art = item('chess_item_6_01_m');
  const ctx = ctxWith([empty, one, full, tok], [[0, bench], [1, eq], [2, art]]);

  test('an operator that takes the item: its slots, the item, the replace state', () => {
    assert.deepEqual(equipHoverState(ctx, eq.uid, { row: 9, col: 3, area: 'board' }),
      { uid: empty.uid, itemId: EQUIP, row: 9, col: 3, items: [], full: false });
    assert.deepEqual(equipHoverState(ctx, eq.uid, { row: 10, col: 4, area: 'board' })?.items, ['chess_item_1_02_e_a']);
    const f = equipHoverState(ctx, eq.uid, { row: 9, col: 5, area: 'board' });
    assert.equal(f.full, true, 'both slots used ⇒ the drop replaces');
    assert.equal(f.items.length, 2);
    // a bench operator: the hand row, the slot index as the column
    assert.deepEqual(equipHoverState(ctx, eq.uid, { row: GEO.HAND_ROW, col: 0, area: 'hand', idx: 0 }),
      { uid: bench.uid, itemId: EQUIP, row: GEO.HAND_ROW, col: 0, items: [], full: false });
  });

  test('no popup: tokens, empty tiles, the hand items, arts, nothing under the pointer', () => {
    assert.equal(equipHoverState(ctx, eq.uid, { row: 9, col: 4, area: 'board' }), null, 'a token carries no items');
    assert.equal(equipHoverState(ctx, eq.uid, { row: 11, col: 6, area: 'board' }), null);
    assert.equal(equipHoverState(ctx, eq.uid, { row: GEO.HAND_ROW, col: 2, area: 'hand', idx: 2 }), null, 'item ↔ item swap');
    assert.equal(equipHoverState(ctx, art.uid, { row: 9, col: 3, area: 'board' }), null, 'an art is cast, not worn');
    assert.equal(equipHoverState(ctx, eq.uid, null), null);
    assert.equal(equipHoverState(ctx, eq.uid, { row: 8, col: 4, area: 'temp', idx: 0 }), null);
  });
});

describe('local patch: bench tint and the official scene', () => {
  test('the bench tint is teal (KR capture: plank 245,198,138 → ≈ 140,215,177), the board tint green', () => {
    const out = [245, 198, 138].map((v, i) => Math.round(Math.min(255, 2 * BENCH_TINT[i] * v)));
    for (const [i, want] of [140, 215, 177].entries()) assert.ok(Math.abs(out[i] - want) <= 8, `${out} ≈ 140,215,177`);
    assert.ok(TINT[1] > TINT[0] && TINT[1] > TINT[2]);
  });

  test('the official scene draws neither the procedural 活性源石 crust nor the cyan field edges', () => {
    const src = readFileSync(path.join(ROOT, 'public/js/render/board3d/scene.js'), 'utf8');
    const branch = src.slice(src.indexOf('if (official) {'), src.indexOf('M.board = this._mesh('));
    assert.ok(branch.includes('infection: false'), 'no crust over the scene decal');
    assert.ok(!branch.includes('_buildEdges'), 'no field edges');
    // the procedural board (no extracted scene) keeps both — the upstream look
    const rest = src.slice(src.indexOf('M.board = this._mesh('));
    assert.ok(rest.includes('this._buildEdges(board)') && rest.includes('this._buildTerrain(board)'));
  });
});
