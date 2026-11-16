// Operator skins, server side (docs/rules/upstream.md 「오퍼레이터 스킨」): the wire shape of room.skins, the
// PlayerState / Match chain, the public view, the battle input → Unit.skin → UnitInfo, a summon wearing its owner's
// outfit, and that an outfit never changes a battle (Battle.result() with and without it, on the real match path:
// Match → buildBattleSpec → createBattleFromSpec).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { makeMatch, give, legalTileFor, DATA } from './match/harness.js';
import { buildBattleSpec, createBattleFromSpec } from '../server/sim/spec.js';
import { unitInfo } from '../server/sim/snapshot.js';
import { SKIN_LIMITS, isSkinId, isCharId, isSkinSelection, checkSkinSelection, operatorCharIds, validateC2S } from '../shared/protocol.js';

// 비질 (chess_char_3_19_a, char_427_vigil) summons 늑대 (token_10028_vigil_wolf); its skin 「epoque#27」 dresses the wolf
// too (skin_table tokenSkinMap) — the client's job, the server only carries the owner's skinId
const CHESS = 'chess_char_3_19_a';
const CHAR = 'char_427_vigil';
const SKIN = 'char_427_vigil@epoque#27';
const TOKEN = 'token_10028_vigil_wolf';

const seats = (skins) => [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, ...(skins ? { skins } : {}) }];

/** A solo match with 비질 and one wolf on the board; the player's outfits are `skins`. */
function vigilMatch(skins) {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats: seats(skins), seed: 11 }).start();
  h.toPrep(4);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const owner = give(m, ps, CHESS, 'board', legalTileFor(m, ps, CHESS));
  const i = ps.hand.findIndex((p) => p && p.kind === 'token' && p.id === TOKEN && p.ownerUid === owner.uid);
  assert.ok(i >= 0, 'the wolves wait in the hand');
  const tok = ps.hand[i];
  const key = [...ps._ownerRangeOf(tok)].find((k) => !ps.board.has(k));
  assert.ok(key, 'a free tile in 비질\'s range');
  ps.hand[i] = null;
  ps.board.set(key, tok);
  ps.recompute();
  return { h, m, ps, owner, tok };
}

const battleOf = (m, ps, strip = false) => {
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'sk', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const json = JSON.parse(JSON.stringify(spec));
  if (strip) for (const p of json.players) for (const u of p.units) delete u.skin;
  const b = createBattleFromSpec(json, m.ds);
  b.start();
  return { spec: json, b };
};

describe('room.skins wire shape (shared/protocol.js)', () => {
  test('a skinId carries @ and # (not isId), a charId is an operator id, not a chess id', () => {
    assert.ok(isSkinId(SKIN) && isSkinId('token_10000_silent_healrb_winter#1'));
    for (const bad of ['', 'has space', '@lead', 'x'.repeat(SKIN_LIMITS.idLen + 1), 7, null]) assert.equal(isSkinId(bad), false, String(bad));
    assert.ok(isCharId(CHAR));
    for (const bad of ['chess_char_3_19_a', 'char_x_plugin', 'token_10028_vigil_wolf', 'char__x']) assert.equal(isCharId(bad), false, bad);
  });

  test('the map is refused whole on a bad shape; an unknown operator is dropped, the rest kept', () => {
    assert.ok(isSkinSelection({}) && isSkinSelection({ [CHAR]: SKIN }));
    for (const bad of [[SKIN], null, { [CHAR]: '' }, { chess_char_3_19_a: SKIN }, Object.assign(Object.create(null), { [CHAR]: SKIN })]) {
      assert.equal(isSkinSelection(bad), false, JSON.stringify(bad));
      assert.equal(checkSkinSelection(bad, () => true).error, 'BAD_MSG');
    }
    const big = {};
    for (let i = 0; i <= SKIN_LIMITS.entries; i++) big[`char_${i}_x`] = SKIN;
    assert.equal(isSkinSelection(big), false, 'over the entry cap');
    assert.equal(validateC2S({ t: 'room.skins', skins: { [CHAR]: SKIN } }), null);
    assert.notEqual(validateC2S({ t: 'room.skins' }), null);
    const ids = operatorCharIds(DATA);
    assert.ok(ids.has(CHAR), 'a chess operator');
    assert.ok([...ids].every(isCharId));
    const r = checkSkinSelection({ [CHAR]: SKIN, char_9999_nobody: 'char_9999_nobody@x#1' }, (id) => ids.has(id));
    assert.deepEqual(r, { ok: true, skins: { [CHAR]: SKIN }, dropped: 1 });
  });
});

