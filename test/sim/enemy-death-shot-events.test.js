// test/sim/enemy-death-shot-events.test.js — the death shots name their enemy and its official ability for the render
// (2026-10-31, docs/rules/fx.md 「적 장판 — 污染秽蚀」): 高能源石虫 / 冰爆源石虫 / 卷心籽 (ignited) fx 'explode' { kind
// 'deathBoom', id, ability 'boom' } (content/enemies/archetypes.js deathBoom); 假想敌：蚀裂's 毒雾 flies as fx 'enemyShot'
// { key projectile_enemy_actoxi, zone 1 } to its killer and lands as fx 'zone' { kind 'poison', id, ability '1' }, still
// sourceless (content/enemies/dot.js). 刺胄之弹's zone: test/sim/boss-patterns-real.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const JF = 'chess_char_1_02_a';   // 角峰
const fxOf = (h, kind) => h.eventsOf('fx').filter((e) => e[1] === kind);

test('高能源石虫 / 冰爆源石虫 / 卷心籽: the death blast names its talent boom', REAL, () => {
  for (const key of ['enemy_1021_bslime', 'enemy_1067_snslime', 'enemy_10065_ftzlc']) {
    const h = makeBattle({
      seed: 3, timeLimit: 30, autoFinish: false,
      units: [{ chessId: JF, row: 9, col: 6, dir: 'RIGHT' }],
      enemies: [{ key, pos: [9, 7], time: 1, mods: { hpMul: 1e3, speedMul: 0, atkMul: 0.01 } }],
    });
    h.step(1);
    h.run(1.2);
    const e = h.b.enemies.find((x) => x.defId === key);
    if (key === 'enemy_10065_ftzlc') e.mem.ab.ignited = true;   // 灼藤's ignition (content/enemies/element.js)
    h.b.kill(e, h.unit(JF));
    h.run(0.1);
    const ex = fxOf(h, 'explode').filter((x) => x[4]?.kind === 'deathBoom');
    assert.equal(ex.length, 1, key);
    assert.equal(ex[0][4].id, e.id, key);
    assert.equal(ex[0][4].ability, 'boom', key);
    assert.equal(ex[0][4].caster, undefined, key);
  }
});

test('假想敌：蚀裂: the 毒雾 flies as its talent projectile to the killer and its zone names talent 1, still sourceless', REAL, () => {
  const h = makeBattle({
    seed: 3, timeLimit: 30, autoFinish: false,
    units: [{ chessId: JF, row: 9, col: 4, dir: 'RIGHT' }],
    enemies: [{ key: 'enemy_9006_actoxi', pos: [9, 7], time: 1, mods: { hpMul: 1e3, speedMul: 0, atkMul: 0.01 } }],
  });
  h.step(1);
  h.run(1.2);
  const e = h.b.enemies.find((x) => x.defId === 'enemy_9006_actoxi'), jf = h.unit(JF);
  let src = 'none';
  h.b.on('damaged', (c) => { if ((c.dmg.tags || []).includes('poison') && c.target === jf && src === 'none') src = c.source ?? null; }, { priority: 1000 });
  h.b.kill(e, jf);
  h.run(0.05);
  const shot = fxOf(h, 'enemyShot');
  assert.equal(shot.length, 1);
  assert.equal(shot[0][4].id, e.id);
  assert.equal(shot[0][4].tgt, jf.id);
  assert.equal(shot[0][4].key, 'projectile_enemy_actoxi');
  assert.equal(shot[0][4].zone, 1);
  assert.equal(fxOf(h, 'zone').length, 0, 'not landed yet');
  h.run(shot[0][4].t + 0.1);
  const z = fxOf(h, 'zone');
  assert.equal(z.length, 1);
  assert.equal(z[0][4].kind, 'poison');
  assert.equal(z[0][4].id, e.id);
  assert.equal(z[0][4].ability, '1');
  assert.ok(Math.hypot(z[0][2] - jf.x, z[0][3] - jf.y) < 0.05, 'on the killer');
  h.run(1.5);
  assert.equal(src, null, 'the cloud ticks with no source');
});
