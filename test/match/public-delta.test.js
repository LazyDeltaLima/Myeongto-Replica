// m.public broadcasts as deltas of their players[] rows (server/match/match/messaging.js _publicDelta; the client merges:
// shared/protocol.js mergePublicRows): after a match's first broadcast each row holds its playerId, the fields that
// changed since the previous broadcast and, in `$rm`, the fields it lost. The rows were most of m.public's bytes — an
// 8-player room sends every broadcast to eight browsers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergePublicRows } from '../../shared/protocol.js';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from './harness.js';

const bytes = (o) => Buffer.byteLength(JSON.stringify(o));

test('mergePublicRows: changed fields over the held row, $rm deletes, a whole frame passes as is', () => {
  const prev = { phase: 'PREP', players: [{ playerId: 'a', lp: 10, bonds: [{ bondId: 'x', count: 2 }], pendingLp: 3 }, { playerId: 'b', lp: 8, bonds: [] }] };
  const whole = { phase: 'COMBAT', players: [{ playerId: 'a', lp: 9, bonds: [] }] };
  assert.ok(mergePublicRows(prev, whole) === whole);
  const out = mergePublicRows(prev, { phase: 'SETTLE', delta: true, players: [{ playerId: 'a', lp: 9, $rm: ['pendingLp'] }, { playerId: 'b' }, { playerId: 'c', lp: 7 }] });
  assert.equal('delta' in out, false);
  assert.equal(out.phase, 'SETTLE');
  assert.deepEqual(out.players, [{ playerId: 'a', lp: 9, bonds: [{ bondId: 'x', count: 2 }] }, { playerId: 'b', lp: 8, bonds: [] }, { playerId: 'c', lp: 7 }]);
  assert.deepEqual(prev.players[0].pendingLp, 3, 'the held frame is not changed');
  assert.equal(mergePublicRows(prev, null), null);
});

/** A match whose whole views (before the delta) are recorded next to the frames sent. */
function recorded(o) {
  const h = makeMatch(o);
  const wholes = [];
  const orig = h.m._publicDelta;
  h.m._publicDelta = function (view) { wholes.push(view); return orig.call(this, view); };
  return { h, wholes };
}

test('an 8-player match: every merged broadcast equals the whole view, at a third of the bytes; the first and last are whole', () => {
  const seats = Array.from({ length: 8 }, (_, i) => ({ seat: i, playerId: `ai_${i}`, name: `AI${i}`, isBot: true, connected: true }));
  const { h, wholes } = recorded({ seats, size: 8, difficulty: 'NORMAL', seed: 3 });
  h.start();
  h.runToEnd();
  const merged = h.bc.filter((x) => x.t === 'm.public');
  assert.ok(wholes.length > 100, `${wholes.length} broadcasts`);
  assert.equal(merged.length, wholes.length);
  for (let i = 0; i < wholes.length; i++) assert.deepEqual(merged[i].players, wholes[i].players, `broadcast ${i}`);
  const wire = h.wirePublic.reduce((n, x) => n + bytes(x), 0);
  const full = wholes.reduce((n, x) => n + bytes(x), 0);
  assert.ok(wire < full * 0.4, `wire ${wire} B vs whole ${full} B`);
  assert.equal('delta' in h.wirePublic[0], false, 'the first broadcast is whole');
  assert.ok(h.wirePublic.slice(1, -1).every((x) => x.delta === true));
  assert.ok(h.wirePublic.some((x) => x.players.some((p) => Array.isArray(p.$rm))), 'a field going away travels as $rm');
  const last = h.wirePublic.at(-1);
  assert.equal(last.phase, PHASE.RESULT);
  assert.equal('delta' in last, false, 'the final broadcast (kept for the result replay) is whole');
  h.m.dispose();
});

test('a reconnect gets a whole m.public and the next broadcast is whole; then deltas again', () => {
  const { h } = recorded({ humans: 1, bots: 3, seed: 5 });
  h.start();
  const m = h.m;
  h.drive(() => m.phase === PHASE.PREP && m.round >= 3);
  assert.equal(m.phase, PHASE.PREP);
  m.onDisconnect('p_0');
  h.sent.length = 0;
  const before = h.wirePublic.length;
  m.onReconnect('p_0');
  const one = h.sent.find(([id, msg]) => id === 'p_0' && msg.t === 'm.public');
  assert.ok(one, 'the resync sends m.public to the player');
  assert.equal('delta' in one[1], false, 'whole');
  h.drive(() => h.wirePublic.length > before + 4);
  assert.equal('delta' in h.wirePublic[before], false, 'the broadcast after a resync is whole');
  assert.ok(h.wirePublic.slice(before + 1).some((x) => x.delta === true));
  m.dispose();
});

test('the browser merges m.public with the one it holds', () => {
  const src = readFileSync(new URL('../../public/js/main.js', import.meta.url), 'utf8');
  assert.match(src, /store\.patch\('match', \{ public: mergePublicRows\(store\.get\(\)\.match\.public, payload\(msg\)\) \}\)/);
});
