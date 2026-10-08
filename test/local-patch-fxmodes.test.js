// test/local-patch-fxmodes.test.js — skill effects on every attack of the skill (local patch, docs/LOCAL-PATCH.md 「스킬 중 공격
// 이펙트」): the attack-mode effect bindings tools/local-extract/char_modes.py writes (tools/assets/local-char-modes.json,
// public/assets/local/fx/modes.json) and the helpers render/fxgame.js decides with (render/fxmap.js attackMode / boundEffects).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { attackMode, boundEffects, activationEffects } from '../public/js/render/fxmap.js';
import { loadCharModes } from '../tools/assets/skill-mode-sfx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = path.join(ROOT, 'public', 'assets', 'local', 'fx');
const extracted = existsSync(path.join(FX, 'modes.json')) && existsSync(path.join(FX, 'index.json'));

describe('attack-mode effect bindings', () => {
  const bind = { modes: ['Default', 'S2', 'S2_Overload', 'S3'], cast: [['a_start'], ['s2_start'], ['ov_start'], ['s3_start', 's3_down_x']], hit: [['a_hit'], [], [], ['s3_hit', 's3_hit_2', 's3_hit_3']] };

  test('attackMode: Default when no skill runs, the running skill\'s mode, -1 for a skill without one, null unbound', () => {
    assert.equal(attackMode(bind, false, 2), 0);
    assert.equal(attackMode(bind, true, 2), 3);
    assert.equal(attackMode(bind, true, 1), 1);
    assert.equal(attackMode(bind, true, 0), -1, 'S1 switches no mode');
    assert.equal(attackMode(null, true, 2), null);
  });

  test('boundEffects: only the extracted prefabs, in order; nothing for no mode', () => {
    const pre = ['a_start', 'a_hit', 's3_start', 's3_hit_2', 's3_hit'];
    assert.deepEqual(boundEffects(bind, pre, 3, 'cast'), ['s3_start']);
    assert.deepEqual(boundEffects(bind, pre, 3, 'hit'), ['s3_hit', 's3_hit_2']);
    assert.deepEqual(boundEffects(bind, pre, -1, 'cast'), []);
    assert.deepEqual(boundEffects(bind, null, 0, 'cast'), []);
  });

  test('local-char-modes.json: cast / hit / trail per mode, no directional copies; the mode\'s own shot first', () => {
    const modes = loadCharModes(ROOT);
    for (const [id, e] of Object.entries(modes)) {
      for (const role of ['cast', 'hit', 'trail']) {
        assert.equal(e[role]?.length, e.modes.length, `${id} ${role}`);
        for (const list of e[role]) for (const n of list) assert.doesNotMatch(n, /_(up|down|left|back)(_|$)/i, `${id} ${n}`);
      }
    }
    const w = modes.char_1035_wisdel;
    assert.deepEqual(w.cast[3], ['wisdel_skill_03_start'], '维什戴尔 S3 casts on each attack');
    assert.deepEqual(w.cast[0], ['wisdel_attack_a_start'], 'of Attack_A/B/C only the first');
    assert.equal(modes.char_1038_whitw2.proj[1][0], 'projectile_chr_whitw2_s1', '荒芜拉普兰德 S1: her shot before the drones');
    assert.deepEqual(modes.char_1038_whitw2.hit[0], ['whitw2_hit_01'], 'the drones\' hits are theirs, not the attack\'s');
    assert.deepEqual(w.trail[0], ['wisdel_attack_01_trail'], 'a ranged attack\'s projectile trail (its _mainEffect)');
    const o = modes.char_4182_oblvns;
    assert.deepEqual(o.attach[o.modes.indexOf('S3')], ['oblvns_skill_03_range'], '丰川祥子 S3\'s range: its mode buff\'s effect');
    const c = modes.char_245_cello;
    assert.ok(c.attach[c.modes.indexOf('S3')].includes('cello_skill_03_buff_range'), '비르투오사 S3\'s range: an ability\'s own _effects');
    const a = modes.char_4132_ascln;
    assert.ok(a.attach[a.modes.indexOf('S3')].includes('ascln_skill_03_range_01'), '阿斯卡纶 S3\'s range');
    assert.deepEqual(w.trail[3], ['wisdel_skill_03_trail'], 'S3\'s own projectile');
    assert.ok(Object.values(modes).filter((e) => e.trail[0].length).length >= 14, 'the ranged operators of the extracted 25 at least');
  });

  test('modes.json for the effect layer matches the committed bindings (when the effects are extracted)', { skip: !extracted && 'no extracted effects' }, () => {
    const fx = JSON.parse(readFileSync(path.join(FX, 'modes.json'), 'utf8'));
    const modes = loadCharModes(ROOT);
    for (const [id, e] of Object.entries(modes)) assert.deepEqual(fx[id]?.cast, e.cast, id);
    const index = JSON.parse(readFileSync(path.join(FX, 'index.json'), 'utf8')).bundles;
    // every operator with extracted effects: the skill modes cast extracted prefabs (25 at the time of writing)
    let withCast = 0;
    for (const [id, e] of Object.entries(fx)) {
      const pre = index[id.replace(/^char_\d+_/, '')];
      if (!pre) continue;
      for (let n = 1; n < e.modes.length; n++) if (boundEffects(e, pre, n, 'cast').length) withCast++;
    }
    assert.ok(withCast >= 25, `skill modes with extracted cast effects: ${withCast}`);
  });
});

