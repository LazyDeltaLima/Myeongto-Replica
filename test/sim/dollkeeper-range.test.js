// test/sim/dollkeeper-range.test.js — a 傀儡师's <替身> fights with its trait's own attack range when the trait blackboard sets
// `talent_override_rangeid_flag` (风丸: x-4, the 8 tiles around her), from the end of the switch animation to the start of the
// switch back; the 本体 keeps its own range (1-1). docs/rules/sim.md 「傀儡师 <替身>의 공격 범위」.
// Run: node --test test/sim/dollkeeper-range.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { DOLL_SWITCH } from '../../server/sim/professions.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const KAZEMA = 'chess_char_2_11_a';
const WHY = 'the 替身 mode takes the trait\'s rangeId when talent_override_rangeid_flag is set (professions.js installDollkeeper; docs/rules/sim.md 「傀儡师 <替身>의 공격 범위」)';
const dummy = (key) => enemyRec({ key, hp: 1e9, speed: 0 });
const tiles = (u) => new Set(u.rangeKeys);
const sortGrid = (g) => g.map((p) => p.join(',')).sort();

test('every 傀儡师 piece of both seasons: the flagged trait range becomes the 替身 range, the others keep none', () => {
  let flagged = 0, plain = 0;
  for (const [season, file] of [[null, 'data/chess.json'], ['act3autochess', 'data/seasons/act3autochess/chess.json']]) {
    for (const [id, c] of Object.entries(read(file))) {
      if (c.subProfessionId !== 'dollkeeper') continue;
      const h = makeBattle({ ...(season ? { season } : {}), autoFinish: false, units: [{ chessId: id, row: 9, col: 5 }] });
      const u = h.b.allyUnits.find((x) => x.kind !== 'token');
      if (c.trait?.bb?.talent_override_rangeid_flag > 0) {
        assert.deepEqual(sortGrid(u.profile.dollRangeGrid), sortGrid(c.trait.rangeGrid), `${season ?? 'act2'} ${id}: ${WHY}`);
        flagged++;
      } else {
        assert.equal(u.profile.dollRangeGrid ?? null, null, `${season ?? 'act2'} ${id}: no flag, no 替身 range`);
        plain++;
      }
    }
  }
  assert.ok(flagged >= 4 && plain >= 2, `风丸 in both seasons (${flagged} flagged), 归溟幽灵鲨 (${plain} plain)`);
});

test('风丸: the 替身 hits behind and beside her after the switch; the 本体 range comes back with the switch back', () => {
  // she faces RIGHT at (9,5); the enemies stand behind her (9,4) and on the diagonal (10,6): outside her own 1-1
  const h = makeBattle({
    seed: 7, autoFinish: false, timeLimit: 120, hooks: ['damaged'], captureNoisy: true, flags: { dpPerSec: 0 },
    defs: { enemies: { e: dummy('e') } },
    units: [{ chessId: KAZEMA, row: 9, col: 5 }], enemies: [{ key: 'e', pos: [9, 4] }, { key: 'e', pos: [10, 6] }],
  });
  h.step();
  const u = h.b.allyUnits.find((x) => x.kind !== 'token');
  assert.equal(u.dir, 'RIGHT');
  assert.equal(tiles(u).size, 2, '本体: her own tile and the one in front');
  h.run(3);
  const hits = (f = () => true) => h.hooksOf('damaged').filter((c) => c.source === u && !(c.dmg.tags || []).includes('talent') && f(c));
  assert.equal(hits().length, 0, '本体: nothing in range');
  const ctx = { unit: u, reason: 'test', done: false };
  h.b.emit('dollSwitch', ctx);
  assert.ok(ctx.done && u.trait.doll, 'substituted');
  assert.equal(tiles(u).size, 2, 'the mode (and its range) switches at the end of the switch animation');
  h.run(DOLL_SWITCH + 0.1);
  assert.equal(tiles(u).size, 9, `<替身>: the 8 tiles around her — ${WHY}`);
  const at = h.b.time;
  h.run(6);
  const [back, diag] = h.enemies();
  assert.ok(hits((c) => c.t >= at && (c.target === back || c.target === diag)).length > 0, `<替身>: normal attacks reach behind / beside her — ${WHY}`);
  h.runUntil(() => !u.trait.doll, 30);
  h.run(DOLL_SWITCH + 0.1);
  assert.equal(tiles(u).size, 2, '本体 again: her own range');
  checkInvariants(h.b);
});

test('风丸 through the real match path (Match board → BattleSpec → createBattleFromSpec): the 替身 range', async () => {
  const { makeMatch } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', humans: 1, seed: 11 }).start();
  mh.toPrep(3);
  const m = mh.m, ps = mh.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const w = ps.acquireChess(KAZEMA, { source: 'buy' });
  assert.ok(w, 'her piece');
  assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 10, col: 7 }, dir: 'RIGHT' }).ok);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'dr', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  const u = b.allyUnits.find((x) => x.kind === 'op' && x.def.charId === 'char_4016_kazema');
  assert.ok(u, '风丸 on the field');
  while (!u.deployed && b.time < 5) b.step();
  assert.equal(u.rangeKeys.length, 2, '本体: 1-1');
  const ctx = { unit: u, reason: 'test', done: false };
  b.emit('dollSwitch', ctx);
  assert.ok(ctx.done, 'substituted');
  const until = b.time + DOLL_SWITCH + 0.1;
  while (b.time < until) b.step();
  assert.equal(u.rangeKeys.length, 9, `<替身>: x-4 — ${WHY}`);
  assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
  m.dispose?.();
});
