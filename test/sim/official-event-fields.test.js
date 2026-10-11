// The sim's event fields for the official effect / sound bindings and the enemies' official projectiles (docs/rules/
// sim.md 「공식 바인딩용 이벤트 필드」·「적 투사체」, docs/SIM.md events; maintainer decision (2026-10-10) 「동작 변경 모두
// 공식이랑 동일하게」):
//  - 'dmg' [5] = the attacker's unit id — kit skill damage (battle.dealDamage from content) included; null for 无来源;
//  - an enemy's normal attack flies its official projectile (data/enemies.json `proj`: speed, PARACURVE = horizontal
//    speed), none = the hit at the strike ('atk' kind 'none');
//  - an enemy skill's cast: fx 'enemySkill' { id, ability, n } and `ability` / `caster` on the fx the cast makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { enemyShot, shotSpeed } from '../../server/sim/ai.js';
import { normalizeEnemy } from '../../server/sim/simdata.js';
import { getData } from '../../server/data.js';
import { TICK } from '../../server/sim/constants.js';

const E = JSON.parse(fs.readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
const X = JSON.parse(fs.readFileSync(new URL('../../tools/assets/local-enemy-projectiles.json', import.meta.url), 'utf8'));

const WALL = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const NOATK = () => ({ trait: { noAttack: true } });
function arena(o = {}) {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { t_wall: WALL('t_wall') } }, kits: { t_wall: NOATK }, enemies: [], hooks: ['attack', 'damaged'], captureNoisy: true, ...o,
  });
}
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 } });

test('data: every enemy with a range has its official normal-attack projectile (or proj null), from the committed extract', () => {
  assert.ok(Object.keys(X.projectiles).length > 50 && Object.keys(X.enemies).length > 200, 'tools/assets/local-enemy-projectiles.json');
  for (const [k, e] of Object.entries(E)) {
    if (!(e.stats.rangeRadius > 0)) continue;
    assert.ok('proj' in e, `${k}: proj written`);
    if (e.proj) {
      assert.equal(typeof e.proj.key, 'string');
      assert.ok(['TRACE_TARGET_WITH_SPEED', 'PARACURVE', 'HARPOON', 'FIXED_DIRECTION', 'ATTACH', 'NONE'].includes(e.proj.move), `${k}: ${e.proj.move}`);
    }
  }
  // values read from the client (tools/local-extract/enemy_projectiles.py)
  assert.deepEqual([E.enemy_1019_jshoot.proj.key, E.enemy_1019_jshoot.proj.move, E.enemy_1019_jshoot.proj.speed], ['projectile_crossbow_big', 'TRACE_TARGET_WITH_SPEED', 10]);
  assert.deepEqual([E.enemy_1050_lslime.proj.move, E.enemy_1050_lslime.proj.speed], ['PARACURVE', 6]);
  assert.deepEqual([E.enemy_1272_nhtank.proj.move, E.enemy_1272_nhtank.proj.speed], ['PARACURVE', 4]);
  assert.deepEqual([E.enemy_1041_lazerd.proj.speed, E.enemy_1427_lrnazg.proj.speed], [15, 18]);
  assert.deepEqual([E.enemy_1112_emppnt.proj.move, E.enemy_1112_emppnt.proj.delay], ['ATTACH', 3], '帝国炮火先兆者: the shell lands 3 s later');
  assert.equal(E.enemy_1005_yokai_2.proj, null, '御4 MKII: no projectile');
  assert.equal(E.enemy_9013_acstmk.proj.mount, 'SPECIAL_0');
  assert.equal(E.enemy_1172_dugago.projModes.Fly.key, 'projectile_enemy_dugago');
  assert.equal(E.enemy_2003_rockman.skills.find((s) => s.prefabKey === 'StunAttack').proj.speed, 10);
  assert.equal(E.enemy_1404_msnip.skills.find((s) => s.prefabKey === 'CrossAttack').proj.move, 'FIXED_DIRECTION');
  assert.equal(E.enemy_9006_actoxi.talentProj['1'].move, 'PARACURVE');
});

