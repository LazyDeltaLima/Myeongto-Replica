// 规程's avatar bubbles (docs/rules/ui.md 「규정 아바타 말풍선」): the broadcast lines a bubble draws carry their player and
// fields on the real match path (test/match/harness.js), the strip leaves them out where the bubbles show, and a player's
// bubbles queue 2.5 s each (public/js/ui/statusBubbles.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../../server/data.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { makeMatch } from '../match/harness.js';
import { FakeBattle } from '../match/fakeBattle.js';
import { BUBBLE_MS, scheduleBubbles, statusBubbleFields, stripHides } from '../../public/js/ui/statusBubbles.js';
import { seasonFeature } from '../../shared/seasons.js';

const quiet = { warn() {}, error() {}, info() {}, debug() {} };
const ACT3 = hasGeneratedData() ? getData({ log: quiet, season: 'act3autochess' }) : null;
const tickers = (h, type) => h.bc.filter((x) => x.t === 'm.ticker' && x.type === type);

for (const clientCombat of [false, true]) {
  test(`规程: 完美作战 comes when the player's own battle ends, before the settle (${clientCombat ? 'browser' : 'server'}-run fields); a departure names its player`, { skip: !ACT3 }, () => {
    const h = makeMatch({ mode: 'coop', modeId: 'mode_multi_normal', humans: 2, seed: 5, data: ACT3, season: 'act3autochess', fake: true,
      clientCombat, instant: !clientCombat }).start();
    /** @type {{ playerId: string, phase: string, live: boolean }[]} */
    const seen = [];
    h.onBroadcast.push((msg) => {
      if (msg.t !== 'm.ticker' || msg.type !== 'PERFECT_BATTLE') return;
      const f = h.m.fields.find((x) => x.players.includes(msg.playerId));
      seen.push({ playerId: msg.playerId, phase: h.m.phase, live: !!(f && f.live) });
    });
    if (clientCombat) h.autoHumans();
    h.drive(() => h.m.phase === 'PREP' && h.m.round >= 2);
    const streaks = [...h.m.players.values()].filter((p) => p.winStreak > 0).map((p) => p.playerId);
    assert.ok(streaks.length > 0, 'a fake battle is a perfect round (the case under test ran)');
    assert.deepEqual([...new Set(seen.map((x) => x.playerId))].sort(), streaks.sort(), 'each perfect player has its line');
    assert.equal(seen.length, new Set(seen.map((x) => x.playerId)).size, 'once per player and round');
    assert.ok(seen.every((x) => x.phase === 'COMBAT' && !x.live), `sent in COMBAT as the player's field ends, not at the settle: ${JSON.stringify(seen)}`);
    assert.ok(tickers(h, 'PERFECT_BATTLE').every((x) => x.id === 'comment_perfect_battle'), 'the table\'s broadcast');
    h.m.onLeave('p_1');
    const left = tickers(h, 'PLAYER_LEFT');
    assert.equal(left.length, 1);
    assert.equal(left[0].playerId, 'p_1', 'the departure line names its player (the strip leaves it out in 规程)');
    h.m.dispose();
  });
}

test('盟约 has no 完美作战 broadcast: nothing is sent, and it shows no bubbles', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 5, fake: true }).start();
  h.drive(() => h.m.phase === 'PREP' && h.m.round >= 2);
  assert.equal(tickers(h, 'PERFECT_BATTLE').length, 0);
  assert.equal(seasonFeature('act2autochess', 'avatarBubbles'), false);
  assert.equal(seasonFeature('act3autochess', 'avatarBubbles'), true);
  h.m.dispose();
});

