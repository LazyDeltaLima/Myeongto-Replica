// The barrier (屏障 / 护盾) on an ally's HP bar, as the client (maintainer request 2026-10-10 「배리어를 HP 바처럼」): client
// UIHudCharHpSlider.UpdatePlugin sets the slider to (hp + s) / (maxHp + s) with s = shieldUIController.shieldToShow and the
// fill's split (UIHpFillImage.splitValue) to s / (hp + s); the fill material ui_battle_ally_hp_bar (shader Torappu/UI/Hp)
// draws that end of the fill in _Color2 #bcdbdf, opaque. The sim lists the amount in b.snap `shield` (server/sim/local-hud.js).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { hudLists } from '../../server/sim/local-hud.js';
import { normalizeSnapshot } from '../../public/js/render/interp.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { UF } from '../../shared/constants.js';

let fake, UnitView, HB;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
  HB = await import('../../public/js/render/hud-bars.js');
});
after(() => fake.restore());

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

describe('shieldedBar: the client slider math', () => {
  test('(hp + s) / (maxHp + s), split s / (hp + s); none without a barrier', () => {
    const r = HB.shieldedBar(1000, 2000, 1000, 6000);
    assert.ok(near(r.hp, 7000 / 8000) && near(r.split, 6000 / 7000) && near(r.ghost, r.hp));
    assert.deepEqual(HB.shieldedBar(500, 1000, 800, 0), { hp: 0.5, ghost: 0.8, split: 0 });
    const z = HB.shieldedBar(0, 1000, 0, 300);
    assert.ok(near(z.hp, 300 / 1300) && z.split === 1, 'all barrier when the HP is gone (烛煌 downed)');
  });
  test('AllyBars draws the barrier as the opaque #bcdbdf end of the HP fill', () => {
    const b = new HB.AllyBars(fake.P, new fake.P.Container());
    b.update(1000, 500, 1, { hp: 0.8, ghost: 0.8, split: 0.25 });
    assert.ok(b.shield.visible);
    assert.equal(b.shield.tint, 0xbcdbdf); assert.equal(b.shield.alpha, 1);
    assert.ok(near(b.shield.width, 125 * 0.8 * 0.25));
    assert.ok(near(b.shield.position.x + b.shield.width, b.hp.position.x + b.hp.width), 'at the fill\'s right end');
    b.update(1000, 500, 1, { hp: 0.8, ghost: 0.8 });
    assert.ok(!b.shield.visible);
  });
});

describe('b.snap `shield` → the view', () => {
  test('the sim lists allies\' barrier HP (not enemies\', not hit-count barriers); interp hands it to the sample', () => {
    const units = [
      { id: 1, alive: true, deployed: true, side: 'ally', buffs: [{ shield: 6000 }, { shield: 0 }] },
      { id: 2, alive: true, deployed: true, side: 'ally', buffs: [{ shieldHits: 2 }] },
      { id: 3, alive: true, deployed: true, side: 'enemy', buffs: [{ shield: 500 }] },
    ];
    assert.deepEqual(hudLists(units).shield, [[1, 6000]]);
    const n = normalizeSnapshot({ t: 1, units: [[1, 2, 3, 10, 10, 0, 0, 0, 0], [2, 2, 3, 10, 10, 0, 0, 0, 0]], shield: [[1, 6000], [9, 5], 'x'] });
    assert.equal(n.units.get(1).shield, 6000);
    assert.equal(n.units.get(2).shield, undefined);
  });

  test('a view with a barrier: the official bar grows by it and the presence strip stays off', () => {
    const VP = { width: 1920, height: 1080 };
    const ctx = fakeViewCtx(fake.P, { assets: null, cam: () => presetCamera('prep', VP), viewport: () => VP });
    const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'op', defId: 'char_x', tier: 3, x: 5, y: 12, maxHp: 2000 }, {});
    const s = { x: 5, y: 12, hp: 1000, maxHp: 2000, sp: 0, spMax: 0, flags: UF.SHIELD, anim: 0, vx: 0, vy: 0, el: null, shield: 6000 };
    v.sync(s, 0); v.update(1 / 60, presetCamera('prep', VP), 0);
    assert.ok(v.lpBars, 'official bars');
    assert.ok(near(v.lpBars.hp.width, 125 * 7000 / 8000, 1e-6));
    assert.ok(v.lpBars.shield.visible && near(v.lpBars.shield.width, v.lpBars.hp.width * 6000 / 7000, 1e-6));
    assert.ok(!v.shieldBar.visible, 'no strip over it');
  });

  test('real battle: a barrier buff on an operator shows in the snapshot (amount and the SHIELD flag)', () => {
    const h = makeBattle({ seed: 3, timeLimit: 40, units: [{ chessId: 'chess_char_5_01_a', row: 9, col: 5, uid: 1, skillIndex: 0 }],
      enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 6, interval: 2 }] });
    const u = h.battle.allyUnits.find((x) => x.kind === 'op');
    h.run(1);
    h.battle.addBuff(u, { key: 'test:barrier', shield: 800, duration: 30 });
    const s0 = h.battle.snapshot();
    assert.deepEqual(s0.shield, [[u.id, 800]]);
    assert.ok(s0.units.find((x) => x[0] === u.id)[7] & UF.SHIELD);
  });
});
