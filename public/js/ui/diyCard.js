// The 干员调配 card of a 自选 pick (auto_chess_deploy_char_item_view, 140×266 canvas units; CN client): the slab, the
// portrait on its backing with the bottom shade and frame, the profession corner, the skill and module boxes, the left
// level column (obj_left_info_part: the tier mark, the normal / elite level on its promotion phase, the 潜能), the
// rarity, the name (txt_char_name bestFit — the font shrinks until the name fits, never an ellipsis) and the bonds on
// their mint badges. Two screens draw it: 规程's 3/3 确定自选编队 (screens/diyChoose.js: a row of cards, a tap chooses)
// and the 自选编队 tab of 干员调配 (screens/diy.js: a card per filled lineup slot, 123 wide — css/screens/loadout.css
// `.diy-slot .dccard`). The level column is on both (maintainer decision 2026-11-19; until then the 3/3 card left it out,
// maintainer decision 2026-11-11). Sizes are canvas units times --u (css/screens/diychoose.css `.dccard*`); the art
// comes as custom properties (diyCardArtVars on an ancestor) with plain fills when the extract is absent.

import { useRef } from '../../vendor/hooks.module.js';
import { html, TierChip } from './components.js';
import { chessPortraitUrl, profIconUrl, bondIconUrl, skillRecordIconUrl, moduleTypeIconUrl, uiUrl } from './assetUrls.js';
import { skinArt, skinPic } from './skins.js';
import { slotRecord } from './diyModel.js';
import { opsOf } from './loadoutModel.js';
import { useFitLine } from './fitLine.js';
import { data, localAsset } from '../data.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * The card's sprites as custom properties (`--dc-*`; the season's 3/3 extract `diyChooseArt/…`), for the style of an
 * ancestor of the cards: `[name, url]` pairs, absent ones left out (the CSS fills).
 * @param {any} m the manifest with the 3/3 art (ui/assetUrls.js withDiyChooseArt)
 */
export function diyCardArt(m) {
  const art = (n) => uiUrl(m, `diyChooseArt/${n}`);
  return [
    ['--dc-slab', art('img_char_chess_normal_bg')], ['--dc-cardbg', art('img_char_card_bg')], ['--dc-frame', art('img_cahr_card_frame')],
    ['--dc-shade', art('img_char_card_bg_mask') || localAsset('ui/outer', 'img_char_card_bg_mask')],
    ['--dc-outline', art('img_char_card_select_outline')], ['--dc-bond', art('bkg_char_card_bond_active')],
    ['--dc-lvbg', art('img_char_level_normal_bg')], ['--dc-potbg', art('potential_bg')],
  ].filter(([, v]) => v);
}

/** `--name:url("…")` declarations of [name, url] pairs. */
export const cssUrlVars = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => `${k}:url("${v}")`).join(';');

/** txt_char_name bestFit (1–18): down to 6 px, never wrapped (ui/fitLine.js). */
export const CARD_NAME_FIT = Object.freeze({ min: 6, wrap: false, step: 0.5 });

const phaseOf = (status) => Math.max(0, Math.min(2, Number(status?.phase ?? 2) | 0));

/**
 * The left level column (obj_left_info_part): the normal form's level on its promotion phase (char_elite_base_<phase>,
 * #acacac 16), the elite form's (char_elite_gold_<phase>, #fff3b6 17), the operator's 潜能 (potential_<p−1>_small on
 * potential_bg). The two forms are the slot's (shared/diy.js: E2 Lv1 and E2 Lv60).
 */
function LevelColumn({ m, rec, elite, potential }) {
  const lineup = (n) => uiUrl(m, `diyLineupArt/${n}`);
  const ph = (s, gold) => lineup(`char_elite_${gold ? 'gold' : 'base'}_${phaseOf(s)}`);
  const n = ph(rec?.status, false);
  const g = ph(elite?.status, true);
  const pot = lineup(`potential_${Math.max(0, Math.min(5, potential - 1))}_small`);
  return html`<span class="dccard__col" aria-hidden="true">
    <i class="dccard__colbg"></i>
    ${n ? html`<i class="dccard__ph is-n" style=${`--ph:url("${n}")`}></i>` : null}<b class="dccard__clv is-n">${rec?.status?.level ?? '—'}</b>
    ${g ? html`<i class="dccard__ph is-g" style=${`--ph:url("${g}")`}></i>` : null}<b class="dccard__clv is-g">${elite?.status?.level ?? '—'}</b>
    <span class="dccard__pot"><i class="dccard__potbk"></i>${pot ? html`<i class="dccard__potic" style=${`--pot:url("${pot}")`}></i>`
      : html`<b class="dccard__potn">${potential}</b>`}</span>
  </span>`;
}

