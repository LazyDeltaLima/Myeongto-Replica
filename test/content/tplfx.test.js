// test/content/tplfx.test.js — the 卫戍协议 bond / equipment / band template effects as sim status events
// ['tplfx', targetId | null, effectKey, sourceId | null] (docs/SIM.md events): one per client buff template node
// `CreateEffect` / `CreateEffectAtScreenPos`, at the moment the node runs. Display only — the fights are the ones of
// items / bands / bonds tests; here only the events are checked (synthetic units, then the real match path).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const A = (k) => `chess_item_${k}_e_a`;
const REINFORCE = 'map_act1autochess_reinforce_02';

function op(id, o = {}) {
  return chessRec({
    id, profession: o.profession ?? 'WARRIOR', bonds: o.bonds ?? [], tier: o.tier ?? 1,
    rangeGrid: o.range ?? [[0, 0], [0, 1]],
    stats: { maxHp: 2000, atk: 500, def: 200, res: 0, aspd: 100, bat: 1, respawnTime: 20, spRecovery: 1, blockCnt: 2, ...(o.stats || {}) },
    skill: { spCost: 60, duration: 5, initSp: 0, ...(o.skill || {}) },
  });
}
const DUMMY = enemyRec({ key: 'e_d', hp: 1e8, speed: 0, def: 0, res: 0 });
function fight({ ops = { t_op: op('t_op') }, units, foes = [], band, bonds, kits } = {}) {
  return makeBattle({
    defs: { chess: ops, enemies: { e_d: DUMMY } }, units, bonds, kits, bandId: band,
    enemies: foes.map(([r, c]) => ({ key: 'e_d', pos: [r, c] })), timeLimit: 999, autoFinish: false,
  });
}
const tpl = (h, key) => h.eventsOf('tplfx').filter((e) => key == null || e[2] === key);
const foe = (h) => h.b.enemies.find((e) => e.alive);
const kill = (h, u) => h.b.dealDamage(foe(h), u, { amount: 1e7, type: 'true' });
function forceRng(h, v) { const orig = h.b.rng; h.b.rng = Object.assign(() => v, orig); }
const bondOn = (count, layers = 0, thresholds = [3, 6, 9]) => ({ count, active: count >= thresholds[0], tier: thresholds.filter((t) => count >= t).length, layers });

test('歌利亚头盔 (equipment): map_act1autochess_reinforce_02 at a deployment with nobody in front — none when the front tile is taken (acarm049 ON_BUFF_START fail branch)', () => {
  const ops = { t_op: op('t_op'), t_f: op('t_f') };
  const free = fight({ ops, units: [{ chessId: 't_op', row: 10, col: 4, items: [A('3_06')] }] });
  free.step(1);
  const u = free.unit('t_op');
  assert.deepEqual(tpl(free), [['tplfx', u.id, REINFORCE, u.id]]);
  const blocked = fight({ ops, units: [{ chessId: 't_op', row: 10, col: 4, items: [A('3_06')] }, { chessId: 't_f', row: 10, col: 5 }] });
  blocked.step(1);
  assert.deepEqual(tpl(blocked), []);
});

test('拉特兰桥夹 (equipment): bond_laterano_reload_01 only when the refill happens (acarm057 ON_AFTER_ATTACK, after AmmoSkillCountModifier)', () => {
  const kits = { t_op: () => ({ skill: { kind: 'ammo', ammo: 10, duration: 0, initSp: 60 } }) };
  for (const [v, n] of [[0, 1], [0.99, 0]]) {
    const h = fight({ kits, units: [{ chessId: 't_op', row: 10, col: 4, items: [A('4_08')] }], foes: [[10, 5]] });
    forceRng(h, v);
    const u = h.unit('t_op');
    h.runUntil(() => u.skill.activations >= 1 && !u.skill.active, 60);
    assert.deepEqual(tpl(h), Array.from({ length: n }, () => ['tplfx', u.id, 'bond_laterano_reload_01', u.id]), `rng ${v}`);
  }
});

test('M3茧甲 (equipment) / 埃芒加德 (strategy): map_act1autochess_reinforce_02 on each revive (acarm068 / band28 ON_OWNER_FINISH)', () => {
  const ops = { t_op: op('t_op'), t_b: op('t_b') };
  const h = fight({ band: 'band_ermengard', ops, units: [{ chessId: 't_op', row: 10, col: 4, items: [A('4_12')] }, { chessId: 't_b', row: 11, col: 4 }], foes: [[10, 9]] });
  h.step(1);
  const [a, b] = [h.unit('t_op'), h.unit('t_b')];
  kill(h, a); // M3茧甲
  kill(h, b); kill(h, b); kill(h, a); // band 1–3
  kill(h, a); // none left
  assert.deepEqual(tpl(h).map((e) => e[1]), [a.id, b.id, b.id, a.id]);
  assert.ok(tpl(h).every((e) => e[2] === REINFORCE && e[1] === e[3]));
});

