// 맹약별 선발 프리셋 (local feature, user decisions 2026-10-09 8–10; docs/rules/diy.md 「진영별 선발 프리셋」): per-browser
// 自选编队 rosters — one for 不使用预设 (`base`) and one per chat faction (shared/local.js CHAT_FACTIONS — the eight nation
// bonds), each its own; a faction's is empty until the player fills it (an empty one is no preset). Picking a faction
// (ui/factionPick.js chooseFaction: the chat, the strategy draft's row) applies that faction's preset to the 自选 picks,
// with a 撤销; a faction without a preset changes nothing.
//
//   diyPresetStore   { presets: { [factionId]: picks }, base: picks, active: factionId | null, notice }
//                    `active` = the roster the 自选编队 tab shows (null = 不使用预设); the live picks are always that
//                    roster, and every change of them (a slot, 清空, an import) is saved into it (an emptied faction's
//                    preset goes). `notice` = the last faction apply, for its 撤销.
//   selectPreset(id) the tab's preset bar: switch to that roster (a faction without one starts empty; null = base) —
//                    the one left keeps its picks (user report 2026-10-09: switching once copied them over).
//   deletePreset(id) forget a faction's preset (and go back to base if it was shown).
//   applyFactionPreset(id) / undoFactionPreset()   the faction pick.
//   installDiyPresets()   main.js, once: follow the picks into the shown roster.
// The picks themselves stay ui/loadoutSync.js's (setDiyPicks → localStorage + room.diy); a running match takes them while
// its briefing or strategy draft runs (server platform.js setDiy) — from the prep on a faction pick applies no preset.
// Storage: localStorage `sp.pref.diyPresets` = { v: 2, presets, base, active } (each roster cleaned like the picks; a v1
// envelope without `base` takes the current picks as base when it showed none).

import { createStore, loadPref, savePref } from '../store.js';
import { loadoutStore, setDiyPicks } from './loadoutSync.js';
import { cleanPicks } from './diyModel.js';
import { chatFaction } from '../../../shared/local.js';

export const DIY_PRESETS_PREF = 'diyPresets';
export const DIY_PRESETS_VERSION = 2;
/** How long the chat's 「…预设已套用 · 撤销」 line stays (ms). */
export const PRESET_NOTICE_MS = 10000;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const isEmpty = (p) => !p || Object.keys(p).length === 0;

/**
 * The valid rosters of a stored envelope (unknown factions, empty presets and junk dropped).
 * @param {any} raw
 * @param {Record<string, any>} [current] the live picks: a v1 envelope's base when it showed 不使用预设
 */
export function parseStoredPresets(raw, current = {}) {
  const out = {};
  const src = isObj(raw) && isObj(raw.presets) ? raw.presets : {};
  for (const [id, picks] of Object.entries(src)) {
    if (!chatFaction(id) || !isObj(picks)) continue;
    const clean = cleanPicks(picks);
    if (!isEmpty(clean)) out[id] = clean;
  }
  const active = isObj(raw) && chatFaction(raw.active) ? raw.active : null;
  const base = isObj(raw) && isObj(raw.base) ? cleanPicks(raw.base) : active ? {} : cleanPicks(current);
  return { presets: out, base, active };
}

/** The envelope for localStorage. */
export function toStoredPresets(presets, base, active) {
  return { v: DIY_PRESETS_VERSION, presets, base: base || {}, active: active ?? null };
}

const samePicks = (a, b) => JSON.stringify(cleanPicks(a)) === JSON.stringify(cleanPicks(b));

function readStored() {
  try { return parseStoredPresets(loadPref(DIY_PRESETS_PREF, null), loadoutStore.get().diy); } catch { return { presets: {}, base: {}, active: null }; }
}

export const diyPresetStore = createStore({ ...readStored(), notice: null });

/** The roster `id` holds (null = base; a faction without a preset: empty). */
function rosterOf(s, id) {
  return id == null ? s.base || {} : s.presets[id] || {};
}

function save(patch, extra = {}) {
  const next = { ...diyPresetStore.get(), ...patch };
  try { savePref(DIY_PRESETS_PREF, toStoredPresets(next.presets, next.base, next.active)); } catch { /* private mode: the session keeps it */ }
  diyPresetStore.set({ presets: next.presets, base: next.base, active: next.active, ...extra });
}

/** Store `picks` as roster `id` (null = base); an emptied faction's preset goes. */
function withRoster(s, id, picks) {
  const clean = cleanPicks(picks);
  if (id == null) return { base: clean };
  const presets = { ...s.presets };
  if (isEmpty(clean)) delete presets[id];
  else presets[id] = clean;
  return { presets };
}

/** The tab's preset bar: show roster `id` (a faction or null = 不使用预设); the roster left keeps its picks. */
export function selectPreset(id) {
  const target = id != null && chatFaction(id) ? id : null;
  const s = diyPresetStore.get();
  if (target === s.active) return;
  // the shown roster already follows every edit (installDiyPresets); store it once more in case the follower is off
  save({ ...withRoster(s, s.active, loadoutStore.get().diy), active: target });
  setDiyPicks(rosterOf(diyPresetStore.get(), target));
}

/** Forget a faction's preset (and show 不使用预设 again if it was the one shown). */
export function deletePreset(id) {
  const s = diyPresetStore.get();
  if (!s.presets[id] && s.active !== id) return;
  const presets = { ...s.presets };
  delete presets[id];
  if (s.active !== id) { save({ presets }); return; }
  save({ presets, active: null });
  setDiyPicks(s.base || {});
}

/**
 * A faction pick: show that faction's preset. Null when it has none (nothing changes; an earlier notice goes, it was
 * about another faction); else the notice, kept in the store for its 撤销 — none when that roster was already shown.
 * @param {string} id chat faction id
 * @param {{ inMatch?: boolean, now?: number }} [o] inMatch: a running match takes the picks (its briefing / strategy
 *   draft — the caller, ui/factionPick.js chooseFaction, applies a preset only then)
 */
export function applyFactionPreset(id, { inMatch = false, now = Date.now() } = {}) {
  const s = diyPresetStore.get();
  const preset = chatFaction(id) ? s.presets[id] : null;
  if (!preset) { clearPresetNotice(); return null; }
  if (s.active === id && samePicks(loadoutStore.get().diy, preset)) { clearPresetNotice(); return null; }
  const prev = { picks: loadoutStore.get().diy, active: s.active };
  const notice = { factionId: id, prev, inMatch: !!inMatch, at: now };
  save({ ...withRoster(s, s.active, prev.picks), active: id }, { notice });
  setDiyPicks(preset);
  return notice;
}

/** 撤销 of the last faction apply: the roster shown before, with its picks. */
export function undoFactionPreset() {
  const s = diyPresetStore.get();
  const n = s.notice;
  if (!n) return false;
  save({ active: n.prev.active }, { notice: null });
  setDiyPicks(n.prev.picks);
  return true;
}

/** Drop the notice (its time ran out). */
export function clearPresetNotice() {
  if (diyPresetStore.get().notice) diyPresetStore.set({ notice: null });
}

let installed = null;
/** Follow every change of the 自选 picks into the shown roster (main.js, once; returns the unsubscribe). */
export function installDiyPresets({ source = loadoutStore } = {}) {
  if (installed) return installed;
  let last = source.get().diy;
  const off = source.subscribe((s) => {
    if (s.diy === last) return;
    last = s.diy;
    const cur = diyPresetStore.get();
    if (samePicks(rosterOf(cur, cur.active), s.diy)) return;
    save(withRoster(cur, cur.active, s.diy));
  });
  installed = () => { off(); installed = null; };
  return installed;
}
