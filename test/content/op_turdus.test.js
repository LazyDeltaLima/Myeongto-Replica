// test/content/op_turdus.test.js — 우쿠시크 (char_4224_turdus, a tier-3 piece of 规程 (act3autochess); kit ops/op-turdus.js): both forms, both skills.
// Run: node --test test/content/op_turdus.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { S1_BEGIN } from '../../server/sim/content/kits/ops/op-turdus.js';

const A = 'chess_char_3_03_a', B = 'chess_char_3_03_b';
const FORMS = [A, B];
const S1 = 'skchr_turdus_1', S2 = 'skchr_turdus_2';
const YAK = 'chess_char_1_02_a';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const healsBy = (h, u) => h.hooksOf('heal').filter((c) => c.source === u && !c.opts?.regen);
const uids = (g) => g.map((c) => c.target.uid);
const SPOTS = [[10, 5], [11, 5], [12, 5], [12, 6], [12, 7]];

/** Allies on SPOTS with the HP ratios `ratios` (huge HP: nothing fills), she at (10, 4) with HP ratio `self`; uid = 2 + index. */
function line(id, ratios, { self = 1, ...opts } = {}) {
  const others = ratios.map((_, i) => ({ uid: 2 + i, chessId: YAK, row: SPOTS[i][0], col: SPOTS[i][1] }));
  const f = field(id, { ...opts, others });
  const units = ratios.map((_, i) => f.h.unit(2 + i));
  for (const [i, a] of units.entries()) { a.s.maxHp = a.base.maxHp = 1e9; a.hp = 1e9 * ratios[i]; }
  f.u.s.maxHp = f.u.base.maxHp = 1e9;
  f.u.hp = 1e9 * self;
  return { ...f, units };
}

test('Skill_1_Begin is the clip the kit holds for', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8'));
  assert.equal(manifest.chars.char_4224_turdus.spine.front.animations.Skill_1_Begin, S1_BEGIN);
});

test('the trait: max_target units, each jump × chain.atk_scale, the lowest ratio first, no target twice', () => {
  for (const id of FORMS) {
    const tb = ACT3.chess[id].trait.bb, step = tb['chain.atk_scale'];
    assert.equal(tb['chain.max_target'], 3);
    const { h, u } = line(id, [0.1, 0.2, 0.3, 0.4]);
    const atk = u.s.atk;
    h.runUntil(() => healsBy(h, u).length >= 3, 12);
    h.step();
    const g = healsBy(h, u);
    assert.deepEqual(uids(g), [2, 3, 4], id);
    near(g[0].amount, atk, `${id}: the main heal`);
    near(g[1].amount, atk * step, `${id}: one jump`);
    near(g[2].amount, atk * step * step, `${id}: two jumps`);
    done(h);
  }
});

test('T1 on a jump: her own heal × atk_scale_2 and its decay, the rate carries, the next jump keeps it and takes no target of the count', () => {
  for (const id of FORMS) {
    const step = ACT3.chess[id].trait.bb['chain.atk_scale'], up = ACT3.chess[id].talents[0].bb['chain.atk_scale_2'];
    // main (0.05) at (10, 5) → herself (10, 4, ratio 0.2) → (11, 5) → (12, 5); (12, 6) is past the count
    const { h, u } = line(id, [0.05, 0.3, 0.4, 0.5], { self: 0.2 });
    const atk = u.s.atk;
    h.runUntil(() => healsBy(h, u).length >= 4, 12);
    h.step();
    const g = healsBy(h, u);
    assert.deepEqual(uids(g), [2, 1, 3, 4], id);
    near(g[0].amount, atk, `${id}: the main heal`);
    near(g[1].amount, atk * up * step, `${id}: herself, ×up and the jump's decay (PRTS 100% → 114.75% at 135% and 85%)`);
    near(g[2].amount, atk * up * step, `${id}: the free jump keeps the rate`);
    near(g[3].amount, atk * up * step * step, `${id}: then it decays, the up carried`);
    done(h);
  }
});

