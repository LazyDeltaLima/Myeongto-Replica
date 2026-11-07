import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS } from '../../server/sim/content/kits/index.js';
import { diyPool } from '../../shared/diy.js';
import { COLS } from '../../server/sim/constants.js';
const C = 'char_4247_oxi';
const data = Object.fromEntries(['chess', 'backups'].map((f) => [f, JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url)))]));
const approx = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-5 * Math.max(1, Math.abs(b)), `${label}: ${a} != ${b}`);
const enemy = (key, opts = {}) => enemyRec({ key, hp: 1e8, atk: 0, speed: 0, ...opts });
const defs = { enemies: { dummy: enemy('dummy'), fly: enemy('fly', { motion: 'FLY' }), walker: enemy('walker', { speed: 1 }),
  hitter: enemy('hitter', { atk: 500, bat: 1, range: 0 }), archer: enemy('archer', { atk: 500, bat: 1, range: 3, dmgType: 'arts' }) } };
const formOf = (tier, elite) => data.backups.units[C].forms[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
function field({ tier = 6, elite = true, skill = 0, potential = 6, dir = 'RIGHT', row = 10, col = 3, flags = {} } = {}) {
  const h = makeBattle({ seed: 31, autoFinish: false, timeLimit: 300, defs, flags,
    hooks: ['damaged', 'attack', 'elementBurst', 'skillStart', 'heal'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: tier, charId: C, skillIndex: skill }, elite, potential, row, col, dir }] });
  h.step(); return { h, u: h.unit(1) };
}
function done(h) { checkInvariants(h.b); assert.deepEqual(h.b.errors, []); }
const hits = (h, tag) => h.hooksOf('damaged').filter((c) => c.dmg?.tags?.includes(tag));
const noSp = (u) => { u.skill.sp = 0; u.skill.charges = 0; };

test('塔露拉 is selectable with authored skills in both slots, every form and potential', () => {
  assert.ok(KITTED_CHARS.includes(C));
  for (const tier of [5, 6]) {
    assert.ok(diyPool(tier, { data, kitted: KITTED_CHARS }).includes(C));
    for (const elite of [false, true]) for (const skill of [0, 1, 2]) for (const potential of [1, 6]) {
      const { h, u } = field({ tier, elite, skill, potential });
      assert.equal(u.def.charId, C); assert.equal(u.kit.skillSource, 'skills'); assert.ok(!u.kit.generic);
      assert.equal(u.skill.id, `skchr_oxi_${skill + 1}`);
      // 绝不妥协 「攻击造成法术伤害」; 2 blocks, 1.2 s, no air
      assert.deepEqual([u.profile.dmgType, u.profile.canHitFly, u.s.blockCnt, u.base.bat], ['arts', false, 2, 1.2]);
      // S2 is never auto-cast (NeverTrigger: the guard manager casts it); S1 keeps the data's rule; S3 an enemy on the field
      assert.equal(u.skill.rule, ['DEFAULT', 'NEVER', 'GDGLOW_SKILL_2'][skill]);
      assert.equal(u.skill.maxCharges, skill === 1 ? 5 : 1);
      assert.equal(u.skill.kind, ['instant', 'charges', 'duration'][skill]);
      done(h);
    }
  }
});

test('绝不妥协: each non-DoT arts damage she deals adds 13 % (11 % below potential 5) of it as 灼燃损伤; phys, element, DoT ones add none', () => {
  for (const potential of [1, 6]) {
    const { h, u } = field({ potential });
    const e = h.spawn('dummy', { pos: [10, 7] });
    u.mem.oxiArcane.n = 0; u.mem.oxiArcane.recent = Infinity;
    const ratio = potential >= 5 ? 0.13 : 0.11;
    approx(h.b.dealDamage(u, e, { amount: 1000, type: 'arts' }), 1000);
    approx(e.elem.burn, 1000 * ratio, 'arts');
    h.b.dealDamage(u, e, { amount: 1000, type: 'phys' });
    h.b.dealDamage(u, e, { amount: 1000, type: 'arts', tags: ['dot'] });
    h.b.dealDamage(u, e, { amount: 1000, type: 'elemental', element: 'burn' });
    approx(e.elem.burn, 1000 * ratio, 'no others');
    done(h);
  }
});

