// Room chat (local NAS patch): one text channel per co-op room (solo rooms have none), open in the room screen and
// during the match.
//
// Wire (server/lobby.js chat): room.chat { text } → the room gets room.chat { seq, playerId, name, text, at }; a player
// who joins or resyncs gets room.chatlog { lines } (the last CHAT_HISTORY lines). Nothing outlives the room.
//
//   installChat()  net → store.chat { code, lines }: lines of the current room only (cleared when the room changes),
//                  each stamped with its local receipt time `rx` (0 for history lines, which never pop up as new)
//   RoomChat       the room screen's panel: log + input, folds to a button (unread count while folded)
//   GameChat       the match: a 聊天 button beside 交流 (unread badge) + panel above it; while it is closed, new lines
//                  of the others float above the corner for a few seconds. Enter opens it, Esc closes it.
// Player text is never translated (data-i18n-skip) and only ever rendered as text.
// Styles: public/css/chat.css.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { CHAT_MAX_LEN, CHAT_COOLDOWN_MS } from '../../../shared/constants.js';
import { html } from './components.js';
import { net } from '../net.js';
import { store, useStore, loadPref, savePref } from '../store.js';

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

/** Others' lines newer than `seenSeq`. */
export const unreadCount = (lines, myId, seenSeq) => lines.filter((l) => l.seq > seenSeq && l.playerId !== myId).length;

/** Wire the chat into the app store (main.js, once). */
export function installChat() {
  const roomCode = () => store.get().room?.code ?? null;
  const put = (incoming, rx) => {
    const code = roomCode();
    if (!code) return;
    const cur = store.get().chat;
    const base = cur && cur.code === code ? cur.lines : [];
    store.set({ chat: { code, lines: mergeLines(base, incoming.map((l) => ({ ...l, rx: rx ? Date.now() : 0 }))) } });
  };
  net.on('room.chat', (m) => put([m], true));
  net.on('room.chatlog', (m) => put(Array.isArray(m.lines) ? m.lines : [], false));
  store.subscribe((s) => {
    const code = s.room?.code ?? null;
    if ((s.chat?.code ?? null) !== code) store.set({ chat: { code, lines: [] } });
  });
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
    ${lines.length ? lines.map((l) => html`<li key=${l.seq} class=${cx('chat__line', l.playerId === myId && 'is-me')} data-i18n-skip="">
      <b class="chat__name">${l.name}</b><span class="chat__text">${l.text}</span>
    </li>`) : html`<li class="chat__empty">暂无消息</li>`}
  </ol>`;
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
  return { lines: chat?.lines || [], myId, online };
};

/** Room screen chat panel (co-op rooms). */
export function RoomChat() {
  const { lines, myId, online } = useChat();
  const [open, setOpen] = useState(() => loadPref(PREF_ROOM_OPEN, true) !== false);
  const [seen, setSeen] = useState(0);
  const inputRef = useRef(null);
  const last = lines.length ? lines[lines.length - 1].seq : 0;
  useEffect(() => { if (open) setSeen(last); }, [open, last]);
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
  const { lines, myId, online } = useChat();
  const [seen, setSeen] = useState(() => (lines.length ? lines[lines.length - 1].seq : 0));
  const [now, setNow] = useState(Date.now);
  const live = useRef({});
  live.current = { open, onToggle };
  const last = lines.length ? lines[lines.length - 1].seq : 0;
  useEffect(() => { if (open) setSeen(last); }, [open, last]);

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
      ${feed.map((l) => html`<li key=${l.seq} class="gchat__pop" style=${`--pop-age:${Math.max(0, now - l.rx)}ms`} data-i18n-skip="">
        <b class="chat__name">${l.name}</b><span class="chat__text">${l.text}</span>
      </li>`)}
    </ol>` : null}
  </div>`;
}
