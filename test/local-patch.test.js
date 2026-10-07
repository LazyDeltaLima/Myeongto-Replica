// test/local-patch.test.js — the local patch (server/local-patch.js, server/sim/content/local-patch.js,
// shared/local.js, the chat / faction / emote-set / resource-download client modules), kept out of the upstream test
// files so that merging upstream releases stays conflict-free. Boots real servers in-process on random ports like
// test/lobby.test.js.

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
import * as bossesMod from '../server/sim/content/bosses.js';
import { BOSS_HIT_LIMIT } from '../shared/constants.js';
import { COLS } from '../server/sim/constants.js';

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

describe('operator voice: Korean / Japanese / off and the 休整期 lines on upstream #73 (tools/assets/voice.mjs, public/js/voice.js)', () => {
  test('pipeline: the Japanese twin mirrors the build voice slot for slot (rel + source folder); empty slots and voice misses are tidied', async () => {
    const { voiceTwin, tidyVoice } = await import('../tools/assets/voice.mjs');
    const leaf = (lang, dir, n) => ({ alts: [{ rel: `audio/voice/${lang}/char_002_amiya/cn_0${n}.mp3`, urls: [`https://raw.x/voice/assets/dyn/audio/sound_beta_2/${dir}/char_002_amiya/cn_0${n}.mp3`], kind: 'audio', bytes: 9 }] });
    const kr = { char_002_amiya: { start: leaf('kr', 'voice_kr', 20), place: [leaf('kr', 'voice_kr', 23), leaf('kr', 'voice_kr', 24)] } };
    const jp = voiceTwin(kr, 'kr', 'jp');
    assert.equal(jp.char_002_amiya.start.alts[0].rel, 'audio/voice/jp/char_002_amiya/cn_020.mp3');
    assert.match(jp.char_002_amiya.place[1].alts[0].urls[0], /sound_beta_2\/voice\/char_002_amiya\/cn_024\.mp3$/, 'Japanese = the default voice folder');
    assert.equal(jp.char_002_amiya.place[1].alts[0].bytes, undefined, 'no size carried over from the other dub');
    assert.equal(kr.char_002_amiya.start.alts[0].rel, 'audio/voice/kr/char_002_amiya/cn_020.mp3', 'the build voice is untouched');
    const body = { audio: { voice: { a: { select: '/k', place: ['/k1', null] }, b: { select: null } }, voiceJp: { a: { select: null, place: [] } } } };
    const resolved = { misses: ['audio.voiceJp.a.select', 'audio.voice.b.select', 'chars.x.avatar'] };
    const r = tidyVoice(body, resolved);
    assert.deepEqual(body.audio.voice, { a: { select: '/k', place: ['/k1'] } });
    assert.deepEqual(body.audio.voiceJp, {});
    assert.deepEqual(resolved.misses, ['chars.x.avatar']);
    assert.deepEqual(r, { lines: 2, missing: 2 });
  });

  test('client: preference, the chosen dub feeds audio.voice, download filter', async () => {
    const { sanitizeVoice, voiceTableOf, voiceWanted, voiceStore } = await mod('voice.js');
    const { audio } = await mod('audio.js');
    assert.deepEqual(sanitizeVoice(null), { lang: 'kr' });
    assert.deepEqual(sanitizeVoice({ lang: 'jp', vol: 2 }), { lang: 'jp' });
    assert.equal(sanitizeVoice({ lang: 'cn' }).lang, 'kr');
    const m = { audio: { voice: { c: { select: ['/k1', '/k2'] } }, voiceJp: { c: { select: '/j1' } } } };
    assert.deepEqual(voiceTableOf(m, 'kr'), m.audio.voice);
    assert.deepEqual(voiceTableOf(m, 'jp'), m.audio.voiceJp);
    assert.equal(voiceTableOf(m, 'off'), null);
    assert.equal(typeof audio.voiceTable, 'function', 'voice.js hands audio.voice() the chosen table');
    const prev = voiceStore.get();
    try {
      voiceStore.set({ lang: 'jp' });
      assert.equal(voiceWanted({ p: '/assets/audio/voice/jp/c/cn_021.mp3' }), true);
      assert.equal(voiceWanted({ p: '/assets/audio/voice/kr/c/cn_021.mp3' }), false);
      assert.equal(voiceWanted({ p: '/assets/audio/sfx/x.mp3' }), true, 'other files untouched');
      voiceStore.set({ lang: 'off' });
      assert.equal(voiceWanted({ p: '/assets/audio/voice/jp/c/cn_021.mp3' }), false);
    } finally { voiceStore.set(prev); }
  });

  test('client: 休整期 lines go through upstream audio.voice (选中 select on a piece, 部署 place on a buy) — items and tokens say nothing', async () => {
    const v = await mod('voice.js');
    const { audio } = await mod('audio.js');
    const calls = [];
    const orig = audio.voice;
    audio.voice = (id, slot, o) => { calls.push([id, slot, o?.unitKey]); return true; };
    try {
      v.voiceForPiece({ kind: 'item', id: 'x' });
      v.voiceForPiece({ kind: 'token', id: 'x' });
      v.voiceForBuy({ kind: 'item', id: 'x' });
      assert.equal(calls.length, 0);
      const { data } = await mod('data.js');
      const lookup = data.lookup;
      data.lookup = (name, id) => (name === 'chess' && id === 'chess_x' ? { charId: 'char_002_amiya' } : lookup.call(data, name, id));
      try {
        v.voiceForPiece({ kind: 'chess', id: 'chess_x', uid: 7 });
        v.voiceForBuy({ kind: 'chess', id: 'chess_x' });
      } finally { data.lookup = lookup; }
      assert.deepEqual(calls, [['char_002_amiya', 'select', 'prep:7'], ['char_002_amiya', 'place', 'prep:char_002_amiya']]);
    } finally { audio.voice = orig; }
  });

  test('client: 结算 lines wait for the won settlement (silent at a round\'s end, none for a knocked-out player)', async () => {
    const v = await mod('voice.js');
    const { audio } = await mod('audio.js');
    const { store, emptyMatch } = await mod('store.js');
    const held = { charId: 'char_002_amiya', slot: 'resultThree' };
    const won = (alive = true) => ({ victory: true, players: [{ playerId: 'p1', alive }, { playerId: 'p2', alive: true }] });
    assert.deepEqual(v.matchEndVoice(held, won(), 'p1'), held);
    assert.equal(v.matchEndVoice(held, won(false), 'p1'), null, 'knocked out during the run: nothing');
    assert.equal(v.matchEndVoice(held, { ...won(), victory: false }, 'p1'), null, 'a lost run: nothing');
    assert.equal(v.matchEndVoice(null, won(), 'p1'), null);
    assert.equal(v.matchEndVoice({ ...held, slot: 'resultLose' }, won(), 'p1').slot, 'resultTwo', '行动失败 never on a win');
    const game = readFileSync(path.join(ROOT, 'public', 'js', 'screens', 'game.js'), 'utf8');
    assert.ok(!/audio\.voice\(charId, resultVoiceSlot\(/.test(game), 'onResult no longer speaks');
    assert.match(game, /holdResultVoice\(\{ charId, slot: resultVoiceSlot\(/);
    const calls = [];
    const orig = audio.voice;
    audio.voice = (id, slot) => { calls.push([id, slot]); return true; };
    try {
      v.holdResultVoice({ charId: 'char_002_amiya', slot: 'resultTwo' });
      v.holdResultVoice({ charId: 'char_002_amiya', slot: 'resultThree' }); // the last battle's line wins
      v.playMatchEndVoice(won(), 'p1');
      v.playMatchEndVoice(won(), 'p1'); // once
      assert.deepEqual(calls, [['char_002_amiya', 'resultThree']]);
      store.set({ match: { ...emptyMatch(), public: { phase: 'PREP' } } });
      v.holdResultVoice(held);
      store.set({ match: emptyMatch() }); // left the match: the kept line goes
      v.playMatchEndVoice(won(), 'p1');
      assert.equal(calls.length, 1);
    } finally { audio.voice = orig; store.set({ match: emptyMatch() }); }
  });
});

describe('official shop look (public/js/ui/shopArt.js, css/shop-art.css)', () => {
  test('sprite variables from the web manifest (+ the local cost hexagon); none without the frames; the watermark is the 特质 type icon', async () => {
    const { data } = await mod('data.js');
    const { shopArt, garrisonMarkUrl } = await mod('ui/shopArt.js');
    const get = data.get, lookup = data.lookup;
    const ui = { 'shopCard/frame_lv1': '/f1.png', 'shopPanel/bg_close': '/c.png', 'shopPanel/refresh_bg_normal': '/r.png', 'garrisonTypeIcon/icon_gold': '/g.png' };
    try {
      let local = { groups: { 'ui/battle': { cost_bg_1: { path: '/l/c1.png' } } } };
      data.get = (n) => (n === 'assets' ? { ui } : n === 'local' ? local : get.call(data, n));
      data.lookup = (n, id) => (n === 'garrisons' && id === 'g1' ? { eventTypeIcon: 'icon_gold' } : lookup.call(data, n, id));
      const a = shopArt();
      assert.match(a.cls, /has-shop-art/);
      assert.match(a.cls, /has-shop-cost/);
      assert.match(a.style, /--sa-card-frame1:url\("\/f1\.png"\)/);
      assert.match(a.style, /--sa-cost:url\("\/l\/c1\.png"\)/);
      assert.equal(garrisonMarkUrl({ garrisonIds: ['g1'] }), '/g.png');
      assert.equal(garrisonMarkUrl({ garrisonIds: [] }), null);
      local = { groups: {} };
      data.get = (n) => (n === 'assets' ? { ui: { 'shopCard/frame_lv1': '/f1.png' } } : n === 'local' ? local : get.call(data, n));
      assert.deepEqual(shopArt(), { cls: '', style: '' }, 'without the close box / buttons the bar keeps the upstream look');
    } finally { data.get = get; data.lookup = lookup; }
  });
});

describe('official prep-screen HUD (public/js/ui/hudArt.js, css/hud-art.css)', () => {
  test('bond disc board: <max>_<tier> while active, the grey 1_0 ring otherwise; the black icon only at the top tier; no look without the sprites', async () => {
    const { data } = await mod('data.js');
    const { hudArt, bondBoardStyle, bondBoardOf } = await mod('ui/hudArt.js');
    const get = data.get;
    const ui = {};
    for (const k of ['1_0', '2_1', '2_2', '3_1', '4_4']) ui[`bondBoardIcon/${k}`] = `/b/${k}.png`;
    try {
      data.get = (n) => (n === 'assets' ? { ui } : get.call(data, n));
      assert.deepEqual(bondBoardStyle(2, 1), { style: '--bb:url("/b/2_1.png")', full: false });
      assert.deepEqual(bondBoardStyle(2, 2), { style: '--bb:url("/b/2_2.png")', full: true });
      assert.deepEqual(bondBoardStyle(3, 0), { style: '--bb:url("/b/1_0.png")', full: false });
      assert.equal(bondBoardStyle(6, 6).style, '--bb:url("/b/4_4.png")', 'more than 4 tiers: clamped to the 4-tier boards');
      // segments = units to activate (thresholds[0]), lit = units present, full disc once active (KR captures 2026-10-06)
      for (const k of ['3_2', '3_3']) ui[`bondBoardIcon/${k}`] = `/b/${k}.png`;
      assert.deepEqual(bondBoardOf([3, 6], 2, false), { style: '--bb:url("/b/3_2.png")', full: false }, 'core bond, 2 of 3: two of three segments');
      assert.deepEqual(bondBoardOf([3, 6], 6, true), { style: '--bb:url("/b/3_3.png")', full: true }, 'active at its 2nd tier: still the full disc');
      assert.deepEqual(bondBoardOf([2, 3], 1, false), { style: '--bb:url("/b/2_1.png")', full: false }, 'add-on bond: two segments');
      assert.deepEqual(bondBoardOf([2], 0, false).style, '--bb:url("/b/1_0.png")', 'nobody counted: the grey ring');
      assert.deepEqual(bondBoardOf([1], 2, false).style, '--bb:url("/b/1_0.png")', '独行 over its cap: the grey ring');
      // 界面大小 (the PC client's UI_SCALER .9–1): default .9, clamped, steps of .01
      const { sanitizeUiScale } = await mod('ui/hudArt.js');
      assert.deepEqual([sanitizeUiScale(null), sanitizeUiScale('x'), sanitizeUiScale(.5), sanitizeUiScale(1.2), sanitizeUiScale(.954)], [.9, .9, .9, 1, .95]);
      assert.deepEqual(hudArt(), { cls: '', style: '' }, 'without the round bar / ready sprites: upstream look');
      Object.assign(ui, { 'hudPanel/bg_board': '/h/b.png', 'hudPanel/bg_rest': '/h/r.png', 'prepReady/ready_bg': '/h/ok.png' });
      data.get = (n) => (n === 'assets' ? { ui: { ...ui } } : get.call(data, n));
      const a = hudArt();
      assert.equal(a.cls, 'has-hud-art');
      assert.match(a.style, /--ha-board:url\("\/h\/b\.png"\)/);
    } finally { data.get = get; }
  });
});

test('skill sounds: ON_SKILL_START first, then the ability / custom-trigger banks (tools/assets/skill-sfx.mjs)', async () => {
  const { skillStartSounds } = await import('../tools/assets/skill-sfx.mjs');
  const banks = { 'battle.ON_ABILITY_START.sk_a.2': ['a.mp3'], 'battle.ON_CUSTOM_TRIGGER.sk_b[start]': ['b.mp3'], 'battle.ON_ABILITY_START.sk_c': ['c2.mp3'] };
  const audio = { skillBanks: new Map([['sk_c', new Map([['ON_SKILL_START', ['c.mp3']]])]]), bank: (n) => banks[n] || [] };
  assert.deepEqual(skillStartSounds(audio, 'sk_c'), ['c.mp3'], 'the skill start bank wins');
  assert.deepEqual(skillStartSounds(audio, 'sk_a'), ['a.mp3'], 'numbered ability bank');
  assert.deepEqual(skillStartSounds(audio, 'sk_b'), ['b.mp3'], 'custom trigger [start]');
  assert.equal(skillStartSounds(audio, 'sk_none'), null);
});

test('/healthz through the proxy: build only, no counters (server/local-patch.js proxiedRequest)', async () => {
  const { proxiedRequest } = await import('../server/local-patch.js');
  assert.equal(proxiedRequest({ headers: { 'x-forwarded-for': '1.2.3.4' } }), true);
  assert.equal(proxiedRequest({ headers: {} }), false, 'in-container checks keep the counters');
  const srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, log: { info() {}, warn() {}, debug() {}, error() {} } });
  try {
    const url = `http://127.0.0.1:${srv.port}/healthz`;
    const direct = await (await fetch(url)).json();
    assert.ok('sockets' in direct && 'rooms' in direct && direct.build);
    const viaProxy = await (await fetch(url, { headers: { 'X-Forwarded-For': '1.2.3.4' } })).json();
    assert.deepEqual(Object.keys(viaProxy).sort(), ['app', 'build', 'local', 'ok', 'version']);
    assert.match(viaProxy.local, /^\d+\.\d+\.\d+$/, 'local version (shared/local.js LOCAL_VERSION), app = the upstream base');
    assert.equal(viaProxy.build, direct.build);
  } finally { await srv.close(); }
});

test('debug page: served only with SP_DEBUG_PAGE=1 (server/local-patch.js debugPageHidden)', async () => {
  const { debugPageHidden } = await import('../server/local-patch.js');
  for (const p of ['/debug.html', '/DEBUG.html', '/js/debug.js', '/fxlab.html', '/js/debug/arena.js', '/js/debug/sandbag.js']) {
    assert.equal(debugPageHidden(p, {}), true, `${p} hidden by default`);
    assert.equal(debugPageHidden(p, { SP_DEBUG_PAGE: '1' }), false, `${p} served with the flag`);
  }
  assert.equal(debugPageHidden('/js/render/fxplayer.js', {}), false, 'the game files stay');
  assert.equal(debugPageHidden('/', {}), false);
});

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

// ---- 胄 drone link vs 限伤 (server/sim/content/local-patch.js) -------------------------------------------------------

describe('假想敌：胄 drone link is exempt from 限伤 (server/sim/content/local-patch.js)', () => {
  const POOL = 7200000 * 4; // 隐秘核心 终极, four players: a drone = 2 % = 576 000 ≥ BOSS_HIT_LIMIT
  const GUN = chessRec({ id: 't_gun', profession: 'SNIPER', projectile: 'none', stats: { atk: 0, maxHp: 1e7, bat: 1, blockCnt: 0 }, rangeGrid: [[0, 0]], skill: null });
  const pool = (hp) => ({ hp, maxHp: hp, damage(pid, a) { this.hp = Math.max(0, this.hp - a); } });
  const field = (extra) => {
    const h = makeBattle({
      kind: 'hidden', sharedBoss: pool(POOL), content: 'generic', extraContent: extra, seed: 7, autoFinish: false, timeLimit: 600,
      defs: { chess: { t_gun: GUN } }, kits: { t_gun: () => ({ trait: { noAttack: true } }) }, units: [{ chessId: 't_gun', row: 12, col: 3 }],
      setup: (b) => { b.opts.templateId = 'act1autochess_h08_01'; },
    });
    h.step();
    const boss = h.spawn('enemy_9013_acstmk_2', { pos: [3, 10], routeIndex: 0, mods: { speedMul: 0 }, tag: 'boss' });
    boss.profile.noAttack = true;
    h.run(10.2); // 死亡集群 initCooldown 10
    const drone = h.enemies().find((e) => e.defId === 'enemy_1005_yokai');
    assert.ok(drone, 'a drone was summoned');
    return { h, boss, drone };
  };

  test('upstream: the 576 000 link is one hit over the limit and is cancelled (why the patch exists)', () => {
    const { h, drone } = field([enemiesMod, bossesMod]);
    const before = h.b.sharedBoss.hp;
    h.b.kill(drone, h.unit('t_gun'));
    assert.equal(h.b.sharedBoss.hp, before);
  });

  test('patched: the drone kill takes the full 2 % of the pool; other hits over the limit stay cancelled', () => {
    const { h, boss, drone } = field([enemiesMod, bossesMod, simPatch]);
    const before = h.b.sharedBoss.hp;
    h.b.kill(drone, h.unit('t_gun'));
    assert.ok(Math.abs(before - h.b.sharedBoss.hp - POOL * 0.02) < 1e-3, `${before - h.b.sharedBoss.hp}`);
    assert.ok(h.result().perPlayer.p1.bossDamage >= POOL * 0.02 - 1e-3, 'credited to the killer');
    const mid = h.b.sharedBoss.hp;
    h.b.loseHp(boss, BOSS_HIT_LIMIT + 1);
    h.b.dealDamage(null, boss, { amount: BOSS_HIT_LIMIT * 2, type: 'true' });
    assert.equal(h.b.sharedBoss.hp, mid, '限伤 still cancels everything else');
  });
});

// ---- 圣堂剑士 ammo (server/sim/content/local-patch.js) --------------------------------------------------------------

describe('圣堂剑士 spends ammo for 赐我力量！ (server/sim/content/local-patch.js)', () => {
  const KEY = simPatch.HLCHGR;
  const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 2e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
  const arena = (extra) => makeBattle({
    content: 'generic', extraContent: extra, seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { t_wall: WALL } }, kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units: [{ chessId: 't_wall', row: 10, col: 3 }],
  });
  const put = (h) => h.spawn(KEY, { pos: [10, 8], routeIndex: 0, mods: { speedMul: 0 } });
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);
  const ATK = 400;

  test('upstream: the 6 s timer enhances even while stunned and shows no ammo (drop the patch when this fails)', async () => {
    const { unitTuple } = await import('../server/sim/snapshot.js');
    const h = arena([enemiesMod]);
    h.step();
    const e = put(h);
    h.b.applyStatus(e, 'stun', { duration: 99 });
    h.run(6.1);
    near(e.s.atk, ATK * 1.2);
    assert.equal(unitTuple(e, h.b.time)[6], 0, 'no SP / ammo bar');
  });

  test('5 ammo shown as its SP; every 6 s one cast: ammo −1, ATK +20 %, move speed ×(1 + 20 % × casts), Skill clip; stops at 0 ammo', async () => {
    const { unitTuple } = await import('../server/sim/snapshot.js');
    const { ANIM } = await import('../shared/constants.js');
    const h = arena([enemiesMod, simPatch]);
    h.step();
    const e = put(h);
    const t0 = h.b.time;
    let tu = unitTuple(e, h.b.time);
    assert.deepEqual([tu[5], tu[6]], [5, 5], 'ammo 5 / 5');
    h.run(5.9);
    near(e.s.atk, ATK);
    h.runUntil(() => e.s.atk > ATK, 1);
    assert.ok(Math.abs(h.b.time - t0 - 6) < 0.06, `first cast at 6 s (${h.b.time - t0})`);
    tu = unitTuple(e, h.b.time);
    assert.equal(tu[5], 4, 'one bullet spent');
    assert.equal(tu[8], ANIM.SKILL, 'plays its Skill clip');
    near(e.s.atk, ATK * 1.2);
    h.run(30);
    near(e.s.atk, ATK * 2);
    assert.equal(e.findBuff('ab:enhance').mods.moveMul, 2, 'FINAL_SCALER move speed 100 % + 5 × 20 %');
    assert.equal(unitTuple(e, h.b.time)[5], 0, 'out of ammo');
    h.run(30);
    near(e.s.atk, ATK * 2);
  });

  test('a trigger while stunned fails: no bullet spent, tried again 6 s later', async () => {
    const { unitTuple } = await import('../server/sim/snapshot.js');
    const h = arena([enemiesMod, simPatch]);
    h.step();
    const e = put(h);
    h.run(5);
    h.b.applyStatus(e, 'stun', { duration: 2 });
    h.run(2);
    near(e.s.atk, ATK);
    assert.equal(unitTuple(e, h.b.time)[5], 5);
    h.run(5.1);
    near(e.s.atk, ATK * 1.2);
    assert.equal(unitTuple(e, h.b.time)[5], 4);
  });

  test('real match path (悬赏·特异II enemyeffect_18_4 → buildBattleSpec → createBattleFromSpec): ammo bar and casts', async () => {
    const { makeMatch, DATA } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const { bountyOf } = await import('../server/sim/content/choices.js');
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 11 }).start();
    h.toPrep(1);
    const m = h.m, ps = h.ps('p_0');
    m.addBounty(ps, bountyOf(DATA.effects.enemyeffect_18_4));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp_hl', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    const seen = [];
    let spawnT = null;
    while (!b.finished && b.time < 60) {
      b.step(); b.drainEvents();
      const e = b.enemies.find((x) => x.defId === KEY && x.alive);
      if (!e) continue;
      if (spawnT == null) spawnT = b.time;
      const row = b.snapshot().units.find((u) => u[0] === e.id); // what the client draws
      if (row && (!seen.length || seen[seen.length - 1][1] !== row[5])) seen.push([+(b.time - spawnT).toFixed(1), row[5], row[6]]);
    }
    assert.ok(spawnT != null, 'the bounty 圣堂剑士 appeared');
    assert.deepEqual(seen.slice(0, 3).map((x) => x.slice(1)), [[5, 5], [4, 5], [3, 5]], JSON.stringify(seen));
  });
});

