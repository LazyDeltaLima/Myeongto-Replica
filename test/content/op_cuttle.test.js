// test/content/op_cuttle.test.js — 안드레아나 (char_218_cuttle, a tier-2 piece of 规程 (act3autochess); kit ops/op-cuttle.js): both forms, both skills.
// Run: node --test test/content/op_cuttle.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACT3, field, done, cast, begun, realMatch } from '../helpers/seasonPieces.js';
import { S2_BEGIN } from '../../server/sim/content/kits/ops/op-cuttle.js';

const A = 'chess_char_2_24_a', B = 'chess_char_2_24_b';
const FORMS = [A, B];
const S1 = 'skcom_atk_up[3]', S2 = 'skchr_cuttle_2';
const DEBUFF = 'cuttle_s_2[debuff]';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const dmgOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);

test('Skill2_Begin is the clip the kit holds for', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url)));
  assert.equal(manifest.chars.char_218_cuttle.spine.front.animations.Skill2_Begin, S2_BEGIN);
});

test('T1: ASPD on every 深海猎人 of her player and herself, not on the others; two of her add up', () => {
  const OTHER = 'chess_char_2_21_a';
  assert.ok(ACT3.chess[A].powers.includes('abyssal'));
  assert.ok(!ACT3.chess[OTHER].powers.includes('abyssal'));
  const v = ACT3.chess[A].talents[0].bb.attack_speed, w = ACT3.chess[B].talents[0].bb.attack_speed;
  const { h, u } = field(A, { skill: 0, more: [{ uid: 2, id: OTHER, skill: 0, row: 9, col: 7 }, { uid: 3, id: B, skill: 0, row: 9, col: 5 }] });
  assert.equal(u.s.aspd, ACT3.chess[A].stats.aspd + v + w, 'both on herself');
  assert.equal(h.unit(3).s.aspd, ACT3.chess[B].stats.aspd + v + w, 'both on the other');
  assert.equal(h.unit(2).s.aspd, ACT3.chess[OTHER].stats.aspd, 'none on 이스티나');
  done(h);
});

test('S1: ATK + for its duration', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    const atk = u.s.atk;
    cast(u);
    h.step();
    near(u.s.atk, atk + u.base.atk * b1.atk, `${id}: ATK`);
    done(h);
  }
});

test('S2: no attack during its begin clip, ATK +, the hit slows by its blackboard', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1 });
    assert.equal(u.skill.id, S2);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const atk = u.s.atk;
    cast(u);
    near(u.skillStateUntil, h.b.time + S2_BEGIN, `${id}: held (the clip in whole ticks)`, 1 / 60);
    assert.equal(u.s.atk, atk, `${id}: no ATK before the clip has played`);
    begun(h, u);
    near(u.s.atk, atk + u.base.atk * b2.atk, `${id}: ATK`);
    h.hooks.damaged.length = 0;
    h.runUntil(() => !!e.findBuff(DEBUFF), 8);
    const d = e.findBuff(DEBUFF);
    near(d.mods.moveMul, 1 + b2['attack@move_speed'], `${id}: slow`);
    assert.ok(d.timeLeft <= b2['attack@duration'] && d.timeLeft > b2['attack@duration'] - 0.5, `${id}: time ${d.timeLeft}`);
    done(h);
  }
});

test('S2: she leaves enemies below half HP alone, also with nothing else to shoot; half HP exactly is a target', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    const low = h.spawn('enemy_dummy', { pos: [10, 6] });
    low.hp = low.s.maxHp * 0.49;
    cast(u);
    h.step();
    h.hooks.damaged.length = 0;
    h.run(8);
    assert.equal(dmgOn(h, low).filter((c) => c.dmg?.isAttack).length, 0, `${id}: not shot`);
    low.hp = low.s.maxHp * 0.5;
    h.runUntil(() => dmgOn(h, low).some((c) => c.dmg?.isAttack), 6);
    assert.ok(dmgOn(h, low).some((c) => c.dmg?.isAttack), `${id}: half is a target`);
    done(h);
  }
});

test('S1 keeps the plain targets: below half HP is shot', () => {
  const { h, u } = field(A, { skill: 0 });
  const low = h.spawn('enemy_dummy', { pos: [10, 6] });
  low.hp = low.s.maxHp * 0.1;
  cast(u);
  h.runUntil(() => dmgOn(h, low).some((c) => c.dmg?.isAttack), 8);
  assert.ok(dmgOn(h, low).some((c) => c.dmg?.isAttack));
  done(h);
});

test('DEA-X: damage grows with distance from min_dist to max_dist; the normal form has none', () => {
  const tb = ACT3.chess[B].trait.bb;
  assert.deepEqual([tb.min_dist, tb.max_dist, tb.damage_scale], [1, 4.5, 0.15]);
  const mulAt = (id, col) => {
    const { h, u } = field(id, { skill: 0 });
    u.skill.sp = 0;
    const e = h.spawn('enemy_dummy', { pos: [10, col] });
    h.runUntil(() => dmgOn(h, e).some((c) => c.dmg?.isAttack), 8);
    const c = dmgOn(h, e).find((x) => x.dmg?.isAttack);
    done(h);
    return c.dmg.mul ?? 1;
  };
  near(mulAt(B, 5), 1, 'at 1 tile');
  near(mulAt(B, 7), 1 + 0.15 * (3 - 1) / 3.5, 'at 3 tiles');
  near(mulAt(B, 8), 1 + 0.15 * (4 - 1) / 3.5, 'at 4 tiles');
  near(mulAt(A, 8), 1, 'normal form');
});

test('the real match path: bought, placed and fought', async () => {
  const u = await realMatch(A, 'char_218_cuttle');
  assert.ok(u.skill);
});
