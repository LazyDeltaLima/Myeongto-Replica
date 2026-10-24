// ui/gameLogic/shortcuts.js — in-match keyboard shortcuts and the player's key map (设置 → 快捷键, 0.2.0: the community
// request 「快捷键可不可以自己设置」, the owner's decision of 2026-10-07). Re-exported from ../gameLogic.js.

import { isObj } from './shared.js';


// ---- the key map ------------------------------------------------------------------------------------------------

/**
 * The rebindable shortcuts in the settings' order — the official one (display_meta_table pcKeyData: the autoChess group,
 * then retreatChar and pauseBattle of the normalBattle group). shop folds / unfolds the shop bar (调度中心), viewEnemy is
 * the right 🔍 (the enemy preview pen and back), pause pauses / resumes a solo battle. Esc is fixed.
 */
export const HOTKEY_ACTIONS = Object.freeze(['refresh', 'freeze', 'levelUp', 'shop', 'ready', 'sell', 'viewEnemy', 'retreat', 'pause']);

/** Default key of each action (a KeyboardEvent.code): the official defaults of pcKeyData (maintainer decision 2026-10-24). */
export const DEFAULT_HOTKEYS = Object.freeze({ refresh: 'KeyD', freeze: 'KeyS', levelUp: 'KeyG', shop: 'KeyA', ready: 'KeyC', sell: 'KeyX',
  viewEnemy: 'KeyW', retreat: 'KeyQ', pause: 'Space' });

// the defaults of 0.1.4 to 1.5.3 (the ready key paused a solo battle too): a map saved with exactly these was never
// rebound — it takes the official defaults
const OLD_DEFAULTS = Object.freeze({ refresh: 'KeyR', freeze: 'KeyF', levelUp: 'KeyD', retreat: 'KeyQ', sell: 'KeyX', ready: 'Space' });

// actions added after a key map could be saved: a map saved before lacks them, and their default may be a key the player
// gave another action — such an action takes the first free key instead, so the player's map is not reset
const LATER_ACTIONS = Object.freeze(['viewEnemy', 'shop', 'pause']);

/** Whether a saved map is the old defaults, never rebound (viewEnemy, added on its own default first, may be in it). */
const isOldDefaults = (r) => Object.entries(OLD_DEFAULTS).every(([a, c]) => r[a] === c)
  && (!Object.hasOwn(r, 'viewEnemy') || r.viewEnemy === 'KeyW') && !Object.hasOwn(r, 'shop') && !Object.hasOwn(r, 'pause');

// The keys a shortcut may use → the `key` value each types on a US layout (lower case): letters, digits, Space, the
// punctuation keys, and six named keys whose `key` equals their `code`. Everything else stays with the interface: Esc
// (closes; cancels a rebind), Tab / Enter / the arrows (focus, buttons, the facing wheel, lists), F1–F12 (the browser's),
// the modifiers.
const KEY_OF = new Map([
  ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => [`Key${c}`, c.toLowerCase()]),
  ...[...'0123456789'].map((c) => [`Digit${c}`, c]),
  ['Space', ' '], ['Backquote', '`'], ['Minus', '-'], ['Equal', '='], ['BracketLeft', '['], ['BracketRight', ']'],
  ['Backslash', '\\'], ['Semicolon', ';'], ['Quote', "'"], ['Comma', ','], ['Period', '.'], ['Slash', '/'],
  ...['Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'].map((k) => [k, k]),
]);
const CODE_OF = new Map([...KEY_OF].map(([code, key]) => [key, code]));

/** A key press's `key`, lower case when it is one character ('' when absent). */
const keyValue = (e) => {
  const k = e?.key;
  return typeof k !== 'string' ? '' : k.length === 1 ? k.toLowerCase() : k;
};

/**
 * Whether a KeyboardEvent.code may be a shortcut's key.
 * @param {any} code
 * @returns {boolean}
 */
export const isBindableCode = (code) => typeof code === 'string' && KEY_OF.has(code);

/**
 * The label a key is shown with ('KeyQ' → 'Q', 'Digit1' → '1', 'Comma' → ',', 'Space', 'Delete'); '' for any other code.
 * @param {any} code
 */
