// Leader patterns on the real boss field (CONTRIBUTING §6: the real match path — the round's boss wave from
// server/match/waves.js → buildBattleSpec → createBattleFromSpec, real operators, the full content): 假想敌：铳's ASPD stacks
// (official BrownbTalent_1), 刺胄之弹's lasting arrival zone (official projectile_enemy_acstmr_s1), 假想敌：管's
// whole-field 3-shot normal attack (official prefab Attack, projectile_enemy_acduml) and the hidden 铳 field's
// “碎铳之簧” (BLOCK_FREE passive, the shield skill in place of a normal attack, the share to 铳 only) and 盐风主教昆图斯's
// 子代 (the template's predefined token: 隐匿, then 摄食 on the operator next to it) and 阿利斯泰尔's 黄金回响 (莫非王土 on a
// 冲击式施术单元: a device on its tile that shoots the operators within Manhattan 2; its first 防护背心 guards its front). The unit-level rules
// and their numbers are pinned in test/content/enemies_bosses.test.js; docs/rules/sim.md 「최종 공세·히든 코어 보스 패턴」.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SharedBossPool } from '../../server/match/finalAssault.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { GameData } from '../../server/match/gamedata.js';
import { buildBossWave, setupMatchWaves } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';
import { GEO } from '../../shared/constants.js';
import { getData } from '../../server/data.js';

const DATA = getData({ log: { warn() {}, error() {}, info() {} } });
const gd = new GameData(DATA, 'mode_single_hard');
const setup = setupMatchWaves(gd, createRng(3));
const SPOTS = [[8, 2], [8, 4], [8, 6], [10, 3], [10, 5], [12, 2], [12, 6]];

/** The round's solo boss field — `hidden`: the Hidden Core's (round 15, boss_8–10). */
function realBossField(bossId, { hidden = false, extra = [] } = {}) {
  const round = hidden ? 15 : 14;
  const units = [...SPOTS.map(([row, col]) => ({ chessId: 'chess_char_1_02_a', row, col })), ...extra].map((u, i) => ({ uid: i + 1, ...u }));
  const players = [{ playerId: 'p_0', seat: 0, side: 'L', colOffset: 0, units, bonds: {}, playerEffects: [] }];
  const wave = buildBossWave(gd, createRng(1), setup.factions, round, { bossId, solo: true });
  const pool = new SharedBossPool(gd.boss(bossId).bloodPoint.HARD);
  const spec = buildBattleSpec({
    battleId: `bp.${bossId}`, fieldId: 'b1', kind: hidden ? 'hidden' : 'boss', seed: 5, modeId: 'mode_single_hard', round, stageId: 'act2autochess_m01',
    rect: { ...GEO.BOSS_RECT }, timeLimit: null, players, spawns: wave.spawns.filter((s) => s && gd.enemy(s.enemyKey)), routes: wave.routes,
    flags: { layerGainsEnabled: false, ...gd.dp }, enemyOverrides: wave.overrides, waveId: wave.templateId, bossId,
    boss: { poolHp: pool.maxHp, poolMax: pool.maxHp },
  });
  return createBattleFromSpec(JSON.parse(JSON.stringify(spec)), undefined, { sharedBoss: pool, recordEvents: true, quiet: true });
}

