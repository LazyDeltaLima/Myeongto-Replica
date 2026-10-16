// test/render/fx-face-delay.test.js — maintainer decisions 2026-10-11 (docs/rules/fx.md 「좌우 거울·재생 속도·루트 지연」):
// 15 an effect turns to the direction it is played with as the client's ParticleEffect.FaceTo does by its prefab's
// `_rotateType` (only FLIP_TWO_SIDE flips; NONE is never mirrored), its playback speed follows `_usePlaybackSpeed` /
// `_limitedPlaybackSpeed`; 16 the root FxDelay `_delayTime` (and a branch's own) holds it back; 17 the 卫戍协议 template
// effects ('tplfx') play.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { faceTurn, playSpeed, startLead, parseDir } from '../../public/js/render/fx/face.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const PLAYER = readFileSync(path.join(ROOT, 'public/js/render/fxplayer.js'), 'utf8');
const EXTRACT = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
const TEXAS2 = path.join(ROOT, 'public/assets/local/fx/texas2');

const L = { x: -1, y: 0 }, R = { x: 1, y: 0 }, U = { x: 0, y: 1 }, D = { x: 0, y: -1 };

test('faceTurn: FLIP_TWO_SIDE flips facing left (right with _leftIsDefault), NONE neither flips nor turns', () => {
  assert.deepEqual(faceTurn({ rot: 1 }, L), { flip: true });
  assert.deepEqual(faceTurn({ rot: 1 }, R), { flip: false });
  assert.deepEqual(faceTurn({ rot: 1 }, U), { flip: false }, 'up / down: dir.x 0, not flipped');
  assert.deepEqual(faceTurn({ rot: 1, left: 1 }, R), { flip: true });
  assert.deepEqual(faceTurn({ rot: 1, left: 1 }, L), { flip: false });
  assert.deepEqual(faceTurn({ rot: 0 }, L), {});
  assert.deepEqual(faceTurn({ rot: 5 }, L), {}, 'outside the enum: nothing');
  assert.equal(faceTurn(null, L), null, 'no record: the caller keeps the old mirror');
});

test('faceTurn: FOUR_DIRECTION turns rotation_z by the 90° steps from _mainDir, FIXED_DIRECTION by RIGHT → _mainDir', () => {
  // _mainDir 1 RIGHT (84 of the 87 bound prefabs): as the old aimMover — RIGHT 0, UP 90, LEFT 180, DOWN 270
  assert.deepEqual([R, U, L, D].map((d) => faceTurn({ rot: 2, dir: 1 }, d).z), [0, 90, 180, 270]);
  assert.equal(faceTurn({ rot: 2, dir: 0 }, R).z, 270, '_mainDir UP played facing right: a quarter turn clockwise');
  assert.equal(faceTurn({ rot: 3, dir: 2 }, L).z, 270, 'FIXED: the direction is ignored');
  // _useBodyRotation: the four-way facing of the unit it is created on, not the given ±x
  assert.equal(faceTurn({ rot: 2, dir: 1, body: 1 }, R, 'UP').z, 90);
  assert.equal(faceTurn({ rot: 2, dir: 1 }, R, 'UP').z, 0, 'without the flag the body facing is not used');
  assert.equal(Math.round(faceTurn({ rot: 4 }, { x: 0, y: -2 }).any), -90);
  assert.equal(parseDir({ x: -0.2, y: 0.9 }), 'UP');
  assert.equal(parseDir(null), 'RIGHT');
});

test('playSpeed: _usePlaybackSpeed 0 = 1.0; capped at _limitedPlaybackSpeed ÷ the battle speed (default 2; < 0 = no cap)', () => {
  assert.equal(playSpeed(null, 1.6, 2), 1.6, 'no record: as given');
  assert.equal(playSpeed({ rot: 1, speed: 0 }, 1.6, 1), 1);
  assert.equal(playSpeed({ rot: 1 }, 1.6, 1), 1.6);
  assert.equal(playSpeed({ rot: 1 }, 1.6, 2), 1, 'never faster than ×2 on screen');
  assert.equal(playSpeed({ rot: 1, limit: -1 }, 1.6, 2), 1.6);
  assert.equal(playSpeed({ rot: 1, limit: 4 }, 3, 2), 2);
  assert.ok(Math.abs(startLead({ fxDelay: 0.3 }, 1.5) - 0.2) < 1e-9, 'FxDelay ÷ the playback speed');
  assert.equal(startLead({ delay: 0.6 }, 2), 0.6, '_delayToPlay is game time');
  assert.equal(startLead(null, 1), 0);
});

