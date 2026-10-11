// test/local-patch-diy-chen3.test.js — 赤刃明霄陈 (char_1050_chen3) 선발 kit (server/sim/content/kits/ops/op-chen3.js): the
// evidence-backed fixes of maintainer's notes 2026-10-07 §2 (maintainer approval 2026-10-07 "all recommended items"):
// C1 S2 slashing = stun / freeze immune, blocks nothing, no SP; C2 the post-S2 buff lasts the skill's full 6 s after she
// lands; C3 a slash +1 whenever the target leaves the field (not only on her kill); C7 a dodge does not restart 寒暑觉知's
// clock; C8 its dodge covers every dodgeable physical / arts damage (not attacks only) — and S2 through the real match path.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeBattle, enemyRec } from './helpers/battleHarness.js';
import { diyRecord } from '../shared/diy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = { chess: JSON.parse(readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8')), backups: JSON.parse(readFileSync(path.join(ROOT, 'data/backups.json'), 'utf8')) };
const CHAR = 'char_1050_chen3';
const pickOf = (elite, sk) => ({ charId: CHAR, skillIndex: sk, uniEquipId: elite ? 'uniequip_002_chen3' : null });
const op = ({ tier = 6, elite = true, sk = 0, row = 10, col = 4, ...rest } = {}) => ({ diy: { slot: tier, ...pickOf(elite, sk) }, elite, row, col, uid: 1, ...rest });
const recOf = ({ tier = 6, elite = true, sk = 0 } = {}) => diyRecord(`chess_char_${tier}_diy1_a`, pickOf(elite, sk), { elite, data: DATA });
const POST = enemyRec({ key: 'enemy_post', hp: 1e9, speed: 0, mass: 0 });
const arena = (sk) => {
  const h = makeBattle({ seed: 5, timeLimit: 900, autoFinish: false, captureNoisy: true, defs: { enemies: { enemy_post: POST } },
    flags: { dpPerSec: 0, dpMax: 999 }, units: [op({ sk })] });
  h.step();
  return h;
};
/** She is slashing (S2): her slashing buff (both the old and the new kit hang it). */
const slashing = (u) => !!u.findBuff('chen3:s2:inv');

