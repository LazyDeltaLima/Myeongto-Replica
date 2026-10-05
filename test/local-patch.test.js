// test/local-patch.test.js — the local NAS patch (server/local-patch.js, server/sim/content/local-patch.js,
// shared/local.js, the chat / faction / emote-set / resource-download client modules), kept out of the upstream test
// files so that merging upstream releases stays conflict-free. Boots real servers in-process on random ports like
// test/lobby.test.js.

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { makeMatch } from './match/harness.js';
import { ERR, EMOTES } from '../shared/constants.js';
import { CHAT_MAX_LEN, CHAT_COOLDOWN_MS, CHAT_FACTIONS, chatFaction } from '../shared/local.js';
import { validateC2S, C2S, S2C } from '../shared/protocol.js';
import { USER_EMOTE_PAGES, userEmoteArt, emoteSet } from '../shared/emote-art.js';
import { coopPoolPlayers } from '../server/local-patch.js';
import { bossPoolHp } from '../server/match/finalAssault.js';
import { makeBattle, chessRec } from './helpers/battleHarness.js';
import * as enemiesMod from '../server/sim/content/enemies.js';
import * as simPatch from '../server/sim/content/local-patch.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, 'public', 'js', rel)).href);

// ---- shared/local.js -----------------------------------------------------------------------------------------------