test('绝不妥协 奥术: no stack for 3 s after deployment, then one every 0.5 s to 6 (5 % × … below potential 5 is 15 % / 2.5 %: 6 too); ×(1 + 3 % × stacks) on arts and element damage; a normal attack takes one and restarts the 3 s, a skill attack does not', () => {
  for (const potential of [1, 6]) {
    const { h, u } = field({ potential, skill: 2 });
    noSp(u);
    const a = u.mem.oxiArcane, step = potential >= 5 ? 0.03 : 0.025;
    h.run(2.9); assert.equal(a.n, 0, 'idle delay');
    h.run(0.2); assert.equal(a.n, 1, 'the first stack as the 3 s marker ends');
    h.run(0.5); assert.equal(a.n, 2, '0.5 s later');
    h.run(10); assert.equal(a.n, 6, 'max = round(arcane_max / arcane_step)');
    const e = h.spawn('dummy', { pos: [10, 9] });
    approx(h.b.dealDamage(u, e, { amount: 1000, type: 'arts' }), 1000 * (1 + step * 6), 'arts');
    approx(h.b.dealDamage(u, e, { amount: 1000, type: 'elemental', element: 'burn' }), 1000 * (1 + step * 6), 'elemental');
    approx(h.b.dealDamage(u, e, { amount: 1000, type: 'phys' }), 1000, 'phys');
    approx(h.b.dealDamage(u, e, { amount: 1000, type: 'arts', tags: ['dot'] }), 1000, 'dot');
    h.b.emit('attack', { attacker: u, targets: [e], isSkill: true }); assert.equal(a.n, 6, 'a skill attack');
    h.b.emit('attack', { attacker: u, targets: [e], isSkill: false }); assert.equal(a.n, 5, 'a normal attack');
    h.run(2.9); assert.equal(a.n, 5, 'restarted idle delay');
    h.run(0.7); assert.equal(a.n, 6);
    assert.ok(h.b.dealDamage(u, e, { amount: 1, type: 'arts' }) > 0);
    done(h);
  }
  // in a fight she attacks every 1.2 s: the stacks fall to 0 and stay there
  const { h, u } = field({ skill: 2 }); noSp(u);
  h.run(8); assert.equal(u.mem.oxiArcane.n, 6);
  h.spawn('dummy', { pos: [10, 4] }); h.run(12);
  assert.ok(h.hooksOf('attack').filter((c) => c.attacker === u).length >= 6);
  assert.equal(u.mem.oxiArcane.n, 0); done(h);
});

test('我即火焰: a 灼燃 burst of any enemy while she is deployed leaves 4 s footprints (3 s below potential 3) on the ground tiles it stands on for 5 s; a ground enemy on one takes 15 % (12 %) ATK arts every 0.3 s', () => {
  for (const potential of [1, 6]) {
    const { h, u } = field({ potential, skill: 2 }); noSp(u);
    const e = h.spawn('dummy', { pos: [10, 8] });
    const fly = h.spawn('fly', { pos: [10, 8] });
    h.b.dealDamage(null, e, { amount: 1e5, type: 'element', element: 'burn' });
    assert.equal(h.hooksOf('elementBurst').length, 1);
    const tb = h.b.time;
    h.step();
    const f = u.mem.oxiField, key = 10 * COLS + 8;
    assert.deepEqual([...f.tiles.keys()], [key]);
    h.run(1.25);
    const ticks = hits(h, 'oxi:field');
    assert.ok(ticks.every((c) => c.target === e && c.dmg.type === 'arts' && c.dmg.tags.includes('dot')), 'ground only, a DoT');
    assert.equal(ticks.length, 4, 'every 0.3 s from its entry');
    approx(ticks[0].dmg.amount, u.s.atk * (potential >= 3 ? 0.15 : 0.12));
    assert.ok(!fly.s.flags.fear);
    // the trail re-leases every 0.5 s until 5 s after the burst (the last at 4.5 s); a footprint lasts field_duration after it
    // its 'zone' carries n 1 on the newly leased tile only (the lease's castedTimeThreshold 1 sound — audio.js)
    const zones = h.eventsOf('fx').filter((x) => x[1] === 'zone' && x[4]?.id === u.id);
    assert.ok(zones.length >= 2, 're-leased');
    assert.deepEqual(zones.map((x) => x[4].n ?? 0), [1, ...zones.slice(1).map(() => 0)]);
    const last = tb + 4.5 + (potential >= 3 ? 4 : 3);
    h.run(last - 0.2 - h.b.time);
    assert.equal(f.tiles.size, 1, 'still there');
    h.run(0.4);
    assert.equal(f.tiles.size, 0, 'gone');
    done(h);
  }
});

