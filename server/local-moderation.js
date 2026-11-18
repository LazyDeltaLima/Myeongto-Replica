// Local patch, server side: the chat moderation of a deployed server (maintainer decisions 2026-11-18). Rules and reasons:
// docs/rules/ui.md 「채팅 차단」.
//
// Browser id. A browser keeps one id across visits: the server issues `<id>.<issued>.<mac>` (16 hex digits, the issue time
// in base 36, a keyed MAC over both) in `welcome.bid`, the page keeps it in localStorage and sends it back in every
// `hello.bid` (public/js/net.js). A value this server did not sign — or none — gets a fresh id. The id names a browser
// profile, not a person: a private window, cleared site data or another browser is a new id (the maintainer accepted that,
// 2026-11-18). The MAC lets the server trust the issue time without keeping every id it ever issued.
//
// Log lines (the operator's search material; the deployed server keeps them for 15 days, maintainer decision 2026-11-18,
// the maintainer's notes):
//   [id] <playerId> b=<id> net=<network key|local> <name>                   a socket's first hello (and a name change)
//   [room] <room> <playerId> b=<id> net=<network key|local> <event> <name>  a human entered a co-op room: created, joined,
//                                                                           spectating, reserved (took a reserved seat),
//                                                                           matched (seated by matchmaking)
//   [chat] <room> <playerId> b=<id> <name>[ (spectator)][ (muted:ban|net)]: <text>   every chat line (names and text JSON-quoted)
//   [mod] …                                                                 bans loaded, a muted browser seen on a network
//
// Chat ban: the operator lists browser ids in <dir>/chat-bans.json (the operator's script writes it; this server reloads it
// when it changes, every POLL_MS):
//   { "bans": [ { "id": "<16 hex>", "at": <ms>, "reason"?: "…", "until"?: <ms>, "nets"?: { "<network key>": <ms last seen> } } ],
//     "allow": [ "<16 hex>", … ], "shared"?: [ "<IPv4 CIDR>", … ] }
// A banned browser's chat lines are shadowed (server/local-patch.js chat): its sender sees them as sent, nobody else gets
// them. The ban covers chat only (maintainer decision 2026-11-18): the player still joins rooms and plays.
// Network follow-up: a banned browser seen on a network key (net.js clientAddress: the IPv4 address or the IPv6 /64) records
// the key with the time. A browser id issued after the ban that chats from such a key within NET_TTL_MS of the last
// sighting is shadowed too ('net', logged as [mod] so the operator may ban it for good or allow it): a fresh id on the
// banned browser's own network is most likely the same person after clearing the site data. Browsers whose id predates the
// ban — everyone else behind a shared carrier address (CGNAT) — are never touched, and the key expires a day after the
// last sighting, because a mobile address passes to other subscribers. `allow` exempts an id from this follow-up.
// Shared addresses (maintainer decisions 2026-11-18): the follow-up would also catch a stranger arriving first after the
// ban at an address many people share (an internet cafe, an office, a carrier's CGNAT address), so it is skipped on an IPv4
// key that is shared — one where this server saw more than SHARED_IDS different browser ids in the last NET_TTL_MS
// (counted in memory at `identify`, banned ids left out; each deploy slot counts its own, which only errs toward
// following up), one in a carrier's mobile range (MOBILE_V4) or one in the ban file's `shared` list. A banned person who
// clears the site data at such an address is missed (accepted, maintainer decision 2026-11-18: the operator bans the new
// id from the logs). An IPv6 /64 belongs to one subscriber and is never treated as shared.
//
//   moderationOf(lobby)  (server/local-patch.js) the lobby's instance, made on first use from SP_MODERATION_DIR (unset: ids
//                        are still issued with a per-process key, nothing is banned, nothing is written)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const V4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const isV4 = (s) => V4_RE.test(s);
/** @returns {number} the IPv4 address as an unsigned 32-bit number (NaN when not a valid address) */
function v4Int(s) {
  const m = V4_RE.exec(s);
  if (!m) return NaN;
  const p = m.slice(1).map(Number);
  return p.some((x) => x > 255) ? NaN : ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
/** '<IPv4>/<0–32>' → { base, mask }, or null. */
export function parseCidr(s) {
  const m = typeof s === 'string' ? /^([\d.]+)\/(\d{1,2})$/.exec(s.trim()) : null;
  const ip = m ? v4Int(m[1]) : NaN;
  const bits = m ? Number(m[2]) : NaN;
  if (!Number.isFinite(ip) || !(bits >= 0 && bits <= 32)) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (ip & mask) >>> 0, mask };
}
const inRange = (ip, r) => Number.isFinite(ip) && ((ip & r.mask) >>> 0) === r.base;

