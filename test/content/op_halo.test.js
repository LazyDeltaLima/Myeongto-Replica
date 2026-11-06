// test/content/op_halo.test.js — 아스트젠 (char_135_halo, a tier-2 piece of the season not out yet; kit ops/op-halo.js): both forms, both skills, the talent, CHA-Y.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch } from '../helpers/nextSeason.js';

const A = 'chess_char_2_nhalo_a', B = 'chess_char_2_nhalo_b';
const FORMS = [A, B];
const S1 = 'skchr_halo_1', S2 = 'skchr_halo_2';
const rec = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const talent = (id) => NEXT.chess[id].talents.find((t) => t.index === 0).bb;
const of = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u);
const row = (h, n, col = 6) => Array.from({ length: n }, () => h.spawn('enemy_dummy', { pos: [10, col], res: 0 }));

test('The trait: 3 enemies at −15 % on the normal form, 4 with no falloff on the elite (CHA-Y), each with the 停顿', () => {
  for (const [id, n, fall] of [[A, 3, 0.85], [B, 4, 1]]) {
    const { h, u } = field(id, { skill: 0 });
    const es = row(h, 6);
    assert.ok(h.runUntil(() => of(h, u).some((c) => c.dmg.tags?.includes('chain')), 8), `${id}: it chained`);
    h.step();
    const atk = of(h, u)[0].dmg.attackId, one = of(h, u).filter((c) => c.dmg.attackId === atk);
    assert.equal(one.length, n, `${id}: its count`);
    for (const c of one) assert.ok(c.target.findBuff?.('sluggish') || c.target.s.flags.sluggish, `${id}: 停顿`);
    const main = one.find((c) => !c.dmg.tags?.includes('chain'));
    one.filter((c) => c.dmg.tags?.includes('chain')).forEach((c, i) => near(c.dmg.amount, main.dmg.amount * fall ** (i + 1), `${id}: jump ${i + 1}`));
    assert.ok(es.length);
    done(h);
  }
});

test('T1: a stack every `interval` s from the deployment, up to max_stack_cnt; the full count has its buff; a withdrawal starts over', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const t = talent(id), base = u.s.aspd;
    assert.equal(u.findBuff('halo_t_1[stack]'), null, `${id}: none at once`);
    h.run(t.interval - 0.2);
    near(u.s.aspd, base, `${id}: nothing before the first interval`);
    h.run(0.4);
    near(u.s.aspd, base + t.attack_speed, `${id}: the first`);
    assert.equal(u.findBuff('halo_t_1[effect]'), null, `${id}: not full`);
    h.run(t.interval * t.max_stack_cnt);
    near(u.s.aspd, base + t.attack_speed * t.max_stack_cnt, `${id}: the cap`);
    assert.ok(u.findBuff('halo_t_1[effect]')?.visible, `${id}: its full buff, shown`);
    h.b.retreat(u);
    h.step();
    h.b.getPlayer(u.ownerId).dp = 99;
    assert.ok(h.runUntil(() => u.alive && u.deployed, u.base.respawnTime + 5), `${id}: back`);
    h.run(0.1);
    near(u.s.aspd, base, `${id}: from nothing again`);
    assert.equal(u.findBuff('halo_t_1[effect]'), null, `${id}: the full buff gone`);
    done(h);
  }
});

test('S1: the next attack at atk_scale strikes max_target targets, each its own chain over chain.max_target', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const r = rec(id, S1);
    assert.equal(u.skill.kind, r.maxChargeTime > 1 ? 'charges' : 'instant', id);
    row(h, 8);   // (within a jump of each other: the chains run their full count)
    cast(u);
    assert.ok(h.runUntil(() => of(h, u).some((c) => c.dmg.isSkill), 8), `${id}: it struck`);
    h.run(0.6);   // (each target's projectile lands on its own)
    const atk = of(h, u).find((c) => c.dmg.isSkill).dmg.attackId, one = of(h, u).filter((c) => c.dmg.attackId === atk);
    const mains = one.filter((c) => !c.dmg.tags?.includes('chain'));
    assert.equal(mains.length, r.bb.max_target, `${id}: two targets`);
    assert.equal(one.length, r.bb.max_target * r.bb['chain.max_target'], `${id}: each chain's count`);
    for (const c of mains) near(c.dmg.amount, u.s.atk * r.bb.atk_scale, `${id}: atk_scale`);
    const fall = id === A ? 0.85 : 1;
    const jump = one.find((c) => c.dmg.tags?.includes('chain'));
    near(jump.dmg.amount, mains[0].dmg.amount * fall, `${id}: its first jump`);
    done(h);
  }
});

test('S2: ATK +atk, its range, attack@max_target targets each chaining, for its duration', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    const r = rec(id, S2), before = u.s.atk, keys = u.rangeKeys.length;
    h.spawn('enemy_dummy', { pos: [10, 5], res: 0 }); h.spawn('enemy_dummy', { pos: [10, 6], res: 0 });
    row(h, 4, 7);
    cast(u);
    near(u.s.atk, before * (1 + r.bb.atk), `${id}: ATK`);
    assert.notEqual(u.rangeKeys.length, keys, `${id}: the skill's range`);
    assert.ok(h.runUntil(() => of(h, u).some((c) => c.dmg.isSkill), 6), `${id}: it struck`);
    h.run(0.6);   // (each target's projectile lands on its own)
    const atk = of(h, u).find((c) => c.dmg.isSkill).dmg.attackId, one = of(h, u).filter((c) => c.dmg.attackId === atk);
    assert.equal(one.filter((c) => !c.dmg.tags?.includes('chain')).length, r.bb['attack@max_target'], `${id}: two targets`);
    assert.ok(one.some((c) => c.dmg.tags?.includes('chain')), `${id}: chains`);
    assert.ok(h.runUntil(() => !u.skill.active, r.duration + 1), `${id}: ends`);
    assert.equal(u.rangeKeys.length, keys, `${id}: range back`);
    done(h);
  }
});

test('The real match path, both forms', async () => {
  for (const id of FORMS) await realMatch(id, 'char_135_halo');
});
