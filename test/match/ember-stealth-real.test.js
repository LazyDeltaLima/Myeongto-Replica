// 深池逐火 余烬 through the real match path (test/match/harness.js → buildBattleSpec → createBattleFromSpec):
// docs/rules/sim.md 「upstream 0.2.3 이식」 (upstream PR #465). The warrior's block ends before the ember gains its 隐匿
// (client: Enemy.DoFakeDeath → ReleaseFromBlocker, then the ember mode's Invisible talent at Unit.DoReborn), so a fresh
// ember starts hidden; a blocker with a free slot takes it again after the 重生 and it can be finished — the 0.1.1 report
// (an ember nobody could ever target or kill) must not come back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { HUSK_REBIRTH } from '../../server/sim/content/enemies.js';
import { enemyStealthed, canTargetEnemy } from '../../server/sim/targeting.js';

const REAL = { skip: !hasGeneratedData() };
const YAK = 'chess_char_1_02_a';   // 角峰: a defender, blocks 3

async function realBattle() {
  const { makeMatch } = await import('./harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 3 }).start();
  h.toPrep(3);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const p = ps.acquireChess(YAK, { source: 'buy' });
  assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: 10, col: 4 }, dir: 'RIGHT' }).ok);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'ember', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) b.step();
  b._pending.length = 0;           // the stage's own waves stay out of this field
  const run = (s) => { const end = b.time + s; while (!b.finished && b.time < end - 1e-9) b.step(); };
  return { b, run, dispose: () => m.dispose?.() };
}

for (const key of ['enemy_1288_duskls', 'enemy_1292_duskld']) {
  test(`${key} (real path): knocked out while blocked → the fresh ember is 隐匿, then the free blocker takes it again and it dies`, REAL, async () => {
    const { b, run, dispose } = await realBattle();
    const yak = b.allyUnits.find((u) => u.defId === YAK);
    assert.ok(yak && yak.deployed, 'the defender stands on the field');
    const mods = { speedMul: 0, atkMul: 0 };
    const e = b.spawnEnemy(key, { pos: [yak.y, yak.x], mods });
    b.spawnEnemy('enemy_1007_slime', { pos: [yak.y, yak.x + 0.2], mods });
    run(0.5);
    assert.equal(e.blockedBy, yak, 'the warrior is blocked');
    b.kill(e, yak);
    assert.ok(e.alive && e.form === 'husk' && !e.blockedBy, 'the knock-out: 重生, its block ends at once');
    assert.equal(enemyStealthed(e), true, 'the fresh ember is 隐匿 (no window from the warrior\'s old block)');
    run(HUSK_REBIRTH + 0.3);
    assert.equal(e.blockedBy, yak, 'after the 重生 the defender (a free slot) blocks the ember');
    assert.equal(enemyStealthed(e), false, 'blocked: revealed');
    assert.ok(canTargetEnemy(yak, e, yak.profile), 'and targetable');
    const hits = e.hp;
    for (let i = 0; i < hits; i++) b.dealDamage(yak, e, { amount: 1, type: 'phys', tags: ['test'] });
    assert.equal(e.alive, false, 'the ember dies — the real death');
    assert.deepEqual(b.errors ?? [], []);
    dispose();
  });
}
