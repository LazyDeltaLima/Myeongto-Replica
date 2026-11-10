// The 卫戍协议 season picker (maintainer decisions 2026-11-01; shared/seasons.js). A socket's first pong names the seasons
// rooms may name (`seasons`, only when the server offers several: Lobby.connectInfo) → store ui.seasons; the season the
// player picked is remembered (pref `season` → ui.season; a first visit has the default season, the previous one).
// While several are offered the page shows the picker: the season tabs at the top of the title's login box (the
// title's season word follows the pick) and the season chip of the lobby's top bar; with one season nothing shows.
// A room has its season (room.state `season`): an invitation link carries it (`&season=`, ui.pendingSeason — the title
// then names the room's season instead of the tabs), and joining a room of another season — a link, a typed key,
// spectating — switches the pick to it with a toast. The season on screen (activeSeason: the room's, else the picked
// one) is the one whose data, loadout and statistics the page uses (main.js); rooms are created and 랜덤 매칭 queued in
// the picked one. The update news and 作战提示 are the same in every season.

import { useState, useEffect, useRef } from '../../vendor/hooks.module.js';
import { DEFAULT_SEASON, isSeasonId, seasonInfo, seasonOf } from '../../../shared/seasons.js';
import { store, useStore, shallowEqual, loadPref, savePref } from '../store.js';
import { html } from './components.js';
import { toast } from './toasts.js';
import { useData } from '../data.js';
import { seasonTabArt } from './seasonArt.js';
import { t } from '../../../shared/i18n.js';

/** The remembered pick (store.js loadPref). */
export const SEASON_PREF = 'season';

/** The seasons the server offers (ui.seasons; unknown or one: the default alone). @param {any} s store state @returns {string[]} */
export function offeredSeasonsOf(s) {
  const list = Array.isArray(s?.ui?.seasons) ? s.ui.seasons.filter(isSeasonId) : [];
  return list.length ? list : [DEFAULT_SEASON];
}

/** Whether the page shows the season picker: the server offers several. @param {any} s */
export const hasSeasonPicker = (s) => offeredSeasonsOf(s).length > 1;

/** The picked season, when the server offers it; else the default. @param {any} s @returns {string} */
export function pickedSeason(s) {
  const id = s?.ui?.season;
  return offeredSeasonsOf(s).includes(id) ? id : DEFAULT_SEASON;
}

/**
 * The season on screen: the room's (room.state `season`, absent = the default), else an invitation's while it waits
 * (ui.pendingSeason), else the picked one. @param {any} s @returns {string}
 */
export function activeSeason(s) {
  if (s?.room) return seasonOf(s.room.season);
  if (s?.ui?.pendingJoin && offeredSeasonsOf(s).includes(s.ui.pendingSeason)) return s.ui.pendingSeason;
  return pickedSeason(s);
}

/** The room.create / room.queue field of a season: none for the default one. @param {string} season */
export const seasonFields = (season) => (season !== DEFAULT_SEASON && isSeasonId(season) ? { season } : {});

/**
 * The waiting Doctors of a season's queues (lobby.queueCounts: the default season's `counts` / `counts8` → ui.queueCounts
 * / queueCounts8, the others' `seasons` → ui.queueCountsBy). @param {any} s @param {string} season @param {boolean} large
 */
export function seasonQueueCounts(s, season, large) {
  if (seasonOf(season) === DEFAULT_SEASON) return large ? s.ui.queueCounts8 : s.ui.queueCounts;
  const c = s.ui.queueCountsBy?.[season];
  return (large ? c?.counts8 : c?.counts) ?? null;
}

/** The 快速匹配 queue's waiting Doctors of a season, { [difficulty]: n } (lobby.queueCounts `quick` → ui.queueQuick). @param {any} s @param {string} season */
export function seasonQuickCounts(s, season) {
  if (seasonOf(season) === DEFAULT_SEASON) return s.ui.queueQuick ?? null;
  return s.ui.queueCountsBy?.[season]?.quick ?? null;
}

