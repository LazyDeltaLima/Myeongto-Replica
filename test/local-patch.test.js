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
import * as bossesMod from '../server/sim/content/bosses.js';
import { BOSS_HIT_LIMIT } from '../shared/constants.js';

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

describe('operator voice lines (tools/assets/voice.mjs, public/js/voice.js)', () => {
  test('pipeline: Korean / Japanese start, select, deploy and skill lines per operator; empty roles and voice misses are tidied', async () => {
    const { voiceTemplate, tidyVoice } = await import('../tools/assets/voice.mjs');
    const t = voiceTemplate(['char_002_amiya', 'not-an-id']);
    assert.deepEqual(Object.keys(t), ['kr', 'jp']);
    assert.deepEqual(Object.keys(t.kr), ['char_002_amiya'], 'only operator ids');
    const a = t.kr.char_002_amiya;
    assert.deepEqual(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.length])), { start: 1, select: 2, deploy: 2, skill: 4 }, 'nine lines');
    assert.equal(a.start[0].alts[0].rel, 'audio/voice/kr/char_002_amiya/cn_020.mp3', '작전 개시');
    assert.equal(a.deploy[1].alts[0].rel, 'audio/voice/kr/char_002_amiya/cn_024.mp3', '배치 2');
    assert.equal(a.select[0].alts[0].rel, 'audio/voice/kr/char_002_amiya/cn_021.mp3');
    assert.match(a.select[0].alts[0].urls[0], /\/voice\/assets\/dyn\/audio\/sound_beta_2\/voice_kr\/char_002_amiya\/cn_021\.mp3$/);
    assert.match(t.jp.char_002_amiya.skill[3].alts[0].urls[0], /sound_beta_2\/voice\/char_002_amiya\/cn_028\.mp3$/, 'Japanese = the default voice folder');
    const body = { audio: { voice: { kr: { a: { select: ['/x'], skill: [] }, b: { select: [], skill: [] } } } } };
    const resolved = { misses: ['audio.voice.kr.b.select[0]', 'chars.x.avatar'] };
    assert.deepEqual(tidyVoice(body, resolved), { lines: 1, missing: 1 });
    assert.deepEqual(body.audio.voice.kr, { a: { select: ['/x'] } });
    assert.deepEqual(resolved.misses, ['chars.x.avatar']);
  });

  test('client: official battleVoice overlap rules (priority, same-priority override, cooldown)', async () => {
    const { voiceAllowed, skillVoiceType } = await mod('voice.js');
    assert.equal(skillVoiceType({ skillType: 'MANUAL', spCost: 3 }), 'SKILL_ACTIVE');
    assert.equal(skillVoiceType({ skillType: 'AUTO', spCost: 10 }), 'SKILL_PASSIVE_IMP');
    assert.equal(skillVoiceType({ skillType: 'AUTO', spCost: 9 }), 'SKILL_PASSIVE_NOR');
    assert.equal(skillVoiceType({ skillType: 'PASSIVE' }), null);
    const on = (type) => ({ type });
    assert.equal(voiceAllowed('FOCUS_CHAR', null, undefined, 0), true, 'silence: anything plays');
    assert.equal(voiceAllowed('FOCUS_CHAR', on('SKILL_ACTIVE'), undefined, 0), false, 'a select never cuts a skill line');
    assert.equal(voiceAllowed('FOCUS_CHAR', on('FOCUS_CHAR'), undefined, 0), true, 'a newer select takes over');
    assert.equal(voiceAllowed('SKILL_ACTIVE', on('SKILL_ACTIVE'), undefined, 0), true, 'a newer manual skill takes over');
    assert.equal(voiceAllowed('SKILL_ACTIVE', on('SKILL_PASSIVE_IMP'), undefined, 0), true);
    assert.equal(voiceAllowed('SKILL_PASSIVE_IMP', on('SKILL_ACTIVE'), undefined, 0), false);
    assert.equal(voiceAllowed('SKILL_PASSIVE_NOR', on('SKILL_PASSIVE_NOR'), undefined, 0), false, 'auto skills never cut each other');
    assert.equal(voiceAllowed('SKILL_PASSIVE_IMP', on('SKILL_PASSIVE_NOR'), undefined, 0), true);
    assert.equal(voiceAllowed('SKILL_PASSIVE_IMP', null, 5, 14.9), false, '10 s cooldown');
    assert.equal(voiceAllowed('SKILL_PASSIVE_IMP', null, 5, 15), true);
    assert.equal(voiceAllowed('SKILL_ACTIVE', null, 5, 5.1), true, 'no cooldown for manual skills');
    assert.equal(voiceAllowed('BATTLE_START', on('SKILL_ACTIVE'), undefined, 0), true, '작전 개시 cuts everything');
    assert.equal(voiceAllowed('SKILL_PASSIVE_NOR', on('BATTLE_START'), undefined, 0), false);
    assert.equal(voiceAllowed('PLACE_CHAR', on('FOCUS_CHAR'), undefined, 0), true, 'a bought operator cuts a select line');
    assert.equal(voiceAllowed('PLACE_CHAR', on('PLACE_CHAR'), undefined, 0), true, 'two purchases: the newer line takes over');
    assert.equal(voiceAllowed('FOCUS_CHAR', on('PLACE_CHAR'), undefined, 0), false);
  });

  test('client: preference, URLs of the chosen language, download filter', async () => {
    const { sanitizeVoice, voiceUrls, voiceWanted, voiceStore } = await mod('voice.js');
    assert.deepEqual(sanitizeVoice(null), { lang: 'kr', vol: 0.8 });
    assert.deepEqual(sanitizeVoice({ lang: 'jp', vol: 2 }), { lang: 'jp', vol: 1 });
    assert.equal(sanitizeVoice({ lang: 'cn' }).lang, 'kr');
    const m = { audio: { voice: { kr: { c: { select: ['/k1', '/k2'] } }, jp: { c: { select: ['/j1'] } } } } };
    assert.deepEqual(voiceUrls(m, 'c', 'select', 'kr'), ['/k1', '/k2']);
    assert.deepEqual(voiceUrls(m, 'c', 'select', 'jp'), ['/j1']);
    assert.deepEqual(voiceUrls(m, 'c', 'select', 'off'), []);
    assert.deepEqual(voiceUrls(m, 'c', 'skill', 'kr'), []);
    const prev = voiceStore.get();
    try {
      voiceStore.set({ lang: 'jp', vol: 0.8 });
      assert.equal(voiceWanted({ p: '/assets/audio/voice/jp/c/cn_021.mp3' }), true);
      assert.equal(voiceWanted({ p: '/assets/audio/voice/kr/c/cn_021.mp3' }), false);
      assert.equal(voiceWanted({ p: '/assets/audio/sfx/x.mp3' }), true, 'other files untouched');
      voiceStore.set({ lang: 'off', vol: 0.8 });
      assert.equal(voiceWanted({ p: '/assets/audio/voice/jp/c/cn_021.mp3' }), false);
    } finally { voiceStore.set(prev); }
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
    const h = makeMatch({ mode: 'coop', seats, seed: 11 });
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

test('per-round 作战 BGM: wave templates keep their own bgmEvent (tools/assets/round-bgm.mjs, public/js/round-bgm.js)', async () => {
  const { waveBgmTemplate } = await import('../tools/assets/round-bgm.mjs');
  const levels = {
    act1autochess_01: { bgm: 'bat_kazimierz2_2', usedBy: ['mode_single_normal#1'] },
    act1autochess_h01: { bgm: 'bat_kazimierz2_1', usedBy: ['mode_multi_hard#8'] },
    act1autochess_b: { bgm: 'bat_boss_ancestor', usedBy: ['mode_single_normal#14 (boss:boss_1)'] },
    act1autochess_escaped_single: { bgm: 'corrosion', usedBy: ['constData.escapedBattleTemplateMap*'] },
  };
  const wave = waveBgmTemplate(levels, (bank) => ({ loop: bank }));
  assert.deepEqual(wave, {
    act1autochess_01: { loop: 'battle.ON_GAME_READY.bat_kazimierz2_2' },
    act1autochess_h01: { loop: 'battle.ON_GAME_READY.bat_kazimierz2_1' },
  }, 'normal rounds only; boss and 联防 levels have their own tracks');

  const { data } = await mod('data.js');
  const { roundBgmKey } = await mod('round-bgm.js');
  const { bgmKeyFor, resolveBgm } = await mod('audio.js');
  const config = { modes: { mode_single_normal: { rounds: { 1: { template: 'act1autochess_01' }, 14: { template: null } } } } };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => config });
  try { await data.load('config'); } finally { globalThis.fetch = realFetch; }
  const pub = (phase, round) => ({ phase, round, modeId: 'mode_single_normal' });
  assert.equal(roundBgmKey(bgmKeyFor('game', pub('COMBAT', 1)), pub('COMBAT', 1)), 'wave:act1autochess_01');
  assert.equal(roundBgmKey(bgmKeyFor('game', pub('PREP', 1)), pub('PREP', 1)), 'prep', 'prep keeps its track');
  assert.equal(roundBgmKey(bgmKeyFor('game', pub('COMBAT', 14)), pub('COMBAT', 14)), 'combat', 'no template: bgm.combat');
  const manifest = { audio: { bgm: { prep: { loop: 'shop' }, combat: { loop: 'shop' } }, waveBgm: { act1autochess_01: { loop: 'k22' } } } };
  assert.equal(resolveBgm(manifest, 'wave:act1autochess_01').loop, 'k22');
  assert.equal(resolveBgm(manifest, 'wave:act1autochess_99').loop, 'shop', 'unknown template falls back to bgm.combat');
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
        const h = await battle(id, sk, r, c, key === 'wang' ? [stone(10, 6, 50), stone(10, 7, 51)] : []);
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

  test('望: only connected 棋子 trigger; 跟子 at the battle start; S3 drops stones on enemies; stones go on high ground too', async () => {
    assert.equal(tagged(await battle('chess_diy_wang_6_b', 0, 11, 3, [stone(10, 6, 50)], 4), 'trap'), 0, 'a lone stone is not activated');
    const h = await battle('chess_diy_wang_6_b', 0, 11, 3, [stone(10, 6, 50), stone(10, 7, 51)]);
    assert.ok(tagged(h, 'trap') > 0, 'connected stones trigger');
    const stones = h.b.allies(h.unit('chess_diy_wang_6_b').ownerId).filter((a) => a.kind === 'token');
    assert.ok(stones.length >= 4, `跟子 added (${stones.length})`);
    const { loadData } = await import('../server/data.js');
    assert.equal(loadData(path.join(ROOT, 'data'), { log: { warn() {}, error() {} } }).tokens.token_10064_wang_stone1.position, 'ALL');
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
