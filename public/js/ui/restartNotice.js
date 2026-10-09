// The deploy's server-restart countdown (server/local-restart.js). Each server.restart `mark` (30 / 10 / 5 / 3 / 1 minutes
// before) shows 「N分钟后重启」 as a toast for a few seconds, and a page that says hello during a countdown (welcome
// `restart: { inMs }`: a new player, a reload) gets one such toast with the minutes left. ui.restartAt (this page's clock)
// remembers that a countdown runs — a resumed page that already knew it gets no second toast — lets a cancellation
// ({ inMs: null }) say so to the pages that had heard of it, and drives the connection banner's countdown in the last
// RESTART_FINAL_MIN minutes (ui/connBanner.js; user 2026-10-09: toasts only, 「5분부터는 띠도 표시」), when the server
// also refuses new matches.

import { store } from '../store.js';
import { toast } from './toasts.js';
import { t } from '../../../shared/i18n.js';
import { RESTART_FINAL_MIN } from '../../../shared/local.js';

const TOAST_MS = 6000;
/** Whether the connection banner shows the countdown: the last RESTART_FINAL_MIN minutes. @param {number | null} restartAt */
export const restartBannerDue = (restartAt, now = Date.now()) => restartAt != null && restartAt - now <= RESTART_FINAL_MIN * 60_000;

/** m:ss until the restart (0:00 once due). @param {number} restartAt */
export function restartClock(restartAt, now = Date.now()) {
  const secs = Math.max(0, Math.ceil((restartAt - now) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

const restartAtOf = (inMs) => (Number.isFinite(inMs) && inMs >= 0 ? Date.now() + inMs : null);

/** @param {{ net: { on: Function }, notify?: typeof toast }} deps notify: the toast (tests pass their own) */
export function installRestartNotice({ net, notify = toast }) {
  const warn = (minutes) => notify(t('服务器将在 {minutes} 分钟后重启，进行中的对局将会结束', { minutes }), 'warn', { ttl: TOAST_MS });
  net.on('welcome', (msg) => {
    const restartAt = restartAtOf(msg?.restart?.inMs);
    const had = store.get().ui.restartAt != null;
    store.patch('ui', { restartAt });
    // a welcome without `restart` (none planned, or the new server after the restart) just forgets it
    if (restartAt != null && !had && msg.restart.inMs >= 60_000) warn(Math.ceil(msg.restart.inMs / 60_000));
  });
  net.on('server.restart', (msg) => {
    const restartAt = restartAtOf(msg.inMs);
    const had = store.get().ui.restartAt != null;
    store.patch('ui', { restartAt });
    if (restartAt == null) {
      if (had) notify(t('服务器重启已取消'), 'info', { ttl: TOAST_MS });
      return;
    }
    if (Number.isInteger(msg.mark) && msg.mark > 0) warn(msg.mark);
  });
}
