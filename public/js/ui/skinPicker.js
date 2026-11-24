// 스킨 고르기 (docs/rules/ui.md 「스킨 고르기」; the approved mockups s4 · s5 of the resource packs' plan): the 皮肤 section
// at the top of an operator's detail in 干员调配 (screens/loadout.js) and 自选编队 (screens/diy.js). The layout, the
// enlarged preview and the phone's switch to the 1:1 avatar follow upstream's ui/skinPicker.js; the catalogue is ours
// (ui/skins.js: the skin data's lists), and a player without the skin data sees the skins locked.
//
// Self-contained: the two screens only drop `<${SkinSection} charId=… art=… face=… />` into their detail body.
//
// What the section shows (skinSectionState, from the resource download's state — resources.js skinPackState):
//   * nothing — no resource download here (plain http, no list: the skin data cannot be taken), no skin pack in the
//     list, or no catalogue on this server;
//   * 'locked' — the skin data not chosen: the 默认 tile is worn, every skin tile is the operator's own portrait greyed
//     under a lock, and a box offers the download (setResourcePack('skin', true), its size);
//   * 'loading' — chosen, files left: the tiles can be chosen (the choice goes out at once, render/skin-gate.js draws it
//     once every file is in), the box says so with the progress;
//   * 'ready' — every file in.
// Every operator gets the section once the catalogue exists, the 默认 tile alone for one without a skin (upstream's
// global rule: a section only some operators have cannot be told apart from a list that failed).
// Without the skin data the choice is not published (ui/loadoutSync.js installSkinsSync): 「지금은 기본 스킨만」 holds for
// every viewer too.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, MicroLabel, Modal, Icon } from './components.js';
import { useStore } from '../store.js';
import { resStore, skinPackState, setResourcePack } from '../resources.js';
import { skinsStore, SKINS_KEY, loadSkinCatalog, skinRows, chosenSkin, setSkin, clearSkin } from './skins.js';
import { t } from '../../../shared/i18n.js';
import { data } from '../data.js';

/** @param {...unknown} p */
const cx = (...p) => p.flat().filter(Boolean).join(' ');
/** @param {number} n */
const mb = (n) => Math.max(1, Math.round(n / 1048576));

/**
 * What the section is in (header), from the resource download's state and the catalogue.
 * @param {{ phase: string, sizes: Record<string, { total: number, left: number }>, chosen: Record<string, boolean>, paused: Record<string, boolean>, runGroups: string[] }} r resStore
 * @param {any} catalog skinsStore catalog
 * @returns {null | 'locked' | 'loading' | 'ready'}
 */
export function skinSectionState(r, catalog) {
  if (!r || r.phase === 'off' || !r.sizes?.skin || !catalog || catalog === 'missing') return null;
  const st = skinPackState(r);
  return st === 'off' ? 'locked' : st === 'done' ? 'ready' : 'loading';
}

/**
 * The tiles of one operator: its 默认 appearance first, then its skins in the list's order. A locked tile draws the
 * operator's own art (the mockup: greyed, a lock over it); an open one its own portrait / avatar, else the operator's
 * (`fallbackArt`). The name is looked up by the skin id (data.localeSkinName: a skin may share its Chinese name with a
 * data record); a skin the list names no name for is numbered.
 * @param {{ catalog: any, charId: string, tmplId?: string|null, map?: Record<string, string>, state: 'locked'|'loading'|'ready', art?: string|null, face?: string|null }} o
 *   tmplId: the chess record's body form, whose skins are listed too (ui/skins.js skinRows)
 */
export function skinTiles({ catalog, charId, tmplId = null, map = {}, state, art = null, face = null }) {
  const locked = state === 'locked';
  const chosen = locked ? null : chosenSkin(charId, map, catalog, tmplId);
  const own = { id: '', own: true, name: t('默认'), art, face, illust: null, fallbackArt: false, locked: false, on: !chosen };
  const rows = skinRows(catalog, charId, tmplId).map((/** @type {Record<string, any>} */ row, /** @type {number} */ i) => ({
    id: row.id, own: false, name: row.name ? data.localeSkinName(row.id, row.name) : t('皮肤 {n}', { n: i + 1 }), locked,
    art: (!locked && row.portrait) || art, face: (!locked && row.avatar) || face, illust: row.illust || row.portrait || null,
    fallbackArt: !locked && !row.portrait, on: chosen === row.id,
  }));
  return [own, ...rows];
}

/**
 * One tile: a 1:2 portrait box (the client's 180×360 portrait) that carries the same appearance's 1:1 avatar too —
 * CSS draws the avatar instead on a phone in landscape, where the 1:2 box is taller than the panel (upstream's switch,
 * css/screens/loadout.css).
 * @param {{ row: any, onPick: () => void, onPreview: () => void }} props
 */
