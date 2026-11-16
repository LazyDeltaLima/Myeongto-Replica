// Background resource download (local patch): pre-downloads the game art into Cache Storage, which
// public/resource-worker.js then serves, so a picture never pops in late (no download, no revalidation round trip).
// Without the consent the worker still fetches each listed file on demand (upstream art from jsDelivr / GitHub raw,
// hash-checked) and keeps it; reconcile() adopts those entries by their X-SP-Hash header.
//
// The list is /assets/browser-resources.json (tools/build-browser-resources.mjs, built on the server from the files on
// disk): { version, bytes, files: [{ p: path, s: bytes, h: sha256, u?: upstream URL }] }.
//   * a file with `u` (unmodified upstream art) is fetched from jsDelivr, then GitHub raw — never from this server;
//   * a file without `u` (assets/local: 3D board, emotes, UI sprites; normalized spine atlases) comes from this server;
//   * every file is kept only when its size and SHA-256 match the list, so an upstream repo that changed under us can
//     never put a different file in the cache. A file that fails stays out (the game loads it from the server as now)
//     and is tried again on the next visit — except an upstream file whose every source served other bytes (the repo
//     changed the file at that path since the list was built): it is recorded in DIFFER and not tried again until the
//     list names another hash for it or DIFFER_RETRY_MS has passed, so a drifted file costs one download and one warning,
//     not one on every visit. The worker still fetches it on demand (its last source is this server).
// What is cached is recorded in one JSON entry of the same cache (STATE): on load, entries whose hash changed or that
// left the list are listed as stale, then the rest is downloaded. That scan walks every cache key (a phone took 27.5 s
// over 15 thousand keys with nothing to delete, 2026-10-28), so a load whose list and voice language are those of a
// scan whose stale entries were all deleted (CLEAN, written by the cleanup) skips it: nothing can have gone stale since. Nothing starts before the player agrees once (the choice
// is remembered; 以后再说 asks again after ASK_AGAIN_MS). The download runs in the page, not the worker: a service worker
// event is cut off after a few minutes, a page keeps going while the player plays — one file at a time during a match,
// none while a field loads. The stale entries are deleted in the background, a few at a time and never during a match:
// the worker answers only the listed hash, so a stale copy waiting for its turn is never served, and after a deploy the
// thousands of deletions no longer share the Cache Storage with a match's first pictures (a phone's first match after a
// deploy waited 14.7 s for its art instead of 2.6 s, 2026-10-28).
// Packs (the skin data): the list names the path prefixes of each optional pack (`packs`). A pack's files are downloaded
// only when the player chose that pack (resourceWanted, the choice in PACKS_PREF), and deleted only when the player
// turns it off: a file of a pack never chosen that is in the cache with the listed hash is kept, so the list of what
// to download and the list of what to delete are two lists (a filter on the one would delete what the game fetched on
// demand on every visit). Without the general consent a chosen pack is still downloaded (it is a choice of its own).
// The settings' 资源 tab (ResourceSetting, SkinPackSetting) shows the files in no pack and each pack apart (resStore
// `sizes`: the consent card's size counts a chosen pack's files too), and can pause a pack's download for this page.
// The 立绘 with two copies (`r`: 'lo' the long side 1024, 'hi' the original resolution — illust-res.js) are a choice by
// device, not by the player: only this device's copy is downloaded and kept, and the other leaves the cache (the page
// never asks for it, so nothing fetched on demand is lost; the choice does not change between visits).
// Needs a secure context (https / localhost); on plain http the game simply loads everything from the server.
//
//   installResources()   main.js, once
//   resourceCached(paths) whether a skin model is all in the cache (render/skin-gate.js)
//   <ResourceHost />     consent card + progress pill (title / lobby / room screens only, never over the match HUD)
//   <ResourceSetting />  the settings row: start (or retry) the download any time, e.g. after 以后再说
//   <SkinPackSetting />  the settings rows of the skin data: download / pause / turn off, and 其他玩家的皮肤

import { html, MicroLabel } from './ui/components.js';
import { createStore, useStore, store, loadPref, savePref, selectRoute } from './store.js';
import { wantedFiles, onVoiceLangChange, voiceStore, setVoiceLang, VOICE_LANGS, voiceLangLabel } from './voice.js';
import { setResourceSource, fieldLoading } from './diag.js';
import { illustFull, illustListed } from './illust-res.js';
import { t, tc } from '../../shared/i18n.js';

