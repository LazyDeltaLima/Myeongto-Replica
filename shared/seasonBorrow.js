// shared/seasonBorrow.js — another season's battlefields and 特训敌人 types in a custom 规则 match (maintainer request
// 2026-11-15: a 规程 match may draw 盟约's battlefields and the reverse; a 盟约 match may draw 规程's 特训敌人 types).
// The settings name them (shared/ruleset.js `stages.extra`, `types.pick` 'allow' / 'force'); the match's data gets
// them from the public season that has them, through this one merge on both sides of a battle — the server's match
// (server/match/Match.js) and the browser's data store and battle runner (public/js/data.js, battle/runner.js) — so
// both simulate the same fields.
//
//   customBorrowIds(custom)                      what the settings ask for: { stages, types } or null
//   borrowSeasons(season)                        the public seasons but `season`, the order they are searched in
//   sameField(a, b)                              two stage records that play the same (the lists leave such a one out)
//   borrowPlan(own, foreign, ids)                which season each asked id comes from (only the ids `own` lacks)
//   borrowFile(name, ownFile, foreignFiles, plan)  one file (stages / enemies / factions) with the borrowed records
//   withBorrowed(own, foreign, ids)              a season's whole data with them (the server's match, the sim)
//   fitCustomToSeason(custom, own, foreign, opts)  custom settings with only what the season's data can use (a pasted
//                                                share code, a room's ruleset: lobby room.create / room.setRuleset)
//
// A borrowed record is the other season's own — a battlefield record carries its devices, terrain and runes, a type
// its factions entries — and every enemy record the own season lacks comes along (the borrowed types' enemies, their
// summons); an enemy both seasons have keeps the own season's record [ASSUMED·자료 없음: the official game never mixed two
// seasons]. Borrowed battlefields and types carry `borrowed: <season>`; a borrowed type never joins the own season's
// official draw (server/match/waves.js keeps those to the own types).

import { SEASONS, seasonOf } from './seasons.js';
import { sanitizeCustom, customBanLimits, CUSTOM_FIRST_HALF_STAGES } from './ruleset.js';

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

/**
 * Rows outside the fields: the 整备区 / 临时整备区 (a / A), the separators (X, #) and the teleport entries beside them (I).
 * The seasons lay these out differently on the same field (规程 adds 临时整备区 slots and lets flyers over its
 * separators), but no battle tile is among them (server/sim/grid.js HAND_TILES), so sameField skips a row made only of them.
 */
