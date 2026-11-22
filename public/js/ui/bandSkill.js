// ui/bandSkill.js — 规程's active 指令 on the match HUD: the player's strategy portrait, its detail, and its use (a press
// or a drag). Server side: m.private `bandSkill` and g.bandSkill (server/match/match/bandSkill.js). The layout follows the
// official HUD prefab (autochess_hud_panel `panel_skill` / `skill_view`, autochess_skill_drag_widget,
// autochess_hud_skill_detail_dialog) and the official screens; rules and evidence: docs/rules/ui.md 「규정 액티브 전략」.
//
//   - the round portrait with a 「查看」 bar on its left, at the right edge: under the ready button in the prep
//     (`skill_layout_prepare`), above the funds in a battle (`skill_layout_battle`); its ring tells usable / not now /
//     locked (variant_active / variant_passive / variant_invalid);
//   - over it the current cost (none at 0, red above the funds), under it the uses left (ROUND_RESET / ALL_LIMIT), the
//     cooldown's rounds (a clock) or a lock (a stage not unlocked yet);
//   - a 点击使用 stage (target NO_TARGET) is used by a press on the portrait; any other is dragged from it: an arrow from
//     the portrait to the pointer, the stage's target tip at the top, and only the pointed target's tile lit (a white
//     tile under it; a 调度中心 card is outlined) — the official screens light nothing else for an operator; a tile
//     指令 (MAP_TILE) also tints every tile it may take like a placement drag ('legal', gameLogic bandSkillTiles —
//     maintainer decision 2026-11-13, no official screen yet); a release on a target sends g.bandSkill with it,
//     anywhere else cancels;
//   - on a phone the target is the one under the finger and no name label shows (maintainer decision 2026-11-12).
// A press on the portrait while the 指令 cannot be used, and the 「查看」 bar, open the detail; the mouse shows it on hover.
// A strategy without an active stage shows the same portrait with the passive ring (variant_passive) and opens only its
// detail. Progress (m.private.bandSkill `tag` / `unlock`, server content/bands/progress.js): a stage whose table showTag
// is 'value_target' shows value/target in the pill (a locked one after its lock) and in its text's 「{@tag}」 /
// 「{@unlock}」; a passive's stage shows only in its text (maintainer decisions 2026-11-12).

import { useState, useEffect, useLayoutEffect, useRef } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { Img, RichText } from './gameComponents.js';
import { bandIconUrl } from './assetUrls.js';
import { actions } from './gameActions.js';
import { data } from '../data.js';
import { t, tParts, N_ } from '../../../shared/i18n.js';
import { GEO, PHASE } from '../../../shared/constants.js';
import { bandSkillTiles, tileKey } from './gameLogic.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The pointed target's tile (render/tiles.js style; its own group so the placement highlights stay). */
export const BAND_SKILL_HL = Object.freeze({ color: 0xffffff, fill: 0.32, line: 1, group: 'bandSkill' });
/** Pointer travel (px) before a press on the portrait becomes a drag. */
const DRAG_START = 8;

/** The stage's target tip (the table's `targetTip`; the client's texts — only the first is seen on an official screen). */
const TIPS = {
  AUTO_CHESS_BANDSKILL_TIPS_OPEARTOR_BATTLE: [N_('请指向{place}的干员'), N_('战场或整备区')],
  // [ASSUMED·화면] the three below: their client texts are not in the tables (bundle mix-Q)
  AUTO_CHESS_BANDSKILL_TIPS_OPEARTOR_SHOP: [N_('请指向{place}的干员'), N_('调度中心')],
  AUTO_CHESS_BANDSKILL_TIPS_EQUIP_SHOP: [N_('请指向{place}的装备'), N_('调度中心')],
  AUTO_CHESS_BANDSKILL_TIPS_BATTLEFIELD: [N_('请指向{place}的可用地块'), N_('战场')],
};
const TIP_BY_TARGET = { COMMON_CHESS: 'AUTO_CHESS_BANDSKILL_TIPS_OPEARTOR_BATTLE', MAP_TILE: 'AUTO_CHESS_BANDSKILL_TIPS_BATTLEFIELD' };

/** The tip of a stage's target ({ type, filter, tip }). */
export function bandSkillTip(target) {
  if (!target) return null;
  const key = TIPS[target.tip] ? target.tip
    : target.type === 'SHOP_SLOT' ? (target.filter === 'EQUIP' ? 'AUTO_CHESS_BANDSKILL_TIPS_EQUIP_SHOP' : 'AUTO_CHESS_BANDSKILL_TIPS_OPEARTOR_SHOP')
      : TIP_BY_TARGET[target.type];
  return key ? TIPS[key] : null;
}

