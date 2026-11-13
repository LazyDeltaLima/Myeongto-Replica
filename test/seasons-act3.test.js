// test/seasons-act3.test.js — 卫戍协议：规程 (shared/seasons.js `act3autochess`, public from 2.0.0) on its own tables
// (tools/build-data.mjs --season act3autochess): the season reuses the default season's ids for other things — 125 of the
// 128 operator chess ids both seasons have name another operator, item ids other items, 特质 ids other 特质 — and these tests hold
// the code to the real ids: a chess takes its own operator's kit, an item its own item's handler, a 特质 check its own
// 特质; the leader HP of a mode, the strategies a mode leaves out; the kits written for its operators.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../server/data.js';
import { KITS, kitKeyOfChar, chessKitCode, SEASON_KIT_FILES, SEASON_KITS } from '../server/sim/content/kits/index.js';
import { kitOf } from '../server/sim/content/index.js';
import { itemKeyOf, itemIdOfKey, garrisonKeyOf } from '../server/sim/content/support/index.js';
import { GameData, bossBloodPoint, itemKey } from '../server/match/gamedata.js';
import { offeredSeasons, seasonInfo } from '../shared/seasons.js';
import { ACT3 } from './helpers/seasonPieces.js';
import { chessBody } from '../shared/standIn.js';

const quiet = { warn() {}, error() {}, info() {} };
const BASE = getData({ log: quiet });
const code = (charId) => String(charId).replace(/^char_\d+_/, '');
const pieces = Object.values(ACT3.chess).filter((c) => c.charId && !c.isDiy);

test('the season is public: every server offers it, SP_SEASONS or not', () => {
  assert.equal(seasonInfo('act3autochess').public, true);
  assert.deepEqual(offeredSeasons(''), ['act2autochess', 'act3autochess']);
  assert.deepEqual(offeredSeasons('act3autochess'), ['act2autochess', 'act3autochess']);
  assert.equal(ACT3.config.season, 'act3autochess');
  assert.equal(ACT3.config.seasonName, '卫戍协议:规程');
});

test('its tables: 141 shop operators, 26 bonds, 61 strategies, 25 modes (no 入门协议); an id names another operator than the default\'s', () => {
  assert.equal(pieces.filter((c) => !c.isGolden && c.visible).length, 141);
  assert.equal(Object.keys(ACT3.bonds).length, 26);
  assert.equal(Object.keys(ACT3.bands).length, 61);
  assert.equal(Object.keys(ACT3.config.modes).length, 25);
  assert.ok(!Object.values(ACT3.config.modes).some((m) => m.difficulty === 'TRAINING'), 'maintainer decision 2026-11-08: no training mode');
  // the same id, two operators: 缪尔赛思 in 盟约, 遥 in 规程
  assert.equal(BASE.chess.chess_char_6_11_a.charId, 'char_249_mlyss');
  assert.equal(ACT3.chess.chess_char_6_11_a.charId, 'char_4202_haruka');
  const shared = pieces.filter((c) => !c.isGolden && BASE.chess[c.chessId]?.charId);
  assert.equal(shared.length, 128, "the operator ids both seasons have (132 with the 4 自选 slots)");
  assert.equal(shared.filter((c) => BASE.chess[c.chessId].charId !== c.charId).length, 125);
});

test('kits: a chess takes its own operator\'s kit (a template piece: its body\'s), never the one its id names in the default season', () => {
  const keyOf = new Map(Object.entries(KITS).map(([k, v]) => [v, k]));
  const wrong = [], none = [];
  for (const c of pieces) {
    const f = kitOf({ ...c, id: c.chessId }, KITS);
    if (!f) { none.push(c.charId); continue; }
    const k = keyOf.get(f);
    if ((chessKitCode(k) ?? code(k)) !== code(chessBody(c))) wrong.push(`${c.chessId} ${c.charId} → ${k}`);
  }
  assert.deepEqual(wrong, []);
  // 遥 under 缪尔赛思's id plays her own 自选 kit, 缪尔赛思's chess kit stays hers in the default season
  assert.ok(kitOf({ ...ACT3.chess.chess_char_6_11_a, id: 'chess_char_6_11_a' }, KITS) === KITS.char_4202_haruka);
  assert.ok(kitOf({ ...BASE.chess.chess_char_6_11_a, id: 'chess_char_6_11_a' }, KITS) === KITS.chess_char_6_11_a);
  assert.equal(chessKitCode('chess_char_6_11_a'), 'mlyss');
  assert.equal(chessKitCode('char_4202_haruka'), null, 'a 自选 kit is no chess kit');
  // the operators no kit is written for yet are only the ones the new-season bundles add (阿米娅 in her 医疗 form among them)
  assert.ok(none.length <= 20, `${none.length} without a kit: ${[...new Set(none)].join(' ')}`);
});

test('a template chess (阿米娅 医疗) is built from its template: charId the operator, tmplId the body', () => {
  const amiya = ACT3.chess.chess_char_5_26_a;
  assert.equal(amiya.charId, 'char_002_amiya');
  assert.equal(amiya.tmplId, 'char_1037_amiya3');
  assert.equal(amiya.module.id, 'uniequip_002_amiya3', 'her template\'s module');
  assert.equal(amiya.assets.spine, 'char_1037_amiya3', 'her template\'s model');
  assert.equal(amiya.profession, 'MEDIC');
});

