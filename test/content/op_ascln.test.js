// test/content/op_ascln.test.js — 阿斯卡纶 (char_4132_ascln, 6★ 伏击客; kit server/sim/content/kits/ops/op-ascln.js, our
// 선발 kit that replaced upstream's): the trait 伏击客 — every ground enemy of her y-1 per attack, her dodge — fielded the
// production way (a DIY slot + its `diy` pick). Upstream's assertions of its own kit are gone; her mechanics as this server
// plays them: test/local-patch-diy.test.js.
// Run: node --test test/content/op_ascln.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const ASC = 'char_4132_ascln';
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const AY = 'uniequip_003_ascln';
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_weak: dummy('enemy_weak', { hp: 10 }),
  enemy_hitter: dummy('enemy_hitter', { atk: 200, range: 1.5, bat: 0.5 }),
  enemy_walkslow: enemyRec({ key: 'enemy_walkslow', hp: 1e9, speed: 1, mass: 0 }),
};

/** 阿斯卡纶 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'attack', 'heal', 'dodge'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: ASC, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** Keep her from casting (no SP). */
function noSkill(h, u) {
  u.skill.charges = 0; u.skill.sp = 0;
  h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });
}

test('trait 伏击客: one attack strikes every ground enemy of her y-1 at once (physical), never a flyer; her dodge lets 50 % (AMB-Y 65 %) of the enemy hits through as dodges', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, AY]]) {
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    noSkill(h, u);
    const a = h.spawn('enemy_dummy', { pos: [10, 6] }), b = h.spawn('enemy_dummy', { pos: [11, 4] }), c = h.spawn('enemy_dummy', { pos: [10, 7] });
    const fly = h.spawn('enemy_fly', { pos: [9, 5] });
    assert.ok(h.runUntil(() => atkHits(h, u).length >= 3, 6));
    const id = atkHits(h, u)[0].dmg.attackId;
    const hit = atkHits(h, u).filter((x) => x.dmg.attackId === id);
    assert.deepEqual(new Set(hit.map((x) => x.target)), new Set([a, b, c]), `T${tier}: every ground enemy of y-1 ([0,2] included)`);
    for (const x of hit) assert.equal(x.type, 'phys');
    assert.ok(!atkHits(h, u).some((x) => x.target === fly), 'never the flyer');
    // her dodge
    const hitter = h.spawn('enemy_hitter', { pos: [10, 6] });
    h.b.addBuff(u, { key: 'test:inv', mods: { defFlat: 1e6 } });
    h.run(200);
    const dodged = h.hooksOf('dodge').filter((x) => x.target === u && x.source === hitter).length;
    const landed = h.hooksOf('damaged').filter((x) => x.target === u && x.source === hitter).length;
    const r = dodged / (dodged + landed);
    assert.ok(dodged + landed > 200 && Math.abs(r - (mod === AY ? 0.65 : 0.5)) < 0.06, `T${tier}: dodge rate ${r}`);
    done(h);
  }
});