test('real boss_2 field: 假想敌：铳 leaves 1 stack after a new target\'s first attack and one more per attack on the same target (max 5)', () => {
  const b = realBossField('boss_2');
  const bb = gd.enemy('enemy_9017_achunt').talents.bb;
  const step = bb['2.attack_speed'], max = bb['2.max_stack_cnt'];
  const seen = [], swings = [];
  b.on('attack', (c) => { if (c.attacker && c.attacker.isBoss) seen.push({ t: b.time, tgt: c.targets[0], aspd: c.attacker.s.aspd }); }, { priority: -1000 });
  const ev = b._ev.bind(b);
  b._ev = (x) => { const e = x[0] === 'swing' && b.enemies.find((u) => u.id === x[1]); if (e && e.isBoss) swings.push({ t: b.time, aspd: e.s.aspd }); return ev(x); };
  for (let i = 0; i < 30 * 90 && !b.finished; i++) b.step();
  assert.ok(seen.length >= 5, `the gun attacked (${seen.length})`);
  let last = null, n = 0;
  for (const a of seen) {
    n = a.tgt === last ? Math.min(max, n + 1) : 1;
    last = a.tgt;
    assert.equal(a.aspd, step * n, `t ${a.t.toFixed(2)}: ${n} stack(s)`);
  }
  const k = seen.findIndex((a, i) => i > 0 && a.tgt === seen[i - 1].tgt);
  assert.ok(k > 0, 'two attacks in a row on one target');
  // the stack lands as the attack strikes, t into its swing; the running cooldown keeps its progress ratio (client
  // OnAttackTimeChanged): the next swing comes t + (1 − t/T_old)·T_new after this one
  const T = (aspd) => gd.enemy('enemy_9017_achunt').stats.bat * 100 / aspd;
  const sw = swings.filter((x) => x.t <= seen[k - 1].t + 1e-9).at(-1), next = swings.find((x) => x.t > seen[k - 1].t + 1e-9);
  const t = seen[k - 1].t - sw.t, want = t + (1 - t / T(sw.aspd)) * T(seen[k - 1].aspd);
  assert.ok(Math.abs(next.t - sw.t - want) < 0.1, `swing to swing: ${next.t - sw.t} ≈ ${want}`);
});

// client prefab Modes/S1: achunt_s_1[speed] adds `3.move_speed` before the multipliers; the charge walks the engine's path
// (e.trace) — a slow slows all of it, every step stays within the gun's own speed
test('real boss_2 field: 假想敌：铳 最终之罚 traces at (move speed + 3.move_speed) × its multipliers, a slow included', () => {
  const b = realBossField('boss_2');
  const add = gd.enemy('enemy_9017_achunt').talents.bb['3.move_speed'];
  let g = null;
  for (let i = 0; i < 30 * 60 && !b.finished; i++) { b.step(); g = b.enemies.find((u) => u.isBoss && u.alive && u.findBuff('boss:charge')); if (g) break; }
  assert.ok(g, 'the gun charged');
  assert.ok(g.trace && !g.s.flags.noMove && g.s.flags.disarm, 'it walks a trace and does not attack');
  assert.ok(Math.abs(g.s.moveSpeed - (g.base.moveSpeed + add)) < 1e-9, `speed ${g.s.moveSpeed}`);
  b.applyStatus(g, 'slow', { duration: 30, value: 0.5 });
  assert.ok(Math.abs(g.s.moveSpeed - (g.base.moveSpeed + add) * 0.5) < 1e-9, `slowed ${g.s.moveSpeed}`);
  let far = 0;
  for (let i = 0; i < 30 && g.findBuff('boss:charge'); i++) {
    const x0 = g.x, y0 = g.y, t0 = b.time;
    b.step();
    far = Math.max(far, Math.hypot(g.x - x0, g.y - y0) / (b.time - t0));
  }
  assert.ok(far > 0 && far <= (g.base.moveSpeed + add) * 0.5 * 0.5 + 1e-6, `moving, at most the slowed speed (${far} tiles/s)`);
});

