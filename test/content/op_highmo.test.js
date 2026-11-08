// test/content/op_highmo.test.js — 하이모어 (char_4066_highmo, a tier-3 piece of 规程 (act3autochess); kit ops/op-highmo.js): both forms, both skills.
// Run: node --test test/content/op_highmo.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_3_04_a', B = 'chess_char_3_04_b';
const FORMS = [A, B];
const S1 = 'skchr_highmo_1', S2 = 'skchr_highmo_2';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const dmgOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);

test('the trait: heals from her attack up to her block count, 50 (REA-X 60); nobody else heals her', () => {
  for (const [id, v] of [[A, 50], [B, 60]]) {
    assert.equal(ACT3.chess[id].trait.bb.value, v);
    const { h, u } = field(id, { skill: 0 });
    u.skill.sp = 0;
    u.hp = 100;
    const es = [[9, 5], [10, 5], [11, 5]].map((pos) => h.spawn('enemy_dummy', { pos }));
    h.runUntil(() => es.every((e) => dmgOn(h, e).length > 0), 5);
    near(u.hp, 100 + v * Math.min(3, u.s.blockCnt), `${id}: HP`);
    const hp = u.hp;
    h.b.heal({ id: 99, side: 'ally' }, u, 100);
    assert.equal(u.hp, hp, `${id}: no heal from others`);
    done(h);
  }
});

test('T1: her attack takes `value` of her 元素损伤 per enemy, up to her block count', () => {
  for (const id of FORMS) {
    const v = ACT3.chess[id].talents[0].bb.value;
    const { h, u } = field(id, { skill: 0 });
    u.skill.sp = 0;
    h.b.dealDamage(null, u, { type: 'element', element: 'burn', amount: 500 });
    const before = u.elem.burn;
    assert.ok(before > 0, id);
    const es = [[9, 5], [10, 5], [11, 5]].map((pos) => h.spawn('enemy_dummy', { pos }));
    h.runUntil(() => es.every((e) => dmgOn(h, e).length > 0), 5);
    near(before - u.elem.burn, v * Math.min(3, u.s.blockCnt), `${id}: gauge`);
    done(h);
  }
});

test('T2 is off in this mode: no ASPD and no more block', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.s.blockCnt, ACT3.chess[id].stats.blockCnt, id);
    assert.equal(u.s.aspd, ACT3.chess[id].stats.aspd, id);
    done(h);
  }
});

test('S1: her next attack at atk_scale strikes twice every enemy in range, then the plain attack again', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    const e1 = h.spawn('enemy_dummy', { pos: [10, 5] }), e2 = h.spawn('enemy_dummy', { pos: [9, 5] });
    cast(u);
    h.runUntil(() => dmgOn(h, e1).length > 0, 6);
    for (const e of [e1, e2]) {
      const hits = dmgOn(h, e).filter((c) => c.dmg?.isAttack);
      assert.equal(hits.length, 2, `${id}: two strikes`);
      near(hits[0].dmg.amount, u.s.atk * b1.atk_scale, `${id}: rate`);
      assert.equal(hits[0].dmg.isSkill, true, id);
    }
    h.hooks.damaged.length = 0;
    u.skill.sp = 0;
    h.runUntil(() => dmgOn(h, e1).length > 0, 6);
    const plain = dmgOn(h, e1).filter((c) => c.dmg?.isAttack);
    assert.equal(plain.length, 1, `${id}: one strike`);
    near(plain[0].dmg.amount, u.s.atk, `${id}: plain`);
    done(h);
  }
});

test('S2: ATK and 물리 회피 from the blackboard, she keeps attacking at once (no begin hold)', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1 });
    assert.equal(u.skill.id, S2);
    const atk = u.s.atk;
    cast(u);
    assert.equal(u.skillStateUntil ?? 0, 0, `${id}: no state`);
    h.step();
    near(u.s.atk, atk + u.base.atk * b2.atk, `${id}: ATK`);
    near(u.s.dodgePhys, b2.prob, `${id}: dodge`);
    u.skill.end('test');
    h.step();
    assert.equal(u.s.dodgePhys, 0, `${id}: dodge ends`);
    done(h);
  }
});

test('S2: an enemy killed in her range or blocked by her gives hp_ratio of max HP, a flyer or a far one nothing', () => {
  for (const id of FORMS) {
    const r = bbOf(id, S2).hp_ratio;
    const { h, u } = field(id, { skill: 1 });
    cast(u);
    h.step();
    u.hp = 100;
    const inRange = h.spawn('enemy_dummy', { pos: [9, 5] });
    h.b.kill(inRange, null);
    near(u.hp, 100 + u.s.maxHp * r, `${id}: in range, killed by anyone`);
    u.hp = 100;
    const blocked = h.spawn('enemy_dummy', { pos: [2, 2] });
    blocked.blockedBy = u;
    h.b.kill(blocked, null);
    near(u.hp, 100 + u.s.maxHp * r, `${id}: blocked`);
    blocked.blockedBy = null;
    u.hp = 100;
    h.b.kill(h.spawn('enemy_fly', { pos: [9, 5] }), null);
    h.b.kill(h.spawn('enemy_dummy', { pos: [10, 8] }), null);
    assert.equal(u.hp, 100, `${id}: a flyer, a far one`);
    u.skill.end('test');
    h.step();
    h.b.kill(h.spawn('enemy_dummy', { pos: [9, 5] }), null);
    assert.equal(u.hp, 100, `${id}: skill over`);
    done(h);
  }
});

test('the real match path: bought, placed and fought', async () => {
  const u = await realMatch(A, 'char_4066_highmo');
  assert.ok(u.skill);
});
