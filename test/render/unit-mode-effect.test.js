// test/render/unit-mode-effect.test.js — SpecifyUnitModeEffect (2026-11-16, docs/rules/fx.md 「유넥티스 쓰러짐 이펙트 —
// 모드 조건」): an effect whose root carries `unitMode` plays only while its owner is in that unit mode, and a dead effect reads
// the mode its unit died in — the sim ends a dying unit's skill before it removes it, so the render keeps the mode of that
// skill's end (유넥티스's zumama_skill_03_end: only when she falls in S3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { unitModeFinishes } from '../../public/js/render/fx/pause.js';

test('unitModeFinishes: another mode finishes it, its own mode or an unknown one plays it, the pause variant is left alone', () => {
  const def = { unitMode: { i: 2 } };
  assert.equal(unitModeFinishes(def, 0), true, 'mode 0 (Default)');
  assert.equal(unitModeFinishes(def, 2), false, 'mode 2 (S3)');
  assert.equal(unitModeFinishes(def, null), false, 'mode not known');
  assert.equal(unitModeFinishes({}, 0), false, 'no SpecifyUnitModeEffect');
  assert.equal(unitModeFinishes({ unitMode: { i: 2, pause: true } }, 0), false, 'the pause variant is not played');
});

const settle = () => new Promise((r) => setTimeout(r, 10));

test('fxgame.js: 유넥티스\'s dead effect is spawned with the mode she fell in — S3 at the end of a skill cut by the death, else 0', async () => {
  const files = {
    '/assets/local/fx/index.json': { bundles: { zumama: ['zumama_skill_03_end'] } },
    '/assets/local/fx/modes.json': { char_416_zumama: { modes: ['Default', 'S2', 'S3'], skillMode: [null, 1, null], dead: 'zumama_skill_03_end' } },
  };
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await settle();
    const v = { id: 1, x: 1, y: 1, alive: true, info: { id: 1, side: 'ally', kind: 'op', defId: 'char_416_zumama', spine: 'char_416_zumama', skillIndex: 2 } };
    const views = new Map([[1, v]]);
    const cam = { liftFor: () => 0, scaleAt: () => 64, dist: 10 };
    const deaths = () => seen.splice(0).filter((p) => p.kind === 'spawn' && p.tag === 'dead');
    layer.onEvent(['deploy', 1], views);
    layer.update(0.1, cam, { width: 10, height: 10 });
    // killed during S3: the sim sends the skill's end, then the removal, in the same moment
    layer.onEvent(['skill', 1, 1], views);
    layer.update(0.1, cam, { width: 10, height: 10 });
    seen.length = 0;
    layer.onEvent(['skill', 1, 0], views);
    layer.onEvent(['die', 1, 'killed'], views);
    let d = deaths();
    assert.equal(d.length, 1, 'its dead effect is spawned');
    assert.deepEqual(d[0].names, ['zumama_skill_03_end']);
    assert.equal(d[0].mode, 2, 'S3 is mode 2 of her prefab\'s _modes: the mode of the skill her death cut');
    // killed later, out of the skill: Default (the prefab finishes at once — fx/pause.js unitModeFinishes)
    layer.onEvent(['deploy', 1], views);
    layer.onEvent(['skill', 1, 1], views);
    layer.update(0.1, cam, { width: 10, height: 10 });
    layer.onEvent(['skill', 1, 0], views);
    layer.update(0.5, cam, { width: 10, height: 10 });
    seen.length = 0;
    layer.onEvent(['die', 1, 'killed'], views);
    d = deaths();
    assert.equal(d.length, 1);
    assert.equal(d[0].mode, 0, 'a skill that ended earlier does not count');
  } finally { globalThis.fetch = fetch0; }
});
