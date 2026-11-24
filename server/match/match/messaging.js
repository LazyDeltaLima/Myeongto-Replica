// server/match/match/messaging.js — Match methods: messaging — unicast, broadcast, toasts, the ticker lines
// (config.broadcasts by type; the remake's CUSTOM lines), the dirty marks and flush: m.private per player only when it
// changed (plus the prep scouts of that player's board), m.public throttled (DELAYS.PUBLIC_THROTTLE) and deduplicated.
// i18n (docs/I18N.md): a toast / CUSTOM line is a string (its own msgid) or a shared/i18n.js msg(msgid, params); the frame
// carries `text` (the Chinese rendering, what older clients show) plus `msgid` / `params`; a broadcast line carries its
// `args` so the client can fill the localized config.broadcasts template.
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

/** @import { Match, SpectatorSeat } from '../Match.js' */
/** @import { PlayerState } from '../PlayerState.js' */
/** @import { MatchMsg } from '../../lobby.js' */
import { DELAYS } from './common.js';
import { wireMessage } from '../../../shared/i18n.js';
import { PUBLIC_LIST_KEYS } from '../../../shared/protocol.js';

/** The m.public frame (MatchViews.publicView) and its deltas. @typedef {{ t: string, players: Record<string, any>[], [key: string]: any }} PublicFrame */

/** m.public fields every delta carries (the rest only when changed; _publicDelta) */
const ALWAYS = new Set(['t', 'serverNow', 'players']);

/**
 * A line of config.broadcasts (the official ticker templates): its type, the `params` variants, the text with {0}…
 * @typedef {{ type?: string, text?: unknown, params?: unknown[], priority?: unknown, id?: string }} BroadcastLine
 */

const isPlain = (/** @type {unknown} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * What _publicDelta remembers of a field sent: its JSON and, `depth` levels down, an object's fields (`sub`) or a
 * PUBLIC_LIST_KEYS list's entries by key (`items`; only when every entry has its own key).
 * @typedef {{ json: string, sub?: Map<string, Entry>, items?: Map<any, string> }} Entry
 * @param {string} k @param {unknown} v @param {number} depth
 * @returns {Entry}
 */
function entryOf(k, v, depth) {
  /** @type {Entry} */
  const e = { json: JSON.stringify(v) };
  if (depth <= 0) return e;
  const key = PUBLIC_LIST_KEYS[k];
  if (key && Array.isArray(v)) {
    const items = new Map(v.map((x) => [isPlain(x) ? x[key] : undefined, JSON.stringify(x)]));
    if (items.size === v.length && !items.has(undefined)) e.items = items;
  } else if (isPlain(v)) {
    e.sub = entriesOf(/** @type {Record<string, any>} */ (v), depth - 1);
  }
  return e;
}

/** @param {Record<string, any>} obj @param {number} depth @param {Set<string>} [skip] @returns {Map<string, Entry>} */
function entriesOf(obj, depth, skip) {
  const out = new Map();
  for (const [k, v] of Object.entries(obj)) if (!skip?.has(k)) out.set(k, entryOf(k, v, depth));
  return out;
}

/**
 * The fields of `obj` whose JSON (`now`) differs from `before`, each whole or as its own delta when that is shorter
 * (fieldDelta), and `$rm`: those `before` had and `now` lacks.
 * @param {Record<string, any>} obj @param {Map<string, Entry>} now @param {Map<string, Entry>} before
 * @returns {Record<string, any>}
 */
function changedOf(obj, now, before) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, e] of now) {
    const b = before.get(k);
    if (b?.json !== e.json) out[k] = b ? fieldDelta(k, obj[k], e, b) : obj[k];
  }
  const rm = [...before.keys()].filter((k) => !now.has(k));
  if (rm.length) out.$rm = rm;
  return out;
}

/**
 * A changed field: a list's unchanged entries by key (`{ $list }`), an object's changed fields (`{ $d: 1 }`) or whole.
 * @param {string} k @param {unknown} v @param {Entry} e @param {Entry} b
 */
function fieldDelta(k, v, e, b) {
  /** @type {Record<string, any> | null} */
  let d = null;
  if (e.items && b.items) {
    const key = PUBLIC_LIST_KEYS[k];
    // `items` is set only for a list (entryOf)
    d = { $list: /** @type {any[]} */ (v).map((x) => (/** @type {Map<any, string>} */ (b.items).get(x[key]) === /** @type {Map<any, string>} */ (e.items).get(x[key]) ? x[key] : x)) };
  } else if (e.sub && b.sub) {
    d = { $d: 1, ...changedOf(/** @type {Record<string, any>} */ (v), e.sub, b.sub) };
  }
  return d && JSON.stringify(d).length < e.json.length ? d : v;
}

