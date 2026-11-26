// shared/seasonBorrow.js — another season's battlefields, 特训敌人 types and leaders in a custom 规则 match (maintainer
// request 2026-11-15: a 规程 match may draw 盟约's battlefields and the reverse; a 盟约 match may draw 规程's 特训敌人 types;
// maintainer request 2026-11-25: the 最终攻势 / 隐秘核心 leaders one season lacks join the other's draw).
// The settings name them (shared/ruleset.js `stages.extra`, `types.pick` 'allow' / 'force', `bosses.extra`); the match's data gets
// them from the public season that has them, through this one merge on both sides of a battle — the server's match
// (server/match/Match.js) and the browser's data store and battle runner (public/js/data.js, battle/runner.js) — so
// both simulate the same fields.
//
//   customBorrowIds(custom)                      what the settings ask for: { stages, types, bosses } or null
//   borrowSeasons(season)                        the public seasons but `season`, the order they are searched in
//   sameField(a, b)                              two stage records that play the same (the lists leave such a one out)
//   borrowPlan(own, foreign, ids)                which season each asked id comes from (only the ids `own` lacks)
//   borrowFile(name, ownFile, foreignFiles, plan)  one file (BORROW_FILES) with the borrowed records
//   withBorrowed(own, foreign, ids)              a season's whole data with them (the server's match, the sim)
//   fitCustomToSeason(custom, own, foreign, opts)  custom settings with only what the season's data can use (a pasted
//                                                share code, a room's ruleset: lobby room.create / room.setRuleset)
//
// A borrowed record is the other season's own — a battlefield record carries its devices, terrain and runes, a type
// its factions entries — and every enemy record the own season lacks comes along (the borrowed types' enemies, their
// summons); an enemy both seasons have keeps the own season's record [ASSUMED·자료 없음: the official game never mixed two
// seasons]. A borrowed leader is its season's bosses.json record with that season's wave templates of it (waves.json
// `bossId`: its field's routes, devices and escorts) and the enemies above; the match draws it beside the own leaders of
// its group (server/match/gamedata.js bossWeights, roundCfg; its pool HP: bossBloodPoint). Borrowed battlefields, types
// and leaders carry `borrowed: <season>`; a borrowed type never joins the own season's official draw
// (server/match/waves.js keeps those to the own types).

import { SEASONS, seasonOf } from './seasons.js';
import { sanitizeCustom, customBanLimits, CUSTOM_FIRST_HALF_STAGES } from './ruleset.js';

/** The files a borrow changes. */
export const BORROW_FILES = Object.freeze(['stages', 'enemies', 'factions', 'bosses', 'waves']);

/** A data file or record read field by field. @typedef {Record<string, unknown>} Rec */
/**
 * What custom settings borrow (customBorrowIds): stage ids, 特训敌人 type ids, leader ids (`bosses`: absent = none).
 * @typedef {{ stages: string[], types: string[], bosses?: string[] }} BorrowIds
 */
/** A season's files a borrow plan reads (a file absent: nothing of its kind is borrowed from or for it). @typedef {{ stages?: unknown, factions?: unknown, bosses?: unknown }} PlanFiles */

/** @param {unknown} v @returns {v is Rec} */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** `o[k]` when it is a plain object, else an empty one. @param {unknown} o @param {string} k @returns {Rec} */
const sub = (o, k) => { const v = isObj(o) ? o[k] : null; return isObj(v) ? v : {}; };
/** The strings of a list (anything else: none). @param {unknown} v @returns {string[]} */
const strs = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/** The public seasons other than `season` a custom match may borrow from, in registry order. @param {unknown} season */
export function borrowSeasons(season) {
  const own = seasonOf(season);
  return Object.values(SEASONS).filter((s) => s.public && s.id !== own).map((s) => s.id);
}

/**
 * What custom settings ask of other seasons: the battlefields of `stages.extra`, the types picked 'allow' / 'force' and
 * the leaders of `bosses.extra` (one of the own season among them is left out by borrowPlan). Null when they ask for none.
 * @param {unknown} custom sanitized custom settings (shared/ruleset.js sanitizeCustom)
 * @returns {{ stages: string[], types: string[], bosses: string[] } | null}
 */
export function customBorrowIds(custom) {
  const stages = strs(sub(custom, 'stages').extra).sort();
  const pick = sub(sub(custom, 'types'), 'pick');
  const types = Object.keys(pick).filter((k) => pick[k] === 'allow' || pick[k] === 'force').sort();
  const bosses = strs(sub(custom, 'bosses').extra).sort();
  return stages.length || types.length || bosses.length ? { stages, types, bosses } : null;
}

/**
 * A string naming what `ids` asks for ('' = nothing): caches key on it (no leaders: the key of the settings before they
 * could borrow leaders). @param {BorrowIds | null} ids
 */
