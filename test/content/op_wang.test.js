// test/content/op_wang.test.js — 望 (char_2027_wang, 6★ 陷阱师; kit server/sim/content/kits/ops/op-wang.js, our 선발 kit
// that replaced upstream's) in every 自选 form — tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60,
// rank 7) with no module or TRP-X 兽形棋盒 at stage 1 (tier 5) / 3 (tier 6): the form's stats and module attributes, her
// 棋子 variant, the pick's legality and the hand count. Upstream's assertions of its own kit's mechanics are gone; her
// mechanics as this server plays them: test/local-patch-diy.test.js. Numbers from data/backups.json.
// Run: node --test test/content/op_wang.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks, diyRecord } from '../../shared/diy.js';
import { STONE } from '../../server/sim/content/kits/ops/op-wang.js';
import { getData } from '../../server/data.js';
import { GameData } from '../../server/match/gamedata.js';
import { diyGameData } from '../../server/match/player/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const WANG = 'char_2027_wang';
const FORMS = BACKUPS.units[WANG].forms;
const TOKREC = BACKUPS.tokens[STONE];
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const X = 'uniequip_002_wang';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const tokOf = (tier, elite, skill, mod) => {
  let v = TOKREC.variants[`${WANG}@${statusOf(tier, elite)}`];
  if (v.bySkill?.[skill]) v = { ...v, ...v.bySkill[skill] };
  if (mod && v.byModule?.[mod]) v = { ...v, ...v.byModule[mod] };
  return v;
};
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'),
  enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
  enemy_runner: enemyRec({ key: 'enemy_runner', hp: 1e9, speed: 1, mass: 0 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, X].map((m) => [t, true, m]))];

/** 望 as uid 1 at (row, col) facing RIGHT; `stones` = the tiles of her placed 棋子 (uids 2, 3 …). */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 12, col = 3, stones = [], seed = 5, dp = 100, others = [] } = {}) {
  const op = { uid: 1, diy: { slot: SLOT[tier], charId: WANG, skillIndex: skill, uniEquipId: mod }, elite, row, col };
  const pieces = stones.map(([r, c], i) => ({ uid: 2 + i, kind: 'token', tokenId: STONE, ownerUid: 1, row: r, col: c }));
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'ammoUsed'], captureNoisy: true,
    units: [op, ...pieces, ...others],
  });
  h.b.players[0].dp = dp;
  h.step();
  const u = h.unit(1);
  return { h, u, st: h.b.allyUnits.filter((a) => a.kind === 'token' && a.defId === STONE) };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

test('望 in every 自选 form: her kit, stats + module attributes, 3-3, blocks 1, ranged physical hitting air, ground-targetable, 炎, no 特质; S1 / S2 SP_FULL, S3 the data\'s ACTIVE_RANGE; her 棋子: untargetable, no attack, the variant\'s cost / redeploy time and skill', () => {
  assert.equal(OPERATOR_KITS[WANG], KITS[WANG]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u, st } = field({ tier, elite, mod, skill, stones: [[9, 6]] });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [WANG, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat], [1, 'ranged', true, 'phys', 0.85], `${label(f)}: 陷阱师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-3`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip'], []], `${label(f)}: bonds / 特质`);
      assert.equal(u.skill.rule, ['SP_FULL', 'SP_FULL', 'ACTIVE_RANGE'][skill], `${label(f)}: trigger`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      const v = tokOf(tier, elite, skill, elite ? mod : null);
      const s = st[0];
      assert.ok(s.alive && s.deployed && s.ownerUnit === u, `${label(f)}: the 棋子 deploys with the board`);
      assert.deepEqual([s.base.cost, s.base.respawnTime, s.def.skill.id, !!s.s.flags.untargetable, s.s.blockCnt, !!s.profile.noAttack],
        [v.stats.cost, v.stats.respawnTime, v.skill.skillId, true, 0, true], `${label(f)}: 棋子`);
      assert.equal(s.base.cost, elite && mod === X ? 2 : 3, `${label(f)}: TRP-X 部署费用更低（-1）`);
      assert.deepEqual([v.stats.deployLimit], [elite && mod === X ? 8 : 7], `${label(f)}: TRP-X 可同时部署的陷阱数量提升（+1）`);
      done(h);
    }
  }
  assert.deepEqual(formOf(6, true).skills.map((s) => [s.skillType, s.trigger.rule]), [['AUTO', 'DEFAULT'], ['AUTO', 'DEFAULT'], ['MANUAL', 'ACTIVE_RANGE']]);
  assert.deepEqual([modOf(5, X).attr, modOf(6, X).attr], [{ maxHp: 100, atk: 36 }, { maxHp: 150, atk: 60 }]);
  const data = { chess: CHESS, backups: BACKUPS };
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(WANG), `tier ${t}`);
  assert.equal(validateDiyPicks({ [SLOT[6]]: { charId: WANG, skillIndex: 2, uniEquipId: X } }, { data, kitted: KITTED_CHARS }).ok, true);
});

test('the hand: deploying her in prep brings 7 棋子 at full potential (潜能 3 「第一天赋效果增强」; TRP-X "可同时部署的陷阱数量提升": 8) — the match\'s data view reads the module variant\'s deploy limit', () => {
  const gd = new GameData(getData({ log: { warn() {}, error() {}, info() {} } }), 'mode_multi_hard');
  const data = { chess: CHESS, backups: BACKUPS };
  for (const [tier, elite, mod, n] of [[5, false, null, 7], [6, false, null, 7], [5, true, null, 7], [6, true, null, 7], [5, true, X, 8], [6, true, X, 8]]) {
    const slot = elite ? SLOT[tier].replace(/_a$/, '_b') : SLOT[tier];
    const rec = diyRecord(SLOT[tier], { charId: WANG, skillIndex: 1, uniEquipId: mod }, { elite, data });
    const view = diyGameData(gd, new Map([[slot, rec]]));
    assert.deepEqual(view.placeableTokens(slot, { skillIndex: 1, moduleId: elite ? mod : null }), [{ tokenId: STONE, count: n }], `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`);
  }
});
