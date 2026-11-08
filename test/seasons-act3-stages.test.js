// test/seasons-act3-stages.test.js — the battlefields of 卫戍协议：规程 (shared/seasons.js `act3autochess`, not public) in the
// 19×21 frame the sim reads (tools/level-fields.mjs): a stage level of that season is a 36×55 scene whose battle fields are
// three sub-levels, a wave level's routes are on its field's placeholder. Built into the frame, a 规程 stage is the default
// season's layout (its 战场 m01 is season one's m01 tile for tile but three rows of the official pieces), the routes of the
// wave levels both seasons have are the default season's, and a 规程 match fights on its own stages, waves and enemies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../server/data.js';
import { makeMatch } from './match/harness.js';
import { FIELD_ORIGINS, STAGE_PIECES, composeStageLevel, placeWaveLevel, waveOrigin } from '../tools/level-fields.mjs';

const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const BASE = getData({ log: quiet });
const STAGES = Object.values(ACT3.stages).filter((s) => !s.kind);
const at = (s, [r, c]) => s.rows[r]?.[c];

test('every 规程 stage is a 19×21 frame with the own field, the boss field, the right-hand field and the enemy area', () => {
  assert.equal(STAGES.length, 10);
  for (const s of STAGES) {
    assert.deepEqual(s.size, [19, 21], s.id);
    // the default season's gates: own field 9–12, its right-hand neighbour, the boss field's two halves
    for (const p of [[9, 10], [12, 10], [9, 18], [12, 18], [5, 10]]) assert.ok('SO'.includes(at(s, p)), `${s.id} gate ${p}: ${at(s, p)}`);
    for (const p of [[9, 2], [2, 2], [2, 18]]) assert.equal(at(s, p), 'E', `${s.id} goal ${p}`);
    // the enemy preview area of enemy_place_rect ((14,7),(18,13)), from sub_03
    assert.equal(s.config.enemy_place_rect, '((14,7),(18,13))', s.id);
    assert.equal(s.rows[16].slice(7, 14), 'ppppppp', s.id);
    assert.ok(s.deployTiles.normal.melee.length >= 10, `${s.id} own field deployable`);
    assert.ok(s.deployTiles.bossLeft.melee.length >= 10 && s.deployTiles.bossRight.melee.length >= 10, `${s.id} boss halves deployable`);
    assert.equal(Object.keys(s.groundPaths).length, 12, `${s.id} all helper routes`);
    // tile_acbag (临时整备区) is hand, never a ranged tile
    for (const k of ['normal', 'bossLeft', 'bossRight']) for (const [r, c] of s.deployTiles[k].rangedOnly) assert.notEqual(s.tiles[at(s, [r, c])].tileKey, 'tile_acbag', `${s.id} ${k} ${r},${c}`);
    assert.equal(s.tiles.A.tileKey, 'tile_acbag', s.id);
    assert.equal(s.tiles.a.tileKey, 'tile_achand', s.id);
    for (const g of new Set(s.rows.join(''))) assert.notEqual(g, '?', `${s.id} unknown tile`);
  }
});