const CACHE = 'sp-res';
const STATE = '/__sp_res_state__';
const CLEAN = '/__sp_res_clean__'; // the list version and voice language of the last scan whose stale entries are all gone
const DIFFER = '/__sp_res_differ__'; // upstream files every source served with other bytes: path → { h: listed hash, at }
const DIFFER_RETRY_MS = 7 * 86400e3;
const INDEX = '/assets/browser-resources.json';
const PREF = 'resources';
const PACKS_PREF = 'resourcePacks'; // { <pack>: true (chosen) | false (turned off) }; a pack never chosen is absent
const ASK_AGAIN_MS = 7 * 86400e3;
const SAVE_EVERY = 20;
const TIMEOUT_MS = 60000;
const CLEAN_CHUNK = 50;       // stale entries deleted between two rests
const CLEAN_REST_MS = 100;
const HOLD_POLL_MS = 1000;
const RAW_RE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/;
const JSDELIVR_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\//;

/**
 * phase: off | idle | ask | running | done | error. sizes: bytes per group of this browser's list — '' the files in no
 * pack, else a pack's name — `{ total, left }` (left: not cached with the listed hash; sizesOf). chosen: the pack choice
 * (resourcePacks). paused: the packs paused on this page (pauseResourcePack). runGroups: the groups the running download
 * holds files of.
 */
export const resStore = createStore({ phase: 'off', done: 0, total: 0, bytesDone: 0, bytesTotal: 0, failed: 0, error: null, pendingBytes: 0,
  sizes: {}, chosen: {}, paused: {}, runGroups: [] });
const setPending = () => resStore.set({ pendingBytes: pending.reduce((n, f) => n + f.s, 0), sizes: sizesOf() });

/**
 * Download URLs of one list entry: jsDelivr then GitHub raw for upstream art (jsDelivr has no ArknightsAssets2 voice
 * branch, shared with tools/assets/sources.mjs), this server for everything else.
 * @param {{ p: string, u?: string }} f
 */
