// An enemy skill whose ranged ability waits for its projectile (`_waitForProjectileInvalid`, data/enemies.json skillCast
// `proj`) casts while that projectile lives (docs/rules/sim.md 「적 스킬 = 일반 공격 차례」 시전 길이; content/enemies.js
// projCastOver): the client's RangedAttack post-delay waits while `_CheckProjectileValid`, then the cast finishes and the
// skill's cooldown restarts (EnemySkill._OnCastFinish). 节日爵士乐手 狂欢式演奏 and 萨卡兹王庭军精锐术师 死亡之眼 are channels on such a
// projectile: the enemy stands without a normal attack while it channels and the cooldown runs from the channel's end
// (upstream #904). Until 2026-11-07 both casts lasted 0: the enemy walked on and the cooldown ran from the cast's start.
// 死亡之眼 holds 沉默反制 while it casts (PRTS; the prefab's `dwlock_skill_anti_flag[silence]`): a silence no longer cuts it.
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
const skb = (key, p) => E[key].skills.find((s) => s.prefabKey === p);

function arena(units) {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { t_wall: WALL('t_wall'), t_wall2: WALL('t_wall2') } }, kits: { t_wall: NOATK, t_wall2: NOATK }, enemies: [], units,
  });
}
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 } });

/** The times enemy `e` starts casting `name` (fx 'enemySkill'), recorded from now on. */
function castLog(h, e, name) {
  const at = [];
  const fx = h.b.fx.bind(h.b);
  h.b.fx = (k, o) => { if (k === 'enemySkill' && o.id === e.id && o.ability === name) at.push(h.b.time); return fx(k, o); };
  return at;
}
/** Steps until `pred` holds (a tick at a time), at most `max` s; the time it began to hold. */
function stepUntil(h, pred, max) {
  for (let t = 0; t < max; t += TICK) { if (pred()) return h.b.time; h.step(); }
  assert.fail('condition never held');
}

test('skillCast marks both channels as waiting for their projectile', () => {
  assert.equal(E.enemy_10034_cnvsax.skillCast.fire.proj, 1);
  assert.equal(E.enemy_1275_dwlock_2.skillCast.deatheye.subs[0].proj, 1);
});

test('节日爵士乐手 狂欢式演奏: the cast lasts the channel (no normal attack, standing) and the cooldown runs from its end', () => {
  const h = arena([{ chessId: 't_wall', row: 10, col: 5 }]);
  h.step();
  const e = put(h, 'enemy_10034_cnvsax', [10, 5]);   // blocked: revealed, it counter-attacks
  const s = skb('enemy_10034_cnvsax', 'fire');
  const casts = castLog(h, e, 'fire');
  stepUntil(h, () => casts.length >= 1, 30);
  const t0 = casts[0], a0 = e.stats.attacks;
  h.run(9);
  assert.ok(e.castLeft > 0, 'still casting 9 s in');
  assert.equal(e.stats.attacks, a0, 'no normal attack while it channels');
  const tEnd = stepUntil(h, () => !(e.castLeft > 0), 3);
  const len = tEnd - t0;
  assert.ok(len >= 10.5 - 1e-6 && len <= 10.5 + 3 * TICK, `the cast ends with the channel's 21st tick (${len.toFixed(3)} s)`);
  stepUntil(h, () => casts.length >= 2, s.cooldown + 5);
  assert.ok(casts[1] >= tEnd + s.cooldown - 1e-6, `next cast ${(casts[1] - tEnd).toFixed(2)} s after the channel's end (cooldown ${s.cooldown})`);
});