export function hotkeyLabel(code) {
  if (!isBindableCode(code)) return '';
  if (code === 'Space') return 'Space';
  const k = KEY_OF.get(code);
  return k.length === 1 ? k.toUpperCase() : k;
}

/**
 * Sanitize a persisted key map: the old defaults never rebound become the official ones (OLD_DEFAULTS); each action
 * keeps a saved key that may be a shortcut, else gets its default (an action added later and missing from the map: the
 * first free key when its default is taken — LATER_ACTIONS); a map in which two actions would share a key is bad data —
 * the defaults instead.
 * @param {any} raw
 * @returns {Record<'refresh'|'freeze'|'levelUp'|'shop'|'ready'|'sell'|'viewEnemy'|'retreat'|'pause', string>}
 */
export function sanitizeHotkeys(raw) {
  const r = isObj(raw) && !Array.isArray(raw) ? raw : {};
  if (isOldDefaults(r)) return { ...DEFAULT_HOTKEYS };
  const out = {};
  for (const a of HOTKEY_ACTIONS) out[a] = Object.hasOwn(r, a) && isBindableCode(r[a]) ? r[a] : DEFAULT_HOTKEYS[a];
  for (const a of LATER_ACTIONS) {
    if (Object.hasOwn(r, a)) continue;
    const used = new Set(HOTKEY_ACTIONS.filter((b) => b !== a).map((b) => out[b]));
    if (used.has(out[a])) out[a] = [...KEY_OF.keys()].find((c) => !used.has(c));
  }
  return new Set(Object.values(out)).size === HOTKEY_ACTIONS.length ? out : { ...DEFAULT_HOTKEYS };
}

/**
 * Bind `action` to `code`. A key another action holds is swapped, never shared: that action takes the old key of
 * `action`, so every action keeps exactly one key and no key does two things.
 * @param {any} keys the current map
 * @param {string} action
 * @param {string} code
 * @returns {{ keys: Record<string, string>, changed: boolean, swapped: string|null }} swapped: the action that took the old key
 */
export function rebindHotkey(keys, action, code) {
  const cur = sanitizeHotkeys(keys);
  if (!HOTKEY_ACTIONS.includes(action) || !isBindableCode(code) || cur[action] === code) return { keys: cur, changed: false, swapped: null };
  const swapped = HOTKEY_ACTIONS.find((a) => cur[a] === code) ?? null;
  const next = { ...cur, [action]: code };
  if (swapped) next[swapped] = cur[action];
  return { keys: next, changed: true, swapped };
}

/** Whether a map is the default one. @param {any} keys */
export const isDefaultHotkeys = (keys) => {
  const k = sanitizeHotkeys(keys);
  return HOTKEY_ACTIONS.every((a) => k[a] === DEFAULT_HOTKEYS[a]);
};

/**
 * The bindable key a key press names: the character typed — the label on the player's keycap (AZERTY, Dvorak) — else
 * the physical key (a non-Latin layout, an IME, Shift + a digit); null when neither may be a shortcut.
 * @param {{ key?: string, code?: string }} e
 * @returns {string|null}
 */
export function hotkeyOf(e) {
  const typed = CODE_OF.get(keyValue(e));
  if (typed) return typed;
  return isBindableCode(e?.code) ? e.code : null;
}

/**
 * The one lookup of every shortcut handler: the action a key press triggers under the key map — the action bound to the
 * character typed, else the one bound to the physical key (as the fixed keys of 0.1.4 matched `code === 'KeyR' ||
 * key === 'r'`: a Russian layout or an IME still works by position). No modifier or focus checks (shortcutFor).
 * @param {{ key?: string, code?: string }} e
 * @param {any} [keys] the player's map (settings `keys`); the defaults when omitted
 * @returns {'refresh'|'freeze'|'levelUp'|'shop'|'ready'|'sell'|'viewEnemy'|'retreat'|'pause'|null}
 */
export function actionForKey(e, keys = DEFAULT_HOTKEYS) {
  const map = keys === DEFAULT_HOTKEYS ? keys : sanitizeHotkeys(keys);
  const find = (code) => (code ? HOTKEY_ACTIONS.find((a) => map[a] === code) ?? null : null);
  return find(CODE_OF.get(keyValue(e))) ?? find(typeof e?.code === 'string' ? e.code : null);
}

