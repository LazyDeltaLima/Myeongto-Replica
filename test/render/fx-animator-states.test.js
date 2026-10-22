// test/render/fx-animator-states.test.js — effect bundle J (2026-10-22, docs/rules/fx.md 「애니메이터 상태」): an effect's
// Animator with more states runs as Mecanim does (fx_extract.py `sms` → fxplayer.js stepSm / applySm): exit-time
// transitions, conditions on its parameters, the blend over a transition's duration, the finish's triggers (`animFin`),
// code setting a parameter, and a buff progress source (`animSrc`).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const k = (v) => [[0, 0, 0, 0, v]];   // a constant
const xAt = (v, len = 1, loop = false, name = `x${v}`) => ({ name, len, loop, sm: 0, tracks: [{ node: 1, prop: 'pos', type: 4, curves: [k(v), k(0), k(0)] }] });
const st = (name, clip) => ({ name, clip });

async function make(clips, sm, extra = {}) {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = { name: 'a', duration: 5, nodes: [node('root', -1), node('m', 0)], geoms: {}, lib: { texture: () => null }, materials: {},
    clips, sms: [{ node: 0, def: 0, params: {}, trans: [], ...sm }], ...extra };
  return new fxp.FxInstance(def, { quality: 'high' });
}
const x = (inst) => inst.nodes[1].position.x;
const run = (inst, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) inst.update(dt); };

test('the default state plays first; an exit-time transition blends into the next state over its duration', async () => {
  // 远牙 S3's fartth_skill_03_buff_02: a 0.167 s start, exit time 0, 0.25 s into the 15 s loop (it played the start only)
  const inst = await make([xAt(1, 0.167), xAt(5, 15, true)], { states: [st('start', 0), st('loop', 1)], trans: [{ from: 0, to: 1, dur: 0.25, exit: 0 }] });
  run(inst, 1 / 60);
  assert.equal(x(inst), 1, 'starts in the default state; the transition starts on that frame');
  assert.ok(inst.sms[0].tr);
  run(inst, 0.125);
  assert.ok(Math.abs(x(inst) - 3) < 0.3, `halfway (${x(inst)})`);
  run(inst, 0.2);
  assert.equal(x(inst), 5);
  assert.equal(inst.sms[0].cur, 1);
  run(inst, 20);
  assert.equal(inst.done, false, 'a looping state keeps the effect alive');
});

test('the finish sets OnFinish (TriggerAnimatorWhenFinish): the end state plays out, only with a recycle delay', async () => {
  const sm = { states: [st('idle', 0), st('end', 1)], params: { OnFinish: ['trigger', false] }, trans: [{ from: 0, to: 1, dur: 0, cond: [['OnFinish', 'if', 0]] }] };
  const clips = [xAt(1, 2, true), xAt(7, 0.5)];
  const inst = await make(clips, sm, { finish: 0.5, animFin: [{ sm: 0, p: 'OnFinish', v: true, rec: true }] });
  run(inst, 1);
  assert.equal(x(inst), 1);
  inst.stop();
  run(inst, 1 / 60);
  assert.equal(x(inst), 7, 'the end clip');
  assert.equal(inst.sms[0].p.OnFinish, false, 'the trigger is used up');
  assert.equal(inst.done, false, 'its end clip still plays');
  run(inst, 0.6);
  assert.equal(inst.done, true);
  const none = await make(clips, sm, { animFin: [{ sm: 0, p: 'OnFinish', v: true, rec: true }] });
  run(none, 0.5);
  none.stop();
  run(none, 1 / 60);
  assert.equal(none.sms[0].cur, 0, 'no `finish`: no trigger (delayToRecycle 0)');
});

test('a looping state\'s exit time below 1 waits for that point of the next loop (流明 S1 range)', async () => {
  const sm = { states: [st('idle', 0), st('end', 1)], params: { OnFinish: ['trigger', false] },
    trans: [{ from: 0, to: 1, dur: 0, exit: 0.75, cond: [['OnFinish', 'if', 0]] }] };
  const inst = await make([xAt(1, 1, true), xAt(2, 0.333)], sm, { animFin: [{ sm: 0, p: 'OnFinish', v: true }] });
  run(inst, 0.8);   // past 0.75 of the first loop
  inst.stop();
  run(inst, 0.5);
  assert.equal(inst.sms[0].cur, 0, 'not before 1.75');
  run(inst, 0.5);
  assert.equal(inst.sms[0].cur, 1);
});

test('SwitchAnimatorStateWhenFinish plays its state at once; an int parameter from code picks a transition', async () => {
  const fly = await make([xAt(1, 0.333, true), xAt(4, 1)], { states: [st('fly', 0), st('flyEnd', 1)] },
    { finish: 1, animFin: [{ sm: 0, play: 1, rec: true }] });
  run(fly, 0.2);
  fly.stop();
  run(fly, 1 / 60);
  assert.equal(x(fly), 4);
  // 荒芜拉普兰德 S3's drone trail: OnEnd = 1 (Whitw2Skill3FunnelRangedAttack.OnDetached)
  const wolf = await make([xAt(1, 0.333), xAt(3, 0.367)], { states: [st('s3_idle', 0), st('s3_end01', 1)], params: { OnEnd: ['int', 0] },
    trans: [{ from: 0, to: 1, dur: 0, cond: [['OnEnd', 'eq', 1]] }] });
  run(wolf, 1);
  assert.equal(x(wolf), 1);
  wolf.setParam('OnEnd', 1);
  run(wolf, 1 / 60);
  assert.equal(x(wolf), 3);
});

test('a buff progress source drives the level (纯烬艾雅法拉 S2 range): full → 2, under half → 1, gone → 0', async () => {
  const lv = (n) => [[0, 0, 0, 0, n]];
  const trans = [];
  for (const [a, b] of [[0, 2], [0, 1], [1, 0], [1, 2], [2, 1], [2, 0]]) trans.push({ from: a, to: b, dur: 0.25, cond: [['Level', 'eq', b]] });
  const inst = await make([0, 1, 2].map((n) => ({ ...xAt(n, 1, true), tracks: [{ node: 1, prop: 'pos', type: 4, curves: [lv(n), k(0), k(0)] }] })),
    { states: [st('l0', 0), st('l1', 1), st('l2', 2)], params: { Level: ['int', 0] }, trans },
    { animSrc: [{ sm: 0, p: 'Level', int: true, buff: 'agoat2_s_2[shield]', max: 'dynamic', prog: 'value', def: 0, fin: 0,
      curve: [[0, 0, 2.97, null], [0.01, 1, 2.97, null], [0.5, 2, 1.6, null], [1, 2, 0, 0]] }] });
  run(inst, 0.5);
  assert.equal(inst.sms[0].cur, 2, 'the buff is taken as full');
  inst.setBuffProgress('agoat2_s_2[shield]', 0.4);
  run(inst, 0.5);
  assert.equal(inst.sms[0].cur, 1);
  inst.setBuffProgress('agoat2_s_2[shield]', 0);
  run(inst, 0.5);
  assert.equal(inst.sms[0].cur, 0);
  assert.equal(x(inst), 0);
});