describe('赤刃明霄陈 kit — research 2026-10-07 §2 fixes', () => {
  test('C1: while S2 slashes she is stun / freeze immune, blocks nothing and gains no SP (chen3_s2[invincible] / [ban_sp])', () => {
    const h = arena(1);
    const u = h.unit(1);
    h.spawn('enemy_post', { pos: [10, 5] });
    u.skill.activate('manual', { free: true });
    h.run(0.5);
    assert.ok(slashing(u), 'slashing');
    assert.equal(h.b.applyStatus(u, 'stun', { duration: 2 }), false, 'stun refused');
    assert.equal(h.b.applyStatus(u, 'freeze', { duration: 2 }), false, 'freeze refused');
    assert.ok(!u.s.flags.stun);
    assert.ok(u.s.flags.noBlock && u.blocking.length === 0, 'blocks nothing');
    assert.ok(u.s.flags.noSp, '阻回');
    h.runUntil(() => !slashing(u), 10);
    assert.ok(!u.s.flags.noBlock && !u.s.flags.noSp, 'lifted when she lands');
    assert.ok(h.b.applyStatus(u, 'stun', { duration: 0.2 }), 'stun again after the slashing');
  });

  test('C2: after the slashes the skill runs its full `duration` (6 s) with ATK + / dodge — not the ~2 s left of a 6 s from the cast', () => {
    const h = arena(1);
    const u = h.unit(1);
    h.spawn('enemy_post', { pos: [10, 5] });
    const dur = recOf({ sk: 1 }).skill.duration;
    u.skill.activate('manual', { free: true });
    h.runUntil(() => !slashing(u), 10);
    const landed = h.b.time;
    assert.ok(landed > 3.9, `10 slashes take 4 s (${landed.toFixed(2)})`);
    assert.ok(u.findBuff('chen3:s2:after'), 'the after-buff');
    let lastBuffed = landed;
    h.runUntil(() => { if (u.findBuff('chen3:s2:after')) lastBuffed = h.b.time; return !u.skill.active; }, 20);
    assert.ok(Math.abs(h.b.time - landed - dur) < 0.1, `the skill ends ${(h.b.time - landed).toFixed(2)} s after she lands (want ${dur})`);
    assert.ok(lastBuffed - landed > dur - 0.1, 'buffed all along');
    assert.ok(!u.findBuff('chen3:s2:after'), 'lifted with the skill');
  });

  test('C3: a target knocked out by someone else between slashes still adds a slash (chen3_s2[dead_listener] ON_OWNER_FINISH)', () => {
    const h = arena(1);
    const u = h.unit(1);
    const a = h.spawn('enemy_post', { pos: [10, 5] });
    h.spawn('enemy_post', { pos: [10, 6] });
    let n = 0, last = null;
    h.b.on('damaged', (c) => { if (c.source === u && c.dmg?.tags?.includes('chen3S2')) { n++; last = c.target; } });
    u.skill.activate('manual', { free: true });
    h.runUntil(() => n >= 3, 5);
    assert.equal(last, a, 'the nearest first');
    h.b.dealDamage(null, a, { amount: 1e12, type: 'true' }); // someone else's kill
    assert.ok(!a.alive);
    h.runUntil(() => !slashing(u), 10);
    assert.equal(n, 11, `10 + 1 slashes (${n})`);
  });

  /** She alone, 寒暑觉知 armed once (its first heal); returns { h, u, src, T, heals }. */
  const armed = () => {
    const h = arena(0);
    const u = h.unit(1);
    const src = h.spawn('enemy_post', { pos: [10, 9] });
    const T = recOf().talents[1].bb.stack_time;
    const heals = [];
    h.b.on('heal', (c) => { if (c.target === u && c.source === u) heals.push(h.b.time); });
    h.runUntil(() => heals.length >= 1, T + 2);
    assert.equal(heals.length, 1);
    h.run(2);
    return { h, u, src, T, heals };
  };

  test('S3: the 剑气 leaves as Skill_3_Begin ends; her attacks are S3 ones from the first (client AbilitySequenceGroup, ActiveBuffAbility _waitForCasting 0, SimpleProjectileEmitter ON_CAST_START)', () => {
    // the client's timing: Skill_3_Begin 13 frames (0.433 s, no attack) → the sequence group casts EmitProjectile, whose
    // emitter fires at ON_CAST_START (the wave) → one tick pre-delay, one tick post-delay → SwitchMode, one tick pre-delay →
    // the S3 mode; SkillState keeps her from attacking until the group ends. 49eb223e…cdc84e33 kept a Default first attack.
    const h = arena(2);
    const u = h.unit(1);
    h.spawn('enemy_post', { pos: [10, 5] });   // in front of her: her own range and the S3 range
    const t0 = h.b.time;
    u.skill.activate('manual', { free: true });
    const swings = [], dmg = [];
    h.b.on('damaged', (c) => { if (c.source === u && c.dmg?.attackId) dmg.push({ id: c.dmg.attackId, t: h.b.time, skill: !!c.dmg.isSkill, tags: c.dmg.tags ?? [] }); });
    let qi = null;
    for (let i = 0; i < 4 * 30; i++) {
      h.step();
      for (const e of h.eventsOf('swing')) if (e[1] === u.id && !swings.some((x) => x.e === e)) swings.push({ e, t: h.b.time });
      if (qi == null && h.eventsOf('fx').some((e) => e[1] === 'chen3Qi' && e[4].id === u.id)) qi = h.b.time - t0;
    }
    assert.ok(swings.length >= 2, `she attacked (${swings.length})`);
    const w0 = swings[0].t - t0;
    assert.ok(w0 >= 13 / 30 + 3 * h.TICK - 1e-9 && w0 <= 13 / 30 + 5 * h.TICK + 1e-9, `no swing before the S3 mode; the first ${w0.toFixed(3)} s after the cast`);
    assert.equal(swings[0].e[4], undefined, 'the first attack\'s swing: the skill clip (Skill_3_Loop)');
    assert.ok(qi != null, 'the 剑气 left');
    // Skill_3_Begin (its first fx comes with the mover's first steps, up to two sim steps after it leaves)
    const leave = 13 / 30;
    assert.ok(qi >= leave - 1e-9 && qi <= leave + 2 * h.TICK + 1e-9, `the 剑气 left ${qi.toFixed(3)} s after the cast (${leave.toFixed(3)})`);
    const ids = [...new Set(dmg.filter((d) => !d.tags.includes('chen3Qi')).map((d) => d.id))];
    const first = dmg.filter((d) => d.id === ids[0]);
    assert.ok(first.length === 3 && first.every((d) => d.skill), `her first attack: the S3 mode (3 skill hits) (${JSON.stringify(first)})`);
    assert.equal(h.b.errors.length, 0);
  });

  test('S3: with enemies only in the S3 range (3-12, outside her own) the 剑气 leaves and the S3 mode comes all the same', () => {
    const h = arena(2);
    const u = h.unit(1);
    h.spawn('enemy_post', { pos: [10, 6] });   // in the S3 range, outside her own (Default range)
    h.step();
    assert.ok(!u.rangeKeySet.has(10 * 21 + 6), 'her own range before the cast');
    u.skill.activate('manual', { free: true });
    const qi = () => h.eventsOf('fx').some((e) => e[1] === 'chen3Qi' && e[4].id === u.id);
    let hits = 0;
    h.b.on('damaged', (c) => { if (c.source === u && c.dmg?.attackId && !(c.dmg.tags ?? []).includes('chen3Qi')) hits++; });
    h.run(0.6);
    assert.ok(qi(), 'the 剑气 left without an attack (技能开启时向前释放)');
    assert.equal(u.skill.spec.attack?.hits, 3, 'the S3 profile');
    assert.ok(u.rangeKeySet.has(10 * 21 + 6), 'the S3 range');
    h.run(2.4);
    assert.ok(hits >= 3, `her S3 attacks reach it (${hits} hits)`);
    h.runUntil(() => !u.skill.active, 40);
    assert.ok(!u.skill.active && u.skill.spec.attack?.hits === 3 && u.skill.spec.targeting?.rangeGrid, 'the spec is put back at the end');
    assert.ok(!u.rangeKeySet.has(10 * 21 + 6), 'her own range again');
    assert.equal(h.b.errors.length, 0);
  });

  test('S3: the 剑气 turns at most once per tick (client ChangeStateWithHighlandBehaviour.OnTick: one _CheckHit → _ChangeDirection a tick)', async () => {
    const { chen3QiAdvance } = await import('../server/sim/content/kits/ops/op-chen3.js');
    const LOW = { height: 'LOW', pass: 'ALL' }, HIGH = { height: 'HIGH', pass: 'NONE' };
    // a dead end: the tile ahead (UP = +row) and the one to its right both highland, the wave 0.25 short of both
    const grid = { inRect: (r, c) => r >= 0 && r <= 9 && c >= 0 && c <= 9, tile: (r, c) => ((r === 6 && c === 5) || (r === 5 && c === 6) ? HIGH : LOW) };
    const st = { x: 5.25, y: 5.25, d: 'UP' };
    assert.equal(chen3QiAdvance(grid, st, 1.5 / 30), 1, 'one turn in the first tick (was 2: UP → RIGHT → DOWN at once)');
    assert.equal(st.d, 'RIGHT');
    assert.ok(Math.abs(st.x - 5.25) < 1e-9 && Math.abs(st.y - 5.25) < 1e-9, 'held in front of the wall it now faces');
    assert.equal(chen3QiAdvance(grid, st, 1.5 / 30), 1, 'the next tick turns again');
    assert.equal(st.d, 'DOWN');
    assert.ok(Math.abs(st.y - (5.25 - 1.5 / 30)) < 1e-9, 'and moves off down');
    assert.equal(chen3QiAdvance(grid, st, 1.5 / 30), 0, 'a free way: no turn');
  });

  test('C8: 寒暑觉知\'s held dodge cancels any dodgeable physical / arts damage — a skill hit too, not attacks only (Evade PHYSICAL_AND_MAGICAL)', () => {
    const { h, u, src } = armed();
    const hp = u.hp;
    assert.equal(h.b.dealDamage(src, u, { amount: 300, type: 'arts', isSkill: true }), 0, 'a skill hit dodged');
    assert.equal(u.hp, hp);
    assert.ok(h.b.dealDamage(src, u, { amount: 300, type: 'arts', isSkill: true }) > 0, 'one dodge only');
  });

  test('C7: a dodge does not restart 寒暑觉知\'s clock (chen3_t2 resets on damage only)', () => {
    const { h, u, src, T, heals } = armed();
    assert.equal(h.b.dealDamage(src, u, { amount: 300, type: 'phys', isAttack: true }), 0, 'an attack dodged');
    h.runUntil(() => heals.length >= 2, T + 4);
    assert.ok(Math.abs(heals[1] - heals[0] - T) < 0.25, `the next heal ${(heals[1] - heals[0]).toFixed(2)} s after the first (want ${T})`);
  });
});