async function three() {
  const THREE = await import('../../public/vendor/three.module.js');
  const fxp = await import('../../public/js/render/fxplayer.js');
  const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
  const stub = (def) => Object.assign(def, { geoms: new Proxy({}, { get: () => tri() }), lib: { texture: () => new THREE.Texture() } });
  return { fxp, stub };
}
const MAT = { m: { shader: 'x', tex: {}, floats: {}, colors: {}, queue: -1 } };
/** A prefab with one mesh under root/static_offset/<pivot>. */
const tiny = (face, pivot = 'rotation_y', extra = {}) => ({
  name: 't', duration: 1, materials: MAT, clips: [], ...extra,
  nodes: [{ name: 't', parent: -1 }, { name: 'static_offset', parent: 0 }, { name: pivot, parent: 1 }, { name: 'q', parent: 2, mesh: { mesh: 'q', mat: 'm' }, ...(extra.qNode || {}) }],
  ...(face ? { face } : {}),
});

test('FxInstance: FLIP_TWO_SIDE turns rotation_y 180° instead of mirroring; NONE is never mirrored; no record = the old mirror', async () => {
  const { fxp, stub } = await three();
  const flip = new fxp.FxInstance(stub(tiny({ rot: 1 })), { quality: 'high', facing: -1 });
  assert.equal(flip.unity.scale.x, 1, 'not mirrored');
  assert.equal(flip.nodes[2].rotation.y, Math.PI);
  const right = new fxp.FxInstance(stub(tiny({ rot: 1 })), { quality: 'high', facing: 1 });
  assert.equal(right.nodes[2].rotation.y, 0);
  const none = new fxp.FxInstance(stub(tiny({ rot: 0 })), { quality: 'high', facing: -1 });
  assert.equal(none.unity.scale.x, 1);
  assert.equal(none.nodes[2].rotation.y, 0);
  const old = new fxp.FxInstance(stub(tiny(null)), { quality: 'high', facing: -1 });
  assert.equal(old.unity.scale.x, -1, 'a prefab without a ParticleEffect root (trail, line): mirrored as before');
  // FollowMountPoint `_followScaleSign`: the Spine flip's scale sign
  const sign = new fxp.FxInstance(stub(tiny({ rot: 0 }, 'rotation_y', { mount: { type: 0, followScaleSign: 1 } })), { quality: 'high', facing: -1 });
  assert.equal(sign.unity.scale.x, -1);
  // FOUR_DIRECTION with the four-way facing (`_useFourDirectionalFace`): rotation_z
  const four = new fxp.FxInstance(stub(tiny({ rot: 2, dir: 1 }, 'rotation_z')), { quality: 'high', facing: 1, dir: U });
  assert.ok(Math.abs(four.nodes[2].rotation.z - Math.PI / 2) < 1e-9);
  for (const i of [flip, right, none, old, sign, four]) i.dispose();
});

test('FxInstance: nothing is drawn during the root FxDelay; ended before it passed, it never shows', async () => {
  const { fxp, stub } = await three();
  const a = new fxp.FxInstance(stub(tiny({ rot: 0, fxDelay: 0.3 })), { quality: 'high' });
  assert.equal(a.unity.visible, false);
  assert.equal(a.lead, 0.3);
  a.update(0.2);
  assert.equal(a.unity.visible, false);
  assert.equal(a.done, false, 'waiting is not done');
  a.update(0.2);
  assert.equal(a.unity.visible, true);
  assert.ok(Math.abs(a.time - 0.1) < 1e-9, 'its own clock starts when it shows');
  const b = new fxp.FxInstance(stub(tiny({ rot: 0, fxDelay: 0.3 })), { quality: 'high' });
  b.update(0.1);
  b.stop();
  assert.equal(b.done, true, 'FinishMe before the delay: recycled unseen');
  const c = new fxp.FxInstance(stub(tiny({ rot: 0, fxDelay: 0.3 })), { quality: 'high', delays: false });
  assert.equal(c.unity.visible, true);
  for (const i of [a, b, c]) i.dispose();
});

