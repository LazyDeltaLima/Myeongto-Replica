// 深水区: a body on deep water is drawn 0.7 tiles under the road (docs/rules/render.md 「심해 구역 잠김」) and water hides nothing,
// so what flies at it or follows it must not be cut at the road's height (docs/rules/fx.md 「심해 구역의 바닥 자르기」).
// Every way the battle layer makes an effect that can reach a sunk body is held here, as the source's own lines where a
// real FxInstance needs a canvas: the floor cut is what hid 인사이더's shot, and 36 of the 77 operators with a trail have those materials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flightSink, lobZ } from '../../public/js/render/fx/projectiles.js';

const FXGAME = readFileSync(new URL('../../public/js/render/fxgame.js', import.meta.url), 'utf8');

test('a shot at a sunk target goes down to its feet; a shot on the road stays at the road', () => {
  const sunk = { z: -0.7 };
  assert.equal(flightSink({ z0: 0.4, tz: -0.45, tgt: sunk }), -0.7, 'the target\'s feet, under its hit point');
  assert.equal(flightSink({ z0: 0.4, tz: 0.3, tgt: { z: 0 } }), 0, 'road');
  assert.equal(flightSink({ z0: 0.9, tz: 0.8, tgt: { z: 0.4 } }), 0, 'a target on a high tile');
  assert.equal(flightSink({ z0: -0.4, tz: 0.3, tgt: { z: 0 } }), -0.4, 'a shot from a sunk enemy');
  assert.equal(flightSink({ z0: 0.4, tz: 0, tgt: null }), 0, 'at a point on the ground');
  assert.equal(flightSink({ z0: 0.4 }), 0, 'no end yet');
});

test('a target that walks off the water in flight does not raise the floor under the shot', () => {
  let s = flightSink({ z0: 0.4, tz: -0.45, tgt: { z: -0.7 } });
  s = flightSink({ z0: 0.4, tz: 0.3, tgt: { z: 0 } }, s);
  assert.equal(s, -0.7);
});

test('the whole flight at a sunk target lies above the floor it is cut at', () => {
  const rec = { x0: 0, y0: 0, z0: 0.4, tx: 3, ty: 0, tz: -0.45, arc: 0, tgt: { z: -0.7 } };
  const cut = flightSink(rec) - 0.05;
  for (let k = 0; k <= 1; k += 0.05) assert.ok(lobZ(rec, k)[0] > cut, `at ${k.toFixed(2)}`);
});

test('every effect that can reach a sunk body takes its floor from it', () => {
  // a flight (launchTrail → placeTrail)
  assert.match(FXGAME, /rec\.inst\.setSink\(rec\.sink = flightSink\(rec, rec\.sink\)\);/);
  // spawn: over the units as well as under them (it was the road for every `over` effect: hits, lines, ropes)
  assert.match(FXGAME, /floor: drop \? null : floor \?\? \((?:\/\*\* @type \{number\} \*\/ \()?at\.z\)? < 0 \|\| !over \? at\.z \|\| 0 : 0\),/);
  // what follows a unit that sinks after it started: buffs, statuses, lines
  assert.match(FXGAME, /l\.inst\.setSink\(Math\.min\(vz, body\?\.z \|\| 0, l\.sinkFrom\?\.z \|\| 0\)\);/);
  // a line from a sunk shooter
  assert.match(FXGAME, /l\.sinkFrom = src;/);
  // a note's hit on its target (no follow)
  assert.match(FXGAME, /floor: Math\.min\(0, at\.z \|\| 0\) \}\);/);
});
