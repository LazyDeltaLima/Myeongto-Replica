#!/usr/bin/env node
// tools/build-data.mjs — DATA BUILD PIPELINE (task F1).
//
// Reads the official zh_CN client data (Kengxxiao/ArknightsGameData) plus the research JSON in
// docs/research/ and emits compact, game-ready JSON into data/:
//   config, chess, bonds, garrisons, items, bands, effects, choices, enemies, factions, waves,
//   stages, bosses, tokens, backups (every field is documented in docs/DATA.md).
//
// Usage:  node tools/build-data.mjs [--refresh | --offline] [--out <dir>] [--cache <dir>]
//                                   [--report <file>] [--quiet] [--no-research] [--force]
//   --refresh      re-download every official file; fail on download errors even if cached
//   --offline      never download; fail when a file is missing from the cache
//   --out          output directory (default: <repo>/data)
//   --season       the season built (shared/seasons.js; default the current one)
//   --cache        official-data cache directory (default: <repo>/.cache/gamedata, a season of
//                  tools/gamedata-url.mjs SEASON_GAMEDATA: <repo>/.cache/gamedata-<season>)
//   --report       build report file (default: <repo>/.cache/build-data-report.json)
//   --no-research  ignore docs/research (research-only fields fall back to defaults; for testing)
//   --force        write the output even when integrity checks fail (default: keep the old files)
// Unknown options are errors (exit code 2).
//
// Official files are cached under <repo>/.cache/gamedata/<repo path> (e.g. excel/activity_table.json)
// and downloaded from Kengxxiao/ArknightsGameData's master when missing (tools/gamedata-url.mjs: the activity table
// is pinned to the last commit with the 卫戍协议 sections). Research files are optional inputs: when absent, research-only fields fall back to
// documented defaults and a warning is printed.
//
// Determinism: the output depends only on the input files (object keys are emitted in a stable
// order, no randomness, no timestamps). Anomalies found while joining are printed and written to
// .cache/build-data-report.json (never silently dropped); integrity errors make the exit code 1.
//
// Sections (search for "// ====="): CLI & IO · text/blackboard helpers · context loading ·
// chess · backups · tokens · bonds · garrisons · items · bands · effects · choices · enemies · factions ·
// waves · stages · bosses · config · validation · main.

import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs'; // local patch (script guard)
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url'; // local patch (script guard)
import { isDeepStrictEqual } from 'node:util';
import { Grid, DEPLOY_REFUSED_TILES, HAND_TILES } from '../server/sim/grid.js';
import { bandBondIds } from '../shared/bandBonds.js';
import { statusKey, composeUnitRecord, standInRecord, unitForm } from '../shared/standIn.js';
import { LOCAL_DIY_PICKS } from '../shared/local-diy.js';
import { FULL_RANK, atRank, stripPotential } from '../shared/potential.js';
import { isOwnSubMode, skillModeIndex, SKILL_SUB_MODES } from '../shared/skill-modes.js';
import { DEFAULT_SEASON, SEASONS, isSeasonId, seasonDataDir } from '../shared/seasons.js';
import { gamedataBase, SEASON_GAMEDATA } from './gamedata-url.mjs';
import { normalizeFlat } from './gamedata-flat.mjs';
import { composeStageLevel, isFrameLevel, levelDrift, placeWaveLevel, subLevelPath, waveOrigin } from './level-fields.mjs';

// ===== CLI & IO ==================================================================================

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH_DIR = join(ROOT, 'docs', 'research');
const USAGE = 'usage: node tools/build-data.mjs [--refresh | --offline] [--season <id>] [--out <dir>] [--cache <dir>] [--report <file>] [--quiet] [--no-research] [--force]';

/**
 * Parse the command line strictly (unknown options and missing values are errors, so a typo can
 * never silently write data somewhere unexpected).
 * @param {string[]} argv
 * @returns {{refresh:boolean, offline:boolean, quiet:boolean, noResearch:boolean, force:boolean, season:string, out:string, cache:string, report:string}}
 */
function parseArgs(argv) {
  const opts = {
    refresh: false, offline: false, quiet: false, noResearch: false, force: false, season: DEFAULT_SEASON,
    out: null, cache: null, report: join(ROOT, '.cache', 'build-data-report.json'),
  };
  const flags = { '--refresh': 'refresh', '--offline': 'offline', '--quiet': 'quiet', '--no-research': 'noResearch', '--force': 'force' };
  const dirs = { '--out': 'out', '--cache': 'cache', '--report': 'report' };
  for (let i = 0; i < argv.length; i++) {
    const [name, inline] = argv[i].includes('=') ? [argv[i].slice(0, argv[i].indexOf('=')), argv[i].slice(argv[i].indexOf('=') + 1)] : [argv[i], null];
    if (name === '--help' || name === '-h') { console.log(USAGE); process.exit(0); }
    if (flags[name] && inline === null) { opts[flags[name]] = true; continue; }
    if (name === '--season') {
      const v = inline ?? argv[++i];
      if (!isSeasonId(v)) throw new Error(`--season needs a season of shared/seasons.js (${Object.keys(SEASONS).join(', ')})\n${USAGE}`);
      opts.season = v;
      continue;
    }
    if (dirs[name]) {
      const v = inline ?? argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${name} needs a path argument\n${USAGE}`);
      opts[dirs[name]] = resolve(v);
      continue;
    }
    throw new Error(`unknown option ${argv[i]}\n${USAGE}`);
  }
  if (opts.refresh && opts.offline) throw new Error(`--refresh and --offline are mutually exclusive\n${USAGE}`);
  // another season writes into data/seasons/<id>/ and keeps only the files that differ from data/ (shared/seasons.js)
  opts.out ??= join(ROOT, 'data', seasonDataDir(opts.season));
  // a season read from another dump keeps its own cache (tools/gamedata-url.mjs SEASON_GAMEDATA)
  opts.cache ??= join(ROOT, '.cache', Object.hasOwn(SEASON_GAMEDATA, opts.season) ? `gamedata-${opts.season}` : 'gamedata');
  return opts;
}

let OPTS;
try {
  OPTS = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`build-data: ${e.message}`);
  process.exit(2);
}
const CACHE_DIR = OPTS.cache;
/** The activity id built (shared/seasons.js; default the current season). */
const SEASON = OPTS.season;

const log = (...a) => { if (!OPTS.quiet) console.log(...a); };
const warnings = [];
const warned = new Set();
/** Record a non-fatal anomaly (printed at the end and written to the build report; duplicates once). */
function warn(msg) {
  if (warned.has(msg)) return;
  warned.add(msg);
  warnings.push(msg);
}

/**
 * Make sure an official gamedata file exists in the cache; download it when missing.
 * @param {string} rel path relative to zh_CN/gamedata/ (e.g. 'excel/activity_table.json')
 * @returns {Promise<string>} absolute path of the cached file
 */
async function ensureGamedata(rel) {
  const abs = join(CACHE_DIR, rel);
  if (!OPTS.refresh && existsSync(abs)) return abs;
  if (OPTS.offline) {
    if (existsSync(abs)) return abs;
    throw new Error(`missing cached file ${rel} (offline mode)`);
  }
  await mkdir(dirname(abs), { recursive: true });
  const url = gamedataBase(rel, SEASON) + rel;
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      log(`  download ${rel}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      JSON.parse(text); // refuse to cache a truncated / invalid file
      const tmp = `${abs}.tmp-${process.pid}`;
      await writeFile(tmp, text);
      await rename(tmp, abs);
      return abs;
    } catch (e) {
      lastErr = e;
      if (attempt < 4) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  // A refresh cannot mix new downloads with an unverified cache from an earlier run.
  if (!OPTS.refresh && existsSync(abs)) { warn(`download failed for ${rel}, using stale cache: ${lastErr.message}`); return abs; }
  throw new Error(`cannot obtain ${rel}: ${lastErr && lastErr.message}`);
}

/** Load (and cache in memory) an official gamedata JSON file. */
const jsonCache = new Map();
async function loadGamedata(rel) {
  if (jsonCache.has(rel)) return jsonCache.get(rel);
  const abs = await ensureGamedata(rel);
  const raw = JSON.parse(await readFile(abs, 'utf8'));
  // the FlatBuffers-decoded dump of a SEASON_GAMEDATA season, in Kengxxiao's spelling (tools/gamedata-flat.mjs)
  const obj = SEASON_GAMEDATA[SEASON]?.flat ? normalizeFlat(rel, raw) : raw;
  jsonCache.set(rel, obj);
  return obj;
}

/** Load an optional research JSON (docs/research/<name>); returns null when absent/unreadable. */
async function loadResearch(name) {
  if (OPTS.noResearch) return null;
  const abs = join(RESEARCH_DIR, name);
  if (!existsSync(abs)) { warn(`research file ${name} not found; research-derived fields use defaults`); return null; }
  try { return JSON.parse(await readFile(abs, 'utf8')); } catch (e) { warn(`research file ${name} unreadable: ${e.message}`); return null; }
}

/** Map an official levelId ('Activities/ACT1AUTOCHESS/level_act1autochess_h07_01_S') to a template id. */
function templateIdOf(levelId) {
  const m = /level_([A-Za-z0-9_]+)$/.exec(String(levelId));
  if (!m) throw new Error(`bad levelId ${levelId}`);
  return m[1].toLowerCase();
}
/**
 * Cache-relative path of a level file. Accepts an official levelId
 * ('Activities/ACT1AUTOCHESS/level_autochess_enemy_data') or a plain stage id ('act2autochess_m01').
 */
function levelPath(idOrLevelId) {
  const s = String(idOrLevelId);
  if (s.includes('/')) {
    const dir = s.slice(0, s.lastIndexOf('/')).toLowerCase();
    return `levels/${dir}/level_${templateIdOf(s)}.json`;
  }
  const season = s.split('_')[0];
  return `levels/activities/${season}/level_${s.toLowerCase()}.json`;
}

// ===== text & blackboard helpers ================================================================

/** Replace literal "\n" escape sequences used by skill texts with real newlines. */
function unescapeNewlines(s) { return typeof s === 'string' ? s.replace(/\\n/g, '\n') : s; }

/**
 * Strip official rich-text markup (<@ba.vup>…</>, <$ba.sluggish>…</>, <color=…>) but keep literal
 * trigger labels such as <获得时> / <在场6名…>.
 */
function stripRich(s) {
  if (typeof s !== 'string') return s ?? null;
  return unescapeNewlines(s)
    .replace(/<[@$#][^<>]*>/g, '')
    .replace(/<\/>/g, '')
    .replace(/<\/?color[^<>]*>/gi, '')
    .replace(/<\/?[bi]>/gi, '');
}
/** Raw rich text with newlines normalized (markup kept). */
function richRaw(s) { return typeof s === 'string' ? unescapeNewlines(s) : s ?? null; }

/** Round away float noise; keep integers and huge values untouched. */
function cleanNum(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  if (Number.isInteger(v) || Math.abs(v) >= 1e6) return v;
  return Math.round(v * 1e6) / 1e6;
}

/**
 * Flatten an official blackboard list [{key,value,valueStr}] into { bb, bbStr }.
 * bb[key] = numeric value; bbStr[key] = valueStr when present. Duplicate keys get a _1, _2… suffix.
 */
function flattenBB(list, ctxLabel = '') {
  const bb = {};
  const bbStr = {};
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e.key !== 'string') continue;
    let k = e.key;
    const taken = (x) => Object.prototype.hasOwnProperty.call(bb, x) || Object.prototype.hasOwnProperty.call(bbStr, x);
    if (taken(k)) {
      let i = 1;
      while (taken(`${e.key}_${i}`)) i++;
      k = `${e.key}_${i}`;
      if (ctxLabel) warn(`duplicate blackboard key ${e.key} in ${ctxLabel} (stored as ${k})`);
    }
    const num = cleanNum(typeof e.value === 'number' ? e.value : Number(e.value) || 0);
    const hasStr = e.valueStr != null && e.valueStr !== '';
    // A string-valued entry carries a meaningless 0 in "value": keep it only in bbStr.
    if (!hasStr || num !== 0) bb[k] = num;
    if (hasStr) bbStr[k] = String(e.valueStr);
  }
  return { bb, bbStr };
}
/** Format a number like the client's C#-style format strings ('0%', '0.0%', '0', '0.0'). */
function formatValue(v, fmt) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
  if (!fmt) return String(cleanNum(v));
  const pct = fmt.endsWith('%');
  const core = pct ? fmt.slice(0, -1) : fmt;
  const decimals = core.includes('.') ? core.split('.')[1].length : 0;
  const x = pct ? v * 100 : v;
  const rounded = Math.sign(x) * Math.round(Math.abs(x) * 10 ** decimals + 1e-9) / 10 ** decimals;
  return rounded.toFixed(decimals) + (pct ? '%' : '');
}

/**
 * Resolve {key}, {-key}, {key:0%} placeholders against a flattened blackboard (case-insensitive).
 * Unknown keys are kept verbatim and reported.
 */
function resolvePlaceholders(text, bb, bbStr = {}, label = '') {
  if (typeof text !== 'string') return text ?? null;
  const lower = new Map();
  for (const [k, v] of Object.entries(bb || {})) lower.set(k.toLowerCase(), v);
  const lowerStr = new Map();
  for (const [k, v] of Object.entries(bbStr || {})) lowerStr.set(k.toLowerCase(), v);
  return text.replace(/\{(-?)([^{}:]+)(?::([^{}]+))?\}/g, (m, neg, key, fmt) => {
    const k = key.trim().toLowerCase();
    if (lowerStr.has(k) && (!lower.has(k) || !fmt)) return lowerStr.get(k);
    if (lower.has(k)) {
      const v = lower.get(k);
      return formatValue(neg ? -v : v, fmt);
    }
    if (label) warn(`unresolved placeholder ${m} in ${label}`);
    return m;
  });
}

/** Build the {desc, descRaw} pair for an official rich text (placeholders resolved when bb given). */
function textPair(raw, bb, bbStr, label) {
  const resolved = bb ? resolvePlaceholders(richRaw(raw), bb, bbStr, label) : richRaw(raw);
  return { desc: stripRich(resolved), descRaw: resolved };
}

/** Natural sort for ids like chess_char_1_10_a (numbers compared numerically). */
function naturalCmp(a, b) { return String(a).localeCompare(String(b), 'en', { numeric: true }); }

const PHASE_INDEX = { PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 };
const phaseIdx = (p) => (typeof p === 'number' ? p : PHASE_INDEX[p] ?? 0);

/** Does an unlock condition hold for a given phase/level at a potential rank (a candidate's `requiredPotentialRank`)? */
function unlocked(cond, phase, level, potRank = 0, reqPot = 0) {
  if ((reqPot || 0) > potRank) return false;
  if (!cond) return true;
  const p = phaseIdx(cond.phase);
  if (p < phase) return true;
  if (p > phase) return false;
  return (cond.level || 1) <= level;
}
/** Pick the best candidate (the last unlocked one) from an official candidate list, at potential rank `potRank`. */
function bestCandidate(cands, phase, level, potRank = 0) {
  let best = null;
  for (const c of cands || []) if (c && unlocked(c.unlockCondition, phase, level, potRank, c.requiredPotentialRank)) best = c;
  return best;
}

/**
 * Potential (潜能) is a per-player runtime input (0.2.2, the owner's decision of 2026-10-08: 「调配干员里自己设置吧，默认满潜
 * 满加成」; 0.2.1 baked full potential in, upstream 806a0477). Official: 调度手册 「卫戍协议中干员潜能由自身已持有干员潜能决定」 —
 * the season's chess records (activity_table charChessDataDict `status`: evolvePhase, charLevel, skillLevel, favorPoint 0,
 * equipLevel) carry no potential field; a tournament video shows 刺玫 (chess_char_1_06_a) at ATK 435 and cost 15 (her
 * E1 Lv55 413 / 17 plus 攻击力+22 and two 部署费用-1: an account at full potential). Ranks count like character_table
 * `potentialRanks` (ranks 1–5 = the 潜能 2–6 steps) and a candidate's `requiredPotentialRank`.
 * The builders take the rank from `ctx.potRank`: main() runs the chess / backups / tokens builders once per rank (0–5)
 * and keeps the FULL-potential build (潜能 6 = rank 5, FULL_RANK: the default and what the data's own fields
 * hold) annotated with what every lower rank changes (attachPotential: `potDown` leaves, chained talent entries —
 * shared/potential.js, docs/DATA.md §2.3); a self-check proves shared/potential.js atRank rebuilds every rank exactly.
 * At a rank, every chess (normal and elite), 补位 / 自选 unit form adds the `potentialRanks` attribute modifiers up to it
 * (withPotential) and picks its talent / trait / module candidates at it (the 「天赋效果增强」 steps). The 原型干员
 * stand-ins have no potential ranks. A summon picks its own talent / trait candidates at its owner's rank — their
 * `requiredPotentialRank` mirrors the owner's 「天赋效果增强」 (夕's “小自在” 化境 15 → 18 层, 凯尔希's Mon3tr 不毁重构, 望's
 * 棋子 +1 持有 / 部署) — and takes none of the owner's attribute modifiers (a token has no potential ranks; the owner's
 * ATK / cost / redeploy steps are the owner's own). Stage devices and the band's map characters are no player's
 * operators: rank 0.
 */

/** character_table potential attribute types → interpolateAttrs keys (every potential modifier of the season is an ADDITION). */
const POTENTIAL_ATTRS = Object.freeze({
  MAX_HP: 'maxHp', ATK: 'atk', DEF: 'def', MAGIC_RESISTANCE: 'magicResistance', COST: 'cost', RESPAWN_TIME: 'respawnTime',
  ATTACK_SPEED: 'attackSpeed', BLOCK_CNT: 'blockCnt', BASE_ATTACK_TIME: 'baseAttackTime',
});

/**
 * Interpolated attributes (interpolateAttrs) with the character's potential attribute modifiers up to rank `potRank`
 * added (`potentialRanks[0 … potRank-1]`, each 「攻击力+22」 / 「部署费用-1」 / 「再部署时间-4秒」 … an ADDITION to the raw
 * value, before statsFrom rounds it). A modifier of another kind is reported, not applied.
 * @returns {object|null} a new attribute object (null when `attrs` is)
 */
function withPotential(char, attrs, potRank, label) {
  if (!attrs) return attrs;
  const out = { ...attrs };
  for (const rank of (char?.potentialRanks || []).slice(0, potRank)) {
    for (const m of rank?.buff?.attributes?.attributeModifiers || []) {
      const key = POTENTIAL_ATTRS[m.attributeType];
      if (!key || m.formulaItem !== 'ADDITION' || typeof m.value !== 'number' || m.loadFromBlackboard || m.fetchBaseValueFromSourceEntity) {
        warn(`${label}: potential modifier ${m.attributeType} ${m.formulaItem} not applied`);
        continue;
      }
      out[key] = (typeof out[key] === 'number' ? out[key] : 0) + m.value;
    }
  }
  return out;
}

// ===== context loading ==========================================================================

/**
 * Load every official table and research file into one context object.
 * @returns {Promise<object>} ctx
 */
async function loadContext() {
  log('loading official data…');
  const [activity, charTable, skillTable, rangeTable, uniequip, battleEquip, handbook, enemyDbRaw] = await Promise.all([
    loadGamedata('excel/activity_table.json'),
    loadGamedata('excel/character_table.json'),
    loadGamedata('excel/skill_table.json'),
    loadGamedata('excel/range_table.json'),
    loadGamedata('excel/uniequip_table.json'),
    loadGamedata('excel/battle_equip_table.json'),
    loadGamedata('excel/enemy_handbook_table.json'),
    loadGamedata('levels/enemydata/enemy_database.json'),
  ]);
  // 盟约 (act2autochess) is `activity.AUTOCHESS_SEASON.<id>`; 规程 (act3autochess) is `activity.AUTOCHESS.<id>.<version>`
  // with one version (V3_1)
  const versions = activity?.activity?.AUTOCHESS?.[SEASON];
  if (versions && Object.keys(versions).length !== 1) throw new Error(`activity_table AUTOCHESS.${SEASON}: ${Object.keys(versions).length} versions, expected one`);
  const act = activity?.activity?.AUTOCHESS_SEASON?.[SEASON] ?? (versions ? Object.values(versions)[0] : null);
  const ac = activity?.autoChessData;
  if (!act || !ac) throw new Error(`activity_table has no ${SEASON} / autoChessData section`);
  // another season leaves its 入门协议 training mode out (maintainer decision 2026-11-08: 规程 runs no training mode)
  if (SEASON !== DEFAULT_SEASON) {
    for (const [id, m] of Object.entries(act.modeDataDict)) {
      if (m.modeDifficulty !== 'TRAINING') continue;
      for (const k of ['modeDataDict', 'battleDataDict', 'shopLevelDataDict']) delete act[k][id];
      for (const st of Object.values(act.stageDatasDict)) if (Array.isArray(st.mode)) st.mode = st.mode.filter((x) => x !== id);
    }
  }

  // Note: summons/traps live in character_table (token_table.json only lists 4 unrelated traps).

  // character templates (阿米娅's forms, char_patch_table patchChars) join the character table when a chess names one
  if (Object.values(act.charShopChessDatas).some((r) => r.tmplId)) {
    const patch = await loadGamedata('excel/char_patch_table.json');
    for (const [id, rec] of Object.entries(patch.patchChars || {})) if (!charTable[id]) charTable[id] = rec;
  }

  const enemyDb = new Map();
  for (const e of enemyDbRaw.enemies || []) enemyDb.set(e.Key, e.Value);

  // Level files: every wave template in battleDataDict + escaped templates + stage terrains +
  // the season-wide enemy override level.
  const levelSrc = new Map(); // template/stage id -> official levelId or stage id
  for (const rounds of Object.values(act.battleDataDict)) {
    for (const entries of Object.values(rounds)) for (const e of entries) levelSrc.set(templateIdOf(e.levelId), e.levelId);
  }
  for (const k of ['escapedBattleTemplateMapSinglePlayer', 'escapedBattleTemplateMapMultiPlayer']) {
    if (act.constData[k]) levelSrc.set(templateIdOf(act.constData[k]), act.constData[k]);
  }
  const templateIds = new Set(levelSrc.keys());
  const stageIds = Object.keys(act.stageDatasDict).sort(naturalCmp);
  for (const id of stageIds) levelSrc.set(id, id);
  const enemyDataLevelId = ac.constData.enemyDataLevelId ? templateIdOf(ac.constData.enemyDataLevelId) : null;
  if (enemyDataLevelId) levelSrc.set(enemyDataLevelId, ac.constData.enemyDataLevelId);
  const levels = {};
  // Sequential download to stay polite to GitHub; cached files load instantly.
  for (const id of [...levelSrc.keys()].sort(naturalCmp)) levels[id] = await loadGamedata(levelPath(levelSrc.get(id)));
  // 规程 (act3autochess): a stage level is a scene of every field and its battle fields are sub-levels, a wave level's
  // routes are on its field's placeholder; both are put into the 19×21 frame the rest of this script reads
  // (tools/level-fields.mjs). The default season's levels are that frame already.
  for (const id of stageIds) {
    if (isFrameLevel(levels[id])) continue;
    const subs = [];
    for (const n of [1, 2, 3]) subs.push(await loadGamedata(subLevelPath(id, n)));
    // what the scene and its battle fields disagree on (the generator took the scene's runes once — 盐坨子炮, 2026-11-14)
    for (const d of levelDrift(levels[id], subs)) warn(`level ${id}: ${d}`);
    levels[id] = composeStageLevel(levels[id], subs);
  }
  for (const id of levelSrc.keys()) {
    const lv = levels[id];
    if (stageIds.includes(id) || id === enemyDataLevelId || !lv?.mapData?.map?.length || isFrameLevel(lv)) continue;
    const { origin } = waveOrigin(lv);
    for (const s of stageIds) {
      const { misfits } = waveOrigin(lv, levels[s]);
      if (misfits.length) warn(`level ${id} at (${origin}) on ${s}: ${misfits.join(', ')}`);
    }
    levels[id] = placeWaveLevel(lv, origin);
  }

  const research = {
    core: await loadResearch('01-core-data.json'),
    bonds: await loadResearch('02-bonds.json'),
    items: await loadResearch('04-items.json'),
    enemies: await loadResearch('05-enemies.json'),
    maps: await loadResearch('05-maps.json'),
    assets: await loadResearch('07-assets.json'),
  };

  return {
    act, ac, charTable, skillTable, rangeTable, uniequip, battleEquip, handbook, enemyDb,
    // the season's name in the activity table (another season's config seasonName, buildConfig)
    seasonTitle: activity?.basicInfo?.[SEASON]?.name ?? null,
    levels, templateIds: [...templateIds].sort(naturalCmp), stageIds, enemyDataLevelId, research,
    manifest: await loadManifest(),
    attackTiming: await loadLocalJson('tools/assets/local-attack-timing.json', 'attack timings (tools/local-extract/attack_timing.py): no `_maxAnimScale` …'),
    charModes: await loadLocalJson('tools/assets/local-char-modes.json', 'operator modes (tools/local-extract/char_modes.py)'),
    opProjectiles: await loadLocalJson('tools/assets/local-op-projectiles.json', 'operator projectiles (tools/local-extract/op_projectiles.py): no `shot` …'),
    enemyProjectiles: await loadLocalJson('tools/assets/local-enemy-projectiles.json', 'enemy projectiles (tools/local-extract/enemy_projectiles.py): no `proj` …'),
    skillCast: await loadLocalJson('tools/assets/local-skill-cast.json', 'skill classes (tools/local-extract/skill_cast.py): no skill `cast` …'),
    skillHud: await loadLocalJson('tools/assets/local-skill-hud.json', 'skill HUD rows (tools/local-extract/skill_hud.py): no skill `bulletMode` / `overload` …'),
  };
}

/** A committed tools/assets/local-*.json written by a tools/local-extract script, or null (with a warning) when absent. */
async function loadLocalJson(rel, what) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) { warn(`${rel} not found; ${what}`); return null; }
  try { return JSON.parse(await readFile(abs, 'utf8')); } catch (e) { warn(`${rel} unreadable: ${e.message}`); return null; }
}

/**
 * The committed asset manifest data/assets.json (tools/fetch-assets.mjs; docs/ASSETS.md) — the enemies' attack clip
 * lengths (enemyAttackAnim); null when absent or unreadable (no `attackAnim` then, with a warning).
 */
async function loadManifest() {
  const abs = join(ROOT, 'data', 'assets.json');
  if (!existsSync(abs)) { warn('data/assets.json not found; enemies get no attackAnim'); return null; }
  try { return JSON.parse(await readFile(abs, 'utf8')); } catch (e) { warn(`data/assets.json unreadable: ${e.message}`); return null; }
}

// ===== shared game-object helpers ===============================================================

/** Range grid [[dRow,dCol]…] of a range_table id (facing right), or null. */
function rangeGrid(ctx, rangeId) {
  if (!rangeId) return null;
  const r = ctx.rangeTable[rangeId];
  if (!r) { warn(`unknown rangeId ${rangeId}`); return null; }
  return (r.grids || []).map((g) => [g.row, g.col]);
}

/** Interpolate character attribute keyframes at (phase, level); returns the raw float data object. */
function interpolateAttrs(char, phase, level) {
  const ph = char.phases?.[phase];
  if (!ph) return null;
  const kfs = ph.attributesKeyFrames || [];
  if (!kfs.length) return null;
  const lv = Math.max(1, Math.min(level, ph.maxLevel || level));
  let a = kfs[0], b = kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (lv >= kfs[i].level && lv <= kfs[i + 1].level) { a = kfs[i]; b = kfs[i + 1]; break; }
  }
  const t = b.level === a.level ? 0 : (lv - a.level) / (b.level - a.level);
  const out = {};
  for (const [k, v0] of Object.entries(a.data)) {
    const v1 = b.data[k];
    out[k] = typeof v0 === 'number' && typeof v1 === 'number' ? v0 + (v1 - v0) * t : v0;
  }
  return out;
}

/** Map of module attribute blackboard keys → stat fields. */
const MODULE_ATTR_MAP = {
  max_hp: 'maxHp', atk: 'atk', def: 'def', magic_resistance: 'res', attack_speed: 'aspd',
  cost: 'cost', respawn_time: 'respawnTime', block_cnt: 'blockCnt', base_attack_time: 'bat',
  max_deploy_count: 'deployLimit', max_deck_stack_cnt: 'deckStack',
};

/** Convert interpolated attributes (+ optional additive module bonus) into the compact stats object. */
function statsFrom(attrs, bonus = {}) {
  if (!attrs) return null;
  const r = (v) => Math.round(v);
  const s = {
    maxHp: r(attrs.maxHp),
    atk: r(attrs.atk),
    def: r(attrs.def),
    res: cleanNum(attrs.magicResistance),
    cost: r(attrs.cost),
    blockCnt: r(attrs.blockCnt),
    bat: cleanNum(attrs.baseAttackTime),
    aspd: cleanNum(attrs.attackSpeed),
    respawnTime: r(attrs.respawnTime),
    spRecovery: cleanNum(attrs.spRecoveryPerSec),
    hpRecoveryPerSec: cleanNum(attrs.hpRecoveryPerSec),
    moveSpeed: cleanNum(attrs.moveSpeed),
    tauntLevel: attrs.tauntLevel | 0,
    massLevel: attrs.massLevel | 0,
    deployLimit: attrs.maxDeployCount | 0,
    deckStack: attrs.maxDeckStackCnt | 0,
  };
  for (const [k, v] of Object.entries(bonus)) {
    const f = MODULE_ATTR_MAP[k];
    if (!f) { warn(`unmapped module attribute key ${k}`); continue; }
    s[f] = cleanNum((s[f] || 0) + v);
  }
  return s;
}

/** Immunity flags of a character/enemy attribute object. */
function immunitiesOf(attrs) {
  return {
    stun: !!attrs?.stunImmune, silence: !!attrs?.silenceImmune, sleep: !!attrs?.sleepImmune,
    frozen: !!attrs?.frozenImmune, levitate: !!attrs?.levitateImmune,
  };
}

/** Official trigger rule names → DESIGN §5.6 names. */
const TRIGGER_RENAME = { ALWAYS: 'SP_FULL', CUSTOM_RANGE_SEARCH_ENEMY: 'CUSTOM_RANGE' };

/**
 * Official rows the engine plays as one of its own rules on an ally condition (`allies: true` — server/sim/skills.js: a
 * healable, injured ally on the trigger grid instead of an enemy): 黍 S3 离离枯荣's TRY_SEARCH_ALLY_SKILL, PRTS 卫戍协议/帮助
 * 特殊策略 "技能范围内存在可治疗的我方单位时释放技能" — SKILL_RANGE on the skill's own range (x-2), checked every tick.
 */
const TRIGGER_ALLY_RULES = Object.freeze({ TRY_SEARCH_ALLY_SKILL: 'SKILL_RANGE' });

/**
 * The 重装 skills follow the official TANK class row (`TANK | | | 0 | TAKE_DAMAGE`, added with 下半) like every other
 * MANUAL 重装 skill (maintainer decision 2026-10-28): the owner's deviations of 2026-10-03/04/05 (six skills of 深巡 /
 * 雷蛇 / 灰毫 / 号角 on DEFAULT, 余 S2 on SKILL_RANGE, the 重装 stand-ins and 自选 重装 on DEFAULT; DESIGN §21.29, §22.10)
 * are gone. They were written when TAKE_DAMAGE was read as "wait for a hit"; the client pass also casts a TAKE_DAMAGE
 * skill when its attack has a target (docs/rules/sim.md 「스킬 범위 발동」), so the deviations mostly took the hit away.
 */

/**
 * Resolve the auto-cast rule of a skill record (PRTS 卫戍协议/帮助 §作战阶段 技能操作 — the official skill strategies;
 * DESIGN §5.6):
 * - charId rows first (exact skillIndex, or −1 = every skill of the operator);
 * - then the class rows, subProfession before profession. They name whole classes — PRTS "重装干员", "先锋-战术家、
 *   先锋-执旗手、辅助-吟游者分支干员", "近卫-解放者、术师-阵法术师分支干员" — so they apply to EVERY skill index: the rows'
 *   skillIndex 0 is not "skill 1 only" (the 阵法术师 row has to cover 薄绿's default S2 — a phalanx never attacks while
 *   its skill is off, so the basic strategy could never cast it; "不受技能范围影响" of the 重装 row speaks of their skills
 *   with a 技能范围, which only S2/S3 have). They apply to MANUAL skills only: the strategies automate the manual 开启,
 *   an AUTO skill fires by its own rule (PRTS 古米 S1 备注: "此技能在存在生命值不满的可治疗角色时可触发");
 * - else DEFAULT, the basic strategy — the client's `AutoChessBattleTrigger._DefaultTriggerSkill` (maintainer decision
 *   2026-10-11, docs/rules/sim.md 「스킬 범위 발동」): a MANUAL skill with a rangeId (an attack-range change included —
 *   the skill table holds the new range as its rangeId) checks those cells, `customRangeGrid` = the rangeId grid (a
 *   selectable enemy, ground or air, there: `LitePhysicsUtil.FindTargetsInBox` with the trigger's ALL-motion options, no
 *   攻击距离 added); one without checks whether the unit is attacking (its ATTACK / COMBAT state) — server/sim/skills.js
 *   autoTrigger. A DEFAULT row does the same;
 * - an ally row the engine plays as one of its rules (TRIGGER_ALLY_RULES: 黍 S3's TRY_SEARCH_ALLY_SKILL → SKILL_RANGE on
 *   the skill range with `allies: true` — an injured, healable ally there);
 * - other rows keep their rule (TAKE_DAMAGE: a hit, or a target of its attack as SEARCH; SEARCH an enemy in the initial
 *   range, CUSTOM_RANGE / SKILL_RANGE / SP_FULL / … have their own range or none); `rawRule` is the official row. No
 *   deviation from the official rows is left (maintainer decision 2026-10-28, above). Until 2026-10-11 (the owner's
 *   provisional rule of 2026-10-05/07) a skill whose running range strictly contained the operator's own took
 *   ACTIVE_RANGE on that running range, and a 技能范围 that was no attack-range change took SKILL_RANGE.
 * @param {object} skill record from buildSkill (skillId, skillType, desc, rangeGrid, bb)
 */
/**
 * 规程's rows list conditions (`skillTriggerTypes`) where 盟约's name one rule (`skillTriggerType`). A list some row of
 * both seasons gives (the same profession / branch / operator and skill) is that rule; other lists are new rows — the
 * class rows of 狙击 / 医疗 / 术师 and a few branches, 17 operator rows — whose conditions only the CN client reads: such a
 * row is taken as no row, the basic strategy as in 盟约 [ASSUMED·CN: how a list's conditions combine], and its list kept
 * as `rawRules`.
 */
const TRIGGER_LIST_RULES = Object.freeze({
  'ON_TAKE_DAMAGE,SKILL_RANGE_ENEMY': 'TAKE_DAMAGE', ALWAYS: 'ALWAYS', 'SKILL_RANGE_ENEMY,COMBAT_OR_ATTACK': 'SEARCH',
  SKILL_RANGE_ENEMY: 'SEARCH', MLYSS_S: 'MLYSS_WTRMAN', MARCIL_S2: 'MARCILS2', GLOBAL_RANGE_ENEMY: 'GDGLOW_SKILL_2',
  CUSTOM_RANGE_ENEMY: 'CUSTOM_RANGE_SEARCH_ENEMY', 'SKILL_RANGE_ALLY,ON_TAKE_DAMAGE': 'TRY_SEARCH_ALLY_SKILL',
});
/** A trigger row's rule name: its own (盟约) or its list's (TRIGGER_LIST_RULES); null for a list of a new row. */
const triggerRuleOf = (r) => (typeof r.skillTriggerType === 'string' ? r.skillTriggerType
  : TRIGGER_LIST_RULES[(r.skillTriggerTypes || []).join(',')] ?? null);

function resolveTrigger(ctx, char, charId, skillIdx, skill) {
  const t = resolveTriggerRule(ctx, char, charId, skillIdx, skill);
  // the row's official condition list (规程), read or not
  const manual = skill.skillType === 'MANUAL';
  const listed = Object.values(ctx.ac.skillTriggerDataList || {}).filter((r) => Array.isArray(r.skillTriggerTypes));
  const row = listed.find((r) => r.charId === charId && (r.skillIndex === skillIdx || r.skillIndex === -1))
    || (manual && listed.find((r) => !r.charId && r.subProfessionId && r.subProfessionId === char.subProfessionId))
    || (manual && listed.find((r) => !r.charId && !r.subProfessionId && r.profession === char.profession));
  return row ? { ...t, rawRules: [...row.skillTriggerTypes] } : t;
}

function resolveTriggerRule(ctx, char, charId, skillIdx, skill) {
  const all = Object.values(ctx.ac.skillTriggerDataList || {});
  for (const r of all) if (!triggerRuleOf(r)) warn(`trigger row ${r.charId || r.subProfessionId || r.profession} ${r.skillIndex}: conditions ${(r.skillTriggerTypes || []).join(' + ')} not read (basic strategy) [ASSUMED·CN]`);
  const rows = all.filter((r) => triggerRuleOf(r));
  const manual = skill.skillType === 'MANUAL';
  const pick =
    rows.find((r) => r.charId === charId && (r.skillIndex === skillIdx || r.skillIndex === -1)) ||
    (manual && rows.find((r) => !r.charId && r.subProfessionId && r.subProfessionId === char.subProfessionId)) ||
    (manual && rows.find((r) => !r.charId && !r.subProfessionId && r.profession === char.profession)) ||
    null;
  // the client's basic strategy (AutoChessBattleTrigger._DefaultTriggerSkill): a MANUAL skill with a rangeId checks its
  // own range — a selectable enemy, ground or air, on those cells — and one without checks the attack / combat state
  const ownRange = manual && skill.rangeGrid?.length ? skill.rangeGrid.map((p) => p.slice()) : null;
  if (!pick && ownRange) return { rule: 'DEFAULT', rawRule: 'DEFAULT', customRangeGrid: ownRange };
  const rawRule = pick ? triggerRuleOf(pick) : 'DEFAULT';
  if (TRIGGER_ALLY_RULES[rawRule]) {
    if (!skill.rangeGrid) warn(`skill ${skill.skillId}: ${rawRule} without a 技能范围`);
    return { rule: TRIGGER_ALLY_RULES[rawRule], rawRule, customRangeGrid: skill.rangeGrid ? skill.rangeGrid.map((p) => p.slice()) : null, allies: true };
  }
  const rule = TRIGGER_RENAME[rawRule] || rawRule;
  if (rule === 'DEFAULT' && ownRange) return { rule, rawRule, customRangeGrid: ownRange };
  let customRangeGrid = null;
  if (rawRule === 'CUSTOM_RANGE_SEARCH_ENEMY') {
    const rid = ctx.ac.skillRangeDict?.[skill.skillId];
    customRangeGrid = rangeGrid(ctx, rid);
    if (!customRangeGrid) warn(`skill ${skill.skillId}: CUSTOM_RANGE trigger without skillRangeDict entry`);
  }
  return { rule, rawRule, customRangeGrid };
}

/** Numeric SpType enum values found in skill_table (passive skills use 8 = ON_DEPLOY, no SP). */
const SP_TYPE_NAMES = { 1: 'INCREASE_WITH_TIME', 2: 'INCREASE_WHEN_ATTACK', 4: 'INCREASE_WHEN_TAKEN_DAMAGE', 8: 'ON_DEPLOY' };

/**
 * Build a skill record (default skill of a chess or a token) at a given level.
 * @returns {object|null}
 */
function buildSkill(ctx, skillId, level, trigger, label) {
  if (!skillId) return null;
  const s = ctx.skillTable[skillId];
  if (!s) { warn(`${label}: skill ${skillId} missing from skill_table`); return null; }
  const levels = Array.isArray(s.levels) ? s.levels : [];
  const lv = levels[Math.max(0, Math.min(level, levels.length) - 1)];
  if (!lv) { warn(`${label}: skill ${skillId} has no level ${level}`); return null; }
  const { bb, bbStr } = flattenBB(lv.blackboard, `skill ${skillId}`);
  // Some descriptions reference 'duration' implicitly; expose it for placeholder resolution.
  const phBB = { duration: lv.duration, ...bb };
  const { desc, descRaw } = textPair(lv.description, phBB, bbStr, `skill ${skillId}`);
  const sp = lv.spData || {};
  if (typeof sp.spType === 'number' && !SP_TYPE_NAMES[sp.spType]) warn(`skill ${skillId}: unknown numeric spType ${sp.spType}`);
  return {
    skillId,
    iconId: s.iconId || skillId,
    name: lv.name,
    level: Math.max(1, Math.min(level, levels.length)),
    desc, descRaw,
    skillType: lv.skillType,
    durationType: lv.durationType,
    duration: cleanNum(lv.duration),
    spType: typeof sp.spType === 'number' ? SP_TYPE_NAMES[sp.spType] || String(sp.spType) : sp.spType,
    spCost: sp.spCost,
    initSp: sp.initSp,
    maxChargeTime: sp.maxChargeTime,
    increment: cleanNum(sp.increment),
    bb, bbStr,
    rangeId: lv.rangeId || null,
    rangeGrid: rangeGrid(ctx, lv.rangeId),
    prefabId: lv.prefabId || skillId,
    trigger: trigger || { rule: 'DEFAULT', rawRule: 'DEFAULT', customRangeGrid: null },
    // "被动效果：攻击范围扩大" as a flag (shared/loadoutRecord.js attackRangeGrid; the overlays translate `desc`); an
    // operator's skill prefab sets it too (skillDeployRange)
    ...(/被动效果：攻击范围扩大/.test(desc) ? { passiveRange: true } : {}),
  };
}

/**
 * Split the parts of a module phase into the parts that apply to the operator itself and the parts
 * flagged `isToken` (they upgrade the operator's summons, e.g. 伺夜's wolves, 缪尔赛思's 流形,
 * 浊心斯卡蒂's 海嗣, 耀骑士临光's “耀阳”) and must never be applied to the operator.
 * @param {object|null} modulePhase battle_equip_table phase (or null)
 * @returns {{ op: object[], token: object[] }}
 */
function splitModuleParts(modulePhase) {
  const op = [], token = [];
  for (const part of modulePhase?.parts || []) (part && part.isToken ? token : op).push(part);
  return { op, token };
}

/**
 * Apply module trait-override parts to a trait blackboard/text (golden chess or their tokens).
 * Mutates `traitBB`; returns the (possibly overridden) trait template, module text and trait range id, and `descBB` —
 * the blackboard the trait's own line is written with: a part whose target is `DISPLAY` (display only) and that adds a
 * line without rewriting the trait's feeds its blackboard to that added line only. 圣约送葬人 REA-Y (uniequip_003_excu2):
 * its DISPLAY part's `value` 12 is the 「攻击速度+{value}」 of its own line, not the trait's 「回复自身{value}生命」 (50 —
 * GitHub #400; the battle heals 50, its kit reads traitBase). `traitBB` (the battle's trait blackboard) still takes
 * every part, as before (the kits that read it are written against it).
 * @returns {{ template: string, moduleText: string|null, rangeId: string|null, descBB: { bb: object, bbStr: object } }}
 */
function applyModuleTraitParts(parts, phase, level, traitBB, template, rangeId, label, potRank = 0) {
  let moduleText = null;
  const descBB = { bb: { ...traitBB.bb }, bbStr: { ...traitBB.bbStr } };
  for (const part of parts || []) {
    const mc = bestCandidate(part.overrideTraitDataBundle?.candidates, phase, level, potRank);
    if (!mc) continue;
    const mb = flattenBB(mc.blackboard, `${label} module trait`);
    Object.assign(traitBB.bb, mb.bb);
    Object.assign(traitBB.bbStr, mb.bbStr);
    if (part.target !== 'DISPLAY' || mc.overrideDescripton) {
      Object.assign(descBB.bb, mb.bb);
      Object.assign(descBB.bbStr, mb.bbStr);
    }
    if (mc.overrideDescripton) template = mc.overrideDescripton;
    if (mc.additionalDescription) moduleText = mc.additionalDescription;
    if (mc.rangeId) rangeId = mc.rangeId;
  }
  return { template, moduleText, rangeId, descBB };
}

/**
 * Trait record of a character at (phase, level, potential rank) with the given (operator) module parts, plus the
 * combat classification derived from its text.
 * @returns {{ trait: object, classify: object }}
 */
function traitRecord(ctx, char, phase, level, opParts, chessId, potRank = 0) {
  const tc = bestCandidate(char.trait?.candidates, phase, level, potRank);
  const traitBB = flattenBB(tc?.blackboard, `${chessId} trait`);
  const traitMod = applyModuleTraitParts(opParts, phase, level, traitBB,
    tc?.overrideDescripton || char.description || '', tc?.rangeId || null, chessId, potRank);
  const tp = textPair(traitMod.template, traitMod.descBB.bb, traitMod.descBB.bbStr, `${chessId} trait`);
  const trait = { desc: tp.desc, descRaw: tp.descRaw, bb: traitBB.bb, bbStr: traitBB.bbStr, rangeGrid: rangeGrid(ctx, traitMod.rangeId) };
  if (traitMod.moduleText) {
    const mp = textPair(traitMod.moduleText, traitBB.bb, traitBB.bbStr, `${chessId} module trait`);
    trait.moduleDesc = mp.desc;
    trait.moduleDescRaw = mp.descRaw;
    // the rules shared/loadoutRecord.js reads from this text, as flags: the game-text overlays (data/i18n) translate
    // moduleDesc, so a client in another language could not match the Chinese words
    if (/攻击范围扩大/.test(mp.desc)) trait.rangeUp = true;
    if (/集成战略/.test(mp.desc)) trait.otherMode = true;
  }
  return { trait, classify: classifyAttack(char, tp.desc) };
}

/**
 * Flat stat additions of a module phase in stat-field names (ModuleRecord.attr): exactly what
 * statsFrom() adds to the no-module stats (`stats[f] = cleanNum(statsBase[f] + attr[f])`).
 */
function moduleAttr(modulePhase) {
  const sum = {};
  for (const b of modulePhase?.attributeBlackboard || []) sum[b.key] = (sum[b.key] || 0) + b.value;
  const out = {};
  for (const [k, v] of Object.entries(sum)) {
    const f = MODULE_ATTR_MAP[k];
    if (!f) { warn(`unmapped module attribute key ${k}`); continue; }
    out[f] = cleanNum(v);
  }
  return out;
}

/**
 * Talents of a character at (phase, level), plus module talent upgrades from `moduleParts`
 * (golden chess: the operator's non-token parts; tokens: the owner's `isToken` parts).
 * An override of an existing talent keeps the base values that the module candidate does not
 * restate (blackboard keys merged, module values win; name/text/range/token kept when absent).
 * `modPhase`/`modLevel` select module candidates (tokens: the owner's phase/level); `potRank` every candidate (tokens:
 * the owner's potential rank, ctx.potRank).
 * @returns {Array<{index:number,name:string|null,desc:string|null,descRaw:string|null,bb:object,bbStr:object,rangeGrid:any,tokenKey:string|null,hidden:boolean,fromModule:boolean}>}
 */
function buildTalents(ctx, char, phase, level, moduleParts, label, modPhase = phase, modLevel = level, potRank = 0) {
  return mergeTalentChanges(baseTalentList(ctx, char, phase, level, label, potRank),
    moduleTalentChanges(ctx, moduleParts, modPhase, modLevel, label, potRank));
}

/**
 * The character's own talents at (phase, level, potential rank), unfiltered (no module). `charId` (the body whose charpack
 * the client reads) marks `attackRange` on a talent whose own range replaces the default attack range: the charpack's
 * `Talents/<prefabKey>` with `_overrideDefaultRangeId` (tools/assets/local-char-modes.json `rangeTalents`,
 * tools/local-extract/char_modes.py) and a candidate with a rangeId — 霜叶's 掩护打击 (elite: 3-1 over 3-12). The battle
 * builds every mode's range from it; shared/loadoutRecord.js attackRangeGrid draws it on the prep card and the board.
 */
function baseTalentList(ctx, char, phase, level, label, potRank = 0, charId = null) {
  const talents = [];
  const rangeKeys = new Set(charId ? ctx.charModes?.[charId]?.rangeTalents || [] : []);
  (char.talents || []).forEach((t, index) => {
    const c = bestCandidate(t.candidates, phase, level, potRank);
    if (!c) return;
    const { bb, bbStr } = flattenBB(c.blackboard, `${label} talent ${index}`);
    const { desc, descRaw } = textPair(c.description, bb, bbStr);
    talents.push({
      index, name: c.name || null, desc, descRaw, bb, bbStr,
      rangeGrid: rangeGrid(ctx, c.rangeId), tokenKey: c.tokenKey || null,
      hidden: !!c.isHideTalent, fromModule: false,
      ...(c.rangeId && rangeKeys.has(String(c.prefabKey ?? '')) ? { attackRange: true } : {}),
    });
  });
  return talents;
}

/**
 * Talent additions/overrides of module parts at (modPhase, modLevel, potential rank), in part order, as ModuleRecord
 * `talentChanges` entries: { talentIndex, name, desc, descRaw, bb, bbStr, rangeGrid, tokenKey, hidden }.
 * `talentIndex` −1 = a new (usually hidden, data-only) talent.
 */
function moduleTalentChanges(ctx, moduleParts, modPhase, modLevel, label, potRank = 0) {
  const out = [];
  for (const part of moduleParts || []) {
    const cands = part.addOrOverrideTalentDataBundle?.candidates;
    if (!cands) continue;
    const c = bestCandidate(cands, modPhase, modLevel, potRank);
    if (!c) continue;
    const { bb, bbStr } = flattenBB(c.blackboard, `${label} module talent`);
    const text = c.upgradeDescription || c.description;
    const { desc, descRaw } = textPair(text, bb, bbStr);
    out.push({
      talentIndex: c.talentIndex, name: c.name || null, desc, descRaw, bb, bbStr,
      rangeGrid: rangeGrid(ctx, c.rangeId), tokenKey: c.tokenKey || null, hidden: !!c.isHideTalent,
    });
  }
  return out;
}

/**
 * Apply module talent changes to a talent list — the ONE merge rule, mirrored exactly by
 * server/sim/simdata.js composeTalents (a data test checks both agree on every golden chess).
 * Override of an existing talent index: module values win; keep what the candidate does not restate
 * (e.g. 浊心斯卡蒂's data-only upgrade has an empty blackboard but the talent still sends 1 海嗣: cnt
 * stays). Otherwise the change is appended. Fully empty placeholder talents (no name, no text, no
 * blackboard, no token) are dropped at the end.
 */
function mergeTalentChanges(base, changes) {
  const talents = base.map((t) => ({ ...t }));
  for (const ch of changes || []) {
    const { talentIndex, ...rest } = ch;
    const rec = { index: talentIndex, ...rest, fromModule: true };
    const at = talentIndex >= 0 ? talents.findIndex((x) => x.index === talentIndex) : -1;
    if (at >= 0) {
      const old = talents[at];
      talents[at] = {
        ...rec,
        name: rec.name || old.name, desc: rec.desc ?? old.desc, descRaw: rec.descRaw ?? old.descRaw,
        bb: { ...old.bb, ...rec.bb }, bbStr: { ...old.bbStr, ...rec.bbStr },
        rangeGrid: rec.rangeGrid || old.rangeGrid, tokenKey: rec.tokenKey || old.tokenKey,
        hidden: old.hidden && rec.hidden,
      };
    } else {
      talents.push(rec);
    }
  }
  return talents.filter((t) => t.name || t.desc || Object.keys(t.bb).length || t.tokenKey);
}

// ===== chess ====================================================================================

/** Melee sub-professions whose normal attack is a ranged attack (can hit FLY). */
const MELEE_RANGED_SUBPROFS = new Set(['lord', 'fortress', 'shotprotector', 'agent', 'hookmaster']);
/** Sub-professions whose normal state is "no attack" (buff aura / skill-only attackers). */
const NO_ATTACK_SUBPROFS = new Set(['bard', 'phalanx', 'librator']);

/**
 * Derive combat classification of an operator from profession / sub-profession / trait text.
 * Heuristic (documented in DATA.md); the sim may override per kit.
 */
function classifyAttack(char, traitText) {
  const prof = char.profession;
  const sub = char.subProfessionId;
  const trait = traitText || '';
  // 驭法铁卫 (斩业星熊) "技能开启时普通攻击会造成法术伤害": arts is the skill-on type; the normal attack — the record's
  // dmgType, what a card and the bot read — is physical (display only: her kit attacks physically off-skill and in arts
  // while a skill runs — upstream's 自选 kit)
  const skillOnArts = /技能开启时[^，。；]*法术伤害/.test(trait);
  let dmgType;
  if ((prof === 'MEDIC' && sub !== 'incantationmedic') || sub === 'bard') dmgType = 'heal';
  else if ((/法术伤害/.test(trait) && !skillOnArts) || prof === 'CASTER') dmgType = 'arts';
  else dmgType = 'phys';

  let attackKind;
  if (NO_ATTACK_SUBPROFS.has(sub)) attackKind = 'none';
  else if (dmgType === 'heal') attackKind = 'heal';
  else if (char.position === 'RANGED' || MELEE_RANGED_SUBPROFS.has(sub)) attackKind = 'ranged';
  else attackKind = 'melee';

  let projectile = 'none';
  if (attackKind === 'heal') projectile = 'orb';
  else if (attackKind === 'ranged') projectile = dmgType === 'arts' ? 'bolt' : 'arrow';

  // Ranged attackers hit FLY unless the trait restricts them to ground targets (投掷手 "地面敌人", 要塞).
  const canHitFly = (attackKind === 'ranged' && !/地面敌人/.test(trait) && sub !== 'fortress') || sub === 'skywalker';
  let targetPriority = null;
  if (/优先攻击空中单位/.test(trait)) targetPriority = 'fly';
  else if (/防御力最低/.test(trait)) targetPriority = 'lowestDef';
  return { dmgType, attackKind, projectile, canHitFly, targetPriority };
}

/** E2 art exists for this char? (research 07 knows; else assume when the char has an E2 phase) */
function hasE2Art(ctx, charId, kind) {
  const a = ctx.research.assets?.operators?.[charId]?.[kind];
  if (a) return !!a.e2;
  return (ctx.charTable[charId]?.phases?.length || 0) >= 3;
}

/**
 * Build data/chess.json: every chess (normal + golden) of the season, keyed by chessId, with its loadout
 * choices (DESIGN §16: `skills[]`; golden `modules[]` + `statsBase`/`traitBase`/`talentsBase`).
 * `tokenOwners` entries carry `skillAlts` ({index, count, sources} per non-default skill) and `moduleAlts`
 * ({id, modulePhase, moduleTokenParts} per non-default module + 'none') for the token variants.
 * @returns {{ chess: object, tokenOwners: Map<string, Array<{chessId:string, charId:string, phase:number, level:number, skillIndex:number, skillLevel:number, potRank:number, count:number|null, golden:boolean, modulePhase:any, skillAlts:object[], moduleAlts:object[]}>> }}
 */
function buildChess(ctx) {
  const { act, charTable, uniequip, battleEquip } = ctx;
  const out = {};
  const tokenOwners = new Map();
  const diyIds = new Set(Object.keys(act.diyChessDict || {}));
  const priceTable = act.shopCharChessInfoData;

  for (const chessId of Object.keys(act.charChessDataDict).sort(naturalCmp)) {
    const cd = act.charChessDataDict[chessId];
    const baseId = act.chessNormalIdLookupDict[chessId] || chessId;
    const shop = act.charShopChessDatas[baseId];
    if (!shop) { warn(`chess ${chessId}: no charShopChessDatas entry for ${baseId}`); continue; }
    const isGolden = !!cd.isGolden;
    const tier = shop.chessLevel;
    const status = cd.status || {};
    const phase = phaseIdx(status.evolvePhase);
    const level = status.charLevel || 1;
    const priceRow = (priceTable[String(tier)] || []).find((p) => !!p.isGolden === isGolden) || {};
    const isDiy = shop.chessType === 'DIY' || diyIds.has(baseId);
    const rec = {
      chessId, baseId, goldenId: shop.goldenChessId, isGolden, tier,
      identifier: cd.identifier,
      isHidden: !!shop.isHidden, isDiy, visible: !shop.isHidden && !isDiy,
      chessType: shop.chessType,
      // the official stand-in fields of the shop row, verbatim (both forms; data/backups.json, shared/standIn.js)
      backup: {
        charId: shop.backupCharId ?? null, tmplId: shop.backupTmplId ?? null, skillIndex: shop.backupCharSkillIndex ?? null,
        uniEquipId: shop.backupCharUniEquipId ?? null, potRank: shop.backupCharPotRank ?? null,
      },
      shopSortId: shop.shopLevelSortId,
      charId: shop.charId || null,
      name: null, appellation: null, rarity: null, profession: null, subProfessionId: null, subProfessionName: null,
      position: null, nationId: null, powers: [],
      bonds: [...(cd.bondIds || [])],
      garrisonIds: [...(cd.garrisonIds || [])],
      price: priceRow.purchasePrice ?? null,
      sellPrice: priceRow.chessSoldPrice ?? null,
      upgradeNum: cd.upgradeNum,
      upgradeChessId: cd.upgradeChessId || null,
      // 规程's equipment slots of the operator (charChessDataDict equipSlotNum: 2, 机械 acrbot 4 / elite 6); null where the
      // season has no such field (盟约: every operator carries 2, gamedata equipPerChess)
      equipSlots: Number.isInteger(cd.equipSlotNum) && cd.equipSlotNum > 0 ? cd.equipSlotNum : null,
      status: { phase, level, skillLevel: status.skillLevel, equipLevel: status.equipLevel || 0 },
      stats: null, immunities: null, rangeId: null, rangeGrid: null,
      dmgType: null, attackKind: null, projectile: null, canHitFly: false, targetPriority: null,
      trait: null, skill: null, talents: [], tokens: [], module: null,
      assets: null, attackAnim: null, shot: null,
    };
    if (isDiy) {
      rec.name = '甄选干员';
      rec.diyRequirement = act.diyChessDict?.[baseId] || null;
      out[chessId] = rec;
      continue;
    }
    // the body: the shop row's character template when it names one (阿米娅's 医疗 form char_1037_amiya3 —
    // char_patch_table patchChars, loadContext), else the character itself; `charId` stays the operator
    const body = shop.tmplId || shop.charId;
    const char = charTable[body];
    if (!char) { warn(`chess ${chessId}: char ${body} missing from character_table`); out[chessId] = rec; continue; }
    if (shop.tmplId) rec.tmplId = shop.tmplId;

    rec.name = char.name;
    rec.appellation = char.appellation;
    rec.rarity = Number(String(char.rarity).replace('TIER_', '')) || null;
    rec.profession = char.profession;
    rec.subProfessionId = char.subProfessionId;
    rec.subProfessionName = uniequip.subProfDict?.[char.subProfessionId]?.subProfessionName || null;
    rec.position = char.position;
    rec.nationId = char.nationId || null;
    rec.powers = powersOf(char);
    // 高台 is not a data flag: a MELEE chess whose trait (no module: `traitBase` / `trait`) reads 「可以放置于远程位」
    // — the 钩索师 / 推击手 branch trait — may stand there, read at place time (shared/highGround.js; the owner's
    // decision of 2026-10-05, following PRTS).

    // Module (only active on golden chess: equipLevel > 0).
    const modId = shop.defaultUniEquipId || null;
    const equipLevel = status.equipLevel || 0;
    let modulePhase = null;
    if (modId) {
      const meta = uniequip.equipDict?.[modId];
      const be = battleEquip[modId];
      if (equipLevel > 0) {
        modulePhase = be?.phases?.find((p) => p.equipLevel === equipLevel) || null;
        if (!modulePhase) warn(`chess ${chessId}: module ${modId} has no level ${equipLevel}`);
      }
      rec.module = {
        id: modId, name: meta?.uniEquipName || null,
        type: meta ? `${meta.typeName1 || ''}${meta.typeName2 ? '-' + meta.typeName2 : ''}` : null,
        level: equipLevel, active: equipLevel > 0 && !!modulePhase,
      };
    } else if (equipLevel > 0) {
      rec.module = { id: null, name: null, type: null, level: equipLevel, active: false };
    }

    // Module parts flagged isToken upgrade the summons, not the operator (see splitModuleParts).
    const moduleParts = splitModuleParts(modulePhase);

    // Stats at the pass's potential rank (ctx.potRank, withPotential) (+ module attribute bonus on golden).
    const attrs = withPotential(char, interpolateAttrs(char, phase, level), ctx.potRank, `chess ${chessId}`);
    if (!attrs) warn(`chess ${chessId}: cannot interpolate attributes`);
    const bonus = {};
    for (const b of modulePhase?.attributeBlackboard || []) bonus[b.key] = (bonus[b.key] || 0) + b.value;
    rec.stats = statsFrom(attrs, bonus);
    if (rec.stats) rec.immunities = immunitiesOf(attrs);

    // Trait (character trait candidate + module trait override on golden).
    // Trait-effect range (e.g. 散射手 front row, 傀儡师 substitute area) — NOT the attack range.
    const rangeId = char.phases?.[phase]?.rangeId || null;
    const traitDefault = traitRecord(ctx, char, phase, level, moduleParts.op, chessId, ctx.potRank);
    rec.trait = traitDefault.trait;
    rec.rangeId = rangeId;
    rec.rangeGrid = rangeGrid(ctx, rangeId);
    Object.assign(rec, traitDefault.classify);

    // Every skill unlocked at the chess status (DESIGN §16), at the chess skill level; the trigger is
    // resolved per skill (resolveTrigger: charId rows by index, class rows for every MANUAL skill, 技能范围).
    const sIdx = shop.defaultSkillIndex ?? 0;
    const sEntry = char.skills?.[sIdx];
    const skillLevel = status.skillLevel || 1;
    const skillRecs = [];
    (char.skills || []).forEach((se, i) => {
      if (!se?.skillId || (i !== sIdx && !unlocked(se.unlockCond, phase, level))) return;
      const s = buildSkill(ctx, se.skillId, skillLevel, null, `chess ${chessId}`);
      if (!s) return;
      s.trigger = resolveTrigger(ctx, char, body, i, s);
      s.index = i;
      const cast = skillCast(ctx, body, s);
      if (cast) s.cast = cast;
      const bullets = skillBulletMode(ctx, s);
      if (bullets != null) s.bulletMode = bullets;
      if (skillOverload(ctx, s)) s.overload = 1;
      if (skillSilent(ctx, s)) s.charWord = false;
      if (skillRangeHidden(ctx, s)) s.showRange = false;
      if (skillDeployRange(ctx, body, s)) s.passiveRange = true;
      s.overrideTokenKey = se.overrideTokenKey || null;
      skillRecs.push(s);
    });
    // Default skill (unchanged shape: no isDefault flag).
    if (!sEntry?.skillId) warn(`chess ${chessId}: default skill index ${sIdx} not found`);
    else {
      const d = skillRecs.find((s) => s.index === sIdx);
      rec.skill = d ? { ...d } : null;
    }
    rec.skills = skillRecs.map((s) => ({ ...s, isDefault: s.index === sIdx }));

    // Talents at the pass's potential rank (module token parts excluded: they belong to the summons).
    const talentList = baseTalentList(ctx, char, phase, level, `chess ${chessId}`, ctx.potRank, body);
    rec.talents = mergeTalentChanges(talentList, moduleTalentChanges(ctx, moduleParts.op, phase, level, `chess ${chessId}`, ctx.potRank));

    // Selectable modules of the golden chess (DESIGN §16): every ADVANCED uniequip of the character
    // (INITIAL = "no module") at the chess equipLevel, plus the no-module base the choices apply to.
    const moduleAlts = [];
    if (isGolden && equipLevel > 0) {
      rec.statsBase = statsFrom(attrs, {});
      rec.traitBase = traitRecord(ctx, char, phase, level, [], chessId, ctx.potRank).trait;
      rec.talentsBase = mergeTalentChanges(talentList, []);
      rec.modules = [];
      for (const id of uniequip.charEquip?.[body] || []) {
        const meta = uniequip.equipDict?.[id];
        if (!meta || meta.type === 'INITIAL') continue;
        const ph = battleEquip[id]?.phases?.find((p) => p.equipLevel === equipLevel) || null;
        if (!ph) { warn(`chess ${chessId}: module ${id} has no level ${equipLevel} (not selectable)`); continue; }
        const parts = splitModuleParts(ph);
        const hasTraitPart = parts.op.some((pt) => bestCandidate(pt.overrideTraitDataBundle?.candidates, phase, level, ctx.potRank));
        const tr = hasTraitPart ? traitRecord(ctx, char, phase, level, parts.op, chessId, ctx.potRank) : null;
        if (tr && JSON.stringify(tr.classify) !== JSON.stringify(traitDefault.classify)) {
          warn(`chess ${chessId}: module ${id} changes the combat classification (not applied by loadouts)`);
        }
        rec.modules.push({
          uniEquipId: id, name: meta.uniEquipName || null,
          typeName: `${meta.typeName1 || ''}${meta.typeName2 ? '-' + meta.typeName2 : ''}`,
          typeIcon: meta.typeIcon || null, icon: meta.uniEquipIcon || id,
          isDefault: id === modId, level: equipLevel,
          attr: moduleAttr(ph),
          traitOverride: tr ? tr.trait : null,
          talentChanges: moduleTalentChanges(ctx, parts.op, phase, level, `chess ${chessId}`, ctx.potRank),
        });
        if (id !== modId) moduleAlts.push({ id, modulePhase: ph, moduleTokenParts: parts.token });
      }
      if (modId) moduleAlts.push({ id: 'none', modulePhase: null, moduleTokenParts: [] });
    }

    // Tokens / summons: displayTokenDict + default-skill overrideTokenKey + talent tokenKey.
    // A talent tokenKey missing from character_table is a container id (凛御银灰's
    // token_10057_svash2_eagle): the real token is the one the default skill overrides it with.
    const skillToken = sEntry?.overrideTokenKey || null;
    for (const t of [...rec.talents, ...(rec.talentsBase || [])]) {
      if (t.tokenKey && !charTable[t.tokenKey] && skillToken && charTable[skillToken]) {
        t.containerTokenKey = t.tokenKey;
        t.tokenKey = skillToken;
      }
    }
    /** token id → { sources: Set('display'|'skill'|'talent'), count } for a selected skill record. */
    const tokenUse = (skillRec) => {
      const skTok = skillRec?.overrideTokenKey || null;
      const use = new Map();
      const add = (id, src) => { if (!use.has(id)) use.set(id, new Set()); use.get(id).add(src); };
      for (const id of Object.keys(char.displayTokenDict || {})) add(id, 'display');
      if (skTok) add(skTok, 'skill');
      for (const t of rec.talents) {
        const key = t.containerTokenKey ? (skTok && charTable[skTok] ? skTok : t.tokenKey) : t.tokenKey;
        if (key) add(key, 'talent');
      }
      const count = (id) => {
        const tal = rec.talents.find((t) => (t.containerTokenKey ? (skTok && charTable[skTok] ? skTok : t.tokenKey) : t.tokenKey) === id && typeof t.bb.cnt === 'number');
        const skillCnt = skTok === id ? skillRec?.bb?.cnt : undefined;
        return tal ? tal.bb.cnt : typeof skillCnt === 'number' ? skillCnt : null;
      };
      return { use, count };
    };
    const defUse = tokenUse(rec.skill);
    const sources = defUse.use;
    const resolvable = [...sources.keys()].filter((id) => {
      if (charTable[id]) return true;
      // A container id already remapped onto the skill token (see above) is expected; others are anomalies.
      if (!rec.talents.some((t) => t.containerTokenKey === id)) warn(`chess ${chessId}: token ${id} not in character_table (skipped)`);
      return false;
    }).sort(naturalCmp);
    rec.tokens = resolvable;
    const altSkills = rec.skills.filter((s) => s.index !== sIdx);
    for (const s of altSkills) {
      for (const id of tokenUse(s).use.keys()) {
        if (charTable[id] && !resolvable.includes(id)) warn(`chess ${chessId}: token ${id} of skill ${s.skillId} is not listed by the character (loadouts cannot summon it)`);
      }
    }
    for (const tokenId of resolvable) {
      const src = sources.get(tokenId);
      // Per selectable non-default skill: the token skill slot, count and sources change with it.
      const skillAlts = altSkills.map((s) => {
        const u = tokenUse(s);
        return { index: s.index, count: u.count(tokenId), sources: ['talent', 'skill', 'display'].filter((x) => u.use.get(tokenId)?.has(x)) };
      });
      if (!tokenOwners.has(tokenId)) tokenOwners.set(tokenId, []);
      tokenOwners.get(tokenId).push({
        chessId, charId: body, phase, level, skillIndex: sIdx, skillLevel, potRank: ctx.potRank,
        count: defUse.count(tokenId), golden: isGolden, modulePhase, moduleTokenParts: moduleParts.token,
        // 'display' only = listed by the character but not produced by this chess's default skill or talents.
        sources: ['talent', 'skill', 'display'].filter((s) => src.has(s)),
        skillAlts, moduleAlts,
      });
    }

    // Asset ids (URLs are resolved by fetch-assets / data/assets.json).
    const e2Avatar = isGolden && hasE2Art(ctx, body, 'avatar');
    const e2Portrait = isGolden && hasE2Art(ctx, body, 'portrait');
    rec.assets = {
      avatar: e2Avatar ? `${body}_2` : body,
      portrait: `${body}_${e2Portrait ? 2 : 1}`,
      spine: body,
      skillIcon: rec.skill?.iconId || null,
      subProfIcon: `sub_${char.subProfessionId}_icon`,
    };
    // the attack clip of each attack mode and its timing (opAttackAnim; server/sim/ai.js attackTiming)
    rec.attackAnim = opAttackAnim(ctx, body, (char.skills || []).length);
    // the official projectile of each attack mode's normal attack (opShot; server/sim/ai.js opShot)
    rec.shot = opShot(ctx, body, char.skills || []);
    out[chessId] = rec;
  }

  // Integrity: golden ids resolve both ways.
  for (const rec of Object.values(out)) {
    if (!out[rec.baseId]) warn(`chess ${rec.chessId}: baseId ${rec.baseId} missing`);
    if (rec.goldenId && !out[rec.goldenId]) warn(`chess ${rec.chessId}: goldenId ${rec.goldenId} missing`);
  }
  return { chess: out, tokenOwners };
}

// ===== backups (补位 stand-ins, 自选 DIY slots) ===================================================

/**
 * The 自选 picks this server offers (shared/local-diy.js LOCAL_DIY_PICKS, the owner's 선발 operators — 丰川祥子 a
 * collab upstream leaves out): the whole owned-6★ pool of data/backups.json, built in that order. Upstream's 72-operator
 * pool and its prototype picks (原型干员 / 预备干员 at tier 5 and 6) are gone with the hard fork from 0.2.0
 * (2026-10-07): `diy.prototypes` is empty at every slot tier, while the prototypes stay units as 补位 stand-ins.
 */
const DIY_OWNED_PICKS = LOCAL_DIY_PICKS;

/**
 * 自选 picks whose core bonds the official game gives otherwise than their faction tags would, per season: charId → the
 * bond ids it gets (maintainer decision 2026-11-15, from the official 规程 game: 焰影苇草 (nation victoria) and 新约能天使
 * (nation lungmen) get 协防干员, not 维多利亚 / 炎). No table field says so; which rule the server applies to them is not
 * known. buildBackups stops on an entry that is not a pick of the season or names a bond the season lacks.
 */
const DIY_BOND_OVERRIDES = Object.freeze({
  act3autochess: { char_1020_reed2: ['emptyShip'], char_1041_angel2: ['emptyShip'] },
});

const rarityOf = (char) => Number(String(char?.rarity).replace('TIER_', '')) || null;
/**
 * The group tags of a character (`powers`): nationId, groupId and teamId of `mainPower` and of every `subPower`, in that
 * order, without repeats. Operator talents name factions by these tags, never by bonds (the client's
 * `BattleCharacterData.CheckGroupTag`; server/sim/content/kits/shared/powers.js), and the 甄选 pick's core bonds are
 * the bonds whose `powerIdList` meets them (buildBackups).
 */
function powersOf(char) {
  const out = [];
  for (const p of [char?.mainPower ?? { nationId: char?.nationId, groupId: char?.groupId, teamId: char?.teamId }, ...(char?.subPower || [])]) {
    for (const k of ['nationId', 'groupId', 'teamId']) if (p?.[k] && !out.includes(p[k])) out.push(p[k]);
  }
  return out;
}
const statusCmp = (a, b) => a.phase - b.phase || a.level - b.level || a.skillLevel - b.skillLevel || a.equipLevel - b.equipLevel;

/**
 * The character part of a data/backups.json unit (DATA.md §18): who it is, its art ids (the elite form uses the E2 art
 * when it exists, as a chess does) and its module names (a composed record's `module` names the module on the normal
 * form too, where no module phase is built).
 */
function buildUnitHead(ctx, charId) {
  const { charTable, uniequip } = ctx;
  const char = charTable[charId];
  const moduleNames = {};
  for (const id of uniequip.charEquip?.[charId] || []) {
    const meta = uniequip.equipDict?.[id];
    if (meta) moduleNames[id] = { name: meta.uniEquipName || null, typeName: `${meta.typeName1 || ''}${meta.typeName2 ? '-' + meta.typeName2 : ''}` };
  }
  return {
    charId, name: char.name, appellation: char.appellation, rarity: rarityOf(char), profession: char.profession,
    subProfessionId: char.subProfessionId, subProfessionName: uniequip.subProfDict?.[char.subProfessionId]?.subProfessionName || null,
    position: char.position, nationId: char.nationId || null, powers: powersOf(char), isNotObtainable: !!char.isNotObtainable,
    assets: {
      avatar: charId, avatarGolden: hasE2Art(ctx, charId, 'avatar') ? `${charId}_2` : charId,
      portrait: `${charId}_1`, portraitGolden: `${charId}_${hasE2Art(ctx, charId, 'portrait') ? 2 : 1}`,
      spine: charId, subProfIcon: `sub_${char.subProfessionId}_icon`,
    },
    moduleNames,
    attackAnim: opAttackAnim(ctx, charId, (char.skills || []).length),
    shot: opShot(ctx, charId, char.skills || []),
  };
}

/**
 * A unit form (DATA.md §18): the character at one training status with nothing selected — the operator fields of a
 * chess record: stats / trait / talents without a module, every skill unlocked at the status at its skill level (the
 * trigger resolved per skill as for a chess), its summons, and at `equipLevel > 0` every ADVANCED module of that level.
 * The helpers and rules of buildChess; checkUnitFormParity proves the two agree on every PRESET chess.
 * @param {{ chessId?: string|null, skillIndex?: number|null }} [opts] `chessId`: the NORMAL chess id (parity check
 *   only: the label and the trait record); `skillIndex`: a skill listed even when locked (buildChess always lists the
 *   default)
 */
function buildUnitForm(ctx, charId, status, { chessId = null, skillIndex = null } = {}) {
  const { charTable, uniequip, battleEquip } = ctx;
  const char = charTable[charId];
  const { phase, level, skillLevel, equipLevel } = status;
  const label = chessId ? `chess ${chessId}` : `unit ${charId}@${statusKey(status)}`;
  const attrs = withPotential(char, interpolateAttrs(char, phase, level), ctx.potRank, label);
  if (!attrs) warn(`${label}: cannot interpolate attributes`);
  const stats = statsFrom(attrs, {});
  const rangeId = char.phases?.[phase]?.rangeId || null;
  const base = traitRecord(ctx, char, phase, level, [], chessId || charId, ctx.potRank);
  const skills = [];
  (char.skills || []).forEach((se, i) => {
    if (!se?.skillId || (i !== skillIndex && !unlocked(se.unlockCond, phase, level))) return;
    const s = buildSkill(ctx, se.skillId, skillLevel, null, label);
    if (!s) return;
    s.trigger = resolveTrigger(ctx, char, charId, i, s);
    s.index = i;
    const cast = skillCast(ctx, charId, s);
    if (cast) s.cast = cast;
    const bullets = skillBulletMode(ctx, s);
    if (bullets != null) s.bulletMode = bullets;
    if (skillOverload(ctx, s)) s.overload = 1;
    if (skillSilent(ctx, s)) s.charWord = false;
    if (skillRangeHidden(ctx, s)) s.showRange = false;
    if (skillDeployRange(ctx, charId, s)) s.passiveRange = true;
    s.overrideTokenKey = se.overrideTokenKey || null;
    skills.push(s);
  });
  const talents = mergeTalentChanges(baseTalentList(ctx, char, phase, level, label, ctx.potRank, charId), []);
  const modules = [];
  if (equipLevel > 0) {
    for (const id of uniequip.charEquip?.[charId] || []) {
      const meta = uniequip.equipDict?.[id];
      if (!meta || meta.type === 'INITIAL') continue;
      const ph = battleEquip[id]?.phases?.find((p) => p.equipLevel === equipLevel) || null;
      if (!ph) { warn(`${label}: module ${id} has no level ${equipLevel} (not selectable)`); continue; }
      const parts = splitModuleParts(ph);
      const hasTraitPart = parts.op.some((pt) => bestCandidate(pt.overrideTraitDataBundle?.candidates, phase, level, ctx.potRank));
      const tr = hasTraitPart ? traitRecord(ctx, char, phase, level, parts.op, chessId || charId, ctx.potRank) : null;
      if (tr && JSON.stringify(tr.classify) !== JSON.stringify(base.classify)) warn(`${label}: module ${id} changes the combat classification (not applied by loadouts)`);
      modules.push({
        uniEquipId: id, name: meta.uniEquipName || null,
        typeName: `${meta.typeName1 || ''}${meta.typeName2 ? '-' + meta.typeName2 : ''}`,
        typeIcon: meta.typeIcon || null, icon: meta.uniEquipIcon || id, level: equipLevel,
        attr: moduleAttr(ph),
        traitOverride: tr ? tr.trait : null,
        talentChanges: moduleTalentChanges(ctx, parts.op, phase, level, label, ctx.potRank),
      });
    }
  }
  // summons: every id the character lists or a skill / talent / module talent names that character_table has — the
  // composed record keeps the ones its selection produces (shared/standIn.js composeUnitRecord)
  const displayTokens = Object.keys(char.displayTokenDict || {});
  const tokenIds = [...displayTokens, ...skills.map((s) => s.overrideTokenKey), ...talents.map((t) => t.tokenKey),
    ...modules.flatMap((m) => m.talentChanges.map((t) => t.tokenKey))];
  const form = {
    status: { phase, level, skillLevel, equipLevel },
    stats, immunities: stats ? immunitiesOf(attrs) : null,
    rangeId, rangeGrid: rangeGrid(ctx, rangeId),
    ...base.classify,
    trait: base.trait,
    skills, talents,
    displayTokens,
    tokens: [...new Set(tokenIds.filter((id) => id && charTable[id]))].sort(naturalCmp),
  };
  if (equipLevel > 0) form.modules = modules;
  return form;
}

/**
 * data/backups.json (DATA.md §18; DESIGN 0.2.0 draft): the data of 补位 and 自选.
 * - `units`: every character a 补位 or 自选 piece fields, with a form for every status it fights at. First the 17
 *   原型干员 a NORMAL chess names as `backup.charId` (预备干员 char_600–607, the 6★ 罗德岛特派高级资深干员 char_608–615 and
 *   领主·Sharp char_617) at the statuses of the chess it stands in for (normal and elite); then every owned-6★ pick
 *   (`diy.ownedPool`) at the DIY slot statuses — E2 Lv1 skill rank 4 without a module, E2 Lv60 rank 7 with every module
 *   at stage 1 (tier 5) and at stage 3 (tier 6). No unit for a PRESET chess (特许: always the real operator; its backup
 *   is itself) or a DIY slot (no backup).
 * - `tokens`: the summons of the owned picks (buildDiyTokens: tokens.json records whose `variants` are keyed by owner
 *   form, `<charId>@<statusKey>`).
 * - `diy`: the slots (tier, elite id, the shop level that lists them, the rarity requirement), the prototype picks per
 *   slot tier and the skill / module each carries there (`prototypes` / `locked`: empty on this server — DIY_OWNED_PICKS),
 *   the owned-6★ pool (DIY_OWNED_PICKS, each a legal pick: obtainable, not a roster operator) and, for every pick, its
 *   faction ids (`mainPower` and every `subPower`: "依据其「所属势力」「隐藏势力」等属性决定其盟约") and the core bonds whose
 *   `powerIdList` meets them, else `constData.fallbackBondId` (协防干员) — PRTS 「卫戍协议」
 *   "甄选加入的干员会根据其实际阵营所属分配核心盟约，若没有可匹配的则改为分配协防干员盟约".
 */
function buildBackups(ctx, chess) {
  const { act, ac, charTable } = ctx;
  const need = new Map();   // charId → Map(statusKey → status)
  const addNeed = (charId, st) => {
    if (!need.has(charId)) need.set(charId, new Map());
    need.get(charId).set(statusKey(st), st);
  };
  const standsIn = new Map();   // charId → base chess ids
  for (const c of Object.values(chess)) {
    const b = c.backup;
    if (c.chessType !== 'NORMAL' || !b?.charId || b.charId === c.charId) continue;
    if (!charTable[b.charId]) { warn(`chess ${c.chessId}: backup ${b.charId} missing from character_table`); continue; }
    if (b.potRank !== 0) warn(`chess ${c.chessId}: backup potential ${b.potRank} (a 补位 stand-in fights without potential: not applied)`);
    if (b.tmplId) warn(`chess ${c.chessId}: backup template ${b.tmplId} is not built`);
    addNeed(b.charId, c.status);
    if (!c.isGolden) standsIn.set(b.charId, [...(standsIn.get(b.charId) || []), c.chessId]);
  }
  const standInIds = [...standsIn.keys()].sort(naturalCmp);

  const shopLevelOf = {};
  for (const d of Object.values(act.shopLevelDisplayDataDict || {})) for (const id of d.charChessDiySlotIdList || []) shopLevelOf[id] = d.shopLevel;
  const slots = {};
  const prototypes = {};
  const locked = {};
  const requirements = new Set();
  const diyStatuses = new Map();   // statusKey → status of every DIY slot record (both forms)
  for (const s of Object.values(chess).filter((c) => c.isDiy && !c.isGolden).sort((x, y) => naturalCmp(x.chessId, y.chessId))) {
    const golden = chess[s.goldenId];
    if (!golden) continue;
    requirements.add(s.diyRequirement);
    slots[s.chessId] = { tier: s.tier, goldenId: s.goldenId, shopLevel: shopLevelOf[s.chessId] ?? null, requirement: s.diyRequirement };
    for (const rec of [s, golden]) diyStatuses.set(statusKey(rec.status), rec.status);
    prototypes[s.tier] = [];   // no prototype pick on this server (DIY_OWNED_PICKS)
    locked[s.tier] = {};
  }

  // the owned picks: each must be a legal 自选 operator — a character of a slot's rarity, obtainable, not a TOKEN / TRAP
  // and not a roster operator (no chess names it, hidden chess included: "不可甄选加入已在名单中的固定干员")
  const roster = new Set(Object.values(act.charShopChessDatas).map((r) => r.charId).filter(Boolean));
  const ownedPool = DIY_OWNED_PICKS.filter((id) => {
    const ch = charTable[id];
    const legal = !!ch && requirements.has(ch.rarity) && ch.profession !== 'TOKEN' && ch.profession !== 'TRAP'
      && !ch.isNotObtainable && !roster.has(id);
    if (!legal) warn(`DIY_OWNED_PICKS: ${id} is not a legal 自选 pick (left out)`);
    return legal;
  });
  for (const id of ownedPool) for (const st of diyStatuses.values()) addNeed(id, st);

  const units = {};
  for (const id of [...standInIds, ...ownedPool]) {
    const unit = buildUnitHead(ctx, id);
    unit.standsIn = (standsIn.get(id) || []).sort(naturalCmp);
    unit.forms = {};
    for (const st of [...need.get(id).values()].sort(statusCmp)) {
      const form = buildUnitForm(ctx, id, st);
      if (form.tokens.length && unit.standsIn.length) warn(`unit ${id}@${statusKey(st)}: summons ${form.tokens.join(', ')} have no tokens.json variant for a stand-in owner`);
      unit.forms[statusKey(st)] = form;
    }
    units[id] = unit;
  }
  for (const id of need.keys()) if (!units[id]) warn(`unit ${id}: needed but neither a stand-in nor an owned pick`);
  const tokens = buildDiyTokens(ctx, units, ownedPool);

  // the season's own bonds only: 规程's global bondInfoDict still lists 盟约's 拉特兰 (lateranoShip), which that season
  // fields no longer — a pick of its power falls back like any pick without a core bond of the season
  const coreBonds = Object.values(ac.bondInfoDict || {})
    .filter((b) => b.isPower && (b.powerIdList || []).length && act.bondInfoDict?.[b.bondId]);
  const fallback = act.constData.fallbackBondId;
  const overrides = DIY_BOND_OVERRIDES[SEASON] || {};
  for (const [id, bonds] of Object.entries(overrides)) {
    if (!ownedPool.includes(id)) throw new Error(`DIY_BOND_OVERRIDES.${SEASON}: ${id} is not a 自选 pick of the season`);
    for (const b of bonds) if (!act.bondInfoDict?.[b]) throw new Error(`DIY_BOND_OVERRIDES.${SEASON}.${id}: the season has no bond ${b}`);
  }
  const operators = {};
  for (const id of ownedPool) {
    const ch = charTable[id];
    const powers = powersOf(ch);
    const hit = coreBonds.filter((b) => b.powerIdList.some((x) => powers.includes(x))).map((b) => b.bondId);
    operators[id] = {
      name: ch.name, rarity: rarityOf(ch), profession: ch.profession, subProfessionId: ch.subProfessionId,
      obtainable: !ch.isNotObtainable, powers, bonds: overrides[id] ? [...overrides[id]] : hit.length ? hit : [fallback],
    };
  }
  return { units, tokens, diy: { slots, prototypes, locked, ownedPool, operators } };
}

/**
 * The stand-in forms come from buildUnitForm, not buildChess: prove the two agree. Every PRESET chess is its own backup
 * (charShopChessDatas: backupCharId = charId with the default skill and module), so its own unit form composed with
 * that selection (shared/standIn.js composeUnitRecord) must give back the chess record field for field — a chess field
 * that is neither an identity field (IDENTITY_FIELDS) nor set by composeUnitRecord fails here as well.
 * @returns {string[]} errors
 */
function checkUnitFormParity(ctx, chess) {
  const errors = [];
  for (const c of Object.values(chess)) {
    if (c.chessType !== 'PRESET' || c.backup?.charId !== c.charId) continue;
    if (c.backup.skillIndex !== c.skill?.index || (c.backup.uniEquipId ?? null) !== (c.module?.id ?? null)) {
      errors.push(`unit parity ${c.chessId}: the backup skill / module differ from the chess default`);
      continue;
    }
    // a chess built from a character template (buildChess `tmplId`) is its own backup in that template
    const body = c.tmplId ?? c.charId;
    if ((c.backup.tmplId ?? null) !== (c.tmplId ?? null)) { errors.push(`unit parity ${c.chessId}: the backup template differs from the chess's`); continue; }
    const form = buildUnitForm(ctx, body, c.status, { chessId: c.baseId, skillIndex: c.skill.index });
    const composed = composeUnitRecord(c, buildUnitHead(ctx, body), form, { skillIndex: c.backup.skillIndex, moduleId: c.backup.uniEquipId });
    // the composed record names its body; a template chess keeps the operator as charId and the body as tmplId
    const rec = c.tmplId ? { ...composed, charId: c.charId, tmplId: c.tmplId } : composed;
    if (!isDeepStrictEqual(rec, c)) {
      const keys = [...new Set([...Object.keys(rec || {}), ...Object.keys(c)])].filter((k) => !isDeepStrictEqual(rec?.[k], c[k]));
      errors.push(`unit parity ${c.chessId}: buildUnitForm + composeUnitRecord differ from buildChess in ${keys.join(', ')}`);
    }
  }
  return errors;
}

// ===== tokens ===================================================================================

/** Classify a token / map character (heal tokens have no MEDIC profession). */
function classifyToken(char, traitText) {
  const c = classifyAttack(char, traitText);
  if (char.profession === 'TOKEN' || char.profession === 'TRAP') {
    const t = traitText || '';
    if (/恢复[^。，]*生命/.test(t) && !/攻击造成/.test(t)) {
      return { ...c, dmgType: 'heal', attackKind: 'heal', projectile: 'orb', canHitFly: false };
    }
    if (char.position === 'ALL' && c.attackKind === 'melee') {
      return { ...c, attackKind: 'ranged', projectile: c.dmgType === 'arts' ? 'bolt' : 'arrow', canHitFly: true };
    }
  }
  return c;
}

/** The blackboard keys of a summon's own talents that add to its deploy limit / holding (statsFrom: deployLimit / deckStack). */
const TOKEN_DECK_KEYS = Object.freeze(['max_deploy_count', 'max_deck_stack_cnt']);

/**
 * A summon's talent additions to its deploy limit and holding: the blackboard keys `max_deploy_count` /
 * `max_deck_stack_cnt` of the token's own talents — the hidden "TOKEN数+N" talent of 麦哲伦's drones and 令's summons
 * (E2: max_deck_stack_cnt 5, max_deploy_count 2), of 白铁's devices (E2: 3, 1), the visible 转瞬即逝的幻影 of 夜莺's
 * 幻影 (max_deploy_count 2) — which the client adds to the attribute frame's maxDeployCount / maxDeckStackCnt (statsFrom
 * reads the frame only): PRTS 幻影 备注 "每次部署夜莺时获得2个可部署的幻影，最大可部署数量为3" (1 + 2); the owners' own
 * talents "最多同时部署3个" (麦哲伦 / 令: 1 + 2), "最多可部署2个" (白铁: 1 + 1); SUM-Y stage 2+ "最多同时部署4个" — its token part
 * (the same talent, max_deploy_count 3) replaces the talent's values. The candidates as everywhere: the token's phase /
 * level at its owner's potential rank (`potRank`, ctx.potRank: 望's 棋子 takes its rank-2 candidate, +1 持有 / 部署 —
 * 望's 潜能 3 「第一天赋效果增强」); a module's token part (`moduleTokenParts`, unlocked at the owner's
 * phase / level as moduleTalentChanges) replaces the base candidate of the same prefabKey key by key (mergeTalentChanges:
 * what it does not restate stays) — matched by prefabKey, not talentIndex (夜莺's RIN-Y stage 3 part names talentIndex 0
 * for her 幻影's talent 1). The hand count of a placeable summon is this deploy limit (PRTS 卫戍协议/帮助 "根据召唤物部署数量
 * 上限（非初始持有量），发送等量召唤物至手牌区"; gamedata / player/diy.js placeableTokens).
 * @returns {Record<string, number>} the non-zero additions by blackboard key
 */
function tokenTalentDeckBonus(char, phase, level, moduleTokenParts, modPhase, modLevel, potRank = 0) {
  const byKey = new Map();
  const take = (c, merge) => {
    if (!c) return;
    const key = String(c.prefabKey ?? '');
    const bb = {};
    for (const b of c.blackboard || []) if (TOKEN_DECK_KEYS.includes(b.key) && typeof b.value === 'number') bb[b.key] = b.value;
    byKey.set(key, merge ? { ...(byKey.get(key) || {}), ...bb } : bb);
  };
  for (const t of char.talents || []) take(bestCandidate(t?.candidates, phase, level, potRank), false);
  for (const part of moduleTokenParts || []) take(bestCandidate(part?.addOrOverrideTalentDataBundle?.candidates, modPhase, modLevel, potRank), true);
  const out = {};
  for (const bb of byKey.values()) for (const [k, v] of Object.entries(bb)) out[k] = (out[k] || 0) + v;
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

/**
 * Build one owner-specific variant of a token / map character at (phase, level, skill level). Its stats add the module's
 * token attributes and the summon's talent additions to its deploy limit / holding (tokenTalentDeckBonus). Its talent /
 * trait candidates are picked at `potRank`, its owner's potential rank (ctx.potRank; a map character: 0); the owner's
 * potential attribute modifiers never reach it.
 * @returns {object}
 */
function tokenVariant(ctx, tokenId, char, { phase, level, skillIndex, skillLevel, modulePhase, moduleTokenParts, label, potRank = 0 }) {
  const ph = Math.min(phase, (char.phases?.length || 1) - 1);
  const lv = Math.min(level, char.phases?.[ph]?.maxLevel || level);
  const bonus = {};
  const tokBonus = modulePhase?.tokenAttributeBlackboard?.[tokenId];
  for (const b of Array.isArray(tokBonus) ? tokBonus : []) bonus[b.key] = (bonus[b.key] || 0) + b.value;
  for (const [k, v] of Object.entries(tokenTalentDeckBonus(char, ph, lv, moduleTokenParts, phase, level, potRank))) bonus[k] = (bonus[k] || 0) + v;
  const attrs = interpolateAttrs(char, ph, lv);
  const tc = bestCandidate(char.trait?.candidates, ph, lv, potRank);
  const tbb = flattenBB(tc?.blackboard);
  // The owner's module parts flagged isToken upgrade the token's trait/talents. Their unlock
  // conditions refer to the owner's phase/level (the token's own level may be clamped lower).
  const ownerPhase = phase, ownerLevel = level;
  const traitMod = applyModuleTraitParts(moduleTokenParts, ownerPhase, ownerLevel, tbb,
    tc?.overrideDescripton || char.description || '', null, label, potRank);
  const tp = textPair(traitMod.template, traitMod.descBB.bb, traitMod.descBB.bbStr, `${label} trait`);
  const moduleTrait = traitMod.moduleText ? textPair(traitMod.moduleText, tbb.bb, tbb.bbStr, `${label} module trait`) : null;
  // Token skill: same index as the owner's skill when present, else the first defined one.
  const skills = char.skills || [];
  let sIdx = skills[skillIndex]?.skillId ? skillIndex : skills.findIndex((x) => x && x.skillId);
  const sId = sIdx >= 0 ? skills[sIdx].skillId : null;
  const skill = sId ? buildSkill(ctx, sId, skillLevel, null, label) : null;
  if (skill) {
    skill.trigger = resolveTrigger(ctx, char, tokenId, sIdx, skill);
    skill.index = sIdx;
  }
  return {
    phase: ph, level: lv,
    stats: statsFrom(attrs, bonus),
    immunities: immunitiesOf(attrs),
    rangeGrid: rangeGrid(ctx, char.phases?.[ph]?.rangeId),
    trait: {
      desc: tp.desc, descRaw: tp.descRaw, bb: tbb.bb, bbStr: tbb.bbStr,
      ...(moduleTrait ? { moduleDesc: moduleTrait.desc, moduleDescRaw: moduleTrait.descRaw } : {}),
    },
    ...classifyToken(char, tp.desc),
    skill,
    talents: buildTalents(ctx, char, ph, lv, moduleTokenParts, label, ownerPhase, ownerLevel, potRank),
  };
}

/** Convert an enemy_database record (already merged) into ally-token stats (used for 炎佑). */
function enemyAsTokenStats(e) {
  return {
    maxHp: e.stats.maxHp, atk: e.stats.atk, def: e.stats.def, res: e.stats.res, cost: 0, blockCnt: 0,
    bat: e.stats.bat, aspd: e.stats.aspd, respawnTime: 0, spRecovery: 0, hpRecoveryPerSec: e.stats.hpRecoveryPerSec,
    // deployLimit 2: 【炎】9 summons two 炎佑 (bonds.yanShip); 6 summons one.
    moveSpeed: e.stats.moveSpeed, tauntLevel: e.stats.tauntLevel, massLevel: e.stats.massLevel, deployLimit: 2, deckStack: 0,
    rangeRadius: e.stats.rangeRadius,
  };
}

/**
 * Abnormal effects (异常效果) summons hold from the start that no official table carries — the PRTS summon pages
 * (召唤物 备注 "持有…"; user playtest #6 item 18). tokens.json `abnormal`; the sim gives the unit the matching flags
 * (Battle._setupUnit):
 *   healFree — 禁疗 (HEAL_FREE, PRTS 异常效果 "无法成为治疗类能力的目标，且受到的治疗量变为0"): “小自在”, “耀阳”, 斯卡蒂的海嗣,
 *              沙之碑, 流形, 狼群, 迷迭香的战术装备, 黄金盟誓, 保护目标（冻结状态） (圣聆初雪 S2's frozen target);
 *   isolated — 孤立 (ALLY_TARGET_FREE, "无法被同阵营选中": no heal and no ally selection reaches it): “炎佑” (PRTS “炎佑”
 *              天赋 "特殊机制|我方单位，孤立，可同时攻击3个目标"), 从不混淆的方向 (备注 "持有无敌、孤立…").
 */
const TOKEN_ABNORMAL = Object.freeze({
  token_10015_dusk_drgn: ['healFree'],        // “小自在”
  token_10019_nearl2_sword: ['healFree'],     // “耀阳”
  token_10017_skadi2_dedant: ['healFree'],    // 斯卡蒂的海嗣 (also 无敌)
  token_10011_beewax_oblisk: ['healFree'],    // 沙之碑
  token_10030_mlyss_wtrman: ['healFree'],     // 流形
  token_10028_vigil_wolf: ['healFree'],       // 狼群
  token_10012_rosmon_shield: ['healFree'],    // 迷迭香的战术装备
  token_10040_siege2_vlion: ['healFree'],     // 黄金盟誓
  token_10058_sbell2_icetgt: ['healFree'],    // 保护目标（冻结状态） (圣聆初雪 S2; also 无法撤退)
  token_10039_ulpia_block: ['isolated'],      // 从不混淆的方向 (also 无敌)
  enemy_9012_acloon: ['isolated'],            // “炎佑”
});

/**
 * Summon deployment positions the client's token row gets wrong, from the PRTS summon pages: 望's 棋子 — PRTS 棋子
 * 部署位置 "全部位", 备注 "游戏内召唤物信息与实际不符（显示为仅部署在近战位）" (character_table: MELEE). The record's `position`
 * (the prep's placement class, board.js positionClass) takes this value.
 */
const TOKEN_POSITION_CORRECTIONS = Object.freeze({
  token_10064_wang_stone1: 'ALL',   // 棋子
});

/**
 * The tokens.json record of a summon (buildTokens; the 自选 picks' summons, buildDiyTokens) from its per-owner
 * `variants` (key → variant; `owners` = the keys, in order; the defaults are the first owner's variant).
 * Hand cards placed during the prep phase (`placeable`) are the MANUALLY DEPLOYABLE summons (PRTS 卫戍协议/帮助
 * §战斗部署: "如果部署的干员拥有可手动部署的附属召唤物，则该召唤物会立刻加入手牌区"; user playtest #6): the shop
 * state's tokenDisplayType DEFAULT — 赫默's 医疗探机 and 巫恋's 诅咒娃娃 (skill summons) as well as 浊心斯卡蒂's 海嗣,
 * 伺夜's 狼群 and 缪尔赛思's 流形 (talent summons) — and a summon the shop state does not list at all: 凯瑟琳's
 * 爬行号·防护单元 (talent "携带3个支援装置（最多部署2个）", deployed by hand in the base game; a friend of the user:
 * placed by hand officially; confirmed by the user after playtest #6 — DESIGN §20). It is the only pool summon
 * missing from shopStateTokenDict (every other one is listed, as are newer tokens such as 10040, 10042, 10043,
 * 10055–10058, 10065), so no entry is read as the default display. HIDDEN tokens exist in battle only (e.g.
 * 投递坐标 — PRTS: "携带技能【使命必达！】的新约能天使，不会提供所属召唤物"). Only a token its owner actually makes
 * (`produced`: a talent or a skill of some loadout, `sources`) is a card; which loadouts make it is per variant
 * (`sources`, `bySkill[i].sources`: 赫默 / 巫恋 on S1 get none). And only a token an owner shows (`displayed`: the owner's
 * displayTokenDict, the variants' `display` source): a summon no owner shows is its skill's own object, never a card —
 * every such token of the season is HIDDEN in the shop state (纸偶, 香槟炸弹, 从不混淆的方向, …), and the one the shop state
 * does not list is 予愿安洁莉娜 S3's “一会儿见！” (PRTS 予愿安洁莉娜 S3 备注 "每次移动后若不位于初始位置…于初始位置部署一个
 * “一会儿见！”", PRTS “一会儿见！” "无法被玩家选择查看详细信息"; O20) — every summon a player places is displayed. In battle a
 * skill's summon deploys once at the start, then takes its tile again each time the skill gives one
 * (sim/content/tokens.js dockSkillSummons, shared/constants.js SKILL_SUMMON_START_DEPLOY).
 * `ownerRange`: the token text "只能部署在召唤者攻击范围内" (the tacticians' 援军 — 伺夜's 狼群, 缪尔赛思's 流形; PRTS 狼群
 * 特性) or an owner's talent naming it "可以在攻击范围内(的地面)部署 / 使用…" (`ownerTexts`: Mon3tr's 重构体 "可以在攻击范围内的地面
 * 使用一个…重构体", 0.2.0 WE2; 莱伊's 沙地兽, whose text says it too): its hand piece may only be placed on a tile of its
 * owner's attack range (server/match/board.js ownerRangeKeys, PlayerState._legal; player report #9 after 0.1.0: 伺夜's
 * tactical point could go anywhere). `ownerRangeOutside` (present when true): the token text "部署在…攻击范围外" — the
 * piece may only stand OUTSIDE its owner's attack range; `rangedTilesOnly` (present when true): "仅可以部署在…远程位" — only
 * on a ranged (高台) tile, the mode's "所有行动内远程干员可部署在近战位" being an operators' rule: 凯尔希·思衡托's 战术锚点
 * "仅可以部署在凯尔希·思衡托攻击范围外的远程位" (PRTS 战术锚点 特性; 0.2.0 WE2, O24). `ownerBeside` (present when true): an owner's
 * talent reads "…只能放置于…四周" — the piece may only stand on one of the four tiles next to its owner: 涤火杰西卡's 机动盾牌.
 * `abnormal` = TOKEN_ABNORMAL (PRTS); `position` = TOKEN_POSITION_CORRECTIONS (PRTS) or the token row's.
 */
function summonRecord(ctx, tokenId, char, variants, produced, ownerTexts = []) {
  const displayType = ctx.ac.shopStateTokenDict?.[tokenId]?.tokenDisplayType || null;
  const owners = Object.keys(variants);
  const first = variants[owners[0]];
  const text = stripRich(first.trait.desc) || '';
  const ownerRange = /只能部署在\S*攻击范围内/.test(text) || ownerTexts.some((d) => /可以在攻击范围内(?:的[^，。；]*?)?(?:部署|使用)/.test(stripRich(d) || ''));
  const ownerRangeOutside = /部署在[^，。；]*攻击范围外/.test(text);
  const rangedTilesOnly = /仅可以部署在[^，。；]*远程位/.test(text);
  const ownerBeside = ownerTexts.some((d) => /只能放置于[^，。；]*四周/.test(stripRich(d) || ''));
  const shows = (list) => Array.isArray(list) && list.includes('display');
  const displayed = Object.values(variants).some((v) => shows(v.sources) || Object.values(v.bySkill || {}).some((a) => shows(a.sources)));
  return {
    tokenId, kind: 'summon', name: char.name, appellation: char.appellation || null,
    desc: stripRich(first.trait.desc), descRaw: first.trait.descRaw,
    profession: char.profession, subProfessionId: char.subProfessionId, position: TOKEN_POSITION_CORRECTIONS[tokenId] ?? char.position,
    displayType, placeable: displayType !== 'HIDDEN' && produced && displayed, ownerRange,
    ...(ownerRangeOutside ? { ownerRangeOutside: true } : null), ...(rangedTilesOnly ? { rangedTilesOnly: true } : null),
    ...(ownerBeside ? { ownerBeside: true } : null),
    owners,
    // Defaults = first owner's variant; per-owner data in variants[owner].
    stats: first.stats, rangeGrid: first.rangeGrid, dmgType: first.dmgType, attackKind: first.attackKind,
    projectile: first.projectile, canHitFly: first.canHitFly,
    skill: first.skill ? { skillId: first.skill.skillId, bb: first.skill.bb } : null,
    deployLimit: first.stats?.deployLimit ?? 1,
    count: first.count,
    abnormal: TOKEN_ABNORMAL[tokenId] ? [...TOKEN_ABNORMAL[tokenId]] : [],
    // its prefab's attack clip and ability timing (tokenAttackAnim; server/sim/ai.js attackTiming)
    ...withAttackAnim(tokenAttackAnim(ctx, tokenId)),
    variants,
    assets: { avatar: tokenId, spine: tokenId },
  };
}

/**
 * The summons of the 自选 owned picks (data/backups.json `tokens`, DATA.md §18): one summonRecord per token whose
 * `variants` are keyed by the owner FORM, `<charId>@<statusKey>` (shared/diy.js diyTokenOwner), never by a chess id — a
 * DIY piece is a slot, and two players may fill the same slot with different operators. A variant is the token at the
 * owner's status (the owner's phase / level / skill level, as for a chess owner) for the owner's FIRST skill and no
 * module; `bySkill[i]` the token skill, count and sources under each other skill, `byModule[id]` the module token
 * attributes / trait / talents under each module of the form — the chess variant shape (DESIGN §16), applied with the
 * pick as the owner's loadout (simdata getToken, content/tokens.js withLoadout). `count` / `sources` come from the
 * owner's no-module talents and the selected skill, as buildChess's `tokenUse`.
 * @param {object} units backups `units`
 * @param {string[]} owned the owned-6★ picks (their forms are the DIY slot statuses)
 */
function buildDiyTokens(ctx, units, owned) {
  const { charTable, battleEquip } = ctx;
  const owners = new Map();   // tokenId → [{ key, variant, produced }]
  const makes = (list) => list.includes('talent') || list.includes('skill');
  for (const charId of owned) {
    for (const [key, form] of Object.entries(units[charId]?.forms || {})) {
      if (!form.tokens.length) continue;
      const { phase, level, skillLevel, equipLevel } = form.status;
      /** token id → its sources under `skill` (buildChess tokenUse), and the count a talent / the skill sends */
      const tokenUse = (skill) => {
        const skTok = skill?.overrideTokenKey || null;
        const use = new Map();
        const add = (id, src) => { if (!use.has(id)) use.set(id, new Set()); use.get(id).add(src); };
        for (const id of form.displayTokens) add(id, 'display');
        if (skTok) add(skTok, 'skill');
        for (const t of form.talents) if (t.tokenKey) add(t.tokenKey, 'talent');
        const count = (id) => {
          const tal = form.talents.find((t) => t.tokenKey === id && typeof t.bb.cnt === 'number');
          const skillCnt = skTok === id ? skill?.bb?.cnt : undefined;
          return tal ? tal.bb.cnt : typeof skillCnt === 'number' ? skillCnt : null;
        };
        const sources = (id) => ['talent', 'skill', 'display'].filter((x) => use.get(id)?.has(x));
        return { count, sources };
      };
      const [first, ...alts] = form.skills;
      for (const tokenId of form.tokens) {
        const tchar = charTable[tokenId];
        const label = `token ${tokenId}@${charId}@${key}`;
        const at = (o) => tokenVariant(ctx, tokenId, tchar, { phase, level, skillIndex: first.index, skillLevel, modulePhase: null, moduleTokenParts: [], label, potRank: ctx.potRank, ...o });
        const u0 = tokenUse(first);
        const v = { ...at({}), count: u0.count(tokenId), sources: u0.sources(tokenId) };
        let produced = makes(v.sources);
        if (alts.length) {
          v.bySkill = {};
          for (const s of alts) {
            const u = tokenUse(s);
            v.bySkill[s.index] = { skill: at({ skillIndex: s.index }).skill, count: u.count(tokenId), sources: u.sources(tokenId) };
            produced = produced || makes(v.bySkill[s.index].sources);
          }
        }
        if (equipLevel > 0 && form.modules?.length) {
          v.byModule = {};
          for (const m of form.modules) {
            const ph = battleEquip[m.uniEquipId]?.phases?.find((p) => p.equipLevel === equipLevel) || null;
            const tv = at({ modulePhase: ph, moduleTokenParts: splitModuleParts(ph).token });
            v.byModule[m.uniEquipId] = { stats: tv.stats, immunities: tv.immunities, trait: tv.trait, talents: tv.talents };
          }
        }
        if (!owners.has(tokenId)) owners.set(tokenId, []);
        const texts = form.talents.filter((t) => t.tokenKey === tokenId).map((t) => t.desc || '');
        owners.get(tokenId).push({ key: `${charId}@${key}`, variant: v, produced, texts });
      }
    }
  }
  const out = {};
  for (const tokenId of [...owners.keys()].sort(naturalCmp)) {
    const list = owners.get(tokenId);
    out[tokenId] = summonRecord(ctx, tokenId, charTable[tokenId], Object.fromEntries(list.map((o) => [o.key, o.variant])), list.some((o) => o.produced), list.flatMap((o) => o.texts));
  }
  return out;
}

/**
 * Build data/tokens.json: summons of chess (per-owner variants), bond summons (炎佑) and band map
 * characters (band_amedic 预备干员-医疗 / Touch). `abnormal` = TOKEN_ABNORMAL (PRTS).
 */
function buildTokens(ctx, chess, tokenOwners, enemies) {
  const { charTable } = ctx;
  const out = {};
  for (const tokenId of [...tokenOwners.keys()].sort(naturalCmp)) {
    const char = charTable[tokenId];
    const owners = tokenOwners.get(tokenId);
    const variants = {};
    for (const o of owners) {
      const label = `token ${tokenId}@${o.chessId}`;
      const v = variants[o.chessId] = {
        ...tokenVariant(ctx, tokenId, char, { ...o, label }),
        count: o.count,
        sources: o.sources,
      };
      // Owner loadouts (DESIGN §16): a non-default owner skill selects the token skill of the same
      // slot (and may change how many are sent / whether the chess produces it at all); a non-default
      // owner module (or none) changes the module token attributes / isToken trait & talent parts.
      if (o.skillAlts?.length) {
        v.bySkill = {};
        for (const alt of o.skillAlts) {
          const tv = tokenVariant(ctx, tokenId, char, { ...o, skillIndex: alt.index, label });
          v.bySkill[alt.index] = { skill: tv.skill, count: alt.count, sources: alt.sources };
        }
      }
      if (o.moduleAlts?.length) {
        v.byModule = {};
        for (const alt of o.moduleAlts) {
          const tv = tokenVariant(ctx, tokenId, char, { ...o, modulePhase: alt.modulePhase, moduleTokenParts: alt.moduleTokenParts, label });
          v.byModule[alt.id] = { stats: tv.stats, immunities: tv.immunities, trait: tv.trait, talents: tv.talents };
        }
      }
    }
    const makes = (list) => (list || []).some((s) => s === 'talent' || s === 'skill');
    const produced = owners.some((o) => makes(o.sources) || (o.skillAlts || []).some((a) => makes(a.sources)));
    const ownerTexts = owners.flatMap((o) => (chess[o.chessId]?.talents || []).filter((t) => t.tokenKey === tokenId).map((t) => t.desc || ''));
    out[tokenId] = summonRecord(ctx, tokenId, char, variants, produced, ownerTexts);
  }

  // 炎佑 (yanShip 6-member summon) — allied flying unit built from its enemy template.
  const loon = enemies['enemy_9012_acloon'];
  if (loon) {
    out['enemy_9012_acloon'] = {
      tokenId: 'enemy_9012_acloon', kind: 'bondSummon', bondId: 'yanShip', name: loon.name, appellation: null,
      desc: '【炎】6名成员激活时召唤的友方单位；开战时攻击力/生命值增加【炎】干员攻击力/生命值总和的30%（见 bonds.json yanShip）',
      descRaw: null, profession: 'TOKEN', subProfessionId: null, position: 'NONE', motion: loon.stats.motion,
      displayType: null, placeable: false, ownerRange: false, owners: [],
      stats: enemyAsTokenStats(loon), rangeGrid: null, dmgType: loon.stats.dmgType, attackKind: 'ranged',
      projectile: 'bolt', canHitFly: true, skill: loon.skills?.[0] ? { skillId: loon.skills[0].prefabKey, bb: loon.skills[0].bb } : null,
      skills: loon.skills, talents: loon.talents, deployLimit: 2, count: 1,
      // its enemy prefab's attack clip and ability timing (enemies.json `attackAnim`): the strike waits for its OnAttack frame
      attackAnim: loon.attackAnim ?? null,
      abnormal: [...TOKEN_ABNORMAL.enemy_9012_acloon], variants: {},
      assets: { avatar: loon.iconId, spine: loon.spine, isEnemyModel: true },
    };
  } else warn('炎佑 enemy_9012_acloon missing from enemies');

  // Band map characters (auto_chess_change_map in aceffect_band_61): read from any stage predefine.
  const mapChars = new Map();
  for (const stageId of ctx.stageIds) {
    for (const ci of ctx.levels[stageId]?.predefines?.characterInsts || []) {
      const key = ci.inst?.characterKey;
      if (!key) continue;
      if (!mapChars.has(key)) mapChars.set(key, { inst: ci, positions: [] });
      const m = mapChars.get(key);
      if (!m.positions.some((p) => p.alias === ci.alias)) {
        m.positions.push({ alias: ci.alias, pos: [ci.position.row, ci.position.col], dir: ci.direction, multiOnly: /multi_only/.test(ci.alias || '') });
      }
    }
  }
  for (const [charId, { inst, positions }] of [...mapChars].sort((a, b) => naturalCmp(a[0], b[0]))) {
    const char = charTable[charId];
    if (!char) { warn(`map character ${charId} missing from character_table`); continue; }
    const v = tokenVariant(ctx, charId, char, {
      phase: phaseIdx(inst.inst.phase), level: inst.inst.level || 1, skillIndex: inst.skillIndex ?? 0,
      skillLevel: inst.mainSkillLvl || 1, modulePhase: null, label: `mapChar ${charId}`, potRank: 0,
    });
    out[charId] = {
      tokenId: charId, kind: 'mapChar', name: char.name, appellation: char.appellation || null,
      desc: v.trait.desc, descRaw: v.trait.descRaw, profession: char.profession, subProfessionId: char.subProfessionId,
      position: char.position, displayType: null, placeable: false, ownerRange: false, owners: [],
      stats: v.stats, rangeGrid: v.rangeGrid, dmgType: v.dmgType, attackKind: v.attackKind, projectile: v.projectile,
      canHitFly: v.canHitFly, skill: v.skill, talents: v.talents, trait: v.trait, phase: v.phase, level: v.level,
      deployLimit: 1, count: 1, abnormal: [], positions: positions.sort((a, b) => naturalCmp(a.alias, b.alias)), variants: {},
      assets: { avatar: charId, spine: charId },
      source: 'band_amedic (aceffect_band_61 auto_chess_change_map)',
    };
  }
  return out;
}

// ===== effects (shared by bonds / items / bands / choices) =======================================

/** Buff list of an effect: [{ key, countType, bb, bbStr }]. */
function effectBuffs(ctx, effectId) {
  return (ctx.act.effectBuffInfoDataDict?.[effectId] || []).map((b, i) => {
    const { bb, bbStr } = flattenBB(b.blackboard, `effect ${effectId} buff ${i}`);
    return { key: b.key, countType: b.countType || 'NONE', bb, bbStr };
  });
}
/**
 * 规程's placeholder keys of an effect's text (effectDescParamDataDict[effectId].descParamInfos: descParamBase,
 * descParamPerStack, descParamMax — 0 for no cap); [] for 盟约, whose bond records list them. A key the effect's
 * blackboards lack, or whose value is not a number, stops the build: the text would show 0 for it (upstream PR #929).
 * @returns {Array<{ base: string|null, perStack: string|null, max: number }>}
 */
function effectDescParams(ctx, effectId) {
  const list = ctx.act.effectDescParamDataDict?.[effectId]?.descParamInfos;
  if (!Array.isArray(list)) return [];
  const out = list.map((x) => ({ base: x.descParamBase || null, perStack: x.descParamPerStack || null, max: Number(x.descParamMax) || 0 }));
  checkDescParamKeys(effectParams(effectBuffs(ctx, effectId)), out.flatMap((x) => [x.base, x.perStack]), `effectDescParamDataDict ${effectId}`);
  return out;
}
/** Stop the build on a text placeholder key that `params` (an effect's flattened blackboards) lacks or holds as a non-number. */
function checkDescParamKeys(params, keys, where) {
  for (const k of keys) {
    if (k == null) continue;
    if (!Object.hasOwn(params, k)) throw new Error(`${where}: placeholder key ${k} is in no blackboard of the effect`);
    if (typeof params[k] !== 'number' || !Number.isFinite(params[k])) throw new Error(`${where}: placeholder key ${k} is ${JSON.stringify(params[k])}, not a number`);
  }
}
/** Flattened params of all buffs of an effect (first occurrence wins; string values included). */
function effectParams(buffs) {
  const params = {};
  for (const b of buffs) {
    for (const [k, v] of Object.entries({ ...b.bb, ...b.bbStr })) if (!(k in params)) params[k] = v;
  }
  return params;
}

/**
 * Build data/effects.json: every effect of the season (effectInfoDataDict + effectBuffInfoDataDict):
 * bands, bonds, equipment, 机变 choices, enemy modifiers, char-map entries.
 */
function buildEffects(ctx) {
  const out = {};
  for (const effectId of Object.keys(ctx.act.effectInfoDataDict).sort(naturalCmp)) {
    const e = ctx.act.effectInfoDataDict[effectId];
    const buffs = effectBuffs(ctx, effectId);
    out[effectId] = {
      effectId, effectType: e.effectType, name: e.effectName || null,
      desc: stripRich(e.effectDesc), descRaw: richRaw(e.effectDesc),
      counterType: e.effectCounterType || 'NONE', continuedRound: e.continuedRound ?? -1,
      decoIconId: e.effectDecoIconId || null, enemyPrice: e.enemyPrice || 0,
      buffs, params: effectParams(buffs),
    };
    const dpi = effectDescParams(ctx, effectId);
    // 规程: the {i:fmt} keys of the text (a direction switch shows another effect's text: ui/bondStrip.js swappedBond)
    if (dpi.length) out[effectId].descParams = dpi.map((x) => (x.max > 0 ? x : { base: x.base, perStack: x.perStack }));
  }
  for (const id of Object.keys(ctx.act.effectBuffInfoDataDict)) {
    if (!out[id]) warn(`effectBuffInfoDataDict has ${id} without effectInfoDataDict entry`);
  }
  return out;
}

// ===== bonds ====================================================================================

/** Numeric member-count tier keys found in bond blackboards. */
const BOND_COUNT_KEYS = ['power_bond_char_cnt', 'ex_bond_char_cnt', 'power_char_cnt', 'ex_char_cnt'];

/**
 * Build data/bonds.json: the 23 bonds with thresholds, counting mode, effect blackboards and the
 * research implementer spec.
 */
function buildBonds(ctx, chess, effects) {
  const { act, ac } = ctx;
  const researchBonds = new Map((ctx.research.bonds?.bonds || []).map((b) => [b.bondId, b]));
  const out = {};
  const ids = Object.keys(act.bondInfoDict);
  ids.sort((a, b) => (act.bondInfoDict[a].identifier ?? 0) - (act.bondInfoDict[b].identifier ?? 0) || naturalCmp(a, b));
  for (const bondId of ids) {
    const b = act.bondInfoDict[bondId];
    const g = ac.bondInfoDict?.[bondId] || {};
    const eff = effects[b.effectId];
    if (!eff) warn(`bond ${bondId}: effect ${b.effectId} missing`);
    const buffs = eff ? eff.buffs : [];
    const bb = {};
    for (const x of buffs) for (const [k, v] of Object.entries(x.bb)) if (!(k in bb)) bb[k] = v;
    const bbStr = {};
    for (const x of buffs) for (const [k, v] of Object.entries(x.bbStr)) if (!(k in bbStr)) bbStr[k] = v;

    // Member-count thresholds: activeParamList + tier keys + "<在场N名…>" in the description.
    const counts = new Set();
    const params = (b.activeParamList || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    const template = b.activeConditionTemplate;
    let maxCount = null;
    if (template === 'count_threshold_downward') {
      if (params.length >= 1) counts.add(params[0]);
      if (params.length >= 2) maxCount = params[1] - 1;
    } else {
      for (const n of params) counts.add(n);
      for (const x of buffs) {
        for (const k of BOND_COUNT_KEYS) if (typeof x.bb[k] === 'number' && x.bb[k] > 0) counts.add(x.bb[k]);
        if (x.key === 'bond_activated_add_layer' && typeof x.bb.count === 'number' && x.bb.count > 0) counts.add(x.bb.count);
      }
      for (const m of String(b.desc || '').matchAll(/在场<@[^>]*>(\d+)<\/>名/g)) counts.add(Number(m[1]));
      for (const m of String(b.desc || '').matchAll(/在场(\d+)名/g)) counts.add(Number(m[1]));
    }
    const thresholds = [...counts].sort((x, y) => x - y);
    if (!thresholds.length) warn(`bond ${bondId}: no thresholds derived`);

    // Layer milestones (independent of member count).
    const layerMilestones = [];
    for (const x of buffs) {
      const lb = x.bb;
      if (typeof lb.power_bond_stack_cnt === 'number' && lb.power_bond_stack_cnt > 0) layerMilestones.push({ layer: lb.power_bond_stack_cnt, mode: 'reach', effect: x.key });
      if (x.key === 'bond_layer_added_reward_equip' || x.key === 'bond_layer_gain_coin') layerMilestones.push({ layer: lb.layer, mode: 'every', effect: x.key });
      if (x.key === 'bond_multi_layer_char_goods_price_bond_discount') {
        layerMilestones.push({ layer: lb.layer1, mode: 'first', effect: x.key });
        layerMilestones.push({ layer: lb.layer2, mode: 'first', effect: x.key });
      }
      if (x.key === 'bond_layer_char_garrison_bonus' && lb.layer > 0) layerMilestones.push({ layer: lb.layer, mode: 'reach', effect: x.key });
    }

    const members = (b.chessIdList || []).filter((id) => chess[id] && !chess[id].isGolden).sort(naturalCmp);
    for (const id of b.chessIdList || []) if (!chess[id]) warn(`bond ${bondId}: member ${id} missing from chess`);
    const rb = researchBonds.get(bondId);
    const dp = textPair(b.desc);
    // the placeholders' blackboard keys: 盟约 lists them on the bond (descParamBaseList / descParamPerStackList), 规程 on its
    // effect (effectDescParamDataDict[effectId].descParamInfos, with a cap descParamMax — 0 for none)
    const dpi = effectDescParams(ctx, b.effectId);
    const baseList = b.descParamBaseList || dpi.map((x) => x.base);
    const perList = b.descParamPerStackList || dpi.map((x) => x.perStack);
    if (b.descParamBaseList || b.descParamPerStackList) checkDescParamKeys(eff?.params || {}, [...(b.descParamBaseList || []), ...(b.descParamPerStackList || [])], `bond ${bondId} descParam lists`);
    const maxList = b.descParamBaseList ? [] : dpi.map((x) => x.max);
    out[bondId] = {
      bondId, name: b.name, identifier: b.identifier,
      isCore: !!g.isPower, bondType: g.bondType || null, bondOrder: g.bondOrder ?? null,
      powerIdList: g.powerIdList || [], iconId: b.iconId || g.icon || null,
      activeCount: b.activeCount, thresholds, maxCount,
      thresholdTemplate: template, countMode: b.activeCondition,
      countsHand: b.activeCondition === 'BOARD_AND_DECK', countsGoldenOnly: template === 'count_threshold_upward_golden',
      activeType: b.activeType, isActiveInDeck: !!b.isActiveInDeck,
      noStack: !!b.noStack, weight: b.weight, maxInactiveBondCount: b.maxInactiveBondCount,
      layerMilestones,
      desc: dp.desc, descRaw: dp.descRaw,
      effectId: b.effectId, effectName: eff?.name || null, effectDesc: eff?.desc || null, effectDescRaw: eff?.descRaw || null,
      // Positional {i:fmt} placeholders of effectDesc = bb[baseParams[i]] + bb[perStackParams[i]] * layers (at most `max`).
      effectDescParams: [...String(eff?.descRaw || '').matchAll(/\{(\d+)(?::([^{}]+))?\}/g)].map((m) => ({
        index: Number(m[1]), format: m[2] || null,
        base: baseList[Number(m[1])] || null, perStack: perList[Number(m[1])] || null,
        ...(maxList[Number(m[1])] > 0 ? { max: maxList[Number(m[1])] } : {}),
      })),
      bb, bbStr, buffs: buffs.map((x) => ({ key: x.key, bb: x.bb, bbStr: x.bbStr })),
      baseParams: baseList, perStackParams: perList,
      members, visibleMembers: members.filter((id) => chess[id].visible),
      spec: rb?.spec || null,
    };
  }
  return out;
}

// ===== garrisons (特质) ===========================================================================

/**
 * Build data/garrisons.json: every garrison referenced by season chess (plus garrisons referenced
 * from other garrisons' blackboards, transitively).
 */
function buildGarrisons(ctx, chess) {
  const dict = ctx.act.garrisonDataDict;
  const wanted = new Set();
  for (const c of Object.values(chess)) for (const g of c.garrisonIds) wanted.add(g);
  const queue = [...wanted];
  while (queue.length) {
    const id = queue.pop();
    const g = dict[id];
    if (!g) continue;
    for (const e of g.blackboard || []) {
      if (typeof e.valueStr !== 'string') continue;
      for (const m of e.valueStr.matchAll(/garrison_\d+_[ab]/g)) {
        if (!wanted.has(m[0]) && dict[m[0]]) { wanted.add(m[0]); queue.push(m[0]); }
      }
    }
  }
  const out = {};
  for (const id of [...wanted].sort(naturalCmp)) {
    const g = dict[id];
    if (!g) { warn(`garrison ${id} referenced but missing from garrisonDataDict`); continue; }
    const { bb, bbStr } = flattenBB(g.blackboard, `garrison ${id}`);
    const raw = g.garrisonDesc || g.description;
    const dp = textPair(raw);
    out[id] = {
      garrisonId: id, desc: dp.desc, descRaw: dp.descRaw,
      eventType: g.eventType, eventTypeDesc: g.eventTypeDesc || null, eventTypeIcon: g.eventTypeIcon || null,
      effectType: g.effectType, effectKey: bbStr.key || g.effectType, battleRuneKey: g.battleRuneKey || null,
      charLevel: g.charLevel || 0, bb, bbStr,
      // 规程's effect over the operator when the 特质 takes effect (a map_v079_buff0N prefab, null for the bond ones — the
      // client plays map_v079_buff01 for those, shared/traitFx.js); the default season's table has no such field
      ...('eventEffect' in g ? { eventEffect: g.eventEffect || null } : null),
      owners: Object.values(chess).filter((c) => c.garrisonIds.includes(id)).map((c) => c.chessId).sort(naturalCmp),
    };
  }
  return out;
}

// ===== items ====================================================================================

/**
 * Items the official shop (调度中心) never sells although trapShopChessDatas lists them with `hideInShop` false: they
 * only come from effects (user playtest #4, first-hand: "几个特殊的维式重锤是干员洛洛或者维多利亚阵营获得的，商店是不卖的。
 * 变异针…也是有一个策略自带的，商店不卖"). The official shop pool is server-side (no client table tells), so the list is
 * explicit, by normal item id → where the item comes from. items.json marks both qualities `shopExcluded` (+
 * `shopExcludedBy`), and every draw of "shop items" skips them (sim/simdata.js isShopItem: the shop item slot, the
 * 道具补给 / 机密商店 cards, pool_equip_normal / _shop_1 / _narant). The one equip pool that still carries one is
 * 凯瑟琳 定向投放 (pool_equip_kathe `plus`: 突变细胞, upstream #631 — the shop level does not gate it):
 *   战栗 / 坚固 / 加速 / 灼燃维式重锤 — 维多利亚 <每叠加25层> "获得一件带有随机特殊效果的维式重锤" (pool_equip_vict) and
 *     洛洛 特质 "<获得时>随机制造1件洛洛的定制品" (pool_equip_rockr)
 *   突变细胞 — strategy 昆图斯 【不稳定要素】 "第3回合获得1件特殊装备<突变细胞>" (band_quintus), and 盟约 凯瑟琳's
 *     定向投放 (升级调度中心, pool_equip_kathe)
 * Every other effect-granted item stays sold: the plain 维式重锤 is (user), and 变形同构体 / 骑士储蓄罐 (strategy items)
 * appear in the official 机密商店 supply (Bahamut bsn=33651 snA=12294 screenshot i.meee.com.tw/Mb2mtd9.png).
 */
const SHOP_EXCLUDED_ITEMS = Object.freeze({
  chess_item_2_03_e_a: '维多利亚盟约每25层 / 洛洛的定制品', // 战栗维式重锤
  chess_item_3_09_e_a: '维多利亚盟约每25层 / 洛洛的定制品', // 坚固维式重锤
  chess_item_3_10_e_a: '维多利亚盟约每25层 / 洛洛的定制品', // 加速维式重锤
  chess_item_4_09_e_a: '维多利亚盟约每25层 / 洛洛的定制品', // 灼燃维式重锤
  chess_item_5_08_e_a: '策略【不稳定要素】（昆图斯）', // 突变细胞
});

/**
 * 「带有特殊效果的维式重锤」: the normal ids of the hammer kinds the first effect with `hammer_N` keys names, in that order
 * (盟约 蒸汽之心: the four of SHOP_EXCLUDED_ITEMS; 规程 终极维式重锤 「每有一种带有特殊效果的维式重锤」: those four and
 * 电流维式重锤; sim items/battle.js hammerListOf reads the same list). 维多利亚's <每叠加25层> 「获得一件带有随机特殊效果的维式重锤」
 * (pool_equip_vict) draws from it, and in another season it is what the shop leaves out — the default season's
 * playtest rule carried to the fifth kind (maintainer decision 2026-11-11 [ASSUMED·서버: the shop pool is server-side];
 * 终极维式重锤 stays sold).
 */
function specialHammerIds(effects) {
  for (const e of Object.values(effects)) {
    for (const b of e?.buffs || []) {
      const keys = Object.keys(b?.bbStr || {}).filter((k) => /^hammer_\d+$/.test(k)).sort(naturalCmp);
      if (keys.length) return keys.map((k) => `${b.bbStr[k]}_a`);
    }
  }
  return [];
}

/**
 * Rules the official item text leaves out, by normal item id (both qualities): `note` = a player-facing line shown under
 * the effect in the item card (items.json `note`), `implFormula` replaces research 04's formula.
 *   突变细胞 — not consumed (player feedback after 0.1.0): PRTS 卫戍协议：盟约 下半/PRTS盟约记录 备注 "生效时，原干员销毁，
 *     获得一名高一阶的随机初始干员（最高六阶）", and a destroyed operator's equipment comes off (PRTS 卫戍协议/帮助 "佩戴的
 *     装备无法手动卸除，在失去该干员（干员出售、销毁、合并等）或装备合并为进阶品质时自动卸除"); the text never says 销毁 for
 *     the cell (every consumable item's does), and players re-inject it every round ("之后就是一直打针，扎到核心卡或者叠层
 *     手干员就换人扎", bilibili cv47000418; "这个道具可以无限使用", cg.163.com guide 2025-11-15). The new operator is gained
 *     into the 整备区, never onto the carrier's tile — official footage (bilibili BV1vzyVBuEN9 ≈ 8:24, BV1Qkw1zMEoR ≈ 7:25):
 *     at the next prep the tile is empty, one more deployment is left and the new operator waits on the bench (PRTS 帮助:
 *     what a player gains goes to the 手牌区; pointed out in PR #2).
 */
const ITEM_RULES = Object.freeze({
  chess_item_5_08_e_a: {
    note: '生效时原干员销毁，突变细胞与其他装备退回整备区，可再次配发；随后获得一名高一阶的随机初始干员（最高6阶），进入整备区，需要重新部署',
    implFormula: 'After the battle: the carrier is destroyed wherever it stands (a board tile is freed); its equipment, the '
      + 'cell included, returns to the hand first (overflow temp; the cell is not consumed); then a random NORMAL operator '
      + 'one tier higher (max 6; an elite carrier too) is gained like any gained operator: the hand, overflow temp, a '
      + 'completed merge as usual (the elite on a consumed deployed copy\'s tile, never the carrier\'s). Never merges.',
  },
});

/**
 * Build data/items.json: every item chess (EQUIP normal + golden, MAGIC Arts), keyed by chessId.
 */
/**
 * The default season's items by trap (data/items.json; null when building the default season): another season reuses
 * the item ids for other items, so the tables of this file keyed by a default-season item id (SHOP_EXCLUDED_ITEMS,
 * ITEM_RULES, the research items, pool entries) reach its items through the trap (attachHandlerKeys).
 */
let defaultItemsByTrap;
function defaultItemIdByTrap() {
  if (SEASON === DEFAULT_SEASON) return null;
  if (!defaultItemsByTrap) {
    defaultItemsByTrap = new Map();
    for (const r of Object.values(JSON.parse(readFileSync(join(ROOT, 'data', 'items.json'), 'utf8')))) if (!r.isGolden && r.trapId) defaultItemsByTrap.set(r.trapId, r.id);
  }
  return defaultItemsByTrap;
}
/** The default season's id of a built item's base (itself in the default season), or null when it has none. */
function defaultItemId(act, baseId) {
  const byTrap = defaultItemIdByTrap();
  if (!byTrap) return baseId;
  return byTrap.get(act.trapChessDataDict[baseId]?.charId) ?? null;
}
/** This season's item of a default-season item id (the same trap), or null. */
function seasonItemId(items, defaultId) {
  if (SEASON === DEFAULT_SEASON) return items[defaultId] ? defaultId : null;
  const byTrap = defaultItemIdByTrap();
  return Object.values(items).find((r) => !r.isGolden && byTrap.get(r.trapId) === defaultId)?.id ?? null;
}

/** An item effect sentence that forbids a 自选 carrier (信标 "无法装备给自编干员"; the older wording 自选). */
const NO_DIY_TEXT = /无法装备给自[编选]干员/;

function buildItems(ctx, effects) {
  const { act, charTable } = ctx;
  const researchItems = new Map((ctx.research.items?.items || []).map((i) => [i.id, i]));
  const shopByBase = new Map();
  for (const s of Object.values(act.trapShopChessDatas)) {
    shopByBase.set(s.itemId, s);
    if (s.goldenItemId) shopByBase.set(s.goldenItemId, s);
  }
  const seasonHammers = new Set(specialHammerIds(effects));
  const raisesBlock = (id) => /阻挡数\+/.test(effects[act.trapChessDataDict[id]?.effectId]?.desc || '');
  const out = {};
  for (const chessId of Object.keys(act.trapChessDataDict).sort(naturalCmp)) {
    const t = act.trapChessDataDict[chessId];
    const shop = shopByBase.get(chessId);
    if (!shop) warn(`item ${chessId}: no trapShopChessDatas entry`);
    const baseId = shop?.itemId || chessId;
    const eff = effects[t.effectId];
    if (!eff) warn(`item ${chessId}: effect ${t.effectId} missing`);
    const trap = charTable[t.charId];
    if (!trap) warn(`item ${chessId}: trap ${t.charId} missing from character_table`);
    // the default season's id of the same item: the key of every table below (defaultItemId)
    const defId = defaultItemId(act, baseId);
    const ri = defId ? researchItems.get(defId) : undefined;
    const isGolden = !!t.isGolden;
    const upgradeNum = t.upgradeNum;
    const excluded = SEASON !== DEFAULT_SEASON && seasonHammers.has(baseId) ? '维多利亚盟约每25层 / 凯瑟琳特质'
      : defId && Object.hasOwn(SHOP_EXCLUDED_ITEMS, defId) ? SHOP_EXCLUDED_ITEMS[defId] : null;
    const rule = defId && Object.hasOwn(ITEM_RULES, defId) ? ITEM_RULES[defId] : null;
    out[chessId] = {
      id: chessId, baseId, goldenId: shop?.goldenItemId || null, isGolden,
      trapId: t.charId, iconId: t.charId, identifier: t.identifier,
      name: trap?.name || eff?.name || chessId,
      itemType: t.itemType, tier: shop?.itemLevel ?? null, shopSortId: shop?.shopLevelSortId ?? null,
      price: t.purchasePrice, hideInShop: !!shop?.hideInShop,
      shopExcluded: !!excluded, shopExcludedBy: excluded,
      mergeable: !isGolden && upgradeNum > 0 && upgradeNum < 100,
      upgradeNum, upgradeChessId: t.upgradeChessId || null,
      duration: t.trapDuration,
      giveBondId: t.giveBondId || null, givePowerId: t.givePowerId || null, canGiveBond: !!t.canGiveBond,
      // 规程's 组合 (trapChessDataDict canFuse / fuseWith / fuseResult): owning this item and `fuseWith` together turns the
      // pair into `fuseResult` ("若与…同时持有则组合为…"; player/acquire.js _fuseItem)
      fuseWith: t.canFuse && t.fuseWith ? t.fuseWith : null, fuseResult: t.canFuse && t.fuseResult ? t.fuseResult : null,
      requiresBondId: ri?.requiresBond || null,
      effectId: t.effectId, effectName: eff?.name || null,
      desc: eff?.desc || null, descRaw: eff?.descRaw || null,
      // the effect text 「无法装备给自编干员」 (信标, both seasons): the equip gate refuses a 自选 carrier (player/items.js),
      // the drag highlight and the AI seats skip one; emitted only when the sentence is there, so other items stay as they were
      ...(NO_DIY_TEXT.test(`${eff?.desc || ''}\n${eff?.descRaw || ''}`) ? { noDiy: true } : null),
      buffs: (eff?.buffs || []).map((b) => ({ key: b.key, countType: b.countType, bb: b.bb, bbStr: b.bbStr })),
      params: eff?.params || {},
      // an item research 04 has no entry for (规程's new ones) is consumed on equip when the table says so: trapDuration 0
      // (every such item reads 「装备时销毁」; 博士投影's delayed form has its research entry)
      // its category only steers the AI seats (bot.js: SURVIVAL goes to blockers first): from the text, an item that raises
      // the block count (阻挡数+) and its 组合 partner are SURVIVAL, the rest stays unclassified (to the damage dealers)
      category: ri?.category || (!ri && (raisesBlock(chessId) || (t.canFuse && t.fuseWith && raisesBlock(t.fuseWith))) ? 'SURVIVAL' : null), kind: ri?.kind || (!ri && t.trapDuration === 0 ? 'consume_on_equip' : null), family: ri?.family || null,
      implFormula: rule?.implFormula || ri?.implFormula || null,
      note: rule?.note || null,
      rangeGrid: Array.isArray(ri?.rangeGrids) ? ri.rangeGrids.map((g) => [g.row, g.col]) : null,
      flavor: ri?.flavor || null,
    };
    if (!ri) warn(`item ${chessId}: no research 04 entry (category/kind unknown)`);
  }
  return out;
}

// ===== bands (策略) ===============================================================================

/**
 * Build data/bands.json: the 40 season strategies. `bondIds` (the bonds a strategy is built around: shared/bandBonds.js
 * over its text and blackboards, needing bonds.json and choices.json pools) is added in main() once those are built.
 */
function buildBands(ctx, effects) {
  const { act, ac } = ctx;
  const out = {};
  const ids = Object.keys(act.bandDataListDict);
  ids.sort((a, b) => (act.bandDataListDict[a].sortId ?? 0) - (act.bandDataListDict[b].sortId ?? 0) || naturalCmp(a, b));
  for (const bandId of ids) {
    const b = act.bandDataListDict[bandId];
    const meta = ac.bandDataDict?.[bandId] || {};
    const eff = effects[b.effectId];
    if (!eff) warn(`band ${bandId}: effect ${b.effectId} missing`);
    const dp = textPair(b.bandDesc);
    out[bandId] = {
      bandId, sortId: b.sortId, name: meta.bandName || eff?.name || bandId, iconId: meta.bandIconId || `icon_${bandId.replace(/^band_/, '')}`,
      // 盟约 lists the mode types a strategy is offered in; 规程 lists the modes it is not (inactiveModeIdList)
      ...(b.modeTypeList || !b.inactiveModeIdList ? { modeTypeList: b.modeTypeList || [] } : { inactiveModeIds: [...b.inactiveModeIdList] }),
      totalHp: b.totalHp,
      effectId: b.effectId, effectName: eff?.name || null, desc: dp.desc, descRaw: dp.descRaw,
      buffs: (eff?.buffs || []).map((x) => ({ key: x.key, bb: x.bb, bbStr: x.bbStr })),
      params: eff?.params || {},
      victorCount: b.victorCount, rewardModulus: b.bandRewardModulus ?? 1,
      unlockDesc: meta.unlockDesc || null,
      ...(act.skillInfoDataDict ? bandSeasonFields(ctx, b, effects) : {}),
    };
  }
  return out;
}

/**
 * 规程's strategy fields (a season whose table has skillInfoDataDict): `bandType` (GENERAL / BONDRELEVANT),
 * `relateBondIds` (relateBondList: the bonds a BONDRELEVANT strategy belongs to), `masterVictorCount`,
 * `offseasonPriority`, and `skills` — the strategy's 指令 stages in unlock order from its effectId: each stage's skill
 * (type PASSIVE / ACTIVE / NONE = locked, cost, `avail` {type ROUND_RESET / COOLDOWN / ALL_LIMIT / DEFAULT, count}, the
 * target of an ACTIVE one), its effect's buffs and params, and `next` — the condition (unlockType + params) that moves
 * the strategy to the next stage, null on the last (unlockType band_skill_load).
 */
function bandSeasonFields(ctx, b, effects) {
  const si = ctx.act.skillInfoDataDict;
  const skills = [];
  const seen = new Set();
  for (let id = b.effectId; id && !seen.has(id); ) {
    seen.add(id);
    const s = si[id];
    if (!s) { warn(`band ${b.bandId}: skill ${id} missing from skillInfoDataDict`); break; }
    if (s.bandId !== b.bandId) warn(`band ${b.bandId}: skill ${id} names band ${s.bandId}`);
    const eff = effects[id];
    if (!eff) warn(`band ${b.bandId}: skill effect ${id} missing`);
    const dp = textPair(s.skillDesc);
    const next = s.unlockEffectId && s.unlockType !== 'band_skill_load'
      ? { effectId: s.unlockEffectId, unlockType: s.unlockType, unlockParams: [...(s.unlockParam || [])] } : null;
    skills.push({
      effectId: id, name: eff?.name || null, type: s.skillType, cost: s.skillCost ?? 0,
      avail: { type: s.skillAvailType || 'DEFAULT', count: s.skillAvailCount ?? 0 },
      ...(s.targetType ? { target: { type: s.targetType, filter: s.targetFilterType || null, tip: s.targetTip || null } } : {}),
      ...(s.isUnusableAtSpecialRecruit ? { unusableAtSpecialRecruit: true } : {}),
      minorUnlock: !!s.minorUnlock,
      showTag: ctx.act.effectInfoDataDict?.[id]?.showTag ?? null,
      desc: dp.desc, descRaw: dp.descRaw,
      buffs: (eff?.buffs || []).map((x) => ({ key: x.key, bb: x.bb, bbStr: x.bbStr })),
      params: eff?.params || {},
      next,
    });
    id = next ? next.effectId : null;
  }
  const covered = new Set(skills.map((s) => s.effectId));
  for (const s of Object.values(si)) if (s.bandId === b.bandId && !covered.has(s.effectId)) warn(`band ${b.bandId}: skill ${s.effectId} is no stage of its chain`);
  return {
    bandType: b.bandType || 'GENERAL',
    relateBondIds: Array.isArray(b.relateBondList) ? [...b.relateBondList] : [],
    masterVictorCount: b.masterVictorCount ?? null, offseasonPriority: b.offseasonPriority ?? null,
    skills,
  };
}

// ===== enemies ==================================================================================

/** Template placeholder keys (constData.templateEnemy*) → slot code. */
function templateSlots(ctx) {
  const c = ctx.ac.constData;
  const slots = {
    [c.templateEnemyNormal]: 'N', [c.templateEnemyElite]: 'E', [c.templateEnemySpecial]: 'S',
    [c.templateEnemyNormalFly]: 'NF', [c.templateEnemyEliteFly]: 'EF', [c.templateEnemySpecialFly]: 'SF',
    [c.templateEnemyToken]: 'T', [c.templateEnemyTokenFly]: 'TF',
  };
  delete slots.undefined;
  return slots;
}

/** Merge an enemy_database "enemyData" override (m_defined fields) onto a base record (returns new obj). */
function mergeEnemyData(base, over) {
  if (!over) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && 'm_defined' in v) { if (v.m_defined) out[k] = v; continue; }
    if (k === 'attributes' && v && typeof v === 'object') { out.attributes = mergeEnemyData(base.attributes || {}, v); continue; }
    if ((k === 'talentBlackboard' || k === 'skills' || k === 'spData') && v != null) out[k] = v;
  }
  return out;
}
/**
 * Read m_value of an enemy field (or a default). An undefined field (`m_defined:false`) whose
 * m_value is the C# zero value (null/0/false/'') was never set in the database, so the game uses the
 * prefab default: return `dflt` (matters for lifePointReduce → 1, e.g. 萨卡兹王庭军战士/深池逐火战士,
 * and baseAttackTime → 1, e.g. 枯朽之种, whose zero would mean "attack every tick"). A non-zero
 * m_value of an undefined field carries the prefab value and is kept (e.g. boss-part immunities).
 */
const mv = (f, dflt = null) => {
  if (!f || typeof f !== 'object' || !('m_value' in f)) return dflt;
  const v = f.m_value;
  if (f.m_defined === false && (v == null || v === 0 || v === false || v === '')) return dflt;
  return v;
};
/** Only defined fields of an override (m_defined === true), flattened to plain values. */
function definedFields(over) {
  const out = {};
  if (!over) return out;
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && 'm_defined' in v) { if (v.m_defined) out[k] = v.m_value; }
    else if (k === 'attributes' && v) Object.assign(out, definedFields(v));
    else if ((k === 'talentBlackboard' || k === 'skills') && v != null) out[k] = v;
  }
  return out;
}

/**
 * enemy_database attribute → enemies.json stat. The two element resistances (PRTS 元素 / 游戏数据基础 / enemy pages):
 * `epResistance` (EP_RESISTANCE) = 损伤抵抗, % off element gauge fills → `elementRes`; `epDamageResistance` = 元素抗性,
 * % off 元素伤害 (element HP damage) → `elementDmgRes` (sim: server/sim/damage.js).
 */
const ENEMY_STAT_FIELDS = {
  maxHp: 'maxHp', atk: 'atk', def: 'def', magicResistance: 'res', moveSpeed: 'moveSpeed',
  baseAttackTime: 'bat', attackSpeed: 'aspd', blockCnt: 'blockCnt', massLevel: 'massLevel',
  hpRecoveryPerSec: 'hpRecoveryPerSec', tauntLevel: 'tauntLevel', epDamageResistance: 'elementDmgRes',
  epResistance: 'elementRes', damageHitratePhysical: 'hitRatePhys', damageHitrateMagical: 'hitRateArts',
  rangeRadius: 'rangeRadius', lifePointReduce: 'lpr',
};
const DMG_MAP = { PHYSIC: 'phys', MAGIC: 'arts', HEAL: 'heal', NO_DAMAGE: 'none', TRUE: 'true', ELEMENT: 'element' };

/**
 * Normal-attack radius under the DESIGN §5.2/§5.5 contract (`rangeRadius > 0` ⇔ the enemy attacks
 * units it is not blocked by). MELEE enemies only ever hit their blocker, so they get 0 even when the
 * official record carries a radius (粉碎攻坚手 2.5, 宿主士兵 2.5, 冰爆源石虫 1.75, 深池方阵步兵 1.5 …
 * used by their abilities); the official value is kept in `rawRangeRadius`. Negative sentinels → 0.
 * @param {string} applyWay MELEE / RANGED / ALL / NONE
 * @param {number} raw official rangeRadius
 * @returns {number}
 */
function effectiveRangeRadius(applyWay, raw) {
  if (applyWay === 'MELEE' || typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, raw);
}

/** Convert enemy skills list → compact records. */
function enemySkills(list, label) {
  return (Array.isArray(list) ? list : []).map((sk) => {
    const { bb, bbStr } = flattenBB(sk.blackboard, `${label} skill ${sk.prefabKey}`);
    return { prefabKey: sk.prefabKey, priority: sk.priority, cooldown: sk.cooldown, initCooldown: sk.initCooldown, spCost: sk.spCost, bb, bbStr };
  });
}
/** Convert an override (definedFields) into the enemies.json vocabulary (for per-template overrides). */
function enemyOverrideRecord(over, label) {
  const stats = {};
  const extra = {};
  for (const [k, v] of Object.entries(over)) {
    if (ENEMY_STAT_FIELDS[k]) stats[ENEMY_STAT_FIELDS[k]] = cleanNum(v);
    else if (k === 'talentBlackboard') extra.talents = flattenBB(v, `${label} talents`);
    else if (k === 'skills') extra.skills = enemySkills(v, label);
    else if (k === 'motion' || k === 'applyWay' || k === 'levelType' || k === 'notCountInTotal' || k === 'name') extra[k] = v;
    else if (/Immune$/.test(k)) (extra.immunities ||= {})[k.replace(/Immune$/, '')] = !!v;
  }
  return { ...(Object.keys(stats).length ? { stats } : {}), ...extra };
}

/**
 * Collect every enemy key that can appear in a match (templates, factions, bounties, bands,
 * bosses, summons), transitively through extraEnemyKeyList and enemy blackboards.
 */
function collectEnemyKeys(ctx) {
  const keys = new Set();
  const add = (k) => { if (typeof k === 'string' && /^enemy_/.test(k)) keys.add(k); };
  const refs0 = [];
  for (const id of ctx.templateIds) {
    const lv = ctx.levels[id];
    for (const w of lv.waves || []) for (const f of w.fragments || []) for (const a of f.actions || []) if (a.actionType === 'SPAWN') add(a.key);
    for (const b of Object.values(lv.branches || {})) for (const ph of b.phases || []) for (const a of ph.actions || []) if (a.actionType === 'SPAWN') add(a.key);
    for (const r of lv.enemyDbRefs || []) refs0.push(r.id);
  }
  for (const e of Object.values(ctx.act.specialEnemyInfoDict || {})) {
    add(e.specialEnemyKey);
    (e.attachedNormalEnemyKeys || []).forEach(add);
    (e.attachedEliteEnemyKeys || []).forEach(add);
  }
  for (const list of Object.values(ctx.act.enemyInfoDict || {})) list.forEach(add);
  for (const b of Object.values(ctx.ac.bossInfoDict || {})) add(b.enemyId);
  for (const k of Object.keys(templateSlots(ctx))) add(k);
  for (const m of Object.values(ctx.act.modeDataDict)) (m.inactiveEnemyKey || []).forEach(add);
  for (const buffs of Object.values(ctx.act.effectBuffInfoDataDict || {})) {
    for (const b of buffs) for (const e of b.blackboard || []) {
      if (typeof e.valueStr === 'string') for (const m of e.valueStr.matchAll(/enemy_[A-Za-z0-9_]+/g)) if (ctx.enemyDb.has(m[0])) add(m[0]);
    }
  }
  // Keys a wave action, a special entry, a leader or a bounty spawns directly; everything reached only through level
  // enemyDbRefs, summons or blackboards is a token (`tokenOnly`: 联防 routes it on the escaped template's token
  // actions, research 08 §5).
  const direct = new Set(keys);
  refs0.forEach(add);
  // Transitive closure: summons & blackboard references of included enemies.
  const queue = [...keys];
  while (queue.length) {
    const k = queue.pop();
    const extra = ctx.ac.randomEnemyAttributeDict?.[k]?.extraEnemyKeyList || [];
    const levels = ctx.enemyDb.get(k) || [];
    const refs = [...extra];
    for (const lvl of levels) {
      const d = lvl.enemyData || {};
      for (const e of [...(d.talentBlackboard || []), ...(d.skills || []).flatMap((s) => s.blackboard || [])]) {
        if (typeof e.valueStr === 'string') for (const m of e.valueStr.matchAll(/enemy_[A-Za-z0-9_]+/g)) refs.push(m[0]);
      }
    }
    for (const r of refs) if (!keys.has(r) && ctx.enemyDb.has(r)) { keys.add(r); queue.push(r); }
  }
  const out = [...keys].sort(naturalCmp);
  out.direct = direct;
  return out;
}

/**
 * Official attribute power of an enemy (client `RandomEnemyGenerater._GetEnemyAttrPower`, research 08 §2.3), in
 * float32 like the client: atk·5 + maxHp·1 + def·3 + res·3 from the enemy_database record at `level` (the
 * season override level is NOT applied: 灼藤 / 元核孽生者 count with their database ATK).
 */
function enemyAttrPower(ctx, key, level) {
  const c = ctx.ac.constData;
  const levels = ctx.enemyDb.get(key) || [];
  const base = levels.find((l) => l.level === 0)?.enemyData?.attributes || levels[0]?.enemyData?.attributes || {};
  const over = level ? levels.find((l) => l.level === level)?.enemyData?.attributes || {} : {};
  const g = (n) => {
    const o = over[n];
    if (o && o.m_defined) return Number(o.m_value) || 0;
    return Number(base[n]?.m_value) || 0;
  };
  const f = Math.fround;
  let p = f(f(f(g('atk') * (c.enemyAtkFactor ?? 5)) + f(g('maxHp') * (c.enemyMaxHpFactor ?? 1))) + f(g('def') * (c.enemyDefFactor ?? 3)));
  p = f(p + f((c.enemyMagicResistanceFactor ?? 3) * g('magicResistance')));
  return p;
}

/**
 * Huge units' hit areas (巨型单位：受击判定区域) by prefab (enemy_database `prefabKey`: a season `_2` copy with the same
 * prefab shares it) → enemies.json `hitArea`: a rectangle `w` tiles along the columns (长) × `h` along the rows (宽),
 * centred on the unit's position moved `dx` columns right and `dy` rows up (row 0 = the bottom). The collider lives in
 * the prefab, not in the game tables — values from PRTS (user playtest #5 item 10):
 *   假想敌：胄 / 假想敌：管 / 盐风主教昆图斯 "巨型单位：受击判定区域为长4.95、宽2.95的长方形，向上偏移1.0";
 *   假想敌：管 隐秘核心 (enemy_9021_acduml_2, its own prefab) "…向上偏移1.0，向右偏移1.0";
 *   卫戍协议：盟约 下半/PRTS盟约记录 "卫戍协议中的阿利斯泰尔，帝国余晖和“萨米的意志”为特殊版本，拥有与普通版本不同的受击判定
 *   区域（为长4.95宽2.95的长方形，向上偏移1）".
 * [ASSUMED] 胄's hidden-core copy (enemy_9013_acstmk_2, prefab enemy_9013_acstmk) keeps the upward offset although its
 * PRTS section lists none — one prefab, one collider. 假想敌：铳 and 卢西恩 are regular units (no such talent).
 * 规程's 假想敌：械 and 假想敌：茧 (enemy_9029_acfnc / enemy_9035_acspider and their own `_2` prefabs): the root
 * BoxCollider2D of each official CN prefab is size 4.95 × 2.95, offset (0, 1) — the same box as 胄's and 管's prefabs
 * (checked in the official CN client's prefabs, 2026-11-13). Both stand still and are unblockable through their own abilities (content/bosses.js).
 */
const HIT_AREAS = Object.freeze({
  enemy_9013_acstmk: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9021_acduml: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9021_acduml_2: { w: 4.95, h: 2.95, dx: 1, dy: 1 },
  enemy_1521_dslily: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9032_aclionk: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9033_acdeer: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9029_acfnc: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9029_acfnc_2: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9035_acspider: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9035_acspider_2: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
});

/**
 * 静态刚体 (static rigidbody) enemies → enemies.json `staticBody: true`: pushes and pulls never move them (player report
 * after 0.1.0, "飞机可以被薄绿的技能拉走"). PRTS 特殊机制 静态刚体: "该单位的Unity刚体的刚体类型为部分静态（Kinematic）或静态
 * （Static）。使用该类刚体的单位可以进入失衡状态并启用物理，但物理层面上无法产生任何速度或移动 … ※与失衡免疫不同 … ※是否为静态
 * 刚体与单位的行动方式无关" (example: 妖怪). Like HIT_AREAS the rigidbody lives in the prefab, not in the game tables: the
 * keys whose PRTS page lists "{{特殊机制|静态刚体}}" in its 天赋 (the page of every enemy of data/enemies.json, read 2026-10-03) —
 * every air unit of the mode except “炎佑” (its page lists none; weight 10, so no push or pull moves it anyway), plus
 * the ground boss 盐风主教昆图斯.
 */
const STATIC_BODIES = Object.freeze(new Set([
  'enemy_1005_yokai', 'enemy_1005_yokai_2', 'enemy_1005_yokai_3',   // 妖怪 / 妖怪MKII / 威龙
  'enemy_1017_defdrn', 'enemy_1040_bombd', 'enemy_1041_lazerd', 'enemy_1041_lazerd_2', 'enemy_1042_frostd', // 御4 / 暴鸰 / 法术大师A1 / A2 / 寒霜
  'enemy_1112_emppnt', 'enemy_1112_emppnt_2',                        // 帝国炮火先兆者 / 帝国炮火中枢先兆者
  'enemy_1269_nhfly', 'enemy_1321_wdarft',                           // 枯朽之种 / 枯朽萃聚使徒
  'enemy_1355_mrfly', 'enemy_1355_mrfly_2', 'enemy_1407_hummbd',     // 护障 / 护障·P / 远眺
  'enemy_1430_lrrook', 'enemy_1521_dslily',                          // 愧悔魂灵圣杯 / 盐风主教昆图斯 (WALK)
  'enemy_9009_acfort', 'enemy_9014_acstma', 'enemy_9015_acstmb', 'enemy_9016_acstmr', // 假想敌：黑云 / “斩胄之剑” / “破胄之锤” / 刺胄之弹
  'enemy_10028_vtswd', 'enemy_10029_vtshld', 'enemy_10030_vtwand',   // 未装配刀片 / 防护背心 / 冲击式施术单元
  'enemy_10040_cnvbln',                                              // 节日气球
  'enemy_10083_hlbird', 'enemy_10084_hlegle', 'enemy_10085_hllevi_2', // “萨科塔之翼” / “萨科塔之眼” / “萨科塔昂首”
]));

/**
 * Devices an enemy's skill puts on a tile → enemies.json `devices[]` (the templateDevice record, at the token inst the
 * client spawns, plus `rangeGrid` and `dmgType`). The link lives in the client's buff templates, not in the game tables:
 * 阿利斯泰尔's 【莫非王土】 on a 冲击式施术单元 runs `enemy_vtlionk_s2` → SpawnTokenOnTargetTile trap_185_vtlntw (黄金回响,
 * `inst` level 1 PHASE_0) on the unit's tile. `dmgType` from the token prefab's Attack `_damageType` (2 MAGICAL).
 */
const ENEMY_SKILL_DEVICES = Object.freeze({
  enemy_9032_aclionk: [{ key: 'trap_185_vtlntw', level: 1, phase: 'PHASE_0', dmgType: 'arts' }],
});

/** One ENEMY_SKILL_DEVICES entry → its record (templateDevice at the inst, the token's range grid, its damage type). */
function skillDevice(ctx, d, label) {
  const rec = templateDevice(ctx, { inst: { characterKey: d.key, level: d.level, phase: d.phase }, skillIndex: -1 }, label);
  delete rec.alias; delete rec.pos; delete rec.dir; delete rec.hidden;
  const ch = ctx.charTable[d.key];
  const ph = ch ? Math.max(0, Math.min(phaseIdx(d.phase), (ch.phases?.length || 1) - 1)) : 0;
  rec.rangeGrid = ch ? rangeGrid(ctx, ch.phases?.[ph]?.rangeId) : null;
  rec.dmgType = d.dmgType;
  return rec;
}

/**
 * Official drawn size of enemy models (user playtest #6 item 9: 威龙 far too large) → enemies.json `modelScale`.
 * The official client scales every Spine model in its battle prefab (`dyn/battle/prefabs/enemies/<prefab>.prefab`,
 * bundles battle/enm_pfb_*.ab): world size = skeleton units × SkeletonDataAsset.scale (0.01 for all 1731 enemy
 * skeletons, refs/arts/enm_art_*.ab) × the transform scale of Graphic / FaceSwitcher / Spine above the renderer. That
 * transform product is MODEL_SCALE_STANDARD = 0.27 for 1454 of the 2147 enemy prefabs (2080 have exactly one Spine
 * renderer; also the FaceSwitcher of the operators' battle skins), and differs for the rest: the drones are shrunk (威龙 0.16 — its skeleton is 35 % wider than
 * 妖怪's, drawn at 0.20), the small 岁 relics enlarged (铜灯盘 0.5, 青铜镜 0.6). The renderer draws every skeleton at one
 * UNIT.modelScale, so an enemy's `modelScale` = its prefab's product / 0.27 (4 decimals; absent when 1).
 * Values: tools/local-extract/enemy_scales.py over the local client (2026-10-01), keyed by prefab (enemy_database
 * `prefabKey`, "enemy_" dropped) and grouped by the product; every other prefab of data/enemies.json is 0.27.
 */
const MODEL_SCALE_STANDARD = 0.27;
const MODEL_SCALES = new Map([
  [0.16, ['1005_yokai_3']],
  [0.18, ['1042_frostd']],
  [0.19, ['1112_emppnt', '1112_emppnt_2']],
  [0.2, ['1005_yokai', '1040_bombd', '1041_lazerd', '1041_lazerd_2']],
  [0.216, ['1067_snslime']],
  [0.22, ['1005_yokai_2', '1017_defdrn']],
  [0.23, ['1158_divman', '1161_tidmag', '1161_tidmag_2']],
  [0.24, ['1009_lurker', '1019_jshoot', '1019_jshoot_2', '1043_zomsbr', '1071_dftman', '1072_dlancer', '1116_liprr', '1116_liprr_2',
    '1118_lidbox_2', '1160_hvyslr', '1160_hvyslr_2', '1162_magmot', '1165_duhond', '1165_duhond_2', '1168_dumage', '1168_dumage_2',
    '1183_mlasrt', '1195_sfyin', '1195_sfyin_2', '1197_sfshu', '1197_sfshu_2', '1199_sfjin', '1203_sfhu', '1203_sfhu_2', '1207_sfji',
    '1207_sfji_2', '1209_sfden', '1209_sfden_2', '1267_nhpbr', '1267_nhpbr_2', '1269_nhfly', '1270_nhstlk', '1270_nhstlk_2',
    '1272_nhtank', '1272_nhtank_2', '1273_stmgun_2', '1275_dwlock_2', '1500_skulsr', '2002_bearmi', '2003_rockman', '2004_balloon',
    '2005_axetro', '2008_flking', '2034_sythef']],
  [0.25, ['1166_dusbr', '1166_dusbr_2', '1169_duphlx', '1169_duphlx_2', '1229_darmy', '1229_darmy_2']],
  [0.26, ['1000_gopro_2', '1023_jmage', '1025_reveng', '1026_aghost', '1046_agent', '1249_lysdb_2', '1251_lysyta', '1251_lysyta_2',
    '1252_lysytb_2', '1254_lypa_2', '1283_sgkill', '1283_sgkill_2', '1516_jakill', '1517_xi', '2001_duckmi']],
  [0.28, ['1006_shield', '1010_demon', '1010_demon_2', '1061_zomshd', '1062_rager_2', '1069_icebrk_2', '1119_vofsd', '1170_dushld',
    '1170_dushld_2', '1172_dugago', '1172_dugago_2', '1174_duholy', '1174_duholy_2', '1175_dushdo_2', '2025_syufo']],
  [0.29, ['1081_sotisd', '1513_dekght', '1513_dekght_2']],
  [0.297, ['2009_csaudc']],
  [0.3, ['1001_bigbo', '1045_hammer', '1045_hammer_2', '1121_lifbos', '1121_lifbos_2', '1501_demonk', '1535_wlfmster']],
  [0.31, ['1006_shield_2']],
  [0.34, ['1006_shield_3']],
  [0.35, ['1092_mdgint']],
  [0.4, ['1196_msfyin', '1196_msfyin_2', '1198_msfshu', '1198_msfshu_2', '1202_msfzhi', '1202_msfzhi_2']],
  [0.5, ['1208_msfji', '1208_msfji_2', '1210_msfden', '1210_msfden_2']],
  [0.6, ['1200_msfjin', '1200_msfjin_2', '1204_msfhu', '1204_msfhu_2']],
]);
const MODEL_SCALE_BY_PREFAB = new Map();
for (const [v, list] of MODEL_SCALES) for (const k of list) MODEL_SCALE_BY_PREFAB.set(`enemy_${k}`, Math.round((v / MODEL_SCALE_STANDARD) * 1e4) / 1e4);

/**
 * Prefabs the official stretches **vertically** → enemies.json `modelScaleY` (the Graphic node's Y scale ÷ its X scale;
 * 1, absent, = uniform). MODEL_SCALES above only carries the horizontal product, so a model whose `Graphic` has
 * (sx, sy, sz) with sy ≠ sx is drawn too short by a uniform scale. Swept with tools/local-extract/enemy_model_offsets.py
 * over the local client (2026-10-05, PR #211 by @xcdoge): of 242 readable enemy prefabs only two are non-uniform, both
 * 1.263 — the pair 帝国炮火先兆者 / 帝国炮火中枢先兆者, Graphic scale (0.19, 0.24, 0.24) — so the official draws them 26 %
 * taller than their width-implied scale. (The same sweep found no per-model *position* correction for flyers: their
 * Graphic node sits at local (0,0,0), or at the (0,−0.2,−0.06) their ground-unit prefab family shares — unrelated to
 * `bounds.y`; render/units.js FLY_HOVER.) Taken with the mirror below by the owner's decision of 2026-10-06.
 */
const MODEL_STRETCH_Y = new Map([
  [1.263, ['1112_emppnt', '1112_emppnt_2']],
]);
const MODEL_STRETCH_Y_BY_PREFAB = new Map();
for (const [v, list] of MODEL_STRETCH_Y) for (const k of list) MODEL_STRETCH_Y_BY_PREFAB.set(`enemy_${k}`, v);

/**
 * Prefabs whose `Graphic` X scale is **negative** → enemies.json `mirrorX: true`: the official mirrors the authored
 * model horizontally, while this pipeline takes `abs(sx)` (enemy_scales.py / MODEL_SCALES), so the renderer flips this
 * model's facing on top of the normal direction flip (render/units.js). From the same sweep: `enemy_1196_msfyin`
 * (木制瑞印, Graphic scale (−0.4, 0.4, 0.24)) is the only such enemy of the 242.
 */
const MIRRORED_PREFABS = new Set(['enemy_1196_msfyin']);

/**
 * The skeleton metadata of an enemy's model in data/assets.json: its local-client model (`spineLocal`, the official
 * skeleton — the one the client plays and the view draws when the local models are extracted) before the web `spine`,
 * which for such an enemy is another enemy's stand-in (`spineAliasOf`: 灼热源石虫 1305_mhslim draws the plain 源石虫's) or absent
 * (规程's own new enemies have only `spineLocal`).
 */
function enemySpine(manifest, spineId) {
  const e = manifest?.enemies?.[spineId];
  return e?.spineLocal ?? e?.spine;
}

/**
 * An enemy's attack clip → enemies.json `attackAnim` { clip, dur, hit } (GitHub #58: an unblocked ranged enemy stands for
 * its attack clip, server/sim/ai.js attackStand): the clip the client plays for its attacks — with `own`, the one its
 * attack ability names (`_animKey` after its mode's `_replaceAnimPairs`) when the model has it, else the asset manifest's
 * `anims.attack.loop` of the enemy's model (not an Idle stand-in, `via: 'idle'`) —, its length and its first strike
 * frame (`hits`: the clip's OnAttack event; absent when it has none — the sim then takes half the clip). Read from the
 * committed data/assets.json (written by tools/fetch-assets.mjs from the Spine skeletons; docs/ASSETS.md), so the sim
 * never reads client files; an enemy whose model the manifest lacks gets none (the sim falls back to ATTACK_PAUSE).
 */
function enemyAttackAnim(manifest, spineId, timing = null, own = false) {
  const sp = enemySpine(manifest, spineId);
  const a = sp?.anims?.attack;
  if (!a || typeof a.loop !== 'string' || a.via === 'idle') return null;
  // `own`: the clip its ability names, when the model has it — its key turned into the clip name by the prefab
  // animator's key table (`clip`, attack_timing.py anim_table: 가상적: 기계 `Attack` → `A_Attack`)
  const named = enemyClipName(timing);
  const clip = own && typeof sp.animations?.[named] === 'number' ? named : a.loop;
  const dur = sp.animations?.[clip];
  if (!(typeof dur === 'number' && dur > 0)) return null;
  const h = sp.hits?.[clip];
  const hit = Array.isArray(h) && Number.isFinite(h[0]) ? Math.min(dur, Math.max(0, h[0])) : null;
  // (`det` 1: a mode switch that detaches this ability cuts its swing — `_interruptAbilityOnDetach`, ai.js enemyMode)
  return { clip, dur, ...(hit != null ? { hit } : {}), ...abilityTiming(timing), ...(timing?.det === 1 ? { det: 1 } : {}) };
}

/**
 * The attack abilities of an enemy prefab's later modes (local-attack-timing.json `enemies[…].modes`, tools/local-extract/
 * attack_timing.py) → enemies.json `attackAnim.modes` {mode name: record | null}: each mode attaches its own attack ability,
 * ready, as the enemy switches to it (`Unit.SwitchMode`; server/sim/ai.js enemyMode) — the record of attackAnim's shape
 * (the clip its ability names when the model has it, else the model's attack clip; its own `combat` as attackAnim's),
 * null = the mode has no attack ability (no normal attack and no attack slot for its skills there: `Unit.hasAttack`). A
 * mode whose record equals the first mode's is left out (the first mode's stands); `attackAnim.mode0` names the first,
 * listed (null) only when it has no attack ability and a later mode has one.
 * Null when the prefab has one mode, or every later mode attacks as the first.
 */
function enemyModeAnims(ctx, spineId, key, applyWay, base) {
  const t = enemyTiming(ctx, spineId, key);
  if (!t?.modes) return null;
  const out = {};
  const pick = (m) => (applyWay === 'MELEE' ? (m.combat ?? m.attack ?? null) : (m.attack ?? m.combat ?? null));
  const strip = (r) => r && (({ combat, modes, ...rest }) => rest)(r);
  for (const [name, m] of Object.entries(t.modes)) {
    const ab = pick(m);
    let rec = ab ? enemyAttackAnim(ctx.manifest, spineId, ab, true) : null;
    if (rec && applyWay !== 'MELEE' && m.attack && m.combat) {
      const c = enemyAttackAnim(ctx.manifest, spineId, m.combat, true);
      if (c) rec.combat = c;
    }
    // (a mode whose ability names no clip the model has, or no ability at all where the first mode has one, keeps
    // the first mode's record only when its fields are the same)
    if (ab && !rec) continue;
    if (rec && JSON.stringify(strip(rec)) === JSON.stringify(strip(base)) && JSON.stringify(rec.combat ?? null) === JSON.stringify(base.combat ?? null)) continue;
    out[name] = rec;
  }
  // a first mode with no attack ability where a later one has one (元核孽生者: its Combat comes with mode 1): null as well
  if (!t.attack && !t.combat && Object.values(out).some(Boolean)) out[t.mode0] = null;
  return Object.keys(out).length ? out : null;
}

/**
 * The timing fields of an attack ability (tools/assets/local-attack-timing.json, tools/local-extract/attack_timing.py) as
 * `attackAnim` carries them: `max` = `_maxAnimScale` (−1 = no bound), `pre` = `_preDelay` (only when not 0), `wait: 0`
 * when `_waitForAttackEvent` is off, `sel` = `_selectTargetTiming` (only when not 0) — server/sim/ai.js attackTiming.
 */
function abilityTiming(t) {
  if (!t || typeof t !== 'object') return {};
  return {
    ...(Number.isFinite(t.max) ? { max: t.max } : {}),
    ...(t.pre > 0 ? { pre: t.pre } : {}),
    ...(t.wait === 0 ? { wait: 0 } : {}),
    ...(Number.isInteger(t.sel) && t.sel !== 0 ? { sel: t.sel } : {}),
  };
}

/**
 * Where an operator's attack ability turns the unit as its swing starts (local-attack-timing.json `face`, the client's
 * `AbstractAnimatedAbility.DealWithFaceDirection`) as `attackAnim` carries it: `face` only when it is not 1 (its main
 * target, the common case) — 0 keeps its facing (an attack on all in range: 莫斯提马, 白面鸮's heal), 2 turns it to its
 * deploy direction, 3 to its front, 4 to its first cast target — server/sim/ai.js 'swing', docs/rules/render.md 「공격 방향」.
 */
function abilityFace(t) {
  return t && Number.isInteger(t.face) && t.face !== 1 ? { face: t.face } : {};
}

/**
 * The official projectiles of an enemy (tools/assets/local-enemy-projectiles.json, tools/local-extract/enemy_projectiles.py)
 * → enemies.json `proj` (its normal attack's shot: the unblocked one, Attack, else the blocked one, Combat), `projModes`
 * ({mode name: shot} — a later mode that shoots another one), `skills[i].proj` (+ `projAlt`: the skill's other shots;
 * the skill matched by its GameObject name, case-insensitive — the client's `Skills/Boomb` is the table's `boomb`) and
 * `talentProj` ({talent name: shot}). A shot = `{ key, mount, move, speed, … }`: the projectile prefab key, the model
 * point it leaves from (Entity.MountPointType) and its movement (`move` TRACE_TARGET_WITH_SPEED / PARACURVE / HARPOON /
 * FIXED_DIRECTION / ATTACH / NONE, `speed` tiles per second, `height` `delay` `link` `life` `dir` … as read) — the sim
 * times the hit by it (server/sim/ai.js enemyShot), the renderer and the sound plan bind the key. `proj: null` = the
 * prefab was read and its normal attack has no projectile (written for enemies with a range only); absent = not read.
 */
function enemyProjectiles(ctx, spineId, key) {
  const src = ctx.enemyProjectiles;
  const e = src?.enemies?.[spineId] ?? src?.enemies?.[key];
  if (!e) return null;
  const rec = (s) => {
    if (!s || typeof s.key !== 'string') return null;
    const p = src.projectiles?.[s.key];
    return { key: s.key, ...(s.mount ? { mount: s.mount } : {}), ...(p || { move: 'NONE', speed: 0 }) };
  };
  // null: the prefab was read and its normal attack has no projectile (the client hits at the strike)
  const proj = rec(e.attack ?? e.combat) ?? null;
  const projModes = {};
  for (const m of e.modes || []) {
    const r = rec(m.attack ?? m.combat);
    if (r && r.key !== proj?.key) projModes[m.name] = r;
  }
  const lower = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const skills = lower(e.skills);
  const talentProj = {};
  for (const [k, v] of Object.entries(e.talents || {})) { const r = rec(v[0]); if (r) talentProj[k] = r; }
  return { proj, projModes, skills, talentProj, rec };
}

/** enemies.json `skills` with each skill's official projectile (enemyProjectiles). */
function withSkillProjectiles(skills, P) {
  if (!P) return skills;
  return skills.map((sk) => {
    const shots = P.skills[String(sk.prefabKey).toLowerCase()];
    if (!shots || !shots.length) return sk;
    const [first, ...rest] = shots.map(P.rec).filter(Boolean);
    return { ...sk, ...(first ? { proj: first } : {}), ...(rest.length ? { projAlt: rest } : {}) };
  });
}

/**
 * How an enemy's skills are cast (tools/assets/local-attack-timing.json `enemies[…].skills`, tools/local-extract/
 * attack_timing.py) → enemies.json `skillCast` {skill name in lower case: { family, dur?, clip?, max?, time?, cd?, cdKey?, chan?,
 * resetMain?, waitFirst? }}.
 * The client casts an enemy skill in place of a normal attack — at an attack slot, the skills first (the client's
 * `Enemy.AttackWrapper.SearchTarget` / `Cast`; `family` = its `_familyMask`, every skill of the mode has ATTACK and / or
 * COMBAT) — and restarts its cooldown as the cast ends (`EnemySkill._OnCastFinish`): `dur` = the clip of its animated
 * ability (data/assets.json, the same model as the attack; absent when it plays none), `max` its `_maxAnimScale`, `time`
 * its `_timeMode` (the attack time it plays to — `AbstractAnimatedAbility.get_cooldown`: 0 the enemy's, 1 the clip, 2
 * `cd` = `_cooldown`, 3 the skill blackboard's `cdKey`; absent when the skill has no animated ability);
 * `resetMain` (+ `waitFirst`) = `_resetMainAbilityCdWhenCastEnd`, the main attack's cooldown restarted as the cast ends
 * (`ResetCooldown(_resetCdWaitFirstPeriod)`). Keyed by the skill's GameObject name, matched to the table's prefabKey case
 * aside (as the projectiles); a template's `overrides.skills` use the same keys. Server/sim/content/enemies.js.
 */
function enemySkillCast(ctx, manifest, spineId, key) {
  const e = ctx.attackTiming?.enemies?.[spineId] ?? ctx.attackTiming?.enemies?.[key];
  if (!e || !e.skills) return null;
  const sp = enemySpine(manifest, spineId);
  const anims = sp?.animations || {};
  // one ability's cast (attack_timing.py cast_fields): its clip and the attack time it plays to, or its class (`kind`: an
  // ActiveBuffAbility, a group with its children's casts); `miss` = it names a clip data/assets.json lacks; `hit` = the
  // clip's first OnAttack frame when the ability waits for it (`_waitForAttackEvent`), as attackAnim's
  // (the clip = the ability's key through the prefab animator's key table, enemyClipName; '' = the table lacks the key:
  // the client plays nothing and the ability keeps its attack time, as one without a clip)
  const castOf = (name, s) => {
    const clip = enemyClipName(s);
    const dur = clip ? anims[clip] : null;
    if (clip && !(dur > 0)) warn(`enemy ${key} skill ${name}: clip ${clip} not in data/assets.json`);
    const h = dur > 0 && s.wait === 1 ? sp?.hits?.[clip] : null;
    const hit = Array.isArray(h) && Number.isFinite(h[0]) ? Math.min(dur, Math.max(0, h[0])) : null;
    return {
      ...(s.kind ? { kind: s.kind } : {}),
      ...(s.kind === 'buff' && s.wfc ? { wfc: 1 } : {}),
      ...(Array.isArray(s.subs) ? { subs: s.subs.map((c) => castOf(name, c)) } : {}),
      ...(dur > 0 ? { clip, dur, ...(hit != null ? { hit } : {}), ...(Number.isFinite(s.max) ? { max: s.max } : {}) } : clip ? { miss: 1 } : {}),
      ...(Number.isFinite(s.time) ? { time: s.time } : {}),
      ...(s.time === 2 ? { cd: s.cd || 0 } : s.time === 3 ? { cdKey: s.cdKey || 'duration' } : {}),
      ...(s.proj ? { proj: 1 } : {}),
      // its ThreePartChannelingAnimation clips ({ begin, loop, end, down?, up?, wait? } — the view plays them as the engine's
      // cast tells it: render/units.js onEnemySkill, server/sim/content/enemies.js castSkill)
      ...(s.chan && typeof s.chan === 'object' ? { chan: s.chan } : {}),
    };
  };
  const out = {};
  for (const [name, s] of Object.entries(e.skills)) {
    out[name.toLowerCase()] = {
      family: s.family,
      ...castOf(name, s),
      ...(s.resetMain ? { resetMain: 1, waitFirst: s.waitFirst ? 1 : 0 } : {}),
    };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The clip an enemy ability plays (local-attack-timing.json, attack_timing.py): its key (`anim`, after its mode's
 * `_replaceAnimPairs`) turned into the model's clip name by the prefab animator's key table (`clip` when that is another
 * name; '' when the table lacks the key — the client plays nothing, `SpineAnimator.GetAnimationData`), else the key.
 */
function enemyClipName(t) {
  if (!t || typeof t.anim !== 'string' || !t.anim) return '';
  return typeof t.clip === 'string' ? t.clip : t.anim;
}

/** An enemy's row of local-attack-timing.json `enemies` (by its prefab, else its key), or undefined. */
function enemyTiming(ctx, spineId, key) {
  return ctx.attackTiming?.enemies?.[spineId] ?? ctx.attackTiming?.enemies?.[key];
}

/** An enemy's attack ability (local-attack-timing.json `enemies`): the blocked one (Combat) for a melee enemy, else Attack. */
function enemyAbility(ctx, spineId, key, applyWay) {
  const e = enemyTiming(ctx, spineId, key);
  if (!e) return null;
  return applyWay === 'MELEE' ? (e.combat ?? e.attack ?? null) : (e.attack ?? e.combat ?? null);
}

/**
 * The mode skill `i`'s attacks run in: the one it switches to (skillModeIndex), or the one its 【移动】 lands it in when the skill
 * moves it as it starts (SKILL_SUB_MODES `teleport`: Mon3tr S3 S3_Reborn, 贝洛内 S3 S3_Resapwn; `anchor`: 乌尔比安 S3 S3_Respawn_A,
 * his redeploy where the anchor landed, which ends the cast) — the prefab's `S3` mode then only starts the skill, and its Attack
 * clip gave Mon3tr's S3 swings half their official length.
 */
function attackModeIndex(charId, modes, i, skillMode) {
  const m = skillModeIndex(modes, i, skillMode);
  const sub = SKILL_SUB_MODES[charId]?.teleport ?? SKILL_SUB_MODES[charId]?.anchor;
  return m > 0 && sub && sub.startsWith(`${modes[m]}_`) && modes.includes(sub) ? modes.indexOf(sub) : m;
}

/**
 * An operator's attack clips → chess.json / backups.json `attackAnim` { base, skills }: per attack mode (`base` = its
 * Default mode, `skills[i]` = the mode skill i switches to — shared/skill-modes.js skillModeIndex over the prefab's
 * `_modes`, null when the skill keeps the Default one) the clip its attack ability plays (`_animKey`, renamed by the
 * mode's `_replaceAnimPairs`; tools/assets/local-attack-timing.json), its length and first OnAttack frame from the Front
 * skeleton (data/assets.json `animations` / `hits`; a key the skeleton lacks under that name, also as `<key>_Loop`, falls
 * back to the clip the renderer plays for that mode — `anims.attack` / `anims.skills[i]`), the ability's timing
 * (abilityTiming), a ThreePart attack's first-attack begin (`begin` / `esc`, server/sim/ai.js attackTiming) and facing
 * (abilityFace). null when the client timing or the model is unknown (the sim then strikes as the swing starts).
 */
function opAttackAnim(ctx, charId, skillCount) {
  const t = ctx.attackTiming?.ops?.[charId];
  const sp = ctx.manifest?.chars?.[charId]?.spine?.front;
  if (!t || !sp?.animations) return null;
  const clipOf = (ab, fallback) => {
    // `clip`: the skin's key table; the rest for a key the table does not name (the client plays no other clip then)
    for (const n of [ab?.clip, ab?.anim, ab?.anim ? `${ab.anim}_Loop` : null, fallback]) {
      const dur = n ? sp.animations[n] : null;
      if (typeof dur === 'number' && dur > 0) {
        const h = sp.hits?.[n];
        const hit = Array.isArray(h) && Number.isFinite(h[0]) ? Math.min(dur, Math.max(0, h[0])) : null;
        // (`det` 1: a mode switch that detaches this ability cuts its swing — `_interruptAbilityOnDetach`, ai.js updateAlly)
        return { clip: n, dur, ...(hit != null ? { hit } : {}), ...abilityTiming(ab), ...firstBegin(ab), ...abilityFace(ab), ...(ab?.det === 1 ? { det: 1 } : {}) };
      }
    }
    return null;
  };
  // a ThreePart attack's first-attack begin clip (`begin` seconds, `esc` its `_escapeTime`): the key, else the clip the
  // renderer frames the attack with when the skin names it otherwise (德克萨斯: key Attack_Begin, clip Attack_Start)
  const firstBegin = (ab) => {
    if (typeof ab?.begin !== 'string' || !ab.begin) return {};
    const role = sp.anims?.attack;
    const dur = [ab.begin, role?.firstBegin ? role.begin : null].map((n) => (n ? sp.animations[n] : null)).find((d) => typeof d === 'number' && d > 0);
    return dur ? { begin: dur, ...(ab.esc > 0 ? { esc: ab.esc } : {}) } : {};
  };
  // a 要塞's ranged swing where its clip times differently from the melee one (`ranged`, ai.js attackTiming); a mode's
  // separate `_combat` ability, with its own cooldown and clip while the unit blocks (`combat`, ai.js syncCombat)
  const withRanged = (ab, clip) => {
    const r = clip && ab?.ranged ? clipOf(ab.ranged, null) : null;
    const c = clip && ab?.combat ? clipOf(ab.combat, null) : null;
    return { ...clip, ...(r && (r.dur !== clip.dur || r.hit !== clip.hit) ? { ranged: r } : null), ...(c ? { combat: c } : null) };
  };
  const base = t.attack?.[0] ? withRanged(t.attack[0], clipOf(t.attack[0], sp.anims?.attack?.loop)) : null;
  const skillMode = ctx.charModes?.[charId]?.skillMode ?? null;
  const skills = [];
  for (let i = 0; i < skillCount; i++) {
    const m = attackModeIndex(charId, t.modes, i, skillMode);
    const ab = m > 0 ? t.attack?.[m] : null;
    const rec = ab ? withRanged(ab, clipOf(ab, sp.anims?.skills?.[String(i)]?.loop ?? sp.anims?.skill?.loop)) : null;
    // the mode a running skill switches to on the way, by its kit's `atkSub` (ai.js attackClipOf): its own attack ability
    // and clip; the modes a 【移动】 lands in are the skill's whole attack mode already (attackModeIndex)
    const subName = rec && m > 0 ? Object.entries(SKILL_SUB_MODES[charId] ?? {}).find(([k, n]) => k !== 'teleport' && k !== 'anchor' && isOwnSubMode(t.modes, m, n))?.[1] : null;
    const subAb = subName ? t.attack?.[t.modes.indexOf(subName)] : null;
    const sub = subAb ? withRanged(subAb, clipOf(subAb, null)) : null;
    skills.push(rec && sub ? { ...rec, sub } : rec);
  }
  return base || skills.some(Boolean) ? { base, skills } : null;
}

const withAttackAnim = (attackAnim) => (attackAnim ? { attackAnim } : null);

/**
 * A summon's attack → tokens.json / backups.json `tokens` `attackAnim` { clip, dur, hit, … } as an enemy's: its prefab's Default
 * mode (tools/assets/local-attack-timing.json `tokens`), the clip's length and first OnAttack frame from the official default
 * model's skeleton (data/assets.json `tokens[id].spineLocal`, the local client's, else `.spine` when the web model is the
 * default one — never a skin variant, `spineVariant`: a skin times nothing, docs/rules/sim.md 「일반 공격 타이밍」; such a
 * summon without its local model stops the build: add it to tools/local-extract/extract.py TOKEN_SPINES). An ability that plays no clip of the
 * skeleton waits for no frame: its strike comes when the wait for it runs out, the ability's time — `noClip: 1`, server/sim/ai.js
 * attackTiming. null when its prefab has no attack ability (it never attacks in the client) or was not read.
 */
function tokenAttackAnim(ctx, tokenId) {
  const t = ctx.attackTiming?.tokens?.[tokenId];
  const ab = t?.attack?.[t.modes.indexOf('Default')];
  if (!ab) return null;
  const m = ctx.manifest?.tokens?.[tokenId];
  if (m?.spineVariant && !m.spineLocal) {
    throw new Error(`tokenAttackAnim: ${tokenId} has only the web skin variant ${m.spineVariant} and no official default model `
      + '(data/assets.json tokens[id].spineLocal) — a skin must not time the summon (docs/rules/sim.md 「일반 공격 타이밍」): add it to '
      + 'tools/local-extract/extract.py TOKEN_SPINES, extract it and run node tools/fetch-assets.mjs --local-spines --offline');
  }
  const sp = m?.spineLocal ?? m?.spine;
  const dur = ab.anim ? sp?.animations?.[ab.anim] : null;
  // `born`: its prefab's `_useRealBornTimeFromAnim` — the born state lasts the Born clip (the skeleton's Start), not 1 s; a model with no
  // Born clip has no born state: `PlayBornAnimationAndEffect` calls its `noBornAnimationFallBack`, the state's `_OnLocate`, at once (server/sim/constants.js BORN_TIME)
  const startClip = sp?.animations?.Start;
  const born = t.realBorn && typeof startClip === 'number' && startClip > 0 ? { born: startClip }
    : sp?.animations && Object.keys(sp.animations).length && startClip == null ? { born: 0 } : {};
  const timing = { ...abilityTiming(ab), ...abilityFace(ab), ...(ab.det === 1 ? { det: 1 } : {}), ...born };
  if (!(typeof dur === 'number' && dur > 0)) return { noClip: 1, ...timing };
  const h = sp.hits?.[ab.anim];
  const hit = Array.isArray(h) && Number.isFinite(h[0]) ? Math.min(dur, Math.max(0, h[0])) : null;
  return { clip: ab.anim, dur, ...(hit != null ? { hit } : {}), ...timing };
}

/**
 * The official projectile of an operator's normal attack, per attack mode (tools/assets/local-op-projectiles.json,
 * tools/local-extract/op_projectiles.py) → chess.json / backups.json `shot` { base, skills } (indexed as `attackAnim`:
 * `base` its Default mode, `skills[i]` the mode skill i switches to — shared/skill-modes.js skillModeIndex — null when the
 * skill keeps the Default one; `{ move: 'OTHER', speed: 0 }` when its mode has no attack ability read; a skill without
 * a mode and without table duration takes its prefab's own shot — its next attack / bullets fire it). A shot = `{ key, mount, move, speed, … }` (the
 * projectile prefab, the model point, its movement as data/enemies.json `proj`), or `{ move: 'NONE', speed: 0 }` without
 * a key when the attack has no projectile (its hit lands at the strike); `combat: 1` = the mode attacks the enemies it
 * blocks with a blocked ability that has none (拉普兰德's `Body/Combat`). server/sim/ai.js opShot times the hit by it,
 * render/fx/speeds.js opProjSpeed draws it over the same time. null when the operator was not read.
 */
function opShot(ctx, charId, charSkills) {
  const src = ctx.opProjectiles;
  const t = src?.ops?.[charId];
  if (!t || !Array.isArray(t.attack)) return null;
  const none = new Set(t.none || []);
  const rec = (m) => {
    if (!Number.isInteger(m) || m < 0 || m >= t.attack.length) return null;
    // a mode whose attack ability was not read (a skill that attacks through its kit: 灵知 S2): not the Default's shot
    if (none.has(m)) return m > 0 ? { move: 'OTHER', speed: 0 } : null;
    const a = t.attack[m];
    const out = a && typeof a.key === 'string'
      ? { key: a.key, ...(a.mount ? { mount: a.mount } : {}), ...(src.projectiles?.[a.key] || { move: 'NONE', speed: 0 }) }
      : { move: 'NONE', speed: 0 };
    return t.combat?.[m] ? { ...out, combat: 1 } : out;
  };
  // a skill's own shot (`skills[prefabId]`: its prefab's ability fires it) for a skill with no mode and no table duration —
  // its next attack / its bullets (维什戴尔 S1, 号角 S1); a timed skill's projectile is an ability of its own
  const ownShot = (sk) => {
    const lv = ctx.skillTable?.[sk?.skillId]?.levels?.at?.(-1);
    const a = src.skills?.[lv?.prefabId ?? sk?.skillId];
    if (!a || typeof a.key !== 'string' || !(Number(lv?.duration) <= 0)) return null;
    return { key: a.key, ...(a.mount ? { mount: a.mount } : {}), ...(src.projectiles?.[a.key] || { move: 'NONE', speed: 0 }) };
  };
  const base = rec(0);
  const skillMode = ctx.charModes?.[charId]?.skillMode ?? null;
  const skills = [];
  for (let i = 0; i < charSkills.length; i++) {
    const m = attackModeIndex(charId, t.modes, i, skillMode);
    skills.push(m > 0 ? rec(m) : ownShot(charSkills[i]));
  }
  return base || skills.some(Boolean) ? { base, skills } : null;
}

/**
 * How a skill is cast (tools/assets/local-skill-cast.json, tools/local-extract/skill_cast.py) → the skill record's `cast`
 * (server/sim/skills.js, docs/rules/sim.md 「즉발 스킬의 시전」): `mode` 'replace' (ReplacementSkill: the cast replaces
 * the next attack), 'state' (CastSkill `_switchToState` 1: the unit stays in its Skill state until the skill ability
 * ends) or 'free' (`_switchToState` 0); `resetCd` 1 = `_resetAbilityCooldownWhenCastEnd`; `bornWait` 1 = the cast is
 * refused while the unit is in its born state (`born` 0: the prefab's `_canSwitchDuringBorn` / `_canCastDuringBorn` off —
 * server/sim/skills.js _born); `aimSelf` 1 = the skill ability is cast at the unit's own place (`aim` 0: no turn to a
 * target as it is cast — server/sim/ai.js castFace); `begin` = the length of a 'state' cast's begin clip (`_playSkillBeginAnim`). With a skill ability: `time`
 * = its `_timeMode` (0 the attack interval, 1 its clip, 2 / 3 `cd`), `cd` (time 2: `_cooldown`, 3: the blackboard
 * value of `_cooldownKey`), its clip (`clip`, `dur`, the first OnAttack frame `hit` — Front skeleton, data/assets.json,
 * a key the skeleton lacks also tried as `<key>_Loop`), abilityTiming's `max` / `pre` / `wait` and abilityFace's `face`
 * (where the unit turns as the ability is cast — server/sim/ai.js castFace). No ability (a buff cast): `mode` only. null
 * when the skill was not read.
 */
function skillCast(ctx, charId, s) {
  const c = ctx.skillCast?.skills?.[s.prefabId] ?? ctx.skillCast?.skills?.[s.skillId];
  if (!c || (c.cls !== 'replace' && c.cls !== 'cast')) return null;
  const out = { mode: c.cls === 'replace' ? 'replace' : c.state ? 'state' : 'free' };
  if (c.cls === 'cast' && c.reset) out.resetCd = 1;
  if (c.cls === 'cast' && c.born === 0) out.bornWait = 1;
  // `aim` 0: the skill ability is cast at the unit's own place (no `_trigger`: `CastSkill.DoCast` → `CastDirectly`), so its
  // `_faceToTarget` turns nothing (server/sim/ai.js castFace)
  if (c.cls === 'cast' && c.aim === 0) out.aimSelf = 1;
  const sp = ctx.manifest?.chars?.[charId]?.spine?.front;
  // the begin clip of a 'state' cast (`begin` s): the Skill state plays it and starts the skill once it has played
  // (`BasicSkill.PlayBeginAnimation` waits the clip's length — none when the skeleton lacks it; server/sim/skills.js
  // _beginCast). The `beginDown` clip of a unit deployed facing down is as long in every pool skeleton, so it is not kept.
  const beginLen = out.mode === 'state' && typeof c.begin === 'string' && c.begin ? sp?.animations?.[c.begin] : null;
  if (typeof beginLen === 'number' && beginLen > 0) out.begin = beginLen;
  const a = c.ability;
  if (!a || typeof a !== 'object') return out;
  out.time = Number.isInteger(a.time) ? a.time : 0;
  if (out.time === 2 && a.cd > 0) out.cd = a.cd;
  if (out.time === 3 && Number(s.bb?.[a.cdKey]) > 0) out.cd = Number(s.bb[a.cdKey]);
  for (const n of a.anim ? [a.clip, a.anim, `${a.anim}_Loop`] : []) {
    const dur = n ? sp?.animations?.[n] : null;
    if (!(typeof dur === 'number' && dur > 0)) continue;
    const h = sp.hits?.[n];
    Object.assign(out, { clip: n, dur, ...(Array.isArray(h) && Number.isFinite(h[0]) ? { hit: Math.min(dur, Math.max(0, h[0])) } : {}) });
    break;
  }
  // a ThreePart component plays the clip (no `_animKey`): the begin + end (channel) or begin + oneshot clips scale together in the
  // ability's time, whose OnAttack frame the ability waits for; `hold` 1: the action lasts the ability's time (a channel's loop fills it)
  const len = (n) => (n && typeof sp?.animations?.[n] === 'number' ? sp.animations[n] : 0);
  const frame = (n) => (n && Array.isArray(sp?.hits?.[n]) && Number.isFinite(sp.hits[n][0]) ? sp.hits[n][0] : null);
  if (a.chan && len(a.chan.begin) > 0 && frame(a.chan.begin) != null) {
    Object.assign(out, { clip: a.chan.begin, dur: len(a.chan.begin) + len(a.chan.end), hit: frame(a.chan.begin), hold: 1 });
    return Object.assign(out, abilityTiming({ max: 1, pre: a.pre, wait: a.wait }), abilityFace(a));
  }
  if (a.three && len(a.three.oneshot) > 0 && frame(a.three.oneshot) != null) {
    Object.assign(out, { clip: a.three.oneshot, dur: len(a.three.begin) + len(a.three.oneshot), hit: len(a.three.begin) + frame(a.three.oneshot), hold: 1 });
  }
  return Object.assign(out, abilityTiming({ max: a.max, pre: a.pre, wait: a.wait }), abilityFace(a));
}

/**
 * The client's `_showSpAsBulletMode` of a skill (tools/assets/local-skill-hud.json, tools/local-extract/skill_hud.py) → the
 * skill record's `bulletMode`: 1 = while the skill is affecting (a passive one always) the unit's HUD shows the bullet bar
 * in place of the SP cast slider — an ammo skill's bullets left, any other skill's SP as blocks (the client's
 * `Character.get_hudPluginMask`, UIHudCharBulletBar; docs/rules/ui.md 「탄환형 스킬」); 0 = never. null when not read
 * (server/sim/local-hud.js then shows an ammo skill's bullets, as before the flag was read).
 */
function skillBulletMode(ctx, s) {
  const v = ctx.skillHud?.skills?.[s.prefabId] ?? ctx.skillHud?.skills?.[s.skillId];
  return v === 0 || v === 1 ? v : null;
}

/**
 * Whether a skill is a 过载 skill: its prefab's `_isOverloadSkill` (the `overload` map of tools/assets/local-skill-hud.json,
 * tools/local-extract/skill_hud.py) → the skill record's `overload: 1` — from half of its run the unit's HUD shows the red
 * overload bar (server/sim/local-hud.js `ovl`, public/js/render/hud-bars.js; docs/rules/ui.md 「과부하 스킬」).
 */
function skillOverload(ctx, s) {
  const o = ctx.skillHud?.overload;
  return !!(o && (o[s.prefabId] ?? o[s.skillId]));
}

/**
 * Whether a skill is cast without the operator's 作战中 line: its prefab's `_playCharWordVoice` is off (`word` 0 in
 * tools/assets/local-skill-cast.json; the client's VoicePlayer._OnSkillCasted) → the skill record's `charWord: false`
 * (public/js/voicePolicy.js; docs/rules/audio.md 「더빙 효과음」). 浊心斯卡蒂's S1–S3: their start sound carries the line.
 */
function skillSilent(ctx, s) {
  const c = ctx.skillCast?.skills?.[s.prefabId] ?? ctx.skillCast?.skills?.[s.skillId];
  return c?.word === 0;
}

/**
 * Whether a skill shows no range of its own (`range` 0 in tools/assets/local-skill-cast.json: the prefab's
 * `_hideRangeToShow`, or `_forceUseBaseShowRange` ending at the unit's own mode) → the skill record's `showRange: false`: the field piece menu draws no
 * skill range toggle for it (public/js/screens/game/range.js skillButton; docs/rules/ui.md 「선택 메뉴」).
 */
function skillRangeHidden(ctx, s) {
  const c = ctx.skillCast?.skills?.[s.prefabId] ?? ctx.skillCast?.skills?.[s.skillId];
  return c?.range === 0;
}

/**
 * Whether the operator fights with a skill's own range from its deployment: the skill prefab deploys it in a mode of the
 * skill's range modes (`_defaultModeIndex` is its `_rangeIdModeIndex` or in `_extraRangeIdModeIndices`:
 * tools/assets/local-char-modes.json `rangeSkills`, tools/local-extract/char_modes.py range_skill_modes) and the skill has
 * a rangeId → the skill record's `passiveRange` (shared/loadoutRecord.js attackRangeGrid: the prep card and board range).
 * 云迹 S1 2-3 (her Default_S1 after landing too), 予愿安洁莉娜 S1 3-6 (S1_TakeOff), 引星棘刺 S3 3-9 (its text also says so).
 */
function skillDeployRange(ctx, charId, s) {
  const keys = ctx.charModes?.[charId]?.rangeSkills;
  return !!(s.rangeId && Array.isArray(keys) && keys.includes(s.prefabId));
}

/** The handbook's 「不停止移动」 attack (“十字路口”量产型's 四向攻击) → enemies.json `attackMoves`: it never stops to attack. */
const attacksOnTheMove = (abilities) => abilities.some((a) => a.text.includes('不停止移动'));

/**
 * The 鸭爵 strategy's swapped-in enemies (`round_start_all_player_change_enemy_2` enemylist — the act2 versions, *_2)
 * cost BAND_SWAP_LPR at the protection point, not the database's lifePointReduce 0 (the roguelike 宝藏 rule): PRTS
 * 卫戍协议：盟约 下半/PRTS盟约记录 §策略 鸭爵 备注 "…但进入保护目标点将减少1点目标生命值，且在最终回合和隐秘核心回合中仍然生效"
 * (player feedback after 0.1.0, #7). Normal rounds count leaks whatever their `lpr`; the Final Assault / Hidden Core
 * LP and the detail card's 目标价值 read it.
 */
const BAND_SWAP_LPR = 1;
function bandSwapEnemyKeys(act) {
  const out = new Set();
  for (const buffs of Object.values(act.effectBuffInfoDataDict || {})) for (const b of buffs || []) {
    if (b?.key !== 'round_start_all_player_change_enemy_2') continue;
    for (const kv of b.blackboard || []) if (kv.key === 'enemylist') for (const k of String(kv.valueStr || '').split(',')) if (k.trim()) out.add(k.trim());
  }
  return out;
}

/**
 * Build data/enemies.json: base stats at the season level (randomEnemyAttributeDict.level, 0 for
 * all), with the season-wide override level (level_autochess_enemy_data) applied.
 */
function buildEnemies(ctx) {
  const { ac, act, handbook } = ctx;
  const swapKeys = bandSwapEnemyKeys(act);
  const c = ac.constData;
  const hpF = c.enemyMaxHpFactor ?? 1, atkF = c.enemyAtkFactor ?? 5, defF = c.enemyDefFactor ?? 3, resF = c.enemyMagicResistanceFactor ?? 3;
  const globalOverrides = new Map();
  for (const r of ctx.levels[ctx.enemyDataLevelId]?.enemyDbRefs || []) if (r.overwrittenData) globalOverrides.set(r.id, r.overwrittenData);
  const slots = templateSlots(ctx);
  const typeOf = new Map();
  for (const [type, list] of Object.entries(act.enemyInfoDict || {})) for (const k of list) {
    if (!typeOf.has(k)) typeOf.set(k, []);
    typeOf.get(k).push(type);
  }
  const specialType = new Map(Object.values(act.specialEnemyInfoDict || {}).map((e) => [e.specialEnemyKey, e.type]));
  const inactiveIn = new Map();
  for (const m of Object.values(act.modeDataDict)) for (const k of m.inactiveEnemyKey || []) {
    if (!inactiveIn.has(k)) inactiveIn.set(k, []);
    inactiveIn.get(k).push(m.modeId);
  }
  const out = {};
  const allKeys = collectEnemyKeys(ctx);
  for (const key of allKeys) {
    const levels = ctx.enemyDb.get(key);
    if (!levels || !levels.length) { warn(`enemy ${key} missing from enemy_database`); continue; }
    const rand = ac.randomEnemyAttributeDict?.[key] || null;
    const wantLevel = rand?.level ?? 0;
    const base = levels.find((l) => l.level === 0)?.enemyData || levels[0].enemyData;
    let data = base;
    if (wantLevel > 0) {
      const lv = levels.find((l) => l.level === wantLevel);
      if (lv) data = mergeEnemyData(base, lv.enemyData);
      else warn(`enemy ${key}: level ${wantLevel} missing, using 0`);
    }
    const override = globalOverrides.get(key) || null;
    if (override) data = mergeEnemyData(data, override);
    const at = data.attributes || {};
    const hb = handbook.enemyData?.[key] || null;
    const dmgTypes = (hb?.damageType || []).map((d) => DMG_MAP[d] || String(d).toLowerCase());
    const applyWay = mv(data.applyWay, 'NONE');
    let dmgType = dmgTypes[0] || (applyWay === 'NONE' ? 'none' : 'phys');
    if (applyWay === 'NONE' && !dmgTypes.length) dmgType = 'none';
    const rawRangeRadius = cleanNum(mv(data.rangeRadius, 0));
    const stats = {
      maxHp: mv(at.maxHp, 0), atk: mv(at.atk, 0), def: mv(at.def, 0), res: cleanNum(mv(at.magicResistance, 0)),
      moveSpeed: cleanNum(mv(at.moveSpeed, 1)), bat: cleanNum(mv(at.baseAttackTime, 1)), aspd: cleanNum(mv(at.attackSpeed, 100)),
      rangeRadius: effectiveRangeRadius(applyWay, rawRangeRadius),
      rawRangeRadius,
      blockCnt: at.blockCnt?.m_defined ? at.blockCnt.m_value : 1,
      massLevel: mv(at.massLevel, 0), lpr: mv(data.lifePointReduce, 1),
      hpRecoveryPerSec: cleanNum(mv(at.hpRecoveryPerSec, 0)),
      elementRes: cleanNum(mv(at.epResistance, 0)), elementDmgRes: cleanNum(mv(at.epDamageResistance, 0)),
      hitRatePhys: cleanNum(mv(at.damageHitratePhysical, 0)), hitRateArts: cleanNum(mv(at.damageHitrateMagical, 0)),
      dmgType, dmgTypes, motion: mv(data.motion, 'WALK'),
      immunities: {
        stun: !!mv(at.stunImmune, false), silence: !!mv(at.silenceImmune, false), sleep: !!mv(at.sleepImmune, false),
        frozen: !!mv(at.frozenImmune, false), levitate: !!mv(at.levitateImmune, false),
      },
      otherImmunities: ['disarmedCombat', 'feared', 'palsy', 'attract', 'teleport', 'groundBound'].filter((k) => !!mv(at[`${k}Immune`], false)),
      tauntLevel: mv(at.tauntLevel, 0),
    };
    if (swapKeys.has(key)) stats.lpr = BAND_SWAP_LPR;
    const beFactor = rand?.enemyBattleEffectivenessFactor ?? 1;
    const be = beFactor > 0 ? Math.round((stats.maxHp * hpF + stats.atk * atkF + stats.def * defF + stats.res * resF) / beFactor) : null;
    const talents = flattenBB(data.talentBlackboard, `enemy ${key} talents`);
    const abilities = (hb?.abilityList || []).map((a) => ({ text: stripRich(a.text), textRaw: richRaw(a.text), format: a.textFormat || 'NORMAL' }));
    const name = mv(data.name) || hb?.name || key;
    const descRaw = mv(data.description);
    const hitArea = HIT_AREAS[mv(data.prefabKey) || key] || null;
    const modelScale = MODEL_SCALE_BY_PREFAB.get(mv(data.prefabKey) || key) ?? null;
    const modelScaleY = MODEL_STRETCH_Y_BY_PREFAB.get(mv(data.prefabKey) || key) ?? null;
    // (the clip its attack ability names, renamed by its first mode's `_replaceAnimPairs`, when the model has it)
    const attackAnim = enemyAttackAnim(ctx.manifest, mv(data.prefabKey) || key, enemyAbility(ctx, mv(data.prefabKey) || key, key, applyWay), true);
    // an enemy that shoots unblocked and has a `_combat` ability too: that ability holds its own cooldown while it is blocked (ai.js syncCombat)
    const enemyCombat = attackAnim && applyWay !== 'MELEE' ? enemyTiming(ctx, mv(data.prefabKey) || key, key)?.combat : null;
    if (enemyCombat && enemyTiming(ctx, mv(data.prefabKey) || key, key)?.attack) attackAnim.combat = enemyAttackAnim(ctx.manifest, mv(data.prefabKey) || key, enemyCombat, true);
    const attackModes = attackAnim ? enemyModeAnims(ctx, mv(data.prefabKey) || key, key, applyWay, attackAnim) : null;
    if (attackModes) { attackAnim.mode0 = enemyTiming(ctx, mv(data.prefabKey) || key, key).mode0; attackAnim.modes = attackModes; }
    const shots = enemyProjectiles(ctx, mv(data.prefabKey) || key, key);
    const skillCast = enemySkillCast(ctx, ctx.manifest, mv(data.prefabKey) || key, key);
    out[key] = {
      key, name, level: wantLevel, rank: mv(data.levelType, 'NORMAL'), handbookIndex: hb?.enemyIndex || null,
      desc: stripRich(descRaw), descRaw: richRaw(descRaw),
      applyWay, stats,
      abilities,
      talents: { bb: talents.bb, bbStr: talents.bbStr },
      skills: withSkillProjectiles(enemySkills(data.skills, `enemy ${key}`), shots),
      ...(skillCast ? { skillCast } : {}),
      // an enemy without a normal attack of its own (applyWay NONE / ATK 0) whose prefab's mode still has an Attack ability:
      // its attack slot comes round for its skills (the client's `Enemy.AttackWrapper.SearchTarget` asks `Unit.hasAttack`
      // = the mode's `_attack`, not the table) — content/enemies.js skillSlot
      ...(skillCast && (applyWay === 'NONE' || !(stats.atk > 0)) && enemyTiming(ctx, mv(data.prefabKey) || key, key)?.attack ? { attackAbility: true } : {}),
      // SP pool of SP-cost skills (e.g. 假想敌：黑云 技力上限 3 = 全弹发射 hits); only when the database has one
      ...(data.spData ? { sp: { type: data.spData.spType ?? null, maxSp: data.spData.maxSp ?? 0, initSp: data.spData.initSp ?? 0, increment: data.spData.increment ?? 0 } } : {}),
      notCountInTotal: !!mv(data.notCountInTotal, false),
      tags: mv(data.enemyTags) || [],
      be, beFactor, attrPower: enemyAttrPower(ctx, key, wantLevel), isFlyEnemy: rand ? !!rand.isFlyEnemy : stats.motion === 'FLY',
      tokenOnly: !allKeys.direct.has(key),
      acTypes: typeOf.get(key) || [], acType: specialType.get(key) || (typeOf.get(key) || [])[0] || null,
      templateSlot: slots[key] || null,
      summons: rand?.extraEnemyKeyList || [],
      inactiveIn: inactiveIn.get(key) || [],
      seasonOverride: override ? Object.keys(definedFields(override)) : null,
      iconId: key, spine: mv(data.prefabKey) || key,
      ...(hitArea ? { hitArea: { ...hitArea } } : {}),
      ...(STATIC_BODIES.has(key) ? { staticBody: true } : {}),
      ...(ENEMY_SKILL_DEVICES[key] ? { devices: ENEMY_SKILL_DEVICES[key].map((d) => skillDevice(ctx, d, `enemy ${key}`)) } : {}),
      ...(modelScale != null && modelScale !== 1 ? { modelScale } : {}),
      ...(modelScaleY != null && modelScaleY !== 1 ? { modelScaleY } : {}),
      ...(MIRRORED_PREFABS.has(mv(data.prefabKey) || key) ? { mirrorX: true } : {}),
      ...(attackAnim ? { attackAnim } : {}),
      // `proj: null` only for an enemy with a range (rawRangeRadius > 0) whose attack has no projectile: its ranged hit lands at the strike
      ...(shots?.proj ? { proj: shots.proj } : shots && rawRangeRadius > 0 ? { proj: null } : {}),
      ...(shots && Object.keys(shots.projModes).length ? { projModes: shots.projModes } : {}),
      ...(shots && Object.keys(shots.talentProj).length ? { talentProj: shots.talentProj } : {}),
      ...(attacksOnTheMove(abilities) ? { attackMoves: true } : {}),
    };
  }
  for (const k of STATIC_BODIES) if (!out[k]) warn(`STATIC_BODIES: ${k} is not an enemy of the mode`);
  return out;
}

// ===== waves ====================================================================================

const pos = (p) => (p ? [p.row, p.col] : null);
/** A checkpoint's `reachOffset` as [row, col] (map y, x), null when it has none: its target is the tile's centre plus this. */
const reachOffset = (c) => (c.reachOffset && (c.reachOffset.x || c.reachOffset.y) ? [cleanNum(c.reachOffset.y), cleanNum(c.reachOffset.x)] : null);

/** Resolve an official route into { motion, start, end, checkpoints, steps? }; a checkpoint with a `reachOffset` is [row, col, dRow, dCol]. */
function resolveRoute(r) {
  if (!r) return null;
  const checkpoints = [];
  const steps = [];
  let special = false;
  for (const c of r.checkpoints || []) {
    switch (c.type) {
      case 'MOVE': {
        const o = reachOffset(c);
        checkpoints.push(o ? [...pos(c.position), ...o] : pos(c.position));
        steps.push(o ? { t: 'move', p: pos(c.position), o } : { t: 'move', p: pos(c.position) });
        break;
      }
      case 'PATROL_MOVE': special = true; checkpoints.push(pos(c.position)); steps.push({ t: 'patrol', p: pos(c.position) }); break;
      case 'WAIT_FOR_SECONDS': special = true; steps.push({ t: 'wait', s: c.time }); break;
      case 'DISAPPEAR': special = true; steps.push({ t: 'disappear' }); break;
      case 'APPEAR_AT_POS': special = true; steps.push({ t: 'appear', p: pos(c.position) }); break;
      case 'WAIT_CURRENT_FRAGMENT_TIME': case 'WAIT_CURRENT_WAVE_TIME': special = true; steps.push({ t: 'wait', s: c.time, until: c.type }); break;
      default: special = true; steps.push({ t: String(c.type).toLowerCase(), p: pos(c.position), s: c.time }); warn(`unknown checkpoint type ${c.type}`);
    }
  }
  const out = { motion: r.motionMode, start: pos(r.startPosition), end: pos(r.endPosition), checkpoints };
  if (special) out.steps = steps;
  const rr = r.spawnRandomRange;
  if (rr && (rr.x || rr.y)) out.spawnRandom = [cleanNum(rr.x), cleanNum(rr.y)];
  if (r.allowDiagonalMove === false) out.allowDiagonal = false;
  return out;
}

/** Expand sequential phases/fragments of actions into absolute-time spawn entries. */
function expandActions(groups, slots, bossKeys, label) {
  const spawns = [];
  let cursor = 0;
  for (const g of groups) {
    const start = cursor + (g.preDelay || 0);
    let end = start;
    for (const a of g.actions || []) {
      const time = cleanNum(start + (a.preDelay || 0));
      const count = a.count ?? 1;
      const interval = cleanNum(a.interval || 0);
      const e = { time, key: a.key, count, interval, routeIndex: a.routeIndex ?? 0 };
      if (a.actionType !== 'SPAWN') e.action = a.actionType;
      const slot = slots[a.key];
      if (slot) e.slot = slot;
      if (bossKeys.has(a.key)) e.tag = 'boss';
      else if (a.isUnharmfulAndAlwaysCountAsKilled || a.randomSpawnGroupKey) e.tag = 'part';
      if (a.hiddenGroup) { e.hidden = true; e.hiddenGroup = a.hiddenGroup; }
      if (a.randomSpawnGroupKey) { e.group = a.randomSpawnGroupKey; e.pack = a.randomSpawnGroupPackKey; e.weight = a.weight; }
      if (a.isUnharmfulAndAlwaysCountAsKilled) e.unharmful = true;
      // the client's route preview before the action's first unit (Scheduler._DealAction; docs/rules/render.md 「적 경로 미리보기」)
      if (a.autoPreviewRoute) e.previewRoute = true;
      if (a.randomType && a.randomType !== 'ALWAYS') e.randomType = a.randomType;
      spawns.push(e);
      end = Math.max(end, time + Math.max(0, count - 1) * interval);
    }
    cursor = end;
  }
  if (groups.length > 1) warn(`${label}: multi-fragment timing approximated (next fragment after previous one's last spawn)`);
  return spawns;
}

/** Usage map template id → [{modeId, round, bossId}] from battleDataDict. */
function templateUsage(ctx) {
  const usage = new Map();
  for (const [modeId, rounds] of Object.entries(ctx.act.battleDataDict)) {
    for (const [round, entries] of Object.entries(rounds)) {
      for (const e of entries) {
        const id = templateIdOf(e.levelId);
        if (!usage.has(id)) usage.set(id, []);
        usage.get(id).push({ modeId, round: Number(round), bossId: e.bossId || null });
      }
    }
  }
  return usage;
}

/**
 * A wave template's predefined token (level `predefines.tokenInsts`) → waves.json `devices[]`: where it stands and the
 * unit a branch's ACTIVATE_PREDEFINED switches on (子代 trap_039_dstnta, 盐风主教昆图斯's 断裂生殖 — the only template
 * tokens this season): its character_table name, attributes at its inst level, the talents' blackboards keyed
 * `<talent prefabKey>.<key>` (enemies.json `talents.bb` style: `1.grow_duration`, `1.duration`) and its skill at
 * `mainSkillLvl` (prefab id, blackboard, SP).
 */
function templateDevice(ctx, t, label) {
  const key = t.inst?.characterKey;
  const rec = { key, alias: t.alias || null, pos: pos(t.position), dir: t.direction, hidden: !!t.hidden };
  const ch = ctx.charTable[key];
  if (!ch) { warn(`${label}: device ${key} missing from character_table`); return rec; }
  const ph = Math.max(0, Math.min(phaseIdx(t.inst.phase), (ch.phases?.length || 1) - 1));
  const s = statsFrom(interpolateAttrs(ch, ph, t.inst.level || 1));
  rec.name = ch.name || key;
  if (s) rec.stats = { maxHp: s.maxHp, atk: s.atk, def: s.def, res: s.res, bat: s.bat, aspd: s.aspd, moveSpeed: s.moveSpeed, massLevel: s.massLevel };
  const talent = {};
  for (const tal of ch.talents || []) {
    const c = (tal.candidates || []).at(-1);
    if (!c) continue;
    const { bb } = flattenBB(c.blackboard, `${label} device ${key} talent ${c.prefabKey}`);
    for (const [k, v] of Object.entries(bb)) talent[`${c.prefabKey}.${k}`] = v;
  }
  if (Object.keys(talent).length) rec.talent = talent;
  const sk = ch.skills?.[t.skillIndex ?? 0];
  const skill = sk?.skillId ? buildSkill(ctx, sk.skillId, t.mainSkillLvl || 1, null, `${label} device ${key}`) : null;
  if (skill) {
    rec.skill = { skillId: skill.skillId, prefabId: skill.prefabId, name: skill.name, spType: skill.spType, spCost: skill.spCost,
      initSp: skill.initSp, duration: skill.duration, bb: skill.bb };
  }
  return rec;
}

/**
 * Build data/waves.json: every wave template (normal, boss, hidden, escaped, training) with resolved
 * routes, absolute-time spawn lists, branches, per-template enemy overrides and mode/round usage.
 */
function buildWaves(ctx, enemies) {
  const slots = templateSlots(ctx);
  const usage = templateUsage(ctx);
  const bossEnemy = Object.fromEntries(Object.entries(ctx.ac.bossInfoDict || {}).map(([id, b]) => [id, b.enemyId]));
  const escaped = new Set(['escapedBattleTemplateMapSinglePlayer', 'escapedBattleTemplateMapMultiPlayer']
    .map((k) => ctx.act.constData[k]).filter(Boolean).map(templateIdOf));
  const out = {};
  for (const id of ctx.templateIds) {
    const lv = ctx.levels[id];
    const uses = usage.get(id) || [];
    const bossIds = [...new Set(uses.map((u) => u.bossId).filter(Boolean))];
    const bossKeys = new Set(bossIds.map((b) => bossEnemy[b]).filter(Boolean));
    const groups = [];
    for (const w of lv.waves || []) {
      (w.fragments || []).forEach((f, fi) => groups.push({ preDelay: (fi === 0 ? (w.preDelay || 0) : 0) + (f.preDelay || 0), actions: f.actions }));
    }
    const spawns = expandActions(groups, slots, bossKeys, `template ${id}`);
    const branches = {};
    for (const [name, b] of Object.entries(lv.branches || {})) {
      // Each phase is kept separately (times relative to the phase start); see DATA.md.
      branches[name] = (b.phases || []).map((ph, pi) => expandActions([{ preDelay: ph.preDelay, actions: ph.actions }], slots, bossKeys, `template ${id} branch ${name}#${pi}`));
    }
    const overrides = {};
    for (const r of lv.enemyDbRefs || []) {
      if (!r.overwrittenData) continue;
      const rec = enemyOverrideRecord(definedFields(r.overwrittenData), `template ${id} ${r.id}`);
      // Same rangeRadius contract as enemies.json (MELEE ⇒ 0, official value in rawRangeRadius).
      const way = rec.applyWay || enemies[r.id]?.applyWay;
      if (rec.stats && 'rangeRadius' in rec.stats) {
        rec.stats.rawRangeRadius = rec.stats.rangeRadius;
        rec.stats.rangeRadius = effectiveRangeRadius(way, rec.stats.rangeRadius);
      } else if (rec.applyWay && enemies[r.id]) {
        const eff = effectiveRangeRadius(rec.applyWay, enemies[r.id].stats.rawRangeRadius);
        if (eff !== enemies[r.id].stats.rangeRadius) rec.stats = { ...(rec.stats || {}), rangeRadius: eff };
      }
      if (Object.keys(rec).length) overrides[r.id] = rec;
    }
    const devices = (lv.predefines?.tokenInsts || []).map((t) => templateDevice(ctx, t, `template ${id}`));
    const o = lv.options || {};
    let kind = 'normal';
    if (escaped.has(id)) kind = 'escaped';
    else if (/_tr\d+$/.test(id)) kind = 'training';
    else if (/_h08_/.test(id)) kind = 'hidden';
    else if (bossIds.length) kind = 'boss';
    const slotCounts = {};
    let total = 0;
    for (const sp of spawns) {
      if (sp.action) continue;
      if (sp.slot) slotCounts[sp.slot] = (slotCounts[sp.slot] || 0) + sp.count;
      if (!sp.unharmful) total += sp.count;
    }
    out[id] = {
      id, kind, solo: /_s$/.test(id), bossId: bossIds.length === 1 ? bossIds[0] : bossIds.length ? bossIds : null,
      maxPlayTime: o.maxPlayTime ?? null,
      dp: { init: o.initialCost ?? 10, perSec: o.costIncreaseTime ? cleanNum(1 / o.costIncreaseTime) : 1, max: o.maxCost ?? 99 },
      characterLimit: o.characterLimit ?? 8, moveMultiplier: o.moveMultiplier ?? 0.5,
      bgm: lv.bgmEvent || null,
      routes: (lv.routes || []).map(resolveRoute),
      extraRoutes: (lv.extraRoutes || []).map(resolveRoute),
      spawns, branches, overrides, devices,
      totalCount: total, slotCounts,
      usedBy: uses.sort((a, b) => naturalCmp(a.modeId, b.modeId) || a.round - b.round),
    };
    for (const sp of spawns) {
      if (sp.action) continue;
      if (!out[id].routes[sp.routeIndex]) warn(`template ${id}: spawn ${sp.key} uses missing route ${sp.routeIndex}`);
      if (!enemies[sp.key]) warn(`template ${id}: spawn key ${sp.key} not in enemies`);
    }
    for (const [bn, phases] of Object.entries(branches)) for (const sp of phases.flat()) {
      if (sp.action) continue;
      if (!enemies[sp.key]) warn(`template ${id}: branch ${bn} key ${sp.key} not in enemies`);
      if (!out[id].extraRoutes[sp.routeIndex]) warn(`template ${id}: branch ${bn} uses missing extraRoute ${sp.routeIndex}`);
    }
  }
  return out;
}

// ===== stages ===================================================================================

/** Glyph legend of stage rows (documented in DATA.md). */
const TILE_LEGEND = {
  '#': { tileKey: 'tile_forbidden', desc: '禁区：不可部署，地面不可通行（飞行可越过）' },
  X: { tileKey: 'tile_forbidden', desc: '硬分隔（第6/13行）：任何单位不可通行' },
  r: { tileKey: 'tile_road', desc: '道路：近战/远程均可部署，地面可通行' },
  R: { tileKey: 'tile_road', desc: '道路（不可部署）' },
  f: { tileKey: 'tile_floor', desc: '地板：不可部署，地面可通行（第9列通道/敌人预览区）' },
  p: { tileKey: 'tile_floor', desc: '地板（预览区 previewNotAlloed）' },
  h: { tileKey: 'tile_wall', desc: '高台：仅远程可部署，地面不可通行' },
  b: { tileKey: 'tile_fence_bound', desc: '围栏低地：可部署，地面敌人不可通行' },
  a: { tileKey: 'tile_achand', desc: '整备区格（isValidHand；规程：每个 tile_achand）' },
  A: { tileKey: 'tile_achand', desc: '临时整备区/非整备手牌格（规程：tile_acbag）' },
  S: { tileKey: 'tile_start', desc: '敌人出生点（红门）' },
  E: { tileKey: 'tile_end', desc: '保护目标（蓝门）' },
  I: { tileKey: 'tile_telin', desc: '传送入口（敌人消失）' },
  O: { tileKey: 'tile_telout', desc: '传送出口/领袖区出生点' },
  m: { tileKey: 'tile_mire', special: 'mire', desc: '沼泽：停留叠加减速减攻速' },
  g: { tileKey: 'tile_smog', special: 'smog', desc: '排气格栅：其上干员不会成为敌方远程攻击目标' },
  d: { tileKey: 'tile_deepsea', special: 'deepsea', desc: '深水区：不可部署（拒绝部署），敌人持续受伤、减速、减攻速' },
  i: { tileKey: 'tile_infection', special: 'infection', desc: '活性源石：单位受持续真实伤害，攻击力与攻速提升' },
  u: { tileKey: 'tile_speedup', special: 'speedup', desc: '规程：加速地块（地面单位：我方攻击速度+attack_speed，敌人移动速度×move_speed）' },
  G: { tileKey: 'tile_duel_grassland', special: 'grassland', desc: '规程：草地（地面单位隐匿；敌人被阻挡时不隐匿）' },
};

/** Map an official tile object to a legend glyph. */
function tileGlyph(t, bagHand = false) {
  const bbKeys = new Set((t.blackboard || []).map((b) => b.key));
  switch (t.tileKey) {
    case 'tile_forbidden': return t.passableMask === 'NONE' ? 'X' : '#';
    case 'tile_road': return t.buildableType === 'NONE' ? 'R' : 'r';
    case 'tile_floor': return bbKeys.has('previewNotAlloed') ? 'p' : 'f';
    case 'tile_wall': return 'h';
    case 'tile_fence_bound': case 'tile_fence': return 'b';
    // 规程 marks no tile isValidHand: its hand is tile_achand, its 临时整备区 tile_acbag
    case 'tile_achand': return bagHand || bbKeys.has('isValidHand') ? 'a' : 'A';
    case 'tile_acbag': return 'A';
    case 'tile_speedup': return 'u';
    case 'tile_duel_grassland': return 'G';
    case 'tile_start': return 'S';
    case 'tile_end': return 'E';
    case 'tile_telin': return 'I';
    case 'tile_telout': return 'O';
    case 'tile_mire': return 'm';
    case 'tile_smog': return 'g';
    case 'tile_deepsea': return 'd';
    case 'tile_infection': return 'i';
    default: return '?';
  }
}

/**
 * Official ground route (research 08 §3.4, the same code the sim runs: server/sim/grid.js flow field — 4-direction
 * SPFA from the goal, crates cost 1000, Bresenham line-of-sight smoothing) as the tiles an enemy crosses, start and goal
 * included. The whole 19×21 map is walkable like in the client.
 * @param {object} stage { rows, legend }
 * @param {Array<{pos:number[], role:string}>} devices active devices to apply (crates = cost 1000, platforms/mounds = blocked)
 */
function officialPath(stage, devices, start, end) {
  const g = new Grid(stage, { r0: 0, r1: 18, c0: 0, c1: 20 });
  for (const d of devices) {
    if (!d.pos) continue;
    if (d.role === 'crate') g.setObstacle(d.pos[0], d.pos[1], true, 'crate');
    else g.setObstacle(d.pos[0], d.pos[1], true);
  }
  return g.findPath(start[0], start[1], end[0], end[1]);
}

/** Gameplay role of known stage devices. */
const DEVICE_ROLES = {
  trap_1105_accrate: 'crate', trap_1106_achplat: 'platform', trap_032_mound: 'mound', trap_013_blower: 'blower',
  trap_098_mire: 'mireController', trap_042_tidectrl: 'tideController', trap_1104_aclasert: 'turret',
  trap_1112_acblzd: 'coldWind', trap_036_storm: 'sandstorm', trap_040_canoe: 'waterPlatform',
  trap_1107_acblock: 'sealedFloor', trap_218_fttree: 'bush', trap_039_dstnta: 'bossSpawn',
};
/** Roles that block ground movement while active ([ASSUMED] for platform/mound). */
const BLOCKING_ROLES = new Set(['crate', 'platform', 'mound']);

/**
 * The deploy type the game applies to a level tile: its buildableType, except tiles whose mechanism refuses deployment
 * (server/sim/grid.js DEPLOY_REFUSED_TILES — 深水区 tile_deepsea: PRTS 深水区 地形信息 "地形机制：拒绝部署（待补充）";
 * player report after 0.1.0: operators could be placed in 战场#08's pool), which are NONE. The stages.json legend's
 * `buildable` is this value; `buildableType` keeps the level's own where they differ.
 */
const effectiveBuildable = (t) => (DEPLOY_REFUSED_TILES.has(t.tileKey) ? 'NONE' : t.buildableType);

/**
 * Is a predefined device active at match start? Exactly the non-hidden ones: the 下半 act1 m02 has all its crates
 * and platforms hidden and starts with none (research 08 §3.3: level file + the PRTS 下半 screenshot); hidden devices
 * are switched on by effects (auto_chess_change_map) only.
 */
function deviceActiveAtStart(stageId, d) { // eslint-disable-line no-unused-vars
  return !d.hidden;
}

/**
 * Rotate a facing-right range grid [[dRow,dCol]…] to a direction (row 0 = bottom, so UP = +row):
 * RIGHT (dr,dc) · UP (dc,−dr) · LEFT (−dr,−dc) · DOWN (−dc,dr). Unknown directions keep RIGHT.
 * @param {number[][]} grid
 * @param {string} dir RIGHT / UP / LEFT / DOWN
 * @returns {number[][]}
 */
function rotateGrid(grid, dir) {
  const rot = { UP: ([r, c]) => [c, -r], LEFT: ([r, c]) => [-r, -c], DOWN: ([r, c]) => [-c, r] }[dir];
  // `x + 0` normalizes -0 so the JSON output stays clean.
  return grid.map((p) => (rot ? rot(p) : p).map((x) => x + 0));
}

/** Device (predefined token/trap) record with stats and skill blackboard at its instance level. */
function deviceRecord(ctx, t) {
  const key = t.inst?.characterKey;
  const ch = ctx.charTable[key];
  const rec = { key, name: ch?.name || key, alias: t.alias || null, pos: pos(t.position), dir: t.direction, hidden: !!t.hidden, role: DEVICE_ROLES[key] || null };
  if (!rec.role) warn(`device ${key} has no known role`);
  if (!ch) { warn(`device ${key} missing from character_table`); return rec; }
  const phase = phaseIdx(t.inst.phase);
  const level = t.inst.level || 1;
  const ph = Math.max(0, Math.min(phase, (ch.phases?.length || 1) - 1));
  const attrs = interpolateAttrs(ch, ph, level);
  const s = statsFrom(attrs);
  rec.stats = s ? { maxHp: s.maxHp, atk: s.atk, def: s.def, res: s.res, bat: s.bat, aspd: s.aspd, blockCnt: s.blockCnt } : null;
  rec.rangeGrid = rangeGrid(ctx, ch.phases?.[ph]?.rangeId);
  // Absolute tiles covered by the (direction-rotated) range, clipped to the 19×21 grid.
  rec.rangeTiles = rec.rangeGrid && rec.pos
    ? rotateGrid(rec.rangeGrid, rec.dir).map(([dr, dc]) => [rec.pos[0] + dr, rec.pos[1] + dc])
      .filter(([r, c]) => r >= 0 && r < 19 && c >= 0 && c < 21)
    : null;
  const sk = ch.skills?.[t.skillIndex ?? 0];
  const skill = sk?.skillId ? buildSkill(ctx, sk.skillId, t.mainSkillLvl || 1, null, `device ${key}`) : null;
  rec.skill = skill ? { skillId: skill.skillId, name: skill.name, level: skill.level, desc: skill.desc, descRaw: skill.descRaw, bb: skill.bb, bbStr: skill.bbStr } : null;
  const dp = textPair(ch.description);
  rec.desc = dp.desc;
  return rec;
}

/**
 * Player-facing stage name. Neither activity_table nor the client names a battlefield (the client's stage-info view
 * shows only the map preview), so the names are PRTS's, kept in research 05 `stages[id].name` — every season's
 * stages, 规程's included. A note can leave a bracketed English annotation in a name ('战场#01 (upper half #01)'); that
 * text would reach the briefing BATTLEFIELD row. Drop any bracketed segment containing Latin letters, normalize
 * whitespace and report the change. A stage research 05 does not name stops the build (a new season's stages showed
 * their ids on the briefing card until 2026-11-15): add its PRTS name there. --no-research falls back to the id.
 * @param {string} stageId
 * @param {unknown} raw research name
 * @returns {string}
 */
function stageDisplayName(stageId, raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    if (OPTS.noResearch) return stageId;
    throw new Error(`stage ${stageId}: no name in docs/research/05-maps.json stages — add the battlefield's PRTS name (卫戍协议 战场一览: number + special terrain or device)`);
  }
  const name = raw.replace(/\s*[(（][^()（）]*[A-Za-z][^()（）]*[)）]/g, '').replace(/\s+/g, ' ').trim();
  if (!name) { warn(`stage ${stageId}: research name "${raw}" is only an annotation; using the stage id`); return stageId; }
  if (name !== raw.trim()) warn(`stage ${stageId}: dropped research annotation from name "${raw}" -> "${name}"`);
  return name;
}

/**
 * The escaped levels' map names: the tables and PRTS name neither map, so the label is the remake's own [ASSUMED] (PRTS
 * 卫戍协议/帮助 §联防阶段 calls the joined field "一处阵地"); no screen shows it.
 */
const UNITE_STAGE_NAMES = { 1: '联防阵地（1名玩家）', 2: '联防阵地（2名玩家）' };

/**
 * Build data/stages.json: 19×21 terrain grids (row 0 = bottom), legend, devices, special terrain
 * parameters, deployable tiles and helper ground paths — the 11 battle stages of stageDatasDict, then the maps of the
 * two escaped levels: act2autochess constData escapedBattleTemplateMapSinglePlayer / MultiPlayer name the level of the
 * 联防 wave (level_act1autochess_escaped_single / _multi), whose own map is an empty road — the placeholder grid every
 * wave template level carries (01…07, h01…h08, tr…: tile for tile the same). They carry `kind: 'unite'`
 * and `helpers` (1 / 2), weight 0, no modes, and are never a match stage. 0.2.0 fought the 联防 battle on them (GitHub
 * #41); since 0.2.1 the 联防 field is the round's battlefield again (server/match/unite.js, the owner's decision of
 * 2026-10-07), and the two records stay as the official level data — sim tests use them as a plain two-halves road.
 */
function buildStages(ctx, modesById) {
  const researchStages = ctx.research.maps?.stages || {};
  const out = {};
  const unite = [['escapedBattleTemplateMapSinglePlayer', 1], ['escapedBattleTemplateMapMultiPlayer', 2]]
    .filter(([k]) => ctx.act.constData[k]).map(([k, helpers]) => ({ stageId: templateIdOf(ctx.act.constData[k]), helpers }));
  for (const { stageId, helpers } of [...ctx.stageIds.map((id) => ({ stageId: id, helpers: 0 })), ...unite]) {
    const sd = helpers ? null : ctx.act.stageDatasDict[stageId];
    const lv = ctx.levels[stageId];
    const map = lv.mapData?.map || [];
    const tiles = lv.mapData?.tiles || [];
    const H = map.length, W = map[0]?.length || 0;
    if (H !== 19 || W !== 21) warn(`stage ${stageId}: unexpected size ${H}x${W}`);
    const tileAt = (r, c) => tiles[map[H - 1 - r]?.[c]];
    const bagHand = tiles.some((t) => t.tileKey === 'tile_acbag');
    const rows = [];
    const glyphTiles = {};
    for (let r = 0; r < H; r++) {
      let line = '';
      for (let c = 0; c < W; c++) {
        const t = tileAt(r, c);
        const g = t ? tileGlyph(t, bagHand) : '?';
        if (g === '?') warn(`stage ${stageId}: unknown tile at (${r},${c}) ${t?.tileKey}`);
        line += g;
        if (t && !glyphTiles[g]) {
          const { bb } = flattenBB(t.blackboard);
          const buildable = effectiveBuildable(t);
          glyphTiles[g] = {
            tileKey: t.tileKey, height: t.heightType === 'HIGHLAND' ? 'HIGH' : 'LOW', buildable,
            ...(buildable !== t.buildableType ? { buildableType: t.buildableType } : {}),
            passable: t.passableMask, groundPassable: t.passableMask === 'ALL', flyPassable: t.passableMask !== 'NONE',
            special: TILE_LEGEND[g]?.special || null, bb,
          };
        }
      }
      rows.push(line);
    }
    const devices = (lv.predefines?.tokenInsts || []).map((t) => deviceRecord(ctx, t));
    for (const d of devices) d.active = deviceActiveAtStart(stageId, d);
    const mapChars = (lv.predefines?.characterInsts || []).map((c) => ({
      key: c.inst?.characterKey, alias: c.alias || null, pos: pos(c.position), dir: c.direction, hidden: !!c.hidden,
    }));
    // Special terrain parameters.
    const special = {};
    const byKey = (k) => devices.find((d) => d.key === k);
    if (rows.some((l) => l.includes('m'))) {
      const d = byKey('trap_098_mire');
      // PRTS 沼泽控制: a unit in the mire triggers 【陷入沼泽】 "每秒…一次" (the device skill's charge time, spData
      // maxChargeTime 1) and an enemy "若其重量大于等于3，改为获得2层" — the skill's `value` (3) is that 重量, not an
      // interval; "上述减益于单位不再位于沼泽之中时解除" (clearedOnLeave)
      const mireSk = d?.skill ? ctx.skillTable[d.skill.skillId]?.levels?.[Math.max(0, (d.skill.level || 1) - 1)] : null;
      const charge = mireSk?.spData?.maxChargeTime;
      special.mire = { source: d ? d.key : null, intervalSec: typeof charge === 'number' && charge > 0 ? charge : 1, aspdPerStack: d?.skill?.bb?.attack_speed ?? -0.05, moveMulPerStack: d?.skill?.bb?.move_speed ?? -0.05, maxStacks: d?.skill?.bb?.max_stack_cnt ?? 10, heavyWeight: d?.skill?.bb?.value ?? 3, clearedOnLeave: true };
    }
    if (rows.some((l) => l.includes('d'))) {
      const d = byKey('trap_042_tidectrl');
      special.deepsea = { source: d ? d.key : null, skillId: d?.skill?.skillId || null, bb: d?.skill?.bb || {} };
    }
    if (rows.some((l) => l.includes('i'))) special.infection = { bb: glyphTiles.i?.bb || {} };
    if (rows.some((l) => l.includes('g'))) special.smog = { rule: 'operatorsNotTargetableByEnemyRanged' };
    // 规程's tiles (CN client [uc]tiles prefabs: BuffTile, WALK units of both sides, cleared on leaving): tile_speedup's
    // template reads the tile blackboard (attack_speed / move_speed), tile_duel_grassland gives INVISIBLE
    if (rows.some((l) => l.includes('u'))) special.speedup = { bb: glyphTiles.u?.bb || {} };
    if (rows.some((l) => l.includes('G'))) special.grassland = { rule: 'groundUnitsInvisibleEnemiesUnlessBlocked' };
    const blower = byKey('trap_013_blower');
    if (blower) special.blower = { rangeGrid: blower.rangeGrid, bb: blower.skill?.bb || {}, desc: blower.skill?.desc || null };
    const runes = (lv.runes || []).map((r) => ({ key: r.key, ...flattenBB(r.blackboard) }));
    const globalBuffs = (lv.globalBuffs || []).map((g) => ({ key: g.key, ...flattenBB(g.blackboard) }));

    // Deployable tiles at match start (active crates/mounds remove a tile, platforms make it ranged-only, a 特制水上平台
    // makes its 深水区 tile deployable for any unit: "在水上建立可以部署任意单位的平台", sktok_canoe_1).
    const activeBlocking = devices.filter((d) => d.active && BLOCKING_ROLES.has(d.role));
    const blocked = new Set(activeBlocking.map((d) => d.pos.join(',')));
    const platformAt = new Set(activeBlocking.filter((d) => d.role === 'platform').map((d) => d.pos.join(',')));
    const waterPlatformAt = new Set(devices.filter((d) => d.active && d.role === 'waterPlatform').map((d) => d.pos.join(',')));
    const deployIn = (r0, r1, c0, c1) => {
      const melee = [], rangedOnly = [], byDevice = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const t = tileAt(r, c);
        if (!t) continue;
        const k = `${r},${c}`;
        const bt = effectiveBuildable(t);
        const buildable = bt !== 'NONE';
        if (platformAt.has(k)) { rangedOnly.push([r, c]); if (buildable) byDevice.push([r, c]); continue; }
        if (blocked.has(k)) { if (buildable) byDevice.push([r, c]); continue; }
        if (waterPlatformAt.has(k)) { melee.push([r, c]); if (!buildable) byDevice.push([r, c]); continue; }
        if (t.heightType === 'LOWLAND' && (bt === 'ALL' || bt === 'MELEE')) melee.push([r, c]);
        else if (bt === 'RANGED' || (t.heightType === 'HIGHLAND' && bt === 'ALL' && !HAND_TILES.has(t.tileKey))) rangedOnly.push([r, c]);
      }
      return { melee, rangedOnly, changedByDevices: byDevice };
    };

    // Helper ground routes (the official flow field + smoothing, as crossed tiles), without / with the active devices.
    const gridStage = { rows, legend: glyphTiles };
    const pairs = [
      [[9, 10], [9, 2]], [[12, 10], [9, 2]], [[9, 18], [9, 2]], [[12, 18], [9, 2]],
      [[2, 10], [2, 2]], [[5, 10], [2, 2]], [[2, 10], [1, 3]], [[5, 10], [1, 3]],
      [[2, 10], [2, 18]], [[5, 10], [2, 18]], [[2, 10], [1, 17]], [[5, 10], [1, 17]],
    ];
    const groundPaths = {}, groundPathsWithDevices = {};
    for (const [a, b] of pairs) {
      const k = `${a.join(',')}->${b.join(',')}`;
      const passable = (p) => tileAt(p[0], p[1])?.passableMask === 'ALL';
      if (!passable(a) || !passable(b)) continue;
      const p1 = officialPath(gridStage, [], a, b);
      if (p1) groundPaths[k] = p1;
      const p2 = officialPath(gridStage, activeBlocking, a, b);
      if (p2) groundPathsWithDevices[k] = p2;
    }
    const modes = [...(sd?.mode || [])];
    const o = lv.options || {};
    out[stageId] = {
      id: stageId, name: helpers ? UNITE_STAGE_NAMES[helpers] : stageDisplayName(stageId, researchStages[stageId]?.name),
      weight: sd ? sd.weight : 0, active: sd ? sd.weight > 0 : false, ...(helpers ? { kind: 'unite', helpers } : {}),
      modes, size: [H, W], rows, tiles: glyphTiles,
      devices, mapChars, special, runes, globalBuffs,
      deployTiles: { normal: deployIn(9, 12, 2, 10), bossLeft: deployIn(1, 5, 2, 10), bossRight: deployIn(1, 5, 10, 18) },
      groundPaths, groundPathsWithDevices,
      options: { characterLimit: o.characterLimit ?? 8, moveMultiplier: o.moveMultiplier ?? 0.5 },
      config: flattenBB(o.configBlackBoard).bbStr,
    };
    for (const m of modes) if (modesById && !modesById[m]) warn(`stage ${stageId}: unknown mode ${m}`);
  }
  return out;
}

// ===== factions (特训敌人) ========================================================================

/**
 * Build data/factions.json: enemy types, the 67 special-enemy entries, template placeholders and the parameters of
 * the official generator (client `RandomEnemyGenerater`, research 08 §2): a 15-slot type schedule per match, one
 * weighted entry per round, per-ACTION replacement counts computed at runtime by server/match/waves.js from
 * enemies.json `attrPower` / `beFactor`.
 */
/**
 * 每日防卫目标 (act2autochess constData dailyMission*): earn `need` 卫戍认证 in a day and the settlement adds `bonus`
 * more, once a day; the day turns over at `resetHour`. The bonus and the hour are only in the rule text
 * (「…即可在结算时领取【卫戍认证】x300的额外奖励。*奖励每日一次，每天04:00重置」), so they are read from it.
 * @param {any} c constData @returns {{name:string, need:number, bonus:number, resetHour:number, rule:string}|null}
 */
function dailyMission(c) {
  if (!c?.dailyMissionParam) return null;
  const rule = stripRich(c.dailyMissionRule || '');
  const awards = [...String(c.dailyMissionRule || '').matchAll(/<@acdm\.award>(\d+)<\/>/g)].map((m) => Number(m[1]));
  const reset = /(\d{1,2}):\d{2}\s*重置/.exec(rule);
  if (awards.length < 2 || !reset) warn('config: dailyMissionRule no longer names the bonus / the reset hour');
  return { name: c.dailyMissionName || null, need: c.dailyMissionParam, bonus: awards[1] ?? 0, resetHour: reset ? Number(reset[1]) : 4, rule };
}

/** enemy_handbook_table `levelInfoList` stat → the enemies.json vocabulary (attackSpeed is the attack interval in s). */
const HANDBOOK_STATS = Object.freeze({
  maxHP: 'maxHp', attack: 'atk', def: 'def', magicRes: 'res', moveSpeed: 'moveSpeed', attackSpeed: 'interval',
  enemyRes: 'elementRes', enemyDamageRes: 'elementDmgRes',
});

/**
 * The enemy handbook's letter grades (enemy_handbook_table `levelInfoList`: ten grades E … SS) → factions.json
 * `handbookLevels`, weakest first: per grade the official [min, max) of each stat (max null: open-ended). `interval`
 * runs the other way (a shorter attack interval is the higher grade). The 敌方图鉴 (screens/sweep.js enemyGrade) grades
 * a stat by the band its value falls in.
 * @returns {{ level: string, [stat: string]: any }[]}
 */
function buildHandbookLevels(ctx) {
  const list = ctx.handbook?.levelInfoList;
  if (!Array.isArray(list) || !list.length) {
    warn('enemy_handbook_table has no levelInfoList: factions.json handbookLevels is empty');
    return [];
  }
  const out = list.map((l) => {
    const rec = { level: l.classLevel };
    for (const [src, key] of Object.entries(HANDBOOK_STATS)) {
      const r = l[src];
      if (!r || !Number.isFinite(r.min) || !Number.isFinite(r.max)) { warn(`enemy_handbook_table level ${l.classLevel}: no ${src} range`); continue; }
      rec[key] = [r.min, r.max < 0 ? null : r.max];
    }
    return rec;
  });
  // the table lists SS first; ascending by the HP band's lower bound
  return out.sort((a, b) => (a.maxHp?.[0] ?? 0) - (b.maxHp?.[0] ?? 0));
}

function buildFactions(ctx, enemies) {
  const { ac, act } = ctx;
  const c = ac.constData;
  const slots = templateSlots(ctx);
  const slotKey = Object.fromEntries(Object.entries(slots).map(([k, s]) => [s, k]));
  const minK = c.minReplacedEnemyCount ?? 1, maxK = c.maxReplacedEnemyCount ?? 5;
  const inactive = new Map();
  for (const m of Object.values(act.modeDataDict)) for (const k of m.inactiveEnemyKey || []) {
    if (!inactive.has(k)) inactive.set(k, []);
    inactive.get(k).push(m.modeId);
  }
  const isFly = (k) => {
    const r = ac.randomEnemyAttributeDict?.[k];
    return r ? !!r.isFlyEnemy : enemies[k]?.stats?.motion === 'FLY';
  };
  const entries = {};
  for (const key of Object.keys(act.specialEnemyInfoDict).sort(naturalCmp)) {
    const e = act.specialEnemyInfoDict[key];
    const all = [e.specialEnemyKey, ...(e.attachedNormalEnemyKeys || []), ...(e.attachedEliteEnemyKeys || [])];
    const fly = isFly(e.specialEnemyKey);
    if (all.some((k) => isFly(k) !== fly)) warn(`faction entry ${key}: mixed movement classes`);
    entries[key] = {
      key: e.specialEnemyKey, type: e.type, weight: e.randomWeight, firstHalf: !!e.isInFirstHalf, fly,
      N: (e.attachedNormalEnemyKeys || []).map((k) => ({ key: k })),
      E: (e.attachedEliteEnemyKeys || []).map((k) => ({ key: k })),
      // modes whose inactiveEnemyKey bans the SPECIAL key (attached keys are never filtered — research 08 §2.2)
      inactiveIn: [...new Set([...(inactive.get(e.specialEnemyKey) || [])])].sort(naturalCmp),
    };
    for (const k of all) if (!enemies[k]) warn(`faction entry ${key}: enemy ${k} missing`);
  }
  const types = {};
  for (const [type, t] of Object.entries(ac.enemyTypeDatas || {})) {
    const r = act.specialEnemyRandomTypeDict?.[type] || {};
    types[type] = {
      type, name: t.name, desc: t.description, icon: t.icon, sortId: t.sortId, typeIdentifier: t.typeIdentifier,
      involveRandom: !!t.involveRandom, count: r.count ?? null, weight: r.weight ?? null,
      pool: [...(act.enemyInfoDict?.[type] || [])],
      entries: Object.keys(entries).filter((k) => entries[k].type === type),
    };
  }
  const fillType = Object.values(types).find((t) => t.typeIdentifier === c.enemyTypeIdentifierToFillRandom)?.type || 'SPECIAL';
  const maxLevelCnt = c.maxLevelCnt ?? 15;
  // placeholder key → { cls: normal/elite/special, fly } (constData.templateEnemy*; T / TF are NOT placeholders: tokens)
  const placeholders = {};
  for (const [cls, flyCode, walkCode] of [['normal', 'NF', 'N'], ['elite', 'EF', 'E'], ['special', 'SF', 'S']]) {
    if (slotKey[walkCode]) placeholders[slotKey[walkCode]] = { slot: walkCode, cls, fly: false };
    if (slotKey[flyCode]) placeholders[slotKey[flyCode]] = { slot: flyCode, cls, fly: true };
  }
  return {
    templateSlots: slotKey,
    types, entries,
    handbookLevels: buildHandbookLevels(ctx),
    generation: {
      source: 'official client RandomEnemyGenerater (research 08 §2, decoded from the client; normative)',
      specialEnemyNum: c.specialEnemyNum ?? 3,
      maxLevelCnt,
      fillType,
      alwaysIncludedType: fillType,
      typeSlots: Object.fromEntries(Object.values(types).filter((t) => t.involveRandom).map((t) => [t.type, t.count ?? 3])),
      trainingTypes: act.constData.trSpecialEnemyTypes || [],
      firstHalfMaxRound: Math.floor(maxLevelCnt / 2),
      minReplacedEnemyCount: minK, maxReplacedEnemyCount: maxK,
      minActionIntervalRatio: 0.05,
      beFactors: { hp: c.enemyMaxHpFactor ?? 1, atk: c.enemyAtkFactor ?? 5, def: c.enemyDefFactor ?? 3, res: c.enemyMagicResistanceFactor ?? 3 },
      placeholders,
      powerFormula: 'P(k) = f32(f32(f32(atk*5) + f32(maxHp*1)) + f32(def*3)) + f32(3*res) — enemy_database level stats (enemies.json attrPower)',
      countFormula: "n' = clamp(roundHalfEven(f32(f32(f32(n*P(tpl))/f(tpl)) / f32(P(new)/f(new)))), minReplacedEnemyCount, maxReplacedEnemyCount); f = beFactor",
      timingFormula: "unit i at preDelay + i*max(n*interval/n', minActionIntervalRatio*n*interval)",
      notes: [
        'Match start: shuffle the involveRandom types, keep specialEnemyNum (3); each owns `count` (3) of the maxLevelCnt (15) round slots, fillType (SPECIAL) the rest; the slots are shuffled (slot r = type of round r).',
        'Per round r: half = r <= firstHalfMaxRound; weighted (weight) pick among the entries of that type and half whose SPECIAL key is not in the mode inactiveEnemyKeys; normal/elite = a random attached key (never filtered).',
        'Per SPAWN action whose key is a placeholder: skipped when isFly(new key) != placeholder fly flag (not spawned, not previewed); else the count follows countFormula and the units keep the action window (timingFormula). Literal keys and T/TF tokens are kept.',
        'Leader / hidden rounds use slot 14 / 15 (solo 标准: 9) with the same rule, so only the E or the EF escorts spawn.',
        'enemy_9012_acloon (炎佑) is never an enemy.',
      ],
    },
  };
}

// ===== bosses ===================================================================================

/** Build data/bosses.json: the 10 leaders with HP pools, weights, templates per mode and escorts. */
function buildBosses(ctx, enemies, waves) {
  const { ac, act } = ctx;
  const out = {};
  const usage = templateUsage(ctx);
  for (const bossId of Object.keys(act.bossInfoDict).sort(naturalCmp)) {
    const b = act.bossInfoDict[bossId];
    const g = ac.bossInfoDict?.[bossId] || {};
    const enemyKey = g.enemyId;
    const e = enemies[enemyKey];
    if (!e) warn(`boss ${bossId}: enemy ${enemyKey} missing`);
    const templates = {};
    for (const [tid, uses] of usage) for (const u of uses) if (u.bossId === bossId) {
      templates[u.modeId] = { round: u.round, template: tid };
    }
    const escortsByTemplate = {};
    const parts = new Set();
    for (const tid of new Set(Object.values(templates).map((t) => t.template))) {
      const w = waves[tid];
      if (!w) continue;
      const list = {};
      for (const sp of w.spawns) {
        if (sp.action || sp.tag === 'boss') continue;
        if (sp.tag === 'part') { parts.add(sp.key); continue; }
        const k = sp.slot ? `${sp.slot}:${sp.key}` : sp.key;
        list[k] = (list[k] || 0) + sp.count;
      }
      escortsByTemplate[tid] = Object.entries(list).map(([k, count]) => {
        const [slot, key] = k.includes(':') ? k.split(':') : [null, k];
        return { key, slot, count };
      });
    }
    out[bossId] = {
      bossId, enemyKey, handbookId: g.handbookEnemyId || enemyKey, name: e?.name || enemyKey, sortId: b.sortId,
      weight: b.weight, hidden: !!b.isHidingBoss,
      bloodPoint: { FUNNY: b.bloodPoint, NORMAL: b.bloodPointNormal, HARD: b.bloodPointHard, ABYSS: b.bloodPointAbyss },
      // 规程: one value per mode (bossInfoDict bloodDataDict) in place of one per difficulty
      ...(b.bloodDataDict ? { bloodByMode: Object.fromEntries(Object.entries(b.bloodDataDict).sort((x, y) => naturalCmp(x[0], y[0]))) } : {}),
      lpr: e?.stats?.lpr ?? null, templates, escortsByTemplate, parts: [...parts].sort(naturalCmp),
      abilities: e?.abilities?.map((a) => a.text) || [],
    };
  }
  return out;
}

// ===== choices (机变) =============================================================================

const ROMAN = { I: 1, II: 2, III: 3 };

/**
 * Why a bounty card is NOT offered by the 机变 悬赏决策 draft (null = it is), user playtest #6 item 4. The draft's card
 * pools are server-side (effectChoiceInfoDict has no event → effect list), so the pool follows the curated PRTS table
 * 卫戍协议：盟约 下半/PRTS盟约记录 §机变阶段 "机变阶段·敌人轮选" (it reorders and hides entries of the data on purpose):
 *   'perfect'  战术特训 (perfect payout, incl. 无人机护障·P / 法术大师A2·多轮战术特训): listed under
 *              "※以下悬赏任务仅由法术教鞭生成"
 *   'hidden'   鸭爵 / 高普尼克 / 流泪小子 / 圆仔·悬赏 (enemyeffect_5..8): commented out of the table (the 鸭爵 strategy
 *              “神秘顾客” swaps those enemies into the waves instead)
 *   'unseen'   kill bounties no official draft showed (66 screenshots of 22 official matches, player feedback after
 *              0.1.0 report #2 — see BOUNTY_INITIAL_SETS below): the 7 multi-round cards ("之后 / 后续的每场作战": 山海众头目·
 *              多轮悬赏, 多轮悬赏·假想敌 ×6), the pre-series cards enemyeffect_3_* and the boss bounties of no seen R9 group
 *              (凋零骑士, “遗弃者”, 锏, 扎罗, 迷路的巨像) [ASSUMED: not offered]
 * The rest is drafted, by the kind of draft it belongs to (`draftPool`, bountyDraftPool): the "接下来两场作战" cards at R3,
 * the boss bounties and 源石虫·特训 ("但不获得资金") at R9, the faction / 特异 "下场战斗" cards at R11. A multi-round card's
 * official text carries the red "每场" (`multiRound`, `rounds` 99 kept as the data has them; the server makes such a
 * card last MULTI_ROUND_BOUNTY_BATTLES = 2 battles and rewrites its text — server/match/choices.js bountyBattles /
 * bountyText, the user's call after playtest #6; 教鞭's 法术大师A2·多轮战术特训 is one). The 战术特训 cards are what the
 * 教鞭 Art offers (PRTS 法术 教鞭 "于3个战术特训的悬赏任务中选择一项"; server/sim/content/items/meta.js); nothing in
 * act2 offers the 鸭爵 set.
 */
const HIDDEN_BOUNTY_IDS = new Set(['enemyeffect_5', 'enemyeffect_6', 'enemyeffect_7', 'enemyeffect_8']);
function bountyDraftExclusion(e, main) {
  if (main.payout !== 'kill') return 'perfect';
  if (HIDDEN_BOUNTY_IDS.has(e.effectId)) return 'hidden';
  return null;
}

/**
 * The official 悬赏决策 drafts (player feedback after 0.1.0, report #2: "本来应该后期出的悬赏的怪物在前期的悬赏就出现了，导致选了
 * 打不过"), read from 66 screenshots of 22 official co-op 绝境 / 终极 matches at the start of rounds 3, 9 and 11 (collected
 * by the user, 2026-10-03, from videos of this season recorded at the end of March 2026; the readings are
 * test/fixtures/official-bounty-drafts.json, `seen` below = its match numbers). Every card's title, enemy and coin value is
 * an act2autochess (下半) effect. A card's enemy is fixed by its effect (blackboard `enemy_id`); the title only names the
 * category and tier, so 悬赏·损伤I is 底海滑动者 in enemyeffect_12_4 and 临时收音师 in enemyeffect_18_1. The players pick
 * in turn from ONE shared draft (a taken card stays greyed with the taker's avatar: match 17 R3, match 21 R9).
 *
 * One rule covers all three rounds: the draft's event is a fixed list of cards, and the draft shows 6 different cards of
 * it (positions shuffled): R3 lists hold 6 cards (all shown), R9 lists up to 9 (every R9 group seen in 3 or more drafts —
 * and only those — shows exactly 9 different cards: 鼠王 group, 喷气人 group, 复仇者 group), R11 lists 7 (the three R11 groups
 * seen in 2–4 drafts show exactly 7: matches 1 / 6 / 21 / 22 each leave out a different one of the same 7 cards). Within a
 * list a card is drawn with weight 1 + the drafts of its group it appeared in (`hits`; a card no draft of the group has
 * shown yet, 1) [ASSUMED: smooths the official counts — in the 鼠王 group 鼠王 showed in 4 of 14, 杰斯顿 in 12].
 *   initial  R3 (enemy_initial_1..10): six "接下来两场作战" cards, always 3 × I (1 coin) + 2 × II + 1 × III (22 of 22).
 *            9 of the 10 fixed sets seen (BOUNTY_INITIAL_SETS: 18 ×5, 19 / the 10_5 set / the 17_6 set ×3, 17 / two more
 *            ×2, two ×1 — consistent with a uniform pick among 10). Hand-made: a set can hold two series-20 cards (12) or
 *            one card of series 17 (13 / 19 / 21). The unseen 10th set: BOUNTY_INITIAL_RULE [ASSUMED] — its III is one of
 *            the only two two-battle cards no draft showed (法术大师A1 10_6, 鼎沸 20_6).
 *   boss     R9 (bossInitial_1..6): the boss bounties "X·悬赏" and 源石虫·特训 (16 of 22), all "下场作战". Six groups, one
 *            per event (BOUNTY_BOSS_GROUPS); 庞贝 and 鼠王 are never in one draft. The 鼠王 group (W 碎骨 弑君者 大鲍勃 源石虫
 *            鼠王 杰斯顿 “自在” 陷落雪祀) came in 14 of the 22 matches, so the event is not picked uniformly: something of
 *            the match decides — every match on the dark grey board (7) had it (if independent of the board, 2 %); the
 *            leader, the map or the difficulty (终极 opened 2026-03-27) are candidates. Picked by the matches each group
 *            came in [ASSUMED]. A named boss does not always come with its partners (杰斯顿 alone in 12 / 15 / 21, 复仇者
 *            and 萨卡兹百夫长 without 邪魔的利刃 in 20). The groups hold 9, 9, 9, 9, 8 and 6 cards: the three seen in 3 or
 *            more drafts show 9 (the 庞贝 / 鼠王 base of 6 + three named bosses); the three single-draft groups are
 *            completed only with the base cards they lack [ASSUMED] — 腐败骑士 group 9, 泥岩 + 澪 group 8, and match 4
 *            (the base alone) 6, so that one always shows the same six. Match 4 may instead be a draft of another group
 *            (most likely the 泥岩 group: 1 in 28 for a uniform 6 of 8), leaving one event unseen — open.
 *            凋零骑士, “遗弃者”, 锏, 扎罗 and 迷路的巨像 never appeared: not offered [ASSUMED].
 *   hunter   R11 (R11 is a 悬赏决策 in 14 of the 22 matches): six "下场战斗" cards, the faction _7 / _8 cards and series 16
 *            (16_1..8 the 特异III giants), at most one per faction series 10–15 (14 of 14). 7 groups seen
 *            (BOUNTY_HUNTER_GROUPS): three complete (7 cards), four with 6 cards seen and a 7th drawn by the rule (`open`;
 *            the group of match 15 shows no giant, so its 7th is one). The list is one of these 7, uniform [ASSUMED],
 *            because that invents no list. The data does not say which of the 15 events bounty_hunter_1..15 R11 fires:
 *            in effectChoiceInfoDict bounty_hunter_1..7 sit after bossInitial_1..6, and bounty_hunter_8..15 sit after
 *            artifact_paid_4 / 5 and right before hardbuff_select (the tactic event only 绝境 / 终极 have, the modes
 *            with an R11) — read by blocks, as SHOP_DRAFT reads the shop events, R11 would be the 8 events 8..15. The
 *            sample fits 7, 8 or 9 events about equally (14 drafts showing exactly 7 lists: 7 events 37 %, 8 events
 *            45 %, 9 events 39 %) but not 15 (7 lists or fewer 6 %); the counts 4 / 2 / 3 / 1 / 2 / 1 / 1 fit a uniform
 *            pick (χ² = 4, 6 df). With 8 events, a list nobody has seen would come in about 1 R11 bounty draft in 8 —
 *            open. No list is built from nothing: the R11 cards no draft showed (12_8 异光体孽生者, 16_2 “越长尘”, 16_6
 *            高准度伦蒂尼姆城防自行炮) come only as an `open` card (BOUNTY_HUNTER_RULE: one giant for a list without one,
 *            else tier I / II cards of the free faction series, at most two of 16_9..12), in about 1 R11 bounty draft in
 *            15.
 * In none of the 59 bounty drafts: the 7 multi-round cards (山海众头目·多轮悬赏, 多轮悬赏·假想敌 ×6), the pre-series cards
 * enemyeffect_3_* (法术大师A2·悬赏 …), 战术特训 (法术教鞭 only) and the 鸭爵 set; no card twice in one draft.
 */
const EE = (s) => `enemyeffect_${s}`;
const seriesIds = (n) => [1, 2, 3, 4, 5, 6].map((i) => EE(`${n}_${i}`));
/** The R3 sets seen. */
const BOUNTY_INITIAL_SETS = [
  { cards: seriesIds(18), seen: [1, 3, 5, 9, 17] },
  { cards: seriesIds(19), seen: [2, 15, 22] },
  { cards: seriesIds(17), seen: [7, 14] },
  { cards: ['10_5', '11_4', '12_5', '13_6', '15_4', '20_3'].map(EE), seen: [4, 10, 16] },
  { cards: ['10_4', '11_5', '12_6', '14_4', '15_5', '20_2'].map(EE), seen: [6, 18] },
  { cards: ['10_4', '11_5', '12_4', '14_6', '15_4', '20_4'].map(EE), seen: [8] },
  { cards: ['10_4', '11_6', '12_4', '13_4', '14_5', '15_5'].map(EE), seen: [11, 20] },
  { cards: ['10_4', '11_4', '12_5', '15_6', '20_1', '20_5'].map(EE), seen: [12] },
  { cards: ['11_4', '12_4', '13_5', '14_4', '15_5', '17_6'].map(EE), seen: [13, 19, 21] },
];
/**
 * The unseen R3 set [ASSUMED]: six two-battle cards of these series with the seen sets' tiers, at most `perSeries` of one
 * series (the 20_1 / 20_5 set has two), its tier-III card one of `prefer` (the two-battle cards no draft showed).
 */
const BOUNTY_INITIAL_RULE = { series: [10, 11, 12, 13, 14, 15, 20], tiers: [1, 1, 1, 2, 2, 3], perSeries: 2, prefer: ['10_6', '20_6'].map(EE) };
// R9 cards by name (enemyeffect_b_N, 源石虫·特训 enemyeffect_5_1)
const R9 = {
  W: 'b_10', 碎骨: 'b_1', 弑君者: 'b_3', 大鲍勃: 'b_13', 庞贝: 'b_12', 鼠王: 'b_11', 源石虫: '5_1', 杰斯顿: 'b_9', 自在: 'b_14', 陷落雪祀: 'b_23',
  喷气人: 'b_8', 纠缠藤蔓: 'b_24', 澪: 'b_19', 邪魔的利刃: 'b_22', 复仇者: 'b_21', 萨卡兹百夫长: 'b_2', 腐败骑士: 'b_5', 墓碑: 'b_17', 巨大的丑东西: 'b_20', 泥岩: 'b_4',
};
/** A group from [name, hits] pairs (hits = the drafts of the group the card appeared in). */
const r9Group = (pairs, seen) => ({ cards: pairs.map(([n]) => EE(R9[n])), hits: pairs.map(([, h]) => h), seen });
/** The R9 groups (one per bossInitial event), picked by the matches they came in. */
const BOUNTY_BOSS_GROUPS = [
  r9Group([['W', 11], ['碎骨', 12], ['弑君者', 11], ['大鲍勃', 11], ['源石虫', 10], ['鼠王', 4], ['杰斯顿', 12], ['自在', 7], ['陷落雪祀', 6]], [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21]),
  r9Group([['W', 3], ['碎骨', 1], ['弑君者', 1], ['大鲍勃', 3], ['庞贝', 1], ['源石虫', 2], ['喷气人', 3], ['纠缠藤蔓', 3], ['澪', 1]], [1, 5, 22]),
  r9Group([['W', 3], ['碎骨', 2], ['弑君者', 1], ['庞贝', 2], ['源石虫', 1], ['澪', 1], ['邪魔的利刃', 2], ['复仇者', 3], ['萨卡兹百夫长', 3]], [6, 20, 'bahamut-12294']),
  r9Group([['W', 1], ['碎骨', 1], ['弑君者', 0], ['大鲍勃', 0], ['庞贝', 0], ['源石虫', 1], ['腐败骑士', 1], ['墓碑', 1], ['巨大的丑东西', 1]], [3]),
  r9Group([['W', 0], ['碎骨', 0], ['弑君者', 1], ['大鲍勃', 1], ['庞贝', 1], ['源石虫', 1], ['泥岩', 1], ['澪', 1]], [2]),
  r9Group([['W', 1], ['碎骨', 1], ['弑君者', 1], ['大鲍勃', 1], ['庞贝', 1], ['源石虫', 1]], [4]),
];
/** The R11 groups seen: 7 cards, or 6 + `open` cards drawn by BOUNTY_HUNTER_RULE. */
const hunterGroup = (ids, hits, seen, open = 0) => ({ cards: ids.map(EE), hits, seen, ...(open ? { open } : {}) });
const BOUNTY_HUNTER_GROUPS = [
  hunterGroup(['16_4', '16_10', '15_7', '12_7', '13_8', '10_7', '11_7'], [4, 4, 3, 3, 4, 3, 3], [1, 6, 21, 22]), // 温顺的武装大驮兽 …
  hunterGroup(['16_3', '15_7', '13_8', '16_9', '14_7', '11_7', '10_7'], [2, 2, 2, 1, 2, 2, 1], [3, 13]), // 狂暴宿主组长 …
  hunterGroup(['16_5', '15_8', '12_7', '14_8', '10_7', '16_11', '11_7'], [3, 3, 3, 2, 3, 3, 1], [10, 12, 16]), // 萨卡兹骸骨拷打者 …
  hunterGroup(['16_7', '16_9', '14_7', '16_11', '11_7', '13_7'], [1, 1, 1, 1, 1, 1], [11], 1), // 乌顶巨角卢鲁 …
  hunterGroup(['16_8', '16_10', '14_8', '10_7', '16_12', '13_7'], [2, 2, 2, 2, 2, 2], [14, 19], 1), // 伊利昂的木驮兽 …
  hunterGroup(['16_1', '10_8', '11_8', '15_7', '13_7', '14_7'], [1, 1, 1, 1, 1, 1], [17], 1), // 泥岩巨像 …
  hunterGroup(['10_8', '12_7', '13_7', '14_7', '11_7', '16_12'], [1, 1, 1, 1, 1, 1], [15], 1), // no giant seen (枯朽萃聚使徒 …)
];
/**
 * The `open` card of a seen R11 list [ASSUMED]: up to `size` cards — one tier-III giant (a list without one gets one) +
 * tier I / II cards, at most one per series of `onePerSeries` and `maxSeries16` of 16_9..12 — over the R11 cards by tier
 * (buildChoices).
 */
const BOUNTY_HUNTER_RULE = { size: 7, onePerSeries: [10, 11, 12, 13, 14, 15], maxSeries16: 2 };
/**
 * The official 机密商店 (R11 of matches 2, 4, 5 and 8; the user: "机密商店按官方改成可以重复吧"): six item cards, free, and
 * the same item can be offered twice (盟约之币 ×2 in 4 and 5, 变形同构体 ×2 in 8). Every one of the 4 has exactly two tier-VI
 * items, at least one tier V and at least one 盟约之币 — never a tier-I / II item besides 盟约之币; the other two cards came
 * out V ×3, IV ×2, III ×1, 盟约之币 ×2. So: six slots, each drawn on its own (with replacement) — VI, VI, V, 盟约之币 and
 * twice a pick of V 3 / IV 2 / III 1 / 盟约之币 2 [ASSUMED: the slot split]; an item within its tier with weight 1 + the
 * official 机密商店 cards it showed on (`seen`: 变形同构体 on 4 of the 8 tier-VI cards) [ASSUMED]. Solo shows 3 of the 6
 * [ASSUMED]. Only at R11 (`rounds`; R11 is 绝境 / 终极 only, the rounds of the screenshots): the 机密商店 of 标准 R3 / R9
 * and 险境 R3 / R6 / R9 has no screenshot, and the data's shop events sit in three blocks (artifact_paid_1 by the R3
 * events, _2 / _3 by bossInitial / bounty_hunter_1..7, _4 / _5 by bounty_hunter_8..15 and hardbuff_select — the same
 * block reading leaves open which hunter events R11 fires, see `hunter` above), so those keep the previous draw —
 * any normal shop item of tiers I–VI per card, with replacement (the same item can come twice there too) [ASSUMED].
 */
const SHOP_DRAFT = {
  rounds: [11],
  slots: [{ 6: 1 }, { 6: 1 }, { 5: 1 }, { coin: 1 }, { 5: 3, 4: 2, 3: 1, coin: 2 }, { 5: 3, 4: 2, 3: 1, coin: 2 }],
  coin: '盟约之币',
  seen: { 变形同构体: 4, 天师古鼎: 1, 人事部文档: 1, 家族徽章: 1, 铳骑之威: 1, 天马之盔: 2, 双模机械臂: 2, 商业包装方案: 2, 博士投影: 1, 护盾无人机: 1, 寻呼模块: 1, 骑士储蓄罐: 1, 盟约之币: 6 },
  matches: [2, 4, 5, 8],
};
/**
 * The official 战术决策 (R11 of matches 7, 9, 18 and 20; the user: "战术决策也按官方改成可以重复吧"): six cards, and the same
 * card can be offered twice (补给 ×2 in match 7; the other three show six different cards). All 24 cards are ally cards
 * (allybuff_select_*: 盟誓, 驰援, 列装 / 财富 / 补给 / 整备 / 升华, 锐利): no 排斥 / 责罚 / 裁决 debuff (four drafts without
 * one: about 0.04 % for the previous draw, 6 different cards of the 26 ally + 9 debuff cards) and no 模拟战场演变 terrain
 * card. 列装 / 财富 / 补给 / 整备 / 升华 made 12 of the 24 cards (a uniform draw of the 26 ally cards: about 0.07 %), so
 * the draw is weighted. At R11 (`rounds`; 绝境 / 终极 only, the round of the screenshots): each card drawn on its own (with
 * replacement) from the ally cards (`kinds`), weight 1 + the official cards it showed on (`seen`) [ASSUMED: the weights;
 * terrain cards left out — the maps of the 4 matches are unknown]; solo shows 3 [ASSUMED]. Other rounds (标准 / 险境, no
 * screenshot) keep every card, uniform, terrain cards only for the match stage — with replacement too [ASSUMED].
 * Open: a slot structure like SHOP_DRAFT's. Every one of the 4 drafts has at least one 驰援, at least one 盟誓 and at least
 * two of 列装 / 财富 / 补给 / 整备 / 升华; under these independent draws a draft has 驰援 + 盟誓 about 70 % of the time (all
 * four: about 24 %) and all three about 41 % (all four: about 3 %). The pattern was spotted after the fact, so it is kept as
 * a question rather than slots [ASSUMED: independent draws]; more R11 战术决策 screenshots would settle it.
 */
const TACTIC_DRAFT = {
  rounds: [11],
  kinds: ['ally'],
  seen: { 补给: 3, 列装: 3, 升华: 3, 莫斯提马的盟誓: 2, 银灰的盟誓: 2, 阿戈尔驰援: 2, 财富: 2, 谢拉格驰援: 1, 锐利: 1, 整备: 1, 玛恩纳的盟誓: 1, 斯卡蒂的盟誓: 1, 萨尔贡驰援: 1, 叙拉古驰援: 1 },
  matches: [7, 9, 18, 20],
};
/**
 * 规程 (act3autochess) 机变 draft tables, read from 15 official co-op 终极 matches (mode_multi_abyss; bilibili
 * BV13LWM6BEvY, 2026-11-10/11 — the readings are test/fixtures/official-regulation-drafts.json; upstream 270cb7b1).
 * Same shapes as the 盟约 constants above, with three differences the screens show: an R3 list of 7 shows 6 (drawWeighted),
 * an R11 list can hold two tier-III cards (hunterFill adds a giant only to a list with none), and the 机密商店 always has
 * one VI and one V. Without these the season drew 盟约's lists, so the 规程 cards no 盟约 list names (enemyeffect_17_7,
 * 18_7, 12_9, 13_9, 20_7, 16_13) never came.
 */
const ACT3_DRAFTS = {
  /**
   * R3 (enemy_initial_1..10): seven lists seen; series 17 / 18 and the two mixed lists are 7 cards, series 19 is the whole
   * catalog (19_1..19_6) and came in 4 matches. Matches 1 and 13 are not a 6-subset of any other list.
   */
  initialSets: [
    { cards: ['17_1', '17_2', '17_3', '17_4', '17_5', '17_6', '17_7'].map(EE), seen: [2, 8] },
    { cards: seriesIds(19), seen: [4, 5, 6, 15] },
    { cards: ['18_1', '18_2', '18_3', '18_4', '18_5', '18_6', '18_7'].map(EE), seen: [12, 14] },
    { cards: ['10_5', '11_4', '11_5', '12_5', '13_6', '15_4', '20_3'].map(EE), seen: [3, 9] },
    { cards: ['12_4', '12_9', '13_4', '14_6', '15_4', '18_7', '20_4'].map(EE), seen: [7, 10, 11] },
    // the 6 cards on the screen [ASSUMED]: no second draw revealed a 7th
    { cards: ['12_5', '20_5', '10_4', '20_1', '11_4', '13_9'].map(EE), seen: [1] },
    { cards: ['15_5', '12_9', '13_4', '17_7', '10_6', '14_5'].map(EE), seen: [13] },
  ],
  /**
   * The 3 unseen R3 events [ASSUMED]: tiers I I I II II III III (the complete lists of 7), at most two of one series (the
   * mixed lists hold two of series 11, 12 or 20), both III from the tier-III initial cards no screen showed (`prefer`).
   */
  initialRule: { series: [10, 11, 12, 13, 14, 15, 20], tiers: [1, 1, 1, 2, 2, 3, 3], perSeries: 2, prefer: ['11_6', '12_6', '15_6', '20_6'].map(EE) },
  /**
   * R9 (bossInitial_1..6): one group per event, picked by the matches it came in (`pick: 'seen'`), not by the leader —
   * matches 4 and 8 are both 假想敌：胄 and different groups. 腐败骑士 b_5, “遗弃者” b_7 and 锏 b_15 never appeared.
   */
  bossGroups: [
    // 鼠王: the three drafts together are exactly these 9 cards
    { cards: ['5_1', 'b_10', 'b_11', 'b_13', 'b_3', 'b_9', 'b_1', 'b_14', 'b_23'].map(EE), hits: [2, 2, 2, 2, 3, 2, 2, 2, 1], seen: [2, 8, 10] },
    // 扎罗 + 迷路的巨像: each draft leaves out a different one of the 7
    { cards: ['5_1', 'b_13', 'b_16', 'b_18', 'b_2', 'b_9', 'b_3'].map(EE), hits: [2, 2, 2, 2, 2, 1, 1], seen: [4, 7] },
    // “墓碑” + “巨大的丑东西” + 凋零骑士: 8 cards across 4 drafts
    { cards: ['5_1', 'b_1', 'b_13', 'b_17', 'b_20', 'b_6', 'b_10', 'b_3'].map(EE), hits: [2, 4, 4, 3, 4, 2, 3, 2], seen: [5, 11, 12, 13] },
    // 喷气人 + 纠缠藤蔓 + 泥岩 + “庞贝” + 澪: matches 3, 14 and 15, union exactly 9
    { cards: ['5_1', 'b_19', 'b_13', 'b_10', 'b_3', 'b_4', 'b_24', 'b_8', 'b_12'].map(EE), hits: [2, 2, 2, 3, 2, 2, 2, 2, 1], seen: [3, 14, 15] },
    // “复仇者” + “邪魔的利刃”, one group with match 9 [ASSUMED]: the drafts share 4 of 6 cards, and 6 groups match the 6 events
    { cards: ['5_1', 'b_19', 'b_2', 'b_21', 'b_22', 'b_3', 'b_1', 'b_10'].map(EE), hits: [2, 2, 2, 1, 1, 2, 1, 1], seen: [1, 9] },
    // match 6, the 6 cards on the screen [ASSUMED]
    { cards: ['5_1', 'b_1', 'b_13', 'b_2', 'b_3', 'b_9'].map(EE), hits: [1, 1, 1, 1, 1, 1], seen: [6] },
  ],
  /**
   * R11 悬赏决策: five lists in 9 drafts, `slots` = the 5 lists [ASSUMED, as 盟约], so no list is built from nothing; the
   * `open` card (a list seen once, or the same 6 cards twice [ASSUMED]) is the only way an unseen hunter card comes. Two
   * tier-III cards in one list, and two of series 13, are what the screens showed.
   */
  hunterGroups: [
    { cards: ['11_8', '12_7', '14_7', '15_7', '16_1', '16_12', '16_13'].map(EE), hits: [2, 2, 2, 3, 3, 3, 3], seen: [1, 3, 4] },
    { cards: ['10_8', '11_7', '13_7', '13_8', '14_7', '16_7', '16_9'].map(EE), hits: [2, 2, 1, 2, 2, 1, 2], seen: [2, 11] },
    { cards: ['10_8', '11_7', '12_7', '14_7', '16_6', '16_12'].map(EE), hits: [2, 2, 2, 2, 2, 2], seen: [5, 7], open: 1 },
    { cards: ['10_7', '11_8', '13_7', '15_7', '16_2', '16_13'].map(EE), hits: [1, 1, 1, 1, 1, 1], seen: [8], open: 1 },
    { cards: ['11_7', '12_7', '15_7', '16_4', '16_10', '16_11'].map(EE), hits: [1, 1, 1, 1, 1, 1], seen: [10], open: 1 },
  ],
  hunterRule: BOUNTY_HUNTER_RULE,
  /**
   * R11 机密商店 (matches 9, 12, 14, 15): six slots with replacement. Every shop has a tier VI and a tier V and no tier I / II
   * item but 盟约之币; the other four cards over the four shops are VI ×3, V ×3, IV ×4, III ×4, 盟约之币 ×2 — so one slot
   * VI, one V, four the residual [ASSUMED: the slot split].
   */
  shop: {
    rounds: [11],
    slots: [{ 6: 1 }, { 5: 1 }, ...Array.from({ length: 4 }, () => ({ 6: 3, 5: 3, 4: 4, 3: 4, coin: 2 }))],
    coin: '盟约之币',
    seen: { 驮兽储蓄罐: 4, 变形同构体: 3, 人事部文档: 3, 不退者力场: 2, 瓶装烈性反应: 2, M3茧甲: 2,
      博士投影: 1, 寻呼模块: 1, 拟态物质: 1, 汲取者之心: 1, 动能单手弩: 1, 人事部记录: 1, 盟约之币: 2 },
    matches: [9, 12, 14, 15],
  },
  /** R11 战术决策 (matches 6 and 13): ally cards only (no 排斥 / 责罚 / 裁决, no terrain card [ASSUMED]), match 13 has 列装 twice. */
  tactic: {
    rounds: [11],
    kinds: ['ally'],
    seen: { 列装: 2, 卡西米尔驰援: 1, 阿戈尔驰援: 1, 升华: 1, 财富: 1, 整备: 1, 歌蕾蒂娅的盟誓: 1,
      艾雅法拉的盟誓: 1, 乌萨斯驰援: 1, 赫拉格的盟誓: 1, 伊比利亚驰援: 1 },
    matches: [6, 13],
  },
  /** 盟约's tier checks (I I I II II III, at most one giant) do not hold here. */
  strict: false,
  assumed: {
    initial: ['a uniform pick among the 10 events', 'the 3 unseen events built by `rule` (I I I II II III III, at most two of one series)', 'matches 1 and 13 stored as the 6 cards shown'],
    boss: ['one group per bossInitial event, picked by the matches it came in, not by the leader', 'card weights 1 + hits', 'matches 1 and 9 are one group', 'match 6 stored as the 6 cards shown', 'boss bounties of no seen group are not offered'],
    hunter: ['slots = the 5 seen lists, so no list is built from nothing', 'card weights 1 + hits', 'a list seen once, and the list whose same 6 cards came twice, keep open 1'],
    shop: ['one slot always VI, one always V, four slots the residual tier counts', 'item weights 1 + the cards an item showed on', 'solo shows 3 of the 6', 'other rounds keep tiers I–VI with replacement'],
    tactic: ['card weights 1 + the cards a card showed on', 'ally cards only', 'independent draws (no slot structure)', 'solo shows 3', 'other rounds keep every card, uniform, with replacement'],
  },
};
/** The measured 机变 draft tables of each season (no table field: official recordings). A season without them stops the build. */
const DRAFT_TABLES = {
  [DEFAULT_SEASON]: {
    initialSets: BOUNTY_INITIAL_SETS, initialRule: BOUNTY_INITIAL_RULE, bossGroups: BOUNTY_BOSS_GROUPS, hunterGroups: BOUNTY_HUNTER_GROUPS,
    hunterRule: BOUNTY_HUNTER_RULE, shop: SHOP_DRAFT, tactic: TACTIC_DRAFT, strict: true,
    assumed: {
      initial: ['a uniform pick among the 10 events', 'the unseen 10th set built by `rule`', '险境 R6 drafts like R3'],
      boss: ['a group picked by the matches it came in (the per-match cause is open)', 'card weights 1 + hits', 'the single-draft groups completed with their base cards', 'boss bounties of no seen group are not offered'],
      hunter: ['one of the 7 seen lists, picked uniformly (which of the 15 events R11 fires is open)', 'card weights 1 + hits', 'the `open` cards built by `rule`'],
      shop: ['the slot split', 'item weights 1 + seen', 'solo shows 3 of the 6', 'other rounds (标准 / 险境) keep the previous draw: tiers I–VI with replacement'],
      tactic: ['card weights 1 + seen', 'independent draws (no slot structure)', 'no terrain card at R11', 'solo shows 3', 'other rounds (标准 / 险境) keep every card, uniform, with replacement'],
    },
  },
  act3autochess: ACT3_DRAFTS,
};
/** This build's season's draft tables. */
function seasonDrafts() {
  const d = DRAFT_TABLES[SEASON];
  if (!d) throw new Error(`DRAFT_TABLES: no 机变 draft tables for season ${SEASON} (add its measured tables, or say it has none)`);
  return d;
}
/** The kind of a round's 悬赏决策: R3 (and 险境 R6, [ASSUMED]) initial, R9 boss, R11 hunter. */
const bountyDraftOf = (r) => (r < 8 ? 'initial' : r < 11 ? 'boss' : 'hunter');

/** The draft kind a bounty card belongs to by its shape, null when no draft offers it (see above). */
function bountyDraftPool(e, main, draftExcluded) {
  if (draftExcluded) return null;
  if (main.rounds === 2) return 'initial';
  if (main.rounds !== 1) return null; // multi-round
  if (/^enemyeffect_b_\d+$/.test(e.effectId) || e.effectId === 'enemyeffect_5_1') return 'boss';
  if (/^enemyeffect_1[0-5]_[78]$/.test(e.effectId) || /^enemyeffect_16_\d+$/.test(e.effectId)) return 'hunter';
  return null; // the pre-series cards enemyeffect_3_*
}

/** Classify a 机变 choice event id into a family. */
function choiceFamily(ev) {
  if (ev.choiceType === 'BOUNTY_HUNT' || ev.choiceType === 'PERSONAL_CHOOSE') return 'bounty';
  if (ev.choiceType === 'EQUIP_FREE') return /^artifact_paid/.test(ev.choiceEventId) ? 'shop' : 'supply';
  if (ev.choiceType === 'BUFF_SELECT') return 'tactic';
  return 'other';
}

/**
 * Build data/choices.json: 机变 events, families, card pools, per-mode round schedule (research 01
 * A4 defaults, [ASSUMED] where the data is silent) and server-side reward pools.
 */
function buildChoices(ctx, effects, items, chess) {
  const { act } = ctx;
  const D = seasonDrafts();
  const events = {};
  for (const id of Object.keys(act.effectChoiceInfoDict).sort(naturalCmp)) {
    const ev = act.effectChoiceInfoDict[id];
    events[id] = {
      id, choiceType: ev.choiceType, effectType: ev.effectType, name: ev.name, desc: stripRich(ev.desc), descRaw: richRaw(ev.desc),
      color: ev.typeTxtColor || null, family: choiceFamily(ev), solo: /_s$/.test(id), training: /_tr$/.test(id),
    };
  }
  // Effects that open a personal 机变 choice (e.g. 教鞭 / “神秘顾客” → hunter_band_1).
  for (const e of Object.values(effects)) for (const b of e.buffs) {
    const ce = b.bbStr.choice_event;
    if (!ce) continue;
    if (!events[ce]) { warn(`effect ${e.effectId} references unknown choice event ${ce}`); continue; }
    const users = Object.values(items).filter((i) => i.effectId === e.effectId).map((i) => i.id);
    (events[ce].usedBy ||= []).push(...(users.length ? users : [e.effectId]));
  }
  const eventsOf = (family, pred = () => true) => Object.values(events).filter((e) => e.family === family && pred(e)).map((e) => e.id);

  // Bounty cards (ENEMY_GAIN effects).
  const bounty = [];
  for (const e of Object.values(effects)) {
    if (e.effectType !== 'ENEMY_GAIN') continue;
    const adds = e.buffs.filter((b) => /add_enemy/.test(b.key)).map((b) => ({
      enemyKey: b.bbStr.enemy_id || null, count: b.bb.count ?? 1, coin: b.bb.coin ?? 0,
      rounds: b.bb.round ?? 1, payout: /kill_gain_coin/.test(b.key) ? 'kill' : 'perfect', buffKey: b.key,
    }));
    if (!adds.length) { warn(`bounty effect ${e.effectId} has no add_enemy buff`); continue; }
    const main = adds.find((a) => a.buffKey !== 'next_battle_add_enemy_win_gain_coin') || adds[0];
    const m = /([I]{1,3})$/.exec(e.name || '');
    let tier = m ? ROMAN[m[1]] : Math.min(3, Math.max(1, e.enemyPrice || main.coin || 1));
    const multiRound = main.rounds >= 99;
    if (multiRound) tier = 2;
    for (const a of adds) if (a.enemyKey && !ctx.enemyDb.has(a.enemyKey)) warn(`bounty ${e.effectId}: unknown enemy ${a.enemyKey}`);
    const coin = e.enemyPrice || main.coin;
    let draftExcluded = bountyDraftExclusion(e, main);
    if (draftExcluded === 'hidden' && !/鸭爵|高普尼克|流泪小子|圆仔/.test(e.name || '')) warn(`bounty ${e.effectId} "${e.name}": expected one of the 鸭爵 set`);
    let draftPool = bountyDraftPool(e, main, draftExcluded);
    // a boss bounty is offered only through a seen R9 group of the season (DRAFT_TABLES)
    if (draftPool === 'boss' && !D.bossGroups.some((g) => g.cards.includes(e.effectId))) draftPool = null;
    if (!draftExcluded && !draftPool) draftExcluded = 'unseen';
    const sm = /^enemyeffect_(\d+)_\d+$/.exec(e.effectId);
    bounty.push({
      effectId: e.effectId, name: e.name, desc: e.desc, tier, coin,
      payout: main.payout, rounds: main.rounds, multiRound, enemyKey: main.enemyKey, count: main.count, adds,
      draft: !draftExcluded, draftExcluded, draftPool, series: sm ? Number(sm[1]) : null,
    });
  }
  bounty.sort((a, b) => naturalCmp(a.effectId, b.effectId));
  // the official draft structures (see BOUNTY_INITIAL_SETS) only name cards of their own kind
  const bountyById = new Map(bounty.map((c) => [c.effectId, c]));
  const checkKind = (ids, kind, what) => { for (const id of ids) if (bountyById.get(id)?.draftPool !== kind) warn(`bounty draft ${what}: ${id} is not a "${kind}" card`); };
  for (const s of D.initialSets) checkKind(s.cards, 'initial', 'R3 set');
  for (const g of D.bossGroups) checkKind(g.cards, 'boss', 'R9 group');
  for (const g of D.hunterGroups) checkKind(g.cards, 'hunter', 'R11 group');
  for (const g of [...D.initialSets, ...D.bossGroups, ...D.hunterGroups]) {
    if (new Set(g.cards).size !== g.cards.length) warn(`bounty draft group ${g.cards.join(' ')}: a card twice`);
    if (g.hits && g.hits.length !== g.cards.length) warn(`bounty draft group ${g.cards.join(' ')}: hits do not match the cards`);
  }
  if (D.strict) {
    for (const s of D.initialSets) if (s.cards.map((id) => bountyById.get(id)?.tier).sort().join('') !== '111223') warn(`bounty draft R3 set ${s.cards.join(' ')}: not I I I II II III`);
    for (const g of D.hunterGroups) {
      const giants = g.cards.filter((id) => bountyById.get(id)?.tier === 3).length;
      if (giants > 1 || g.cards.length + (g.open || 0) !== D.hunterRule.size) warn(`bounty draft R11 group ${g.cards.join(' ')}: not ${D.hunterRule.size} cards with at most one giant`);
    }
  } else {
    for (const g of [...D.initialSets, ...D.hunterGroups]) if (g.cards.length + (g.open || 0) > 7) warn(`bounty draft group ${g.cards.join(' ')}: more than 7 cards`);
  }
  // the R11 rule draws over the R11 cards by tier: III the giants, II / I the rest
  const hunterTier = (t) => bounty.filter((c) => c.draftPool === 'hunter' && c.tier === t).map((c) => c.effectId);
  if (hunterTier(1).length + hunterTier(2).length + hunterTier(3).length !== bounty.filter((c) => c.draftPool === 'hunter').length) warn('bounty: an R11 card of no tier I–III');
  const withWeights = ({ hits, ...g }) => ({ ...g, weights: hits.map((h) => h + 1) });

  // Tactic cards (BUFF_GAIN effects).
  const tactic = [];
  for (const e of Object.values(effects)) {
    if (e.effectType !== 'BUFF_GAIN') continue;
    let kind = 'ally', stageId = null;
    if (/^enemydebuff_select/.test(e.effectId)) kind = 'enemyDebuff';
    else if (/^map_m0\d/.test(e.effectId)) { kind = 'terrain'; stageId = `act1autochess_m0${/^map_m0(\d)/.exec(e.effectId)[1]}`; }
    const team = /若存在其他队友则他们也获得/.test(e.desc || '');
    tactic.push({ effectId: e.effectId, name: e.name, desc: e.desc, kind, stageId, team });
  }
  tactic.sort((a, b) => naturalCmp(a.effectId, b.effectId));
  // the official 战术决策 (TACTIC_DRAFT) names cards of its `kinds` only
  const tacticByName = (name) => {
    const hits = tactic.filter((c) => c.name === name);
    if (hits.length !== 1) warn(`tactic draft card "${name}": ${hits.length} cards of that name`);
    if (hits[0] && !D.tactic.kinds.includes(hits[0].kind)) warn(`tactic draft card "${name}" is a ${hits[0].kind} card`);
    return hits[0]?.effectId ?? null;
  };

  const equipNormal = Object.values(items).filter((i) => i.itemType === 'EQUIP' && !i.isGolden);
  const itemByName = (name) => equipNormal.find((i) => i.name === name)?.id || (warn(`pool item "${name}" not found`), null);
  /** Does an effect of this season's tables pay from pool `id` (a buff's bbStr.pool)? */
  const poolUsed = (id) => Object.values(effects).some((e) => (e.buffs || []).some((b) => b && b.bbStr && b.bbStr.pool === id));
  const chessByName = (name) => Object.values(chess).find((c) => !c.isGolden && c.visible && c.name === name)?.chessId
    || Object.values(chess).find((c) => !c.isGolden && c.name === name)?.chessId || (warn(`pool chess "${name}" not found`), null);

  // Per-mode schedule of families (research 01 A4).
  const schedule = {};
  const supplyWindow = { 3: [1, 4], 6: [2, 5], 9: [3, 6], 11: [4, 6] };
  // the 悬赏决策 of a round is the kind of official draft its round has (bountyDraftOf: R3 initial, R9 boss, R11 hunter)
  const bountyEventRe = { initial: /^enemy_initial_/, boss: /^bossInitial_/, hunter: /^bounty_hunter_/ };
  for (const [modeId, rounds] of Object.entries(act.battleDataDict)) {
    const mode = act.modeDataDict[modeId];
    const solo = mode.modeType === 'SINGLE';
    const diff = mode.modeDifficulty;
    const sp = Object.entries(rounds).filter(([, es]) => es.some((e) => e.isSpPrepare)).map(([r]) => Number(r)).sort((a, b) => a - b);
    const m = {};
    for (const r of sp) {
      let families;
      if (diff === 'TRAINING') families = [{ family: 'supply', weight: 100 }];
      else if (diff === 'HARD' || diff === 'ABYSS') {
        // R11 of the 22 official co-op matches (player feedback after 0.1.0 report #2, the screenshots of BOUNTY_INITIAL_SETS):
        // 悬赏决策 14, 机密商店 4, 战术决策 4, 道具补给 0 — the weights are those counts [ASSUMED]. Solo 绝境 / 终极 take the
        // same weights [ASSUMED: no solo screenshot; extrapolated from co-op — the data has solo 悬赏决策 events for R11,
        // bounty_hunter_*_s, which the previous supply 50 / shop 50 never used]
        families = r === 11 ? [{ family: 'bounty', weight: 14 }, { family: 'shop', weight: 4 }, { family: 'tactic', weight: 4 }] : [{ family: 'bounty', weight: 100 }];
      } else if (diff === 'NORMAL') {
        families = solo
          ? [{ family: r === 9 ? 'tactic' : 'supply', weight: 100 }]
          : [{ family: 'bounty', weight: 50 }, { family: 'supply', weight: 25 }, { family: 'shop', weight: 10 }, { family: 'tactic', weight: 15 }];
      } else families = [{ family: 'supply', weight: 45 }, { family: 'tactic', weight: 35 }, { family: 'shop', weight: 20 }];
      const bountyDraft = bountyDraftOf(r);
      const bountyEvents = eventsOf('bounty', (e) => bountyEventRe[bountyDraft].test(e.id) && e.solo === solo);
      m[r] = {
        families, cards: solo ? 3 : 6,
        supplyTiers: supplyWindow[r] || [1, 6], bountyDraft,
        events: {
          bounty: bountyEvents,
          supply: diff === 'TRAINING' ? eventsOf('supply', (e) => e.training) : eventsOf('supply', (e) => !e.training && e.solo === solo),
          shop: eventsOf('shop', (e) => e.solo === solo),
          tactic: eventsOf('tactic', (e) => e.solo === solo && (/^hardbuff/.test(e.id) ? diff === 'HARD' || diff === 'ABYSS' : true)),
        },
        assumed: !(diff === 'HARD' || diff === 'ABYSS') || r === 11,
      };
    }
    schedule[modeId] = { spRounds: sp, rounds: m };
  }

  return {
    events,
    families: {
      bounty: { name: '悬赏决策', desc: '选定悬赏目标，获取额外奖励。', cards: 'bountyDrafts[schedule[*].bountyDraft] — one official card list of the round (initial: an R3 set of 6; boss: an R9 group of up to 9; hunter: one of the 7 seen R11 lists of 7), six different cards of it drawn by weight, over cards.bounty entries with draft: true and that draftPool' },
      supply: { name: '道具补给', desc: '无需消耗资金，获得装备补给。', cards: 'random normal EQUIP items in schedule[*].supplyTiers (duplicates allowed)' },
      shop: { name: '机密商店', desc: '无需消耗资金，获得装备补给。', cards: 'at shopDraft.rounds (R11): six slots drawn with replacement (VI, VI, V, 盟约之币, 2 × V / IV / III / 盟约之币); other rounds: random normal EQUIP shop items of tiers I–VI (duplicates allowed) — the same item can come twice' },
      // desc = the official header (effectChoiceInfoDict buff_select_* / hardbuff_select_* "进行协同调整，做好迎战准备。")
      tactic: { name: '战术决策', desc: '进行协同调整，做好迎战准备。', cards: 'cards.tactic, each card drawn on its own (with replacement) — the same card can come twice; at tacticDraft.rounds (R11) the ally cards by tacticDraft.weights, other rounds every card uniform (terrain cards only for the match stage)' },
    },
    format: {
      multi: { cards: 6, pickOrder: 'random', firstPickSec: 30, otherPickSec: 16, onTimeout: 'autoPickRandom', eachPlayerPicks: 1 },
      solo: { cards: 3, timer: null },
      opensAfterIncome: true,
    },
    cards: { bounty, tactic },
    // the official 悬赏决策 structures by kind (tools/build-data.mjs BOUNTY_INITIAL_SETS; `seen` = the match numbers of
    // test/fixtures/official-bounty-drafts.json; `slots` = the official events, the unseen ones built by `rule`)
    bountyDrafts: {
      initial: {
        events: eventsOf('bounty', (e) => bountyEventRe.initial.test(e.id) && !e.solo), slots: eventsOf('bounty', (e) => bountyEventRe.initial.test(e.id) && !e.solo).length,
        pick: 'slot', groups: D.initialSets, rule: D.initialRule, count: 6,
        assumed: D.assumed.initial,
      },
      boss: {
        events: eventsOf('bounty', (e) => bountyEventRe.boss.test(e.id) && !e.solo), slots: D.bossGroups.length,
        pick: 'seen', groups: D.bossGroups.map(withWeights), count: 6,
        assumed: D.assumed.boss,
      },
      hunter: {
        events: eventsOf('bounty', (e) => bountyEventRe.hunter.test(e.id) && !e.solo), slots: D.hunterGroups.length,
        // one of the 7 seen lists, uniform [ASSUMED]: `slots` 7, so no list is built from nothing (which of the 15 events
        // R11 fires is open — by the data's blocks it would be 8..15); `rule` builds the `open` cards only
        pick: 'slot', groups: D.hunterGroups.map(withWeights),
        rule: { ...D.hunterRule, giants: hunterTier(3), cards: [...hunterTier(2), ...hunterTier(1)] }, count: 6,
        assumed: D.assumed.hunter,
      },
    },
    // the official 机密商店 (SHOP_DRAFT) at `rounds`: `slots` tier → weight (`coin` = 盟约之币), each drawn on its own;
    // `itemWeights` = 1 + the official cards an item showed on (other shop items 1)
    shopDraft: {
      rounds: D.shop.rounds, slots: D.shop.slots, coin: itemByName(D.shop.coin),
      itemWeights: Object.fromEntries(Object.entries(D.shop.seen).filter(([n]) => n !== D.shop.coin).map(([n, k]) => [itemByName(n), 1 + k]).sort((a, b) => naturalCmp(a[0], b[0]))),
      seen: D.shop.matches, count: 6,
      assumed: D.assumed.shop,
    },
    // the official 战术决策 (TACTIC_DRAFT) at `rounds`: each card drawn on its own (with replacement) from the cards.tactic
    // entries of `kinds`, by `weights` (1 + the official cards it showed on; other cards of those kinds 1)
    tacticDraft: {
      rounds: D.tactic.rounds, kinds: D.tactic.kinds,
      weights: Object.fromEntries(Object.entries(D.tactic.seen).map(([n, k]) => [tacticByName(n), 1 + k]).filter(([id]) => id).sort((a, b) => naturalCmp(a[0], b[0]))),
      seen: D.tactic.matches, count: 6,
      assumed: D.assumed.tactic,
    },
    schedule,
    pools: seasonPools({
      pool_equip_normal: { kind: 'equip', rule: 'shopEligible', maxTier: 'shopLevel', assumed: true },
      pool_equip_shop_1: { kind: 'equip', rule: 'shopEligible', tiers: [1], assumed: true },
      // 凯瑟琳 定向投放 (up_shop_add_special_goods): every shop-eligible item, whatever the shop level — players' first-hand
      // report (community, 2026-10-06): 「原版凯瑟琳1升2都能有6本装备」; the pool itself is server-side, uniform [ASSUMED]
      // (until 0.2.0 it was capped at the shop level, so the 1 → 2 offer only ever showed tiers I–II)
      // `plus`: 突变细胞 (never sold, SHOP_EXCLUDED_ITEMS) comes from this pool too — upstream #631 (2026-10-14, 「凯瑟琳盟约刷不出
      // 突变细胞」; the issue's comments link three official-play recordings of a 凯瑟琳 run offering it — bilibili
      // BV1XmUhBhEtw, BV1sUSQBLE93, BV1WRQeBNEqW; the pool itself is server-side, so its weight stays uniform [ASSUMED]);
      // it is the pool's only effect-only item [ASSUMED] (the 4 special 维式重锤 are not in it)
      pool_equip_kathe: { kind: 'equip', rule: 'shopEligible', plus: [seasonItemId(items, 'chess_item_5_08_e_a')], assumed: true },
      // 娜仁图亚 见者有份 (preparation_start_add_special_goods_every_n_round): the blackboard names no tier cap. Players'
      // first-hand report (community, 2026-10-14, upstream e53b8d52): the two equips can be above the current shop level.
      // Same shape as 凯瑟琳 — every shop-eligible item, uniform [ASSUMED] (until then it was capped at the shop level, so an
      // even round at level 1–2 never showed tier III+); unlike 凯瑟琳 no `plus` (no source gives 突变细胞 here)
      pool_equip_narant: { kind: 'equip', rule: 'shopEligible', assumed: true },
      // "获得一件带有随机特殊效果的维式重锤": the 4 hammers with a special effect (never sold, SHOP_EXCLUDED_ITEMS); the
      // weights are server-side (PRTS 11-25 note: "装备【灼燃维式重锤】的出现概率调整") — uniform [ASSUMED]
      // (规程: the same text, five kinds with 电流维式重锤 — specialHammerIds; 盟约's four in the same order as before)
      pool_equip_vict: { kind: 'equip', items: specialHammerIds(effects).filter((id) => items[id]), assumed: true },
      // 卫戍协议：规程's 谢拉格: every 100 layers one 谢拉格不融冰 (bond_layer_added_reward_equip pool_equip_kjeragbond2; the pool
      // itself is server-side): that one item — only for a season whose effects name the pool (the default season has an
      // item of that name too)
      ...(poolUsed('pool_equip_kjeragbond2') ? { pool_equip_kjeragbond2: { kind: 'equip', items: [itemByName('谢拉格不融冰')], assumed: true } } : {}),
      ...(SEASON === DEFAULT_SEASON ? {
        pool_equip_pepe: { kind: 'equip', weighted: [['盟约之币', 45], ['萨尔贡浓茶', 45], ['黄沙罗盘', 10]].map(([n, w]) => [itemByName(n), w]), goldenWeights: [40, 40, 20], assumed: true },
        // 洛洛的定制品: 8 items with measured weights (路标月报#2「卡池相关机制」item 6 — 10维式重锤2战栗2坚固2加速2灼燃
        // 1有限加速器4护盾无人机4激光发射器; the pool is a subset of the shared equipment pool, so the four shop-sold
        // entries go through the item stock). Supersedes the 4-special-hammer reading (user playtest #4, first-hand:
        // "几个特殊的维式重锤是干员洛洛或者维多利亚阵营获得的" — the special four remain exclusive to this pool and
        // 维多利亚's, they are just no longer the whole of it)
        pool_equip_rockr: { kind: 'equip', weighted: [['维式重锤', 10], ['战栗维式重锤', 2], ['坚固维式重锤', 2], ['加速维式重锤', 2], ['灼燃维式重锤', 2], ['有限加速器', 1], ['护盾无人机', 4], ['激光发射器', 4]].map(([n, w]) => [itemByName(n), w]), assumed: true },
      } : {
        // 规程's pools that name no default-season item (the pools are server-side, weights [ASSUMED·서버]); 「小概率」 is
        // read as 10 %, the default season's 佩佩 pool of the same wording (pool_equip_pepe, itself [ASSUMED])
        // 凯瑟琳 garrison_139_a 「<获得时>获得一件维式重锤，小概率获得特殊维式重锤」: the plain hammer 90, the special kinds 10 between them
        pool_equip_kathe_0: { kind: 'equip', weighted: [[itemByName('维式重锤'), 90], ...specialHammerIds(effects).map((id) => [id, 10 / specialHammerIds(effects).length])], assumed: true },
        // 凯瑟琳 garrison_139_b 「<获得时>获得一件特殊维式重锤，小概率获得终极维式重锤」: the special kinds 90 between them, 终极维式重锤 10
        pool_equip_rockr: { kind: 'equip', weighted: [...specialHammerIds(effects).map((id) => [id, 90 / specialHammerIds(effects).length]), [itemByName('终极维式重锤'), 10]], assumed: true },
        // 异客 garrison_161 「<进入休整期时>获得1件（精锐 2件）“盟约之币”或“萨尔贡浓茶”，有小概率发现“拟态物质”」: 佩佩's shape (its elite
        // 「有概率」 had other weights; 异客's elite text keeps 「小概率」, so one table)
        pool_equip_pasngr: { kind: 'equip', weighted: [['盟约之币', 45], ['萨尔贡浓茶', 45], ['拟态物质', 10]].map(([n, w]) => [itemByName(n), w]), assumed: true },
      }),
      pool_chess_glady: { kind: 'chess', items: ['斯卡蒂', '幽灵鲨', '深巡'].map(chessByName), assumed: true },
      // 10野鬃10灰毫3远牙 (路标月报#2 item 6; was an even-ish 45/45/10 guess)
      pool_char_pinus: { kind: 'chess', weighted: [['野鬃', 10], ['灰毫', 10], ['远牙', 3]].map(([n, w]) => [chessByName(n), w]), assumed: true },
      pool_char_later: { kind: 'chess', bond: 'lateranoShip', minTier: 4, golden: true, rule: 'shopEligible', assumed: true },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((t) => [`pool_chess_shop_${t}_reward`, { kind: 'chess', tier: t, rule: 'shopEligible', assumed: true }])),
    }),
  };
}

/**
 * The pools above name the default season's items and operators. Another season keeps a pool only when every entry
 * resolves there; the others are left out with a warning (that season's pools are its own work).
 */
function seasonPools(pools) {
  if (SEASON === DEFAULT_SEASON) return pools;
  const out = {};
  for (const [id, p] of Object.entries(pools)) {
    const entries = [...(p.items || []), ...(p.plus || []), ...(p.weighted || []).map((x) => x[0])];
    if (entries.some((x) => !x)) { warn(`pool ${id}: an entry is not in ${SEASON} (left out)`); continue; }
    out[id] = p;
  }
  return out;
}

// ===== config ===================================================================================

/** Fallback enemy multiplier table (research 01 Addendum A3) when 01-core-data.json is absent. */
const DEFAULT_ENEMY_MULTIPLIERS = {
  single: {
    FUNNY: { atkBase: 0.7, hpBase: 0.75, k: [0, 0, 0, 0, 0, 0, 0, 0, 0], hidden: null },
    NORMAL: { atkBase: 0.7, hpBase: 0.75, k: [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 4, 5, 5], hidden: 5 },
    HARD: { atkBase: 0.8, hpBase: 0.8, k: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4], hidden: 4 },
    ABYSS: { atkBase: 1, hpBase: 1, k: [1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 5, 5, 6, 7], hidden: 7 },
  },
  multi: {
    FUNNY: { atkBase: 0.8, hpBase: 0.8, k: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1], hidden: null },
    NORMAL: { atkBase: 0.8, hpBase: 0.8, k: [0, 1, 1, 2, 2, 2, 2, 3, 4, 4, 5, 6, 7, 7], hidden: 7 },
    HARD: { atkBase: 1, hpBase: 1, k: [1, 2, 2, 3, 3, 3, 3, 3, 4, 5, 6, 6, 7, 8], hidden: 8 },
    ABYSS: {
      atkBase: 1, hpBase: 1,
      kAtk: [1, 2, 2, 3, 3, 4, 5, 5, 5, 5, 6, 6, 7, 8], hiddenAtk: 8,
      kHp: [1, 2, 2, 3, 4, 4, 7, 8, 8, 8, 9, 10, 10, 10], hiddenHp: 10,
      hpExtra: [1, 1, 1, 1, 1, 1.08, 1, 1, 1, 1, 1, 1, 1.08, 1.08], hiddenHpExtra: 1.08,
    },
  },
  abyssMoveSpeedMulFromRound3: 1.15,
};

/**
 * Per-season changes of the round table (research 01 A3, by modeType × modeDifficulty).
 * 规程 single, provisional (maintainer decision 2026-11-14), from the enemy HP bars of one official CN match at grade 13
 * (绝境): R1 ≈ 0.79, R7 ≈ 1.20, R12 ≈ 1.39–1.52 and R13 ≈ 1.21 of the base HP (each from a known hit on an enemy not
 * hit before; the 奥术 extra arts damage counted as not landing, since no number for it showed). The 盟约 绝境 row gave
 * R7 0.96: its mid-game climb comes two rounds earlier. `pulled` moves it in every single row that has one — R5–R8
 * take the 攻坚装备 count of two rounds later, and no later round falls below — which turns the 盟约 绝境 row into
 * exactly the fitted one (k 2 at R7); 标准 (all 0) stays. 绝境 R12 adds the measured 补给线 step, and R13 takes the
 * measured dip below R12 — k 2 with the 补给线 step (1.244; maintainer decision 2026-11-15, after
 * comparing the co-op rooms; 规程's enemy effects include 攻坚装备 variants with HP −10…−25 %, data/seasons/act3autochess/effects.json).
 * [ASSUMED·서버: which enemy effects a round carries is the server's; one match of one grade measured — the other
 * rounds, ATK (it follows the same counts) and the 险境 / 终极 rows are the 盟约 rows with the same pull]
 */
const SEASON_ENEMY_MULTIPLIERS = {
  act3autochess: {
    pullSingle: true,
    single: {
      HARD: {
        k: [0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 2, 4],
        hpExtra: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.08, 1.08, 1], hiddenHpExtra: 1,
      },
    },
  },
};

/** A single row with its mid-game climb two rounds earlier: R5–R8 take the count of R7–R10, then never fall. */
function pulled(row) {
  if (!Array.isArray(row?.k)) return row;
  let top = 0;
  const k = row.k.map((v, i) => (top = Math.max(top, i >= 4 && i <= 7 ? row.k[Math.min(i + 2, row.k.length - 1)] : v)));
  return { ...row, k };
}

/** The round table of this season: the research table (or the built-in fallback) with the season's changes. */
function seasonEnemyMultipliers(base, season) {
  const over = SEASON_ENEMY_MULTIPLIERS[season];
  if (!over) return base;
  const single = {};
  for (const [d, row] of Object.entries(base.single || {})) single[d] = { ...(over.pullSingle ? pulled(row) : row), ...over.single?.[d] };
  return { ...base, single };
}

/**
 * Enemy stat multipliers {atk, hp, speed} of one round (research 01 A3; leader HP pools excluded). `supplyHp` (only
 * when ≠ 1) = the share of `hp` that comes from 补给线 / 补给线II: the HP-only steps — 1.2^(kHp − kAtk), 补给线II "最大生命值
 * +20%" with no ATK (攻坚装备 always brings ATK ×1.1, so kAtk counts its stacks) — times `extra` 1.08 (补给线). Those two
 * effects leave out the 14 器物 hit-count keys (activity_table aceffect_enemy_2 / 2_2 `enemy_exclude`, data/effects.json),
 * which take hp / supplyHp (server/sim/content/enemies/archetypes.js `times`).
 */
/**
 * The steps of the enemy effects (activity_table effectInfoDataDict / effectBuffInfoDataDict, data/effects.json): 攻坚装备
 * (aceffect_enemy_3) ATK and HP, 补给线II (aceffect_enemy_2_2) HP, 补给线 (aceffect_enemy_2) HP, 急行军 (aceffect_enemy_1)
 * speed. 盟约: 1.1 / 1.2 / 1.2 / 1.08 / +0.15; 规程 gives 1.11 / 1.2 / 1.3 / 1.08 / +0.3 under the same ids.
 * [ASSUMED·서버] 规程's rounds take the 盟约 per-round step counts (research 01 A3, by modeType × modeDifficulty; the
 * single rows moved to official play, SEASON_ENEMY_MULTIPLIERS) with these steps: which enemy effects a round carries
 * is the server's, and 规程's 34 new ENEMY effects (攻坚装备XIII–LVII,
 * 补给线VI–VIII, some with attack speed +5 / +10) are named by no client table (modeDataDict has eventIds and the
 * 模拟强度 text only), so they stay unused (docs/rules/sim.md 「규정 적·보스」 라운드 적 효과).
 */
function enemySteps(effects) {
  const bb = (id, k, d) => {
    const v = (effects[id]?.buffs || []).map((b) => b.bb?.[k]).find((x) => typeof x === 'number');
    return typeof v === 'number' ? v : d;
  };
  return {
    atk: bb('aceffect_enemy_3', 'atk', 1.1), hp: bb('aceffect_enemy_3', 'max_hp', 1.2), supply: bb('aceffect_enemy_2_2', 'max_hp', 1.2),
    extra: bb('aceffect_enemy_2', 'max_hp', 1.08), speed: 1 + bb('aceffect_enemy_1', 'move_speed', 0.15),
  };
}

function enemyScaleFor(table, type, difficulty, round, isHidden, steps = enemySteps({})) {
  const t = table?.[type === 'SINGLE' ? 'single' : 'multi']?.[difficulty];
  if (!t) return { atk: 1, hp: 1, speed: 1, assumed: true };
  const i = round - 1;
  const pick = (arr, hidden) => (isHidden ? (hidden ?? arr?.[arr.length - 1] ?? 0) : (arr?.[Math.min(i, (arr?.length || 1) - 1)] ?? 0));
  const kAtk = t.kAtk ? pick(t.kAtk, t.hiddenAtk) : pick(t.k, t.hidden);
  const kHp = t.kHp ? pick(t.kHp, t.hiddenHp) : pick(t.k, t.hidden);
  // the table marks a 补给线 round with its 1.08; the season's step stands for it
  const marked = t.hpExtra ? (isHidden ? t.hiddenHpExtra ?? 1 : t.hpExtra[Math.min(i, t.hpExtra.length - 1)] ?? 1) : 1;
  const extra = marked === 1 ? 1 : steps.extra;
  const speedMul = difficulty === 'ABYSS' && round >= 3 ? (SEASON === DEFAULT_SEASON ? table.abyssMoveSpeedMulFromRound3 ?? steps.speed : steps.speed) : 1;
  const supplyHp = cleanNum(steps.supply ** Math.max(0, kHp - kAtk) * extra);
  // 攻坚装备 brings its HP step kAtk times and 补给线II its own the rest (盟约: both 1.2, one power of kHp)
  const hpMul = steps.hp === steps.supply ? steps.hp ** kHp : steps.hp ** kAtk * steps.supply ** Math.max(0, kHp - kAtk);
  return {
    atk: cleanNum(t.atkBase * steps.atk ** kAtk), hp: cleanNum(t.hpBase * hpMul * extra), speed: speedMul, kAtk, kHp,
    ...(supplyHp !== 1 ? { supplyHp } : {}),
  };
}

/**
 * A mode's description without its unlock clause: 规程 opens a difficulty with a grade (「解锁时可开放至【规程等级7】」),
 * and this server opens every mode (maintainer decision 2026-11-08: no unlocks), so the clause would promise what
 * nothing does. A description that is only the clause becomes null. 盟约's descriptions have none.
 * @param {string|null|undefined} desc
 */
function modeDescNoUnlock(desc) {
  if (typeof desc !== 'string') return desc ?? null;
  const out = desc.replace(/[，,]?\s*解锁时可开放至【[^】]*】/g, '').trim();
  return out || null;
}

/**
 * The bond ban counts { core, addon } per difficulty in a season (no table field: the official server draws them).
 * 盟约: FUNNY 0 / 1, NORMAL up 3 / 4. 规程 (act3autochess): NORMAL up 5 / 5 (maintainer decision 2026-11-13, from official
 * play; co-op 险境 / 绝境 / 终极 5 of 10 core and 5 of 16 add-ons in official recordings BV11NW869ELq parts 5 and 10 and
 * all 15 briefings of BV13LWM6BEvY, solo 规程等级20 5 of 16 add-ons in BV12ZWP6pE7m); FUNNY (co-op 标准, 规程等级 1–4)
 * and FAST (极速模拟) 0 / 2 — co-op 标准 greys 0 of 8 core and 2 of 10 add-ons in two matches of BV11NW869ELq (parts 3, 4),
 * solo 规程等级1 2 of 10 (BV1fnWn6QEf9), 极速模拟 2 of 10 (BV1MyWn6TEBq). 规程等级 2–4 and 6–19 follow their
 * difficulty [ASSUMED·자료 없음: no recording of those grades].
 * @param {string} season
 */
function seasonBans(season) {
  if (season === 'act3autochess') {
    const n = { core: 5, addon: 5 };
    return { FUNNY: { core: 0, addon: 2 }, FAST: { core: 0, addon: 2 }, NORMAL: { ...n }, HARD: { ...n }, ABYSS: { ...n } };
  }
  const n = { core: 3, addon: 4 };
  return { FUNNY: { core: 0, addon: 1 }, NORMAL: { ...n }, HARD: { ...n }, ABYSS: { ...n } };
}

/**
 * Build data/config.json: modes (rounds, timers, shop, enemy scaling), economy, bans, timers,
 * titles, tips, broadcasts, trophies and other global tunables.
 */
function buildConfig(ctx, waves, stages, bands, chess, items) {
  const { act, ac } = ctx;
  // Shared-pool copies (路标月报#2, 路标档案馆, bilibili BV1eLXXBqEgF, 2026-03-29; GitHub #430, upstream PR #477 / 6bfc0827):
  // the 独立模拟 (solo) table per base chess, by tier 12/14/18/16/8/5, with the per-operator exceptions below; a 同盟模拟
  // (co-op) match has coopPoolMultiplier × the solo value, every tier and exception (Ⅰ 20/24, Ⅱ 16/24/28, Ⅲ 36, Ⅳ 32,
  // Ⅴ 16, Ⅵ 10). The former 缪尔赛思 4 came from a season-1 (盟约 上半) video and is gone: this season's table lists
  // every Ⅵ at 5. Concurrent stock, not a limit on appearances or purchases. Names → the normal chess of that name.
  // Another season keeps the tier table without these exceptions [ASSUMED·자료 없음: no recording of its pool yet].
  const stockExceptions = SEASON === DEFAULT_SEASON;
  const poolStock = Object.fromEntries(Object.entries(stockExceptions ? { 普罗旺斯: 10, 德克萨斯: 10, 跃跃: 10, 古米: 10, 格雷伊: 10,
    风丸: 8, 赫默: 12, 休谟斯: 12, 砾: 12, 蒂比: 12, 调香师: 12 } : {}).map(([name, n]) => {
    const rec = Object.values(chess).find((c) => !c.isGolden && c.visible && c.name === name);
    if (!rec) throw new Error(`pool stock: no visible normal chess named ${name}`);
    return [rec.chessId, n];
  }));
  // Shared shop-equipment stock (the same video, ~1:30; GitHub #466; upstream 6bfc0827): per normal item by tier
  // 4/6/7/8/7/3 with the exceptions below, the same in solo and co-op (server/match/pool.js SharedItemPool). 商业包装方案
  // at 2 is the #466 "at most 2 per match" report: two owned at once, a third after one leaves ownership.
  const itemStock = Object.fromEntries(Object.entries(stockExceptions ? { 简易通讯机: 5, 蜂鸣器: 6, 防暴盾: 6, 浓缩嗅盐: 6,
    寻呼模块: 7, 伪装服: 7, 拉特兰桥夹: 7, 商业包装方案: 2 } : {}).map(([name, n]) => {
    const rec = Object.values(items).find((it) => !it.isGolden && it.itemType === 'EQUIP' && it.name === name);
    if (!rec) throw new Error(`item stock: no normal equipment named ${name}`);
    return [rec.id, n];
  }));
  // the official automatic strategy: 华法琳 (band_bldsk, the first by sortId); another season's first by sortId
  // [ASSUMED·화면: 规程's automatic pick not seen yet]
  const defaultBand = SEASON === DEFAULT_SEASON ? 'band_bldsk'
    : Object.values(bands).sort((a, b) => (a.sortId ?? 99) - (b.sortId ?? 99) || naturalCmp(a.bandId, b.bandId))[0]?.bandId ?? null;
  const addendum = ctx.research.core?._criticAddendum || {};
  const multipliers = seasonEnemyMultipliers(addendum.enemyStatMultipliers || DEFAULT_ENEMY_MULTIPLIERS, SEASON);
  if (!addendum.enemyStatMultipliers) warn('config: using built-in enemy multiplier table (research 01 _criticAddendum missing)');
  const incomeCap = addendum.incomePerRound?.CAP ?? 12;
  const DIFF_KEYS = { FUNNY: 'bloodPoint', NORMAL: 'bloodPointNormal', HARD: 'bloodPointHard', ABYSS: 'bloodPointAbyss' };

  const modes = {};
  const enemyStep = enemySteps(ctx.effects ?? {});
  for (const modeId of Object.keys(act.modeDataDict)) {
    const m = act.modeDataDict[modeId];
    const battle = act.battleDataDict[modeId] || {};
    const turns = ac.turnInfoDataDict?.[modeId] || {};
    const roundNums = Object.keys(battle).map(Number).sort((a, b) => a - b);
    const type = m.modeType;
    const rounds = {};
    const enemyScale = {};
    const combatTimeLimit = {};
    let lastRound = 0, bossRound = null, hiddenRound = null;
    for (const r of roundNums) {
      const entries = battle[String(r)];
      const turn = turns[String(r)] || {};
      const isBoss = entries.some((e) => e.bossId) || !!turn.isBossTurn;
      const bossTemplates = {};
      for (const e of entries) if (e.bossId) bossTemplates[e.bossId] = templateIdOf(e.levelId);
      const isHidden = isBoss && Object.keys(bossTemplates).some((b) => act.bossInfoDict[b]?.isHidingBoss);
      const template = isBoss ? null : templateIdOf(entries[0].levelId);
      if (!isBoss && entries.length > 1) warn(`mode ${modeId} round ${r}: ${entries.length} templates for a non-boss round`);
      const tplId = template || Object.values(bossTemplates)[0];
      const multi = type === 'MULTI';
      rounds[r] = {
        template, bossTemplates: isBoss ? bossTemplates : null,
        combatTimeLimit: isBoss ? null : (waves[template]?.maxPlayTime ?? null),
        levelMaxPlayTime: waves[tplId]?.maxPlayTime ?? null,
        prepTime: multi || type === 'LOCAL' ? turn.normalPhaseTime ?? null : null,
        prepTimeData: turn.normalPhaseTime ?? null,
        isSpPrepare: entries.some((e) => e.isSpPrepare), isBoss, isHidden,
        bossOvertimeAfter: isBoss ? turn.bossTurnHpReduceTime || 150 : null,
      };
      enemyScale[r] = enemyScaleFor(multipliers, type, m.modeDifficulty, r, isHidden, enemyStep);
      combatTimeLimit[r] = rounds[r].combatTimeLimit;
      if (isHidden) hiddenRound = r; else { lastRound = r; if (isBoss) bossRound = r; }
    }
    const shopLv = act.shopLevelDataDict[modeId] || {};
    const levels = Object.keys(shopLv).map(Number).sort((a, b) => a - b);
    modes[modeId] = {
      modeId, name: m.name, code: m.code, sortId: m.sortId, type, difficulty: m.modeDifficulty,
      inScope: type === 'SINGLE' || type === 'MULTI',
      color: `#${String(m.modeColor || '').replace(/^#/, '')}`, iconId: m.modeIconId, backgroundId: m.backgroundId || null,
      // the battle loading screen's picture (UIBattleLoading: AC-1 yellow … AC-4 red), the web manifest's ui `loading/<id>`
      loadingPic: m.loadingPicId ? String(m.loadingPicId).toLowerCase() : null,
      desc: modeDescNoUnlock(m.desc), effectDescList: m.effectDescList || [], unlockText: m.unlockText || null,
      specialPhaseTime: m.specialPhaseTime,
      activeBondIds: m.activeBondIdList || [], inactiveBondIds: m.inactiveBondIdList || [], inactiveEnemyKeys: m.inactiveEnemyKey || [],
      lastRound, bossRound, hiddenRound,
      rounds, spRounds: roundNums.filter((r) => rounds[r].isSpPrepare),
      combatTimeLimit, enemyScale,
      // the pool rule's numbers live in the global bossHpScale below (one place restores the fixed pool); a key set here
      // would override it for this mode (match/gamedata.js bossPoolShareOf)
      bossHpScale: { bloodPointKey: DIFF_KEYS[m.modeDifficulty] || null, unaffectedByEnemyScale: true },
      upgradePrices: levels.slice(0, -1).map((l) => shopLv[l].initialUpgradePrice),
      maxShopLevel: levels.length ? levels[levels.length - 1] : 6,
      shopSlots: Object.fromEntries(levels.map((l) => [l, { chess: shopLv[l].charChessCount, item: shopLv[l].itemCount }])),
      levelTagColors: Object.fromEntries(levels.map((l) => [l, shopLv[l].levelTagBgColor])),
      stages: Object.values(stages).filter((s) => s.active && s.modes.includes(modeId)).map((s) => s.id),
      bossWeights: Object.fromEntries(Object.values(rounds).filter((x) => x.isBoss && !x.isHidden).flatMap((x) => Object.keys(x.bossTemplates)).map((b) => [b, act.bossInfoDict[b].weight])),
      hiddenBossWeights: Object.fromEntries(Object.values(rounds).filter((x) => x.isHidden).flatMap((x) => Object.keys(x.bossTemplates)).map((b) => [b, act.bossInfoDict[b].weight])),
    };
  }

  const priceTable = act.shopCharChessInfoData || {};
  const chessPrice = {}, chessSell = {}, chessStatus = {};
  for (const [tier, rows] of Object.entries(priceTable)) {
    const n = rows.find((x) => !x.isGolden) || {}, g = rows.find((x) => x.isGolden) || {};
    chessPrice[tier] = { normal: n.purchasePrice, golden: g.purchasePrice };
    chessSell[tier] = { normal: n.chessSoldPrice, golden: g.chessSoldPrice };
    chessStatus[tier] = {
      normal: { phase: phaseIdx(n.evolvePhase), level: n.charLevel, skillLevel: n.skillLevel, equipLevel: n.equipLevel, eliteIconId: n.eliteIconId },
      golden: { phase: phaseIdx(g.evolvePhase), level: g.charLevel, skillLevel: g.skillLevel, equipLevel: g.equipLevel, eliteIconId: g.eliteIconId },
    };
  }
  const titleRules = {
    comment_1: { stat: 'bossDamage', rule: 'max', onlyOnWin: true, text: '对敌方领袖造成伤害最高（仅胜利时）' },
    comment_2: { stat: 'activatedLayers', rule: 'max', text: '激活的盟约层数总和最高' },
    comment_3: { stat: 'lpRemaining', rule: 'max', text: '目标生命值损失最少' },
    comment_4: { stat: 'merges', rule: 'max', text: '晋升精锐次数最多' },
    comment_5: { stat: 'itemsEquipped', rule: 'max', text: '装备配发数量最多' },
    comment_6: { stat: 'fundsSpent', rule: 'max', text: '消耗资金最多' },
  };
  const trophies = ctx.research.core?.trophiesPerClear;
  const steps = Array.isArray(ac.enterStepList) ? ac.enterStepList : Object.values(ac.enterStepList || {});
  const step = (t) => steps.find((x) => x.stepType === t);
  return {
    season: SEASON,
    // the current season keeps its name as written; another one takes the activity table's (shared/seasons.js)
    seasonName: SEASON === DEFAULT_SEASON ? '卫戍协议：盟约' : ctx.seasonTitle ?? SEASON,
    modes,
    economy: {
      income: Array.from({ length: 16 }, (_, r) => (r === 0 ? 0 : Math.min(3 + r, incomeCap))),
      incomeFormula: `min(3 + round, ${incomeCap})`, incomeCap, incomeCapAlternative: 10, incomeAssumedAfterRound: 3,
      leftoverFundsLost: true, leftoverFundsKeptByBands: ac.constData?.noMoneyTipsBand || ['band_cannot'],
      chessPrice, chessSell, chessStatus,
      refreshPrice: act.constData.shopRefreshPrice,
      freeze: { scope: 'allUnsoldSlots', price: 0, consumedAtRoundStart: true, refreshWhileFrozenRerollsAll: true, rewardOfferFreezable: false },
      shopClearedAtCombatStart: 'unfrozenSlots',
      itemSellable: false, itemDestroyRefund: 0,
      benchSize: act.constData.maxDeckChessCnt, tempSize: 5, deployCap: act.constData.maxBattleChessCnt,
      // 规程's 装备区 (none before it): the five temp tiles became equipment-only (map tile_acbag; PlayerState bagMode)
      ...(act.constData.maxDeckEquipmentChessCnt > 0 ? { equipHandSize: act.constData.maxDeckEquipmentChessCnt } : {}),
      storeCntMax: act.constData.storeCntMax,
      equipPerChess: 2, maxArtsPerRound: 2,
      poolCopies: { 1: 12, 2: 14, 3: 18, 4: 16, 5: 8, 6: 5 },
      poolCopiesOverrides: poolStock,
      coopPoolMultiplier: 2,
      itemPoolCopies: { 1: 4, 2: 6, 3: 7, 4: 8, 5: 7, 6: 3 },
      itemPoolCopiesOverrides: itemStock,
      goldenCopies: 3,
      mergeCount: 3,
      mergeCountOverrides: Object.fromEntries(Object.entries(act.charChessDataDict).filter(([, c]) => !c.isGolden && c.upgradeNum && c.upgradeNum !== 3).map(([id, c]) => [id, c.upgradeNum])),
      itemMergeCount: 2,
      rewardOffer: { count: 3, tierOffset: 1, maxTier: 6, price: 0, refreshable: false, freezable: false, expiresAtRoundEnd: true },
      handFillOrder: 'rightToLeft',
      shopOdds: { model: 'copyWeighted', note: 'each slot draws 1 copy uniformly from remaining pool copies of unbanned visible chess with tier <= shop level; items: same tier shares, then uniform within tier [ASSUMED]' },
      borrowCount: act.constData.borrowCount,
      // 确定自选编队 (规程): how many of the player's 自选编队 each tier brings into a match ({ 5: 2, 6: 2 }); absent when the
      // season has none (盟约: every pick plays). The step itself is enterStepList's CUSTOM_CHECK (timers.enterSteps)
      ...(act.constData.diyCharLimitForLevels ? { diyCharLimitForLevels: act.constData.diyCharLimitForLevels } : {}),
      fallbackBondId: act.constData.fallbackBondId,
      defaultBandId: defaultBand, defaultStartLp: bands[defaultBand]?.totalHp ?? 28,
    },
    lpCapPerRound: act.constData.costPlayerHpLimit ?? 10,
    bossOvertimeAfter: 150, bossOvertimeDrainPerSec: 1,
    // DESIGN §25.13.4: the owner's decision of 2026-10-06 adopts PR #209 by @qingjingshenghuo — bloodPoint is one player's
    // share; it replaces the fixed pool of 「保持固定血量」 (perPlayer false + solo 0.25 restore it)
    bossHpScale: {
      formula: 'one pool for every boss field ("所有人将一起对敌方领袖造成伤害"; the mirrored copies of a pair field share it, "两侧的敌方领袖共享生命值（敌方领袖的总生命值不变）") = bloodPoint[difficulty] × share. perPlayer true (the owner\'s decision of 2026-10-06, PR #209): co-op share = coop × the players alive when the fight starts (bots and AI 托管 seats count, eliminated and departed seats do not), at most aliveFull; solo share = solo (1). perPlayer false (the fixed pool of 0.1.x, 「保持固定血量」): co-op share = coop whatever the count (× alive / aliveFull with aliveScaling, the alive / 4 proportion [ASSUMED]: 巴哈姆特 12294); solo was 0.25 [ASSUMED]',
      perPlayer: true, coop: 1, solo: 1, aliveFull: 4, aliveScaling: false, aliveAssumed: true, unaffectedByEnemyScale: true,
    },
    hiddenCore: { single: 350, multi: 1200, minTeamLpExclusive: 1, difficulties: ['NORMAL', 'HARD', 'ABYSS'], checkedAfterRound: 14 },
    dp: { init: 10, perSec: 1, max: 99 },
    unite: { maxHelpers: 2, helperOrder: 'unitsOnField>activeBond>undownedUnits; pair: unitsOnField>activeBond>activeLayers>undownedUnits, first = right field (PRTS 帮助)', layerGainsEnabled: false, keepsHpSpPositions: true, leakedEnemyFullHp: true,
      templates: { 1: templateIdOf(act.constData.escapedBattleTemplateMapSinglePlayer), 2: templateIdOf(act.constData.escapedBattleTemplateMapMultiPlayer) } },
    finalAssault: { pairing: 'seatOrderPairs', oddPlayerAlone: true, movableBossPerAlivePlayerSide: true, layerGainsEnabled: false },
    // the 8-player co-op mode (a remake feature, maintainer decisions 2026-10-16 and 2026-10-19; no official data — every
    // value [ASSUMED], chosen so one player's share matches the 4-player co-op): server/match/gamedata.js reads it for a
    // match of `seats` players, every other key of this file stays the 4-player value. These are the values at 8 players;
    // a match that starts with 5–7 takes each linearly between the 4-player value and this one (GameData.largeAt;
    // maintainer decision 2026-11-01)
    eightPlayer: {
      seats: 8,
      // shop pool: the solo table × 4 (4 players: × 2) — the same copies per player and the same odds of one operator
      coopPoolMultiplier: 4,
      // item stock: the table × 2 (4 players: × 1)
      itemPoolMultiplier: 2,
      // bonds drawn absent: no key, so the 4-player bans of each difficulty — the doubled pool keeps every bond's odds
      // (maintainer decision 2026-10-22; was 1 core / 2 add-on from NORMAL up). An eightPlayer `bans` would replace them.
      // boss overtime: 2 team LP per real second (4 players: 1) — twice the team LP drains in the same time
      bossOvertimeDrainPerSec: 2,
      // 隐秘核心: Σ activated layers > 2400, fixed (4 players: 1200; maintainer decision 2026-10-19)
      hiddenCoreMulti: 2400,
      // leader HP: bloodPoint × the players alive, up to 8 (4 players: 4)
      aliveFull: 8,
      // 机变 cards per draft: 12 (4 players: 6)
      spDraftCards: 12,
      // 联防: up to 4 helpers; 3–4 play a wide field, a half per helper (3: the 1-helper half + the 2-helper field, 4: the
      // 2-helper field twice), for the round's time limit × 0.5 per half (the path's length: × 1.5, × 2; maintainer
      // decision 2026-10-19); 1–2 helpers: the 4-player fields
      unite: { maxHelpers: 4, wideFrom: 3, wideTimePerHalf: 0.5 },
    },
    timers: {
      infoCheck: step('INFO_CHECK')?.time ?? 25, infoCheckHint: step('INFO_CHECK')?.hintTime ?? 5,
      // bandTurn: one turn of the co-op strategy draft = its only countdown (server/match/Match.js BAND_TURN_SECONDS):
      // 50 s per turn — upstream owner's official-play report 2026-10-10 (upstream 708caf7d), the same as the official
      // whole step's 50 s (bandDraft, kept for reference)
      bandDraft: step('BAND_CHECK')?.time ?? 50, bandDraftHint: step('BAND_CHECK')?.hintTime ?? 15, bandTurn: 50,
      battleCheck: step('BATTLE_CHECK')?.time ?? 3,
      spFirst: 30, spTurn: act.modeDataDict.mode_multi_normal?.specialPhaseTime ?? 16,
      soloPrepTimeData: 300, soloSpTimeData: act.modeDataDict.mode_single_normal?.specialPhaseTime ?? 150,
      chatCd: ac.constData?.chatCD ?? 1, chatBubble: ac.constData?.chatTime ?? 3, broadcastDelay: ac.constData?.broadcastBeginDelay ?? 1,
      enterSteps: (Array.isArray(ac.enterStepList) ? ac.enterStepList : Object.values(ac.enterStepList || {})).map((s) => ({ step: s.stepType, time: s.time, hint: s.hintTime, title: s.title })),
    },
    // the bonds drawn absent per match are no table field (a server rule): seasonBans
    bans: { ...seasonBans(SEASON), TRAINING: { core: 0, addon: 0 },
      rule: 'banned iff every bond of a visible non-DIY chess is in (drawn set D ∪ mode.inactiveBondIds); core = isCore bonds, addon = other bonds with weight > 0; uniform draw' },
    bandDraft: { skipsPerPlayer: 1, order: 'random', duplicatesAllowed: true, timeoutBandId: defaultBand },
    titles: Object.values(act.playerTitleDataDict || {}).map((t) => ({ id: t.id, picId: t.picId, name: t.txt, ...(titleRules[t.id] || {}) })),
    titleRule: 'each player gets at most one title; each title is used at most once per match; assign by the category where the player ranks best relative to teammates [ASSUMED]',
    tips: (Array.isArray(ac.gameTipsList) ? ac.gameTipsList : Object.values(ac.gameTipsList || {})).map((t) => ({ tip: String(t.tip).trim(), weight: t.weight })),
    broadcasts: (Array.isArray(ac.broadcastList) ? ac.broadcastList : Object.values(ac.broadcastList || {})).map((b) => ({
      id: b.id, type: b.type, priority: b.priority, text: stripRich(b.desc), textRaw: b.desc, params: b.paramList || [],
    })),
    trophies: {
      byRoundsPassed: [
        { maxRound: 4, FUNNY: 0, NORMAL: 0, HARD: 0, ABYSS: 0 },
        { maxRound: 8, FUNNY: 1, NORMAL: 1, HARD: 1, ABYSS: 1 },
        { maxRound: 11, FUNNY: 2, NORMAL: 2, HARD: 2, ABYSS: 2 },
        { maxRound: 13, FUNNY: 2, NORMAL: 3, HARD: 3, ABYSS: 3 },
        { maxRound: 14, FUNNY: 3, NORMAL: 4, HARD: 5, ABYSS: 6 },
      ],
      hiddenCore: { FUNNY: null, NORMAL: 5, HARD: 7, ABYSS: 8 },
      multiOnly: true, source: trophies ? 'research 01-core-data trophiesPerClear' : 'built-in',
      medals: (Array.isArray(ac.medalDataList) ? ac.medalDataList : Object.values(ac.medalDataList || {})).map((m) => ({ count: m.medalCount, iconId: m.medalIconId })),
    },
    roundScores: (Array.isArray(ac.roundScoreDataList) ? ac.roundScoreDataList : Object.values(ac.roundScoreDataList || {})).map((r) => ({ round: r.round, score: r.score })),
    rewards: {
      itemId: (Array.isArray(act.baseRewardDataList) ? act.baseRewardDataList : Object.values(act.baseRewardDataList || {}))[0]?.item?.id || null,
      baseByRoundsPassed: (Array.isArray(act.baseRewardDataList) ? act.baseRewardDataList : Object.values(act.baseRewardDataList || {})).map((r) => ({ round: r.round, count: r.item?.count ?? 0, dailyPoint: r.dailyMissionPoint ?? 0 })),
      formula: 'baseByRoundsPassed[roundsPassed].count * difficultyFactor[difficulty] * modeFactor[type]',
      difficultyFactor: act.difficultyFactorInfo, modeFactor: act.modeFactorInfo,
      // the 功勋 levels: the 卫戍认证 earned in all, level by level (milestoneList tokenNum, cumulative)
      milestones: (Array.isArray(act.milestoneList) ? act.milestoneList : Object.values(act.milestoneList || {}))
        .map((m) => ({ level: m.milestoneLvl, tokens: m.tokenNum })).sort((a, b) => a.level - b.level),
      daily: dailyMission(act.constData),
    },
    constants: {
      maxLevelCnt: ac.constData?.maxLevelCnt ?? 15, bossTrailerStartRound: ac.constData?.bossTrailerStartRound ?? 3,
      singleReconnectTime: ac.constData?.singleReconnectTime ?? 86400, trainingModeId: act.constData.trainingModeId || null,
      discountColor: ac.constData?.discountColor || '#59f4ca', premiumColor: ac.constData?.premiumColor || '#ff5454', normalColor: ac.constData?.normalColor || '#ffc600',
      pingConds: (ac.constData?.pingConds || []).map((p) => ({ minMs: p.cond, textRaw: p.txt })),
      // 规程's avatar badges (absent from a season whose table has none — the page and the server show none then):
      // the 完美连胜 count's two badge steps, the boss-damage share's three glow steps (the BOSS_HIT broadcasts' 20 / 50 /
      // 80 %), the boss-damage list's row styles by percent (styleStatusId bg_1…) and its delay after the boss fight starts
      ...avatarBadgeConstants(ac),
    },
  };
}

/**
 * The avatar badge constants of a season's autoChessData (constData.playerAvatarWinStreakThresholds,
 * playerAvatarBossDamageThresholds, bossDamageStatsShowDelayTime; bossDamageStatsStyleList) — only those its table has.
 * @param {any} ac
 */
function avatarBadgeConstants(ac) {
  const c = ac.constData || {};
  const nums = (v) => (Array.isArray(v) && v.length && v.every((x) => Number.isFinite(x)) ? v.slice() : null);
  const out = {};
  const streak = nums(c.playerAvatarWinStreakThresholds);
  if (streak) out.winStreakThresholds = streak;
  const boss = nums(c.playerAvatarBossDamageThresholds);
  if (boss) out.bossDamageThresholds = boss;
  const styles = Array.isArray(ac.bossDamageStatsStyleList) ? ac.bossDamageStatsStyleList : Object.values(ac.bossDamageStatsStyleList || {});
  const rows = nums(styles.map((s) => s && s.damageThreshold));
  if (rows) out.bossDamageRowThresholds = rows;
  if (Number.isFinite(c.bossDamageStatsShowDelayTime)) out.bossDamageStatsDelay = c.bossDamageStatsShowDelayTime;
  return out;
}

// ===== potential (0.2.2) =========================================================================

/** Keys of the talent lists whose entries chain their lower-rank values (shared/potential.js talentAtRank). */
const POTENTIAL_TALENT_LISTS = new Set(['talents', 'talentsBase', 'talentChanges']);
const isPlainObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A talent entry built at ranks 0 … `hi` (`vals[r]`) as one chained entry: the rank-`hi` entry, with `potMin` (the
 * lowest rank that builds the same entry) and `potBelow` (the entry below it — only the fields it changes, `desc` /
 * `descRaw` / `bb` …, chained the same way) when a lower rank builds another one: the candidates by
 * `requiredPotentialRank`.
 */
function chainTalent(vals, hi) {
  const node = vals[hi];
  let m = hi;
  while (m > 0 && isDeepStrictEqual(vals[m - 1], node)) m--;
  if (m === 0) return node;
  const below = chainTalent(vals, m - 1);
  const part = {};
  for (const [k, v] of Object.entries(below)) if (k === 'potMin' || k === 'potBelow' || !isDeepStrictEqual(v, node[k])) part[k] = v;
  return { ...node, potMin: m, potBelow: part };
}

/**
 * The full-rank value `vals[FULL_RANK]` annotated with what the lower ranks change: talent lists chain their entries
 * (chainTalent), every other differing leaf — or a value whose shape changes — records its exact value at each rank where
 * it differs from the rank above in `potDown[rank][dotted.path]`.
 */
function annotatePotential(vals, path, potDown, label) {
  const full = vals[FULL_RANK];
  if (vals.every((v) => isDeepStrictEqual(v, full))) return full;
  const key = path[path.length - 1];
  if (POTENTIAL_TALENT_LISTS.has(key) && vals.every((v) => Array.isArray(v) && v.length === full.length)) {
    return full.map((_, i) => chainTalent(vals.map((v) => v[i]), FULL_RANK));
  }
  if (isPlainObj(full) && vals.every((v) => isPlainObj(v) && isDeepStrictEqual(Object.keys(v), Object.keys(full)))) {
    const o = {};
    for (const k of Object.keys(full)) o[k] = annotatePotential(vals.map((v) => v[k]), [...path, k], potDown, label);
    return o;
  }
  if (Array.isArray(full) && vals.every((v) => Array.isArray(v) && v.length === full.length)) {
    return full.map((_, i) => annotatePotential(vals.map((v) => v[i]), [...path, i], potDown, label));
  }
  if (!path.length || path.some((k) => String(k).includes('.'))) {
    warn(`${label}: a potential-dependent value at "${path.join('/')}" cannot be written as a potDown path`);
    return full;
  }
  for (let r = FULL_RANK - 1; r >= 0; r--) {
    if (!isDeepStrictEqual(vals[r], vals[r + 1])) (potDown[r] ||= {})[path.join('.')] = vals[r];
  }
  return full;
}

/**
 * One record / form / variant built at every rank (`vals[r]`, r = 0 … FULL_RANK) as its full-rank build annotated for
 * the lower ranks (annotatePotential; `potDown` last, only when something differs), checked: shared/potential.js
 * atRank must rebuild every rank exactly (an error otherwise).
 * @returns {object} the annotated full-rank value
 */
function withPotentialData(vals, label, errors) {
  const potDown = {};
  const out = annotatePotential(vals, [], potDown, label);
  const res = Object.keys(potDown).length && isPlainObj(out) ? { ...out, potDown } : out;
  for (let r = 0; r <= FULL_RANK; r++) {
    if (!isDeepStrictEqual(stripPotential(atRank(res, r)), stripPotential(vals[r]))) errors.push(`potential ${label}: shared/potential.js atRank does not rebuild rank ${r}`);
  }
  return res;
}

/**
 * Annotate the full-potential build with every lower rank (docs/DATA.md §2.3): each chess record, each backups.json unit
 * form and each token variant (data/tokens.json and backups.json `tokens`: the owner's potential — a record's top-level
 * defaults stay the first owner's full-potential ones). `passes[r]` = { chess, backups, tokens } built at rank r.
 * @returns {string[]} errors (an atRank mismatch, a record missing at a rank)
 */
function attachPotential(passes) {
  const errors = [];
  const full = passes[FULL_RANK];
  for (const id of Object.keys(full.chess)) {
    const vals = passes.map((p) => p.chess[id]);
    if (vals.some((v) => !v)) { errors.push(`potential chess ${id}: missing at a rank`); continue; }
    full.chess[id] = withPotentialData(vals, `chess ${id}`, errors);
  }
  for (const [charId, unit] of Object.entries(full.backups.units)) {
    for (const key of Object.keys(unit.forms)) {
      const vals = passes.map((p) => p.backups.units[charId]?.forms?.[key]);
      if (vals.some((v) => !v)) { errors.push(`potential unit ${charId}@${key}: missing at a rank`); continue; }
      unit.forms[key] = withPotentialData(vals, `unit ${charId}@${key}`, errors);
    }
  }
  for (const [file, pick] of [['tokens', (p) => p.tokens], ['backups tokens', (p) => p.backups.tokens]]) {
    for (const [tokenId, rec] of Object.entries(pick(full))) {
      for (const owner of Object.keys(rec.variants || {})) {
        const vals = passes.map((p) => pick(p)[tokenId]?.variants?.[owner]);
        if (vals.some((v) => !v)) { errors.push(`potential ${file} ${tokenId}@${owner}: missing at a rank`); continue; }
        rec.variants[owner] = withPotentialData(vals, `${file} ${tokenId}@${owner}`, errors);
      }
    }
  }
  return errors;
}

// ===== validation ===============================================================================

/** Recursively find non-finite numbers (NaN/Infinity would silently become null in JSON). */
function findNonFinite(obj, path, out) {
  if (typeof obj === 'number') { if (!Number.isFinite(obj)) out.push(path); return; }
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach((v, i) => findNonFinite(v, `${path}[${i}]`, out)); return; }
  for (const [k, v] of Object.entries(obj)) findNonFinite(v, `${path}.${k}`, out);
}

/** Each season's bond, strategy and visible (shop) chess counts, as its activity section lists them. */
const SEASON_COUNTS = {
  act2autochess: { bonds: 23, bands: 40, visible: 112 },
  act3autochess: { bonds: 26, bands: 61, visible: 141 },
};

/**
 * Cross-file referential integrity checks. Returns a list of error strings (empty = OK).
 * The same invariants are asserted by test/data.test.js.
 */
function validateAll(f) {
  const errors = [];
  const err = (m) => errors.push(m);
  const { config, chess, bonds, garrisons, items, bands, effects, choices, enemies, factions, waves, stages, bosses, tokens, backups } = f;
  for (const [name, obj] of Object.entries(f)) {
    const bad = [];
    findNonFinite(obj, name, bad);
    bad.slice(0, 5).forEach((p) => err(`non-finite number at ${p}`));
  }
  const visible = Object.values(chess).filter((c) => !c.isGolden && c.visible);
  const want = SEASON_COUNTS[SEASON];
  if (!want) err(`no expected counts for season ${SEASON} (SEASON_COUNTS)`);
  else {
    if (Object.keys(bonds).length !== want.bonds) err(`expected ${want.bonds} bonds, got ${Object.keys(bonds).length}`);
    if (Object.keys(bands).length !== want.bands) err(`expected ${want.bands} bands, got ${Object.keys(bands).length}`);
    if (visible.length !== want.visible) err(`expected ${want.visible} visible non-DIY chess, got ${visible.length}`);
  }
  for (const c of Object.values(chess)) {
    if (!chess[c.baseId]) err(`chess ${c.chessId}: baseId missing`);
    if (c.goldenId && !chess[c.goldenId]) err(`chess ${c.chessId}: goldenId missing`);
    for (const b of c.bonds) if (!bonds[b]) err(`chess ${c.chessId}: bond ${b} missing`);
    for (const g of c.garrisonIds) if (!garrisons[g]) err(`chess ${c.chessId}: garrison ${g} missing`);
    for (const t of c.tokens) if (!tokens[t]) err(`chess ${c.chessId}: token ${t} missing`);
    for (const t of c.talents || []) if (t.tokenKey && !c.tokens.includes(t.tokenKey)) err(`chess ${c.chessId}: talent token ${t.tokenKey} not in tokens`);
    if (c.isDiy) continue;
    if (!c.stats) err(`chess ${c.chessId}: no stats`);
    if (!c.skill) err(`chess ${c.chessId}: no resolvable skill`);
    if (!Array.isArray(c.rangeGrid)) err(`chess ${c.chessId}: no range grid`);
    // DESIGN §16 loadout choices
    if (!Array.isArray(c.skills) || c.skills.filter((s) => s.isDefault).length !== 1 || c.skills.find((s) => s.isDefault)?.skillId !== c.skill?.skillId) err(`chess ${c.chessId}: skills[] without exactly one default = skill`);
    if (c.modules && (c.modules.filter((m) => m.isDefault).length !== (c.module?.active ? 1 : 0) || !c.statsBase || !c.traitBase || !c.talentsBase)) err(`chess ${c.chessId}: inconsistent module choices`);
    // 高台 legality is read from the trait text at place time (shared/highGround.js), never a field on the record
    if (c.placement !== undefined) err(`chess ${c.chessId}: placement is not a data field`);
  }
  // the official 重装 row everywhere (maintainer decision 2026-10-28): every MANUAL skill whose row is TAKE_DAMAGE keeps it
  for (const c of Object.values(chess)) {
    for (const s of c.skills || []) if (s.trigger?.rawRule === 'TAKE_DAMAGE' && s.trigger.rule !== 'TAKE_DAMAGE') err(`chess ${c.chessId} ${s.skillId}: TAKE_DAMAGE row played as ${s.trigger.rule}`);
  }
  // the client's basic strategy (resolveTrigger): a MANUAL DEFAULT skill with a rangeId checks exactly those cells
  for (const c of Object.values(chess)) {
    for (const s of c.skills || []) {
      if (s.trigger?.rule === 'ACTIVE_RANGE') err(`chess ${c.chessId} ${s.skillId}: ACTIVE_RANGE is no data rule since 2026-10-11`);
      if (s.skillType === 'MANUAL' && s.trigger?.rule === 'DEFAULT' && s.rangeGrid?.length && JSON.stringify(s.trigger.customRangeGrid) !== JSON.stringify(s.rangeGrid)) {
        err(`chess ${c.chessId} ${s.skillId}: a MANUAL DEFAULT skill with a rangeId checks that range (customRangeGrid)`);
      }
    }
  }
  // 补位 / 自选 (data/backups.json, DATA.md §18): a PRESET chess is its own backup; every NORMAL chess (both forms)
  // composes into its stand-in (shared/standIn.js standInRecord) with the chess's skill and module; every DIY slot is a
  // DIY chess and every prototype pick of its tier has a form for both slot statuses; derived bonds exist
  if (backups) {
    for (const c of Object.values(chess)) {
      const b = c.backup;
      if (c.chessType === 'PRESET' && b?.charId !== c.charId) err(`chess ${c.chessId}: a PRESET chess's backup must be itself`);
      if (c.chessType === 'DIY' && b?.charId !== null) err(`chess ${c.chessId}: a DIY slot has no backup`);
      if (c.chessType !== 'NORMAL') continue;
      const r = standInRecord(c, backups);
      if (!r) { err(`chess ${c.chessId}: no stand-in ${b?.charId}@${statusKey(c.status)} in backups.json`); continue; }
      if (!r.stats || !Array.isArray(r.rangeGrid) || !r.trait) err(`chess ${c.chessId}: stand-in ${b.charId} without stats / range / trait`);
      if (r.skill?.index !== b.skillIndex || r.skills.filter((s) => s.isDefault).length !== 1) err(`chess ${c.chessId}: stand-in skill ${b.skillIndex} is not unlocked at ${statusKey(c.status)}`);
      if (b.uniEquipId && c.status.equipLevel > 0 && !r.module?.active) err(`chess ${c.chessId}: stand-in module ${b.uniEquipId} has no level ${c.status.equipLevel}`);
      if (r.tokens.length) err(`chess ${c.chessId}: stand-in ${b.charId} summons ${r.tokens.join(', ')} (no tokens.json variant)`);
    }
    for (const [id, s] of Object.entries(backups.diy.slots)) {
      const slot = chess[id], golden = chess[s.goldenId];
      if (!slot?.isDiy || slot.isGolden || slot.tier !== s.tier || !golden?.isDiy) { err(`DIY slot ${id}: not a DIY chess pair of tier ${s.tier}`); continue; }
      for (const p of backups.diy.prototypes[s.tier] || []) {
        for (const rec of [slot, golden]) if (!unitForm(backups, p, rec.status)) err(`DIY slot ${rec.chessId}: prototype ${p} has no form ${statusKey(rec.status)}`);
        // the locked selection exists at both slot forms (the module at the elite's stage)
        const lk = backups.diy.locked?.[s.tier]?.[p];
        if (!lk) { err(`DIY slot ${id}: prototype ${p} has no locked selection`); continue; }
        for (const rec of [slot, golden]) {
          const f = unitForm(backups, p, rec.status);
          if (f && !f.skills.some((x) => x.index === lk.skillIndex)) err(`DIY slot ${rec.chessId}: prototype ${p} has no skill ${lk.skillIndex} at ${statusKey(rec.status)}`);
          if (f && lk.uniEquipId && rec.status.equipLevel > 0 && !f.modules.some((m) => m.uniEquipId === lk.uniEquipId)) err(`DIY slot ${rec.chessId}: prototype ${p} has no module ${lk.uniEquipId} at ${statusKey(rec.status)}`);
        }
      }
      // every owned pick: a form at both slot statuses with every skill, and at the elite every module of the character
      for (const p of backups.diy.ownedPool) {
        const u = backups.units[p];
        for (const rec of [slot, golden]) {
          const f = unitForm(backups, p, rec.status);
          if (!f) { err(`DIY slot ${rec.chessId}: owned pick ${p} has no form ${statusKey(rec.status)}`); continue; }
          if (f.skills.length !== 3) err(`DIY slot ${rec.chessId}: owned pick ${p} has ${f.skills.length} skills at ${statusKey(rec.status)}`);
          const ids = Object.keys(u.moduleNames).filter((m) => u.moduleNames[m].typeName !== 'ORIGINAL');
          if (rec.status.equipLevel > 0 && JSON.stringify(f.modules.map((m) => m.uniEquipId)) !== JSON.stringify(ids)) err(`DIY slot ${rec.chessId}: owned pick ${p} modules ${f.modules.map((m) => m.uniEquipId)} ≠ ${ids}`);
          for (const t of f.tokens) if (!backups.tokens?.[t]?.variants?.[`${p}@${statusKey(rec.status)}`]) err(`DIY pick ${p}@${statusKey(rec.status)}: summon ${t} has no variant in backups.json tokens`);
        }
      }
    }
    for (const [id, o] of Object.entries(backups.diy.operators)) for (const b of o.bonds) if (!bonds[b]) err(`DIY pick ${id}: bond ${b} missing`);
    for (const id of Object.keys(backups.tokens || {})) if (tokens[id]) err(`backups.json token ${id} is also a tokens.json record`);
    // the official 重装 row on every unit form too (stand-ins and 自选 重装)
    for (const [charId, u] of Object.entries(backups.units)) {
      for (const f of Object.values(u.forms || {})) for (const s of f.skills || []) if (s.trigger?.rawRule === 'TAKE_DAMAGE' && s.trigger.rule !== 'TAKE_DAMAGE') err(`unit ${charId}@${statusKey(f.status)} ${s.skillId}: TAKE_DAMAGE row played as ${s.trigger.rule}`);
    }
  }
  for (const b of Object.values(bonds)) {
    for (const m of b.members) if (!chess[m]) err(`bond ${b.bondId}: member ${m} missing`);
    if (!b.thresholds.length) err(`bond ${b.bondId}: no thresholds`);
    if (!effects[b.effectId]) err(`bond ${b.bondId}: effect ${b.effectId} missing`);
  }
  for (const it of Object.values(items)) {
    if (!effects[it.effectId]) err(`item ${it.id}: effect missing`);
    if (it.goldenId && !items[it.goldenId]) err(`item ${it.id}: golden missing`);
    if (it.giveBondId && !bonds[it.giveBondId]) err(`item ${it.id}: giveBond ${it.giveBondId} missing`);
    if (it.fuseWith && !items[it.fuseWith]) err(`item ${it.id}: fuseWith ${it.fuseWith} missing`);
    if (it.fuseResult && !items[it.fuseResult]) err(`item ${it.id}: fuseResult ${it.fuseResult} missing`);
    if (it.requiresBondId && !bonds[it.requiresBondId]) err(`item ${it.id}: requiresBond ${it.requiresBondId} missing`);
  }
  for (const b of Object.values(bands)) if (!effects[b.effectId]) err(`band ${b.bandId}: effect missing`);
  for (const b of Object.values(bands)) for (const id of b.bondIds || []) if (!bonds[id]) err(`band ${b.bandId}: bond ${id} missing`);
  for (const b of Object.values(bands)) {
    if (!b.skills) continue;
    if (b.skills[0]?.effectId !== b.effectId) err(`band ${b.bandId}: its first skill stage is not its effect ${b.effectId}`);
    for (const s of b.skills) if (!effects[s.effectId]) err(`band ${b.bandId}: skill effect ${s.effectId} missing`);
    if (b.skills.at(-1)?.next) err(`band ${b.bandId}: its last skill stage unlocks ${b.skills.at(-1).next.effectId}`);
    for (const id of b.relateBondIds || []) if (!bonds[id]) err(`band ${b.bandId}: related bond ${id} missing`);
  }
  for (const w of Object.values(waves)) {
    for (const sp of w.spawns) {
      if (sp.action) continue;
      if (!enemies[sp.key]) err(`wave ${w.id}: enemy ${sp.key} missing`);
      if (!w.routes[sp.routeIndex]) err(`wave ${w.id}: route ${sp.routeIndex} missing`);
    }
    for (const [bn, phases] of Object.entries(w.branches)) for (const sp of phases.flat()) {
      if (sp.action) continue;
      if (!enemies[sp.key]) err(`wave ${w.id} branch ${bn}: enemy ${sp.key} missing`);
      if (!w.extraRoutes[sp.routeIndex]) err(`wave ${w.id} branch ${bn}: extraRoute ${sp.routeIndex} missing`);
    }
    for (const k of Object.keys(w.overrides)) if (!enemies[k]) err(`wave ${w.id}: override for unknown enemy ${k}`);
  }
  for (const s of Object.values(stages)) {
    // every season's stages are in the 19×21 frame (规程's put there by tools/level-fields.mjs)
    if (s.rows.length !== 19 || s.rows.some((r) => r.length !== 21)) err(`stage ${s.id}: not 19x21`);
    if (s.rows.some((r) => r.includes('?'))) err(`stage ${s.id}: unknown tile glyph`);
    if (s.name !== s.id && /[A-Za-z]/.test(s.name)) err(`stage ${s.id}: Latin text in player-facing name "${s.name}"`);
  }
  // the escaped level of 1 / 2 helpers (config.unite.templates) has its map record (kind 'unite'; no field uses it)
  for (const [n, id] of Object.entries(config.unite.templates)) {
    if (stages[id]?.kind !== 'unite' || stages[id].helpers !== Number(n) || stages[id].active) err(`unite template ${id}: no inactive 联防 stage for ${n} helper(s)`);
  }
  for (const m of Object.values(config.modes)) {
    for (const [r, rd] of Object.entries(m.rounds)) {
      const tpls = rd.template ? [rd.template] : Object.values(rd.bossTemplates || {});
      if (!tpls.length) err(`mode ${m.modeId} round ${r}: no template`);
      for (const t of tpls) if (!waves[t]) err(`mode ${m.modeId} round ${r}: template ${t} missing`);
    }
    for (const s of m.stages) if (!stages[s]) err(`mode ${m.modeId}: stage ${s} missing`);
    for (const b of [...m.activeBondIds, ...m.inactiveBondIds]) if (!bonds[b]) err(`mode ${m.modeId}: bond ${b} missing`);
  }
  for (const b of Object.values(bosses)) if (!enemies[b.enemyKey]) err(`boss ${b.bossId}: enemy missing`);
  for (const e of Object.values(factions.entries)) {
    for (const k of [e.key, ...e.N.map((x) => x.key), ...e.E.map((x) => x.key)]) if (!enemies[k]) err(`faction ${e.key}: enemy ${k} missing`);
  }
  for (const card of choices.cards.bounty) for (const a of card.adds) if (a.enemyKey && !enemies[a.enemyKey]) err(`bounty ${card.effectId}: enemy ${a.enemyKey} missing`);
  for (const [pid, p] of Object.entries(choices.pools)) {
    for (const id of [...(p.items || []), ...(p.weighted || []).map((x) => x[0])]) if (!id || !(items[id] || chess[id])) err(`pool ${pid}: unresolved entry ${id}`);
  }
  if (SEASON === DEFAULT_SEASON) for (const id of Object.keys(SHOP_EXCLUDED_ITEMS)) if (!items[id] || items[id].itemType !== 'EQUIP' || items[id].isGolden) err(`SHOP_EXCLUDED_ITEMS: ${id} is not a normal EQUIP item`);
  for (const [id, fl] of Object.entries(TOKEN_ABNORMAL)) {
    // the list is the default season's tokens; another season need not field them all
    if (!tokens[id]) { if (SEASON === DEFAULT_SEASON) err(`TOKEN_ABNORMAL: ${id} is not a token`); continue; }
    for (const f of fl) if (f !== 'healFree' && f !== 'isolated') err(`TOKEN_ABNORMAL: ${id}: unknown effect ${f}`);
  }
  for (const [id, pos] of Object.entries(TOKEN_POSITION_CORRECTIONS)) {
    const t = tokens[id] ?? backups?.tokens?.[id];
    if (!t || t.kind !== 'summon') err(`TOKEN_POSITION_CORRECTIONS: ${id} is not a summon`);
    else if (t.position !== pos || !['MELEE', 'RANGED', 'ALL'].includes(pos)) err(`TOKEN_POSITION_CORRECTIONS: ${id}: position ${t.position}`);
  }
  for (const t of Object.values(tokens)) {
    if (!t.stats) err(`token ${t.tokenId}: no stats`);
    for (const [o, v] of Object.entries(t.variants || {})) if (!Array.isArray(v.sources) || !v.sources.length) err(`token ${t.tokenId}@${o}: no sources`);
  }
  for (const e of Object.values(enemies)) {
    const s = e.stats;
    // DESIGN §5.5 contract: rangeRadius > 0 ⇔ attacks units it is not blocked by (never for MELEE).
    if (!(s.rangeRadius >= 0) || (e.applyWay === 'MELEE' && s.rangeRadius !== 0)) err(`enemy ${e.key}: rangeRadius ${s.rangeRadius} (${e.applyWay})`);
    // bat 0 would mean "attack every tick"; aspd 0 is official only for a few skill-driven leaders.
    if (!(s.maxHp > 0) || !(s.bat > 0) || !(s.aspd >= 0) || !(s.moveSpeed >= 0) || !(s.lpr >= 0)) err(`enemy ${e.key}: bad core stats ${JSON.stringify({ maxHp: s.maxHp, bat: s.bat, aspd: s.aspd, moveSpeed: s.moveSpeed, lpr: s.lpr })}`);
  }
  return errors;
}

// ===== main =====================================================================================

/** The default season's data/<name>.json holds exactly `text` (another season then keeps no copy of it). */
function sameAsDefault(name, text) {
  try { return readFileSync(join(ROOT, 'data', `${name}.json`), 'utf8') === text; } catch { return false; }
}

/**
 * Another season reuses the default season's item and 特质 ids for other content (activity_table: 91 item ids, 90 with
 * other content; 244 特质 ids, all different), while the code that names an item or a 特质 (items/battle.js and
 * items/meta.js handlers, a few 特质 checks) was written for the default season's. Each item and 特质 record of another
 * season gets `handlerKey`: the default season's key of the same thing — an item by its trap (`trapId`, one key per trap
 * in both seasons), a 特质 by its effect (`effectKey`, `bb`, `bbStr` but its own id) — or `<season>:<own key>` when the
 * default season has none, which no handler names. server/sim/content/support itemKeyOf / garrisonKeyOf read it.
 */
function attachHandlerKeys(items, garrisons) {
  const read = (name) => JSON.parse(readFileSync(join(ROOT, 'data', `${name}.json`), 'utf8'));
  const bare = (id) => String(id).replace(/_[ab]$/, '');
  const keyByTrap = new Map();
  for (const r of Object.values(read('items'))) if (r.trapId) keyByTrap.set(r.trapId, bare(r.id));
  for (const r of Object.values(items)) r.handlerKey = keyByTrap.get(r.trapId) ?? `${SEASON}:${bare(r.id)}`;
  const sig = (g) => JSON.stringify([g.effectKey, g.bb, Object.fromEntries(Object.entries(g.bbStr || {}).filter(([k]) => k !== 'garrison_key'))]);
  const keyBySig = new Map();
  for (const g of Object.values(read('garrisons'))) keyBySig.set(sig(g), keyBySig.has(sig(g)) ? null : g.garrisonId);
  for (const g of Object.values(garrisons)) g.handlerKey = keyBySig.get(sig(g)) ?? `${SEASON}:${g.garrisonId}`;
}

async function main() {
  const t0 = Date.now();
  const ctx = await loadContext();
  log('building…');
  // one pass of the operator builders per potential rank (潜能 1–6, ctx.potRank): the full-potential pass is the data,
  // annotated below with what every lower rank changes (attachPotential)
  const passes = [];
  for (let r = 0; r <= FULL_RANK; r++) {
    const pctx = { ...ctx, potRank: r };
    const built = buildChess(pctx);
    passes.push({ ctx: pctx, chess: built.chess, tokenOwners: built.tokenOwners, backups: buildBackups(pctx, built.chess) });
  }
  const { chess, backups } = passes[FULL_RANK];
  const effects = buildEffects(ctx);
  const bonds = buildBonds(ctx, chess, effects);
  const garrisons = buildGarrisons(ctx, chess);
  const items = buildItems(ctx, effects);
  if (SEASON !== DEFAULT_SEASON) attachHandlerKeys(items, garrisons);
  const bands = buildBands(ctx, effects);
  const enemies = buildEnemies(ctx);
  for (const p of passes) p.tokens = buildTokens(p.ctx, p.chess, p.tokenOwners, enemies);
  const tokens = passes[FULL_RANK].tokens;
  const waves = buildWaves(ctx, enemies);
  const stages = buildStages(ctx, ctx.act.modeDataDict);
  const factions = buildFactions(ctx, enemies);
  const bosses = buildBosses(ctx, enemies, waves);
  const choices = buildChoices(ctx, effects, items, chess);
  // the bonds each strategy is built around (DESIGN §21.26): the bot skips, and the strategy draft marks 本局禁用, a band
  // whose bond the mode switches off
  // (规程: a BONDRELEVANT strategy's relateBondList joins them — its texts name the bond in 【…】, not <…>)
  for (const b of Object.values(bands)) b.bondIds = bandBondIds(b, { bonds, pools: choices.pools });
  const config = buildConfig({ ...ctx, effects }, waves, stages, bands, chess, items);
  const files = { config, chess, bonds, garrisons, items, bands, effects, choices, enemies, factions, waves, stages, bosses, tokens, backups };

  // the unit forms rebuild every PRESET chess at every rank (before the annotation: each pass as built)
  const errors = [...validateAll(files), ...passes.flatMap((p) => checkUnitFormParity(p.ctx, p.chess).map((e) => `${e} (potential rank ${p.ctx.potRank})`))];
  errors.push(...attachPotential(passes));
  let total = 0;
  const sizes = {};
  const texts = {};
  for (const [name, obj] of Object.entries(files)) {
    texts[name] = JSON.stringify(obj);
    sizes[name] = Buffer.byteLength(texts[name]);
    total += sizes[name];
  }
  if (total > 6 * 1024 * 1024) errors.push(`total data size ${total} exceeds 6 MB`);
  // Integrity errors keep the previous (valid) output untouched unless --force.
  const write = !errors.length || OPTS.force;
  if (write) {
    await mkdir(OPTS.out, { recursive: true });
    for (const [name, text] of Object.entries(texts)) {
      // Atomic per file: a crash mid-write never leaves a truncated JSON behind.
      const dest = join(OPTS.out, `${name}.json`);
      // another season keeps only its own files: one equal to the default season's is the default's (shared/seasons.js)
      if (SEASON !== DEFAULT_SEASON && sameAsDefault(name, text)) { await rm(dest, { force: true }); continue; }
      const tmp = `${dest}.tmp-${process.pid}`;
      await writeFile(tmp, text);
      await rename(tmp, dest);
    }
  }
  const report = {
    counts: {
      chess: Object.keys(chess).length,
      visibleChess: Object.values(chess).filter((c) => !c.isGolden && c.visible).length,
      bonds: Object.keys(bonds).length, garrisons: Object.keys(garrisons).length, items: Object.keys(items).length,
      bands: Object.keys(bands).length, effects: Object.keys(effects).length, enemies: Object.keys(enemies).length,
      waves: Object.keys(waves).length, stages: Object.keys(stages).length, bosses: Object.keys(bosses).length,
      tokens: Object.keys(tokens).length, factionEntries: Object.keys(factions.entries).length,
      backupUnits: Object.keys(backups.units).length,
      backupForms: Object.values(backups.units).reduce((n, u) => n + Object.keys(u.forms).length, 0),
      backupTokens: Object.keys(backups.tokens).length,
      diyOwnedPicks: backups.diy.ownedPool.length,
    },
    sizes, totalBytes: total, out: OPTS.out, written: write, warnings, errors,
  };
  await mkdir(dirname(OPTS.report), { recursive: true });
  await writeFile(OPTS.report, JSON.stringify(report, null, 2));

  if (write) log(`wrote ${Object.keys(files).length} files to ${OPTS.out} (${(total / 1024 / 1024).toFixed(2)} MB) in ${Date.now() - t0} ms`);
  else console.error(`integrity errors: ${OPTS.out} left unchanged (re-run with --force to write anyway)`);
  log(Object.entries(report.counts).map(([k, v]) => `${k}=${v}`).join(' '));
  if (warnings.length) {
    log(`${warnings.length} warning(s):`);
    for (const w of warnings) log(`  - ${w}`);
  }
  if (errors.length) {
    console.error(`${errors.length} error(s):`);
    for (const e of errors) console.error(`  x ${e}`);
    process.exitCode = 1;
  }
}

// local patch: run only as a script; tools/i18n/build-ko-diy.mjs imports the builders below (the 선발 picks' Korean)
export { loadContext, buildChess, buildBackups, buildTokens, warnings as buildWarnings };
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main().catch((e) => {
  console.error('build-data failed:', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
