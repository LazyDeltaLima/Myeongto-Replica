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
//     and is tried again on the next visit.
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
// Needs a secure context (https / localhost); on plain http the game simply loads everything from the server.
//
//   installResources()   main.js, once
//   <ResourceHost />     consent card + progress pill (title / lobby / room screens only, never over the match HUD)
//   <ResourceSetting />  the settings row: start (or retry) the download any time, e.g. after 以后再说

import { html, MicroLabel } from './ui/components.js';
import { createStore, useStore, store, loadPref, savePref, selectRoute } from './store.js';
import { voiceWanted, onVoiceLangChange, voiceStore, setVoiceLang, VOICE_LANGS, voiceLangLabel } from './voice.js';
import { setResourceSource, fieldLoading } from './diag.js';
import { t } from '../../shared/i18n.js';

const CACHE = 'sp-res';
const STATE = '/__sp_res_state__';
const CLEAN = '/__sp_res_clean__'; // the list version and voice language of the last scan whose stale entries are all gone
const INDEX = '/assets/browser-resources.json';
const PREF = 'resources';
const ASK_AGAIN_MS = 7 * 86400e3;
const SAVE_EVERY = 20;
const TIMEOUT_MS = 60000;
const CLEAN_CHUNK = 50;       // stale entries deleted between two rests
const CLEAN_REST_MS = 100;
const HOLD_POLL_MS = 1000;
const RAW_RE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/;
const JSDELIVR_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\//;

/** phase: off | idle | ask | running | done | error */
export const resStore = createStore({ phase: 'off', done: 0, total: 0, bytesDone: 0, bytesTotal: 0, failed: 0, error: null, pendingBytes: 0 });
const setPending = () => resStore.set({ pendingBytes: pending.reduce((n, f) => n + f.s, 0) });

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
let listed = [];        // every valid entry of the list; index.files = the ones this browser wants (voice language)
let cache = null;
let state = {};        // path → hash of what is in the cache
let want = new Map();  // path → listed hash of the files this browser wants
let pending = [];
let stale = [];        // cache requests to delete (cleanup)
let reconciled = null; // the last reconcile, for the report: { at, ms, keys, stale, adopted, skipped } (running: no ms)
let scanned = null;    // what CLEAN gets once the cleanup has deleted every stale entry of that scan
let deleted = 0;
let worker = null;     // the worker's answer counts the report last read: { at, hit, stale, fetched, bytes, server }

async function saveState() {
  await cache.put(STATE, new Response(JSON.stringify(state), { headers: { 'Content-Type': 'application/json' } }));
}

const now = () => globalThis.performance?.now?.() ?? Date.now();
const keyOf = (req) => {
  const p = new URL(req.url).pathname;
  try { return decodeURIComponent(p); } catch { return p; }
};