// local patch (user report 2026-10-07, 11 items): a skill activation's effects — the name mapping ∪ the skill's own (skills.ab),
// minus what the modes bind to an attack (67a2bdb4's `_range` rule played 수르트 S3's hit range on her) and the skill's target /
// end effects; the skill bindings and turned effects char_modes.py writes
describe('skill activation effects', () => {
  test('activationEffects: no mode-bound range on the caster, the skill\'s own cast / buff, its target and end effects elsewhere', () => {
    const pre = ['x_skill_03_buff', 'x_skill_03_range', 'x_skill_03_start_01', 'x_skill_03_start_02', 'x_skill_03_end', 'x_skill_03_hit_1', 'x_skill_01_range', 'x_skill_01_start'];
    const bind = { modes: ['Default', 'S3'], cast: [[], ['x_skill_03_start_01']], hit: [[], ['x_skill_03_range']], trail: [[], []], attach: [[], []],
      skills: [{ cast: ['x_skill_01_start'], castLoop: ['x_skill_01_range'], buff: [], target: [], targetBuff: [] }, {},
        { cast: [], castLoop: ['x_skill_03_start_02'], buff: [], target: [], targetBuff: ['x_skill_03_hit_1'], end: { cast: ['x_skill_03_end'], hit: [] } }] };
    assert.deepEqual(activationEffects(bind, pre, 2), { start: ['x_skill_03_start_02'], loops: ['x_skill_03_buff'] });
    assert.deepEqual(activationEffects(bind, pre, 0), { start: ['x_skill_01_start', 'x_skill_01_range'], loops: [] }, 'its cast range once, not as a loop');
    assert.deepEqual(activationEffects(null, pre, 2).loops, ['x_skill_03_buff', 'x_skill_03_range'], 'unbound: the name rule as before');
    assert.deepEqual(activationEffects(bind, pre, 2, new Set(['x_skill_03_buff'])).loops, [], 'a kit-owned prefab');
  });

  test('the reported skills with the extracted bindings', { skip: !extracted && 'no extracted effects' }, () => {
    const fx = JSON.parse(readFileSync(path.join(FX, 'modes.json'), 'utf8'));
    const index = JSON.parse(readFileSync(path.join(FX, 'index.json'), 'utf8')).bundles;
    const act = (id, i, own) => activationEffects(fx[id], index[id.replace(/^char_\d+_/, '')], i, own);
    const surtr = act('char_350_surtr', 2);
    assert.ok(!surtr.loops.includes('surtr_skill_03_range') && surtr.loops.includes('surtr_skill_03_buff'), '수르트 S3: the range is her attacks\' hit');
    const mly = act('char_4064_mlynar', 2);
    assert.ok(!mly.loops.includes('mlynar_skill_03_range_01') && mly.loops.includes('mlynar_skill_03_buff_03'), '무에나 S3: range_01 is each attack\'s cast; buff_03 its loop');
    const tex = act('char_102_texas', 1);
    assert.deepEqual(tex.start, ['texas_skill_01_start', 'texas_skill_01_range'], '텍사스 S2 (its files are named _skill_01_)');
    assert.deepEqual(fx.char_102_texas.skills[1].target, ['texas_skill_01_hit'], 'the falling sword on each target');
    assert.deepEqual(act('char_4116_blkkgt', 2).start, ['blkkgt_skill_03_start_01', 'blkkgt_skill_03_start_02'], '데겐블레허 S3: the finisher pieces wait for its end');
    assert.deepEqual(fx.char_4116_blkkgt.skills[2].end, { cast: ['blkkgt_skill_03_end', 'blkkgt_skill_03_start_03', 'blkkgt_skill_03_start_04'], hit: ['blkkgt_skill_03_hit_2'] });
    assert.ok(!act('char_2026_yu', 2, new Set(['yu_skill3_range_01'])).loops.includes('yu_skill3_range_01'), '余 S3: the wall is drawn by its kit event');
    assert.ok(!act('char_4193_lemuen', 2).loops.includes('lemuen_skill_03_crosshair_range'), '르무엔 S3: the aim\'s trail');
    assert.ok(fx.char_496_wildmn.turn.includes('wildmn_skill_02_start'), '野鬃 S2\'s thrust turns to her facing');
  });
});

