// test/render/projectile-body-turn.test.js — a projectile's `_mainEffect` on its body (2026-10-27, effect bundle W2b, official
// client; docs/rules/fx.md 「투사체 꼬리 방향」): `ProjectileEffect.OnBeforePlay` sets the root's rotation on the body from
// `_resetMainDir` / `_mainDir` / `_rotate180Y` and rolls it by up to `_randomAngle` — fx_extract.py projectile_turn writes
// `mainRot` / `roll`, render/fx/face.js bodyTurn turns the trail (the body's +y = the flight). Bundle W2b-2: a body without
// `_rotateToTarget` is not turned (fx_extract.py body_still `still` / `stillBy`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bodyStill, bodyTurn } from '../../public/js/render/fx/face.js';
import { lobZ } from '../../public/js/render/fx/projectiles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(ROOT, 'tools/local-extract');
const PY = [path.join(ROOT, '.venv-extract/bin/python'), 'python3'].find((p) => spawnSync(p, ['-c', 'import UnityPy'], { encoding: 'utf8' }).status === 0);
const FX = path.join(ROOT, 'public/assets/local/fx');
const ARCHET = path.join(FX, 'archet/archet_skill_03_trail.json');

test('fx_extract.py projectile_turn: the root turn OnBeforePlay gives on the body, its own rotation dropped', { skip: !PY && 'no python with UnityPy' }, () => {
  const src = `import sys, json
sys.path.insert(0, ${JSON.stringify(TOOL)})
import fx_extract as fe
ex = fe.Extractor.__new__(fe.Extractor)
out = []
for pj in ({'reset': True, 'mainDir': 1, 'rotate180Y': False, 'randomAngle': 0.0},
           {'reset': True, 'mainDir': 2, 'rotate180Y': False, 'randomAngle': 0.0},
           {'reset': True, 'mainDir': 3, 'rotate180Y': False, 'randomAngle': 0.0},
           {'reset': True, 'mainDir': 1, 'rotate180Y': True, 'randomAngle': 0.0},
           {'reset': True, 'mainDir': 0, 'rotate180Y': True, 'randomAngle': 0.0},
           {'reset': False, 'mainDir': 2, 'rotate180Y': False, 'randomAngle': 360.0}, None):
    ex.projectile_effect = lambda root, pj=pj: pj
    out.append(ex.projectile_turn(None, [0, 0, -0.0426, 0.9991]))
print(json.dumps(out))`;
  const r = spawnSync(PY, ['-I', '-c', src], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = Math.SQRT1_2;
  const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-3);
  const [right, down, left, flip, up, kept, none] = JSON.parse(r.stdout);
  assert.ok(near(right.mainRot, [0, 0, s, s]) && !('roll' in right), 'RIGHT: Euler(0, 0, 90), the prefab\'s own z −5° dropped');
  assert.ok(near(down.mainRot, [0, 0, 1, 0]), 'DOWN: z 180');
  assert.ok(near(left.mainRot, [0, 0, s, -s]), 'LEFT: z 270');
  assert.ok(near(flip.mainRot, [s, s, 0, 0]), 'RIGHT + _rotate180Y: Euler(0, 180, 90)');
  assert.ok(near(up.mainRot, [0, 0, -0.0426, 0.9991]), 'UP: nothing set (its own rotation, 180Y ignored)');
  assert.ok(near(kept.mainRot, [0, 0, -0.0426, 0.9991]) && kept.roll === 360, 'no reset: its own rotation; the roll still');
  assert.deepEqual(none, {}, 'another root: no record');
});

async function trail(def) {
  const THREE = await import('../../public/vendor/three.module.js');
  const object = new THREE.Group(), root = new THREE.Group();
  object.add(root);
  return { THREE, inst: { def, object, nodes: [root] } };
}
// where the prefab's own axis `v` points on the board (the instance's object then its root; z turns only)
const axis = (THREE, inst, v) => {
  inst.object.updateMatrixWorld(true);
  return new THREE.Vector3(...v).applyQuaternion(inst.nodes[0].getWorldQuaternion(new THREE.Quaternion()));
};

test('bodyTurn: the body\'s +y along the flight, the root on it — RIGHT keeps the prefab\'s +x on the flight', async () => {
  const s = Math.SQRT1_2;
  for (const a of [0, Math.PI / 2, 2.2]) {
    const { THREE, inst } = await trail({ mainRot: [0, 0, s, s] });
    bodyTurn(inst, THREE, a);
    const x = axis(THREE, inst, [1, 0, 0]);
    assert.ok(Math.abs(x.x - Math.cos(a)) < 1e-6 && Math.abs(x.y - Math.sin(a)) < 1e-6, `${a}: ${x.toArray()}`);
  }
  const { THREE, inst } = await trail({ mainRot: [0, 0, 1, 0] });   // DOWN: the prefab's −y on the flight
  bodyTurn(inst, THREE, 0);
  const y = axis(THREE, inst, [0, -1, 0]);
  assert.ok(Math.abs(y.x - 1) < 1e-6, `DOWN: ${y.toArray()}`);
});

