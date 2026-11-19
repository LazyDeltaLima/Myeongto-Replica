// tools/local-extract/ui_layout.py (`ui_inspect.py layout`): an official UI prefab's RectTransform tree solved into
// absolute rects the way Unity's UGUI lays it out — anchors, pivots, scales, Horizontal/VerticalLayoutGroup,
// GridLayoutGroup (with the cells a list fills at run time added by `grid_items`), LayoutElement, ContentSizeFitter —
// and 「모름」 (never a default) for what the tool cannot know: a Text's preferred size, a rotation, a game script that
// may report a layout size, a missing field. The solver runs
// without UnityPy on hand-made trees; the last block reads the official 팀원 정보 창 prefab from the CN client and skips
// when that client (or the extraction environment) is not on this machine.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools/local-extract');
const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);
// UTF-8 pipes: a Windows Python writes stdout in the console code page and 「모름」 comes back as mojibake
const ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' };
const M = '모름';

/** Solve `tree` (ui_layout node dicts) in a canvas; returns {path: node}. */
function solve(tree, opts = {}) {
  const src = `import sys, json\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport ui_layout as L\n`
    + `o = json.loads(sys.stdin.read())\n`
    + `sp = o.get('sprites') or {}\n`
    + `nodes = L.solve(o['tree'], o.get('canvas', [1280, 720]), sprite=lambda r: sp.get(str(r.get('m_PathID'))) if r.get('m_PathID') else False, `
    + `parent_rect=o.get('parent'), px_per_unit=o.get('ppu'), css_px_per_unit=o.get('css'), grid_items=o.get('grid'))\n`
    + `print(json.dumps(nodes, ensure_ascii=False))`;
  const r = spawnSync(PY, ['-c', src], { encoding: 'utf8', env: ENV, input: JSON.stringify({ tree, ...opts }) });
  assert.equal(r.status, 0, r.stderr);
  return Object.fromEntries(JSON.parse(r.stdout).map((n) => [n.path, n]));
}

const rt = (o = {}) => ({ amin: [0.5, 0.5], amax: [0.5, 0.5], pos: [0, 0], size: [0, 0], pivot: [0.5, 0.5], scale: [1, 1], ...o });
const node = (name, r, comps = [], children = []) => ({ name, active: true, rt: rt(r), comps, children });
const UI = 'UnityEngine.UI.';
const le = (f = {}) => ({ cls: `${UI}LayoutElement`, enabled: true, f: { m_IgnoreLayout: 0, m_MinWidth: -1, m_MinHeight: -1, m_PreferredWidth: -1, m_PreferredHeight: -1, m_FlexibleWidth: -1, m_FlexibleHeight: -1, m_LayoutPriority: 1, ...f } });
const group = (kind, f = {}) => ({ cls: `${UI}${kind}LayoutGroup`, enabled: true, f: {
  m_Padding: { m_Left: 0, m_Right: 0, m_Top: 0, m_Bottom: 0 }, m_ChildAlignment: 0, m_Spacing: 0, m_ChildForceExpandWidth: 0,
  m_ChildForceExpandHeight: 0, m_ChildControlWidth: 0, m_ChildControlHeight: 0, m_ChildScaleWidth: 0, m_ChildScaleHeight: 0, m_ReverseArrangement: 0, ...f } });
const grid = (f = {}) => ({ cls: `${UI}GridLayoutGroup`, enabled: true, f: {
  m_Padding: { m_Left: 0, m_Right: 0, m_Top: 0, m_Bottom: 0 }, m_CellSize: { x: 100, y: 100 }, m_Spacing: { x: 0, y: 0 }, m_StartCorner: 0,
  m_StartAxis: 0, m_ChildAlignment: 0, m_Constraint: 0, m_ConstraintCount: 2, ...f } });
const fitter = (h, v) => ({ cls: `${UI}ContentSizeFitter`, enabled: true, f: { m_HorizontalFit: h, m_VerticalFit: v } });
const text = () => ({ cls: `${UI}Text`, enabled: true, f: { m_Color: { r: 1, g: 1, b: 1, a: 1 }, m_FontData: { m_Font: { m_FileID: 0, m_PathID: 0 }, m_FontSize: 15, m_FontStyle: 0, m_BestFit: 0, m_MinSize: 1, m_MaxSize: 15, m_Alignment: 3, m_AlignByGeometry: 0, m_RichText: 1, m_HorizontalOverflow: 0, m_VerticalOverflow: 0, m_LineSpacing: 1 }, m_Text: '' } });
const box = (n) => [n.rect.x, n.rect.y, n.rect.w, n.rect.h];

