// test/local-patch-diy-wisdel.test.js — 维什戴尔 (char_1035_wisdel) 선발 kit (server/sim/content/kits/ops/op-wisdel.js):
// the evidence-backed fixes of maintainer's notes 2026-10-07 §3 (maintainer approval 2026-10-07 "all recommended items"):
// D6 the shadow's 0-2 SP go to the shadow, D1 S3 splash 2.5, D2 S3 targets / splashes / aftershocks air units, D3 the
// aftershocks get the main-target ×main_atk_scale, D4 her 残影 leave with her, D5 迷彩 = granted when a shadow comes in with
// her on its x-5 and kept while it lives, D7 shadows target ground only, D8 the S3 first shadow starts with `sp` SP, D11
// S1 stuns every target it hits — and one battle through the real match path.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeBattle, enemyRec } from './helpers/battleHarness.js';
import { diyRecord } from '../shared/diy.js';
import { effectiveProfile } from '../server/sim/ai.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = { chess: JSON.parse(readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8')), backups: JSON.parse(readFileSync(path.join(ROOT, 'data/backups.json'), 'utf8')) };
const CHAR = 'char_1035_wisdel';
const SHADE = 'token_10035_wisdel_wward';
const ENEMY = 'enemy_1422_lrsldr';
const pickOf = (elite, sk) => ({ charId: CHAR, skillIndex: sk, uniEquipId: elite ? 'uniequip_002_wisdel' : null });
const op = ({ tier = 6, elite = true, sk = 0, row = 10, col = 3, ...rest } = {}) => ({ diy: { slot: tier, ...pickOf(elite, sk) }, elite, row, col, uid: 1, ...rest });
const recOf = ({ tier = 6, elite = true, sk = 0 } = {}) => diyRecord(`chess_char_${tier}_diy1_a`, pickOf(elite, sk), { elite, data: DATA });
const POST = enemyRec({ key: 'enemy_post', hp: 1e9, speed: 0, mass: 0 });
const KITE = enemyRec({ key: 'enemy_kite', hp: 1e9, speed: 0, mass: 0, motion: 'FLY' });
/** She alone (skill `sk`), static dummies spawned by the test. */
const arena = (sk, extra = {}) => {
  const h = makeBattle({ seed: 5, timeLimit: 900, autoFinish: false, captureNoisy: true, defs: { enemies: { enemy_post: POST, enemy_kite: KITE } },
    flags: { dpPerSec: 0, dpMax: 999 }, units: [op({ sk, ...extra })] });
  h.step();
  return h;
};
const shadesOf = (h, u) => h.b.allyUnits.filter((a) => a.alive && a.kind === 'token' && a.defId === SHADE && a.ownerUnit === u);

