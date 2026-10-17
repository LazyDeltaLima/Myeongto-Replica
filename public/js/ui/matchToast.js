// The match's toasts behind settings → 画面 「对局通知」 (ui/gameLogic/settings.js showMatchToast): the server's match
// toasts (main.js m.toast), a refused in-match action (gameActions.js act) and the game screen's refusal reasons. Off,
// none of them shows; the refusal's error sound still plays where its caller plays one, and a failed request is still
// recorded for 问题反馈 (diag.js).

import { toast, toastError } from './toasts.js';
import { settingsStore } from './settings.js';
import { showMatchToast } from './gameLogic/settings.js';
import { recordError } from '../diag.js';

/**
 * `toast()` unless the match notices are off.
 * @param {string} text
 * @param {'info'|'success'|'warn'|'error'} [kind]
 * @param {{ ttl?: number }} [opts]
 * @returns {number} the toast id, -1 when not shown
 */
export const matchToast = (text, kind, opts) => (showMatchToast(settingsStore.get()) ? toast(text, kind, opts) : -1);

/**
 * `toastError()` unless the match notices are off (the error is recorded either way).
 * @param {any} err
 * @returns {number}
 */
export function matchToastError(err) {
  if (showMatchToast(settingsStore.get())) return toastError(err);
  recordError('request', err);
  return -1;
}
