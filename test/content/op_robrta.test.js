// test/content/op_robrta.test.js — 로베르타 (char_484_robrta, a tier-3 piece of 规程 (act3autochess); kit ops/op-robrta.js) and her 全自动造型仪 (token_10018_robrta_mach): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { MACH, DEF_KEY, SHIELD_KEY, COUNT_KEYS, RUNNING_KEYS } from '../../server/sim/content/kits/ops/op-robrta.js';

const A = 'chess_char_3_19_a', B = 'chess_char_3_19_b';
const FORMS = [A, B];
const S1 = 'skchr_robrta_1', S2 = 'skchr_robrta_2';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const YAK = 'chess_char_1_02_a';
const talent = (id) => ACT3.chess[id].talents[0].bb;
const machTalent = (id) => ACT3.tokens[MACH].variants[id].talents[0].bb;
/** She at (10, 4); the machine at (10, 3) facing RIGHT, so it serves her. */
const facing = (id, skill = 0, o = {}) => field(id, { skill, others: [{ uid: 2, kind: 'token', tokenId: MACH, ownerUid: 1, row: 10, col: 3, dir: 'RIGHT' }], ...o });
const shieldOf = (u, m) => u.findBuff(`${SHIELD_KEY}:${m.id}`);

test('The machine: no attack, 무적, never targeted, no heal; its form\'s cost and redeploy; it leaves after `duration` s', () => {
  for (const id of FORMS) {
    const { h, u } = facing(id);
    u.skill.locked = true;
    const m = h.unit(2), v = ACT3.tokens[MACH].variants[id];
    assert.ok(m.alive);
    assert.ok(m.profile.noAttack);
    assert.ok(m.s.flags.invulnerable && m.s.flags.untargetable && m.s.flags.noHeal);
    assert.equal(m.base.cost, v.stats.cost);
    const t0 = h.b.time, life = machTalent(id).duration;
    assert.equal(life, 25);
    assert.ok(h.runUntil(() => !m.alive, life + 1), `${id}: leaves`);
    near(h.b.time - t0, life, `${id}: duration`, 0.01);
    done(h);
  }
});

test('The module costs 2 less and holds one more: the token data', () => {
  assert.equal(ACT3.tokens[MACH].variants[A].stats.cost, 5);
  assert.equal(ACT3.tokens[MACH].variants[B].stats.cost, 3);
});

test('DEF +def on the unit it faces, while there; not on one beside it', () => {
  for (const id of FORMS) {
    const { h, u } = facing(id);
    u.skill.locked = true;
    h.step();
    const d = machTalent(id).def;
    near(u.s.def, u.base.def * (1 + d), `${id}: DEF`, 1e-3);
    h.b.retreat(h.unit(2), { reason: 'retreat' });
    h.step();
    assert.ok(!u.findBuff(DEF_KEY), `${id}: gone with the machine`);
    near(u.s.def, u.base.def, `${id}: back`, 1e-3);
    done(h);
  }
  const { h, u } = field(A, { skill: 0, others: [{ uid: 2, kind: 'token', tokenId: MACH, ownerUid: 1, row: 11, col: 3, dir: 'RIGHT' }] });
  u.skill.locked = true;
  h.step();
  assert.ok(!u.findBuff(DEF_KEY), 'not its tile');
  done(h);
});

test('Shield: 2 hits blocked whole (E2\'s Talents/1+), each spending the machine\'s count; a hit after them lands', () => {
  for (const id of FORMS) {
    const { h, u } = facing(id);
    u.skill.locked = true;
    h.step();
    const m = h.unit(2);
    assert.equal(shieldOf(u, m).shieldHits, 2, `${id}: the talent's text`);
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    for (const left of [1, 0]) {
      const hp = u.hp;
      h.b.dealDamage(e, u, { amount: 300, type: 'phys', tags: ['test'] });
      assert.equal(u.hp, hp, `${id}: blocked`);
      h.step();
      assert.equal(m.mem.machLeft, left, `${id}: the machine's count`);
    }
    const hp = u.hp;
    h.b.dealDamage(e, u, { amount: 300, type: 'phys', tags: ['test'] });
    assert.ok(u.hp < hp, `${id}: the third lands`);
    near(u.s.def, u.base.def * (1 + machTalent(id).def), `${id}: DEF stays`, 1e-3);
    done(h);
  }
});