test('an eliminated player\'s line names it', { skip: !ACT3 }, () => {
  const h = makeMatch({ mode: 'coop', modeId: 'mode_multi_normal', humans: 3, seed: 7, data: ACT3, season: 'act3autochess', fake: true }).start();
  h.toPrep(1);
  const ps = h.ps('p_1');
  // p_1 at 1 LP, every field leaks one enemy: p_1 is out at the settle (test/match/feedback3-gift.test.js knockOut)
  ps.lp = 1;
  FakeBattle.script = (b) => ({ leaks: Object.fromEntries(b.players.map((id) => [id, 1])) });
  try { h.toPrep(2); } finally { FakeBattle.script = null; }
  assert.equal(ps.alive, false, 'the case under test ran');
  const out = tickers(h, 'PLAYER_OUT');
  assert.deepEqual(out.map((x) => x.playerId), ['p_1'], 'PLAYER_OUT names the player (规程\'s 탈락 bubble)');
  h.m.dispose();
});

test('the fields a bubble reads are checked', () => {
  assert.deepEqual(statusBubbleFields({ args: ['a', 'b', 3], chess: 'chess_x', step: 2, pct: 49.6, standInFor: 'char_1' }),
    { args: ['a', 'b', ''], chess: 'chess_x', standInFor: 'char_1', step: 2, pct: 50 });
  assert.deepEqual(statusBubbleFields({ step: 4, pct: 'x', chess: '', diy: { charId: 'char_2', skillIndex: 1 } }),
    { diy: { charId: 'char_2', skillIndex: 1, uniEquipId: null } });
  assert.deepEqual(statusBubbleFields(null), {});
});

test('the strip leaves the bubbles\' lines and departures out only where the bubbles show', () => {
  for (const type of ['PERFECT_BATTLE', 'GOLDEN_CHAR', 'SHOP_LEVEL', 'PLAYER_OUT', 'BOSS_HIT', 'PLAYER_LEFT']) {
    assert.equal(stripHides({ type }, true), true, type);
    assert.equal(stripHides({ type }, false), false, type);
  }
  assert.equal(stripHides({ type: 'CHAR_DAMAGE' }, true), false, 'lines no bubble draws stay');
  assert.equal(stripHides({ type: 'CUSTOM' }, true), false);
});

test('a player\'s bubbles queue 2.5 s each; a newer leader-damage step replaces a waiting one; another round\'s goes', () => {
  const at = 100000;
  const L = (id, type, pid, dt, extra = {}) => ({ id, type, playerId: pid, at: at + dt, round: 9, ...extra });
  const lines = [L(1, 'GOLDEN_CHAR', 'a', 0), L(2, 'SHOP_LEVEL', 'a', 100), L(3, 'PERFECT_BATTLE', 'b', 0), L(4, 'CUSTOM', 'a', 0)];
  let s = scheduleBubbles(lines, at + 50, 9);
  assert.equal(s.shown.get('a').kind, 'gold');
  assert.equal(s.shown.get('b').kind, 'perfect', 'each player has its own queue');
  assert.equal(s.pending, true, 'the shop level waits');
  s = scheduleBubbles(lines, at + BUBBLE_MS + 10, 9);
  assert.equal(s.shown.get('a').kind, 'shop', 'the next one follows the first');
  assert.equal(s.shown.get('a').start, at + BUBBLE_MS);
  assert.equal(s.shown.has('b'), false);
  s = scheduleBubbles(lines, at + 2 * BUBBLE_MS + 10, 9);
  assert.equal(s.shown.size, 0);
  assert.equal(s.pending, false);
  const hits = [L(5, 'PERFECT_BATTLE', 'c', 0), L(6, 'BOSS_HIT', 'c', 10, { step: 1 }), L(7, 'BOSS_HIT', 'c', 20, { step: 2 })];
  s = scheduleBubbles(hits, at + BUBBLE_MS + 10, 9);
  assert.equal(s.shown.get('c').step, 2, 'the waiting 20 % gave way to the 50 % that came before its turn');
  assert.equal(scheduleBubbles(hits, at + BUBBLE_MS + 10, 10).shown.size, 0, 'a finished round\'s leader-damage bubbles go');
  assert.equal(scheduleBubbles([L(8, 'SHOP_LEVEL', 'd', 0)], at + 60000, 9).shown.size, 0, 'old lines are history');
});