describe('protocol extension (shared/local.js)', () => {
  test('room chat, chat factions and the emote set are part of the protocol tables', () => {
    assert.ok(C2S['room.chat'] && C2S['room.chatFaction']);
    for (const t of ['room.chat', 'room.chatlog', 'room.factions']) assert.ok(S2C.includes(t), t);
    assert.equal(validateC2S({ t: 'room.chat', text: 'hi' }), null);
    assert.equal(validateC2S({ t: 'room.chatFaction', faction: 'yan' }), null);
    assert.equal(validateC2S({ t: 'room.chatFaction', faction: '__proto__' }), 'bad field faction');
    assert.equal(validateC2S({ t: 'g.emote', id: EMOTES[0], set: 'user' }), null);
    assert.equal(validateC2S({ t: 'g.emote', id: EMOTES[0] }), null, 'set is optional (older clients)');
    assert.equal(validateC2S({ t: 'g.emote', id: EMOTES[0], set: 'mine' }), 'bad field set');
    assert.equal(validateC2S({ t: 'g.emote', id: 'happy', set: 'user' }), 'bad field id', 'upstream id check kept');
  });

  test('chat factions: 8 nations with a color and a bond icon; lookups are safe', () => {
    assert.equal(CHAT_FACTIONS.length, 8);
    for (const f of CHAT_FACTIONS) assert.match(`${f.id} ${f.color} ${f.bond}`, /^[a-z]+ #[0-9a-f]{6} [a-zA-Z]+Ship$/);
    for (const id of ['__proto__', 'constructor', null, 1]) assert.equal(chatFaction(id), null);
  });
});

// ---- server: room chat, factions, SP_MAX_BOTS ---------------------------------------------------------------------

describe('room chat, chat factions and SP_MAX_BOTS (server/local-patch.js)', () => {
  let srv;
  const open = new Set();
  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    const w = await c.hello(name);
    c.id = w.playerId;
    return c;
  };
  const expectOk = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
  const expectError = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.code, code, `${msg.t}: ${JSON.stringify(r)}`); return r; };
  const createRoom = async (c, mode = 'coop', difficulty = 'NORMAL') => {
    await expectOk(c, { t: 'room.create', mode, difficulty });
    return c.waitFor('room.state', (s) => s.hostId === c.id && s.mode === mode);
  };
  const joinRoom = async (c, code) => {
    await expectOk(c, { t: 'room.join', code });
    return c.waitFor('room.state', (s) => s.code === code && s.seats.some((x) => x && x.playerId === c.id));
  };
  const errors = [];
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch,
      log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } });
  });
  afterEach(async () => { await Promise.all([...open].map((c) => c.terminate().catch(() => {}))); open.clear(); });
  after(async () => { await srv?.close(); assert.deepEqual(errors, [], 'no server errors logged'); });

  test('room chat: sanitized lines to the whole room, cooldown, history for a late joiner, co-op only', async () => {
    const host = await player('Talk');
    const st = await createRoom(host);
    const guest = await player('Hear');
    await joinRoom(guest, st.code);
    await expectOk(host, { t: 'room.chat', text: '  hi​   there\n ' });
    for (const c of [host, guest]) {
      const m = await c.waitFor('room.chat');
      assert.deepEqual([m.text, m.name, m.playerId, m.seq, m.faction], ['hi there', 'Talk', host.id, 1, null]);
    }
    await expectError(host, { t: 'room.chat', text: 'again' }, ERR.RATE);
    await expectError(guest, { t: 'room.chat', text: ' ​ ' }, ERR.BAD_MSG);
    await expectOk(guest, { t: 'room.chat', text: 'x'.repeat(CHAT_MAX_LEN + 30) });
    assert.equal((await host.waitFor('room.chat', (m) => m.seq === 2)).text.length, CHAT_MAX_LEN);
    const late = await player('Late');
    await joinRoom(late, st.code);
    assert.deepEqual((await late.waitFor('room.chatlog')).lines.map((l) => l.seq), [1, 2]);
    const lone = await player('Lone');
    await expectError(lone, { t: 'room.chat', text: 'hello?' }, ERR.NOT_IN_ROOM);
    await createRoom(lone, 'solo', 'FUNNY');
    await expectError(lone, { t: 'room.chat', text: 'hello?' }, ERR.BAD_MSG);
  });

  test('spectators get the history and chat with a marked line, but pick no faction', async () => {
    const host = await player('Room');
    const st = await createRoom(host);
    await expectOk(host, { t: 'room.chat', text: 'before' });
    const spec = await player('Watch');
    await expectOk(spec, { t: 'room.spectate', code: st.code });
    assert.deepEqual((await spec.waitFor('room.chatlog')).lines.map((l) => l.text), ['before']);
    await expectOk(spec, { t: 'room.chat', text: 'hi from the stands' });
    const line = await host.waitFor('room.chat', (m) => m.playerId === spec.id);
    assert.deepEqual([line.text, line.spectator, line.faction], ['hi from the stands', true, null]);
    await expectError(spec, { t: 'room.chatFaction', faction: 'yan' }, ERR.SPECTATOR);
  });

  test('chat faction: announced line, room.factions to all and to joiners, tag on later lines, cleared when the match ends', async () => {
    const host = await player('Flag');
    const st = await createRoom(host);
    assert.equal('chatFaction' in st.seats[0], false, 'room.state stays upstream-shaped');
    const guest = await player('Seen');
    await joinRoom(guest, st.code);
    await expectOk(host, { t: 'room.chatFaction', faction: 'siracusa' });
    const line = await guest.waitFor('room.chat');
    assert.deepEqual([line.kind, line.faction, line.playerId, line.text], ['faction', 'siracusa', host.id, '']);
    assert.deepEqual((await guest.waitFor('room.factions')).factions, { [host.id]: 'siracusa' });
    await expectError(host, { t: 'room.chatFaction', faction: 'yan' }, ERR.RATE); // shares the chat cooldown
    await expectError(host, { t: 'room.chatFaction', faction: 'rhodes' }, ERR.BAD_MSG);
    const late = await player('Late');
    await joinRoom(late, st.code);
    assert.deepEqual((await late.waitFor('room.factions')).factions, { [host.id]: 'siracusa' }, 'a joiner gets the factions');

    await expectOk(guest, { t: 'room.ready', ready: true });
    await expectOk(late, { t: 'room.ready', ready: true });
    await new Promise((r) => setTimeout(r, CHAT_COOLDOWN_MS + 200));
    await expectOk(host, { t: 'room.start' });
    await host.waitFor('room.state', (s) => s.inMatch);
    await expectOk(host, { t: 'room.chat', text: 'go' });
    assert.equal((await guest.waitFor('room.chat', (m) => m.text === 'go')).faction, 'siracusa');
    guest.clearInbox();
    for (const c of [host, guest, late]) await expectOk(c, { t: 'g.infoReady' });
    assert.deepEqual((await guest.waitFor('room.factions')).factions, {}, 'cleared at the match end');
    await guest.waitFor('room.state', (s) => !s.inMatch);
    await expectOk(guest, { t: 'room.chat', text: 'gg' });
    assert.equal((await host.waitFor('room.chat', (m) => m.text === 'gg')).faction, null);
  });

  test('SP_MAX_BOTS: room.state maxBots (null when unset) and the cap on AI teammates (0 = none)', async () => {
    const prev = process.env.SP_MAX_BOTS;
    try {
      delete process.env.SP_MAX_BOTS;
      assert.equal((await createRoom(await player('Free'))).maxBots, null);
      process.env.SP_MAX_BOTS = '1';
      const host = await player('Cap');
      assert.equal((await createRoom(host)).maxBots, 1);
      await expectOk(host, { t: 'room.addBot' });
      await expectError(host, { t: 'room.addBot' }, ERR.ROOM_FULL);
      process.env.SP_MAX_BOTS = '0';
      const none = await player('NoBots');
      await createRoom(none);
      await expectError(none, { t: 'room.addBot' }, ERR.ROOM_FULL);
    } finally {
      if (prev === undefined) delete process.env.SP_MAX_BOTS;
      else process.env.SP_MAX_BOTS = prev;
    }
  });
});

