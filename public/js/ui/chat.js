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
//                  history lines a player gets on joining or resyncing count as read. A new line of another player
//                  rings the chat notification (audio.js chatNotification; settings 聊天提示音), a faction pick only
//                  with 阵营选择提示 on; history lines, the player's own lines and a seq already kept never do.
//   FactionPicker  the chat faction (server/local-patch.js, room.factions → store.chatFactions): a colored tag on the
//                  player's lines and avatar until the match ends; picking one announces it as a `kind: 'faction'` line
//                  and applies the faction's 自选 preset if the player made one (ui/factionPick.js chooseFaction — the
//                  strategy draft's row picks the same way; PresetNotice = the 「…预设已套用 · 撤销」 line above the
//                  input, dropped once the player types); during a match a faction whose bond is off is dimmed
//   RoomChat       the room screen's panel: log + input, folds to a button (unread count while folded)
//   GameChat       the match: a 聊天 button beside 交流 (unread badge) + panel above it; while it is closed, new lines
//                  of the others float above the corner for a few seconds, or, with settings 常驻最近 3 条消息
//                  (chatPinRecent), up to 3 lines stay there until 30 minutes old. Enter opens it, Esc closes it.
//   Blocking     (maintainer decision 2026-11-18) a press on another player's line (not a text selection) opens its
//                「屏蔽 {name}」 button under the line; a blocked player's lines leave the log, the floating feed, the
//                pinned lines, the unread count and the notification, and one 「已屏蔽 {name}（{n} 条）· 解除屏蔽」 line stands
//                where the first of them was. This screen only (the other player is not told), for the room: store.chat
//                `blocked` (playerIds), kept per tab in sessionStorage with the room code (survives a reload).
//   Notice       one line only this player sees, right after the history a join / resync brought (store.chat
//                `noticeAfter` = its last seq; at the top of an empty log): the server keeps chat for 15 days
//                (server/local-moderation.js [chat] lines, maintainer decision 2026-11-18). Never sent anywhere.
// Player text is never translated (data-i18n-skip) and only ever rendered as text.
// Styles: public/css/chat.css.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { CHAT_MAX_LEN, CHAT_COOLDOWN_MS, chatFactionsOf, chatFaction } from '../../../shared/local.js';
import { html } from './components.js';
import { net } from '../net.js';
import { store, useStore, loadPref, savePref } from '../store.js';
import { audio } from '../audio.js';
import { settingsStore } from './settings.js';
import { t } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';
import { FactionIcon, factionIconUrl } from './faction.js';
import { chooseFaction, PresetNotice } from './factionPick.js';
import { clearPresetNotice } from './diyPresets.js';
import { ChatTime, hasMessageTime, isOldChatMessage, subscribeChatClock } from './chatTime.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const KEEP = 60;            // lines kept on the client
export const FEED_MS = 6000; // a new line floats this long over the match while the panel is closed
const FEED_MAX = 3;
const PREF_ROOM_OPEN = 'chatRoomOpen';
const K_BLOCKED = 'sp.chatBlocked'; // sessionStorage: { code, ids } — the players this tab blocked in that room

