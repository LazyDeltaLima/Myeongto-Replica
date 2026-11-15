// shared/seasonBorrow.js — another season's battlefields and 特训敌人 types in a custom 规则 match (maintainer request
// 2026-11-15: a 规程 match may draw 盟约's battlefields and the reverse; a 盟约 match may draw 规程's 特训敌人 types).
// The settings name them (shared/ruleset.js `stages.extra`, `types.pick` 'allow' / 'force'); the match's data gets
// them from the public season that has them, through this one merge on both sides of a battle — the server's match
// (server/match/Match.js) and the browser's data store and battle runner (public/js/data.js, battle/runner.js) — so
// both simulate the same fields.
//
//   customBorrowIds(custom)                      what the settings ask for: { stages, types } or null
//   borrowSeasons(season)                        the public seasons but `season`, the order they are searched in
//   borrowPlan(own, foreign, ids)                which season each asked id comes from (only the ids `own` lacks)
//   borrowFile(name, ownFile, foreignFiles, plan)  one file (stages / enemies / factions) with the borrowed records
//   withBorrowed(own, foreign, ids)              a season's whole data with them (the server's match, the sim)
//
// A borrowed record is the other season's own — a battlefield record carries its devices, terrain and runes, a type
// its factions entries — and every enemy record the own season lacks comes along (the borrowed types' enemies, their
// summons); an enemy both seasons have keeps the own season's record [ASSUMED·자료 없음: the official game never mixed two
// seasons]. Borrowed battlefields and types carry `borrowed: <season>`; a borrowed type never joins the own season's
// official draw (server/match/waves.js keeps those to the own types).

import { SEASONS, seasonOf } from './seasons.js';

