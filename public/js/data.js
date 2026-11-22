// Lazy loader + cache for the generated game data served at /data/*.json.
//
// Files are fetched on first use and cached for the page's lifetime (the Promise is shared, so concurrent callers
// trigger a single request): every text of the game (operators, skills, bonds, items, enemies …) is static data loaded
// once — nothing is fetched from the server during a match. main.js warms the in-match files (gameComponents
// GAME_FILES) in the background once the player is in a room, and the match screen waits for them, so no text of the
// match UI ever appears late. A transient failure (network error, HTTP 5xx) is retried twice (RETRY_DELAYS_MS); files
// that stay unavailable (404, repeated failures, bad JSON) resolve to `null` and are reported once on the console — the
// UI must degrade gracefully while data is being generated. The emote manifests (`local`, `assets`) are the exception:
// one attempt is abandoned after ART_MANIFEST_TIMEOUT_MS (GitHub #99) and reported `missing` at once, so the 交流 button
// draws its glyph instead of staying blank; a later retry that succeeds replaces the glyph. Other files stay `loading`
// across their retries.
//
// Each file is indexed tolerantly so the getters work whether a file is
//   - an array of records carrying an id field (id / chessId / bondId / itemId / …),
//   - an object map { id: record },
//   - or either of those wrapped as { <name>: … } / { list: … } / { data: … }.
// Synchronous getters (getChess, getBond, …) return null until the file has loaded; use
// `loadData(...)` to await, or the `useData(...)` hook to re-render when files arrive.
//
// Language (docs/I18N.md): the files hold the official Chinese texts. `setLocale(lang, chain)` downloads (once each) the
// game-text overlays data/i18n/<code>.json of the chain — the language's own, its base's, a fallback's (ui/lang.js
// passes the languages of the pack's chain that have one; default: the language alone) — built by tools/build-i18n.mjs
// (the official texts by record id and field, shared/i18nData.js). From then on `get`, `lookup` and `list` — and every
// getter built on them — return the records with their texts in that language (a copy per file, built on first use):
// each text from the first overlay of the chain that has it, else the Chinese one. `setLocale('zh')` goes back. Each
// switch notifies the subscribers of every loaded file, so `useData` components re-render. `localeName(zh)` maps a
// Chinese game-data name to the current language (server messages name operators / items in Chinese).

import { useEffect, useReducer } from '../vendor/hooks.module.js';
import { applyFileOverlay } from '../../shared/i18nData.js';
import { canonicalLang } from '../../shared/i18nPacks.js';
import { DEFAULT_SEASON, seasonOf } from '../../shared/seasons.js';
import { BORROW_FILES, borrowSeasons, borrowPlan, borrowFile, borrowKey } from '../../shared/seasonBorrow.js';
import { CUSTOM_FIRST_HALF_STAGES } from '../../shared/ruleset.js';
import { withSeasonArt, withLentTypeIcons } from './ui/assetUrls.js';

/** Known data files (name → URL basename). Unknown names are allowed too (`/data/<name>.json`). */
export const DATA_FILES = Object.freeze({
  chess: 'chess.json',
  bonds: 'bonds.json',
  items: 'items.json',
  bands: 'bands.json',
  enemies: 'enemies.json',
  bosses: 'bosses.json',
  stages: 'stages.json',
  tokens: 'tokens.json',
  choices: 'choices.json',
  config: 'config.json',
  assets: 'assets.json',
  // 补位 stand-ins (DATA.md §18): the bodies the 干员持有 screen, the cards and the detail card compose (shared/standIn.js)
  backups: 'backups.json',
  // 名片干员: the seat card operators of every season (shared/cardOperators.js, ui/seatArt.js cardOperators)
  cards: 'cards.json',
  // Optional art extracted from a local game client (DESIGN §13): { groups: { '<subdir>': { name: { path, w, h } } } }.
  // The emotes and the 玩法说明 pages are in data/assets.json too (downloaded from the mirror): artUrls().
  local: 'local-assets.json',
});

const BORROW_SET = new Set(BORROW_FILES);
const ID_KEYS = ['id', 'chessId', 'bondId', 'itemId', 'bandId', 'enemyKey', 'enemyId', 'stageId', 'bossId', 'tokenId', 'choiceId', 'key'];
const WRAPPER_KEYS = ['list', 'data', 'records', 'entries'];

function idOf(rec) {
  if (!rec || typeof rec !== 'object') return null;
  for (const k of ID_KEYS) {
    const v = rec[k];
    if ((typeof v === 'string' && v) || Number.isFinite(v)) return String(v);
  }
  return null;
}

/**
 * Build an id → record Map from a data file's JSON, tolerating the shapes listed in the header.
 * @param {string} name file name (used to unwrap `{ [name]: … }`)
 * @param {any} json
 * @returns {Map<string, any>}
 */
