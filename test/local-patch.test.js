// test/local-patch.test.js — the local patch (server/local-patch.js, server/sim/content/local-patch.js,
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
    const { hudArt, bondBoardStyle } = await mod('ui/hudArt.js');
    const get = data.get;
    const ui = {};
    for (const k of ['1_0', '2_1', '2_2', '3_1', '4_4']) ui[`bondBoardIcon/${k}`] = `/b/${k}.png`;
    try {
      data.get = (n) => (n === 'assets' ? { ui } : get.call(data, n));
      assert.deepEqual(bondBoardStyle(2, 1), { style: '--bb:url("/b/2_1.png")', full: false });
      assert.deepEqual(bondBoardStyle(2, 2), { style: '--bb:url("/b/2_2.png")', full: true });
      assert.deepEqual(bondBoardStyle(3, 0), { style: '--bb:url("/b/1_0.png")', full: false });
      assert.equal(bondBoardStyle(6, 6).style, '--bb:url("/b/4_4.png")', 'more than 4 tiers: clamped to the 4-tier boards');
      assert.deepEqual(hudArt(), { cls: '', style: '' }, 'without the round bar / ready sprites: upstream look');
      Object.assign(ui, { 'hudPanel/bg_board': '/h/b.png', 'hudPanel/bg_rest': '/h/r.png', 'prepReady/ready_bg': '/h/ok.png' });
      data.get = (n) => (n === 'assets' ? { ui: { ...ui } } : get.call(data, n));
      const a = hudArt();
      assert.equal(a.cls, 'has-hud-art');
      assert.match(a.style, /--ha-board:url\("\/h\/b\.png"\)/);
    } finally { data.get = get; }
  });
});