test('T1 on the main heal: × atk_scale_2 at once, one more unit in the chain, the first jump free', () => {
  for (const id of FORMS) {
    const step = ACT3.chess[id].trait.bb['chain.atk_scale'], up = ACT3.chess[id].talents[0].bb['chain.atk_scale_2'];
    const { h, u } = line(id, [0.3, 0.4, 0.5, 0.6], { self: 0.05 });
    const atk = u.s.atk;
    h.runUntil(() => healsBy(h, u).length >= 4, 12);
    h.step();
    const g = healsBy(h, u);
    assert.deepEqual(uids(g), [1, 2, 3, 4], id);
    near(g[0].amount, atk * up, `${id}: herself`);
    near(g[1].amount, atk * up, `${id}: no decay`);
    near(g[2].amount, atk * up * step, `${id}: decay`);
    near(g[3].amount, atk * up * step * step, `${id}: the third of the count`);
    done(h);
  }
});

test('T1: another 우쿠시크 on the chain counts too (the validators read the buffs)', () => {
  const step = ACT3.chess[B].trait.bb['chain.atk_scale'], up = ACT3.chess[B].talents[0].bb['chain.atk_scale_2'];
  const { h, u } = field(B, { more: [{ uid: 2, id: A, row: 10, col: 6 }], others: [{ uid: 3, chessId: YAK, row: 10, col: 5 }, { uid: 4, chessId: YAK, row: 11, col: 7 }] });
  const other = h.unit(2), m = h.unit(3), n = h.unit(4);
  for (const [a, r] of [[u, 1], [other, 0.2], [m, 0.1], [n, 0.3]]) { a.s.maxHp = a.base.maxHp = 1e9; a.hp = 1e9 * r; }
  const atk = u.s.atk;
  h.runUntil(() => healsBy(h, u).length >= 3, 12);
  h.step();
  const g = healsBy(h, u);
  assert.deepEqual(uids(g).slice(0, 3), [3, 2, 4]);
  near(g[1].amount, atk * up * step, 'the other 우쿠시크');
  near(g[2].amount, atk * up * step, 'free after her');
  done(h);
});

test('S1: ASPD +, no attack during its begin clip, one more unit in the chain', () => {
  for (const id of FORMS) {
    const bb = bbOf(id, S1);
    assert.equal(bb['attack@chain.extra_value'], 1);
    const { h, u } = line(id, [1, 1, 1, 1, 1], { skill: 0 });
    assert.equal(u.skill.id, S1);
    const aspd = u.s.aspd;
    cast(u);
    near(u.skillStateUntil, h.b.time + S1_BEGIN, `${id}: held for the begin clip`);
    h.step();
    assert.equal(u.s.aspd, aspd + bb.attack_speed, `${id}: ASPD`);
    for (const [i, r] of [0.1, 0.2, 0.3, 0.4, 0.5].entries()) h.unit(2 + i).hp = 1e9 * r;
    h.runUntil(() => healsBy(h, u).length >= 4, 12);
    h.step();
    assert.deepEqual(uids(healsBy(h, u)), [2, 3, 4, 5], `${id}: 4 units`);
    u.skill.end('test');
    h.step();
    assert.equal(u.s.aspd, aspd, `${id}: ASPD back`);
    done(h);
  }
});

test('S2: the HP loss at the cast start, never to death, no SP gained, even with nobody hurt', () => {
  for (const id of FORMS) {
    const r = bbOf(id, S2)['turdus_s2[self_damage].hp_ratio'];
    const { h, u } = field(id, { skill: 1 });
    u.hp = u.s.maxHp * 0.8;
    const hp0 = u.hp;
    cast(u);
    near(u.hp, hp0 * (1 - r), `${id}: of the current HP`);
    done(h);
    const low = field(id, { skill: 1 });
    low.u.hp = 1;
    cast(low.u);
    assert.equal(low.u.alive, true, `${id}: not lethal`);
    assert.equal(low.u.hp, 1, `${id}: stays at 1`);
    done(low.h);
  }
});

test('S2: at the OnAttack frame the lowest ratio, then the shot flies; its chain at 100% ATK', () => {
  for (const id of FORMS) {
    const clip = ACT3.chess[id].skills[1].cast;
    assert.deepEqual([clip.mode, clip.clip, clip.hit], ['state', 'Skill_2', 0.6], id);
    const { h, u } = line(id, [0.2, 0.3, 0.4], { skill: 1 });
    const atk = u.s.atk;
    cast(u);
    const t0 = h.b.time;
    assert.equal(healsBy(h, u).length, 0, `${id}: not as it starts`);
    h.runUntil(() => healsBy(h, u).length > 0, 3);
    const at = h.b.time - t0;
    assert.ok(at >= 0.6 && at < 0.6 + 0.1 + 0.05, `${id}: the frame and one tile of flight: ${at}`);
    h.step();
    const g = healsBy(h, u).slice(0, 3);
    assert.deepEqual(uids(g), [2, 3, 4], id);
    near(g[0].amount, atk, `${id}: 100% ATK`);
    near(g[1].amount, atk * ACT3.chess[id].trait.bb['chain.atk_scale'], `${id}: its chain`);
    done(h);
  }
});

