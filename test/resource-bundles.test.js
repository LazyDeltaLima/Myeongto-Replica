// The resource bundles (tools/assets/resource-bundles.mjs, tools/build-browser-resources.mjs `bundles`): this server's
// small files joined into files of about 8 MB for the pre-download, and how the server sends them (server/http/files.js:
// immutable, a text bundle gzipped). The page's side (cutting a bundle into its files) is public/js/resources.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { planBundles, writeBundles, BUNDLE_URL } from '../tools/assets/resource-bundles.mjs';
import { createStaticHandler } from '../server/index.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const KB = 1024;
/** a list entry with its bytes (`b`, not part of the list) */
const entry = (p, s, extra = {}) => { const b = Buffer.alloc(s, p); return { p, s, h: sha(b), b, ...extra }; };
const sorted = (files) => files.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
const paths = (files, b) => b.m.map((i) => files[i].p);
const PACKS = { skin: ['/assets/local/fx/skin/'] };

describe('planBundles', () => {
  test('only this server\'s files, one kind and one choice per bundle, a small folder whole, a big one by its subfolders', () => {
    const files = sorted([
      entry('/assets/local/fx/a/x.json', 3 * KB), entry('/assets/local/fx/a/y.json', 3 * KB), entry('/assets/local/fx/a/t.webp', 4 * KB),
      entry('/assets/local/fx/a/u.webp', 4 * KB), entry('/assets/local/fx/b/z.json', 3 * KB), entry('/assets/local/fx/b/w.json', 3 * KB),
      entry('/assets/local/fx/skin/s/1.json', 2 * KB), entry('/assets/local/fx/skin/s/2.json', 2 * KB),
      entry('/assets/local/chararts/c.webp', 2 * KB, { r: 'lo' }), entry('/assets/local/chararts/full/c.webp', 2 * KB, { r: 'hi' }),
      entry('/assets/local/chararts/d.webp', 2 * KB, { r: 'lo' }), entry('/assets/local/chararts/full/d.webp', 2 * KB, { r: 'hi' }),
      entry('/assets/audio/voice/kr/a/1.mp3', 2 * KB), entry('/assets/audio/voice/jp/a/1.mp3', 2 * KB),
      entry('/assets/audio/voice/kr/a/2.mp3', 2 * KB), entry('/assets/audio/voice/jp/a/2.mp3', 2 * KB),
      entry('/assets/spine/op/x/x.png', 2 * KB, { u: 'https://raw.githubusercontent.com/o/r/b/x.png' }),
      entry('/assets/spine/op/x/y.png', 2 * KB, { u: 'https://raw.githubusercontent.com/o/r/b/y.png' }),
      entry('/assets/local/ui/lone.json', 1 * KB), entry('/assets/local/ui/huge.webp', 20 * KB), entry('/assets/local/ui/huge2.webp', 20 * KB),
    ]);
    const plan = planBundles(files, { packs: PACKS, max: 10 * KB });
    const groups = plan.map((b) => paths(files, b));
    // every member is a file without `u`, at most `max`, in the list's order, in one bundle only
    const seen = new Set();
    for (const b of plan) {
      assert.ok(b.m.length > 1, `${b.p}: a bundle of one file is left to the file`);
      assert.deepEqual(b.m, [...b.m].sort((x, y) => x - y), `${b.p}: members in the list's order`);
      assert.equal(b.s, b.m.reduce((n, i) => n + files[i].s, 0));
      assert.ok(b.s <= 10 * KB);
      for (const i of b.m) { assert.ok(!files[i].u, 'jsDelivr / raw files stay one by one'); assert.ok(!seen.has(i)); seen.add(i); }
      const kinds = new Set(b.m.map((i) => /\.(json)$/.test(files[i].p)));
      assert.equal(kinds.size, 1, `${b.p}: text and pictures apart`);
      assert.match(b.p, kinds.has(true) ? /^\/assets\/bundles\/text-/ : /^\/assets\/bundles\/media-/);
      assert.match(b.p, /^\/assets\/bundles\/(text|media)-[A-Za-z0-9_.-]+-[0-9a-f]{12}\.pack$/);
    }
    // local/fx (24 KB) is over 10 KB: its folders a and b are their own groups; a's pictures and texts apart
    assert.ok(groups.some((g) => g.join() === '/assets/local/fx/a/x.json,/assets/local/fx/a/y.json'));
    assert.ok(groups.some((g) => g.join() === '/assets/local/fx/a/t.webp,/assets/local/fx/a/u.webp'));
    assert.ok(groups.some((g) => g.join() === '/assets/local/fx/b/w.json,/assets/local/fx/b/z.json'));
    // the skin pack apart from the rest; one 立绘 copy and one voice language per bundle
    assert.ok(groups.some((g) => g.join() === '/assets/local/fx/skin/s/1.json,/assets/local/fx/skin/s/2.json'));
    assert.ok(groups.some((g) => g.join() === '/assets/local/chararts/c.webp,/assets/local/chararts/d.webp'));
    assert.ok(groups.some((g) => g.join() === '/assets/local/chararts/full/c.webp,/assets/local/chararts/full/d.webp'));
    assert.ok(groups.some((g) => g.join() === '/assets/audio/voice/kr/a/1.mp3,/assets/audio/voice/kr/a/2.mp3'));
    assert.ok(groups.some((g) => g.join() === '/assets/audio/voice/jp/a/1.mp3,/assets/audio/voice/jp/a/2.mp3'));
    // a file over `max` and a lone file stay files
    for (const p of ['/assets/local/ui/huge.webp', '/assets/local/ui/huge2.webp', '/assets/local/ui/lone.json']) assert.ok(!groups.flat().includes(p), p);
    assert.equal(plan.length, 8);
  });

  test('a big folder is cut in path order; a changed file renames only its own bundle', () => {
    const make = (changed) => sorted([
      ...Array.from({ length: 9 }, (_, i) => entry(`/assets/local/ui/outer/f${i}.webp`, 3 * KB)),
      entry('/assets/local/ui/battle/g0.webp', 3 * KB), entry('/assets/local/ui/battle/g1.webp', changed ? 2 * KB : 3 * KB),
    ]);
    const a = planBundles(make(false), { max: 10 * KB });
    const b = planBundles(make(true), { max: 10 * KB });
    const fa = make(false);
    // 27 KB of outer/ → 9 + 9 + 9: three files per bundle
    assert.deepEqual(a.filter((x) => x.p.includes('outer')).map((x) => paths(fa, x).length), [3, 3, 3]);
    const nameA = new Set(a.map((x) => x.p)); const nameB = new Set(b.map((x) => x.p));
    const gone = [...nameA].filter((p) => !nameB.has(p));
    assert.equal(gone.length, 1, 'only the bundle holding the changed file is renamed');
    assert.match(gone[0], /media-local\.ui\.battle-/);
    assert.deepEqual(planBundles(make(false), { max: 10 * KB }), a, 'the same list plans the same bundles');
  });
});

