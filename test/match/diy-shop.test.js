// test/match/diy-shop.test.js — 0.2.0 自选编队 on the server (research 0.2.0 §2; the owner's decisions of 2026-10-05),
// with this server's five picks (shared/local-diy.js; no prototype since the hard fork from 0.2.0, 2026-10-07): the picks (room.diy → seats[].diy) are checked leniently, fixed for the match and applied to that player only — the
// player's data view makes a slotted slot the operator (name, class, bonds from its factions, no 特质, the pick's skill
// and module; the slot's tier, price and merge), each slotted piece has its own stock (8 at tier 5, 5 at tier 6), never
// enters the shared pool, joins only its player's shop once the 调度中心 reaches the slot's level, leaves the shop when
// every bond of it is banned, merges 3 → elite, and fields its operator in battle (PlayerBattleInput `diy`), client-run
// and server-run identical; prep scouting and the result name the operator; a placeable summon (望's 棋子) comes to the
// hand when its owner is deployed and fights as her variant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C2S, validateC2S, checkDiyPicks, DIY_LIMITS } from '../../shared/protocol.js';
import { diyRecord } from '../../shared/diy.js';
import { KITTED_CHARS } from '../../server/sim/content/kits/index.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { DataSource, hasGeneratedData } from '../../server/sim/simdata.js';
import { placeClass } from '../../server/match/board.js';
import { buildResult } from '../../server/match/results.js';
import { GEO } from '../../shared/constants.js';
import { DATA, makeMatch, legalTileFor } from './harness.js';

const REAL = { skip: !hasGeneratedData() };
const wire = (msg) => JSON.parse(JSON.stringify(msg));

const T5A = 'chess_char_5_diy1_a';
const T5B = 'chess_char_5_diy2_a';
const T6A = 'chess_char_6_diy1_a';
const T6B = 'chess_char_6_diy2_a';
const CHEN = 'char_1050_chen3'; // 赤刃明霄陈 (炎; melee, no summon)
const WISDEL = 'char_1035_wisdel'; // 维什戴尔 (协防; ranged)
const ASCLN = 'char_4132_ascln'; // 阿斯卡纶 (协防; melee)
const WANG = 'char_2027_wang'; // 望 (炎; her 棋子 are placeable summons)
const SHARP = 'char_609_acguad'; // Sharp: a 补位 stand-in with a kit — upstream's 6★ prototype pick, none here
const CGUARD = 'char_601_cguard'; // 预备干员-近卫: upstream's 4★ reserve pick, none here
const SIEGE = 'char_112_siege'; // 推进之王: one of upstream's owned picks this server does not offer
const CHEN_PICK = { charId: CHEN, skillIndex: 2, uniEquipId: 'uniequip_002_chen3' };
const WISDEL_PICK = { charId: WISDEL, skillIndex: 0, uniEquipId: null };
const ASCLN_PICK = { charId: ASCLN, skillIndex: 1, uniEquipId: null };
const PICKS = { [T5A]: CHEN_PICK, [T5B]: WISDEL_PICK, [T6A]: ASCLN_PICK };

