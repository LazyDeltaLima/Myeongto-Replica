// ui/placeArt.js — local patch (src/docs/LOCAL-PATCH.md 「배치 UI」): the official direction selector of the client, drawn by
// ui/facingWheel.js when the local extract has its sprites (else the original wheel stays — upstream-PR-able).
//
// Source: battle/[pack]common.ab `panel_direction_selector` (EN client) — `offset` 426 × 426 rotated −45° = the diamond
// (vertices up / right / down / left at 213·√2 ≈ 301 units); per direction a quarter of it with a sliced frame
// (`sprite_rectangle_frame_triangle`: the two outer half-edges) in white, highlighted 255,226,176 (`_highlightColor`)
// with its `fill` (`sprite_direction_arrow`, the glowing chevron) on that vertex; `mask_up/right/left/down` = black 39 %
// over everything outside the diamond; `panel_cancel_hint` at (−327, 0) of the rotated square (= over the upper-left
// edge) switches `btn_cancel` (no direction: the red edge + ✕ tag, tap to cancel) and `btn_drag_back` (a direction:
// the black bubble "drag back to the centre to cancel") with a 0.16 s fade. Sprites from arts/ui/[uc]battlecommon.ab
// (tools/local-extract/extract.py → ui/battlecommon). The EN sprites carry English text: it is clipped out and the
// game's own string drawn instead (取消 / 拖回中心区域取消 → ko 취소 / 방향을 가운데로 되돌려 취소, the KR client's wording).
// [추정] the diamond lies on the ground plane here (projected with the tile under it, so it follows the camera) and is
// DIR_HALF_TILES tiles across its half-diagonal — measured on a KR client capture (≈ 325 px at ≈ 125 px per tile).

import { html } from './components.js';
import { localAsset } from '../data.js';
import { tr } from '../i18n/i18n.js';

const G = 'ui/battlecommon';
/** Half-diagonal of the diamond in tiles (KR capture). [추정] */
export const DIR_HALF_TILES = 2.6;
/** The client's diamond half-diagonal in its own units (offset 426 rotated 45°). */
export const R0 = 213 * Math.SQRT2;
const HL = '#ffe2b0';          // _highlightColor 1, .886, .69
const DIM = 'rgba(0,0,0,.392)'; // mask Image colour a = 100 / 255
const TAG = 'rgba(164,0,0,.86)';
// sprite geometry (px of the extracted sprites)
const CHEV = { w: 181, h: 239, tipX: 49, tipY: 119.5 };
const CANCEL = { size: 426, at: [-231, -231], text: [196, 254, 256, 276], label: [226, 266] };
const BUBBLE = { w: 380, h: 115, at: [-291, -159], text: [24, 18, 272, 56], label: [36, 37] };

/** The selector sprites when the local client art is installed, else null (the original wheel). */
export function dirArt() {
  const chev = localAsset(G, 'sprite_direction_arrow');
  const cancel = localAsset(G, 'btn_cancel');
  const bubble = localAsset(G, 'btn_drag_back');
  return chev && cancel && bubble ? { chev, cancel, bubble } : null;
}

/**
 * Ground-plane basis of the selector around a tile (tileScreen geometry `g`: centre + top-face corners): the SVG matrix
 * mapping its local units (vertices at ±R0, y down = screen down) to client px, and the inverse for hit tests.
 * @returns {{ m: number[], toLocal: (x: number, y: number) => [number, number] } | null}
 */
export function dirBasis(g, halfTiles = DIR_HALF_TILES) {
  const p = g && Array.isArray(g.poly) && g.poly.length === 4 ? g.poly : null;
  if (!p) return null;
  // poly: corner(−.5, +.5), (+.5, +.5), (+.5, −.5), (−.5, −.5) — ex = +col (screen right), ey = +row (screen up)
  const ex = [p[1][0] - p[0][0], p[1][1] - p[0][1]];
  const ey = [p[0][0] - p[3][0], p[0][1] - p[3][1]];
  const k = halfTiles / R0;
  const a = k * ex[0], b = k * ex[1], c = -k * ey[0], d = -k * ey[1];
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const m = [a, b, c, d, g.x, g.y];
  const toLocal = (x, y) => { const X = x - g.x, Y = y - g.y; return [(d * X - c * Y) / det, (-b * X + a * Y) / det]; };
  return { m, toLocal };
}

/** Inside the diamond (with a little slack), in client px. */
export function insideDiamond(basis, x, y, slack = 1.12) {
  if (!basis) return true;
  const [u, v] = basis.toLocal(x, y);
  return Math.abs(u) + Math.abs(v) <= R0 * slack;
}

const VERT = { UP: [0, -R0], RIGHT: [R0, 0], DOWN: [0, R0], LEFT: [-R0, 0] };
const OUT = { UP: [0, -1], RIGHT: [1, 0], DOWN: [0, 1], LEFT: [-1, 0] };
const ROT = { UP: 90, RIGHT: 180, DOWN: -90, LEFT: 0 }; // the sprite's chevron points left (−x)

/** The two outer half-edges of a direction's quarter, meeting on its vertex (local units). */
function quarter(d) {
  const [vx, vy] = VERT[d];
  const h = R0 / 2;
  const side = d === 'UP' || d === 'DOWN' ? [[-h, vy / 2], [h, vy / 2]] : [[vx / 2, -h], [vx / 2, h]];
  return `M${side[0][0]} ${side[0][1]} L${vx} ${vy} L${side[1][0]} ${side[1][1]}`;
}

/**
 * The selector (full-screen SVG, pointer-transparent) + the tap target of the cancel tag.
 * @param {{ g: any, basis: any, art: { chev: string, cancel: string, bubble: string }, dir: string|null,
 *   onCancel: () => void, cancelLabel?: string, backLabel?: string }} props
 */
