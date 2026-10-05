// Room chat (local patch): one text channel per co-op room (solo rooms have none), open in the room screen and
// during the match.
//
// Wire (server/local-patch.js chat): room.chat { text } → the room gets room.chat { seq, playerId, name, text, at }; a player
// who joins or resyncs gets room.chatlog { lines } (the last CHAT_HISTORY lines). Nothing outlives the room.
//
//   installChat()  net → store.chat { code, lines, seen }: lines of the current room only (cleared when the room
//                  changes), each stamped with its local receipt time `rx` (0 for history lines, which never pop up as
//                  new). `seen` is the last seq the player has read: kept in the store, not in a panel, so the unread
//                  badge and the floating feed survive the screen / match-phase switches that remount the panels;
//                  history lines a player gets on joining or resyncing count as read.
//   FactionPicker  the chat faction (server/local-patch.js, room.factions → store.chatFactions): a colored tag on the
//                  player's lines and avatar until the match ends; picking one announces it as a `kind: 'faction'` line
//   RoomChat       the room screen's panel: log + input, folds to a button (unread count while folded)
//   GameChat       the match: a 聊天 button beside 交流 (unread badge) + panel above it; while it is closed, new lines
//                  of the others float above the corner for a few seconds. Enter opens it, Esc closes it.
// Player text is never translated (data-i18n-skip) and only ever rendered as text.
// Styles: public/css/chat.css.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { CHAT_MAX_LEN, CHAT_COOLDOWN_MS, CHAT_FACTIONS, chatFaction } from '../../../shared/local.js';
import { html } from './components.js';
import { net } from '../net.js';
import { store, useStore, loadPref, savePref } from '../store.js';
import { tr } from '../i18n/i18n.js';
import { FactionIcon, factionIconUrl } from './faction.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const KEEP = 60;            // lines kept on the client
export const FEED_MS = 6000; // a new line floats this long over the match while the panel is closed
const FEED_MAX = 3;
const PREF_ROOM_OPEN = 'chatRoomOpen';

// chat bubble / paper plane (24×24, original)
const CHAT_D = 'M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 5v2h10V8zm0 4v2h7v-2z';
const SEND_D = 'M2 21 23 12 2 3v7l15 2-15 2z';
const Glyph = ({ d }) => html`<svg class="icon" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false"><path d=${d} fill-rule="evenodd" /></svg>`;

/**
 * Merge received lines into the kept ones: by seq, oldest first, at most `keep`.
 * @param {any[]} cur
 * @param {any[]} incoming
 * @param {number} [keep]
 */
export function mergeLines(cur, incoming, keep = KEEP) {
  const bySeq = new Map(cur.map((l) => [l.seq, l]));
  for (const l of incoming) {
    if (!l || !Number.isInteger(l.seq) || typeof l.text !== 'string') continue;
    bySeq.set(l.seq, { ...bySeq.get(l.seq), ...l });
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-keep);
}

/**
 * Lines that float over the match: the others' lines received in the last FEED_MS and newer than `seenSeq`.
 * @param {any[]} lines
 * @param {{ myId: any, seenSeq: number, now: number }} o
 */
export function feedLines(lines, { myId, seenSeq, now }) {
  return lines.filter((l) => l.seq > seenSeq && l.playerId !== myId && l.rx > 0 && now - l.rx < FEED_MS).slice(-FEED_MAX);
}

/**
 * Read mark after a history batch (join / resync): the lines the player had not received yet count as read, so a
 * folded chat never shows old conversation as unread.
 * @param {any[]} known lines already kept
 * @param {any[]} history
 * @param {number} seen
 */
export function historySeen(known, history, seen) {
  const have = new Set(known.map((l) => l.seq));
  let out = seen;
  for (const l of history) if (l && Number.isInteger(l.seq) && !have.has(l.seq)) out = Math.max(out, l.seq);
  return out;
}

/** Others' lines newer than `seenSeq`. */
export const unreadCount = (lines, myId, seenSeq) => lines.filter((l) => l.seq > seenSeq && l.playerId !== myId).length;

