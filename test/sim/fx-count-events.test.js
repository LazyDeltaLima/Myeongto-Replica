// test/sim/fx-count-events.test.js — the kit 'fx' events that tell the client a count it draws per layer / stack / charge /
// mote (docs/rules/fx.md 「키트 이벤트의 공식 이펙트」, 2026-10-16): 泥岩's 护盾 layers ('stacks', render/fxstatus.js LAYER_FX),
// 卡涅利安's charges outside her skill ('charges') and her S3 mark's stacks ('stacks', STACK_FX), 魔王's motes ('motes').
// Display only: the golden digests count them by type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const ds = getDefaultSource();
const dummy = (o = {}) => enemyRec({ key: 'enemy_dummy', hp: 1e8, speed: 0, atk: 0, ...o });
const battle = (units, o = {}) => makeBattle({
  defs: { enemies: { enemy_dummy: dummy(), ...(o.enemies || {}) } }, units, timeLimit: 300, autoFinish: false, captureNoisy: true, seed: 3,
});
const fxOf = (h, name, pred = () => true) => h.eventsOf('fx').filter((e) => e[1] === name && pred(e[4])).map((e) => e[4]);

test("泥岩: each layer gained says the count ('stacks' n, max) — on deploy and every interval, none past the cap", () => {
  const id = 'chess_char_4_18_a', t0 = ds.raw.chess[id].talents[0].bb;
  const h = battle([{ chessId: id, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(id);
  h.run(t0.interval * (t0.max_times + 1) + 0.5);
  const st = fxOf(h, 'stacks', (o) => o.id === u.id);
  assert.deepEqual(st.map((o) => [o.buff, o.n, o.max]), [1, 2, 3].map((n) => ['mudrok:layers', n, t0.max_times]));
  // a hit takes one: the parry names the buff (the client: one fewer layer effect, her blackboard's block effect)
  const hitter = h.spawn('enemy_dummy', { pos: [10, 4] });
  hitter.s.atk = 500;
  assert.ok(h.runUntil(() => fxOf(h, 'parry', (o) => o.id === u.id).length > 0, 10));
  assert.equal(fxOf(h, 'parry', (o) => o.id === u.id)[0].buff, 'mudrok:layers');
});

test("卡涅利安: the charges stored outside her skill ('charges' n: 1, 2; −1 while it runs; 0 after)", () => {
  const id = 'chess_char_4_24_a';
  const h = battle([{ chessId: id, row: 10, col: 4, skillIndex: 0 }]);
  h.step();
  const u = h.unit(id);
  u.skill.sp = 0;
  const seen = () => fxOf(h, 'charges', (o) => o.id === u.id).map((o) => o.n);
  u.skill.addCharge(1);
  h.run(0.25);
  u.skill.addCharge(1);
  h.run(0.25);
  assert.ok(u.skill.activate('test'));
  u.skill.charges = 0;
  u.skill.sp = 0;
  h.run(0.25);
  assert.ok(h.runUntil(() => !u.skill.active, 60));
  h.run(0.25);
  assert.deepEqual(seen().slice(0, 4), [1, 2, -1, 0]);
});

test("卡涅利安 S3 charged: each stack of her mark on the enemy ('stacks' n 1…5, src her)", () => {
  const id = 'chess_char_4_24_a';
  const h = battle([{ chessId: id, row: 10, col: 4, skillIndex: 2 }]);
  h.step();
  const u = h.unit(id);
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  u.skill.addCharge(2);
  assert.ok(u.skill.activate('test'));
  u.skill.charges = 0;
  u.skill.sp = 0;
  h.run(10);
  const st = fxOf(h, 'stacks', (o) => o.id === e.id);
  assert.deepEqual(st.map((o) => [o.buff, o.n, o.src]), [1, 2, 3, 4, 5].map((n) => ['billro:mark', n, u.id]), 'none past the cap');
});

test("魔王 (tier 4): the motes there ('motes' n of cap, the skill's look and orbit)", () => {
  const id = 'chess_char_4_25_a', t0 = ds.raw.chess[id].talents[0].bb;
  const h = battle([{ chessId: id, row: 10, col: 4, skillIndex: 1 }, { chessId: 'chess_char_4_17_a', row: 10, col: 5 }]);
  h.step();
  const u = h.unit(id);
  h.run(1);
  const mo = () => fxOf(h, 'motes', (o) => o.id === u.id);
  assert.deepEqual(mo()[0], { id: u.id, n: t0.cnt, cap: t0.cnt, sk: 0, r: t0.range_radius, spd: t0.dynamic_spd });
  assert.equal(mo()[1]?.n, t0.cnt - 1, 'one touched the neighbour');
  assert.ok(u.skill.activate('test', { free: true }));
  h.run(0.3);
  const s2 = mo().find((o) => o.sk === 2);
  assert.equal(s2.cap, t0.cnt + 3);
  assert.equal(s2.r, ds.getChess(id, { skillIndex: 1 }).skill.bb.outside_radius);
});

test("魔王 (tier 5): the motes there ('motes'), all of them under her skill", () => {
  const id = 'chess_char_5_09_a', t0 = ds.raw.chess[id].talents[0].bb;
  const h = battle([{ chessId: id, row: 10, col: 5 }, { chessId: 'chess_char_4_17_a', row: 10, col: 4 }]);
  h.step();
  const u = h.unit(id);
  assert.ok(h.runUntil(() => fxOf(h, 'motes', (o) => o.id === u.id && o.n === t0.cnt - 1).length > 0, 15), 'a mote used');
  assert.deepEqual(fxOf(h, 'motes', (o) => o.id === u.id)[0], { id: u.id, n: t0.cnt, cap: t0.cnt, sk: 0, r: t0.range_radius, spd: t0.dynamic_spd });
  assert.ok(u.skill.activate('test', { free: true }));
  h.run(0.5);
  assert.deepEqual(fxOf(h, 'motes', (o) => o.id === u.id && o.sk === 3).map((o) => o.n), [t0.cnt]);
});
