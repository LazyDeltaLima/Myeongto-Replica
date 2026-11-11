// 规程's drag 指令 whose effect waits for the next battle (content/bands/meta.js addMark → server/match/player/round.js
// battleInput `bandMarks` → content/bands/battle.js): the mark a use leaves, what the battle input does with it (全场聚焦's
// elite, 电气化！'s item, 消解空间's hand operators), and what the battle does on the marked operator (意志鼓舞, 药枚实验,
// 消解空间, 正直教官) — through g.bandSkill, the real registry and the real spec path. The battle runs the buffs of the
// strategy stage reached (`bandStage`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, legalTileFor } from '../match/harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { BAND_MARK } from '../../server/sim/content/bands/meta.js';
import { bandBattleBuffs } from '../../server/sim/content/bands/battle.js';
import { tileKey } from '../../server/match/board.js';
import { reviveNow } from '../../server/sim/content/items/battle.js';
import { capOf } from '../../server/sim/content/garrisons/effects/triggered.js';

const OK = { ok: true };
const quiet = { error() {}, warn() {}, info() {}, log() {} };

/** A 规程 match in PREP of `round` holding `band`, its own handlers. */
function setup({ band, funds = 30, seed = 7, round = 1 }) {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: reg, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  m.round = round;
  const ps = h.ps('p_0');
  ps.bandId = band; ps.counters = {}; ps.funds = funds; ps.offers.length = 0; ps.ready = false;
  for (const l of [...ps.board.keys()]) ps.board.delete(l);
  ps.hand.fill(null); ps.temp.fill(null);
  ps.recompute();
  const use = (target = {}) => m.handle('p_0', { t: 'g.bandSkill', ...target });
  return { h, m, ps, use, view: () => ps.privateView().bandSkill };
}

const visible = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy && c.goldenId);
const firstOf = (pred) => { const c = visible.find(pred); assert.ok(c, 'a chess of the test'); return c.chessId; };
const onBoard = (m, ps, id) => { const at = legalTileFor(m, ps, id); assert.ok(at, `a tile for ${id}`); return give(m, ps, id, 'board', at); };
/** Every free legal board tile of `id` for the player. */
function tilesFor(m, ps, id) {
  const out = [];
  const skip = new Set();
  for (let t = legalTileFor(m, ps, id, skip); t; t = legalTileFor(m, ps, id, skip)) { out.push(t); skip.add(tileKey(t[0], t[1])); }
  return out;
}
const marks = (ps) => ps.effects.filter((e) => e.key === BAND_MARK);
const itemSlot = (ps) => ps._shopKinds().indexOf('item');
const itemCard = (m, id) => ({ kind: 'item', id, basePrice: m.gd.itemPrice(id), frozen: false, sold: false });
const items = Object.values(ACT3.items);
const equipOf = (pred) => { const r = items.find((x) => x.itemType === 'EQUIP' && !x.isGolden && pred(x)); assert.ok(r, 'an item of the test'); return r.itemId ?? r.id; };

/** The round's normal battle of the player, built through the real spec path and started. */
function battleOf(m, ps) {
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'mk', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  return b;
}
/** Step `b` until its battle started (`battleStart`: after the initial deployment) and `t` more seconds ran. */
function untilStarted(b, t = 0) {
  let started = null;
  b.on('battleStart', () => { started = b.time; });
  while (!b.finished && (started == null || b.time < started + t) && b.time < 10) b.step();
  assert.ok(started != null, 'the battle started');
}
const unitOf = (b, uid) => b.allyUnits.find((u) => u.kind === 'op' && u.uid === uid);

test('a mark: a hidden effect of the round, in the view and the round\'s battle input (not the 联防 one), gone at the next round start', () => {
  const { m, ps, use, view } = setup({ band: 'band_survive' });
  const p = onBoard(m, ps, firstOf((c) => c.tier === 2));
  assert.deepEqual(use({ uid: p.uid }), OK);
  const [mk] = marks(ps);
  assert.ok(mk && mk.hidden === true && mk.battle === false, 'a hidden mark, not a playerEffects card');
  assert.deepEqual(view().marks, [{ effectId: 'eff_band12', uid: p.uid }]);
  assert.deepEqual(ps.battleInput().bandMarks, [{ effectId: 'eff_band12', uid: p.uid }]);
  assert.equal(ps.battleInput({ marks: false }).bandMarks, undefined, '联防: no marks');
  assert.ok(!ps.battleInput().playerEffects.some((e) => e.key === BAND_MARK));
  m.round += 1;
  m.dispatch(ps, 'onRoundStart', { round: m.round });
  assert.equal(marks(ps).length, 0, 'one battle');
  assert.equal(ps.battleInput().bandMarks, undefined);
});

