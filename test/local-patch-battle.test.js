// Local battle fixes from the 2026-10-06 playtest reports (docs/LOCAL-PATCH.md "전투 버그 수정 (2026-10-06 플레이 제보)").
// Kept apart from test/local-patch.test.js so concurrent edits there never collide. Each case runs the real match path
// where it matters (Match board → m._normalOpts → buildBattleSpec → browser createBattleFromSpec).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeMatch, give } from './match/harness.js';
import { buildBattleSpec, createBattleFromSpec } from '../server/sim/spec.js';
import { makeBattle } from './helpers/battleHarness.js';
import { resolveRoles } from '../tools/assets/anim-roles.mjs';
import { applyAnimOverrides } from '../tools/assets/anim-overrides.mjs';

const ASSETS = JSON.parse(readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8'));

/** A solo match at prep round `round` on m04 with an empty board; `loadout` = the seat's loadout. */
function prep(loadout = {}, round = 4) {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, loadout }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
  h.toPrep(round);
  h.setStage('act2autochess_m04');
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const place = (id, r, c, dir = 'RIGHT') => {
    const piece = give(m, ps, id);
    const res = m.handle('p_0', { t: 'g.move', uid: piece.uid, to: { area: 'board', row: r, col: c }, dir });
    assert.ok(res.ok, `${id} on ${r},${c}: ${res.error ?? ''}`);
  };
  const battle = () => {
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lpb', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    return createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  };
  return { m, ps, place, battle };
}

describe('宴 S2 落地斩·破门 is not drawn as S1 分神 (tools/assets/anim-overrides.mjs)', () => {
  test('the sim fights with the selected skill (real match path): S1 = 分神 on cast, S2 = HP loss + ATK on deployment', () => {
    for (const [skill, want] of [[0, 'skchr_utage_1'], [1, 'skchr_utage_2']]) {
      const { place, battle } = prep({ chess_char_1_18_a: { skill } });
      place('chess_char_1_18_b', 10, 4);
      const b = battle();
      b.start();
      while (b.time < 1) b.step();
      const u = b.allyUnits.find((x) => x.kind === 'op');
      assert.equal(u.skill.id, want);
      if (skill === 1) {
        assert.ok(u.skill.active, 'S2 runs from the deployment');
        assert.ok(Math.abs(u.hp / u.s.maxHp - 0.5) < 0.01, 'lost 50 % current HP');
      } else {
        assert.ok(!u.skill.active && u.hp === u.s.maxHp, 'S1 waits for SP');
      }
    }
  });

  test('S2 does not touch her block count (official 武者 1): she blocks with S2 (maintainer follow-up 「S2로 해놔도 적을 저지 못했었어」)', () => {
    // real match path: block count 1 while S2 runs and after it; S1 分神 alone sets 0
    for (const skill of [0, 1]) {
      const { place, battle } = prep({ chess_char_1_18_a: { skill } });
      place('chess_char_1_18_b', 10, 4);
      const b = battle();
      b.start();
      const u = b.allyUnits.find((x) => x.kind === 'op');
      const seen = new Set();
      while (b.time < 20) { b.step(); seen.add(`${u.skill.active ? 'on' : 'off'}:${u.s.blockCnt}`); }
      if (skill === 1) assert.deepEqual([...seen].sort(), ['off:1', 'on:1'], 'S2 on and off: block 1');
    }
    // an enemy she cannot kill before it reaches her is blocked with S2 selected
    const h = makeBattle({ seed: 3, captureNoisy: true, units: [{ chessId: 'chess_char_1_18_b', row: 9, col: 5, uid: 1, skillIndex: 1 }],
      enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 1 }] });
    const u = h.unit('chess_char_1_18_b');
    h.runUntil(() => u.blocking.length > 0, 40);
    assert.equal(u.skill.id, 'skchr_utage_2');
    assert.equal(u.blocking.length, 1, '大鲍勃 is blocked by 宴 (S2)');
  });

  test('her model has one skill clip family (Skill_Start/Loop/End = S1 分神): S2 attacks with Attack (client S2 mode _animKey "Attack")', () => {
    const op = ASSETS.chars.char_337_utage;
    for (const dir of ['front', 'back']) {
      const an = op.spine[dir].anims;
      assert.equal(an.skills['0'].loop, 'Skill_Loop', `${dir}: S1 keeps the 分神 stance`);
      assert.equal(an.skills['1'].via, 'attack', `${dir}: S2 is the attack clip`);
      assert.equal(an.skills['1'].loop, an.attack.loop);
      assert.equal(an.skills['1'].begin, null);
      assert.equal(an.skill.index, 1);
      assert.equal(an.skill.via, 'attack', `${dir}: the primary (default S2) clip too`);
    }
    // the pipeline makes the same entry (tools/assets/spine.mjs → applyAnimOverrides)
    const names = Object.keys(op.spine.front.animations);
    const roles = applyAnimOverrides('op:char_337_utage:front', resolveRoles(names, { skillIndices: [1, 0], durations: op.spine.front.animations }));
    assert.deepEqual(roles.skills['1'], op.spine.front.anims.skills['1']);
    assert.deepEqual(roles.skills['0'], op.spine.front.anims.skills['0']);
    // another model is untouched
    assert.notEqual(applyAnimOverrides('op:char_102_texas:front', resolveRoles(names, { skillIndices: [1, 0] })).skills['1'].via, 'attack');
  });

  test('an override clip one side lacks is dropped: 泥岩 Back has no Skill_2_Begin (S3 starts in Skill_2_Attack / _Idle)', () => {
    const back = ['Attack', 'Default', 'Idle', 'Skill_1', 'Skill_2_Attack', 'Skill_2_End', 'Skill_2_Idle', 'Start'];
    const r = applyAnimOverrides('op:char_311_mudrok:back', resolveRoles(back, { skillIndices: [0, 1, 2] }), back);
    assert.equal(r.skills['2'].begin, null);
    assert.equal(r.skills['2'].loop, 'Skill_2_Attack');
    const front = [...back, 'Skill_2_Begin', 'Skill_2_Awake', 'Skill_2_Sleep'];
    assert.equal(applyAnimOverrides('op:char_311_mudrok:front', resolveRoles(front, { skillIndices: [0, 1, 2] }), front).skills['2'].begin, 'Skill_2_Begin');
    const mud = ASSETS.chars.char_311_mudrok.spine;
    assert.equal(mud.back.anims.skills['2'].begin, null, 'the manifest (tools/fetch-assets.mjs) too');
  });
});

