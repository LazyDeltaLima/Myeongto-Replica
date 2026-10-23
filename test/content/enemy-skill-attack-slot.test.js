// An enemy's skill is cast at an attack slot, in place of the normal attack (the client's Enemy.AttackWrapper.SearchTarget /
// Cast, EnemySkill.OnTick / _OnCastFinish; docs/rules/sim.md 「적 스킬 = 일반 공격 차례」): the main attack ready, the ready
// skill of the highest priority is cast instead of the attack, the attack's cooldown restarts, and the skill's own
// cooldown runs again from the end of its cast. Until 2026-10-21 a skill fired the moment its cooldown was over, beside
// the normal attacks — 盐风主教昆图斯's third form hit with both every 3.5 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { SharedBossPool } from '../../server/match/finalAssault.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { GameData } from '../../server/match/gamedata.js';
import { buildBossWave, setupMatchWaves } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';
import { GEO } from '../../shared/constants.js';
import { getData } from '../../server/data.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const E = JSON.parse(fs.readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
const WALL = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const NOATK = () => ({ trait: { noAttack: true } });

function arena(o = {}) {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { t_wall: WALL('t_wall'), t_wall2: WALL('t_wall2') } }, kits: { t_wall: NOATK, t_wall2: NOATK }, enemies: [], ...o,
  });
}
const put = (h, key, pos, o = {}) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 }, tag: o.tag ?? null });

/** Every slot of enemy `e` from now: { t, skill } — a skill cast (its name) or a normal attack's swing (null). */
function watchSlots(h, e) {
  const slots = [];
  const ev = h.b._ev.bind(h.b);
  h.b._ev = (x) => { if (x[0] === 'swing' && x[1] === e.id) slots.push({ t: h.b.time, skill: null }); return ev(x); };
  const fx = h.b.fx.bind(h.b);
  h.b.fx = (k, o2) => { if (k === 'enemySkill' && o2.id === e.id) slots.push({ t: h.b.time, skill: o2.ability }); return fx(k, o2); };
  return slots;
}

test('the mode\'s enemy skills carry how the client casts them (data/enemies.json skillCast): every one has the ATTACK or COMBAT family', () => {
  let n = 0;
  for (const [key, e] of Object.entries(E)) {
    if (!e.skillCast) continue;
    for (const [name, c] of Object.entries(e.skillCast)) {
      n++;
      assert.ok((c.family & 3) !== 0, `${key} ${name}: family ${c.family}`);
      if (c.clip) assert.ok(c.dur > 0, `${key} ${name}: clip ${c.clip} has a length`);
    }
  }
  assert.ok(n >= 120, `${n} skills read`);
  const q = E.enemy_1521_dslily.skillCast;
  assert.deepEqual([q.tidewaterg2.clip, q.tidewaterg2.dur, q.rockfallg2.dur, q.summontentacg2.dur], ['Skill_02', 1.667, 3, 2]);
  assert.deepEqual([E.enemy_1513_dekght.skillCast.chargeattack.resetMain, E.enemy_1513_dekght.skillCast.chargeattack.waitFirst], [1, 1]);
});

test('a skill is cast at the attack slot in place of the normal attack, and the attack\'s cooldown restarts from it', () => {
  // 萨卡兹王庭军精锐术师 (enemy_1275_dwlock_2): attack every 4 s, 【死亡之眼】 DeathEye initCooldown 10 (no clip)
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 5 }] });
  h.step();
  const e = put(h, 'enemy_1275_dwlock_2', [9, 7]);
  const slots = watchSlots(h, e);
  const s = E.enemy_1275_dwlock_2.skills.find((x) => x.prefabKey === 'DeathEye');
  h.run(s.initCooldown + 3 * e.s.interval + s.bb.hit_duration + 0.1);
  const cast = slots.find((x) => x.skill === 'DeathEye');
  assert.ok(cast, 'cast');
  const before = slots.filter((x) => x.t < cast.t - 1e-9).at(-1);
  assert.ok(cast.t >= s.initCooldown - 1e-9 && cast.t < s.initCooldown + e.s.interval + 0.1, `at the first slot once ready (${cast.t.toFixed(2)})`);
  assert.ok(Math.abs(cast.t - before.t - e.s.interval) < 0.1, 'a slot of the attack cadence');
  assert.ok(!slots.some((x) => x.skill === null && Math.abs(x.t - cast.t) < 1e-9), 'no normal attack at that slot');
  const after = slots.find((x) => x.t > cast.t + 1e-9);
  assert.ok(after && after.skill === null && after.t - cast.t > e.s.interval - 0.1, 'the next normal attack no sooner than one interval later (its 死亡之眼 channel may hold it longer)');
});