// ---- 深池暗影术师 never attacks a flying ally (server/sim/content/local-patch.js) ------------------------------------

describe('深池暗影术师 / 队长: 不会攻击飞行单位 (server/sim/content/local-patch.js)', () => {
  const WALL = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 2e7, def: 0, res: 0, blockCnt: 0 }, rangeGrid: [[0, 0]], skill: null });
  // a flying ally (the 炎佑 dragon is one) deployed after the ground wall: the engine's order (latest deployed) picks it first
  const field = (extra, key, secs = 10) => {
    const h = makeBattle({
      content: 'generic', extraContent: extra, seed: 7, autoFinish: false, timeLimit: 600,
      defs: { chess: { t_wall: WALL('t_wall'), t_wall2: WALL('t_wall2') } }, kits: { t_wall: () => ({ trait: { noAttack: true } }), t_wall2: () => ({ trait: { noAttack: true } }) },
      units: [{ chessId: 't_wall', row: 10, col: 6 }, { chessId: 't_wall2', row: 10, col: 8 }],
    });
    h.step();
    const w = h.unit('t_wall'), fly = h.unit('t_wall2');
    fly.motion = 'FLY';
    assert.ok(fly.isFlying && fly.deploySeq > w.deploySeq);
    const e = h.spawn(key, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
    h.run(secs);
    assert.ok(e.stats.attacks >= 3, 'it attacked');
    return { w, fly };
  };

  test('upstream: it shoots the flying ally (drop the patch when this fails)', () => {
    const { fly } = field([enemiesMod], 'enemy_1168_dumage');
    assert.ok(fly.stats.taken > 0);
  });

  // sweep 2026-10-06: client prefab normal-attack target filter _targetMotion 1 (ground) + PRTS 「不会攻击飞行单位」/「不可对空」,
  // upstream lets them shoot a flyer (docs/LOCAL-PATCH.md 「적 비행 유닛 공격 전수 조사」)
  const SWEPT = ['enemy_1019_jshoot', 'enemy_1019_jshoot_2', 'enemy_1023_jmage', 'enemy_1050_lslime', 'enemy_1158_divman', 'enemy_1162_magmot',
    'enemy_1183_mlasrt', 'enemy_1203_sfhu', 'enemy_1203_sfhu_2', 'enemy_1283_sgkill', 'enemy_1283_sgkill_2', 'enemy_1501_demonk', 'enemy_1517_xi',
    'enemy_2005_axetro', 'enemy_9008_acbunn', 'enemy_10027_vtsk'];
  const FLYER = { isFlying: true, ground: true, s: { flags: {} } }, GROUNDED = { isFlying: false, ground: true, s: { flags: {} } };
  const ruleOf = (extra, key) => {
    const h = makeBattle({ content: 'generic', extraContent: extra, seed: 7, autoFinish: false, timeLimit: 60, units: [] });
    h.step();
    const e = h.spawn(key, { pos: [6, 8], routeIndex: 0, mods: { speedMul: 0 } });
    h.run(0.2);
    const ct = e.profile.canTarget;
    return { air: typeof ct !== 'function' || !!ct(FLYER), ground: typeof ct !== 'function' || !!ct(GROUNDED) };
  };

  test('sweep: upstream lets every swept enemy shoot a flyer (drop a key when this fails for it)', () => {
    for (const key of SWEPT) assert.deepEqual(ruleOf([enemiesMod, bossesMod], key), { air: true, ground: true }, key);
  });

  test('sweep: patched, every swept enemy keeps ground targets and skips flyers', () => {
    for (const key of SWEPT) {
      assert.ok(simPatch.NO_AIR_KEYS.includes(key), `${key} in NO_AIR_KEYS`);
      assert.deepEqual(ruleOf([enemiesMod, bossesMod, simPatch], key), { air: false, ground: true }, key);
    }
  });

  // user decision 「공식 클라이언트를 따라 막아」: client normal attack 1 though PRTS is silent / forms or selectors mixed
  const CLIENT_ONLY = ['enemy_2010_csdcr', 'enemy_1252_lysytb_2', 'enemy_1427_lrnazg', 'enemy_1509_mousek', 'enemy_1504_cqbw', 'enemy_1516_jakill',
    'enemy_10098_crhro', 'enemy_10099_crvln', 'enemy_9014_acstma', 'enemy_9015_acstmb'];

  test('client-only: upstream lets them shoot a flyer; patched, ground only (扎罗 only in its second form)', () => {
    for (const key of CLIENT_ONLY) {
      assert.deepEqual(ruleOf([enemiesMod, bossesMod], key), { air: true, ground: true }, `upstream ${key}`);
      assert.deepEqual(ruleOf([enemiesMod, bossesMod, simPatch], key), { air: false, ground: true }, key);
    }
    const wolf = (extra) => {
      const h = makeBattle({ content: 'generic', extraContent: extra, seed: 7, autoFinish: false, timeLimit: 60, units: [] });
      h.step();
      const e = h.spawn('enemy_1535_wlfmster', { pos: [6, 8], routeIndex: 0, mods: { speedMul: 0 } });
      h.run(0.2);
      const air = () => typeof e.profile.canTarget !== 'function' || !!e.profile.canTarget(FLYER);
      const form1 = air();
      e.form = 'form2';
      return [form1, air()];
    };
    assert.deepEqual(wolf([enemiesMod, bossesMod]), [true, true], 'upstream 扎罗');
    assert.deepEqual(wolf([enemiesMod, bossesMod, simPatch]), [true, false], '扎罗: M1 has no attack filter, M2 Attack/Trigger 1');
  });

  test('a kit that picks its own attack targets (“灵幛”: everyone in reach) still skips the flyer', () => {
    const { w, fly } = field([enemiesMod, bossesMod, simPatch], 'enemy_1427_lrnazg', 16);
    assert.equal(fly.stats.taken ?? 0, 0, 'the flyer is never hit');
    assert.ok(w.stats.taken > 0, 'the ground wall is');
  });

  for (const key of ['enemy_1168_dumage', 'enemy_1168_dumage_2']) {
    test(`${key}: only the ground ally in range is shot`, () => {
      const { w, fly } = field([enemiesMod, simPatch], key);
      assert.equal(fly.stats.taken ?? 0, 0, 'the flyer is never hit');
      assert.ok(w.stats.taken > 0, 'the ground wall is');
    });
  }

  for (const [EFF, KEY] of [['enemyeffect_15_5', 'enemy_1168_dumage'], ['enemyeffect_14_4', 'enemy_1019_jshoot']]) test(`real match path (bounty ${EFF} → buildBattleSpec → createBattleFromSpec): the 炎佑 dragon is never ${KEY}'s target`, async () => {
    const { makeMatch, give, legalTileFor, DATA } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const { bountyOf } = await import('../server/sim/content/choices.js');
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 11 }).start();
    h.toPrep(1);
    const m = h.m, ps = h.ps('p_0');
    // six different 炎 operators: the bond summons the flying 炎佑 (power_bond_char_cnt 6)
    for (const id of ['chess_char_1_03_a', 'chess_char_2_04_a', 'chess_char_3_03_a', 'chess_char_3_04_a', 'chess_char_4_17_a', 'chess_char_5_03_a']) { const at = legalTileFor(m, ps, id); if (at) give(m, ps, id, 'board', at); }
    m.addBounty(ps, bountyOf(DATA.effects[EFF]));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp_du', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    const hits = [];
    b.on('damaged', (c) => { if (c.source && c.source.defId === KEY) hits.push(c.target); });
    b.start();
    let checked = false;
    while (!b.finished && b.time < 90) {
      b.step(); b.drainEvents();
      const e = b.enemies.find((x) => x.defId === KEY && x.alive);
      const y = b.allies().find((u) => u.isFlying);
      if (e && y && !checked) { checked = true; assert.equal(e.profile.canTarget(y), false, 'the dragon is filtered out'); }
    }
    assert.ok(checked, 'the bounty caster and the 炎佑 dragon met');
    assert.ok(hits.every((u) => !u.isFlying), 'no hit on a flyer');
  });
});

