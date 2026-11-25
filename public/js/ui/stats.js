// Local match statistics: every match the local player took part in is appended as one record to localStorage
// (`sp.pref.stats`). Per-browser only — the server keeps matches in memory and has no identity, so there is nowhere
// else for cross-match numbers to live; nothing here is ever sent anywhere. The stats page labels itself 本机数据 and
// offers JSON export / import for moving between devices. (Ported from PR #323 by @2321Robin, reworked for 0.2.2.)
//
// Two kinds of record (`end`):
//   'settled'  the match reached its settlement: m.result arrived (server/match/results.js buildResult). The record
//              keeps what the settlement offers — the match frame (difficulty, mode, boss, seed, duration, hidden-core
//              outcome, reason, the leader pools) and one row per player (band, title, lineup, bonds, the stat block, the
//              top per-operator rows of the 伤害 / 联防 tabs) — so the page can re-view the settlement screen
//              (recordToResult).
//   'quit'     the player gave up (放弃模拟) before the settlement; the server sends a leaver nothing, so the record is
//              built from what the client knew at that moment (buildQuitRecord): the frame, the player's own row, the
//              rounds cleared. It is listed in the history, marked 中途退出, and cannot be re-viewed.
//
// What counts (countsTowardStats, the owner's decision of 2026-10-08: a match entered and left right away must not
// count): every aggregate — games, wins, win rate, hidden core, best round, time played, the strategy table, titles
// and the combat totals — is taken over the records that count. A settled record always counts. A quit record counts
// once at least one of the player's own battles had finished — a round cleared (the server's rule: leaving while
// round k runs has passed k − 1 rounds, leaving in its settlement k) or already eliminated. A match left earlier is
// history only.
//
// Bounded storage: at most MAX_RECORDS matches and MAX_CHARS characters of JSON. Only the newest FULL_KEEP records
// and the record of the highest bond layers (成就统计's 卫戍成就, highestBondRecord)
// keep their full rows (lineups, bonds, teammates' names — what the settlement replay needs); older ones are compacted
// to the player's own summary row, which is all the aggregates read. The oldest records go first when a budget is hit,
// and a write the browser refuses shrinks the list further instead of failing. Teammates' display names are part of
// the newest records and of an export file: they stay on this device unless the player exports them.
//
// 규칙 모드 (shared/ruleset.js; maintainer decision 2026-10-15): every record keeps its match's ruleset preset (`ruleset`,
// from m.public.ruleset) and the stats page counts each ruleset apart. A record from before rulesets (envelope v1, or a
// row without the field) counts as 休闲 — those matches had the reroll and the battlefield preview.
//
// Format evolution: the envelope carries a version (`STATS_VERSION`); `migrateStats` walks records through a chain of
// per-version steps and every loaded / imported record passes `normalizeRecord`, a strict schema: missing fields get
// defaults, unknown fields and oversized values are dropped, a row it cannot salvage is dropped. An envelope from a
// NEWER version than this build is refused (never downgraded and written back); an unreadable one is set aside
// (`sp.pref.stats.damaged`) and the history starts again.
//
// Pure logic, no Preact / DOM: Node-testable (test/ui/stats.test.js); localStorage is touched only by loadStats /
// saveStats / their helpers.

import { LARGE_SEATS, PHASE } from '../../../shared/constants.js';
import { isRulePreset, rulesetKey } from '../../../shared/ruleset.js';
import { DEFAULT_SEASON } from '../../../shared/seasons.js';

/** Current record-envelope version (bump + add a MIGRATIONS step when the record shape changes). */
export const STATS_VERSION = 2;
/** The ruleset of a record without one (before rulesets: maintainer decision 2026-10-15). */
export const LEGACY_RULESET = 'casual';
/** localStorage key under the app's `sp.pref.` prefix (store.js loadPref). */
export const STATS_PREF_KEY = 'stats';
/** Oldest records are dropped beyond this many matches. */
export const MAX_RECORDS = 1000;
/** The newest records that keep their full rows (lineups, bonds, teammates) — what the settlement replay reads. */
export const FULL_KEEP = 30;
/**
 * Budget of the stored JSON in characters (a character costs up to 2 bytes of the browser's ~5 MB quota): the oldest records
 * go first. 850 000 since the records carry their ruleset (v2): a full store of real-size co-op matches still keeps 900+.
 */
export const MAX_CHARS = 850_000;
/** Largest export file the page reads. */
export const IMPORT_MAX_CHARS = 8_000_000;

const FULL_KEY = `sp.pref.${STATS_PREF_KEY}`;
const DAMAGED_KEY = `${FULL_KEY}.damaged`;

