// test/sim/attack-timing.test.js — the official normal-attack timing for operators (and the shared rules with enemies:
// test/sim/feedback5-enemy-swing.test.js): client code `AbstractAnimatedAbility.UpdatePlaybackSpeed` (the clip scale =
// interval ÷ clip within [0.1, `_maxAnimScale`], the swing = scale × clip, the strike at the OnAttack frame × scale),
// `AbilityStandard.CastToTarget` (the cooldown restarts as the swing starts), `Ability.InterruptIfNot` (a stun cuts the
// swing and leaves the cooldown), `Entity.OnTick` (the cooldown runs through a stun), `DoCastOnTargets` (a target dead at the
// strike is skipped: a whiff) — server/sim/ai.js updateAlly / attackTiming; docs/rules/sim.md 「일반 공격 타이밍」. The data:
// data/chess.json `attackAnim` (tools/build-data.mjs opAttackAnim ← tools/assets/local-attack-timing.json + data/assets.json).
// Run: node --test test/sim/attack-timing.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { attackTiming } from '../../server/sim/ai.js';
import { TICK } from '../../server/sim/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (f) => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
const ds = getDefaultSource();
const near = (a, b, msg, ticks = 2) => assert.ok(Math.abs(a - b) <= ticks * TICK + 1e-9, `${msg}: ${a.toFixed(3)} vs ${b.toFixed(3)}`);
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };

const HIT = 0.4, BAT = 2;
/** One test operator (clip 1 s, strike at HIT, interval BAT) facing a dummy on the next tile. */
function field({ max = 1, enemies = 1 } = {}) {
  const op = { ...chessRec({ id: 't_op', stats: { atk: 100, bat: BAT }, skill: null, rangeGrid: [[0, 0], [0, 1], [0, 2]] }),
    attackAnim: { base: { clip: 'Attack', dur: 1, hit: HIT, max }, skills: [] } };
  const h = makeBattle({
    defs: { chess: { t_op: op }, enemies: { e: enemyRec({ key: 'e', hp: 1e9, speed: 0 }) } },
    units: [{ chessId: 't_op', row: 10, col: 4 }], enemies: Array.from({ length: enemies }, (_, i) => ({ key: 'e', pos: [10, 5 + i] })),
    content: 'none', autoFinish: false, timeLimit: 60, hooks: ['attack', 'damaged'], captureNoisy: true,
  });
  return { h, u: h.unit('t_op') };
}
const strikes = (h, u) => h.hooksOf('attack').filter((c) => c.attacker === u).map((c) => c.t);

test('data: every operator carries its attack modes\' clips with the client\'s timing (chess.json / backups.json attackAnim)', () => {
  const timing = readJson('tools/assets/local-attack-timing.json').ops;
  const chess = readJson('data/chess.json');
  let n = 0;
  for (const r of Object.values(chess)) {
    if (r.isDiy || !r.charId || !timing[r.charId]) continue;
    const a = r.attackAnim?.base;
    if (!a) continue;
    n++;
    const ab = timing[r.charId].attack[0];
    assert.equal(a.max, ab.max, `${r.chessId} _maxAnimScale`);
    assert.equal(a.pre ?? 0, ab.pre ?? 0, `${r.chessId} _preDelay`);
    assert.equal(a.sel ?? 0, ab.sel ?? 0, `${r.chessId} _selectTargetTiming`);
  }
  assert.ok(n > 200, `${n} chess records with a Default attack clip`);
  // spot checks: 送葬人 (no bound, targets taken at the strike), 格雷伊 (bound 1), 地灵 (no OnAttack wait: _preDelay 0.5)
  assert.deepEqual(chess.chess_char_2_01_a.attackAnim.base, { clip: 'Attack', dur: 1.633, hit: 0.533, max: -1, sel: 1 });
  assert.deepEqual(chess.chess_char_1_14_a.attackAnim.base, { clip: 'Attack', dur: 1, hit: 0.467, max: 1 });
  assert.deepEqual(chess.chess_char_1_11_a.attackAnim.base, { clip: 'Attack', dur: 1.9, hit: 0.6, max: 1, pre: 0.5, wait: 0 });
  // a skill mode's own clip (跃跃 S2 乐趣加倍: Skill_Loop) and a skill keeping the Default mode (null)
  assert.equal(chess.chess_char_1_09_a.attackAnim.skills.length, 2);
  assert.equal(chess.chess_char_1_09_a.attackAnim.skills[1].clip, 'Skill_Loop');
  // the 补位 / 自选 units carry it too
  const backups = readJson('data/backups.json');
  for (const [id, u] of Object.entries(backups.units)) if (timing[id]?.attack?.[0]) assert.ok(u.attackAnim?.base, `${id} backups unit`);
});

