// test/seasons-act3-stages.test.js — the battlefields of 卫戍协议：规程 (shared/seasons.js `act3autochess`, not public) in the
// 19×21 frame the sim reads (tools/level-fields.mjs): a stage level of that season is a 36×55 scene whose battle fields are
// three sub-levels, a wave level's routes are on its field's placeholder. Built into the frame, a 规程 stage is the default
// season's layout (its 战场 m01 is season one's m01 tile for tile but three rows of the official pieces), the routes of the
// wave levels both seasons have are the default season's, and a 规程 match fights on its own stages, waves and enemies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../server/data.js';
import { makeMatch } from './match/harness.js';
import { makeBattle, chessRec, enemyRec } from './helpers/battleHarness.js';
import { terrainAt } from '../server/sim/content/devices.js';
import { enemyStealthed, canTargetEnemy } from '../server/sim/targeting.js';
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

// ---------------------------------------------------------------------------------------------------------------
// 规程's devices and tiles (server/sim/content/devices.js)

const stageDefs = (id) => ({ stages: { [id]: ACT3.stages[id] } });
const guardRec = (id = 't_guard') => chessRec({ id, profession: 'WARRIOR', skill: null, rangeGrid: [[0, 0]], stats: { atk: 0, maxHp: 1e6, def: 0, res: 0, blockCnt: 2 } });
const standStill = (pos, motion = 'WALK') => ({ motion, start: pos, end: [9, 2], checkpoints: [{ type: 'WAIT', time: 99 }] });

test('规程 blowers (m05) and mire (m06): the default season\'s devices — same records, same numbers, same places', () => {
  const a5 = ACT3.stages.act3autochess_m05, a6 = ACT3.stages.act3autochess_m06;
  assert.deepEqual(a5.special.blower, BASE.stages.act2autochess_m01.special.blower);
  assert.deepEqual(a6.special.mire, BASE.stages.act2autochess_m02.special.mire);
  const blowers = (s) => s.devices.filter((d) => d.role === 'blower').map((d) => `${d.pos}/${d.dir}/${d.rangeTiles.join(';')}`).sort();
  assert.deepEqual(blowers(a5), blowers(BASE.stages.act2autochess_m01));
  // the mire controllers (three, each piece its own) carry the default season's skill record
  const mires = a6.devices.filter((d) => d.key === 'trap_098_mire');
  assert.equal(mires.length, 3);
  for (const d of mires) assert.deepEqual(d.skill, BASE.stages.act2autochess_m02.devices.find((x) => x.key === 'trap_098_mire').skill);
});

test('规程 加速 tile (m12, tile_speedup): a ground operator ASPD + attack_speed, a ground enemy move × move_speed; flyers untouched; ends on leaving', () => {
  const id = 'act3autochess_m12';
  const bb = ACT3.stages[id].special.speedup.bb;
  assert.deepEqual(bb, { attack_speed: 25, move_speed: 1.5 });
  assert.equal(at(ACT3.stages[id], [11, 7]), 'u');
  assert.equal(at(ACT3.stages[id], [11, 5]), 'r');
  const enemies = { enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e7, speed: 1 }), enemy_fly: enemyRec({ key: 'enemy_fly', hp: 1e7, speed: 1, motion: 'FLY' }) };
  const h = makeBattle({ stageId: id, defs: { ...stageDefs(id), chess: { t_guard: guardRec(), t_off: guardRec('t_off') }, enemies },
    units: [{ chessId: 't_guard', row: 12, col: 7 }, { chessId: 't_off', row: 12, col: 5 }],
    enemies: [{ key: 'enemy_walk', pos: [11, 7], route: standStill([11, 7]) }, { key: 'enemy_fly', pos: [11, 7], route: standStill([11, 7], 'FLY') }],
    autoFinish: false, timeLimit: 30 });
  h.step(2);
  assert.equal(terrainAt(h.b, 11, 7), 'speedup');
  const g = h.unit('t_guard'), off = h.unit('t_off'), e = h.enemy('enemy_walk'), f = h.enemy('enemy_fly');
  assert.equal(g.s.aspd, 100 + bb.attack_speed, 'ATTACK_SPEED ADDITION');
  assert.equal(off.s.aspd, 100, 'off the tile');
  assert.equal(g.findBuff('terrain:speedup').mods.moveMul, undefined, 'an operator gets the ASPD part only');
  assert.ok(Math.abs(e.s.moveSpeed - bb.move_speed) < 1e-9, `enemy move ${e.s.moveSpeed}`);
  assert.equal(e.findBuff('terrain:speedup').mods.aspd, undefined, 'an enemy gets the move part only');
  assert.equal(f.findBuff('terrain:speedup'), null, 'a flyer is not on the tile (targetMotion WALK)');
  // walking off: the buff ends
  e.x = 5; e.y = 11;
  h.step(2);
  assert.equal(e.findBuff('terrain:speedup'), null);
  assert.ok(Math.abs(e.s.moveSpeed - 1) < 1e-9);
});

