// Season content coverage (server/sim/content/coverage.js, tools/season-coverage.mjs): the default season's bond
// templates, item buff keys and 特质 effect keys are all acted on, and the report finds what a season's data adds that
// the code does not know — a template moved to another bond, a buff key no handler reads, a handler that runs on a
// record without its buff, an option value a 特质 handler does not read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getData } from '../../server/data.js';
import { registryFor, GARRISON_HOOK } from '../../server/match/effectsMeta.js';
import { BUILTIN_ITEM_BUFF_KEYS } from '../../server/match/builtinMeta.js';
import { coverage, bondTemplate, BOND_TEMPLATES } from '../../server/sim/content/coverage.js';
import { coverageOf } from '../../tools/season-coverage.mjs';

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), '../../server/sim/content');
const QUIET = { info() {}, warn() {}, error() {} };
const BASE = getData({ log: QUIET });

const notOk = (rows) => rows.filter((r) => r.status !== 'ok' || r.wrong.length).map((r) => `${r.status} ${r.side} ${r.id} ${r.key} ${[...r.missing, ...r.wrong].join('; ')}`);
const reportOf = (data) => coverage(data, { registry: registryFor(data), builtinItemBuffKeys: BUILTIN_ITEM_BUFF_KEYS, garrisonHooks: GARRISON_HOOK });

test('the default season: every bond template, item buff key and 特质 effect key is acted on (none, partial and wrong 0)', () => {
  const rep = coverageOf();
  for (const d of ['bonds', 'items', 'garrisons']) {
    assert.ok(rep[d].length > 20, `${d}: ${rep[d].length} rows`);
    assert.deepEqual(notOk(rep[d]), [], d);
  }
});

test('the bond template table names templates its files hold', () => {
  for (const [t, decl] of Object.entries(BOND_TEMPLATES)) {
    const src = readFileSync(join(CONTENT, decl.where), 'utf8');
    assert.ok(src.includes(decl.src ?? t), `${t}: '${decl.src ?? t}' in ${decl.where}`);
    assert.ok((decl.bonds === null || decl.bonds.length) && ['battle', 'prep'].includes(decl.side), t);
  }
});

test('the bond dispatcher runs every battle template with an installer once, in ORDER', async () => {
  const { ORDER } = await import('../../server/sim/content/bonds/dispatch.js');
  const listed = ORDER.filter(Array.isArray).flat();
  assert.equal(new Set(listed).size, listed.length, 'no template twice');
  const files = Object.entries(BOND_TEMPLATES).filter(([, d]) => d.side === 'battle' && !d.where.startsWith('bonds/addon/'));
  for (const [t, d] of files) {
    const src = readFileSync(join(CONTENT, d.where), 'utf8');
    const readBy = new RegExp(`${t}: \\{[^}]*readBy: '([^']+)'`).exec(src);
    if (readBy) assert.ok(listed.includes(readBy[1]), `${t} is read by ${readBy[1]}, which ORDER runs`);
    else assert.ok(listed.includes(t), `${t} (${d.where}) is in ORDER`);
  }
  for (const t of listed) assert.equal(BOND_TEMPLATES[t]?.side, 'battle', `${t}: a battle template of a bond file`);
});

test('a bond buff template is its bbStr.key, else its key, without its sub-keys', () => {
  assert.equal(bondTemplate({ key: 'env_gbuff_new', bbStr: { key: 'act3autochess_bond_eff_iberia[enemy]' } }), 'act3autochess_bond_eff_iberia');
  assert.equal(bondTemplate({ key: 'env_gbuff_new', bbStr: { key: 'act3autochess_bond_eff_sargon_power[tile_listener]' } }), 'act3autochess_bond_eff_sargon_power');
  assert.equal(bondTemplate({ key: 'bond_layer_gain_coin', bb: { layer: 1 } }), 'bond_layer_gain_coin');
});

