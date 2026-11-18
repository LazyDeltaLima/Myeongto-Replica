// test/local-moderation.test.js — chat moderation (server/local-moderation.js, its hooks in server/local-patch.js and
// net.js, the blocking / notice helpers of public/js/ui/chat.js). Rules: docs/rules/ui.md 「채팅 차단」.

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Moderation, NET_TTL_MS } from '../server/local-moderation.js';
import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { CHAT_COOLDOWN_MS } from '../shared/local.js';
import { validateC2S } from '../shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function logSink() {
  const lines = [];
  const push = (...a) => lines.push(a.map(String).join(' '));
  return { lines, info: push, warn: push, error: push, debug() {} };
}

const tmpDir = () => mkdtempSync(path.join(os.tmpdir(), 'sp-mod-'));
const writeBans = (dir, doc) => writeFileSync(path.join(dir, 'chat-bans.json'), JSON.stringify(doc));

describe('browser ids (server/local-moderation.js)', () => {
  test('issued ids verify; a changed, foreign or malformed value does not', () => {
    const t = { now: 1_700_000_000_000 };
    const mod = new Moderation({ now: () => t.now, log: logSink() });
    const bid = mod.issue();
    assert.match(bid, /^[0-9a-f]{16}\.[0-9a-z]+\.[0-9a-f]{16}$/);
    assert.deepEqual(mod.verify(bid), { id: bid.slice(0, 16), issuedAt: t.now });
    const [id, issued, mac] = bid.split('.');
    assert.equal(mod.verify(`${id}.${(t.now - 1e9).toString(36)}.${mac}`), null, 'an older issue time is refused');
    assert.equal(mod.verify(`${'0'.repeat(16)}.${issued}.${mac}`), null);
    assert.equal(new Moderation({ log: logSink() }).verify(bid), null, 'another key');
    for (const bad of [null, 1, '', 'x', `${bid}x`, bid.toUpperCase()]) assert.equal(mod.verify(bad), null, String(bad));
    assert.equal(validateC2S({ t: 'hello', name: 'A', bid }), null);
    assert.ok(validateC2S({ t: 'hello', name: 'A', bid: 'x'.repeat(65) }));
  });

  test('identify keeps a valid id, replaces anything else, logs [id] once per socket and on a rename', () => {
    const log = logSink();
    const mod = new Moderation({ log });
    const s = { playerId: 'p_1', name: 'Kal' };
    const bid = mod.identify(s, { bid: 'forged', key: '1.2.3.4' });
    assert.notEqual(bid, 'forged');
    assert.equal(s.browserId, bid.slice(0, 16));
    assert.equal(mod.identify(s, { bid, key: '1.2.3.4', repeat: true }), bid);
    assert.equal(log.lines.filter((l) => l.startsWith('[id]')).length, 1);
    s.name = 'Kal2';
    mod.identify(s, { bid, key: '1.2.3.4', repeat: true });
    assert.deepEqual(log.lines.filter((l) => l.startsWith('[id]')), [`[id] p_1 b=${s.browserId} net=1.2.3.4 "Kal"`, `[id] p_1 b=${s.browserId} net=1.2.3.4 "Kal2"`]);
    const t = { playerId: 'p_2', name: 'Loc' };
    mod.identify(t, { key: null });
    assert.match(log.lines.at(-1), /^\[id\] p_2 b=[0-9a-f]{16} net=local "Loc"$/);
  });
});

