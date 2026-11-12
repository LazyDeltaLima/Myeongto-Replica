import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS } from '../../server/sim/content/kits/index.js';
import { diyPool } from '../../shared/diy.js';
import { DOLL_SWITCH } from '../../server/sim/professions.js';
import { S3_CHANGE } from '../../server/sim/content/kits/ops/op-makoto.js';

// 结城理 (char_4217_makoto): the kit server/sim/content/kits/ops/op-makoto.js, rules docs/rules/diy.md 「유키 마코토」.
const C = 'char_4217_makoto';
const S = ['skchr_makoto_1', 'skchr_makoto_2', 'skchr_makoto_3'];
const PUM = 'uniequip_002_makoto';
const data = Object.fromEntries(['chess', 'backups'].map((f) => [f, JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url)))]));
const approx = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-5 * Math.max(1, Math.abs(b)), `${label}: ${a} != ${b}`);
const enemy = (key, opts = {}) => enemyRec({ key, hp: 1e8, atk: 0, speed: 0, ...opts });
const defs = { enemies: { dummy: enemy('dummy'), fly: enemy('fly', { motion: 'FLY' }), weak: enemy('weak', { hp: 1000 }),
  armored: enemy('armored', { def: 3000, res: 0 }), warded: enemy('warded', { def: 0, res: 90 }),
  hitter: enemy('hitter', { atk: 1e6, bat: 1, range: 0 }) } };
const formOf = (tier, elite) => data.backups.units[C].forms[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const bbOf = (form, i) => form.skills[i].bb;
function field({ tier = 6, elite = true, skill = 0, module = null, potential = 6, row = 10, col = 3, dir = 'RIGHT', extra = [] } = {}) {
  const h = makeBattle({ seed: 7, autoFinish: false, timeLimit: 300, defs,
    hooks: ['damaged', 'heal', 'skillStart', 'dollSwap'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: tier, charId: C, skillIndex: skill, uniEquipId: module }, elite, potential, row, col, dir }, ...extra] });
  h.step(); return { h, u: h.unit(1) };
}
function done(h) { checkInvariants(h.b); assert.deepEqual(h.b.errors, []); }
const cast = (h, u) => { u.skill.sp = u.skill.spCost; u.skill.charges = 1; assert.ok(u.skill.activate('test'), 'cast'); };
const toDoll = (h, u) => { cast(h, u); h.run(DOLL_SWITCH + 0.05); assert.ok(u.trait.doll && !u.trait.dollSwitching, 'in the <替身>'); };
const hits = (h, tag) => h.hooksOf('damaged').filter((c) => c.dmg?.tags?.includes(tag));
const ofMe = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);

test('结城理 is selectable with authored skills in both slots, every form and potential; the <本体> is a 2-block physical melee, every skill an instant switch cast on its x-1 box', () => {
  assert.ok(KITTED_CHARS.includes(C));
  for (const tier of [5, 6]) {
    assert.ok(diyPool(tier, { data, kitted: KITTED_CHARS }).includes(C));
    for (const elite of [false, true]) for (const skill of [0, 1, 2]) for (const potential of [1, 6]) {
      const { h, u } = field({ tier, elite, skill, potential });
      assert.equal(u.def.charId, C); assert.equal(u.kit.skillSource, 'skills'); assert.ok(!u.kit.generic);
      assert.equal(u.skill.id, S[skill]); assert.equal(u.skill.kind, 'instant');
      assert.deepEqual([u.profile.dmgType, u.profile.attack, u.profile.canHitFly, u.s.blockCnt, u.base.bat], ['phys', 'melee', false, 2, 1.2]);
      assert.equal(u.skill.rule, 'DEFAULT');
      assert.equal(u.rangeGrid.length, 2, 'range 1-1');
      done(h);
    }
  }
});

