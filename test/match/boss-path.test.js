// Boss route preview (docs/LOCAL-PATCH.md 「보스 경로 미리보기」, maintainer request 2026-10-08): a walking leader's path on the
// match's boss field rides on its m.private.nextEnemies entry (`paths`, server/match/bossPath.js — the sim's walk from
// the spawn through one patrol lap) and the prep runs the official route preview cursor along it (render/fxroute.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, GEO } from '../../shared/constants.js';
import { makeMatch, DATA } from './harness.js';
import { Battle } from '../../server/sim/Battle.js';
import { DataSource } from '../../server/sim/simdata.js';
import { runLeaderPaths, simplifyPath } from '../../server/match/bossPath.js';
import { pathLengths, pointAt, CURSOR } from '../../public/js/render/fxroute.js';

const ds = new DataSource(DATA, null);
const W = DATA.waves;
const run = (tplId, stageId, n) => runLeaderPaths((o) => new Battle({ data: ds, content: 'full', ...o }), {
  kind: 'boss', stageId, rect: { ...GEO.BOSS_RECT },
  players: Array.from({ length: n }, (_, i) => ({ playerId: `p${i + 1}`, seat: i, side: i ? 'R' : 'L', colOffset: i ? 8 : 0 })),
  spawns: W[tplId].spawns.filter((s) => s.tag === 'boss').map((s) => ({ enemyKey: s.key, time: s.time, routeIndex: s.routeIndex, tag: 'boss', mods: {} })),
  routes: W[tplId].routes, waveId: tplId, enemyOverrides: W[tplId].overrides, flags: { layerGainsEnabled: false },
});
const near = (p, r, c, eps = 0.15) => Math.hypot(p[0] - r, p[1] - c) <= eps;
const visits = (pts, r, c) => pts.some((p) => near(p, r, c));

test('卢西恩 on 战场#05(下半): the way to (3,9) and one lap (2,3) → (5,9) → (3,9); the pair copy on (3,11) → (2,17) → (5,11)', () => {
  const [left, right] = run('act2autochess_h07_05', 'act2autochess_m01', 2);
  assert.equal(left.enemyKey, 'enemy_2016_csphtm');
  assert.ok(near(left.pts[0], 4, 10, 0.05), 'from its spawn');
  for (const [r, c] of [[3, 9], [2, 3], [5, 9]]) assert.ok(visits(left.pts, r, c), `left copy through (${r},${c})`);
  assert.ok(near(left.pts[left.pts.length - 1], 3, 9), 'one lap: it ends back on the first checkpoint');
  for (const [r, c] of [[3, 11], [2, 17], [5, 11]]) assert.ok(visits(right.pts, r, c), `right copy through (${r},${c})`);
  assert.ok(left.pts.every(([, c]) => c <= 10.01) && right.pts.every(([, c]) => c >= 9.99), 'each copy on its own half');
  // five laps in the level file, one in the preview: the path is not longer than the way there plus one lap allows
  const len = pathLengths(left.pts).at(-1);
  assert.ok(len > 12 && len < 40, `length ${len}`);
});

test('the solo field walks the pair\'s left path; 铳 shares the checkpoints; a 自缚 leader has no path', () => {
  const solo = run('act2autochess_h07_05_s', 'act1autochess_m03', 1);
  const pair = run('act2autochess_h07_05', 'act1autochess_m03', 2);
  assert.equal(solo.length, 1);
  assert.deepEqual(solo[0].pts, pair[0].pts);
  const gun = run('act1autochess_h07_02_s', 'act1autochess_m03', 1);
  assert.equal(gun[0].enemyKey, 'enemy_9017_achunt');
  for (const [r, c] of [[3, 9], [2, 3], [5, 9]]) assert.ok(visits(gun[0].pts, r, c));
  assert.deepEqual(run('act1autochess_h07_01_s', 'act1autochess_m03', 1), [], '假想敌：胄 stays where it spawned');
});

test('every path stays on walkable boss-field tiles of its stage', () => {
  for (const stage of Object.values(DATA.stages).filter((s) => /autochess_m\d+$/.test(s.id))) {
    for (const p of run('act1autochess_h07_02', stage.id, 2)) {
      for (const [r, c] of p.pts) {
        const t = stage.tiles[stage.rows[Math.round(r)][Math.round(c)]];
        assert.ok(t && t.groundPassable, `${stage.id} (${r},${c}) ${t && t.tileKey}`);
      }
    }
  }
});

test('simplifyPath keeps the corners; pointAt walks the polyline', () => {
  const pts = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]];
  assert.deepEqual(simplifyPath(pts), [[0, 0], [0, 2], [2, 2]]);
  const acc = pathLengths([[0, 0], [0, 2], [2, 2]]);
  assert.deepEqual(acc, [0, 2, 4]);
  assert.deepEqual(pointAt([[0, 0], [0, 2], [2, 2]], acc, 3), { row: 1, col: 2 });
  assert.deepEqual(pointAt([[0, 0], [0, 2], [2, 2]], acc, 9), { row: 2, col: 2 });
  assert.equal(CURSOR.speed, 8, 'the prefab controller\'s _moveSpeed');
});

test('real match: the boss prep\'s nextEnemies leader entry carries the field\'s paths (pair: both copies)', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', humans: 2, seed: 4242, fake: true }).start();
  const m = h.m;
  m.bossId = 'boss_5';
  h.drive(() => m.phase === PHASE.PREP && m.round === m.gd.bossRound, { ready: true });
  assert.ok(m.bossWaves && m.bossWaves.length === 1, 'one pair field');
  m.BattleClass = Battle;   // the drive ran fake battles; the preview runs the real sim
  const list = h.ps('p_0').privateView().nextEnemies;
  const lead = list.find((e) => e.boss);
  assert.equal(lead.enemyKey, 'enemy_2016_csphtm');
  assert.deepEqual(lead.start, [4, 10]);
  const want = run(m.bossWaves[0].wave.templateId, m.stageId, 2).map((p) => p.pts);
  assert.equal(lead.paths.length, 2);
  assert.deepEqual(lead.paths, want, 'the same headless run as the tool');
  assert.deepEqual(h.ps('p_1').privateView().nextEnemies.find((e) => e.boss).paths, want, 'both players see both copies');
  assert.ok(list.filter((e) => !e.boss).every((e) => !e.paths), 'escorts carry none');
  m.dispose();
});
