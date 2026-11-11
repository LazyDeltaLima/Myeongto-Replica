// 卫戍协议：规程's equipment on the battle side (data/seasons/act3autochess/items.json): the season's new buff keys
// (server/sim/content/items/effects/*.js — 规程 entries) and its hammers — 终极维式重锤 holds the hammer list where the default
// season has 蒸汽之心, and 电流维式重锤 is a fifth hammer type (items/battle.js). Synthetic operators on the season's data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { ACT3 } from '../helpers/seasonPieces.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { hasBattleEffect } from '../../server/sim/content/items/battle.js';
import { coverageOf } from '../../tools/season-coverage.mjs';

const I = (k, q = 'a') => `chess_item_${k}_e_${q}`;
const close = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);

/** Synthetic operator: 2000 HP, 500 ATK, 200 DEF, 10 RES, ASPD 100, 1 s attacks, 20 s redeploy, time SP 1/s. */
function op(id, o = {}) {
  return chessRec({
    id, profession: o.profession ?? 'WARRIOR', bonds: o.bonds ?? [], tier: 1, rangeGrid: o.range ?? [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
    stats: { maxHp: 2000, atk: 500, def: 200, res: 10, aspd: 100, bat: 1, respawnTime: 20, spRecovery: 1, blockCnt: 2, ...(o.stats || {}) },
    skill: { spCost: 60, duration: 5, initSp: 0, ...(o.skill || {}) },
  });
}
const DUMMY = (o = {}) => enemyRec({ key: 'e_d', hp: 1e7, speed: 0, def: 0, res: 0, ...o });

/** A battle on 规程's data: `units` (board coords, `items`), static dummies at `foes` [[r, c]…]. */
function fight({ ops = { t_op: op('t_op') }, units, foes = [], bonds, enemy = {} } = {}) {
  const data = new DataSource({ ...ACT3, chess: { ...ACT3.chess, ...ops }, enemies: { ...ACT3.enemies, e_d: DUMMY(enemy) } }, getDefaultSource());
  const h = makeBattle({
    data, units, bonds, enemies: foes.map(([r, c]) => ({ key: 'e_d', pos: [r, c] })), timeLimit: 999, autoFinish: false,
  });
  h.step();
  return h;
}
const foes = (h) => h.b.enemies.filter((e) => e.alive);
function forceRng(h, v) { const orig = h.b.rng; h.b.rng = Object.assign(() => v, orig); }
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };
/** HP removed from `t` by one arts / phys hit of `amount` from `src`. */
const hit = (h, src, t, amount, type = 'phys') => { const was = t.hp; h.b.dealDamage(src, t, { amount, type, canDodge: false }); return was - t.hp; };

test('规程 coverage: every battle buff key of the season\'s equipment runs (投机骰子 is prep-side, bundle sim-L)', () => {
  const rows = coverageOf('act3autochess').items.filter((r) => r.status !== 'ok');
  assert.deepEqual(rows.map((r) => `${r.side} ${r.key}`), ['prep equip_destory_skill_pool']);
  for (const id of [I('1_06'), I('2_10'), I('6_11'), I('6_05'), I('6_08')]) assert.ok(hasBattleEffect(ACT3.items[id], { data: ACT3 }) || hasBattleEffect(ACT3.items[id]), id);
});

test('雪祀之衣: HP +15 % / +25 %, 阻挡数 −1, 嘲讽等级 −1; 虹彩活血饮料: 无法被治疗, 75 / 150 HP a second of its own', () => {
  for (const [q, hp] of [['a', 1.15], ['b', 1.25]]) {
    const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('1_07', q)] }] });
    const u = h.unit('t_op');
    close(u.s.maxHp, 2000 * hp, q);
    assert.equal(u.s.blockCnt, 1);
    assert.equal(u.s.taunt, -1);
    done(h);
  }
  for (const [q, v] of [['a', 75], ['b', 150]]) {
    const ops = { t_op: op('t_op'), t_med: op('t_med') };
    const h = fight({ ops, units: [{ chessId: 't_op', row: 10, col: 4, items: [I('1_06', q)] }, { chessId: 't_med', row: 11, col: 4 }] });
    const u = h.unit('t_op');
    assert.ok(u.s.flags.healFree, 'healFree');
    h.b.loseHp(u, 1000);
    assert.equal(h.b.heal(h.unit('t_med'), u, 500), 0, 'no heal from an ally');
    const was = u.hp;
    h.run(2);
    close(u.hp - was, 2 * v, `${q}: its own regeneration`, v * 0.11);
    done(h);
  }
});

