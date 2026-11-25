// 卫戍协议：规程's 特质 on the battle side (data/seasons/act3autochess/garrisons.json): the event 特质 that run an effect garrison
// (garrison_trigger_buff → server/sim/content/garrisons/effects/triggered.js), the season's new events
// (effects/events.js), its damage-output and erosion 特质 (effects/hits.js, effects/stats.js) and the range options of
// the old keys (x-4, bond_allinrange). Synthetic operators carrying the season's garrison ids, on the season's data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { ACT3 } from '../helpers/seasonPieces.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { coverageOf } from '../../tools/season-coverage.mjs';
import { AB_FLAG_STATUS } from '../../server/sim/content/garrisons/effects/events.js';
import { DOLL_SWITCH } from '../../server/sim/professions.js';

const close = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);
const GB = (gid) => ACT3.garrisons[gid].bb;

/** Synthetic operator: 2000 HP, 500 ATK, 1 s attacks, 20 s redeploy, a 60-SP skill; `g` = its garrison ids. */
function op(id, { g = [], bonds = [], range } = {}) {
  return {
    ...chessRec({
      id, profession: 'WARRIOR', bonds, tier: 1, rangeGrid: range ?? [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
      stats: { maxHp: 2000, atk: 500, def: 200, res: 10, aspd: 100, bat: 1, respawnTime: 20, spRecovery: 0, blockCnt: 2 },
      skill: { spCost: 60, duration: 5, initSp: 0 },
    }),
    garrisonIds: g,
  };
}
const DUMMY = enemyRec({ key: 'e_d', hp: 1e7, speed: 0, def: 0, res: 0, atk: 0 });
const B = (layers = 0) => ({ count: 3, active: true, tier: 1, layers });

/** A battle on 规程's data: `ops` = { id: [row, col, opts] }, static dummies at `foes` [[r, c]…], run past the start. */
function fight({ ops, foes = [], bonds = {}, start = true }) {
  const chess = {};
  for (const [id, [, , o]] of Object.entries(ops)) chess[id] = op(id, o);
  const data = new DataSource({ ...ACT3, chess: { ...ACT3.chess, ...chess }, enemies: { ...ACT3.enemies, e_d: DUMMY } }, getDefaultSource());
  const h = makeBattle({
    data, bonds, timeLimit: 999, autoFinish: false,
    units: Object.entries(ops).map(([id, [row, col]]) => ({ chessId: id, row, col })),
    enemies: foes.map(([r, c]) => ({ key: 'e_d', pos: [r, c] })),
  });
  if (start) h.run(2); else h.step();
  return h;
}
const foes = (h) => h.b.enemies.filter((e) => e.alive);
const gains = (h) => h.result().perPlayer.p1.layerGains;
const killFoe = (h, e) => { h.b.dealDamage(null, e, { amount: 2e9, type: 'true' }); assert.ok(!e.alive); };
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };
const sp = (u) => u.skill.sp;

test('规程 coverage: every IN_BATTLE 特质 runs (the 整备区 switches: garrisons_act3_switch.test.js; 아미야\'s granted 235 below)', () => {
  const rows = coverageOf('act3autochess').garrisons.filter((r) => r.side === 'battle' && r.status !== 'ok');
  assert.deepEqual(rows.map((r) => `${r.status} ${r.id}`).sort(), []);
});

test('莎草 garrison_44 → 233: each skill start gives the operator in front 2 / 4 SP (no one else)', () => {
  for (const [q, n] of [['a', 2], ['b', 4]]) {
    const h = fight({ ops: { s: [10, 4, { g: [`garrison_44_${q}`, `garrison_233_${q}`] }], f: [10, 5, {}], o: [11, 4, {}] } });
    const [s, f, o] = ['s', 'f', 'o'].map((id) => h.unit(id));
    const was = [sp(s), sp(f), sp(o)];
    h.b.emit('skillStart', { unit: s, skill: s.skill, reason: 'test' });
    assert.deepEqual([sp(s), sp(f), sp(o)].map((v, i) => v - was[i]), [0, n, 0], q);
    assert.equal(GB(`garrison_233_${q}`).sp, n);
    done(h);
  }
});

