// 맹약별 선발 프리셋 (local feature, maintainer decisions 2026-10-09; docs/rules/diy.md 「맹약별 선발 프리셋」): per-browser
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
//                    the one left keeps its picks (maintainer report 2026-10-09: switching once copied them over).
//   deletePreset(id) forget a faction's preset (and go back to base if it was shown).
//   applyFactionPreset(id) / undoFactionPreset()   the faction pick; applyBasePreset() shows 不使用预设 the same way.
//   installDiyPresets()   main.js, once: follow the picks into the shown roster.
//   links            { [bandId]: factionId | 'base' | 'keep' } — 전략별 선발 프리셋 (maintainer decision 2026-10-12): the
//                    roster a strategy applies when the player's pick of it lands in the strategy draft
//                    (screens/bandDraft.js); linkBand() sets / clears one; choiceRoster() = the roster a draft choice
//                    applies, shows and edits (a faction: its own, even empty); clearRosterSlot() empties a slot of it. A strategy without a link falls back to the nation bond it is built
//                    around (bandRecommendation: bands.json bondIds ∩ the chat factions — 9 of 40) when that faction has
//                    a preset, else to 不使用预设 (maintainer decision 2026-10-29: until then it kept the picks in use, so
//                    a faction chosen in the tab before the match silently became every unlinked strategy's roster);
//                    'keep' (KEEP_LINK) is a recommendation the player turned off (maintainer request 2026-10-13): it
//                    reads as no link, so the strategy takes 不使用预设 too. toggleBandLink() = a tap in the 自选编队 tab's strategy grid.
// The picks themselves stay ui/loadoutSync.js's (setDiyPicks → localStorage + room.diy); a running match takes them while
// its briefing or strategy draft runs (server platform.js setDiy) — from the prep on a faction pick applies no preset.
// Storage: localStorage `sp.pref.diyPresets` = { v: 3, presets, base, active, links } (each roster cleaned like the picks;
// a v1 envelope without `base` takes the current picks as base when it showed none; v2 has no links).

import { createStore, loadPref, savePref } from '../store.js';
import { loadoutStore, setDiyPicks } from './loadoutSync.js';
import { cleanPicks, setPick } from './diyModel.js';
import { chatFaction, CHAT_FACTIONS } from '../../../shared/local.js';

export const DIY_PRESETS_PREF = 'diyPresets';
export const DIY_PRESETS_VERSION = 3;
/** A strategy link to the 不使用预设 roster. */
export const BASE_LINK = 'base';
/** The draft's choice that applies no roster (the picks stay as they are). */
export const KEEP_LINK = 'keep';
/** How long the chat's 「…预设已套用 · 撤销」 line stays (ms); its × or typing in the chat drops it sooner (ui/factionPick.js). */
export const PRESET_NOTICE_MS = 6000;

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
  return { presets: out, base, active, links: cleanLinks(isObj(raw) ? raw.links : null) };
}

/** A link target: a chat faction or BASE_LINK. */
const isLinkTarget = (v) => v === BASE_LINK || !!chatFaction(v);
/** A stored link: a target, or KEEP_LINK (a turned-off recommendation). */
const isStoredLink = (v) => v === KEEP_LINK || isLinkTarget(v);
const isBandId = (v) => typeof v === 'string' && /^band_[A-Za-z0-9_-]{1,48}$/.test(v);

/** The valid strategy links of a stored object (unknown targets and junk keys dropped). */
export function cleanLinks(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [b, f] of Object.entries(raw)) if (isBandId(b) && isStoredLink(f)) out[b] = f;
  return out;
}

/** The envelope for localStorage. */
export function toStoredPresets(presets, base, active, links = {}) {
  return { v: DIY_PRESETS_VERSION, presets, base: base || {}, active: active ?? null, links: cleanLinks(links) };
}

