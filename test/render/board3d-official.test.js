// test/render/board3d-official.test.js — the official per-stage board scenes (DESIGN §15.1): the DXT5nm normal-map
// rebuild of tools/local-extract/scene_extract.py, style.js tileTop (the scenes' HIGH tile height), and — when the
// scenes were extracted here — the scene.json / geom.bin layout render/board3d/official.js reads, the hidden sets
// (HIDDEN@1 left normal field, @2 right normal field, @3 boss field) and their visibility per built area.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { buildOfficialScene, sceneGroup } from '../../public/js/render/board3d/official.js';
import { focusUniforms } from '../../public/js/render/board3d/materials.js';
import { AREAS, unionAreas, classifyStage } from '../../public/js/render/board3d/layout.js';
import { TILE_H, tileTop } from '../../public/js/render/style.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(ROOT, 'tools/local-extract');
const ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);
const HAS_PIL = !!PY && spawnSync(PY, ['-c', 'import PIL'], { env: ENV }).status === 0;
const manifest = (() => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.json'), 'utf8')); } catch { return null; } })();
const stages = JSON.parse(readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'));
const onDisk = (url) => path.join(ROOT, 'public', decodeURI(url));
const extracted = Object.keys(stages).filter((id) => manifest?.groups?.[sceneGroup(id)]?.scene && existsSync(onDisk(manifest.groups[sceneGroup(id)].scene.path)));

describe('scene_extract.py', { skip: (!HAS_PIL && 'no python3 + Pillow') }, () => {
  test('DXT5nm normal maps (X in A, Y in G, R = 1) become RGB normals pointing out of the surface', () => {
    const src = [
      'import sys', `sys.path.insert(0, ${JSON.stringify(TOOL)})`,
      'from scene_extract import derive_normal_dxt5nm', 'from PIL import Image',
      // flat (0.5, 0.5) and tilted (+x) texels packed the Unity way
      "img = Image.new('RGBA', (2, 1)); img.putpixel((0, 0), (255, 128, 128, 128)); img.putpixel((1, 0), (255, 128, 128, 230))",
      'out = derive_normal_dxt5nm(img)', 'print(list(out.getpixel((0, 0))), list(out.getpixel((1, 0))))',
    ].join('\n');
    const r = spawnSync(PY, ['-c', src], { encoding: 'utf8', env: ENV });
    assert.equal(r.status, 0, r.stderr);
    const [flat, tilt] = r.stdout.trim().split('] [').map((s) => s.replace(/[[\]]/g, '').split(',').map(Number));
    assert.ok(flat[2] >= 250 && Math.abs(flat[0] - 128) <= 1 && Math.abs(flat[1] - 128) <= 1, `flat ${flat}`);
    assert.ok(tilt[0] === 230 && tilt[2] < flat[2], `tilted ${tilt}`);
  });
});

describe('tileTop', () => {
  test('without an official scene the renderer heights stay; with one every HIGH class takes highlandHeight', () => {
    for (const k of ['wall', 'forbid', 'sep', 'bench']) assert.equal(tileTop(k, {}), TILE_H[k]);
    assert.equal(tileTop(null, { highlandHeight: 0.4 }), 0);
    for (const k of ['wall', 'forbid', 'sep', 'bench']) assert.equal(tileTop(k, { highlandHeight: 0.4 }), 0.4);
    assert.equal(tileTop('platform', { highlandHeight: 0.4 }), TILE_H.platform);
    const st = stages.act2autochess_m04;
    const g = classifyStage({ ...st, highlandHeight: 0.3 });
    assert.equal(g[0][0].h, 0.3);   // 'a' bench pad (Final Assault bench)
    assert.equal(g[6][0].h, 0.3);   // 'X' separator
    assert.equal(g[9][3].h, 0);     // 'r' road
  });
});

describe('extracted official scenes', { skip: !extracted.length && 'no scene extracted (tools/local-extract/scene_extract.py)' }, () => {
  test('every active 盟约 stage has a scene (the 7 HARD / ABYSS maps and 战场#01)', () => {
    const active = Object.values(stages).filter((s) => s.active).map((s) => s.id);
    assert.deepEqual(active.filter((id) => !extracted.includes(id)), []);
  });

  for (const id of extracted) {
    test(`${id}: groups fit geom.bin, board space, lightmaps and hidden sets`, () => {
      const g = manifest.groups[sceneGroup(id)];
      const doc = JSON.parse(readFileSync(onDisk(g.scene.path), 'utf8'));
      const bin = readFileSync(onDisk(g.geom.path));
      assert.equal(doc.stage, id);
      assert.ok(doc.groups.length > 0);
      for (const gr of doc.groups) {
        for (const [k, comps, bytes] of [['pos', 3, 4], ['nrm', 3, 4], ['uv0', 2, 4], ['uv1', 2, 4], ['col', 4, 1], ['idx', 1, 4]]) {
          const [off, n] = gr[k];
          assert.equal(off % 4, 0, `${k} aligned`);
          assert.ok(off + n * bytes <= bin.length, `${gr.material} ${k} in range`);
          assert.equal(n, k === 'idx' ? gr.indices : gr.vertices * comps, `${gr.material} ${k} count`);
        }
        assert.equal(gr.indices % 3, 0);
        if (gr.lightmap >= 0) assert.ok(doc.lightmaps[gr.lightmap]?.light?.file, `${gr.material}: lightmap ${gr.lightmap} exported`);
        if (gr.hidden) assert.ok(doc.hidden[gr.hidden]?.tiles, `${gr.material}: hidden set ${gr.hidden} has a tile rect`);
        for (const tx of Object.values(doc.materials[gr.material]?.textures || {})) {
          if (tx.file) assert.ok(manifest.groups['scene/tex']?.[tx.file.replace(/\.png$/, '')], `${tx.file} listed`);
        }
      }
      // board space: the playable grid sits inside the island's bounds, ground at z ≈ 0
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const gr of doc.groups) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], gr.bounds[0][i]); hi[i] = Math.max(hi[i], gr.bounds[1][i]); }
      assert.ok(lo[0] <= 0 && hi[0] >= 20 && lo[1] <= 0 && hi[1] >= 18, `bounds ${lo} ${hi}`);
      assert.ok(doc.map?.highlandHeight > 0, 'map settings');
      // 卫戍协议 hidden sets: left / right normal field and the boss field
      const H = doc.hidden;
      assert.deepEqual(H['HIDDEN@1'].tiles.slice(0, 2).map((r) => r >= 6 && r <= 13), [true, true]);
      assert.ok(H['HIDDEN@1'].tiles[3] <= 10 && H['HIDDEN@2'].tiles[2] >= 10);
      assert.ok(H['HIDDEN@3'].tiles[1] <= 6);
    });
  }

  test('WebP copies (when written): colour maps lossy, data maps and RGBM lightmaps lossless, files on disk', () => {
    const colour = new Set(), data = new Set();
    for (const id of extracted) {
      const doc = JSON.parse(readFileSync(onDisk(manifest.groups[sceneGroup(id)].scene.path), 'utf8'));
      for (const m of Object.values(doc.materials)) {
        for (const [slot, tx] of Object.entries(m.textures || {})) if (tx.file) (slot === '_MainTex' ? colour : data).add(tx.file.replace(/\.png$/, ''));
      }
    }
    let n = 0;
    for (const [g, entries] of Object.entries(manifest.groups)) {
      if (!g.startsWith('scene/')) continue;
      for (const [name, e] of Object.entries(entries)) {
        if (!e.webp) continue;
        n++;
        assert.match(e.path, /\.webp$/);
        assert.ok(existsSync(onDisk(e.path)), `${e.path} on disk`);
        if (e.kind === 'Lightmap' || data.has(name)) assert.equal(e.webp, 'lossless', `${g}/${name}`);
        else if (colour.has(name)) assert.equal(e.webp, 'lossy', `${g}/${name}`);
      }
    }
    if (!n) return;  // extracted with --no-webp
    assert.ok(n >= 40);
  });

  test('built scene: one mesh per group; the hidden sets follow the built areas', () => {
    const id = extracted.includes('act2autochess_m04') ? 'act2autochess_m04' : extracted[0];
    const g = manifest.groups[sceneGroup(id)];
    const doc = JSON.parse(readFileSync(onDisk(g.scene.path), 'utf8'));
    const raw = readFileSync(onDisk(g.geom.path));
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const built = buildOfficialScene(THREE, { stageId: id, doc, buffer, textures: {}, lightmaps: [] }, focusUniforms(THREE));
    assert.equal(built.meshes.length, doc.groups.length);
    assert.equal(built.highland, doc.map.highlandHeight);
    const shown = (area) => {
      built.setArea(area);
      return [...new Set(built.meshes.filter((m) => m.userData.hidden && m.visible).map((m) => m.userData.hidden))].sort();
    };
    assert.deepEqual(shown(AREAS.normal), ['HIDDEN@1']);
    assert.deepEqual(shown(AREAS.unite), ['HIDDEN@1', 'HIDDEN@2']);
    assert.deepEqual(shown(AREAS.boss), ['HIDDEN@3']);
    assert.deepEqual(shown(unionAreas(AREAS.normal, AREAS.boss)), ['HIDDEN@1', 'HIDDEN@3']);
    // always-on groups stay visible; tide warnings stay hidden
    for (const m of built.meshes) if (!m.userData.hidden) assert.equal(m.visible, !m.userData.tideWarning);
    built.dispose();
  });
});
