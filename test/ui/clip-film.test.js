// A season's entry film played from the official clip (public/js/ui/clipFilm.js; tools/local-extract/season_ui.py
// writes season/<id>/entry/film): Unity's Hermite curves (stepped keys hold), the RectTransform layout (anchors, pivot,
// size delta, y up), the 1280×720 canvas expanded to the screen, and — when the extract is on disk — that the film,
// its cover and the hub nodes the title screen plays are where the code reads them.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const { evalCurve, sampleClip, rectOf, canvasFit, REVEAL, FILM_OFF, FILM_END } = await import('../../public/js/ui/clipFilm.js');

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

describe('clip film curves', () => {
  test('a Hermite segment: flat tangents ease, matching tangents run straight', () => {
    const flat = [[0, 0, 0, 0], [1, 1, 0, 0]];
    near(evalCurve(flat, 0.5), 0.5);
    near(evalCurve(flat, 0.25), 3 * 0.0625 - 2 * 0.015625); // smoothstep
    const line = [[0, 0, 2, 2], [1, 2, 2, 2]];
    near(evalCurve(line, 0.3), 0.6);
  });
  test('before the first key the first value, after the last the last; a null tangent holds (m_IsActive)', () => {
    const k = [[1, 5, 0, 0], [2, 7, 0, 0]];
    near(evalCurve(k, 0), 5);
    near(evalCurve(k, 9), 7);
    const step = [[0, 1, null, null], [2.5667, 0, null, null], [3.1667, 0, null, null]];
    near(evalCurve(step, 2.5), 1);
    near(evalCurve(step, 2.6), 0);
  });
  test('a scale curve samples both axes; float curves by attribute', () => {
    const a = sampleClip([
      { p: 'x', a: 'scale', k: [[0, [1, 2], [0, 0], [0, 0]], [1, [3, 4], [0, 0], [0, 0]]] },
      { p: 'x', a: 'm_Alpha', k: [[0, 0, 0, 0], [1, 1, 0, 0]] },
    ], 1);
    assert.deepEqual(a.get('x'), { scale: [3, 4], m_Alpha: 1 });
  });
});

describe('clip film layout', () => {
  test('a centred node: anchored position from the parent centre, y up', () => {
    const n = { amin: [0.5, 0.5], amax: [0.5, 0.5], pos: [100, 50], size: [200, 100], piv: [0.5, 0.5] };
    assert.deepEqual(rectOf(n, 1280, 720), { left: 640 + 100 - 100, top: 720 - (360 + 50 + 50), w: 200, h: 100 });
  });
  test('a stretched node takes the parent size plus its size delta; a pivot at the right edge grows leftwards', () => {
    const full = { amin: [0, 0], amax: [1, 1], pos: [0, 0], size: [0, 0], piv: [0.5, 0.5] };
    assert.deepEqual(rectOf(full, 1500, 720), { left: 0, top: 0, w: 1500, h: 720 });
    const right = { amin: [0.5, 0.5], amax: [0.5, 0.5], pos: [0, 0], size: [680, 80], piv: [1, 0.5] };
    const r = rectOf(right, 1280, 720, { 'm_SizeDelta.x': 180 });
    assert.equal(r.left + r.w, 640);
    assert.equal(r.w, 180);
  });
  test('a negative animated width draws nothing (the ID cards open from −12)', () => {
    const n = { amin: [0.5, 0.5], amax: [0.5, 0.5], pos: [0, 0], size: [177, 70], piv: [1, 0.5] };
    assert.equal(rectOf(n, 1280, 720, { 'm_SizeDelta.x': -12 }).w, 0);
  });
  test('the canvas expands: a wide screen keeps 720 units of height, a tall one 1280 of width', () => {
    const wide = canvasFit(2560, 1080);
    near(wide.s, 1.5); near(wide.h, 720); near(wide.w, 2560 / 1.5);
    const tall = canvasFit(1280, 1024);
    near(tall.s, 1); near(tall.w, 1280); near(tall.h, 1024);
  });
});

const FILM = path.join(ROOT, 'public/assets/local/season/act3autochess/entry/film.json');
describe('the extracted 规程 film', { skip: existsSync(FILM) ? false : 'no local extract (tools/local-extract/season_ui.py)' }, () => {
  const film = existsSync(FILM) ? JSON.parse(readFileSync(FILM, 'utf8')) : null;
  test('the film switches itself off at FILM_OFF and the clip ends at FILM_END', () => {
    const active = film.curves.find((c) => c.p === film.film && c.a === 'm_IsActive');
    assert.ok(active, 'the film root has an m_IsActive curve');
    near(active.k.find((k) => k[1] === 0)[0], FILM_OFF, 1e-3);
    near(film.length, FILM_END, 1e-3);
  });
  test('every node hangs under the film or the cover, parents first', () => {
    const seen = new Set();
    for (const n of film.nodes) {
      const parent = n.p.includes('/') ? n.p.slice(0, n.p.lastIndexOf('/')) : '';
      assert.ok(n.p === film.film || n.p === film.cover || seen.has(parent), `${n.p} after its parent`);
      seen.add(n.p);
    }
  });
  test('every hub node the title screen plays is moved by the clip', () => {
    for (const [key, r] of Object.entries(REVEAL)) assert.ok(film.curves.some((c) => c.p === r.p), `${key}: ${r.p}`);
    const logo = film.curves.find((c) => c.p === REVEAL.logo.p && c.a === 'm_AnchoredPosition.y');
    near(logo.k.at(-1)[1], REVEAL.logo.restY, 1e-3);
  });
  test('every picture the film names is a sprite or a flipbook texture of the extract', () => {
    const local = JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.json'), 'utf8')).groups['season/act3autochess/entry'];
    for (const n of film.nodes) if (n.img?.sprite) assert.ok(local[n.img.sprite], n.img.sprite);
    for (const m of Object.values(film.materials)) if (m.tex) assert.ok(local[m.tex], m.tex);
  });
});
