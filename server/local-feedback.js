// Local patch, server side: the settlement screen's 피드백 보내기 (feedback) inbox. A player who just finished a match
// sends a bug report or a suggestion (fb.send, shared/local.js); this server keeps it as one JSON file in
// SP_FEEDBACK_DIR/inbox/ for the operator to pull and triage. Nothing is posted anywhere from here: with
// SP_FEEDBACK_REPO (`owner/name`) set, server/feedback-relay.js — a separate process, the one with network access — posts
// each report the player sent as public as an issue of that repository (stage 2, user decision 2026-10-09: every report,
// automatically). Called from server/local-patch.js (onMessage, onMatchEnd, welcomeInfo — one line each).
//
//   fb.send { id, kind: 'bug' | 'idea' | 'other', text, diag?, battles?, match?, public? }
//     id       8 lower-case letters / digits, made by the client — the receipt number it shows (FB-<date>-<id>)
//     text     what the player wrote (≤ FEEDBACK_TEXT_MAX code points after cleaning; newlines kept)
//     diag     public/js/diag.js diagnosticsText: version, browser, the client's error log (names already replaced)
//     battles  this match's battles as the browser received them (b.start payloads, names replaced), gzip + base64
//     match    the battleId prefix of those battles (`<seed36>[-<matchNo36>]`), to tell matches apart
//     public   true when the window told the player the text and diagnostics become a public issue (welcome
//              `feedbackIssues`); stored as `public` only while SP_FEEDBACK_REPO is set — the relay posts nothing else,
//              so a report sent under the stage-1 notice (「only the developers see it」) never becomes public
//
// Who may send: a human seat (or spectator) of a match that ended on this server within RECENT_MS (onMatchEnd marks them), at most
// PER_MATCH reports per match, PER_ADDR per address and GLOBAL in all per day (in memory; a restart forgets them).
// What is stored besides the player's fields: the time, the server's versions, the match's [stats] record without names
// (server/local-stats.js — room code + match number tie it to the container log) and the sender's address as a keyed
// hash (HMAC-SHA256 with a random key kept in the inbox directory, first 16 hex): the same sender's reports group
// together, the address itself is never written (user decision 2026-10-09). Files older than KEEP_DAYS (90) are
// deleted (on start and every few hours); the pull removes what it copied.
//
// Off (fb.send → BAD_MSG, no `feedback` in welcome, the client shows no button) unless SP_FEEDBACK_DIR is set.
// Welcome carries `feedbackIssues` (the repository's issue list) while SP_FEEDBACK_REPO is set too.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { ERR, APP_VERSION } from '../shared/constants.js';
import { FEEDBACK_KINDS, FEEDBACK_TEXT_MAX, localVersion } from '../shared/local.js';
import { matchStats } from './local-stats.js';
import { buildTag } from './http/buildTag.js';

export const RECENT_MS = 60 * 60_000;
export const PER_MATCH = 3;
export const PER_ADDR = 10;
export const GLOBAL = 200;
export const DAY_MS = 24 * 60 * 60_000;
export const KEEP_DAYS = 90;
const PRUNE_EVERY_MS = 6 * 60 * 60_000;
/** The unpacked battles may be at most this large (zlib maxOutputLength: a gzip bomb stops here). */
export const BATTLES_MAX_BYTES = 4 * 1024 * 1024;
export const BATTLES_MAX = 40;

/** `owner/name` of a GitHub repository. */
export const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

const OK = Object.freeze({ ok: true });
const fail = (code, detail) => (detail ? { error: code, detail } : { error: code });

// control characters except tab and newline, the zero-width and direction marks, lone surrogates (cf. local-patch.js)
const STRIP_RE = new RegExp('[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\u00ad\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g');
const LONE_SURROGATE_RE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * The player's text as stored: CRLF → LF, control characters out, at most two blank lines in a row, trimmed, cut to
 * `max` code points; null when nothing is left.
 * @param {unknown} raw @param {number} [max]
 */
export function cleanFeedbackText(raw, max = FEEDBACK_TEXT_MAX) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/\r\n?/g, '\n').replace(STRIP_RE, '').replace(LONE_SURROGATE_RE, '');
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  const cps = [...s];
  if (cps.length > max) s = cps.slice(0, max).join('').trimEnd();
  return s ? s : null;
}