test('灵巧涡轮手套: ASPD +2 / +3 a second after deploying (≤ 20), lost to the first damage until the next deployment', () => {
  for (const [q, step] of [['a', 2], ['b', 3]]) {
    const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('2_10', q)] }] });
    const u = h.unit('t_op');
    h.run(3.05);
    assert.equal(u.s.aspd, 100 + 3 * step, `${q}: 3 layers`);
    h.run(30);
    assert.equal(u.s.aspd, 100 + 20 * step, `${q}: capped at 20`);
    h.b.dealDamage(null, u, { amount: 10, type: 'true', canDodge: false });
    h.run(2);
    assert.equal(u.s.aspd, 100, `${q}: gone after a hit`);
    done(h);
  }
});

test('乌萨斯呼吸器: 阻挡数 +1 and ATK +20 % / +30 % per deployment in the battle, up to 2 / 3', () => {
  for (const [q, atk, cap] of [['a', 0.2, 2], ['b', 0.3, 3]]) {
    const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('3_12', q)] }] });
    const u = h.unit('t_op');
    for (let n = 1; n <= cap + 1; n++) {
      const k = Math.min(n, cap);
      assert.equal(u.s.blockCnt, 2 + k, `${q} deployment ${n}: block`);
      close(u.s.atk, 500 * (1 + atk * k), `${q} deployment ${n}: ATK`);
      h.b.kill(u, null);
      assert.ok(h.b.redeploy(u, { free: true }), 'redeploy');
      h.run(0.1);
    }
    done(h);
  }
});

test('多功能补剂: each damage the carrier deals ⇒ 临时层数 +1 / +2 to each of its active bonds, 12 / 24 in a battle', () => {
  for (const [q, add, max] of [['a', 1, 12], ['b', 2, 24]]) {
    const ops = { t_op: op('t_op', { bonds: ['ursusShip', 'kazimierzShip'] }) };
    const h = fight({ ops, bonds: { ursusShip: { active: true, tier: 1, layers: 0 }, kazimierzShip: { active: false, tier: 0, layers: 0 } }, units: [{ chessId: 't_op', row: 10, col: 4, items: [I('3_13', q)] }], foes: [[10, 6]] });
    const u = h.unit('t_op'), e = foes(h)[0];
    const before = h.b.tempLayerGainsOf('p1').ursusShip ?? 0; // its own first attack may have landed already
    hit(h, u, e, 100);
    assert.deepEqual(h.b.tempLayerGainsOf('p1'), { ursusShip: before + add }, `${q}: one hit, the active bond only`);
    for (let i = 0; i < 40; i++) hit(h, u, e, 100);
    assert.deepEqual(h.b.tempLayerGainsOf('p1'), { ursusShip: max }, `${q}: capped`);
    done(h);
  }
});

test('伊比利亚骨刺刀: each damage ⇒ 1 / 2 extra arts hits of 25 % ATK, which carry nothing further', () => {
  for (const [q, n] of [['a', 1], ['b', 2]]) {
    const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('3_14', q)] }], foes: [[10, 6]] });
    const u = h.unit('t_op'), e = foes(h)[0];
    close(hit(h, u, e, 1000), 1000 + n * 125, q);
    const was = e.hp;
    h.b.dealDamage(u, e, { amount: 100, type: 'phys', tags: ['dot'] });
    close(was - e.hp, 100, `${q}: a 持续 damage carries none`);
    done(h);
  }
});

