// The briefing's 重新抽取 vote (feat, maintainer decisions 2026-10-09 and 2026-10-12; server/match/match/phases.js
// maybeEndInfo; separate votes since 2026-10-13): every human seat may press 准备就绪 (final) and, apart from it, vote
// 重新抽取 (can be taken back); a unanimous reroll ends the match with reason 'reroll' (the lobby starts a new one), every
// seat ready — or the co-op 45 s guard (INFO_CHECK_SECONDS) — starts the strategy draft. AI seats, departed seats and
// seats under AI 托管 do not vote. m.public.rerollBy names the first seat still voting reroll. No m.result.
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

test('ready and reroll are separate votes (maintainer 2026-10-13); ready is final, a reroll vote can be taken back', () => {
  const h = makeMatch({ mode: 'coop', humans: 3, seed: 4 }).start();
  const m = h.m;
  arm(h);
  assert.deepEqual(m.handle('p_0', { t: 'g.infoReady' }), { ok: true });
  assert.deepEqual(m.handle('p_0', { t: 'g.infoReroll' }), { ok: true }, 'a ready seat may still vote reroll');
  assert.deepEqual(m.handle('p_1', { t: 'g.infoReroll' }), { ok: true });
  assert.deepEqual(m.handle('p_1', { t: 'g.infoReroll' }), { ok: true }, 'a repeat is harmless');
  let pub = m.publicView().players;
  assert.equal(pub.find((p) => p.playerId === 'p_0').ready, true);
  assert.equal(pub.find((p) => p.playerId === 'p_0').reroll, true);
  assert.equal(pub.find((p) => p.playerId === 'p_1').reroll, true);
  assert.equal(pub.find((p) => p.playerId === 'p_1').ready, false);
  assert.equal(pub.find((p) => p.playerId === 'p_1').status, 'deciding', 'a reroll vote is not ready');
  assert.deepEqual(m.handle('p_1', { t: 'g.infoReady' }), { ok: true }, 'and ready may follow it');
  assert.deepEqual(m.handle('p_0', { t: 'g.infoReroll', cancel: true }), { ok: true }, 'a ready seat takes its reroll vote back');
  pub = m.publicView().players;
  assert.equal(pub.find((p) => p.playerId === 'p_0').reroll, undefined);
  assert.equal(pub.find((p) => p.playerId === 'p_0').ready, true, 'ready stays');
  assert.equal(pub.find((p) => p.playerId === 'p_2').status, 'deciding');
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.INFO_CHECK, 'p_2 is not ready yet');
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

test('co-op (maintainer 2026-10-13): everyone ready starts the draft, only a unanimous reroll redraws; AI seats do not vote', () => {
  // every seat ready, two of them also voting reroll → the draft
  let h = makeMatch({ mode: 'coop', humans: 3, seed: 5 }).start();
  arm(h);
  h.m.handle('p_0', { t: 'g.infoReroll' });
  h.m.handle('p_2', { t: 'g.infoReroll' });
  for (const id of ['p_0', 'p_1', 'p_2']) h.m.handle(id, { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(h.m.phase, PHASE.BAND_DRAFT);
  assert.equal(h.ended, null, '2 of 3 is no reroll');
  assert.equal(h.m.publicView().players[0].reroll, undefined, 'the vote is not shown past the briefing');
  h.m.dispose();

  // 2 of 3 reroll and nobody else ready → still waiting
  h = makeMatch({ mode: 'coop', humans: 3, seed: 5 }).start();
  arm(h);
  h.m.handle('p_0', { t: 'g.infoReroll' });
  h.m.handle('p_1', { t: 'g.infoReroll' });
  h.sched.advance(1);
  assert.equal(h.m.phase, PHASE.INFO_CHECK);
  assert.equal(h.ended, null);
  // the third reroll vote makes it unanimous → reroll at once, ready or not
  h.m.handle('p_2', { t: 'g.infoReady' });
  h.m.handle('p_2', { t: 'g.infoReroll' });
  h.sched.advance(1);
  assert.equal(h.ended?.reason, 'reroll');
  h.m.dispose();

  // two humans with two AI teammates (not counted): both reroll → reroll
  h = makeMatch({ mode: 'coop', humans: 2, bots: 2, seed: 6 }).start();
  arm(h);
  h.m.handle('p_0', { t: 'g.infoReroll' });
  h.sched.advance(1);
  assert.equal(h.ended, null, 'waits for the other human');
  h.m.handle('p_1', { t: 'g.infoReroll' });
  h.sched.advance(1);
  assert.equal(h.ended?.reason, 'reroll');
  assert.equal(lastPublic(h).infoOutcome, 'reroll');
  h.m.dispose();

  // a seat under AI 托管 does not vote: the other human's reroll is unanimous
  h = makeMatch({ mode: 'coop', humans: 2, seed: 6 }).start();
  arm(h);
  h.m.handle('p_1', { t: 'g.autoplay', on: true });
  h.m.handle('p_0', { t: 'g.infoReroll' });
  h.sched.advance(1);
  assert.equal(h.ended?.reason, 'reroll');
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

  // 1 reroll, 1 silent seat at the deadline → not unanimous → the draft
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
