// test/sim/op-shot.test.js — operators' official projectiles (docs/rules/sim.md 「오퍼레이터 투사체」): data/chess.json
// `shot` (tools/local-extract/op_projectiles.py → tools/build-data.mjs opShot) times an operator's ranged hit — its
// flight at the projectile's own speed, none when the client attack has no projectile — and a medic's heal. The flight is
// the board distance from the shooter's muzzle to the target's hit point (docs/rules/sim.md 「투사체의 출발·도착 점」:
// `shot.*.from`, `hitAt`; a point dv up the model stands dv·cos 30° rows back), not unit to unit.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Battle } from '../../server/sim/Battle.js';
import * as simdata from '../../server/sim/simdata.js';
import { opShot } from '../../server/sim/ai.js';
import { TICK } from '../../server/sim/constants.js';
import { arenaStage, createSandbagBattle, arenaOp, keepSandbags } from '../../public/js/debug/sandbag.js';
import { opProjSpeed } from '../../public/js/render/fx/speeds.js';
import { shotFlightOf } from '../../public/js/render/fx/projectiles.js';

const stages = JSON.parse(readFileSync(new URL('../../data/stages.json', import.meta.url), 'utf8'));
const chess = JSON.parse(readFileSync(new URL('../../data/chess.json', import.meta.url), 'utf8'));
const sim = { Battle, DataSource: simdata.DataSource, withUnitLoadouts: simdata.withUnitLoadouts };
const ds = simdata.getDefaultSource();
const stage = arenaStage('flat', stages);

const INSIDE = 'chess_char_1_01_a';   // 隐现: projectile_chr_inside TRACE 10
const ANGEL = 'chess_char_3_01_a';    // 能天使: no projectile in her Default mode
const METEOR = 'chess_char_3_17_a';   // 流星: projectile_arrow PARACURVE 6
const SILENT = 'chess_char_2_02_a';   // 赫默: projectile_silent PARACURVE 5
const LAPPLAND = 'chess_char_2_16_a'; // 拉普兰德: projectile_whitew_atk TRACE 10, Body/Combat without one
const TIPPI = 'chess_char_2_13_a';    // 蒂比 (巡空者, a melee position): projectile_chr_tippi TRACE 10, no Body/Combat

/** The sandbag's hit point (data/enemies.json `hitAt`, as the arena's sandbag battle normalises it). */
let BAG_HIT = null;
/** Seconds from each of the first attacks of the arena operator to its damage on a sandbag `d` tiles in front. */
function delays(chessId, d, n = 3, prep = null) {
  const b = createSandbagBattle(sim, ds, { stage, chessId, op: { row: 10, col: 3 }, bags: [{ row: 10, col: 3 + d }], spAuto: () => false });
  const atk = [], dmg = [];
  for (let i = 0; i < 30 * 10 && atk.length < n + 1; i++) {
    b.step(); keepSandbags(b);
    BAG_HIT ??= b.enemies[0]?.def?.hitAt?.F ?? null;
    if (prep && b.enemies[0]) prep(b.enemies[0]);
    const me = arenaOp(b);
    for (const e of b.drainEvents()) {
      if (!me) continue;
      if (e[0] === 'atk' && e[1] === me.id) atk.push(b.time);
      if (e[0] === 'dmg' && e[5] === me.id && !e[6]) dmg.push(b.time);
    }
  }
  return atk.slice(0, n).map((t) => dmg.find((x) => x >= t - 1e-9) - t);
}
const near = (a, b, tol = TICK + 1e-6) => Math.abs(a - b) <= tol;
const COS30 = Math.cos(Math.PI / 6);
/** A shot of flight time `t` lands on the first step at or after it (it flies from the step after the strike). */
const lands = (d, t) => d >= t - 1e-6 && d <= t + TICK + 1e-6;
/** The board distance of `chessId`'s Default shot facing right at the sandbag `d` tiles in front (muzzle F → its hit point). */
function flight(chessId, d) {
  const [du, dv] = chess[chessId].shot.base.from.F;
  assert.ok(BAG_HIT, 'the sandbag has a hit point');
  return Math.hypot(d - du, (BAG_HIT[1] - dv) * COS30);
}

