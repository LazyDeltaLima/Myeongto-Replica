// 规程's active 指令: g.bandSkill's gate, target, cost and use limits (server/match/match/bandSkill.js) and m.private
// `bandSkill`. The effects are the strategies' own handlers (later); here a test handler stands in for them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch } from '../match/harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { STAGE_COUNTER } from '../../server/sim/content/bands/meta.js';
import { validateC2S } from '../../shared/protocol.js';
import { FIELD, fieldTile, tileKey } from '../../server/match/board.js';
import { PHASE } from '../../shared/constants.js';

const OK = { ok: true };
const quiet = { error() {}, warn() {}, info() {}, log() {} };

/** A 规程 match in PREP R1 with `band`; `handler` replaces the band's registry entry (null: the season's own). */
/** @param {{ band: string, handler?: { onBandSkill?: Function, onBandSkillUsed?: Function } | null, funds?: number, seed?: number }} o */
function setup({ band, handler = { onBandSkill(_ctx, ev) { ev.handled = true; } }, funds = 20, seed = 7 }) {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const calls = [];
  if (handler) {
    reg.band(band, {
      onBandSkill(ctx, ev) { calls.push({ hook: 'use', ev: { ...ev } }); handler.onBandSkill?.(ctx, ev); },
      onBandSkillUsed(ctx, ev) { calls.push({ hook: 'used', ev: { ...ev } }); handler.onBandSkillUsed?.(ctx, ev); },
    });
  }
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: reg, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  ps.bandId = band; ps.counters = {}; ps.funds = funds; ps.offers.length = 0; ps.ready = false;
  const use = (target = {}) => m.handle('p_0', { t: 'g.bandSkill', ...target });
  const nextRound = () => { m.round += 1; };
  return { h, m, ps, use, calls, nextRound, view: () => ps.privateView().bandSkill };
}

/** Board tiles of the player's field by the stage legend: a passable buildable one, a passable unbuildable one, a closed one. */
function tiles(m, ps) {
  const out = { both: null, passOnly: null, closed: null };
  const field = m.deployFieldOf(ps);
  for (let r = FIELD.r0; r <= FIELD.r1; r++) {
    for (let c = FIELD.c0; c <= FIELD.c1; c++) {
      const [sr, sc] = fieldTile(field, r, c);
      const t = m.stage.tiles[m.stage.rows[sr][sc]];
      if (!t) continue;
      if (t.groundPassable && t.buildable !== 'NONE' && !ps.board.has(tileKey(r, c))) out.both ??= { row: r, col: c };
      else if (t.groundPassable && t.buildable === 'NONE') out.passOnly ??= { row: r, col: c };
      else if (!t.groundPassable) out.closed ??= { row: r, col: c };
    }
  }
  return out;
}

test('g.bandSkill: the message shape — no field, a uid, a slot, or a row + col', () => {
  assert.equal(validateC2S({ t: 'g.bandSkill' }), null);
  assert.equal(validateC2S({ t: 'g.bandSkill', uid: 3 }), null);
  assert.equal(validateC2S({ t: 'g.bandSkill', slot: 2 }), null);
  assert.equal(validateC2S({ t: 'g.bandSkill', row: 10, col: 4 }), null);
  assert.notEqual(validateC2S({ t: 'g.bandSkill', slot: 16 }), null);
  assert.notEqual(validateC2S({ t: 'g.bandSkill', row: 19, col: 0 }), null);
});

test('a strategy without an active stage: no bandSkill view, BAD_TARGET; the default season has none', () => {
  const { use, view } = setup({ band: 'band_amiya', handler: null });
  assert.equal(view(), null);
  assert.deepEqual(use(), { error: 'BAD_TARGET', detail: 'no active band skill' });
});

test('内部货源 (ROUND_RESET 1, 点击使用): once a round, the handler gets the stage; a target field is refused', () => {
  const { use, calls, nextRound, view, ps } = setup({ band: 'band_price' });
  assert.deepEqual(view(), {
    stage: 0, stageCount: 1, effectId: 'aceffect_band_73', type: 'ACTIVE', target: { type: 'NO_TARGET', filter: null },
    cost: 0, avail: { type: 'ROUND_RESET', count: 1 }, usesLeft: 1, cooldown: 0, usable: true, blocked: null,
  });
  assert.deepEqual(use({ uid: 1 }), { error: 'BAD_TARGET', detail: 'no target' });
  assert.equal(calls.length, 0, 'a refused target never reaches the handler');
  assert.deepEqual(use(), OK);
  assert.deepEqual(calls.map((c) => c.hook), ['use', 'used']);
  assert.equal(calls[0].ev.target, null);
  assert.equal(calls[0].ev.stage.buffs[0].key, 'skill_next_equip_buy_discount');
  assert.deepEqual(use(), { error: 'ALREADY', detail: 'no uses left' });
  assert.equal(view().usesLeft, 0);
  assert.equal(view().blocked, 'no uses left');
  nextRound();
  assert.equal(view().usesLeft, 1, 'a new round resets the count');
  assert.deepEqual(use(), OK);
  assert.equal(ps.counters['band:skill:total'], 2);
});

