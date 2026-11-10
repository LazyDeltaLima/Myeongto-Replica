// test/content/op_chnut.test.js — 체스트넛 (char_4041_chnut, a tier-1 piece of 规程 (act3autochess); kit ops/op-chnut.js): both forms, both skills.
// Run: node --test test/content/op_chnut.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_1_15_a', B = 'chess_char_1_15_b';
const FORMS = [A, B];
const YAK = 'chess_char_1_02_a';
const skillBb = (id, i) => ACT3.chess[id].skills[i].bb;
const approx = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
/** She faces LEFT at (10, 4): (10, 3) is low ground, (10, 2) high ground, both in her range (and in S2's 3-2 line). */
const LOW = { uid: 2, chessId: YAK, row: 10, col: 3 }, HIGH = { uid: 2, chessId: YAK, row: 10, col: 2 };
const heals = (h, u, a) => h.hooksOf('heal').filter((c) => c.source === u && c.target === a);
/** Wait for her next heal on `a`; returns the 灼燃损伤 it took off. */
function nextHeal(h, u, a) {
  const n = heals(h, u, a).length, g = a.elem.burn;
  assert.ok(h.runUntil(() => heals(h, u, a).length > n, 10), 'a heal');
  return g - a.elem.burn;
}

test('行医 + T1 脚踏实地: a heal recovers ep_heal_ratio × ATK of 元素损伤 (WDM-X raises it), × ep_heal_scale on an ally standing on low ground', () => {
  for (const id of FORMS) {
    const ratio = ACT3.chess[id].trait.bb.ep_heal_ratio, ground = ACT3.chess[id].talents[0].bb.ep_heal_scale;
    for (const [spot, mul] of [[LOW, ground], [HIGH, 1]]) {
      const { h, u } = field(id, { skill: 0, dir: 'LEFT', others: [spot] });
      const a = h.unit(2);
      assert.equal(h.b.grid.isLow(a.tileR, a.tileC), spot === LOW, 'set-up');
      a.elem.burn = 900;
      approx(nextHeal(h, u, a), u.s.atk * ratio * mul, `${id} ${spot.col}`);
      done(h);
    }
  }
});

test('S1 积微成著: at its strike one heal of ATK on the ally her skill picks, its element recovery × trait_scale (the talent too); charges as the table says', () => {
  for (const id of FORMS) {
    const bb = skillBb(id, 0), ratio = ACT3.chess[id].trait.bb.ep_heal_ratio;
    const { h, u } = field(id, { skill: 0, dir: 'LEFT', others: [HIGH] });
    assert.equal(u.skill.id, 'skchr_chnut_1');
    assert.equal(u.skill.maxCharges ?? 1, bb.cnt, `${id}: charges`);
    const a = h.unit(2);
    a.hp = 1; a.elem.burn = 900;
    u.lastAttackAt = h.b.time; u.atkCd = 99;   // her normal heal stays out of the window
    const n = heals(h, u, a).length;
    cast(u);
    h.strike(u);
    h.step();
    const got = heals(h, u, a).slice(n);
    assert.equal(got.length, 1, `${id}: one heal`);
    approx(got[0].amount, u.s.atk, `${id}: ATK`);
    approx(900 - a.elem.burn, u.s.atk * ratio * bb.trait_scale, `${id}: element × trait_scale`);
    done(h);
  }
});

test('S2 厚土迸发: the skill\'s range 3-2, ASPD +attack_speed; a heal on the same ally as the one before it × heal_continuously_scale (HP and element)', () => {
  for (const id of FORMS) {
    const bb = skillBb(id, 1), ratio = ACT3.chess[id].trait.bb.ep_heal_ratio, again = bb['attack@heal_continuously_scale'];
    const { h, u } = field(id, { skill: 1, dir: 'LEFT', others: [HIGH] });
    assert.equal(u.skill.id, 'skchr_chnut_2');
    const a = h.unit(2);
    const aspd0 = u.s.aspd;
    cast(u);
    h.step();
    assert.equal(u.s.aspd, aspd0 + bb.attack_speed, `${id}: ASPD`);
    assert.equal(u.rangeKeys.length, ACT3.chess[id].skills[1].rangeGrid.length, `${id}: range 3-2`);
    a.hp = 1; a.elem.burn = 900;
    const g1 = nextHeal(h, u, a);
    const first = heals(h, u, a).at(-1).amount;
    approx(first, u.s.atk, `${id}: the first heal of the skill, no ally before it`);
    approx(g1, u.s.atk * ratio, `${id}: its element recovery`);
    const g2 = nextHeal(h, u, a);
    approx(heals(h, u, a).at(-1).amount, u.s.atk * again, `${id}: the same ally again`);
    approx(g2, u.s.atk * ratio * again, `${id}: its element recovery too`);
    done(h);
  }
});

test('S2: another ally in between resets it — the heal on a new ally is a plain one', () => {
  const { h, u } = field(B, { skill: 1, dir: 'LEFT', others: [HIGH, { uid: 3, chessId: YAK, row: 10, col: 3 }] });
  const a = h.unit(2), b = h.unit(3);
  cast(u);
  h.step();
  a.hp = 1;
  nextHeal(h, u, a);
  b.hp = 1; a.hp = a.s.maxHp;   // now only b needs her
  nextHeal(h, u, b);
  approx(heals(h, u, b).at(-1).amount, u.s.atk, 'a new ally');
  done(h);
});

test('real match path: her piece fights in a 规程 match', async () => {
  for (const id of FORMS) assert.equal((await realMatch(id, 'char_4041_chnut')).skill.id, ACT3.chess[id].skill.skillId);
});
