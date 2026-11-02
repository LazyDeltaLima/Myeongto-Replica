// Faction talents test group tags, not bonds (docs/rules/sim.md 「진영 판정은 소속 태그」). The official client checks an
// operator talent's 「【拉特兰】干员」 against the character's nationId / groupId / teamId / subPower
// (`BattleCharacterData.CheckGroupTag`), so a chess keeps its faction whatever bonds the season gives it: data `powers`
// (tools/build-data.mjs powersOf) → kits/shared/powers.js hasPower.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import { makeMatch, DATA } from '../match/harness.js';
import { checkLoadout } from '../../shared/protocol.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { hasPower, powersOf } from '../../server/sim/content/kits/shared/powers.js';

const TITI = 'chess_char_5_02_a';
const PERFUMER = 'chess_char_2_14_a';   // 调香师: nationId rhodes, subPower minos, no 萨尔贡 bond
const TEXAS = 'chess_char_1_08_a';      // 德克萨斯: lungmen / penguin / subPower siracusa
const chess = (id) => (Object.hasOwn(DATA.chess, id) ? DATA.chess[id] : null);
const unitOf = (raw) => ({ def: { raw } });

test('data: every chess record carries its group tags (powers), nationId first', () => {
  for (const [id, c] of Object.entries(DATA.chess)) {
    assert.ok(Array.isArray(c.powers), `${id}: powers`);
    if (c.nationId) assert.equal(c.powers[0], c.nationId, `${id}: nationId first`);
    assert.equal(new Set(c.powers).size, c.powers.length, `${id}: no repeats`);
  }
  assert.deepEqual(chess(PERFUMER).powers, ['rhodes', 'minos']);
  assert.ok(!chess(PERFUMER).bonds.includes('sargonShip'), '调香师 has no 萨尔贡 bond');
  assert.deepEqual(chess(TEXAS).powers, ['lungmen', 'penguin', 'siracusa']);
  for (const [charId, u] of Object.entries(DATA.backups.units)) assert.ok(Array.isArray(u.powers), `backups unit ${charId}: powers`);
});

test('hasPower: any tag of the list; the bonds never count; a record without powers falls back to its nationId', () => {
  const texas = unitOf({ nationId: 'lungmen', powers: ['lungmen', 'penguin', 'siracusa'] });
  assert.ok(hasPower(texas, 'siracusa'));
  assert.ok(hasPower(texas, 'kazimierz', 'penguin'));
  assert.ok(!hasPower(texas, 'laterano'));
  const bondOnly = { def: { bonds: ['lateranoShip'], raw: { nationId: 'victoria', powers: ['victoria'], bonds: ['lateranoShip'] } } };
  assert.ok(!hasPower(bondOnly, 'laterano'), 'a 拉特兰 bond without the tag is not 拉特兰');
  assert.deepEqual(powersOf(unitOf({ nationId: 'kjerag' })), ['kjerag']);
  assert.deepEqual(powersOf(unitOf({ nationId: null })), []);
  assert.ok(!hasPower(null, 'laterano'));
  assert.ok(!hasPower({ def: { raw: {} } }, 'laterano'));
});

test('缇缇 T2 精力充沛 reaches 调香师 (subPower minos), not a 萨尔贡-bond operator of another nation', () => {
  const ally = (id, o) => ({ ...chessRec({ id, skill: null, position: 'RANGED', stats: { maxHp: 10000, atk: 0, def: 0, blockCnt: 0, respawnTime: 5 } }), ...o });
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 60,
    defs: { chess: { t_bond: ally('t_bond', { bonds: ['sargonShip'], nationId: 'victoria', powers: ['victoria'] }) } },
    units: [{ chessId: TITI, row: 10, col: 4 }, { chessId: PERFUMER, row: 11, col: 4 }, { chessId: 't_bond', row: 9, col: 4 }],
  }).step();
  h.runUntil(() => h.b.time >= 2, 200);
  assert.ok(h.unit(PERFUMER).findBuff('titi:vigor'), '调香师 is 米诺斯 by her subPower');
  assert.ok(!h.unit('t_bond').findBuff('titi:vigor'), 'the 萨尔贡 bond alone does not make an operator 萨尔贡');
});

test('real match path: 缇缇 and 调香师 on a solo board — the BattleSpec units carry powers and 精力充沛 lands', () => {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats: [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, loadout: checkLoadout({}, chess).loadout }], seed: 5 }).start();
  const ps = h.ps('p_0');
  assert.ok(h.drive(() => { if (ps.lp > 0 && ps.lp < 300) ps.lp = 300; return h.m.phase === 'PREP' && h.m.round === 2; }), 'PREP R2');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear();
  ps.hand.fill(null);
  ps.board.set('10,4', ps.newPiece('chess', TITI));
  ps.board.set('11,4', ps.newPiece('chess', PERFUMER));
  ps.recompute();
  const spec = buildBattleSpec({ ...h.m._normalOpts(ps), battleId: 'factions', fieldId: 'n:p_0', kind: 'normal', content: h.m.battleContent });
  const b = createBattleFromSpec(spec, h.m.ds, { quiet: true, recordEvents: false });
  const perf = b.allyUnits.find((u) => u.defId === PERFUMER);
  assert.ok(perf, '调香师 deployed');
  assert.deepEqual(powersOf(perf), ['rhodes', 'minos']);
  for (let i = 0; i < 200 && !perf.findBuff('titi:vigor'); i++) b.step();
  assert.ok(perf.findBuff('titi:vigor'), '精力充沛 on 调香师 in the real battle');
});