export const NET_TTL_MS = 24 * 3600_000;
export const POLL_MS = 10_000;
/** An IPv4 key with more than this many browser ids in NET_TTL_MS is a shared address (maintainer decision 2026-11-18). */
export const SHARED_IDS = 3;
/**
 * Korean carriers' mobile (cellular) IPv4 ranges, always shared addresses (CGNAT; maintainer decision 2026-11-18). Source:
 * namu.wiki 「통신사 IP」 §3 「목록」 (revision of 2026-11-09), each block's holder checked in the KRNIC WHOIS on 2026-11-18.
 * SK Telecom runs no home broadband (that is SK Broadband), so its blocks are all taken; KT's and LG U+'s allocations mix
 * mobile and home lines, so only the blocks the list names as mobile data are taken, and 125.188/16 (WHOIS: LG POWERCOMM
 * Xpeed, a home line), 61.43/16 (3G, ended) and 211.235/16 (no WHOIS record) are left out. A wrong entry only skips the
 * follow-up there; it never mutes anyone. More ranges go into the ban file's `shared` list without a deploy.
 */
export const MOBILE_V4 = Object.freeze([
  // SK Telecom: LTE / 5G, 3G, and the roaming range
  '27.160.0.0/12', '27.176.0.0/13', '223.32.0.0/11',
  '203.226.192.0/19', '203.226.224.0/20', '203.226.240.0/21', '203.226.248.0/22', '203.226.252.0/24',
  '211.234.128.0/18', '211.234.192.0/19', '211.234.224.0/20', '211.234.244.0/22', '211.234.248.0/21',
  '42.35.0.0/16', '42.36.0.0/16',
  // KT
  '39.7.0.0/16', '110.70.0.0/16', '118.235.0.0/16', '175.223.0.0/16',
  // LG U+
  '106.101.0.0/16', '106.102.0.0/16', '117.111.0.0/16', '211.36.128.0/19', '211.36.224.0/19',
]);
const MOBILE_RANGES = MOBILE_V4.map((c) => { const r = parseCidr(c); if (!r) throw new Error(`bad range ${c}`); return r; });
/** How often the per-key browser-id counts drop what is past NET_TTL_MS. */
const SWEEP_MS = 10 * 60_000;
/** A known network sighting is written back at most this often (a new key is written at once). */
const NET_WRITE_GAP_MS = 10 * 60_000;
const BAN_FILE = 'chat-bans.json';
const ID_RE = /^[0-9a-f]{16}$/;
const BID_RE = /^([0-9a-f]{16})\.([0-9a-z]{1,11})\.([0-9a-f]{16})$/;

