// Pinned upstream files (tools/assets/pins.mjs, docs/ASSETS.md "Pinned upstream files"): the asset repositories are
// branch heads, and a file they replace at the same path keeps its old version on every install that already had it
// (the downloader keeps a file whose size matches its ledger). A pinned file is downloaded at its commit and replaced
// when the disk holds another version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Downloader } from '../tools/assets/downloader.mjs';
import { checkPins, sameSource, sha256 } from '../tools/assets/pins.mjs';
import { repoSource } from '../tools/assets/sources.mjs';

const SHA = 'a'.repeat(40);
const BRANCH_URL = 'https://raw.githubusercontent.com/o/r/main/x/a.json';
const PIN_URL = `https://raw.githubusercontent.com/o/r/${SHA}/x/a.json`;
const OLD = Buffer.from('{"v":1}');
const NEW = Buffer.from('{"v":2}'); // same size: a size check cannot tell them apart
const quiet = () => {};

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'sp-pins-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const serve = (map, calls = []) => async (url) => {
  calls.push(url);
  return map[url] ? new Response(map[url]) : new Response('', { status: 404 });
};

test('repoSource reads raw, jsDelivr and proxied URLs as one file; sameSource compares the ref', () => {
  const cdn = `https://cdn.jsdelivr.net/gh/o/r@${SHA}/x/a.json`;
  assert.deepEqual(repoSource(cdn), { owner: 'o', repo: 'r', ref: SHA, path: 'x/a.json' });
  assert.ok(sameSource(PIN_URL, cdn));
  assert.ok(sameSource(PIN_URL, 'https://gh-proxy.com/' + PIN_URL));
  assert.ok(!sameSource(PIN_URL, BRANCH_URL), 'a branch URL is not the pinned version');
  assert.equal(repoSource('https://web.hycdn.cn/a.png'), null);
});

test('checkPins refuses a branch URL or an entry without its hash', () => {
  const ok = { url: PIN_URL, sha256: sha256(NEW), bytes: NEW.length };
  assert.deepEqual(checkPins({ files: { 'x/a.json': ok } }), { 'x/a.json': ok });
  assert.throws(() => checkPins({ files: { 'x/a.json': { ...ok, url: BRANCH_URL } } }), /full commit id/);
  assert.throws(() => checkPins({ files: { 'x/a.json': { ...ok, sha256: 'x' } } }), /sha256/);
});

test('a pinned file downloaded from the branch is fetched again at its commit, even with the same size', async (t) => {
  const dir = await fixture(t);
  await mkdir(join(dir, 'x'));
  await writeFile(join(dir, 'x/a.json'), OLD);
  const pins = { 'x/a.json': { url: PIN_URL, sha256: sha256(NEW), bytes: NEW.length } };
  const calls = [];
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), log: quiet, retries: 1, backoffMs: 0, pins,
    fetchImpl: serve({ [PIN_URL]: NEW, [BRANCH_URL]: OLD }, calls) });
  dl.ledger.files['x/a.json'] = { url: BRANCH_URL, bytes: OLD.length };
  const job = { rel: 'x/a.json', urls: [BRANCH_URL], kind: 'json' };
  assert.equal((await dl.run([job])).get(job.rel).status, 'ok');
  assert.deepEqual(await readFile(join(dir, 'x/a.json')), NEW);
  assert.equal(dl.ledger.files['x/a.json'].url, PIN_URL, 'the ledger (the browser list `u`) names the commit');
  assert.ok(!calls.includes(BRANCH_URL), 'the branch is never asked');
  assert.deepEqual(job.urls, [PIN_URL], 'the plan leaf carries the pinned URL (no false fallback report)');
  assert.deepEqual(dl.replacedByPin, ['x/a.json'], 'a version on disk that the pin replaced is named (fetch-assets prints it)');
  // the right version is kept
  assert.equal((await dl.run([job])).get(job.rel).status, 'skip');
  // another version under the pinned ledger entry (a copy of an older tree) is replaced
  await writeFile(join(dir, 'x/a.json'), OLD);
  assert.equal((await dl.run([job])).get(job.rel).status, 'ok');
  assert.deepEqual(await readFile(join(dir, 'x/a.json')), NEW);
});

test('a commit serving other bytes than the pin is an error and writes nothing', async (t) => {
  const dir = await fixture(t);
  const pins = { 'x/a.json': { url: PIN_URL, sha256: sha256(NEW), bytes: NEW.length } };
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), log: quiet, retries: 1, backoffMs: 0, pins,
    fetchImpl: serve({ [PIN_URL]: OLD, [`https://cdn.jsdelivr.net/gh/o/r@${SHA}/x/a.json`]: OLD }) });
  const r = (await dl.run([{ rel: 'x/a.json', urls: [BRANCH_URL], kind: 'json' }])).get('x/a.json');
  assert.equal(r.status, 'error');
  assert.match(r.error, /other bytes/);
  await assert.rejects(readFile(join(dir, 'x/a.json')));
  assert.deepEqual(dl.replacedByPin, [], 'a fresh download replaces nothing');
});

test('a pinned atlas is kept only while the pinned pages of its folder are their version', async (t) => {
  const dir = await fixture(t);
  await mkdir(join(dir, 'm'));
  const atlas = 'p.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n';
  const atlasUrl = `https://raw.githubusercontent.com/o/r/${SHA}/m/m.atlas`;
  const pageUrl = `https://raw.githubusercontent.com/o/r/${SHA}/m/p.json`;
  await writeFile(join(dir, 'm/m.atlas'), atlas);
  await writeFile(join(dir, 'm/p.json'), NEW);
  const pins = {
    'm/m.atlas': { url: atlasUrl, sha256: sha256(Buffer.from(atlas)), bytes: atlas.length },
    'm/p.json': { url: pageUrl, sha256: sha256(NEW), bytes: NEW.length },
  };
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), log: quiet, retries: 1, backoffMs: 0, pins,
    fetchImpl: serve({ [atlasUrl]: Buffer.from(atlas), [pageUrl]: NEW }) });
  dl.ledger.files['m/m.atlas'] = { url: atlasUrl, bytes: atlas.length };
  const job = { rel: 'm/m.atlas', urls: [atlasUrl], kind: 'atlas', mutable: true };
  assert.equal((await dl.run([job])).get(job.rel).status, 'skip');
  await writeFile(join(dir, 'm/p.json'), OLD); // the page is another version: the atlas goes with it
  assert.equal((await dl.run([{ ...job }])).get(job.rel).status, 'ok');
});