test('我即火焰: a walking burning enemy leaves a footprint on each tile; at most 25 (new ones refused); an enemy that leaves them stops burning; a stealthed one is not hit; all go when she leaves', () => {
  const { h, u } = field({ skill: 2 }); noSp(u);
  const f = u.mem.oxiField;
  const w = h.spawn('walker', { pos: [10, 9] });
  h.b.dealDamage(null, w, { amount: 1e5, type: 'element', element: 'burn' });
  h.run(3);
  assert.ok(f.tiles.size >= 2, `a trail: ${f.tiles.size}`);
  for (const k of f.tiles.keys()) assert.ok(h.b.grid.groundPassable(Math.floor(k / COLS), k % COLS, true));
  // capacity
  for (let i = 0; i < 40; i++) f.tiles.set(1000 + i, h.b.time + 10);
  const before = new Set(f.tiles.keys());
  h.run(1);
  assert.ok([...f.tiles.keys()].every((k) => before.has(k)), 'full: no new footprint');
  f.tiles.clear();
  // stealth
  const s = h.spawn('dummy', { pos: [11, 8] });
  h.b.addBuff(s, { key: 'test:hide', flags: { stealth: true } });
  f.tiles.set(11 * COLS + 8, h.b.time + 3);
  const n0 = hits(h, 'oxi:field').filter((c) => c.target === s).length;
  h.run(1);
  assert.equal(hits(h, 'oxi:field').filter((c) => c.target === s).length, n0, 'stealthed: not selected');
  // she leaves
  f.tiles.set(11 * COLS + 8, h.b.time + 3);
  h.b.kill(u, null, { reason: 'test' });
  h.step();
  assert.equal(f.tiles.size, 0); assert.equal(f.trails.size, 0);
  done(h);
});

test('我即火焰: no footprint for a burst while she is not on the field, nor for another element', () => {
  const { h, u } = field({ skill: 2 }); noSp(u);
  const e = h.spawn('dummy', { pos: [10, 8] });
  h.b.dealDamage(null, e, { amount: 1e5, type: 'element', element: 'neural' });
  h.step(); assert.equal(u.mem.oxiField.trails.size, 0);
  done(h);
});

test('S1 照霎白夜: the next attack strikes every ground enemy on the target tile for 400 % / 490 % ATK arts and fears them 2 / 2.5 s', () => {
  for (const elite of [false, true]) {
    const { h, u } = field({ elite, skill: 0 });
    const a = h.spawn('dummy', { pos: [10, 4] }), b = h.spawn('dummy', { pos: [10, 4] }), c = h.spawn('dummy', { pos: [10, 5] });
    const fly = h.spawn('fly', { pos: [10, 4] });
    u.skill.gainSp(999, 'init');
    assert.ok(h.runUntil(() => hits(h, 'oxi:s1').length > 0 || u.skill.activations > 0 && !u.skill.pending, 5));
    h.run(0.1);
    const bb = formOf(6, elite).skills[0].bb;
    const s1 = h.hooksOf('damaged').filter((x) => x.source === u && x.dmg?.isSkill && x.type === 'arts');
    assert.deepEqual(new Set(s1.map((x) => x.target)), new Set([a, b]), 'the tile, ground only');
    for (const x of s1) approx(x.dmg.amount, u.s.atk * bb.atk_scale);
    for (const e of [a, b]) assert.ok(e.s.flags.fear, 'fear');
    assert.ok(!c.s.flags.fear && !fly.s.flags.fear);
    h.run(bb.fear + 0.1);
    assert.ok(!a.s.flags.fear, 'fear ends');
    done(h);
  }
});