/**
 * The normalized record (normalizeRecord) and its rows; a compacted record (compactRecord) keeps only the frame of
 * COMPACT_FRAME and the player's own summary row, so the other fields are optional.
 * @typedef {{ charId: string | null, skillIndex: number, uniEquipId: string | null }} RecDiy  a 自选 pick of a row
 * @typedef {{ id: string, golden: boolean, tier: number, items: string[], kind?: 'token', diy?: RecDiy,
 *   standInFor?: string | null }} LineupEntry
 * @typedef {{ id: string, golden: boolean, tier: number, dmg: number, final: number, hidden: number, diy?: RecDiy,
 *   standInFor?: string | null, sold?: boolean, summon?: boolean, assist?: Record<string, number> }} UnitRow
 * @typedef {{ bondId: string, layers: number, active: boolean }} BondRow
 * @typedef {{ maxHp: number, dealt: number }} BossPool
 * @typedef {{ final: BossPool | null, hidden: BossPool | null }} BossPools
 * @typedef {{ playerId: string, seat: number, name?: string, isBot?: boolean, left: boolean, alive: boolean,
 *   victory: boolean, roundsPassed: number | null, eliminatedRound: number | null, lp?: number | null,
 *   bandId: string | null, title: { id: string | null } | null, trophies: number, reward: number,
 *   lineup?: LineupEntry[], bonds?: BondRow[], usedBondIds?: string[], stats: Record<string, number>, units?: UnitRow[],
 *   unite?: { sent: number, through: number } | null, faction?: string | null }} PlayerRow
 * @typedef {{ id: string, v: number, t: number, end: 'quit' | 'settled', victory: boolean, roundsPassed: number | null,
 *   lastRound?: number | null, hiddenReached: boolean, hiddenCleared: boolean, reason: string | null,
 *   modeId: string | null, difficulty: string | null, stageId?: string | null, bossId?: string | null,
 *   hiddenBossId?: string | null, seed?: number | null, durationMs?: number | null, teamLp?: number | null,
 *   bossPools?: BossPools | null, uniteRounds?: number | null, roomMode: 'solo' | 'coop' | null, ruleset: string,
 *   selfId?: string | null, season?: string, compact?: boolean, players: PlayerRow[] }} StatsRecord
 * @typedef {{ v: number, records: StatsRecord[] }} StatsEnvelope
 * @typedef {{ victory: boolean, roundsPassed: number | null, hiddenReached: boolean, hiddenCleared: boolean,
 *   reason: string | null, modeId: string | null, difficulty: string | null, bossId?: string | null,
 *   hiddenBossId?: string | null, seed?: number | null, durationMs?: number | null, teamLp?: number | null,
 *   players: PlayerRow[], lastRound?: number | null, bossPools?: BossPools, uniteRounds?: number | null }} RecordResult
 *   the m.result-shaped payload of a record (recordToResult)
 * @typedef {{ games: number, wins: number, hiddenCleared: number }} ModeTally
 * @typedef {{ total: number, count: number, excluded: number, wins: number, rounds: { total: number, max: number },
 *   duration: { totalMs: number }, hidden: { reached: number, cleared: number }, byDifficulty: Record<string, ModeTally>,
 *   byMode: { solo: number, coop: number }, titles: Record<string, { count: number }>,
 *   bands: Record<string, { games: number, wins: number }>, sums: Record<string, number>, trophies: number,
 *   modes: { solo: ModeTally, coop: ModeTally }, bonds: Record<string, { games: number }>,
 *   maxima: Record<string, number | null> }} StatsAggregate  aggregateStats
 * @typedef {{ phase?: string, round?: number, players?: unknown, modeId?: unknown, lastRound?: unknown,
 *   difficulty?: unknown, stageId?: unknown, bossId?: unknown, hiddenBossId?: unknown, teamLp?: unknown,
 *   ruleset?: unknown, [key: string]: unknown }} StatsPub  m.public, read for a quit record
 * @typedef {{ match?: { public?: StatsPub | null, result?: unknown } | null, me?: { playerId?: string | null } | null,
 *   room?: { code?: string, mode?: string | null, season?: unknown } | null, [key: string]: unknown }} StatsAppState
 *   the app store state, read for the tracker and a quit record
 * @typedef {{ bandId: string, victorCount?: number, sortId?: number, [key: string]: unknown }} BandRec  a bands.json row
 * @typedef {{ count: number, [key: string]: unknown }} TrophyMedal  config.trophies.medals[]
 * @typedef {{ chessId: string, charId?: string, tier: number, shopSortId?: number, isGolden?: boolean, isHidden?: boolean,
 *   isDiy?: boolean, visible?: boolean, bonds?: string[], [key: string]: unknown }} BondChess  a chess.json row
 */

/** @returns {StatsEnvelope} a fresh empty envelope */
export const emptyStats = () => ({ v: STATS_VERSION, records: [] });

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** @template D @param {unknown} v @param {D} d @returns {number | D} */
const int = (v, d) => (Number.isFinite(v) ? Math.round(/** @type {number} */ (v)) : d);
/** @param {unknown} v @returns {number | null} */
const num = (v) => (Number.isFinite(v) ? /** @type {number} */ (v) : null);
/** @param {unknown} v @param {boolean} [d] */
const bool = (v, d = false) => (typeof v === 'boolean' ? v : d);
/** A non-empty string, cut to `max` characters. @param {unknown} v @param {number} [max] */
const str = (v, max = 64) => (typeof v === 'string' && v.length ? v.slice(0, max) : null);

// per-record bounds (an imported file is foreign data: nothing a row holds may grow without limit)
// the largest room the game seats (the 8-player co-op): a lower cap dropped the 7th / 8th seat's row, and with it the
// player's own row when they sat there (docs/rules/ui.md 「통계」)
const MAX_PLAYERS = LARGE_SEATS;
const MAX_LINEUP = 12;
const MAX_ITEMS = 4;
const MAX_BONDS = 24;
const MAX_STAT_KEYS = 24;
const MAX_NAME = 24;
const MAX_UNITS = 16; // the result screen's per-operator rows a stored record keeps (m.result sends up to 24)
/** A non-negative finite number, rounded (0 otherwise). @param {unknown} v */
const pos = (v) => (Number.isFinite(v) && /** @type {number} */ (v) > 0 ? Math.round(/** @type {number} */ (v)) : 0);

/**
 * Copy only the finite numeric keys of a stats block (the settlement's numbers; a numeric field this build does not
 * know is kept too, up to MAX_STAT_KEYS — display can lag, data should not).
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
function normalizeStatBlock(raw) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!isObj(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (!Number.isFinite(v) || k.length > 32) continue;
    out[k] = /** @type {number} */ (v);
    if (++n >= MAX_STAT_KEYS) break;
  }
  return out;
}

/**
 * FNV-1a 32-bit, hex — a content hash needs no crypto, only stability across sessions.
 * @param {string} s
 * @returns {string}
 */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * The record's dedupe id, from match facts the server replays byte-identically on reconnect / reload
 * (server/lobby.js result replay): seed + duration + mode + rounds + outcome + who I was. Two distinct
 * matches colliding on all of these is not a real scenario; a replayed m.result hits the same id and is
 * dropped, which is the point (recording happens on every m.result arrival, replays included).
 * @param {unknown} res raw m.result payload
 * @param {string|null|undefined} myId the local player's id at that moment
 * @returns {string}
 */
export function recordId(res, myId) {
  const r = /** @type {Record<string, unknown>} */ (isObj(res) ? res : {});
  return `r1.${fnv1a([r.seed ?? '-', r.durationMs ?? '-', r.modeId ?? '-', r.roundsPassed ?? '-', r.victory ? 1 : 0, myId ?? '-'].join('|'))}`;
}

/**
 * Normalize ONE player row: known fields defaulted and bounded, unknown fields dropped. `quit`: the record is a quit
 * record, whose row may not know its rounds (`roundsPassed: null`).
 * @param {unknown} raw
 * @param {boolean} [quit]
 * @returns {PlayerRow}
 */
