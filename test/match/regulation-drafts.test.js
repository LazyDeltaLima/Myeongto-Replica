// 规程 机变 drafts measured on 15 official co-op 终极 matches (bilibili BV13LWM6BEvY, 2026-11-10/11; upstream 270cb7b1).
// The readings are test/fixtures/official-regulation-drafts.json; the tables are tools/build-data.mjs ACT3_DRAFTS, built
// into data/seasons/act3autochess/choices.json. server/match/choices.js is the code the 盟约 tables use: a list of 7 shows
// 6, and a hunter list that already holds two tier-III cards keeps both. Until these tables the season was built with
// 盟约's lists, so six 规程 cards no 盟约 list names never came (docs/rules/sim.md 「규정 机变 결정 카드 표」).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getData } from '../../server/data.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { GameData } from '../../server/match/gamedata.js';
import { generateDraft, cardTargetBonds } from '../../server/match/choices.js';
import { createRng } from '../../server/sim/rng.js';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from './harness.js';

const REAL = { skip: !hasGeneratedData() };
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const OFFICIAL = JSON.parse(readFileSync(new URL('../fixtures/official-regulation-drafts.json', import.meta.url), 'utf8'));
const DATA = hasGeneratedData() ? getData({ log: quiet, season: 'act3autochess' }) : null;
const CARDS = DATA ? DATA.choices.cards.bounty : [];
const CARD = new Map(CARDS.map((c) => [c.effectId, c]));
const SPEC = DATA?.choices.bountyDrafts;
const SHOP = DATA?.choices.shopDraft;
const TACTIC = DATA?.choices.tacticDraft;
const TACTIC_CARDS = DATA ? DATA.choices.cards.tactic : [];
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const subset = (ids, cards) => ids.every((id) => cards.includes(id));
const EE = (s) => `enemyeffect_${s}`;
/** The 规程 cards no 盟约 list names, which the season's drafts never offered before its own tables. */
const NEW_CARDS = ['17_7', '18_7', '12_9', '13_9', '20_7', '16_13'].map(EE);

/** The data card of a fixture tuple [title, enemy, coins, battles]. */
function resolve([title, enemy, coin, battles]) {
  const hits = CARDS.filter((c) => c.name === title && c.coin === coin && c.rounds === battles
    && (c.desc.includes(`1只${enemy}，`) || c.desc.includes(`1个${enemy}，`)));
  assert.equal(hits.length, 1, `${title} ${enemy} ${coin}: ${hits.map((c) => c.effectId).join(', ') || 'no card'}`);
  return hits[0].effectId;
}

/** Every fixture screen: { match, round, family, leader, ids?, shop?, tactic? }. */
function screens() {
  const out = [];
  for (const [match, row] of Object.entries(OFFICIAL.matches)) {
    for (const round of ['3', '9', '11']) {
      const d = row[round];
      const rec = { match: Number(match), round: Number(round), family: d.family, leader: row.leader };
      if (d.family === 'bounty') rec.ids = d.cards.map(resolve);
      else if (d.family === 'shop') rec.shop = d.cards;
      else rec.tactic = d.cards.map(([name]) => name);
      out.push(rec);
    }
  }
  return out;
}

const SCREENS = DATA ? screens() : [];
const bountyOf = (round) => SCREENS.filter((d) => d.round === round && d.family === 'bounty');
const groupFor = (groups, d) => groups.filter((g) => subset(d.ids, g.cards));

/** A normal shop item's id (the build resolves the table's names the same way). */
function itemId(name) {
  const hits = Object.values(DATA.items).filter((i) => !i.isGolden && i.itemType === 'EQUIP' && i.name === name);
  assert.equal(hits.length, 1, name);
  return hits[0].id;
}

test('the fixture is the 15 matches of BV13LWM6BEvY', REAL, () => {
  assert.equal(OFFICIAL.season, 'act3autochess');
  assert.equal(OFFICIAL.video, 'BV13LWM6BEvY');
  assert.equal(Object.keys(OFFICIAL.matches).length, 15);
  assert.equal(SCREENS.length, 45);
  const families = { bounty: 0, shop: 0, tactic: 0 };
  for (const d of SCREENS.filter((s) => s.round === 11)) families[d.family]++;
  assert.deepEqual(families, { bounty: 9, shop: 4, tactic: 2 });
});