// keys that only modify another (pressed alone while the settings wait for a key: ignored)
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Super', 'Hyper', 'Fn', 'FnLock', 'CapsLock',
  'NumLock', 'ScrollLock', 'Symbol', 'SymbolLock']);

/**
 * What a key press does while the settings wait for a new key: Esc cancels (the dialog stays open), Tab leaves (the focus
 * moves on), a lone modifier or an auto-repeat is ignored, a key held with Ctrl / ⌘ / Alt or one the interface keeps is
 * refused (the wait goes on), any other key is the new key.
 * @param {{ key?: string, code?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, repeat?: boolean }} e
 * @returns {{ kind: 'cancel'|'leave'|'ignore' } | { kind: 'refuse', reason: 'modifier'|'reserved', name: string } | { kind: 'key', code: string }}
 */
export function captureHotkey(e) {
  const key = typeof e?.key === 'string' ? e.key : '';
  if (key === 'Escape') return { kind: 'cancel' };
  if (key === 'Tab') return { kind: 'leave' };
  if (!e || e.repeat || MODIFIER_KEYS.has(key)) return { kind: 'ignore' };
  const name = key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key || e.code || '?';
  if (e.ctrlKey || e.metaKey || e.altKey) return { kind: 'refuse', reason: 'modifier', name };
  const code = hotkeyOf(e);
  return code ? { kind: 'key', code } : { kind: 'refuse', reason: 'reserved', name };
}


// ---- keyboard ---------------------------------------------------------------------------------------------------

/**
 * Map a keydown to a game shortcut under the player's key map (the official defaults: D refresh, S freeze, G level-up,
 * A shop, C ready, X sell, W enemy preview pen, Q retreat, Space pause) or Esc (close; fixed). A shortcut key means its action even while a HUD button has focus (a
 * mouse click leaves the shop card / 刷新 focused, and Space must not re-trigger it); the caller prevents the button's
 * own activation. Enter still activates buttons (it cannot be a shortcut; behind the facing wheel only its ✕:
 * facingEnter). Nothing while Ctrl / ⌘ / Alt is held or a text field has the focus.
 * @param {{ key?: string, code?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, repeat?: boolean, target?: any }} e
 * @param {any} [keys] the player's map (settings `keys`)
 * @returns {'refresh'|'freeze'|'levelUp'|'shop'|'ready'|'sell'|'viewEnemy'|'retreat'|'pause'|'escape'|null}
 */
export function shortcutFor(e, keys = DEFAULT_HOTKEYS) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target;
  const tag = t && typeof t.tagName === 'string' ? t.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return null;
  if (e.key === 'Escape') return 'escape';
  if (e.repeat) return null;
  return actionForKey(e, keys);
}

/**
 * Whether the facing wheel swallows a key press: no ready / shop action while a facing is chosen — Space (a focused
 * button must not activate either) and every key bound to a shortcut.
 * @param {{ key?: string, code?: string }} e
 * @param {any} [keys] the player's map
 */
export const facingSwallows = (e, keys = DEFAULT_HOTKEYS) => e?.key === ' ' || actionForKey(e, keys) != null;

// what a focused element is when Enter would activate it (a button, a link, a form field, an ARIA control)
const CONTROL = 'button, a[href], input, select, textarea, summary, [contenteditable=""], [contenteditable="true"], '
  + '[role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"]';

/**
 * What Enter does while the facing wheel is open (GitHub #394, PR #395): on the wheel's own ✕ button it cancels; on
 * any other control (准备, 刷新, 设置, 玩法说明, a shop card … — Tab reaches them behind the wheel) nothing happens — the
 * wheel holds the keyboard as it holds Space and the shortcuts; with the focus anywhere else (the wheel itself, the
 * page) it confirms the previewed direction, and does nothing while none is previewed. null: not Enter.
 * @param {{ key?: string, target?: any }} e @param {boolean} chosen a direction is previewed
 * @returns {'cancel'|'commit'|'swallow'|null}
 */
