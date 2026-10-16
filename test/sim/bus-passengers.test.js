// test/sim/bus-passengers.test.js — 伊利昂的木驮兽 (enemy_10159_mntrjn, only from the 悬赏·特异III card enemyeffect_16_8)
// on the real match path: the bounty puts it into the real wave, it takes the wave's enemies it meets on board (they
// leave the field and stop), slows down by −20 % a passenger, and drops them on its spot when it is knocked out
// (content/enemies/special.js kitBus; docs/rules/sim.md 「나무 버든비스트 승객」).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA } from '../match/harness.js';

const KEY = 'enemy_10159_mntrjn';

test('real wave (悬赏·特异III enemyeffect_16_8): the 驮兽 takes passengers on board, slows down, and drops them when knocked out', () => {
  const h = makeMatch({ mode: 'solo', difficulty: 'HARD', humans: 1, seed: 5, fake: false });
  h.start();
  h.toPrep(4);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values()]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.recompute();
  m.addBounty(ps, DATA.choices.cards.bounty.find((c) => c.effectId === 'enemyeffect_16_8'));
  const opts = m._normalOpts(ps);
  assert.ok(opts.spawns.some((s) => s.enemyKey === KEY), 'the bounty adds the 驮兽 to the real wave');
  const b = m.newBattle(opts);
  let bus = null, pax = [];
  while (!b.finished && b.time < 120) {
    b.step();
    bus = bus || b.enemies.find((e) => e.defId === KEY) || null;
    if (bus) pax = b.enemies.filter((e) => e.alive && e.hidden && e.mem.busOf === bus);
    if (pax.length) break;
  }
  assert.ok(bus && bus.alive, 'the 驮兽 is on the field');
  assert.ok(pax.length > 0, 'it took an enemy of the wave on board');
  const per = DATA.enemies[KEY].talents.bb['bus.move_speed'];
  const base = bus.base.moveSpeed;
  assert.ok(Math.abs(bus.s.moveSpeed - Math.max(0.1, base * (1 + pax.length * per))) < 1e-6, `slowed for ${pax.length}`);
  b.kill(bus, null);
  for (const p of pax) {
    assert.ok(p.alive && !p.hidden, `${p.defId} got off`);
    assert.ok(Math.abs(p.x - bus.x) <= 0.2 + 1e-9 && Math.abs(p.y - bus.y) <= 0.2 + 1e-9, 'on the 驮兽\'s spot');
  }
});
