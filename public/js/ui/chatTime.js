import { useEffect, useId, useMemo, useState } from '../../vendor/hooks.module.js';
import { t } from '../../../shared/i18n.js';
import { html, Tooltip } from './components.js';
import { htmlLang, useLang } from './lang.js';

/** @param {any} line */
export function hasMessageTime(line) {
  return line.kind !== 'faction' && Number.isFinite(line.at) && Math.abs(line.at) <= 8.64e15;
}

const MINUTE = 60_000;

/** @param {number} at @param {number} now */
export function isOldChatMessage(at, now) {
  return now - at >= 30 * MINUTE;
}

/** One clock for all mounted message timestamps. */
const clockListeners = new Set();
let clockTimer;

function tickClock() {
  const now = Date.now();
  for (const listener of clockListeners) listener(now);
}

export function subscribeChatClock(listener) {
  clockListeners.add(listener);
  if (clockListeners.size === 1) {
    clockTimer = setInterval(tickClock, 1000);
    document.addEventListener('visibilitychange', tickClock);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      clearInterval(clockTimer);
      document.removeEventListener('visibilitychange', tickClock);
    }
  };
}

/** @param {number} at @param {number} now @param {Intl.RelativeTimeFormat} relative @param {string} sent */
function formatChatTime(at, now, relative, sent) {
  if (isOldChatMessage(at, now)) return sent;
  const minutes = Math.floor((now - at) / MINUTE);
  return minutes < 1 ? t('刚刚') : relative.format(-minutes, 'minute');
}

/** @param {{ at: number, interactive?: boolean }} props */
export function ChatTime({ at, interactive = true }) {
  const locale = htmlLang(useLang());
  const description = useId();
  const relative = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }), [locale]);
  const sent = useMemo(() => new Intl.DateTimeFormat(locale, {
    hour: 'numeric', minute: '2-digit',
  }).format(at), [locale, at]);
  const exact = useMemo(() => interactive ? new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(at) : '', [locale, at, interactive]);

  const [label, setLabel] = useState(() => formatChatTime(at, Date.now(), relative, sent));
  useEffect(() => {
    const update = (now) => setLabel(formatChatTime(at, now, relative, sent));
    update(Date.now());
    return subscribeChatClock(update);
  }, [at, relative, sent]);

  const time = html`<time class="chat__time" datetime=${new Date(at).toISOString()} tabindex=${interactive ? 0 : undefined}
    aria-live="off" aria-describedby=${interactive ? description : undefined}>${label}</time>`;
  return interactive ? html`<${Tooltip} text=${exact}>
    ${time}
    <span class="sr-only" id=${description}>${exact}</span>
  <//>` : time;
}
