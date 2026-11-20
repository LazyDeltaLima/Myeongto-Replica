// 공개방 (server/lobby.js header 「공개방」, maintainer decisions 2026-11-20; docs/rules/ui.md 「랜덤 매칭」 「공개방」): the
// public room list over the left half of 选择模拟协议 for 同盟匹配 (screens/lobby.js ProtocolSelect `stage`), its picture and
// brief blurred under it. The official client has no room list: the rows are ours, each room drawn with the waiting
// room's own parts (ui/modeCapsule.js — the mode capsule, the seats).
//   - lobby.watchRooms { on } while the list is open (again on every reconnect); lobby.rooms → store ui.publicRooms (null:
//     not received yet, `.pubrooms.is-loading`). Every season's public rooms: the picked season's first, the others
//     under a divider per season with the season part in their capsule (a join switches the page to the room's season,
//     as an invitation does: ui/season.js installSeasons).
//   - One row per room (A 목록형, no column header): capsule · host (name #번호; under it 「匹配对象」 / 「快速匹配对象」 and a
//     custom room's 「自定义 · 设置 n 项不同 ▾」, which opens its differing settings — ui/customSummary.js — and 查看全部设置,
//     the read-only settings dialog) · seats · state (等待 n 分钟 / 进行中 · 第 n 回合) · 参加 (room.join, no confirmation)
//     and 观战 (room.spectate). A row the player's matchmaking would take (roomFit) is outlined in mint.
//   - Filter F2: a season drop-down (所有赛季 / each season with its rooms; it filters the list only, the picked season
//     stays) and two switches, 仅匹配对象 (off for another season) and 进行中（观战）. On a short screen the switches fold
//     into one 筛选 button.
// Joining from the list while queued alone leaves the queue (the server does it; ui/matchQueue.js closes the dialog).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTY_COLORS, seatsOf } from '../../../shared/constants.js';
import { DEFAULT_SEASON, seasonOf } from '../../../shared/seasons.js';
import { html, Button, Icon, useTicker } from './components.js';
import { toastError } from './toasts.js';
import { net } from '../net.js';
import { store, useStore, serverNow } from '../store.js';
import { t } from '../../../shared/i18n.js';
import { offeredSeasonsOf, seasonName } from './season.js';
import { useMediaQuery, SHORT_SCREEN_QUERY } from './device.js';
import { ModeCapsule, RoomSeats } from './modeCapsule.js';
import { CustomRulesInfo } from './customSummary.js';
import { openCustomRules } from './customRules.js';
import { customFound } from './matchQueue.js';

/** Seats a Doctor may take in a row: empty ones and AI ones (a public room's AI seat gives way). @param {any} row */
export const openSeats = (row) => (Array.isArray(row?.seats) ? row.seats.filter((s) => s?.kind !== 'human').length : 0);
/** The Doctors seated in a row. @param {any} row */
export const humansOf = (row) => (Array.isArray(row?.seats) ? row.seats.filter((s) => s?.kind === 'human').length : 0);

/**
 * Whether the player's matchmaking would offer this room (server/matchmaking.js 「공개방」): 'fit' with the picks as
 * they are — the picked season and difficulty, a room in LOBBY with a seat a Doctor may take, and for 精准匹配 the
 * ruleset and size too —, 'quick' when only 快速匹配 would (the difficulty alone; a custom room is the quick players'),
 * else null.
 * @param {any} row a lobby.rooms row
 * @param {{ season: string, difficulty: string, ruleset: string, size: number, quick: boolean }} pick
 * @returns {'fit' | 'quick' | null}
 */
export function roomFit(row, { season, difficulty, ruleset, size, quick }) {
  if (!row || seasonOf(row.season) !== seasonOf(season) || row.state !== 'lobby' || row.difficulty !== difficulty || !openSeats(row)) return null;
  if (quick) return 'fit';
  return row.ruleset?.preset === ruleset && seatsOf(row.size) === seatsOf(size) ? 'fit' : 'quick';
}

