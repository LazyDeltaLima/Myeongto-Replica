// test/render/lift-drift.test.js — effects, shots and lock reticles at a unit's body / head height are drawn ON its model
// anywhere on the board (render/fx/camera.js liftX / bodyPoint). A model is an upright screen billboard drawn straight up
// from its root, while a point raised in world z drifts away from the screen centre under the perspective camera: the old
// anchors (the column kept, only z raised) slid off the models toward the board's edges, as 望's stone balls had
// (maintainer report 2026-10-16, wang-stone-fx.test.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { presetCamera } from '../../public/js/render/projection.js';
import { bodyZ, bodyPoint, liftX } from '../../public/js/render/fx/camera.js';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FXGAME = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const W = 1280, H = 720;
const cam = presetCamera('normal', { width: W, height: H });

/** The tiles whose root is on screen (liftFor is only exact there — wang-stone-fx.test.js). */
function onScreen() {
  const out = [];
  for (let x = 0; x <= 20; x++) for (let y = 0; y <= 18; y++) {
    const r = cam.project(x, y, 0);
    if (r.x >= 0 && r.x <= W && r.y >= 0 && r.y <= H) out.push([x, y]);
  }
  return out;
}

test('bodyPoint: the body / head point projects straight above the model\'s root, at its drawn height', () => {
  const tiles = onScreen();
  assert.ok(tiles.length > 30);
  let worst = 0;
  for (const [x, y] of tiles) for (const frac of [0.45, 0.5, 1.1]) for (const v of [
    { x, y, z: 0, _headTiles: 1.2 },
    { x, y, z: 0.42, hover: 0, _headTiles: 1.6, modelDrop: 0.1 },   // high ground, a model its prefab lowers
    { x, y, z: 0, hover: 0.6, _headTiles: 1 },                     // a flyer
  ]) {
    const base = (v.z || 0) + (v.hover || 0);
    const r = cam.project(x, y, base);
    const p = bodyPoint(cam, v, frac);
    const q = cam.project(p.x, p.y, p.z);
    assert.ok(Math.abs(q.x - r.x) < 0.01, `(${x}, ${y}) frac ${frac}: ${q.x} vs root ${r.x}`);
    assert.equal(p.z, bodyZ(cam, v, frac), 'the height is bodyZ\'s');
    assert.ok(Math.abs(r.y - q.y - ((v._headTiles * frac) - (v.modelDrop || 0)) * r.s) < 0.01, 'drawn frac of the model up');
    // the old anchor: the column kept
    worst = Math.max(worst, Math.abs(cam.project(x, y, p.z).x - r.x) / r.s);
  }
  assert.ok(worst > 0.3, `the drift this fixes (${worst.toFixed(2)} tile at the edges)`);
  // a column of its own (MODEL_SHIFT) and the screen centre
  const v = { x: 3, y: 10, z: 0, modelDX: 1, _headTiles: 1.2 };
  const p = bodyPoint(cam, v, 0.5, 4);
  assert.ok(Math.abs(cam.project(p.x, p.y, p.z).x - cam.project(4, 10, 0).x) < 0.01);
  assert.ok(Math.abs(liftX(cam, cam.tx, 10, 0, 2) - cam.tx) < 1e-9, 'none on the screen centre');
  assert.equal(liftX(null, 3, 10, 0, 2), 3, 'no camera: the column');
});

test('fxgame: body / head effects, status effects, shot ends, orbits and line ends go through the lift', () => {
  // _spawnLocation 2 / 4 (followed)
  assert.match(FXGAME, /bp\.x = liftX\(camRef, ex\(v\), ey\(v\), \(v\.z \|\| 0\) \+ \(v\.hover \|\| 0\), z\(\)\); bp\.y = ey\(v\); bp\.z = z\(\);\n      return onModel\(v, bp, ey\(v\)\);/);
  // a model point's fallback, the status effects (fxstatus.js frac), the orbiters
  assert.match(FXGAME, /specialPoint\(v, p, key\) \|\| \(camRef \? onModel\(v, bodyPoint\(camRef, v, 0\.5, mx\(v\)\)\) : v\)/);
  assert.match(FXGAME, /get x\(\) \{ return frac > 0 && camRef \? bodyPoint\(camRef, view, frac, view\.x, statusAt\)\.x : view\.x; \}/);
  assert.match(FXGAME, /get x\(\) \{ return \(camRef \? bodyPoint\(camRef, v, SPAWN_FRAC\[2\], v\.x, orbitAt\)\.x : v\.x\) \+ r \* Math\.cos\(ang\(\)\); \}/);
  // shots: from the drawn model (no muzzle point), to its hit point or its middle — the whole point, not its z only
  // (2026-10-31: both ends then moved onto the model's plane, the same spot on screen — fxpoints.js onModelPlane)
  assert.equal((FXGAME.match(/onModel\(src, p \|\| bodyPoint\(camRef, src, SHOT_HEIGHT\.launch, mx\(src\)\)\);/g) || []).length, 3);
  assert.match(FXGAME, /const shotTo = \(t\) => onModel\(t, specialPoint\(t, hitAt, 'hit'\) \|\| bodyPoint\(camRef, t, SPAWN_FRAC\[2\], mx\(t\), hitAt\)\);/);
  assert.doesNotMatch(FXGAME, /tz: shotTo\(|z: shotTo\([\w.]+\) \}/, 'no shot end on the target\'s z only');
  assert.doesNotMatch(FXGAME, /bodyZ\(camRef, (src|t|from|v), (SHOT_HEIGHT|SPAWN_FRAC)[^)]*\) \}/, 'no z-only body point left');
  // gliders at a body height: both ends lifted
  assert.equal((FXGAME.match(/glider\(liftX\(camRef, [^;]+, liftX\(camRef, /g) || []).length, 2);
  // a line end without its point
  assert.match(FXGAME, /else if \(!p\) Object\.assign\(out, onModel\(v, bodyPoint\(camRef, v, SPAWN_FRAC\[2\], mx\(v\), out\)\)\);/);
});

let fake, FX;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
});
after(() => { FX?.setSimProjectileSpeeds(null); fake.restore(); });

