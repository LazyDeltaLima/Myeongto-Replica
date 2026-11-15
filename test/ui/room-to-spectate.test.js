// The room screen's 前往观战席 (maintainer decision 2026-11-15; server: room.spectate of one's own room, server/lobby.js
// header): a Doctor seated in a co-op room's lobby moves to a spectator seat from the own seat card's ⋯ menu. Offered
// only where the server takes it; disabled while every spectator seat is taken; the texts go through t().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EN = JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8'));
const KO = JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/ko/ui.json'), 'utf8'));
const mod = () => import(pathToFileURL(path.join(ROOT, 'public/js/screens/room.js')).href);

const human = (seat, playerId) => ({ seat, playerId, name: playerId, isBot: false, ready: false, connected: true });
const room = (o = {}) => ({
  code: 'ABCD', hostId: 'h', mode: 'coop', difficulty: 'NORMAL', spectators: [], spectatorSeats: 2,
  seats: [human(0, 'h'), human(1, 'g'), null, null],
  ...o,
});

test('toSpectateOption: a seated Doctor of a co-op lobby with another Doctor; disabled when the spectator seats are full', async () => {
  const { roomFacts, toSpectateOption } = await mod();
  const opt = (r, me) => toSpectateOption(r, roomFacts(r, me));
  assert.deepEqual(opt(room(), 'g'), { enabled: true });
  assert.deepEqual(opt(room(), 'h'), { enabled: true }, 'the host too (the role passes on)');
  assert.deepEqual(opt(room({ spectators: [{ playerId: 'x' }, { playerId: 'y' }] }), 'g'), { enabled: false }, 'every spectator seat taken');
  assert.equal(opt(room({ seats: [human(0, 'h'), { seat: 1, playerId: 'b', isBot: true }, null, null] }), 'h'), null, 'the last Doctor: an AI keeps no room');
  assert.equal(opt(room({ mode: 'solo', seats: [human(0, 'h')] }), 'h'), null);
  assert.equal(opt(room({ inMatch: true }), 'g'), null);
  assert.equal(opt(room({ matching: true }), 'g'), null);
  assert.equal(opt(room({ spectators: [{ playerId: 's' }] }), 's'), null, 'a spectator');
  assert.equal(opt(null, 'g'), null);
});

test('前往观战席 texts are translated', () => {
  for (const k of ['前往观战席', '观战席已满', '你是同盟的创建者，前往观战席后创建者身份将移交给其他博士。确定前往吗？', '前往']) {
    assert.ok(EN[k], `en: ${k}`);
    assert.ok(KO[k], `ko: ${k}`);
  }
});
