// Bullets of an ammo skill come back in two official ways (AmmoSkillCountModifier): `_modifyMaxCount` raises the max with them,
// `_recoverEventCount` gives back fired bullets (AbilityEventCounter.RecoverEventCount): at most what was fired and, unless
// `_recoverSkipLimitCheck`, at most the activation's full count in all (server/sim/skills.js addAmmo / recoverAmmo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkillRuntime } from '../server/sim/skills.js';

const ammo = (left, max, recovered = 0) => Object.assign(Object.create(SkillRuntime.prototype), { active: true, kind: 'ammo', ammoLeft: left, ammoMax: max, ammoRecovered: recovered });

test('recoverAmmo: never above the max, which stays', () => {
  const s = ammo(8, 10);
  assert.equal(s.recoverAmmo(5), 2);
  assert.deepEqual([s.ammoLeft, s.ammoMax, s.ammoRecovered], [10, 10, 2]);
});

test('recoverAmmo: at most the full count per activation, unless the limit is skipped', () => {
  const s = ammo(0, 10, 9);
  assert.equal(s.recoverAmmo(5), 1, 'one left of the limit');
  assert.equal(s.ammoLeft, 1);
  const free = ammo(0, 10, 10);
  assert.equal(free.recoverAmmo(5, true), 5);
  assert.deepEqual([free.ammoLeft, free.ammoRecovered], [5, 10], 'a skipped check is not counted');
});

test('recoverAmmo: nothing on a skill not running, or a bad count', () => {
  const s = ammo(1, 10);
  s.active = false;
  assert.equal(s.recoverAmmo(3), 0);
  s.active = true;
  assert.equal(s.recoverAmmo(NaN), 0);
  assert.equal(s.ammoLeft, 1);
});

test('addAmmo at the start raises the max with the bullets', () => {
  const s = ammo(10, 10);
  s.addAmmo(3);
  assert.deepEqual([s.ammoLeft, s.ammoMax], [13, 13]);
});
