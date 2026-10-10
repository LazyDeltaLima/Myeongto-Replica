// test/render/board3d-retry.test.js — the 3D board comes back on phones (2026-10-10 maintainer report: 「모바일에서 간헐적으로
// 3D 렌더링이 안 된다」): the retry schedule (render/app/retry3d.js: delays, a try due while hidden waits, used-up tries
// start over when the page is shown), a failed load of the board art or of the local-art manifest is loaded again on
// `retry` (render/board3d/load.js, assets.js image/local) instead of being kept for the page, and the bug report shows
// the board's 3D state and what it did (diag.js render lines); the effect renderers' library frees its textures and
// meshes when the view goes (fxplayer.js FxLibrary.dispose).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRetry3d } from '../../public/js/render/app/retry3d.js';
import { loadBoardPack, resetBoardPack, boardArtState, loadBoard3d, PACK_IMAGES } from '../../public/js/render/board3d/load.js';
import { createAssets } from '../../public/js/assets.js';
import { FxLibrary } from '../../public/js/render/fxplayer.js';
import { buildDiagnostics, noteRender, renderEvents, clearRenderEvents, renderStatus, RENDER_MAX } from '../../public/js/diag.js';

function fakeTimers() {
  const list = [];
  return {
    list,
    set: (fn, ms) => { const t = { fn, ms }; list.push(t); return t; },
    clear: (t) => { const i = list.indexOf(t); if (i >= 0) list.splice(i, 1); },
    /** run the next timer */
    run() { const t = list.shift(); t?.fn(); return t?.ms; },
  };
}

describe('render/app/retry3d.js schedule', () => {
  test('delays in order, then waits until the page is shown, then starts over', () => {
    const timers = fakeTimers();
    const r = createRetry3d({ delays: [10, 20, 30], timers });
    let runs = 0;
    const fn = () => { runs++; };
    assert.equal(r.schedule(fn), true);
    assert.equal(timers.run(), 10);
    assert.equal(r.schedule(fn), true);
    assert.equal(timers.run(), 20);
    assert.equal(r.schedule(fn), true);
    assert.equal(timers.run(), 30);
    assert.equal(runs, 3);
    assert.equal(r.schedule(fn), false, 'used up');
    assert.deepEqual(r.state(), { pending: false, waiting: false, tries: 3, spent: true });
    assert.equal(r.wake(), true, 'the page shown again: the delays start over');
    assert.equal(timers.run(), 10);
    assert.equal(runs, 4);
    assert.equal(r.wake(), false, 'nothing used up, nothing waiting: no extra try');
  });

  test('a try due while hidden waits for the page, and runs a moment after it is shown', () => {
    const timers = fakeTimers();
    let hidden = true;
    const r = createRetry3d({ delays: [10, 20], timers, hidden: () => hidden });
    let runs = 0;
    r.schedule(() => { runs++; });
    timers.run();
    assert.equal(runs, 0, 'not while hidden');
    assert.equal(r.state().waiting, true);
    hidden = false;
    assert.equal(r.wake(), true);
    assert.equal(timers.list[0].ms, 10, 'after the first delay, not at once');
    timers.run();
    assert.equal(runs, 1);
  });

  test('reset gives the full delays again; cancel drops the pending try', () => {
    const timers = fakeTimers();
    const r = createRetry3d({ delays: [10, 20], timers });
    let runs = 0;
    r.schedule(() => { runs++; }); timers.run();
    r.reset();
    r.schedule(() => { runs++; });
    assert.equal(timers.list[0].ms, 10, 'stayed up: back to the first delay');
    r.cancel();
    assert.equal(timers.list.length, 0);
    assert.equal(r.wake(), false, 'cancelled: nothing to wake');
    assert.equal(runs, 1);
  });
});