/**
 * The list as drawn: `current` — the picked season's rooms, the matchmaking's first ('fit', then 'quick'), the waiting
 * before the running, else in the server's order (made public first) —, `others` — the other seasons' rooms, a group per
 * season in `offered` order —, `fits` (the matchmaking's rooms of the whole list). `pick`: 'all' or one season;
 * `fitOnly`: the matchmaking's rooms only (the picked season's); `live`: rooms in a match too.
 * @param {any[] | null} rows lobby.rooms @param {{ season: string, offered?: string[], pick?: string, fitOnly?: boolean,
 *   live?: boolean, fit: (row: any) => 'fit' | 'quick' | null }} o
 */
export function listRooms(rows, { season, offered = [], pick = 'all', fitOnly = false, live = true, fit }) {
  const all = Array.isArray(rows) ? rows : [];
  const tagged = all.map((row, i) => ({ row, i, season: seasonOf(row.season), fit: fit(row) }));
  const fits = tagged.filter((x) => x.fit === 'fit').length;
  const shown = tagged.filter((x) => (pick === 'all' || x.season === pick) && (live || x.row.state !== 'match') && (!fitOnly || x.fit === 'fit'));
  const rank = (x) => (x.fit === 'fit' ? 0 : x.fit === 'quick' ? 1 : 2) * 2 + (x.row.state === 'match' ? 1 : 0);
  const current = shown.filter((x) => x.season === seasonOf(season)).sort((a, b) => rank(a) - rank(b) || a.i - b.i);
  const order = [...offered, ...shown.map((x) => x.season)].filter((id, i, a) => id !== seasonOf(season) && a.indexOf(id) === i);
  const others = order.map((id) => ({ season: id, rows: shown.filter((x) => x.season === id) })).filter((g) => g.rows.length);
  return { current, others, fits, total: all.length };
}

/** The waiting public rooms of a season and difficulty (the 同盟匹配 cards' 「房间 n」). @param {any[] | null} rows */
export function roomsWaiting(rows, season, difficulty) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r.state === 'lobby' && r.difficulty === difficulty && seasonOf(r.season) === seasonOf(season)).length;
}

/** lobby.watchRooms while mounted and online (a reconnect subscribes again); the list is forgotten when it closes. */
function useWatchRooms(online) {
  useEffect(() => {
    if (!online) return undefined;
    net.request('lobby.watchRooms', { on: true }).catch(() => {});
    return () => { net.request('lobby.watchRooms', { on: false }).catch(() => {}); };
  }, [online]);
  useEffect(() => () => store.patch('ui', { publicRooms: null }), []);
}

/** A press outside `ref` or Escape closes (the drop-down, the folded filter, a custom room's settings). */
function useOutside(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  return ref;
}

/** An on / off filter (`.dpick__opt` with the check, as 「AI 队友最后选择」). */
function Toggle({ on, label, n = null, disabled = false, onPick }) {
  return html`<button type="button" role="switch" aria-checked=${on ? 'true' : 'false'} disabled=${disabled}
      class=${`dpick__opt pubrooms__tog${on ? ' is-active' : ''}`} onClick=${() => onPick(!on)}>
    <${Icon} name="check" class=${on ? 'is-on' : ''} />${label}${n != null ? html`<em class="num">${n}</em>` : null}
  </button>`;
}

