// 랜덤 매칭 on the client (server/matchmaking.js has the rules): the lobby's 同盟匹配 card queues the player alone for the
// selected difficulty (co-op), and a co-op room's host queues the room's humans for its empty seats (the room screen's
// 匹配补位 button, room.queueRoom). While queued alone, a dialog shows the waiting time, how many Doctors wait for that
// difficulty and the cancel button; a queued room shows the same in the room screen's bar instead (room.state
// `matching`, screens/room.js). When a group of four forms, every member gets the confirmation dialog
// (room.matchFound, its own countdown). The match's room.state closes it (the room / game screen follows); a welcome
// that starts a new server session forgets it (the server's queue is gone).
//
// The queues are per difficulty AND 规则 모드 (shared/ruleset.js; maintainer decision 2026-10-15): room.queue carries the
// lobby's ruleset, the dialogs name it, and every Doctor in the lobby gets the waiting counts of every queue
// (lobby.queueCounts → store ui.queueCounts, shown by screens/lobby.js through ui/ruleset.js).
//
// The 8-player mode (maintainer decisions 2026-10-16, 2026-10-19) has queues of its own: room.queue { size: 8 }, every
// message about such a queue carries `size: 8` (kept as ui.queue.size) and lobby.queueCounts their counts as `counts8`
// (store ui.queueCounts8); the dialogs count to the queue's size.
//
// store ui.queue: null, or { difficulty, ruleset, size, count, since, party, found } — since in this page's clock; party = queued with
// the room; found: null or { players, accepted, mine, deadline, total } (deadline in server time for components.js
// Countdown, total = the window's seconds for its gauge).
//
// Sounds (maintainer decision 2026-10-14, docs/rules/audio.md 「랜덤 매칭·방 알림음」): the official matching sounds
// (queueCue), and while ui.queue is set the page keeps its audio running in a hidden tab (audio.keepAwake) and a group
// that forms while the tab is hidden blinks the tab title until the player comes back (flashTitle).

import { useState } from '../../vendor/hooks.module.js';
import { DIFFICULTY_NAMES, MAX_SEATS, seatsOf } from '../../../shared/constants.js';
import { html, Button, Countdown, Modal, Spinner, useTicker } from './components.js';
import { toast, toastError } from './toasts.js';
import { net } from '../net.js';
import { store, useStore, serverNow } from '../store.js';
import { audio } from '../audio.js';
import { t, N_ } from '../../../shared/i18n.js';
import { presetName } from './ruleset.js';

/**
 * Why the server took the player out of the queue (room.queueState queued:false reason); 'left' / 'declined' say
 * nothing. A queued room's members hear who acted (`by`, maintainer decision 2026-10-13); [generic, named] texts.
 */
const LEFT_REASON = {
  timeout: [N_('未在时限内确认，已退出匹配')],
  offline: [N_('连接中断，已退出匹配')],
  restarting: [N_('服务器即将重启，匹配已取消')],
  full: [N_('服务器同盟数量已满，匹配已取消')],
  room: [N_('你已加入同盟，匹配已取消')],
  party: [N_('同盟中有博士取消了匹配'), N_('{name} 取消了匹配')],
  partyDeclined: [N_('同盟中有博士拒绝了匹配，匹配已取消'), N_('{name} 拒绝了匹配，匹配已取消')],
  partyTimeout: [N_('同盟中有博士未在时限内确认，匹配已取消')],
  changed: [N_('同盟成员有变动，匹配已取消'), N_('{name} 离开了同盟，匹配已取消')],
};

/** The toast text for a queued:false message, or null. */
export function leftText(msg) {
  const texts = LEFT_REASON[msg?.reason];
  if (!texts) return null;
  const named = texts[1] && typeof msg.by === 'string' && msg.by;
  return named ? t(texts[1], { name: msg.by }) : t(texts[0]);
}

const setQueue = (queue) => store.patch('ui', { queue });

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
 * @param {'room.queueState'|'room.matchFound'} kind @param {any} prev ui.queue before the message @param {any} msg
 * @returns {'matchSucceed'|'matchFail'|'matchCancel'|null}
 */
export function queueCue(kind, prev, msg) {
  if (kind === 'room.matchFound') return prev?.found ? null : 'matchSucceed';
  if (kind !== 'room.queueState' || !prev) return null;
  if (msg?.queued) return prev.found ? 'matchFail' : null;
  return msg?.reason === 'left' || msg?.reason === 'declined' ? 'matchCancel' : 'matchFail';
}

/** The tab title blinking while a formed group waits for a player on another tab (stops on return or when it ends). */
let titleFlash = null;
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

const cue = (key) => { if (key) audio.sfx(key); };
/** The confirmation's countdown cue at its last 5 s, for a player who has not answered yet (Countdown onWarn). */
const timerCue = () => audio.sfx('timer');