function normalizePlayerRow(raw, quit = false) {
  const p = /** @type {Record<string, unknown>} */ (isObj(raw) ? raw : {});
  // the page and the replay read the title record from the game data by id: the sent texts are not kept
  const title = isObj(p.title) && str(p.title.id) ? { id: str(p.title.id) } : null;
  const lineup = (Array.isArray(p.lineup) ? p.lineup : []).filter(isObj).slice(0, MAX_LINEUP).map((u) => {
    // ids only — the tile position (row/col) is replay detail, not a statistic; items kept (配发装备统计); a 自选
    // pick and a 补位 stand-in kept too, or the replayed card would draw the plain operator
    /** @type {LineupEntry} */
    const e = {
      id: str(u.id) || '', golden: bool(u.golden), tier: int(u.tier, 0),
      items: /** @type {string[]} */ ((Array.isArray(u.items) ? u.items : []).filter((/** @type {unknown} */ i) => typeof i === 'string' && i.length)).slice(0, MAX_ITEMS).map((i) => i.slice(0, 64)),
    };
    if (u.kind === 'token') e.kind = 'token';
    if (isObj(u.diy) && str(u.diy.charId)) {
      e.diy = { charId: str(u.diy.charId), skillIndex: Number.isInteger(u.diy.skillIndex) ? /** @type {number} */ (u.diy.skillIndex) : 0, uniEquipId: str(u.diy.uniEquipId) };
    }
    if (str(u.standInFor)) e.standInFor = str(u.standInFor);
    return e;
  }).filter((u) => u.id);
  const bonds = (Array.isArray(p.bonds) ? p.bonds : []).filter(isObj).slice(0, MAX_BONDS).map((b) => ({
    bondId: str(b.bondId) || str(b.id) || '', layers: int(b.layers, 0), active: bool(b.active),
  })).filter((b) => b.bondId);
  // the result screen's 伤害 / 联防 tabs (server/match/unitTally.js): the top MAX_UNITS operators, numbers rounded
  const units = (Array.isArray(p.units) ? p.units : []).filter(isObj).slice(0, MAX_UNITS).map((u) => {
    /** @type {UnitRow} */
    const e = { id: str(u.id) || '', golden: bool(u.golden), tier: int(u.tier, 0), dmg: pos(u.dmg), final: pos(u.final), hidden: pos(u.hidden) };
    if (isObj(u.diy) && str(u.diy.charId)) {
      e.diy = { charId: str(u.diy.charId), skillIndex: Number.isInteger(u.diy.skillIndex) ? /** @type {number} */ (u.diy.skillIndex) : 0, uniEquipId: str(u.diy.uniEquipId) };
    }
    if (str(u.standInFor)) e.standInFor = str(u.standInFor);
    if (u.sold === true) e.sold = true;
    if (u.summon === true) e.summon = true;
    if (isObj(u.assist)) {
      /** @type {Record<string, number>} */
      const a = {};
      for (const [k, v] of Object.entries(u.assist).slice(0, MAX_PLAYERS)) if (str(k) && pos(v) > 0) a[/** @type {string} */ (str(k))] = pos(v);
      if (Object.keys(a).length) e.assist = a;
    }
    return e;
  }).filter((u) => u.id);
  return {
    playerId: str(p.playerId) || '',
    seat: int(p.seat, 0),
    name: str(p.name, MAX_NAME) || '',
    isBot: bool(p.isBot),
    left: bool(p.left),
    alive: bool(p.alive, true),
    victory: bool(p.victory), // server semantics: team won AND this player was still in at the end
    roundsPassed: quit ? num(p.roundsPassed) : int(p.roundsPassed, 0),
    eliminatedRound: num(p.eliminatedRound),
    lp: num(p.lp),
    bandId: str(p.bandId),
    title,
    trophies: int(p.trophies, 0),
    reward: int(p.reward, 0),
    lineup,
    bonds,
    ...(Array.isArray(p.usedBondIds) ? { usedBondIds: usedBondIdsOf(p) } : {}),
    stats: normalizeStatBlock(p.stats),
    units,
    unite: isObj(p.unite) ? { sent: pos(p.unite.sent), through: pos(p.unite.through) } : null,
    faction: str(p.faction, 16),
  };
}

/** m.result bossPools ({ final, hidden: { maxHp, dealt } | null }) or null. @param {unknown} raw @returns {BossPools | null} */
function normalizeBossPools(raw) {
  if (!isObj(raw)) return null;
  const one = (/** @type {unknown} */ x) => (isObj(x) && pos(x.maxHp) > 0 ? { maxHp: pos(x.maxHp), dealt: Math.min(pos(x.maxHp), pos(x.dealt)) } : null);
  const out = { final: one(raw.final), hidden: one(raw.hidden) };
  return out.final || out.hidden ? out : null;
}

/**
 * Normalize ONE match record to the current shape (a strict schema: missing fields get defaults, unknown ones are
 * dropped, every string / list is bounded). A record without an `end` is a settled one — the PR #323 build, which
 * never recorded anything else, wrote none.
 * @param {unknown} raw
 * @returns {StatsRecord|null} null when the row is not salvageable (no usable player row at all)
 */
export function normalizeRecord(raw) {
  const r = /** @type {Record<string, unknown>} */ (isObj(raw) ? raw : {});
  // a record IS a played match — no usable players array, no record
  if (!Array.isArray(r.players)) return null;
  const quit = r.end === 'quit';
  const players = r.players.filter(isObj).slice(0, MAX_PLAYERS).map((p) => normalizePlayerRow(p, quit));
  if (!players.length) return null;
  /** @type {StatsRecord} */
  const rec = {
    id: /** @type {string} */ (str(r.id)), // an id-less record gets its content id below
    v: STATS_VERSION,
    t: int(r.t, 0),
    end: quit ? 'quit' : 'settled',
    victory: bool(r.victory),
    roundsPassed: quit ? num(r.roundsPassed) : int(r.roundsPassed, 0),
    lastRound: num(r.lastRound),
    hiddenReached: bool(r.hiddenReached),
    hiddenCleared: bool(r.hiddenCleared),
    reason: str(r.reason, 32),
    modeId: str(r.modeId),
    difficulty: str(r.difficulty, 24),
    stageId: str(r.stageId),
    bossId: str(r.bossId),
    hiddenBossId: str(r.hiddenBossId),
    seed: num(r.seed),
    durationMs: num(r.durationMs),
    teamLp: num(r.teamLp),
    bossPools: normalizeBossPools(r.bossPools),
    uniteRounds: num(r.uniteRounds),
    roomMode: r.roomMode === 'solo' || r.roomMode === 'coop' ? r.roomMode : null,
    ruleset: isRulePreset(r.ruleset) ? /** @type {string} */ (r.ruleset) : LEGACY_RULESET,
    selfId: str(r.selfId),
    players,
  };
  // the 卫戍协议 season (shared/seasons.js; maintainer decision 2026-11-01: the statistics are per season), only when it
  // is not the default one: every record before seasons — and every record of the default season — has none
  const season = str(r.season, 32);
  if (season && season !== DEFAULT_SEASON) rec.season = season;
  if (r.compact === true) rec.compact = true;
  // an id-less (hand-made) record gets a content id, so both copies of it land on the same key
  if (!rec.id) rec.id = `c.${fnv1a(JSON.stringify(rec))}`;
  return rec;
}

/** The 卫戍协议 season of a record (normalizeRecord: none = the default season). @param {{ season?: unknown } | null | undefined} rec @returns {string} */
export const recordSeason = (rec) => (typeof rec?.season === 'string' && rec.season ? rec.season : DEFAULT_SEASON);

/**
 * The MIGRATIONS chain: `MIGRATIONS[v]` upgrades a v-envelope to v+1, for v = STATS_VERSION and down.
 * Every stored / imported envelope walks the whole chain.
 *   1 → 2: the records gain `ruleset` (규칙 모드); the matches before it count as 休闲 (LEGACY_RULESET).
 * @type {Record<number, (stats: { v: number, records: unknown[] }) => { v: number, records: unknown[] }>}
 */
