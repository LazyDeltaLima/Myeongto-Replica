// test/content/op_varkis.test.js — 바르카리스 (char_4166_varkis, a tier-1 piece of 规程 (act3autochess); kit ops/op-varkis.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACT3, field, done, cast, begun, realMatch } from '../helpers/seasonPieces.js';
import { S1_STRIKES, S2_BEGIN } from '../../server/sim/content/kits/ops/op-varkis.js';

const A = 'chess_char_1_10_a', B = 'chess_char_1_10_b';
const FORMS = [A, B];
const S1 = 'skchr_varkis_1', S2 = 'skchr_varkis_2';
const rec = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const FRONT = [10, 5];
const SHIELD = 'varkis_s2[shield_core]';
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
function block(h, u, e) { e.blockedBy = u; u.blocking.push(e); h.step(); }

test('Trait: she strikes every enemy she blocks', () => {
  const { h, u } = field(A, { skill: 0 });
  u.skill.locked = true;
  const a = h.spawn('enemy_dummy', { pos: FRONT }), b = h.spawn('enemy_dummy', { pos: FRONT });
  block(h, u, a); block(h, u, b);
  assert.ok(h.runUntil(() => hits(h, u, a).length > 0 && hits(h, u, b).length > 0, 5));
  done(h);
});

test('T1: ATK ×talent_atk_scale when the enemy\'s HP share is not above hers; not above it: plain', () => {
  for (const id of FORMS) {
    const sc = ACT3.chess[id].talents[0].bb.talent_atk_scale;
    const { h, u } = field(id, { skill: 0 });
    u.skill.locked = true;
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    u.hp = u.s.maxHp * 0.5;
    e.hp = e.s.maxHp * 0.5;     // equal counts
    const seen = [];
    h.b.on('hit', (c) => { if (c.source === u && c.target === e) seen.push(c.dmg.amount); }, { priority: -100 });
    assert.ok(h.runUntil(() => seen.length > 0, 4), `${id}: strikes`);
    near(seen[0], u.s.atk * sc, `${id}: scaled at equal shares`, 1e-2);
    u.hp = u.s.maxHp * 0.4;     // the enemy's share is above hers now
    seen.length = 0;
    assert.ok(h.runUntil(() => seen.length > 0, 4), `${id}: strikes again`);
    near(seen[0], u.s.atk, `${id}: plain`, 1e-2);
    done(h);
  }
});

test('T1: it reaches another 米诺斯 operator, the first placed of two counts once whatever its value; a non-米诺斯 gets nothing', () => {
  const low = ACT3.chess[A].talents[0].bb.talent_atk_scale, high = ACT3.chess[B].talents[0].bb.talent_atk_scale;
  assert.ok(high > low);
  // the weaker one placed first (the helper places `more` before the main piece): the stronger one's buff stays off
  const { h } = field(B, { skill: 0, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 2 }], more: [{ uid: 3, id: A, skill: 0, row: 10, col: 3 }] });
  const u = h.unit(1), v = h.unit(3), y = h.unit(2);
  assert.ok(v?.alive && v.deployed, 'the other one stands');
  assert.ok(v.deploySeq < u.deploySeq, 'the weaker one was placed first');
  u.skill.locked = true; v.skill.locked = true;
  const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
  const seen = [], other = [];
  h.b.on('hit', (c) => { if (c.target !== e) return; if (c.source === u) seen.push(c.dmg.amount); if (c.source === y) other.push(c.dmg.amount); }, { priority: -100 });
  assert.ok(h.runUntil(() => seen.length > 0, 4), 'she strikes');
  near(seen[0], u.s.atk * low, 'the first placed value, not her own higher one', 1e-2);
  h.b.dealDamage(y, e, { amount: 100, type: 'phys', tags: ['test'] });
  near(other.at(-1), 100, 'not 米诺斯: plain', 1e-6);
  // placement decides, not the order the handlers run in
  const seqs = [u.deploySeq, v.deploySeq];
  u.deploySeq = seqs[1]; v.deploySeq = seqs[0];
  h.b.dealDamage(u, e, { amount: 100, type: 'phys', tags: ['test'] });
  near(seen.at(-1), 100 * high, 'the stronger one when it is the earlier', 1e-6);
  u.deploySeq = seqs[0]; v.deploySeq = seqs[1];
  h.b.retreat(v);
  h.step();
  seen.length = 0;
  assert.ok(h.runUntil(() => seen.length > 0, 4), 'strikes on');
  near(seen[0], u.s.atk * high, 'her own when the first left', 1e-2);
  done(h);
  // the stronger one placed first: it counts for the later one too, whose own value takes over when it leaves
  const o = field(A, { skill: 0, more: [{ uid: 3, id: B, skill: 0, row: 10, col: 3 }] });
  const first = o.h.unit(3);
  assert.ok(first.deploySeq < o.u.deploySeq, 'the stronger one was placed first');
  o.u.skill.locked = true; first.skill.locked = true;
  const f = o.h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
  const got = [];
  o.h.b.on('hit', (c) => { if (c.target === f && c.source === o.u) got.push(c.dmg.amount); }, { priority: -100 });
  o.h.b.dealDamage(o.u, f, { amount: 100, type: 'phys', tags: ['test'] });
  near(got.at(-1), 100 * high, 'the first placed value on the later one', 1e-6);
  o.h.b.retreat(first);
  o.h.step();
  o.h.b.dealDamage(o.u, f, { amount: 100, type: 'phys', tags: ['test'] });
  near(got.at(-1), 100 * low, 'her own when the first left', 1e-6);
  done(o.h);
});