test('角峰 garrison_88: the first damage to each enemy gives it 2 / 4 s of 寒冷, once per enemy', () => {
  for (const [q, d] of [['a', 2], ['b', 4]]) {
    // out of its range: no attack of its own before the test's hits
    const h = fight({ ops: { k: [10, 4, { g: [`garrison_88_${q}`] }] }, foes: [[13, 7], [13, 8]] });
    const k = h.unit('k');
    const [e1, e2] = foes(h);
    assert.ok(!e1.findBuff('cold') && !e2.findBuff('cold'));
    h.b.dealDamage(k, e1, { amount: 10, type: 'phys', canDodge: false });
    const c = e1.findBuff('cold');
    assert.ok(c, `${q}: cold`);
    close(c.timeLeft, d, `${q} duration`, 0.05);
    h.b.removeBuff(e1, 'cold');
    h.b.dealDamage(k, e1, { amount: 10, type: 'phys', canDodge: false });
    assert.ok(!e1.findBuff('cold'), `${q}: once per enemy`);
    h.b.dealDamage(k, e2, { amount: 10, type: 'phys', canDodge: false });
    assert.ok(e2.findBuff('cold'), `${q}: another enemy`);
    done(h);
  }
});

test('烈夏 garrison_13: the battle start gives the active 乌萨斯 4 / 8 临时层数', () => {
  for (const [q, n] of [['a', 4], ['b', 8]]) {
    const h = fight({ ops: { l: [10, 4, { g: [`garrison_13_${q}`], bonds: ['ursusShip'] }] }, bonds: { ursusShip: B(0) } });
    assert.equal(h.b.tempLayerGainsOf('p1').ursusShip, n, q);
    done(h);
  }
});

// (遥's garrison_113 and 冻河's 190 here: a knock-out with an active 莱塔尼亚 may bring its summons, whose walking body the
// harness invariants do not expect)
test('遥 garrison_113: an enemy knocked out in its attack range (by anyone) → 聚合·奇迹 +1 / +2, at most 12 / 24 a battle', () => {
  for (const [q, n, cap] of [['a', 1, 12], ['b', 2, 24]]) {
    const h = fight({ ops: { y: [10, 4, { g: [`garrison_113_${q}`] }] }, foes: [[12, 4], ...Array.from({ length: 13 }, () => [10, 7])], bonds: { docShip: B(0), miraShip: B(0), egirShip: B(0) } });
    const [out, first, ...rest] = foes(h);
    killFoe(h, out);
    assert.deepEqual(gains(h), {}, `${q}: out of range`);
    killFoe(h, first);
    assert.deepEqual(gains(h), { docShip: n, miraShip: n }, q);
    for (const e of rest) killFoe(h, e);
    assert.deepEqual(gains(h), { docShip: cap, miraShip: cap }, `${q}: cap`);
    done(h);
  }
});

/** 冻河's garrison_190_b (+2 乌萨斯·迅捷 a knock-out in range, 32 a battle) next to the cap raisers: 乌萨斯 after 30 knock-outs. */
function capped(extra, bonds = ['ursusShip', 'kjeragShip']) {
  const h = fight({ ops: { d: [10, 4, { g: ['garrison_190_b'], bonds }], ...extra }, foes: Array.from({ length: 30 }, () => [10, 7]), bonds: { ursusShip: B(0), swiftShip: B(0) } });
  for (const e of foes(h)) killFoe(h, e);
  const n = gains(h).ursusShip;
  done(h);
  return n;
}

test('薇薇安娜 garrison_152 → 156: the battle start raises the cap of every OTHER operator sharing her bonds by 7 / 14', () => {
  assert.equal(capped({}), 32, 'alone');
  for (const [q, add] of [['a', 7], ['b', 14]]) {
    assert.equal(capped({ v: [12, 4, { g: [`garrison_152_${q}`, `garrison_156_${q}`], bonds: ['ursusShip', 'kazimierzShip'] }] }), 32 + add, q);
  }
  assert.equal(capped({ v: [12, 4, { g: ['garrison_152_a', 'garrison_156_a'], bonds: ['egirShip'] }] }), 32, 'no shared bond');
});

test('Mon3tr garrison_153 → 157 (周围八格 ×1.3 / ×1.6) and 凛御银灰 226 → 227 / 228 (身前一格 谢拉格·灵巧 ×1.75 / ×2.5)', () => {
  // facing RIGHT: (10, 3) has 冻河 (10, 4) in front of it
  for (const [g, pos, want] of [[['garrison_153_a', 'garrison_157_a'], [11, 5], 41], [['garrison_153_b', 'garrison_157_b'], [9, 3], 51],
    [['garrison_153_a', 'garrison_157_a'], [12, 4], 32],
    [['garrison_226_a', 'garrison_227_a'], [10, 3], 56], [['garrison_226_b', 'garrison_228_b'], [10, 3], 60], [['garrison_226_a', 'garrison_227_a'], [11, 4], 32]]) {
    assert.equal(capped({ m: [...pos, { g }] }), want, `${g} at ${pos}`);
  }
  assert.equal(capped({ m: [10, 3, { g: ['garrison_226_a', 'garrison_227_a'] }] }, ['ursusShip']), 32, '227: not 谢拉格 / 灵巧');
});