/** The players this tab blocked in room `code` (sessionStorage). */
export function loadBlocked(code, storage = globalThis.sessionStorage) {
  try {
    const v = JSON.parse(storage?.getItem(K_BLOCKED) || 'null');
    return v && v.code === code && Array.isArray(v.ids) ? v.ids.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}
function saveBlocked(code, ids, storage = globalThis.sessionStorage) {
  try { storage?.setItem(K_BLOCKED, JSON.stringify({ code, ids })); } catch { /* privacy mode */ }
}

/** Block / unblock a player's chat on this screen (header 「Blocking」). @param {string} playerId @param {boolean} on */
export function setBlocked(playerId, on) {
  const cur = store.get().chat;
  if (!cur?.code || typeof playerId !== 'string') return;
  const was = cur.blocked || [];
  const ids = on ? (was.includes(playerId) ? was : [...was, playerId]) : was.filter((x) => x !== playerId);
  if (ids === was) return;
  saveBlocked(cur.code, ids);
  store.set({ chat: { ...cur, blocked: ids } });
}

/** Lines without the blocked players'. @param {any[]} lines @param {string[]} [blocked] */
export const unblockedLines = (lines, blocked) => (blocked?.length ? lines.filter((l) => !blocked.includes(l.playerId)) : lines);

/**
 * What the log shows: the lines, each blocked player's lines replaced by one `{ kind: 'blocked', playerId, name, count,
 * seq }` entry where the first of them was, and the notice entry `{ kind: 'notice' }` after the line `noticeAfter` (before
 * the first later line; at the top when nothing came before it).
 * @param {any[]} lines @param {string[]} blocked @param {number} noticeAfter
 */
export function logEntries(lines, blocked = [], noticeAfter = 0) {
  const out = [];
  const marks = new Map();
  for (const l of lines) {
    if (!blocked.includes(l.playerId)) { out.push(l); continue; }
    const m = marks.get(l.playerId);
    if (m) { m.count++; if (l.kind !== 'faction') m.name = l.name; continue; }
    const mark = { kind: 'blocked', playerId: l.playerId, name: l.name, count: 1, seq: l.seq };
    marks.set(l.playerId, mark);
    out.push(mark);
  }
  const at = out.findIndex((e) => e.seq > noticeAfter);
  out.splice(at < 0 ? out.length : at, 0, { kind: 'notice', seq: -1 });
  return out;
}

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
 * Lines kept above the corner with 常驻最近 3 条消息 on: up to FEED_MAX recent user messages.
 * @param {any[]} lines @param {number} now
 */
export const pinnedLines = (lines, now) => lines.filter((l) => hasMessageTime(l) && !isOldChatMessage(l.at, now)).slice(-FEED_MAX);

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

/**
 * Does a live line ring the chat notification? Another player's new line in the current room; a faction pick only with
 * `factionAlerts`.
 * @param {any} line
 * @param {{ myId: any, known: any[], factionAlerts: boolean }} o
 */
export function notifiesChat(line, { myId, known, factionAlerts }) {
  if (!line || !Number.isInteger(line.seq) || line.playerId === myId) return false;
  if (line.kind === 'faction' && !factionAlerts) return false;
  return !known.some((l) => l.seq === line.seq);
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
    const blocked = same ? cur.blocked || [] : loadBlocked(code);
    // a join / resync's history: the notice goes after its last line (header 「Notice」)
    const last = incoming.reduce((n, l) => (l && Number.isInteger(l.seq) ? Math.max(n, l.seq) : n), 0);
    const noticeAfter = rx ? (same ? cur.noticeAfter || 0 : 0) : last;
    store.set({ chat: { code, lines: mergeLines(base, incoming.map((l) => ({ ...l, rx: rx ? Date.now() : 0 }))), seen, blocked, noticeAfter } });
  };
  net.on('room.chat', (m) => {
    const cur = store.get().chat;
    const known = cur && cur.code === roomCode() ? cur.lines : [];
    const blocked = cur && cur.code === roomCode() ? cur.blocked || [] : [];
    const ring = roomCode() && !blocked.includes(m?.playerId) && notifiesChat(m, { myId: store.get().me?.playerId, known, factionAlerts: settingsStore.get().chatFactionAlerts });
    put([m], true);
    if (ring) audio.chatNotification();
  });
  net.on('room.chatlog', (m) => put(Array.isArray(m.lines) ? m.lines : [], false));
  // room.factions { factions: { [playerId]: factionId } } (server/local-patch.js) → store.chatFactions
  net.on('room.factions', (m) => { if (roomCode()) store.set({ chatFactions: m.factions && typeof m.factions === 'object' ? { ...m.factions } : {} }); });
  store.subscribe((s) => {
    const code = s.room?.code ?? null;
    if ((s.chat?.code ?? null) !== code) store.set({ chat: { code, lines: [], seen: 0, blocked: code ? loadBlocked(code) : [], noticeAfter: 0 }, chatFactions: {} });
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
  return f ? html`<span class="chat__faction" style=${`color:${f.color}`}>(${t(f.name)})</span>` : null;
}

/** A press that only ends a text selection inside `el` (no menu then). */
const selecting = (el) => {
  const sel = globalThis.getSelection?.();
  return !!sel && !sel.isCollapsed && !!el && el.contains(sel.anchorNode);
};

/**
 * One chat line: `name(faction): text`, or the announcement of a faction pick. With `onMenu` (the log, not the floating
 * feed) another player's line opens its block button on a press (header 「Blocking」); `menu` = it is open.
 */
function Line({ l, myId, cls = '', style = '', menu = false, onMenu = null, showTime = false }) {
  const other = !!onMenu && l.playerId !== myId;
  const press = other ? (e) => {
    if (!e.target.closest('.chat__time') && !selecting(e.currentTarget)) onMenu(menu ? null : l.seq);
  } : undefined;
  const block = menu ? html`<div class="chat__menu"><button type="button" class="chat__block"
    onClick=${(e) => { e.stopPropagation(); setBlocked(l.playerId, true); onMenu(null); }}>${t('屏蔽 {name}', { name: playerName(l.name) })}</button></div>` : null;
  if (l.kind === 'faction') {
    const f = chatFaction(l.faction);
    return html`<li class=${cx('chat__line chat__line--sys', other && 'is-pressable', menu && 'is-menu', cls)} style=${style} data-i18n-skip="" onClick=${press}>
      <b class="chat__name">${playerName(l.name)}</b><span class="chat__text">${t('选择了阵营')} <b style=${f ? `color:${f.color}` : ''}>${f ? t(f.name) : '?'}</b></span>${block}
    </li>`;
  }
  const body = html`<b class="chat__name">${playerName(l.name)}${l.spectator ? html`<span class="chat__spec">(${t('观战')})</span>` : null}<${FactionTag} id=${l.faction} /></b><span class="chat__text">${l.text}</span>`;
  return html`<li class=${cx('chat__line', l.playerId === myId && 'is-me', other && 'is-pressable', menu && 'is-menu', cls)} style=${style} data-i18n-skip="" onClick=${press}>
    ${showTime && hasMessageTime(l) ? html`<div class="chat__message"><span class="chat__body">${body}</span><${ChatTime} at=${l.at} interactive=${!!onMenu} /></div>` : body}${block}
  </li>`;
}

/** Where a blocked player's lines were: the count and 解除屏蔽. */
function BlockedLine({ e }) {
  return html`<li class="chat__line chat__line--sys chat__blocked" data-i18n-skip="">
    <span class="chat__text">${t('已屏蔽 {name}（{n} 条）', { name: playerName(e.name), n: e.count })}</span>
    <button type="button" class="chat__unblock" onClick=${() => setBlocked(e.playerId, false)}>${t('解除屏蔽')}</button>
  </li>`;
}

/** Send one line; resolves to an error text for the input (null when sent). */
async function sendLine(text) {
  try {
    await net.request('room.chat', { text });
    return null;
  } catch (err) {
    return err?.code === 'RATE' ? t('发送过快，请稍候') : err?.code === 'BAD_MSG' ? t('无法发送空消息') : t('发送失败');
  }
}

/** The scrolling log; keeps the newest line in view unless the reader scrolled up. */
function ChatLog({ lines, myId, blocked = [], noticeAfter = 0 }) {
  const showTime = useStore((s) => s.chatShowTime, Object.is, settingsStore);
  const ref = useRef(null);
  const stick = useRef(true);
  const [menu, setMenu] = useState(null); // the seq whose block button is open
  // a press outside that line closes it
  useEffect(() => {
    if (menu == null) return undefined;
    const onDown = (e) => { if (!(e.target instanceof Element) || !e.target.closest('.chat__line.is-menu')) setMenu(null); };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [menu]);
  const newest = lines.length ? lines[lines.length - 1] : null;
  useEffect(() => {
    const el = ref.current;
    // the player's own line always brings the log down (maintainer report 2026-10-06: after scrolling up a little a sent
    // line stayed out of view); again a frame later for a line whose wrap / font settles after this paint
    if (!el || !(stick.current || (newest && newest.playerId === myId))) return undefined;
    stick.current = true;
    el.scrollTop = el.scrollHeight;
    const raf = requestAnimationFrame(() => { if (stick.current) el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(raf);
  }, [newest ? newest.seq : 0]);
  const onScroll = () => {
    const el = ref.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
  const entries = logEntries(lines, blocked, noticeAfter);
  return html`<ol class="chat__log" ref=${ref} onScroll=${onScroll} aria-live="polite">
    ${entries.map((e) => (e.kind === 'notice' ? html`<li key="notice" class="chat__notice">${t('聊天内容会在服务器保存 15 天。')}</li>`
      : e.kind === 'blocked' ? html`<${BlockedLine} key=${`b${e.seq}`} e=${e} />`
      : html`<${Line} key=${e.seq} l=${e} myId=${myId} menu=${menu === e.seq} onMenu=${setMenu} showTime=${showTime} />`))}
    ${lines.length ? null : html`<li class="chat__empty">${t('暂无消息')}</li>`}
  </ol>`;
}

/** The player's chat faction (room.state seat) and the picker: a chip left of the input (the faction's icon once
 *  picked, so the input keeps its width), the room season's factions (shared/local.js chatFactionsOf) with icon and
 *  name above it. */
function FactionPicker({ disabled }) {
  const seated = useStore((s) => (s.room?.seats || []).some((x) => x && x.playerId === s.me.playerId));
  const mine = useStore((s) => s.chatFactions?.[s.me.playerId] ?? null);
  const season = useStore((s) => s.room?.season ?? null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // the bonds off this match (m.public.disabledBonds): their factions are dimmed and say so
  const off = useStore((s) => s.match?.public?.disabledBonds ?? null);
  const f = chatFaction(mine);
  const pick = async (id) => {
    setOpen(false);
    if (id === mine || busy) return;
    setBusy(true);
    await chooseFaction(id); // false on a cooldown / offline: the chip stays
    setBusy(false);
  };
  if (!seated) return null; // spectators have no faction
  const isOff = (x) => Array.isArray(off) && off.includes(x.bond);
  return html`<div class="chat__fac">
    <button type="button" class=${cx('chat__facbtn', f && 'is-set')} style=${f ? `--fac:${f.color}` : ''} disabled=${disabled || busy}
      aria-expanded=${open ? 'true' : 'false'} title=${t('选择阵营')} onClick=${() => setOpen(!open)}>${f ? (factionIconUrl(f) ? html`<${FactionIcon} f=${f} />` : t(f.name)) : t('阵营')}</button>
    ${open ? html`<div class="chat__facs" role="group" aria-label=${t('选择阵营')}>
      ${chatFactionsOf(season).map((x) => html`<button key=${x.id} type="button" class=${cx(x.id === mine && 'is-on', isOff(x) && 'is-off')} style=${`--fac:${x.color}`}
        aria-pressed=${x.id === mine ? 'true' : 'false'} title=${isOff(x) ? `${t(x.name)}${t('（本局禁用）')}` : t(x.name)}
        onClick=${() => pick(x.id)}><${FactionIcon} f=${x} /><span>${t(x.name)}</span>${isOff(x) ? html`<small>${t('禁用')}</small>` : null}</button>`)}
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
    if (Date.now() - sentAt.current < CHAT_COOLDOWN_MS) { setErr(t('发送过快，请稍候')); return; }
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
    <${PresetNotice} />
    <${FactionPicker} disabled=${disabled} />
    <input ref=${ref} class="chat__input" type="text" value=${text} maxlength=${CHAT_MAX_LEN} enterkeyhint="send" autocomplete="off"
      placeholder=${disabled ? t('连接中断') : touchUi() ? t('输入消息') : t('输入消息，Enter 发送')} aria-label=${t('聊天消息')} disabled=${disabled}
      onInput=${(e) => { setText(e.currentTarget.value); clearPresetNotice(); }} onKeyDown=${onKey} data-i18n-skip="" />
    <button type="submit" class="chat__send" disabled=${disabled || busy || !text.trim()} aria-label=${t('发送')} title=${t('发送')}><${Glyph} d=${SEND_D} /></button>
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
  const blocked = chat?.blocked || [];
  const all = chat?.lines || [];
  // `shown`: without the blocked players' lines — the feed, the pinned lines and the unread count use it
  return { lines: all, shown: unblockedLines(all, blocked), blocked, noticeAfter: chat?.noticeAfter || 0, seen: chat?.seen || 0, myId, online };
};

/**
 * Room screen chat panel (co-op rooms): a column left of the seats on every screen (a short one too, maintainer decision
 * 2026-11-08), folded to a 聊天 button with the unread count; the open state is remembered.
 */
export function RoomChat() {
  const { lines, shown, blocked, noticeAfter, seen, myId, online } = useChat();
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
  const unread = open ? 0 : unreadCount(shown, myId, seen);
  if (!open) {
    return html`<button type="button" class="chat-fold" onClick=${() => toggle(true)} aria-label=${t('打开聊天')}>
      <${Glyph} d=${CHAT_D} /><span>${t('聊天')}</span>${unread ? html`<b class="chat__badge num">${unread > 99 ? '99+' : unread}</b>` : null}
    </button>`;
  }
  return html`<section class="chat chat--room" aria-label=${t('聊天')}>
    <header class="chat__head"><${Glyph} d=${CHAT_D} /><span>${t('同盟通讯')}</span>
      <button type="button" class="chat__x" onClick=${() => toggle(false)} aria-label=${t('收起聊天')} title=${t('收起')}>–</button>
    </header>
    <${ChatLog} lines=${lines} myId=${myId} blocked=${blocked} noticeAfter=${noticeAfter} />
    <${ChatInput} disabled=${!online} inputRef=${inputRef} />
  </section>`;
}

/** Match chat: button (beside 交流) + panel + floating feed. */
export function GameChat({ open, onToggle, disabled = false }) {
  const { lines, shown, blocked, noticeAfter, seen, myId, online } = useChat();
  const pin = useStore((s) => s.chatPinRecent, Object.is, settingsStore);
  const showTime = useStore((s) => s.chatShowTime, Object.is, settingsStore);
  const [now, setNow] = useState(Date.now);
  /** @type {{ current: Record<string, any> }} */
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

  const feed = open || pin ? [] : feedLines(shown, { myId, seenSeq: seen, now });
  const pinned = !open && pin ? pinnedLines(shown, Date.now()) : [];
  const oldestPinnedAt = pinned.length ? Math.min(...pinned.map((line) => line.at)) : null;
  useEffect(() => {
    if (oldestPinnedAt === null) return undefined;
    return subscribeChatClock((clockNow) => {
      if (isOldChatMessage(oldestPinnedAt, clockNow)) setNow(clockNow);
    });
  }, [oldestPinnedAt]);
  // re-render when the oldest floating line expires
  useEffect(() => {
    if (!feed.length) return undefined;
    const next = Math.min(...feed.map((l) => l.rx + FEED_MS)) - Date.now();
    const t = setTimeout(() => setNow(Date.now()), Math.max(50, next + 20));
    return () => clearTimeout(t);
  });
  useEffect(() => { setNow(Date.now()); }, [last]);

  const unread = open ? 0 : unreadCount(shown, myId, seen);
  return html`<div class="gchat">
    <button type="button" class=${cx('gchat__btn', open && 'is-on')} onClick=${() => onToggle(!open)}
      aria-expanded=${open ? 'true' : 'false'} aria-label=${t('聊天')} title=${t('聊天 (Enter)')}>
      <${Glyph} d=${CHAT_D} />${unread ? html`<b class="chat__badge num">${unread > 99 ? '99+' : unread}</b>` : null}
    </button>
    ${open ? html`<section class="chat chat--game" role="dialog" aria-label=${t('聊天')}>
      <${ChatLog} lines=${lines} myId=${myId} blocked=${blocked} noticeAfter=${noticeAfter} />
      <${ChatInput} disabled=${disabled || !online} autoFocus=${true} onEscape=${() => onToggle(false)} />
    </section>` : null}
    ${feed.length ? html`<ol class="gchat__feed" aria-hidden="true">
      ${feed.map((l) => html`<${Line} key=${l.seq} l=${l} myId=${myId} cls="gchat__pop" style=${`--pop-age:${Math.max(0, now - l.rx)}ms`} />`)}
    </ol>` : null}
    ${pinned.length ? html`<ol class="gchat__feed" aria-hidden="true">
      ${pinned.map((l) => html`<${Line} key=${l.seq} l=${l} myId=${myId} cls="gchat__pop is-pinned" showTime=${showTime} />`)}
    </ol>` : null}
  </div>`;
}