/**
 * The chat faction a strategy is built around (bands.json bondIds: one nation bond for 9 of the 40 — 「파가니니」 →
 * 拉特兰), else null: the draft's recommended roster when the strategy has no link.
 * @param {{ bondIds?: string[] } | null | undefined} band
 */
export function bandRecommendation(band) {
  const ids = Array.isArray(band?.bondIds) ? band.bondIds : [];
  return CHAT_FACTIONS.find((f) => ids.includes(f.bond))?.id ?? null;
}

/**
 * What the draft applies for a strategy: its link, else its recommendation when that faction holds a preset, else
 * BASE_LINK (不使用预设 — maintainer decision 2026-10-29; a turned-off recommendation, KEEP_LINK, reads as no link).
 * 保持当前编队 stays a choice of this match's dropdown only.
 * @param {string} bandId @param {any} band the bands.json record @param {Record<string, string>} [links]
 * @param {Record<string, any>} [presets] the faction presets (diyPresetStore presets)
 */
export function bandPresetChoice(bandId, band, links = diyPresetStore.get().links, presets = diyPresetStore.get().presets) {
  const l = links && isStoredLink(links[bandId]) ? links[bandId] : null;
  if (l && l !== KEEP_LINK) return l;
  const rec = l === KEEP_LINK ? null : bandRecommendation(band);
  return rec && presets?.[rec] ? rec : BASE_LINK;
}

const samePicks = (a, b) => JSON.stringify(cleanPicks(a)) === JSON.stringify(cleanPicks(b));

function readStored() {
  try { return parseStoredPresets(loadPref(DIY_PRESETS_PREF, null), loadoutStore.get().diy); } catch { return { presets: {}, base: {}, active: null, links: {} }; }
}

export const diyPresetStore = createStore({ links: {}, ...readStored(), notice: null });

/** The roster `id` holds (null = base; a faction without a preset: empty). */
function rosterOf(s, id) {
  return id == null ? s.base || {} : s.presets[id] || {};
}

