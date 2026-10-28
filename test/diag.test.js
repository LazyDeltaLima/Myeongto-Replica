// test/diag.test.js — the client's error log and bug-report diagnostics (public/js/diag.js; 设置 → 问题反馈): what an
// entry keeps (message, a short stack without the page's host), repeats counted on one entry, the cap, the report's
// lines, the battle attached as a replayable b.start, and the player names / room code / token never in the text.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordError, errorLog, errorCount, clearErrorLog, messageOf, stackOf, stripHosts, redact, redactValues, secretsOf, buildDiagnostics,
  setBattleSource, currentBattle, LOG_MAX, STACK_LINES, mountTimer, mountRecords, clearMountRecords, mountNet, MOUNT_MAX,
  setPerfSource, setResourceSource, fieldLoading, FIELD_LOADING_MAX_MS,
} from '../public/js/diag.js';
import { APP_VERSION } from '../shared/constants.js';

const v8Error = (msg = 'boom') => {
  const e = new TypeError(msg);
  e.stack = [`TypeError: ${msg}`, ...Array.from({ length: 9 }, (_, i) => `    at f${i} (http://192.168.1.5:3000/js/ui/a.js:${i + 1}:7)`)].join('\n');
  return e;
};

describe('the error log', () => {
  beforeEach(() => clearErrorLog());

  test('an entry keeps the message and the first frames of the stack, without the page\'s scheme and host', () => {
    const e = recordError('error', v8Error('x is undefined'), null, 1000);
    assert.equal(e.message, 'TypeError: x is undefined');
    const frames = e.stack.split('\n');
    assert.equal(frames.length, STACK_LINES);
    assert.equal(frames[0], 'at f0 (/js/ui/a.js:1:7)');
    assert.ok(!e.stack.includes('192.168.1.5'));
    // Firefox / Safari stacks list frames only: the first line is a frame and stays
    assert.equal(stackOf({ stack: 'g@https://sp.example/sim/x.js:3:9\nh@https://sp.example/sim/y.js:1:1' }), 'g@/sim/x.js:3:9\nh@/sim/y.js:1:1');
    assert.equal(stackOf('a string'), null);
  });

  test('messages of a NetError, a {code, msg} push, a string and a plain object', () => {
    assert.equal(messageOf(Object.assign(new Error('请求超时'), { name: 'NetError', code: 'TIMEOUT' })), 'NetError: 请求超时 (TIMEOUT)');
    assert.equal(messageOf({ code: 'ROOM_FULL', msg: '房间已满' }), '房间已满 (ROOM_FULL)');
    assert.equal(messageOf({ code: 'OFFLINE' }), 'OFFLINE');
    assert.equal(messageOf('  plain   text '), 'plain text');
    assert.equal(messageOf({ a: 1 }), '{"a":1}');
    assert.equal(messageOf(null), 'null');
    assert.ok(messageOf('x'.repeat(500)).length <= 300);
    assert.equal(stripHosts('see http://10.0.0.2:3000/x.js and https://a.b/c'), 'see /x.js and /c');
  });

  test('the same error again raises the count of its entry; another source or message is a new entry', () => {
    recordError('sim', '[sim] skill failed', null, 1000);
    recordError('sim', '[sim] skill failed', null, 2000);
    recordError('sim', '[sim] skill failed', null, 3000);
    recordError('runner', '[sim] skill failed', null, 4000);
    recordError('runner', 'other', null, 5000);
    const log = errorLog();
    assert.deepEqual(log.map((e) => [e.source, e.count]), [['sim', 3], ['runner', 1], ['runner', 1]]);
    assert.equal(log[0].lastAt, 3000);
    assert.equal(errorCount(), 5);
  });

  test('the log keeps the newest LOG_MAX entries and the report says how many were dropped', () => {
    for (let i = 0; i < LOG_MAX + 5; i++) recordError('error', `e${i}`, null, i * 1000);
    const log = errorLog();
    assert.equal(log.length, LOG_MAX);
    assert.equal(log[0].message, 'e5');
    const text = buildDiagnostics({ state: {}, now: 100000, pageStart: 0 });
    assert.match(text, /errors: 45 recorded, 5 oldest entries dropped/);
    assert.match(text, /#1 00:00:44 error: e44/, 'newest first');
    clearErrorLog();
    assert.equal(errorCount(), 0);
    assert.equal(errorLog().length, 0);
  });
});

describe('the report', () => {
  beforeEach(() => clearErrorLog());

  const state = {
    connection: { status: 'online', ping: 41.6, attempt: 0, lastError: null },
    me: { playerId: 'p_1', name: '阿米娅', token: 'tok-secret-123' },
    session: { entered: true },
    room: { code: 'K7Q2', mode: 'coop', difficulty: 'HARD', seats: [{ name: '阿米娅' }, { name: 'Kal' }, { name: 'Kaltsit' }, null], spectators: [{ name: 'W' }] },
    match: {
      public: { phase: 'COMBAT', round: 9, players: [{ playerId: 'p_1', name: '阿米娅' }, { playerId: 'p_2', name: 'Kal' }] },
      battle: { kind: 'unite', fieldId: 'u', authoritative: true, done: false, speed: 2 },
    },
  };
  const env = { ua: 'Mozilla/5.0 Test', gpu: 'ANGLE (Test GPU)', viewport: '844x390', dpr: 2, touch: true, cores: 8, lang: 'zh-CN', uiLang: 'zh' };

  test('version, time, browser, device, connection, where the player is, the battle, the settings and the errors', () => {
    recordError('request', { code: 'ROOM_FULL', msg: '房间已满' }, null, Date.UTC(2026, 9, 8, 12, 0, 5));
    recordError('sim', '[sim] onAttack (char_391_rosmon) failed: TypeError: x', null, Date.UTC(2026, 9, 8, 12, 0, 9));
    recordError('sim', '[sim] onAttack (char_391_rosmon) failed: TypeError: x', null, Date.UTC(2026, 9, 8, 12, 0, 12));
    const text = buildDiagnostics({ state, env, settings: { quality: 'low', damageNumbers: true, muted: false },
      now: Date.UTC(2026, 9, 8, 12, 1, 0), pageStart: Date.UTC(2026, 9, 8, 11, 48, 30) });
    const lines = text.split('\n');
    assert.equal(lines[0], '```text');
    assert.equal(lines[1], 'Stronghold-Protocol diagnostics');
    assert.equal(lines[2], `version: ${APP_VERSION}`);
    assert.equal(lines[3], 'time: 2026-10-08T12:01:00.000Z | page open 12m 30s');
    assert.ok(lines.includes('browser: Mozilla/5.0 Test'));
    assert.ok(lines.includes('gpu: ANGLE (Test GPU)'));
    assert.ok(lines.includes('device: 844x390 | @2x | touch | 8 threads | lang zh-CN | ui zh'));
    assert.ok(lines.includes('connection: online | ping 42 ms'));
    assert.ok(lines.includes('where: phase COMBAT | round 9 | mode coop | difficulty HARD | players 2'));
    assert.ok(lines.includes('battle: unite | field u | authoritative | running | 2x'));
    assert.ok(lines.includes('settings: quality low | damage numbers'));
    assert.ok(lines.includes('errors: 3 recorded'));
    assert.ok(lines.includes('#1 12:00:09 (x2, last 12:00:12) sim: [sim] onAttack (char_391_rosmon) failed: TypeError: x'));
    assert.ok(lines.includes('#2 12:00:05 request: 房间已满 (ROOM_FULL)'));
    assert.equal(lines.at(-1), '```');
    assert.ok(!text.includes('```json'), 'no battle attached');
  });

  test('player names, the room code and the reconnect token never reach the text, wherever they appear', () => {
    recordError('request', '阿米娅 left room K7Q2 (token tok-secret-123)', 'Kaltsit and Kal and W');
    const text = buildDiagnostics({ state, env });
    for (const secret of ['阿米娅', 'Kaltsit', 'Kal ', 'K7Q2', 'tok-secret-123']) assert.ok(!text.includes(secret), secret);
    assert.match(text, /request: <me> left room <room> \(token <token>\)/);
    // the longer name is replaced first, so 'Kaltsit' does not become '<player2>tsit'; the one-letter 'W' as a word
    assert.ok(text.includes('\n   <player3> and <player2> and <player4>\n'));
    assert.deepEqual(secretsOf(state).map(([, p]) => p), ['<me>', '<player2>', '<player3>', '<player4>', '<room>', '<token>']);
    assert.equal(redact('ab a cab W-W Windows', [['a', 'X'], ['ab', 'Y'], ['W', 'V'], ['', 'Z']]), 'Y X cab V-V Windows',
      'every value, short or long, is a whole token');
    assert.equal(redact('player and players', [['player', '<p1>'], ['Kaltsit', '<player2>']]), '<p1> and players',
      'a longer word is not cut');
    assert.equal(redact('a.b a+b', [['a.b', 'R']]), 'R a+b', 'regex characters in a value are literal');
    assert.equal(redact('char chess_char_1013_chen2', [['char', '<me>']]), '<me> chess_char_1013_chen2',
      'a name does not eat a chess id');
  });

  test('a name like char replaces a whole token and an exact JSON string, never a longer id', () => {
    const named = {
      ...state,
      me: { ...state.me, name: 'char' },
      room: { ...state.room, seats: [{ name: 'char' }, { name: 'Ship' }], spectators: [] },
      match: { ...state.match, public: { ...state.match.public, players: [{ playerId: 'p_1', name: 'char' }, { playerId: 'p_2', name: 'Ship' }] } },
    };
    recordError('sim', 'char failed on chess_char_1013_chen2', 'yanShip stayed');
    const spec = {
      v: 1,
      units: [{ id: 'chess_char_1013_chen2', key: 'char', note: 'charge the char', ship: 'yanShip' }],
      name: 'char',
      tag: 'Ship',
    };
    const text = buildDiagnostics({
      state: named, env, battle: { battleId: 'k1', fieldId: 'u', kind: 'unite', spec, time: 1 },
    });
    assert.match(text, /sim: <me> failed on chess_char_1013_chen2/);
    assert.ok(text.includes('yanShip stayed'), 'Ship does not match inside yanShip');
    const json = JSON.parse(text.slice(text.indexOf('```json\n') + 8, text.lastIndexOf('\n```')));
    assert.equal(json.spec.units[0].id, 'chess_char_1013_chen2');
    assert.equal(json.spec.units[0].key, '<me>');
    assert.equal(json.spec.units[0].note, 'charge the char');
    assert.equal(json.spec.units[0].ship, 'yanShip');
    assert.equal(json.spec.name, '<me>');
    assert.equal(json.spec.tag, '<player2>');
    assert.equal(JSON.stringify(json).includes('"char"'), false);
    assert.deepEqual(redactValues(
      { id: 'chess_char_1013_chen2', char: 'keep', name: 'char', note: 'charge the char', list: ['char', 'chess_char_1013_chen2'] },
      [['char', '<me>']],
    ), { id: 'chess_char_1013_chen2', '<me>': 'keep', name: '<me>', note: 'charge the char', list: ['<me>', 'chess_char_1013_chen2'] });
  });

  test('the battle on screen is attached as a b.start the dev tools replay (player ids, no names)', () => {
    const spec = { v: 1, battleId: 'k1-1.9.40.u', fieldId: 'u', kind: 'unite', seed: 7, round: 9, players: [{ playerId: 'p_1' }, { playerId: 'p_2' }] };
    const text = buildDiagnostics({ state, env, battle: { battleId: spec.battleId, fieldId: 'u', kind: 'unite', spec, time: 12.4 } });
    assert.ok(text.includes('\n\nbattle k1-1.9.40.u | unite | round 9 | copied at 12.40 s\n```json\n'));
    const json = JSON.parse(text.slice(text.indexOf('```json\n') + 8, text.lastIndexOf('\n```')));
    assert.deepEqual(json, { t: 'b.start', battleId: spec.battleId, fieldId: 'u', kind: 'unite', spec });
  });

  test('an empty page: the title screen, nothing recorded, unknown fields left out', () => {
    const text = buildDiagnostics({ state: {}, now: 0, pageStart: 0 });
    assert.match(text, /\nwhere: title\n/);
    assert.match(text, /\nconnection: unknown\n/);
    assert.match(text, /\ndevice: unknown\n/);
    assert.match(text, /\nerrors: none recorded\n```$/);
    assert.ok(!/browser:|gpu:|battle:|settings:/.test(text));
  });

  test('the battle source: none, a battle, and a source that throws', () => {
    setBattleSource(null);
    assert.equal(currentBattle(), null);
    setBattleSource(() => ({ battleId: 'b', spec: {} }));
    assert.deepEqual(currentBattle(), { battleId: 'b', spec: {} });
    setBattleSource(() => { throw new Error('gone'); });
    assert.equal(currentBattle(), null);
    setBattleSource(null);
  });
});

describe('field mount timings (mount: lines)', () => {
  beforeEach(() => clearMountRecords());

  test('a mount records its stages, cut waits, when the art / 3D / scene arrived and the downloads of its window', () => {
    let t = 1000;
    const timer = mountTimer(() => t);
    t += 120; timer.step('store');
    t += 300; timer.step('engine');
    t += 6000; timer.step('pixi');
    t += 2500; timer.step('art', true);
    timer.late('art'); timer.late('art');
    t += 1500; timer.done('engine');
    timer.done('fallback');
    t = 1000 + 31000; timer.late('3d');
    const [m] = mountRecords();
    assert.equal(m.kind, 'engine', 'the first done wins');
    assert.equal(m.total, 10420);
    assert.deepEqual(m.late.map((e) => [e.name, e.ms]), [['art', 8920], ['3d', 31000]], 'first of each name only');
    const resources = [
      { startTime: 900, transferSize: 5e6 },                          // before the mount: not counted
      { startTime: 1100, transferSize: 456133 },
      { startTime: 5000, transferSize: 0, decodedBodySize: 662772 },  // cache / service worker
      { startTime: 30000, transferSize: 9 * 1048576 },
      { startTime: 40000, transferSize: 1e6 },                        // after the last arrival: not counted
    ];
    assert.deepEqual(mountNet(m, resources), { files: 3, mb: (456133 + 9 * 1048576) / 1048576, cached: 1 });
    const text = buildDiagnostics({ state: {}, renderEvents: [], resources, mounts: [{ ...m, at: Date.UTC(2026, 9, 12, 3, 26, 8) }] });
    assert.ok(text.split('\n').includes('mount: 03:26:08 engine in 10.4 s | store 0.1, engine 0.3, pixi 6.0, art 2.5 cut'
      + ' | arrived: art 8.9 s, 3d 31.0 s | net 3 files, 9.4 MB, 1 cached'), text);
  });

  test('a stage lists its parts (0.05 s or more) and the rest after the last one; an arrival may carry a detail', () => {
    let t = 0;
    const timer = mountTimer(() => t);
    t += 200; timer.step('pixi');
    t += 300; timer.part('app');
    t += 20; timer.part('tiles');
    t += 5000; timer.part('fonts');
    t += 4200; timer.step('setup');
    t += 700; timer.step('art');
    timer.done('engine');
    t += 500; timer.late('frame', 'js 2, draw 11075 ms');
    t += 2000; timer.late('shown', '34 textures up in 2.1 s, longest 120 ms, frame js 3, draw 40 ms');
    const [m] = mountRecords();
    assert.deepEqual(m.steps.map((s) => s.parts?.map((p) => [p.name, p.ms]) ?? null),
      [null, [['app', 300], ['tiles', 20], ['fonts', 5000], ['rest', 4200]], null], 'parts belong to the stage they fall in');
    const line = buildDiagnostics({ state: {}, renderEvents: [], mounts: [{ ...m, at: Date.UTC(2026, 9, 17, 2, 37, 22) }] })
      .split('\n').find((l) => l.startsWith('mount:'));
    assert.equal(line, 'mount: 02:37:22 engine in 10.4 s | pixi 0.2, setup 9.5 (app 0.3, fonts 5.0, rest 4.2), art 0.7'
      + ' | arrived: frame 10.9 s (js 2, draw 11075 ms), shown 12.9 s (34 textures up in 2.1 s, longest 120 ms, frame js 3, draw 40 ms)');
  });

  test('only the last MOUNT_MAX mounts are kept; one still loading says so; no mounts, no line', () => {
    assert.doesNotMatch(buildDiagnostics({ state: {} }), /mount:/);
    for (let i = 0; i < MOUNT_MAX + 2; i++) mountTimer(() => i).done('fallback');
    mountTimer(() => 0);
    assert.equal(mountRecords().length, MOUNT_MAX);
    const lines = buildDiagnostics({ state: {} }).split('\n').filter((l) => l.startsWith('mount:'));
    assert.equal(lines.length, MOUNT_MAX);
    assert.match(lines.at(-1), /^mount: \d\d:\d\d:\d\d loading$/);
  });

  test('the device line says when the page is the home-screen app and the resource worker serves it', () => {
    const env = { viewport: '844x280', dpr: 3, touch: true, standalone: true, sw: true };
    assert.ok(buildDiagnostics({ state: {}, env }).split('\n').includes('device: 844x280 | @3x | touch | home-screen app | resource worker'));
  });
});

describe('the page before this one (previous page:)', () => {
  const rec = (o) => ({ v: 1, start: Date.UTC(2026, 9, 17, 2, 29, 10), at: Date.UTC(2026, 9, 17, 2, 37, 15), version: '1.4.5',
    vis: 'visible', hiddenAt: null, ended: false, lines: ['mount: 02:29:12 engine in 9.0 s', 'perf: R8 COMBAT 02:36:10–02:37:10 | fps 41', 'errors: none recorded'], ...o });
  const section = (p) => {
    const lines = buildDiagnostics({ state: {}, mounts: [], renderEvents: [], perf: [], entries: [], total: 0, previous: p }).replace(/\n```$/, '').split('\n');
    const at = lines.findIndex((l) => l.startsWith('previous page:'));
    return at < 0 ? [] : lines.slice(at);
  };

  test('the record\'s lines follow the errors as prev … lines, with how the page ended', () => {
    assert.deepEqual(section(rec({})), [
      'previous page: 02:29:10–02:37:15 (open 8m 05s) | version 1.4.5 | not closed: on screen at its last record (a crash, or the system ended it while shown)',
      'prev mount: 02:29:12 engine in 9.0 s', 'prev perf: R8 COMBAT 02:36:10–02:37:10 | fps 41', 'prev errors: none recorded',
    ]);
    assert.match(section(rec({ vis: 'hidden', hiddenAt: Date.UTC(2026, 9, 17, 2, 36, 0) }))[0], /\| not closed: ended in the background, hidden since 02:36:00 \(/);
    assert.match(section(rec({ ended: true }))[0], /\| closed \(a reload, a link or the app closed\)$/);
    assert.deepEqual(section(null), [], 'no record, no section');
  });

  test('the player names in the record are replaced like the rest of the report', () => {
    const state = { me: { name: 'Doctor' } };
    const text = buildDiagnostics({ state, mounts: [], renderEvents: [], perf: [], entries: [], total: 0,
      previous: rec({ lines: ['#1 02:30:00 request: Doctor left'] }) });
    assert.match(text, /prev #1 02:30:00 request: <me> left/);
    assert.doesNotMatch(text, /Doctor/);
  });
});

describe('the performance HUD\'s lines (perf:)', () => {
  test('the registered source adds one perf: line each, after the mounts; none registered or a throwing one, no line', () => {
    setPerfSource(null);
    assert.doesNotMatch(buildDiagnostics({ state: {}, mounts: [] }), /perf:/);
    setPerfSource(() => ['R1 PREP 0:10–0:50 | fps 60', 'R1 COMBAT 1:00–2:10 | fps 41']);
    const lines = buildDiagnostics({ state: {}, mounts: [], renderEvents: [] }).split('\n');
    assert.deepEqual(lines.filter((l) => l.startsWith('perf:')), ['perf: R1 PREP 0:10–0:50 | fps 60', 'perf: R1 COMBAT 1:00–2:10 | fps 41']);
    setPerfSource(() => { throw new Error('x'); });
    assert.doesNotMatch(buildDiagnostics({ state: {}, mounts: [] }), /perf:/);
    setPerfSource(null);
  });
});

describe('the resource cache (resources: line, a mount\'s res part, fieldLoading)', () => {
  beforeEach(() => { clearMountRecords(); setResourceSource(null); });

  test('the line: the last reconcile, the download, the cleanup and the worker; none registered, no line', () => {
    assert.doesNotMatch(buildDiagnostics({ state: {} }), /resources:/);
    const at = Date.UTC(2026, 9, 28, 4, 14, 33);
    const status = {
      reconcile: { at, ms: 3240, keys: 17012, stale: 2961, adopted: 12 },
      download: { phase: 'running', done: 120, total: 2961, failed: 2, queued: 2841, slowed: 'field' },
      cleanup: { left: 1500, deleted: 1461, held: true },
      worker: { at: at + 60000, hit: 1200, stale: 35, fetched: 80, bytes: 1.25 * 1048576, server: 3 },
    };
    const line = (s) => buildDiagnostics({ state: {}, resourceStatus: s }).split('\n').find((l) => l.startsWith('resources:'));
    assert.equal(line(status), 'resources: reconcile 04:14:33 3.2 s (17012 keys, 2961 stale, 12 adopted) | download running 120/2961, 2 failed, held (field loading)'
      + ' | cleanup 1461 deleted, 1500 left, held (match) | worker 1200 cached, 35 stale, 80 fetched (1.3 MB), 3 to server by 04:15:33');
    assert.equal(line({ reconcile: { at, ms: null }, download: { phase: 'ask', queued: 40, failed: 0 }, cleanup: { left: 0, deleted: 0 }, worker: null }),
      'resources: reconcile 04:14:33 running | download ask (40 queued)');
    setResourceSource({ status: () => status });
    assert.match(buildDiagnostics({ state: {} }), /^resources: reconcile 04:14:33 3\.2 s/m, 'the registered source');
    setResourceSource({ status: () => { throw new Error('x'); } });
    assert.doesNotMatch(buildDiagnostics({ state: {} }), /resources:/, 'a throwing source: no line');
  });

  test('a mount notes the queue at its start and the worker\'s answers until the field is shown', async () => {
    let n = 0;
    const sw = [{ hit: 10, stale: 0, fetched: 2, bytes: 0, server: 0 }, { hit: 150, stale: 30, fetched: 40, bytes: 2 * 1048576, server: 1 }];
    setResourceSource({ status: () => null, snap: async () => ({ queued: 2900 - n, cleanup: 2961, reconciling: n === 0, sw: sw[n++] }) });
    let t = 0;
    const timer = mountTimer(() => t);
    await Promise.resolve();
    t += 5000; timer.done('engine');
    t += 2000; timer.late('shown');
    await new Promise((r) => setTimeout(r, 0));
    const [m] = mountRecords();
    const line = buildDiagnostics({ state: {}, renderEvents: [], mounts: [{ ...m, at: Date.UTC(2026, 9, 28, 4, 14, 43) }] })
      .split('\n').find((l) => l.startsWith('mount:'));
    assert.equal(line, 'mount: 04:14:43 engine in 5.0 s | arrived: shown 7.0 s'
      + ' | res reconciling, 2900 queued, 2961 stale; worker 140 cached, 30 stale, 38 fetched (2.0 MB), 1 to server');
    assert.equal(n, 2, 'one snapshot at the start, one when shown');
  });

  test('fieldLoading: the newest mount until its field is shown, cancelled, or FIELD_LOADING_MAX_MS old', () => {
    assert.equal(fieldLoading(0), false, 'no mount');
    let t = 1000;
    const a = mountTimer(() => t);
    assert.equal(fieldLoading(t), true);
    a.done('fallback');
    assert.equal(fieldLoading(t), true, 'the engine still loads behind the simplified view');
    assert.equal(fieldLoading(t + FIELD_LOADING_MAX_MS), false, 'a field that never shows stops holding');
    a.late('shown');
    assert.equal(fieldLoading(t), false);
    const b = mountTimer(() => t);
    b.done('cancelled');
    assert.equal(fieldLoading(t), false);
  });
});
