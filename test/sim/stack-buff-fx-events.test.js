// test/sim/stack-buff-fx-events.test.js — the stack counts the kits send for the official effects that change with a buff's
// stacks (docs/rules/fx.md 「버프 스택 수로 바뀌는 이펙트」, 2026-10-21): the buff is a status (`visible`) and each count change
// an fx 'stacks' { id, buff, n, max, mid? } (render/fxstatus.js STACK_FX); 佩佩 S2's level rides on the status's `fx`, S3's
// hit range on 'stacks' with `tgt`; the held dodges of 赤刃明霄陈 / 蒂比 are statuses. Display only: the golden digests count
// the events by type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const ds = getDefaultSource();
const dummy = (o = {}) => enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, atk: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy(), enemy_weak: dummy({ key: 'enemy_weak', hp: 1 }), enemy_hitter: dummy({ key: 'enemy_hitter', atk: 50, range: 2.5, bat: 1 }) };
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const battle = (units, o = {}) => makeBattle({
  defs: { enemies: ENEMIES }, units, timeLimit: 600, autoFinish: false, captureNoisy: true, seed: o.seed ?? 3, flags: { dpPerSec: 0, dpMax: 999 },
});
/** fx 'stacks' of `buff` on unit `id`: their fields. */
const stacksOf = (h, id, buff) => h.eventsOf('fx').filter((e) => e[1] === 'stacks' && e[4]?.id === id && e[4].buff === buff).map((e) => e[4]);
/** The on (1) / off (0) status events of unit `id` with key `key`, in order. */
const statusOf = (h, id, key) => h.eventsOf('status').filter((e) => e[1] === id && e[2] === key).map((e) => e[3]);
const tbb = (chessId, i) => ds.raw.chess[chessId].talents[i].bb;

