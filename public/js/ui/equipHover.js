// ui/equipHover.js — local patch (src/docs/LOCAL-PATCH.md 「배치 UI」): the official equipment-slot popup that floats over
// an operator while an item is dragged onto it (the KR client: two slots, the one the item goes into lit teal).
//
// Source: ui/autochess/[uc]autochessbattle.ab `act1autochess_equip_slot_panel` (UIAutoChessDragEquipPanel, used by
// AutoChessDragState._equipStatusPanel), EN client; sprites img_EquipSlot_* from the same bundle
// (tools/local-extract/extract.py ui/battle job). Root scale 0.8; the pill (334 × 152, pivot bottom centre) stands 120
// units over the follow point; per slot (±54 of the pill centre, +2): a #1e1e1e box 90 × 90, the item icon, a white
// sliced frame (img_EquipSlot_frame2, border 4); the slot the item goes into (index = equipped count) adds Root_Empty
// (img_EquipSlot_frame3 + img_EquipSlot_SlotGlow × #55ffeb additive, alpha 1 ↔ .4 over .7 s); both slots used (the drop
// opens the replace dialog): red brackets (frame1_red) and the dark-red matte (img_EquipSlot_glow α .71) with the swap
// icon and a pulsing label. Show / close / equipped timings are the prefab's legacy clips. [추정] the follow point:
// .7 of the hovered tile's depth (KR capture: the pill's bottom ≈ the tile's far edge); the full-state label text is
// set at run time (not in the data) — 「장비 교체」 here. Without the sprites nothing is drawn (upstream look).
//
//   equipHoverState(ctx, itemUid, tile) → { uid, itemId, row, col, items: [itemId], full } | null   (pure)
//   <EquipHoverPanel view state />    state: equipHoverState(...) (+ `equipped: true` for the drop flash) | null

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { localAsset, data } from '../data.js';
import { itemIconUrl } from './assetUrls.js';
import { canPlace, dropIntent, tileKey } from './gameLogic.js';
import { useTileScreen } from './facingWheel.js';
import { tr } from '../i18n/i18n.js';
import { GEO } from '../../../shared/constants.js';

const G = 'ui/battle';
const SPRITES = ['bg', 'glow', 'frame1', 'frame1_red', 'frame2', 'frame3', 'SlotGlow', 'icon'];
/** Show / close clip lengths (s). */
const CLOSE_S = 0.4;
const EQUIPPED_S = 0.417;
/** [추정] Follow point as a fraction of the hovered tile's screen depth (far edge 0 → near edge 1). */
export const FOLLOW_DEPTH = 0.7;

/** The popup sprites when the local client art is installed, else null (no popup — the upstream look). */
export function equipHoverArt() {
  const out = {};
  for (const k of SPRITES) {
    const url = localAsset(G, `img_EquipSlot_${k}`);
    if (!url) return null;
    out[k] = url;
  }
  return out;
}

/**
 * What the popup shows while item `itemUid` is dragged over `tile` (render/drag.js tileHover: { row, col, area, idx }):
 * the operator there takes it (canPlace 'equip'), else null.
 */
export function equipHoverState(ctx, itemUid, tile) {
  if (!ctx?.pieces || !tile || (tile.area !== 'board' && tile.area !== 'hand')) return null;
  const target = tile.area === 'board' ? { area: 'board', row: tile.row, col: tile.col } : { area: 'hand', idx: tile.idx ?? tile.col };
  const res = canPlace(ctx, itemUid, target);
  if (!res.ok || res.action !== 'equip') return null;
  const occ = target.area === 'hand' ? ctx.handAt?.get(target.idx) : ctx.boardAt?.get(tileKey(target.row, target.col));
  const piece = occ?.piece;
  if (!piece || piece.kind !== 'chess') return null;
  const items = (Array.isArray(piece.items) ? piece.items : []).filter((it) => it && typeof it === 'object').map((it) => it.id);
  const intent = dropIntent(ctx, itemUid, target);
  return {
    uid: piece.uid,
    itemId: ctx.pieces.get(itemUid)?.piece?.id || null,
    row: target.area === 'board' ? target.row : GEO.HAND_ROW,
    col: target.area === 'board' ? target.col : target.idx,
    items,
    full: !!intent?.confirmReplace,
  };
}

