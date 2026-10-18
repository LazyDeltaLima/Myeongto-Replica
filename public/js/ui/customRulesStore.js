// 커스텀 규칙 프리셋 (maintainer decision 2026-10-18: the browser and a share code, no server or account storage): the custom 규칙 모드 settings this browser keeps — the
// settings the lobby uses for 创建 / 开始独立模拟 (`draft`: the last ones applied), the named presets and the share code.
// Nothing goes to the server but the settings of a room (room.create / room.setRuleset `custom`).
//
//   customRulesStore  { presets: [{ id, name, rules }], active: id | null, draft: rules }
//                     `active` = the preset the dialog's 预设 picker shows (null = none); `draft` = the settings in use
//   setDraft(rules)   the dialog's 应用: the lobby's settings from now on
//   savePreset / addPreset / renamePreset / deletePreset / selectPreset   the dialog's preset row
//   encodeCustomCode / decodeCustomCode   the share code: `SPC<version>.` + base64url of the deflated JSON of the
//                     settings that differ from the official ones (`SPC<version>j.` = not compressed, where the browser
//                     has no CompressionStream); decoding fills the rest with the official values
// Storage: localStorage `sp.pref.customRules` = { v, presets, active, draft } (every rules object through
// shared/ruleset.js sanitizeCustom, so a stored or pasted one never holds a value out of range).

import { createStore, loadPref, savePref } from '../store.js';
import { sanitizeCustom, CUSTOM_OFFICIAL, CUSTOM_VERSION } from '../../../shared/ruleset.js';

export const CUSTOM_RULES_PREF = 'customRules';
/** Presets one browser keeps. */
export const CUSTOM_PRESET_MAX = 30;
/** A preset name's length. */
export const CUSTOM_NAME_MAX = 24;
/** The longest share code read (a full settings object deflates to a few hundred characters). */
export const CUSTOM_CODE_MAX = 8192;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const cleanName = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, CUSTOM_NAME_MAX) : '');

/** The stored envelope as the store holds it (junk dropped, every rules object sanitized). @param {any} raw */
export function parseStoredCustom(raw) {
  const presets = [];
  const ids = new Set();
  for (const p of isObj(raw) && Array.isArray(raw.presets) ? raw.presets : []) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id || ids.has(p.id) || presets.length >= CUSTOM_PRESET_MAX) continue;
    ids.add(p.id);
    presets.push({ id: p.id, name: cleanName(p.name) || p.id, rules: sanitizeCustom(p.rules) });
  }
  const active = isObj(raw) && ids.has(raw.active) ? raw.active : null;
  const draft = sanitizeCustom(isObj(raw) ? raw.draft : null);
  return { presets, active, draft };
}

export const customRulesStore = createStore(parseStoredCustom(loadPref(CUSTOM_RULES_PREF, null)));

const persist = () => {
  const { presets, active, draft } = customRulesStore.get();
  savePref(CUSTOM_RULES_PREF, { v: CUSTOM_VERSION, presets, active, draft });
};
const update = (patch) => { customRulesStore.set(patch); persist(); };

/** The settings in use (the lobby's). */
export const customDraft = () => customRulesStore.get().draft;

/** @param {unknown} rules */
export function setDraft(rules) { update({ draft: sanitizeCustom(rules) }); }

/** @param {string | null} id */
export function presetOf(id) { return customRulesStore.get().presets.find((p) => p.id === id) || null; }

/** Show a preset in the picker (null = none). @param {string | null} id @returns {any} its rules, or null */
export function selectPreset(id) {
  const p = id == null ? null : presetOf(id);
  update({ active: p ? p.id : null });
  return p ? p.rules : null;
}

/** A free preset name: `{base} {n}`. @param {string} base */
export function nextPresetName(base) {
  const names = new Set(customRulesStore.get().presets.map((p) => p.name));
  for (let i = 1; ; i++) if (!names.has(`${base} ${i}`)) return cleanName(`${base} ${i}`);
}

/**
 * A new preset of these rules, shown in the picker. @param {string} name @param {unknown} rules
 * @returns {string | null} its id, or null when the list is full
 */
export function addPreset(name, rules) {
  const { presets } = customRulesStore.get();
  if (presets.length >= CUSTOM_PRESET_MAX) return null;
  let n = presets.length + 1;
  while (presets.some((p) => p.id === `p${n}`)) n++;
  const id = `p${n}`;
  update({ presets: [...presets, { id, name: cleanName(name) || id, rules: sanitizeCustom(rules) }], active: id });
  return id;
}

/** Overwrite a preset's rules. @param {string} id @param {unknown} rules */
export function savePreset(id, rules) {
  const { presets } = customRulesStore.get();
  if (!presets.some((p) => p.id === id)) return false;
  update({ presets: presets.map((p) => (p.id === id ? { ...p, rules: sanitizeCustom(rules) } : p)) });
  return true;
}

/** @param {string} id @param {string} name */
export function renamePreset(id, name) {
  const clean = cleanName(name);
  if (!clean) return false;
  update({ presets: customRulesStore.get().presets.map((p) => (p.id === id ? { ...p, name: clean } : p)) });
  return true;
}

/** @param {string} id */
export function deletePreset(id) {
  const { presets, active } = customRulesStore.get();
  update({ presets: presets.filter((p) => p.id !== id), active: active === id ? null : active });
}

// ---- share code ---------------------------------------------------------------------------------------------------

const CODE_RE = /^SPC(\d+)(j?)\.([A-Za-z0-9_-]+)$/;

const toB64url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

/** The settings that differ from the official ones, by section (what a share code carries). @param {unknown} rules */
export function customDelta(rules) {
  const c = sanitizeCustom(rules);
  /** @type {Record<string, any>} */
  const out = {};
  for (const [sec, vals] of Object.entries(c)) {
    if (!isObj(vals)) continue;
    for (const [k, v] of Object.entries(vals)) {
      if (JSON.stringify(v) !== JSON.stringify(CUSTOM_OFFICIAL[sec]?.[k])) (out[sec] ||= {})[k] = v;
    }
  }
  return out;
}

/** The share code of settings. @param {unknown} rules @returns {Promise<string>} */
export async function encodeCustomCode(rules) {
  const json = new TextEncoder().encode(JSON.stringify(customDelta(rules)));
  if (typeof CompressionStream === 'function') {
    try { return `SPC${CUSTOM_VERSION}.${toB64url(await pipe(json, new CompressionStream('deflate-raw')))}`; } catch { /* plain below */ }
  }
  return `SPC${CUSTOM_VERSION}j.${toB64url(json)}`;
}

/**
 * The settings of a share code (spaces and line breaks ignored). `newer` = made by a later version: what this one
 * does not know is left at its official value.
 * @param {unknown} text
 * @returns {Promise<{ ok: true, rules: any, newer: boolean } | { ok: false }>}
 */
export async function decodeCustomCode(text) {
  const s = typeof text === 'string' ? text.replace(/\s+/g, '') : '';
  const m = s.length <= CUSTOM_CODE_MAX ? CODE_RE.exec(s) : null;
  if (!m) return { ok: false };
  try {
    let bytes = fromB64url(m[3]);
    if (!m[2]) {
      if (typeof DecompressionStream !== 'function') return { ok: false };
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    if (!isObj(raw)) return { ok: false };
    return { ok: true, rules: sanitizeCustom(raw), newer: Number(m[1]) > CUSTOM_VERSION };
  } catch {
    return { ok: false };
  }
}
