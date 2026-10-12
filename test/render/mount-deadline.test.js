// createFieldView's optional waits (manifests, fonts, board art, 3D board) are cut to the caller's deadline
// (render/app/host.js capWait): their own caps add up to more than ui/fieldHost.js's 12 s race, and losing it cost the
// whole engine on a cold cache (an iPhone Safari tab: 「simplified view (createFieldView timed out)」).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { capWait, DEADLINE_MARGIN_MS } from '../../public/js/render/app/host.js';

test('a wait keeps its own cap without a deadline or with time to spare', () => {
  assert.equal(capWait(6000, undefined, 0), 6000);
  assert.equal(capWait(6000, null, 0), 6000);
  assert.equal(capWait(6000, 20000, 0), 6000);
});

test('a wait ends DEADLINE_MARGIN_MS before the deadline, and never goes below 0', () => {
  assert.equal(capWait(6000, 4000, 0), 4000 - DEADLINE_MARGIN_MS);
  assert.equal(capWait(6000, 4000, 3800), 0);
  assert.equal(capWait(6000, 4000, 9000), 0);
});

test('the waits of a slow mount all fit in a 12 s race', () => {
  // each wait runs to its cap (nothing arrives): the clock moves by what capWait allowed
  const deadline = 12000;
  let now = 700; // Pixi
  for (const cap of [4000, 1500, 2500, 6000]) now += capWait(cap, deadline, now);
  assert.ok(now <= deadline - DEADLINE_MARGIN_MS, `ends at ${now} ms`);
});

test('createFieldView passes every optional wait through the deadline', () => {
  const src = readFileSync(new URL('../../public/js/render/app.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export async function createFieldView'));
  // the timed optional waits (waitStep: manifests, fonts, art, 3d) and any direct withTimeout but the uncapped Pixi load
  const steps = [...body.matchAll(/waitStep\('(\w+)',[^;]*?,\s*([^,;]+)\);/g)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(steps.map(([n]) => n), ['manifests', 'fonts', 'art', '3d']);
  for (const [n, w] of steps) assert.match(w, /^waitCap\(\d+\)\)?$/, `uncapped wait: ${n}`);
  const direct = [...body.matchAll(/withTimeout\([^;]*?,\s*([^,;]+),\s*signal\)/g)].map((m) => m[1].trim());
  assert.deepEqual(direct, ['null'], 'besides waitStep, only the Pixi load (uncapped: the engine needs it) calls withTimeout');
  assert.match(body, /const waitStep = async \(name, p, ms\) => \{[^}]*\{ came = true; \}[^]*?\), ms, signal\);/);
});