/** The season drop-down (the lobby chip's look, ui/season.js SeasonChip): filters the list, never the page's season. */
function SeasonFilter({ value, current, offered, counts, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, setOpen);
  const rows = ['all', ...offered];
  const name = (id) => (id === 'all' ? t('所有赛季') : seasonName(id));
  return html`<span class="season-chip-wrap pubrooms__season" ref=${ref}>
    <button type="button" class=${`season-chip tapx${open ? ' is-open' : ''}`} aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'}
        onClick=${() => setOpen(!open)}>
      <span class="season-chip__k">${t('赛季')}</span><b>${name(value)}</b><span class="season-chip__caret" aria-hidden="true">▾</span>
    </button>
    ${open ? html`<div class="season-menu pubrooms__smenu" role="menu">
      ${rows.map((id) => html`<button key=${id} type="button" role="menuitemradio" aria-checked=${id === value ? 'true' : 'false'}
          class=${`season-menu__row${id === value ? ' is-on' : ''}`} onClick=${() => { setOpen(false); onPick(id); }}>
        <span class="season-menu__name">${name(id)}${id === current ? html`<small class="pubrooms__cur">${t('当前赛季')}</small>` : null}</span>
        <span class="pubrooms__sn num">${t('房间 {n}', { n: counts[id] ?? 0 })}</span>
        <span class="season-menu__check" aria-hidden="true">${id === value ? '✓' : ''}</span>
      </button>`)}
      <div class="season-menu__foot">${t('「匹配对象」与「开始匹配」只限当前赛季（{season}）· 加入其他赛季的联合会切换到该赛季', { season: seasonName(current) })}</div>
    </div>` : null}
  </span>`;
}

/**
 * A custom room's chip: how many settings differ from the official ones; pressed (or hovered with a mouse) it shows them
 * — CustomRulesInfo, as the briefing — and 查看全部设置 (the read-only settings dialog). The panel is drawn in the list's
 * frame, not inside the scrolling list (which would cut it), under the chip or over it when there is no room below.
 */
function CustomChip({ row, open, onOpen, anchor }) {
  const size = seatsOf(row.size);
  const found = customFound(row.custom, row.difficulty, size);
  const btn = useRef(null);
  return html`<span class="pubroom__cwrap">
    <button type="button" ref=${btn} class=${`pubroom__custom${open ? ' is-open' : ''}`} aria-expanded=${open ? 'true' : 'false'}
        onClick=${() => onOpen(open ? null : { code: row.code, el: btn.current })}
        onPointerEnter=${(e) => { if (e.pointerType === 'mouse' && !open) onOpen({ code: row.code, el: btn.current, hover: true }); }}>
      <span class="rtag rtag--custom">${t('自定义')}</span>${t('设置 {n} 项不同', { n: found.n })}<span class="pubroom__caret" aria-hidden="true">▾</span>
    </button>
    ${open && anchor ? html`<${CustomPanel} row=${row} found=${found} anchor=${anchor} />` : null}
  </span>`;
}

/** The custom chip's panel (CustomChip), placed against the list's frame (`anchor`: { frame, chip } rects). */
function CustomPanel({ row, found, anchor }) {
  const { frame, chip } = anchor;
  const below = frame.bottom - chip.bottom;
  const up = below < 160 && chip.top - frame.top > below;
  const style = `left:${Math.max(0, chip.left - frame.left)}px; ${up ? `bottom:${frame.bottom - chip.top + 4}px` : `top:${chip.bottom - frame.top + 4}px`}`;
  return html`<div class=${`pubroom__panel${up ? ' is-up' : ''}`} style=${style} data-testid="pubroom-custom">
    <${CustomRulesInfo} lines=${found.items} class="crs--sm" />
    <button type="button" class="pubroom__all" onClick=${() => openCustomRules({ rules: row.custom, readonly: true, roomMode: 'coop', difficulty: row.difficulty, size: seatsOf(row.size) })}>
      <${Icon} name="book" />${t('查看全部设置')}
    </button>
  </div>`;
}

