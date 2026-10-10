// test/local-patch-diy-ascln.test.js — 阿斯卡纶 (char_4132_ascln) 선발 kit (server/sim/content/kits/ops/op-ascln.js): the
// evidence-backed fixes of maintainer's notes 2026-10-07 §4 (maintainer approval 2026-10-07 "all recommended items"):
// A1 AMB-X slow aura, A2 AMB-Y heal on a knock-out, A3 S2 slow on air units, A4 the S2 kill-spread on ground enemies only,
// A5 噬光残影 counts undeployable high ground, A6 S3 hit-rate rolled once per attack, A7 taunt −1 (not −2) — and one battle
// through the real match path.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeBattle, enemyRec } from './helpers/battleHarness.js';
import { diyRecord } from '../shared/diy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = { chess: JSON.parse(readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8')), backups: JSON.parse(readFileSync(path.join(ROOT, 'data/backups.json'), 'utf8')) };
const CHAR = 'char_4132_ascln';
const X = 'uniequip_002_ascln', Y = 'uniequip_003_ascln';
const pickOf = (sk, mod) => ({ charId: CHAR, skillIndex: sk, uniEquipId: mod });
const op = ({ tier = 6, elite = true, sk = 0, mod = elite ? X : null, row = 10, col = 4, ...rest } = {}) => ({ diy: { slot: tier, ...pickOf(sk, mod) }, elite, row, col, uid: 1, ...rest });
const recOf = ({ tier = 6, elite = true, sk = 0, mod = elite ? X : null } = {}) => diyRecord(`chess_char_${tier}_diy1_a`, pickOf(sk, mod), { elite, data: DATA });
const POST = enemyRec({ key: 'enemy_post', hp: 1e9, speed: 0, mass: 0 });
const KITE = enemyRec({ key: 'enemy_kite', hp: 1e9, speed: 0, mass: 0, motion: 'FLY' });
const HITTER = enemyRec({ key: 'enemy_hitter', hp: 1e9, speed: 0, mass: 0, atk: 200, range: 1.5, bat: 0.5 });
const arena = (o = {}) => {
  const h = makeBattle({ seed: 5, timeLimit: 900, autoFinish: false, captureNoisy: true, defs: { enemies: { enemy_post: POST, enemy_kite: KITE, enemy_hitter: HITTER } },
    flags: { dpPerSec: 0, dpMax: 999 }, units: [op(o)] });
  h.step();
  return h;
};
const dreadOf = (u, e) => e.buffs.find((b) => b.key === `ascln:judg:${u.id}`);

