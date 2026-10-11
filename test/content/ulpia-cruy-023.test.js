// 乌尔比安's second module CRU-Y 「前路」 (uniequip_003_ulpia, official tables of 2026-10-11) — upstream 2e122873's ulpia
// cases (test/content/new-modules-023.test.js there), ported by hand onto our kit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITS } from '../../server/sim/content/kits/index.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const CRUY = 'uniequip_003_ulpia';
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const target = enemyRec({ key: 'dummy', hp: 1e8, speed: 0, def: 0, atk: 0 });

function ulpia({ moduleId = CRUY, potential = 6, stage3 = false } = {}) {
  // The mode's tier-5 elite uses module stage 1 only; the stage-3 talent is exercised with the official CRU-Y stage-3
  // blackboard (battle_equip_table) injected into the talent, without changing the production module level.
  const kits = stage3 ? { chess_char_5_05_a: (bb, raw, def) => {
    const rec = structuredClone(raw);
    rec.talents.find((t) => t.index === 1).bb = {
      max_stack_cnt: potential === 6 ? 10 : 9, max_hp: 150, atk: 38,
      'ulpia_t_1[abyssal].max_hp': 90, 'ulpia_t_1[abyssal].atk': 22.799999,
      'ulpia_t_1[abyssal].max_stack_cnt': potential === 6 ? 10 : 9,
      block_cnt: 1, add_block_cnt_stack_cnt: 9,
    };
    return KITS.chess_char_5_05_a(bb, rec, def);
  } } : undefined;
  const h = makeBattle({ autoFinish: false, kits, defs: { enemies: { dummy: target, victim: enemyRec({ key: 'victim', hp: 1, atk: 0, speed: 0 }) } },
    units: [{ uid: 1, chessId: 'chess_char_5_05_b', row: 10, col: 5, moduleId, skillIndex: 0, potential },
      { uid: 2, chessId: 'chess_char_3_05_a', row: 11, col: 5 },
      { uid: 3, chessId: 'chess_char_1_01_a', row: 9, col: 5 }] });
  h.step(); return { h, u: h.unit(1), hunter: h.unit(2), other: h.unit(3) };
}

test('乌尔比安 elite offers CRU-Y at module stage 1: trait damage_scale 1.1 and the stage-1 stats, talent unchanged', () => {
  const mod = getDefaultSource().rawChess('chess_char_5_05_b').modules.find((m) => m.uniEquipId === CRUY);
  assert.ok(mod, 'CRU-Y is in data/chess.json');
  assert.equal(mod.level, 1);
  assert.equal(mod.typeName, 'CRU-Y');
  assert.deepEqual(mod.attr, { maxHp: 360, atk: 100 });
  assert.equal(mod.traitOverride.bb.damage_scale, 1.1);
  assert.deepEqual(mod.talentChanges, []);
});

test('乌尔比安 CRU-Y scales his damage against enemies blocked by any ally, skill damage included', () => {
  const { h, u, hunter } = ulpia();
  const e = h.spawn('dummy', { pos: [10, 7] });
  const amount = () => h.b.dealDamage(u, e, { amount: 100, type: 'phys', isSkill: true });
  approx(amount(), 100);
  e.blockedBy = hunter; hunter.blocking.push(e);
  approx(amount(), 110);
  // another unit's hits are not scaled
  approx(h.b.dealDamage(hunter, e, { amount: 100, type: 'phys' }), 100);
  e.blockedBy = null; hunter.blocking.length = 0;
  checkInvariants(h.b); assert.equal(h.b.errors.length, 0);
});

test('乌尔比安 CRU-X does not scale damage against blocked enemies', () => {
  const { h, u, hunter } = ulpia({ moduleId: 'uniequip_002_ulpia' });
  const e = h.spawn('dummy', { pos: [10, 7] });
  e.blockedBy = hunter; hunter.blocking.push(e);
  approx(h.b.dealDamage(u, e, { amount: 100, type: 'phys', isSkill: true }), 100);
  e.blockedBy = null; hunter.blocking.length = 0;
});

test('乌尔比安 CRU-Y stage-3 talent: hunters share kill stacks, block +1 at nine, potential cap ten, other operators do not count', () => {
  for (const potential of [1, 6]) {
    const { h, u, hunter, other } = ulpia({ potential, stage3: true });
    const kill = (killer) => h.b.dealDamage(killer, h.spawn('victim', { pos: [10, 8] }), { amount: 100, type: 'true' });
    kill(other); assert.equal(u.findBuff('ulpia:blood'), null);
    const block = u.s.blockCnt;
    for (let n = 1; n <= 12; n++) {
      kill(hunter);
      assert.equal(u.findBuff('ulpia:blood')?.stacks, Math.min(n, potential === 6 ? 10 : 9));
      assert.equal(u.s.blockCnt, block + (n >= 9 ? 1 : 0));
    }
    assert.ok(hunter.findBuff('ulpia:bloodShare'));
    checkInvariants(h.b); assert.equal(h.b.errors.length, 0);
  }
});

test('乌尔比安 at the mode\'s module stage 1 still only gains stacks from his own kills', () => {
  for (const moduleId of [CRUY, 'none']) {
    const { h, u, hunter } = ulpia({ moduleId });
    h.b.dealDamage(hunter, h.spawn('victim', { pos: [10, 8] }), { amount: 100, type: 'true' });
    assert.equal(u.findBuff('ulpia:blood'), null);
    h.b.dealDamage(u, h.spawn('victim', { pos: [10, 8] }), { amount: 100, type: 'true' });
    assert.equal(u.findBuff('ulpia:blood').stacks, 1);
    checkInvariants(h.b); assert.equal(h.b.errors.length, 0);
  }
});
