// The in-match 重新开始 vote (feat, maintainer decisions 2026-10-31; server/match/match/restart.js): from the first round
// on — never in the briefing (its 重新抽取) or the strategy draft — a seat proposes, every human still in and not under AI
// 托管 must agree (the eliminated ones too) within RESTART_VOTE_MS; one 反对, the proposer leaving or the time running out
// ends the vote, and the proposer waits RESTART_RETRY_MS. A passed vote ends the match with reason 'restart' and no
// m.result (the lobby starts a new one). Any 规则 mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { PHASE, ERR } from '../../shared/constants.js';
import { RESTART_VOTE_MS, RESTART_RETRY_MS } from '../../server/match/match/restart.js';

const results = (h) => [...h.sent.map(([, m]) => m), ...h.bc].filter((m) => m.t === 'm.result');
const lastPublic = (h) => [...h.bc].reverse().find((m) => m.t === 'm.public');
const toasts = (h, id) => h.allTo(id, 'm.toast');
const restart = (m, id, op) => m.handle(id, { t: 'g.restart', op });

test('refused in the briefing and the strategy draft, open from the first round', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 5 }).start();
  const m = h.m;
  assert.equal(m.phase, PHASE.INFO_CHECK);
  assert.equal(restart(m, 'p_0', 'propose').error, ERR.WRONG_PHASE);
  h.drive(() => m.phase === PHASE.BAND_DRAFT);
  assert.equal(restart(m, 'p_0', 'propose').error, ERR.WRONG_PHASE);
  h.toPrep(1);
  assert.equal(restart(m, 'p_0', 'yes').error, ERR.WRONG_PHASE, 'nothing to answer yet');
  assert.deepEqual(restart(m, 'p_0', 'propose'), { ok: true });
  assert.equal(restart(m, 'p_1', 'propose').error, ERR.WRONG_PHASE, 'one vote at a time');
  m.flush(true);
  const v = lastPublic(h).restartVote;
  assert.equal(v.by, 'p_0');
  assert.deepEqual(v.yes, ['p_0'], 'the proposer agrees');
  assert.ok(v.deadline > 0);
  m.dispose();
});

test('solo: a proposal ends the match at once — reason restart, no m.result, the last m.public says so', () => {
  const h = makeMatch({ mode: 'solo', seed: 6 }).start();
  const m = h.m;
  h.toPrep(1);
  assert.deepEqual(restart(m, 'p_0', 'propose'), { ok: true });
  h.sched.advance(1);
  assert.equal(h.endedCount, 1);
  assert.equal(h.ended.reason, 'restart');
  assert.equal(h.ended.round, 1);
  assert.equal(results(h).length, 0, 'no settlement');
  assert.equal(lastPublic(h).restarted, true);
  assert.equal(restart(m, 'p_0', 'propose').error, ERR.WRONG_PHASE);
  m.dispose();
});

test('co-op: every voter agreeing ends the match; the AI seats have no say; the classic ruleset too', () => {
  const h = makeMatch({ mode: 'coop', humans: 3, bots: 1, ruleset: 'classic', seed: 7 }).start();
  const m = h.m;
  h.toPrep(1);
  assert.deepEqual(restart(m, 'p_1', 'propose'), { ok: true });
  assert.deepEqual(restart(m, 'p_0', 'yes'), { ok: true });
  h.sched.advance(1);
  assert.equal(h.endedCount, 0, 'p_2 has not answered');
  assert.deepEqual(restart(m, 'p_2', 'yes'), { ok: true });
  h.sched.advance(1);
  assert.equal(h.ended?.reason, 'restart');
  assert.equal(results(h).length, 0);
  m.dispose();
});

