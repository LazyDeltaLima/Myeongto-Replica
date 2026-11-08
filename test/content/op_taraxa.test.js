// test/content/op_taraxa.test.js — 타락사쿰 (char_4222_taraxa, a tier-3 piece of 规程 (act3autochess); kit ops/op-taraxa.js): both forms, both skills.
// Run: node --test test/content/op_taraxa.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACT3, field, done, cast, fill, realMatch } from '../helpers/seasonPieces.js';
import { FLY_CLIP } from '../../server/sim/content/kits/ops/op-taraxa.js';
import { evadesGround } from '../../server/sim/targeting.js';
import { skillModeIndex } from '../../shared/skill-modes.js';

const A = 'chess_char_3_06_a', B = 'chess_char_3_06_b';
const FORMS = [A, B];
const S1 = 'skchr_taraxa_1', S2 = 'skchr_taraxa_2';
const skillOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const YAK = 'chess_char_1_02_a';   // a 重装 in her range
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const healsBy = (h, u) => h.hooksOf('heal').filter((c) => c.source === u && !c.opts?.regen);
const hurt = (a, ratio = 0.5) => { a.hp = a.s.maxHp * ratio; };

test('her attack modes: S1 / S2 attack in their FlyLoop mode, its shot and clip (skillModeIndex, attackAnim, shot)', () => {
  const modes = ['Default', 'S1_FlyStart', 'S1_FlyLoop', 'S1_FlyEnd', 'S2_FlyStart', 'S2_FlyLoop', 'S2_FlyEnd'];
  assert.deepEqual([skillModeIndex(modes, 0), skillModeIndex(modes, 1)], [2, 5]);
  for (const id of FORMS) {
    const c = ACT3.chess[id];
    assert.deepEqual(c.attackAnim.skills.map((x) => x.clip), ['Skill_1_Loop', 'Skill_2_Loop'], id);
    assert.deepEqual([c.shot.skills[0].speed, c.shot.skills[1].key, c.shot.skills[1].speed], [0, 'projectile_chr_taraxa_s2_1', 10], id);
  }
  const clips = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8')).chars.char_4222_taraxa.spine.front.animations;
  for (const k of ['Skill_1_Begin', 'Skill_1_End', 'Skill_2_Begin', 'Skill_2_End']) assert.equal(clips[k], FLY_CLIP, k);
});

test('S1 / S2: airborne from the cast (a ground enemy cannot select her), no heal during the clip, down one clip after the skill', () => {
  for (const id of FORMS) for (const skill of [0, 1]) {
    const { h, u } = field(id, { skill, others: [{ uid: 2, chessId: YAK, row: 10, col: 5 }] });
    const ally = h.unit(2);
    hurt(ally, 0.2);
    const e = h.spawn('enemy_biter', { pos: [10, 8] });
    assert.ok(!u.s.flags.liftoff, 'grounded before it');
    h.run(3);   // her swing in progress goes with the cast
    cast(u);
    h.step();
    assert.ok(u.s.flags.liftoff && u.s.flags.blockFly, `${id} ${skill}: 起飞`);
    assert.equal(evadesGround(e, u), true);
    const n0 = healsBy(h, u).length;
    h.run(FLY_CLIP - 0.1);
    assert.equal(healsBy(h, u).length, n0, `${id} ${skill}: no heal in the begin clip`);
    h.run(1.5);
    hurt(ally, 0.2);
    h.run(3);
    assert.ok(healsBy(h, u).length > n0, `${id} ${skill}: heals in the loop`);
    const d = u.skill.timeLeft;
    h.run(d + 0.05);
    assert.equal(u.skill.active, false);
    assert.ok(u.s.flags.liftoff, `${id} ${skill}: still airborne in the end clip`);
    hurt(ally, 0.2);
    const n1 = healsBy(h, u).length;
    h.run(FLY_CLIP - 0.2);
    assert.equal(healsBy(h, u).length, n1, `${id} ${skill}: no heal in the end clip`);
    h.run(0.4);
    assert.ok(!u.s.flags.liftoff, `${id} ${skill}: landed`);
    assert.equal(evadesGround(e, u), false);
    done(h);
  }
});

