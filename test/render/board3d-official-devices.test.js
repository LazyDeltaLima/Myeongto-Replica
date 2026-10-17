// test/render/board3d-official-devices.test.js — the device models drawn on an official stage scene (board3d/scene.js
// _buildDevices). The scene replaces the procedural board mesh, where the device slabs lived, so a device role needs the
// client's own model: 射击台 (our first port of it) and now 特制水上平台 (trap_040_canoe, 战场#05: upstream 205f3bb7
// found the water platforms missing on the official scene). 封印的地面 (trap_1107_acblock) has no renderer in the client
// prefab, so nothing is drawn for it. Units stand on the canoe's deck (scene.js waterPlatformFor → app.js stage
// `waterPlatformHeight` → tiles.js devH), as on the 射击台's plate.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { BoardScene } from '../../public/js/render/board3d/scene.js';
import { OFFICIAL_DEVICE, buildOfficialScene } from '../../public/js/render/board3d/official.js';
import { focusUniforms } from '../../public/js/render/board3d/materials.js';
import { resolveUvTable } from '../../public/js/render/board3d/atlas.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAGES = JSON.parse(readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'));

function stubRenderer() {
  return {
    domElement: { addEventListener() {}, removeEventListener() {} },
    shadowMap: { enabled: true, needsUpdate: false },
    capabilities: { getMaxAnisotropy: () => 8 },
    info: { render: { calls: 0, triangles: 0 }, memory: { textures: 0, geometries: 0 } },
    setClearColor() {}, setPixelRatio() {}, setSize() {}, render() {}, dispose() {},
  };
}
const fakePack = () => ({ key: 'test', images: { D: { width: 4, height: 4 } }, meshes: { gate: {} }, tiles: null, uv: resolveUvTable(null), materials: {} });

/** A stand-in for official.js built.devices: one Group per model, the keys it knows, the deck / plate heights. */
function fakeDevices(keys, tops) {
  return {
    has: (k) => keys.includes(k),
    top: (k) => (keys.includes(k) ? tops[k] ?? null : null),
    bounds: () => null,
    mesh(k) { const g = new THREE.Group(); g.name = `dev:${k}`; g.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())); return g; },
  };
}

