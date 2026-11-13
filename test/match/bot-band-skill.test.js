// AI seats and 规程's active 指令 (server/match/bot.js useBandSkill): the shop-step 指令 before buying, the operator / tile
// 指令 (both before the buying), the 指令 never used, the funds kept, and a whole bot prep through botPrepBegin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, legalTileFor } from './harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { useBandSkill, botPrepBegin } from '../../server/match/bot.js';
import { BAND_MARK, BAND_CHEST } from '../../server/sim/content/bands/meta.js';
import { tileKey } from '../../server/match/board.js';

const quiet = { error() {}, warn() {}, info() {}, log() {} };
const TOTAL = 'band:skill:total';

function setup({ band, funds = 30, round = 3, coop = false, seed = 7 }) {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const seats = coop ? { mode: 'coop', humans: 1, bots: 3 } : { mode: 'solo', humans: 1 };
  const h = makeMatch({ ...seats, seed, registry: reg, fake: !coop, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: coop ? band : 'band_amiya' }); // coop: a strategy no AI seat drafted
  const m = h.m;
  m.round = round;
  const ps = h.ps('p_0');
  ps.bandId = band; ps.counters = {}; ps.funds = funds; ps.offers.length = 0; ps.ready = false;
  for (const l of [...ps.board.keys()]) ps.board.delete(l);
  ps.hand.fill(null); ps.temp.fill(null);
  ps.recompute();
  return { h, m, ps, uses: () => ps.counters[TOTAL] || 0 };
}
const visible = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy && c.goldenId);
const firstOf = (pred) => { const c = visible.find(pred); assert.ok(c, 'a chess of the test'); return c.chessId; };
const onBoard = (m, ps, id) => { const at = legalTileFor(m, ps, id); assert.ok(at, `a tile for ${id}`); return give(m, ps, id, 'board', at); };

test('a shop 指令 runs in the shop step only (私募基金: funds now); an operator 指令 in the board step only', () => {
  const a = setup({ band: 'band_fund' });
  useBandSkill(a.m, a.ps, 'board');
  assert.equal(a.uses(), 0, 'not in the board step');
  useBandSkill(a.m, a.ps, 'shop');
  assert.equal(a.uses(), 1);
  assert.ok(a.ps.funds > 30, 'funds gained');

  const b = setup({ band: 'band_survive' });
  const weak = onBoard(b.m, b.ps, firstOf((c) => c.tier === 1));
  const strong = onBoard(b.m, b.ps, firstOf((c) => c.tier === 5));
  useBandSkill(b.m, b.ps, 'shop');
  assert.equal(b.uses(), 0, 'not in the shop step');
  useBandSkill(b.m, b.ps, 'board');
  const mk = b.ps.effects.find((e) => e.key === BAND_MARK);
  assert.ok(mk, '意志鼓舞 used');
  assert.equal(mk.data.uid, strong.uid, 'on the strongest board operator');
  assert.notEqual(mk.data.uid, weak.uid);
});

test('献身护卫 and the shop-card swaps are never used; a 指令 with nothing to do charges nothing', () => {
  for (const band of ['band_protect', 'band_iberia', 'band_transfer']) {
    const { m, ps, uses } = setup({ band, round: 8 });
    onBoard(m, ps, firstOf((c) => c.tier === 2));
    useBandSkill(m, ps, 'shop');
    useBandSkill(m, ps, 'board');
    assert.equal(uses(), 0, band);
    assert.equal(ps.funds, 30);
  }
  // 献身护卫 with a teammate lower than the seat (the 指令 would work): still not used
  const p = setup({ band: 'band_protect', round: 8, coop: true });
  const low = [...p.m.players.values()].find((x) => x !== p.ps);
  low.lp = Math.max(1, p.ps.lp - 5);
  useBandSkill(p.m, p.ps, 'shop');
  useBandSkill(p.m, p.ps, 'board');
  assert.equal(p.uses(), 0, 'band_protect with a lower teammate');
  // 东之极道 with no active bond: no target at all
  const s = setup({ band: 'band_sell' });
  give(s.m, s.ps, firstOf((c) => c.tier === 1), 'hand');
  useBandSkill(s.m, s.ps, 'board');
  assert.equal(s.uses(), 0);
});

test('溃心领域 marks lane tiles (no piece may stand there), every use of the round; 宝藏探机 a spare deploy tile at the rear', () => {
  const d = setup({ band: 'band_dance', round: 4 });
  useBandSkill(d.m, d.ps, 'board');
  const marks = d.ps.effects.filter((e) => e.key === BAND_MARK);
  assert.equal(marks.length, 2, 'stage 2: both uses');
  for (const mk of marks) assert.equal(d.ps.deployMap().has(tileKey(mk.data.row, mk.data.col)), false, 'a lane tile');

  const t = setup({ band: 'band_treasure' });
  useBandSkill(t.m, t.ps, 'board');
  const [chest] = t.ps.effects.filter((e) => e.key === BAND_CHEST);
  assert.ok(chest, 'placed with deploy tiles to spare');
  const cols = [...t.ps.deployMap().keys()].map((k) => Number(k.split(',')[1]));
  assert.ok(chest.data.col <= Math.min(...cols), 'the rearmost column');
  assert.equal(t.ps.funds, 29);
});

test('a shop 指令 runs once a prep (人才锁定: 3 a round, but a second refresh rolls away the first one\'s cards)', () => {
  const { m, ps, uses } = setup({ band: 'band_support' });
  useBandSkill(m, ps, 'shop');
  assert.equal(uses(), 1);
});

test('a priced 指令 keeps half the funds (打包速递 costs 9); an unlimited one (DEFAULT) runs once too', () => {
  const poor = setup({ band: 'band_closeout', funds: 12 });
  useBandSkill(poor.m, poor.ps, 'shop');
  assert.equal(poor.uses(), 0, '9 > 12 / 2');
  // a seed whose match keeps 卡西米尔 (规程 draws 5 core bonds absent a match; seed 7 draws it)
  let seed = 1;
  while (setup({ band: 'band_kazimier', seed }).m.disabledBonds.includes('kazimierzShip')) seed++;
  const rich = setup({ band: 'band_kazimier', funds: 60, seed });
  useBandSkill(rich.m, rich.ps, 'shop');
  assert.equal(rich.uses(), 1, 'DEFAULT (卡西米尔 operators, 6 each): once');
});

test('a bot prep (botPrepBegin) uses its 指令 on the real prep path', () => {
  const { m, ps, uses } = setup({ band: 'band_survive' });
  // the board of the last round (the 指令 run before the buying and the placement)
  for (const id of [firstOf((c) => c.tier === 1), firstOf((c) => c.tier === 2)]) onBoard(m, ps, id);
  const job = botPrepBegin(m, ps);
  if (job) job.run();
  assert.equal(uses(), 1);
  const mk = ps.effects.find((e) => e.key === BAND_MARK);
  assert.ok(mk && ps.find(mk.data.uid)?.area === 'board', 'the mark on a board operator');
});
