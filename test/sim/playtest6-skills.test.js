// test/sim/playtest6-skills.test.js — user playtest #6, workstream WE (skill triggers and buffs), with the real data and kits.
//   #15 "技能范围比攻击范围大的技能在敌人进入技能范围时不触发": PRTS 卫戍协议/帮助 §作战阶段 技能操作 — "携带拥有技能范围的技能
//       （非攻击距离增加）的干员：不通过普通攻击/治疗触发技能，仅在技能范围内存在敌人（无视其不可选中）时释放技能" (SKILL_RANGE);
//       an attack-range change keeps the basic strategy (since 0.2.0 ACTIVE_RANGE when the running range strictly contains
//       the own one — the owner's rule of 2026-10-05); the class rows (重装 "不受技能范围影响，受到伤害时释放技能" …) cover every
//       MANUAL skill of the class; "自动操作具有3s冷却"; GDGLOW_SKILL_2 "全场存在可选目标时释放技能".
//   #16 "古米的治疗队友的技能在身边队友受伤时并没触发，古米接敌之后才触发": 备用军粮 is 自动触发 (no 技能策略); PRTS 备注 "此技能
//       在存在生命值不满的可治疗角色时可触发；技能触发后古米将切换至治疗模式…直至古米完成一次普通攻击的治疗". Audit: 塞雷娅
//       S1 "仅在周围有符合血量条件的友方单位时可触发，触发时会替换当次攻击" — checked at her attack (≤ half HP), no waiting.
//   #8  "新约能天使2技能给队友套护盾好像没生效": PRTS 备注 "选择的友方干员为攻击范围内仇恨值最高的我方干员"; "获得的屏障均以
//       自身生命上限为标准计算；屏障每秒衰减量为：初始屏障量/30".
//   #3  "忍冬的叙拉古阵营隐身不会结束" (friend): the 叙拉古 隐匿 lasts its bond time; her S3 迷彩 (ba.camou "不阻挡时不成为敌方
//       普通攻击的目标"; PRTS 异常效果: "与'阻挡时解除'没有直接关系") keeps every enemy but the one she blocks off her, as
//       隐匿 does, lasts until her next cast ("直至下一次开启技能"), is not 隐匿 and no longer merges with a timed 隐匿 (伪装服).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { absoluteRangeKeys, canTargetAlly } from '../../server/sim/targeting.js';
import { flagsOf } from '../../server/sim/snapshot.js';
import { AUTO_TRIGGER_INTERVAL, BLOCK_SKILL_TICK, BORN_TIME, COLS } from '../../server/sim/constants.js';

const BLOCK_S = BLOCK_SKILL_TICK * AUTO_TRIGGER_INTERVAL;
import { UF } from '../../shared/constants.js';
import { statusIconKey } from '../../public/js/render/style.js';

const ds = getDefaultSource();
const raw = (id) => ds.rawChess(id);
const skillOf = (id, skillId) => raw(id).skills.find((s) => s.skillId === skillId);
const approx = (a, b, msg = '', eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg} ${a} ≈ ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e7, speed: 0, ...o });
const noGarrison = (...ids) => Object.fromEntries(ids.map((id) => [id, { ...raw(id), garrisonIds: [] }]));
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };
const HOOKS = ['damaged', 'heal', 'skillStart', 'skillEnd', 'attack', 'statusApplied'];
const run = (o) => makeBattle({ seed: 3, autoFinish: false, timeLimit: 300, hooks: HOOKS, captureNoisy: true, ...o });
const starts = (h, u) => h.hooksOf('skillStart').filter((c) => c.unit === u);
const fill = (u) => u.skill.gainSp(u.skill.spCost * u.skill.maxCharges + 1, 'test');

// =================================================================================================================
// #15 skill ranges

