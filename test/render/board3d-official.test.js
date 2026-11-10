// test/render/board3d-official.test.js — the official per-stage board scenes (docs/local/official-scenes.md): the DXT5nm normal-map
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
import { buildOfficialScene, sceneGroup, OFFICIAL_DEVICE } from '../../public/js/render/board3d/official.js';
import { focusUniforms } from '../../public/js/render/board3d/materials.js';
import { AREAS, unionAreas, classifyStage, stageDevices } from '../../public/js/render/board3d/layout.js';
import { TILE_H, tileTop, TILEKEY_GLYPH } from '../../public/js/render/style.js';
import { STAGE_PIECES } from '../../tools/level-fields.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(ROOT, 'tools/local-extract');
const ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);
const HAS_PIL = !!PY && spawnSync(PY, ['-c', 'import PIL'], { env: ENV }).status === 0;
const manifest = (() => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.json'), 'utf8')); } catch { return null; } })();
const stages = JSON.parse(readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'));
const onDisk = (url) => path.join(ROOT, 'public', decodeURI(url));
const extracted = Object.keys(stages).filter((id) => manifest?.groups?.[sceneGroup(id)]?.scene && existsSync(onDisk(manifest.groups[sceneGroup(id)].scene.path)));
// 规程 (act3autochess): its stages are built from three level prefabs of the CN client (scene_extract.py FRAME_PIECES)
const stages3 = JSON.parse(readFileSync(path.join(ROOT, 'data/seasons/act3autochess/stages.json'), 'utf8'));
const extracted3 = Object.keys(stages3).filter((id) => /_m\d+$/.test(id) && manifest?.groups?.[sceneGroup(id)]?.scene && existsSync(onDisk(manifest.groups[sceneGroup(id)].scene.path)));

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

  test('clip_rect: the part of a triangle inside a cut, attributes interpolated, winding kept; FRAME_PIECES = level-fields STAGE_PIECES', () => {
    const src = [
      'import sys, json', `sys.path.insert(0, ${JSON.stringify(TOOL)})`, 'from scene_extract import clip_rect, FRAME_PIECES, INF',
      // (x, y, z, normal 3, uv0 2, uv1 2, colour 4): a triangle across x = 10.5, cut to x ≤ 10.5
      'a = (10.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 255.0)',
      'b = (12.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 255.0, 0.0, 0.0, 255.0)',
      'c = (10.0, 2.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 255.0)',
      'poly = clip_rect([a, b, c], (-INF, 10.5, -INF, INF))',
      "print(json.dumps({'poly': poly, 'pieces': [[s, [None if abs(v) >= INF else v for v in r], dy] for s, r, dy in FRAME_PIECES]}))",
    ].join('\n');
    const r = spawnSync(PY, ['-c', src], { encoding: 'utf8', env: ENV });
    assert.equal(r.status, 0, r.stderr);
    const { poly, pieces } = JSON.parse(r.stdout);
    assert.equal(poly.length, 4);
    assert.ok(poly.every((v) => v[0] <= 10.5 + 1e-9), 'inside the cut');
    assert.deepEqual(poly[0].slice(0, 2), [10, 0]);                            // a kept first: the winding a → b → c stays
    const ab = poly[1];                                                       // a–b at x = 10.5: a quarter of the way
    assert.deepEqual([ab[0], ab[2], ab[6], ab[10]], [10.5, 0.25, 0.25, 63.75]);
    assert.ok(Math.abs(Math.hypot(ab[3], ab[4], ab[5]) - 1) < 1e-9, 'normal renormalised');
    // every tile of a sub-level STAGE_PIECES puts in the frame lies inside a FRAME_PIECES cut of that sub-level, moved the same rows
    for (const p of STAGE_PIECES) {
      const dy = p.row0 - p.rows[0];
      for (let row = p.rows[0]; row <= p.rows[1]; row++) {
        for (let col = p.cols[0]; col <= p.cols[1]; col++) {
          const hit = pieces.find(([sub, [x0, x1, y0, y1], d]) => sub === p.sub && d === dy
            && (x0 === null || x0 <= col - 0.5) && (x1 === null || x1 >= col + 0.5) && (y0 === null || y0 <= row - 0.5) && (y1 === null || y1 >= row + 0.5));
          assert.ok(hit, `sub_0${p.sub + 1} (${row},${col}) → frame row ${row + dy}`);
        }
      }
    }
  });
});