test('another season\'s data: new templates, buff keys and option values show up as not acted on', () => {
  const b = BASE.bonds, it = BASE.items, g = BASE.garrisons;
  const retag = (rec, from, to) => ({ ...rec, buffs: rec.buffs.map((x) => (x.bbStr?.key === from ? { ...x, bbStr: { ...x.bbStr, key: to } } : x.key === from ? { ...x, key: to } : x)) });
  // 精准 gets a template of its own, 远见 a prep buff nobody reads
  const bonds = {
    ...b,
    preciShip: retag(b.preciShip, 'act1autochess_bond_eff_preci', 'act9autochess_bond_eff_preci'),
    visiShip: { ...b.visiShip, buffs: [...b.visiShip.buffs, { key: 'bond_new_prep_rule', bb: { discount: 1 } }] },
  };
  // 紧急调度券 renames its prep buff with the same meaning (items/aliases.js), 寻呼模块 gets a prep buff nobody reads and
  // 天马之枪 (a battle behaviour of its buff key) a battle buff nobody reads — the ids stay
  const items = { ...it };
  for (const id of ['chess_item_2_02_e_a', 'chess_item_2_02_e_b']) items[id] = retag(it[id], 'use_equip_reward_random_char_chess_in_shop', 'use_equip_take_shop');
  for (const id of ['chess_item_4_01_e_a', 'chess_item_4_01_e_b'].filter((x) => it[x])) items[id] = retag(it[id], 'use_equip_reward_special_goods_char_chess', 'use_equip_act9_new_rule');
  for (const id of ['chess_item_6_01_e_a', 'chess_item_6_01_e_b'].filter((x) => it[x])) items[id] = retag(it[id], 'act2autochess_equip_acarm117_global_buff', 'act9autochess_equip_acarm999_global_buff');
  // a layer-event 特质 with a bond_type its handler does not read, and an effect key nobody handles
  const layer = Object.values(g).find((x) => x.eventType === 'IN_BATTLE' && x.bbStr?.bond_type === 'bond_by_id');
  const garrisons = {
    ...g,
    [layer.garrisonId]: { ...layer, bbStr: { ...layer.bbStr, bond_type: 'bond_act9_new' } },
    garrison_new_a: { ...layer, garrisonId: 'garrison_new_a', effectKey: 'act9autochess_gar_event_new' },
    garrison_new_b: { ...layer, garrisonId: 'garrison_new_b', eventType: 'SERVER_NEW_EVENT', effectKey: 'SERVER_ADD_BOND_METHOD' },
  };
  const rep = reportOf(Object.freeze({ ...BASE, bonds, items, garrisons }));
  const find = (rows, id, key) => rows.find((r) => r.id === id && r.key === key);

  assert.equal(find(rep.bonds, 'preciShip', 'act9autochess_bond_eff_preci')?.status, 'none');
  assert.equal(find(rep.bonds, 'visiShip', 'bond_new_prep_rule')?.status, 'none');
  assert.equal(find(rep.bonds, 'visiShip', 'bond_layer_gain_coin')?.status, 'ok');

  const take = find(rep.items, 'chess_item_2_02_e', 'use_equip_take_shop');
  assert.equal(take?.status, 'ok', 'a renamed key of the same meaning reads as the default season\'s');
  assert.equal(take.alias, 'use_equip_reward_random_char_chess_in_shop');
  // the prep side runs by buff key too: nothing registers on the id for a buff it does not carry (no `wrong`)
  const pager = find(rep.items, 'chess_item_4_01_e', 'use_equip_act9_new_rule');
  assert.equal(pager?.status, 'none');
  assert.deepEqual(pager.wrong, []);
  // the battle side runs by buff key: the id keeps nothing of 天马之枪, so nothing runs on the record (no `wrong`)
  const pegasus = find(rep.items, 'chess_item_6_01_e', 'act9autochess_equip_acarm999_global_buff');
  assert.equal(pegasus?.status, 'none');
  assert.deepEqual(pegasus.wrong, []);
  assert.equal(find(rep.items, 'chess_item_6_01_e', 'attr_common_global_buff')?.status, 'ok', 'its stat buff still acts');

  const opt = find(rep.garrisons, layer.effectKey, 'IN_BATTLE');
  assert.equal(opt?.status, 'partial');
  assert.ok(opt.missing.some((m) => m.startsWith('bond_type=bond_act9_new') && m.includes(layer.garrisonId)), opt.missing.join('; '));
  assert.equal(find(rep.garrisons, 'act9autochess_gar_event_new', 'IN_BATTLE')?.status, 'none');
  const ev = find(rep.garrisons, 'SERVER_ADD_BOND_METHOD', 'SERVER_NEW_EVENT');
  assert.equal(ev?.status, 'none', 'a handler without a hook for its event type runs nothing');

  assert.ok(rep.totals.items.none >= 2 && rep.totals.bonds.none >= 2 && rep.totals.garrisons.partial >= 1, JSON.stringify(rep.totals));
});

test('the hidden season 规程: the report runs and finds its content still being built', () => {
  const rep = coverageOf('act3autochess');
  for (const d of ['bonds', 'items', 'garrisons']) assert.ok(rep[d].length > 20, `${d}: ${rep[d].length} rows`);
  assert.ok(rep.bonds.some((r) => r.id === 'ursusShip' && r.status === 'ok'), '乌萨斯 (its own template) is acted on');
});
