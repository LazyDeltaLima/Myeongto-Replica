// test/match/custom-first-half.test.js — the custom 规则 「收录上半战场」 (shared/ruleset.js stages.firstHalf,
// CUSTOM_FIRST_HALF_STAGES; maintainer decision 2026-10-18: 战场#06 once its 沙尘暴/土石结构 works) on the real match path
// (harness → buildBattleSpec → createBattleFromSpec): off, the draws are a classic match's; on, 战场#06 joins the
// pool and its storm blows on the normal and the boss fields (server/sim/content/devices.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEO } from '../../shared/constants.js';
import { customStagePool, customDiffs, sanitizeCustom, CUSTOM_FIRST_HALF_STAGES } from '../../shared/ruleset.js';
import { GameData } from '../../server/match/gamedata.js';
import { setupMatchWaves } from '../../server/match/waves.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { createRng } from '../../server/sim/rng.js';
import { DATA, makeMatch } from './harness.js';

const custom = (c) => ({ preset: 'custom', custom: c });
const M06 = 'act1autochess_m06';
const setupOf = (m) => ({ stageId: m.stageId, factions: m.factions.join(), bossId: m.bossId, hiddenBossId: m.hiddenBossId, drawn: m.disabledBonds.join() });

test('the setting: off by default, a diff when on, the pool gains 战场#06 only', () => {
  assert.deepEqual(CUSTOM_FIRST_HALF_STAGES, [M06]);
  assert.equal(sanitizeCustom({}).stages.firstHalf, false);
  assert.equal(sanitizeCustom({ stages: { firstHalf: 1 } }).stages.firstHalf, false, 'booleans only');
  assert.deepEqual(customDiffs({ stages: { firstHalf: true } }), ['stages.firstHalf']);
  const pool = DATA.config.modes.mode_multi_hard.stages;
  assert.deepEqual(customStagePool(pool, sanitizeCustom({})), pool);
  assert.deepEqual(customStagePool(pool, sanitizeCustom({ stages: { firstHalf: true } })), [...pool, M06]);
  assert.ok(!pool.includes(M06), 'not in this season\'s pool');
});

test('off: the same draws as classic · on: 战场#06 is drawn (alone when the rest are banned, sometimes among them)', () => {
  for (const seed of [3, 11]) {
    const a = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed, fake: true }).start();
    const b = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed, fake: true, ruleset: custom({ stages: { firstHalf: false } }) }).start();
    assert.deepEqual(setupOf(b.m), setupOf(a.m));
    a.m.dispose(); b.m.dispose();
  }
  const pool = DATA.config.modes.mode_multi_hard.stages;
  for (const seed of [1, 2]) {
    const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed, fake: true, ruleset: custom({ stages: { firstHalf: true, ban: pool } }) }).start();
    assert.equal(h.m.stageId, M06);
    h.m.dispose();
  }
  const gd = new GameData(DATA, 'mode_multi_hard');
  gd.custom = sanitizeCustom({ stages: { firstHalf: true } });
  const seen = new Set();
  for (let s = 1; s <= 60; s++) seen.add(setupMatchWaves(gd, createRng(s)).stageId);
  assert.ok(seen.has(M06) && seen.size > 2, `drawn among the season's stages: ${[...seen]}`);
});

test('real match path, 战场#06 normal field: enemies walking in the open are slowed by the storm', () => {
  const pool = DATA.config.modes.mode_single_hard.stages;
  const h = makeMatch({ mode: 'solo', difficulty: 'HARD', seed: 5, ruleset: custom({ stages: { firstHalf: true, ban: pool } }) }).start();
  assert.equal(h.m.stageId, M06);
  h.toPrep(2);
  const spec = buildBattleSpec({ battleId: 'fh.normal', ...h.m._normalOpts(h.ps('p_0')) });
  assert.equal(spec.stageId, M06);
  const b = createBattleFromSpec(spec, undefined, { recordEvents: false, quiet: true });
  let slowed = 0;
  for (let i = 0; i < 30 * 40 && !slowed; i++) { b.step(); slowed = b.enemies.filter((e) => e.alive && e.findBuff('terrain:sandstormSlow')).length; }
  assert.ok(slowed > 0, 'a slowed enemy');
  assert.deepEqual(b.fieldMeta().storm, [{ c0: 0, c1: 20, dir: 'DOWN' }], 'the m.field meta: where the client draws the storm');
  assert.deepEqual(b.errors ?? [], []);
  h.m.dispose();
});

test('战场#06 boss field: the top row has 6 土石结构 (the board 4) — an operator under (5,7) is sheltered (the board\'s col 7 has a sealed floor there), one in col 9 is not', () => {
  const gd = new GameData(DATA, 'mode_multi_hard');
  const op = 'chess_char_1_01_a';
  const players = [
    { playerId: 'p_0', seat: 0, side: 'L', colOffset: 0, bonds: {}, playerEffects: [],
      units: [{ uid: 1, kind: 'chess', chessId: op, row: 4, col: 7 }, { uid: 2, kind: 'chess', chessId: op, row: 3, col: 9 }] },
    { playerId: 'p_1', seat: 1, side: 'R', colOffset: 8, units: [], bonds: {}, playerEffects: [] },
  ];
  // no enemies: the storm alone (a wave's leader would kill the operator in the open)
  const spec = buildBattleSpec({
    battleId: 'fh.boss', fieldId: 'b1', kind: 'boss', seed: 5, modeId: 'mode_multi_hard', round: 14, stageId: M06,
    rect: { ...GEO.BOSS_RECT }, timeLimit: null, players, spawns: [], routes: [], flags: { layerGainsEnabled: false, ...gd.dp },
  });
  const b = createBattleFromSpec(spec, undefined, { recordEvents: false, quiet: true });
  b.autoFinish = false; // an empty field would end at once
  b.step(); // the stage devices come with the battle's start
  for (const [r, c] of [[5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8], [2, 7], [2, 8]]) assert.ok(b.grid.isObstacle(r, c), `mound (${r},${c})`);
  const at = (r, c) => b.allyUnits.find((u) => u.kind !== 'device' && u.tileR === r && u.tileC === c);
  const under = at(4, 7), open = at(3, 9);
  assert.ok(under && open, 'both deployed');
  for (let i = 0; i < 30 * 3; i++) b.step();
  assert.equal(under.findBuff('terrain:sandstorm'), null, '(5,7) shelters col 7 of the boss field');
  assert.equal(under.stats.taken, 0);
  assert.ok(open.findBuff('terrain:sandstorm'), 'col 9: nothing upwind');
  assert.ok(open.stats.taken >= 200, `two storm ticks by 3 s: ${open.stats.taken}`);
  assert.deepEqual(b.fieldMeta().storm, [{ c0: 0, c1: 10, dir: 'DOWN' }, { c0: 11, c1: 20, dir: 'DOWN' }], 'both halves of the pair field');
  // the board's col 7 has the sealed floor above it, not a mound: no shelter there
  assert.equal(DATA.stages[M06].devices.some((d) => d.role === 'mound' && d.pos[0] === 12 && d.pos[1] === 7), false);
  assert.equal(DATA.stages[M06].devices.some((d) => d.role === 'mound' && d.pos[0] === 5 && d.pos[1] === 7), true);
});
