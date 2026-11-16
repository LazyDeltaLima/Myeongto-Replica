#!/usr/bin/env node
// Skin battle models from fexli/ArknightsResource (maintainer decision 2026-11-16): this server never sends the skin
// models, the browser takes them from that repository (jsDelivr, then GitHub raw) and keeps them only when size + SHA-256
// match the resource list. This tool writes what the list needs for that, public/assets/local/spine/skin/models.json:
//
//   { version, repo, ref,                                  the repository commit every URL names (pinned: a file the
//                                                          repository replaces later never fails the hash check)
//     skins: { <skin key>: { dir, alias?, front: <side>, back? } },
//     files: [{ p, s, h, u }],                             entries tools/build-browser-resources.mjs adds to the list
//     missing: { <skin key>: why } }                       skins the repository lacks: drawn with the default model
//
//   <side> = { skel, atlas, pages: [png…],                 list paths, below
//              pma, anims, animations, events, hits, bounds }   what drawing it needs (render/skin-gate.js), the fields of a
//                                                          data/assets.json model entry, read from the repository's files:
//     pma         the pages' kind, each page measured (tools/assets/spine.mjs premultipliedPage): the repository's pages are of
//                 both kinds and its atlases carry no `pma:` line; a side whose pages disagree stops the run
//     anims       the skin's own key table (.cache/anim-keys.json `skins[key]`, tools/local-extract/anim_keys.py) through the
//                 default models' path (spine.mjs modelAnims): 15 skins key their clips otherwise than the default model, so
//                 the owner's default table is never borrowed; a skin without its table stops the run
//     animations / events / hits / bounds   its own skeleton's (tools/assets/skel.mjs parseSkel)
//
// The skins are those of skins.json (tools/local-extract/skin_extract.py, the official skin table). A skin's folder in
// the repository is `spine/<owner>/<prefab id, # → _>/` (case-insensitive), with `Front/` + `Back/`, or `Spine/` for a
// model with one side. A skin the repository files under another name (4 on 2026-11-16, e.g. the three 鹰 summons of
// 银灰's sale#20 skin share one `…_eagle_sale_20` folder) is found by the same letters (digits, `_` and `#` left out)
// and the same skeleton sizes as the extracted model, in the owner's folder but never its default model; anything else
// is missing, and two such folders stop the run (an unknown case). The list paths keep the repository's file names under
// /assets/spine/skin/<owner>/<folder>/<front|back>/, so an atlas finds its page next to it; nothing is on disk there.
//
// Every file is downloaded once into .cache/skin-models/ and checked against the repository tree (git blob id), so a
// later run downloads only what changed. GitHub API: three anonymous calls, none when --ref names a cached tree.
//
//   node tools/fetch-skin-models.mjs [--ref <commit>] [--concurrency 8] [--offline]
//   --offline   no network: the cached tree and files only (stops on a file that is not cached)

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAtlas, atlasInfo } from './assets/atlas.mjs';
import { parseSkel } from './assets/skel.mjs';
import { decodePng } from './assets/formats.mjs';
import { premultipliedPage, modelAnims, loadAnimKeys, loadAttackTiming } from './assets/spine.mjs';
import { loadCharModes } from './assets/skill-mode-sfx.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const REPO = 'fexli/ArknightsResource';
export const SKIN_DIR = 'public/assets/local/spine/skin';
export const LIST_PREFIX = '/assets/spine/skin/';
const API = `https://api.github.com/repos/${REPO}`;
const CACHE = join(ROOT, '.cache', 'skin-models');