export function buildIndex(name, json) {
  const map = new Map();
  let src = json;
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    for (const k of [name, ...WRAPPER_KEYS]) {
      const inner = src[k];
      if (inner && typeof inner === 'object') { src = inner; break; }
    }
  }
  if (Array.isArray(src)) {
    for (const rec of src) {
      const id = idOf(rec);
      if (id != null && !map.has(id)) map.set(id, rec);
    }
  } else if (src && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === 'object') map.set(k, v);
    }
  }
  return map;
}

/** Waits (ms) before retrying a data file whose download failed transiently (network error, HTTP 5xx / 408 / 429). */
export const RETRY_DELAYS_MS = Object.freeze([600, 2000]);

/**
 * How long one attempt at an emote manifest (`local`, `assets`) may hang before it counts as a failure.
 * [ASSUMED] 8 s: long enough for a slow link, short enough that the 交流 button does not stay blank for the session
 * (GitHub #99). Other files are not on this clock.
 */
export const ART_MANIFEST_TIMEOUT_MS = 8000;

/** Manifests the emote button waits on. A hang here used to leave every cell blank (GitHub #99). */
const ART_MANIFESTS = new Set(['local', 'assets']);
/** What a later season's view of data/assets.json is built from (createDataStore seasonAssets). */
const SEASON_ART_INPUTS = new Set(['local', 'bands', 'bonds']);

/**
 * A failed load worth retrying: the request itself failed (network error) or the server answered 5xx / 408 / 429 — not a
 * definite 4xx (the file is not there) nor a delivered file that is not valid JSON (`badJson`).
 */
const transientFailure = (err) => {
  if (!err || err.badJson) return false;
  const s = err.status;
  return !(Number.isInteger(s) && s >= 400 && s < 500 && s !== 408 && s !== 429);
};

/**
 * Create a data store bound to a fetch implementation (injectable for tests).
 * A file is downloaded once per page (the texts of the game are static data, never fetched again during a match —
 * user playtest #3 item 9); a transient failure is retried (RETRY_DELAYS_MS) while the file stays 'loading', so a
 * network hiccup does not leave the texts of a whole session missing. `local` and `assets` are reported `missing` on
 * the first failure or timeout (the emote glyph) and stay that way through a retry; a later success is `ready`.
 * @param {{ fetch?: typeof fetch, base?: string, retryDelays?: number[], wait?: (ms: number) => Promise<void>, timeoutMs?: number, setTimeout?: typeof setTimeout, clearTimeout?: typeof clearTimeout, peer?: boolean }} [opts]
 *   `peer`: another season's store inside one (seasonStore), which has none of its own.
 *   `timeoutMs` 0 turns the art-manifest clock off. `setTimeout` / `clearTimeout` let a test fire that clock.
 */