test('艾丽妮 garrison_167 → 169: an enemy knocked out within 周围12格 (x-1) gives her 3 / 6 SP', () => {
  for (const [q, n] of [['a', 3], ['b', 6]]) {
    const h = fight({ ops: { i: [10, 4, { g: [`garrison_167_${q}`, `garrison_169_${q}`] }] }, foes: [[12, 4], [10, 7]] });
    const i = h.unit('i');
    const [near, far] = foes(h);
    let was = sp(i);
    killFoe(h, far);
    assert.equal(sp(i) - was, 0, `${q}: 3 tiles ahead is outside x-1`);
    was = sp(i);
    killFoe(h, near);
    assert.equal(sp(i) - was, n, q);
    done(h);
  }
});

test('远牙 garrison_70 → 150 (−3 / −6 s) and 历阵锐枪芬 170 → 171 (×0.7 / ×0.4): the redeploy time left of the 整备区', () => {
  for (const [q, v] of [['a', 3], ['b', 6]]) {
    const h = fight({ ops: { y: [10, 4, { g: [`garrison_70_${q}`, `garrison_150_${q}`] }], w: [12, 4, {}] }, foes: [[10, 6]] });
    const w = h.unit('w');
    h.b.kill(w);
    const left = w.respawnAt - h.b.time;
    close(left, 20, 'timer');
    killFoe(h, foes(h)[0]);
    close(w.respawnAt - h.b.time, 20 - v, q);
    done(h);
  }
  for (const [q, f] of [['a', 0.7], ['b', 0.4]]) {
    const h = fight({ ops: { x: [10, 4, { g: [`garrison_170_${q}`, `garrison_171_${q}`] }], w: [12, 4, {}] } });
    const [x, w] = ['x', 'w'].map((id) => h.unit(id));
    h.b.kill(w);
    h.run(5);
    h.b.kill(x);
    close(w.respawnAt - h.b.time, 15 * f, `${q}: the waiting operator`);
    close(x.respawnAt - h.b.time, 20, `${q}: not the holder`);
    done(h);
  }
});

test('余 garrison_38 (周围八格) and 烛煌 41 (攻击范围): an enemy\'s element burst in range → own / listed active bonds +1 / +2', () => {
  for (const [q, n] of [['a', 1], ['b', 2]]) {
    const h = fight({ ops: { y: [10, 4, { g: [`garrison_38_${q}`], bonds: ['yanShip', 'steadShip'] }] }, foes: [[11, 5], [10, 7]], bonds: { yanShip: B(0), steadShip: B(0) } });
    const [near, far] = foes(h);
    h.b.dealDamage(null, far, { amount: 1e6, type: 'element', element: 'burn' });
    assert.deepEqual(gains(h), {}, `${q}: outside 周围八格`);
    h.b.dealDamage(null, near, { amount: 1e6, type: 'element', element: 'burn' });
    assert.deepEqual(gains(h), { yanShip: n, steadShip: n }, q);
    done(h);
  }
  const h = fight({ ops: { z: [10, 4, { g: ['garrison_41_a'] }] }, foes: [[10, 7]], bonds: { yanShip: B(0), victoriaShip: B(0) } });
  h.b.dealDamage(null, foes(h)[0], { amount: 1e6, type: 'element', element: 'erosion' });
  assert.deepEqual(gains(h), { yanShip: 1, victoriaShip: 1 });
  done(h);
});

