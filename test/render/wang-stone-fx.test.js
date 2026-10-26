// test/render/wang-stone-fx.test.js — 望's stone effects, maintainer re-report 2026-10-08 (docs/rules/fx.md 「관리자 제보 (2026-10-07 밤)」):
// the activation wisps flashed once (dropped after their clip; the stones linked in the prep never showed them —
// their 'wangLink' sat in the pre-entry buffer, which dropped fx), the birth cross sat on the ball, off its tile,
// the blast drew more than the client plays (token_wang_skill_03_hit_03 2 tiles off, the hit effects at the stone).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stoneBlastFx, inStoneBlast, linkRun } from '../../public/js/render/fxgame.js';
import { keepEarly } from '../../public/js/screens/game/early.js';
import { keepsState } from '../../public/js/battle/runner.js';
import { isCosmeticEvent } from '../../public/js/render/interp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const prefab = (bundle, name) => JSON.parse(readFileSync(path.join(FX, bundle, `${name}.json`), 'utf8'));
const haveFx = existsSync(path.join(FX, 'wang_token', 'token_wang_01_buff.json')) && existsSync(path.join(FX, 'wang', 'wang_passive_01_buff_02.json'));

test('a stone blast plays the client\'s cast effect at the stone and its hit effect on the enemies only', () => {
  assert.deepEqual(stoneBlastFx(1), { at: ['token_wang_skill_01_hit'], target: null });
  assert.deepEqual(stoneBlastFx(2), { at: ['token_wang_skill_02_hit'], target: 'token_wang_skill_02_hit_02' });
  assert.deepEqual(stoneBlastFx(2, true), { at: ['token_wang_skill_02_hit'], target: 'token_wang_skill_02_hit_02' });
  assert.deepEqual(stoneBlastFx(3), { at: ['token_wang_skill_03_hit'], target: null });
  assert.deepEqual(stoneBlastFx(3, true), { at: ['token_wang_skill_03_hit'], target: 'token_wang_skill_03_hit_02' });
  for (const s of [1, 2, 3]) for (const f of [false, true]) {
    const fx = stoneBlastFx(s, f);
    assert.ok(![...fx.at, fx.target].includes('token_wang_skill_03_hit_03'), 'the unreferenced offset copy is never played');
  }
  // the hit effects go through the 'dmg' of the same moment (stoneHit before pendingHit)
  assert.match(SRC, /if \(stoneHit\(tid, views\)\) return;[^\n]*\n\s+if \(pendingHit\(tid, views, by\)\) return;/);
});

test('the blast areas match the kit (op-wang.js trigger): own tile, S2 link lines ±3, S3 x-1 diamond', () => {
  const tiles = (skill, axes) => {
    const out = [];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (inStoneBlast(skill, axes, dx, dy)) out.push([dx, dy]);
    return out;
  };
  assert.deepEqual(tiles(1), [[0, 0]]);
  assert.equal(tiles(3).length, 13);
  assert.ok(tiles(3).every(([x, y]) => Math.abs(x) + Math.abs(y) <= 2));
  assert.deepEqual(tiles(2, ['h']).map(([x, y]) => `${x},${y}`).sort(), ['-1,0', '-2,0', '-3,0', '0,0', '1,0', '2,0', '3,0']);
  assert.deepEqual(tiles(2, ['v']).map(([x, y]) => `${x},${y}`).sort(), ['0,-1', '0,-2', '0,-3', '0,0', '0,1', '0,2', '0,3']);
  assert.equal(tiles(2, ['h', 'v']).length, 13);
  // an enemy a little off the tile centre (walking) still counts by its tile
  assert.ok(inStoneBlast(3, null, 1.4, 0.6));
  assert.ok(!inStoneBlast(3, null, 2.4, 0.6));
});

test('the pre-entry buffer keeps a stone\'s wangLink (the prep-linked stones activate before the view enters)', () => {
  assert.ok(keepEarly(['fx', 'wangLink', 5, 10, { id: 7, axes: ['v'], first: true }]));
  assert.ok(!keepEarly(['fx', 'zone', 5, 10, { token: 'token_10064_wang_stone1' }]), 'a blast is cosmetic: not replayed');
  assert.ok(!keepEarly(['fx', 'summon', 5, 10, { id: 7 }]));
  assert.ok(keepEarly(['spawn', { id: 7 }]));
});

