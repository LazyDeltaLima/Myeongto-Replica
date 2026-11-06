// test/content/op_aosta.test.js — 아오스타 (char_346_aosta, a tier-2 piece of the season not out yet; kit ops/op-aosta.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch } from '../helpers/nextSeason.js';

const A = 'chess_char_2_naosta_a', B = 'chess_char_2_naosta_b';
const FORMS = [A, B];
const S1 = 'skcom_quickattack[3]', S2 = 'skchr_aosta_2';
const BLEED = 'aosta_t_1';
const bbOf = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const dmgOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);
const attacks = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.isAttack);
const ticks = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.tags?.includes('periodic'));

test('Trait: all in range, the front line × atk_scale, RPR-X raises it', () => {
  assert.equal(NEXT.chess[A].trait.bb.atk_scale, 1.5);
  assert.equal(NEXT.chess[B].trait.bb.atk_scale, 1.6);
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    u.skill.locked = true;
    const front = h.spawn('enemy_dummy', { pos: [10, 5] });
    const side = h.spawn('enemy_dummy', { pos: [9, 6] });
    h.runUntil(() => attacks(h, side).length >= 1 && attacks(h, front).length >= 1, 10);
    near(attacks(h, front)[0].amount / attacks(h, side)[0].amount, NEXT.chess[id].trait.bb.atk_scale, `${id}: front against side`);
    done(h);
  }
});

test('T1: a hit bleeds for its duration, ticking each second after the first, at atk_scale × ATK outside the trait ×', () => {
  for (const id of FORMS) {
    const t = NEXT.chess[id].talents[0].bb;
    const { h, u } = field(id, { skill: 1 });
    u.skill.locked = true;
    const e = h.spawn('enemy_dummy', { pos: [10, 5] }); // on the front line: the trait's × is not in the tick
    h.runUntil(() => e.findBuff(BLEED), 10);
    assert.ok(Math.abs(e.findBuff(BLEED).timeLeft - t.duration) < 0.1, `${id}: duration`);
    h.b.removeBuff(e, BLEED);
    const was = ticks(h, e).length;
    u.skill.locked = true;
    h.runUntil(() => ticks(h, e).length > was, 10);
    const tick = ticks(h, e).at(-1);
    assert.equal(tick.type, 'arts');
    assert.equal(tick.source, u);
    assert.ok(!tick.dmg.sourceless, `${id}: its source is her`);
    near(tick.dmg.amount, u.s.atk * t.atk_scale, `${id}: atk_scale`);
    done(h);
  }
});

test('T1: a blocked enemy holds it and takes nothing until it is free; one bleed among two 아오스타, the last to hit gives its numbers', () => {
  const { h, u } = field(B, { skill: 1 });
  u.skill.locked = true;
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  h.runUntil(() => e.findBuff(BLEED), 10);
  e.blockedBy = u;
  const was = ticks(h, e).length;
  h.run(2.2);
  assert.ok(e.findBuff(BLEED), 'held');
  assert.equal(ticks(h, e).length, was, 'no tick while blocked');
  e.blockedBy = null;
  h.run(2.2);
  assert.ok(ticks(h, e).length > was, 'ticks when free');
  done(h);

  const f = field(B, { skill: 1, more: [{ uid: 2, id: A, skill: 1, row: 9, col: 4 }] });
  f.u.skill.locked = true; f.h.unit(2).skill.locked = true;
  const x = f.h.spawn('enemy_dummy', { pos: [9, 5] });
  f.h.runUntil(() => x.findBuff(BLEED), 10);
  assert.equal(x.buffs.filter((b) => b.key === BLEED).length, 1, 'one');
  f.h.run(3);
  assert.equal(x.buffs.filter((b) => b.key === BLEED).length, 1, 'still one');
  done(f.h);
});

test('T1: a new hit extends it and takes her ATK of then', () => {
  const t = NEXT.chess[B].talents[0].bb;
  const { h, u } = field(B, { skill: 1 });
  u.skill.locked = true;
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  h.runUntil(() => e.findBuff(BLEED), 10);
  const first = e.findBuff(BLEED).data.amount;
  near(first, u.s.atk * t.atk_scale, 'first');
  h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 1 } });
  h.step();
  const n = attacks(h, e).length;
  h.runUntil(() => attacks(h, e).length > n, 10);
  const b = e.findBuff(BLEED);
  near(b.data.amount, u.s.atk * t.atk_scale, 'the new ATK');
  assert.ok(b.timeLeft > t.duration - 0.2, 'time back to full');
  assert.ok(!(b.stacks > 1), 'it does not stack');
  done(h);
});

test('S1: ATK +, ASPD +', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    const { atk, aspd } = u.s;
    cast(u);
    h.step();
    near(u.s.atk, atk + u.base.atk * b1.atk, `${id}: ATK`);
    assert.equal(u.s.aspd, aspd + b1.attack_speed, `${id}: ASPD`);
    done(h);
  }
});

test('S2: ATK +, attack interval × 1.5, each enemy hit is bound, the bleed × talent_scale', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2), t = NEXT.chess[id].talents[0].bb;
    assert.equal(b2.base_attack_time, 0.5);
    assert.equal(b2.talent_scale, 2);
    const { h, u } = field(id, { skill: 1 });
    assert.equal(u.skill.id, S2);
    const a = h.spawn('enemy_dummy', { pos: [10, 5] }), b = h.spawn('enemy_dummy', { pos: [9, 6] });
    const { atk } = u.s, bat = u.attackInterval ?? null;
    cast(u);
    h.step();
    near(u.s.atk, atk + u.base.atk * b2.atk, `${id}: ATK`);
    near(u.s.batPct ?? u.s.bat / u.base.bat - 1, 0.5, `${id}: the interval`);
    if (bat != null) near(u.attackInterval, bat * 1.5, `${id}: attack interval`);
    const n = attacks(h, a).length;
    h.runUntil(() => attacks(h, a).length > n && attacks(h, b).length > 0, 10);
    for (const e of [a, b]) {
      const root = e.buffs.find((x) => x.status === 'bind');
      assert.ok(root, `${id}: bound`);
      assert.ok(root.timeLeft <= b2['attack@frozen_duration'] + 1e-6 && root.timeLeft > 0, `${id}: its time`);
    }
    near(a.findBuff(BLEED).data.amount, u.s.atk * t.atk_scale * b2.talent_scale, `${id}: bleed ×`);
    done(h);
  }
});

test('a real match fields both forms', async () => {
  for (const id of FORMS) await realMatch(id, 'char_346_aosta');
});
