// test/diy.test.js — the 自选 rules of shared/diy.js over the real data (data/chess.json, data/backups.json; DATA.md §18):
// the legal picks per tier (diyPool, with and without the kit registry: this server's five, shared/local-diy.js — no
// prototype since the hard fork from 0.2.0), one pick against a slot (checkDiyPick: an owned operator's choice of skill and
// module at the slot's stage; a prototype / reserve is refused), the composed record (diyRecord: the slot's identity, no
// 特质, derived bonds, the operator's body at the slot form) and a whole roster (validateDiyPicks). Research 0.2.0 §2; the
// owner's decisions of 2026-10-05.
// Run: node --test test/diy.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diyPool, diySlot, diySlotIds, checkDiyPick, diyRecord, diyRecordOf, validateDiyPicks, lockedSelection, diyTokenOwner, isDiyModule, DIY_TIERS } from '../shared/diy.js';
import { unitForm, composeUnitRecord } from '../shared/standIn.js';
import { composeStats, composeTalents } from '../shared/loadoutRecord.js';
import { normalizeChess, resolveLoadout, loadoutRecord } from '../server/sim/simdata.js';
import { KITTED_CHARS, OPERATOR_KITS } from '../server/sim/content/kits/index.js';
import { LOCAL_DIY_PICKS } from '../shared/local-diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const chess = load('chess');
const backups = load('backups');
const DATA = { chess, backups };
const { ownedPool, prototypes } = backups.diy;
const ELITES = ['char_608_acpion', 'char_609_acguad', 'char_610_acfend', 'char_611_acnipe', 'char_612_accast', 'char_613_acmedc', 'char_614_acsupo', 'char_615_acspec', 'char_617_sharp2'];
const RESERVES = ['char_600_cpione', 'char_601_cguard', 'char_602_cdfend', 'char_603_csnipe', 'char_604_ccast', 'char_605_cmedic', 'char_606_csuppo', 'char_607_cspec'];
const WANG = 'char_2027_wang';
const ASCLN = 'char_4132_ascln';   // 阿斯卡纶: two advanced modules (AMB-X, AMB-Y)
const T5 = 'chess_char_5_diy1_a', T5B = 'chess_char_5_diy2_a', T6 = 'chess_char_6_diy1_a', T6B = 'chess_char_6_diy2_a';

test('slots: two per tier (5, 6), each with its elite twin', () => {
  assert.deepEqual(DIY_TIERS, [5, 6]);
  assert.deepEqual(diySlotIds(DATA), [T5, T5B, T6, T6B]);
  assert.deepEqual(diySlot('chess_char_6_diy2_b', DATA) && { ...diySlot('chess_char_6_diy2_b', DATA), normal: undefined, golden: undefined },
    { baseId: T6B, goldenId: 'chess_char_6_diy2_b', tier: 6, shopLevel: 6, elite: true, normal: undefined, golden: undefined });
  assert.deepEqual([T5, T5B, T6, T6B].map((id) => diySlot(id, DATA).shopLevel), [5, 5, 6, 6], 'shopLevelDisplayDataDict: the 调度中心 level that lists the slot');
  assert.equal(diySlot('chess_char_5_01_a', DATA), null, 'not a slot');
  assert.equal(diyTokenOwner(WANG, chess.chess_char_6_diy1_b.status), 'char_2027_wang@2/60/7/3');
});

