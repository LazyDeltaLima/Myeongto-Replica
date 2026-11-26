// server/match/gamedata.js — typed, defaulted view of data/*.json for the match engine.
//
// Every lookup is an own-property lookup (ids come from client intents) that never throws and returns null for
// unknown ids. Tunables come from data/config.json with the documented defaults (research 00-INDEX §2–§8) when a
// key is missing, so a partial data set (tests, data being regenerated) still yields a working match.
//
// No custom balance (DESIGN §14 corrections, research 08 §6): enemy numbers are the official ones — the PRTS
// per-round enemyScale table of data/config.json, the leader pool = bloodPoint per player alive at the fight's start
// (bossPoolShareOf). data/tuning.json only overrides result titles:
//   titles[titleId]                                                { stat?, rule? } merged over config.titles
// (the former enemyHpMul / enemyAtkMul / enemySpeedMul / bossHpMul / flyPlaceholders knobs were removed; a tuning file
// that still carries them is ignored).
//
// A custom 规则 match (shared/ruleset.js) hands its settings to the constructor: the round plan (customRoundPlan — every
// round-keyed table is read at the round's source round, srcRound), the bond ban counts, the leader and stage bans, the
// co-op prep, the 目标生命值 rules, the layer cap, the enemy / leader stat multipliers (the steps and the percents:
// enemyScale, leaderScale, bossHpMul) and the shop pool sizes (poolCopies, itemPoolCopies) come out of the accessors below; without settings every accessor is the official
// one (and returns the same object shapes, so a classic battle spec is unchanged).
//
// An 8-player co-op match (shared/constants.js LARGE_SEATS; the constructor's `seats`) reads config.eightPlayer over the
// 4-player values: the shop pool and item stock multipliers, the bond ban counts, the overtime drain, the 隐秘核心
// threshold, the leader HP head count, the 机变 card count and the 联防 helpers (`large`; null in every other match).
// The room starts with 5–8 players (shared/constants.js LARGE_MIN_PLAYERS; maintainer decision 2026-11-01): each of those
// numbers is the 4-player value at 4 players, config.eightPlayer's at 8 and linear between, by the players the match
// started with (the constructor's `players`; `largeAt`) — the bans have no 8-player key and stay the 4-player table.

import { getConfig, getMode } from '../data.js';
import { isShopItem } from '../sim/simdata.js';
import { standInRecord } from '../../shared/standIn.js';
import { customRoundPlan, customPrepSeconds, keepUnbanned, customPoolCount, customBanLimits, officialStep, stepScale, lpSharedBandOff } from '../../shared/ruleset.js';
import { BOND_LAYER_CAP, LARGE_SEATS, MAX_SEATS } from '../../shared/constants.js';

/**
 * @param {Readonly<Record<string, any>> | null | undefined} map any: a data file — its records are read field by field by ~190 callers of the accessors below (a typed record per file is types/ work)
 * @param {unknown} id
 * @returns {Record<string, any> | null} any: as `map`
 */
const own = (map, id) => (map && typeof map === 'object' && typeof id === 'string' && Object.hasOwn(map, id) && map[id] && typeof map[id] === 'object' ? map[id] : null);
/**
 * @template T
 * @param {unknown} v
 * @param {T} d
 * @returns {number | T}
 */
const numOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/**
 * @template T
 * @param {unknown} v
 * @param {T} d
 * @returns {number | T}
 */
const posIntOr = (v, d) => (Number.isInteger(v) && /** @type {number} */ (v) > 0 ? /** @type {number} */ (v) : d);

export const DEFAULTS = Object.freeze({
  income: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 12, 12, 12, 12, 12],
  incomeCap: 12,
  chessPrice: /** @type {Readonly<Record<number, number>>} */ ({ 1: 2, 2: 3, 3: 3, 4: 3, 5: 4, 6: 4 }),
  sellPrice: 1,
  refreshPrice: 1,
  poolCopies: /** @type {Readonly<Record<number, number>>} */ ({ 1: 12, 2: 14, 3: 18, 4: 16, 5: 8, 6: 5 }),
  mergeCount: 3,
  goldenCopies: 3,
  itemMergeCount: 2,
  benchSize: 10,
  tempSize: 5,
  deployCap: 8,
  equipPerChess: 2,
  maxArtsPerRound: 2,
  rewardOffer: { count: 3, tierOffset: 1, maxTier: 6, price: 0 },
  upgradePrices: [5, 8, 11, 12, 13],
  maxShopLevel: 6,
  shopSlots: /** @type {Readonly<Record<number, { chess: number, item: number }>>} */ ({ 1: { chess: 3, item: 1 }, 2: { chess: 4, item: 1 }, 3: { chess: 4, item: 1 }, 4: { chess: 5, item: 1 }, 5: { chess: 5, item: 1 }, 6: { chess: 5, item: 1 } }),
  defaultBandId: 'band_bldsk',
  defaultStartLp: 28,
  lpCapPerRound: 10,
  bossOvertimeAfter: 150,
  bossOvertimeDrainPerSec: 1,
  hiddenCore: { single: 350, multi: 1200, minTeamLpExclusive: 1, difficulties: ['NORMAL', 'HARD', 'ABYSS'] },
  dp: { init: 10, perSec: 1, max: 99 },
  unite: { maxHelpers: 2, templates: { 1: 'act1autochess_escaped_single', 2: 'act1autochess_escaped_multi' } },
  timers: /** @type {Readonly<Record<string, number>>} */ ({ infoCheck: 25, bandDraft: 50, bandTurn: 50, battleCheck: 3, spFirst: 30, spTurn: 16 }),
  bans: /** @type {Readonly<Record<string, { core: number, addon: number }>>} */ ({ FUNNY: { core: 0, addon: 1 }, NORMAL: { core: 3, addon: 4 }, HARD: { core: 3, addon: 4 }, ABYSS: { core: 3, addon: 4 } }),
  bandDraft: { skipsPerPlayer: 1, timeoutBandId: 'band_bldsk' },
  leftoverFundsKeptByBands: ['band_cannot'],
});

/** Game seconds per real second of a battle (forced 2×): combat limits in data are real seconds (combatTimeLimit). */
export const COMBAT_TIME_SCALE = 2;

/**
 * Multiplier of bloodPoint[difficulty] for the shared leader pool (DESIGN §20.10, §25.13.4), from config bossHpScale —
 * each key from the mode's entry first, then the global one; the defaults are the current rule:
 *   solo   `solo` (1: the table value — one player's share);
 *   co-op  `perPlayer` true (the owner's decision of 2026-10-06, adopting PR #209 by @qingjingshenghuo): `coop` (1) × the
 *          players alive when the fight starts — bots and AI 托管 seats count, eliminated and departed seats do not —
 *          at most `aliveFull` (4); a count left out means a full team;
 *          `perPlayer` false: the fixed pool of 0.1.x (「保持固定血量」, restorable with `solo` 0.25): `coop` whatever the
 *          count, × min(alive, aliveFull) / aliveFull with `aliveScaling`.
* @param {Record<string, unknown> | null | undefined} modeScale config.modes[modeId].bossHpScale
* @param {Record<string, unknown> | null | undefined} cfgScale config.bossHpScale
 * @param {boolean} isSolo
 * @param {number} [aliveCount] alive players at the Final Assault / Hidden Core start (co-op)
 * @returns {number}
 */
export function bossPoolShareOf(modeScale, cfgScale, isSolo, aliveCount) {
  /** @type {Record<string, unknown>} */
  const ms = modeScale && typeof modeScale === 'object' ? modeScale : {};
  /** @type {Record<string, unknown>} */
  const cs = cfgScale && typeof cfgScale === 'object' ? cfgScale : {};
  /** @param {unknown} v */
  const pos = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  /** @param {unknown} v */
  const yesNo = (v) => (typeof v === 'boolean' ? v : null);
  /**
   * @param {string} k
   * @param {number} d
   */
  const pick = (k, d) => pos(ms[k]) ?? pos(cs[k]) ?? d;
  /**
   * @param {string} k
   * @param {boolean} d
   */
  const flag = (k, d) => yesNo(ms[k]) ?? yesNo(cs[k]) ?? d;
  if (isSolo) return pick('solo', 1);
  const full = Math.max(1, Math.floor(pick('aliveFull', 4)));
  const n = Number(aliveCount);
  const alive = Number.isFinite(n) && n >= 1 ? Math.min(full, Math.floor(n)) : full;
  if (flag('perPlayer', true)) return pick('coop', 1) * alive;
  return pick('coop', 1) * (flag('aliveScaling', false) ? alive / full : 1);
}