test('浊心斯卡蒂 garrison_64: each deployment of another operator in her attack range → 阿戈尔 +2 / +4 (≤ 20 / 40)', () => {
  for (const [q, n] of [['a', 2], ['b', 4]]) {
    const h = fight({ ops: { s: [10, 4, { g: [`garrison_64_${q}`] }], a: [10, 6, {}], o: [12, 4, {}] }, bonds: { egirShip: B(0) } });
    assert.equal(gains(h).egirShip, n, `${q}: the placement after her`);
    const a = h.unit('a');
    h.b.kill(a);
    a.respawnAt = h.b.time;
    h.run(1);
    assert.ok(a.alive && a.deployed);
    assert.equal(gains(h).egirShip, 2 * n, `${q}: the redeploy`);
    // a 【移动】 is a new character on the spawn path (Character.MoveLikeRespawnSelf): it locates again — into the range
    // counts, out of it does not
    assert.ok(h.b.moveRedeploy(a, 10, 5));
    assert.equal(gains(h).egirShip, 3 * n, `${q}: a 【移动】 inside the range`);
    const o = h.unit('o');
    assert.ok(h.b.moveRedeploy(o, 12, 5));
    assert.equal(gains(h).egirShip, 3 * n, `${q}: a 【移动】 outside the range`);
    done(h);
  }
});

test('深巡 garrison_60 → 142: at each deployment, per 20 / 10 阿戈尔 layers ASPD +1 for 30 s to itself and 周围四格', () => {
  for (const [q, k] of [['a', 2], ['b', 4]]) {
    const h = fight({ ops: { s: [10, 4, { g: [`garrison_60_${q}`, `garrison_142_${q}`] }], n: [11, 4, {}], o: [12, 4, {}] }, bonds: { egirShip: B(40) }, start: false });
    h.run(2);
    const [s, n, o] = ['s', 'n', 'o'].map((id) => h.unit(id));
    for (const u of [s, n]) {
      const b = u.findBuff(`gar:garrison_142_${q}`);
      assert.ok(b, `${q} ${u.defId}`);
      assert.equal(b.mods.aspd, k);
      assert.ok(b.timeLeft > 27 && b.timeLeft <= 30);
    }
    assert.ok(!o.findBuff(`gar:garrison_142_${q}`), `${q}: two tiles away`);
    done(h);
  }
});

test('归溟幽灵鲨 garrison_62 → 146: knocked out → the 阿戈尔 operators of 周围八格 +5 / +10 SP', () => {
  for (const [q, n] of [['a', 5], ['b', 10]]) {
    const h = fight({ ops: { g: [10, 4, { g: [`garrison_62_${q}`, `garrison_146_${q}`], bonds: ['egirShip'] }], e: [11, 5, { bonds: ['egirShip'] }], x: [11, 4, {}] }, bonds: { egirShip: B(0) } });
    const [g, e, x] = ['g', 'e', 'x'].map((id) => h.unit(id));
    const was = [sp(e), sp(x)];
    h.b.kill(g);
    assert.deepEqual([sp(e) - was[0], sp(x) - was[1]], [n, 0], q);
    done(h);
  }
});

test('风丸 garrison_124: knocked out, and every 替身 ⇄ 本体 switch ("与傀儡发生替换") → 已激活的不屈 +2 / +4, ≤ 10 / 20 per battle', () => {
  // the real piece (傀儡师 trait, kit) on 规程's data; until 2026-11-14 only the knock-out of the 替身 added layers
  for (const [q, n, cap] of [['a', 2, 10], ['b', 4, 20]]) {
    const id = `chess_char_3_24_${q}`;
    const data = new DataSource({ ...ACT3, enemies: { ...ACT3.enemies, e_d: DUMMY } }, getDefaultSource());
    const h = makeBattle({ data, bonds: { indomShip: B(0) }, timeLimit: 999, autoFinish: false, units: [{ chessId: id, row: 10, col: 4 }] });
    h.run(2);
    const k = h.unit(id);
    const indom = () => gains(h).indomShip ?? 0;
    // past the switch's own 不死 window (DOLL_SWITCH) before the next lethal hit
    const fatal = () => { h.b.dealDamage(null, k, { amount: 1e9, type: 'true' }); h.step(1); h.run(DOLL_SWITCH + 0.5); };
    fatal();
    assert.ok(k.alive && k.trait.doll, `${q}: 替身`);
    assert.equal(indom(), n, `${q}: 本体 → 替身`);
    h.run(20);
    assert.ok(k.alive && !k.trait.doll, `${q}: back`);
    assert.equal(indom(), 2 * n, `${q}: 替身 → 本体`);
    h.run(DOLL_SWITCH + 0.5);
    fatal();
    assert.equal(indom(), 3 * n, `${q}: second switch`);
    // knocked out as the 替身, and 不屈 redeploys her at once (its roll forced): one knock-out, not one more switch
    const rng = h.b.rng;
    h.b.rng = Object.assign(() => 0, rng);
    fatal();
    h.b.rng = rng;
    assert.ok(k.alive && !k.trait.doll, `${q}: the 替身 knocked out, 不屈 redeployed the 本体`);
    assert.equal(indom(), 4 * n, `${q}: knocked out as the 替身 (+${n} once)`);
    h.run(2);
    fatal();
    h.run(20);
    assert.equal(indom(), cap, `${q}: the per-battle cap`);
    done(h);
  }
});

