// test/render/face-turn.test.js — an operator turns to its target as its attack starts and back when it has none
// (docs/rules/render.md 「공격 방향」): the client's `MapUtil.ParseDirection`, `CharacterAnimator.OnFaceChanged` (the mirror:
// ParseDirection(dir, 0), else the sign of x beyond 0.2) and `FaceSwitcher._TryUpdateDirection` (Back / Front: fourDir =
// ParseDirection(dir, 0.25)) — render/face-turn.js; a swing begun on the old model goes on after a Front ⇄ Back swap
// (render/spine.js swingElapsed); each change played as the client's turn (`FaceSwitcher._DoSwitchFaceInternal`: 0.15 s about
// the upright axis, the change edge-on half way — turnWidth, UnitView.turnTo / update). Headless fake PIXI for the actor.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDir, faceOf, turnFace, turnWidth, SWITCH_TIME } from '../../public/js/render/face-turn.js';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('parseDir: the largest dot product, LEFT / RIGHT with the addon on top; null for no vector', () => {
  assert.equal(parseDir(1, 0), 'RIGHT');
  assert.equal(parseDir(0, -2), 'DOWN');
  assert.equal(parseDir(-1, 0.9), 'LEFT');
  assert.equal(parseDir(0.8, 1), 'UP', 'more up than right');
  assert.equal(parseDir(0.8, 1, 0.25), 'RIGHT', 'the side gets +0.25: 0.62 + 0.25 > 0.78');
  assert.equal(parseDir(0.3, 1, 0.25), 'UP', '0.29 + 0.25 < 0.96');
  assert.equal(parseDir(0, 0), null);
});

test('deployed RIGHT: an enemy behind it mirrors it, one clearly above takes the Back model, one beside keeps it', () => {
  const f = faceOf('RIGHT');
  assert.deepEqual(f, { lr: 1, ud: 'DOWN', dir4: 'RIGHT' });
  assert.equal(turnFace(f, -0.6, 0.1), 1, 'behind it (an enemy that walked past its block): mirrored');
  assert.deepEqual(f, { lr: -1, ud: 'DOWN', dir4: 'LEFT' });
  assert.equal(turnFace(f, 0.1, 1), 2, 'right above: the Back model');
  assert.equal(f.ud, 'UP');
  assert.equal(f.lr, -1, '|x| 0.1 within the 0.2 tolerance: the mirror stays');
  assert.equal(turnFace(f, 1, 0.2), 1, 'beside it: mirrored back, the Back model kept (a LEFT / RIGHT fourDir leaves up / down)');
  assert.deepEqual(f, { lr: 1, ud: 'UP', dir4: 'RIGHT' });
  assert.equal(turnFace(f, 1, 0, true), 2, 'back to its deploy direction (idle): Front again');
  assert.deepEqual(f, { lr: 1, ud: 'DOWN', dir4: 'RIGHT' });
  assert.equal(turnFace(f, 1, 0), 0, 'already so: nothing changes');
});

test('deployed UP: the Back model; an attack on one below turns it Front, the idle turn back keeps the last mirror', () => {
  const f = faceOf('UP');
  assert.deepEqual(f, { lr: 1, ud: 'UP', dir4: 'UP' });
  assert.equal(turnFace(f, -0.1, -1), 2, 'below it: Front');
  assert.equal(f.ud, 'DOWN');
  assert.equal(turnFace(f, -1, 0), 1);
  assert.equal(f.lr, -1);
  assert.equal(turnFace(f, 0, 1, true), 2, 'idle: UP again');
  assert.deepEqual(f, { lr: -1, ud: 'UP', dir4: 'UP' }, 'x 0: the mirror it had stays (the client keeps lOrR)');
});