/** Strip the _a/_b suffix of an item id (the registry key of an item family). */
/**
 * Registry key of an item id (`_a` / `_b` dropped). With a season's data, the record's `handlerKey` (another season
 * reuses the default season's ids for other items: tools/build-data.mjs attachHandlerKeys, sim/content/support itemKeyOf).
 * @param {unknown} id
 * @param {Readonly<{ items?: unknown }> | null} [data]
 */
export function itemKey(id, data = null) {
  if (typeof id !== 'string') return '';
  const bare = id.replace(/_[ab]$/, '');
  const items = data && data.items && typeof data.items === 'object' ? /** @type {Record<string, unknown>} */ (data.items) : null;
  const rec = items ? (Object.hasOwn(items, id) ? items[id] : Object.hasOwn(items, `${bare}_a`) ? items[`${bare}_a`] : null) : null;
  const key = rec && typeof rec === 'object' ? /** @type {{ handlerKey?: unknown }} */ (rec).handlerKey : null;
  return typeof key === 'string' ? key : bare;
}

/**
 * A leader's table HP for one player (DESIGN §25.13.4): its mode's value (bosses.json `bloodByMode`, a season whose table
 * gives one per mode), else its difficulty's (`bloodPoint`), else — a leader another season lends (shared/seasonBorrow.js)
 * in a mode its season lacks — its season's co-op mode of that difficulty (`mode_multi_<difficulty>`: 规程's
 * `bloodByMode` gives the 盟约 single modes none) [ASSUMED·자료 없음: the official game never mixed two seasons], else the
 * first one it has; null when it has none.
 * @param {unknown} boss bosses.json record
 * @param {string} modeId
 * @param {string} difficulty
 * @returns {number | null}
 */
