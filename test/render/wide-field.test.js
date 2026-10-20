// The 8-player mode's wide 联防 fields in the browser (maintainer decision 2026-10-19; sim and geometry:
// test/eight-player.test.js): the widened stage record the renderer draws (shared/wideField.js widenStageData), the 2D and
// 3D boards as wide as it, the built 3D area, the cameras (全景 fitted, each half the official half camera moved by its
// column offset), the ‹ › layers H0…H3, the field meta's `wide`, and the official scene's second copy (setWide).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { widenStageData, widenRow, wideRect, wideOffsets, WIDE_ROWS } from '../../shared/wideField.js';
import { GEO } from '../../shared/constants.js';
import { parseStage } from '../../public/js/render/tiles.js';
import { classifyStage, buildBoard } from '../../public/js/render/board3d/layout.js';
import { boardArea } from '../../public/js/render/app/view.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { cameraLayers, layerCamera, halfSide, isHalfLayer } from '../../public/js/battle/observe.js';
import { playerLayer, bondOwnerId } from '../../public/js/ui/watchBonds.js';
import { buildOfficialScene, wideKeys, WIDE_KEY } from '../../public/js/render/board3d/official.js';
import { focusUniforms } from '../../public/js/render/board3d/materials.js';
import { Battle } from '../../server/sim/Battle.js';
import { DataSource } from '../../server/sim/simdata.js';
import { DATA } from '../match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
const STAGES = read('data/stages.json');
const ID = 'act1autochess_m01';
const STAGE = STAGES[ID];

describe('the widened stage record (widenStageData)', () => {
  test('the 联防 rows are widened, the others padded with forbidden tiles; size follows; idempotent', () => {
    for (const halves of [3, 4]) {
      const w = widenStageData(STAGE, halves);
      const cols = wideRect(halves).c1 + 1;
      assert.equal(w._wide, halves);
      assert.deepEqual(w.size, [19, cols]);
      w.rows.forEach((r, i) => {
        assert.equal(r.length, cols, `row ${i}`);
        if (i >= WIDE_ROWS[0] && i <= WIDE_ROWS[1]) assert.equal(r, widenRow(STAGE.rows[i], halves));
        else assert.equal(r, STAGE.rows[i] + '#'.repeat(cols - 21), `row ${i}: the bench / boss field / pen once`);
      });
      assert.ok(widenStageData(w, halves) === w);
      assert.equal(w.id, ID, 'the stage id stays (the official scene is the stage\'s)');
    }
    assert.ok(widenStageData(STAGE, 2) === STAGE && widenStageData(STAGE, 0) === STAGE, 'no wide field below 3 halves');
  });

  test('a device on a repeated column of the 联防 rows stands on both copies (key ~w); the others once', () => {
    const st = { ...STAGE, devices: [
      { key: 'a', pos: [9, 5], role: 'x' },    // column 5 < 11: not repeated on 3 halves, repeated on 4
      { key: 'b', pos: [10, 14], role: 'x' },  // repeated on both
      { key: 'c', pos: [12, 20], role: 'x' },  // right wall: moved by the shift
      { key: 'd', pos: [16, 12], role: 'x' },  // the pen: never
    ] };
    const at = (w) => w.devices.map((d) => `${d.key}@${d.pos[1]}`);
    assert.deepEqual(at(widenStageData(st, 3)), ['a@5', 'b@14', 'b~w@22', 'c~w@28', 'd@12']);
    assert.deepEqual(at(widenStageData(st, 4)), ['a@5', 'a~w@21', 'b@14', 'b~w@30', 'c~w@36', 'd@12']);
  });
});