export const borrowKey = (ids) => (ids ? `${ids.stages.join(',')}|${ids.types.join(',')}${ids.bosses?.length ? `|${ids.bosses.join(',')}` : ''}` : '');

/**
 * A battlefield another season may lend: a field of a normal match (no 联防 `kind`) its own season draws (weight > 0),
 * or one of `extraIds` (the 上半 battlefields a 盟约 custom match may add: shared/ruleset.js CUSTOM_FIRST_HALF_STAGES).
 * @param {unknown} s a stages.json record @param {readonly string[]} [extraIds]
 */
export function lendableStage(s, extraIds = []) {
  return isObj(s) && !s.kind && (Number(s.weight) > 0 || (typeof s.id === 'string' && extraIds.includes(s.id)));
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
 * @param {unknown} d
 */
const sameIgnores = (d) => isObj(d) && (d.key === 'trap_1112_acblzd' || d.key === 'trap_098_mire' || (d.key === 'trap_1104_aclasert' && !!d.hidden));

/**
 * Are two stage records the same field to play (maintainer request 2026-11-15: 规程 m01–m04 and m06 are 盟约's 战场#01–#04
 * and 战场#06(下半) on their play tiles)? Same size, enemy routes, deploy tiles, terrain numbers, runes, global buffs and
 * options, the same tiles on every row but those outside the fields (OUTER_ROW), the same tile meaning of every glyph
 * there, and the same devices but those of sameIgnores. A borrowed list leaves such a field out (borrowPlan): it would
 * play as the own one (the official scene drawn behind it differs).
 * @param {unknown} a @param {unknown} b stages.json records
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
  const aRows = strs(a.rows);
  const glyphs = new Set(rows.flatMap((i) => [...(aRows[i] ?? '')]));
  const aTiles = sub(a, 'tiles'), bTiles = sub(b, 'tiles');
  for (const g of glyphs) if (J(aTiles[g]) !== J(bTiles[g])) return false;
  const devs = (/** @type {Rec} */ s) => (Array.isArray(s.devices) ? s.devices : []).filter((d) => isObj(d) && !sameIgnores(d))
    .map((/** @type {Rec} */ d) => J([d.key, d.pos, d.dir, !!d.hidden, d.role ?? null, d.stats ?? null])).sort();
  return J(devs(a)) === J(devs(b));
}

/** A 特训敌人 type another season may lend: one of its draw (involveRandom). @param {unknown} t a factions.json type */
export const lendableType = (t) => isObj(t) && t.involveRandom === true && !t.borrowed;

/**
 * A leader another season may lend: one its season draws (bosses.json `weight` > 0 — the 最终攻势 and 隐秘核心 leaders of
 * every season's table), never one it borrowed itself. @param {unknown} b a bosses.json record
 */
export const lendableBoss = (b) => isObj(b) && typeof b.bossId === 'string' && Number(b.weight) > 0 && !b.borrowed;

/**
 * @typedef {{ stages: [string, string][], types: [string, string][], bosses: [string, string][], key: string }} BorrowPlan
 *   [id, the lending season] of each borrowed stage, type and leader; `key` names them all
 */

/**
 * Which season lends each asked id the own season lacks: { stages: [[id, season]], types: [[type, season]], bosses:
 * [[leader, season]] }, the first season of `foreign` that has it — never a stage that plays as one of the own
 * (sameField); null when nothing is borrowed. Without an own bosses.json (`own.bosses`) no leader is borrowed: which
 * ones the own season has is unknown.
 * @param {PlanFiles} own the own season's stages.json / factions.json / bosses.json
 * @param {[string, PlanFiles][]} foreign [season, files] in borrowSeasons order
 * @param {BorrowIds | null} ids customBorrowIds
 * @param {readonly string[]} [extraStages] lendableStage's extra ids
 * @returns {BorrowPlan | null}
 */
