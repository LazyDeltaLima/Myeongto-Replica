// test/content/op_mitm.test.js — 미틈 (char_4147_mitm, a tier-2 piece of 规程 (act3autochess); kit ops/op-mitm.js) and her 체리 3호 (token_10037_mitm_trshrb): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { BORN, CAR, SKILL_FORM, WASTE } from '../../server/sim/content/kits/ops/op-mitm.js';
import { COLS } from '../../server/sim/constants.js';

const A = 'chess_char_2_17_a', B = 'chess_char_2_17_b';
const FORMS = [A, B];
const S1 = 'skchr_mitm_1', S2 = 'skchr_mitm_2';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const TILE = [10, 6];
const carOf = (h) => h.unit(2);
const wastes = (h) => h.b.allyUnits.filter((t) => t.kind === 'token' && t.defId === CAR && t.mem.mitmWaste);
const hitsOn = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
const withCar = (id, skill, o = {}) => field(id, { skill, others: [{ uid: 2, kind: 'token', tokenId: CAR, ownerUid: 1, row: TILE[0], col: TILE[1] }], ...o });
const carTalent = (id) => ACT3.tokens[CAR].variants[id].talents[0].bb;
const dp = (h) => h.b.getPlayer(h.unit(1).ownerId).dp;

test('체리 3호: the placed piece stands with block_cnt, no heal, its form\'s stats; she keeps it as her 援군', () => {
  for (const id of FORMS) {
    const { h, u } = withCar(id, 1);
    const t = carOf(h), v = ACT3.tokens[CAR].variants[id];
    u.skill.locked = true;
    assert.ok(t.alive);
    assert.equal(t.s.blockCnt, carTalent(id).block_cnt);
    assert.equal(t.base.maxHp, v.stats.maxHp);
    assert.equal(t.base.atk, v.stats.atk);
    assert.ok(t.s.flags.noHeal, 'no heal');
    assert.equal(u.trait.reinforcement, t);
    done(h);
  }
});

test('Each deployment starts in mode Reborn for 1 s: no block, not a target, no attack, her S1 passes it by; a return has spent it already', () => {
  for (const id of FORMS) {
    const { h, u } = withCar(id, 0);
    const t = carOf(h), t0 = h.b.time;
    assert.ok(t.findBuff(BORN), `${id}: trshrb_state_1 casts trshrb_switch at once`);
    for (const f of ['noBlock', 'untargetable', 'invulnerable', 'disarm']) assert.ok(t.s.flags[f], `${id}: ${f}`);
    const onIt = h.spawn('enemy_dummy', { pos: TILE });
    h.step();
    assert.notEqual(onIt.blockedBy, t, `${id}: blocks nothing yet`);
    cast(u);
    h.runUntil(() => !u.skill.active, 0.5);
    assert.ok(t.alive && !h.hooksOf('damaged').some((c) => c.dmg?.tags?.includes('mitm:s1')), `${id}: mitm_s_1 checks mode 1: no blast, no withdrawal`);
    assert.ok(h.runUntil(() => !t.findBuff(BORN), 2), `${id}: mode Default`);
    near(h.b.time - t0, 1, `${id}: the ability's _preDelay (field() has stepped past the deployment)`, 0.05);
    assert.ok(!t.s.flags.noBlock && !t.s.flags.untargetable && !t.s.flags.invulnerable && !t.s.flags.disarm, `${id}: a plain 小车`);
    h.b.kill(t, null);
    const back = carTalent(id).interval + 2;
    assert.ok(h.runUntil(() => t.alive, back), `${id}: back`);
    assert.ok(!t.findBuff(BORN), `${id}: its ReBorn ran off the fight, it fights as it returns`);
    done(h);
  }
});

test('No piece placed: she summons it on a tactical point of her range at her deployment', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    u.skill.locked = true;
    const t = u.trait.reinforcement;
    assert.ok(t?.alive, `${id}: summoned`);
    assert.equal(t.defId, CAR);
    assert.ok(u.rangeKeys.includes(t.tileR * COLS + t.tileC), `${id}: in range`);
    done(h);
  }
});