test('a use nobody handles changes nothing; a handler refusal is returned as it is', () => {
  const a = setup({ band: 'band_price', handler: { onBandSkill() {} } });
  assert.deepEqual(a.use(), { error: 'BAD_MSG', detail: 'band skill not implemented' });
  assert.equal(a.view().usesLeft, 1);
  assert.deepEqual(a.calls.map((c) => c.hook), ['use']);
  const b = setup({ band: 'band_kazimier', handler: { onBandSkill(_ctx, ev) { ev.error = { error: 'HAND_FULL' }; } } });
  assert.deepEqual(b.use(), { error: 'HAND_FULL' });
  assert.equal(b.ps.funds, 20, 'a refused use costs nothing');
});

test('骑士团长 (DEFAULT, cost 6): no use limit, the cost paid after the handler (onSpend), COST_DELTA moves it', () => {
  const seen = [];
  const { use, ps, view } = setup({
    band: 'band_kazimier', funds: 13,
    handler: { onBandSkill(ctx, ev) { ev.handled = true; seen.push(ctx.funds()); }, onBandSkillUsed(ctx) { ctx.setCounter('band:skill:cost', -2); } },
  });
  assert.equal(view().cost, 6);
  assert.equal(view().usesLeft, null);
  assert.deepEqual(use(), OK);
  assert.deepEqual(seen, [13], 'the handler runs before the payment');
  assert.equal(ps.funds, 7);
  assert.equal(ps.stats.gold, 6, 'the payment counts as spent funds (最佳品味\'s stage)');
  assert.equal(view().cost, 4, 'the cost key moved the next use');
  assert.deepEqual(use(), OK);
  assert.equal(ps.funds, 3);
  assert.deepEqual(use(), { error: 'NO_FUNDS' });
  assert.equal(view().usable, false);
});

test('私募基金 (COOLDOWN, 冷却回合数等同于获得资金): the handler sets the cooldown; ready again that many rounds later', () => {
  const { use, view, nextRound } = setup({ band: 'band_fund', handler: { onBandSkill(_ctx, ev) { ev.handled = true; ev.cooldown = 2; } } });
  assert.deepEqual(use(), OK);
  assert.equal(view().cooldown, 2);
  assert.deepEqual(use(), { error: 'ALREADY', detail: 'cooldown' });
  nextRound();
  assert.equal(view().cooldown, 1);
  nextRound();
  assert.equal(view().cooldown, 0);
  assert.deepEqual(use(), OK);
});

test('条文修正: the locked stage (NONE, 第4回合解锁) refuses; from round 4 the COOLDOWN 3 stage, an own operator as target', () => {
  const { m, ps, use, view, calls, nextRound } = setup({ band: 'band_jenga' });
  const piece = ps.acquireChess(Object.values(ACT3.chess).find((c) => c.visible && !c.isGolden && !c.isDiy && c.tier === 1).chessId, { source: 'buy' });
  assert.equal(view().type, 'NONE');
  assert.deepEqual(use({ uid: piece.uid }), { error: 'WRONG_PHASE', detail: 'locked' });
  m.round = 4;
  assert.equal(view().type, 'ACTIVE', 'the view reads the stage');
  assert.equal(ps.counters[STAGE_COUNTER] ?? 0, 0, '…without moving the counter');
  assert.deepEqual(use(), { error: 'BAD_TARGET' });
  assert.deepEqual(use({ uid: 99999 }), { error: 'BAD_TARGET' });
  assert.deepEqual(use({ uid: piece.uid }), OK);
  assert.equal(ps.counters[STAGE_COUNTER], 1, 'a use moves the stage on');
  assert.deepEqual(calls[0].ev.target, { kind: 'chess', uid: piece.uid, area: ps.find(piece.uid).area });
  assert.equal(calls[0].ev.stageIndex, 1);
  assert.equal(view().cooldown, 3);
  for (let i = 0; i < 3; i++) { assert.notEqual(use({ uid: piece.uid }).ok, true); nextRound(); }
  assert.deepEqual(use({ uid: piece.uid }), OK, 'round 7: three rounds later');
});

test('溃心领域: each stage its own uses a round (1 → 2 at round 4); a MAP_TILE target is a passable tile of the own field', () => {
  const { m, ps, use, view, calls } = setup({ band: 'band_dance' });
  const t = tiles(m, ps);
  assert.ok(t.both && t.passOnly && t.closed, JSON.stringify(t));
  assert.deepEqual(use({ uid: 1 }), { error: 'BAD_TARGET' });
  assert.deepEqual(use({ row: t.closed.row, col: t.closed.col }), { error: 'BAD_TILE' });
  assert.deepEqual(use({ row: 2, col: 2 }), { error: 'BAD_TILE' }, 'outside the own field');
  assert.deepEqual(use({ row: t.passOnly.row, col: t.passOnly.col }), OK, 'PASSABLE: a tile no operator can stand on is fine');
  assert.deepEqual(calls[0].ev.target, { kind: 'tile', row: t.passOnly.row, col: t.passOnly.col });
  assert.deepEqual(use({ row: t.both.row, col: t.both.col }), { error: 'ALREADY', detail: 'no uses left' });
  m.round = 4;
  assert.deepEqual([view().stage, view().usesLeft], [1, 2]);
  assert.deepEqual(use({ row: t.both.row, col: t.both.col }), OK);
});

