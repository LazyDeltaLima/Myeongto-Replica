// test/match/diy-bonds.test.js — 0.2.0 自选编队: a 自选 piece is a member of each of its derived bonds (data/backups.json
// diy.operators[charId].bonds — its factions, else 协防; "甄选加入的干员会根据其实际阵营所属分配核心盟约…一个或数个", PRTS 卫戍协议：
// 盟约 下半/PRTS盟约记录) in every place membership is decided: the match's bond counts (bondsMeta through the player's
// data view — BOARD / BOARD_AND_DECK distinct pieces: the normal and elite copies of one slot count once; 绝技 counts a
// 自选 elite like any elite), the views (m.private / m.public bonds), the battle input's bond snapshot, and the sim's bond
// effects (they read the unit's def.bonds: 炎's ATK, 协防 ×1.2 / elite ×1.4). With this server's five picks
// (shared/local-diy.js): 望 and 赤刃明霄陈 are 炎, 维什戴尔, 丰川祥子 and 阿斯卡纶 协防.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { makeBattle, checkInvariants as checkBattle } from '../helpers/battleHarness.js';
import { DATA, makeMatch, legalTileFor } from './harness.js';

const REAL = { skip: !hasGeneratedData() };
const T5A = 'chess_char_5_diy1_a';
const T5B = 'chess_char_5_diy2_a';
const T6A = 'chess_char_6_diy1_a';
const WANG = 'char_2027_wang'; // 望: 炎
const CHEN = 'char_1050_chen3'; // 赤刃明霄陈: 炎
const WISDEL = 'char_1035_wisdel'; // 维什戴尔: 协防
const OBLVNS = 'char_4182_oblvns'; // 丰川祥子: 协防
const ASCLN = 'char_4132_ascln'; // 阿斯卡纶: 协防
const OPS = DATA.backups?.diy?.operators ?? {};

function soloMatch() {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', seats, seed: 21 }).start();
  h.toPrep(1);
  return h;
}
/** Slot `picks` for p_0 now and give it stock. */
function slot(h, picks) {
  const p0 = h.ps('p_0');
  assert.equal(p0.setDiy(picks), true);
  p0.initDiyStock(new Set());
  p0.recompute();
  return p0;
}
function deploy(h, ps, id) {
  const p = ps.acquireChess(id, { source: 'buy' });
  const t = legalTileFor(h.m, ps, p.id);
  assert.ok(t, `a tile for ${id}`);
  assert.deepEqual(h.m.handle(ps.playerId, { t: 'g.move', uid: p.uid, to: { area: 'board', row: t[0], col: t[1] } }), { ok: true });
  return p;
}

test('the derived bonds of the data: each pick its core bonds or 协防 — 望 / 赤刃明霄陈 炎, 克莱门莎 阿戈尔, 予愿安洁莉娜 叙拉古, 酒神 维多利亚, the others 协防; no prototype', REAL, () => {
  const core = new Set(Object.entries(DATA.bonds).filter(([, b]) => b && b.isCore).map(([id]) => id));
  for (const id of DATA.backups.diy.ownedPool) {
    const b = OPS[id].bonds;
    assert.ok(b.length >= 1, id);
    assert.ok((b.length === 1 && b[0] === 'emptyShip') || b.every((x) => core.has(x)), `${id}: ${b.join(', ')}`);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(OPS).map(([id, o]) => [id, o.bonds])), {
    [WANG]: ['yanShip'], [CHEN]: ['yanShip'], [WISDEL]: ['emptyShip'], [OBLVNS]: ['emptyShip'], [ASCLN]: ['emptyShip'],
    char_1052_kalts2: ['emptyShip'], char_4231_clemnt: ['egirShip'], char_1015_aglna2: ['siracusaShip'],   // 凯尔希·思衡托 协防, 克莱门莎 阿戈尔, 予愿安洁莉娜 叙拉古
    char_1042_phatm2: ['victoriaShip'],   // 酒神 维多利亚
  });
  assert.deepEqual(DATA.backups.diy.prototypes, { 5: [], 6: [] });
});

