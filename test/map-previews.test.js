// The battlefield preview under the briefing's stage name (maintainer request 2026-10-11): tools/map-previews.mjs draws
// one picture per battlefield with our 3D board (the client has stage_mappreview shots for its ordinary stages only) into
// the local-client manifest group `stage/preview`; the briefing shows it when the server has it and keeps the plain row
// otherwise. The pictures need Chrome and the local-client extraction, so only the wiring is checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const { GROUP, FRAME, FOCUS, isBattlefield } = await import('../tools/map-previews.mjs');
const { AREAS } = await import('../public/js/render/board3d/layout.js');

test('map-previews: every battlefield of the modes, not the 联防 positions; the frame inside the lit normal field', () => {
  const stages = JSON.parse(read('data/stages.json'));
  const config = JSON.parse(read('data/config.json'));
  const drawn = new Set(Object.values(config.modes || {}).flatMap((m) => (Array.isArray(m?.stages) ? m.stages : [])).map((s) => (typeof s === 'string' ? s : s?.id)).filter(Boolean));
  const ids = Object.keys(stages).filter(isBattlefield);
  assert.equal(ids.length, 11);
  for (const id of drawn) assert.ok(ids.includes(id), `${id}: a mode draws it, so it gets a preview`);
  assert.ok(!ids.some((id) => /escaped/.test(id)));
  assert.equal(GROUP, 'stage/preview');
  assert.deepEqual(FOCUS, { ...AREAS.normal[0] });
  assert.ok(FRAME.r0 >= FOCUS.r0 && FRAME.r1 <= FOCUS.r1 && FRAME.c0 >= FOCUS.c0 && FRAME.c1 <= FOCUS.c1);
});

test('the briefing shows the preview under the stage name when the local art has it, else the plain row', () => {
  const brief = read('public/js/screens/briefing.js');
  assert.match(brief, /const mapUrl = pub\.stageId \? localAsset\('stage\/preview', pub\.stageId\) : null;/);
  assert.match(brief, /<div class=\$\{cx\('brief-lower', mapUrl && 'has-map'\)\}>/);
  assert.match(brief, /<span class="brief-stage__name">[\s\S]*?<\/span>\s*\$\{mapUrl \? html`<\$\{Img\} src=\$\{mapUrl\} class="brief-stage__map"/);
});
