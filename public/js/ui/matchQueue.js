// 랜덤 매칭 on the client (server/matchmaking.js has the rules): the lobby's 同盟匹配 card queues the player alone for the
// selected difficulty (co-op). While queued, a dialog shows the waiting time, how many Doctors wait for that difficulty
// and the cancel button. When a group of four forms, every member gets the confirmation dialog (room.matchFound, its own
// countdown); a public room the queue found (room.matchFound `room`, server/matchmaking.js 「공개방」) is offered to the
// player alone, the confirmation naming the room — host, mode capsule, seats, a custom room's settings (ui/modeCapsule.js).
// The waiting itself is no dialog where the lobby's 同盟匹配 screen is open (maintainer decision 2026-11-20, the public
// room mockup's sixth round: the dialog covered the public list, which a queued player may use): QueueWait stands in
// the screen's start button's place — the clock, the Doctors found, 取消匹配, after a minute 以公开联合等待 — with the
// target capsule (所有赛季 or the season, 规则, 难度, 人数) over it, the picks locked; MatchQueueDialog `inline` then
// draws only the confirmation and the vote. Elsewhere (the screen closed while queued, a resumed session on the hub)
// the waiting dialog stays. The confirmation of a public room always names its season (FoundRoom).
// Any room.state closes it (the player took a seat: the group's room, the offered room, a room of the public list —
// ui/publicRooms.js); a welcome that starts a new server session forgets it (the server's queue is gone). A room no
// longer queues (room.queueRoom is gone, maintainer decision 2026-11-20: a public room does its work). lobby.rooms (the
// public room list) → store ui.publicRooms; lobby.queueCounts `rooms` ({ [season]: n }, the public rooms waiting) → store
// ui.queueRooms (the hub's 「公开房间 N」, every season summed).
//
// The queues are per difficulty AND 规则 모드 (shared/ruleset.js; maintainer decision 2026-10-15): room.queue carries the
// lobby's ruleset, the dialogs name it, and every Doctor in the lobby gets the waiting counts of every queue
// (lobby.queueCounts → store ui.queueCounts, shown by screens/lobby.js through ui/ruleset.js).
//
// The 8-player mode (maintainer decisions 2026-10-16, 2026-10-19) has queues of its own: room.queue { size: 8 }, every
// message about such a queue carries `size: 8` (kept as ui.queue.size) and lobby.queueCounts their counts as `counts8`
// (store ui.queueCounts8); the dialogs count to the queue's size. With LARGE_MIN_PLAYERS (5) or more waiting in an 8-player
// queue, the waiting dialog (and a queued room's bar, screens/room.js) offers 「바로 시작」 (room.queueVote, maintainer decision
// 2026-11-02): every waiting Doctor gets the vote (room.matchFound `vote`) in the confirmation's place, a no keeps the
// place in the queue, and the room.queueState that follows a vote says how it ended (`vote`: 'failed' / 'started').
//
// 快速匹配 (maintainer decision 2026-11-07; docs/rules/ui.md 「랜덤 매칭」 「빠른 매칭」): room.queue { difficulty, quick: true }
// queues alone for any ruleset and room size of the difficulty; its queueState has `quick` and no ruleset / size, its
// count is the whole difficulty's pool, and room.matchFound names the group's ruleset and size (+ quick: true).
// lobby.queueCounts `quick` = { [difficulty]: n } of the quick queue alone (store ui.queueQuick; the other seasons' in
// `seasons[id].quick`).
//
// store ui.queue: null, or { difficulty, ruleset, size, quick, season, anySeason, count, since, custom, found } — since in
// this page's clock (season: the queue's, absent in room.queueState = the default; anySeason: room.queueState
// `anySeason`, the queue takes every season's public rooms — the list's drop-down on 所有赛季 when it joined);
// found: null or { players, accepted, mine, deadline, total, room, season, vote } (deadline in server time for components.js
// Countdown, total = the window's seconds for its gauge; room: a public room's offer, null for a group; season: the
// offer's (room.matchFound `season`, absent = the default); vote: null, or { need, declined, no, by } of a 「바로 시작」 vote).
//
// 以公开联合等待 (maintainer decisions 2026-11-20): a queue needs exactly four (eight) Doctors, so with few online two
// may wait on and on. After PUBLIC_OFFER_MS of waiting the dialog offers to open a public room instead (a line and the
// button, `onPublic` — the lobby's openPublicRoom: out of the queue, room.create { public: true } of the queue's
// difficulty, ruleset and size — a 快速匹配 queue's the lobby's remembered ones —, 满员自动开始 on): the next Doctor who
// matches comes in, and AI teammates may fill the rest. Only where the lobby passes `onPublic`.
//
// Sounds (maintainer decision 2026-10-14, docs/rules/audio.md 「랜덤 매칭·방 알림음」): the official matching sounds
// (queueCue), and while ui.queue is set the page keeps its audio running in a hidden tab (audio.keepAwake) and a group
// that forms while the tab is hidden blinks the tab title until the player comes back (flashTitle).