test('What the model is told: rest until its DEF buff stands on someone, a layer effect per layer, its end effect on the unit', () => {
  for (const id of FORMS) {
    const { h, u } = facing(id);
    u.skill.locked = true;
    const m = h.unit(2);
    const sent = [];
    const fx = h.b.fx.bind(h.b);
    h.b.fx = (n, o) => { sent.push([n, o]); return fx(n, o); };
    h.step();
    assert.equal(m.form, 'running', `${id}: mode Running while it serves`);
    for (const k of RUNNING_KEYS) assert.ok(m.findBuff(k), `${id}: ${k}`);
    assert.deepEqual(COUNT_KEYS.map((k) => !!m.findBuff(k)), [true, true], `${id}: two layers, both effects`);
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    h.b.dealDamage(e, u, { amount: 300, type: 'phys', tags: ['test'] });
    h.step();
    assert.deepEqual(COUNT_KEYS.map((k) => !!m.findBuff(k)), [true, false], `${id}: [count_2] goes first`);
    assert.ok(!sent.some(([n, o]) => n === 'kitHit' && o.k === 'robrta:end'), `${id}: no end effect yet`);
    h.b.dealDamage(e, u, { amount: 300, type: 'phys', tags: ['test'] });
    h.step();
    assert.deepEqual(COUNT_KEYS.map((k) => !!m.findBuff(k)), [false, false], `${id}: none left`);
    const ends = sent.filter(([n, o]) => n === 'kitHit' && o.k === 'robrta:end');
    assert.equal(ends.length, 1, `${id}: one end effect`);
    assert.equal(ends[0][1].id, u.id, `${id}: on the unit served`);
    assert.equal(ends[0][1].src, h.unit(1).id, `${id}: her plan draws it`);
    done(h);
    const k = field(id, { skill: 0, others: [
      { uid: 2, kind: 'token', tokenId: MACH, ownerUid: 1, row: 11, col: 6, dir: 'RIGHT' },
      { uid: 3, chessId: YAK, row: 11, col: 7 },
    ] });
    k.u.skill.locked = true;
    k.h.step();
    const n = k.h.unit(2);
    assert.equal(n.form, 'running', `${id}: it serves the next one`);
    k.h.b.retreat(k.h.unit(3), { reason: 'retreat' });
    k.h.step();
    assert.equal(n.form, 'rest', `${id}: mode Default with nobody on its tile`);
    for (const key of RUNNING_KEYS) assert.ok(!n.findBuff(key), `${id}: ${key} gone`);
    done(k.h);
  }
});

test('The count belongs to the machine: what one unit used, the next on the tile does not get (PRTS)', () => {
  const { h, u } = field(A, { skill: 0, others: [
    { uid: 2, kind: 'token', tokenId: MACH, ownerUid: 1, row: 11, col: 6, dir: 'RIGHT' },
    { uid: 3, chessId: YAK, row: 11, col: 7 },
  ] });
  u.skill.locked = true;
  h.step();
  const m = h.unit(2), y = h.unit(3);
  y.skill.locked = true;
  const e = h.spawn('enemy_dummy', { pos: [11, 8] });
  h.b.dealDamage(e, y, { amount: 100, type: 'phys', tags: ['test'] });
  h.step();
  assert.equal(m.mem.machLeft, 1);
  h.b.retreat(y, { reason: 'retreat' });
  h.step();
  assert.ok(!shieldOf(y, m), 'off the tile: gone');
  assert.equal(m.mem.machLeft, 1, 'kept');
  assert.ok(m.alive, 'the machine stays');
  assert.ok(h.b.redeploy(y, { free: true }));
  h.step();
  assert.equal(shieldOf(y, m).shieldHits, 1, 'the rest only');
  done(h);
});

test('DEF does not stack from two machines, the second takes over when the first goes', () => {
  const { h, u } = field(B, { skill: 0, others: [
    { uid: 2, kind: 'token', tokenId: MACH, ownerUid: 1, row: 10, col: 3, dir: 'RIGHT' },
    { uid: 3, kind: 'token', tokenId: MACH, ownerUid: 1, row: 11, col: 4, dir: 'DOWN' },
  ] });
  u.skill.locked = true;
  h.step();
  const d = machTalent(B).def;
  near(u.s.def, u.base.def * (1 + d), 'one', 1e-3);
  h.b.retreat(u.findBuff(DEF_KEY).source, { reason: 'retreat' });
  h.step(); h.step();
  near(u.s.def, u.base.def * (1 + d), 'the other', 1e-3);
  assert.ok(u.findBuff(DEF_KEY).source.alive);
  done(h);
});

