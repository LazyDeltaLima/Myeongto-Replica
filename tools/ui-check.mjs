#!/usr/bin/env node
// tools/ui-check.mjs — check one of our screens against the official UI in a real Chrome.
//
//   node tools/ui-check.mjs compare <spec.json> [--base http://localhost:3000] [--out <dir>] [--tol 2] [--chrome <path>]
//
// compare: the overlay check (docs/rules/ui.md 「크기 단위」). The spec (tools/ui-check/compare.mjs header) names an
// official screenshot, the `ui_inspect.py layout` JSON solved for it (tools/local-extract/ui_inspect.py — the prefab's
// absolute rects in that screenshot's px), our screen and the state to bring it into (tools/ui-check/browser.mjs
// header), and pairs of an official node with a CSS selector of ours. Our page is opened at the screenshot's screen
// size with our UI-size factor set so our unit is the screenshot's px per unit — one CSS px of ours is then one pixel
// of the screenshot, whatever the official player's UI scale was. For every pair the edges are compared; a pair more
// than --tol px off (default the spec's tol, else 2) is listed. The same command serves before a mockup is shown and
// after it is implemented (point the spec at the mockup's or the real screen's URL).
//
// Writes into --out (default: compare-out/ beside the spec): ours.png (our screen), overlay.png (one picture: above,
// ours at 50 % over the official screenshot with the official rects in cyan and ours in magenta, listed pairs
// numbered in red; below, the per-pixel difference), compare.json (every row, the scale used, the source revision,
// failed requests and page errors). Exit 0 = nothing listed or missing, 1 = something is, 2 = the run failed.
// Under WSL: CHROME_PATH=test/helpers/wsl-windows-chrome.sh (the Windows Chrome), and a server you started yourself.

/* global document, Image -- inside page.evaluate callbacks, which run in the browser */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openScreen, domRect } from './ui-check/browser.mjs';
import { loadSpec, comparePairs, formatReport } from './ui-check/compare.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) opt[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else pos.push(a);
  }
  return { pos, opt };
}

/** The source revision the screen was drawn from: HEAD and the uncommitted files under public/ (they change the screen). */
function revision() {
  try {
    const head = execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%h %s'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'public', 'shared'], { encoding: 'utf8' })
      .split('\n').filter(Boolean).map((l) => l.slice(3));
    return { head, dirty };
  } catch { return { head: null, dirty: [] }; }
}

/** Draw overlay.png in the browser (no image library): blend + rects above, difference below. */
async function drawOverlay(browser, { shot, ours, rows, size }) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 64, height: 64, deviceScaleFactor: 1 });
    const mime = /\.jpe?g$/i.test(shot) ? 'image/jpeg' : 'image/png';
    const a = `data:${mime};base64,${fs.readFileSync(shot).toString('base64')}`;
    const b = `data:image/png;base64,${Buffer.from(ours).toString('base64')}`;
    const url = await page.evaluate(async ({ a, b, rows, size }) => {
      const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
      const [A, B] = await Promise.all([load(a), load(b)]);
      const W = size?.[0] || A.naturalWidth, H = size?.[1] || A.naturalHeight;
      const c = document.createElement('canvas');
      c.width = W; c.height = H * 2;
      const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H * 2);
      g.drawImage(A, 0, 0, W, H);
      g.globalAlpha = 0.5; g.drawImage(B, 0, 0); g.globalAlpha = 1;
      g.lineWidth = 1; g.font = 'bold 14px sans-serif';
      for (const r of rows) {
        if (r.official) { g.strokeStyle = 'rgba(0,240,255,.9)'; g.strokeRect(r.official.x + 0.5, r.official.y + 0.5, r.official.w, r.official.h); }
        if (r.ours) { g.strokeStyle = 'rgba(255,0,220,.9)'; g.strokeRect(r.ours.x + 0.5, r.ours.y + 0.5, r.ours.w, r.ours.h); }
        if (r.status === 'listed' && (r.ours || r.official)) {
          const p = r.ours || r.official;
          g.fillStyle = '#ff3030'; g.fillText(`#${r.i}`, p.x + 2, p.y + 14);
        }
      }
      g.drawImage(A, 0, H, W, H);
      g.globalCompositeOperation = 'difference'; g.drawImage(B, 0, H);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif';
      g.fillText('ours 50% over official · cyan official · magenta ours', 8, 22);
      g.fillText('difference', 8, H + 22);
      return c.toDataURL('image/png');
    }, { a, b, rows, size });
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  } finally { await page.close().catch(() => {}); }
}

async function compare(specFile, opt) {
  const spec = loadSpec(specFile);
  if (opt.tol != null && opt.tol !== true) spec.tol = Number(opt.tol);
  const outDir = path.resolve(typeof opt.out === 'string' ? opt.out : path.join(spec.dir, 'compare-out'));
  fs.mkdirSync(outDir, { recursive: true });
  const base = typeof opt.base === 'string' ? opt.base : 'http://localhost:3000';
  const hard = setTimeout(() => { console.error('ui-check: hard timeout'); process.exit(2); }, 300000);
  const rev = revision();
  const s = await openScreen(spec.ours, { base, chrome: opt.chrome, log: (m) => console.log(m) });
  try {
    const rects = [];
    for (const p of spec.pairs) rects.push(await domRect(s.page, p.sel, p.nth));
    const png = await s.page.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(outDir, 'ours.png'), png);
    const res = comparePairs(spec, rects);
    if (spec.shot) fs.writeFileSync(path.join(outDir, 'overlay.png'), await drawOverlay(s.browser, { shot: spec.shot, ours: png, rows: res.rows }));
    const report = {
      tool: 'ui-check compare', spec: path.resolve(specFile), url: spec.ours.url, viewport: spec.ours.viewport, revision: rev,
      official: { pxPerUnit: spec.pxPerUnit, offset: spec.offset, screen: spec.screen, units: spec.units },
      ours: s.scale, tol: spec.tol, rows: res.rows, problems: s.problems,
    };
    fs.writeFileSync(path.join(outDir, 'compare.json'), `${JSON.stringify(report, null, 1)}\n`);
    console.log(`src ${rev.head}${rev.dirty.length ? `  uncommitted: ${rev.dirty.join(' ')}` : ''}`);
    console.log(`official ${spec.pxPerUnit} px/unit · ours ${s.scale.pxPerUnit.toFixed(4)} px/unit${s.scale.k != null ? ` (--ui-k ${s.scale.k.toFixed(4)})` : ''}`);
    if (Math.abs(s.scale.pxPerUnit - spec.pxPerUnit) / spec.pxPerUnit > 0.002) console.log('  WARNING: the units differ by more than 0.2 % — the rects are not in the same scale');
    for (const l of formatReport(res, spec.tol)) console.log(l);
    if (s.problems.requests.length || s.problems.errors.length) console.log(`page: ${s.problems.requests.length} failed requests, ${s.problems.errors.length} errors (compare.json)`);
    console.log(`→ ${outDir}`);
    return res.listed.length || res.missing.length ? 1 : 0;
  } finally {
    clearTimeout(hard);
    await s.close();
  }
}

const { pos, opt } = parseArgs(process.argv.slice(2));
const [cmd, file] = pos;
if (cmd !== 'compare' || !file) {
  console.error('usage: node tools/ui-check.mjs compare <spec.json> [--base URL] [--out DIR] [--tol PX] [--chrome PATH]');
  process.exit(2);
}
compare(file, opt).then((code) => process.exit(code), (e) => { console.error(e?.stack || e); process.exit(2); });
