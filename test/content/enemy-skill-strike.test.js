// When an enemy skill cast at its attack slot takes effect (docs/rules/sim.md 「적 스킬 = 일반 공격 차례」 효과가 나는 때;
// content/enemies.js castStrikeAt): the client's ability waits for a frame before its spell (`EasyToStartAbility.OnCastStart`
// → `<OnWaitForPreDelay>`) — its clip's OnAttack event (scaled as the cast plays), the cast's end when the clip has none or
// there is no clip, `_preDelay` when it does not wait for the event, the end clip's OnAttack of a three-part channel, one fixed
// update for an ActiveBuffAbility. Until 2026-11-20 every kit of the sweep below fired as the cast began (a cut cast still
// hit); a kit says `atStrike` (enemies/archetypes.js skill) and the engine runs its fire at that frame, not at all when the
// cast is cut first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { enemyHasAttack } from '../../server/sim/ai.js';
import { TICK } from '../../server/sim/constants.js';

const SEASONS = [[null, 'data/enemies.json'], ['act3autochess', 'data/seasons/act3autochess/enemies.json']];
const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));

const ACE = 'times its effect itself (enemies/helpers.js atCastEvent): it has a part at the cast start';
/** enemy key → skill name → why its kit does not say `atStrike` (a cast whose frame is 0 needs no entry). */
const EXCEPT = {
  enemy_10001_trslim: { StartRun: ACE },
  enemy_10077_mpbarr: { Spawn: ACE }, enemy_10123_uareap: { SkyProjectile: ACE },
  enemy_1104_lfkght: { AtkDesWeaken: ACE }, enemy_1104_lfkght_3: { AtkDesWeaken: ACE },
  enemy_1133_harchn: { SummonToken: ACE }, enemy_1133_harchn_2: { SummonToken: ACE },
  enemy_1362_dfat: { StunAttack: ACE }, enemy_1362_dfat_2: { StunAttack: ACE },
  enemy_1373_ltnhor: { attackTwoTarget: ACE }, enemy_1373_ltnhor_2: { attackTwoTarget: ACE },
  enemy_1376_ltndru: { aoeAttack: ACE }, enemy_1376_ltndru_2: { aoeAttack: ACE },
  enemy_1403_gunsho: { CrossAttack: ACE }, enemy_1403_gunsho_2: { CrossAttack: ACE },
  enemy_1405_boomer_2: { Bomb: ACE }, enemy_1406_chghmr: { PowerHit: ACE }, enemy_1409_bdguad_2: { CrossBomb: ACE },
  enemy_1431_lrmzrd: { summonFireball: ACE }, enemy_1431_lrmzrd_2: { summonFireball: ACE },
  // boss skills that spend their SP as the cast begins (bosses.js atSpell)
  enemy_9021_acduml: { 1: ACE }, enemy_9021_acduml_2: { 1: ACE }, enemy_9022_acdumm: { 1: ACE },
  enemy_9032_aclionk: { equip: ACE, equipA: ACE }, enemy_9029_acfnc: { SommonSquad: ACE }, enemy_9029_acfnc_2: { SommonSquad: ACE, SkSummonArmor: ACE },
};