import { useEffect, useReducer, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, LARGE_MIN_PLAYERS, MAX_SEATS, modeIdFor, seatsOf } from '../../../shared/constants.js';
import { html, Button, Countdown, Modal, Spinner, useTicker } from './components.js';
import { toast, toastError } from './toasts.js';
import { net } from '../net.js';
import { store, useStore, serverNow } from '../store.js';
import { audio } from '../audio.js';
import { t, N_ } from '../../../shared/i18n.js';
import { presetName } from './ruleset.js';
import { customSummary } from './customSummary.js';
import { customDiffs, officialBans } from '../../../shared/ruleset.js';
import { data, getMode } from '../data.js';
import { pickedSeason, seasonFields, seasonName } from './season.js';
import { seasonOf } from '../../../shared/seasons.js';
import { ModeCapsule, RoomSeats } from './modeCapsule.js';

/** Why the server took the player out of the queue (room.queueState queued:false reason); 'left' / 'declined' say nothing. @type {Readonly<Record<string, string>>} */
const LEFT_REASON = {
  timeout: N_('未在时限内确认，已退出匹配'),
  offline: N_('连接中断，已退出匹配'),
  restarting: N_('服务器即将重启，匹配已取消'),
  full: N_('服务器同盟数量已满，匹配已取消'),
  room: N_('你已加入同盟，匹配已取消'),
};

/** The toast text for a queued:false message, or null. @param {{ reason?: string } | null | undefined} msg */
export function leftText(msg) {
  const text = LEFT_REASON[/** @type {string} */ (msg?.reason)];
  return text ? t(text) : null;
}

const setQueue = (/** @type {Record<string, unknown> | null} */ queue) => store.patch('ui', { queue });

/**
 * The sound of a queue message (sfx.ui key), from the official matching view (client AutoChessMatchingView: a SUCCESS
 * result plays ON_ACT1AUTOCHESS_MATCH_SUCCEED, a TIMEOUT ON_ACT1AUTOCHESS_MATCH_FAIL, a CANCEL nothing):
 * - matchSucceed: a group formed — the first room.matchFound; the later ones only update the accept count;
 * - matchFail: the search failed without the player's doing — back in the queue from a group, or taken out for any
 *   reason but their own (this remake has no search timeout; its failures are a teammate's decline, a timeout of the
 *   confirmation, a member leaving the room, the server);
 * - matchCancel: the player's own cancel or decline [ASSUMED: the client data has the MATCH_CANCEL bank, but no client
 *   code plays it];
 * - null: nothing (a queue update, or a message for a page that was not queued).
 * @param {'room.queueState'|'room.matchFound'} kind @param {{ found?: unknown } | null | undefined} prev ui.queue before the message @param {{ queued?: boolean, reason?: string } | null | undefined} msg
 * @returns {'matchSucceed'|'matchFail'|'matchCancel'|null}
 */
export function queueCue(kind, prev, msg) {
  if (kind === 'room.matchFound') return prev?.found ? null : 'matchSucceed';
  if (kind !== 'room.queueState' || !prev) return null;
  if (msg?.queued) return prev.found ? 'matchFail' : null;
  return msg?.reason === 'left' || msg?.reason === 'declined' ? 'matchCancel' : 'matchFail';
}

