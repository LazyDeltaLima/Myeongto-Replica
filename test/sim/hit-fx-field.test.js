// test/sim/hit-fx-field.test.js — the official effect moments a 'dmg' / 'heal' event names (2026-10-24): the 'dmg' 9th field
// and the 'heal' 5th, [[key, ownerId, life?], …] (server/sim/damage.js fxField / hitFx). A kit's `moment` key on its damage / heal
// / HP loss is owned by the source; `battle.hitFx` adds one for the target's side after the event went out. The renderer
// plays them (render/fx/kitofficial.js `hit`, docs/rules/fx.md 「키트 이벤트의 공식 이펙트」). A field only: events are
// counted, never hashed, so no golden digest moves.
// Run: node --test test/sim/hit-fx-field.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const walker = (o = {}) => enemyRec({ key: 'enemy_walker', hp: 1e6, speed: 0.01, ...o });
const moments = (e, i) => (Array.isArray(e[i]) ? e[i] : []);
const has = (list, key, owner) => list.some((m) => m[0] === key && (owner === undefined || m[1] === owner));

test('damage and heal options carry the key (owned by the source); hitFx tags the target\'s event of this tick', () => {
  const h = makeBattle({
    defs: { enemies: { enemy_walker: walker() } }, enemies: [{ key: 'enemy_walker', pos: [10, 6] }],
    units: [{ chessId: 'chess_char_2_08_a', row: 10, col: 4 }], content: 'none', autoFinish: false,
  });
  h.step();
  const e = h.enemy('enemy_walker'), u = h.allies()[0];
  h.b.drainEvents();
  h.b.dealDamage(u, e, { amount: 100, type: 'true', moment: 'k:a' });
  h.b.dealDamage(u, e, { amount: 100, type: 'true' });
  h.b.hitFx(e, 'k:b', u, 5);
  u.hp = 1;
  h.b.heal(u, u, 50, { moment: 'k:c' });
  h.b.loseHp(u, 0.6, { moment: 'k:d' });
  const evs = h.b.drainEvents();
  const dmg = evs.filter((x) => x[0] === 'dmg');
  assert.deepEqual(dmg[0][8], [['k:a', u.id]]);
  assert.deepEqual(dmg[1][8], [['k:b', u.id, 5]], 'hitFx: the latest event on it, with the life');
  assert.deepEqual(evs.find((x) => x[0] === 'heal')[4], [['k:c', u.id]]);
  assert.deepEqual(dmg[2][8], [['k:d', null]], 'a loss without a source: no owner');
  // no key: the event keeps its 8 fields; a hitFx on a later tick tags nothing
  h.b.dealDamage(u, e, { amount: 100, type: 'true' });
  const plain = h.b.drainEvents().find((x) => x[0] === 'dmg');
  assert.equal(plain.length, 8);
  h.step();
  h.b.hitFx(e, 'k:e', u);
  assert.equal(plain.length, 8, 'not on an earlier tick');
});

test('the kits send their moments: 引星棘刺 S2 ticks, 水月 S3 loss, 休谟斯 trait heal, 泡泡 T1', () => {
  const fight = (units, cast, seconds = 8, enemies = [{ key: 'enemy_walker', pos: [10, 5] }]) => {
    const h = makeBattle({ seed: 3, autoFinish: false, timeLimit: 60, defs: { enemies: { enemy_walker: walker({ atk: 300 }) } }, enemies, units });
    h.step();
    for (const id of cast) { const u = h.unit(id); u.skill.gainSp(999, 'test'); if (!u.skill.active) u.skill.activate('test'); }
    h.run(seconds);
    checkInvariants(h.b);
    return h;
  };
  const dmgKeys = (h) => h.eventsOf('dmg').flatMap((e) => moments(e, 8));
  const healKeys = (h) => h.eventsOf('heal').flatMap((e) => moments(e, 4));
  // 引星棘刺 S2 解构涌潮: its alchemy unit's arts per second
  let h = fight([{ chessId: 'chess_char_5_15_a', row: 10, col: 3, skillIndex: 1 }], ['chess_char_5_15_a']);
  const thorn = h.unit('chess_char_5_15_a');
  assert.ok(has(dmgKeys(h), 'thorn2_s2_damage', thorn.id), JSON.stringify(dmgKeys(h)));
  // 水月 S3: an attack hitting fewer than 3 enemies costs her HP
  h = fight([{ chessId: 'chess_char_4_09_a', row: 10, col: 4, skillIndex: 2 }], ['chess_char_4_09_a']);
  assert.ok(has(dmgKeys(h), 'mizuki_s_3[damage]'), JSON.stringify(dmgKeys(h)));
  // 休谟斯 收割者 trait heal (she takes the walker's hits)
  h = fight([{ chessId: 'chess_char_2_09_a', row: 10, col: 4 }], [], 8, [{ key: 'enemy_walker', pos: [10, 5] }]);
  const humus = h.unit('chess_char_2_09_a');
  humus.hp = humus.s.maxHp * 0.3;
  h.run(4);
  assert.ok(has(healKeys(h), 'trait', humus.id), JSON.stringify(healKeys(h)));
  // 泡泡 T1 尖刺盾: the hit it takes names its debuff on the attacker, for its duration
  h = fight([{ chessId: 'chess_char_2_08_a', row: 10, col: 4 }], []);
  const bubble = h.unit('chess_char_2_08_a');
  const spike = h.eventsOf('dmg').filter((e) => e[1] === bubble.id).flatMap((e) => moments(e, 8));
  assert.ok(spike.length && spike.every((m) => m[0] === 'bubble_t_1[atk_down]' && m[1] === bubble.id && m[2] > 0), JSON.stringify(spike));
});