test('水月 garrison_59: per 20 / 10 阿戈尔 layers, damage from her and 周围四格 slows the target 1 % for 3 s', () => {
  for (const [q, k] of [['a', 2], ['b', 4]]) {
    const h = fight({ ops: { m: [10, 4, { g: [`garrison_59_${q}`] }], n: [11, 4, {}], o: [12, 4, {}] }, foes: [[10, 7], [10, 8]], bonds: { egirShip: B(40) }, start: false });
    const [m, n, o] = ['m', 'n', 'o'].map((id) => h.unit(id));
    const [e1, e2] = foes(h);
    h.b.dealDamage(o, e2, { amount: 10, type: 'phys', canDodge: false });
    assert.ok(!e2.buffs.some((b) => b.key.startsWith('gar:garrison_59')), `${q}: two tiles away`);
    for (const src of [m, n]) {
      h.b.dealDamage(src, e1, { amount: 10, type: 'phys', canDodge: false });
      const b = e1.findBuff(`gar:garrison_59_${q}:${m.id}`);
      assert.ok(b, q);
      close(b.mods.moveMul, 1 - 0.01 * k, q);
      close(b.timeLeft, 3, q, 0.05);
    }
    done(h);
  }
});

test('克莱门莎 garrison_65: an enemy she blocks recovers from its 侵蚀 burst 1 % faster per 20 / 10 阿戈尔 layers', () => {
  for (const [q, k] of [['a', 2], ['b', 4]]) {
    const h = fight({ ops: { c: [10, 4, { g: [`garrison_65_${q}`] }] }, foes: [[10, 6], [10, 7]], bonds: { egirShip: B(40) } });
    const c = h.unit('c');
    const [held, free] = foes(h);
    held.blockedBy = c;
    for (const e of [held, free]) h.b.dealDamage(null, e, { amount: 1e6, type: 'element', element: 'erosion' });
    const t0 = [held, free].map((e) => e.findBuff('erosionBurst').timeLeft);
    h.run(2);
    const t1 = [held, free].map((e) => e.findBuff('erosionBurst').timeLeft);
    close(t0[1] - t1[1], 2, `${q}: unblocked`, 0.05);
    close(t0[0] - t1[0], 2 * (1 + 0.01 * k), `${q}: blocked`, 0.05);
    held.blockedBy = null;
    done(h);
  }
});

test('garrison_237 (bond_allinrange b-4): a stun in 周围八格 → the active bonds of the operator BEHIND, not the holder\'s', () => {
  const h = fight({ ops: { h: [10, 4, { g: ['garrison_237_a'], bonds: ['yanShip'] }], b: [10, 3, { bonds: ['kjeragShip'] }] }, foes: [[11, 5], [10, 8]], bonds: { yanShip: B(0), kjeragShip: B(0) } });
  const [near, far] = foes(h);
  h.b.applyStatus(far, 'stun', { duration: 1, source: null, force: true });
  assert.deepEqual(gains(h), {}, 'outside 周围八格');
  h.b.applyStatus(near, 'stun', { duration: 1, source: null, force: true });
  assert.deepEqual(gains(h), { kjeragShip: 1 });
  done(h);
});

