// test/sim/talent-fx-events.test.js — what the kits tell the client of their talents' official effects (docs/rules/fx.md
// 「재능 버프·시전 이펙트」, 2026-10-16): talent buffs sent as statuses (`visible`: render/fxstatus.js KEY_FX), the talent casts
// ('talent' / 'kitHit': render/fx/kitofficial.js) and 烛煌 S2's burning tiles ('burnTiles'). Display only: the golden digests
// count them by type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const ds = getDefaultSource();

const dummy = (o = {}) => enemyRec({ key: 'enemy_dummy', hp: 1e8, speed: 0, atk: 0, ...o });
const battle = (units, o = {}) => makeBattle({
  defs: { enemies: { enemy_dummy: dummy(), enemy_weak: dummy({ key: 'enemy_weak', hp: 1 }) } }, units, timeLimit: 300, autoFinish: false, captureNoisy: true, seed: o.seed ?? 3,
});
const fxOf = (h, name, pred = () => true) => h.eventsOf('fx').filter((e) => e[1] === name && pred(e[4])).map((e) => e[4]);
/** The on (1) / off (0) status events of unit `id` with key `key`, in order. */
const statusOf = (h, id, key) => h.eventsOf('status').filter((e) => e[1] === id && e[2] === key).map((e) => e[3]);

test('纯烬 氤氲: the heal-over-time on the healed ally is a status (agoat2_recover_01)', () => {
  const id = 'chess_char_6_20_a', ally = 'chess_char_2_02_a';
  const h = battle([{ chessId: id, row: 10, col: 4 }, { chessId: ally, row: 10, col: 5 }]);
  h.step();
  const u = h.unit(id), a = h.unit(ally);
  a.hp = a.s.maxHp * 0.3;
  assert.ok(h.runUntil(() => statusOf(h, a.id, `agoat2:mist:${u.id}`).length > 0, 10));
  assert.equal(statusOf(h, a.id, `agoat2:mist:${u.id}`)[0], 1);
});

test('异客 机理分析 / 深律 T1: the mark and the damage over time on the enemy are statuses', () => {
  for (const [id, key] of [['chess_char_6_05_a', 'pasngr:enhance'], ['chess_char_1_04_a', 'udflow:dot']]) {
    const h = battle([{ chessId: id, row: 10, col: 4 }]);
    h.step();
    const u = h.unit(id), e = h.spawn('enemy_dummy', { pos: [10, 5] });
    assert.ok(h.runUntil(() => statusOf(h, e.id, `${key}:${u.id}`).length > 0, 15), key);
  }
});

test('迷迭香 感知稳定: her and the 术师\'s ATK buff are statuses (rosmon_buff_01_start)', () => {
  const id = 'chess_char_6_12_a', caster = 'chess_char_1_03_a';
  const h = battle([{ chessId: id, row: 10, col: 4 }, { chessId: caster, row: 10, col: 6 }]);
  h.step();
  h.run(0.5);
  const u = h.unit(id), c = h.unit(caster);
  assert.equal(c.def.profession, 'CASTER');
  assert.deepEqual(statusOf(h, u.id, 'rosmon:stable'), [1]);
  assert.deepEqual(statusOf(h, c.id, 'rosmon:stable'), [1]);
});