describe('board art loads again after a failure (load.js + assets.js)', () => {
  const manifest = { groups: {} };
  for (const [g, n] of Object.values(PACK_IMAGES)) (manifest.groups[g] ||= {})[n] = { path: `/assets/local/${g}/${n}.png` };

  test('a failed diffuse atlas is not kept: loadBoardPack(retry) asks the store again', async () => {
    resetBoardPack();
    let fail = true;
    const requests = [];
    const store = {
      local: async () => manifest,
      localUrl: (g, n) => manifest.groups[g]?.[n]?.path || null,
      image: async (u, o) => { requests.push(!!o?.retry); return fail ? null : { width: 8, height: 8 }; },
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, json: async () => null, text: async () => '' });
    try {
      assert.equal(await loadBoardPack(store), null, 'the dropped request');
      assert.equal(await loadBoardPack(store), null, 'without retry the result stays cached');
      fail = false;
      const pack = await loadBoardPack(store, { retry: true });
      assert.ok(pack?.images.D, 'loaded on the retry');
      assert.ok(requests.includes(true), 'the store is asked to load failed images again');
      assert.equal(await loadBoardPack(store, { retry: true }), pack, 'a good pack stays cached');
    } finally {
      globalThis.fetch = realFetch;
      resetBoardPack();
    }
  });

  test('boardArtState: listed / not on this host / manifest unreadable; loadBoard3d says never or retry', async () => {
    const store = (m) => ({ local: async () => m, localUrl: (g, n) => m?.groups?.[g]?.[n]?.path || null, image: async () => null });
    assert.equal(await boardArtState(store(manifest)), 'yes');
    assert.equal(await boardArtState(store({ groups: {} })), 'no');
    assert.equal(await boardArtState(store(null)), 'unknown');
    assert.equal(await boardArtState(null), 'no');
    assert.deepEqual(await loadBoard3d(store({ groups: {} })), { status: 'never', why: 'no board art on this server' });
    assert.equal((await loadBoard3d(store(null))).status, 'retry');
  });

  test('assets.image(retry) loads a failed image again; a plain call keeps the failure', async () => {
    let fail = true, loads = 0;
    const a = createAssets({ manifest: {}, loadImage: async (u) => { loads++; if (fail) throw new Error('decode'); return { src: u }; } });
    assert.equal(await a.image('/x.png'), null);
    fail = false;
    assert.equal(await a.image('/x.png'), null, 'kept: no request on every frame for a missing image');
    assert.equal(loads, 1);
    assert.deepEqual(await a.image('/x.png', { retry: true }), { src: '/x.png' });
    assert.equal(loads, 2);
    await a.image('/x.png', { retry: true });
    assert.equal(loads, 2, 'a loaded image is not loaded again');
  });

  test('assets.local(retry) fetches the local-art manifest again after a failed fetch', async () => {
    let fail = true, fetches = 0;
    const a = createAssets({ manifest: {}, fetch: async () => { fetches++; if (fail) throw new Error('offline'); return { ok: true, json: async () => manifest }; } });
    assert.equal(await a.local(), null);
    fail = false;
    assert.equal(await a.local(), null, 'kept without retry');
    assert.equal(await a.local({ retry: true }), manifest);
    assert.equal(fetches, 2);
    await a.local({ retry: true });
    assert.equal(fetches, 2, 'a manifest once read is kept');
  });
});

describe('diag.js: the board in the bug report', () => {
  test('render line: view kind, 3D off with its reason, waiting, losses; render events in order', () => {
    clearRenderEvents();
    noteRender('3d lost', null, Date.UTC(2026, 9, 10, 1, 2, 3));
    noteRender('3d waits', 'context lost; tries again when the page is shown', Date.UTC(2026, 9, 10, 1, 2, 30));
    const text = buildDiagnostics({ state: {}, now: 100000, pageStart: 0,
      render: { kind: 'engine', board3d: { on: false, pref: 'auto', error: 'context lost', recovering: false, waiting: true, losses: 2 } } });
    assert.match(text, /render: view engine \| 3d off: context lost \| waiting for the page to be shown \| context lost 2x/);
    assert.match(text, /render events: 01:02:03 3d lost; 01:02:30 3d waits \(context lost; tries again when the page is shown\)/);
    const on = buildDiagnostics({ state: {}, render: { kind: 'engine', board3d: { on: true, textures: 41, losses: 0 } }, renderEvents: [] });
    assert.match(on, /render: view engine \| 3d on \(41 textures\)/);
    assert.doesNotMatch(on, /render events/);
    assert.doesNotMatch(buildDiagnostics({ state: {}, renderEvents: [] }), /render:/, 'no field view: no render line');
    clearRenderEvents();
  });

  test('the event log keeps the last RENDER_MAX and strips hosts; renderStatus reads the view on screen', () => {
    clearRenderEvents();
    for (let i = 0; i < RENDER_MAX + 3; i++) noteRender(`e${i}`, 'http://192.168.1.5:3000/x');
    const ev = renderEvents();
    assert.equal(ev.length, RENDER_MAX);
    assert.equal(ev[0].event, 'e3');
    assert.equal(ev[0].detail, '/x');
    clearRenderEvents();
    assert.equal(renderStatus({}), null);
    const g = { __SP_VIEW__: { kind: 'engine', raw: { stats: () => ({ board3d: { on: true } }) } } };
    assert.deepEqual(renderStatus(g), { kind: 'engine', board3d: { on: true } });
    assert.deepEqual(renderStatus({ __SP_VIEW__: { kind: 'fallback', raw: {} } }), { kind: 'fallback', board3d: null });
  });
});

describe('render/fxplayer.js FxLibrary.dispose (the effect renderers end with their view, render/fxgame.js destroy)', () => {
  test('every texture and mesh geometry is disposed and the caches are emptied', async () => {
    const lib = new FxLibrary('/x/');
    const freed = [];
    lib.textures.set('a', { dispose: () => freed.push('tex a') });
    lib.textures.set('b', { dispose: () => freed.push('tex b') });
    lib.meshes.set('m', Promise.resolve({ dispose: () => freed.push('mesh m') }));
    lib.meshes.set('missing', Promise.resolve(null));
    lib.defs.set('k', Promise.resolve({}));
    lib.dispose();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(freed.sort(), ['mesh m', 'tex a', 'tex b']);
    assert.equal(lib.textures.size + lib.meshes.size + lib.defs.size, 0);
  });
});
