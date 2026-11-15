// Pinned upstream files (tools/assets/upstream-pins.json, docs/ASSETS.md "Pinned upstream files").
//
// The asset sources are branch heads (sources.mjs RAW: ArknightsAssets2 `cn` / `voice`, fexli `main`, …). A game
// update can replace the file at a path the pipeline already downloaded, and the downloader keeps a file whose size
// matches its ledger, so an install never notices: WSL, the server and a fresh checkout end up with different
// versions, and the browser's resource list (`u` = the branch URL) disagrees with the file it lists. A pinned file
// names the commit whose version this repository uses — the new one after a model update, or the old one that a rule
// keeps — and every install downloads exactly that version:
//   - the download URL is the commit's raw URL (jsDelivr @commit as its fallback), so the ledger and the browser's `u`
//     name an immutable file;
//   - a file on disk is kept only when the ledger says it came from that URL and, for a file the pipeline does not
//     rewrite, its sha256 is the pin's; a pinned atlas (rewritten: `size:` / `pma`) is kept only when every pinned
//     file of its folder is (the atlas belongs to its pages);
//   - downloaded bytes whose sha256 differ from the pin's are an error, never written.
// The table is written by tools/check-asset-sources.mjs (--pin / --take-new); it is not edited by hand.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isCommitRef, repoSource } from './sources.mjs';

export const PINS_FILE = 'tools/assets/upstream-pins.json';

/**
 * @typedef {{ url: string, sha256: string, bytes: number, note?: string }} Pin
 */

/**
 * Check a pins table and return its `files` map; throws on an entry that is not a commit-pinned GitHub URL with a
 * sha256 and a byte count (a generator stops on what it does not know).
 * @param {any} table the parsed JSON
 * @param {string} [name] for the error text
 * @returns {Record<string, Pin>}
 */
export function checkPins(table, name = PINS_FILE) {
  const files = table?.files;
  if (!files || typeof files !== 'object') throw new Error(`${name}: no "files" object`);
  for (const [rel, p] of Object.entries(files)) {
    const src = repoSource(p?.url);
    if (!src || !isCommitRef(src.ref)) throw new Error(`${name}: ${rel}: url must be a raw GitHub URL at a full commit id (${p?.url})`);
    if (!/^[0-9a-f]{64}$/.test(String(p.sha256))) throw new Error(`${name}: ${rel}: sha256 missing or malformed`);
    if (!Number.isInteger(p.bytes) || p.bytes <= 0) throw new Error(`${name}: ${rel}: bytes missing`);
  }
  return files;
}

/**
 * The pins of this repository (an empty map when the file does not exist).
 * @param {string} path absolute path of upstream-pins.json
 * @returns {Record<string, Pin>}
 */
export function loadPins(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
  return checkPins(JSON.parse(text), path);
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Whether two download URLs name the same repository file at the same ref (raw, jsDelivr and proxied forms are one).
 * @param {string|undefined} a
 * @param {string|undefined} b
 */
export function sameSource(a, b) {
  const x = a && repoSource(a); const y = b && repoSource(b);
  if (!x || !y) return !!a && a === b;
  return x.owner === y.owner && x.repo === y.repo && x.ref === y.ref && decodeURIComponent(x.path) === decodeURIComponent(y.path);
}
