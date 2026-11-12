// 规程's battle bench (shared/seasons.js `benchInBattle`, server views.js battleBench): b.start carries the field's
// players' 整备区 pieces, which the official battle draws standing still (docs/rules/render.md 「규정 전투 중 정비 구역」);
// the 盟约 season sends none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, GEO } from '../../shared/constants.js';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, chessOfTier } from './harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';

const quiet = { error() {}, warn() {}, info() {}, log() {} };

function firstStart(season) {
  const act3 = season === 'act3autochess';
  const h = makeMatch({
    mode: 'solo', humans: 1, seed: 11, captureFrames: false, clientCombat: true,
    ...(act3 ? { season, data: ACT3_ON_BASE_FIELD, registry: createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet }) } : {}),
  }).start();
  h.toPrep(1, act3 ? { band: 'band_amiya' } : {});
  const ps = h.ps('p_0');
  ps.hand.fill(null);
  const pick = act3
    ? Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy && c.tier === 1).map((c) => c.chessId)
    : chessOfTier(1);
  const a = give(h.m, ps, pick[0], 'hand', 2);
  const b = give(h.m, ps, pick[1], 'hand', 5);
  ps.recompute();
  const before = h.sent.length;
  assert.ok(h.drive(() => h.m.phase === PHASE.COMBAT), 'combat reached');
  const start = h.sent.slice(before).map(([pid, msg]) => (pid === 'p_0' && msg.t === 'b.start' ? msg : null)).find(Boolean);
  assert.ok(start, 'b.start sent');
  return { h, ps, start, a, b };
}

test('规程: b.start carries the 整备区 pieces on the hand row (slot = column), public UnitInfo without private keys', () => {
  const { h, ps, start, a, b } = firstStart('act3autochess');
  assert.ok(Array.isArray(start.bench), 'bench sent');
  const held = ps.hand.filter(Boolean);
  assert.equal(start.bench.length, held.length, 'every held piece');
  const byUid = new Map(start.bench.map((u) => [u.uid, u]));
  for (const [piece, slot] of [[a, 2], [b, 5]]) {
    const u = byUid.get(piece.uid);
    assert.ok(u, `piece in slot ${slot}`);
    assert.equal(u.x, slot);
    assert.equal(u.y, GEO.HAND_ROW);
    assert.equal(u.area, 'hand');
    assert.equal(u.side, 'ally');
    assert.equal(u.ownerId, 'p_0');
    assert.equal(u.defId, piece.id);
  }
  for (const u of start.bench) for (const k of ['hand', 'funds', 'temp', 'shop']) assert.ok(!(k in u), `no private key ${k}`);
  // a resend (reconnect / resync) shows the battle's own list, not a later hand
  const f = h.m.fields.find((x) => x.players.includes('p_0'));
  assert.ok(h.m._startMsg(f, 'p_0').bench === start.bench || JSON.stringify(h.m._startMsg(f, 'p_0').bench) === JSON.stringify(start.bench));
  h.m.dispose();
});

test('盟约 (the default season): no bench in b.start', () => {
  const { h, start } = firstStart(undefined);
  assert.ok(!('bench' in start), 'no bench key');
  h.m.dispose();
});
