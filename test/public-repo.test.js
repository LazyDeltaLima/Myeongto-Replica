// test/public-repo.test.js — the repository is public (LazyDeltaLima/Myeongto-Replica): no tracked file may carry a
// home-directory path (/home/…, /Users/…, C:\Users\…), the maintainer's private ops folder (~/Personal/…) or this
// machine's account name. Notes that live in the private ops folder are named relative to it (docs/rules/README.md).
// Same byte scan as the release packager (tools/package.mjs scanFiles / scanNames), over every tracked file.
// Run: node --test test/public-repo.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFiles, scanNames, trackedFiles } from '../tools/package.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inGit = spawnSync('git', ['-C', REPO, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).stdout?.trim() === 'true';

// test/package.test.js feeds the scanner a fake home path on purpose.
const SCANNER_FIXTURES = new Set(['test/package.test.js']);
const OPS_FOLDER = /~\/Personal\/[A-Za-z]|Personal\/stronghold/;

test('no tracked file names a home directory, the private ops folder or this machine\'s account', { skip: !inGit && 'not a git checkout' }, () => {
  const files = trackedFiles(REPO).filter((f) => !SCANNER_FIXTURES.has(f));
  const hits = scanFiles(REPO, files, { home: true, names: scanNames() });
  for (const rel of files) {
    let text;
    try { text = fs.readFileSync(path.join(REPO, rel)).toString('latin1'); } catch { continue; }
    if (OPS_FOLDER.test(text)) hits.push(`${rel} (private ops folder path)`);
  }
  assert.deepEqual(hits, [], 'refer to ops notes by their name only (docs/rules/README.md)');
});
