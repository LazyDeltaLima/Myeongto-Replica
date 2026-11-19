// test/sim/move-born.test.js — a 【移动】 the official client makes through the skills' RespawnCharacter node is a new
// deployment (Character.MoveLikeRespawnSelf → Deck.SpawnCharacterOrToken), so the moved unit is born again: no attack
// until its born state ends (docs/rules/sim.md 「울피아누스 S3의 【이동】은 반드시 일어난다」 이동 때, 「배치 직후(BORN)」).
// 乌尔比安 S3's 【返回】, Mon3tr S3's move and return, 贝洛内 S3's moves and return, 赤刃明霄陈 S2's landing (in place too)
// and 凯尔希·思衡托 S3's landing; a prefab with `_useRealBornTimeFromAnim` (乌尔比安, 贝洛内) is born for the clip its mode
// plays for Born — the kits' constants, held here to the clips' lengths in data/assets.json.
// Run: node --test test/sim/move-born.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { BORN_TIME } from '../../server/sim/constants.js';
import { MOVE_BORN as ULPIA_MOVE, BACK_BORN as ULPIA_BACK } from '../../server/sim/content/kits/ops/chess_char_5_05-ulpia.js';
import { MOVE_BORN as DEMETR_MOVE, BACK_BORN as DEMETR_BACK } from '../../server/sim/content/kits/ops/op-demetr.js';

const REAL = { skip: !hasGeneratedData() };
const ASSETS_URL = new URL('../../data/assets.json', import.meta.url);
const ASSETS = existsSync(ASSETS_URL) ? JSON.parse(readFileSync(ASSETS_URL, 'utf8')) : null;
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b} ± ${eps}, got ${a}`);
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label}: ${e.message}`), []); checkInvariants(h.b); };
const dummy = enemyRec({ key: 'e_d', hp: 1e9, atk: 0, speed: 0, mass: 0, def: 0, res: 0 });
const deploysOf = (h, u) => h.hooksOf('deploy').filter((c) => c.unit === u);
/** The battle time of u's first swing from now (stepping), or null within `limit` s. */
function firstSwing(h, u, limit = 4) {
  const t0 = h.b.time;
  h.events.splice(0);
  while (h.b.time < t0 + limit) {
    h.step();
    if (h.events.splice(0).some((e) => e[0] === 'swing' && e[1] === u.id)) return h.b.time;
  }
  return null;
}
/** Born for `born` s from its last (re)deployment, and no swing before that ends. */
function bornThen(h, u, born, what) {
  close(u.bornUntil - u.deployedAt, born, 1e-9, `${what}: born from the 【移动】`);
  const at = firstSwing(h, u);
  assert.ok(at != null, `${what}: an attack after it`);
  assert.ok(at >= u.bornUntil - 1e-9, `${what}: no attack before the born state ends (${(at - u.deployedAt).toFixed(3)} s after it)`);
}

test('the kits\' born times of a prefab that plays Born at speed 1 are the clips its modes play for Born (data/assets.json)', { skip: !ASSETS }, () => {
  const clip = (charId, name) => ASSETS.chars?.[charId]?.spine?.front?.animations?.[name];
  // 乌尔比安: the move's Born = Skill_3_ReStart_A / _B (ulpia_s3_switch_mode[born]), the return's = Skill_3_Back (mode S3_Restore)
  for (const n of ['Skill_3_ReStart_A', 'Skill_3_ReStart_B']) assert.equal(clip('char_4145_ulpia', n), ULPIA_MOVE, `乌尔比安 ${n} (MOVE_BORN, chess_char_5_05-ulpia.js)`);
  assert.equal(clip('char_4145_ulpia', 'Skill_3_Back'), ULPIA_BACK, '乌尔比安 Skill_3_Back (BACK_BORN, chess_char_5_05-ulpia.js)');
  // 贝洛内: mode S3_Resapwn's Born = Skill_3_ReStart_End, mode S3_Restore's = Skill_3_Back (charpack char_4037_demetr)
  assert.equal(clip('char_4037_demetr', 'Skill_3_ReStart_End'), DEMETR_MOVE, '贝洛内 Skill_3_ReStart_End (MOVE_BORN, op-demetr.js)');
  assert.equal(clip('char_4037_demetr', 'Skill_3_Back'), DEMETR_BACK, '贝洛内 Skill_3_Back (BACK_BORN, op-demetr.js)');
});