// ---- enemy skills whose client selector is ground only (sim/content/local-patch.js NO_AIR_PICKS + enemies.js) -----------
// EN client: the skill's Trigger / Selector _targetMotion 1 picks a ground target; a projectile whose own collision is 3
// (鼠王 唱沙 / 沙狱, “自在” 纬地经天 — PRTS 「弹道可击中飞行单位」) still hits a flyer around that target. 杰斯顿 铁砂暴's
// stuns (PRTS 「禁锢装置/飞行单位以外的我方单位」), “自在” 破桎而出 (「所有非飞行我方单位」) and “巨大的丑东西”'s 重生 bomb
// (bomb[reborning]/Trigger 1) are ground only. docs/LOCAL-PATCH.md 「적 비행 유닛 공격 전수 조사」.

describe('enemy skills with a ground-only client selector skip a flying ally', () => {
  const ALLY = (id, maxHp) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp, def: 0, res: 0, blockCnt: 0 }, rangeGrid: [[0, 0]], skill: null });
  // allies: [chessId, row, col, maxHp, flying]
  const field = (extra, allies, key, pos, mods = {}) => {
    const chess = {}, kits = {};
    for (const [id, , , hp] of allies) { chess[id] = ALLY(id, hp); kits[id] = () => ({ trait: { noAttack: true } }); }
    const h = makeBattle({
      content: 'generic', extraContent: extra, seed: 7, autoFinish: false, timeLimit: 600, hooks: ['damaged', 'statusApplied'], captureNoisy: true,
      defs: { chess }, kits, units: allies.map(([chessId, row, col]) => ({ chessId, row, col })),
    });
    h.step();
    const u = {};
    for (const [id, , , , fly] of allies) { u[id] = h.unit(id); if (fly) u[id].motion = 'FLY'; assert.equal(u[id].isFlying, !!fly, id); }
    const e = h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0, hpMul: 1e3, ...mods } });
    return { h, u, e };
  };
  const fireSkills = (e) => { for (const a of e.mem.ab.list) if (a && a.fire && a.cd != null) a.left = 0.1; };
  const skillHits = (h, e, t) => h.hooksOf('damaged').filter((c) => c.target === t && c.source === e && c.dmg && !c.dmg.isAttack).length;
  const stuns = (h, t) => h.hooksOf('statusApplied').filter((c) => c.status === 'stun' && c.target === t).length;
  const UP = [enemiesMod, bossesMod], PATCHED = [enemiesMod, bossesMod, simPatch];

  // 鼠王: 唱沙 on the highest max HP, 沙狱 on the lowest — both flyers here; t_near flies next to the ground target
  const MOUSE = [['t_g', 10, 6, 2e7], ['t_near', 10, 7, 1e7, true], ['t_hi', 12, 2, 3e7, true], ['t_lo', 9, 10, 1e5, true]];
  const mouse = (extra) => {
    const r = field(extra, MOUSE, 'enemy_1509_mousek', [12, 9], { atkMul: 0.01 });
    r.h.run(0.5);
    fireSkills(r.e);
    r.h.run(2);
    return r;
  };
  test('鼠王 upstream: 唱沙 / 沙狱 centre on a flyer (drop NO_AIR_PICKS when this fails)', () => {
    const { h, u, e } = mouse(UP);
    assert.ok(skillHits(h, e, u.t_hi) > 0 || !!u.t_lo.findBuff('ab:sandStorm'), 'a flyer is the centre');
  });
  test('鼠王 patched: 唱沙 / 沙狱 centre on the ground unit; their projectiles (collision 3) still take the flyer next to it', () => {
    const { h, u, e } = mouse(PATCHED);
    assert.equal(skillHits(h, e, u.t_hi), 0, '唱沙 not on the highest-HP flyer');
    assert.ok(!u.t_lo.findBuff('ab:sandStorm'), '沙狱 not on the lowest-HP flyer');
    assert.ok(skillHits(h, e, u.t_g) > 0 && u.t_g.findBuff('ab:sandStorm'), 'both centre on the ground unit');
    assert.ok(skillHits(h, e, u.t_near) > 0 && u.t_near.findBuff('ab:sandStorm'), 'the flyer in the cross / circle is still hit (弹道可对空)');
  });

  // 杰斯顿 狱警: 铁砂暴 stuns up to max_target 2 in range — the ground target and (upstream) the flyer next to it
  const jakill = (extra) => {
    const r = field(extra, [['t_g', 10, 6, 2e7], ['t_fly', 10, 7, 2e7, true]], 'enemy_1516_jakill', [10, 8], { atkMul: 0.01 });
    r.h.run(40);
    return r;
  };
  test('杰斯顿 upstream: 铁砂暴 stuns the flyer too (drop NO_AIR_PICKS when this fails)', () => {
    const { h, u } = jakill(UP);
    assert.ok(stuns(h, u.t_fly) > 0);
  });
  test('杰斯顿 patched: 铁砂暴 stuns the ground unit only', () => {
    const { h, u } = jakill(PATCHED);
    assert.ok(stuns(h, u.t_g) > 0, 'the ground target is stunned');
    assert.equal(stuns(h, u.t_fly), 0, 'the flyer is not');
  });

  // “自在”: 纬地经天 on the nearest (a flyer here), 破桎而出 within 3 (the flyer inside, the ground unit outside); t_row flies on
  // the ground unit's row, out of the burst
  const XI = [['t_g', 10, 4, 2e7], ['t_row', 10, 5, 2e7, true], ['t_fly', 11, 8, 2e7, true]];
  const xi = (extra) => {
    const r = field(extra, XI, 'enemy_1517_xi', [10, 9], { atkMul: 1 });
    r.h.run(0.5);
    fireSkills(r.e);
    r.h.run(18);                                                          // the 15 s barrier holds (no ally attacks) ⇒ burst
    return r;
  };
  test('“自在” upstream: 纬地经天 centres on the nearest flyer (drop NO_AIR_PICKS when this fails)', () => {
    const { h, u, e } = xi(UP);
    assert.ok(skillHits(h, e, u.t_fly) > 0);
  });
  test('“自在” patched: no skill on the flyer; the cross on the ground unit still hits the flyer in its line (弹道可击中飞行单位)', () => {
    const { h, u, e } = xi(PATCHED);
    assert.ok(h.hooksOf('damaged').some((c) => c.source === e && c.dmg && (c.dmg.tags || []).includes('enemyAbility')), 'it cast');
    assert.equal(u.t_fly.stats.taken ?? 0, 0, 'neither the cross nor the burst on the flyer');
    assert.ok(skillHits(h, e, u.t_g) > 0, 'the cross centres on the ground unit');
    assert.ok(skillHits(h, e, u.t_row) > 0, 'its line still takes the flyer next to it');
  });

  // “巨大的丑东西”: knocked out, its 重生 bomb (radius 3, 16 s stun) 2.17 s later
  const ugly = (extra) => {
    const r = field(extra, [['t_g', 10, 6, 2e7], ['t_fly', 10, 7, 2e7, true]], 'enemy_1512_mcmstr', [10, 8], { atkMul: 0 });
    r.h.run(0.5);
    r.h.b.dealDamage(null, r.e, { amount: 1e12, type: 'true', canDodge: false });
    r.h.run(4);
    return r;
  };
  // (the bomb's filter is an edit inside enemies.js — no upstream variant to run here; before it, the flyer was stunned)
  test('“巨大的丑东西” patched: the 重生 bomb stuns the ground unit only (bomb[reborning]/Trigger 1)', () => {
    const { h, u } = ugly(PATCHED);
    assert.ok(stuns(h, u.t_g) > 0, 'the ground unit is stunned');
    assert.equal(stuns(h, u.t_fly), 0, 'the flyer is not');
  });

  test('real match path (bounty “鼠王” → buildBattleSpec → createBattleFromSpec): 唱沙 / 沙狱 never centre on the 炎佑 dragon', async () => {
    const { makeMatch, give, legalTileFor, DATA } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const { bountyOf } = await import('../server/sim/content/choices.js');
    const KEY = 'enemy_1509_mousek';
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 11 }).start();
    h.toPrep(1);
    const m = h.m, ps = h.ps('p_0');
    for (const id of ['chess_char_1_03_a', 'chess_char_2_04_a', 'chess_char_3_03_a', 'chess_char_3_04_a', 'chess_char_4_17_a', 'chess_char_5_03_a']) { const at = legalTileFor(m, ps, id); if (at) give(m, ps, id, 'board', at); }
    m.addBounty(ps, bountyOf(DATA.effects.enemyeffect_b_11));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp_mk', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    const centres = [];
    const fx = b.fx.bind(b);
    b.fx = (kind, p) => {
      if (p && ((kind === 'telegraph' && p.kind === 'driftSand') || (kind === 'zone' && p.kind === 'sandStorm'))) {
        const at = b.allies().filter((u) => (kind === 'zone' ? u.x === p.x && u.y === p.y : u.tileC === p.x && u.tileR === p.y));
        centres.push({ kind: p.kind, fly: at.length > 0 && at.every((u) => u.isFlying) });
      }
      return fx(kind, p);
    };
    b.start();
    let withDragon = 0, last = -Infinity;
    while (!b.finished && b.time < 90) {
      b.step(); b.drainEvents();
      const e = b.enemies.find((x) => x.defId === KEY && x.alive);
      const y = b.allies().find((u) => u.isFlying && u.alive);
      if (!e || !y) continue;
      e.hp = e.s.maxHp;                                                   // keep it casting
      // 炎佑 is the field's highest max HP (唱沙) — or make it the lowest (沙狱) every other cast
      if (b.time - last >= 3) { last = b.time; withDragon++; if (withDragon % 2 === 0) y.s.maxHp = 1; for (const a of e.mem.ab.list) if (a && a.fire && a.cd != null) a.left = 0.05; }
    }
    assert.ok(withDragon >= 4, `the bounty 鼠王 and the 炎佑 dragon met (${withDragon})`);
    assert.ok(centres.length >= 4, `it cast (${centres.length})`);
    assert.ok(centres.every((c) => !c.fly), JSON.stringify(centres));
  });
});

