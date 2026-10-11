// 琳琅诗怀雅's skill purse under her HP bar (upstream 0.2.4, PR #450, adapted to the official bars): the sim lists
// [id, balance, cap] in b.snap `coins` (server/sim/snapshot.js coinView — zero is a balance, the cap is the selected
// skill's `sp`), render/interp.js hands it to the sample, and render/units.js draws a hud-bars.js CoinPurse row (coin
// icon + 「balance/cap」) under the official bars. Display only: the golden digests never read it (tools/golden.mjs).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { SnapshotBuffer, normalizeSnapshot } from '../../public/js/render/interp.js';
import { coinView } from '../../server/sim/snapshot.js';
import { makeBattle } from '../helpers/battleHarness.js';

let fake, UnitView, HB;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
  HB = await import('../../public/js/render/hud-bars.js');
});
after(() => fake.restore());

const tuple = (id) => [id, 5, 10, 1000, 1000, 0, 0, 0, 0];

describe('sim: b.snap `coins`', () => {
  test('each skill: 0/cap before her first coin, the balance after, the selected skill\'s cap (2 / 3 / 10); gone when she leaves', () => {
    const caps = [];
    for (const skillIndex of [0, 1, 2]) {
      const h = makeBattle({ seed: 3, timeLimit: 60, units: [{ chessId: 'chess_char_3_04_a', row: 9, col: 4, uid: 1, skillIndex }],
        enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 6, interval: 2 }] });
      const u = h.battle.allyUnits.find((x) => x.kind === 'op');
      const cap = u.skill.bb.sp;
      caps.push(cap);
      h.run(0.05);
      assert.deepEqual(h.battle.snapshot().coins, [[u.id, u.mem.coins ?? 0, cap]]);
      u.mem.coins = 0;
      assert.deepEqual(h.battle.snapshot().coins, [[u.id, 0, cap]], 'zero is a balance');
      u.mem.coins = cap;
      assert.deepEqual(h.battle.snapshot().coins, [[u.id, cap, cap]]);
      h.battle.retreat(u, { reason: 'retreat' });
      assert.equal(h.battle.snapshot().coins, undefined, 'no purse once she left');
    }
    assert.deepEqual(caps, [2, 3, 10], '「携带此技能时金币上限为N」');
  });

  test('coinView: allies with a purse only', () => {
    const swire = (o = {}) => ({ side: 'ally', skill: { id: 'skchr_swire2_3', bb: { sp: 10 } }, mem: {}, ...o });
    assert.deepEqual(coinView(swire()), [0, 10], 'unset = 0');
    assert.deepEqual(coinView(swire({ mem: { coins: 4 } })), [4, 10]);
    assert.deepEqual(coinView(swire({ mem: { coins: 12 } })), [10, 10], 'never over the cap');
    assert.equal(coinView(swire({ mem: { coins: -1 } })), null);
    assert.equal(coinView(swire({ side: 'enemy' })), null);
    assert.equal(coinView({ side: 'ally', skill: { id: 'skchr_texas2_1', bb: { sp: 10 } }, mem: {} }), null, 'another operator');
    assert.equal(coinView(swire({ skill: { id: 'skchr_swire2_3', bb: {} } })), null, 'no cap');
  });
});

describe('interp: `coins` rides on the sample', () => {
  test('zero kept, malformed entries dropped, cleared when the entry disappears', () => {
    const n = normalizeSnapshot({ t: 0, units: [tuple(1), tuple(2), tuple(3)], coins: [[1, 0, 10], [2, 3.5, 10], [3, -1, 10], [9, 1, 10], 'x'] });
    assert.deepEqual(n.units.get(1).coins, [0, 10]);
    assert.equal(n.units.get(2).coins, undefined);
    assert.equal(n.units.get(3).coins, undefined);
    const b = new SnapshotBuffer();
    b.push({ t: 0, units: [tuple(1)], coins: [[1, 3, 10]] }, 0);
    b.push({ t: 1, units: [tuple(1)] }, 0.5);
    assert.deepEqual(b.sample(0).get(1).coins, [3, 10]);
    assert.equal(b.sample(1).get(1).coins, null);
  });
});

describe('the view: a purse row under the official bars', () => {
  const VP = { width: 1920, height: 1080 };
  const cam = () => presetCamera('normal', VP);
  const view = () => new UnitView(fakeViewCtx(fake.P, { assets: null, cam, viewport: () => VP }),
    { id: 1, side: 'ally', kind: 'op', defId: 'char_1033_swire2', tier: 3, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT' }, {});
  const sample = (o = {}) => ({ x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0, vy: 0, el: null, ...o });

  test('「balance/cap」 left-aligned under the bars; hidden when the entry disappears', () => {
    const v = view();
    v.sync(sample({ coins: [0, 10] }), 0); v.update(1 / 60, cam(), 0);
    const p = v.coinPurse;
    assert.ok(p && p.root.visible);
    assert.equal(p.text.text, '0/10');
    assert.equal(p.icon.position.x, v.lpBars.box.x0, 'left edge of the bars');
    assert.ok(p.icon.position.y > v.lpBars.box.top, 'under the bars');
    v.sync(sample({ coins: [7, 10] }), 1); v.update(1 / 60, cam(), 1);
    assert.equal(p.text.text, '7/10');
    v.sync(sample(), 2); v.update(1 / 60, cam(), 2);
    assert.equal(p.root.visible, false, 'no stale readout');
  });

  test('an operator without a purse never makes the row', () => {
    const v = view();
    v.sync(sample(), 0); v.update(1 / 60, cam(), 0);
    assert.equal(v.coinPurse, null);
  });

  test('CoinPurse scales with the HUD unit and returns its bottom', () => {
    const c = new HB.CoinPurse(fake.P, new fake.P.Container(), fake.P.Texture.WHITE);
    const C = HB.COIN_PURSE;
    const bottom = c.update([2, 3], 100, 500, 0.5);
    assert.equal(c.text.text, '2/3');
    assert.equal(c.icon.width, C.icon * 0.5);
    assert.equal(bottom, 500 + (C.y + C.icon) * 0.5);
    assert.equal(c.text.position.x, 100 + (C.icon + C.gap) * 0.5);
  });
});
