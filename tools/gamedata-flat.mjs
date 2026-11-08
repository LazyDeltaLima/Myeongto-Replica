// tools/gamedata-flat.mjs — read a FlatBuffers-decoded gamedata dump (fexli/ArknightsResource) as the Kengxxiao JSON
// that tools/build-data.mjs is written for.
//
// The two public dumps carry the same records in two spellings. The decoded dump (a) leaves out every field whose value
// is the FlatBuffers default (a blackboard entry without `value` is 0, without `valueStr` null; an absent string, list or
// table is null, an absent boolean false), (b) writes some enums as their numbers (`evolvePhase: 1` for "PHASE_1",
// `profession: 4` for "TANK") and (c) spells enemy_database's pairs `key` / `value` (Kengxxiao: `Key` / `Value`).
// normalizeFlat puts back what build-data reads. The enum numbers are the ones both dumps give the same record (paired
// over character_table, skill_table, the equipment tables, enemy_database and the 卫戍协议 levels of both); a number
// none of those pairs names throws, so a new member is noticed instead of passed on as a number.
// test/gamedata-flat.test.js holds it to the Kengxxiao records that did not change between the two dumps.

const PHASE = { 0: 'PHASE_0', 1: 'PHASE_1', 2: 'PHASE_2', 3: 'PHASE_3' };
/** Bit-flag enum (CharacterProfessionCategory): one bit per class. */
const PROFESSION = { 0: 'NONE', 1: 'WARRIOR', 2: 'SNIPER', 4: 'TANK', 8: 'MEDIC', 16: 'SUPPORT', 32: 'CASTER', 64: 'SPECIAL', 128: 'TOKEN', 256: 'TRAP', 512: 'PIONEER' };
const MOTION = { 0: 'WALK', 1: 'FLY', 2: 'E_NUM' };
const ALWAYS = { 0: 'ALWAYS' };

const RARITY = { 0: 'TIER_1', 1: 'TIER_2', 2: 'TIER_3', 3: 'TIER_4', 4: 'TIER_5', 5: 'TIER_6' };

/** Field name → its enum (number → Kengxxiao name). A field missing here is copied as it is. */
const ENUMS = {
  evolvePhase: PHASE, phase: PHASE, unlockEvolvePhase: PHASE, showEvolvePhase: PHASE,
  rarity: RARITY,
  profession: PROFESSION,
  skillType: { 0: 'PASSIVE', 1: 'MANUAL', 2: 'AUTO' },
  durationType: { 0: 'NONE', 1: 'AMMO' },
  // SpType: Kengxxiao names 0 / 1 / 2 / 4 and keeps the rest (8: ON_DEPLOY) a number, build-data reads both
  spType: { 0: 'NONE', 1: 'INCREASE_WITH_TIME', 2: 'INCREASE_WHEN_ATTACK', 4: 'INCREASE_WHEN_TAKEN_DAMAGE' },
  attributeType: { 0: 'MAX_HP', 1: 'ATK', 2: 'DEF', 3: 'MAGIC_RESISTANCE', 4: 'COST', 7: 'ATTACK_SPEED', 21: 'RESPAWN_TIME' },
  formulaItem: { 0: 'ADDITION' },
  applyWay: { 0: 'NONE', 1: 'MELEE', 2: 'RANGED', 3: 'ALL' },
  // levels
  buildableType: { 0: 'NONE', 1: 'MELEE', 2: 'RANGED', 3: 'ALL' },
  heightType: { 0: 'LOWLAND', 1: 'HIGHLAND' },
  passableMask: { 0: 'NONE', 1: 'WALK_ONLY', 2: 'FLY_ONLY', 3: 'ALL' },
  playerSideMask: { 0: 'ALL' },
  direction: { 0: 'UP', 1: 'RIGHT', 2: 'DOWN', 3: 'LEFT' },
  motion: MOTION, motionMode: MOTION,
  actionType: { 0: 'SPAWN', 6: 'ACTIVATE_PREDEFINED' },
  randomType: ALWAYS, refreshType: ALWAYS,
  functionDisableMask: { 0: 'NONE' },
  levelType: { 0: 'NORMAL', 1: 'ELITE', 2: 'BOSS' },
  difficultyMask: { 1: 'NORMAL', 2: 'FOUR_STAR', 4: 'EASY', 8: 'SIX_STAR', 15: 'ALL' }, // LevelData.Difficulty (bit flags)
  buildableMask: { 3: 'ALL' },
};
/** A field name two enums share: the enum by the list holding the record. */
const ENUMS_BY_PARENT = {
  type: {
    potentialRanks: { 0: 'BUFF', 1: 'CUSTOM' },
    trackList: { 0: 'INITIAL', 1: 'ADVANCED' },
    checkpoints: { 0: 'MOVE', 1: 'WAIT_FOR_SECONDS', 5: 'DISAPPEAR', 6: 'APPEAR_AT_POS', 8: 'PATROL_MOVE' },
  },
};

/** A dict whose values are one enum (keyed by id, so no field name says which): activity diyChessDict slot → rarity. */
const DICT_ENUMS = { diyChessDict: RARITY };

