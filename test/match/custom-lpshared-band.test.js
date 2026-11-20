// test/match/custom-lpshared-band.test.js — the custom 「所有回合共享目标生命值」 leaves the strategies whose 指令 acts on the
// player's own 目标生命值 out of the draft (shared/ruleset.js lpSharedBandOff, maintainer decision 2026-11-21): 信仰搅拌机's
// 献身护卫 is refused while the alliance shares one pool (server/sim/content/bands/meta.js), and the pool is merged right
// after the draft, so the strategy did nothing the whole match. docs/rules/sim.md 「规程 전략 지령」.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, ERR } from '../../shared/constants.js';
import { lpSharedBandOff, OWN_LP_BAND_SKILLS } from '../../shared/ruleset.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { getData } from '../../server/data.js';
import { allowedBands } from '../../public/js/screens/bandDraft.js';
import { makeMatch } from './harness.js';

const REAL = { skip: !hasGeneratedData() };
const quiet = { warn() {}, error() {}, info() {}, debug() {} };
const ACT3 = hasGeneratedData() ? getData({ log: quiet, season: 'act3autochess' }) : null;
const custom = (c) => ({ preset: 'custom', custom: c });
const coop = (ruleset) => makeMatch({ mode: 'coop', modeId: 'mode_multi_normal', humans: 2, bots: 2, seed: 7, fake: true, data: ACT3, season: 'act3autochess', ruleset }).start();

test('lpShared: 信仰搅拌机 (band_protect) is not offered, refused when picked, and back without the setting', REAL, () => {
  const on = coop(custom({ flow: { lpShared: true } }));
  assert.ok(on.m.gd.lpShared);
  assert.ok(!on.m.gd.bandIds().includes('band_protect'),
    '信仰搅拌机 offered under the custom shared 目标生命值: GameData.bandAllowed must ask lpSharedBandOff (docs/rules/sim.md 「헌신적 호위」)');
  assert.ok(on.m.gd.bandIds().length > 10, 'the other strategies stay');
  assert.ok(on.drive(() => on.m.phase === PHASE.BAND_DRAFT && !on.m.players.get(on.m.draftTurn())?.isBot, { maxSteps: 1e5 }), 'a human\'s draft turn');
  const res = on.m.handle(on.m.draftTurn(), { t: 'g.band', bandId: 'band_protect' });
  assert.equal(res?.error, ERR.BAD_TARGET, 'a pick is refused');
  on.drive(() => on.m.phase === PHASE.PREP);
  assert.ok(on.m.order.every((p) => p.bandId && p.bandId !== 'band_protect'), 'nobody (bots included) holds it');
  on.m.dispose();
  for (const rs of [undefined, custom({}), custom({ flow: { lpCapOff: true } })]) {
    const off = coop(rs);
    assert.ok(off.m.gd.bandIds().includes('band_protect'), `offered with ${JSON.stringify(rs ?? 'classic')}`);
    off.m.dispose();
  }
});

test('lpShared: the client draft lists what the server allows (allowedBands = GameData.bandIds)', REAL, () => {
  for (const lpShared of [false, true]) {
    const h = coop(custom({ flow: { lpShared } }));
    const client = allowedBands(Object.values(ACT3.bands), 'MULTI', h.m.modeId, lpShared).map((b) => b.bandId);
    assert.deepEqual(client, h.m.gd.bandIds(), `lpShared ${lpShared}: the draft screen and the server disagree — allowedBands must ask lpSharedBandOff as GameData.bandAllowed does`);
    h.m.dispose();
  }
});

test('lpSharedBandOff: a strategy is left out exactly when one of its stages carries an own-LP effect', REAL, () => {
  const off = Object.values(ACT3.bands).filter((b) => lpSharedBandOff(b, true)).map((b) => b.bandId);
  assert.deepEqual(off, ['band_protect'], 'the known case ran');
  assert.ok(OWN_LP_BAND_SKILLS.includes('skill_drop_hp_to_low_gain_coin'));
  assert.equal(lpSharedBandOff(ACT3.bands.band_protect, false), false, 'only while shared');
});
