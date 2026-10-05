// Background resource download (local NAS patch): pre-downloads the game art into Cache Storage, which
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
// left the list are deleted, then the rest is downloaded. Nothing starts before the player agrees once (the choice is
// remembered; 以后再说 asks again after ASK_AGAIN_MS). The download runs in the page, not the worker: a service worker
// event is cut off after a few minutes, a page keeps going while the player plays — slower during a match.
// Needs a secure context (https / localhost); on plain http the game simply loads everything from the server.
//
//   installResources()   main.js, once
//   <ResourceHost />     consent card + progress pill (title / lobby / room screens only, never over the match HUD)
//   <ResourceSetting />  the settings row: start (or retry) the download any time, e.g. after 以后再说

import { html, MicroLabel } from './ui/components.js';
import { createStore, useStore, store, loadPref, savePref, selectRoute } from './store.js';
import { voiceWanted, onVoiceLangChange } from './voice.js';

const CACHE = 'sp-res';
const STATE = '/__sp_res_state__';
const INDEX = '/assets/browser-resources.json';
const PREF = 'resources';
const ASK_AGAIN_MS = 7 * 86400e3;
const SAVE_EVERY = 20;
const TIMEOUT_MS = 60000;
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
let pending = [];

async function saveState() {
  await cache.put(STATE, new Response(JSON.stringify(state), { headers: { 'Content-Type': 'application/json' } }));
}

/** Drop cache entries that are not (or no longer) the listed file; returns the files still to download. */
async function reconcile() {
  cache = await caches.open(CACHE);
  try { state = (await (await cache.match(STATE))?.json()) || {}; } catch { state = {}; }
  const want = new Map(index.files.map((f) => [f.p, f.h]));
  const stateKey = new URL(STATE, location.origin).href;
  let changed = false;
  for (const req of await cache.keys()) {
    if (req.url === stateKey) continue;
    const p = new URL(req.url).pathname;
    let key;
    try { key = decodeURIComponent(p); } catch { key = p; }
    let h = state[key];
    if (!h) { // stored by the worker on demand (resource-worker.js): adopt it when its hash is the listed one
      const stored = (await cache.match(req))?.headers.get('X-SP-Hash');
      if (stored && want.get(key) === stored) { state[key] = h = stored; changed = true; }
    }
    if (!h || want.get(key) !== h) { await cache.delete(req); changed = true; }
  }
  for (const p of Object.keys(state)) if (want.get(p) !== state[p]) { delete state[p]; changed = true; }
  if (changed) await saveState();
  return index.files.filter((f) => state[f.p] !== f.h).sort((a, b) => priorityOf(a.p) - priorityOf(b.p));
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

/** Parallel downloads: fewer while a match is on screen so the game keeps the bandwidth. */
const limit = () => (selectRoute(store.get()) === 'game' ? 2 : 4);
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
      if (slot >= limit()) { await sleep(1000); continue; }
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
  } catch (err) { console.warn('[resources] resync', err); }
}
onVoiceLangChange(resync);

const mb = (n) => Math.max(1, Math.round(n / 1048576));

/** Consent card (a corner card; a centered dialog on short landscape phones, where every corner holds a button) /
 *  progress pill; hidden during a match (the HUD corners are taken). */
export function ResourceHost() {
  const r = useStore((s) => s, Object.is, resStore);
  const route = useStore(selectRoute);
  if (route === 'game') return null;
  if (r.phase === 'ask') {
    return html`<div class="res-ask-wrap"><aside class="res-ask" role="dialog" aria-label="预先下载游戏资源">
      <strong>预先下载游戏资源</strong>
      <p>下载后图片会立即显示，不会延迟出现。建议使用 Wi-Fi。</p>
      <p class="res-ask__size num" data-i18n-skip="">${mb(r.bytesTotal)} MB</p>
      <div class="res-ask__btns">
        <button type="button" class="res-ask__yes" onClick=${acceptResources}>下载</button>
        <button type="button" class="res-ask__no" onClick=${postponeResources}>以后再说</button>
      </div>
      <p class="res-ask__note">不预先下载时，游戏会在需要时逐个下载并保存在此浏览器中。</p>
    </aside></div>`;
  }
  if (r.phase === 'running') {
    const pct = r.bytesTotal ? Math.floor((r.bytesDone / r.bytesTotal) * 100) : 0;
    return html`<div class="res-pill" role="status"><span>资源下载中</span> <b class="num" data-i18n-skip="">${pct}%</b></div>`;
  }
  if (r.phase === 'error') {
    return html`<div class="res-pill is-err" role="status">${r.error === 'quota' ? '浏览器存储空间不足，无法预先下载资源' : '资源下载中断，下次进入时继续'}</div>`;
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
    <span class="set-row__label">预先下载资源<${MicroLabel}>RESOURCES<//></span>
    <div class="res-set__body">
      ${r.phase === 'running'
        ? html`<span class="res-set__state"><span>资源下载中</span> <b class="num" data-i18n-skip="">${pct}%</b></span>`
        : left
          ? html`<button type="button" class="res-set__btn" onClick=${acceptResources}>
              <span>${r.phase === 'error' || r.failed ? '重新下载' : '下载'}</span> <span class="num" data-i18n-skip="">${mb(r.pendingBytes)} MB</span></button>`
          : html`<span class="res-set__state is-done">已全部下载</span>`}
      ${r.phase === 'error' ? html`<span class="res-set__err">${r.error === 'quota' ? '浏览器存储空间不足，无法预先下载资源' : '资源下载中断，下次进入时继续'}</span>` : null}
    </div>
  </div>`;
}
