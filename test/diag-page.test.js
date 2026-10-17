// test/diag-page.test.js — the page record (public/js/diag.js installPageRecord): the record of the page before this
// one is read once at boot, this page's own is written to localStorage (at once when hidden or closed, a second after
// an error), and how the page ended is kept. Its own file: the record is installed once per module.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'sp.diag.page';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const docListeners = {};
const winListeners = {};
globalThis.document = { visibilityState: 'visible', addEventListener: (n, fn) => { docListeners[n] = fn; } };
globalThis.addEventListener = (n, fn) => { winListeners[n] = fn; };
const prev = { v: 1, start: Date.now() - 600_000, at: Date.now() - 5_000, version: '1.4.5', vis: 'visible', hiddenAt: null, ended: false, lines: ['perf: R8 PREP | fps 54'] };
store.set(KEY, JSON.stringify(prev));
const diag = await import('../public/js/diag.js');

test('boot reads the previous page and starts this one\'s record; hidden and closed are written at once', () => {
  assert.equal(diag.previousPage(), null, 'nothing before the install');
  diag.installPageRecord();
  assert.deepEqual(diag.previousPage(), prev);
  const own = JSON.parse(store.get(KEY));
  assert.equal(own.ended, false);
  assert.equal(own.vis, 'visible');
  assert.ok(own.start > prev.at, 'this page\'s record replaced the previous one');
  assert.ok(own.lines.includes('errors: none recorded'));

  globalThis.document.visibilityState = 'hidden';
  docListeners.visibilitychange();
  const hidden = JSON.parse(store.get(KEY));
  assert.equal(hidden.vis, 'hidden');
  assert.ok(Number.isFinite(hidden.hiddenAt));

  winListeners.pagehide({ persisted: false });
  assert.equal(JSON.parse(store.get(KEY)).ended, true);
  winListeners.pageshow({ persisted: true });
  assert.equal(JSON.parse(store.get(KEY)).ended, false, 'back from the back/forward cache: open again');
  assert.match(diag.buildDiagnostics({ state: {}, mounts: [], perf: [] }), /\nprev perf: R8 PREP \| fps 54(\n|$)/);
});

test('an error is written within a second; the record carries its version and its time', async () => {
  diag.recordError('error', new Error('late boom'));
  await new Promise((r) => setTimeout(r, 1100));
  assert.ok(JSON.parse(store.get(KEY)).lines.some((l) => l.includes('late boom')));
  const rec = diag.pageRecord(0);
  assert.equal(rec.v, 1);
  assert.equal(rec.at, 0);
  assert.ok(diag.PAGE_KEEP_MS >= 3600_000);
});