export const MIGRATIONS = {
  1: ({ records }) => ({ v: 2, records: records.map((r) => (isObj(r) && !isRulePreset(r.ruleset) ? { ...r, ruleset: LEGACY_RULESET } : r)) }),
};

/** Newest first (the stored order): by time, then id. @param {StatsRecord} a @param {StatsRecord} b */
const newestFirst = (a, b) => (b.t - a.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Bring any stored / imported envelope to the current version.
 * @param {unknown} raw
 * @returns {{ stats: StatsEnvelope, changed: boolean, newer: boolean, dropped: number }}
 *   `newer` = the data was written by a NEWER build: returned untouched, callers must not save over it.
 *   `dropped` = rows that were not salvageable, repeated a record or went beyond MAX_RECORDS: gone from `stats`.
 */
export function migrateStats(raw) {
  if (!isObj(raw) || !Array.isArray(raw.records)) return { stats: emptyStats(), changed: false, newer: false, dropped: 0 };
  if (/** @type {number} */ (raw.v ?? 0) > STATS_VERSION) {
    return { stats: { v: /** @type {number} */ (raw.v), records: raw.records }, changed: false, newer: true, dropped: 0 };
  }
  let v = Number.isFinite(raw.v) ? /** @type {number} */ (raw.v) : 0;
  /** @type {unknown[]} */
  let records = raw.records;
  let changed = v !== STATS_VERSION;
  while (v < STATS_VERSION) {
    const step = MIGRATIONS[v];
    if (typeof step === 'function') records = step({ v, records }).records;
    v++;
  }
  // a hand-edited / merged list can be oversized, unsorted or repeat a record: only the newest MAX_RECORDS survive, newest first
  /** @type {StatsRecord[]} */
  const normalized = [];
  const seen = new Set(); // a record listed twice (hand-merged data) counts once: the first copy
  for (const r of records) {
    const rec = normalizeRecord(r);
    if (rec && !seen.has(rec.id)) { seen.add(rec.id); normalized.push(rec); }
  }
  normalized.sort(newestFirst);
  const kept = normalized.slice(0, MAX_RECORDS);
  const dropped = records.length - kept.length;
  // storage is rewritten (self-healed) when a row went, the order changed or an id-less row got its content id
  changed ||= dropped > 0 || kept.some((rec, i) => !isObj(records[i]) || rec.id !== (/** @type {Record<string, unknown>} */ (records[i])).id);
  return { stats: { v: STATS_VERSION, records: kept }, changed, newer: false, dropped };
}

/** Read the raw stored string (null when absent or unreadable). */
function readRaw() {
  try { return globalThis.localStorage?.getItem(FULL_KEY) ?? null; } catch { return null; }
}

/**
 * Read + migrate the persisted envelope; self-heals older shapes back to storage. An unreadable value (not JSON, or
 * not an envelope) is moved to `sp.pref.stats.damaged` — kept for a manual recovery — and the history starts again.
 * @returns {{ v: number, records: StatsRecord[], newer: boolean, dropped: number, damaged: boolean }}
 */
export function loadStats() {
  const raw = readRaw();
  if (raw == null) return { ...emptyStats(), newer: false, dropped: 0, damaged: false };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
  if (!isObj(parsed) || !Array.isArray(parsed.records)) {
    // keep the bad value where a person can find it; if even that write fails the next save simply replaces it
    try { globalThis.localStorage?.setItem(DAMAGED_KEY, raw); globalThis.localStorage?.removeItem(FULL_KEY); } catch { /* keep it in place */ }
    return { ...emptyStats(), newer: false, dropped: 0, damaged: true };
  }
  const { stats, changed, newer, dropped } = migrateStats(parsed);
  if (!newer && changed) saveStats(stats);
  return { ...stats, newer, dropped, damaged: false };
}

/**
 * The stored records for a glance (the lobby's 成就统计 card and window): read and migrated in memory only — nothing is
 * written back and an unreadable or newer value reads as no records, so 统计数据 still finds it and says so.
 * @returns {StatsRecord[]}
 */
export function peekStatsRecords() {
  const raw = readRaw();
  if (raw == null) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!isObj(parsed) || !Array.isArray(parsed.records)) return [];
  const { stats, newer } = migrateStats(parsed);
  return newer ? [] : stats.records;
}

/** The 规则 模式 of a record (a record from before rulesets is 休闲, LEGACY_RULESET). @param {{ ruleset?: unknown } | null | undefined} r */
export const recordRuleset = (r) => (isRulePreset(r?.ruleset) ? /** @type {string} */ ((/** @type {{ ruleset?: unknown }} */ (r)).ruleset) : LEGACY_RULESET);

/** The records of one 规则 模式 (成就统计 and the hub card's LV count each apart). @param {StatsRecord[]} records @param {string} ruleset */
export function recordsOfRuleset(records, ruleset) {
  return (Array.isArray(records) ? records : []).filter((r) => recordRuleset(r) === ruleset);
}

/**
 * The 规则 模式 成就统计 and the hub card show (maintainer decision 2026-11-08): the one picked last in the window, or the
 * one of the match played last, whichever came later; 经典 with neither.
 * @param {StatsRecord[]} records @param {{ ruleset?: unknown, at?: unknown } | null} saved the window's last pick (pref `achv.ruleset`)
 * @returns {string}
 */
export function achievementRuleset(records, saved) {
  /** @type {StatsRecord | null} */
  let last = null;
  for (const r of Array.isArray(records) ? records : []) if (Number.isFinite(r?.t) && (!last || r.t > last.t)) last = r;
  const pick = saved && isRulePreset(saved.ruleset) && Number.isFinite(saved.at) ? saved : null;
  if (pick && (!last || /** @type {number} */ (pick.at) >= last.t)) return /** @type {string} */ (pick.ruleset);
  return last ? recordRuleset(last) : 'classic';
}

/**
 * The records of one season (recordSeason; every record when `season` is null): each season has its own 卫戍认证 levels
 * and its own achievements, as 统计数据 shows the season on screen.
 * @param {StatsRecord[]} records @param {string|null} season
 */
export function recordsOfSeason(records, season) {
  const list = Array.isArray(records) ? records : [];
  return season ? list.filter((r) => recordSeason(r) === season) : list;
}

// ---- compaction + the storage budget ---------------------------------------------------------------------------

/** @type {(keyof StatsRecord)[]} */
const COMPACT_FRAME = ['id', 'v', 't', 'end', 'victory', 'roundsPassed', 'lastRound', 'hiddenReached', 'hiddenCleared', 'reason', 'modeId',
  'difficulty', 'roomMode', 'ruleset', 'durationMs', 'selfId'];