test('a cast switches to the <替身> at once: 2 s switch (无敌, no attack), then the persona of the picked skill at full HP — ATK and max HP up by 不羁之力, +0.4 s base attack time, blocks nothing, range x-1; 技力 emptied and 阻回', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) for (const skill of [0, 1, 2]) {
    const { h, u } = field({ tier, elite, skill });
    const f = formOf(tier, elite), t1 = f.talents[0].bb;
    const atk0 = u.s.atk, hp0 = u.s.maxHp;
    cast(h, u);
    assert.ok(u.trait.doll && u.trait.dollSwitching, 'switching');
    assert.ok(u.s.flags.invulnerable && u.s.flags.disarm, 'protected and disarmed while switching');
    assert.equal(u.skill.sp, 0);
    h.run(DOLL_SWITCH + 0.05);
    assert.ok(!u.trait.dollSwitching);
    approx(u.s.atk, atk0 * (1 + t1.atk) / 1, 'ATK +atk');
    approx(u.s.maxHp, hp0 * (1 + t1.max_hp_t1), 'max HP +max_hp_t1');
    approx(u.hp, u.s.maxHp, 'full HP');
    approx(u.s.bat, 1.2 + t1.base_attack_time, 'base attack time + 0.4 s');
    assert.equal(u.s.blockCnt, 0);
    assert.equal(u.rangeGrid.length, 13, 'x-1');
    h.run(5); assert.equal(u.skill.sp, 0, '阻回');
    done(h);
  }
});

test('不羁之力: the switch from the <本体> gives 停顿 for `sluggish` s to every enemy, ground or air, of the x-1 box — the PUM-Y module stage 3 makes it 10 s and ATK +100 %', () => {
  for (const [module, secs] of [[null, 8], [PUM, 10]]) {
    const { h, u } = field({ module });
    const near = h.spawn('dummy', { pos: [10, 5] }), fly = h.spawn('fly', { pos: [9, 4] }), far = h.spawn('dummy', { pos: [10, 6] });
    h.step();
    cast(h, u);
    h.step();
    for (const e of [near, fly]) assert.ok(e.findBuff('sluggish'), 'in the box');
    assert.ok(!far.findBuff('sluggish'), 'outside');
    assert.ok(Math.abs(near.findBuff('sluggish').timeLeft - secs) < 0.1, `duration ${secs}`);
    if (module) approx(u.def.talents[0].bb.atk, 1, 'PUM-Y stage 3: ATK +100 %');
    done(h);
  }
});

test('the PUM-Y trait: the <替身> HP +20 % more (makoto_tr MAX_HP, added to 不羁之力\'s max_hp_t1)', () => {
  const { h, u } = field({ module: PUM });
  const hp0 = u.s.maxHp;
  const t1 = u.def.talents[0].bb;
  toDoll(h, u);
  approx(u.s.maxHp, hp0 * (1 + t1.max_hp_t1 + 0.2), 'max HP');
  done(h);
});

test('a lethal hit on the <本体> also switches (the 傀儡师 trait) — the persona fights the same', () => {
  const { h, u } = field({ skill: 1 });
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  assert.ok(u.alive && u.trait.doll && u.trait.dollSwitching);
  h.run(DOLL_SWITCH + 0.05);
  assert.equal(u.mem.mk.mode, 's2');
  assert.equal(u.profile.maxTargets, 4);
  done(h);
});

test('S1 俄耳甫斯: one ground enemy takes atk_scale × ATK arts; an ally under 50 % HP in range is healed heal_scale × ATK instead', () => {
  const ally = { uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 4, dir: 'RIGHT' };
  const { h, u } = field({ skill: 0, extra: [ally] });
  const b1 = bbOf(formOf(6, true), 0);
  const e = h.spawn('dummy', { pos: [10, 5] });
  toDoll(h, u);
  h.run(4);
  const dealt = ofMe(h, u);
  assert.ok(dealt.length >= 1 && dealt.every((c) => c.type === 'arts' && c.target === e), 'arts on the enemy');
  const a = h.unit(2);
  a.hp = a.s.maxHp * 0.4;
  const healed0 = h.hooksOf('heal').filter((c) => c.source === u).length;
  h.run(4);
  const heals = h.hooksOf('heal').filter((c) => c.source === u && c.target === a);
  assert.ok(heals.length > healed0, 'heals the ally under 50 %');
  approx(heals[0].amount ?? heals[0].raw ?? heals[0].value, u.s.atk * b1['attack@heal_scale'], 'heal amount');
  done(h);
});

