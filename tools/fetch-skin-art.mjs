#!/usr/bin/env node
// Skin avatars and portraits from yuanyan3060/ArknightsGameResource (maintainer decision 2026-11-16): this server never
// sends them, the browser takes them from that repository (jsDelivr, then GitHub raw) and keeps them only when size +
// SHA-256 match the resource list, as tools/fetch-skin-models.mjs does for the skin models. This tool writes what the
// list needs for that, public/assets/local/spine/skin/art.json:
//
//   { version, repo, ref,                                    the repository commit every URL names (pinned)
//     skins: { <skin key>: { avatar?: { path, w, h }, portrait?: { path, w, h } } },   list paths, below
//     files: [{ p, s, h, u }],                               entries tools/build-browser-resources.mjs adds to the list
//     missing: { <skin key>: [kind…] } }                     pictures the record names and the repository lacks: the
//                                                            default avatar / portrait stands in
//
// The skins are those of skins.json (tools/local-extract/skin_extract.py); each one's picture ids are its record's
// `avatarId` / `portraitId` in the official skin table (.cache/gamedata/excel/skin_table.json, the table the extractor
// read). The repository keeps them as `avatar/<id>.png` and `portrait/<id>.png`, `#` and all. A list path never holds a
// `#` (a URL reads it as a fragment): the paths are those the extractor gives the same pictures, under
// /assets/spine/skin/ instead of /assets/local/spine/skin/ (`#` → `-`, any other character outside [A-Za-z0-9_.] stops
// the run), and nothing is on disk there. The 立绘 (illust) stays this server's (webp q85, tools/local-extract).
//
// Every file is downloaded once into .cache/skin-art/ and checked against the repository tree (git blob id), so a later
// run downloads only what changed. GitHub API: four anonymous calls, none when --ref names a cached tree.
//
//   node tools/fetch-skin-art.mjs [--ref <commit>] [--concurrency 8] [--offline]
//   --offline   no network: the cached tree and files only (stops on a file that is not cached)

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { blobId, SKIN_DIR, LIST_PREFIX } from './fetch-skin-models.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const REPO = 'yuanyan3060/ArknightsGameResource';
/** picture kind → the skin record's id field; the repository folder is the kind */
export const KINDS = { avatar: 'avatarId', portrait: 'portraitId' };
const API = `https://api.github.com/repos/${REPO}`;
const CACHE = join(ROOT, '.cache', 'skin-art');
const TABLE = join(ROOT, '.cache', 'gamedata', 'excel', 'skin_table.json');

const encodePath = (repoPath) => repoPath.split('/').map(encodeURIComponent).join('/');
export const rawUrl = (ref, repoPath) => `https://raw.githubusercontent.com/${REPO}/${ref}/${encodePath(repoPath)}`;
const cdnUrl = (ref, repoPath) => `https://cdn.jsdelivr.net/gh/${REPO}@${ref}/${encodePath(repoPath)}`;

/** The extractor's file name rule (tools/local-extract/skin_extract.py file_name): `#` → `-`, anything else outside
 *  [A-Za-z0-9_.] (a `-` included) stops the run. */
export function fileName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_.#]+$/.test(name) || !name.replace(/\./g, '')) {
    throw new Error(`fetch-skin-art: no file name rule for ${JSON.stringify(name)} (only A-Z a-z 0-9 _ . # are known; docs/rules/render.md 「스킨 모델 소재」)`);
  }
  return name.replace(/#/g, '-');
}

/** The list path of a skin's picture: the extractor's path for it, under /assets/spine/skin/. */
export const listPath = (s, kind, id) => `${LIST_PREFIX}${fileName(s.owner)}/${fileName(s.prefab)}/${kind}/${fileName(id)}.png`;

/**
 * What to take from the repository for each skin.
 * @param {Record<string, any>} skins  skins.json `skins`
 * @param {Record<string, any>} table  skin_table.json `charSkins`
 * @param {{ path: string, size: number, sha: string }[]} blobs  the repository files under avatar/ and portrait/
 * @returns {{ want: { key: string, kind: string, repoPath: string, path: string }[], missing: Record<string, string[]> }}
 */
export function planArt(skins, table, blobs) {
  const exact = new Set(blobs.map((b) => b.path));
  const byLower = new Map();
  for (const b of blobs) {
    const k = b.path.toLowerCase();
    byLower.set(k, byLower.has(k) ? null : b.path); // null: two files differ only in case
  }
  const want = [], missing = {};
  for (const [key, s] of Object.entries(skins)) {
    const rec = table[key];
    if (!rec) throw new Error(`fetch-skin-art: skin ${key} of skins.json is not in skin_table.json — rerun tools/local-extract/skin_extract.py or update the table`);
    for (const [kind, field] of Object.entries(KINDS)) {
      const id = rec[field];
      if (typeof id !== 'string' || !id) continue; // the record has no such picture (a summon skin: no portrait)
      const name = `${kind}/${id}.png`;
      const repoPath = exact.has(name) ? name : byLower.get(name.toLowerCase());
      if (repoPath === null) throw new Error(`fetch-skin-art: ${key}: two files of ${REPO} differ from ${name} only in case`);
      if (repoPath) want.push({ key, kind, repoPath, path: listPath(s, kind, id) });
      else (missing[key] ||= []).push(kind);
    }
  }
  return { want, missing };
}

