// 不屈 (indomShip) rolls on every knock-out, a second one in the same tick too (docs/rules/sim.md 「불굴 — 같은 틱에 다시
// 쓰러져도 굴림」). The redeploy is synchronous, so the rest of the tick's hits land on the new deployment; until the fix a
// knock-out at the same battle time as the last 不屈 redeploy was not rolled and 砾 lay down for the normal redeploy timer
// even at a 100 % chance (community report).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const GRAVEL = 'chess_char_2_12_a';   // 砾: a ground (melee-position) 不屈 member

function setup(layers) {
  const h = makeBattle({
    units: [{ chessId: GRAVEL, row: 9, col: 4 }],
    bonds: { indomShip: { count: 2, layers, active: true, tier: 1 } },
    enemies: [{ key: 'e', time: 0, route: 0 }],
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 1e9, atk: 0, bat: 99, speed: 0.0001 }) } },
    timeLimit: 120, seed: 3,
  });
  h.step();
  const u = h.unit(GRAVEL);
  const knock = () => h.b.dealDamage(h.b.enemies[0], u, { amount: 1e7, type: 'true', canDodge: false });
  return { h, u, knock };
}

test('不屈 at 100 % (L ≥ 205): two knock-outs in one tick — both redeploy at once', REAL, () => {
  const { h, u, knock } = setup(205);
  for (let i = 0; i < 3; i++) {
    const t = h.b.time;
    knock();
    assert.ok(u.alive, `tick ${i}: the first knock-out redeploys`);
    knock();
    assert.equal(h.b.time, t, 'the same battle time');
    assert.ok(u.alive, `tick ${i}: a second knock-out in the same tick rolls too and redeploys (不屈 same-tick roll, docs/rules/sim.md 「불굴 — 같은 틱에 다시 쓰러져도 굴림」)`);
    h.run(0.5);
  }
  assert.equal(h.eventsOf('fx').filter((e) => e[1] === 'revive' && JSON.stringify(e).includes('bond:indomShip')).length, 6, 'six 不屈 revives');
});

test('不屈 at 18 % (L = 0): a knock-out without a hit waits out the normal redeploy timer', REAL, () => {
  const { h, u, knock } = setup(0);
  let down = 0;
  for (let i = 0; i < 6 && down === 0; i++) { knock(); if (!u.alive) down++; else h.run(0.5); }
  assert.equal(down, 1, 'one roll misses within six knock-outs (seed 3)');
  assert.ok(u.respawnAt > h.b.time + 1, 'the normal redeploy timer');
});

test('不屈: a knock-out during its own redeploy (a deploy hook) is not rolled again — no loop', REAL, () => {
  const { h, u, knock } = setup(300);
  let deploys = 0;
  h.b.on('deploy', (c) => {
    if (c.unit !== u || ++deploys > 1) return;
    h.b.dealDamage(h.b.enemies[0], u, { amount: 1e7, type: 'true', canDodge: false });   // dies again while deploying
  }, { priority: -50 });
  knock();
  assert.equal(deploys, 1, 'one redeploy, no second one from inside it');
  assert.ok(!u.alive);
  h.run(0.5);
  knock();   // (already down: nothing)
});