test('frozen shop: a slot a special refresh replaces stays frozen (佩佩 / 杜遥夜, server/match/effectsMeta.js setShopSlot)', async () => {
  const { makeMatch } = await import('./match/harness.js');
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 1 }).start();
  h.toPrep(1);
  const m = h.m, ps = h.ps('p_0');
  ps.bandId = 'band_pepe'; ps.funds = 99; ps.shop.upgradePrice = 0;
  assert.equal(m.handle('p_0', { t: 'g.freeze' }).ok, true);
  assert.equal(m.handle('p_0', { t: 'g.levelUp' }).ok, true); // Lv2 → 1 special refresh (free)
  assert.equal(m.handle('p_0', { t: 'g.refresh' }).ok, true);
  const chess = ps.shop.slots.filter((s) => s && s.kind === 'chess');
  assert.ok(chess.some((s) => m.gd.chess(s.id).bonds.includes('sargonShip')), 'the special refresh happened');
  assert.ok(chess.every((s) => s.frozen), 'every slot follows the frozen shop');
  ps.shop.frozen = false;
  for (const s of ps.shop.slots) if (s) s.frozen = false;
  ps.bandId = 'band_duyaoy';
  m.handle('p_0', { t: 'g.refresh' });
  assert.ok(ps.shop.slots.every((s) => !s || !s.frozen), 'an unfrozen shop stays unfrozen');
});

