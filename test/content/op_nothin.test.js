// test/content/op_nothin.test.js — 우요우 (char_455_nothin, a tier-3 piece of 规程 (act3autochess); kit ops/op-nothin.js): both forms, both skills.
// Run: node --test test/content/op_nothin.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACT3, field, done, cast, fill, realMatch } from '../helpers/seasonPieces.js';
import { S2_BEGIN } from '../../server/sim/content/kits/ops/op-nothin.js';

const A = 'chess_char_3_20_a', B = 'chess_char_3_20_b';
const FORMS = [A, B];
const S1 = 'skchr_nothin_1', S2 = 'skchr_nothin_2';
const skillOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const KEYS = ['nothin_s_2[a]', 'nothin_s_2[b]', 'nothin_s_2[c]'];
const keyOf = (u) => KEYS.find((k) => u.findBuff(k)) ?? null;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);

test('trait: 3 DP (MER-X 2) every 3 s, a withdrawal when it cannot be paid', () => {
  for (const [id, cost] of [[A, 3], [B, 2]]) {
    const { h, u } = field(id, { dp: 7 });
    assert.deepEqual([u.profile.merchantInterval, u.profile.merchantCost], [3, cost], id);
    const pl = h.b.getPlayer(u.ownerId);
    const dp0 = pl.dp;
    h.run(3.1);
    assert.equal(pl.dp, dp0 - cost, id);
    done(h);
  }
  const { h, u } = field(A, { dp: 2 });
  h.run(6.5);
  assert.equal(u.deployed, false, 'not enough DP: withdrawn');
  done(h);
});

test('T1 出其不意: off at deployment, on `delay` s later; that hit ×atk_scale and a stun; every hit puts it `delay` s ahead', () => {
  for (const id of FORMS) {
    const t = ACT3.chess[id].talents[0].bb;
    const { h, u } = field(id, { skill: 0 });
    assert.ok(!u.findBuff('nothin_t_1'), `${id}: not at deployment`);
    h.run(t.delay - 0.2);
    assert.ok(!u.findBuff('nothin_t_1'), `${id}: not yet`);
    h.run(0.4);
    assert.ok(u.findBuff('nothin_t_1') && u.findBuff('nothin_t_1[eff]'), `${id}: both effects held`);
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    const hp0 = e.hp;
    h.runUntil(() => e.hp < hp0, 5);
    near(hp0 - e.hp, u.s.atk * t.atk_scale, `${id}: the hit`);
    assert.ok(e.s.flags.stun, `${id}: stunned`);
    assert.ok(!u.findBuff('nothin_t_1'), `${id}: spent`);
    const hp1 = e.hp;
    h.runUntil(() => e.hp < hp1, 5);
    near(hp1 - e.hp, u.s.atk, `${id}: the next hit is a plain one`);
    h.run(3);
    assert.ok(!u.findBuff('nothin_t_1'), `${id}: attacking keeps it off`);
    h.b.removeEnemy?.(e);
    done(h);
  }
});

test('S1 知难而退: block +1 while carried; cast at ≤ 20 % HP: no attack, no block, taunt −1, 9 % / 12 % a second for 5 s', () => {
  for (const id of FORMS) {
    const rec = skillOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.rule, 'NEVER', 'its own condition');
    assert.equal(u.s.blockCnt, ACT3.chess[id].stats.blockCnt + rec.bb.block_cnt, `${id}: passive`);
    fill(u);
    h.run(0.5);
    assert.equal(u.skill.active, false, `${id}: HP is high`);
    u.hp = u.s.maxHp * 0.19;
    h.step();
    assert.equal(u.skill.active, true, `${id}: cast`);
    h.step();
    assert.ok(u.s.flags.disarm && u.s.flags.noBlock, `${id}: flags`);
    const hp1 = u.hp;
    h.run(1);
    near(u.hp - hp1, u.s.maxHp * rec.bb.hp_recovery_per_sec_by_max_hp_ratio, `${id}: regen a second`);
    h.run(rec.duration);
    assert.equal(u.skill.active, false, `${id}: ${rec.duration} s`);
    assert.ok(!u.s.flags.disarm, id);
    done(h);
  }
  // the other skill has no passive
  const { h, u } = field(A, { skill: 1 });
  assert.equal(u.s.blockCnt, ACT3.chess[A].stats.blockCnt);
  done(h);
});

test('S2 阴晴圆缺: a toggle; the pick after its begin clip, one of three, ATK +; never the last pick of this deployment; redeploy forgets it', () => {
  // the clip's length is the model's
  const manifest = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8'));
  assert.equal(manifest.chars.char_455_nothin.spine.front.animations.Skill_2_Begin, S2_BEGIN);
  for (const id of FORMS) {
    const bb = skillOf(id, S2).bb;
    const seen = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { h, u } = field(id, { seed });
      cast(u);
      assert.equal(keyOf(u), null, 'not before the clip ends');
      assert.ok(u.skillStateUntil > h.b.time, 'no attack during the clip');
      h.run(S2_BEGIN + 0.1);
      const k = keyOf(u);
      assert.ok(k, `${id} seed ${seed}: one effect`);
      assert.equal(KEYS.filter((x) => u.findBuff(x)).length, 1);
      seen.add(k);
      near(u.findBuff(k).mods.atkPct, bb.atk, 'ATK');
      // closed and opened again: another one
      u.skill.end('stop');
      h.step();
      assert.equal(keyOf(u), null);
      cast(u);
      h.run(S2_BEGIN + 0.1);
      assert.notEqual(keyOf(u), k, `${id} seed ${seed}: never the last`);
      done(h);
    }
    assert.equal(seen.size, 3, `${id}: all three come up`);
  }
});

test('S2 picks: [a] each hit slows the target (5 s, no stack), [b] ASPD, [c] block +1 and 物理闪避', () => {
  const pick = (key) => {
    for (let seed = 1; seed < 60; seed++) {
      const r = field(B, { seed });
      cast(r.u);
      r.h.run(S2_BEGIN + 0.1);
      if (keyOf(r.u) === key) return r;
    }
    assert.fail(key);
  };
  const bb = skillOf(B, S2).bb;
  const a = pick('nothin_s_2[a]');
  const e = a.h.spawn('enemy_dummy', { pos: [10, 5] });
  const aspd = e.s.aspd;
  a.h.runUntil(() => e.hp < e.s.maxHp, 5);
  const v = bb['nothin_s_2[a][attack_speed_down].attack_speed'];
  assert.equal(e.findBuff('nothin_s_2[a][attack_speed_down]').mods.aspd, v);
  a.h.step();
  assert.equal(e.s.aspd, aspd + v, 'one stack');
  a.h.run(3);
  assert.equal(e.s.aspd, aspd + v, 'no stack');
  done(a.h);
  const b = pick('nothin_s_2[b]');
  assert.equal(b.u.findBuff('nothin_s_2[b]').mods.aspd, bb.attack_speed);
  done(b.h);
  const c = pick('nothin_s_2[c]');
  assert.equal(c.u.s.blockCnt, ACT3.chess[B].stats.blockCnt + bb.block_cnt);
  near(c.u.s.dodgePhys, bb.prob, 'dodge');
  done(c.h);
});

test('real match path: her piece fights in a 规程 match', async () => {
  for (const id of FORMS) await realMatch(id, 'char_455_nothin');
});
