// test/gamedata-flat.test.js — tools/gamedata-flat.mjs: the FlatBuffers-decoded dump (fexli/ArknightsResource, the source of
// 规程's tables: tools/gamedata-url.mjs SEASON_GAMEDATA) read as Kengxxiao's JSON. Synthetic records always; with both
// dumps in .cache (the default season's and .cache/gamedata-act3autochess/), every record the two dumps share and the
// client update did not change must come out equal, field for field (fields only the newer dump has aside).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeFlat } from '../tools/gamedata-flat.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('left-out defaults come back, numeric enums get their names', () => {
  const char = normalizeFlat('excel/character_table.json', {
    char_1: {
      name: 'x', rarity: 5, profession: 'SNIPER', potentialItemId: 'p',
      phases: [{ attributesKeyFrames: [] }],
      skills: [{ skillId: 's', unlockCond: { phase: 2, level: 1 } }],
      talents: [{ candidates: [{ unlockCondition: { phase: 0, level: 1 }, prefabKey: '1', blackboard: [{ key: 'a' }, { key: 'b', value: 2, valueStr: 'v' }] }] }],
      potentialRanks: [{ type: 0, buff: { attributes: { attributeModifiers: [{ attributeType: 21, formulaItem: 0, value: -4 }] } } }],
    },
  });
  const c = char.char_1;
  assert.equal(c.rarity, 'TIER_6');
  assert.equal(c.classicPotentialItemId, null);
  assert.equal(c.subPower, null);
  assert.equal(c.skills[0].unlockCond.phase, 'PHASE_2');
  assert.deepEqual(c.talents[0].candidates[0].blackboard, [{ key: 'a', value: 0, valueStr: null }, { key: 'b', value: 2, valueStr: 'v' }]);
  assert.equal(c.talents[0].candidates[0].tokenKey, null);
  assert.equal(c.potentialRanks[0].type, 'BUFF');
  assert.deepEqual(c.potentialRanks[0].buff.attributes.attributeModifiers[0], { attributeType: 'RESPAWN_TIME', formulaItem: 'ADDITION', value: -4 });
});

test('the 卫戍协议 sections of activity_table: enums, defaults, the diy slot rarity; the other events are left alone', () => {
  const t = normalizeFlat('excel/activity_table.json', {
    basicInfo: {},
    activity: {
      AUTOCHESS: { s: { V: {
        charChessDataDict: { c_a: { chessId: 'c_a', status: { evolvePhase: 1, charLevel: 55 } } },
        charShopChessDatas: { c_a: { chessId: 'c_a', chessType: 'PRESET' } },
        trapChessDataDict: { i_a: { chessId: 'i_a', trapDuration: -1, effectId: 'e', status: { evolvePhase: 0 } } },
        effectInfoDataDict: { e: { effectId: 'e', effectType: 'EQUIP' } },
        effectBuffInfoDataDict: { e: [{ key: 'k', blackboard: [{ key: 'n' }] }] },
        diyChessDict: { d_a: 5 },
      } } },
      OTHER: { x: { selector: { buildableMask: 1 } } },
    },
    autoChessData: { skillTriggerDataList: [{ profession: 4, skillTriggerTypes: ['ALWAYS'] }] },
  });
  const a = t.activity.AUTOCHESS.s.V;
  assert.equal(a.charChessDataDict.c_a.status.evolvePhase, 'PHASE_1');
  assert.equal(a.charShopChessDatas.c_a.isHidden, false);
  assert.deepEqual(a.trapChessDataDict.i_a, { chessId: 'i_a', trapDuration: -1, effectId: 'e', status: { evolvePhase: 'PHASE_0' }, canGiveBond: false, giveBondId: null, givePowerId: null });
  assert.deepEqual(a.effectInfoDataDict.e, { effectId: 'e', effectType: 'EQUIP', effectCounterType: 'NONE', effectDecoIconId: null, enemyPrice: 0 });
  assert.deepEqual(a.effectBuffInfoDataDict.e, [{ key: 'k', blackboard: [{ key: 'n', value: 0, valueStr: null }], countType: 'NONE' }]);
  assert.equal(a.diyChessDict.d_a, 'TIER_6');
  assert.equal(t.autoChessData.skillTriggerDataList[0].profession, 'TANK');
  assert.equal(t.activity.OTHER.x.selector.buildableMask, 1, 'another event is not read');
});