export function createDataStore(opts = {}) {
  const base = opts.base ?? '/data/';
  const doFetch = opts.fetch || ((...a) => globalThis.fetch(...a));
  const retryDelays = Array.isArray(opts.retryDelays) ? opts.retryDelays : RETRY_DELAYS_MS;
  const wait = opts.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = opts.timeoutMs === undefined ? ART_MANIFEST_TIMEOUT_MS : Number(opts.timeoutMs);
  const armTimer = opts.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const disarmTimer = opts.clearTimeout || ((id) => clearTimeout(id));
  /** @type {Map<string, { status: 'loading'|'ready'|'missing', promise: Promise<any>, value: any, index: Map<string, any>|null }>} */
  const entries = new Map();
  const listeners = new Set();
  const warned = new Set();
  /** Current locale ('zh' = the files as they are) and the downloaded overlays by language (shared/i18nData.js). */
  let locale = 'zh';
  /** The languages whose overlays apply, best first (a subset of the chain setLocale got: those that downloaded). */
  let chain = [];
  /** setLocale calls so far: a slower earlier call never overrides a later one. */
  let switches = 0;
  /** @type {Map<string, Promise<any>>} */
  const overlayLoads = new Map();
  /** @type {Map<string, any>} */
  const overlays = new Map();
  /** `<lang>@<season>` → that season's own overlay (null: none), loaded only while the season's files are read */
  const seasonOverlays = new Map();
  /** @type {Map<string, Promise<any>>} */
  const seasonOverlayLoads = new Map();
  /** The URL of each language's overlay as the last setLocale got it (its season files sit beside it). */
  const overlayUrls = new Map();
  /** name → { lang, value, index } localized copy of a ready file (dropped on every switch / reload of the file) */
  const localized = new Map();
  /** The 卫戍协议 season whose files are read (shared/seasons.js; setSeason): the default's are /data/<file>. */
  let season = DEFAULT_SEASON;
  /** The last setSeason's work (resolves once its files have settled; seasonSettled). */
  let seasonWork = Promise.resolve();
  /**
   * What the room's custom ruleset borrows from other seasons (setBorrow; shared/seasonBorrow.js): its stages /
   * enemies / factions read with the borrowed records, as the server's match reads them. Null = nothing.
   * @type {{ stages: string[], types: string[] } | null}
   */
  let borrowIds = null;
  /** The last setBorrow's work (its peers' files settled). */
  let borrowWork = Promise.resolve();
  /** season → a store of that season's files (seasonStore: the borrowed records, the custom dialog's lists) */
  const peers = new Map();
  /** The last setLocale's arguments, for a peer created later. */
  let localeArgs = null;

  const tell = (name) => {
    for (const fn of [...listeners]) {
      try { fn(name); } catch (err) { console.error('[data] listener failed', err); }
    }
  };
  // a later season's art manifest is built from the extract and the season's band / bond records (seasonAssets):
  // their arrival changes it
  const notify = (name) => {
    tell(name);
    if (SEASON_ART_INPUTS.has(name) && season !== DEFAULT_SEASON) tell('assets');
  };

  /** @type {{ m: any, local: any, bands: any, bonds: any, season: string, value: any } | null} */
  let seasonArtMemo = null;
  /**
   * data/assets.json as the season on screen reads it: a later season's own icons over 盟约's (ui/assetUrls.js
   * withSeasonArt), built once per input; the file itself for the default season.
   */
  function ownSeasonAssets() {
    const m = entries.get('assets')?.value ?? null;
    if (season === DEFAULT_SEASON || !m) return m;
    const local = entries.get('local')?.value ?? null;
    const bands = entries.get('bands')?.value ?? null;
    const bonds = entries.get('bonds')?.value ?? null;
    const c = seasonArtMemo;
    if (c && c.m === m && c.local === local && c.bands === bands && c.bonds === bonds && c.season === season) return c.value;
    const recs = (name) => {
      const e = entries.get(name);
      if (!e || e.status !== 'ready') return [];
      if (!e.index) e.index = buildIndex(name, e.value);
      return [...e.index.values()];
    };
    const value = withSeasonArt(m, local, season, { bands: recs('bands'), bonds: recs('bonds') });
    seasonArtMemo = { m, local, bands, bonds, season, value };
    return value;
  }
  /** @type {{ m: any, local: any, key: string, value: any } | null} */
  let lentArtMemo = null;
  /** ownSeasonAssets with the icons of the 特训敌人 types the room borrows (their season's extract: withLentTypeIcons). */
  function seasonAssets() {
    const m = ownSeasonAssets();
    if (!borrowIds || !m) return m;
    const types = Object.values(viewOf('factions')?.types || {}).filter((ty) => ty && ty.borrowed).map((ty) => [ty.borrowed, ty.icon]);
    if (!types.length) return m;
    const local = entries.get('local')?.value ?? null;
    const key = types.map((x) => x.join('@')).join(',');
    const c = lentArtMemo;
    if (c && c.m === m && c.local === local && c.key === key) return c.value;
    const value = withLentTypeIcons(m, local, types);
    lentArtMemo = { m, local, key, value };
    return value;
  }

  // another season's files: /data/s/<season>/<file> (the server answers the season's own file, else the default's);
  // the art manifests are the same for every season
  const urlFor = (name) => base + (season !== DEFAULT_SEASON && !ART_MANIFESTS.has(name) ? `s/${season}/` : '') + (DATA_FILES[name] || `${name}.json`);

  /**
   * One attempt at a file. Art manifests reject with a transient `{ timeout: true }` when the clock fires; a response
   * that arrives after that is ignored (the retry is a new request). [ASSUMED]
   */
  function readJson(name) {
    const run = async () => {
      const res = await doFetch(urlFor(name), { cache: 'no-cache' });
      if (!res || !res.ok) throw Object.assign(new Error(`HTTP ${res ? res.status : '???'}`), { status: res ? res.status : null });
      try {
        return await res.json();
      } catch (err) {
        throw Object.assign(err instanceof Error ? err : new Error(String(err)), { badJson: true });
      }
    };
    if (!ART_MANIFESTS.has(name) || !(timeoutMs > 0)) return run();
    let timer = null;
    let done = false;
    const finish = () => {
      if (done) return false;
      done = true;
      if (timer != null) disarmTimer(timer);
      return true;
    };
    const timed = new Promise((_, reject) => {
      timer = armTimer(() => {
        if (!finish()) return;
        reject(Object.assign(new Error('timeout'), { timeout: true }));
      }, timeoutMs);
    });
    const req = run().then(
      (json) => { finish(); return json; },
      (err) => { finish(); throw err; },
    );
    return Promise.race([req, timed]);
  }

  function load(name) {
    if (typeof name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(name)) return Promise.resolve(null);
    const cur = entries.get(name);
    if (cur) return cur.promise;
    const entry = { status: 'loading', promise: null, value: null, index: null };
    const art = ART_MANIFESTS.has(name);
    entry.promise = (async () => {
      let toldMissing = false;
      for (let attempt = 0; ; attempt++) {
        try {
          entry.value = await readJson(name);
          entry.status = 'ready';
          break;
        } catch (err) {
          const current = entries.get(name) === entry;
          // Decided before notify. Invalidating inside that notify leaves `again` true; the wait then sees
          // the superseded entry and stops, so this attempt does not fetch again.
          const again = transientFailure(err) && attempt < retryDelays.length && current;
          // Emote art: glyph now. Stay `missing` through the retry wait — flipping back to `loading` blanks the button.
          if (art && current && entry.status !== 'missing') {
            entry.value = null;
            entry.index = null;
            entry.status = 'missing';
            toldMissing = true;
            notify(name);
          }
          if (again) {
            await wait(retryDelays[attempt]);
            if (entries.get(name) === entry) continue;
            break;
          }
          if (current) {
            if (!warned.has(name)) {
              warned.add(name);
              console.warn(`[data] ${urlFor(name)} unavailable (${err?.message || err}); continuing without it`);
            }
            entry.value = null;
            entry.index = null;
            entry.status = 'missing';
          }
          break;
        }
      }
      // A load superseded by invalidate() must not announce itself (its entry is no longer cached).
      // An art manifest already announced `missing` does not announce that same status again.
      if (entries.get(name) === entry && !(toldMissing && entry.status === 'missing')) notify(name);
      return entry.value;
    })();
    entries.set(name, entry);
    return entry.promise;
  }

  /**
   * The localized copy of a ready file (null in Chinese or without an overlay for the file): the overlays of the chain
   * applied from the last to the first, each text checked against the Chinese file, so the best overlay wins per text.
   */
  function localizedEntry(name) {
    if (locale === 'zh' || !chain.length) return null;
    const e = entries.get(name);
    if (!e || e.status !== 'ready') return null;
    // per language, best first: the season's own overlay of its records under the default's ids (data/i18n/<lang>.<season>.json,
    // tools/build-i18n.mjs seasonOverlayPath), then the language's — applied in reverse, so the season's wins
    const fileOverlays = chain.flatMap((c) => [
      season !== DEFAULT_SEASON ? seasonOverlays.get(`${c}@${season}`)?.files?.[name] : null,
      overlays.get(c)?.files?.[name],
    ]).filter(Boolean);
    if (!fileOverlays.length) return null;
    let l = localized.get(name);
    if (!l || l.lang !== locale || l.base !== e.value) {
      let value = e.value;
      for (const fo of fileOverlays.reverse()) {
        try { value = applyFileOverlay(e.value, fo, value).value; } catch (err) { console.warn(`[data] ${name}: overlay not applied`, err); }
      }
      l = { lang: locale, base: e.value, value, index: null };
      localized.set(name, l);
    }
    return l;
  }

  /**
   * Another season's store (the same base, fetch and language; its own season's files and texts), created once; it
   * tells this store's subscribers when its stages / enemies / factions arrive. Null inside a peer.
   * @param {string} id
   */
  function seasonStore(id) {
    if (opts.peer) return null;
    let st = peers.get(id);
    if (st) return st;
    st = createDataStore({ ...opts, peer: true });
    st.setSeason(id);
    if (localeArgs) st.setLocale(...localeArgs);
    st.subscribe((name) => { if (BORROW_SET.has(name)) tell(name); });
    peers.set(id, st);
    return st;
  }

  /** Fetch what borrowedView reads (the own files and the lending seasons'): borrowWork. */
  function loadBorrowed() {
    borrowWork = borrowIds
      ? Promise.all([...BORROW_FILES.map(load), ...borrowSeasons(season).map(seasonStore).filter(Boolean).flatMap((st) => BORROW_FILES.map((n) => st.load(n)))]).then(() => {}, () => {})
      : Promise.resolve();
  }

  /** name|raw → { inputs, value } — the borrowed view of a file, built again when an input changes */
  const borrowMemo = new Map();
  /** a file value → its record index (the borrowed views) */
  const viewIndex = new WeakMap();
  /**
   * A file as read with what the room's custom ruleset borrows (shared/seasonBorrow.js borrowFile; `own` itself when
   * nothing is, or while a file the plan needs has not arrived). `raw`: the Chinese texts (getRaw), else the locale's.
   * @param {string} name @param {any} own @param {boolean} raw
   */
  function borrowedView(name, own, raw) {
    if (!borrowIds || !own || !BORROW_SET.has(name)) return own;
    const seasons = borrowSeasons(season);
    const stores = seasons.map(seasonStore).filter(Boolean);
    const rawOf = (n) => entries.get(n)?.value ?? null;
    const inputs = [own, rawOf('stages'), rawOf('factions'), borrowKey(borrowIds), season,
      ...stores.flatMap((st) => [st.getRaw('stages'), st.getRaw('factions'), raw ? st.getRaw(name) : st.get(name)])];
    const key = `${name}|${raw ? 1 : 0}`;
    const memo = borrowMemo.get(key);
    if (memo && memo.inputs.length === inputs.length && memo.inputs.every((v, i) => v === inputs[i])) return memo.value;
    const plan = borrowPlan({ stages: rawOf('stages'), factions: rawOf('factions') },
      stores.map((st, i) => [seasons[i], { stages: st.getRaw('stages'), factions: st.getRaw('factions') }]), borrowIds, CUSTOM_FIRST_HALF_STAGES);
    const value = borrowFile(name, own, stores.map((st, i) => [seasons[i], raw ? st.getRaw(name) : st.get(name)]), plan);
    borrowMemo.set(key, { inputs, value });
    return value;
  }
  /** The file as get() reads it. @param {string} name */
  const viewOf = (name) => borrowedView(name, localizedEntry(name)?.value ?? entries.get(name)?.value ?? null, false);
  /** The file as getRaw() reads it. @param {string} name */
  const rawViewOf = (name) => borrowedView(name, entries.get(name)?.value ?? null, true);
  /** @param {string} name @param {any} value */
  const indexOfView = (name, value) => {
    let ix = viewIndex.get(value);
    if (!ix) { ix = buildIndex(name, value); viewIndex.set(value, ix); }
    return ix;
  };

  function index(name) {
    const e = entries.get(name);
    if (!e || e.status !== 'ready') return null;
    if (borrowIds && BORROW_SET.has(name)) return indexOfView(name, viewOf(name));
    const l = localizedEntry(name);
    if (l) {
      if (!l.index) l.index = buildIndex(name, l.value);
      return l.index;
    }
    if (!e.index) e.index = buildIndex(name, e.value);
    return e.index;
  }

  /**
   * Download (once per language) a game-text overlay — `url` (a pack folder's file, from the pack index) or the language
   * folder's data/i18n/<lang>.json; resolves to it, or null when unavailable.
   */
  function loadOverlay(lang, url = `${base}i18n/${lang}.json`) {
    if (overlayLoads.has(lang)) return overlayLoads.get(lang);
    const p = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await doFetch(url, { cache: 'no-cache' });
          if (!res || !res.ok) throw Object.assign(new Error(`HTTP ${res ? res.status : '???'}`), { status: res ? res.status : null });
          const json = await res.json();
          if (!json || typeof json !== 'object' || !json.files) throw Object.assign(new Error('not an overlay'), { badJson: true });
          overlays.set(lang, json);
          return json;
        } catch (err) {
          if (transientFailure(err) && attempt < retryDelays.length) { await wait(retryDelays[attempt]); continue; }
          console.warn(`[data] ${url} unavailable (${err?.message || err}); its game texts are not applied`);
          overlayLoads.delete(lang); // a later switch may try again
          return null;
        }
      }
    })();
    overlayLoads.set(lang, p);
    return p;
  }

  /**
   * Download (once per language and season) the season's own overlay beside the language's — data/i18n/ko.json →
   * data/i18n/ko.<season>.json (tools/build-i18n.mjs seasonOverlayPath); null when there is none (a pack without one).
   * @param {string} lang @param {string} id
   */
  function loadSeasonOverlay(lang, id) {
    const key = `${lang}@${id}`;
    if (seasonOverlayLoads.has(key)) return seasonOverlayLoads.get(key);
    const url = (overlayUrls.get(lang) || `${base}i18n/${lang}.json`).replace(/\.json(?=$|\?)/, `.${id}.json`);
    const p = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await doFetch(url, { cache: 'no-cache' });
          if (!res || !res.ok) throw Object.assign(new Error(`HTTP ${res ? res.status : '???'}`), { status: res ? res.status : null });
          const json = await res.json();
          if (!json || typeof json !== 'object' || !json.files) throw Object.assign(new Error('not an overlay'), { badJson: true });
          seasonOverlays.set(key, json);
          return json;
        } catch (err) {
          if (transientFailure(err) && attempt < retryDelays.length) { await wait(retryDelays[attempt]); continue; }
          // a 404 is the usual case for a language without season texts: keep it, ask again only after a transient failure
          if (transientFailure(err)) { console.warn(`[data] ${url} unavailable (${err?.message || err})`); seasonOverlayLoads.delete(key); }
          seasonOverlays.set(key, null);
          return null;
        }
      }
    })();
    seasonOverlayLoads.set(key, p);
    return p;
  }
  /** The season overlays of the current chain for the current season (none in the default season). */
  const loadSeasonOverlays = (codes = chain) => (season === DEFAULT_SEASON ? Promise.resolve([]) : Promise.all(codes.map((c) => loadSeasonOverlay(c, season))));

  function invalidate(name) {
    if (!entries.has(name)) return Promise.resolve(null);
    entries.delete(name);
    localized.delete(name);
    warned.delete(name);
    const p = load(name);
    notify(name); // status is 'loading' again, never a stuck 'idle'
    return p;
  }

  return {
    /** Fetch (once) and return a file's JSON, or null when missing. */
    load,
    /** Load several files; resolves when all settled. */
    loadAll: (...names) => Promise.all(names.flat().map(load)),
    /** JSON of a loaded file in the current locale (null when missing / not loaded yet). */
    get: (name) => (name === 'assets' ? seasonAssets() : viewOf(name)),
    /** The file exactly as downloaded (Chinese texts), whatever the locale (with what setBorrow borrows). */
    getRaw: (name) => rawViewOf(name),
    /** 'idle' | 'loading' | 'ready' | 'missing' */
    status: (name) => entries.get(name)?.status ?? 'idle',
    /** Record by id from a loaded file (null when unknown / not loaded). */
    lookup(name, id) {
      if (id == null) return null;
      return index(name)?.get(String(id)) ?? null;
    },
    /**
     * Record by id from a loaded file exactly as downloaded (its Chinese texts), whatever the locale — what the server
     * copied into a message, to compare with what it sent (ui/lang.js sentText).
     */
    lookupRaw(name, id) {
      if (id == null) return null;
      const e = entries.get(name);
      if (!e || e.status !== 'ready') return null;
      if (borrowIds && BORROW_SET.has(name)) return indexOfView(name, rawViewOf(name)).get(String(id)) ?? null;
      if (!e.index) e.index = buildIndex(name, e.value);
      return e.index.get(String(id)) ?? null;
    },
    /** All records of a loaded file as an array (empty when not loaded). */
    list: (name) => [...(index(name)?.values() ?? [])],
    /** Drop a cached file and refetch it now (subscribers are notified when it settles). */
    invalidate,
    /** The 卫戍协议 season whose files are read (shared/seasons.js). */
    season: () => season,
    /** Resolves once the last season switch's files have settled (ui/seasonFade.js lights the screen up after it). */
    seasonSettled: () => seasonWork,
    /**
     * Read another season's files (a room of that season, room.state `season`; absent = the default): every loaded
     * file but the art manifests is fetched again from that season (subscribers are notified as for invalidate).
     * Resolves when they have settled.
     * @param {unknown} id
     */
    setSeason(id) {
      const next = seasonOf(id);
      if (next === season) return Promise.resolve();
      season = next;
      if (entries.has('assets')) tell('assets'); // its season view changes now (seasonAssets)
      // the season's game texts first (a file each language), so the files read again come localized with them
      seasonWork = loadSeasonOverlays().catch(() => {}).then(() => Promise.all([...entries.keys()].filter((n) => !ART_MANIFESTS.has(n)).map(invalidate))).then(() => {});
      if (borrowIds) loadBorrowed(); // the lending seasons are the others now
      return seasonWork;
    },
    /**
     * Read the stages / enemies / factions with what a custom ruleset borrows from other seasons (the room's:
     * shared/seasonBorrow.js customBorrowIds; null = nothing): the lending seasons' files are fetched, and their
     * subscribers told as they arrive. Resolves when they have settled.
     * @param {{ stages: string[], types: string[] } | null} ids
     */
    setBorrow(ids) {
      const next = ids && (ids.stages?.length || ids.types?.length) ? { stages: [...ids.stages].sort(), types: [...ids.types].sort() } : null;
      if (borrowKey(next) === borrowKey(borrowIds)) return borrowWork;
      borrowIds = next;
      loadBorrowed();
      for (const n of [...BORROW_FILES, 'assets']) if (entries.has(n)) tell(n);
      return borrowWork;
    },
    /** What setBorrow borrows now ('' = nothing; shared/seasonBorrow.js borrowKey). */
    borrowKey: () => borrowKey(borrowIds),
    /** Resolves once the last setBorrow's files have settled. */
    borrowSettled: () => borrowWork,
    /**
     * A file as the simulation reads it: `file` (the season's own, as load() gave it) with what setBorrow borrows —
     * the battle runner's data, the same merge as the server's match (server/match/borrow.js).
     * @param {string} name @param {any} file
     */
    borrowRaw: (name, file) => borrowedView(name, file, true),
    /** Another season's store (its files and texts in this store's language): the custom dialog's lists. */
    seasonStore,
    /**
     * What a custom ruleset may borrow, in the current locale: a stage record (`'stages'`) or a 特训敌人 type
     * (`'types'`, factions.json types) of this season, else of the first other public season that has it (its files
     * are fetched; the subscribers are told when they arrive) — the names of other seasons' battlefields and types
     * outside a room that borrows them. Null while unknown.
     * @param {'stages'|'types'} kind @param {string} id
     */
    lendable(kind, id) {
      const pickOf = (st) => (kind === 'types' ? st.get('factions')?.types?.[id] : st.lookup('stages', id)) ?? null;
      const own = kind === 'types' ? viewOf('factions')?.types?.[id] : index('stages')?.get(String(id));
      if (own) return own;
      for (const sid of borrowSeasons(season)) {
        const st = seasonStore(sid);
        if (!st) continue;
        st.load(kind === 'types' ? 'factions' : 'stages');
        const rec = pickOf(st);
        if (rec) return rec;
      }
      return null;
    },
    /** Called with the file name whenever a file finishes loading (or is invalidated, or the locale changes). */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Current game-text locale ('zh' or the language of the last switch). */
    locale: () => locale,
    /** The languages whose overlays apply now, best first (empty in Chinese). */
    localeChain: () => [...chain],
    /**
     * Switch the game texts' language: 'zh' at once; another language once the overlays of `chain` (default: the
     * language alone) have downloaded — those that fail are left out. When every overlay of a non-empty chain fails the
     * locale does not change (the texts stay as they are); an empty chain (a pack without game texts) switches with
     * the Chinese texts. Every loaded file's subscribers are notified. Resolves to the locale in effect.
     * @param {string} lang
     * @param {(string | { code: string, url?: string })[]} [chainIn] overlay languages, best first (with the URL of
     *   each overlay when it is not the language folder's data/i18n/<code>.json)
     * @returns {Promise<string>}
     */
    async setLocale(lang, chainIn) {
      localeArgs = [lang, chainIn];
      for (const st of peers.values()) st.setLocale(lang, chainIn);
      const code = canonicalLang(lang);
      const want = code && code === lang ? code : 'zh';
      const items = (Array.isArray(chainIn) ? chainIn : [want]).map((c) => (typeof c === 'string' ? { code: c, url: undefined } : c));
      const seen = new Set();
      const asked = want === 'zh' ? [] : items.filter((c) => c && canonicalLang(c.code) === c.code && c.code !== 'zh' && !seen.has(c.code) && seen.add(c.code));
      const ask = asked.map((c) => c.code);
      const seq = ++switches;
      for (const c of asked) overlayUrls.set(c.code, typeof c.url === 'string' && c.url ? c.url : `${base}i18n/${c.code}.json`);
      const got = await Promise.all(asked.map((c) => loadOverlay(c.code, typeof c.url === 'string' && c.url ? c.url : undefined)));
      if (seq !== switches) return locale; // a later switch is under way
      const next = ask.filter((_, i) => got[i]);
      await loadSeasonOverlays(next).catch(() => {});
      if (seq !== switches) return locale;
      if (ask.length && !next.length) return locale;
      if (want === locale && next.join('|') === chain.join('|')) return locale;
      locale = want;
      chain = next;
      localized.clear();
      for (const name of [...entries.keys()]) notify(name);
      return locale;
    },
    /**
     * A Chinese game-data name (operator, item, bond, token …) in the current locale: the first overlay of the chain
     * that knows it, else the name itself (also in Chinese).
     * @param {string} zh
     * @returns {string}
     */
    localeName(zh) {
      if (locale === 'zh' || typeof zh !== 'string') return zh;
      for (const c of chain) {
        const names = overlays.get(c)?.names;
        if (names && Object.prototype.hasOwnProperty.call(names, zh) && names[zh]) return names[zh];
      }
      return zh;
    },
    /**
     * An operator skin's name in the current locale, looked up by its skin id: the first overlay of the chain whose
     * `skins` map has it, else the Chinese name. Never through `names` — that map is keyed by the Chinese, and a skin
     * named like a data record (升华, an effect too) would show the record's name (docs/rules/ui.md 「스킨 고르기」).
     * @param {string} id skin id (char_1012_skadi2@boc#4)
     * @param {string} zh the skin list's Chinese name
     * @returns {string}
     */
    localeSkinName(id, zh) {
      if (locale === 'zh' || typeof id !== 'string') return zh;
      for (const c of chain) {
        const skins = overlays.get(c)?.skins;
        if (skins && Object.prototype.hasOwnProperty.call(skins, id) && typeof skins[id] === 'string' && skins[id]) return skins[id];
      }
      return zh;
    },
  };
}