test('#15 德克萨斯 S2 剑雨 (skill range 13 tiles, attack range 2): an enemy entering the skill range casts it — no attack; a stealthed one does not count (client _DefaultTriggerSkill: selectable enemies; maintainer decision 2026-10-11)', () => {
  const id = 'chess_char_1_08_a';
  const stealthy = dummy('enemy_sneak');
  for (const sneak of [false, true]) {
    const h = run({ defs: { enemies: { enemy_d: dummy('enemy_d'), enemy_sneak: stealthy }, chess: noGarrison(id) }, units: [{ chessId: id, row: 10, col: 4 }] });
    const u = h.unit(id);
    assert.equal(u.skill.id, 'skchr_texas_2');
    assert.equal(u.skill.rule, 'DEFAULT');
    assert.ok(u.skill.triggerGrid?.length, 'on its rangeId');
    h.step();
    fill(u);
    h.run(1);
    assert.equal(u.skill.activations, 0, 'nobody in the skill range');
    // (10,6): two tiles ahead — inside 剑雨's range, outside her 2-tile attack range
    const keys = new Set(absoluteRangeKeys(u.def.skill.rangeGrid, 10, 4, u.dir, 0));
    assert.ok(keys.has(10 * COLS + 6) && !u.rangeKeySet.has(10 * COLS + 6));
    const e = h.spawn(sneak ? 'enemy_sneak' : 'enemy_d', { pos: [10, 6] });
    if (sneak) h.b.addBuff(e, { key: 'ab:stealth', flags: { stealth: true }, persist: true });
    h.run(0.25);
    assert.equal(u.skill.activations, sneak ? 0 : 1, sneak ? 'a stealthed enemy is no selectable target' : 'cast on the next 0.2 s pass');
    assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u).length, 0, 'without attacking');
    done(h);
  }
});

test('#15 audit: every MANUAL chess skill with a rangeId (DEFAULT on that grid — client _DefaultTriggerSkill) casts with an enemy only on a skill-range tile (normal + elite)', () => {
  const pool = ds.chessIds().filter((id) => (raw(id).skills || []).length); // hidden chess too (effects bring them)
  let n = 0;
  for (const id of pool) {
    for (const s of raw(id).skills || []) {
      if (s.skillType !== 'MANUAL' || !['SKILL_RANGE', 'DEFAULT'].includes(s.trigger?.rule) || !s.trigger.customRangeGrid?.length || s.trigger.allies) continue;
      const h = run({ defs: { enemies: { enemy_d: dummy('enemy_d') }, chess: noGarrison(id) }, units: [{ chessId: id, row: 10, col: 5, skillIndex: s.index }] });
      const u = h.unit(id);
      assert.equal(u.skill.id, s.skillId);
      if (u.skill.rule !== s.trigger.rule || !u.skill.triggerGrid) { done(h); continue; }   // (a kit with a rule of its own)
      h.step();
      const skill = absoluteRangeKeys(s.rangeGrid, 10, 5, u.dir, 0).filter((k) => { const r = Math.floor(k / COLS), c = k % COLS; return r >= 9 && r <= 12 && c >= 2 && c <= 10 && k !== 10 * COLS + 5; });
      const outside = skill.filter((k) => !u.rangeKeySet.has(k));
      const k = (outside.length ? outside : skill)[0];
      if (k == null) { done(h); continue; }   // (a grid of her own tile only: 山 S2 0-1)
      fill(u);
      h.spawn('enemy_d', { pos: [Math.floor(k / COLS), k % COLS] });
      h.run(0.5);
      assert.ok(u.skill.activations >= 1, `${id} ${s.skillId} (${s.name}): cast by an enemy on its skill range${outside.length ? ' outside the attack range' : ''}`);
      done(h);
      n++;
    }
  }
  assert.ok(n >= 40, `${n} skills with a trigger grid`);
});

test('#15 an attack-range change ("攻击范围扩大") is the basic strategy on its rangeId (client _DefaultTriggerSkill, maintainer decision 2026-10-11): 银灰 S3 casts on an enemy inside the 3-7', () => {
  const id = 'chess_char_4_22_a';
  const h = run({ defs: { enemies: { enemy_d: dummy('enemy_d') }, chess: noGarrison(id) }, units: [{ chessId: id, row: 10, col: 3 }] });
  const u = h.unit(id);
  assert.equal(u.skill.id, 'skchr_svrash_3');
  assert.equal(u.skill.rule, 'DEFAULT');
  assert.equal(skillOf(id, 'skchr_svrash_3').trigger.rawRule, 'DEFAULT', 'the official strategy: the basic one');
  h.step();
  fill(u);
  // a field tile of the expanded range outside his own (his row has none: 3-7 and 3-12 share it)
  const far = absoluteRangeKeys(u.def.skill.rangeGrid, 10, 3, u.dir, 0).find((k) => !u.rangeKeySet.has(k) && Math.floor(k / COLS) >= 9 && Math.floor(k / COLS) <= 12);
  assert.ok(far != null);
  h.spawn('enemy_d', { pos: [Math.floor(far / COLS), far % COLS] });
  assert.ok(h.runUntil(() => u.skill.activations === 1, 3), 'an enemy only in the expanded range: cast, no attack needed');
  assert.equal(starts(h, u)[0].reason, 'DEFAULT');
  done(h);
});

