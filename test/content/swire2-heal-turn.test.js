// test/content/swire2-heal-turn.test.js — 琳琅诗怀雅 S1 仗义疏财: with a coin and an injured ally in the 3×3 her attack's turn
// is the heal (maintainer decision 2026-10-22 「공식대로」): the client's S1 attack is the AbilitySelectableGroup Body/Trigger,
// which casts the first config that can cast as a turn starts (`_DoCastInternal` RVA 0xC49C50) — HealAlly (coin buff +
// an ally ≤ 70 % HP of x-4, `_animKey "Skill_1"`, the heal on its OnAttack event) before Attack. No enemy is hit by that
// turn; with no enemy at all she still heals (owner's decision 2026-10-04). kits/ops/chess_char_3_04-swire2.js installS1.
// Run: node --test test/content/swire2-heal-turn.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { attackTiming } from '../../server/sim/ai.js';

const ds = getDefaultSource();
const ID = 'chess_char_3_04_a', S1 = 'skchr_swire2_1';
const S1_INDEX = ds.rawChess(ID).skills.find((s) => s.skillId === S1).index;
const NEIGHBOUR = 'chess_char_3_16_a';

/** 琳琅诗怀雅 (S1) on (9, 5) with `coins`, a wounded ally on (10, 5); an enemy that never moves before her when `enemy`. */
function field({ coins = 2, enemy = true } = {}) {
  const h = makeBattle({
    defs: { enemies: { enemy_d: enemyRec({ key: 'enemy_d', hp: 1e7, speed: 0 }) } },
    units: [{ chessId: ID, row: 9, col: 5, skillIndex: S1_INDEX }, { chessId: NEIGHBOUR, row: 10, col: 5 }],
    timeLimit: 60, autoFinish: false, hooks: ['heal', 'damaged'], captureNoisy: true, flags: { dpInit: 60, dpMax: 99 },
  });
  h.step();
  const u = h.unit(ID), ally = h.unit(NEIGHBOUR);
  const foe = enemy ? h.spawn('enemy_d', { pos: [9, 6] }) : null;
  u.mem.coins = coins;
  ally.hp = ally.s.maxHp * 0.4;
  return { h, u, ally, foe };
}
const fxOf = (h, kind, u) => h.eventsOf('fx').filter((e) => e[1] === kind && e[4]?.id === u.id);

/** `seconds` of the field: her heal casts, heals, swings and attacks, timed. */
function timeline(h, u, seconds) {
  const out = { casts: [], heals: [], swings: [], atks: [] };
  let seen = h.events.length, heals = 0;
  for (let i = 0; i < seconds / h.TICK; i++) {
    h.step();
    for (const e of h.events.slice(seen)) {
      if (e[0] === 'fx' && e[1] === 'swire2Heal' && e[4]?.id === u.id) out.casts.push(h.b.time);
      if (e[0] === 'swing' && e[1] === u.id) out.swings.push(h.b.time);
      if (e[0] === 'atk' && e[1] === u.id) out.atks.push(h.b.time);
    }
    seen = h.events.length;
    const n = h.hooksOf('heal').filter((x) => x.source === u).length;
    for (; heals < n; heals++) out.heals.push(h.b.time);
  }
  return out;
}

test('an enemy in front: a heal turn hits nobody, its heal lands at her attack\'s strike time; with no heal due she attacks', () => {
  const { h, u, ally } = field({ coins: 2 });
  const strike = attackTiming(u).strike;
  const t = timeline(h, u, 12);
  assert.ok(t.casts.length >= 2, JSON.stringify(t.casts));
  assert.equal(t.heals.length, t.casts.length, 'every cast heals');
  for (let i = 0; i < t.casts.length; i++) {
    const c = t.casts[i];
    assert.ok(Math.abs(t.heals[i] - c - strike) <= h.TICK + 1e-9, `heal ${i}: ${t.heals[i] - c} s after its cast, strike ${strike}`);
    // the turn: no swing starts and no attack strikes from the cast to its heal
    assert.ok(!t.swings.some((x) => x > c - 1e-9 && x < t.heals[i] - 1e-9) && !t.atks.some((x) => x > c - 1e-9 && x < t.heals[i] + 1e-9), `turn ${i}`);
    if (i) assert.ok(c - t.casts[i - 1] >= u.s.interval - h.TICK - 1e-9, 'one turn per attack interval');
  }
  assert.ok(ally.hp > ally.s.maxHp * 0.4, 'healed');
  // healed to 70 % or more (or out of coins): she attacks again
  ally.hp = ally.s.maxHp;
  u.mem.coins = 0;
  const after = timeline(h, u, 4);
  assert.equal(after.casts.length, 0);
  assert.ok(after.atks.length > 0, 'she attacks');
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0);
});

test('no enemy: she still heals on her attack cadence (owner\'s decision 2026-10-04)', () => {
  const { h, u, ally } = field({ coins: 2, enemy: false });
  const t = timeline(h, u, 6);
  assert.ok(t.casts.length >= 2);
  assert.equal(t.heals.length, t.casts.length);
  assert.ok(h.hooksOf('heal').every((x) => x.source !== u || x.target === ally || x.target === u));
  assert.equal(t.atks.length, 0);
});

test('a stun during the cast cancels the heal and keeps the coin', () => {
  const { h, u } = field({ coins: 1, enemy: false });
  while (!fxOf(h, 'swire2Heal', u).length) h.step();
  h.b.applyStatus(u, 'stun', { duration: 3, source: null });
  h.run(1);
  assert.equal(h.hooksOf('heal').filter((x) => x.source === u).length, 0, 'no heal');
  assert.equal(u.mem.coins, 1, 'the coin is kept');
});

test('no injured ally: the coins stay and she attacks', () => {
  const { h, u, ally, foe } = field({ coins: 2 });
  ally.hp = ally.s.maxHp;
  h.run(4);
  assert.equal(fxOf(h, 'swire2Heal', u).length, 0);
  assert.equal(u.mem.coins, 2);
  assert.ok(h.hooksOf('damaged').some((x) => x.source === u && x.target === foe && x.amount > 0));
});
