// Field-host ownership under cancellation and timeout. Browser tests cover the actual renderer; this fixture runs
// the production orchestration with controlled imports and timers, without a DOM or GPU dependency.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import vm from 'node:vm';

const sourcePath = new URL('../../public/js/ui/fieldHost.js', import.meta.url);
const source = readFileSync(sourcePath, 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '')
  .replace("import('../assets.js')", 'importAssets()')
  .replace("import('../render/app.js')", 'importApp()');
const METHODS = ['setStage', 'setCamera', 'setPrep', 'enterBattle', 'pushSnapshot', 'pushEvents', 'highlightTiles', 'on', 'resize'];
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

function fixture({ slowApp = false } = {}) {
  const timers = new Map(), requests = [], fallbacks = [], warnings = [], mounts = [];
  let appArrives = null;
  let timerId = 0;
  const unrelated = { name: 'unrelated' };
  const host = {
    children: [unrelated],
    get firstChild() { return this.children[0] || null; },
    appendChild(node) { this.children.push(node); },
    removeChild(node) { const i = this.children.indexOf(node); if (i >= 0) this.children.splice(i, 1); },
  };
  function view(name, valid = true) {
    const node = { name };
    host.appendChild(node);
    return {
      ...(valid ? Object.fromEntries(METHODS.map((k) => [k, () => {}])) : {}),
      node, destroyCalls: 0,
      destroy() { this.destroyCalls++; host.removeChild(node); },
    };
  }
  const context = vm.createContext({
    AbortController, DOMException, URLSearchParams, Promise,
    console: { warn: (...args) => warnings.push(args) },
    audio: {}, data: { get() { return null; } }, settingsStore: { get() { return {}; } }, noteRender: () => {},
    mountTimer() { const m = { steps: [], kind: null, late: [] }; mounts.push(m); return { step: (n) => m.steps.push(n), late: (n) => m.late.push(n), done: (k) => { m.kind ??= k; } }; },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    importAssets: async () => null,
    importApp: async () => {
      if (slowApp) await new Promise((resolve) => { appArrives = resolve; });
      return {
        createFieldView(_host, opts) {
          // Deliberately ignore cancellation: the host must still dispose a factory's late return value.
          return new Promise((resolve, reject) => requests.push({ resolve, reject, signal: opts.signal, deadline: opts.deadline, timing: opts.timing }));
        },
      };
    },
    createFallbackView() {
      const fallback = view('fallback');
      fallbacks.push({ view: fallback, rendererAborted: requests.at(-1)?.signal?.aborted });
      return fallback;
    },
  });
  vm.runInContext(source + '\nglobalThis.mount = mountFieldView;', context, { filename: sourcePath.pathname });
  return {
    host, unrelated, timers, requests, fallbacks, warnings, view, mounts,
    mount: (signal) => context.mount(host, { signal }),
    mountLate: (signal) => context.mount(host, { signal, late: true }),
    arrive: () => appArrives(),
    timeout() { const fn = [...timers.values()].at(-1); assert.ok(fn, 'initialization has a deadline'); fn(); },
  };
}

function settled(promise) {
  const result = { state: 'pending', value: null };
  promise.then((value) => { result.state = 'fulfilled'; result.value = value; }, (error) => { result.state = 'rejected'; result.value = error; });
  return result;
}

test('successful initialization releases deadlines and cancellation listeners', async () => {
  const f = fixture(), controller = new AbortController();
  const pending = f.mount(controller.signal);
  await flush();
  const raw = f.view('engine');
  f.requests[0].resolve(raw);
  const mounted = await pending;
  assert.equal(mounted.kind, 'engine');
  assert.equal(f.timers.size, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(getEventListeners(f.requests[0].signal, 'abort').length, 0);
  mounted.destroy();
  assert.equal(raw.destroyCalls, 1);
});

test('the factory gets the race\'s own deadline, so its optional waits end before the timeout', async () => {
  const f = fixture();
  const t0 = Date.now();
  const pending = f.mount();
  await flush();
  const { deadline } = f.requests[0];
  assert.ok(deadline >= t0 + 12000 && deadline <= Date.now() + 12000, `deadline ${deadline - t0} ms after the mount`);
  f.requests[0].resolve(f.view('engine'));
  (await pending).destroy();
});

test('each engine attempt is timed for the report: its stages, then engine / fallback / cancelled', async () => {
  const f = fixture();
  const ok = f.mount();
  await flush();
  assert.equal(typeof f.requests[0].timing?.step, 'function', 'the factory gets the timer for its own stages');
  f.requests[0].resolve(f.view('engine'));
  (await ok).destroy();
  const late = f.mount();
  await flush();
  f.timeout();
  (await late).destroy();
  const controller = new AbortController();
  const gone = settled(f.mount(controller.signal));
  await flush();
  controller.abort();
  await flush();
  assert.equal(gone.state, 'rejected');
  assert.deepEqual(f.mounts.map((m) => [m.steps.join(','), m.kind]),
    [['store,engine', 'engine'], ['store,engine', 'fallback'], ['store,engine', 'cancelled']]);
});

test('cancelling a pending mount rejects without fallback and disposes a late result', async () => {
  const f = fixture(), controller = new AbortController();
  const result = settled(f.mount(controller.signal));
  await flush();
  controller.abort();
  await flush();
  assert.equal(result.state, 'rejected');
  assert.equal(result.value.name, 'AbortError');
  assert.equal(f.fallbacks.length, 0);
  assert.equal(f.warnings.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  const late = f.view('late');
  f.requests[0].resolve(late);
  await flush();
  assert.equal(late.destroyCalls, 1);
  assert.deepEqual(f.host.children, [f.unrelated]);
});

test('cancellation between factory resolution and mount continuation disposes the resolved view', async () => {
  const f = fixture(), controller = new AbortController();
  const result = settled(f.mount(controller.signal));
  await flush();
  const raw = f.view('settling');
  f.requests[0].resolve(raw);
  await Promise.resolve();
  controller.abort();
  await flush();
  assert.equal(result.state, 'rejected');
  assert.equal(result.value.name, 'AbortError');
  assert.equal(raw.destroyCalls, 1);
  assert.equal(f.fallbacks.length, 0);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.host.children, [f.unrelated]);
});

test('an invalid renderer API is disposed and aborted before fallback mounts', async () => {
  const f = fixture();
  const pending = f.mount();
  await flush();
  const invalid = f.view('invalid', false);
  f.requests[0].resolve(invalid);
  const fallback = await pending;
  assert.equal(fallback.kind, 'fallback');
  assert.equal(invalid.destroyCalls, 1);
  assert.equal(f.fallbacks[0].rendererAborted, true);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.host.children, [f.unrelated, f.fallbacks[0].view.node]);
  fallback.destroy();
});

