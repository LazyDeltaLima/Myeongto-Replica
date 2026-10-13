// The lobby's patch notes: CHANGELOG.md parsed for GET /changelog.json (server/http/changelog.js) and the client helpers
// of the 更新 tab (public/js/ui/patchNotes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelog, parseInline, createChangelogReader, CHANGELOG_URL } from '../server/http/changelog.js';
import { createRequestHandler } from '../server/http/routes.js';
import { APP_VERSION } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SAMPLE = `# 更新记录

## 1.2.0 — 2026-10-09

첫 문장입니다. 근거는 [docs/rules/](docs/rules/README.md)에
있습니다.

### 새 기능

- **굵게**: 설명 \`v1.2.0\` 표기
  이어지는 줄
- 둘째 항목

## 0.2.0 — 2026-10-07

原本的记录
`;

test('parseInline: bold and code become segments, a link keeps its text', () => {
  assert.deepEqual(parseInline('a **b** `c` [d](e/f.md) g'), [{ s: 'a ' }, { s: 'b', b: true }, { s: ' ' }, { s: 'c', c: true }, { s: ' d g' }]);
  assert.deepEqual(parseInline('plain'), [{ s: 'plain' }]);
});

test('parseChangelog: entries from 1.0.0 up, paragraphs joined, groups and list items with continuations', () => {
  const entries = parseChangelog(SAMPLE);
  assert.equal(entries.length, 1);
  const [e] = entries;
  assert.equal(e.version, '1.2.0');
  assert.equal(e.date, '2026-10-09');
  assert.deepEqual(e.blocks[0], { p: [{ s: '첫 문장입니다. 근거는 docs/rules/에 있습니다.' }] });
  assert.deepEqual(e.blocks[1], { h: '새 기능' });
  assert.deepEqual(e.blocks[2].ul[0], [{ s: '굵게', b: true }, { s: ': 설명 ' }, { s: 'v1.2.0', c: true }, { s: ' 표기 이어지는 줄' }]);
  assert.deepEqual(e.blocks[2].ul[1], [{ s: '둘째 항목' }]);
  assert.equal(parseChangelog(SAMPLE, { minMajor: 0 }).length, 2);
});

test('the real CHANGELOG.md: the newest entry is the running version, every entry has content', () => {
  const entries = parseChangelog(readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'));
  assert.ok(entries.length > 0);
  assert.equal(entries[0].version, APP_VERSION);
  for (const e of entries) {
    assert.ok(Number(e.version.split('.')[0]) >= 1, e.version);
    assert.ok(e.blocks.length > 0, `${e.version} has no blocks`);
  }
});

test('GET /changelog.json answers the parsed entries, re-reads a changed file, and [] without one', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sp-changelog-'));
  try {
    const file = path.join(dir, 'CHANGELOG.md');
    writeFileSync(file, SAMPLE);
    const handler = createRequestHandler({ serveStatic: async () => { throw new Error('static'); }, health: null, log: console, changelog: createChangelogReader({ file }) });
    const get = () => new Promise((resolve) => {
      const res = {
        headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        writeHead(status, h) { this.status = status; Object.assign(this.headers, h); },
        end(body) { resolve({ status: this.status, body: body ? JSON.parse(String(body)) : null }); },
      };
      handler({ url: CHANGELOG_URL, method: 'GET', headers: {}, socket: {} }, res);
    });
    const a = await get();
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.entries.map((e) => e.version), ['1.2.0']);
    writeFileSync(file, SAMPLE.replace('## 1.2.0', '## 1.3.0 — 2026-10-10\n\n새 판.\n\n## 1.2.0'));
    const later = new Date(Date.now() + 5000);
    (await import('node:fs')).utimesSync(file, later, later);
    assert.deepEqual((await get()).body.entries.map((e) => e.version), ['1.3.0', '1.2.0']);
    rmSync(file);
    assert.deepEqual((await get()).body, { entries: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patchNotes client: summary line, seen version, one fetch per page', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { summaryOf, isUnseen, markSeen, loadPatchNotes } = await import('../public/js/ui/patchNotes.js');
  const [e] = parseChangelog(SAMPLE);
  assert.equal(summaryOf(e), '첫 문장입니다.');
  assert.equal(summaryOf({ blocks: [{ ul: [[{ s: '항목만' }]] }] }), '항목만');
  assert.equal(isUnseen('1.2.0'), true);
  markSeen('1.2.0');
  assert.equal(isUnseen('1.2.0'), false);
  assert.equal(isUnseen('1.3.0'), true);
  let calls = 0;
  const fetchFn = async () => { calls++; return { ok: true, json: async () => ({ entries: [e, { bad: 1 }] }) }; };
  const [a, b] = await Promise.all([loadPatchNotes(fetchFn), loadPatchNotes(fetchFn)]);
  assert.equal(calls, 1);
  assert.deepEqual(a.map((x) => x.version), ['1.2.0']);
  assert.ok(a === b, 'the same list');
});
