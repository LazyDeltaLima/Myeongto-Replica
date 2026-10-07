// test/content/diy.test.js — 自选 pieces in battle (DATA.md §18, docs/SIM.md §12): simdata getChess(slotId, { diy }) /
// getDiy, the PlayerBattleInput `diy` field through Battle, the BattleSpec path and the per-battle loadout view, the
// kit lookup by charId (an owned 6★'s operator kit; no prototype is a pick on this server — shared/local-diy.js), the
// summons of an owned pick (data/backups.json `tokens`, getToken with the pick as the owner's loadout) and the wire
// info. Our five kits themselves: test/local-patch-diy.test.js.
// Run: node --test test/content/diy.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants, flatStage, flatRoutes } from '../helpers/battleHarness.js';
import { getDefaultSource, DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { unitInfo } from '../../server/sim/snapshot.js';
import { isDiyDef, kitOf } from '../../server/sim/content/index.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const BACKUPS = load('backups');
const ASCLN = 'char_4132_ascln', WANG = 'char_2027_wang', CHEN3 = 'char_1050_chen3', WISDEL = 'char_1035_wisdel';
const T5 = 'chess_char_5_diy1_a', T6 = 'chess_char_6_diy1_a';
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy') };

function battle(units, o = {}) {
  return makeBattle({ defs: { enemies: ENEMIES }, units, timeLimit: 300, autoFinish: false, seed: o.seed ?? 7, flags: { dpPerSec: 0 }, ...o });
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('getChess(slotId, { diy }): the 自选 def — the slot\'s ids / tier, the pick\'s body, skill, module and bonds; diyFor, charId, loadout.diy, tokenOwner; cached; null for an illegal pick', () => {
  const ds = getDefaultSource();
  const pick = { charId: ASCLN, skillIndex: 0, uniEquipId: 'uniequip_003_ascln' };
  const d = ds.getChess('chess_char_6_diy1_b', { diy: pick });
  assert.deepEqual([d.id, d.baseId, d.golden, d.tier, d.charId, d.diyFor, d.name, d.profession], ['chess_char_6_diy1_b', T6, true, 6, ASCLN, T6, '阿斯卡纶', 'SPECIAL']);
  assert.deepEqual([d.bonds, d.raw.garrisonIds, d.skill.id, d.raw.module.id, d.raw.module.level, d.raw.module.active], [['emptyShip'], [], 'skchr_ascln_1', 'uniequip_003_ascln', 3, true]);
  assert.deepEqual(d.loadout.diy, pick);
  assert.equal(d.tokenOwner, 'char_4132_ascln@2/60/7/3');
  assert.ok(isDiyDef(d) && Object.isFrozen(d));
  assert.equal(ds.getChess('chess_char_6_diy1_b', { diy: { ...pick } }), d, 'cached per (id, pick)');
  assert.equal(ds.getChess(T6, { diy: { charId: 'char_601_cguard' } }), null, 'a reserve is no pick');
  assert.equal(ds.getChess(T5, { diy: { charId: 'char_617_sharp2' } }), null, 'a prototype is no pick here');
  assert.equal(ds.getChess(T5, { diy: { charId: ASCLN } }), null, 'an owned pick needs a skill index');
  assert.equal(ds.getChess('chess_char_5_01_a', { diy: pick }), null, 'not a slot');
  const normal = ds.getChess(T5, { diy: { charId: WANG, skillIndex: 2, uniEquipId: 'uniequip_002_wang' } });
  assert.deepEqual([normal.skill.id, normal.bonds, normal.raw.module.active], ['skchr_wang_3', ['yanShip'], false], '望 on the normal form: S3, her module inactive');
});

test('a battle fields 自选 pieces by their kit: an owned 6★\'s operator kit, keyed by its charId only; an illegal pick fields nothing', () => {
  // an injected kit keyed by the operator's charId — what kits/ops/op-<codename>.js registers (KITS[charId])
  const asclnKit = () => ({ skills: { skchr_ascln_2: { kind: 'charges' } }, talents: [], diyProbe: true });
  const h = battle([
    { diy: { slot: 5, charId: ASCLN, skillIndex: 1 }, row: 10, col: 3 },
    { diy: { slot: 'chess_char_5_diy2_a', charId: WISDEL, skillIndex: 2, uniEquipId: 'uniequip_002_wisdel' }, elite: true, row: 10, col: 5 },
    { diy: { slot: T6, charId: 'char_617_sharp2' }, elite: true, row: 10, col: 7 },          // a prototype: never fielded
    { diy: { slot: 'chess_char_6_diy2_a', charId: 'char_601_cguard' }, row: 11, col: 5 },   // a reserve: never fielded
  ], { kits: { [ASCLN]: asclnKit, chess_char_5_diy1_a: () => { throw new Error('a 自选 piece never runs a kit of its slot id'); } } });
  h.step();
  const [ascln, wisdel] = [1, 2].map((uid) => h.unit(uid));
  assert.deepEqual(h.b.allyUnits.filter((x) => x.kind === 'op').map((x) => x.def.charId), [ASCLN, WISDEL], 'a prototype / reserve pick fields nothing');
  assert.deepEqual([ascln.defId, ascln.def.charId, ascln.skill.id, ascln.kit.diyProbe, ascln.kit.skillSource], [T5, ASCLN, 'skchr_ascln_2', true, 'skills']);
  assert.equal(kitOf(ascln.def, { [T5]: 'slot', chess_char_5_diy1: 'bare', [ASCLN]: 'mine' }), 'mine', 'kitOf: by charId only');
  assert.equal(kitOf(ascln.def, { [T5]: 'slot' }), undefined);
  assert.deepEqual([wisdel.defId, wisdel.def.charId, wisdel.skill.id, !!wisdel.kit.generic, wisdel.kit.skillSource, wisdel.def.raw.module.level],
    ['chess_char_5_diy2_b', WISDEL, 'skchr_wisdel_3', false, 'skills', 1], '维什戴尔: her own operator kit, BOM-X stage 1 at tier 5');
  done(h);
});

test('BattleSpec path: buildBattleSpec keeps a well-formed `diy` (and drops a malformed one); the spec battle fields the 自选 def, with the per-unit pick exact when two players fill one slot id differently', () => {
  const players = [
    { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, bonds: {}, units: [{ uid: 1, kind: 'chess', chessId: 'chess_char_5_diy1_b', diy: { charId: ASCLN, skillIndex: 2, uniEquipId: 'uniequip_002_ascln', extra: 1 }, row: 10, col: 4 }] },
    { playerId: 'p2', seat: 1, side: 'L', colOffset: 0, bonds: {}, units: [
      { uid: 1, kind: 'chess', chessId: 'chess_char_5_diy1_b', diy: { charId: CHEN3, skillIndex: 1 }, row: 11, col: 4 },
      { uid: 2, kind: 'chess', chessId: 'chess_char_5_diy2_a', diy: { charId: 'not ok!' }, row: 12, col: 4 },
    ] },
  ];
  const spec = buildBattleSpec({ battleId: 'diy', kind: 'normal', seed: 3, stageId: null, players, spawns: [], routes: flatRoutes(), timeLimit: 30 });
  assert.deepEqual(spec.players[0].units[0].diy, { charId: ASCLN, skillIndex: 2, uniEquipId: 'uniequip_002_ascln' }, 'reduced to the pick');
  assert.deepEqual(spec.players[1].units[0].diy, { charId: CHEN3, skillIndex: 1 });
  assert.equal('diy' in spec.players[1].units[1], false, 'a malformed pick is dropped');
  // the same players through the harness (a flat stage; the spec carries no stage object): each unit its own pick
  const h = makeBattle({ defs: { enemies: ENEMIES }, players: spec.players, timeLimit: 30, autoFinish: false, stage: flatStage(), flags: { dpPerSec: 0 } });
  h.step();
  const mine = h.b.allyUnits.find((u) => u.ownerId === 'p1' && u.uid === 1);
  const theirs = h.b.allyUnits.find((u) => u.ownerId === 'p2' && u.uid === 1);
  assert.deepEqual([mine.def.charId, mine.skill.id, theirs.def.charId, theirs.skill.id], [ASCLN, 'skchr_ascln_3', CHEN3, 'skchr_chen3_2']);
  assert.ok(h.b.data.loadoutConflicts.includes('chess_char_5_diy1_b'), 'the id-only view notes the conflict; each unit still has its own def');
  assert.equal(h.b.allyUnits.some((u) => u.ownerId === 'p2' && u.uid === 2), false, 'a DIY slot without a pick fields nothing');
  done(h);
  // and createBattleFromSpec on a real stage builds the same 自选 def
  const stageId = Object.keys(load('stages')).find((id) => load('stages')[id].kind !== 'unite');
  const b = createBattleFromSpec({ ...spec, stageId, routes: [] }, getDefaultSource(), { quiet: true });
  b.step();
  assert.deepEqual(b.allyUnits.filter((u) => u.kind === 'op').map((u) => [u.ownerId, u.def.charId, u.def.loadout.diy.skillIndex]), [['p1', ASCLN, 2], ['p2', CHEN3, 1]]);
});

test('summons of an owned pick: battle.tokenDef resolves the variant of its form and pick (望\'s 棋子 carry the pick\'s skill; 维什戴尔\'s 魂灵之影 is made by S3 too)', () => {
  const STONE = 'token_10064_wang_stone1', SHADE = 'token_10035_wisdel_wward';
  const h = battle([{ diy: { slot: 6, charId: WANG, skillIndex: 2, uniEquipId: 'uniequip_002_wang' }, elite: true, row: 10, col: 4 }]);
  h.step();
  const u = h.unit(1);
  assert.equal(u.def.tokenOwner, 'char_2027_wang@2/60/7/3');
  const v = BACKUPS.tokens[STONE].variants['char_2027_wang@2/60/7/3'];
  const t3 = h.b.tokenDef(STONE, u);
  assert.deepEqual([t3.id, t3.sources, t3.skill?.id], [STONE, ['talent', 'skill', 'display'], v.bySkill['2'].skill.skillId]);
  assert.equal(t3.skill?.id, 'sktok_wang_3', 'S3: the stones\' S3 skill');
  const stats = { ...v.stats, ...(v.byModule?.uniequip_002_wang?.stats ?? {}) };
  assert.deepEqual([t3.stats.maxHp, t3.stats.atk, t3.stats.def], [stats.maxHp, stats.atk, stats.def], 'the form\'s stats with the module\'s token attributes');
  assert.equal(h.b.producesToken(u, STONE), true);
  // the normal form (tier 5, no module, S1) is the form's own variant
  const h2 = battle([{ diy: { slot: 5, charId: WANG, skillIndex: 0 }, row: 10, col: 4 }]);
  h2.step();
  const n1 = h2.b.tokenDef(STONE, h2.unit(1));
  assert.deepEqual([n1.skill?.id, n1.stats.atk], ['sktok_wang_1', BACKUPS.tokens[STONE].variants['char_2027_wang@2/1/4/0'].stats.atk]);
  // 维什戴尔: S1 — talent-made only; S3 — also by the skill
  const h3 = battle([{ diy: { slot: 6, charId: WISDEL, skillIndex: 0 }, elite: true, row: 10, col: 4 }]);
  const h4 = battle([{ diy: { slot: 6, charId: WISDEL, skillIndex: 2 }, elite: true, row: 10, col: 4 }]);
  h3.step();
  h4.step();
  assert.deepEqual(h3.b.tokenDef(SHADE, h3.unit(1)).sources, ['talent', 'display']);
  assert.deepEqual(h4.b.tokenDef(SHADE, h4.unit(1)).sources, ['talent', 'skill', 'display']);
  done(h);
  done(h2);
  done(h3);
  done(h4);
});

test('wire info: a 自选 piece carries its pick (defId = the slot; spine / avatar = the operator\'s; no 补位 mark)', () => {
  const h = battle([{ diy: { slot: 5, charId: ASCLN, skillIndex: 2, uniEquipId: 'uniequip_002_ascln' }, elite: true, row: 10, col: 4 }]);
  h.step();
  const info = unitInfo(h.unit(1));
  assert.deepEqual([info.defId, info.spine, info.avatar, info.tier, info.golden, info.skillIndex, info.moduleId, info.standInFor],
    ['chess_char_5_diy1_b', ASCLN, `${ASCLN}_2`, 5, true, 2, 'uniequip_002_ascln', undefined]);
  assert.deepEqual(info.diy, { charId: ASCLN, skillIndex: 2, uniEquipId: 'uniequip_002_ascln' });
  const plain = battle([{ chessId: 'chess_char_1_02_a', row: 10, col: 4 }]);
  plain.step();
  assert.equal(unitInfo(plain.unit(1)).diy, undefined);
  done(h);
});

test('a DataSource without backups.json fields no 自选 piece (null def), and its plain DIY slot def is unchanged', () => {
  const ds = new DataSource({ chess: { [T5]: load('chess')[T5] } }, null);
  assert.equal(ds.getChess(T5, { diy: { charId: ASCLN, skillIndex: 0 } }), null);
  assert.equal(ds.getChess(T5).name, '甄选干员');
});
