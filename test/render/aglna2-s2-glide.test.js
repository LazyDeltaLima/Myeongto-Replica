// test/render/aglna2-s2-glide.test.js — user report 2026-10-12: 予愿安洁莉娜 S2 重力自定义 took off on the spot and attacked;
// officially her model glides forward on her staff to the end of the sweep, takes off upward the moment it gets there,
// and is back on her tile as her attacks begin — lower than the flyers' height (follow-up the same day). The client carries the model on projectile_chr_aglna2_s2_fly (follower `_restoreOnEnd` 1) and plays the
// skill's ChantBeforeSkill clips Skill_2_Takeoff_Begin / _Loop / _End, then `_afterEndAnim` Skill_2_Begin; the sim keeps
// her tile and position (PRTS 备注). Real manifest entry, headless fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { UF_LIFTOFF } from '../../shared/local.js';
import { UF } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const AGL = 'char_1015_aglna2';
// 4 tiles at 6 tiles/s: the end clip as she arrives (2/3 s), home as it ends (fx/kinds.js aglGlideBack)
const CHANT = { begin: 'Skill_2_Takeoff_Begin', loop: 'Skill_2_Takeoff_Loop', end: 'Skill_2_Takeoff_End', endAt: 4 / 6, total: 4 / 6 + 1, after: 'Skill_2_Begin' };

let fake, SpineActor, UnitView, FLY_HOVER;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ UnitView, FLY_HOVER } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

