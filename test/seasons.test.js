// The 卫戍协议 seasons (shared/seasons.js; maintainer decision 2026-10-24: a new season runs beside the current one, chosen
// per room, offered to players only once complete): the registry and its defaults, a season's data as the default's
// files with its own in their place (server/data.js seasonData, the /data/s/<id>/ URLs of http/static.js, the browser's
// data store), room.create `season` (refused unless the server offers it; room.state and the match get it), and the
// browser runner loading the sim again for another season. With one season nothing changes: room.state has no `season`.
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { DEFAULT_SEASON, SEASONS, defineSeason, isSeasonId, seasonOf, seasonDataDir, seasonFeature, offeredSeasons } from '../shared/seasons.js';
import { seasonData, loadData } from '../server/data.js';
import { createStaticHandler, startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { validateC2S } from '../shared/protocol.js';
import { ERR } from '../shared/constants.js';
import { createDataStore } from '../public/js/data.js';
import { createBattleRunner } from '../public/js/battle/runner.js';
import { createStore, initialState } from '../public/js/store.js';
import { TestClient } from './helpers/wsClient.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEXT = 'act9autochess';

/** A data dir: chess + bonds of the default season, the NEXT season's own bonds.json. */
function dataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-seasons-'));
  fs.writeFileSync(path.join(dir, 'chess.json'), JSON.stringify({ c1: { chessId: 'c1', name: 'base' } }));
  fs.writeFileSync(path.join(dir, 'bonds.json'), JSON.stringify({ b1: { bondId: 'b1', n: 1 } }));
  fs.mkdirSync(path.join(dir, 'seasons', NEXT), { recursive: true });
  fs.writeFileSync(path.join(dir, 'seasons', NEXT, 'bonds.json'), JSON.stringify({ b1: { bondId: 'b1', n: 2 } }));
  return dir;
}
const quiet = { info() {}, warn() {}, error() {}, debug() {} };

test('registry: the current season is the public default with every rule switch off', () => {
  assert.equal(DEFAULT_SEASON, 'act2autochess');
  assert.ok(SEASONS[DEFAULT_SEASON].public);
  assert.equal(seasonOf(undefined), DEFAULT_SEASON);
  assert.equal(seasonOf('nope'), DEFAULT_SEASON);
  assert.equal(seasonDataDir(DEFAULT_SEASON), '');
  assert.equal(seasonFeature(DEFAULT_SEASON, 'watchWhileFighting'), false);
  assert.deepEqual(offeredSeasons(''), [DEFAULT_SEASON]);
});

test('registry: a non-public season is offered only when SP_SEASONS names it; its switches; removal', () => {
  const undo = defineSeason(NEXT, { features: { watchWhileFighting: true } });
  try {
    assert.ok(isSeasonId(NEXT));
    assert.equal(seasonDataDir(NEXT), `seasons/${NEXT}`);
    assert.equal(seasonFeature(NEXT, 'watchWhileFighting'), true);
    assert.deepEqual(offeredSeasons(undefined), [DEFAULT_SEASON]);
    assert.deepEqual(offeredSeasons(` ${NEXT} , bogus`), [DEFAULT_SEASON, NEXT]);
    assert.throws(() => defineSeason(NEXT), /taken/);
  } finally { undo(); }
  assert.equal(isSeasonId(NEXT), false);
});