test('room.diy: structural wire check; checkDiyPicks keeps the legal picks, drops the rest (lenient), BAD_MSG only for malformed input', () => {
  assert.ok(C2S['room.diy']);
  assert.equal(validateC2S({ t: 'room.diy', picks: {} }), null);
  assert.equal(validateC2S({ t: 'room.diy', picks: { [T5A]: CHEN_PICK, [T6A]: null } }), null);
  for (const bad of [[], 'x', { [T5A]: { skillIndex: 1 } }, { [T5A]: { charId: 'a b' } }, { [T5A]: { charId: CHEN, skillIndex: 12 } }, { [T5A]: 3 }]) {
    assert.match(validateC2S({ t: 'room.diy', picks: bad }) || '', /bad field picks/, JSON.stringify(bad));
    assert.equal(checkDiyPicks(bad, { data: DATA, kitted: KITTED_CHARS }).error, 'BAD_MSG');
  }
  const many = Object.fromEntries(Array.from({ length: DIY_LIMITS.slots + 1 }, (_, i) => [`slot_${i}`, null]));
  assert.match(validateC2S({ t: 'room.diy', picks: many }) || '', /bad field picks/);

  const res = checkDiyPicks({
    [T5A]: CHEN_PICK,
    [T5B]: { charId: WISDEL, skillIndex: 7 }, // a skill she does not have: dropped
    [T6A]: { charId: ASCLN, skillIndex: 1, uniEquipId: 'uniequip_003_ascln' }, // AMB-Y at stage 3: fine
    [T6B]: { charId: CHEN, skillIndex: 0 }, // an owned operator in a second slot: dropped
    chess_char_4_99_a: { charId: CHEN, skillIndex: 0 }, // not a slot: dropped
  }, { data: DATA, kitted: KITTED_CHARS });
  assert.deepEqual(res, {
    ok: true, dropped: 3,
    picks: { [T5A]: CHEN_PICK, [T6A]: { charId: ASCLN, skillIndex: 1, uniEquipId: 'uniequip_003_ascln' } },
  });
  // no prototype, no reserve, no operator outside the five; an unknown module (望's ORIGINAL 'module') is dropped; an
  // operator off the kit list is never offered
  const r2 = checkDiyPicks({
    [T5A]: { charId: SHARP }, [T5B]: { charId: CGUARD }, [T6A]: { charId: SIEGE, skillIndex: 0 },
    [T6B]: { charId: WANG, skillIndex: 0, uniEquipId: 'uniequip_001_wang' },
  }, { data: DATA, kitted: KITTED_CHARS });
  assert.deepEqual(r2, { ok: true, picks: {}, dropped: 4 });
  const r4 = checkDiyPicks({ [T5A]: { charId: WANG, skillIndex: 0 }, [T6A]: WISDEL_PICK }, { data: DATA, kitted: KITTED_CHARS.filter((id) => id !== WANG) });
  assert.deepEqual(Object.keys(r4.picks), [T6A]);
  // one operator twice in a tier: the first slot keeps it
  const r3 = checkDiyPicks({ [T5B]: WISDEL_PICK, [T5A]: WISDEL_PICK }, { data: DATA, kitted: KITTED_CHARS });
  assert.deepEqual(Object.keys(r3.picks), [T5A]);
  assert.equal(r3.dropped, 1);
});

/** A co-op match: p_0 slots 赤刃明霄陈 + 维什戴尔 + 阿斯卡纶 (+ 陈 again, junk), p_1 陈 in the same slot, the bot nothing. */
function diyMatch(extra = {}) {
  const seats = [
    { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { ...PICKS, [T6B]: { charId: CHEN, skillIndex: 1 }, junk: null } },
    { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true, diy: { [T5A]: { charId: CHEN, skillIndex: 0, uniEquipId: null } } },
    { seat: 2, playerId: 'ai_0', name: 'AI0', isBot: true, connected: true, diy: PICKS },
  ];
  return makeMatch({ mode: 'coop', seats, seed: 13, ...extra }); // seed 13: 炎 (赤刃明霄陈) not banned
}
/** Gain a chess the way the shop does (acquireChess: the player's copy accounting, merges). */
const gain = (ps, id) => ps.acquireChess(id, { source: 'buy' });
function clear(ps) {
  for (const p of [...ps.board.values()]) ps.returnCopies(p);
  ps.board.clear();
  for (let i = 0; i < ps.hand.length; i++) if (ps.hand[i]) { ps.returnCopies(ps.hand[i]); ps.hand[i] = null; }
  ps.recompute();
}