test('蒸汽之心 (equipment): map_act1autochess_reinforce_02 at every deployment of a 维多利亚 carrier only (acarm079 ON_BUFF_START)', () => {
  const h = fight({ ops: { t_op: op('t_op', { bonds: ['victoriaShip'] }) }, units: [{ chessId: 't_op', row: 10, col: 4, items: [A('6_05')] }], foes: [[10, 9]] });
  h.step(1);
  const u = h.unit('t_op');
  assert.equal(tpl(h, REINFORCE).length, 1, 'initial deployment');
  h.b.retreat(u);
  u.respawnAt = 0;
  h.b.redeploy(u);
  assert.deepEqual(tpl(h, REINFORCE), [['tplfx', u.id, REINFORCE, u.id], ['tplfx', u.id, REINFORCE, u.id]], 'and the redeployment');
  const n = fight({ ops: { t_op: op('t_op', { bonds: ['yanShip'] }) }, units: [{ chessId: 't_op', row: 10, col: 4, items: [A('6_05')] }] });
  n.step(1);
  assert.deepEqual(tpl(n), [], 'not 维多利亚');
});

test('黄沙罗盘 (equipment): bond_charge_battle_01 with the first skill end SP of a 萨尔贡 carrier (acarm103 ON_SKILL_FINISH)', () => {
  const h = fight({ ops: { t_op: op('t_op', { bonds: ['sargonShip'] }) }, units: [{ chessId: 't_op', row: 10, col: 4, items: [A('6_07')] }] });
  h.step(1);
  const u = h.unit('t_op');
  for (let i = 0; i < 2; i++) { u.skill.activate('test', { free: true }); u.skill.end('test'); }
  assert.deepEqual(tpl(h), [['tplfx', u.id, 'bond_charge_battle_01', u.id]]);
});

test('迅捷 (bond): bond_charge_battle_01 for each SP line of the roll — two on a member at ≥ 40 layers, one on a non-member (bond_eff_swift ON_SKILL_FINISH)', () => {
  const sk = { spCost: 30, initSp: 30, trigger: { rule: 'SP_FULL' } };
  const ops = { s_m: chessRec({ id: 's_m', bonds: ['swiftShip'], skill: sk }), s_x: chessRec({ id: 's_x', bonds: [], skill: sk }) };
  const kits = { s_m: () => ({ skill: { kind: 'instant', trigger: 'SP_FULL' } }), s_x: () => ({ skill: { kind: 'instant', trigger: 'SP_FULL' } }) };
  const h = makeBattle({ defs: { chess: ops }, kits, bonds: { swiftShip: { count: 2, active: true, tier: 1, layers: 1000 } }, units: [{ chessId: 's_m', row: 10, col: 3 }, { chessId: 's_x', row: 12, col: 3 }] });
  h.run(0.5); // two 0.2 s automatic-operation passes: one MANUAL cast per pass (AutoChessBattleTrigger)
  const per = (id) => tpl(h, 'bond_charge_battle_01').filter((e) => e[1] === h.unit(id).id).length;
  const ends = (id) => h.hooksOf('skillEnd').filter((c) => c.unit === h.unit(id)).length;
  assert.ok(ends('s_m') >= 1 && ends('s_x') >= 1);
  assert.equal(per('s_m'), 2 * ends('s_m'), 'member: normal_sp + power_sp lines');
  assert.equal(per('s_x'), ends('s_x'), 'non-member: the power_sp line');
  assert.ok(tpl(h).every((e) => e[3] === null), 'the buff\'s source is no unit');
});

test('阿戈尔 (bond): bond_aegir_eat_01 on each devour mark as it resolves ([eat_mark] ON_BUFF_LATE_ENABLE); 5: map_act1autochess_reinforce_02 on a free respawn', () => {
  const ops = {
    g1: op('g1', { bonds: ['egirShip'] }), g2: op('g2', { bonds: ['egirShip'] }), g3: op('g3', { bonds: ['egirShip'] }),
    g4: op('g4', { bonds: ['egirShip'] }), g5: op('g5', { bonds: ['egirShip'] }),
    fod: op('fod', { tier: 2, stats: { maxHp: 50000 } }),
  };
  // g1 eats fod (10,4); the others face empty tiles
  const units = [{ chessId: 'g1', row: 10, col: 3 }, { chessId: 'fod', row: 10, col: 4 }, { chessId: 'g2', row: 11, col: 3 }, { chessId: 'g3', row: 12, col: 3 }, { chessId: 'g4', row: 9, col: 3 }, { chessId: 'g5', row: 9, col: 6 }];
  const h = fight({ ops, units, bonds: { egirShip: bondOn(5, 0, [3, 5]) }, foes: [[12, 9]] });
  h.step(1);
  const f = h.unit('fod');
  assert.deepEqual(tpl(h), [['tplfx', f.id, 'bond_aegir_eat_01', f.id]]);
  const g2 = h.unit('g2');
  kill(h, g2);
  assert.ok(g2.alive, 'the 5-tier free respawn');
  assert.deepEqual(tpl(h, REINFORCE), [['tplfx', g2.id, REINFORCE, g2.id]]);
});

