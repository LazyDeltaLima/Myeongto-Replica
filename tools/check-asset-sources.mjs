#!/usr/bin/env node
// Compares the downloaded art and audio with the asset repositories they came from, and pins the versions this
// repository uses (tools/assets/upstream-pins.json, docs/ASSETS.md "Pinned upstream files").
//
// The sources are branch heads: a game update can replace a file at a path fetch-assets already downloaded, and
// fetch-assets keeps a file whose size matches its ledger. Run this after a client update (or when the browser's
// resource list reports hash mismatches):
//
//   node tools/check-asset-sources.mjs                 every file of the ledger with a GitHub source (≈ 12,000 files,
//                                                      0.65 GB): which ones the branch head serves with other bytes
//   node tools/check-asset-sources.mjs --only spine/op/char_4247_oxi/  only paths under that prefix
//   node tools/check-asset-sources.mjs --sample 300    300 random files (a quick look)
//   node tools/check-asset-sources.mjs --pin <path|prefix>…   pin the version on disk (the commit that has these bytes)
//   node tools/check-asset-sources.mjs --pin --changed        … for every file the last full check found changed
//   node tools/check-asset-sources.mjs --take-new <path|prefix>…  pin the branch head's version; then run
//                                                      node tools/fetch-assets.mjs to download it
//   --note "text"   kept with the pins this run writes (why this version)
//
// Spine atlases are rewritten by fetch-assets (`size:`, `pma`), so they are never compared; a pinned model folder pins
// its atlas at the commit of its skeleton. Pinning one file of a model folder pins the whole folder (skel, atlas,
// pages): the pages and the atlas are one version. A changed operator model with local-client textures
// (public/assets/local/spine/op/<id>/) is reported with the extract command — the web model and the client texture
// must be the same version. GITHUB_TOKEN (optional) raises the API limit the history search of --pin uses.
// Report: .cache/asset-sources-report.json. Needs the network; downloads nothing into public/assets.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoSource, rawUrl, mirrorUrl, isCommitRef } from './assets/sources.mjs';
import { loadPins, PINS_FILE, sha256 } from './assets/pins.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ASSETS = join(ROOT, 'public/assets');
const LEDGER = join(ROOT, '.cache/assets-ledger.json');
const REPORT = join(ROOT, '.cache/asset-sources-report.json');
const PINS = join(ROOT, PINS_FILE);
const ABOUT = 'Upstream files pinned to a commit: fetch-assets downloads exactly these versions on every install '
  + '(docs/ASSETS.md "Pinned upstream files"). Written by node tools/check-asset-sources.mjs --pin / --take-new; not edited by hand.';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const valued = new Set(['--only', '--sample', '--note', '--concurrency']);
const targets = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
const mode = flag('--take-new') ? 'take-new' : flag('--pin') ? 'pin' : 'check';
const CONCURRENCY = Math.max(1, Math.min(32, Number(value('--concurrency')) || 16));
const log = (m) => console.log(m);
const dirOf = (rel) => rel.slice(0, rel.lastIndexOf('/') + 1);

async function fetchBytes(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'user-agent': 'stronghold-protocol-check-assets/1.0' } });
      if (r.status === 404) return { notFound: true };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { buf: Buffer.from(await r.arrayBuffer()) };
    } catch (e) { last = e; await new Promise((res) => setTimeout(res, 500 * 2 ** i)); }
  }
  return { error: last?.message || String(last) };
}

/** raw first, then jsDelivr (a branch on jsDelivr may lag the head for hours: only when raw fails). */
async function fetchSource(src) {
  const raw = rawUrl(src);
  const a = await fetchBytes(raw);
  if (a.buf || a.notFound) return a;
  const m = mirrorUrl(raw);
  return m ? fetchBytes(m) : a;
}

const heads = new Map();
function headOf(src) {
  const key = `${src.owner}/${src.repo}@${src.ref}`;
  if (isCommitRef(src.ref)) return src.ref;
  if (!heads.has(key)) {
    const out = execFileSync('git', ['ls-remote', `https://github.com/${src.owner}/${src.repo}`, `refs/heads/${src.ref}`], { encoding: 'utf8', timeout: 60000 });
    const sha = out.split(/\s/)[0];
    if (!isCommitRef(sha)) throw new Error(`no head for ${key}`);
    heads.set(key, sha);
  }
  return heads.get(key);
}