export function borrowPlan(own, foreign, ids, extraStages = []) {
  if (!ids) return null;
  const ownStages = sub(own, 'stages');
  const ownTypes = sub(sub(own, 'factions'), 'types');
  /** @type {[string, string][]} */
  const stages = [];
  /** @type {[string, string][]} */
  const types = [];
  /** @type {[string, string][]} */
  const bosses = [];
  const ownFields = Object.values(ownStages).filter((x) => isObj(x) && !x.kind && !x.borrowed);
  for (const id of ids.stages) {
    if (Object.hasOwn(ownStages, id)) continue;
    const from = foreign.find(([, f]) => { const fs = sub(f, 'stages'); return Object.hasOwn(fs, id) && lendableStage(fs[id], extraStages) && !ownFields.some((o) => sameField(o, fs[id])); });
    if (from) stages.push([id, from[0]]);
  }
  for (const id of ids.types) {
    if (Object.hasOwn(ownTypes, id)) continue;
    const from = foreign.find(([, f]) => { const ft = sub(sub(f, 'factions'), 'types'); return Object.hasOwn(ft, id) && lendableType(ft[id]); });
    if (from) types.push([id, from[0]]);
  }
  if (isObj(own?.bosses)) {
    const ownBosses = own.bosses;
    for (const id of ids.bosses ?? []) {
      if (Object.hasOwn(ownBosses, id)) continue;
      const from = foreign.find(([, f]) => { const fb = sub(f, 'bosses'); return Object.hasOwn(fb, id) && lendableBoss(fb[id]); });
      if (from) bosses.push([id, from[0]]);
    }
  }
  if (!stages.length && !types.length && !bosses.length) return null;
  const list = (/** @type {[string, string][]} */ xs) => xs.map((x) => x.join('@')).join(',');
  return { stages, types, bosses, key: `${list(stages)}|${list(types)}${bosses.length ? `|${list(bosses)}` : ''}` };
}

/**
 * One file of the own season with what `plan` borrows: `stages` gains the borrowed battlefields, `factions` the
 * borrowed types (and their entries), `bosses` the borrowed leaders, `waves` the lending seasons' wave templates of
 * those leaders (their `bossId`), `enemies` every record the own file lacks from the lending seasons (in `foreign`
 * order). Other files, and any file while `plan` is null, come back as they are; a changed file is a new object
 * (records shared, never written).
 * @param {string} name @param {unknown} ownFile @param {[string, unknown][]} foreignFiles [season, that season's same file]
 * @param {BorrowPlan | null} plan
 */