test('全场聚焦 (大嘴莫布): the operator fights its next battle as its elite (cost 1); an elite is refused', () => {
  const { m, ps, use } = setup({ band: 'band_evolve' });
  const id = firstOf((c) => c.tier === 3);
  const p = onBoard(m, ps, id);
  assert.deepEqual(use({ uid: p.uid }), OK);
  assert.equal(ps.funds, 29);
  const u = ps.battleInput().units.find((x) => x.uid === p.uid);
  assert.equal(u.chessId, m.gd.goldenIdOf(id), 'the elite in battle');
  assert.equal(p.id, id, 'the piece itself stays normal');
  const b = battleOf(m, ps);
  assert.equal(unitOf(b, p.uid).defId, m.gd.goldenIdOf(id));

  const e = setup({ band: 'band_evolve' });
  const q = onBoard(e.m, e.ps, m.gd.goldenIdOf(firstOf((c) => c.tier === 2)));
  assert.deepEqual(e.use({ uid: q.uid }), { error: 'BAD_TARGET', detail: 'already elite' });
  assert.equal(marks(e.ps).length, 0);
});

test('电气化！ (布丁): the item card is gone at once; the next battle gives the item to every board operator with a free slot; a consume-on-equip item is refused', () => {
  const { m, ps, use } = setup({ band: 'band_pudd' });
  const i = itemSlot(ps);
  assert.ok(i >= 0, 'an item slot');
  const item = equipOf((x) => x.kind === 'passive');
  const other = equipOf((x) => x.kind === 'passive' && (x.itemId ?? x.id) !== item);
  const a = onBoard(m, ps, firstOf((c) => c.tier === 1));
  const full = onBoard(m, ps, firstOf((c) => c.tier === 2));
  const slots = m.gd.equipSlotsOf(full.id);
  full.items = Array.from({ length: slots }, () => ps.newPiece('item', other));
  const hand = give(m, ps, firstOf((c) => c.tier === 3), 'hand');
  ps.shop.slots[i] = itemCard(m, item);
  assert.deepEqual(use({ slot: i }), OK);
  assert.equal(ps.shop.slots[i], null, 'destroyed');
  const inp = ps.battleInput();
  assert.deepEqual(inp.units.find((x) => x.uid === a.uid).items, [item]);
  assert.equal(inp.units.find((x) => x.uid === full.uid).items.length, slots, 'a full operator gets none');
  assert.ok(!inp.units.some((x) => x.uid === hand.uid), 'the hand is not on the field');
  assert.deepEqual(inp.bandMarks, [{ effectId: 'eff_band24', itemId: item }]);

  const c = setup({ band: 'band_pudd' });
  const ci = itemSlot(c.ps);
  const consume = equipOf((x) => typeof x.kind === 'string' && x.kind.startsWith('consume_on_equip'));
  c.ps.shop.slots[ci] = itemCard(c.m, consume);
  assert.deepEqual(c.use({ slot: ci }), { error: 'BAD_TARGET', detail: 'consumed on equip' });
  assert.equal(c.ps.shop.slots[ci].id, consume, 'nothing changed');
});

test('意志鼓舞 (百炼嘉维尔): knocked out at combat start and rebuilt on its tile at once; then two knock-outs revive in place, the third stands', () => {
  const { m, ps, use } = setup({ band: 'band_survive' });
  const p = onBoard(m, ps, firstOf((c) => c.tier === 2));
  assert.deepEqual(use({ uid: p.uid }), OK);
  const b = battleOf(m, ps);
  const u = unitOf(b, p.uid);
  // another revive (an item's, 埃芒加德's) takes none of the start knock-out (the client's reborn_mask)
  const other = [];
  let watch = true;
  b.on('death', (c) => { if (watch && c.unit === u) other.push(reviveNow(b, c, 'item')); }, { priority: 50 });
  untilStarted(b);
  assert.deepEqual(other, [false], 'no other revive at the start');
  assert.ok(u.alive && u.deployed, 'back on the field at once');
  assert.equal(b._perPlayer.p_0.deaths, 1, 'the start knock-out');
  const tile = [u.tileR, u.tileC];
  watch = false;
  for (let k = 0; k < 2; k++) {
    b.kill(u, null);
    assert.ok(u.alive, `revive ${k + 1}`);
    assert.deepEqual([u.tileR, u.tileC], tile, 'where it lies');
  }
  b.kill(u, null);
  assert.equal(u.alive, false, 'the third knock-out stands');
});