test('diyPool: both tiers = our owned 6★ picks (shared/local-diy.js), no prototype, no preset; with the kit registry only kitted operators', () => {
  assert.deepEqual(prototypes, { 5: [], 6: [] });
  const p5 = diyPool(5, { data: DATA }), p6 = diyPool(6, { data: DATA });
  assert.deepEqual(p5, [...LOCAL_DIY_PICKS]);
  assert.deepEqual(p6, [...LOCAL_DIY_PICKS]);
  const roster = new Set(Object.values(chess).map((c) => c.charId).filter(Boolean));
  for (const id of p5) assert.ok(!roster.has(id), id);
  assert.deepEqual(diyPool(4, { data: DATA }), [], 'no 自选 slot at tier 4');
  // the kit registry holds the stand-ins too (KITTED_CHARS), but only a pick of the data is offered; every operator kit
  // is one of the five
  assert.deepEqual([...ownedPool].sort(), Object.keys(OPERATOR_KITS).sort(), 'an operator kit for every pick and no other');
  for (const id of [...ELITES, ...RESERVES]) assert.ok(!p5.includes(id) && !p6.includes(id), `${id}: a stand-in, not a pick`);
  assert.deepEqual(diyPool(5, { data: DATA, kitted: KITTED_CHARS }), [...LOCAL_DIY_PICKS]);
  assert.deepEqual(diyPool(6, { data: DATA, kitted: KITTED_CHARS }), [...LOCAL_DIY_PICKS]);
  assert.deepEqual(diyPool(6, { data: DATA, kitted: (id) => id === WANG }), [WANG], 'a predicate works too');
  assert.deepEqual(diyPool(5, { data: DATA, kitted: [] }), [], 'nothing kitted, nothing offered');
});

test('checkDiyPick: an owned 6★ chooses any of its 3 skills and any module of its elite form at the slot\'s stage (or none); illegal picks are refused', () => {
  for (const slot of [T5, T6]) {
    for (const s of [0, 1, 2]) {
      for (const m of [undefined, null, 'none', 'uniequip_002_ascln', 'uniequip_003_ascln']) {
        const c = checkDiyPick(slot, { charId: ASCLN, skillIndex: s, uniEquipId: m }, DATA);
        assert.deepEqual(c, { ok: true, pick: { charId: ASCLN, skillIndex: s, uniEquipId: m && m !== 'none' ? m : null } }, `${slot} S${s + 1} ${m}`);
      }
    }
  }
  assert.equal(lockedSelection(DATA, 5, WANG), null, 'an owned operator has no lock');
  const bad = [
    [T5, { charId: ASCLN }, /needs a skill index/],
    [T5, { charId: ASCLN, skillIndex: 3 }, /no skill 3/],
    [T5, { charId: ASCLN, skillIndex: 0, uniEquipId: 'uniequip_001_ascln' }, /no module uniequip_001_ascln/],
    [T5, { charId: WANG, skillIndex: 0, uniEquipId: 'uniequip_002_ascln' }, /no module/],
    [T5, { charId: 'char_609_acguad' }, /not a tier-5 自选 pick/],
    [T6, { charId: 'char_609_acguad', skillIndex: 2 }, /not a tier-6 自选 pick/],
    [T5, { charId: 'char_601_cguard' }, /not a tier-5/],
    [T5, { charId: 'char_102_texas', skillIndex: 0 }, /not a tier-5/],
    [T6, { charId: 'char_1012_skadi2', skillIndex: 0 }, /not a tier-6/],
    [T5, { charId: 'char_112_siege', skillIndex: 0 }, /not a tier-5/],
    [T5, null, /bad pick/],
    [T5, { charId: 42 }, /bad pick/],
    ['chess_char_5_01_a', { charId: WANG, skillIndex: 0 }, /not a 自选 slot/],
  ];
  for (const [slot, pick, re] of bad) assert.match(checkDiyPick(slot, pick, DATA).error, re, JSON.stringify(pick));
});