test('protocol: room.create takes an optional registry season', () => {
  const base = { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' };
  assert.equal(validateC2S(base), null);
  assert.equal(validateC2S({ ...base, season: DEFAULT_SEASON }), null);
  for (const season of ['nope', 1, null, '']) assert.notEqual(validateC2S({ ...base, season }), null, JSON.stringify(season));
});

test("server data: another season = the default's files with its own in their place", () => {
  const dir = dataDir();
  const undo = defineSeason(NEXT);
  try {
    const base = loadData(dir, { log: quiet, expected: [] });
    const of = seasonData(base, dir, { log: quiet });
    assert.ok(of() === base && of({ season: DEFAULT_SEASON }) === base && of({ season: 'bogus' }) === base);
    const next = of({ season: NEXT });
    assert.equal(next.bonds.b1.n, 2);
    assert.ok(next.chess === base.chess, 'a file the season lacks is the default one');
    assert.equal(base.bonds.b1.n, 1, 'the default is untouched');
    assert.ok(of({ season: NEXT }) === next, 'loaded once');
    assert.ok(Object.isFrozen(next) && Object.isFrozen(next.bonds.b1));
  } finally { undo(); fs.rmSync(dir, { recursive: true, force: true }); }
});

function get(srv, url) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: srv.address().port, path: url }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('static: /data/s/<season>/<file> is the season\'s own file, else the default\'s; unknown seasons 404', async () => {
  const dir = dataDir();
  const undo = defineSeason(NEXT);
  const handler = createStaticHandler({ publicDir: path.join(ROOT, 'public'), dataDir: dir, sharedDir: path.join(ROOT, 'shared') });
  const srv = http.createServer((req, res) => { const [p, q] = req.url.split('?'); handler(req, res, p, q || ''); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    assert.equal(JSON.parse((await get(srv, `/data/s/${NEXT}/bonds.json`)).body).b1.n, 2);
    assert.equal(JSON.parse((await get(srv, `/data/s/${NEXT}/chess.json`)).body).c1.name, 'base');
    assert.equal(JSON.parse((await get(srv, `/data/s/${DEFAULT_SEASON}/bonds.json`)).body).b1.n, 1);
    assert.equal((await get(srv, '/data/s/bogus/bonds.json')).status, 404);
    assert.equal((await get(srv, `/data/s/${NEXT}/nope.json`)).status, 404);
    assert.equal((await get(srv, `/data/s/${NEXT}/../bonds.json`)).status, 403);
  } finally { srv.close(); undo(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('browser data store: setSeason reads every loaded file but the art manifests from the season again', async () => {
  const urls = [];
  const store = createDataStore({
    retryDelays: [], timeoutMs: 0,
    fetch: async (u) => { urls.push(u); return { ok: true, json: async () => ({ u }) }; },
  });
  await store.loadAll('chess', 'local');
  assert.deepEqual(urls, ['/data/chess.json', '/data/local-assets.json']);
  const undo = defineSeason(NEXT);
  try {
    let told = 0;
    store.subscribe(() => { told++; });
    await store.setSeason(NEXT);
    assert.equal(store.season(), NEXT);
    assert.deepEqual(urls.slice(2), [`/data/s/${NEXT}/chess.json`]);
    assert.equal(store.get('chess').u, `/data/s/${NEXT}/chess.json`);
    assert.ok(told >= 1);
    await store.setSeason(NEXT); // the same season: nothing fetched
    await store.load('bonds');
    assert.deepEqual(urls.slice(3), [`/data/s/${NEXT}/bonds.json`]);
    await store.setSeason(undefined); // back to the default
    assert.equal(store.season(), DEFAULT_SEASON);
    assert.deepEqual(urls.slice(4).sort(), ['/data/bonds.json', '/data/chess.json']);
  } finally { undo(); }
});

test('browser runner: the sim is loaded again when the data season changed', async () => {
  let season = DEFAULT_SEASON;
  let loads = 0;
  const runner = createBattleRunner({
    net: { on: () => () => {}, send: () => true, request: async () => ({ t: 'ok' }) },
    store: createStore(initialState), doc: { hidden: false, addEventListener() {} },
    now: () => 0, raf: () => 1, caf: () => {}, setInterval: () => 1, clearInterval: () => {},
    loadSim: async () => { loads++; return { spec: null, ds: null }; },
    season: () => season,
    logger: quiet,
  });
  await runner.ensureSim();
  await runner.ensureSim();
  assert.equal(loads, 1);
  season = NEXT;
  await runner.ensureSim();
  assert.equal(loads, 2);
});

describe('room.create season (lobby)', () => {
  const started = [];
  class RecordingMatch extends StubMatch {
    constructor(opts) { super(opts); started.push(opts); }
  }
  let srv;
  let dir;
  let undo;
  const open = new Set();
  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    const w = await c.hello(name);
    c.id = w.playerId;
    return c;
  };
  before(async () => {
    dir = dataDir();
    undo = defineSeason(NEXT);
    srv = await startServer({ port: 0, host: '127.0.0.1', log: quiet, MatchClass: RecordingMatch, dataDir: dir, seasons: [DEFAULT_SEASON, NEXT] });
  });
  afterEach(async () => { await Promise.all([...open].map((c) => c.terminate().catch(() => {}))); open.clear(); });
  after(async () => { await srv?.close(); undo?.(); fs.rmSync(dir, { recursive: true, force: true }); });

  test('the default season: room.state has no season, the match runs on the default data', async () => {
    const c = await player('Def');
    assert.equal((await c.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL' })).t, 'ok');
    const st = await c.waitFor('room.state', (s) => s.hostId === c.id);
    assert.equal('season' in st, false);
    const n = started.length;
    assert.equal((await c.request({ t: 'room.start' })).t, 'ok');
    await c.waitFor('room.state', (s) => s.inMatch);
    assert.equal(started[n].season, DEFAULT_SEASON);
    assert.equal(started[n].data.bonds.b1.n, 1);
  });

  test('an offered season: room.state names it, the match gets it and its data', async () => {
    const c = await player('Next');
    assert.equal((await c.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL', season: NEXT })).t, 'ok');
    const st = await c.waitFor('room.state', (s) => s.hostId === c.id);
    assert.equal(st.season, NEXT);
    const n = started.length;
    assert.equal((await c.request({ t: 'room.start' })).t, 'ok');
    await c.waitFor('room.state', (s) => s.inMatch);
    assert.equal(started[n].season, NEXT);
    assert.equal(started[n].data.bonds.b1.n, 2);
    assert.equal(started[n].data.chess.c1.name, 'base');
  });
});

test('a season the server does not offer is refused', async () => {
  const undo = defineSeason(NEXT);
  const srv = await startServer({ port: 0, host: '127.0.0.1', log: quiet, MatchClass: StubMatch });
  const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
  try {
    await c.hello('Nope');
    const r = await c.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL', season: NEXT });
    assert.equal(r.t, 'error');
    assert.equal(r.code, ERR.BAD_MSG);
  } finally { await c.terminate().catch(() => {}); await srv.close(); undo(); }
});