/** The tab title blinking while a formed group waits for a player on another tab (stops on return or when it ends). */
/** @type {{ stop: () => void } | null} */
let titleFlash = null;
/** @param {string} text */
function flashTitle(text) {
  const doc = globalThis.document;
  if (!doc?.hidden || titleFlash) return;
  const base = doc.title;
  let on = true;
  doc.title = text;
  const timer = setInterval(() => { on = !on; doc.title = on ? text : base; }, 1000);
  const onVis = () => { if (!doc.hidden) stopTitleFlash(); };
  doc.addEventListener('visibilitychange', onVis);
  titleFlash = { stop: () => { clearInterval(timer); doc.removeEventListener('visibilitychange', onVis); doc.title = base; } };
}
function stopTitleFlash() {
  titleFlash?.stop();
  titleFlash = null;
}

const cue = (/** @type {string | null} */ key) => { if (key) audio.sfx(key); };
/** The confirmation's countdown cue at its last 5 s, for a player who has not answered yet (Countdown onWarn). */
const timerCue = () => audio.sfx('timer');

/** Wire the queue messages into the store (main.js, once). @param {{ net?: { on: Function } }} [deps] */
export function installMatchQueue({ net: n = net } = {}) {
  n.on('room.queueState', (/** @type {Record<string, any>} */ msg) => { // any: a server message, read field by field
    const prev = store.get().ui.queue;
    cue(queueCue('room.queueState', prev, msg));
    if (!msg.queued) {
      setQueue(null);
      const text = leftText(msg);
      if (text) toast(text, 'warn');
      return;
    }
    // back in the queue from a group: someone did not accept; from a 「바로 시작」 vote: how it ended (a public room's
    // offer declined, run out or withdrawn: the waiting goes on without a word)
    if (msg.vote === 'started') toast(t('赞成的 {n} 名博士已先行开始，继续匹配', { n: msg.started ?? 0 }), 'info');
    else if (msg.vote === 'failed') toast(t('赞成未满 {n} 名，继续匹配', { n: LARGE_MIN_PLAYERS }), 'info');
    else if (prev?.found && !prev.found.room) toast(t('有博士未接受，继续匹配'), 'info');
    setQueue({ difficulty: msg.difficulty, ruleset: msg.ruleset ?? null, size: seatsOf(msg.size), quick: msg.quick === true, season: seasonOf(msg.season),
      anySeason: msg.anySeason === true, count: msg.count ?? 1, since: Date.now() - (msg.waitedMs ?? 0), found: null });
  });
  n.on('room.matchFound', (/** @type {Record<string, any>} */ msg) => { // any: a server message, read field by field
    const prev = store.get().ui.queue;
    cue(queueCue('room.matchFound', prev, msg));
    if (!prev?.found) flashTitle(msg.vote ? t('提前开始投票') : t('匹配成功'));
    setQueue({
      ...(prev || { difficulty: msg.difficulty, ruleset: msg.ruleset ?? null, size: seatsOf(msg.size), count: msg.players, since: Date.now() }),
      // a 快速匹配 Doctor's group has the ruleset and size of the queue it filled: the confirmation names them
      ...(msg.quick === true ? { quick: true, ruleset: msg.ruleset ?? null, size: seatsOf(msg.size) } : {}),
      // a custom public room's seats (server/matchmaking.js): its settings, so the 快速匹配 Doctor sees what they accept
      ...(msg.custom && typeof msg.custom === 'object' ? { custom: msg.custom } : { custom: null }),
      found: { players: msg.players, accepted: msg.accepted, mine: !!msg.mine, deadline: serverNow() + msg.inMs,
        room: msg.room && typeof msg.room === 'object' ? msg.room : null, season: seasonOf(msg.season),
        total: prev?.found?.total ?? Math.max(1, Math.ceil(msg.inMs / 1000)),
        vote: msg.vote ? { need: msg.need ?? LARGE_MIN_PLAYERS, declined: msg.declined ?? 0, no: !!msg.no, by: typeof msg.by === 'string' ? msg.by : null } : null },
    });
  });
  // a seat taken (the group's room, an offered public room, the list's 参加): the queue is over
  n.on('room.state', () => { if (store.get().ui.queue) setQueue(null); });
  // the public room list (ui/publicRooms.js), while 同盟匹配's screen watches it
  n.on('lobby.rooms', (/** @type {{ rooms?: unknown }} */ msg) => store.patch('ui', { publicRooms: Array.isArray(msg.rooms) ? msg.rooms : [] }));
  // the waiting Doctors of every queue (the lobby's 同盟匹配 card): { [ruleset]: { [difficulty]: n } }, of the 8-player queues too
  const countsOf = (/** @type {unknown} */ c) => (c && typeof c === 'object' ? c : null);
  // (the other offered 卫戍协议 seasons' in `seasons`: ui/season.js seasonQueueCounts)
  n.on('lobby.queueCounts', (/** @type {Record<string, unknown>} */ msg) => store.patch('ui', { queueCounts: countsOf(msg.counts), queueCounts8: countsOf(msg.counts8), queueQuick: countsOf(msg.quick), queueCountsBy: countsOf(msg.seasons),
    queueRooms: countsOf(msg.rooms) }));
  n.on('welcome', (/** @type {{ resumed?: boolean }} */ msg) => { if (!msg.resumed && store.get().ui.queue) setQueue(null); });
  // while queued the page's audio stays up in a hidden tab; the title blink ends with its group
  store.subscribe((s, prev) => {
    const q = s.ui.queue;
    if (q === prev?.ui?.queue) return;
    audio.keepAwake(!!q);
    if (!q?.found) stopTitleFlash();
  });
}

