// The deploy's server-restart countdown (server/local-restart.js). server.restart { inMs, mark? } and the
// welcome's `restart: { inMs }` set ui.restartAt (this page's clock); the connection banner (ui/connBanner.js) counts it
// down, and each `mark` (30 / 10 / 5 / 3 / 1 minutes before) also comes as a toast. inMs null = called off.

import { store } from '../store.js';
import { toast } from './toasts.js';
import { t } from '../../../shared/i18n.js';

const restartAtOf = (inMs) => (Number.isFinite(inMs) && inMs >= 0 ? Date.now() + inMs : null);

/** mm:ss until the restart (0:00 once due). @param {number} restartAt */
export function restartClock(restartAt) {
  const secs = Math.max(0, Math.ceil((restartAt - Date.now()) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** @param {{ net: { on: Function } }} deps */
export function installRestartNotice({ net }) {
  // a welcome without `restart` (a fresh server after the restart, or none planned) clears the banner
  net.on('welcome', (msg) => store.patch('ui', { restartAt: restartAtOf(msg?.restart?.inMs) }));
  net.on('server.restart', (msg) => {
    const restartAt = restartAtOf(msg.inMs);
    const had = store.get().ui.restartAt != null;
    store.patch('ui', { restartAt });
    if (restartAt == null) {
      if (had) toast(t('服务器重启已取消'), 'info');
      return;
    }
    if (Number.isInteger(msg.mark) && msg.mark > 0) {
      toast(t('服务器将在 {minutes} 分钟后重启，进行中的对局将会结束', { minutes: msg.mark }), 'warn', { ttl: 10_000 });
    }
  });
}