/**
 * The compact form of a record: the frame and the player's OWN row without lineup, bonds and name — everything the
 * aggregates, the history list, 成就统计 and the level read (the active bonds as their ids), nothing a replay needs.
 * Teammates are gone. Idempotent.
 * @param {StatsRecord} rec a normalized record
 * @returns {StatsRecord}
 */
export function compactRecord(rec) {
  const self = selfRowOf(rec);
  const usedBondIds = usedBondIdsOf(self);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of COMPACT_FRAME) if (rec[k] != null) out[k] = rec[k];
  out.compact = true;
  out.players = self ? [{
    playerId: self.playerId, seat: self.seat, alive: self.alive, victory: self.victory, roundsPassed: self.roundsPassed,
    eliminatedRound: self.eliminatedRound, bandId: self.bandId, title: self.title, left: self.left, stats: self.stats,
    // what 成就统计 and the level read (trophies, the 卫戍认证 reward, the bonds that were active)
    trophies: self.trophies, reward: self.reward,
    ...(usedBondIds.length ? { usedBondIds } : {}),
  }] : [];
  return /** @type {StatsRecord} */ (out);
}

/**
 * What goes to storage: the newest FULL_KEEP records and the record of the highest bond layers as they are, older ones
 * compacted, then the oldest dropped until the JSON fits `maxChars` (the newest record is always kept).
 * @param {StatsRecord[]} records newest first
 * @param {number} [maxChars]
 * @returns {StatsRecord[]}
 */
export function fitToBudget(records, maxChars = MAX_CHARS) {
  /** @type {StatsRecord[]} */
  const kept = [];
  let used = 40; // the envelope itself
  const peakId = highestBondRecord(records.slice(0, MAX_RECORDS))?.record.id;
  records.slice(0, MAX_RECORDS).forEach((r, i) => {
    const rec = i < FULL_KEEP || r.id === peakId ? r : compactRecord(r);
    const n = JSON.stringify(rec).length + 1;
    if (kept.length && used + n > maxChars) return;
    used += n;
    kept.push(rec);
  });
  return kept;
}

/**
 * Persist the envelope. Never overwrites an envelope of a newer build. Compacts and trims to the budget first; a write
 * the browser refuses (quota — other keys share it) is retried with half the history, down to a handful of records.
 * @param {{ v: number, records: StatsRecord[], newer?: boolean }} stats
 * @returns {boolean} whether a write stuck
 */
export function saveStats(stats) {
  if (stats.newer) return false;
  let recs = fitToBudget(stats.records);
  for (;;) {
    try {
      const ls = globalThis.localStorage;
      if (!ls) return false; // no storage at all (disabled by the browser)
      ls.setItem(FULL_KEY, JSON.stringify({ v: STATS_VERSION, records: recs }));
      return true;
    } catch { /* quota or storage disabled — fall through to shrinking */ }
    if (recs.length <= 8) return false; // a small history that still does not fit is foreign quota pressure
    recs = recs.slice(0, Math.max(8, Math.ceil(recs.length / 2)));
  }
}

/**
 * Derive the room shape ('solo' | 'coop') the way constants.js modeIdFor builds modeIds.
 * @param {string|null|undefined} modeId
 * @param {string|null|undefined} roomMode room.state `mode` when known
 * @returns {'solo'|'coop'|null}
 */
export function roomModeOf(modeId, roomMode) {
  if (roomMode === 'solo' || roomMode === 'coop') return roomMode;
  if (typeof modeId !== 'string') return null;
  if (modeId.includes('_single_')) return 'solo';
  if (modeId.includes('_multi_')) return 'coop';
  return null;
}

/**
 * Build one settled record from a raw m.result payload (+ context). Null when there is nothing to store: payloads
 * without players (the error-path settlement) or matches the local player did not take part in (spectator
 * seats get every result pushed too — eliminated players, who ARE in players[], keep recording).
 * @param {unknown} res raw m.result payload
 * @param {{ myId?: string|null, roomMode?: string|null, ruleset?: unknown, season?: string|null, now?: number }} ctx
 * @returns {StatsRecord|null}
 */
export function buildRecord(res, ctx = {}) {
  const r = /** @type {Record<string, unknown>} */ (isObj(res) ? res : {});
  if (!Array.isArray(r.players) || !r.players.length) return null;
  const myId = str(ctx.myId);
  const selfRow = r.players.find((p) => isObj(p) && p.playerId === myId);
  if (!selfRow) return null; // spectator / observer: not my match
  return normalizeRecord({
    v: STATS_VERSION,
    t: int(ctx.now, 0),
    id: recordId(r, myId),
    end: 'settled',
    victory: bool(r.victory),
    roundsPassed: int(r.roundsPassed, 0),
    lastRound: num(r.lastRound),
    hiddenReached: bool(r.hiddenReached),
    hiddenCleared: bool(r.hiddenCleared),
    reason: str(r.reason),
    modeId: str(r.modeId),
    difficulty: str(r.difficulty),
    stageId: str(r.stageId),
    bossId: str(r.bossId),
    hiddenBossId: str(r.hiddenBossId),
    seed: num(r.seed),
    durationMs: num(r.durationMs),
    teamLp: num(r.teamLp),
    bossPools: r.bossPools,
    uniteRounds: num(r.uniteRounds),
    roomMode: roomModeOf(str(r.modeId), ctx.roomMode),
    ruleset: rulesetKey(ctx.ruleset),
    season: str(ctx.season),
    selfId: myId,
    players: r.players,
  });
}

// ---- the match left early ----------------------------------------------------------------------------------------

/**
 * What the page remembers of the match on screen, so that giving it up can still be recorded: when the page first saw
 * it, whether that was at the start (a duration is only kept then), and the last round the player was seen alive in
 * (the server tells the others at the settlement, a leaver nothing).
 * @returns {{ active: boolean, startedAt: number, sawStart: boolean, aliveRound: number|null }}
 */
export const createLiveMatch = () => ({ active: false, startedAt: 0, sawStart: false, aliveRound: null });

/** The module's own tracker (fed by installStatsRecorder, read by recordQuit). */
export const liveMatch = createLiveMatch();

/**
 * Feed the tracker one app state (cheap: called on every store change).
 * @param {ReturnType<typeof createLiveMatch>} live
 * @param {StatsAppState} state the app store state
 * @param {number} [now]
 */
export function observeMatch(live, state, now = Date.now()) {
  const pub = state?.match?.public;
  const inMatch = !!pub && !!pub.phase && pub.phase !== PHASE.LOBBY && pub.phase !== PHASE.RESULT && !(/** @type {NonNullable<StatsAppState['match']>} */ (state.match)).result;
  if (!inMatch) { live.active = false; return live; }
  const round = Number(pub.round) || 0;
  if (!live.active) {
    live.active = true;
    live.startedAt = now;
    live.sawStart = round <= 1;
    live.aliveRound = null;
  }
  const me = Array.isArray(pub.players) ? pub.players.find((/** @type {unknown} */ p) => isObj(p) && p.playerId === state.me?.playerId) : null;
  if (me && me.alive !== false) live.aliveRound = Math.max(live.aliveRound ?? 0, round);
  return live;
}

