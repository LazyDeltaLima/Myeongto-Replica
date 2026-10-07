// ui/numberStyleSetting.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」 ④): the settings row choosing the damage
// number style (render/number-style.js): 官方 = the client's (crits / forced hits and heals only), 全部 = every hit (the
// old look). Shown under 显示伤害数字 in ui/settings.js.
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, MicroLabel } from './components.js';
import { numberStyle, setNumberStyle, onNumberStyle } from '../render/number-style.js';
import { t, N_ } from '../../../shared/i18n.js';

const OPTIONS = Object.freeze([['official', N_('官方')], ['classic', N_('全部显示')]]);

/** Settings row: 伤害数字样式 (官方 / 全部显示). */
export function NumberStyleSetting() {
  const [v, setV] = useState(numberStyle);
  useEffect(() => onNumberStyle(setV), []);
  return html`<div class="set-row" data-number-style=${v}>
    <span class="set-row__label">${t('伤害数字样式')}<${MicroLabel}>NUMBER STYLE<//></span>
    <div class="set-seg" role="radiogroup">
      ${OPTIONS.map(([id, label]) => html`<button key=${id} type="button" role="radio" aria-checked=${v === id ? 'true' : 'false'}
        class=${v === id ? 'is-on' : ''} onClick=${() => setNumberStyle(id)}>${t(label)}</button>`)}
    </div>
  </div>`;
}