/**
 * room.queue for the difficulty, ruleset, alliance size and season (the lobby's 开始匹配 button; `size` only for an
 * 8-player queue, `season` only for another than the default: ui/season.js seasonFields; `anySeason`: every season's
 * public rooms are candidates — the list's drop-down on 所有赛季, ui/publicRooms.js queueTarget).
 * @param {string} difficulty @param {string | null | undefined} ruleset @param {number} [size] @param {string | null} [season]
 * @param {boolean} [anySeason]
 * @returns {Promise<unknown>}
 */
export const joinQueue = (difficulty, ruleset, size = MAX_SEATS, season = null, anySeason = false) =>
  net.request('room.queue', { difficulty, ...(ruleset ? { ruleset } : {}), ...(size !== MAX_SEATS ? { size } : {}), ...(season ? seasonFields(season) : {}),
    ...(anySeason ? { anySeason: true } : {}) });

/**
 * room.queue for 快速匹配: the difficulty (and season, anySeason as joinQueue) alone.
 * @param {string} difficulty @param {string | null} [season] @param {boolean} [anySeason] @returns {Promise<unknown>}
 */
export const joinQuickQueue = (difficulty, season = null, anySeason = false) =>
  net.request('room.queue', { difficulty, quick: true, ...(season ? seasonFields(season) : {}), ...(anySeason ? { anySeason: true } : {}) });

/** room.queueVote: propose 「바로 시작」 in the 8-player queue the player waits in (header). @returns {Promise<unknown>} */
export const proposeStart = () => net.request('room.queueVote', {});

/** Whether a queue offers 「바로 시작」: an 8-player queue with LARGE_MIN_PLAYERS or more waiting, no group pending. @param {{ found?: unknown, size?: unknown, count?: number } | null | undefined} queue */
export const canProposeStart = (queue) => !!queue && !queue.found && seatsOf(queue.size) > MAX_SEATS && (queue.count ?? 0) >= LARGE_MIN_PLAYERS;

/** How long a queue waits before the dialog offers 以公开联合等待 (header; maintainer decision 2026-11-20: a minute). */
export const PUBLIC_OFFER_MS = 60_000;

/** m:ss of a waiting time. @param {number} ms */
export const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * A custom room's settings in the confirmation (maintainer decision 2026-11-07): how many differ from the official rules
 * of the difficulty and room size, and the summary lines (ui/customSummary.js), as the room's invitation lists them.
 * The names, leader groups and official counts come from the room's season (`season`; absent = the page's): a room of
 * another season in the public list reads that season's store (data.seasonStore), whose leaders and bonds the page's
 * files lack. Until the files have loaded a name is its id: the caller holds useCustomNames(season).
 * @param {unknown} custom the room's custom settings (room.matchFound `custom`)
 * @param {string} difficulty @param {number} size @param {unknown} [season] the room's season (row.season)
 * @returns {{ n: number, lines: string[], items: ReturnType<typeof customSummary> }}
 */
