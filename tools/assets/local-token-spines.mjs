#!/usr/bin/env node
// Local-client token Spine models (local patch, docs/LOCAL-PATCH.md): 선발 오퍼레이터 summons whose model no community
// dump carries (望's 棋子; 维什戴尔's 魂灵之影 default skin), extracted by tools/local-extract/token_spines.py to
// public/assets/local/spine/token/<id>/ (data/local-assets.json group spine/token/<id>).
//
//   node tools/assets/local-token-spines.mjs     rewrite tools/assets/local-token-spines.json from the extracted models
//
// tools/fetch-assets.mjs (addDiyTokenAssets / addDiyTokenModels) puts them in data/assets.json as tokens[id].spineLocal, with the token's
// avatar; public/js/assets.js spineEntry draws them once data/local-assets.json lists every file (like the enemies').

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { localEnemySpineMeta } from './spine.mjs';
import { literal } from './manifest.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const LOCAL_TOKEN_SPINES_FILE = 'tools/assets/local-token-spines.json';
export const LOCAL_TOKEN_SPINE_DIR = 'local/spine/token/';
const YUAN = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/';

/** Extracted token models under public/assets (same shape as spine.mjs findLocalEnemyModels). */
export async function findLocalTokenModels(root) {
  const out = {};
  let ids = [];
  try { ids = (await readdir(join(root, LOCAL_TOKEN_SPINE_DIR), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const id of ids.sort()) {
    if (!/^token_\d+_[a-z0-9_]+$/i.test(id)) continue;
    const dir = `${LOCAL_TOKEN_SPINE_DIR}${id}/`;
    let files = [];
    try { files = (await readdir(join(root, dir))).sort(); } catch { continue; }
    const skel = files.find((f) => f.endsWith('.skel'));
    const stem = skel ? skel.slice(0, -'.skel'.length) : null;
    const pngs = files.filter((f) => f.endsWith('.png'));
    if (!stem || !files.includes(`${stem}.atlas`) || !pngs.length) continue;
    out[id] = { dir, skel: dir + skel, atlas: `${dir}${stem}.atlas`, pngs: pngs.map((f) => dir + f) };
  }
  return out;
}

/** The committed metadata (tokenId → LocalSpineMeta), {} when missing. */
export async function loadLocalTokenSpines(root = ROOT) {
  try {
    const j = JSON.parse(await readFile(join(root, LOCAL_TOKEN_SPINES_FILE), 'utf8'));
    return j && j.models && typeof j.models === 'object' && !Array.isArray(j.models) ? j.models : {};
  } catch { return {}; }
}

/** Add the 선발 operators' tokens (data/diy.json tokens, absent from data/tokens.json) to a loaded 07-assets.json as
 * avatar-only records (yuanyan3060; no web Spine), so buildPlan lists them in data/assets.json tokens (mutates). */
export function addDiyTokenAssets(assets07, diy) {
  if (!assets07 || !diy?.tokens) return assets07;
  const tokens = { ...(assets07.tokens || {}) };
  for (const [id, t] of Object.entries(diy.tokens)) {
    if (!/^token_\d+_[a-z0-9_]+$/i.test(id) || tokens[id]) continue;
    tokens[id] = { name: t?.name ?? id, avatar: { url: `${YUAN}avatar/${id}.png` }, battleSpineDefault: null, battleSpineSkinVariantsOnly: [] };
  }
  assets07.tokens = tokens;
  return assets07;
}

/** Put `spineLocal` (group spine/token/<id> + the committed metadata) on the planned DIY tokens (mutates the plan). */
export async function addDiyTokenModels(plan, diy, root = ROOT) {
  const models = await loadLocalTokenSpines(root);
  const tokens = plan?.template?.tokens;
  if (!tokens) return plan;
  for (const id of Object.keys(diy?.tokens || {})) {
    if (tokens[id] && models[id] && typeof models[id] === 'object') tokens[id].spineLocal = literal({ group: `spine/token/${id}`, ...models[id] });
  }
  return plan;
}

async function main() {
  const assets = join(ROOT, 'public', 'assets');
  const found = await findLocalTokenModels(assets);
  if (!Object.keys(found).length) {
    console.log(`[local-token-spines] no extracted token model under public/assets/${LOCAL_TOKEN_SPINE_DIR} — ${LOCAL_TOKEN_SPINES_FILE} kept`);
    return;
  }
  const { meta, problems } = await localEnemySpineMeta(assets, found);
  for (const p of problems) console.log(`[local-token-spines] ${p}`);
  const doc = {
    about: 'Spine metadata of the 선발 operators\' token models only the local client has (tools/local-extract/token_spines.py); '
      + 'data/assets.json tokens[id].spineLocal. Written by node tools/assets/local-token-spines.mjs (local patch).',
    models: Object.fromEntries(Object.keys(meta).sort().map((k) => [k, meta[k]])),
  };
  await writeFile(join(ROOT, LOCAL_TOKEN_SPINES_FILE), JSON.stringify(doc, null, 2) + '\n');
  console.log(`[local-token-spines] ${Object.keys(meta).length} model(s) → ${LOCAL_TOKEN_SPINES_FILE}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((e) => { console.error(e?.stack || e); process.exitCode = 1; });
}