/** The files a borrow changes. */
export const BORROW_FILES = Object.freeze(['stages', 'enemies', 'factions']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The public seasons other than `season` a custom match may borrow from, in registry order. @param {unknown} season */
export function borrowSeasons(season) {
  const own = seasonOf(season);
  return Object.values(SEASONS).filter((s) => s.public && s.id !== own).map((s) => s.id);
}

/**
 * What custom settings ask of other seasons: the battlefields of `stages.extra` and the types picked 'allow' / 'force'
 * (a type of the own season among them is left out by borrowPlan). Null when they ask for none.
 * @param {any} custom sanitized custom settings (shared/ruleset.js sanitizeCustom)
 * @returns {{ stages: string[], types: string[] } | null}
 */
export function customBorrowIds(custom) {
  const stages = Array.isArray(custom?.stages?.extra) ? custom.stages.extra.filter((x) => typeof x === 'string') : [];
  const pick = isObj(custom?.types?.pick) ? custom.types.pick : {};
  const types = Object.keys(pick).filter((k) => pick[k] === 'allow' || pick[k] === 'force').sort();
  return stages.length || types.length ? { stages: [...stages].sort(), types } : null;
}

/** A string naming what `ids` asks for ('' = nothing): caches key on it. @param {{ stages: string[], types: string[] } | null} ids */
export const borrowKey = (ids) => (ids ? `${ids.stages.join(',')}|${ids.types.join(',')}` : '');

/**
 * A battlefield another season may lend: a field of a normal match (no 联防 `kind`) its own season draws (weight > 0),
 * or one of `extraIds` (the 上半 battlefields a 盟约 custom match may add: shared/ruleset.js CUSTOM_FIRST_HALF_STAGES).
 * @param {any} s a stages.json record @param {readonly string[]} [extraIds]
 */
export function lendableStage(s, extraIds = []) {
  return isObj(s) && !s.kind && (Number(s.weight) > 0 || extraIds.includes(s.id));
}

/** A 特训敌人 type another season may lend: one of its draw (involveRandom). @param {any} t a factions.json type */
export const lendableType = (t) => isObj(t) && t.involveRandom === true && !t.borrowed;

/**
 * Which season lends each asked id the own season lacks: { stages: [[id, season]], types: [[type, season]] }, the first
 * season of `foreign` that has it; null when nothing is borrowed.
 * @param {{ stages?: any, factions?: any }} own the own season's stages.json / factions.json
 * @param {[string, { stages?: any, factions?: any }][]} foreign [season, files] in borrowSeasons order
 * @param {{ stages: string[], types: string[] } | null} ids customBorrowIds
 * @param {readonly string[]} [extraStages] lendableStage's extra ids
 * @returns {{ stages: [string, string][], types: [string, string][], key: string } | null}
 */
export function borrowPlan(own, foreign, ids, extraStages = []) {
  if (!ids) return null;
  const ownStages = isObj(own?.stages) ? own.stages : {};
  const ownTypes = isObj(own?.factions?.types) ? own.factions.types : {};
  /** @type {[string, string][]} */
  const stages = [];
  /** @type {[string, string][]} */
  const types = [];
  for (const id of ids.stages) {
    if (Object.hasOwn(ownStages, id)) continue;
    const from = foreign.find(([, f]) => isObj(f?.stages) && Object.hasOwn(f.stages, id) && lendableStage(f.stages[id], extraStages));
    if (from) stages.push([id, from[0]]);
  }
  for (const id of ids.types) {
    if (Object.hasOwn(ownTypes, id)) continue;
    const from = foreign.find(([, f]) => isObj(f?.factions?.types) && Object.hasOwn(f.factions.types, id) && lendableType(f.factions.types[id]));
    if (from) types.push([id, from[0]]);
  }
  if (!stages.length && !types.length) return null;
  return { stages, types, key: `${stages.map((x) => x.join('@')).join(',')}|${types.map((x) => x.join('@')).join(',')}` };
}

/**
 * One file of the own season with what `plan` borrows: `stages` gains the borrowed battlefields, `factions` the
 * borrowed types (and their entries), `enemies` every record the own file lacks from the lending seasons (in
 * `foreign` order). Other files, and any file while `plan` is null, come back as they are; a changed file is a new
 * object (records shared, never written).
 * @param {string} name @param {any} ownFile @param {[string, any][]} foreignFiles [season, that season's same file]
 * @param {ReturnType<typeof borrowPlan>} plan
 */
export function borrowFile(name, ownFile, foreignFiles, plan) {
  if (!plan || !isObj(ownFile)) return ownFile;
  const fileOf = (season) => foreignFiles.find(([s]) => s === season)?.[1];
  if (name === 'stages') {
    if (!plan.stages.length) return ownFile;
    const out = { ...ownFile };
    for (const [id, season] of plan.stages) {
      const rec = fileOf(season)?.[id];
      if (isObj(rec)) out[id] = { ...rec, borrowed: season };
    }
    return out;
  }
  if (name === 'factions') {
    if (!plan.types.length) return ownFile;
    const types = { ...(isObj(ownFile.types) ? ownFile.types : {}) };
    const entries = { ...(isObj(ownFile.entries) ? ownFile.entries : {}) };
    for (const [id, season] of plan.types) {
      const f = fileOf(season);
      const t = f?.types?.[id];
      if (!isObj(t)) continue;
      types[id] = { ...t, borrowed: season };
      for (const k of Array.isArray(t.entries) ? t.entries : []) if (!Object.hasOwn(entries, k) && isObj(f.entries?.[k])) entries[k] = f.entries[k];
    }
    return { ...ownFile, types, entries };
  }
  if (name === 'enemies') {
    const seasons = [...new Set([...plan.stages, ...plan.types].map(([, s]) => s))];
    let out = null;
    for (const season of seasons) {
      const f = fileOf(season);
      if (!isObj(f)) continue;
      for (const [k, rec] of Object.entries(f)) {
        if (Object.hasOwn(ownFile, k) || (out && Object.hasOwn(out, k))) continue;
        out ??= { ...ownFile };
        out[k] = rec;
      }
    }
    return out ?? ownFile;
  }
  return ownFile;
}

/**
 * A season's whole data with what `ids` borrows (the server's match, the browser's sim): `own` itself when nothing
 * is, else a frozen shallow copy with the three files merged (borrowFile).
 * @param {Readonly<Record<string, any>>} own @param {[string, Readonly<Record<string, any>>][]} foreign [season, data]
 * @param {{ stages: string[], types: string[] } | null} ids @param {readonly string[]} [extraStages]
 */
export function withBorrowed(own, foreign, ids, extraStages = []) {
  const plan = borrowPlan(own, foreign, ids, extraStages);
  if (!plan) return own;
  const out = { ...own };
  for (const name of BORROW_FILES) {
    const merged = borrowFile(name, own[name], foreign.map(([s, d]) => [s, d?.[name]]), plan);
    out[name] = merged === own[name] ? merged : Object.freeze(merged);
  }
  return Object.freeze(out);
}