describe('维什戴尔 kit — research 2026-10-07 §3 fixes', () => {
  test('D6: the 0-2 SP after a shadow\'s strike go to the shadow (token_wisdel_skill_end BUFF_OWNER), never to her', () => {
    const h = makeBattle({ seed: 5, timeLimit: 60, captureNoisy: true, units: [op({ sk: 0 })],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 10, interval: 1.5 }, { key: ENEMY, time: 1, route: 1, count: 8, interval: 2 }] });
    h.step();
    const u = h.unit(1);
    let mine = 0, theirs = 0, casts = 0;
    h.b.on('spGain', (c) => {
      if (c.reason === 'talent' && c.unit === u) mine++;
      if (c.reason === 'init' && c.unit.defId === SHADE && h.b.time > 0.5) theirs++;
    });
    h.b.on('skillStart', (c) => { if (c.unit.defId === SHADE) casts++; });
    h.run(40);
    assert.ok(casts >= 3, `the shadow strikes (${casts})`);
    assert.equal(mine, 0, 'no SP from her shadow');
    assert.ok(theirs > 0, 'the shadow refills itself');
    assert.equal(h.b.errors.length, 0);
  });

  test('D1: S3 splash radius 2.5 (projectile_chr_wisdel_s3) — a dummy 2 tiles from the main target takes the splash', () => {
    const h = arena(2);
    const u = h.unit(1);
    const a = h.spawn('enemy_post', { pos: [10, 5] }), b = h.spawn('enemy_post', { pos: [10, 7] });
    u.skill.activate('manual', { free: true });
    assert.equal(effectiveProfile(u).splashRadius, 2.5);
    const splashed = new Set();
    h.b.on('damaged', (c) => { if (c.source === u && c.dmg?.isAttack && c.dmg.isSplash && u.skill.active) splashed.add(c.target); });
    h.runUntil(() => !u.skill.active, 60);
    assert.ok(splashed.has(a) || splashed.has(b), 'the other dummy (2.0 away) is splashed');
    assert.equal(h.b.errors.length, 0);
  });

  test('D2: during S3 she targets an air unit, and her splash and aftershocks hit it (_targetMotion 3)', () => {
    const h = arena(2);
    const u = h.unit(1);
    const kite = h.spawn('enemy_kite', { pos: [10, 5] });
    u.skill.activate('manual', { free: true });
    const got = { main: 0, shock: 0 };
    h.b.on('damaged', (c) => {
      if (c.source !== u || c.target !== kite) return;
      if (c.dmg?.isAttack && !c.dmg.isSplash) got.main++;
      if (c.dmg?.tags?.includes('aftershock')) got.shock++;
    });
    h.runUntil(() => !u.skill.active, 60);
    h.run(2);
    assert.ok(got.main > 0, 'the flyer is her S3 target');
    assert.ok(got.shock > 0, 'her S3 aftershocks hit the flyer');
    // outside S3: ground only
    const before = got.main;
    h.run(10);
    assert.equal(got.main, before, 'no air target without S3');
  });

  test('D3: her aftershocks on the main target are × main_atk_scale too (好礼 「含余震」)', () => {
    const h = arena(0);
    const u = h.unit(1);
    u.skill.sp = 0;
    const post = h.spawn('enemy_post', { pos: [10, 5] });
    const rec = recOf();
    const want = rec.trait.bb['attack@append_atk_scale'] * rec.talents[0].bb['attack@main_atk_scale'];
    const ratios = [];
    h.b.on('hit', (c) => {
      if (c.source === u && c.target === post && c.dmg?.tags?.includes('aftershock') && !u.skill.active) ratios.push(c.dmg.amount * (c.dmg.mul ?? 1) / u.s.atk);
    }, { priority: -100 });
    h.run(6);
    assert.ok(ratios.length > 0, 'aftershocks');
    for (const r of ratios) assert.ok(Math.abs(r - want) < 1e-6, `aftershock ${r} (want ${want})`);
  });

  test('D4: her 残影 vanish when she leaves the field', () => {
    const h = arena(0);
    const u = h.unit(1);
    const post = h.spawn('enemy_post', { pos: [10, 5] });
    const key = `wis:mark:${u.id}`;
    h.runUntil(() => post.buffs.some((b) => b.key === key), 10);
    assert.ok(post.buffs.some((b) => b.key === key), 'marked');
    h.b.retreat(u);
    h.step();
    assert.ok(!post.buffs.some((b) => b.key === key), 'the mark left with her');
  });

  test('D5: 迷彩 when a shadow comes in on her x-5 (not a diagonal 1.4 away), kept while that shadow lives, gone with it', () => {
    // the three tiles next to her in range are taken: the deploy shadow lands diagonally (distance √2 ≤ the old 1.5 test)
    const diag = makeBattle({ seed: 5, timeLimit: 60, autoFinish: false, captureNoisy: true, units: [op({ sk: 0 })] });
    const f = diag.b.isReservedTile.bind(diag.b);
    diag.b.isReservedTile = (r, c, ...a) => ((r === 10 && c === 4) || (r === 11 && c === 3) || (r === 9 && c === 3) ? true : f(r, c, ...a));
    diag.step(); diag.run(1);
    const d = diag.unit(1), ds = shadesOf(diag, d);
    assert.equal(ds.length, 1);
    assert.equal(Math.abs(ds[0].tileR - d.tileR) + Math.abs(ds[0].tileC - d.tileC), 2, 'diagonal');
    assert.ok(!d.s.flags.camou, 'no 迷彩 from a diagonal shadow');

    const h = arena(0);
    h.run(1);
    const u = h.unit(1), [w] = shadesOf(h, u);
    assert.equal(Math.abs(w.tileR - u.tileR) + Math.abs(w.tileC - u.tileC), 1, 'next to her');
    assert.ok(u.s.flags.camou, '迷彩');
    h.run(5);
    assert.ok(u.s.flags.camou, 'kept');
    h.b.retreat(w, { permanent: true });
    h.step();
    assert.ok(!u.s.flags.camou, 'gone with its shadow');
  });

  test('D7: a shadow never strikes an air unit (_targetMotion 1, PRTS 「不可对空」)', () => {
    const h = arena(0);
    const u = h.unit(1);
    h.spawn('enemy_kite', { pos: [10, 5] });
    h.run(1);
    const [w] = shadesOf(h, u);
    w.skill.gainSp(99, 'init');
    let casts = 0;
    h.b.on('skillStart', (c) => { if (c.unit === w) casts++; });
    h.run(15);
    assert.equal(casts, 0, 'no cast with only a flyer in her range');
    const post = h.spawn('enemy_post', { pos: [10, 6] });
    let hitPost = 0;
    h.b.on('damaged', (c) => { if (c.source === w && c.target === post) hitPost++; });
    h.run(2);
    assert.ok(casts >= 1 && hitPost >= 1, 'it strikes the ground enemy');
  });

  test('D8: S3 — the first shadow of the cast starts with `sp` (3) SP, the second with none', () => {
    const h = arena(2);
    const u = h.unit(1);
    h.run(0.5);
    const before = new Set(shadesOf(h, u));
    u.skill.activate('manual', { free: true });
    const fresh = shadesOf(h, u).filter((w) => !before.has(w));
    assert.equal(fresh.length, 2);
    const sp = recOf({ sk: 2 }).skill.bb.sp;
    assert.ok(Math.abs(fresh[0].skill.sp - fresh[1].skill.sp - sp) < 1e-6, `first ${fresh[0].skill.sp}, second ${fresh[1].skill.sp} (sp ${sp})`);
  });

  test('D11: S1 stuns every enemy its attack hits — the splash victims at the hit, not 0.3 s later by an aftershock', () => {
    const h = arena(0);
    const u = h.unit(1);
    u.skill.sp = 0;
    const a = h.spawn('enemy_post', { pos: [10, 5] }), b = h.spawn('enemy_post', { pos: [10, 6] });
    u.skill.gainSp(99, 'init');
    let splashAt = null, victim = null;
    h.b.on('damaged', (c) => {
      if (splashAt == null && c.source === u && c.dmg?.isAttack && c.dmg.isSplash && (c.target === a || c.target === b)) { splashAt = h.b.time; victim = c.target; }
    });
    let stunAt = null;
    h.runUntil(() => {
      if (victim && stunAt == null && victim.s.flags.stun) stunAt = h.b.time;
      return stunAt != null;
    }, 10);
    assert.ok(splashAt != null && stunAt != null, 'a splash victim, stunned');
    assert.ok(stunAt - splashAt < 0.1, `stunned at the hit (${(stunAt - splashAt).toFixed(2)} s after)`);
  });
});