const unit = (id, x, y, o = {}) => ({ id, x, y, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, isEnemy: false, maxHp: 3000, info: { defId: 'char_x' }, onHit() {}, ...o });
function makeFx(views) {
  const P = fake.P, ctx = fakeViewCtx(P), map = new Map(views.map((v) => [v.id, v]));
  return new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, heightAt: () => 0, settings: { quality: 'high', damageNumbers: true },
    timeScale: () => 1, loadLevel: () => 0, subProfOf: () => null, view: (id) => map.get(id) || null,
    screenSize: () => ({ width: W, height: H }), fieldTop: () => 120,
  });
}

test('procedural shots leave and meet the drawn models at the board\'s edges; their flight stays on the units\' columns', () => {
  FX.setSimProjectileSpeeds(null);
  const a = unit(1, 1, 10), b = unit(2, 9, 10, { isEnemy: true });
  const fx = makeFx([a, b]);
  fx.attack(a, b, 'arrow');
  const pr = fx.projs[0];
  assert.equal(pr.tx, b.x, 'homing / timing on the target\'s column');
  const s0 = fx._shotPoint(pr, 0, cam, { x: 0, y: 0, s: 0, depth: 0 }), s1 = fx._shotPoint(pr, 1, cam, { x: 0, y: 0, s: 0, depth: 0 });
  assert.ok(Math.abs(s0.x - cam.project(pr.x0, pr.y0, 0).x) < 0.01, 'drawn over the shooter (its hands)');
  assert.ok(Math.abs(s1.x - cam.project(b.x, b.y, 0).x) < 0.01, 'drawn on the target');
  assert.ok(Math.abs(cam.project(pr.x0, pr.y0, pr.z0).x - s0.x) / s0.s > 0.3, 'the old start drifted off her');
});

test('a lock reticle sits on the locked enemy\'s drawn body at the edges', () => {
  const a = unit(1, 6, 9), e = unit(21, 11, 10, { isEnemy: true });
  const fx = makeFx([a, e]);
  fx.simFx('lock', e.x, e.y, { id: 21, src: 1 });
  fx.update(1 / 60);
  const L = fx.locks[0];
  assert.equal(L.x, e.x, 'matched on its column (bombard / crit)');
  assert.ok(Math.abs(L.ring.position.x - cam.project(e.x, e.y, 0).x) < 0.01);
});

test('a held effect at a model point keeps its screen offset from the unit as it walks (fxpoints.js heldAt)', async () => {
  // 더블린 적의 굴절 (enemy_dushdo_2_buff_01, _spawnLocation 2, a buff's effect: held), made at the hit point on the right
  // edge, then the enemy walks to the left edge
  const { heldAt, liftedPoint, screenOffset } = await import('../../public/js/render/fxpoints.js');
  const tiles = onScreen(), [x0, row] = tiles.reduce((a, t) => (t[0] > a[0] ? t : a)), z = 0, b0 = { x: x0, y: row, z }, r0 = cam.project(b0.x, b0.y, z);
  const p0 = liftedPoint(cam, b0.x, row, z, r0.y, r0.x - 0.1 * r0.s, r0.y - 0.6 * r0.s, { x: 0, y: 0, z: 0 });
  const off = screenOffset(cam, b0, p0);
  assert.ok(Math.abs(off.du + 0.1) < 1e-6 && Math.abs(off.dv + 0.6) < 1e-6, 'the hit point\'s offset in tiles');
  let oldWorst = 0;
  for (const [x, y] of tiles) {
    const b = { x, y, z }, r = cam.project(x, y, z);
    const q = cam.project(...Object.values(heldAt(cam, b, off, { x: 0, y: 0, z: 0 })));
    assert.ok(Math.abs(q.x - (r.x - 0.1 * r.s)) < 0.01 && Math.abs(q.y - (r.y - 0.6 * r.s)) < 0.01, `(${x}, ${y}) on the model`);
    const w = cam.project(x + p0.x - b0.x, y + p0.y - b0.y, z + p0.z - b0.z);   // the old held world offset
    oldWorst = Math.max(oldWorst, Math.hypot(w.x - (r.x - 0.1 * r.s), w.y - (r.y - 0.6 * r.s)) / r.s);
  }
  assert.ok(oldWorst > 0.2, `the drift this fixes (${oldWorst.toFixed(2)} tile)`);
  assert.match(FXGAME, /off = hold && !follow && camRef \? screenOffset\(camRef, b0, p0\) : null;/);
  assert.match(FXGAME, /get x\(\) \{ first\(\); return off \? held\(\)\.x : /);
});