export function sourcesOf(f) {
  if (typeof f.u !== 'string') return [f.p];
  if (JSDELIVR_RE.test(f.u)) return [f.u];
  const m = RAW_RE.exec(f.u);
  if (!m) return [];
  const [, owner, repo, branch, path] = m;
  const mirror = owner === 'ArknightsAssets' && branch === 'voice' ? null : `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
  return [mirror, f.u].filter(Boolean);
}

/** Paths the list may name: under /assets/ or /img/emotes/, no query / fragment / escapes / backslashes / dot segments. */
const PATH_RE = /^\/(assets|img\/emotes)\/[^?#%\\]+$/;
export const validPath = (p) => typeof p === 'string' && PATH_RE.test(p) && !p.split('/').some((seg) => seg === '.' || seg === '..');

/** List entries the page will act on: a valid path, a size and a sha256 (anything else is ignored). */
export const validEntry = (f) => !!f && validPath(f.p) && Number.isInteger(f.s) && f.s >= 0 && typeof f.h === 'string' && /^[0-9a-f]{64}$/.test(f.h)
  && (f.u === undefined || (typeof f.u === 'string' && sourcesOf(f).length > 0));

/** The packs the list names, `{ <pack>: [path prefix…] }`: a prefix is '/assets/…/' (anything else is ignored). */
export function sanitizePacks(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, prefixes] of Object.entries(raw)) {
    const ok = Array.isArray(prefixes) ? prefixes.filter((x) => typeof x === 'string' && x.endsWith('/') && validPath(x + 'x')) : [];
    if (/^[a-z]+$/.test(name) && ok.length) out[name] = ok;
  }
  return out;
}

/** The pack a listed path belongs to, or null (most files: in no pack). */
export function packOf(p, packs) {
  for (const [name, prefixes] of Object.entries(packs || {})) if (prefixes.some((x) => p.startsWith(x))) return name;
  return null;
}

/** Whether the background download takes a list entry: a file in no pack always, a pack's file only when the player
 *  chose that pack (`chosen[pack] === true`). Voice files are filtered before this (voice.js wantedFiles). */
export const resourceWanted = (f, packs, chosen) => { const pack = packOf(f.p, packs); return !pack || chosen?.[pack] === true; };

/** Whether the cache keeps a list entry it holds with the listed hash: everything but the files of a pack the player
 *  turned off (`chosen[pack] === false`). */
export const resourceKept = (f, packs, chosen) => { const pack = packOf(f.p, packs); return !pack || chosen?.[pack] !== false; };

const sanitizeChoice = (raw) => Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {}).filter(([, v]) => typeof v === 'boolean'));

/** Download order: what the screens show first (UI, portraits, icons, board) before models, then audio. */
export function priorityOf(p) {
  if (p.startsWith('/img/')) return 0;
  const rel = p.slice('/assets/'.length);
  if (/^(ui|local\/ui|local\/emoticon|emotes)\//.test(rel)) return 0;
  if (/^(char|item|skill|bond|band|prof|enemy|token)\//.test(rel)) return 1;
  if (/^local\/(map|mesh|module)\//.test(rel)) return 2;
  if (/^(spine|local\/spine)\//.test(rel)) return 3;
  if (/^audio\//.test(rel)) return 5;
  return 4;
}

const TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
  json: 'application/json', atlas: 'text/plain', txt: 'text/plain', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac' };
const typeOf = (p) => TYPES[p.slice(p.lastIndexOf('.') + 1).toLowerCase()] || 'application/octet-stream';

async function sha256(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = '';
  for (const b of d) s += b.toString(16).padStart(2, '0');
  return s;
}

const supported = () => typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'caches' in window && !!crypto?.subtle;

let index = null;
let listed = [];        // every valid entry of the list; index.files = the ones this browser downloads (voice language, packs)
let packs = {};         // the list's packs (sanitizePacks)
let chosen = sanitizeChoice(loadPref(PACKS_PREF, null)); // the player's pack choice
resStore.set({ chosen: { ...chosen } });
let paused = {};        // packs paused on this page: { <pack>: true }
let voiced = [];        // the listed entries of this browser's voice language (choose)
let again = false;      // a choice changed during a download: resync once it ends
let cache = null;
let state = {};        // path → hash of what is in the cache
let differ = {};       // DIFFER's content
let differChanged = false;
let want = new Map();  // path → listed hash of the files the cache keeps (resourceKept): anything else is stale
let pending = [];
let stale = [];        // cache requests to delete (cleanup)
let reconciled = null; // the last reconcile, for the report: { at, ms, keys, stale, adopted, skipped } (running: no ms)
let scanned = null;    // what CLEAN gets once the cleanup has deleted every stale entry of that scan
let deleted = 0;
let worker = null;     // the worker's answer counts the report last read: { at, hit, stale, fetched, bytes, server }

async function saveState() {
  await cache.put(STATE, new Response(JSON.stringify(state), { headers: { 'Content-Type': 'application/json' } }));
  if (differChanged) {
    differChanged = false;
    await cache.put(DIFFER, new Response(JSON.stringify(differ), { headers: { 'Content-Type': 'application/json' } }));
  }
}

/** Still to download: not cached with the listed hash, and not an upstream file recorded as drifted (DIFFER). */
const missing = (f) => state[f.p] !== f.h && differ[f.p]?.h !== f.h;
const todo = () => index.files.filter(missing).sort((a, b) => priorityOf(a.p) - priorityOf(b.p));

/** The group of a listed file: its pack's name, '' for a file in no pack. */
const groupOf = (f) => packOf(f.p, packs) ?? '';

/** Bytes per group of this browser's list, chosen or not: `total`, and `left` — what is still missing (a pack never
 *  chosen counts what the game fetched on demand as cached). The settings' 资源 tab shows them apart. */
function sizesOf() {
  const out = { '': { total: 0, left: 0 } };
  for (const name of Object.keys(packs)) out[name] = { total: 0, left: 0 };
  for (const f of voiced) {
    const g = out[groupOf(f)];
    g.total += f.s;
    if (missing(f)) g.left += f.s;
  }
  return out;
}

/** `sizes` once a file of its group is cached. */
const spend = (sizes, f) => {
  const g = groupOf(f), c = sizes?.[g];
  return c ? { ...sizes, [g]: { ...c, left: Math.max(0, c.left - f.s) } } : sizes;
};

/** A file of a pack paused on this page and still wanted: the download leaves it in the queue. */
const held = (f) => { const p = packOf(f.p, packs); return !!p && paused[p] === true && resourceWanted(f, packs, chosen); };

const now = () => globalThis.performance?.now?.() ?? Date.now();
const keyOf = (req) => {
  const p = new URL(req.url).pathname;
  try { return decodeURIComponent(p); } catch { return p; }
};

/** The voice files of this browser's language (voice.js) and the 立绘 copies of this device (illust-res.js), then the
 *  pack choice: index.files is what is downloaded, the returned list what the cache keeps. */
function choose() {
  voiced = wantedFiles(listed).filter((f) => illustListed(f));
  index.files = voiced.filter((f) => resourceWanted(f, packs, chosen));
  return voiced.filter((f) => resourceKept(f, packs, chosen));
}

/** The CLEAN signature: the list, the voice language, the 立绘 copy and the packs turned off (only they make more
 *  entries stale). */
const cleanSig = () => {
  if (typeof index.version !== 'string' || !index.version) return null;
  const off = Object.keys(packs).filter((n) => chosen[n] === false).sort();
  return `${index.version}|${voiceStore.get().lang}${illustFull() ? '' : '|lo'}${off.length ? `|off:${off.join(',')}` : ''}`;
};

/** List the cache entries that are not (or no longer) the listed file for cleanup(); returns the files still to download. */
async function reconcile() {
  const t0 = now();
  reconciled = { at: Date.now(), ms: null, keys: 0, stale: 0, adopted: 0 };
  cache = await caches.open(CACHE);
  try { state = (await (await cache.match(STATE))?.json()) || {}; } catch { state = {}; }
  want = new Map(choose().map((f) => [f.p, f.h]));
  try { differ = (await (await cache.match(DIFFER))?.json()) || {}; } catch { differ = {}; }
  if (!differ || typeof differ !== 'object') differ = {};
  differChanged = false;
  for (const [p, d] of Object.entries(differ)) {
    if (want.get(p) !== d?.h || !(Date.now() - d.at < DIFFER_RETRY_MS)) { delete differ[p]; differChanged = true; }
  }
  if (differChanged) await saveState();
  reconciled.differ = Object.keys(differ).length;
  const sig = cleanSig();
  let clean = null;
  try { clean = sig && (await (await cache.match(CLEAN))?.text()); } catch { /* scan */ }
  if (sig && clean === sig) {
    stale = [];
    reconciled = { ...reconciled, ms: now() - t0, skipped: true };
    return todo();
  }
  scanned = sig;
  try { await cache.delete(CLEAN); } catch { /* ignore */ } // until this scan's stale entries are gone
  const stateKey = new URL(STATE, location.origin).href, cleanKey = new URL(CLEAN, location.origin).href;
  const differKey = new URL(DIFFER, location.origin).href;
  const found = [];
  let changed = false, keys = 0, adopted = 0;
  for (const req of await cache.keys()) {
    if (req.url === stateKey || req.url === cleanKey || req.url === differKey) continue;
    keys++;
    const key = keyOf(req);
    let h = state[key];
    if (!h) { // stored by the worker on demand (resource-worker.js): adopt it when its hash is the listed one
      const stored = (await cache.match(req))?.headers.get('X-SP-Hash');
      if (stored && want.get(key) === stored) { state[key] = h = stored; changed = true; adopted++; }
    }
    if (!h || want.get(key) !== h) found.push(req);
  }
  for (const p of Object.keys(state)) if (want.get(p) !== state[p]) { delete state[p]; changed = true; }
  if (changed) await saveState();
  stale = found;
  reconciled = { ...reconciled, ms: now() - t0, keys, stale: found.length, adopted };
  cleanup();
  return todo();
}

const inMatch = () => selectRoute(store.get()) === 'game';

/** Delete the stale entries reconcile() listed, CLEAN_CHUNK at a time, never while a match is on screen. An entry the
 *  download or the worker replaced with the listed file since is kept (and adopted). */
let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  let adopted = false;
  try {
    while (stale.length) {
      if (inMatch()) { await sleep(HOLD_POLL_MS); continue; }
      for (const req of stale.splice(0, CLEAN_CHUNK)) {
        const key = keyOf(req);
        const w = want.get(key);
        if (w && state[key] === w) continue;
        if (w && (await cache.match(req))?.headers.get('X-SP-Hash') === w) { state[key] = w; adopted = true; continue; }
        await cache.delete(req);
        deleted++;
      }
      await sleep(CLEAN_REST_MS);
    }
    if (adopted) await saveState();
    if (scanned) await cache.put(CLEAN, new Response(scanned));
  } catch (err) {
    console.warn('[resources] cleanup', err); // what is left is listed again on the next visit
  } finally {
    cleaning = false;
  }
}

async function fetchOne(f) {
  // the worker may have stored it on demand since the list was made (the game needed it first): adopt, no download
  if ((await cache.match(f.p))?.headers.get('X-SP-Hash') === f.h) { state[f.p] = f.h; return true; }
  let last = 'no source';
  const urls = sourcesOf(f);
  let differs = typeof f.u === 'string' && urls.length > 0; // every source answered, with other bytes
  for (const url of urls) {
    try {
      const external = !url.startsWith('/');
      const res = await fetch(url, { cache: 'no-store', ...(external ? { mode: 'cors', credentials: 'omit' } : {}), signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) { last = `HTTP ${res.status}`; differs = false; continue; }
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== f.s || (await sha256(buf)) !== f.h) { last = 'hash mismatch'; continue; }
      differs = false;
      await cache.put(f.p, new Response(buf, { headers: { 'Content-Type': typeOf(f.p), 'Content-Length': String(buf.byteLength), 'X-SP-Hash': f.h } }));
      state[f.p] = f.h;
      return true;
    } catch (err) {
      if (err?.name === 'QuotaExceededError') throw err;
      last = err?.name || String(err);
      differs = false;
    }
  }
  if (differs) {
    differ[f.p] = { h: f.h, at: Date.now() };
    differChanged = true;
    console.warn('[resources]', f.p, 'changed in its asset repo (hash mismatch); not tried again until the list changes');
  } else console.warn('[resources]', f.p, last);
  return false;
}

/** Parallel downloads: none while a field loads, one while a match is on screen, so the game keeps the bandwidth and
 *  the Cache Storage. */
const limit = () => (fieldLoading() ? 0 : inMatch() ? 1 : 4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let running = false;
async function download(files = pending) {
  if (running || !files.length) return;
  running = true;
  const queue = files.slice();
  const bytesTotal = queue.reduce((n, f) => n + f.s, 0);
  resStore.set({ phase: 'running', done: 0, total: queue.length, bytesDone: 0, bytesTotal, failed: 0, error: null,
    runGroups: [...new Set(queue.map(groupOf))] });
  let sinceSave = 0;
  const worker = async (slot) => {
    while (queue.length) {
      const next = queue.findIndex((f) => !held(f));
      if (next < 0) break; // only the files of a paused pack are left: the download ends, resuming starts them again
      if (slot >= limit()) { await sleep(HOLD_POLL_MS); continue; }
      const [f] = queue.splice(next, 1);
      if (!resourceWanted(f, packs, chosen)) { resStore.set((s) => ({ done: s.done + 1, bytesDone: s.bytesDone + f.s })); continue; } // turned off meanwhile
      const ok = await fetchOne(f);
      resStore.set((s) => ({ done: s.done + 1, bytesDone: s.bytesDone + f.s, failed: s.failed + (ok ? 0 : 1), sizes: ok ? spend(s.sizes, f) : s.sizes }));
      if (ok && ++sinceSave >= SAVE_EVERY) { sinceSave = 0; await saveState(); }
    }
  };
  try {
    await Promise.all([0, 1, 2, 3].map(worker));
    await saveState();
    pending = pending.filter(missing);
    setPending();
    resStore.set({ phase: 'done', runGroups: [] });
  } catch (err) {
    console.error('[resources] stopped', err);
    try { await saveState(); } catch { /* ignore */ }
    resStore.set({ phase: 'error', error: err?.name === 'QuotaExceededError' ? 'quota' : 'failed', runGroups: [] });
  } finally {
    running = false;
    if (again) { again = false; resync(); }
  }
}

/** What to download now: everything still to download with the general consent, else the files of the chosen packs. */
const toDownload = () => (loadPref(PREF, null)?.consent === 'yes' ? pending : pending.filter((f) => packOf(f.p, packs)));

/** The player agreed (consent card): remember it, ask the browser to keep the cache, start. */
export async function acceptResources() {
  savePref(PREF, { consent: 'yes', at: Date.now() });
  try {
    const need = pending.reduce((n, f) => n + f.s, 0);
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.quota - (est.usage || 0) < need * 1.1) { resStore.set({ phase: 'error', error: 'quota' }); return; }
    await navigator.storage?.persist?.();
  } catch { /* best effort */ }
  if (running) again = true; // a chosen pack downloading on its own: the rest follows once it ends
  else download();
}

/** 以后再说: ask again in a week. */
export function postponeResources() {
  savePref(PREF, { consent: 'later', at: Date.now() });
  resStore.set({ phase: 'idle' });
}

/** The server has no list (feature turned off): drop the cache and the worker, so nothing old is ever served. */
async function switchOff() {
  try { await caches.delete(CACHE); } catch { /* ignore */ }
  try { for (const r of await navigator.serviceWorker.getRegistrations()) if (r.active?.scriptURL?.endsWith('/resource-worker.js')) await r.unregister(); } catch { /* ignore */ }
}

/** Register the worker, sync the cache with the list and start (or ask). Never throws. */
export async function installResources() {
  if (!supported()) return;
  try {
    const res = await fetch(INDEX, { cache: 'no-cache' });
    if (res.status === 404) { await switchOff(); return; } // no list on this server: everything loads from the server as before
    await navigator.serviceWorker.register('/resource-worker.js', { scope: '/' });
    if (!res.ok) return; // a passing failure: keep serving what is cached, try again on the next visit
    index = await res.json();
    if (!index || !Array.isArray(index.files)) return;
    listed = index.files.filter(validEntry);
    packs = sanitizePacks(index.packs);
    pending = await reconcile();
    setPending();
    if (!pending.length) { resStore.set({ phase: 'done', total: 0 }); return; }
    const pref = loadPref(PREF, null);
    if (pref?.consent === 'yes') download();
    else if (toDownload().length) download(toDownload());
    else if (pref?.consent === 'later' && Date.now() - pref.at < ASK_AGAIN_MS) resStore.set({ phase: 'idle' });
    else resStore.set({ phase: 'ask', bytesTotal: pending.reduce((n, f) => n + f.s, 0) });
  } catch (err) {
    console.warn('[resources] unavailable', err);
  }
}

/** The voice language or the pack choice changed: only that language's files are wanted — the other's leave the cache,
 *  as do the files of a pack turned off —, the new ones are downloaded when the player agreed before (a chosen pack's in
 *  any case). */
async function resync() {
  if (!index) return;
  if (running) { again = true; return; } // a running download finishes first (it skips a pack turned off), then this
  try {
    pending = await reconcile();
    setPending();
    if (!pending.length) resStore.set({ phase: 'done', total: 0 });
    else if (loadPref(PREF, null)?.consent === 'yes') download();
    else if (toDownload().length) download(toDownload());
    else if (resStore.get().phase === 'ask') resStore.set({ bytesTotal: pending.reduce((n, f) => n + f.s, 0) }); // card shows the new size
  } catch (err) { console.warn('[resources] resync', err); }
}
onVoiceLangChange(resync);

/** The player's choice of an optional pack (the settings' resource tab): on downloads its files, off deletes them. */
export function setResourcePack(name, on) {
  chosen = { ...chosen, [name]: !!on };
  savePref(PACKS_PREF, chosen);
  if (paused[name]) paused = { ...paused, [name]: false }; // chosen again: it downloads
  resStore.set({ chosen: { ...chosen }, paused: { ...paused } });
  return resync();
}

/** Pause (or resume) a chosen pack's download on this page (the resource tab's 暂停 / 继续下载): the download leaves the
 *  pack's files queued and ends once only they are left; resuming starts them again. Not saved: the next visit
 *  downloads as before. */
export function pauseResourcePack(name, on) {
  paused = { ...paused, [name]: !!on };
  resStore.set({ paused: { ...paused } });
  if (on || !index) return;
  if (running) again = true; // the workers still running take the pack's files up again; the resync then catches the rest
  else if (toDownload().length) download(toDownload());
}

/** The pack choice: { <pack>: true | false }, a pack never chosen absent. */
export const resourcePacks = () => ({ ...chosen });

/** Whether every path is in the cache as the list names it (render/skin-gate.js: a skin model is drawn only once all of
 *  its files are) — false before the list and the cache record are read, and for a file the cache does not keep. */
export const resourceCached = (paths) => !!index && Array.isArray(paths) && paths.length > 0
  && paths.every((p) => typeof p === 'string' && want.has(p) && state[p] === want.get(p));

/** The worker's answer counts (resource-worker.js `sp-res-stats`), or null without a worker or an answer in time. */
function askWorker(timeout = 2000) {
  const sw = globalThis.navigator?.serviceWorker?.controller;
  if (!sw || typeof MessageChannel !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => { ch.port1.close(); resolve(null); }, timeout);
    ch.port1.onmessage = (e) => {
      clearTimeout(timer);
      ch.port1.close();
      const d = e.data;
      resolve(d && typeof d === 'object' ? (worker = { at: Date.now(), ...d }) : null);
    };
    sw.postMessage({ t: 'sp-res-stats' }, [ch.port2]);
  });
}

/** What the report says (diag.js): the last reconcile, the download, the cleanup and the worker's counts. */
export function resourceStatus() {
  const r = resStore.get();
  const running = r.phase === 'running';
  return {
    reconcile: reconciled && { ...reconciled },
    download: { phase: r.phase, done: r.done, total: r.total, failed: r.failed, queued: running ? r.total - r.done : pending.length,
      slowed: running ? (fieldLoading() ? 'field' : inMatch() ? 'match' : null) : null },
    cleanup: { left: stale.length, deleted, held: stale.length > 0 && inMatch() },
    worker: worker && { ...worker },
  };
}
setResourceSource({
  status: resourceStatus,
  // a field mount compares these before and after (diag.js mountTimer)
  snap: async () => {
    const s = resourceStatus();
    return { queued: s.download.queued, cleanup: s.cleanup.left, reconciling: !!s.reconcile && s.reconcile.ms == null, sw: await askWorker() };
  },
});

const mb = (n) => Math.max(1, Math.round(n / 1048576));

/** Consent card (a corner card; a centered dialog on short landscape phones, where every corner holds a button) /
 *  progress pill; hidden during a match (the HUD corners are taken). */
export function ResourceHost() {
  const r = useStore((s) => s, Object.is, resStore);
  const lang = useStore((s) => s.lang, Object.is, voiceStore);
  const route = useStore(selectRoute);
  if (route === 'game') return null;
  if (r.phase === 'ask') {
    return html`<div class="res-ask-wrap"><aside class="res-ask" role="dialog" aria-label=${t('预先下载游戏资源')}>
      <strong>${t('预先下载游戏资源')}</strong>
      <p>${t('下载后图片会立即显示，不会延迟出现。建议使用 Wi-Fi。')}</p>
      <div class="res-ask__lang"><span>${t('干员语音')}</span><div class="set-seg" role="radiogroup">
        ${VOICE_LANGS.map(([id, label]) => html`<button key=${id} type="button" role="radio" aria-checked=${lang === id ? 'true' : 'false'}
          class=${lang === id ? 'is-on' : ''} onClick=${() => setVoiceLang(id)}>${voiceLangLabel(id, label)}</button>`)}
      </div></div>
      <p class="res-ask__size num" data-i18n-skip="">${mb(r.bytesTotal)} MB</p>
      <div class="res-ask__btns">
        <button type="button" class="res-ask__yes" onClick=${acceptResources}>${t('下载')}</button>
        <button type="button" class="res-ask__no" onClick=${postponeResources}>${t('以后再说')}</button>
      </div>
      <p class="res-ask__note">${t('不预先下载时，游戏会在需要时逐个下载并保存在此浏览器中。')}</p>
    </aside></div>`;
  }
  if (r.phase === 'running') {
    const pct = r.bytesTotal ? Math.floor((r.bytesDone / r.bytesTotal) * 100) : 0;
    return html`<div class="res-pill" role="status"><span>${t('资源下载中')}</span> <b class="num" data-i18n-skip="">${pct}%</b></div>`;
  }
  if (r.phase === 'error') {
    return html`<div class="res-pill is-err" role="status">${r.error === 'quota' ? t('浏览器存储空间不足，无法预先下载资源') : t('资源下载中断，下次进入时继续')}</div>`;
  }
  return null;
}

const mbOf = (n) => Math.round(n / 1048576);
const pctOf = (g) => (g.total ? Math.floor(((g.total - g.left) / g.total) * 100) : 0);

/** Settings → 资源 「预先下载资源」 (ui/settings.js): the files in no pack — their state and size, and a button that starts
 *  or retries the download. A chosen pack's files are the skin rows' (SkinPackSetting). Hidden where the feature is off
 *  (plain http, no list on the server). */
export function ResourceSetting() {
  const r = useStore((s) => s, Object.is, resStore);
  if (r.phase === 'off') return null;
  const g = r.sizes[''] || { total: 0, left: 0 };
  const running = r.phase === 'running' && r.runGroups.includes('');
  return html`<div class="res-group">GAME</div>
  <div class="set-row res-set" data-testid="res-general">
    <span class="set-row__label">${t('预先下载资源')}<${MicroLabel}>RESOURCES<//></span>
    <div class="res-set__body">
      ${running
        ? html`<span class="res-set__state"><span>${t('资源下载中')}</span> <b class="num" data-i18n-skip="">${pctOf(g)}%</b></span>`
        : g.left > 0
          ? html`<button type="button" class="res-set__btn" onClick=${acceptResources}>
              <span>${r.phase === 'error' || r.failed ? t('重新下载') : t('下载')}</span> <span class="num" data-i18n-skip="">${mb(g.left)} MB</span></button>`
          : html`<span class="res-set__state is-done">${t('已全部下载')}</span><span class="res-set__size num" data-i18n-skip="">${mb(g.total)} MB</span>`}
      ${r.phase === 'error' ? html`<span class="res-set__err">${r.error === 'quota' ? t('浏览器存储空间不足，无法预先下载资源') : t('资源下载中断，下次进入时继续')}</span>` : null}
    </div>
  </div>
  <p class="set-hint res-set__hint">${t('下载战场、干员、特效和语音等全部资源。新赛季加入时一并下载。语音语言在「声音」标签中选择。')}</p>`;
}

/**
 * What the skin row shows, from resStore: 'off' (not chosen), 'running' (its files downloading), 'paused' (paused on this
 * page with files left), 'left' (chosen, files left, no download of them now — a failure is tried on the next visit),
 * 'done' (every file cached).
 * @param {{ sizes: Record<string, { total: number, left: number }>, chosen: Record<string, boolean>, paused: Record<string, boolean>, phase: string, runGroups: string[] }} r
 */
export function skinPackState(r, name = 'skin') {
  const g = r.sizes[name];
  if (r.chosen[name] !== true) return 'off';
  if (!(g?.left > 0)) return 'done';
  if (r.paused[name] === true) return 'paused';
  return r.phase === 'running' && r.runGroups.includes(name) ? 'running' : 'left';
}

/**
 * Settings → 资源 「皮肤数据」 and 「其他玩家的皮肤」 (ui/settings.js; the approved layout of the resource packs' plan): the
 * skin pack turned on (downloads it, resourceWanted) or off (deletes it, resourceKept), its download's progress with a
 * pause for this page, and the switch that draws the skins other players chose — usable once the pack is chosen. Hidden
 * when the list has no skin pack.
 * @param {{ others: boolean, onOthers: (on: boolean) => void }} props
 */
export function SkinPackSetting({ others, onOthers }) {
  const r = useStore((s) => s, Object.is, resStore);
  const g = r.sizes.skin;
  if (r.phase === 'off' || !g) return null;
  const st = skinPackState(r);
  const on = st !== 'off';
  const toggle = html`<button type="button" class=${`set-toggle${on ? ' is-on' : ''}`} role="switch" aria-checked=${on ? 'true' : 'false'}
    data-testid="skin-pack" onClick=${() => setResourcePack('skin', !on)}><i></i><span>${on ? tc('toggle', '开启') : tc('toggle', '关闭')}</span></button>`;
  const progress = (label) => html`<span class="res-set__state"><span>${label}</span> <b class="num" data-i18n-skip="">${pctOf(g)}%</b></span>
    <span class="res-set__bar" aria-hidden="true"><i style=${`width:${pctOf(g)}%`}></i></span>
    <span class="res-set__size num" data-i18n-skip="">${mbOf(g.total - g.left)} / ${mb(g.total)} MB</span>`;
  const pause = (stop) => html`<button type="button" class="res-set__mini" data-testid="skin-pause"
    onClick=${() => pauseResourcePack('skin', stop)}>${stop ? t('暂停') : t('继续下载')}</button>`;
  return html`<div class="res-group">SKIN</div>
  <div class="set-row res-set" data-testid="res-skin">
    <span class="set-row__label">${t('皮肤数据')}<${MicroLabel}>SKIN<//></span>
    <div class="res-set__body">
      ${st === 'off' ? html`${toggle}<span class="res-set__size">${t('约 {n} MB', { n: mb(g.total) })}</span>`
        : st === 'running' ? html`${progress(t('皮肤下载中'))}${pause(true)}`
          : st === 'paused' ? html`${toggle}${progress(t('皮肤下载已暂停'))}${pause(false)}`
            : st === 'left' ? html`${toggle}<span class="res-set__size num" data-i18n-skip="">${mbOf(g.total - g.left)} / ${mb(g.total)} MB</span>`
              : html`${toggle}<span class="res-set__size num" data-i18n-skip="">${mb(g.total)} MB</span>`}
    </div>
  </div>
  <p class="set-hint res-set__hint">${st === 'off' ? t('下载后可以选择自己的皮肤，也能看到其他玩家选择的皮肤。不下载时所有人都显示为默认皮肤。')
    : st !== 'done' ? t('下载完成前显示为默认皮肤，下载完成后从下一场战斗开始显示皮肤。')
      : t('关闭后删除已下载的皮肤数据，所有人都显示为默认皮肤。')}</p>
  <div class="set-row res-set" data-testid="res-others">
    <span class="set-row__label">${t('其他玩家的皮肤')}<${MicroLabel}>OTHERS<//></span>
    <div class="res-set__body">
      <button type="button" class=${`set-toggle${others ? ' is-on' : ''}`} role="switch" aria-checked=${others ? 'true' : 'false'} disabled=${!on}
        onClick=${() => onOthers(!others)}><i></i><span>${others ? tc('toggle', '开启') : tc('toggle', '关闭')}</span></button>
    </div>
  </div>
  <p class="set-hint res-set__hint">${on ? t('关闭后其他玩家显示为默认皮肤，自己的皮肤照常显示。') : t('下载皮肤数据后可用。')}</p>`;
}