test('Trait: her attack on an enemy her token blocks has ATK × atk_scale, before DEF; one nobody blocks has ATK', () => {
  for (const id of FORMS) {
    const scale = ACT3.chess[id].trait.bb.atk_scale;
    const { h, u } = withCar(id, 1);
    u.skill.locked = true;
    assert.ok(h.runUntil(() => !carOf(h).findBuff(BORN), 2), `${id}: out of mode Reborn`);
    const blocked = h.spawn('enemy_dummy', { pos: TILE });
    assert.ok(h.runUntil(() => blocked.blockedBy === carOf(h) && hitsOn(h, u, blocked).length > 0, 10), `${id}: hit while blocked`);
    near(hitsOn(h, u, blocked)[0].dmg.amount, u.s.atk * scale, `${id}: ×atk_scale`, 1e-3);
    done(h);
    const b = withCar(id, 1);
    b.u.skill.locked = true;
    const free = b.h.spawn('enemy_dummy', { pos: [9, 6] });
    assert.ok(b.h.runUntil(() => hitsOn(b.h, b.u, free).length > 0, 10), `${id}: hit unblocked`);
    near(hitsOn(b.h, b.u, free)[0].dmg.amount, b.u.s.atk, `${id}: ×1`, 1e-3);
    done(b.h);
  }
});

test('Knock-out: 战术点 for `interval` s, then ReBorn for 1 s, tile kept, back at full HP; the next frame a 残骸 on a free tile around it', () => {
  for (const id of FORMS) {
    const iv = carTalent(id).interval;
    assert.equal(iv, id === A ? 17 : 15, `${id}: the talent of its phase`);
    const { h, u } = withCar(id, 1);
    u.skill.locked = true;
    const t = carOf(h);
    const r = t.tileR, c = t.tileC, t0 = h.b.time;
    h.b.kill(t, null);
    assert.ok(!t.alive && !t.removed, 'its 전술 포인트: waiting');
    assert.equal(wastes(h).length, 0, 'not in the same frame');
    h.step(); h.step();
    const [w] = wastes(h);
    assert.ok(w?.alive, `${id}: 잔해`);
    assert.equal(Math.abs(w.tileR - r) + Math.abs(w.tileC - c), 1, `${id}: one of the four tiles`);
    assert.ok(h.runUntil(() => t.form === 'reborn', iv + 1), `${id}: its ReBorn`);
    near(h.b.time - t0, iv, `${id}: interval`, 0.01);
    assert.ok(!t.alive, `${id}: still off the fight during the clip`);
    assert.ok(h.runUntil(() => t.alive, 2), `${id}: back`);
    near(h.b.time - t0, iv + 1, `${id}: the ability's _preDelay`, 0.01);
    assert.equal(t.form, null, `${id}: its plain clips again`);
    assert.equal(t.tileR, r);
    assert.equal(t.tileC, c);
    assert.equal(t.hp, t.s.maxHp, 'full HP');
    done(h);
  }
});

test('잔해: no attack, ATK and DEF 0, half HP, block_cnt, gone for good when it leaves', () => {
  for (const id of FORMS) {
    const b = carTalent(id);
    const { h, u } = withCar(id, 1);
    u.skill.locked = true;
    const t = carOf(h);
    h.b.kill(t, null);
    h.step(); h.step();
    const [w] = wastes(h);
    assert.ok(w.findBuff(WASTE));
    near(w.s.maxHp, t.base.maxHp * (1 + b['trshrb_t_1[trash_born].max_hp']), `${id}: max HP`, 1e-3);
    assert.equal(w.hp, w.s.maxHp, `${id}: full of its own`);
    assert.equal(w.s.atk, 0);
    assert.equal(w.s.def, 0);
    assert.equal(w.s.blockCnt, b['trshrb_t_1[trash_born].block_cnt']);
    assert.ok(w.profile.noAttack, 'no attack');
    const e = h.spawn('enemy_dummy', { pos: [w.tileR, w.tileC] });
    h.run(3);
    assert.equal(hitsOn(h, w, e).length, 0, 'it never hits');
    h.b.kill(w, null);
    h.run(b.interval + 1);
    assert.ok(!w.alive, `${id}: no 전술 포인트, no return`);
    assert.equal(wastes(h).filter((x) => x.alive).length, 0, `${id}: no new 잔해 from a 잔해`);
    done(h);
  }
});

test('The trait counts on an enemy a 잔해 blocks (the blocker is a token of hers)', () => {
  const id = B, scale = ACT3.chess[id].trait.bb.atk_scale;
  const { h, u } = withCar(id, 1);
  u.skill.locked = true;
  h.b.kill(carOf(h), null);
  h.step(); h.step();
  const [w] = wastes(h);
  const e = h.spawn('enemy_dummy', { pos: [w.tileR, w.tileC] });
  assert.ok(h.runUntil(() => e.blockedBy === w && hitsOn(h, u, e).length > 0, 10));
  near(hitsOn(h, u, e)[0].dmg.amount, u.s.atk * scale, 'on the 잔해\'s enemy', 1e-3);
  done(h);
});

