#!/usr/bin/env node
// tools/map-previews.mjs — one preview picture per 卫戍协议 battlefield for the briefing (screens/briefing.js, under the
// stage name). The client has map previews for its ordinary stages (arts/ui/stage_mappreview_*.ab: a 512 × 512 shot of
// the real 3D scene from above at a slight tilt, red entry and blue objective boxes on it) but none for the autochess
// stages, so this draws them the same way with our own board (render/board3d BoardScene + the official scenes of the
// local-client extraction, docs/local/official-scenes.md): the left normal field with its bench and the enemy pen's
// gates, 30° pitch (the client's battle camera), 512 × 512, WebP.
//
// It drives a real Chrome (GPU) against a running server that has the local-client extraction (assets/local scene/*):
//
//   node tools/map-previews.mjs --base http://localhost:3011 [--chrome <path>] [--only id,id] [--size 512]
//
// Writes public/assets/local/stage/preview/<stageId>.webp (git-ignored, like every local-client asset) and the
// `stage/preview` group of data/local-assets.json (other groups kept). Run tools/build-browser-resources.mjs after it.
// Chrome: --chrome, else CHROME_PATH, else the usual Windows / macOS / Linux path. Every wait has a hard limit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  opt[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
}

export const GROUP = 'stage/preview';
/** What a preview frames (inclusive tiles): the left normal field, its bench row and the pen's gates behind it. */
export const FRAME = Object.freeze({ r0: 7, r1: 12, c0: 0, c1: 10 });
/** The lit area (render/board3d/layout.js AREAS.normal[0]): the rest of the island is dimmed as in play. */
export const FOCUS = Object.freeze({ r0: 6, r1: 13, c0: 0, c1: 10 });
/** The battlefields: every stage the modes draw (data/stages.json ids ending in _mNN; the 联防 positions are not). */
export const isBattlefield = (id) => /autochess_m\d+$/.test(String(id || ''));

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];

async function main() {
  const base = String(opt.base || 'http://localhost:3011').replace(/\/$/, '');
  const size = Math.max(64, Math.min(2048, Number(opt.size) || 512));
  const chrome = typeof opt.chrome === 'string' ? opt.chrome : process.env.CHROME_PATH || CHROMES.find((p) => fs.existsSync(p));
  if (!chrome) throw new Error('no Chrome: pass --chrome or set CHROME_PATH');
  const stages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'));
  const only = typeof opt.only === 'string' ? new Set(opt.only.split(',')) : null;
  const ids = Object.keys(stages).filter(isBattlefield).filter((id) => !only || only.has(id)).sort();
  if (!ids.length) throw new Error('no stage to draw');
  const outDir = path.join(ROOT, 'public/assets/local', GROUP);
  fs.mkdirSync(outDir, { recursive: true });

  const hard = setTimeout(() => { console.error('map-previews: hard timeout'); process.exit(2); }, 60000 + ids.length * 30000);
  const profile = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'map-previews-'));
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: 'new', protocolTimeout: 120000,
    args: [`--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', '--ignore-gpu-blocklist'],
  });
  const problems = [];
  let shots;
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => problems.push(e.message));
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    shots = await page.evaluate(async ({ ids, size, frame, focus }) => {
      const { assets } = await import('/js/assets.js');
      const { data } = await import('/js/data.js');
      const { loadBoard3d } = await import('/js/render/board3d/load.js');
      const { BoardScene } = await import('/js/render/board3d/scene.js');
      const { loadOfficialScene } = await import('/js/render/board3d/official.js');
      const { AREAS } = await import('/js/render/board3d/layout.js');
      const { fitCamera, CAMERA_PRESETS } = await import('/js/render/projection.js');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      await data.loadAll('stages');
      const b3 = await loadBoard3d(assets);
      if (b3.status !== 'ok') throw new Error(`3D board unavailable: ${b3.why}`);
      const doc = globalThis.document;
      const canvas = doc.createElement('canvas');
      Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', width: `${size}px`, height: `${size}px`, zIndex: '99999' });
      doc.body.appendChild(canvas);
      const board = new BoardScene(b3.THREE, b3.pack, { canvas, antialias: true, shadows: true, loadOfficial: (id) => loadOfficialScene(assets, id), official: true });
      board.resize(size, size, 1);
      const cam = fitCamera(frame, { width: size, height: size }, { tilt: CAMERA_PRESETS.normal.tilt, dist: 16, margin: 0.3, headroom: 0.6, maxTilePx: 999 });
      const out = [];
      for (const id of ids) {
        const stage = data.lookup('stages', id);
        board.setArea(AREAS.normal);
        board.setStage(stage);
        board.setFocus(focus);
        // the official scene loads asynchronously: set the stage again until it is built (≤ 15 s)
        for (let i = 0; i < 150 && !board.stats().official; i++) { await sleep(100); board.setStage({ ...stage }); }
        let t = 0;
        for (let i = 0; i < 40; i++) { t += 0.05; board.render(cam, t); await new Promise((r) => globalThis.requestAnimationFrame(r)); }
        board.render(cam, t + 0.05);
        out.push({ id, official: board.stats().official, url: canvas.toDataURL('image/webp', 0.9) });
      }
      board.destroy();
      return out;
    }, { ids, size, frame: FRAME, focus: FOCUS });
  } finally {
    clearTimeout(hard);
    await browser.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }

  const group = {};
  for (const s of shots) {
    if (!s.official) { console.warn(`${s.id}: no official scene on this server — skipped`); continue; }
    const file = `${s.id}.webp`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(s.url.split(',')[1], 'base64'));
    group[s.id] = { path: `/assets/local/${GROUP}/${file}`, w: size, h: size, kind: 'Image', webp: 'lossy' }; // WebP only, no PNG beside it
    console.log(`${s.id} → ${path.relative(ROOT, path.join(outDir, file))}`);
  }
  const manPath = path.join(ROOT, 'data/local-assets.json');
  const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  const groups = { ...(man.groups || {}), [GROUP]: { ...(only ? man.groups?.[GROUP] : null), ...group } };
  const sorted = Object.fromEntries(Object.keys(groups).sort().map((g) => [g, Object.fromEntries(Object.entries(groups[g]).sort(([a], [b]) => a.localeCompare(b)))]));
  man.groups = sorted;
  man.count = Object.values(sorted).reduce((n, g) => n + Object.keys(g).length, 0);
  fs.writeFileSync(manPath, JSON.stringify(man));
  if (problems.length) console.warn('page errors:', problems);
  console.log(`${Object.keys(group).length} preview(s); data/local-assets.json updated — now run node tools/build-browser-resources.mjs`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e?.stack || e); process.exit(1); });
}
