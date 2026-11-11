// How an instant / charge skill with no attack of its own is cast (server/sim/skills.js _paceInstant / fireReplacement,
// ai.js startReplacement; docs/rules/sim.md 「즉발 스킬의 시전」, maintainer decision 2026-10-11): the client's skill class,
// data `cast` (tools/build-data.mjs skillCast ← tools/assets/local-skill-cast.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≈ ${b}`);
const DUMMY = { e: enemyRec({ key: 'e', hp: 1e9, atk: 0, speed: 0, blockCnt: 0 }) };

/** One operator (interval 1 s, attack clip 1 s striking at 0.5) with an AUTO SP_FULL instant skill cast as `cast`. */
function field(cast, { enemy = true, kit = {} } = {}) {
  const rec = chessRec({
    id: 'c_op', profession: 'SNIPER', rangeGrid: [[0, 0], [0, 1], [0, 2], [0, 3]], stats: { bat: 1 },
    skill: { skillType: 'AUTO', durationType: 'NONE', duration: 0, spCost: 5, initSp: 0, trigger: { rule: 'SP_FULL' }, cast },
  });
  rec.attackAnim = { base: { clip: 'Attack', dur: 1, hit: 0.5, max: 1 }, skills: [] };
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 60, hooks: ['attack', 'skillStart'], captureNoisy: true,
    defs: { chess: { c_op: rec }, enemies: DUMMY },
    kits: { c_op: () => ({ skill: { kind: 'instant', trigger: 'SP_FULL', onStart: ({ battle, unit }) => { (unit.mem.casts ??= []).push(battle.time); }, ...kit } }) },
    units: [{ chessId: 'c_op', row: 10, col: 4 }],
    enemies: enemy ? [{ key: 'e', route: { motion: 'WALK', start: [10, 6], end: [10, 6], checkpoints: [] } }] : [],
  });
  h.step();
  const u = h.unit('c_op');
  if (enemy) assert.ok(h.b.enemiesInKeys(u.rangeKeys, u, u.profile).length, 'an enemy in range');
  return { h, u };
}
const attacksOf = (h, u, from = -Infinity, to = Infinity) => h.hooksOf('attack').filter((c) => c.attacker === u && c.t >= from - 1e-9 && c.t <= to + 1e-9);

test("'state' (CastSkill _switchToState 1): the swing in progress is cut, no attack until the skill ability ends, the next cast after its action and cooldown", () => {
  // FROM_ANIMATION, a 2 s clip: the Skill state lasts 2 s, the ability's cooldown is that clip too
  const { h, u } = field({ mode: 'state', time: 1, clip: 'Skill', dur: 2, hit: 1, max: 1 });
  assert.equal(u.skill.cast.mode, 'state');
  assert.ok(h.runUntil(() => u.swing, 3), 'a swing starts');
  const cd = u.atkCd;
  u.skill.gainSp(5, 'test');
  h.step();
  const t0 = h.b.time;
  assert.equal(u.mem.casts?.length, 1, 'cast at once');
  assert.equal(u.swing, null, 'the swing in progress is cut');
  close(u.skillStateUntil, u.mem.casts[0] + 2, 1e-9, 'the Skill state ends with the skill ability (2 s)');
  assert.ok(u.atkCd < cd, 'the attack cooldown is kept and keeps running');
  const a0 = attacksOf(h, u).length;
  h.run(1.9);
  assert.equal(attacksOf(h, u).length, a0, 'no attack in the Skill state');
  assert.ok(h.runUntil(() => attacksOf(h, u).length > a0, 1.5), 'attacks again after it');
  close(u.skill.nextCastAt - u.mem.casts[0], 2, 1e-9, 'the next cast: the action end and the clip-long cooldown');
  // SP back at once: the second cast waits for the skill ability (2 s), not for her attacks
  const g = field({ mode: 'state', time: 1, clip: 'Skill', dur: 2, hit: 1, max: 1 });
  g.u.skill.gainSp(5, 'test');
  g.h.step();
  g.u.skill.gainSp(5, 'test');
  assert.ok(g.h.runUntil(() => g.u.mem.casts.length === 2, 3));
  close(g.u.mem.casts[1] - g.u.mem.casts[0], 2, 1 / 30 + 1e-9, 'the second cast when the ability is ready again');
  assert.ok(t0 > 0);
  checkInvariants(h.b);
});

