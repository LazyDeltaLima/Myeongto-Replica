// test/render/fx-graphic-tilt.test.js — an effect created on a unit takes its model's `Graphic` rotation, X −30°
// (docs/rules/fx.md 「캐릭터 그림의 기울기」, 2026-10-22). The client's Effect._InitLocationFromEntity (RVA 0xE7AF80) sets the
// rotation of a FOOT / HIT / HEAD / MUZZLE / MP_SPECIAL effect to the unit's Graphic (or point) rotation; the prefabs are
// authored in that plane, facing the 30° camera. Untilted, 泥岩's and 新约能天使 S2's shield discs lay on the board and were
// drawn as ellipses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const THREE = await import('../../public/vendor/three.module.js');
const fxp = await import('../../public/js/render/fxplayer.js');
const { GRAPHIC_TILT, takesGraphicTurn } = await import('../../public/js/render/fxpoints.js');
const { presetCamera } = await import('../../public/js/render/projection.js');

const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
// 泥岩's mudrok_buff_01_start `hudun_andi`: a flattened disc in its node's XY plane, 0.574 up the skeleton plane
const disc = () => ({ name: 'd', duration: 0, spawn: 1, materials: { m: { shader: 'Torappu/Particles/Alpha Blended', tex: {}, floats: {}, colors: {} } }, clips: [],
  geoms: new Proxy({}, { get: () => tri() }), lib: { texture: () => new THREE.Texture() },
  nodes: [node('d', -1), node('fixed', 0), node('hudun_andi', 1, { pos: [0, 0.574, 0.02], scale: [0.3374, 0.3374, 0.0095], mesh: { mesh: 'g', mat: 'm', order: 0 } })] });

/** Height ÷ width on screen of the disc's rim (radius 1 in its node) with the effect placed at board (col, row). */
function screenRatio(tilt, col, row) {
  const inst = new fxp.FxInstance(disc(), { quality: 'high', tilt });
  inst.object.position.set(col, row, 0);
  inst.object.updateMatrixWorld(true);
  const m = inst.nodes[2].matrixWorld, cam = presetCamera('normal', { width: 1920, height: 1080 });
  const v = new THREE.Vector3(), p = { x: 0, y: 0, s: 0, depth: 0 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let a = 0; a < 360; a += 3) {
    v.set(Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), 0).applyMatrix4(m);
    cam.project(v.x, v.y, v.z, p);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  inst.dispose();
  return (y1 - y0) / (x1 - x0);
}

test('the client\'s _spawnLocation switch: FOOT, HIT, HEAD, MUZZLE and the special points take the Graphic\'s rotation', () => {
  const on = [1, 2, 3, 4, 8, 9, 10, 11, 13, 14, 15, 16, 18, 25];
  const off = [0, 5, 6, 7, 12, 17, undefined];
  for (const s of on) assert.equal(takesGraphicTurn({ spawn: s }), true, `spawn ${s}`);
  for (const s of off) assert.equal(takesGraphicTurn({ spawn: s }), false, `spawn ${s}`);
  // a FollowMountPoint that turns with its point every frame: a model point is tilted, GROUND / UI are not
  assert.equal(takesGraphicTurn({ spawn: 0, mount: { type: 5, keepOriginRotation: 0 } }), true, 'SPECIAL_0');
  assert.equal(takesGraphicTurn({ spawn: 1, mount: { type: 7, keepOriginRotation: 0 } }), false, 'GROUND');
  // one that keeps its first rotation: the spawn's
  assert.equal(takesGraphicTurn({ spawn: 0, mount: { type: 5, keepOriginRotation: 1 } }), false);
  assert.equal(takesGraphicTurn({ spawn: 1, mount: { type: 5, keepOriginRotation: 1 } }), true);
  // the prefabs' Graphic: X −30°
  const ang = (2 * Math.atan2(GRAPHIC_TILT[0], GRAPHIC_TILT[3]) * 180) / Math.PI;
  assert.ok(Math.abs(ang + 30) < 1e-4 && GRAPHIC_TILT[1] === 0 && GRAPHIC_TILT[2] === 0, `${ang}`);
});

