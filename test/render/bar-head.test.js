// test/render/bar-head.test.js — an enemy's HP bar / name tag sits on how far its model reaches above its own origin
// (setup-pose bounds.y + bounds.height), not on the box's raw height (render/units.js headTilesForUnit). Most enemies are
// feet-anchored (y ≈ 0) and do not move; a model whose origin sits mid-body (逐腐兽 y −404.7 of 722.6, 锏 −797.7 of
// 1182.5) had its bar about a tile too high. Ported from upstream 7b4f512c; the numbers are this fork's
// UNIT.modelScale (0.0027, upstream 1/320), the bounds and model factors are data/assets.json / enemies.json.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// units.js reads the browser's global PIXI (a script tag) only at run time
globalThis.PIXI = globalThis.PIXI || { Container: class {}, Graphics: class {}, Sprite: class {} };
const { headTilesForUnit, HEAD_TILES_CAP, HEAD_TILES_CAP_BOSS, HEAD_TOP_K } = await import('../../public/js/render/units.js');
const { UNIT } = await import('../../public/js/render/style.js');

const A = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const E = JSON.parse(readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));
const CASES = {
  逐腐兽: 'enemy_1270_nhstlk',
  疯狂的逐腐兽: 'enemy_1270_nhstlk_2',
  猎狗pro: 'enemy_1000_gopro_2',
  大鲍勃: 'enemy_1001_bigbo',
  锏: 'enemy_1525_blkswb',
};
const BOSS = new Set(['大鲍勃', '锏']);
const boundsOf = (name) => A.enemies[CASES[name]].spine.bounds;
const kOf = (name) => E[CASES[name]].modelScale ?? 1;
const head = (name, extra = {}) => headTilesForUnit({
  isEnemy: true, isBoss: BOSS.has(name), spineShown: true, bounds: boundsOf(name), modelK: kOf(name), modelKY: 1, ...extra,
});
const expected = (name) => { const b = boundsOf(name); return (b.y + b.height) * UNIT.modelScale * kOf(name) * HEAD_TOP_K; };

describe('enemy HP bar height: above the origin, not the box height (upstream 7b4f512c)', () => {
  test('the real bounds: 逐腐兽 and 锏 have their origin mid-body, 猎狗pro and 大鲍勃 are feet-anchored', () => {
    assert.ok(boundsOf('逐腐兽').y < -400 && boundsOf('锏').y < -790);
    assert.ok(Math.abs(boundsOf('猎狗pro').y) < 5 && Math.abs(boundsOf('大鲍勃').y) < 5);
  });

  test('逐腐兽: the bar sits on the part above the origin, about 0.9 tile lower than on the box height', () => {
    const tiles = head('逐腐兽');
    assert.ok(Math.abs(tiles - expected('逐腐兽')) < 1e-9, `逐腐兽 ${tiles.toFixed(3)}`);
    assert.ok(tiles < head('逐腐兽', { bounds: { height: boundsOf('逐腐兽').height } }) - 0.85, 'the old rule (raw height) put it ~0.9 tile higher');
    assert.equal(head('疯狂的逐腐兽'), tiles, 'the same model, the same height');
  });

  test('feet-anchored enemies barely move: 猎狗pro / 大鲍勃', () => {
    for (const name of ['猎狗pro', '大鲍勃']) {
      assert.ok(Math.abs(head(name) - expected(name)) < 1e-9, name);
      assert.ok(Math.abs(head(name) - head(name, { bounds: { height: boundsOf(name).height } })) < 0.02, `${name}: y ≈ 0, both rules agree`);
    }
  });

  test('the caps still hold: a bar never leaves the screen', () => {
    assert.ok(Math.abs(head('锏') - expected('锏')) < 1e-9, `锏 ${head('锏').toFixed(3)}`);
    assert.ok(head('锏') <= HEAD_TILES_CAP_BOSS);
    assert.ok(head('逐腐兽') <= HEAD_TILES_CAP);
    const absurd = headTilesForUnit({ isEnemy: true, isBoss: false, spineShown: true, bounds: { y: 0, height: 5000 }, modelK: 4, modelKY: 1 });
    assert.equal(absurd, HEAD_TILES_CAP, 'clamped at the cap');
  });

  test('fallbacks: no bounds → chibi headroom × model factor; operators / tokens → the fixed headroom; a boss without a model → 2.2', () => {
    assert.equal(headTilesForUnit({ isEnemy: true, isBoss: false, spineShown: true, bounds: null, modelK: 1, modelKY: 1 }), Math.max(0.55, UNIT.headroom));
    assert.equal(headTilesForUnit({ isEnemy: true, isBoss: false, spineShown: true, bounds: null, modelK: 1.5, modelKY: 1 }), Math.min(HEAD_TILES_CAP, Math.max(0.55, UNIT.headroom * 1.5)));
    assert.equal(headTilesForUnit({ isEnemy: true, isBoss: true, spineShown: false, bounds: null, modelK: 1, modelKY: 1 }), HEAD_TILES_CAP, 'a boss without a model');
    assert.equal(headTilesForUnit({ isEnemy: false, isBoss: false, spineShown: true, bounds: { y: 0, height: 500 }, modelK: 1, modelKY: 1 }), UNIT.headroom, 'operators / tokens');
  });

  test('one implementation: UnitView hands the bounds to headTilesForUnit, which adds y and height', () => {
    const units = readFileSync(path.join(ROOT, 'public/js/render/units.js'), 'utf8');
    assert.match(units, /const top = Number\.isFinite\(b\.y\) \? b\.y \+ b\.height : b\.height;/);
    assert.match(units, /bounds: actor && actor\.entry \? actor\.entry\.bounds : null/);
    assert.match(units, /headTilesForUnit\(\{/);
  });
});