// ---- match: emote sets ---------------------------------------------------------------------------------------------

test('emote sets: g.emote set "user" is relayed with the emote; the official set adds nothing (upstream shape)', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 67, fake: true }).start();
  assert.deepEqual(h.m.handle('p_0', { t: 'g.emote', id: 'autochess_battle_happy' }), { ok: true });
  assert.deepEqual(h.lastBc('m.emote'), { t: 'm.emote', playerId: 'p_0', id: 'autochess_battle_happy' });
  assert.deepEqual(h.m.handle('p_1', { t: 'g.emote', id: 'autochess_battle_sad', set: 'user' }), { ok: true });
  assert.equal(h.lastBc('m.emote').set, 'user');
  assert.deepEqual(['user', 'official', undefined, 'x'].map(emoteSet), ['user', 'official', 'official', 'official']);
});

test('emote sets: user pictures for all 36 ids exist on disk, six pages of six', () => {
  const paths = EMOTES.map(userEmoteArt);
  assert.equal(new Set(paths).size, 36);
  for (const p of paths) assert.ok(existsSync(path.join(ROOT, 'public', p)), p);
  assert.deepEqual(USER_EMOTE_PAGES.map((pg) => pg.emotes.length), [6, 6, 6, 6, 6, 6]);
  assert.deepEqual(USER_EMOTE_PAGES.flatMap((pg) => pg.emotes.map((e) => e.id)).sort(), [...EMOTES].sort());
  for (const id of ['__proto__', 'happy', null]) assert.equal(userEmoteArt(id), null);
});

// ---- client helpers ------------------------------------------------------------------------------------------------