test('The S1 frames and the S2 begin clip are the skeleton\'s', () => {
  const front = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8')).chars.char_4166_varkis.spine.front;
  const f = front.hits.Skill;
  assert.equal(f.length, 3);
  near(S1_STRIKES[0], f[1] - f[0], '2nd', 2e-3);
  near(S1_STRIKES[1], f[2] - f[0], '3rd', 2e-3);
  near(S2_BEGIN, front.animations.Skill_2_Begin, 'begin', 1e-3);
});

test('S1: the next attack strikes every blocked target three times at atk_scale, at the clip\'s frames', () => {
  for (const id of FORMS) {
    const b1 = rec(id, S1).bb, sc = ACT3.chess[id].talents[0].bb.talent_atk_scale;
    const { h, u } = field(id, { skill: 0 });
    const a = h.spawn('enemy_dummy', { pos: FRONT, def: 0 }), b = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    block(h, u, a); block(h, u, b);
    u.skill.gainSp(u.skill.spCost + 1, 'test');
    const times = new Map([[a, []], [b, []]]);
    h.b.on('damaged', (c) => { if (c.source === u && c.dmg.isSkill && times.has(c.target)) times.get(c.target).push([h.b.time, c.dmg.amount]); });
    assert.ok(h.runUntil(() => times.get(a).length >= 3 && times.get(b).length >= 3, 6), `${id}: three each`);
    for (const list of times.values()) {
      assert.equal(list.length, 3, `${id}: three, not more`);
      for (const [, v] of list) near(v, u.s.atk * b1.atk_scale * sc, `${id}: atk_scale`, 1e-2);
      near(list[1][0] - list[0][0], S1_STRIKES[0], `${id}: 2nd frame`, 0.04);
      near(list[2][0] - list[0][0], S1_STRIKES[1], `${id}: 3rd frame`, 0.04);
    }
    h.run(0.3);
    for (const list of times.values()) assert.equal(list.length, 3, `${id}: nothing more right after`);
    done(h);
  }
});

test('S2: attacks at attack@s2_atk_scale; each attack heals her attack@hp_ratio; the begin clip holds her, its time runs after it', () => {
  for (const id of FORMS) {
    const b2 = rec(id, S2).bb;
    const { h, u } = field(id, { skill: 1 });
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    block(h, u, e);
    u.hp = u.s.maxHp * 0.2;
    const seen = [];
    h.b.on('hit', (c) => { if (c.source === u && c.target === e) seen.push(c.dmg.amount); }, { priority: -100 });
    const t0 = h.b.time;
    cast(u);
    near(u.skillStateUntil, t0 + S2_BEGIN, `${id}: begin clip`, 0.05);
    begun(h, u);
    near(h.b.time - t0, S2_BEGIN, `${id}: the skill starts as the clip ends`, 0.05);
    assert.equal(seen.length, 0, `${id}: no attack during the clip`);
    near(u.skill.timeLeft, rec(id, S2).duration, `${id}: its time after the clip`, 1e-3);
    assert.ok(h.runUntil(() => seen.length > 0, 4), `${id}: attacks`);
    assert.ok(h.b.time >= t0 + S2_BEGIN, `${id}: not during the clip`);
    near(seen[0] / u.s.atk, b2['attack@s2_atk_scale'], `${id}: its scale (the enemy's share is above hers: no T1)`, 1e-2);
    const heals = h.hooksOf('heal').filter((c) => c.source === u && c.target === u);
    assert.equal(heals.length, 1, `${id}: one heal per attack`);
    near(heals[0].amount, u.s.maxHp * b2['attack@hp_ratio'], `${id}: heal`, 1e-2);
    done(h);
  }
});

