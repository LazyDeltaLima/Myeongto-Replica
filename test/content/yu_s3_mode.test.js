// test/content/yu_s3_mode.test.js — 위 S3: his second talent reaches every operator in the client's mode S3 only
// (`Modes/S3/Body/Talents/2/GlobalArua`), and the mode comes as the cast ends: `yu_s_3[mode_restart]` is `BuffDuringCastingFixed` on
// `CastAnimation`, whose clip is `Skill_3_Begin`, 1.6 s. docs/rules/sim.md 「즉발 스킬의 시전」.
// Run: node --test test/content/yu_s3_mode.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const YU = 'chess_char_6_03_a';
const OTHERS = ['chess_char_1_14_a', 'chess_char_1_09_a', 'chess_char_1_11_a', 'chess_char_2_01_a'];

function field() {
  const h = makeBattle({
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 1e9, speed: 0 }) } }, autoFinish: false, timeLimit: 60, captureNoisy: true, flags: { dpPerSec: 0 },
    units: [{ chessId: YU, row: 10, col: 3 }, ...OTHERS.map((id, i) => ({ chessId: id, row: 11, col: 2 + i }))],
    enemies: [{ key: 'e', pos: [2, 12] }],
  });
  h.run(1.5);   // (past his born state: `_canSwitchDuringBorn`)
  return { h, yu: h.unit(YU), ally: h.unit(OTHERS[0]) };
}

/** Healing `ally` gets from him over `secs`, its HP kept low. */
function healed(h, ally, secs) {
  ally.hp = ally.s.maxHp * 0.2;
  const hp0 = ally.hp;
  h.run(secs);
  return ally.hp - hp0;
}

test('the talent reaches the other operators only once the clip has ended', () => {
  const { h, yu, ally } = field();
  yu.skill.gainSp(9999, 'test');
  assert.ok(yu.skill.activate('test'), 'S3 cast');
  assert.ok(yu.skill.active);
  assert.equal(healed(h, ally, 1.4), 0, 'nothing during Skill_3_Begin (1.6 s)');
  h.run(0.3);
  assert.ok(yu.mem.yuS3Mode, 'the mode after the clip');
  assert.ok(yu.mem.yuWall, 'the wall too: Aura is the next ability');
  assert.ok(healed(h, ally, 2.5) > 0, 'healed in the mode');
  checkInvariants(h.b);
});

test('a stun in the clip loses the wall and still enters the mode: the buff held during the cast finishes with it', () => {
  const { h, yu, ally } = field();
  yu.skill.gainSp(9999, 'test');
  assert.ok(yu.skill.activate('test'));
  h.run(0.5);
  h.b.applyStatus(yu, 'stun', { duration: 0.5, source: null });
  h.run(0.2);
  assert.ok(yu.skill.active, 'the skill runs on');
  assert.ok(yu.mem.yuS3Mode, 'the mode');
  assert.equal(yu.mem.yuWall ?? null, null, 'no wall');
  assert.ok(healed(h, ally, 2.5) > 0, 'healed in the mode');
  checkInvariants(h.b);
});