/** Wire the chat into the app store (main.js, once). */
export function installChat() {
  const roomCode = () => store.get().room?.code ?? null;
  const put = (incoming, rx) => {
    const code = roomCode();
    if (!code) return;
    const cur = store.get().chat;
    const same = cur && cur.code === code;
    const base = same ? cur.lines : [];
    const seen = rx ? (same ? cur.seen || 0 : 0) : historySeen(base, incoming, same ? cur.seen || 0 : 0);
    store.set({ chat: { code, lines: mergeLines(base, incoming.map((l) => ({ ...l, rx: rx ? Date.now() : 0 }))), seen } });
  };
  net.on('room.chat', (m) => put([m], true));
  net.on('room.chatlog', (m) => put(Array.isArray(m.lines) ? m.lines : [], false));
  // room.factions { factions: { [playerId]: factionId } } (server/local-patch.js) → store.chatFactions
  net.on('room.factions', (m) => { if (roomCode()) store.set({ chatFactions: m.factions && typeof m.factions === 'object' ? { ...m.factions } : {} }); });
  store.subscribe((s) => {
    const code = s.room?.code ?? null;
    if ((s.chat?.code ?? null) !== code) store.set({ chat: { code, lines: [], seen: 0 }, chatFactions: {} });
  });
}

/** Mark the room's lines up to `seq` as read. */
function markRead(seq) {
  const cur = store.get().chat;
  if (cur && seq > (cur.seen || 0)) store.set({ chat: { ...cur, seen: seq } });
}

/** A line's faction tag `(炎国)` in its color, or nothing. */
function FactionTag({ id }) {
  const f = chatFaction(id);
  return f ? html`<span class="chat__faction" style=${`color:${f.color}`}>(${tr(f.name)})</span>` : null;
}

/** One chat line: `name(faction): text`, or the announcement of a faction pick. */
function Line({ l, myId, cls = '', style = '' }) {
  if (l.kind === 'faction') {
    const f = chatFaction(l.faction);
    return html`<li class=${cx('chat__line chat__line--sys', cls)} style=${style} data-i18n-skip="">
      <b class="chat__name">${l.name}</b><span class="chat__text">${tr('选择了阵营')} <b style=${f ? `color:${f.color}` : ''}>${f ? tr(f.name) : '?'}</b></span>
    </li>`;
  }
  return html`<li class=${cx('chat__line', l.playerId === myId && 'is-me', cls)} style=${style} data-i18n-skip="">
    <b class="chat__name">${l.name}${l.spectator ? html`<span class="chat__spec">(${tr('观战')})</span>` : null}<${FactionTag} id=${l.faction} /></b><span class="chat__text">${l.text}</span>
  </li>`;
}

/** Send one line; resolves to an error text for the input (null when sent). */
async function sendLine(text) {
  try {
    await net.request('room.chat', { text });
    return null;
  } catch (err) {
    return err?.code === 'RATE' ? '发送过快，请稍候' : err?.code === 'BAD_MSG' ? '无法发送空消息' : '发送失败';
  }
}

/** The scrolling log; keeps the newest line in view unless the reader scrolled up. */
function ChatLog({ lines, myId }) {
  const ref = useRef(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines.length ? lines[lines.length - 1].seq : 0]);
  const onScroll = () => {
    const el = ref.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
  return html`<ol class="chat__log" ref=${ref} onScroll=${onScroll} aria-live="polite">
    ${lines.length ? lines.map((l) => html`<${Line} key=${l.seq} l=${l} myId=${myId} />`) : html`<li class="chat__empty">暂无消息</li>`}
  </ol>`;
}

/** The player's chat faction (room.state seat) and the picker: a chip left of the input (the faction's icon once
 *  picked, so the input keeps its width), the 8 factions with icon and name above it. */