export function bossBloodPoint(boss, modeId, difficulty) {
  if (!boss || typeof boss !== 'object') return null;
  const { bloodByMode, bloodPoint } = /** @type {{ bloodByMode?: unknown, bloodPoint?: unknown }} */ (boss);
  /** @param {unknown} table @param {string} k @returns {number | null} */
  const at = (table, k) => { const v = table && typeof table === 'object' ? /** @type {Record<string, unknown>} */ (table)[k] : null; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
  const multi = typeof difficulty === 'string' ? `mode_multi_${difficulty.toLowerCase()}` : '';
  const hit = at(bloodByMode, modeId) ?? at(bloodPoint, difficulty) ?? (multi ? at(bloodByMode, multi) : null);
  if (hit != null) return hit;
  const first = bloodPoint && typeof bloodPoint === 'object' ? Object.values(bloodPoint).find((v) => typeof v === 'number' && Number.isFinite(v)) : undefined;
  return typeof first === 'number' ? first : null;
}

export class GameData {
  /**
   * @param {Readonly<Record<string, any>>} data server/data.js getData() (may be partial) — any: `this.raw`'s files are read field by field across the class and its callers (as `own` above)
   * @param {string} modeId e.g. 'mode_multi_hard'
   * @param {Readonly<import('../../shared/ruleset.js').CustomSettings> | null} [custom] a custom ruleset's settings
   *   (sanitizeCustom), null = the official rules
   * @param {{ seats?: number, players?: number }} [opts] `seats`: the co-op room size (LARGE_SEATS = the 8-player mode,
   *   header); `players`: the seats the match started with (an 8-player room's numbers follow it; missing = full)
   */
  constructor(data, modeId, custom = null, { seats, players } = {}) {
    this.raw = data && typeof data === 'object' ? data : {};
    this.config = getConfig(this.raw) || {};
    this.modeId = modeId;
    this.mode = getMode(modeId, this.raw) || {};
    this.economy = this.config.economy && typeof this.config.economy === 'object' ? this.config.economy : {};
    const big = this.config.eightPlayer;
    /** config.eightPlayer in an 8-player co-op match (header), else null */
    this.large = seats === LARGE_SEATS && !this.isSolo && big && typeof big === 'object' ? big : null;
    /** the 8-player numbers' share in this match (largeAt): 0 at 4 players or fewer, 1 at 8 (and when `players` is missing) */
    this.largeShare = !this.large ? 0 : Number.isInteger(players) && /** @type {number} */ (players) > 0
      ? Math.min(1, Math.max(0, (/** @type {number} */ (players) - MAX_SEATS) / (LARGE_SEATS - MAX_SEATS))) : 1;
    const chess = this.raw.chess && typeof this.raw.chess === 'object' ? this.raw.chess : {};
    this._chess = chess;
    this._items = this.raw.items && typeof this.raw.items === 'object' ? this.raw.items : {};
    this._bonds = this.raw.bonds && typeof this.raw.bonds === 'object' ? this.raw.bonds : {};
    /** visible, shop-eligible base (normal) chess ids */
    this.visibleChess = Object.keys(chess).filter((id) => {
      const c = chess[id];
      return c && c.visible && !c.isGolden && !c.isDiy && !c.isHidden && Number.isInteger(c.tier);
    }).sort();
    /**
     * Shop item ids by tier (sim/simdata.js isShopItem: normal EQUIP, not hidden, not effect-only — the special
     * 维式重锤 and 突变细胞 are never sold). Every "shop item" draw uses it: the shop item slot (pool.js), the 道具补给 /
     * 机密商店 cards (choices.js) and the shop-eligible item pools (Match.rollItemId).
     */
    /** @type {Record<string, string[]>} */
    this.shopItemsByTier = {};
    for (const [id, it] of Object.entries(this._items)) {
      if (!isShopItem(it)) continue;
      (this.shopItemsByTier[it.tier] ||= []).push(id);
    }
    for (const k of Object.keys(this.shopItemsByTier)) this.shopItemsByTier[k].sort();
    this.bondIds = Object.keys(this._bonds).sort((a, b) => (numOr(this._bonds[a].identifier, 99) - numOr(this._bonds[b].identifier, 99)) || (a < b ? -1 : 1));
    this.modeInactiveBonds = new Set(Array.isArray(this.mode.inactiveBondIds) ? this.mode.inactiveBondIds : []);
    /** bandBondIds memo */
    this._bandBonds = new Map();
    this.inactiveEnemies = new Set(Array.isArray(this.mode.inactiveEnemyKeys) ? this.mode.inactiveEnemyKeys : []);
    /** data/tuning.json (titles only, see the header) */
    this.tuning = this.raw.tuning && typeof this.raw.tuning === 'object' ? this.raw.tuning : {};
    /** standIn memo: chess id → composed 补位 record | null */
    this._standIns = new Map();
    /** _lentBosses memo (the leaders borrowed from other seasons) */
    /** @type {{ bossId: string, hidden?: unknown, templates?: unknown }[] | null} */
    this._lent = null;
    /** roundCfg memo of the rounds whose bossTemplates name the borrowed leaders: source round → entry */
    /** @type {Map<string, object> | null} */
    this._lentRounds = null;
    /** the custom settings (header), null = official */
    this.custom = custom && typeof custom === 'object' ? custom : null;
    const n = this.custom?.flow?.rounds;
    /**
     * The custom round plan (shared/ruleset.js customRoundPlan), null while the round count is the mode's own: `rounds`
     * [{ src, kind, hp, atk … }] for rounds 1..n, `hidden` the 隐秘核心 after them.
     */
    this.plan = Number.isInteger(n) && n !== this._lastRound0
      ? customRoundPlan({ ...this.mode, lastRound: this._lastRound0, hiddenRound: this._hiddenRound0, spRounds: this._spRounds0 }, n)
      : null;
  }

  /**
   * The official round of round `r` (the custom round plan's `src`; r itself without a plan) — the round whose config
   * entry, waves, timers, income, 机变 schedule and enemy pick a round uses.
   * @param {number} r
   */
  srcRound(r) {
    const p = this.plan;
    if (!p || !Number.isInteger(r)) return r;
    if (r >= 1 && r <= p.rounds.length) return p.rounds[r - 1].src;
    if (p.hidden && r === p.rounds.length + 1) return p.hidden.src;
    return r;
  }

  /**
   * The plan entry of round r (hp / atk: its stat multipliers), null without a plan or outside it.
   * @param {number} r
   */
  _planRound(r) {
    const p = this.plan;
    if (!p) return null;
    if (r >= 1 && r <= p.rounds.length) return p.rounds[r - 1];
    return p.hidden && r === p.rounds.length + 1 ? p.hidden : null;
  }

  /**
   * Leader HP pool multiplier: 1 (the official pool, no tuning layer), or a custom 规则 match's leader HP percent ÷ 100
   * (its 敌方领袖 生命值 — on the shared pool, the only HP a leader has). Read by both pool sizes (finalAssault.bossPoolHp,
   * bossPoolHp below).
   * @param {string | null} bossId
   */
  bossHpMul(bossId) { // eslint-disable-line no-unused-vars
    const hp = this.custom?.leaders?.hp;
    return Number.isFinite(hp) && hp !== 100 ? /** @type {number} */ (hp) / 100 : 1;
  }

  /**
   * Shared leader HP pool (DESIGN §20.10, §25.13.4): ONE pool for every boss field of the match (official tip "最终攻势中，
   * 所有人将一起对敌方领袖造成伤害"; the mirrored copies of a pair field share it — notice 5114 "两侧的敌方领袖共享生命值
   * （敌方领袖的总生命值不变）", which is about those copies). Size = bloodPoint[difficulty] × bossPoolShare: the table value
   * per player alive when the fight starts (the owner's decision of 2026-10-06, PR #209; it replaces the fixed pool of
   * 「保持固定血量」, which config bossHpScale restores — bossPoolShareOf); `aliveCount` omitted ⇒ a full team. Leaders are
   * never scaled by enemyScale ("领袖单位于服务器的生命值加成不受上述加成影响").
   * @param {string} bossId
   * @param {number} [aliveCount] alive players at the Final Assault / Hidden Core start (co-op)
   * @returns {number}
   */
  bossPoolHp(bossId, aliveCount) {
    const boss = this.boss(bossId);
    let base = bossBloodPoint(boss, this.modeId, this.difficulty);
    if (base == null) base = 500000;
    return Math.max(1, Math.round(base * this.bossPoolShare(aliveCount) * this.bossHpMul(bossId)));
  }

  /**
   * Multiplier of bloodPoint for the leader pool (see bossPoolHp; the rule and the config keys: bossPoolShareOf).
   * @param {number} [aliveCount]
   */
  bossPoolShare(aliveCount) {
    const full = this.large ? Math.round(this.largeAt(MAX_SEATS, posIntOr(this.large.aliveFull, LARGE_SEATS))) : null;
    const modeScale = full ? { ...(this.mode.bossHpScale || {}), aliveFull: full } : this.mode.bossHpScale;
    return bossPoolShareOf(modeScale, this.config.bossHpScale, this.isSolo, aliveCount);
  }

  /** config.titles with the tuning overrides (stat / rule per title id) merged in. */
  get titles() {
    const list = /** @type {Record<string, unknown>[]} */ (Array.isArray(this.config.titles) ? this.config.titles : []);
    const ov = this.tuning.titles && typeof this.tuning.titles === 'object' ? this.tuning.titles : {};
    return list.map((t) => {
      if (!t || typeof t.id !== 'string' || !Object.hasOwn(ov, t.id) || !ov[t.id] || typeof ov[t.id] !== 'object') return t;
      const o = ov[t.id];
      const out = { ...t };
      if (typeof o.stat === 'string') out.stat = o.stat;
      if (o.rule === 'max' || o.rule === 'min') out.rule = o.rule;
      return out;
    });
  }

  // ---- ids ------------------------------------------------------------------------------------------

  /** @param {unknown} id */
  chess(id) { return own(this._chess, id); }
  /** @param {unknown} id */
  item(id) { return own(this._items, id); }
  /** @param {unknown} id */
  bond(id) { return own(this._bonds, id); }
  /** @param {unknown} id */
  band(id) { return own(this.raw.bands, id); }
  /** @param {unknown} id */
  garrison(id) { return own(this.raw.garrisons, id); }
  /** @param {unknown} id */
  effect(id) { return own(this.raw.effects, id); }
  /** @param {unknown} key */
  enemy(key) { return own(this.raw.enemies, key); }
  /** @param {unknown} id */
  wave(id) { return own(this.raw.waves, id); }
  /** @param {unknown} id */
  stage(id) { return own(this.raw.stages, id); }
  /** @param {unknown} id */
  boss(id) { return own(this.raw.bosses, id); }
  /** @param {unknown} id */
  token(id) { return own(this.raw.tokens, id); }
  get choices() { return this.raw.choices && typeof this.raw.choices === 'object' ? this.raw.choices : {}; }
  get factions() { return this.raw.factions && typeof this.raw.factions === 'object' ? this.raw.factions : {}; }

  /**
   * The 补位 record of chess `id` (normal or elite; DATA.md §18): shared/standIn.js standInRecord over data/backups.json
   * — the chess's identity (ids, tier, bonds, 特质, price, merge) with its official stand-in's body (stats, range, skills
   * with the backup skill as the default, talents, module, art, `standInFor`). Null for a PRESET / 自选 chess, an unknown
   * id or data without backups.json. Memoized (frozen records).
   * @param {string} id
   * @returns {import('../../shared/loadoutRecord.js').ChessRecord | null}
   */
  standIn(id) {
    if (typeof id !== 'string') return null;
    if (this._standIns.has(id)) return this._standIns.get(id);
    const c = this.chess(id);
    const backups = this.raw.backups && typeof this.raw.backups === 'object' ? this.raw.backups : null;
    let rec;
    try { rec = c && backups ? standInRecord(c, backups) : null; } catch { rec = null; }
    if (rec) Object.freeze(rec);
    this._standIns.set(id, rec);
    return rec;
  }

  /**
   * Normal (base) chess id of a chess id (golden → base).
   * @param {string} id
   */
  baseIdOf(id) {
    const c = this.chess(id);
    if (!c) return typeof id === 'string' ? id.replace(/_b$/, '_a') : null;
    return c.baseId || (c.isGolden ? id.replace(/_b$/, '_a') : id);
  }

  /** @param {string} id */
  goldenIdOf(id) {
    const c = this.chess(this.baseIdOf(id));
    if (c && c.goldenId && this.chess(c.goldenId)) return c.goldenId;
    const alt = typeof id === 'string' ? id.replace(/_a$/, '_b') : null;
    return alt && this.chess(alt) ? alt : null;
  }

  /** @param {string | null | undefined} id */
  isGolden(id) { const c = this.chess(id) || this.item(id); return !!(c && c.isGolden); }

  /** @param {string} id */
  tierOf(id) {
    const c = this.chess(id) || this.item(id);
    return c && Number.isInteger(c.tier) ? c.tier : 1;
  }

  // ---- economy --------------------------------------------------------------------------------------

  /** @param {number} r */
  income(r) {
    const round = this.srcRound(r);
    const arr = Array.isArray(this.economy.income) ? this.economy.income : DEFAULTS.income;
    const cap = numOr(this.economy.incomeCap, DEFAULTS.incomeCap);
    const v = arr[round];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    return Math.max(0, Math.min(cap, 3 + round));
  }

  /** @param {string} id */
  chessPrice(id) {
    const c = this.chess(id);
    if (c && Number.isFinite(c.price) && c.price >= 0) return c.price;
    const tier = this.tierOf(id);
    const row = this.economy.chessPrice && this.economy.chessPrice[tier];
    const golden = c && c.isGolden;
    if (row && typeof row === 'object') return numOr(golden ? row.golden : row.normal, DEFAULTS.chessPrice[tier] ?? 3);
    return DEFAULTS.chessPrice[tier] ?? 3;
  }

  /**
   * 规程's 温蒂 「售出价格为3」 (精锐 6): the price a SERVER_SELF_SELL_PRICE_FIXED 特质 of the record fixes, or null. It is the
   * chess's own price (sellPrice) — an elite merged from two copies (no 获得时 run: PlayerState._mergeChess) sells at it
   * too — and the price 巫恋's swap leaves (bands/meta.js first_sell_char_chess_exchange_char_chess_in_shop).
   * @param {string} id
   */
  fixedSellPrice(id) {
    const c = this.chess(id);
    for (const gid of (c && Array.isArray(c.garrisonIds) ? c.garrisonIds : [])) {
      const g = this.garrison(gid);
      if (g && g.effectKey === 'SERVER_SELF_SELL_PRICE_FIXED' && Number.isFinite(g.bb?.price) && g.bb.price >= 0) return g.bb.price;
    }
    return null;
  }

  /** @param {string} id */
  sellPrice(id) {
    const c = this.chess(id);
    const fixed = this.fixedSellPrice(id);
    if (fixed != null) return fixed;
    if (c && Number.isFinite(c.sellPrice) && c.sellPrice >= 0) return c.sellPrice;
    const tier = this.tierOf(id);
    const row = this.economy.chessSell && this.economy.chessSell[tier];
    if (row && typeof row === 'object') return numOr(c && c.isGolden ? row.golden : row.normal, DEFAULTS.sellPrice);
    return DEFAULTS.sellPrice;
  }

  /** @param {string} id */
  itemPrice(id) {
    const it = this.item(id);
    return it && Number.isFinite(it.price) && it.price >= 0 ? it.price : 2;
  }

  get refreshPrice() { return Math.max(0, numOr(this.economy.refreshPrice, DEFAULTS.refreshPrice)); }
  get benchSize() { return posIntOr(this.economy.benchSize, DEFAULTS.benchSize); }
  get tempSize() { return posIntOr(this.economy.tempSize, DEFAULTS.tempSize); }
  /**
   * 规程's 装备区 (constData maxDeckEquipmentChessCnt 5): equipment and 秘术 wait in a zone of their own on the five tiles
   * that were the 临时整备区 (the season's map files mark them tile_acbag, the hand tile_achand), the hand keeps the
   * operators and summon stacks. 0 = the zone does not exist (the shared hand of 卫戍协议：盟约). Capped at the five tiles.
   */
  get equipHandSize() { const n = this.economy.equipHandSize; return Number.isInteger(n) && n > 0 ? Math.min(n, this.tempSize) : 0; }
  get deployCap() { return posIntOr(this.economy.deployCap, DEFAULTS.deployCap); }
  get equipPerChess() { return posIntOr(this.economy.equipPerChess, DEFAULTS.equipPerChess); }
  /**
   * Equipment slots of chess `id`: the season record's `equipSlots` (规程 equipSlotNum — 机械 acrbot 4 / elite 6), else equipPerChess.
   * @param {string} id
   */
  equipSlotsOf(id) { const n = this.chess(id)?.equipSlots; return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : this.equipPerChess; }
  /**
   * 规程's 组合 partner and result of item `id` (items.json fuseWith / fuseResult), or null.
   * @param {string} id
   */
  fusionOf(id) { const r = this.item(id); return r && r.fuseWith && r.fuseResult && this.item(r.fuseWith) && this.item(r.fuseResult) ? { with: r.fuseWith, result: r.fuseResult } : null; }
  get maxArtsPerRound() { return posIntOr(this.economy.maxArtsPerRound, DEFAULTS.maxArtsPerRound); }
  get goldenCopies() { return posIntOr(this.economy.goldenCopies, DEFAULTS.goldenCopies); }
  get itemMergeCount() { return posIntOr(this.economy.itemMergeCount, DEFAULTS.itemMergeCount); }
  get leftoverKeptBands() { return Array.isArray(this.economy.leftoverFundsKeptByBands) ? this.economy.leftoverFundsKeptByBands : DEFAULTS.leftoverFundsKeptByBands; }
  get defaultBandId() { return typeof this.economy.defaultBandId === 'string' ? this.economy.defaultBandId : DEFAULTS.defaultBandId; }
  get defaultStartLp() { return posIntOr(this.economy.defaultStartLp, DEFAULTS.defaultStartLp); }

  rewardOffer() {
    const r = this.economy.rewardOffer && typeof this.economy.rewardOffer === 'object' ? this.economy.rewardOffer : {};
    return {
      count: posIntOr(r.count, DEFAULTS.rewardOffer.count),
      tierOffset: Number.isInteger(r.tierOffset) ? r.tierOffset : DEFAULTS.rewardOffer.tierOffset,
      maxTier: posIntOr(r.maxTier, DEFAULTS.rewardOffer.maxTier),
      price: Math.max(0, numOr(r.price, 0)),
    };
  }

  /**
   * Copies of a base chess in the shared pool: the 独立模拟 (solo) table `economy.poolCopies[tier]` with its per-operator
   * `poolCopiesOverrides`; a 同盟模拟 (co-op) match has `coopPoolMultiplier` (2) × that, the exceptions included,
   * whatever the team size (路标月报#2, bilibili BV1eLXXBqEgF; GitHub #430, upstream PR #477 / 6bfc0827). A 自选 slot's
   * private stock (player/diy.js) doubles with it (16 / 10), so a 自选 piece keeps its solo share of a co-op roll
   * [ASSUMED: the measured table has no 自选 row; maintainer decision 2026-10-11, as upstream PR #477]. A config
   * without the multiplier keeps the solo table. An 8-player match: config.eightPlayer.coopPoolMultiplier (4) at 8
   * players, linear from the 4-player 2 (largeAt: 5 → × 2.5, 6 → × 3, 7 → × 3.5), rounded per operator.
   * A custom ruleset's pool.chess percent scales the result (shared/ruleset.js customPoolCount), the 自选 stock with it.
   * @param {string} baseId
   */
  poolCopies(baseId) {
    const ov = this.economy.poolCopiesOverrides;
    const tier = this.tierOf(baseId);
    const pc = this.economy.poolCopies;
    const v = ov && typeof ov === 'object' && Number.isInteger(ov[baseId]) && ov[baseId] >= 0 ? ov[baseId] : (pc && typeof pc === 'object' ? pc[tier] : undefined);
    const base = Number.isInteger(v) && v >= 0 ? v : (DEFAULTS.poolCopies[tier] ?? 10);
    const coop = posIntOr(this.economy.coopPoolMultiplier, 1);
    const multiplier = this.isSolo ? 1 : this.large ? this.largeAt(coop, posIntOr(this.large.coopPoolMultiplier, coop)) : coop;
    return customPoolCount(Math.round(base * multiplier), this.custom?.pool?.chess);
  }

  /**
   * Shared stock of a shop item (pool.js SharedItemPool, upstream 6bfc0827): `economy.itemPoolCopiesOverrides[base]`,
   * else `economy.itemPoolCopies[tier]` — the 路标月报#2 table (bilibili BV1eLXXBqEgF, ~1:30), the same in solo and co-op.
   * Null (uncapped) for an item that is not a shop item (effect-only special equipment) or a config without the table.
   * An 8-player match: × config.eightPlayer.itemPoolMultiplier (2) at 8 players, linear from × 1 at 4 (largeAt), rounded.
   * A custom ruleset's pool.items percent scales the result.
   * @param {string} id
   */
  itemPoolCopies(id) {
    const base = this.baseIdOf(id), rec = this.item(base);
    if (!rec || !isShopItem(rec)) return null;
    const count = this.economy.itemPoolCopiesOverrides?.[base] ?? this.economy.itemPoolCopies?.[rec.tier];
    const multiplier = this.large ? this.largeAt(1, posIntOr(this.large.itemPoolMultiplier, 1)) : 1;
    return Number.isInteger(count) && count >= 0 ? customPoolCount(Math.round(count * multiplier), this.custom?.pool?.items) : null;
  }

  /**
   * Whether `itemId` is one of the four operators' trait-fixed equipment (the SERVER_GAIN_EQUIP targets: 盟约之币 /
   * 迅捷作战粮 / 谢拉格不融冰 / 变形同构体 — and their goldens). 路标月报#2 item 7: what 诗怀雅 / 卡涅利安 / 耶拉 /
   * 缪尔赛思 can obtain has no cap — their white-give sources (the trait itself, and a strategy granting the same
   * fixed item) run outside the shared item stock, while shop purchases and every other acquisition stay bound.
   * @param {string} id
   */
  isTraitFixedItem(id) {
    if (!this._traitFixed) {
      this._traitFixed = new Set();
      for (const g of Object.values(this.raw.garrisons || {})) {
        if (g?.effectKey === 'SERVER_GAIN_EQUIP' && this.item(g.bbStr?.chess)) {
          const golden = this.item(g.bbStr.chess)?.goldenId;
          this._traitFixed.add(g.bbStr.chess);
          if (golden) this._traitFixed.add(golden);
        }
      }
    }
    return this._traitFixed.has(id) || this._traitFixed.has(this.baseIdOf(id));
  }

  /**
   * Copies needed to merge (0 = never merges: golden chess).
   * @param {string} id
   */
  mergeCount(id) {
    const c = this.chess(id);
    if (!c || c.isGolden) return 0;
    if (Number.isInteger(c.upgradeNum) && c.upgradeNum > 0) return c.upgradeNum;
    const ov = this.economy.mergeCountOverrides;
    if (ov && Number.isInteger(ov[id])) return ov[id];
    return posIntOr(this.economy.mergeCount, DEFAULTS.mergeCount);
  }

  // ---- mode -----------------------------------------------------------------------------------------

  get isSolo() { return this.mode.type === 'SINGLE' || /^mode_single_/.test(this.modeId || ''); }
  get difficulty() { return this.mode.difficulty || (this.modeId ? /** @type {string} */ (String(this.modeId).split('_').pop()).toUpperCase() : 'NORMAL'); }
  /** the mode's own round numbers (the custom plan replaces them: lastRound …) */
  get _lastRound0() {
    if (Number.isInteger(this.mode.lastRound) && this.mode.lastRound > 0) return this.mode.lastRound;
    return this.modeId === 'mode_single_funny' ? 9 : 14;
  }
  get _hiddenRound0() { return Number.isInteger(this.mode.hiddenRound) && this.mode.hiddenRound > 0 ? this.mode.hiddenRound : null; }
  get _spRounds0() { return Array.isArray(this.mode.spRounds) ? this.mode.spRounds.filter((/** @type {unknown} */ n) => Number.isInteger(n)) : []; }
  get lastRound() { return this.plan ? this.plan.rounds.length : this._lastRound0; }
  get bossRound() {
    if (this.plan) return this.plan.rounds.length;
    return Number.isInteger(this.mode.bossRound) && this.mode.bossRound > 0 ? this.mode.bossRound : this.lastRound;
  }
  get hiddenRound() { return this.plan ? (this.plan.hidden ? this.plan.rounds.length + 1 : null) : this._hiddenRound0; }
  get maxShopLevel() { return posIntOr(this.mode.maxShopLevel, DEFAULTS.maxShopLevel); }

  /**
   * The config entry of round r (its source round's: srcRound). In a match that borrows leaders from another season
   * (shared/seasonBorrow.js, `borrowed` bosses.json records) a 最终攻势 / 隐秘核心 round's `bossTemplates` also names each
   * borrowed leader of its group with its own season's template of it (borrowedTemplate).
   * @param {number} r
   */
  roundCfg(r) {
    const rounds = this.mode.rounds;
    const k = String(this.srcRound(r));
    const rc = rounds && typeof rounds === 'object' && rounds[k] && typeof rounds[k] === 'object' ? rounds[k] : null;
    const lent = this._lentBosses();
    if (!rc || !lent.length || !rc.bossTemplates || typeof rc.bossTemplates !== 'object') return rc;
    const memo = (this._lentRounds ??= new Map());
    const hit = memo.get(k);
    if (hit) return hit;
    const add = lent.filter((b) => !!b.hidden === !!rc.isHidden && !Object.hasOwn(rc.bossTemplates, b.bossId))
      .map((b) => [b.bossId, this.borrowedTemplate(b)]).filter(([, t]) => t);
    const out = add.length ? { ...rc, bossTemplates: { ...rc.bossTemplates, ...Object.fromEntries(add) } } : rc;
    memo.set(k, out);
    return out;
  }

  /**
   * The leaders this match borrows from other seasons (bosses.json records marked `borrowed`: shared/seasonBorrow.js),
   * in id order; none in a match that borrows none.
   * @returns {{ bossId: string, hidden?: unknown, templates?: unknown }[]}
   */
  _lentBosses() {
    if (!this._lent) {
      const all = this.raw.bosses && typeof this.raw.bosses === 'object' ? Object.values(this.raw.bosses) : [];
      this._lent = all.filter((b) => b && typeof b === 'object' && b.borrowed && typeof b.bossId === 'string').sort((a, b) => (a.bossId < b.bossId ? -1 : 1));
    }
    return this._lent;
  }

  /**
   * A borrowed leader's wave template in this match: its season's template for this mode (bosses.json `templates`), else
   * — a mode its season lacks (the 规程等级 modes, 盟约's single difficulties) — the first one it has; buildBossWave
   * picks its `_s` (solo) or pair form either way [ASSUMED·자료 없음: the official game never mixed two seasons].
   * @param {{ templates?: unknown }} boss @returns {string | null}
   */
  borrowedTemplate(boss) {
    const tpl = boss.templates && typeof boss.templates === 'object' ? /** @type {Record<string, { template?: unknown } | null>} */ (boss.templates) : {};
    const ids = [tpl[this.modeId], ...Object.values(tpl)].map((x) => x?.template).filter((t) => typeof t === 'string' && this.wave(t));
    return /** @type {string | undefined} */ (ids[0]) ?? null;
  }

  spRounds() {
    if (this.plan) return this.plan.rounds.flatMap((x, i) => (x.kind === 'sp' ? [i + 1] : []));
    return this._spRounds0;
  }

  upgradePrices() {
    const arr = Array.isArray(this.mode.upgradePrices) ? this.mode.upgradePrices : DEFAULTS.upgradePrices;
    return arr.map((/** @type {unknown} */ v) => Math.max(0, numOr(v, 99)));
  }

  /**
   * Base price to go from `level` to level+1 (null at max).
   * @param {number} level
   */
  upgradeBase(level) {
    if (level >= this.maxShopLevel) return null;
    const arr = this.upgradePrices();
    return arr[level - 1] ?? 99;
  }

  /** @param {number} level */
  shopSlots(level) {
    const s = this.mode.shopSlots && this.mode.shopSlots[String(level)];
    const d = DEFAULTS.shopSlots[level] || DEFAULTS.shopSlots[6];
    if (!s || typeof s !== 'object') return { ...d };
    const chess = Number.isInteger(s.chess) && s.chess >= 0 ? s.chess : d.chess;
    const item = Number.isInteger(s.item) && s.item >= 0 ? s.item : d.item;
    return { chess: Math.min(chess, 8), item: Math.min(item, 4) };
  }

  /**
   * Real-second prep timer for round r (null = untimed); a custom co-op prep length applies (customPrepSeconds).
   * @param {number} r
   */
  prepTime(r) {
    const rc = this.roundCfg(r);
    const v = !rc ? (this.isSolo ? null : 90) : typeof rc.prepTime === 'number' && Number.isFinite(rc.prepTime) && rc.prepTime > 0 ? rc.prepTime : null;
    return this.custom && !this.isSolo && v != null ? customPrepSeconds(this.custom.flow, v) : v;
  }

  /**
   * The round level's `maxPlayTime` (config rounds[r].combatTimeLimit) as data gives it — REAL seconds.
   * @param {number} r
   */
  combatTimeLimitReal(r) {
    const rc = this.roundCfg(r);
    const v = rc ? rc.combatTimeLimit : undefined;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    const m = this.mode.combatTimeLimit && this.mode.combatTimeLimit[String(this.srcRound(r))];
    return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : 60;
  }

  /**
   * Combat time limit of round r in GAME seconds (what the Battle and 联防 use): maxPlayTime × the forced battle speed
   * (config.combatTimeScale, default COMBAT_TIME_SCALE 2). `maxPlayTime` counts real seconds of the 2× battle: read
   * as game seconds, the rounds' own spawn schedules would not fit (R2 spawns its last flyer at 43 s of a 45 s limit,
   * R3 at 62 s of 55 s — enemies that can never be killed, or never spawn), while × 2 every limit is ≈ the last spawn +
   * one flyer crossing (R2 43 + 44 ≈ 90, R3 62 + 44 ≈ 110, R5 38 + 67 ≈ 110). docs/BALANCE.md §2.1.
   * @param {number} r
   */
  combatTimeLimit(r) {
    return this.combatTimeLimitReal(r) * this.combatTimeScale;
  }

  /** Game seconds per real second of a battle (config.combatTimeScale, default COMBAT_TIME_SCALE 2). */
  get combatTimeScale() {
    const k = numOr(this.config.combatTimeScale, COMBAT_TIME_SCALE);
    return k > 0 ? k : COMBAT_TIME_SCALE;
  }

  /**
   * The boss round level's `maxPlayTime` (config rounds[r].levelMaxPlayTime, 120) in REAL seconds — the countdown of
   * the Final Assault / Hidden Core. It is not a hard stop there ("计时结束后战斗仍然会继续", research 01 §10); null
   * when the data has none.
   * @param {number} r
   */
  bossLevelTime(r) {
    const rc = this.roundCfg(r);
    const v = rc ? rc.levelMaxPlayTime : undefined;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  }

  /**
   * Official enemy multipliers of round r (config enemyScale: the PRTS table + 终极 speed ×1.15 from R3). `supplyHpMul`
   * (only when ≠ 1: co-op 终极 R5–R15) = the share of hpMul from 补给线 / 补给线II (config `supplyHp`), effects whose
   * `enemy_exclude` leaves out the 14 器物 hit-count keys — they take hpMul / supplyHpMul (archetypes.js `times`).
   * A custom round plan's round reads its source round's entry with the plan's HP / ATK (an added round's rise on).
   * @param {number} r
   */
  baseEnemyScale(r) {
    const e = this.mode.enemyScale && this.mode.enemyScale[String(this.srcRound(r))];
    if (!e || typeof e !== 'object') return { hpMul: 1, atkMul: 1, speedMul: 1 };
    const supply = numOr(e.supplyHp, 1);
    const pr = this._planRound(r);
    return {
      hpMul: Math.max(0.01, numOr(pr ? pr.hp : e.hp, 1)),
      atkMul: Math.max(0, numOr(pr ? pr.atk : e.atk, 1)),
      speedMul: Math.max(0.01, numOr(e.speed, 1)),
      ...(supply > 0 && supply !== 1 ? { supplyHpMul: supply } : {}),
    };
  }

  /**
   * Enemy multipliers of round r for every enemy but the leaders (their parts, escorts and the 特训 enemies included):
   * the official table (baseEnemyScale) — under a custom 规则 match on its enemy steps and times its 敌人 percents
   * (customScale). The leaders take leaderScale.
   * @param {number} r
   */
  enemyScale(r) {
    const base = this.baseEnemyScale(r);
    const e = this.custom?.enemies;
    return e ? this._customScale(r, base, e) : base;
  }

  /**
   * Multipliers of the leaders of round r (the 最终攻势 / 隐秘核心 leaders: their ATK / speed / DEF / RES — HP is the shared
   * pool, bossHpMul — and their mid-fight summons, content/bosses.js summonMods, which take the HP too): the round's
   * official ones (baseEnemyScale), under a custom 规则 match on its enemy steps and times its 敌方领袖 percents (the
   * 敌人 percents never reach them; their speed keeps the round's).
   * @param {number} r
   */
  leaderScale(r) {
    const base = this.baseEnemyScale(r);
    const c = this.custom;
    return c ? this._customScale(r, base, { ...c.leaders, speed: 100, stepHp: c.enemies?.stepHp, stepAtk: c.enemies?.stepAtk }) : base;
  }

  /**
   * The official stat steps round r takes (config enemyScale kHp / kAtk; a custom round plan's own).
   * @param {number} r
   */
  _steps(r) {
    const pr = this._planRound(r);
    const e = this.mode.enemyScale && this.mode.enemyScale[String(this.srcRound(r))];
    return { kHp: numOr(pr ? pr.kHp : e?.kHp, 0), kAtk: numOr(pr ? pr.kAtk : e?.kAtk, 0) };
  }

  /**
   * The custom form of a round's multipliers `base`: HP / ATK with each official step after round 1's at the setting's
   * multiplier (shared/ruleset.js stepScale; null = the official one), then × the
   * percents; `defMul` / `resMul` only when not 100 % (a spawn reads a missing one as 1; RES stays ≤ 100 in the unit's
   * stats, units.js). `supplyHpMul` (the 补给线 share of hpMul) is kept as the official ratio.
   * @param {number} r @param {ReturnType<GameData['baseEnemyScale']>} base
   * @param {{ hp?: number, atk?: number, def?: number, res?: number, speed?: number, stepHp?: number|null, stepAtk?: number|null }} pct
   */
  _customScale(r, base, pct) {
    /** @param {number | undefined} v */
    const p = (v) => (Number.isFinite(v) ? /** @type {number} */ (v) / 100 : 1);
    let { hpMul, atkMul } = base;
    if ((Number.isFinite(pct.stepHp) || Number.isFinite(pct.stepAtk)) && r !== 1) {
      const k = this._steps(r), k1 = this._steps(1);
      const oHp = officialStep(this.mode, 'hp'), oAtk = officialStep(this.mode, 'atk');
      hpMul = stepScale(hpMul, k.kHp, k1.kHp, Number.isFinite(pct.stepHp) ? /** @type {number} */ (pct.stepHp) / 100 : oHp, oHp);
      atkMul = stepScale(atkMul, k.kAtk, k1.kAtk, Number.isFinite(pct.stepAtk) ? /** @type {number} */ (pct.stepAtk) / 100 : oAtk, oAtk);
    }
    /** @type {{ hpMul: number, atkMul: number, speedMul: number, supplyHpMul?: number, defMul?: number, resMul?: number }} */
    const out = { ...base, hpMul: hpMul * p(pct.hp), atkMul: atkMul * p(pct.atk), speedMul: base.speedMul * p(pct.speed) };
    if (p(pct.def) !== 1) out.defMul = p(pct.def);
    if (p(pct.res) !== 1) out.resMul = p(pct.res);
    return out;
  }

  /** The per-bond layer cap of the match: BOND_LAYER_CAP (999), none (Infinity) under the custom 「解除盟约层数上限」. */
  get layerCap() {
    return this.custom?.bonds?.noLayerCap ? Infinity : BOND_LAYER_CAP;
  }

  /**
   * 确定自选编队 (规程, and 盟约 by the remake's own rule — tools/build-data.mjs extendDefaultSeasonDiy, maintainer decision
   * 2026-11-19): the start step after the strategy draft where each player picks, from its 自选编队 (up to 12 slots,
   * six per tier), the 自选 operators this match fields — at most `perTier[tier]` of each tier (activity constData
   * diyCharLimitForLevels { 5: 2, 6: 2 }) — in `seconds` (autoChessData.enterStepList CUSTOM_CHECK, 30 s). Null when the
   * season's data has no such step (then the picks are the match's as they are). server/match/match/diyChoose.js.
   * @returns {{ seconds: number, perTier: Record<number, number> } | null}
   */
  get diyChoose() {
    const lim = this.economy.diyCharLimitForLevels;
    /** @type {{ step?: unknown, time?: unknown }[]} */
    const steps = Array.isArray(this.config.timers?.enterSteps) ? this.config.timers.enterSteps : [];
    const step = steps.find((x) => x && x.step === 'CUSTOM_CHECK');
    if (!lim || typeof lim !== 'object' || !step) return null;
    /** @type {Record<number, number>} */
    const perTier = {};
    for (const [k, v] of Object.entries(lim)) if (Number.isInteger(Number(k)) && Number.isInteger(v) && v >= 0) perTier[Number(k)] = v;
    return { seconds: posIntOr(step.time, 30), perTier };
  }

  /** @param {string} key */
  timer(key) {
    const t = this.config.timers && this.config.timers[key];
    return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : DEFAULTS.timers[key] ?? 10;
  }

  /** The most LP a player loses in one round (config 10); Infinity under the custom 「解除上限」 (co-op only). */
  get lpCapPerRound() {
    if (this.custom?.flow?.lpCapOff && !this.isSolo) return Infinity;
    return posIntOr(this.config.lpCapPerRound, DEFAULTS.lpCapPerRound);
  }
  /** One 目标生命值 for the alliance in every round (custom 「所有回合共享」, co-op only; the official merges from 最终攻势). */
  get lpShared() { return !!this.custom?.flow?.lpShared && !this.isSolo; }
  /**
   * Boss overtime (`bossTurnHpReduceTime` 150 / 1 LP per second): a server turn timer of turnInfoDataDict like
   * prepPhaseTime, so REAL seconds on the same clock as the boss level's 120 s maxPlayTime (combat limits are real
   * seconds, docs/BALANCE.md §2.1) — the level countdown runs out first, the battle continues, and the merged team LP
   * drains 1 per real second from the 150 s mark (research 01 §10, 06 §11.7). Read as game seconds the drain would
   * start at 75 real s (45 s before the countdown ends) at 2 LP per real second.
   */
  get bossOvertimeAfterReal() { return Math.max(0, numOr(this.config.bossOvertimeAfter, DEFAULTS.bossOvertimeAfter)); }
  /** Team LP drained per REAL second of overtime (an 8-player match: config.eightPlayer's 2 at 8 players, largeAt rounded). */
  get bossOvertimeDrainReal() {
    const v = Math.max(0, numOr(this.config.bossOvertimeDrainPerSec, DEFAULTS.bossOvertimeDrainPerSec));
    return this.large ? Math.max(0, Math.round(this.largeAt(v, numOr(this.large.bossOvertimeDrainPerSec, v)))) : v;
  }
  /** Overtime start in GAME seconds of a boss field clock (150 real s × the forced 2× = 300). */
  get bossOvertimeAfter() { return this.bossOvertimeAfterReal * this.combatTimeScale; }
  /** Team LP drained per GAME second of overtime (1 per real second = 0.5 per game second). */
  get bossOvertimeDrain() { return this.bossOvertimeDrainReal / this.combatTimeScale; }
  /**
   * REAL second of boss round `r` at which the overtime drain starts: the boss level's countdown (levelMaxPlayTime, 120)
   * — local patch (LOCAL-PATCH.md 「보스전 초과 시간」, maintainer decision 2026-10-09 from official footage: the countdown runs
   * from 120 and the team LP drops as soon as it ends, no grace; PRTS 「计时结束后…每超时1秒扣除1目标生命值」). The data's
   * bossTurnHpReduceTime (150) is the overtime's length (bossOvertimeWindowReal, official client); as a start it is used only
   * for a round without a level time.
   * @param {number} r
   */
  bossOvertimeStartReal(r) { return this.bossLevelTime(r) ?? this.bossOvertimeAfterReal; }
  /**
   * Length in REAL seconds of boss round `r`'s overtime: the round's bossTurnHpReduceTime (config rounds[r].bossOvertimeAfter,
   * 150; else bossOvertimeAfterReal). The client's AutoChessBattleUICountdownViewModel._GetBossBattleTimeInfo:
   * the countdown ends at the server's forced end of the boss state − bossTurnHpReduceTime — so the server ends the boss
   * battle that long after the countdown runs out, and the drain takes at most this many seconds' worth.
   * @param {number} r
   */
  bossOvertimeWindowReal(r) {
    const rc = this.roundCfg(r);
    const v = rc ? rc.bossOvertimeAfter : undefined;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : this.bossOvertimeAfterReal;
  }
  /**
   * REAL second of boss round `r` at which the boss battle is force-ended: the drain start + the overtime window.
   * @param {number} r
   */
  bossForcedEndReal(r) { return this.bossOvertimeStartReal(r) + this.bossOvertimeWindowReal(r); }
  /**
   * Team LP the overtime drain has taken when a boss field clock reads `gt` game seconds: bossOvertimeDrainReal per
   * whole REAL second past `startReal` (bossOvertimeStartReal; the first point 1 real s after it), counting at most
   * `windowReal` seconds (bossOvertimeWindowReal: the battle is force-ended then).
   * @param {number} gt
   */
  bossOvertimeDue(gt, startReal = this.bossOvertimeAfterReal, windowReal = Infinity) {
    const over = Math.min((Number(gt) || 0) / this.combatTimeScale - startReal, windowReal);
    return over >= 1 ? Math.floor(over) * this.bossOvertimeDrainReal : 0;
  }
  get dp() {
    const d = this.config.dp && typeof this.config.dp === 'object' ? this.config.dp : {};
    return { dpInit: numOr(d.init, 10), dpPerSec: numOr(d.perSec, 1), dpMax: numOr(d.max, 99) };
  }
  /**
   * 联防: `maxHelpers` (an 8-player match: config.eightPlayer.unite's 4 at 8 players, largeAt rounded down — 5 → 2,
   * 6–7 → 3), `templates` (the escaped levels of 1 / 2
   * helpers), `wideFrom` (the helper count from which the field is a wide one, a half per helper — 3 in an 8-player
   * match, never in the others; server/sim/wideStage.js) and `wideTimePerHalf` (its time limit ÷ the round's, per half:
   * 0.5, so × 1.5 for 3 halves and × 2 for 4).
   */
  get unite() {
    const u = this.config.unite && typeof this.config.unite === 'object' ? this.config.unite : {};
    const lu = this.large?.unite && typeof this.large.unite === 'object' ? this.large.unite : null;
    const max = posIntOr(u.maxHelpers, DEFAULTS.unite.maxHelpers);
    return {
      maxHelpers: lu ? Math.max(1, Math.floor(this.largeAt(max, posIntOr(lu.maxHelpers, max)))) : max,
      templates: u.templates && typeof u.templates === 'object' ? u.templates : DEFAULTS.unite.templates,
      wideFrom: lu ? posIntOr(lu.wideFrom, Infinity) : Infinity,
      wideTimePerHalf: lu ? numOr(lu.wideTimePerHalf, 0.5) : 0.5,
    };
  }

  /**
   * 机变 cards of a co-op draft whose schedule says `cards` (6): an 8-player match draws config.eightPlayer.spDraftCards
   * (12) at 8 players, largeAt rounded (5 → 8, 6 → 9, 7 → 11).
   * @param {number} cards
   */
  spDraftCards(cards) {
    const n = Number.isInteger(cards) && cards > 0 ? cards : 6;
    return this.large ? Math.round(this.largeAt(Math.min(n, 6), posIntOr(this.large.spDraftCards, n))) : Math.min(n, 6);
  }
  /**
   * A number of the 8-player mode for this match's players (header): `v4` (the 4-player value) at 4 players or fewer,
   * `v8` (config.eightPlayer's) at 8, linear between. Callers round where the number must be whole.
   * @param {number} v4
   * @param {number} v8
   */
  largeAt(v4, v8) { return v4 + (v8 - v4) * this.largeShare; }
  /** 隐秘核心 conditions (`multi`: an 8-player match's is config.eightPlayer.hiddenCoreMulti, 2400 at 8 players, largeAt). */
  get hiddenCore() {
    const h = this.config.hiddenCore && typeof this.config.hiddenCore === 'object' ? this.config.hiddenCore : {};
    const multi = numOr(h.multi, DEFAULTS.hiddenCore.multi);
    return {
      single: numOr(h.single, DEFAULTS.hiddenCore.single),
      multi: this.large ? Math.round(this.largeAt(multi, numOr(this.large.hiddenCoreMulti, multi))) : multi,
      minTeamLpExclusive: numOr(h.minTeamLpExclusive, DEFAULTS.hiddenCore.minTeamLpExclusive),
      difficulties: Array.isArray(h.difficulties) ? h.difficulties : DEFAULTS.hiddenCore.difficulties,
    };
  }
  /**
   * The bonds drawn absent per match: config bans[difficulty] (an 8-player match: config.eightPlayer.bans[difficulty]
   * when the config has it — it has none, maintainer decision 2026-10-22), a custom count (not null) in its place,
   * within the season's range (shared/ruleset.js customBanLimits).
   * @param {string} difficulty
   */
  bans(difficulty) {
    const lb = this.large?.bans;
    const b = lb && typeof lb === 'object' && lb[difficulty] ? lb[difficulty] : this.config.bans && this.config.bans[difficulty];
    const d = DEFAULTS.bans[difficulty] || { core: 0, addon: 0 };
    const off = !b || typeof b !== 'object' ? { ...d }
      : { core: Number.isInteger(b.core) && b.core >= 0 ? b.core : d.core, addon: Number.isInteger(b.addon) && b.addon >= 0 ? b.addon : d.addon };
    const c = this.custom?.bonds;
    if (c && (Number.isInteger(c.banCore) || Number.isInteger(c.banAddon))) {
      const lim = customBanLimits(this.config);
      if (Number.isInteger(c.banCore)) off.core = Math.min(lim.core[1], /** @type {number} */ (c.banCore));
      if (Number.isInteger(c.banAddon)) off.addon = Math.min(lim.addon[1], /** @type {number} */ (c.banAddon));
    }
    return off;
  }
  /**
   * A custom bond setting: 'ban' (absent every match), 'allow' (never drawn absent), null (left to the draw).
   * @param {string} bondId
   */
  bondPick(bondId) {
    const p = this.custom?.bonds?.pick;
    return p && Object.hasOwn(p, bondId) ? p[bondId] : null;
  }

  get bandDraft() {
    const b = this.config.bandDraft && typeof this.config.bandDraft === 'object' ? this.config.bandDraft : {};
    return {
      skipsPerPlayer: Number.isInteger(b.skipsPerPlayer) && b.skipsPerPlayer >= 0 ? b.skipsPerPlayer : DEFAULTS.bandDraft.skipsPerPlayer,
      timeoutBandId: typeof b.timeoutBandId === 'string' && this.band(b.timeoutBandId) ? b.timeoutBandId : this.defaultBandId,
    };
  }

  /**
   * Bosses weights for the boss round / hidden round, the custom leader bans left out (one of the group stays). The
   * leaders a custom match borrows from other seasons (bosses.json `borrowed`, shared/seasonBorrow.js: `bosses.extra`)
   * join their group after the own ones, at the group's largest own weight — a mode without the group (no 隐秘核心) draws
   * none of them [ASSUMED·자료 없음: the official game never mixed two seasons; the borrowed battlefields' rule].
   * @returns {[string, number][]}
   */
  bossWeights(hidden = false) {
    const w = hidden ? this.mode.hiddenBossWeights : this.mode.bossWeights;
    /** @type {[string, number][]} */
    const all = w && typeof w === 'object' ? Object.entries(w).filter(([id, v]) => this.boss(id) && Number(v) > 0).map(([id, v]) => [id, Number(v)]) : [];
    const lent = this._lentBosses().filter((b) => !!b.hidden === hidden && this.wave(this.borrowedTemplate(b)));
    if (all.length && lent.length) {
      const top = Math.max(...all.map(([, v]) => v));
      for (const b of lent) if (!all.some(([id]) => id === b.bossId)) all.push([b.bossId, top]);
    }
    return keepUnbanned(all, ([id]) => id, this.custom?.bosses?.ban);
  }

  /**
   * Band usable in this mode type.
   * @param {string} bandId
   */
  bandAllowed(bandId) {
    const b = this.band(bandId);
    if (!b) return false;
    // 规程: the modes a strategy is not offered in (bands.json inactiveModeIds)
    if (Array.isArray(b.inactiveModeIds) && b.inactiveModeIds.includes(this.modeId)) return false;
    if (lpSharedBandOff(b, this.lpShared)) return false;
    const list = Array.isArray(b.modeTypeList) ? b.modeTypeList : null;
    if (!list) return true;
    return list.includes(this.isSolo ? 'SINGLE' : 'MULTI');
  }

  bandIds() {
    const bands = this.raw.bands && typeof this.raw.bands === 'object' ? this.raw.bands : {};
    return Object.keys(bands).filter((id) => this.bandAllowed(id)).sort((a, b) => numOr(bands[a].sortId, 99) - numOr(bands[b].sortId, 99) || (a < b ? -1 : 1));
  }

  /** @param {string | null} bandId */
  startLp(bandId) {
    const b = this.band(bandId);
    return b && Number.isInteger(b.totalHp) && b.totalHp > 0 ? b.totalHp : this.defaultStartLp;
  }

  /**
   * The bonds a strategy's mechanic is built around (DESIGN §21.26): bands.json `bondIds`, written at build time by
   * shared/bandBonds.js from the band's own text and blackboards (潘格尼尼 → 拉特兰, 克莱门莎 → 阿戈尔, 玛恩纳 → 卡西米尔 …) —
   * the field the strategy draft's 本局禁用 mark reads too. Known bond ids in data order; [] for an unknown band, one tied to
   * no bond (华法琳, 阿米娅 …) or data without the field. The bot never picks a strategy tied to a bond the mode switches
   * off (bot.js botPickBand).
   * @param {string | null} bandId (null: a seat before the band draft — none)
   * @returns {readonly string[]} frozen (memoised)
   */
  bandBondIds(bandId) {
    if (this._bandBonds.has(bandId)) return this._bandBonds.get(bandId);
    const listed = this.band(bandId)?.bondIds;
    const set = new Set(Array.isArray(listed) ? listed : []);
    const out = Object.freeze(this.bondIds.filter((id) => set.has(id)));
    this._bandBonds.set(bandId, out);
    return out;
  }

  /**
   * Placeable (hand) tokens a chess sends to the hand when placed on the board: [{ tokenId, count }] — its manually
   * deployable summons (tokens.json `placeable`: 医疗探机, 诅咒娃娃, 海嗣, 狼群, 流形, 爬行号·防护单元; user playtest #6)
   * that the chess makes under `loadout` ({ skillIndex } from shared/protocol.js resolveLoadout; absent ⇒ its default
   * skill): the owner variant's `sources` (`bySkill[skillIndex]` for a non-default skill) name a talent or a skill —
   * 赫默 / 巫恋 on S1 make no drone / doll. `count` = the summon's deploy limit (PRTS 卫戍协议/帮助 "根据召唤物部署数量
   * 上限（非初始持有量），发送等量召唤物至手牌区": 凯瑟琳 2 of her 3 devices).
   * @param {string} chessId @param {{ skillIndex?: number | null } | null} [loadout]
   * @returns {{ tokenId: string, count: number }[]}
   */
  placeableTokens(chessId, loadout = null) {
    const c = this.chess(chessId);
    if (!c || !Array.isArray(c.tokens)) return [];
    const out = [];
    for (const tid of c.tokens) {
      const t = this.token(tid);
      if (!t || t.kind !== 'summon' || t.placeable !== true) continue;
      const vs = t.variants && typeof t.variants === 'object' ? t.variants : {};
      const v = vs[chessId] ?? vs[String(chessId).replace(/_b$/, '_a')] ?? null;
      if (v) {
        const alt = loadout && Number.isInteger(loadout.skillIndex) && v.bySkill ? v.bySkill[/** @type {number} */ (loadout.skillIndex)] : null;
        const src = Array.isArray(alt?.sources) ? alt.sources : Array.isArray(v.sources) ? v.sources : [];
        if (!src.includes('talent') && !src.includes('skill')) continue;
      }
      const count = posIntOr(v?.stats?.deployLimit, posIntOr(t.deployLimit, 1));
      out.push({ tokenId: tid, count: Math.min(count, 9) });
    }
    return out;
  }
}
