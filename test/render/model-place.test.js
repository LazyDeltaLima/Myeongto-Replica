// test/render/model-place.test.js — a model's place and shadow in its battle prefab (render/fxpoints.js STANDARD_PLACE /
// modelPlace, maintainer decision 2026-10-17 「A 다음 B」, docs/rules/render.md 「모델 위치값·그림자」): every operator and
// token draws its model at its prefab's skeleton node (the standard (0, −0.16, −0.1) in the Graphic's X −30° frame) and
// its shadow 0.17 tile ahead at 0.608 × 0.194 tile — 望's placed 棋子 (A) and the rest (B); the per-unit table of the local
// client (places.json) gives the units that differ; the HUD stays at the unit's point, the body anchors follow the model.

import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { STANDARD_PLACE, SHADOW_SPRITE, modelPlace, modelOffset, setPlaces, liftedPoint } from '../../public/js/render/fxpoints.js';
import { bodyZ } from '../../public/js/render/fx/camera.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FXGAME = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const STONE = 'token_10064_wang_stone1';
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const P0 = () => ({ x: 0, y: 0, s: 0, depth: 0 });

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());
afterEach(() => setPlaces(null));

const assets = { picture: () => null, image: async () => null, spineEntry: () => null, spine: { acquire: async () => null, release() {} } };
const view = (defId, kind = 'token', side = 'ally', x = 10, y = 9) =>
  new UnitView(fakeViewCtx(fake.P, { assets, cam }), { id: 1, side, kind, defId, spine: defId, x, y, maxHp: 1 }, {});

test('the standard prefab values: the skeleton node (0, −0.16, −0.1) at 0.27, the shadow (0, −0.17) at 507 × 162 px × 0.12', () => {
  assert.deepEqual([...STANDARD_PLACE.face], [0, -0.16, -0.1]);
  assert.equal(STANDARD_PLACE.scale, 0.27);
  assert.deepEqual([...STANDARD_PLACE.shadow.at], [0, -0.17]);
  assert.deepEqual([...SHADOW_SPRITE], [5.07, 1.62]);
  const p = modelPlace([STONE], 'token');
  assert.ok(!p.own && p.k === 1);
  assert.ok(Math.abs(p.shadow.w - 0.6084) < 1e-9 && Math.abs(p.shadow.h - 0.1944) < 1e-9);
});

test('modelOffset turns the node\'s place by the Graphic\'s X −30° (0.189 rows toward the camera, 0.007 up) and adds the Graphic\'s own', () => {
  const o = modelOffset(STANDARD_PLACE.face);
  assert.equal(o.dx, 0);
  assert.ok(Math.abs(o.dy + 0.1886) < 1e-3, `${o.dy}`);
  assert.ok(Math.abs(o.dz - 0.0066) < 1e-3, `${o.dz}`);
  // the Graphic's own up (0, 1, 0) leans back 30°: row cos 30°, height sin 30° (fx-graphic-tilt.test.js)
  const up = modelOffset([0, 1, 0]);
  assert.ok(Math.abs(up.dy - Math.cos(Math.PI / 6)) < 1e-9 && Math.abs(up.dz - 0.5) < 1e-9);
  // the Graphic itself is not turned: Unity z −0.2 is 0.2 up (医疗探机, 诅咒娃娃)
  const g = modelOffset([0, 0, 0], [0.1, 0, -0.2]);
  assert.ok(Math.abs(g.dx - 0.1) < 1e-9 && Math.abs(g.dy) < 1e-9 && Math.abs(g.dz - 0.2) < 1e-9);
});