describe('writeBundles', () => {
  test('a bundle is its members\' bytes one after another; a kept one is not rewritten; prune deletes the rest', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-bundles-'));
    try {
      const files = sorted([entry('/assets/local/fx/a/x.json', 300), entry('/assets/local/fx/a/y.json', 500), entry('/img/emotes/e.webp', 10)]);
      const put = (f) => { const abs = path.join(dir, f.p); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, f.b); };
      files.forEach(put);
      const fileOf = (p) => path.join(dir, p);
      const assets = path.join(dir, 'assets');
      fs.mkdirSync(path.join(assets, 'bundles'), { recursive: true });
      fs.writeFileSync(path.join(assets, 'bundles', 'text-old-000000000000.pack'), 'old');
      fs.writeFileSync(path.join(assets, 'bundles', 'x.pack.tmp'), 'half');
      fs.writeFileSync(path.join(assets, 'bundles', 'keep.txt'), 'not a bundle');
      const plan = planBundles(files);
      assert.equal(plan.length, 1);
      const w = await writeBundles(plan, files, assets, fileOf);
      assert.equal(w.written, 1);
      const out = path.join(assets, plan[0].p.slice('/assets/'.length));
      const body = fs.readFileSync(out);
      assert.equal(body.length, plan[0].s);
      let at = 0;
      for (const i of plan[0].m) { assert.equal(sha(body.subarray(at, at + files[i].s)), files[i].h); at += files[i].s; }
      assert.equal(await w.prune(), 2, 'the old bundle and the half-written one');
      assert.deepEqual(fs.readdirSync(path.join(assets, 'bundles')).sort(), [path.basename(out), 'keep.txt'].sort());
      // kept as it is: same inode (a slot tree's hard link to the live tree's file is never written through)
      const ino = fs.statSync(out).ino;
      assert.equal((await writeBundles(plan, files, assets, fileOf)).written, 0);
      assert.equal(fs.statSync(out).ino, ino);
      // a member that changed after the list hashed it stops the run
      fs.rmSync(out);
      fs.writeFileSync(fileOf(files[0].p), Buffer.alloc(files[0].s, 'z'));
      await assert.rejects(writeBundles(plan, files, assets, fileOf), /changed while the list was built/);
      assert.ok(!fs.existsSync(out));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the server sends a bundle', () => {
  function serve(publicDir) {
    const handler = createStaticHandler({ publicDir, dataDir: publicDir, sharedDir: publicDir });
    const srv = http.createServer((req, res) => { const [p, q] = req.url.split('?'); handler(req, res, p, q || ''); });
    return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
  }
  const get = (srv, url) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: srv.address().port, path: url, headers: { 'accept-encoding': 'gzip' } }, (res) => {
      const parts = [];
      res.on('data', (d) => parts.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
    });
    req.on('error', reject);
    req.end();
  });

  test('immutable; a text bundle gzipped, a picture bundle as it is (server/http/files.js BUNDLE_DIR)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-bundles-http-'));
    const text = Buffer.from('{"a":1}'.repeat(400));
    const pics = Buffer.alloc(4000, 7);
    fs.mkdirSync(path.join(dir, 'assets', 'bundles'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets', 'other'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'assets', 'bundles', 'text-local.fx.a-0123456789ab.pack'), text);
    fs.writeFileSync(path.join(dir, 'assets', 'bundles', 'media-local.fx.a-0123456789ab.pack'), pics);
    fs.writeFileSync(path.join(dir, 'assets', 'other', 'text-x.pack'), text);
    const srv = await serve(dir);
    try {
      const t = await get(srv, `${BUNDLE_URL}text-local.fx.a-0123456789ab.pack`);
      assert.equal(t.status, 200);
      assert.equal(t.headers['content-encoding'], 'gzip');
      assert.match(t.headers['cache-control'], /immutable/);
      assert.ok(zlib.gunzipSync(t.body).equals(text));
      const m = await get(srv, `${BUNDLE_URL}media-local.fx.a-0123456789ab.pack`);
      assert.equal(m.status, 200);
      assert.equal(m.headers['content-encoding'], undefined, 'pictures and sounds are not gzipped again');
      assert.match(m.headers['cache-control'], /immutable/);
      assert.equal(m.headers['content-type'], 'application/octet-stream');
      assert.ok(m.body.equals(pics));
      const o = await get(srv, '/assets/other/text-x.pack');
      assert.equal(o.headers['content-encoding'], undefined, 'only the bundles folder\'s files are bundles');
      assert.doesNotMatch(o.headers['cache-control'], /immutable/);
    } finally {
      srv.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
