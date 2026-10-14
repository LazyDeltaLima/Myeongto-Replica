// test/render/fx-legacy-skin.test.js — motion the client drives outside the Mecanim Animators (render/fxplayer.js,
// tools/local-extract/fx_extract.py, 2026-10-14). A legacy Animation component's default clip (keyframe curves, not a
// muscle clip) becomes the same clip tracks — 37 prefabs whose spinning rings, swaying stones and fading layers stood
// still; a SkinnedMeshRenderer (never extracted: 水月 S2's tentacles, 斯卡蒂 S3's shark …) is drawn by its bones.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THREE = await import('../../public/vendor/three.module.js');
const fxp = await import('../../public/js/render/fxplayer.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FX = path.join(ROOT, 'public/assets/local/fx');
const near = (a, b, msg, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} ≠ ${b}`);
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const mat = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };

// a clip key [t, c0, c1, c2, c3]: value = ((c0 dt + c1) dt + c2) dt + c3 — a straight line from v at t with slope s
const lin = (t, s, v) => [t, 0, 0, s, v];

test('a legacy clip (wrap Loop) turns its node and repeats: a quaternion track through the clip track path', () => {
  // z from 0 to sin(45°) over 1 s, w from 1 to cos(45°): a quarter turn about z each second, again from the start
  const s = Math.SQRT1_2;
  const clip = { name: 'spin', len: 1, loop: true, legacy: 1, tracks: [{ node: 1, prop: 'quat', type: 4, curves: [
    [lin(0, 0, 0), lin(1, 0, 0)], [lin(0, 0, 0), lin(1, 0, 0)], [lin(0, s, 0), lin(1, 0, s)], [lin(0, s - 1, 1), lin(1, 0, s)]] }] };
  const def = { name: 't', duration: 1, materials: {}, clips: [clip], geoms: {}, lib: { texture: () => new THREE.Texture() },
    nodes: [node('t', -1), node('rotation', 0)] };
  const inst = new fxp.FxInstance(def, { quality: 'high' });
  const o = inst.nodes[1];
  inst.update(0.5);
  const a = new THREE.Euler().setFromQuaternion(o.quaternion).z;
  assert.ok(a > 0.6 && a < 1.0, `about half the quarter turn at 0.5 s: ${a}`);
  inst.update(1.0);   // 1.5 s: the second lap, the same pose as at 0.5 s
  near(new THREE.Euler().setFromQuaternion(o.quaternion).z, a, 'looped');
  assert.equal(inst.done, false, 'a looping clip keeps the effect until it is stopped');
  inst.dispose();
});

test('a skinned renderer is a SkinnedMesh bound to its bone nodes: turning a bone moves its vertices, the node\'s own transform does not', () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0, 2, 0, 0, 1, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  g.setIndex([0, 1, 2]);
  // bone 1 sits at x = 2 (bind pose = its inverse world matrix at bind time)
  g.userData.bind = [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -2, 0, 0, 1]];
  const def = { name: 't', duration: 1, materials: { m: mat }, clips: [], geoms: { sk: g }, lib: { texture: () => new THREE.Texture() },
    nodes: [node('t', -1), node('Plane001', 0, { pos: [5, 5, 0], skin: { mesh: 'sk', mat: 'm', order: 0, bones: [2, 3] } }),
      node('Bone001', 0), node('Bone002', 2, { pos: [2, 0, 0] })] };
  const inst = new fxp.FxInstance(def, { quality: 'high' });
  const mesh = inst.nodes[1].children.find((c) => c.isSkinnedMesh);
  assert.ok(mesh, 'drawn as a SkinnedMesh');
  assert.ok(mesh.skeleton.bones[0] === inst.nodes[2] && mesh.skeleton.bones[1] === inst.nodes[3], 'its bones are the nodes, in the mesh\'s order');
  assert.ok(inst.meshMats[1], 'its material is the node\'s mesh material (clips and uv tweens bind to it)');
  const world = (i) => {
    inst.object.updateMatrixWorld(true);
    mesh.skeleton.update();
    const v = new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), i);
    return mesh.applyBoneTransform(i, v).applyMatrix4(mesh.matrixWorld);
  };
  const toUnity = (v) => v.applyMatrix4(inst.unity.matrixWorld.clone().invert());
  const v1 = toUnity(world(1));
  near(v1.x, 2, 'bind pose: where the mesh says, not offset by its own node (5, 5)'); near(v1.y, 0, 'y');
  inst.nodes[3].rotation.set(0, 0, Math.PI / 2);   // bone 2 turns 90° about z: a vertex 0 from it stays, bone 1's do not move
  near(toUnity(world(1)).x, 2, 'on the bone\'s pivot');
  inst.nodes[2].rotation.set(0, 0, Math.PI / 2);   // bone 1 turns: (1, 0) → (0, 1)
  const v0 = toUnity(world(0));
  near(v0.x, 0, 'x'); near(v0.y, 1, 'y');
  let freed = 0;
  mesh.skeleton.dispose = () => { freed++; };
  inst.dispose();
  assert.equal(freed, 1, 'its skeleton (bone texture) goes with the effect');
});

test('fx_extract.py writes legacy clips and skinned renderers (--legacy-only / --skin-only)', () => {
  const fx = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
  assert.match(fx, /def hermite_keys\(keys, comp=None\)/);
  assert.match(fx, /def legacy_clip\(clip, rel, wrap=0\)/);
  assert.match(fx, /if anim\.type\.name == 'Animation':\n\s+return self\.legacy_clips/);
  assert.match(fx, /elif t == 'SkinnedMeshRenderer':/);
  assert.match(fx, /ap\.add_argument\('--legacy-only'/);
  assert.match(fx, /ap\.add_argument\('--skin-only'/);
});

const read = (f) => { const p = path.join(FX, f); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
const ceobe = read('cetsyr/cetsyr_trail_01.json');
test('the extracted cetsyr trail turns its `rotation` node in a 2 s loop (after fx_extract.py --legacy-only)', { skip: !ceobe?.clips?.some((c) => c.legacy) && 'not re-extracted' }, () => {
  const c = ceobe.clips.find((x) => x.legacy);
  assert.equal(c.loop, true);
  near(c.len, 2, 'length = the last key');
  const tr = c.tracks[0];
  assert.equal(ceobe.nodes[tr.node].name, 'rotation');
  assert.equal(tr.prop, 'quat');
  assert.equal(tr.curves.length, 4);
});

const mizuki = read('mizuki/mizuki_skill_02_buff.json');
test('the extracted 水月 S2 buff draws its tentacles skinned (after fx_extract.py --skin-only)', { skip: !mizuki?.nodes?.some((n) => n.skin) && 'not re-extracted' }, () => {
  const sk = mizuki.nodes.filter((n) => n.skin);
  assert.equal(sk.length, 2);
  for (const n of sk) {
    assert.ok(n.skin.bones.every((b) => /^Bone0\d\d$/.test(mizuki.nodes[b].name)), 'bones are the Bone### nodes');
    const m = read(`mesh/${n.skin.mesh}.json`);
    assert.equal(m.bind.length, n.skin.bones.length);
    assert.equal(m.bi.length, (m.pos.length / 3) * 4);
  }
  assert.ok(mizuki.clips.some((c) => c.legacy && c.loop && c.tracks.some((t) => t.prop === 'quat')), 'the bones turn in a loop');
});