test('S2 塔纳托斯: up to 4 ground enemies take atk_scale × ATK arts, each feared `fear` s by chance; a feared enemy below kill_atk_scale × ATK falls (无来源 true damage)', () => {
  const { h, u } = field({ skill: 1 });
  const b2 = bbOf(formOf(6, true), 1);
  const es = [[10, 4], [10, 5], [9, 4], [11, 4], [9, 3]].map((p) => h.spawn('dummy', { pos: p }));
  toDoll(h, u);
  h.run(1.7);
  const first = ofMe(h, u);
  assert.equal(new Set(first.map((c) => c.target)).size, 4, 'four targets');
  assert.ok(first.every((c) => c.type === 'arts'));
  h.run(10);   // (inside the 20 s <替身>)
  assert.ok(es.some((e) => e.findBuff('fear') || h.hooksOf('damaged').some((c) => c.target === e)), 'fear rolled');
  const w = h.spawn('weak', { pos: [10, 4] });
  h.step();
  h.b.applyStatus(w, 'fear', { duration: 5, source: u });
  h.run(0.3);
  assert.ok(!w.alive, 'executed');
  const ex = hits(h, 'execute').find((c) => c.target === w);
  assert.ok(ex && ex.type === 'true' && ex.dmg.sourceless);
  approx(b2['attack@kill_atk_scale'] * u.s.atk > 1000 ? 1 : 0, 1, 'threshold above its HP');
  done(h);
});

test('S3 塔纳托斯: 弱点伤害 on up to 4 enemies, ground or air, with ATTACK_SPEED +talent@attack_speed; a lethal hit switches to 俄耳甫斯 for the rest of the <替身> time: block 2, 闪避 for the operators of the range, heals every second, no attack', () => {
  const ally = { uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 4, dir: 'RIGHT' };
  const { h, u } = field({ skill: 2, extra: [ally] });
  const b3 = bbOf(formOf(6, true), 2);
  const armored = h.spawn('armored', { pos: [10, 5] }), warded = h.spawn('warded', { pos: [9, 4] }), fly = h.spawn('fly', { pos: [11, 4] });
  const aspd0 = u.s.aspd;
  toDoll(h, u);
  approx(u.s.aspd, aspd0 + b3['talent@attack_speed'], 'attack speed');
  h.run(3);
  const by = (e) => ofMe(h, u).filter((c) => c.target === e);
  assert.ok(by(armored).length && by(armored).every((c) => c.type === 'arts'), 'the armoured one takes arts');
  assert.ok(by(warded).length && by(warded).every((c) => c.type === 'phys'), 'the warded one takes physical');
  assert.ok(by(fly).length, 'air too');
  const sub = u.findBuff('trait:substitute'), left = sub.timeLeft;
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  assert.ok(u.alive && u.trait.dollSwitching, 'switching to 俄耳甫斯');
  assert.equal(u.mem.mk.mode, 's3_2');
  assert.equal(S3_CHANGE, 1.5, 'Doll_Skill_3_P1toP2_ChangeBegin 0.5 s + ChangeEnd 1 s');
  assert.ok(Math.abs(u.findBuff('trait:substitute').timeLeft - (left + S3_CHANGE)) < 0.05, 'the switch does not use the <替身> time');
  h.run(S3_CHANGE - 0.1);
  assert.ok(u.trait.dollSwitching, 'still changing');
  h.run(0.15);
  assert.ok(!u.trait.dollSwitching, 'changed after 1.5 s');
  assert.equal(u.s.blockCnt, 2, 'block_cnt');
  const a = h.unit(2);
  assert.ok(a.findBuff('makoto_s3_2_evade') && u.findBuff('makoto_s3_2_evade'), '闪避 for the ally and himself');
  approx(a.s.dodgePhys, b3['attack@prob'], 'phys dodge');
  const n0 = ofMe(h, u).length;
  a.hp = a.s.maxHp * 0.5;
  h.run(2);
  assert.equal(ofMe(h, u).length, n0, 'no attack');
  const heals = h.hooksOf('heal').filter((c) => c.source === u && c.target === a);
  assert.ok(heals.length >= 1, 'heals');
  // a lethal hit as 俄耳甫斯 knocks him out
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  assert.ok(!u.alive || !u.deployed, 'knocked out');
  assert.ok(!a.findBuff('makoto_s3_2_evade'), 'the 闪避 goes with him');
  done(h);
});