export const rawUrl = (ref, path) => `https://raw.githubusercontent.com/${REPO}/${ref}/spine/${path}`;
const cdnUrl = (ref, path) => `https://cdn.jsdelivr.net/gh/${REPO}@${ref}/spine/${path}`;
/** git's blob id of a file's bytes (the tree's `sha`). */
export const blobId = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const letters = (s) => s.toLowerCase().replace(/[0-9_#]/g, '');

/**
 * A skin's folder and side folders in the repository tree.
 * @param {Record<string, any>} skins  skins.json `skins`
 * @param {{ path: string, size: number }[]} blobs  the tree's files under spine/, paths relative to it
 * @param {(key: string, s: any) => number[]} skelSizes  the extracted model's skeleton sizes, front first
 * @returns {{ found: Record<string, { dir: string, sides: string[], alias?: boolean }>, missing: Record<string, string> }}
 */
export function matchSkins(skins, blobs, skelSizes) {
  const dirs = new Map(); // 'owner/folder' → Map('Side/name.ext' → size)
  for (const b of blobs) {
    const parts = b.path.split('/');
    if (parts.length !== 4) continue;
    const d = parts[0] + '/' + parts[1];
    if (!dirs.has(d)) dirs.set(d, new Map());
    dirs.get(d).set(parts[2] + '/' + parts[3], b.size);
  }
  const byLower = new Map([...dirs.keys()].map((d) => [d.toLowerCase(), d]));
  const found = {}, missing = {};
  for (const [key, s] of Object.entries(skins)) {
    const two = !!s.back;
    const sidesOf = (d) => {
      const files = dirs.get(d), name = d.split('/')[1];
      const sides = two ? ['Front', 'Back'] : files.has(`Spine/${name}.skel`) ? ['Spine'] : ['Front'];
      return sides.every((x) => ['skel', 'atlas', 'png'].every((e) => files.has(`${x}/${name}.${e}`))) ? sides : null;
    };
    const exact = byLower.get(`${s.owner}/${s.prefab.replace(/#/g, '_')}`.toLowerCase());
    const exactSides = exact && sidesOf(exact);
    if (exactSides) { found[key] = { dir: exact, sides: exactSides }; continue; }
    const sizes = skelSizes(key, s);
    const want = letters(s.prefab);
    const cands = [];
    for (const d of dirs.keys()) {
      const [owner, folder] = d.split('/');
      if (owner.toLowerCase() !== s.owner.toLowerCase() || folder.toLowerCase() === s.owner.toLowerCase() || letters(folder) !== want) continue;
      const sides = sidesOf(d);
      if (sides && sides.map((x) => dirs.get(d).get(`${x}/${folder}.skel`)).join() === sizes.join()) cands.push({ dir: d, sides });
    }
    if (cands.length > 1) throw new Error(`${key}: ${cands.length} folders of ${REPO} could be its model (${cands.map((c) => c.dir).join(', ')}) — name it in this tool`);
    if (cands.length === 1) found[key] = { ...cands[0], alias: true };
    else missing[key] = `no folder of ${REPO} (spine/${s.owner}/${s.prefab.replace(/#/g, '_')}, or one with its letters and skeleton sizes)`;
  }
  return { found, missing };
}

/** The skill indices a default model's roles were resolved for (primary first, as tools/assets/plan.mjs plans them). */
export const skillIndicesOf = (anims) => {
  const ks = Object.keys(anims?.skills || {}).map(Number).sort((a, b) => a - b);
  const p = anims?.skill?.index;
  return !ks.length ? [0] : ks.includes(p) ? [p, ...ks.filter((i) => i !== p)] : ks;
};

/**
 * What drawing one side of a skin model needs: `{ pma, anims, animations, events, hits, bounds }`.
 * @param {string} key the skin key (skins.json) @param {any} s its skins.json record @param {'front'|'back'} side
 * @param {{ skel: Uint8Array, atlas: string, pages: Uint8Array[] }} files the repository's files of the side
 * @param {{ animKeys: any, timing: any, charModes: any, chars: Record<string, any>, problems?: string[] }} ctx
 *   animKeys: spine.mjs loadAnimKeys; chars: data/assets.json `chars` (the default models' skill indices)
 */
export function sideFields(key, s, side, files, { animKeys, timing, charModes, chars, problems = [] }) {
  const op = /^char_/.test(s.owner), tok = /^token_/.test(s.owner);
  if (!op && !tok) throw new Error(`${key}: owner ${s.owner} is neither an operator nor a summon`);
  const skin = animKeys?.skins?.[key];
  if (!skin || skin.owner !== s.owner) throw new Error(`${key}: no key table of its own in .cache/anim-keys.json skins (run tools/local-extract/anim_keys.py; docs/rules/render.md 「스킨 렌더 게이트」)`);
  let base = null;
  if (op) {
    base = chars?.[s.owner]?.spine?.front?.anims;
    if (!base) throw new Error(`${key}: ${s.owner} has no default model in data/assets.json`);
  }
  const kinds = files.pages.map((buf) => premultipliedPage(decodePng(buf)));
  if (!kinds.length || kinds.some((k) => k !== kinds[0])) throw new Error(`${key} ${side}: its pages are of both kinds (${kinds.join(', ')}) — one model entry has one \`pma\``);
  const sk = parseSkel(new Uint8Array(files.skel), atlasInfo(files.atlas).regions);
  if (!sk.animations.length) throw new Error(`${key} ${side}: the skeleton has no animations`);
  if (sk.missingRegions?.length) problems.push(`${key} ${side}: ${sk.missingRegions.length} attachment(s) not in its atlas (e.g. ${sk.missingRegions[0]})`);
  const anims = modelAnims(op ? `op:${s.owner}:${side}` : `token:${s.owner}`, sk, {
    skillIndices: op ? skillIndicesOf(base) : [0], animKeys, timing, charModes, skin: { keys: skin.keys || {}, mix: skin.mix || [] }, problems,
  });
  return { pma: kinds[0], anims, animations: sk.durations, events: sk.events, hits: sk.hits, bounds: sk.bounds };
}

/** The list path of a repository file 'owner/folder/Side/name.ext'. */
export const listPath = (repoPath) => {
  const [owner, folder, side, file] = repoPath.split('/');
  return `${LIST_PREFIX}${owner}/${folder}/${side === 'Back' ? 'back' : 'front'}/${file}`;
};

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
  const spine = root.tree.find((x) => x.path === 'spine' && x.type === 'tree');
  if (!spine) throw new Error(`${REPO}@${ref} has no spine/ folder`);
  const tree = await getJson(`${API}/git/trees/${spine.sha}?recursive=1`);
  if (tree.truncated) throw new Error(`${REPO} spine/ tree came back truncated`);
  const blobs = tree.tree.filter((x) => x.type === 'blob').map(({ path, size, sha }) => ({ path, size, sha }));
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(blobs));
  return { ref, blobs };
}

