// m.public broadcasts as deltas (server/match/match/messaging.js _publicDelta; the client merges: shared/protocol.js
// mergePublic): after a match's first broadcast a frame holds the top-level fields that changed since the previous one
// (t, serverNow, players always) and `$rm` for those that went away, and each players[] row its playerId, its changed
// fields and its own `$rm`. Most of a broadcast repeated the previous one — an 8-player room sends each to eight browsers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergePublic, PUBLIC_LIST_KEYS } from '../../shared/protocol.js';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from './harness.js';

const bytes = (o) => Buffer.byteLength(JSON.stringify(o));

test('mergePublic: changed fields over the held frame and rows, $rm deletes at both levels, a whole frame passes as is', () => {
  const prev = { phase: 'PREP', players: [{ playerId: 'a', lp: 10, bonds: [{ bondId: 'x', count: 2 }], pendingLp: 3 }, { playerId: 'b', lp: 8, bonds: [] }] };
  const whole = { phase: 'COMBAT', players: [{ playerId: 'a', lp: 9, bonds: [] }] };
  assert.ok(mergePublic(prev, whole) === whole);
  const prevTop = { ...prev, round: 3, draft: { order: ['a', 'b'] } };
  const out = mergePublic(prevTop, { t: 'm.public', serverNow: 5, phase: 'SETTLE', delta: true, $rm: ['draft'],
    players: [{ playerId: 'a', lp: 9, $rm: ['pendingLp'] }, { playerId: 'b' }, { playerId: 'c', lp: 7 }] });
  assert.equal('delta' in out, false);
  assert.equal('$rm' in out, false);
  assert.equal('draft' in out, false, 'a top-level field that went away');
  assert.deepEqual([out.phase, out.round, out.serverNow, out.t], ['SETTLE', 3, 5, 'm.public'], 'changed, kept, always sent');
  assert.deepEqual(out.players, [{ playerId: 'a', lp: 9, bonds: [{ bondId: 'x', count: 2 }] }, { playerId: 'b', lp: 8, bonds: [] }, { playerId: 'c', lp: 7 }]);
  assert.deepEqual(prev.players[0].pendingLp, 3, 'the held frame is not changed');
  assert.equal(mergePublic(prev, null), null);
  assert.ok('draft' in prevTop, 'the held frame is not changed');
});

test('mergePublic: a field sent as its own delta — a list by key ($list), an object by its changed fields ($d)', () => {
  const card = (idx, o = {}) => ({ idx, kind: 'item', id: `c${idx}`, soldOut: false, ...o });
  const prev = {
    phase: 'SP_DRAFT', sp: { family: 'f', cards: [card(0), card(1), card(2)], picks: {}, turn: 'a' },
    players: [{ playerId: 'a', bonds: [{ bondId: 'x', count: 2 }, { bondId: 'y', count: 1 }] }],
  };
  const out = mergePublic(prev, { t: 'm.public', delta: true, sp: { $d: 1, cards: { $list: [0, card(1, { soldOut: true }), 2] }, picks: { a: 1 }, $rm: ['turn'] },
    players: [{ playerId: 'a', bonds: { $list: ['y', { bondId: 'x', count: 3 }, { bondId: 'z', count: 1 }] } }] });
  assert.deepEqual(out.sp, { family: 'f', cards: [card(0), card(1, { soldOut: true }), card(2)], picks: { a: 1 } });
  assert.ok(out.sp.cards[0] === prev.sp.cards[0], 'an entry named by its key is the one held');
  assert.deepEqual(out.players[0].bonds, [{ bondId: 'y', count: 1 }, { bondId: 'x', count: 3 }, { bondId: 'z', count: 1 }], 'reordered, changed, added; the rest dropped');
  assert.deepEqual(prev.sp.turn, 'a', 'the held frame is not changed');
  assert.deepEqual(Object.keys(PUBLIC_LIST_KEYS).sort(), ['bonds', 'cards', 'fields']);
});

/** A match whose whole views (before the delta) are recorded next to the frames sent. */
function recorded(o) {
  const h = makeMatch(o);
  const wholes = [];
  const orig = h.m._publicDelta;
  h.m._publicDelta = function (view) { wholes.push(view); return orig.call(this, view); };
  return { h, wholes };
}

test('an 8-player match: every merged broadcast equals the whole view, at about a tenth of the bytes; the first and last are whole', () => {
  const seats = Array.from({ length: 8 }, (_, i) => ({ seat: i, playerId: `ai_${i}`, name: `AI${i}`, isBot: true, connected: true }));
  const { h, wholes } = recorded({ seats, size: 8, difficulty: 'NORMAL', seed: 3 });
  h.start();
  h.runToEnd();
  const merged = h.bc.filter((x) => x.t === 'm.public');
  assert.ok(wholes.length > 100, `${wholes.length} broadcasts`);
  assert.equal(merged.length, wholes.length);
  for (let i = 0; i < wholes.length; i++) assert.deepEqual(merged[i], wholes[i], `broadcast ${i} (${wholes[i].phase} R${wholes[i].round})`);
  const wire = h.wirePublic.reduce((n, x) => n + bytes(x), 0);
  const full = wholes.reduce((n, x) => n + bytes(x), 0);
  assert.ok(wire < full * 0.13, `wire ${wire} B vs whole ${full} B`);
  const rows = h.wirePublic.flatMap((x) => x.players);
  assert.ok(rows.some((p) => Array.isArray(p.bonds?.$list) && p.bonds.$list.some((e) => typeof e === 'string')), 'a bond list names the unchanged bonds by id');
  const sps = h.wirePublic.filter((x) => x.sp?.$d === 1);
  assert.ok(sps.length > 0 && sps.every((x) => !Array.isArray(x.sp.cards)), 'a 机变 pick sends the picks, not the twelve cards again');
  assert.equal('delta' in h.wirePublic[0], false, 'the first broadcast is whole');
  assert.ok(h.wirePublic.slice(1, -1).every((x) => x.delta === true));
  assert.ok(h.wirePublic.some((x) => x.players.some((p) => Array.isArray(p.$rm))), 'a row field going away travels as $rm');
  assert.ok(h.wirePublic.some((x) => Array.isArray(x.$rm) && x.$rm.includes('sp')), 'so does a top-level one (the 机变 draft after SP_DRAFT)');
  assert.ok(h.wirePublic.slice(1, -1).every((x) => !('modeId' in x) && !('factions' in x)), 'the match settings travel once');
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
  assert.match(src, /store\.patch\('match', \{ public: mergePublic\(store\.get\(\)\.match\.public, payload\(msg\)\) \}\)/);
});
