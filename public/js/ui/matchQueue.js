// 랜덤 매칭 on the client (server/matchmaking.js has the rules): the lobby's 随机匹配 button queues the player for the
// selected difficulty (co-op). While queued, a dialog shows the waiting time and how many players wait for that
// difficulty, offers the two fallbacks once the server accepts them (room.queueState fallbackInMs: 'bots' = start now
// with AI teammates, 'humans' = start with the other players who chose a fallback, or keep waiting for four), and asks
// for the confirmation when a group forms (room.matchFound, its own countdown). The match's room.state closes it (the
// room / game screen follows); a welcome that starts a new server session forgets it (the server's queue is gone).
//
// store ui.queue: null, or { difficulty, count, since, fallbackAt, fallback, found } — since / fallbackAt in this page's
// clock; found: null or { players, bots, accepted, mine, deadline, total } (deadline in server time for components.js
// Countdown, total = the window's seconds for its gauge).

import { useState } from '../../vendor/hooks.module.js';
import { DIFFICULTY_NAMES } from '../../../shared/constants.js';
import { html, Button, Countdown, MicroLabel, Modal, Spinner, useTicker } from './components.js';
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
    const now = Date.now();
    // back in the queue from a group: someone did not accept
    if (prev?.found) toast(t('有博士未接受，继续匹配'), 'info');
    setQueue({
      difficulty: msg.difficulty, count: msg.count ?? 1, since: now - (msg.waitedMs ?? 0),
      fallbackAt: now + (msg.fallbackInMs ?? 0), fallback: msg.fallback ?? null, found: null,
    });
  });
  n.on('room.matchFound', (msg) => {
    const prev = store.get().ui.queue;
    setQueue({
      ...(prev || { difficulty: msg.difficulty, count: msg.players, since: Date.now(), fallbackAt: Date.now(), fallback: null }),
      found: { players: msg.players, bots: msg.bots, accepted: msg.accepted, mine: !!msg.mine, deadline: serverNow() + msg.inMs,
        total: prev?.found?.total ?? Math.max(1, Math.ceil(msg.inMs / 1000)) },
    });
  });
  n.on('room.state', () => { if (store.get().ui.queue) setQueue(null); });
  n.on('welcome', (msg) => { if (!msg.resumed && store.get().ui.queue) setQueue(null); });
}

/** room.queue for the difficulty (the lobby's 随机匹配 button). @returns {Promise<any>} */
export const joinQueue = (difficulty) => net.request('room.queue', { difficulty });

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The queue dialog (rendered by the lobby screen while ui.queue is set). */
export function MatchQueueDialog() {
  const queue = useStore((s) => s.ui.queue);
  const [busy, setBusy] = useState(null);
  useTicker(queue && !queue.found ? 500 : 0);
  if (!queue) return null;
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
          <span>${f.bots ? t('{players} 名博士 + {bots} 名 AI 队友', { players: f.players, bots: f.bots }) : t('{players} 名博士', { players: f.players })}</span>
          <span class="t-lo">${t('已接受 {accepted}/{players}', { accepted: f.accepted, players: f.players })}</span>
        </div>
      </div>
    <//>`;
  }

  const now = Date.now();
  const fallbackIn = queue.fallbackAt - now;
  const pick = (fallback) => run(`fb-${fallback}`, { t: 'room.queueFallback', fallback });
  const option = (value, label) => html`<button type="button" class=${'queue-option' + (queue.fallback === value ? ' is-on' : '')}
    aria-pressed=${queue.fallback === value} disabled=${!!busy} onClick=${() => pick(value)}>${label}</button>`;
  return html`<${Modal} open=${true} micro="MATCHMAKING" title=${t('正在匹配同盟…')} closeOnBackdrop=${false} onClose=${cancel} class="queue-dialog"
    actions=${html`<${Button} variant="secondary" icon="close" loading=${busy === 'cancel'} onClick=${cancel}>${t('取消匹配')}<//>`}>
    <div class="queue-dialog__body">
      <div class="queue-dialog__clock num">${mmss(now - queue.since)}</div>
      <div class="queue-dialog__lines">
        <span class="queue-dialog__mode">${t('同盟模拟')} · ${name}</span>
        <span>${t('排队中的博士：{count}/4', { count: Math.min(4, queue.count) })}</span>
      </div>
    </div>
    <div class="queue-dialog__fallback">
      <${MicroLabel}>IF THE WAIT IS LONG<//>
      ${fallbackIn > 0
        ? html`<span class="t-lo">${t('{s} 秒后可以选择开始方式', { s: Math.ceil(fallbackIn / 1000) })}</span>`
        : html`<div class="queue-options">
            ${option(null, t('继续等待 4 名博士'))}
            ${option('bots', t('用 AI 队友补满后立即开始'))}
            ${option('humans', t('凑齐 2 名以上博士即开始'))}
          </div>`}
    </div>
  <//>`;
}