test('S1 何处着: interval ×attack@base_attack_time, instant heals of attack@heal_scale × ATK on a random injured unit', () => {
  for (const id of FORMS) {
    const bb = skillOf(id, S1).bb;
    const { h, u } = field(id, { skill: 0, seed: 11, others: [{ uid: 2, chessId: YAK, row: 10, col: 5 }, { uid: 3, chessId: YAK, row: 9, col: 5 }] });
    const a = h.unit(2), b = h.unit(3);
    a.s.maxHp = b.s.maxHp = 1e9; a.base.maxHp = b.base.maxHp = 1e9;
    a.hp = 1e8; b.hp = 5e8;
    h.step();
    cast(u);
    h.run(FLY_CLIP + 0.2);
    near(u.s.interval, u.base.bat * bb['attack@base_attack_time'], `${id}: interval`);
    const n0 = healsBy(h, u).length;
    h.run(12);
    const heals = healsBy(h, u).slice(n0);
    assert.ok(heals.length >= 15, `${id}: ${heals.length} heals in 12 s`);
    near(heals[0].amount ?? heals[0].healed ?? u.s.atk * bb['attack@heal_scale'], u.s.atk * bb['attack@heal_scale'], `${id}: amount`);
    const on = new Set(heals.map((c) => c.target.uid));
    assert.ok(on.has(2) && on.has(3), `${id}: random, not always the lowest: ${[...on]}`);
    done(h);
  }
});

test('S2 扶风起: ATK +; air block mode first; a second heal only when that target is airborne; the splash on up to 2 in its 3×3', () => {
  for (const id of FORMS) {
    const bb = skillOf(id, S2).bb;
    // two 风絮: the other takes off by S2 too, so her heal has an airborne target with a higher HP ratio than the ground one
    const { h, u } = field(id, { more: [{ uid: 2, id, row: 10, col: 6 }], others: [{ uid: 3, chessId: YAK, row: 10, col: 5 }, { uid: 4, chessId: YAK, row: 9, col: 6 }, { uid: 5, chessId: YAK, row: 11, col: 6 }, { uid: 6, chessId: YAK, row: 9, col: 5 }], seed: 3 });
    const air = h.unit(2);
    const atk0 = u.s.atk;
    cast(u);
    h.step();
    near(u.s.atk, atk0 * (1 + bb['attack@atk']), `${id}: ATK`);
    h.run(FLY_CLIP + 0.1);
    // no one airborne but her (herself unhurt): the lowest ratio, no second heal
    const y = h.unit(3);
    for (const x of [y, h.unit(4), h.unit(5), h.unit(6)]) { x.s.maxHp = x.base.maxHp = 1e9; x.hp = 9e8; }
    air.s.maxHp = air.base.maxHp = 1e9; air.hp = 1e9;
    y.hp = 1e8;
    h.step();
    const fx = h.battle.fx, splash = [];
    h.battle.fx = function spy(k, o) { if (k === 'taraxaSplash') splash.push(o); return fx.call(this, k, o); };
    let n = healsBy(h, u).length;
    h.runUntil(() => healsBy(h, u).length > n, 6);
    h.run(0.8);
    h.battle.fx = fx;
    const g = healsBy(h, u).slice(n);
    // the flight the render draws (kitofficial.js taraxaSplash): from the unit her heal reached, to the units the splash heals
    assert.ok(splash.length >= 1, `${id}: the splash announced`);
    assert.equal(splash[0].from, y.id, `${id}: the flight starts at her target`);
    assert.deepEqual([...splash[0].tgt].sort(), g.slice(1, 1 + splash[0].tgt.length).map((c) => c.target.id).sort(), `${id}: to the units it heals`);
    assert.equal(g[0].target, y, `${id}: the lowest ratio`);
    near(g[0].amount ?? u.s.atk * bb['attack@heal_scale'], u.s.atk * bb['attack@heal_scale'], `${id}: main heal`);
    assert.ok(g.length <= 1 + bb['attack@splash_num'], `${id}: no second heal on a grounded target`);
    assert.ok(g.slice(1).every((c) => c.opts?.moment === 'projectile_chr_taraxa_s2_2' && Math.max(Math.abs(c.target.tileR - y.tileR), Math.abs(c.target.tileC - y.tileC)) <= 1), `${id}: only its 3×3`);
    assert.equal(g.length, 1 + bb['attack@splash_num'], `${id}: two of the four around it`);
    for (const c of g.slice(1)) near(c.amount ?? u.s.atk * bb['attack@heal_scale_2'], u.s.atk * bb['attack@heal_scale_2'], `${id}: splash heal`);
    // the other 타락사쿰 takes off and is hurt: she goes first though her ratio is the higher, the second heal goes to the lowest other
    fill(air);
    air.skill.activate('test');
    h.step();
    air.hp = 8e8; y.hp = 1e8;
    h.step();
    n = healsBy(h, u).length;
    h.runUntil(() => healsBy(h, u).filter((c) => c.opts?.moment !== 'projectile_chr_taraxa_s2_2').length > healsBy(h, u).slice(0, n).filter((c) => c.opts?.moment !== 'projectile_chr_taraxa_s2_2').length + 1, 8);
    const after = healsBy(h, u).slice(n).filter((c) => c.opts?.moment !== 'projectile_chr_taraxa_s2_2');
    assert.ok(u.skill.spec.attack.heal.pick(h.b, u, [y, air])[0] === air, `${id}: air block mode first, though her HP ratio is the higher`);
    assert.ok(after.some((c) => c.target === air), `${id}: the airborne one is healed`);
    assert.ok(after.some((c) => c.target === y), `${id}: and the second heal the lowest other`);
    done(h);
  }
});