describe('client helpers', () => {
  test('chat: mergeLines / feedLines / unreadCount / historySeen / isChatHotkey', async () => {
    const { mergeLines, feedLines, unreadCount, historySeen, isChatHotkey, FEED_MS } = await mod('ui/chat.js');
    const l = (seq, playerId = 'g', rx = 0) => ({ seq, playerId, name: playerId, text: `t${seq}`, at: seq, rx });
    assert.deepEqual(mergeLines([l(2), l(1)], [l(3), l(2)]).map((x) => x.seq), [1, 2, 3], 'sorted, deduplicated');
    assert.deepEqual(mergeLines([], [l(1), l(2), l(3)], 2).map((x) => x.seq), [2, 3], 'keeps the newest');
    assert.deepEqual(mergeLines([], [null, { seq: 'x' }, { seq: 4 }]), [], 'malformed lines dropped');
    const now = 100000;
    const lines = [l(1, 'g', 0), l(2, 'h', now - 10), l(3, 'g', now - FEED_MS - 1), l(4, 'g', now - 10), l(5, 'g', now - 5)];
    assert.deepEqual(feedLines(lines, { myId: 'h', seenSeq: 0, now }).map((x) => x.seq), [4, 5], 'others, fresh, not history');
    assert.deepEqual(feedLines(lines, { myId: 'h', seenSeq: 4, now }).map((x) => x.seq), [5]);
    assert.equal(unreadCount(lines, 'h', 1), 3);
    assert.equal(historySeen([], [l(1), l(2), l(3)], 0), 3, 'history on joining is read');
    assert.equal(historySeen([l(1), l(4)], [l(1), l(2), l(3)], 1), 3, 'missed lines from a resync are read');
    assert.equal(historySeen([l(1), l(2), l(3)], [l(1), l(2), l(3)], 1), 1, 'lines already received keep their unread state');
    const doc = { querySelector: () => null };
    const key = (o) => ({ key: 'Enter', target: { tagName: 'DIV' }, ...o });
    assert.equal(isChatHotkey(key(), doc), true);
    assert.equal(isChatHotkey(key({ target: { tagName: 'INPUT' } }), doc), false, 'typing elsewhere');
    assert.equal(isChatHotkey(key({ target: { tagName: 'BUTTON' } }), doc), false, 'Enter on a focused button clicks it');
    assert.equal(isChatHotkey(key({ isComposing: true }), doc), false, 'IME composition');
    assert.equal(isChatHotkey(key({ shiftKey: true }), doc), false);
    assert.equal(isChatHotkey(key(), { querySelector: () => ({}) }), false, 'a dialog is open');
    assert.equal(isChatHotkey({ key: 'a', target: {} }, doc), false);
  });

  test('resources: download sources, order and list validation', async () => {
    const { sourcesOf, priorityOf, validPath, validEntry } = await mod('resources.js');
    const raw = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/avatar/char_002_amiya.png';
    assert.deepEqual(sourcesOf({ p: '/assets/char/avatar/x.png', u: raw }),
      ['https://cdn.jsdelivr.net/gh/yuanyan3060/ArknightsGameResource@main/avatar/char_002_amiya.png', raw], 'jsDelivr, then GitHub raw, never this server');
    const voice = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/voice/assets/dyn/audio/x.mp3';
    assert.deepEqual(sourcesOf({ p: '/assets/audio/x.mp3', u: voice }), [voice], 'no jsDelivr mirror of the voice branch');
    assert.deepEqual(sourcesOf({ p: '/assets/local/map/autochess/a.png' }), ['/assets/local/map/autochess/a.png'], 'local files from this server');
    assert.deepEqual(sourcesOf({ p: '/assets/x.png', u: 'https://example.com/x.png' }), [], 'unknown hosts are never fetched');
    const order = ['/assets/audio/bgm/a.mp3', '/assets/spine/x.skel', '/assets/local/map/a.png', '/assets/char/avatar/a.png', '/assets/ui/a.png', '/img/emotes/a0.webp']
      .sort((a, b) => priorityOf(a) - priorityOf(b));
    assert.deepEqual(order.map(priorityOf), [0, 0, 1, 2, 3, 5]);
    for (const p of ['/assets/ui/a.png', '/assets/local/map/x y.png', '/img/emotes/a0.webp']) assert.equal(validPath(p), true, p);
    for (const p of ['//evil.host/x.png', '/assets/../server/index.js', '/assets/./a.png', '/assets/a.png?x', '/assets/a%2e.png', '/assets/a\\b.png',
      '/js/main.js', '/img/other.png', 'assets/a.png', null]) assert.equal(validPath(p), false, String(p));
    const h = 'a'.repeat(64);
    assert.equal(validEntry({ p: '/assets/a.png', s: 1, h }), true);
    assert.equal(validEntry({ p: '/assets/a.png', s: 1, h, u: raw }), true);
    assert.equal(validEntry({ p: '/assets/a.png', s: 1, h, u: 'https://evil.host/a.png' }), false, 'unknown upstream host');
    assert.equal(validEntry({ p: '/assets/a.png', s: 1, h: 'xyz' }), false, 'bad hash');
    assert.equal(validEntry({ p: '/assets/a.png', h }), false, 'no size');
  });

  test('room: SP_MAX_BOTS facts (room.state maxBots)', async () => {
    const { roomFacts } = await mod('screens/room.js');
    const room = { code: 'ABCD', hostId: 'h', mode: 'coop', difficulty: 'HARD', seats: [
      { seat: 0, playerId: 'h', name: 'Host', isBot: false, ready: false, connected: true },
      { seat: 1, playerId: 'g', name: 'Guest', isBot: false, ready: false, connected: true },
      null,
      { seat: 3, playerId: 'ai_1', name: 'AI·华法琳', isBot: true, ready: true, connected: true },
    ] };
    assert.equal(roomFacts(room, 'h').maxBots, null);
    assert.equal(roomFacts(room, 'h').canAddBot, true, 'no limit: the seats alone limit the AI');
    assert.equal(roomFacts({ ...room, maxBots: 1 }, 'h').canAddBot, false, '1 AI already seated');
    assert.equal(roomFacts({ ...room, maxBots: 2 }, 'h').canAddBot, true);
    assert.equal(roomFacts({ ...room, maxBots: 2 }, 'g').canAddBot, false, 'guests never add AI');
    assert.equal(roomFacts({ ...room, maxBots: 0 }, 'h').botCount, 1);
  });

  test('activeBubbles carries the emote set', async () => {
    const { activeBubbles } = await mod('ui/gameLogic.js');
    const m = activeBubbles([{ seq: 1, playerId: 'a', id: 'hello', at: 9_000, set: 'user' }], 10_000, 3000);
    assert.equal(m.get('a').set, 'user');
  });
});

