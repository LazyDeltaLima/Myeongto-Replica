// public/js/resource-db.js — the page's calls on the resource database (resource-entries.js DB_NAME: the files, their
// hashes, the page's records), for public/js/resources.js. One transaction per call, and nothing but the database's
// own requests awaited inside one: a transaction commits as soon as it has no request left, so an `await` on anything
// else in the middle would find it finished. public/resource-worker.js has its own copy of the few calls it makes.

import { DB_NAME, DB_VERSION, FILES_STORE, HASHES_STORE, META_STORE, upgradeResourceDb } from './resource-entries.js';

/** A file as the database keeps it, under its path: the listed hash, the Content-Type, the bytes.
 *  @typedef {{ h: string, t: string, b: ArrayBuffer }} StoredFile */

/** @template T @param {IDBRequest<T>} req @returns {Promise<T>} */
const result = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** Resolves once the transaction committed; rejects with its error (QuotaExceededError when the storage is full).
 *  @param {IDBTransaction} tx @returns {Promise<void>} */
const committed = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error || new DOMException('The transaction was aborted.', 'AbortError'));
});

/** A write transaction: relaxed durability (a file lost to a power cut is downloaded again; the browser need not flush
 *  each one to disk). @param {IDBDatabase} db @param {string[]} stores */
const writing = (db, stores) => db.transaction(stores, 'readwrite', { durability: 'relaxed' });

/**
 * Open (and on first use create) the database. A connection closes itself when another one deletes or upgrades the
 * database (`versionchange`), and `onGone` is told, so the caller opens again.
 * @param {() => void} [onGone] @returns {Promise<IDBDatabase>}
 */
export function openResourceDb(onGone = () => {}) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => upgradeResourceDb(req.result);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); onGone(); };
      db.onclose = () => onGone();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Every stored path with its hash, in one read (no bytes). @param {IDBDatabase} db @returns {Promise<Map<string, string>>} */
export async function readHashes(db) {
  const store = db.transaction(HASHES_STORE, 'readonly').objectStore(HASHES_STORE);
  const [keys, values] = await Promise.all([result(store.getAllKeys()), result(store.getAll())]);
  const out = new Map();
  keys.forEach((k, i) => { if (typeof k === 'string' && typeof values[i] === 'string') out.set(k, values[i]); });
  return out;
}

/** The stored hash of a path, or undefined. @param {IDBDatabase} db @param {string} p @returns {Promise<string | undefined>} */
export async function hashOf(db, p) {
  const h = await result(db.transaction(HASHES_STORE, 'readonly').objectStore(HASHES_STORE).get(p));
  return typeof h === 'string' ? h : undefined;
}

/**
 * Store files, all in one transaction: each file's bytes and its hash together. `b` must be an ArrayBuffer of the file
 * alone — a view into a larger buffer (a bundle's) would store the whole buffer.
 * @param {IDBDatabase} db @param {Array<{ p: string } & StoredFile>} files
 */
export function putFiles(db, files) {
  const tx = writing(db, [FILES_STORE, HASHES_STORE]);
  const bytes = tx.objectStore(FILES_STORE), hashes = tx.objectStore(HASHES_STORE);
  for (const { p, h, t, b } of files) { bytes.put({ h, t, b }, p); hashes.put(h, p); }
  return committed(tx);
}

/**
 * Delete stored files, in one transaction — except a path whose stored hash is (by now) its `keep` hash: the download or
 * the worker stored the listed file there since the path was found stale.
 * @param {IDBDatabase} db @param {Array<[string, string | undefined]>} items path, hash to keep
 * @returns {Promise<{ deleted: string[], kept: string[] }>}
 */
export async function dropFiles(db, items) {
  const tx = writing(db, [FILES_STORE, HASHES_STORE]);
  const bytes = tx.objectStore(FILES_STORE), hashes = tx.objectStore(HASHES_STORE);
  /** @type {string[]} */
  const deleted = [];
  /** @type {string[]} */
  const kept = [];
  for (const [p, keep] of items) {
    const req = hashes.get(p);
    req.onsuccess = () => {
      if (req.result === undefined) return; // deleted meanwhile
      if (keep !== undefined && req.result === keep) { kept.push(p); return; }
      bytes.delete(p);
      hashes.delete(p);
      deleted.push(p);
    };
  }
  await committed(tx);
  return { deleted, kept };
}

/** A record of the page (META_STORE), or undefined. @param {IDBDatabase} db @param {string} key @returns {Promise<unknown>} */
export const readMeta = (db, key) => result(db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(key));

/** @param {IDBDatabase} db @param {string} key @param {unknown} value */
export function writeMeta(db, key, value) {
  const tx = writing(db, [META_STORE]);
  tx.objectStore(META_STORE).put(value, key);
  return committed(tx);
}

/** Delete the whole database (the server turned the feature off). Open connections close themselves (openResourceDb). */
export const deleteResourceDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.deleteDatabase(DB_NAME);
  req.onsuccess = () => resolve(undefined);
  req.onblocked = () => resolve(undefined); // a connection still open: it closes on the versionchange, the deletion follows
  req.onerror = () => reject(req.error);
});
