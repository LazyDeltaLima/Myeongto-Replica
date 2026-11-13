// test/render/browser-resources-current.test.js — the resource worker answers a listed file from its cache as long as the
// list's hash is the cached copy's, so a list older than the extract keeps serving the old files to a browser that has them: a
// fresh browser shows the change, the one that had the page before does not, and neither a server restart nor a hard reload
// helps (the 重构体's crystal ring, 2026-11-04: its old modes.json never asked for them). Only on a machine with the extract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIST = path.join(ROOT, 'public/assets/browser-resources.json');

test('the worker\'s list knows the extracted effects as they are', { skip: !existsSync(LIST) && 'no list' }, () => {
  const files = JSON.parse(readFileSync(LIST, 'utf8')).files.filter((f) => f.p.startsWith('/assets/local/fx/'));
  assert.ok(files.length > 0);
  const stale = [];
  for (const f of files) {
    const abs = path.join(ROOT, 'public', f.p);
    if (!existsSync(abs)) { stale.push(`${f.p}: gone`); continue; }
    const top = !f.p.slice('/assets/local/fx/'.length).includes('/');
    // the control files by their hash (a same-sized modes.json is another modes.json), the many prefabs by their size
    const same = top ? createHash('sha256').update(readFileSync(abs)).digest('hex') === f.h : statSync(abs).size === f.s;
    if (!same) stale.push(f.p);
  }
  assert.deepEqual(stale, [], 'run: node tools/build-browser-resources.mjs');
});

// The PNG a WebP copy was made from stays on disk for the extractors, but the page loads the copy: listed, every browser
// that agreed to the download fetched it for nothing (the board textures, 5.4 MB, 2026-11-13).
const LOCAL = path.join(ROOT, 'data/local-assets.json');
test('the worker\'s list leaves out the PNGs of the WebP copies', { skip: !(existsSync(LIST) && existsSync(LOCAL)) && 'no extract' }, () => {
  const named = new Set(JSON.stringify(JSON.parse(readFileSync(LOCAL, 'utf8'))).match(/"\/assets\/local\/[^"]+"/g)?.map((s) => s.slice(1, -1)) ?? []);
  const listed = JSON.parse(readFileSync(LIST, 'utf8')).files.map((f) => f.p);
  const all = new Set(listed);
  const sources = listed.filter((p) => p.startsWith('/assets/local/') && p.endsWith('.png') && !named.has(p) && all.has(p.slice(0, -4) + '.webp'));
  assert.deepEqual(sources, [], 'run: node tools/build-browser-resources.mjs');
});