test('Battle.moveRedeploy `born`: true = the common born time, seconds = a clip; none while flags.bornTime is 0', () => {
  for (const [bornTime, born, want] of [[BORN_TIME, true, BORN_TIME], [BORN_TIME, 0.3, 0.3], [0, true, 0], [0, 0.5, 0]]) {
    const h = makeBattle({ units: [{ chessId: 'chess_char_1_02_a', uid: 1, row: 10, col: 3 }], autoFinish: false, flags: { bornTime } });
    h.step();
    h.run(2);
    const u = h.unit(1);
    assert.ok(h.b.moveRedeploy(u, 10, 4, { born }));
    close(u.bornUntil - h.b.time, want, 1e-9, `bornTime ${bornTime}, born ${born}`);
    const before = u.bornUntil;
    assert.ok(h.b.moveRedeploy(u, 10, 3));
    assert.equal(u.bornUntil, before, 'without `born` the born state stays as it was');
    done(h);
  }
});

test('乌尔比安 S3: the 【返回】 is born again too — for Skill_3_Back', REAL, () => {
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, units: [{ chessId: 'chess_char_5_05_a', row: 10, col: 3 }],
    enemies: [{ key: 'e_d', pos: [10, 6] }], hooks: ['deploy'], autoFinish: false, timeLimit: 120, flags: { bornTime: BORN_TIME } });
  const u = h.unit('chess_char_5_05_a');
  h.step();
  h.run(3);
  u.skill.gainSp(1000);
  assert.ok(h.runUntil(() => u.skill.active, 2));
  assert.ok(h.runUntil(() => deploysOf(h, u).length === 2, 2), 'the 【移动】');
  close(u.bornUntil - u.deployedAt, ULPIA_MOVE, 1e-9, 'the 【移动】');
  assert.ok(h.runUntil(() => !u.skill.active, 40), 'the skill ends');
  assert.equal(deploysOf(h, u).length, 3, 'the 【返回】');
  assert.deepEqual([u.tileR, u.tileC], [10, 3]);
  close(u.bornUntil - u.deployedAt, ULPIA_BACK, 1e-9, 'the 【返回】');   // (the dummy is out of his reach from home)
  done(h);
});

/** 贝洛内 / Mon3tr with S3 on a dummy (test/sim/instant-cast.test.js's field), the born state on. */
function s3Field(charId, extra) {
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999, bornTime: BORN_TIME },
    captureNoisy: true, hooks: ['deploy'], units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId, skillIndex: 2, uniEquipId: null }, row: 10, col: 5 }, ...extra] });
  h.step();
  const u = h.unit(1);
  h.spawn('e_d', { pos: [9, 7] });
  h.run(3);
  u.skill.gainSp(999);
  assert.ok(u.skill.activate('test'), charId);
  return { h, u };
}

test('Mon3tr S3: the move onto her 重构体 and the return are born again — the common 1 s', () => {
  const { h, u } = s3Field('char_4179_monstr', [{ uid: 2, kind: 'token', tokenId: 'token_10050_monstr_prosts', ownerUid: 1, row: 9, col: 6 }]);
  assert.ok(h.runUntil(() => deploysOf(h, u).length === 2, 3), 'the move');
  assert.deepEqual([u.tileR, u.tileC], [9, 6]);
  bornThen(h, u, BORN_TIME, 'the move');
  assert.ok(h.runUntil(() => !u.skill.active, 60), 'the skill ends');
  assert.equal(deploysOf(h, u).length, 3, 'the return');
  assert.deepEqual([u.tileR, u.tileC], [10, 5]);
  close(u.bornUntil - u.deployedAt, BORN_TIME, 1e-9, 'the return');
  done(h);
});

