// 「进入休整期时」 effects run when PREP opens, after the round's 机变 draft (upstream #851; the client's game states
// SP_PREPARE → PREPARE): the strategies' grants (老鲤 【得闲饮茶】 「第3回合进入休整期时，获得2、4阶随机干员各1名」, the
// preparation_start_* keys, 松桐, 娜仁图亚) and the operators' SERVER_PREP_START traits — not at the round start before
// the draft opens. server/sim/content/bands/meta.js header, server/match/effectsMeta.js GARRISON_HOOK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give, legalTileFor, DATA } from './harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';

const REG = createRegistry({ log: { warn() {}, error() {}, info() {} } });

function bandMatch(mode, bandId, seed = 5) {
  const h = makeMatch({ mode, difficulty: 'NORMAL', humans: 1, bots: mode === 'coop' ? 1 : 0, seed, registry: REG, fake: true }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  ps.bandId = bandId; // the draft offers a seat a few bands only; the handler is looked up by bandId at dispatch
  const grants = [];
  const orig = ps.acquireChess.bind(ps);
  ps.acquireChess = (id, o = {}) => {
    const p = orig(id, o);
    if (p && /band/.test(String(o.source || ''))) grants.push([h.m.phase, h.m.round, DATA.chess[id].tier]);
    return p;
  };
  return { h, m: h.m, ps, grants };
}

test('同盟 NORMAL: 老鲤\'s R3 operators come at the R3 prep start, after the 机变 draft — none at ROUND_START / SP_DRAFT', () => {
  const { h, m, ps, grants } = bandMatch('coop', 'band_lmlee');
  assert.ok(m.gd.spRounds().includes(3), 'R3 is a 机变 round in 同盟 NORMAL');
  assert.ok(h.drive(() => m.phase === 'ROUND_START' && m.round === 3));
  assert.deepEqual(grants, [], 'nothing at the R3 round start');
  assert.ok(h.drive(() => m.phase === 'SP_DRAFT' && m.round === 3, { ready: true }));
  assert.deepEqual(grants, [], 'nothing while the R3 draft is open');
  const hand = ps.hand.filter(Boolean).length;
  h.toPrep(3);
  assert.deepEqual(grants.map(([ph, r]) => `${ph} R${r}`), ['PREP R3', 'PREP R3']);
  assert.deepEqual(grants.map(([, , t]) => t).sort(), [2, 4]);
  assert.ok(ps.hand.filter(Boolean).length >= Math.min(hand + 2, ps.hand.length), 'the two operators are in the hand at the prep start');
  h.toPrep(4);
  assert.equal(grants.length, 2, 'once');
  m.dispose();
});

test('独立 NORMAL (R3 not a 机变 round): 老鲤 still grants at the R3 prep start', () => {
  const { h, m, grants } = bandMatch('solo', 'band_lmlee');
  assert.ok(!m.gd.spRounds().includes(3));
  h.toPrep(3);
  assert.deepEqual(grants.map(([ph, r, t]) => `${ph} R${r} T${t}`).sort(), ['PREP R3 T2', 'PREP R3 T4']);
  m.dispose();
});

test('同盟 NORMAL: an operator\'s 「<进入休整期时>」 trait runs at the prep start, after the R3 机变 draft', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 1, bots: 1, seed: 5, registry: REG, fake: true }).start();
  h.toPrep(2);
  const m = h.m;
  const ps = h.ps('p_0');
  const id = 'chess_char_4_16_a'; // garrison_114_a SERVER_GAIN_FREE_REFRESH_COUNT, on the board (character_target_inboard)
  assert.equal(DATA.garrisons[DATA.chess[id].garrisonIds[0]].eventType, 'SERVER_PREP_START');
  give(m, ps, id, 'board', legalTileFor(m, ps, id));
  const calls = [];
  const call = m.dispatcher._call.bind(m.dispatcher);
  m.dispatcher._call = (p, key, hd, hook, source, ...rest) => {
    if (p === ps && source?.kind === 'garrison' && source.garrison?.eventType === 'SERVER_PREP_START') calls.push(`${m.phase} R${m.round} ${hook}`);
    return call(p, key, hd, hook, source, ...rest);
  };
  h.toPrep(3);
  assert.deepEqual(calls, ['PREP R3 onPrepStart']);
  m.dispose();
});

test('同盟 NORMAL: an AI seat with 老鲤 makes its R3 机变 pick before the R3 operators reach its hand', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 1, bots: 1, seed: 5, registry: REG, fake: true }).start();
  h.toPrep(1);
  const m = h.m;
  const bot = [...m.players.values()].find((p) => p.isBot);
  bot.bandId = 'band_lmlee';
  const events = [];
  const orig = bot.acquireChess.bind(bot);
  bot.acquireChess = (id, o = {}) => {
    const p = orig(id, o);
    if (p && /band/.test(String(o.source || ''))) events.push(`grant ${m.phase} R${m.round}`);
    return p;
  };
  const apply = m._applyCard.bind(m);
  m._applyCard = (ps, ...rest) => { if (ps === bot) events.push(`pick ${m.phase} R${m.round}`); return apply(ps, ...rest); };
  h.toPrep(3);
  assert.deepEqual(events, ['pick SP_DRAFT R3', 'grant PREP R3', 'grant PREP R3']);
  m.dispose();
});