test('莱塔尼亚小鼓: an enemy knocked out in the carrier\'s range ⇒ SP +2 / +4; out of range nothing', () => {
  for (const [q, sp] of [['a', 2], ['b', 4]]) {
    const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('4_09', q)] }], foes: [[10, 6], [5, 1]] });
    const u = h.unit('t_op');
    const [near, far] = foes(h).sort((a, b) => b.x - a.x);
    const was = u.skill.sp;
    h.b.kill(near, u);
    close(u.skill.sp - was, sp, `${q}: in range`);
    h.b.kill(far, u);
    close(u.skill.sp - was, sp, `${q}: out of range`);
    done(h);
  }
});

test('可靠怀表: SP cost × 0.8 / × 0.6 (not below 3, once per operator), ASPD × 0.75 during the skill', () => {
  for (const [q, cost] of [['a', 48], ['b', 36]]) {
    const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('4_11', q), I('4_11', q)] }] });
    const u = h.unit('t_op');
    assert.equal(u.skill.spCost, cost, `${q}: two copies cut once`);
    u.skill.activate('test', { free: true });
    assert.equal(u.s.aspd, 50, `${q}: each copy's skill ASPD MULTIPLIER −25 % (multipliers add up)`);
    u.skill.end('test');
    assert.equal(u.s.aspd, 100);
    done(h);
  }
  const ops = { t_op: op('t_op', { skill: { spCost: 3 } }) };
  const h = fight({ ops, units: [{ chessId: 't_op', row: 10, col: 4, items: [I('4_11')] }] });
  assert.equal(h.unit('t_op').skill.spCost, 3, 'a cost of sp_cost_min stays');
});

test('驱逐者警棍 ×1.3 against a status-resistable state; 瓶装烈性反应 ×1.3 / ×1.5 in 元素爆发; 动能单手弩 30 %: ATK scale 130 %', () => {
  const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('4_12')] }], foes: [[10, 6]] });
  const u = h.unit('t_op'), e = foes(h)[0];
  close(hit(h, u, e, 1000), 1000, 'no state');
  h.b.applyStatus(e, 'stun', { duration: 5 });
  close(hit(h, u, e, 1000), 1300, 'stunned');
  for (const [q, sc] of [['a', 1.3], ['b', 1.5]]) {
    const h2 = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('5_10', q)] }], foes: [[10, 6]] });
    const u2 = h2.unit('t_op'), e2 = foes(h2)[0];
    close(hit(h2, u2, e2, 1000), 1000, `${q}: no burst`);
    h2.b.addBuff(e2, { key: 'burnBurst', duration: 10, flags: { burstLock: true } });
    close(hit(h2, u2, e2, 1000), 1000 * sc, `${q}: in the burst's recovery`);
  }
  const h3 = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('4_13')] }], foes: [[10, 6]], enemy: { def: 300 } });
  const u3 = h3.unit('t_op'), e3 = foes(h3)[0];
  forceRng(h3, 0);
  close(hit(h3, u3, e3, 1000), 1300 - 300, 'the amount before DEF ×1.3');
  forceRng(h3, 0.99);
  close(hit(h3, u3, e3, 1000), 1000 - 300, 'no roll');
  done(h3);
});

test('汲取者之喙: heals 5 % of each damage it deals; 汲取者之心: ATK +30 %, ASPD +30, −1 % max HP a second never below 1', () => {
  const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('4_14')] }], foes: [[10, 6]] });
  const u = h.unit('t_op'), e = foes(h)[0];
  h.b.loseHp(u, 1000);
  const was = u.hp;
  hit(h, u, e, 1000);
  close(u.hp - was, 50, 'beak heal');
  const h2 = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('6_09')] }] });
  const v = h2.unit('t_op');
  close(v.s.atk, 650, 'heart ATK');
  assert.equal(v.s.aspd, 130);
  h2.run(2);
  close(v.hp, 2000 - 2 * 20, 'two seconds of 流失', 1e-3);
  h2.b.loseHp(v, v.hp - 5);
  h2.run(3);
  assert.equal(v.hp, 1, 'never below 1');
  assert.ok(v.alive);
  done(h2);
});

