// test/sim/feedback5-cb3-pins.test.js — community reports of 2026-10-06 that this tree already answers (stream CB3; they pass
// on the parent commit — nothing changed for them), pinned:
//   item 2 「敌人在干员铃兰技能范围内没有开技能，在攻击范围才开」 — 铃兰's default S3 狐火渺然 ("攻击范围扩大") was on the basic
//     strategy up to 0.1.4 (DEFAULT: an enemy in her own 2-tile range); 0.2.0's ACTIVE_RANGE (the owner's rule of 2026-10-05,
//     tools/build-data.mjs resolveTrigger) casts it with an enemy inside its running range y-8 (3 tiles ahead).
//   item 16.1 「突袭转职玛恩纳…攻击范围里有怪的时候即使长时间没攻击也不会突袭」 — 2026-10-10, the client buff graph
//     act1autochess_bond_eff_raid[attack]: the 10 s no-attack jump has no range condition (only the skill-ready way checks
//     the own / front tile), so a 解放者 — no attack with his skill off — jumps every 10 s whatever is in his range.
//   item 16.4 「归鲨被吃的时候不是变替身而是进了再部署」 — an 阿戈尔 devour mark on 归溟幽灵鲨 switches her to her 替身 (normal, 联防,
//     boss fields); never a knock-out (a sweep of 400 random chains on this tree and v0.1.2–v0.1.4: 0).
//   item 46 「荒芜拉普兰德开技能之后好像没有普攻了…叙拉古恐惧概率不高」 — during her default S3 every drone is out chasing (PRTS
//     技能流程), and she keeps attacking: one ATK × 1.0 body hit per attack without drone additions (the client's S3 mode
//     `Body/Attack`; this pin said "no attack of her own" until the bug report of 2026-10-23); the additions come back when
//     it ends. 叙拉古 6's proc is PRTS's pseudo-random
//     rule: 0.139 % per 普通伤害 attempt, +0.139 % per miss, shared by the player's members (3 % on average).
// Run: node --test test/sim/feedback5-cb3-pins.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { prdConstant } from '../../server/sim/content/bonds/core.js';

const ds = getDefaultSource();
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, atk: 0, ...o });

test('item 2 — 铃兰 S3 狐火渺然: DEFAULT on its rangeId y-8 (client basic strategy, maintainer decision 2026-10-11; ACTIVE_RANGE before); casts with an enemy 3 tiles ahead (outside her own range), not 4', () => {
  for (const id of ['chess_char_5_10_a', 'chess_char_5_10_b']) {
    const rec = ds.rawChess(id);
    const s3 = rec.skills.find((s) => s.skillId === 'skchr_lisa_3');
    assert.deepEqual([rec.skill.skillId, s3.trigger.rule, s3.trigger.rawRule], ['skchr_lisa_3', 'DEFAULT', 'DEFAULT'], `${id}: her default S3`);
    assert.ok(!rec.rangeGrid.some(([r, c]) => r === 0 && c === 3) && s3.trigger.customRangeGrid.some(([r, c]) => r === 0 && c === 3), `${id}: 3 ahead is in y-8 only`);
    const casts = (pos) => {
      const h = makeBattle({ seed: 3, autoFinish: false, timeLimit: 60, defs: { enemies: { enemy_pin: dummy('enemy_pin') } }, units: [{ chessId: id, row: 10, col: 4 }] });
      h.step();
      const u = h.unit(id);
      u.skill.gainSp(999, 'test');
      h.spawn('enemy_pin', { pos });
      h.run(3);
      checkInvariants(h.b);
      return u.skill.activations;
    };
    assert.equal(casts([10, 7]), 1, `${id}: 3 tiles ahead`);
    assert.equal(casts([10, 8]), 0, `${id}: not 4 tiles ahead`);
  }
});

test('item 16.1 — a 突袭 玛恩纳 (变形同构体 + 突袭手雷): 10 s without an attack → he jumps, an enemy in his range or not ([attack] graph)', () => {
  const h = makeBattle({
    seed: 5, autoFinish: false, timeLimit: 120, hooks: ['deploy'], bonds: { raidShip: { count: 3, active: true, tier: 1, layers: 1 } },
    defs: { enemies: { enemy_pin: dummy('enemy_pin') } },
    units: [{ chessId: 'chess_char_5_19_a', row: 10, col: 4, items: ['chess_item_6_09_e_a', 'chess_item_3_11_e_a'] }],
  });
  h.step();
  const u = h.unit('chess_char_5_19_a');
  const near = h.spawn('enemy_pin', { pos: [10, 5] });
  h.spawn('enemy_pin', { pos: [12, 8] });
  const jumps = () => h.hooksOf('deploy').filter((c) => c.unit === u && !c.initial).length;
  assert.ok(near.alive);
  h.run(9.5);
  assert.equal(u.lastAttackAt, -Infinity, 'a 解放者 makes no attack with his skill off (his 10 s are met)');
  assert.equal(jumps(), 0, 'not before 10 s');
  assert.ok(h.runUntil(() => jumps() > 0, 1.5), 'the 10 s no-attack jump, though an enemy stands in his range');
  checkInvariants(h.b);
});