test('the <替身> time running out switches back: the <本体> profile and range return, and 1.6 s after the switch starts the 总攻击 strikes every enemy of the x-1 box for atk_scale × ATK true damage (S.E.E.S.队长); a knock-out has none', () => {
  for (const potential of [1, 6]) {
    const { h, u } = field({ skill: 0, potential });
    const t2 = formOf(6, true).talents[1];
    const scale = potential >= t2.potMin ? t2.bb.atk_scale : t2.potBelow.bb.atk_scale;
    const near = h.spawn('dummy', { pos: [11, 3] }), fly = h.spawn('fly', { pos: [8, 3] }), _far = h.spawn('dummy', { pos: [10, 6] });   // outside the box
    toDoll(h, u);
    h.run(u.findBuff('trait:substitute').timeLeft + 0.02);
    assert.ok(!u.trait.doll && u.trait.dollSwitching, 'switching back');
    assert.equal(u.profile.dmgType, 'phys'); assert.equal(u.rangeGrid.length, 2);
    assert.equal(hits(h, 'makoto:t2').length, 0);
    h.run(1.6);
    const all = hits(h, 'makoto:t2');
    assert.deepEqual(new Set(all.map((c) => c.target)), new Set([near, fly]));
    for (const c of all) { assert.equal(c.type, 'true'); approx(c.dmg.amount, u.s.atk * scale, 'atk_scale × ATK'); }
    done(h);
  }
  const { h, u } = field({ skill: 1 });
  h.spawn('dummy', { pos: [11, 3] });
  toDoll(h, u);
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  h.run(3);
  assert.equal(hits(h, 'makoto:t2').length, 0, 'knocked out: no 总攻击');
  done(h);
});

test('结城理 through the real match path (seats[].diy → Match board → battleInput → BattleSpec → createBattleFromSpec): each skill is cast on m04, the persona fights, no errors', async () => {
  const T6 = 'chess_char_6_diy1_a';
  const { makeMatch } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  for (const skillIndex of [0, 1, 2]) {
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: { charId: C, skillIndex, uniEquipId: null } } }];
    const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    mh.toPrep(3);
    mh.setStage('act2autochess_m04');
    const m = mh.m, ps = mh.ps('p_0');
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const w = ps.acquireChess(T6, { source: 'buy' });
    assert.ok(w, 'his piece');
    assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 10, col: 7 }, dir: 'RIGHT' }).ok);
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    const u = b.allyUnits.find((x) => x.kind === 'op');
    assert.equal(u.def.charId, C); assert.equal(u.skill.id, S[skillIndex]);
    let persona = 0;
    b.on('damaged', (c) => { if (c.source === u && u.trait.doll && c.dmg?.isAttack) persona++; });
    while (!b.finished && b.time < 120 && !(u.skill.activations >= 1 && (persona > 0 || skillIndex === 0 && u.trait.doll))) b.step();
    assert.ok(u.skill.activations >= 1, `S${skillIndex + 1} cast`);
    assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
    m.dispose?.();
  }
});