export function customFound(custom, difficulty, size, season) {
  const st = customStore(season);
  const cfg = st.get('config');
  const mode = DIFFICULTIES.includes(difficulty) ? getMode(modeIdFor('coop', difficulty), cfg) : null;
  const rounds = Number.isInteger(mode?.lastRound) ? mode.lastRound : null;
  const bans = officialBans(cfg, difficulty, size);
  // stages, 特训敌人 types and leaders: the room's season first, then whichever public season lends it (data.lendable)
  const own = { stage: (/** @type {string} */ id) => st.lookup('stages', id), type: (/** @type {string} */ id) => st.get('factions')?.types?.[id] };
  /** @type {Record<string, (id: string) => { name?: string, hidden?: boolean } | null | undefined>} */
  const lookup = { bond: (id) => st.lookup('bonds', id), boss: (id) => st.lookup('bosses', id) ?? data.lendable('bosses', id),
    stage: (id) => own.stage(id) ?? data.lendable('stages', id), type: (id) => own.type(id) ?? data.lendable('types', id) };
  const lines = customSummary(custom, { bans, rounds, name: (kind, id) => lookup[kind](id)?.name || id, hidden: (id) => !!lookup.boss(id)?.hidden });
  return { n: customDiffs(custom, { bans, rounds }).length, lines: lines.map((l) => l.text), items: lines };
}

/** The files customFound reads. */
export const CUSTOM_NAME_FILES = Object.freeze(['config', 'bonds', 'bosses', 'stages', 'factions']);

/** The data store of a room's season: the page's own (`data`) for its season or none given, else that season's peer. @param {unknown} season */
export function customStore(season) {
  if (season == null || seasonOf(season) === data.season()) return data;
  return data.seasonStore(seasonOf(season)) ?? data;
}

/**
 * Preact hook for a custom room's summary (customFound): start loading CUSTOM_NAME_FILES in the room's season's store
 * and re-render as they arrive — the lobby alone never loads the bonds, leaders or stages (main.js warmGameData).
 * @param {unknown} [season]
 */
export function useCustomNames(season) {
  const st = customStore(season);
  const [, force] = useReducer(/** @type {(c: number, a: void) => number} */ ((c) => c + 1), 0);
  useEffect(() => {
    let alive = true;
    const unsub = st.subscribe((/** @type {string} */ n) => { if (alive && CUSTOM_NAME_FILES.includes(n)) force(); });
    for (const n of CUSTOM_NAME_FILES) st.load(n);
    return () => { alive = false; unsub(); };
  }, [st]);
}

/**
 * The queue dialog (rendered by the lobby and room screens while ui.queue is set): the waiting dialog for a player
 * queued alone, the confirmation for everyone once a group formed (a queued room's waiting state is in its room bar).
 * @param {{ onPublic?: ((queue: Record<string, unknown>) => unknown) | null, inline?: boolean }} props
 */
