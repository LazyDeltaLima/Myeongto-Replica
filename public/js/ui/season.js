// The 卫戍协议 season picker (maintainer decisions 2026-11-01, 2026-11-13; shared/seasons.js). A socket's first pong
// names the seasons rooms may name (`seasons`, only when the server offers several: Lobby.connectInfo) → store
// ui.seasons; the season the player picked is remembered (pref `season` → ui.season; a player who never picked one opens
// in the newest public season, newestPublicSeason). While several are offered the lobby's top bar has the season chip —
// the one place a season is picked (maintainer decision 2026-11-13: the title's season tabs are gone; the title draws
// the picked season's art, music and words). A room has its season (room.state `season`): an invitation link carries it
// (`&season=`, ui.pendingSeason; a room link without it is a 盟约 room, as every link was before), and joining a room of
// another season — a link, a typed key, spectating — switches the pick to it with a toast. The season on screen
// (activeSeason: the room's, else the picked one) is the one whose data, loadout and statistics the page uses
// (main.js); rooms are created and 랜덤 매칭 queued in the picked one. The update news and 作战提示 are the same in
// every season.

import { useState, useEffect, useRef } from '../../vendor/hooks.module.js';
import { DEFAULT_SEASON, isSeasonId, seasonInfo, seasonOf, newestPublicSeason, offeredSeasons } from '../../../shared/seasons.js';
import { store, useStore, shallowEqual, loadPref, savePref } from '../store.js';
import { html } from './components.js';
import { toast } from './toasts.js';
import { t } from '../../../shared/i18n.js';
import { setDocTitle } from './lang.js';

/** The remembered pick (store.js loadPref). */
export const SEASON_PREF = 'season';

/**
 * The seasons the server offers (ui.seasons, from the first pong). Before that pong answers (ui.seasons null) the page
 * takes the public seasons and the remembered pick as offered: the title, the season's data and main.js's entry film
 * are decided at boot, before the pong, and a guess of the default alone turned a 规程 player's page into 盟约 for its
 * first moments — the entry film then saw the season change under it and did not play. A pong that does not name the
 * pick corrects it. @param {any} s store state @returns {string[]}
 */
export function offeredSeasonsOf(s) {
  const known = s?.ui?.seasons;
  if (!Array.isArray(known)) {
    const pick = s?.ui?.season;
    return offeredSeasons().concat(isSeasonId(pick) && !offeredSeasons().includes(pick) ? [pick] : []);
  }
  const list = known.filter(isSeasonId);
  return list.length ? list : [DEFAULT_SEASON];
}

/** Whether the page shows the season picker: the server offers several. @param {any} s */
export const hasSeasonPicker = (s) => offeredSeasonsOf(s).length > 1;

/**
 * The picked season, when the server offers it; else the newest public season (a player who never picked one), else
 * the default. @param {any} s @returns {string}
 */