const OUTER_ROW = /^[aAX#I]*$/;
/**
 * Devices that do not make two fields differ: 盟约寒风 (`trap_1112_acblzd`, the 谢拉格 bond's cold wind — it covers the
 * whole field from wherever it stands), the 沼泽控制 device (`trap_098_mire`: its numbers; the mire is the m tiles) and
 * a hidden “双眼皮” (`trap_1104_aclasert`): only 机械援助 (aceffect_band_43) switches those on, which no strategy,
 * 机变 card, garrison or item of either season grants (test/match/custom-borrow.test.js checks it).
 * @param {any} d
 */
const sameIgnores = (d) => d?.key === 'trap_1112_acblzd' || d?.key === 'trap_098_mire' || (d?.key === 'trap_1104_aclasert' && d.hidden);

/**
 * Are two stage records the same field to play (maintainer request 2026-11-15: 规程 m01–m04 and m06 are 盟约's 战场#01–#04
 * and 战场#06(下半) on their play tiles)? Same size, enemy routes, deploy tiles, terrain numbers, runes, global buffs and
 * options, the same tiles on every row but those outside the fields (OUTER_ROW), the same tile meaning of every glyph
 * there, and the same devices but those of sameIgnores. A borrowed list leaves such a field out (borrowPlan): it would
 * play as the own one (the official scene drawn behind it differs).
 * @param {any} a @param {any} b stages.json records
 */
export function sameField(a, b) {
  if (!isObj(a) || !isObj(b) || !Array.isArray(a.rows) || !Array.isArray(b.rows) || a.rows.length !== b.rows.length) return false;
  const J = JSON.stringify;
  for (const k of ['size', 'groundPaths', 'deployTiles', 'special', 'runes', 'globalBuffs', 'options']) if (J(a[k]) !== J(b[k])) return false;
  const rows = [];
  for (let i = 0; i < a.rows.length; i++) {
    if (OUTER_ROW.test(a.rows[i]) && OUTER_ROW.test(b.rows[i])) continue;
    if (a.rows[i] !== b.rows[i]) return false;
    rows.push(i);
  }
  const glyphs = new Set(rows.flatMap((i) => [...a.rows[i]]));
  for (const g of glyphs) if (J(a.tiles?.[g]) !== J(b.tiles?.[g])) return false;
  const devs = (s) => (Array.isArray(s.devices) ? s.devices : []).filter((d) => !sameIgnores(d))
    .map((d) => J([d.key, d.pos, d.dir, !!d.hidden, d.role ?? null, d.stats ?? null])).sort();
  return J(devs(a)) === J(devs(b));
}

/** A 特训敌人 type another season may lend: one of its draw (involveRandom). @param {any} t a factions.json type */
export const lendableType = (t) => isObj(t) && t.involveRandom === true && !t.borrowed;

/**
 * Which season lends each asked id the own season lacks: { stages: [[id, season]], types: [[type, season]] }, the first
 * season of `foreign` that has it — never a stage that plays as one of the own (sameField); null when nothing is borrowed.
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
  const ownFields = Object.values(ownStages).filter((x) => isObj(x) && !x.kind && !x.borrowed);
  for (const id of ids.stages) {
    if (Object.hasOwn(ownStages, id)) continue;
    const from = foreign.find(([, f]) => isObj(f?.stages) && Object.hasOwn(f.stages, id) && lendableStage(f.stages[id], extraStages)
      && !ownFields.some((o) => sameField(o, f.stages[id])));
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

/**
 * Custom settings with only what `season`'s data can use (maintainer request 2026-11-19): settings made in another
 * season — a share code, a preset kept before the settings were stored per season — name that season's bonds, leaders,
 * stages and 特训敌人 types, its bond ban range and what it borrowed. Kept: the bonds (`bonds.pick`) and leaders
 * (`bosses.ban`) the season has; the ban counts within its range (customBanLimits); `stages.firstHalf` only where its
 * data has those stages; `stages.extra` only what another season lends it (borrowPlan: not its own, not one that plays
 * as its own); `stages.ban` only its own stages and those extra ones; `types.pick` 'ban' / 'force' of its own draw and
 * 'allow' / 'force' of a type another season lends. `from` = the season the settings were made in (a share code says
 * it): a type that season picked was its own type, so another season does not turn it into a borrowed one — the
 * pick is dropped, as the season's own types it borrowed become its own picks ('force' kept, 'allow' = random). A
 * file `own` lacks leaves its part as it is. The match ignores whatever this drops (GameData keeps the ids its data
 * knows and caps the ban counts), so a fitted ruleset plays the same; the room's summary and the dialog then show
 * what the match plays.
 * @param {unknown} raw custom settings
 * @param {{ bonds?: any, bosses?: any, stages?: any, factions?: any, config?: any }} own the season's own files (a
 *   borrowed record in them is skipped)
 * @param {[string, { stages?: any, factions?: any }][]} foreign [season, files] in borrowSeasons(season) order
 * @param {{ season?: string, from?: string | null }} [opts]
 * @returns {{ rules: ReturnType<typeof sanitizeCustom>, dropped: number }} `dropped` = the settings removed or changed
 */
export function fitCustomToSeason(raw, own, foreign, { season, from = null } = {}) {
  const c = sanitizeCustom(raw);
  let dropped = 0;
  const keep = (list, ok) => { const out = list.filter(ok); dropped += list.length - out.length; return out; };
  const ownOf = (file) => (isObj(file) ? Object.fromEntries(Object.entries(file).filter(([, r]) => isObj(r) && !r.borrowed)) : null);
  const stages = ownOf(own?.stages);
  const types = isObj(own?.factions) ? ownOf(own.factions.types) || {} : null;
  const bonds = c.bonds;
  let { banCore, banAddon } = bonds;
  if (own?.config) {
    const lim = customBanLimits(own.config);
    const clamp = (v, [lo, hi]) => { if (v == null) return v; const x = Math.min(hi, Math.max(lo, v)); if (x !== v) dropped++; return x; };
    banCore = clamp(banCore, lim.core);
    banAddon = clamp(banAddon, lim.addon);
  }
  const bondPick = isObj(own?.bonds) ? Object.fromEntries(keep(Object.entries(bonds.pick), ([k]) => Object.hasOwn(own.bonds, k))) : bonds.pick;
  const bossBan = isObj(own?.bosses) ? keep(c.bosses.ban, (id) => Object.hasOwn(own.bosses, id)) : c.bosses.ban;
  // what another season lends: borrowPlan on the own records only (a room's borrowed ones are in a browser's view)
  const lent = borrowPlan({ stages: stages || {}, factions: { types: types || {} } }, foreign,
    { stages: c.stages.extra, types: Object.keys(c.types.pick).sort() }, CUSTOM_FIRST_HALF_STAGES);
  const lentStages = new Set((lent?.stages || []).map(([id]) => id));
  const lentTypes = new Set((lent?.types || []).map(([id]) => id));
  const sameSeason = !from || !season || seasonOf(from) === seasonOf(season);
  let { firstHalf, extra, ban } = c.stages;
  if (stages) {
    if (firstHalf && !CUSTOM_FIRST_HALF_STAGES.some((id) => Object.hasOwn(stages, id))) { firstHalf = false; dropped++; }
    extra = keep(extra, (id) => lentStages.has(id));
    ban = keep(ban, (id) => (Object.hasOwn(stages, id) && !stages[id].kind) || extra.includes(id));
  }
  const typePick = types
    ? Object.fromEntries(keep(Object.entries(c.types.pick), ([k, v]) => {
      const t = types[k];
      if (t && t.involveRandom) return v === 'ban' || v === 'force';
      return sameSeason && lentTypes.has(k) && (v === 'allow' || v === 'force');
    }))
    : c.types.pick;
  return {
    rules: sanitizeCustom({
      ...c,
      bonds: { ...bonds, banCore, banAddon, pick: bondPick },
      types: { ...c.types, pick: typePick },
      bosses: { ...c.bosses, ban: bossBan },
      stages: { ...c.stages, firstHalf, extra, ban },
    }),
    dropped,
  };
}