test('real data path: the server data source hands the sim each enemy shot (simdata normalizeEnemy → ai.js enemyShot)', () => {
  const D = getData({ log: { warn() {}, error() {}, info() {} } });
  const rec = (D.enemies?.enemies ?? D.enemies)?.enemy_1050_lslime ?? E.enemy_1050_lslime;
  const def = normalizeEnemy('enemy_1050_lslime', rec);
  assert.deepEqual(def.proj, { key: 'projectile_lslime', move: 'PARACURVE', speed: 6, delay: 0 });
  assert.equal(shotSpeed(enemyShot({ def })), 6);
  assert.equal(shotSpeed(enemyShot({ def: normalizeEnemy('enemy_1005_yokai_2', E.enemy_1005_yokai_2) })), 0, 'no projectile: no flight');
  assert.equal(shotSpeed(enemyShot({ def: normalizeEnemy('x', { stats: { rangeRadius: 2 } }) })), 10, 'unknown: the old PROJECTILE_SPEEDS.enemy');
  const dug = normalizeEnemy('enemy_1172_dugago', E.enemy_1172_dugago);
  assert.equal(enemyShot({ def: dug, form: null }), null, 'Walk mode: no projectile');
  assert.equal(enemyShot({ def: dug, form: 'fly' }).key, 'projectile_enemy_dugago', 'Fly mode (setForm "fly")');
});

for (const [key, d] of [['enemy_1050_lslime', 3], ['enemy_1019_jshoot', 2]]) {
  test(`${key}: its shot lands ${d} tiles / the official speed after the strike`, () => {
    const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 3 }] });
    h.step();
    const e = put(h, key, [9, 3 + d]);
    assert.ok(h.runUntil(() => h.hooksOf('damaged').some((c) => c.source === e || c.source?.id === e.id), 20), 'hit');
    const at = h.hooksOf('attack').find((c) => c.attacker?.id === e.id).t;
    const hit = h.hooksOf('damaged').find((c) => c.source?.id === e.id).t;
    const flight = d / E[key].proj.speed;
    assert.ok(Math.abs(hit - at - flight) <= 2 * TICK, `flight ${(hit - at).toFixed(3)} s ≈ ${flight.toFixed(3)} s`);
    const atk = h.eventsOf('atk').find((x) => x[1] === e.id);
    assert.equal(atk[3], 'enemy');
  });
}

test('enemy_1005_yokai_2: a ranged attack with no official projectile hits at the strike, drawn without one', () => {
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 3 }] });
  h.step();
  const e = put(h, 'enemy_1005_yokai_2', [9, 5]);
  assert.ok(h.runUntil(() => h.hooksOf('damaged').some((c) => c.source?.id === e.id), 20), 'hit');
  const at = h.hooksOf('attack').find((c) => c.attacker?.id === e.id).t;
  assert.ok(Math.abs(h.hooksOf('damaged').find((c) => c.source?.id === e.id).t - at) < 1e-9, 'same tick');
  assert.equal(h.eventsOf('atk').find((x) => x[1] === e.id)[3], 'none');
  assert.equal(h.hooksOf('damaged').find((c) => c.source?.id === e.id).dmg.isProjectile, false, 'not 远程途径');
});

test("'dmg' [5]: the attacker — a normal attack, a kit's direct dealDamage; null for 无来源 damage", () => {
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 3 }] });
  h.step();
  const w = h.unit('t_wall');
  const e = put(h, 'enemy_1019_jshoot', [9, 5]);
  assert.ok(h.runUntil(() => h.eventsOf('dmg').some((x) => x[1] === w.id), 20));
  const ev0 = h.eventsOf('dmg').find((x) => x[1] === w.id);
  assert.equal(ev0.length, 7);
  assert.equal(ev0[5], e.id, 'the enemy that shot');
  assert.equal(ev0[6], 0, 'an attack is no DoT tick');
  h.events.length = 0;
  h.b.dealDamage(w, e, { amount: 100, type: 'true', isSkill: true });   // what a kit's skill damage does
  const d = h.eventsOf('dmg').find((x) => x[1] === e.id);
  assert.equal(d[5], w.id, 'kit damage names its operator');
  h.events.length = 0;
  h.b.dealDamage(w, e, { amount: 100, type: 'true', sourceless: true });
  assert.equal(h.eventsOf('dmg').find((x) => x[1] === e.id)[5], null, '无来源: none');
  h.events.length = 0;
  h.b.dealDamage(w, e, { amount: 100, type: 'arts', tags: ['dot'] });   // a DoT tick credited to its applier
  const t = h.eventsOf('dmg').find((x) => x[1] === e.id);
  assert.equal(t[5], w.id);
  assert.equal(t[6], 1, "the 7th field: a DoT tick (tags 'dot')");
  h.events.length = 0;
  h.b.dealDamage(w, e, { amount: 50, type: 'element', element: 'burn' });
  const g = h.eventsOf('dmg').find((x) => x[1] === e.id && x[3] === 'burn');
  assert.deepEqual([g.length, g[4], g[5], g[6]], [7, 0, w.id, 0], 'an element fill: [4] 0, [5] the attacker, [6] no DoT');
});