test('S2: nobody hurt: it still goes off on someone (a full-HP unit counts), the nearest of equal ratios first', () => {
  const { h, u } = line(B, [1, 1], { skill: 1 });
  cast(u);
  h.run(0.6 + 0.2);
  assert.ok(u.findBuff('turdus_s2[try_camouflage]'), 'the nearest: herself');
  done(h);
});

test('S2: every unit of the chain takes heal_scale × her ATK each second for bonus_duration, the first after 1 s; put on again it restarts', () => {
  for (const id of FORMS) {
    const bb = bbOf(id, S2), scale = bb['turdus_s2[continues_heal].heal_scale'], dur = bb.bonus_duration;
    const { h, u, units } = line(id, [0.2, 0.3], { skill: 1 });
    const atk = u.s.atk;
    cast(u);
    h.runUntil(() => healsBy(h, u).length >= 2, 3);
    const key = `turdus_s2[continues_heal]:${u.id}`;
    for (const a of units) assert.ok(a.findBuff(key), `${id}: on each`);
    const a = units[0];
    assert.ok(Math.abs(a.findBuff(key).timeLeft - dur) < 0.05, `${id}: its time: ${a.findBuff(key).timeLeft}`);
    const onA = () => healsBy(h, u).filter((c) => c.target === a && c.opts?.moment === 'turdus_s2[continues_heal]');
    h.run(0.9);
    assert.equal(onA().length, 0, `${id}: not before 1 s`);
    h.run(0.2);
    assert.equal(onA().length, 1, `${id}: one a second`);
    near(onA()[0].amount, atk * scale, `${id}: heal_scale × ATK`);
    h.run(dur);
    assert.ok(!a.findBuff(key), `${id}: over`);
    assert.ok(onA().length <= Math.ceil(dur), `${id}: ${onA().length} ticks`);
    done(h);
  }
  // the ATK as the buff starts: a later ATK change does not move it
  const { h, u, units } = line(B, [0.2], { skill: 1 });
  const atk = u.s.atk, scale = bbOf(B, S2)['turdus_s2[continues_heal].heal_scale'];
  cast(u);
  h.runUntil(() => units[0].findBuff(`turdus_s2[continues_heal]:${u.id}`), 3);
  h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 1 } });
  h.step();
  const n0 = healsBy(h, u).length;
  h.run(1.1);
  const g = healsBy(h, u).slice(n0).filter((c) => c.target === units[0] && c.opts?.moment);
  assert.equal(g.length, 1);
  near(g[0].amount, atk * scale, 'kept from its start');
  done(h);
});

test('S2 camouflage: on an unblocking unit, off while it blocks, back when it stops, gone with the buff', () => {
  const { h, u, units } = line(B, [0.2], { skill: 1 });
  const a = units[0], dur = bbOf(B, S2).bonus_duration;
  cast(u);
  h.runUntil(() => a.findBuff('turdus_s2[try_camouflage]'), 3);
  assert.ok(!a.findBuff('turdus_s2[camouflage]'), 'its first check is 0.1 s later');
  h.run(0.15);
  assert.ok(a.findBuff('turdus_s2[camouflage]'));
  assert.equal(a.s.flags.camou, true, 'the flag');
  const e = h.spawn('enemy_dummy', { pos: [10, 8] });
  a.blocking.push(e);
  h.run(0.15);
  assert.ok(!a.findBuff('turdus_s2[camouflage]'), 'off while blocking');
  a.blocking.length = 0;
  h.run(0.15);
  assert.ok(a.findBuff('turdus_s2[camouflage]'), 'back');
  h.run(dur);
  assert.ok(!a.findBuff('turdus_s2[try_camouflage]'));
  assert.ok(!a.findBuff('turdus_s2[camouflage]'), 'over');
  done(h);
});

test('real match path: buys, places and fights with no handler error', async () => {
  const u = await realMatch(A, 'char_4224_turdus');
  assert.equal(u.skill.id, S2);
});
