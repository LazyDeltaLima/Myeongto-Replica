// 规程 solo (shared/seasons.js soloBondGroups): the core bonds the mode keeps on are split into two random halves, the
// briefing picks the half that plays (g.bondGroup; the left one until a pick) and the other half is the match's absent
// core bonds — no count draw. docs/rules/sim.md 「1인 규정 핵심 맹약 두 묶음」.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3 } from '../helpers/seasonPieces.js';
import { makeMatch } from './harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { botPickBand } from '../../server/match/bot.js';
import { bondsOff } from '../../shared/seasons.js';
import { PHASE } from '../../shared/constants.js';

const quiet = { error() {}, warn() {}, info() {}, log() {} };
const registry = createRegistry({ data: ACT3, log: quiet });
const solo = (modeId, seed = 3, o = {}) => makeMatch({ mode: 'solo', modeId, seed, registry, data: ACT3, season: 'act3autochess', ...o });
const coresOf = (gd, list) => list.filter((b) => gd.bond(b)?.isCore);
/** the mode's live core bonds (weight > 0, not switched off by the mode) */
const modeCores = (gd) => gd.bondIds.filter((b) => gd.bond(b)?.isCore && Number(gd.bond(b).weight) > 0 && !gd.modeInactiveBonds.has(b));
/** the bans the off bonds give: every visible chess whose core bonds (else all bonds) are off */
const bansFor = (m) => {
  const gd = m.gd;
  const off = new Set([...m.disabledBonds, ...m.staticInactiveBonds]);
  return gd.visibleChess.filter((id) => bondsOff(gd.chess(id)?.bonds, off, { coreBan: true, isCore: (b) => !!gd.bond(b)?.isCore }));
};

test('规程 solo splits the mode\'s core bonds in two halves; the right one is off until a pick (grades 1, 5, 20, 极速)', () => {
  for (const [modeId, half] of [['mode_single_1', 4], ['mode_single_4', 4], ['mode_single_funny', 4], ['mode_single_5', 5], ['mode_single_20', 5]]) {
    const h = solo(modeId);
    const { m } = h;
    const gd = m.gd;
    const g = m.bondGroups;
    assert.ok(g, `${modeId}: bond groups`);
    assert.deepEqual(g.groups.map((x) => x.length), [half, half], `${modeId}: ${half} + ${half}`);
    assert.deepEqual([...g.groups[0], ...g.groups[1]].sort(), modeCores(gd).sort(), `${modeId}: the groups are the mode's live core bonds`);
    if (half === 4) assert.ok(!g.groups.flat().some((b) => b === 'egirShip' || b === 'kazimierzShip'), `${modeId}: 에기르·카시미어 are off in the mode`);
    assert.equal(g.picked, 0);
    assert.deepEqual(coresOf(gd, m.disabledBonds).sort(), g.groups[1].slice().sort(), `${modeId}: the absent core bonds = the right group, no count draw`);
    assert.deepEqual(m.bannedChess, bansFor(m), `${modeId}: bans from the off bonds`);
    const pub = m.publicView();
    assert.deepEqual(pub.bondGroups, { groups: g.groups, picked: 0 }, `${modeId}: m.public bondGroups`);
    m.dispose();
  }
});

test('the groups differ by seed (a random half each match)', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 6; seed++) {
    const h = solo('mode_single_5', seed);
    seen.add(h.m.bondGroups.groups[0].join(','));
    h.m.dispose();
  }
  assert.ok(seen.size > 1, `six seeds drew one split: ${[...seen]}`);
});