test('the built R3 / R9 / R11 tables are 规程\'s, and every official screen is a draw from them', REAL, () => {
  assert.equal(SPEC.initial.pick, 'slot');
  assert.equal(SPEC.initial.slots, 10);
  assert.equal(SPEC.initial.groups.length, 7);
  assert.deepEqual(SPEC.initial.rule.tiers, [1, 1, 1, 2, 2, 3, 3]);
  assert.equal(SPEC.boss.pick, 'seen');
  assert.equal(SPEC.boss.groups.length, 6);
  assert.deepEqual(SPEC.boss.groups.map((g) => g.seen.length), [3, 2, 4, 3, 2, 1]);
  assert.equal(SPEC.hunter.groups.length, 5);
  assert.equal(SPEC.hunter.slots, 5);
  assert.ok(SPEC.hunter.rule.giants.includes(EE('16_13')), '聆风猎手 is a giant');
  assert.equal(SPEC.hunter.groups[0].cards.filter((id) => CARD.get(id).tier === 3).length, 2);

  for (const round of [3, 9, 11]) {
    const kind = round === 3 ? 'initial' : round === 9 ? 'boss' : 'hunter';
    for (const d of bountyOf(round)) {
      assert.equal(new Set(d.ids).size, 6, `match ${d.match} R${round}`);
      const fit = groupFor(SPEC[kind].groups, d);
      assert.equal(fit.length, 1, `match ${d.match} R${round} fits ${fit.length} groups`);
      assert.ok(fit[0].seen.includes(d.match), `match ${d.match} is not in its group's seen`);
      if (fit[0].cards.length === 6) assert.ok(sameSet(d.ids, fit[0].cards));
      for (const id of d.ids) assert.equal(CARD.get(id).draftPool, kind, `${id} R${round}`);
    }
  }
  // the two 假想敌：胄 matches are different R9 groups
  const zhou = bountyOf(9).filter((d) => d.leader === '假想敌：胄');
  assert.deepEqual(zhou.map((d) => d.match), [4, 8]);
  assert.notEqual(groupFor(SPEC.boss.groups, zhou[0])[0], groupFor(SPEC.boss.groups, zhou[1])[0]);
  // boss bounties of a 规程 group are offered; the never-seen ones are not
  for (const id of ['b_6', 'b_16', 'b_18'].map(EE)) assert.equal(CARD.get(id).draftPool, 'boss', id);
  for (const id of ['b_5', 'b_7', 'b_15'].map(EE)) assert.equal(CARD.get(id).draftExcluded, 'unseen', id);
  // weights are 1 + the screens of that group the card was on
  for (const kind of ['boss', 'hunter']) {
    for (const g of SPEC[kind].groups) {
      const drafts = bountyOf(kind === 'boss' ? 9 : 11).filter((d) => g.seen.includes(d.match));
      assert.deepEqual(g.weights, g.cards.map((id) => 1 + drafts.filter((d) => d.ids.includes(id)).length));
    }
  }
});

test('规程 co-op 终极 drafts offer the six 规程 cards 盟约\'s lists left out', REAL, () => {
  const gd = new GameData(DATA, 'mode_multi_abyss');
  const once = (seed, round) => generateDraft(gd, createRng(seed), round, { stageId: 'act3autochess_m01', bondAvailable: () => true });
  assert.deepEqual(once(7, 3), once(7, 3));
  const seen = new Set();
  let twoGiant = false;
  for (let seed = 1; seed <= 600; seed++) {
    const d3 = once(seed, 3);
    assert.equal(d3.cards.length, 6);
    for (const c of d3.cards) { seen.add(c.id); assert.equal(CARD.get(c.id).draftPool, 'initial'); }
    const d9 = once(seed + 1000, 9);
    const ids9 = d9.cards.map((c) => c.id);
    assert.ok(SPEC.boss.groups.some((g) => subset(ids9, g.cards)), `R9 seed ${seed}`);
    const d11 = once(seed + 2000, 11);
    if (d11.family !== 'bounty') continue;
    const ids = d11.cards.map((c) => c.id);
    ids.forEach((id) => seen.add(id));
    if (ids.includes(EE('16_1')) && ids.includes(EE('16_13'))) twoGiant = true;
  }
  for (const id of NEW_CARDS) assert.ok(seen.has(id), `${id} (${CARD.get(id).name}) never came — the season draws another season's lists (docs/rules/sim.md 「규정 机变 결정 카드 표」)`);
  assert.equal(twoGiant, true, 'no R11 draft showed both tier-III cards of the first list');
});

