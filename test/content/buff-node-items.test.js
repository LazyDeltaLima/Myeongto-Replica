// Equipment and bond numbers settled by the official client's buff-graph nodes (2026-10-31): 精准狙击镜's CheckDistance
// boundary, 迅捷作战粮's AutoChessAssignSameBondCharacterCntToBB count, and the 炎佑 stat sums of
// AutoChessAssignGatheredAttributeToBlackboard on a two-player field. docs/rules/sim.md 「버프 그래프 노드 본문」.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { bondBb } from '../../server/sim/content/bonds/core.js';
import { TOKEN_IDS } from '../../server/sim/content/tokens.js';
import { DATA } from '../match/harness.js';

const REAL = { skip: !hasGeneratedData() };
const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} expected ${b}, got ${a}`);
const op = (id, bonds, extra = {}) => chessRec({
  id, bonds, profession: 'WARRIOR', ...extra,
  stats: { atk: 1000, maxHp: 10000, def: 0, blockCnt: 2, ...(extra.stats || {}) },
});
const dummy = enemyRec({ key: 'e_dummy', hp: 1e8, speed: 0, def: 0, res: 0, atk: 0 });

test('精准狙击镜: no bonus at exactly 3 tiles (client CheckDistance d² ≤ r² → IfNot), ×damage_scale beyond', REAL, () => {
  const h = makeBattle({
    defs: { chess: { s_a: op('s_a', ['preciShip']) }, enemies: { e_dummy: dummy } },
    units: [{ chessId: 's_a', row: 9, col: 3, items: ['chess_item_3_02_e_a'] }],
    enemies: [{ key: 'e_dummy', pos: [9, 8] }, { key: 'e_dummy', pos: [9, 8] }],
    autoFinish: false, timeLimit: 60,
  });
  h.step(1);
  const u = h.unit('s_a');
  const [near, far] = h.enemies();
  const lost = (e, dx, dy) => {
    e.x = u.x + dx; e.y = u.y + dy;
    const hp = e.hp;
    h.b.dealDamage(u, e, { amount: 1000, type: 'true', isAttack: true });
    return hp - e.hp;
  };
  close(lost(near, 3, 0), 1000, 1e-6, 'exactly 3 tiles');
  close(lost(near, 1.8, 2.4), 1000, 1e-6, 'exactly 3 tiles, diagonal');
  close(lost(far, 3.05, 0), 1300, 1e-6, 'beyond 3 tiles (damage_scale 1.3)');
  checkInvariants(h.b);
});

test('迅捷作战粮: SP = sp_each_person × (itself + operators sharing a bond); an operator with no bond gains none', REAL, () => {
  const sp = (bonds, mates) => {
    const chess = { r_a: op('r_a', bonds, { skill: { spCost: 99, initSp: 0 } }) };
    mates.forEach((b, i) => { chess[`m${i}_a`] = op(`m${i}_a`, b); });
    const h = makeBattle({
      defs: { chess, enemies: { e_dummy: dummy } },
      units: [{ chessId: 'r_a', row: 9, col: 3, items: ['chess_item_3_05_e_a'] },
        ...mates.map((_, i) => ({ chessId: `m${i}_a`, row: 10, col: 3 + i }))],
      enemies: [{ key: 'e_dummy', pos: [9, 9] }], autoFinish: false, timeLimit: 60,
    });
    h.step(0.1);
    return h.unit('r_a').skill.sp; // + the natural recovery of that 0.1 s
  };
  close(sp(['yanShip'], [['yanShip'], ['yanShip', 'sargonShip'], ['sargonShip']]), 9, 0.15, 'itself + two sharing 炎');
  close(sp(['yanShip'], []), 3, 0.15, 'alone: itself');
  close(sp([], [['yanShip']]), 0, 0.15, 'no bond: the count is 0');
});

test('炎佑 sums every 炎 operator of a two-player field (client acloon_gather_attribute), the partner\'s too', REAL, () => {
  const bb = bondBb('yanShip');
  const tpl = DATA.tokens[TOKEN_IDS.yanyou].stats;
  const chess = {};
  for (let i = 0; i < 6; i++) chess[`y${i}_a`] = op(`y${i}_a`, ['yanShip']);
  for (let i = 0; i < 2; i++) chess[`q${i}_a`] = op(`q${i}_a`, ['yanShip']);
  const side = (pid, prefix, n, seat) => ({
    playerId: pid, seat, side: seat ? 'R' : 'L', colOffset: 0, bandId: null, playerEffects: [],
    units: Array.from({ length: n }, (_, i) => ({ uid: seat * 10 + i + 1, kind: 'chess', chessId: `${prefix}${i}_a`, row: 9 + seat * 3, col: 3 + i })),
    bonds: { yanShip: { count: n, active: n >= 3, tier: n >= 6 ? 2 : n >= 3 ? 1 : 0, layers: 0 } },
  });
  const h = makeBattle({
    defs: { chess, enemies: { e_dummy: dummy } }, players: [side('p1', 'y', 6, 0), side('p2', 'q', 2, 1)],
    enemies: [{ key: 'e_dummy', pos: [10, 9] }], autoFinish: false, timeLimit: 60,
  });
  h.step(1);
  const yy = h.b.allyUnits.filter((u) => u.defId === TOKEN_IDS.yanyou && u.alive);
  assert.equal(yy.length, 1, 'p1 alone reaches 6 炎');
  assert.equal(yy[0].ownerId, 'p1');
  const sumAtk = 6 * 1000 * (1 + bb.base_atk) + 2 * 1000;   // p2's two 炎 have no active bond, so no 炎 ATK bonus
  close(yy[0].s.atk, tpl.atk + sumAtk * 0.3, 1e-6, '炎佑 ATK');
  close(yy[0].s.maxHp, tpl.maxHp + 8 * 10000 * 0.3, 1e-6, '炎佑 HP');
  checkInvariants(h.b);
});
