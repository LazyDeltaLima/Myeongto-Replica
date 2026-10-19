// test/sim/blaze2-downed-skill.test.js — maintainer report 2026-10-19 「이격 블레이즈 재능은 쓰러지더라도 일정 시간 이후
// 부활할 수 있는 대신, 해당 시간 동안은 공격할 수 없어. 근데 S3가 발동되는 버그」. 烛煌 (chess_char_5_03_a) T2 绝处重燃
// "倒地期间不能攻击": her MANUAL S3 is cast by the automatic operations (Skill.autoTrigger), outside the attack loop the
// downed buff's disarm holds — so it fired while she was down. The downed state now holds every skill cast too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const skip = !hasGeneratedData();
const B = 'chess_char_5_03_a';
const dummy = () => enemyRec({ key: 'enemy_dummy', hp: 1e9, atk: 0, speed: 0 });

for (const skillIndex of [0, 1, 2]) {
  test(`烛煌 S${skillIndex + 1}: no skill cast and no attack while downed; casts again after the revive`, { skip }, () => {
    const h = makeBattle({
      seed: 3, timeLimit: 300, autoFinish: false,
      defs: { enemies: { enemy_dummy: dummy() } },
      units: [{ chessId: B, row: 9, col: 5, dir: 'RIGHT', skillIndex }],
      enemies: [{ key: 'enemy_dummy', pos: [9, 7] }],
    });
    h.step();
    const u = h.unit(B);
    const casts = [], attacks = [];
    h.b.on('skillStart', (c) => { if (c.unit === u) casts.push({ t: h.b.time, downed: !!u.mem.downed }); }, { priority: -2000 });
    h.b.on('attack', (c) => { if (c.attacker === u) attacks.push({ t: h.b.time, downed: !!u.mem.downed }); }, { priority: -2000 });
    h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
    assert.ok(u.alive && u.mem.downed && u.form === 'downed', 'downed instead of dying');
    // she stays down while regenerating 3 %/s: fill her SP the whole time — every tick she would cast if she could
    h.runUntil(() => { u.skill.sp = u.skill.spCost; u.skill.charges = Math.max(u.skill.charges, 1); return !u.mem.downed; }, 120);
    assert.ok(!u.mem.downed && u.alive, 'revived');
    assert.deepEqual(casts.filter((c) => c.downed), [], 'no skill cast while downed');
    assert.deepEqual(attacks.filter((a) => a.downed), [], 'no attack while downed');
    assert.ok(!u.s.flags.silence && !u.s.flags.disarm, 'the revive lifts both');
    h.runUntil(() => casts.length > 0, 30);
    assert.ok(casts.length > 0, 'casts again once up');
  });
}