/**
 * One 自选 pick as the 干员调配 card (see the header). A button: `onTap(slotId)`.
 * @param {{ m: any, slotId: string, pick: any, tier: number, chosen?: boolean, off?: boolean, locked?: boolean,
 *   onTap: (slotId: string) => void, ops?: Record<string, any>|null, testid?: string, label?: string|null }} props
 *   `chosen` the select outline in the tier's colour (3/3), `off` 本局禁用 (3/3), `ops` the stored 潜能 / 练度 (潜能 of the
 *   column; none = the default), `label` the button's accessible name (the name and the state when absent)
 */
export function DiyCard({ m, slotId, pick, tier, chosen = false, off = false, locked = false, onTap, ops = null, testid = 'diy-choose-card', label = null }) {
  const skinCtx = skinArt(); // the operator's portrait in this browser's chosen skin (ui/skins.js skinPic)
  const nameRef = useRef(null);
  const D = { chess: data.get('chess'), backups: data.get('backups') };
  const rec = slotRecord(slotId, pick, D);
  const elite = slotRecord(slotId, pick, D, { elite: true });
  const name = rec?.name || pick?.charId || '?';
  useFitLine(nameRef, name, CARD_NAME_FIT);
  const sk = rec?.skill ? skillRecordIconUrl(m, rec.skill, { empty: false }) : null;
  const mod = elite?.module?.active ? elite.module : null;
  const modIcon = mod ? moduleTypeIconUrl(data.get('local'), mod.type) : null;
  const prof = profIconUrl(m, rec?.profession);
  const none = uiUrl(m, 'diyChooseArt/img_module_no');
  const lv = uiUrl(m, `chessLevelSprite/chess_level_icon_${tier}`);
  const ban = uiUrl(m, 'diyChooseArt/ban');
  const state = off ? t('本局禁用') : chosen ? t('已选择') : null;
  return html`<button type="button" class=${cx('dccard', chosen && 'is-on', off && 'is-off')} data-tier=${tier} data-slot=${slotId} data-char=${pick?.charId}
      data-testid=${testid} aria-pressed=${chosen ? 'true' : 'false'} aria-disabled=${off || locked ? 'true' : 'false'}
      aria-label=${label || null} title=${state ? `${name} · ${state}` : name} onClick=${() => onTap(slotId)}>
    <i class="dccard__slab" aria-hidden="true"></i>
    <span class="dccard__char" aria-hidden="true">
      <span class="dccard__por">${rec ? html`<img src=${skinPic(rec, 'portrait', skinCtx, { own: true }) || chessPortraitUrl(m, elite || rec)} alt="" draggable=${false} />` : null}</span>
      <i class="dccard__shade"></i><i class="dccard__frame"></i>
      <span class="dccard__prof">${prof ? html`<img src=${prof} alt="" draggable=${false} />` : null}</span>
      <span class="dccard__box is-skill">${sk || none ? html`<img src=${sk || none} alt="" draggable=${false} />` : null}</span>
      <span class="dccard__box is-mod">${modIcon || none ? html`<img src=${modIcon || none} alt="" draggable=${false} />` : null}</span>
    </span>
    ${rec ? html`<${LevelColumn} m=${m} rec=${rec} elite=${elite} potential=${opsOf(ops, pick?.charId).potential} />` : null}
    <span class="dccard__lv" aria-hidden="true">${lv ? html`<img src=${lv} alt="" draggable=${false} />` : html`<${TierChip} tier=${tier} size="sm" />`}</span>
    <span class="dccard__stars" aria-hidden="true">${'★'.repeat(Math.max(1, Math.min(6, Number(rec?.rarity) || 6)))}</span>
    <span class="dccard__name" ref=${nameRef}>${name}</span>
    <span class="dccard__bonds" aria-hidden="true">${(rec?.bonds || []).slice(0, 3).map((b) => {
      const u = bondIconUrl(m, b);
      return html`<i key=${b} class="dccard__bond" style=${u ? `--b:url("${u}")` : null}></i>`;
    })}</span>
    ${chosen ? html`<i class="dccard__sel" aria-hidden="true"></i>` : null}
    ${off ? html`<span class="dccard__ban" aria-hidden="true">${ban ? html`<img src=${ban} alt="" draggable=${false} />` : null}<b>${t('本局禁用')}</b></span>` : null}
  </button>`;
}