test('宝藏探机 (PASSABLE_AND_BUILDABLE, cost 1): the tile must take an operator and be free', () => {
  const { m, ps, use } = setup({ band: 'band_treasure' });
  const t = tiles(m, ps);
  assert.deepEqual(use({ row: t.passOnly.row, col: t.passOnly.col }), { error: 'BAD_TILE' });
  const piece = ps.acquireChess(Object.values(ACT3.chess).find((c) => c.visible && !c.isGolden && !c.isDiy && c.tier === 1 && c.position === 'MELEE').chessId, { source: 'buy' });
  ps.hand[ps.hand.indexOf(piece)] = null;
  ps.board.set(tileKey(t.both.row, t.both.col), piece);
  assert.deepEqual(use({ row: t.both.row, col: t.both.col }), { error: 'BAD_TILE' }, 'an operator stands there');
  ps.board.delete(tileKey(t.both.row, t.both.col));
  assert.deepEqual(use({ row: t.both.row, col: t.both.col }), OK);
  assert.equal(ps.funds, 19);
});

test('纸片替身 (SHOP_SLOT CHAR, unusable while a reward offer holds the shop): an unsold chess slot only', () => {
  const { ps, use, calls } = setup({ band: 'band_transfer' });
  const chessSlot = ps.shop.slots.findIndex((s) => s && s.kind === 'chess' && !s.sold);
  const itemSlot = ps.shop.slots.findIndex((s) => s && s.kind === 'item');
  assert.ok(chessSlot >= 0);
  if (itemSlot >= 0) assert.deepEqual(use({ slot: itemSlot }), { error: 'BAD_TARGET' });
  assert.deepEqual(use({ slot: 15 }), { error: 'BAD_TARGET' });
  ps.offers.push({ tier: 1, source: 'merge', slots: [] });
  assert.deepEqual(use({ slot: chessSlot }), { error: 'WRONG_PHASE', detail: 'reward offer' });
  ps.offers.length = 0;
  assert.deepEqual(use({ slot: chessSlot }), OK);
  assert.deepEqual(calls[0].ev.target, { kind: 'shop', slot: chessSlot, id: ps.shop.slots[chessSlot].id, slotKind: 'chess' });
  ps.shop.slots[chessSlot].sold = true;
  assert.deepEqual(use({ slot: chessSlot }), { error: 'BAD_TARGET' }, 'a sold slot');
});

test('the gate: PREP only, not after Ready, not when eliminated', () => {
  const { m, ps, use, view } = setup({ band: 'band_price' });
  ps.ready = true;
  assert.deepEqual(use(), { error: 'WRONG_PHASE', detail: 'ready' });
  assert.equal(view().usable, false);
  ps.ready = false;
  m.phase = PHASE.ROUND_START;
  assert.deepEqual(use(), { error: 'WRONG_PHASE' });
  m.phase = PHASE.PREP;
  ps.alive = false;
  assert.deepEqual(use(), { error: 'ELIMINATED' });
  ps.alive = true;
  assert.deepEqual(use(), OK);
});

test('幻画为真 (ALL_LIMIT 1, 每场模拟限1次): one use a match, a new round gives none back', () => {
  const { ps, use, view, nextRound } = setup({ band: 'band_copy' });
  const piece = ps.acquireChess(Object.values(ACT3.chess).find((c) => c.visible && !c.isGolden && !c.isDiy && c.tier === 1).chessId, { source: 'buy' });
  assert.deepEqual([view().avail, view().usesLeft], [{ type: 'ALL_LIMIT', count: 1 }, 1]);
  assert.deepEqual(use({ uid: piece.uid }), OK);
  nextRound();
  assert.equal(view().usesLeft, 0);
  assert.deepEqual(use({ uid: piece.uid }), { error: 'ALREADY', detail: 'no uses left' });
});

test('私募基金 (小贾斯汀, skill_gain_gold_cd_by_gold): 1–6 funds at once, and that many rounds of cooldown', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const { ps, use, view } = setup({ band: 'band_fund', handler: null, funds: 10, seed });
    assert.deepEqual(use(), OK, `seed ${seed}`);
    const gold = ps.funds - 10;
    assert.ok(gold >= 1 && gold <= 6, `seed ${seed}: ${gold}`);
    assert.equal(view().cooldown, gold, 'the cooldown is the funds gained');
    seen.add(gold);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6], 'every amount of the range comes up');
});