export class Moderation {
  /**
   * @param {{ dir?: string|null, log?: any, now?: () => number, key?: Buffer, pollMs?: number }} [opts]
   */
  constructor({ dir = null, log = console, now = Date.now, key = undefined, pollMs = POLL_MS } = {}) {
    this.dir = dir;
    this.log = log;
    this.now = now;
    /** @type {{ id: string, at: number, reason?: string, until?: number, nets: Record<string, number> }[]} */
    this.bans = [];
    /** @type {Set<string>} */
    this.allow = new Set();
    /** @type {{ base: number, mask: number }[]} the ban file's `shared` ranges */
    this.shared = [];
    /** @type {Map<string, Map<string, number>>} IPv4 key → browser id → last seen (header 「Shared addresses」) */
    this.netIds = new Map();
    /** @type {Set<string>} keys already logged as shared by count */
    this.sharedLogged = new Set();
    this.lastSweep = this.now();
    this.mtime = -1;
    this.pollTimer = null;
    this.key = key || null;
    if (dir) {
      try {
        if (!this.key) this.key = loadKey(dir);
        this.reload();
        this.log.info(`[mod] shared address: more than ${SHARED_IDS} browser ids on an IPv4 key in 24 h, or ${MOBILE_V4.length} carrier mobile ranges`);
        this.pollTimer = setInterval(() => this.reload(), pollMs);
        this.pollTimer.unref?.();
      } catch (e) {
        this.log.error(`[mod] ${dir} unusable, chat bans off: ${e?.message || e}`);
        this.dir = null;
      }
    }
    if (!this.key) this.key = crypto.randomBytes(32);
  }

  /** From SP_MODERATION_DIR (unset: in-memory key, no bans). */
  static fromEnv(env = process.env, log = console) {
    const dir = typeof env.SP_MODERATION_DIR === 'string' && env.SP_MODERATION_DIR.trim() ? env.SP_MODERATION_DIR.trim() : null;
    return new Moderation({ dir, log });
  }

  stop() { if (this.pollTimer) clearInterval(this.pollTimer); this.pollTimer = null; }

  // ---- browser ids ----------------------------------------------------------------------------------

  mac(id, issued) { return crypto.createHmac('sha256', this.key).update(`${id}.${issued}`).digest('hex').slice(0, 16); }

  /** A new signed browser id. @returns {string} */
  issue() {
    const id = crypto.randomBytes(8).toString('hex');
    const issued = this.now().toString(36);
    return `${id}.${issued}.${this.mac(id, issued)}`;
  }

  /** @param {unknown} bid @returns {{ id: string, issuedAt: number } | null} a value this server signed */
  verify(bid) {
    const m = typeof bid === 'string' ? BID_RE.exec(bid) : null;
    if (!m) return null;
    const want = Buffer.from(this.mac(m[1], m[2]));
    if (!crypto.timingSafeEqual(want, Buffer.from(m[3]))) return null;
    const issuedAt = parseInt(m[2], 36);
    return Number.isFinite(issuedAt) ? { id: m[1], issuedAt } : null;
  }

  /**
   * A hello (net.js → Lobby.identify): bind the browser id to the session and log it. Returns the id to send back in
   * `welcome.bid` (the one the page sent when it is valid).
   * @param {any} session
   * @param {{ bid?: unknown, key?: string|null, repeat?: boolean }} info
   */
  identify(session, { bid, key = null, repeat = false } = {}) {
    let v = this.verify(bid);
    let out = typeof bid === 'string' ? bid : null;
    if (!v) { out = this.issue(); v = this.verify(out); }
    const changed = session.browserId !== v.id || session.loggedName !== session.name || session.loggedKey !== key;
    session.browserId = v.id;
    session.bidIssuedAt = v.issuedAt;
    if (!repeat || changed) {
      this.log.info(`[id] ${session.playerId} b=${v.id} net=${key || 'local'} ${JSON.stringify(session.name)}`);
      session.loggedName = session.name;
      session.loggedKey = key;
    }
    this.seen(session, key);
    this.countId(key, v.id);
    return out;
  }

  // ---- shared addresses -----------------------------------------------------------------------------

  /** Count a browser id on an IPv4 key (header 「Shared addresses」). */
  countId(key, id) {
    if (!key || !isV4(key)) return;
    const now = this.now();
    if (now - this.lastSweep >= SWEEP_MS) this.sweep(now);
    let ids = this.netIds.get(key);
    if (!ids) this.netIds.set(key, (ids = new Map()));
    ids.set(id, now);
    if (!this.sharedLogged.has(key)) {
      const n = this.idCount(key, now);
      if (n > SHARED_IDS) {
        this.sharedLogged.add(key);
        this.log.info(`[mod] shared net=${key}: ${n} browser ids in 24 h (more than ${SHARED_IDS})`);
      }
    }
  }