/**
 * Start following the store (main.js). Returns the unsubscribe function.
 * @param {{ get: () => StatsAppState, subscribe: (fn: (s: StatsAppState) => void) => () => void }} store
 */
export function installStatsRecorder(store) {
  observeMatch(liveMatch, store.get());
  return store.subscribe((s) => observeMatch(liveMatch, s));
}

/**
 * The rounds a player who leaves in `phase` of `round` has cleared — the server's rule for a quit (platform.js _quit:
 * eliminated in round k ⇒ k − 1 passed; leaving in the settlement of round k counts k).
 * @param {string | undefined} phase @param {number} round
 */
export function clearedRounds(phase, round) {
  const r = Number.isFinite(round) ? round : 0;
  return Math.max(0, phase === PHASE.SETTLE ? r : r - 1);
}

/**
 * Build the quit record of a match the local player is leaving (放弃模拟), from the app state and the tracker. Null when
 * there is nothing of mine to record: no match on screen, its settlement already here (that one is recorded by
 * recordResult), a spectator seat, or a match the page never saw.
 * @param {StatsAppState} state the app store state BEFORE the match is cleared
 * @param {{ live?: ReturnType<typeof createLiveMatch>, now?: number }} [ctx]
 * @returns {StatsRecord|null}
 */
export function buildQuitRecord(state, ctx = {}) {
  const live = ctx.live ?? liveMatch;
  const now = int(ctx.now, Date.now());
  const pub = state?.match?.public;
  const myId = str(state?.me?.playerId);
  if (!pub || !myId || (/** @type {NonNullable<StatsAppState['match']>} */ (state.match)).result || !live.active) return null;
  const row = Array.isArray(pub.players) ? pub.players.find((/** @type {unknown} */ p) => isObj(p) && p.playerId === myId) : null;
  if (!row) return null; // a spectator seat is no player of the match
  const alive = row.alive !== false;
  const round = Number(pub.round) || 0;
  // alive: the rounds cleared so far; already eliminated: the round it was seen alive in, less one (unknown when the
  // page never saw it alive — a reload after the elimination)
  const roundsPassed = alive ? clearedRounds(pub.phase, round) : (live.aliveRound != null ? Math.max(0, live.aliveRound - 1) : null);
  return normalizeRecord({
    v: STATS_VERSION,
    t: now,
    id: `q.${fnv1a([myId, live.startedAt, pub.modeId ?? '-', state.room?.code ?? '-'].join('|'))}`,
    end: 'quit',
    victory: false,
    roundsPassed,
    lastRound: num(pub.lastRound),
    hiddenReached: pub.phase === PHASE.HIDDEN_CORE,
    hiddenCleared: false,
    reason: 'quit',
    modeId: str(pub.modeId),
    difficulty: str(pub.difficulty),
    stageId: str(pub.stageId),
    bossId: str(pub.bossId),
    hiddenBossId: str(pub.hiddenBossId),
    seed: null,
    durationMs: live.sawStart ? Math.max(0, now - live.startedAt) : null,
    teamLp: num(pub.teamLp),
    roomMode: roomModeOf(str(pub.modeId), state.room?.mode),
    ruleset: rulesetKey(pub.ruleset),
    season: str(state.room?.season),
    selfId: myId,
    players: [{
      playerId: myId, seat: row.seat, name: row.name, isBot: false, left: true, alive, victory: false, roundsPassed,
      eliminatedRound: alive ? null : live.aliveRound, lp: row.lp, bandId: row.bandId,
    }],
  });
}

/**
 * The m.result-shaped payload behind a settled record — the inverse of buildRecord. The stats page's history
 * rows hand this to the settlement view (screens/result.js reads it through normalizeResult): a finished match can be
 * RE-VIEWED because the record kept every field the payload had. Whatever a record never stored is simply absent and
 * normalizeResult defaults it, exactly like a tolerant live payload. A quit record (nothing was settled) and a
 * compacted one (its rows are gone) have no settlement to show.
 * @param {unknown} rec
 * @returns {RecordResult|null} null when the row is not a usable, full, settled record
 */
export function recordToResult(rec) {
  const r = normalizeRecord(rec);
  if (!r || r.end === 'quit' || r.compact) return null;
  /** @type {RecordResult} */
  const res = {
    victory: r.victory,
    roundsPassed: r.roundsPassed,
    hiddenReached: r.hiddenReached,
    hiddenCleared: r.hiddenCleared,
    reason: r.reason,
    modeId: r.modeId,
    difficulty: r.difficulty,
    bossId: r.bossId,
    hiddenBossId: r.hiddenBossId,
    seed: r.seed,
    durationMs: r.durationMs,
    teamLp: r.teamLp,
    players: r.players,
  };
  if (Number.isFinite(r.lastRound)) res.lastRound = r.lastRound;
  if (r.bossPools) res.bossPools = r.bossPools;
  if (Number.isFinite(r.uniteRounds)) res.uniteRounds = r.uniteRounds;
  return res;
}

/**
 * Append one record: replays (same content id) are dropped, newest first, capped at MAX_RECORDS.
 * @param {StatsEnvelope} stats
 * @param {StatsRecord | null} record
 * @returns {{ stats: StatsEnvelope, added: boolean }}
 */
export function appendRecord(stats, record) {
  if (!record || !record.id) return { stats, added: false };
  if (stats.records.some((r) => r.id === record.id)) return { stats, added: false };
  const records = [record, ...stats.records].slice(0, MAX_RECORDS);
  return { stats: { v: STATS_VERSION, records }, added: true };
}

/** load → append → save of one built record (never over an envelope of a newer build). @param {StatsRecord | null} rec @returns {StatsRecord|null} the record when stored */
function storeRecord(rec) {
  if (!rec) return null;
  const stats = loadStats();
  if (stats.newer) return null;
  const { stats: next, added } = appendRecord(stats, rec);
  if (added && !saveStats(next)) console.warn('[stats] localStorage write failed (quota?), record not persisted');
  return added ? rec : null;
}

/**
 * Record a finished match end-to-end (load → append → save). Returns the built record, or null when
 * nothing was stored (no players / not my match / replay).
 * @param {unknown} res raw m.result payload
 * @param {{ myId?: string|null, roomMode?: string|null, ruleset?: unknown, season?: string|null, now?: number }} [ctx]
 * @returns {StatsRecord|null}
 */
export function recordResult(res, ctx = {}) {
  return storeRecord(buildRecord(res, ctx));
}

