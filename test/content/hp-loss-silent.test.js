// test/content/hp-loss-silent.test.js — a periodic HP loss whose client node creates no effect sends no 'dmg' event, which the view
// would draw as a hit of 真实 damage (fx/numbers.js): 华法琳 S2's periodic_damage_by_hp_ratio[skip_modifier_fix] and 百炼嘉维尔 S3's
// gvial2_s_3[bleed]; 水月 S3's mizuki_s_3[damage], whose buff effect is a kitHit of its own. The HP still falls. (白铁's device: test/content/op_ironmn.test.js; Mon3tr's: test/render/op-sweep-fx.test.js.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const ds = getDefaultSource();
const hitsOn = (h, u) => h.eventsOf('dmg').filter((e) => e[1] === u.id).length;

test('华法琳 S2: the plasma takes her HP and draws no hit', () => {
  const ID = 'chess_char_4_26_a';
  const index = ds.rawChess(ID).skills.find((s) => s.skillId === 'skchr_bldsk_2').index;
  const h = makeBattle({ units: [{ chessId: ID, row: 9, col: 5, skillIndex: index }], timeLimit: 60, autoFinish: false, captureNoisy: true, flags: { dpInit: 60, dpMax: 99 } });
  h.step();
  const u = h.unit(ID);
  assert.ok(u.skill.activate('test', { free: true }));
  h.step();
  assert.ok(u.findBuff('bldsk:plasma'), 'the skill ran');
  const before = u.hp;
  h.run(5);
  assert.ok(u.hp < before, `${u.hp} < ${before}`);
  assert.equal(hitsOn(h, u), 0, 'the loss sent \'dmg\': pass `silent` to Battle.loseHp (docs/rules/fx.md 「효과 없는 주기적 유실」)');
});

test('가비알 디 인빈서블 S3: the debt comes off after the skill and draws no hit', () => {
  const ID = 'chess_char_4_23_a';
  const h = makeBattle({ units: [{ chessId: ID, row: 9, col: 5 }], timeLimit: 60, autoFinish: false, captureNoisy: true, flags: { dpInit: 60, dpMax: 99 } });
  h.step();
  const u = h.unit(ID);
  assert.ok(u.skill.activate('test', { free: true }));
  h.step();
  u.mem.gvialDebt = u.s.maxHp * 0.5;
  u.skill.timeLeft = 0.05;
  for (let i = 0; i < 300 && !u.findBuff('gvial:bleed'); i++) h.step();
  assert.ok(u.findBuff('gvial:bleed'), 'the bleed started');
  const before = u.hp;
  h.run(4);
  assert.ok(u.hp < before, `${u.hp} < ${before}`);
  assert.equal(hitsOn(h, u), 0, 'the loss sent \'dmg\': pass `silent` to Battle.loseHp (docs/rules/fx.md 「효과 없는 주기적 유실」)');
});

test('水月 S3: an attack on fewer than 3 enemies takes her HP, draws no hit and sends the buff\'s effect moment', () => {
  const ID = 'chess_char_4_09_a';
  const h = makeBattle({ seed: 3, autoFinish: false, timeLimit: 60, captureNoisy: true,
    defs: { enemies: { enemy_walker: enemyRec({ key: 'enemy_walker', hp: 1e6, speed: 0.01, atk: 0 }) } },
    enemies: [{ key: 'enemy_walker', pos: [10, 5] }], units: [{ chessId: ID, row: 10, col: 4, skillIndex: 2 }] });
  h.step();
  const u = h.unit(ID);
  assert.ok(u.skill.activate('test', { free: true }));
  const before = u.hp;
  h.run(6);
  assert.ok(u.hp < before, `${u.hp} < ${before}`);
  assert.equal(hitsOn(h, u), 0, 'the loss sent \'dmg\': pass `silent` to Battle.loseHp (docs/rules/fx.md 「효과 없는 주기적 유실」)');
  const moments = h.eventsOf('fx').filter((e) => e[1] === 'kitHit' && e[4]?.k === 'mizuki_s_3[damage]');
  assert.ok(moments.length && moments.every((e) => e[4].id === u.id), 'mizuki_s_3[damage]\'s CreateEffect on her: the kit\'s kitHit (render/fx/kitofficial.js)');
});
