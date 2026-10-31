// ui/underframeArt.js — the official selection menu of a tapped own piece, drawn by ui/underframe.js when the local
// extract has its sprites (else the original diamond and plates stay — upstream-PR-able). docs/rules/ui.md 「선택 메뉴」.
//
// Source: ui/autochess/[uc]autochessbattle.ab `act2autochess_panel_character_menu` (AutoChessCharacterMenuPanel, a
// WORLD-space canvas) and the panel it loads for a field piece, arts/ui/[uc]battlecommon.ab `underframe_panel`
// (UIBattleUnderframePanel). What the client shows (AutoChessCharacterMenuPanel _RenderBattleField / _RenderHand):
//   * a field piece → underframe_panel at its foot: the glowing diamond `sprite_character_menu_frame` (a 35 % black
//     copy under it), 撤退 `btn_escape` on the upper-left edge (`btn_withdraw`, tap area `hotspot` 220²), and — in the
//     prep, not for a summon — the 出售 plate `util_btn` (AutoChessUnderFramePanelButton SELL: `btn_bg_yellow`, black
//     `icon_sell`, the text, the price `img_bg_price_enough` "+N") at `_underFramePanelBtnParamSellPos`; the panel
//     does not block presses (`dontBlockClick`), so the pieces under it stay pressable; for an operator in the prep
//     (`showSkillBtn`) the skill button `group_skill` on the lower-right edge (AutoChessUnderFrameSkillButton): only for
//     a skill that is not PASSIVE (and `needToDisplay`: no pool skill prefab sets `_hidden`) — its icon `btn_skill` (a
//     press does nothing), the not-ready bar `sprite_skill_notready` with `text_sp_progress` "0/N" (SP cost), and, when
//     the skill has a range object of its own other than the unit's (not hidden by its prefab — game/range.js
//     skillButton), the range toggle `toggle_skill_range` (off at first; on → the field shows the skill's range,
//     GridRangeDrawer TurnOnSkill, off → the attack range, TurnOn). Its AUTO mark and stop sign are inactive objects the
//     script only enables, so they never show; the charge count `panel_skill_amount` needs a ready skill
//     (`IsAvailable`) with maxChargeTime > 1, which the prep's "0/N" never is [추정·엔진: IsAvailable in the prep not read].
//   * a bench / temp piece → no diamond: the menu button `btn_panel_root` (AutoChessCharacterMenuButton) — the black
//     flag `img_btn_bg_all` and the same plate at 0.66 (SELL yellow, DESTROY `btn_bg_red` + `icon_destory` for an
//     item); a summon gets nothing. Both display settings have `needRotate`: _RotateIfNeed turns `bg_offset` 90° (the
//     flag's tip, drawn pointing left, then points down at the piece) and moves it to `rotatedOffsetPos` (0, 60), and
//     puts the plate, unrotated, at `btn_util_root`.TransformPoint(`rotatedPos` (−100, −6)) = (6, 190): above the piece.
// Both lie on the ground plane under the piece like the direction selector (ui/placeArt.js; an official capture shows
// the bench plate's square icon foreshortened 0.82 vertically). Scales: the underframe uses the selector's (its 301
// units × 2.5 = DIR_HALF_TILES tiles) [추정·화면: no capture of a field piece's menu yet — at it the two plates come out
// the same size, 1.06 / 0.99 tile]; the bench menu is measured on an official capture (the plate's yellow, 101 units,
// ≈ 0.99 tile; its flag tip 94 units and the plate 200 units above the piece's foot both match it). The PC key cap of
// `pc_key_holder` is drawn as a small dark key [추정·자료 없음: its prefab is not in these bundles].

import { html } from './components.js';
import { localAsset } from '../data.js';
import { dirBasis, DIR_HALF_TILES } from './placeArt.js';
import { t } from '../../../shared/i18n.js';