export function MatchQueueDialog({ onPublic = null, inline = false }) {
  const queue = useStore((s) => s.ui.queue);
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  useTicker(queue && !queue.found && !inline ? 500 : 0);
  // `inline`: the lobby's 同盟匹配 screen shows the waiting (QueueWait, header); the confirmation and the vote stay here
  if (!queue || (inline && !queue.found)) return null;
  const go = async (/** @type {string} */ kind, /** @type {() => unknown} */ fn) => {
    if (busy) return;
    setBusy(kind);
    try { await fn(); } catch (err) { toastError(err); } finally { setBusy(null); }
  };
  const run = (/** @type {string} */ kind, /** @type {{ t: string, [key: string]: unknown }} */ msg) => go(kind, () => net.request(msg.t, msg));
  const cancel = () => run('cancel', { t: 'room.unqueue' });
  const cap = seatsOf(queue.size);
  // waiting for 快速匹配: no ruleset or size yet; once a group forms its ruleset and size (「经典 · 4人」)
  const quickWait = queue.quick && !queue.found;
  const name = t(/** @type {Record<string, string>} */ (DIFFICULTY_NAMES)[queue.difficulty] || queue.difficulty) + (quickWait ? ` · ${t('快速匹配')}`
    : (queue.ruleset ? ` · ${presetName(queue.ruleset)}` : '') + (queue.quick || cap !== MAX_SEATS ? ` · ${t('{n}人', { n: cap })}` : ''))
    + (queue.quick && queue.found ? ` · ${t('快速匹配')}` : '');

  if (queue.found?.vote) {
    const f = queue.found, v = f.vote;
    const answered = f.mine || v.no;
    return html`<${Modal} open=${true} tone="amber" micro="START NOW" title=${t('提前开始投票')} closeOnBackdrop=${false} class="queue-dialog"
      actions=${answered
        ? html`<span class="queue-dialog__wait"><${Spinner} size="sm" />${f.mine ? t('已赞成 · 等待其他博士投票…') : t('已反对 · 等待其他博士投票…')}</span>`
        : html`<${Button} variant="secondary" loading=${busy === 'decline'} onClick=${() => run('decline', { t: 'room.queueAccept', accept: false })}>${t('继续等待')}<//>
          <${Button} variant="primary" icon="play" loading=${busy === 'accept'} onClick=${() => run('accept', { t: 'room.queueAccept', accept: true })}>${t('赞成开始')}<//>`}>
      <div class="queue-dialog__body">
        <${Countdown} deadline=${f.deadline} total=${f.total} warnAt=${5} label="VOTE" onWarn=${answered ? null : timerCue} />
        <div class="queue-dialog__lines">
          <span class="queue-dialog__mode">${t('同盟模拟')} · ${name}</span>
          <span>${v.by ? t('{name} 提议以当前人数开始', { name: v.by }) : t('有博士提议以当前人数开始')}</span>
          <span class="t-lo">${t('赞成 {yes} · 反对 {no} / {players}', { yes: f.accepted, no: v.declined, players: f.players })}</span>
          <span class="t-lo">${t('满 {n} 名赞成即由赞成的博士开始，其余博士继续匹配', { n: v.need })}</span>
        </div>
      </div>
    <//>`;
  }

  if (queue.found) {
    const f = queue.found;
    return html`<${Modal} open=${true} tone="amber" micro="MATCH FOUND" title=${t('匹配成功')} closeOnBackdrop=${false} class="queue-dialog"
      actions=${f.mine
        ? html`<span class="queue-dialog__wait"><${Spinner} size="sm" />${t('等待其他博士确认…')}</span>`
        : html`<${Button} variant="secondary" loading=${busy === 'decline'} onClick=${() => run('decline', { t: 'room.queueAccept', accept: false })}>${t('拒绝')}<//>
          <${Button} variant="primary" icon="check" loading=${busy === 'accept'} onClick=${() => run('accept', { t: 'room.queueAccept', accept: true })}>${t('接受')}<//>`}>
      <div class="queue-dialog__body">
        <${Countdown} deadline=${f.deadline} total=${f.total} warnAt=${5} label="CONFIRM" onWarn=${f.mine ? null : timerCue} />
        <div class="queue-dialog__lines">
          <span class="queue-dialog__mode">${t('同盟模拟')} · ${name}${queue.anySeason ? ` · ${t('所有赛季')}` : ''}</span>
          ${f.room ? html`<${FoundRoom} room=${f.room} season=${f.season} difficulty=${queue.difficulty} />`
            : html`<span>${t('{players} 名博士', { players: f.players })}</span>
              <span class="t-lo">${t('已接受 {accepted}/{players}', { accepted: f.accepted, players: f.players })}</span>`}
          ${queue.custom ? html`<${FoundCustom} custom=${queue.custom} difficulty=${queue.difficulty} size=${cap} season=${f.season} />` : null}
        </div>
      </div>
    <//>`;
  }

  // 以公开联合等待 (header) after a minute of waiting
  const late = !!onPublic && Date.now() - queue.since >= PUBLIC_OFFER_MS;
  return html`<${Modal} open=${true} micro="MATCHMAKING" title=${t('正在匹配同盟…')} closeOnBackdrop=${false} onClose=${cancel} class="queue-dialog"
    actions=${html`<${Button} variant="secondary" icon="close" loading=${busy === 'cancel'} onClick=${cancel}>${t('取消匹配')}<//>
      ${canProposeStart(queue) ? html`<${Button} variant="primary" icon="play" loading=${busy === 'vote'} onClick=${() => run('vote', { t: 'room.queueVote' })}>${t('提议提前开始')}<//>` : null}
      ${late ? html`<${Button} variant="primary" icon="signal" loading=${busy === 'public'} data-testid="queue-public"
        onClick=${() => go('public', () => onPublic(queue))}>${t('以公开联合等待')}<//>` : null}`}>
    <div class="queue-dialog__body">
      <div class="queue-dialog__clock num">${mmss(Date.now() - queue.since)}</div>
      <div class="queue-dialog__lines">
        <span class="queue-dialog__mode">${t('同盟模拟')} · ${name}</span>
        ${quickWait ? html`<span>${t('同难度等待中的博士：{count}', { count: queue.count })}</span>
          <span class="t-lo">${t('规则、人数不限，进入空位')}</span>`
        : html`<span>${t('排队中的博士：{count}/{n}', { count: Math.min(cap, queue.count), n: cap })}</span>
          <span class="t-lo">${t('凑齐 {n} 名博士后开始', { n: cap })}</span>`}
        ${cap > MAX_SEATS ? html`<span class="t-lo">${t('满 {n} 名可投票提前开始', { n: LARGE_MIN_PLAYERS })}</span>` : null}
        ${late ? html`<span class="queue-dialog__offer" data-testid="queue-public-line">${t('超过 1 分钟仍未凑齐 · 以公开联合等待，同条件匹配的博士会加入，空位也可由 AI 队友补上')}</span>` : null}
      </div>
    </div>
  <//>`;
}

