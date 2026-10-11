// test/local-patch-debug.test.js — the debug page's sandbag arena (local patch, public/js/debug/sandbag.js): the island
// stage, the sandbag record and the battle the page builds, run here on the real sim and data like the page does in
// the browser (public/js/debug/arena.js).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Battle } from '../server/sim/Battle.js';
import * as simdata from '../server/sim/simdata.js';
import { rotateOffset } from '../server/sim/dir.js';
import { SIM_DATA_FILES as RUNNER_FILES } from '../public/js/battle/runner.js';
import {
  ARENA, inArena, arenaStage, sandbagRecord, createSandbagBattle, arenaOp, arenaBags, keepSandbags, reviveSandbags,
  fillSp, castNow, rangeTiles, defaultBags, hurtOp, ownTokens, autoTokens, rangeOf, SIM_DATA_FILES, SANDBAG_DEFAULT, SANDBAG_HP, DEFAULT_OP,
  BLOCK_OFFSET, HURT, KEEP_OP, ISLAND_REACH, keepOp,
} from '../public/js/debug/sandbag.js';

const stages = JSON.parse(readFileSync(new URL('../data/stages.json', import.meta.url), 'utf8'));
const sim = { Battle, DataSource: simdata.DataSource, withUnitLoadouts: simdata.withUnitLoadouts };
const ds = simdata.getDefaultSource();
const GUARD = 'chess_char_1_01_a';

/** Run `secs` of the arena the way the page does (keep after every step, revive after every drain); returns the events. */
function run(b, secs) {
  const out = [];
  for (let i = 0; i < Math.round(secs * 30); i++) {
    b.step();
    keepSandbags(b);
    const ev = b.drainEvents();
    reviveSandbags(b, ev);
    out.push(...ev);
  }
  return out;
}
const make = (o = {}) => createSandbagBattle(sim, ds, { stage: arenaStage(o.terrain, stages), chessId: GUARD, ...o });

