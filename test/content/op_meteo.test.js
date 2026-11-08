// test/content/op_meteo.test.js — 메테오라이트 (char_219_meteo, a tier-1 piece of 规程 (act3autochess); kit ops/op-meteo.js): both forms, both skills.
// Run: node --test test/content/op_meteo.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { S1_RADIUS, S2_RADIUS } from '../../server/sim/content/kits/ops/op-meteo.js';

const A = 'chess_char_1_17_a', B = 'chess_char_1_17_b';
const FORMS = [A, B];
const skillBb = (id, i) => ACT3.chess[id].skills[i].bb;
const approx = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
/** The talent's roll forced: `on` every attack boosted, else none. */
const forceTalent = (h, on) => { h.b.rng.chance = () => on; };
/** Enemies on her row at these columns (her target: the first one, spawned first). */
const line = (h, cols) => cols.map((c) => h.spawn('enemy_dummy', { pos: [10, c] }));

test('炮手: the aoesniper profile splashes 1.0 around the struck enemy (official projectile radius), in full; ART-Y ignores 100 DEF on the elite only', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    forceTalent(h, false);
    assert.equal(u.profile.splashRadius, 1.0, id);
    const [t, near, far] = line(h, [6, 6.9, 7.05]);
    const hp = [t.hp, near.hp, far.hp];
    h.runUntil(() => t.hp < hp[0], 10);
    h.step();
    approx(hp[0] - t.hp, u.s.atk, `${id}: the struck one`);
    approx(hp[1] - near.hp, u.s.atk, `${id}: 0.9 away, in full`);
    assert.equal(far.hp, hp[2], `${id}: 1.05 away is out`);
    assert.equal(u.s.defIgnoreFlat ?? 0, id === B ? 100 : 0, `${id}: ART-Y`);
    done(h);
  }
});

test('T1 爆破附着改装: a won roll makes the whole attack with ATK +atk (splash too), a lost one without; one roll per attack', () => {
  for (const id of FORMS) {
    const boost = ACT3.chess[id].talents[0].bb.atk;
    for (const on of [true, false]) {
      const { h, u } = field(id, { skill: 0 });
      forceTalent(h, on);
      const atk0 = u.s.atk;
      const [t, near] = line(h, [6, 6.9]);
      const hp = [t.hp, near.hp];
      h.runUntil(() => t.hp < hp[0], 10);
      h.step();
      const want = on ? atk0 * (1 + boost) : atk0;
      approx(hp[0] - t.hp, want, `${id} ${on}: the struck one`);
      approx(hp[1] - near.hp, want, `${id} ${on}: the splash`);
      h.run(0.5);
      approx(u.s.atk, atk0, `${id} ${on}: the boost is gone after the attack`);
      done(h);
    }
  }
});

test('S1 霰射弹头: the next attack at atk_scale explodes on 2.0; the attack after it is a normal one again', () => {
  for (const id of FORMS) {
    const scale = skillBb(id, 0).atk_scale;
    const { h, u } = field(id, { skill: 0 });
    forceTalent(h, false);
    assert.equal(u.skill.id, 'skchr_meteo_1');
    const [t, mid, out] = line(h, [6, 7.7, 8.2]);
    const hp = [t.hp, mid.hp, out.hp];
    u.skill.gainSp(u.skill.spCost, 'test');
    h.runUntil(() => t.hp < hp[0], 10);
    h.step();
    approx(hp[0] - t.hp, u.s.atk * scale, `${id}: atk_scale`);
    assert.ok(Math.abs(mid.x - t.x) < S1_RADIUS && Math.abs(mid.x - t.x) > 1, 'set-up');
    approx(hp[1] - mid.hp, u.s.atk * scale, `${id}: 1.7 away inside the 2.0 blast`);
    assert.equal(out.hp, hp[2], `${id}: 2.2 away is out`);
    const t1 = t.hp, m1 = mid.hp;
    h.runUntil(() => t.hp < t1, 10);
    h.step();
    approx(t1 - t.hp, u.s.atk, `${id}: the next attack is a normal one`);
    assert.equal(mid.hp, m1, `${id}: the normal splash does not reach 1.7`);
    done(h);
  }
});

test('S2 高爆弹头: one shell at atk_scale on every enemy within 1.2 of its target, each one DEF +def (flat) for duration s', () => {
  for (const id of FORMS) {
    const bb = skillBb(id, 1);
    const { h, u } = field(id, { skill: 1 });
    forceTalent(h, false);
    assert.equal(u.skill.id, 'skchr_meteo_2');
    const [t, mid, out] = line(h, [6, 7.1, 7.4]);
    h.run(0.2);
    const hp = [t.hp, mid.hp, out.hp];
    const atk = u.s.atk;
    u.lastAttackAt = h.b.time; // no normal attack lands in the window below
    cast(u);
    h.runUntil(() => t.hp < hp[0] - atk * bb.atk_scale * 0.99 || mid.hp < hp[1], 5);
    h.step();
    assert.ok(Math.abs(mid.x - t.x) < S2_RADIUS, 'set-up');
    assert.ok(mid.hp <= hp[1] - atk * bb.atk_scale + 1e-6, `${id}: 1.1 away inside the 1.2 blast`);
    const debuff = mid.findBuff(`meteo_s_2:${u.id}`);
    assert.ok(debuff, `${id}: DEF down`);
    assert.equal(debuff.mods.defFlat, bb.def, id);
    assert.ok(debuff.timeLeft > bb.duration - 0.3 && debuff.timeLeft <= bb.duration, `${id}: duration ${debuff.timeLeft}`);
    assert.ok(t.findBuff(`meteo_s_2:${u.id}`), `${id}: on the target too`);
    assert.ok(!out.findBuff(`meteo_s_2:${u.id}`), `${id}: 1.4 away is out`);
    h.run(bb.duration + 0.2);
    assert.ok(!mid.findBuff(`meteo_s_2:${u.id}`), `${id}: over`);
    done(h);
  }
});

test('real match path: her piece fights in a 规程 match', async () => {
  for (const id of FORMS) assert.equal((await realMatch(id, 'char_219_meteo')).skill.id, ACT3.chess[id].skill.skillId);
});
