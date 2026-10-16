// test/sim/op-shot.test.js — operators' official projectiles (docs/rules/sim.md 「오퍼레이터 투사체」): data/chess.json
// `shot` (tools/local-extract/op_projectiles.py → tools/build-data.mjs opShot) times an operator's ranged hit — its
// flight at the projectile's own speed, none when the client attack has no projectile — and a medic's heal.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Battle } from '../../server/sim/Battle.js';
import * as simdata from '../../server/sim/simdata.js';
import { opShot } from '../../server/sim/ai.js';
import { TICK } from '../../server/sim/constants.js';
import { arenaStage, createSandbagBattle, arenaOp, keepSandbags } from '../../public/js/debug/sandbag.js';
import { opProjSpeed } from '../../public/js/render/fx/speeds.js';

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

/** Seconds from each of the first attacks of the arena operator to its damage on a sandbag `d` tiles in front. */
function delays(chessId, d, n = 3) {
  const b = createSandbagBattle(sim, ds, { stage, chessId, op: { row: 10, col: 3 }, bags: [{ row: 10, col: 3 + d }], spAuto: () => false });
  const atk = [], dmg = [];
  for (let i = 0; i < 30 * 10 && atk.length < n + 1; i++) {
    b.step(); keepSandbags(b);
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
    for (const d of delays(INSIDE, 3)) assert.ok(near(d, 3 / 10), `隐现 3 tiles at 10/s: ${d}`);
    for (const d of delays(METEOR, 3)) assert.ok(near(d, 3 / 6), `流星 PARACURVE 6 (horizontal): ${d}`);
    for (const d of delays(ANGEL, 3)) assert.equal(d, 0, '能天使: no flight');
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
    let atkT = null, healT = null;
    for (let i = 0; i < 30 * 8 && healT == null; i++) {
      b.step();
      for (const e of b.drainEvents()) {
        if (e[0] === 'atk' && e[1] === med.id && e[2] === snp.id && atkT == null) atkT = b.time;
        if (e[0] === 'heal' && e[1] === snp.id && atkT != null && healT == null) healT = b.time;
      }
    }
    assert.ok(atkT != null && healT != null, 'the medic healed');
    const dist = Math.hypot(snp.x - med.x, snp.y - med.y);
    assert.ok(near(healT - atkT, dist / 5, 2 * TICK), `heal ${healT - atkT} s after the shot, ${dist} tiles at 5/s`);
  });
});
