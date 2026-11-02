// test/content/kit-helpers-diy.test.js — the helpers the 自选 kits ported from upstream import: kits/shared/bounds.js (the
// loop guards that stand in for upstream's plugin bounds: official numbers pass unchanged) and Battle.allyTargetsInRadius
// (the radius form of allyTargetsInKeys). The summon deck (kits/shared/summoner.js) is covered by its kits' own tests.
// Run: node --test test/content/kit-helpers-diy.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { TICK } from '../../server/sim/constants.js';
import { stepOf, STEP_PER_TICK, burstLimit, bbCap, boundedCount, textCount, COUNT_CAP } from '../../server/sim/content/kits/shared/bounds.js';

test('bounds: official steps, counts and text counts pass unchanged; broken ones are guarded', () => {
  assert.equal(stepOf('interval', 0.5, 1), 0.5);
  assert.equal(stepOf('interval', 0.03, 1), 0.03, 'an official sub-tick interval stays');
  assert.equal(stepOf('interval', 0, 1), 0, '0 still means off');
  assert.equal(stepOf('interval', 1e-6, 1), TICK, 'a step under a tenth of a tick is one tick');
  assert.equal(stepOf('interval', undefined, 0.5), 0.5);
  assert.equal(stepOf('interval', NaN, NaN), TICK);
  assert.equal(STEP_PER_TICK, 8);
  assert.equal(burstLimit(8), 80);
  assert.equal(burstLimit(2), COUNT_CAP);
  assert.equal(burstLimit('x'), COUNT_CAP);
  assert.equal(bbCap('times'), COUNT_CAP);
  assert.equal(boundedCount(2.5, bbCap('cnt'), 3), 2.5, 'not floored');
  assert.equal(boundedCount(1e9, 64, 3), 64);
  assert.equal(boundedCount(-1, 64, 3), 0);
  assert.equal(boundedCount('x', 64, 3), 3);
  assert.equal(textCount('每次攻击时攻击3次', /攻击(\d+)次/, 1, 'attack-times'), 3);
  assert.equal(textCount('三连击', /(\d+|[一二两三四五六七八九十])连击/, 1, 'combo'), 3);
  assert.equal(textCount('无', /攻击(\d+)次/, 2, 'attack-times'), 2, 'no capture: the fallback');
  assert.equal(textCount('无', /攻击(\d+)次/, NaN, 'attack-times'), 0);
  assert.equal(textCount(`攻击${'9'.repeat(400)}次`, /攻击(\d+)次/, 1, 'attack-times'), COUNT_CAP, 'a run of nines is the cap');
  const g = /攻击(\d+)次/g;
  g.lastIndex = 5;
  assert.equal(textCount('攻击4次', g, 1), 4, 'a global pattern is read from the start');
  assert.equal(g.lastIndex, 5, "the caller's pattern is untouched");
});

const CHESS = {
  test_guard_a: chessRec({ id: 'test_guard_a', profession: 'WARRIOR', stats: { maxHp: 1e7, atk: 300, def: 0, res: 0 } }),
};

test('allyTargetsInRadius: the registered ally targets within the radius, alive and on the field, never the attacker', () => {
  const h = makeBattle({
    defs: { chess: CHESS }, timeLimit: 600, autoFinish: false, seed: 3,
    units: [
      { uid: 1, chessId: 'test_guard_a', row: 10, col: 4 },
      { uid: 2, chessId: 'test_guard_a', row: 10, col: 6 },
      { uid: 3, chessId: 'test_guard_a', row: 10, col: 9 },
    ],
  });
  h.step();
  const [a, near, far] = [h.unit(1), h.unit(2), h.unit(3)];
  assert.deepEqual(h.b.allyTargetsInRadius(a.x, a.y, 3, a).map((u) => u.id), [], 'none registered');
  h.b.setAllyTarget(near, true);
  h.b.setAllyTarget(far, true);
  assert.deepEqual(h.b.allyTargetsInRadius(a.x, a.y, 2, a).map((u) => u.id), [near.id], 'two tiles away: on the edge');
  assert.deepEqual(h.b.allyTargetsInRadius(a.x, a.y, 1.9, a).map((u) => u.id), []);
  assert.deepEqual(h.b.allyTargetsInRadius(a.x, a.y, 5, a).map((u) => u.id).sort(), [near.id, far.id].sort());
  assert.deepEqual(h.b.allyTargetsInRadius(near.x, near.y, 5, near).map((u) => u.id), [], 'an ally target selects none');
  assert.deepEqual(h.b.allyTargetsInKeys(new Set(a.rangeKeys), a).map((u) => u.id), h.b.allyTargetsInKeys(a.rangeKeys, a).map((u) => u.id), 'allyTargetsInKeys takes a Set too');
  h.b.retreat(near, { reason: 'retreat' });
  h.step();
  assert.deepEqual(h.b.allyTargetsInRadius(a.x, a.y, 2, a).map((u) => u.id), [], 'off the field: skipped');
  checkInvariants(h.b);
});
