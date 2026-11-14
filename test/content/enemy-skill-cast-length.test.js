// How long an enemy skill casts when its ability plays no clip of its own (docs/rules/sim.md 「적 스킬 = 일반 공격 차례」
// 시전 길이; content/enemies.js castLength): the client times it by the ability's class — an animated ability casts the
// attack time of its `_timeMode` (`EasyToStartAbility.m_cachedDuration` = `m_attackTime`; a channel's
// ThreePartChannelingAnimation stretches its loop to it), an ActiveBuffAbility two fixed updates, a sequence group the sum of
// its children. Until 2026-11-07 every such cast lasted 0: 重弩突袭者 shot 直击 and walked on, “自在” held its 破桎而出
// barrier while it kept attacking. An interrupted cast restarts the skill's cooldown then (`EnemySkill._OnCastFinish`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { TICK } from '../../server/sim/constants.js';

const E = JSON.parse(fs.readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
const WALL = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const NOATK = () => ({ trait: { noAttack: true } });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function arena() {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { t_wall: WALL('t_wall') } }, kits: { t_wall: NOATK }, enemies: [], units: [{ chessId: 't_wall', row: 9, col: 5 }],
  });
}

/** Steps `h` a tick at a time until enemy `e` starts casting skill `name` (fx 'enemySkill'); the time it began. */
function untilCast(h, e, name, max = 60) {
  let at = null;
  const fx = h.b.fx.bind(h.b);
  h.b.fx = (k, o) => { if (k === 'enemySkill' && o.id === e.id && o.ability === name && at == null) at = h.b.time; return fx(k, o); };
  for (let t = 0; t < max && at == null; t += TICK) h.step();
  assert.ok(at != null, `${name} cast`);
  return at;
}

test('skillCast records the class of each skill\'s ability (attack_timing.py cast_fields)', () => {
  const c = (k, n) => E[k].skillCast[n];
  assert.deepEqual(c('enemy_1502_crowns', 'blink'), { family: 2, kind: 'buff' });
  assert.deepEqual(c('enemy_9009_acfort', 'fireweapon').subs.map((s) => s.kind ?? s.clip), ['buff', 'Skill_2']);
  assert.equal(c('enemy_1275_dwlock_2', 'deatheye').kind, 'seq');
  assert.deepEqual(c('enemy_1275_dwlock_2', 'deatheye').subs[0], { time: 0, proj: 1, chan: { begin: 'Skill_Begin', loop: 'Skill_Loop', end: 'Skill_End' } });   // + its ThreePartChannelingAnimation
  assert.equal(c('enemy_1272_nhtank', 'pollutedrangedatk').kind, 'par');
  // (its key `Born` is the clip `Revive` through the prefab animator's key table — docs/rules/sim.md 「적 클립의 키 표」)
  assert.deepEqual(c('enemy_9014_acstma', '2'), { family: 3, clip: 'Revive', dur: 4.433, max: 1, time: 1 });
  assert.deepEqual(c('enemy_1404_msnip', 'crossattack'), {
    family: 1, time: 2, cd: 2.5,
    chan: { begin: 'Skill_Begin', loop: 'Skill_Loop', end: 'Skill_End',
      down: { begin: 'Skill_Begin_Down', loop: 'Skill_Loop_Down', end: 'Skill_End_Down' }, up: { begin: 'Skill_Begin_Up', loop: 'Skill_Loop_Up', end: 'Skill_End_Up' } },
  });
});

test('castLength by class: the attack time of a clipless ability, two ticks of an ActiveBuffAbility, the sum of a sequence', () => {
  const e = { s: { interval: 3 } };
  const L = (k, n, bb = {}) => enemiesMod.castLength(e, E[k].skillCast[n], bb);
  assert.ok(near(L('enemy_1404_msnip', 'crossattack'), 2.5), '直击 `_timeMode` 2: its `_cooldown`');
  assert.ok(near(L('enemy_1517_xi', 'shieldburst', { duration: 15 }), 15), '破桎而出 `_timeMode` 3: the blackboard duration');
  assert.ok(near(L('enemy_1535_wlfmster', 'fearcage', { duration_s: 5 }), 5), '溶血骇惧 `_timeMode` 3 `duration_s`');
  assert.ok(near(L('enemy_1502_crowns', 'blink'), 2 * TICK), 'ActiveBuffAbility: a fixed update before and after');
  // 假想敌：黑云 FireWeapon: ResetAmmoCount (2 ticks) then Fire (Skill_2 2 s, `_timeMode` 0, max 1: the 3 s interval keeps 2 s)
  assert.ok(near(L('enemy_9009_acfort', 'fireweapon'), 2 * TICK + 2), 'a sequence: its children one after another');
  // a projectile-waiting channel without a clip: at least its attack time (`m_cachedDuration`; the open cast waits for the
  // projectile on top, content/enemies.js projCastOver) — `_timeMode` 0, the 3 s interval
  assert.ok(near(L('enemy_9012_acloon', 'skill'), 3), 'a clipless projectile wait: its attack time');
  assert.equal(L('enemy_1272_nhtank', 'pollutedrangedatk'), 0, 'a parallel group [ASSUMED·미조사]');
  assert.ok(near(L('enemy_9014_acstma', '2'), 4.433), 'its key through the key table: `Revive` as it is (`_timeMode` 1)');
  // a clip of its own is unchanged: 【末日】 4.467 s as it is (`_timeMode` 1)
  assert.ok(near(enemiesMod.castLength(e, E.enemy_1521_dslily.skillCast.doom, {}), 4.467));
});