test('规程 战场 m01 is season one\'s m01 again: tile for tile, but where the official pieces differ', () => {
  const a = ACT3.stages.act3autochess_m01, b = BASE.stages.act1autochess_m01;
  const diff = [];
  for (let r = 0; r < 19; r++) for (let c = 0; c < 21; c++) {
    const x = a.tiles[at(a, [r, c])], y = b.tiles[at(b, [r, c])];
    const k = (t) => `${t.tileKey === 'tile_acbag' ? 'tile_achand' : t.tileKey}/${t.passable}`;
    if (k(x) !== k(y)) diff.push(`${r},${c}`);
  }
  // row 6 and the own field's bottom row are FLY_ONLY forbidden in the pieces (season one: impassable), the right-hand
  // field's hand row is a hand row in sub_02 (season one: forbidden and a teleport entry at (8, 11))
  const expected = [...Array.from({ length: 21 }, (_, c) => `6,${c}`), ...Array.from({ length: 10 }, (_, i) => `8,${11 + i}`), ...Array.from({ length: 11 }, (_, c) => `13,${c}`)];
  assert.deepEqual(diff.sort(), expected.sort());
  assert.deepEqual(a.deployTiles, b.deployTiles);
  assert.deepEqual(a.groundPaths, b.groundPaths);
  // the crates where season one has them; 规程 has no 双眼皮 turrets and stands its 冷风 devices on the fields' edge rows
  // (season one: one off the field at (18, 0))
  const crates = (s) => s.devices.filter((d) => d.key === 'trap_1105_accrate').map((d) => `${d.alias}@${d.pos}`).sort();
  assert.deepEqual(crates(a), crates(b).filter((p) => !/#[23]0\d@/.test(p)).concat(crates(b).filter((p) => /#[23]0\d@/.test(p)).map((p) => p.replace(/#([23])0/, (m, d) => `#${d - 2}0`))).sort());
  assert.deepEqual(a.devices.filter((d) => d.key === 'trap_1112_acblzd').map((d) => d.pos), [[6, 8], [6, 12], [13, 5], [13, 16]]);
  assert.deepEqual(a.mapChars.map((m) => `${m.alias}@${m.pos}`).sort(), b.mapChars.map((m) => `${m.alias}@${m.pos}`).sort());
});

test('规程 wave routes: the default season\'s on every template both have; every point on a tile its unit can stand on', () => {
  const k = (r) => JSON.stringify(r);
  let shared = 0;
  for (const [id, w] of Object.entries(ACT3.waves)) {
    const old = BASE.waves[id.replace('act3autochess', 'act1autochess')];
    if (!old) continue;
    shared++;
    const mine = new Set(w.routes.map(k));
    const kept = old.routes.filter((r) => mine.has(k(r))).length;
    // one-field templates keep every route; the boss and 联防 templates changed some of their patrols, but keep others
    // to the tile (a wrong origin would keep none)
    if (/^act3autochess_(0\d|h0[1-6])$/.test(id)) assert.equal(kept, old.routes.length, id);
    else assert.ok(kept >= 2, `${id}: ${kept}/${old.routes.length} of the default season's routes`);
  }
  assert.ok(shared >= 30, `${shared} templates both seasons have`);
  const stage = ACT3.stages.act3autochess_m01;
  const bad = [];
  for (const [id, w] of Object.entries(ACT3.waves)) {
    for (const r of [...w.routes, ...w.extraRoutes]) {
      if (!r) continue;
      for (const p of [r.start, r.end, ...r.checkpoints.map((c) => c.slice(0, 2))]) {
        const g = at(stage, p);
        if (r.motion === 'E_NUM' && p[0] === 1 && p[1] === 2) continue; // the placeholder (0, 0) routes, as in season one
        if (g == null || (r.motion === 'WALK' && !'rfpSEIObmiuG'.includes(g))) bad.push(`${id} ${p}=${g}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('level-fields: a placeholder with teleport entries is the boss field\'s, one without the own field\'s', () => {
  assert.deepEqual(FIELD_ORIGINS.boss, [1, 2]);
  assert.deepEqual(FIELD_ORIGINS.normal, [9, 2]);
  const tile = (tileKey, heightType = 'LOWLAND') => ({ tileKey, heightType, buildableType: 'NONE', passableMask: tileKey === 'tile_forbidden' ? 'FLY_ONLY' : 'ALL' });
  const tiles = [tile('tile_forbidden', 'HIGHLAND'), tile('tile_road'), tile('tile_end'), tile('tile_start'), tile('tile_telin')];
  // 2 rows × 3 cols, top row first: [telin? road start] over [end road road]
  const lv = (top) => ({ mapData: { map: [[top, 1, 3], [2, 1, 1]], tiles }, routes: [{ startPosition: { row: 1, col: 2 }, endPosition: { row: 0, col: 0 }, checkpoints: [{ position: { row: 0, col: 1 }, reachOffset: { x: 0.1, y: 0 } }] }], extraRoutes: [], predefines: null });
  assert.deepEqual(waveOrigin(lv(4)).origin, [1, 2]);
  assert.deepEqual(waveOrigin(lv(1)).origin, [9, 2]);
  const placed = placeWaveLevel(lv(1), [9, 2]);
  assert.equal(placed.mapData.map.length, 19);
  assert.deepEqual(placed.routes[0].startPosition, { row: 10, col: 4 });
  assert.deepEqual(placed.routes[0].endPosition, { row: 9, col: 2 });
  assert.deepEqual(placed.routes[0].checkpoints[0], { position: { row: 9, col: 3 }, reachOffset: { x: 0.1, y: 0 } });
  // the pieces cover the frame but row 7's right half
  const covered = new Set();
  for (const p of STAGE_PIECES) for (let r = p.rows[0]; r <= p.rows[1]; r++) for (let c = p.cols[0]; c <= p.cols[1]; c++) covered.add(`${p.row0 + r - p.rows[0]},${c}`);
  assert.equal(covered.size, 19 * 21 - 10);
  assert.throws(() => composeStageLevel({}, []), /three sub-levels/);
});

test('real match path: a 规程 solo match fights its own stage, waves, enemies and leader to the final round', () => {
  const seats = [{ seat: 0, playerId: 'ai_0', name: 'AI0', isBot: true, connected: true }];
  const h = makeMatch({ mode: 'solo', modeId: 'mode_single_1', difficulty: 'NORMAL', seats, seed: 7, data: ACT3, season: 'act3autochess' }).start();
  h.setStage('act3autochess_m05');
  const spawned = new Set();
  let fields = 0;
  const newBattle = h.m.newBattle.bind(h.m);
  h.m.newBattle = (o, x) => {
    const b = newBattle(o, x);
    fields++;
    b.on('enemySpawn', (e) => spawned.add(e.enemy.defId));
    return b;
  };
  h.drive(() => h.ended != null, { band: Object.keys(ACT3.bands)[0] });
  assert.ok(h.ended, `ended (phase ${h.m.phase} R${h.m.round})`);
  assert.deepEqual(h.logs.error, []);
  assert.equal(h.ended.stageId, 'act3autochess_m05');
  assert.ok(h.ended.roundsPassed >= 13, `rounds ${h.ended.roundsPassed} (${h.ended.reason})`);
  assert.ok(fields >= 13, `${fields} battles`);
  assert.ok(ACT3.bosses[h.ended.bossId], h.ended.bossId);
  // its enemies came from its own templates (a kit's own summons, like 隐德来希's enemy_5601_entlec, are no wave's): the
  // season's enemy list, among them ones the default season lacks
  const fromWaves = [...spawned].filter((k) => ACT3.enemies[k]);
  assert.ok(fromWaves.length >= 20, `${fromWaves.length} enemy kinds`);
  assert.ok(fromWaves.some((k) => !BASE.enemies[k]), 'a 规程-only enemy');
  h.m.dispose?.();
});