/**
 * Record the match the player is giving up (放弃模拟), before the app clears its state. Returns the record, or null.
 * @param {StatsAppState} state the app store state before the match is cleared
 * @param {{ live?: ReturnType<typeof createLiveMatch>, now?: number }} [ctx]
 * @returns {StatsRecord|null}
 */
export function recordQuit(state, ctx = {}) {
  const live = ctx.live ?? liveMatch;
  const rec = storeRecord(buildQuitRecord(state, ctx));
  live.active = false; // one record per match
  return rec;
}

/**
 * Merge two envelopes (import into existing): union by record id, newest first, capped.
 * @param {{ records: unknown[] }} a current (wins ties)
 * @param {{ records: unknown[] }} b incoming
 * @returns {StatsEnvelope}
 */
export function mergeStats(a, b) {
  /** @type {Map<string, StatsRecord>} */
  const byId = new Map();
  for (const r of [...(Array.isArray(b?.records) ? b.records : []), ...(Array.isArray(a?.records) ? a.records : [])]) {
    const rec = normalizeRecord(r);
    if (rec) byId.set(rec.id, rec);
  }
  const records = [...byId.values()].sort(newestFirst).slice(0, MAX_RECORDS);
  return { v: STATS_VERSION, records };
}

/**
 * Parse + migrate + merge an exported / pasted payload into the current data.
 * @param {unknown} raw parsed JSON of the imported file
 * @param {{ records: StatsRecord[] }} current current envelope
 * @returns {{ stats: StatsEnvelope, added: number, skipped: number, dropped: number }}
 *   added = records new to this device; skipped = duplicates of records it has; dropped = rows of the file that could
 *   not be read
 */
export function importStats(raw, current) {
  if (isObj(raw) && raw.kind != null && raw.kind !== 'local-stats') {
    const err = /** @type {Error & { code?: string }} */ (new Error('not a stats export')); // the page shows its own text
    err.code = 'stats-bad-file';
    throw err;
  }
  if (!isObj(raw) || !Array.isArray(raw.records)) {
    const err = /** @type {Error & { code?: string }} */ (new Error('not a stats export'));
    err.code = 'stats-bad-file';
    throw err;
  }
  const { stats: incoming, newer, dropped } = migrateStats(raw);
  if (newer) {
    const err = /** @type {Error & { code?: string }} */ (new Error('exported by a newer client')); // the page shows its own text
    err.code = 'stats-newer-version';
    throw err;
  }
  const have = new Set((Array.isArray(current?.records) ? current.records : []).map((r) => r.id));
  const merged = mergeStats(current, incoming);
  const added = incoming.records.filter((r) => !have.has(r.id)).length;
  return { stats: merged, added, skipped: incoming.records.length - added, dropped };
}

/**
 * The payload the export button downloads (envelope + a little provenance).
 * @param {{ records: StatsRecord[] }} stats
 * @returns {{ app: string, kind: string, v: number, exportedAt: string, records: StatsRecord[] }}
 */
export function exportStats(stats) {
  return {
    app: 'stronghold-protocol',
    kind: 'local-stats',
    v: STATS_VERSION,
    exportedAt: new Date().toISOString(),
    records: fitToBudget(Array.isArray(stats?.records) ? stats.records : []),
  };
}

// ---- aggregation (what the page shows; records may hold more than any view uses) ------------------------------------

const SELF_STATS = ['dmgDealt', 'kills', 'bossDamage', 'activatedLayers', 'merges', 'itemsEquipped', 'gold', 'perfectRounds', 'refreshes', 'leaks', 'lpLost'];

/**
 * The row that "is me" in a record: selfId, else the only human, else seat 0 — records written by
 * recordResult always have selfId; the fallbacks only serve imported / hand-made data. A record that names its selfId
 * but lost that row (an 8-player match stored while the cap was 6 seats) has no self row: falling back gave the
 * player another human's strategy and numbers.
 * @param {{ players?: unknown, selfId?: unknown } | null | undefined} rec a record (or an unchecked row of one)
 * @returns {PlayerRow|null}
 */
export function selfRowOf(rec) {
  const ps = Array.isArray(rec?.players) ? rec.players : [];
  if (rec?.selfId) return ps.find((p) => p.playerId === rec.selfId) || null;
  return ps.find((p) => !p.isBot)
    || ps[0]
    || null;
}

/**
 * Whether this record counts as a win for its self player (per-row victory = team won AND still in).
 * @param {{ victory?: unknown }} rec @param {PlayerRow | null} self
 */
const selfWon = (rec, self) => (self ? !!self.victory : !!rec.victory);

/**
 * The rounds the player passed in a record: its own row's (the table the settlement prints per player), else the
 * team's; 0 when the record does not know.
 * @param {StatsRecord | null | undefined} rec
 */
export function roundsOf(rec) {
  const self = selfRowOf(rec);
  const v = self && Number.isFinite(self.roundsPassed) ? self.roundsPassed : rec?.roundsPassed;
  return Number.isFinite(v) ? /** @type {number} */ (v) : 0;
}

/**
 * Whether a record enters the aggregates (see the header). A settled record always does. A quit record does once the
 * player had finished at least one battle: cleared a round, or was already eliminated; a match given up before that —
 * entered and left right away — is history only.
 * @param {unknown} rec a normalized record
 * @returns {boolean}
 */
export function countsTowardStats(rec) {
  if (!isObj(rec)) return false;
  if (rec.end !== 'quit') return true;
  const self = selfRowOf(rec);
  if (!self) return false;
  return self.alive === false || (Number.isFinite(self.roundsPassed) && /** @type {number} */ (self.roundsPassed) >= 1);
}

/**
 * Aggregate records for the stats page — over the records that count; `total` / `excluded` say how many did not.
 * Everything is keyed by ids (bandId / titleId / difficulty); the page maps them to names and icons through the game
 * data. The combat totals read the settled records' stat blocks (a quit record has none).
 * @param {StatsRecord[]} records
 * @returns {StatsAggregate}
 */
