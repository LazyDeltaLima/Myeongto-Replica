// test/render/oxi-wave-fx.test.js — 탈룰라 S3 日冕重烈's 簇火 (sim fx 'oxiWave', fxgame.js pickFx) on the real effect layer (dry).
// #13: from her second cast in a boss round the skill's effect was gone. A long, crowded battle raises the view's adaptive
// load level to 3 (render/app.js adaptLoad) and keeps it there; level 3 leaves out the normal attacks' official effects only
// (docs/rules/render.md 「적응 부하 단계」), but the 簇火 trail was skipped at level 3 too — the first cast, early in the
// battle, showed it and a cast after the load rose did not.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';
import { fxEvent } from '../helpers/fxEvent.js';

const OXI = 'char_4247_oxi';
const TRAIL = 'oxi_skill_03_trail_01';
const count = (list, n) => list.filter((x) => x.split('@')[0] === n).length;

for (const lod of [0, 2, 3]) {
  test(`탈룰라 S3: every lane of a wave flies ${TRAIL}, at load level ${lod} too`, { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
    const views = new Map([[1, unit(1, 'ally', OXI, 5, 2)]]);
    layer.onEvent(['skill', 1, 1], views);
    take();
    for (const w of [1, 2]) {
      layer.onEvent(fxEvent('oxiWave', { x: 5, y: 10, id: 1, w, h: 1, a: 8, z: 12, s: 0, to: 15, v: 2.3 }), views);
      assert.equal(count(take(), TRAIL), 5, `wave ${w}: one trail a lane`);
      layer.update(2);
    }
    layer.onEvent(fxEvent('blast', { x: 5.5, y: 9, r: 1.5, id: 1, element: 'burn', w: 2, lane: 9 }), views);
    assert.equal(count(take(), 'oxi_skill_03_hit_01'), 1, 'its explosion');
  }, { load: () => lod }));
}

test(`탈룰라 S3: a fire drawn from the field's edge (the sim's \`d\`) appears only when it gets there; one that explodes before never appears`, { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', OXI, 5, 2)]]);
  layer.onEvent(['skill', 1, 1], views);
  take();
  layer.onEvent(fxEvent('oxiWave', { x: 5, y: 2, id: 1, w: 1, h: 0, a: 3, z: 7, s: 1.5, to: 5.5, v: 2.3, d: 0.65 }), views);
  assert.equal(count(take(), TRAIL), 0, 'not yet over the field (op-oxi.js fieldBox, docs/rules/diy.md 「그리는 簇火는 필드 안만」)');
  layer.onEvent(fxEvent('blast', { x: 4, y: 1, r: 1.5, id: 1, element: 'burn', w: 1, lane: 4 }), views);
  assert.equal(count(take(), 'oxi_skill_03_hit_01'), 1, 'its explosion still shows');
  layer.update(0.7);
  assert.equal(count(take(), TRAIL), 4, 'the other four lanes enter; the exploded one stays gone');
}));