test('every attack-slot enemy skill with a frame to wait for takes effect there (`atStrike`), or says why not', () => {
  const seen = new Set(), missing = [], stale = [];
  let strike = 0;
  for (const [season, file] of SEASONS) {
    for (const [key, rec] of Object.entries(read(file))) {
      if (!rec.skillCast) continue;
      const h = makeBattle({ season, seed: 3, autoFinish: false, timeLimit: 60, enemies: [{ key, time: 0 }], units: [] });
      h.step(2);
      const e = h.b.enemies.find((x) => x.defId === key);
      const ab = e && e.mem.ab;
      if (!ab) continue;
      // an attack slot (content/enemies.js slotSkill): it attacks, through the engine or its kit's own loop, or its mode has an attack ability
      const slot = enemyHasAttack(e) || !!ab.ownAttack || !!(e.def.raw.attackAbility && !(e.profile && e.profile.noAttack));
      if (!slot) continue;
      for (const a of ab.list) {
        const s = a.fire && a.cd != null && a.name != null ? ab.sk[a.name] : null;
        if (!s || !s.cast) continue;
        const at = enemiesMod.castStrikeAt(e, s.cast, s.bb);
        const why = EXCEPT[key] && EXCEPT[key][a.name];
        seen.add(`${key}:${a.name}`);
        if (a.atStrike) { strike++; if (why) stale.push(`${key} ${a.name} (says atStrike)`); continue; }
        if ((at ?? 0) > 1e-9 && !why) missing.push(`${key} ${a.name} @${Math.round(at * 1000) / 1000} s`);
      }
    }
  }
  for (const [key, m] of Object.entries(EXCEPT)) for (const n of Object.keys(m)) if (!seen.has(`${key}:${n}`)) stale.push(`${key} ${n} (not an attack-slot skill)`);
  assert.deepEqual(missing, [], 'these kits fire as the cast starts, but the client\'s ability waits for a frame (content/enemies.js castStrikeAt): '
    + 'give the skill `atStrike` (enemies/archetypes.js skill), time a part with enemies/helpers.js atCastEvent, or list it here with the reason '
    + '— docs/rules/sim.md 「적 스킬 = 일반 공격 차례」 효과가 나는 때');
  assert.deepEqual(stale, [], 'exception entries with nothing to excuse');
  assert.ok(seen.has('enemy_1535_wlfmster:FearCage') && strike >= 20, `the sweep ran (${strike} skills at their frame)`);
});

test('castStrikeAt by class: a clip\'s OnAttack, the end without one, `_preDelay`, a channel\'s end clip, a fixed update', () => {
  const E = read('data/enemies.json');
  const e = { s: { interval: 3 } };
  const at = (k, n, bb = {}) => enemiesMod.castStrikeAt(e, E[k].skillCast[n], bb);
  const near = (a, b) => Math.abs(a - b) <= 1e-6;
  assert.ok(near(at('enemy_1509_mousek', 'driftsand'), 1.967), '鼠王 【唱沙】 Skill_1\'s attack event (`_timeMode` 1: the clip as it is)');
  assert.ok(near(at('enemy_1539_reid', 'rush'), 0.567), '“复仇者” 【冲锋】 Skill_Begin has no event: the whole clip');
  assert.ok(near(at('enemy_1321_wdarft', 'bornbugs'), 0), '枯朽萃聚使徒 BornBugs does not wait for the event (`_waitForAttackEvent` 0, `_preDelay` 0)');
  assert.ok(near(at('enemy_1504_cqbw', 'c4'), 0.6), 'W C4: `_preDelay` 0.6');
  assert.ok(near(at('enemy_1535_wlfmster', 'fearcage', { duration_s: 5 }), 4.367), '扎罗 【溶血骇惧】: 5 s − A_Skill_End 1 s + its 0.367 s frame');
  assert.ok(near(at('enemy_1502_crowns', 'blink'), TICK), 'an ActiveBuffAbility: one fixed update');
  // a channel: the first OnAttack of its clips as they play (SpineAnimator._OnEvent → the entity's attack event), or `_preDelay`
  const A3 = read('data/seasons/act3autochess/enemies.json');
  assert.ok(near(at('enemy_9009_acfort', 'killothers', { duration: 4 }), 0.633), '假想敌：黑云 KillOthers: Skill_1_Begin\'s event');
  assert.ok(near(enemiesMod.castStrikeAt({ s: { interval: 6 } }, E.enemy_9033_acdeer.skillCast.lasso, {}), 1), '“萨米的意志” Lasso: Skill_01_Begin\'s event');
  assert.ok(near(at('enemy_9017_achunt_2', '2', { dog_duration: 5 }), 0), '假想敌：铳 (隐秘核心) 【末日布道】 does not wait (`_preDelay` 0)');
  assert.ok(near(enemiesMod.castStrikeAt(e, A3.enemy_1429_lrwzrd.skillCast.laser, {}), 0.2), '魂灵残迹 Laser: `_preDelay` 0.2');
  assert.ok(near(at('enemy_1404_msnip', 'crossattack'), 2.5 - 1.1 + 0.067), '重弩突袭者 CrossAttack: Skill_End\'s event');
  // `_timeMode` 0 played faster than its clip: the frame scales with it (锏 CircleAttack: A_Skill2 2.067 s at a 1.5 s interval)
  assert.ok(near(enemiesMod.castStrikeAt({ s: { interval: 1.5 } }, E.enemy_1525_blkswb.skillCast.circleattack, {}), 0.633 * 1.5 / 2.067), 'scaled');
});

