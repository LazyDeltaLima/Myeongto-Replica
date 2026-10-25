// The round damage panel's numbers (shared/roundDamage.js → m.roundDmg; docs/rules/ui.md 「라운드 대미지 패널」,
// maintainer decision 2026-10-25):
//   - the real match path, client-side combat and the server-run fallback: one m.roundDmg per round to every human
//     still in the match (never a bot), at the round's settle, boss rounds included; each operator once, its damage
//     the own battle's (never the 联防 one), summing to at most the battle's damage; a reconnect gets the last again
//   - the fold on its own: a summon counts for its summoner (a board summon piece and a battle-created unit), a unit no
//     operator stands behind counts for nobody, most damage first; the live reading walks ownerUnit up to a board uid

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from './harness.js';
import { foldRoundDamage, liveUnitDamage } from '../../shared/roundDamage.js';

function runCoop({ seed, clientCombat }) {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 2, bots: 2, seed, captureFrames: false, clientCombat, pace: 'instant' });
  h.autoHumans();
  const m = h.m;
  const settled = []; // [round, playerId, own battle result] at each round's damage message
  const orig = m._sendRoundDamage;
  m._sendRoundDamage = function (ps, r) {
    if (ps && !ps.isBot) settled.push({ round: this.round, pid: ps.playerId, r, chess: [...ps.board.values()].filter((p) => p.kind === 'chess').map((p) => p.uid) });
    return orig.call(this, ps, r);
  };
  m.start();
  let resynced = null;
  h.run(() => {
    // a reconnect in the prep after a settle: the last message comes again
    if (!resynced && m.phase === PHASE.PREP && m.round >= 3) {
      const ps = m.players.get('p_0');
      if (ps.alive && ps.roundDmg) {
        const before = h.sent.length;
        m.onDisconnect('p_0');
        m.onReconnect('p_0');
        const resent = h.sent.slice(before).filter(([id, x]) => id === 'p_0' && x.t === 'm.roundDmg');
        resynced = { expect: ps.roundDmg, got: resent.map(([, x]) => x), entries: new Set(resent) };
      }
    }
    return h.ended != null;
  }, { maxSteps: 5e6 });
  assert.ok(h.ended, 'the match ended');
  assert.equal(m.errorCount, 0);
  // (the reconnect's resend is checked on its own)
  const msgs = h.sent.filter((e) => e[1].t === 'm.roundDmg' && !resynced?.entries.has(e));
  const out = { m, msgs, settled, resynced, bossRound: m.gd.bossRound };
  m.dispose();
  if (h.clients) h.clients.closeAll();
  return out;
}

function check({ msgs, settled, resynced, bossRound }, label) {
  assert.ok(msgs.length > 0, `${label}: messages sent`);
  for (const [pid] of msgs) assert.ok(pid === 'p_0' || pid === 'p_1', `${label}: humans only (${pid})`);
  // one per human per settled round, in order
  for (const pid of ['p_0', 'p_1']) {
    const rounds = msgs.filter(([id]) => id === pid).map(([, x]) => x.round);
    assert.deepEqual(rounds, settled.filter((s) => s.pid === pid).map((s) => s.round), `${label} ${pid}: one per round`);
    assert.equal(new Set(rounds).size, rounds.length, `${label} ${pid}: no round twice`);
  }
  assert.ok(msgs.some(([, x]) => x.round === bossRound), `${label}: the Final Assault round sends one too`);
  let i = 0;
  for (const s of settled) {
    const x = msgs.filter(([id]) => id === s.pid)[settled.filter((o) => o.pid === s.pid).indexOf(s)][1];
    assert.equal(x.round, s.round);
    const uids = x.units.map(([uid]) => uid);
    assert.equal(new Set(uids).size, uids.length, `${label} R${s.round}: each operator once`);
    for (const [uid, dmg] of x.units) {
      assert.ok(s.chess.includes(uid), `${label} R${s.round}: ${uid} is a board operator`);
      assert.ok(Number.isInteger(dmg) && dmg >= 0);
    }
    for (let k = 1; k < x.units.length; k++) assert.ok(x.units[k - 1][1] >= x.units[k][1], 'most damage first');
    // the own battle's damage, never more (bond summons count for nobody; per-row rounding)
    const sum = x.units.reduce((a, [, d]) => a + d, 0);
    assert.ok(sum <= (Number(s.r.damageDealt) || 0) + x.units.length + 1, `${label} R${s.round}: Σ ${sum} ≤ ${s.r.damageDealt}`);
    i += sum;
  }
  assert.ok(i > 0, `${label}: some damage was dealt`);
  assert.ok(resynced, `${label}: a reconnect was tried`);
  assert.deepEqual(resynced.got, [resynced.expect], `${label}: the reconnect got the last message again`);
}

test('real match path, client-side combat: one m.roundDmg per round to each human, own battle only, resent on a reconnect', () => {
  check(runCoop({ seed: 11, clientCombat: true }), 'client');
});

test('real match path, server-run combat: the same messages', () => {
  check(runCoop({ seed: 12, clientCombat: false }), 'server');
});

test('foldRoundDamage: summons count for their summoner, ownerless units for nobody, most damage first', () => {
  const board = [
    { uid: 1, kind: 'chess', id: 'a' },
    { uid: 2, kind: 'chess', id: 'b' },
    { uid: 3, kind: 'token', id: 't', ownerUid: 2 }, // a board summon piece of 2
    { uid: 4, kind: 'token', id: 'trap', ownerUid: null }, // a piece no operator stands behind
  ];
  const units = [
    { uid: 1, dmg: 100.4 },
    { uid: 2, dmg: 50 },
    { uid: 3, dmg: 70 }, // → 2
    { uid: null, ownerUid: 3, dmg: 5 }, // a unit the summon piece made → 2
    { uid: null, ownerUid: 1, dmg: 0.6 }, // a unit operator 1 made → 1
    { uid: 4, dmg: 999 }, // nobody
    { uid: null, ownerUid: null, dmg: 999 }, // a bond's summon: nobody
    { uid: 99, dmg: 5 }, // not on the board
    null,
  ];
  assert.deepEqual(foldRoundDamage(board, units), [[2, 125], [1, 101]]);
  assert.deepEqual(foldRoundDamage(board, []), []);
  assert.deepEqual(foldRoundDamage(null, undefined), []);
});

test('liveUnitDamage: a battle-made unit names the nearest summoner with a board uid', () => {
  const op = { uid: 7, stats: { dmg: 10 } };
  const mid = { uid: null, ownerUnit: op, stats: { dmg: 2 } };
  const leaf = { uid: null, ownerUnit: mid, stats: { dmg: 3 } };
  const lone = { uid: null, stats: { dmg: 4 } };
  assert.deepEqual(liveUnitDamage([op, mid, leaf, lone, { uid: 8 }]), [
    { uid: 7, ownerUid: null, dmg: 10 },
    { uid: null, ownerUid: 7, dmg: 2 },
    { uid: null, ownerUid: 7, dmg: 3 },
    { uid: null, ownerUid: null, dmg: 4 },
  ]);
  assert.deepEqual(foldRoundDamage([{ uid: 7, kind: 'chess' }], liveUnitDamage([op, mid, leaf, lone])), [[7, 15]]);
});