describe('official scene devices: 射击台 and 特制水上平台 models, nothing for 封印的地面', () => {
  test('OFFICIAL_DEVICE names the canoe for the waterPlatform role', () => {
    assert.equal(OFFICIAL_DEVICE.waterPlatform, 'trap_040_canoe');
    assert.equal(OFFICIAL_DEVICE.platform, 'trap_1106_achplat');
  });

  test('_buildDevices puts a canoe on every active water platform tile and a plate on every 射击台, once per tile', () => {
    const board = new BoardScene(THREE, fakePack(), { renderer: stubRenderer() });
    board.meshes = {};
    board.officialBuilt = { stageId: 'x', devices: fakeDevices([OFFICIAL_DEVICE.platform, OFFICIAL_DEVICE.waterPlatform], { [OFFICIAL_DEVICE.waterPlatform]: 0.133 }) };
    const devices = [
      { kind: 'waterPlatform', r: 11, c: 4, z0: 0 }, { kind: 'waterPlatform', r: 11, c: 4, z0: 0 }, // listed twice
      { kind: 'waterPlatform', r: 11, c: 5, z0: 0 }, { kind: 'platform', r: 9, c: 4, z0: 0 },
      { kind: 'sealedFloor', r: 8, c: 8, z0: 0 },
    ];
    board._buildDevices({ devices });
    const placed = board._officialStatic.map((g) => `${g.name}@${g.position.y},${g.position.x}`).sort();
    assert.deepEqual(placed, ['dev:trap_040_canoe@11,4', 'dev:trap_040_canoe@11,5', 'dev:trap_1106_achplat@9,4']);
    assert.ok(board._officialStatic.every((g) => g.userData.officialDevice && g.parent === board.root));
    board.officialBuilt.stageId = 'act1autochess_m05';
    assert.equal(board.waterPlatformFor('act1autochess_m05'), 0.133, 'the deck the units stand on');
    assert.equal(board.waterPlatformFor('act1autochess_m01'), null, 'another stage');
    board.officialBuilt = null;
    board.destroy();
  });

  test('an extract without the canoe model draws no water platform model (as before)', () => {
    const board = new BoardScene(THREE, fakePack(), { renderer: stubRenderer() });
    board.meshes = {};
    board.officialBuilt = { stageId: 'x', devices: fakeDevices([OFFICIAL_DEVICE.platform], {}) };
    board._buildDevices({ devices: [{ kind: 'waterPlatform', r: 11, c: 4, z0: 0 }] });
    assert.deepEqual(board._officialStatic, []);
    assert.equal(board.waterPlatformFor('x'), null);
    board.officialBuilt = null;
    board.destroy();
  });

  test('2D tiles: a water platform tile stands on the official deck when the stage carries it, else the slab height', async () => {
    const { installFakePixi } = await import('./fakepixi.js');
    const fake = installFakePixi();
    try {
      const P = globalThis.PIXI;
      P.BLEND_MODES = { ADD: 1, NORMAL: 0 };
      const { TileField } = await import('../../public/js/render/tiles.js');
      const layers = { ground: new P.Container(), overlay: new P.Container(), props: new P.Container(), anim: new P.Container() };
      for (const l of Object.values(layers)) l.addChild = function (...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } return kids[0]; };
      const f = new TileField(layers);
      f.setExternal(true);
      const st = STAGES.act1autochess_m05;
      const d = st.devices.find((x) => x.key === 'trap_040_canoe' && !x.hidden);
      const [r, c] = d.pos;
      f.setStage(st);
      assert.ok(Math.abs(f.heightAt(r, c) - (f.grid[r][c].h + 0.2)) < 1e-9, 'procedural slab 0.2');
      f.setStage({ ...st, waterPlatformHeight: 0.133 });
      assert.ok(Math.abs(f.heightAt(r, c) - (f.grid[r][c].h + 0.133)) < 1e-9, 'the official deck');
      f.destroy();
    } finally {
      fake.restore();
    }
  });

  // the real extract (git-ignored public/assets/local, scene_extract.py --devices) when it has the canoe
  const manifestPath = path.join(ROOT, 'data/local-assets.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  const devPath = manifest?.groups?.['scene/devices']?.scene?.path;
  const onDisk = (p) => path.join(ROOT, 'public', p);
  const devDoc = devPath && existsSync(onDisk(devPath)) ? JSON.parse(readFileSync(onDisk(devPath), 'utf8')) : null;
  test('the extracted canoe: hull under the water line, its deck at the rim, two materials (boat + shadow)', { skip: !devDoc?.devices?.trap_040_canoe && 'canoe not extracted (scene_extract.py --devices)' }, () => {
    const info = devDoc.devices.trap_040_canoe;
    assert.ok(info.bounds[0][2] < 0 && info.top > 0.1 && info.top <= info.bounds[1][2], JSON.stringify(info));
    const g = manifest.groups['scene/devices'];
    const raw = readFileSync(onDisk(g.geom.path));
    const dv = { doc: devDoc, buffer: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) };
    const built = buildOfficialScene(THREE, { stageId: 'act1autochess_m05', doc: { groups: [], materials: {} }, buffer: new ArrayBuffer(0), textures: {}, lightmaps: [], devices: { stageId: 'devices', ...dv, textures: {}, lightmaps: [] } }, focusUniforms(THREE));
    assert.ok(built.devices.has(OFFICIAL_DEVICE.waterPlatform));
    assert.ok(built.devices.mesh(OFFICIAL_DEVICE.waterPlatform).children.length >= 2);
    built.dispose();
  });
});