describe('魔王 S3 编织重构现世: HP redistribution takes every ally in range, 不成为治疗目标 ones included (kits/tier4.js)', () => {
  test('real match path: a 武者 (宴, never healed) in her range ends at the same HP ratio as the others', () => {
    const { place, battle } = prep({}, 4);
    place('chess_char_4_25_b', 10, 4);
    place('chess_char_1_18_b', 10, 5); // 宴: 不成为其他角色的治疗目标
    place('chess_char_1_19_a', 9, 4);
    place('chess_char_1_01_a', 11, 4);
    const b = battle();
    b.start();
    while (b.time < 1) b.step();
    const ce = b.allyUnits.find((u) => u.def.name === '魔王');
    const ut = b.allyUnits.find((u) => u.def.name === '宴');
    assert.equal(ce.skill.id, 'skchr_cetsyr_3');
    ce.skill.activate('manual', { free: true });
    assert.ok(ce.skill.active);
    assert.ok(b.alliesInGrid(ce).includes(ut), '宴 stands in the S3 range');
    ut.hp = ut.s.maxHp * 0.2;
    let seen = null;
    while (b.time < 6 && !seen) {
      b.step();
      for (const e of b.drainEvents()) if (e[0] === 'fx' && e[1] === 'redistribute') seen = { ut: ut.hp / ut.s.maxHp, ce: ce.hp / ce.s.maxHp };
    }
    assert.ok(seen, 'a redistribution ran');
    assert.ok(seen.ut > 0.3, `宴 got HP from the pool (${seen.ut.toFixed(3)})`);
    assert.ok(Math.abs(seen.ut - seen.ce) < 0.02, `same ratio (宴 ${seen.ut.toFixed(3)}, 魔王 ${seen.ce.toFixed(3)})`);
  });
});

