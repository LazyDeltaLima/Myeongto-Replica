// Chat faction marks (local NAS patch, shared/constants.js CHAT_FACTIONS / server/lobby.js chatFaction): a faction is
// shown with its nation bond icon (data/assets.json bonds, a white glyph) tinted with the faction color.
//
//   FactionIcon     the tinted icon alone (chat picker, chip)
//   FactionGlyph    avatar content for a player who picked a faction: the icon, the name's first letter small below
//   useSeatFaction  the faction a player picked, from room.state seats (kept through the match; cleared when it ends)
// While the icon is unavailable FactionIcon renders nothing and FactionGlyph its `fallback` (the usual letter).
// Styles: public/css/chat.css (.chat__facico, .fglyph).

import { html } from './components.js';
import { data, useData } from '../data.js';
import { bondIconUrl } from './assetUrls.js';
import { useStore } from '../store.js';
import { chatFaction } from '../../../shared/constants.js';

/** Icon URL of a faction record, or null. */
export const factionIconUrl = (f) => (f ? bondIconUrl(data.get('assets'), f.bond) : null);

/** The faction (record) a player picked, or null. */
export function useSeatFaction(playerId) {
  const id = useStore((s) => (playerId ? (s.room?.seats || []).find((x) => x && x.playerId === playerId)?.chatFaction ?? null : null));
  return chatFaction(id);
}

/** @param {{ f: any, class?: string }} props */
export function FactionIcon({ f, class: cls = 'chat__facico' }) {
  useData('assets');
  const url = factionIconUrl(f);
  return url ? html`<i class=${cls} style=${`--fac:${f.color};--ico:url("${url}")`} aria-hidden="true"></i>` : null;
}

/** @param {{ f: any, name?: string, fallback?: any }} props fallback: shown while the icon is unavailable */
export function FactionGlyph({ f, name = '', fallback = null }) {
  useData('assets');
  const url = factionIconUrl(f);
  if (!url) return fallback;
  const letter = [...(name || '').trim()][0] || '?';
  return html`<span class="fglyph" style=${`--fac:${f.color};--ico:url("${url}")`} title=${f.name}>
    <i class="fglyph__ico" aria-hidden="true"></i><span class="fglyph__ch">${letter}</span>
  </span>`;
}
