// Background resource download (local NAS patch): pre-downloads the game art into Cache Storage, which
// public/resource-worker.js then serves, so a picture never pops in late (no download, no revalidation round trip).
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

import { html } from './ui/components.js';
import { createStore, useStore, store, loadPref, savePref, selectRoute } from './store.js';

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
export const resStore = createStore({ phase: 'off', done: 0, total: 0, bytesDone: 0, bytesTotal: 0, failed: 0, error: null });

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
    const key = decodeURIComponent(p);
    const h = state[key];
    if (!h || want.get(key) !== h) { await cache.delete(req); changed = true; }
  }
  for (const p of Object.keys(state)) if (want.get(p) !== state[p]) { delete state[p]; changed = true; }
  if (changed) await saveState();
  return index.files.filter((f) => state[f.p] !== f.h).sort((a, b) => priorityOf(a.p) - priorityOf(b.p));
}

async function fetchOne(f) {
  let last = 'no source';
  for (const url of sourcesOf(f)) {
    try {
      const external = !url.startsWith('/');
      const res = await fetch(url, { cache: 'no-store', ...(external ? { mode: 'cors', credentials: 'omit' } : {}), signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) { last = `HTTP ${res.status}`; continue; }
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== f.s || (await sha256(buf)) !== f.h) { last = 'hash mismatch'; continue; }
      await cache.put(f.p, new Response(buf, { headers: { 'Content-Type': typeOf(f.p), 'Content-Length': String(buf.byteLength) } }));
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

/** Register the worker, sync the cache with the list and start (or ask). Never throws. */
export async function installResources() {
  if (!supported()) return;
  try {
    await navigator.serviceWorker.register('/resource-worker.js', { scope: '/' });
    const res = await fetch(INDEX, { cache: 'no-cache' });
    if (!res.ok) return; // no list on this server: everything loads from the server as before
    index = await res.json();
    if (!index || !Array.isArray(index.files)) return;
    pending = await reconcile();
    if (!pending.length) { resStore.set({ phase: 'done', total: 0 }); return; }
    const pref = loadPref(PREF, null);
    if (pref?.consent === 'yes') download();
    else if (pref?.consent === 'later' && Date.now() - pref.at < ASK_AGAIN_MS) resStore.set({ phase: 'idle' });
    else resStore.set({ phase: 'ask', bytesTotal: pending.reduce((n, f) => n + f.s, 0) });
  } catch (err) {
    console.warn('[resources] unavailable', err);
  }
}

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
