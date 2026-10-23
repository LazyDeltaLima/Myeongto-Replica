// The tip of a special terrain tile (GitHub issue #184 「建议加入对于特殊地形的单击信息提示」): a toast at the top of the
// screen with the tile's name and what it does, as the client shows it — not a card (GitHub #3, maintainer decision
// 2026-10-14; docs/rules/ui.md 「보드에서 연 카드가 벤치를 가림」).
//
// Official path (EN client): a press on a tile without a character goes UIController.OnBottomMaskDown →
// TileInfoController._SelectTile, which for a functional tile (`Tile.isFunctional`) shows
// UIToastController.Show({ name: tileName, description: tileDescription, lastTime: 0 }, needHide: false) — a toast that
// stays while that tile is the selected one: a press on the same tile keeps it, a press anywhere else
// (_ClearSelectedTile → UIToastController.Hide(popupId)) takes it away. [ASSUMED] the 卫戍协议 UI state takes that path
// (its state check was not read); the toast prefab's size and look were not read either (the band below is the simplest
// close to the battle toast). It never takes a press: the board under it stays pressable.
//
//   TileToast({ tip })   tip = { key: 'row,col', terrain: gameLogic.terrainInfo(...), again?: boolean } | null —
//                        `again`: the same tile pressed once more (the screen hid it during the press), no entry animation

import { html, Icon } from './components.js';

/**
 * @param {{ tip: { key: string, again?: boolean, terrain: { name: string, tag?: string, lines?: string[], facts?: string[] } } | null }} props
 */
export function TileToast({ tip }) {
  const tr = tip?.terrain;
  if (!tr || typeof tr !== 'object') return null;
  const lines = Array.isArray(tr.lines) ? tr.lines : [];
  const facts = Array.isArray(tr.facts) ? tr.facts : [];
  return html`<div key=${tip.key} class=${`ttoast${tip.again ? ' is-again' : ''}`} role="status" aria-live="polite" data-tile=${tip.key}>
    <div class="ttoast__head">
      <${Icon} name="info" />
      <b class="ttoast__name">${tr.name}</b>
      ${tr.tag && tr.tag !== tr.name ? html`<span class="ttoast__tag">${tr.tag}</span>` : null}
    </div>
    ${lines.map((line, i) => html`<p class="ttoast__text" key=${i}>${line}</p>`)}
    ${facts.length ? html`<p class="ttoast__text ttoast__facts">${facts.join(' · ')}</p>` : null}
  </div>`;
}