test('one 反对 ends the vote: everyone hears it, the proposer waits RESTART_RETRY_MS', () => {
  const h = makeMatch({ mode: 'coop', humans: 3, seed: 8 }).start();
  const m = h.m;
  h.toPrep(1);
  assert.deepEqual(restart(m, 'p_0', 'propose'), { ok: true });
  assert.deepEqual(restart(m, 'p_1', 'yes'), { ok: true });
  assert.deepEqual(restart(m, 'p_2', 'no'), { ok: true });
  m.flush(true);
  assert.equal(lastPublic(h).restartVote, undefined);
  for (const id of ['p_0', 'p_1', 'p_2']) {
    const t = toasts(h, id).at(-1);
    assert.equal(t.msgid, '{name}反对重新开始', id);
    assert.equal(t.params.name, 'P2');
  }
  assert.equal(restart(m, 'p_0', 'propose').error, ERR.RATE, 'the proposer waits');
  assert.deepEqual(restart(m, 'p_1', 'propose'), { ok: true }, 'another seat may propose');
  assert.deepEqual(restart(m, 'p_1', 'cancel'), { ok: true });
  assert.equal(toasts(h, 'p_2').at(-1).msgid, '{name}撤回了重新开始的提议');
  h.sched.advance(RESTART_RETRY_MS);
  assert.equal(h.endedCount, 0);
  assert.deepEqual(restart(m, 'p_0', 'propose'), { ok: true }, `free again (${m.phase} R${m.round})`);
  m.dispose();
});

test('only the proposer cancels; the vote runs out after RESTART_VOTE_MS', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 9 }).start();
  const m = h.m;
  h.toPrep(1);
  assert.deepEqual(restart(m, 'p_0', 'propose'), { ok: true });
  assert.equal(restart(m, 'p_1', 'cancel').error, ERR.BAD_TARGET);
  h.sched.advance(RESTART_VOTE_MS + 1);
  assert.equal(m.restartVote, null);
  assert.equal(toasts(h, 'p_1').at(-1).msgid, '重新开始投票未通过');
  assert.equal(h.endedCount, 0);
  m.dispose();
});

test('the eliminated vote too; a seat under AI 托管 does not, and its going over can pass the vote', () => {
  const h = makeMatch({ mode: 'coop', humans: 3, seed: 10 }).start();
  const m = h.m;
  h.toPrep(1);
  h.ps('p_2').alive = false;
  assert.deepEqual(restart(m, 'p_0', 'propose'), { ok: true });
  assert.deepEqual(restart(m, 'p_1', 'yes'), { ok: true });
  h.sched.advance(1);
  assert.equal(h.endedCount, 0, 'the eliminated p_2 still has a say');
  assert.deepEqual(m.handle('p_2', { t: 'g.autoplay', on: true }), { ok: true });
  h.sched.advance(1);
  assert.equal(h.ended?.reason, 'restart', 'the voters left all agree');
  m.dispose();
});

test('the proposer leaving ends the vote', () => {
  const h = makeMatch({ mode: 'coop', humans: 3, seed: 11 }).start();
  const m = h.m;
  h.toPrep(1);
  assert.deepEqual(restart(m, 'p_0', 'propose'), { ok: true });
  m.onLeave('p_0');
  assert.equal(m.restartVote, null);
  assert.equal(toasts(h, 'p_1').at(-1).msgid, '重新开始投票未通过');
  assert.deepEqual(restart(m, 'p_1', 'yes').error, ERR.WRONG_PHASE);
  m.dispose();
});

test('solo room destination ends immediately without settlement; a rejected room vote shares the restart cooldown', () => {
  const solo = makeMatch({ mode: 'solo', seed: 6 }).start();
  solo.toPrep(1);
  assert.deepEqual(solo.m.handle('p_0', { t: 'g.restart', op: 'propose', target: 'room' }), { ok: true });
  solo.sched.advance(1);
  assert.equal(solo.ended.target, 'room');
  assert.equal(lastPublic(solo).restartTarget, 'room');
  assert.equal(results(solo).length, 0);
  solo.m.dispose();

  const coop = makeMatch({ mode: 'coop', humans: 2, seed: 8 }).start();
  coop.toPrep(1);
  assert.deepEqual(coop.m.handle('p_0', { t: 'g.restart', op: 'propose', target: 'room' }), { ok: true });
  assert.deepEqual(restart(coop.m, 'p_1', 'no'), { ok: true });
  assert.equal(coop.endedCount, 0);
  assert.equal(toasts(coop, 'p_0').at(-1).msgid, '{name}反对返回等待室');
  assert.equal(restart(coop.m, 'p_0', 'propose').error, ERR.RATE);
  coop.m.dispose();
});