describe('the boards and the built area', () => {
  const w4 = widenStageData(STAGE, 4);

  test('the 2D and 3D grids are as wide as the stage: column 34 is stage column 18 (the right spawn)', () => {
    const g = parseStage(w4, [6, 13], [6, 13]);
    assert.equal(g[0].length, 37);
    assert.equal(g[9][34].glyph, g[9][18].glyph);
    assert.equal(parseStage(STAGE)[0].length, 21, 'a stage of its own stays 21 wide');
    const c = classifyStage(w4, boardArea('unite', 4));
    assert.equal(c[0].length, 37);
    assert.ok(c[10][30].drawn && c[10][30].content, 'the copied half is built');
    const board = buildBoard(w4, { area: boardArea('unite', 4), devices: false });
    assert.ok(board.bounds.x1 >= 35.5, `bounds ${JSON.stringify(board.bounds)}`);
    assert.ok(buildBoard(STAGE, { area: boardArea('unite'), devices: false }).bounds.x1 <= 20.5);
  });

  test('boardArea: the wide field\'s rows to its last column, without the pen; the 21-column 联防 unchanged', () => {
    assert.deepEqual(boardArea('unite', 4), [{ r0: 6, r1: 13, c0: 0, c1: 36 }]);
    assert.deepEqual(boardArea('unite', 3), [{ r0: 6, r1: 13, c0: 0, c1: 28 }]);
    assert.deepEqual(boardArea('unite', 2), boardArea('unite'));
    assert.ok(boardArea('unite').every((a) => a.c1 <= 20));
  });
});

describe('cameras', () => {
  const vp = { width: 1600, height: 900 };
  const R4 = wideRect(4), R3 = wideRect(3);

  test('全景 of a wide field is fitted: both ends on screen', () => {
    for (const rect of [R3, R4]) {
      const cam = presetCamera('unite', vp, { rect });
      for (const r of [rect.r0, rect.r1]) {
        for (const c of [rect.c0, rect.c1]) {
          const p = cam.project(c, r, 0);
          assert.ok(p.x > 0 && p.x < vp.width && p.y > 0 && p.y < vp.height, `(${r}, ${c}) at ${p.x}, ${p.y}`);
        }
      }
    }
  });

  test('a half is the official left half camera moved by its column offset (H0 = the 2-helper field\'s left half)', () => {
    const left = presetCamera('unite', vp, { rect: GEO.UNITE_RECT, side: 'L', half: true });
    const h0 = presetCamera('unite', vp, { rect: R4, half: true, halfOffset: 0 });
    assert.deepEqual(h0.params(), left.params());
    for (const off of wideOffsets(4)) {
      const cam = presetCamera('unite', vp, { rect: R4, half: true, halfOffset: off });
      const a = cam.project(6 + off, 10, 0), b = left.project(6, 10, 0);
      assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, `offset ${off}`);
    }
    // portrait: fitted on the half's own 11 columns
    const port = presetCamera('unite', { width: 600, height: 900 }, { rect: R4, half: true, halfOffset: 24 });
    for (const c of [24, 34]) { const p = port.project(c, 10, 0); assert.ok(p.x > 0 && p.x < 600, `portrait col ${c}: ${p.x}`); }
  });
});

describe('the ‹ › layers', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const field = (n) => ({
    kind: 'unite', wide: n, rect: wideRect(n), fieldId: 'u',
    // the runner's sides: helper i on offset wideOffsets(n)[i]
    sides: Object.fromEntries(ids.slice(0, n).map((id, i) => [id, halfSide({ colOffset: wideOffsets(n)[i] }, n)])),
  });
  const pub = { players: ids.map((playerId) => ({ playerId, name: playerId.toUpperCase() })), fields: [{ fieldId: 'u', players: ids }] };

  test('a half per helper from the left with 全景 in the middle; the first helper holds the right-most half', () => {
    assert.deepEqual(cameraLayers(field(4), pub, 'b').map((l) => [l.key, l.pid, l.kind]),
      [['H0', 'd', 'other'], ['H1', 'c', 'other'], ['ALL', null, 'all'], ['H2', 'b', 'self'], ['H3', 'a', 'other']]);
    assert.deepEqual(cameraLayers(field(3), pub, 'z').map((l) => l.key), ['H0', 'ALL', 'H1', 'H2']);
    assert.deepEqual([halfSide({ colOffset: 8 }), halfSide({ colOffset: 0 }), halfSide({ side: 'R' })], ['R', 'L', 'R'], 'two halves: L / R as before');
  });

  test('layerCamera: a half moves the camera by its offset; 全景 frames the whole field', () => {
    const f = field(4);
    assert.deepEqual(layerCamera(f, 'H2', 'H0'), { rect: f.rect, side: 'L', half: true, halfOffset: 16 });
    assert.deepEqual(layerCamera(f, 'ALL', 'H3'), { rect: f.rect, side: 'H3' });
    assert.deepEqual(layerCamera({ kind: 'unite', rect: GEO.UNITE_RECT }, 'R'), { rect: GEO.UNITE_RECT, side: 'R', half: true });
    assert.deepEqual(['L', 'R', 'H0', 'H3', 'ALL', 'H', null].map(isHalfLayer), [true, true, true, true, false, false, false]);
  });

  test('前往查看 and the bond strip follow the half of a wide field', () => {
    const f = field(4);
    assert.equal(playerLayer(f, pub, 'z', 'c'), 'H1');
    assert.equal(bondOwnerId({ pub, myId: 'b', fieldId: 'u', field: f, layer: 'H3', halves: true }), 'a');
    assert.equal(bondOwnerId({ pub, myId: 'b', fieldId: 'u', field: f, layer: 'ALL', halves: true }), 'b');
  });

  test('the runner gives each player its half (H0…H3 on a wide field)', () => {
    const src = readFileSync(path.join(ROOT, 'public/js/battle/runner.js'), 'utf8');
    assert.match(src, /halfSide\(p, e\.spec\.kind === 'unite' \? e\.spec\.wide : 0\)/);
  });
});

