// Local patch, server side: the feedback relay — posts the settlement screen's reports (server/local-feedback.js inbox)
// as issues of a GitHub repository (stage 2, maintainer decision 2026-10-09: every report, automatically). A separate process
// so the game server itself needs no network access: it only reads SP_FEEDBACK_DIR/inbox/ and writes what it posted to
// SP_FEEDBACK_DIR/issues/. It authenticates as a GitHub App installed on that one repository (Issues: read and write),
// so the issues are written by the app's bot, not by a person's account.
//
//   node server/feedback-relay.js
//
//   SP_FEEDBACK_DIR        the inbox's directory (the game server's SP_FEEDBACK_DIR); the inbox may be mounted read-only
//   SP_FEEDBACK_REPO       owner/name of the repository (the game server gets the same value: it tells the window)
//   SP_GITHUB_APP_ID       the GitHub App's id
//   SP_GITHUB_APP_KEY      path of the app's private key (PEM)
//   SP_GITHUB_INSTALLATION optional: the installation id (else looked up from the repository)
//   SP_RELAY_POLL_S        optional: seconds between inbox scans (default 300: 5 minutes, maintainer decision 2026-10-09)
//
// What is posted: only reports stored with `public: true` (the window told the player the report becomes a public issue —
// a report sent under the stage-1 notice stays private), and of those only the kind, the text, the versions, the receipt
// number and the diagnostics the player chose to attach (names and the room code already replaced by the client). Kept
// off GitHub: the battles (the operator pulls them with the inbox), the match's [stats] record, the sender's hash.
//
// Exactly once: before the request the relay creates issues/<id>.posting (exclusive); on a created issue it writes
// issues/<id>.json { number, url, at } and removes the marker; on a refused request (any HTTP answer but 201) or a
// connection that never opened it removes the marker and tries again later (doubling the wait). A marker left by a
// crash or a request without an answer is settled from the repository: the issues changed since the marker are listed
// and one whose body carries the report's id (`<!-- FB-… -->`) is recorded as posted; none after MARKER_SETTLE_MS means
// it was never made, and the marker goes. State files go with the inbox's KEEP_DAYS.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { KEEP_DAYS, DAY_MS, REPO_RE } from './local-feedback.js';

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const LABEL = 'feedback';
const KIND_LABEL = { bug: 'bug', idea: 'enhancement' };
const KIND_TITLE = { bug: '버그', idea: '제안', other: '기타' };
/** a report waits at most this long between tries after a refused request (doubling from POLL) */
const BACKOFF_MAX_MS = 60 * 60_000;
/** the request without an answer after this long is abandoned (and its marker kept) */
const REQUEST_TIMEOUT_MS = 30_000;
/** between inbox scans (a scan reads the local inbox only; GitHub is asked only when a report waits) */
export const POLL_MS = 5 * 60_000;
/** a marker this old with no issue carrying its id means the issue was never made */
const MARKER_SETTLE_MS = 3 * 60_000;
/** errors of a connection that never opened: the issue cannot exist */
const NOT_SENT = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);
const TITLE_MAX = 60;
const BODY_MAX = 60_000;

/** a web address as GFM autolinks it (left as written: escapes inside would end up in the link) */
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/g;

