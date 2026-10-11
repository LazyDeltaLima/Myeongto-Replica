// test/backups.test.js — the data of 补位 (stand-ins) and 自选 (DIY slots): chess.json `backup` and data/backups.json
// (docs/DATA.md §18; tools/build-data.mjs buildBackups; shared/standIn.js, shared/diy.js). These tests pin the data the
// gameplay reads: the 133 base chess and their types, the 17 stand-in characters and their forms, every NORMAL chess
// resolving to its stand-in, the 4 DIY slots, the legal picks (this server's five owned 6★ — shared/local-diy.js — with
// their forms and summons; no prototype pick since the hard fork from 0.2.0) and the faction bonds.
// With the official-data cache (.cache/gamedata) the backup fields, the stand-in numbers and the bond derivation are
// re-derived from the raw tables.
// Run: node --test test/backups.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { standInRecord, composeUnitRecord, unitForm, statusKey, IDENTITY_FIELDS } from '../shared/standIn.js';
import { diyRecordOf, lockedSelection } from '../shared/diy.js';
import { LOCAL_DIY_PICKS } from '../shared/local-diy.js';
import { composeStats, composeTalents, resolveLoadout, loadoutRecord, normalizeChess } from '../server/sim/simdata.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR || join(ROOT, 'data');
const CACHE = join(ROOT, '.cache', 'gamedata');
const HAS_CACHE = ['activity_table', 'character_table', 'skill_table', 'battle_equip_table'].every((f) => existsSync(join(CACHE, 'excel', `${f}.json`)));
const load = (name) => JSON.parse(readFileSync(join(DATA, `${name}.json`), 'utf8'));
const chess = load('chess');
const backups = load('backups');
const bonds = load('bonds');
const config = load('config');
const raw = (f) => JSON.parse(readFileSync(join(CACHE, 'excel', `${f}.json`), 'utf8'));

const all = Object.values(chess);
const base = all.filter((c) => !c.isGolden);
const ofType = (t) => base.filter((c) => c.chessType === t);
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ELITES = ['char_608_acpion', 'char_609_acguad', 'char_610_acfend', 'char_611_acnipe', 'char_612_accast', 'char_613_acmedc', 'char_614_acsupo', 'char_615_acspec', 'char_617_sharp2'];
const RESERVES = ['char_600_cpione', 'char_601_cguard', 'char_602_cdfend', 'char_603_csnipe', 'char_604_ccast', 'char_605_cmedic', 'char_606_csuppo', 'char_607_cspec'];

test('chess: 133 base chess — 74 PRESET / 55 NORMAL / 4 DIY — and every record keeps the five official backup fields', () => {
  assert.equal(base.length, 133);
  assert.deepEqual([ofType('PRESET').length, ofType('NORMAL').length, ofType('DIY').length], [74, 55, 4]);
  for (const c of all) {
    assert.deepEqual(Object.keys(c.backup), ['charId', 'tmplId', 'skillIndex', 'uniEquipId', 'potRank'], `${c.chessId}: backup fields`);
    assert.deepEqual(c.backup, chess[c.baseId].backup, `${c.chessId}: the elite shares its base row's backup`);
    assert.equal(c.backup.tmplId, null);
  }
  for (const c of ofType('PRESET')) assert.equal(c.backup.charId, c.charId, `${c.chessId}: 特许 — its own backup`);
  for (const c of ofType('NORMAL')) {
    assert.ok(c.backup.charId && c.backup.charId !== c.charId, `${c.chessId}: a NORMAL chess names another character`);
    assert.equal(c.backup.potRank, 0, `${c.chessId}: stand-ins fight at potential 0`);
    assert.ok(c.tier >= 3, `${c.chessId}: no NORMAL chess below tier 3`);
  }
  for (const c of ofType('DIY')) assert.deepEqual(c.backup, { charId: null, tmplId: null, skillIndex: 0, uniEquipId: null, potRank: 0 });
  // the only stored potential above 0: 宴 and 野鬃, both PRESET (their own backup)
  assert.deepEqual(base.filter((c) => c.backup.potRank !== 0).map((c) => c.chessId), ['chess_char_1_18_a', 'chess_char_1_19_a']);
  assert.deepEqual(ofType('NORMAL').filter((c) => c.isHidden).map((c) => c.chessId), ['chess_char_5_18_a', 'chess_char_6_10_a']);
});

