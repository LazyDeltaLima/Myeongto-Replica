// tools/ui-check/compare.mjs — the numbers of `ui-check compare` (no browser here): read a spec, find each pair's
// official rect in the `ui_inspect.py layout` JSON (tools/local-extract/ui_inspect.py, "Output (layout)", schema 1) and
// compare it with our DOM rect, edge by edge, in the official screenshot's pixels.
//
// Spec (JSON; relative paths are relative to the spec file):
//   official  { shot: the official screenshot, layouts: { name: layout JSON solved with --screen / --px-per-unit for
//               that screenshot } }
//   ours      the screen and its state (tools/ui-check/browser.mjs header). Its viewport defaults to the layouts'
//             canvas.screen and its unit to their canvas.pxPerUnit (uiPxPerUnit), so one CSS px of ours is one pixel of
//             the screenshot (+ canvas.offset, where the screen's top left sits in the image)
//   tol       px (default 2): a pair whose edge differs more is listed
//   pairs     [{ name, layout, node: the node's `path`, sel: a CSS selector, nth (default 0), axes: the edges compared —
//               letters of l t r b (left, top, right, bottom) c m (centre x, middle y), or "xy" = ltrb (default),
//               "x" = lr, "y" = tb (a MiddleLeft text: "lm", its box is the font's), note: shown with the row,
//               skip: why it cannot match (a substituted font, compression, an animation's moment …) }]
//             a skipped pair is measured and drawn but never listed; a pair whose official value is 「모름」 (the tool
//             could not solve it) is reported apart with the layout's reason.

import fs from 'node:fs';
import path from 'node:path';

export const UNKNOWN = '모름';
export const SCHEMA = 1;

/** Read a spec file and resolve its paths; the layouts are loaded (schema checked). */
export function loadSpec(file) {
  const dir = path.dirname(path.resolve(file));
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  return resolveSpec(spec, dir, (p) => JSON.parse(fs.readFileSync(p, 'utf8')));
}

/** The same for a spec object: `read(path)` returns a layout JSON. */
export function resolveSpec(spec, dir, read) {
  const off = spec.official || {};
  if (!off.layouts || !Object.keys(off.layouts).length) throw new Error('ui-check: spec.official.layouts is empty');
  const layouts = {};
  for (const [name, p] of Object.entries(off.layouts)) {
    const j = read(path.resolve(dir, p));
    if (j.schema !== SCHEMA) throw new Error(`ui-check: layout ${name} (${p}) has schema ${j.schema}, this tool reads ${SCHEMA}`);
    if (!j.canvas?.pxPerUnit) throw new Error(`ui-check: layout ${name} was solved without --screen / --px-per-unit (no screenshot px)`);
    layouts[name] = j;
  }
  const canvases = Object.values(layouts).map((j) => j.canvas);
  const c0 = canvases[0];
  for (const c of canvases) {
    if (Math.abs(c.pxPerUnit - c0.pxPerUnit) > 1e-6 || String(c.offset) !== String(c0.offset) || String(c.screen) !== String(c0.screen)) {
      throw new Error('ui-check: the layouts were solved for different screens (pxPerUnit / offset / screen differ)');
    }
  }
  const ours = { ...spec.ours };
  if (!ours.url) throw new Error('ui-check: spec.ours.url is missing');
  ours.viewport = ours.viewport || c0.screen.map((v) => Math.round(v));
  if (ours.uiK == null && ours.uiPxPerUnit == null) ours.uiPxPerUnit = c0.pxPerUnit;
  if ((ours.dpr || 1) !== 1) throw new Error('ui-check: compare needs dpr 1 (one CSS px = one screenshot px)');
  const pairs = (spec.pairs || []).map((p, i) => {
    if (!p.layout || !layouts[p.layout]) throw new Error(`ui-check: pair ${i} (${p.name || p.node}) names no known layout "${p.layout}"`);
    if (!p.node || !p.sel) throw new Error(`ui-check: pair ${i} needs node and sel`);
    if (p.axes && !EDGE_SETS[p.axes] && !/^[ltrbcm]+$/.test(p.axes)) throw new Error(`ui-check: pair ${i} axes "${p.axes}" is not xy / x / y or letters of ltrbcm`);
    return { name: p.name || p.node.split('/').pop(), nth: 0, axes: 'xy', ...p };
  });
  if (!pairs.length) throw new Error('ui-check: spec.pairs is empty');
  return {
    dir, layouts, ours, pairs, tol: spec.tol ?? 2,
    shot: off.shot ? path.resolve(dir, off.shot) : null,
    offset: c0.offset || [0, 0], pxPerUnit: c0.pxPerUnit, screen: c0.screen, units: c0.units,
  };
}

