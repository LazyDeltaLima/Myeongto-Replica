// test/content/op_frostl.test.js — 프로스트리프 (char_193_frostl, a tier-1 piece of 规程 (act3autochess); kit ops/op-frostl.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { COLS } from '../../server/sim/constants.js';

const A = 'chess_char_1_13_a', B = 'chess_char_1_13_b';
const FORMS = [A, B];
const S1 = 'skchr_frostl_1', S2 = 'skchr_frostl_2';
const rec = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const NEAR = [10, 5], FAR = [10, 6];
const hits = (h, u, e, arts) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e && (c.dmg.type === 'arts') === !!arts);

test('Trait: ×atk_scale at range, whole next to her; arts addition on the elite only', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    u.skill.locked = true;
    const e = h.spawn('enemy_dummy', { pos: FAR, def: 0 });
    assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 6), `${id}: strikes at range`);
    near(hits(h, u, e)[0].dmg.amount * (hits(h, u, e)[0].dmg.mul ?? 1), u.s.atk * 0.8, `${id}: ×0.8`, 1e-2);
    done(h);
  }
});

test('T1: only the elite: BAT +0.15, its range replaces hers', () => {
  const a = field(A, { skill: 0 }), b = field(B, { skill: 0 });
  near(a.u.s.bat ?? a.u.base.bat, 1.3, 'normal BAT');
  near(b.u.s.bat, 1.45, 'elite BAT');
  const t = ACT3.chess[B].talents[0];
  assert.equal(t.bb.base_attack_time, 0.15);
  const key = (dr, dc) => (10 + dr) * COLS + (4 + dc);
  assert.ok(!(a.u.rangeKeySet ?? new Set(a.u.rangeKeys)).has(key(1, 2)), 'normal: not in 3-12');
  assert.ok((b.u.rangeKeySet ?? new Set(b.u.rangeKeys)).has(key(1, 2)) || (b.u.rangeKeySet ?? new Set(b.u.rangeKeys)).has(key(-1, 2)), 'elite: 3-1');
  assert.equal(b.u.rangeKeys.length, t.rangeGrid.length, 'elite: the whole grid of the talent');
  done(a.h); done(b.h);
});

test('LOR-X: each hit of the elite adds atk_scale_m × ATK arts; the normal form none; S1 and S2 too', () => {
  const m = ACT3.chess[B].trait.bb.atk_scale_m;
  assert.equal(m, 0.1);
  for (const skill of [0, 1]) {
    const { h, u } = field(B, { skill });
    const e = h.spawn('enemy_dummy', { pos: NEAR });
    cast(u);
    assert.ok(h.runUntil(() => hits(h, u, e).length > 0 && hits(h, u, e, true).length > 0, 5), `S${skill + 1}: addition`);
    near(hits(h, u, e, true)[0].dmg.amount, u.s.atk * m, `S${skill + 1}: its amount`, 1e-2);
    assert.equal(hits(h, u, e, true).length, hits(h, u, e).length, `S${skill + 1}: one per hit, no recursion`);
    done(h);
  }
  const n = field(A, { skill: 0 });
  const f = n.h.spawn('enemy_dummy', { pos: NEAR });
  assert.ok(n.h.runUntil(() => hits(n.h, n.u, f).length > 1, 6));
  assert.equal(hits(n.h, n.u, f, true).length, 0);
  done(n.h);
});

test('S1: next attack at atk_scale with no ×0.8 at range; the target slowed for `duration` s', () => {
  for (const id of FORMS) {
    const b1 = rec(id, S1).bb;
    const { h, u } = field(id, { skill: 0 });
    const e = h.spawn('enemy_dummy', { pos: FAR, def: 0 });
    cast(u);
    assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 6), `${id}: strikes`);
    const c = hits(h, u, e)[0];
    near(c.dmg.amount, u.s.atk * b1.atk_scale, `${id}: atk_scale, no ×0.8`, 1e-2);
    const b = e.findBuff('frostl_s_1');
    assert.ok(b, `${id}: slowed`);
    near(b.mods.moveMul, 1 + b1.move_speed, `${id}: move speed`);
    near(b.timeLeft, b1.duration, `${id}: its time`, 0.1);
    h.run(b1.duration + 0.2);
    assert.ok(!e.findBuff('frostl_s_1') || e.findBuff('frostl_s_1').timeLeft > 0.3, `${id}: only a new hit keeps it`);
    done(h);
  }
});

test('S2: ASPD +attack_speed, each hit slows for `debuff` s; the chance is the record\'s, 束缚 lasts `debuff` s; ×0.8 stays', () => {
  for (const id of FORMS) {
    const b2 = rec(id, S2).bb;
    const { h, u } = field(id, { skill: 1 });
    const v0 = u.s.aspd;
    const e = h.spawn('enemy_dummy', { pos: FAR, def: 0 });
    cast(u);
    near(u.s.aspd, v0 + b2.attack_speed, `${id}: ASPD`);
    assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 6), `${id}: strikes`);
    near(hits(h, u, e)[0].dmg.amount * (hits(h, u, e)[0].dmg.mul ?? 1), u.s.atk * 0.8, `${id}: ×0.8`, 1e-2);
    const b = e.findBuff('frostl_s_2[slow]');
    assert.ok(b, `${id}: slowed`);
    near(b.mods.moveMul, 1 + b2.move_speed, `${id}: move speed`);
    assert.ok(h.runUntil(() => !u.skill.active, rec(id, S2).duration + 2), `${id}: ends`);
    done(h);
  }
});

test('S2: 束缚 lands about as often as prob, for `debuff` s', () => {
  for (const id of FORMS) {
    const b2 = rec(id, S2).bb;
    const { h, u } = field(id, { skill: 1 });
    u.skill.gainSp(u.skill.spCost + 1, 'test');
    u.skill.activate('test');
    u.skill.timeLeft = 1e6;
    const e = h.spawn('enemy_dummy', { pos: NEAR });
    let n = 0;
    h.b.on('damaged', (c) => { if (c.source === u && c.target === e && c.dmg.isAttack) n++; });
    let seen = 0, was = false;
    for (let i = 0; i < 30 * 200; i++) {
      h.step();
      const now = !!e.s.flags.bind;
      if (now && !was) seen++;
      was = now;
    }
    assert.ok(n > 100, `${id}: many hits (${n})`);
    assert.ok(seen / n > b2.prob * 0.5 && seen / n < b2.prob * 1.3, `${id}: ${seen} of ${n}, prob ${b2.prob}`);
    done(h);
  }
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_193_frostl');
});