const sameState = (a, b) => !!a && !!b && a.uid === b.uid && a.row === b.row && a.col === b.col && a.full === b.full
  && !!a.equipped === !!b.equipped && a.items.join('|') === b.items.join('|');

/** The follow point of a tile (client px): FOLLOW_DEPTH down its screen quad. */
function followPoint(g) {
  if (!g) return null;
  const ys = Array.isArray(g.poly) && g.poly.length ? g.poly.map((p) => p[1]) : null;
  if (!ys) return { x: g.x, y: g.y };
  const far = Math.min(...ys), near = Math.max(...ys);
  return { x: g.x, y: far + (near - far) * FOLLOW_DEPTH };
}

function Slot({ id, target, flash, art }) {
  const icon = id ? itemIconUrl(data.get('assets'), data.lookup('items', id)) : null;
  return html`<span class=${['eqh__slot', target && 'is-target', flash && 'is-flash'].filter(Boolean).join(' ')}>
    <span class="eqh__equip">
      <i class="eqh__box"></i>
      ${icon ? html`<img class="eqh__icon" src=${icon} alt="" draggable=${false} />` : null}
      <i class="eqh__frame"></i>
      ${flash ? html`<i class="eqh__fill"></i><i class="eqh__glowfx" style=${`--eqh-sg:url("${art.SlotGlow}")`}></i>` : null}
    </span>
    ${target ? html`<span class="eqh__empty"><i class="eqh__frame3"></i><i class="eqh__loop"></i></span>` : null}
  </span>`;
}

/**
 * The popup. Keeps the last state through the close clip (and the equipped flash), so it can be unmounted by passing
 * `state` null.
 * @param {{ view: any, state: ReturnType<typeof equipHoverState> & { equipped?: boolean } | null }} props
 */
export function EquipHoverPanel({ view, state }) {
  const art = equipHoverArt();
  const [shown, setShown] = useState(state);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    clearTimeout(timer.current);
    if (state) {
      setLeaving(false);
      setShown((s) => (sameState(s, state) ? s : state));
      return undefined;
    }
    if (!shown) return undefined;
    // an equipped flash plays out before the close clip
    const hold = shown.equipped ? EQUIPPED_S * 1000 : 0;
    timer.current = setTimeout(() => {
      setLeaving(true);
      timer.current = setTimeout(() => { setShown(null); setLeaving(false); }, CLOSE_S * 1000);
    }, hold);
    return () => clearTimeout(timer.current);
  }, [state]);
  const g = useTileScreen(view, shown?.row, shown?.col);
  if (!art || !shown) return null;
  const at = followPoint(g);
  if (!at) return null;
  const n = shown.items.length;
  // the slot the item goes into: the next free one (both used: the replace state lights none); the equipped flash
  // plays on that slot, which now shows the item
  const into = shown.full ? -1 : Math.min(n, 1);
  const slots = [0, 1].map((i) => (shown.equipped && i === into
    ? { id: shown.itemId, target: false, flash: true }
    : { id: shown.items[i] || null, target: !shown.equipped && i === into, flash: false }));
  const style = [
    `left:${at.x.toFixed(1)}px`, `top:${at.y.toFixed(1)}px`,
    ...SPRITES.map((k) => `--eqh-${k}:url("${art[k]}")`),
  ].join(';');
  return html`<div class=${['eqh', shown.full && 'is-full', leaving && 'is-leaving'].filter(Boolean).join(' ')} style=${style} aria-hidden="true">
    <div class="eqh__p" key=${`${shown.uid}:${shown.row},${shown.col}`}>
      <i class="eqh__bg"></i>
      <i class="eqh__fr eqh__fr--l"></i><i class="eqh__fr eqh__fr--r"></i>
      ${slots.map((s, i) => html`<${Slot} key=${i} id=${s.id} target=${s.target} flash=${s.flash} art=${art} />`)}
      ${shown.full ? html`<span class="eqh__matte"><i class="eqh__matte-bg"></i><i class="eqh__matte-loop"></i>
        <span class="eqh__swap"><i class="eqh__swap-icon"></i><span class="eqh__label">${tr('替换装备')}</span></span></span>` : null}
    </div>
  </div>`;
}
