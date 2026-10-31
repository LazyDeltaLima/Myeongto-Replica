// Local patch (src/docs/LOCAL-PATCH.md 「배치 UI」): the official placement UI — the 3D board's deploy tint / range stripe
// geometry (render/board3d/tileOverlay.js) and the direction selector's ground-plane basis (ui/placeArt.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { columnData, TINT, STRIPES } from '../../public/js/render/board3d/tileOverlay.js';

describe('local patch: placement UI', () => {
  test('tile columns: a top quad per tile, 4 sides more on a raised tile; uv continuous across tiles', () => {
    const h = (r, c) => (r === 10 && c === 5 ? 0.4 : 0);
    const d = columnData([[9, 4], [10, 5], [9, 4], { row: 9, col: 5 }, [1.5, 2]], h);
    assert.ok(d);
    // (9,4) once, (10,5) raised = 5 quads, (9,5) → 7 quads
    assert.equal(d.position.length, 7 * 4 * 3);
    assert.equal(d.index.length, 7 * 6);
    assert.ok(d.index instanceof Uint16Array);
    // the first quad: (9,4) top at z 0, corners ±0.5
    assert.deepEqual(Array.from(d.position.slice(0, 12)), [3.5, 8.5, 0, 4.5, 8.5, 0, 4.5, 9.5, 0, 3.5, 9.5, 0]);
    assert.deepEqual(Array.from(d.uv.slice(0, 8)), [4, 9, 5, 9, 5, 10, 4, 10]);
    // the raised tile's top sits on its height, its front side runs from the ground up
    const z = (q, k) => d.position[q * 12 + k * 3 + 2];
    assert.ok(Math.abs(z(1, 0) - 0.4) < 1e-6);
    assert.equal(z(2, 0), 0);
    assert.ok(Math.abs(z(2, 3) - 0.4) < 1e-6);
    assert.equal(columnData([], h), null);
    assert.equal(columnData(null, h), null);
  });

  test('constants: 2× modulate tint fitted to the capture; stripes = range_material', () => {
    // a grey top 128,125,113 → ≈ 66,130,66 (KR capture): 2 · src · dst
    const out = [128, 125, 113].map((v, i) => Math.round(Math.min(255, 2 * TINT[i] * v)));
    for (const [i, want] of [66, 130, 66].entries()) assert.ok(Math.abs(out[i] - want) <= 10, `${out} ≈ 66,130,66`);
    assert.equal(STRIPES.alpha, 0.749);
    assert.equal(STRIPES.speed, 0.5);
  });

  test('direction selector basis: local units ↔ client px on the ground plane', async () => {
    const { dirBasis, insideDiamond, R0, DIR_HALF_TILES } = await import('../../public/js/ui/placeArt.js');
    // a tile 100 px wide, 80 px deep (foreshortened), centred on (500, 400)
    const g = { x: 500, y: 400, s: 100, poly: [[450, 360], [550, 360], [550, 440], [450, 440]] };
    const b = dirBasis(g);
    assert.ok(b);
    const [a, bb, c, d, e, f] = b.m;
    const pt = (x, y) => [a * x + c * y + e, bb * x + d * y + f];
    // RIGHT vertex DIR_HALF_TILES tiles to the right, UP vertex that many tile depths up
    assert.deepEqual(pt(R0, 0).map((n) => Math.round(n)), [500 + 100 * DIR_HALF_TILES, 400]);
    assert.deepEqual(pt(0, -R0).map((n) => Math.round(n)), [500, 400 - 80 * DIR_HALF_TILES]);
    const [u, v] = b.toLocal(...pt(37, -91));
    assert.ok(Math.abs(u - 37) < 1e-6 && Math.abs(v + 91) < 1e-6);
    assert.equal(insideDiamond(b, 500, 400), true);
    assert.equal(insideDiamond(b, 500 + 100 * DIR_HALF_TILES * 0.9, 400), true);
    assert.equal(insideDiamond(b, 500 + 100 * DIR_HALF_TILES * 0.7, 400 - 80 * DIR_HALF_TILES * 0.7), false);
    assert.equal(dirBasis({ x: 0, y: 0, s: 1 }), null);
  });

  test('selection menu: underframe_panel / menu button layout on the selector\'s ground plane', async () => {
    const { menuBasis, menuLayout, menuRect } = await import('../../public/js/ui/underframeArt.js');
    const { DIR_HALF_TILES } = await import('../../public/js/ui/placeArt.js');
    const g = { x: 500, y: 400, s: 100, poly: [[450, 360], [550, 360], [550, 440], [450, 440]] };
    const b = menuBasis(g);
    // 301 selector units × 2.5 = DIR_HALF_TILES tiles
    assert.ok(Math.abs(b.pt(213 * Math.SQRT2 * 2.5, 0)[0] - (500 + 100 * DIR_HALF_TILES)) < 1e-6);
    // the mirrored Final Assault half keeps 撤退 on the left
    const m = menuBasis({ ...g, poly: [[550, 360], [450, 360], [450, 440], [550, 440]] });
    assert.ok(m.pt(-100, 0)[0] < 500);
    // field operator: 撤退 on the upper-left edge (btn_withdraw −195, 195 × root 2), 出售 at the sell pos (208, 219 × 2)
    const field = menuLayout({ retreat: true, sell: 2, destroy: false }, true);
    assert.deepEqual(field.withdraw.at, [-390, -390]);
    assert.deepEqual(field.util.at, [416, -438]);
    assert.equal(field.util.k, 2);
    // field summon: 撤退 only; bench operator: the menu button's plate, no 撤退; bench item: the plate (DESTROY)
    assert.equal(menuLayout({ retreat: true, sell: null, destroy: false }, true).util, null);
    const bench = menuLayout({ retreat: false, sell: 1, destroy: false }, false);
    assert.equal(bench.withdraw, null);
    assert.ok(bench.util.at[0] > 0 && bench.util.k < field.util.k);
    assert.ok(menuLayout({ retreat: false, sell: null, destroy: true }, false).util);
    // the buttons' rect: above-left and above-right of the piece, the piece's tile inside
    const r = menuRect(g, { retreat: true, sell: 2, destroy: false }, true);
    assert.ok(r.left < 500 && r.right > 500 && r.top < 400 && r.bottom >= 400);
    // a field operator's skill button: group_skill at the lower-right edge (195, −195 × root 2), the range toggle beside
    // it (165, −10) only when the skill has its own range; never on the bench menu
    const op = { retreat: true, sell: 2, destroy: false };
    const sk = menuLayout(op, true, { grid: [[0, 0], [0, 1]] }).skill;
    assert.deepEqual(sk.at, [390, 390]);
    assert.deepEqual(sk.toggle, [720, 410]);
    assert.equal(menuLayout(op, true, { grid: null }).skill.toggle, null);
    assert.equal(menuLayout(op, true).skill, null);
    assert.equal(menuLayout({ retreat: false, sell: 1, destroy: false }, false, { grid: null }).skill, null);
    // it widens the rect the detail card keeps clear of, down and to the right
    const rs = menuRect(g, op, true, { grid: [[0, 0]] });
    assert.ok(rs.right > r.right && rs.bottom > r.bottom);
  });
});
