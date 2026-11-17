#!/usr/bin/env node
// Browser resource index (local patch): public/assets/browser-resources.json, the list the client pre-downloads into
// its Cache Storage in the background (public/js/resources.js, public/resource-worker.js) so pictures never pop in late.
//
// Built from the files actually on disk (run it after tools/fetch-assets.mjs / tools/local-extract), one entry per file,
// and the skin models' and pictures' entries of local/spine/skin/models.json and art.json (below):
//   { version, bytes, packs: { <pack>: [path prefix…] }, files: [{ p: '/assets/…' | '/img/emotes/…', s: bytes, h: sha256 hex, u?: upstream URL, r?: 'lo' | 'hi' }],
//     bundles: [{ p: '/assets/bundles/<kind>-<group>-<hash12>.pack', s: bytes, m: [index into files…] }] }
// `u` is the URL tools/fetch-assets.mjs downloaded the file from (.cache/assets-ledger.json) when it is a jsDelivr /
// GitHub raw URL. The browser fetches those from jsDelivr / GitHub raw and keeps them only when size + hash match this
// file; a file the pipeline rewrote (spine atlases, size changed), made locally (assets/local: 3D board, emotes, UI
// sprites) or downloaded from elsewhere has no `u` and comes from this server. Nothing is downloaded here. A list entry
// the page would refuse (public/js/resources.js validEntry) stops the run.
// `r` marks the two copies of a 立绘 (tools/local-extract/chararts_extract.py save_illust, the operator art and the skin
// art): a WebP `<dir>/full/<name>` (the original resolution) is 'hi' and the listed `<dir>/<name>` (the long side 1024)
// 'lo'; a browser pre-downloads only its device's copy (public/js/illust-res.js, maintainer decision 2026-11-16).
// `bundles`: this server's files (no `u`) joined into files of about 8 MB under public/assets/bundles/, written here
// (the members' bytes one after another, no format: tools/assets/resource-bundles.mjs); a bundle whose members did not
// change keeps its file, and the ones no longer listed are deleted after the list is written.
//
//   node tools/build-browser-resources.mjs [--assets public/assets] [--verify N]
//   --verify N  fetch N random upstream entries and compare their hashes (diagnostics; needs network)

import { readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mirrorUrl } from './assets/sources.mjs';
import { planBundles, writeBundles } from './assets/resource-bundles.mjs';
import { BUNDLE_DIR } from '../server/http/files.js';
import { sourcesOf, validEntry } from '../public/js/resources.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const ASSETS = join(ROOT, opt('--assets', 'public/assets'));
const VERIFY = Number(opt('--verify', 0)) || 0;
const OUT = 'browser-resources.json';
// local/fx/bindings.json: the client-only binding rows, read by the tests only (tools/local-extract/fx_bindings.py)
const SKIP = new Set([OUT, 'local/fx/bindings.json']);
// The skin data (operator and summon skins, display only) is a pack: the files under PACKS.skin are downloaded only by
// those who choose it (public/js/resources.js resourceWanted). The list says which prefixes a pack holds, so the page
// needs no copy of them. The skin models come from fexli/ArknightsResource and the skins' avatars and portraits from
// yuanyan3060/ArknightsGameResource, never from this server (maintainer decisions 2026-11-16): the entries of
// local/spine/skin/models.json (tools/fetch-skin-models.mjs) and art.json (tools/fetch-skin-art.mjs), paths under
// /assets/spine/skin/ with the repository's URL and hash, are listed, and what the local client extraction wrote for them
// (tools/local-extract/skin_extract.py, local/spine/skin/<owner>/<prefab>/front|back|avatar|portrait/: kept for
// comparison only, and left out of the deploy) is not. The 立绘 (illust/) and the indexes in local/spine/skin/ come from
// this server. The skin effects (tools/local-extract/fx_extract.py --skin-effects, local/fx/skin/: their prefabs and the
// textures / meshes only they use; maintainer decision 2026-11-17) are in the pack too, from this server.
const SKIN_LOCAL = 'local/spine/skin/';
const PACKS = { skin: ['/assets/spine/skin/', '/assets/' + SKIN_LOCAL, '/assets/local/fx/skin/'] };
const SKIN_REMOTE = [SKIN_LOCAL + 'models.json', SKIN_LOCAL + 'art.json'];
const isLocalSkinCopy = (rel) => rel.startsWith(SKIN_LOCAL) && /^[^/]+\/[^/]+\/(front|back|avatar|portrait)\//.test(rel.slice(SKIN_LOCAL.length));

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) yield* walk(abs);
    else if (e.isFile() && !e.name.includes('.part') && !e.name.endsWith('.tmp')) yield abs;
  }
}