test('chess: the backup fields are the official shop row, verbatim', { skip: !HAS_CACHE && 'no .cache/gamedata' }, () => {
  const act = raw('activity_table').activity.AUTOCHESS_SEASON.act2autochess;
  for (const c of all) {
    const s = act.charShopChessDatas[c.baseId];
    assert.deepEqual(c.backup, { charId: s.backupCharId, tmplId: s.backupTmplId, skillIndex: s.backupCharSkillIndex, uniEquipId: s.backupCharUniEquipId, potRank: s.backupCharPotRank }, c.chessId);
    assert.equal(c.chessType, s.chessType, c.chessId);
  }
});

const STAT_KEYS = ['maxHp', 'atk', 'def', 'res', 'cost', 'blockCnt', 'bat', 'aspd', 'respawnTime', 'spRecovery', 'moveSpeed'];

test('backups: the 17 stand-in characters, each with a form for every status it fights at', () => {
  const ids = Object.keys(backups.units).filter((id) => backups.units[id].standsIn.length);
  assert.deepEqual(ids, [...RESERVES, ...ELITES]);
  assert.deepEqual(Object.keys(backups.units), [...RESERVES, ...ELITES, ...backups.diy.ownedPool], 'the stand-ins, then the owned 6★ picks');
  assert.deepEqual([...new Set(ofType('NORMAL').map((c) => c.backup.charId))].sort(), [...ids].sort(), 'the stand-ins are exactly the NORMAL chess backups');
  const statKeys = STAT_KEYS;
  for (const id of ids) {
    const u = backups.units[id];
    assert.equal(u.charId, id);
    assert.equal(u.rarity, ELITES.includes(id) ? 6 : 4, `${id}: rarity`);
    assert.equal(u.isNotObtainable, true, `${id}: a prototype cannot be owned`);
    assert.ok(u.name && u.profession && u.subProfessionId && u.subProfessionName && u.position, `${id}: identity`);
    assert.deepEqual(u.standsIn, ofType('NORMAL').filter((c) => c.backup.charId === id).map((c) => c.chessId).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), `${id}: standsIn`);
    assert.ok(u.assets.avatar === id && u.assets.spine === id && u.assets.portrait === `${id}_1` && u.assets.subProfIcon === `sub_${u.subProfessionId}_icon`, `${id}: assets`);
    // reserves: E2 Lv1 / E2 Lv60 module 1; elites also the tier-6 elite row (module 3)
    assert.deepEqual(Object.keys(u.forms), ELITES.includes(id) ? ['2/1/4/0', '2/60/7/1', '2/60/7/3'] : ['2/1/4/0', '2/60/7/1'], `${id}: forms`);
    for (const [key, f] of Object.entries(u.forms)) {
      const label = `${id}@${key}`;
      assert.equal(statusKey(f.status), key, label);
      for (const k of statKeys) assert.ok(isFiniteNum(f.stats[k]), `${label}: stats.${k}`);
      assert.ok(f.stats.maxHp > 0 && f.stats.atk > 0 && f.stats.bat > 0, `${label}: positive stats`);
      assert.ok(Array.isArray(f.rangeGrid) && f.rangeGrid.length > 0, `${label}: range`);
      assert.ok(['phys', 'arts', 'heal'].includes(f.dmgType) && ['melee', 'ranged', 'heal'].includes(f.attackKind), `${label}: classification`);
      assert.ok(typeof f.trait?.desc === 'string' && f.trait.desc.length > 0, `${label}: trait`);
      assert.ok(Array.isArray(f.talents) && f.talents.length > 0, `${label}: talents`);
      assert.deepEqual(f.skills.map((s) => s.index), u.charId === 'char_617_sharp2' ? [0] : [0, 1, 2], `${label}: every skill unlocked at E2`);
      for (const s of f.skills) {
        assert.equal(s.level, f.status.skillLevel, `${label} ${s.skillId}: level`);
        assert.ok(typeof s.trigger?.rule === 'string' && !('isDefault' in s), `${label} ${s.skillId}: trigger, no selection`);
        assert.ok(!/\{[a-z_@.[\]]+(:[0-9.%]+)?\}/i.test(s.desc), `${label} ${s.skillId}: resolved text`);
        for (const [k, v] of Object.entries(s.bb)) assert.ok(isFiniteNum(v), `${label} ${s.skillId}: bb ${k}`);
      }
      assert.deepEqual(f.tokens, [], `${label}: no prototype summons anything`);
      if (f.status.equipLevel === 0) assert.equal(f.modules, undefined, `${label}: no module phase on the normal form`);
      else assert.deepEqual(f.modules.map((m) => [m.uniEquipId, m.level]), ELITES.includes(id) ? [[`uniequip_002_${id.replace(/^char_\d+_/, '')}`, f.status.equipLevel]] : [], `${label}: modules`);
    }
  }
  // the official 重装 class row (TAKE_DAMAGE) meets the 重装 stand-ins' MANUAL skills, and the owner's 重装 exception
  // (the approved 补位 plan, 2026-10-05; tools/build-data.mjs STANDIN_TRIGGER_DEVIATIONS) makes every one of them cast
  // with an enemy in range — DEFAULT — on every form
  for (const id of ['char_602_cdfend', 'char_610_acfend']) {
    for (const f of Object.values(backups.units[id].forms)) {
      for (const s of f.skills) assert.deepEqual(s.trigger, { rule: 'DEFAULT', rawRule: 'TAKE_DAMAGE', customRangeGrid: null }, `${id}@${statusKey(f.status)} ${s.skillId}`);
    }
  }
  const tulipS3 = backups.units.char_608_acpion.forms['2/1/4/0'].skills[2];
  assert.deepEqual(tulipS3.trigger, { rule: 'DEFAULT', rawRule: 'DEFAULT', customRangeGrid: tulipS3.rangeGrid }, '郁金香 S3 对周围的敌人: the basic strategy on its own x-1 rangeId');
  assert.equal(backups.units.char_617_sharp2.assets.avatarGolden, 'char_617_sharp2_2', '领主·Sharp has E2 art');
});