test("'state': FROM_ATTACK_SPEED scales the clip to the attack interval; `resetCd` frees the next cast at the action's end", () => {
  // clip 0.5 s at most ×1 (interval 1 s): action 0.5 s, cooldown 1 s
  const a = field({ mode: 'state', time: 0, clip: 'Skill', dur: 0.5, max: 1 });
  a.u.skill.gainSp(5, 'test');
  a.h.step();
  const c0 = a.u.mem.casts[0];
  close(a.u.skillStateUntil - c0, 0.5, 1e-9, 'action = the unstretched clip');
  close(a.u.skill.nextCastAt - c0, 1, 1e-9, 'cooldown = the attack interval');
  const b = field({ mode: 'state', time: 0, clip: 'Skill', dur: 0.5, max: 1, resetCd: 1 });
  b.u.skill.gainSp(5, 'test');
  b.h.step();
  close(b.u.skill.nextCastAt - b.u.mem.casts[0], 0.5, 1e-9, '_resetAbilityCooldownWhenCastEnd: the action end only');
  // no clip known (an `_animKey` the skeleton lacks): the attack time itself
  const c = field({ mode: 'state', time: 0, max: -1 });
  c.u.skill.gainSp(5, 'test');
  c.h.step();
  close(c.u.skillStateUntil - c.u.mem.casts[0], c.u.s.interval, 1e-9, 'no clip: one attack interval');
});

test("'state': a stun ends the Skill state (SkillState.OnTick)", () => {
  const { h, u } = field({ mode: 'state', time: 1, clip: 'Skill', dur: 3, max: 1 });
  u.skill.gainSp(5, 'test');
  h.step();
  assert.ok(u.skillStateUntil > h.b.time + 2);
  h.b.applyStatus(u, 'stun', { duration: 0.3 });
  h.step();
  assert.equal(u.skillStateUntil, 0, 'ended');
  const a0 = attacksOf(h, u).length;
  assert.ok(h.runUntil(() => attacksOf(h, u).length > a0, 2), 'attacks once the stun is over');
});

test("'free' (CastSkill _switchToState 0): attacks go on; the next cast waits for the skill ability's cooldown only — none for a buff-only cast", () => {
  const { h, u } = field({ mode: 'free', time: 0, clip: 'Attack', dur: 1, hit: 0.5, max: 1 });
  const a0 = attacksOf(h, u).length;
  for (let i = 0; i < 90; i++) { u.skill.gainSp(5, 'test'); h.step(); }
  const n = u.mem.casts.length;
  assert.ok(n >= 3 && n <= 4, `one cast per attack interval (the ability's FROM_ATTACK_SPEED cooldown): ${n} in 3 s`);
  assert.ok(attacksOf(h, u).length - a0 >= 2, 'her attacks go on');
  assert.ok(!(u.skillStateUntil > 0), 'no Skill state');
  const b = field({ mode: 'free' });
  for (let i = 0; i < 30; i++) { b.u.skill.gainSp(5, 'test'); b.h.step(); }
  assert.ok(b.u.mem.casts.length >= 29, `a buff-only cast waits for SP only: ${b.u.mem.casts.length} in 30 ticks`);
});

