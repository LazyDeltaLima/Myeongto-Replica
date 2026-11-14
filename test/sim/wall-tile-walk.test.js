// A ground enemy never walks through a wall, and none is spawned inside one (docs/rules/sim.md 「적이 걷는 법」 벽 칸,
// 「사망 소환물의 자리」).
//
// The report: 战场#05 源石流发生装置 (act2autochess_m01, and 规程's act3autochess_m05 with the same layout), 歌蕾蒂娅 on one of
// the three road tiles right of the goal (9,3)–(9,5) facing RIGHT: after S3 the light 频次 enemies (磨砻's 木制瑞印) came
// through the wall (9,6) to her side. Two causes, both on the real stage:
//   - the 捕网 (S3's closing pull to her front) presses 磨砻 against the wall's far edge, and its death spread put a child
//     0.1 to the side — inside the wall tile (the official dead-spawn node keeps a spot only where a ground unit walks);
//   - a walker standing in a wall tile (that child, or a body whose leftover speed carried it over the edge after the
//     pull) headed straight for its leg's target — the goal (9,2) — through the wall. Officially the route node of such a
//     tile has no distance (Route.Node.isValid false) and MoveCheckpoint.GetNextDirection gives no direction: it brakes
//     and the wall's force takes it back out to the nearest tile it can walk.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { getData } from '../../server/data.js';

const REAL = { skip: !hasGeneratedData() };
const quiet = { warn() {}, error() {}, info() {} };
const RULES = 'docs/rules/sim.md 「적이 걷는 법」 벽 칸 · 「사망 소환물의 자리」';
const GLADY = 'chess_char_4_12_b';
const SEASONS = [
  { stage: 'act2autochess_m01', data: null },
  { stage: 'act3autochess_m05', season: 'act3autochess' },
];
const seasonDefs = (s) => {
  if (!s.season) return {};
  const D = getData({ log: quiet, season: s.season });
  return { defs: { stages: { [s.stage]: D.stages[s.stage] }, enemies: D.enemies } };
};
const tileOf = (g, e) => g.tile(Math.round(e.y), Math.round(e.x));
/** How far a body stands inside the tile it is on, from that tile's nearest edge (0 at the edge, 0.5 at the centre). */
const depth = (e) => 0.5 - Math.max(Math.abs(e.x - Math.round(e.x)), Math.abs(e.y - Math.round(e.y)));

test('a walker inside a wall tile walks out to the nearest tile it can walk, not through the wall to the goal', REAL, () => {
  for (const s of SEASONS) {
    const h = makeBattle({ stageId: s.stage, ...seasonDefs(s), units: [], enemies: [], autoFinish: false, timeLimit: 60 });
    h.step();
    // (9,6) is the wall between the lane (9,7)… and the goal's road (9,5)…(9,3); 0.6 from (9,7), 1.4 from (9,5)
    const e = h.spawn('enemy_1196_msfyin', { pos: [9.4, 6.4], route: 1 });
    assert.equal(tileOf(h.b.grid, e).pass === 'ALL', false, `${s.stage}: the setup stands in the wall`);
    let minX = e.x;
    for (let i = 0; i < 30 * 4 && e.alive; i++) { h.step(); minX = Math.min(minX, e.x); }
    assert.ok(minX > 6.3, `${s.stage}: it walked through the wall towards the goal (x ${minX.toFixed(2)}) — a walker on a tile it cannot walk has no direction (walk.js inWallTile; ${RULES})`);
    assert.equal(tileOf(h.b.grid, e).pass, 'ALL', `${s.stage}: it is out of the wall after 4 s (${e.y.toFixed(2)}, ${e.x.toFixed(2)})`);
    assert.ok(e.x > 6.5, `${s.stage}: it came out on its own side of the wall (x ${e.x.toFixed(2)})`);
  }
});

test('sweep: every ground enemy that spawns others as it is killed against a wall puts them on tiles a ground unit walks', REAL, () => {
  let ran = 0, children = 0;
  const known = new Set();
  for (const s of SEASONS) {
    const D = s.season ? getData({ log: quiet, season: s.season }) : getData({ log: quiet });
    for (const [key, def] of Object.entries(D.enemies)) {
      if (def.stats?.motion === 'FLY') continue;
      // pressed against the wall (9,6) from the lane side, as the 捕网 leaves it
      const h = makeBattle({ stageId: s.stage, ...seasonDefs(s), units: [], enemies: [], autoFinish: false, timeLimit: 30 });
      h.step();
      const e = h.spawn(key, { pos: [9, 6.52], route: 1, mods: { hpMul: 1, speedMul: 0, atkMul: 0 } });
      if (!e) continue;
      const before = new Set(h.b.enemies);
      h.b.kill(e, null);
      for (let i = 0; i < 30 * 1.5; i++) h.step();
      ran++;
      for (const c of h.b.enemies) {
        if (before.has(c) || !c.alive || c.motion === 'FLY') continue;
        children++;
        known.add(key);
        const t = tileOf(h.b.grid, c);
        assert.ok(t.pass === 'ALL' || depth(c) < 0.1, `${s.stage} ${key}: its ${c.defId} stands ${depth(c).toFixed(2)} inside ${t.key} at (${c.y.toFixed(2)}, ${c.x.toFixed(2)}) — a death spawn keeps a spot only where a ground unit walks (helpers.js groundSpot; ${RULES})`);
      }
    }
  }
  assert.ok(ran > 200, `the sweep ran (${ran} enemies)`);
  assert.ok(known.has('enemy_1195_sfyin') && known.has('enemy_1207_sfji'), `磨砻 and 沉沙 spawned their children (${[...known].join(', ')})`);
  assert.ok(children > 10, `children checked: ${children}`);
});

test('the report: 歌蕾蒂娅 S3 right of the goal on 战场#05 (both seasons) — no 频次 enemy crosses the wall to her side', REAL, () => {
  const cases = [['enemy_1195_sfyin', 4, 1], ['enemy_1195_sfyin', 5, 0], ['enemy_1203_sfhu', 4, 1]];
  let walkedOut = 0;
  for (const s of SEASONS) {
    for (const [key, col, route] of cases) {
      const enemies = [];
      for (let i = 0; i < 14; i++) enemies.push({ key, time: i * 1.2, route });
      const h = makeBattle({ stageId: s.stage, ...seasonDefs(s), units: [{ chessId: GLADY, row: 9, col, dir: 'RIGHT', carryState: { sp: 1e3 } }], enemies, autoFinish: false, timeLimit: 120 });
      h.step();
      const u = h.unit(GLADY);
      const g = h.b.grid;
      for (let i = 0; i < 30 * 60; i++) {
        if (!u.skill.active && i % 15 === 0) u.skill.activate('test', { free: true });
        h.step();
        for (const e of h.b.enemies) {
          if (!e.alive || e.motion === 'FLY') continue;
          const t = tileOf(g, e);
          if (t.pass === 'ALL') continue;
          walkedOut++;
          // a body may graze a wall's edge (the walk's bounce, a push's leftover speed — official too), never more
          assert.ok(depth(e) < 0.12, `${s.stage} 歌蕾蒂娅 (9,${col}) ${key} route ${route}: ${e.defId} ${depth(e).toFixed(2)} inside ${t.key} at (${e.y.toFixed(2)}, ${e.x.toFixed(2)}), t ${h.b.time.toFixed(2)} (${RULES})`);
        }
      }
    }
  }
  assert.ok(walkedOut > 0, 'the case still grazes a wall (the guard watches the place the report was)');
});