/** The official rect of a pair in screenshot px: { rect } or { unknown: reasons }. Throws on a path the layout lacks. */
export function officialRect(layout, nodePath) {
  const n = layout.nodes.find((x) => x.path === nodePath);
  if (!n) throw new Error(`ui-check: no node "${nodePath}" in the layout of ${layout.root} (paths are the layout JSON's nodes[].path)`);
  const r = n.screen;
  if (!r) throw new Error(`ui-check: node "${nodePath}" has no screen rect`);
  if ([r.x, r.y, r.w, r.h].some((v) => v === UNKNOWN || typeof v !== 'number')) return { unknown: n.unresolved?.length ? n.unresolved : [UNKNOWN] };
  return { rect: r, active: n.activeInHierarchy !== false };
}

const round1 = (v) => Math.round(v * 10) / 10;
const EDGE_SETS = { xy: 'ltrb', x: 'lr', y: 'tb' };
const EDGE_NAMES = { l: 'left', t: 'top', r: 'right', b: 'bottom', c: 'centre', m: 'middle' };

/**
 * Edge differences ours − official (px): left, top, right, bottom, centre x, middle y, and the worst of the compared
 * ones (`axes`, see the header).
 * @param {{x:number,y:number,w:number,h:number}} off @param {{x:number,y:number,w:number,h:number}} our @param {string} axes
 */
export function edgeDiff(off, our, axes = 'xy') {
  const d = {
    left: our.x - off.x, top: our.y - off.y,
    right: our.x + our.w - (off.x + off.w), bottom: our.y + our.h - (off.y + off.h),
    centre: our.x + our.w / 2 - (off.x + off.w / 2), middle: our.y + our.h / 2 - (off.y + off.h / 2),
  };
  const keys = [...(EDGE_SETS[axes] || axes)].map((c) => EDGE_NAMES[c]);
  const out = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, round1(v)]));
  return { ...out, worst: round1(Math.max(...keys.map((k) => Math.abs(d[k])))) };
}

/**
 * Compare every pair. `ourRects[i]` is pair i's DOM rect in our CSS px (null = no element); `offset` moves ours into
 * the screenshot. Returns { rows, listed, skipped, unknown, missing } — listed = over tol, not skipped.
 */
export function comparePairs(spec, ourRects) {
  const [ox, oy] = spec.offset || [0, 0];
  const rows = spec.pairs.map((p, i) => {
    const o = officialRect(spec.layouts[p.layout], p.node);
    const dom = ourRects[i];
    const ours = dom ? { x: round1(dom.x + ox), y: round1(dom.y + oy), w: round1(dom.w), h: round1(dom.h) } : null;
    const row = { i: i + 1, name: p.name, layout: p.layout, node: p.node, sel: p.sel, nth: p.nth, axes: p.axes, note: p.note || null, skip: p.skip || null, official: o.rect || null, ours };
    if (o.unknown) return { ...row, status: 'unknown', why: o.unknown };
    if (!ours) return { ...row, status: p.skip ? 'skipped' : 'missing' };
    const diff = edgeDiff(o.rect, ours, p.axes);
    const status = p.skip ? 'skipped' : diff.worst > spec.tol ? 'listed' : 'ok';
    return { ...row, diff, status };
  });
  return {
    rows,
    listed: rows.filter((r) => r.status === 'listed'),
    missing: rows.filter((r) => r.status === 'missing'),
    skipped: rows.filter((r) => r.status === 'skipped'),
    unknown: rows.filter((r) => r.status === 'unknown'),
  };
}

const fmtRect = (r) => (r ? `${r.x},${r.y} ${r.w}×${r.h}` : '-');

/** The report as text lines: the listed pairs first (worst first), then missing, unknown, skipped, then the ok count. */
export function formatReport(res, tol) {
  const out = [];
  const listed = [...res.listed].sort((a, b) => b.diff.worst - a.diff.worst);
  out.push(`over ${tol}px: ${listed.length}  missing: ${res.missing.length}  unknown: ${res.unknown.length}  skipped: ${res.skipped.length}  ok: ${res.rows.filter((r) => r.status === 'ok').length}`);
  for (const r of listed) {
    const d = r.diff;
    out.push(`  #${r.i} ${r.name} [${r.axes}] worst ${d.worst}  L${d.left} T${d.top} R${d.right} B${d.bottom} C${d.centre} M${d.middle}  official ${fmtRect(r.official)}  ours ${fmtRect(r.ours)}${r.note ? `  — ${r.note}` : ''}`);
  }
  for (const r of res.missing) out.push(`  #${r.i} ${r.name}: no element for ${r.sel}${r.nth ? ` #${r.nth}` : ''}`);
  for (const r of res.unknown) out.push(`  #${r.i} ${r.name}: official 「${UNKNOWN}」 — ${r.why.join('; ')}`);
  for (const r of res.skipped) out.push(`  #${r.i} ${r.name}: skipped — ${r.skip}${r.diff ? ` (worst ${r.diff.worst})` : ''}`);
  return out;
}
