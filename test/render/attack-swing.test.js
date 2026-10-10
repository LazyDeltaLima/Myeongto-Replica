// test/render/attack-swing.test.js — the Spine attack clip driven by the sim's swing start (b.ev ['swing', id, windup, kind]):
// the clip plays from its first frame at the official speed — 1 / the clip scale of server/sim/ai.js attackTiming, read
// back as the clip's OnAttack frame ÷ windup — so its strike frame meets the 'atk' events; a capped clip (_maxAnimScale 1)
// plays at its own speed and the actor rests until the next swing (it used to stretch over the interval down to 0.35×);
// the 'atk' events of the strike leave the clip alone (render/spine.js swing, units.js onSwing, app.js 'swing').
// docs/rules/render.md 「공격 모션」. Headless fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const CAPER = 'char_4100_caper';     // 跃跃: Attack 1.0 s, strike at 0.533 s
const JSHOOT = 'enemy_1019_jshoot';  // 隐形弩手: Attack 1.0 s, strike at 0.533 s

let fake, SpineActor, swingSpeed;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor, swingSpeed } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

const dataOf = (entry) => ({ animations: Object.keys(entry.animations).map((name) => ({ name })) });
function actor(entry, perAttack = false) {
  const a = new SpineActor(dataOf(entry), entry);
  a.clipPerAttack = perAttack;
  a.setBase('idle');
  return a;
}
const track = (a) => a.spine.state.tracks[0];
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('swingSpeed: the strike frame meets the strike, within the client\'s [0.1, 10] clip scale', () => {
  assert.equal(swingSpeed(0.5, 0.5), 1);
  assert.equal(swingSpeed(0.5, 1), 0.5, 'stretched (no _maxAnimScale bound)');
  assert.equal(swingSpeed(0.5, 0.25), 2, 'quicker attacks: faster');
  assert.equal(swingSpeed(1, 0.01), 10);
  assert.equal(swingSpeed(0.01, 10), 0.1);
});

test('an operator\'s swing plays its clip once from the start at the official speed; the strike leaves it alone; a capped clip rests after it', () => {
  const a = actor(assets.chars[CAPER].spine.front);
  // the sim's windup for a 2.7 s interval and _maxAnimScale 1: the strike frame at its own time (0.533 s)
  assert.ok(a.swing(0.533));
  assert.equal(a.current, 'Attack');
  assert.equal(track(a).loop, false, 'one clip per swing');
  assert.equal(track(a).trackTime, 0, 'from the first frame (no look-ahead compression)');
  assert.equal(track(a).timeScale, 1, 'its own speed (it used to stretch to 1 / 2.7 = 0.37×)');
  run(a, 0.533);
  a.attack(2.7);
  a.attack(2.7);   // a second target of the same strike
  assert.equal(track(a).timeScale, 1, 'the strike does not re-phase or re-time it');
  run(a, 0.5);
  assert.equal(a.current, 'Attack', 'the clip plays to its end');
  run(a, 0.2);
  assert.notEqual(a.current, 'Attack', 'then rests until the next swing');
  // an unbounded clip stretched over a 2 s interval: half speed
  assert.ok(a.swing(1.066));
  assert.ok(Math.abs(track(a).timeScale - 0.5) < 1e-6);
});

test('a swing without a strike frame strikes as the clip ends; no wind-up (0) or no clip: nothing started (the \'atk\' path shows it)', () => {
  const entry = assets.chars[CAPER].spine.front;
  const a = actor({ ...entry, hits: {} });
  assert.ok(a.swing(2));
  assert.ok(Math.abs(track(a).timeScale - 0.5) < 1e-9, 'the 1 s clip over the 2 s swing');
  const b = actor(entry);
  assert.equal(b.swing(0), false);
  assert.equal(b.current, 'Idle');
});

test('an enemy\'s swing: the clip per attack at the official speed, the stun cuts it', () => {
  const a = actor(assets.enemies[JSHOOT].spine, true);
  a.setBase('move');
  assert.ok(a.swing(0.533));
  assert.equal(a.current, 'Attack');
  run(a, 0.3);
  a.setBase('stun');
  assert.notEqual(a.mode, 'attack', 'stunned: the swing is over');
  a.setBase('move');
  a.attack(2.7);   // a strike after the stun would not be the cut swing's: the 'atk' path plays it
  assert.equal(a.current, 'Attack');
});
