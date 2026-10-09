// Local patch: the settlement screen's feedback (server/local-feedback.js inbox, shared/local.js fb.send, public/js/ui/
// feedback.js packing, public/js/diag.js matchBattles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';

import { startServer } from '../server/index.js';
import { Match as RealMatch } from '../server/match/Match.js';
import { FeedbackInbox, cleanFeedbackText, KEEP_DAYS, DAY_MS } from '../server/local-feedback.js';
import { validateC2S } from '../shared/protocol.js';
import { FEEDBACK_BATTLES_MAX } from '../shared/local.js';
import { rememberBattle, clearBattles, matchBattles, battleCount, recordError, clearErrorLog, setBattleSource } from '../public/js/diag.js';
import { packBattles, gzipBase64, feedbackId } from '../public/js/ui/feedback.js';
import { TestClient } from './helpers/wsClient.js';
import { PHASE } from '../shared/constants.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sp-feedback-'));
const quiet = { info() {}, warn() {}, error() {} };
const gz = (v) => zlib.gzipSync(JSON.stringify(v)).toString('base64');
const filesOf = (dir) => fs.readdirSync(path.join(dir, 'inbox'));
const readOne = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'inbox', filesOf(dir)[0]), 'utf8'));

/** A room as Lobby.onMatchEnd leaves it: one human, one bot, a summary with names. */
const roomOf = (over = {}) => ({
  code: 'QWER', matchCount: 2, mode: 'coop', difficulty: 'NORMAL',
  seats: [{ playerId: 'p_1', name: '나', isBot: false }, { playerId: 'ai_1', name: 'AI', isBot: true }],
  spectators: [],
  lastSummary: { victory: false, roundsPassed: 7, reason: 'defeat', players: [
    { playerId: 'p_1', seat: 0, name: '나', isBot: false, lineup: [], bonds: [], stats: { kills: 3 } },
    { playerId: 'ai_1', seat: 1, name: 'AI', isBot: true, lineup: [], bonds: [], stats: {} },
  ] },
  ...over,
});
const msgOf = (over = {}) => ({ t: 'fb.send', id: 'abcd1234', kind: 'bug', text: '보스가 안 나와요', ...over });

test('fb.send validation: id, kind, text, attachment sizes', () => {
  assert.equal(validateC2S(msgOf()), null);
  assert.equal(validateC2S(msgOf({ diag: 'x', battles: 'H4sI', match: 'k1-2' })), null);
  assert.ok(validateC2S(msgOf({ id: 'ABCD1234' })));
  assert.ok(validateC2S(msgOf({ kind: 'spam' })));
  assert.ok(validateC2S(msgOf({ text: '   ' })));
  assert.ok(validateC2S(msgOf({ battles: 'not base64!' })));
  assert.ok(validateC2S(msgOf({ battles: 'A'.repeat(FEEDBACK_BATTLES_MAX + 4) })));
});

test('an inbox without a directory is off: no welcome flag, fb.send refused', () => {
  const inbox = new FeedbackInbox({ dir: null, log: quiet });
  assert.equal(inbox.enabled, false);
  assert.equal(inbox.welcomeInfo(), null);
  assert.equal(inbox.submit({ playerId: 'p_1' }, msgOf()).error, 'BAD_MSG');
  assert.equal(FeedbackInbox.fromEnv({}, quiet).enabled, false);
});

