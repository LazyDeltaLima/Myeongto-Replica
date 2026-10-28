// Every MANUAL 重装 skill takes the official 下半 TANK class row, TAKE_DAMAGE (maintainer decision 2026-10-28,
// docs/rules/sim.md 「중장 스킬 공식 TAKE_DAMAGE」): the hit casts it at once (the client's born buff), and the client's
// 0.2 s pass sends type 12 down SEARCH's branch too (`_TryTriggerSkill` jump table → `_TrySearchTarget`: the unit's attack
// trigger finds a target — one in its attack range or one it blocks), so a target of its attack casts it before any hit.
// The owner's earlier deviations are gone: six skills on the basic strategy DEFAULT (2026-10-03, GitHub issue #4, PR #12,
// DESIGN §21.29: 深巡 S2 行动能力剥夺 — on its 3-2 rangeId —, 雷蛇 S2 反击电弧, 号角 S2 暴风号令 and S3 终极防线, 灰毫 S1
// 攻击力强化·γ型 and S2 专注轰击) and 余 S2 厚礼上宾 on SKILL_RANGE x-1 (2026-10-04, GitHub issue #32 item 1, DESIGN §22.10).
// The maintainer's report that removed them: 深巡 S2 never cast while hit from behind or blocking an enemy behind her.
//
// The battle check is real: the chess records of data/chess.json with their kits, the stage 战场#01(下半)
// (act2autochess_m01), a real enemy walking the lane from the gate (9,10) to the objective; the operator stands on (9,5)
// with its skill fully charged, facing the gate unless the test turns it round (on (9,8): the lane runs straight from the
// gate there; at (9,5) it turns and reaches the tile from below).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { bodyInKeys, bodyInRange } from '../../server/sim/body.js';
import { absoluteRangeKeys } from '../../server/sim/targeting.js';

const CHESS = JSON.parse(fs.readFileSync(new URL('../../data/chess.json', import.meta.url), 'utf8'));
const ds = getDefaultSource();

/** [normal chess id, skill id] — the skills of the removed deviations; both records (normal + elite) of each chess. */
const FORMERLY_DEVIATED = [
  ['chess_char_1_04_a', 'skchr_udflow_2'],   // 深巡 S2 行动能力剥夺
  ['chess_char_1_20_a', 'skchr_liskam_2'],   // 雷蛇 S2 反击电弧
  ['chess_char_5_08_a', 'skchr_horn_2'],     // 号角 S2 暴风号令
  ['chess_char_5_08_a', 'skchr_horn_3'],     // 号角 S3 终极防线
  ['chess_char_2_18_a', 'skcom_atk_up[3]'],  // 灰毫 S1 攻击力强化·γ型
  ['chess_char_2_18_a', 'skchr_ashlok_2'],   // 灰毫 S2 专注轰击
  ['chess_char_6_03_a', 'skchr_yu_2'],       // 余 S2 厚礼上宾
];
const both = (normalId) => [normalId, CHESS[normalId].goldenId];
const MELEE = 'enemy_1422_lrsldr';   // 萨卡兹枯朽前锋, melee, 0.8 tiles/s
const RANGED = 'enemy_1168_dumage';  // 深池暗影术师, ranged arts, range 2.5

/**
 * One real battle: `chessId` with skill `skillId` on (9,`col`) facing `dir`, SP full; one `enemy` on the lane from `spawnAt`
 * s. Returns the first cast (time, reason, whether an enemy stood on the unit's initial range / the skill's own range
 * then, whether the unit blocked it, whether every enemy was behind it) and the time the unit first took damage (any
 * `damaged` event: what TAKE_DAMAGE listens to).
 */