test('backups: every NORMAL chess (both forms) resolves to its stand-in with the chess skill and module, as a chess-shaped record', () => {
  let n = 0;
  for (const c of all.filter((x) => x.chessType === 'NORMAL')) {
    const r = standInRecord(c, backups);
    assert.ok(r, `${c.chessId}: stand-in`);
    n++;
    // the chess keeps its identity: bonds, 特质, tier, price, merge, status
    for (const k of IDENTITY_FIELDS) if (k in c) assert.deepEqual(r[k], c[k], `${c.chessId}: ${k} kept`);
    assert.equal(r.charId, c.backup.charId);
    assert.equal(r.standInFor, c.charId);
    assert.equal(r.name, backups.units[c.backup.charId].name);
    // skill: the chess's index at the chess skill level; one default = skill
    assert.equal(r.skill.index, c.backup.skillIndex, `${c.chessId}: skill index`);
    assert.equal(r.skill.level, c.status.skillLevel, `${c.chessId}: skill level`);
    const defs = r.skills.filter((s) => s.isDefault);
    assert.equal(defs.length, 1);
    const { isDefault, ...d } = defs[0];
    assert.deepEqual(d, r.skill);
    assert.equal(r.assets.skillIcon, r.skill.iconId);
    // module: the chess's (none at tiers 3–4 and for the reserves), active only on the elite form
    assert.equal(r.module?.id ?? null, c.backup.uniEquipId ?? null, `${c.chessId}: module id`);
    if (c.status.equipLevel === 0) {
      assert.ok(!r.module?.active && r.statsBase === undefined && r.modules === undefined, `${c.chessId}: normal form, no module`);
    } else {
      assert.equal(r.module.active, !!c.backup.uniEquipId, `${c.chessId}: module active`);
      assert.equal(r.module.level, c.status.equipLevel);
      const dm = r.modules.find((m) => m.isDefault) ?? null;
      assert.equal(dm?.uniEquipId ?? null, c.backup.uniEquipId ?? null);
      assert.deepEqual(composeStats(r.statsBase, dm?.attr), r.stats, `${c.chessId}: statsBase + module = stats`);
      assert.deepEqual(dm?.traitOverride ?? r.traitBase, r.trait);
      assert.deepEqual(composeTalents(r.talentsBase, dm?.talentChanges), r.talents);
    }
    // the chess's loadout machinery reads it unchanged: no loadout = the backup selection; the sim normalises it
    assert.equal(loadoutRecord(r, resolveLoadout(r, null)), r);
    const def = normalizeChess(r);
    assert.deepEqual([def.id, def.baseId, def.charId, def.spine, def.skill.id, def.tier], [c.chessId, c.baseId, c.backup.charId, c.backup.charId, r.skill.skillId, c.tier]);
    assert.deepEqual(def.bonds, c.bonds);
  }
  assert.equal(n, 110);
  for (const c of all.filter((x) => x.chessType !== 'NORMAL')) assert.equal(standInRecord(c, backups), null, `${c.chessId}: PRESET / DIY have no stand-in`);
  // spot checks (zh_CN client data): 妮芙 → Stormeye S3 旋臂 + MAR-X; 莫斯提马 (T4) → Stormeye S2 without a module even
  // on the elite; 琳琅诗怀雅 → 预备干员-医疗 S3; 维娜·维多利亚 → 领主·Sharp S1 with LOR-X Lv3
  const s = (id) => standInRecord(chess[id], backups);
  assert.deepEqual([s('chess_char_5_22_b').skill.name, s('chess_char_5_22_b').module.type, s('chess_char_5_22_b').bonds], ['旋臂', 'MAR-X', ['swiftShip']]);
  assert.deepEqual([s('chess_char_4_02_b').skill.name, s('chess_char_4_02_b').module], ['心手合一', { id: null, name: null, type: null, level: 1, active: false }]);
  assert.deepEqual([s('chess_char_3_04_a').name, s('chess_char_3_04_a').skill.name, s('chess_char_3_04_a').garrisonIds], ['预备干员-医疗', '治疗强化·γ型', ['garrison_98_a']]);
  assert.deepEqual([s('chess_char_6_07_b').skill.name, s('chess_char_6_07_b').module.type, s('chess_char_6_07_b').module.level, s('chess_char_6_07_b').assets.avatar], ['沉默的爆发', 'LOR-X', 3, 'char_617_sharp2_2']);
  // 26 of the 55 stand-ins fight in another profession than the operator they replace
  assert.equal(ofType('NORMAL').filter((c) => standInRecord(c, backups).profession !== c.profession).length, 26);
});

