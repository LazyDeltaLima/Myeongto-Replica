// Faction pick (local feature: chat factions + 진영별 선발 프리셋, maintainer decisions 2026-10-09; docs/rules/diy.md): the one
// way a player picks a faction — the chat's FactionPicker (ui/chat.js) and the strategy draft's row under the draft order
// (DraftFactionPicker, screens/bandDraft.js) — so the two stay the same pick.
//
//   chooseFaction(id)   co-op: room.chatFaction (the chat tag; server/local-patch.js), then the faction's 自选 preset
//                       (ui/diyPresets.js). Solo rooms have no chat faction: the pick only applies the preset (and is
//                       remembered for the row's highlight, `soloFaction`). The preset applies before the match and while
//                       its briefing / strategy draft runs (the server's match.setDiy takes it for THIS match then);
//                       from the prep on a pick only changes the tag — the picks and presets stay (maintainer 2026-10-09).
//   DraftFactionPicker  the eight factions as a row of chips: the own pick lit, a saved preset dotted, a faction whose
//                       bond is off this match dimmed with a 禁用 tag; the notice under it.
//   PresetNotice        「炎国预设已套用到自选编队 · 撤销」 for PRESET_NOTICE_MS after a pick applied a preset — above the
//                       chat input, and `inline` in the draft row (the chat is closed there); a faction whose bond this
//                       match disables is still applied and says 本局禁用 (maintainer 2026-10-12).
//   applyPresetChoice(choice)  a strategy's linked roster (전략별 선발 프리셋, screens/bandDraft.js): a faction = the faction
//                       pick above (chat tag + preset), BASE_LINK = 不使用预设, KEEP_LINK = nothing.
// Styles: public/css/screens/draft.css (.dfac).

import { useEffect } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { net } from '../net.js';
import { store, useStore } from '../store.js';
import { FactionIcon } from './faction.js';
import { diyPresetStore, applyFactionPreset, applyBasePreset, undoFactionPreset, clearPresetNotice, PRESET_NOTICE_MS, BASE_LINK } from './diyPresets.js';
import { CHAT_FACTIONS, chatFaction } from '../../../shared/local.js';
import { PHASE } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The match phases in which a faction pick still sets the running match's 自选 (server platform.js setDiy). */
export const PRESET_LIVE_PHASES = Object.freeze([PHASE.INFO_CHECK, PHASE.BAND_DRAFT]);

/** Whether a faction pick applies its 自选 preset now: out of a match, or while the briefing / strategy draft runs. */
export function presetPickLive(s) {
  if (!s?.room?.inMatch) return true;
  return PRESET_LIVE_PHASES.includes(s.match?.public?.phase);
}

/**
 * Pick a faction (see the header). Resolves false when the server refused the chat tag (cooldown, offline).
 * @param {string} id chat faction id
 */
export async function chooseFaction(id) {
  if (!chatFaction(id)) return false;
  const s = store.get();
  if (s.room?.mode === 'solo') diyPresetStore.set({ soloFaction: { id, matchNo: s.room?.matchNo ?? 0 } });
  else {
    try { await net.request('room.chatFaction', { faction: id }); } catch { return false; }
  }
  const now = store.get();
  if (presetPickLive(now)) applyFactionPreset(id, { inMatch: !!now.room?.inMatch });
  return true;
}

/**
 * Apply a strategy's roster choice (diyPresets.js bandPresetChoice): a chat faction is picked like the faction row
 * (chooseFaction: the chat tag follows, maintainer 2026-10-12), BASE_LINK shows 不使用预设, anything else changes nothing.
 * @param {string|null} choice
 */
export async function applyPresetChoice(choice) {
  if (choice === BASE_LINK) {
    const now = store.get();
    if (presetPickLive(now)) applyBasePreset({ inMatch: !!now.room?.inMatch });
    return true;
  }
  if (!chatFaction(choice)) return false;
  return chooseFaction(choice);
}

/** The faction the player picked: the chat tag in co-op, the remembered pick of this match in solo. */
export function useMyFaction() {
  const tag = useStore((s) => s.chatFactions?.[s.me.playerId] ?? null);
  const solo = useStore((s) => s.room?.mode === 'solo');
  const matchNo = useStore((s) => s.room?.matchNo ?? 0);
  const local = useStore((s) => s.soloFaction, Object.is, diyPresetStore);
  return solo ? (local && local.matchNo === matchNo ? local.id : null) : tag;
}

/** The last preset a faction pick applied (ui/diyPresets.js notice), with its 撤销. @param {{ inline?: boolean }} props */
export function PresetNotice({ inline = false }) {
  const n = useStore((s) => s.notice, Object.is, diyPresetStore);
  const off = useStore((s) => (s.room?.inMatch ? s.match?.public?.disabledBonds ?? null : null));
  useEffect(() => {
    if (!n) return undefined;
    const h = setTimeout(() => { if (diyPresetStore.get().notice === n) clearPresetNotice(); }, Math.max(0, n.at + PRESET_NOTICE_MS - Date.now()));
    return () => clearTimeout(h);
  }, [n]);
  const f = n ? chatFaction(n.factionId) : null;
  if (!f && !n?.base) return null;
  const isOff = !!f && Array.isArray(off) && off.includes(f.bond);
  return html`<p class=${cx('chat__preset', inline && 'chat__preset--inline', isOff && 'is-off')} role="status" data-testid="preset-notice">
    ${f ? html`<${FactionIcon} f=${f} />` : null}<span>${f ? t('已将{faction}预设套用到自选编队', { faction: t(f.name) }) : t('自选编队已切换为「不使用预设」')}${isOff ? html`<small class="chat__preset-off">${t('本局禁用')}</small>` : null}${n.inMatch ? html`<small>${t('本局生效')}</small>` : null}</span>
    <button type="button" class="chat__preset-undo" data-testid="preset-undo" onClick=${undoFactionPreset}>${t('撤销')}</button>
  </p>`;
}

/** The strategy draft's faction row (under the draft order). */
export function DraftFactionPicker() {
  const mine = useMyFaction();
  const off = useStore((s) => s.match?.public?.disabledBonds ?? null);
  const presets = useStore((s) => s.presets, Object.is, diyPresetStore);
  const seated = useStore((s) => (s.room?.seats || []).some((x) => x && x.playerId === s.me.playerId));
  if (!seated) return null; // spectators have no faction
  const anyPreset = Object.keys(presets || {}).length > 0;
  return html`<section class="dfac" aria-label=${t('选择阵营')} data-testid="draft-faction">
    <h4 class="dfac__h">${t('选择阵营')}${anyPreset ? html`<small>${t('选择阵营后套用该阵营的自选预设')}</small>` : null}</h4>
    <div class="dfac__grid" role="group">
      ${CHAT_FACTIONS.map((f) => {
        const isOff = Array.isArray(off) && off.includes(f.bond);
        const has = !!presets?.[f.id];
        return html`<button key=${f.id} type="button" class=${cx('dfac__btn', f.id === mine && 'is-on', isOff && 'is-off', has && 'has-preset')}
          style=${`--fac:${f.color}`} aria-pressed=${f.id === mine ? 'true' : 'false'} data-faction=${f.id}
          title=${`${t(f.name)}${isOff ? t('（本局禁用）') : ''}${has ? ` · ${t('已保存预设')}` : ''}`}
          onClick=${() => { if (f.id !== mine) chooseFaction(f.id); }}><${FactionIcon} f=${f} /><span>${t(f.name)}</span>${isOff ? html`<small>${t('禁用')}</small>` : null}</button>`;
      })}
    </div>
    <${PresetNotice} inline=${true} />
  </section>`;
}