test('规程 草地 tile (m09, tile_duel_grassland): ground units on it are 隐匿 — an enemy only while not blocked, visible the moment the block ends', () => {
  const id = 'act3autochess_m09';
  assert.equal(at(ACT3.stages[id], [11, 6]), 'G');
  assert.equal(at(ACT3.stages[id], [11, 7]), 'G');
  const enemies = { enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e7, speed: 1 }), enemy_fly: enemyRec({ key: 'enemy_fly', hp: 1e7, speed: 1, motion: 'FLY' }) };
  const h = makeBattle({ stageId: id, defs: { ...stageDefs(id), chess: { t_guard: guardRec(), t_off: guardRec('t_off') }, enemies },
    units: [{ chessId: 't_guard', row: 11, col: 6 }, { chessId: 't_off', row: 12, col: 4 }],
    enemies: [{ key: 'enemy_walk', pos: [11, 7], route: standStill([11, 7]) }, { key: 'enemy_fly', pos: [11, 7], route: standStill([11, 7], 'FLY') }],
    autoFinish: false, timeLimit: 30 });
  h.step(2);
  assert.equal(terrainAt(h.b, 11, 6), 'grassland');
  const g = h.unit('t_guard'), off = h.unit('t_off'), e = h.enemy('enemy_walk'), f = h.enemy('enemy_fly');
  assert.ok(g.s.flags.stealth, 'the operator on the grass is 隐匿');
  assert.ok(!off.s.flags.stealth);
  assert.ok(!e.blockedBy && e.s.flags.stealth && enemyStealthed(e), 'the enemy on the grass is 隐匿');
  assert.ok(!canTargetEnemy(off, e, off.profile), 'not a target');
  assert.equal(f.findBuff('terrain:grassland'), null, 'a flyer is not on the tile');
  // blocked: visible; the block ends: 隐匿 again at once (no 3 s restore)
  e.x = 6; e.y = 11;
  h.runUntil(() => e.blockedBy, 3);
  assert.ok(e.blockedBy === g && e.findBuff('terrain:grassland'), 'blocked on the grass');
  assert.ok(!enemyStealthed(e), 'visible while blocked');
  h.b.retreat(g);
  h.step();
  assert.ok(!e.blockedBy && enemyStealthed(e), 'hidden again the tick the block ends');
  // walking off: the buff ends
  e.x = 4; e.y = 11.6;
  h.step(2);
  assert.equal(e.findBuff('terrain:grassland'), null);
  assert.ok(!e.s.flags.stealth);
});

test('规程 盐坨子炮 (m10, trap_196_cnnon): every 6 s a shell at its lane\'s latest-deployed ally, 3×3 physical ATK × 1; it carries a ground enemy of weight ≤ 3 from within 1 and drops it there', () => {
  const id = 'act3autochess_m10';
  const dev = ACT3.stages[id].devices.find((d) => d.key === 'trap_196_cnnon' && d.pos[0] === 13 && d.pos[1] === 6);
  assert.ok(dev && dev.dir === 'DOWN' && dev.stats.atk === 1200);
  assert.equal(dev.skill.skillId, 'sktok_cnnon');
  // its lane: (13,6) and four rows down; (12,6) and (10,6) are road
  assert.equal(at(ACT3.stages[id], [12, 6]), 'r');
  assert.equal(at(ACT3.stages[id], [10, 6]), 'r');
  const enemies = {
    enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e7, speed: 1, mass: 3 }),
    enemy_heavy: enemyRec({ key: 'enemy_heavy', hp: 1e7, speed: 1, mass: 4 }),
    enemy_fly: enemyRec({ key: 'enemy_fly', hp: 1e7, speed: 1, motion: 'FLY' }),
  };
  const h = makeBattle({ stageId: id, defs: { ...stageDefs(id), chess: { t_guard: guardRec(), t_far: guardRec('t_far'), t_side: guardRec('t_side') }, enemies },
    units: [{ chessId: 't_guard', row: 12, col: 4 }, { chessId: 't_side', row: 11, col: 7 }, { chessId: 't_far', row: 10, col: 6 }],
    enemies: [{ key: 'enemy_walk', pos: [12.2, 6], route: standStill([12.2, 6]) }, { key: 'enemy_heavy', pos: [12.4, 6.6], route: standStill([12.4, 6.6]) },
      { key: 'enemy_fly', pos: [12.5, 6], route: standStill([12.5, 6], 'FLY') }],
    autoFinish: false, timeLimit: 60 });
  const shells = [];
  h.b.on('damaged', (c) => { if ((c.dmg.tags || []).includes('cnnonShell')) shells.push({ t: c.target, at: h.b.time, n: c.amount }); });
  h.step(1);
  const g = h.unit('t_guard'), far = h.unit('t_far'), side = h.unit('t_side');
  const w = h.enemy('enemy_walk'), heavy = h.enemy('enemy_heavy'), fly = h.enemy('enemy_fly');
  assert.ok(w.hidden, 'the walker (weight 3) within 1 is on board');
  assert.ok(!heavy.hidden && !fly.hidden, 'weight 4 and a flyer stay');
  h.runUntil(() => shells.length > 0, 10);
  // its lane holds t_far (10,6), the latest deployed; the shell flies 3 tiles at 5/s
  assert.ok(Math.abs(shells[0].at - (6 + 3 / 5)) < 0.1, `lands at ${shells[0].at}`);
  assert.deepEqual(new Set(shells.map((s) => s.t)), new Set([far, side]), '3×3 around (10,6): t_side at (11,7) too, not t_guard');
  assert.equal(Math.round(far.stats.taken), 1200, 'physical 1200 on DEF 0');
  assert.ok(!w.hidden && Math.abs(w.y - 10) <= 0.2 + 1e-9 && Math.abs(w.x - 6) <= 0.2 + 1e-9, `dropped at (10,6) ± 0.2: (${w.y}, ${w.x})`);
  assert.equal(g.stats.taken, 0);
  h.step(1);
  assert.ok(!heavy.hidden && !fly.hidden, 'the cannon empty again, weight 4 and the flyer within 1 are still not taken');
  // the next shot: nobody near the cannon, so no passenger; the same target
  h.runUntil(() => shells.length > 2, 8);
  assert.ok(Math.abs(shells[2].at - (12 + 3 / 5)) < 0.1);
  assert.ok(!w.hidden);
});

