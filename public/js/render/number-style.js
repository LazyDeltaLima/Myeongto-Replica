// render/number-style.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」 ④): which damage / heal numbers render/fx.js
// draws. 'official' (default): the client's UIDamageText / UIHealText — a damage number only for a critical or forced hit
// (sim 'dmg' event 5th field, server/sim/local-hud.js damageNumberFlag), heals always; 'classic': every hit as before
// (upstream look: per-type colours, merged totals, lanes). Maintainer decision 2026-10-07: 「지금 표시 방식도 설정창에서 고를 수
// 있게」. Kept in localStorage `sp.pref.dmgNumberStyle` (the settings row: ui/numberStyleSetting.js); read on every number.

export const NUMBER_STYLES = Object.freeze(['official', 'classic']);
const KEY = 'sp.pref.dmgNumberStyle';
let current = null;
const listeners = new Set();

const sanitize = (v) => (NUMBER_STYLES.includes(v) ? v : 'official');

/** The chosen style ('official' | 'classic'). */
export function numberStyle() {
  if (current == null) {
    let raw = null;
    try { raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null'); } catch { raw = null; }
    current = sanitize(raw);
  }
  return current;
}

/** Choose a style (saved; listeners told). */
export function setNumberStyle(v) {
  current = sanitize(v);
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
  for (const fn of listeners) { try { fn(current); } catch { /* ignore */ } }
}

/** Listen for changes; returns the unsubscribe. */
export function onNumberStyle(fn) { listeners.add(fn); return () => listeners.delete(fn); }