/**
 * The counter under the portrait: { icon: 'lock'|'clock'|null, text } or null.
 * @param {any} bs m.private.bandSkill
 * @returns {{ icon: 'lock'|'clock'|null, text: string, value?: number, target?: number } | null}
 */
export function bandSkillCounter(bs) {
  if (!bs) return null;
  const vt = (p) => (p && Number.isFinite(p.value) && Number.isFinite(p.target) ? { value: p.value, target: p.target } : null);
  const shows = bs.showTag === 'value_target';
  if (bandSkillPassive(bs)) {
    const tag = shows ? vt(bs.tag) : null;
    return tag ? { icon: null, text: `${tag.value}/${tag.target}`, ...tag } : null;
  }
  if (bs.type !== 'ACTIVE') {
    const un = shows ? vt(bs.unlock) : null;
    return un ? { icon: 'lock', text: `${un.value}/${un.target}`, ...un } : { icon: 'lock', text: '' };
  }
  if (bs.cooldown > 0) return { icon: 'clock', text: String(bs.cooldown) };
  if (Number.isFinite(bs.usesLeft)) return { icon: null, text: String(bs.usesLeft) };
  return null;
}

/** A strategy without an active 指令 (bandSkillView's _bandPassiveView): a portrait and a detail, never used. */
export function bandSkillPassive(bs) {
  return !!bs && (bs.blocked === 'passive' || bs.type === 'PASSIVE');
}

/**
 * The stage text with its 「{@tag}」 / 「{@unlock}」 filled: (value/target) highlighted, or nothing when the server sends no
 * progress for it.
 * @param {string} text rich text (bands.json skills[i].descRaw, localised)
 * @param {any} bs m.private.bandSkill
 */
export function bandSkillText(text, bs) {
  const fill = (p) => (p && Number.isFinite(p.value) && Number.isFinite(p.target) ? `<@ba.vup>(${p.value}/${p.target})</>` : '');
  return String(text || '').replace(/\{@tag\}/g, () => fill(bs?.tag)).replace(/\{@unlock\}/g, () => fill(bs?.unlock));
}

/**
 * The g.bandSkill fields for what lies under a client point, or null when nothing there is the stage's target.
 * @param {any} bs m.private.bandSkill
 * @param {any} priv m.private
 * @param {{ piece?: { uid:number }|null, tile?: { row:number, col:number }|null }|null} hit view.pickAt
 * @param {Element|null} el the DOM element under the point (a 调度中心 card: `.shopbar__cards [data-slot]`)
 * @param {Set<string>|null} [usable] a MAP_TILE stage's usable board tiles 'r,c' (bandSkillTiles); a tile outside is none
 * @returns {null | { fields: object, tile?: [number, number], card?: Element }}
 */
export function bandSkillTarget(bs, priv, hit, el, usable = null) {
  const tg = bs?.target;
  if (!tg || !priv) return null;
  if (tg.type === 'COMMON_CHESS') {
    const uid = hit?.piece?.uid;
    if (!Number.isInteger(uid)) return null;
    const board = (Array.isArray(priv.board) ? priv.board : []).find((p) => p && p.uid === uid);
    const handIdx = (Array.isArray(priv.hand) ? priv.hand : []).findIndex((p) => p && p.uid === uid);
    const piece = board || (handIdx >= 0 ? priv.hand[handIdx] : null);
    if (!piece || (tg.filter === 'CHAR' && piece.kind !== 'chess')) return null;
    return { fields: { uid }, tile: board ? [board.row, board.col] : [GEO.HAND_ROW, handIdx] };
  }
  if (tg.type === 'SHOP_SLOT') {
    const card = el && typeof el.closest === 'function' ? el.closest('.shopbar__cards [data-slot]') : null;
    const slot = card ? Number(card.getAttribute('data-slot')) : NaN;
    const s = Number.isInteger(slot) ? priv.shop?.slots?.[slot] : null;
    if (!s || s.sold) return null;
    const want = tg.filter === 'EQUIP' ? 'item' : tg.filter === 'CHAR' ? 'chess' : null;
    if (want && s.kind !== want) return null;
    return { fields: { slot }, card };
  }
  if (tg.type === 'MAP_TILE') {
    const tile = hit?.tile;
    const F = GEO.FIELD;
    if (!tile || tile.row < F.r0 || tile.row > F.r1 || tile.col < F.c0 || tile.col > F.c1) return null;
    // the server judges the ground (the stage's groundPassable / buildable); an occupied tile is never PASSABLE_AND_BUILDABLE
    if (tg.filter === 'PASSABLE_AND_BUILDABLE' && (priv.board || []).some((p) => p && p.row === tile.row && p.col === tile.col)) return null;
    if (usable && !usable.has(tileKey(tile.row, tile.col))) return null;
    return { fields: { row: tile.row, col: tile.col }, tile: [tile.row, tile.col] };
  }
  return null;
}