test('重弩突袭者 直击 channels 2.5 s: it stands, no normal attack meanwhile, its cooldown runs from the cast\'s end', () => {
  const h = arena();
  h.step();
  const e = h.spawn('enemy_1404_msnip', { pos: [9, 8], routeIndex: 0, mods: { speedMul: 0 } });
  const swings = [];
  const ev = h.b._ev.bind(h.b);
  h.b._ev = (x) => { if (x[0] === 'swing' && x[1] === e.id) swings.push(h.b.time); return ev(x); };
  const t0 = untilCast(h, e, 'CrossAttack');
  assert.ok(near(e.castLeft, 2.5, TICK + 1e-6), `cast ${e.castLeft}`);
  assert.ok(near(e.atkStandUntil, t0 + 2.5, 1e-6), 'it stands through the cast');
  const t1 = untilCast(h, e, 'CrossAttack', 30);
  assert.ok(!swings.some((t) => t > t0 + 1e-9 && t < t0 + 2.5 - 1e-9), 'no normal attack during the channel');
  assert.ok(t1 >= t0 + 2.5 + 8 - 1e-6, `next 直击 at least cast + cooldown later (${(t1 - t0).toFixed(2)} s)`);
});

test('a stun cuts 直击\'s channel: the skill\'s cooldown restarts at the cut (EnemySkill._OnCastFinish, any reason)', () => {
  const h = arena();
  h.step();
  const e = h.spawn('enemy_1404_msnip', { pos: [9, 8], routeIndex: 0, mods: { speedMul: 0 } });
  untilCast(h, e, 'CrossAttack');
  h.run(1);
  const a = e.mem.ab.list.find((x) => x && x.name === 'CrossAttack');
  h.b.applyStatus(e, 'stun', { duration: 1, source: null, force: true });
  h.step();
  assert.equal(e.castLeft, 0, 'the cast is cut');
  assert.ok(near(a.left, 8, TICK + 1e-6), `cooldown from the cut: ${a.left}`);
});

test('“自在” 破桎而出: it channels the barrier\'s duration, and breaking the last layer ends the cast with no burst', () => {
  const h = arena();
  h.step();
  const e = h.spawn('enemy_1517_xi', { pos: [9, 7], routeIndex: 0, mods: { speedMul: 0 } });
  const sb = e.mem.ab.list.find((x) => x && x.name === 'ShieldBurst');
  for (const x of e.mem.ab.list) if (x && x.cd != null && x !== sb && x.left != null) x.left = 1e6;
  sb.left = 0.1;
  untilCast(h, e, 'ShieldBurst');
  const dur = E.enemy_1517_xi.skills.find((s) => s.prefabKey === 'ShieldBurst').bb.duration;
  assert.ok(near(e.castLeft, dur, TICK + 1e-6), `channel ${e.castLeft}`);
  assert.ok(e.findBuff('ab:xiShield[c]'), 'the barrier is up');
  h.run(1);
  const explode = [];
  const fx = h.b.fx.bind(h.b);
  h.b.fx = (k, o) => { if (k === 'explode' && o.kind === 'breakFree') explode.push(h.b.time); return fx(k, o); };
  for (let i = 0; i < 4 && e.findBuff('ab:xiShield[c]'); i++) h.b.dealDamage(null, e, { amount: 3000, type: 'phys', canDodge: false, ignoreDef: true });
  assert.ok(!e.findBuff('ab:xiShield[c]'), 'the last layer broken');
  assert.equal(e.castLeft, 0, 'the cast ends with it');
  assert.equal(e.atkStandUntil, -Infinity, 'it no longer stands');
  assert.ok(near(sb.left, sb.cd, TICK + 1e-6), `the cooldown restarts at the break: ${sb.left}`);
  assert.ok(near(e.atkCd, e.s.interval, 1e-6), 'the main attack\'s cooldown restarts (resetMain, waitFirst)');
  h.run(dur);
  assert.equal(explode.length, 0, 'no burst');
});