test('seats[].diy → PlayerState.diy (re-checked, frozen; bots none); the player\'s data view is the operator, everyone else sees the slot', REAL, () => {
  const h = diyMatch().start();
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  const bot = h.ps('ai_0');
  assert.deepEqual(Object.keys(p0.diy), [T5A, T5B, T6A], 'the owned operator\'s second slot dropped');
  assert.ok(Object.isFrozen(p0.diy) && Object.isFrozen(p0.diy[T5A]));
  assert.deepEqual(bot.diy, {}, 'bots field no 自选 piece');
  assert.equal(bot.gd, h.m.gd, 'a player without picks keeps the match\'s data');
  for (const [id, elite] of [[T5A, false], ['chess_char_5_diy1_b', true]]) {
    const rec = p0.gd.chess(id);
    const want = diyRecord(T5A, CHEN_PICK, { elite, data: DATA });
    assert.deepEqual([rec.name, rec.charId, rec.diyFor, rec.bonds, rec.garrisonIds, rec.tier, rec.price, rec.sellPrice], [want.name, CHEN, T5A, ['yanShip'], [], 5, 4, 1]);
    assert.equal(rec.skill.skillId, 'skchr_chen3_3');
    // (0.2.2: an owned pick at the player's 潜能 / 练度 — none set: 6 / 3)
    assert.deepEqual(p0.loadoutFor(h.m.gd.chess(id)), { skillIndex: 2, moduleId: elite ? 'uniequip_002_chen3' : null, potential: 6, cultivate: 3 }, 'the pick, never the loadout');
    assert.equal(h.m.gd.chess(id).name, DATA.chess[id].name, 'the match\'s own record is the slot');
  }
  const s1 = DATA.backups.units[CHEN].forms['2/1/4/0'].skills.find((x) => x.index === 0).skillId;
  assert.equal(p1.gd.chess(T5A).skill.skillId, s1, 'p_1\'s own pick of the same slot (S1)');
  assert.equal(placeClass(p0, h.m.gd.chess(T5A)), 'melee');
  assert.equal(p0.gd.chess(T5B).charId, WISDEL);
  assert.equal(placeClass(p0, h.m.gd.chess(T5B)), 'ranged');
  h.m.flush(true);
  const priv = h.lastTo('p_0', 'm.private');
  assert.deepEqual(priv.diy, wire(p0.diy));
  assert.deepEqual(priv.diyBanned, []);
  assert.deepEqual(h.lastTo('p_1', 'm.private').diy, { [T5A]: { charId: CHEN, skillIndex: 0, uniEquipId: null } });
  // a malformed list (stale client) changes nothing
  assert.equal(p0.setDiy([]), false);
  assert.equal(Object.keys(p0.diy).length, 3);
  h.m.dispose();
});

test('per-player stock: 8 at tier 5, 5 at tier 6, never in the shared pool; only its player\'s shop, from the slot\'s 调度中心 level', REAL, () => {
  const h = diyMatch().start();
  const m = h.m;
  h.toPrep(1);
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  assert.deepEqual(p0.diyStock.snapshot(), { [T5A]: 8, [T5B]: 8, [T6A]: 5 });
  assert.deepEqual(p1.diyStock.snapshot(), { [T5A]: 8 }, 'a stock of its own for the same slot');
  for (const id of [T5A, T5B, T6A, T6B]) assert.ok(!m.pool.has(id), 'never in the shared pool');
  const seen = (ps, level, n = 300) => {
    ps.shop.level = level;
    const ids = new Set();
    for (let i = 0; i < n; i++) { ps.rollShop(); for (const s of ps.shop.slots) if (s && s.kind === 'chess' && /_diy/.test(s.id)) ids.add(s.id); }
    return [...ids].sort();
  };
  assert.deepEqual(seen(p0, 4), [], 'level 4: no tier-5 slot yet');
  assert.deepEqual(seen(p0, 5), [T5A, T5B], 'level 5: the tier-5 slots');
  assert.deepEqual(seen(p0, 6, 600), [T5A, T5B, T6A], 'level 6: both tiers');
  assert.deepEqual(seen(h.ps('ai_0'), 6), [], 'the bot\'s shop never sells another player\'s 自选 piece');
  // the price of any chess of the tier
  const slot = p0.shop.slots.find((s) => s && s.id === T6A) || { kind: 'chess', id: T6A, basePrice: m.gd.chessPrice(T6A), frozen: false, sold: false };
  assert.equal(slot.basePrice, 4);
  h.invariants();
  m.dispose();
});