test('bodyTurn: the roll is drawn once per play, about the prefab\'s own x; a root without the record keeps its own rotation on the body', async () => {
  const s = Math.SQRT1_2;
  const { THREE, inst } = await trail({ mainRot: [0, 0, s, s], roll: 360 });
  bodyTurn(inst, THREE, 0, () => 0.25);
  const up = axis(THREE, inst, [0, 1, 0]);
  bodyTurn(inst, THREE, 1, () => 0.75);   // a later frame of the same flight: the root is not turned again
  inst.object.rotation.set(0, 0, -Math.PI / 2);
  const again = axis(THREE, inst, [0, 1, 0]);
  assert.ok(up.distanceTo(again) < 1e-6, 'one roll per play');
  assert.ok(Math.abs(up.z) > 0.99, `rolled 90° about the flight: the prefab's +y stands up (${up.toArray()})`);
  const x = axis(THREE, inst, [1, 0, 0]);
  assert.ok(Math.abs(x.x - 1) < 1e-6, 'its x stays on the flight');
  const own = await trail({});
  bodyTurn(own.inst, own.THREE, 0.7);
  assert.ok(Math.abs(own.inst.object.rotation.z - (0.7 - Math.PI / 2)) < 1e-12, 'the body\'s +y on the flight, the root untouched');
  assert.ok(own.inst.nodes[0].quaternion.equals(new own.THREE.Quaternion()));
});

test('bodyTurn (W2b-2): a body without _rotateToTarget keeps the board\'s frame, the root still turned on it', async () => {
  const s = Math.SQRT1_2;
  for (const a of [0, 1.1, -2.5]) {
    const { THREE, inst } = await trail({ mainRot: [0, 0, s, s], still: 1 });
    bodyTurn(inst, THREE, a);
    assert.equal(inst.object.rotation.z, 0);
    const x = axis(THREE, inst, [1, 0, 0]);
    assert.ok(Math.abs(x.y - 1) < 1e-6, `${a}: RIGHT on an unturned body points the board's UP (${x.toArray()})`);
  }
  const plain = await trail({ still: 1 });
  bodyTurn(plain.inst, plain.THREE, 0.7);
  assert.equal(plain.inst.object.rotation.z, 0);
  // stillBy: only on the projectiles it names (引星棘刺's thorn2_attack_trail: S1–S3 do not turn, her normal attack does)
  const by = { stillBy: ['projectile_chr_thorn2_s1', 'projectile_chr_thorn2_s3'] };
  assert.equal(bodyStill(by, 'projectile_chr_thorn2_s1'), true);
  assert.equal(bodyStill(by, 'Projectile_Chr_Thorn2_S3'), true, 'keys compared in lower case');
  assert.equal(bodyStill(by, 'projectile_chr_thorn2'), false);
  assert.equal(bodyStill(by, null), false, 'no key: the body turns');
  assert.equal(bodyStill({}, 'projectile_chr_thorn2_s1'), false);
  const t = await trail(by);
  bodyTurn(t.inst, t.THREE, 0.7, undefined, 'projectile_chr_thorn2_s1');
  assert.equal(t.inst.object.rotation.z, 0);
  bodyTurn(t.inst, t.THREE, 0.7, undefined, 'projectile_chr_thorn2');
  assert.ok(Math.abs(t.inst.object.rotation.z - (0.7 - Math.PI / 2)) < 1e-12);
});

test('bodyTurn (2026-10-30): a 3D flight direction pitches the body (FaceTo3dUpwardMajor) — level, the board angle\'s turn', async () => {
  for (const a of [0, 1.1, -2.5]) {
    const lvl = await trail({}), ang = await trail({});
    bodyTurn(lvl.inst, lvl.THREE, [Math.cos(a) * 3, Math.sin(a) * 3, 0]);
    bodyTurn(ang.inst, ang.THREE, a);
    assert.ok(lvl.inst.object.quaternion.angleTo(ang.inst.object.quaternion) < 1e-6, `${a}: a level direction = the angle`);
  }
  const { THREE, inst } = await trail({});
  bodyTurn(inst, THREE, [2, 0, -1]);   // muzzle above the hit point: nose down
  const y = new THREE.Vector3(0, 1, 0).applyQuaternion(inst.object.quaternion);
  const z = new THREE.Vector3(0, 0, 1).applyQuaternion(inst.object.quaternion);
  assert.ok(y.distanceTo(new THREE.Vector3(2, 0, -1).normalize()) < 1e-6, `+y along the flight (${y.toArray()})`);
  assert.ok(Math.abs(z.dot(y)) < 1e-6 && z.z > 0 && Math.abs(z.y) < 1e-6, `its z stays square to it in the vertical plane, upward (${z.toArray()})`);
  const still = await trail({ still: 1 });
  bodyTurn(still.inst, still.THREE, [2, 0, -1]);
  assert.ok(still.inst.object.quaternion.equals(new still.THREE.Quaternion()), 'still: unturned');
});

