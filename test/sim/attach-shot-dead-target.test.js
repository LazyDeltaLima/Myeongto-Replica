// test/sim/attach-shot-dead-target.test.js — maintainer report 2026-10-31 「이격 블레이즈 S3가 발사된 후, 목표 적이 죽으면
// 타격 이펙트가 안 나옴」. 烛煌 S3's bolt (projectile_chr_blaze2_s3: an instant AttachToTarget, `_delayToStart` 0.3) used to be
// dropped whole when its target died before it landed. The official projectile does not stop on its target's death
// (`_stopIfTargetDead` 0) and stays on the spot it was put at (`_keepUpdate` 0): it lands there, hitting the enemies around
// that spot (server/sim/ai.js, the attack path's AttachToTarget branch). 维什戴尔 S2's
// shot (instant, 0.1 s) takes the same branch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const skip = !hasGeneratedData();
const B = 'chess_char_5_03_a';
const BLAZE = { chessId: B, row: 9, col: 3, dir: 'RIGHT', skillIndex: 2 };
// 维什戴尔 S2 (projectile_chr_wisdel_s2: instant, `_delayToStart` 0.1), the 6★ 선발 pick with her module — her S2 takes 3
// targets, so both dummies are her own: only her shot's data is checked (the branch is 烛煌's)
const WISDEL = { uid: 1, chessId: 'chess_char_6_diy1_a', diy: { slot: 6, charId: 'char_1035_wisdel', skillIndex: 1, uniEquipId: 'uniequip_002_wisdel' }, elite: true, row: 9, col: 3, dir: 'RIGHT' };

/** `unit` with its skill up and two dummies 1 tile apart; `kill` = kill its first skill shot's target the moment it is fired. */
function run(unit, kill, delay) {
  const h = makeBattle({
    seed: 5, timeLimit: 120, autoFinish: false,
    defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, atk: 0, speed: 0 }) } },
    units: [unit],
    enemies: [{ key: 'enemy_dummy', pos: [9, 6] }, { key: 'enemy_dummy', pos: [9, 7] }],
  });
  h.step();
  const u = h.unit(unit.chessId);
  const shots = [], hits = [];
  h.b.on('attack', (c) => {
    if (c.attacker !== u || !c.isSkill || shots.length) return;
    const t = c.targets[0];
    shots.push({ t: h.b.time, target: t });
    if (kill) h.b.dealDamage(null, t, { amount: 1e12, type: 'true' });
  }, { priority: -2000 });
  h.b.on('hit', (c) => { if (c.source === u && c.dmg?.isAttack && c.dmg.isSkill) hits.push({ t: h.b.time, target: c.target }); }, { priority: -2000 });
  h.runUntil(() => { if (!u.skill.active) { u.skill.sp = u.skill.spCost; u.skill.charges = Math.max(u.skill.charges, 1); } return shots.length > 0; }, 60);
  assert.equal(shots.length, 1, 'her S3 fired');
  h.runUntil(() => false, 0.5);
  const first = shots[0];
  return { first, hits: hits.filter((x) => x.t >= first.t && x.t <= first.t + delay + 0.05 + 1e-9) };
}

test('烛煌 S3: the bolt lands 0.3 s after the shot on its target and the enemy beside it', { skip }, () => {
  const { first, hits } = run(BLAZE, false, 0.3);
  assert.ok(hits.some((x) => x.target === first.target), 'the main target is hit');
  assert.ok(hits.some((x) => x.target !== first.target), 'the splash hits the enemy beside it');
  assert.ok(hits.every((x) => x.t >= first.t + 0.3 - 1e-6), 'at the end of the 0.3 s delay');
});

test('烛煌 S3: a bolt whose target died before it landed still hits the enemies around its spot', { skip }, () => {
  const { first, hits } = run(BLAZE, true, 0.3);
  assert.ok(!first.target.alive, 'the target died at the shot');
  assert.ok(!hits.some((x) => x.target === first.target), 'the dead target is not hit');
  assert.ok(hits.some((x) => x.target !== first.target && x.t >= first.t + 0.3 - 1e-6), 'the enemy beside it is hit 0.3 s later');
});

test('the instant AttachToTarget shots that land on their spot: 烛煌 S3 and 维什戴尔 S2 (迷迭香 S2 is not instant)', { skip }, () => {
  const shot = (unit, i) => {
    const h = makeBattle({ seed: 5, timeLimit: 10, autoFinish: false, units: [unit] });
    h.step();
    return h.unit(unit.chessId).def.shot.skills[i];
  };
  const ROSMON = { chessId: 'chess_char_6_12_a', row: 9, col: 3, dir: 'RIGHT', skillIndex: 1 };
  assert.deepEqual([shot(BLAZE, 2).key, shot(BLAZE, 2).instant], ['projectile_chr_blaze2_s3', true]);
  assert.deepEqual([shot(WISDEL, 1).key, shot(WISDEL, 1).instant], ['projectile_chr_wisdel_s2', true]);
  assert.deepEqual([shot(ROSMON, 1).key, shot(ROSMON, 1).instant, shot(ROSMON, 1).land], ['projectile_chr_rosmon_s2', undefined, 1.2]);
});
