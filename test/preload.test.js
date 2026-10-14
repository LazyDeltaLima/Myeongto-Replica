// The match code preload (server/http/preload.js GET /preload.json, public/js/preload.js): the lobby downloads the render
// engine, the browser sim, three.js and Pixi ahead of the match, as one flat list. Every entry must be served, under the
// URL the page's own imports use (the versioned /b/<tag>/r/ URLs too, where /shared/ sits one directory higher), and the
// client must ask for all of them at once.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { buildPreloadList, specOfUrl } from '../server/http/preload.js';
import { preloadFiles } from '../public/js/preload.js';

let srv = null;
after(async () => { if (srv) await srv.close(); });

test('the list covers the engine, the browser sim (every kit), three.js and Pixi; classic scripts apart', async () => {
  const { modules, scripts } = await buildPreloadList();
  for (const m of ['../js/render/app.js', '../js/render/board3d/load.js', '../js/assets.js', '../sim/spec.js', '../sim/simdata.js',
    '../sim/content/support/index.js', '../sim/content/kits/index.js', '../sim/content/tokens.js', '../data.js', '../vendor/three.module.js',
    '../vendor/three.core.js', '../../shared/protocol.js']) assert.ok(modules.includes(m), m);
  assert.ok(modules.filter((m) => m.startsWith('../sim/content/kits/ops/')).length > 100, 'every operator kit (a run-time-built import)');
  assert.deepEqual(scripts, ['../vendor/pixi.min.js', '../vendor/pixi-spine.js']);
  assert.ok(!modules.some((m) => /pixi\.min|pixi-spine|nodedata/i.test(m)), 'no classic script, no Node-only module');
  assert.equal(new Set(modules).size, modules.length);
  assert.equal(specOfUrl('/shared/x.js'), '../../shared/x.js');
  assert.equal(specOfUrl('/sim/x.js'), '../sim/x.js');
});

test('GET /preload.json: every entry is served under the page\'s versioned URLs and the plain ones', async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const res = await fetch(`${srv.url}/preload.json`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const list = await res.json();
  const health = await (await fetch(`${srv.url}/healthz`)).json();
  assert.equal(list.build, health.build);
  assert.ok(list.modules.length > 250, `${list.modules.length} modules`);
  // resolved beside public/js/preload.js, as the page does
  const versioned = `${srv.url}/b/${list.build}/r/js/preload.js`;
  const plain = `${srv.url}/js/preload.js`;
  const bad = [];
  for (const spec of [...list.modules, ...list.scripts]) {
    const v = new URL(spec, versioned);
    // the URL every relative import of the module reaches: /shared/ overshoots to /b/<tag>/shared/ (server/http/buildTag.js)
    const want = spec.startsWith('../../shared/') ? `/b/${list.build}/shared/` : `/b/${list.build}/r/`;
    if (!v.pathname.startsWith(want)) bad.push(`${spec} → ${v.pathname}`);
    for (const url of [v, new URL(spec, plain)]) {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.status !== 200 || !/javascript/.test(r.headers.get('content-type') || '')) bad.push(`${url.pathname} → ${r.status} ${r.headers.get('content-type')}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('preloadFiles: every module as a modulepreload link at once, Pixi warmed by fetch; no link support → fetch everything', () => {
  const doc = (supports) => {
    const head = { links: [], appendChild(l) { this.links.push(l); } };
    return { head, createElement: () => ({ relList: { supports: (r) => supports && r === 'modulepreload' } }) };
  };
  const list = { modules: ['../js/render/app.js', '../../shared/protocol.js', 'https://evil.example/x.js', '/abs.js', '../x.css', 7], scripts: ['../vendor/pixi.min.js'] };
  const base = 'https://h/b/0123456789ab/r/js/preload.js';
  const fetched = [];
  const fetchFn = (u) => { fetched.push(u); return Promise.resolve({ arrayBuffer: async () => new ArrayBuffer(0) }); };
  const d = doc(true);
  assert.equal(preloadFiles(list, { doc: d, fetchFn, base }), 3);
  assert.deepEqual(d.head.links.map((l) => [l.rel, l.href]), [
    ['modulepreload', 'https://h/b/0123456789ab/r/js/render/app.js'],
    ['modulepreload', 'https://h/b/0123456789ab/shared/protocol.js'],
  ]);
  assert.deepEqual(fetched, ['https://h/b/0123456789ab/r/vendor/pixi.min.js']);
  fetched.length = 0;
  const old = doc(false);
  assert.equal(preloadFiles(list, { doc: old, fetchFn, base }), 3);
  assert.equal(old.head.links.length, 0);
  assert.deepEqual(fetched, ['https://h/b/0123456789ab/r/js/render/app.js', 'https://h/b/0123456789ab/shared/protocol.js', 'https://h/b/0123456789ab/r/vendor/pixi.min.js']);
  assert.equal(preloadFiles(null, { doc: d, fetchFn, base }), 0);
});
