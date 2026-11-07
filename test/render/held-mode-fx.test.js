// test/render/held-mode-fx.test.js — a mode an equipped skill holds through the deployment by the sim form (fxmap.js
// FORM_HELD_MODES, 2026-11-07, official client): 丰川祥子 S2 满月的舞会 is a toggle with no duration — oblvns_s_2[switch] keeps
// her in S2_Atk (钢琴, the skill's 「初始」) and its toggle moves her to S2_AttackSpeed (风琴, the kit's form 'organ'). The effect
// layer only looked at a mode while a skill ran, so her S2 swings cast the Default mode's oblvns_attack_01_start and the cast
// played both timbres' buffs at once (test/render/mode-switch-list.js had S2_Atk / S2_Fever as todo).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';
import { FORM_HELD_MODES, heldMode, heldModes } from '../../public/js/render/fxmap.js';

const has = (list, n) => list.some((x) => x.split('@')[0] === n);

test('heldMode: the form\'s mode, the piano without a form, nothing for another skill or operator', () => {
  const bind = { modes: ['Default', 'S2_AttackSpeed', 'S2_Atk', 'S2_Fever', 'S3', 'S2_Fever_Mag'] };
  assert.equal(heldMode(bind, 'char_4182_oblvns', 1, null), 2);
  assert.equal(heldMode(bind, 'char_4182_oblvns', 1, 'organ'), 1);
  assert.equal(heldMode(bind, 'char_4182_oblvns', 1, 'other'), 2, 'an unlisted form: the skill\'s first');
  assert.equal(heldMode(bind, 'char_4182_oblvns', 2, null), -1, 'S3: a skill mode while it runs');
  assert.equal(heldMode(bind, 'char_x', 1, null), -1);
  assert.equal(heldMode(null, 'char_4182_oblvns', 1, null), -1);
  assert.deepEqual(heldModes(bind, 'char_4182_oblvns', 1).sort(), [1, 2, 3, 5]);
  assert.ok(Object.isFrozen(FORM_HELD_MODES.char_4182_oblvns[1].forms));
});

test('丰川祥子 S2: the piano\'s buff from the deployment and its swing cast; the toggle swaps both to the organ\'s', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const v = Object.assign(unit(1, 'ally', 'char_4182_oblvns', 0, 1), {});
  v.info.kind = 'op';
  const views = new Map([[1, v], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  const swing = () => {
    layer.onEvent(['swing', 1, 0.2, 'none', 0, 9], views);
    layer.update(0.25);
    layer.onEvent(['atk', 1, 9, 'oblvnsNote'], views);
    const a = take();
    layer.update(1);
    take();
    return a;
  };
  layer.onEvent(['deploy', 1], views);
  layer.update(0.1);
  const d = take();
  assert.ok(has(d, 'oblvns_skill_02_buff_01') && !has(d, 'oblvns_skill_02_buff'), `deploy: the piano's buff only: ${d}`);
  let a = swing();
  assert.ok(has(a, 'oblvns_skill_02_start_A') && !has(a, 'oblvns_attack_01_start') && !has(a, 'oblvns_skill_02_start_B'), `piano swing: ${a}`);
  // the toggle: 'skill' on, the kit's spGain with the new form (the layer gets it before app.js sets the view's form), 'skill' off
  layer.onEvent(['skill', 1, 1], views);
  const toggle = ['fx', 'spGain', 0, 0, { x: 0, y: 0, id: 1, form: 'organ' }];
  layer.onEvent(toggle, views);
  v.form = 'organ';
  layer.onEvent(['skill', 1, 0], views);
  layer.update(0.1);
  const c = take();
  assert.deepEqual(c.filter((n) => /oblvns_skill_02_buff/.test(n)), ['oblvns_skill_02_buff'], `the toggle: the organ's buff once, not both: ${c}`);
  a = swing();
  assert.ok(has(a, 'oblvns_skill_02_start_B') && !has(a, 'oblvns_skill_02_start_A'), `organ swing: ${a}`);
  assert.equal(layer.ownsFx(toggle), true, 'no SP sparkle for the toggle (KIT_NO_STAND_IN)');
}));

test('丰川祥子 S1 / S3: no held mode — the Default mode\'s swing outside the skill', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const v = unit(1, 'ally', 'char_4182_oblvns', 0, 0);
  v.info.kind = 'op';
  const views = new Map([[1, v], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  layer.onEvent(['deploy', 1], views);
  layer.update(0.1);
  assert.ok(!take().some((n) => /oblvns_skill_02_buff/.test(n)));
  layer.onEvent(['swing', 1, 0.2, 'none', 0, 9], views);
  layer.update(0.25);
  layer.onEvent(['atk', 1, 9, 'oblvnsNote'], views);
  assert.ok(has(take(), 'oblvns_attack_01_start'));
}));
