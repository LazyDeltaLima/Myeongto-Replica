// test/seasons-next.test.js — the provisional pieces of the season not out yet (shared/seasons.js `next`, tools/next-season.mjs):
// the current season's data plus the known operators, built as its chess are, invisible to the default season.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getData } from '../server/data.js';
import { KITS, kitKeyOfChar, NEXT_KIT_FILES, NEXT_KITS } from '../server/sim/content/kits/index.js';
import { kitOf } from '../server/sim/content/index.js';
import { nextSeasonAct } from '../tools/next-season.mjs';
import { legalTileFor, makeMatch } from './match/harness.js';
import { offeredSeasons, seasonInfo } from '../shared/seasons.js';

const quiet = { warn() {}, error() {}, info() {} };
const BASE = getData({ log: quiet });
const NEXT = getData({ log: quiet, season: 'next' });
const ROSTER = JSON.parse(readFileSync(new URL('../tools/assets/next-season-roster.json', import.meta.url), 'utf8')).ops;
const code = (charId) => charId.replace(/^char_\d+_/, '');
const idOf = ({ charId, tier }, f) => `chess_char_${tier}_n${code(charId)}_${f}`;

test('the season stays hidden: only a server that names it offers it', () => {
  assert.equal(seasonInfo('next').public, false);
  assert.deepEqual(offeredSeasons(''), ['act2autochess']);
  assert.deepEqual(offeredSeasons('next'), ['act2autochess', 'next']);
});

test('the season is the default chess plus its roster, and the default season has none of them', () => {
  const added = Object.keys(NEXT.chess).filter((k) => !BASE.chess[k]).sort();
  assert.deepEqual(added, ROSTER.flatMap((o) => [idOf(o, 'a'), idOf(o, 'b')]).sort());
  for (const [k, c] of Object.entries(BASE.chess)) assert.deepEqual(NEXT.chess[k], c, k);
  assert.ok(ROSTER.length >= 19 && new Set(ROSTER.map((o) => o.charId)).size === ROSTER.length);
  assert.ok(NEXT.bonds === BASE.bonds, 'its bonds are the default file: the new ones wait for the tables');
});

test('a roster piece has the status of its tier, the numbers of that status and every skill', () => {
  const statusOf = (tier, golden) => {
    const seen = new Set(Object.values(BASE.chess).filter((c) => c.chessType === 'PRESET' && c.tier === tier && !!c.isGolden === golden).map((c) => JSON.stringify(c.status)));
    assert.equal(seen.size, 1, `tier ${tier}: one status`);
    return JSON.parse([...seen][0]);
  };
  for (const o of ROSTER) {
    const a = NEXT.chess[idOf(o, 'a')], b = NEXT.chess[idOf(o, 'b')];
    assert.equal(a.charId, o.charId);
    assert.deepEqual(a.status, statusOf(o.tier, false), a.chessId);
    assert.deepEqual(b.status, statusOf(o.tier, true), b.chessId);
    assert.deepEqual([a.tier, a.upgradeChessId, a.upgradeNum, b.isGolden], [o.tier, b.chessId, 3, true]);
    assert.deepEqual(a.bonds, o.bonds ?? []);
    for (const id of a.bonds) assert.ok(NEXT.bonds[id], `${a.chessId}: ${id}`);
    assert.deepEqual(a.garrisonIds, [], 'its 特质 waits for the tables');
    assert.ok(a.visible && a.stats.atk > 0 && b.stats.atk > a.stats.atk, a.chessId);
    assert.ok(a.skills.length === 2 && b.skills.length === 2, `${a.chessId}: both skills`);
  }
  // 바이슨 at E1 55: between the table's E1 keyframes (254 at 1, 318 at 70)
  assert.equal(NEXT.chess.chess_char_1_nbison_a.stats.atk, Math.round(254 + (318 - 254) * 54 / 69));
});