test('backups: the stand-in numbers re-derived from the raw official tables', { skip: !HAS_CACHE && 'no .cache/gamedata' }, () => {
  const CT = raw('character_table'), ST = raw('skill_table'), BE = raw('battle_equip_table');
  const PH = { PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 };
  let n = 0;
  for (const c of all.filter((x) => x.chessType === 'NORMAL')) {
    const r = standInRecord(c, backups);
    const ch = CT[c.backup.charId];
    const P = ch.phases[c.status.phase];
    const k0 = P.attributesKeyFrames[0], k1 = P.attributesKeyFrames[P.attributesKeyFrames.length - 1];
    const t = (c.status.level - k0.level) / (k1.level - k0.level || 1);
    const f = (key) => k0.data[key] + (k1.data[key] - k0.data[key]) * t;
    const exp = { maxHp: f('maxHp'), atk: f('atk'), def: f('def'), res: f('magicResistance'), aspd: f('attackSpeed'), blockCnt: f('blockCnt'), cost: f('cost') };
    const map = { max_hp: 'maxHp', atk: 'atk', def: 'def', magic_resistance: 'res', attack_speed: 'aspd', block_cnt: 'blockCnt', cost: 'cost' };
    if (c.status.equipLevel > 0 && c.backup.uniEquipId) {
      for (const b of BE[c.backup.uniEquipId].phases.find((p) => p.equipLevel === c.status.equipLevel).attributeBlackboard) if (map[b.key]) exp[map[b.key]] += b.value;
    }
    for (const [key, v] of Object.entries(exp)) assert.ok(Math.abs(v - r.stats[key]) <= 0.5 + 1e-9, `${c.chessId} → ${ch.name}: ${key} ${r.stats[key]} vs official ${v}`);
    const se = ch.skills[c.backup.skillIndex];
    assert.ok(PH[se.unlockCond?.phase ?? 'PHASE_0'] <= c.status.phase, `${c.chessId}: S${c.backup.skillIndex + 1} unlocked at E${c.status.phase}`);
    const lv = ST[se.skillId].levels[c.status.skillLevel - 1];
    assert.equal(r.skill.skillId, se.skillId);
    assert.deepEqual([r.skill.spCost, r.skill.initSp, r.skill.duration, r.skill.name], [lv.spData.spCost, lv.spData.initSp, lv.duration, lv.name], `${c.chessId}: skill sp`);
    for (const e of lv.blackboard) if (!(e.valueStr && e.value === 0)) assert.ok(Math.abs(r.skill.bb[e.key] - e.value) < 1e-6, `${c.chessId}: skill bb ${e.key}`);
    n++;
  }
  assert.equal(n, 110);
});

