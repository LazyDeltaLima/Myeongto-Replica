// test/render/feedback5-zone-stack.test.js — persistent ground areas (炼金单元 …) stay readable when they stack (community
// report of 2026-10-06 「炼金师分支干员的炼金单元等范围持续性技能特效太亮（尤其是多层叠加以后）」): a zone the sim re-sends under one
// `key` (引星棘刺 S2's drifting unit, every second) is updated in place instead of piling up a new additive layer each time,
// and a persistent area is drawn dimmer and shares its light with the persistent areas overlapping it (÷ √n) —
// render/fx/zones.js zone / zoneAlpha, render/fx/simfx.js (the event's `key`).
// Run: node --test test/render/feedback5-zone-stack.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FxSystem } from '../../public/js/render/fx.js';
import { zoneAlpha, ZONE_ALPHA, ZONE_PERSIST } from '../../public/js/render/fx/zones.js';
import { presetCamera } from '../../public/js/render/projection.js';

/** An FxSystem shell with fake sprites: enough for zone() / _updateZones() / simFx('zone'). */
function fxShell() {
  const cam = presetCamera('normal', { width: 1280, height: 720 });
  class Sprite {
    constructor() { this.anchor = { set() {} }; this.position = { set() {} }; this.scale = { set() {} }; this.alpha = 1; this.tint = 0; this.destroyed = false; }
    destroy() { this.destroyed = true; }
  }
  const fx = Object.create(FxSystem.prototype);
  Object.assign(fx, {
    P: { Sprite, BLEND_MODES: { ADD: 1 } },
    tex: { soft: {}, ring: {} },
    zones: [],
    ctx: { cam: () => cam, heightAt: () => 0, timeScale: () => 2, view: () => null },
    _p: { x: 0, y: 0, s: 0, depth: 0 }, _q: { x: 0, y: 0, s: 0, depth: 0 },
    _onGround() {},
    _groundZ: () => 0,
  });
  return fx;
}

test('a zone re-sent under the same key is moved / resized in place — one layer, not one per event', () => {
  const fx = fxShell();
  fx.simFx('zone', 5, 10, { id: 1, r: 1.1, duration: 12, key: 'thorn2:7:1' });
  for (let i = 1; i <= 11; i++) {
    fx._updateZones(0.5);
    fx.simFx('zone', 5 + 0.1 * i, 10, { id: 1, r: 1.1 + 0.13 * i, duration: 12 - i, key: 'thorn2:7:1' });
  }
  assert.equal(fx.zones.length, 1, 'twelve events, one zone');
  const zn = fx.zones[0];
  assert.ok(Math.abs(zn.x - 6.1) < 1e-9 && Math.abs(zn.r - (1.1 + 0.13 * 11)) < 1e-9, 'it follows the last event (drift, growth)');
  assert.ok(Math.abs(zn.dur - (zn.t + Math.max(0.6, 1 / 2))) < 1e-9, 'its end: the remaining game second at 2× (at least 0.6 s) from now');
  fx.simFx('zone', 8, 10, { id: 1, r: 1, duration: 12, key: 'thorn2:7:2' });
  fx.simFx('zone', 8, 11, { id: 2, r: 2, duration: 11 });
  fx.simFx('zone', 8, 11, { id: 2, r: 2, duration: 11 });
  assert.equal(fx.zones.length, 4, 'another key, and unkeyed zones (锡人\'s units, one event each), are zones of their own');
});