test('the data: attackAnim.face where an ability does not turn to its target (莫斯提马 none, 赤刃明霄陈 S3 her deploy direction)', () => {
  const chess = JSON.parse(readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8'));
  const backups = JSON.parse(readFileSync(path.join(ROOT, 'data/backups.json'), 'utf8'));
  const timing = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-attack-timing.json'), 'utf8')).ops;
  assert.equal(timing.char_213_mostma.attack[0].face, 0);
  assert.equal(timing.char_1050_chen3.attack[0].face, 1);
  assert.equal(backups.units.char_1050_chen3.attackAnim.base.face, undefined, 'her Default attack faces its target (1, left out)');
  const s3 = backups.units.char_1050_chen3.attackAnim.skills[2];
  assert.equal(s3.face, 2, 'S3: _faceToDefault');
  const most = Object.values(chess).find((r) => r.charId === 'char_213_mostma' && r.attackAnim?.base);
  if (most) assert.equal(most.attackAnim.base.face, 0);
});

test('turnWidth: the model narrows to edge-on half way through the 0.15 s turn and widens again (cos of its angle)', () => {
  assert.equal(SWITCH_TIME, 0.15);
  assert.equal(turnWidth(0), 1);
  assert.ok(Math.abs(turnWidth(0.0375) - Math.cos(Math.PI / 4)) < 1e-9, '45° a quarter of the way');
  assert.ok(turnWidth(0.075) < 1e-9, 'edge-on half way');
  assert.ok(Math.abs(turnWidth(0.1125) - Math.cos(Math.PI / 4)) < 1e-9);
  assert.equal(turnWidth(0.15), 1, 'over');
});

let fake, SpineActor, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

test('a swing reports how far it is, so a model swapped mid-swing (Front ⇄ Back) plays it on', () => {
  const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
  const entry = assets.chars.char_4100_caper.spine.front;
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setBase('idle');
  assert.equal(a.swingElapsed(), null);
  assert.ok(a.swing(0.533));
  for (let i = 0; i < 12; i++) a.update(1 / 60);
  const s = a.swingElapsed();
  assert.equal(s.windup, 0.533);
  assert.ok(Math.abs(s.elapsed - 0.2) < 1e-6, `${s.elapsed}`);
});

test('UnitView.turnTo: the mirror changes half way through the turn, a second turn completes the first, no model turns at once', async () => {
  const CAPER = 'char_4100_caper';
  const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
  const cam = presetCamera('prep', { width: 1280, height: 720 });
  const entry = assets.chars[CAPER].spine.front;
  const st = {
    picture: () => null, image: async () => null, hasBack: () => false,
    spineEntry: () => entry,
    spine: { acquire: async () => ({ animations: Object.keys(entry.animations).map((name) => ({ name })) }), release() {} },
  };
  const make = () => new UnitView(fakeViewCtx(fake.P, { assets: st, cam: () => cam }), { id: 1, side: 'ally', kind: 'chess', defId: CAPER, x: 4, y: 10, dir: 'RIGHT', maxHp: 1000 }, {});
  const bare = make();
  bare.turnToward(3, 10);
  assert.deepEqual([bare.visFacing, bare.turnS], [-1, null], 'no model drawn yet: at once');
  const v = make();
  for (let i = 0; i < 50 && !(v.actor && v.spineReady); i++) { await new Promise((r) => setImmediate(r)); v.update(1 / 60, cam, 0); }
  assert.ok(v.actor && v.spineReady, 'the model is up');
  const step = (s) => { const n = Math.max(1, Math.round(s / 0.005)); for (let i = 0; i < n; i++) v.update(s / n, cam, 0); };
  step(0.2);
  const full = v.modelSX;
  assert.ok(full > 0);
  v.turnToward(3, 10);                       // an enemy behind it
  assert.equal(v.face.lr, -1, 'its facing (the effects\' dir4) changes as the turn starts');
  assert.equal(v.face.dir4, 'LEFT');
  step(0.04);
  assert.equal(v.visFacing, 1, 'not yet mirrored');
  assert.ok(v.modelSX > 0 && v.modelSX < full * 0.75, `narrowing: ${v.modelSX / full}`);
  step(0.05);
  assert.equal(v.visFacing, -1, 'mirrored edge-on, half way');
  assert.ok(v.modelSX < 0 && -v.modelSX < full, `widening mirrored: ${v.modelSX / full}`);
  step(0.08);
  assert.equal(v.turnS, null);
  assert.ok(Math.abs(v.modelSX + full) < 1e-9, 'full width again, mirrored');
  v.turnToward(5, 10);                       // back to the right …
  step(0.03);
  assert.equal(v.visFacing, -1);
  v.turnToward(3, 10);                       // … and left again before that turn showed: it completes first, with the
  // facing the switcher holds by then (its onSwitchFace reads m_currentLOrR, already LEFT again)
  assert.equal(v.visFacing, -1, '_KillLastTween → Kill(true): shown at once');
  assert.equal(v.turnS.t, 0, 'the new turn starts from the beginning');
  step(0.16);
  assert.equal(v.visFacing, -1);
  assert.ok(Math.abs(v.modelSX + full) < 1e-9);
});