test('DIY: four slots (tiers 5, 5, 6, 6) — price 4, sell 1, TIER_6, no 特质, no bonds; listed from the matching shop level', () => {
  const slots = backups.diy.slots;
  assert.deepEqual(Object.keys(slots), ['chess_char_5_diy1_a', 'chess_char_5_diy2_a', 'chess_char_6_diy1_a', 'chess_char_6_diy2_a']);
  for (const [id, s] of Object.entries(slots)) {
    assert.equal(s.goldenId, id.replace(/_a$/, '_b'));
    assert.equal(s.shopLevel, s.tier, `${id}: enters the shop at the shop level of its tier`);
    assert.equal(s.requirement, 'TIER_6');
    for (const c of [chess[id], chess[s.goldenId]]) {
      assert.deepEqual([c.isDiy, c.chessType, c.tier, c.price, c.sellPrice, c.diyRequirement, c.visible], [true, 'DIY', s.tier, 4, 1, 'TIER_6', false], c.chessId);
      assert.deepEqual([c.bonds, c.garrisonIds, c.charId, c.upgradeNum], [[], [], null, c.isGolden ? 0 : 3], c.chessId);
    }
    assert.deepEqual(chess[s.goldenId].status, { phase: 2, level: 60, skillLevel: 7, equipLevel: s.tier === 6 ? 3 : 1 });
  }
});

test('DIY: no prototype picks on this server — prototypes / locked empty at both tiers; a prototype composes into no slot', () => {
  const { prototypes, locked } = backups.diy;
  assert.deepEqual(prototypes, { 5: [], 6: [] });
  assert.deepEqual(locked, { 5: {}, 6: {} });
  const data = { chess, backups };
  for (const [id, s] of Object.entries(backups.diy.slots)) {
    for (const slot of [chess[id], chess[s.goldenId]]) {
      for (const p of [...ELITES, ...RESERVES]) {
        assert.equal(lockedSelection(data, s.tier, p), null, `${slot.chessId} ${p}: no locked selection`);
        assert.equal(diyRecordOf(slot, { charId: p }, data), null, `${slot.chessId} ${p}: not a pick`);
        assert.equal(diyRecordOf(slot, { charId: p, skillIndex: 0 }, data), null, `${slot.chessId} ${p}: not a pick with a skill either`);
      }
    }
  }
  // the prototypes stay units: the 补位 stand-ins (the 「干员持有」 ownership feature fields them)
  for (const p of [...ELITES, ...RESERVES]) assert.ok(backups.units[p]?.standsIn.length, `${p}: still a stand-in unit`);
  assert.equal(diyRecordOf(chess.chess_char_5_01_a, { charId: 'char_2027_wang', skillIndex: 0 }, data), null, 'not a DIY slot');
});