test('persistent areas are dimmer and share their light when they overlap; short bursts and telegraphs keep theirs', () => {
  const zone = (x, dur = 6, r = 2, warn = false) => ({ x, y: 10, r, dur, warn });
  const alone = zone(2);
  assert.deepEqual(zoneAlpha(alone, [alone]), ZONE_ALPHA.persist);
  const stack = [zone(5), zone(5.2), zone(5.4), zone(5.6)];
  const [disc, edge] = zoneAlpha(stack[0], stack);
  assert.ok(Math.abs(disc - ZONE_ALPHA.persist[0] / 2) < 1e-12 && Math.abs(edge - ZONE_ALPHA.persist[1] / 2) < 1e-12, 'four on one spot: ÷ √4 each');
  assert.ok(4 * disc <= 2 * ZONE_ALPHA.short[0], `the four discs together (${(4 * disc).toFixed(2)}) stay within two short bursts`);
  const far = [zone(2), zone(9)];
  assert.deepEqual(zoneAlpha(far[0], far), ZONE_ALPHA.persist, 'apart: no damping');
  const short = zone(5, ZONE_PERSIST - 0.5);
  assert.deepEqual(zoneAlpha(short, [short, ...stack]), ZONE_ALPHA.short, 'a short burst keeps its strength');
  const warn = zone(5, 6, 2, true);
  assert.deepEqual(zoneAlpha(warn, [warn, ...stack]), ZONE_ALPHA.warn, 'a telegraph keeps its strength');
});

test('the renderer applies it: four alchemy units on one spot draw their discs at half the lone strength', () => {
  const fx = fxShell();
  for (let i = 0; i < 4; i++) fx.simFx('zone', 5 + 0.1 * i, 10, { id: 9, r: 2, duration: 11 });
  fx.simFx('zone', 15, 10, { id: 9, r: 2, duration: 11 });
  fx._updateZones(1); // past the 0.25 s growth, before the fade
  const lone = fx.zones[4], stacked = fx.zones.slice(0, 4);
  const ratio = stacked[0].disc.alpha / lone.disc.alpha;
  assert.ok(Math.abs(ratio - 0.5) < 1e-9, `÷ √4 (${ratio})`);
});

// with the operator's official effects on, render/fxgame.js standInOff skips the 2D stand-in
// of its kit fx — but nothing plays the client's `…_token` / `…_range` prefab at a lasting area thrown away from her, so
// these zones keep their 2D drawing (areaAway); a short burst or an area on the operator stays official-only.
test('fxgame.js areaAway: a lasting zone away from its operator keeps the 2D zone (引星棘刺 S2 炼金单元, 锡人, 号角 …)', async () => {
  const { areaAway } = await import('../../public/js/render/fxgame.js');
  const thorn2 = { x: 7, y: 10 };
  assert.equal(areaAway(['fx', 'zone', 8.2, 10, { id: 1, r: 1.1, duration: 12, key: 'thorn2:1:1' }], thorn2), true, 'S2: the drifting unit');
  assert.equal(areaAway(['fx', 'zone', 8.9, 10, { id: 1, r: 2.4, duration: 0.4, key: 'thorn2:1:1' }], thorn2), true, 'its last re-send (keyed)');
  assert.equal(areaAway(['fx', 'zone', 4, 11, { id: 1, x: 4, y: 11, radius: 1, dur: 5 }], thorn2), true, '锡人: `dur`');
  assert.equal(areaAway(['fx', 'zone', 7, 10, { id: 1, duration: 10 }], thorn2), false, '莫斯提马 S2: on herself');
  assert.equal(areaAway(['fx', 'zone', 9, 10, { id: 1, r: 1 }], thorn2), false, 'a short burst (default 3 s stand-in, no duration)');
  assert.equal(areaAway(['fx', 'zone', 9, 10, { id: 1, dur: 0.6 }], thorn2), false, '望 stone blast (0.6 s)');
  assert.equal(areaAway(['fx', 'zone', 9, 10, null], thorn2), false);
  const src = (await import('node:fs')).readFileSync(new URL('../../public/js/render/fxgame.js', import.meta.url), 'utf8');
  const off = src.slice(src.indexOf('function standInOff('), src.indexOf('function standInOff(') + 700);
  assert.match(off, /if \(a === 'zone' && v && areaAway\(e, v\)\) return false;/, 'standInOff leaves such a zone to render/fx.js');
});