function firstCast(chessId, skillId, { spawnAt = 0, seconds = 40, dir = 'RIGHT', col = 5, enemy = MELEE } = {}) {
  const rec = CHESS[chessId].skills.find((s) => s.skillId === skillId);
  const h = makeBattle({
    stageId: 'act2autochess_m01', seed: 3, timeLimit: 120, autoFinish: false,
    units: [{ chessId, row: 9, col, dir, skillIndex: rec.index, carryState: { sp: 999 } }],
    enemies: [{ key: enemy, route: 0, time: spawnAt }],
  });
  const u = h.unit(chessId);
  assert.equal(u.skill.id, skillId, `${chessId} runs ${skillId}`);
  const out = { rule: u.skill.rule, cast: null, reason: null, enemyInRange: false, enemyInSkillRange: false, blocking: false, behind: false, hurt: null, attackable: null };
  h.b.on('damaged', (ctx) => { if (ctx.target === u && out.hurt == null) out.hurt = h.b.time; }, { priority: 1000 });
  h.b.on('skillStart', (ctx) => {
    if (ctx.unit !== u || out.cast != null) return;
    out.cast = h.b.time;
    out.reason = ctx.reason;
    const live = h.b.enemies.filter((e) => e.alive && e.deployed);
    // the attack range takes an enemy by its 0.1 collider; the skill's own range by the tile of its position
    out.enemyInRange = live.some((e) => bodyInRange(e, new Set(u.baseRangeKeys || u.rangeKeys)));
    const sk = rec.rangeGrid?.length ? new Set(absoluteRangeKeys(rec.rangeGrid, u.tileR, u.tileC, u.dir, 0)) : null;
    out.enemyInSkillRange = !!sk && live.some((e) => bodyInKeys(e, sk));
    out.blocking = u.blocking.length > 0;
    out.behind = live.length > 0 && live.every((e) => (dir === 'LEFT' ? e.x > u.x : e.x < u.x));
  }, { priority: 1000 });
  // the automatic operation that casts: did SEARCH's condition hold (a target of its attack in range, or one it blocks —
  // read inside the pass: the skill may release what it blocked before skillStart)?
  const pass = u.skill.autoTrigger.bind(u.skill);
  u.skill.autoTrigger = () => { const c = u.skill._defaultCondition(); const cast = pass(); if (cast && out.attackable == null) out.attackable = c; return cast; };
  h.runUntil(() => out.cast != null && out.hurt != null, seconds);
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
  return out;
}

test('data: every MANUAL 重装 skill is TAKE_DAMAGE, the formerly deviated ones too (normal and elite record, no trigger grid); the loadout def and the kits carry it', async () => {
  const { KITS } = await import('../../server/sim/content/index.js');
  let n = 0;
  for (const [normalId, skillId] of FORMERLY_DEVIATED) {
    for (const id of both(normalId)) {
      const rec = CHESS[id];
      const s = rec.skills.find((x) => x.skillId === skillId);
      assert.ok(s, `${id} ${skillId}`);
      assert.equal(rec.profession, 'TANK');
      assert.deepEqual(s.trigger, { rule: 'TAKE_DAMAGE', rawRule: 'TAKE_DAMAGE', customRangeGrid: null }, `${id} ${skillId}`);
      const def = ds.getChess(id, { skillIndex: s.index });
      assert.equal(def.skill.trigger.rule, 'TAKE_DAMAGE', `${id} ${skillId} loadout def`);
      // no kit sets its own rule on them (雷蛇 S2's PR #12 line is gone)
      const kit = KITS[rec.baseId]?.(def.skill.bb, def.raw, def);
      const spec = s.isDefault ? kit?.skill : kit?.skills?.[skillId];
      assert.equal(spec?.trigger, undefined, `${id} ${skillId}: the kit reads the data`);
      n++;
    }
  }
  assert.equal(n, 14);
  for (const c of Object.values(CHESS)) {
    for (const s of c.skills || []) {
      if (s.trigger.rawRule === 'TAKE_DAMAGE') assert.equal(s.trigger.rule, 'TAKE_DAMAGE', `${c.chessId} ${s.skillId}`);
      if (c.profession === 'TANK' && s.skillType === 'MANUAL' && s.trigger.rawRule !== 'CUSTOM_RANGE_SEARCH_ENEMY') assert.equal(s.trigger.rule, 'TAKE_DAMAGE', `${c.chessId} ${s.skillId}`);
    }
  }
  // the generic skcom_atk_up[3] keeps each other carrier's own rule
  const others = Object.values(CHESS).filter((c) => c.baseId !== 'chess_char_2_18_a' && c.skills?.some((s) => s.skillId === 'skcom_atk_up[3]'));
  assert.ok(others.length >= 10, 'skcom_atk_up[3] is shared');
  for (const c of others) assert.deepEqual(c.skills.find((s) => s.skillId === 'skcom_atk_up[3]').trigger, { rule: 'DEFAULT', rawRule: 'DEFAULT', customRangeGrid: null }, c.chessId);
});