test('贝洛内 S3: each 【移动】 is born for Skill_3_ReStart_End, the 【返回】 for Skill_3_Back', () => {
  const { h, u } = s3Field('char_4037_demetr', []);
  assert.ok(h.runUntil(() => deploysOf(h, u).length === 2, 3), 'the first 【移动】');
  assert.deepEqual([u.tileR, u.tileC], [9, 7]);
  bornThen(h, u, DEMETR_MOVE, 'the first 【移动】');
  assert.ok(h.runUntil(() => !u.skill.active, 60), 'the skill ends');
  assert.ok(h.runUntil(() => u.tileR === 10 && u.tileC === 5, 1), 'the 【返回】 (after RespawnEnd\'s clip)');
  close(u.bornUntil - u.deployedAt, DEMETR_BACK, 1e-9, 'the 【返回】');
  done(h);
});

const CHEN3 = { uid: 1, diy: { slot: 6, charId: 'char_1050_chen3', skillIndex: 1, uniEquipId: 'uniequip_002_chen3' }, elite: true, row: 10, col: 4 };
const slashing = (u) => !!u.findBuff('chen3:s2:inv');
function chen3Field() {
  const h = makeBattle({ seed: 5, timeLimit: 900, autoFinish: false, captureNoisy: true, defs: { enemies: { e_d: dummy } }, hooks: ['deploy'],
    flags: { dpPerSec: 0, dpMax: 999, bornTime: BORN_TIME }, units: [CHEN3] });
  h.step();
  h.run(2);
  return { h, u: h.unit(1) };
}

test('赤刃明霄陈 S2: she lands on a standing target\'s tile born again (the common 1 s)', () => {
  const { h, u } = chen3Field();
  h.spawn('e_d', { pos: [10, 6] });
  u.skill.activate('manual', { free: true });
  h.run(0.2);
  assert.ok(slashing(u));
  assert.ok(h.runUntil(() => !slashing(u), 10));
  assert.equal(deploysOf(h, u).length, 2, 'the 【移动】');
  assert.deepEqual([u.tileR, u.tileC], [10, 6]);
  bornThen(h, u, BORN_TIME, 'the landing');
  done(h);
});

test('赤刃明霄陈 S2: her target gone and no other, she is respawned where she stands (chen3_s2[try_resapwn] `_respawnInSameTile`), born again', () => {
  const { h, u } = chen3Field();
  const e = h.spawn('e_d', { pos: [10, 5] });
  u.skill.activate('manual', { free: true });
  h.run(0.2);
  assert.ok(slashing(u));
  h.b.kill(e, null);
  assert.ok(h.runUntil(() => !slashing(u), 10));
  assert.equal(deploysOf(h, u).length, 2, 'a 【移动】 where she stands');
  assert.deepEqual([u.tileR, u.tileC], [10, 4]);
  close(u.bornUntil - u.deployedAt, BORN_TIME, 1e-9, 'born again');
  done(h);
});

test('凯尔希·思衡托 S3: she lands on her anchor born again (the common 1 s, with her landing clip\'s disarm)', () => {
  const units = [{ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId: 'char_1052_kalts2', skillIndex: 2 }, elite: true, row: 10, col: 4 },
    { uid: 2, kind: 'token', tokenId: 'token_10068_kalts2_mtship', ownerUid: 1, row: 10, col: 9, dir: 'UP' },
    { uid: 3, chessId: 'chess_char_1_02_a', row: 11, col: 5 }];
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 300, autoFinish: false, seed: 5, hooks: ['deploy'],
    flags: { dpInit: 99, dpPerSec: 0, dpMax: 999, bornTime: BORN_TIME }, captureNoisy: true, units });
  h.step();
  h.run(2);
  const u = h.unit(1);
  u.skill.gainSp(999);
  h.unit(3).hp = h.unit(3).s.maxHp * 0.3;   // someone to heal: her S3 casts (op_kalts2.test.js)
  assert.ok(h.runUntil(() => u.mem.k2flight, 5), 'the flight');
  assert.ok(h.runUntil(() => !u.hidden, 5), 'the landing');
  assert.deepEqual([u.tileR, u.tileC], [10, 9]);
  close(u.bornUntil - u.deployedAt, BORN_TIME, 1e-9, 'born again');
  done(h);
});