test('validateDiyPicks: a roster never carries a module of another game mode — 集成战略 ISW-A / SO-A / SO-B, 生息演算 RA-A [ASSUMED, the owner\'s decision of 2026-10-05 for ISW-A]; the record still composes it', () => {
  // our picks have none: every module of theirs is a legal roster pick
  for (const charId of ownedPool) {
    for (const [slot, key] of [[T5, '2/60/7/1'], [T6, '2/60/7/3']]) {
      for (const mod of backups.units[charId].forms[key]?.modules ?? []) {
        assert.ok(isDiyModule(mod), `${charId} ${mod.uniEquipId} (${mod.typeName})`);
        const v = validateDiyPicks({ [slot]: { charId, skillIndex: 0, uniEquipId: mod.uniEquipId } }, { data: DATA });
        assert.ok(v.ok, `${charId} ${mod.uniEquipId}: ${v.detail}`);
      }
    }
  }
  // the rule on synthetic data: 阿斯卡纶's AMB-Y relabelled as each mode-only type
  for (const [typeName, mode] of [['ISW-A', '集成战略'], ['SO-A', '集成战略'], ['SO-B', '集成战略'], ['RA-A', '生息演算']]) {
    const b2 = structuredClone(backups);
    for (const f of Object.values(b2.units[ASCLN].forms)) for (const m of f.modules ?? []) if (m.uniEquipId === 'uniequip_003_ascln') m.typeName = typeName;
    const data = { chess, backups: b2 };
    const pick = { charId: ASCLN, skillIndex: 0, uniEquipId: 'uniequip_003_ascln' };
    assert.ok(checkDiyPick(T6, pick, data).ok, `${typeName}: a legal record (the sim and the kits field it)`);
    assert.ok(diyRecord(T6, pick, { elite: true, data }), `${typeName}: the record still composes`);
    const v = validateDiyPicks({ [T6]: pick }, { data });
    assert.match(v.detail || '', new RegExp(`module of another game mode \\(${typeName}, ${mode}\\)`), typeName);
    assert.equal(isDiyModule(b2.units[ASCLN].forms['2/60/7/3'].modules.find((m) => m.uniEquipId === 'uniequip_003_ascln')), false);
    assert.ok(validateDiyPicks({ [T6]: { ...pick, uniEquipId: 'uniequip_002_ascln' } }, { data }).ok, `${typeName}: the other module is fine`);
  }
});

test('diyRecord: the slot\'s identity (tier, price, merge, status), no 特质, derived bonds, the operator\'s body at the slot form; module active on the elite only, stage 1 / 3', () => {
  const cases = [[T5, false, '2/1/4/0', 0], [T5, true, '2/60/7/1', 1], [T6, false, '2/1/4/0', 0], [T6, true, '2/60/7/3', 3]];
  for (const [slotId, elite, key, stage] of cases) {
    for (const mod of [null, 'uniequip_002_ascln', 'uniequip_003_ascln']) {
      const r = diyRecord(slotId, { charId: ASCLN, skillIndex: 1, uniEquipId: mod }, { elite, data: DATA });
      const slot = chess[elite ? backups.diy.slots[slotId].goldenId : slotId];
      const form = backups.units[ASCLN].forms[key];
      const label = `${slot.chessId} ${mod}`;
      assert.deepEqual([r.chessId, r.baseId, r.isGolden, r.tier, r.price, r.sellPrice, r.upgradeNum, r.chessType, r.isDiy], [slot.chessId, slotId, elite, slot.tier, 4, 1, elite ? 0 : 3, 'DIY', true], label);
      assert.deepEqual([r.charId, r.diyFor, r.name, r.profession, r.rarity], [ASCLN, slotId, '阿斯卡纶', 'SPECIAL', 6], label);
      assert.deepEqual([r.garrisonIds, r.bonds, r.standInFor], [[], ['emptyShip'], undefined], `${label}: no 特质, 协防干员 (no core bond meets her factions)`);
      assert.deepEqual(r.status, slot.status, label);
      assert.deepEqual([r.skill.skillId, r.skill.level], ['skchr_ascln_2', elite ? 7 : 4], `${label}: S2 at the slot's rank`);
      assert.deepEqual(r.skills.filter((s) => s.isDefault).map((s) => s.index), [1]);
      const m = mod && elite ? form.modules.find((x) => x.uniEquipId === mod) : null;
      assert.deepEqual(r.stats, composeStats(form.stats, m?.attr), `${label}: stats`);
      assert.deepEqual(r.talents, composeTalents(form.talents, m?.talentChanges), `${label}: talents`);
      assert.deepEqual(r.trait, m?.traitOverride ?? form.trait, `${label}: trait`);
      assert.equal(!!r.module?.active, !!m, `${label}: module active`);
      if (m) assert.equal(r.module.level, stage, `${label}: stage ${stage}`);
      if (elite) assert.deepEqual(r.modules.map((x) => [x.uniEquipId, x.level, x.isDefault]), form.modules.map((x) => [x.uniEquipId, stage, x.uniEquipId === mod]), label);
      assert.equal(r.assets.avatar, elite ? `${ASCLN}_2` : ASCLN, `${label}: E2 art on the elite`);
      // chess-shaped: the loadout machinery and the sim read it unchanged
      assert.equal(loadoutRecord(r, resolveLoadout(r, null)), r);
      const def = normalizeChess(r);
      assert.deepEqual([def.id, def.baseId, def.charId, def.diyFor, def.golden, def.tier, def.skill.id], [slot.chessId, slotId, ASCLN, slotId, elite, slot.tier, 'skchr_ascln_2'], label);
    }
  }
  // 望 gets 炎 from her factions; the composed record equals composeUnitRecord's
  assert.deepEqual(diyRecord(T5, { charId: WANG, skillIndex: 0 }, { data: DATA }).bonds, ['yanShip']);
  const slot = chess.chess_char_5_diy2_b;
  const { diyFor, ...rest } = diyRecordOf(slot, { charId: ASCLN, skillIndex: 2, uniEquipId: 'uniequip_003_ascln' }, DATA);
  assert.equal(diyFor, T5B);
  assert.deepEqual(rest, composeUnitRecord(slot, backups.units[ASCLN], unitForm(backups, ASCLN, slot.status), { skillIndex: 2, moduleId: 'uniequip_003_ascln', bonds: ['emptyShip'] }));
  assert.equal(diyRecord(T6, { charId: 'char_609_acguad' }, { data: DATA }), null, 'a prototype ⇒ null');
  assert.equal(diyRecordOf(chess.chess_char_5_01_a, { charId: WANG, skillIndex: 0 }, DATA), null, 'not a slot record');
});