test('节日爵士乐手: a stun cuts the channel — no more hits, the cooldown restarts at the cut', () => {
  const h = arena([{ chessId: 't_wall', row: 10, col: 5 }]);
  h.step();
  const e = put(h, 'enemy_10034_cnvsax', [10, 5]);
  const s = skb('enemy_10034_cnvsax', 'fire');
  const casts = castLog(h, e, 'fire');
  stepUntil(h, () => casts.length >= 1, 30);
  h.run(2);
  h.b.applyStatus(e, 'stun', { duration: 0.5 });
  const tCut = h.b.time;
  h.step();
  assert.ok(!(e.castLeft > 0), 'the cast is cut');
  assert.equal(e.mem.jazzChannel, null, 'the channel ends with it');
  const burn = h.unit('t_wall').elem.burn;
  h.run(1.5);
  assert.ok(h.unit('t_wall').elem.burn <= burn + 1e-9, 'no more channel hits');
  stepUntil(h, () => casts.length >= 2, s.cooldown + 5);
  assert.ok(casts[1] >= tCut + s.cooldown - 1e-6 && casts[1] <= tCut + s.cooldown + 5, `next cast ${(casts[1] - tCut).toFixed(2)} s after the cut`);
});

test('萨卡兹王庭军精锐术师 死亡之眼: casts the 8 s channel standing; a silence does not cut it (沉默反制); cooldown from its end', () => {
  const h = arena([{ chessId: 't_wall', row: 9, col: 5 }, { chessId: 't_wall2', row: 10, col: 5 }]);
  h.step();
  const e = put(h, 'enemy_1275_dwlock_2', [9, 7]);
  const s = skb('enemy_1275_dwlock_2', 'DeathEye');
  const casts = castLog(h, e, 'DeathEye');
  stepUntil(h, () => casts.length >= 1, 30);
  const t0 = casts[0], a0 = e.stats.attacks;
  h.run(2);
  h.b.applyStatus(e, 'silence', { duration: 2 });
  h.run(5);
  assert.ok(e.castLeft > 0 && e.atkStandUntil > h.b.time, 'still casting and standing 7 s in, silenced meanwhile');
  assert.equal(e.stats.attacks, a0, 'no normal attack while it channels');
  const tEnd = stepUntil(h, () => !(e.castLeft > 0), 3);
  // the channel links after LineAttack's `_preDelay` and the line's flight (2 tiles at its speed), then lasts hit_duration
  const line = E.enemy_1275_dwlock_2.skillCast.deatheye.subs[0], v = E.enemy_1275_dwlock_2.skills[0].proj.speed;
  const want = line.pre + 2 / v + s.bb.hit_duration;
  assert.ok(Math.abs(tEnd - t0 - want) <= 3 * TICK, `the cast ends with the channel (${(tEnd - t0).toFixed(3)} s, want ${want})`);
  assert.ok(h.unit('t_wall2').elem.apoptosis > 0 || h.unit('t_wall2').findBuff('apoptosisBurst'), 'the burst lands despite the silence');
  stepUntil(h, () => casts.length >= 2, s.cooldown + 10);
  assert.ok(casts[1] >= tEnd + s.cooldown - 1e-6, `next cast ${(casts[1] - tEnd).toFixed(2)} s after the channel's end (cooldown ${s.cooldown})`);
});

// 2026-11-14: a projectile-waiting ability with no clip of its own still casts its `m_cachedDuration` — the attack time
// (`GetDuration` = `m_attackTime`, set to the attack time when no clip plays; `RangedAttack.<OnWaitForPostDelay>` waits
// what is left of it once the projectile is gone). 死亡之眼's LineAttack (`_timeMode` 0) lasts at least the enemy's attack
// interval: its target retreating 0.5 s in (the channel ends on its next 1 s beat), it stands until then (docs/rules/sim.md 「적 스킬 = 일반 공격 차례」 시전 길이).
test('萨卡兹王庭军精锐术师 死亡之眼: its target gone early, the cast still lasts its attack time (m_cachedDuration)', () => {
  const h = arena([{ chessId: 't_wall', row: 9, col: 5 }]);
  h.step();
  const e = put(h, 'enemy_1275_dwlock_2', [9, 7]);
  const casts = castLog(h, e, 'DeathEye');
  stepUntil(h, () => casts.length >= 1, 30);
  const t0 = casts[0], at = e.s.interval;
  assert.ok(at > 2, `its attack interval ${at} s`);
  h.run(0.5);
  h.b.retreat(h.unit('t_wall'));
  // (the channel looks at its target on its 1 s beat)
  h.run(1);
  assert.equal(e.mem.deathEye, null, 'the channel (its projectile) is over');
  assert.ok(e.castLeft > 0 && e.atkStandUntil > h.b.time, 'still casting and standing');
  const tEnd = stepUntil(h, () => !(e.castLeft > 0), at + 1);
  assert.ok(Math.abs(tEnd - t0 - at) <= 3 * TICK, `the cast ends at its attack time (${(tEnd - t0).toFixed(3)} s, interval ${at})`);
});