export function aggregateStats(records) {
  const all = Array.isArray(records) ? records : [];
  const rs = all.filter(countsTowardStats);
  /** @type {StatsAggregate} */
  const out = {
    total: all.length, count: rs.length, excluded: all.length - rs.length, wins: 0,
    rounds: { total: 0, max: 0 },
    duration: { totalMs: 0 },
    hidden: { reached: 0, cleared: 0 },
    byDifficulty: {}, byMode: { solo: 0, coop: 0 },
    titles: {}, bands: {}, sums: {},
    trophies: 0,
    modes: { solo: { games: 0, wins: 0, hiddenCleared: 0 }, coop: { games: 0, wins: 0, hiddenCleared: 0 } },
    bonds: Object.create(null),
    maxima: { gold: null, merges: null, kills: null },
  };
  for (const rec of rs) {
    const self = selfRowOf(rec);
    const won = selfWon(rec, self);
    if (won) out.wins++;
    const rounds = roundsOf(rec);
    out.rounds.total += rounds;
    out.rounds.max = Math.max(out.rounds.max, rounds);
    out.duration.totalMs += num(rec.durationMs) || 0;
    if (rec.hiddenReached) out.hidden.reached++;
    if (rec.hiddenCleared) out.hidden.cleared++;

    const d = rec.difficulty || 'UNKNOWN';
    const bd = (out.byDifficulty[d] ||= { games: 0, wins: 0, hiddenCleared: 0 });
    bd.games++;
    if (won) bd.wins++;
    if (rec.hiddenCleared) bd.hiddenCleared++;

    if (rec.roomMode === 'solo' || rec.roomMode === 'coop') out.byMode[rec.roomMode]++;

    const titleId = self?.title?.id;
    if (titleId) {
      const t = (out.titles[titleId] ||= { count: 0 });
      t.count++;
    }

    const bandId = self?.bandId;
    if (bandId) {
      const b = (out.bands[bandId] ||= { games: 0, wins: 0 });
      b.games++;
      if (won) b.wins++;
    }

    if (rec.end !== 'quit' && self && isObj(self.stats)) {
      for (const k of SELF_STATS) {
        const v = self.stats[k];
        if (Number.isFinite(v)) out.sums[k] = (out.sums[k] || 0) + v;
      }
    }

    // 成就统计 (after upstream 0.3.3): the trophies of the settled 联合模拟 matches, per mode games / wins / hidden-core
    // clears, the single-match records and how often each bond was active at the settlement
    if (rec.end !== 'quit' && self) {
      if (rec.roomMode === 'coop' && Number.isFinite(self.trophies)) out.trophies += Math.max(0, self.trophies);
      const values = { gold: self.stats?.gold, merges: self.stats?.merges, kills: self.stats?.kills };
      for (const [key, value] of Object.entries(values)) {
        if (Number.isFinite(value) && value >= 0) out.maxima[key] = Math.max(out.maxima[key] ?? 0, value);
      }
      for (const id of usedBondIdsOf(self)) (out.bonds[id] ||= { games: 0 }).games++;
    }
    if (rec.roomMode === 'solo' || rec.roomMode === 'coop') {
      const m = out.modes[rec.roomMode];
      m.games++;
      if (won) m.wins++;
      if (won && rec.hiddenCleared) m.hiddenCleared++;
    }
  }
  return out;
}

/**
 * The bonds a row had active at the settlement (a compacted row keeps only their ids).
 * @param {{ usedBondIds?: unknown, bonds?: unknown } | null | undefined} player
 * @returns {string[]}
 */
function usedBondIdsOf(player) {
  const ids = /** @type {unknown[]} */ (Array.isArray(player?.usedBondIds) ? player.usedBondIds
    : (Array.isArray(player?.bonds) ? player.bonds : []).filter((/** @type {{ active?: unknown } | null} */ b) => b?.active === true).map((/** @type {{ bondId?: unknown }} */ b) => b.bondId));
  return [...new Set(/** @type {string[]} */ (ids.filter((id) => typeof id === 'string' && id.length)).map((id) => id.slice(0, 64)))].slice(0, MAX_BONDS);
}

/**
 * 卫戍成就's peak: the settled record whose own row had the active bond of the most layers (a full record: the lineup is
 * drawn). [ASSUMED·자료 없음: upstream's reading of the event's achievement window — the official peak is kept on the
 * account; the settlement's active bonds are the nearest this project records]
 * @param {StatsRecord[]} records
 * @returns {{ record: StatsRecord, player: PlayerRow, bond: BondRow }|null}
 */
export function highestBondRecord(records) {
  /** @type {{ record: StatsRecord, player: PlayerRow, bond: BondRow } | null} */
  let best = null;
  for (const record of Array.isArray(records) ? records : []) {
    if (!isObj(record) || record.end === 'quit' || record.compact) continue;
    const player = selfRowOf(record);
    for (const bond of player?.bonds || []) {
      if (!bond.active || !Number.isFinite(bond.layers) || bond.layers <= 0) continue;
      if (!best || bond.layers > best.bond.layers) best = /** @type {{ record: StatsRecord, player: PlayerRow, bond: BondRow }} */ ({ record, player, bond });
    }
  }
  return best;
}

/**
 * 策略记录's special marks: the strategies the player won with at least their `victorCount` times (bands.json, the
 * official threshold); 入门协议 counts nothing.
 * @param {StatsRecord[]} records @param {Record<string, BandRec> | BandRec[] | null | undefined} bands
 * @returns {string[]} band ids, by sortId
 */
export function strategyBadgeIds(records, bands) {
  /** @type {Map<string, number>} */
  const clears = new Map();
  for (const rec of Array.isArray(records) ? records : []) {
    if (!isObj(rec) || rec.end === 'quit' || rec.difficulty === 'TRAINING' || rec.modeId === 'mode_training_1') continue;
    const self = selfRowOf(rec);
    if (!self?.bandId || !selfWon(rec, self)) continue;
    clears.set(self.bandId, (clears.get(self.bandId) || 0) + 1);
  }
  return Object.values(bands || {}).filter((band) => Number.isInteger(band?.victorCount) && /** @type {number} */ (band.victorCount) > 0
    && (clears.get(band.bandId) || 0) >= /** @type {number} */ (band.victorCount))
    .sort((a, b) => (a.sortId || 0) - (b.sortId || 0) || a.bandId.localeCompare(b.bandId))
    .map((band) => band.bandId);
}

/**
 * The highest trophy medal reached (config.trophies.medals, whatever their order).
 * @param {number | null | undefined} total @param {TrophyMedal[] | null | undefined} medals
 * @returns {TrophyMedal | null}
 */
export function trophyMedalOf(total, medals) {
  const count = Number.isFinite(total) ? Math.max(0, /** @type {number} */ (total)) : 0;
  return (Array.isArray(medals) ? medals : []).reduce((best, medal) =>
    Number.isFinite(medal?.count) && medal.count >= 0 && medal.count <= count && (!best || medal.count > best.count) ? medal : best, /** @type {TrophyMedal | null} */ (null));
}

/**
 * The season's operators of a bond (one per operator and tier, no golden / hidden / 自选 records), by tier.
 * @param {BondChess[] | null | undefined} chess @param {string | null | undefined} bondId
 * @returns {BondChess[]}
 */
export function bondMemberChess(chess, bondId) {
  if (!bondId) return [];
  /** @type {Set<string>} */
  const seen = new Set();
  return (Array.isArray(chess) ? chess : []).filter((c) => {
    if (!c || c.isGolden || c.isHidden || c.isDiy || c.visible === false || !c.bonds?.includes(bondId)) return false;
    const key = `${c.charId}#${c.tier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.tier - b.tier || (a.shopSortId || 0) - (b.shopSortId || 0) || a.chessId.localeCompare(b.chessId));
}
