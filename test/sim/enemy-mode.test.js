// test/sim/enemy-mode.test.js — an enemy's mode switch (the client's `Unit.SwitchMode`; docs/rules/sim.md 「일반 공격 타이밍」
// 「적의 모드 전환」, server/sim/ai.js enemyMode): the new mode's attack ability attaches ready (no cooldown waited) with its
// own clip and timing (data/enemies.json `attackAnim.modes`); a switch that restarts the state machine, or detaches an
// ability that cuts on detach (`det`), cuts the swing running; otherwise the enemy waits for that swing (the state waits
// for the ability it last cast) and swings the new mode's attack as it ends. A mode with no attack ability attacks not.
// Run: node --test test/sim/enemy-mode.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { TICK } from '../../server/sim/constants.js';
import { enemyMode, attackWindup } from '../../server/sim/ai.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { setEchoForm } from '../../server/sim/content/bosses.js';

const E = JSON.parse(fs.readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
const BAT = 3;
const near = (a, b, msg, ticks = 2) => assert.ok(Math.abs(a - b) <= ticks * TICK + 1e-9, `${msg}: ${a.toFixed(3)} vs ${b.toFixed(3)}`);

/** A wall and one melee enemy on its tile (blocked at once): its first mode swings a 1 s clip (strike 0.4), M2 a 2 s one
 *  (strike 1.2), Bare has no attack ability. `det`: the first mode's attack cuts its swing on detach. */
function field({ det = false } = {}) {
  const rec = {
    ...enemyRec({ key: 'enemy_md', hp: 1e9, atk: 100, bat: BAT, speed: 0 }),
    attackAnim: { clip: 'Attack', dur: 1, hit: 0.4, ...(det ? { det: 1 } : null), mode0: 'Default',
      modes: { M2: { clip: 'B_Attack', dur: 2, hit: 1.2, det: 1 }, Bare: null } },
  };
  const h = makeBattle({
    defs: { chess: { t_wall: chessRec({ id: 't_wall', stats: { maxHp: 1e9, atk: 0, def: 0 }, skill: null }) }, enemies: { enemy_md: rec } },
    units: [{ chessId: 't_wall', row: 10, col: 6 }], enemies: [{ key: 'enemy_md', pos: [10, 6] }],
    content: 'none', autoFinish: false, timeLimit: 60, hooks: ['attack'], captureNoisy: true,
  });
  h.step();
  return { h, e: h.enemy('enemy_md') };
}
const strikes = (h, e) => h.hooksOf('attack').filter((c) => c.attacker === e).map((c) => c.t);
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };

test('a mode switch between swings: the new mode attacks at once (its cooldown is not the old one) with its own clip', () => {
  const { h, e } = field();
  assert.ok(h.runUntil(() => strikes(h, e).length >= 1, 5), 'first strike');
  const t1 = strikes(h, e)[0];
  h.run(1.2);                                    // past the 1 s swing, inside the 3 s cooldown
  assert.ok(e.atkCd > 1, 'the old cooldown still runs');
  const t0 = h.b.time;
  assert.equal(enemyMode(h.b, e, 'M2'), true);
  assert.equal(attackWindup(e), 1.2, 'M2 strikes at its own clip\'s frame (2 s clip, 3 s interval: scale 1)');
  assert.ok(h.runUntil(() => strikes(h, e).length >= 2, 5), 'second strike');
  near(strikes(h, e)[1], t0 + 1.2, 'the new mode swings at once, its strike 1.2 s in');
  assert.ok(strikes(h, e)[1] < t1 + BAT, 'earlier than the old cooldown allowed');
  assert.equal(enemyMode(h.b, e, 'M2'), false, 'the same mode again changes nothing');
  done(h);
});

test('a switch that restarts the state machine cuts the swing running: no strike from it', () => {
  const { h, e } = field();
  h.runUntil(() => !!e.swing, 5);
  h.run(0.2);                                    // before the 0.4 s strike
  enemyMode(h.b, e, 'M2');
  assert.equal(e.swing, null, 'cut');
  h.run(1.0);
  assert.deepEqual(strikes(h, e), [], 'the cut swing never lands, the new one is 1.2 s in');
  done(h);
});

