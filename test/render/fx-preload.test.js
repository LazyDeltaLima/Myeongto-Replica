// test/render/fx-preload.test.js — the boss round prep's effect preload (public/js/render/fxgame.js): the names an enemy
// binding holds, and the layer's preload() in node (dry: it never loads, the queue stays as it was).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindingNames, createFxLayer } from '../../public/js/render/fxgame.js';

test('bindingNames: every effect name of a binding once, model points left out', () => {
  const b = {
    start: 'enemy_x_start', dead: 'enemy_x_dead',
    modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: ['enemy_x_cast'], hit: ['enemy_x_hit', 'enemy_x_hit'], opt: { s: 0.1 } } },
      { name: 'Skill', ranged: { proj: { key: 'p', trail: 'enemy_x_trail', hit: ['enemy_x_phit'], speed: 8 } } }],
    skills: { roar: { cast: ['enemy_x_roar'], buff: { name: 'enemy_x_buff' } } },
    points: { Hit: { bone: 'bone_hit' } },
  };
  const n = bindingNames(b);
  for (const k of ['enemy_x_start', 'enemy_x_dead', 'enemy_x_cast', 'enemy_x_hit', 'enemy_x_trail', 'enemy_x_phit', 'enemy_x_roar', 'enemy_x_buff']) assert.ok(n.includes(k), k);
  assert.equal(n.filter((x) => x === 'enemy_x_hit').length, 1);
  assert.ok(!n.includes('bone_hit'));
  assert.deepEqual(bindingNames(null), []);
});

test('preload in a dry layer (tests) queues nothing and pauses without error', () => {
  const fx = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true });
  assert.equal(fx.preload([{ info: { defId: 'char_1_x', side: 'player' } }]), 0);
  assert.equal(fx.preload(null), 0);
  fx.destroy();
});