test('a player of a match that just ended stores one file: text cleaned, stats without names, address hashed', () => {
  const dir = tmpDir();
  let now = Date.UTC(2026, 9, 9, 12);
  const inbox = new FeedbackInbox({ dir, now: () => now, log: quiet });
  try {
    assert.deepEqual(inbox.welcomeInfo(), { feedback: true });
    const session = { playerId: 'p_1', addr: '203.0.113.7' };
    assert.equal(inbox.submit(session, msgOf()).error, 'WRONG_PHASE', 'no finished match yet');
    inbox.noteMatchEnd(roomOf());
    const battles = [{ t: 'b.start', battleId: 'k1-2.3.1', spec: { round: 3 }, errors: 1 }];
    const res = inbox.submit(session, msgOf({ text: ' 보스가\r\n안 나와요​\n\n\n\n\n끝 ', diag: 'diag text', battles: gz(battles), match: 'k1-2' }));
    assert.deepEqual(res, { ok: true });
    assert.deepEqual(filesOf(dir), ['FB-20261009-abcd1234.json']);
    const rec = readOne(dir);
    assert.equal(rec.kind, 'bug');
    assert.equal(rec.text, '보스가\n안 나와요\n\n\n끝');
    assert.equal(rec.diag, 'diag text');
    assert.deepEqual(rec.battles, battles);
    assert.equal(rec.match, 'k1-2');
    assert.equal(rec.stats.room, 'QWER');
    assert.equal(rec.stats.match, 2);
    assert.ok(rec.stats.players.every((p) => !('name' in p)), 'names stay out');
    assert.match(rec.sender, /^[0-9a-f]{16}$/);
    assert.ok(!JSON.stringify(rec).includes('203.0.113.7'), 'the address itself is never written');
    // the same address hashes the same (the key is kept in the directory), another one differently
    assert.equal(new FeedbackInbox({ dir, log: quiet }).addrHash('203.0.113.7'), rec.sender);
    assert.notEqual(inbox.addrHash('203.0.113.8'), rec.sender);
    // a taken id is refused, an hour later the match is too old
    assert.equal(inbox.submit(session, msgOf()).error, 'ALREADY');
    now += 61 * 60_000;
    assert.equal(inbox.submit(session, msgOf({ id: 'zzzz0000' })).error, 'WRONG_PHASE');
  } finally {
    inbox.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('limits: per match, per address, per day; broken battles are dropped with the reason', () => {
  const dir = tmpDir();
  const inbox = new FeedbackInbox({ dir, log: quiet, limits: { perAddr: 4, global: 5 } });
  try {
    inbox.noteMatchEnd(roomOf());
    const s = { playerId: 'p_1', addr: '1.1.1.1' };
    for (let i = 0; i < 3; i++) assert.deepEqual(inbox.submit(s, msgOf({ id: `aaaa000${i}`, battles: i ? undefined : 'AAAA' })), { ok: true });
    assert.equal(inbox.submit(s, msgOf({ id: 'aaaa0009' })).error, 'RATE', 'three per match');
    assert.ok(filesOf(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, 'inbox', f), 'utf8'))).some((r) => r.battles === null && r.battlesError));
    inbox.noteMatchEnd(roomOf({ matchCount: 3 }));
    assert.deepEqual(inbox.submit(s, msgOf({ id: 'bbbb0000' })), { ok: true });
    assert.equal(inbox.submit(s, msgOf({ id: 'bbbb0001' })).error, 'RATE', 'four per address');
    assert.deepEqual(inbox.submit({ playerId: 'p_1', addr: '2.2.2.2' }, msgOf({ id: 'cccc0000' })), { ok: true });
    assert.equal(inbox.submit({ playerId: 'p_1', addr: '3.3.3.3' }, msgOf({ id: 'cccc0001' })).error, 'RATE', 'five in all');
    assert.equal(inbox.submit({ playerId: 'ai_1', addr: '4.4.4.4' }, msgOf({ id: 'dddd0000' })).error, 'WRONG_PHASE', 'a bot seat is not marked');
  } finally {
    inbox.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test(`files older than ${KEEP_DAYS} days are pruned`, () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'inbox'));
  const old = path.join(dir, 'inbox', 'FB-20260101-old00000.json');
  const fresh = path.join(dir, 'inbox', 'FB-20261001-new00000.json');
  fs.writeFileSync(old, '{}');
  fs.writeFileSync(fresh, '{}');
  const now = Date.now();
  fs.utimesSync(old, new Date(now - (KEEP_DAYS + 1) * DAY_MS), new Date(now - (KEEP_DAYS + 1) * DAY_MS));
  const inbox = new FeedbackInbox({ dir, log: quiet });
  inbox.stop();
  assert.deepEqual(filesOf(dir), ['FB-20261001-new00000.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cleanFeedbackText: null when nothing is left, cut to the limit in code points', () => {
  assert.equal(cleanFeedbackText(' ​\n '), null);
  assert.equal(cleanFeedbackText('가나다라', 2), '가나');
  assert.equal(cleanFeedbackText(42), null);
});

test('diag.matchBattles keeps this match\'s own battles, counts their errors and replaces names', () => {
  clearBattles();
  clearErrorLog();
  const state = { me: { name: '나' }, match: { public: { players: [{ name: '나' }, { name: '친구' }] } } };
  rememberBattle({ battleId: 'aa-1.1.1', fieldId: 'f', kind: 'normal', spec: { round: 1, note: '친구' } });
  rememberBattle({ battleId: 'aa-1.2.1', fieldId: 'f', kind: 'normal', spec: { round: 2 } });
  rememberBattle({ battleId: 'aa-1.2.1', fieldId: 'f', kind: 'normal', spec: { round: 2 } }); // a resend
  setBattleSource(() => ({ battleId: 'aa-1.2.1', spec: {} }));
  recordError('sim', new Error('boom'));
  recordError('sim', new Error('boom'));
  setBattleSource(null);
  let mb = matchBattles(state);
  assert.equal(mb.match, 'aa-1');
  assert.equal(battleCount(), 2);
  assert.deepEqual(mb.list.map((b) => [b.battleId, b.errors]), [['aa-1.1.1', 0], ['aa-1.2.1', 2]]);
  assert.equal(mb.list[0].spec.note, '<player2>');
  rememberBattle({ battleId: 'bb.1.1', spec: { round: 1 } }); // the next match starts the list again
  mb = matchBattles(state);
  assert.deepEqual(mb.list.map((b) => b.battleId), ['bb.1.1']);
  clearBattles();
  clearErrorLog();
});

test('packBattles fits the limit by leaving out the oldest battles without errors first', async () => {
  const list = [{ battleId: 'a', errors: 0 }, { battleId: 'b', errors: 2 }, { battleId: 'c', errors: 0 }];
  const sizeOf = async (text) => 'x'.repeat(JSON.parse(text).length * 10);
  assert.deepEqual(await packBattles(list, 30, sizeOf), { data: 'x'.repeat(30), kept: 3 });
  assert.deepEqual(await packBattles(list, 20, sizeOf), { data: 'x'.repeat(20), kept: 2 });
  let kept = null;
  await packBattles(list, 10, async (text) => { kept = JSON.parse(text).map((b) => b.battleId); return 'x'.repeat(kept.length * 10); });
  assert.deepEqual(kept, ['b'], 'the battle with errors stays longest');
  assert.deepEqual(await packBattles(list, 5, sizeOf), { data: null, kept: 0 });
  // the browser packing round-trips through the server's gunzip
  const b64 = await gzipBase64(JSON.stringify(list));
  assert.deepEqual(JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')), list);
  assert.match(feedbackId(), /^[a-z0-9]{8}$/);
});

test('real server: welcome says feedback, a player sends it from the settlement of a finished match', async () => {
  const dir = tmpDir();
  const srv = await startServer({ port: 0, host: '127.0.0.1', log: { info() {}, warn() {}, debug() {}, error() {} }, MatchClass: RealMatch, seedFn: () => 1312887319 });
  srv.lobby.feedback = new FeedbackInbox({ dir, log: quiet });
  let a;
  try {
    a = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    const welcome = await a.hello('제보');
    assert.equal(welcome.feedback, true);
    a.id = welcome.playerId;
    assert.equal((await a.request({ t: 'room.create', mode: 'coop', difficulty: 'FUNNY' })).t, 'ok');
    await a.waitFor('room.state', (s) => s.hostId === a.id);
    assert.equal((await a.request({ t: 'room.addBot' })).t, 'ok');
    const early = await a.request(msgOf({ id: 'eeee0000' }));
    assert.equal(early.t, 'error');
    assert.equal(early.code, 'WRONG_PHASE', 'nothing before a match ended');
    assert.equal((await a.request({ t: 'room.start' })).t, 'ok');
    await a.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK);
    const room = srv.lobby.getRoom([...srv.lobby.rooms.keys()][0]);
    room.match.finish({ victory: false, reason: 'defeat' });
    await delay(20);
    const battles = gz([{ t: 'b.start', battleId: 'x.1.1', spec: {} }]);
    assert.equal((await a.request(msgOf({ id: 'ffff0000', kind: 'idea', text: '관전 기능', battles }))).t, 'ok');
    const rec = readOne(dir);
    assert.equal(rec.kind, 'idea');
    assert.equal(rec.stats.room, room.code);
    assert.equal(rec.battles.length, 1);
  } finally {
    await a?.terminate();
    srv.lobby.feedback?.stop();
    await srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