// 2026-11-14 (play report: one of several 节日爵士乐手 stood half-transparent on its blocker's tile and never moved). Its
// talent's buff `enemy_act38side[mode]` switches back to the Default mode as its 隐匿 returns, and `fire` — a skill of the
// Attack mode whose RangedAttack has `_interruptAbilityOnDetach` — is interrupted as it is detached (공식 클라에서 확인): the
// channel ends with the cast, the enemy walks on and the cooldown restarts, standing still while the skill is detached.
// Until then the engine's no-normal-attack check zeroed the cast's `castLeft` without ending it, so the open cast's stand
// (PROJ_WAIT_MAX, 60 s) outlived the channel and the skill's cooldown kept the 60 s too.
const fireOf = (e) => e.mem.ab.list.find((a) => a.name === 'fire');

test('节日爵士乐手: its blocker retreats mid-channel — the cast ends and it walks on at once, the cooldown restarts then', () => {
  const h = arena([{ chessId: 't_wall', row: 10, col: 5 }]);
  h.step();
  const e = h.spawn('enemy_10034_cnvsax', { pos: [10, 5], routeIndex: 0 });
  const s = skb('enemy_10034_cnvsax', 'fire');
  const casts = castLog(h, e, 'fire');
  stepUntil(h, () => casts.length >= 1, 30);
  h.run(1);
  assert.ok(e.castLeft > 0 && e.mem.jazzChannel, 'channelling');
  h.b.retreat(h.unit('t_wall'));
  h.run(3 * TICK);
  assert.ok(!(e.castLeft > 0) && !(e.atkStandUntil > h.b.time), 'no cast and no stand left');
  assert.equal(e.mem.jazzChannel, null, 'the channel is over');
  const x0 = e.x;
  h.run(1);
  assert.ok(Math.abs(e.x - x0) > 0.05, `it walks on (moved ${(e.x - x0).toFixed(3)})`);
  assert.ok(fireOf(e).left <= s.cooldown + 1e-6, `the cooldown restarted at the cut (${fireOf(e).left.toFixed(2)} s left, not the open cast's minute)`);
});

test('节日爵士乐手: its 隐匿 returns mid-channel — the mode switch cuts the cast and channel; the cooldown waits while hidden', () => {
  const h = arena([{ chessId: 't_wall', row: 10, col: 5 }]);
  h.step();
  const e = h.spawn('enemy_10034_cnvsax', { pos: [10, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const s = skb('enemy_10034_cnvsax', 'fire');
  const casts = castLog(h, e, 'fire');
  stepUntil(h, () => casts.length >= 1, 30);
  h.run(1);
  const w = h.unit('t_wall');
  h.b._unblock(e);
  w.s.flags.noBlock = true;   // it cannot be blocked again: its 隐匿 returns (0 s after a block)
  h.run(3 * TICK);
  assert.notEqual(e.mode, 'Attack', 'back in the Default mode');
  assert.ok(!(e.castLeft > 0) && !(e.atkStandUntil > h.b.time), 'the cast and its stand are cut');
  assert.equal(e.mem.jazzChannel, null, 'the channel ends with the cast');
  const burn = w.elem.burn, left = fireOf(e).left;
  assert.ok(Math.abs(left - s.cooldown) <= 4 * TICK, `the cooldown restarted in full (${left.toFixed(2)})`);
  h.run(2);
  assert.ok(w.elem.burn <= burn + 1e-9, 'no channel hits under 隐匿');
  assert.ok(Math.abs(fireOf(e).left - left) <= 1e-9, 'the detached skill\'s cooldown stands still');
});