test('tilted, the skeleton plane\'s up rises toward the camera: local +y = (row cos 30°, height sin 30°) on the board', () => {
  const inst = new fxp.FxInstance(disc(), { quality: 'high', tilt: GRAPHIC_TILT });
  inst.object.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyMatrix4(inst.nodes[0].matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(inst.nodes[0].matrixWorld));
  assert.ok(Math.abs(up.x) < 1e-6 && Math.abs(up.y - Math.cos(Math.PI / 6)) < 1e-6 && Math.abs(up.z - 0.5) < 1e-6, `${up.toArray()}`);
  inst.dispose();
  const flat = new fxp.FxInstance(disc(), { quality: 'high' });
  flat.object.updateMatrixWorld(true);
  assert.ok(Math.abs(flat.nodes[2].matrixWorld.elements[14]) < 0.05, 'untilted: the disc lies on the board');
  flat.dispose();
});

test('泥岩\'s shield disc on the battle camera: round on every row when tilted (it was 0.78–1.08 high ÷ wide)', () => {
  for (const row of [6, 8, 10, 12]) {
    const r = screenRatio(GRAPHIC_TILT, 10, row);
    assert.ok(Math.abs(r - 1) < 0.01, `row ${row}: ${r}`);
  }
  assert.ok(Math.abs(screenRatio(null, 10, 12) - 1) > 0.15, 'the old ellipse, for reference');
});

test('the extracted shields are FOOT_POINT effects (泥岩 talent, 泥岩 the enemy, 新约能天使 S2)', (t) => {
  const files = ['mudrok/mudrok_buff_01_start', 'pfx_enemy_8/enemy_mdrock_skill_buff_01', 'angel2/angel2_skill_2_buff_01'];
  const at = (f) => new URL(`../../public/assets/local/fx/${f}.json`, import.meta.url);
  if (!files.every((f) => fs.existsSync(at(f)))) { t.skip('effects not extracted'); return; }
  for (const f of files) assert.equal(takesGraphicTurn(JSON.parse(fs.readFileSync(at(f), 'utf8'))), true, f);
});

test('fxgame.js passes the tilt where an effect is created on a unit (cast / hit, status, buff end, back switch, kit spawn, arena)', () => {
  const src = fs.readFileSync(new URL('../../public/js/render/fxgame.js', import.meta.url), 'utf8');
  for (const s of ['tilt: tiltOn(ground, def)', 'tilt: tiltOn(sw.unit, def)', 'hold, tilt: tiltOn(view, def)', 'floor: view.z || 0, tilt: tiltOn(view, def)',
    'tilt: drop ? null : tiltOn(unit, def)', 'tilt: tiltOn(at, def)']) assert.ok(src.includes(s), s);
});

// 뮤엘시스 S3 mlyss_skill_03_buff_02 `bg_wave_01`: an order-0 quad in the skeleton plane, 0.1 behind her
const backdrop = () => ({ ...disc(), nodes: [node('b', -1), node('rotation_y', 0),
  node('bg_wave_01', 1, { pos: [0.21, 0.58, 0.1], scale: [1.6, 1.4, 1], mesh: { mesh: 'g', mat: 'm', order: 0 } })],
  geoms: new Proxy({}, { get: () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; } }) });

test('the split sides are judged untilted: a backdrop in the skeleton plane stays behind the unit (뮤엘시스 / 비르투오사 S3)', () => {
  const side = (tilt) => {
    const inst = new fxp.FxInstance(backdrop(), { quality: 'high', split: true, tilt });
    const mesh = inst.nodes[2].children.find((c) => c.isMesh);
    const r = { back: mesh.layers.mask === 1 << fxp.FX_BACK, up: new THREE.Vector3(0, 1, 0).transformDirection(inst.nodes[0].matrixWorld) };
    inst.dispose();
    return r;
  };
  const flat = side(null), tilted = side(GRAPHIC_TILT);
  assert.ok(flat.back && tilted.back, `tilted, the backdrop counted as a dome around her and covered her: ${flat.back} / ${tilted.back}`);
  assert.ok(Math.abs(tilted.up.z - 0.5) < 1e-6, 'the tilt is put back after the judgment');
});