test('buy → 3 copies merge into the elite (the stock pays the copies); sell / elimination give them back; a reward offer may hold it', REAL, () => {
  const h = diyMatch().start();
  const m = h.m;
  h.toPrep(1);
  const p0 = h.ps('p_0');
  clear(p0);
  p0.shop.level = 5;
  p0.funds = 40;
  // three purchases through g.buy (a shop slot stocked with the DIY slot)
  for (let i = 0; i < 3; i++) {
    p0.shop.slots[0] = { kind: 'chess', id: T5A, basePrice: m.gd.chessPrice(T5A), frozen: false, sold: false };
    assert.deepEqual(m.handle('p_0', { t: 'g.buy', slot: 0 }), { ok: true });
  }
  const elite = p0.allChess().find((p) => p.id === 'chess_char_5_diy1_b');
  assert.ok(elite, 'the elite');
  assert.equal(p0.allChess().filter((p) => p.id === T5A).length, 0);
  assert.equal(elite.poolCopies, 3);
  assert.equal(p0.diyStock.left(T5A), 5);
  assert.ok(p0.offers.length >= 1, 'the merge queued a reward offer');
  assert.equal(p0.gd.chess(elite.id).module.id, 'uniequip_002_chen3');
  // a slot the player has not filled is no piece: another player's slot cannot be bought or granted
  p0.shop.slots[1] = { kind: 'chess', id: T6B, basePrice: 4, frozen: false, sold: false };
  assert.equal(m.handle('p_0', { t: 'g.buy', slot: 1 }).error, 'BAD_TARGET');
  assert.equal(p0.acquireChess(T6B), null);
  p0.shop.slots[1] = null;
  // sell returns the copies to the player's stock
  assert.deepEqual(m.handle('p_0', { t: 'g.sell', uid: elite.uid }), { ok: true });
  assert.equal(p0.diyStock.left(T5A), 8);
  // the stock runs out like a pool entry: it no longer rolls, but a slot already shown is bought past it (pool.js,
  // GitHub #498 [ASSUMED] for the 自选 stock) — the copy is overdrawn
  for (let i = 0; i < 8; i++) gain(p0, T5A);
  assert.equal(p0.diyStock.left(T5A), 0);
  p0.shop.slots[0] = { kind: 'chess', id: T5A, basePrice: 4, frozen: false, sold: false };
  assert.deepEqual(m.handle('p_0', { t: 'g.buy', slot: 0 }), { ok: true });
  assert.equal(p0.diyStock.left(T5A), 0);
  h.invariants();
  // reward offers (the temporary refresh) draw it too — the promotion reward's tier is the 调度中心 level + 1, its 自选
  // pick included (the owner's decision of 2026-10-07; levels 4 / 5: test/local-patch-diy-reward.test.js)
  clear(p0);
  p0.offers = [];
  let hit = 0;
  p0.shop.level = 6;
  for (let i = 0; i < 300; i++) { const o = p0.pushRewardOffer('merge'); if (o && o.slots.some((s) => s.id === T6A)) hit++; p0.offers = []; }
  assert.ok(hit > 0, 'a level-6 reward can hold the tier-6 piece');
  // elimination returns everything
  gain(p0, T6A);
  p0.eliminate(m.round);
  assert.deepEqual(p0.diyStock.snapshot(), { [T5A]: 8, [T5B]: 8, [T6A]: 5 });
  m.dispose();
});