const WALL = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const NOATK = () => ({ trait: { noAttack: true } });
function arena(units) {
  const chess = Object.fromEntries(units.map((u) => [u.chessId, WALL(u.chessId)]));
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess }, kits: Object.fromEntries(units.map((u) => [u.chessId, NOATK])), enemies: [], units,
  });
}
/** Steps `h` until enemy `e` starts casting `name` (fx 'enemySkill'); the time it began. */
function untilCast(h, e, name, max = 90) {
  let at = null;
  const fx = h.b.fx.bind(h.b);
  h.b.fx = (k, o) => { if (k === 'enemySkill' && o.id === e.id && o.ability === name && at == null) at = h.b.time; return fx(k, o); };
  for (let t = 0; t < max && at == null; t += TICK) h.step();
  assert.ok(at != null, `${name} cast`);
  return at;
}

test('扎罗 【溶血骇惧】 cages its operators at A_Skill_End\'s attack event, 4.367 s into the cast, not as it begins', () => {
  const h = arena([{ chessId: 't_a', row: 10, col: 3 }, { chessId: 't_b', row: 11, col: 3 }, { chessId: 't_c', row: 12, col: 3 }]);
  h.step();
  const e = h.spawn('enemy_1535_wlfmster', { pos: [10, 8], routeIndex: 0, mods: { speedMul: 0 } });
  const t0 = untilCast(h, e, 'FearCage');
  const caged = () => h.allies().filter((u) => u.findBuff('ab:fearCage')).length;
  h.run(t0 + 4.3 - h.b.time);
  assert.equal(caged(), 0, 'nobody caged yet at 4.3 s');
  h.run(0.1 + TICK);   // (the step on or after 4.367 s)
  assert.equal(caged(), 3, 'caged at the end clip\'s frame');
});

test('a cast cut before its frame gives nothing: 迷路的巨像 stunned before its boulder leaves', () => {
  const go = (stunAt) => {
    const h = arena([{ chessId: 't_a', row: 10, col: 6 }]);
    h.step();
    const e = h.spawn('enemy_2003_rockman', { pos: [10, 8], routeIndex: 0, mods: { speedMul: 0 } });
    const w = h.unit('t_a');
    const t0 = untilCast(h, e, 'StunAttack');
    if (stunAt != null) {
      h.run(t0 + stunAt - h.b.time);
      assert.ok(h.b.applyStatus(e, 'stun', { duration: 3 }), 'stunned');
    }
    h.run(t0 + 2.5 - h.b.time);   // (the boulder leaves at Skill's 1.067 s event and flies 2 tiles at 10 / s)
    return w.s.flags.stun ? 1 : 0;
  };
  assert.equal(go(null), 1, 'uncut: its target is stunned');
  assert.equal(go(0.5), 0, 'stunned 0.5 s in: no boulder');
});