test('Battle.fieldMeta carries the wide field\'s halves (the browser draws the stage widened), only there', () => {
  const ds = new DataSource(DATA, null);
  const make = (wide) => new Battle({ kind: 'unite', wide, stageId: ID, data: ds, timeLimit: 10, players: [{ playerId: 'p1', units: [] }], spawns: [], routes: [], logger: { warn() {}, error() {}, info() {} } });
  assert.equal(make(4).fieldMeta().wide, 4);
  assert.deepEqual(make(4).fieldMeta().rect, wideRect(4));
  assert.equal('wide' in make(0).fieldMeta(), false);
  const app = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
  assert.match(app, /wide: meta\.kind === 'unite' \? wideHalves\(meta\.wide\) : 0/);
  assert.match(app, /widenStageData\(st, halves\)/);
});

const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);

describe('the official scene on a wide field (setWide)', { skip: !PY && 'no python3' }, () => {
  // one quad over stage columns 0–20 of row 10, in hidden set HIDDEN@2 (tiles r 9–12, c 11–20) — tools/local-extract
  const src = [
    'import sys, json, base64', `sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools/local-extract'))})`,
    'from scene_extract import pack_geometry, GEOM_VERSION',
    "q = {'pos': [-0.5, 9.5, 0, 20.5, 9.5, 0, 20.5, 10.5, 0, -0.5, 10.5, 0], 'nrm': [0, 0, 1] * 4, 'uv0': [0, 0, 1, 0, 1, 1, 0, 1], 'uv1': [0, 0, 1, 0, 1, 1, 0, 1],",
    "     'col': [255] * 16, 'idx': [0, 1, 2, 0, 2, 3]}",
    "recs = [{'material': 'm', 'lightmap': -1, 'hidden': None, 'vertices': 4, 'indices': 6}, {'material': 'm', 'lightmap': -1, 'hidden': 'HIDDEN@2', 'vertices': 4, 'indices': 6}]",
    'blob, quant = pack_geometry(list(zip(recs, [q, q])))',
    "print(json.dumps({'doc': {'version': GEOM_VERSION, 'quant': quant, 'groups': recs, 'materials': {}, 'hidden': {'HIDDEN@2': {'tiles': [9, 12, 11, 20]}}}, 'bin': base64.b64encode(bytes(blob)).decode()}))",
  ].join('\n');
  const r = PY ? spawnSync(PY, ['-c', src], { encoding: 'utf8', maxBuffer: 16 << 20 }) : null;

  test('a second copy 16 / 8 columns right drawn from x 18.5, the stage\'s own up to there; dropped again on 0', () => {
    assert.equal(r.status, 0, r.stderr);
    const { doc, bin } = JSON.parse(r.stdout);
    const raw = Buffer.from(bin, 'base64');
    const built = buildOfficialScene(THREE, { stageId: ID, doc, buffer: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), textures: {}, lightmaps: [] }, focusUniforms(THREE));
    const clip = (m) => m.material.uniforms.uClipX.value.toArray();
    assert.deepEqual(clip(built.meshes[0]), [-1e4, 1e4]);
    assert.equal(built.setWide(0), null);
    const g = built.setWide(4);
    assert.equal(g.position.x, 16);
    assert.equal(g.children.length, built.meshes.length);
    assert.ok(g.children.every((c, i) => c.geometry === built.meshes[i].geometry), 'the copy shares the geometry');
    assert.deepEqual(clip(built.meshes[0]), [-1e4, 18.5]);
    assert.deepEqual(clip(g.children[0]), [18.5, 1e4]);
    assert.ok(g.children[0].material !== built.meshes[0].material && g.children[0].material.uniforms.uFocus === built.meshes[0].material.uniforms.uFocus,
      'a material of its own sharing every uniform but the clip');
    assert.ok(built.setWide(4) === g, 'the same halves again: the same copy');
    // the quad lies on the 联防 rows: cut at the seam (key 0), the copy adds its shift to a whole piece's key
    assert.deepEqual([...built.meshes[0].geometry.getAttribute('aKey').array], [0, 0, 0, 0]);
    assert.deepEqual([built.meshes[0].material.uniforms.uKeyShift.value, g.children[0].material.uniforms.uKeyShift.value], [0, 16]);
    // the copy's hidden set by the stage tiles under it: the wide area (c 0–36) moved back by 16 still reaches HIDDEN@2
    built.setArea([{ r0: 6, r1: 13, c0: 0, c1: 36 }]);
    assert.deepEqual([built.meshes[1].visible, g.children[1].visible], [true, true]);
    built.setArea([{ r0: 6, r1: 13, c0: 0, c1: 10 }]);
    assert.deepEqual([built.meshes[1].visible, g.children[1].visible], [false, false]);
    const g3 = built.setWide(3);
    assert.ok(g3 !== g && g.parent == null);
    assert.equal(g3.position.x, 8);
    assert.equal(built.setWide(0), null);
    assert.deepEqual(clip(built.meshes[0]), [-1e4, 1e4]);
    built.dispose();
  });

  test('the shaders discard what lies outside the clip', () => {
    const src2 = readFileSync(path.join(ROOT, 'public/js/render/board3d/official.js'), 'utf8');
    assert.equal(src2.match(/float clipX = vKey > 0\.5 \? vKey - \$\{WIDE_KEY\.bias\.toFixed\(1\)\} \+ uKeyShift : vWorld\.x;\n  if \(clipX < uClipX\.x \|\| clipX > uClipX\.y\) discard;/g)?.length, 2);
    const scene = readFileSync(path.join(ROOT, 'public/js/render/board3d/scene.js'), 'utf8');
    assert.match(scene, /this\.officialBuilt\.setWide\?\.\(stage\._wide \|\| 0\)/);
  });
});