/** Browser data store singleton. */
export const data = createDataStore();

/** @param {...string} names @returns {Promise<any[]>} */
export const loadData = (...names) => data.loadAll(...names);

/** @param {string} id chess id (normal or elite) */
export const getChess = (id) => data.lookup('chess', id);
/** @param {string} id bond id, e.g. 'yanShip' */
export const getBond = (id) => data.lookup('bonds', id);
/** @param {string} id item (trap) id */
export const getItem = (id) => data.lookup('items', id);
/** @param {string} id band (strategy) id */
export const getBand = (id) => data.lookup('bands', id);
/** @param {string} key enemy key */
export const getEnemy = (key) => data.lookup('enemies', key);
/** @param {string} id boss id */
export const getBoss = (id) => data.lookup('bosses', id);
/** @param {string} id stage id */
export const getStage = (id) => data.lookup('stages', id);
/** @param {string} id token id */
export const getToken = (id) => data.lookup('tokens', id);
/** @returns {any|null} data/config.json */
export const getConfig = () => data.get('config');

/**
 * URL of a local-client art entry (data/local-assets.json, DESIGN §13), or null when the manifest / entry is missing
 * (callers draw their own fallback). Load it first with `data.load('local')` / `useData('local')`.
 * @param {string} group e.g. 'ui/battle', 'emoticon/basic', 'guide'
 * @param {string} name entry name without extension
 */