function FactionPicker({ disabled }) {
  const seated = useStore((s) => (s.room?.seats || []).some((x) => x && x.playerId === s.me.playerId));
  const mine = useStore((s) => s.chatFactions?.[s.me.playerId] ?? null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const f = chatFaction(mine);
  const pick = async (id) => {
    setOpen(false);
    if (id === mine || busy) return;
    setBusy(true);
    try { await net.request('room.chatFaction', { faction: id }); } catch { /* cooldown / offline: the chip stays */ }
    setBusy(false);
  };
  if (!seated) return null; // spectators have no faction
  return html`<div class="chat__fac">
    <button type="button" class=${cx('chat__facbtn', f && 'is-set')} style=${f ? `--fac:${f.color}` : ''} disabled=${disabled || busy}
      aria-expanded=${open ? 'true' : 'false'} title="选择阵营" onClick=${() => setOpen(!open)}>${f ? (factionIconUrl(f) ? html`<${FactionIcon} f=${f} />` : f.name) : '阵营'}</button>
    ${open ? html`<div class="chat__facs" role="group" aria-label="选择阵营">
      ${CHAT_FACTIONS.map((x) => html`<button key=${x.id} type="button" class=${cx(x.id === mine && 'is-on')} style=${`--fac:${x.color}`}
        aria-pressed=${x.id === mine ? 'true' : 'false'} onClick=${() => pick(x.id)}><${FactionIcon} f=${x} /><span>${x.name}</span></button>`)}
    </div>` : null}
  </div>`;
}

/** Input + send. `autoFocus` focuses it on mount; Esc calls onEscape. */
function ChatInput({ disabled, inputRef, autoFocus = false, onEscape }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const sentAt = useRef(-Infinity);
  const own = useRef(null);
  const ref = inputRef || own;
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, []);
  useEffect(() => {
    if (!err) return undefined;
    const t = setTimeout(() => setErr(null), 2500);
    return () => clearTimeout(t);
  }, [err]);
  const submit = async (e) => {
    e.preventDefault();
    const line = text.trim();
    if (!line || busy || disabled) return;
    if (Date.now() - sentAt.current < CHAT_COOLDOWN_MS) { setErr('发送过快，请稍候'); return; }
    sentAt.current = Date.now();
    setBusy(true);
    const fail = await sendLine(line);
    setBusy(false);
    if (fail) setErr(fail);
    else setText('');
    ref.current?.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ref.current?.blur(); onEscape?.(); }
  };
  return html`<form class="chat__form" onSubmit=${submit}>
    <${FactionPicker} disabled=${disabled} />
    <input ref=${ref} class="chat__input" type="text" value=${text} maxlength=${CHAT_MAX_LEN} enterkeyhint="send" autocomplete="off"
      placeholder=${disabled ? '连接中断' : touchUi() ? '输入消息' : '输入消息，Enter 发送'} aria-label="聊天消息" disabled=${disabled}
      onInput=${(e) => setText(e.currentTarget.value)} onKeyDown=${onKey} data-i18n-skip="" />
    <button type="submit" class="chat__send" disabled=${disabled || busy || !text.trim()} aria-label="发送" title="发送"><${Glyph} d=${SEND_D} /></button>
    ${err ? html`<span class="chat__err" role="status">${err}</span>` : null}
  </form>`;
}

/** Touch-first device (ui/device.js puts sp-coarse on <html>): no Enter hint in the placeholder. */
const touchUi = () => !!globalThis.document?.documentElement?.classList.contains('sp-coarse');

/** Whether a key press should open / focus the chat: a plain Enter outside fields and dialogs. */
export function isChatHotkey(e, doc = globalThis.document) {
  if (!e || e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return false;
  const t = e.target;
  const tag = t && typeof t.tagName === 'string' ? t.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || t?.isContentEditable) return false;
  return !doc?.querySelector?.('.modal, .guide');
}

const useChat = () => {
  const chat = useStore((s) => s.chat);
  const myId = useStore((s) => s.me.playerId);
  const online = useStore((s) => s.connection.status === 'online');
  return { lines: chat?.lines || [], seen: chat?.seen || 0, myId, online };
};