describe('wideKeys: the pieces drawn whole across the wide field\'s seam', () => {
  // a piece = triangles joined by an index or by a shared position; vertices given on the board (x, y, 0)
  const keysOf = (tris) => {
    const pos = tris.flat(2), n = pos.length / 3;
    const idx = Array.from({ length: n }, (_, i) => i);
    return [...wideKeys(pos, idx, n, (i) => [pos[3 * i], pos[3 * i + 1]])];
  };
  test('off the 联防 rows and at most WIDE_KEY.maxW wide: centre x + bias for every vertex of the piece', () => {
    // two triangles of one rock above the field, sharing the corner (17, 4) by position only
    const k = keysOf([[[15, 2, 0], [17, 2, 0], [17, 4, 0]], [[17, 4, 0], [20, 3, 0], [19, 5, 1]]]);
    assert.deepEqual(k, new Array(6).fill(17.5 + WIDE_KEY.bias));
  });
  test('cut at the seam (0): a piece on the 联防 rows, a piece wider than maxW', () => {
    assert.deepEqual(keysOf([[[17, 7, 0], [20, 7, 0], [19, 9, 0]]]), [0, 0, 0]);
    assert.deepEqual(keysOf([[[0, 15, 0], [WIDE_KEY.maxW + 1, 15, 0], [3, 18, 0]]]), [0, 0, 0]);
    assert.deepEqual(keysOf([[[15, 14, 0], [17, 14, 0], [16, 16, 0]]]), new Array(3).fill(16 + WIDE_KEY.bias));
  });
});