/**
 * The waiting of a player queued alone in 同盟匹配's screen (screens/lobby.js ProtocolSelect `wait`, header; the public
 * room mockup's W1, maintainer decision 2026-11-20): the hint line — the list stays usable and joining from it leaves
 * the queue; after PUBLIC_OFFER_MS the amber offer —, in the range switch's place the target (匹配对象 + the capsule:
 * 所有赛季 or the queue's season, its ruleset or 快速匹配, the difficulty, the size), and in the start button's box the
 * clock, 正在寻找博士 with the count, and 取消匹配. After the minute the box holds 以公开联合等待 (`onPublic`) with 取消匹配
 * as its icon alone; an 8-player queue's 提议提前开始 (canProposeStart) takes that place first.
 * @param {{ onPublic?: ((queue: Record<string, unknown>) => unknown) | null }} props
 */
export function QueueWait({ onPublic = null }) {
  const queue = useStore((s) => s.ui.queue);
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  useTicker(queue && !queue.found ? 500 : 0);
  if (!queue) return null;
  const go = async (/** @type {string} */ kind, /** @type {() => unknown} */ fn) => {
    if (busy) return;
    setBusy(kind);
    try { await fn(); } catch (err) { toastError(err); } finally { setBusy(null); }
  };
  const cancel = () => go('cancel', () => net.request('room.unqueue', {}));
  const cap = seatsOf(queue.size);
  const late = !!onPublic && Date.now() - queue.since >= PUBLIC_OFFER_MS;
  const primary = canProposeStart(queue)
    ? html`<${Button} variant="primary" icon="play" loading=${busy === 'vote'} data-testid="queue-vote" onClick=${() => go('vote', () => net.request('room.queueVote', {}))}>${t('提议提前开始')}<//>`
    : late ? html`<${Button} variant="primary" icon="signal" loading=${busy === 'public'} data-testid="queue-public"
      onClick=${() => go('public', () => onPublic(queue))}>${t('以公开联合等待')}<//>` : null;
  const count = queue.quick ? t('同难度 {count} 名 · 规则、人数不限', { count: queue.count })
    : cap > MAX_SEATS ? t('{count}/{n} · 满 {m} 名可投票提前开始', { count: Math.min(cap, queue.count), n: cap, m: LARGE_MIN_PLAYERS })
      : t('{count}/{n} · 凑齐 {n} 名后开始', { count: Math.min(cap, queue.count), n: cap });
  return [
    html`<p key="h" class="proto-hint">${late
      ? html`<span class="proto-wait__offer" data-testid="queue-public-line">${t('超过 1 分钟仍未凑齐 · 以公开联合等待，同条件匹配的博士会加入')}</span>`
      : html`<span data-testid="queue-wait-hint">${t('匹配中也可使用列表 · 从列表加入将退出匹配')}</span>`}</p>`,
    html`<div key="t" class="proto-target" data-testid="queue-target"><span class="proto-target__k">${t('匹配对象')}</span>
      <${ModeCapsule} season=${queue.anySeason ? 'all' : queue.season} quick=${queue.quick} ruleset=${queue.ruleset} difficulty=${queue.difficulty}
        size=${queue.quick ? null : cap} testid="queue-target-capsule" /></div>`,
    html`<div key="w" class=${`proto-wait${primary ? ' has-action' : ''}`} data-testid="queue-wait">
      <span class="proto-wait__deco" aria-hidden="true"></span>
      <span class="proto-wait__clock num" data-testid="queue-clock">${mmss(Date.now() - queue.since)}</span>
      ${primary ? null : html`<span class="proto-wait__lines"><b data-testid="queue-search"><${Spinner} size="sm" />${t('正在寻找博士')}</b><span>${count}</span></span>`}
      ${primary}
      <${Button} variant="secondary" icon="close" loading=${busy === 'cancel'} data-testid="queue-cancel" aria-label=${t('取消匹配')} onClick=${cancel}>${primary ? null : t('取消匹配')}<//>
    </div>`,
  ];
}