test('汲取者之镰: during its skill the beak / heart double and the carrier 无法被治疗 (its own beak heal goes through)', () => {
  const h = fight({ ops: { t_op: op('t_op'), t_med: op('t_med') }, units: [{ chessId: 't_op', row: 10, col: 4, items: [I('6_10')] }, { chessId: 't_med', row: 11, col: 4 }], foes: [[10, 6]] });
  const u = h.unit('t_op'), e = foes(h)[0];
  close(u.s.atk, 650, 'off skill');
  u.skill.activate('test', { free: true });
  close(u.s.atk, 800, 'ATK +60 % in the skill');
  assert.equal(u.s.aspd, 160);
  assert.ok(u.s.flags.healFree);
  h.b.loseHp(u, 1000);
  assert.equal(h.b.heal(h.unit('t_med'), u, 300), 0, 'no ally heal');
  const was = u.hp;
  hit(h, u, e, 1000);
  close(u.hp - was, 100, '10 % of the damage');
  u.skill.end('test');
  assert.ok(!u.s.flags.healFree);
  close(u.s.atk, 650);
  done(h);
});

test('电流维式重锤 (a hammer here): 5 % ⇒ 1 麻痹 stack; against a 麻痹 target 无视 30 % DEF and RES', () => {
  const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('5_07')] }], foes: [[10, 6]], enemy: { def: 1000 } });
  const u = h.unit('t_op'), e = foes(h)[0];
  close(u.s.atk, 650, 'ATK +30 %');
  forceRng(h, 0.99);
  close(hit(h, u, e, 2000), 1000, 'no 麻痹: full DEF');
  assert.ok(!e.findBuff('palsy'));
  forceRng(h, 0);
  hit(h, u, e, 2000);
  assert.equal(e.findBuff('palsy')?.stacks, 1, '1 stack');
  forceRng(h, 0.99);
  close(hit(h, u, e, 2000), 2000 - 700, 'DEF × 0.7 against 麻痹');
  done(h);
});

test('终极维式重锤: the specials of the hammers its player\'s other operators carry, ATK +20 % × (1 + hammer kinds of the player)', () => {
  const ops = { t_op: op('t_op'), t_b: op('t_b'), t_c: op('t_c') };
  const alone = fight({ ops, units: [{ chessId: 't_op', row: 10, col: 4, items: [I('6_11')] }], foes: [[10, 6]] });
  close(alone.unit('t_op').s.atk, 600, 'no hammer: × (1 + 0.2)');
  const e0 = foes(alone)[0];
  close(hit(alone, alone.unit('t_op'), e0, 1000, 'arts'), 1000, 'no 灼燃 without one on the team');
  // a teammate carries 灼燃维式重锤 (规程 chess_item_4_05_e) and another 战栗维式重锤: two kinds
  const h = fight({ ops, units: [
    { chessId: 't_op', row: 10, col: 4, items: [I('6_11')] }, { chessId: 't_b', row: 11, col: 4, items: [I('4_05')] }, { chessId: 't_c', row: 12, col: 4, items: [I('2_03')] },
  ], foes: [[10, 6]] });
  const u = h.unit('t_op'), e = foes(h)[0];
  close(u.s.atk, 500 * (1 + 0.2 * 3), 'two kinds: × (1 + 0.2 × 3)');
  const gauge = () => e.elem.burn ?? 0;
  hit(h, u, e, 1000, 'arts');
  close(gauge(), 100, '灼燃: 10 % of the arts damage as 灼燃损伤');
  // the carrier's own hammer counts for the ATK, not for the grant (the teammate's would)
  const own = fight({ ops, units: [{ chessId: 't_op', row: 10, col: 4, items: [I('6_11'), I('3_09')] }] });
  close(own.unit('t_op').s.atk, 500 * (1 + 0.2 * 2 + 0.25), 'own 加速 hammer: × (1 + 0.2 × 2 + its own 25 %)');
  assert.equal(own.unit('t_op').s.aspd, 130, 'its own 加速 special once');
  done(h);
});

test('规程\'s hammers run without 蒸汽之心: 灼燃维式重锤 (chess_item_4_05_e here) burns on its own', () => {
  const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('4_05')] }], foes: [[10, 6]] });
  const u = h.unit('t_op'), e = foes(h)[0];
  hit(h, u, e, 1000, 'arts');
  close(e.elem.burn ?? 0, 100, '灼燃损伤');
  done(h);
});