export function pickedSeason(s) {
  const id = s?.ui?.season;
  const offered = offeredSeasonsOf(s);
  if (offered.includes(id)) return id;
  const newest = newestPublicSeason();
  return offered.includes(newest) ? newest : DEFAULT_SEASON;
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

/**
 * Follow the season on screen (main.js: data.js setSeason, loadoutSync.js setLoadoutSeason): `apply` runs at once with
 * the season the page booted in, then on every change. The boot's season is set before this is installed (the remembered
 * pick or the newest public season, offeredSeasonsOf), so no store change announces it: following changes alone left a
 * reloaded 规程 page reading 盟约's data, loadout and records (S.W.E.E.P.报告, 干员调配, 成就统计) and creating a
 * 规程 room with them, since that room's season is the one already on screen.
 * @param {(season: string) => unknown} apply @param {typeof store} [target]
 * @returns {() => void}
 */
export function followActiveSeason(apply, target = store) {
  let last = activeSeason(target.get());
  apply(last);
  return target.subscribe((s) => {
    const next = activeSeason(s);
    if (next === last) return;
    last = next;
    apply(next);
  });
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

/**
 * The browser tab's title for a season (maintainer decision 2026-11-13: it follows the season on screen; index.html's
 * static one is 盟约's). @param {string} id
 */
export const seasonTitle = (id) => (seasonOf(id) === DEFAULT_SEASON
  ? t('卫戍协议：盟约 · STRONGHOLD PROTOCOL')
  : t('卫戍协议：{season} · STRONGHOLD PROTOCOL', { season: seasonName(id) }));

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
 * The season an invitation waits in (ui.pendingSeason): the link's `&season=`, else 盟约 — inviteLink leaves the
 * parameter out for a 盟约 room, so a link without one must not show the newest season a new visitor opens in.
 * @param {string} search @param {boolean} invited a room link (`?room=`)
 * @returns {string | null}
 */
export function inviteSeasonOf(search, invited) {
  return invited ? (parseSeasonParam(search) ?? DEFAULT_SEASON) : null;
}

/**
 * Wire the picker once (main.js): the first pong's `seasons`, and the pick following a room of another season.
 * @param {{ net: any, target?: typeof store, notify?: (text: string) => void }} deps
 */
export function installSeasons({ net, target = store, notify = (text) => toast(text, 'info', { ttl: 5000 }) }) {
  const offPong = net.on('pong', (m) => {
    // the first pong names the seasons only when there are several (Lobby.connectInfo): a first pong without them
    // means the default alone; later pongs never carry them
    if (!Array.isArray(m?.seasons)) {
      if (!Array.isArray(target.get().ui.seasons)) target.patch('ui', { seasons: [DEFAULT_SEASON] });
      return;
    }
    const list = m.seasons.filter(isSeasonId);
    if (!shallowEqual(list, target.get().ui.seasons || [])) target.patch('ui', { seasons: list.length ? list : [DEFAULT_SEASON] });
  });
  // the tab's title names the season on screen, in the current language (ui/lang.js applies it on a switch too)
  setDocTitle(() => seasonTitle(activeSeason(target.get())));
  const offTitle = target.subscribe((s, prev) => {
    if (activeSeason(s) !== activeSeason(prev) && globalThis.document) globalThis.document.title = seasonTitle(activeSeason(s));
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
  return () => { offPong?.(); offStore?.(); offTitle?.(); };
}

/** The NEW mark of a season other than the default. @param {{ id: string }} p */
function NewMark({ id }) {
  return id === DEFAULT_SEASON ? null : html`<span class="season-new">NEW</span>`;
}

/** The line of the title's invitation card naming the room's season, when the link names another than the picked one. */
export function InviteSeason() {
  const st = useStore((s) => ({ offered: hasSeasonPicker(s), invite: activeSeason(s), picked: pickedSeason(s) }), shallowEqual);
  if (!st.offered || st.invite === st.picked) return null;
  return html`<span class="title-invite__season">${t('该同盟属于「{season}」赛季，将以该赛季加入', { season: seasonName(st.invite) })}</span>`;
}

/**
 * The lobby top bar's season chip and its menu (the waiting Doctors of each season come from lobby.queueCounts): the one
 * place a season is picked. `onPick` makes the pick (the lobby passes ui/seasonFade.js pickSeasonThroughDark).
 * @param {{ onPick?: (id: string) => unknown }} props
 */
export function SeasonChip({ onPick = pickSeason }) {
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
  const choose = (id) => { setOpen(false); if (id !== st.picked) onPick(id); };
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
 * The room's season, the first part of its mode bar (screens/room.js), read-only (maintainer decision 2026-11-07: a room
 * keeps the season it was created in): while several seasons are offered or the room's is not the default. The room's
 * top bar no longer repeats it (maintainer decision 2026-11-08).
 */
export function RoomSeasonSeg() {
  const st = useStore((s) => ({ season: seasonOf(s.room?.season), shown: hasSeasonPicker(s) || seasonOf(s.room?.season) !== DEFAULT_SEASON }), shallowEqual);
  if (!st.shown) return null;
  return html`<${SeasonSeg} season=${st.season} testid="room-season" />`;
}

/**
 * A season as the first part of a mode capsule (the room's mode bar, a public room of another season in the 同盟匹配
 * list: ui/modeCapsule.js): its name, 规程 in gold. @param {{ season: unknown, testid?: string | null }} p
 */
export function SeasonSeg({ season, testid = null }) {
  const id = seasonOf(season);
  return html`<span class=${`rs-mode__seg rs-mode__season${id !== DEFAULT_SEASON ? ' is-new' : ''}`} data-testid=${testid}
    title=${t('赛季')}>${seasonName(id)}</span>`;
}

/** shallowEqual that compares one level of arrays inside (the `offered` list). */
function shallowEqualDeep(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => (Array.isArray(a[k]) && Array.isArray(b[k]) ? shallowEqual(a[k], b[k]) : Object.is(a[k], b[k])));
}
