// test/match/custom-band-dup.test.js — the custom 「允许重复选择策略」 (flow.bandDup; shared/ruleset.js, server/match/match/
// phases.js bandTaken / bandDup, public/js/screens/bandDraft.js): teammates may pick the same strategy — a pick, a turn
// that runs out (the default 华法琳 while a teammate holds it) and the AI seats — on the real match path. Off (the
// official 队友已选) the draft is as before; solo has no teammates, so the setting does nothing there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERR, PHASE } from '../../shared/constants.js';
import { sanitizeCustom, customDiffs, CUSTOM_OFFICIAL } from '../../shared/ruleset.js';
import { customSummary } from '../../public/js/ui/customSummary.js';
import { BAND_TURN_SECONDS } from '../../server/match/Match.js';
import { makeMatch, checkInvariants } from './harness.js';

const DUP = { preset: 'custom', custom: { flow: { bandDup: true } } };

test('settings: bandDup is off by default, kept when true, a difference and a summary line (co-op only)', () => {
  assert.equal(CUSTOM_OFFICIAL.flow.bandDup, false);
  assert.equal(sanitizeCustom({}).flow.bandDup, false);
  assert.equal(sanitizeCustom({ flow: { bandDup: 'yes' } }).flow.bandDup, false, 'only a boolean');
  assert.equal(sanitizeCustom({ flow: { bandDup: true } }).flow.bandDup, true);
  assert.deepEqual(customDiffs({ flow: { bandDup: true } }), ['flow.bandDup']);
  assert.deepEqual(customDiffs({}), []);
  const keys = (/** @type {{ key: string }[]} */ list) => list.map((x) => x.key);
  assert.deepEqual(keys(customSummary({ flow: { bandDup: true } })), ['flow.bandDup']);
  assert.deepEqual(keys(customSummary({ flow: { bandDup: true } }, { solo: true })), [], 'solo: nothing to show');
});

test('real match: with bandDup a teammate\'s strategy can be picked again, the timeout gives 华法琳 even when taken', () => {
  const h = makeMatch({ mode: 'coop', humans: 3, seed: 5, ruleset: DUP }).start();
  const m = h.m;
  assert.equal(m.bandDup, true);
  for (const id of ['p_0', 'p_1', 'p_2']) m.handle(id, { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  const [first, second, third] = m.draft.order;
  assert.deepEqual(m.handle(first, { t: 'g.band', bandId: 'band_bldsk' }), { ok: true });
  assert.deepEqual(m.handle(second, { t: 'g.band', bandId: 'band_bldsk' }), { ok: true }, 'the same strategy again');
  assert.equal(h.ps(second).bandId, 'band_bldsk');
  assert.equal(h.ps(second).lp, h.ps(first).lp, 'its starting LP');
  // the third lets its turn run out without a highlight: the official default although both teammates hold it
  h.sched.advance(BAND_TURN_SECONDS * 1000 + 1);
  assert.equal(h.ps(third).bandId, 'band_bldsk');
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.DIY_CHOOSE, 'the draft ended with the last pick');
  checkInvariants(m);
  m.dispose();

  // off (the official 队友已选): the same draft refuses the second pick
  const off = makeMatch({ mode: 'coop', humans: 3, seed: 5 }).start();
  for (const id of ['p_0', 'p_1', 'p_2']) off.m.handle(id, { t: 'g.infoReady' });
  off.sched.advance(1);
  const [a, b] = off.m.draft.order;
  assert.equal(off.m.bandDup, false);
  off.m.handle(a, { t: 'g.band', bandId: 'band_bldsk' });
  assert.equal(off.m.handle(b, { t: 'g.band', bandId: 'band_bldsk' }).error, ERR.BAD_TARGET);
  off.m.dispose();
});

test('real match: AI seats under bandDup finish the draft and the match runs on; solo ignores the setting', () => {
  for (const seed of [1, 2, 3, 4]) {
    const h = makeMatch({ mode: 'coop', humans: 1, bots: 3, seed, ruleset: DUP }).start();
    const m = h.m;
    m.handle('p_0', { t: 'g.infoReady' });
    h.run(() => m.phase === PHASE.BAND_DRAFT, { maxTime: 1000 });
    h.run(() => m.draftTurn() === 'p_0' || m.phase !== PHASE.BAND_DRAFT, { maxTime: 1000 });
    if (m.phase === PHASE.BAND_DRAFT) {
      const held = Object.values(m.draft.picks)[0] || 'band_bldsk';
      assert.deepEqual(m.handle('p_0', { t: 'g.band', bandId: held }), { ok: true }, `seed ${seed}: a held strategy`);
    }
    h.run(() => m.phase !== PHASE.BAND_DRAFT, { maxTime: 1000 });
    for (const ps of m.order) assert.ok(ps.bandId && m.gd.bandAllowed(ps.bandId), `seed ${seed}: ${ps.playerId} has a strategy`);
    checkInvariants(m);
    m.dispose();
  }
  const solo = makeMatch({ mode: 'solo', seed: 3, ruleset: DUP }).start();
  assert.equal(solo.m.bandDup, false);
  solo.m.dispose();
});