/** List the cache entries that are not (or no longer) the listed file for cleanup(); returns the files still to download. */
async function reconcile() {
  const t0 = now();
  reconciled = { at: Date.now(), ms: null, keys: 0, stale: 0, adopted: 0 };
  cache = await caches.open(CACHE);
  try { state = (await (await cache.match(STATE))?.json()) || {}; } catch { state = {}; }
  want = new Map(index.files.map((f) => [f.p, f.h]));
  const sig = typeof index.version === 'string' && index.version ? `${index.version}|${voiceStore.get().lang}` : null;
  let clean = null;
  try { clean = sig && (await (await cache.match(CLEAN))?.text()); } catch { /* scan */ }
  if (sig && clean === sig) {
    stale = [];
    reconciled = { ...reconciled, ms: now() - t0, skipped: true };
    return index.files.filter((f) => state[f.p] !== f.h).sort((a, b) => priorityOf(a.p) - priorityOf(b.p));
  }
  scanned = sig;
  try { await cache.delete(CLEAN); } catch { /* ignore */ } // until this scan's stale entries are gone
  const stateKey = new URL(STATE, location.origin).href, cleanKey = new URL(CLEAN, location.origin).href;
  const found = [];
  let changed = false, keys = 0, adopted = 0;
  for (const req of await cache.keys()) {
    if (req.url === stateKey || req.url === cleanKey) continue;
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
  return index.files.filter((f) => state[f.p] !== f.h).sort((a, b) => priorityOf(a.p) - priorityOf(b.p));
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
  for (const url of sourcesOf(f)) {
    try {
      const external = !url.startsWith('/');
      const res = await fetch(url, { cache: 'no-store', ...(external ? { mode: 'cors', credentials: 'omit' } : {}), signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) { last = `HTTP ${res.status}`; continue; }
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== f.s || (await sha256(buf)) !== f.h) { last = 'hash mismatch'; continue; }
      await cache.put(f.p, new Response(buf, { headers: { 'Content-Type': typeOf(f.p), 'Content-Length': String(buf.byteLength), 'X-SP-Hash': f.h } }));
      state[f.p] = f.h;
      return true;
    } catch (err) {
      if (err?.name === 'QuotaExceededError') throw err;
      last = err?.name || String(err);
    }
  }
  console.warn('[resources]', f.p, last);
  return false;
}

/** Parallel downloads: none while a field loads, one while a match is on screen, so the game keeps the bandwidth and
 *  the Cache Storage. */
const limit = () => (fieldLoading() ? 0 : inMatch() ? 1 : 4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let running = false;
async function download() {
  if (running || !pending.length) return;
  running = true;
  const queue = pending.slice();
  const bytesTotal = queue.reduce((n, f) => n + f.s, 0);
  resStore.set({ phase: 'running', done: 0, total: queue.length, bytesDone: 0, bytesTotal, failed: 0, error: null });
  let sinceSave = 0;
  const worker = async (slot) => {
    while (queue.length) {
      if (slot >= limit()) { await sleep(HOLD_POLL_MS); continue; }
      const f = queue.shift();
      const ok = await fetchOne(f);
      resStore.set((s) => ({ done: s.done + 1, bytesDone: s.bytesDone + f.s, failed: s.failed + (ok ? 0 : 1) }));
      if (ok && ++sinceSave >= SAVE_EVERY) { sinceSave = 0; await saveState(); }
    }
  };
  try {
    await Promise.all([0, 1, 2, 3].map(worker));
    await saveState();
    pending = pending.filter((f) => state[f.p] !== f.h);
    setPending();
    resStore.set({ phase: 'done' });
  } catch (err) {
    console.error('[resources] stopped', err);
    try { await saveState(); } catch { /* ignore */ }
    resStore.set({ phase: 'error', error: err?.name === 'QuotaExceededError' ? 'quota' : 'failed' });
  } finally {
    running = false;
  }
}

/** The player agreed (consent card): remember it, ask the browser to keep the cache, start. */
export async function acceptResources() {
  savePref(PREF, { consent: 'yes', at: Date.now() });
  try {
    const need = pending.reduce((n, f) => n + f.s, 0);
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.quota - (est.usage || 0) < need * 1.1) { resStore.set({ phase: 'error', error: 'quota' }); return; }
    await navigator.storage?.persist?.();
  } catch { /* best effort */ }
  download();
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
    index.files = listed.filter(voiceWanted);
    pending = await reconcile();
    setPending();
    if (!pending.length) { resStore.set({ phase: 'done', total: 0 }); return; }
    const pref = loadPref(PREF, null);
    if (pref?.consent === 'yes') download();
    else if (pref?.consent === 'later' && Date.now() - pref.at < ASK_AGAIN_MS) resStore.set({ phase: 'idle' });
    else resStore.set({ phase: 'ask', bytesTotal: pending.reduce((n, f) => n + f.s, 0) });
  } catch (err) {
    console.warn('[resources] unavailable', err);
  }
}

/** The voice language changed (voice.js): only that language's files are wanted — the other's leave the cache, the
 *  new ones are downloaded when the player agreed before. */
async function resync() {
  if (!index || running) return; // a running download finishes first; the next visit picks the change up
  try {
    index.files = listed.filter(voiceWanted);
    pending = await reconcile();
    setPending();
    if (!pending.length) resStore.set({ phase: 'done', total: 0 });
    else if (loadPref(PREF, null)?.consent === 'yes') download();
    else if (resStore.get().phase === 'ask') resStore.set({ bytesTotal: pending.reduce((n, f) => n + f.s, 0) }); // card shows the new size
  } catch (err) { console.warn('[resources] resync', err); }
}
onVoiceLangChange(resync);

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

/** Settings row (ui/settings.js): status, and a button that starts or retries the download. Hidden where the feature is
 *  off (plain http, no list on the server). */
export function ResourceSetting() {
  const r = useStore((s) => s, Object.is, resStore);
  if (r.phase === 'off') return null;
  const pct = r.bytesTotal ? Math.floor((r.bytesDone / r.bytesTotal) * 100) : 0;
  const left = r.pendingBytes > 0;
  return html`<div class="set-row res-set">
    <span class="set-row__label">${t('预先下载资源')}<${MicroLabel}>RESOURCES<//></span>
    <div class="res-set__body">
      ${r.phase === 'running'
        ? html`<span class="res-set__state"><span>${t('资源下载中')}</span> <b class="num" data-i18n-skip="">${pct}%</b></span>`
        : left
          ? html`<button type="button" class="res-set__btn" onClick=${acceptResources}>
              <span>${r.phase === 'error' || r.failed ? t('重新下载') : t('下载')}</span> <span class="num" data-i18n-skip="">${mb(r.pendingBytes)} MB</span></button>`
          : html`<span class="res-set__state is-done">${t('已全部下载')}</span>`}
      ${r.phase === 'error' ? html`<span class="res-set__err">${r.error === 'quota' ? t('浏览器存储空间不足，无法预先下载资源') : t('资源下载中断，下次进入时继续')}</span>` : null}
    </div>
  </div>`;
}