test('S2 阂断骤雪: an enemy attack casts it (a charge) at the attacker — 170 % / 230 % ATK arts within 1 of it, 5 % of that healed, the hit cut to 10 %; no recast within 1.3 s; DoTs, allies and sourceless damage do not cast it; a dodged attack does', () => {
  for (const elite of [false, true]) {
    const { h, u } = field({ elite, skill: 1 });
    const bb = formOf(6, elite).skills[1].bb;
    u.skill.charges = 5; u.skill.sp = 0;
    u.mem.oxiArcane.recent = Infinity;
    const src = h.spawn('dummy', { pos: [10, 7] }), near = h.spawn('dummy', { pos: [10, 7.8] }), far = h.spawn('dummy', { pos: [10, 9] });
    // not casting: DoT, sourceless, no source
    h.b.dealDamage(src, u, { amount: 100, type: 'phys', tags: ['dot'] });
    h.b.dealDamage(src, u, { amount: 100, type: 'phys', sourceless: true });
    h.b.dealDamage(null, u, { amount: 100, type: 'phys' });
    assert.equal(u.skill.activations, 0);
    u.hp = u.s.maxHp * 0.5;
    const hp0 = u.hp;
    const took = h.b.dealDamage(src, u, { amount: 1000, type: 'arts', isAttack: true });
    assert.equal(u.skill.activations, 1); assert.equal(u.skill.charges, 4);
    h.strike(u);
    approx(took, 1000 * 0.1 * (1 - u.s.res / 100), 'the hit cut to damage_remaining_scale, the shelter not yet');
    const back = hits(h, 'oxi:guard');
    assert.deepEqual(new Set(back.map((c) => c.target)), new Set([src, near]), 'within ability_range_radius of the attacker');
    for (const c of back) approx(c.dmg.amount, u.s.atk * bb.retaliate_atk_scale, 'retaliate_atk_scale');
    assert.deepEqual(h.eventsOf('fx').filter((x) => x[1] === 'blast').map((x) => x[4].tgt), [src.id], 'one blast, naming its centre for oxi_skill_02_hit_01');
    const healed = h.hooksOf('heal').filter((c) => c.target === u).reduce((s, c) => s + (c.amount ?? 0), 0);
    approx(healed, back.reduce((s, c) => s + c.amount, 0) * bb.heal_ratio, 'heal_ratio of the damage');
    approx(u.hp, hp0 - took + healed, 'hp');
    assert.ok(!back.some((c) => c.target === far));
    // within the window: no recast, and the shelter (庇护) now takes 90 % of the next hit's arts damage (its 0.2 s: the strike took 0.155 s of them)
    approx(h.b.dealDamage(src, u, { amount: 1000, type: 'arts', isAttack: true }), 1000 * 0.1 * (1 - u.s.res / 100), 'sheltered, not cut again');
    assert.equal(u.skill.activations, 1, 'window');
    h.run(1.4);
    // a dodged attack still casts it
    h.b.addBuff(u, { key: 'test:dodge', mods: { dodgePhys: 1 } });
    assert.equal(h.b.dealDamage(src, u, { amount: 1000, type: 'phys', isAttack: true }), 0);
    assert.equal(u.skill.activations, 2, 'MISS casts it');
    h.b.removeBuff(u, 'test:dodge');
    // true and element damage cast it too (ANY_ATTACK) but are not cut (PHYSICAL_AND_MAGICAL)
    h.run(1.4); u.hp = u.s.maxHp;
    approx(h.b.dealDamage(src, u, { amount: 300, type: 'true', isAttack: true }), 300, 'true: not cut');
    assert.equal(u.skill.activations, 3);
    h.run(1.4); u.hp = u.s.maxHp;
    approx(h.b.dealDamage(src, u, { amount: 300, type: 'elemental', element: 'burn' }), 300, 'elemental: not cut');
    assert.equal(u.skill.activations, 4);
    // no charge: nothing
    h.run(1.4); u.skill.charges = 0; u.skill.sp = 0;
    h.b.dealDamage(src, u, { amount: 1000, type: 'phys', isAttack: true });
    assert.equal(u.skill.activations, 4, 'no charge');
    done(h);
  }
});