test('a timed-out factory returning late cannot remove a replacement view or unrelated children', async () => {
  const f = fixture();
  const first = f.mount();
  await flush();
  f.timeout();
  const fallback = await first;
  assert.equal(fallback.kind, 'fallback');
  fallback.destroy();
  const replacementPending = f.mount();
  await flush();
  const replacement = f.view('replacement');
  f.requests[1].resolve(replacement);
  const mounted = await replacementPending;
  const late = f.view('late');
  f.requests[0].resolve(late);
  await flush();
  assert.equal(late.destroyCalls, 1);
  assert.equal(replacement.destroyCalls, 0);
  assert.equal(f.fallbacks[0].rendererAborted, true);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.host.children, [f.unrelated, replacement.node]);
  mounted.destroy();
});

// ---- `late` (the game screen's hook): an engine that only ran out of time keeps loading behind the simplified view ----

test('late: a factory that runs out of time keeps loading; the fallback carries the engine once it arrives', async () => {
  const f = fixture(), controller = new AbortController();
  const pending = f.mountLate(controller.signal);
  await flush();
  f.timeout();
  const fallback = await pending;
  assert.equal(fallback.kind, 'fallback');
  assert.equal(typeof fallback.upgrade?.then, 'function', 'the fallback carries the late engine');
  assert.equal(f.requests[0].signal.aborted, false, 'the engine attempt is not cancelled');
  assert.equal(f.fallbacks[0].rendererAborted, false);
  f.requests[0].timing.step('setup'); // a stage after the race was lost is not the race's
  const raw = f.view('engine');
  f.requests[0].resolve(raw);
  const engine = await fallback.upgrade;
  assert.equal(engine.kind, 'engine');
  assert.ok(engine.raw === raw, 'the engine view of this attempt');
  assert.deepEqual([f.mounts[0].steps.join(','), f.mounts[0].kind, f.mounts[0].late.join(',')], ['store,engine', 'fallback', 'engine']);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0, 'handed over: the caller owns it now');
  controller.abort();
  await flush();
  assert.equal(raw.destroyCalls, 0, 'cancelling the old mount does not destroy the handed-over engine');
  fallback.cancelUpgrade();
  assert.equal(f.requests[0].signal.aborted, false, 'nor does a late cancelUpgrade');
  fallback.destroy();
  engine.destroy();
  assert.deepEqual(f.host.children, [f.unrelated]);
});

test('late: an engine import that runs out of time starts the factory when it lands, with a fresh budget', async () => {
  const f = fixture({ slowApp: true });
  const pending = f.mountLate();
  await flush();
  f.timeout();
  const fallback = await pending;
  assert.equal(fallback.kind, 'fallback');
  assert.equal(f.requests.length, 0);
  const t0 = Date.now();
  f.arrive();
  await flush();
  assert.equal(f.requests.length, 1, 'the factory starts once the import is in');
  assert.ok(f.requests[0].deadline >= t0 + 12000, 'its optional waits get a full budget again');
  const raw = f.view('engine');
  f.requests[0].resolve(raw);
  assert.ok((await fallback.upgrade).raw === raw);
  fallback.destroy();
  raw.destroy();
});

test('late: cancelled before the engine arrives (unmount, cancelUpgrade, a failing factory) → no engine, nothing left behind', async () => {
  for (const how of ['abort', 'cancel', 'reject', 'invalid']) {
    const f = fixture(), controller = new AbortController();
    const pending = f.mountLate(controller.signal);
    await flush();
    f.timeout();
    const fallback = await pending;
    if (how === 'abort') controller.abort();
    if (how === 'cancel') fallback.cancelUpgrade();
    if (how === 'reject') f.requests[0].reject(new Error('boom'));
    if (how === 'invalid') f.requests[0].resolve(f.view('invalid', false));
    await flush();
    if (how === 'abort' || how === 'cancel') {
      assert.equal(f.requests[0].signal.aborted, true, how);
      const late = f.view('late');
      f.requests[0].resolve(late);
      await flush();
      assert.equal(late.destroyCalls, 1, `${how}: a view returned after cancellation is disposed`);
    }
    assert.equal(await fallback.upgrade, null, how);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0, how);
    fallback.destroy();
    assert.deepEqual(f.host.children, [f.unrelated], how);
  }
});

test('late: an engine that fails outright still mounts the plain fallback, without an upgrade', async () => {
  const f = fixture();
  const pending = f.mountLate();
  await flush();
  f.requests[0].reject(new Error('no WebGL'));
  const fallback = await pending;
  assert.equal(fallback.kind, 'fallback');
  assert.equal(fallback.upgrade, undefined);
  assert.equal(f.requests[0].signal.aborted, true);
  fallback.destroy();
});