test('SP_DEBUG_FUNDS: parsed only as an integer 0..999, unset on deployed servers (server/local-patch.js debugFunds)', async () => {
  const { debugFunds } = await import('../server/local-patch.js');
  assert.equal(debugFunds({}), null);
  assert.equal(debugFunds({ SP_DEBUG_FUNDS: '' }), null);
  assert.equal(debugFunds({ SP_DEBUG_FUNDS: '99' }), 99);
  assert.equal(debugFunds({ SP_DEBUG_FUNDS: '0' }), 0);
  assert.equal(debugFunds({ SP_DEBUG_FUNDS: 'lots' }), null);
  assert.equal(debugFunds({ SP_DEBUG_FUNDS: '5000' }), null);
});

test('甄选 picks: banned with their bonds, rolled for their picker only (shop, promotion reward, effects such as 余), and a 信标 refuses them (server/local-patch.js, shared/diy.js)', async () => {
  await import('../server/local-patch.js');
  const { makeMatch, give, giveItem } = await import('./match/harness.js');
  const { diyEquipRefused } = await import('../shared/diy.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, loadout: { chess_diy_wang_6_a: { diy: 1 }, chess_diy_wisdel_6_a: { diy: 2 } } },
    { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true }];
  const run = (seed) => { const h = makeMatch({ mode: 'coop', seats, seed }); h.start(); h.toPrep(1); return h; };
  let off = null, on = null;
  for (let seed = 1; seed < 80 && !(off && on); seed++) { const h = run(seed); if (h.m.disabledBonds.includes('yanShip')) off ||= h; else on ||= h; }
  assert.equal(off.m.pool.entries.get('chess_diy_wang_6_a')?.left ?? 0, 0, '炎 banned → no 望');
  assert.ok(off.m.pool.entries.get('chess_diy_wisdel_6_a')?.left > 0, 'a pick of another bond stays');
  assert.ok(on.m.pool.entries.get('chess_diy_wang_6_a')?.left > 0, '炎 active → 望 in the private pool');
  const m = on.m, ps = on.ps('p_0');
  const yan = (id) => (m.gd.chess(id)?.bonds || []).includes('yanShip');
  for (let i = 0; i < 500; i++) assert.ok(!m.gd.chess(m.pool.roll(m.rngMeta, { maxTier: 6, filter: yan }))?.isDiy, 'a roll for nobody');
  const p1 = on.ps('p_1');
  let mine = 0, theirs = 0;
  for (const who of [ps, p1]) who.shop.level = 5;
  for (let i = 0; i < 300; i++) {
    if (ps.pushRewardOffer('merge')?.slots.some((x) => m.gd.chess(x.id)?.isDiy)) mine++;
    if (p1.pushRewardOffer('merge')?.slots.some((x) => m.gd.chess(x.id)?.isDiy)) theirs++;
    ps.offers.length = 0; p1.offers.length = 0;
  }
  assert.ok(mine > 0, 'the picker\'s promotion reward offers the picks');
  assert.equal(theirs, 0, 'nobody else\'s does');
  for (let i = 0; i < 200; i++) assert.ok(!m.gd.chess(m.pool.roll(m.rngMeta, { maxTier: 6, filter: yan }))?.isDiy, 'a roll for nobody after offers');
  // 余 (SERVER_MOST_BOND at round start): a 炎 row of three → a random 炎 operator, the picker's own picks included
  const yanPool = Object.values(m.gd.raw.chess).filter((c) => c.visible && !c.isGolden && c.bonds.includes('yanShip') && m.pool.has(c.chessId) && c.chessId !== 'chess_char_6_03_a');
  give(m, ps, 'chess_char_6_03_a', 'board', [10, 2]); give(m, ps, yanPool[0].chessId, 'board', [10, 3]); give(m, ps, yanPool[1].chessId, 'board', [10, 4]);
  let yuPicks = 0, yuMine = 0;
  for (let k = 0; k < 120; k++) {
    const before = new Set([...ps.hand, ...ps.temp].filter(Boolean).map((x) => x.uid));
    m.dispatch(ps, 'onRoundStart', { round: 2 });
    for (const area of [ps.hand, ps.temp]) for (let i = 0; i < area.length; i++) {
      const x = area[i];
      if (!x || before.has(x.uid)) continue;
      if (m.gd.chess(x.id)?.isDiy) { yuPicks++; if (ps.diyOwned.has(m.gd.baseIdOf(x.id))) yuMine++; }
      ps.returnCopies(x); area[i] = null;
    }
  }
  assert.ok(yuPicks > 0 && yuPicks === yuMine, `余 can grant the picker's own picks (${yuPicks})`);
  const pick = give(m, ps, 'chess_diy_wang_6_a'), beacon = giveItem(m, ps, 'chess_item_5_04_e_a');
  assert.equal(m.handle('p_0', { t: 'g.equip', itemUid: beacon.uid, targetUid: pick.uid }).error, 'BAD_TARGET');
  assert.ok(ps.find(pick.uid), 'the pick is kept');
  assert.equal(diyEquipRefused(m.gd.item('chess_item_5_04_e_b'), m.gd.chess('chess_diy_wang_6_b')), true, 'golden 信标 / elite pick');
  assert.equal(diyEquipRefused(m.gd.item('chess_item_5_04_e_a'), m.gd.chess('chess_char_6_03_a')), false, 'pool operators take it');
});