function save(patch, extra = {}) {
  const next = { ...diyPresetStore.get(), ...patch };
  try { savePref(DIY_PRESETS_PREF, toStoredPresets(next.presets, next.base, next.active, next.links)); } catch { /* private mode: the session keeps it */ }
  diyPresetStore.set({ presets: next.presets, base: next.base, active: next.active, links: next.links || {}, ...extra });
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
 * @param {{ inMatch?: boolean, now?: number, orEmpty?: boolean }} [o] inMatch: a running match takes the picks (its
 *   briefing / strategy draft — the caller, ui/factionPick.js chooseFaction, applies a preset only then); orEmpty: a
 *   faction without a preset is shown too, with no picks (the strategy draft's choice, maintainer decision 2026-10-29 —
 *   a chat pick keeps "nothing changes")
 */
export function applyFactionPreset(id, { inMatch = false, now = Date.now(), orEmpty = false } = {}) {
  const s = diyPresetStore.get();
  const preset = chatFaction(id) ? s.presets[id] || (orEmpty ? {} : null) : null;
  if (!preset) { clearPresetNotice(); return null; }
  if (s.active === id && samePicks(loadoutStore.get().diy, preset)) { clearPresetNotice(); return null; }
  const prev = { picks: loadoutStore.get().diy, active: s.active };
  const notice = { factionId: id, prev, inMatch: !!inMatch, at: now };
  save({ ...withRoster(s, s.active, prev.picks), active: id }, { notice });
  setDiyPicks(preset);
  return notice;
}

/**
 * Show 不使用预设 (a strategy linked to BASE_LINK, screens/bandDraft.js): like applyFactionPreset, with the notice's
 * `base` set (no faction). Null when it is already shown.
 * @param {{ inMatch?: boolean, now?: number }} [o]
 */
export function applyBasePreset({ inMatch = false, now = Date.now() } = {}) {
  const s = diyPresetStore.get();
  if (s.active == null) { clearPresetNotice(); return null; }
  const prev = { picks: loadoutStore.get().diy, active: s.active };
  const notice = { factionId: null, base: true, prev, inMatch: !!inMatch, at: now };
  save({ ...withRoster(s, s.active, prev.picks), active: null }, { notice });
  setDiyPicks(s.base || {});
  return notice;
}

/**
 * Link a strategy to a roster (a chat faction or BASE_LINK), or KEEP_LINK: turn its recommendation off; null clears
 * the link.
 * @param {string} bandId @param {string|null} target
 */
export function linkBand(bandId, target) {
  if (!isBandId(bandId)) return;
  const links = { ...(diyPresetStore.get().links || {}) };
  if (isStoredLink(target)) {
    if (links[bandId] === target) return;
    links[bandId] = target;
  } else {
    if (!(bandId in links)) return;
    delete links[bandId];
  }
  save({ links });
}

/**
 * The roster a strategy draft choice applies, and so the one its preset row shows and edits: BASE_LINK = base (null), a
 * chat faction = that faction's, empty or not (applyFactionPreset orEmpty), KEEP_LINK = the roster in use (`active`).
 * The row, its edits and what the match takes are the same roster (maintainer decision 2026-10-29: a faction linked or
 * chosen there is its own roster even while empty — two player reports 2026-10-28 began with an empty faction that
 * silently kept the picks in use). Undefined for anything else.
 * @param {string} choice @param {{ active?: string|null }} [s] diyPresetStore state
 * @returns {string|null|undefined}
 */
export function choiceRoster(choice, s = diyPresetStore.get()) {
  if (choice === BASE_LINK) return null;
  if (choice === KEEP_LINK) return s.active ?? null;
  return chatFaction(choice) ? choice : undefined;
}

/**
 * Empty one slot of a roster — the strategy draft's preset row (its 清空 on a filled slot): the roster the row's choice
 * shows (choiceRoster: a chat faction, BASE_LINK, or KEEP_LINK = the picks in use). The
 * roster in use takes it through the live picks (synced like an edit); another one is only stored, the live picks stay
 * (an emptied faction's preset goes, as in the tab).
 * @param {string} id @param {string} slotId
 */
export function clearRosterSlot(id, slotId) {
  const s = diyPresetStore.get();
  const target = choiceRoster(id, s);
  if (target === undefined) return;
  if (target === s.active) {
    const live = loadoutStore.get().diy || {};
    if (live[slotId]) setDiyPicks(setPick(live, slotId, null));
    return;
  }
  const roster = rosterOf(s, target);
  if (roster[slotId]) save(withRoster(s, target, setPick(roster, slotId, null)));
}

/**
 * The roster a strategy applies, as the 自选编队 tab's strategy grid shows it (screens/diy.js PresetBandLinks): its
 * link, else its recommendation; null for none or a turned-off recommendation.
 * @param {any} band the bands.json record @param {Record<string, string>} links
 */
export function bandLinkTarget(band, links) {
  const l = links?.[band?.bandId];
  if (l === KEEP_LINK) return null;
  return isLinkTarget(l) ? l : bandRecommendation(band);
}

/**
 * A tap on a strategy in that grid, for roster `target`: a strategy that applies it is unlinked — a recommended one
 * turned off (KEEP_LINK) so it really stops (maintainer request 2026-10-13) —, any other is linked to it (a
 * recommended one by dropping its link: it shows as recommended again).
 * @param {any} band @param {string} target a chat faction or BASE_LINK @param {Record<string, string>} [links]
 */
export function toggleBandLink(band, target, links = diyPresetStore.get().links) {
  const rec = target !== BASE_LINK && bandRecommendation(band) === target;
  if (bandLinkTarget(band, links) === target) linkBand(band?.bandId, rec ? KEEP_LINK : null);
  else linkBand(band?.bandId, rec ? null : target);
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

/** Drop the notice (its time ran out, its × or typing in the chat). */
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