export class MatchMessaging {
  /** @param {string} playerId @param {MatchMsg} msg @this {Match} */
  sendTo(playerId, msg) {
    if (this.disposed) return false;
    const ps = this.players.get(playerId) || this.spectators.get(playerId);
    if (!ps || ps.isBot || ps.left) return false;
    try { return !!this.sendFn(playerId, msg); } catch (e) { this.reportError('send', e); return false; }
  }

  /** @param {MatchMsg} msg @this {Match} */
  broadcast(msg) {
    if (this.disposed) return;
    try { this.broadcastFn(msg); } catch (e) { this.reportError('broadcast', e); }
  }

  /**
   * @param {PlayerState | SpectatorSeat | null | undefined} ps @param {string} kind
   * @param {string|{ msgid: string, params?: object }} text a string or msg() (shared/i18n.js)
   * @this {Match}
   */
  toast(ps, kind, text) {
    if (!ps || ps.isBot || ps.left || !ps.connected) return;
    this.sendTo(ps.playerId, { t: 'm.toast', kind, ...wireMessage(text) });
  }

  /**
   * Broadcast ticker from config.broadcasts by type; `param` picks the variant (SHOP_LEVEL level, BOSS_HIT share…).
   * `own` (a msg()): the remake's own text in place of the broadcast's, keeping its type and priority (no `id`, so the
   * client translates the msgid — the 8-player BOSS_HIT lines name their scaled share).
   * @param {string} type @param {unknown[]} [args]
   * @param {{ playerId?: string | null, to?: string | null, param?: string | null, own?: unknown }} [opts]
   * @this {Match}
   */
  tickerFor(type, args = [], { playerId = null, to = null, param = null, own = null } = {}) {
    const list = Array.isArray(this.gd.config.broadcasts) ? this.gd.config.broadcasts.filter((/** @type {BroadcastLine} */ b) => b && b.type === type) : [];
    let b = list[0];
    if (param != null) b = list.find((/** @type {BroadcastLine} */ x) => Array.isArray(x.params) && x.params.includes(String(param))) || b;
    const tpl = b && typeof b.text === 'string' ? b.text : null;
    if (!tpl) return;
    const text = tpl.replace(/\{(\d)\}/g, (/** @type {string} */ _, /** @type {string} */ i) => (args[Number(i)] != null ? String(args[Number(i)]) : ''));
    const w = own ? wireMessage(own) : null;
    const msg = w
      ? { t: 'm.ticker', ...w, text: w.text.slice(0, 200), id: null, type, priority: Number(b.priority) || 0, playerId, args: args.map((a) => String(a ?? '')) }
      : { t: 'm.ticker', text, id: b.id, type, priority: Number(b.priority) || 0, playerId, args: args.map((a) => String(a ?? '')) };
    if (to) this.sendTo(to, msg);
    else this.broadcast(msg);
  }

  /**
   * A ticker line of the remake's own (type CUSTOM). `priority`: the match-flow notices (隐秘核心已解锁, 联防阶段, a player out
   * or gone) take FLOW_TICKER_PRIORITY so the strip does not hold them behind shop-level lines; other lines 0.
   * @param {unknown} text a string or msg() (shared/i18n.js) @param {number} [priority]
   * @this {Match}
   */
  tickerText(text, priority = 0) {
    if (!text) return;
    const w = wireMessage(text);
    this.broadcast({ t: 'm.ticker', ...w, text: w.text.slice(0, 200), id: null, type: 'CUSTOM', priority: Number(priority) || 0, playerId: null });
  }

  /** @this {Match} */
  markPublic() { this._pubDirty = true; }
  /**
   * A player's state changed: its m.private and (throttled, deduplicated) m.public (level, board, bonds…) — in a boss
   * round's prep also its pair partner's m.private, which shows this board on its other half (bossMate, item 51).
   * @param {PlayerState | null | undefined} ps
   * @this {Match}
   */
  markPrivate(ps) {
    if (!ps) return;
    this._privDirty.add(ps);
    this._pubDirty = true;
    const m = this._bossMateOf(ps);
    if (m) this._privDirty.add(m.mate);
  }