/** Room screen chat panel (co-op rooms). */
export function RoomChat() {
  const { lines, seen, myId, online } = useChat();
  const [open, setOpen] = useState(() => loadPref(PREF_ROOM_OPEN, true) !== false);
  const inputRef = useRef(null);
  const last = lines.length ? lines[lines.length - 1].seq : 0;
  useEffect(() => { if (open) markRead(last); }, [open, last]);
  const toggle = (v) => { setOpen(v); savePref(PREF_ROOM_OPEN, v); };
  useEffect(() => {
    const onKey = (e) => {
      if (!isChatHotkey(e)) return;
      e.preventDefault();
      if (!open) toggle(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const unread = open ? 0 : unreadCount(lines, myId, seen);
  if (!open) {
    return html`<button type="button" class="chat-fold" onClick=${() => toggle(true)} aria-label="打开聊天">
      <${Glyph} d=${CHAT_D} /><span>聊天</span>${unread ? html`<b class="chat__badge num">${unread > 99 ? '99+' : unread}</b>` : null}
    </button>`;
  }
  return html`<section class="chat chat--room" aria-label="聊天">
    <header class="chat__head"><${Glyph} d=${CHAT_D} /><span>同盟通讯</span>
      <button type="button" class="chat__x" onClick=${() => toggle(false)} aria-label="收起聊天" title="收起">–</button>
    </header>
    <${ChatLog} lines=${lines} myId=${myId} />
    <${ChatInput} disabled=${!online} inputRef=${inputRef} />
  </section>`;
}

/** Match chat: button (beside 交流) + panel + floating feed. */
export function GameChat({ open, onToggle, disabled = false }) {
  const { lines, seen, myId, online } = useChat();
  const [now, setNow] = useState(Date.now);
  const live = useRef({});
  live.current = { open, onToggle };
  const last = lines.length ? lines[lines.length - 1].seq : 0;
  useEffect(() => { if (open) markRead(last); }, [open, last]);

  // Enter opens (and focuses) the panel
  useEffect(() => {
    const onKey = (e) => {
      if (!isChatHotkey(e) || live.current.open) return;
      e.preventDefault();
      live.current.onToggle(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // a press outside closes the panel
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!(e.target instanceof Element) || !e.target.closest('.gchat')) live.current.onToggle(false); };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const feed = open ? [] : feedLines(lines, { myId, seenSeq: seen, now });
  // re-render when the oldest floating line expires
  useEffect(() => {
    if (!feed.length) return undefined;
    const next = Math.min(...feed.map((l) => l.rx + FEED_MS)) - Date.now();
    const t = setTimeout(() => setNow(Date.now()), Math.max(50, next + 20));
    return () => clearTimeout(t);
  });
  useEffect(() => { setNow(Date.now()); }, [last]);

  const unread = open ? 0 : unreadCount(lines, myId, seen);
  return html`<div class="gchat">
    <button type="button" class=${cx('gchat__btn', open && 'is-on')} onClick=${() => onToggle(!open)}
      aria-expanded=${open ? 'true' : 'false'} aria-label="聊天" title="聊天 (Enter)">
      <${Glyph} d=${CHAT_D} />${unread ? html`<b class="chat__badge num">${unread > 99 ? '99+' : unread}</b>` : null}
    </button>
    ${open ? html`<section class="chat chat--game" role="dialog" aria-label="聊天">
      <${ChatLog} lines=${lines} myId=${myId} />
      <${ChatInput} disabled=${disabled || !online} autoFocus=${true} onEscape=${() => onToggle(false)} />
    </section>` : null}
    ${feed.length ? html`<ol class="gchat__feed" aria-hidden="true">
      ${feed.map((l) => html`<${Line} key=${l.seq} l=${l} myId=${myId} cls="gchat__pop" style=${`--pop-age:${Math.max(0, now - l.rx)}ms`} />`)}
    </ol>` : null}
  </div>`;
}