test('attackTiming of real operators: 格雷伊 (bound 1) swings at the clip\'s own speed and idles; 送葬人 (no bound) stretches the clip over the interval', () => {
  const t = (id) => {
    const def = ds.getChess(id);
    return attackTiming({ def, side: 'ally', skill: null, s: { interval: def.stats.bat * 100 / def.stats.aspd } });
  };
  const g = t('chess_char_1_14_a');
  assert.ok(Math.abs(g.strike - 0.467) < 1e-9 && Math.abs(g.action - 1) < 1e-9, `格雷伊 ${JSON.stringify(g)}`);
  const s = t('chess_char_2_01_a');
  const k = 2.3 / 1.633;
  assert.ok(Math.abs(s.strike - 0.533 * k) < 1e-9 && Math.abs(s.action - 2.3) < 1e-9 && s.sel === 1, `送葬人 ${JSON.stringify(s)}`);
  const d = t('chess_char_1_11_a');
  assert.ok(Math.abs(d.strike - 0.5) < 1e-9, `地灵: _preDelay × scale (${d.strike})`);
});

test('an operator swings as its cooldown ends and strikes at the damage frame: a swing event, the strike HIT later, one swing per interval', () => {
  const { h, u } = field();
  h.run(4.5);
  const sw = h.eventsOf('swing').filter((e) => e[1] === u.id);
  assert.ok(sw.length >= 3, `${sw.length} swings`);
  assert.deepEqual(sw[0].slice(2, 4), [HIT, 'none'], 'windup and the strike\'s projKind');
  // its 6th field: the main target it turns to (docs/rules/render.md 「공격 방향」), the 5th the Default-clip flag 0
  assert.equal(sw[0][4], 0, 'no Default clip under a skill');
  assert.ok(h.b.units.some((e) => e.id === sw[0][5] && e.side === 'enemy'), 'it turns to its target');
  const s = strikes(h, u);
  near(s[0], TICK + HIT, 'the first strike: its wind-up after the first tick');
  near(s[1] - s[0], BAT, 'then one per interval', 1);
  near(s[2] - s[1], BAT, 'then one per interval', 1);
  done(h);
});

test('a stun cuts an operator\'s swing; the cooldown restarted at the swing start and ran through the stun', () => {
  const { h, u } = field();
  h.step();
  assert.ok(u.swing, 'swinging from the first tick');
  const t0 = h.b.time - TICK;
  h.run(0.2);
  h.b.applyStatus(u, 'stun', { duration: 0.5 });
  h.run(BAT + HIT + 0.2);
  const s = strikes(h, u);
  assert.ok(s[0] > t0 + 0.7, 'the cut swing never struck');
  near(s[0], t0 + BAT + HIT, 'the next swing a whole interval after the cut one started (not after the stun)');
  done(h);
});