test('bans: a 自选 piece whose every bond is off this match has no stock (out of the shop); 协防 is never banned', REAL, () => {
  // a seed whose drawn bans include 炎 (赤刃明霄陈's only bond)
  let h = null;
  for (let seed = 1; seed < 400 && !h; seed++) {
    const t = diyMatch({ seed });
    if (t.m.disabledBonds.includes('yanShip')) h = t; else t.m.dispose();
  }
  assert.ok(h, 'a seed banning 炎');
  h.start();
  const p0 = h.ps('p_0');
  assert.deepEqual([...p0.diyBanned], [T5A]);
  assert.ok(!p0.diyStock.has(T5A));
  assert.deepEqual(Object.keys(p0.diyStock.snapshot()).sort(), [T5B, T6A], '维什戴尔 and 阿斯卡纶 (协防) stay');
  assert.ok(!h.m.disabledBonds.includes('emptyShip'));
  h.toPrep(1);
  p0.shop.level = 5;
  for (let i = 0; i < 300; i++) { p0.rollShop(); assert.ok(!p0.shop.slots.some((s) => s && s.id === T5A)); }
  h.m.flush(true);
  assert.deepEqual(h.lastTo('p_0', 'm.private').diyBanned, [T5A]);
  h.invariants();
  h.m.dispose();
});

test('bonds, placement and summons read the operator; the record\'s identity (tier, price, merge) is the slot\'s', REAL, () => {
  const h = diyMatch().start();
  const m = h.m;
  h.toPrep(1);
  const p0 = h.ps('p_0');
  clear(p0);
  const a = gain(p0, T5A);
  const tile = legalTileFor(m, p0, T5A);
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: a.uid, to: { area: 'board', row: tile[0], col: tile[1] } }), { ok: true });
  assert.ok(p0.bonds.yanShip && p0.bonds.yanShip.count >= 1, '赤刃明霄陈 counts for 炎');
  const b = gain(p0, T5B);
  const t2 = legalTileFor(m, p0, T5B);
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: b.uid, to: { area: 'board', row: t2[0], col: t2[1] } }), { ok: true });
  assert.ok(p0.bonds.emptyShip && p0.bonds.emptyShip.count >= 1, '维什戴尔 counts for 协防');
  assert.equal(m.gd.mergeCount(T5A), 3);
  assert.deepEqual(p0.gd.placeableTokens(T5A, p0.loadoutFor(p0.gd.chess(T5A))), [], '赤刃明霄陈 makes no summon');
  h.invariants();
  m.dispose();
});

/** The browser's DataSource (battle/runner.js loadBrowserSim): own JSON copies of the data files, backups included. */
function browserSource() {
  const copy = (v) => JSON.parse(JSON.stringify(v));
  return new DataSource({ chess: copy(DATA.chess), enemies: copy(DATA.enemies), tokens: copy(DATA.tokens), stages: copy(DATA.stages), waves: copy(DATA.waves), backups: copy(DATA.backups) }, null);
}

