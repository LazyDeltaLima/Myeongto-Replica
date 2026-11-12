// 卫戍协议：规程's strategies (data/seasons/act3autochess/bands.json): the table's new fields and 指令 stages
// (tools/build-data.mjs bandSeasonFields), the stage chain of the prep handlers (server/sim/content/bands/meta.js
// bandStageIndex), the season's passive keys, 陈's elite rider (bands/battle.js) and the bond direction switch
// (bonds/dispatch.js swapBondRecord) — the default season left as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, DATA } from '../match/harness.js';
import { registryFor } from '../../server/match/effectsMeta.js';
import { STAGE_COUNTER } from '../../server/sim/content/bands/meta.js';
import { swapBondRecord, bondEffectReplacements, handRules, templateNumbers } from '../../server/sim/content/bonds/dispatch.js';
import { coverageOf } from '../../tools/season-coverage.mjs';

const OK = { ok: true };
const REG = registryFor(ACT3_ON_BASE_FIELD);
const effectOf = (id) => ACT3.effects[id] ?? null;

function setup({ band, seed = 41 } = {}) {
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: REG, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0;
  ps.funds = 50; ps.layers = {}; ps.pendingFunds = 0; ps.shop.freeRefreshes = 0; ps.counters = {};
  ps.bandId = band ?? null;
  ps.recompute();
  const at = (r) => { m.round = r; };
  const roundStart = (r) => { at(r); m.dispatch(ps, 'onRoundStart', { round: r }); m.dispatch(ps, 'onPrepStart', { round: r }); };
  const prepEnd = () => m.dispatch(ps, 'onPrepEnd', { round: m.round });
  return { h, m, ps, at, roundStart, prepEnd };
}
/** Normal shop chess of the season with `bond`, by tier. */
const chessOf = (bond, tier = null) => Object.values(ACT3.chess)
  .filter((c) => c.visible && !c.isGolden && !c.isDiy && c.bonds.includes(bond) && (tier == null || c.tier === tier)).map((c) => c.chessId).sort();
const slotOf = (id, price = 3) => ({ kind: 'chess', id, basePrice: price, frozen: false, sold: false });
const items = (ps) => [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'item').map((p) => p.id);

// ---------------------------------------------------------------------------------------------------------------
// data

test('规程 bands.json: bandType, relateBondIds, the 指令 stages from the effectId; the default season has none of them', () => {
  const all = Object.values(ACT3.bands);
  assert.equal(all.length, 61);
  for (const b of all) {
    assert.equal(b.skills[0].effectId, b.effectId, b.bandId);
    assert.equal(b.skills.at(-1).next, null, `${b.bandId}: the last stage unlocks nothing`);
    for (const s of b.skills.slice(0, -1)) assert.equal(s.next.effectId, b.skills[b.skills.indexOf(s) + 1].effectId);
    assert.ok(b.relateBondIds.every((id) => b.bondIds.includes(id)), `${b.bandId}: its related bonds tie it (本局禁用, the bot)`);
  }
  assert.equal(all.filter((b) => b.bandType === 'BONDRELEVANT').length, 17);
  assert.equal(all.reduce((n, b) => n + b.skills.length, 0), 74, 'every skillInfoDataDict row is a stage');
  const w = ACT3.bands.band_takecare;
  assert.deepEqual(w.skills.map((s) => [s.type, s.params.layer, s.next && s.next.unlockType, s.next && s.next.unlockParams]), [
    ['PASSIVE', 1, 'band_skill_load_by_shop_lv', ['3']], ['PASSIVE', 2, 'band_skill_load_by_shop_lv', ['5']], ['PASSIVE', 3, null, null],
  ]);
  // 歌蕾蒂娅 猎人战法 names 阿戈尔 only in 【…】: the table's list ties it
  assert.deepEqual(ACT3.bands.band_egir.bondIds, ['egirShip']);
  for (const b of Object.values(DATA.bands)) assert.ok(!('skills' in b) && !('bandType' in b), b.bandId);
});