test('DIY: the 5 owned 6★ picks (shared/local-diy.js) — a form at every slot status with all three skills, every module at stage 1 and 3, their summons', () => {
  const { ownedPool } = backups.diy;
  assert.deepEqual(ownedPool, [...LOCAL_DIY_PICKS], 'exactly our five, in the picker\'s order');
  assert.deepEqual(Object.keys(backups.units), [...ELITES.concat(RESERVES).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), ...LOCAL_DIY_PICKS],
    'the 17 stand-ins, then our five — no unit for anyone else');
  let summoners = 0;
  for (const id of ownedPool) {
    const u = backups.units[id];
    assert.ok(u, `${id}: unit`);
    assert.deepEqual([u.charId, u.rarity, u.isNotObtainable, u.standsIn], [id, 6, false, []], `${id}: identity`);
    assert.ok(u.name && u.profession && u.subProfessionId && u.subProfessionName && u.position, `${id}: identity`);
    assert.ok(u.assets.avatar === id && u.assets.spine === id && u.assets.avatarGolden === `${id}_2` && u.assets.portraitGolden === `${id}_2`, `${id}: assets (E2 art on the elite form)`);
    assert.deepEqual(Object.keys(u.forms), ['2/1/4/0', '2/60/7/1', '2/60/7/3'], `${id}: forms`);
    const advanced = Object.keys(u.moduleNames).filter((m) => u.moduleNames[m].typeName !== 'ORIGINAL');
    let summons = false;
    for (const [key, f] of Object.entries(u.forms)) {
      const label = `${id}@${key}`;
      for (const k of STAT_KEYS) assert.ok(isFiniteNum(f.stats[k]), `${label}: stats.${k}`);
      assert.ok(f.stats.maxHp > 0 && f.stats.bat > 0 && Array.isArray(f.rangeGrid) && f.rangeGrid.length > 0, `${label}: stats / range`);
      assert.ok(typeof f.trait?.desc === 'string' && f.trait.desc.length > 0 && Array.isArray(f.talents), `${label}: trait / talents`);
      assert.deepEqual(f.skills.map((s) => [s.index, s.level]), [0, 1, 2].map((i) => [i, f.status.skillLevel]), `${label}: every skill at the slot's skill rank`);
      for (const s of f.skills) assert.ok(typeof s.trigger?.rule === 'string' && !('isDefault' in s), `${label} ${s.skillId}: trigger, no selection`);
      if (f.status.equipLevel === 0) assert.equal(f.modules, undefined, `${label}: no module phase on the normal form`);
      else assert.deepEqual(f.modules.map((m) => [m.uniEquipId, m.level]), advanced.map((m) => [m, f.status.equipLevel]), `${label}: every module at the stage`);
      for (const t of f.tokens) {
        summons = true;
        const rec = backups.tokens[t];
        assert.ok(rec && rec.kind === 'summon' && rec.owners.includes(`${id}@${key}`), `${label}: summon ${t}`);
        const v = rec.variants[`${id}@${key}`];
        assert.ok(v.stats && v.skill !== undefined && Array.isArray(v.sources), `${label}: ${t} variant`);
        assert.deepEqual(Object.keys(v.bySkill || {}).map(Number), [1, 2], `${label}: ${t} per other skill`);
        if (f.status.equipLevel > 0 && f.modules.length) assert.deepEqual(Object.keys(v.byModule), f.modules.map((m) => m.uniEquipId), `${label}: ${t} per module`);
      }
    }
    if (summons) summoners++;
  }
  assert.equal(summoners, 2, 'owned picks with summons: 望 (棋子), 维什戴尔 (魂灵之影)');
  assert.deepEqual(Object.keys(backups.tokens).sort(), ['token_10035_wisdel_wward', 'token_10064_wang_stone1']);
  for (const [id, rec] of Object.entries(backups.tokens)) {
    assert.deepEqual(Object.keys(rec.variants), rec.owners, `${id}: owners = variant keys`);
    for (const o of rec.owners) assert.ok(/^char_\w+@\d+\/\d+\/\d+\/\d+$/.test(o) && ownedPool.includes(o.split('@')[0]), `${id}: owner ${o}`);
  }
  // spot checks (zh_CN client data): 望 E2 Lv60 = 1375 HP / 553 ATK (+ 攻击力+27 at full potential: 580), TRP-X stage 1 HP +100 ATK +36; her 棋子 placeable,
  // made by a talent and a skill; 维什戴尔's 魂灵之影 by a talent (not a hand piece)
  const wang = backups.units.char_2027_wang.forms;
  assert.deepEqual([wang['2/60/7/1'].stats.maxHp, wang['2/60/7/1'].stats.atk], [1375, 580]);
  assert.deepEqual(wang['2/60/7/1'].modules.find((m) => m.typeName === 'TRP-X').attr, { maxHp: 100, atk: 36 });
  const stone = backups.tokens.token_10064_wang_stone1;
  assert.deepEqual([stone.placeable, stone.variants['char_2027_wang@2/60/7/3'].sources], [true, ['talent', 'skill', 'display']]);
  const shade = backups.tokens.token_10035_wisdel_wward;
  assert.deepEqual([shade.placeable, shade.variants['char_1035_wisdel@2/60/7/3'].sources], [false, ['talent', 'display']]);
});