// TAKE_DAMAGE (client `AutoChessBattleTrigger`): the hit casts it at once, and the 0.2 s pass sends type 12 down SEARCH's
// branch (`_TrySearchTarget`: the unit's attack trigger) — an enemy in her attack range casts it too, none only in the
// skill range
test('#15 重装 "不受技能范围影响，受到伤害时释放技能": 瑕光 S3 ignores enemies only in its skill range; an enemy she attacks or a hit casts it', () => {
  const id = 'chess_char_3_12_a';
  const h = run({ defs: { enemies: { enemy_d: dummy('enemy_d'), enemy_hit: dummy('enemy_hit', { atk: 200, bat: 1 }) }, chess: noGarrison(id) }, units: [{ chessId: id, row: 10, col: 4 }] });
  const u = h.unit(id);
  assert.equal(u.skill.id, 'skchr_blemsh_3');
  assert.equal(u.skill.rule, 'TAKE_DAMAGE');
  h.step();
  fill(u);
  // (10,6): in her skill range, outside her attack range — no cast
  const far = absoluteRangeKeys(u.def.skill.rangeGrid, 10, 4, u.dir, 0).find((k) => !u.rangeKeySet.has(k) && Math.floor(k / COLS) === 10);
  assert.ok(far != null, 'a skill-range tile beyond her attack range');
  h.spawn('enemy_d', { pos: [10, far % COLS] });
  h.run(2);
  assert.equal(u.skill.activations, 0, 'an enemy only in the skill range, she is not hit');
  // an enemy she attacks (on her tile): the pass's SEARCH branch casts it, no hit needed
  h.spawn('enemy_d', { pos: [10, 4] });
  assert.ok(h.runUntil(() => u.skill.activations === 1, 3), 'a target of her attack casts it');
  assert.equal(starts(h, u)[0].reason, 'TAKE_DAMAGE');
  assert.equal(h.hooksOf('damaged').filter((d) => d.target === u).length, 0, 'before any hit');
  done(h);
  // and a hit casts it at once with nothing in her range (a ranged hitter beyond it)
  const g = run({ defs: { enemies: { enemy_arc: dummy('enemy_arc', { atk: 200, bat: 1, range: 9 }) }, chess: noGarrison(id) }, units: [{ chessId: id, row: 10, col: 4 }] });
  const v = g.unit(id);
  g.step();
  fill(v);
  g.spawn('enemy_arc', { pos: [10, 9] });
  assert.ok(g.runUntil(() => v.skill.activations === 1, 5), 'the first hit casts it');
  assert.equal(starts(g, v)[0].reason, 'TAKE_DAMAGE');
  assert.ok(g.hooksOf('damaged').some((d) => d.target === v), 'after a hit');
  done(g);
});

test('#15 the automatic operations block the caster 10 passes (client BLOCK_SKILL_TICK, 2026-10-11 — 3 s before): 锏 S2 (2 charges, skill range) spends its charges 2.2 s apart', () => {
  const id = 'chess_char_6_19_b';
  const s = skillOf(id, 'skchr_blkkgt_2');
  const h = run({ defs: { enemies: { enemy_d: dummy('enemy_d') }, chess: noGarrison(id) }, units: [{ chessId: id, row: 10, col: 4, skillIndex: s.index }], enemies: [{ key: 'enemy_d', pos: [10, 5] }] });
  const u = h.unit(id);
  assert.equal(u.skill.maxCharges, 2);
  h.step();
  fill(u);
  assert.ok(h.runUntil(() => u.skill.activations === 1, 1));
  const t1 = h.b.time;
  h.run(BLOCK_S - 0.2);
  assert.equal(u.skill.activations, 1, 'the stored charge waits');
  assert.ok(h.runUntil(() => u.skill.activations === 2, 1));
  assert.ok(h.b.time - t1 >= BLOCK_S - 1e-6);
  done(h);
});