test('real boss_1 field: 刺胄之弹 leaves a 9.95 s zone that hits the operators in it every 1 s (400 phys + 2.1 s stun), no DoT buff', () => {
  const b = realBossField('boss_1');
  const sb = gd.enemy('enemy_9016_acstmr').talents.bb;
  const hits = new Map();   // unit → [times]
  b.on('damaged', (c) => { if (c.dmg && c.dmg.tags && c.dmg.tags.includes('helmShell')) { const l = hits.get(c.target) || []; l.push([b.time, c.amount]); hits.set(c.target, l); } }, { priority: -1000 });
  let dot = false;
  for (let i = 0; i < 30 * 90 && !b.finished; i++) { b.step(); if (b.allies().some((u) => u.findBuff('boss:helmShellDot'))) dot = true; }
  const zones = b.drainEvents().filter((e) => e[0] === 'fx' && e[1] === 'zone' && e[4] && e[4].kind === 'helmShell');
  assert.ok(zones.length >= 1, 'a shell arrived and left its zone');
  approx(zones[0][4].dur, 9.95);
  assert.ok(hits.size >= 1, 'operators were hit by the zone');
  assert.ok(!dot, 'no DoT buff any more');
  let again = false;
  for (const l of hits.values()) {
    for (const [, amt] of l) assert.ok(amt > 0 && amt <= sb['killed.value'] + 1e-6, `≤ killed.value (${amt})`);
    for (let i = 1; i < l.length; i++) {
      const dt = l[i][0] - l[i - 1][0];
      assert.ok(dt >= 1 - 1e-6, `one hit per unit per 1 s (${dt})`);
      if (dt < 1.5) again = true;
    }
  }
  assert.ok(again, 'an operator staying in the zone is hit again 1 s later');
});

test('real boss_3 field: 假想敌：管 fires 3 shots per attack (arts) at a dark 余音 while one exists, at operators while none does', () => {
  const b = realBossField('boss_3');
  let pipe = null;
  for (let i = 0; i < 30 * 20 && !pipe; i++) { b.step(); pipe = b.enemies.find((e) => e.alive && e.isBoss && e.defId === 'enemy_9021_acduml'); }
  assert.ok(pipe, 'the 管 entered');
  const echoes = () => b.enemies.filter((e) => e.alive && e.defId === 'enemy_9023_acdums');
  const shots = [];   // the 管's non-element hits: [time, target, type, a 余音 alive then]
  const deal = b.dealDamage;
  b.dealDamage = function (s, t, d) {
    if (s === pipe && t && t.alive && d.type !== 'element') shots.push([b.time, t, d.type, echoes().length > 0]);
    return deal.call(this, s, t, d);
  };
  let maxHits = 0;
  for (let i = 0; i < 30 * 70 && !b.finished; i++) { b.step(); for (const o of echoes()) maxHits = Math.max(maxHits, o.s.maxHp); }
  assert.ok(shots.length > 0 && shots.every(([, , ty]) => ty === 'arts'), 'arts shots');
  const onEcho = shots.filter(([, u]) => u.defId === 'enemy_9023_acdums');
  assert.ok(onEcho.length >= 3, `余音 took shots (${onEcho.length})`);
  const t0 = onEcho[0][0];
  assert.equal(new Set(onEcho.filter(([t]) => t - t0 < 1).map(([t]) => t.toFixed(3))).size, 3, 'three shots in a volley');
  assert.ok(shots.some(([, u, , any]) => !any && u.side === 'ally'), 'operators shot while no 余音 was on the field');
  // round 14 余音: the round's HP multiplies its hits (research boss-patterns 「진행」: 合奏 needs 12 hits taken)
  assert.ok(maxHits >= 12, `a 余音 lives long enough to fill its 合奏 SP (${maxHits} hits)`);
});