test('nextSeasonAct: a tier with two statuses or a taken id stops the build', () => {
  const row = (tier, golden) => ({ chessId: `c${tier}${golden}`, chessLevel: tier, chessType: 'PRESET', goldenChessId: 'b', shopLevelSortId: 1 });
  const st = (level) => ({ identifier: 1, status: { evolvePhase: 'PHASE_1', charLevel: level } });
  const act = { charShopChessDatas: { a: row(1) }, charChessDataDict: { a: st(55), b: st(50) }, chessNormalIdLookupDict: {} };
  const out = nextSeasonAct(act, { ops: [{ charId: 'char_1_x', tier: 1 }] }, { charEquip: { char_1_x: ['m0', 'm1'] } }, { m1: {} });
  assert.equal(out.charChessDataDict.chess_char_1_nx_a.status.charLevel, 55);
  assert.equal(out.charChessDataDict.chess_char_1_nx_b.status.charLevel, 50);
  assert.equal(out.charShopChessDatas.chess_char_1_nx_a.defaultUniEquipId, 'm1', 'the first module with a battle record');
  assert.equal(act.charChessDataDict.chess_char_1_nx_a, undefined, 'the source is untouched');
  assert.throws(() => nextSeasonAct(act, { ops: [{ charId: 'char_1_x', tier: 2 }] }, {}, {}), /tier 2/);
  const two = { ...act, charShopChessDatas: { a: row(1), a2: { ...row(1), goldenChessId: 'b2' } }, charChessDataDict: { ...act.charChessDataDict, a2: st(60), b2: st(50) } };
  assert.throws(() => nextSeasonAct(two, { ops: [{ charId: 'char_1_x', tier: 1 }] }, {}, {}), /2 statuses/);
  assert.throws(() => nextSeasonAct(out, { ops: [{ charId: 'char_1_x', tier: 1 }] }, {}, {}), /taken/);
});

test('the kit of a next operator is found by its charId for its piece, whatever the id', () => {
  for (const [charId, kit] of Object.entries(NEXT_KITS)) {
    assert.equal(kitKeyOfChar(charId, 1), charId);
    const o = ROSTER.find((x) => x.charId === charId);
    assert.ok(o, `${charId}: on the roster`);
    assert.ok(kitOf({ id: idOf(o, 'a'), baseId: idOf(o, 'a'), charId, tier: o.tier }, KITS) === kit);
  }
});

test('a next kit file op-<codename>.js registers its roster operator and writes both skills, in both forms', async () => {
  const { normalizeChess } = await import('../server/sim/simdata.js');
  assert.equal(NEXT_KIT_FILES.length, Object.keys(NEXT_KITS).length, 'one key per file');
  for (const file of NEXT_KIT_FILES) {
    const m = /^op-([a-z0-9]+)\.js$/.exec(file);
    assert.ok(m, `${file}: name`);
    const o = ROSTER.find((x) => code(x.charId) === m[1]);
    assert.ok(o, `${file}: no roster operator ${m[1]}`);
    const mod = await import(`../server/sim/content/kits/ops/${file}`);
    assert.deepEqual(Object.keys(mod.default), [o.charId], `${file}: default export`);
    for (const f of ['a', 'b']) {
      const rec = NEXT.chess[idOf(o, f)];
      const kit = mod.default[o.charId](rec.skill.bb, rec, normalizeChess(rec));
      assert.deepEqual(Object.keys(kit.skills || {}).sort(), rec.skills.map((x) => x.skillId).sort(), `${file} ${f}: skills`);
    }
  }
});

test('real match path: a next match buys, places and fights a roster piece of that season\'s data', async () => {
  const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 5, data: NEXT, season: 'next' }).start();
  h.toPrep(3);
  const m = h.m, ps = h.ps('p_0');
  assert.equal(m.season, 'next');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const id = 'chess_char_1_nbison_a';
  const piece = ps.acquireChess(id, { source: 'buy' });
  const [row, col] = legalTileFor(m, ps, id, new Set());
  assert.equal(m.handle('p_0', { t: 'g.move', uid: piece.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }).ok, true);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'n1', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) b.step();
  const u = b.allyUnits.find((x) => x.kind === 'op' && x.defId === id);
  assert.ok(u, 'on the field');
  assert.equal(u.def.charId, 'char_325_bison');
  assert.equal(u.def.tier, 1);
  for (let i = 0; i < 300; i++) b.step();
  assert.deepEqual(b.errors, [], 'no handler error');
  m.dispose?.();
});
