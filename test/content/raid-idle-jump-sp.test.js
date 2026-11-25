// test/content/raid-idle-jump-sp.test.js — the 突袭 (raidShip) jumps against the official buff graph
// act1autochess_bond_eff_raid (src/docs/rules/sim.md 「卫戍协议 버프 그래프·공식 클라 맞춤」 기습):
// - the 10 s no-attack jump ([attack]) lands a new character with its initial SP plus the SP it had
//   (`AssignCurSpToBB` _isRatio → `modify_sp[ratio]`, an added SP modifier) — a skill running at the jump had spent its
//   SP, so the landing has the initial SP (player report: 锏 with 变形同构体 often landed with SP 0 — her S3 slashes run in
//   the Skill state and make no ON_AFTER_ATTACK, so the 10 s can run out in the middle of S3);
// - the ready-skill jump (CheckCharSkillAvailable → BasicSkill.IsAvailable → ownerCanUseSkill) waits while the member is
//   stunned or silenced; the 10 s one does not.
// Run: node --test test/content/raid-idle-jump-sp.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const RAID = { raidShip: { count: 2, active: true, tier: 1, layers: 0 } };
/** 变形同构体 + 突袭手雷: the item that makes her a 突袭 member (the report's set-up) */
const ISOMORPH = ['chess_item_6_09_e_a', 'chess_item_3_11_e_a'];
const RULE = ' (Battle._deploy keepSp / raidPoll; docs/rules/sim.md 「卫戍协议 버프 그래프·공식 클라 맞춤」 기습)';

/** @param {Record<string, any>} unit @param {Record<string, any>} [extra] */
function field(unit, extra = {}) {
  /** @type {{ t: number, sp: number, active: boolean, before: number }[]} */
  const landings = [];
  let before = NaN;
  const h = makeBattle({
    defs: { enemies: { e_walk: enemyRec({ key: 'e_walk', hp: 1e7, speed: 0.4, atk: 0 }) } },
    timeLimit: 40, autoFinish: false, seed: 1, flags: { dpInit: 99, dpPerSec: 0, dpMax: 999 },
    bonds: RAID, hooks: ['death', 'skillStart', 'skillEnd'],
    units: [{ uid: 1, row: 12, col: 3, dir: 'RIGHT', items: ISOMORPH, ...unit }],
    enemies: [{ key: 'e_walk', time: 0.5, routeIndex: 0, count: 1 }],
    setup: (b) => {
      // priority 1000: right after the landing's SP is set
      b.on('deploy', ({ unit: u, initial }) => {
        if (u.uid === 1 && !initial) landings.push({ t: b.time, sp: u.skill.spTotal, active: u.skill.active, before });
      }, { priority: 1000 });
      // the SP as the jump's retreat leaves the field
      b.on('death', ({ unit: u }) => { if (u.uid === 1) before = u.skill.spTotal; });
    },
    ...extra,
  });
  h.step();
  return { h, landings, u: h.b.allyUnits.find((x) => x.uid === 1) };
}

test('锏 S3: a 10 s no-attack jump in the middle of S3 ends it and lands with her initial SP, not the spent 0', () => {
  for (const chessId of ['chess_char_6_19_a', 'chess_char_6_19_b']) {
    const { h, landings, u } = field({ chessId });
    const sk = u.skill;
    assert.equal(sk.id, 'skchr_blkkgt_3');
    assert.ok(sk.initSp > 0, `${chessId}: S3 has an initial SP (${sk.initSp})`);
    // S3 runs (SP spent); her last attack long ago — the 10 s run out with the slashes going
    assert.ok(h.runUntil(() => sk.active, 40), `${chessId}: S3 cast`);
    const t0 = h.b.time;
    assert.equal(sk.spTotal, 0, 'S3 spent its SP');
    u.lastAttackAt = -Infinity;
    u.deployedAt = t0 - 20;
    u.mem['bond:raidShip'] = undefined;
    const n = landings.length;
    h.run(0.6);
    assert.ok(h.hooksOf('death').some((c) => c.unit === u && c.reason === 'raid' && c.t >= t0), `${chessId}: jumped during S3`);
    assert.ok(h.hooksOf('skillEnd').some((c) => c.unit === u && c.t >= t0), 'the jump ended S3');
    assert.equal(landings.length, n + 1);
    assert.equal(landings[n].sp, sk.initSp, `${chessId}: landed with the initial SP ${sk.initSp} (official new character), got ${landings[n].sp}${RULE}`);
    assert.equal(landings[n].active, false);
    checkInvariants(h.b);
  }
});

test('突袭 10 s jump: the SP before the jump comes on top of the initial SP, rounded, capped at the maximum', () => {
  const jump = (/** @type {number} */ before) => {
    const { h, landings, u } = field({ chessId: 'chess_char_6_19_a' });
    const sk = u.skill;
    h.run(0.5);
    sk.setSpTotal(before);
    u.lastAttackAt = -Infinity;
    u.deployedAt = h.b.time - 20;
    u.mem['bond:raidShip'] = undefined;
    const n = landings.length;
    assert.ok(h.runUntil(() => landings.length > n, 1), `jumped (SP set to ${before})`);
    checkInvariants(h.b);
    return { ...landings[n], init: sk.initSp, cost: sk.spCost };
  };
  const a = jump(12.4), init = a.init;
  assert.ok(a.before > 12.4 && a.before < 13 && a.before !== Math.round(a.before), `fractional SP before the jump (${a.before})`);
  assert.equal(a.sp, init + Math.round(a.before), `${a.before} kept → +${Math.round(a.before)} on the initial SP ${init}${RULE}`);
  const b = jump(a.cost - 2);
  assert.equal(b.sp, b.cost, `capped at the skill cost (one charge: ready)${RULE}`);
});

test('突袭 ready-skill jump waits while the member is stunned or silenced; the 10 s jump does not', () => {
  for (const status of ['stun', 'silence']) {
    // at 0.5 s: her S3 (AUTO) made ready, no enemy in her "1-1" box, the 10 s far away
    const { h, u } = field({ chessId: 'chess_char_6_19_a' });
    const jumps = () => h.hooksOf('death').filter((c) => c.unit === u && c.reason === 'raid').length;
    h.run(0.5);
    assert.ok(h.b.applyStatus(u, status, { duration: 1 }), `${status} applied`);
    u.skill.setSpTotal(u.skill.spCost);
    assert.ok(u.skill.ready && !u.skill.active);
    h.run(0.5);
    assert.equal(jumps(), 0, `${status}: no ready-skill jump${RULE}`);
    if (status === 'stun') {
      // still stunned: the 10 s path has no such condition
      u.lastAttackAt = -Infinity;
      u.deployedAt = h.b.time - 20;
      h.run(0.3);
      assert.equal(jumps(), 1, `stunned: the 10 s jump still goes${RULE}`);
    } else {
      assert.ok(h.runUntil(() => jumps() > 0, 1), 'silence over: the ready-skill jump goes');
    }
    checkInvariants(h.b);
  }
});