let ledger = {};
try { ledger = JSON.parse(await readFile(join(ROOT, '.cache', 'assets-ledger.json'), 'utf8')).files || {}; } catch { /* no ledger: all from this server */ }

// A local PNG next to its WebP copy is the copy's source (tools/local-extract: scene_extract.py apply_webp, extract.py
// WEBP), kept on disk for the extractors and tools/crop-board-atlas.mjs; the page loads the copy that
// data/local-assets.json names, so the PNG is left out of the list unless that manifest names the PNG itself (a failed
// WebP write points the entry back at it). No readable manifest: every PNG stays listed.
let localNamed = null;
try {
  localNamed = new Set(JSON.stringify(JSON.parse(await readFile(join(ROOT, 'data', 'local-assets.json'), 'utf8')))
    .match(/"\/assets\/local\/[^"]+"/g)?.map((s) => s.slice(1, -1)) ?? []);
} catch { /* no local extract */ }
const isWebpSource = (rel) => localNamed !== null && rel.startsWith('local/') && rel.endsWith('.png')
  && !localNamed.has('/assets/' + rel) && existsSync(join(ASSETS, rel.slice(0, -4) + '.webp'));

const files = [];
let upstreamBytes = 0;
let sourcesLeft = 0;
// bundled pictures outside the asset mount (in the image): served by this server, cached like the rest
for await (const abs of walk(join(ROOT, 'public/img/emotes'))) {
  const buf = await readFile(abs);
  files.push({ p: '/img/emotes/' + relative(join(ROOT, 'public/img/emotes'), abs).split(sep).join('/'), s: buf.length, h: createHash('sha256').update(buf).digest('hex') });
}
for await (const abs of walk(ASSETS)) {
  const rel = relative(ASSETS, abs).split(sep).join('/');
  if (SKIP.has(rel) || rel.startsWith(BUNDLE_DIR + '/') || isLocalSkinCopy(rel)) continue;
  if (isWebpSource(rel)) { sourcesLeft++; continue; }
  const buf = await readFile(abs);
  const entry = { p: '/assets/' + rel, s: buf.length, h: createHash('sha256').update(buf).digest('hex') };
  const led = ledger[rel];
  // only a URL the page can fetch (sourcesOf: jsDelivr / GitHub raw): the page drops an entry whose `u` it has no source
  // for, so a file fetch-assets took from elsewhere (a `data:` URL, web.hycdn.cn: the statistics page's pictures) was
  // never pre-downloaded; it is on disk, so this server sends it
  if (led && typeof led.url === 'string' && led.bytes === buf.length && !rel.endsWith('.atlas') && sourcesOf({ p: entry.p, u: led.url }).length > 0) {
    entry.u = led.url;
    upstreamBytes += buf.length;
  }
  files.push(entry);
}
// the skin models and pictures from their repositories: a malformed entry stops the run (a list the page would refuse
// entry by entry), and so does a path two of them name
const skinRemote = {};
const listedPaths = new Set(files.map((f) => f.p));
for (const index of SKIN_REMOTE) {
  if (!existsSync(join(ASSETS, index))) continue;
  const doc = JSON.parse(await readFile(join(ASSETS, index), 'utf8'));
  const tool = index.endsWith('art.json') ? 'tools/fetch-skin-art.mjs' : 'tools/fetch-skin-models.mjs';
  skinRemote[index] = 0;
  for (const f of doc.files ?? []) {
    const ok = typeof f?.p === 'string' && f.p.startsWith(PACKS.skin[0]) && /^[A-Za-z0-9_./-]+$/.test(f.p) && !f.p.includes('..')
      && Number.isInteger(f.s) && f.s >= 0 && /^[0-9a-f]{64}$/.test(f.h ?? '') && typeof f.u === 'string' && f.u.startsWith('https://raw.githubusercontent.com/');
    if (!ok) throw new Error(`${index}: malformed entry ${JSON.stringify(f)} — run node ${tool} again`);
    if (listedPaths.has(f.p)) throw new Error(`${index}: ${f.p} is listed twice — run node ${tool} again`);
    listedPaths.add(f.p);
    files.push({ p: f.p, s: f.s, h: f.h, u: f.u });
    upstreamBytes += f.s;
    skinRemote[index]++;
  }
}
// the 立绘 pairs (above): only a copy whose 1024 twin is listed is a pair
const byPath = new Map(files.map((f) => [f.p, f]));
for (const f of files) {
  const m = /^(.*)\/full\/([^/]+\.webp)$/.exec(f.p);
  const lo = m && byPath.get(`${m[1]}/${m[2]}`);
  if (lo) { f.r = 'hi'; lo.r = 'lo'; }
}
files.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
// the page fetches only the entries it takes: one it would drop is never pre-downloaded, so the list must not name it
const refused = files.filter((f) => !validEntry(f));
if (refused.length) throw new Error(`${refused.length} list entries the page would drop (public/js/resources.js validEntry; docs/rules/render.md 「\`u\`는 페이지가 받을 수 있는 주소일 때만」), e.g. ${JSON.stringify(refused[0]).slice(0, 200)}`);
const bytes = files.reduce((n, f) => n + f.s, 0);
const version = createHash('sha256').update(JSON.stringify(PACKS) + '\n' + files.map((f) => f.p + ':' + f.h).join('\n')).digest('hex').slice(0, 16);
// the bundles are written before the list that names them; `version` leaves them out (the cache holds the same files)
const bundles = planBundles(files, { packs: PACKS });
const emotes = join(ROOT, 'public/img/emotes');
const fileOf = (p) => (p.startsWith('/img/emotes/') ? join(emotes, p.slice('/img/emotes/'.length)) : join(ASSETS, p.slice('/assets/'.length)));
const bundled = await writeBundles(bundles, files, ASSETS, fileOf);
const body = JSON.stringify({ version, bytes, packs: PACKS, files, bundles });
// an unchanged list keeps its file: the server's ETag is size + mtime (server/http/files.js), so a rewrite made every
// client download the whole list (≈ 750 KB gzip) again after a deploy that changed none of it
let same = false;
try { same = (await readFile(join(ASSETS, OUT), 'utf8')) === body; } catch { /* no list yet */ }
if (!same) {
  const tmp = join(ASSETS, OUT + '.tmp');
  await writeFile(tmp, body);
  await rename(tmp, join(ASSETS, OUT));
}
const pruned = await bundled.prune();
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
const inBundles = bundles.reduce((n, b) => n + b.m.length, 0);
console.log(`[resources] bundles: ${bundles.length} (${inBundles} files / ${mb(bundles.reduce((n, b) => n + b.s, 0))}; ${bundled.written} written / ${mb(bundled.writtenBytes)}, ${pruned} old deleted)`);
console.log(`[resources] ${files.length} files, ${mb(bytes)} (upstream ${files.filter((f) => f.u).length} files / ${mb(upstreamBytes)}), version ${version}${same ? ' (unchanged, file kept)' : ''}, ${sourcesLeft} WebP source PNGs left out, skin files from their repositories: ${Object.entries(skinRemote).map(([k, n]) => `${n} (${k})`).join(', ') || 'none'}`);

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