test('coverage: every strategy key of the default season is handled; 规程 lacks only the actives', () => {
  assert.deepEqual(coverageOf().totals.bands, { ok: 42, partial: 0, none: 0, wrong: 0 });
  const rows = coverageOf('act3autochess').bands;
  const notOk = rows.filter((r) => r.status !== 'ok' && !r.key.startsWith('skill_'));
  assert.deepEqual(notOk.map((r) => `${r.status} ${r.id} ${r.key}`).sort(), [], 'every bond direction a strategy switches to is written');
});

// ---------------------------------------------------------------------------------------------------------------
// stages

test('华法琳 重点监护 (规程): +1 / +2 / +3 by the 调度中心 level 1 / 3 / 5, only to active bonds; the stage never moves back', () => {
  // three different 萨尔贡 operators (active), one piece alone in a tier of its own (inactive bonds)
  const sargon = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy && c.bonds.includes('sargonShip'))
    .sort((a, b) => a.tier - b.tier || (a.chessId < b.chessId ? -1 : 1)).slice(0, 3);
  assert.equal(sargon.length, 3);
  const tiers = new Set(sargon.map((c) => c.tier));
  const near = new Set(sargon.flatMap((c) => c.bonds));
  const lone = Object.values(ACT3.chess).find((c) => c.visible && !c.isGolden && !c.isDiy && !tiers.has(c.tier) && c.bonds.length && c.bonds.every((b) => !near.has(b)));
  const { m, ps, prepEnd } = setup({ band: 'band_takecare', seed: 44 });
  sargon.forEach((c, i) => give(m, ps, c.chessId, 'board', [10, 3 + i]));
  give(m, ps, lone.chessId, 'board', [11, 3]);
  ps.recompute();
  assert.ok(ps.bonds.sargonShip.active);
  assert.ok(lone.bonds.every((b) => !ps.bonds[b]?.active), 'the lone piece\'s bonds are inactive');
  const loneLayers = () => lone.bonds.reduce((a, b) => a + (ps.layers[b] || 0), 0);
  const n = tiers.size;
  prepEnd();
  assert.equal(ps.layers.sargonShip, n, 'stage 1: +1 per tier');
  assert.equal(loneLayers(), 0, '「已激活」: the inactive bonds gain nothing');
  ps.shop.level = 3;
  m.dispatch(ps, 'onLevelUp', { level: 3, price: 0 });
  assert.equal(ps.counters[STAGE_COUNTER], 1);
  prepEnd();
  assert.equal(ps.layers.sargonShip, 3 * n, 'stage 2: +2');
  ps.shop.level = 5;
  m.dispatch(ps, 'onLevelUp', { level: 5, price: 0 });
  prepEnd();
  assert.equal(ps.layers.sargonShip, 6 * n, 'stage 3: +3');
  ps.shop.level = 1;
  prepEnd();
  assert.equal(ps.layers.sargonShip, 9 * n, 'no way back');
  assert.equal(loneLayers(), 0);
});