test('甄选 picks travel through the lobby: room.loadout → seat → match keeps the slot (server/lobby.js freezeLoadout)', async () => {
  class Rec extends StubMatch { constructor(opts) { super(opts); Rec.last = opts; } }
  const srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: Rec, log: { info() {}, warn() {}, debug() {}, error() {} } });
  const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
  try {
    c.id = (await c.hello('Pick')).playerId;
    assert.equal((await c.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL' })).t, 'ok');
    await c.waitFor('room.state', (s) => s.hostId === c.id);
    const r = await c.request({ t: 'room.loadout', entries: { chess_diy_wang_5_a: { diy: 1 }, chess_diy_wisdel_6_a: { diy: 2, skill: 2 } } });
    assert.equal(r.t, 'ok', JSON.stringify(r));
    assert.equal((await c.request({ t: 'room.start' })).t, 'ok');
    const seat = Rec.last.seats.find((s) => s.playerId === c.id);
    assert.equal(seat.loadout.chess_diy_wang_5_a.diy, 1, 'the slot reaches the match (it was dropped: the match then refused the whole loadout)');
    assert.equal(seat.loadout.chess_diy_wisdel_6_a.diy, 2);
  } finally { await c.terminate().catch(() => {}); await srv.close(); }
});

describe('in-game debug panel: dbg.funds / dbg.addDiy, local debug mode only (server/local-patch.js debugIntent)', () => {
  const DEBUG_ENV = { SP_DEBUG_PAGE: '1' };
  const humans = () => [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }, { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true }];
  const prep = () => { const h = makeMatch({ mode: 'coop', seats: humans(), seed: 3 }); h.start(); h.toPrep(1); return h; };

  test('debug mode: SP_DEBUG_PAGE=1 or SP_DEBUG_FUNDS, never with NODE_ENV=production', async () => {
    const { debugMode } = await import('../server/local-patch.js');
    assert.equal(debugMode({}), false, 'deployed servers set neither');
    assert.equal(debugMode({ SP_DEBUG_PAGE: '1' }), true);
    assert.equal(debugMode({ SP_DEBUG_FUNDS: '99' }), true);
    assert.equal(debugMode({ SP_DEBUG_FUNDS: 'lots' }), false);
    assert.equal(debugMode({ SP_DEBUG_PAGE: '1', SP_DEBUG_FUNDS: '99', NODE_ENV: 'production' }), false, 'the Docker image');
    assert.equal(validateC2S({ t: 'dbg.funds', on: true }), null);
    assert.equal(validateC2S({ t: 'dbg.addDiy', chessId: 'chess_diy_wang_6_b' }), null);
    assert.match(validateC2S({ t: 'dbg.addDiy', chessId: 'chess_char_1_01_a' }), /chessId/);
  });

  test('refused when debug mode is off: the intent, the lobby hook and a real server', async () => {
    const { debugIntent, onMessage } = await import('../server/local-patch.js');
    const h = prep(), ps = h.ps('p_0');
    const funds = ps.funds;
    assert.equal(debugIntent(h.m, 'p_0', { t: 'dbg.funds', on: true }, {}).error, ERR.BAD_MSG);
    assert.equal(debugIntent(h.m, 'p_0', { t: 'dbg.addDiy', chessId: 'chess_diy_wang_6_a' }, { SP_DEBUG_PAGE: '1', NODE_ENV: 'production' }).error, ERR.BAD_MSG);
    assert.equal(ps.funds, funds); assert.ok(!ps.hand.some((p) => p && /diy/.test(p.id)));
    const saved = { p: process.env.SP_DEBUG_PAGE, f: process.env.SP_DEBUG_FUNDS };
    delete process.env.SP_DEBUG_PAGE; delete process.env.SP_DEBUG_FUNDS;
    try {
      const lobby = { roomOf: () => ({ match: h.m }) };
      assert.equal(onMessage(lobby, { playerId: 'p_0' }, { t: 'dbg.addDiy', chessId: 'chess_diy_wang_6_a' }).error, ERR.BAD_MSG);
      assert.ok(!ps.hand.some((p) => p && /diy/.test(p.id)));
      const srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, log: { info() {}, warn() {}, debug() {}, error() {} } });
      const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
      try {
        await c.hello('Dbg');
        const r = await c.request({ t: 'dbg.funds', on: true });
        assert.equal(r.t, 'error'); assert.equal(r.code, ERR.BAD_MSG);
      } finally { await c.terminate().catch(() => {}); await srv.close(); }
    } finally {
      if (saved.p !== undefined) process.env.SP_DEBUG_PAGE = saved.p;
      if (saved.f !== undefined) process.env.SP_DEBUG_FUNDS = saved.f;
    }
  });

  test('dbg.funds pins the sender\'s funds (others untouched) and unpins them', async () => {
    const { debugIntent, debugView } = await import('../server/local-patch.js');
    const h = prep(), ps = h.ps('p_0'), other = h.ps('p_1');
    ps.funds = 7; other.funds = 5;
    assert.deepEqual(debugIntent(h.m, 'p_0', { t: 'dbg.funds', on: true }, DEBUG_ENV), { ok: true });
    assert.equal(ps.funds, 99);
    assert.equal(debugView(ps).fundsPin, true);
    assert.ok(ps.spend(10)); assert.equal(ps.funds, 99, 'spending never lowers it');
    assert.equal(other.funds, 5, 'another player keeps real funds');
    assert.deepEqual(debugIntent(h.m, 'p_0', { t: 'dbg.funds', on: false }, DEBUG_ENV), { ok: true });
    assert.equal(ps.funds, 99, 'unpinned: starts from the pinned value');
    assert.ok(ps.spend(4)); assert.equal(ps.funds, 95);
    assert.equal(debugView(ps).fundsPin, false);
    assert.deepEqual(debugView(ps).candidates.map((c) => c.key), ['wang', 'chen3', 'wisdel', 'oblvns', 'ascln']);
  });

  test('dbg.addDiy puts a 甄选 pick into the hand (acquireChess: merges), refuses a full hand and non-picks', async () => {
    const { debugIntent } = await import('../server/local-patch.js');
    const h = prep(), ps = h.ps('p_0');
    ps.hand.fill(null);
    const add = (chessId) => debugIntent(h.m, 'p_0', { t: 'dbg.addDiy', chessId }, DEBUG_ENV);
    assert.deepEqual(add('chess_diy_wisdel_5_b'), { ok: true });
    assert.deepEqual(ps.hand.filter(Boolean).map((p) => p.id), ['chess_diy_wisdel_5_b'], 'an elite straight into the hand');
    for (let i = 0; i < 3; i++) assert.deepEqual(add('chess_diy_wang_6_a'), { ok: true });
    const ids = ps.hand.filter(Boolean).map((p) => p.id).sort();
    assert.deepEqual(ids, ['chess_diy_wang_6_b', 'chess_diy_wisdel_5_b'], 'three normal copies merge into the elite');
    assert.equal(add('chess_char_1_01_a').error, ERR.BAD_TARGET, 'only 甄选 candidates');
    assert.equal(add('chess_nope').error, ERR.BAD_TARGET);
    while (ps.hand.includes(null)) assert.deepEqual(add('chess_diy_ascln_5_b'), { ok: true });
    assert.equal(add('chess_diy_chen3_5_a').error, ERR.HAND_FULL, 'the hand is full');
    assert.equal(ps.temp.filter(Boolean).length, 0, 'nothing spilled into temp');
  });

  test('dbg.addDiy skill / module: checked like room.loadout, written to the loadout entry the battle reads, no shop pick', async () => {
    const { debugIntent, debugView } = await import('../server/local-patch.js');
    const { tileKey } = await import('../server/match/board.js');
    const seats = humans(); seats[0].loadout = { chess_diy_wisdel_6_a: { diy: 1, skill: 1 } };
    const h = makeMatch({ mode: 'coop', seats, seed: 3 }); h.start(); h.toPrep(1);
    const m = h.m, ps = h.ps('p_0');
    ps.hand.fill(null);
    const add = (f) => debugIntent(m, 'p_0', { t: 'dbg.addDiy', ...f }, DEBUG_ENV);
    const owned = [...ps.diyOwned], poolBefore = JSON.stringify([...m.pool.entries]);
    // refused choices add nothing and change nothing
    assert.equal(add({ chessId: 'chess_diy_wang_6_b', skill: 5 }).error, ERR.BAD_TARGET, 'no S6');
    assert.equal(add({ chessId: 'chess_diy_wang_6_b', module: 'uniequip_002_wisdel' }).error, ERR.BAD_TARGET, 'another operator\'s module');
    assert.equal(add({ chessId: 'chess_diy_wang_6_a', module: 'none' }).error, ERR.BAD_TARGET, 'a normal record has no module');
    assert.equal(ps.hand.filter(Boolean).length, 0);
    assert.equal(ps.loadout.chess_diy_wang_6_a, undefined);
    // an elite 望 with S3 and no module
    assert.deepEqual(add({ chessId: 'chess_diy_wang_6_b', skill: 2, module: 'none' }), { ok: true });
    assert.deepEqual({ ...ps.loadout.chess_diy_wang_6_a }, { skill: 2, module: 'none' }, 'no 甄选 slot added');
    const piece = ps.hand.find(Boolean);
    ps.hand[ps.hand.indexOf(piece)] = null; ps.board.set(tileKey(10, 2), piece); ps.recompute();
    const u = ps.battleInput().units.find((x) => x.uid === piece.uid);
    assert.equal(u.skillIndex, 2); assert.equal(u.moduleId, 'none', 'the battle fights with the choice');
    // a pick keeps its slot; skill only for a normal record, module kept from the entry
    assert.deepEqual(add({ chessId: 'chess_diy_wisdel_6_a', skill: 2 }), { ok: true });
    assert.deepEqual({ ...ps.loadout.chess_diy_wisdel_6_a }, { skill: 2, module: 'uniequip_002_wisdel', diy: 1 });
    assert.deepEqual([...ps.diyOwned], owned, 'diyOwned unchanged');
    assert.equal(JSON.stringify([...m.pool.entries]), poolBefore, 'no pool copies taken');
    ps.shop.level = 6;
    for (let i = 0; i < 300; i++) assert.notEqual(m.gd.chess(ps._rollChessSlot()?.id)?.charId, 'char_2027_wang', 'the unpicked 望 never reaches the shop');
    const wang = debugView(ps).candidates.find((c) => c.key === 'wang');
    assert.deepEqual(wang.tiers[6].skills.map((s) => s.index), [0, 1, 2]);
    assert.equal(wang.tiers[6].skills[0].name, '取势');
    assert.deepEqual(wang.tiers[6].modules.map((x) => x.id), ['uniequip_002_wang', 'none']);
  });
});

