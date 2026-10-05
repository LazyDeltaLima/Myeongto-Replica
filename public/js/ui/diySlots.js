// 선발 오퍼레이터 (甄选 / DIY picks, local NAS patch, docs/LOCAL-PATCH.md): the slot row of the 干员调配 screen
// (screens/loadout.js mounts <DiySlots/> above the roster). Two tier V and two tier VI slots (act2autochess
// diyChessDict); each takes one candidate of data/diy.json (shared/diy.js), an operator at most once. A pick is a
// loadout entry `{ diy: slot }` on the candidate's normal chess of that tier — its skill / module are chosen in the
// detail panel like any chess (selecting a filled slot opens it there). The picks reach the shop of that player only
// (server/local-patch.js).

import { useState } from '../../vendor/hooks.module.js';
import { html, Icon } from './components.js';
import { Img } from './gameComponents.js';
import { chessAvatarUrl } from './assetUrls.js';
import { data } from '../data.js';
import { isDiyPick, DIY_TIERS, DIY_SLOTS, diyPicks } from '../../../shared/diy.js';
import { loadoutStore, setEntries } from './loadoutSync.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const ROMAN = { 5: 'V', 6: 'VI' };

/** Candidates (normal chess) of a tier, in candidate order. */
export function diyCandidates(tier, list = data.list('chess')) {
  return (Array.isArray(list) ? list : []).filter((c) => isDiyPick(c) && !c.isGolden && c.tier === tier)
    .sort((a, b) => (a.shopSortId ?? 0) - (b.shopSortId ?? 0));
}

/** Entries with `chessId` in tier slot `slot` (the slot's previous pick and any other slot of the same operator cleared). */
export function placeDiy(entries, chessId, slot, getChess) {
  const c = getChess(chessId);
  if (!isDiyPick(c)) return entries;
  const out = { ...(entries || {}) };
  for (const [id, e] of Object.entries(out)) {
    if (!e || e.diy === undefined) continue;
    const o = getChess(id);
    if (!o) continue;
    if ((o.tier === c.tier && e.diy === slot) || o.charId === c.charId) {
      const { diy, ...rest } = e;
      if (Object.keys(rest).length && !isDiyPick(o)) out[id] = rest; else delete out[id];
    }
  }
  out[chessId] = { ...(out[chessId] || {}), diy: slot };
  return out;
}

/** Entries without the pick in tier slot (tier, slot). */
export function clearDiy(entries, tier, slot, getChess) {
  const out = { ...(entries || {}) };
  for (const [id, e] of Object.entries(out)) {
    const o = getChess(id);
    if (e && e.diy === slot && o && o.tier === tier && isDiyPick(o)) delete out[id];
  }
  return out;
}

export function DiySlots({ m, entries, selId, locked, onSelect }) {
  const [open, setOpen] = useState(null); // `${tier}:${slot}` of the open picker
  const getChess = (id) => data.lookup('chess', id);
  const picks = diyPicks(entries, getChess);
  const any = DIY_TIERS.some((t) => diyCandidates(t).length);
  if (!any) return null;
  const used = new Set([...picks[5], ...picks[6]].filter(Boolean).map((id) => getChess(id)?.charId));
  const choose = (id, tier, slot) => {
    setEntries(placeDiy(loadoutStore.get().entries, id, slot, getChess));
    setOpen(null);
    onSelect(id);
  };
  return html`<div class="diy" aria-label="선발 오퍼레이터">
    <div class="diy__head"><b>甄选干员</b><span class="t-dim">每阶最多 ${DIY_SLOTS} 名，只出现在自己的商店里</span></div>
    <div class="diy__row">
      ${DIY_TIERS.map((tier) => Array.from({ length: DIY_SLOTS }, (_, i) => {
        const slot = i + 1, key = `${tier}:${slot}`, id = picks[tier][i], c = id ? getChess(id) : null;
        return html`<div key=${key} class=${cx('diy__slot', `diy__slot--t${tier}`, c && 'is-filled', c && selId === id && 'is-sel')}>
          <button type="button" class="diy__btn" disabled=${locked && !c}
            onClick=${() => (c ? onSelect(id) : setOpen(open === key ? null : key))} title=${c ? c.name : '选择甄选干员'}>
            <span class="diy__tier">${ROMAN[tier]}</span>
            ${c ? html`<${Img} src=${chessAvatarUrl(m, c)} class="diy__ava" alt="" /><span class="diy__name">${c.name}</span>`
              : html`<span class="diy__plus"><${Icon} name="plus" /></span><span class="diy__name t-dim">空位</span>`}
          </button>
          ${c && !locked ? html`<button type="button" class="diy__x" title="清空" onClick=${() => setEntries(clearDiy(loadoutStore.get().entries, tier, slot, getChess))}><${Icon} name="close" /></button>` : null}
          ${c && !locked ? html`<button type="button" class="diy__swap" title="更换" onClick=${() => setOpen(open === key ? null : key)}><${Icon} name="refresh" /></button>` : null}
          ${open === key && !locked ? html`<div class="diy__pick" role="listbox">
            ${diyCandidates(tier).map((o) => {
              const taken = used.has(o.charId) && o.chessId !== id;
              return html`<button type="button" key=${o.chessId} role="option" class=${cx('diy__opt', taken && 'is-taken')} disabled=${taken}
                onClick=${() => choose(o.chessId, tier, slot)}>
                <${Img} src=${chessAvatarUrl(m, o)} class="diy__ava" alt="" /><span>${o.name}</span>${taken ? html`<em>已选</em>` : null}
              </button>`;
            })}
          </div>` : null}
        </div>`;
      }))}
    </div>
  </div>`;
}
