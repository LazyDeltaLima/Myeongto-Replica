// The active effects (m.private.effects: band / 机变 / team / item / garrison effects with counters) behind the HUD's
// 强化效果 button — the official 规程 HUD's btn_check_buff left of the 🔍 (autochess_hud_panel: 90 left of it), showing how
// many, and its list window autochess_hud_buff_dialog: one row per effect (icon, name, description), scrolling when long
// (maintainer decision 2026-11-12: both seasons — the right-edge icon column this replaced was ours). `counterText` (a
// 悬赏's "还剩 N 场作战", user playtest #6 item 4) stands beside the name, as the bare counter did. 精打细算玩偶 is one entry
// however many were used (`roundFunds` / `stack`, server/match/player/views.js): its row says the funds they add per
// round together.

import { useState, useEffect, useRef } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { Img, RichText, GIcon } from './gameComponents.js';
import { effectIconUrl, uiUrl } from './assetUrls.js';
import { data, localAsset } from '../data.js';
import { t, tName, N_ } from '../../../shared/i18n.js';
import { sentText } from './lang.js';

const KIND = { band: N_('策略'), choice: N_('机变'), team: N_('团队增益'), item: N_('道具'), garrison: N_('特质') };

/**
 * A 悬赏's counter line in the current language: the battles its enemies still come for (server/match/player/views.js
 * sends the same Chinese text as `counterText` beside the count; a multi-round card has no count).
 * @param {{ counter?: number|null }} e
 */
export const bountyCounterText = (e) => (e.counter == null ? t('之后的每场作战') : t('还剩 {left} 场作战', { left: e.counter }));

/** Data files whose records an effect entry copies its name / description from (by its id or icon id). */
const SOURCES = ['effects', 'bands', 'items', 'garrisons'];

/**
 * An effect entry's description in the current language (the server copies a record's Chinese text: an effect's, a
 * strategy's, an item's, a 特质's — sentText; a reworded one, such as a multi-round 悬赏's, stays as sent).
 * @param {{ id?: string, iconId?: string, desc?: string }} e
 */
export function effectDesc(e) {
  const desc = e.desc || '';
  if (!desc) return desc;
  const from = (file, id) => {
    const raw = typeof id === 'string' && id ? data.lookupRaw(file, id) : null;
    if (!raw) return desc;
    const loc = data.lookup(file, id) || raw;
    for (const k of ['descRaw', 'desc']) {
      const v = sentText(desc, raw[k], loc[k]);
      if (v !== desc) return v;
    }
    return desc;
  };
  for (const file of SOURCES) {
    for (const id of [e.id, e.iconId]) {
      const v = from(file, id);
      if (v !== desc) return v;
    }
  }
  // the strategy's entry (server/match/player/views.js effectsView): its id is the strategy's effect and its icon an icon
  // id, neither the strategy's own id, and 规程's effect text differs from the strategy's (「拖拽使用（消耗0）」) — the
  // strategy whose effect it names
  const bands = e.iconKind === 'band' && typeof e.id === 'string' ? data.getRaw('bands') : null;
  for (const rec of bands && typeof bands === 'object' ? Object.values(bands) : []) {
    if (rec?.effectId !== e.id) continue;
    const v = from('bands', rec.bandId);
    if (v !== desc) return v;
  }
  // an item effect named by its trap icon (精打细算玩偶's round funds, server/match/builtinMeta.js): the item records
  // that show that icon
  const items = e.iconKind === 'item' && typeof e.iconId === 'string' ? data.getRaw('items') : null;
  for (const rec of items && typeof items === 'object' ? Object.values(items) : []) {
    if (rec?.iconId !== e.iconId) continue;
    const v = from('items', rec.id);
    if (v !== desc) return v;
  }
  return desc;
}

/**
 * The 强化效果 button and its list (`effects`: the own m.private.effects, or the watched teammate's: m.field / the
 * spectated battle's). The theme's button sprites when the season has them (`seasonSkin/buff_btn_clickable`, opened
 * `buff_btn_opened`), a look-alike otherwise; nothing when there is no effect [ASSUMED·화면: an official CN prep screen of
 * a round 13 shows no such button left of the 🔍; whether it hides only when empty is not seen].
 * @param {{ effects: any[]|null|undefined }} props
 */
export function BuffButton({ effects }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const list = (Array.isArray(effects) ? effects : []).filter((e) => e && (e.name || e.desc));
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc); };
  }, [open]);
  useEffect(() => { if (!list.length && open) setOpen(false); }, [list.length, open]);
  if (!list.length) return null;
  const m = data.get('assets');
  const sprite = uiUrl(m, `seasonSkin/${open ? 'buff_btn_opened' : 'buff_btn_clickable'}`);
  const bg = localAsset('ui/battle', 'bg_player_info');
  return html`<div class=${open ? 'buffs is-open' : 'buffs'} ref=${root}>
    <button type="button" class=${sprite ? 'buffs__btn tapx has-sprite' : 'buffs__btn tapx'} style=${sprite ? `--buff-sprite:url("${sprite}")` : undefined}
      aria-expanded=${open} aria-label=${t('生效中的效果')} title=${t('生效中的效果')} data-testid="check-buff"
      onKeyDown=${(e) => { if (e.key === ' ') e.stopPropagation(); }} onClick=${() => setOpen((o) => !o)}>
      ${sprite ? null : html`<${GIcon} name="bolt" class="buffs__ic" />`}<b class="buffs__n num">${list.length}</b>
    </button>
    ${open ? html`<div class="buffs__dlg" role="dialog" aria-label=${t('生效中的效果')} style=${bg ? `--buff-bg:url("${bg}")` : undefined}>
      <ul class="buffs__list">${list.map((e, i) => html`<li key=${e.id ?? i} class=${`buffs__row buffs__row--${e.iconKind || 'x'}`}>
        <span class="buffs__icon"><${Img} src=${effectIconUrl(m, e)} fallback=${html`<${GIcon} name="bolt" />`} /></span>
        <div class="buffs__text">
          <p class="buffs__head"><b class="buffs__name">${tName(e.name) || t('效果')}</b><span class="buffs__kind">${t(KIND[e.iconKind] || '')}${e.counterText ? ` · ${bountyCounterText(e)}` : e.counter != null && e.counter !== '' ? ` · ${e.counter}` : ''}</span></p>
          ${Number.isFinite(e.roundFunds) ? html`<p class="buffs__desc">${t('每回合开始时额外获得 {n} 资金', { n: e.roundFunds })}${e.stack > 1 ? html` <span class="buffs__kind">${t('已使用 {n} 个', { n: e.stack })}</span>` : null}</p>`
            : html`<${RichText} as="p" class="buffs__desc" text=${effectDesc(e)} />`}
        </div>
      </li>`)}</ul>
    </div>` : null}
  </div>`;
}