test("an enemy skill's cast: fx 'enemySkill' { id, ability, n } and `ability` / `caster` on the fx it makes", () => {
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 3 }] });
  h.step();
  const e = put(h, 'enemy_1525_blkswb', [9, 4]);
  const ca = E.enemy_1525_blkswb.skills.find((s) => s.prefabKey === 'CircleAttack');
  assert.ok(h.runUntil(() => h.eventsOf('fx').some((x) => x[1] === 'enemySkill' && x[4].id === e.id), ca.initCooldown + 5), 'cast');
  const fx = h.eventsOf('fx');
  const i = fx.findIndex((x) => x[1] === 'enemySkill' && x[4].id === e.id);
  const m = fx[i][4];
  assert.equal(m.n, 1);
  assert.ok(E.enemy_1525_blkswb.skills.some((s) => s.prefabKey === m.ability), `a data skill name: ${m.ability}`);
  const made = fx.slice(i + 1).filter((x) => x[4] && x[4].caster === e.id);
  assert.ok(made.length > 0 && made.every((x) => x[4].ability === m.ability), 'the cast fx carry the ability');
  // outside a cast nothing is tagged
  h.b.fx('explode', { x: 1, y: 1 });
  assert.equal(h.eventsOf('fx').at(-1)[4].ability, undefined);
});

test("content skill shots (enemies/helpers.js shoot): land distance / the official speed later, fx 'enemyShot' names the projectile", async () => {
  const { shoot } = await import('../../server/sim/content/enemies/helpers.js');
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 3 }] });
  h.step();
  const w = h.unit('t_wall');
  const e = put(h, 'enemy_1007_slime', [9, 7]);
  const shot = { key: 'projectile_test', move: 'PARACURVE', speed: 5, delay: 0 };
  let at = null;
  const t0 = h.b.time;
  const flight = shoot(h.b, e, w, shot, (t) => { at = h.b.time; assert.equal(t, w); });
  assert.ok(Math.abs(flight - 0.8) < 1e-9, '4 tiles at 5/s');
  const fx = h.eventsOf('fx').find((x) => x[1] === 'enemyShot');
  assert.deepEqual([fx[4].id, fx[4].tgt, fx[4].key, fx[4].move, fx[4].speed, fx[4].t], [e.id, w.id, 'projectile_test', 'PARACURVE', 5, 0.8]);
  h.run(1);
  assert.ok(at != null && Math.abs(at - t0 - 0.8) <= 2 * TICK, `landed after ${at - t0}`);
  let now = null;
  shoot(h.b, e, w, { key: 'p', move: 'ATTACH', speed: 0, delay: 0 }, () => { now = h.b.time; });
  assert.equal(now, h.b.time, 'ATTACH: no flight');
});

test('converted enemy skills carry their official projectile in data (FireWeapon, TripleAttack, ChainBuff, ironsandstorm, 1)', () => {
  const sk = (k, p) => E[k].skills.find((s) => s.prefabKey === p).proj;
  assert.deepEqual([sk('enemy_9009_acfort', 'FireWeapon').key, sk('enemy_9009_acfort', 'FireWeapon').speed], ['projectile_enemy_acfort_skill', 10]);
  assert.equal(sk('enemy_1513_dekght_2', 'TripleAttack').key, 'projectile_enemy_dekght_s');
  assert.equal(sk('enemy_2050_smsha', 'ChainBuff').speed, 15);
  assert.equal(sk('enemy_1516_jakill', 'ironsandstorm').key, 'projectile_enemy_jakill_s1');
  assert.deepEqual([sk('enemy_9019_actrpb', '1').speed, sk('enemy_9020_actrpc', '1').speed], [15, 10]);
  assert.deepEqual([sk('enemy_9021_acduml', '1').key, sk('enemy_9022_acdumm', '1').key], ['projectile_enemy_acduml', 'projectile_enemy_acdumm']);
});