test("'replace' (ReplacementSkill): the SP is spent at the cast, the skill goes out as the next attack — with no enemy too —, the attack after it one interval later", () => {
  for (const enemy of [true, false]) {
    const { h, u } = field({ mode: 'replace', time: 0, clip: 'Skill', dur: 1, hit: 0.4, max: 1 }, { enemy });
    h.run(0.6);
    const a0 = attacksOf(h, u).length;
    u.skill.gainSp(5, 'test');
    h.step();
    assert.equal(u.skill.activations, 1, 'cast');
    assert.equal(u.skill.sp, 0, 'SP spent');
    assert.ok(u.skill.replacing, 'waits for the next attack');
    assert.equal(u.mem.casts, undefined, 'no effect yet');
    assert.ok(h.runUntil(() => u.mem.casts?.length === 1, 2), `the skill goes out (enemy: ${enemy})`);
    const fired = h.b.time;
    assert.ok(!u.skill.replacing && !u.skill.active);
    const start = fired - 0.4;
    close(u.atkCd, 1 - 0.4, 1 / 30 + 1e-9, 'the attack cooldown restarted at the replaced swing\'s start');
    assert.equal(attacksOf(h, u, start - 0.01, fired).length, 0, 'no normal attack in that cycle');
    if (enemy) {
      assert.ok(h.runUntil(() => attacksOf(h, u).length > a0, 2), 'attacks again');
      const next = attacksOf(h, u).at(-1).t;
      close(next - start, 1 + 0.5, 2 / 30 + 1e-9, 'the next swing one interval after the replaced one (+ its strike)');
    }
    checkInvariants(h.b);
  }
});

test("'replace': a swing of the cast cut before its strike (stun) spends it — no effect, no SP back, nothing waits for the next attack", () => {
  const { h, u } = field({ mode: 'replace', time: 0, clip: 'Skill', dur: 1, hit: 0.4, max: 1 });
  h.run(0.6);
  u.skill.gainSp(5, 'test');
  assert.ok(h.runUntil(() => u.swing?.replace, 2), 'the cast went out as her swing');
  assert.ok(h.b.applyStatus(u, 'stun', { duration: 0.5 }), 'stunned in the wind-up');
  h.step();
  assert.ok(!u.skill.active && !u.skill.replacing, 'the cast is spent with the cut swing (the client\'s CancelAfterAttack)');
  assert.ok(u.skill.sp < 1, `no SP back (only its time SP since the cast): ${u.skill.sp}`);
  h.run(2);
  assert.equal(u.mem.casts, undefined, 'its effect never went out');
  checkInvariants(h.b);
});

test('the real match path: 引星棘刺 S2 (a Skill-state cast) holds her attacks while its skill ability plays', async () => {
  const { makeMatch } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 5 }).start();
  mh.toPrep(3);
  const m = mh.m, ps = mh.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const w = ps.acquireChess('chess_char_5_15_a', { source: 'buy' });
  assert.ok(w);
  let placed = false;
  for (const [r, c] of [[10, 7], [9, 7], [10, 6], [11, 7], [8, 7], [10, 8]]) {
    if (m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: r, col: c }, dir: 'RIGHT' }).ok) { placed = true; break; }
  }
  assert.ok(placed, 'on the board');
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'ic', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  const u = b.allyUnits.find((x) => x.kind === 'op');
  assert.equal(u.skill.id, 'skchr_thorn2_2');
  assert.equal(u.skill.cast?.mode, 'state');
  const attacks = [];
  b.on('attack', (c) => { if (c.attacker === u) attacks.push(b.time); });
  let castAt = null, until = null;
  b.on('skillStart', (c) => { if (c.unit === u && castAt == null) castAt = b.time; });
  u.skill.gainSp(1000, 'test');
  while (!b.finished && b.time < 40 && castAt == null) b.step();
  assert.ok(castAt != null, 'cast in the round');
  until = u.skillStateUntil;
  close(until - castAt, u.skill.castTiming().action, 1e-6, 'the Skill state = the skill ability\'s action');
  while (!b.finished && b.time < until + 0.1) b.step();
  assert.equal(attacks.filter((t) => t > castAt + 1e-9 && t < until - 1e-9).length, 0, 'no attack while it plays');
  assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
  m.dispose?.();
});

