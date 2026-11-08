// The 卫戍协议 season picker (maintainer decisions 2026-11-01, public/js/ui/season.js): the offered seasons from a socket's
// first pong, the remembered pick and the season on screen (the room's, an invitation's, the picked one), the pick
// following a room of another season with a notice, the per-season queue counts, the invitation link's `&season=`,
// the loadout settings kept per season (ui/loadoutSync.js seasonPref / setLoadoutSeason) and the statistics records
// carrying their season (ui/stats.js). localStorage is faked per test (Node has none).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SEASON, SEASONS } from '../../shared/seasons.js';
import { createStore, initialState } from '../../public/js/store.js';
import {
  offeredSeasonsOf, hasSeasonPicker, pickedSeason, activeSeason, seasonFields, seasonQueueCounts, parseSeasonParam,
  installSeasons, pickSeason, loadPickedSeason,
} from '../../public/js/ui/season.js';
import { inviteLink } from '../../public/js/screens/room.js';
import { seasonPref, setLoadoutSeason, installOwnershipSync } from '../../public/js/ui/loadoutSync.js';
import { buildRecord, normalizeRecord, recordSeason } from '../../public/js/ui/stats.js';

const NEXT = 'act3autochess';

/** Run `fn` with a Map-backed localStorage installed. */
function withStorage(fn, init = {}) {
  const m = new Map(Object.entries(init));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  try { return fn(m); } finally { delete globalThis.localStorage; }
}

const state = (ui = {}, room = null) => ({ ...initialState, room, ui: { ...initialState.ui, ...ui } });

test('规程 (act3autochess) is in the registry, never public', () => {
  assert.equal(SEASONS[NEXT].public, false);
  assert.equal(SEASONS[DEFAULT_SEASON].name, '盟约');
});

test('offered / picked / on screen: one season = the default and no picker; the pick only when offered', () => {
  assert.deepEqual(offeredSeasonsOf(state()), [DEFAULT_SEASON]);
  assert.equal(hasSeasonPicker(state()), false);
  assert.equal(pickedSeason(state({ season: NEXT })), DEFAULT_SEASON); // not offered (yet): the default
  const two = { seasons: [DEFAULT_SEASON, NEXT] };
  assert.equal(hasSeasonPicker(state(two)), true);
  assert.equal(pickedSeason(state({ ...two, season: NEXT })), NEXT);
  assert.equal(pickedSeason(state({ ...two, season: 'bogus' })), DEFAULT_SEASON);
  // the room's season wins; absent = the default
  assert.equal(activeSeason(state({ ...two, season: NEXT }, { code: 'ABCD' })), DEFAULT_SEASON);
  assert.equal(activeSeason(state({ ...two }, { code: 'ABCD', season: NEXT })), NEXT);
  // an invitation that names its season, while it waits
  assert.equal(activeSeason(state({ ...two, pendingJoin: 'ABCD', pendingSeason: NEXT })), NEXT);
  assert.equal(activeSeason(state({ ...two, pendingSeason: NEXT })), DEFAULT_SEASON);
});

test('room.create / room.queue fields and the queue counts of a season', () => {
  assert.deepEqual(seasonFields(DEFAULT_SEASON), {});
  assert.deepEqual(seasonFields(NEXT), { season: NEXT });
  const s = state({ queueCounts: { a: 1 }, queueCounts8: { a: 8 }, queueCountsBy: { [NEXT]: { counts: { b: 2 }, counts8: { b: 9 } } } });
  assert.deepEqual(seasonQueueCounts(s, DEFAULT_SEASON, false), { a: 1 });
  assert.deepEqual(seasonQueueCounts(s, DEFAULT_SEASON, true), { a: 8 });
  assert.deepEqual(seasonQueueCounts(s, NEXT, false), { b: 2 });
  assert.deepEqual(seasonQueueCounts(s, NEXT, true), { b: 9 });
  assert.equal(seasonQueueCounts(state(), NEXT, false), null);
});

test('the invitation link names a room season other than the default; the title reads it back', () => {
  assert.match(inviteLink('ABCD'), /\?room=ABCD$/);
  assert.match(inviteLink('ABCD', DEFAULT_SEASON), /\?room=ABCD$/);
  assert.match(inviteLink('ABCD', NEXT), /\?room=ABCD&season=act3autochess$/);
  assert.equal(parseSeasonParam('?room=ABCD&season=act3autochess'), NEXT);
  assert.equal(parseSeasonParam('?room=ABCD&season=nope'), null);
  assert.equal(parseSeasonParam('?room=ABCD'), null);
});