describe('quantized geometry (geom.bin version 2)', { skip: !PY && 'no python3' }, () => {
  // two groups sharing the vertex (5.25, 7.5, 0.4); group b has one colour, and group c > 65536 vertices (u32 indices)
  const src = [
    'import sys, json, base64', `sys.path.insert(0, ${JSON.stringify(TOOL)})`, 'from scene_extract import pack_geometry, GEOM_VERSION',
    "a = {'pos': [-3.5, -2.0, -1.2, 5.25, 7.5, 0.4, 24.0, 20.5, 6.75], 'nrm': [0, 0, 1, 0.6, 0, 0.8, -1, 0, 0],",
    "     'uv0': [-0.5, 0.0, 4.25, 1.0, 1.5, 2.0], 'uv1': [0.1, 0.2, 0.3, 0.4, 0.9, 0.99], 'col': [255, 0, 0, 255, 0, 255, 0, 255, 1, 2, 3, 4], 'idx': [0, 2, 1]}",
    "b = {'pos': [5.25, 7.5, 0.4, 6.0, 7.5, 0.4, 5.25, 8.5, 0.4], 'nrm': [0, 0, 1] * 3, 'uv0': [0, 0, 1, 0, 0, 1], 'uv1': [0, 0, 1, 0, 0, 1],",
    "     'col': [200, 210, 220, 230] * 3, 'idx': [0, 1, 2]}",
    'n = 65540',
    "c = {'pos': [i * 0.0001 for i in range(3 * n)], 'nrm': [0, 0, 1] * n, 'uv0': [0.5, 0.5] * n, 'uv1': [0.25, 0.75] * n, 'col': [255] * 4 * n,",
    "     'idx': [0, n - 1, n - 2, n - 1, 0, 1]}",
    "recs = [{'material': 'a', 'lightmap': -1, 'vertices': 3, 'indices': 3}, {'material': 'b', 'lightmap': -1, 'vertices': 3, 'indices': 3},",
    "        {'material': 'c', 'lightmap': -1, 'vertices': n, 'indices': 6}]",
    'blob, quant = pack_geometry(list(zip(recs, [a, b, c])))',
    "print(json.dumps({'doc': {'version': GEOM_VERSION, 'quant': quant, 'groups': recs, 'materials': {}}, 'bin': base64.b64encode(bytes(blob)).decode()}))",
  ].join('\n');
  const r = PY ? spawnSync(PY, ['-c', src], { encoding: 'utf8', env: ENV, maxBuffer: 64 << 20 }) : null;

  test('pack_geometry → buildOfficialScene: positions, normals, uvs, colours and indices come back', () => {
    assert.equal(r.status, 0, r.stderr);
    const { doc, bin } = JSON.parse(r.stdout);
    assert.equal(doc.version, 2);
    const raw = Buffer.from(bin, 'base64');
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const built = buildOfficialScene(THREE, { stageId: 't', doc, buffer, textures: {}, lightmaps: [] }, focusUniforms(THREE));
    const [ma, mb, mc] = built.meshes;
    const world = (m, i) => new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position, i).applyMatrix4(m.matrix);
    const close = (v, w, eps, what) => assert.ok(v.distanceTo(new THREE.Vector3(...w)) < eps, `${what}: ${v.toArray()} ≠ ${w}`);
    close(world(ma, 0), [-3.5, -2, -1.2], 5e-4, 'a0');
    close(world(ma, 2), [24, 20.5, 6.75], 5e-4, 'a2');
    // the shared vertex lands on the same grid point in both groups (closed seams)
    assert.deepEqual(world(ma, 1).toArray(), world(mb, 0).toArray());
    close(world(mb, 0), [5.25, 7.5, 0.4], 5e-4, 'shared');
    const nrm = new THREE.Vector3().fromBufferAttribute(ma.geometry.attributes.normal, 1).normalize();
    close(nrm, [0.6, 0, 0.8], 0.01, 'normal');
    // uv0 through the material's uMainST (the group range folded in), uv1 through uUv1ST
    const st = ma.material.uniforms.uMainST.value, s1 = ma.material.uniforms.uUv1ST.value;
    const uv = ma.geometry.attributes.uv, uv1 = ma.geometry.attributes.uv1;
    assert.ok(Math.abs(uv.getX(1) * st.x + st.z - 4.25) < 1e-4 && Math.abs(uv.getY(2) * st.y + st.w - 2) < 1e-4, 'uv0');
    assert.ok(Math.abs(uv1.getX(2) * s1.x + s1.z - 0.9) < 1e-4 && Math.abs(uv1.getY(2) * s1.y + s1.w - 0.99) < 1e-4, 'uv1');
    assert.deepEqual([...ma.geometry.attributes.color.array], [255, 0, 0, 255, 0, 255, 0, 255, 1, 2, 3, 4]);
    assert.equal(doc.groups[1].col, null);
    assert.deepEqual([...mb.geometry.attributes.color.array.slice(0, 8)], [200, 210, 220, 230, 200, 210, 220, 230]);
    // indices: winding kept, u16 for small groups, u32 above 65536 vertices (delta-coded across the wrap)
    assert.ok(ma.geometry.index.array instanceof Uint16Array);
    assert.deepEqual([...ma.geometry.index.array], [0, 2, 1]);
    assert.equal(doc.groups[2].idxType, 'u32');
    assert.ok(mc.geometry.index.array instanceof Uint32Array);
    assert.deepEqual([...mc.geometry.index.array], [0, 65539, 65538, 65539, 0, 1]);
    built.dispose();
  });
});

