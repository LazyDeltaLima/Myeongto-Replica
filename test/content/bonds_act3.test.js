// 卫戍协议：规程's bond effects (server/sim/content/bonds/nation/ and general/, their act3 templates) on that season's
// bonds.json, the 临时层数 of 乌萨斯 through the battle result and the match's settle (乌啾 / 折桠 convert some), and the
// default season left as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { regulationBb, abnormalCount } from '../../server/sim/content/bonds/regulation.js';
import { bondBb as coreBb } from '../../server/sim/content/bonds/core.js';
import { makeMatch, legalTileFor } from '../match/harness.js';
import { PHASE } from '../../shared/constants.js';
import { COLS } from '../../server/sim/constants.js';

const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);
const op = (id, bonds, extra = {}) => chessRec({
  id, bonds, profession: 'WARRIOR', skill: null, ...extra,
  stats: { atk: 1000, maxHp: 10000, def: 0, blockCnt: 2, ...(extra.stats || {}) },
});
const bondOn = (count, layers = 0, thresholds = [3, 6]) => ({ count, active: count >= thresholds[0], tier: thresholds.filter((t) => count >= t).length, layers });
const dummy = enemyRec({ key: 'e_dummy', hp: 1e9, speed: 0, def: 0, res: 0 });
const tagged = (h, tag) => h.hooksOf('damaged').filter((c) => c.dmg && c.dmg.tags && c.dmg.tags.includes(tag));
const bbOf = (bondId) => ACT3.bonds[bondId].bb;

