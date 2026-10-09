// Local patch: the feedback relay (server/feedback-relay.js) — posts public reports of the feedback inbox as GitHub
// issues, against a fake GitHub API (no network; the key is made here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { FeedbackRelay, appJwt, escapeMarkdown, fenced, issueTitle, issueBody } from '../server/feedback-relay.js';

const quiet = { info() {}, warn() {}, error() {} };
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

/** An inbox directory with these reports. */
function inboxOf(recs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-relay-'));
  fs.mkdirSync(path.join(dir, 'inbox'));
  for (const r of recs) fs.writeFileSync(path.join(dir, 'inbox', `${r.id}.json`), JSON.stringify(r));
  return dir;
}
const recOf = (id, over = {}) => ({
  v: 1, id: `FB-20261009-${id}`, at: '2026-10-09T12:00:00.000Z', kind: 'bug', text: '보스가 안 나와요\n3라운드', app: '1.2.0',
  local: '1.2.0', build: 'abc123', sender: '0123456789abcdef', match: 'k1-2', stats: { room: 'QWER', match: 2 },
  diag: '```text\nStronghold-Protocol diagnostics\nversion: 1.2.0\n```', battles: [{ t: 'b.start' }], public: true, ...over,
});

/** A fake api.github.com: records the calls; `issue` decides the answer to an issue POST. */
function fakeGitHub({ issue = () => ({ status: 201 }), label = 404, list = [] } = {}) {
  const calls = [];
  let next = 1;
  const fetch = async (url, init) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path: u.pathname + u.search, auth: init.headers.authorization, body });
    const answer = (status, json) => ({ status, json: async () => json });
    if (u.pathname === '/repos/o/r/installation') return answer(200, { id: 77 });
    if (u.pathname === '/app/installations/77/access_tokens') return answer(201, { token: 'tok', expires_at: '2099-01-01T00:00:00Z' });
    if (u.pathname === '/repos/o/r/labels/feedback') return answer(label, {});
    if (u.pathname === '/repos/o/r/labels') return answer(201, {});
    if (u.pathname === '/repos/o/r/issues' && init.method === 'GET') return answer(200, list);
    if (u.pathname === '/repos/o/r/issues') {
      const r = issue(body);
      if (r.throw) throw r.throw;
      if (r.status !== 201) return answer(r.status, { message: 'nope' });
      const number = next++;
      return answer(201, { number, html_url: `https://github.com/o/r/issues/${number}` });
    }
    return answer(404, { message: 'not found' });
  };
  return { calls, fetch, posts: () => calls.filter((c) => c.method === 'POST' && c.path === '/repos/o/r/issues') };
}

const relayOf = (dir, gh, over = {}) => new FeedbackRelay({ dir, repo: 'o/r', appId: '123', key: privateKey, fetch: gh.fetch, log: quiet, ...over });

test('appJwt: RS256 signed by the app key, issuer = app id, under ten minutes', () => {
  const now = Date.UTC(2026, 9, 9, 12);
  const [h, p, sig] = appJwt('123', privateKey, now).split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.iss, '123');
  assert.equal(claims.iat, now / 1000 - 60);
  assert.ok(claims.exp - claims.iat <= 600);
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig, 'base64url')));
});

test('the issue: title from the first line, text escaped (no mentions, no HTML), diagnostics folded, battles only counted', () => {
  assert.equal(issueTitle(recOf('a', { text: '\n  첫 줄\n둘째' })), '[버그] 첫 줄');
  assert.equal(issueTitle(recOf('a', { kind: 'idea', text: '가'.repeat(80) })), `[제안] ${'가'.repeat(59)}…`);
  assert.equal(escapeMarkdown('@octocat <img src=x> **b** [l](u)\n# h'), '@\u200boctocat &lt;img src\\=x\\> \\*\\*b\\*\\* \\[l\\]\\(u\\)  \n\\# h');
  assert.equal(fenced('a ``` b ```` c'), '`````text\na ``` b ```` c\n`````');
  const body = issueBody(recOf('abcd1234', { text: 'hi @admin' }));
  assert.match(body, /접수 번호 abcd1234/);
  assert.match(body, /hi @\u200badmin/);
  assert.match(body, /<details><summary>진단 정보<\/summary>\n\n```text\nStronghold-Protocol diagnostics\nversion: 1\.2\.0\n```\n\n<\/details>/);
  assert.match(body, /전투 데이터 1전/);
  assert.match(body, /<!-- FB-20261009-abcd1234 -->/);
  for (const secret of ['QWER', '0123456789abcdef', 'b.start']) assert.ok(!body.includes(secret), `${secret} stays off GitHub`);
  const plain = issueBody(recOf('x', { diag: null, battles: null }));
  assert.ok(!plain.includes('<details>') && !plain.includes('전투 데이터'));
});

