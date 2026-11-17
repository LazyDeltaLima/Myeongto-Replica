// Protocol fuzz: random VALID-SHAPED intents (they pass shared/protocol.js validateC2S) in random phases, random
// disconnects/reconnects/leaves and random time jumps never throw, always answer { ok } or { error: ERR.* }, never
// report an internal error and never corrupt the invariants (pool accounting, funds, slots, legality, merges).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateC2S, C2S } from '../../shared/protocol.js';
import { ERR, EMOTES } from '../../shared/constants.js';
import { createRng } from '../../server/sim/rng.js';
import { DATA, makeMatch, checkInvariants } from './harness.js';

const GAME = Object.keys(C2S).filter((t) => t.startsWith('g.') && t !== 'g.leave');
const BANDS = Object.keys(DATA.bands);

function randomIntent(rng, m, ps) {
  const t = rng.pick(GAME);
  const pieces = [];
  if (ps) {
    for (const p of [...ps.board.values(), ...ps.hand, ...ps.temp]) {
      if (!p) continue;
      pieces.push(p.uid);
      for (const it of p.items || []) pieces.push(it.uid);
    }
  }
  const uid = () => (pieces.length && rng() < 0.8 ? rng.pick(pieces) : 1 + rng.int(5000));
  const to = () => (rng() < 0.6 ? { area: 'board', row: rng() < 0.8 ? 9 + rng.int(4) : rng.int(19), col: rng() < 0.8 ? 2 + rng.int(9) : rng.int(21) } : { area: 'hand', idx: rng.int(10) });
  switch (t) {
    case 'g.band': return { t, bandId: rng() < 0.8 ? rng.pick(BANDS) : rng.pick(['constructor', '__proto__', 'band_x', 'a'.repeat(64)]) };
    case 'g.buy': return { t, slot: rng.int(16) };
    case 'g.sell': case 'g.destroy': return { t, uid: uid() };
    case 'g.move': return { t, uid: uid(), to: to() };
    case 'g.equip': return { t, itemUid: uid(), targetUid: uid() };
    case 'g.art': return { t, itemUid: uid(), row: rng.int(19), col: rng.int(21) };
    case 'g.reward': case 'g.choice': return { t, idx: rng.int(6) };
    case 'g.ready': return { t, ready: rng() < 0.4 };
    case 'g.emote': return { t, id: rng.pick(EMOTES) };
    case 'g.watch': return { t, fieldId: rng.pick(['n:p_0', 'n:p_1', 'n:ai_0', 'u', 'b1', 'b2', 'zz', '']) };
    case 'g.autoplay': return { t, on: rng() < 0.05 };
    case 'g.pause': return { t, on: rng() < 0.5 };
    // a proposal can end the match at once (a single human): rare, so the matches still run long
    case 'g.restart': return { t, op: rng() < 0.02 ? 'propose' : rng.pick(['yes', 'no', 'cancel']) };
    // a battle's surrender: a live field's token mostly, else a stale one (WRONG_PHASE); a proposal can end the battle: rare
    case 'g.surrender': {
      const f = m.fields?.length && rng() < 0.7 ? rng.pick(m.fields) : null;
      return { t, fieldId: f?.fieldId || rng.pick(['n:p_0', 'u', 'b1']), battleId: f ? m.surrenderToken(f) : 'stale.1.COMBAT.n:p_0',
        op: rng() < 0.05 ? 'propose' : rng.pick(['yes', 'no', 'cancel']) };
    }
    // 确定自选编队 (规程 only): slot ids, some outside any lineup (the default season has no such step: WRONG_PHASE)
    case 'g.diyChoose': return { t, slots: Array.from({ length: rng.int(4) }, () => rng.pick(['chess_char_5_diy1_a', 'chess_char_6_diy2_a', 'chess_char_5_diy6_a', 'x'])) };
    case 'g.diyReady': return { t, cancel: rng() < 0.3 };
    // 规程 solo's briefing group (the default season has none: BAD_TARGET)
    case 'g.bondGroup': return { t, idx: rng.int(2) };
    // 规程's active 指令: no target, a piece, a shop slot or a tile (the default season has none: BAD_TARGET)
    case 'g.bandSkill': return rng.pick([{ t }, { t, uid: uid() }, { t, slot: rng.int(16) }, { t, row: rng.int(19), col: rng.int(21) }]);
    default: return { t };
  }
}

function fuzzOne(seed, { fake }) {
  const rng = createRng(seed * 7919);
  const mode = rng() < 0.3 ? 'solo' : 'coop';
  const difficulty = rng.pick(['FUNNY', 'NORMAL', 'HARD', 'ABYSS']);
  const humans = mode === 'solo' ? 1 : 1 + rng.int(3);
  const bots = mode === 'solo' ? 0 : rng.int(3);
  const h = makeMatch({ mode, difficulty, humans, bots, seed, fake, captureFrames: false, checkFrames: true, script: () => ({ duration: 2 + rng.int(6), leaks: {} }) });
  const m = h.m;
  m.start();
  const humanIds = [...m.players.values()].filter((p) => !p.isBot).map((p) => p.playerId);
  let intents = 0;
  for (let step = 0; step < 2500 && h.ended == null; step++) {
    const r = rng();
    const pid = rng.pick(humanIds);
    const ps = m.players.get(pid);
    if (r < 0.82) {
      const msg = randomIntent(rng, m, ps);
      assert.equal(validateC2S(msg), null, `fuzz produced an invalid message ${JSON.stringify(msg)}`);
      const res = m.handle(pid, msg);
      intents++;
      assert.ok(res && (res.ok === true || (typeof res.error === 'string' && Object.hasOwn(ERR, res.error))), `bad reply ${JSON.stringify(res)} to ${JSON.stringify(msg)}`);
      assert.notEqual(res.error, ERR.INTERNAL, `internal error on ${JSON.stringify(msg)}`);
    } else if (r < 0.85) {
      m.onDisconnect(pid);
    } else if (r < 0.88) {
      m.onReconnect(pid);
    } else if (r < 0.882 && humanIds.filter((id) => !m.players.get(id).left).length > 1) {
      m.onLeave(pid);
    } else if (r < 0.96) {
      h.sched.advance(rng.int(3000));
    } else {
      for (let k = 0; k < 20; k++) if (!h.sched.runNext()) break;
    }
    if (step % 20 === 0) checkInvariants(m);
  }
  // finish the match: everyone left on AI 托管
  for (const ps of m.players.values()) if (!ps.isBot && !ps.left) m.handle(ps.playerId, { t: 'g.autoplay', on: true });
  h.drive(() => h.ended != null);
  assert.ok(h.ended, `seed ${seed}: match did not end (${m.phase} R${m.round})`);
  assert.equal(h.endedCount, 1);
  assert.equal(m.errorCount, 0, `seed ${seed}: ${JSON.stringify(m.errors.slice(0, 3))}`);
  assert.equal(m.dispatcher.errors, 0);
  assert.deepEqual(h.sched.errors, []);
  assert.deepEqual(h.badFrames, []);
  checkInvariants(m);
  m.dispose();
  return intents;
}

test('fuzz with FakeBattle: 60 matches of random intents / connection churn / time jumps', () => {
  let n = 0;
  for (let seed = 1; seed <= 60; seed++) n += fuzzOne(seed, { fake: true });
  assert.ok(n > 10000, `${n} intents`);
});

test('fuzz with the real simulation: 8 matches', () => {
  for (let seed = 101; seed <= 108; seed++) fuzzOne(seed, { fake: false });
});