test('no restart, no `det`: the swing plays out, the enemy waits for its recovery, then the new mode at once', () => {
  const { h, e } = field();
  h.runUntil(() => !!e.swing, 5);
  const s0 = h.b.time - TICK;
  h.run(0.2);
  enemyMode(h.b, e, 'M2', false);
  assert.ok(e.swing, 'the swing goes on');
  assert.ok(h.runUntil(() => strikes(h, e).length >= 2, 6), 'two strikes');
  const [a, b2] = strikes(h, e);
  near(a, s0 + 0.4, 'the old swing strikes on time');
  // its 1 s clip ends at s0 + 1: the M2 swing starts then (not at s0 + 3, the old cooldown), its strike 1.2 s later
  near(b2, s0 + 1 + 1.2, 'the new mode follows the old swing\'s end', 3);
  done(h);
});

test('no restart but the old ability cuts on detach (`det`): the swing is cut', () => {
  const { h, e } = field({ det: true });
  h.runUntil(() => !!e.swing, 5);
  h.run(0.2);
  enemyMode(h.b, e, 'M2', false);
  assert.equal(e.swing, null);
  done(h);
});

test('a mode with no attack ability: no normal attack until the enemy leaves it, then at once', () => {
  const { h, e } = field();
  enemyMode(h.b, e, 'Bare');
  h.run(6);
  assert.deepEqual(strikes(h, e), [], 'no attack in Bare');
  const t0 = h.b.time;
  enemyMode(h.b, e, 'Default');                     // (its first mode's name = the first mode)
  assert.equal(e.mode, null);
  assert.ok(h.runUntil(() => strikes(h, e).length >= 1, 3));
  near(strikes(h, e)[0], t0 + 0.4, 'the first mode attacks at once');
  done(h);
});

// --- the official prefabs' modes as data/enemies.json carries them, and the kits that switch them

test('data: the later modes of the prefabs (attack_timing.py modes → attackAnim.modes)', () => {
  const m = (k) => E[k].attackAnim.modes;
  assert.equal(E.enemy_1535_wlfmster.attackAnim.mode0, 'M1');
  assert.equal(m('enemy_1535_wlfmster').M2.clip, 'B_Attack', '扎罗 M2: Attack renamed by the mode\'s _replaceAnimPairs');
  assert.equal(m('enemy_1535_wlfmster').M2.dur, 2);
  assert.equal(m('enemy_1116_liprr').R.clip, 'Attack2', '普通囚犯 R (the warning)');
  assert.equal(m('enemy_1511_mdrock')['Tier 4'].clip, 'Attack_2', '泥岩 Tier 4');
  assert.equal(m('enemy_10045_parrot').Stun, null, '吉兆飞鳞 Stun: no attack ability');
  assert.equal(m('enemy_10044_wintun').M1, null, '咸鳞汁推荐者: its first mode has none, M2 a Combat');
  assert.equal(m('enemy_10044_wintun').M2.clip, 'B_Attack');
  assert.equal(m('enemy_1439_dslntf').Default, null, '元核孽生者: its Combat comes with mode 1');
  assert.equal(E.enemy_1001_bigbo.attackAnim.modes, undefined, 'a prefab of one mode lists none');
});

function arena(o = {}) {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { t_wall: chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null }) } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: [{ chessId: 't_wall', row: 9, col: 5 }], hooks: ['attack'], captureNoisy: true, ...o,
  });
}
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 } });