/** A PNG's width and height (its IHDR chunk), or an error for anything else. */
export function pngSize(buf, what) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error(`${what}: not a PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

async function loadTree(ref, offline) {
  if (!/^[0-9a-f]{40}$/.test(ref)) {
    if (offline) throw new Error('--offline needs --ref <commit>');
    ref = (await getJson(`${API}/commits/${ref}`)).sha;
  }
  const file = join(CACHE, `tree-${ref}.json`);
  if (existsSync(file)) return { ref, blobs: JSON.parse(await readFile(file, 'utf8')) };
  if (offline) throw new Error(`no cached tree for ${ref} (${file})`);
  const root = await getJson(`${API}/git/trees/${ref}`);
  const blobs = [];
  for (const kind of Object.keys(KINDS)) {
    const sub = root.tree.find((x) => x.path === kind && x.type === 'tree');
    if (!sub) throw new Error(`${REPO}@${ref} has no ${kind}/ folder`);
    const tree = await getJson(`${API}/git/trees/${sub.sha}`);
    if (tree.truncated) throw new Error(`${REPO} ${kind}/ tree came back truncated`);
    for (const x of tree.tree) if (x.type === 'blob') blobs.push({ path: `${kind}/${x.path}`, size: x.size, sha: x.sha });
  }
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(blobs));
  return { ref, blobs };
}

async function fetchFile(ref, blob, offline) {
  const file = join(CACHE, blob.path);
  if (existsSync(file)) {
    const buf = await readFile(file);
    if (blobId(buf) === blob.sha) return buf;
  }
  if (offline) throw new Error(`not cached: ${blob.path}`);
  let last = 'no source';
  for (const url of [cdnUrl(ref, blob.path), rawUrl(ref, blob.path)]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
        if (!r.ok) { last = `HTTP ${r.status}`; break; }
        const buf = Buffer.from(await r.arrayBuffer());
        if (blobId(buf) !== blob.sha) { last = 'other bytes than the tree names'; break; }
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file + '.tmp', buf);
        await rename(file + '.tmp', file);
        return buf;
      } catch (e) { last = e?.name || String(e); }
    }
  }
  throw new Error(`${blob.path}: ${last}`);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const offline = args.includes('--offline');
  const concurrency = Math.max(1, Number(opt('--concurrency', 8)) || 8);
  const index = join(ROOT, SKIN_DIR, 'skins.json');
  if (!existsSync(index)) throw new Error(`no ${SKIN_DIR}/skins.json: run tools/local-extract/skin_extract.py first`);
  if (!existsSync(TABLE)) throw new Error(`no ${TABLE}: the official skin table (tools/local-extract/skin_extract.py downloads it)`);
  const skins = JSON.parse(await readFile(index, 'utf8')).skins;
  const table = JSON.parse(await readFile(TABLE, 'utf8')).charSkins || {};
  const { ref, blobs } = await loadTree(opt('--ref', 'main'), offline);
  const { want, missing } = planArt(skins, table, blobs);
  const byPath = new Map(blobs.map((b) => [b.path, b]));
  const unique = [...new Set(want.map((w) => w.repoPath))];
  const bufs = new Map();
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < unique.length) {
      const p = unique[next++];
      bufs.set(p, await fetchFile(ref, byPath.get(p), offline));
      if (++done % 100 === 0) console.log(`[skin-art] ${done}/${unique.length} files`);
    }
  }));
  const out = { version: 1, repo: REPO, ref, skins: {}, files: [], missing };
  const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
  const listed = new Map();
  for (const w of want) {
    const buf = bufs.get(w.repoPath);
    (out.skins[w.key] ||= {})[w.kind] = { path: w.path, ...pngSize(buf, w.repoPath) };
    listed.set(w.path, { p: w.path, s: buf.length, h: sha256(buf), u: rawUrl(ref, w.repoPath) });
  }
  out.files = [...listed.values()].sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
  const target = join(ROOT, SKIN_DIR, 'art.json');
  await writeFile(target + '.tmp', JSON.stringify(out));
  await rename(target + '.tmp', target);
  const count = (kind) => want.filter((w) => w.kind === kind).length;
  const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
  console.log(`[skin-art] ${REPO}@${ref.slice(0, 12)}: ${count('avatar')} avatars, ${count('portrait')} portraits, ${out.files.length} files, ${mb(out.files.reduce((n, f) => n + f.s, 0))}; missing ${Object.keys(missing).length}: ${Object.entries(missing).map(([k, v]) => `${k} (${v.join(', ')})`).join(', ') || '-'}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('[skin-art]', e.message || e); process.exit(1); });
}