describe('debug page sandbag arena (public/js/debug/sandbag.js)', () => {
  test('its sim data file list is battle/runner.js SIM_DATA_FILES', () => {
    assert.deepEqual([...SIM_DATA_FILES], [...RUNNER_FILES]);
  });

  test('the island: 7×7 tiles in a 19×21 stage, legends from the real stages', () => {
    const flat = arenaStage('flat', stages);
    assert.equal(flat.rows.length, 19);
    for (const [r, line] of flat.rows.entries()) {
      assert.equal(line.length, 21);
      for (let c = 0; c < 21; c++) assert.equal(line[c], inArena(r, c) ? 'r' : '#', `(${r},${c})`);
    }
    assert.equal((ARENA.r1 - ARENA.r0 + 1) * (ARENA.c1 - ARENA.c0 + 1), 49);
    for (const g of ['#', 'r', 'h']) assert.ok(flat.tiles[g]?.tileKey, `legend ${g}`);
    const high = arenaStage('high', stages);
    assert.notEqual(high.id, flat.id, 'one stage id per terrain (the view rebuilds the board on a new id)');
    assert.equal(high.rows[8].slice(ARENA.c0, ARENA.c1 + 1), 'hhhhhhh');
    assert.equal(high.rows[10].slice(ARENA.c0, ARENA.c1 + 1), 'rrrrrrr');
  });

  test('the sandbag record: huge HP, still, harmless, no abilities, static body', () => {
    const raw = ds.rawEnemy(SANDBAG_DEFAULT);
    const r = sandbagRecord(raw, { def: 300 });
    assert.equal(r.stats.maxHp, SANDBAG_HP);
    assert.equal(r.stats.moveSpeed, 0);
    assert.equal(r.stats.def, 300);
    assert.equal(r.stats.res, 0);
    assert.equal(simdata.normalizeEnemy(r.key, r).dmgType, 'none');
    assert.deepEqual([r.abilities, r.skills], [[], []]);
    assert.equal(r.staticBody, true);
    assert.equal(sandbagRecord(raw, { fixed: false }).staticBody, !!raw.staticBody);
    assert.equal(simdata.normalizeEnemy(r.key, sandbagRecord(raw, { atk: 500 })).dmgType, simdata.normalizeEnemy(raw.key, raw).dmgType);
    assert.equal(raw.stats.moveSpeed > 0, true, 'the data record is left as it was');
  });

  test('the operator fights the sandbag: damage, no leak, no end, the sandbag never attacks or dies', () => {
    const b = make();
    const ev = run(b, 20);
    const op = arenaOp(b);
    assert.ok(op && op.alive && op.deployed, 'operator on the field');
    const bags = arenaBags(b);
    assert.equal(bags.length, 1);
    assert.deepEqual([Math.round(bags[0].y), Math.round(bags[0].x)], [10, 5], 'the sandbag stands on its tile');
    assert.ok(ev.some((e) => e[0] === 'dmg' && e[1] === bags[0].id && e[2] > 0), 'damage on the sandbag');
    assert.ok(!ev.some((e) => e[0] === 'atk' && e[1] === bags[0].id), 'the sandbag never attacks');
    assert.ok(!ev.some((e) => e[0] === 'leak'), 'no leak');
    assert.equal(b.finished, false);
    assert.deepEqual(b.errors, []);
  });

  test('SP auto recovery off: only fillSp / castNow charge and cast the skill', () => {
    let auto = false;
    const b = make({ spAuto: () => auto });
    run(b, 6);
    const op = arenaOp(b);
    assert.ok(op.skill && !op.skill.noSkill);
    assert.equal(op.skill.activations, 0, 'no SP, no cast');
    assert.ok(fillSp(op));
    assert.ok(op.skill.sp >= op.skill.spCost);
    const b2 = make({ spAuto: () => auto });
    run(b2, 1);
    assert.ok(castNow(arenaOp(b2)));
    assert.ok(b2.drainEvents().some((e) => e[0] === 'skill' && e[2] === 1), 'skill started');
    auto = true;
  });

  test('keepSandbags heals below half HP; reviveSandbags brings a killed sandbag back on its tile', () => {
    const b = make({ bags: [{ row: 10, col: 5 }, { row: 9, col: 6 }] });
    run(b, 1);
    const [a] = arenaBags(b);
    a.hp = 10;
    keepSandbags(b);
    assert.equal(a.hp, a.s.maxHp);
    const home = [Math.round(a.spawnY), Math.round(a.spawnX)];
    b.kill(a);
    const ev = run(b, 0.2);
    assert.ok(ev.some((e) => e[0] === 'die' && e[1] === a.id));
    const back = arenaBags(b).find((e) => e.id !== a.id && Math.round(e.y) === home[0] && Math.round(e.x) === home[1]);
    assert.ok(back, 'revived on its tile');
    assert.equal(arenaBags(b).length, 2);
    assert.ok(ev.some((e) => e[0] === 'spawn' && e[1].id === back.id), 'its spawn tuple went out');
  });

  test('a sandbag on the operator tile or off the island is left out', () => {
    const b = make({ op: { row: 10, col: 4 }, bags: [{ row: 10, col: 4 }, { row: 3, col: 3 }, { row: 10, col: 5 }] });
    run(b, 0.5);
    assert.equal(arenaBags(b).length, 1);
  });

  test('defaultBags: the tile in front when the range reaches it, else the operator tile (blocked)', () => {
    const op = { row: 10, col: 4 };
    assert.deepEqual(defaultBags(op, 'RIGHT', [[0, 0], [0, 1]]), [{ row: 10, col: 5 }]);
    assert.deepEqual(defaultBags(op, 'UP', [[0, 0], [0, 1]]), [{ row: 11, col: 4 }]);
    assert.deepEqual(defaultBags(op, 'LEFT', [[0, 0]]), [{ row: 10, col: 4 - BLOCK_OFFSET }]);
    assert.deepEqual(defaultBags({ row: 10, col: 8 }, 'RIGHT', [[0, 0], [0, 1], [1, 0]]), [{ row: 11, col: 8 }], 'front off the island: the nearest range tile');
  });

  test('a protector (block-only range) hits the sandbag blocked on its own tile', () => {
    const id = 'chess_char_1_02_a';
    const grid = ds.rawChess(id).rangeGrid;
    assert.deepEqual(grid, [[0, 0]], `${id} keeps a block-only range (else pick another protector for this test)`);
    const b = make({ chessId: id, bags: defaultBags(DEFAULT_OP, 'RIGHT', grid) });
    const ev = run(b, 10);
    const [bag] = arenaBags(b);
    assert.equal(bag.blockedBy, arenaOp(b), 'blocked by the operator');
    assert.ok(ev.some((e) => e[0] === 'dmg' && e[1] === bag.id), 'hit');
    assert.deepEqual(b.errors, []);
  });

  test('attack option: the sandbag hits the operator from the next tile (unblocked), at its own ATK by default', () => {
    const raw = ds.rawEnemy(SANDBAG_DEFAULT);
    const r = sandbagRecord(raw, { attack: true });
    assert.equal(r.applyWay, 'RANGED');
    assert.equal(r.stats.atk, raw.stats.atk);
    assert.equal(r.stats.rangeRadius, ISLAND_REACH);
    assert.equal(r.proj, null, 'a melee enemy\'s blow flies no shot');
    assert.equal(sandbagRecord(raw, { attack: true, atk: 50 }).stats.atk, 50);
    const b = make({ bag: { attack: true } });
    const ev = run(b, 8);
    const op = arenaOp(b), bag = arenaBags(b)[0];
    assert.equal(bag.blockedBy ?? null, null, 'nobody blocks it');
    assert.ok(ev.some((e) => e[0] === 'atk' && e[1] === bag.id && e[2] === op.id), 'it attacks the operator');
    assert.ok(ev.some((e) => e[0] === 'dmg' && e[1] === op.id && e[2] > 0), 'damage on the operator');
    assert.deepEqual(b.errors, []);
  });

  test('attack option at a far corner: in reach anywhere on the island; keepOp heals the operator below KEEP_OP', () => {
    // a blow of about 40% of the guard's HP (DEF 0 → ATK minus its DEF): the third one takes it under KEEP_OP
    const probe = make();
    probe.step();
    const g = arenaOp(probe).s;
    const b = make({ bag: { attack: true, atk: Math.round(g.maxHp * 0.4 + g.def) }, bags: [{ row: ARENA.r0, col: ARENA.c1 }], op: { row: ARENA.r1, col: ARENA.c0 } });
    let kept = 0, hit = 0;
    for (let i = 0; i < 30 * 15; i++) {
      b.step();
      keepSandbags(b);
      if (keepOp(b)) kept++;
      for (const e of b.drainEvents()) if (e[0] === 'dmg' && e[1] === arenaOp(b)?.id) hit++;
    }
    const op = arenaOp(b);
    assert.ok(hit >= 2, 'hit across the island');
    assert.ok(kept >= 1, 'kept standing');
    assert.ok(op.alive);
    op.hp = op.s.maxHp * KEEP_OP;
    assert.equal(keepOp(b), false, 'not at the threshold');
  });

  test('hurtOp: a medic heals the injured operator; its HP stays above the floor before each blow', () => {
    const b = make({ chessId: 'chess_char_2_02_a', dir: 'LEFT', bags: [{ row: 10, col: 3 }] });
    let next = 0, healed = 0;
    for (let i = 0; i < 30 * 12; i++) {
      b.step();
      if (b.time >= next) { hurtOp(b); next = b.time + HURT.every; }
      for (const e of b.drainEvents()) if (e[0] === 'heal') healed += e[2];
    }
    const op = arenaOp(b);
    assert.ok(op.alive);
    assert.ok(healed > 0, 'the medic healed');
    op.hp = op.s.maxHp * HURT.floor;
    assert.equal(hurtOp(b), 0, 'no blow at the floor');
  });

  test('hand-placed pieces: the operator\'s placeable tokens, a default placement in its limits, deployed in the battle', () => {
    const tokensFile = JSON.parse(readFileSync(new URL('../data/tokens.json', import.meta.url), 'utf8'));
    const backups = JSON.parse(readFileSync(new URL('../data/backups.json', import.meta.url), 'utf8'));
    const list = [...Object.values(tokensFile.tokens ?? tokensFile), ...Object.values(backups.tokens || {})];
    assert.deepEqual(ownTokens('chess_char_2_02_a', list).map((t) => [t.tokenId, t.limit]), [['token_10000_silent_healrb', 1]], '赫默\'s 医疗探机');
    // a 自选 pick's summons are owned by `charId@status` (shared/diy.js diyTokenOwner; the debug page's cfgTokens)
    const wang = ownTokens('char_2027_wang@2/1/4/0', list);
    assert.deepEqual(wang.map((t) => [t.tokenId, t.limit]), [['token_10064_wang_stone1', 7]], '望\'s 7 棋子 (full potential)');
    assert.deepEqual(ownTokens('chess_char_1_01_a', list), [], 'none for an operator without');
    const vigil = ownTokens('chess_char_3_19_a', list);
    assert.equal(vigil[0].ownerRange, true, '狼群: only on the owner\'s attack range');
    const grid = ds.rawChess('chess_char_3_19_a').rangeGrid;
    const placed = autoTokens(DEFAULT_OP, 'RIGHT', grid, vigil, []);
    const range = new Set(rangeOf(DEFAULT_OP, 'RIGHT', grid).map((t) => `${t.row},${t.col}`));
    assert.ok(placed.length === 1 && range.has(`${placed[0].row},${placed[0].col}`));
    const bags = [{ row: 10, col: 5 }];
    const stones = autoTokens(DEFAULT_OP, 'RIGHT', [[0, 0]], wang, bags);
    assert.equal(stones.length, 7);
    assert.ok(!stones.some((t) => (t.row === 10 && t.col === 4) || (t.row === 10 && t.col === 5)), 'not on the operator or a sandbag');
    const b = make({ chessId: 'chess_char_6_diy1_a', diy: { charId: 'char_2027_wang', skillIndex: 0, uniEquipId: null }, bags, tokens: stones });
    run(b, 2);
    // (each placed stone also brings a 跟子 at the battle start since 2026-10-11 — her projectile, not a hand piece)
    const units = b.allyUnits.filter((u) => u.kind === 'token' && !u.mem?.wangFollower);
    assert.equal(units.length, 7);
    assert.ok(units.every((u) => u.deployed && u.ownerUnit === arenaOp(b)), 'deployed, owned by the operator');
    assert.deepEqual(b.errors, []);
  });

  test('rangeTiles: the live range turned to the direction, clipped to the island', () => {
    const b = make({ dir: 'LEFT', op: { row: 10, col: 6 } });
    run(b, 0.5);
    const op = arenaOp(b);
    const tiles = rangeTiles(op, rotateOffset);
    assert.ok(tiles.length > 0);
    for (const [r, c] of tiles) { assert.ok(inArena(r, c)); assert.ok(c <= 6, 'facing left'); }
  });
});