test('普通囚犯: R before its warning attack, L before its freeing one — each attack after a switch follows the last at once', () => {
  const h = arena();
  h.step();
  const e = put(h, 'enemy_1116_liprr', [9, 5]);
  const modes = [];
  h.b.on('attack', (c) => { if (c.attacker === e) modes.push([h.b.time, e.mode]); }, { priority: -100 });
  const times = E.enemy_1116_liprr.talents.bb['confinement.times'];
  assert.ok(h.runUntil(() => modes.length >= times + 1, 120));
  assert.deepEqual(modes.slice(0, times + 1).map((x) => x[1]), [...Array(times - 2).fill(null), 'R', 'L', 'L']);
  // the swing after a switch waits for the switching swing's end only: the clip (1.067 s) inside the (confined) interval
  const gap = (i) => modes[i][0] - modes[i - 1][0];
  const clip = E.enemy_1116_liprr.attackAnim.dur;
  assert.ok(gap(times - 1) < clip + 0.2, `the attack after R follows at once: ${gap(times - 1).toFixed(3)} s`);
  assert.ok(gap(1) > clip + 0.5, `confined attacks wait the interval: ${gap(1).toFixed(3)} s`);
  done(h);
});

test('扎罗 stands up in M2: its ranged attack swings B_Attack (2 s), ready as the 重生 ends', () => {
  const h = arena();
  h.step();
  const e = put(h, 'enemy_1535_wlfmster', [9, 8]);
  assert.equal(e.mode ?? null, null);
  h.b.dealDamage(null, e, { amount: 1e9, type: 'true', canDodge: false });
  assert.ok(e.alive, '重生, not dead');
  assert.ok(h.runUntil(() => e.mode === 'M2', 60), 'M2 after the 重生 (40 s)');
  assert.equal(attackWindup(e) > 0, true);
  assert.equal(E.enemy_1535_wlfmster.attackAnim.modes.M2.hit, 0.633);
  done(h);
});

// --- the triggers of the modes whose attack is the first mode's (2026-11-20, 공식 클라에서 확인: docs/rules/sim.md
// 「일반 공격 타이밍」 「적의 모드 전환」): what switches them and whether it restarts the state machine

test('HP-ratio switches restart the state machine: 碎骨 / “墓碑” Ignite, W T1 — the swing running is cut', () => {
  for (const [key, ratio, name] of [['enemy_1500_skulsr', E.enemy_1500_skulsr.talents.bb['atkup.hp_ratio'], 'Ignite'],
    ['enemy_2008_flking', 0.9, 'Ignite'], ['enemy_1504_cqbw', 0.5, 'T1']]) {
    const h = arena();
    h.step();
    const e = put(h, key, [9, 5]);
    e.mem.ab.list.forEach((a) => { if (a.fire) a.left = 1e9; });   // (no skill cast in the way)
    h.b.loseHp(e, e.s.maxHp * (1 - ratio - 0.02));
    h.step();
    assert.equal(e.mode ?? null, null, `${key}: still its first mode above ${ratio}`);
    assert.ok(h.runUntil(() => !!e.swing, 10), `${key}: a swing`);
    h.b.loseHp(e, e.s.maxHp * 0.03);
    h.step();
    assert.equal(e.mode, name, `${key}: ${name} at ${ratio}`);
    assert.equal(e.swing, null, `${key}: the swing is cut (switch_mode_restart_fsm)`);
    done(h);
  }
});

test('W: each mode has its own C4 — T1\'s waits its initial cooldown from the switch, Default\'s stands still', () => {
  const h = arena();
  h.step();
  const e = put(h, 'enemy_1504_cqbw', [9, 5]);
  e.profile.noAttack = true;
  const icd = E.enemy_1504_cqbw.skills.find((x) => x.prefabKey === 'C4').initCooldown;
  const casts = [];
  const fx = h.b.fx.bind(h.b);
  h.b.fx = (kind, o) => { if (kind === 'enemySkill' && o.id === e.id) casts.push(h.b.time); return fx(kind, o); };
  h.run(icd - 4);
  const t0 = h.b.time;
  h.b.loseHp(e, e.s.maxHp * 0.6);
  assert.ok(h.runUntil(() => casts.length > 0, icd + 5), 'a C4');
  assert.equal(e.mode, 'T1');
  near(casts[0], t0 + icd, 'T1\'s C4 starts from its initial cooldown at the switch, not from the spawn', 3);
  done(h);
});