test('items: a reused item id reaches the handler of the same item (its trap), a new item none', () => {
  const rec = ACT3.items.chess_item_3_03_e_a;
  assert.equal(rec.trapId, BASE.items.chess_item_3_04_e_a.trapId, 'the default season\'s 3_04 is the same item');
  assert.equal(rec.handlerKey, 'chess_item_3_04_e');
  assert.equal(itemKeyOf('chess_item_3_03_e_a', ACT3), 'chess_item_3_04_e');
  assert.equal(itemKeyOf('chess_item_3_03_e_b', ACT3), 'chess_item_3_04_e', 'the elite form shares the key');
  assert.equal(itemKey('chess_item_3_03_e_a', ACT3), 'chess_item_3_04_e');
  assert.equal(itemKeyOf('chess_item_3_03_e_a'), 'chess_item_3_03_e', 'no scope: the id itself (the default season)');
  assert.equal(itemKeyOf('chess_item_3_04_e_a', BASE), 'chess_item_3_04_e', 'the default season has no handlerKey');
  assert.equal(itemIdOfKey('chess_item_3_04_e', ACT3), 'chess_item_3_03_e_a');
  assert.equal(itemIdOfKey('chess_item_3_04_e', BASE), 'chess_item_3_04_e_a');
  const fresh = Object.values(ACT3.items).filter((r) => r.handlerKey.startsWith('act3autochess:'));
  assert.ok(fresh.length > 20, `${fresh.length} new items`);
  for (const r of fresh) assert.ok(!BASE.items[`${r.handlerKey.split(':')[1]}_a`] || BASE.items[`${r.handlerKey.split(':')[1]}_a`].trapId !== r.trapId, r.id);
  for (const r of Object.values(BASE.items)) assert.equal(r.handlerKey, undefined, `${r.id}: the default data is unchanged`);
});

test('特质: a reused 特质 id keeps no handler of the default season\'s; a moved one keeps its own', () => {
  assert.notEqual(ACT3.garrisons.garrison_108_a?.handlerKey, 'garrison_108_a', 'garrison_108_a is another 特质 in 规程');
  assert.equal(garrisonKeyOf('garrison_108_a', BASE), 'garrison_108_a');
  const moved = Object.values(ACT3.garrisons).filter((g) => !g.handlerKey.includes(':'));
  assert.ok(moved.length > 0);
  for (const g of moved) {
    const d = BASE.garrisons[g.handlerKey];
    assert.ok(d && d.effectKey === g.effectKey, g.garrisonId);
    assert.equal(garrisonKeyOf(g.garrisonId, ACT3), g.handlerKey);
  }
});

test('modes: a leader\'s HP is its mode\'s (bloodDataDict); a strategy is left out of the modes it names', () => {
  const b = ACT3.bosses.boss_1;
  assert.equal(b.bloodByMode.mode_single_1, 283680);
  assert.equal(bossBloodPoint(b, 'mode_single_1', 'FUNNY'), 283680);
  assert.equal(bossBloodPoint(b, 'mode_multi_abyss', 'ABYSS'), 3940000);
  assert.equal(bossBloodPoint(BASE.bosses.boss_1, 'mode_multi_hard', 'HARD'), BASE.bosses.boss_1.bloodPoint.HARD, 'the default season: by difficulty');
  const fast = new GameData(ACT3, 'mode_single_funny');
  const one = new GameData(ACT3, 'mode_single_1');
  const out = Object.values(ACT3.bands).filter((x) => (x.inactiveModeIds || []).includes('mode_single_funny')).map((x) => x.bandId);
  assert.ok(out.length > 0);
  for (const id of out) assert.equal(fast.bandAllowed(id), false, id);
  assert.equal(one.bandAllowed(out[0]), !(ACT3.bands[out[0]].inactiveModeIds || []).includes('mode_single_1'));
  assert.equal(ACT3.config.bandDraft.timeoutBandId, 'band_amiya', '[ASSUMED·화면] its first strategy by sortId');
});

test('triggers: a row\'s condition list is kept; the lists some row of both seasons gives play that row\'s rule', () => {
  const tank = ACT3.chess.chess_char_1_14_a; // 野鬃 (重装)
  assert.equal(tank.charId, 'char_325_bison');
  assert.deepEqual(tank.skills[0].trigger.rawRules, ['ON_TAKE_DAMAGE', 'SKILL_RANGE_ENEMY']);
  assert.equal(tank.skills[0].trigger.rule, 'TAKE_DAMAGE');
});

test('the kit of an operator only 规程 fields is found by its charId (a template piece: its body) for its piece, whatever the id', () => {
  for (const [charId, kit] of Object.entries(SEASON_KITS)) {
    assert.equal(kitKeyOfChar(charId, 1), charId);
    const c = pieces.find((x) => chessBody(x) === charId && !x.isGolden);
    assert.ok(c, `${charId}: a piece of 规程`);
    assert.ok(kitOf({ ...c, id: c.chessId }, KITS) === kit, charId);
  }
});

test('a 规程 kit file op-<codename>.js registers its operator and writes every skill, in both forms', async () => {
  const { normalizeChess } = await import('../server/sim/simdata.js');
  assert.equal(SEASON_KIT_FILES.length, Object.keys(SEASON_KITS).length, 'one key per file');
  for (const file of SEASON_KIT_FILES) {
    const m = /^op-([a-z0-9]+)\.js$/.exec(file);
    assert.ok(m, `${file}: name`);
    const mod = await import(`../server/sim/content/kits/ops/${file}`);
    const [charId] = Object.keys(mod.default);
    assert.equal(code(charId), m[1], `${file}: default export`);
    for (const golden of [false, true]) {
      const rec = pieces.find((x) => chessBody(x) === charId && x.isGolden === golden);
      assert.ok(rec, `${file}: piece`);
      const kit = mod.default[charId](rec.skill.bb, rec, normalizeChess(rec));
      assert.deepEqual(Object.keys(kit.skills || {}).sort(), rec.skills.map((x) => x.skillId).sort(), `${file} ${golden}: skills`);
    }
  }
});