test('an unarmed enemy\'s skill keeps its own cooldown (no attack slot)', () => {
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 5 }] });
  h.step();
  const e = put(h, 'enemy_1275_dwlock_2', [9, 7]);
  e.profile.noAttack = true;
  const slots = watchSlots(h, e);
  const s = E.enemy_1275_dwlock_2.skills.find((x) => x.prefabKey === 'DeathEye');
  h.run(s.initCooldown + 0.2);
  const cast = slots.find((x) => x.skill === 'DeathEye');
  assert.ok(cast && Math.abs(cast.t - h.TICK - s.initCooldown) < h.TICK * 2, `at its initial cooldown (${cast && cast.t})`);
});

test('ready skills at one slot: the highest priority is cast (假想敌：胄 灭顶之灾 priority 1 over 死亡集群 0), the other waits for a later slot', () => {
  const h = arena({ units: [{ chessId: 't_wall', row: 10, col: 6 }], kind: 'boss', sharedBoss: { hp: 1e9, maxHp: 1e9, damage() {} } });
  h.step();
  const e = put(h, 'enemy_9013_acstmk', [3, 10], { tag: 'boss' });
  h.step();
  const shell = e.mem.ab.list.find((a) => a.name === '1'), drones = e.mem.ab.list.find((a) => a.name === '2');
  e.atkCd = 1; e.castLeft = 0; e.swing = null;
  shell.left = 0; drones.left = 0;
  const slots = watchSlots(h, e);
  h.run(1.2);
  assert.deepEqual(slots.map((x) => x.skill), ['1'], 'the priority-1 skill at the slot, alone');
  assert.ok(drones.left <= 0, '死亡集群 still ready');
});

/** The real round-14 solo boss_4 field (the real match path), the shared pool cut to `ratio`. */
function realQuintus(ratio) {
  const DATA = getData({ log: { warn() {}, error() {}, info() {} } });
  const gd = new GameData(DATA, 'mode_single_hard');
  const setup = setupMatchWaves(gd, createRng(3));
  const SPOTS = [[8, 2], [8, 4], [8, 6], [10, 3], [10, 5], [12, 2], [12, 6]];
  const units = SPOTS.map(([row, col], i) => ({ uid: i + 1, chessId: 'chess_char_1_02_a', row, col }));
  const wave = buildBossWave(gd, createRng(1), setup.factions, 14, { bossId: 'boss_4', solo: true });
  const pool = new SharedBossPool(gd.boss('boss_4').bloodPoint.HARD);
  pool.hp = pool.maxHp * ratio;
  const spec = buildBattleSpec({
    battleId: 'slot.q', fieldId: 'b1', kind: 'boss', seed: 5, modeId: 'mode_single_hard', round: 14, stageId: 'act2autochess_m01',
    rect: { ...GEO.BOSS_RECT }, timeLimit: null, players: [{ playerId: 'p_0', seat: 0, side: 'L', colOffset: 0, units, bonds: {}, playerEffects: [] }],
    spawns: wave.spawns.filter((s) => s && gd.enemy(s.enemyKey)), routes: wave.routes,
    flags: { layerGainsEnabled: false, ...gd.dp }, enemyOverrides: wave.overrides, waveId: wave.templateId, bossId: 'boss_4',
    boss: { poolHp: pool.hp, poolMax: pool.maxHp },
  });
  return createBattleFromSpec(JSON.parse(JSON.stringify(spec)), undefined, { sharedBoss: pool, recordEvents: true, quiet: true });
}

test('real boss_4 field, third form: one action per 3.5 s slot — 大潮 waits its cooldown 3.5 + its 1.667 s cast, normal attacks between', () => {
  const b = realQuintus(0.3);
  const acts = [];
  b.on('enemySkillSlot', (c) => { if (c.enemy.isBoss && c.cast) acts.push({ t: b.time, kind: 'skill' }); }, { priority: -1000 });
  const ev = b._ev.bind(b);
  b._ev = (x) => { if (x[0] === 'swing' && b.enemies.find((u) => u.id === x[1])?.isBoss) acts.push({ t: b.time, kind: 'attack' }); return ev(x); };
  const tides = [];
  const fx = b.fx.bind(b);
  b.fx = (k, o) => { if (k === 'enemySkill' && o.ability === 'TidewaterG2') tides.push(b.time); return fx(k, o); };
  let q = null, g2 = null;
  for (let i = 0; i < 30 * 60 && !b.finished; i++) {
    b.step();
    q = q || b.enemies.find((e) => e.isBoss);
    if (q && g2 == null && q.buffs.some((x) => x.key === 'boss:grow' && x.mods.atkPct > 0.5)) g2 = b.time;
  }
  assert.ok(g2 != null && g2 < 10, `third form at once below 34 % (${g2})`);
  const later = acts.filter((a) => a.t > g2 + 1);
  for (let i = 1; i < later.length; i++) assert.ok(later[i].t - later[i - 1].t > q.s.interval - 0.1, `one action per slot (${later[i - 1].t.toFixed(2)} → ${later[i].t.toFixed(2)})`);
  assert.ok(later.some((a) => a.kind === 'attack'), 'normal attacks still come between the casts');
  assert.ok(tides.length >= 5, `大潮 ×${tides.length}`);
  for (let i = 1; i < tides.length; i++) {
    const gap = tides[i] - tides[i - 1];
    // the next slot past cooldown + cast: 7 s, sooner only when a normal attack between found its targets dead (its
    // cooldown refunded, ai.js enemyStrike)
    assert.ok(gap > 3.5 + 1.667 - 0.05, `大潮 waits cooldown + cast: ${gap.toFixed(2)} s`);
  }
});