// docs/rules/render.md 「공격 방향」: a skill ability turns its unit by its own flags as it is cast (the client's
// `AbstractAnimatedAbility.OnCastStart` → `DealWithFaceDirection`; data `cast.face`, ai.js castFace) — a 'replace' cast as
// its attack starts, not at its strike; a CastSkill as it casts; a buff-only cast (no ability) not at all
test('a skill ability turns its unit as it is cast: [face, unit, turn] at a replace swing\'s start and at a CastSkill\'s cast', () => {
  const faces = (h, u) => h.eventsOf('face').filter((e) => e[1] === u.id && e.length > 2);
  const r = field({ mode: 'replace', time: 0, clip: 'Skill', dur: 1, hit: 0.5, max: 1 });
  const foe = r.h.b.units.find((e) => e.side === 'enemy');
  r.u.skill.gainSp(5, 'test');
  assert.ok(r.h.runUntil(() => r.u.swing?.replace, 3), 'the replaced attack starts');
  const t0 = r.h.b.time;
  assert.deepEqual(faces(r.h, r.u).map((e) => e[2]), [foe.id], 'turned to its target as the swing starts');
  assert.ok(!r.u.mem.casts?.length, 'before its strike');
  assert.ok(r.h.runUntil(() => r.u.mem.casts?.length, 2) && r.h.b.time > t0, 'the skill strikes later');
  for (const [face, want] of [[1, [foe.id]], [2, ['D']], [3, ['F']], [0, []]]) {
    const s = field({ mode: 'state', time: 1, clip: 'Skill', dur: 1, max: 1, ...(face === 1 ? {} : { face }) });
    s.u.skill.gainSp(5, 'test');
    s.h.step();
    assert.equal(s.u.mem.casts?.length, 1);
    assert.deepEqual(faces(s.h, s.u).map((e) => e[2]), want, `state cast, face ${face}`);
  }
  const buff = field({ mode: 'free' });
  buff.u.skill.gainSp(5, 'test');
  buff.h.step();
  assert.equal(buff.u.mem.casts?.length, 1);
  assert.deepEqual(faces(buff.h, buff.u), [], 'a buff-only cast turns nowhere');
  checkInvariants(r.h.b);
});

test("a timed skill's 'state' cast holds its unit's attacks as well, through the skill ability's action (森蚺 S3 on the real kit: first swing after Hensin, 1.5 s)", () => {
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, atk: 0, speed: 0, mass: 0, def: 0, res: 0 });
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: 'char_416_zumama', skillIndex: 2, uniEquipId: null }, row: 9, col: 5 }] });
  h.step();
  const u = h.unit(1);
  h.spawn('e_d', { pos: [9, 6] });
  assert.ok(h.runUntil(() => u.swing, 8), 'she attacks before the skill');
  h.events.splice(0);
  assert.ok(u.skill.activate('test', { free: true }));
  const t0 = h.b.time;
  assert.equal(u.swing, null, 'the swing in progress is cut');
  close(u.skillStateUntil, t0 + 1.5, 1e-9, 'the Skill state: Skill_2_Begin');
  const swings = [];
  let ended = null;
  for (let i = 0; i < Math.round(36 / h.b.dt); i++) {
    h.step();
    for (const e of h.events.splice(0)) if (e[0] === 'swing' && e[1] === u.id) swings.push(h.b.time - t0);
    if (ended == null && !u.skill.active) ended = h.b.time - t0;
  }
  assert.ok(swings[0] >= 1.5 - 1e-9, `first swing ${swings[0]}`);
  assert.ok(swings[0] < 1.5 + 0.1, `first swing ${swings[0]}: the cooldown ran on meanwhile`);
  close(ended, 32.5, 2 * h.b.dt, 'the 31 s run from the end of the cast');
  checkInvariants(h.b);
});