test('a hidden tab, a catch-up frame and a stall keep a stone\'s wangLink too (shared/protocol.js stateFx, 2026-10-22)', () => {
  const link = ['fx', 'wangLink', 5, 10, { id: 7, axes: ['h'], first: true }];
  assert.ok(keepsState(link), 'runner catch-up / hidden-tab backlog');
  assert.ok(!isCosmeticEvent(link), 'never dropped as stale, never shed');
  assert.ok(isCosmeticEvent(['fx', 'zone', 5, 10, { token: 'token_10064_wang_stone1' }]), 'a blast stays cosmetic');
  assert.ok(!keepsState(['fx', 'summon', 5, 10, { id: 7 }]));
});

test('the link line runs from end to end of the stones\' unbroken run through the linked stone (client _PlayTriggeredLineEffect)', () => {
  const tiles = new Set(['2,3', '3,3', '4,3', '6,3', '3,4', '3,5']);
  assert.deepEqual(linkRun(tiles, 3, 3, 'h'), ['2,3', '4,3'], 'the run stops at the gap (6,3 is not on it)');
  assert.deepEqual(linkRun(tiles, 4, 3, 'h'), ['2,3', '4,3'], 'the same run from its end');
  assert.deepEqual(linkRun(tiles, 3, 3, 'v'), ['3,3', '3,5']);
  assert.equal(linkRun(tiles, 6, 3, 'h'), null, 'a stone alone on its row: no line');
  assert.equal(linkRun(tiles, 2, 3, 'v'), null);
  // the line is the prefab's world-space LineRenderers put on the run's two ends (FxInstance.setLine), once per run and
  // moment (the born stone and its neighbours all say 'wangLink'), for each link direction new to the stone
  assert.match(SRC, /inst\.setLine\(a, b\);/);
  assert.match(SRC, /if \(linkRuns\.get\(key\) === clockS\) continue;/);
  assert.match(SRC, /if \(e\[1\] === 'wangLink'\) \{\s+linkLines\(o, views\);/);
  assert.ok(!/playAt\(\['token_wang_passive_01_line'\]/.test(SRC), 'no longer played at its authored world points');
  // a 跟子 still in its throw: the line waits for it to land (the client's line comes with the stone's birth)
  assert.match(SRC, /throwLand\.set\(v\.id, t0 \+ THROW_S\);/);
  assert.match(SRC, /if \(wait > 0\) castsDelayed\.push\(\{ t: clockS \+ wait, run: \(\) => playLine\(linkEnd\(a0\), linkEnd\(b0\)\) \}\);/);
});

test('the activation effect is kept on the stone\'s ball until its die', () => {
  // activation (STONE_ON): bound to the stone view and kept (playAt keep) until its 'die'
  // (a 跟子's on its tile point, unlifted — 2026-10-17, below)
  assert.match(SRC, /const on = isStone\(sv\) \? \{ at: flat \? sv : ballOf\(sv\), owner: o\.id, keep: true \} : \{ at: flat \? at : onBall \};/);
  assert.match(SRC, /if \(l\.inst\.done && !\(l\.keep && !l\.inst\.stopping\)( && [^{]+)?\) \{ dropLive\(l\); live\.splice\(i, 1\); \}/);
  // the 3-second replay of the 跟子's rings (a2bd93de, an assumption) is gone
  assert.doesNotMatch(SRC, /FOLLOWER_CYCLE|l\.cycle/);
});

test('the birth effects (the gold cross, the 跟子\'s rings) play on the stone\'s ground, not on its ball', () => {
  // births (STONE_BORN): the view itself (its ground), never the ball anchor
  assert.match(SRC, /playAt\(\[STONE_BORN\.follower\], v, \{ owner: o\.id, under: true, bundle: FOLLOWER_FX \}\)/);
  assert.match(SRC, /playAt\(\[STONE_BORN\.stone\], v, \{ owner: o\.id, under: true \}\)/);
  assert.match(SRC, /playAt\(\[STONE_BORN\.stone\], v, \{ owner: id, under: true \}\)/);
  assert.doesNotMatch(SRC, /STONE_BORN\.[a-z]+\], ballOf/);
});

test('a 跟子\'s throw start effect plays on its tile, not on 望, and ends as it lands (maintainer report 2026-10-16)', () => {
  // CastOnTileAbility.OnCastStart: CreateEffect(_startEffect, cast tile, owner); _finishStartEffectsOnCastOnTile after _preDelay
  // (maintainer decision 2026-10-17) the 跟子 is its effects' stone: the tile effect comes as the throw lands (THROW_S)
  assert.match(SRC, /if \(o\.follower\) \{\n\s+v\.drawnByFx\?\.\(stonesOn\);\n\s+throwStart\(v\);\n\s+castsDelayed\.push\(\{ t: clockS \+ THROW_S, run: \(\) => playAt\(\[STONE_BORN\.follower\][^\n]*\n\s+\} else playAt\(\[STONE_BORN\.stone\]/);
  assert.match(SRC, /spawn\(FOLLOWER_FX, 'wang_passive_01_start', \{ x: v\.x, y: v\.y, z: v\.z \|\| 0 \}/);
  assert.match(SRC, /l\.until = Math\.max\(clockS, t0 \+ THROW_S\);/);
  assert.doesNotMatch(SRC, /views\.get\(o\.src\) : null;\n[^\n]*wang_passive_01_start/);
  if (existsSync(path.join(FX, 'wang', 'wang_passive_01_start.json'))) {
    const start = prefab('wang', 'wang_passive_01_start'), rest = prefab('wang', 'wang_passive_01_buff');
    assert.ok(start.finish > 0);
    // the stones are built-in Quads: the falling `qizi` turns off by 0.2333 s (< THROW_S), the resting `qizi (1)` stays
    const qi = start.nodes.findIndex((n) => n.name === 'qizi');
    assert.ok(qi >= 0 && start.nodes[qi].mesh, 'falling stone mesh');
    const off = start.clips[0].tracks.find((t) => t.node === qi && t.prop.startsWith('attr:'));
    assert.ok(off && off.curves[0].at(-1)[0] <= 0.25 && off.curves[0].at(-1)[4] === 0, 'hidden as it lands');
    assert.ok(rest.nodes.find((n) => n.name === 'qizi (1)')?.mesh, 'resting stone mesh');
  }
});

test('the ball effects sit on the drawn ball anywhere on screen (maintainer report 2026-10-16: slid off toward the edges)', async () => {
  const { presetCamera } = await import('../../public/js/render/projection.js');
  const { liftedPoint } = await import('../../public/js/render/fxpoints.js');
  const cam = presetCamera('normal', { width: 1280, height: 720 });
  const tmp = { x: 0, y: 0, s: 0, depth: 0 }, P = { x: 0, y: 0, s: 0, depth: 0 }, Q = { x: 0, y: 0, s: 0, depth: 0 };
  let worst = 0;
  for (const x of [0, 4, 8, 12, 16, 20]) for (const y of [1, 5, 9, 13, 17]) {
    const r = cam.project(x, y, 0, { x: 0, y: 0, s: 0, depth: 0 });
    if (r.x < 0 || r.x > 1280 || r.y < 0 || r.y > 720) continue;   // on screen only
    // the old anchor (z lifted, column kept) drifts sideways off centre …
    const dz = cam.liftFor(x, y, 0, 0.18 * r.s);
    worst = Math.max(worst, Math.abs(cam.project(x, y, dz, tmp).x - r.x) / r.s);
    // … the new one (ballAt = liftedPoint) projects straight above the root, 0.18 tile up
    const b = liftedPoint(cam, x, y, 0, r.y, r.x, r.y - 0.18 * r.s, { x: 0, y: 0, z: 0 }, Q);
    const s = cam.project(b.x, b.y, b.z, P);
    assert.ok(Math.abs(s.x - r.x) < 0.01 && Math.abs(r.y - s.y - 0.18 * r.s) < 0.01, `(${x}, ${y})`);
  }
  assert.ok(worst > 0.05, `the drift this fixes (${worst.toFixed(3)} tile at the edge)`);
  assert.match(SRC, /return liftedPoint\(camRef, x, y, z0, r\.y, r\.x, r\.y - STONE_BALL \* r\.s, out, BALL_Q\);/);
  assert.match(SRC, /const onBall = ballAt\(at\.x, at\.y, 0\);/);
  // (2026-10-17) a 跟子's ball is its effects' quad on the tile point: its link line and activation stay there, unlifted
  // (2026-10-26: the link line's ends are every stone's ground point, as the client's `worldPosition` — linkEnd)
  assert.match(SRC, /const flat = !!o\.follower && stonesOn\(\);/);
  assert.match(SRC, /return \{ x: Number\(v\.x\), y: Number\(v\.y\), z: \(Number\(v\.z\) \|\| 0\) \+ \(Number\(v\.hover\) \|\| 0\) \};/);
  assert.match(SRC, /\{ at: flat \? sv : ballOf\(sv\), owner: o\.id, keep: true \}/);
  assert.doesNotMatch(SRC, /ballZ\(/);
});

test('a stone gets no procedural skill burst (its passive \'skill\' on precedes the return \'deploy\')', () => {
  // the sim's order for a used stone coming back (same id, ~2 s after its 'die' in S3): ['skill', id, 1] → ['deploy', id];
  // the dying view (fade ≤ 2.15 s) was still there and render/app.js drew fx.skill's gold pillar + hex on it
  assert.match(SRC, /ownsSkill\(v\) \{[\s\S]*?if \(isStone\(v\)\) return stonesOn\(\);[\s\S]*?\n    \},/);
  const APP = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
  assert.match(APP, /fx\.skill\(v, !!e\[2\], \{ burst: !fxGame\.ownsSkill\(v\) \}\)/);
});

test('any redeployed unit: a skill start on its still-dying view waits for its \'deploy\' (no gold pillar on the falling one)', () => {
  // the same order holds for every unit with a passive on deployment (not only 望's stones, which have official effects)
  const APP = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
  const skill = APP.slice(APP.indexOf("case 'skill': {"), APP.indexOf("case 'die': {"));
  assert.match(skill, /if \(v\.alive === false\) \{ v\._skillAtDeploy = e\[2\] \? e : null; if \(e\[2\]\) break; \}\n\s+skillEvent\(v, e\);/);
  const deploy = APP.slice(APP.indexOf("case 'deploy': {"), APP.indexOf("case 'swing': {"));
  assert.ok(deploy.indexOf('v.onDeploy?.(') < deploy.indexOf('skillEvent(v, s)'), 'started after the view is revived');
  assert.match(deploy, /if \(v\?\._skillAtDeploy\) \{ const s = v\._skillAtDeploy; v\._skillAtDeploy = null; skillEvent\(v, s\); \}/);
});

test('the extracted activation prefabs: wisps that dissolve in and stay (skipped without public/assets)', { skip: !haveFx && 'no extracted fx' }, () => {
  // the activation wisps (`line` meshes) dissolve IN (_Amount 1 → ~0) and stay: nothing ends them but the effect
  for (const [b, n] of [['wang_token', 'token_wang_01_buff'], ['wang', 'wang_passive_01_buff_02']]) {
    const d = prefab(b, n);
    const amount = d.clips[0].tracks.filter((t) => t.prop === 'mat:_Amount');
    assert.ok(amount.length >= 4, n);
    for (const t of amount) {
      const keys = t.curves[0].filter((k) => k[0] > -1e30);
      assert.equal(keys[0][4], 1, `${n} starts dissolved`);
      assert.ok(keys[keys.length - 1][4] < 0.05, `${n} ends shown`);
    }
    assert.ok(d.nodes.some((x) => x.mesh && x.active !== false && /^line/.test(x.name)), `${n} has its wisp meshes`);
  }
  // a placed stone's birth effect has the wisps but off: they come with its activation only
  const birth0 = prefab('wang_token', 'token_wang_birth_01_buff');
  assert.ok(birth0.nodes.filter((x) => x.name === 'line' || x.name === 'line1').every((x) => x.active === false));
});

test('the extracted birth cross: flat 1-tile looping quads at the root (skipped without public/assets)', { skip: !haveFx && 'no extracted fx' }, () => {
  const birth = prefab('wang_token', 'token_wang_birth_01_buff');
  // its looping cross: flat 1-tile quads at the root's ground (no height of their own)
  const sz = birth.nodes.filter((x) => x.ps && /^sz/.test(x.name));
  assert.ok(sz.length && sz.every((x) => x.ps.loop && x.ps.render.align === 2 && x.ps.size.s === 1 && x.pos.every((c) => c === 0)));
});

test('the extracted token_wang_skill_03_hit_03 is the S3 blast again, 2 tiles off (skipped without it)', { skip: !existsSync(path.join(FX, 'wang_token', 'token_wang_skill_03_hit_03.json')) && 'no extracted fx' }, () => {
  // token_wang_skill_03_hit_03: every system 2 tiles off the root along its rotation_z — the S3 blast again, beside it
  const h3 = prefab('wang_token', 'token_wang_skill_03_hit_03');
  const sys = h3.nodes.filter((x) => x.ps);
  assert.ok(sys.length > 10 && sys.every((x) => x.pos[0] === 2), 'offset copy');
});

test('a BoxShell / BoxEdge emitter spreads over its scale once, like a Box (fxplayer.js shapeSample)', async () => {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const mm = (s) => ({ m: 0, s });
  const sys = (type) => ({
    dur: 1, loop: false, delay: mm(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: mm(1), speed: mm(0),
    color: { m: 0, a: [1, 1, 1, 1] }, size: mm(0.1), rot: mm(0), max: 1000, gravity: mm(0), flipRot: 0, rate: mm(0),
    bursts: [{ t: 0, n: mm(300) }], mods: {},
    // 望 S3 token_wang_skill_03_hit lizi_l: BoxShell scale (2, 3, 0)
    shape: { type, radius: 1, angle: 0, arc: 360, thick: 1, length: 1, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [2, 3, 0], box: [0, 0, 0] },
    render: { mode: 0, mat: 'm', mesh: null, align: 0, pivot: [0, 0, 0], order: 0 },
  });
  const node = (name, parent, ps) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...(ps ? { ps } : {}) });
  const def = {
    name: 'box', duration: 1, nodes: [node('root', -1), node('box', 0, sys(5)), node('shell', 0, sys(15)), node('edge', 0, sys(16))],
    materials: { m: { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} } }, clips: [], geoms: {}, lib: { texture: () => null },
  };
  const inst = new fxp.FxInstance(def, { quality: 'high' });
  inst.update(1 / 30);
  for (const s of inst.systems) {
    let mx = 0, my = 0;
    for (let i = 0; i < s.n; i++) { mx = Math.max(mx, Math.abs(s.pos[i * 3])); my = Math.max(my, Math.abs(s.pos[i * 3 + 1])); }
    assert.ok(s.n > 100, s.node.name);
    assert.ok(mx <= 1 + 1e-6 && my <= 1.5 + 1e-6, `${s.node.name}: ±${mx.toFixed(2)} × ±${my.toFixed(2)} (the scale 2 × 3 once)`);
    assert.ok(mx > 0.8 && my > 1.2, `${s.node.name} fills its box`);
  }
});

test('a BoxShell emits on the box\'s faces, a BoxEdge on its edges (a flat box: the rectangle, its outline — 2026-10-22)', async () => {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const mm = (s) => ({ m: 0, s });
  const sys = (type, scale, box = [0, 0, 0]) => ({
    dur: 1, loop: false, delay: mm(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: mm(1), speed: mm(0),
    color: { m: 0, a: [1, 1, 1, 1] }, size: mm(0.1), rot: mm(0), max: 1000, gravity: mm(0), flipRot: 0, rate: mm(0),
    bursts: [{ t: 0, n: mm(400) }], mods: {},
    shape: { type, radius: 1, angle: 0, arc: 360, thick: 1, length: 1, pos: [0, 0, 0], rotE: [0, 0, 0], scale, box },
    render: { mode: 0, mat: 'm', mesh: null, align: 0, pivot: [0, 0, 0], order: 0 },
  });
  const node = (name, parent, ps) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...(ps ? { ps } : {}) });
  const def = {
    name: 'box', duration: 1, materials: { m: { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} } }, clips: [], geoms: {}, lib: { texture: () => null },
    nodes: [node('root', -1), node('edge', 0, sys(16, [2, 3, 0])), node('cube', 0, sys(15, [2, 2, 2])), node('thick', 0, sys(15, [2, 2, 2], [0.5, 0.5, 0.5]))],
  };
  const inst = new fxp.FxInstance(def, { quality: 'high' });
  inst.update(1 / 30);
  const pts = (s) => Array.from({ length: s.n }, (_, i) => [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]]);
  const [edge, cube, thick] = inst.systems;
  const onRim = ([x, y]) => Math.abs(Math.abs(x) - 1) < 1e-6 || Math.abs(Math.abs(y) - 1.5) < 1e-6;
  assert.ok(edge.n > 100 && pts(edge).every(onRim), 'the flat box\'s edges: its outline');
  const nx = pts(edge).filter(([x]) => Math.abs(Math.abs(x) - 1) < 1e-6).length;
  assert.ok(nx > 0.5 * edge.n && nx < 0.7 * edge.n, `by length: the 3-long sides take 3/5 (${nx}/${edge.n} on x = ±1)`);
  const onFace = (p) => p.some((v) => Math.abs(Math.abs(v) - 1) < 1e-6);
  assert.ok(pts(cube).every(onFace), 'a shell: on a face');
  const depth = (p) => 1 - Math.max(...p.map(Math.abs));
  assert.ok(pts(thick).every((p) => depth(p) <= 0.5 + 1e-6) && pts(thick).some((p) => depth(p) > 0.3), 'boxThickness 0.5: the outer half of the half size');
});
