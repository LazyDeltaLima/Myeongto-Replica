// test/render/tile-batch.test.js — one prefab laid on many tiles, drawn together (2026-11-12, fxplayer.js TileBatch; docs/rules/fx.md
// 「규정 보스 고치·지느러미의 이펙트」 비참한 비 장판, 「규정 전장의 화면·맵 이펙트」): 规程's 悲惨之雨 floor on 44 tiles was 176
// draws, a battlefield's 草地 on 16 tiles 64. Copies at the same effect time, turned alike, are drawn once per renderer, every
// copy's rows moved into the first copy's frame; the copies' own meshes are hidden only between sync and restore. And the
// pinned instances have their own backstop (PINNED_CAP): 44 floors no longer end the board's older effects.
// The pixels: test/render/tile-batch.browser.test.js (RENDER_E2E).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = path.join(ROOT, 'public');
const RAIN = ['pfx_enemy_20', 'enemy_acspider_debuff_ground_01'];
const GRASS = ['mapeff', 'mapeff_079_dikuai_01'];
const has = ([b, n]) => existsSync(path.join(PUB, `assets/local/fx/${b}/${n}.json`));
const skip = has(RAIN) && has(GRASS) ? false : 'needs the extracted 悲惨之雨 floor and 草地 tile effects';

async function setup() {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const p = path.join(PUB, decodeURIComponent(String(url)));
    if (!existsSync(p)) return { ok: false, json: async () => null };
    const txt = readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(txt) };
  };
  const THREE = await import('../../public/vendor/three.module.js');
  const fxp = await import('../../public/js/render/fxplayer.js');
  const TEX = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const lib = new fxp.FxLibrary('/assets/local/fx/');
  lib.texture = () => TEX;
  return { THREE, fxp, lib, restore: () => { globalThis.fetch = fetch0; } };
}

/** `rows` × `cols` copies of `def` on a grid of tiles, each updated `frames` frames. */
function lay(THREE, fxp, def, rows, cols, frames = 90, opts = {}) {
  const scene = new THREE.Scene(), insts = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = new fxp.FxInstance(def, { quality: 'high', floor: 0, pinned: true, ...opts });
    i.object.position.set(c, r, 0);
    scene.add(i.object);
    insts.push(i);
  }
  for (let f = 0; f < frames; f++) for (const i of insts) i.update(1 / 60);
  return { scene, insts };
}
/** The meshes a render of `scene` would draw (visible, with rows). */
function draws(scene) {
  scene.updateMatrixWorld(true);
  const out = [];
  scene.traverseVisible((o) => { if (o.isMesh && (o.geometry.instanceCount ?? 1) > 0) out.push(o); });
  return out;
}
const camera = (THREE) => { const c = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 100); c.up.set(0, 0, 1); c.position.set(5, -8, 10); c.lookAt(5, 2, 0); c.updateMatrixWorld(true); return c; };

test('44 悲惨之雨 floors: 176 draws → 4, the copies\' own meshes back after restore, the merged draws off', { skip }, async () => {
  const { THREE, fxp, lib, restore } = await setup();
  try {
    const def = await lib.load(...RAIN);
    const { scene, insts } = lay(THREE, fxp, def, 4, 11);
    assert.equal(draws(scene).length, 176, 'separate: 4 renderers × 44');
    const tb = new fxp.TileBatch();
    assert.equal(tb.sync(insts, camera(THREE)), 176, 'every renderer of every copy merged');
    assert.equal(draws(scene).length, 4, 'one draw per renderer');
    tb.restore();
    assert.equal(draws(scene).length, 176, 'restore: the copies draw themselves again, the merged draws are off');
    tb.dispose();
    for (const i of insts) i.dispose();
  } finally { restore(); }
});

test('the merged rows: each copy\'s own rows, moved by the distance between the copies in the first copy\'s frame', { skip }, async () => {
  const { THREE, fxp, lib, restore } = await setup();
  try {
    const def = await lib.load(...GRASS);
    const { scene, insts } = lay(THREE, fxp, def, 1, 3);
    const own = (i) => { const o = []; i.object.traverse((m) => { if (m.isMesh && m.geometry.getAttribute('iPos')) o.push(m); }); return o; };
    const mask = own(insts[0])[0];   // dikuai_mask_01: a MeshRenderer, one row
    const tb = new fxp.TileBatch();
    tb.sync(insts, null);   // no camera: the copies in their order
    const merged = draws(scene).find((m) => m.material === mask.material);
    assert.ok(merged && merged !== mask, 'drawn by a merged mesh with the first copy\'s material');
    assert.equal(merged.geometry.instanceCount, 3);
    assert.ok(merged.matrixWorld.equals(mask.matrixWorld), 'in the first copy\'s frame');
    const P = merged.geometry.getAttribute('iPos');
    const inv = new THREE.Matrix3().setFromMatrix4(mask.matrixWorld).invert();
    for (let k = 0; k < 3; k++) {
      const d = new THREE.Vector3(k, 0, 0).applyMatrix3(inv);   // copy k stands k tiles right of the first
      assert.ok(Math.abs(P.getX(k) - d.x) < 1e-5 && Math.abs(P.getY(k) - d.y) < 1e-5 && Math.abs(P.getZ(k) - d.z) < 1e-5, `copy ${k}: ${P.getX(k)}, ${P.getY(k)}, ${P.getZ(k)}`);
    }
    // the world point of each merged row is its own copy's
    for (let k = 0; k < 3; k++) {
      const w = new THREE.Vector3(P.getX(k), P.getY(k), P.getZ(k)).applyMatrix4(merged.matrixWorld);
      const o = new THREE.Vector3().setFromMatrixPosition(own(insts[k])[0].matrixWorld);
      assert.ok(w.distanceTo(o) < 1e-5, `copy ${k} at its own place`);
    }
    tb.dispose();
    for (const i of insts) i.dispose();
  } finally { restore(); }
});