test('validateDiyPicks: an owned operator fills one slot, the picks of a tier differ; prototypes and unkitted operators are refused', () => {
  const wang = { charId: WANG, skillIndex: 2, uniEquipId: 'uniequip_002_wang' };
  const ok = validateDiyPicks({ [T5]: wang, [T5B]: { charId: ASCLN, skillIndex: 0 }, [T6]: { charId: 'char_1050_chen3', skillIndex: 1, uniEquipId: 'none' }, [T6B]: null }, { data: DATA, kitted: KITTED_CHARS });
  assert.deepEqual(ok, { ok: true, picks: {
    [T5]: { charId: WANG, skillIndex: 2, uniEquipId: 'uniequip_002_wang' },
    [T5B]: { charId: ASCLN, skillIndex: 0, uniEquipId: null },
    [T6]: { charId: 'char_1050_chen3', skillIndex: 1, uniEquipId: null },
  } });
  assert.deepEqual(validateDiyPicks({}, { data: DATA }), { ok: true, picks: {} }, 'empty slots are fine');
  const err = (picks, opts = {}) => validateDiyPicks(picks, { data: DATA, ...opts });
  assert.match(err({ [T5]: wang, [T5B]: { ...wang, skillIndex: 0 } }).detail, /fills two tier-5 slots/);
  assert.match(err({ [T5]: { charId: WANG, skillIndex: 0 }, [T6]: { charId: WANG, skillIndex: 1 } }).detail, /an owned operator fills one slot/);
  assert.match(err({ [T5]: { charId: ASCLN, skillIndex: 0 } }, { kitted: KITTED_CHARS.filter((id) => id !== ASCLN) }).detail, /char_4132_ascln has no kit yet/);
  assert.match(err({ [T5]: wang }, { kitted: (id) => id !== WANG }).detail, /char_2027_wang has no kit yet/);
  assert.deepEqual(err({ [T5]: { charId: ASCLN, skillIndex: 0 } }).ok, true, 'without the registry every legal pick passes');
  assert.match(err({ chess_char_5_01_a: wang }).detail, /not a 自选 slot/);
  assert.match(err({ [T5]: { charId: 'char_609_acguad' } }).detail, /not a tier-5/, 'a prototype is no pick here');
  assert.match(err({ [T6]: { charId: 'char_602_cdfend' } }).detail, /not a tier-6/);
  assert.deepEqual(err('x'), { error: 'BAD_MSG', detail: 'bad 自选 picks' });
  assert.equal(err([wang]).error, 'BAD_MSG');
});