describe('tileTop', () => {
  test('without an official scene the renderer heights stay; with one every HIGH class takes highlandHeight', () => {
    for (const k of ['wall', 'forbid', 'sep', 'bench']) assert.equal(tileTop(k, {}), TILE_H[k]);
    assert.equal(tileTop(null, { highlandHeight: 0.4 }), 0);
    for (const k of ['wall', 'forbid', 'sep', 'bench']) assert.equal(tileTop(k, { highlandHeight: 0.4 }), 0.4);
    assert.equal(tileTop('platform', { highlandHeight: 0.4 }), TILE_H.platform);
    // the official 射击台 model's plate (scene/devices top), set by the app with the official scene
    assert.equal(tileTop('platform', { highlandHeight: 0.4, platformHeight: 0.393 }), 0.393);
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
      const v2 = doc.version >= 2;
      if (v2) assert.ok(Array.isArray(doc.quant?.pos) && doc.quant.pos.length === 4 && doc.quant.pos[3] > 0, 'quant.pos');
      for (const gr of doc.groups) {
        const layout = v2
          ? [['pos', 3, 2], ['nrm', 4, 1], ['uv0', 2, 2], ['uv1', 2, 2], ['col', 4, 1], ['idx', 1, gr.idxType === 'u16' ? 2 : 4]]
          : [['pos', 3, 4], ['nrm', 3, 4], ['uv0', 2, 4], ['uv1', 2, 4], ['col', 4, 1], ['idx', 1, 4]];
        if (v2) {
          assert.ok(gr.q?.uv0?.length === 4 && gr.q?.uv1?.length === 4, `${gr.material} q`);
          assert.equal(gr.idxType, gr.vertices <= 65536 ? 'u16' : 'u32');
        }
        for (const [k, comps, bytes] of layout) {
          if (k === 'col' && v2 && gr.col === null) { assert.equal(gr.colConst?.length, 4); continue; }
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

  test('device models (scene/devices): the 射击台 and 阻隔工事 prefabs, built with the stage, the platform plate under its rim', { skip: !manifest?.groups?.['scene/devices'] && 'devices not extracted (scene_extract.py --devices)' }, () => {
    const id = extracted.includes('act1autochess_m03') ? 'act1autochess_m03' : extracted[0];
    const load = (grp) => {
      const g = manifest.groups[grp];
      const raw = readFileSync(onDisk(g.geom.path));
      return { doc: JSON.parse(readFileSync(onDisk(g.scene.path), 'utf8')), buffer: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) };
    };
    const st = load(sceneGroup(id)), dv = load('scene/devices');
    const built = buildOfficialScene(THREE, { stageId: id, ...st, textures: {}, lightmaps: [], devices: { stageId: 'devices', ...dv, textures: {}, lightmaps: [] } }, focusUniforms(THREE));
    const D = built.devices;
    assert.ok(D && D.has(OFFICIAL_DEVICE.platform) && D.has(OFFICIAL_DEVICE.crate));
    const top = D.top(OFFICIAL_DEVICE.platform), b = D.bounds(OFFICIAL_DEVICE.platform);
    assert.ok(top > 0.3 && top < b[1][2], `plate ${top} under the rim ${b[1][2]}`);
    const g = D.mesh(OFFICIAL_DEVICE.platform);
    assert.ok(g.children.length >= 1 && g.children.every((m) => m.material.defines.TRAP === 1 && !m.material.defines.LIGHTMAP));
    const f = D.mesh(OFFICIAL_DEVICE.crate, { fade: true });
    assert.ok(f.userData.materials.length && f.userData.materials.every((m) => m.transparent && m.uniforms.uFocus === g.children[0].material.uniforms.uFocus));
    built.dispose();
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

  test('gamma-space shading (the client is a Gamma-space project): reflection probe, Standard parameters, raw colours', () => {
    for (const id of extracted) {
      const doc = JSON.parse(readFileSync(onDisk(manifest.groups[sceneGroup(id)].scene.path), 'utf8'));
      if (!doc.reflection) continue;  // extracted before scene_extract.py wrote the reflection
      assert.equal(doc.reflection.faces.length, 6, id);
      for (const f of doc.reflection.faces) assert.ok(f.length === 3 && f.every((v) => v >= 0 && v < 6), `${id} face ${f}`);
    }
    const id = extracted.includes('act2autochess_m04') ? 'act2autochess_m04' : extracted[0];
    const g = manifest.groups[sceneGroup(id)];
    const doc = JSON.parse(readFileSync(onDisk(g.scene.path), 'utf8'));
    const raw = readFileSync(onDisk(g.geom.path));
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const built = buildOfficialScene(THREE, { stageId: id, doc, buffer, textures: {}, lightmaps: [] }, focusUniforms(THREE));
    const lit = built.materials.filter((m) => m.uniforms.uRefl);
    assert.ok(lit.length > 0);
    for (const m of lit) {
      assert.doesNotMatch(m.fragmentShader, /#include <colorspace_fragment>/);
      assert.match(m.fragmentShader, /5\.0 \* lm\.a/);
      if (doc.reflection) assert.ok(Math.abs(m.uniforms.uRefl.value[4].x - doc.reflection.faces[4][0] * doc.reflection.intensity) < 1e-6);
    }
    // material colours stay as stored (no sRGB → linear): the desert sand's _BlendColor
    const sand = lit.find((m) => m.userData.official === 'MT_AutochessSand');
    if (sand) {
      const bc = doc.materials.MT_AutochessSand.colors._BlendColor;
      assert.ok(Math.abs(sand.uniforms.uBlendColor.value.r - bc[0]) < 1e-6 && Math.abs(sand.uniforms.uBlendColor.value.b - bc[2]) < 1e-6);
      assert.equal(sand.defines.GLOSSMAP, undefined, 'no gloss texture in this test (textures: {})');
    }
    built.dispose();
  });
});

describe('规程 (act3autochess) board', () => {
  test('规程: 加速 / 草地 tiles draw as plain road on the procedural board; m10\'s 盐坨子炮 stand as cannon devices facing DOWN', () => {
    assert.equal(TILEKEY_GLYPH.tile_speedup, 'r');
    assert.equal(TILEKEY_GLYPH.tile_duel_grassland, 'r');
    const st = stages3.act3autochess_m10;
    const cannons = stageDevices(st, classifyStage(st, AREAS.all)).filter((d) => d.kind === 'cannon');
    assert.deepEqual(cannons.map((d) => `${d.r},${d.c},${d.dir},${d.key}`).sort(),
      ['13,14,DOWN,trap_196_cnnon', '13,6,DOWN,trap_196_cnnon', '6,14,DOWN,trap_196_cnnon', '6,6,DOWN,trap_196_cnnon']);
    assert.equal(OFFICIAL_DEVICE.cannon, 'trap_196_cnnon');
  });
});

describe('extracted 规程 scenes (three level prefabs per stage)', { skip: !extracted3.length && 'no 规程 scene extracted (scene_extract.py --cn)' }, () => {
  for (const id of extracted3) {
    test(`${id}: the three sub-levels in the 19×21 frame, their own lightmaps, the CN textures apart`, () => {
      const g = manifest.groups[sceneGroup(id)];
      const doc = JSON.parse(readFileSync(onDisk(g.scene.path), 'utf8'));
      const bin = readFileSync(onDisk(g.geom.path));
      assert.equal(doc.stage, id);
      assert.equal(doc.pieces?.length, 3);
      doc.pieces.forEach((p, i) => assert.match(p.source, new RegExp(`level_${id}_sub_0${i + 1}\\.ab$`)));
      assert.equal(doc.lightmaps.length, 3, 'one lightmap per prefab');
      assert.deepEqual(doc.hidden, {});
      for (const gr of doc.groups) {
        const [off, n] = gr.idx;
        assert.ok(off + n * (gr.idxType === 'u16' ? 2 : 4) <= bin.length, `${gr.material} idx in range`);
        if (gr.lightmap >= 0) assert.ok(doc.lightmaps[gr.lightmap]?.light?.file && doc.lightmaps[gr.lightmap]?.mask?.file, `${gr.material}: lightmap ${gr.lightmap}`);
        for (const tx of Object.values(doc.materials[gr.material]?.textures || {})) {
          if (!tx.file) continue;
          assert.match(tx.file, /^cn\//, `${tx.file}: a CN texture under scene/tex/cn`);
          assert.ok(manifest.groups['scene/tex']?.[tx.file.replace(/\.png$/, '')], `${tx.file} listed`);
        }
      }
      // the island covers the frame (the boss field from row 0, the enemy preview area up to row 18), ground at z ≈ 0
      const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
      for (const gr of doc.groups) for (let i = 0; i < 2; i++) { lo[i] = Math.min(lo[i], gr.bounds[0][i]); hi[i] = Math.max(hi[i], gr.bounds[1][i]); }
      assert.ok(lo[0] <= 0 && hi[0] >= 20 && lo[1] <= 0 && hi[1] >= 18, `bounds ${lo} ${hi}`);
      assert.ok(doc.map?.highlandHeight > 0, 'map settings');
    });
  }
});
