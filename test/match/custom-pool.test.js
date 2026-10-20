// test/match/custom-pool.test.js — the custom 规则 모드's shop pool sizes (shared/ruleset.js pool.chess / pool.items,
// customPoolCount; server/match/gamedata.js poolCopies / itemPoolCopies): a percent of the official count of the room's
// size (solo, co-op ×2, 8 players ×4 and their equipment ×2), never below 1; the 自选 stock with the chess pool; on the
// real match path the pools take the scaled counts and the draws stay the official ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, LARGE_SEATS } from '../../shared/constants.js';
import { sanitizeCustom, customPoolCount } from '../../shared/ruleset.js';
import { GameData } from '../../server/match/gamedata.js';
import { attachAudit } from '../../server/match/audit.js';
import { DATA, makeMatch } from './harness.js';

const custom = (c) => ({ preset: 'custom', custom: c });
const setupOf = (m) => ({ stageId: m.stageId, factions: m.factions.join(), bossId: m.bossId, hiddenBossId: m.hiddenBossId, drawn: m.disabledBonds.join() });

test('GameData: every chess and shop item at the percent of its official count for the room size, at least 1', () => {
  const rooms = [['mode_single_hard', undefined], ['mode_multi_hard', undefined], ['mode_multi_hard', LARGE_SEATS]];
  for (const [modeId, seats] of rooms) {
    const off = new GameData(DATA, modeId, null, { seats });
    const items = Object.values(off.shopItemsByTier).flat();
    assert.ok(items.length > 0);
    assert.deepEqual(
      [new GameData(DATA, modeId, sanitizeCustom({}), { seats })].map((g) => [g.visibleChess.map((id) => g.poolCopies(id)), items.map((id) => g.itemPoolCopies(id))])[0],
      [off.visibleChess.map((id) => off.poolCopies(id)), items.map((id) => off.itemPoolCopies(id))],
      `${modeId} ${seats ?? ''}: 100 % is the official pool`,
    );
    for (const [chess, itemsPct] of [[50, 200], [10, 10], [1000, 150]]) {
      const g = new GameData(DATA, modeId, sanitizeCustom({ pool: { chess, items: itemsPct } }), { seats });
      for (const id of g.visibleChess) {
        const n = off.poolCopies(id);
        assert.equal(g.poolCopies(id), Math.max(1, Math.round((n * chess) / 100)), `${modeId} ${id} ${chess}%`);
      }
      for (const id of items) {
        const n = off.itemPoolCopies(id);
        assert.equal(g.itemPoolCopies(id), Math.max(1, Math.round((n * itemsPct) / 100)), `${modeId} ${id} ${itemsPct}%`);
      }
    }
  }
  // the room's multiplier is in the count the percent scales: 8 players ×4 → 4 players ×2 → solo
  const id = new GameData(DATA, 'mode_single_hard').visibleChess[0];
  const at = (modeId, seats) => new GameData(DATA, modeId, sanitizeCustom({ pool: { chess: 50 } }), { seats }).poolCopies(id);
  const solo = new GameData(DATA, 'mode_single_hard').poolCopies(id);
  assert.deepEqual([at('mode_single_hard'), at('mode_multi_hard'), at('mode_multi_hard', LARGE_SEATS)],
    [customPoolCount(solo, 50), solo, solo * 2]);
  // an uncapped (effect-only) item stays uncapped
  const special = Object.keys(DATA.items).find((x) => new GameData(DATA, 'mode_multi_hard').itemPoolCopies(x) === null);
  if (special) assert.equal(new GameData(DATA, 'mode_multi_hard', sanitizeCustom({ pool: { items: 300 } })).itemPoolCopies(special), null);
});

test('real match path: the shared pool and the equipment stock take the scaled counts; the setup draws stay the official ones', () => {
  for (const seed of [3, 11]) {
    const a = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, bots: 2, seed, fake: true }).start();
    const b = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, bots: 2, seed, fake: true, ruleset: custom({ pool: { chess: 150, items: 50 } }) }).start();
    assert.deepEqual(setupOf(b.m), setupOf(a.m));
    for (const [id, e] of a.m.pool.entries) assert.equal(b.m.pool.cap(id), customPoolCount(e.cap, 150), id);
    assert.equal(b.m.pool.entries.size, a.m.pool.entries.size, 'the same chess are in the pool');
    for (const id of Object.values(a.m.gd.shopItemsByTier).flat()) assert.equal(b.m.itemPool.cap(id), customPoolCount(a.m.itemPool.cap(id), 50), id);
    a.m.dispose();
    b.m.dispose();
  }
});

test('the 自选 stock scales with the chess pool', () => {
  const T5 = 'chess_char_5_diy1_a', T6 = 'chess_char_6_diy1_a';
  const PICKS = { [T5]: { charId: 'char_2027_wang', skillIndex: 0 }, [T6]: { charId: 'char_1035_wisdel', skillIndex: 0 } };
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: PICKS },
    { seat: 1, playerId: 'ai_0', name: 'AI', isBot: true, connected: true }];
  const caps = (ruleset) => {
    const h = makeMatch({ mode: 'coop', seats, seed: 2, ruleset }).start();
    h.run(() => h.m.phase === PHASE.PREP && h.m.round === 1);
    const ps = h.m.order.find((p) => p.playerId === 'p_0');
    const out = Object.fromEntries([...ps.diyStock.entries].map(([id, e]) => [id, e.cap]));
    h.m.dispose();
    return out;
  };
  const off = caps(undefined);
  assert.deepEqual(Object.keys(off).sort(), [T5, T6]);
  const half = caps(custom({ pool: { chess: 50 } }));
  for (const id of [T5, T6]) assert.equal(half[id], customPoolCount(off[id], 50), id);
});

test('a small pool plays a whole co-op match: overdrawn copies, no errors, no invariant violations', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 0, bots: 4, seed: 5, ruleset: custom({ pool: { chess: 10, items: 10 } }) });
  const m = h.m;
  const audit = attachAudit(m);
  h.start();
  h.drive(() => h.ended != null, { maxSteps: 4e6 });
  assert.ok(h.ended, 'the match ended');
  assert.equal(m.errorCount, 0);
  assert.deepEqual(audit.violations, []);
  m.dispose();
});
