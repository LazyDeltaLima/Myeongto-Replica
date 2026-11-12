// 规程's 特质 effect over the operator when the 特质 takes effect (shared/traitFx.js, server/sim/content/garrisons/effects/
// events.js traitFx; docs/rules/fx.md 「규정 특질 발동 이펙트」): the sim's ['tplfx', holder, prefab] — crossed swords
// (map_v079_buff03) over 莎草 at each skill start (official recording), the chain link (map_v079_buff01) over a bond 特质
// that gains layers, nothing for a fixed stat 特质 (维伊's 「每叠加2层…」) or on the default season's table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { ACT3 } from '../helpers/seasonPieces.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { traitEventFx, BOND_TRAIT_FX } from '../../shared/traitFx.js';

function op(id, { g = [], bonds = [] } = {}) {
  return {
    ...chessRec({
      id, profession: 'WARRIOR', bonds, tier: 1, rangeGrid: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
      stats: { maxHp: 2000, atk: 500, def: 200, res: 10, aspd: 100, bat: 1, respawnTime: 20, spRecovery: 0, blockCnt: 2 },
      skill: { spCost: 60, duration: 5, initSp: 0 },
    }),
    garrisonIds: g,
  };
}
const DUMMY = enemyRec({ key: 'e_d', hp: 1e7, speed: 0, def: 0, res: 0, atk: 0 });
const B = (layers = 0) => ({ count: 3, active: true, tier: 1, layers });

function fight(ops, bonds = {}) {
  const chess = {};
  for (const [id, [, , o]] of Object.entries(ops)) chess[id] = op(id, o);
  const data = new DataSource({ ...ACT3, chess: { ...ACT3.chess, ...chess }, enemies: { ...ACT3.enemies, e_d: DUMMY } }, getDefaultSource());
  const h = makeBattle({ data, bonds, timeLimit: 999, autoFinish: false, units: Object.entries(ops).map(([id, [row, col]]) => ({ chessId: id, row, col })), enemies: [] });
  h.run(2);
  return h;
}
const traitFx = (h) => h.eventsOf('tplfx').filter((e) => /^map_v079_buff0/.test(e[2]));
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };

test('the table: battle 特质 → crossed swords, gold → buff04, support → buff02, bond → buff01 (not in the table)', () => {
  const G = ACT3.garrisons;
  assert.equal(traitEventFx(G.garrison_44_a), 'map_v079_buff03', '莎草 (the event garrison: the one that plays)');
  assert.equal(traitEventFx(G.garrison_24_a), 'map_v079_buff03', '维伊');
  assert.equal(G.garrison_51_a.eventEffect, null, '雪猎: null in the table');
  assert.equal(traitEventFx(G.garrison_51_a), BOND_TRAIT_FX, '雪猎: the bond 特质\'s chain link');
  const by = {};
  for (const g of Object.values(G)) (by[g.eventTypeIcon] ??= new Set()).add(traitEventFx(g));
  assert.deepEqual(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, [...v]])), {
    icon_bond: ['map_v079_buff01'], icon_battle: ['map_v079_buff03'], icon_gold: ['map_v079_buff04'], icon_support: ['map_v079_buff02'],
  });
  assert.equal(traitEventFx({ eventTypeIcon: 'icon_bond' }), null, 'a table without the field (the default season)');
});

test('莎草 garrison_44 → 233: crossed swords over her at each skill start, once', () => {
  const h = fight({ s: [10, 4, { g: ['garrison_44_a', 'garrison_233_a'] }], f: [10, 5, {}] });
  const s = h.unit('s');
  assert.deepEqual(traitFx(h), []);
  h.b.emit('skillStart', { unit: s, skill: s.skill, reason: 'test' });
  assert.deepEqual(traitFx(h), [['tplfx', s.id, 'map_v079_buff03', null]]);
  h.b.emit('skillStart', { unit: s, skill: s.skill, reason: 'test' });
  assert.equal(traitFx(h).length, 2);
  done(h);
});

test('烈夏 garrison_13 (battle start, 乌萨斯 临时层数): the chain link over her when the layers come', () => {
  const h = fight({ l: [10, 4, { g: ['garrison_13_a'], bonds: ['ursusShip'] }] }, { ursusShip: B(0) });
  assert.deepEqual(traitFx(h), [['tplfx', h.unit('l').id, BOND_TRAIT_FX, null]]);
  done(h);
});

test('烈夏 garrison_13 without an active 乌萨斯: no gain, no effect', () => {
  const h = fight({ l: [10, 4, { g: ['garrison_13_a'], bonds: ['ursusShip'] }] }, { ursusShip: { ...B(0), active: false } });
  assert.deepEqual(traitFx(h), []);
  done(h);
});

test('维伊 garrison_24 (每叠加2层 ASPD +1, a fixed stat 特质): no effect at the deployment or later', () => {
  const h = fight({ v: [10, 4, { g: ['garrison_24_a'], bonds: ['ursusShip'] }] }, { ursusShip: B(20) });
  h.run(5);
  assert.deepEqual(traitFx(h), []);
  done(h);
});