test('FxInstance: a branch with its own FxDelay (game time × speed) / _subFXDelayConfigs entry (effect time) starts later', async () => {
  const { fxp, stub } = await three();
  const own = new fxp.FxInstance(stub(tiny({ rot: 0 }, 'rotation_y', { qNode: { delay: 0.2 } })), { quality: 'high', speed: 2 });
  assert.equal(own.nodes[3].visible, false);
  assert.ok(Math.abs(own.lead - 0.4) < 1e-9, 'its 0.2 game s at ×2 = 0.4 effect s');
  own.update(0.3);
  assert.equal(own.nodes[3].visible, false);
  assert.equal(own.done, false);
  own.update(0.15);
  assert.equal(own.nodes[3].visible, true);
  const sub = new fxp.FxInstance(stub(tiny({ rot: 0 }, 'rotation_y', { qNode: { sdelay: 0.23 } })), { quality: 'high', speed: 2 });
  assert.ok(Math.abs(sub.lead - 0.23) < 1e-9, 'delayTime ÷ speed in game time = delayTime here');
  for (const i of [own, sub]) i.dispose();
});

test('텍사스 디 오메르토사 S2: her two cast effects show 0.17 / 0.30 s ÷ the playback speed after the swing (skipped without public/assets)',
  { skip: !existsSync(path.join(TEXAS2, 'texas2_skill_02_start_02.json')) && 'no extracted fx' }, async () => {
    const { fxp, stub } = await three();
    const speed = 1.25; // the cast's playback speed (fxgame.js: each frame dt × battle speed × speed)
    for (const [name, delay] of [['texas2_skill_02_start', 0.17], ['texas2_skill_02_start_02', 0.3]]) {
      const def = stub(JSON.parse(readFileSync(path.join(TEXAS2, `${name}.json`), 'utf8')));
      assert.equal(def.face?.fxDelay, delay, name);
      assert.equal(playSpeed(def.face, speed, 1), speed, `${name}: _usePlaybackSpeed 1, no cap (limit −1)`);
      const inst = new fxp.FxInstance(def, { quality: 'high', facing: -1, speed });
      const at = (gameS) => gameS * speed;   // effect seconds after gameS
      inst.update(at(delay / speed - 0.01));
      assert.equal(inst.unity.visible, false, `${name}: not yet at ${(delay / speed - 0.01).toFixed(3)} s`);
      inst.update(at(0.02));
      assert.equal(inst.unity.visible, true, `${name}: shown at ${(delay / speed + 0.01).toFixed(3)} s`);
      assert.equal(startLead(def.face, speed), delay / speed);
      // FLIP_TWO_SIDE facing left: its rotation_y is turned, the effect is not mirrored
      assert.equal(inst.unity.scale.x, 1);
      assert.equal(inst.nodes[def.nodes.findIndex((n) => n.name === 'rotation_y')].rotation.y, Math.PI);
      inst.dispose();
    }
  });

