// The briefing's 重新抽取 vote (feat, maintainer decisions 2026-10-09 and 2026-10-12; server/match/match/phases.js
// maybeEndInfo): every human seat votes 准备就绪 (final) or 重新抽取 (can be taken back), one or the other; more reroll
// votes than ready ones end the match with reason 'reroll' (the lobby starts a new one), anything else — a tie included —
// starts the strategy draft. AI seats and departed seats do not vote; the co-op 45 s guard (INFO_CHECK_SECONDS) counts a
// seat that has not voted as ready. m.public.rerollBy names the first seat still voting reroll. No m.result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { PHASE, ERR } from '../../shared/constants.js';
import { INFO_REROLL_MIN_MS } from '../../server/match/match/phases.js';
import { INFO_CHECK_SECONDS } from '../../server/match/match/common.js';

const arm = (h) => h.sched.advance(INFO_REROLL_MIN_MS);
const results = (h) => [...h.sent.map(([, m]) => m), ...h.bc].filter((m) => m.t === 'm.result');
const lastPublic = (h) => [...h.bc].reverse().find((m) => m.t === 'm.public');

test('solo: 重新抽取 ends the match at once with reason reroll — no m.result, the last m.public says so', () => {
  const h = makeMatch({ mode: 'solo', seed: 3 }).start();
  const m = h.m;
  assert.equal(m.phase, PHASE.INFO_CHECK);
  assert.deepEqual(m.handle('p_0', { t: 'g.infoReroll' }).error, ERR.RATE, 'refused in the briefing\'s first second');
  arm(h);
  assert.deepEqual(m.handle('p_0', { t: 'g.infoReroll' }), { ok: true });
  assert.equal(lastPublic(h).players[0].reroll, true);
  h.sched.advance(1);
  assert.equal(h.endedCount, 1);
  assert.equal(h.ended.reason, 'reroll');
  assert.equal(h.ended.stageId, m.stageId);
  assert.equal(results(h).length, 0, 'nothing was played: no settlement');
  assert.equal(lastPublic(h).infoOutcome, 'reroll');
  assert.equal(m.phase, PHASE.INFO_CHECK);
  assert.equal(m.handle('p_0', { t: 'g.infoReady' }).error, ERR.WRONG_PHASE);
  m.dispose();
});

test('ready and reroll exclude each other; ready is final, a reroll vote can be taken back', () => {
  const h = makeMatch({ mode: 'coop', humans: 3, seed: 4 }).start();
  const m = h.m;
  arm(h);
  assert.deepEqual(m.handle('p_0', { t: 'g.infoReady' }), { ok: true });
  assert.equal(m.handle('p_0', { t: 'g.infoReroll' }).error, ERR.ALREADY);
  assert.deepEqual(m.handle('p_1', { t: 'g.infoReroll' }), { ok: true });
  assert.equal(m.handle('p_1', { t: 'g.infoReady' }).error, ERR.ALREADY);
  assert.deepEqual(m.handle('p_1', { t: 'g.infoReroll' }), { ok: true }, 'a repeat is harmless');
  const pub = m.publicView().players;
  assert.equal(pub.find((p) => p.playerId === 'p_0').ready, true);
  assert.equal(pub.find((p) => p.playerId === 'p_1').reroll, true);
  assert.equal(pub.find((p) => p.playerId === 'p_1').ready, false);
  assert.equal(pub.find((p) => p.playerId === 'p_1').status, 'ready', 'a voter has decided');
  assert.equal(pub.find((p) => p.playerId === 'p_2').status, 'deciding');
  assert.deepEqual(m.handle('p_0', { t: 'g.infoReroll', cancel: true }).error, ERR.ALREADY, 'ready cannot be taken back');
  assert.deepEqual(m.handle('p_1', { t: 'g.infoReroll', cancel: true }), { ok: true });
  const p1 = m.publicView().players.find((p) => p.playerId === 'p_1');
  assert.equal(p1.reroll, undefined);
  assert.equal(p1.status, 'deciding', 'back to undecided');
  assert.deepEqual(m.handle('p_1', { t: 'g.infoReady' }), { ok: true }, 'and may vote ready now');
  m.dispose();
});

