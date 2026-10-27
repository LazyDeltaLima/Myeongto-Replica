// test/render/lemuen-s3-marks.test.js — 蕾缪安 S3's lock marks (docs/rules/fx.md 「르무엔 S3」, maintainer report
// 2026-10-10): knocked out or withdrawn mid-S3 she fires no shells (kit onEnd 'death'), so her marks end with her 'die'
// instead of staying on their targets until they die or 30 s pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const KIT = readFileSync(path.join(ROOT, 'server/sim/content/kits/ops/chess_char_6_01-lemuen.js'), 'utf8');

test('the marks are owned by their targets, so only her own die can end them', () => {
  assert.match(SRC, /spawn\(bundleOf\(src\)\.bundle, n, \(aimFx \? ground : tgt\) \|\| \{ x, y, z: 0 \}, \{ owner: o\.id, buff: true, on: o\.id,/);
  // the kit sends no shells after a 'death' end
  assert.match(KIT, /if \(reason !== 'death' && unit\.alive\) bombard\(battle, unit, locks\);/);
});

test('her die stops every mark of her locks and drops them (a late-loading one stops itself: mark.done)', () => {
  const die = SRC.slice(SRC.indexOf("case 'die': {"), SRC.indexOf("case 'leak':"));
  assert.match(die, /const lm = lemMarks\.get\(e\[1\]\);/);
  assert.match(die, /lemMarks\.delete\(e\[1\]\); for \(const mark of lm\) \{ mark\.done = true; for \(const l of mark\) l\.inst\.stop\(true\); \}/);
  assert.match(SRC, /if \(mark\.done\) l\.inst\.stop\(\); else mark\.push\(l\);/);
});

// 2026-10-27 (maintainer report, video: a target locked again kept a brighter glow): the mark crosshair_02 is the effect of
// the buff every lock puts on its target, one per name per unit (client Entity.AddBuffEffect ref count) — a target locked
// twice has one mark, which ends with its last lock's shell; the flash, the beam and the aim ring stay one per lock.
test('a target locked again keeps its one mark until the shell of its last lock lands', async () => {
  const { createFxLayer } = await import('../../public/js/render/fxgame.js');
  const names = ['lemuen_skill_03_crosshair_01', 'lemuen_skill_03_trail_01', 'lemuen_skill_03_crosshair_range',
    'lemuen_skill_03_crosshair_02', 'lemuen_skill_03_hit_01'];
  const files = { '/assets/local/fx/index.json': { bundles: { lemuen: names } } };
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await new Promise((r) => setTimeout(r, 10));
    const lem = { id: 1, x: 1, y: 1, alive: true, info: { id: 1, side: 'ally', defId: 'char_4193_lemuen', skillIndex: 2 } };
    const foe = (id, x) => ({ id, x, y: 3, alive: true, info: { id, side: 'enemy', defId: 'enemy_1007_slime' } });
    const views = new Map([[1, lem], [21, foe(21, 4)], [22, foe(22, 5)]]);
    const marks = () => seen.splice(0).filter((p) => p.kind === 'spawn' && p.names[0] === 'lemuen_skill_03_crosshair_02').map((p) => p.on);
    const lock = (id) => layer.onEvent(['fx', 'lock', views.get(id).x, 3, { x: views.get(id).x, y: 3, id, src: 1, hold: 1 }], views);
    const land = () => layer.onEvent(['fx', 'bombard', 4, 3, { x: 4, y: 3, id: 1 }], views);   // her shells land in lock order

    lock(21); lock(22); lock(21);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(marks(), [21, 22], 'one mark per target, none for the second lock on 21');
    land();     // 21's first lock
    lock(21);
    assert.deepEqual(marks(), [], '21 is still held by its second lock');
    land(); land(); land();   // 22's, then 21's other two
    lock(21); lock(22);
    assert.deepEqual(marks(), [21, 22], 'every lock of both has landed: new marks');
  } finally { globalThis.fetch = fetch0; }
});
