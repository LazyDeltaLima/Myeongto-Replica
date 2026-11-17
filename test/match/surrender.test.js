import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { PHASE, ERR } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { SURRENDER_VOTE_MS } from '../../server/match/match/surrender.js';
import { emptyPerPlayer } from '../../server/match/fields.js';
import { planUnite } from '../../server/match/unite.js';

function setup(options = {}) {
  const h = makeMatch({ humans: 3, clientCombat: true, clients: false, instant: false, seed: 726, ...options }).start();
  h.toPrep(1);
  h.m.startCombat();
  return h;
}
const send = (h, id, f, op = 'propose', battleId = h.m.surrenderToken(f)) => h.m.handle(id, { t: 'g.surrender', fieldId: f.fieldId, battleId, op });
const shared = h => { const f = h.m.fields[0]; f.players = ['p_0', 'p_1']; return f; };

test('surrender protocol requires a scoped field, battle token and valid operation', () => {
  const good = { t: 'g.surrender', fieldId: 'n:p_0', battleId: 'battle.1', op: 'propose' };
  assert.equal(validateC2S(good), null);
  for (const changes of [{ fieldId: '' }, { battleId: '' }, { op: 'pass' }, { battleId: undefined }]) assert.ok(validateC2S({ ...good, ...changes }));
});

test('personal surrender reconstructs the cutoff, charges queued enemies, preserves earned state and only ends its own field', () => {
  const h = setup(); const m = h.m; const f = m.fields[0];
  try {
    h.sched.advance(700);
    const expected = m._specBattle(f.spec);
    while (!expected.finished && expected.time < m._fieldElapsed(f)) expected.step();
    const before = structuredClone(expected.result().perPlayer.p_0);
    const pending = expected._pending.length;
    const standing = expected.enemies.filter(e => e.alive && !e.isBoss && !e.mem.noLeak).length;
    expected.surrender();
    assert.ok(pending > 0, 'includes future enemies');
    assert.deepEqual(send(h, 'p_0', f), { ok: true });
    assert.equal(f.mode, 'surrender');
    assert.deepEqual(send(h, 'p_0', f), { error: ERR.WRONG_PHASE });
    h.sched.advance(1);
    assert.equal(f.done, true);
    assert.equal(m.fields[1].done, false, 'other player keeps fighting');
    const actual = f.result.perPlayer.p_0;
    assert.deepEqual(actual, expected.result().perPlayer.p_0);
    assert.equal(actual.killed, before.killed);
    assert.equal(actual.coins, before.coins);
    assert.deepEqual(actual.layerGains, before.layerGains);
    assert.equal(actual.perfect, false);
    assert.equal(actual.leaked.length, before.leaked.length + pending + standing);
    assert.ok(h.allTo('p_0', 'b.end').some(x => x.reason === 'surrender'));
    const endCount = h.allTo('p_0', 'b.end').length;
    m._resync(h.ps('p_0'));
    assert.equal(h.allTo('p_0', 'b.end').length, endCount + 1, 'resync also ends a fresh display replica');
    assert.equal(send(h, 'p_1', f).error, ERR.WRONG_PHASE);
    assert.equal(m.handle('p_0', { t: 'b.result', battleId: f.battleId, result: {} }).ok, true, 'late result ignored');
    assert.equal(h.logs.error.length, 0, h.logs.error.join('\n'));
  } finally { m.dispose(); }
});

test('shared field requires every participating human; outsiders and spectators cannot vote', () => {
  const h = setup({ spectators: ['watcher'] }); const f = shared(h);
  try {
    assert.equal(send(h, 'p_2', f).error, ERR.BAD_TARGET);
    assert.equal(send(h, 'watcher', f).error, ERR.SPECTATOR);
    assert.deepEqual(send(h, 'p_0', f), { ok: true });
    assert.deepEqual(f.surrenderVote.voters, ['p_0', 'p_1']);
    assert.equal(f.done, false);
    assert.equal(send(h, 'p_1', f, 'cancel').error, ERR.BAD_TARGET);
    assert.deepEqual(send(h, 'p_1', f, 'yes'), { ok: true });
    h.sched.advance(1);
    assert.equal(f.done, true);
    assert.equal(h.m.fields[1].done, false);
  } finally { h.m.dispose(); }
});

test('AI participants require no vote; the single human can surrender after UI confirmation', () => {
  const h = setup({ humans: 1, bots: 1 }); const f = h.m.fields[0]; f.players.push('ai_0');
  try { assert.deepEqual(send(h, 'p_0', f), { ok: true }); h.sched.advance(1); assert.equal(f.done, true); }
  finally { h.m.dispose(); }
});

test('a no vote or proposer cancellation closes only this vote; stale tokens cannot target another battle', () => {
  const h = setup(); const f = shared(h);
  try {
    assert.equal(send(h, 'p_0', f, 'propose', 'previous.battle').error, ERR.WRONG_PHASE);
    send(h, 'p_0', f); send(h, 'p_1', f, 'no');
    assert.equal(f.surrenderVote, null); assert.equal(f.done, false);
    assert.equal(send(h, 'p_0', f).error, ERR.RATE);
    f.surrenderRetryAt = 0;
    send(h, 'p_0', f); send(h, 'p_0', f, 'cancel');
    assert.equal(f.surrenderVote, null); assert.equal(f.done, false);
  } finally { h.m.dispose(); }
});