test('levels and enemy_database: tile enums, wrapped enemy enums, Key / Value; range_table keeps its numbers', () => {
  const lv = normalizeFlat('levels/activities/x/level_x.json', {
    mapData: { tiles: [{ tileKey: 't', heightType: 1, buildableType: 2, passableMask: 3, playerSideMask: 0 }] },
    routes: [{ motionMode: 1, checkpoints: [{ type: 6 }] }], runes: [{ difficultyMask: 1 }],
  });
  assert.deepEqual(lv.mapData.tiles[0], { tileKey: 't', heightType: 'HIGHLAND', buildableType: 'RANGED', passableMask: 'ALL', playerSideMask: 'ALL' });
  assert.equal(lv.routes[0].motionMode, 'FLY');
  assert.equal(lv.routes[0].checkpoints[0].type, 'APPEAR_AT_POS');
  assert.equal(lv.runes[0].difficultyMask, 'NORMAL');
  const db = normalizeFlat('levels/enemydata/enemy_database.json', { enemies: [{ key: 'e', value: [{ level: 0, enemyData: { motion: { m_defined: true, m_value: 1 }, talentBlackboard: [{ key: 'k' }] } }] }] });
  assert.deepEqual(db.enemies[0].Value[0].enemyData, { motion: { m_defined: true, m_value: 'FLY' }, talentBlackboard: [{ key: 'k', value: 0, valueStr: null }] });
  assert.equal(db.enemies[0].Key, 'e');
  assert.deepEqual(normalizeFlat('excel/range_table.json', { r: { direction: 1 } }), { r: { direction: 1 } });
  assert.throws(() => normalizeFlat('excel/skill_table.json', { s: { levels: [{ skillType: 7 }] } }), /skillType 7 has no known name/);
});

const KENG = `${ROOT}.cache/gamedata/`, FLAT = `${ROOT}.cache/gamedata-act3autochess/`;
const both = (rel) => existsSync(KENG + rel) && existsSync(FLAT + rel);
/** a ⊆ b: every field of a is in b with the same value (b may have fields of a newer client) */
const within = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => within(x, b[i]));
  return Object.keys(a).every((k) => k in b && within(a[k], b[k]));
};

test('both local dumps: the records the update left alone come out as Kengxxiao writes them', { skip: !both('excel/character_table.json') && 'no local dumps' }, () => {
  const load = (dir, rel) => JSON.parse(readFileSync(dir + rel, 'utf8'));
  // [table, records of it, share that must match: what the client update changed (sort ids, texts, a few numbers) is the rest]
  const cases = [
    ['excel/skill_table.json', (t) => t, 0.95],
    ['excel/range_table.json', (t) => t, 1],
    ['excel/battle_equip_table.json', (t) => t, 1],
    ['excel/uniequip_table.json', (t) => t.equipDict, 0.99],
    ['levels/enemydata/enemy_database.json', (t) => Object.fromEntries(t.enemies.map((e) => [e.Key, e.Value])), 0.99],
  ];
  for (const [rel, recs, share] of cases) {
    if (!both(rel)) continue;
    const k = recs(load(KENG, rel)), f = recs(normalizeFlat(rel, load(FLAT, rel)));
    const ids = Object.keys(f).filter((id) => id in k);
    const same = ids.filter((id) => within(k[id], f[id])).length;
    assert.ok(same / ids.length >= share, `${rel}: ${same} / ${ids.length}`);
  }
  // character_table: the update renumbered sortIndex and fixed some texts; the rest of each record is the same
  const k = load(KENG, 'excel/character_table.json'), f = normalizeFlat('excel/character_table.json', load(FLAT, 'excel/character_table.json'));
  const strip = ({ sortIndex, itemDesc, talents, ...r }) => r;
  const ids = Object.keys(f).filter((id) => id in k);
  const same = ids.filter((id) => within(strip(k[id]), strip(f[id]))).length;
  assert.ok(same / ids.length >= 0.99, `character_table: ${same} / ${ids.length}`);
});