test('battleInput: a 自选 piece carries its pick (`diy`, no loadout fields); the sim fields the operator, client-run and server-run alike', REAL, () => {
  const h = diyMatch().start();
  const m = h.m;
  h.toPrep(1);
  const p0 = h.ps('p_0');
  clear(p0);
  const a = gain(p0, T5A);
  for (let i = 0; i < 2; i++) gain(p0, T5A); // → the elite
  const elite = p0.allChess().find((p) => p.id === 'chess_char_5_diy1_b');
  const tile = legalTileFor(m, p0, elite.id);
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: elite.uid, to: { area: 'board', row: tile[0], col: tile[1] } }), { ok: true });
  const s = gain(p0, T6A);
  const t2 = legalTileFor(m, p0, T6A);
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: s.uid, to: { area: 'board', row: t2[0], col: t2[1] } }), { ok: true });
  assert.ok(a);
  const input = p0.battleInput();
  const by = new Map(input.units.map((u) => [u.uid, u]));
  assert.deepEqual(by.get(elite.uid).diy, CHEN_PICK);
  assert.ok(!('skillIndex' in by.get(elite.uid)) && !('moduleId' in by.get(elite.uid)) && !('standIn' in by.get(elite.uid)));
  assert.deepEqual(by.get(s.uid).diy, ASCLN_PICK);
  const wave = m.wave;
  const spec = wire(buildBattleSpec({
    battleId: 't.1', fieldId: 'n:p_0', kind: 'normal', seed: 77, modeId: m.modeId, round: 1, stageId: m.stageId,
    rect: { ...GEO.NORMAL_RECT }, timeLimit: 40, players: [input], spawns: wave.spawns.map((x) => ({ ...x, ownerPlayerId: 'p_0' })),
    routes: wave.routes, flags: { layerGainsEnabled: true, ...m.gd.dp }, enemyOverrides: wave.overrides ?? {}, content: 'full',
  }));
  assert.deepEqual(spec.players[0].units.find((u) => u.uid === elite.uid).diy, CHEN_PICK);
  const run = (ds) => {
    const bt = createBattleFromSpec(wire(spec), ds, { quiet: true, recordEvents: false });
    const u = bt.allyUnits.find((x) => x.uid === elite.uid);
    const def = { charId: u.def.charId, diyFor: u.def.diyFor, skill: u.def.skill?.id, bonds: u.def.bonds, name: u.name, generic: !!u.kit?.generic };
    let n = 0;
    while (!bt.finished && n++ < 30 * 45) bt.step();
    const res = bt.result();
    return { def, time: res.time, killed: res.killed, units: bt.allyUnits.map((x) => [x.uid, x.defId, Math.round(x.hp * 100), x.stats?.dmg | 0, x.skill?.activations ?? null]), rng: bt.rng.state() };
  };
  const server = run(m.ds);
  const client = run(browserSource());
  assert.deepEqual(server.def, { charId: CHEN, diyFor: T5A, skill: 'skchr_chen3_3', bonds: ['yanShip'], name: DATA.backups.units[CHEN].name, generic: false });
  assert.deepEqual(client, server, 'the browser\'s battle equals the server\'s');
  m.dispose();
});

test('prep scouting (m.field) and the result name the operator: a teammate\'s 自选 piece carries its pick and the operator\'s art', REAL, () => {
  const h = diyMatch().start();
  const m = h.m;
  h.toPrep(1);
  const p0 = h.ps('p_0');
  clear(p0);
  const a = gain(p0, T5A);
  const tile = legalTileFor(m, p0, T5A);
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: a.uid, to: { area: 'board', row: tile[0], col: tile[1] } }), { ok: true });
  const held = gain(p0, T6A);
  assert.deepEqual(m.handle('p_1', { t: 'g.watch', fieldId: 'n:p_0' }), { ok: true });
  const meta = wire(h.lastTo('p_1', 'm.field'));
  const by = new Map(meta.units.map((u) => [u.uid, u]));
  const u = by.get(a.uid);
  // (the pick as slotted: its module applies on the elite only — the normal piece fights without one)
  assert.deepEqual([u.defId, u.name, u.spine, u.skillIndex, u.moduleId, u.diy], [T5A, DATA.backups.units[CHEN].name, CHEN, 2, undefined, CHEN_PICK]);
  const hu = by.get(held.uid);
  assert.deepEqual([hu.defId, hu.name, hu.diy?.charId], [T6A, DATA.backups.units[ASCLN].name, ASCLN]);
  const res = buildResult(m, { victory: false, hiddenReached: false, hiddenCleared: false, reason: 'test' });
  const row = res.players.find((p) => p.playerId === 'p_0');
  assert.deepEqual(row.lineup.find((x) => x.id === T5A).diy, CHEN_PICK);
  m.dispose();
});

test('from the prep on a match keeps its picks (the next match takes a change: test/lobby-diy.test.js; the briefing / draft may still change them: test/match/diy-midmatch.test.js)', REAL, () => {
  const h = diyMatch().start();
  const p1 = h.ps('p_1');
  const before = p1.diy;
  h.toPrep(1);
  assert.equal(p1.diy, before);
  assert.equal(h.m.setDiy('p_1', { [T6A]: { charId: CHEN, skillIndex: 1 } }).error, 'WRONG_PHASE', 'the prep refuses a change (진영별 선발 프리셋, maintainer 2026-10-09)');
  assert.equal(p1.diy, before);
  h.m.dispose();
  // the next match: new seats, new picks
  const seats = [{ seat: 0, playerId: 'p_1', name: 'P1', isBot: false, connected: true, diy: { [T6A]: { charId: CHEN, skillIndex: 1 } } }];
  const h2 = makeMatch({ mode: 'solo', seats, seed: 12 }).start();
  assert.deepEqual(h2.ps('p_1').diy, { [T6A]: { charId: CHEN, skillIndex: 1, uniEquipId: null } });
  h2.m.dispose();
});