  /** Browser ids seen on a key in the last NET_TTL_MS, banned ones left out. */
  idCount(key, now = this.now()) {
    let n = 0;
    for (const [id, t] of this.netIds.get(key) || []) if (now - t < NET_TTL_MS && !this.banOf(id)) n++;
    return n;
  }

  /** Drop counts past NET_TTL_MS. */
  sweep(now = this.now()) {
    this.lastSweep = now;
    for (const [key, ids] of this.netIds) {
      for (const [id, t] of ids) if (now - t >= NET_TTL_MS) ids.delete(id);
      if (!ids.size) this.netIds.delete(key);
      if (this.sharedLogged.has(key) && this.idCount(key, now) <= SHARED_IDS) this.sharedLogged.delete(key);
    }
  }

  /** Why a network key is a shared address: 'mobile' (MOBILE_V4), 'list' (the ban file), 'count' (SHARED_IDS) or null. */
  sharedOf(key) {
    if (!key || !isV4(key)) return null;
    const ip = v4Int(key);
    if (MOBILE_RANGES.some((r) => inRange(ip, r))) return 'mobile';
    if (this.shared.some((r) => inRange(ip, r))) return 'list';
    return this.idCount(key) > SHARED_IDS ? 'count' : null;
  }

  // ---- bans -----------------------------------------------------------------------------------------

  /** The active ban of a browser id, or null. */
  banOf(id) {
    if (!id) return null;
    const now = this.now();
    return this.bans.find((b) => b.id === id && !(Number.isFinite(b.until) && b.until <= now)) || null;
  }

  /**
   * Whether this session's chat is shadowed: 'ban' (its browser is banned), 'net' (a browser id issued after a ban, on
   * the banned browser's network within NET_TTL_MS; header) or null.
   * @param {any} session
   */
  chatMute(session) {
    if (!session?.browserId) return null;
    if (this.banOf(session.browserId)) { this.seen(session, session.limitKey); return 'ban'; }
    const key = session.limitKey;
    if (!key || this.allow.has(session.browserId)) return null;
    const now = this.now();
    for (const b of this.bans) {
      if (Number.isFinite(b.until) && b.until <= now) continue;
      const last = b.nets[key];
      if (Number.isFinite(last) && now - last < NET_TTL_MS && session.bidIssuedAt > b.at) {
        const shared = this.sharedOf(key);
        if (shared) {
          if (session.netSharedLogged !== b.id) {
            session.netSharedLogged = b.id;
            this.log.info(`[mod] shared net=${key} (${shared}): no follow-up for ${session.playerId} b=${session.browserId} (banned b=${b.id})`);
          }
          continue;
        }
        if (session.netMuteLogged !== b.id) {
          session.netMuteLogged = b.id;
          this.log.info(`[mod] net mute ${session.playerId} b=${session.browserId} net=${key} (banned b=${b.id})`);
        }
        this.touch(b, key, now);
        return 'net';
      }
    }
    return null;
  }

  /** A banned browser seen on a network key: remember the key (header 「Network follow-up」). */
  seen(session, key) {
    const b = key ? this.banOf(session.browserId) : null;
    if (b) this.touch(b, key, this.now());
  }

  touch(ban, key, now) {
    const last = ban.nets[key];
    ban.nets[key] = now;
    if (!Number.isFinite(last)) this.log.info(`[mod] banned b=${ban.id} seen on net=${key}`);
    if (!Number.isFinite(last) || now - last >= NET_WRITE_GAP_MS) this.writeNets(ban.id, key, now);
  }

