// 卫戍协议：规程's equipment pools (choices.json pools, tools/build-data.mjs buildChoices): every pool a 规程 特质 / bond /
// strategy pays from is defined for the season — the default season's pools that name items 规程 lacks are left out,
// and 规程's own (凯瑟琳 pool_equip_kathe_0 / pool_equip_rockr, 异客 pool_equip_pasngr) name no default-season item.
// The special hammers are the kinds 终极维式重锤 lists (hammer_1…5, 电流维式重锤 the fifth): 维多利亚's pool, 凯瑟琳's pools
// and the shop leave-out read that list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch } from '../match/harness.js';
import { registryFor } from '../../server/match/effectsMeta.js';
import { collectViolations } from '../../server/match/invariants.js';
import { isShopItem } from '../../server/sim/simdata.js';

const REG = registryFor(ACT3_ON_BASE_FIELD);
const SPECIAL = ['chess_item_4_05_e_a', 'chess_item_3_08_e_a', 'chess_item_3_09_e_a', 'chess_item_2_03_e_a', 'chess_item_5_07_e_a'];
const PLAIN = 'chess_item_1_01_e_a';
const ULTIMATE = 'chess_item_6_11_e_a';

function act3Match(t, seed = 5) {
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: REG, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  t.after(() => h.m.dispose());
  return h;
}
const roll = (m, pid, n) => {
  const seen = new Map();
  for (let i = 0; i < n; i++) { const id = m.rollPool(pid)?.id ?? null; seen.set(id, (seen.get(id) || 0) + 1); }
  return seen;
};

test('规程: every pool its 特质, bonds and strategies name is defined', () => {
  const defined = new Set(Object.keys(ACT3.choices.pools));
  const named = new Set();
  for (const f of ['garrisons', 'bonds', 'bands', 'effects']) for (const m of JSON.stringify(ACT3[f]).matchAll(/"(pool_[A-Za-z0-9_]+)"/g)) named.add(m[1]);
  assert.ok(named.has('pool_equip_kathe_0') && named.has('pool_equip_pasngr'));
  assert.deepEqual([...named].filter((id) => !defined.has(id)), []);
});

test('规程: the special hammers are 终极维式重锤\'s five; 维多利亚 draws them, the shop leaves them out (终极 stays sold)', (t) => {
  const { m } = act3Match(t);
  assert.deepEqual(ACT3.choices.pools.pool_equip_vict.items, SPECIAL);
  for (const id of SPECIAL) assert.equal(isShopItem(ACT3.items[id]), false, id);
  assert.equal(isShopItem(ACT3.items[ULTIMATE]), true);
  assert.equal(isShopItem(ACT3.items[PLAIN]), true);
  assert.deepEqual([...roll(m, 'pool_equip_vict', 300).keys()].sort(), [...SPECIAL].sort());
});

test('规程 凯瑟琳: 维式重锤 with a small chance of a special one; the elite a special one with a small chance of 终极', (t) => {
  const { m } = act3Match(t);
  assert.equal(ACT3.garrisons.garrison_139_a.bbStr.pool, 'pool_equip_kathe_0');
  assert.equal(ACT3.garrisons.garrison_139_b.bbStr.pool, 'pool_equip_rockr');
  const a = roll(m, 'pool_equip_kathe_0', 600);
  assert.deepEqual([...a.keys()].filter((id) => id !== PLAIN && !SPECIAL.includes(id)), []);
  assert.ok(a.get(PLAIN) > 450, `plain hammers ${a.get(PLAIN)} / 600`);
  const b = roll(m, 'pool_equip_rockr', 600);
  assert.deepEqual([...b.keys()].filter((id) => id !== ULTIMATE && !SPECIAL.includes(id)), []);
  assert.ok((b.get(ULTIMATE) || 0) > 20 && b.get(ULTIMATE) < 120, `终极 ${b.get(ULTIMATE)} / 600`);
});

test('规程 异客: 盟约之币 or 萨尔贡浓茶, rarely 拟态物质', (t) => {
  const { m } = act3Match(t);
  const seen = roll(m, 'pool_equip_pasngr', 600);
  assert.deepEqual([...seen.keys()].sort(), ['chess_item_1_03_e_a', 'chess_item_2_04_e_a', 'chess_item_5_03_e_a']);
  assert.ok(seen.get('chess_item_5_03_e_a') < 120);
});

test('规程 凯瑟琳 on the real path: gaining her puts a hammer in the 装备区', (t) => {
  const h = act3Match(t, 9);
  const { m } = h;
  const ps = h.ps('p_0');
  const bag = () => ps.temp.slice(0, 5).filter(Boolean).map((p) => p.id);
  const before = bag();
  ps.acquireChess('chess_char_3_22_a', {});
  const got = bag();
  assert.equal(got.length, before.length + 1, `装备区 ${got}`);
  const added = got.filter((id) => !before.includes(id) || got.filter((x) => x === id).length > before.filter((x) => x === id).length);
  assert.ok(added.length && [PLAIN, ...SPECIAL].includes(added[0]), `added ${added}`);
  assert.deepEqual(collectViolations(m), []);
});