test('fx_extract.py body_still: still when no carrier turns, stillBy when some do, nothing else', { skip: !PY && 'no python with UnityPy' }, () => {
  const src = `import sys, json
sys.path.insert(0, ${JSON.stringify(TOOL)})
import fx_extract as fe
ex = fe.Extractor.__new__(fe.Extractor)
ex.carriers = {'a_trail': {'p_a': False, 'p_a_graphic': False}, 'b_trail': {'p_b': True, 'p_b_s1': False}, 'c_trail': {'p_c': True}}
print(json.dumps([ex.body_still(n) for n in ('A_Trail', 'b_trail', 'c_trail', 'other')]))`;
  const r = spawnSync(PY, ['-I', '-c', src], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [{ still: 1 }, { stillBy: ['p_b_s1'] }, {}, {}]);
});

test('the extracted unturned bodies (skipped without public/assets): 赫默\'s heal shot still, 引星棘刺\'s attack trail by projectile', { skip: !existsSync(path.join(FX, 'thorn2/thorn2_attack_trail.json')) && 'no extracted fx' }, () => {
  const silent = JSON.parse(readFileSync(path.join(FX, 'silent/silent_attack_01_trail.json'), 'utf8'));
  assert.equal(silent.still, 1);
  const thorn = JSON.parse(readFileSync(path.join(FX, 'thorn2/thorn2_attack_trail.json'), 'utf8'));
  assert.ok(!('still' in thorn) && thorn.stillBy.includes('projectile_chr_thorn2_s1') && !thorn.stillBy.includes('projectile_chr_thorn2'));
  assert.ok(!('still' in JSON.parse(readFileSync(ARCHET, 'utf8'))), '空弦 S3 turns');
});

test('the extracted 空弦 S3 trail (skipped without public/assets): RIGHT, rolled up to 360°', { skip: !existsSync(ARCHET) && 'no extracted fx' }, () => {
  const d = JSON.parse(readFileSync(ARCHET, 'utf8'));
  assert.deepEqual(d.mainRot, [0, 0, 0.7071, 0.7071]);
  assert.equal(d.roll, 360);
});

test('lobZ (2026-10-30, ParacurveMovement.OnInit): H above the start, an uneven fall to the target, none within 1.3 tiles', () => {
  const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
  const at = (rec, n = 2000) => Array.from({ length: n + 1 }, (_, i) => lobZ(rec, i / n));
  const line = { x0: 0, y0: 0, z0: 0.6, tx: 3, ty: 0, tz: 0.3, arc: 0 };
  const mid = lobZ(line, 0.5);
  assert.ok(near(mid[0], 0.45) && near(mid[1], -0.3), 'arc 0: the straight line');
  const lob = { x0: 0, y0: 0, z0: 0.6, tx: 3, ty: 0, tz: 0.3, arc: 1 };   // 灰毫: H 1 from a muzzle 0.3 above the hit point
  const zs = at(lob), top = Math.max(...zs.map((p) => p[0])), kTop = zs.findIndex((p) => p[0] === top) / 2000;
  assert.ok(near(lobZ(lob, 0)[0], 0.6) && near(lobZ(lob, 1)[0], 0.3), 'from the muzzle to the hit point');
  assert.ok(near(top, 1.6, 1e-6), `the top H above the start (${top})`);
  const H = 1, D = 0.6 + 1 - 0.3;
  assert.ok(near(kTop, Math.sqrt(H) / (Math.sqrt(H) + Math.sqrt(D)), 1e-3) && kTop < 0.5, `up √H : down √D (${kTop})`);
  for (const k of [0.1, 0.4, 0.8]) {
    const d = (lobZ(lob, k + 1e-6)[0] - lobZ(lob, k - 1e-6)[0]) / 2e-6;
    assert.ok(near(d, lobZ(lob, k)[1], 1e-5), `slope at ${k}`);
  }
  const close = { x0: 0, y0: 0, z0: 0.6, tx: 1, ty: 0.5, tz: 0.3, arc: 1 };   // 1.12 tiles: `_noRaiseHeightThreshold` 1.3
  assert.ok(at(close).every((p) => p[0] <= 0.6 + 1e-12) && near(lobZ(close, 1)[0], 0.3) && near(lobZ(close, 0)[1], 0), 'leaves level, drops to it');
  const inv = { x0: 0, y0: 0, z0: 0.6, tx: 3, ty: 0, tz: 0.6, arc: -0.3 };   // 跃跃's second boomerang
  const zi = at(inv).map((p) => p[0]);
  assert.ok(near(zi[2000], 0.6) && near(Math.min(...zi), 0.3, 1e-6), 'the inverse arc dips H under its start and comes back');
  const high = { x0: 0, y0: 0, z0: 0.2, tx: 3, ty: 0, tz: 2, arc: 0.5 };   // a target above the top: closed along the line
  assert.ok(near(lobZ(high, 1)[0], 2));
});