test('#15 "作战开始时部署的单位将进入冷却" = the born state (client CastSkill.UseSkill refuses in BornState, CHARACTER_BORN_TIME 1 s): a MANUAL skill waits BORN_TIME after every deployment, the pass goes on to the next unit; an AUTO one does not wait', () => {
  const rec = (id, skillType) => chessRec({ id, profession: 'SUPPORT', subProfessionId: 'bard', stats: { atk: 0 }, skill: { skillType, spCost: 10, initSp: 10, durationType: 'NONE', duration: 5, trigger: { rule: 'SP_FULL' } } });
  // flags.bornTime undefined = the Battle default the matches use (the harness otherwise turns it off)
  const h = run({ flags: { bornTime: undefined }, defs: { chess: { t_man: rec('t_man', 'MANUAL'), t_auto: rec('t_auto', 'AUTO') } },
    units: [{ chessId: 't_man', row: 10, col: 3 }, { chessId: 't_auto', row: 10, col: 6 }] });
  assert.equal(h.b.flags.bornTime, BORN_TIME);
  const man = h.unit('t_man'), auto = h.unit('t_auto');
  h.step();
  assert.ok(man.skill.ready && man.skill.rule === 'SP_FULL');
  assert.equal(auto.skill.activations, 1, 'AUTO: at once');
  assert.ok(h.runUntil(() => man.skill.activations === 1, 5));
  assert.ok(h.b.time >= BORN_TIME - 1e-6 && h.b.time < BORN_TIME + AUTO_TRIGGER_INTERVAL + 1e-6, `MANUAL: on the first pass after ${BORN_TIME} s (${h.b.time})`);
  done(h);
});

test('#15 a redeployed unit is born again: its MANUAL skill waits BORN_TIME, and the pass casts another ready unit meanwhile', () => {
  const rec = (id) => chessRec({ id, profession: 'SUPPORT', subProfessionId: 'bard', stats: { atk: 0 }, skill: { skillType: 'MANUAL', spCost: 10, initSp: 10, durationType: 'NONE', duration: 1, trigger: { rule: 'SP_FULL' } } });
  const h = run({ flags: { bornTime: undefined }, defs: { chess: { t_a: rec('t_a'), t_b: rec('t_b') } },
    units: [{ chessId: 't_a', row: 10, col: 3 }, { chessId: 't_b', row: 10, col: 6 }] });
  const a = h.unit('t_a'), b = h.unit('t_b');
  assert.ok(h.runUntil(() => a.skill.activations === 1 && b.skill.activations === 1, 5));
  h.b.retreat(a);
  assert.ok(h.b._deploy(a, { tile: [10, 3] }));
  const t0 = h.b.time;
  assert.ok(a.skill._born());
  a.skill.charges = a.skill.maxCharges; a.skill.sp = a.skill.spCost;
  assert.ok(h.runUntil(() => a.skill.activations === 2, 5));
  assert.ok(h.b.time - t0 >= BORN_TIME - 1e-6, `not before ${BORN_TIME} s after the redeployment (${h.b.time - t0})`);
  done(h);
});

test('#15 no attack in the born state (client BornState goes to IDLE only when it ends): a unit with an enemy in range first swings BORN_TIME after its deployment, a redeployment too', () => {
  const rec = chessRec({ id: 't_w', profession: 'WARRIOR', skill: null });
  const h = run({ flags: { bornTime: undefined }, defs: { enemies: { enemy_d: dummy('enemy_d') }, chess: { t_w: rec } },
    units: [{ chessId: 't_w', row: 10, col: 4 }], enemies: [{ key: 'enemy_d', pos: [10, 5] }] });
  const u = h.unit('t_w');
  // a swing start restarts the attack cooldown (ai.js updateAlly)
  const swingAt = (from) => { h.runUntil(() => u.atkCd > 0, 5); return h.b.time - from; };
  const first = swingAt(0);
  assert.ok(first >= BORN_TIME - 1e-6 && first < BORN_TIME + 0.1, `first swing at ${first}`);
  h.b.retreat(u);
  assert.ok(h.b._deploy(u, { tile: [10, 4] }));
  const t0 = h.b.time;
  const again = swingAt(t0);
  assert.ok(again >= BORN_TIME - 1e-6 && again < BORN_TIME + 0.1, `swing ${again} s after the redeployment`);
  done(h);
});