test('posts each public report once, with labels; private ones and posted ones are left alone', async () => {
  const dir = inboxOf([recOf('aaaa0001'), recOf('aaaa0002', { public: false }), recOf('aaaa0003', { kind: 'other' }), recOf('aaaa0004', { public: undefined })]);
  const gh = fakeGitHub();
  const relay = relayOf(dir, gh);
  try {
    assert.deepEqual(await relay.tick(), ['posted', 'posted']);
    const posts = gh.posts();
    assert.deepEqual(posts.map((p) => p.body.labels), [['feedback', 'bug'], ['feedback']]);
    assert.ok(posts.every((p) => p.auth === 'Bearer tok'));
    assert.ok(gh.calls.find((c) => c.path === '/repos/o/r/installation').auth.startsWith('Bearer ey'), 'the app JWT finds the installation');
    assert.ok(gh.calls.some((c) => c.method === 'POST' && c.path === '/repos/o/r/labels'), 'the missing label is made');
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'issues', 'FB-20261009-aaaa0001.json'), 'utf8'));
    assert.equal(state.number, 1);
    assert.equal(state.url, 'https://github.com/o/r/issues/1');
    assert.deepEqual(fs.readdirSync(path.join(dir, 'issues')).sort(), ['FB-20261009-aaaa0001.json', 'FB-20261009-aaaa0003.json']);
    assert.deepEqual(await relay.tick(), [], 'nothing twice');
    assert.equal(gh.posts().length, 2);
    // a new relay (restart) reads the state, not memory
    assert.deepEqual(await relayOf(dir, gh).tick(), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a refused request is tried again after a doubling wait; a connection that never opened too', async () => {
  const dir = inboxOf([recOf('bbbb0001')]);
  let now = 0;
  let answer = { status: 502 };
  const gh = fakeGitHub({ issue: () => answer });
  const relay = relayOf(dir, gh, { now: () => now, pollMs: 30_000 });
  try {
    assert.deepEqual(await relay.tick(), ['refused']);
    assert.ok(!fs.existsSync(path.join(dir, 'issues', 'FB-20261009-bbbb0001.posting')), 'no marker after an answer');
    now += 30_000;
    assert.deepEqual(await relay.tick(), [], 'waits 60 s');
    now += 30_000;
    answer = { throw: Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }) };
    assert.deepEqual(await relay.tick(), ['refused']);
    now += 120_000;
    answer = { status: 201 };
    assert.deepEqual(await relay.tick(), ['posted']);
    assert.equal(gh.posts().length, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a request without an answer keeps its marker; the repository settles it — found, or posted again', async () => {
  const dir = inboxOf([recOf('cccc0001'), recOf('cccc0002')]);
  let now = Date.UTC(2026, 9, 9, 12);
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const gh = fakeGitHub({ issue: () => ({ throw: timeout }) });
  const relay = relayOf(dir, gh, { now: () => now });
  try {
    assert.deepEqual(await relay.tick(), ['unknown', 'unknown']);
    assert.ok(fs.existsSync(path.join(dir, 'issues', 'FB-20261009-cccc0001.posting')));
    // the first one was made after all (its body carries the id), the second was not
    gh.fetch = fakeGitHub({ list: [{ number: 9, html_url: 'https://github.com/o/r/issues/9', body: 'x\n<!-- FB-20261009-cccc0001 -->\n' }] }).fetch;
    const calls = [];
    const inner = gh.fetch;
    relay.fetch = async (url, init) => { calls.push(`${init.method} ${new URL(url).pathname}`); return inner(url, init); };
    assert.deepEqual(await relay.tick(), [], 'too early to call the second one lost');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'issues', 'FB-20261009-cccc0001.json'), 'utf8')).number, 9);
    assert.ok(!calls.includes('POST /repos/o/r/issues'));
    for (const f of fs.readdirSync(path.join(dir, 'issues'))) {
      const old = new Date(now - 4 * 60_000);
      fs.utimesSync(path.join(dir, 'issues', f), old, old);
    }
    assert.deepEqual(await relay.tick(), ['posted'], 'no issue carries it after the settle time: posted again');
    assert.ok(fs.existsSync(path.join(dir, 'issues', 'FB-20261009-cccc0002.json')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an inbox with nothing to post makes no GitHub call; settings are checked', async () => {
  const dir = inboxOf([recOf('dddd0001', { public: false })]);
  const gh = fakeGitHub();
  try {
    assert.deepEqual(await relayOf(dir, gh).tick(), []);
    assert.equal(gh.calls.length, 0);
    assert.throws(() => relayOf(dir, gh, { repo: 'https://github.com/o/r' }), /owner\/name/);
    assert.throws(() => relayOf(dir, gh, { appId: '' }), /SP_GITHUB_APP_ID/);
    assert.throws(() => FeedbackRelay.fromEnv({ SP_FEEDBACK_DIR: dir, SP_FEEDBACK_REPO: 'o/r', SP_GITHUB_APP_ID: '1' }, quiet), /SP_GITHUB_APP_KEY/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