  /**
   * Send pending m.private (per player, only when changed) and m.public (throttled ≤ 10/s).
   * @this {Match}
   */
  flush(forcePublic = false) {
    if (this.disposed) return;
    this.reconcileSurrenderVotes();
    if (this._privDirty.size) {
      const list = [...this._privDirty];
      this._privDirty.clear();
      for (const ps of list) {
        if (!(ps.isBot || ps.left || !ps.connected)) this._sendPrivate(ps, false);
        this._notifyPrepScouts(ps);
      }
    }
    if (this._pubDirty || forcePublic) this._maybeSendPublic(forcePublic);
  }

  /** @param {PlayerState} ps @param {boolean} force @this {Match} */
  _sendPrivate(ps, force) {
    let view;
    try { view = ps.privateView(); } catch (e) { this.reportError('privateView', e); return; }
    const json = JSON.stringify(view);
    if (!force && json === ps._lastPriv) return;
    ps._lastPriv = json;
    this.sendTo(ps.playerId, view);
  }

  /** @param {boolean} force @this {Match} */
  _maybeSendPublic(force) {
    const now = this.sched.now();
    if (!force && now - this._lastPubAt < DELAYS.PUBLIC_THROTTLE) {
      if (!this._pubTimer) {
        const wait = Math.max(1, DELAYS.PUBLIC_THROTTLE - (now - this._lastPubAt));
        this._pubTimer = this.sched.setTimeout(() => {
          this._pubTimer = null;
          if (this.disposed) return;
          try { this._maybeSendPublic(false); } catch (e) { this.reportError('public', e); }
        }, wait);
      }
      return;
    }
    this._pubDirty = false;
    let view;
    try { view = this.publicView(); } catch (e) { this.reportError('publicView', e); return; }
    const { serverNow, ...rest } = view;
    const json = JSON.stringify(rest);
    if (!force && json === this._lastPubJson) return;
    this._lastPubJson = json;
    // Snapshot building / serialization can take time; throttle from the actual broadcast, not its start.
    this._lastPubAt = this.sched.now();
    this.broadcast(this._publicDelta(view));
  }

  /**
   * The broadcast form of m.public: after the match's first broadcast it is a delta (`delta: true`; the client merges:
   * shared/protocol.js mergePublic) — the top-level fields that changed since the previous broadcast (`t`, `serverNow`
   * and `players` always), `$rm` naming those that went away (draft, sp, teamLp…), and in players[] each row's
   * `playerId`, its changed fields and its own `$rm`. A changed field goes whole or, when shorter, as a delta of its
   * own (fieldDelta): a row's bonds, the fields and the 机变 cards name their unchanged entries by key (`{ $list }`), an
   * object (the 机变 draft, the strategy draft) sends its changed fields (`{ $d: 1 }`). Most of a broadcast repeated the
   * previous one (an 8-player match: the bonds alone 62 % of the bytes, then a player's whole bond list for one bond
   * that moved and the twelve 机变 cards for every pick; the match's settings every time). Every viewer that missed a broadcast gets a
   * whole m.public on its way back (platform.js _resync, after which the next broadcast is whole too; only b.snap frames
   * are ever skipped under backpressure, server/net.js); the match's final broadcast is whole as well — the lobby keeps
   * it for the result replay.
   * @param {PublicFrame} view the m.public frame (publicView)
   * @returns {PublicFrame}
   * @this {Match}
   */
  _publicDelta(view) {
    const top = entriesOf(view, 2, ALWAYS);
    const beforeTop = this._pubTopSent;
    const sent = (this._pubRowsSent ||= new Map()); // playerId → the row's entriesOf at the last broadcast
    const whole = this.ended || !beforeTop;
    this._pubTopSent = top;
    const players = view.players.map((p) => {
      const before = sent.get(p.playerId);
      const now = entriesOf(p, 1);
      sent.set(p.playerId, now);
      if (whole || !before) return p;
      return { playerId: p.playerId, ...changedOf(p, now, before) };
    });
    if (whole) return view;
    return { t: view.t, serverNow: view.serverNow, delta: true, ...changedOf(view, top, beforeTop), players };
  }

  /**
   * The next broadcast is whole (a viewer just got a whole m.public: a delta would be against an older state).
   * @this {Match}
   */
  _publicWholeNext() {
    this._pubTopSent = null;
    this._pubRowsSent?.clear();
  }
}