test('驱逐者瓦斯: a resistable state on an enemy in the carrier\'s range lasts twice as long', () => {
  const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('5_12')] }], foes: [[10, 6], [5, 1]] });
  const [near, far] = foes(h).sort((a, b) => b.x - a.x);
  h.run(0.3);
  h.b.applyStatus(near, 'stun', { duration: 2 });
  h.b.applyStatus(far, 'stun', { duration: 2 });
  close(near.findBuff('stun').timeLeft, 4, 'in range');
  close(far.findBuff('stun').timeLeft, 2, 'out of range');
  done(h);
});

test('驱逐者防暴装备: during its skill a state it puts on an enemy passes, 50 %, to one other within 1 tile for 3 s', () => {
  const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('6_05')] }], foes: [[10, 6], [10, 7]] });
  const u = h.unit('t_op');
  const [a, b] = foes(h).sort((x, y) => x.x - y.x);
  h.run(0.3); // the gas of the same kit reaches them
  forceRng(h, 0);
  h.b.applyStatus(a, 'stun', { duration: 1, source: u });
  assert.ok(!b.findBuff('stun'), 'not outside a skill');
  u.skill.activate('test', { free: true });
  h.b.applyStatus(a, 'freeze', { duration: 1, source: u });
  close(b.findBuff('cold')?.timeLeft ?? 0, 3 * 2, 'a 冻结 passes as 寒冷, 3 s (× 2 under the gas of the same kit)');
  assert.ok(!a.findBuff('cold') || a.findBuff('freeze'), 'the first keeps its own');
  done(h);
});

test('不退者力场: 阻挡数 +2, max HP and DEF +20 % per blocked enemy; 不退者卫护系统: its skill pulls the enemies within 1.5', () => {
  const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('5_11')] }], foes: [[10, 5], [10, 5]] });
  const u = h.unit('t_op');
  assert.equal(u.s.blockCnt, 4);
  const blocked = foes(h);
  u.blocking.push(...blocked);
  h.run(0.2);
  close(u.s.def, 200 * 1.4, 'two blocked');
  close(u.s.maxHp, 2000 * 1.4);
  u.blocking.length = 0;
  h.run(0.2);
  close(u.s.def, 200, 'none blocked');
  const g = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('6_06')] }], foes: [[10, 5], [10, 8]] });
  const v = g.unit('t_op');
  const [near, far] = foes(g).sort((x, y) => x.x - y.x);
  v.skill.activate('test', { free: true });
  assert.ok(near.findBuff('attract'), 'within 1.5: 诱导');
  assert.ok(!far.findBuff('attract'), 'farther: none');
  assert.equal(g.b.applyStatus(v, 'stun', { duration: 1 }), false, '浓缩嗅盐\'s immunity');
});

test('动能加速器: ASPD +2 per attack up to 60; 动能轰击弩 at 60: 30 % a splash of 100 % ATK around a random enemy in range', () => {
  const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('6_07')] }], foes: [[10, 6]] });
  const u = h.unit('t_op');
  const a0 = u.s.aspd;
  h.b.emit('attack', { attacker: u, targets: foes(h), isSkill: false });
  h.b.emit('attack', { attacker: u, targets: foes(h), isSkill: false });
  assert.equal(u.s.aspd, a0 + 4);
  const g = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('6_08')] }], foes: [[10, 6], [10, 6]] });
  const v = g.unit('t_op');
  for (let i = 0; i < 60; i++) g.b.emit('attack', { attacker: v, targets: [], isSkill: false });
  assert.equal(v.s.aspd, 220);
  assert.ok(v.findBuff('item:kineticMax'));
  g.run(0.6); // past any splash cooldown the seeded rolls above started
  forceRng(g, 0);
  const hp0 = foes(g).map((e) => e.hp);
  g.b.emit('attack', { attacker: v, targets: [], isSkill: false });
  assert.deepEqual(foes(g).map((e, i) => hp0[i] - e.hp), [500 * 1.3, 500 * 1.3], 'both within 1.5 of the struck one (with its own 单手弩 roll)');
  g.b.emit('attack', { attacker: v, targets: [], isSkill: false });
  assert.deepEqual(foes(g).map((e, i) => hp0[i] - e.hp), [650, 650], 'the 0.5 s cooldown');
  done(g);
});

