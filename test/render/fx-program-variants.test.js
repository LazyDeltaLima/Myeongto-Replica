// test/render/fx-program-variants.test.js — the effect shader variants linked before the battle (fxplayer.js
// PROGRAM_VARIANTS, docs/rules/render.md 「이펙트 셰이더 유지」, 2026-10-27) cover every extracted prefab: a combination of
// side · skinned mesh · normals left out would link at its first effect in a battle (0.13–0.18 s frozen on Firefox).
// A new extraction that brings one fails here; the list is not the 12 three.js could make — each extra one is a link.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fxp = await import('../../public/js/render/fxplayer.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FX = path.join(ROOT, 'public/assets/local/fx');
const key = ({ cull, skin, normals }) => `${cull}${skin ? 's' : ''}${normals ? 'n' : ''}`;

/** The variants of a prefab definition (fxplayer.js FxInstance: mesh / skin nodes take meshSide + useMeshAttrs, a mesh particle too; quads stay double-sided). */
function variantsOf(def) {
  const out = new Set();
  const mat = (k, skin) => {
    const m = def.materials?.[k];
    if (!m) return;
    out.add(key({ cull: fxp.renderState(m.shader || '', m.floats || {}).cull, skin, normals: /\/Rim\//.test(m.shader || '') }));
  };
  for (const n of def.nodes || []) {
    const mr = n.mesh || n.skin;
    if (mr) { mat(mr.mat, !!n.skin); for (const k of n.mesh?.more || []) mat(k, false); }
    const r = n.ps?.render;
    if (r) { if (r.mode === 4 && r.mesh != null) mat(r.mat, false); else out.add(key({ cull: 0 })); }
  }
  return out;
}

test('PROGRAM_VARIANTS: one scene each, the double-sided quad first', () => {
  const scenes = fxp.programVariants();
  assert.equal(scenes.length, fxp.PROGRAM_VARIANTS.length);
  assert.equal(key(fxp.PROGRAM_VARIANTS[0]), '0');
  const mesh = scenes[3].children[0];
  assert.ok(mesh.isSkinnedMesh && fxp.PROGRAM_VARIANTS[3].skin);
  assert.ok(scenes[4].children[0].geometry.getAttribute('normal'));
  assert.ok(!scenes[0].children[0].geometry.getAttribute('normal'));
});

test('PROGRAM_VARIANTS covers every extracted prefab', { skip: !fs.existsSync(FX) && 'no extracted effects (npm run setup)' }, () => {
  const listed = new Set(fxp.PROGRAM_VARIANTS.map(key));
  const missing = new Map();
  let n = 0;
  for (const b of fs.readdirSync(FX, { withFileTypes: true })) {
    if (!b.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(FX, b.name))) {
      if (!f.endsWith('.json')) continue;
      let def;
      try { def = JSON.parse(fs.readFileSync(path.join(FX, b.name, f), 'utf8')); } catch { continue; }
      if (!Array.isArray(def?.nodes)) continue;
      n++;
      for (const v of variantsOf(def)) if (!listed.has(v)) missing.set(v, `${b.name}/${f}`);
    }
  }
  assert.ok(n > 1000, `only ${n} prefabs read`);
  assert.deepEqual([...missing], [], 'variant (cull, s = skinned, n = normals) → a prefab using it');
});
