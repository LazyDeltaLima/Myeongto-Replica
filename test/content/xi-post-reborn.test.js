// test/content/xi-post-reborn.test.js — “自在” (enemy_1517_xi): the 10 s 无敌 after its rebirth is untargetable too
// (upstream #510; PRTS 无敌 「无法被不同阵营选中」). The first test is upstream's (221e6b8d); the last one runs the real match path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import { canTargetEnemy } from '../../server/sim/targeting.js';

const grid = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]];
for (const rule of ['DEFAULT', 'ACTIVE_RANGE', 'SKILL_RANGE', 'SP_FULL']) test(`Xi post-rebirth invincibility prevents attacks; ${rule} retains its own trigger semantics`, () => {
  const h = makeBattle({ content: 'generic', extraContent: [enemiesMod], autoFinish: false, captureNoisy: true,
    defs: { chess: { probe: chessRec({ id: 'probe', profession: 'SNIPER', projectile: 'none',
      stats: { atk: 10, maxHp: 1e7, bat: 1, blockCnt: 0 }, rangeGrid: grid,
      skill: { spCost: 2, initSp: 0, duration: 0, trigger: { rule, grid } } }) } },
    kits: { probe: () => ({ skill: { duration: 0, spCost: 2, initSp: 0, trigger: { rule, grid }, onStart() {} } }) },
    units: [{ chessId: 'probe', row: 10, col: 4 }], enemies: [{ key: 'enemy_1517_xi', pos: [10, 7], mods: { speedMul: 0 } }],
  });
  h.step(); const u = h.unit('probe'), e = h.enemy('enemy_1517_xi');
  h.b.kill(e, null); h.run(4.8);
  let arrival = null;
  h.b.addProjectile({ from: u, target: e, speed: 3, onHit: ({ battle, target }) => {
    arrival = battle.dealDamage(u, target, { type: 'true', amount: 1000 });
  } });
  h.run(0.4);
  assert.equal(e.form, 'form2'); assert.ok(e.s.flags.invulnerable);
  assert.equal(canTargetEnemy(u, e, u.profile), false);
  const attacks = u.stats.attacks, casts = u.skill.activations, hp = e.hp;
  h.run(3);
  assert.equal(u.stats.attacks, attacks);
  if (rule === 'DEFAULT' || rule === 'ACTIVE_RANGE') assert.equal(u.skill.activations, casts);
  else assert.ok(u.skill.activations > casts, 'presence-only and SP-only skills are not forcibly suppressed');
  assert.equal(arrival, 0, 'an already flying projectile still does no damage');
  assert.equal(h.b.dealDamage(u, e, { type: 'arts', amount: 1000 }), 0);
  assert.equal(h.b.dealDamage(u, e, { type: 'element', element: 'neural', amount: 1000 }), 0);
  assert.equal(e.hp, hp);
  h.run(7.2);
  assert.equal(canTargetEnemy(u, e, u.profile), true); assert.ok(u.stats.attacks > attacks);
  checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
});

test('upstream #510 through the real match path: an operator stops attacking 自在 for its post-rebirth 无敌, then resumes', async () => {
  const { makeMatch, give } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', humans: 1, seed: 11 }).start();
  mh.toPrep(3);
  const m = mh.m, ps = mh.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  give(m, ps, 'chess_char_1_03_a', 'board', [10, 5]);   // 惊蛰 (caster)
  const opts = m._normalOpts(ps);
  const spec = buildBattleSpec({ ...opts, battleId: 'xi', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent, timeLimit: 120,
    spawns: [{ time: 0, enemyKey: 'enemy_1517_xi', routeIndex: 0, count: 1, interval: 0, pos: [10, 7], mods: { speedMul: 0 } }] });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  const u = b.allyUnits.find((x) => x.kind === 'op');
  let e = null;
  for (let i = 0; i < 400 && !e; i++) { b.step(); e = b.enemies?.find?.((x) => x.defId === 'enemy_1517_xi') ?? b.enemyUnits?.find?.((x) => x.defId === 'enemy_1517_xi'); }
  assert.ok(e && u, 'both on the field');
  b.addBuff(u, { key: 'test:tough', duration: Infinity, flags: { invulnerable: true } });   // 自在 would knock it out
  b.kill(e, null);
  const t0 = b.time;
  while (b.time < t0 + 5.3) b.step();
  assert.equal(e.form, 'form2');
  assert.ok(e.s.flags.invulnerable && e.s.flags.untargetable, '无敌 = invulnerable + untargetable');
  assert.equal(canTargetEnemy(u, e, u.profile), false);
  const attacks = u.stats.attacks;
  while (b.time < t0 + 14) b.step();
  assert.equal(u.stats.attacks, attacks, 'no attack on it during the 无敌');
  while (b.time < t0 + 17) b.step();
  assert.ok(!e.s.flags.untargetable && canTargetEnemy(u, e, u.profile), 'targetable once the 无敌 ends');
  assert.ok(u.stats.attacks > attacks, 'the operator attacks it again');
  assert.deepEqual(b.errors.map((x) => x.error?.message), []);
  m.dispose?.();
});
