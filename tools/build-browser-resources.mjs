#!/usr/bin/env node
// Browser resource index (local NAS patch): public/assets/browser-resources.json, the list the client pre-downloads into
// its Cache Storage in the background (public/js/resources.js, public/resource-worker.js) so pictures never pop in late.
//
// Built from the files actually on disk (run it after tools/fetch-assets.mjs / tools/local-extract), one entry per file:
//   { p: '/assets/…' | '/img/emotes/…', s: bytes, h: sha256 hex, u?: upstream URL }
// `u` is the URL tools/fetch-assets.mjs downloaded the file from (.cache/assets-ledger.json). The browser fetches those
// from jsDelivr / GitHub raw and keeps them only when size + hash match this file; a file the pipeline rewrote (spine
// atlases, size changed) or made locally (assets/local: 3D board, emotes, UI sprites) has no `u` and comes from this
// server. Nothing is downloaded here.
//
//   node tools/build-browser-resources.mjs [--assets public/assets] [--verify N]
//   --verify N  fetch N random upstream entries and compare their hashes (diagnostics; needs network)

import { readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mirrorUrl } from './assets/sources.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const ASSETS = join(ROOT, opt('--assets', 'public/assets'));
const VERIFY = Number(opt('--verify', 0)) || 0;
const OUT = 'browser-resources.json';
const SKIP = new Set([OUT]);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) yield* walk(abs);
    else if (e.isFile() && !e.name.includes('.part') && !e.name.endsWith('.tmp')) yield abs;
  }
}

let ledger = {};
try { ledger = JSON.parse(await readFile(join(ROOT, '.cache', 'assets-ledger.json'), 'utf8')).files || {}; } catch { /* no ledger: all from this server */ }

const files = [];
let upstreamBytes = 0;
// bundled pictures outside the asset mount (in the image): served by this server, cached like the rest
for await (const abs of walk(join(ROOT, 'public/img/emotes'))) {
  const buf = await readFile(abs);
  files.push({ p: '/img/emotes/' + relative(join(ROOT, 'public/img/emotes'), abs).split(sep).join('/'), s: buf.length, h: createHash('sha256').update(buf).digest('hex') });
}
for await (const abs of walk(ASSETS)) {
  const rel = relative(ASSETS, abs).split(sep).join('/');
  if (SKIP.has(rel)) continue;
  const buf = await readFile(abs);
  const entry = { p: '/assets/' + rel, s: buf.length, h: createHash('sha256').update(buf).digest('hex') };
  const led = ledger[rel];
  if (led && typeof led.url === 'string' && led.bytes === buf.length && !rel.endsWith('.atlas')) {
    entry.u = led.url;
    upstreamBytes += buf.length;
  }
  files.push(entry);
}
files.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
const bytes = files.reduce((n, f) => n + f.s, 0);
const version = createHash('sha256').update(files.map((f) => f.p + ':' + f.h).join('\n')).digest('hex').slice(0, 16);
const tmp = join(ASSETS, OUT + '.tmp');
await writeFile(tmp, JSON.stringify({ version, bytes, files }));
await rename(tmp, join(ASSETS, OUT));
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
console.log(`[resources] ${files.length} files, ${mb(bytes)} (upstream ${files.filter((f) => f.u).length} files / ${mb(upstreamBytes)}), version ${version}`);

if (VERIFY > 0) {
  const pool = files.filter((f) => f.u);
  const pick = Array.from({ length: Math.min(VERIFY, pool.length) }, () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const tally = { match: 0, mismatch: 0, fail: 0 };
  for (const f of pick) {
    const results = [];
    for (const url of [mirrorUrl(f.u), f.u].filter(Boolean)) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) { results.push(`${new URL(url).host}:HTTP${r.status}`); continue; }
        const b = Buffer.from(await r.arrayBuffer());
        const ok = b.length === f.s && createHash('sha256').update(b).digest('hex') === f.h;
        results.push(`${new URL(url).host}:${ok ? 'ok' : 'DIFF'}`);
      } catch (e) { results.push(`${new URL(url).host}:${e.name}`); }
    }
    const k = results.some((r) => r.endsWith(':ok')) ? 'match' : results.some((r) => r.endsWith(':DIFF')) ? 'mismatch' : 'fail';
    tally[k]++;
    if (k !== 'match') console.log(`  ${k} ${f.p} ${results.join(' ')}`);
  }
  console.log(`[verify] ${pick.length} sampled:`, tally);
}