  /** Reload the ban file when it changed (missing = no bans). */
  reload() {
    if (!this.dir) return;
    const file = path.join(this.dir, BAN_FILE);
    let st;
    try { st = fs.statSync(file); } catch (e) {
      if (e?.code !== 'ENOENT') this.log.warn(`[mod] ${file}: ${e?.message || e}`);
      if (this.mtime !== 0) { this.bans = []; this.allow = new Set(); this.shared = []; this.mtime = 0; }
      return;
    }
    if (st.mtimeMs === this.mtime) return;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
      this.log.warn(`[mod] ${file} unreadable, keeping the previous bans: ${e?.message || e}`);
      this.mtime = st.mtimeMs;
      return;
    }
    const prev = this.bans.length;
    this.bans = parseBans(doc);
    this.allow = new Set((Array.isArray(doc?.allow) ? doc.allow : []).filter((x) => typeof x === 'string' && ID_RE.test(x)));
    const shared = Array.isArray(doc?.shared) ? doc.shared : [];
    this.shared = shared.map(parseCidr).filter(Boolean);
    if (this.shared.length < shared.length) this.log.warn(`[mod] ${file}: ${shared.length - this.shared.length} \`shared\` value(s) not an IPv4 CIDR, ignored`);
    this.mtime = st.mtimeMs;
    if (prev !== this.bans.length || this.bans.length || this.shared.length) this.log.info(`[mod] ${this.bans.length} chat ban(s), ${this.allow.size} allowed, ${this.shared.length} shared range(s) listed`);
  }

  /** Write one network sighting back into the ban file (read, merge, write whole, rename). */
  writeNets(id, key, at) {
    if (!this.dir) return;
    const file = path.join(this.dir, BAN_FILE);
    try {
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
      const ban = Array.isArray(doc?.bans) ? doc.bans.find((b) => b && b.id === id) : null;
      if (!ban) return;
      ban.nets = { ...(ban.nets && typeof ban.nets === 'object' ? ban.nets : null), [key]: at };
      // drop sightings past the TTL so the file stays small
      for (const [k, t] of Object.entries(ban.nets)) if (!Number.isFinite(t) || at - t >= NET_TTL_MS) delete ban.nets[k];
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', { mode: 0o640 });
      fs.renameSync(tmp, file);
      this.mtime = fs.statSync(file).mtimeMs;
    } catch (e) {
      this.log.warn(`[mod] could not record net=${key} for b=${id}: ${e?.message || e}`);
    }
  }

  // ---- chat log -------------------------------------------------------------------------------------

  /** One [room] line (header): who entered which room, from which network (maintainer decision 2026-11-18). */
  logRoom(room, session, event) {
    this.log.info(`[room] ${room.code} ${session.playerId} b=${session.browserId || '-'} net=${session.limitKey || 'local'} ${event} ${JSON.stringify(session.name)}`);
  }

  /** One [chat] line (header). */
  logChat(room, session, { text, spectator = false, mute = null }) {
    const tags = `${spectator ? ' (spectator)' : ''}${mute ? ` (muted:${mute})` : ''}`;
    this.log.info(`[chat] ${room.code} ${session.playerId} b=${session.browserId || '-'} ${JSON.stringify(session.name)}${tags}: ${JSON.stringify(text)}`);
  }
}

/** @param {any} doc the ban file */
export function parseBans(doc) {
  const out = [];
  for (const b of Array.isArray(doc?.bans) ? doc.bans : []) {
    if (!b || typeof b.id !== 'string' || !ID_RE.test(b.id)) continue;
    const nets = {};
    if (b.nets && typeof b.nets === 'object') for (const [k, t] of Object.entries(b.nets)) if (Number.isFinite(t)) nets[k] = t;
    out.push({ id: b.id, at: Number.isFinite(b.at) ? b.at : 0, reason: typeof b.reason === 'string' ? b.reason : undefined, until: Number.isFinite(b.until) ? b.until : undefined, nets });
  }
  return out;
}

/** The id key: <dir>/.key (32 random bytes, made on first use, mode 0600; both deploy slots share the folder). */
function loadKey(dir) {
  const file = path.join(dir, '.key');
  try { return fs.readFileSync(file); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
  const key = crypto.randomBytes(32);
  try { fs.writeFileSync(file, key, { mode: 0o600, flag: 'wx' }); } catch (e) {
    if (e?.code === 'EEXIST') return fs.readFileSync(file); // the other slot made it meanwhile
    throw e;
  }
  return key;
}