function approx(a, b, eps = 1e-6) { assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`); }

test('real boss_9 field: “碎铳之簧” are never blocked; with full SP the attack is the shield skill (no normal hit) — 十连击 ten shots 0.1 s apart; damage passes to 铳 only', () => {
  const b = realBossField('boss_9', { hidden: true });
  const isSpring = (e) => e && /enemy_90(18|19|20)_actrp/.test(e.defId);
  const attacks = [], normal = [], combo = [], casts = [];
  const fx = b.fx.bind(b);
  b.fx = (k, o) => { if (k === 'enemySkill' && isSpring(b.enemies.find((e) => e.id === o.id))) casts.push({ t: b.time, id: o.id }); return fx(k, o); };
  b.on('attack', (c) => { if (isSpring(c.attacker)) attacks.push({ t: b.time, e: c.attacker }); }, { priority: -1000 });
  b.on('damaged', (c) => {
    if (!isSpring(c.source)) return;
    if (c.dmg && c.dmg.isAttack) normal.push({ t: b.time, e: c.source });
    if (c.dmg && c.dmg.tags && c.dmg.tags.includes('springCombo')) combo.push({ t: b.time, e: c.source, to: c.target });
  }, { priority: -1000 });
  let free = true;
  for (let i = 0; i < 30 * 150 && !b.finished; i++) {
    b.step();
    for (const e of b.enemies) if (e.alive && isSpring(e) && (e.blockedBy || !e.s.flags.unblockable)) free = false;
  }
  assert.ok(free, 'no spring was ever blockable or blocked');
  const castBy = (key) => casts.filter((x) => b.enemies.find((e) => e.id === x.id).defId === key);
  for (const key of ['enemy_9019_actrpb', 'enemy_9020_actrpc']) {
    assert.ok(castBy(key).length >= 1, `${key} cast its shield skill`);
    for (const x of castBy(key)) {
      const at = attacks.find((a) => a.e.id === x.id && Math.abs(a.t - x.t) < 1e-6);
      assert.ok(at, `${key}: the skill is one of its attacks (t ${x.t})`);
      assert.ok(!normal.some((n) => n.e === at.e && n.t >= at.t && n.t < at.t + 1), `${key}: that attack has no normal hit`);
    }
  }
  const c0 = castBy('enemy_9020_actrpc')[0];
  const shots = combo.filter((c) => c.e.id === c0.id && c.t >= c0.t && c.t < c0.t + 2);
  // ten shots on the first shot's target; if it dies the rest are lost (official INPUT_TARGET, AT_BEGINING)
  assert.ok(shots.length >= 2 && shots.every((x) => x.to === shots[0].to), '十连击: one target');
  assert.ok(shots.length === 10 || !shots[0].to.alive, `ten shots, fewer only once the target died (${shots.length})`);
  for (let k = 1; k < shots.length; k++) assert.ok(Math.abs(shots[k].t - shots[k - 1].t - 0.1) < 0.02, '0.1 s apart');
  // 【盲信之誓】: the gun alone takes the share
  const springs = b.enemies.filter((e) => e.alive && isSpring(e));
  const gun = b.enemies.find((e) => e.alive && e.isBoss);
  const op = b.allyUnits.find((u) => u.alive);
  assert.ok(springs.length >= 2 && gun && op, 'springs, 铳 and an operator on the field');
  const others = springs.slice(1).map((e) => [e, e.hp]);
  const pool0 = b.sharedBoss.hp;
  const dealt = b.dealDamage(op, springs[0], { amount: 50000, type: 'true', canDodge: false });
  assert.ok(dealt > 0 && Math.abs((pool0 - b.sharedBoss.hp) - dealt) < 1e-6, 'the pool lost what the spring took');
  for (const [e, hp] of others) assert.ok(e.hp === hp, 'no share to the other springs');
});

test('real boss_4 field: 断裂生殖 switches on the template\'s 子代 at device #1 — 隐匿 12 s, then 摄食 bites the operator next to it every 1 s', () => {
  const b = realBossField('boss_4', { extra: [{ chessId: 'chess_char_1_02_a', row: 12, col: 8 }] });   // field (5, 8), next to device #1 (5, 9)
  const bites = [];
  b.on('damaged', (c) => { if (c.source && c.source.defId === 'trap_039_dstnta' && c.dmg && c.dmg.type === 'phys') bites.push({ t: b.time, to: c.target }); }, { priority: -1000 });
  let brood = null, t0 = null, larva = false;
  for (let i = 0; i < 30 * 75 && !b.finished; i++) {
    b.step();
    if (!brood) { brood = b.enemies.find((q) => q.defId === 'trap_039_dstnta') || null; if (brood) { t0 = b.time; larva = !!brood.s.flags.stealth; } }
  }
  assert.ok(brood, 'a 子代 appeared');
  assert.deepEqual([brood.y, brood.x], [5, 9]);
  assert.ok(larva, 'it starts 隐匿');
  assert.equal(brood.tag, 'part');
  const op = b.allyUnits.find((u) => u.tileR === 5 && u.tileC === 8);   // it may have fallen by now
  assert.ok(op, 'the operator next to the device');
  assert.ok(bites.length >= 3 && bites.every((x) => x.to === op), `摄食 bites it (${bites.length})`);
  assert.ok(bites[0].t - t0 >= 14.85, `not before it has grown (${bites[0].t - t0})`);
  for (let i = 1; i < bites.length; i++) assert.ok(Math.abs(bites[i].t - bites[i - 1].t - 1) < 0.06, 'every 1 s');
});

test('real boss_6 field: 莫非王土 on a 冲击式施术单元 leaves a 黄金回响 on its tile, which shoots operators within Manhattan 2 (arts); no disarm', () => {
  // 阿利斯泰尔 stands at field (3, 10): two operators in its reach, at (3, 8) and (2, 7)
  const b = realBossField('boss_6', { extra: [{ chessId: 'chess_char_1_02_a', row: 10, col: 8 }, { chessId: 'chess_char_1_02_a', row: 9, col: 7 }] });
  const wands = [], goldens = [], hits = [], disarms = [];
  b.on('enemySpawn', ({ enemy }) => {
    if (enemy.defId === 'enemy_10030_vtwand') wands.push(enemy);
    if (enemy.defId === 'trap_185_vtlntw') goldens.push({ t: b.time, at: [enemy.y, enemy.x], u: enemy });
  });
  b.on('damaged', (c) => { if (c.source && c.source.defId === 'trap_185_vtlntw') hits.push({ to: c.target, type: c.type, from: c.source }); }, { priority: -1000 });
  b.on('statusApplied', (c) => { if (c.status === 'disarm' && c.source && c.source.defId === 'enemy_9032_aclionk') disarms.push(c); });
  for (let i = 0; i < 30 * 120 && !b.finished && !(hits.length >= 2); i++) b.step();
  assert.ok(wands.length >= 1, 'a 冲击式施术单元 fell');
  assert.ok(goldens.length >= 1, 'a 黄金回响 appeared');
  assert.ok(wands.some((w) => !w.alive && w.y === goldens[0].at[0] && w.x === goldens[0].at[1]), 'on the animated wand\'s tile');
  assert.ok(hits.length >= 2, `it shoots (${hits.length})`);
  for (const x of hits) {
    assert.equal(x.type, 'arts');
    assert.ok(Math.abs(x.to.tileR - Math.round(x.from.y)) + Math.abs(x.to.tileC - Math.round(x.from.x)) <= 2, 'within Manhattan 2');
  }
  assert.equal(disarms.length, 0, 'no more disarm substitute');
});

test('real boss_6 field: the first 防护背心 阿利斯泰尔 animates guards its front — the way its route leads, −x', () => {
  // official route (3, 10) → (2, 2): it faces −x while it waits at the start; enemy_vtlionk_shld's `front` toggle from 0 makes
  // the first vest FRONT (maintainer decision 2026-10-15)
  const b = realBossField('boss_6', { extra: [{ chessId: 'chess_char_1_02_a', row: 10, col: 8 }, { chessId: 'chess_char_1_02_a', row: 9, col: 7 }] });
  const lion = () => b.enemies.find((e) => e.alive && e.defId === 'enemy_9032_aclionk');
  for (let i = 0; i < 30 * 600 && !b.finished && !(lion() && lion().findBuff('boss:vest')); i++) b.step();
  const v = lion() && lion().findBuff('boss:vest');
  assert.ok(v, 'a vest was animated');
  assert.equal(v.data.side, -1);
});
