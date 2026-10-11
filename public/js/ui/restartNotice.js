// The deploy's server-restart countdown (server/local-restart.js). Until its last RESTART_FINAL_MIN (5) minutes it is
// toasts: each server.restart `mark` above them (30 / 10) shows 「N分钟后重启」 for a few seconds, and a page that says
// hello during a countdown (welcome `restart: { inMs }`: a new player, a reload) gets one such toast with the minutes
// left. In the last minutes the connection banner counts down instead (ui/connBanner.js) and the server refuses new
// matches — no toasts there (maintainer 2026-10-09: toasts only, 「5분부터는 띠도 표시」, 「5분부터의 토스트는 제거해」).
// ui.restartAt (this page's clock) remembers that a countdown runs — a resumed page that already knew it gets no second
// toast — drives the banner, and lets a cancellation ({ inMs: null }) say so to the pages that had heard of it.
// A page that knew of a countdown and then gets a welcome without one is talking to the new server: the restart is over,
// and onRestarted (main.js: the build guard's burst) checks for the new build at once instead of within two minutes.

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

/**
 * @param {{ net: { on: Function }, notify?: typeof toast, onRestarted?: () => void }} deps notify: the toast (tests pass
 *   their own); onRestarted: the restart this page knew of is over (a welcome without `restart` after one with it)
 */
export function installRestartNotice({ net, notify = toast, onRestarted }) {
  const warn = (minutes) => notify(t('服务器将在 {minutes} 分钟后重启，进行中的对局将会结束', { minutes }), 'warn', { ttl: TOAST_MS });
  net.on('welcome', (msg) => {
    const restartAt = restartAtOf(msg?.restart?.inMs);
    const had = store.get().ui.restartAt != null;
    store.patch('ui', { restartAt });
    // a welcome without `restart` (none planned, or the new server after the restart) just forgets it
    if (restartAt != null && !had && !restartBannerDue(restartAt)) warn(Math.ceil(msg.restart.inMs / 60_000));
    if (restartAt == null && had) { try { onRestarted?.(); } catch { /* ignore */ } }
  });
  net.on('server.restart', (msg) => {
    const restartAt = restartAtOf(msg.inMs);
    const had = store.get().ui.restartAt != null;
    store.patch('ui', { restartAt });
    if (restartAt == null) {
      if (had) notify(t('服务器重启已取消'), 'info', { ttl: TOAST_MS });
      return;
    }
    if (Number.isInteger(msg.mark) && msg.mark > RESTART_FINAL_MIN) warn(msg.mark); // the banner has the last minutes
  });
}