test('S2: overheal becomes the 屏障 up to max_hp_ratio; only while it runs; 생명 복원 does not', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    u.hp = u.s.maxHp;
    h.b.heal(u, u, 500, { self: true });
    assert.ok(!u.findBuff(SHIELD), `${id}: no skill, no 屏障`);
    cast(u);
    begun(h, u);
    u.hp = u.s.maxHp - 100;
    h.b.heal(u, u, 500, { self: true });
    near(u.hp, u.s.maxHp, `${id}: full`);
    near(u.findBuff(SHIELD).shield, 400, `${id}: the overflow`, 1e-3);
    h.b.heal(u, u, 500, { self: true });
    near(u.findBuff(SHIELD).shield, 900, `${id}: adds up`, 1e-3);
    h.b.heal(u, u, u.s.maxHp * 3, { self: true });
    near(u.findBuff(SHIELD).shield, u.s.maxHp, `${id}: capped`, 1e-3);
    u.findBuff(SHIELD).shield = 10;
    h.b.heal(u, u, 500, { regen: true });
    near(u.findBuff(SHIELD).shield, 10, `${id}: regen does not`, 1e-6);
    done(h);
  }
});

test('The 屏障 takes damage first among HP; other barriers go first; it decays 100 a second only after the skill', () => {
  const { h, u } = field(A, { skill: 1 });
  cast(u);
  begun(h, u);
  u.hp = u.s.maxHp;
  h.b.heal(u, u, 1000, { self: true });
  const s = u.findBuff(SHIELD);
  near(s.shield, 1000, 'gained', 1e-3);
  assert.ok(s.shieldLast, 'spent last');
  h.b.dealDamage(null, u, { amount: 300, type: 'true', sourceless: true, tags: ['test'] });
  near(s.shield, 700, 'took the damage', 1e-2);
  near(u.hp, u.s.maxHp, 'no HP lost');
  h.run(5);
  near(s.shield, 700, 'no decay while it runs', 1e-2);
  u.skill.end('test');
  h.run(1.1);
  assert.ok(u.findBuff(SHIELD)?.shield <= 600 + 1e-6, `one step: ${u.findBuff(SHIELD)?.shield}`);
  h.run(8);
  assert.ok(!u.findBuff(SHIELD), 'gone');
  done(h);
});

test('CEN-Y: above hp_ratio physical damage ×(1 − damage_resistance) on the elite; arts and low HP plain; normal form none', () => {
  const tb = ACT3.chess[B].trait.bb;
  assert.equal(tb.hp_ratio, 0.5);
  assert.equal(tb.damage_resistance, 0.2);
  const seen = (h, u, amount, type) => {
    const was = u.hp;
    h.b.dealDamage(null, u, { amount, type, sourceless: true, tags: ['test'] });
    return was - u.hp;
  };
  const b = field(B, { skill: 0 });
  b.u.skill.locked = true;
  b.u.s.def = 0;
  const full = seen(b.h, b.u, 100, 'true');
  assert.ok(full > 0);
  const hit = [];
  b.h.b.on('hit', (c) => { if (c.target === b.u) hit.push(c.dmg.mul); }, { priority: -100 });
  b.u.hp = b.u.s.maxHp;
  seen(b.h, b.u, 100, 'phys');
  near(hit.at(-1), 0.8, 'phys above', 1e-6);
  seen(b.h, b.u, 100, 'arts');
  near(hit.at(-1), 1, 'arts', 1e-6);
  b.u.hp = b.u.s.maxHp * 0.5;
  seen(b.h, b.u, 100, 'phys');
  near(hit.at(-1), 1, 'at hp_ratio: plain', 1e-6);
  done(b.h);
  const n = field(A, { skill: 0 });
  const hn = [];
  n.h.b.on('hit', (c) => { if (c.target === n.u) hn.push(c.dmg.mul); }, { priority: -100 });
  seen(n.h, n.u, 100, 'phys');
  near(hn.at(-1), 1, 'normal form', 1e-6);
  done(n.h);
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_4166_varkis');
});
