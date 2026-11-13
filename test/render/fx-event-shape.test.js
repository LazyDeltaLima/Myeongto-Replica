// test/render/fx-event-shape.test.js — the shape of a sim 'fx' event, on both sides of the client boundary.
//
// Battle.fx (server/sim/battle/events.js) sends ['fx', kind, x, y, extra] with x / y in the tuple and never in the extra.
// 规程 萨尔贡 6's 流沙 floor (2026-11-14 report) was drawn as its stand-in circle in every real match because its handler
// read the tile from the extra, and the test that covered it built its event by hand with x / y in the extra, so it
// passed. Two guards for that kind of bug:
//   1. no client code reads `x` / `y` from an fx event's extra (test/helpers/fxExtraReads.js follows the extra through
//      variables, assignments and the parameters of the functions it is handed to);
//   2. no test builds an fx tuple by hand with x / y in its extra — tests use test/helpers/fxEvent.js, which calls
//      Battle.fx itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { scanFxExtraReads } from '../helpers/fxExtraReads.js';
import { fxEvent } from '../helpers/fxEvent.js';
import { makeBattle } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function jsFiles(dir, skip = new Set()) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (!skip.has(d.name)) out.push(...jsFiles(p, skip)); } else if (/\.m?js$/.test(d.name)) out.push(p);
  }
  return out;
}

// `file:function:key` → why that read is not an fx extra (a hit on another event's 5th slot). Empty: keep it so.
const ALLOWED = {};

test('client code never reads x / y from a sim fx event\'s extra (Battle.fx puts them in the tuple)', () => {
  const hits = scanFxExtraReads(jsFiles(path.join(ROOT, 'public/js'), new Set(['vendor'])))
    .map((h) => ({ ...h, file: path.relative(ROOT, h.file) }))
    .filter((h) => !ALLOWED[`${h.file}:${h.fn}:${h.key}`]);
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line} ${h.fn}() reads extra.${h.key} — ${h.text}`), [],
    'read e[2] / e[3] (the tuple) instead, or list the read in ALLOWED with why it is not an fx extra');
  for (const k of Object.keys(ALLOWED)) assert.ok(ALLOWED[k], `${k}: a reason`);
});

test('the scan finds the kinds of read the 流沙 bug was (fixtures)', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'fx-extra-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.js'), [
      'export function run(fx, ev) { for (const e of ev) if (e[0] === "fx") fx.simFx(e[1], e[2], e[3], e[4]); }',
      'const g = (p) => { const { x, id } = p; return x + id; };',
      'function sand(o) { return Number(o.x); }',
      'export function h(e) { let o; o = e[4] ?? {}; g(o); if (e[1] === "zone") sand(e[4]); return [o["y"], e[4]?.id]; }',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'b.js'),
      'export class L { simFx(kind, x, y, extra) { const ex = extra && typeof extra === "object" ? extra : {}; return this.k(ex) + x + ex.id; } k(q) { return q?.x; } }');
    const got = scanFxExtraReads([path.join(dir, 'a.js'), path.join(dir, 'b.js')]).map((h) => `${path.basename(h.file)}:${h.line}:${h.fn}:${h.key}`);
    assert.deepEqual(got, ['a.js:2:g:x', 'a.js:3:sand:x', 'a.js:4:h:y', 'b.js:1:k:x']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fxEvent() makes the tuple a real battle sends', () => {
  const b = makeBattle({}).battle;
  b.recordEvents = true;
  b.drainEvents();
  b.fx('zone', { x: 3.333, y: 4, r: 1.5, kind: 'sargonSand', id: 7 });
  const real = b.drainEvents().find((e) => e[0] === 'fx');
  assert.deepEqual(fxEvent('zone', { x: 3.333, y: 4, r: 1.5, kind: 'sargonSand', id: 7 }), real);
  assert.deepEqual(real, ['fx', 'zone', 3.33, 4, { r: 1.5, kind: 'sargonSand', id: 7 }]);
});

test('no test builds an fx tuple by hand with x / y in its extra (use test/helpers/fxEvent.js)', () => {
  const bad = [];
  const key = (p) => p.key?.name ?? p.key?.value;
  for (const file of jsFiles(path.join(ROOT, 'test'), new Set(['golden', 'fixtures']))) {
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes("'fx'") && !src.includes('"fx"')) continue;
    const stack = [acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true })];
    while (stack.length) {
      const n = stack.pop();
      const [head, , , , extra] = n.type === 'ArrayExpression' ? n.elements : [];
      if (head?.type === 'Literal' && head.value === 'fx' && extra?.type === 'ObjectExpression' &&
          extra.properties.some((p) => p.type === 'Property' && (key(p) === 'x' || key(p) === 'y'))) {
        bad.push(`${path.relative(ROOT, file)}:${n.loc.start.line}`);
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc') continue;
        const c = n[k];
        if (Array.isArray(c)) { for (const x of c) if (x && typeof x.type === 'string') stack.push(x); } else if (c && typeof c.type === 'string') stack.push(c);
      }
    }
  }
  assert.deepEqual(bad.sort(), [], "write fxEvent(kind, { x, y, ... }) — Battle.fx's own shape");
});
