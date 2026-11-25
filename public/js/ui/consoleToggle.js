// 콘솔 모드: the solo room's 「콘솔 모드」 switch (screens/room.js), right of 干员调配 in the same button shape, amber while
// on (maintainer decision 2026-11-15). room.setConsole { on } (server/local-patch.js): the room's own player, before the
// match; room.state `console` is the truth the button shows. Kept out of consolePanel.js so the room screen does not load
// the whole panel. Styles: css/console-panel.css .cxp-toggle.

import { html, Spinner } from './components.js';
import { t } from '../../../shared/i18n.js';

/** @param {...(string | false | null | undefined | (string | false | null | undefined)[])} p */
const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** @param {{ on: boolean, busy?: boolean, disabled?: boolean, onToggle: (on: boolean) => void }} props */
export function ConsoleToggle({ on, busy = false, disabled = false, onToggle }) {
  return html`<button type="button" class=${cx('btn', 'btn--secondary', 'btn--md', 'cxp-toggle', on && 'is-on')} aria-pressed=${on ? 'true' : 'false'}
      disabled=${disabled || busy} onClick=${() => onToggle(!on)} data-testid="console-toggle"
      title=${t('自由更改干员、装备、敌人、回合、首领与盟约层数；不结算，也不计入统计、成就和战绩')}>
    ${busy ? html`<${Spinner} size="sm" />` : html`<svg class="btn__icon cxp-toggle__icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 9l3 3-3 3M12 15h5"/></svg>`}
    <span class="btn__label">${t('控制台模式')}</span>
    <span class="cxp-toggle__sw">${on ? 'ON' : 'OFF'}</span>
  </button>`;
}