describe('维什戴尔 through the real match path (seats[].diy → Match board → battleInput → BattleSpec → createBattleFromSpec)', () => {
  test('S3 on m04: splash 2.5 / air, the first new shadow with 3 SP, no shadow SP to her, no errors', async () => {
    const T6 = 'chess_char_6_diy1_a';
    const { makeMatch } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: pickOf(true, 2) } }];
    const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    mh.toPrep(3);
    mh.setStage('act2autochess_m04');
    const m = mh.m, ps = mh.ps('p_0');
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const w = ps.acquireChess(T6, { source: 'buy' });
    assert.ok(w, 'her piece');
    assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 10, col: 5 }, dir: 'RIGHT' }).ok);
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    const u = b.allyUnits.find((x) => x.kind === 'op');
    assert.equal(u.def.charId, CHAR);
    let toHer = 0;
    b.on('spGain', (c) => { if (c.unit === u && c.reason === 'talent') toHer++; });
    while (b.time < 3) b.step();
    const before = new Set(b.allyUnits.filter((a) => a.alive && a.defId === SHADE));
    assert.equal(before.size, 1, 'the deploy shadow');
    u.skill.activate('manual', { free: true });
    const prof = effectiveProfile(u);
    assert.equal(prof.splashRadius, 2.5);
    assert.ok(prof.canHitFly && !prof.groundOnly, 'S3 reaches air units');
    const fresh = b.allyUnits.filter((a) => a.alive && a.defId === SHADE && !before.has(a));
    assert.equal(fresh.length, u.skill.bb.max_cnt, 'max_cnt shadows (the normal form: 1)');
    assert.ok(fresh[0].skill.sp >= u.skill.bb.sp - 1e-6, `the first new shadow has ${fresh[0].skill.sp} SP (sp ${u.skill.bb.sp})`);
    while (!b.finished && b.time < 30) b.step();
    assert.equal(toHer, 0);
    assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
    m.dispose?.();
  });

  test('upstream #557 on a solo boss field (m02): her shadows stay on her board — never the 临时整备区 row, no summon when it is full', async () => {
    const T5 = 'chess_char_5_diy1_a';
    const { makeMatch, give } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const { GEO } = await import('../shared/constants.js');
    for (const free of [false, true]) {
      const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T5]: pickOf(false, 2) } }];
      const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
      mh.toPrep(3);
      mh.setStage('act2autochess_m02');
      const m = mh.m, ps = mh.ps('p_0');
      ps.initDiyStock?.(new Set());
      for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
      ps.board.clear(); ps.hand.fill(null); ps.recompute();
      const w = ps.acquireChess(T5, { source: 'buy' });
      assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 9, col: 7 }, dir: 'DOWN' }).ok);
      // her row: every other tile of her range on the board taken but (9, 8) when `free`
      for (const col of [5, 6, 8, 9]) if (!(free && col === 8)) give(m, ps, 'chess_char_1_01_a', 'board', [9, col]);
      const input = ps.battleInput({ side: 'L', colOffset: 0 });
      const spec = buildBattleSpec({ seed: 3, kind: 'boss', modeId: m.modeId, round: m.round, stageId: m.stageId, rect: { ...GEO.BOSS_RECT },
        timeLimit: Infinity, players: [input], battleId: 'lp',
        // one late enemy keeps the field open while she casts
        spawns: [{ time: 500, enemyKey: ENEMY, routeIndex: 0, count: 1, interval: 0 }], routes: [{ motion: 'WALK', start: [2, 10], end: [2, 2], checkpoints: [] }], fieldId: 'b1', content: m.battleContent });
      const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
      b.start();
      const u = b.allyUnits.find((x) => x.kind === 'op' && x.def.charId === CHAR);
      for (let i = 0; i < 200 && !b.finished; i++) b.step();
      assert.ok(!b.finished && u.alive, 'the boss field runs on');
      u.skill.activate('manual', { free: true });
      for (let i = 0; i < 200 && !b.finished; i++) b.step();
      const tiles = shadesOf({ b }, u).map((t) => [t.tileR, t.tileC]);
      assert.deepEqual(tiles, free ? [[2, 8]] : [], `${free ? 'free' : 'full'}: shades ${JSON.stringify(tiles)}`);
      assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
      m.dispose?.();
    }
  });
});
