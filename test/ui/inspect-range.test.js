import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectRange, skillButton } from '../../public/js/screens/game/range.js';
import { renderInfo } from '../../public/js/render/app/info.js';
import { rangeTiles } from '../../public/js/ui/facing.js';
import { unitStatsEntry } from '../../shared/protocol.js';
import { makeBattle } from '../helpers/battleHarness.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../../data/${name}.json`, import.meta.url), 'utf8'));
const chess = read('chess'), tokens = read('tokens');
const getChess = (id) => chess[id];
const medic = (id = 'char_613_acmedc', extra = {}) => renderInfo({ id: 71, defId: id, kind: 'token', side: 'ally', x: 5, y: 9, dir: 'UP', ...extra });
const args = (unit, extra = {}) => ({ target: { kind: 'unit', unit }, detail: { type: 'token', token: tokens[unit.defId] },
  getChess, field: { prep: true }, ...extra });

// upstream's case here was 自由的杰西卡 (jesca2) behind her shield — a 自选 kit we do not carry (shared/local-diy.js); this
// one keeps the real-battle path (Battle → fieldMeta / snapshot / unitStatsEntry `dir` → inspectRange) with a shop operator
test('user Given an operator in a real battle When inspected Then her open range is drawn at her live facing', () => {
  const at = (dir) => {
    const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: 'chess_char_3_01_a', row: 10, col: 4, dir }] });
    h.step();
    const u = h.unit(1);
    const live = unitStatsEntry(u, u.s);
    assert.equal(live.dir, dir, 'the live stats carry the facing');
    const unit = h.b.fieldMeta().units.find((v) => v.id === u.id);
    const r = inspectRange({ target: { kind: 'unit', unit }, detail: { type: 'chess', chess: u.def.raw }, getChess, field: {}, live,
      snapshot: h.b.snapshot().units.find((v) => v[0] === u.id) });
    assert.deepEqual([r.row, r.col, r.dir], [10, 4, dir]);
    return rangeTiles(r.grid, r.row, r.col, r.dir).map(([row, col]) => `${row},${col}`).sort();
  };
  const right = at('RIGHT'), up = at('UP');
  assert.equal(right.length, 12);
  assert.ok(right.includes('10,7') && !right.includes('13,4'), right.join(' '));
  assert.ok(up.includes('13,4') && !up.includes('10,7'), up.join(' '));
});

test('user Given strategy medics When inspecting them Then their healing tiles rotate on the field', () => {
  for (const id of ['char_613_acmedc', 'char_605_cmedic']) {
    const r = inspectRange(args(medic(id)));
    assert.equal(r.grid.length, 12);
    const tiles = rangeTiles(r.grid, r.row, r.col, r.dir);
    assert.equal(tiles.length, 12);
    assert.ok(tiles.some(([row, col]) => row === 12 && col === 4));
    assert.ok(!tiles.some(([row]) => row === 8));
  }
});

test('user Given a moving battle medic When its current range changes Then the overlay follows live range and position', () => {
  const r = inspectRange(args(medic(), { field: { prep: false }, snapshot: [71, 8, 10, 120, 200], live: { range: tokens.char_613_acmedc.skill.rangeGrid } }));
  assert.equal(r.grid.length, 18);
  assert.deepEqual([r.row, r.col, r.dir], [10, 8, 'UP']);
  const tiles = rangeTiles(r.grid, r.row, r.col, r.dir);
  assert.ok(tiles.some(([row, col]) => row === 15 && col === 9));
  assert.ok(!tiles.some(([, col]) => col === 5));
});

test('user Given an enemy, scouted hand or absent battle unit When inspecting Then no attack tiles appear', () => {
  for (const extra of [{ side: 'enemy' }, { area: 'hand' }, { area: 'temp' }, { kind: 'device' }]) {
    assert.equal(inspectRange(args(medic(undefined, extra))), null);
  }
  assert.equal(inspectRange(args(medic(), { field: { prep: false } })), null);
  assert.equal(inspectRange(args(medic(), { field: {}, snapshot: [71, 5, 9, 0, 200] })), null);
  assert.equal(inspectRange(args(medic(), { showPrep: true })), null);
  assert.equal(inspectRange(args(medic(), { live: { range: [] } })), null);
});

test('user Given an own board operator When its details open Then its range uses the board direction and clears off board', () => {
  const piece = { kind: 'chess', id: 'chess_char_1_01_a', uid: 5, dir: 'LEFT' };
  const input = { target: { kind: 'piece', uid: 5 }, detail: { type: 'chess', chess: chess[piece.id], piece },
    pieces: new Map([[5, { piece, area: 'board', row: 11, col: 2 }]]), showPrep: true, getChess };
  const r = inspectRange(input);
  const tiles = rangeTiles(r.grid, r.row, r.col, r.dir);
  assert.ok(tiles.every(([, col]) => col >= 0 && col <= 2));
  assert.ok(tiles.some(([, col]) => col === 0));
  assert.equal(inspectRange({ ...input, pieces: new Map() }), null);
  assert.equal(inspectRange({ ...input, target: { kind: 'chess', id: piece.id } }), null);
  assert.equal(inspectRange({ ...input, showPrep: false }), null);
});