// 频次 enemies (特殊生命值机制, content/enemies.js `times`, damage.js flag hitCount): PRTS 特殊机制 "该目标在成功受到伤害，
// 应用生命值变化时令生命值只降低1点（不论伤害多少）". User report 2026-10-06: they lost several hits at once.
describe('频次 enemies lose exactly 1 HP per damage instance (server/sim/content/kits/tier5.js 隐德来希)', () => {
  const TIMES = 'enemy_1200_msfjin'; // 青铜镜 · 30 hits
  const run = (chessId, skillIndex, { enemies, units = [], secs = 15, at = [10, 5] } = {}) => {
    const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true,
      units: [{ chessId, row: at[0], col: at[1], uid: 1, skillIndex, carryState: { sp: 999 } }, ...units],
      enemies: enemies ?? [{ key: TIMES, time: 0, route: 0, count: 3, interval: 1.5 }, { key: TIMES, time: 1, route: 1, count: 3, interval: 1.5 }] });
    // per tick: the HP a 频次 enemy lost never exceeds the damage instances it took (HP loss 流失 aside)
    let inst = new Map();
    const over = [];
    h.b.on('damaged', (c) => {
      if (c.target?.side === 'enemy' && c.type !== 'element' && c.amount > 0 && !c.dmg?.tags?.includes('hpLoss')) inst.set(c.target, (inst.get(c.target) ?? 0) + c.amount);
    });
    const last = new Map();
    for (let i = 0; i < Math.round(secs * 30); i++) {
      inst = new Map();
      h.step(1);
      for (const e of new Set([...last.keys(), ...h.b.enemies])) {   // (a dead enemy may already be off the list)
        if (!(e.s.flags.hitCount || e.s.flags.hitCountArts) && last.get(e) == null) continue;
        const cur = e.alive ? e.hp : 0, prev = last.get(e);
        last.set(e, cur);
        if (prev != null && prev - cur > (inst.get(e) ?? 0) + 1e-6) over.push(`${e.defId} t=${h.b.time.toFixed(2)} −${(prev - cur).toFixed(2)} for ${inst.get(e) ?? 0}`);
      }
    }
    return { h, over };
  };

  test('萃血 steals no max HP from a 频次 enemy (PRTS 备注: "无法对…拥有特殊生命值机制的敌人…生效"); others keep the steal', () => {
    const { h, over } = run('chess_char_5_06_b', 0);
    const u = h.unit('chess_char_5_06_b');
    assert.deepEqual(over, [], 'one HP per damage instance');
    const hit = h.b.enemies.filter((e) => e.hp < 30 || !e.alive);
    assert.ok(hit.length >= 1, 'she hit a 青铜镜');
    for (const e of hit) { assert.equal(e.s.maxHp, 30); assert.equal(e.findBuff(`etlchi:steal:${u.id}`), null); }
    assert.equal(u.mem.stolen ?? 0, 0, 'nothing stolen, nothing gained');
    const n = run('chess_char_5_06_b', 0, { enemies: [{ key: 'enemy_1422_lrsldr', time: 0, route: 0, count: 2, interval: 1.5 }] });
    assert.ok(n.h.unit('chess_char_5_06_b').mem.stolen > 0, 'a regular enemy still loses max HP (upstream behaviour)');
  });

  test('心烛 (S3): the loss passed on to a 频次 original is one true damage instance = 1 HP (PRTS 备注 心烛)', () => {
    const { h, over } = run('chess_char_5_06_b', 2);
    assert.deepEqual(over, [], 'one HP per damage instance');
    const passed = h.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes('etlchiCandle'));
    assert.ok(passed.length >= 1, 'a candle passed damage on');
    assert.ok(passed.every((d) => d.amount === 1 && d.dmg.sourceless && d.type === 'true'), passed.map((d) => d.amount).join(','));
  });
});