test('T1 定风絮: an ally in her range in air block mode holds 庇护 and block +1, re-judged as it changes; a grounded one and one out of range do not', () => {
  for (const id of FORMS) {
    const t = ACT3.chess[id].talents[0].bb;
    const { h, u } = field(id, { more: [{ uid: 2, id, row: 10, col: 6 }, { uid: 3, id, row: 10, col: 9 }] });
    const inR = h.unit(2), outR = h.unit(3);
    h.step();
    assert.ok(!inR.findBuff('taraxa_t[block]'), `${id}: grounded`);
    const blk = inR.s.blockCnt;
    fill(inR); inR.skill.activate('test');
    fill(outR); outR.skill.activate('test');
    h.step();
    h.step();
    assert.ok(inR.findBuff('taraxa_t[block]'), `${id}: airborne in range`);
    assert.equal(inR.s.blockCnt, blk + t.block_cnt, id);
    near(inR.findBuff('protect').mods.physTakenMul, 1 - t.damage_resistance, `${id}: 庇护`);
    assert.ok(!u.findBuff('taraxa_t[block]'), `${id}: she is grounded`);
    // herself once airborne: her tile is in her range
    cast(u);
    h.step();
    h.step();
    assert.ok(u.findBuff('taraxa_t[block]'), `${id}: herself`);
    assert.equal(outR.s.flags.liftoff, true);
    // the second's own aura reaches the third on its range; a tile out of everyone's range holds none
    inR.skill.end('death');
    h.run(0.1);
    assert.ok(!inR.s.flags.liftoff);
    assert.ok(!inR.findBuff('taraxa_t[block]'), `${id}: re-judged at once`);
    assert.equal(inR.s.blockCnt, blk);
    done(h);
  }
});

test('a real flyer takes no 定风絮: only the block mode counts; she heals as a 守望者 at her base shot', () => {
  const { h, u } = field(A, { skill: 0, others: [{ uid: 2, chessId: YAK, row: 10, col: 5 }] });
  assert.deepEqual([u.profile.dmgType, u.profile.heal.mode, u.def.shot.base.key], ['heal', 'single', 'projectile_chr_taraxa_a']);
  const y = h.unit(2);
  y.hp = y.s.maxHp / 2;
  const n = healsBy(h, u).length;
  h.run(6);
  assert.ok(healsBy(h, u).length > n);
  assert.ok(!y.findBuff('taraxa_t[block]'));
  done(h);
});

test('real match path: her piece fights in a 规程 match', async () => {
  for (const id of FORMS) await realMatch(id, 'char_4222_taraxa');
});