// ---- emote wheel tabs (public/js/ui/emotes.js) ------------------------------------------------------------------------

describe('emote wheel sets (public/js/ui/emotes.js)', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const manifest = { version: 1, groups: {
    'emoticon/fooldoctor': { pic_fooldoctor_08_battle: { path: '/assets/local/emoticon/fooldoctor/pic_fooldoctor_08_battle.png', w: 115, h: 115 } },
  } };
  const realFetch = globalThis.fetch;

  test('official tab: only the themes with art; user tab: the six user pages; art URLs per set', async () => {
    globalThis.fetch = async (url) => (String(url).endsWith('/local-assets.json')
      ? { ok: true, status: 200, json: async () => manifest } : { ok: false, status: 404, json: async () => ({}) });
    try {
      const { data } = await mod('data.js');
      await data.invalidate('local');
      await data.load('local');
      await data.load('assets').catch(() => {});
      const { emotePages, emoteSetArtUrls } = await mod('ui/emotes.js');
      assert.deepEqual(emotePages('official').map((p) => p.themeId), ['emoticon_foolsday_doctor']);
      assert.equal(emotePages('user'), USER_EMOTE_PAGES);
      assert.deepEqual(emoteSetArtUrls('autochess_battle_fooldoctor_06', 'user'), [userEmoteArt('autochess_battle_fooldoctor_06')]);
      assert.deepEqual(emoteSetArtUrls('autochess_battle_fooldoctor_06', 'official'), ['/assets/local/emoticon/fooldoctor/pic_fooldoctor_08_battle.png']);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

// ---- co-op leader HP (server/local-patch.js) -----------------------------------------------------------------------

describe('co-op leader pool = bloodPoint × alive players (server/local-patch.js)', () => {
  test('co-op share × the alive count (1…4, omitted = 4); solo keeps upstream\'s 0.25', () => {
    const gd = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 4, seed: 3 }).m.gd;
    assert.deepEqual([0, 1, 2, 3, 4, 5, undefined].map(coopPoolPlayers), [4, 1, 2, 3, 4, 4, 4]);
    assert.deepEqual([1, 2, 3, 4].map((n) => gd.bossPoolShare(n)), [1, 2, 3, 4]);
    assert.equal(gd.bossPoolShare(), 4);
    const bp = gd.boss('boss_1').bloodPoint.HARD;
    assert.equal(bossPoolHp(gd, 'boss_1', 2), bp * 2);
    const solo = makeMatch({ mode: 'solo', difficulty: 'HARD', humans: 1, seed: 3 }).m.gd;
    assert.equal(solo.bossPoolShare(1), 0.25);
  });

  test('a player who left is not counted at the Final Assault', () => {
    const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 4, seed: 3 });
    const m = h.m;
    m.start();
    m.onLeave('p_3');
    assert.equal(m.alivePlayers().length, 3);
    m.startFinalAssault(false);
    assert.equal(m.bossPool.maxHp, m.gd.boss(m.bossId).bloodPoint.HARD * 3);
    assert.deepEqual(h.logs.error, []);
  });
});