test('the target dies during the swing: a whiff (no damage), the next swing an interval after it started', () => {
  const { h, u } = field({ enemies: 2 });
  h.step();
  const t0 = h.b.time - TICK, target = u.swing.targets[0];
  h.b.dealDamage(null, target, { amount: 1e10, type: 'true' });
  h.run(HIT + 0.2);
  assert.equal(strikes(h, u).length, 0, 'no attack made on the other enemy (targets are taken as the swing starts)');
  h.run(BAT);
  near(strikes(h, u)[0], t0 + BAT + HIT, 'no cooldown back');
  done(h);
});

test('_maxAnimScale: a bound of 1 leaves a slow attacker\'s swing at the clip length, no bound stretches it over the interval', () => {
  for (const [max, strike, action] of [[1, HIT, 1], [-1, HIT * BAT, BAT], [1.1, HIT * 1.1, 1.1]]) {
    const { h, u } = field({ max });
    const t = attackTiming(u);
    assert.ok(Math.abs(t.strike - strike) < 1e-9 && Math.abs(t.action - action) < 1e-9, `max ${max}: ${JSON.stringify(t)}`);
    h.run(BAT + 1);
    near(strikes(h, u)[0], TICK + strike, `max ${max}: the strike`);
    done(h);
  }
});

// docs/rules/render.md 「공격 방향」: the swing names the target its unit turns to (client code `DealWithFaceDirection`);
// with no target left and blocking nobody, ['face', unit] turns it back (`IdleState.OnEnter` → `TryFaceToIdleDirection`)
test('the swing names its main target — an enemy it blocks behind it too; no target left → a face event back to its deploy direction', () => {
  const op = { ...chessRec({ id: 't_op', stats: { atk: 100, bat: BAT }, skill: null, rangeGrid: [[0, 0], [0, 1], [0, 2]] }),
    attackAnim: { base: { clip: 'Attack', dur: 1, hit: HIT, max: 1 }, skills: [] } };
  const h = makeBattle({
    defs: { chess: { t_op: op }, enemies: { e: enemyRec({ key: 'e', hp: 250, def: 0, speed: 0 }) } },
    units: [{ chessId: 't_op', row: 10, col: 4 }], enemies: [{ key: 'e', pos: [10, 3.6] }],   // behind it (it faces RIGHT)
    content: 'none', autoFinish: false, timeLimit: 60, captureNoisy: true,
  });
  const u = h.unit('t_op');
  h.run(BAT * 3 + 1);
  const foe = h.b.units.find((e) => e.side === 'enemy');
  const sw = h.eventsOf('swing').filter((e) => e[1] === u.id);
  assert.ok(sw.length >= 1 && sw[0][5] === foe.id, `it turns to the enemy it blocks behind it: ${JSON.stringify(sw[0])}`);
  assert.ok(!foe.alive, 'the enemy died');
  const face = h.eventsOf('face').filter((e) => e[1] === u.id);
  assert.equal(face.length, 1, 'then one turn back');
  assert.equal(u.faced, false);
  done(h);
});

test('an ability that faces its deploy direction (_faceToDefault) swings with \'D\', one that turns nowhere with no 6th field', () => {
  for (const [face, want] of [[2, 'D'], [0, undefined]]) {
    const op = { ...chessRec({ id: 't_op', stats: { atk: 100, bat: BAT }, skill: null, rangeGrid: [[0, 0], [0, 1], [0, 2]] }),
      attackAnim: { base: { clip: 'Attack', dur: 1, hit: HIT, max: 1, face }, skills: [] } };
    const h = makeBattle({
      defs: { chess: { t_op: op }, enemies: { e: enemyRec({ key: 'e', hp: 1e9, speed: 0 }) } },
      units: [{ chessId: 't_op', row: 10, col: 4 }], enemies: [{ key: 'e', pos: [10, 5] }],
      content: 'none', autoFinish: false, timeLimit: 60, captureNoisy: true,
    });
    const u = h.unit('t_op');
    h.run(0.5);
    const sw = h.eventsOf('swing').filter((e) => e[1] === u.id);
    assert.equal(sw[0][5], want, `face ${face}`);
    done(h);
  }
});