export function SkinTile({ row, onPick, onPreview }) {
  return html`<button type="button" role="radio" aria-checked=${row.on ? 'true' : 'false'} aria-disabled=${row.locked ? 'true' : null}
      data-skin=${row.id} class=${cx('lo-skin', row.own && 'lo-skin--default', row.on && 'is-on', row.locked && 'is-locked', row.fallbackArt && 'lo-skin--fallback')}
      title=${row.locked ? t('下载皮肤数据后可用。') : row.on && !row.own ? t('点击放大预览') : row.name}
      onClick=${() => { if (row.locked) return; if (row.on && !row.own) onPreview(); else onPick(); }}>
    <span class=${cx('lo-skin__art', row.face && 'lo-skin__art--face')}>
      ${row.art ? html`<img class="lo-skin__art--big" src=${row.art} alt="" loading="lazy" draggable=${false} />` : null}
      ${row.face ? html`<img class="lo-skin__art--faceimg" src=${row.face} alt="" loading="lazy" draggable=${false} />` : null}
      ${!row.art && !row.face ? html`<span class="lo-skin__art--none"></span>` : null}
      ${row.on ? html`<span class="lo-skin__on">${t('使用')}</span>` : null}
      ${row.locked ? html`<span class="lo-skin__lock" aria-hidden="true"><${Icon} name="lock" /></span>` : null}
    </span>
    <span class="lo-skin__name">${row.name}</span>
  </button>`;
}

/**
 * The enlarged preview of a skin: its 立绘 whole, in a modal. Plain (no store) so its markup is tested without a browser.
 * @param {{ art?: string|null, name?: string }} props
 */
export function SkinPreview({ art = null, name = '' }) {
  if (!art) return null;
  return html`<div class="lo-skin-preview"><img src=${art} alt=${name} /></div>`;
}

/**
 * The box under the tiles: locked — the download offer and its size; loading — what a chosen skin waits for, with the
 * progress. Nothing when ready.
 * @param {{ state: string, g?: { total: number, left: number } }} props
 */
export function SkinPackBox({ state, g = { total: 0, left: 0 } }) {
  if (state === 'locked') {
    return html`<div class="lo-skincta" data-testid="skin-cta">
      <p>${t('下载皮肤数据后，也能看到其他玩家选择的皮肤。')}</p>
      <button type="button" class="btn btn--secondary btn--md lo-skincta__btn" onClick=${() => setResourcePack('skin', true)}>
        <span class="btn__label">${t('下载')} ${t('约 {n} MB', { n: mb(g.total) })}</span></button>
    </div>`;
  }
  if (state === 'loading') {
    const pct = g.total ? Math.floor(((g.total - g.left) / g.total) * 100) : 0;
    return html`<div class="lo-skincta" data-testid="skin-cta">
      <p>${t('下载完成前显示为默认皮肤，下载完成后从下一场战斗开始显示皮肤。')}</p>
      <b class="lo-skincta__pct num" data-i18n-skip="">${pct}%</b>
    </div>`;
  }
  return null;
}

/**
 * 皮肤 for one operator of the detail panel.
 * @param {{ charId: string, tmplId?: string|null, art?: string|null, face?: string|null }} props art / face: the operator's own
 *   portrait and avatar (the 默认 tile, and every tile's art while locked); tmplId the chess record's body form (skinRows)
 */
export function SkinSection({ charId, tmplId = null, art = null, face = null }) {
  const s = useStore((v) => v, Object.is, skinsStore);
  const r = useStore((v) => v, Object.is, resStore);
  const [preview, setPreview] = useState(/** @type {string|null} */ (null));
  useEffect(() => { void loadSkinCatalog(); }, []);
  useEffect(() => { setPreview(null); }, [charId]);
  const state = skinSectionState(r, s.catalog);
  if (!charId || !state) return null;
  const tiles = skinTiles({ catalog: s.catalog, charId, tmplId, map: s[SKINS_KEY], state, art, face });
  const shown = preview ? tiles.find((x) => !x.own && x.id === preview) || null : null;
  return html`<section class="lo-sec lo-sec--skin" data-testid="skin-section" data-state=${state}>
    <header class="lo-sec__head">
      <h3>${t('皮肤')}<${MicroLabel}>SKIN<//></h3>
      <span class="lo-sec__note">${state === 'locked' ? t('目前只能使用默认皮肤') : t('你选择的皮肤会显示给已下载皮肤数据的玩家')}</span>
    </header>
    <div class="lo-skins" role="radiogroup" aria-label=${t('选择皮肤')}>
      ${tiles.map((row) => html`<${SkinTile} key=${row.own ? 'default' : row.id} row=${row}
        onPick=${() => (row.own ? clearSkin(charId) : setSkin(charId, row.id))} onPreview=${() => setPreview(row.id)} />`)}
    </div>
    <${SkinPackBox} state=${state} g=${r.sizes.skin} />
    <${Modal} open=${!!shown} title=${shown ? shown.name : t('皮肤')} micro="SKIN PREVIEW" onClose=${() => setPreview(null)} width="min(92vw, 900px)">
      <${SkinPreview} art=${shown ? shown.illust : null} name=${shown ? shown.name : ''} />
    <//>
  </section>`;
}
