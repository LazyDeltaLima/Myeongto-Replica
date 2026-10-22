// test/render/model-place.test.js — a model's place and shadow in its battle prefab (render/fxpoints.js MODEL_PLACE,
// maintainer decision 2026-10-17 「A 다음 B」, docs/rules/render.md 「모델 위치값」): 望's placed 棋子
// (token_10064_wang_stone1) draws its model at the prefab's FaceSwitcher (0, −0.16, −0.1) in the Graphic's X −30° frame
// and its shadow 0.17 tile ahead at 0.608 × 0.194 tile, so its ball sits at the stone's point like the 跟子's `qizi (1)`.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { MODEL_PLACE, modelOffset, liftedPoint } from '../../public/js/render/fxpoints.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UNITS = readFileSync(path.join(ROOT, 'public/js/render/units.js'), 'utf8');
const FXGAME = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const STONE = 'token_10064_wang_stone1';
const cam = () => presetCamera('normal', { width: 1280, height: 720 });

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const assets = { picture: () => null, image: async () => null, spineEntry: () => null, spine: { acquire: async () => null, release() {} } };
const view = (defId, x = 10, y = 9) => new UnitView(fakeViewCtx(fake.P, { assets, cam }), { id: 1, side: 'ally', kind: 'token', defId, x, y, maxHp: 1 }, {});

test('the stone\'s prefab values: FaceSwitcher (0, −0.16, −0.1), the shadow (0, −0.17) at 507 × 162 px × 0.12', () => {
  const p = MODEL_PLACE[STONE];
  assert.deepEqual([...p.face], [0, -0.16, -0.1]);
  assert.deepEqual([...p.shadow.at], [0, -0.17]);
  assert.ok(Math.abs(p.shadow.w - 0.6084) < 1e-9 && Math.abs(p.shadow.h - 0.1944) < 1e-9);
  assert.deepEqual(Object.keys(MODEL_PLACE), [STONE], 'only the 棋子 so far (B: the operators and tokens)');
});

test('modelOffset turns the FaceSwitcher place by the Graphic\'s X −30°: 0.189 rows toward the camera, 0.007 up', () => {
  const o = modelOffset(MODEL_PLACE[STONE].face);
  assert.equal(o.dx, 0);
  assert.ok(Math.abs(o.dy + 0.1886) < 1e-3, `${o.dy}`);
  assert.ok(Math.abs(o.dz - 0.0066) < 1e-3, `${o.dz}`);
  // the Graphic's own up (0, 1, 0) leans back 30°: row cos 30°, height sin 30° (fx-graphic-tilt.test.js)
  const up = modelOffset([0, 1, 0]);
  assert.ok(Math.abs(up.dy - Math.cos(Math.PI / 6)) < 1e-9 && Math.abs(up.dz - 0.5) < 1e-9);
});

test('a placed stone\'s model is drawn at its FaceSwitcher place, its shadow ahead at the prefab\'s size; others stay', () => {
  const c = cam();
  const v = view(STONE);
  v.update(1 / 60, c, 0);
  const p = c.project(10, 9, 0, { x: 0, y: 0, s: 0, depth: 0 });
  const o = modelOffset(MODEL_PLACE[STONE].face), q = c.project(10 + o.dx, 9 + o.dy, o.dz, { x: 0, y: 0, s: 0, depth: 0 });
  assert.ok(Math.abs(v.root.position.x - q.x) < 1e-6 && Math.abs(v.root.position.y - q.y) < 1e-6);
  // on screen: the in-plane −0.16 shows as 0.16 tile, the −0.1 toward the camera adds the perspective's parallax
  // (on screen 0.21 tile on the near rows to 0.15 on the far ones; 0.18 here)
  const down = (v.root.position.y - p.y) / p.s;
  assert.ok(down > 0.15 && down < 0.21, `model ${down.toFixed(3)} tile below the point`);
  const shDown = (v.shadow.position.y - p.y) / p.s;
  assert.ok(shDown > 0.12 && shDown < 0.17, `shadow ${shDown.toFixed(3)} tile below the point`);
  const tex = v.shadow.texture;
  const w = (v.shadow.scale.x * tex.width) / p.s, h = (v.shadow.scale.y * tex.height) / p.s;
  assert.ok(Math.abs(w - 0.608) < 0.02, `shadow ${w.toFixed(3)} tile wide`);
  assert.ok(h / w > 0.2 && h / w < 0.32, `shadow height / width ${(h / w).toFixed(3)} (the board's rows foreshortened)`);
  // any other unit keeps its point and the 0.95-tile shadow
  const u = view('char_x');
  u.update(1 / 60, c, 0);
  assert.ok(Math.abs(u.root.position.y - p.y) < 1e-6 && Math.abs(u.shadow.position.y - p.y) < 1e-6);
  assert.ok(Math.abs((u.shadow.scale.x * u.shadow.texture.width) / p.s - 0.95) < 1e-6);
});

test('the stone effects\' ball (fxgame ballAt) is STONE_BALL above the moved model root: about the stone\'s point', () => {
  // (the 跟子's ball, `qizi (1)`, is on the point: the two kinds of stone now sit alike, ±0.05 tile by the row's parallax)
  assert.match(FXGAME, /const STONE_BALL = 0\.18, STONE_FACE = modelOffset\(MODEL_PLACE\[STONE\]\.face\);/);
  assert.match(FXGAME, /const x = x0 \+ STONE_FACE\.dx, y = y0 \+ STONE_FACE\.dy, z0 = g0 \+ STONE_FACE\.dz;/);
  const c = cam(), o = modelOffset(MODEL_PLACE[STONE].face), P = { x: 0, y: 0, s: 0, depth: 0 }, Q = { x: 0, y: 0, s: 0, depth: 0 };
  for (const [x, y] of [[3, 7], [10, 9], [17, 12]]) {   // on screen
    const at = c.project(x, y, 0, { x: 0, y: 0, s: 0, depth: 0 });
    const r = c.project(x + o.dx, y + o.dy, o.dz, { x: 0, y: 0, s: 0, depth: 0 });
    const b = liftedPoint(c, x + o.dx, y + o.dy, o.dz, r.y, r.x, r.y - 0.18 * r.s, { x: 0, y: 0, z: 0 }, Q);
    const s = c.project(b.x, b.y, b.z, P);
    const up = (at.y - s.y) / at.s;
    assert.ok(Math.abs(up) < 0.05 && Math.abs(s.x - r.x) / at.s < 0.01, `(${x}, ${y}): the ball ${up.toFixed(3)} tile above the point`);
  }
});

test('units.js draws the body and shadow from MODEL_PLACE', () => {
  assert.match(UNITS, /this\.modelPlace = MODEL_PLACE\[info\.defId\] \|\| null;/);
  assert.match(UNITS, /cam\.project\(this\.x \+ this\.modelDX \+ lx, this\.y \+ this\.modelDY \+ ly, this\.z \+ this\.modelDZ \+ this\.hover \+ this\.lift, LG_P\)/);
  assert.match(UNITS, /const sh = cam\.project\(this\.x \+ this\.modelDX \+ \(ps \? ps\.at\[0\] : 0\), this\.y \+ \(ps \? ps\.at\[1\] : 0\), shz, SH_P\);/);
});