/** `YYYYMMDD` (UTC) of an epoch ms. */
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

/** Unpack the battles field (base64 gzip of a JSON array): the array, or { error } saying why it was dropped. */
export function unpackBattles(b64) {
  try {
    const raw = zlib.gunzipSync(Buffer.from(b64, 'base64'), { maxOutputLength: BATTLES_MAX_BYTES });
    const list = JSON.parse(raw.toString('utf8'));
    if (!Array.isArray(list)) return { error: 'not an array' };
    return { list: list.slice(-BATTLES_MAX) };
  } catch (e) {
    return { error: String(e?.code || e?.message || e).slice(0, 80) };
  }
}

export class FeedbackInbox {
  /**
   * @param {{ dir?: string|null, now?: () => number, log?: { info: Function, warn: Function, error: Function },
   *   limits?: { recentMs?: number, perMatch?: number, perAddr?: number, global?: number }, repo?: string|null }} [opts]
   */
  constructor({ dir = null, now = Date.now, log = console, limits = {}, repo = null } = {}) {
    this.dir = dir ? path.resolve(dir) : null;
    /** `owner/name` the relay posts public reports to (SP_FEEDBACK_REPO), or null: reports stay on this server */
    this.repo = typeof repo === 'string' && REPO_RE.test(repo) ? repo : null;
    this.now = now;
    this.log = log;
    this.limits = { recentMs: RECENT_MS, perMatch: PER_MATCH, perAddr: PER_ADDR, global: GLOBAL, ...limits };
    /** playerId → { at, key, stats } of the match it just finished */
    this.recent = new Map();
    /** match key → reports taken */
    this.perMatch = new Map();
    /** address → send times in the last day */
    this.perAddr = new Map();
    this.sent = [];
    this.key = null;
    this.pruneTimer = null;
    if (this.dir) {
      try {
        fs.mkdirSync(this.inbox, { recursive: true });
        this.key = this.loadKey();
        this.prune();
        this.pruneTimer = setInterval(() => this.prune(), PRUNE_EVERY_MS);
        this.pruneTimer.unref?.();
      } catch (e) {
        this.log.error(`[feedback] inbox ${this.dir} unusable, feedback off: ${e?.message || e}`);
        this.dir = null;
      }
    }
  }

  /** The inbox of SP_FEEDBACK_DIR (off when unset); SP_FEEDBACK_REPO names the repository the relay posts to. */
  static fromEnv(env = process.env, log = console) {
    const dir = typeof env.SP_FEEDBACK_DIR === 'string' && env.SP_FEEDBACK_DIR.trim() ? env.SP_FEEDBACK_DIR.trim() : null;
    const repo = typeof env.SP_FEEDBACK_REPO === 'string' ? env.SP_FEEDBACK_REPO.trim() : '';
    if (dir && repo && !REPO_RE.test(repo)) log.warn(`[feedback] SP_FEEDBACK_REPO ${JSON.stringify(repo.slice(0, 80))} is not owner/name — reports stay on this server`);
    return new FeedbackInbox({ dir, log, repo: repo || null });
  }

  get enabled() { return !!this.dir; }
  get inbox() { return path.join(this.dir, 'inbox'); }

  /** The address hash key: SP_FEEDBACK_DIR/.key (32 random bytes, made on first use, mode 0600). */
  loadKey() {
    const file = path.join(this.dir, '.key');
    try { return fs.readFileSync(file); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(file, key, { mode: 0o600, flag: 'wx' });
    return key;
  }

  /** @param {string|null|undefined} addr */
  addrHash(addr) {
    if (!addr || !this.key) return null;
    return crypto.createHmac('sha256', this.key).update(String(addr)).digest('hex').slice(0, 16);
  }

  /** Delete inbox files older than KEEP_DAYS. */
  prune() {
    if (!this.dir) return;
    const cutoff = this.now() - KEEP_DAYS * DAY_MS;
    let names;
    try { names = fs.readdirSync(this.inbox); } catch { return; }
    for (const name of names) {
      if (!/^FB-.*\.json$/.test(name)) continue;
      const file = path.join(this.inbox, name);
      try { if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file); } catch { /* gone meanwhile */ }
    }
  }

