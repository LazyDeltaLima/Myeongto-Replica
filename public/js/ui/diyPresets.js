// 맹약별 선발 프리셋 (local feature, user decisions 2026-10-09 8–10; docs/rules/diy.md 「진영별 선발 프리셋」): per-browser
// 自选编队 presets, one per chat faction (shared/local.js CHAT_FACTIONS — the eight nation bonds), all empty until the
// player makes them. Picking a faction in the chat (ui/chat.js FactionPicker) applies that faction's preset to the 自选
// picks, with a 撤销 next to the picker; a faction without a preset changes nothing.
//
//   diyPresetStore   { presets: { [factionId]: picks }, active: factionId | null, notice }
//                    `active` = the preset the 自选编队 tab is linked to: while it is set, every change of the picks (a slot,
//                    清空, an import) is saved into that preset too. `notice` = the last chat apply, for its 撤销.
//   selectPreset(id) the tab's preset bar: a saved preset is applied and linked; an empty one is created from the current
//                    picks and linked; null unlinks (the picks stay).
//   deletePreset(id) forget a preset (unlinks it).
//   applyFactionPreset(id) / undoFactionPreset()   the chat faction pick.
//   installDiyPresets()   main.js, once: follow the picks into the linked preset.
// The picks themselves stay ui/loadoutSync.js's (setDiyPicks → localStorage + room.diy); a running match never takes them,
// so a preset applied during a match fields from the next match — or from the new match a briefing reroll starts.
// Storage: localStorage `sp.pref.diyPresets` = { v: 1, presets, active } (each preset cleaned like the picks).

import { createStore, loadPref, savePref } from '../store.js';
import { loadoutStore, setDiyPicks } from './loadoutSync.js';
import { cleanPicks } from './diyModel.js';
import { chatFaction } from '../../../shared/local.js';

export const DIY_PRESETS_PREF = 'diyPresets';
export const DIY_PRESETS_VERSION = 1;
/** How long the chat's 「…预设已套用 · 撤销」 line stays (ms). */
export const PRESET_NOTICE_MS = 10000;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** The valid presets of a stored envelope (unknown factions and junk dropped). @param {any} raw */
export function parseStoredPresets(raw) {
  const out = {};
  const src = isObj(raw) && isObj(raw.presets) ? raw.presets : {};
  for (const [id, picks] of Object.entries(src)) if (chatFaction(id) && isObj(picks)) out[id] = cleanPicks(picks);
  const active = isObj(raw) && chatFaction(raw.active) && out[raw.active] ? raw.active : null;
  return { presets: out, active };
}

/** The envelope for localStorage. */
export function toStoredPresets(presets, active) {
  return { v: DIY_PRESETS_VERSION, presets, active: active ?? null };
}

const samePicks = (a, b) => JSON.stringify(cleanPicks(a)) === JSON.stringify(cleanPicks(b));

function readStored() {
  try { return parseStoredPresets(loadPref(DIY_PRESETS_PREF, null)); } catch { return { presets: {}, active: null }; }
}

export const diyPresetStore = createStore({ ...readStored(), notice: null });

function save(presets, active, extra = {}) {
  try { savePref(DIY_PRESETS_PREF, toStoredPresets(presets, active)); } catch { /* private mode: the session keeps it */ }
  diyPresetStore.set({ presets, active, ...extra });
}

/** The tab's preset bar: apply + link a saved preset, create one from the current picks, or unlink (null). */
export function selectPreset(id) {
  const { presets } = diyPresetStore.get();
  if (id == null || !chatFaction(id)) { save(presets, null); return; }
  if (presets[id]) {
    save(presets, id);
    setDiyPicks(presets[id]);
    return;
  }
  save({ ...presets, [id]: cleanPicks(loadoutStore.get().diy) }, id);
}

/** Forget a faction's preset (and unlink it). */
export function deletePreset(id) {
  const { presets, active } = diyPresetStore.get();
  if (!presets[id]) return;
  const next = { ...presets };
  delete next[id];
  save(next, active === id ? null : active);
}

/**
 * The chat faction pick: apply that faction's preset (and link it). Null when it has none (the picks stay; an earlier
 * notice goes, it was about another faction); else the notice, kept in the store for its 撤销 — none when the picks
 * already were the preset.
 * @param {string} id chat faction id
 * @param {{ inMatch?: boolean, now?: number }} [o] inMatch: the picks wait for the next match (or a reroll)
 */
export function applyFactionPreset(id, { inMatch = false, now = Date.now() } = {}) {
  const { presets, active } = diyPresetStore.get();
  const preset = presets[id];
  if (!chatFaction(id) || !preset) { clearPresetNotice(); return null; }
  const prev = { picks: loadoutStore.get().diy, active };
  const changed = !samePicks(prev.picks, preset);
  const notice = changed ? { factionId: id, prev, inMatch: !!inMatch, at: now } : null;
  save(presets, id, { notice });
  if (changed) setDiyPicks(preset);
  return notice;
}

/** 撤销 of the last chat apply: the picks and the linked preset as they were. */
export function undoFactionPreset() {
  const { presets, notice } = diyPresetStore.get();
  if (!notice) return false;
  save(presets, notice.prev.active, { notice: null });
  setDiyPicks(notice.prev.picks);
  return true;
}

/** Drop the chat notice (its time ran out or it was closed). */
export function clearPresetNotice() {
  if (diyPresetStore.get().notice) diyPresetStore.set({ notice: null });
}

let installed = null;
/** Follow every change of the 自选 picks into the linked preset (main.js, once; returns the unsubscribe). */
export function installDiyPresets({ source = loadoutStore } = {}) {
  if (installed) return installed;
  let last = source.get().diy;
  const off = source.subscribe((s) => {
    if (s.diy === last) return;
    last = s.diy;
    const { presets, active } = diyPresetStore.get();
    if (!active || samePicks(presets[active], s.diy)) return;
    save({ ...presets, [active]: cleanPicks(s.diy) }, active);
  });
  installed = () => { off(); installed = null; };
  return installed;
}