test('叙拉古 6 (bond): common_071_bond_siracusa_hit_01 on the target of each proc, from the member ([ex][buff] ON_OUTPUT_DAMAGE)', () => {
  const ops = {};
  for (let i = 0; i < 6; i++) ops[`r${i}`] = op(`r${i}`, { bonds: ['siracusaShip'] });
  const units = Object.keys(ops).map((id, i) => ({ chessId: id, row: 9 + Math.floor(i / 3), col: 3 + 2 * (i % 3) }));
  const h = makeBattle({
    defs: { chess: ops, enemies: { e_d: DUMMY } }, units, bonds: { siracusaShip: bondOn(6, 20, [3, 6]) },
    enemies: [{ key: 'e_d', pos: [12, 9] }], timeLimit: 999, autoFinish: false, hooks: ['damaged'], captureNoisy: true,
  });
  h.step(1);
  const a = h.unit('r0'), e = foe(h);
  for (let i = 0; i < 750; i++) h.b.dealDamage(a, e, { amount: 1, type: 'phys', isAttack: true });
  const procs = h.hooksOf('damaged').filter((c) => c.dmg?.tags?.includes('bond:siracusa')).length;
  assert.ok(procs >= 1);
  assert.deepEqual(tpl(h), Array.from({ length: procs }, () => ['tplfx', e.id, 'common_071_bond_siracusa_hit_01', a.id]));
});

test('谢拉格 6 (bond): map_snow_left_2_right on the screen (no target) at each gust ([storm] ON_BUFF_TRIGGER CreateEffectAtScreenPos)', () => {
  const ops = {};
  for (let i = 0; i < 6; i++) ops[`k${i}`] = op(`k${i}`, { bonds: ['kjeragShip'] });
  const units = Object.keys(ops).map((id, i) => ({ chessId: id, row: 9 + Math.floor(i / 3), col: 3 + 2 * (i % 3) }));
  const h = fight({ ops, units, bonds: { kjeragShip: bondOn(6, 0, [3, 6]) }, foes: [[12, 9]] });
  h.run(24.8);
  assert.deepEqual(tpl(h), []);
  h.run(0.4);
  assert.deepEqual(tpl(h), [['tplfx', null, 'map_snow_left_2_right', null]], 'first gust at 25 s');
  h.run(25);
  assert.equal(tpl(h).length, 2);
});

test('the events change nothing: the same battle with and without recorded events ends alike', () => {
  const run = (recordEvents) => {
    const h = makeBattle({
      defs: { chess: { t_op: op('t_op', { bonds: ['victoriaShip'] }), t_b: op('t_b') }, enemies: { e_d: enemyRec({ key: 'e_d', hp: 30000, speed: 0, atk: 800 }) } },
      units: [{ chessId: 't_op', row: 10, col: 4, items: [A('6_05'), A('4_12'), A('3_06')] }, { chessId: 't_b', row: 11, col: 4 }],
      enemies: [{ key: 'e_d', pos: [10, 5] }], bandId: 'band_ermengard', timeLimit: 60, recordEvents,
    });
    h.b.runToEnd?.(60);
    return [h.b.time, h.b.reason, h.b.allyUnits.map((u) => [u.alive, Math.round(u.hp)]), h.b.enemies.map((e) => Math.round(e.hp))];
  };
  assert.deepEqual(run(true), run(false));
});

// ---------------------------------------------------------------------------------------------------------------------
// the real match path (spec → createBattleFromSpec)

const REAL = { skip: !hasGeneratedData() && 'no generated data' };

test('real match path: 歌利亚头盔 + 埃芒加德 — tplfx at the deployment and at the revive', REAL, async () => {
  const { makeMatch, DATA, giveItem } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 5 }).start();
  h.toPrep(3);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const id = 'chess_char_1_01_a';
  assert.ok(DATA.chess[id], id);
  const p = ps.acquireChess(id, { source: 'buy' });
  assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: 10, col: 3 }, dir: 'RIGHT' }).ok);
  const helm = giveItem(m, ps, A('3_06'));
  assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: helm.uid, targetUid: p.uid }), { ok: true });
  ps.bandId = 'band_ermengard';
  ps.recompute();
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'tpl', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  const ev = [];
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) { b.step(); ev.push(...b.drainEvents()); }
  const u = b.allyUnits.find((x) => x.kind === 'op');
  assert.ok(u && u.alive, 'deployed');
  const tp = () => ev.filter((e) => e[0] === 'tplfx');
  assert.deepEqual(tp(), [['tplfx', u.id, REINFORCE, u.id]], 'the helmet at the deployment (nobody in front)');
  b.kill(u);
  ev.push(...b.drainEvents());
  assert.ok(u.alive, '埃芒加德 revive');
  assert.equal(tp().length, 3, 'the revive, then the helmet again at the free redeployment');
  m.dispose?.();
});