// ---- “帝国的甲胄” (server/sim/content/local-patch.js) ----------------------------------------------------------------

describe('“帝国的甲胄” barrage and charged triple (server/sim/content/local-patch.js)', () => {
  const VTSK = simPatch.VTSK;
  const WALL = (id, hp) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: hp, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
  const NOATK = () => ({ trait: { noAttack: true } });
  const arena = (units, extra) => makeBattle({
    content: 'generic', extraContent: extra, seed: 7, autoFinish: false, timeLimit: 600, captureNoisy: true, hooks: ['damaged'],
    defs: { chess: { t_wall: WALL('t_wall', 2e7), t_wall2: WALL('t_wall2', 1e7) } }, kits: { t_wall: NOATK, t_wall2: NOATK }, units,
  });
  const put = (h, pos) => h.spawn(VTSK, { pos, routeIndex: 0, mods: { speedMul: 0 } });
  const skillHits = (h, e) => h.hooksOf('damaged').filter((c) => c.source === e && !c.dmg.isAttack);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.05, `${a} ≈ ${b}`);

  test('upstream still lands all 8 barrage hits at once and casts the triple unblocked (drop the patch when this fails)', () => {
    const h = arena([{ chessId: 't_wall', row: 10, col: 7 }], [enemiesMod]);
    h.step();
    const e = put(h, [10, 8]);
    h.run(0.6);
    assert.equal(skillHits(h, e).length, 8);
    h.run(40);
    assert.ok(skillHits(h, e).length > 8, 'upstream: extra hits on unblocked ranged attacks');
  });

  test('barrage: first hit 1.33 s after it appears, then every 0.53 s, at most 8 hits, the highest-HP ally in the 3×3', () => {
    const h = arena([{ chessId: 't_wall', row: 10, col: 3 }, { chessId: 't_wall2', row: 11, col: 4 }], [enemiesMod, simPatch]);
    h.step();
    const e = put(h, [10, 8]);
    const t0 = h.b.time;
    h.run(1.2);
    assert.equal(skillHits(h, e).length, 0, 'nothing before 1.33 s');
    h.run(5);
    const hits = skillHits(h, e);
    assert.equal(hits.length, 8);
    hits.forEach((c, k) => near(c.t - t0, simPatch.BARRAGE_DELAY + k * simPatch.BARRAGE_STEP));
    assert.ok(hits.every((c) => c.target === h.unit('t_wall')), 'the highest-HP ally inside the zone');
    hits.forEach((c) => near(c.amount, e.s.atk));
  });

  test('barrage: an ally that leaves the 3×3 is not hit; the zone stays where it was locked', () => {
    const h = arena([{ chessId: 't_wall', row: 10, col: 3 }, { chessId: 't_wall2', row: 12, col: 12 }], [enemiesMod, simPatch]);
    h.step();
    const e = put(h, [10, 8]);
    h.b.kill(h.unit('t_wall'), null);
    h.run(7);
    assert.equal(skillHits(h, e).length, 0);
  });

  test('charged triple: never while unblocked; blocked, one attack lands as three 100 % hits', () => {
    const h = arena([{ chessId: 't_wall', row: 10, col: 7 }], [enemiesMod, simPatch]);
    h.step();
    const e = put(h, [10, 8]);
    h.run(40);
    assert.equal(e.blockedBy, null);
    assert.equal(skillHits(h, e).length, 8, 'only the barrage');
    assert.ok(h.hooksOf('damaged').some((c) => c.source === e && c.dmg.isAttack), 'it did attack (ranged)');

    const hb = arena([{ chessId: 't_wall', row: 10, col: 7 }], [enemiesMod, simPatch]);
    hb.step();
    const eb = put(hb, [10, 7]);
    hb.run(0.2);
    assert.equal(eb.blockedBy, hb.unit('t_wall'));
    hb.run(simPatch.BARRAGE_LIFE + 1);
    const before = skillHits(hb, eb).length;
    hb.run(20);
    const extra = skillHits(hb, eb).slice(before);
    assert.ok(extra.length >= 2 && extra.length % 2 === 0, `extra hits come in pairs: ${extra.length}`);
    extra.forEach((c) => near(c.amount, eb.s.atk));
  });
});
