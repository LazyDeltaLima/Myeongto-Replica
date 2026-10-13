// 랜덤 매칭 on the client (server/matchmaking.js has the rules): the lobby's 同盟匹配 card queues the player alone for the
// selected difficulty (co-op), and a co-op room's host queues the room's humans for its empty seats (the room screen's
// 匹配补位 button, room.queueRoom). While queued alone, a dialog shows the waiting time, how many Doctors wait for that
// difficulty and the cancel button; a queued room shows the same in the room screen's bar instead (room.state
// `matching`, screens/room.js). When a group of four forms, every member gets the confirmation dialog
// (room.matchFound, its own countdown). The match's room.state closes it (the room / game screen follows); a welcome
// that starts a new server session forgets it (the server's queue is gone).
//
// store ui.queue: null, or { difficulty, count, since, party, found } — since in this page's clock; party = queued with
// the room; found: null or { players, accepted, mine, deadline, total } (deadline in server time for components.js
// Countdown, total = the window's seconds for its gauge).

import { useState } from '../../vendor/hooks.module.js';
import { DIFFICULTY_NAMES } from '../../../shared/constants.js';
import { html, Button, Countdown, Modal, Spinner, useTicker } from './components.js';
import { toast, toastError } from './toasts.js';
import { net } from '../net.js';
import { store, useStore, serverNow } from '../store.js';
import { t, N_ } from '../../../shared/i18n.js';

/** Why the server took the player out of the queue (room.queueState queued:false reason); 'left' / 'declined' say nothing. */
const LEFT_REASON = {
  timeout: N_('未在时限内确认，已退出匹配'),
  offline: N_('连接中断，已退出匹配'),
  restarting: N_('服务器即将重启，匹配已取消'),
  full: N_('服务器同盟数量已满，匹配已取消'),
  room: N_('你已加入同盟，匹配已取消'),
  party: N_('同盟中有博士取消了匹配'),
  changed: N_('同盟成员有变动，匹配已取消'),
};

const setQueue = (queue) => store.patch('ui', { queue });

/** Wire the queue messages into the store (main.js, once). @param {{ net: { on: Function } }} deps */
export function installMatchQueue({ net: n = net } = {}) {
  n.on('room.queueState', (msg) => {
    const prev = store.get().ui.queue;
    if (!msg.queued) {
      setQueue(null);
      const text = LEFT_REASON[msg.reason];
      if (text) toast(t(text), 'warn');
      return;
    }
    // back in the queue from a group: someone did not accept
    if (prev?.found) toast(t('有博士未接受，继续匹配'), 'info');
    setQueue({ difficulty: msg.difficulty, count: msg.count ?? 1, since: Date.now() - (msg.waitedMs ?? 0), party: !!msg.party, found: null });
  });
  n.on('room.matchFound', (msg) => {
    const prev = store.get().ui.queue;
    setQueue({
      ...(prev || { difficulty: msg.difficulty, count: msg.players, since: Date.now(), party: false }),
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
  n.on('welcome', (msg) => { if (!msg.resumed && store.get().ui.queue) setQueue(null); });
}

/** room.queue for the difficulty (the lobby's 开始匹配 button). @returns {Promise<any>} */
export const joinQueue = (difficulty) => net.request('room.queue', { difficulty });

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
  const name = t(DIFFICULTY_NAMES[queue.difficulty] || queue.difficulty);

  if (queue.found) {
    const f = queue.found;
    return html`<${Modal} open=${true} tone="amber" micro="MATCH FOUND" title=${t('匹配成功')} closeOnBackdrop=${false} class="queue-dialog"
      actions=${f.mine
        ? html`<span class="queue-dialog__wait"><${Spinner} size="sm" />${t('等待其他博士确认…')}</span>`
        : html`<${Button} variant="secondary" loading=${busy === 'decline'} onClick=${() => run('decline', { t: 'room.queueAccept', accept: false })}>${t('拒绝')}<//>
          <${Button} variant="primary" icon="check" loading=${busy === 'accept'} onClick=${() => run('accept', { t: 'room.queueAccept', accept: true })}>${t('接受')}<//>`}>
      <div class="queue-dialog__body">
        <${Countdown} deadline=${f.deadline} total=${f.total} warnAt=${5} label="CONFIRM" />
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
        <span>${t('排队中的博士：{count}/4', { count: Math.min(4, queue.count) })}</span>
        <span class="t-lo">${t('凑齐 4 名博士后开始')}</span>
      </div>
    </div>
  <//>`;
}
