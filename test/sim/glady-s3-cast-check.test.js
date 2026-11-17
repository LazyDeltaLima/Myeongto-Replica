// 歌蕾蒂娅 S3 缺水的碎漩狂舞 casts only with a target in her range (docs/rules/sim.md 「글래디아 S3 시작 순서」): the official
// skill prefab's own target trigger (`_trigger`, ChantAttack1's selector) must find a selectable enemy in her range box
// before the automatic operations cast it. An enemy she blocks from behind (outside her range) used to cast it with no
// target: no tornado, no damage, no normal attack for the whole skill.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const G = 'chess_char_4_12_a';

function lane(dir) {
  const h = makeBattle({
    seed: 1, timeLimit: 60, autoFinish: false, units: [{ chessId: G, row: 9, col: 6, dir }], enemies: [],
    defs: { enemies: { tank: enemyRec({ key: 'tank', hp: 1e6, speed: 0.6 }) } },
  });
  const u = h.unit(G);
  h.step(1);
  u.skill.sp = u.skill.spCost;   // ready from the start
  const e = h.spawn('tank', { pos: [9, 9.5] });   // walks from the right towards her (9,6)
  return { h, u, e };
}

test('歌蕾蒂娅 S3: an enemy she blocks from behind (outside her range) does not cast it — she attacks it normally', () => {
  const { h, u, e } = lane('LEFT');
  const ok = h.runUntil(() => e.blockedBy === u, 20);
  assert.ok(ok, 'the enemy reaches her and is blocked from behind');
  h.run(5);
  assert.ok(!u.skill.active, 'S3 cast on a blocked enemy outside her range (data `cast.trig`, skills.js _trigFound: the prefab target trigger — docs/rules/sim.md 「스킬 프리팹의 대상 트리거」)');
  assert.ok(e.hp < e.s.maxHp, 'she attacks the blocked enemy normally instead');
});

test('歌蕾蒂娅 S3: an enemy in her range casts it and the tornado forms', () => {
  const { h, u } = lane('RIGHT');
  assert.ok(h.runUntil(() => u.skill.active, 5), 'S3 casts with an enemy in her range');
  h.run(0.5);
  assert.ok(u.mem.tornado, 'the tornado formed on the target');
});
