// test/content/op_quercu.test.js — 퀘르쿠스 (char_492_quercu, a tier-1 piece of 规程 (act3autochess); kit ops/op-quercu.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { COLS } from '../../server/sim/constants.js';

const A = 'chess_char_1_11_a', B = 'chess_char_1_11_b';
const FORMS = [A, B];
const S1 = 'skchr_quercu_1', S2 = 'skchr_quercu_2';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const YAK = 'chess_char_1_02_a';
const FRONT = [10, 6];
const BUDDY = [10, 5]; // in her range y-6
const heals = (h, u) => h.hooksOf('heal').filter((c) => c.source === u);
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
const buddy = (id, skill, o = {}) => field(id, { skill, others: [{ uid: 3, chessId: YAK, row: BUDDY[0], col: BUDDY[1] }], ...o });

test('Trait: arts attacks with no skill on; while a skill runs she heals the lowest HP share for ATK × heal_scale, no damage', () => {
  for (const id of FORMS) {
    const hs = ACT3.chess[id].trait.bb.heal_scale;
    assert.equal(hs, id === A ? 0.75 : 1);
    const { h, u } = buddy(id, 1);
    const y = h.unit(3);
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 5), `${id}: attacks`);
    assert.equal(hits(h, u, e)[0].dmg.type, 'arts');
    y.hp = 1;
    cast(u);
    const n = hits(h, u, e).length;
    assert.ok(h.runUntil(() => heals(h, u).length > 0, 5), `${id}: heals`);
    const c = heals(h, u)[0];
    assert.equal(c.target, y, `${id}: the hurt one`);
    near(c.amount, u.s.atk * hs, `${id}: ATK × heal_scale`, 1e-2);
    h.run(3);
    assert.ok(hits(h, u, e).length <= n + 1, `${id}: no more damage`);
    done(h);
  }
});

test('S1: ATK +atk, no end of its own; S2: ASPD +attack_speed for its time', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1), b2 = bbOf(id, S2);
    const a = field(id, { skill: 0 });
    const a0 = a.u.s.atk;
    cast(a.u);
    near(a.u.s.atk, a0 * (1 + b1.atk), `${id}: ATK`, 1e-2);
    a.h.run(120);
    assert.ok(a.u.skill.active, `${id}: S1 still on`);
    done(a.h);
    const s = field(id, { skill: 1 });
    const v0 = s.u.s.aspd;
    cast(s.u);
    near(s.u.s.aspd, v0 + b2.attack_speed, `${id}: ASPD`);
    assert.ok(s.h.runUntil(() => !s.u.skill.active, 20), `${id}: S2 ends`);
    done(s.h);
  }
});

test('S2: each heal gives its target +sp SP; S1\'s does not', () => {
  for (const id of FORMS) {
    const sp = bbOf(id, S2).sp;
    const { h, u } = buddy(id, 1);
    const y = h.unit(3);
    y.skill.locked = true;
    y.hp = 1;
    y.skill.sp = 0;
    const seen = [];
    h.b.on('spGain', (c) => { if (c.unit === y && c.reason === 'talent') seen.push(c.amount); });
    cast(u);
    assert.ok(h.runUntil(() => heals(h, u).length >= 2, 5), `${id}: heals`);
    assert.equal(seen.length, heals(h, u).length, `${id}: one a heal`);
    assert.equal(seen[0], sp, `${id}: sp`);
    done(h);
    const a = buddy(id, 0);
    const z = a.h.unit(3);
    z.hp = 1;
    const other = [];
    a.h.b.on('spGain', (c) => { if (c.unit === z && c.reason === 'talent') other.push(c); });
    cast(a.u);
    assert.ok(a.h.runUntil(() => heals(a.h, a.u).length >= 2, 5), `${id}: S1 heals too`);
    assert.equal(other.length, 0, `${id}: S1 no SP`);
    done(a.h);
  }
});

test('Talent: an ally of her range with an HP share at hp_ratio or more has 庇护; below it, or out of range, none; the 0.1 s check', () => {
  for (const id of FORMS) {
    const t = ACT3.chess[id].talents[0].bb;
    assert.equal(t.hp_ratio, 0.7);
    const { h, u } = buddy(id, 1, { others: [{ uid: 3, chessId: YAK, row: BUDDY[0], col: BUDDY[1] }, { uid: 4, chessId: YAK, row: 12, col: 3 }] });
    u.skill.locked = true;
    const y = h.unit(3), far = h.unit(4);
    assert.ok(far.alive && !u.rangeKeys.includes(far.tileR * COLS + far.tileC), `${id}: out of her range`);
    h.run(0.15);
    const b = y.findBuff('protect');
    assert.ok(b, `${id}: on the ally`);
    near(y.s.physTakenMul ?? b.mods.physTakenMul, 1 - t.damage_resistance, `${id}: phys`);
    assert.ok(u.findBuff('protect'), `${id}: herself too`);
    assert.ok(!far.findBuff('protect'), `${id}: out of range`);
    y.hp = y.s.maxHp * (t.hp_ratio - 0.01);
    h.run(0.15);
    assert.ok(!y.findBuff('protect'), `${id}: below hp_ratio`);
    y.hp = y.s.maxHp * t.hp_ratio;
    h.run(0.15);
    assert.ok(y.findBuff('protect'), `${id}: at hp_ratio`);
    done(h);
  }
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_492_quercu');
});