export function borrowFile(name, ownFile, foreignFiles, plan) {
  if (!plan || !isObj(ownFile)) return ownFile;
  const fileOf = (/** @type {string} */ season) => { const f = foreignFiles.find(([s]) => s === season)?.[1]; return isObj(f) ? f : null; };
  /** the records of `list` [id, season] as their seasons have them, marked `borrowed` @param {[string, string][]} list */
  const lent = (list) => {
    if (!list.length) return ownFile;
    /** @type {Rec} */
    const out = { ...ownFile };
    for (const [id, season] of list) {
      const rec = fileOf(season)?.[id];
      if (isObj(rec)) out[id] = { ...rec, borrowed: season };
    }
    return out;
  };
  if (name === 'stages') return lent(plan.stages);
  if (name === 'bosses') return lent(plan.bosses);
  if (name === 'waves') {
    /** @type {Rec | null} */
    let out = null;
    for (const [id, season] of plan.bosses) {
      for (const [k, tpl] of Object.entries(fileOf(season) ?? {})) {
        if (!isObj(tpl) || tpl.bossId !== id || Object.hasOwn(ownFile, k)) continue;
        out ??= { ...ownFile };
        out[k] = tpl;
      }
    }
    return out ?? ownFile;
  }
  if (name === 'factions') {
    if (!plan.types.length) return ownFile;
    const types = { ...sub(ownFile, 'types') };
    const entries = { ...sub(ownFile, 'entries') };
    for (const [id, season] of plan.types) {
      const f = fileOf(season);
      const t = sub(sub(f, 'types'), id);
      if (!Object.keys(t).length) continue;
      types[id] = { ...t, borrowed: season };
      const fe = sub(f, 'entries');
      for (const k of strs(t.entries)) if (!Object.hasOwn(entries, k) && isObj(fe[k])) entries[k] = fe[k];
    }
    return { ...ownFile, types, entries };
  }
  if (name === 'enemies') {
    const seasons = [...new Set([...plan.stages, ...plan.types, ...plan.bosses].map(([, s]) => s))];
    /** @type {Rec | null} */
    let out = null;
    for (const season of seasons) {
      const f = fileOf(season);
      if (!f) continue;
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
 * is, else a frozen shallow copy with the merged files (borrowFile).
 * @param {Readonly<Rec>} own @param {[string, Readonly<Rec>][]} foreign [season, data]
 * @param {BorrowIds | null} ids @param {readonly string[]} [extraStages]
 */
export function withBorrowed(own, foreign, ids, extraStages = []) {
  const plan = borrowPlan(own, foreign, ids, extraStages);
  if (!plan) return own;
  /** @type {Rec} */
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
 * (`bosses.ban`) the season has; `bosses.extra` only the leaders another season lends it (borrowPlan); the ban counts
 * within its range (customBanLimits); `stages.firstHalf` only where its data has those stages; `stages.extra` only
 * what another season lends it (borrowPlan: not its own, not one that plays as its own); `stages.ban` only its own
 * stages and those extra ones; `types.pick` 'ban' / 'force' of its own draw and 'allow' / 'force' of a type another
 * season lends. `from` = the season the settings were made in (a share code says it): a type that season picked was its
 * own type, so another season does not turn it into a borrowed one — the pick is dropped, as the season's own types it
 * borrowed become its own picks ('force' kept, 'allow' = random). A file `own` lacks leaves its part as it is. The
 * match ignores whatever this drops (GameData keeps the ids its data knows and caps the ban counts), so a fitted ruleset
 * plays the same; the room's summary and the dialog then show what the match plays.
 * @param {unknown} raw custom settings
 * @param {{ bonds?: unknown, bosses?: unknown, stages?: unknown, factions?: unknown, config?: unknown }} own the season's
 *   own files (a borrowed record in them is skipped)
 * @param {[string, PlanFiles][]} foreign [season, files] in borrowSeasons(season) order
 * @param {{ season?: string, from?: string | null }} [opts]
 * @returns {{ rules: ReturnType<typeof sanitizeCustom>, dropped: number }} `dropped` = the settings removed or changed
 */
export function fitCustomToSeason(raw, own, foreign, { season, from = null } = {}) {
  const c = sanitizeCustom(raw);
  let dropped = 0;
  /** @template T @param {T[]} list @param {(x: T) => boolean} ok @returns {T[]} */
  const keep = (list, ok) => { const out = list.filter(ok); dropped += list.length - out.length; return out; };
  /** @param {unknown} file @returns {Rec | null} */
  const ownOf = (file) => (isObj(file) ? Object.fromEntries(Object.entries(file).filter(([, r]) => isObj(r) && !r.borrowed)) : null);
  const stages = ownOf(own?.stages);
  const types = isObj(own?.factions) ? ownOf(own.factions.types) || {} : null;
  const ownBosses = ownOf(own?.bosses);
  const bonds = c.bonds;
  let { banCore, banAddon } = bonds;
  if (own?.config) {
    const lim = customBanLimits(/** @type {{ bans?: unknown }} */ (own.config));
    const clamp = (/** @type {number|null} */ v, /** @type {number[]} */ [lo, hi]) => { if (v == null) return v; const x = Math.min(hi, Math.max(lo, v)); if (x !== v) dropped++; return x; };
    banCore = clamp(banCore, lim.core);
    banAddon = clamp(banAddon, lim.addon);
  }
  const ownBonds = own?.bonds;
  const bondPick = isObj(ownBonds) ? Object.fromEntries(keep(Object.entries(bonds.pick), ([k]) => Object.hasOwn(ownBonds, k))) : bonds.pick;
  const bossBan = ownBosses ? keep(c.bosses.ban, (id) => Object.hasOwn(ownBosses, id)) : c.bosses.ban;
  // what another season lends: borrowPlan on the own records only (a room's borrowed ones are in a browser's view)
  const lent = borrowPlan({ stages: stages || {}, factions: { types: types || {} }, ...(ownBosses ? { bosses: ownBosses } : {}) }, foreign,
    { stages: c.stages.extra, types: Object.keys(c.types.pick).sort(), bosses: c.bosses.extra }, CUSTOM_FIRST_HALF_STAGES);
  const lentStages = new Set((lent?.stages || []).map(([id]) => id));
  const lentTypes = new Set((lent?.types || []).map(([id]) => id));
  const lentBosses = new Set((lent?.bosses || []).map(([id]) => id));
  const bossExtra = ownBosses ? keep(c.bosses.extra, (id) => lentBosses.has(id)) : c.bosses.extra;
  const sameSeason = !from || !season || seasonOf(from) === seasonOf(season);
  let { firstHalf, extra, ban } = c.stages;
  if (stages) {
    if (firstHalf && !CUSTOM_FIRST_HALF_STAGES.some((id) => Object.hasOwn(stages, id))) { firstHalf = false; dropped++; }
    extra = keep(extra, (id) => lentStages.has(id));
    ban = keep(ban, (id) => (Object.hasOwn(stages, id) && !sub(stages, id).kind) || extra.includes(id));
  }
  const typePick = types
    ? Object.fromEntries(keep(Object.entries(c.types.pick), ([k, v]) => {
      const t = types[k];
      if (isObj(t) && t.involveRandom) return v === 'ban' || v === 'force';
      return sameSeason && lentTypes.has(k) && (v === 'allow' || v === 'force');
    }))
    : c.types.pick;
  return {
    rules: sanitizeCustom({
      ...c,
      bonds: { ...bonds, banCore, banAddon, pick: bondPick },
      types: { ...c.types, pick: typePick },
      bosses: { ...c.bosses, ban: bossBan, extra: bossExtra },
      stages: { ...c.stages, firstHalf, extra, ban },
    }),
    dropped,
  };
}