export function localAsset(group, name) {
  const g = data.get('local')?.groups?.[group];
  const e = g && typeof g === 'object' ? g[name] : null;
  return e && typeof e.path === 'string' && e.path ? e.path : null;
}

/**
 * Candidate URLs, best first, of art that both the local client and the public mirror have — the 36 battle emotes and
 * the 19 玩法说明 pages (GitHub issue #42: a server without the client showed default emote icons): the local-client
 * entry (`localAsset(group, name)`), then the copy tools/fetch-assets.mjs downloads, which data/assets.json lists under
 * the same group and name as `ui['<group>/<name>']` (tools/assets/plan.mjs UI_EXTRAS). Empty when neither manifest
 * lists it (callers draw their own fallback); a caller skips a URL that fails to load and tries the next. Load both
 * files first (`useData('local', 'assets')`).
 * @param {string} group e.g. 'emoticon/basic', 'guide'
 * @param {string} name entry name without extension
 * @returns {string[]}
 */
export function artUrls(group, name) {
  const out = [];
  const local = localAsset(group, name);
  if (local) out.push(local);
  const ui = data.get('assets')?.ui;
  const key = `${group}/${name}`;
  const web = ui && typeof ui === 'object' && Object.hasOwn(ui, key) ? ui[key] : null;
  if (typeof web === 'string' && web && web !== local) out.push(web);
  return out;
}