describe('operator shots (data/chess.json `shot`)', () => {
  test('the data: per attack mode, from the client prefab — a projectile, none, a blocked attack without one', () => {
    assert.equal(chess[INSIDE].shot.base.key, 'projectile_chr_inside');
    assert.equal(chess[INSIDE].shot.base.speed, 10);
    assert.deepEqual(chess[ANGEL].shot.base, { move: 'NONE', speed: 0 }, '能天使 Default: no projectile');
    assert.equal(chess[ANGEL].shot.skills[1].key, 'projectile_angel', 'her S2-3 mode shoots');
    assert.equal(chess[METEOR].shot.base.move, 'PARACURVE');
    assert.equal(chess[LAPPLAND].shot.base.combat, 1);
    // every ranged operator of the pool that attacks was read (吟游者 bards have no attack ability)
    const unread = Object.values(chess).filter((c) => !c.isDiy && c.position === 'RANGED' && c.subProfessionId !== 'bard' && !c.shot).map((c) => c.charId);
    assert.deepEqual([...new Set(unread)], [], 'ranged operators without `shot`');
  });

  test('a shot flies distance / its speed; no projectile = the hit at the strike; a skill mode its own', () => {
    for (const d of delays(INSIDE, 3)) assert.ok(lands(d, flight(INSIDE, 3) / 10), `隐现 3 tiles at 10/s, muzzle → hit point ${flight(INSIDE, 3)}: ${d}`);
    assert.ok(flight(INSIDE, 3) < 2.7, 'her muzzle is ahead of her: shorter than unit to unit');
    for (const d of delays(METEOR, 3)) assert.ok(near(d, flight(METEOR, 3) / 6), `流星 PARACURVE 6 (horizontal): ${d}`);
    for (const d of delays(ANGEL, 3)) assert.equal(d, 0, '能天使: no flight');
    for (const d of delays(TIPPI, 2)) assert.ok(near(d, flight(TIPPI, 2) / 10), `蒂比 shoots (not the 特种 melee default), 2 tiles at 10/s: ${d}`);
  });

  test('the hit point is the target\'s in its attack mode now (守墓石像 Fly); the view flies the same (shotFlightOf)', () => {
    // a sandbag standing in a mode whose hit point is 1.5 tiles higher on its model (as 守墓石像's Fly, data/enemies.json `hitAt.modes`)
    const HIT = { F: [0, 0.5], B: [0, 0.5], modes: { Fly: { F: [0, 2], B: [0, 2] } } };
    const inMode = (mode) => (e) => { if (e.def.hitAt !== HIT) e.def = { ...e.def, hitAt: HIT }; e.mode = mode; };
    const [du, dv] = chess[INSIDE].shot.base.from.F;
    const want = (hv) => Math.hypot(3 - du, (hv - dv) * COS30) / 10;
    for (const d of delays(INSIDE, 3, 3, inMode(null))) assert.ok(lands(d, want(0.5)), `its own hit point: ${d} / ${want(0.5)}`);
    for (const d of delays(INSIDE, 3, 3, inMode('Fly'))) assert.ok(lands(d, want(2)), `the Fly mode's: ${d} / ${want(2)}`);
    // the view (render/fx/projectiles.js shotFlightOf, render/fxgame.js trailShot's flight time): the same ends from the same data
    const STATUE = 'enemy_1172_dugago';
    const enemies = JSON.parse(readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
    const ctx = { lookupDef: (info) => (info.side === 'enemy' ? enemies[STATUE] : chess[info.defId]) };
    const op = { x: 3, y: 10, dir: 'RIGHT', info: { side: 'ally', defId: INSIDE } };
    const foe = { x: 6, y: 10, isEnemy: true, info: { side: 'enemy', defId: STATUE } };
    const hit = enemies[STATUE].hitAt;
    assert.ok(hit.modes?.Fly, 'the statue has a Fly hit point');
    assert.ok(Math.abs(shotFlightOf(ctx, op, foe) - Math.hypot(3 - du, (hit.F[1] - dv) * COS30)) < 1e-9);
    assert.ok(Math.abs(shotFlightOf(ctx, op, foe, 'Fly') - Math.hypot(3 + hit.modes.Fly.F[0] - du, (hit.modes.Fly.F[1] - dv) * COS30)) < 1e-9);
    // facing left (an enemy behind her): her muzzle mirrors
    assert.ok(Math.abs(shotFlightOf(ctx, op, { ...foe, x: 0 }) - Math.hypot(3 - du, (hit.F[1] - dv) * COS30)) < 1e-9, 'mirrored muzzle');
    assert.equal(shotFlightOf({ lookupDef: () => ({}) }, op, foe), null, 'no muzzle in the data: unit to unit');
  });

  test('opShot: the running skill\'s mode, else the Default; an enemy the unit blocks gets the blocked attack (none)', () => {
    const b = createSandbagBattle(sim, ds, { stage, chessId: LAPPLAND, op: { row: 10, col: 3 }, bags: [{ row: 10, col: 4 }], spAuto: () => false });
    for (let i = 0; i < 10; i++) b.step();
    const u = arenaOp(b);
    const foe = b.enemies[0];
    assert.equal(opShot(u, null).speed, 10);
    const was = foe.blockedBy;
    foe.blockedBy = u;
    assert.equal(opShot(u, foe).speed, 0, 'blocked: Body/Combat, no projectile');
    foe.blockedBy = was;
    // the renderer's copy (render/fx/speeds.js): the same mode choice, the blocked case by its guess
    assert.equal(opProjSpeed(chess[ANGEL], {}), 0);
    assert.equal(opProjSpeed(chess[ANGEL], { skillOn: true, skillIndex: 1 }), 30);
    // S1 (no mode, no duration: her next attacks) fires its prefab's own projectile_angel (tools/build-data.mjs opShot)
    assert.equal(opProjSpeed(chess[ANGEL], { skillOn: true, skillIndex: 0 }), 30, 'S1: the skill prefab\'s shot');
    assert.equal(opProjSpeed(chess[LAPPLAND], { blockedNear: true }), 0);
    assert.equal(opProjSpeed({}, {}), null, 'not read: the kind\'s speed');
  });
});

describe('operator shots through the real match path (Match board → BattleSpec → createBattleFromSpec)', () => {
  test('a medic\'s heal lands as its shot reaches the ally (赫默 PARACURVE 5); the battle units carry `shot`', async () => {
    const { makeMatch } = await import('../match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 5 }).start();
    h.toPrep(1);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const put = (chessId, near = null) => {
      const p = ps.acquireChess(chessId, { source: 'buy' });
      assert.ok(p, chessId);
      const at = (r, c) => m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: r, col: c }, dir: 'RIGHT' }).ok;
      if (near) for (const dc of [1, 2, -1]) if (at(near[0], near[1] + dc)) return [near[0], near[1] + dc];
      for (let r = 0; r < 20; r++) for (let c = 0; c < 22; c++) if (at(r, c)) return [r, c];
      return assert.fail(`no tile for ${chessId}`);
    };
    const medAt = put(SILENT);
    put(INSIDE, medAt);
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'shot', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    while (b.waveT0 == null) b.step();
    const med = b.allyUnits.find((u) => u.def.charId === 'char_108_silent');
    const snp = b.allyUnits.find((u) => u.def.charId === 'char_498_inside');
    assert.ok(med && snp, 'both deployed');
    assert.equal(opShot(snp).key, 'projectile_chr_inside');
    assert.equal(opShot(med).move, 'PARACURVE');
    b.drainEvents();
    b.dealDamage(null, snp, { amount: snp.s.maxHp * 0.5, type: 'true', canDodge: false, sourceless: true, tags: ['test'] });
    let atkT = null, healT = null, healBy;
    for (let i = 0; i < 30 * 8 && healT == null; i++) {
      b.step();
      for (const e of b.drainEvents()) {
        if (e[0] === 'atk' && e[1] === med.id && e[2] === snp.id && atkT == null) atkT = b.time;
        if (e[0] === 'heal' && e[1] === snp.id && atkT != null && healT == null) { healT = b.time; healBy = e[3]; }
      }
    }
    assert.ok(atkT != null && healT != null, 'the medic healed');
    assert.equal(healBy, med.id, "the 'heal' names its healer (render/fxgame.js healHit plays the shot's hit by it)");
    // muzzle → hit point on the board: the medic faces right (her deploy side) at an ally on her row to her right
    assert.ok(snp.y === med.y && snp.x > med.x, `the sniper beside her on the right: (${snp.x}, ${snp.y}) / (${med.x}, ${med.y})`);
    const [du, dv] = med.def.shot.base.from.F, [hu, hv] = snp.def.hitAt.F;
    const dist = Math.hypot(snp.x + hu - med.x - du, (hv - dv) * COS30);
    assert.ok(near(healT - atkT, dist / 5, TICK), `heal ${healT - atkT} s after the shot, ${dist} tiles at 5/s`);
  });
});
