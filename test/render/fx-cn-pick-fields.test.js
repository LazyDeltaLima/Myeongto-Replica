// test/render/fx-cn-pick-fields.test.js — what the effect coverage report listed for 유키 마코토 and 메커니스트 (2026-11-16,
// docs/rules/fx.md 「이펙트 전수 보고 판정 — 새 시즌 선발의 필드 (2026-11-16)」): the back switch's predicted side
// (SwitchableBackEffect `_predictFaceDirection`), RotationBySpeedModule, Unity's Particles/Standard Unlit colour and a
// BuffsKeyAnimatorTrigger driving the effect's Animator by its owner's buff.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FX = path.join(ROOT, 'public/assets/local/fx');
const RULE = 'docs/rules/fx.md 「이펙트 전수 보고 판정 — 새 시즌 선발의 필드 (2026-11-16)」';

const K = (v) => ({ m: 0, s: v });
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const MAT = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
function ps(mods, { speed = 2, n = 4, size = 0.2 } = {}) {
  return { dur: 5, loop: false, delay: K(0), speedMul: 1, space: 0, life: K(5), speed: K(speed), color: { m: 0, a: [1, 1, 1, 1] },
    size: K(size), rot: K(0), max: 50, gravity: K(0), rate: K(0), bursts: [{ t: 0, n: K(n), cycles: 1, interval: 0, p: 1 }],
    mods, render: { mode: 0, mat: 'm', mesh: null, lengthScale: 2, velScale: 0, align: 0, pivot: [0, 0, 0], order: 0 } };
}
async function make(nodes, extra = {}, materials = { m: MAT }) {
  const THREE = await import('../../public/vendor/three.module.js');
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = { name: 't', duration: 0, materials, clips: [], geoms: {}, lib: { texture: () => new THREE.Texture() }, nodes, ...extra };
  return new fxp.FxInstance(def, { quality: 'high' });
}

test('back switch: `_predictFaceDirection` reads the face vector, not the Back model drawn (SwitchableBackEffect._PredictFaceDirection)', async () => {
  const { backSide } = await import('../../public/js/render/fx/pause.js');
  // the attack has turned him toward an enemy above (face vector up), the Back model is not loaded yet (half way through the turn)
  const v = { dir: 'RIGHT', entryBack: false, face: { to: { x: 0.2, y: 0.98 }, ud: 'UP' } };
  assert.equal(backSide({ predict: 0 }, v), false, `plain: the Back model drawn — ${RULE}`);
  assert.equal(backSide({ predict: 1 }, v), true, `predicted: ParseDirection(faceTo, 0.25) is UP — ${RULE}`);
  // a side enemy: (0.7, 0.71) parses RIGHT with the side bonus 0.25
  const side = { dir: 'RIGHT', entryBack: true, face: { to: { x: 0.7, y: 0.71 }, ud: 'UP' } };
  assert.equal(backSide({ predict: 1 }, side), false, `predicted: a side direction is not back — ${RULE}`);
  assert.equal(backSide({ predict: 1, predictAll: 1, preserve: 1 }, side), true, `preserve: the Back model kept beside an enemy — ${RULE}`);
  // deployed facing UP: `_predictOnlyWhenDirectionNonBack` (on unless predictAll) keeps the animator's side
  const up = { dir: 'UP', entryBack: true, face: { to: { x: 0.7, y: 0.71 }, ud: 'UP' } };
  assert.equal(backSide({ predict: 1 }, up), true, `deploy UP: the animator's side, not the prediction — ${RULE}`);
  assert.equal(backSide({ predict: 1, predictAll: 1 }, up), false, `predictAll: predicted also when deployed UP — ${RULE}`);
});