/** Fields the decoded dump leaves out at their default, with the value Kengxxiao writes. */
const DEFAULTS = {
  // character_table / battle_equip_table
  classicPotentialItemId: null, displayTokenDict: null, subPower: null, tokenKey: null,
  // uniequip_table
  specialEquipColor: null, specialEquipDesc: null,
  // activity_table 卫戍协议 sections
  effectCounterType: 'NONE', countType: 'NONE', effectDecoIconId: null, enemyPrice: 0, isHidden: false,
  canGiveBond: false, giveBondId: null, givePowerId: null, extraEnemyIdentifier: 0, extraEnemyKeyList: null,
};
/** The records these defaults belong to: a field of DEFAULTS is put back only on an object that has all these fields. */
const DEFAULT_OWNERS = {
  classicPotentialItemId: ['potentialItemId'], displayTokenDict: ['potentialItemId'], subPower: ['potentialItemId'],
  tokenKey: ['unlockCondition', 'prefabKey'],
  specialEquipColor: ['uniEquipId'], specialEquipDesc: ['uniEquipId'],
  effectCounterType: ['effectId', 'effectType'], effectDecoIconId: ['effectId', 'effectType'], enemyPrice: ['effectId', 'effectType'],
  countType: ['key', 'blackboard'], isHidden: ['chessId', 'chessType'],
  canGiveBond: ['chessId', 'trapDuration'], giveBondId: ['chessId', 'trapDuration'], givePowerId: ['chessId', 'trapDuration'],
  extraEnemyIdentifier: ['enemyIdentifier'], extraEnemyKeyList: ['enemyIdentifier'],
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A blackboard list: a list of { key, value?, valueStr? } entries. */
const isBlackboardKey = (k) => /^(blackboard|blackBoard|attributeBlackboard|configBlackBoard|talentBlackboard)$/.test(k);

function enumName(field, parent, value, path) {
  const map = ENUMS_BY_PARENT[field]?.[parent] ?? (ENUMS_BY_PARENT[field] ? null : ENUMS[field]);
  if (!map || typeof value !== 'number') return value;
  if (field === 'spType' && !Object.hasOwn(map, value)) return value;
  if (!Object.hasOwn(map, value)) throw new Error(`gamedata-flat: ${path}: ${field} ${value} has no known name`);
  return map[value];
}

/**
 * @param {unknown} v
 * @param {string} key the field holding v
 * @param {string} parent the field holding v's list / record
 * @param {string} path for errors
 */
function norm(v, key, parent, path) {
  // enemy data wraps each field as { m_defined, m_value }: the enum is the wrapped field's
  if (key === 'm_value') return enumName(parent, '', v, path);
  if (Array.isArray(v)) {
    // a blackboard list, or one of battle_equip_table's tokenAttributeBlackboard (token id → entries)
    const bb = isBlackboardKey(key) || parent === 'tokenAttributeBlackboard';
    return v.map((x, i) => {
      const y = norm(x, key, key, `${path}[${i}]`);
      return bb && isObj(y) ? { key: y.key, value: y.value ?? 0, valueStr: y.valueStr ?? null, ...y } : y;
    });
  }
  if (!isObj(v)) {
    if (DICT_ENUMS[parent] && typeof v === 'number') {
      if (!Object.hasOwn(DICT_ENUMS[parent], v)) throw new Error(`gamedata-flat: ${path}: ${parent} value ${v} has no known name`);
      return DICT_ENUMS[parent][v];
    }
    return enumName(key, parent, v, path);
  }
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = norm(x, k, key, `${path}.${k}`);
  for (const [k, owner] of Object.entries(DEFAULT_OWNERS)) if (!(k in out) && owner.every((f) => f in out)) out[k] = DEFAULTS[k];
  return out;
}

/**
 * The Kengxxiao spelling of a decoded table.
 * @param {string} rel the table's path under gamedata/ (e.g. 'excel/activity_table.json')
 * @param {any} json the decoded dump's JSON of it
 */
export function normalizeFlat(rel, json) {
  if (rel === 'levels/enemydata/enemy_database.json' && Array.isArray(json?.enemies)) {
    return { ...json, enemies: json.enemies.map((e, i) => ({ Key: e.key ?? e.Key, Value: norm(e.value ?? e.Value, 'Value', 'enemies', `enemies[${i}]`) })) };
  }
  if (rel === 'excel/range_table.json') return json; // `direction` is a number in both dumps
  // activity_table: the 卫戍协议 parts only (other events have enums of their own, and build-data reads none of them)
  if (rel === 'excel/activity_table.json') {
    return {
      ...json,
      basicInfo: json.basicInfo,
      activity: { ...json.activity, AUTOCHESS: norm(json.activity?.AUTOCHESS, 'AUTOCHESS', 'activity', 'activity.AUTOCHESS') },
      autoChessData: norm(json.autoChessData, 'autoChessData', '', 'autoChessData'),
    };
  }
  return norm(json, '', '', rel);
}