describe('赤刃明霄陈 through the real match path (seats[].diy → Match board → battleInput → BattleSpec → createBattleFromSpec)', () => {
  test('S2 on m04: slashes with the S2 state, lands, then the full duration with the after-buff; no errors', async () => {
    const T6 = 'chess_char_6_diy1_a';
    const { makeMatch } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: pickOf(false, 1) } }];
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
    let slashes = 0, sawState = false, landedAt = null, endedAt = null;
    b.on('damaged', (c) => { if (c.source === u && c.dmg?.tags?.includes('chen3S2')) slashes++; });
    b.on('skillEnd', (c) => { if (c.unit === u && endedAt == null) endedAt = b.time; });
    while (!b.finished && b.time < 60 && endedAt == null) {
      b.step();
      if (slashing(u)) sawState ||= !!(u.s.flags.noBlock && u.s.flags.noSp && u.s.flags.invulnerable);
      else if (sawState && landedAt == null) landedAt = b.time;
    }
    assert.ok(slashes >= 1, `slashes (${slashes}) — round 3's enemies fall fast: the slashing ends with nobody to pass on to`);
    assert.ok(sawState, 'the S2 state while slashing');
    assert.ok(landedAt != null && endedAt != null && Math.abs(endedAt - landedAt - u.skill.duration) < 0.15, `the full ${u.skill.duration} s after landing (${landedAt} → ${endedAt})`);
    assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
    m.dispose?.();
  });

  test('S3 on m04: the 剑气 turns one 90° clockwise step at a time — on the field\'s own corner too (one turn per tick)', async () => {
    const T6 = 'chess_char_6_diy1_a';
    const { makeMatch } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const { chen3QiAdvance } = await import('../server/sim/content/kits/ops/op-chen3.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: pickOf(false, 2) } }];
    const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    mh.toPrep(3);
    mh.setStage('act2autochess_m04');
    const m = mh.m, ps = mh.ps('p_0');
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const w = ps.acquireChess(T6, { source: 'buy' });
    assert.ok(w, 'her piece');
    // (10,7 again: from 49eb223e to the fix of cdc84e33 she sat at 10,5 because the S3 mode waited for a Default attack)
    assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 10, col: 7 }, dir: 'RIGHT' }).ok);
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    // the m04 field's top-right corner: above (12, 9) is the field edge, right of it the 侵入点 (12, 10) — 0.25 short of
    // both, the client turns UP → RIGHT this tick and RIGHT → DOWN the next (the old 4-turn loop did both at once)
    const corner = { x: 9.25, y: 12.25, d: 'UP' };
    assert.equal(b.grid.tile(12, 10).special, 'start', 'a 侵入点 right of the corner');
    assert.equal(chen3QiAdvance(b.grid, corner, 1.5 / 30), 1);
    assert.equal(corner.d, 'RIGHT');
    assert.equal(chen3QiAdvance(b.grid, corner, 1.5 / 30), 1);
    assert.equal(corner.d, 'DOWN');
    b.start();
    const u = b.allyUnits.find((x) => x.kind === 'op');
    assert.equal(u.def.charId, CHAR);
    const qi = [];
    let ticks = 0;
    let casts = 0, on = false;
    const castTick = new Map();
    while (!b.finished && b.time < 90) {
      b.step();
      ticks++;
      const now = !!(u.skill?.active && u.skill.id === 'skchr_chen3_3');
      if (now && !on) { casts++; castTick.set(casts, ticks); }
      on = now;
      for (const e of b.drainEvents()) {
        if (e[0] === 'fx' && e[1] === 'chen3Qi' && e[4].id === u.id) qi.push({ cast: casts, tick: ticks, dir: e[4].dir });
      }
    }
    assert.ok(casts >= 1, 'S3 cast');
    const q1 = qi.find((q) => q.cast === 1);
    assert.ok(q1, 'a 剑气 in the first cast');
    // as Skill_3_Begin (13 ticks) ends, its first fx up to two steps later
    const at = castTick.get(1) + 13;
    assert.ok(q1.tick >= at && q1.tick <= at + 2, `the 剑气 as Skill_3_Begin ends (tick ${q1.tick}, ≈ ${at})`);
    assert.ok(qi.length > 20, `the 剑气 flies (${qi.length} fx)`);
    const DIRS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
    for (let i = 1; i < qi.length; i++) {
      if (qi[i].cast !== qi[i - 1].cast) continue;   // a new cast: a new 剑气 from her facing
      assert.ok(qi[i].tick > qi[i - 1].tick, 'one 剑气 fx a tick at most');
      if (qi[i].dir !== qi[i - 1].dir) assert.equal(qi[i].dir, DIRS[(DIRS.indexOf(qi[i - 1].dir) + 1) % 4], `one clockwise step (tick ${qi[i].tick})`);
    }
    assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
    m.dispose?.();
  });
});

test('S3 automatic cast (maintainer decision 2026-10-11, AutoChessBattleTrigger._DefaultTriggerSkill): a selectable enemy on the rangeId 3-12 box — an air one alone too — and none beyond it (no 攻击距离 added)', () => {
  const FLY = enemyRec({ key: 'enemy_fly', hp: 1e9, speed: 0, mass: 0, motion: 'FLY' });
  for (const [key, pos, casts] of [['enemy_fly', [10, 6], true], ['enemy_post', [10, 8], false]]) {
    const h = makeBattle({ seed: 5, timeLimit: 900, autoFinish: false, captureNoisy: true, defs: { enemies: { enemy_post: POST, enemy_fly: FLY } },
      flags: { dpPerSec: 0, dpMax: 999 }, units: [op({ sk: 2 })], enemies: [{ key, pos }] });
    h.step();
    const u = h.unit(1);
    assert.equal(u.skill.rule, 'DEFAULT');
    assert.equal(u.skill.triggerGrid?.length, 8, 'the 3-12 box');
    u.skill.gainSp(999);
    const cast = h.runUntil(() => u.skill.activations > 0, 1);
    assert.equal(cast, casts, `${key} at ${pos}`);
    assert.equal(h.b.errors.length, 0);
  }
});