test('modelPlace: operators and tokens only; the table\'s own entry by the first key found, else the standard', () => {
  assert.equal(modelPlace(['enemy_1007_slime'], 'enemy'), null);
  assert.equal(modelPlace(['x'], 'device'), null);
  assert.ok(!modelPlace(['char_102_texas'], 'op').own);
  setPlaces({
    char_388_mint: { face: [-0.06, -0.16, -0.1], scale: 0.27, shadow: { at: [0, -0.17], sx: 0.12, sy: 0.12 } },
    char_237_gravel: { face: [0, -0.16, -0.1], scale: 0.26, shadow: { at: [0, -0.17], sx: 0.12, sy: 0.12 } },
    token_10057_svash2_eagle1: { face: [0, -0.16, -0.1], scale: 0.25, shadow: null },
    token_10000_silent_healrb: { face: [0, -0.16, -0.1], scale: 0.4, graphic: [0, 0, -0.2], shadow: { at: [0, -0.17], sx: 0.06, sy: 0.06 } },
  });
  const mint = modelPlace([null, 'char_388_mint', 'chess_x'], 'op');
  assert.ok(mint.own && Math.abs(mint.off.dx + 0.06) < 1e-9 && mint.k === 1);
  assert.ok(Math.abs(modelPlace(['char_237_gravel'], 'op').k - 0.26 / 0.27) < 1e-9);
  assert.equal(modelPlace(['token_10057_svash2_eagle1'], 'token').shadow, null, 'a prefab without a shadow sprite');
  const rb = modelPlace(['token_10000_silent_healrb'], 'token');
  assert.ok(Math.abs(rb.off.dz - 0.2066) < 1e-3 && Math.abs(rb.shadow.w - 0.3042) < 1e-9 && Math.abs(rb.k - 0.4 / 0.27) < 1e-9);
  assert.ok(!modelPlace(['char_102_texas'], 'op').own, 'a unit missing from the table takes the standard');
});

test('an operator\'s and a token\'s model are drawn at their place, the shadow ahead at the prefab\'s size; enemies stay', () => {
  const c = cam();
  const p = c.project(10, 9, 0, P0());
  const o = modelOffset(STANDARD_PLACE.face), q = c.project(10 + o.dx, 9 + o.dy, o.dz, P0());
  for (const [id, kind] of [[STONE, 'token'], ['char_102_texas', 'op']]) {
    const v = view(id, kind);
    v.update(1 / 60, c, 0);
    assert.ok(Math.abs(v.root.position.x - q.x) < 1e-6 && Math.abs(v.root.position.y - q.y) < 1e-6, id);
    // on screen: the in-plane −0.16 shows as 0.16 tile, the −0.1 toward the camera adds the perspective's parallax
    // (on screen 0.21 tile on the near rows to 0.15 on the far ones; 0.18 here)
    const down = (v.root.position.y - p.y) / p.s;
    assert.ok(down > 0.15 && down < 0.21, `${id}: model ${down.toFixed(3)} tile below the point`);
    assert.ok(Math.abs(v.modelDrop - down) < 1e-9, 'modelDrop: the same in tiles');
    const shDown = (v.shadow.position.y - p.y) / p.s;
    assert.ok(shDown > 0.12 && shDown < 0.17, `${id}: shadow ${shDown.toFixed(3)} tile below the point`);
    const tex = v.shadow.texture;
    const w = (v.shadow.scale.x * tex.width) / p.s, h = (v.shadow.scale.y * tex.height) / p.s;
    assert.ok(Math.abs(w - 0.608) < 0.02, `${id}: shadow ${w.toFixed(3)} tile wide`);
    assert.ok(h / w > 0.2 && h / w < 0.32, `${id}: shadow height / width ${(h / w).toFixed(3)} (the board's rows foreshortened)`);
    // the HUD stays at the unit's point (the client's hud_unit follows the unit's own transform: its _uiMountPoint is empty)
    assert.ok(Math.abs(v.screen.y - p.y) < 1e-6, `${id}: screen = the unit's point`);
    assert.equal(v.hudAnchor, 0, `${id}: hud_unit on the point, not HUD_ANCHOR over it (the model already stands lower)`);
  }
  // an enemy keeps its point and the 0.95-tile shadow
  const u = view('enemy_1007_slime', 'enemy', 'enemy');
  u.update(1 / 60, c, 0);
  assert.ok(Math.abs(u.root.position.y - p.y) < 1e-6 && Math.abs(u.shadow.position.y - p.y) < 1e-6 && u.modelDrop === 0);
  assert.ok(Math.abs((u.shadow.scale.x * u.shadow.texture.width) / p.s - 0.95) < 1e-6);
});