test('S1: +cost DP; at the strike the car explodes on the ground enemies of its x-5, with her ATK, the trait counting, then withdraws: 잔해 after the damage', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1), scale = ACT3.chess[id].trait.bb.atk_scale;
    const { h, u } = withCar(id, 0);
    const t = carOf(h);
    const onIt = h.spawn('enemy_dummy', { pos: TILE }), side = h.spawn('enemy_dummy', { pos: [9, 6] });
    const fly = h.spawn('enemy_fly', { pos: [11, 6] }), far = h.spawn('enemy_dummy', { pos: [10, 8] });
    assert.ok(h.runUntil(() => onIt.blockedBy === t, 5), 'blocked');
    const d0 = dp(h);
    let wasteAtDamage = -1;
    h.b.on('damaged', (c) => { if (c.dmg?.tags?.includes('mitm:s1')) wasteAtDamage = wastes(h).length; });
    cast(u);
    near(dp(h) - d0, b1.cost, `${id}: DP`);
    assert.ok(h.runUntil(() => !t.alive, 5), `${id}: withdrew`);
    const blast = (e) => h.hooksOf('damaged').filter((c) => c.target === e && c.dmg?.tags?.includes('mitm:s1'));
    assert.equal(blast(onIt).length, 1);
    assert.equal(blast(side).length, 1);
    assert.equal(blast(fly).length, 0, 'ground only');
    assert.equal(blast(far).length, 0, 'x-5 only');
    near(blast(onIt)[0].dmg.amount, u.s.atk * b1.aoe_damage_scale * scale, `${id}: blocked ×trait`, 1e-3);
    near(blast(side)[0].dmg.amount, u.s.atk * b1.aoe_damage_scale, `${id}: not blocked`, 1e-3);
    assert.equal(blast(onIt)[0].source, u, 'her damage');
    assert.equal(wasteAtDamage, 0, '잔해 after the damage');
    assert.equal(t.removeReason, 'retreat');
    h.step(); h.step();
    assert.equal(wastes(h).length, 1, `${id}: 잔해`);
    done(h);
  }
});

test('S1 without a car: only the DP', () => {
  const { h, u } = withCar(B, 0);
  const t = carOf(h), b1 = bbOf(B, S1);
  h.b.kill(t, null);
  h.step(); h.step();
  const [w] = wastes(h);
  const e = h.spawn('enemy_dummy', { pos: [w.tileR, w.tileC] });
  h.run(0.3);
  const d0 = dp(h);
  cast(u);
  near(dp(h) - d0, b1.cost, 'DP');
  h.run(3);
  assert.equal(h.hooksOf('damaged').filter((c) => c.target === e && c.dmg?.tags?.includes('mitm:s1')).length, 0, 'no blast');
  assert.ok(w.alive, 'the 잔해 stays');
  done(h);
});

test('S2: ATK +atk, 12 DP over its time; the car stops attacking with block 2 and DEF +def, then withdraws; 잔해 after', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    const { h, u } = withCar(id, 1);
    const t = carOf(h);
    const e = h.spawn('enemy_dummy', { pos: TILE });
    assert.ok(h.runUntil(() => hitsOn(h, t, e).length > 0, 5), `${id}: the car attacks before`);
    const a0 = u.s.atk, d0 = t.s.def, dp0 = dp(h);
    cast(u);
    near(u.s.atk, a0 * (1 + b2.atk), `${id}: ATK`, 1e-2);
    assert.ok(t.findBuff(SKILL_FORM));
    assert.equal(t.s.blockCnt, b2['mitm_s_2[to_token].block_cnt']);
    near(t.s.def, d0 * (1 + b2['mitm_s_2[to_token].def']), `${id}: DEF`, 1e-3);
    h.run(0.1);
    const n = hitsOn(h, t, e).length;
    h.run(5);
    assert.equal(hitsOn(h, t, e).length, n, `${id}: no attack during it`);
    assert.ok(h.runUntil(() => !u.skill.active, 15), `${id}: ends`);
    near(dp(h) - dp0, b2['mitm_s_2[cost].display'], `${id}: DP`);
    assert.ok(!t.alive, `${id}: withdrawn`);
    assert.equal(t.removeReason, 'retreat');
    assert.ok(!t.findBuff(SKILL_FORM));
    h.step(); h.step();
    assert.equal(wastes(h).length, 1, `${id}: 잔해`);
    assert.ok(h.runUntil(() => t.alive, carTalent(id).interval + 1), `${id}: back`);
    assert.equal(t.s.blockCnt, carTalent(id).block_cnt, `${id}: a plain car again`);
    assert.ok(!t.s.flags.disarm);
    done(h);
  }
});

