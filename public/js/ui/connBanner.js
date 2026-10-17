// Connection banner (global chrome, mounted once by main.js): reconnecting / closed / rejected-hello states with
// the matching action, "正在同步同盟状态…" while a resumed session waits for its room/match state, and "服务器已更新"
// while a match still runs on a page the server has moved past (ui/buildGuard.js sets ui.buildStale). Outside a
// match the banner sits at the bottom centre; in a match (html.sp-in-match, set by the match screen) it moves under the
// top bar so it never covers the combat view switcher or the shop bar. While it shows, html.sp-conn moves the toasts
// below it (classes instead of CSS :has(), which Firefox ESR / Safari < 15.4 lack).
// The deploy's restart countdown (ui/restartNotice.js, ui.restartAt) shows here in its last 5 minutes, ahead of 服务器已更新.
// Once it is due, and while the page reconnects to the restarted server, the banner says the page reloads by itself
// (ui/buildGuard.js reloads it as soon as the new build answers) instead of reporting a lost connection.
// A deploy that keeps running matches (ui/generation.js, ui.genMove): 'tab' = the page waits for another tab's match on
// the old server; 'soon' / 'room' (the page reloads onto the new version in a moment) are the dialog of
// ui/updateNotice.js, not this banner; 'match' shows nothing (the match runs on).
// In a match with the local art, plain reconnecting shows the official 「等待重连中......」 mask instead (ui/battleArt.js
// ReconnectMask, docs/rules/ui.md 「공식 위수협약 UI」): it takes every press, has no 立即重连 button (the client's has
// none; the page still retries at once on focus / online, net.js).

import { html, Button, Icon, useTicker } from './components.js';
import { net, CLIENT_ERR_TEXT } from '../net.js';
import { useStore, shallowEqual, selectRoute } from '../store.js';
import { ReconnectMask, battleArt } from './battleArt.js';
import { useDocClass } from './device.js';
import { t } from '../../../shared/i18n.js';
import { restartBannerDue, restartClock } from './restartNotice.js';

/** Whether the banner shows for this connection state (mirrors the early returns below). */
export function bannerVisible(conn, entered, restoring, buildStale = false, restartDue = false, genMove = null) {
  if (!entered || !conn) return false;
  if (conn.status === 'online') return !!restoring || !!buildStale || !!restartDue || genMove === 'tab';
  if (!conn.everOnline && (conn.status === 'connecting' || conn.status === 'handshaking' || conn.status === 'idle')) return false;
  return true;
}

export function ConnectionBanner() {
  const conn = useStore((s) => s.connection, shallowEqual);
  const entered = useStore((s) => s.session.entered);
  const restoring = useStore((s) => s.ui.restoring);
  const buildStale = useStore((s) => !!s.ui.buildStale);
  const restartAt = useStore((s) => s.ui.restartAt ?? null);
  const genMove = useStore((s) => s.ui.genMove ?? null);
  // (not while the server-lost dialog holds a match the server already closed: the mask would cover its 确认)
  const inGame = useStore((s) => selectRoute(s) === 'game' && !s.ui.serverLost);
  // a running countdown ticks every second: it crosses into the banner's last minutes and counts down there
  useTicker(conn.status === 'reconnecting' ? 500 : restartAt != null ? 1000 : 0);
  const restartDue = restartBannerDue(restartAt);
  const moving = genMove === 'tab';
  useDocClass('sp-conn', bannerVisible(conn, entered, restoring, buildStale, restartDue, genMove));
  if (!entered) return null;
  if (conn.status === 'online' && !restoring && !buildStale && !restartDue && !moving) return null;
  if (moving && conn.status === 'online' && !restoring) {
    return html`<div class="conn-banner" role="status">
      <${Icon} name="refresh" />
      <span>${t('新版本已上线')}</span>
      <span class="conn-banner__sub">${t('其他标签页的对局结束后将自动刷新')}</span>
    </div>`;
  }
  if (conn.status === 'online' && restoring) {
    return html`<div class="conn-banner" role="status"><${Icon} name="refresh" /><span>${t('正在同步同盟状态…')}</span></div>`;
  }
  const restarting = restartAt != null && restartAt <= Date.now();
  if (restarting && (conn.status === 'online' || conn.status === 'reconnecting')) {
    return html`<div class="conn-banner" role="status">
      <${Icon} name="refresh" />
      <span>${t('服务器正在重启')}</span>
      <span class="conn-banner__sub">${t('重启完成后页面将自动刷新')}</span>
    </div>`;
  }
  if (conn.status === 'online' && restartDue) {
    return html`<div class="conn-banner" role="status">
      <${Icon} name="refresh" />
      <span>${t('服务器重启倒计时')}</span>
      <span class="conn-banner__sub">${restartClock(restartAt)}</span>
      <span class="conn-banner__sub">${t('进行中的对局将会结束')}</span>
    </div>`;
  }
  if (conn.status === 'online' && buildStale) {
    // the server has a newer build than this page: the guard reloads by itself once the match is over, the button is
    // for a player who would rather do it now
    return html`<div class="conn-banner" role="alert">
      <${Icon} name="refresh" />
      <span>${t('服务器已更新，本局结束后刷新')}</span>
      <${Button} size="sm" variant="secondary" icon="refresh" onClick=${() => location.reload()}>${t('刷新页面')}<//>
    </div>`;
  }
  if (!conn.everOnline && (conn.status === 'connecting' || conn.status === 'handshaking' || conn.status === 'idle')) return null;
  if (conn.status === 'reconnecting' && inGame && battleArt('reconnect').cls) return html`<${ReconnectMask} />`;
  const secs = conn.retryAt ? Math.max(0, Math.ceil((conn.retryAt - Date.now()) / 1000)) : 0;
  const replaced = conn.status === 'closed' && conn.lastError?.code === 'REPLACED';
  const rejected = conn.status === 'connected' && !!conn.lastError; // hello refused (version, server full…)
  const versionMismatch = rejected && conn.lastError.text === CLIENT_ERR_TEXT.VERSION;
  // Short transitional states (a rename re-sends hello on the live socket) only show if they linger.
  const transient = conn.status === 'connecting' || conn.status === 'handshaking' || (conn.status === 'connected' && !rejected);
  const text = conn.status === 'reconnecting'
    ? t('与服务器的连接已中断，正在重连')
    : replaced ? t('该身份已在其他页面登录')
      : conn.status === 'closed' ? t('连接已关闭')
        : rejected ? t(conn.lastError.text) : t('正在连接服务器');
  const action = conn.status === 'reconnecting' ? { label: t('立即重连'), run: () => net.retryNow() }
    : conn.status === 'closed' ? { label: replaced ? t('在此页面继续') : t('重新连接'), run: () => net.connect() }
      : versionMismatch ? { label: t('刷新页面'), run: () => location.reload() }
        : rejected ? { label: t('重试'), run: () => net.reconnectNow() } : null;
  return html`<div class=${`conn-banner${transient ? ' conn-banner--soft' : ''}`} role="alert">
    <${Icon} name="wifiOff" />
    <span>${text}</span>
    ${conn.status === 'reconnecting' ? html`<span class="conn-banner__sub">${t('第 {attempt} 次 · {secs}s', { attempt: conn.attempt, secs })}</span>` : null}
    ${action ? html`<${Button} size="sm" variant="secondary" icon="refresh" onClick=${action.run}>${action.label}<//>` : null}
  </div>`;
}
