// test/render/season-camera.test.js — 规程's battle camera (projection.js SEASON_CAMERA_PARAMS, docs/rules/render.md
// 「규정 전투 카메라」): its stages frame the left normal battle with the controller position fitted to an official CN battle
// screenshot, which shows the bench row (row 7, where the 整备区 operators stand through the battle) in full; the 盟约
// stages keep their level's camera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetCamera, stageCameraConfig, OFFICIAL_PARAMS, SEASON_CAMERA_PARAMS } from '../../public/js/render/projection.js';
import { getData } from '../../server/data.js';

const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const BASE = getData({ log: quiet });
const VIEW = { width: 1920, height: 1080 };
const stageOf = (d, id) => (Array.isArray(d.stages) ? d.stages.find((s) => s.id === id) : d.stages[id]);

test('规程 stages take the season battle camera; 盟约 stages keep the level config', () => {
  const s3 = stageOf(ACT3, 'act3autochess_m03');
  assert.ok(s3, 'act3autochess_m03');
  const c3 = stageCameraConfig(s3);
  assert.equal(c3.left_battle_camera_param, SEASON_CAMERA_PARAMS.act3autochess.left_battle_camera_param);
  assert.equal(c3.left_prepare_camera_param, s3.config.left_prepare_camera_param, 'the other keys stay the level\'s');
  const base = Array.isArray(BASE.stages) ? BASE.stages[0] : Object.values(BASE.stages)[0];
  assert.equal(stageCameraConfig(base), base.config, 'a 盟约 stage: its own config, untouched');
  assert.equal(base.config.left_battle_camera_param, OFFICIAL_PARAMS.left_battle_camera_param);
});

test('规程 battle camera: the bench row stands in view (feet ≈ the official screenshot\'s), the 盟约 camera cuts it off', () => {
  const s3 = stageOf(ACT3, 'act3autochess_m03');
  const cam = (config) => presetCamera('normal', VIEW, { rect: { r0: 9, r1: 12, c0: 0, c1: 10 }, side: 'L', config });
  const act3 = cam(stageCameraConfig(s3));
  const old = cam(s3.config);
  // a bench operator's feet (row 7, hand slot 8): the official screenshot has them at y ≈ 1020 of 1080
  const feet = act3.project(8, 7, 0);
  assert.ok(feet.y > 980 && feet.y < 1060, `feet at ${feet.y.toFixed(0)}`);
  // the bench row's far edge (row 7.5) is well inside the screen with 规程's camera, below it with the old one
  assert.ok(act3.project(5, 7.5, 0).y < 960, 'the bench row in view');
  assert.ok(old.project(5, 7.5, 0).y > 1040, 'the 盟约 camera: the bench row at the bottom edge');
  // the field's far row stays in view
  assert.ok(act3.project(5, 12.5, 0).y > 150, 'the far field row under the top HUD');
});

test('规程 boss 全景: the fitted camera puts a left bench slot where the official screenshot has its operator', () => {
  const s2 = stageOf(ACT3, 'act3autochess_m02');
  const rect = { r0: 0, r1: 5, c0: 0, c1: 20 };
  const act3 = presetCamera('boss', VIEW, { rect, side: 'L', config: stageCameraConfig(s2) });
  const old = presetCamera('boss', VIEW, { rect, side: 'L', config: s2.config });
  // the left player's hand slot 9 on the boss field (finalAssault.js bossFieldPlacement: row 7 → 0): the official
  // screenshot (m02, 全景, 1920 × 1080) has a bench operator standing there with its feet at ≈ (830, 915)
  const feet = act3.project(9, 0, 0);
  assert.ok(Math.abs(feet.x - 830) < 20 && Math.abs(feet.y - 915) < 20, `feet at ${feet.x.toFixed(0)}, ${feet.y.toFixed(0)}`);
  const was = old.project(9, 0, 0);
  assert.ok(Math.hypot(was.x - 830, was.y - 915) > 40, `the level value puts it at ${was.x.toFixed(0)}, ${was.y.toFixed(0)}`);
});

test('规程 联防: the right half mirrors the fitted left battle, the 全景 carries the boss 全景 correction', () => {
  const s = stageOf(ACT3, 'act3autochess_m02');
  const c = stageCameraConfig(s);
  const P = (k) => c[k].slice(1, -1).split(',').map(Number);
  const L = (k) => s.config[k].slice(1, -1).split(',').map(Number);
  const [lx, ly, lz] = P('left_battle_camera_param'), [rx, ry, rz] = P('right_battle_camera_param');
  assert.deepEqual([rx, ry, rz], [-lx, ly, lz], 'mirror of the left');
  const d = (a, b) => a.map((v, i) => Math.round((v - b[i]) * 100) / 100);
  assert.deepEqual(d(P('mid_battle_camera_param'), L('mid_battle_camera_param')), d(P('mid_boss_battle_camera_param'), L('mid_boss_battle_camera_param')),
    'the 联防 全景 moved like the boss 全景');
});