describe('chat bans (server/local-moderation.js)', () => {
  const dirs = [];
  after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  test('a banned browser is muted; a browser issued after the ban on its network is muted for a day; older ones never', () => {
    const dir = tmpDir(); dirs.push(dir);
    const t = { now: 1_800_000_000_000 };
    const log = logSink();
    const mod = new Moderation({ dir, log, now: () => t.now });
    try {
      // an innocent browser behind the same carrier address, issued before the ban
      const old = { playerId: 'p_old', name: 'Old', limitKey: '10.9.8.7' };
      mod.identify(old, { key: '10.9.8.7' });
      t.now += 1000;
      const troll = { playerId: 'p_t', name: 'Troll', limitKey: '10.9.8.7' };
      mod.identify(troll, { key: '10.9.8.7' });
      assert.equal(mod.chatMute(troll), null, 'nothing banned yet');
      t.now += 1000;
      writeBans(dir, { bans: [{ id: troll.browserId, at: t.now, reason: 'spam' }] });
      mod.reload();
      assert.equal(mod.chatMute(troll), 'ban');
      // the sighting of the banned browser on its network is written back to the file
      assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'chat-bans.json'), 'utf8')).bans[0].nets, { '10.9.8.7': t.now });
      assert.equal(mod.chatMute(old), null, 'an id older than the ban is never followed up');
      // the troll clears the site data: a fresh id on the same network
      t.now += 60_000;
      const fresh = { playerId: 'p_t2', name: 'Troll', limitKey: '10.9.8.7' };
      mod.identify(fresh, { bid: 'cleared', key: '10.9.8.7' });
      assert.equal(mod.chatMute(fresh), 'net');
      assert.ok(log.lines.some((l) => l.startsWith(`[mod] net mute p_t2 b=${fresh.browserId} net=10.9.8.7`)));
      // another network: nothing
      const elsewhere = { playerId: 'p_e', name: 'E', limitKey: '5.6.7.8' };
      mod.identify(elsewhere, { key: '5.6.7.8' });
      assert.equal(mod.chatMute(elsewhere), null);
      // the address passes on: a day after the last sighting a new browser there is free
      t.now += NET_TTL_MS + 1;
      const later = { playerId: 'p_l', name: 'L', limitKey: '10.9.8.7' };
      mod.identify(later, { key: '10.9.8.7' });
      assert.equal(mod.chatMute(later), null);
      // allow exempts an id from the follow-up, never from its own ban; an expired ban mutes nobody
      writeBans(dir, { bans: [{ id: troll.browserId, at: t.now - 5000, nets: { '10.9.8.7': t.now } }], allow: [fresh.browserId, troll.browserId] });
      mod.mtime = -1; mod.reload();
      assert.equal(mod.chatMute(fresh), null);
      assert.equal(mod.chatMute(troll), 'ban');
      writeBans(dir, { bans: [{ id: troll.browserId, at: 1, until: t.now - 1 }] });
      mod.mtime = -1; mod.reload();
      assert.equal(mod.chatMute(troll), null);
    } finally { mod.stop(); }
  });

  test('a missing or broken ban file: no bans, the previous list kept on a parse error', () => {
    const dir = tmpDir(); dirs.push(dir);
    const log = logSink();
    const mod = new Moderation({ dir, log });
    try {
      const s = { playerId: 'p', name: 'N' };
      mod.identify(s, {});
      assert.equal(mod.chatMute(s), null);
      writeBans(dir, { bans: [{ id: s.browserId, at: 0 }, { id: 'nope' }] });
      mod.reload();
      assert.equal(mod.bans.length, 1);
      writeFileSync(path.join(dir, 'chat-bans.json'), '{ broken');
      mod.mtime = -1; mod.reload();
      assert.equal(mod.chatMute(s), 'ban');
      assert.ok(log.lines.some((l) => l.includes('unreadable')));
    } finally { mod.stop(); }
  });
});