test('RotationBySpeedModule turns the particles by its angular velocity (fx_extract.py `rotBySpeed`)', async () => {
  const rbs = { z: K(2), range: [0, 1] };
  const inst = await make([node('t', -1), node('p', 0, { ps: ps({ rotBySpeed: rbs }) })]);
  inst.update(0.05);
  const s = inst.systems[0], a = s.rot[2];
  inst.update(0.5);
  assert.ok(Math.abs(s.rot[2] - a - 1) < 1e-3, `2 rad/s for 0.5 s: ${s.rot[2] - a} — ${RULE}`);
  inst.dispose();
});

test('Particles/Standard Unlit: `_Color` × vertex × texture, no ×2', async () => {
  const mats = { m: { shader: 'Particles/Standard Unlit', tex: {}, floats: { _Mode: 2, _SrcBlend: 5, _DstBlend: 10 }, colors: { _Color: [1, 1, 1, 1] } } };
  const inst = await make([node('t', -1), node('p', 0, { ps: ps({}) })], {}, mats);
  const u = inst.systems[0].material.uniforms;
  assert.deepEqual([u.uTint.value.x, u.uTint.value.w], [1, 1], `Standard Unlit's tint is its _Color as it is — ${RULE}`);
  inst.dispose();
});

test('BuffsKeyAnimatorTrigger: the `end` trigger once the owner loses the buff (SetAnimatorTriggerByCondition)', async () => {
  const sms = [{ def: 0, node: 0, states: [{ name: 'a', clip: -1 }, { name: 'a_end', clip: -1 }], params: { end: ['trigger', false] },
    trans: [{ from: 0, to: 1, dur: 0, cond: [['end', 'if', 0]] }] }];
  const animBuff = [{ sm: 0, pairs: [['none', 'makoto_standin']], def: 'end' }];
  const inst = await make([node('t', -1)], { sms, animBuff });
  let held = true;
  inst.heldBuff = (k) => (k === 'makoto_standin' ? held : null);
  inst.update(0.05);
  inst.update(0.05);
  assert.equal(inst.sms[0].cur, 0, `buff held: trigger 'none', which the Animator lacks — ${RULE}`);
  held = false;
  inst.update(0.05);
  inst.update(0.05);
  assert.equal(inst.sms[0].cur, 1, `buff gone: 'end' — ${RULE}`);
  inst.dispose();
  const { viewHoldsBuff } = await import('../../public/js/render/fx/pause.js');
  assert.equal(viewHoldsBuff({ info: { form: 'doll' } }, 'makoto_standin'), true, `the <替身> form holds makoto_standin — ${RULE}`);
  assert.equal(viewHoldsBuff({ info: { form: '' } }, 'makoto_standin'), false);
  assert.equal(viewHoldsBuff({ info: {} }, 'other'), null);
});

test('extract: 유키 마코토\'s fields as read from the CN client (when extracted)', (t) => {
  const f = (n) => path.join(FX, 'makoto', `${n}.json`);
  const files = ['makoto_skill_02_buff_01', 'makoto_skill_02_start_01', 'makoto_skill_03_p1_start_A_01', 'makoto_skill_01_start_01'].map(f);
  if (!files.every(existsSync)) { t.skip('no local effect extract'); return; }
  const [buff, s2, s3, s1] = files.map((x) => JSON.parse(readFileSync(x, 'utf8')));
  assert.ok(buff.nodes.some((n) => n.ps?.mods?.rotBySpeed), `S2 buff glass: rotation by speed — ${RULE}`);
  assert.deepEqual(s2.animBuff, [{ sm: 0, pairs: [['none', 'makoto_standin']], def: 'end' }], `S2 attack: its trigger source — ${RULE}`);
  assert.deepEqual([s3.back.predict, s3.back.predictAll, s3.back.preserve], [1, 1, 1], `S3 cast: predicted always, back kept — ${RULE}`);
  assert.deepEqual([s1.back.predict, s1.back.predictAll, s1.back.preserve], [1, undefined, undefined], `S1 cast: predicted unless deployed UP — ${RULE}`);
});
