// test/render/funnel-hit-fx.test.js — the client's FunnelHitEffect (2026-10-21, official client; docs/rules/fx.md 「驭械术师 드론」):
// OnPlay turns the effect to a random direction of the map plane and moves it by Random.Range(−r, r) per axis of its
// `_randomRange` — fx_extract.py `jitter`, FxInstance applies both (耶拉 S2's drone hits; 流明 S2's hit: a zero range).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXTRACT = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
const KJERA = path.join(ROOT, 'public/assets/local/fx/kjera/kjera_token_skill_02_hit_F_L_01.json');
const LUMEN = path.join(ROOT, 'public/assets/local/fx/lumen/lumen_skill_02_hit.json');

test('fx_extract.py reads the root FunnelHitEffect `_randomRange` as `jitter` (a zero range kept: the random facing)', () => {
  assert.match(EXTRACT, /FUNNEL_HIT_SCRIPT = 8922258000712749090/);
  assert.match(EXTRACT, /def funnel_hit\(self, root\)/);
  assert.match(EXTRACT, /out_def\['jitter'\] = jitter/);
});

async function loadDef(file) {
  const THREE = await import('../../public/vendor/three.module.js');
  const def = JSON.parse(readFileSync(file, 'utf8'));
  const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
  def.geoms = new Proxy({}, { get: () => tri() });
  def.lib = { texture: () => new THREE.Texture() };
  return def;
}

test('FxInstance (skipped without public/assets): a drone hit lands at a random point of its range, turned at random', { skip: !(existsSync(KJERA) && existsSync(LUMEN)) && 'no extracted fx' }, async () => {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const k = await loadDef(KJERA);
  assert.deepEqual(k.jitter, [0.2, 0.05, 0]);
  const flips = new Set();
  let spread = 0;
  for (let i = 0; i < 40; i++) {
    const inst = new fxp.FxInstance(k, { quality: 'high', facing: 1 });
    const p = inst.unity.position;
    assert.ok(Math.abs(p.x) <= 0.2 + 1e-9 && Math.abs(p.y) <= 0.05 + 1e-9 && p.z === 0, `${p.x} ${p.y} ${p.z}`);
    spread = Math.max(spread, Math.abs(p.x));
    flips.add(!!inst.turn?.flip);
  }
  assert.ok(spread > 0, 'it moves');
  assert.deepEqual([...flips].sort(), [false, true], 'FLIP_TWO_SIDE by a random direction: both sides');
  const l = await loadDef(LUMEN);
  assert.deepEqual(l.jitter, [0, 0, 0]);
  const inst = new fxp.FxInstance(l, { quality: 'high', facing: 1 });
  assert.deepEqual([inst.unity.position.x, inst.unity.position.y, inst.unity.position.z], [0, 0, 0], '流明: no offset');
});
