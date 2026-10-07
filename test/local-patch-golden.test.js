// local patch (docs/LOCAL-PATCH.md 「정예 기물 금빛」): the prep elite glow (render/fxgolden.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { syncGoldenFx, GOLDEN_FX } from '../public/js/render/fxgolden.js';

function fakeFx(ready = true) {
  const calls = [];
  return {
    calls,
    statusReady: (b, n) => ready && b === GOLDEN_FX[0] && n === GOLDEN_FX[1],
    statusOn(v, b, n, key, frac, hold, under) { (v._fxStatusOn ||= new Set()).add(key); calls.push(['on', v.id, key, under]); },
    statusOff(v, key) { v._fxStatusOn?.delete(key); calls.push(['off', v.id, key]); },
  };
}
const view = (o) => ({ id: o.id, flags: 0, prep: true, golden: true, isEnemy: false, isToken: false, alive: true, remove: false, destroyed: false, ...o });

test('the official golden effect id (battle_misc_table effectConfig.goldenEffectId)', () => {
  assert.deepEqual([...GOLDEN_FX], ['trap', 'trap_acgarm_buff_loop_01']);
});

test('prep: only a live elite ally operator glows, split behind the model', () => {
  const views = new Map([
    ['a', view({ id: 'a' })],
    ['b', view({ id: 'b', golden: false })],
    ['c', view({ id: 'c', isToken: true })],
    ['d', view({ id: 'd', isEnemy: true })],
  ]);
  const fx = fakeFx();
  syncGoldenFx(views, fx, true);
  assert.deepEqual(fx.calls, [['on', 'a', 'golden', true]]);
  syncGoldenFx(views, fx, true);
  assert.equal(fx.calls.length, 1, 'started once');
});

test('battle (not prep) or a removed view: the glow ends; nothing before the prefab is listed', () => {
  const v = view({ id: 'a' });
  const views = new Map([['a', v]]);
  const fx = fakeFx();
  syncGoldenFx(views, fx, true);
  syncGoldenFx(views, fx, false);
  assert.deepEqual(fx.calls.at(-1), ['off', 'a', 'golden']);
  const none = fakeFx(false);
  syncGoldenFx(new Map([['x', view({ id: 'x' })]]), none, true);
  assert.equal(none.calls.length, 0);
});