/** Scale of panel_direction_selector: its local units → the battle UI's world canvas units. */
const SELECTOR_SCALE = 2.5;
/** underframe_panel `root` scale. */
const ROOT_SCALE = 2;
/** The bench menu's util_btn scale (button_root / util_btn 0.66). */
const MENU_UTIL_SCALE = 0.66;
/** The bench menu's units in the selector-derived canvas units (official capture: 0.0098 tile per unit). */
const MENU_SCALE = 2.83;
// underframe_panel (root units; y down = the prefab's y negated)
const FRAME = 560 * 1.62;            // image_underframe(_shadow): the 560 root stretched, scale 1.62
const WITHDRAW = { at: [-195, -195], size: 190, hit: 220, key: [-79, -91] };
const SELL_POS = [208, -219];        // _underFramePanelBtnParamSellPos
const DESTROY_POS = [-195, -195];    // _underFramePanelBtnParamDestroyPos
// util_btn (relative to its centre): the plate (btn_bg_* 286 × 203, tight-packed: the PNG lacks 16.08 px on the left),
// its collider, icon, text and price
const UTIL = {
  plate: { at: [6.59, -15.84], w: 286, h: 203, packX: 16.08, packW: 269.92 },
  hit: { at: [6.59 - 15.93, -15.84 - 7.16], w: 155.07, h: 124.1 },
  icon: { at: [-11.1, -56.2], size: 68 },
  text: { at: [-14.6, 4.7], size: 32 },
  price: { at: [57.4, -101.9], w: 164, h: 78, text: [16.9 + 70.43 / 2, -10.3], size: 39 },
};
const UF_KEY = [6.59 - 92, -15.84 - 86];   // underframe util_btn btn/pc_key_holder
const MENU_KEY = [6.59 - 119, -15.84 - 100]; // menu util_btn btn/pc_key_holder
const MENU_HIT = { at: [6.59 - 14.42, -15.84], w: 151.89, h: 130 }; // menu util_btn btn/collider
// the bench menu (btn_panel_root units × MENU_SCALE), rotated: bg img_btn_bg_all 325 × 225 × 0.66 at (141, 0) of
// bg_offset → (0, 141 + 60) with its tip down; the plate at (6, 190)
const MENU_BG = { at: [0, -201 * MENU_SCALE], w: 325 * 0.66 * MENU_SCALE, h: 225 * 0.66 * MENU_SCALE };
const MENU_UTIL = [6 * MENU_SCALE, -190 * MENU_SCALE];
const KEY = 46;                      // the drawn key cap (root units)
// group_skill (190², centre (195, 195) of the root) and its children, relative to that centre
const SKILL = {
  at: [195, 195],
  icon: { at: [1, 3], w: 168, h: 176 },             // btn_skill
  bar: { at: [0, 140], w: 200, h: 80 },             // sprite_skill_notready
  sp: { at: [13.3, 118.5], size: 30 },              // text_sp_progress
  toggle: { at: [165, 10], w: 136, h: 138 },        // toggle_skill_range (image_off / image_on)
  link: { at: [165 - 68 - 1, 10 - 5], w: 22, h: 5 }, // its image_link (sprite_mask), at the toggle's left edge
};

/** The menu sprites when the local client art is installed, else null (the original underframe). */
export function underframeArt() {
  const frame = localAsset('ui/battlecommon', 'sprite_character_menu_frame');
  const escape = localAsset('ui/battlecommon', 'btn_escape');
  const yellow = localAsset('ui/battle', 'btn_bg_yellow');
  const red = localAsset('ui/battle', 'btn_bg_red');
  const flag = localAsset('ui/battle', 'img_btn_bg_all');
  const price = localAsset('ui/battle', 'img_bg_price_enough');
  const sell = localAsset('ui/battle', 'icon_sell');
  const destroy = localAsset('ui/battle', 'icon_destory');
  if (!(frame && escape && yellow && red && flag && price && sell && destroy)) return null;
  // the skill button's sprites (an older extract lacks them: no skill button)
  const notready = localAsset('ui/battlecommon', 'sprite_skill_notready');
  const rangeOff = localAsset('ui/battlecommon', 'sprite_skill_range_off');
  const rangeOn = localAsset('ui/battlecommon', 'sprite_skill_range_on');
  const link = localAsset('ui/battlecommon', 'sprite_mask');
  const skill = notready && rangeOff && rangeOn && link ? { notready, rangeOff, rangeOn, link } : null;
  return { frame, escape, yellow, red, flag, price, sell, destroy, skill };
}

/**
 * Ground-plane basis of the menu canvas at a tile: local units = the world canvas units of the battle UI (x right,
 * y down on screen). Kept unmirrored on the mirrored half of the Final Assault prep: 撤退 stays on the left.
 * @returns {{ m: number[], pt: (x: number, y: number) => [number, number] } | null}
 */
export function menuBasis(g) {
  const b = dirBasis(g, DIR_HALF_TILES / SELECTOR_SCALE);
  if (!b) return null;
  let [a, bb, c, d, e, f] = b.m;
  if (a < 0) { a = -a; bb = -bb; }
  return { m: [a, bb, c, d, e, f], pt: (x, y) => [a * x + c * y + e, bb * x + d * y + f] };
}

