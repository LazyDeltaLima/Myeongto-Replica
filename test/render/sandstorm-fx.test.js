// test/render/sandstorm-fx.test.js — 战场#06's 沙尘暴 on screen (docs/rules/fx.md 「战场#06 沙尘暴 연출」): the camera's sand
// sheet (screen_desert_*, its Optimize/Dissolve AB MultiTex material), the 土石结构's sand marks (map_desert_02_*) and the
// device model of the mound.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stormMarks, STORM_SCREEN, MOUND_SP0_TURN } from '../../public/js/render/fxgame.js';
import { OFFICIAL_DEVICE } from '../../public/js/render/board3d/official.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAGES = JSON.parse(readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'));
const M06 = 'act1autochess_m06';
const SCREEN = path.join(ROOT, 'public/assets/local/fx/screen/screen_desert_up_to_down.json');
const DEVICES = path.join(ROOT, 'public/assets/local/scene/devices/scene.json');
const MAPFX = path.join(ROOT, 'public/assets/local/fx/map');

const mounds = () => (STAGES.stages ?? STAGES)[M06].devices.filter((d) => d.role === 'mound').map((d) => ({ r: d.pos[0], c: d.pos[1], z: 0 }));

test('stormMarks: on 战场#06 only the mounds with no other one upwind wear map_desert_02_down, per half the storm blows over', () => {
  const all = mounds();
  const on = stormMarks([{ c0: 0, c1: 20, dir: 'DOWN' }], all);
  assert.ok(on.length > 0 && on.length < all.length, `${on.length} of ${all.length}`);
  assert.ok(on.every((m) => m.name === 'map_desert_02_down'));
  // each marked mound has no mound above it in its column; each unmarked one has
  const at = new Set(all.map((m) => `${m.r},${m.c}`));
  const above = (m) => all.some((o) => o.c === m.c && o.r > m.r);
  for (const m of all) assert.equal(on.some((x) => x.r === m.r && x.c === m.c), !above(m), `(${m.r},${m.c})`);
  assert.ok(at.has('12,4') && on.some((m) => m.r === 12 && m.c === 4), 'the normal field\'s top row is in the wind');
  // a card stopping the storm on the right half: its mounds keep no mark
  const left = stormMarks([{ c0: 0, c1: 10, dir: 'DOWN' }], all);
  assert.ok(left.every((m) => m.c <= 10) && left.length < on.length);
  assert.deepEqual(stormMarks([], all), []);
  assert.deepEqual(stormMarks(null, all), []);
  // the wind from another side: the upwind line turns with it
  assert.deepEqual(stormMarks([{ c0: 0, c1: 20, dir: 'RIGHT' }], [{ r: 3, c: 4 }, { r: 3, c: 6 }]).map((m) => [m.c, m.name]), [[4, 'map_desert_02_right']]);
});

test('the camera effect by the storm\'s direction (sand_storm[camera_effect]: DOWN → up_to_down)', () => {
  assert.equal(STORM_SCREEN.DOWN, 'screen_desert_up_to_down');
  assert.equal(STORM_SCREEN.RIGHT, 'screen_desert_left_to_right');
  assert.equal(OFFICIAL_DEVICE.mound, 'trap_032_mound');
});

