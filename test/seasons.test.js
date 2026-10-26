// The 卫戍协议 seasons (shared/seasons.js; maintainer decision 2026-10-24: a new season runs beside the current one, chosen
// per room, offered to players only once complete): the registry and its defaults, a season's data as the default's
// files with its own in their place (server/data.js seasonData, the /data/s/<id>/ URLs of http/static.js, the browser's
// data store), room.create `season` (refused unless the server offers it; room.state and the match get it), and the
// browser runner loading the sim again for another season, the content modules reading a battle's / prep ctx's own data,
// another season's prep registry, and the kit of another season's chess id. With one season nothing changes:
// room.state has no `season`.
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { DEFAULT_SEASON, SEASONS, defineSeason, isSeasonId, seasonOf, seasonDataDir, seasonFeature, offeredSeasons } from '../shared/seasons.js';
import { seasonData, loadData, getData } from '../server/data.js';
import { createStaticHandler, startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { validateC2S } from '../shared/protocol.js';
import { ERR } from '../shared/constants.js';
import { createDataStore } from '../public/js/data.js';
import { createBattleRunner } from '../public/js/battle/runner.js';
import { createStore, initialState } from '../public/js/store.js';
import { TestClient } from './helpers/wsClient.js';
import { DataSource } from '../server/sim/simdata.js';
import { bondRecord, dataFile, isCoreBond, unitBonds } from '../server/sim/content/support/index.js';
import { bondBb } from '../server/sim/content/bonds/addon/battle.js';
import { bandMetaHandler } from '../server/sim/content/bands/meta.js';
import { getDefaultRegistry, registryFor } from '../server/match/effectsMeta.js';
import { makeMatch } from './match/harness.js';

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

// ---------------------------------------------------------------------------------------------------------------------
// the content modules read a battle's / match's own season data (support dataFile), and another season's match builds
// its prep-side registry from its data (effectsMeta.js registryFor)

const BASE = getData({ log: quiet });
/** The default data with 精准 (preciShip) at other numbers, no longer core-less 炎 (yanShip), and one band more. */
function nextData() {
  const preci = BASE.bonds.preciShip;
  const bonds = {
    ...BASE.bonds,
    preciShip: { ...preci, buffs: preci.buffs.map((b) => (b.key === 'env_gbuff_new' ? { ...b, bb: { ...b.bb, base_atk: 0.5 } } : b)) },
    yanShip: { ...BASE.bonds.yanShip, isCore: false },
  };
  const metaBand = Object.keys(BASE.bands).find((id) => bandMetaHandler(id));
  const bands = { ...BASE.bands, band_next: { ...BASE.bands[metaBand], bandId: 'band_next' } };
  return Object.freeze({ ...BASE, bonds, bands });
}

test('content data: a battle, a prep ctx or a data object reads its own season\'s files; nothing given → the default', () => {
  const next = nextData();
  const battle = { data: new DataSource(next, null) };
  const ctx = { data: next };
  assert.equal(bondBb('preciShip').base_atk, 0.1);
  for (const scope of [battle, ctx, next]) {
    assert.equal(bondBb('preciShip', scope).base_atk, 0.5);
    assert.ok(bondRecord('preciShip', scope) === next.bonds.preciShip);
    assert.equal(isCoreBond('yanShip', scope), false);
  }
  assert.equal(isCoreBond('yanShip'), true, 'the default season keeps its own core bonds');
  // a battle built from part of the data (tests): the files it lacks are the default's
  const partial = { data: new DataSource({ chess: BASE.chess }, null) };
  assert.ok(dataFile(partial, 'bonds') === BASE.bonds);
  // a unit's 变形同构体 grants read the items of its battle's data (no items there: none granted)
  const unit = { kind: 'op', def: { bonds: ['yanShip'] }, items: [] };
  assert.deepEqual([...unitBonds(unit, battle)], ['yanShip']);
});

test('prep registry: another season\'s match builds its own from its data; the default season keeps the process one', () => {
  const next = nextData();
  const reg = registryFor(next);
  assert.ok(reg === registryFor(next), 'built once per data object');
  assert.ok(reg !== getDefaultRegistry());
  assert.ok(reg.get('band:band_next'), 'a band only the season has gets its handler');
  assert.equal(getDefaultRegistry().get('band:band_next'), null);
  const undo = defineSeason(NEXT);
  try {
    const def = makeMatch({ mode: 'solo' }).m;
    assert.ok(def.registry === getDefaultRegistry() && def.season === DEFAULT_SEASON);
    const m = makeMatch({ mode: 'solo', data: next, season: NEXT }).m;
    assert.equal(m.season, NEXT);
    assert.ok(m.registry === reg);
  } finally { undo(); }
});

test('kits: another season\'s chess id finds the same operator\'s kit; none of this season\'s chess is affected', async () => {
  const { kitKeyOfChar, KITS: REG } = await import('../server/sim/content/kits/index.js');
  const { kitOf } = await import('../server/sim/content/index.js');
  // one kit: found whatever the new chess id; several (a tier form each): the one of the same tier, else none
  const one = Object.values(BASE.chess).find((c) => !c.isGolden && c.charId && REG[c.baseChessId ?? c.chessId.replace(/_b$/, '_a')] === undefined && kitKeyOfChar(c.charId, c.tier));
  assert.equal(one, undefined, 'no chess of this season falls back');
  const inside = BASE.chess.chess_char_1_01_a.charId;
  assert.equal(kitKeyOfChar(inside, 5), 'chess_char_1_01', 'a one-kit operator, whatever the tier');
  const tin = BASE.chess.chess_char_1_16_a.charId; // two kits: tier 1 and tier 2
  assert.equal(kitKeyOfChar(tin, 2), 'chess_char_2_19');
  assert.equal(kitKeyOfChar(tin, 6), null, 'ambiguous across tiers');
  assert.equal(kitKeyOfChar(null, 1), null);
  assert.equal(kitKeyOfChar('char_1042_phatm2', 3), 'char_1042_phatm2', 'no chess kit: the 自选 kit');
  assert.equal(kitKeyOfChar('char_9999_nobody', 3), null);
  const def = { id: 'chess_char_9_99_a', baseId: 'chess_char_9_99_a', charId: tin, tier: 1 };
  assert.ok(kitOf(def, REG) === REG.chess_char_1_16);
});

test('kits: an operator with only a 自选 kit, fielded as another season\'s chess, plays exactly as the 自选 piece', async () => {
  const { OPERATOR_KITS } = await import('../server/sim/content/kits/index.js');
  const { skillSpecSource } = await import('../server/sim/content/index.js');
  const { diyRecord, diyTokenOwner } = await import('../shared/diy.js');
  const { makeBattle } = await import('./helpers/battleHarness.js');
  const slots = BASE.backups.diy.slots;
  const slot = Object.keys(slots).find((id) => slots[id].tier === 6);
  const ID = 'chess_char_9_90_b';
  const enemies = [{ key: 'enemy_1422_lrsldr', time: 0, route: 0, count: 8, interval: 1.2 }, { key: 'enemy_1422_lrsldr', time: 1, route: 1, count: 6, interval: 1.6 }];
  const POS = { char_2027_wang: [11, 3] };
  // 望 acts through his placed stones (test/local-patch-diy.test.js)
  const stone = (row, col, uid) => ({ kind: 'token', tokenId: 'token_10064_wang_stone1', ownerUid: 1, row, col, uid });
  const PLACED = { char_2027_wang: [stone(10, 6, 50), stone(10, 7, 51)] };
  /** Fight 25 s with SP full: the casts, the damage the enemies took and the healing (the unit's and its summons'). */
  const run = (charId, unit, defs) => {
    const [row, col] = POS[charId] ?? [10, 4];
    const units = [{ ...unit, row, col, uid: 1, carryState: { sp: 999 } }, ...(PLACED[charId] ?? [])];
    const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, defs, units, enemies });
    h.run(25);
    const sum = (list) => list.reduce((a, d) => a + (d.amount ?? 0), 0);
    const play = {
      casts: h.hooksOf('skillStart').length,
      dealt: sum(h.hooksOf('damaged').filter((d) => d.target?.side === 'enemy')),
      healed: sum(h.hooksOf('heal')),
      events: h.events.length,
    };
    return { h, play, errors: h.battle.errors };
  };
  for (const charId of Object.keys(OPERATOR_KITS)) {
    const unit = BASE.backups.units[charId];
    const xModule = Object.keys(unit.moduleNames ?? {}).find((id) => id.startsWith('uniequip_002_')) ?? null;
    let cast = false;
    for (let skillIndex = 0; skillIndex < 3; skillIndex++) {
      const label = `${charId} S${skillIndex + 1}`;
      const pick = { charId, skillIndex, uniEquipId: xModule };
      const rec = diyRecord(slot, pick, { elite: true, data: BASE });
      assert.ok(rec, label);
      // the 自选 record as a chess record of its own, and its summons with a variant of that chess id at the chess's own
      // skill and module (data/tokens.json shape): what another season's build-data writes for that operator
      const { diyFor, ...piece } = rec;
      const chess = { ...piece, chessId: ID, baseId: ID, goldenId: ID, isGolden: true, isDiy: false, chessType: 'NORMAL', tier: 6 };
      const owner = diyTokenOwner(charId, rec.status);
      const own = (v) => ({ ...v, ...v.bySkill?.[skillIndex], ...(xModule ? v.byModule?.[xModule] : null) });
      const tokens = Object.fromEntries(Object.values(BASE.backups.tokens).filter((t) => t.variants?.[owner])
        .map((t) => [t.tokenId, { ...t, owners: [ID], variants: { [ID]: own(t.variants[owner]) } }]));
      const as = run(charId, { chessId: ID }, { chess: { [ID]: chess }, tokens });
      const def = as.h.unit(1).def;
      assert.ok(def.charId === charId && !def.diyFor, label);
      assert.equal(skillSpecSource(def), 'skills', `${label}: its 自选 kit's own skill spec`);
      assert.deepEqual(as.errors, [], `${label}: no handler error`);
      const diy = run(charId, { diy: { slot, ...pick }, elite: true });
      assert.deepEqual(as.play, diy.play, `${label}: the same battle as the 自选 piece`);
      cast ||= as.play.casts > 0;
    }
    assert.ok(cast, `${charId}: a skill of hers / his starts (the comparison is not empty)`);
  }
});