test('夕 点睛: pending from the deploy until the summon', () => {
  const id = 'chess_char_5_12_a';
  const h = battle([{ chessId: id, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(id);
  assert.deepEqual(statusOf(h, u.id, 'dusk:pending'), [1]);
  h.spawn('enemy_dummy', { pos: [10, 5] });
  assert.ok(h.runUntil(() => u.mem.duskSummoned, 15));
  assert.deepEqual(statusOf(h, u.id, 'dusk:pending'), [1, 0]);
});

test('溯光星源 数据建模: halo2_talent_01 until the stacks are full, then halo2_talent_02', () => {
  const id = 'chess_char_6_16_a';
  const h = battle([{ chessId: id, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(id), e = h.spawn('enemy_dummy', { pos: [10, 5] });
  assert.deepEqual(statusOf(h, u.id, 'halo2:t2'), [1]);
  const max = ds.raw.chess[id].talents[0].bb.max_stack_cnt;
  for (let i = 0; i < max; i++) { h.b.applyStatus(e, 'sluggish', { duration: 0.1, source: u }); h.run(0.2); }
  assert.deepEqual(statusOf(h, u.id, 'halo2:t2'), [1, 0]);
  assert.deepEqual(statusOf(h, u.id, 'halo2:t2full'), [1]);
});

test('缄默德克萨斯: 剑术 and the recast effect until her first kill', () => {
  const id = 'chess_char_4_16_a';
  const h = battle([{ chessId: id, row: 10, col: 4, skillIndex: 0 }]);
  h.step();
  const u = h.unit(id);
  u.skill.sp = 0;
  assert.deepEqual(statusOf(h, u.id, 'texas2:swordplay'), [1]);
  assert.deepEqual(statusOf(h, u.id, 'texas2:recast'), [1]);
  h.spawn('enemy_weak', { pos: [10, 5] });
  assert.ok(h.runUntil(() => u.mem.texasKilled, 15));
  h.run(0.1);
  assert.deepEqual(statusOf(h, u.id, 'texas2:swordplay'), [1, 0]);
  assert.deepEqual(statusOf(h, u.id, 'texas2:recast'), [1, 0]);
});

test("卡涅利安 生命之餐: a 'talent' meal at each skill start, charged with every charge", () => {
  const id = 'chess_char_4_24_a';
  const h = battle([{ chessId: id, row: 10, col: 4, skillIndex: 0 }]);
  h.step();
  const u = h.unit(id);
  u.skill.sp = 0;
  u.skill.addCharge(2);
  assert.ok(u.skill.activate('test'));
  h.run(0.1);
  assert.deepEqual(fxOf(h, 'talent', (o) => o.id === u.id).map((o) => [o.name, o.charged]), [['meal', 1]]);
});

test("风笛 精密填弹: a 'talent' splash on the extra enemy of a boosted attack", () => {
  const id = 'chess_char_4_07_a';
  const h = battle([{ chessId: id, row: 10, col: 4 }], { seed: 5 });
  h.step();
  const u = h.unit(id), a = h.spawn('enemy_dummy', { pos: [10, 5] }), b = h.spawn('enemy_dummy', { pos: [10, 5] });
  assert.ok(h.runUntil(() => fxOf(h, 'talent', (o) => o.src === u.id).length > 0, 60));
  const s = fxOf(h, 'talent', (o) => o.src === u.id)[0];
  assert.equal(s.name, 'splash');
  assert.ok([a.id, b.id].includes(s.id));
});

test("烛煌 S2: each tile set burning once ('burnTiles' on), all of them off at the skill's end", () => {
  const id = 'chess_char_5_03_a';
  const h = battle([{ chessId: id, row: 10, col: 4, skillIndex: 1 }]);
  h.step();
  const u = h.unit(id);
  h.spawn('enemy_dummy', { pos: [10, 5] });
  assert.ok(u.skill.activate('test', { free: true }));
  h.run(3);
  const on = fxOf(h, 'burnTiles', (o) => o.id === u.id);
  assert.deepEqual(on.map((o) => o.cells), [[[5, 10, 1]]], 'one event per new tile');
  assert.ok(h.runUntil(() => !u.skill.active, 60));
  assert.deepEqual(fxOf(h, 'burnTiles', (o) => o.id === u.id).at(-1).cells, [[5, 10, 0]]);
});

test('Insider 火力支援 (elite): the ally granted the rounds shows it while the grant holds, until Insider leaves', () => {
  const id = 'chess_char_1_01_b', ally = 'chess_char_5_01_a', dur = ds.raw.chess[id].talents[0].bb.duration;
  const h = battle([{ chessId: id, row: 10, col: 4 }, { chessId: ally, row: 10, col: 6 }]);
  h.step();
  const u = h.unit(id), a = h.unit(ally), key = `inside:ammo:${u.id}`;
  h.run(dur + 0.5);
  assert.deepEqual(statusOf(h, a.id, key), [1]);
  h.b.retreat(u);
  h.run(0.5);
  assert.deepEqual(statusOf(h, a.id, key), [1, 0]);
});