test('item 16.4 — 归溟幽灵鲨 devoured by an 阿戈尔 (normal, 联防, boss): her 替身 at full HP, never knocked out', () => {
  for (const kind of ['normal', 'unite', 'boss']) {
    for (const g of ['chess_char_5_13_a', 'chess_char_5_13_b']) {
      const row = kind === 'boss' ? 2 : 10;
      const h = makeBattle({
        kind, seed: 4, autoFinish: false, timeLimit: 60, captureNoisy: true, hooks: ['damaged', 'death'],
        bonds: { egirShip: { count: 2, active: true, tier: 1, layers: 0 } },
        players: [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, kind: 'chess', chessId: 'chess_char_2_07_a', row: kind === 'boss' ? 9 : 10, col: 4 }, { uid: 2, kind: 'chess', chessId: g, row: kind === 'boss' ? 9 : 10, col: 5 }], bonds: { egirShip: { count: 2, active: true, tier: 1, layers: 0 } } }],
      });
      h.step();
      const u = h.unit(g);
      assert.equal(u.tileR, row, `${kind}: on the field`);
      assert.equal(h.hooksOf('damaged').filter((c) => c.target === u && (c.dmg?.tags || []).includes('bond:egir:devour')).length, 1, `${kind} ${g}: one devour mark`);
      assert.ok(u.alive && u.trait.doll && u.form === 'doll', `${kind} ${g}: her 替身`);
      assert.ok(Math.abs(u.hp - u.s.maxHp) < 1e-6, `${kind} ${g}: at full HP`);
      assert.equal(h.hooksOf('death').filter((c) => c.unit === u).length, 0, `${kind} ${g}: no knock-out`);
      checkInvariants(h.b);
    }
  }
});

test('item 46 — 荒芜拉普兰德 S3: she attacks while her drones are out (they hit too) — body hits only, the drone additions back after; 叙拉古 6 = PRTS\'s 0.139 % pseudo-random', () => {
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 120, captureNoisy: true, hooks: ['attack', 'damaged', 'skillStart', 'skillEnd'],
    defs: { enemies: { enemy_pin: dummy('enemy_pin', { atk: 50 }) } }, units: [{ chessId: 'chess_char_6_18_a', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_pin', pos: [10, 4] }],
  });
  const u = () => h.unit('chess_char_6_18_a');
  assert.ok(h.runUntil(() => u().skill.active, 60), 'S3 cast');
  const t0 = h.b.time;
  const attacks = () => h.hooksOf('attack').filter((c) => c.attacker === u()).length;
  assert.ok(h.runUntil(() => !u().skill.active, 45), 'S3 over');
  const t1 = h.hooksOf('skillEnd').filter((c) => c.unit === u()).at(-1).t;
  const n0 = attacks();
  const inS3 = (c) => c.source === u() && c.t > t0 + 1e-9 && c.t < t1 - 1e-9;
  const funnel = (c) => (c.dmg.tags || []).includes('funnel');
  assert.ok(h.hooksOf('attack').filter((c) => c.attacker === u() && c.t > t0 + 1e-9 && c.t < t1 - 1e-9).length >= 20, 'she attacks during S3');
  assert.ok(h.hooksOf('damaged').some((c) => inS3(c) && c.dmg.isAttack), 'her body hits land');
  assert.equal(h.hooksOf('damaged').filter((c) => inS3(c) && funnel(c)).length, 0, 'no drone additions while the drones are out');
  assert.ok(h.hooksOf('damaged').some((c) => c.source === u() && c.t > t0 && (c.dmg.tags || []).includes('droneAttack')), 'her drones hit');
  h.run(5);
  assert.ok(attacks() > n0, 'her attacks go on after the skill');
  assert.ok(h.hooksOf('damaged').some((c) => c.source === u() && c.t > t1 + 1 && funnel(c)), 'with the drone additions again');
  checkInvariants(h.b);
  const c = prdConstant(0.03);
  assert.ok(Math.abs(c - 0.00139) < 0.00001, `叙拉古 6 PRD constant ${c} ≈ PRTS 0.139 %`);
  assert.ok(Math.ceil(1 / c) <= 722, 'a proc by the 722nd attempt at the latest (PRTS: 720 with the rounded 0.139 %)');
});