describe('shadowed chat on the real server (server/local-patch.js)', () => {
  let srv, mod, dir;
  const log = logSink();
  const open = new Set();
  const player = async (name, extra) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    const w = await c.hello(name, null, extra);
    c.id = w.playerId; c.bid = w.bid;
    return c;
  };
  const expectOk = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
  before(async () => {
    dir = tmpDir();
    srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, log });
    mod = srv.lobby.moderation = new Moderation({ dir, log, pollMs: 60_000 });
  });
  afterEach(async () => { await Promise.all([...open].map((c) => c.terminate().catch(() => {}))); open.clear(); });
  after(async () => { mod?.stop(); await srv?.close(); rmSync(dir, { recursive: true, force: true }); });

  test('welcome.bid comes back the same on the next visit', async () => {
    const a = await player('Visit');
    assert.match(a.bid, /^[0-9a-f]{16}\./);
    const b = await player('Visit', { bid: a.bid });
    assert.equal(b.bid, a.bid);
    const c = await player('Visit', { bid: 'made-up' });
    assert.notEqual(c.bid, a.bid);
  });

  test('a banned player sees their own lines; the room, a late joiner and the history never do', async () => {
    const troll = await player('Troll');
    await expectOk(troll, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const st = await troll.waitFor('room.state', (s) => s.hostId === troll.id);
    const guest = await player('Guest');
    await expectOk(guest, { t: 'room.join', code: st.code });
    writeBans(dir, { bans: [{ id: troll.bid.slice(0, 16), at: Date.now() }] });
    mod.reload();
    await expectOk(troll, { t: 'room.chat', text: 'you are bad' });
    const own = await troll.waitFor('room.chat');
    assert.deepEqual([own.text, own.playerId, own.seq], ['you are bad', troll.id, 1]);
    assert.equal(Object.hasOwn(own, 'shadow'), false, 'nothing on the wire tells the sender');
    await expectOk(guest, { t: 'room.chat', text: 'hello' });
    const seen = await guest.waitFor('room.chat');
    assert.deepEqual([seen.text, seen.seq], ['hello', 2], 'the guest never got line 1');
    const late = await player('Late');
    await expectOk(late, { t: 'room.join', code: st.code });
    assert.deepEqual((await late.waitFor('room.chatlog')).lines.map((l) => l.text), ['hello']);
    // the banned player's resync still shows their line
    const again = await player('Troll', { bid: troll.bid });
    await expectOk(again, { t: 'room.join', code: st.code });
    assert.deepEqual((await again.waitFor('room.chatlog')).lines.map((l) => l.text), ['you are bad', 'hello']);
    await sleep(CHAT_COOLDOWN_MS + 50);
    const chat = log.lines.filter((l) => l.startsWith('[chat]'));
    assert.deepEqual(chat, [
      `[chat] ${st.code} ${troll.id} b=${troll.bid.slice(0, 16)} "Troll" (muted:ban): "you are bad"`,
      `[chat] ${st.code} ${guest.id} b=${guest.bid.slice(0, 16)} "Guest": "hello"`,
    ]);
  });
});

describe('chat blocking and notice (public/js/ui/chat.js)', () => {
  const mod = (rel) => import(pathToFileURL(path.join(ROOT, 'public', 'js', rel)).href);

  test('logEntries: blocked lines fold into one counted line where the first was; the notice follows the history', async () => {
    const { logEntries, unblockedLines } = await mod('ui/chat.js');
    const l = (seq, playerId) => ({ seq, playerId, name: playerId.toUpperCase(), text: `t${seq}` });
    const lines = [l(1, 'a'), l(2, 'b'), l(3, 'a'), l(4, 'c'), l(5, 'b')];
    const kinds = (es) => es.map((e) => (e.kind === 'notice' ? 'N' : e.kind === 'blocked' ? `x${e.playerId}${e.count}` : e.seq));
    assert.deepEqual(kinds(logEntries(lines, [], 3)), [1, 2, 3, 'N', 4, 5]);
    assert.deepEqual(kinds(logEntries(lines, ['b'], 3)), [1, 'xb2', 3, 'N', 4]);
    assert.deepEqual(kinds(logEntries(lines, ['b'], 0)), ['N', 1, 'xb2', 3, 4], 'an empty history: the notice on top');
    assert.deepEqual(kinds(logEntries(lines, ['a', 'b'], 5)), ['xa2', 'xb2', 4, 'N']);
    assert.deepEqual(kinds(logEntries([], [], 0)), ['N']);
    assert.deepEqual(unblockedLines(lines, ['a']).map((x) => x.seq), [2, 4, 5]);
    assert.equal(unblockedLines(lines, []), lines);
  });

  test('loadBlocked: per room code, garbage ignored', async () => {
    const { loadBlocked } = await mod('ui/chat.js');
    const store = new Map();
    const s = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    store.set('sp.chatBlocked', JSON.stringify({ code: 'ABCD', ids: ['p_1', 3, 'p_2'] }));
    assert.deepEqual(loadBlocked('ABCD', s), ['p_1', 'p_2']);
    assert.deepEqual(loadBlocked('WXYZ', s), []);
    store.set('sp.chatBlocked', '{');
    assert.deepEqual(loadBlocked('ABCD', s), []);
  });
});
