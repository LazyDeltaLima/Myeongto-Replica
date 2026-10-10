// test/ui/ui2-real-match.test.js — the upstream ui-2 ports (2026-10-09) on the real match path: the server's own
// m.private / scouting units (test/match/harness.js makeMatch → Match → PlayerState views) read by the client helpers,
// and the client's messages back through Match.handle.
// - 教鞭 (upstream 56a7b918 client + 5bcc4ccd server): the m.private.personalChoice a cast sends is the client's
//   personal ChoiceOverlay (gameLogic normalizePersonalChoice), Ready is refused with its reason until the pick, and the
//   message actions.choice(idx, choiceId) builds (ui/gameActions.js) is the one Match accepts.
// - 潜能 / 练度 (upstream 7a0937e3): a card composed by gameLogic chessLoadout at m.private.ops shows the numbers the
//   battle built from the same match fights with (buildBattleSpec → createBattleFromSpec), and a teammate's scouted unit
//   at its UnitInfo potential / cultivate (unitCultivation) the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ERR } from '../../shared/constants.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { makeMatch, giveItem, DATA } from '../match/harness.js';
import { normalizePersonalChoice, shopBlockReason, chessLoadout, unitCultivation } from '../../public/js/ui/gameLogic.js';

const EFFECTS = JSON.parse(readFileSync(new URL('../../data/effects.json', import.meta.url), 'utf8'));
const chess = (id) => (Object.hasOwn(DATA.chess, id) ? DATA.chess[id] : null);

test('教鞭 on the real match path: the server\'s offer is the client\'s personal choice; Ready waits; the client\'s g.choice picks it', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 63, fake: true }).start();
  h.toPrep(1);
  const m = h.m, a = h.ps('p_0');
  const art = giveItem(m, a, 'chess_item_6_03_m'); // 教鞭
  assert.deepEqual(a.useArt(art.uid, 10, 5), { ok: true });
  m.flush(true);
  const priv = h.lastTo('p_0', 'm.private'), pub = h.lastTo('p_0', 'm.public') || m.publicView();
  const sp = normalizePersonalChoice(pub, priv, 'p_0');
  assert.ok(sp, 'the client sees the offer');
  assert.equal(sp.id, priv.personalChoice.id);
  assert.equal(sp.cards.length, 3, 'three 战术特训 cards');
  assert.equal(normalizePersonalChoice(pub, h.lastTo('p_1', 'm.private'), 'p_1'), null, 'not the teammate\'s');
  assert.equal(shopBlockReason('ready', { priv, editable: true }), '请先完成教鞭选择');
  assert.ok(m.handle('p_0', { t: 'g.ready', ready: true }).error, 'the server refuses Ready while it is open');
  // ui/gameActions.js: choice: (idx, choiceId) => act('g.choice', { idx, choiceId })
  const card = sp.cards[1];
  assert.deepEqual(m.handle('p_0', { t: 'g.choice', idx: card.idx, choiceId: sp.id }), { ok: true });
  assert.equal(a.bounties.length, 1);
  m.flush(true);
  assert.equal(normalizePersonalChoice(pub, h.lastTo('p_0', 'm.private'), 'p_0'), null, 'the overlay closes');
  assert.equal(m.handle('p_0', { t: 'g.choice', idx: card.idx, choiceId: sp.id }).error, ERR.BAD_TARGET, 'once');
  assert.deepEqual(m.handle('p_0', { t: 'g.ready', ready: true }), { ok: true });
  m.dispose();
});

test('潜能 / 练度 on the real match path: the card at m.private.ops shows what the battle fights with; a teammate\'s scouted unit too', () => {
  const VENDLA = 'chess_char_1_06_a', OTHER = 'chess_char_1_02_a';
  const ops = { [chess(VENDLA).charId]: { potential: 1, cultivate: 0 } };
  const seats = [
    { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, loadout: null, ops },
    { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true, loadout: null },
  ];
  const h = makeMatch({ mode: 'coop', seats, seed: 3 }).start();
  const m = h.m, p0 = h.ps('p_0');
  h.toPrep(1);
  for (const p of [...p0.board.values()]) p0.returnCopies(p);
  p0.board.clear();
  for (const [id, row] of [[VENDLA, 9], [OTHER, 11]]) p0.board.set(`${row},3`, p0.newPiece('chess', id));
  m.flush(true);
  const priv = h.lastTo('p_0', 'm.private');
  assert.deepEqual(priv.ops, ops);
  const card = (id, o) => chessLoadout(chess(id), priv.loadout, chess, { ...o, effects: EFFECTS }).record.stats;
  const b = createBattleFromSpec(buildBattleSpec(m._normalOpts(p0)), undefined, { quiet: true });
  for (const id of [VENDLA, OTHER]) {
    const u = b.allyUnits.find((x) => x.defId === id);
    const c = card(id, { ops: priv.ops });
    assert.deepEqual([c.atk, c.def, c.maxHp, c.cost], [u.s.atk, u.s.def, u.s.maxHp, u.base.cost], `${id}: the own card = the battle`);
  }
  assert.notDeepEqual(card(VENDLA, { ops: priv.ops }).atk, card(VENDLA, { ops: {} }).atk, '潜能1 / 练度0 differs from the defaults');
  // the teammate looks at p_0's board: the scouted UnitInfo carries potential / cultivate, the card reads them
  const scout = m.prepFieldMeta(p0).units;
  for (const id of [VENDLA, OTHER]) {
    const unit = scout.find((x) => x.defId === id);
    assert.deepEqual(card(id, { cultivation: unitCultivation(unit) }), card(id, { ops: priv.ops }), `${id}: a teammate's card = the owner's`);
  }
  m.dispose();
});