/** GitHub-flavoured Markdown of plain text: shows as written, links nobody (@ gets a zero-width space), runs no HTML. */
export function escapeMarkdown(text) {
  const plain = (t) => t
    .replace(/[\\`*_{}[\]()#+\-.!|~>=]/g, (c) => `\\${c}`)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/@/g, '@\u200b');
  const s = String(text);
  let out = '', at = 0;
  for (const m of s.matchAll(URL_RE)) {
    out += plain(s.slice(at, m.index)) + m[0];
    at = m.index + m[0].length;
  }
  return (out + plain(s.slice(at))).replace(/\n/g, '  \n');
}

/** A fenced code block around `text` that nothing inside can close. */
export function fenced(text, lang = 'text') {
  const run = Math.max(2, ...[...String(text).matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(run + 1);
  return `${fence}${lang}\n${text}\n${fence}`;
}

/** The diagnostics without the client's own ```text fence (it is fenced again here). */
const diagBody = (diag) => String(diag).replace(/^```text\n/, '').replace(/\n```\s*$/, '');

/** The issue title: kind + the text's first line, shortened. */
export function issueTitle(rec) {
  const first = String(rec.text || '').split('\n').find((l) => l.trim()) || '';
  const cps = [...first.trim()];
  const line = cps.length > TITLE_MAX ? `${cps.slice(0, TITLE_MAX - 1).join('')}…` : cps.join('');
  return `[${KIND_TITLE[rec.kind] || KIND_TITLE.other}] ${line}`;
}

/** The issue body of a stored report (Korean: the players' language). */
export function issueBody(rec) {
  const receipt = String(rec.id || '').replace(/^FB-\d{8}-/, '');
  const version = [rec.local || rec.app, rec.build ? `build ${rec.build}` : null].filter(Boolean).join(' · ');
  const parts = [
    `> 결산 화면 「피드백 보내기」로 자동 등록된 제보입니다. 접수 번호 ${receipt}`,
    '',
    `**종류** ${KIND_TITLE[rec.kind] || KIND_TITLE.other} · **버전** ${escapeMarkdown(version || '?')} · **받은 때** ${escapeMarkdown(rec.at || '?')}`,
    '',
    '---',
    '',
    escapeMarkdown(rec.text || ''),
  ];
  const battles = Array.isArray(rec.battles) ? rec.battles.length : 0;
  if (battles) parts.push('', `<sub>이번 시뮬레이션 전투 데이터 ${battles}전이 첨부되어 서버에 보관 중입니다(공개하지 않음).</sub>`);
  let body = parts.join('\n');
  if (typeof rec.diag === 'string' && rec.diag) {
    const room = BODY_MAX - body.length - 200;
    let diag = diagBody(rec.diag);
    if (diag.length > room) diag = `${diag.slice(0, Math.max(0, room))}\n… (잘림)`;
    body += `\n\n<details><summary>진단 정보</summary>\n\n${fenced(diag)}\n\n</details>`;
  }
  return `${body}\n\n<!-- ${rec.id} -->\n`;
}

/** base64url of a buffer or a JSON value. */
const b64url = (v) => Buffer.from(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).toString('base64url');

/** A GitHub App JWT (RS256, 9 minutes, backdated a minute against clock drift). */
export function appJwt(appId, key, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000) - 60;
  const head = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iat, exp: iat + 540, iss: String(appId) })}`;
  return `${head}.${crypto.sign('sha256', Buffer.from(head), key).toString('base64url')}`;
}

export class FeedbackRelay {
  /**
   * @param {{ dir: string, repo: string, appId: string, key: string|Buffer|crypto.KeyObject, installation?: string|null,
   *   pollMs?: number, fetch?: typeof fetch, now?: () => number, log?: { info: Function, warn: Function, error: Function } }} opts
   */
  constructor({ dir, repo, appId, key, installation = null, pollMs = POLL_MS, fetch: fetchImpl = globalThis.fetch,
    now = Date.now, log = console }) {
    if (!dir) throw new Error('feedback relay: no SP_FEEDBACK_DIR');
    if (!REPO_RE.test(repo || '')) throw new Error('feedback relay: SP_FEEDBACK_REPO must be owner/name');
    if (!appId || !key) throw new Error('feedback relay: SP_GITHUB_APP_ID and SP_GITHUB_APP_KEY are needed');
    this.dir = path.resolve(dir);
    this.repo = repo;
    this.appId = String(appId);
    this.key = typeof key === 'object' && !Buffer.isBuffer(key) ? key : crypto.createPrivateKey(key);
    this.installation = installation ? String(installation) : null;
    this.pollMs = pollMs;
    this.fetch = fetchImpl;
    this.now = now;
    this.log = log;
    this.token = null;      // { value, until }
    this.labels = null;     // whether the `feedback` label can be used (checked once per run)
    this.retry = new Map(); // id → { at, wait } after a refused request
    this.timer = null;
    this.running = null;
    fs.mkdirSync(this.state, { recursive: true });
  }

  /** The relay of the environment (throws on a missing setting). */
  static fromEnv(env = process.env, log = console) {
    const keyFile = env.SP_GITHUB_APP_KEY;
    if (!keyFile) throw new Error('feedback relay: SP_GITHUB_APP_KEY (path of the app key) is not set');
    const poll = Number(env.SP_RELAY_POLL_S);
    return new FeedbackRelay({
      dir: env.SP_FEEDBACK_DIR, repo: (env.SP_FEEDBACK_REPO || '').trim(), appId: env.SP_GITHUB_APP_ID,
      key: fs.readFileSync(keyFile), installation: env.SP_GITHUB_INSTALLATION || null,
      pollMs: Number.isFinite(poll) && poll >= 5 ? poll * 1000 : POLL_MS, log,
    });
  }

  get inbox() { return path.join(this.dir, 'inbox'); }
  get state() { return path.join(this.dir, 'issues'); }

  /** One GitHub API call → { status, body }. */
  async api(method, url, { auth, body } = {}) {
    const res = await this.fetch(`${API}${url}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json', 'x-github-api-version': API_VERSION, 'user-agent': 'stronghold-feedback-relay',
        authorization: `Bearer ${auth}`, ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty or not JSON */ }
    return { status: res.status, body: json };
  }

  /** An installation token, reused until five minutes before it expires. */
  async installationToken() {
    if (this.token && this.now() < this.token.until) return this.token.value;
    const jwt = appJwt(this.appId, this.key, this.now());
    if (!this.installation) {
      const r = await this.api('GET', `/repos/${this.repo}/installation`, { auth: jwt });
      if (r.status !== 200 || !r.body?.id) throw new Error(`app not installed on ${this.repo} (HTTP ${r.status})`);
      this.installation = String(r.body.id);
    }
    const r = await this.api('POST', `/app/installations/${this.installation}/access_tokens`, { auth: jwt });
    if (r.status !== 201 || !r.body?.token) throw new Error(`no installation token (HTTP ${r.status} ${r.body?.message || ''})`);
    const until = Date.parse(r.body.expires_at) || this.now() + 55 * 60_000;
    this.token = { value: r.body.token, until: until - 5 * 60_000 };
    return this.token.value;
  }

  /** The `feedback` label (made when missing; the kind labels are GitHub's defaults). Issues go without it if it cannot be made. */
  async ensureLabels(token) {
    if (this.labels != null) return;
    const r = await this.api('GET', `/repos/${this.repo}/labels/${LABEL}`, { auth: token });
    if (r.status === 404) {
      const c = await this.api('POST', `/repos/${this.repo}/labels`, {
        auth: token, body: { name: LABEL, color: '1d76db', description: '게임 결산 화면에서 보낸 제보' },
      });
      this.labels = c.status === 201 || c.status === 422;
      if (!this.labels) this.log.warn(`[relay] label ${LABEL} not made (HTTP ${c.status}) — issues go without labels`);
    } else {
      this.labels = r.status === 200;
    }
  }

  /** Record a created issue. */
  posted(id, issue) {
    fs.writeFileSync(path.join(this.state, `${id}.json`), JSON.stringify({ number: issue.number, url: issue.html_url, at: new Date(this.now()).toISOString() }));
    fs.rmSync(path.join(this.state, `${id}.posting`), { force: true });
    this.retry.delete(id);
    this.log.info(`[relay] ${id} → #${issue.number}`);
  }

  /** Settle the markers of tries without an answer from the repository's issues (see the header). */
  async settle(token) {
    let names;
    try { names = fs.readdirSync(this.state).filter((n) => /^FB-.*\.posting$/.test(n)); } catch { return; }
    for (const name of names) {
      const id = name.slice(0, -8);
      const file = path.join(this.state, name);
      let since;
      try { since = fs.statSync(file).mtimeMs; } catch { continue; }
      const r = await this.api('GET', `/repos/${this.repo}/issues?state=all&sort=created&direction=desc&per_page=100&since=${new Date(since - 60_000).toISOString()}`, { auth: token });
      if (r.status !== 200 || !Array.isArray(r.body)) continue;
      const issue = r.body.find((i) => typeof i?.body === 'string' && i.body.includes(`<!-- ${id} -->`));
      if (issue) { this.posted(id, issue); continue; }
      if (this.now() - since >= MARKER_SETTLE_MS) {
        fs.rmSync(file, { force: true });
        this.log.warn(`[relay] ${id}: the try without an answer made no issue — posting again`);
      }
    }
  }

  /** Inbox reports to post now: public, not posted, no marker, not waiting after a refusal. Oldest first. */
  pending() {
    let names;
    try { names = fs.readdirSync(this.inbox).filter((n) => /^FB-\d{8}-[a-z0-9]{8}\.json$/.test(n)).sort(); } catch { return []; }
    const out = [];
    for (const name of names) {
      const id = name.slice(0, -5);
      if (fs.existsSync(path.join(this.state, `${id}.json`))) continue;
      if (fs.existsSync(path.join(this.state, `${id}.posting`))) continue;
      const wait = this.retry.get(id);
      if (wait && this.now() < wait.at) continue;
      let rec;
      try { rec = JSON.parse(fs.readFileSync(path.join(this.inbox, name), 'utf8')); } catch { continue; } // still being written
      if (rec?.public !== true) continue;
      out.push(rec);
    }
    return out;
  }

  /** Post one report. → 'posted' | 'refused' | 'unknown' (no answer: the marker stays for settle) */
  async post(rec, token) {
    const marker = path.join(this.state, `${rec.id}.posting`);
    try {
      fs.writeFileSync(marker, String(this.now()), { flag: 'wx' });
    } catch (e) {
      if (e?.code !== 'EEXIST') this.log.error(`[relay] ${rec.id}: ${this.state} not writable (${e?.code || e}) — nothing posted`);
      return 'unknown';
    }
    const labels = this.labels ? [LABEL, KIND_LABEL[rec.kind]].filter(Boolean) : [];
    const backoff = (why) => {
      fs.rmSync(marker, { force: true });
      const prev = this.retry.get(rec.id)?.wait || this.pollMs;
      const wait = Math.min(prev * 2, BACKOFF_MAX_MS);
      this.retry.set(rec.id, { at: this.now() + wait, wait });
      this.log.warn(`[relay] ${rec.id}: ${why} — next try in ${Math.round(wait / 1000)} s`);
      return 'refused';
    };
    let r;
    try {
      r = await this.api('POST', `/repos/${this.repo}/issues`, { auth: token, body: { title: issueTitle(rec), body: issueBody(rec), labels } });
    } catch (e) {
      const code = e?.cause?.code || e?.code;
      if (NOT_SENT.has(code)) return backoff(`not connected (${code})`);
      this.log.error(`[relay] ${rec.id}: no answer (${code || e?.name || e}) — settled from the repository's issues on a later scan`);
      return 'unknown';
    }
    if (r.status === 201 && r.body?.number) { this.posted(rec.id, r.body); return 'posted'; }
    if (r.status === 401) this.token = null;
    return backoff(`HTTP ${r.status} ${String(r.body?.message || '').slice(0, 120)}`);
  }

  /** Delete state files older than KEEP_DAYS whose report has left the inbox. */
  prune() {
    const cutoff = this.now() - KEEP_DAYS * DAY_MS;
    let names;
    try { names = fs.readdirSync(this.state); } catch { return; }
    for (const name of names) {
      if (!/^FB-.*\.json$/.test(name)) continue;
      const file = path.join(this.state, name);
      try {
        if (fs.statSync(file).mtimeMs < cutoff && !fs.existsSync(path.join(this.inbox, name))) fs.unlinkSync(file);
      } catch { /* gone meanwhile */ }
    }
  }

  /** One scan: settle open markers, post what waits. → the outcomes of the posts. */
  async tick() {
    const out = [];
    const markers = (() => { try { return fs.readdirSync(this.state).some((n) => n.endsWith('.posting')); } catch { return false; } })();
    if (!markers && !this.pending().length) return out;
    let token;
    try {
      token = await this.installationToken();
      await this.ensureLabels(token);
      if (markers) await this.settle(token);
    } catch (e) {
      this.log.error(`[relay] ${e?.cause?.code || e?.message || e}`);
      return out;
    }
    for (const rec of this.pending()) out.push(await this.post(rec, token));
    return out;
  }

  start() {
    const loop = async () => {
      try { this.running = this.tick(); await this.running; this.prune(); } catch (e) { this.log.error(`[relay] ${e?.stack || e}`); }
      this.timer = setTimeout(loop, this.pollMs);
    };
    this.log.info(`[relay] posting public feedback from ${this.inbox} to ${this.repo} every ${Math.round(this.pollMs / 1000)} s`);
    loop();
  }

  async stop() {
    clearTimeout(this.timer);
    this.timer = null;
    try { await this.running; } catch { /* logged */ }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  let relay;
  try {
    relay = FeedbackRelay.fromEnv();
  } catch (e) {
    console.error(String(e?.message || e));
    process.exit(2);
  }
  relay.start();
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { relay.stop().then(() => process.exit(0)); });
}
