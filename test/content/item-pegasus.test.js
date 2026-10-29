// test/content/item-pegasus.test.js — 天马之枪 with 天马之盔: "造成伤害时额外造成30%的真实伤害".
//
// PRTS 盟约记录 下半 装备数据库 备注: "仅在造成非附加伤害时额外造成无来源真伤附加伤害 / 额外造成的伤害基于原伤害计算攻击倍率后、
// 计算单位防御力/法术抗性以及所有伤判效果前的伤害数值，且先于原伤害处理完毕" — 30 % of the instance's damage before DEF / RES
// and the dealt / taken multipliers (not 30 % of ATK), 无来源 (credited to the carrier), only on non-附加 damage, and
// resolved before the instance that carries it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const PEGASUS = (helm = 'a', lance = 'a') => [`chess_item_5_09_e_${helm}`, `chess_item_6_01_e_${lance}`];

/** A carrier that never attacks on its own and a probe enemy; `damaged` on the probe recorded in order. */
function field(items = PEGASUS()) {
  const h = makeBattle({
    autoFinish: false,
    defs: {
      chess: { carrier: chessRec({ id: 'carrier', stats: { maxHp: 10000, atk: 500 }, skill: null }) },
      enemies: { probe: enemyRec({ key: 'probe', hp: 1000000, def: 0, res: 0, atk: 0, speed: 0 }) },
    },
    units: [{ uid: 'carrier', chessId: 'carrier', row: 10, col: 3, items }],
  });
  h.step();
  const b = h.b, u = h.unit('carrier'), e = h.spawn('probe', { pos: [10, 7] }), got = [];
  u.atkCd = 999;
  b.on('damaged', (c) => { if (c.target === e) got.push(c); });
  return { h, b, u, e, got };
}
const hit = (f, extra = {}) => f.b.dealDamage(f.u, f.e, { amount: 1000, type: 'phys', ...extra });
const riders = (f) => f.got.filter((c) => c.dmg.tags.includes('item:pegasus'));
const done = (f) => { checkInvariants(f.b); assert.deepEqual(f.b.errors.map((x) => x.message), []); };

for (const helm of ['a', 'b']) for (const lance of ['a', 'b']) {
  test(`天马之枪 ${lance} + 天马之盔 ${helm}: 30 % of the instance before DEF and the dealt multiplier, 无来源, before the instance`, () => {
    const f = field(PEGASUS(helm, lance)), { b, u, e, got } = f;
    b.addBuff(u, { key: 'test:dealt', mods: { dmgDealtMul: 2 } });
    b.addBuff(e, { key: 'test:taken', mods: { defFlat: 900, dmgTakenMul: 2 } });
    assert.equal(hit(f), 400, 'the instance: (1000 − 900 DEF) × dealt 2 × taken 2');
    assert.equal(got.length, 2, 'one rider, no rider of the rider');
    const [rider, parent] = got;
    assert.ok(rider.dmg.tags.includes('item:pegasus'), 'the rider lands first');
    assert.equal(rider.source, null, '无来源: hooks see no source');
    assert.ok(rider.credit === u, 'credited to the carrier');
    assert.equal(rider.type, 'true');
    assert.equal(rider.amount, 600, '1000 × 30 % × taken 2 — the carrier\'s dealt multiplier does not apply to 无来源 damage');
    assert.ok(parent.source === u);
    assert.equal(u.stats.dmg, 1000, 'both count as the carrier\'s damage');
    done(f);
  });
}

test('天马之枪: the base is the instance, not ATK', () => {
  const f = field();
  hit(f, { amount: 200 });
  assert.equal(riders(f).length, 1);
  assert.equal(riders(f)[0].amount, 60, '200 × 30 % (ATK 500 × 1.4 × 30 % would be 210)');
  done(f);
});

test('天马之枪: arts — the base is before RES', () => {
  const f = field();
  f.b.addBuff(f.e, { key: 'test:res', mods: { resFlat: 90 } });
  hit(f, { type: 'arts' });
  assert.equal(riders(f)[0].amount, 300);
  done(f);
});

test('天马之枪: the rider can knock the enemy out before the instance; the kill is the carrier\'s', () => {
  const f = field();
  f.e.hp = 100;
  assert.equal(hit(f), 0, 'the instance finds the enemy gone');
  assert.equal(f.got.length, 1);
  assert.equal(f.got[0].source, null);
  assert.equal(f.u.stats.kills, 1);
  done(f);
});

test('天马之枪: no rider on 附加 damage, element gauges, 无来源 damage or without the helm', () => {
  const f = field(), { b, u, e } = f;
  hit(f, { type: 'true', tags: ['addition'] });
  b.dealDamage(u, e, { amount: 1, type: 'element', element: 'burn' });
  b.dealDamage(u, e, { amount: 100, type: 'true', sourceless: true });
  b.loseHp(e, 100, { source: u });
  assert.equal(riders(f).length, 0);
  hit(f, { type: 'true' });
  assert.equal(riders(f).length, 1, 'non-附加 true damage carries it');
  done(f);
  const g = field(['chess_item_6_01_e_a']);
  hit(g);
  assert.equal(riders(g).length, 0, 'the lance alone has no rider');
  done(g);
});