const LOOK = html`<svg class="bskill__lookico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 10l4.2 4.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const CLOCK = html`<svg class="bskill__cico" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.2" fill="currentColor"/><path d="M6 3v3.2h2.6" stroke="#15171a" stroke-width="1.5" fill="none"/></svg>`;
const LOCK = html`<svg class="bskill__cico" viewBox="0 0 12 14" aria-hidden="true"><rect x="1" y="6" width="10" height="7.5" rx="1.6" fill="currentColor"/><path d="M3.4 6V4.3a2.6 2.6 0 015.2 0V6" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>`;

/** The drag arrow: from the portrait's centre (x0, y0) to the pointer (x1, y1), its head at the pointer. */
function Arrow({ x0, y0, x1, y1 }) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 4) return null;
  const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  return html`<svg class="bskill-arrow" aria-hidden="true">
    <defs>
      <linearGradient id="bskill-g" x1="0" x2="1"><stop offset="0" stop-color="#00ffbe" stop-opacity="0" /><stop offset=".35" stop-color="#00e0a8" stop-opacity=".55" /><stop offset="1" stop-color="#2ef0b4" stop-opacity=".95" /></linearGradient>
      <pattern id="bskill-d" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.5" fill="#c9fff0" opacity=".7" /></pattern>
    </defs>
    <g transform=${`translate(${x0} ${y0}) rotate(${ang})`}>
      <rect class="bskill-arrow__glow" x="0" y="-26" width=${Math.max(0, len - 20)} height="52" />
      <rect x="36" y="-11" width=${Math.max(0, len - 64)} height="22" fill="url(#bskill-g)" />
      <rect x=${len * 0.45} y="-7" width=${Math.max(0, len * 0.55 - 40)} height="14" fill="url(#bskill-d)" />
      <circle class="bskill-arrow__glow" cx=${len} cy="0" r="52" />
      <path d=${`M${len} 0 l-48 -31 l16 31 l-16 31z`} fill="#2ef0b4" stroke="#d6fff4" stroke-width="1.6" />
      <path d=${`M${len - 26} 0 l-48 -31 l16 31 l-16 31z`} fill="#00ffbe" opacity=".35" />
    </g>
  </svg>`;
}

/**
 * @param {{ view: any, priv: any, phase: string, combat: boolean, place?: any }} props
 *   view: the field view (render/app.js or ui/fallbackField.js: pickAt, highlightTiles); combat: a battle phase on screen;
 *   place: the own placement context (gameLogic placementContext — the stage, deploy field and overrides a tile 指令 reads)
 */