test('g.bondGroup during the briefing swaps the absent core bonds, the bans and the pool; ready locks it', () => {
  const h = solo('mode_single_5', 7).start();
  const { m } = h;
  const gd = m.gd;
  assert.equal(m.phase, PHASE.INFO_CHECK);
  const [left, right] = m.bondGroups.groups;
  const addon = m.disabledBonds.filter((b) => !gd.bond(b)?.isCore);
  assert.deepEqual(m.handle('p_0', { t: 'g.bondGroup', idx: 1 }), { ok: true });
  assert.equal(m.bondGroups.picked, 1);
  assert.deepEqual(coresOf(gd, m.disabledBonds).sort(), left.slice().sort(), 'the left group is off now');
  assert.deepEqual(m.disabledBonds.filter((b) => !gd.bond(b)?.isCore), addon, 'the drawn add-on bonds stay');
  assert.deepEqual(m.bannedChess, bansFor(m));
  for (const id of m.bannedChess) assert.ok(!m.pool.has(id), `${id} banned yet in the pool`);
  const rightOnly = gd.visibleChess.find((id) => {
    const cores = coresOf(gd, gd.chess(id)?.bonds || []);
    return cores.length && cores.every((b) => right.includes(b));
  });
  assert.ok(rightOnly && m.pool.has(rightOnly), `an operator of the right group (${rightOnly}) is in the pool again`);
  h.flushAll();
  assert.equal(h.lastBc('m.public').bondGroups.picked, 1, 'm.public says the pick');
  // back and forth while not ready
  assert.deepEqual(m.handle('p_0', { t: 'g.bondGroup', idx: 0 }), { ok: true });
  assert.deepEqual(coresOf(gd, m.disabledBonds).sort(), right.slice().sort());
  assert.deepEqual(m.handle('p_0', { t: 'g.bondGroup', idx: 1 }), { ok: true });
  // reconnect: the full resync carries the pick
  m.onDisconnect('p_0');
  h.sent.length = 0;
  m.onReconnect('p_0');
  assert.equal(h.lastTo('p_0', 'm.public')?.bondGroups?.picked, 1, 'a reconnect sees the pick');
  // 准备就绪 is final
  m.handle('p_0', { t: 'g.infoReady' });
  assert.equal(m.handle('p_0', { t: 'g.bondGroup', idx: 0 }).error, 'WRONG_PHASE');
  assert.equal(m.bondGroups.picked, 1);
  h.toPrep(1, { band: 'band_amiya' });
  assert.deepEqual(coresOf(gd, m.disabledBonds).sort(), left.slice().sort(), 'the pick holds into the match');
  assert.equal(m.handle('p_0', { t: 'g.bondGroup', idx: 0 }).error, 'WRONG_PHASE', 'refused after the briefing');
  for (const s of h.ps('p_0').shop.slots || []) if (s?.kind === 'chess') assert.ok(!m.bannedChess.includes(s.id), `shop offers banned ${s.id}`);
  h.invariants();
  m.dispose();
});

test('an AI seat keeps the left group; AI 托管 plans around the group a pick switched off (bot.js bondOff)', () => {
  const bot = makeMatch({ mode: 'solo', modeId: 'mode_single_9', seed: 4, registry, data: ACT3, season: 'act3autochess',
    seats: [{ seat: 0, playerId: 'ai_0', name: 'AI0', isBot: true, connected: true }] }).start();
  assert.equal(bot.m.bondGroups.picked, 0);
  assert.deepEqual(coresOf(bot.m.gd, bot.m.disabledBonds).sort(), bot.m.bondGroups.groups[1].slice().sort());
  bot.m.dispose();

  const h = solo('mode_single_9', 4).start();
  const { m } = h;
  const gd = m.gd;
  m.handle('p_0', { t: 'g.bondGroup', idx: 1 });
  const off = new Set(m.bondGroups.groups[0]);
  const offBands = gd.bandIds().filter((id) => gd.bandBondIds(id).some((b) => off.has(b)));
  assert.ok(offBands.length > 0, 'some strategy rides on the left group');
  for (let i = 0; i < 200; i++) {
    const id = botPickBand(m, h.ps('p_0'));
    assert.ok(!offBands.includes(id), `draw ${i}: ${id} rides on a bond of the group not picked`);
  }
  // a seat under AI 托管 is ready at once and cannot pick
  m.handle('p_0', { t: 'g.autoplay', on: true });
  assert.ok(m.handle('p_0', { t: 'g.bondGroup', idx: 0 }).error);
  m.dispose();
});

test('only 规程 solo has groups: 规程 co-op and the 盟约 solo draw their absent core bonds; g.bondGroup is refused', () => {
  const coop = makeMatch({ mode: 'coop', humans: 1, bots: 1, seed: 5, registry, data: ACT3, season: 'act3autochess' }).start();
  assert.equal(coop.m.bondGroups, null);
  assert.equal(coop.m.publicView().bondGroups, undefined);
  assert.equal(coop.m.handle('p_0', { t: 'g.bondGroup', idx: 1 }).error, 'BAD_TARGET');
  coop.m.dispose();
  const act2 = makeMatch({ mode: 'solo', difficulty: 'HARD', seed: 5 }).start();
  assert.equal(act2.m.bondGroups, null);
  assert.equal(act2.m.handle('p_0', { t: 'g.bondGroup', idx: 1 }).error, 'BAD_TARGET');
  act2.m.dispose();
});
