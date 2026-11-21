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
 * chatShowTime: show message times in room and match chat, including pinned lines.
 * chatPinRecent: the match chat keeps the latest 3 lines shown while it is closed (ui/chat.js pinnedLines).
 * eliteBadge: the 精二 badge beside an elite piece's prep tier chip (render/elite-mark.js). matchNotices: the match's
 * notification toasts (showMatchToast below). numberUnits: how large numbers are shortened (fmtNum, ui/gameLogic/format.js
 * NUMBER_UNIT_MODES; null = the language's own style). roundDamage / roundDamageStyle: the match's round damage panel
 * (ui/roundDamage.js) shown at all, and its look — ROUND_DAMAGE_STYLES; 'auto' = full on a desktop, compact on a phone.
 * frameLimit: the field view's frame rate cap (FRAME_LIMITS; 0 = none). deployFold: the old choice of a held piece's
 * fold; its toggle is commented out and nothing reads it (ui/settings.js, maintainer decision 2026-11-07). sideCamera: a
 * held or selected piece's side camera — SIDE_CAMERA_MODES; 'auto' = the season's official camera (gameLogic/camera.js
 * sideCameraOn). screenWakeLock: when the screen is kept on — SCREEN_WAKE_MODES ('combat' = a match's combat phases;
 * main.js App, ui/device.js useScreenWakeLock). otherSkins: the skins other players chose are drawn (settings → 资源
 * 「其他玩家的皮肤」, usable once the skin data is chosen — resources.js SkinPackSetting; upstream's 显示其他玩家的皮肤).
 */
export const DEFAULT_SETTINGS = Object.freeze({ bgm: 0.6, sfx: 0.8, voice: 0.8, muted: false, damageNumbers: true, quality: 'high', keys: DEFAULT_HOTKEYS,
  chatSound: true, chatVolume: 0.5, chatCooldown: CHAT_COOLDOWN.def, chatFactionAlerts: false, chatShowTime: true, chatPinRecent: false,
  eliteBadge: false, matchNotices: true, numberUnits: null, roundDamage: true, roundDamageStyle: 'auto', frameLimit: 0, deployFold: true,
  sideCamera: 'auto', screenWakeLock: 'combat', otherSkins: true });
/** 画面质量: 'auto' steps between high and medium by the load (render/auto-quality.js); a touch-only device starts there (ui/settings.js). */
const QUALITIES = ['auto', 'high', 'medium', 'low'];
/** The round damage panel's looks (settings → 画面 「伤害统计样式」): automatic, every row's name and share, avatars and bars only. */
export const ROUND_DAMAGE_STYLES = Object.freeze(['auto', 'full', 'compact']);
/** Settings → 画面 「帧率上限」: none, then fps. */
export const FRAME_LIMITS = Object.freeze([0, 30, 60, 120]);
/** Settings → 画面 「拿起棋子时侧面镜头」: as the season, on, off. */
export const SIDE_CAMERA_MODES = Object.freeze(['auto', 'on', 'off']);
/** Settings → 通用 「保持屏幕常亮」: never, during a match's combat, whenever the page is shown. */
export const SCREEN_WAKE_MODES = Object.freeze(['off', 'combat', 'always']);

/**
 * Sanitize persisted settings.
 * @param {any} raw
 * @returns {{ bgm: number, sfx: number, voice: number, muted: boolean, damageNumbers: boolean, quality: 'auto'|'high'|'medium'|'low',
 *   keys: Record<'refresh'|'freeze'|'levelUp'|'shop'|'ready'|'sell'|'viewEnemy'|'retreat'|'pause', string>, chatSound: boolean, chatVolume: number,
 *   chatCooldown: number, chatFactionAlerts: boolean, chatShowTime: boolean, chatPinRecent: boolean, eliteBadge: boolean, matchNotices: boolean,
 *   numberUnits: 'myriad'|'thousand'|'full'|null, roundDamage: boolean, roundDamageStyle: 'auto'|'full'|'compact', frameLimit: number, deployFold: boolean,
 *   sideCamera: 'auto'|'on'|'off', screenWakeLock: 'off'|'combat'|'always', otherSkins: boolean }}
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
    chatShowTime: typeof r.chatShowTime === 'boolean' ? r.chatShowTime : DEFAULT_SETTINGS.chatShowTime,
    chatPinRecent: typeof r.chatPinRecent === 'boolean' ? r.chatPinRecent : DEFAULT_SETTINGS.chatPinRecent,
    eliteBadge: typeof r.eliteBadge === 'boolean' ? r.eliteBadge : DEFAULT_SETTINGS.eliteBadge,
    matchNotices: typeof r.matchNotices === 'boolean' ? r.matchNotices : DEFAULT_SETTINGS.matchNotices,
    numberUnits: NUMBER_UNIT_MODES.includes(r.numberUnits) ? r.numberUnits : DEFAULT_SETTINGS.numberUnits,
    roundDamage: typeof r.roundDamage === 'boolean' ? r.roundDamage : DEFAULT_SETTINGS.roundDamage,
    roundDamageStyle: ROUND_DAMAGE_STYLES.includes(r.roundDamageStyle) ? r.roundDamageStyle : DEFAULT_SETTINGS.roundDamageStyle,
    frameLimit: FRAME_LIMITS.includes(r.frameLimit) ? r.frameLimit : DEFAULT_SETTINGS.frameLimit,
    deployFold: typeof r.deployFold === 'boolean' ? r.deployFold : DEFAULT_SETTINGS.deployFold,
    sideCamera: SIDE_CAMERA_MODES.includes(r.sideCamera) ? r.sideCamera : DEFAULT_SETTINGS.sideCamera,
    screenWakeLock: SCREEN_WAKE_MODES.includes(r.screenWakeLock) ? r.screenWakeLock : DEFAULT_SETTINGS.screenWakeLock,
    otherSkins: typeof r.otherSkins === 'boolean' ? r.otherSkins : DEFAULT_SETTINGS.otherSkins,
  };
}

/**
 * Whether a match toast is shown (ui/matchToast.js, main.js m.toast). Settings → 画面 「对局通知」 off drops them all: the
 * server's match toasts of every kind (「…：获得…」, a band's funds, pieces sent back to the bench, the elimination …) and
 * the refusals of in-match actions (maintainer decision 2026-10-17).
 * @param {{ matchNotices?: boolean } | null | undefined} settings
 */
export const showMatchToast = (settings) => settings?.matchNotices !== false;