describe('ui_layout.py solver (no UnityPy needed)', { skip: !PY && 'no python3' }, () => {
  test('anchors, pivot, anchoredPosition: rects in canvas units from the top left; a stretched node takes the parent\'s size', () => {
    const t = node('root', { amin: [0, 0], amax: [1, 1] }, [], [
      node('left', { amin: [0, 0.5], amax: [0, 0.5], pos: [58, 0], size: [72, 72] }),
      node('band', { amin: [0, 0.5], amax: [1, 0.5], pos: [0, -11.96], size: [0, 120] }),
      node('corner', { amin: [1, 1], amax: [1, 1], pos: [-10, -10], size: [40, 20], pivot: [1, 1] }),
    ]);
    const n = solve(t);
    assert.deepEqual(box(n.root), [0, 0, 1280, 720]);
    assert.deepEqual(box(n['root/left']), [22, 324, 72, 72]);
    assert.deepEqual(box(n['root/band']), [0, 311.96, 1280, 120], 'y anchored at the middle, 11.96 lower (y up in Unity)');
    assert.deepEqual(box(n['root/corner']), [1230, 10, 40, 20]);
  });

  test('VerticalLayoutGroup + ContentSizeFitter: the 팀원 정보 창 slots — 80 high, 4 apart, the ignored shadow left alone', () => {
    const slot = (k) => node(`pos_${k}`, { amin: [0, 0], amax: [0, 0], size: [100, 0] }, [le({ m_MinHeight: 80, m_PreferredHeight: 80 })]);
    const t = node('dialog', { amin: [0, 0], amax: [1, 1] }, [], [
      node('panel', { amin: [0, 0.5], amax: [1, 0.5], pos: [0, 59.6] }, [group('Vertical', { m_ChildAlignment: 4, m_Spacing: 4, m_ChildControlHeight: 1 }), fitter(0, 2)], [
        node('shadow', { amin: [0, 0], amax: [1, 1], size: [0, 208] }, [le({ m_IgnoreLayout: 1 })]),
        slot(1), slot(2), slot(3), slot(4),
      ]),
    ]);
    const n = solve(t);
    assert.deepEqual(box(n['dialog/panel']), [0, 134.4, 1280, 332], 'the fitter: 4 × 80 + 3 × 4');
    for (const k of [1, 2, 3, 4]) assert.deepEqual(box(n[`dialog/panel/pos_${k}`]), [590, 134.4 + 84 * (k - 1), 100, 80], `pos_${k}`);
    assert.deepEqual(n['dialog/panel/pos_1'].driven.anchors, [[0, 1], [0, 1]]);
    assert.deepEqual(box(n['dialog/panel/shadow']), [0, 30.4, 1280, 540], 'ignoreLayout: not placed by the group');
    assert.equal(n['dialog/panel/shadow'].driven, undefined);
  });

  test('HorizontalLayoutGroup: padding, spacing, controlled widths, a flexible child takes the surplus; alignment places the rest', () => {
    const t = node('row', { size: [300, 40] }, [group('Horizontal', { m_Padding: { m_Left: 10, m_Right: 10, m_Top: 0, m_Bottom: 0 }, m_Spacing: 5, m_ChildControlWidth: 1, m_ChildAlignment: 4 })], [
      node('a', { size: [999, 20] }, [le({ m_PreferredWidth: 50 })]),
      node('b', { size: [999, 30] }, [le({ m_PreferredWidth: 70, m_FlexibleWidth: 1 })]),
    ]);
    const n = solve(t, { canvas: [300, 40] });
    assert.deepEqual(box(n['row/a']), [10, 10, 50, 20], 'height not controlled: its own 20, centred (MiddleCenter)');
    assert.deepEqual(box(n['row/b']), [65, 5, 225, 30]);
    const t2 = node('row', { size: [300, 40] }, [group('Horizontal', { m_Spacing: 5, m_ChildAlignment: 5 })], [
      node('a', { size: [50, 20] }), node('b', { size: [70, 20] }),
    ]);
    const n2 = solve(t2, { canvas: [300, 40] });
    assert.deepEqual([n2['row/a'].rect.x, n2['row/b'].rect.x], [175, 230], 'MiddleRight, no flexible child: the block at the right');
  });

  test('scale: around the pivot, carried to the children; a rotation is 「모름」', () => {
    const t = node('root', { amin: [0, 0], amax: [1, 1] }, [], [
      node('icon', { size: [58, 58], pos: [0, 9], scale: [0.8, 0.8] }, [], [node('ring', { size: [46, 46] })]),
      node('turned', { size: [10, 10], rotated: true }),
    ]);
    const n = solve(t, { canvas: [200, 200] });
    assert.deepEqual(box(n['root/icon']), [76.8, 67.8, 46.4, 46.4]);
    assert.deepEqual(box(n['root/icon/ring']), [81.6, 72.6, 36.8, 36.8]);
    assert.deepEqual(n['root/icon/ring'].worldScale, [0.8, 0.8]);
    assert.deepEqual(box(n['root/turned']), [M, M, M, M]);
    assert.match(n['root/turned'].unresolved[0], /rotated/);
  });

  test('「모름」, not a default: a Text\'s preferred width, a game script under a controlling group, a grid with a field missing, a missing field', () => {
    const pill = node('pill', { size: [0, 23] }, [group('Horizontal', { m_Padding: { m_Left: 6, m_Right: 6, m_Top: 0, m_Bottom: 0 }, m_ChildControlWidth: 1 }), fitter(2, 0)], [
      node('label', { size: [0, 20] }, [text()]),
    ]);
    const n = solve(node('root', { amin: [0, 0], amax: [1, 1] }, [], [pill]));
    assert.equal(n['root/pill'].rect.w, M);
    assert.equal(n['root/pill'].rect.h, 23, 'the other axis is still solved');
    assert.match(n['root/pill'].unresolved[0], /ContentSizeFitter .*PreferredSize is 「모름」/);
    assert.equal(n['root/pill/label'].rect.x, M);

    // a LayoutElement of higher priority settles the width even though the Text's own is unknown
    const n2 = solve(node('root', { amin: [0, 0], amax: [1, 1] }, [], [
      node('pill', { size: [0, 23] }, [group('Horizontal', { m_ChildControlWidth: 1 }), fitter(2, 0)], [
        node('label', { size: [0, 20] }, [text(), le({ m_PreferredWidth: 40 })]),
      ]),
    ]));
    assert.equal(n2['root/pill'].rect.w, 40);

    const n3 = solve(node('g', { size: [200, 50] }, [group('Horizontal', { m_ChildControlWidth: 1 })], [
      node('a', {}, [{ cls: 'Game.UI.SomeView', enabled: true, f: {} }]),
    ]), { canvas: [200, 50] });
    assert.equal(n3['g/a'].rect.x, M, 'a game script may report a layout size of its own');
    assert.deepEqual(n3['g/a'].unknown, ['Game.UI.SomeView']);

    const partial = { cls: `${UI}GridLayoutGroup`, enabled: true, f: { m_CellSize: { x: 52, y: 68 } } };
    const n4 = solve(node('g', { size: [200, 80] }, [partial], [node('cell', { size: [52, 68] })]), { canvas: [200, 80] });
    assert.deepEqual(box(n4['g/cell']), [M, M, M, M]);
    assert.deepEqual([n4.g.layout.group.kind, n4.g.layout.group.solved], ['grid', false]);
    assert.match(n4['g/cell'].unresolved[0], /GridLayoutGroup with a field missing/);

    const broken = group('Vertical');
    delete broken.f.m_ChildControlHeight;
    const n5 = solve(node('g', { size: [100, 100] }, [broken], [node('a', { size: [10, 10] })]), { canvas: [100, 100] });
    assert.equal(n5['g/a'].rect.y, M);
    assert.match(n5['g/a'].unresolved[0], /field missing/);
  });

  test('GridLayoutGroup: the 팀원 정보 창 bond list — one fixed row, MiddleLeft, its fitter sized to the cells grid_items adds', () => {
    const t = node('Content', { amin: [0, 1], amax: [1, 1], pivot: [0, 1], size: [0, 82.6] }, [
      grid({ m_Padding: { m_Left: 16, m_Right: 16, m_Top: 0, m_Bottom: 0 }, m_CellSize: { x: 52, y: 68 }, m_Spacing: { x: 2, y: 0 }, m_ChildAlignment: 3, m_Constraint: 2, m_ConstraintCount: 1 }),
      fitter(2, 0),
    ], [node('empty', { size: [10, 10] }, [le({ m_IgnoreLayout: 1 })])]);
    const n = solve(node('vp', { amin: [0, 0], amax: [1, 1], pivot: [0, 1] }, [], [t]), { canvas: [400, 82.6], grid: { 'vp/Content': 3 } });
    assert.deepEqual(box(n['vp/Content']), [0, 0, 192, 82.6], 'fitter: 16 + 3 × 52 + 2 × 2 + 16');
    assert.deepEqual([1, 2, 3].map((k) => box(n[`vp/Content/cell_${k}`])), [[16, 7.3, 52, 68], [70, 7.3, 52, 68], [124, 7.3, 52, 68]],
      'cells 54 apart from the left padding, centred on the 82.6 height (MiddleLeft)');
    assert.equal(n['vp/Content/cell_1'].synthetic, true);
    assert.equal(n['vp/Content/empty'].synthetic, undefined, 'an ignoreLayout child is left where it is, not a cell');
    assert.deepEqual(n['vp/Content/cell_1'].driven, { anchors: [[0, 1], [0, 1]], anchoredPosition: [42, -41.3], sizeDelta: [52, 68] });
    assert.equal(n.vp.unresolved, undefined);
    const none = solve(node('vp', { amin: [0, 0], amax: [1, 1], pivot: [0, 1] }, [], [t]), { canvas: [400, 82.6] });
    assert.equal(none['vp/Content'].rect.w, 30, 'no cells: the padding less one spacing, as Unity gives');
  });

  test('GridLayoutGroup: flexible columns from the width, a start corner, the start axis, a fixed column count sizing the height', () => {
    const cells = (k) => Array.from({ length: k }, (_, i) => node(`c${i}`, { size: [5, 5] }));
    const f = { m_CellSize: { x: 30, y: 30 }, m_Spacing: { x: 10, y: 10 } };
    const lr = solve(node('g', { size: [120, 100] }, [grid({ ...f, m_StartCorner: 3 })], cells(5)), { canvas: [120, 100] });
    assert.deepEqual([0, 1, 2, 3, 4].map((i) => [lr[`g/c${i}`].rect.x, lr[`g/c${i}`].rect.y]), [[80, 40], [40, 40], [0, 40], [80, 0], [40, 0]],
      'three columns fit 120 (floor((120 + 10) / 40)); LowerRight fills from the bottom right, rows first');
    const va = solve(node('g', { size: [120, 100] }, [grid({ ...f, m_StartAxis: 1, m_ChildAlignment: 4 })], cells(3)), { canvas: [120, 100] });
    assert.deepEqual([0, 1, 2].map((i) => [va[`g/c${i}`].rect.x, va[`g/c${i}`].rect.y]), [[25, 15], [25, 55], [65, 15]],
      'vertical start: two per column (floor((100 + 10) / 40)), the 70 × 70 block centred (MiddleCenter, 70 = 2 × 30 + 10)');
    const fc = solve(node('g', { size: [80, 0] }, [grid({ ...f, m_Constraint: 1, m_ConstraintCount: 2, m_Padding: { m_Left: 0, m_Right: 0, m_Top: 5, m_Bottom: 5 } }), fitter(0, 2)], cells(5)), { canvas: [200, 200] });
    assert.equal(fc.g.rect.h, 120, 'three rows of a 2-column grid: 5 + 3 × 30 + 2 × 10 + 5');
    assert.deepEqual([fc['g/c4'].rect.x - fc.g.rect.x, fc['g/c4'].rect.y - fc.g.rect.y], [0, 85]);
  });

  test('grid_items stops on a path that names no node or no grid', () => {
    const run = (grid) => spawnSync(PY, ['-c', `import sys, json\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport ui_layout as L\n`
      + `L.solve({'name': 'g', 'active': True, 'rt': {'amin': [0, 0], 'amax': [1, 1], 'pos': [0, 0], 'size': [0, 0], 'pivot': [0.5, 0.5]}, 'comps': [], 'children': []}, [10, 10], grid_items=${grid})`], { encoding: 'utf8', env: ENV });
    assert.match(run("{'nope': 2}").stderr, /no node 'nope'/);
    assert.match(run("{'g': 2}").stderr, /no enabled GridLayoutGroup/);
  });

  test('a game script whose name says it lays out is `unsure`; an Image gives its sprite size, a Sliced one its 9-slice border', () => {
    const img = (type, pid) => ({ cls: `${UI}Image`, enabled: true, f: { m_Sprite: { m_FileID: 0, m_PathID: pid }, m_Type: type, m_PreserveAspect: 0, m_Color: { r: 0.184, g: 0.184, b: 0.184, a: 0.6 }, m_FillCenter: 1, m_PixelsPerUnitMultiplier: 1 } });
    const sprites = { 7: { name: 'detail_list_back', rect: [0, 0, 64, 68], border: [7, 10, 9, 11], pixelsPerUnit: 100 }, 8: { name: 'icon', rect: [0, 0, 30, 24], border: [0, 0, 0, 0], pixelsPerUnit: 100 } };
    const t = node('g', { size: [300, 100] }, [group('Horizontal', { m_ChildControlWidth: 1, m_ChildControlHeight: 1 }), { cls: 'Game.UI.MaxSizeLayoutElement', enabled: true, f: {} }], [
      node('sliced', {}, [img(1, 7)]), node('simple', {}, [img(0, 8)]),
    ]);
    const n = solve(t, { canvas: [300, 100], sprites });
    assert.deepEqual([n['g/sliced'].rect.w, n['g/sliced'].rect.h], [16, 21], 'Sliced: left + right, bottom + top border');
    assert.deepEqual([n['g/simple'].rect.w, n['g/simple'].rect.x], [30, 16]);
    assert.deepEqual(n['g/sliced'].image, { sprite: 'detail_list_back', type: 'Sliced', preserveAspect: false, color: ['#2f2f2f', 0.6], spriteRect: [64, 68], border: [7, 10, 9, 11], fillCenter: true, pixelsPerUnitMultiplier: 1 });
    assert.match(n.g.unsure[0], /MaxSizeLayoutElement: may move/);
  });

  test('paths are unique; screen and css rects scale the canvas units; a row prefab laid into a slot', () => {
    const t = node('row', { amin: [0, 0.5], amax: [1, 0.5], size: [0, 80] }, [], [node('cell', { amin: [0, 0.5], amax: [0, 0.5], pos: [58, 0], size: [72, 72] }), node('cell', { size: [10, 10] })]);
    const n = solve(t, { canvas: [1325.6, 745.6], parent: [0, 147.2, 1325.6, 80], ppu: 1.4484, css: 1.35 });
    assert.deepEqual(Object.keys(n), ['row', 'row/cell', 'row/cell#2']);
    assert.deepEqual(box(n['row/cell']), [22, 151.2, 72, 72]);
    assert.deepEqual(n['row/cell'].screen, { x: 31.86, y: 219, w: 104.28, h: 104.28 });
    assert.deepEqual(n['row/cell'].css, { x: 29.7, y: 204.12, w: 97.2, h: 97.2 });
  });

  test('canvas_scale: CanvasScaler ScaleWithScreenSize (match width or height, expand, shrink) × the PC UI scale', () => {
    const r = spawnSync(PY, ['-c', `import sys, json\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport ui_layout as L\nR = (1280, 720)\n`
      + `print(json.dumps([round(L.canvas_scale(R, s, m, k, u), 4) for s, m, k, u in [((1920, 1080), 0, 0, 1), ((2560, 1080), 0, 0, 1), ((2560, 1080), 1, 0, 1), ((2560, 1080), 0, 1, 1), ((2560, 1080), 0, 2, 1), ((1920, 1080), 0, 0, 0.9)]]))`], { encoding: 'utf8', env: ENV });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), [1.5, 2, 1.5, 1.5, 2, 1.35]);
  });
});