test('S2 阂断骤雪: the shelter holds 90 % for 0.2 s then falls linearly to 0 at 1.3 s; each cast adds a stack of ATK / DEF +37 % / +47 % (5 at most, 5 s refreshed) and while one lasts her attack hits every enemy she blocks', () => {
  const { h, u } = field({ skill: 1 });
  const bb = formOf(6, true).skills[1].bb;
  u.skill.charges = 5;
  const src = h.spawn('dummy', { pos: [10, 3.4] });
  h.b.dealDamage(src, u, { amount: 1, type: 'true', isAttack: true });
  assert.equal(u.skill.activations, 1);
  const prot = () => u.findBuff('protect')?.data?.value ?? 0;
  h.step(2); approx(prot(), 0.9, 'held');
  h.run(0.5); assert.ok(prot() > 0 && prot() < 0.9, `decaying ${prot()}`);
  h.run(0.9); assert.equal(prot(), 0, 'gone');
  const st = () => u.findBuff('oxi_s_2_stack');
  assert.equal(st().stacks, 1);
  approx(u.s.atk, u.base.atk * (1 + bb.atk), 'ATK'); approx(u.s.def, u.base.def * (1 + bb.def), 'DEF');
  for (let i = 0; i < 6; i++) { h.run(1.4); u.skill.charges = 5; h.b.dealDamage(src, u, { amount: 1, type: 'true', isAttack: true }); }
  assert.equal(st().stacks, 5, 'max_stack_cnt');
  approx(st().timeLeft, bb.stack_duration, 'refreshed');
  // BuffedAttack: both blocked enemies
  const b2 = h.spawn('dummy', { pos: [10, 3.6] });
  h.run(0.1);
  assert.equal(u.blocking.length, 2);
  assert.ok(u.profile.hitAllBlocked);
  h.run(2.5);
  const struck = new Set(h.hooksOf('attack').filter((c) => c.attacker === u && !c.isSkill).flatMap((c) => c.targets));
  assert.ok(struck.has(src) && struck.has(b2), 'every blocked enemy');
  h.run(bb.stack_duration + 0.2);
  assert.ok(!st()); assert.ok(!u.profile.hitAllBlocked, 'back to one target');
  done(h);
});

test('S2 阂断骤雪: no normal attack while it is cast (its CastSkill `_switchToState` 1, the skill ability\'s 1.3 s): the swing in progress is cut, the next attack waits', () => {
  const { h, u } = field({ skill: 1 });
  assert.deepEqual([u.skill.cast?.mode, u.skill.cast?.cd], ['state', 1.3], 'CN client skchr_oxi_2');
  const src = h.spawn('dummy', { pos: [10, 3.4] });
  u.mem.oxiArcane.recent = Infinity;
  h.run(3);
  assert.ok(h.hooksOf('attack').filter((c) => c.attacker === u && !c.isSkill).length >= 2, 'attacking before');
  u.skill.charges = 5;
  const t0 = h.b.time;
  h.b.dealDamage(src, u, { amount: 1, type: 'true', isAttack: true });
  assert.equal(u.skill.activations, 1);
  approx(u.skillStateUntil - t0, 1.3, 'held for the skill ability');
  let first = null;
  h.b.on('attack', (c) => { if (c.attacker === u && !c.isSkill && first == null) first = h.b.time; });
  h.run(3);
  assert.ok(first != null && first >= t0 + 1.3 - 1e-6, `next attack at ${first - t0} s`);
  done(h);
});