test('m.public.rerollBy: the first seat still voting reroll', () => {
  const h = makeMatch({ mode: 'coop', humans: 4, seed: 4 }).start();
  const m = h.m;
  arm(h);
  assert.equal(m.publicView().rerollBy, undefined);
  m.handle('p_2', { t: 'g.infoReroll' });
  m.handle('p_0', { t: 'g.infoReroll' });
  assert.equal(m.publicView().rerollBy, 'p_2');
  m.handle('p_2', { t: 'g.infoReroll', cancel: true });
  assert.equal(m.publicView().rerollBy, 'p_0', 'the proposer withdrew: the next voter in order');
  m.handle('p_2', { t: 'g.infoReroll' });
  assert.equal(m.publicView().rerollBy, 'p_0', 'a renewed vote goes to the end');
  m.handle('p_0', { t: 'g.infoReroll', cancel: true });
  m.handle('p_2', { t: 'g.infoReroll', cancel: true });
  assert.equal(m.publicView().rerollBy, undefined);
  m.dispose();
});

test('co-op: more ready votes start the draft, more reroll votes reroll, a tie starts the draft; AI seats do not vote', () => {
  // 2 ready vs 1 reroll → the draft
  let h = makeMatch({ mode: 'coop', humans: 3, seed: 5 }).start();
  arm(h);
  h.m.handle('p_0', { t: 'g.infoReroll' });
  h.m.handle('p_1', { t: 'g.infoReady' });
  h.m.handle('p_2', { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(h.m.phase, PHASE.BAND_DRAFT);
  assert.equal(h.ended, null);
  assert.equal(h.m.publicView().players[0].reroll, undefined, 'the vote is not shown past the briefing');
  h.m.dispose();

  // 2 reroll vs 1 ready → reroll (maintainer 2026-10-09: the majority, not only a unanimous vote)
  h = makeMatch({ mode: 'coop', humans: 3, seed: 5 }).start();
  arm(h);
  h.m.handle('p_0', { t: 'g.infoReroll' });
  h.m.handle('p_1', { t: 'g.infoReady' });
  h.m.handle('p_2', { t: 'g.infoReroll' });
  h.sched.advance(1);
  assert.equal(h.ended?.reason, 'reroll');
  h.m.dispose();

  // 1 vs 1 with two AI teammates (ready at once, not counted) → a tie → the draft (maintainer 2026-10-12)
  h = makeMatch({ mode: 'coop', humans: 2, bots: 2, seed: 6 }).start();
  arm(h);
  h.m.handle('p_0', { t: 'g.infoReroll' });
  h.sched.advance(1);
  assert.equal(h.ended, null, 'waits for the other human');
  h.m.handle('p_1', { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(h.ended, null);
  assert.equal(h.m.phase, PHASE.BAND_DRAFT);
  assert.equal(lastPublic(h).infoOutcome, undefined);
  h.m.dispose();
});

test('one human with AI teammates decides alone; the 45 s guard counts a seat that has not voted as ready', () => {
  let h = makeMatch({ mode: 'coop', humans: 1, bots: 2, seed: 7 }).start();
  assert.equal(h.m.deadline, 0, 'untimed (a single human)');
  arm(h);
  h.m.handle('p_0', { t: 'g.infoReroll' });
  h.sched.advance(1);
  assert.equal(h.ended?.reason, 'reroll');
  h.m.dispose();

  // 1 reroll vs 1 silent seat at the deadline → a tie → the draft
  h = makeMatch({ mode: 'coop', humans: 2, seed: 8 }).start();
  assert.equal(h.m.deadline - h.sched.now(), INFO_CHECK_SECONDS * 1000, 'the co-op briefing runs 45 s');
  arm(h);
  h.m.handle('p_0', { t: 'g.infoReroll' });
  h.sched.advance(INFO_CHECK_SECONDS * 1000 - INFO_REROLL_MIN_MS - 100);
  assert.equal(h.m.phase, PHASE.INFO_CHECK, 'still open just before 45 s');
  h.sched.advance(200);
  assert.equal(h.ended, null);
  assert.equal(h.m.phase, PHASE.BAND_DRAFT);
  h.m.dispose();

  // nobody votes → the draft, as before
  h = makeMatch({ mode: 'coop', humans: 2, seed: 8 }).start();
  h.sched.advance(INFO_CHECK_SECONDS * 1000 + 10);
  assert.equal(h.m.phase, PHASE.BAND_DRAFT);
  h.m.dispose();
});

test('a voter who leaves is no longer counted', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 9 }).start();
  arm(h);
  h.m.handle('p_0', { t: 'g.infoReroll' });
  h.m.onLeave('p_1');
  h.sched.advance(1);
  assert.equal(h.ended?.reason, 'reroll');
  h.m.dispose();
});
