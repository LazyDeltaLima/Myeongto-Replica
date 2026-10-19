// server/match/match/messaging.js — Match methods: messaging — unicast, broadcast, toasts, the ticker lines
// (config.broadcasts by type; the remake's CUSTOM lines), the dirty marks and flush: m.private per player only when it
// changed (plus the prep scouts of that player's board), m.public throttled (DELAYS.PUBLIC_THROTTLE) and deduplicated.
// i18n (docs/I18N.md): a toast / CUSTOM line is a string (its own msgid) or a shared/i18n.js msg(msgid, params); the frame
// carries `text` (the Chinese rendering, what older clients show) plus `msgid` / `params`; a broadcast line carries its
// `args` so the client can fill the localized config.broadcasts template.
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { DELAYS } from './common.js';
import { wireMessage } from '../../../shared/i18n.js';

/** m.public fields every delta carries (the rest only when changed; _publicDelta) */
const ALWAYS = new Set(['t', 'serverNow', 'players']);

/**
 * The fields of `obj` whose JSON (`now`) differs from `before`, and `$rm`: those `before` had and `now` lacks.
 * @param {Record<string, any>} obj @param {Map<string, string>} now @param {Map<string, string>} before
 */
function changedOf(obj, now, before) {
  const out = {};
  for (const [k, j] of now) if (before.get(k) !== j) out[k] = obj[k];
  const rm = [...before.keys()].filter((k) => !now.has(k));
  if (rm.length) out.$rm = rm;
  return out;
}

export class MatchMessaging {
  sendTo(playerId, msg) {
    if (this.disposed) return false;
    const ps = this.players.get(playerId) || this.spectators.get(playerId);
    if (!ps || ps.isBot || ps.left) return false;
    try { return !!this.sendFn(playerId, msg); } catch (e) { this.reportError('send', e); return false; }
  }

  broadcast(msg) {
    if (this.disposed) return;
    try { this.broadcastFn(msg); } catch (e) { this.reportError('broadcast', e); }
  }

  /** @param {string|{ msgid: string, params?: object }} text a string or msg() (shared/i18n.js) */
  toast(ps, kind, text) {
    if (!ps || ps.isBot || ps.left || !ps.connected) return;
    this.sendTo(ps.playerId, { t: 'm.toast', kind, ...wireMessage(text) });
  }

  /**
   * Broadcast ticker from config.broadcasts by type; `param` picks the variant (SHOP_LEVEL level, BOSS_HIT share…).
   * `own` (a msg()): the remake's own text in place of the broadcast's, keeping its type and priority (no `id`, so the
   * client translates the msgid — the 8-player BOSS_HIT lines name their scaled share).
   */
  tickerFor(type, args = [], { playerId = null, to = null, param = null, own = null } = {}) {
    const list = Array.isArray(this.gd.config.broadcasts) ? this.gd.config.broadcasts.filter((b) => b && b.type === type) : [];
    let b = list[0];
    if (param != null) b = list.find((x) => Array.isArray(x.params) && x.params.includes(String(param))) || b;
    const tpl = b && typeof b.text === 'string' ? b.text : null;
    if (!tpl) return;
    const text = tpl.replace(/\{(\d)\}/g, (_, i) => (args[Number(i)] != null ? String(args[Number(i)]) : ''));
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
   */
  tickerText(text, priority = 0) {
    if (!text) return;
    const w = wireMessage(text);
    this.broadcast({ t: 'm.ticker', ...w, text: w.text.slice(0, 200), id: null, type: 'CUSTOM', priority: Number(priority) || 0, playerId: null });
  }

  markPublic() { this._pubDirty = true; }
  /**
   * A player's state changed: its m.private and (throttled, deduplicated) m.public (level, board, bonds…) — in a boss
   * round's prep also its pair partner's m.private, which shows this board on its other half (bossMate, item 51).
   */
  markPrivate(ps) {
    if (!ps) return;
    this._privDirty.add(ps);
    this._pubDirty = true;
    const m = this._bossMateOf(ps);
    if (m) this._privDirty.add(m.mate);
  }

  /** Send pending m.private (per player, only when changed) and m.public (throttled ≤ 10/s). */
  flush(forcePublic = false) {
    if (this.disposed) return;
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

  _sendPrivate(ps, force) {
    let view;
    try { view = ps.privateView(); } catch (e) { this.reportError('privateView', e); return; }
    const json = JSON.stringify(view);
    if (!force && json === ps._lastPriv) return;
    ps._lastPriv = json;
    this.sendTo(ps.playerId, view);
  }

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
   * `playerId`, its changed fields and its own `$rm`. Most of a broadcast repeated the previous one (an 8-player match:
   * the bonds alone 62 % of the bytes; the match's settings every time). Every viewer that missed a broadcast gets a
   * whole m.public on its way back (platform.js _resync, after which the next broadcast is whole too; only b.snap frames
   * are ever skipped under backpressure, server/net.js); the match's final broadcast is whole as well — the lobby keeps
   * it for the result replay.
   */
  _publicDelta(view) {
    const top = new Map(Object.entries(view).filter(([k]) => !ALWAYS.has(k)).map(([k, v]) => [k, JSON.stringify(v)]));
    const beforeTop = this._pubTopSent;
    const sent = (this._pubRowsSent ||= new Map()); // playerId → Map(field → JSON) of the last broadcast
    const whole = this.ended || !beforeTop;
    this._pubTopSent = top;
    const players = view.players.map((p) => {
      const before = sent.get(p.playerId);
      const now = new Map(Object.entries(p).map(([k, v]) => [k, JSON.stringify(v)]));
      sent.set(p.playerId, now);
      if (whole || !before) return p;
      return { playerId: p.playerId, ...changedOf(p, now, before) };
    });
    if (whole) return view;
    return { t: view.t, serverNow: view.serverNow, delta: true, ...changedOf(view, top, beforeTop), players };
  }

  /** The next broadcast is whole (a viewer just got a whole m.public: a delta would be against an older state). */
  _publicWholeNext() {
    this._pubTopSent = null;
    this._pubRowsSent?.clear();
  }
}
