// A player who leaves a match mid-way: the left list's card wears the official quit mask (player_status_item
// connect_status/mask_quit — #303030 80 % + icon_lost_connect), not the eliminated one (mask_dead). Leaving eliminates the
// seat, so m.public sends alive false together with status 'left'; the card used to read alive first and drew mask_dead.
// docs/rules/ui.md 「정비 화면 HUD」 (왼쪽 플레이어 카드 상태). Real match path: test/match/harness.js → onLeave → the
// m.public the browser merges, in 规程 and 盟约.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../../server/data.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { makeMatch } from '../match/harness.js';
import { cardState } from '../../public/js/ui/teamPanel.js';

const quiet = { warn() {}, error() {}, info() {}, debug() {} };
const ACT3 = hasGeneratedData() ? getData({ log: quiet, season: 'act3autochess' }) : null;

test('a 规程 co-op player who leaves gets the quit mask, the others none', { skip: !ACT3 }, () => {
  const h = makeMatch({ mode: 'coop', modeId: 'mode_multi_normal', humans: 2, seed: 5, data: ACT3, season: 'act3autochess', fake: true }).start();
  h.runToPhase('PREP');
  h.m.onLeave('p_1');
  h.flushAll();
  const pub = h.lastBc('m.public');
  const gone = pub.players.find((p) => p.playerId === 'p_1');
  const stays = pub.players.find((p) => p.playerId === 'p_0');
  assert.equal(gone.alive, false, 'leaving eliminates the seat (the case the card has to read right)');
  assert.equal(gone.status, 'left');
  assert.equal(cardState(gone).mask, 'quit', 'a player who left wears mask_quit, not mask_dead (docs/rules/ui.md 「정비 화면 HUD」)');
  assert.equal(cardState(stays).mask, null);
});

test('a 盟约 co-op player who leaves gets the quit mask too (the card reads no season)', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 5, fake: true }).start();
  h.runToPhase('PREP');
  h.m.onLeave('p_1');
  h.flushAll();
  const gone = h.lastBc('m.public').players.find((p) => p.playerId === 'p_1');
  assert.equal(gone.alive, false);
  assert.equal(gone.status, 'left');
  assert.equal(cardState(gone).mask, 'quit', 'a player who left wears mask_quit, not mask_dead (docs/rules/ui.md 「정비 화면 HUD」)');
});

test('an eliminated player still gets the dead mask', () => {
  assert.equal(cardState({ alive: false, status: 'dead' }).mask, 'dead');
  assert.equal(cardState({ alive: false }).mask, 'dead');
});