test('only copies alike merge: another effect time, a turned copy, a MeshRenderer its clip switched off', { skip }, async () => {
  const { THREE, fxp, lib, restore } = await setup();
  try {
    const def = await lib.load(...GRASS);
    const a = lay(THREE, fxp, def, 2, 2, 90), b = lay(THREE, fxp, def, 2, 2, 30);
    for (const i of b.insts) { i.object.position.y += 3; a.scene.add(i.object); }
    const tb = new fxp.TileBatch();
    tb.sync([...a.insts, ...b.insts], camera(THREE));
    assert.equal(draws(a.scene).length, 8, 'two effect times: a set of 4 draws each');
    tb.restore();
    // turned: drawn by itself
    a.insts[0].object.rotation.z = Math.PI / 2;
    tb.sync(a.insts, camera(THREE));
    const d = draws(a.scene);
    assert.equal(d.length, 4 + 4 + 4 * 4, 'the turned copy keeps its own 4, the other three merge into 4 (the 4 later copies, not synced, their own 16)');
    tb.restore();
    a.insts[0].object.rotation.z = 0;
    // a MeshRenderer off (its clip's `mr:enabled`) is not drawn and stays off after restore
    const mask = []; a.insts[1].object.traverse((m) => { if (m.isMesh && m.geometry.getAttribute('iPos')) mask.push(m); });
    mask[0].visible = false;
    tb.sync(a.insts, camera(THREE));
    const merged = draws(a.scene).find((m) => m.material === mask[0].material || m.geometry.instanceCount === 3);
    assert.ok(merged, 'the other three copies of that renderer merge');
    tb.restore();
    assert.equal(mask[0].visible, false, 'still switched off');
    tb.dispose();
    for (const i of [...a.insts, ...b.insts]) i.dispose();
  } finally { restore(); }
});

test('the pinned instances have their own backstop: the other ones past PLAYER_CAP end, the pinned stay', { skip }, async () => {
  const { THREE, fxp, lib, restore } = await setup();
  try {
    const def = await lib.load(...GRASS);
    const base = fxp.fxStats().instances;
    const pinned = Array.from({ length: 60 }, () => new fxp.FxInstance(def, { quality: 'high', pinned: true }));
    const other = Array.from({ length: fxp.MAX_INSTANCES + fxp.MAX_LASTING + 20 }, () => new fxp.FxInstance(def, { quality: 'high' }));
    assert.equal(pinned.filter((i) => i.disposed).length, 0, 'no pinned one ended by the others');
    assert.equal(other.filter((i) => i.disposed).length, 12, 'the oldest 12 others past their cap (80)');
    assert.ok(other.slice(0, 12).every((i) => i.disposed), 'the oldest first');
    for (const i of [...pinned, ...other]) i.dispose();
    assert.equal(fxp.fxStats().instances, base);
    void THREE;
  } finally { restore(); }
});

const SRC = (p) => readFileSync(path.join(ROOT, p), 'utf8');
test('the effect layer: the floors and the stage\'s tile effects are laid on tiles and pinned; the batch runs around the draws', () => {
  const fx = SRC('public/js/render/fxgame.js');
  assert.match(fx, /tag: 'acRain', pinned: true, tiled: true \}/);
  assert.match(fx, /tag: 'stageTile' \}/);
  assert.match(fx, /\{ owner: null, buff: true, keep: true, pinned: true, tiled: true, until: Infinity, tag: 'stageTile' \}/);
  assert.match(fx, /for \(const l of live\) if \(l\.tiled && !l\.hidden\) tileInsts\.push\(l\.inst\);/);
  assert.match(fx, /\(tileBatch \|\|= new mod\.fxp\.TileBatch\(\)\)\.sync\(tileInsts, camera\);/);
  assert.match(fx, /\n {6}tileBatch\?\.restore\(\);\n {6}camera\.layers\.set\(0\);/);
  assert.match(fx, /tilt: drop \? null : tiltOn\(unit, def\), pinned: !!entry\.pinned \}\);/, 'spawn hands `pinned` to the player');
  assert.match(fx, /new mod\.fxp\.FxInstance\(def, \{ quality: q\(\), pinned: !!extra\?\.pinned \}\);/, 'boardFx too');
});
