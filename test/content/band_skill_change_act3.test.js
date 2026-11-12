// 规程's 更换指令 (choiceType SKILL_CHANGE): “追随者们” 好多委托 (every prep start, 2 指令) and 投机骰子 (on equip, destroyed,
// 3 指令) — the personal choice, the pool, the swap (server/match/match/bandSkill.js offerBandSkillChoice / setBandCommand),
// what the own strategy keeps, the stage of the taken 指令, the uses, and the bot / deadline picks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, giveItem, checkInvariants } from '../match/harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { FIELD } from '../../server/match/board.js';
import { bandPassiveKey, bandCommandKey, COMMAND_STAGE_COUNTER } from '../../server/sim/content/bands/meta.js';

const OK = { ok: true };
const quiet = { error() {}, warn() {}, info() {}, log() {} };
const DICE = 'chess_item_5_06_e_a';

/** A 规程 match in PREP R1 holding `band`, its own handlers. */
function setup({ band, funds = 30, seed = 7, bots = 0 }) {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const h = makeMatch({ mode: bots ? 'coop' : 'solo', humans: 1, bots, seed, registry: reg, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  ps.bandId = band; ps.bandCommand = null; ps.counters = {}; ps.funds = funds; ps.offers.length = 0; ps.ready = false;
  ps.personalChoice = null;
  for (const l of [...ps.board.keys()]) ps.board.delete(l);
  ps.hand.fill(null); ps.temp.fill(null);
  ps.recompute();
  const use = (target = {}) => m.handle('p_0', { t: 'g.bandSkill', ...target });
  const pick = (idx) => m.handle('p_0', { t: 'g.choice', idx, choiceId: ps.personalChoice?.id });
  const prepStart = () => m.dispatch(ps, 'onPrepStart', { round: m.round });
  return { h, m, ps, reg, use, pick, prepStart, view: () => ps.privateView() };
}

const hasActive = (m, id) => (m.gd.band(id)?.skills || []).some((s) => s.type === 'ACTIVE');
/** Put strategy `bandId`'s 指令 first among the open choice's cards (the draw is the meta rng's). */
function force(ps, bandId) {
  const pc = ps.personalChoice;
  assert.ok(pc && pc.kind === 'bandSkill', 'a 更换指令 choice is open');
  pc.cards[0] = { bandId, effectId: ps.gd.band(bandId).effectId };
}

test('好多委托: every prep start opens a choice of 2 指令 of the pool — active 指令 of the mode\'s strategies, not the current one; Ready waits for it', () => {
  const { m, ps, prepStart, view } = setup({ band: 'band_random' });
  assert.ok(m.gd.bandAllowed('band_random'), 'the strategy is offered in this mode');
  const seen = new Set();
  for (let k = 0; k < 12; k++) {
    ps.personalChoice = null;
    prepStart();
    const pc = ps.personalChoice;
    assert.ok(pc, 'a choice is open');
    assert.equal(pc.kind, 'bandSkill');
    assert.equal(pc.choiceEvent, 'skill_change_2');
    assert.equal(pc.cards.length, 2, '「从2个随机指令」');
    assert.equal(new Set(pc.cards.map((c) => c.bandId)).size, 2, 'two different 指令');
    for (const c of pc.cards) {
      assert.ok(hasActive(m, c.bandId), `${c.bandId} has an active 指令`);
      assert.ok(m.gd.bandAllowed(c.bandId), `${c.bandId} is offered in the mode`);
      assert.notEqual(c.bandId, ps.bandCommand, 'not the current one');
      seen.add(c.bandId);
    }
    if (k === 5) { m.setBandCommand(ps, pc.cards[0].bandId); }
  }
  assert.ok(seen.size > 6, 'the draw varies');
  const v = view();
  assert.equal(v.personalChoice.kind, 'bandSkill');
  assert.equal(v.canReady, false);
  for (const c of v.personalChoice.cards) {
    assert.equal(c.kind, 'bandSkill');
    assert.ok(c.name && c.desc, 'name and text of the 指令');
    assert.equal(c.iconId, m.gd.band(c.bandId).iconId);
  }
  assert.ok(m.handle('p_0', { t: 'g.ready', ready: true }).error, 'Ready refused while the choice is open');
  assert.equal(ps.ready, false);
  checkInvariants(m);
});

test('the pool never offers a passive-only strategy nor one this mode leaves out; the own active 指令 is left out while it is current', () => {
  const { m, ps } = setup({ band: 'band_fund' });
  const pool = m._bandCommandPool(ps);
  assert.ok(!pool.includes('band_fund'), 'the current (own) one');
  assert.ok(pool.every((id) => hasActive(m, id) && m.gd.bandAllowed(id)));
  const all = m.gd.bandIds().filter((id) => hasActive(m, id));
  assert.deepEqual(pool, all.filter((id) => id !== 'band_fund'));
  assert.ok(!pool.includes('band_amiya'), 'a passive strategy has no 指令 to offer');
  m.setBandCommand(ps, 'band_price');
  const pool2 = m._bandCommandPool(ps);
  assert.ok(pool2.includes('band_fund'), 'the own one can come back');
  assert.ok(!pool2.includes('band_price'), 'the taken one is current');
  // a strategy the mode does not offer (inactiveModeIds — GameData.bandAllowed) is never in the pool
  const gd = ps.gd || m.gd;
  const had = Object.hasOwn(gd, 'bandAllowed');
  const allowed = gd.bandAllowed;
  gd.bandAllowed = function (id) { return id !== 'band_survive' && allowed.call(this, id); };
  try {
    assert.ok(!m._bandCommandPool(ps).includes('band_survive'), 'left out by the mode');
  } finally { if (had) gd.bandAllowed = allowed; else delete gd.bandAllowed; }
  assert.ok(m._bandCommandPool(ps).includes('band_survive'));
});

test('the taken 指令 runs all its hooks, not only the use: 内部货源 taken by a passive strategy lowers the next item\'s price', () => {
  const { m, ps, use } = setup({ band: 'band_amiya' });
  const i = ps.shop.slots.findIndex((s) => s && s.kind === 'item' && !s.sold);
  assert.ok(i >= 0, 'an item card');
  const full = ps.priceOf(ps.shop.slots[i]);
  assert.ok(full > 0);
  assert.ok(m.setBandCommand(ps, 'band_price'));
  assert.deepEqual(use(), OK);
  assert.equal(ps.priceOf(ps.shop.slots[i]), full - 1, 'its onPrice');
});

test('a picked 指令 is the player\'s: g.bandSkill runs that strategy\'s effect (私募基金), the own one is gone (内部货源 → 私募基金)', () => {
  const { m, ps, use, pick, view } = setup({ band: 'band_price', funds: 10 });
  assert.equal(view().bandSkill.effectId, m.gd.band('band_price').skills[0].effectId);
  m.offerBandSkillChoice(ps, { choiceEvent: 'skill_change_1', desc: '从3个指令中选择1个' });
  assert.equal(ps.personalChoice.cards.length, 3);
  force(ps, 'band_fund');
  assert.deepEqual(pick(0), OK);
  assert.equal(ps.personalChoice, null);
  assert.equal(ps.bandCommand, 'band_fund');
  const v = view().bandSkill;
  assert.equal(v.commandBandId, 'band_fund');
  assert.equal(v.effectId, m.gd.band('band_fund').skills[0].effectId);
  assert.equal(v.avail.type, 'COOLDOWN');
  const f0 = ps.funds;
  assert.deepEqual(use(), OK);
  assert.ok(ps.funds > f0, '私募基金 pays 1–6');
  assert.ok(view().bandSkill.cooldown > 0, 'its cooldown');
  assert.equal(ps.counters['band:price:discount'] ?? 0, 0);
  checkInvariants(m);
});

test('the own strategy keeps its passive part: 好多委托 opens again at the next prep start; Mechanist\'s merge passive still runs, its click 指令 does not', () => {
  const a = setup({ band: 'band_random' });
  a.prepStart();
  force(a.ps, 'band_fund');
  assert.deepEqual(a.pick(0), OK);
  assert.equal(a.ps.bandCommand, 'band_fund');
  a.prepStart();
  assert.ok(a.ps.personalChoice, '好多委托 is still the strategy\'s');
  assert.ok(a.ps.personalChoice.cards.every((c) => c.bandId !== 'band_fund'), 'the current one is left out');

  const b = setup({ band: 'band_equipment' });
  const passive = b.reg.get(bandPassiveKey('band_equipment'));
  assert.ok(passive && typeof passive.onMerge === 'function' && typeof passive.onBandSkill !== 'function', 'the passive part is the merge reward');
  assert.ok(typeof b.reg.get(bandCommandKey('band_equipment')).onBandSkill === 'function', 'the 指令 part');
  // before the swap the strategy's whole handler runs; after it, its passive part alone
  const spy = (h) => { const orig = h.onMerge; let n = 0; h.onMerge = function (...args) { n++; return orig.apply(this, args); }; return { n: () => n, undo: () => { h.onMerge = orig; } }; };
  const whole = spy(b.reg.get('band:band_equipment'));
  const part = spy(passive);
  try {
    m0Merge(b);
    assert.deepEqual([whole.n(), part.n()], [1, 0], 'before the swap: the whole strategy');
    b.m.setBandCommand(b.ps, 'band_fund');
    m0Merge(b);
    assert.deepEqual([whole.n(), part.n()], [1, 1], 'after it: the passive part only');
  } finally { whole.undo(); part.undo(); }
  const slot = b.ps.shop.slots.map((s) => s && s.kind === 'item' && !s.sold).indexOf(true);
  const was = slot >= 0 ? b.ps.shop.slots[slot].id : null;
  assert.deepEqual(b.use(), OK, '私募基金');
  if (slot >= 0) assert.equal(b.ps.shop.slots[slot].id, was, '精巧设计 no longer rolls the item card');
});

/** One onMerge dispatch of an item merge (the hook's shape as PlayerState sends it). */
function m0Merge({ m, ps }) {
  m.dispatch(ps, 'onMerge', { kind: 'item', id: 'x', golden: 'y', round: m.round });
}

test('the taken 指令 has the stage the match\'s progress gives (溃心领域: round 5 → its 2nd stage, 9 → 3rd), on its own counter; the own staged strategy keeps its stage', () => {
  const { m, ps, view, use } = setup({ band: 'band_takecare' });
  ps.counters['band:stage'] = 2; // 华法琳 at her last stage: a 指令 staged on her counter would start at its 3rd
  m.round = 5;
  m.setBandCommand(ps, 'band_dance');
  const stages = m.gd.band('band_dance').skills;
  assert.equal(ps.counters[COMMAND_STAGE_COUNTER], 1);
  assert.equal(view().bandSkill.effectId, stages[1].effectId);
  const tiles = [];
  for (let r = FIELD.r0; r <= FIELD.r1; r++) for (let c = FIELD.c0; c <= FIELD.c1; c++) tiles.push([r, c]);
  const lane = tiles.find(([r, c]) => m._bandSkillTile(ps, r, c, stages[1].target?.filter));
  assert.ok(lane, 'a tile of the field');
  assert.deepEqual(use({ row: lane[0], col: lane[1] }), OK);
  assert.equal(view().bandSkill.usesLeft, stages[1].avail.count - 1, 'the 2nd stage\'s uses');
  m.round = 9;
  const v = view().bandSkill;
  assert.equal(v.effectId, stages[2].effectId);
  assert.equal(ps.counters['band:stage'], 2, '华法琳 keeps her stage');
  m.round = 12;
  assert.equal(view().bandSkill.effectId, stages[3].effectId, 'it moves on with the rounds');
  // the card shows the stage it would have
  m.round = 5;
  m.setBandCommand(ps, 'band_fund');
  const card = m.bandCommandCard(ps, { bandId: 'band_dance', effectId: m.gd.band('band_dance').effectId });
  assert.equal(card.stage, 1);
  assert.equal(card.name, stages[1].name);
});

test('a swap starts the 指令\'s uses afresh; taking the own 指令 back makes it the own one', () => {
  const { m, ps, use, view } = setup({ band: 'band_price', funds: 10 });
  assert.deepEqual(use(), OK, '内部货源');
  assert.equal(view().bandSkill.usable, view().bandSkill.usesLeft > 0);
  m.setBandCommand(ps, 'band_support');
  assert.equal(view().bandSkill.usesLeft, m.gd.band('band_support').skills[0].avail.count, 'uses of the new 指令');
  m.setBandCommand(ps, 'band_price');
  assert.equal(ps.bandCommand, null, 'its own again');
  assert.equal(view().bandSkill.commandBandId, null);
  assert.equal(m.setBandCommand(ps, 'band_amiya'), false, 'a passive strategy is no 指令');
  assert.equal(ps.bandCommand, null);
});

test('投机骰子: equipping destroys it and opens a choice of 3; refused — the dice stays — while another personal choice is open', () => {
  const { m, ps, pick } = setup({ band: 'band_amiya' });
  assert.ok(m.gd.item(DICE), 'the dice');
  const op =give(m, ps, Object.keys(m.gd.raw.chess).find((id) => m.gd.chess(id)?.visible && !m.gd.chess(id).isGolden && !m.gd.chess(id).isDiy), 'hand');
  const dice = giveItem(m, ps, DICE, 'hand');
  assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: dice.uid, targetUid: op.uid }), OK);
  assert.equal(ps.find(dice.uid), null, 'destroyed');
  assert.ok((op.items || []).every((x) => x.id !== DICE), 'not worn');
  const pc = ps.personalChoice;
  assert.equal(pc.kind, 'bandSkill');
  assert.equal(pc.choiceEvent, 'skill_change_1');
  assert.equal(pc.cards.length, 3, '「从3个指令」');
  assert.equal(pc.sourceItemId, DICE);
  const second = giveItem(m, ps, DICE, 'hand');
  const r = m.handle('p_0', { t: 'g.equip', itemUid: second.uid, targetUid: op.uid });
  assert.ok(r.error, 'a choice is open');
  assert.ok(ps.find(second.uid), 'the second dice stays');
  const want = pc.cards[1].bandId;
  assert.deepEqual(pick(1), OK);
  assert.equal(ps.bandCommand, want, 'a passive strategy gains the 指令');
  assert.equal(ps.privateView().bandSkill.commandBandId, want);
  checkInvariants(m);
});

test('the prep\'s deadline picks one at random; an AI seat picks a 指令 its rules use', () => {
  const a = setup({ band: 'band_random', bots: 1 });
  a.prepStart();
  const cards = a.ps.personalChoice.cards.map((c) => c.bandId);
  a.m.autoPickPersonalChoice(a.ps, 'random');
  assert.equal(a.ps.personalChoice, null);
  assert.ok(cards.includes(a.ps.bandCommand));

  const b = setup({ band: 'band_random', bots: 1 });
  b.prepStart();
  b.ps.personalChoice.cards = [
    { bandId: 'band_protect', effectId: b.m.gd.band('band_protect').effectId }, // 献身护卫: no bot rule
    { bandId: 'band_fund', effectId: b.m.gd.band('band_fund').effectId },
  ];
  b.m.autoPickPersonalChoice(b.ps, 'bot');
  assert.equal(b.ps.bandCommand, 'band_fund');
});