test('消解空间 (Misery): the first damage knocks the operator out and the rightmost 整备区 operator comes in on its tile; with an empty 整备区, nothing', () => {
  const { m, ps, use } = setup({ band: 'band_breakaway' });
  const p = onBoard(m, ps, firstOf((c) => c.tier === 2));
  const left = give(m, ps, firstOf((c) => c.tier === 1), 'hand');
  const right = give(m, ps, firstOf((c) => c.tier === 3), 'hand');
  const slotOf = (q) => ps.hand.findIndex((x) => x && x.uid === q.uid);
  const [lo, hi] = slotOf(left) < slotOf(right) ? [left, right] : [right, left];
  assert.deepEqual(use({ uid: p.uid }), OK);
  assert.equal(ps.battleInput().reserve.length, 2, 'the hand operators reach the battle');
  const b = battleOf(m, ps);
  const u = unitOf(b, p.uid);
  const tile = [u.tileR, u.tileC];
  b.emit('damaged', { target: u, amount: 1, type: 'true' });
  assert.equal(u.alive, false);
  assert.ok(u.removed, 'no body, no redeploy');
  const next = unitOf(b, hi.uid);
  assert.ok(next && next.alive && next.deployed, 'the rightmost hand operator');
  assert.deepEqual([next.tileR, next.tileC], tile);
  assert.ok(!unitOf(b, lo.uid)?.alive, 'only one');

  const e = setup({ band: 'band_breakaway' });
  const q = onBoard(e.m, e.ps, firstOf((c) => c.tier === 2));
  assert.deepEqual(e.use({ uid: q.uid }), OK);
  const eb = battleOf(e.m, e.ps);
  const eu = unitOf(eb, q.uid);
  eb.emit('damaged', { target: eu, amount: 1, type: 'true' });
  assert.ok(eu.alive, 'no hand operator: nothing');
});

test('药枚实验 (桑葚): the marked operator gains shields on attacks only while none of the player\'s units stands further right; stage 2 marks eff_band18', () => {
  /** Shields from 40 attacks of the marked operator; `right`: another operator in a column right of it. */
  const run = (right) => {
    const { m, ps, use } = setup({ band: 'band_shield' });
    const id = firstOf((c) => c.tier === 2);
    const tiles = tilesFor(m, ps, id);
    const minC = Math.min(...tiles.map((t) => t[1]));
    const p = give(m, ps, id, 'board', tiles.find((t) => t[1] === minC));
    if (right) {
      const oid = firstOf((c) => c.tier === 1);
      const far = tilesFor(m, ps, oid).filter((t) => t[1] > minC).sort((a, b) => b[1] - a[1])[0];
      assert.ok(far, 'a tile further right');
      give(m, ps, oid, 'board', far);
    }
    assert.deepEqual(use({ uid: p.uid }), OK);
    const b = battleOf(m, ps);
    const u = unitOf(b, p.uid);
    untilStarted(b, 0.2);
    let got = 0;
    for (let k = 0; k < 40; k++) {
      for (const bf of [...u.buffs]) if (bf.shieldHits) b.removeBuff(u, bf.key);
      b.emit('attack', { attacker: u, targets: [] });
      if (u.buffs.some((bf) => bf.shieldHits)) got++;
    }
    return got;
  };
  assert.ok(run(false) > 0, 'front-most: 20 % of the attacks');
  assert.equal(run(true), 0, 'a unit further right: none');

  const s = setup({ band: 'band_shield', round: 7 });
  s.ps.counters['band:stage'] = 1;
  const p = onBoard(s.m, s.ps, firstOf((c) => c.tier === 2));
  assert.deepEqual(s.use({ uid: p.uid }), OK);
  assert.equal(marks(s.ps)[0].data.effectId, 'eff_band18');
});

test('正直教官 (坚雷, R5): the operator\'s 特质 caps + 5 in its next battle', () => {
  const { m, ps, use } = setup({ band: 'band_limit', round: 5 });
  const p = onBoard(m, ps, firstOf((c) => c.tier === 2));
  const o = onBoard(m, ps, firstOf((c) => c.tier === 3));
  assert.deepEqual(use({ uid: p.uid }), OK);
  const b = battleOf(m, ps);
  assert.equal(capOf(b, { unit: unitOf(b, p.uid), cap: 3 }), 8);
  assert.equal(capOf(b, { unit: unitOf(b, o.uid), cap: 3 }), 3, 'only the marked one');
});

test('the battle runs the buffs of the stage reached (bandStage); a strategy without stages its own', () => {
  const rec = { buffs: [{ key: 'a' }], skills: [{ buffs: [{ key: 's0' }] }, { buffs: [{ key: 's1' }] }] };
  assert.deepEqual(bandBattleBuffs(rec, undefined).map((b) => b.key), ['s0']);
  assert.deepEqual(bandBattleBuffs(rec, 1).map((b) => b.key), ['s1']);
  assert.deepEqual(bandBattleBuffs(rec, 9).map((b) => b.key), ['s1'], 'clamped');
  assert.deepEqual(bandBattleBuffs({ buffs: [{ key: 'a' }] }, 3).map((b) => b.key), ['a']);
  const { ps } = setup({ band: 'band_shield' });
  assert.equal(ps.battleInput().bandStage, undefined, 'stage 0: not stated');
  ps.counters['band:stage'] = 1;
  assert.equal(ps.battleInput().bandStage, 1);
});