test('天马之耀: HP +60 %, ATK +50 %, 8 % max HP a second, 30 % of each damage\'s amount as 真实 附加 damage', () => {
  const h = fight({ units: [{ chessId: 't_op', row: 10, col: 4, items: [I('6_12')] }], foes: [[10, 6]] });
  const u = h.unit('t_op'), e = foes(h)[0];
  close(u.s.maxHp, 3200);
  close(u.s.atk, 750);
  close(u.s.hpRegen, 3200 * 0.08, '8 % of max HP a second');
  close(hit(h, u, e, 1000), 1300, 'plus 30 % true');
  done(h);
});

test('聚合急救箱: an ally in range going below 50 % HP is healed 35 % / 50 % of its max HP, once a battle', () => {
  for (const [q, r] of [['a', 0.35], ['b', 0.5]]) {
    const ops = { t_op: op('t_op'), t_a: op('t_a'), t_far: op('t_far') };
    const h = fight({ ops, units: [{ chessId: 't_op', row: 10, col: 4, items: [I('2_09', q)] }, { chessId: 't_a', row: 10, col: 6 }, { chessId: 't_far', row: 11, col: 4 }] });
    const a = h.unit('t_a'), far = h.unit('t_far');
    h.b.dealDamage(null, a, { amount: 1200, type: 'true', canDodge: false });
    close(a.hp, 800 + 2000 * r, q);
    h.b.dealDamage(null, a, { amount: 1200, type: 'true', canDodge: false });
    assert.ok(a.hp < 1000, `${q}: once`);
    h.b.dealDamage(null, far, { amount: 1200, type: 'true', canDodge: false });
    close(far.hp, 800, `${q}: out of range`);
    done(h);
  }
});

test('佣兵名牌: ATK and max HP +6 % / +12 % per active bond of the player', () => {
  for (const [q, v] of [['a', 0.06], ['b', 0.12]]) {
    const bonds = { ursusShip: { active: true, tier: 1, layers: 0 }, kazimierzShip: { active: true, tier: 1, layers: 0 }, egirShip: { active: false, tier: 0, layers: 0 } };
    const h = fight({ bonds, units: [{ chessId: 't_op', row: 10, col: 4, items: [I('5_08', q)] }] });
    const u = h.unit('t_op');
    close(u.s.atk, 500 * (1 + 2 * v), q);
    close(u.s.maxHp, 2000 * (1 + 2 * v), q);
    done(h);
  }
});

test('特质 garrison_23 (塔露拉, 规程): a 乌萨斯 member\'s knock-out gives 4 / 6 临时层数 (6 members: 6 / 8) instead of 2 / 4', () => {
  const bb = ACT3.bonds.ursusShip.bb;
  for (const [g, ex] of [['garrison_23_a', 2], ['garrison_23_b', 4]]) {
    for (const six of [false, true]) {
      const n = six ? 6 : 3;
      const ops = {};
      for (let i = 0; i < n; i++) ops[`u${i}`] = { ...op(`u${i}`, { bonds: ['ursusShip'] }), garrisonIds: i === 0 ? [g] : [] };
      const bonds = { ursusShip: { count: n, active: true, tier: six ? 2 : 1, layers: 0 } };
      const h = fight({ ops, bonds, units: Object.keys(ops).map((id, i) => ({ chessId: id, row: 10 + Math.floor(i / 5), col: 3 + (i % 5) })), foes: [[13, 8]] });
      const e = foes(h)[0];
      h.b.dealDamage(h.unit('u1'), e, { amount: 2e9, type: 'true' });
      assert.ok(!e.alive);
      const base = six ? bb['temp_bond_stack_cnt[power]'] : bb.temp_bond_stack_cnt;
      assert.equal(h.b.tempLayerGainsOf('p1').ursusShip, base + ex, `${g} ${n} members`);
      done(h);
    }
  }
});