describe('선발 오퍼레이터 — 甄选 picks (shared/diy.js, server/local-patch.js, ui/diySlots.js)', () => {
  test('data: diy.json merges into chess / tokens; records are invisible DIY picks with the slot status', async () => {
    const { loadData } = await import('../server/data.js');
    const d = loadData(path.join(ROOT, 'data'), { log: { warn() {}, error() {} } });
    const a = d.chess.chess_diy_wisdel_6_a, b = d.chess.chess_diy_wisdel_6_b;
    assert.ok(a && b, 'merged');
    assert.equal(a.diyPick, true); assert.equal(a.visible, false); assert.equal(a.isDiy, true);
    assert.deepEqual(a.status, { phase: 2, level: 1, skillLevel: 4, equipLevel: 0 });
    assert.deepEqual(b.status, { phase: 2, level: 60, skillLevel: 7, equipLevel: 3 });
    assert.equal(d.chess.chess_diy_wisdel_5_b.status.equipLevel, 1, 'tier V elite: module level 1');
    assert.equal(a.price, 4); assert.equal(a.sellPrice, 1); assert.equal(a.upgradeChessId, 'chess_diy_wisdel_6_b');
    assert.deepEqual(d.chess.chess_diy_wang_6_a.bonds, ['yanShip'], '望: 炎');
    assert.deepEqual(a.bonds, ['emptyShip'], 'others: 协防干员');
    assert.ok(d.tokens.token_10064_wang_stone1, '望\'s 棋子');
  });

  test('protocol: picks need a slot, one operator once, one chess per slot', async () => {
    const { checkLoadout } = await import('../shared/protocol.js');
    const { loadData } = await import('../server/data.js');
    const d = loadData(path.join(ROOT, 'data'), { log: { warn() {}, error() {} } });
    const g = (id) => d.chess[id];
    const ok = checkLoadout({ chess_diy_wang_6_a: { diy: 1 }, chess_diy_wisdel_5_a: { diy: 2, skill: 2 } }, g);
    assert.deepEqual(ok, { ok: true, loadout: { chess_diy_wang_6_a: { skill: 0, module: 'uniequip_002_wang', diy: 1 }, chess_diy_wisdel_5_a: { skill: 2, module: 'uniequip_002_wisdel', diy: 2 } } }, 'the first module is equipped by default');
    assert.match(checkLoadout({ chess_diy_wang_6_a: { diy: 1 }, chess_diy_wang_5_a: { diy: 1 } }, g).detail, /picked twice/);
    assert.match(checkLoadout({ chess_diy_wang_6_a: { diy: 1 }, chess_diy_chen3_6_a: { diy: 1 } }, g).detail, /taken twice/);
    assert.equal(checkLoadout({ chess_diy_wang_6_a: { skill: 1 } }, g).error, 'BAD_TARGET', 'a pick without slot is no loadout entry');
    assert.equal(checkLoadout({ chess_diy_wang_6_b: { diy: 1 } }, g).error, 'BAD_TARGET', 'elite ids are not picks');
  });

  test('match: a pick is a private pool entry (tier copies × pickers) offered only to its picker', async () => {
    await import('../server/local-patch.js');
    const { makeMatch } = await import('./match/harness.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, loadout: { chess_diy_wisdel_5_a: { skill: 2, module: 'none', diy: 1 }, chess_diy_chen3_6_a: { skill: 0, module: 'none', diy: 1 } } },
      { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'coop', seats, seed: 2 }); // 炎 active (a 炎 pick is banned with 炎)
    h.start(); h.runToPhase('PREP');
    const p0 = h.ps('p_0'), p1 = h.ps('p_1');
    assert.deepEqual([...p0.diyOwned].sort(), ['chess_diy_chen3_6_a', 'chess_diy_wisdel_5_a']);
    assert.deepEqual(h.m.pool.entries.get('chess_diy_wisdel_5_a'), { cap: 8, left: 8, tier: 5 });
    assert.deepEqual(h.m.pool.entries.get('chess_diy_chen3_6_a'), { cap: 5, left: 5, tier: 6 });
    p0.shop.level = 6; p1.shop.level = 6;
    let c0 = 0, c1 = 0;
    for (let i = 0; i < 400; i++) { if (/diy/.test(p0._rollChessSlot()?.id || '')) c0++; if (/diy/.test(p1._rollChessSlot()?.id || '')) c1++; }
    assert.ok(c0 > 0, 'the picker sees the picks'); assert.equal(c1, 0, 'nobody else does');
    assert.ok(!Object.keys(h.m.pool.tierShares(6)).length || h.m.pool.entries.has('chess_diy_wisdel_5_a'), 'shares computed, picks kept');
  });

  test('ui: placing / clearing picks (one per slot, an operator once)', async () => {
    const { placeDiy, clearDiy } = await mod('ui/diySlots.js');
    const { loadData } = await import('../server/data.js');
    const d = loadData(path.join(ROOT, 'data'), { log: { warn() {}, error() {} } });
    const g = (id) => d.chess[id];
    let e = placeDiy({ chess_char_1_01_a: { skill: 0 } }, 'chess_diy_wang_6_a', 1, g);
    assert.deepEqual(e.chess_diy_wang_6_a, { diy: 1 });
    e = placeDiy(e, 'chess_diy_chen3_6_a', 1, g);
    assert.equal(e.chess_diy_wang_6_a, undefined, 'the slot\'s previous pick leaves');
    e = placeDiy(e, 'chess_diy_chen3_5_a', 2, g);
    assert.equal(e.chess_diy_chen3_6_a, undefined, 'the same operator moves to the new slot');
    assert.deepEqual(clearDiy(e, 5, 2, g), { chess_char_1_01_a: { skill: 0 } });
  });

  test('ui: export / import / reload keep the picks (loadoutModel parseStored, hasDiyPicks)', async () => {
    const { serializeExport, parseImport, parseStored, toStored } = await mod('ui/loadoutModel.js');
    const { hasDiyPicks } = await import('../shared/diy.js');
    const { loadData } = await import('../server/data.js');
    const d = loadData(path.join(ROOT, 'data'), { log: { warn() {}, error() {} } });
    const g = (id) => d.chess[id];
    const entries = { chess_diy_wang_6_a: { diy: 1 }, chess_diy_wisdel_5_a: { diy: 2, skill: 2 } };
    assert.deepEqual(parseImport(serializeExport(entries)), { ok: true, entries }, 'export → import round trip');
    assert.deepEqual(parseStored(toStored(entries)), entries, 'localStorage reload');
    assert.deepEqual(parseStored({ v: 1, entries: { a: { diy: 3 }, b: { diy: '1' }, c: { diy: 0, skill: 1 } } }), { c: { skill: 1 } }, 'bad slots dropped');
    assert.equal(hasDiyPicks(entries, g), true, 'picks alone enable the export button');
    assert.equal(hasDiyPicks({ chess_char_1_01_a: { skill: 0 } }, g), false);
  });

  test('effects: prefab groups and the event mapping by the client names', async () => {
    const { fxBundleOf, effectGroups, effectsFor } = await mod('render/fxmap.js');
    assert.equal(fxBundleOf('char_1050_chen3'), 'chen3');
    const list = ['chen3_attack_start_01', 'chen3_attack_hit_01', 'chen3_skill_01_start_01', 'chen3_skill_01_start_02', 'chen3_skill_01_buff_01',
      'chen3_skill_02_B_buff_02', 'chen3_skill_02_buff_01', 'chen3_skill_02_hit_01', 'chen3_skill_01_start_01_sale#10', 'chen3_buff_start_01'];
    const g = effectGroups(list);
    assert.ok(!g.skill1.some((p) => p.includes('#')), 'skin variants dropped');
    assert.deepEqual(effectsFor(list, 'skillStart', 0), ['chen3_skill_01_start_01', 'chen3_skill_01_start_02']);
    assert.deepEqual(effectsFor(list, 'skillBuff', 1), ['chen3_skill_02_buff_01']);
    assert.deepEqual(effectsFor(list, 'attackHit'), ['chen3_attack_hit_01']);
    // attack names vary: _attack_01_start / _hit, yu_attack_01 + yu_hit_01, alternatives _a/_b/_c, a key holding "hit"
    assert.deepEqual(effectsFor(['wang_attack_01_start', 'wang_attack_01_hit', 'wang_attack_01_trail'], 'attackStart'), ['wang_attack_01_start']);
    assert.deepEqual(effectsFor(['yu_attack_01', 'yu_hit_01', 'yu_skill3_hit_01'], 'attackHit'), ['yu_hit_01']);
    assert.deepEqual(effectsFor(['wisdel_attack_a_start', 'wisdel_attack_b_start', 'wisdel_attack_down_a_start'], 'attackStart'), ['wisdel_attack_a_start']);
    assert.deepEqual(effectsFor(['whitw2_attack_01_start', 'whitw2_hit_01'], 'attackStart'), ['whitw2_attack_01_start']);
    assert.deepEqual(effectsFor(['qiubai_attack_combat_A_start_01', 'qiubai_attack_start_01'], 'attackStart'), ['qiubai_attack_start_01']);
  });

  test('丰川祥子 notes: client trail / hit prefab per sim note mode; the drawn flight is the sim\'s (render/fxmap.js NOTE_FX)', async () => {
    const { noteEffects, NOTE_FX, NOTE_FLIGHT } = await mod('render/fxmap.js');
    const { OBLVNS_NOTE } = await import('../server/sim/content/kits/diy.js');
    // EN client projectile_chr_oblvns* `_mainEffect` / `_effectsWhenHit`
    assert.deepEqual(noteEffects('base'), { trail: 'oblvns_attack_01_trail', hit: 'oblvns_attack_01_hit' });
    assert.deepEqual(noteEffects('talent'), { trail: 'oblvns_talent_trail', hit: 'oblvns_attack_01_hit' });
    assert.deepEqual(noteEffects('s1', 1), { trail: 'oblvns_skill_01_trail', hit: 'oblvns_skill_01_hit' });
    assert.deepEqual(noteEffects('s1', 8), { trail: 'oblvns_skill_01_trail_08', hit: 'oblvns_skill_01_hit' });
    assert.deepEqual(noteEffects('piano'), { trail: 'oblvns_skill_02_trail_02', hit: 'oblvns_skill_02_hit_02' });
    assert.deepEqual(noteEffects('organ'), { trail: 'oblvns_skill_02_trail', hit: 'oblvns_skill_02_hit' });
    assert.deepEqual(noteEffects('s3'), { trail: 'oblvns_skill_03_trail_02', hit: 'oblvns_skill_03_hit_02' });
    assert.deepEqual(noteEffects('s3m'), { trail: 'oblvns_skill_03_trail', hit: 'oblvns_skill_03_hit' });
    assert.equal(noteEffects('nope'), null);
    assert.deepEqual(Object.keys(NOTE_FX).sort(), Object.keys(OBLVNS_NOTE).sort(), 'one effect per sim note mode');
    for (const [k, f] of Object.entries(OBLVNS_NOTE)) {
      for (const p of ['free', 'track', 'turn']) assert.equal(NOTE_FLIGHT[k][p], f[p], `${k}.${p}`);
      assert.equal(NOTE_FLIGHT[k].sine ?? 0, f.sine ?? 0, `${k}.sine`);
    }
    const idx = path.join(ROOT, 'public/assets/local/fx/index.json');
    if (existsSync(idx)) { // the extracted bundle (local client files only)
      const { default: index } = await import(pathToFileURL(idx).href, { with: { type: 'json' } });
      const have = new Set(index.bundles.oblvns || []);
      for (const m of Object.keys(NOTE_FX)) for (let i = m === 's1' ? 1 : 0; i <= (m === 's1' ? 8 : 0); i++) {
        const fx = noteEffects(m, i);
        assert.ok(have.has(fx.trail) && have.has(fx.hit), `${m}${i || ''}: ${fx.trail} / ${fx.hit} extracted`);
      }
    }
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
    assert.deepEqual(Object.keys(viaProxy).sort(), ['app', 'build', 'ok', 'version']);
    assert.equal(viaProxy.build, direct.build);
  } finally { await srv.close(); }
});

test('debug page: served only with SP_DEBUG_PAGE=1 (server/local-patch.js debugPageHidden)', async () => {
  const { debugPageHidden } = await import('../server/local-patch.js');
  for (const p of ['/debug.html', '/DEBUG.html', '/js/debug.js', '/fxlab.html']) {
    assert.equal(debugPageHidden(p, {}), true, `${p} hidden by default`);
    assert.equal(debugPageHidden(p, { SP_DEBUG_PAGE: '1' }), false, `${p} served with the flag`);
  }
  assert.equal(debugPageHidden('/js/render/fxplayer.js', {}), false, 'the game files stay');
  assert.equal(debugPageHidden('/', {}), false);
});

describe('선발 오퍼레이터 kits (server/sim/content/kits/diy.js)', () => {
  const ENEMY = 'enemy_1422_lrsldr';
  const battle = async (chessId, skillIndex, r, c, extra = [], secs = 25) => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true,
      units: [{ chessId, row: r, col: c, uid: 1, skillIndex, carryState: { sp: 999 } }, ...extra],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 1.2 }, { key: ENEMY, time: 1, route: 1, count: 6, interval: 1.6 }] });
    h.run(secs);
    return h;
  };
  const tagged = (h, tag) => h.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes(tag)).length;
  const stone = (row, col, uid) => ({ kind: 'token', tokenId: 'token_10064_wang_stone1', ownerUid: 1, row, col, uid });
  const POS = { wang: [11, 3], chen3: [10, 4], wisdel: [11, 4], oblvns: [10, 4], ascln: [10, 4] };

  test('every candidate × skill: its own kit spec, casts, deals damage, no content errors', async () => {
    for (const [key, [r, c]] of Object.entries(POS)) {
      for (const sk of [0, 1, 2]) {
        const id = `chess_diy_${key}_6_b`;
        // 望 S3: one lone (never activated) prep stone — S3 needs a placed one, and with its x-1 passive area two linked
        // stones by the lane clear the waves before she ever casts
        const wangStones = sk < 2 ? [stone(10, 6, 50), stone(10, 7, 51)] : [stone(10, 6, 50)];
        const h = await battle(id, sk, r, c, key === 'wang' ? wangStones : []);
        const u = h.unit(id);
        assert.equal(h.b.errors.length, 0, `${key} S${sk + 1}: ${h.b.errors[0]?.error?.message || ''}`);
        assert.equal(u.kit?.skillSource, 'skills', `${key} S${sk + 1} uses its hand spec`);
        assert.ok(h.hooksOf('skillStart').some((x) => x.unit === u), `${key} S${sk + 1} casts`);
        const dealt = h.hooksOf('damaged').filter((d) => d.source === u || d.source?.ownerUnit === u).reduce((a, d) => a + (d.amount || 0), 0);
        assert.ok(dealt > 0, `${key} S${sk + 1} deals damage`);
      }
    }
  });

  test('赤刃明霄陈: S3 剑气 travels and hits; S2 slashes ≥ 10 then 【移动】; S1 silences', async () => {
    assert.ok(tagged(await battle('chess_diy_chen3_6_b', 2, 10, 4), 'chen3Qi') > 0, 'the 剑气 hits');
    const h2 = await battle('chess_diy_chen3_6_b', 1, 10, 4);
    assert.ok(tagged(h2, 'chen3S2') >= 10, '10 slashes (+1 per kill)');
    assert.equal(h2.hooksOf('deploy').filter((d) => d.unit === h2.unit('chess_diy_chen3_6_b') && d.move).length, 1, 'moves to the target tile');
    assert.ok((await battle('chess_diy_chen3_6_b', 0, 10, 4)).hooksOf('statusApplied').some((s) => (s.key ?? s.status) === 'silence'));
  });

  test('维什戴尔: 残影 explodes on aftershocks; the 魂灵之影 hits; S3 summons more shades (≤ 3)', async () => {
    const h = await battle('chess_diy_wisdel_6_b', 2, 11, 4);
    assert.ok(tagged(h, 'wisdelBomb') > 0 && tagged(h, 'summon') > 0);
    const shades = h.b.allies(h.unit('chess_diy_wisdel_6_b').ownerId).filter((a) => a.kind === 'token' && a.defId === 'token_10035_wisdel_wward');
    assert.ok(shades.length > 1 && shades.length <= 3, `shades ${shades.length}`);
  });

  test('阿斯卡纶: 死亡拘审 stacks tick arts damage', async () => {
    assert.ok(tagged(await battle('chess_diy_ascln_6_b', 1, 10, 4), 'dot') > 0);
  });

  test('丰川祥子: S2 switches the timbre on each cast', async () => {
    const h = await battle('chess_diy_oblvns_6_b', 1, 10, 4, [], 30);
    const casts = h.hooksOf('skillStart').filter((x) => x.unit === h.unit('chess_diy_oblvns_6_b')).length;
    assert.ok(casts >= 1);
    assert.equal(h.unit('chess_diy_oblvns_6_b').mem.timbre, casts % 2 ? 'organ' : 'piano');
  });

  // 丰川祥子 talents (namu 4.6 + PRTS 备注, 2026-10-05): 持续攻击 with no enemy, notes, ASPD aura incl. herself, LOR-Y
  describe('丰川祥子 talents', () => {
    const solo = async (id, sk, { flat, enemies = [], defs, secs = 6 } = {}) => {
      const { makeBattle } = await import('./helpers/battleHarness.js');
      const h = makeBattle({ seed: 5, timeLimit: Math.max(60, secs + 10), captureNoisy: true, flat, defs, enemies,
        units: [{ chessId: id, row: 10, col: 4, uid: 1, skillIndex: sk }] });
      h.run(secs);
      return h;
    };
    const blankAtks = (h, u) => h.eventsOf('atk').filter((e) => e[1] === u.id && e[2] == null).length;

    test('持续攻击: attacks with no enemy in range — attack SP, notes stack; ASPD aura on herself (data value)', async () => {
      const { default: DIY } = await import('../data/diy.json', { with: { type: 'json' } });
      for (const id of ['chess_diy_oblvns_5_a', 'chess_diy_oblvns_6_b']) {
        const h = await solo(id, 1);
        const u = h.unit(id);
        assert.equal(h.b.errors.length, 0);
        assert.ok(blankAtks(h, u) >= 4, `${id}: keeps attacking (${blankAtks(h, u)})`);
        assert.ok(u.skill.sp >= 4, `${id}: attack-type SP from the empty attacks (${u.skill.sp})`);
        assert.ok(u.mem.notes >= 1, `${id}: the notes count`);
        const t1 = DIY.chess[id].talents.find((t) => t.index === 1).bb;
        assert.equal(u.findBuff('oblvns:aspd')?.mods?.aspd, t1.attack_speed, `${id}: 毋畏遗忘 ASPD on herself`);
      }
    });

    test('持续攻击: no note while the tile in front has 通行类型 无', async () => {
      const id = 'chess_diy_oblvns_6_b';
      const wall = (row) => row.slice(0, 5) + 'X' + row.slice(6);
      const base = (await import('./helpers/battleHarness.js')).flatStage().rows;
      const rows = {}; for (const r of [9, 10, 11, 12]) rows[r] = wall(base[r]);
      const h = await solo(id, 1, { flat: { rows } });
      const u = h.unit(id);
      assert.equal(blankAtks(h, u), 0);
      assert.equal(u.skill.sp, 0);
    });

    test('持续攻击 under S3: a blank attack plays 2 piano notes at the S3 attack@atk_scale, phys (the skill override; review 2026-10-06)', async () => {
      const { default: DIY } = await import('../data/diy.json', { with: { type: 'json' } });
      const { makeBattle } = await import('./helpers/battleHarness.js');
      const id = 'chess_diy_oblvns_6_b';
      const scale = DIY.chess[id].skills[2].bb['attack@atk_scale'];
      assert.ok(scale > 1);
      const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, autoFinish: false,
        enemies: [{ key: ENEMY, time: 5, route: 0, count: 3, interval: 1 }],
        units: [{ chessId: id, row: 10, col: 4, uid: 1, skillIndex: 2 }] });
      h.step(1);
      const u = h.unit(id);
      u.skill.activate('manual', { free: true });
      assert.ok(u.skill.active);
      const hits = [];
      const orig = h.b.dealDamage.bind(h.b);
      h.b.dealDamage = (src, t, d) => { if (src === u && d?.tags?.includes('blankNote') && u.skill.active) hits.push({ d, atk: u.s.atk }); return orig(src, t, d); };
      h.run(3);
      const born = h.eventsOf('fx').filter((e) => e[1] === 'oblvnsNote' && e[4].e === 'born' && e[4].m === 's3'); // s3m: the 2 organ notes, one each
      assert.ok(born.length > 0 && born.every((e) => e[4].w === 2), `S3 piano notes are 2 each (${born.map((e) => e[4].w)})`);
      h.run(12);
      assert.ok(hits.length > 0, 'a blank note landed during S3');
      for (const { d } of hits) assert.equal(d.type, 'phys');
      // two hits per blank note; each ≥ the cached ATK × S3 scale × the ranged cut of her trait (not 1.0 × ATK)
      const per = hits.map((x) => x.d.amount / x.atk);
      assert.ok(Math.max(...per) > 1.2, `amount / ATK = ${per.map((v) => v.toFixed(2))} (S3 ${scale})`);
    });

    test('持续攻击: notes in flight home on an enemy entering her range', async () => {
      const h = await solo('chess_diy_oblvns_6_b', 1, { enemies: [{ key: ENEMY, time: 6, route: 0, count: 3, interval: 1 }], secs: 25 });
      assert.ok(tagged(h, 'blankNote') > 0);
    });

    // notes (local patch 2026-10-06, EN client projectile_chr_oblvns* + PRTS 备注; kits/diy.js NOTE)
    const noteEvents = (h) => {
      const m = new Map();
      for (const e of h.eventsOf('fx')) {
        if (e[1] !== 'oblvnsNote') continue;
        const n = m.get(e[4].n) || { mode: e[4].m, ev: [] };
        m.set(e[4].n, n);
        n.ev.push({ e: e[4].e, x: e[2], y: e[3], t: e[4].t });
      }
      return m;
    };

    test('notes: an attack lands when its note arrives (client note speed ≈ 2 tiles/s), not at the arrow speed', async () => {
      const id = 'chess_diy_oblvns_6_b';
      const log = [];
      const { makeBattle } = await import('./helpers/battleHarness.js');
      const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, units: [{ chessId: id, row: 10, col: 4, uid: 1, skillIndex: 1 }],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 3, interval: 3 }],
        setup(b) {
          b.on('attack', (c) => { if (c.attacker.defId === id && c.targets[0]) log.push({ k: 'atk', t: b.time, d: Math.hypot(c.targets[0].x - c.attacker.x, c.targets[0].y - c.attacker.y) }); });
          b.on('damaged', (c) => { if (c.source?.defId === id && c.dmg?.isAttack && !c.dmg.tags?.includes('blankNote')) log.push({ k: 'dmg', t: b.time }); });
        } });
      h.run(20);
      assert.equal(h.b.errors.length, 0);
      const a = log.find((x) => x.k === 'atk');
      assert.ok(a, 'she attacked an enemy');
      const d = log.find((x) => x.k === 'dmg' && x.t > a.t);
      assert.ok(d, 'the attack landed');
      // piano (S2 equipped, not cast yet: projectile_chr_oblvns_s2) frees 0.4 s at 1.9, then traces at 3.5 — the
      // engine arrow (14 tiles/s) would land in d / 14 s
      assert.ok(d.t - a.t >= 0.4, `lands after the free flight (${(d.t - a.t).toFixed(2)} s for ${a.d.toFixed(2)} tiles)`);
      const notes = noteEvents(h);
      assert.ok([...notes.values()].some((n) => n.ev[0].e === 'born' && n.ev.some((x) => x.e === 'track') && n.ev.at(-1).e === 'hit'), 'born → track → hit');
    });

    test('notes: untargeted notes fly on past her range and go `delay` s after leaving it; the count is the live notes', async () => {
      const id = 'chess_diy_oblvns_6_b';
      const h = await solo(id, 0, { secs: 12 });
      const u = h.unit(id);
      assert.equal(h.b.errors.length, 0);
      const notes = noteEvents(h);
      const keys = new Set(u.rangeKeys);
      const gone = [...notes.values()].filter((n) => n.ev.at(-1).e === 'gone');
      assert.ok(gone.length >= 3, `notes ended (${gone.length})`);
      for (const n of gone) {
        assert.equal(n.mode, 'talent', '持续攻击 without a skill: projectile_chr_oblvns_talent');
        // a straight free flight from her tile: where it left her range, and how far it flew on (1 s × 1.3 tiles/s)
        const [b, end] = [n.ev[0], n.ev.at(-1)];
        const L = Math.hypot(end.x - b.x, end.y - b.y), ux = (end.x - b.x) / L, uy = (end.y - b.y) / L;
        assert.ok(Math.abs(Math.atan2(uy, ux)) <= (20.5 * Math.PI) / 180, 'within ±20° of her facing (RIGHT)');
        let last = 0;
        for (let s = 0; s <= L; s += 0.01) if (keys.has(Math.round(b.y + uy * s) * COLS + Math.round(b.x + ux * s))) last = s;
        assert.ok(L - last >= 1.2 && L - last <= 1.45, `flew ${(L - last).toFixed(2)} tiles past her range before it went`);
      }
      const alive = [...notes.values()].filter((n) => !['gone', 'hit'].includes(n.ev.at(-1).e)).length;
      assert.equal(u.mem.noteList.length, alive, 'the kit keeps exactly the notes still flying');
      h.run(0.3);
      assert.equal(u.mem.notes, Math.min(10, u.mem.noteList.length), '颂乐音符 count = live notes (≤ max_cnt)');
    });

    test('notes: when she leaves, only the tracing notes stay — and still land', async () => {
      const id = 'chess_diy_oblvns_6_b';
      const { makeBattle } = await import('./helpers/battleHarness.js');
      const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, units: [{ chessId: id, row: 10, col: 4, uid: 1, skillIndex: 2, carryState: { sp: 999 } }],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 6, interval: 1 }] });
      const u = h.unit(id);
      let tracing = 0;
      for (let i = 0; i < 900 && !tracing; i++) {
        h.step(1);
        const l = u.mem.noteList || [];
        if (l.some((n) => n.state === 'track') && l.some((n) => n.state === 'free')) tracing = l.filter((n) => n.state === 'track').length;
      }
      assert.ok(tracing > 0, 'tracing and free notes in flight');
      h.b.retreat(u, { reason: 'retreat' });
      h.step(1);
      assert.ok(u.mem.noteList.length > 0 && u.mem.noteList.every((n) => n.state === 'track'), 'free notes cleared');
      const before = h.hooksOf('damaged').filter((x) => x.source === u).length;
      h.run(6);
      assert.ok(h.hooksOf('damaged').filter((x) => x.source === u).length > before, 'a tracing note still hits');
      assert.equal(u.mem.noteList.length, 0);
      assert.equal(h.b.errors.length, 0);
    });

    test('LOR-Y stage 2+: no ranged ATK cut on her attacks while a skill runs', async () => {
      const { default: DIY } = await import('../data/diy.json', { with: { type: 'json' } });
      const id = 'chess_diy_oblvns_6_b';
      const noMod = structuredClone(DIY.chess[id]);
      noMod.talents = noMod.talents.map((t) => ({ ...t, fromModule: false }));
      const enemies = [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 1.2 }, { key: ENEMY, time: 1, route: 1, count: 6, interval: 1.6 }];
      const perHit = (h) => {
        const u = h.unit(id);
        const d = h.hooksOf('damaged').filter((x) => x.source === u && x.dmg?.isAttack && x.dmg.isSkill && !x.dmg.tags?.includes('note'));
        return d.reduce((a, x) => a + x.amount, 0) / Math.max(1, d.length);
      };
      const withMod = perHit(await solo(id, 2, { enemies, secs: 25 }));
      const without = perHit(await solo(id, 2, { enemies, defs: { chess: { [id]: noMod } }, secs: 25 }));
      assert.ok(withMod > without * 1.1, `${withMod} vs ${without}`);
    });

    test('S2 满月的舞会: organ attacks deal arts damage; in Fever every attack hits twice', async () => {
      const id = 'chess_diy_oblvns_6_b';
      const h = await solo(id, 1, { secs: 160, enemies: [{ key: ENEMY, time: 0, route: 0, count: 120, interval: 1 }, { key: ENEMY, time: 0.5, route: 1, count: 120, interval: 1 }] });
      const u = h.unit(id);
      assert.equal(h.b.errors.length, 0);
      const atk = h.hooksOf('damaged').filter((x) => x.source === u && x.dmg?.isAttack && !x.dmg.tags?.includes('note'));
      assert.ok(atk.some((x) => x.type === 'arts'), 'organ: arts');
      assert.ok(atk.some((x) => x.type === 'phys'), 'piano: phys');
      assert.ok(h.eventsOf('fx').some((e) => e[1] === 'sunBurst'), 'Fever reached');
      const hits = new Map();
      for (const x of atk) if (x.dmg.attackId) hits.set(x.dmg.attackId, (hits.get(x.dmg.attackId) || 0) + 1);
      assert.ok([...hits.values()].some((n) => n >= 2), 'a Fever attack hits twice');
    });
  });

  test('望: only connected 棋子 trigger; battle start = prep layout (no 跟子); traps take no hits; used up on a trigger, back on their tile for DP (the card returns); S3 x-1 area; stones go on high ground too', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const noSp = (extra) => { // S1 not cast yet (SP 0 of 16): only the placed stones
      const b = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 0 }, ...extra],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 1.2 }, { key: ENEMY, time: 1, route: 1, count: 6, interval: 1.6 }] });
      b.run(12);
      return b;
    };
    assert.equal(tagged(noSp([stone(9, 6, 50)]), 'trap'), 0, 'a lone stone is not activated');
    assert.ok(tagged(noSp([stone(9, 6, 50), stone(9, 7, 51)]), 'trap') > 0, 'connected stones trigger');
    // six placed stones (the deploy limit): the layout at the battle start is the prep layout, also later on
    const placed = [[10, 5], [10, 6], [10, 7], [11, 5], [11, 7], [12, 6]];
    const h6 = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true,
      units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 0 }, ...placed.map(([r, c], i) => stone(r, c, 60 + i))],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 6, interval: 1.2 }, { key: 'enemy_1019_jshoot', time: 0, route: 1, count: 4, interval: 2 }] });
    const layout = () => h6.allies().filter((u) => u.kind === 'token' && u.alive).map((u) => `${u.tileR},${u.tileC}`).sort();
    const want = placed.map(([r, c]) => `${r},${c}`).sort();
    h6.step(1);
    assert.deepEqual(layout(), want, 'battle start = prep layout');
    h6.run(30);
    for (const k of layout()) assert.ok(want.includes(k), `${k}: stones only come back on their own tiles`);
    for (const t of h6.allies().filter((u) => u.kind === 'token')) assert.ok(t.s.flags.untargetable && t.s.flags.invulnerable, 'stones are traps');
    assert.equal(h6.hooksOf('damaged').filter((d) => d.target?.kind === 'token').length, 0, 'no enemy hits a stone (ranged 弩手 included)');
    // a trigger uses the stone up; it comes back on its tile after respawnTime, for its DP cost and one stone of the stock
    const hc = makeBattle({ seed: 5, captureNoisy: true, units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 0 }, stone(9, 6, 50), stone(9, 7, 51)],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 1 }, { key: ENEMY, time: 30, route: 1, count: 1 }] });
    hc.runUntil(() => tagged(hc, 'trap') > 0, 20);
    hc.step(1);
    const used = hc.b.allyUnits.find((u) => u.kind === 'token' && !u.alive);
    assert.ok(used && used.mem.wangUsed && !used.removed, 'the triggered stone is gone, waiting');
    const w = hc.unit('chess_diy_wang_6_b'), stock0 = w.mem.wang.stock;
    let dpBefore = 0;
    for (let i = 0; i < 20 / 0.05 && !used.alive; i++) { dpBefore = hc.b.players[0].dp; hc.step(1); }
    assert.ok(used.alive && used.mem.wangUsed === false, 'redeployed');
    assert.equal(w.mem.wang.stock, stock0, 'the card itself comes back: no stock spent (token deck rule)');
    assert.ok(hc.b.players[0].dp < dpBefore - 1.5, 'its DP cost paid (2 for the VI elite: module −1)');
    // S1 with stones in the stock: deployed next to hers; their 跟子 do not count under the limit (nothing withdrawn)
    const s1 = await battle('chess_diy_wang_6_b', 0, 11, 3, [stone(10, 6, 50), stone(10, 7, 51)], 30);
    const all = s1.allies().filter((u) => u.kind === 'token' && u.alive);
    assert.ok(all.some((u) => u.mem.wangFollower), '跟子 with an automatic deployment');
    assert.ok(all.filter((u) => !u.mem.wangFollower).length <= 6, 'stones ≤ maxDeployCount');
    // S3 equipped: the x-1 diamond triggers and hits (passive), flyers included
    assert.ok(tagged(await battle('chess_diy_wang_6_b', 2, 11, 3, [stone(10, 6, 50), stone(10, 7, 51)], 20), 'trap') > 0);
    const { loadData } = await import('../server/data.js');
    assert.equal(loadData(path.join(ROOT, 'data'), { log: { warn() {}, error() {} } }).tokens.token_10064_wang_stone1.position, 'ALL');
  });

  test('望 棋子: 激活 and 料敌机先 stacks are latched; with S3 a high-ground stone catches ground enemies (x-1 diamond), with S1 it does not', async () => {
    const { makeBattle, flatStage } = await import('./helpers/battleHarness.js');
    // three in a row, two of them leave before any enemy arrives: the last one stays active with 3 stacks
    const h = makeBattle({ seed: 5, captureNoisy: true, units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 0 }, stone(9, 5, 50), stone(9, 6, 51), stone(9, 7, 52)],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 3, interval: 1.2 }] });
    h.step(2);
    for (const c of [6, 7]) h.b.retreat(h.allies().find((u) => u.kind === 'token' && u.tileC === c), { reason: 'expired', permanent: true });
    h.step(1);
    const last = h.allies().filter((u) => u.kind === 'token' && u.alive);
    assert.equal(last.length, 1);
    assert.equal(last[0].mem.active, true, 'stays active');
    assert.equal(last[0].mem.line, 3, '料敌机先 keeps 3 stacks');
    let n = 0;
    h.runUntil(() => (n = h.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes('trap')).length) > 0, 15); // before S1 (16 SP)
    assert.ok(n > 0, 'the lone (latched) stone triggers');
    // 10,5 / 10,6 high ground beside the row-9 lane
    const hi = (sk) => {
      const b = makeBattle({ seed: 5, captureNoisy: true, stage: flatStage({ rows: { 10: '##hrrhhrrrfrrrrrrrf##' } }),
        units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: sk }, stone(10, 5, 50), stone(10, 6, 51)],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 6, interval: 1.2 }] });
      b.run(15);
      return b.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes('trap') && d.source?.kind === 'token').length;
    };
    assert.ok(hi(2) > 0, 'S3: the x-1 diamond reaches the lane');
    assert.equal(hi(0), 0, 'S1: tile only — ground enemies never enter a high-ground stone');
    // the S3 area is x-1 (radius-2 diamond, sktok_wang_3 prefab), not the table's x-6 cross: a stone at 10,1 (high ground
    // beside the 9,2 end of the row-9 lane, 9,1 is a wall) reaches the lane only through its diagonal
    const diag = makeBattle({ seed: 5, captureNoisy: true,
      stage: flatStage({ rows: { 10: '#hhrrrrrrrfrrrrrrrf##', 11: '#hhrrrrrrrfrrrrrrrf##' } }),
      units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 2 }, stone(10, 1, 50), stone(11, 1, 51)],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 3, interval: 1.2 }] });
    const fromCorner = () => diag.hooksOf('damaged').some((d) => d.dmg?.tags?.includes('trap') && d.source?.tileR === 10 && d.source?.tileC === 1);
    diag.runUntil(fromCorner, 60);
    assert.ok(fromCorner(), 'S3: the stone triggers through its x-1 diagonal');
  });

  test('维什戴尔 S2 过载: the main shot uses atk_scale_ol in the second half (her profile copy, not ctx.profile)', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 60, units: [{ chessId: 'chess_diy_wisdel_6_b', row: 11, col: 4, uid: 1, skillIndex: 1, carryState: { sp: 999 } }],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 30, interval: 0.8 }] });
    const u = h.unit('chess_diy_wisdel_6_b');
    const first = [], ol = [];
    h.b.on('hit', (c) => {
      if (c.source !== u || !c.dmg?.isAttack || c.dmg.isSplash || c.dmg.tags?.includes('wisdelShot') || !u.skill.active) return;
      (u.skill.timeLeft > u.skill.duration / 2 + 0.3 ? first : u.skill.timeLeft < u.skill.duration / 2 - 0.3 ? ol : []).push(c.dmg.amount / u.s.atk);
    }, { priority: 100 });
    h.run(45);
    assert.ok(first.length && ol.length, 'attacks in both halves');
    assert.ok(first.every((r) => Math.abs(r - 1) < 1e-6), 'first half: the full scale');
    assert.ok(ol.every((r) => Math.abs(r - 0.7) < 1e-6), 'overload: atk_scale_ol 0.7');
  });

  test('望 S3 follows the official rule (攻击范围扩大 = DEFAULT, owner 2026-10-06): cast before a normal attack with an enemy on her 3-3, never for one only on the 4-12', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const { absoluteRangeKeys } = await import('../server/sim/targeting.js');
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 40, units: [{ chessId: 'chess_diy_wang_6_a', row: 10, col: 3, dir: 'RIGHT', uid: 1, skillIndex: 2, carryState: { sp: 999 } }],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 6, interval: 1 }] });
    const u = h.unit('chess_diy_wang_6_a');
    assert.equal(u.skill.rule, 'DEFAULT');
    const base = new Set(absoluteRangeKeys(u.rangeGrid ?? h.b.data.chess('chess_diy_wang_6_a').rangeGrid, u.tileR, u.tileC, u.dir, 0));
    let castWithOnlyWide = false;
    h.b.on('skillStart', (c) => {
      if (c.unit !== u) return;
      const inBase = h.b.enemies.some((e) => e.alive && base.has(Math.round(e.y) * COLS + Math.round(e.x)));
      if (!inBase) castWithOnlyWide = true;
    }, { priority: 100 });
    h.runUntil(() => u.skill.active, 30);
    assert.ok(u.skill.active, 'S3 cast');
    assert.ok(!castWithOnlyWide, 'never cast while no enemy stood on her 3-3');
  });

  test('赤刃明霄陈 S3 follows the official rule (攻击范围扩大 = DEFAULT, owner 2026-10-06): no cast with only flyers around (she cannot attack them)', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const h = makeBattle({ seed: 5, captureNoisy: true, units: [{ chessId: 'chess_diy_chen3_6_b', row: 10, col: 4, uid: 1, skillIndex: 2, carryState: { sp: 999 } }],
      enemies: [{ key: 'enemy_1005_yokai', time: 0, route: 0, count: 3, interval: 1 }] });
    const u = h.unit('chess_diy_chen3_6_b');
    assert.equal(u.skill.rule, 'DEFAULT');
    h.run(30);
    assert.equal(h.hooksOf('skillStart').filter((x) => x.unit === u).length, 0, 'no S3 cast for flyers only');
  });

  test('선발 kits audit: 赤刃明霄陈 S2 never slashes an unrevealed 隐匿 enemy; 阿斯卡纶 S2 spreads 死亡拘审 on a death in range', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const { enemyStealthed } = await import('../server/sim/targeting.js');
    const h = makeBattle({ seed: 5, captureNoisy: true, units: [{ chessId: 'chess_diy_chen3_6_b', row: 10, col: 5, uid: 1, skillIndex: 1, carryState: { sp: 999 } }],
      enemies: [{ key: 'enemy_1019_jshoot', time: 0, route: 0, count: 4, interval: 0.4 }, { key: ENEMY, time: 0.2, route: 0, count: 3, interval: 1 }] });
    let bad = 0, good = 0;
    h.b.on('hit', (c) => { if (c.dmg?.tags?.includes('chen3S2')) { if (c.target.s.flags.stealth && enemyStealthed(c.target)) bad++; else good++; } }, { priority: 100 });
    h.run(25);
    assert.equal(bad, 0, 'no slash on a 隐匿 enemy');
    assert.ok(good > 0, 'the slashes wait for a selectable target');
    const a = makeBattle({ seed: 5, captureNoisy: true, units: [{ chessId: 'chess_diy_ascln_6_b', row: 10, col: 4, uid: 1, skillIndex: 1, carryState: { sp: 999 } }],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 10, interval: 0.5 }] });
    let spread = 0;
    const f = a.b.foesInRadius.bind(a.b);
    a.b.foesInRadius = (...args) => { if (Math.abs(args[2] - 1.3) < 1e-9 && args[3] === true) spread++; return f(...args); };
    a.run(30);
    assert.ok(spread > 0, 'the S2 death spread runs (rangeKeys is an array: `.has?.` never matched)');
  });

  test('赤刃明霄陈 S3 剑气 turns like the client (ChangeStateWithHighlandBehaviour: next tile highland / 侵入点 / 保护目标 / map edge within 0.25 → 90° clockwise)', async () => {
    const { chen3QiAdvance } = await import('../server/sim/content/kits/diy.js');
    const LOW = { height: 'LOW', pass: 'ALL' };
    const grid = (special = {}) => ({   // rows / cols 0..9, row 0 at the bottom (UP = +row)
      inRect: (r, c) => r >= 0 && r <= 9 && c >= 0 && c <= 9,
      tile: (r, c) => special[`${r},${c}`] || LOW,
    });
    const run = (g, st, secs) => { const turns = []; for (let i = 0; i < Math.round(secs * 30); i++) { const { d, x, y } = st; if (chen3QiAdvance(g, st, 1.5 / 30)) turns.push({ from: d, to: st.d, x, y }); } return turns; };   // x, y: where it turned (before that tick's move)
    // a highland 3 tiles ahead: the turn comes 0.25 past the centre of the last free tile (not 0.75 before the edge)
    let st = { x: 2, y: 5, d: 'RIGHT' };
    let turns = run(grid({ '5,5': { height: 'HIGH', pass: 'FLY' } }), st, 2);
    assert.deepEqual(turns.map((t) => [t.from, t.to]), [['RIGHT', 'DOWN']], 'RIGHT → DOWN (clockwise, UP = +row)');
    assert.ok(Math.abs(turns[0].x - 4.25) < 1e-6 && Math.abs(turns[0].y - 5) < 1e-9, `turned at x 4.25 (got ${turns[0].x})`);
    // 侵入点 and 保护目标 are walls; a lowland impassable tile, a teleporter and a roadblock-like tile are not
    for (const [t, wall] of [[{ height: 'LOW', pass: 'ALL', special: 'start' }, true], [{ height: 'LOW', pass: 'ALL', special: 'end' }, true],
      [{ height: 'LOW', pass: 'NONE' }, false], [{ height: 'LOW', pass: 'ALL', special: 'telin' }, false]]) {
      st = { x: 5, y: 2, d: 'UP' };
      turns = run(grid({ '4,5': t }), st, 1);
      assert.equal(turns.length > 0, wall, `${JSON.stringify(t)} ${wall ? 'turns' : 'passes'}`);
      if (wall) assert.ok(Math.abs(turns[0].y - 3.25) < 1e-6 && turns[0].to === 'RIGHT', 'UP → RIGHT at 0.25 past row 3');
    }
    // the map edge: LEFT along row 0 turns UP at 0.25 past col 0; then UP to the top edge turns RIGHT
    st = { x: 2, y: 0, d: 'LEFT' };
    turns = run(grid(), st, 9);
    assert.deepEqual(turns.slice(0, 2).map((t) => [t.from, t.to, +t.x.toFixed(2), +t.y.toFixed(2)]), [['LEFT', 'UP', -0.25, 0], ['UP', 'RIGHT', -0.25, 9.25]]);
    // a dead end (walls ahead and to the right): one turn, 0.25 further, the second — never two in one place
    st = { x: 5, y: 5, d: 'UP' };
    turns = run(grid({ '6,5': { height: 'HIGH' }, '5,6': { height: 'HIGH' } }), st, 1);
    assert.deepEqual(turns.map((t) => [t.from, t.to, +t.x.toFixed(2), +t.y.toFixed(2)]), [['UP', 'RIGHT', 5, 5.25], ['RIGHT', 'DOWN', 5.25, 5.25]]);
    // in a battle: the fx payload keeps { x, y, id, dir } with dir ∈ UP/RIGHT/DOWN/LEFT, and every turn is clockwise
    // (row 10 col 4 facing RIGHT: the field edge at col 10 turns it DOWN, then the 侵入点 at row 9 col 10 turns it LEFT)
    const h = await battle('chess_diy_chen3_6_b', 2, 10, 4);
    const qi = h.eventsOf('fx').filter((e) => e[1] === 'chen3Qi');
    assert.ok(qi.length > 50, 'the 剑气 flies');
    assert.deepEqual(qi.filter((e, i) => i && e[4].dir !== qi[i - 1][4].dir).map((e) => e[4].dir), ['DOWN', 'LEFT'], 'map edge, then 侵入点');
    const DIRS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
    for (let i = 0; i < qi.length; i++) {
      assert.deepEqual(Object.keys(qi[i][4]).sort(), ['dir', 'id']);
      assert.ok(DIRS.includes(qi[i][4].dir));
      if (i && qi[i][4].dir !== qi[i - 1][4].dir) assert.equal(qi[i][4].dir, DIRS[(DIRS.indexOf(qi[i - 1][4].dir) + 1) % 4], 'turns clockwise');
    }
  });

  test('望 棋子 through the real match path (Match board → battleInput → BattleSpec → browser createBattleFromSpec): a used-up stone comes back on its prep tile, again and again, for DP', async () => {
    const { makeMatch, give } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, loadout: { chess_diy_wang_6_a: { diy: 1 } } }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(1);
    h.setStage('act2autochess_m04');
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const w = give(m, ps, 'chess_diy_wang_6_a');
    assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 9, col: 3 }, dir: 'RIGHT' }).ok);
    for (let c = 4; c <= 9; c++) {
      const card = ps.hand.find((p) => p && p.kind === 'token' && p.id === 'token_10064_wang_stone1');
      assert.ok(card, 'the stone cards are in the hand');
      assert.ok(m.handle('p_0', { t: 'g.move', uid: card.uid, to: { area: 'board', row: 9, col: c } }).ok, `stone on 9,${c}`);
    }
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    const back = [];
    b.on('deploy', (c) => { if (c.unit.kind === 'token' && b.time > 0.5) back.push([c.unit.id, c.unit.tileR, c.unit.tileC, c.unit.homeR, c.unit.homeC]); });
    const ev = [];
    while (!b.finished && b.time < 15) { b.step(); ev.push(...b.drainEvents()); }
    // before S1 (21 SP) refills anything: the earlier model (one stock stone per redeploy, stock 7 − 6 = 1) managed one
    assert.ok(back.length >= 2, `used-up stones come back more than once (${back.length})`);
    for (const [, r, c, hr, hc] of back) assert.deepEqual([r, c], [hr, hc], 'on the tile placed in the prep');
    // the client sees the same unit die and deploy again (render/app.js: 'deploy' revives / rebuilds the view)
    const id = back[0][0];
    const kinds = ev.filter((e) => (e[0] === 'die' || e[0] === 'deploy') && e[1] === id).map((e) => e[0]);
    assert.ok(kinds.indexOf('deploy', kinds.indexOf('die')) > 0, `die → deploy for the stone (${kinds.join(' ')})`);
  });

  test('望 client-data rules: hand cap 7 counts the hand only; S1 DoT ticks 7×; 望 leaving kills her stones; a redeployed stone brings a 跟子; flyers do not block a redeploy', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const six = [[9, 5], [9, 6], [9, 7], [10, 5], [10, 7], [11, 6]].map(([r, c], i) => stone(r, c, 60 + i));
    // hand cap: 6 placed → 0 cards; S1 gains 2 cards (the field does not count)
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 0, carryState: { sp: 999 } }, ...six],
      enemies: [{ key: ENEMY, time: 30, route: 0, count: 1 }] });
    h.step(2);
    const w = h.unit('chess_diy_wang_6_b');
    assert.equal(w.mem.wang.prepPlaced, 6);
    assert.ok(h.hooksOf('skillStart').some((x) => x.unit === w), 'S1 cast');
    assert.equal(w.mem.wang.stock, 2, '0 + 2 cards: the 6 on the field are not counted');
    // DoT: first tick on application, then every second for 6.5 s → 7 ticks
    const d = makeBattle({ seed: 5, captureNoisy: true, units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 0 }, stone(9, 6, 50), stone(9, 7, 51)],
      enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 1 }] });
    d.runUntil(() => d.hooksOf('damaged').some((x) => x.dmg?.tags?.includes('dot')), 30);
    const t0 = d.b.time;
    d.run(8);
    const ticks = d.hooksOf('damaged').filter((x) => x.dmg?.tags?.includes('dot') && x.dmg?.tags?.includes('trap'));
    const first = ticks.filter((x) => x.dmg.sourceless);
    assert.ok(first.length >= 7 && first.length % 7 === 0, `7 ticks per trigger (${first.length}, since ${t0.toFixed(1)})`);
    // 望 leaves: every stone of hers dies; they come back (DP) once she stands again
    const k = makeBattle({ seed: 5, captureNoisy: true, units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 0 }, stone(9, 6, 50), stone(9, 7, 51)], enemies: [{ key: ENEMY, time: 40, route: 0, count: 1 }] });
    k.step(2);
    const kw = k.unit('chess_diy_wang_6_b');
    k.b.retreat(kw);
    assert.equal(k.allies().filter((u) => u.kind === 'token' && u.alive).length, 0, 'KillTokens on her exit');
    // a redeployed (used) stone brings a 跟子; a flyer on the tile does not block it
    const r = makeBattle({ seed: 5, captureNoisy: true, units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 0 }, stone(9, 6, 50), stone(9, 7, 51)], enemies: [{ key: ENEMY, time: 0, route: 0, count: 1 }, { key: ENEMY, time: 40, route: 1, count: 1 }] });
    r.runUntil(() => r.b.allyUnits.some((u) => u.kind === 'token' && u.mem.wangUsed), 30);
    const used = r.b.allyUnits.find((u) => u.kind === 'token' && u.mem.wangUsed);
    r.runUntil(() => used.alive, 20);
    assert.ok(used.alive, 'redeployed');
    assert.ok(r.allies().some((u) => u.kind === 'token' && u.alive && u.mem.wangFollower), '跟子 with the redeploy (ON_OWNER_BORN)');
  });

  test('望 跟子 never land on enemy spawn / goal / hole tiles (client exceptTileTypes mask 14) nor undeployable high ground — talent, redeploy, S3 overflow and in-skill builds', async () => {
    const { makeBattle, flatStage } = await import('./helpers/battleHarness.js');
    for (const sk of [0, 2]) {
      // 12,10 = tile_start (the lane's red gate), 12,8 = undeployable high ground; the stones stand right beside them
      const stage = flatStage({ rows: { 12: '##hrrrrr#rSrrrrrrrS##' } });
      const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 60, stage,
        units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 7, uid: 1, skillIndex: sk, carryState: { sp: sk === 2 ? 999 : 0 } }, stone(12, 9, 50), stone(11, 9, 51)],
        enemies: [{ key: ENEMY, time: 0, route: 1, count: 6, interval: 3 }] });
      assert.equal(h.b.grid.tile(12, 10).key, 'tile_start');
      const bad = [];
      let fol = 0;
      const orig = h.b.spawnToken.bind(h.b);
      h.b.spawnToken = (...a) => {
        const u = orig(...a);
        if (u && a[4]?.kit) {
          fol++;
          const t = h.b.grid.tile(a[2], a[3]);
          if (t.special === 'start' || t.special === 'end' || /^tile_(start|end|hole|allygoal|enemygoal)/.test(t.key) || (t.build === 'NONE' && t.height === 'HIGH')) bad.push(`${a[2]},${a[3]} ${t.key}`);
        }
        return u;
      };
      h.run(40);
      assert.deepEqual(bad, [], `S${sk + 1}: no 跟子 on forbidden tiles`);
      if (sk === 2) assert.ok(fol > 0, 'S3 built 跟子 (elsewhere)');
    }
  });

  test('望 S3: a used stone coming back during S3 is her deployment — it builds the S3 跟子 around it, one ammo each (browser report: ammo bar stayed full)', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
      units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 2 }, ...[4, 5, 6, 7, 8, 9].map((c, i) => stone(9, c, 50 + i))],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 6, interval: 2 }] });
    h.step(2);
    const w = h.unit('chess_diy_wang_6_b');
    w.skill.activate('manual', { free: true });
    h.b.players[0].dp = 99;
    let built = 0;
    const orig = h.b.spawnToken.bind(h.b);
    h.b.spawnToken = (...a) => { const u = orig(...a); if (u && a[4]?.kit) built++; return u; };
    const seen = [];
    let redeploys = 0;
    h.b.on('deploy', (c) => { if (c.unit.kind === 'token' && c.unit.mem?.wangUsed === true && w.skill.active) redeploys++; }); // wangUsed is reset right after this hook
    const a0 = w.skill.ammoLeft;
    for (let i = 0; i < 25 / 0.05 && w.skill.active; i++) {
      const am = w.skill.ammoLeft, b0 = built;
      h.step(1);
      if (w.skill.active && built > b0) seen.push([am - w.skill.ammoLeft, built - b0]);
    }
    assert.ok(redeploys > 0, 'used stones came back during S3');
    assert.ok(a0 - (w.skill.active ? w.skill.ammoLeft : 0) > 0, 'ammo spent');
    for (const [spent, n] of seen) assert.equal(spent, n, 'one ammo per 跟子 built');
  });

  test('望 S3 through the real match path (6 prep stones, m04 round 4, enemies outside her range): ammo really drops per 跟子 built, the snapshot ammo bar follows, refund from the same count', async () => {
    const { makeMatch, give } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, loadout: { chess_diy_wang_6_a: { diy: 1, skill: 2 } } }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    h.setStage('act2autochess_m04');
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const w = give(m, ps, 'chess_diy_wang_6_a');
    assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 9, col: 3 }, dir: 'RIGHT' }).ok);
    for (let c = 4; c <= 9; c++) {
      const card = ps.hand.find((p) => p && p.kind === 'token');
      assert.ok(m.handle('p_0', { t: 'g.move', uid: card.uid, to: { area: 'board', row: 9, col: c } }).ok);
    }
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp3', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    const wu = b.allyUnits.find((u) => u.kind === 'op');
    while (b.time < 8) b.step();
    wu.skill.activate('manual', { free: true }); // the player's manual cast (MANUAL skill)
    let built = 0;
    const orig = b.spawnToken.bind(b);
    b.spawnToken = (...a) => { const u = orig(...a); if (u && a[4]?.kit && wu.skill.active) built++; return u; };
    const a0 = wu.skill.ammoLeft;
    while (!b.finished && b.time < 22 && wu.skill.active) b.step();
    assert.ok(wu.skill.ammoLeft < a0, `ammo spent (${a0} → ${wu.skill.ammoLeft})`);
    assert.equal(wu.mem.wang.ammo, wu.skill.ammoLeft, 'the kit count = the engine count');
    const tup = b.snapshot().units.find((x) => x[0] === wu.id);
    assert.ok(Math.abs(tup[5] - tup[6] * wu.skill.ammoLeft / wu.skill.ammoMax) < 0.2, 'the snapshot ammo bar shows it');
    const st0 = wu.mem.wang.stock, left = wu.skill.ammoLeft;
    wu.skill.end('stop');
    assert.equal(wu.mem.wang.stock, Math.min(wu.mem.wang.deckCap, st0 + left), 'refund = the ammo left');
    assert.ok(built > 0);
  });

  test('望 S3: one ammo per 跟子 actually built around a deployment (client SpawnTokenS3InSkill BuildStone counter): 4 free neighbours → 4, fewer → fewer', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
      units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 2 }, ...[5, 6, 7, 8, 9].map((c, i) => stone(12, c, 50 + i))] });
    h.step(2);
    const w = h.unit('chess_diy_wang_6_b');
    w.skill.activate('manual', { free: true });
    h.step(1);
    assert.ok(w.skill.active);
    // the S3-start overflow 跟子 land at random: clear them so the neighbour counts below are the board's own
    for (const f of h.allies().filter((u) => u.kind === 'token' && u.alive && u.mem.wangFollower)) h.b.retreat(f, { reason: 'expired', permanent: true });
    let built = 0;
    const orig = h.b.spawnToken.bind(h.b);
    h.b.spawnToken = (...a) => { const u = orig(...a); if (u && a[4]?.kit) built++; return u; };
    const put = (r, c) => { const e = h.spawn('enemy_1001_bigbo', { pos: [r, c], route: 0 }); h.b.applyStatus(e, 'stun', { duration: 99 }); return e; };
    const seen = [];
    for (const [r, c] of [[10, 5], [11, 4]]) {
      const a0 = w.skill.ammoLeft;
      built = 0;
      const e = put(r, c);
      h.run(1.2);
      seen.push([a0 - w.skill.ammoLeft, built]);
      h.b.kill(e);
    }
    assert.deepEqual(seen[0], [4, 4], '10,5: four free neighbours → 4 跟子, 4 ammo');
    assert.ok(seen[1][0] === seen[1][1] && seen[1][0] < 4 && seen[1][0] > 0, `11,4: fewer neighbours → fewer ammo (${seen[1]})`);
  });

  test('望 S3: among enemy tiles of her range the enemy closest to its goal comes first, not the one closest to her (user decision 2026-10-06)', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
      units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 2 }, ...[5, 6, 7, 8, 9].map((c, i) => stone(12, c, 50 + i))] });
    h.step(2);
    const w = h.unit('chess_diy_wang_6_b');
    w.skill.activate('manual', { free: true });
    h.step(1);
    assert.ok(w.skill.active);
    const put = (r, c) => { const e = h.spawn('enemy_1001_bigbo', { pos: [r, c], route: 0 }); h.b.applyStatus(e, 'stun', { duration: 99 }); return e; };
    const near = put(11, 4), goal = put(9, 4); // 11,4: 1 tile from her, farther along the path; 9,4: farther from her, nearer its goal
    assert.ok(h.b.remainingDistance(goal) < h.b.remainingDistance(near));
    // the stone triggers on its enemy at once and is used up: record where the first one went
    const spawned = [];
    const orig = h.b.spawnToken.bind(h.b);
    h.b.spawnToken = (...a) => { const u = orig(...a); if (u) spawned.push([u.tileR, u.tileC]); return u; };
    h.run(1.2);
    assert.deepEqual(spawned[0], [9, 4], `the first stone went on the enemy nearest its goal (${JSON.stringify(spawned)})`);
  });

  test('望 S3: her used stones waiting to come back hold their slots — no prep stone is ever withdrawn by the deploy limit (review 2026-10-06)', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    for (const seed of [5, 7, 11, 13]) {
      const h = makeBattle({ seed, captureNoisy: true, timeLimit: 120, autoFinish: false,
        units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 2 }, ...[4, 5, 6, 7, 8, 9].map((c, i) => stone(9, c, 50 + i))],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 1.5 }, { key: ENEMY, time: 0.5, route: 1, count: 8, interval: 1.7 }] });
      h.step(2);
      const w = h.unit('chess_diy_wang_6_b');
      h.b.players[0].dp = 99;
      let lost = 0, cast = false;
      const orig = h.b.retreat.bind(h.b);
      h.b.retreat = (t, o) => { if (t.kind === 'token' && o?.permanent && t.mem?.replaced) lost++; return orig(t, o); };
      for (let i = 0; i < 40 / 0.05; i++) {
        if (!cast && h.b.allyUnits.some((t) => t.mem?.wangUsed)) cast = w.skill.activate('manual', { free: true });
        h.step(1);
      }
      assert.ok(cast, `seed ${seed}: S3 cast while a stone waited`);
      assert.equal(lost, 0, `seed ${seed}: no stone withdrawn by the deploy limit`);
    }
  });

  test('望 S3 start: overflow 跟子 go enemy tiles first, then by tile class — undeployable ground before deployable ground (PRTS 技能3 备注)', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    // undeployable ground ('f', class 0) at (10|11, 6|7) inside her S3 range, the rest road (class 1)
    const base = (await import('./helpers/battleHarness.js')).flatStage().rows;
    const rows = { 10: base[10].slice(0, 6) + 'ff' + base[10].slice(8), 11: base[11].slice(0, 6) + 'ff' + base[11].slice(8) };
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false, flat: { rows },
      units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 2 }, stone(9, 9, 50)] });
    h.step(2);
    const w = h.unit('chess_diy_wang_6_b');
    w.mem.wang.stock = w.mem.wang.deckCap; // a full hand: all 8 go out as 跟子
    const placedAt = [];
    const orig = h.b.spawnToken.bind(h.b);
    h.b.spawnToken = (...a) => { const u = orig(...a); if (u) placedAt.push([u.tileR, u.tileC]); return u; };
    w.skill.activate('manual', { free: true });
    assert.ok(placedAt.length > 0);
    const cls = ([r, c]) => { const t = h.b.grid.tile(r, c); return t.build === 'NONE' ? 0 : t.height === 'LOW' ? 1 : 2; };
    const seq = placedAt.map(cls);
    assert.deepEqual(seq.slice(0, 4), [0, 0, 0, 0], `the 4 undeployable ground tiles first: ${seq} at ${JSON.stringify(placedAt)}`);
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i] >= seq[i - 1], `class order ${seq} at ${JSON.stringify(placedAt)}`);
  });

  test('望 S3 天下劫 (ammo): no stone placed in the prep → nothing placed, stays active; with stones → 跟子 + deployments for ammo, leftover ammo back as stones', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    const run = (extra) => {
      const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: 2 }, ...extra],
        enemies: [{ key: ENEMY, time: 0, route: 0, count: 20, interval: 2 }, { key: ENEMY, time: 1, route: 1, count: 15, interval: 2.5 }] });
      h.run(40);
      return h;
    };
    const none = run([]);
    const w0 = none.unit('chess_diy_wang_6_b');
    assert.ok(w0.skill.active, 'zero stones: the skill stays active (user\'s observation of the real game)');
    assert.equal(w0.skill.ammoLeft, 20, 'no ammo spent');
    assert.equal(none.allies().filter((u) => u.kind === 'token' && u.alive).length, 0, 'no stone appears');
    assert.equal(none.hooksOf('skillEnd').filter((x) => x.unit === w0).length, 0);
    const some = run([stone(9, 6, 50), stone(9, 7, 51)]);
    const w1 = some.unit('chess_diy_wang_6_b');
    assert.ok(some.hooksOf('skillStart').some((x) => x.unit === w1), 'cast');
    const fol = some.allies().filter((u) => u.kind === 'token' && u.alive && u.mem.wangFollower).length;
    assert.ok(!w1.skill.active || w1.skill.ammoLeft < 20 || fol >= 8, `ammo spent by the extra 跟子 unless max_spawn_cnt (9) is (nearly) reached — the free talent 跟子 fills the last slot (${fol})`);
    assert.ok(fol > 0, 'ChargeToken overflow → InstantSpawn 跟子');
    assert.ok(tagged(some, 'trap') > 0);
    // the refund: SkillRuntime.end zeroes ammoLeft before onEnd — the kit's mirrored count returns as stones
    if (w1.skill.active) {
      const st0 = w1.mem.wang.stock, left = w1.skill.ammoLeft;
      w1.skill.end('stop');
      assert.equal(w1.mem.wang.stock, Math.min(w1.mem.wang.deckCap, st0 + left), 'leftover ammo → cards in the hand (≤ 最多拥有 7)');
    }
  });

  test('望 棋子: a stone neither selects nor hits an unrevealed 隐匿 enemy (隐形弩手), like Battle.foesInRadius', async () => {
    const { makeBattle } = await import('./helpers/battleHarness.js');
    for (const sk of [1, 2]) {
      const h = makeBattle({ seed: 5, captureNoisy: true, units: [{ chessId: 'chess_diy_wang_6_b', row: 11, col: 3, uid: 1, skillIndex: sk }, stone(9, 6, 50), stone(9, 7, 51), stone(10, 6, 52)],
        enemies: [{ key: 'enemy_1019_jshoot', time: 0, route: 0, count: 2, interval: 0.6 }, { key: ENEMY, time: 0.3, route: 0, count: 2, interval: 0.6 }] });
      h.run(20);
      const trap = h.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes('trap'));
      assert.ok(trap.some((d) => d.target.defId !== 'enemy_1019_jshoot'), `S${sk + 1}: the others are hit`);
      assert.equal(trap.filter((d) => d.target.defId === 'enemy_1019_jshoot').length, 0, `S${sk + 1}: no 隐匿 enemy in the blast`);
    }
  });

  test('棋子 / 医疗探机: no HP bar on the stone, no direction step (shared/trap-tokens.js, ui/facing.js needsFacing)', async () => {
    const { noHpBar, facingless } = await import('../shared/trap-tokens.js');
    const { needsFacing } = await import('../public/js/ui/facing.js');
    assert.equal(noHpBar('token_10064_wang_stone1'), true);
    assert.equal(noHpBar('token_10000_silent_healrb'), false);
    const ctx = (piece) => ({ pieces: new Map([[7, { piece }]]) });
    const tgt = { area: 'board', row: 10, col: 5 }, res = { ok: true, action: 'move' };
    for (const id of ['token_10064_wang_stone1', 'token_10000_silent_healrb']) {
      assert.equal(facingless(id), true);
      assert.equal(needsFacing(ctx({ uid: 7, kind: 'token', id }), 7, tgt, res), false, `${id}: placed at once`);
    }
    assert.equal(needsFacing(ctx({ uid: 7, kind: 'token', id: 'token_10028_vigil_wolf' }), 7, tgt, res), true, 'other summons keep the wheel');
    assert.equal(needsFacing(ctx({ uid: 7, kind: 'chess', id: 'chess_diy_wang_6_a' }), 7, tgt, res), true, 'operators keep the wheel');
  });
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