/** A battle on 规程's data: `list` = [[chessId, bonds, extra?]] placed row-major on rows 10–11 from col 3. */
function fight(list, bonds, { enemies = [{ key: 'e_dummy', count: 3, interval: 0 }], defs = {}, units = null, seed = 3, ...rest } = {}) {
  const chess = {};
  for (const [id, b, extra] of list) chess[id] = op(id, b, extra);
  const data = new DataSource({ ...ACT3, chess: { ...ACT3.chess, ...chess, ...(defs.chess || {}) }, enemies: { ...ACT3.enemies, e_dummy: dummy, ...(defs.enemies || {}) } }, getDefaultSource());
  const h = makeBattle({
    data, seed, bonds, enemies, autoFinish: false, timeLimit: 300, captureNoisy: true,
    hooks: ['damaged', 'death', 'statusApplied', 'deploy', 'layerGain'],
    units: units ?? list.map(([id], i) => ({ chessId: id, row: 10 + Math.floor(i / 7), col: 3 + (i % 7) })),
    ...rest,
  });
  h.step(2);
  return h;
}
const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}_a`);

test('规程 bonds: the templates are the season\'s own; the default season\'s 炎 / 奥术 are untouched', () => {
  assert.ok(regulationBb('yanShip', 'act3autochess_bond_eff_yan', { data: { all: ACT3 } }));
  assert.equal(regulationBb('yanShip', 'act3autochess_bond_eff_yan', null), null, 'the default season has no act3 炎');
  assert.ok(coreBb('sargonShip', undefined, { data: { all: ACT3 } }), '萨尔贡 base: core knows the act3 key');
  assert.ok(coreBb('kjeragShip', undefined, { data: { all: ACT3 } }), '谢拉格 base: core knows the act3 key');
  assert.equal(coreBb('yanShip', undefined, { data: { all: ACT3 } }), null, 'core runs no 炎 of 规程');
});

test('规程 炎: ATK +(0.23 + 0.009L); 6: every non-附加 damage adds ATK × 6 % of a random element; enemies leave a 爆发冷却 faster', () => {
  const bb = bbOf('yanShip');
  const L = 50;
  const list = ids('y', 6).map((id) => [id, ['yanShip']]);
  {
    const h = fight(list.slice(0, 3), { yanShip: bondOn(3, L) });
    close(h.unit('y0_a').s.atk, 1000 * (1 + bb.atk_base + bb.atk_per_stack * L));
    const e = h.enemies()[0];
    h.b.dealDamage(h.unit('y0_a'), e, { amount: 100, type: 'phys' });
    assert.equal(tagged(h, 'bond:yan').length, 0, 'no element rider below 6');
  }
  const h = fight(list, { yanShip: bondOn(6, L) });
  const y0 = h.unit('y0_a'), e = h.enemies()[0];
  const seen = new Set();
  // the gauges emptied after each hit: no burst (its 爆发冷却 would lock every gauge and hide the later rolls)
  for (let i = 0; i < 40; i++) { h.b.dealDamage(y0, e, { amount: 1, type: 'phys' }); for (const k in e.elem) e.elem[k] = 0; }
  const riders = tagged(h, 'bond:yan');
  for (const c of riders) seen.add(c.dmg.element);
  assert.ok(riders.length > 22 && riders.length < 38, `≈ 4 / 5 of the 40 hits fill a gauge (狂躁 is not in this engine): ${riders.length}`);
  assert.ok(['neural', 'erosion', 'burn', 'apoptosis'].every((x) => seen.has(x)), [...seen].join());
  const want = y0.s.atk * (bb.ex_atk_scale_base + bb.ex_atk_scale_per_stack * L);
  // the element hit's `amount` is the gauge gain (× the enemy's intake, 1 here)
  for (const c of riders.slice(0, 3)) close(c.amount, want, 1e-6);
  const before = riders.length;
  h.b.dealDamage(y0, e, { amount: 1, type: 'phys', tags: ['addition'] });
  assert.equal(tagged(h, 'bond:yan').length, before, 'an 附加 damage adds none');
  // the 爆发冷却 runs (1 + 0.4 + 0.003 L)× faster
  const lock = e.buffs.find((b) => b.flags && b.flags.burstLock) ?? h.b.addBuff(e, { key: 'burnBurst', duration: 10, flags: { burstLock: true } });
  const t0 = lock.timeLeft;
  h.run(1);
  const v = bb.ep_break_recover_speed_base + bb.ep_break_recover_speed_per_stack * L;
  close(t0 - lock.timeLeft, 1 + v, 0.08, 'one second of cooldown');
  checkInvariants(h.b);
  assert.deepEqual(h.b.errors, []);
});

test('规程 乌萨斯: ATK / HP +(base + per·L); a member\'s knock-out → 临时层数 +2 (6: +4), live, and kept apart in the result', () => {
  const bb = bbOf('ursusShip');
  const list = ids('u', 6).map((id) => [id, ['ursusShip']]);
  for (const six of [false, true]) {
    const h = fight(six ? list : list.slice(0, 3), { ursusShip: bondOn(six ? 6 : 3, 10) });
    const u0 = h.unit('u0_a');
    close(u0.s.atk, 1000 * (1 + bb.atk_base + bb.atk_per_stack * 10));
    close(u0.s.maxHp, 10000 * (1 + bb.hp_base + bb.hp_per_stack * 10));
    const e = h.enemies()[0];
    h.b.dealDamage(u0, e, { amount: 2e9, type: 'true' });
    assert.ok(!e.alive);
    const add = six ? bb['temp_bond_stack_cnt[power]'] : bb.temp_bond_stack_cnt;
    assert.equal(h.b.getPlayer('p1').bonds.ursusShip.layers, 10 + add, 'live layers');
    const pp = h.b._pp('p1');
    assert.equal(pp.tempLayerGains?.ursusShip, add, 'the result keeps them as 临时层数');
    assert.equal(pp.layerGains.ursusShip, undefined, 'not a fixed gain');
    h.step(2);
    close(u0.s.atk, 1000 * (1 + bb.atk_base + bb.atk_per_stack * (10 + add)), 1e-6, 'the bonus follows them');
    // an enemy knocked out by no member gives none
    h.b.dealDamage(null, h.enemies()[0], { amount: 2e9, type: 'true', sourceless: true });
    assert.equal(h.b.getPlayer('p1').bonds.ursusShip.layers, 10 + add);
    assert.deepEqual(h.b.errors, []);
  }
});

test('规程 乌萨斯 6: the cut part of a hit is lost over 10 s and stops with its source; blocked enemies take ATK × (0.5 + 0.0025L) arts per second', () => {
  const bb = bbOf('ursusShip');
  const L = 100;
  const list = ids('u', 6).map((id) => [id, ['ursusShip']]);
  const walker = enemyRec({ key: 'e_walk', hp: 1e9, speed: 1, atk: 0 });
  const h = fight(list, { ursusShip: bondOn(6, L) }, {
    enemies: [{ key: 'e_walk', route: 0 }, { key: 'e_dummy', count: 2 }], defs: { enemies: { e_walk: walker } },
    units: list.map(([id], i) => ({ chessId: id, row: i === 0 ? 9 : 12, col: i === 0 ? 5 : 2 + i })),
  });
  const u0 = h.unit('u0_a'), u1 = h.unit('u1_a');
  const f = bb.damage_one_minus_base + bb.damage_one_minus_per_stack * L;
  const src = h.enemies().find((x) => x.defId === 'enemy_e_dummy');
  assert.ok(src);
  const hp0 = u1.hp;
  h.b.dealDamage(src, u1, { amount: 1000, type: 'phys' });
  close(hp0 - u1.hp, 1000 * (1 - f), 1e-6, 'the hit is cut');
  h.run(3.05);
  close(hp0 - u1.hp, 1000 * (1 - f) + 3 * (1000 * f) / 10, 1e-6, 'three seconds of the loss');
  // a 真实 hit is not cut
  const hp1 = u1.hp;
  h.b.dealDamage(src, u1, { amount: 100, type: 'true' });
  h.step();
  close(hp1 - u1.hp, 100 + 0, 1e-6, '真实 is not cut (no loss tick in this step)');
  // the source knocked out: no more loss
  h.b.dealDamage(null, src, { amount: 2e9, type: 'true', sourceless: true });
  const hp2 = u1.hp;
  h.run(3);
  close(u1.hp, hp2, 1e-6, 'stopped with its source');
  // block damage
  assert.ok(h.runUntil(() => u0.blocking.length > 0, 30), 'blocked');
  h.run(3.05);
  const blk = tagged(h, 'bond:ursus').filter((c) => c.source === u0);
  assert.ok(blk.length >= 2, `per second while blocking: ${blk.length}`);
  close(blk[0].amount, u0.s.atk * (bb.atk_scale_base + bb.atk_scale_per_stack * L), 1e-6);
  assert.equal(blk[0].dmg.type, 'arts');
  assert.deepEqual(h.b.errors, []);
});

test('规程 伊比利亚: each hit stacks a per-member 持续法术伤害 (≤ 10, 0.2 s gate); 6: ×2, −4 % speed a hit, 20 % bounce of 300 % ATK', () => {
  const bb = bbOf('iberiaShip');
  const L = 40;
  const k = bb.dot_atk_scale_base + bb.dot_atk_scale_per_stack * L;
  const list = ids('i', 6).map((id) => [id, ['iberiaShip']]);
  {
    const h = fight(list.slice(0, 3), { iberiaShip: bondOn(3, L) });
    const i0 = h.unit('i0_a'), e = h.enemies()[0];
    h.b.dealDamage(i0, e, { amount: 1, type: 'phys' });
    h.b.dealDamage(i0, e, { amount: 1, type: 'phys' }); // inside the 0.2 s gate: no second stack
    h.run(0.25);
    h.b.dealDamage(i0, e, { amount: 1, type: 'phys' });
    h.run(1);
    const ticks = tagged(h, 'bond:iberia:dot');
    assert.equal(ticks.length, 1, 'the first tick one second after the first stack');
    close(ticks[0].amount, 2 * k * i0.s.atk, 1e-6, 'two stacks');
    assert.equal(ticks[0].dmg.type, 'arts');
    for (let i = 0; i < 15; i++) { h.run(0.21); h.b.dealDamage(i0, e, { amount: 1, type: 'phys' }); }
    h.run(1);
    const last = tagged(h, 'bond:iberia:dot').at(-1);
    close(last.amount, 10 * k * i0.s.atk, 1e-6, 'at most 10 stacks');
    assert.ok(!e.findBuff('bond:iberia:slow'), 'no slow below 6');
    h.b.dealDamage(i0, e, { amount: 1, type: 'phys', tags: ['addition'] });
    assert.deepEqual(h.b.errors, []);
  }
  const h = fight(list, { iberiaShip: bondOn(6, L) }, { enemies: [{ key: 'e_dummy', count: 6, interval: 0 }] });
  const i0 = h.unit('i0_a'), e = h.enemies()[0];
  for (let i = 0; i < 30; i++) { h.b.dealDamage(i0, e, { amount: 1, type: 'phys' }); h.run(0.21); }
  const slow = e.findBuff('bond:iberia:slow');
  assert.ok(slow, 'slowed');
  close(e.s.moveMul ?? slow.mods.moveMul, 1 - 0.04 * 20, 1e-6, '−80 % at most');
  const tick = tagged(h, 'bond:iberia:dot').filter((c) => c.target === e).at(-1);
  close(tick.amount, 2 * 10 * k * i0.s.atk, 1e-6, '×2 at 6');
  const bounces = tagged(h, 'bond:iberia:bounce');
  assert.ok(bounces.length >= 2 && bounces.length <= 15, `≈ 20 % of 30 hits bounce: ${bounces.length}`);
  for (const b of bounces) { assert.ok(b.target !== e); close(b.amount, 3 * i0.s.atk, 1e-6); assert.ok(b.dmg.isSplash); }
  assert.deepEqual(h.b.errors, []);
});

test('规程 叙拉古: deployment ASPD; 6: 30 % of attacks give one random status for 1 + 0.0018L s; two statuses → 800 + 10L true around each second', () => {
  const bb = bbOf('siracusaShip');
  const L = 100;
  const list = ids('s', 6).map((id) => [id, ['siracusaShip']]);
  const h = fight(list, { siracusaShip: bondOn(6, L) }, { enemies: [{ key: 'e_dummy', count: 4, interval: 0 }] });
  const s0 = h.unit('s0_a'), e = h.enemies()[0];
  assert.ok(s0.findBuff('bond:siracusa'), 'the deployment buff');
  close(s0.s.aspd - 100, bb.base_attack_speed + bb.attack_speed_per_stack * L, 1e-6);
  for (let i = 0; i < 40; i++) { h.b.dealDamage(s0, e, { amount: 1, type: 'phys', isAttack: true }); h.run(0.21); }
  const st = h.hooksOf('statusApplied').filter((c) => c.source === s0);
  assert.ok(st.length >= 4 && st.length <= 25, `≈ 30 % of 40: ${st.length}`);
  const dur = bb.ab_buff_duration_base + bb.ab_buff_duration_per_stack * L;
  assert.ok(st.every((c) => ['stun', 'fear', 'attract', 'cold', 'freeze', 'palsy', 'groundbind'].includes(c.status)), st.map((c) => c.status).join());
  assert.ok(st.some((c) => Math.abs(c.duration - dur) < 1e-6));
  // two statuses at once → the true pulse on it and around it, sourceless
  const e2 = h.enemies()[1];
  h.b.applyStatus(e2, 'stun', { duration: 5 });
  h.b.applyStatus(e2, 'groundbind', { duration: 5 });
  assert.equal(abnormalCount(e2), 2);
  const n0 = tagged(h, 'bond:siracusa').filter((c) => c.target === e2).length;
  h.run(1.05);
  const pulses = tagged(h, 'bond:siracusa').filter((c) => c.target === e2).slice(n0);
  assert.ok(pulses.length >= 1);
  close(pulses[0].amount, bb.damage_value_base + bb.damage_value_per_stack * L, 1e-6);
  assert.ok(pulses[0].dmg.sourceless && pulses[0].dmg.type === 'true');
  assert.deepEqual(h.b.errors, []);
});

test('规程 卡西米尔 6: for 30 s after the deployment or a skill, a member\'s non-附加 damage adds 65 % ATK true; not after', () => {
  const list = ids('k', 6).map((id) => [id, ['kazimierzShip']]);
  const h = fight(list, { kazimierzShip: bondOn(6, 0) });
  const k0 = h.unit('k0_a'), e = h.enemies()[0];
  h.b.dealDamage(k0, e, { amount: 1, type: 'phys' });
  const x = tagged(h, 'bond:kazimierz');
  assert.equal(x.length, 1);
  close(x[0].amount, 0.65 * k0.s.atk, 1e-6);
  assert.equal(x[0].dmg.type, 'true');
  h.b.dealDamage(k0, e, { amount: 1, type: 'phys', tags: ['addition'] });
  assert.equal(tagged(h, 'bond:kazimierz').length, 1, 'not on an 附加 damage (its own included)');
  h.run(30.1);
  h.b.dealDamage(k0, e, { amount: 1, type: 'phys' });
  assert.equal(tagged(h, 'bond:kazimierz').length, 1, 'over after 30 s');
  h.b.emit('skillStart', { unit: k0, skill: k0.skill, reason: 'test' });
  h.b.dealDamage(k0, e, { amount: 1, type: 'phys' });
  assert.equal(tagged(h, 'bond:kazimierz').length, 2, 'a skill opens it again');
  // the field's deployments: 6 × 20 % ≤ 50 % at 0 layers
  close(k0.s.atk, 1000 * 1.5, 1e-6);
  assert.deepEqual(h.b.errors, []);
});

test('规程 奥术: each non-附加 damage adds ATK × (0.2 + 0.004L) arts; 3: an enemy loses 1 RES a hit, down to −(30 + 0.05L)', () => {
  const bb = bbOf('arcaneShip');
  const L = 100;
  const res = enemyRec({ key: 'e_res', hp: 1e9, speed: 0, def: 0, res: 100 });
  const h = fight(ids('a', 3).map((id) => [id, ['arcaneShip']]), { arcaneShip: bondOn(3, L, [2, 3]) }, { enemies: [{ key: 'e_res' }], defs: { enemies: { e_res: res } } });
  const a0 = h.unit('a0_a'), e = h.enemies()[0];
  h.b.dealDamage(a0, e, { amount: 1, type: 'phys' });
  const x = tagged(h, 'bond:arcane');
  assert.equal(x.length, 1);
  assert.equal(x[0].dmg.type, 'arts');
  const floor = bb.magic_res_max_base + bb.magic_res_max_per_stack * L;
  for (let i = 0; i < 60; i++) h.b.dealDamage(a0, e, { amount: 1, type: 'phys', tags: ['addition'] });
  h.step();
  close(e.s.res, 100 + floor, 1e-6, `RES floor ${floor}`);
  assert.equal(tagged(h, 'bond:arcane').length, 1, 'no rider on 附加 damage');
  assert.deepEqual(h.b.errors, []);
});

test('规程 奥术 3: the 隐匿 of enemies in a member\'s attack range is off (not at 2, not out of range)', () => {
  const run = (n, inRange = true) => {
    const h = fight(ids('a', n).map((id) => [id, ['arcaneShip']]), { arcaneShip: bondOn(n, 0, [2, 3]) }, { enemies: [] });
    const a0 = h.unit('a0_a');
    const key = inRange ? [...a0.rangeKeys][0] : 0;
    const e = h.spawn('e_dummy', { pos: [Math.floor(key / COLS), key % COLS] });
    h.b.applyStatus(e, 'stealth', { duration: 30 });
    h.run(0.5);
    assert.deepEqual(h.b.errors, []);
    return !!e.s.flags.reveal;
  };
  assert.equal(run(3), true, '3 members: revealed');
  assert.equal(run(2), false, '2 members: still hidden');
  assert.equal(run(3, false), false, 'out of every range: still hidden');
});

test('规程 聚合: allies in a member\'s range regenerate ATK × (0.16 + 0.0012L) HP a second; 3: 庇护 0.15 + 0.0008L', () => {
  const bb = bbOf('docShip');
  const L = 50;
  const list = [['d0_a', ['docShip'], { rangeGrid: [[0, 0], [0, 1]] }], ['d1_a', ['docShip']], ['d2_a', ['docShip']], ['x_a', ['preciShip']]];
  const h = fight(list, { docShip: bondOn(3, L, [2, 3]) }, { units: [{ chessId: 'd0_a', row: 10, col: 3 }, { chessId: 'x_a', row: 10, col: 4 }, { chessId: 'd1_a', row: 12, col: 8 }, { chessId: 'd2_a', row: 12, col: 10 }] });
  const x = h.unit('x_a');
  const d0 = h.unit('d0_a');
  h.b.dealDamage(null, x, { amount: 5000, type: 'true', sourceless: true });
  const hp0 = x.hp;
  h.run(1);
  close(x.hp - hp0, d0.s.atk * (bb.heal_base + bb.heal_per_stack * L), 2, 'one second of regeneration');
  close(x.findBuff('protect')?.data?.value ?? 0, bb.damage_res_base + bb.damage_res_per_stack * L, 1e-6, '庇护');
  assert.deepEqual(h.b.errors, []);
});

test('规程 维多利亚 / 阿戈尔: the same templates with the season\'s numbers (equipment ATK 0.4 + 0.4; 阿戈尔\'s revive at 6)', () => {
  const vb = coreBb('victoriaShip', undefined, { data: { all: ACT3 } });
  assert.equal(vb.atk_normal_equip, 0.4);
  assert.equal(vb.atk_golden_equip, 0.4);
  const eb = coreBb('egirShip', undefined, { data: { all: ACT3 } });
  assert.equal(eb.power_bond_char_cnt, 6);
});

test('规程 临时层数 (real match): the battle\'s 乌萨斯 temp layers lapse at the settle; 乌啾 turns 1 per 乌萨斯 on the board, 折桠 2, into fixed ones', () => {
  const TRAITS = { chess_char_3_03_a: 3, chess_char_1_01_a: 2 };
  for (const trait of [null, 'chess_char_3_03_a', 'chess_char_1_01_a']) {
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 5, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
    h.toPrep(3, { band: 'band_amiya' });
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const ursus = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && c.bonds.includes('ursusShip') && !TRAITS[c.chessId]);
    const lineup = [trait ?? ursus[2].chessId, ursus[0].chessId, ursus[1].chessId];
    const used = new Set();
    for (const id of lineup) {
      const piece = ps.acquireChess(id, { source: 'buy' });
      const [row, col] = legalTileFor(m, ps, id, used);
      used.add(`${row},${col}`);
      assert.equal(m.handle('p_0', { t: 'g.move', uid: piece.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }).ok, true);
    }
    ps.recompute();
    assert.ok(ps.bonds.ursusShip.active, '乌萨斯 active');
    const before = ps.layers.ursusShip || 0;
    // the battle's result, as a finished combat leaves it (Match._finishCombat), then the settle
    m.phase = PHASE.COMBAT;
    m.lastResults.set('p_0', { killed: 0, total: 0, leaked: [], perfect: true, layerGains: { ursusShip: 1 }, tempLayerGains: { ursusShip: 10 }, coins: 0, damageDealt: 0, unitsEnd: [], unitStats: [] });
    m.settle(null, null);
    const want = before + 1 + (trait ? TRAITS[trait] : 0);
    assert.equal(ps.layers.ursusShip, want, `${trait ?? 'no trait'}: 1 fixed + the converted ones; the other temp layers lapse`);
    assert.equal(ps.tempLayers, null);
    assert.equal(m.errorCount, 0);
    m.dispose?.();
  }
});

test('规程 谢拉格: every 100 layers pay one 谢拉格不融冰 while the bond is active (bond_layer_added_reward_equip, the 维多利亚 payout)', () => {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 5, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(3, { band: 'band_amiya' });
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.recompute();
  const ice = ACT3.choices.pools.pool_equip_kjeragbond2.items[0];
  assert.equal(ACT3.items[ice].name, '谢拉格不融冰');
  const ices = () => [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'item' && p.id.replace(/_[ab]$/, '') === ice.replace(/_a$/, ''))
    .reduce((n, p) => n + (/_b$/.test(p.id) ? 2 : 1), 0);
  ps.addLayers('kjeragShip', 120);
  assert.equal(ices(), 0, 'inactive: none');
  const used = new Set();
  for (const c of Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && c.bonds.includes('kjeragShip')).slice(0, 3)) {
    const piece = ps.acquireChess(c.chessId, { source: 'buy' });
    const [row, col] = legalTileFor(m, ps, c.chessId, used);
    used.add(`${row},${col}`);
    assert.equal(m.handle('p_0', { t: 'g.move', uid: piece.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }).ok, true);
  }
  assert.ok(ps.bonds.kjeragShip.active);
  m.dispatch(ps, 'onPrepStart', { round: m.round });
  assert.equal(ices(), 1, 'the milestone of 100, once active');
  ps.addLayers('kjeragShip', 70);
  assert.equal(ices(), 1);
  ps.addLayers('kjeragShip', 10); // 200
  assert.equal(ices(), 2);
  assert.equal(ps.counters['bond:kjerag:reward'], 2);
  assert.equal(m.errorCount, 0);
  m.dispose?.();
});

/** A solo 规程 match at PREP R3 with an empty board and `n` visible `bondId` operators placed (the bond active). */
function prepWithBond(bondId, n, seed = 5) {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(3, { band: 'band_amiya' });
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.recompute();
  const used = new Set();
  for (const c of Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && c.bonds.includes(bondId)).slice(0, n)) {
    const piece = ps.acquireChess(c.chessId, { source: 'buy' });
    const [row, col] = legalTileFor(m, ps, c.chessId, used);
    used.add(`${row},${col}`);
    assert.equal(m.handle('p_0', { t: 'g.move', uid: piece.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }).ok, true);
  }
  return { h, m, ps };
}

test('规程 远见: the first 80 layers take 1 off the 远见 operators\' price, the first 150 one more — still 远见 only (bond_goods_disc_tier2)', () => {
  const { m, ps } = prepWithBond('visiShip', 2);
  assert.ok(ps.bonds.visiShip.active);
  const pick = (pred) => Object.values(ACT3.chess).find((c) => c.visible && !c.isGolden && pred(c) && m.gd.chessPrice(c.chessId) >= 3).chessId;
  const visi = pick((c) => c.bonds.includes('visiShip')), other = pick((c) => !c.bonds.includes('visiShip'));
  const price = (id) => ps.priceOf({ kind: 'chess', id, basePrice: m.gd.chessPrice(id) });
  const base = [price(visi), price(other)];
  ps.addLayers('visiShip', 79);
  assert.deepEqual([price(visi), price(other)], base, '79 layers: none');
  ps.addLayers('visiShip', 1);
  assert.deepEqual([price(visi), price(other)], [base[0] - 1, base[1]], '80: −1 for 远见');
  ps.addLayers('visiShip', 70);
  assert.deepEqual([price(visi), price(other)], [base[0] - 2, base[1]], '150: −2 for 远见, the others as they were');
  assert.equal(ps.counters['bondaddon:visi:tier2'], 2);
  assert.equal(m.errorCount, 0);
  m.dispose?.();
});

test('规程 奇迹: from the first 100 layers a refresh always shows an operator of the 调度中心\'s level (bond_layer_shop_same_tier)', () => {
  const run = (layers) => {
    const { m, ps } = prepWithBond('miraShip', 2, 7);
    assert.ok(ps.bonds.miraShip.active);
    ps.shop.level = 5;
    ps.addLayers('miraShip', layers);
    let missing = 0;
    for (let i = 0; i < 40; i++) {
      ps.funds = 99;
      assert.equal(ps.refresh().ok, true);
      const chess = ps.shop.slots.filter((s) => s && s.kind === 'chess' && !s.sold);
      if (!chess.some((s) => m.gd.tierOf(s.id) === 5)) missing++;
    }
    assert.equal(m.errorCount, 0);
    m.dispose?.();
    return missing;
  };
  assert.ok(run(99) > 0, 'below 100 layers some refreshes show no tier-5 operator');
  assert.equal(run(100), 0, 'from 100 layers every one does');
});

test('规程 萨尔贡 6: a member\'s skill start lays 流沙 on the nearest ground tile of its range — 迟钝 (×2 in a casting member\'s range), 束缚 + arts every 5 s, 1 s arts while casting', () => {
  const pre = 'act3autochess_bond_eff_sargon_power[tile_buff]';
  const bb = Object.assign({}, ...ACT3.bonds.sargonShip.buffs.map((b) => b.bb));
  const L = 100;
  const run = (n) => {
    const h = fight(ids('s', n).map((id) => [id, ['sargonShip']]), { sargonShip: bondOn(n, L, [3, 6]) }, { enemies: [] });
    const s0 = h.unit('s0_a');
    h.b.emit('skillStart', { unit: s0, skill: null, reason: 'test' });
    const walk = [...s0.rangeKeys].filter((k) => h.b.grid.walkable(Math.floor(k / COLS), k % COLS));
    const k = walk.sort((a, b) => Math.hypot(Math.floor(a / COLS) - s0.tileR, (a % COLS) - s0.tileC) - Math.hypot(Math.floor(b / COLS) - s0.tileR, (b % COLS) - s0.tileC))[0];
    const e = h.spawn('e_dummy', { pos: [Math.floor(k / COLS), k % COLS] });
    h.step();
    return { h, s0, e, pid: h.b.players[0].playerId };
  };
  const slow = Math.min(bb[`${pre}[slow].slow_max`], bb[`${pre}[slow].slow_base`] + bb[`${pre}[slow].slow_per_stack`] * L);
  const { h, s0, e, pid } = run(6);
  const buff = () => e.findBuff(`bond:sargon:sand:${pid}`);
  close(buff()?.mods.moveMul, 1 - 2 * slow, 1e-9, '迟钝 ×2 while the member casts');
  h.run(1.05);
  const second = tagged(h, 'bond:sargon:sand');
  close(second.at(-1)?.amount, bb[`${pre}[mag_damage_2].magic_damage_base`] + bb[`${pre}[mag_damage_2].magic_damage_per_stack`] * L, 1e-6, '1 s arts while casting');
  h.b.emit('skillEnd', { unit: s0, skill: null, reason: 'test' });
  h.step();
  close(buff()?.mods.moveMul, 1 - slow, 1e-9, '迟钝 once the skill ends');
  const before = tagged(h, 'bond:sargon:sand').length;
  h.run(4);
  const hits = tagged(h, 'bond:sargon:sand').slice(before);
  assert.equal(hits.length, 1, 'no 1 s ticks after the skill; one 5 s hit');
  close(hits[0].amount, bb[`${pre}[mag_damage].magic_damage_base`] + bb[`${pre}[mag_damage].magic_damage_per_stack`] * L, 1e-6, '5 s arts');
  assert.equal(hits[0].dmg.type, 'arts');
  assert.ok(e.s.flags.bind, '束缚');
  e.x += 3;
  h.run(0.4);
  assert.equal(buff(), null, 'off the 流沙: ends');
  assert.deepEqual(h.b.errors, []);
  const five = run(5);
  assert.equal(five.e.findBuff(`bond:sargon:sand:${five.pid}`), null, '5 members: no 流沙');
});

test('规程 莱塔尼亚: an enemy knocked down summons a walking “一个小节” on the nearest ground tile (ATK +(0.3 + 0.01L), 禁疗, −10 % max HP a second, ≤ 10); no 乐部 below 6', () => {
  const bb = Object.assign({}, ...ACT3.bonds.lethaniaShip.buffs.map((b) => b.bb));
  const L = 40;
  const h = fight(ids('l', 3).map((id) => [id, ['lethaniaShip']]), { lethaniaShip: bondOn(3, L) }, { enemies: [] });
  const walkers = () => h.b.allyUnits.filter((u) => u.walks && u.alive);
  const e = h.spawn('e_dummy', { pos: [9, 9] });
  e.x = 9.3;
  h.b.kill(e, null);
  assert.equal(walkers().length, 1, 'one summon as the enemy falls');
  const w = walkers()[0];
  assert.equal(w.defId, 'enemy_9025_aclts');
  assert.equal(w.kind, 'token');
  assert.equal(w.ownerId, h.b.players[0].playerId);
  assert.deepEqual([w.tileR, w.tileC], [9, 9], 'the tile it fell on');
  const rec = ACT3.enemies.enemy_9025_aclts;
  close(w.s.atk, rec.stats.atk * (1 + bb.atk_base + bb.atk_per_stack * L), 1e-6, 'ATK');
  close(w.s.maxHp, rec.stats.maxHp, 1e-6, 'HP');
  assert.ok(w.s.flags.noHeal, '禁疗');
  assert.equal(h.b._occ[w.tileR * COLS + w.tileC] === w, false, 'it holds no tile');
  h.run(1.01);
  close(w.hp, rec.stats.maxHp * 0.9, 1, '−10 % after 1 s');
  // it walks to the nearest enemy and blocks it
  // (speed 0.7 × the move scale 0.5 tiles a second; the trace looks for a target once a second)
  const t = h.spawn('e_dummy', { pos: [9, 7] });
  const d0 = Math.abs(w.x - t.x);
  h.run(2.5);
  assert.ok(Math.abs(w.x - t.x) < d0 - 0.4, `walks toward the enemy: ${d0} → ${Math.abs(w.x - t.x)}`);
  assert.ok(w.moving, 'walking');
  h.run(2.5);
  assert.equal(t.blockedBy, w, 'blocks the enemy it reached');
  assert.ok(!w.moving, 'stands while it blocks');
  h.run(4.1);
  assert.equal(w.alive, false, 'its HP runs out in 10 s');
  // the cap: 10 live summons for the player below 6
  for (let i = 0; i < 14; i++) { const x = h.spawn('e_dummy', { pos: [9 + (i % 2), 4 + (i % 8)] }); h.b.kill(x, null); }
  assert.equal(walkers().length, 10, 'at most 10');
  assert.ok(walkers().every((u) => u.defId === 'enemy_9025_aclts'), 'no 乐部 below 6');
  // a member's knock-out summons nothing below 6
  const n = walkers().length;
  h.b.kill(h.unit('l0_a'), null);
  assert.equal(walkers().length, n);
  assert.deepEqual(h.b.errors, []);
});

test('规程 莱塔尼亚 6: “一个乐部” at 0.3 + 0.001L (its aura: members ASPD +20; the 4th attack strikes twice), up to 20 summons, a member knocked down summons too', () => {
  const bb = Object.assign({}, ...ACT3.bonds.lethaniaShip.buffs.map((b) => b.bb));
  const L = 200;
  const h = fight(ids('l', 6).map((id) => [id, ['lethaniaShip']]), { lethaniaShip: bondOn(6, L) }, { enemies: [], seed: 7 });
  const walkers = () => h.b.allyUnits.filter((u) => u.walks && u.alive);
  const l1 = h.unit('l1_a');
  const aspd0 = l1.s.aspd;
  for (let i = 0; i < 24; i++) { const x = h.spawn('e_dummy', { pos: [9, 4 + (i % 8)] }); h.b.kill(x, null); }
  assert.equal(walkers().length, 20, 'at most 20 at 6');
  const big = walkers().filter((u) => u.defId === 'enemy_9026_acltm').length;
  const p = Math.min(bb.big_prob_max, bb.big_prob_base + bb.big_prob_per_stack * L);
  assert.ok(big >= 3 && big <= 14, `≈ ${p * 20} of 20 are 乐部: ${big}`);
  close(l1.s.aspd, aspd0 + 20, 1e-9, 'members ASPD +20 while a 乐部 stands');
  // a member knocked down summons one too
  for (const u of walkers()) h.b.kill(u, null);
  close(h.unit('l1_a').s.aspd, aspd0, 1e-9, 'the aura ends with the last 乐部');
  h.b.kill(h.unit('l0_a'), null);
  assert.equal(walkers().length, 1, 'a member\'s knock-out summons');
  // a 乐部's 4th attack strikes twice
  for (const u of walkers()) h.b.kill(u, null);
  let m = null;
  for (let i = 0; i < 60 && !m; i++) { const x = h.spawn('e_dummy', { pos: [9, 9] }); h.b.kill(x, null); m = walkers().find((u) => u.defId === 'enemy_9026_acltm') ?? null; for (const u of walkers()) if (u !== m) h.b.kill(u, null); }
  assert.ok(m, 'a 乐部');
  const target = h.spawn('e_dummy', { pos: [9, 10] });
  const hits = () => h.hooksOf('damaged').filter((c) => c.source === m && c.target === target && !(c.dmg?.tags || []).includes('hpLoss')).length;
  h.run(4 * 3 + 1);
  assert.equal(hits(), 5, 'four attacks, the 4th a double');
  assert.deepEqual(h.b.errors, []);
});

test('规程 莱塔尼亚 (real match): the round\'s knocked-down enemies bring the bond\'s walking summons onto the player\'s field', () => {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  // the default season's field (ACT3_ON_BASE_FIELD) with the two summons' records of 规程's enemy table
  const summonRecs = { enemy_9025_aclts: ACT3.enemies.enemy_9025_aclts, enemy_9026_acltm: ACT3.enemies.enemy_9026_acltm };
  const data = { ...ACT3_ON_BASE_FIELD, enemies: { ...ACT3_ON_BASE_FIELD.enemies, ...summonRecs } };
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 5, data, season: 'act3autochess' }).start();
  h.toPrep(3, { band: 'band_amiya' });
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const pool = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && c.bonds.includes('lethaniaShip'));
  const used = new Set();
  for (const c of pool.slice(0, 3)) {
    const piece = ps.acquireChess(c.chessId, { source: 'buy' });
    const [row, col] = legalTileFor(m, ps, c.chessId, used);
    used.add(`${row},${col}`);
    assert.equal(m.handle('p_0', { t: 'g.move', uid: piece.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }).ok, true);
  }
  ps.recompute();
  assert.ok(ps.bonds.lethaniaShip.active, '莱塔尼亚 active');
  const battles = [];
  const newBattle = m.newBattle.bind(m);
  m.newBattle = (opts, o) => { const b = newBattle(opts, o); if (!o?.preview) battles.push(b); return b; };
  h.drive(() => m.round === 4 || h.ended != null);
  const b = battles.find((x) => x.players.some((p) => p.playerId === 'p_0'));
  assert.ok(b, 'the round\'s battle');
  const summons = b.allyUnits.filter((u) => u.walks);
  assert.ok(b.killed > 0, 'enemies knocked down');
  assert.ok(summons.length > 0, `walking summons: ${summons.length} for ${b.killed} knock-downs`);
  assert.ok(summons.every((u) => u.ownerId === 'p_0' && u.defId === 'enemy_9025_aclts'), '一个小节 of the player (3 members: no 乐部)');
  assert.equal(b.errorCount, 0);
  assert.equal(m.errorCount, 0);
  m.dispose?.();
});