describe('阿斯卡纶 kit — research 2026-10-07 §4 fixes', () => {
  test('A1: AMB-X — every enemy of her range, air units too, moves −20 % (hidden talent move_speed)', () => {
    const h = arena({ sk: 0 });
    const u = h.unit(1);
    const post = h.spawn('enemy_post', { pos: [10, 5] }), kite = h.spawn('enemy_kite', { pos: [10, 5] }), far = h.spawn('enemy_post', { pos: [10, 9] });
    const mx = recOf().talents.find((t) => t.index === -1).bb.move_speed;
    h.run(0.5);
    for (const e of [post, kite]) {
      const b = e.buffs.find((x) => x.key === `ascln:ambx#${u.id}`);
      assert.ok(b && Math.abs(b.mods.moveMul - (1 + mx)) < 1e-9, `${e.defId}: ×${1 + mx}`);
    }
    assert.ok(!far.buffs.some((x) => x.key === `ascln:ambx#${u.id}`), 'outside her range: none');
    const y = arena({ sk: 0, mod: Y });
    const p2 = y.spawn('enemy_post', { pos: [10, 5] });
    y.run(0.5);
    assert.ok(!p2.buffs.some((x) => x.key.startsWith('ascln:ambx')), 'AMB-Y: no aura');
  });

  test('A2: AMB-Y stage 3 — an enemy carrying her 死亡拘审 knocked out (by anyone) heals her hp_ratio (10 %) of max HP', () => {
    const h = arena({ sk: 0, mod: Y });
    const u = h.unit(1);
    const ratio = recOf({ mod: Y }).talents[0].bb.hp_ratio;
    assert.equal(ratio, 0.1);
    const post = h.spawn('enemy_post', { pos: [10, 5] });
    h.runUntil(() => !!dreadOf(u, post), 10);
    assert.ok(dreadOf(u, post), 'her 死亡拘审 on it');
    u.hp = u.s.maxHp * 0.5;
    const heals = [];
    h.b.on('heal', (c) => { if (c.target === u) heals.push(c.amount); });
    h.b.dealDamage(null, post, { amount: 1e12, type: 'true' });
    assert.ok(!post.alive);
    assert.ok(heals.some((a) => Math.abs(a - u.s.maxHp * ratio) < 1), `healed ${heals}`);
    // stage 1 (tier 5): no heal
    const t5 = arena({ tier: 5, sk: 0, mod: Y });
    const u5 = t5.unit(1);
    const p5 = t5.spawn('enemy_post', { pos: [10, 5] });
    t5.runUntil(() => !!dreadOf(u5, p5), 10);
    u5.hp = u5.s.maxHp * 0.5;
    let n5 = 0;
    t5.b.on('heal', (c) => { if (c.target === u5) n5++; });
    t5.b.dealDamage(null, p5, { amount: 1e12, type: 'true' });
    assert.equal(n5, 0, 'stage 1: none');
  });

  test('A3: S2 slows air units in her range too (skchr_ascln_2 Aura targetMotion 3)', () => {
    const h = arena({ sk: 1 });
    const u = h.unit(1);
    const kite = h.spawn('enemy_kite', { pos: [10, 5] });
    u.skill.activate('manual', { free: true });
    h.run(0.5);
    assert.ok(kite.buffs.some((b) => (b.status ?? b.key) === 'slow'), 'the flyer is slowed');
  });

  test('A4: S2 kill-spread — a ground enemy knocked out in her range gives one stack to the ground enemies around it, never to a flyer', () => {
    const h = arena({ sk: 1 });
    const u = h.unit(1);
    const dead = h.spawn('enemy_post', { pos: [10, 5] });
    const kite = h.spawn('enemy_kite', { pos: [10, 6] });
    const ground = h.spawn('enemy_post', { pos: [10, 6] });
    u.skill.activate('manual', { free: true });
    h.step();
    const before = dreadOf(u, ground)?.stacks ?? 0;
    h.b.dealDamage(null, dead, { amount: 1e12, type: 'true' });
    assert.ok(!dead.alive);
    assert.ok((dreadOf(u, ground)?.stacks ?? 0) === Math.min(3, before + 1), 'the ground neighbour: +1');
    assert.ok(!dreadOf(u, kite), 'the flyer: none');
  });

  test('A5: 噬光残影 — undeployable high ground next to her counts (CheckHeightTypeInRange: the height only)', () => {
    // flatStage row 8 col 5 = 'A' (HIGH, build NONE); the other neighbours of (9,5) are low road
    const h = arena({ sk: 0, row: 9, col: 5 });
    const u = h.unit(1);
    const t1 = recOf().talents[1].bb;
    const b = u.buffs.find((x) => x.key === 'ascln:aspd');
    assert.ok(b, 'the talent buff');
    assert.equal(b.mods.aspd, t1.attack_speed + t1.attack_speed_add);
    const low = arena({ sk: 0, row: 10, col: 5 });
    assert.equal(low.unit(1).buffs.find((x) => x.key === 'ascln:aspd').mods.aspd, t1.attack_speed, 'no high ground: base only');
  });

  test('A6: S3 hit rate — one roll per enemy attack, every damage instance of it shares the result; one heal per missed attack', () => {
    const h = arena({ sk: 2 });
    const u = h.unit(1);
    const hitter = h.spawn('enemy_hitter', { pos: [10, 5] });
    h.b.addBuff(u, { key: 'test:tough', mods: { defFlat: 1e6 } });
    h.b.addBuff(hitter, { key: 'test:calm', flags: { disarm: true } });
    u.skill.activate('manual', { free: true });
    u.skill.extend?.(400);
    const seen = [];
    h.b.on('hit', (c) => { if (c.source === hitter) seen.push(!!c.dmg.cancel); }, { priority: -100 });
    let heals = 0;
    h.b.on('heal', (c) => { if (c.target === u) heals++; });
    let misses = 0, split = 0;
    const missHeals = [];
    for (let i = 0; i < 300; i++) {
      const attackId = 1e7 + i;
      seen.length = 0;
      const h0 = heals;
      h.b.dealDamage(hitter, u, { amount: 10, type: 'phys', isAttack: true, attackId });
      h.b.dealDamage(hitter, u, { amount: 10, type: 'phys', isAttack: true, attackId });
      if (seen[0] !== seen[1]) split++;
      if (seen[0] && seen[1]) { misses++; missHeals.push(heals - h0); }
    }
    assert.equal(split, 0, 'both instances of an attack agree');
    const rate = misses / 300, want = Math.abs(recOf({ sk: 2 }).skill.bb['attack@damage_hitrate_physical']);
    assert.ok(Math.abs(rate - want) < 0.08, `miss rate ${rate.toFixed(3)} (want ${want})`);
    // (a missed instance never reaches her own dodge roll, which heals too)
    assert.ok(missHeals.every((n) => n === 1), `one heal per missed attack (${[...new Set(missHeals)]})`);
  });

  test('A7: taunt level −1 (data), S3 +2 → +1 — the 伏击客 profile adds no second −1', () => {
    const h = arena({ sk: 2 });
    const u = h.unit(1);
    assert.equal(u.s.taunt, -1);
    u.skill.activate('manual', { free: true });
    h.step();
    assert.equal(u.s.taunt, 1);
    assert.equal(u.s.dodgePhys, recOf({ sk: 2 }).trait.bb.prob, 'the trait dodge stays');
  });
});

describe('阿斯卡纶 through the real match path (seats[].diy → Match board → battleInput → BattleSpec → createBattleFromSpec)', () => {
  test('S2 on m04: taunt −1, the trait dodge, S2 slows the enemies of her range; no errors', async () => {
    const T6 = 'chess_char_6_diy1_a';
    const { makeMatch } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: pickOf(1, null) } }];
    const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    mh.toPrep(3);
    mh.setStage('act2autochess_m04');
    const m = mh.m, ps = mh.ps('p_0');
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const w = ps.acquireChess(T6, { source: 'buy' });
    assert.ok(w, 'her piece');
    assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 10, col: 7 }, dir: 'RIGHT' }).ok);
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    const u = b.allyUnits.find((x) => x.kind === 'op');
    assert.equal(u.def.charId, CHAR);
    b.step();
    assert.equal(u.s.taunt, -1, 'taunt −1');
    assert.ok(u.s.dodgePhys > 0, 'the trait dodge');
    let slowed = 0;
    b.on('statusApplied', (c) => { if (c.source === u && (c.status ?? c.key) === 'slow') slowed++; });
    while (!b.finished && b.time < 40 && !slowed) {
      b.step();
      if (!u.skill.active && u.skill.ready && b.enemiesInKeys(u.rangeKeys, u, { canHitFly: true }).length) u.skill.activate('manual', { free: true });
    }
    assert.ok(slowed > 0, 'S2 slows');
    assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
    m.dispose?.();
  });
});