test('#15 the pass order is the client UnitManager.characters order: deployment order, the last unit moved into the hole of one that leaves', () => {
  const rec = (id) => chessRec({ id, profession: 'WARRIOR', skill: null });
  const h = run({ defs: { chess: { t_1: rec('t_1'), t_2: rec('t_2'), t_3: rec('t_3') } },
    units: [{ chessId: 't_1', row: 10, col: 2 }, { chessId: 't_2', row: 10, col: 4 }, { chessId: 't_3', row: 10, col: 6 }] });
  h.step();
  const ids = () => h.b._chars.map((u) => u.defId);
  assert.deepEqual(ids(), ['t_1', 't_2', 't_3']);
  h.b.retreat(h.unit('t_1'));
  assert.deepEqual(ids(), ['t_3', 't_2']);
  assert.ok(h.b._deploy(h.unit('t_1'), { tile: [10, 2] }));
  assert.deepEqual(ids(), ['t_3', 't_2', 't_1']);
  done(h);
});

test('#15 GDGLOW_SKILL_2 "全场存在可选目标时释放技能" (client _GdglowSearchEnemy: UnitManager.enemyCnt > 0): 荒芜拉普兰德 S3 and 纯烬艾雅法拉 S3 cast with an enemy anywhere on the field, not for an injured ally', () => {
  const w = 'chess_char_6_18_a';
  let h = run({ defs: { enemies: { enemy_d: dummy('enemy_d') }, chess: noGarrison(w) }, units: [{ chessId: w, row: 12, col: 2 }] });
  let u = h.unit(w);
  assert.equal(u.skill.rule, 'GDGLOW_SKILL_2');
  h.step();
  fill(u);
  h.run(1);
  assert.equal(u.skill.activations, 0, 'no enemy');
  h.spawn('enemy_d', { pos: [9, 10] }); // far outside her range
  assert.ok(!u.rangeKeySet.has(9 * COLS + 10));
  h.run(0.25);   // (the next 0.2 s pass)
  assert.equal(u.skill.activations, 1, 'an enemy anywhere');
  done(h);
  const a = 'chess_char_6_20_a';
  const mate = chessRec({ id: 't_mate', profession: 'WARRIOR', skill: null, stats: { maxHp: 10000 } });
  h = run({ defs: { enemies: { enemy_d: dummy('enemy_d') }, chess: { ...noGarrison(a), t_mate: mate } }, units: [{ chessId: a, row: 12, col: 2 }, { chessId: 't_mate', row: 9, col: 10 }] });
  u = h.unit(a);
  assert.equal(u.skill.rule, 'GDGLOW_SKILL_2');
  h.step();
  fill(u);
  h.run(1);
  assert.equal(u.skill.activations, 0, 'no enemy');
  h.unit('t_mate').hp = 5000;
  h.run(0.25);
  assert.equal(u.skill.activations, 0, 'an injured ally is no condition');
  h.spawn('enemy_d', { pos: [9, 10] });
  h.run(0.25);
  assert.equal(u.skill.activations, 1, 'an enemy anywhere');
  done(h);
});

// =================================================================================================================
// #16 古米 / 塞雷娅 heal skills

test('#16 古米 备用军粮: an injured ally next to her casts it with no enemy on the field; her next attack heals that ally (normal + elite)', () => {
  for (const id of ['chess_char_1_10_a', 'chess_char_1_10_b']) {
    const mate = chessRec({ id: 't_mate', profession: 'WARRIOR', skill: null, stats: { maxHp: 10000, atk: 0 } });
    const h = run({ defs: { chess: { ...noGarrison(id), t_mate: mate } }, units: [{ chessId: id, row: 10, col: 4 }, { chessId: 't_mate', row: 11, col: 5 }] });
    const u = h.unit(id), m = h.unit('t_mate');
    assert.equal(u.skill.id, 'skchr_sunbr_1');
    h.step();
    fill(u);
    h.run(2);
    assert.equal(u.skill.activations, 0, 'nobody injured');
    m.hp = 4000;
    assert.ok(h.runUntil(() => h.hooksOf('heal').some((c) => c.source === u && c.target === m), 2), 'healed without any enemy (before: only once she was hit)');
    const heal = h.hooksOf('heal').find((c) => c.source === u && c.target === m);
    const tb = raw(id).trait.bb;
    const k = tb.hp_ratio != null && 0.4 < tb.hp_ratio ? tb.heal_scale : 1;
    approx(heal.amount, u.s.atk * u.def.skill.bb.heal_scale * k, `${id} heal_scale × ATK`);
    assert.equal(starts(h, u)[0].reason, 'SKILL_RANGE');
    done(h);
  }
});

