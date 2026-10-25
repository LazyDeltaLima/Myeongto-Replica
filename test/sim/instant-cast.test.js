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
