// The 传送门 (portal) of the boss / hidden-core templates (GitHub #336, PR #337 by @2321Robin): an enemy flies or walks
// into the portal and reappears on the far side. Four official routes spell the crossing as DISAPPEAR → WAIT → MOVE-to-the-exit with no APPEAR step
// (act1autochess_h07_02 route #4, act1autochess_h08_02 routes #5/#9, act2autochess_h07_05 route #6), while their twin
// routes in the same templates write it out as DISAPPEAR → WAIT → APPEAR[exit]. The client has no portal code (the level
// data moves the enemy): maintainer decision 2026-10-11, those four routes are taken as the data spells them — the
// enemy walks the rest of its route hidden and its route ends as any route ends (docs/rules/sim.md 「보스 포털」; until
// then normalizeRoute re-inserted the exit APPEAR — upstream's fix of 打 boss 时小怪进传送门后被判定进蓝门,全程隐身).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoute, hasGeneratedData } from '../../server/sim/simdata.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const REAL = { skip: !hasGeneratedData() && 'no generated data' };

/** Leg signature of a normalized route: `MOVE[r,c]` / `APPEAR[r,c]` / `DISAPPEAR` / `WAIT`. */
const sig = (r) => r.checkpoints.map((c) => c.type + (c.type === 'MOVE' || c.type === 'APPEAR' ? `[${c.pos[0]},${c.pos[1]}]` : ''));
/** The test enemy's leaks (the templates' own spawns leak too). */
const leaksOf = (h) => h.hooksOf('enemyLeak').filter((l) => l.enemy.defId === 'enemy_test_portal');
/** The test enemy's hidden spans: [{ from: [r,c], to: [r,c], dt }] (vanish tile, reappear tile, seconds hidden). */
function hiddenSpans(h) {
  const spans = [];
  let open = null;
  const set = h.b._setHidden.bind(h.b);
  h.b._setHidden = (e, on) => {
    if (e.defId === 'enemy_test_portal' && on !== !!e.hidden) {
      const at = [Math.round(e.y), Math.round(e.x)];
      if (on) open = { at, t: h.b.time };
      else if (open) { spans.push({ from: open.at, to: at, dt: h.b.time - open.t }); open = null; }
    }
    return set(e, on);
  };
  return spans;
}

test('normalizeRoute: DISAPPEAR → WAIT → MOVE stays as the data spells it (no APPEAR added; maintainer decision 2026-10-11)', () => {
  const r = normalizeRoute({
    motion: 'FLY', start: [2, 10], end: [1, 3],
    steps: [
      { t: 'move', p: [2, 11] }, { t: 'move', p: [1, 17] }, { t: 'disappear' }, { t: 'wait', s: 3 },
      { t: 'move', p: [5, 10] }, { t: 'move', p: [5, 9] },
    ],
  });
  assert.deepEqual(sig(r), ['MOVE[2,11]', 'MOVE[1,17]', 'DISAPPEAR', 'WAIT', 'MOVE[5,10]', 'MOVE[5,9]']);
});

test('normalizeRoute: a DISAPPEAR the data does spell out with an APPEAR is kept as the only one', () => {
  const r = normalizeRoute({
    motion: 'FLY', start: [2, 10], end: [1, 17],
    steps: [
      { t: 'move', p: [1, 3] }, { t: 'disappear' }, { t: 'wait', s: 3 }, { t: 'appear', p: [5, 10] }, { t: 'move', p: [5, 13] },
    ],
  });
  assert.equal(r.checkpoints.filter((c) => c.type === 'APPEAR').length, 1);
  assert.deepEqual(sig(r), ['MOVE[1,3]', 'DISAPPEAR', 'WAIT', 'APPEAR[5,10]', 'MOVE[5,13]']);
});

// The four official appear-less routes on their real templates: after the portal the enemy stays hidden to its route's
// end, which ends it as any route ends — one leak, no second portal crossing of ours (portalPickup skips a hidden enemy)
const CASES = [
  ['act1autochess_h07_02', 4, 'FLY'],
  ['act1autochess_h08_02', 5, 'WALK'],
  ['act1autochess_h08_02', 9, 'WALK'],
  ['act2autochess_h07_05', 6, 'FLY'],
];

