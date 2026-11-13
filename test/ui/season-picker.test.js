// The 卫戍协议 season picker (maintainer decisions 2026-11-01, public/js/ui/season.js): the offered seasons from a socket's
// first pong, the remembered pick and the season on screen (the room's, an invitation's, the picked one), the pick
// following a room of another season with a notice, the per-season queue counts, the invitation link's `&season=`,
// the loadout settings kept per season (ui/loadoutSync.js seasonPref / setLoadoutSeason) and the statistics records
// carrying their season (ui/stats.js). localStorage is faked per test (Node has none).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SEASON, SEASONS, defineSeason, newestPublicSeason } from '../../shared/seasons.js';
import { createStore, initialState } from '../../public/js/store.js';
import {
  offeredSeasonsOf, hasSeasonPicker, pickedSeason, activeSeason, seasonFields, seasonQueueCounts, parseSeasonParam,
  installSeasons, pickSeason, loadPickedSeason, inviteSeasonOf,
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
  assert.equal(pickedSeason(state({ seasons: [DEFAULT_SEASON], season: NEXT })), DEFAULT_SEASON); // not offered: the default
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

test('before the first pong the remembered pick is the season on screen, so the entry film main.js picks at boot plays', () => {
  // main.js reads activeSeason once at boot for playEntryFilm, and the film stops when the season on screen changes:
  // a 规程 player's page must not start as 盟约 and turn 规程 when the pong lists the seasons
  const boot = state({ season: NEXT }); // ui.seasons null: not known yet
  assert.equal(activeSeason(boot), NEXT);
  assert.deepEqual(offeredSeasonsOf(boot), [DEFAULT_SEASON, NEXT]);
  assert.equal(activeSeason(state({ ...boot.ui, seasons: [DEFAULT_SEASON, NEXT] })), NEXT, 'the pong confirms it: no change');
  assert.equal(activeSeason(state({ ...boot.ui, seasons: [DEFAULT_SEASON] })), DEFAULT_SEASON, 'a server without it corrects it');
  // never picked: the public seasons, the newest of them
  assert.deepEqual(offeredSeasonsOf(state()), [DEFAULT_SEASON]);
  assert.equal(activeSeason(state()), newestPublicSeason());
  assert.equal(pickedSeason(state({ season: 'bogus' })), DEFAULT_SEASON);
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
  assert.equal(target.get().ui.seasons, null, 'not known before the first pong');
  handlers.pong({ t: 'pong', c: 1, n: 3 }); // a first pong without seasons: the server offers the default alone
  assert.deepEqual(target.get().ui.seasons, [DEFAULT_SEASON]);
  handlers.pong({ t: 'pong', c: 1, n: 3, seasons: [DEFAULT_SEASON, NEXT, 'bogus'] }); // a new socket's first pong
  assert.deepEqual(target.get().ui.seasons, [DEFAULT_SEASON, NEXT]);
  handlers.pong({ t: 'pong', c: 2, n: 3 }); // a later pong: nothing
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

test('a player who never picked opens in the newest public season; a room link without &season is a 盟约 room (maintainer decision 2026-11-13)', () => {
  // today 规程 is not public: the newest public season is the default one
  assert.equal(newestPublicSeason(), DEFAULT_SEASON);
  const undo = defineSeason('zzznewseason', { public: true, name: 'NEW' });
  try {
    assert.equal(newestPublicSeason(), 'zzznewseason', 'the last public entry of the registry');
    const offered = { seasons: [DEFAULT_SEASON, NEXT, 'zzznewseason'] };
    assert.equal(pickedSeason(state(offered)), 'zzznewseason', 'never picked: the newest');
    assert.equal(pickedSeason(state({ ...offered, season: DEFAULT_SEASON })), DEFAULT_SEASON, 'a remembered pick stays');
    assert.equal(pickedSeason(state({ ...offered, season: 'bogus' })), 'zzznewseason');
    assert.equal(pickedSeason(state({ seasons: [DEFAULT_SEASON, NEXT] })), DEFAULT_SEASON, 'the newest not offered: the default');
    // the link of a 盟约 room has no &season (inviteLink): it waits in 盟约, not in the newest season
    const pendingSeason = inviteSeasonOf('?room=ABCD', true);
    assert.equal(pendingSeason, DEFAULT_SEASON);
    assert.equal(activeSeason(state({ ...offered, pendingJoin: 'ABCD', pendingSeason })), DEFAULT_SEASON);
    assert.equal(inviteSeasonOf('?room=ABCD&season=act3autochess', true), NEXT);
    assert.equal(inviteSeasonOf('?season=act3autochess', false), null, 'no room link: no invitation');
  } finally { undo(); }
});