test('a DIY 望: her 棋子 come to the hand when she is deployed, place, and fight as her variant (server and browser data); sold, they leave with her', REAL, () => {
  const STONE = 'token_10064_wang_stone1';
  const h = diyMatch().start();
  const m = h.m;
  h.toPrep(1);
  const p0 = h.ps('p_0');
  assert.equal(p0.setDiy({ [T6B]: { charId: WANG, skillIndex: 0, uniEquipId: null } }), true);
  p0.initDiyStock(new Set());
  clear(p0);
  const wang = gain(p0, T6B);
  assert.ok(!p0.hand.some((p) => p && p.kind === 'token'), 'in the hand she brings no summon yet');
  const tile = legalTileFor(m, p0, T6B);
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: wang.uid, to: { area: 'board', row: tile[0], col: tile[1] } }), { ok: true });
  const stack = p0.hand.find((p) => p && p.kind === 'token');
  assert.ok(stack, 'deployed, her 棋子 come to the hand (PRTS 卫戍协议/帮助 §战斗部署)');
  assert.deepEqual([stack.id, stack.ownerUid, stack.count], [STONE, wang.uid, DATA.backups.tokens[STONE].variants[`${WANG}@2/1/4/0`].stats.deployLimit]);
  assert.equal(p0.gd.token(STONE).name, DATA.backups.tokens[STONE].name, 'the player\'s data view finds the 自选 summon');
  const t2 = legalTileFor(m, p0, T6B, new Set([`${tile[0]},${tile[1]}`]));
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: stack.uid, to: { area: 'board', row: t2[0], col: t2[1] } }), { ok: true });
  h.invariants();
  const input = p0.battleInput();
  const tok = input.units.find((u) => u.kind === 'token');
  assert.deepEqual([tok.tokenId, tok.ownerUid], [STONE, wang.uid], 'the battle input carries the piece with its owner');
  const spec = wire(buildBattleSpec({
    battleId: 't.3', fieldId: 'n:p_0', kind: 'normal', seed: 9, modeId: m.modeId, round: 1, stageId: m.stageId,
    rect: { ...GEO.NORMAL_RECT }, timeLimit: 20, players: [input], spawns: [], routes: m.wave.routes,
    flags: { layerGainsEnabled: true, ...m.gd.dp }, enemyOverrides: {}, content: 'full',
  }));
  for (const ds of [m.ds, browserSource()]) {
    const bt = createBattleFromSpec(wire(spec), ds, { quiet: true, recordEvents: false });
    bt.step();
    const u = bt.allyUnits.find((x) => x.uid === wang.uid);
    const t = bt.allyUnits.find((x) => x.kind === 'token' && x.defId === STONE);
    assert.ok(u && !u.kit.generic, 'her operator kit');
    assert.ok(t, 'the 棋子 is fielded');
    assert.equal(t.ownerUnit, u, 'owned by her (the kit finds its piece by owner)');
    assert.equal(t.def.stats.maxHp, DATA.backups.tokens[STONE].variants[`${WANG}@2/1/4/0`].stats.maxHp, 'the token record of her form');
    assert.equal(bt.errors.length, 0);
  }
  // sold, the pieces leave with her
  assert.deepEqual(m.handle('p_0', { t: 'g.sell', uid: wang.uid }), { ok: true });
  assert.ok(![...p0.board.values(), ...p0.hand, ...p0.temp].some((p) => p && p.kind === 'token'), 'her summons leave with her');
  h.invariants();
  m.dispose();
});