test('a view built before the table re-reads it: its own side offset, scale and no shadow', () => {
  const c = cam();
  const v = view('token_10057_svash2_eagle1');
  v.update(1 / 60, c, 0);
  assert.ok(v.shadow.alpha > 0 && v.modelK === 0.25 / 0.27, 'before: the standard shadow, the hand table\'s size');
  setPlaces({
    token_10057_svash2_eagle1: { face: [0.03, -0.16, -0.1], scale: 0.25, shadow: null },
  });
  v.update(1 / 60, c, 0);
  const o = modelOffset([0.03, -0.16, -0.1]), q = c.project(10 + o.dx, 9 + o.dy, o.dz, P0());
  assert.ok(Math.abs(v.root.position.x - q.x) < 1e-6, 'the model 0.03 column aside');
  assert.equal(v.shadow.alpha, 0, 'the prefab draws no shadow');
  assert.ok(Math.abs(v.modelK - 0.25 / 0.27) < 1e-9);
});

test('bodyZ: the body and head anchors without a model point follow the model\'s feet (modelDrop)', () => {
  const c = cam();
  const P = P0();
  const at = (v, frac) => { const z = bodyZ(c, v, frac); c.project(v.x, v.y, z, P); return P.y; };
  const feet = c.project(10, 9, 0, P0());
  const a = { x: 10, y: 9, z: 0, _headTiles: 1.02 }, b = { ...a, modelDrop: 0.18 };
  const ya = at(a, 0.5), yb = at(b, 0.5);
  assert.ok(Math.abs((yb - ya) / feet.s - 0.18) < 0.01, `the body point ${((yb - ya) / feet.s).toFixed(3)} tile lower with the model`);
});

test('the stone effects\' ball (fxgame ballAt) is STONE_BALL above the moved model root: about the stone\'s point', () => {
  // (the 跟子's ball, `qizi (1)`, is on the point: the two kinds of stone now sit alike, ±0.05 tile by the row's parallax)
  assert.match(FXGAME, /const STONE_BALL = 0\.18, STONE_FACE = modelOffset\(STANDARD_PLACE\.face\);/);
  assert.match(FXGAME, /const x = x0 \+ STONE_FACE\.dx, y = y0 \+ STONE_FACE\.dy, z0 = g0 \+ STONE_FACE\.dz;/);
  const c = cam(), o = modelOffset(STANDARD_PLACE.face), P = P0(), Q = P0();
  for (const [x, y] of [[3, 7], [10, 9], [17, 12]]) {   // on screen
    const at = c.project(x, y, 0, P0());
    const r = c.project(x + o.dx, y + o.dy, o.dz, P0());
    const b = liftedPoint(c, x + o.dx, y + o.dy, o.dz, r.y, r.x, r.y - 0.18 * r.s, { x: 0, y: 0, z: 0 }, Q);
    const s = c.project(b.x, b.y, b.z, P);
    const up = (at.y - s.y) / at.s;
    assert.ok(Math.abs(up) < 0.05 && Math.abs(s.x - r.x) / at.s < 0.01, `(${x}, ${y}): the ball ${up.toFixed(3)} tile above the point`);
  }
});

test('a foot effect (_spawnLocation 1) stands with the model: the client\'s footTransform is the skeleton node; 0 / 5 stay', () => {
  // (余 S3's buff `yu_skill3_buff_01`, FOOT, hung above her lowered feet — maintainer report 2026-10-23, official recording)
  assert.match(FXGAME, /const foot = spawn === 1 && v && \(v\.faceDX \|\| v\.modelDY \|\| v\.modelDZ\) \? v : null;/);
  assert.match(FXGAME, /get x\(\) \{ return ex\(v\) \+ fdx\(\); \}, get y\(\) \{ return ey\(v\) \+ fdy\(\); \}, get z\(\) \{ return foot \? \(v\.z \|\| 0\) \+ fdz\(\) : v\.z; \}/);
  assert.match(FXGAME, /if \(!v \|\| !\(v\.modelDX \|\| 'glideS' in v \|\| foot\)\) return v;/);
  // the offsets are the model's own (units.js draws the body at x + faceDX, y + modelDY, z + modelDZ)
  const u = view('char_102_texas', 'op');
  u.update(1 / 60, cam(), 0);
  const o = modelOffset(STANDARD_PLACE.face);
  assert.ok(Math.abs(u.modelDY - o.dy) < 1e-9 && Math.abs(u.modelDZ - o.dz) < 1e-9, 'the foot offset = the body offset');
});