// local patch (user report 2026-10-07, official videos): LineRenderer beams (蕾缪安 S3 aim) and order-0 domes in front (蛇屠箱 S2)
test('fxplayer: a LineRenderer draws its strip until the effect stops; a tall order-0 mesh splits to the front, a flat one behind', async () => {
  const THREE = await import('../public/vendor/three.module.js');
  const fxp = await import('../public/js/render/fxplayer.js');
  const mat = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const line = { pts: [[0, 4.31, 0], [0, 0, 0]], world: false, loop: false, width: 0.2, widthCurve: [[0, 1, 0, 0]],
    grad: { c: [[0, 1, 1, 1], [1, 1, 1, 1]], a: [[0, 1], [1, 1]], mode: 0 }, align: 0, texMode: 0, mat: 'm', order: 2 };
  const def = { name: 'beam', duration: 0.4, nodes: [node('beam', -1), node('Line', 0, { lineR: line })], materials: { m: mat }, clips: [], geoms: {}, lib: null };
  const inst = new fxp.FxInstance(def, { quality: 'high' });
  assert.equal(inst.lines.length, 1);
  inst.update(1);
  assert.ok(inst.lines[0].batch.geometry.drawRange.count > 0, 'drawn');
  assert.equal(inst.done, false, 'a line stays after its clip / particles (Unity keeps the object)');
  inst.stop();
  assert.equal(inst.done, true);
  inst.dispose();
  // domes: a mesh standing 1 tile high vs a flat decal, both sortingOrder 0
  const box = (h) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, -h], 3)); g.setIndex([0, 1, 2]); return g; };
  const def2 = { name: 'dome', duration: 1, nodes: [node('dome', -1), node('hudun', 0, { mesh: { mesh: 'tall', mat: 'm', order: 0 } }), node('decal', 0, { mesh: { mesh: 'flat', mat: 'm', order: 0 } })],
    materials: { m: mat }, clips: [], geoms: { tall: box(1), flat: box(0) }, lib: null };
  const i2 = new fxp.FxInstance(def2, { quality: 'high', split: true });
  const layerOf = (k) => i2.nodes[k].children.find((c) => c.isMesh).layers.mask;
  assert.equal(layerOf(1), 1 << fxp.FX_FRONT, 'the dome covers the unit');
  assert.equal(layerOf(2), 1 << fxp.FX_BACK, 'a ground decal stays under it');
  i2.dispose();
});

// local patch (user report 4 #4-3, user's decision 2026-10-08 「A만」): a prefab's nested sub-prefabs have their own Animator
// clips — every clip plays, each held on its own last frame; the effect's clip time is the longest (缄默德克萨斯 S2's
// texas2_birth_02_start: the root + 4 slashes, the slashes stood frozen on clips[0] alone)
test('fxplayer: every clip of a prefab plays, each to its own length; the effect lasts the longest', async () => {
  const fxp = await import('../public/js/render/fxplayer.js');
  const node = (name, parent) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] });
  const lin = (t1, v0, v1) => [[0, 0, 0, (v1 - v0) / t1, v0], [t1, 0, 0, 0, v1]];
  const zTrack = (n, t1, v0, v1) => ({ node: n, prop: 'pos', type: 4, curves: [[[0, 0, 0, 0, 0]], [[0, 0, 0, 0, 0]], lin(t1, v0, v1)] });
  const def = { name: 'two', duration: 2, nodes: [node('two', -1), node('root', 0), node('slash', 0)], materials: {},
    clips: [{ name: 'root', len: 2, tracks: [zTrack(1, 2, 0, 4)] }, { name: 'slash', len: 0.5, tracks: [zTrack(2, 0.5, 0, 1)] }], geoms: {}, lib: null };
  const inst = new fxp.FxInstance(def, { quality: 'high', atSpawn: false });
  assert.equal(inst.clipTracks.length, 2, 'both clips are bound');
  assert.equal(inst.clipLen, 2);
  inst.update(0.25);
  assert.ok(Math.abs(inst.nodes[1].position.z - 0.5) < 1e-6, 'the first clip runs');
  assert.ok(Math.abs(inst.nodes[2].position.z - 0.5) < 1e-6, 'the second clip runs too');
  inst.update(0.75);
  assert.ok(Math.abs(inst.nodes[2].position.z - 1) < 1e-6, 'a shorter clip holds its last frame');
  assert.ok(!inst.done, 'until the longest clip ends');
  inst.update(1.1);
  assert.ok(inst.done);
  inst.dispose();
});