test('#16 古米 备用军粮 with an enemy blocked: the cast turns her next attack into the heal (the enemy is not hit by it); no second charge on the same heal', () => {
  const id = 'chess_char_1_10_b';
  const mate = chessRec({ id: 't_mate', profession: 'WARRIOR', skill: null, stats: { maxHp: 10000, atk: 0 } });
  const h = run({ defs: { enemies: { enemy_d: dummy('enemy_d') }, chess: { ...noGarrison(id), t_mate: mate, t_mate2: { ...mate, chessId: 't_mate2', baseId: 't_mate2' } } },
    units: [{ chessId: id, row: 10, col: 4 }, { chessId: 't_mate', row: 11, col: 4 }, { chessId: 't_mate2', row: 9, col: 4 }], enemies: [{ key: 'enemy_d', pos: [10, 4] }] });
  const u = h.unit(id), m = h.unit('t_mate'), m2 = h.unit('t_mate2');
  h.step();
  assert.equal(u.skill.maxCharges, 2);
  u.atkCd = 1.5; // the heal waits for her next attack
  u.swing = null; // (and the swing she started in the first tick is cut: ai.js updateAlly)
  fill(u);
  m.hp = 3000;
  h.run(1);
  assert.equal(starts(h, u).length, 1, 'one charge cast');
  assert.equal(u.skill.charges, 1, 'the other stays stored while the heal waits');
  const hits0 = h.hooksOf('damaged').filter((c) => c.source === u).length;
  assert.ok(h.runUntil(() => h.hooksOf('heal').some((c) => c.source === u && c.target === m), 2));
  assert.equal(h.hooksOf('damaged').filter((c) => c.source === u).length, hits0, 'that attack was the heal, not a hit');
  m2.hp = 3000;
  assert.ok(h.runUntil(() => h.hooksOf('heal').some((c) => c.source === u && c.target === m2), 5), 'the stored charge heals the next injured ally');
  done(h);
});

test('#16 塞雷娅 S1 急救 (audit): checked at her attack cadence, enemy or not — an ally of her area at ≤ half HP turns that attack into the heal; healed back meanwhile ⇒ she just attacks', () => {
  // PRTS 备注 "此技能仅在周围有符合血量条件的友方单位时可触发，触发时会替换当次攻击"; text corrected to "血量小于等于一半"
  const id = 'chess_char_5_11_a';
  const s = skillOf(id, 'skchr_demkni_1');
  const mate = chessRec({ id: 't_mate', profession: 'WARRIOR', skill: null, stats: { maxHp: 10000, atk: 0, blockCnt: 0 } });
  const setup = (withEnemy) => {
    const h = run({ defs: { enemies: { enemy_d: dummy('enemy_d') }, chess: { ...noGarrison(id), t_mate: mate } },
      units: [{ chessId: id, row: 10, col: 4, skillIndex: s.index }, { chessId: 't_mate', row: 10, col: 5 }],
      enemies: withEnemy ? [{ key: 'enemy_d', pos: [10, 4] }] : [] });
    h.step();
    return [h, h.unit(id), h.unit('t_mate')];
  };
  let [h, u, m] = setup(false);
  assert.equal(u.skill.rule, 'DEFAULT');
  fill(u);
  m.hp = 4000;
  // no enemy: still cast at her attack cadence and the attack heals the ally (upstream e86c7c83, GitHub #406)
  assert.ok(h.runUntil(() => u.skill.activations === 1, 2), 'no enemy: the ally at 40 % still gets the heal');
  assert.ok(h.runUntil(() => m.hp > 4000, 2), 'and is healed');
  done(h);
  [h, u, m] = setup(true);
  const e = h.enemies()[0];
  const hits = () => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e).length;
  fill(u);
  m.hp = 6000;
  assert.ok(h.runUntil(() => hits() >= 2, 5), '60 %: she attacks the enemy she blocks');
  assert.equal(u.skill.activations, 0, 'and casts nothing');
  // an ally at exactly half HP: her next attack is the heal (the enemy is not hit by it)
  u.atkCd = 0.5;
  m.hp = 5000;
  const hits0 = hits();
  assert.ok(h.runUntil(() => u.skill.activations === 1, 2));
  assert.equal(starts(h, u)[0].reason, 'DEFAULT');
  // (cast as her swing starts; the heal lands at that swing's damage frame — ai.js attackTiming)
  assert.ok(h.runUntil(() => h.hooksOf('heal').some((c) => c.source === u && c.target === m), 2));
  const heal = h.hooksOf('heal').find((c) => c.source === u && c.target === m);
  assert.ok(heal, 'healed at once, in place of that attack');
  approx(heal.amount, u.s.atk * s.bb.heal_scale);
  assert.equal(hits(), hits0, 'that attack hit nobody');
  assert.ok(!u.skill.pending);
  // dropped to 40 %, healed back to 80 % before her attack: no cast, she keeps attacking (no heal mode left waiting)
  fill(u);
  u.atkCd = 1;
  m.hp = 4000;
  h.run(0.5);
  m.hp = 8000;
  const hits1 = hits();
  h.run(4);
  assert.equal(u.skill.activations, 1, 'no second cast');
  assert.ok(hits() >= hits1 + 3, `she kept hitting the enemy (${hits() - hits1} hits in 4 s)`);
  // the engine's safety net: a cast whose ally condition fails before the attack is withdrawn, its charge returned
  m.hp = 4000;
  u.atkCd = 5;
  assert.ok(u.skill.activate('test'));
  assert.ok(u.skill.pending && u.skill.charges === 0);
  m.hp = 10000;
  h.step();
  assert.ok(!u.skill.pending && u.skill.charges === 1, 'withdrawn, the charge kept');
  done(h);
});