  stop() { if (this.pruneTimer) clearInterval(this.pruneTimer); this.pruneTimer = null; }

  /** A match ended (local-patch.js onMatchEnd): its human seats may send feedback for RECENT_MS. */
  noteMatchEnd(room) {
    if (!this.dir || !room) return;
    const at = this.now();
    let stats = null;
    try {
      const rec = matchStats(room, room.lastSummary);
      if (rec) stats = { ...rec, players: (rec.players || []).map(({ name, ...p }) => p) };
    } catch { /* the report goes without it */ }
    const key = `${room.code}#${room.matchCount}`;
    for (const s of [...(room.seats || []), ...(room.spectators || [])]) {
      if (s && !s.isBot && !s.left && s.playerId) this.recent.set(s.playerId, { at, key, stats });
    }
    for (const [id, r] of this.recent) if (at - r.at > this.limits.recentMs) this.recent.delete(id);
  }

  /** The repository's issue list while reports are posted there, else null. */
  get issuesUrl() { return this.dir && this.repo ? `https://github.com/${this.repo}/issues` : null; }

  /** Extra welcome fields: `feedback: true` while the inbox is on, `feedbackIssues` while reports become public issues. */
  welcomeInfo() {
    if (!this.dir) return null;
    return this.repo ? { feedback: true, feedbackIssues: this.issuesUrl } : { feedback: true };
  }

  /**
   * fb.send from `session` (validated by shared/local.js): stored, or refused.
   * @param {{ playerId: string, addr?: string|null }} session @param {any} msg
   */
  submit(session, msg) {
    if (!this.dir) return fail(ERR.BAD_MSG, 'feedback off');
    const now = this.now();
    const r = this.recent.get(session.playerId);
    if (!r || now - r.at > this.limits.recentMs) return fail(ERR.WRONG_PHASE, 'no finished match');
    if (!FEEDBACK_KINDS.includes(msg.kind)) return fail(ERR.BAD_MSG, 'kind');
    const text = cleanFeedbackText(msg.text);
    if (!text) return fail(ERR.BAD_MSG, 'empty text');
    if ((this.perMatch.get(r.key) || 0) >= this.limits.perMatch) return fail(ERR.RATE, 'per match');
    const addr = session.addr || '?';
    const times = (this.perAddr.get(addr) || []).filter((t) => now - t < DAY_MS);
    if (times.length >= this.limits.perAddr) return fail(ERR.RATE, 'per address');
    this.sent = this.sent.filter((t) => now - t < DAY_MS);
    if (this.sent.length >= this.limits.global) return fail(ERR.RATE, 'per day');

    const id = `FB-${dayOf(now)}-${msg.id}`;
    const file = path.join(this.inbox, `${id}.json`);
    let battles = null, battlesError = null;
    if (typeof msg.battles === 'string' && msg.battles) {
      const u = unpackBattles(msg.battles);
      if (u.list) battles = u.list; else battlesError = u.error;
    }
    const rec = {
      v: 1, id, at: new Date(now).toISOString(), kind: msg.kind, text,
      app: APP_VERSION, local: localVersion(), build: safeBuildTag(),
      sender: this.addrHash(session.addr), match: typeof msg.match === 'string' ? msg.match : null,
      stats: r.stats,
      diag: typeof msg.diag === 'string' && msg.diag ? msg.diag : null,
      battles, ...(battlesError ? { battlesError } : {}),
      public: !!this.repo && msg.public === true,
    };
    try {
      fs.writeFileSync(file, JSON.stringify(rec), { flag: 'wx', mode: 0o640 });
    } catch (e) {
      if (e?.code === 'EEXIST') return fail(ERR.ALREADY, 'id taken');
      this.log.error(`[feedback] ${id} not written: ${e?.message || e}`);
      return fail(ERR.INTERNAL);
    }
    this.perMatch.set(r.key, (this.perMatch.get(r.key) || 0) + 1);
    times.push(now);
    this.perAddr.set(addr, times);
    this.sent.push(now);
    this.log.info(`[feedback] ${id} ${msg.kind} ${r.key}${battles ? ` battles ${battles.length}` : ''}${rec.public ? ' public' : ''}`);
    return OK;
  }
}

function safeBuildTag() { try { return buildTag() || null; } catch { return null; } }