// local patch (m_IsActive, user's decision 2026-10-08 「공식과 동일하게」): a clip switching a node off hides its meshes and
// clears / stops its particle systems; switched on again a system plays from its start (Unity's playOnAwake)
test('fxplayer: a clip\'s m_IsActive track switches its node\'s meshes and particle systems off and on', async () => {
  const fxp = await import('../public/js/render/fxplayer.js');
  const mat = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const c = (v) => ({ m: 0, s: v });
  const ps = { dur: 1, loop: true, delay: c(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: c(5), speed: c(0),
    color: { m: 0, a: [1, 1, 1, 1] }, size: c(0.1), rot: c(0), max: 100, gravity: c(0), flipRot: 0, rate: c(20), bursts: [], mods: {},
    shape: { type: 5, radius: 1, angle: 0, arc: 360, thick: 1, length: 1, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [1, 1, 1], box: [0, 0, 0] },
    render: { mode: 0, mat: 'm', mesh: null, align: 0, pivot: [0, 0, 0], order: 0 } };
  // on 0–0.2 s, off 0.2–0.6 s, on again after
  const step = [[0, 0, 0, 0, 1], [0.2, 0, 0, 0, 0], [0.6, 0, 0, 0, 1]];
  const def = { name: 'sw', duration: 1, nodes: [node('sw', -1), node('blade', 0), node('sparks', 1, { ps })], materials: { m: mat },
    clips: [{ name: 'sw', len: 1, tracks: [{ node: 1, prop: 'attr:2086281974', type: 1, curves: [step] }] }], geoms: {}, lib: { texture: () => null } };
  const inst = new fxp.FxInstance(def, { quality: 'high', atSpawn: false });
  const sys = inst.systems[0];
  inst.update(0.1);
  assert.ok(inst.nodes[1].visible && sys.n > 0, 'on: drawn and emitting');
  inst.update(0.2);
  assert.equal(inst.nodes[1].visible, false, 'off at 0.2 s');
  assert.equal(sys.n, 0, 'its particles cleared');
  inst.update(0.2);
  assert.equal(sys.n, 0, 'and none emitted while off');
  inst.update(0.2);
  assert.ok(inst.nodes[1].visible && sys.n > 0, 'on again: emitting from its start');
  inst.dispose();
});

// local patch (user 2026-10-08 「일단 꺼봐」): a node inactive from the start with no m_IsActive track never emits (Unity: an
// inactive GameObject's system does not play) — 아르케토 S3's stray smoke in archet_skill_03_start
test('fxplayer: a particle system under a node inactive from the start never emits', async () => {
  const fxp = await import('../public/js/render/fxplayer.js');
  const c = (v) => ({ m: 0, s: v });
  const ps = { dur: 1, loop: true, delay: c(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: c(5), speed: c(0),
    color: { m: 0, a: [1, 1, 1, 1] }, size: c(0.1), rot: c(0), max: 100, gravity: c(0), flipRot: 0, rate: c(20), bursts: [{ t: 0, n: c(10) }], mods: {},
    shape: { type: 5, radius: 1, angle: 0, arc: 360, thick: 1, length: 1, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [1, 1, 1], box: [0, 0, 0] },
    render: { mode: 0, mat: 'm', mesh: null, align: 0, pivot: [0, 0, 0], order: 0 } };
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const def = { name: 'off', duration: 1, nodes: [node('off', -1), node('on', 0, { ps }), node('smoke', 0, { active: false, ps }), node('under', 2, { ps })],
    materials: { m: { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} } }, clips: [], geoms: {}, lib: { texture: () => null } };
  const inst = new fxp.FxInstance(def, { quality: 'high', atSpawn: false });
  inst.update(0.5);
  const [on, smoke, under] = inst.systems;
  assert.ok(on.n > 0, 'an active node emits');
  assert.equal(smoke.n, 0, 'an inactive node does not');
  assert.equal(under.n, 0, 'nor anything under it');
  inst.dispose();
});
