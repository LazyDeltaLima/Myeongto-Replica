// test/content/op_glassb.test.js — 이스티나 (char_195_glassb, a tier-2 piece of the season not out yet; kit ops/op-glassb.js): both forms, both skills.
// Run: node --test test/content/op_glassb.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch } from '../helpers/nextSeason.js';
import { COLS } from '../../server/sim/constants.js';

const A = 'chess_char_2_nglassb_a', B = 'chess_char_2_nglassb_b';
const FORMS = [A, B];
const S1 = 'skchr_glassb_1', S2 = 'skchr_glassb_2';
const bbOf = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const dmgOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e || c.unit === e);

test('T1 (elite only): DEF −35%, ASPD +N; the normal form has no talent yet', () => {
  assert.equal(NEXT.chess[A].talents.length, 0);
  const t = NEXT.chess[B].talents[0].bb;
  const { h, u } = field(B);
  const b = u.findBuff('glassb_t_1');
  assert.deepEqual([b.mods.defPct, b.mods.aspd], [t.def, t.attack_speed]);
  near(u.s.def, u.base.def * (1 + t.def), 'DEF');
  done(h);
  const n = field(A);
  assert.ok(!n.u.findBuff('glassb_t_1'));
  done(n.h);
});

test('the trait: 停顿 on the target for the trait bb s (0.8, DEC-Y 1.2), arts damage', () => {
  for (const id of FORMS) {
    const { h, u } = field(id);
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    h.runUntil(() => dmgOn(h, e).length > 0, 10);
    assert.equal(u.profile.dmgType ?? u.def.dmgType, 'arts', id);
    h.step();
    const s = e.findBuff('sluggish');
    assert.ok(s, `${id}: 停顿`);
    assert.ok(s.timeLeft <= NEXT.chess[id].trait.bb.sluggish && s.timeLeft > NEXT.chess[id].trait.bb.sluggish - 0.3, `${id}: ${s.timeLeft}`);
    done(h);
  }
});

test('S1: the base attack time goes down by base_attack_time s', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    const bb = bbOf(id, S1), bat = u.base.bat, iv = u.s.interval;
    cast(u);
    h.step();
    near(u.s.interval, iv * (bat + bb.base_attack_time) / bat, `${id}: interval`);
    done(h);
  }
});

test('S2: ATK +, range x-2, up to 3 targets; each takes 停顿; the range goes back', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    assert.equal(u.skill.id, S2);
    const atk = u.s.atk;
    const backTile = [10, 2];   // behind her: only x-2 reaches it
    const es = [h.spawn('enemy_dummy', { pos: backTile }), h.spawn('enemy_dummy', { pos: [11, 4] }), h.spawn('enemy_dummy', { pos: [9, 4] }), h.spawn('enemy_dummy', { pos: [8, 4] })];
    h.run(0.1);
    cast(u);
    h.step();
    near(u.s.atk, atk * (1 + bbOf(id, S2).atk), `${id}: ATK`);
    assert.ok(u.rangeKeySet.has(backTile[0] * COLS + backTile[1]), `${id}: x-2 reaches behind her`);
    h.runUntil(() => es.some((e) => dmgOn(h, e).length), 10);
    h.run(0.6);   // the three shots of that swing land; the next swing is a whole interval away
    const hit = es.filter((e) => dmgOn(h, e).length);
    assert.equal(hit.length, 3, `${id}: 3 of the 4 in a swing`);
    for (const e of hit) assert.ok(e.findBuff('sluggish'), `${id}: 停顿 on each`);
    u.skill.end('test');
    h.step();
    assert.ok(!u.rangeKeySet.has(backTile[0] * COLS + backTile[1]), `${id}: the range goes back`);
    done(h);
  }
});

test('S2 strikes `_preDelay` 0.5 s into a swing, no clip of its own (record: Skill_Loop, wait 0)', () => {
  const rec = NEXT.chess[B].attackAnim.skills[1];
  assert.deepEqual([rec.clip, rec.pre, rec.wait, rec.max], ['Skill_Loop', 0.5, 0, 1]);
});

test('real match path: buys, places and fights with no handler error', async () => {
  const u = await realMatch(A, 'char_195_glassb');
  assert.equal(u.skill.id, S2);
});