/** One room (header). */
function RoomRow({ row, fit, other, busy, onJoin, onSpectate, customOpen, onCustom, anchor }) {
  const live = row.state === 'match';
  const size = seatsOf(row.size);
  const minutes = Math.max(0, Math.floor((serverNow() - (row.since ?? 0)) / 60000));
  const custom = row.ruleset?.preset === 'custom' && row.custom;
  const free = openSeats(row) > 0;
  const specFull = (row.spectators ?? 0) >= (row.spectatorSeats ?? 0);
  return html`<li class=${`pubroom${fit === 'fit' ? ' is-fit' : ''}${live ? ' is-live' : ''}`} data-code=${row.code} style=${`--dc:${DIFFICULTY_COLORS[row.difficulty] || 'var(--amber)'}`}>
    <span class="pubroom__mode"><${ModeCapsule} season=${other ? row.season ?? DEFAULT_SEASON : null} ruleset=${row.ruleset?.preset} difficulty=${row.difficulty} size=${size} /></span>
    <span class="pubroom__who">
      <span class="pubroom__host"><b>${row.host?.name || t('博士')}</b><small class="num">#${row.host?.no ?? ''}</small></span>
      <span class="pubroom__tags">
        ${fit === 'fit' ? html`<span class="pubroom__fit"><${Icon} name="signal" />${t('匹配对象')}</span>`
          : fit === 'quick' ? html`<span class="pubroom__fit is-quick">${t('快速匹配对象')}</span>` : null}
        ${custom ? html`<${CustomChip} row=${row} open=${customOpen} onOpen=${onCustom} anchor=${anchor} />` : null}
      </span>
    </span>
    <${RoomSeats} seats=${row.seats} size=${size} />
    <span class=${`pubroom__state${live ? ' is-live' : ''}`}><i aria-hidden="true"></i>${live
      ? t('进行中 · 第{n}回合', { n: row.round ?? 0 }) : t('等待 {n} 分钟', { n: minutes })}</span>
    <span class="pubroom__act">
      ${live ? null : html`<${Button} variant="amber" size="sm" class="pubroom__join" loading=${busy === `j${row.code}`} disabled=${!free || !!busy}
        title=${free ? null : t('同盟已满员')} onClick=${() => onJoin(row)}>${t('参加')} <span class="num">${humansOf(row)}/${size}</span><//>`}
      <${Button} variant="secondary" size="sm" icon="eye" class=${`pubroom__spec${live ? '' : ' is-square'}`} loading=${busy === `s${row.code}`}
        disabled=${specFull || !!busy} title=${specFull ? t('观战席已满') : t('观战')} aria-label=${t('观战')}
        onClick=${() => onSpectate(row)}>${live ? html`<span class="num">${t('观战 {n}/{max}', { n: row.spectators ?? 0, max: row.spectatorSeats ?? 0 })}</span>` : null}<//>
    </span>
  </li>`;
}

/**
 * The list (header). `season`, `difficulty`, `ruleset`, `size`, `quick`: the picks of 选择模拟协议 — what the player's
 * matchmaking would take (roomFit). `online`: the connection is up.
 */
export function PublicRooms({ season, difficulty, ruleset, size, quick, online }) {
  useWatchRooms(online);
  useTicker(15000);
  const rows = useStore((s) => s.ui.publicRooms ?? null);
  const offered = useStore((s) => offeredSeasonsOf(s).join('|')).split('|');
  const short = useMediaQuery(SHORT_SCREEN_QUERY);
  const [pick, setPick] = useState('all');
  const [fitOnly, setFitOnly] = useState(false);
  const [live, setLive] = useState(true);
  const [fold, setFold] = useState(false);
  const foldRef = useOutside(fold, setFold);
  const [custom, setCustom] = useState(/** @type {null | { code: string, el: any, hover?: boolean }} */ (null));
  const customRef = useOutside(!!custom, () => setCustom(null));
  const frame = useRef(null);
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  const otherPick = pick !== 'all' && pick !== seasonOf(season);
  const fit = (row) => roomFit(row, { season, difficulty, ruleset, size, quick });
  const view = listRooms(rows, { season, offered, pick, fitOnly: fitOnly && !otherPick, live, fit });
  const counts = { all: rows?.length ?? 0 };
  for (const r of rows || []) counts[seasonOf(r.season)] = (counts[seasonOf(r.season)] ?? 0) + 1;
  // the custom panel's place: the chip's and the frame's rects (it is drawn in the frame, outside the scrolling list)
  const anchor = custom?.el && frame.current ? { frame: frame.current.getBoundingClientRect(), chip: custom.el.getBoundingClientRect() } : null;

  const run = async (key, fn) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); } catch (err) { toastError(err); } finally { setBusy(null); }
  };
  const join = (row) => run(`j${row.code}`, () => net.request('room.join', { code: row.code }));
  const spectate = (row) => run(`s${row.code}`, () => net.request('room.spectate', { code: row.code }));
  const toggles = [
    html`<${Toggle} key="fit" on=${fitOnly && !otherPick} disabled=${otherPick} label=${t('仅匹配对象')} n=${view.fits} onPick=${setFitOnly} />`,
    html`<${Toggle} key="live" on=${live} label=${t('进行中（观战）')} onPick=${setLive} />`,
  ];
  const onCount = (fitOnly && !otherPick ? 1 : 0) + (live ? 1 : 0);
  const row = (x, other) => html`<${RoomRow} key=${x.row.code} row=${x.row} fit=${x.fit} other=${other} busy=${busy} onJoin=${join} onSpectate=${spectate}
    customOpen=${custom?.code === x.row.code} onCustom=${setCustom} anchor=${custom?.code === x.row.code ? anchor : null} />`;
  const empty = !view.current.length && !view.others.length;

  return html`<div class=${`pubrooms${rows ? '' : ' is-loading'}`} ref=${frame} data-testid="public-rooms"
      onPointerLeave=${(e) => { if (e.pointerType === 'mouse' && custom?.hover) setCustom(null); }}>
    <header class="pubrooms__head">
      <span class="pubrooms__title"><${Icon} name="signal" /><b>${t('公开联合')}</b><i>PUBLIC ALLIANCES</i></span>
      <span class="pubrooms__count">${t('{n} 个 · 匹配对象 {m}', { n: view.total, m: view.fits })}</span>
      <span class="pubrooms__filter">
        <${SeasonFilter} value=${pick} current=${seasonOf(season)} offered=${offered} counts=${counts} onPick=${(id) => { setPick(id); setCustom(null); }} />
        ${short ? html`<span class="pubrooms__fold" ref=${foldRef}>
            <button type="button" class=${`pubrooms__fbtn tapx${fold ? ' is-open' : ''}`} aria-expanded=${fold ? 'true' : 'false'} onClick=${() => setFold(!fold)}>
              ${t('筛选')}<em class="num">${onCount}</em></button>
            ${fold ? html`<div class="pubrooms__fpanel">${toggles}</div>` : null}
          </span>`
        : toggles}
      </span>
    </header>
    <ol class="pubrooms__list" ref=${customRef} onScroll=${() => { if (custom) setCustom(null); }}>
      ${view.current.map((x) => row(x, false))}
      ${view.others.map((g) => [
        html`<li key=${`d-${g.season}`} class="pubrooms__div"><b class=${g.season !== DEFAULT_SEASON ? 'is-new' : ''}>${seasonName(g.season)}</b>
          <span>${t('其他赛季 · 加入后将切换到「{season}」赛季', { season: seasonName(g.season) })}</span></li>`,
        ...g.rows.map((x) => row(x, true)),
      ])}
      ${rows && empty ? html`<li class="pubrooms__empty">${rows.length ? t('没有符合筛选条件的公开联合') : t('目前没有公开联合 · 创建同盟时选择「公开」即会显示在这里')}</li>` : null}
    </ol>
    <p class="pubrooms__foot"><${Icon} name="info" />${t('「开始匹配」会同时寻找匹配对象联合的空位与等待中的博士 · 列表中的联合可以直接加入')}</p>
  </div>`;
}
