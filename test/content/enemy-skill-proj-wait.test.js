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
  assert.ok(Math.abs(tEnd - t0 - s.bb.hit_duration) <= 3 * TICK, `the cast ends with the channel (${(tEnd - t0).toFixed(3)} s)`);
  assert.ok(h.unit('t_wall2').elem.apoptosis > 0 || h.unit('t_wall2').findBuff('apoptosisBurst'), 'the burst lands despite the silence');
  stepUntil(h, () => casts.length >= 2, s.cooldown + 10);
  assert.ok(casts[1] >= tEnd + s.cooldown - 1e-6, `next cast ${(casts[1] - tEnd).toFixed(2)} s after the channel's end (cooldown ${s.cooldown})`);
});
