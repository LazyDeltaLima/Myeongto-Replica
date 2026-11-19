// A later season's hub backdrop with its rays moving (public/js/ui/seasonRays.js; tools/local-extract/season_ui.py
// writes the pieces beside the JPEG): the pieces are looked up together or not at all (the JPEG alone), a malformed rays
// file is refused, the copies of one material join into one batch at their place, and the texture scroll stays in range
// however long the page is open. docs/rules/ui.md 「새 시즌 「규정」의 타이틀·허브 그림과 로고」.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const S = 'act3autochess';
const G = `season/${S}/backdrop`;
const entry = (name, ext = 'png') => ({ path: `/assets/local/${G}/${name}.${ext}`, kind: 'Sprite' });
let local = { version: 1, groups: {} };
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('/local-assets.json')) return { ok: true, status: 200, json: async () => local };
  return { ok: false, status: 404, json: async () => ({}) };
};

const mesh = { pos: [0, 0, 1, 0, 0, 1], uv: [0, 0, 1, 0, 0, 1], tri: [0, 1, 2] };
const dissolve = (o = {}) => ({ tex: 'tex_a', wrap: [0, 0], scale: [1, 1], offset: [0, 0], speed: [0, -0.1], threshold: 0, smoothness: 0.1, invert: false, ...o });
const draw = (o = {}) => ({ name: 'm', mesh: 'tri', matrix: [[1, 0, 0], [0, 1, 0]], rgb: [0.6, 0.2, 0.1], alpha: 1, dissolve: [dissolve()], ...o });
const doc = (o = {}) => ({ version: 1, size: [100, 50], time: 2.64, meshes: { tri: mesh }, draws: [draw()], ...o });

describe('season rays', () => {
  test('the pieces come together or not at all; 盟约 has none', async () => {
    const { data } = await import('../../public/js/data.js');
    const { seasonRaysArt } = await import('../../public/js/ui/seasonArt.js');
    local = { version: 1, groups: { [G]: { title: entry('title', 'jpg'), base: entry('base', 'jpg'), front: entry('front', 'webp'), tex_a: entry('tex_a') } } };
    await data.invalidate('local'); await data.load('local');
    assert.equal(seasonRaysArt(S), null, 'no rays file: the JPEG alone');
    local.groups[G].rays = { path: `/assets/local/${G}/rays.json`, kind: 'Data' };
    await data.invalidate('local'); await data.load('local');
    const art = seasonRaysArt(S);
    assert.deepEqual([art?.rays, art?.base, art?.front], [`/assets/local/${G}/rays.json`, `/assets/local/${G}/base.jpg`, `/assets/local/${G}/front.webp`]);
    assert.equal(art.url('tex_a'), `/assets/local/${G}/tex_a.png`);
    assert.equal(art.url('tex_b'), null);
    assert.equal(seasonRaysArt('act2autochess'), null);
  });

  test('a rays file the page cannot draw is refused (the JPEG stays)', async () => {
    const { validRays } = await import('../../public/js/ui/seasonRays.js');
    assert.equal(validRays(doc()), true);
    assert.equal(validRays(doc({ version: 2 })), false);
    assert.equal(validRays(doc({ meshes: { tri: { ...mesh, tri: [0, 1, 3] } } })), false, 'a triangle past the vertices');
    assert.equal(validRays(doc({ meshes: { tri: { ...mesh, uv: [0, 0] } } })), false, 'uv of another length');
    assert.equal(validRays(doc({ draws: [draw({ mesh: 'other' })] })), false);
    assert.equal(validRays(doc({ draws: [draw({ dissolve: [dissolve(), dissolve(), dissolve()] })] })), false, 'three dissolves');
    assert.equal(validRays(doc({ draws: [draw({ dissolve: [dissolve({ smoothness: 0 })] })] })), false, 'no smoothness');
    assert.equal(validRays(doc({ draws: [draw({ dissolve: [dissolve({ wrap: [2, 0] })] })] })), false, 'a mirror wrap');
    assert.equal(validRays(doc({ draws: [] })), false);
  });

  test('the copies of one material are one batch, each at its place; another material is its own', async () => {
    const { raysBatches } = await import('../../public/js/ui/seasonRays.js');
    const turned = [[0, -2, 10], [2, 0, 20]]; // turned a quarter, doubled, moved
    const b = raysBatches(doc({ draws: [draw(), draw({ matrix: turned }), draw({ rgb: [1, 1, 1] })] }));
    assert.equal(b.length, 2);
    assert.deepEqual([...b[0].verts], [0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 10, 20, 0, 0, 10, 22, 1, 0, 8, 20, 0, 1]);
    assert.deepEqual([...b[0].index], [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(b[1].material.rgb, [1, 1, 1]);
    // 16-bit indices: a batch is cut before 65 536 vertices
    const big = { pos: new Array(40000 * 2).fill(0), uv: new Array(40000 * 2).fill(0), tri: [0, 1, 2] };
    const split = raysBatches(doc({ meshes: { tri: big }, draws: [draw(), draw()] }));
    assert.equal(split.length, 2);
    assert.ok(split.every((x) => Math.max(...x.index) < 65536));
  });

  test('the scroll is offset + speed × time, in [0, 1) on a repeating axis, from the JPEG moment on', async () => {
    const { dissolveOffset } = await import('../../public/js/ui/seasonRays.js');
    const d = dissolve();
    assert.ok(Math.abs(dissolveOffset(d, 1, 2.64) - 0.736) < 1e-9, 'season_ui.py: v −0.1/s at 2.64 s, the same sample as −0.264');
    assert.equal(dissolveOffset(d, 0, 2.64), 0);
    for (const t of [0, 9.99, 10, 1234.5, 86400 * 3]) {
      const v = dissolveOffset(d, 1, t);
      assert.ok(v >= 0 && v < 1, `${t} s: ${v}`);
    }
    assert.equal(dissolveOffset(dissolve({ wrap: [1, 1] }), 1, 30), -3, 'a clamped axis is left as it is');
  });

  const FILE = path.join(ROOT, 'public/assets/local', G, 'rays.json');
  test('the extracted 规程 rays: drawable, their textures in the manifest, one batch (three draw calls a frame)',
    { skip: existsSync(FILE) ? false : 'no local extract (tools/local-extract/season_ui.py)' }, async () => {
      const { validRays, raysBatches } = await import('../../public/js/ui/seasonRays.js');
      const real = JSON.parse(readFileSync(FILE, 'utf8'));
      assert.equal(validRays(real), true);
      assert.deepEqual(real.size, [1559, 960]);
      assert.equal(real.draws.length, 3, 'mesh_1–3 of effect_season_on');
      assert.equal(raysBatches(real).length, 1);
      const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.json'), 'utf8')).groups[G];
      for (const name of ['base', 'front', 'rays', ...new Set(real.draws.flatMap((x) => x.dissolve.map((y) => y.tex)))]) {
        assert.ok(manifest?.[name], `${name} in the manifest group ${G}`);
        assert.ok(existsSync(path.join(ROOT, 'public', manifest[name].path)), `${manifest[name].path} on disk`);
      }
    });
});
