// The deploy's server-restart countdown (server/local-restart.js), as toasts only: each server.restart `mark` (30 / 10 /
// 5 / 3 / 1 minutes before) shows 「N分钟后重启」 for a few seconds, and a page that says hello during a countdown (welcome
// `restart: { inMs }`: a new player, a reload) gets one such toast with the minutes left. ui.restartAt (this page's clock)
// only remembers that a countdown runs — a resumed page that already knew it gets no second toast — and lets a
// cancellation ({ inMs: null }) say so to the pages that had heard of it.

import { store } from '../store.js';
import { toast } from './toasts.js';
import { t } from '../../../shared/i18n.js';

const TOAST_MS = 6000;
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