// =================================================================================================================
// #8 新约能天使 S2

test('#8 新约能天使 S2 开火成瘾症: the ally is the highest-仇恨值 operator of her range (taunt, then the latest deployed); both shields = 180 % of their own max HP, −initial/30 per s', () => {
  const id = 'chess_char_6_13_a';
  const mate = (key, o = {}) => chessRec({ id: key, profession: 'SNIPER', skill: null, stats: { maxHp: 3000, atk: 0, aspd: 100, ...o } });
  // rows deploy top first (row 11 before row 10): t_back (11,4) comes before t_front (10,5); both are in her range
  const setup = (taunt) => {
    const h = run({
      defs: { enemies: { enemy_d: dummy('enemy_d') }, chess: { ...noGarrison(id), t_back: mate('t_back', { aspd: 150 }), t_front: mate('t_front', { maxHp: 5000 }) } },
      units: [{ chessId: id, row: 10, col: 3 }, { chessId: 't_back', row: 11, col: 4 }, { chessId: 't_front', row: 10, col: 5 }],
      enemies: [{ key: 'enemy_d', pos: [10, 6] }],
    });
    const u = h.unit(id);
    h.step();
    if (taunt) h.b.addBuff(h.unit('t_back'), { key: 'test:taunt', mods: { taunt: 1 }, persist: true });
    fill(u);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    return h;
  };
  let h = setup(false);
  const u = h.unit(id), back = h.unit('t_back'), front = h.unit('t_front');
  const bb = u.def.skill.bb;
  assert.ok(front.aggroSeq > back.aggroSeq);
  assert.ok(front.findBuff('angel2:stolen') && !back.findBuff('angel2:stolen'), 'the latest deployed (not the fastest attacker) is chosen');
  approx(front.s.shield, front.s.maxHp * bb.shield_max_hp_ratio, 'her shield: 180 % of HER max HP');
  approx(u.s.shield, u.s.maxHp * bb.shield_max_hp_ratio, 'his own: of his');
  assert.ok(flagsOf(front) & UF.SHIELD, 'the ally shows the shield (b.snap flag: the HP-bar shield line)');
  const st = h.eventsOf('status').find((e) => e[1] === front.id && e[2] === 'angel2:barrier' && e[3] === 1);
  assert.ok(st && statusIconKey(st[2]) === 'shield', 'and the shield icon in its status row');
  const s0 = front.s.shield;
  h.run(3);
  approx(front.s.shield, s0 * (1 - 3 / bb.shield_max_duration), 'decays by initial/30 per second', 0.02);
  h.b.dealDamage(h.enemies()[0], front, { amount: 1000, type: 'true' });
  assert.equal(front.hp, front.s.maxHp, 'the shield absorbs the damage');
  done(h);
  h = setup(true);
  assert.ok(h.unit('t_back').findBuff('angel2:stolen'), 'a higher taunt level comes first');
  done(h);
});

// =================================================================================================================
// #3 忍冬: 叙拉古 隐匿 and her S3 迷彩