describe('enemy splash vs a 隐匿 / 迷彩 operator (targeting.js areaSelectable — upstream, locked here)', () => {
  // PRTS 术语释义 隐匿 "不阻挡时不成为敌方攻击的目标"; 异常效果 隐匿 (无法选择) — an enemy area selection skips it.
  // 迷彩 "不阻挡时不成为敌方普通攻击的目标（无法躲避溅射类攻击）"; 异常效果 "所有光环类能力、以及涉及中点判定/格子判定的效果均不受迷彩制约".
  const run = (flag) => {
    const h = makeBattle({ seed: 3, captureNoisy: true, timeLimit: 40, units: [
      { chessId: 'chess_char_1_01_a', row: 10, col: 5, uid: 1 },
      ...[[10, 6], [11, 5], [9, 5], [11, 6]].map(([row, col], i) => ({ chessId: 'chess_char_1_19_a', row, col, uid: 2 + i })),
    ], enemies: [{ key: 'enemy_1500_skulsr', time: 0, route: 1, count: 1 }] }); // 碎骨: unblocked grenade, 3×3 splash
    h.step(1);
    const ops = h.allies().filter((u) => u.kind === 'op');
    for (const u of ops.slice(1)) h.b.addBuff(u, { key: `t:${flag}`, flags: { [flag]: true }, persist: true });
    h.run(30);
    const splash = h.hooksOf('damaged').filter((x) => x.target?.side === 'ally' && x.dmg?.tags?.includes('splash'));
    return { splash, flagged: new Set(ops.slice(1)) };
  };
  test('萨卡兹枯朽战士 (살카즈 부패의 전사) death: its 【污染秽蚀】 hurts a 隐匿 (叙拉古 6) operator — PRTS 「无视无法选择、迷彩」, a zone, not splash', () => {
    const h = makeBattle({ seed: 3, captureNoisy: true, timeLimit: 30, autoFinish: false,
      units: [{ chessId: 'chess_char_1_01_a', row: 9, col: 6, uid: 1 }],
      enemies: [{ key: 'enemy_1267_nhpbr', time: 0, route: 0, count: 1 }] });
    const op = h.unit('chess_char_1_01_a');
    h.step(1);
    h.b.addBuff(op, { key: 'bond:siracusa:stealth', duration: 30, flags: { stealth: true }, status: 'stealth' }); // the bond's own buff (bonds/core.js)
    const e = h.enemies()[0];
    h.runUntil(() => Math.hypot(e.x - op.x, e.y - op.y) < 1.5, 20);
    h.b.dealDamage(null, e, { amount: 1e9, type: 'true', sourceless: true });
    assert.ok(!e.alive);
    h.run(3);
    const hits = h.hooksOf('damaged').filter((x) => x.target === op && x.dmg?.tags?.includes('pollution'));
    assert.ok(op.s.flags.stealth, 'still 隐匿');
    assert.ok(hits.length >= 2, `the zone ticks on the 隐匿 operator (${hits.length})`);
  });

  test('隐匿 neighbours of the struck operator take no splash; 迷彩 ones do', () => {
    const st = run('stealth');
    assert.equal(st.splash.filter((x) => st.flagged.has(x.target)).length, 0, '隐匿: no splash');
    const ca = run('camou');
    assert.ok(ca.splash.filter((x) => ca.flagged.has(x.target)).length > 0, '迷彩: splash still lands');
  });
});