describe('operator skins through the match (display only)', () => {
  test('the seat\'s outfits reach the player, m.public, the prep views and the battle input; a summon follows its owner', () => {
    const { m, ps, owner, tok } = vigilMatch({ [CHAR]: SKIN, char_9999_nobody: 'char_9999_nobody@x#1' });
    assert.deepEqual({ ...ps.skins }, { [CHAR]: SKIN }, 'an operator the match lacks is dropped');
    const pub = m.publicView().players.find((p) => p.playerId === 'p_0');
    assert.deepEqual(pub.skins, { [CHAR]: SKIN }, 'm.public players[].skins');
    assert.equal(ps.pieceView(owner).skin, SKIN, 'own board piece');
    assert.equal(ps.pieceView(tok).skin, SKIN, 'a summon wears its owner\'s skinId');
    const scout = m.prepFieldMeta(ps).units;
    assert.equal(scout.find((u) => u.uid === owner.uid).skin, SKIN, 'a scout sees the outfit');
    assert.equal(scout.find((u) => u.uid === tok.uid).skin, SKIN);
    const input = ps.battleInput();
    assert.equal(input.units.find((u) => u.uid === owner.uid).skin, SKIN, 'battle input');
    assert.equal(input.units.find((u) => u.uid === tok.uid).skin, undefined, 'a token entry carries none: the sim copies the owner\'s');
    m.dispose();
  });

  test('real match path: Unit.skin and UnitInfo.skin on the operator and its summon; no outfit = no key', () => {
    const { m, ps, owner, tok } = vigilMatch({ [CHAR]: SKIN });
    const { b } = battleOf(m, ps);
    const op = b.allyUnits.find((u) => u.uid === owner.uid);
    const wolf = b.allyUnits.find((u) => u.uid === tok.uid);
    assert.ok(op && wolf, 'both fielded');
    assert.equal(op.skin, SKIN);
    assert.equal(wolf.skin, SKIN, 'the summon piece copies its owner\'s outfit');
    assert.equal(unitInfo(op).skin, SKIN);
    assert.equal(unitInfo(wolf).skin, SKIN);
    m.dispose();
    const plain = vigilMatch(null);
    const { b: b0 } = battleOf(plain.m, plain.ps);
    for (const u of b0.allyUnits) assert.equal('skin' in JSON.parse(JSON.stringify(unitInfo(u))), false, 'a match without skins sends what it sent');
    plain.m.dispose();
  });

  test('a summon spawned in battle by its owner wears the owner\'s outfit', () => {
    const { m, ps, owner } = vigilMatch({ [CHAR]: SKIN });
    const { b } = battleOf(m, ps);
    const op = b.allyUnits.find((u) => u.uid === owner.uid);
    const t = b.spawnToken(op, TOKEN, 9, 5, { anySource: true });
    assert.ok(t, 'spawned');
    assert.equal(t.skin, SKIN);
    m.dispose();
  });

  test('an outfit never changes a battle: the same spec with and without it gives the same Battle.result()', () => {
    const { m, ps } = vigilMatch({ [CHAR]: SKIN });
    const a = battleOf(m, ps);
    const c = battleOf(m, ps, true);
    assert.ok(a.spec.players[0].units.some((u) => u.skin === SKIN) && !c.spec.players[0].units.some((u) => 'skin' in u));
    a.b.runToEnd();
    c.b.runToEnd();
    assert.equal(JSON.stringify(a.b.result()), JSON.stringify(c.b.result()));
    assert.ok(a.b.time > 0);
    m.dispose();
  });

  test('Match.setSkins: any phase, a bad map refused and the choice kept, an empty map clears, bots refused', () => {
    const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 1, bots: 1, seed: 3 }).start();
    const m = h.m, ps = h.ps('p_0');
    assert.deepEqual(m.setSkins('p_0', { [CHAR]: SKIN }), { ok: true });
    assert.deepEqual({ ...ps.skins }, { [CHAR]: SKIN });
    assert.equal(m.setSkins('p_0', { chess_char_3_19_a: SKIN }).error, 'BAD_MSG');
    assert.deepEqual({ ...ps.skins }, { [CHAR]: SKIN }, 'kept');
    assert.ok(!m.setSkins('ai_0', { [CHAR]: SKIN }).ok, 'a bot wears the defaults');
    h.toPrep(1);
    m.setSkins('p_0', {});
    assert.deepEqual({ ...ps.skins }, {});
    assert.equal('skins' in m.publicView().players.find((p) => p.playerId === 'p_0'), false, 'omitted when empty');
    m.dispose();
  });

  test('a 补位 stand-in wears the outfit of its body\'s operator, never the replaced one\'s', () => {
    const probe = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 5, seats: seats(null) }).start();
    const chess = Object.values(DATA.chess).find((c) => c.visible && !c.isGolden && !c.isDiy
      && probe.m.gd.standIn(c.chessId)?.charId && probe.m.gd.standIn(c.chessId).charId !== c.charId);
    assert.ok(chess, 'a droppable chess');
    const body = probe.m.gd.standIn(chess.chessId).charId;
    probe.m.dispose();
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 5,
      seats: [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, notOwned: [chess.chessId], skins: { [chess.charId]: `${chess.charId}@a#1`, [body]: `${body}@b#1` } }] }).start();
    h.toPrep(1);
    const m = h.m, ps = h.ps('p_0');
    assert.ok(ps.fieldsStandIn(chess.chessId), 'fielded as its stand-in');
    const piece = give(m, ps, chess.chessId, 'board', legalTileFor(m, ps, chess.chessId));
    assert.equal(ps.pieceView(piece).skin, `${body}@b#1`);
    assert.equal(ps.battleInput().units.find((u) => u.uid === piece.uid).skin, `${body}@b#1`);
    m.dispose();
  });
});