test('Dissolve AB MultiTex (skipped without public/assets): _Dissolve 2 = three cuts, the vector amounts / borders, 2 · _TexSpeed(2) scrolls, ×2 tints', { skip: !existsSync(SCREEN) && 'no extracted fx' }, async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = JSON.parse(readFileSync(SCREEN, 'utf8'));
  assert.equal(def.spawn, 12, 'CAMERA');
  const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
  def.geoms = new Proxy({}, { get: () => tri() });
  def.lib = { texture: () => new THREE.Texture() };
  const inst = new fxp.FxInstance(def, { quality: 'high', delays: false });
  const mat = inst.meshMatList.find((m) => m.uniforms.uMulti.value);
  assert.ok(mat, 'the sheet\'s material');
  const m = Object.values(def.materials).find((x) => /MultiTex/.test(x.shader));
  const u = mat.uniforms;
  assert.equal(u.uMulti.value, 3);
  assert.equal(mat.blending, THREE.CustomBlending);
  assert.equal(mat.blendDst, THREE.OneMinusSrcAlphaFactor, 'AB: alpha blended');
  assert.deepEqual(u.uAmountV.value.toArray(), m.colors._Amount.slice(0, 3));
  assert.deepEqual(u.uBorderV.value.toArray(), m.colors._BorderWidth.slice(0, 3));
  assert.equal(u.uAmount.value, m.colors._Amount[0]);
  assert.deepEqual(u.uMainSpeed.value.toArray(), [2 * m.colors._TexSpeed[0], 2 * m.colors._TexSpeed[1]]);
  assert.deepEqual(u.uDissolveSpeed.value.toArray(), [2 * m.colors._TexSpeed[2], 2 * m.colors._TexSpeed[3]]);
  assert.deepEqual(u.uSpeedB.value.toArray(), [2 * m.colors._TexSpeed2[0], 2 * m.colors._TexSpeed2[1]]);
  assert.deepEqual(u.uSpeedC.value.toArray(), [2 * m.colors._TexSpeed2[2], 2 * m.colors._TexSpeed2[3]]);
  assert.deepEqual(u.uTintB.value.toArray(), m.colors._TintColorB.map((v) => v * 2));
  // another shader's material keeps the single cut
  const other = Object.values(inst.meshMatList).find((x) => !x.uniforms.uMulti.value);
  if (other) assert.equal(other.uniforms.uMulti.value, 0);
});

test('the mound\'s device model (skipped without the extracted scenes): the wall\'s pieces + the strengthened mesh, unlit opaque', { skip: !existsSync(DEVICES) && 'no extracted scenes' }, () => {
  const doc = JSON.parse(readFileSync(DEVICES, 'utf8'));
  const g = doc.groups.filter((x) => x.device === 'trap_032_mound');
  assert.equal(g.length, 1);
  assert.equal(doc.materials[g[0].material].shader, 'Unlit/Texture');
  assert.ok(g[0].vertices > 1344, `pieces + S_desert_wall_02: ${g[0].vertices}`);
  const [lo, hi] = doc.devices.trap_032_mound.bounds;
  assert.ok(hi[2] > 0.8 && hi[2] < 1 && lo[2] > -0.05, 'about 0.9 tile high, on the ground');
  assert.ok(Math.abs(lo[0] + hi[0]) < 0.05 && Math.abs(lo[1] + hi[1]) < 0.05, 'centred on its tile');
});

const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q, v) => qmul(qmul(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]).slice(0, 3).map((c) => Math.round(c * 1000) / 1000 + 0);

test('the mound marks take SpecialPoint0\'s turn (skipped without public/assets): the copies\' sand runs with the wind — down / up along the rows, left / right along the columns', { skip: !existsSync(path.join(MAPFX, 'map_desert_02_down.json')) && 'no extracted fx' }, () => {
  const src = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
  assert.match(src, /play\('map', m\.name, \{ x: m\.c, y: m\.r, z: m\.z \}, null, MOUND_SP0_TURN\)/);
  assert.deepEqual([...MOUND_SP0_TURN], [-0.5, -0.5, 0.5, 0.5]);
  // the sand's run in the copies' shared `fixed` frame is its x axis (shazi_di drifts along it); the battle frame: x = column, y = row
  const run = (dir) => {
    const d = JSON.parse(readFileSync(path.join(MAPFX, `map_desert_02_${dir}.json`), 'utf8'));
    return qrot(qmul(MOUND_SP0_TURN, d.nodes.find((n) => n.name === 'static_offset').rot), [1, 0, 0]);
  };
  assert.deepEqual(run('down'), [0, -1, 0], 'DOWN: toward the lower rows (down the screen)');
  assert.deepEqual(run('up'), [0, 1, 0]);
  assert.deepEqual(run('left'), [-1, 0, 0]);
  assert.deepEqual(run('right'), [1, 0, 0]);
});