describe('荒芜拉普兰德 S3 wolves: the drones\' positions reach the client (kits/tier6.js hook, render/fxgame.js)', () => {
  test('S3 sends whitw2Drones with one (x, y) per drone every 0.15 s; the fallback draws nothing for it', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const { FX_KINDS } = await import('../public/js/render/fx.js');
    const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true,
      units: [{ chessId: 'chess_char_6_18_a', row: 11, col: 4, uid: 1, skillIndex: 2, carryState: { sp: 999 } }],
      enemies: [{ key: 'enemy_1422_lrsldr', time: 0, route: 0, count: 6, interval: 1.2 }] });
    const ev = [];
    for (let i = 0; i < 600 && ev.filter((e) => e[0] === 'fx' && e[1] === 'whitw2Drones').length < 5; i++) { h.b.step(); ev.push(...h.b.drainEvents()); }
    const pos = ev.filter((e) => e[0] === 'fx' && e[1] === 'whitw2Drones');
    assert.ok(pos.length >= 5, 'positions while S3 runs');
    const u = h.unit('chess_char_6_18_a');
    const last = pos[pos.length - 1][4];
    assert.equal(last.id, u.id);
    assert.equal(last.d.length, 2 * u.mem.drones.length, 'one (x, y) per drone');
    assert.ok(last.d.every(Number.isFinite));
    assert.equal(FX_KINDS.whitw2Drones?.a, 'none');
  });
});

describe('kit skill hit sounds (tools/assets/kit-sfx.mjs → sfx.kit, public/js/audio.js kitHitKey)', () => {
  test('every kit hit key has its official sound in the manifest; 维什戴尔 has her normal hit (projectile_chr_wisdel_default)', async () => {
    const { KIT_HIT_BANKS } = await import('../tools/assets/kit-sfx.mjs');
    const { readFileSync } = await import('node:fs');
    const m = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
    for (const key of Object.keys(KIT_HIT_BANKS)) assert.match(m.audio.sfx.kit?.[key] || '', /\/p_(imp|atk)\/.+\.mp3$/, key);
    assert.match(m.audio.sfx.units.char_1035_wisdel.hit, /p_imp_dkmrcaygn_n\.mp3$/);
  });

  test('the kits\' fx events map to their keys (and nothing else does)', async () => {
    const { kitHitKey } = await import('../public/js/audio.js');
    const units = new Map([[1, { def: 'char_1050_chen3' }], [2, { def: 'char_1035_wisdel' }], [3, { def: 'token_10035_wisdel_wward' }],
      [4, { def: 'char_1038_whitw2', skillIndex: 2 }], [5, { def: 'char_4182_oblvns' }], [6, { def: 'char_263_skadi' }]]);
    const of = (id) => units.get(id);
    const cases = [
      ['zone', { token: 'token_10064_wang_stone1', skill: 3 }, 'wang:3'], ['zone', { token: 'token_10064_wang_stone1', skill: 1 }, 'wang:1'],
      ['wangLink', { first: true }, 'wang:link'], ['wangLink', { first: false }, null],
      ['kitHit', { k: 'chen3:s3', id: 1 }, 'chen3:s3'], ['swordStorm', { id: 1 }, 'chen3:s2'], ['swordStorm', { x: 1 }, null],
      ['bombardShell', { id: 2 }, 'wisdel:s2'], ['explode', { by: 2 }, 'wisdel:bomb'], ['explode', { by: 6 }, null],
      ['burst', { id: 3 }, 'wisdel:token'], ['burst', { id: 5 }, null],
      ['oblvnsNote', { e: 'hit', m: 'piano', id: 5 }, 'oblvns:piano'], ['oblvnsNote', { e: 'born', m: 'piano', id: 5 }, null],
      ['drone', { id: 4 }, 'whitw2:s3'], ['drone', { id: 6 }, null], ['zone', { token: 'x', skill: 1 }, null],
    ];
    for (const [fx, ex, want] of cases) assert.equal(kitHitKey(fx, ex, of), want, `${fx} ${JSON.stringify(ex)}`);
  });
});

describe('operator voice: the official scheduling (public/js/voicePolicy.js over audio.js VoiceGate, owner 2026-10-06)', () => {
  test('gate: no global gap, same priority overlaps by type, AUTO skills 10 s / MANUAL 0 s, 60 / 50 by SP cost', async () => {
    const { OfficialVoiceGate, skillVoiceType } = await import('../public/js/voicePolicy.js');
    const g = new OfficialVoiceGate();
    assert.equal(g.request('place', 1, 0), 'play');
    g.start('place', 1, 0); g.release();
    assert.equal(g.request('place', 2, 10), 'play', 'no global gap between two lines');
    g.start('skill1', 'a', 20, 'SKILL_ACTIVE');
    assert.equal(g.request('skill2', 'b', 30, 'SKILL_ACTIVE'), 'preempt', 'SKILL_ACTIVE overlaps an equal line');
    assert.equal(g.request('skill2', 'b', 30, 'SKILL_PASSIVE_IMP'), 'drop', 'a lower line is dropped');
    assert.equal(g.request('start', 'b', 30), 'preempt', 'a higher line takes over');
    g.release();
    g.start('skill1', 'a', 100, 'SKILL_PASSIVE_IMP'); g.release();
    assert.equal(g.request('skill3', 'a', 5000, 'SKILL_PASSIVE_IMP'), 'drop', 'AUTO skill: 10 s per operator');
    assert.equal(g.request('skill3', 'a', 10100, 'SKILL_PASSIVE_IMP'), 'play');
    g.start('skill1', 'a', 200, 'SKILL_ACTIVE'); g.release();
    assert.equal(g.request('skill1', 'a', 201, 'SKILL_ACTIVE'), 'play', 'MANUAL skill: no cooldown');
    g.start('faceEnemy', 'x', 300); 
    assert.equal(g.request('faceEnemy', 'y', 301), 'drop', 'ENCOUNTER_ENEMY does not overlap');
    assert.equal(skillVoiceType({ skillType: 'MANUAL', spCost: 3 }), 'SKILL_ACTIVE');
    assert.equal(skillVoiceType({ skillType: 'AUTO', spCost: 10 }), 'SKILL_PASSIVE_IMP');
    assert.equal(skillVoiceType({ skillType: 'AUTO', spCost: 9 }), 'SKILL_PASSIVE_NOR');
  });

  test('battle events: one 行动出发 and no 部署 burst, 行动开始 once per battle, a random 作战中 typed by the skill', async () => {
    const { AudioManager } = await import('../public/js/audio.js');
    const { OfficialVoiceGate, createVoicePolicy } = await import('../public/js/voicePolicy.js');
    const a = new AudioManager({ getManifest: () => ({ audio: { sfx: { units: {}, battle: {} } } }), win: null });
    a.ctx = {};                                        // handleBattleEvents only needs a context to run
    const said = [];
    a.voice = (id, slot, o = {}) => { said.push([id, slot, o.type ?? null]); return true; };
    a.voiceGate = new OfficialVoiceGate();
    let r = 0;
    a.voicePolicy = createVoicePolicy({
      skillOf: () => ({ skillType: 'AUTO', spCost: 4 }), slotsOf: () => ['start', 'skill1', 'skill2', 'skill3'],
      random: () => [0.9, 0.1][r++ % 2],
    });
    const ops = [1, 2, 3].map((id) => ({ id, spine: `char_${id}`, defId: `chess_${id}`, kind: 'op', side: 'ally', skillIndex: 0 }));
    a.setFieldUnits(ops);
    a.handleBattleEvents([['deploy', 1], ['deploy', 2], ['deploy', 3]]);
    assert.deepEqual(said.map((x) => x[1]), ['start'], 'one 行动出发, the opening deployment silent');
    a.handleBattleEvents([['engage', 2], ['engage', 3]]);
    a.handleBattleEvents([['engage', 1]]);
    assert.equal(said.filter((x) => x[1] === 'faceEnemy').length, 1, '行动开始 once per battle');
    a.handleBattleEvents([['skill', 1, true], ['skill', 2, true]]);
    const skills = said.filter((x) => /^skill/.test(x[1]));
    assert.deepEqual(skills.map((x) => x[1]), ['skill3', 'skill1'], 'a random 作战中, not skill N of the equipped skill');
    assert.ok(skills.every((x) => x[2] === 'SKILL_PASSIVE_NOR'), 'typed by the equipped skill (AUTO, SP 4)');
    a.setFieldUnits(ops);
    a.handleBattleEvents([['engage', 1]]);
    assert.equal(said.filter((x) => x[1] === 'faceEnemy').length, 2, 'a new battle may say it again');
  });
});