test('贝洛内 S3 and Mon3tr S3 hold their attacks through their skill clips too', () => {
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, atk: 0, speed: 0, mass: 0, def: 0, res: 0 });
  const cases = [
    { charId: 'char_4037_demetr', hold: 0.2, extra: [] },
    { charId: 'char_4179_monstr', hold: 0.667, extra: [{ uid: 2, kind: 'token', tokenId: 'token_10050_monstr_prosts', ownerUid: 1, row: 9, col: 6 }] },
  ];
  for (const { charId, hold, extra } of cases) {
    const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
      units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId, skillIndex: 2, uniEquipId: null }, row: 10, col: 5 }, ...extra] });
    h.step();
    const u = h.unit(1);
    h.spawn('e_d', { pos: [9, 7] });
    for (let i = 0; i < Math.round(3 / h.b.dt); i++) h.step();
    h.events.splice(0);
    u.skill.gainSp(999);
    assert.ok(u.skill.activate('test'), charId);
    // its begin clip first (skills.js _beginCast): no swing meanwhile; the skill clip's hold counts from the start, as it ends
    const t0 = u.skill._begin?.until ?? h.b.time;
    while (u.skill._begin) {
      h.step();
      assert.ok(!h.events.splice(0).some((e) => e[0] === 'swing' && e[1] === u.id), `${charId}: no swing in the begin clip`);
    }
    close(u.skillStateUntil, t0 + hold, 1e-9, `${charId}: the Skill state`);
    let first = null;
    for (let i = 0; i < Math.round(8 / h.b.dt) && first == null; i++) {
      h.step();
      for (const e of h.events.splice(0)) if (e[0] === 'swing' && e[1] === u.id && first == null) first = h.b.time - t0;
    }
    assert.ok(first != null, `${charId}: she attacks`);
    assert.ok(first >= hold - 1e-9, `${charId}: first swing ${first}`);
  }
});

// Every other timed skill whose CastSkill has `_switchToState` 1 and a skill clip (docs/rules/sim.md 「즉발 스킬의 시전」). `after`: the
// skill's time comes from a buff after the clip in its sequence group; without it the time runs from the cast.
const TIMED_HOLDS = [
  { name: '刺玫 S2', chessId: 'chess_char_1_06_a', skillIndex: 1, hold: 0.5, after: true },
  { name: '菲莱 S1', chessId: 'chess_char_3_06_a', skillIndex: 0, hold: 1.667, after: false, pos: [9, 5] },
  { name: '瑕光 S2', chessId: 'chess_char_3_12_a', skillIndex: 1, hold: 1, after: true },
  { name: '乌尔比安 S3', chessId: 'chess_char_5_05_a', skillIndex: 2, hold: 1, after: false },
  { name: '归溟幽灵鲨 S1', chessId: 'chess_char_5_13_a', skillIndex: 0, hold: 1, after: false },
  { name: '余 S2', chessId: 'chess_char_6_03_a', skillIndex: 1, hold: 1.6, after: true, pos: [9, 5] },
  { name: '余 S3', chessId: 'chess_char_6_03_a', skillIndex: 2, hold: 1.6, after: false, pos: [9, 5] },
  { name: '焰影苇草 S2', chessId: 'chess_char_6_08_a', skillIndex: 1, hold: 0.5, after: true },
  { name: '仇白 S2', chessId: 'chess_char_6_15_a', skillIndex: 1, hold: 1.167, after: true },
];

for (const { name, chessId, skillIndex, hold, after, pos = [9, 6] } of TIMED_HOLDS) {
  test(`${name}: the swing is cut, no attack through its skill clip (${hold} s), its time runs from ${after ? 'the end of the clip' : 'the cast'}`, () => {
    const dummy = enemyRec({ key: 'e_d', hp: 1e9, atk: 0, speed: 0, mass: 0, def: 0, res: 0 });
    const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
      units: [{ uid: 1, chessId, skillIndex, row: 9, col: 5 }] });
    h.step();
    const u = h.unit(1);
    h.spawn('e_d', { pos });   // (菲莱 and 余 reach their own tile only)
    assert.ok(h.runUntil(() => u.swing, 8), 'an attack before the skill');
    h.events.splice(0);
    const d = u.skill.duration;
    assert.ok(d > 0, 'a timed skill');
    assert.ok(u.skill.activate('test', { free: true }));
    const t0 = h.b.time;
    assert.equal(u.swing, null, 'the swing in progress is cut');
    close(u.skillStateUntil, t0 + hold, 1e-3, 'the Skill state');
    const swings = [];
    let ended = null;
    for (let i = 0; i < Math.round((d + hold + 1) / h.b.dt) && ended == null; i++) {
      h.step();
      for (const e of h.events.splice(0)) if (e[0] === 'swing' && e[1] === u.id) swings.push(h.b.time - t0);
      if (!u.skill.active) ended = h.b.time - t0;
    }
    assert.ok(!swings.some((t) => t < hold - 1e-3), `no swing before ${hold}: ${swings[0]}`);
    close(ended, after ? d + hold : d, 2 * h.b.dt, 'the skill ends');
    checkInvariants(h.b);
  });
}