test('望 counts for 炎; its normal and elite copies count once; views and the battle input agree', REAL, () => {
  const h = soloMatch();
  const p0 = slot(h, { [T5A]: { charId: WANG, skillIndex: 0 } });
  const before = p0.bonds.yanShip?.count ?? 0;
  deploy(h, p0, T5A);
  assert.equal(p0.bonds.yanShip.count, before + 1, '炎');
  // a second copy in the hand: still one distinct member (BOARD counts the slot once)
  p0.acquireChess(T5A, { source: 'buy' });
  assert.equal(p0.bonds.yanShip.count, before + 1);
  h.m.flush(true);
  const priv = h.lastTo('p_0', 'm.private');
  assert.equal(priv.bonds.find((b) => b.bondId === 'yanShip').count, before + 1);
  const pub = h.lastBc('m.public');
  assert.equal(pub.players[0].bonds.find((b) => b.bondId === 'yanShip').count, before + 1, 'm.public (a teammate\'s strip)');
  const input = p0.battleInput();
  assert.equal(input.bonds.yanShip.count, before + 1, 'the battle input\'s bond snapshot');
  h.invariants();
  h.m.dispose();
});

test('协防: two 自选 协防 picks (a tier-5 and a tier-6 slot) enable it; 绝技 counts 自选 elites', REAL, () => {
  const h = soloMatch();
  const p0 = slot(h, { [T5B]: { charId: WISDEL, skillIndex: 0 }, [T6A]: { charId: ASCLN, skillIndex: 0 } });
  assert.ok(!p0.bonds.emptyShip?.active);
  deploy(h, p0, T5B);
  assert.equal(p0.bonds.emptyShip.count, 1);
  deploy(h, p0, T6A);
  assert.equal(p0.bonds.emptyShip.count, 2, 'two slots = two chess');
  assert.equal(p0.bonds.emptyShip.active, true);
  // 绝技 (BOARD_ALL_CHESS): every elite on the board — a 自选 elite included
  const sunt0 = p0.bonds.suntShip?.count ?? 0;
  deploy(h, p0, 'chess_char_5_diy2_b');
  assert.equal(p0.bonds.suntShip.count, sunt0 + 1);
  h.invariants();
  h.m.dispose();
});

test('sim: a 炎 自选 piece gets 炎\'s ATK buff; a 协防 one the ×1.2 damage (elite ×1.4)', REAL, () => {
  const bonds = { yanShip: { count: 3, active: true, tier: 1, layers: 10 }, emptyShip: { count: 2, active: true, tier: 1, layers: 0 } };
  const h = makeBattle({
    units: [
      { diy: { slot: 5, charId: WANG, skillIndex: 0 }, row: 10, col: 4 },
      { diy: { slot: T5B, charId: WISDEL, skillIndex: 0 }, row: 10, col: 6 },
      { diy: { slot: 6, charId: ASCLN, skillIndex: 0 }, elite: true, row: 11, col: 6 },
    ],
    bonds,
    timeLimit: 10,
  });
  h.run(1);
  const wang = h.allies().find((u) => u.def?.charId === WANG);
  const [normal, elite] = [h.allies().find((u) => u.def?.charId === WISDEL), h.allies().find((u) => u.def?.charId === ASCLN)];
  assert.ok(wang && normal && elite && !normal.def.golden && elite.def.golden, 'the three 自选 pieces are fielded');
  assert.deepEqual(wang.def.bonds, ['yanShip']);
  assert.ok(wang.hasBuff('bond:yan'), '炎: ATK for a member');
  assert.ok(!normal.hasBuff('bond:yan'), 'not for a non-member');
  const scale = (u) => u.buffs.filter((b) => /empty/i.test(b.key)).map((b) => b.mods?.dmgDealtMul).find((x) => x != null);
  assert.ok(DATA.bonds.emptyShip);
  assert.equal(scale(normal), 1.2, '协防 member ×1.2');
  assert.equal(scale(elite), 1.4, '协防 elite member ×1.4');
  assert.equal(scale(wang), undefined, '望 is no 协防 member');
  checkBattle(h.b);
});