/**
 * A public room the queue found (room.matchFound `room`, server/matchmaking.js 「공개방」): its host (name #번호), mode
 * capsule and seats, as the public room list draws them (ui/modeCapsule.js); the host starts the match. The capsule
 * always has the room's season part (maintainer decision 2026-11-20: with 所有赛季 the season always matters), and a
 * room of another season than the page's says that accepting switches to it (ui/season.js installSeasons does).
 * @param {{ room: Record<string, any>, season: unknown, difficulty: string }} props (any: a server room record)
 */
function FoundRoom({ room, season, difficulty }) {
  const size = seatsOf(room.size);
  const page = useStore(pickedSeason);
  return html`<div class="queue-dialog__room" data-testid="found-room">
    <span class="queue-dialog__host"><b>${room.host?.name || t('博士')}</b><small class="num">#${room.host?.no ?? ''}</small><span class="t-lo">${t('的公开联合')}</span></span>
    <${ModeCapsule} season=${season} ruleset=${room.ruleset?.preset} difficulty=${difficulty} size=${size} testid="found-capsule" />
    <${RoomSeats} seats=${room.seats} size=${size} />
    <span class="t-lo">${t('接受后加入该联合，由创建者开始模拟')}</span>
    ${seasonOf(season) !== seasonOf(page) ? html`<span class="queue-dialog__offer" data-testid="found-switch">${t('接受后将切换到「{season}」赛季', { season: seasonName(season) })}</span>` : null}
  </div>`;
}

/**
 * The confirmation's custom block: 「自定义 · 与官方不同的设置 n 项」 and the lines (customFound).
 * @param {{ custom: unknown, difficulty: string, size: number, season: unknown }} props
 */
function FoundCustom({ custom, difficulty, size, season }) {
  useCustomNames(season);
  const { n, lines } = customFound(custom, difficulty, size, season);
  return html`<div class="queue-dialog__custom" data-testid="found-custom">
    <b>${presetName('custom')} · ${t('与官方不同的设置 {n} 项', { n })}</b>
    ${lines.length ? html`<ul>${lines.map((l, i) => html`<li key=${i}>${l}</li>`)}</ul>` : null}
  </div>`;
}
