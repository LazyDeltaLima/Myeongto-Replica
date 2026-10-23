// ui/gameLogic/settings.js — settings defaults and sanitising. Re-exported from ../gameLogic.js.

import { clamp, isObj } from './shared.js';
import { DEFAULT_HOTKEYS, sanitizeHotkeys } from './shortcuts.js';
import { NUMBER_UNIT_MODES } from './format.js';


// ---- settings ------------------------------------------------------------------------------------------------------

/** The chat notification's gap (whole seconds): the default and the range of its setting. */
export const CHAT_COOLDOWN = Object.freeze({ def: 2, min: 1, max: 5 });

/**
 * keys: the in-match shortcuts' key map (ui/gameLogic/shortcuts.js; settings → 快捷键). chatSound / chatVolume /
 * chatCooldown / chatFactionAlerts: the notification of the others' chat lines (audio.js chatNotification, ui/chat.js).
 * chatPinRecent: the match chat keeps the latest 3 lines shown while it is closed (ui/chat.js pinnedLines).
 * eliteBadge: the 精二 badge beside an elite piece's prep tier chip (render/elite-mark.js). matchNotices: the match's
 * notification toasts (showMatchToast below). numberUnits: how large numbers are shortened (fmtNum, ui/gameLogic/format.js
 * NUMBER_UNIT_MODES; null = the language's own style).
 */
export const DEFAULT_SETTINGS = Object.freeze({ bgm: 0.6, sfx: 0.8, voice: 0.8, muted: false, damageNumbers: true, quality: 'high', keys: DEFAULT_HOTKEYS,
  chatSound: true, chatVolume: 0.5, chatCooldown: CHAT_COOLDOWN.def, chatFactionAlerts: false, chatPinRecent: false,
  eliteBadge: false, matchNotices: true, numberUnits: null });
const QUALITIES = ['high', 'medium', 'low'];

/**
 * Sanitize persisted settings.
 * @param {any} raw
 * @returns {{ bgm: number, sfx: number, voice: number, muted: boolean, damageNumbers: boolean, quality: 'high'|'medium'|'low',
 *   keys: Record<'refresh'|'freeze'|'levelUp'|'retreat'|'sell'|'ready', string>, chatSound: boolean, chatVolume: number,
 *   chatCooldown: number, chatFactionAlerts: boolean, chatPinRecent: boolean, eliteBadge: boolean, matchNotices: boolean,
 *   numberUnits: 'myriad'|'thousand'|'full'|null }}
 */
export function sanitizeSettings(raw) {
  const r = isObj(raw) ? raw : {};
  const vol = (v, d) => (Number.isFinite(v) ? clamp(Math.round(v * 100) / 100, 0, 1) : d);
  return {
    bgm: vol(r.bgm, DEFAULT_SETTINGS.bgm),
    sfx: vol(r.sfx, DEFAULT_SETTINGS.sfx),
    voice: vol(r.voice, DEFAULT_SETTINGS.voice),
    muted: typeof r.muted === 'boolean' ? r.muted : DEFAULT_SETTINGS.muted,
    damageNumbers: typeof r.damageNumbers === 'boolean' ? r.damageNumbers : DEFAULT_SETTINGS.damageNumbers,
    quality: QUALITIES.includes(r.quality) ? r.quality : DEFAULT_SETTINGS.quality,
    keys: sanitizeHotkeys(r.keys),
    chatSound: typeof r.chatSound === 'boolean' ? r.chatSound : DEFAULT_SETTINGS.chatSound,
    chatVolume: vol(r.chatVolume, DEFAULT_SETTINGS.chatVolume),
    chatCooldown: Number.isFinite(r.chatCooldown) ? clamp(Math.round(r.chatCooldown), CHAT_COOLDOWN.min, CHAT_COOLDOWN.max) : DEFAULT_SETTINGS.chatCooldown,
    chatFactionAlerts: typeof r.chatFactionAlerts === 'boolean' ? r.chatFactionAlerts : DEFAULT_SETTINGS.chatFactionAlerts,
    chatPinRecent: typeof r.chatPinRecent === 'boolean' ? r.chatPinRecent : DEFAULT_SETTINGS.chatPinRecent,
    eliteBadge: typeof r.eliteBadge === 'boolean' ? r.eliteBadge : DEFAULT_SETTINGS.eliteBadge,
    matchNotices: typeof r.matchNotices === 'boolean' ? r.matchNotices : DEFAULT_SETTINGS.matchNotices,
    numberUnits: NUMBER_UNIT_MODES.includes(r.numberUnits) ? r.numberUnits : DEFAULT_SETTINGS.numberUnits,
  };
}

/**
 * Whether a match toast is shown (ui/matchToast.js, main.js m.toast). Settings → 画面 「对局通知」 off drops them all: the
 * server's match toasts of every kind (「…：获得…」, a band's funds, pieces sent back to the bench, the elimination …) and
 * the refusals of in-match actions (maintainer decision 2026-10-17).
 * @param {{ matchNotices?: boolean } | null | undefined} settings
 */
export const showMatchToast = (settings) => settings?.matchNotices !== false;