/** Client-px bounding box of a local rect (centre, size) through a basis. */
function boxOf(basis, [cx, cy], w, h) {
  const xs = [], ys = [];
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const [x, y] = basis.pt(cx + dx * w / 2, cy + dy * h / 2);
    xs.push(x); ys.push(y);
  }
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

const add = (p, q, k = 1) => [p[0] + q[0] * k, p[1] + q[1] * k];

/**
 * Where everything sits, in menu canvas units: the tap areas and key caps of the buttons shown (centre, size), the
 * util plate's origin and scale, the skill group's centre and its range toggle. `onBoard` = the underframe, else the
 * bench menu; `skill` = game/range.js skillButton (the underframe only).
 * @param {{ retreat: boolean, sell: number|null, destroy: boolean }} actions
 * @param {{ grid: any } | null} [skill]
 */
export function menuLayout(actions, onBoard, skill = null) {
  const R = ROOT_SCALE;
  const util = actions.sell != null || actions.destroy ? (onBoard
    ? { at: (actions.destroy ? DESTROY_POS : SELL_POS).map((v) => v * R), k: R, key: UF_KEY, hit: UTIL.hit }
    : { at: MENU_UTIL, k: MENU_UTIL_SCALE * MENU_SCALE, key: MENU_KEY, hit: MENU_HIT }) : null;
  return {
    withdraw: onBoard && actions.retreat && !actions.destroy
      ? { at: WITHDRAW.at.map((v) => v * R), hit: WITHDRAW.hit * R, key: add(WITHDRAW.at, WITHDRAW.key).map((v) => v * R) } : null,
    util: util && { ...util, hit: { at: add(util.at, util.hit.at, util.k), w: util.hit.w * util.k, h: util.hit.h * util.k }, keyAt: add(util.at, util.key, util.k) },
    skill: onBoard && skill ? { at: SKILL.at.map((v) => v * R), toggle: skill.grid ? add(SKILL.at, SKILL.toggle.at).map((v) => v * R) : null } : null,
  };
}

/**
 * Client-px rect the menu's buttons cover (the diamond itself lies under the detail card): for the detail card / bond
 * popup placement (ui/underframe.js underframeRect).
 */
