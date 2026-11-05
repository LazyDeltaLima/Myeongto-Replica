// test/content/op_bison.test.js — 바이슨 (char_325_bison, a tier-1 piece of the season not out yet; kit ops/op-bison.js): both forms, both skills.
// Run: node --test test/content/op_bison.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch, pieceRec } from '../helpers/nextSeason.js';

const A = 'chess_char_1_nbison_a', B = 'chess_char_1_nbison_b';
const FORMS = [A, B];
const S1 = 'skcom_def_up[3]', S2 = 'skchr_bison_2';
const skillBb = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk).bb;
const TEXAS = 'chess_char_1_08_a', YAK = 'chess_char_1_02_a';   // a 先锋, a 重装
const approx = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);

test('T1 交叉掩护: DEF +def on himself and on a 先锋 / 近卫 on the tile behind him, not on another class, not in front', () => {
  for (const id of FORMS) {
    const v = NEXT.chess[id].talents[0].bb.def;
    const { h, u } = field(id, { others: [{ uid: 2, chessId: TEXAS, row: 10, col: 3 }, { uid: 3, chessId: TEXAS, row: 10, col: 5 }, { uid: 4, chessId: YAK, row: 9, col: 4 }] });
    h.run(0.5);
    assert.equal(u.findBuff('bison_t_1').mods.defFlat, v, id);
    assert.ok(h.unit(2).findBuff('bison_t_1'), `${id}: behind him`);
    assert.ok(!h.unit(3).findBuff('bison_t_1'), `${id}: in front`);
    assert.ok(!h.unit(4).findBuff('bison_t_1'), `${id}: beside`);
    done(h);
  }
  const { h } = field(A, { others: [{ uid: 2, chessId: YAK, row: 10, col: 3 }] });
  h.run(0.5);
  assert.ok(!h.unit(2).findBuff('bison_t_1'), 'a 重装 behind him holds none');
  done(h);
  // facing LEFT: "behind" turns with him
  const l = field(A, { dir: 'LEFT', others: [{ uid: 2, chessId: TEXAS, row: 10, col: 5 }, { uid: 3, chessId: TEXAS, row: 10, col: 3 }] });
  l.h.run(0.5);
  if (l.u.dir === 'LEFT') {
    assert.ok(l.h.unit(2).findBuff('bison_t_1'));
    assert.ok(!l.h.unit(3).findBuff('bison_t_1'));
  }
  done(l.h);
});

test('S1 防御력强화: DEF +def for its duration, in both forms, on his trigger row TAKE_DAMAGE', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const rec = NEXT.chess[id].skills[0];
    assert.equal(u.skill.id, S1);
    assert.equal(u.skill.rule, 'TAKE_DAMAGE');
    const before = u.s.def;
    cast(u);
    h.step();
    assert.ok(u.s.def > before, id);
    approx(u.s.def, (u.base.def + NEXT.chess[id].talents[0].bb.def) * (1 + rec.bb.def), `${id}: DEF`);
    h.run(rec.duration + 0.1);
    assert.equal(u.skill.active, false, id);
    done(h);
  }
});

test('S2 深化阵线: no attack, DEF +, taunt +1 on himself; the others on x-5 DEF +, himself not twice; gone after it', () => {
  for (const id of FORMS) {
    const bb = skillBb(id, S2);
    const { h, u } = field(id, { others: [{ uid: 2, chessId: YAK, row: 10, col: 5 }, { uid: 3, chessId: YAK, row: 9, col: 4 }, { uid: 4, chessId: YAK, row: 9, col: 5 }, { uid: 5, chessId: YAK, row: 10, col: 7 }] });
    const e = h.spawn('enemy_dummy', { pos: [10, 4] });   // on his own tile: only he reaches it
    assert.equal(u.skill.id, S2);
    const hp0 = e.hp;
    cast(u);
    h.run(0.5);
    assert.ok(u.profile.noAttack || u.skill.spec.attack?.noAttack, 'noAttack');
    assert.equal(u.skill.spec.mods.taunt, bb['bison_s_2[self].taunt_level']);
    assert.ok(u.findBuff('bison_s_2[self]')?.visible !== false && u.findBuff('bison_s_2[self]'), `${id}: his own effect`);
    assert.ok(!u.findBuff('bison_s_2[ally]'), `${id}: others only`);
    assert.equal(h.unit(2).findBuff('bison_s_2[ally]').mods.defPct, bb['bison_s_2[ally].def'], `${id}: x-5 in front`);
    assert.ok(h.unit(3).findBuff('bison_s_2[ally]'), `${id}: x-5 beside`);
    assert.ok(!h.unit(4).findBuff('bison_s_2[ally]'), `${id}: a diagonal is out`);
    assert.ok(!h.unit(5).findBuff('bison_s_2[ally]'), `${id}: two tiles away is out`);
    h.run(10);
    assert.equal(e.hp, hp0, `${id}: he attacks nobody`);
    u.skill.end('duration');
    h.run(0.5);
    assert.ok(!u.findBuff('bison_s_2[self]'), id);
    assert.ok(!h.unit(2).findBuff('bison_s_2[ally]'), id);
    h.run(3);
    assert.ok(e.hp < hp0, `${id}: he attacks again`);
    done(h);
  }
});

test('PRO-X: DEF +20 % while blocking on the elite (trait bb def), nothing on the normal form', () => {
  const { h, u } = field(B, { skill: 1 });
  assert.equal(NEXT.chess[B].trait.bb.def, 0.2);
  const free = u.s.def;
  const e = h.spawn('enemy_runner', { pos: [10, 6] });
  h.runUntil(() => u.blocking.length > 0, 10);
  h.step();
  assert.ok(u.blocking.includes(e));
  approx(u.s.def - free, (u.base.def + NEXT.chess[B].talents[0].bb.def) * 0.2, 'blocking');
  done(h);
  const n = field(A, { skill: 1 });
  n.h.spawn('enemy_runner', { pos: [10, 6] });
  const f2 = n.u.s.def;
  n.h.runUntil(() => n.u.blocking.length > 0, 10);
  n.h.step();
  assert.equal(n.u.s.def, f2);
  done(n.h);
});

test('real match path: his piece fights in a next match', async () => {
  for (const id of FORMS) assert.equal((await realMatch(id, 'char_325_bison')).skill.id, pieceRec(id).skill.skillId);
});
