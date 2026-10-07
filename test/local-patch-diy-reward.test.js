// test/local-patch-diy-reward.test.js — local patch (user decision 2026-10-07): the promotion reward offers chess of
// tier min(调度中心 level + 1, 6), and a 自选 pick of that tier is among them like any operator of the tier — upstream
// 0.2.0 gated the picks by the shop's level (diyRollEntries), so a tier-V pick never came at 调度中心 4 nor a tier-VI one
// at 5. player/acquire.js pushRewardOffer draws the stock with diyStockEntries (no 调度中心 gate, the roll's tier rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../shared/constants.js';
import { makeMatch } from './match/harness.js';

const T5 = 'chess_char_5_diy1_a', T6 = 'chess_char_6_diy1_a';
const PICKS = { [T5]: { charId: 'char_2027_wang', skillIndex: 0 }, [T6]: { charId: 'char_1035_wisdel', skillIndex: 0 } };

test('promotion reward: tier = 调度中心 + 1 (≤ 6), and that tier\'s 自选 pick is offered too', () => {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: PICKS },
    { seat: 1, playerId: 'ai_0', name: 'AI', isBot: true, connected: true }];
  const h = makeMatch({ mode: 'coop', seats, seed: 2 }).start(); // seed 2: 炎 (望) and 协防 not banned
  const m = h.m;
  const ps = m.order.find((p) => p.playerId === 'p_0');
  h.run(() => m.phase === PHASE.PREP && m.round === 1);
  assert.deepEqual([...ps.diyStock.entries.keys()].sort(), [T5, T6]);
  const seen = (lv) => {
    ps.shop.level = lv;
    const tiers = new Set(), diy = new Set();
    for (let i = 0; i < 600; i++) {
      const o = ps.pushRewardOffer('merge');
      ps.offers.length = 0;
      tiers.add(o.tier);
      for (const s of o.slots) if (s.id === T5 || s.id === T6) diy.add(s.id);
    }
    return { tiers: [...tiers], diy: [...diy].sort() };
  };
  assert.deepEqual(seen(4), { tiers: [5], diy: [T5] }, '调度中心 4: tier V, the tier-V pick among them');
  assert.deepEqual(seen(5), { tiers: [6], diy: [T6] }, '调度中心 5: tier VI, the tier-VI pick among them');
  assert.deepEqual(seen(6), { tiers: [6], diy: [T6] }, '调度中心 6: tier VI only');
  m.dispose();
});