// The official prefab: the CN client's battle UI bundle (the 팀원 정보 창 is CN-only since 2026-11-01)
const VENV = path.join(ROOT, '.venv-extract/bin/python');
const cnBundle = (() => {
  if (!PY || !existsSync(VENV)) return null;
  const r = spawnSync(PY, ['-c', `import sys\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport client_path as c\nprint(c.client_data_cn('StreamingAssets', 'AB', 'Windows', 'ui', 'autochess', '[uc]autochessbattle.ab') or '')`], { encoding: 'utf8', env: ENV });
  const p = r.status === 0 ? r.stdout.trim() : '';
  return p && existsSync(p) ? p : null;
})();

describe('ui_inspect.py layout on the official 팀원 정보 창 (CN client)', { skip: !cnBundle && 'no CN client or no .venv-extract' }, () => {
  const layout = (name, ...args) => {
    const r = spawnSync(VENV, ['-I', path.join(TOOL, 'ui_inspect.py'), 'layout', cnBundle, name, '--canvas', '1280x720', '--match', '0', ...args], { encoding: 'utf8', env: ENV, maxBuffer: 64 << 20 });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.schema, 1);
    return Object.fromEntries(out.nodes.map((n) => [n.path, n]));
  };

  test('the dialog: four slots 80 high and 4 apart (the row pitch 84), centred 59.6 above the middle', () => {
    const n = layout('autochess_player_detail_dialog');
    const ys = [1, 2, 3, 4].map((k) => n[`autochess_player_detail_dialog/panel_list_pos_reference/pos_${k}`].rect);
    assert.deepEqual(ys.map((r) => r.h), [80, 80, 80, 80]);
    assert.deepEqual(ys.map((r) => r.y), [134.4, 218.4, 302.4, 386.4]);
  });

  test('the row: row_back 120 high, its centre 11.96 below the row\'s; the scroll boxes a Sliced detail_list_back; the name 15, NotoSansHans-Medium', () => {
    const n = layout('autochess_player_detail_row', '--parent-rect', '0,134.4,1280,80');
    const row = n.autochess_player_detail_row.rect;
    const back = n['autochess_player_detail_row/row_back'].rect;
    assert.equal(back.h, 120);
    assert.ok(Math.abs((back.y + back.h / 2) - (row.y + row.h / 2) - 11.96) < 1e-6, `row_back centre ${back.y + back.h / 2}`);
    const sv = n['autochess_player_detail_row/part_bond/Scroll View'];
    assert.deepEqual([sv.image.sprite, sv.image.type, sv.image.border], ['detail_list_back', 'Sliced', [7, 10, 9, 11]]);
    const name = n['autochess_player_detail_row/part_namecard/group_player_name/text_name_normal'].text;
    assert.deepEqual([name.size, name.dynFont, name.align], [15, 'NotoSansHans-Medium', 'MiddleLeft']);
    assert.equal(n['autochess_player_detail_row/part_namecard/group_combo_win'].rect.w, M, 'sized to its Text: 「모름」');
  });

  test('the row\'s bond and operator lists: GridLayoutGroup cells (52 × 68 two apart / 64 × 64) from the list\'s left padding, centred', () => {
    const C = 'Scroll View/Viewport/Content';
    const n = layout('autochess_player_detail_row', '--parent-rect', '0,134.4,1280,80',
      '--grid-items', `autochess_player_detail_row/part_bond/${C}=3`, '--grid-items', `autochess_player_detail_row/part_operator/${C}=2`);
    const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-3, `${what}: ${a} ≠ ${b}`);
    for (const [part, cells, w, h, pad, step] of [['part_bond', 3, 52, 68, 16, 54], ['part_operator', 2, 64, 64, 10, 64]]) {
      const box = n[`autochess_player_detail_row/${part}/Scroll View/Viewport`].rect;
      const content = n[`autochess_player_detail_row/${part}/${C}`];
      assert.equal(content.layout.group.solved, true);
      near(content.rect.x, box.x, `${part} Content left`);
      for (let k = 1; k <= cells; k++) {
        const r = n[`autochess_player_detail_row/${part}/${C}/cell_${k}`].rect;
        near(r.x, box.x + pad + step * (k - 1), `${part} cell ${k} x`);
        near(r.y, box.y + (box.h - h) / 2, `${part} cell ${k} y`);
        assert.deepEqual([r.w, r.h], [w, h]);
      }
    }
  });
});