test('S2 with the car in its 전술 포인트: DP and ATK only; it comes back a plain car during the skill and stays after', () => {
  const { h, u } = withCar(B, 1);
  const t = carOf(h);
  h.b.kill(t, null);
  h.run(5); // (the skill runs out before a car knocked out as it starts comes back)
  cast(u);
  assert.ok(!t.findBuff(SKILL_FORM));
  assert.ok(h.runUntil(() => t.alive, 16), 'back');
  assert.ok(u.skill.active, 'during the skill');
  assert.ok(!t.findBuff(SKILL_FORM), 'a plain car');
  h.runUntil(() => !u.skill.active, 15);
  assert.ok(t.alive, 'it stays');
  done(h);
});

test('What the model is told: 전술 포인트, ReBorn, 잔해 and S2 each as a form; her leaving ends a 전술 포인트', () => {
  const { h, u } = withCar(B, 1);
  u.skill.locked = true;
  const t = carOf(h);
  const sent = [];
  const fx = h.b.fx.bind(h.b);
  h.b.fx = (n, o) => { sent.push([n, o]); return fx(n, o); };
  h.b.kill(t, null);
  const tac = sent.find(([n, o]) => n === 'disappear' && o.id === t.id);
  assert.equal(tac?.[1].form, 'tac');
  assert.equal(tac[1].src, u.id, 'her plan draws it');
  h.step(); h.step();
  const waste = sent.find(([n, o]) => n === 'summon' && o.waste);
  assert.ok(waste, '잔해');
  assert.equal(wastes(h)[0].form, 'waste', 'a view built from it starts on Waste');
  h.runUntil(() => t.alive, 20);
  const back = sent.find(([n, o]) => n === 'mitmReborn' && o.id === t.id);
  assert.equal(back?.[1].form, 'reborn');
  assert.ok(!sent.some(([n, o]) => n === 'summon' && o.id === t.id), 'the return is no new summon');
  u.skill.locked = false;
  cast(u);
  assert.ok(sent.some(([n, o]) => n === 'mitmSkill' && o.id === t.id && o.form === 'skill'), 'S2');
  done(h);
  const k = withCar(B, 1);
  k.u.skill.locked = true;
  const c = carOf(k.h);
  k.h.b.kill(c, null);
  k.h.step();
  const out = [];
  const f2 = k.h.b.fx.bind(k.h.b);
  k.h.b.fx = (n, o) => { out.push([n, o]); return f2(n, o); };
  k.h.b.retreat(k.u, { reason: 'retreat' });
  const gone = out.find(([n, o]) => n === 'mitmGone' && o.id === c.id);
  assert.ok(gone, 'its model goes');
  assert.equal(gone[1].form, null);
  assert.equal(c.form, null);
  done(k.h);
});

test('Her leaving takes both with her, no 잔해, no return; her redeployment brings the car', () => {
  const { h, u } = withCar(B, 1);
  u.skill.locked = true;
  const t = carOf(h);
  h.b.kill(t, null);
  h.step(); h.step();
  const [w] = wastes(h);
  assert.ok(h.runUntil(() => t.alive, 16));
  h.b.retreat(u, { reason: 'retreat' });
  assert.ok(!t.alive, 'car off');
  assert.ok(!w.alive, '잔해 off');
  h.run(20);
  assert.ok(!t.alive, 'no return without her');
  assert.equal(wastes(h).filter((x) => x.alive).length, 0);
  assert.ok(h.b.redeploy(u, { free: true }));
  h.step();
  const back = u.trait.reinforcement;
  assert.ok(back?.alive, 'with her');
  assert.deepEqual([back.tileR, back.tileC], TILE, 'on the tile the player chose');
  done(h);
});

test('TAC-Y (elite): the enemies her token blocks have taunt +taunt_level while blocked; none on the normal form', () => {
  const lvl = ACT3.tokens[CAR].variants[B].talents.find((x) => x.bb.taunt_level != null).bb.taunt_level;
  assert.equal(lvl, 1);
  const { h, u } = withCar(B, 1);
  u.skill.locked = true;
  const e = h.spawn('enemy_dummy', { pos: TILE });
  assert.ok(h.runUntil(() => e.blockedBy === carOf(h), 5));
  h.step();
  assert.equal(e.s.taunt, lvl);
  h.b.kill(carOf(h), null);
  h.run(0.5);
  assert.equal(e.s.taunt || 0, 0, 'gone with the block');
  done(h);
  const a = withCar(A, 1);
  a.u.skill.locked = true;
  const e2 = a.h.spawn('enemy_dummy', { pos: TILE });
  a.h.runUntil(() => e2.blockedBy === carOf(a.h), 5);
  a.h.step();
  assert.equal(e2.s.taunt || 0, 0);
  done(a.h);
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_4147_mitm');
});