// The block picks the wrapper (the client's Enemy.States.MoveState.OnTick: a blocker ⇒ the COMBAT state, before
// _SearchAttackTarget; CombatWrapper._PickAbility takes the COMBAT family, AttackWrapper.SearchTarget the ATTACK one):
// a skill whose `_familyMask` lacks the state's family is never begun there. Until 2026-10-22 the family was ignored —
// 重弩突袭者 stunned its own blocker with 直击 (ATTACK only), “帝国的甲胄” charged its ranged attacks (MultiCombat, COMBAT only).
test('the block picks the skill family: 重弩突袭者 直击 (ATTACK only) is never begun while blocked, in line unblocked it is', () => {
  assert.equal(E.enemy_1404_msnip.skillCast.crossattack.family, 1);
  const s = E.enemy_1404_msnip.skills.find((x) => x.prefabKey === 'CrossAttack');
  const run = (col) => {
    const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 5 }] });
    h.step();
    const e = put(h, 'enemy_1404_msnip', [9, col]);
    const slots = watchSlots(h, e);
    const wall = h.unit('t_wall');
    let stunned = false;
    for (let t = 0; t < s.initCooldown + 2 * s.cooldown; t += 0.1) { h.run(0.1); stunned = stunned || !!wall.s.flags.stun; }
    return { e, wall, stunned, casts: slots.filter((x) => x.skill === 'CrossAttack').length, attacks: slots.filter((x) => x.skill === null).length };
  };
  const blocked = run(5);
  assert.equal(blocked.e.blockedBy, blocked.wall, 'blocked');
  assert.equal(blocked.casts, 0, 'no 直击 on its blocker');
  assert.equal(blocked.stunned, false, 'the blocker is never stunned');
  assert.ok(blocked.attacks > 0, 'it fights its blocker with its normal (Combat) attack');
  const free = run(8);
  assert.equal(free.e.blockedBy, null);
  assert.ok(free.casts >= 2 && free.stunned, `in line, unblocked: 直击 ×${free.casts}, the unit stunned`);
});

test('real match path: a 重弩突袭者 blocked by 角峰 never stuns it', { skip: !hasGeneratedData() }, async () => {
  const KEY = 'enemy_1404_msnip', YAK = 'chess_char_1_02_a';
  const { makeMatch } = await import('../match/harness.js');
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', humans: 1, seed: 11 }).start();
  h.toPrep(3);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const p = ps.acquireChess(YAK, { source: 'buy' });
  assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: 10, col: 4 }, dir: 'RIGHT' }).ok);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'msnip', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) b.step();
  b._pending.length = 0;           // the stage's own waves stay out of this field
  const yak = b.allyUnits.find((u) => u.defId === YAK);
  assert.ok(yak && yak.deployed, 'the defender stands on the field');
  b.addBuff(yak, { key: 'test:tough', duration: Infinity, flags: { invulnerable: true, disarm: true, silence: true } });
  const e = b.spawnEnemy(KEY, { pos: [yak.y, yak.x], mods: { speedMul: 0 } });
  let casts = 0, stunned = false;
  const fx = b.fx.bind(b);
  b.fx = (k, o) => { if (k === 'enemySkill' && o.id === e.id) casts++; return fx(k, o); };
  const end = b.time + 20;
  while (b.time < end && !b.finished) { b.step(); stunned = stunned || !!yak.s.flags.stun; }
  assert.equal(e.blockedBy, yak, 'blocked by the defender');
  assert.ok(e.stats.attacks > 0, 'it attacks its blocker');
  assert.equal(casts, 0, 'no 直击');
  assert.equal(stunned, false);
  assert.deepEqual(b.errors.map((x) => x.error?.message), []);
  m.dispose?.();
});