test('#3 忍冬 with 6 叙拉古: the bond 隐匿 ends at 32 + 0.4 × layers s; her S3 迷彩 is not 隐匿, keeps all but the enemy she blocks off her, until the next cast', () => {
  const id = 'chess_char_3_18_a', L = 20;
  const h = run({
    defs: { enemies: { enemy_f: dummy('enemy_f', { hp: 1 }), enemy_b: dummy('enemy_b'), enemy_r: dummy('enemy_r', { atk: 50, range: 3, applyWay: 'RANGED', bat: 1 }) }, chess: noGarrison(id) },
    units: [{ chessId: id, row: 10, col: 4 }], bonds: { siracusaShip: { count: 6, active: true, tier: 2, layers: L } },
  });
  const u = h.unit(id);
  h.step();
  assert.ok(u.s.flags.stealth, '叙拉古 6: 隐匿 after deployment');
  // a kill during 隐狐之艺 ⇒ 迷彩 at its end
  fill(u);
  h.spawn('enemy_f', { pos: [10, 5] });
  assert.ok(h.runUntil(() => u.skill.active, 5));
  h.runUntil(() => !u.skill.active, 20);
  assert.ok(u.s.flags.camou, '迷彩 after the skill (a kill during it)');
  h.runUntil(() => h.b.time >= 32 + 0.4 * L + 0.1, 60);
  assert.ok(!u.s.flags.stealth, 'the bond 隐匿 is over at its time');
  assert.ok(u.s.flags.camou && !u.blocking.length);
  assert.ok(flagsOf(u) & UF.STEALTH, 'the 迷彩 shows (see-through)');
  const r = h.spawn('enemy_r', { pos: [11, 6] });
  assert.equal(canTargetAlly(r, u, true), false, 'and works (no ranged target)');
  // an enemy she blocks: only that one may attack her — 迷彩, like 隐匿, is not lifted by blocking (PRTS 异常效果)
  u.skill.charges = 0; u.skill.sp = 0; // (her SP is full again by now: no new cast on that enemy yet)
  const b = h.spawn('enemy_b', { pos: [10, 4] });
  h.step(2);
  assert.equal(b.blockedBy, u);
  assert.ok(flagsOf(u) & UF.STEALTH, 'blocking: still shown camouflaged');
  assert.equal(canTargetAlly(b, u, true), true, 'the enemy she blocks may target her');
  assert.equal(canTargetAlly(r, u, true), false, 'the ranged enemy still may not');
  h.run(3);
  assert.equal(h.hooksOf('damaged').filter((c) => c.source === r && c.target === u).length, 0, 'and does not');
  // it lasts until her next cast
  fill(u);
  assert.ok(h.runUntil(() => u.skill.activations === 2, 5));
  assert.ok(!u.s.flags.camou, 'the next cast ends it');
  done(h);
});

test('#3 伪装服 (timed 隐匿) on 忍冬 is neither made permanent nor stripped by her S3 迷彩 (their keys used to collide)', () => {
  const id = 'chess_char_3_18_a';
  const item = 'chess_item_4_04_e_a';
  const h = run({
    defs: { enemies: { enemy_f: dummy('enemy_f', { hp: 1 }) }, chess: noGarrison(id) },
    units: [{ chessId: id, row: 10, col: 4, items: [item] }],
  });
  const u = h.unit(id);
  h.step();
  fill(u);
  h.spawn('enemy_f', { pos: [10, 5] });
  assert.ok(h.runUntil(() => u.skill.active, 5));
  h.runUntil(() => !u.skill.active, 20);
  assert.ok(u.s.flags.camou);
  h.b.dealDamage(null, u, { amount: 10, type: 'true' }); // 伪装服: the first damage taken ⇒ 隐匿 for its duration
  const cloak = u.findBuff('stealth');
  assert.ok(cloak && Number.isFinite(cloak.timeLeft) && u.s.flags.stealth, '伪装服 隐匿, timed');
  h.run(cloak.timeLeft + 0.2);
  assert.ok(!u.s.flags.stealth, 'the 隐匿 ends at its time although the 迷彩 lasts');
  assert.ok(u.s.flags.camou);
  // and her next cast removes the 迷彩 only (a fresh 伪装服 隐匿 would stay: another key)
  h.b.applyStatus(u, 'stealth', { duration: 5, source: u });
  fill(u);
  h.spawn('enemy_f', { pos: [10, 5] });
  assert.ok(h.runUntil(() => u.skill.activations === 2, 5));
  assert.ok(!u.s.flags.camou && u.s.flags.stealth, 'the cast strips the 迷彩, not a 隐匿');
  done(h);
});