test('stage conditions: by round, by funds spent, by a bond\'s activation count (the staged actives keep their stage too)', () => {
  {
    const { ps, roundStart } = setup({ band: 'band_dance' }); // 溃心领域: rounds 4 / 8 / 12
    roundStart(3);
    assert.equal(ps.counters[STAGE_COUNTER] ?? 0, 0);
    roundStart(4);
    assert.equal(ps.counters[STAGE_COUNTER], 1);
    roundStart(13);
    assert.equal(ps.counters[STAGE_COUNTER], 3, 'two conditions at once');
  }
  {
    const { m, ps } = setup({ band: 'band_rich' }); // 最佳品味: 60 / 120 funds spent
    ps.funds = 200;
    ps.stats.gold = 59;
    m.dispatch(ps, 'onSpend', { amount: 0, reason: 'x', total: 59 });
    assert.equal(ps.counters[STAGE_COUNTER] ?? 0, 0);
    ps.stats.gold = 60;
    m.dispatch(ps, 'onSpend', { amount: 1, reason: 'x', total: 60 });
    assert.equal(ps.counters[STAGE_COUNTER], 1);
  }
  {
    const { m, ps } = setup({ band: 'band_iberia' }); // 出航时刻: 4 counted 伊比利亚
    const ib = chessOf('iberiaShip');
    for (let i = 0; i < 3; i++) give(m, ps, ib[i], 'board', [10, 3 + i]);
    ps.recompute();
    m.dispatch(ps, 'onActiveBonds', {});
    assert.equal(ps.counters[STAGE_COUNTER] ?? 0, 0);
    give(m, ps, ib[3], 'board', [10, 6]);
    ps.recompute();
    m.dispatch(ps, 'onActiveBonds', {});
    assert.equal(ps.counters[STAGE_COUNTER], 1);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// passives

test('奥达 全力熔铸: on entering prep of rounds 3, 6, 9, 12, 14 one item of exactly the 调度中心 level\'s tier', () => {
  const { m, ps, roundStart } = setup({ band: 'band_smith', seed: 9 });
  ps.shop.level = 4;
  roundStart(2);
  assert.deepEqual(items(ps), []);
  roundStart(3);
  const got = items(ps);
  assert.equal(got.length, 1);
  assert.equal(m.gd.item(got[0]).tier, 4);
  roundStart(14);
  assert.equal(items(ps).length, 2);
});

test('复奏 二重奏: the round\'s first promotion (a 3-copy merge) gives two promotion rewards, the second one', () => {
  const { ps, at } = setup({ band: 'band_bonus', seed: 5 });
  const [a, b] = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy && c.tier === 1).map((c) => c.chessId);
  for (let i = 0; i < 3; i++) ps.acquireChess(a, { source: 'buy' });
  assert.equal(ps.offers.filter((o) => o.source === 'merge').length, 2);
  for (let i = 0; i < 3; i++) ps.acquireChess(b, { source: 'buy' });
  assert.equal(ps.offers.filter((o) => o.source === 'merge').length, 3, 'once a round');
  at(2);
  ps.offers.length = 0;
  for (let i = 0; i < 3; i++) ps.acquireChess(b, { source: 'buy' });
  assert.equal(ps.offers.filter((o) => o.source === 'merge').length, 2, 'a new round');
});

test('娜仁图亚 沙洲梦魇: 3 萨尔贡 gained → the level-up price −3, at most once per 调度中心 level; the count waits for the next level', () => {
  const sargon = chessOf('sargonShip');
  const { m, ps } = setup({ band: 'band_sargon', seed: 6 });
  ps.shop.level = 2;
  ps.shop.upgradePrice = 8;
  for (let i = 0; i < 2; i++) ps.acquireChess(sargon[i], { source: 'buy' });
  assert.equal(ps.shop.upgradePrice, 8);
  ps.acquireChess(sargon[2], { source: 'effect' });
  assert.equal(ps.shop.upgradePrice, 5);
  for (let i = 3; i < 6; i++) ps.acquireChess(sargon[i], { source: 'buy' });
  assert.equal(ps.shop.upgradePrice, 5, 'once per level');
  ps.funds = 50;
  assert.deepEqual(m.handle('p_0', { t: 'g.levelUp' }), OK);
  assert.equal(ps.shop.level, 3);
  assert.equal(ps.shop.upgradePrice, Math.max(0, m.gd.upgradeBase(3) - 3), 'the 3 counted at level 2 apply at level 3');
  const other = Object.values(ACT3.chess).find((c) => c.visible && !c.isGolden && !c.isDiy && !c.bonds.includes('sargonShip'));
  const before = ps.counters['band:narant:gained'];
  ps.acquireChess(other.chessId, { source: 'buy' });
  assert.equal(ps.counters['band:narant:gained'], before, 'another bond counts nothing');
});

test('洛洛 自发制造: every 3rd 维多利亚 bought → one item of tier ≤ the 调度中心 level', () => {
  const vic = chessOf('victoriaShip', 1).concat(chessOf('victoriaShip', 2));
  const { m, ps } = setup({ band: 'band_victoria', seed: 8 });
  ps.shop.level = 2;
  ps.funds = 50;
  for (let i = 0; i < 3; i++) {
    ps.shop.slots[0] = slotOf(vic[i]);
    assert.deepEqual(m.handle('p_0', { t: 'g.buy', slot: 0 }), OK);
    assert.equal(items(ps).length, i === 2 ? 1 : 0, `buy ${i + 1}`);
  }
  assert.ok(m.gd.item(items(ps)[0]).tier <= 2);
});

test('裁度 量体裁衣: the round\'s first manual refresh +1 funds, the second none', () => {
  const { m, ps } = setup({ band: 'band_siracusa', seed: 3 });
  ps.funds = 10;
  assert.deepEqual(m.handle('p_0', { t: 'g.refresh' }), OK);
  assert.equal(ps.funds, 10 - m.gd.refreshPrice + 1);
  assert.deepEqual(m.handle('p_0', { t: 'g.refresh' }), OK);
  assert.equal(ps.funds, 10 - 2 * m.gd.refreshPrice + 1);
});

test('renamed keys run the default season\'s rule: 玛恩纳, 休露丝, 巫恋, 佩佩', () => {
  for (const id of ['band_mlynar', 'band_kjerag', 'band_substitute', 'band_pepe']) assert.ok(REG.get(`band:${id}`), id);
  {
    const kaz = chessOf('kazimierzShip', 1);
    const { m, ps } = setup({ band: 'band_mlynar' });
    ps.shop.slots[0] = slotOf(kaz[0]);
    assert.deepEqual(m.handle('p_0', { t: 'g.buy', slot: 0 }), OK);
    assert.equal(ps.pendingFunds, 1);
  }
  {
    const kj = chessOf('kjeragShip').filter((id) => ACT3.chess[id].tier >= 2);
    const { m, ps } = setup({ band: 'band_kjerag' });
    ps.funds = 20;
    ps.shop.slots[0] = slotOf(kj[0], 3);
    ps.shop.slots[1] = slotOf(kj[1], 3);
    assert.deepEqual(m.handle('p_0', { t: 'g.buy', slot: 0 }), OK);
    assert.equal(ps.funds, 19, 'the first 谢拉格 of the round costs 1');
    assert.deepEqual(m.handle('p_0', { t: 'g.buy', slot: 1 }), OK);
    assert.equal(ps.funds, 19 - m.gd.chessPrice(kj[1]), 'the second its price');
  }
});

test('陈 以己之长 (规程): elite operators ATK +16 % and ASPD +16, normal ones neither', () => {
  const p = ACT3.bands.band_weakness.buffs[1].bb;
  const elite = chessRec({ id: 'el_b', isGolden: true, bonds: [], skill: null, stats: { atk: 1000, maxHp: 1000, def: 0, blockCnt: 1 } });
  const norm = chessRec({ id: 'no_a', bonds: [], skill: null, stats: { atk: 1000, maxHp: 1000, def: 0, blockCnt: 1 } });
  const data = new DataSource({ ...ACT3, chess: { ...ACT3.chess, el_b: elite, no_a: norm }, enemies: { ...ACT3.enemies, e_d: enemyRec({ key: 'e_d', hp: 1e9, speed: 0 }) } }, getDefaultSource());
  const run = (bandId) => {
    const h = makeBattle({ data, bandId, enemies: [{ key: 'e_d' }], autoFinish: false, units: [{ chessId: 'el_b', row: 10, col: 3 }, { chessId: 'no_a', row: 10, col: 4 }] });
    h.step(2);
    return [h.unit('el_b').s, h.unit('no_a').s];
  };
  const [e0, n0] = run(null);
  const [e1, n1] = run('band_weakness');
  assert.ok(Math.abs(e1.atk - e0.atk * (1 + p.atk)) < 1e-6, `${e1.atk} vs ${e0.atk}`);
  assert.equal(e1.aspd - e0.aspd, p.attack_speed);
  assert.equal(n1.atk, n0.atk);
  assert.equal(n1.aspd, n0.aspd);
});

// ---------------------------------------------------------------------------------------------------------------
// bond direction switch

test('a strategy switches a bond to its other direction for its holder\'s battle; the season\'s record otherwise', () => {
  const sargon = ACT3.bonds.sargonShip;
  const swapped = swapBondRecord(sargon, ACT3.bands.band_sargon, effectOf);
  assert.equal(swapped.effectId, 'bondeffect_sargon');
  assert.deepEqual(swapped.buffs.map((b) => b.bbStr.key ?? b.key), ['act1autochess_bond_eff_sargon']);
  assert.ok(swapBondRecord(sargon, ACT3.bands.band_amiya, effectOf) === sargon, 'another strategy: the season\'s record');
  // 谢拉格 → the default season's (its wind); the prep reward stays the season record's (不融冰 every 100 layers)
  const kj = swapBondRecord(ACT3.bonds.kjeragShip, ACT3.bands.band_kjerag2, effectOf);
  assert.deepEqual(kj.buffs.map((b) => b.bbStr.key ?? b.key), ['act1autochess_bond_eff_kjerag', 'bond_layer_added_reward_equip']);
  assert.equal(kj.buffs[1].bbStr.pool, 'pool_equip_kjeragbond2');
  // 洛洛's 维多利亚 → _2 (规程's own template), the prep reward kept; 歌蕾蒂娅's 阿戈尔 → _2
  assert.equal(bondEffectReplacements(ACT3.bands.band_victoria).get('bondeffect_victoria'), 'bondeffect_victoria_2');
  const vic = swapBondRecord(ACT3.bonds.victoriaShip, ACT3.bands.band_victoria, effectOf);
  assert.deepEqual(vic.buffs.map((b) => b.bbStr.key ?? b.key), ['act3autochess_bond_eff_victoria', 'bond_layer_added_reward_equip']);
  assert.equal(swapBondRecord(ACT3.bonds.egirShip, ACT3.bands.band_egir, effectOf).effectId, 'bondeffect_egir_2');
  // and 歌蕾蒂娅's 阿戈尔 asks for the 整备区's 阿戈尔 of any class
  assert.deepEqual(handRules((id) => swapBondRecord(ACT3.bonds[id], ACT3.bands.band_egir, effectOf)).filter((r) => r.bond === 'egirShip'), [{ bond: 'egirShip', position: null, need: 6 }]);
  assert.deepEqual(handRules((id) => ACT3.bonds[id]).filter((r) => r.bond === 'egirShip'), []);
  // 焰尾's 卡西米尔 (the default season's direction) asks for no 整备区 operators
  const rules = (band) => handRules((id) => swapBondRecord(ACT3.bonds[id], band, effectOf)).filter((r) => r.bond === 'kazimierzShip');
  assert.equal(rules(null).length, 1);
  assert.equal(rules(ACT3.bands.band_kazimier).length, 0);
});

test('娜仁图亚\'s 萨尔贡 6 in battle: the default season\'s ATK stacks, no 流沙; without her the season\'s 流沙', () => {
  const ids = Array.from({ length: 6 }, (_, i) => `sg${i}_a`);
  const chess = Object.fromEntries(ids.map((id) => [id, chessRec({ id, bonds: ['sargonShip'], skill: null, stats: { atk: 1000, maxHp: 10000, def: 0, blockCnt: 1 } })]));
  const data = new DataSource({ ...ACT3, chess: { ...ACT3.chess, ...chess }, enemies: { ...ACT3.enemies, e_d: enemyRec({ key: 'e_d', hp: 1e9, speed: 0 }) } }, getDefaultSource());
  const run = (bandId) => {
    const h = makeBattle({ data, bandId, bonds: { sargonShip: { count: 6, active: true, tier: 2, layers: 10 } }, autoFinish: false, timeLimit: 300,
      enemies: [{ key: 'e_d' }], units: ids.map((id, i) => ({ chessId: id, row: 10, col: 2 + i })) });
    h.step(2);
    return h;
  };
  const swapped = run('band_sargon');
  assert.ok(templateNumbers('sargonShip', 'act1autochess_bond_eff_sargon', swapped.b, 'p1'));
  assert.equal(templateNumbers('sargonShip', 'act3autochess_bond_eff_sargon_power', swapped.b, 'p1'), null);
  swapped.b.emit('skillStart', { unit: swapped.unit('sg0_a') });
  assert.ok(swapped.unit('sg1_a').buffs.some((b) => b.key === 'bond:sargon:atk'), 'the 6-tier ATK stack of the default season');
  const own = run(null);
  assert.ok(templateNumbers('sargonShip', 'act3autochess_bond_eff_sargon_power', own.b, 'p1'));
  own.b.emit('skillStart', { unit: own.unit('sg0_a') });
  assert.ok(!own.unit('sg1_a').buffs.some((b) => b.key === 'bond:sargon:atk'));
});