for (const [tplId, routeIdx, motion] of CASES) {
  test(`${tplId} route #${routeIdx}: the crossing has no APPEAR in the data — hidden to its route's end, one leak there`, REAL, () => {
    const h = makeBattle({
      kind: 'boss', waveTemplate: tplId, content: 'none',
      defs: { enemies: { enemy_test_portal: enemyRec({ key: 'enemy_test_portal', hp: 1e6, speed: 3, motion }) } },
      enemies: [{ key: 'enemy_test_portal', route: routeIdx }],
      autoFinish: true, timeLimit: 400, hooks: ['enemyLeak'],
    });
    const spans = hiddenSpans(h);
    const e = () => h.enemy('enemy_test_portal');
    assert.ok(h.runUntil(() => e() && e().hidden, 400), 'reaches the portal (disappears)');
    h.runToEnd(400);
    const [leak, ...more] = leaksOf(h);
    assert.ok(leak, 'the route still ends in its leak');
    assert.equal(more.length, 0, 'one leak');
    assert.equal(leak.enemy.hidden, true, 'never back in the open (no APPEAR in the data)');
    assert.equal(spans.length, 0, 'no reappearance');
  });
}

// A route that ENDS on a portal entrance does not leak there: the entrance teleports the enemy out of the far exit
// ([5,10] — the same pairing every explicit DISAPPEAR / APPEAR pair in the data reads) and it walks on to the blue
// door on that side of the field, where the leak happens (GitHub #336: 打 boss 小怪第一次进传送门就被判定进蓝门,
// 官方是传送后走向蓝门). The solo boss routes are exactly this shape: straight from the centre into the corner portal.
// Inside the portal it stays hidden for 3 s, as the explicit crossings of the same tiles (WAIT 3 in 85 of the 95).
test('solo boss: a route ending on the left portal entrance leaks at the left blue door, not the portal', REAL, () => {
  const h = makeBattle({
    kind: 'boss', stageId: 'act1autochess_m01', rect: { r0: 0, r1: 5, c0: 0, c1: 20 },
    waveTemplate: 'act1autochess_h07_02_s', content: 'none',
    defs: { enemies: { enemy_test_portal: enemyRec({ key: 'enemy_test_portal', hp: 1e6, speed: 3 }) } },
    enemies: [{ key: 'enemy_test_portal', route: 0 }],
    autoFinish: true, timeLimit: 300, hooks: ['enemyLeak'],
  });
  const spans = hiddenSpans(h);
  const e = () => h.enemy('enemy_test_portal');
  assert.ok(h.runUntil(() => e() && Math.round(e().y) === 1 && Math.round(e().x) === 3, 300), 'reaches the portal entrance [1,3]');
  assert.ok(h.runUntil(() => e() && Math.round(e().y) === 5 && Math.round(e().x) === 10, 300), 'teleports out of the exit [5,10]');
  h.runToEnd(400);
  const [leak, ...more] = leaksOf(h);
  assert.ok(leak, 'leaks eventually');
  assert.deepEqual([Math.round(leak.enemy.y), Math.round(leak.enemy.x)], [2, 2], 'the leak is at the left blue door [2,2]');
  assert.equal(more.length, 0, 'stepping into the portal entrance is no leak of its own');
  assert.equal(spans.length, 1, 'one portal crossing');
  assert.deepEqual([spans[0].from, spans[0].to], [[1, 3], [5, 10]], 'hidden from the entrance to the exit');
  assert.ok(Math.abs(spans[0].dt - 3) < h.TICK * 1.5, `hidden 3 s inside the portal (${spans[0].dt.toFixed(3)} s)`);
});

test('a route ending on the right portal entrance mirrors: leak at the right blue door', REAL, () => {
  const h = makeBattle({
    kind: 'boss', stageId: 'act1autochess_m01', rect: { r0: 0, r1: 5, c0: 0, c1: 20 }, content: 'none',
    defs: { enemies: { enemy_test_portal: enemyRec({ key: 'enemy_test_portal', hp: 1e6, speed: 3 }) } },
    enemies: [{ key: 'enemy_test_portal', route: { motion: 'WALK', start: [2, 10], end: [1, 17], checkpoints: [] } }],
    autoFinish: true, timeLimit: 300, hooks: ['enemyLeak'],
  });
  const spans = hiddenSpans(h);
  h.runToEnd(400);
  const [leak, ...more] = leaksOf(h);
  assert.ok(leak, 'leaks eventually');
  assert.deepEqual([Math.round(leak.enemy.y), Math.round(leak.enemy.x)], [2, 18], 'the leak is at the right blue door [2,18]');
  assert.equal(more.length, 0, 'stepping into the portal entrance is no leak of its own');
  assert.deepEqual(spans.map((x) => [x.from, x.to]), [[[1, 17], [5, 10]]], 'one crossing, entrance to exit');
  assert.ok(Math.abs(spans[0].dt - 3) < h.TICK * 1.5, `hidden 3 s inside the portal (${spans[0].dt.toFixed(3)} s)`);
});
