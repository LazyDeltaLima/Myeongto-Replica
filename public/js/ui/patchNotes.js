// Patch notes in the lobby: the 更新 tab of the tips panel (screens/lobby.js) shows the newest release in one line, and
// 查看全部 opens the 更新记录 window with every release of this fork (CHANGELOG.md through GET /changelog.json,
// server/http/changelog.js). The newest release opens the tab by itself once per browser: the version last shown is
// remembered (pref `patchNotesSeen`), so the tab is a NEW tab only on the first lobby visit after a release.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button } from './components.js';
import { loadPref, savePref } from '../store.js';
import { t } from '../../../shared/i18n.js';

export const PATCH_NOTES_URL = '/changelog.json';
export const SEEN_PREF = 'patchNotesSeen';

let pending = null;

/**
 * The entries of /changelog.json, fetched once per page ([] when unreachable; a failed fetch is tried again next time).
 * @param {Function} [fetchFn]
 * @returns {Promise<{ version: string, date: string, blocks: object[] }[]>}
 */
export function loadPatchNotes(fetchFn = (...a) => globalThis.fetch(...a)) {
  if (!pending) {
    pending = Promise.resolve()
      .then(() => fetchFn(PATCH_NOTES_URL, { cache: 'no-cache' }))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (Array.isArray(j?.entries) ? j.entries.filter((e) => typeof e?.version === 'string' && Array.isArray(e.blocks)) : []))
      .catch(() => { pending = null; return []; });
  }
  return pending;
}

/** @returns {object[]|null} the entries, null until they arrive */
export function usePatchNotes() {
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    let live = true;
    loadPatchNotes().then((e) => { if (live) setEntries(e); });
    return () => { live = false; };
  }, []);
  return entries;
}

/** @param {string} version */
export const isUnseen = (version) => !!version && loadPref(SEEN_PREF, null) !== version;
/** @param {string} version */
export const markSeen = (version) => savePref(SEEN_PREF, version);

/** @param {{ s: string }[]} segs */
const plainText = (segs) => (Array.isArray(segs) ? segs.map((x) => x?.s || '').join('') : '');

/**
 * The one-line summary of a release: the first sentence of its first paragraph, else its first list item.
 * @param {{ blocks: object[] }} entry
 * @returns {string}
 */
export function summaryOf(entry) {
  const blocks = entry?.blocks || [];
  const p = blocks.find((b) => b.p);
  if (p) {
    const text = plainText(p.p);
    const m = /^(.*?[.。!?])(\s|$)/.exec(text);
    return m ? m[1] : text;
  }
  const ul = blocks.find((b) => b.ul);
  return ul ? plainText(ul.ul[0]) : '';
}

/** @param {{ segs: { s: string, b?: boolean, c?: boolean }[] }} props */
function Inline({ segs }) {
  return (segs || []).map((x, i) => (x.b ? html`<b key=${i}>${x.s}</b>` : x.c ? html`<code key=${i}>${x.s}</code>` : x.s));
}

/** @param {{ entry: object, open: boolean, fresh: boolean }} props */
function Release({ entry, open, fresh }) {
  return html`<details class="pnotes__ver" open=${open}>
    <summary class="pnotes__head">
      <span class="pnotes__v num">v${entry.version}</span>
      ${entry.date ? html`<span class="pnotes__date num">${entry.date}</span>` : null}
      ${fresh ? html`<span class="pnotes__new">NEW</span>` : null}
    </summary>
    ${entry.blocks.map((b, i) => (b.h ? html`<h4 key=${i} class="pnotes__group">${b.h}</h4>`
      : b.p ? html`<p key=${i} class="pnotes__p"><${Inline} segs=${b.p} /></p>`
      : b.ul ? html`<ul key=${i} class="pnotes__list">${b.ul.map((li, j) => html`<li key=${j}><${Inline} segs=${li} /></li>`)}</ul>`
      : null))}
  </details>`;
}

/**
 * The 更新记录 window: the newest release open, the older ones folded.
 * @param {{ open: boolean, onClose: Function, entries: object[]|null, fresh?: boolean }} props
 */
export function PatchNotesModal({ open, onClose, entries, fresh = false }) {
  const list = entries || [];
  return html`<${Modal} open=${open} onClose=${onClose} title=${t('更新记录')} micro="PATCH NOTES" width="min(9.6rem, 94vw)" class="pnotes"
    actions=${html`<${Button} variant="primary" onClick=${onClose}>${t('关闭')}<//>`}>
    ${list.map((e, i) => html`<${Release} key=${e.version} entry=${e} open=${i === 0} fresh=${fresh && i === 0} />`)}
  <//>`;
}
