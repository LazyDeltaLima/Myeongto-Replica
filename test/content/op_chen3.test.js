// test/content/op_chen3.test.js — 赤刃明霄陈 (char_1050_chen3, 6★ 术战者; kit server/sim/content/kits/ops/op-chen3.js, our
// 선발 kit that replaced upstream's) in every 自选 form — tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite
// (E2 Lv60, rank 7) with no module or AFT-X “记忆残页” at stage 1 (tier 5) / 3 (tier 6): the form's stats and module
// attributes, her profile and the pick's legality. Upstream's assertions of its own kit's mechanics are gone; her
// mechanics as this server plays them: test/local-patch-diy.test.js. Numbers from data/backups.json.
// Run: node --test test/content/op_chen3.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const CHEN3 = 'char_1050_chen3';
const FORMS = BACKUPS.units[CHEN3].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const AFTX = 'uniequip_002_chen3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'),
  enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_frail: dummy('enemy_frail', { hp: 2000 }),
  enemy_mid: dummy('enemy_mid', { hp: 10000 }),
  enemy_big: dummy('enemy_big', { hp: 1e6 }),
  enemy_flymid: dummy('enemy_flymid', { hp: 10000, motion: 'FLY' }),
  enemy_mage: dummy('enemy_mage', { res: 60 }),
  enemy_tank: dummy('enemy_tank', { def: 5000 }),
  enemy_shooter: dummy('enemy_shooter', { atk: 100, range: 2.5, bat: 1 }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, AFTX].map((m) => [t, true, m]))];

/** A battle with 赤刃明霄陈 as uid 1 at (row, col) facing RIGHT. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, seed = 5, others = [] } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 },
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: CHEN3, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

test('赤刃明霄陈 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 1-1, blocks 1, melee arts ground-only, 炎, no 特质, ground enemies can target her', () => {
  assert.equal(OPERATOR_KITS[CHEN3], KITS[CHEN3]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [CHEN3, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.sub, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat], [1, 'artsfghter', 'melee', false, 'arts', 1.25], `${label(f)}: 术战者`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([form.tokens, form.displayTokens, u.def.raw.tokens], [[], [], []], `${label(f)}: no summons`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // E2 Lv1 2211 / 542 / 352, E2 Lv60 2674 / 627 / 400; AFT-X +240 / +30 → +420 / +60 (HP / ATK)
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [2211, 542, 2674, 627]);
  assert.deepEqual([modOf(5, AFTX).attr, modOf(6, AFTX).attr], [{ maxHp: 240, atk: 30 }, { maxHp: 420, atk: 60 }]);
});

test('a 自选 pick: 赤刃明霄陈 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(CHEN3));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(CHEN3), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: CHEN3, skillIndex: 1, uniEquipId: AFTX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: CHEN3, skillIndex: 1, uniEquipId: AFTX } } });
});