test('a kit whose spell is a part of its own (`atStrike` a function): 重弩突袭者 reveals itself as it starts, its bolt leaves at Skill_End\'s event — none when stunned first', () => {
  const go = (stunAt) => {
    const h = arena([{ chessId: 't_a', row: 10, col: 5 }]);
    h.step();
    const e = h.spawn('enemy_1404_msnip', { pos: [10, 8], routeIndex: 0, mods: { speedMul: 0 } });
    const w = h.unit('t_a');
    let shot = null;
    const fx = h.b.fx.bind(h.b);
    h.b.fx = (k, o) => { if (k === 'enemyShot' && o.id === e.id && shot == null) shot = h.b.time; return fx(k, o); };
    const t0 = untilCast(h, e, 'CrossAttack');
    assert.ok(e.findBuff('ab:revealed'), 'revealed as the cast starts');
    if (stunAt != null) {
      h.run(t0 + stunAt - h.b.time);
      assert.ok(h.b.applyStatus(e, 'stun', { duration: 3 }), 'stunned');
    }
    h.run(t0 + 3 - h.b.time);
    return { shot: shot == null ? null : shot - t0, stun: !!w.s.flags.stun };
  };
  const a = go(null);
  assert.ok(a.shot != null && Math.abs(a.shot - (2.5 - 1.1 + 0.067)) <= TICK + 1e-6, `the bolt at 1.467 s (${a.shot})`);
  assert.ok(a.stun, 'it struck');
  const c = go(1);
  assert.equal(c.shot, null, 'stunned 1 s in: no bolt');
  assert.ok(!c.stun);
});

// 萨卡兹王庭军精锐术师 死亡之眼 (docs/rules/sim.md 「적 스킬 = 일반 공격 차례」 효과가 나는 때): a sequence whose first child,
// LineAttack, waits for its line projectile — castStrikeAt has no frame for it (the second child starts when the line is
// gone) and the kit times its parts: the line leaves after LineAttack's `_preDelay`, links once it has flown to the target
// (its `_speed`), hits as it links and each second after, and ChargeAttack bursts as the link's life ends. Until
// 2026-11-20 the channel began as the cast did.
test('萨卡兹王庭军精锐术师 死亡之眼: the line leaves after LineAttack\'s `_preDelay`, links after its flight, bursts as the link ends — nothing when stunned first', () => {
  const E = read('data/enemies.json'), key = 'enemy_1275_dwlock_2';
  const sc = E[key].skillCast.deatheye, sk = E[key].skills.find((x) => x.prefabKey === 'DeathEye');
  assert.equal(enemiesMod.castStrikeAt({ s: { interval: 4 } }, sc, sk.bb), null, 'no fixed frame for the sequence');
  const link = sc.subs[0].pre + 2 / sk.proj.speed;   // 2 tiles to its target
  const go = (stunAt) => {
    const h = arena([{ chessId: 't_a', row: 9, col: 5 }, { chessId: 't_b', row: 10, col: 5 }]);
    h.step();
    const e = h.spawn(key, { pos: [9, 7], routeIndex: 0, mods: { speedMul: 0 } });
    const w = h.unit('t_a'), w2 = h.unit('t_b');
    const t0 = untilCast(h, e, 'DeathEye');
    const n0 = w.stats.taken;
    if (stunAt != null) {
      h.run(t0 + stunAt - h.b.time);
      assert.ok(h.b.applyStatus(e, 'stun', { duration: 1 }), 'stunned');
    }
    h.run(t0 + link - 0.05 - h.b.time);
    const before = w.stats.taken - n0;
    h.run(0.1);
    const first = w.stats.taken - n0;
    h.run(t0 + link + sk.bb.hit_duration - 0.1 - h.b.time);
    const burstEarly = w2.elem.apoptosis;
    h.run(0.2);
    return { before, first, burstEarly, burst: w2.elem.apoptosis };
  };
  const r = go(null);
  assert.equal(r.before, 0, 'nothing before the line links');
  assert.ok(r.first > 0, 'its first hit as it links');
  assert.ok(r.burstEarly === 0 && r.burst > 0, 'the group burst as the link\'s life ends');
  const c = go(0.3);
  assert.ok(c.first === 0 && c.burst === 0, 'stunned in its pre-delay: no line, no burst');
});