test('信仰搅拌机 T1: a status, counted 1 → 3 by her damage', () => {
  const id = 'chess_char_4_01_a';
  const h = battle([{ chessId: id, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(id);
  h.spawn('enemy_dummy', { pos: [10, 5] });
  assert.ok(h.runUntil(() => stacksOf(h, u.id, 'rmixer:t1').length >= 3, 30));
  assert.deepEqual(stacksOf(h, u.id, 'rmixer:t1').slice(0, 3).map((o) => [o.n, o.max]), [[1, 3], [2, 3], [3, 3]]);
  assert.equal(statusOf(h, u.id, 'rmixer:t1')[0], 1);
});

test('夕 T1 化境: a status counted by her kills, with max_stack_cnt', () => {
  const id = 'chess_char_5_12_a';
  const h = battle([{ chessId: id, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(id);
  h.spawn('enemy_weak', { pos: [10, 5] });
  assert.ok(h.runUntil(() => stacksOf(h, u.id, 'dusk:realm').length > 0, 30));
  assert.deepEqual(stacksOf(h, u.id, 'dusk:realm')[0], { id: u.id, buff: 'dusk:realm', n: 1, max: tbb(id, 0).max_stack_cnt });
  assert.deepEqual(statusOf(h, u.id, 'dusk:realm'), [1]);
});

test('塞雷娅 T1 / 洛洛 T1: the stacks they gain over time, each a count', () => {
  for (const [id, key, ti] of [['chess_char_5_11_a', 'saria:suit', 0], ['chess_char_2_10_a', 'rockr:rock', 0]]) {
    const h = battle([{ chessId: id, row: 10, col: 4 }]);
    h.step();
    const u = h.unit(id), t = tbb(id, ti);
    h.run(t.interval * 2 + 0.5);
    assert.deepEqual(stacksOf(h, u.id, key).map((o) => [o.n, o.max]), [[1, t.max_stack_cnt], [2, t.max_stack_cnt]], key);
    assert.deepEqual(statusOf(h, u.id, key), [1], key);
  }
});

test('玛恩纳 解放者: the ramp counted in seconds with mid_stack_cnt / max_stack_cnt, ended with the skill', () => {
  const id = 'chess_char_5_19_a';
  const h = battle([{ chessId: id, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(id), tb = ds.raw.chess[id].trait.bb;
  h.run(3.5);
  const s = stacksOf(h, u.id, 'trait:libratorRamp');
  assert.deepEqual(s.map((o) => [o.n, o.mid, o.max]), [1, 2, 3].map((n) => [n, tb.mid_stack_cnt, tb.max_stack_cnt]));
  assert.deepEqual(statusOf(h, u.id, 'trait:libratorRamp'), [1]);
  assert.ok(u.skill.activate('test', { free: true }));
  h.runUntil(() => !u.skill.active, 60);
  assert.deepEqual(statusOf(h, u.id, 'trait:libratorRamp'), [1, 0], 'the skill end resets the ramp');
});

test('妮芙 T2 窥心钥: counted with max_stack_cnt (tier 5) / stack_cnt_check (tier 6 module)', () => {
  const h = battle([{ chessId: 'chess_char_5_22_a', row: 10, col: 4 }]);
  h.step();
  const u = h.unit('chess_char_5_22_a');
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  h.b.emit('elementBurst', { element: 'apoptosis', target: e, source: u });
  assert.deepEqual(stacksOf(h, u.id, 'nymph:key').map((o) => [o.n, o.max]), [[1, tbb('chess_char_5_22_a', 1).max_stack_cnt]]);
  assert.deepEqual(statusOf(h, u.id, 'nymph:key'), [1]);
});

test('琳琅诗怀雅 T1 大买家: a status counted per trait payment during the skill', () => {
  const id = 'chess_char_3_04_a';
  const h = battle([{ chessId: id, row: 10, col: 4, skillIndex: 2 }]);
  h.step();
  const u = h.unit(id);
  h.b.getPlayer(u.ownerId).dp = 99; // her trait pays 费用 every few seconds (else she leaves)
  h.spawn('enemy_dummy', { pos: [10, 5] });
  assert.ok(u.skill.active || u.skill.activate('test', { free: true }));
  assert.ok(h.runUntil(() => stacksOf(h, u.id, 'talent:swire2_buyer').length >= 2 || !u.skill.active, 30), 'payments during the skill');
  const s = stacksOf(h, u.id, 'talent:swire2_buyer');
  assert.ok(s.length >= 1);
  assert.deepEqual(s.map((o) => o.n), s.map((_, i) => i + 1));
  assert.equal(s[0].max, tbb(id, 0).max_stack_cnt);
  assert.deepEqual(statusOf(h, u.id, 'talent:swire2_buyer'), [1]);
});

test('阿斯卡纶 T1: the enemy\'s stacks of her mark, with its applier', () => {
  const h = battle([{ uid: 1, diy: { slot: SLOT[6], charId: 'char_4132_ascln', skillIndex: 0 }, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(1), e = h.spawn('enemy_dummy', { pos: [10, 5] });
  const key = `ascln:judg:${u.id}`;
  assert.ok(h.runUntil(() => stacksOf(h, e.id, key).length > 0, 30));
  const s = stacksOf(h, e.id, key);
  assert.equal(s[0].n, 1);
  assert.equal(s[0].src, u.id);
  assert.ok(s.every((o, i) => i === 0 || o.n !== s[i - 1].n), 'sent when the count changes');
});

test('佩佩 S2: the level effect from the second cast (cnt left ≤ 1 → 1, ≤ 0 → 3), on the status\'s fx', () => {
  const id = 'chess_char_6_06_a';
  const h = battle([{ chessId: id, row: 10, col: 4, skillIndex: 1 }]);
  h.step();
  const u = h.unit(id);
  assert.equal(u.skill.id, 'skchr_pepe_2');
  const levels = [];
  for (let i = 0; i < 3; i++) {
    assert.ok(u.skill.activate('test', { free: true }));
    const on = h.eventsOf('status').filter((e) => e[1] === u.id && e[2] === 'pepe:rage' && e[3] === 1);
    levels.push(on.length > i - 1 && i > 0 ? on[i - 1][5]?.fx : null);
    h.runUntil(() => !u.skill.active, 60);
  }
  assert.deepEqual(levels, [null, 1, 3]);
  assert.deepEqual(statusOf(h, u.id, 'pepe:rage'), [1, 0, 1, 0]);
});

test('佩佩 S3: each attack sends her stacks before it to the main target (`tgt`)', () => {
  const id = 'chess_char_6_06_a';
  const h = battle([{ chessId: id, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(id), e = h.spawn('enemy_dummy', { pos: [10, 5] });
  const max = u.def.skill.bb['attack@max_stack_cnt'];
  assert.ok(u.skill.activate('test', { free: true }));
  assert.ok(h.runUntil(() => stacksOf(h, u.id, 'pepe:tremor').length >= max + 1, 30));
  const s = stacksOf(h, u.id, 'pepe:tremor');
  assert.deepEqual(s.slice(0, max + 1).map((o) => o.n), [...Array(max).keys(), max]);
  assert.ok(s.every((o) => o.tgt === e.id && o.max === max));
});

test('赤刃明霄陈 T2: the held dodge is a status from its heal (evadeReady) until a dodge uses it', () => {
  const h = battle([{ uid: 1, diy: { slot: SLOT[6], charId: 'char_1050_chen3', skillIndex: 0 }, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(1);
  const T = u.def.talents[1].bb.stack_time;
  assert.ok(h.runUntil(() => statusOf(h, u.id, 'chen3:evade').length > 0, T + 1));
  assert.equal(h.eventsOf('fx').filter((e) => e[1] === 'evadeReady' && e[4]?.id === u.id).length, 1);
  u.s.dodgePhys = 0;
  h.spawn('enemy_hitter', { pos: [10, 5] });
  assert.ok(h.runUntil(() => statusOf(h, u.id, 'chen3:evade').length > 1, 10));
  assert.deepEqual(statusOf(h, u.id, 'chen3:evade'), [1, 0]);
});

test('蒂比 T: the held dodge is a status while ready (stack_time s after deployment), gone when a damage takes it', () => {
  const id = 'chess_char_2_13_a';
  const h = battle([{ chessId: id, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(id);
  h.run(0.2);
  assert.deepEqual(statusOf(h, u.id, 'tippi:evade'), [], 'not ready at deployment');
  const T = u.def.talents[0].bb.stack_time;
  assert.ok(h.runUntil(() => statusOf(h, u.id, 'tippi:evade').length > 0, T + 1));
  assert.deepEqual(statusOf(h, u.id, 'tippi:evade'), [1]);
  h.spawn('enemy_hitter', { pos: [10, 5] });
  assert.ok(h.runUntil(() => statusOf(h, u.id, 'tippi:evade').length > 1, 10));
  assert.deepEqual(statusOf(h, u.id, 'tippi:evade').slice(0, 2), [1, 0]);
});