test('DIY: the owned-6★ pool and the faction → bond rule (mainPower + every subPower vs powerIdList, else 协防干员)', () => {
  const { ownedPool, operators } = backups.diy;
  const roster = new Set(base.map((c) => c.charId).filter(Boolean));
  assert.equal(ownedPool.length, 5);
  for (const id of ownedPool) {
    assert.ok(!roster.has(id), `${id}: a roster operator is never a pick`);
    assert.deepEqual([operators[id].rarity, operators[id].obtainable], [6, true], id);
  }
  assert.deepEqual(Object.keys(operators), ownedPool, 'an operators entry for every pick and no one else');
  assert.equal(backups.diy.excluded, undefined, 'no collab exclusion list: the pool is our five');
  const core = Object.values(bonds).filter((b) => b.isCore && b.powerIdList.length);
  assert.equal(core.length, 8);
  for (const [id, o] of Object.entries(operators)) {
    const hit = core.filter((b) => b.powerIdList.some((p) => o.powers.includes(p))).map((b) => b.bondId);
    assert.deepEqual(o.bonds, hit.length ? hit : [config.economy.fallbackBondId], `${id}: bonds from powers`);
  }
  assert.deepEqual(Object.fromEntries(ownedPool.map((id) => [id, operators[id].bonds])), {
    char_2027_wang: ['yanShip'], char_1050_chen3: ['yanShip'], char_1035_wisdel: ['emptyShip'], char_4182_oblvns: ['emptyShip'], char_4132_ascln: ['emptyShip'],
  }, '望 / 赤刃明霄陈 炎, the others 协防干员');
});

test('DIY: powers and the owned pool re-derived from character_table', { skip: !HAS_CACHE && 'no .cache/gamedata' }, () => {
  const CT = raw('character_table');
  const act = raw('activity_table').activity.AUTOCHESS_SEASON.act2autochess;
  const roster = new Set(Object.values(act.charShopChessDatas).map((r) => r.charId).filter(Boolean));
  // each of our five is a legal pick of the excel: an obtainable 6★ outside the chess pool
  for (const id of backups.diy.ownedPool) {
    const c = CT[id];
    assert.ok(c && c.rarity === 'TIER_6' && !['TOKEN', 'TRAP'].includes(c.profession) && !c.isNotObtainable && !roster.has(id), `${id}: legal`);
  }
  for (const [id, o] of Object.entries(backups.diy.operators)) {
    const c = CT[id];
    const want = [...new Set([c.mainPower, ...(c.subPower || [])].flatMap((p) => [p?.nationId, p?.groupId, p?.teamId]).filter(Boolean))];
    assert.deepEqual(o.powers, want, `${id}: powers`);
  }
});

test('composeUnitRecord: identity from the chess, everything else from the unit (no field of the replaced operator leaks)', () => {
  const c = chess.chess_char_6_17_b;   // 耀骑士临光 (summons “耀阳”, modules) → 郁金香
  const r = standInRecord(c, backups);
  assert.equal(r.charId, 'char_608_acpion');
  assert.deepEqual(r.tokens, [], 'the replaced operator\'s summons are gone');
  assert.ok(r.modules.every((m) => m.uniEquipId.endsWith('_acpion')), 'only the stand-in\'s modules');
  assert.ok(r.skills.every((s) => s.skillId.startsWith('skchr_acpion_')), 'only the stand-in\'s skills');
  assert.notDeepEqual(r.talents, c.talents);
  assert.equal(composeUnitRecord(c, null, null, { skillIndex: 0 }), null);
  assert.equal(standInRecord({ ...c, status: { ...c.status, level: 2 } }, backups), null, 'no form for an unknown status');
});