test('沉沙: the last blade switches to Default without a restart — the next swing follows that one at once', () => {
  const h = arena();
  h.step();
  const e = put(h, 'enemy_1207_sfji', [9, 5]);
  const cnt = E.enemy_1207_sfji.talents.bb['DeadSpawn.cnt'];
  const at = [];
  h.b.on('attack', (c) => { if (c.attacker === e) at.push([h.b.time, e.mode ?? null]); }, { priority: -100 });
  assert.ok(h.runUntil(() => at.length >= cnt + 2, 60));
  assert.deepEqual(at.slice(0, cnt + 2).map((x) => x[1]), [...Array(cnt - 1).fill(null), 'Default', 'Default', 'Default']);
  const clip = E.enemy_1207_sfji.attackAnim.dur, gap = (i) => at[i][0] - at[i - 1][0];
  assert.ok(gap(cnt) < clip + 0.2, `the swing after the last blade follows its end: ${gap(cnt).toFixed(3)} s`);
  assert.ok(gap(1) > clip + 0.5, `the others wait the interval: ${gap(1).toFixed(3)} s`);
  done(h);
});

test('昆图斯 G1, 阿利斯泰尔 S1: the growth / the half-HP advance switch the prefab mode', () => {
  const h = arena();
  h.step();
  const q = put(h, 'enemy_1521_dslily', [10, 8]);
  const l = put(h, 'enemy_9032_aclionk', [11, 8]);
  h.step();
  assert.equal(q.mode ?? null, null);
  assert.equal(l.mode ?? null, null);
  h.b.loseHp(q, q.s.maxHp * (E.enemy_1521_dslily.talents.bb['growup1.hp_ratio'] + 0.01));
  h.b.loseHp(l, l.s.maxHp * 0.51);
  h.run(0.5);
  assert.equal(q.mode, 'G1');
  assert.equal(l.mode, 'S1');
  done(h);
});

test('“余音”: its form is the prefab mode (Depression ↔ Passion), the switch cuts the swing', () => {
  const h = arena();
  h.step();
  const e = put(h, 'enemy_9023_acdums', [9, 5]);
  assert.equal(e.mode, 'Depression', 'it comes as the dark (Depression) form');
  assert.ok(h.runUntil(() => !!e.swing, 10), 'a swing');
  setEchoForm(h.b, e, 'gold', true);
  assert.equal(e.mode, null, 'Passion is the first mode');
  assert.equal(e.swing, null, 'cut (acdums_t_1: _restartFSM)');
  done(h);
});

test('潜水员: Swim when talent Swim\'s 0.2 s check finds deep water', () => {
  const h = arena({ flat: { rows: { 11: '##hrrrddrrfrrrrrrrf##' } } });
  h.step();
  const t0 = h.b.time;
  const e = put(h, 'enemy_1158_divman', [11, 6]);
  assert.ok(h.runUntil(() => e.mode === 'Swim', 2));
  near(h.b.time, t0 + 0.2, 'the first check, 0.2 s after it attached', 1);
  done(h);
});

test('萨卡兹枯朽前锋: Originium on 源石 at its 0.5 s check — an infection tile, or the aura of a chimera in Originium', () => {
  const h = arena({ units: [], flat: { rows: { 11: '##hrrriirrfrrrrrrrf##' } } });
  h.step();
  const t0 = h.b.time;
  const wet = put(h, 'enemy_1422_lrsldr', [11, 7]);
  const dry = put(h, 'enemy_1422_lrsldr', [10, 4]);
  assert.ok(h.runUntil(() => wet.mode === 'Originium', 2));
  near(h.b.time, t0 + 0.5, 'the first check, 0.5 s after it attached');
  h.run(1);
  assert.equal(dry.mode ?? null, null, 'off 源石: Default');
  const c = put(h, 'enemy_1425_lrcmra', [11, 5]);
  c.x = 6; c.y = 11;                                     // on the infection tile: it activates
  h.run(0.5);
  assert.equal(c.mode, 'Originium', 'the chimera in Originium');
  c.x = 4.5; c.y = 10.5;                                 // its aura (1.2) now reaches the dry one
  h.run(1.1);
  assert.equal(dry.mode, 'Originium', 'the chimera\'s mark counts as 源石');
  done(h);
});