test('S3 日冕重烈: ATK +108 % / +120 %, no attack; a 簇火 per lane (5 lanes, 13 from the 过载) every 2.67 s, every 2 s from the half; each explodes on the first enemy it meets: 130 % / 175 % ATK arts within 1.5, 元素伤害 on a bursting enemy, 15 % from a second fire of the same wave', () => {
  for (const elite of [false, true]) {
    const { h, u } = field({ elite, skill: 2, row: 10, col: 1 });
    const bb = formOf(6, elite).skills[2].bb;
    const e = h.spawn('dummy', { pos: [10, 8] });
    const top = h.spawn('dummy', { pos: [11, 8] });
    u.mem.oxiArcane.recent = Infinity;
    u.skill.gainSp(999, 'init'); assert.ok(u.skill.activate('test'));
    approx(u.s.atk, u.base.atk * (1 + bb.atk));
    assert.ok(u.s.flags.disarm);
    h.step();
    // the board here has 4 rows (9–12): every lane of the first wave
    assert.equal(u.mem.oxiS3.fires.length, 4);
    h.run(4);
    const fire = hits(h, 'oxi:fire');
    assert.ok(fire.length >= 2, 'explosions');
    const first = fire.filter((c) => c.target === e)[0];
    approx(first.dmg.amount, u.s.atk * bb.heatwave_atk_scale, 'first fire');
    assert.equal(first.dmg.type, 'arts');
    // the same wave: the second fire that reaches `e` deals 15 %
    const sameWave = fire.filter((c) => c.target === e).slice(1, 2);
    if (sameWave.length) approx(sameWave[0].dmg.amount, u.s.atk * bb.heatwave_atk_scale * bb.same_wave_repeat_damage_scale, 'repeat');
    void top;
    // a bursting enemy: 元素伤害
    h.b.dealDamage(null, e, { amount: 1e6, type: 'element', element: 'burn' });
    assert.ok(e.findBuff('burnBurst'));
    const n0 = fire.length;
    h.run(3);
    const later = hits(h, 'oxi:fire').slice(n0).filter((c) => c.target === e);
    assert.ok(later.length && later.every((c) => c.dmg.type === 'elemental'), 'element damage during its burst');
    // no normal attack during the skill
    assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u && !c.isSkill).length, 0);
    // waves: 2.67 s, then every 2 s from the half
    const starts = [];
    const w = u.mem.oxiS3;
    let last = w.next;
    while (u.skill.active) { h.step(); if (w.next !== last) { starts.push(h.b.time); last = w.next; } }
    const gaps = starts.slice(1).map((t, i) => +(t - starts[i]).toFixed(2));
    assert.ok(gaps.includes(+bb.normal_interval.toFixed(2)) || gaps.some((g) => Math.abs(g - bb.normal_interval) < 0.05), `normal ${gaps}`);
    assert.ok(gaps.some((g) => Math.abs(g - bb.overload_interval) < 0.05), `overload ${gaps}`);
    done(h);
  }
});

test('S3 日冕重烈 is cast by the automatic operations with an enemy anywhere on the field (GDGLOW_SKILL_2), not only in her 1-1 range; none without an enemy', () => {
  const { h, u } = field({ skill: 2, row: 10, col: 1 });
  u.skill.gainSp(999, 'init');
  h.run(1);
  assert.equal(u.skill.activations, 0, 'no enemy');
  h.spawn('dummy', { pos: [12, 12] });
  assert.ok(!u.rangeKeySet.has(12 * COLS + 12));
  h.run(0.25);   // (the next 0.2 s pass)
  assert.equal(u.skill.activations, 1, 'an enemy far outside her range');
  done(h);
});

test('S3 lanes: 5 centred on her, shifted inside the map at an edge, 13 in the 过载; facing UP the lanes are columns', () => {
  const { h, u } = field({ skill: 2, row: 10, col: 5, dir: 'UP' });
  u.skill.gainSp(999, 'init'); assert.ok(u.skill.activate('test'));
  h.step();
  const R = h.b.grid.rect, lanes = u.mem.oxiS3.fires.map((p) => p.lane);
  assert.deepEqual(lanes, [3, 4, 5, 6, 7]);
  assert.ok(u.mem.oxiS3.fires.every((p) => !p.horizontal && p.sign === 1 && p.s === R.r0));
  done(h);
});

test('塔露拉 through the real match path (seats[].diy → Match board → battleInput → BattleSpec → createBattleFromSpec): S2 on m04 is cast by the ranged attacks she takes, its retaliation strikes their sources; no errors', async () => {
  const T6 = 'chess_char_6_diy1_a';
  const { makeMatch } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: { charId: C, skillIndex: 1, uniEquipId: null } } }];
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
  assert.equal(u.def.charId, C); assert.equal(u.skill.id, 'skchr_oxi_2'); assert.equal(u.skill.rule, 'NEVER');
  const guard = [], taken = new Set();
  b.on('hit', (c) => { if (c.target === u && c.source?.side === 'enemy') taken.add(c.source); });
  b.on('damaged', (c) => { if (c.source === u && c.dmg?.tags?.includes('oxi:guard')) guard.push(c); });
  while (!b.finished && b.time < 90 && guard.length < 3) b.step();
  assert.ok(u.skill.activations >= 2, 'S2 cast by the attacks she took (one cast can strike several)');
  assert.ok(guard.length >= 3 && guard.every((c) => c.type === 'arts') && guard.some((c) => taken.has(c.target)), 'its retaliation strikes around the attackers');
  assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
  m.dispose?.();
});