function actor() {
  const entry = assets.chars[AGL].spine.front;
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setSkillIndex(1);
  a.log = [];
  const st = a.spine.state;
  const set = st.setAnimation, add = st.addAnimation;
  st.setAnimation = (i, name, loop) => { a.log.push(['set', name, !!loop]); return set(i, name, loop); };
  st.addAnimation = (i, name, loop) => { a.log.push(['queue', name, !!loop]); return add(i, name, loop); };
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('her model has the 吟唱 clips', () => {
  const d = assets.chars[AGL].spine.front.animations;
  assert.deepEqual([d.Skill_2_Takeoff_Begin, d.Skill_2_Takeoff_Loop, d.Skill_2_Takeoff_End, d.Skill_2_Begin], [0.333, 0.5, 1, 1]);
});

test('SpineActor.chant: Takeoff_Begin → Takeoff_Loop, Takeoff_End on arrival, then Skill_2_Begin and the skill clips; no attack meanwhile', () => {
  const a = actor();
  a.setSkill(true);                 // the 'skill' event first: Skill_2_Begin …
  assert.equal(a.current, 'Skill_2_Begin');
  assert.ok(a.chant(CHANT));        // … the glide takes over
  a.setSkill(true);
  assert.equal(a.mode, 'chant');
  assert.equal(a.current, 'Skill_2_Takeoff_Begin');
  a.attack(0.9);
  assert.equal(a.mode, 'chant', 'an attack waits for the 吟唱');
  run(a, 0.6);
  assert.ok(!a.log.some(([, n]) => n === 'Skill_2_Takeoff_End'), 'no end clip before she arrives');
  run(a, 0.1);
  assert.equal(a.log.at(-1)[1], 'Skill_2_Takeoff_End', 'the end clip as she arrives');
  run(a, 0.9);
  assert.equal(a.mode, 'chant', 'the end clip plays out');
  run(a, 0.1);
  assert.equal(a.mode, 'skillBegin');
  const tail = a.log.slice(a.log.findIndex(([, n]) => n === 'Skill_2_Takeoff_End') + 1).map(([k, n]) => `${k} ${n}`);
  assert.deepEqual(tail.slice(0, 2), ['set Skill_2_Begin', 'queue Skill_2_Idle'], 'then the skill begins at home');
  run(a, 1.1);
  a.attack(0.9);
  assert.equal(a.current, 'Skill_2_Loop', 'and attacks on her S2 clip');
});

test('the skill ending inside the 吟唱 leaves it at once', () => {
  const a = actor();
  a.setSkill(true);
  a.chant(CHANT);
  run(a, 0.5);
  a.setSkill(false);
  assert.equal(a.mode, 'skillEnd');
  assert.equal(a.current, 'Skill_2_End');
});

test('UnitView.glide: the model goes out at the sweep speed, holds at the end for the take-off clip, is back on the sampled tile 1 s after arriving, then rises to her own 0.8 over 1 s', async () => {
  const cam = presetCamera('prep', { width: 1280, height: 720 });
  const st = {
    picture: () => null, image: async () => null,
    spineEntry: () => assets.chars[AGL].spine.front,
    spine: { acquire: async () => ({ animations: Object.keys(assets.chars[AGL].spine.front.animations).map((name) => ({ name })) }), release() {} },
  };
  const v = new UnitView(fakeViewCtx(fake.P, { assets: st, cam: () => cam }), { id: 1, side: 'ally', kind: 'chess', defId: AGL, x: 4, y: 10, maxHp: 1000 }, {});
  const step = (s, n = Math.round(s * 60)) => { for (let i = 0; i < n; i++) v.update(s / n, cam, 0); };
  const snap = { x: 4, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: UF_LIFTOFF, anim: 0 };   // airborne (起飞)
  v.sync(snap);
  v.glide(8, 10, { travel: 4 / 6, chant: 2.5 });
  step(1 / 3);
  assert.ok(Math.abs(v.x - 6) < 0.05, `halfway at 1/3 s: ${v.x}`);
  v.sync(snap);                    // a snapshot meanwhile: still her own tile
  assert.ok(Math.abs(v.x - 6) < 0.05, 'the sample does not pull the model back');
  step(1);
  assert.equal(v.x, 8, 'held at the end');
  assert.ok(v.hover < 1e-6, 'low while gliding');
  step(0.4);
  assert.deepEqual([v.x, v.y, v.glideS], [4, 10, null], 'back home at 4/6 + 1 s');
  step(0.5);
  const since = 1 / 3 + 1 + 0.4 + 0.5 - (4 / 6 + 1);   // game s since she got home
  assert.ok(Math.abs(v.hover - 0.8 * since) < 0.03, `rising linearly: ${v.hover} vs ${0.8 * since}`);
  step(0.6);
  assert.equal(v.hover, 0.8, 'her trait height_offset, not the flyers\' height');
  assert.ok(0.8 < FLY_HOVER);
});

// Follow-up (maintainer 2026-10-12 「켈시 이격도 이륙 높이가 인게임 데이터와 같은지」): the lift of an airborne (起飞) operator is the
// client's — 予愿安洁莉娜 0.8 (her trait height_offset), 凯尔希·思衡托 none (no height node in her data, her 起飞 is a block mode
// only), 蒂比 0.8 (her skills' attack@height_offset), anyone else the flyers' FLY_HOVER.
test('airborne lift: 予愿安洁莉娜 0.8, 凯尔希·思衡托 stays on her tile, 蒂比 0.8, a flyer FLY_HOVER', () => {
  const cam = presetCamera('prep', { width: 1280, height: 720 });
  const st = { picture: () => null, image: async () => null, spineEntry: () => null, spine: { acquire: async () => null, release() {} } };
  for (const [defId, want] of [[AGL, 0.8], ['char_1052_kalts2', 0], ['char_4191_tippi', 0.8]]) {
    const v = new UnitView(fakeViewCtx(fake.P, { assets: st, cam: () => cam }), { id: 1, side: 'ally', kind: 'chess', defId, x: 4, y: 10, maxHp: 1000 }, {});
    v.sync({ x: 4, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: UF_LIFTOFF, anim: 0 });
    for (let i = 0; i < 120; i++) v.update(1 / 60, cam, 0);
    assert.ok(Math.abs(v.hover - want) < 1e-3, `${defId}: ${v.hover} vs ${want}`);
  }
  const fly = new UnitView(fakeViewCtx(fake.P, { assets: st, cam: () => cam }), { id: 2, side: 'enemy', kind: 'enemy', defId: 'enemy_1005_yokai', x: 4, y: 10, maxHp: 100 }, {});
  fly.sync({ x: 4, y: 10, hp: 100, maxHp: 100, sp: 0, spMax: 0, flags: UF.FLYING, anim: 0 });
  for (let i = 0; i < 120; i++) fly.update(1 / 60, cam, 0);
  assert.ok(Math.abs(fly.hover - FLY_HOVER) < 1e-3, `a flyer: ${fly.hover}`);
});

// the effect records are the local client extract (git-ignored): without it only the fxgame.js half runs
const FX_DIR = path.join(ROOT, 'public/assets/local/fx/aglna2');
test('fly_range_01 stays on her tile, turned to the sweep; the trail follows the gliding model (maintainer report 2026-10-12)', { skip: !existsSync(path.join(FX_DIR, 'aglna2_skill_02_fly_range_01.json')) && 'local fx not extracted' }, async () => {
  const { faceTurn } = await import('../../public/js/render/fx/face.js');
  const fx = (n) => JSON.parse(readFileSync(path.join(FX_DIR, `${n}.json`), 'utf8'));
  const range = fx('aglna2_skill_02_fly_range_01'), trail = fx('aglna2_skill_02_fly_trail_rightAndLeft_01');
  // a ground streak (_spawnLocation 5, no FollowMountPoint) authored along its _mainDir RIGHT for the sweep's length
  assert.equal(range.spawn, 5);
  assert.equal(range.mount, undefined);
  assert.deepEqual([range.face.rot, range.face.dir], [2, 1]);
  assert.ok(Math.max(...range.nodes.map((n) => n.pos[0])) > 4, 'it reaches ~4 tiles ahead of where it is created');
  assert.ok(trail.mount, 'the trail rides its mount point');
  // FOUR_DIRECTION: up the board turns it 90°, left 180°
  assert.equal(faceTurn(range.face, { x: 0, y: 3 }).z, 90);
  assert.equal(faceTurn(range.face, { x: -4, y: 0 }).z, 180);
});

test('the dash spawns fly_range_01 at her tile, turned to the sweep, and the trail on the gliding model', () => {
  const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
  const dash = SRC.slice(SRC.indexOf("case 'dash': {"), SRC.indexOf("case 'dash': {") + 1600);
  assert.match(dash, /const at = \{ x: x \+ \(Number\(src\?\.modelDX\) \|\| 0\), y, z: Number\(src\?\.z\) \|\| 0 \};/);
  assert.match(dash, /spawn\(b\.bundle, range, at, \{ owner: o\.id, buff: true, until: clockS \+ fly \}, \{ dir: \{ x: dx, y: dy \} \}\)/);
  assert.match(dash, /if \(trail\) spawn\(b\.bundle, trail, src,/);
});

test('an effect on her without a FollowMountPoint (aglna2_skill_02_buff_01 at her feet) stays on her tile while the model glides', () => {
  const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
  const start = SRC.indexOf('const ex = (v) =>');
  assert.ok(start > 0);
  // the entity's place: the glide's sampled tile while the model is away, else the model's column
  const body = SRC.slice(start, SRC.indexOf('\n', SRC.indexOf('const ey = (v) =>')));
  const mx = (v) => Number(v.x) + (Number(v.modelDX) || 0);
  const { ex, ey } = new Function('mx', `${body}; return { ex, ey };`)(mx);
  const v = { x: 5.5, y: 9, modelDX: 0, glideS: { lx: 3, ly: 9 } };
  assert.deepEqual([ex(v), ey(v)], [3, 9]);
  v.glideS = null;
  assert.deepEqual([ex(v), ey(v)], [5.5, 9]);
  // every unit view (UnitView has `glideS`) gets the anchor, the ground / body / airborne branches all use it
  const lifted = SRC.slice(SRC.indexOf('function followed(v, def, buff) {'), SRC.indexOf('const ownerOf = (v) =>'));
  assert.match(lifted, /if \(!v \|\| !\(v\.modelDX \|\| 'glideS' in v\)\) return v;/);
  assert.equal((lifted.match(/get x\(\) \{ return ex\(v\); \}, get y\(\) \{ return ey\(v\); \}/g) || []).length, 3);
  assert.doesNotMatch(lifted.slice(lifted.indexOf('const frac = SPAWN_FRAC')), /return mx\(v\)/);
});
