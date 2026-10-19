// m.public players[].bonds only when changed (server/match/match/messaging.js _publicDelta; the client fills the rest:
// shared/protocol.js mergePublicBonds): a broadcast row without `bonds` keeps the previous ones. They were most of
// m.public's bytes — an 8-player room sends every broadcast to eight browsers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePublicBonds } from '../../shared/protocol.js';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from './harness.js';

const bytes = (o) => Buffer.byteLength(JSON.stringify(o));

test('mergePublicBonds: a row without bonds keeps the previous ones, an unknown player gets [], a whole frame passes as is', () => {
  const prev = { players: [{ playerId: 'a', bonds: [{ bondId: 'x', count: 2 }] }, { playerId: 'b', bonds: [] }] };
  const whole = { players: [{ playerId: 'a', bonds: [] }] };
  assert.ok(mergePublicBonds(prev, whole) === whole);
  const next = { phase: 'PREP', players: [{ playerId: 'a', lp: 9 }, { playerId: 'b', bonds: [{ bondId: 'y', count: 1 }] }, { playerId: 'c' }] };
  const out = mergePublicBonds(prev, next);
  assert.deepEqual(out.players, [{ playerId: 'a', lp: 9, bonds: [{ bondId: 'x', count: 2 }] }, { playerId: 'b', bonds: [{ bondId: 'y', count: 1 }] }, { playerId: 'c', bonds: [] }]);
  assert.equal(out.phase, 'PREP');
  assert.deepEqual(mergePublicBonds(null, { players: [{ playerId: 'a' }] }).players, [{ playerId: 'a', bonds: [] }]);
  assert.equal(mergePublicBonds(prev, null), null);
});

test('an 8-player match: the merged broadcasts equal the whole views, at well under half the bytes; the last one is whole', () => {
  const seats = Array.from({ length: 8 }, (_, i) => ({ seat: i, playerId: `ai_${i}`, name: `AI${i}`, isBot: true, connected: true }));
  const h = makeMatch({ seats, size: 8, difficulty: 'NORMAL', seed: 3 });
  const m = h.m;
  const wholes = [];
  const orig = m._publicDelta;
  m._publicDelta = function (view) { wholes.push(view); return orig.call(this, view); };
  h.start();
  h.runToEnd();
  const merged = h.bc.filter((x) => x.t === 'm.public');
  assert.ok(wholes.length > 100, `${wholes.length} broadcasts`);
  assert.equal(merged.length, wholes.length);
  assert.equal(h.wirePublic.length, wholes.length);
  for (let i = 0; i < wholes.length; i++) {
    assert.deepEqual(merged[i].players.map((p) => p.bonds), wholes[i].players.map((p) => p.bonds), `broadcast ${i}`);
  }
  const wire = h.wirePublic.reduce((n, x) => n + bytes(x), 0);
  const full = wholes.reduce((n, x) => n + bytes(x), 0);
  assert.ok(wire < full * 0.55, `wire ${wire} B vs whole ${full} B`);
  assert.ok(h.wirePublic[0].players.every((p) => 'bonds' in p), 'the first broadcast carries every row');
  assert.ok(h.wirePublic.some((x) => x.players.some((p) => !('bonds' in p))), 'later ones leave the unchanged rows out');
  const last = h.wirePublic.at(-1);
  assert.equal(last.phase, PHASE.RESULT);
  assert.ok(last.players.every((p) => 'bonds' in p), 'the final broadcast (kept for the result replay) is whole');
  m.dispose();
});

test('a reconnect gets a whole m.public; the next broadcast leaves the unchanged rows out again', () => {
  const h = makeMatch({ humans: 1, bots: 3, seed: 5 }).start();
  const m = h.m;
  h.autoHumans();
  h.run(() => m.phase === PHASE.PREP && m.round >= 3);
  m.onDisconnect('p_0');
  h.sent.length = 0;
  m.onReconnect('p_0');
  const one = h.sent.find(([id, msg]) => id === 'p_0' && msg.t === 'm.public');
  assert.ok(one, 'the resync sends m.public to the player');
  assert.ok(one[1].players.every((p) => Array.isArray(p.bonds)), 'whole');
  const before = h.wirePublic.length;
  h.run(() => h.wirePublic.length > before + 2);
  assert.ok(h.wirePublic.slice(before).some((x) => x.players.some((p) => !('bonds' in p))));
  m.dispose();
});

test('the browser merges m.public with the previous one', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../public/js/main.js', import.meta.url), 'utf8');
  assert.match(src, /store\.patch\('match', \{ public: mergePublicBonds\(store\.get\(\)\.match\.public, payload\(msg\)\) \}\)/);
});