export function BandSkill({ view, priv, phase, combat, place = null }) {
  const bs = priv?.bandSkill || null;
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(null); // { x0, y0, x, y, ok }
  const press = useRef(null);
  const ring = useRef(null);
  const card = useRef(null);
  const prep = phase === PHASE.PREP && !combat;
  const canUse = !!bs && prep && !!bs.usable;
  const target = bs?.target?.type || 'NO_TARGET';

  const mark = (res) => {
    if (card.current && card.current !== res?.card) card.current.classList.remove('is-skill-target');
    card.current = res?.card || null;
    if (card.current) card.current.classList.add('is-skill-target');
    try { view?.highlightTiles?.(res?.tile ? [res.tile] : [], BAND_SKILL_HL); } catch { /* cosmetic */ }
  };
  // a tile 指令's usable tiles, tinted for the whole drag (the placement drag's own look: 'legal')
  const area = useRef(null);
  const showArea = (tiles) => {
    area.current = tiles ? new Set(tiles.map(([r, c]) => tileKey(r, c))) : null;
    try { view?.highlightTiles?.(tiles || [], 'legal'); } catch { /* cosmetic */ }
  };
  const stop = () => { press.current = null; setDrag(null); mark(null); if (area.current) showArea(null); };
  // a phase change, the 指令 going unusable or the view going away ends a drag
  useEffect(() => { if (!canUse && press.current) stop(); }, [canUse]);
  // a layout effect: the 'legal' tint is the placement drag's too, and Preact 11 would clear it after the next paint
  useLayoutEffect(() => () => { mark(null); if (area.current) showArea(null); }, [view]);
  useEffect(() => {
    if (!drag) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') stop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [!!drag]);
  if (!bs) return null;

  // a taken 指令 (更换指令: bs.commandBandId) shows that strategy's portrait, name and stage text
  const bandId = bs.commandBandId || priv.bandId;
  const rec = data.lookup('bands', bandId);
  const raw = data.lookupRaw('bands', bandId);
  const stage = rec?.skills?.[bs.stage] || raw?.skills?.[bs.stage] || null;
  const desc = bandSkillText(stage?.descRaw || stage?.desc || '', bs);
  const counter = bandSkillCounter(bs);
  const cost = Number(bs.cost) || 0;
  const short = cost > (Number(priv.funds) || 0);
  const passive = bandSkillPassive(bs);
  const locked = !passive && bs.type !== 'ACTIVE';
  const tip = bandSkillTip({ ...(bs.target || {}), tip: stage?.target?.tip ?? bs.target?.tip ?? null });

  const resolve = (x, y) => {
    let el = null;
    try { el = document.elementFromPoint(x, y); } catch { /* none */ }
    const hit = target === 'SHOP_SLOT' ? null : view?.pickAt?.(x, y) ?? null;
    return bandSkillTarget(bs, priv, hit, el, area.current);
  };
  const onDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const r = ring.current?.getBoundingClientRect();
    press.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: r ? r.left + r.width / 2 : e.clientX, y0: r ? r.top + r.height / 2 : e.clientY, moved: false, res: null };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
  };
  const onMove = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.moved) {
      if (!canUse || target === 'NO_TARGET' || Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_START) return;
      p.moved = true;
      setOpen(false);
      // without the stage (no placement context) nothing is tinted and the server alone judges the tile
      if (target === 'MAP_TILE' && place?.stage) showArea(bandSkillTiles(place, bs.target.filter, bs.chests));
    }
    p.res = resolve(e.clientX, e.clientY);
    mark(p.res);
    setDrag({ x0: p.x0, y0: p.y0, x: e.clientX, y: e.clientY, ok: !!p.res });
  };
  const onUp = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (p.moved) {
      const res = p.res;
      stop();
      if (res) actions.bandSkill(res.fields);
      return;
    }
    press.current = null;
    if (canUse && target === 'NO_TARGET') { setOpen(false); actions.bandSkill({}); } else setOpen((o) => !o);
  };

  const name = rec?.name || raw?.name || '';
  return html`
    <div class=${cx('bskill', combat ? 'is-battle' : 'is-prep', canUse ? 'is-on' : passive ? 'is-passive' : locked ? 'is-locked' : 'is-off', drag && 'is-drag', open && 'is-open')}
      onMouseEnter=${() => { if (!press.current) setOpen(true); }} onMouseLeave=${() => { if (!press.current) setOpen(false); }}>
      <button type="button" class="bskill__look" aria-expanded=${open} onClick=${() => setOpen((o) => !o)}>${LOOK}<span>${t('查看')}</span></button>
      <div class="bskill__band" ref=${ring} role="button" tabIndex="0"
        aria-label=${`${name}${canUse && target === 'NO_TARGET' ? ` · ${t('点击使用')}` : canUse ? ` · ${t('拖拽使用')}` : ''}`}
        onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${stop} onLostPointerCapture=${() => { if (press.current?.moved) stop(); }}
        onKeyDown=${(e) => { if ((e.key === 'Enter' || e.key === ' ') && canUse && target === 'NO_TARGET') { e.preventDefault(); e.stopPropagation(); actions.bandSkill({}); } }}>
        <span class="bskill__ring"><${Img} src=${bandIconUrl(data.get('assets'), bandId)} class="bskill__icon"
          fallback=${html`<span class="bskill__glyph">${[...(name || '?')][0]}</span>`} /></span>
        ${cost > 0 ? html`<b class=${cx('bskill__cost', 'num', short && 'is-short')}>${cost}</b>` : null}
        ${counter ? html`<span class=${cx('bskill__count', 'num', counter.text === '0' && 'is-zero')}>${counter.icon === 'clock' ? CLOCK : counter.icon === 'lock' ? LOCK : null}${counter.target != null ? html`<span class="bskill__cv">${counter.value}</span>/${counter.target}` : counter.text}</span>` : null}
      </div>
      ${open && !drag ? html`<div class="bskill__detail" role="tooltip">
        <b class="bskill__name">${name}</b>
        <${RichText} as="p" class="bskill__desc" text=${desc} />
      </div>` : null}
    </div>
    ${drag ? html`<div class="bskill-drag" aria-hidden="true">
      <${Arrow} x0=${drag.x0} y0=${drag.y0} x1=${drag.x} y1=${drag.y} />
      ${tip ? html`<div class="bskill-tip">${tParts(tip[0], { place: html`<em>${t(tip[1])}</em>` })}</div>` : null}
    </div>` : null}`;
}