test('fxgame play() / spawn(): played with a direction and the prefab\'s speed; the delay lengthens a one-shot\'s end', () => {
  assert.match(SRC, /const dir = aimed \? \{ x: Number\(at\.x\) - Number\(aim\.x\), y: Number\(at\.y\) - Number\(aim\.y\) \} : fourWay \? WAY4\[facingDir\(view\)\] : \{ x: side, y: 0 \};/);
  assert.match(SRC, /const sp = playSpeed\(def\.face, speed, gameRate\(\)\);/);
  assert.match(SRC, /new mod\.fxp\.FxInstance\(def, \{ quality: q\(\), facing, dir, body: facingDir\(at && at\.info \? at : view\), speed: sp, split, floor: ground\.z \|\| 0 \}\)/);
  assert.match(SRC, /const until = buff \? null : endAt \?\? clockS \+ \(def\.duration \|\| 3\) \+ 0\.5 \+ inst\.lead \/ sp;/);
  assert.match(SRC, /speed: sp, cast, backSw/);
  assert.match(SRC, /const sp = playSpeed\(def\.face, entry\.speed \?\? 1, gameRate\(\)\);/);
  // the old mirror and turns stay only for a prefab without the record
  assert.match(SRC, /const turnOld = !def\.face && fourWay/);
  assert.match(SRC, /if \(aimed && !def\.face\) aimAlong\(inst, aim, at\);/);
  assert.match(PLAYER, /const mirror = turn \? \(def\?\.mount\?\.followScaleSign \? facing : 1\) : facing;/);
});

test('卫戍协议 template effects: the sim\'s [\'tplfx\', target | null, key, source] plays the prefab on the target or the field', () => {
  assert.match(SRC, /case 'tplfx': tplFx\(e, views\); return;/);
  const at = SRC.indexOf('function tplFx(');
  const body = SRC.slice(at, SRC.indexOf('\n  }\n', at));
  assert.match(body, /const r = tplPrefab\(e\[2\]\);\n\s+if \(!r\) return;/, 'not extracted: nothing');
  assert.match(body, /if \(e\[1\] == null\)/, 'no target: a screen-position effect');
  assert.match(body, /if \(!tgt\) return;/);
  assert.match(body, /if \(tgt\.alive === false \|\| tgt\.remove\) \{/, 'a unit leaving in the same moment: where it stood');
  assert.match(SRC, /const TPL_BUNDLES = \['bond', 'map', 'common', 'buff'\];/);
});

test('fx_extract.py records _useBodyRotation and the branch delays (node delay / sdelay, --delay-only)', () => {
  assert.match(EXTRACT, /'body': i\(s \+ 11 \+ x\)/);   // `x`: the CN client's layout, one word later
  // the CN client's (newer) components: the effect's 30 words from s (one more before `_rotateType`), the mount's 9 (two more after `_followScale`)
  assert.match(EXTRACT, /x = 1 if len\(b\) \/\/ 4 - s == 30 else 0/);
  // (8 words: the EN client's later `_pauseWhenFollowScaleNearlyZero`; 9 → w[:3] + w[5:] as before)
  assert.match(EXTRACT, /if words not in \(7, 8, 9\):\n\s+return None\n\s+w = struct\.unpack_from\(f'<\{words\}i', raw, off\)\n\s+v = w\[:3\] \+ w\[3 \+ words - 7:\]/);
  assert.match(EXTRACT, /if pe\.get\('body'\):\n\s+o\['body'\] = 1/);
  assert.match(EXTRACT, /node\['delay'\] = dl/);
  assert.match(EXTRACT, /nodes\[k\]\['sdelay'\] = t/);
  assert.match(EXTRACT, /def delay_only\(self, bundle, pack=None\):/);
  assert.match(EXTRACT, /'--delay-only'/);
});

test('enemy_bindings.py keeps a template\'s node effects of other events apart (`onEvent`), not in its start `fx`', () => {
  const EB = readFileSync(path.join(ROOT, 'tools/local-extract/enemy_bindings.py'), 'utf8');
  assert.match(EB, /if ev != '0' and f in \('fx', 'line'\):\n\s+lst = out\.setdefault\('onEvent', \{\}\)\.setdefault\(ev, \[\]\)/);
  assert.match(EB, /for ev, acts in \(t\.get\('eventToActions'\) or \{\}\)\.items\(\):\n\s+walk\(acts, str\(ev\)\)/);
  // the render plays a buff's own effect (its template `key` / overrideEffectKey), never the template's node effects
  assert.doesNotMatch(SRC, /template\)?\??\.fx\b|\.onEvent\?\.|onEvent\[/);
});