/** The season's word of the title (卫戍协议：<name>), translated. @param {unknown} id */
export const seasonName = (id) => t(seasonInfo(id).name);

/** The remembered pick (boot). @returns {string|null} */
export function loadPickedSeason() {
  const v = loadPref(SEASON_PREF, null);
  return typeof v === 'string' ? v : null;
}

/** Pick a season (remembered; the page switches to it out of a room). @param {string} id */
export function pickSeason(id) {
  if (!isSeasonId(id)) return;
  savePref(SEASON_PREF, id);
  if (store.get().ui.season !== id) store.patch('ui', { season: id });
}

/**
 * The season of an invitation link (`&season=<id>`, inviteLink), or null when absent / unknown.
 * @param {string} search e.g. location.search
 */
export function parseSeasonParam(search) {
  try {
    const v = new URLSearchParams(search || '').get('season');
    return isSeasonId(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Wire the picker once (main.js): the first pong's `seasons`, and the pick following a room of another season.
 * @param {{ net: any, target?: typeof store, notify?: (text: string) => void }} deps
 */
export function installSeasons({ net, target = store, notify = (text) => toast(text, 'info', { ttl: 5000 }) }) {
  const offPong = net.on('pong', (m) => {
    if (!Array.isArray(m?.seasons)) return;
    const list = m.seasons.filter(isSeasonId);
    if (!shallowEqual(list, target.get().ui.seasons || [])) target.patch('ui', { seasons: list.length > 1 ? list : null });
  });
  const offStore = target.subscribe((s, prev) => {
    const code = s.room?.code;
    if (!code || code === prev.room?.code) return;
    const season = seasonOf(s.room.season);
    if (season === pickedSeason(s) || !offeredSeasonsOf(s).includes(season)) return;
    savePref(SEASON_PREF, season);
    target.patch('ui', { season });
    notify(t('该同盟属于「{season}」赛季，已切换到该赛季', { season: seasonName(season) }));
  });
  return () => { offPong?.(); offStore?.(); };
}

/** The NEW mark of a season other than the default. @param {{ id: string }} p */
function NewMark({ id }) {
  return id === DEFAULT_SEASON ? null : html`<span class="season-new">NEW</span>`;
}

/**
 * The title's season tabs (top of the login box; mockup C). Nothing while one season is offered or an invitation waits.
 * Each tab shows its season's picture and emblem (ui/seasonArt.js seasonTabArt; maintainer decision 2026-11-10) when
 * every offered season has them; else the names alone.
 */
export function SeasonTabs() {
  const st = useStore((s) => ({ offered: offeredSeasonsOf(s), picked: pickedSeason(s), invite: !!s.ui.pendingJoin }), shallowEqualDeep);
  useData('assets', 'local');
  if (st.offered.length < 2 || st.invite) return null;
  const arts = st.offered.map(seasonTabArt);
  const art = arts.every(Boolean);
  return html`<div class="season-tabs">
    <span class="season-tabs__k">${t('赛季')}<small>SEASON</small></span>
    <span class=${`season-tabs__opts${art ? ' has-art' : ''}`} role="radiogroup" aria-label=${t('赛季')}>
      ${st.offered.map((id, i) => html`<button key=${id} type="button" role="radio" aria-checked=${id === st.picked ? 'true' : 'false'}
        class=${`season-tabs__opt tapx${id === st.picked ? ' is-on' : ''}`} onClick=${() => pickSeason(id)}
        style=${art ? `--tab-art: url("${arts[i].bg}")` : null}>${art
          ? html`<img class="season-tabs__emb" src=${arts[i].emblem} alt="" draggable="false" /><span class="season-tabs__name">${seasonName(id)}<${NewMark} id=${id} /></span>`
          : html`${seasonName(id)}<${NewMark} id=${id} />`}</button>`)}
    </span>
  </div>`;
}

/** The line of the title's invitation card naming the room's season, when the link names another than the picked one. */
export function InviteSeason() {
  const st = useStore((s) => ({ offered: hasSeasonPicker(s), invite: activeSeason(s), picked: pickedSeason(s) }), shallowEqual);
  if (!st.offered || st.invite === st.picked) return null;
  return html`<span class="title-invite__season">${t('该同盟属于「{season}」赛季，将以该赛季加入', { season: seasonName(st.invite) })}</span>`;
}

/** The lobby top bar's season chip and its menu (the waiting Doctors of each season come from lobby.queueCounts). */
export function SeasonChip() {
  const st = useStore((s) => ({ offered: offeredSeasonsOf(s), picked: pickedSeason(s) }), shallowEqualDeep);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  if (st.offered.length < 2) return null;
  const choose = (id) => { pickSeason(id); setOpen(false); };
  return html`<span class="season-chip-wrap" ref=${ref}>
    <button type="button" class=${`season-chip tapx${open ? ' is-open' : ''}`} aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'}
      onClick=${() => setOpen(!open)}>
      <span class="season-chip__k">${t('赛季')}</span><b>${seasonName(st.picked)}</b><span class="season-chip__caret" aria-hidden="true">▾</span>
    </button>
    ${open ? html`<div class="season-menu" role="menu">
      ${st.offered.map((id) => html`<button key=${id} type="button" role="menuitemradio" aria-checked=${id === st.picked ? 'true' : 'false'}
        class=${`season-menu__row${id === st.picked ? ' is-on' : ''}`} onClick=${() => choose(id)}>
        <span class="season-menu__name">${seasonName(id)}<${NewMark} id=${id} /></span><span class="season-menu__check" aria-hidden="true">${id === st.picked ? '✓' : ''}</span>
      </button>`)}
      <div class="season-menu__foot">${t('干员调配与统计按赛季分开保存；作战提示与更新公告共用')}</div>
    </div>` : null}
  </span>`;
}

/**
 * The 赛季 row's switch of 创建同盟's 选择模拟协议 (screens/lobby.js ProtoRules `season`): the season the new room plays,
 * the same pick as the top bar's chip (pickSeason) — a room's season is fixed when it is made (maintainer decisions
 * 2026-11-07, 2026-11-08: its mode bar only shows it). Nothing while one season is offered (hasSeasonPicker).
 */
export function SeasonPick({ class: cls = '' }) {
  const st = useStore((s) => ({ offered: offeredSeasonsOf(s), picked: pickedSeason(s) }), shallowEqualDeep);
  if (st.offered.length < 2) return null;
  return html`<div class=${`dpick rpick ${cls}`.trim()} role="radiogroup" aria-label=${t('赛季')} data-testid="ally-season">
    ${st.offered.map((id) => html`<button key=${id} type="button" role="radio" aria-checked=${id === st.picked ? 'true' : 'false'} data-season=${id}
      class=${`dpick__opt rpick__opt${id === st.picked ? ' is-active' : ''}`} onClick=${() => id !== st.picked && pickSeason(id)}>${seasonName(id)}<${NewMark} id=${id} /></button>`)}
  </div>`;
}

/**
 * The room's season, the first part of its mode bar (screens/room.js), read-only (maintainer decision 2026-11-07: a room
 * keeps the season it was created in): while several seasons are offered or the room's is not the default. The room's
 * top bar no longer repeats it (maintainer decision 2026-11-08).
 */
export function RoomSeasonSeg() {
  const st = useStore((s) => ({ season: seasonOf(s.room?.season), shown: hasSeasonPicker(s) || seasonOf(s.room?.season) !== DEFAULT_SEASON }), shallowEqual);
  if (!st.shown) return null;
  return html`<span class=${`rs-mode__seg rs-mode__season${st.season !== DEFAULT_SEASON ? ' is-new' : ''}`} data-testid="room-season"
    title=${t('赛季')}>${seasonName(st.season)}</span>`;
}

/** shallowEqual that compares one level of arrays inside (the `offered` list). */
function shallowEqualDeep(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => (Array.isArray(a[k]) && Array.isArray(b[k]) ? shallowEqual(a[k], b[k]) : Object.is(a[k], b[k])));
}