test('锏 S3: no attack through Skill_3_End after her slashes, 1.567 s from the end of the skill', () => {
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, atk: 0, speed: 0, mass: 0, def: 0, res: 0 });
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ uid: 1, chessId: 'chess_char_6_19_a', skillIndex: 2, row: 9, col: 5 }] });
  h.step();
  const u = h.unit(1);
  h.spawn('e_d', { pos: [9, 6] });
  assert.ok(u.skill.activate('test', { free: true }));
  assert.ok(h.runUntil(() => u.skill.active, 2), 'the slashes start (after its begin clip: skills.js _beginCast)');
  assert.ok(h.runUntil(() => !u.skill.active, 8), 'the slashes end');
  const t1 = h.b.time;
  close(u.skillStateUntil, t1 + 1.567, 2 * h.b.dt, 'the Skill state of EndAttack');
  h.events.splice(0);
  const swings = [];
  for (let i = 0; i < Math.round(4 / h.b.dt); i++) {
    h.step();
    for (const e of h.events.splice(0)) if (e[0] === 'swing' && e[1] === u.id) swings.push(h.b.time - t1);
  }
  assert.ok(swings.length, 'she attacks again');
  assert.ok(swings[0] >= 1.567 - 2 * h.b.dt, `first swing ${swings[0]}`);
  checkInvariants(h.b);
});

test('刺玫 S2 through the real match path: no attack through her clip, its time from the end of the clip', async () => {
  const { makeMatch, give } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
  h.toPrep(1);
  h.setStage('act2autochess_m04');
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const p = give(m, ps, 'chess_char_1_06_a', 'hand');
  assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: 9, col: 4 }, dir: 'RIGHT' }).ok, 'on the board');
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  while (b.waveT0 == null) b.step();
  const u = b.allyUnits.find((x) => x.kind === 'op' && x.def.charId === 'char_494_vendla');
  assert.ok(u && u.skill.id === 'skchr_vendla_2', 'her S2');
  assert.ok(u.skill.activate('test', { free: true }));
  const t0 = b.time;
  close(u.skillStateUntil, t0 + 0.5, 1e-3, 'the Skill state');
  let held = true, ended = null;
  for (let i = 0; i < Math.round(17 / b.dt) && ended == null; i++) {
    b.step();
    if (b.time < t0 + 0.5 - 1e-3 && u.swing) held = false;
    if (!u.skill.active) ended = b.time - t0;
  }
  assert.ok(held, 'no swing during the cast');
  close(ended, u.skill.duration + 0.5, 2 * b.dt, 'the skill ends');
  assert.equal(b.errors.length, 0, JSON.stringify(b.errors[0]));
});

test('歌蕾蒂娅 S3: no attack through the closing FinalAttack, 2.667 s from the end of the skill', () => {
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, atk: 0, speed: 0, mass: 0, def: 0, res: 0 });
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ uid: 1, chessId: 'chess_char_4_12_a', skillIndex: 2, row: 9, col: 5 }] });
  h.step();
  const u = h.unit(1);
  h.spawn('e_d', { pos: [9, 6] });
  assert.ok(u.skill.activate('test', { free: true }));
  assert.ok(h.runUntil(() => !u.skill.active, 12), 'the skill ends');
  const t1 = h.b.time;
  close(u.skillStateUntil, t1 + 2.667, 2 * h.b.dt, 'the Skill state of FinalAttack');
  h.events.splice(0);
  const swings = [];
  for (let i = 0; i < Math.round(6 / h.b.dt); i++) {
    h.step();
    for (const e of h.events.splice(0)) if (e[0] === 'swing' && e[1] === u.id) swings.push(h.b.time - t1);
  }
  assert.ok(swings.length, 'an attack after it');
  assert.ok(swings[0] >= 2.667 - 2 * h.b.dt, `first swing ${swings[0]}`);
  checkInvariants(h.b);
});
