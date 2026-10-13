// test/public-repo.test.js — the repository is public (LazyDeltaLima/Myeongto-Replica): no tracked file may carry a
// home-directory path (/home/…, /Users/…, C:\Users\…), this machine's account name, a work-process phrase ("user
// decision", a session name, an internal decision number — tools/public-scan.mjs WORDING) or one of the maintainer's
// private names (SP_PUBLIC_SCAN_WORDS, a list kept outside the repository; without it only the generic checks run).
// Notes that are not in the repository are named "the maintainer's notes" (docs/rules/README.md).
// Same byte scan as the release packager (tools/package.mjs scanFiles / scanNames), over every tracked file.
// Run: node --test test/public-repo.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFiles, scanNames, trackedFiles } from '../tools/package.mjs';
import { scanWording, scanWords } from '../tools/public-scan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inGit = spawnSync('git', ['-C', REPO, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).stdout?.trim() === 'true';

// test/package.test.js feeds the scanner a fake home path on purpose.
const SCANNER_FIXTURES = new Set(['test/package.test.js']);

test('no tracked file names a home directory or this machine\'s account', { skip: !inGit && 'not a git checkout' }, () => {
  const files = trackedFiles(REPO).filter((f) => !SCANNER_FIXTURES.has(f));
  const hits = scanFiles(REPO, files, { home: true, names: scanNames() });
  assert.deepEqual(hits, [], 'refer to the maintainer\'s notes by name only (docs/rules/README.md)');
});

test('no tracked file records the work process or a private name', { skip: !inGit && 'not a git checkout' }, () => {
  const hits = scanWording(REPO, trackedFiles(REPO), scanWords());
  assert.deepEqual(hits, [], 'maintainer decision, no session names or decision numbers (docs/rules/README.md 「쓰는 법」)');
});
