// test/render/fx-preload.test.js — the boss round prep's effect preload (public/js/render/fxgame.js): the names an enemy
// binding holds, and the layer's preload() in node (dry: it never loads, the queue stays as it was).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindingNames, createFxLayer, trailNames } from '../../public/js/render/fxgame.js';

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

test('trailNames (2026-10-31): every trail an operator binding names, once — modes, talent parts, sides, drones; not its skill shots', () => {
  const b = {
    modes: ['Default', 'S3'], trail: [['x_attack_trail'], ['x_skill_03_trail', 'x_attack_trail'], []], cast: [['x_start']],
    talentAtk: [{ 'T.1': { trail: ['x_talent_trail'], hit: ['x_talent_hit'] } }],
    sideFx: [{ ally: { trail: 'x_heal_trail' }, foe: { trail: ['x_dmg_trail'] } }],
    funnels: [[{ trail: ['x_drone_trail'], hide: ['x_drone_idle'] }]],
    skills: [{ shot: ['x_skill_shot'], cast: ['x_cast'] }],
  };
  assert.deepEqual(trailNames(b).sort(), ['x_attack_trail', 'x_dmg_trail', 'x_drone_trail', 'x_heal_trail', 'x_skill_03_trail', 'x_talent_trail']);
  assert.deepEqual(trailNames(null), []);
  const horn = JSON.parse(readFileSync(new URL('../../public/assets/local/fx/modes.json', import.meta.url), 'utf8')).char_4039_horn;
  if (horn) assert.deepEqual(trailNames(horn).sort(), ['horn_attack_01_trail_02', 'horn_skill_02_trail_02', 'horn_skill_03_trail_02']);
});

test('preload trailsOnly in a dry layer queues nothing', () => {
  const fx = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true });
  assert.equal(fx.preload([{ info: { defId: 'char_1_x', side: 'player' } }], { trailsOnly: true }), 0);
  fx.destroy();
});