export function facingEnter(e, chosen) {
  if (e?.key !== 'Enter') return null;
  const t = e.target;
  const closest = (sel) => (t && typeof t.closest === 'function' ? t.closest(sel) : null);
  if (closest('.fwheel__cancel')) return 'cancel';
  if (closest(CONTROL)) return 'swallow';
  return chosen ? 'commit' : 'swallow';
}

/**
 * Whether a press on the field closes the open detail card: a card opened from the field itself (an own piece — tap,
 * right-click or long press —, a battle / teammate unit, a stage device, or an enemy of the
 * preview pen / the boss field's leader: `fromField`). Shop, reward, bond-member and intel-drawer cards have their own
 * rules (closesOnOutsidePress; ui/shopBar.js).
 * @param {{ kind?: string, fromField?: boolean }|null|undefined} detail
 */
// a card opened BY a field press (a piece, a unit, a stage device: #228, an enemy on the board: GitHub #3, maintainer
// decision 2026-10-14 — a boss card left open covered the bench) closes on the next press of the field.
// A special terrain tile opens no card: its toast (ui/tileToast.js) goes with the next field press too (screens/game.js)
export const closesOnFieldPress = (detail) => detail?.kind === 'piece' || detail?.kind === 'unit' || detail?.kind === 'device'
  || (detail?.kind === 'enemy' && detail.fromField === true);

// No card has a close button, as the client's UICharacterInfoPanel has none (GitHub #3, maintainer decision 2026-10-14):
// a card a window opened — the 敌方情报 / 本局信息 drawer's enemy and operator rows (`from: 'drawer'`), a bond popup's
// members, one's own, a teammate's or a spectator's (`from: 'bond'`) — closes on a press anywhere but on the card and
// on the rows that open another card (their click replaces it), and with its window (windowCardGone). A card of the
// official form lets presses through where it has nothing to press, so a press there reaches what lies under it and
// closes it like any outside press.
/** @param {{ from?: string }|null|undefined} detail */
export const openedFromWindow = (detail) => detail?.from === 'drawer' || detail?.from === 'bond';
/** What a press may hit without closing a window's card: the card, a dialog (a confirm), the rows that open a card. */
export const WINDOW_CARD_KEEP = '.dpanel, .modal, .erow, .ibanned__one, .bpop__member, button.bpop__harmony';
/**
 * Whether a press on `target` closes the open card (a window's card only). A drawer's card also stays for a press in a
 * bond popup (one its bond chip opened); a bond popup's card does not — the popup's empty area is its window's.
 * @param {{ from?: string }|null|undefined} detail @param {{ closest?: (sel: string) => any }|null|undefined} target
 */
export function closesOnOutsidePress(detail, target) {
  if (!openedFromWindow(detail)) return false;
  const keep = detail?.from === 'drawer' ? `${WINDOW_CARD_KEEP}, .bpop, .bpop-nav` : WINDOW_CARD_KEEP;
  return !(target && typeof target.closest === 'function' && target.closest(keep));
}
/**
 * Whether the window that opened the card is gone (the drawer closed, the bond popup closed): the card goes with it.
 * @param {{ from?: string }|null|undefined} detail @param {{ drawer?: any, bond?: any }} open
 */
export const windowCardGone = (detail, { drawer = null, bond = null } = {}) =>
  (detail?.from === 'drawer' && !drawer) || (detail?.from === 'bond' && !bond);

/**
 * Whether an open overlay swallows a game shortcut: a modal / the guide own the keyboard (Esc included — they close
 * themselves); the 本局信息 / 敌方情报 drawer is a dialog too — only Esc (it closes the drawer) passes, the other
 * shortcuts never act behind it.
 * @param {'refresh'|'freeze'|'levelUp'|'shop'|'ready'|'sell'|'viewEnemy'|'retreat'|'pause'|'escape'|null} act shortcutFor
 * @param {{ modal?: boolean, drawer?: boolean }} open
 */
export function shortcutBlocked(act, { modal = false, drawer = false } = {}) {
  if (!act) return true;
  if (modal) return true;
  return !!drawer && act !== 'escape';
}