async function history(src, branch) {
  const path = decodeURIComponent(src.path);
  const url = `https://api.github.com/repos/${src.owner}/${src.repo}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=30`;
  const headers = { 'user-agent': 'stronghold-protocol-check-assets/1.0', accept: 'application/vnd.github+json' };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`GitHub API ${r.status} for ${path}${r.status === 403 ? ' (rate limit: set GITHUB_TOKEN)' : ''}`);
  return (await r.json()).map((c) => c.sha);
}

async function pool(items, fn) {
  let next = 0; let done = 0; let last = 0;
  const worker = async () => {
    while (next < items.length) {
      const it = items[next++];
      await fn(it);
      done++;
      if (Date.now() - last > 3000) { last = Date.now(); log(`[check] ${done}/${items.length}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

const ledger = JSON.parse(await readFile(LEDGER, 'utf8')).files || {};
const pins = loadPins(PINS);
/** ledger files with a repository source that are on disk */
const entries = Object.entries(ledger)
  .map(([rel, e]) => ({ rel, url: e.url, src: e.url ? repoSource(e.url) : null }))
  .filter((e) => e.src && existsSync(join(ASSETS, e.rel)));
const match = (rel, list) => list.some((t) => rel === t || (t.endsWith('/') && rel.startsWith(t)));

function localTwin(rel) {
  const m = /^spine\/op\/([^/]+)\//.exec(rel);
  return m && existsSync(join(ASSETS, 'local/spine/op', m[1])) ? m[1] : null;
}

if (mode === 'check') {
  let list = entries.filter((e) => !e.rel.endsWith('.atlas'));
  const only = value('--only');
  if (only) list = list.filter((e) => e.rel.startsWith(only));
  const n = Number(value('--sample')) || 0;
  if (n > 0) list = list.sort(() => Math.random() - 0.5).slice(0, n);
  for (const e of list) headOf(e.src);
  log(`[check] ${list.length} files against ${[...heads.keys()].join(', ')}`);
  const changed = []; const failed = []; let bytes = 0;
  await pool(list, async (e) => {
    const r = await fetchSource(e.src);
    if (!r.buf) { failed.push({ rel: e.rel, url: e.url, why: r.notFound ? 'gone (404)' : r.error }); return; }
    bytes += r.buf.length;
    const disk = await readFile(join(ASSETS, e.rel));
    const want = pins[e.rel]?.sha256;
    const up = sha256(r.buf); const have = sha256(disk);
    if (up !== have || (want && want !== have)) changed.push({ rel: e.rel, url: e.url, bytes: disk.length, upstreamBytes: r.buf.length, pinned: !!want, ...(localTwin(e.rel) ? { localTwin: localTwin(e.rel) } : {}) });
  });
  changed.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  const report = { checkedAt: new Date().toISOString(), files: list.length, full: !only && !n, mb: +(bytes / 1048576).toFixed(1), heads: Object.fromEntries(heads), changed, failed };
  await writeFile(REPORT + '.tmp', JSON.stringify(report, null, 1)); await rename(REPORT + '.tmp', REPORT);
  log(`[check] ${list.length} files, ${report.mb} MB: ${changed.length} differ from the branch head, ${failed.length} not fetched`);
  for (const c of changed) log(`  ${c.pinned ? 'pinned ' : ''}${c.rel}  disk ${c.bytes} B · head ${c.upstreamBytes} B${c.localTwin ? `  (local-client textures: re-extract spine/op/${c.localTwin} with the new version)` : ''}`);
  for (const f of failed.slice(0, 20)) log(`  not fetched: ${f.rel} (${f.why})`);
  if (changed.length) log(`decide per file: keep the version on disk (--pin <path>… or --pin --changed) or take the new one (--take-new <path>…, then fetch-assets); report ${REPORT}`);
  process.exitCode = changed.some((c) => !c.pinned) ? 1 : 0;
} else {
  let wanted = targets;
  if (flag('--changed')) {
    const rep = JSON.parse(await readFile(REPORT, 'utf8'));
    if (!rep.full) log('[pin] note: the last report is not a full check');
    wanted = [...wanted, ...rep.changed.map((c) => c.rel)];
  }
  if (!wanted.length) throw new Error('name the paths (or folder prefixes ending in /) to pin, or --changed');
  // a model folder is one version: a named file brings its folder's other files
  const folders = new Set(wanted.filter((t) => /^spine\//.test(t)).map((t) => (t.endsWith('/') ? t : dirOf(t))));
  const chosen = entries.filter((e) => match(e.rel, wanted) || folders.has(dirOf(e.rel)));
  if (!chosen.length) throw new Error(`no ledger file matches ${wanted.join(' ')}`);
  const branchOf = (e) => (isCommitRef(e.src.ref) ? null : e.src.ref);
  const commitOf = new Map(); // folder → commit of its first pinned non-atlas file
  const out = { ...pins };
  const note = value('--note');
  const pinAt = (e, sha, buf) => {
    out[e.rel] = { url: rawUrl({ ...e.src, ref: sha }), sha256: sha256(buf), bytes: buf.length, ...(note ? { note } : pins[e.rel]?.note ? { note: pins[e.rel].note } : {}) };
    if (!commitOf.has(dirOf(e.rel))) commitOf.set(dirOf(e.rel), sha);
  };
  const problems = [];
  for (const e of chosen.filter((x) => !x.rel.endsWith('.atlas'))) {
    const branch = branchOf(e);
    const disk = await readFile(join(ASSETS, e.rel));
    if (mode === 'take-new') {
      if (!branch) { problems.push(`${e.rel}: its source is already a commit (${e.src.ref})`); continue; }
      const sha = headOf(e.src);
      const r = await fetchSource({ ...e.src, ref: sha });
      if (!r.buf) { problems.push(`${e.rel}: head not fetched (${r.error || '404'})`); continue; }
      pinAt(e, sha, r.buf);
      log(`[take-new] ${e.rel} @ ${sha.slice(0, 10)}${sha256(r.buf) === sha256(disk) ? ' (already on disk)' : ' (fetch-assets downloads it)'}`);
      continue;
    }
    // --pin: the commit whose file is these bytes — the head, else the path's history, newest first
    const want = sha256(disk);
    const candidates = isCommitRef(e.src.ref) ? [e.src.ref] : [headOf(e.src), ...await history(e.src, branch)];
    let found = null;
    for (const sha of [...new Set(candidates)]) {
      const r = await fetchSource({ ...e.src, ref: sha });
      if (r.buf && sha256(r.buf) === want) { found = sha; break; }
    }
    if (!found) { problems.push(`${e.rel}: no commit of ${e.src.owner}/${e.src.repo}@${branch} has the bytes on disk`); continue; }
    pinAt(e, found, disk);
    log(`[pin] ${e.rel} @ ${found.slice(0, 10)}`);
  }
  for (const e of chosen.filter((x) => x.rel.endsWith('.atlas'))) {
    const sha = commitOf.get(dirOf(e.rel));
    if (!sha) { problems.push(`${e.rel}: no pinned skeleton or page in its folder`); continue; }
    const r = await fetchSource({ ...e.src, ref: sha });
    if (!r.buf) { problems.push(`${e.rel}: not fetched at ${sha.slice(0, 10)}`); continue; }
    pinAt(e, sha, r.buf);
    log(`[pin] ${e.rel} @ ${sha.slice(0, 10)} (its folder's commit)`);
  }
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  await writeFile(PINS + '.tmp', JSON.stringify({ about: ABOUT, files: sorted }, null, 2) + '\n'); await rename(PINS + '.tmp', PINS);
  log(`[pin] ${Object.keys(sorted).length} pinned files → ${PINS_FILE}`);
  const twins = [...new Set(chosen.map((e) => localTwin(e.rel)).filter(Boolean))];
  if (mode === 'take-new' && twins.length) log(`local-client textures to re-extract at the same version: ${twins.map((t) => `--only spine/op/${t}`).join(' ')} (tools/local-extract/extract.py)`);
  for (const p of problems) log(`  problem: ${p}`);
  if (problems.length) process.exitCode = 1;
}