/** Wire the queue messages into the store (main.js, once). @param {{ net: { on: Function } }} deps */
export function installMatchQueue({ net: n = net } = {}) {
  n.on('room.queueState', (msg) => {
    const prev = store.get().ui.queue;
    cue(queueCue('room.queueState', prev, msg));
    if (!msg.queued) {
      setQueue(null);
      const text = leftText(msg);
      if (text) toast(text, 'warn');
      return;
    }
    // back in the queue from a group: someone did not accept
    if (prev?.found) toast(t('有博士未接受，继续匹配'), 'info');
    setQueue({ difficulty: msg.difficulty, ruleset: msg.ruleset ?? null, size: seatsOf(msg.size), count: msg.count ?? 1, since: Date.now() - (msg.waitedMs ?? 0), party: !!msg.party, found: null });
  });
  n.on('room.matchFound', (msg) => {
    const prev = store.get().ui.queue;
    cue(queueCue('room.matchFound', prev, msg));
    if (!prev?.found) flashTitle(t('匹配成功'));
    setQueue({
      ...(prev || { difficulty: msg.difficulty, ruleset: msg.ruleset ?? null, size: seatsOf(msg.size), count: msg.players, since: Date.now(), party: false }),
      found: { players: msg.players, accepted: msg.accepted, mine: !!msg.mine, deadline: serverNow() + msg.inMs,
        total: prev?.found?.total ?? Math.max(1, Math.ceil(msg.inMs / 1000)) },
    });
  });
  // a queued room keeps receiving room.state while it waits: only its match (or the end of `matching`) closes the queue
  n.on('room.state', (msg) => {
    const q = store.get().ui.queue;
    if (q && (!q.party || msg.inMatch || !msg.matching)) setQueue(null);
  });
  n.on('room.closed', () => { if (store.get().ui.queue?.party) setQueue(null); });
  // the waiting Doctors of every queue (the lobby's 同盟匹配 card): { [ruleset]: { [difficulty]: n } }, of the 8-player queues too
  const countsOf = (c) => (c && typeof c === 'object' ? c : null);
  n.on('lobby.queueCounts', (msg) => store.patch('ui', { queueCounts: countsOf(msg.counts), queueCounts8: countsOf(msg.counts8) }));
  n.on('welcome', (msg) => { if (!msg.resumed && store.get().ui.queue) setQueue(null); });
  // while queued the page's audio stays up in a hidden tab; the title blink ends with its group
  store.subscribe((s, prev) => {
    const q = s.ui.queue;
    if (q === prev?.ui?.queue) return;
    audio.keepAwake(!!q);
    if (!q?.found) stopTitleFlash();
  });
}

/**
 * room.queue for the difficulty, ruleset and alliance size (the lobby's 开始匹配 button; `size` only for an 8-player queue).
 * @returns {Promise<any>}
 */
export const joinQueue = (difficulty, ruleset, size = MAX_SEATS) =>
  net.request('room.queue', { difficulty, ...(ruleset ? { ruleset } : {}), ...(size !== MAX_SEATS ? { size } : {}) });

/** m:ss of a waiting time. */
export const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The queue dialog (rendered by the lobby and room screens while ui.queue is set): the waiting dialog for a player
 * queued alone, the confirmation for everyone once a group formed (a queued room's waiting state is in its room bar).
 */
export function MatchQueueDialog() {
  const queue = useStore((s) => s.ui.queue);
  const [busy, setBusy] = useState(null);
  useTicker(queue && !queue.found && !queue.party ? 500 : 0);
  if (!queue || (queue.party && !queue.found)) return null;
  const run = async (kind, msg) => {
    if (busy) return;
    setBusy(kind);
    try { await net.request(msg.t, msg); } catch (err) { toastError(err); } finally { setBusy(null); }
  };
  const cancel = () => run('cancel', { t: 'room.unqueue' });
  const cap = seatsOf(queue.size);
  const name = t(DIFFICULTY_NAMES[queue.difficulty] || queue.difficulty) + (queue.ruleset ? ` · ${presetName(queue.ruleset)}` : '')
    + (cap !== MAX_SEATS ? ` · ${t('{n} 人同盟', { n: cap })}` : '');

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
          <span class="queue-dialog__mode">${t('同盟模拟')} · ${name}</span>
          <span>${t('{players} 名博士', { players: f.players })}</span>
          <span class="t-lo">${t('已接受 {accepted}/{players}', { accepted: f.accepted, players: f.players })}</span>
        </div>
      </div>
    <//>`;
  }

  return html`<${Modal} open=${true} micro="MATCHMAKING" title=${t('正在匹配同盟…')} closeOnBackdrop=${false} onClose=${cancel} class="queue-dialog"
    actions=${html`<${Button} variant="secondary" icon="close" loading=${busy === 'cancel'} onClick=${cancel}>${t('取消匹配')}<//>`}>
    <div class="queue-dialog__body">
      <div class="queue-dialog__clock num">${mmss(Date.now() - queue.since)}</div>
      <div class="queue-dialog__lines">
        <span class="queue-dialog__mode">${t('同盟模拟')} · ${name}</span>
        <span>${t('排队中的博士：{count}/{n}', { count: Math.min(cap, queue.count), n: cap })}</span>
        <span class="t-lo">${t('凑齐 {n} 名博士后开始', { n: cap })}</span>
      </div>
    </div>
  <//>`;
}
