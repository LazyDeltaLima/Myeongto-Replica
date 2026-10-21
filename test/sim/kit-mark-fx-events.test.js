// test/sim/kit-mark-fx-events.test.js — 2026-10-21 (docs/rules/fx.md 「안 나오던 공식 이펙트 메우기 — 묶음 D」): the kit events
// the renderer draws official marks from —
//  - 凯尔希·思衡托 S3 (CN client kalts2_s_3[withdraw] / skchr_kalts2_3/Indicator): the take-off names its 待投放 operators
//    (`picks`), and with S3 picked 'kalts2Mark' { ids, off } follows the operators S3OperatorSelector would pick (none while
//    she flies);
//  - 克莱门莎 S2 (clemnt_s2[sync_passenger_info]): 'cabinFull' once when the boarded weight reaches max_passenger_mass;
//  - 秘术师 (深靛): 'mysticStore' carries `n`, the energies stored now;
//  - 圣聆初雪 S2: the frozen protection point's 'summon' names its token.
// Run: node --test test/sim/kit-mark-fx-events.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };
const fxOf = (h, name) => h.eventsOf('fx').filter((e) => e[1] === name).map((e) => e[4]);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, ...o });

const KALTS2 = 'char_1052_kalts2', ANCHOR = 'token_10068_kalts2_mtship';
function kalts({ skill, anchor = null, others = [] }) {
  const units = [{ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId: KALTS2, skillIndex: skill }, elite: true, row: 10, col: 4 }];
  if (anchor) units.push({ uid: 2, kind: 'token', tokenId: ANCHOR, ownerUid: 1, row: anchor.row, col: anchor.col, dir: 'UP' });
  const h = makeBattle({ defs: { enemies: { e: dummy('e') } }, timeLimit: 300, autoFinish: false, seed: 5, flags: { dpInit: 99, dpPerSec: 0, dpMax: 999 },
    captureNoisy: true, units: [...units, ...others] });
  h.step();
  return h;
}
// deployment order: (11,5) → (10,5) → (9,5) (op_kalts2.test.js)
const OTHERS = [{ uid: 3, chessId: 'chess_char_1_02_a', row: 11, col: 5 }, { uid: 4, chessId: 'chess_char_1_08_a', row: 10, col: 5 },
  { uid: 5, chessId: 'chess_char_2_14_a', row: 9, col: 5 }];

test('凯尔希·思衡托 S3 picked: the head marks follow the two latest-deployed operators of her range, none while she flies; the take-off names them', () => {
  const h = kalts({ skill: 2, anchor: { row: 10, col: 9 }, others: OTHERS });
  const u = h.unit(1), tx = h.unit(4), pf = h.unit(5);
  h.run(0.3);
  const first = fxOf(h, 'kalts2Mark');
  assert.equal(first.length, 1, JSON.stringify(first));
  assert.deepEqual([...first[0].ids].sort(), [tx.id, pf.id].sort(), 'the selector\'s two: the last deployed');
  assert.deepEqual(first[0].off, []);
  u.skill.gainSp(999);
  h.unit(3).hp = h.unit(3).s.maxHp * 0.3;   // someone to heal: her S3 casts (op_kalts2.test.js)
  assert.ok(h.runUntil(() => u.mem.k2takeoff, 4));
  const off = fxOf(h, 'kalts2Takeoff').find((o) => o.id === u.id);
  assert.deepEqual([...off.picks].sort(), [tx.id, pf.id].sort(), 'the take-off: its 待投放 operators');
  assert.ok(h.runUntil(() => u.mem.k2flight, 1));
  h.run(0.15);
  const flying = fxOf(h, 'kalts2Mark').at(-1);
  assert.deepEqual(flying.ids, [], 'no mark while she flies (mode s3_transporting)');
  assert.deepEqual([...flying.off].sort(), [tx.id, pf.id].sort());
  const n = fxOf(h, 'kalts2Mark').length;
  assert.ok(h.runUntil(() => !u.hidden, 4));
  assert.equal(fxOf(h, 'kalts2Mark').length, n, 'nothing new until she lands');
  done(h);
});

test('凯尔希·思衡托 with S1 / S2 picked: no head marks', () => {
  for (const skill of [0, 1]) {
    const h = kalts({ skill, others: OTHERS });
    h.run(1);
    assert.equal(fxOf(h, 'kalts2Mark').length, 0, `skill ${skill + 1}`);
    done(h);
  }
});

const CLEMNT = 'char_4231_clemnt';
function clemnt(enemyKey, n) {
  const h = makeBattle({ seed: 23, autoFinish: false, timeLimit: 180, captureNoisy: true,
    defs: { enemies: { light: dummy('light', { atk: 0, mass: 3 }), mid: dummy('mid', { atk: 0, mass: 4 }) } },
    units: [{ uid: 1, diy: { slot: 6, charId: CLEMNT, skillIndex: 1 }, elite: true, potential: 6, row: 10, col: 3, dir: 'RIGHT' }] });
  h.step();
  for (let i = 0; i < n; i++) h.spawn(enemyKey, { pos: [10, 4] });
  const u = h.unit(1);
  u.skill.gainSp(999, 'init');
  assert.equal(u.skill.activate('test'), true);
  h.run(2);
  return { h, u };
}

test('克莱门莎 S2: \'cabinFull\' once the boarded weight reaches max_passenger_mass (8), never below it', () => {
  const full = clemnt('mid', 3);
  assert.equal(full.u.mem.clemntCabin.mass, 0);
  assert.equal(fxOf(full.h, 'cabinFull').length, 1, 'two weight-4 enemies fill it; the third does not board');
  done(full.h);
  const part = clemnt('light', 3);
  assert.equal(part.u.mem.clemntCabin.mass, 2);
  assert.equal(fxOf(part.h, 'cabinFull').length, 0, 'two weight-3 enemies: 2 left');
  done(part.h);
});

test('秘术师: each store tells how many energies she holds now', () => {
  const ds = getDefaultSource();
  const id = 'chess_char_1_17_b';   // 深靛 elite: 4
  const r = ds.rawChess(id);
  const h = makeBattle({ seed: 3, autoFinish: false, timeLimit: 300, captureNoisy: true,
    defs: { chess: { [id]: { ...r, talents: r.talents.map((t) => ({ ...t, bb: { ...t.bb, prob: 0 } })) } }, enemies: { e: dummy('e') } },
    units: [{ chessId: id, row: 10, col: 4 }] });
  h.run(20);
  assert.deepEqual(fxOf(h, 'mysticStore').map((o) => o.n), [1, 2, 3, 4]);
  done(h);
});