test('아미야 garrison_114 → 235: the operator in front gets +1 / +2 on each of its trait and equipment gains, past its cap; no one else', () => {
  const skill = (h, u) => h.b.emit('skillStart', { unit: u, skill: u.skill, reason: 'test' });
  for (const [q, extra] of [['a', 1], ['b', 2]]) {
    assert.equal(ACT3.garrisons[`garrison_235_${q}`].bb.extra_cnt, extra);
    // facing RIGHT: 아미야 (10, 4) has (10, 5) in front; (11, 4) is beside her
    const h = fight({
      ops: { a: [10, 4, { g: [`garrison_114_${q}`] }], f: [10, 5, { g: ['garrison_143_a'], bonds: ['sargonShip'] }], s: [11, 4, { g: ['garrison_143_a'], bonds: ['egirShip'] }] },
      bonds: { sargonShip: B(0), egirShip: B(0) },
    });
    const [a, f, s] = ['a', 'f', 's'].map((id) => h.unit(id));
    skill(h, f);
    assert.equal(gains(h).sargonShip, 1 + extra, 'a 特质 gain of the operator in front');
    for (let i = 0; i < 10; i++) skill(h, f);
    assert.equal(gains(h).sargonShip, 7 * (1 + extra), 'its cap (7) counts the base only; a capped gain gets no extra');
    skill(h, s);
    assert.equal(gains(h).egirShip, 1, 'beside her: no extra');
    h.b.addLayers('p1', 'egirShip', 2, 'item', { source: f });
    assert.equal(gains(h).egirShip, 3 + extra, 'an equipment gain of the operator in front');
    h.b.addLayers('p1', 'egirShip', 2, 'bond', { source: f });
    assert.equal(gains(h).egirShip, 5 + extra, 'a bond\'s own gain: no extra');
    h.b.addLayers('p1', 'egirShip', 2, 'garrison', { source: a });
    assert.equal(gains(h).egirShip, 7 + extra, '아미야\'s own gain: no extra');
    done(h);
  }
});

test('妮芙 garrison_99 (check_ab_flag 33 = 恐惧): an enemy in range entering 恐惧 → 迅捷 +4 / +8 (≤ 20 / 40); 冻结 does not count', () => {
  for (const [q, n, cap] of [['a', 4, 20], ['b', 8, 40]]) {
    assert.equal(GB(`garrison_99_${q}`).check_ab_flag, 33);
    const h = fight({ ops: { y: [10, 4, { g: [`garrison_99_${q}`] }] }, foes: [[10, 6], [12, 9]], bonds: { swiftShip: B(0), yanShip: B(0) } });
    const [near, far] = foes(h);
    h.b.applyStatus(far, 'fear', { duration: 1 });
    assert.deepEqual(gains(h), {}, `${q}: out of range`);
    h.b.applyStatus(near, 'freeze', { duration: 1 });
    assert.deepEqual(gains(h), {}, `${q}: 冻结 is not 恐惧`);
    h.b.applyStatus(near, 'fear', { duration: 1 });
    assert.deepEqual(gains(h), { swiftShip: n }, q);
    h.b.applyStatus(near, 'fear', { duration: 2 });
    assert.deepEqual(gains(h), { swiftShip: n }, `${q}: already afraid`);
    for (let i = 0; i < 10; i++) { h.b.removeStatus(near, 'fear'); h.b.applyStatus(near, 'fear', { duration: 1 }); }
    assert.deepEqual(gains(h), { swiftShip: cap }, `${q}: the per-battle cap`);
    done(h);
  }
});

test('妮芙 garrison_99 on the real piece: her S2 怵然震爆 fears the target and stacks 迅捷', () => {
  const data = new DataSource({ ...ACT3, enemies: { ...ACT3.enemies, e_d: DUMMY } }, getDefaultSource());
  const h = makeBattle({
    data, bonds: { swiftShip: B(0) }, timeLimit: 999, autoFinish: false,
    units: [{ chessId: 'chess_char_6_10_a', row: 10, col: 4 }], enemies: [{ key: 'e_d', pos: [10, 6] }],
  });
  const feared = [];
  h.b.on('statusApplied', (c) => { if (c.status === 'fear') feared.push(c.target); });
  h.runUntil(() => feared.length > 0, 60);
  assert.ok(feared.length > 0, 'S2 fears its target');
  assert.equal(gains(h).swiftShip, ACT3.garrisons.garrison_99_a.bb.bond_add_count);
  done(h);
});

test('every check_ab_flag of the data names a status the layer-event 特质 watches', () => {
  // every season's table, the hidden ones too (a new season's 特质 must not fall silent)
  const files = ['data/garrisons.json', ...readdirSync('data/seasons').map((s) => `data/seasons/${s}/garrisons.json`).filter((f) => existsSync(f))];
  const seen = new Set();
  for (const f of files) {
    for (const g of Object.values(JSON.parse(readFileSync(f, 'utf8')))) {
      if (g && g.effectKey === 'act1autochess_gar_event_enemy_abflag_inrange') seen.add(Number(g.bb.check_ab_flag));
    }
  }
  assert.ok(seen.has(16) && seen.has(33), [...seen].join());
  for (const f of seen) assert.ok(AB_FLAG_STATUS[f], `check_ab_flag ${f} has no status`);
});