test('votes expire without stopping combat; disconnect and AI takeover cancel without implicit consent', () => {
  for (const change of ['timeout', 'disconnect', 'autoplay', 'leave']) {
    const h = setup(); const f = shared(h);
    try {
      send(h, 'p_0', f);
      if (change === 'timeout') h.sched.advance(SURRENDER_VOTE_MS);
      if (change === 'disconnect') h.m.onDisconnect('p_1');
      if (change === 'autoplay') h.m.handle('p_1', { t: 'g.autoplay', on: true });
      if (change === 'leave') h.m.onLeave('p_1');
      h.m.flush(true);
      assert.equal(f.surrenderVote, null, change);
      assert.notEqual(f.resultSource, 'surrender', change);
      assert.equal(f.surrendering, undefined, change);
    } finally { h.m.dispose(); }
  }
});

test('open votes survive resync, and natural field completion removes them', () => {
  const h = setup(); const f = shared(h);
  try {
    send(h, 'p_0', f); h.m._resync(h.ps('p_1'));
    const wire = h.lastTo('p_1', 'm.public').fields[0];
    assert.equal(wire.battleId, f.battleId); assert.deepEqual(wire.surrenderVote.yes, ['p_0']);
    f.live = false; h.m.flush(true);
    assert.equal(f.surrenderVote, null);
  } finally { h.m.dispose(); }
});

test('legacy streaming and paused solo battles surrender through the existing settlement', () => {
  for (const clientCombat of [false, true]) {
    const h = setup({ mode: 'solo', humans: 1, clientCombat }); const m = h.m; const f = m.fields[0];
    try {
      assert.deepEqual(m.handle('p_0', { t: 'g.pause', on: true }), { ok: true });
      assert.deepEqual(send(h, 'p_0', f), { ok: true });
      assert.equal(m.paused, false);
      h.sched.advance(100);
      const result = f.cc ? f.result : f.battle.result();
      assert.ok(result.perPlayer.p_0.leaked.length > 0);
      h.drive(() => m.phase === PHASE.PREP && m.round === 2 || m.ended);
      assert.equal(m.round, 2); assert.ok(h.ps('p_0').lp < h.ps('p_0').lpMax || h.ps('p_0').stats.lpLost > 0);
      assert.equal(h.logs.error.length, 0, h.logs.error.join('\n'));
    } finally { m.dispose(); }
  }
});

test('real joint defense: only helpers vote, surrender carries queued leaks into the leaker settlement in both combat modes', () => {
  for (const clientCombat of [false, true]) {
    const h = setup({ clientCombat }); const m = h.m;
    try {
      m.runner?.stop(); m.runner = null; m._stopClientCombat();
      m.lastResults = new Map(m.order.map(p => [p.playerId, emptyPerPlayer()]));
      const leaker = m.lastResults.get('p_2');
      leaker.perfect = false;
      leaker.leaked = [{ enemyKey: m.wave.spawns[0].enemyKey, counted: true, sourcePlayerId: 'p_2', mods: null }];
      const plan = planUnite(m, m.lastResults);
      assert.equal(plan.helpers.length, 2);
      m.startUnite(plan);
      const f = m.fields[0];
      assert.equal(send(h, 'p_2', f).error, ERR.BAD_TARGET, 'the leaker observes but does not fight here');
      assert.deepEqual(send(h, 'p_0', f), { ok: true });
      assert.deepEqual(send(h, 'p_1', f, 'yes'), { ok: true });
      h.sched.advance(100);
      const r = f.cc ? f.result : f.battle.result();
      assert.ok(Object.values(r.perPlayer).flatMap(p => p.leaked).some(l => l.sourcePlayerId === 'p_2'));
      h.drive(() => m.phase === PHASE.PREP && m.round === 2 || m.ended);
      assert.equal(h.ps('p_2').stats.lpLost, 1);
      assert.equal(h.ps('p_0').stats.lpLost, 0); assert.equal(h.ps('p_1').stats.lpLost, 0);
      assert.equal(h.logs.error.length, 0, h.logs.error.join('\n'));
    } finally { m.dispose(); }
  }
});

test('boss surrender requires consent within the pair, preserves the other field and finishes as defeat if every field gives up', () => {
  const h = setup({ humans: 4 }); const m = h.m;
  try {
    m._stopClientCombat(); m.startFinalAssault(false);
    const [first, second] = m.fields;
    assert.equal(m.fields.length, 2);
    for (const f of [first, second]) {
      const humans = m.surrenderVoters(f);
      assert.deepEqual(send(h, humans[0].playerId, f), { ok: true });
      assert.equal(f.done, false);
      assert.deepEqual(send(h, humans[1].playerId, f, 'yes'), { ok: true });
      h.sched.advance(1);
      assert.equal(f.done, true);
      if (f === first) assert.equal(second.done, false);
    }
    h.runToEnd();
    assert.equal(h.ended.victory, false);
    assert.equal(h.logs.error.length, 0, h.logs.error.join('\n'));
  } finally { m.dispose(); }
});
