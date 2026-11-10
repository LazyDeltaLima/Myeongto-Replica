// test/render/token-skill-fx.test.js — the summons' skill prefabs whose effects no attack binding plays (docs/rules/fx.md
// 「소환물의 공격 이펙트」 「공격 없는 소환물의 스킬 이펙트」): 蜜蜡 S2's 沙之碑 (token_10011_beewax_oblisk) casts its own skill
// sktok_beewax as it is placed — the kit's 'obelisk' burst —, whose `_castEffects` ON_CAST_START plays token_beewax_skill_02_range
// on it once (render/fx/kitofficial.js `obelisk`); the kit's event names her (`src`) so the plan finds her bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitOfficialPlan, kitOperator } from '../../public/js/render/fx/kitofficial.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

test('kitofficial: the 沙之碑\'s skill cast — token_beewax_skill_02_range on it, from beewax_token', () => {
  const o = { x: 6, y: 9, id: 7, src: 1 };
  assert.equal(kitOperator(o, 'obelisk'), 1, 'her, not the obelisk');
  const p = kitOfficialPlan('obelisk', o, 'beewax');
  assert.deepEqual(p.play, [{ n: 'token_beewax_skill_02_range', on: 'id', life: 'once', bundle: 'beewax_token' }]);
  assert.equal(kitOfficialPlan('obelisk', o, 'other'), null);
});

test('蜜蜡 kit: the obelisk event carries her id (`src`) beside the obelisk\'s', () => {
  const id = 'chess_char_4_05_a';
  const h = makeBattle({ defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e8, speed: 0 }) } }, units: [{ chessId: id, row: 9, col: 5 }], timeLimit: 200, hooks: [] });
  h.run(0.2);
  const u = h.unit(id);
  h.spawn('enemy_dummy', { pos: [9, 7] });
  assert.ok(h.runUntil(() => u.skill.active, 60));
  const ev = h.eventsOf('fx').filter((e) => e[1] === 'obelisk');
  assert.equal(ev.length, 1);
  const ob = h.b.allyUnits.find((x) => x.defId === 'token_10011_beewax_oblisk');
  assert.equal(ev[0][4].src, u.id);
  assert.equal(ev[0][4].id, ob.id);
});
