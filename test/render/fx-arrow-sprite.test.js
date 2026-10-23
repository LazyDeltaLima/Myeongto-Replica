// test/render/fx-arrow-sprite.test.js — the client's generic arrow projectile_arrow (流星's normal attack) drawn as its
// sprite (render/fx/projectiles.js ARROW_SPEC): the Body's projectile_arrow_new at scale 0.4, on its PARACURVE arc, turned
// to its flight, without the tracer's glow, trail or muzzle flash; the tracer stays while the local sprite is missing.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, FX;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
});
after(() => fake.restore());

const DT = 1 / 120;
const cam = presetCamera('normal', { width: 1600, height: 900 });
const SHOTST = { shot: { base: { key: 'projectile_arrow', mount: 'MUZZLE', height: 0.3, life: 5, move: 'PARACURVE', speed: 6 },
  skills: [{ key: 'projectile_shotst_s1', move: 'TRACE_TARGET_WITH_SPEED', speed: 8 }] } };

function unit(id, x, y, o = {}) {
  return { id, x, y, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, isEnemy: false, maxHp: 3000, info: { defId: 'char_126_shotst', skillIndex: 0 }, onHit() {}, ...o };
}

function makeFx(localUrl) {
  const P = fake.P;
  const ctx = fakeViewCtx(P);
  return new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, heightAt: () => 0, settings: { quality: 'high', damageNumbers: true },
    timeScale: () => 1, loadLevel: () => 0, subProfOf: () => null, view: () => null, lookupDef: (info) => (info?.defId === 'char_126_shotst' ? SHOTST : null),
    assets: { localUrl }, screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120,
  });
}

test("流星's normal attack flies the official arrow sprite on its parabola, no glow", () => {
  const fx = makeFx((g, n) => (g === 'battle/common' && n === 'projectile_arrow_new' ? '/assets/local/battle/common/projectile_arrow_new.png' : null));
  const parts0 = fx.parts.length;
  const src = unit(1, 3, 10), foe = unit(9, 6, 10, { isEnemy: true });
  fx.attack(src, foe, 'arrow');
  const pr = fx.projs[0];
  assert.equal(pr.spec.look, 'sprite');
  assert.equal(pr.arc, 0.3, 'ParacurveMovement height');
  assert.ok(Math.abs(pr.dur - 3 / 6) < 0.05, `flight ${pr.dur} at the shot's speed 6`);
  assert.equal(fx.parts.length, parts0, 'no muzzle flash');
  fx.update(pr.dur / 2);
  assert.ok(pr.body.visible && pr.body.alpha === 1, 'the arrow is drawn');
  assert.ok(!pr.trail.visible && !pr.halo.visible && !pr.core.visible, 'no tracer, halo or glowing head');
  const p = fx._shotPoint(pr, 0.5, cam, {});
  assert.ok(Math.hypot(pr.body.x - p.x, pr.body.y - p.y) < 0.5, 'at its point on the arc');
  assert.ok(Math.abs(pr.body.scale.x - p.s * 0.004) < p.s * 0.0005, 'scale 0.4 of 100 px per tile');
  assert.ok(Math.abs(Math.cos(pr.body.rotation)) > 0.9, 'turned along its flight (left to right)');
  for (let t = 0; t < 1 && fx.projs.includes(pr); t += DT) fx.update(DT);
  assert.ok(!fx.projs.includes(pr) && !pr.body.visible, 'gone after it reached');
});

test('without the local sprite, or in a skill with its own shot, the tracer stays', () => {
  const none = makeFx(() => null);
  none.attack(unit(1, 3, 10), unit(9, 6, 10, { isEnemy: true }), 'arrow');
  assert.equal(none.projs[0].spec.look, 'tracer');
  const fx = makeFx(() => '/assets/local/battle/common/projectile_arrow_new.png');
  fx.attack(unit(1, 3, 10, { _fxSkillOn: true }), unit(9, 6, 10, { isEnemy: true }), 'arrow');
  assert.equal(fx.projs[0].spec.look, 'tracer');
  fx.attack(unit(2, 3, 10, { info: { defId: 'char_x' } }), unit(9, 6, 10, { isEnemy: true }), 'arrow');
  assert.equal(fx.projs[1].spec.look, 'tracer');
});