async function fetchFile(ref, blob, offline) {
  const file = join(CACHE, 'spine', blob.path);
  if (existsSync(file)) {
    const buf = await readFile(file);
    if (blobId(buf) === blob.sha) return buf;
  }
  if (offline) throw new Error(`not cached: spine/${blob.path}`);
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
  throw new Error(`spine/${blob.path}: ${last}`);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const offline = args.includes('--offline');
  const concurrency = Math.max(1, Number(opt('--concurrency', 8)) || 8);
  const index = join(ROOT, SKIN_DIR, 'skins.json');
  if (!existsSync(index)) throw new Error(`no ${SKIN_DIR}/skins.json: run tools/local-extract/skin_extract.py first`);
  const skins = JSON.parse(await readFile(index, 'utf8')).skins;
  const { ref, blobs } = await loadTree(opt('--ref', 'main'), offline);
  const skelSizes = (key, s) => [s.front, s.back].filter(Boolean).map((side) => {
    const abs = join(ROOT, 'public', side.skel);
    if (!existsSync(abs)) throw new Error(`${key}: ${side.skel} is not extracted (needed to tell its folder in ${REPO})`);
    return readFileSync(abs).length;
  });
  const { found, missing } = matchSkins(skins, blobs, skelSizes);
  const byPath = new Map(blobs.map((b) => [b.path, b]));
  const jobs = [];
  for (const [key, m] of Object.entries(found)) {
    const name = m.dir.split('/')[1];
    for (const side of m.sides) for (const ext of ['skel', 'atlas']) jobs.push({ key, side, path: `${m.dir}/${side}/${name}.${ext}` });
  }
  const bufs = new Map();
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      bufs.set(j.path, await fetchFile(ref, byPath.get(j.path), offline));
      if (++done % 100 === 0) console.log(`[skin-models] ${done}/${jobs.length} skeletons and atlases`);
    }
  }));
  // an atlas names its pages: each must be a file of the same folder (fexli writes one `<name>.png`; a second page would
  // otherwise be drawn missing)
  const pageJobs = [];
  for (const j of jobs.filter((x) => x.path.endsWith('.atlas'))) {
    const pages = parseAtlas(bufs.get(j.path).toString('utf8')).pages.map((p) => p.name);
    if (!pages.length) throw new Error(`spine/${j.path}: an atlas without pages`);
    j.pages = pages.map((page) => {
      const p = j.path.slice(0, j.path.lastIndexOf('/') + 1) + page;
      if (!byPath.has(p)) throw new Error(`spine/${j.path}: page ${page} is not in ${REPO}`);
      pageJobs.push(p);
      return p;
    });
  }
  next = 0;
  const uniquePages = [...new Set(pageJobs)];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < uniquePages.length) {
      const p = uniquePages[next++];
      bufs.set(p, await fetchFile(ref, byPath.get(p), offline));
      if (++done % 100 === 0) console.log(`[skin-models] ${done}/${jobs.length + uniquePages.length} files`);
    }
  }));
  const out = { version: 2, repo: REPO, ref, skins: {}, files: [], missing };
  const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
  const animKeys = loadAnimKeys(ROOT);
  if (!animKeys) throw new Error('no .cache/anim-keys.json: run tools/local-extract/anim_keys.py first (each skin model draws its own key table)');
  const ctx = { animKeys, timing: loadAttackTiming(ROOT), charModes: loadCharModes(ROOT), chars: JSON.parse(await readFile(join(ROOT, 'data/assets.json'), 'utf8')).chars, problems: [] };
  for (const [key, m] of Object.entries(found)) {
    const entry = { dir: m.dir, ...(m.alias ? { alias: true } : {}) };
    for (const side of m.sides) {
      const atlas = jobs.find((j) => j.key === key && j.side === side && j.path.endsWith('.atlas'));
      const skel = atlas.path.replace(/\.atlas$/, '.skel');
      const face = side === 'Back' ? 'back' : 'front';
      const fields = sideFields(key, skins[key], face, { skel: bufs.get(skel), atlas: bufs.get(atlas.path).toString('utf8'), pages: atlas.pages.map((p) => bufs.get(p)) }, ctx);
      entry[face] = { skel: listPath(skel), atlas: listPath(atlas.path), pages: atlas.pages.map(listPath), ...fields };
    }
    out.skins[key] = entry;
  }
  for (const p of ctx.problems) console.warn('[skin-models]', p);
  for (const p of [...new Set([...jobs.map((j) => j.path), ...uniquePages])].sort()) {
    const buf = bufs.get(p);
    out.files.push({ p: listPath(p), s: buf.length, h: sha256(buf), u: rawUrl(ref, p) });
  }
  out.files.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
  const target = join(ROOT, SKIN_DIR, 'models.json');
  await writeFile(target + '.tmp', JSON.stringify(out));
  await rename(target + '.tmp', target);
  const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
  const sides = Object.values(out.skins).flatMap((e) => [e.front, e.back].filter(Boolean));
  console.log(`[skin-models] ${REPO}@${ref.slice(0, 12)}: ${Object.keys(out.skins).length} skins (${Object.values(found).filter((m) => m.alias).length} under another folder name), ${out.files.length} files, ${mb(out.files.reduce((n, f) => n + f.s, 0))}; missing ${Object.keys(missing).length}: ${Object.keys(missing).join(', ') || '-'}; sides premultiplied ${sides.filter((x) => x.pma).length} / straight ${sides.filter((x) => !x.pma).length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('[skin-models]', e.message || e); process.exit(1); });
}