test('real battle: every MANUAL 重装 skill — cast by the first hit or, before it, by a target of its attack (the pass\'s SEARCH branch)', () => {
  let n = 0;
  for (const c of Object.values(CHESS)) {
    if (c.profession !== 'TANK' || c.isDiy) continue;
    for (const s of c.skills) {
      if (s.skillType !== 'MANUAL' || s.trigger.rule !== 'TAKE_DAMAGE') continue;
      const r = firstCast(c.chessId, s.skillId);
      const where = `${c.chessId} ${c.name} ${s.skillId}: ${JSON.stringify(r)}`;
      assert.equal(r.rule, 'TAKE_DAMAGE', where);
      assert.ok(r.cast != null, `cast — ${where}`);
      assert.equal(r.reason, 'TAKE_DAMAGE', where);
      // the hit casts it at once (or the next 0.2 s pass); a pass before the hit casts it only with a target of its attack
      // (whose skill may then keep every hit off her: no hit at all)
      if (r.hurt != null) assert.ok(r.cast - r.hurt <= 0.2 + 1e-6, `cast by the first hit at the latest — ${where}`);
      if (r.hurt == null || r.cast < r.hurt - 1e-9) assert.ok(r.attackable, `before the hit only with an enemy to attack — ${where}`);
      n++;
    }
  }
  assert.ok(n >= 54, `${n} TAKE_DAMAGE records checked`);
  // 深巡 (ranged 2-2): S1 and S2 cast once the enemy walks into her 2-2, before it reaches and hits her — not on the 3-2's
  // fourth tile any more
  for (const skillId of ['skchr_udflow_1', 'skchr_udflow_2']) {
    const r = firstCast('chess_char_1_04_a', skillId, { spawnAt: 3 });
    assert.ok(r.cast > 3 && r.attackable && r.enemyInRange && (r.hurt == null || r.cast < r.hurt), `深巡 ${skillId} on the enemy in her range: ${JSON.stringify(r)}`);
  }
});

test('real battle: 深巡 S2 facing away from the lane casts on an enemy she blocks behind her, and on a ranged hit from behind (the maintainer\'s report)', () => {
  for (const id of both('chess_char_1_04_a')) {
    // a melee walker reaches her back: blocked (always her target, ai.js blockedTargets) — the pass casts at once
    const m = firstCast(id, 'skchr_udflow_2', { dir: 'LEFT', col: 8 });
    assert.ok(m.cast != null && m.reason === 'TAKE_DAMAGE', `${id} melee: ${JSON.stringify(m)}`);
    assert.ok(m.behind && !m.enemyInSkillRange, `${id} melee: the enemy behind her, off the 3-2: ${JSON.stringify(m)}`);
    assert.ok(m.blocking || (m.hurt != null && m.cast - m.hurt <= 0.2 + 1e-6), `${id} melee: blocked or hit: ${JSON.stringify(m)}`);
    // a ranged caster shoots her from behind, nothing on her 2-2 and nothing blocked: the hit casts it
    const r = firstCast(id, 'skchr_udflow_2', { dir: 'LEFT', col: 8, enemy: RANGED });
    assert.ok(r.cast != null && r.reason === 'TAKE_DAMAGE', `${id} ranged: ${JSON.stringify(r)}`);
    assert.ok(r.behind && !r.enemyInRange && !r.blocking, `${id} ranged: from behind, out of her range: ${JSON.stringify(r)}`);
    assert.ok(r.hurt != null && r.cast - r.hurt <= 0.2 + 1e-6 && r.cast >= r.hurt - 1e-9, `${id} ranged: cast by the hit: ${JSON.stringify(r)}`);
  }
});