test('机密商店 slots and 战术决策 weights are 规程\'s', REAL, () => {
  assert.deepEqual(SHOP.rounds, [11]);
  assert.deepEqual(SHOP.slots.slice(0, 2), [{ 6: 1 }, { 5: 1 }]);
  assert.equal(SHOP.slots.length, 6);
  assert.deepEqual(SHOP.seen, [9, 12, 14, 15]);
  assert.equal(SHOP.itemWeights[itemId('驮兽储蓄罐')], 5);
  assert.equal(SHOP.itemWeights[itemId('人事部文档')], 4);
  for (const d of SCREENS.filter((s) => s.family === 'shop')) {
    const kinds = d.shop.map(([name, tier]) => (name === '盟约之币' ? 'coin' : tier));
    assert.ok(kinds.includes(6) && kinds.includes(5), `match ${d.match} has no VI and V`);
    for (const [name] of d.shop) if (name !== '盟约之币') assert.ok(SHOP.itemWeights[itemId(name)] > 1, name);
  }
  assert.deepEqual(TACTIC.kinds, ['ally']);
  assert.deepEqual(TACTIC.seen, [6, 13]);
  const byName = (name) => {
    const hits = TACTIC_CARDS.filter((c) => c.name === name);
    assert.equal(hits.length, 1, name);
    return hits[0];
  };
  for (const d of SCREENS.filter((s) => s.family === 'tactic')) for (const n of d.tactic) assert.ok(TACTIC.weights[byName(n).effectId] > 1, n);
  assert.equal(TACTIC.weights[byName('列装').effectId], 3);

  const gd = new GameData(DATA, 'mode_multi_abyss');
  const reinforce = byName('卡西米尔驰援');
  const [bond] = cardTargetBonds(gd, reinforce.effectId);
  for (let seed = 1; seed <= 400; seed++) {
    const no = generateDraft(gd, createRng(seed), 11, { bondAvailable: (b) => b !== bond });
    if (no.family === 'tactic') assert.ok(!no.cards.some((c) => c.id === reinforce.effectId), 'a dead bond\'s 驰援 offered');
    if (no.family === 'shop') {
      const tiers = no.cards.map((c) => (c.id === SHOP.coin ? 'coin' : DATA.items[c.id].tier));
      assert.ok(tiers.includes(6) && tiers.includes(5), `shop seed ${seed}: ${tiers}`);
    }
  }
});

test('the real match path: a 规程 co-op 终极 R3 draft is a 规程 list', REAL, () => {
  const lists = SPEC.initial.groups;
  for (let seed = 1; seed <= 4; seed++) {
    const h = makeMatch({ mode: 'coop', difficulty: 'ABYSS', humans: 1, bots: 1, seed: 40 + seed, fake: true, data: DATA, season: 'act3autochess' }).start();
    const m = h.m;
    assert.equal(m.gd.modeId, 'mode_multi_abyss');
    assert.ok(h.drive(() => m.phase === PHASE.SP_DRAFT && m.round === 3, { ready: true, band: DATA.config.bandDraft.timeoutBandId }), `the R3 draft (${m.phase} R${m.round})`);
    assert.equal(m.sp.family, 'bounty');
    const ids = m.sp.cards.map((c) => c.id);
    assert.equal(ids.length, 6);
    for (const id of ids) assert.equal(CARD.get(id).draftPool, 'initial', id);
    // a seen 规程 list or the unseen-event rule (I I I II II III III over its series)
    const ok = lists.some((g) => subset(ids, g.cards)) || ids.every((id) => SPEC.initial.rule.series.includes(CARD.get(id).series));
    assert.ok(ok, `seed ${seed}: ${ids.join(' ')}`);
    m.dispose();
  }
});
