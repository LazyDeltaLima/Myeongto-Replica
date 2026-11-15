// 望 (band_yan2, 规程) switches 炎 to the default season's direction (bondeffect_yan): "<在场6名不同【炎】干员> 效果替换为
// 战斗开始时收集【炎】干员部分属性召唤“炎佑”; <在场9名不同【炎】干员> 效果改为召唤两只“炎佑”". 规程's copy of that effect keeps
// the 炎佑 counts and the 9-tier ATK / resistance on the `[spawn]` sub-key buff; the installer read the template's first
// buff only, so a 望 holder had two 炎佑 at the 3-tier (community report). Cause removed: bonds/shared.js templateBb reads
// a template's sub-key buffs with it (docs/rules/sim.md 「왕(望) — 염의 가호 수」).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { DataSource, getDefaultSource, hasGeneratedData } from '../../server/sim/simdata.js';
import { ACT3 } from '../helpers/seasonPieces.js';
import { templateNumbers } from '../../server/sim/content/bonds/dispatch.js';

const REAL = { skip: !hasGeneratedData() };

function run(n, bandId) {
  const ids = Array.from({ length: n }, (_, i) => `y${i}_a`);
  const chess = Object.fromEntries(ids.map((id) => [id, chessRec({ id, bonds: ['yanShip'], skill: null, stats: { atk: 1000, maxHp: 10000, def: 0, blockCnt: 1 } })]));
  const data = new DataSource({ ...ACT3, chess: { ...ACT3.chess, ...chess }, enemies: { ...ACT3.enemies, e_d: enemyRec({ key: 'e_d', hp: 1e9, speed: 0 }) } }, getDefaultSource());
  const h = makeBattle({ data, bandId, bonds: { yanShip: { count: n, active: true, tier: n >= 6 ? 2 : 1, layers: 10 } }, autoFinish: false, timeLimit: 300,
    enemies: [{ key: 'e_d' }], units: ids.map((id, i) => ({ chessId: id, row: i < 7 ? 10 : 9, col: 1 + (i % 7) })) });
  h.step(2);
  return { h, yanyou: h.b.allyUnits.filter((u) => u.mem && u.mem.bondYan) };
}

test('望: 炎佑 by 炎 count — 3: none, 6: one, 9: two with ATK ×1.5 and damage taken ×0.1', REAL, () => {
  const counts = [3, 6, 9].map((n) => run(n, 'band_yan2').yanyou.length);
  assert.deepEqual(counts, [0, 1, 2], 'the [spawn] counts power_bond_char_cnt 6 / ex_bond_char_cnt 9 (templateBb sub-keys, docs/rules/sim.md 「왕(望) — 염의 가호 수」)');
  const mods = (u) => u.buffs.find((b) => b.key === 'bond:yanyou')?.mods ?? null;
  assert.equal(mods(run(6, 'band_yan2').yanyou[0]), null, '6: no 9-tier multipliers');
  for (const y of run(9, 'band_yan2').yanyou) {
    const m = mods(y);
    assert.ok(m && m.atkMul === 1.5 && Math.abs(m.dmgTakenMul - 0.1) < 1e-9, `9: atk 1.5, damage_resistance 0.9 (${JSON.stringify(m)})`);
  }
});

test('望: the switched record carries the [spawn] numbers; without 望 规程\'s 炎 has no 炎佑', REAL, () => {
  const { h } = run(3, 'band_yan2');
  const bb = templateNumbers('yanShip', 'act1autochess_bond_eff_yan', h.b, 'p1');
  assert.equal(bb.power_bond_char_cnt, 6);
  assert.equal(bb.ex_bond_char_cnt, 9);
  assert.equal(bb.atk, 1.5);
  assert.equal(bb.damage_resistance, 0.9);
  assert.equal(bb.base_atk, 0.23, 'the template buff\'s own numbers stay');
  assert.equal(bb.key, 'act1autochess_bond_eff_yan', 'its own key, not the sub-key\'s');
  for (const n of [3, 6, 9]) assert.equal(run(n, null).yanyou.length, 0, `${n} 炎 without 望`);
});