/**
 * The URL to show from an artUrls() list: the first one that has not failed to load (a local file listed by a copied
 * data/local-assets.json without its files falls through to the mirror copy), or null when none is left.
 * @param {string[]} urls
 * @param {Set<string>} [failed] URLs whose image fired an error
 */
export function nextArtUrl(urls, failed) {
  for (const u of Array.isArray(urls) ? urls : []) if (typeof u === 'string' && u && !failed?.has(u)) return u;
  return null;
}

/**
 * Mode record from config.json (`modes[modeId]`), or null.
 * @param {string} modeId e.g. 'mode_multi_hard'
 * @param {any} [cfg] the config.json to read (default: this store's; another season's: data.seasonStore(id).get('config'))
 */
export function getMode(modeId, cfg = getConfig()) {
  const modes = cfg && typeof cfg === 'object' ? (cfg.modes || cfg.modeDataDict) : null;
  if (!modes || typeof modes !== 'object') return null;
  if (Array.isArray(modes)) return modes.find((m) => m && (m.modeId === modeId || m.id === modeId)) || null;
  return modes[modeId] || null;
}

/**
 * Preact hook: start loading the given files and re-render when any of them settles.
 * @param {...string} names
 * @returns {boolean} true once every file is settled (ready or missing)
 */
export function useData(...names) {
  const [, force] = useReducer((c) => c + 1, 0);
  const key = names.join('|');
  useEffect(() => {
    let alive = true;
    const unsub = data.subscribe((n) => { if (alive && names.includes(n)) force(); });
    for (const n of names) data.load(n);
    return () => { alive = false; unsub(); };
  }, [key]);
  return names.every((n) => {
    const s = data.status(n);
    return s === 'ready' || s === 'missing';
  });
}