test('leak alarm: the official ON_ENEMY_REACHED_EXIT sound plays on a battle leak (tools/assets/leak-sfx.mjs, public/js/audio.js)', async () => {
  const { leakSfx } = await import('../tools/assets/leak-sfx.mjs');
  const leaf = (paths) => paths[0];
  assert.equal(leakSfx({ bank: (n) => (n === 'battle.ON_ENEMY_REACHED_EXIT' ? ['battle/b_ui/x.mp3'] : []) }, leaf), 'battle/b_ui/x.mp3');
  assert.equal(leakSfx({ bank: () => [] }, leaf), 'battle/b_ui/b_ui_alarmenter.mp3', 'fallback file');
  const { audio } = await mod('audio.js');
  const a = Object.create(audio);
  const played = [];
  a.ctx = {};
  a.battle = (name) => played.push(name);
  a.handleBattleEvents([['leak', 7]]);
  assert.deepEqual(played, ['leak']);
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

  test('선발 kits × skills (望 stones, 陈 剑气 / S2, 维什戴尔, 祥子 notes, 阿斯卡纶 DoT): never more than 1 HP per instance', () => {
    const stone = (row, col, uid) => ({ kind: 'token', tokenId: 'token_10064_wang_stone1', ownerUid: 1, row, col, uid });
    const many = [{ key: TIMES, time: 0, route: 0, count: 6, interval: 1.2 }, { key: TIMES, time: 1, route: 1, count: 6, interval: 1.6 }];
    const POS = { wang: [11, 3], chen3: [10, 4], wisdel: [11, 4], oblvns: [10, 4], ascln: [10, 4] };
    for (const [key, at] of Object.entries(POS)) {
      for (const sk of [0, 1, 2]) {
        const { h, over } = run(`chess_diy_${key}_6_b`, sk, { at, units: key === 'wang' ? [stone(10, 6, 50), stone(10, 7, 51)] : [], secs: 25, enemies: many });
        assert.equal(h.b.errors.length, 0);
        assert.ok(h.hooksOf('damaged').some((d) => d.target?.side === 'enemy' && d.amount > 0 && d.type !== 'element'), `${key} S${sk + 1} hits`);
        assert.deepEqual(over, [], `${key} S${sk + 1}`);
        for (const d of h.hooksOf('damaged')) if (d.target?.side === 'enemy' && d.type !== 'element') assert.ok(d.amount <= 1, `${key} S${sk + 1}: ${d.amount}`);
      }
    }
  });
});