// docs/rules/sim.md 「적 스킬 = 일반 공격 차례」 효과가 나는 때 — 시작에 고르는 대상: an ability whose `_selectTargetTiming` is 0
// (AT_BEGINING) takes its targets as it is cast (AbilityStandard.CastToTarget → UpdateTargets) and its spell goes to those still
// alive on the field (DoCastOnTargets: ValidAndAlive) — a unit that falls before the frame is not swapped for another. Until
// 2026-11-20 迷路的巨像, W, 陷落雪祀 and the others took their targets again at the frame.
test('targets taken as the cast begins (`_selectTargetTiming` 0): one that falls before the spell is not replaced — 迷路的巨像, W', () => {
  const go = (key, name, wallsAt, killFirst) => {
    const h = arena(wallsAt.map(([row, col], i) => ({ chessId: `t_${i}`, row, col })));
    h.step();
    const e = h.spawn(key, { pos: [10, 8], routeIndex: 0, mods: { speedMul: 0 } });
    const t0 = untilCast(h, e, name);
    return { h, e, t0, kill: (u) => { if (killFirst) h.b.kill(u, null); } };
  };
  // 迷路的巨像 StunAttack (its input target): the nearer wall is its target; it falls 0.5 s in, before the 1.067 s boulder
  for (const killFirst of [false, true]) {
    const { h, t0, kill } = go('enemy_2003_rockman', 'StunAttack', [[10, 7], [10, 6]], killFirst);
    const [a, b2] = [h.unit('t_0'), h.unit('t_1')];
    h.run(t0 + 0.5 - h.b.time);
    kill(a);
    h.run(t0 + 2.5 - h.b.time);
    if (!killFirst) assert.ok(a.s.flags.stun && !b2.s.flags.stun, '迷路的巨像: its target is stunned, the other not');
    else assert.ok(!b2.s.flags.stun, '迷路的巨像: its target fell first — no boulder for the other wall');
  }
  // W C4 (mode Default: the nearest ground unit), `_preDelay` 0.6 s: its target falls 0.3 s in — no charge at all
  for (const killFirst of [false, true]) {
    const { h, e, t0, kill } = go('enemy_1504_cqbw', 'C4', [[10, 7], [10, 6]], killFirst);
    const [a, b2] = [h.unit('t_0'), h.unit('t_1')];
    let charges = 0;
    const fx = h.b.fx.bind(h.b);
    h.b.fx = (k, o) => { if (k === 'telegraph' && o.kind === 'c4') charges++; return fx(k, o); };
    h.run(t0 + 0.3 - h.b.time);
    kill(a);
    h.run(t0 + 1 - h.b.time);
    assert.equal(charges, killFirst ? 0 : 1, `W: ${killFirst ? 'its target fell first — no charge on the other' : 'one charge'}`);
    assert.ok(b2.alive && e.alive);
  }
});

test('陷落雪祀 【反自然馈赠】: the first enemy of the chain is taken as the cast begins — none when it is gone before the spell', () => {
  const go = (killFirst) => {
    const h = arena([{ chessId: 't_0', row: 2, col: 2 }]);
    h.step();
    const e = h.spawn('enemy_2050_smsha', { pos: [10, 8], routeIndex: 0, mods: { speedMul: 0 } });
    const a = h.spawn('enemy_1001_bigbo', { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
    const o = h.spawn('enemy_1001_bigbo', { pos: [10, 6], routeIndex: 0, mods: { speedMul: 0 } });
    const t0 = untilCast(h, e, 'ChainBuff');
    h.run(t0 + 0.2 - h.b.time);
    if (killFirst) h.b.kill(a, null);
    h.run(t0 + 1.5 - h.b.time);
    return { first: !!a.findBuff('ab:chainBuff'), other: !!o.findBuff('ab:chainBuff') };
  };
  const r = go(false);
  assert.ok(r.first && r.other, 'uncut: the nearer enemy, then the chain jumps on');
  const c = go(true);
  assert.ok(!c.other, 'its first enemy gone before the spell: no chain');
});
