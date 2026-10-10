// test/local-patch-diy-chen3.test.js — 赤刃明霄陈 (char_1050_chen3) 선발 kit (server/sim/content/kits/ops/op-chen3.js): the
// evidence-backed fixes of research/2026-10-07-diy-kit-diff.md §2 (user approval 2026-10-07 "all recommended items"):
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

  test('S3: the 剑气 leaves when her Skill_3_Begin clip (13 frames, no OnAttack) has played — client BasicSkill.PlayBeginAnimation → EmitProjectile', () => {
    const h = arena(2);
    const u = h.unit(1);
    h.spawn('enemy_post', { pos: [10, 6] });
    u.skill.activate('manual', { free: true });
    const t0 = h.b.time;
    let first = null;
    for (let i = 0; i < 30 && first == null; i++) {
      h.step();
      if (h.eventsOf('fx').some((e) => e[1] === 'chen3Qi' && e[4].id === u.id)) first = h.b.time - t0;
    }
    assert.ok(first != null, 'the 剑气 left');
    // (its first step — and fx — is one sim step after it leaves, as before the change at the cast)
    assert.ok(first >= 13 / 30 - 1e-9 && first <= 13 / 30 + 2 * h.TICK + 1e-9, `the 剑气 left ${first.toFixed(3)} s after the cast (want 0.433)`);
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
});
