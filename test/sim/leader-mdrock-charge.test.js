// test/sim/leader-mdrock-charge.test.js — 2026-10-22 (docs/rules/sim.md 「머드락(적) 공격 스택」, maintainer decision 2026-10-21):
// 泥岩 (enemy_1511_mdrock) gains one stack of its client buff enemy_mdrock_s_1[charge] per attack (STACK, maxStackCnt 6,
// ATK MULTIPLIER from the blackboard). The client loads the modifier as blackboard value × stack count, so every stack is
// the whole talent value 0.6 (PRTS 「攻击力+60%的永久增益…最多叠加6层」) — +360% at 6 stacks, not 0.6 spread over 6.
// Through the real match path (buildBattleSpec → createBattleFromSpec).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const KEY = 'enemy_1511_mdrock';
const YAK = 'chess_char_1_02_a';   // 角峰: a defender that blocks it

test('泥岩 through the real match path: each attack adds a whole +atk stack, up to 6 (6 × 0.6 = +360%)', REAL, async () => {
  const E = JSON.parse(fs.readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
  const per = E[KEY].talents.bb['charge.attack@enemy_mdrock_s_1[charge].atk'];
  assert.equal(per, 0.6, 'the talent blackboard value');
  const { makeMatch } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', humans: 1, seed: 11 }).start();
  h.toPrep(3);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const p = ps.acquireChess(YAK, { source: 'buy' });
  assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: 10, col: 4 }, dir: 'RIGHT' }).ok);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'mdrock', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) b.step();
  b._pending.length = 0;           // the stage's own waves stay out of this field
  const yak = b.allyUnits.find((u) => u.defId === YAK);
  assert.ok(yak && yak.deployed, 'the defender stands on the field');
  // the defender neither dies nor hits back: only 泥岩's own attacks matter
  b.addBuff(yak, { key: 'test:tough', duration: Infinity, flags: { invulnerable: true, disarm: true, silence: true } });
  const e = b.spawnEnemy(KEY, { pos: [yak.y, yak.x], mods: { speedMul: 0 } });
  const base = e.s.atk;
  const seen = [];
  for (let i = 0; i < 4000 && b.time < 90 && seen.length < 8; i++) {
    b.step();
    const st = e.findBuff('ab:rockCharge')?.stacks ?? 0;
    if (st !== (seen.at(-1)?.st ?? 0)) seen.push({ st, atk: e.s.atk });
    if (st === 6 && seen.at(-1).at === undefined) seen.at(-1).at = b.time;
    if (st === 6 && b.time > seen.at(-1).at + 10) break;   // several more attacks at 6 stacks
  }
  assert.equal(e.blockedBy, yak, 'blocked, attacking the defender');
  assert.deepEqual(seen.map((x) => x.st), [1, 2, 3, 4, 5, 6], 'one stack per attack, capped at 6');
  for (const { st, atk } of seen) assert.ok(Math.abs(atk - base * (1 + per * st)) < 1e-6, `${st} stacks: ATK ${atk} = ${base} × (1 + ${per} × ${st})`);
  assert.ok(Math.abs(e.s.atk - base * (1 + 6 * per)) < 1e-6, 'still +360% after more attacks at the cap');
  assert.deepEqual(b.errors.map((x) => x.error?.message), []);
  m.dispose?.();
});