export function menuRect(g, actions, onBoard, skill = null) {
  const basis = menuBasis(g);
  if (!basis) return null;
  const L = menuLayout(actions, onBoard, skill);
  const boxes = [boxOf(basis, [0, 0], 1, 1)];
  if (L.withdraw) boxes.push(boxOf(basis, L.withdraw.at, L.withdraw.hit, L.withdraw.hit));
  if (L.util) boxes.push(boxOf(basis, add(L.util.at, UTIL.plate.at, L.util.k), UTIL.plate.w * L.util.k, UTIL.plate.h * L.util.k),
    boxOf(basis, add(L.util.at, UTIL.price.at, L.util.k), UTIL.price.w * L.util.k, UTIL.price.h * L.util.k));
  if (!onBoard) boxes.push(boxOf(basis, MENU_BG.at, MENU_BG.h, MENU_BG.w)); // turned 90°
  if (L.skill) boxes.push(boxOf(basis, add(L.skill.at, SKILL.bar.at, ROOT_SCALE), SKILL.bar.w * ROOT_SCALE, SKILL.bar.h * ROOT_SCALE));
  if (L.skill?.toggle) boxes.push(boxOf(basis, L.skill.toggle, SKILL.toggle.w * ROOT_SCALE, SKILL.toggle.h * ROOT_SCALE));
  return {
    left: Math.min(...boxes.map((b) => b.left)), top: Math.min(...boxes.map((b) => b.top)),
    right: Math.max(...boxes.map((b) => b.right)), bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
}

/** A key cap (pc_key_holder) at a local point. */
function KeyCap({ at, label, k }) {
  if (!label) return null;
  const s = KEY * k;
  return html`<g class="ufa__key" transform=${`translate(${at[0]} ${at[1]})`}>
    <rect x=${-s / 2} y=${-s / 2} width=${s} height=${s} rx=${s * 0.12} />
    <text dominant-baseline="central" text-anchor="middle" font-size=${s * 0.62}>${label}</text>
  </g>`;
}

/** The util plate (AutoChessUnderFramePanelButton / the menu button's util_btn), drawn at its origin. */
function UtilPlate({ art, kind, price, text }) {
  const P = UTIL.plate;
  const [px, py] = P.at;
  const icon = UTIL.icon;
  const pr = UTIL.price;
  return html`<g class=${`ufa__util ufa__util--${kind}`}>
    <image href=${kind === 'destroy' ? art.red : art.yellow} x=${px - P.w / 2 + P.packX} y=${py - P.h / 2} width=${P.packW} height=${P.h} preserveAspectRatio="none" />
    <image class="ufa__icon" href=${kind === 'destroy' ? art.destroy : art.sell} x=${icon.at[0] - icon.size / 2} y=${icon.at[1] - icon.size / 2} width=${icon.size} height=${icon.size} />
    <text class="ufa__text" x=${UTIL.text.at[0]} y=${UTIL.text.at[1]} font-size=${UTIL.text.size} text-anchor="middle" dominant-baseline="central">${text}</text>
    ${price != null ? html`<g transform=${`translate(${pr.at[0]} ${pr.at[1]})`}>
      <image href=${art.price} x=${-pr.w / 2} y=${-pr.h / 2} width=${pr.w} height=${pr.h} />
      <text class="ufa__price" x=${pr.text[0]} y=${pr.text[1]} font-size=${pr.size} text-anchor="end" dominant-baseline="central">${`+${price}`}</text>
    </g>` : null}
  </g>`;
}

/** The skill group (AutoChessUnderFrameSkillButton), drawn at its centre in root units. */
function SkillGroup({ art, skill, rangeOn }) {
  const S = SKILL;
  const img = (href, { at, w, h }, cls = null) => html`<image class=${cls} href=${href} x=${at[0] - w / 2} y=${at[1] - h / 2} width=${w} height=${h} preserveAspectRatio="none" />`;
  return html`<g class="ufa__skill">
    ${skill.icon ? img(skill.icon, S.icon) : html`<rect class="ufa__skillnone" x=${S.icon.at[0] - S.icon.w / 2} y=${S.icon.at[1] - S.icon.h / 2} width=${S.icon.w} height=${S.icon.h} />`}
    ${img(art.skill.notready, S.bar)}
    ${skill.grid ? html`<g class="ufa__range">${img(art.skill.link, S.link)}${img(rangeOn ? art.skill.rangeOn : art.skill.rangeOff, S.toggle)}</g>` : null}
    <text class="ufa__sp" x=${S.sp.at[0]} y=${S.sp.at[1]} font-size=${S.sp.size} text-anchor="middle" dominant-baseline="central">${`0/${skill.spCost}`}</text>
  </g>`;
}

/**
 * The diamond layer (field piece only) — under the detail card, like the original's .uframe--dia.
 * @param {{ g: any, art: any }} props
 */
export function UnderframeDiamondArt({ g, art }) {
  const basis = menuBasis(g);
  if (!basis) return null;
  const s = FRAME * ROOT_SCALE;
  const [a, b, c, d, e, f] = basis.m;
  return html`<svg class="ufa" aria-hidden="true" style=${`left:${-g.x}px;top:${-g.y}px`}><g transform=${`matrix(${a} ${b} ${c} ${d} ${e} ${f})`}>
    <image class="ufa__shadow" href=${art.frame} x=${-s / 2} y=${-s / 2} width=${s} height=${s} />
    <image href=${art.frame} x=${-s / 2} y=${-s / 2} width=${s} height=${s} />
  </g></svg>`;
}

/**
 * The buttons layer: the art (pointer-transparent SVG on the ground plane) + one transparent <button> per button over
 * its tap area (hotspot / collider), carrying the hotkey label for assistive tech and the tests.
 * @param {{ g: any, art: any, actions: { retreat: boolean, sell: number|null, destroy: boolean }, onBoard: boolean,
 *   keys: { retreat: string, sell: string }, busy?: boolean, onRetreat?: () => void, onSell?: () => void, onDestroy?: () => void,
 *   skill?: { icon: string|null, spCost: number, grid: any } | null, skillRange?: boolean, onSkillRange?: (on: boolean) => void }} props
 */
export function UnderframeButtonsArt({ g, art, actions, onBoard, keys, busy = false, onRetreat, onSell, onDestroy, skill = null, skillRange = false, onSkillRange }) {
  const basis = menuBasis(g);
  if (!basis) return null;
  const L = menuLayout(actions, onBoard, art.skill ? skill : null);
  const [a, b, c, d, e, f] = basis.m;
  const stop = (ev) => ev.stopPropagation();
  const R = ROOT_SCALE;
  const W = L.withdraw;
  const U = L.util;
  const kind = actions.destroy ? 'destroy' : 'sell';
  // the layer's box sits on the piece (g): the SVG and the tap boxes are placed back to client px from there
  const hitStyle = (box) => `left:${box.left - g.x}px;top:${box.top - g.y}px;width:${box.right - box.left}px;height:${box.bottom - box.top}px`;
  // the tap boxes first: the art's hover / pressed / disabled looks follow them by sibling selectors (css/place-art.css)
  return html`${W ? html`<button type="button" class="uframe__btn uframe__btn--retreat ufa__hit" disabled=${busy} onPointerDown=${stop}
        style=${hitStyle(boxOf(basis, W.at, W.hit, W.hit))}
        onClick=${(ev) => { stop(ev); onRetreat?.(); }} title=${actions.sell != null ? t('撤退至整备区（{key}）', { key: keys.retreat }) : t('撤退至整备区')}
        aria-label=${t('撤退')} aria-keyshortcuts=${actions.sell != null ? keys.retreat : undefined}>
      <span class="uframe__label ufa__sr">${actions.sell != null ? t('撤退[{key}]', { key: keys.retreat }) : t('撤退')}</span>
    </button>` : null}
    ${U && actions.sell != null ? html`<button type="button" class="uframe__btn uframe__btn--sell ufa__hit" disabled=${busy} onPointerDown=${stop}
        style=${hitStyle(boxOf(basis, U.hit.at, U.hit.w, U.hit.h))}
        onClick=${(ev) => { stop(ev); onSell?.(); }} title=${t('出售（+{sell} 资金，{key}）', { sell: actions.sell, key: keys.sell })}
        aria-label=${t('出售，获得 {sell} 资金', { sell: actions.sell })} aria-keyshortcuts=${keys.sell}>
      <span class="uframe__label ufa__sr">${t('出售[{key}]', { key: keys.sell })}</span>
    </button>` : null}
    ${U && actions.destroy ? html`<button type="button" class="uframe__btn uframe__btn--destroy ufa__hit" disabled=${busy} onPointerDown=${stop}
        style=${hitStyle(boxOf(basis, U.hit.at, U.hit.w, U.hit.h))}
        onClick=${(ev) => { stop(ev); onDestroy?.(); }} title=${t('销毁道具')} aria-label=${t('销毁')}>
      <span class="uframe__label ufa__sr">${t('销毁')}</span>
    </button>` : null}
    ${L.skill?.toggle ? html`<button type="button" class="uframe__btn uframe__btn--range ufa__hit" onPointerDown=${stop}
        style=${hitStyle(boxOf(basis, L.skill.toggle, SKILL.toggle.w * R, SKILL.toggle.h * R))}
        onClick=${(ev) => { stop(ev); onSkillRange?.(!skillRange); }} title=${t('技能范围')} aria-label=${t('技能范围')} aria-pressed=${skillRange ? 'true' : 'false'}>
      <span class="uframe__label ufa__sr">${t('技能范围')}</span>
    </button>` : null}
    <svg class="ufa ufa--btns" aria-hidden="true" style=${`left:${-g.x}px;top:${-g.y}px`}><g transform=${`matrix(${a} ${b} ${c} ${d} ${e} ${f})`}>
      ${onBoard ? null : html`<image class="ufa__flag" href=${art.flag} x=${-MENU_BG.w / 2} y=${-MENU_BG.h / 2} width=${MENU_BG.w} height=${MENU_BG.h}
        preserveAspectRatio="none" transform=${`translate(${MENU_BG.at[0]} ${MENU_BG.at[1]}) rotate(-90)`} />`}
      ${W ? html`<g class="ufa__withdraw">
        <image class="ufa__shadow" href=${art.escape} x=${W.at[0] - WITHDRAW.size * R / 2} y=${W.at[1] - WITHDRAW.size * R / 2} width=${WITHDRAW.size * R} height=${WITHDRAW.size * R} preserveAspectRatio="none" />
        <image href=${art.escape} x=${W.at[0] - WITHDRAW.size * R / 2} y=${W.at[1] - WITHDRAW.size * R / 2} width=${WITHDRAW.size * R} height=${WITHDRAW.size * R} preserveAspectRatio="none" />
        <${KeyCap} at=${W.key} label=${actions.sell != null ? keys.retreat : ''} k=${R} />
      </g>` : null}
      ${U ? html`<g transform=${`translate(${U.at[0]} ${U.at[1]}) scale(${U.k})`}>
        <${UtilPlate} art=${art} kind=${kind} price=${actions.sell != null ? actions.sell : null} text=${kind === 'destroy' ? t('销毁') : t('出售')} />
      </g>
      ${actions.sell != null ? html`<${KeyCap} at=${U.keyAt} label=${keys.sell} k=${R} />` : null}` : null}
      ${L.skill ? html`<g transform=${`translate(${L.skill.at[0]} ${L.skill.at[1]}) scale(${R})`}>
        <${SkillGroup} art=${art} skill=${skill} rangeOn=${!!(L.skill.toggle && skillRange)} />
      </g>` : null}
    </g></svg>`;
}