export function PlaceWheelArt({ g, basis, art, dir, onCancel, cancelLabel = '取消', backLabel = '拖回中心区域取消' }) {
  if (!g || !basis) return null;
  const [a, b, c, d, e, f] = basis.m;
  const M = `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
  const W = globalThis.innerWidth || 4000, H = globalThis.innerHeight || 3000;
  const pt = (x, y) => [a * x + c * y + e, b * x + d * y + f];
  const dia = ['UP', 'RIGHT', 'DOWN', 'LEFT'].map((k) => pt(...VERT[k]).map((n) => n.toFixed(1)).join(' '));
  const sel = dir && VERT[dir] ? dir : null;
  // the cancel tag's screen box (tap target): sprite px 174..303 × 172..298 around CANCEL.at
  const tag = [pt(CANCEL.at[0] - 213 + 174, CANCEL.at[1] - 213 + 172), pt(CANCEL.at[0] - 213 + 303, CANCEL.at[1] - 213 + 298)];
  const tx = Math.min(tag[0][0], tag[1][0]), ty = Math.min(tag[0][1], tag[1][1]);
  const tw = Math.abs(tag[1][0] - tag[0][0]), th = Math.abs(tag[1][1] - tag[0][1]);
  const cutCancel = `M0 0 H${CANCEL.size} V${CANCEL.size} H0 Z M${CANCEL.text[0]} ${CANCEL.text[1]} V${CANCEL.text[3]} H${CANCEL.text[2]} V${CANCEL.text[1]} Z`;
  const cutBubble = `M0 0 H${BUBBLE.w} V${BUBBLE.h} H0 Z M${BUBBLE.text[0]} ${BUBBLE.text[1]} V${BUBBLE.text[3]} H${BUBBLE.text[2]} V${BUBBLE.text[1]} Z`;
  const [chx, chy] = sel ? [VERT[sel][0], VERT[sel][1]] : [0, 0];
  return html`
    <svg class="pwheel" aria-hidden="true" viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H}>
      <defs>
        <clipPath id="pwheel-cut-cancel"><path d=${cutCancel} clip-rule="evenodd" /></clipPath>
        <clipPath id="pwheel-cut-bubble"><path d=${cutBubble} clip-rule="evenodd" /></clipPath>
      </defs>
      <path class="pwheel__dim" d=${`M-10 -10 H${W + 10} V${H + 10} H-10 Z M${dia.join(' L')} Z`} fill-rule="evenodd" fill=${DIM} />
      <g transform=${M}>
        ${['UP', 'RIGHT', 'DOWN', 'LEFT'].map((k) => html`<path key=${k} class=${`pwheel__edge${sel === k ? ' is-on' : ''}`} d=${quarter(k)} stroke=${sel === k ? HL : '#fff'} />`)}
        ${sel ? html`<image class="pwheel__chev" href=${art.chev} width=${CHEV.w} height=${CHEV.h}
          transform=${`translate(${chx} ${chy}) rotate(${ROT[sel]}) translate(${-CHEV.tipX} ${-CHEV.tipY})`} />` : null}
        <g class=${`pwheel__cancel${sel ? '' : ' is-on'}`} transform=${`translate(${CANCEL.at[0] - 213} ${CANCEL.at[1] - 213})`}>
          <image href=${art.cancel} width=${CANCEL.size} height=${CANCEL.size} clip-path="url(#pwheel-cut-cancel)" />
          <rect x=${CANCEL.text[0]} y=${CANCEL.text[1]} width=${CANCEL.text[2] - CANCEL.text[0]} height=${CANCEL.text[3] - CANCEL.text[1]} fill=${TAG} />
          <text class="pwheel__label" x=${CANCEL.label[0]} y=${CANCEL.label[1]} text-anchor="middle" dominant-baseline="central">${tr(cancelLabel)}</text>
        </g>
      </g>
      <g class=${`pwheel__bubble${sel ? ' is-on' : ''}`} transform=${bubbleAt(pt)}>
        <image href=${art.bubble} width=${BUBBLE.w} height=${BUBBLE.h} clip-path="url(#pwheel-cut-bubble)" />
        <rect x=${BUBBLE.text[0]} y=${BUBBLE.text[1]} width=${BUBBLE.text[2] - BUBBLE.text[0]} height=${BUBBLE.text[3] - BUBBLE.text[1]} fill="#000" />
        <text class="pwheel__label pwheel__label--tip" x=${BUBBLE.label[0]} y=${BUBBLE.label[1]} dominant-baseline="central">${tr(backLabel)}</text>
      </g>
    </svg>
    <button type="button" class=${`fwheel__cancel pwheel__tap${sel ? '' : ' is-on'}`} aria-label="点击取消"
      style=${`left:${tx}px;top:${ty}px;width:${tw}px;height:${th}px`}
      onPointerDown=${(ev) => ev.stopPropagation()} onClick=${(ev) => { ev.stopPropagation(); onCancel(); }}></button>`;
}

/**
 * The bubble stays upright on screen (its text must not be foreshortened): placed at its local spot, scaled by the
 * selector's horizontal px per unit.
 */
function bubbleAt(pt) {
  const [x0, y0] = pt(0, 0), [x1] = pt(1, 0);
  const s = Math.abs(x1 - x0) || 1;
  const [bx, by] = pt(BUBBLE.at[0], BUBBLE.at[1]);
  return `translate(${bx} ${by}) scale(${s}) translate(${-BUBBLE.w / 2} ${-BUBBLE.h / 2})`;
}