test('a scouted prep board (the server\'s m.field): the board operator draws its range, the bench (area hand / temp) none', async () => {
  const { makeMatch, give, giveItem, legalTileFor, chessOfTier } = await import('../match/harness.js');
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 44, fake: true }).start();
  h.toPrep(1);
  const m = h.m;
  const b = h.ps('p_1');
  m.handle('p_1', { t: 'g.ready', ready: false });
  for (const p of [...b.board.values(), ...b.hand.filter(Boolean), ...b.temp.filter(Boolean)]) if (p.kind === 'chess') b.returnCopies(p);
  b.board.clear(); b.hand.fill(null); b.temp.fill(null); b.recompute();
  const [id1, id2, id3] = chessOfTier(1, (c) => c.position === 'MELEE').filter((x) => m.pool.has(x));
  const deployed = give(m, b, id1);
  const [r, c] = legalTileFor(m, b, id1);
  m.handle('p_1', { t: 'g.move', uid: deployed.uid, to: { area: 'board', row: r, col: c }, dir: 'UP' });
  const held = give(m, b, id2);
  while (b.hand.some((x) => x == null)) giveItem(m, b, 'chess_item_6_09_e_a'); // a full hand keeps the temp piece in temp
  const waiting = give(m, b, id3, 'temp');
  m.handle('p_0', { t: 'g.watch', fieldId: 'n:p_1' });
  const field = h.lastTo('p_0', 'm.field');
  const range = (piece) => {
    const unit = renderInfo(field.units.find((u) => u.uid === piece.uid));
    return inspectRange({ target: { kind: 'unit', unit }, detail: { type: 'chess', chess: chess[piece.id] }, field, getChess });
  };
  const own = range(deployed);
  assert.deepEqual([own.row, own.col, own.dir], [r, c, 'UP']);
  assert.equal(range(held), null, 'a held operator (area hand) has no field range');
  assert.equal(range(waiting), null, 'nor one in the 临时整备区 (area temp)');
  m.dispose();
});

test('user Given a field operator selected in the prep When its menu shows the skill button Then the toggle offers the skill\'s own range', () => {
  const m = { skills: {} };
  const btn = (c, skill) => skillButton({ detail: { type: 'chess', chess: c }, loadout: skill == null ? null : { [c.chessId]: { skill } }, getChess, m });
  const op = chess.chess_char_1_04_a; // 深巡: S1 no range of its own, S2 skchr_udflow_2 one tile longer
  assert.equal(btn(op, 0).spCost, op.skills[0].spCost);
  assert.equal(btn(op, 0).grid, null);
  assert.equal(btn(op, 1).spCost, op.skills[1].spCost);
  assert.deepEqual(btn(op, 1).grid, op.skills[1].rangeGrid);
  // a range of its own with the attack range's tiles still gets the toggle (the client compares range objects)
  const grabds = Object.values(chess).find((c) => !c.isGolden && c.skills?.some((s) => s.skillId === 'skchr_grabds_2'));
  const s2 = grabds.skills.find((s) => s.skillId === 'skchr_grabds_2');
  assert.deepEqual(s2.rangeGrid, grabds.rangeGrid);
  assert.deepEqual(btn(grabds, s2.index).grid, s2.rangeGrid);
  // a prefab that hides its range (引星棘刺 S3 `_hideRangeToShow`) or shows the base range (圣约送葬人 S1 / S3): no toggle
  for (const id of ['skchr_thorn2_3', 'skchr_excu2_1', 'skchr_excu2_3']) {
    const c = Object.values(chess).find((x) => !x.isGolden && x.skills?.some((s) => s.skillId === id));
    const sk = c.skills.find((s) => s.skillId === id);
    assert.equal(sk.showRange, false, id);
    assert.ok(sk.rangeGrid?.length, id);
    assert.equal(btn(c, sk.index).grid, null, id);
  }
  // a summon or an item gets none; nor does a PASSIVE skill
  assert.equal(skillButton({ detail: { type: 'token', token: tokens.char_613_acmedc }, getChess, m }), null);
  const passive = { ...op, skill: { ...op.skills[0], skillType: 'PASSIVE' }, skills: [{ ...op.skills[0], skillType: 'PASSIVE' }] };
  assert.equal(skillButton({ detail: { type: 'chess', chess: passive }, getChess, m }), null);
});
