// tools/ui-check compare: the numbers half (no browser) — spec resolution, the official rect from a
// `ui_inspect.py layout` JSON (schema 1), edge differences, listing, 「모름」 and skipped pairs, the UI-size solve.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveSpec, officialRect, edgeDiff, comparePairs, formatReport, UNKNOWN } from '../tools/ui-check/compare.mjs';
import { solveUiK } from '../tools/ui-check/browser.mjs';

const canvas = { reference: [1280, 720], units: [1325.6, 745.65], screen: [1920, 1080], pxPerUnit: 1.4484, offset: [0, 0] };
const layout = (nodes) => ({ schema: 1, root: 'row', canvas, nodes });
const node = (p, screen, extra = {}) => ({ path: p, name: p.split('/').pop(), activeInHierarchy: true, screen, ...extra });
const ROW = layout([
  node('row', { x: 0, y: 200, w: 1920, h: 116 }),
  node('row/card', { x: 34, y: 214.6, w: 372.3, h: 113.15 }),
  node('row/combo', { x: UNKNOWN, y: 255.4, w: UNKNOWN, h: 33.4 }, { unresolved: ['ContentSizeFitter on row/combo (x): its PreferredSize is 「모름」'] }),
]);
const baseSpec = (pairs, extra = {}) => ({ official: { shot: 'shot.jpg', layouts: { row1: 'row1.json' } }, ours: { url: '/x.html' }, pairs, ...extra });
const read = (layouts) => (p) => {
  const j = layouts[path.basename(p)];
  if (!j) throw new Error(`no ${p}`);
  return j;
};

test('ui-check: the spec takes viewport and unit from the layouts and resolves paths beside the spec', () => {
  const s = resolveSpec(baseSpec([{ layout: 'row1', node: 'row/card', sel: '.card' }]), '/tmp/spec', read({ 'row1.json': ROW }));
  assert.deepEqual(s.ours.viewport, [1920, 1080]);
  assert.equal(s.ours.uiPxPerUnit, 1.4484);
  assert.equal(s.shot, '/tmp/spec/shot.jpg');
  assert.equal(s.tol, 2);
  assert.equal(s.pairs[0].name, 'card');
  assert.equal(s.pairs[0].axes, 'xy');
});

test('ui-check: a spec it cannot compare stops instead of guessing', () => {
  const r = read({ 'row1.json': ROW, 'old.json': { ...ROW, schema: 0 }, 'noscreen.json': { ...ROW, canvas: { ...canvas, pxPerUnit: null } } });
  assert.throws(() => resolveSpec(baseSpec([{ layout: 'row2', node: 'row', sel: 'a' }]), '/', r), /no known layout/);
  assert.throws(() => resolveSpec({ ...baseSpec([{ layout: 'row1', node: 'row', sel: 'a' }]), official: { layouts: { row1: 'old.json' } } }, '/', r), /schema 0/);
  assert.throws(() => resolveSpec({ ...baseSpec([{ layout: 'row1', node: 'row', sel: 'a' }]), official: { layouts: { row1: 'noscreen.json' } } }, '/', r), /without --screen/);
  assert.throws(() => resolveSpec(baseSpec([{ layout: 'row1', node: 'row', sel: 'a', axes: 'q' }]), '/', r), /axes "q"/);
  assert.throws(() => resolveSpec(baseSpec([{ layout: 'row1', node: 'row', sel: 'a' }], { ours: { url: '/x', dpr: 2 } }), '/', r), /dpr 1/);
  assert.throws(() => officialRect(ROW, 'row/nope'), /no node "row\/nope"/);
});

test('ui-check: edges are ours − official, and only the asked ones count for the worst', () => {
  const off = { x: 10, y: 20, w: 100, h: 50 }, ours = { x: 13, y: 20.5, w: 90, h: 50 };
  const d = edgeDiff(off, ours, 'xy');
  assert.deepEqual([d.left, d.top, d.right, d.bottom, d.centre, d.middle, d.worst], [3, 0.5, -7, 0.5, -2, 0.5, 7]);
  assert.equal(edgeDiff(off, ours, 'y').worst, 0.5);
  assert.equal(edgeDiff(off, ours, 'lm').worst, 3);
  assert.equal(edgeDiff(off, ours, 'c').worst, 2);
});

test('ui-check: pairs over tol are listed; 「모름」, skipped and missing apart', () => {
  const spec = resolveSpec(baseSpec([
    { name: 'card ok', layout: 'row1', node: 'row/card', sel: '.a' },
    { name: 'card off', layout: 'row1', node: 'row/card', sel: '.b' },
    { name: 'combo', layout: 'row1', node: 'row/combo', sel: '.c' },
    { name: 'font', layout: 'row1', node: 'row/card', sel: '.d', skip: 'substituted font' },
    { name: 'gone', layout: 'row1', node: 'row', sel: '.e' },
  ]), '/', read({ 'row1.json': ROW }));
  const res = comparePairs(spec, [
    { x: 35.5, y: 214, w: 372, h: 113 }, { x: 167, y: 222.1, w: 381.6, h: 115.9 }, { x: 1, y: 1, w: 1, h: 1 }, { x: 0, y: 0, w: 5, h: 5 }, null,
  ]);
  assert.deepEqual(res.rows.map((r) => r.status), ['ok', 'listed', 'unknown', 'skipped', 'missing']);
  assert.equal(res.listed[0].diff.left, 133);
  assert.match(res.unknown[0].why[0], /PreferredSize/);
  const text = formatReport(res, spec.tol).join('\n');
  assert.match(text, /^over 2px: 1 {2}missing: 1 {2}unknown: 1 {2}skipped: 1 {2}ok: 1/);
  assert.match(text, /#2 card off \[xy\] worst 142.3/);
  assert.match(text, /#4 font: skipped — substituted font/);
});

test('ui-check: the screenshot offset moves our rects into the image', () => {
  const shifted = layout(ROW.nodes);
  shifted.canvas = { ...canvas, offset: [0, -120] };
  const spec = resolveSpec(baseSpec([{ layout: 'row1', node: 'row/card', sel: '.a' }]), '/', read({ 'row1.json': shifted }));
  const res = comparePairs(spec, [{ x: 34, y: 334.6, w: 372.3, h: 113.15 }]);
  assert.equal(res.rows[0].ours.y, 214.6);
  assert.equal(res.rows[0].status, 'ok');
});

test('ui-check: the UI-size factor that gives a px per unit (css/hud-art.css is linear in k)', () => {
  // 1920×1080: u = 1.5k (k 1 → 1.5, k .9 → 1.35)
  assert.ok(Math.abs(solveUiK(1.4484, { k: 1, u: 1.5 }, { k: 0.9, u: 1.35 }) - 0.9656) < 1e-9);
  assert.throws(() => solveUiK(1.6, { k: 1, u: 1.5 }, { k: 0.9, u: 1.35 }), /outside/);
  // a small window: the clamp keeps u whatever k is
  assert.equal(solveUiK(1, { k: 1, u: 1 }, { k: 0.9, u: 1 }), 1);
  assert.throws(() => solveUiK(0.9, { k: 1, u: 1 }, { k: 0.9, u: 1 }), /the clamp/);
});