test('installSeasons: the first pong offers the seasons; a room of another season switches the pick with a notice', () => withStorage((ls) => {
  const handlers = {};
  const net = { on: (t, fn) => { handlers[t] = fn; return () => {}; } };
  const target = createStore(initialState);
  const told = [];
  installSeasons({ net, target, notify: (text) => told.push(text) });
  handlers.pong({ t: 'pong', c: 1, n: 3 }); // a later pong: nothing
  assert.equal(target.get().ui.seasons, null);
  handlers.pong({ t: 'pong', c: 1, n: 3, seasons: [DEFAULT_SEASON, NEXT, 'bogus'] });
  assert.deepEqual(target.get().ui.seasons, [DEFAULT_SEASON, NEXT]);
  target.set({ room: { code: 'ABCD' } }); // the default season's room, the default picked: nothing
  assert.deepEqual(told, []);
  target.set({ room: { code: 'WXYZ', season: NEXT } });
  assert.equal(target.get().ui.season, NEXT);
  assert.equal(JSON.parse(ls.get('sp.pref.season')), NEXT);
  assert.equal(told.length, 1);
  target.set({ room: { code: 'WXYZ', season: NEXT, inMatch: true } }); // the same room: no second notice
  assert.equal(told.length, 1);
}));

test('pickSeason remembers a registry season only', () => withStorage((ls) => {
  pickSeason('bogus');
  assert.equal(ls.has('sp.pref.season'), false);
  pickSeason(NEXT);
  assert.equal(loadPickedSeason(), NEXT);
}));

test('loadout settings per season: the default keeps the old keys, another season its own', () => withStorage(() => {
  assert.equal(seasonPref('loadout', DEFAULT_SEASON), 'loadout');
  assert.equal(seasonPref('loadout', undefined), 'loadout');
  assert.equal(seasonPref('loadout', NEXT), 'loadout@act3autochess');
  const target = createStore({ entries: { a: 1 }, ops: {}, notOwned: [], diy: {}, sel: 'x', diyPick: null });
  // the next season's stored loadout replaces the held one; back to the default reads the default's again
  globalThis.localStorage.setItem('sp.pref.loadout@act3autochess', JSON.stringify({ v: 1, entries: {} }));
  setLoadoutSeason(NEXT, target);
  assert.deepEqual(target.get().entries, {});
  assert.equal(target.get().sel, null);
  setLoadoutSeason(DEFAULT_SEASON, target);
}));

test('the settings syncs name a season other than the default, and resend the same content for another season', () => withStorage(async () => {
  const sent = [];
  const handlers = new Map();
  const net = {
    status: 'online',
    on: (t, fn) => { handlers.set(t, fn); return () => handlers.delete(t); },
    request: async (t, fields) => { sent.push({ t, ...fields }); return { t: 'ok' }; },
  };
  let pending = [];
  const timers = { setTimeout: (fn) => { pending.push(fn); return pending.length; }, clearTimeout: () => {} };
  const run = async () => { const fns = pending; pending = []; for (const fn of fns) fn(); for (let i = 0; i < 5; i++) await Promise.resolve(); };
  const target = createStore({ notOwned: [], ownSync: 'idle', open: false });
  const sync = installOwnershipSync({ net, timers, target, notify: () => {} });
  try {
    handlers.get('welcome')({});
    await run();
    assert.deepEqual(sent.at(-1), { t: 'room.ownership', notOwned: [] });
    setLoadoutSeason(NEXT, target); // the same (empty) list, another season: sent again under it
    await run();
    assert.deepEqual(sent.at(-1), { t: 'room.ownership', notOwned: [], season: NEXT });
    assert.equal(sent.length, 2);
  } finally { setLoadoutSeason(DEFAULT_SEASON, target); sync.dispose(); }
}));

test('statistics records carry a season other than the default; older records are the default season', () => {
  const res = { players: [{ playerId: 'p1', seat: 0, name: 'A' }], modeId: 'm', difficulty: 'NORMAL' };
  const def = buildRecord(res, { myId: 'p1', season: DEFAULT_SEASON, now: 1 });
  assert.equal('season' in def, false);
  assert.equal(recordSeason(def), DEFAULT_SEASON);
  const next = buildRecord(res, { myId: 'p1', season: NEXT, now: 1 });
  assert.equal(next.season, NEXT);
  assert.equal(recordSeason(next), NEXT);
  assert.equal(recordSeason(normalizeRecord({ players: [{ playerId: 'p1' }] })), DEFAULT_SEASON);
});
