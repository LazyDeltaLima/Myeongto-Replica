// test/content/op_alga.test.js — 올가 (char_4245_alga, a tier-3 piece of 规程 (act3autochess); kit ops/op-alga.js): both forms, both skills.
// Run: node --test test/content/op_alga.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { enemyRec } from '../helpers/battleHarness.js';
import { S1_DELTA } from '../../server/sim/content/kits/ops/op-alga.js';

const A = 'chess_char_3_26_a', B = 'chess_char_3_26_b';
const FORMS = [A, B];
const S1 = 'skchr_alga_1', S2 = 'skchr_alga_2';
const YAK = 'chess_char_1_02_a';
const skillBb = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const approx = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const ENEMIES = {
  enemy_elite: enemyRec({ key: 'enemy_elite', hp: 1e9, speed: 0, mass: 0, rank: 'ELITE', atk: 300 }),
  enemy_elite_strong: enemyRec({ key: 'enemy_elite_strong', hp: 1e9, speed: 0, mass: 0, rank: 'ELITE', atk: 900 }),
};
const auraOf = (u, src) => u.findBuff(`alga[check_enemy]:${src.id}`);

test('教官: the instructor profile (×atk_scale on an enemy she does not block: 1.2, INS-X 1.3), ground only, her range 2-2', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.profile.unblockedScale, ACT3.chess[id].trait.bb.atk_scale, id);
    assert.equal(u.profile.canHitFly, false, id);
    done(h);
  }
});

test('T1 先声夺人: ATK +atk_up on her and the operators of the 8 tiles around her; + check_enemy with an elite in her range; none 2 tiles away', () => {
  for (const id of FORMS) {
    const t = ACT3.chess[id].talents[0].bb;
    const { h, u } = field(id, { skill: 0, enemies: ENEMIES, others: [{ uid: 2, chessId: YAK, row: 11, col: 3 }, { uid: 3, chessId: YAK, row: 10, col: 2 }] });
    h.run(0.3);
    approx(auraOf(u, u).mods.atkPct, t['alga[atk_up].atk'], `${id}: herself`);
    approx(auraOf(h.unit(2), u).mods.atkPct, t['alga[atk_up].atk'], `${id}: diagonal behind`);
    assert.ok(!auraOf(h.unit(3), u), `${id}: two tiles away`);
    h.spawn('enemy_elite', { pos: [10, 6] });
    h.run(0.3);
    approx(auraOf(h.unit(2), u).mods.atkPct, t['alga[atk_up].atk'] + t['alga[check_enemy].atk'], `${id}: an elite in her range`);
    done(h);
  }
});

test('T1: she attacks the highest-ATK elite / leader enemy of her range first', () => {
  const { h, u } = field(A, { skill: 0, enemies: ENEMIES });
  const plain = h.spawn('enemy_dummy', { pos: [10, 5] });
  const weak = h.spawn('enemy_elite', { pos: [10, 6] });
  const strong = h.spawn('enemy_elite_strong', { pos: [10, 6] });
  const hp = [plain.hp, weak.hp, strong.hp];
  h.run(4);
  assert.ok(strong.hp < hp[2], 'the strongest elite is hit');
  assert.equal(weak.hp, hp[1], 'not the weaker elite');
  assert.ok(u.blocking.includes(plain) || plain.hp === hp[0], 'the plain one only when she blocks it');
  done(h);
});

test('S1 交叉施压: the next attack strikes twice at atk_scale, S1_DELTA apart', () => {
  for (const id of FORMS) {
    const scale = skillBb(id, S1).atk_scale;
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });   // not blocked: ×trait atk_scale
    u.skill.gainSp(u.skill.spCost, 'test');
    const hits = [];
    h.b.on('damaged', (c) => { if (c.source === u && c.target === e) hits.push({ t: h.b.time, a: c.amount }); });
    h.runUntil(() => hits.length >= 2, 10);
    const per = u.s.atk * scale * ACT3.chess[id].trait.bb.atk_scale;
    approx(hits[0].a, per, `${id}: first`);
    approx(hits[1].a, per, `${id}: second`);
    assert.ok(Math.abs(hits[1].t - hits[0].t - S1_DELTA) < 0.05, `${id}: ${hits[1].t - hits[0].t}`);
    done(h);
  }
});

test('S2 只为我的答案: ATK +atk, range 3-2, talent × talent_scale; her hits give 停顿 and taunt +1 for debuff_duration s, one enemy at a time', () => {
  for (const id of FORMS) {
    const bb = skillBb(id, S2), t = ACT3.chess[id].talents[0].bb;
    const { h, u } = field(id, { skill: 1, others: [{ uid: 2, chessId: YAK, row: 11, col: 3 }] });
    assert.equal(u.skill.id, S2);
    const far = h.spawn('enemy_dummy', { pos: [10, 7] });   // only the skill's range reaches it
    h.run(2);
    const hp0 = far.hp;
    assert.equal(far.hp, hp0, 'set-up: out of her range');
    cast(u);
    h.run(0.3);
    approx(auraOf(h.unit(2), u).mods.atkPct, t['alga[atk_up].atk'] * bb.talent_scale, `${id}: talent ×`);
    h.runUntil(() => far.hp < hp0, 5);
    h.step();
    assert.ok(far.hp < hp0, `${id}: reaches 3 tiles`);
    assert.ok(far.hasBuff('sluggish'), `${id}: 停顿`);
    const tb = far.findBuff('alga_2[taunt]');
    assert.equal(tb?.mods.taunt, bb['attack@taunt_level'], `${id}: taunt`);
    // the taunted enemy stays her first target (taunt orders her targets too) until it leaves her range
    const near = h.spawn('enemy_dummy', { pos: [10, 5] });
    far.x += 5;
    h.runUntil(() => near.findBuff('alga_2[taunt]'), 5);
    assert.ok(!far.findBuff('alga_2[taunt]'), `${id}: the taunt moved to her new target`);
    u.skill.end('duration');
    h.run(0.3);
    approx(auraOf(h.unit(2), u).mods.atkPct, t['alga[atk_up].atk'], `${id}: talent back`);
    assert.ok(!near.findBuff('alga_2[taunt]'), `${id}: taunt gone with the skill`);
    done(h);
  }
});

test('real match path: her piece fights in a 规程 match', async () => {
  for (const id of FORMS) assert.equal((await realMatch(id, 'char_4245_alga')).skill.id, ACT3.chess[id].skill.skillId);
});