test('Holding: a deployment sets it to cnt (cap +1 with CRA-X); a machine that left comes back paying cost and one held after its redeploy time', () => {
  for (const id of FORMS) {
    const cnt = talent(id).cnt, extra = ACT3.chess[id].trait.bb.cnt ?? 0;
    assert.equal(cnt, 3);
    assert.equal(extra, id === A ? 0 : 1);
    const { h, u } = facing(id);
    u.skill.locked = true;
    const st = u.mem.craftsman, m = h.unit(2);
    assert.equal(st.stock, cnt, `${id}: held`);
    assert.equal(st.cap, cnt + extra, `${id}: cap`);
    const dp = () => h.b.getPlayer(u.ownerId).dp;
    h.b.retreat(m, { reason: 'retreat' });
    const d0 = dp(), t0 = h.b.time;
    assert.ok(h.runUntil(() => m.alive, m.base.respawnTime + 1), `${id}: back`);
    near(h.b.time - t0, m.base.respawnTime, `${id}: its redeploy time`, 0.3);
    assert.equal(st.stock, cnt - 1, `${id}: one held`);
    near(d0 - dp(), m.base.cost, `${id}: its cost`);
    st.stock = 1;
    h.b.retreat(u, { reason: 'retreat' });
    assert.ok(!m.alive, `${id}: leaves with her`);
    assert.ok(h.b.redeploy(u, { free: true }));
    assert.equal(st.stock, cnt, `${id}: refreshed, not added`);
    done(h);
  }
});

test('S1: ATK and DEF', () => {
  for (const id of FORMS) {
    const b = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    const a0 = u.s.atk, d0 = u.s.def;
    cast(u);
    near(u.s.atk, a0 * (1 + b.atk), `${id}: ATK`, 1e-2);
    near(u.s.def, d0 * (1 + b.def), `${id}: DEF`, 1e-2);
    done(h);
  }
});

test('S2: no attack, block +block_cnt, DEF +def; one more held as it ends, at most the cap', () => {
  for (const id of FORMS) {
    const b = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1 });
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    u.mem.craftsman.stock = 1;
    const block = u.s.blockCnt, d0 = u.s.def;
    h.run(0.1);
    cast(u);
    assert.equal(u.s.blockCnt, block + b.block_cnt);
    near(u.s.def, d0 * (1 + b.def), `${id}: DEF`, 1e-2);
    h.run(1.5);   // (a swing its mode switch detached plays on: 1.5 s covers it, ai.js updateAlly `swingOff`)
    const n = h.hooksOf('damaged').filter((c) => c.source === u && c.target === e).length;
    h.run(5);
    assert.equal(h.hooksOf('damaged').filter((c) => c.source === u && c.target === e).length, n, `${id}: no attack`);
    assert.ok(h.runUntil(() => !u.skill.active, 25), `${id}: ends`);
    assert.equal(u.mem.craftsman.stock, 1 + b['robrta_s_2[recharge].cnt'], `${id}: +1`);
    u.mem.craftsman.stock = u.mem.craftsman.cap;
    cast(u);
    h.runUntil(() => !u.skill.active, 25);
    assert.equal(u.mem.craftsman.stock, u.mem.craftsman.cap, `${id}: the cap`);
    done(h);
  }
});

test('It serves an operator of hers and a summon, never another device; on a melee tile only', () => {
  const { h, u } = field(B, { skill: 0, more: [{ uid: 5, id: 'chess_char_2_17_b', row: 12, col: 3 }, { uid: 10, id: 'chess_char_1_09_a', row: 10, col: 2 }], others: [
    { uid: 2, kind: 'token', tokenId: MACH, ownerUid: 1, row: 10, col: 6, dir: 'RIGHT' },
    { uid: 3, chessId: YAK, row: 10, col: 7 },
    { uid: 4, kind: 'token', tokenId: MACH, ownerUid: 1, row: 11, col: 6, dir: 'RIGHT' },
    { uid: 6, kind: 'token', tokenId: MACH, ownerUid: 1, row: 11, col: 7, dir: 'RIGHT' },
    { uid: 7, kind: 'token', tokenId: MACH, ownerUid: 1, row: 12, col: 6, dir: 'RIGHT' },
    { uid: 8, kind: 'token', tokenId: 'token_10037_mitm_trshrb', ownerUid: 5, row: 12, col: 7 },
    { uid: 9, kind: 'token', tokenId: MACH, ownerUid: 1, row: 10, col: 3, dir: 'LEFT' },
  ] });
  u.skill.locked = true;
  h.step();
  assert.ok(h.unit(3).findBuff(DEF_KEY), 'an operator');
  assert.ok(!h.unit(6).findBuff(DEF_KEY), 'no device');
  assert.ok(!h.unit(8).findBuff(DEF_KEY), 'a 체리 3호 in its first second is out of the fight');
  assert.ok(h.runUntil(() => h.unit(8).findBuff(DEF_KEY), 2), 'a summon');
  assert.ok(h.unit(10).alive, 'on its ranged tile');
  assert.ok(!h.unit(10).findBuff(DEF_KEY), 'a ranged tile: none');
  done(h);
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_484_robrta');
});
