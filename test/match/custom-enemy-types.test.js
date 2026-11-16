// test/match/custom-enemy-types.test.js — the custom 规则's 特训敌人 types (shared/ruleset.js `types`, customEnemyTypes;
// maintainer request 2026-11-15) and the custom ruleset in 规程,
// on the real match path (harness → Match → setupMatchWaves → buildBattleSpec → createBattleFromSpec): without the
// settings the draws are a classic match's; a forced type is always drawn, a banned one never, the count sets how many
// (the rest of the 15 round slots go to 特训敌人·特异); the bond ban counts keep the season's range (customBanLimits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCustom, customDiffs, customEnemyTypes, customBanLimits, CUSTOM_LIMITS, OFFICIAL_TYPE_COUNT } from '../../shared/ruleset.js';
import { GameData } from '../../server/match/gamedata.js';
import { setupMatchWaves } from '../../server/match/waves.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { createRng } from '../../server/sim/rng.js';
import { getData } from '../../server/data.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { DATA, makeMatch } from './harness.js';

const ACT3_ID = 'act3autochess';
const ACT3 = hasGeneratedData() ? getData({ log: { warn() {}, error() {}, info() {} }, season: ACT3_ID }) : null;
const custom = (c) => ({ preset: 'custom', custom: c });
const setupOf = (m) => ({ stageId: m.stageId, factions: m.factions.join(), bossId: m.bossId, hiddenBossId: m.hiddenBossId, drawn: m.disabledBonds.join() });
const randomTypes = (data) => Object.values(data.factions.types).filter((t) => t.involveRandom).map((t) => t.type).sort();

test('the setting: official by default, sanitized, one diff per changed field', () => {
  assert.deepEqual(sanitizeCustom({}).types, { count: null, pick: {} });
  const c = sanitizeCustom({ types: { count: 9, pick: { FLY: 'force', DOT: 'ban', TIMES: 'allow', 'bad id!': 'ban' } } });
  // 'allow' is kept: it joins another season's type to the draw (shared/seasonBorrow.js; an own type reads it as 随机)
  assert.deepEqual(c.types, { count: CUSTOM_LIMITS.types[1], pick: { DOT: 'ban', FLY: 'force', TIMES: 'allow' } });
  assert.deepEqual(customDiffs({ types: { count: OFFICIAL_TYPE_COUNT } }), [], 'the official count is no difference');
  assert.deepEqual(customDiffs({ types: { count: 0, pick: { FLY: 'ban' } } }), ['types.count', 'types.pick.FLY']);
});

test('customEnemyTypes: null without settings; forced first, banned never, the count raised to the forced ones', () => {
  const list = ['A', 'B', 'C', 'D', 'E', 'F'];
  const keep = () => {};
  assert.equal(customEnemyTypes(list, 3, sanitizeCustom({}), keep), null);
  assert.equal(customEnemyTypes(list, 3, sanitizeCustom({ types: { pick: { ZZ: 'ban' } } }), keep), null, 'a type the season lacks changes nothing');
  assert.deepEqual(customEnemyTypes(list, 3, sanitizeCustom({ types: { pick: { E: 'force', A: 'ban', B: 'ban' } } }), keep), ['E', 'C', 'D']);
  assert.deepEqual(customEnemyTypes(list, 3, sanitizeCustom({ types: { count: 1, pick: { E: 'force', F: 'force' } } }), keep), ['E', 'F']);
  assert.deepEqual(customEnemyTypes(list, 3, sanitizeCustom({ types: { count: 0 } }), keep), []);
  assert.deepEqual(customEnemyTypes(list, 3, sanitizeCustom({ types: { count: 5, pick: { A: 'ban', B: 'ban', C: 'ban' } } }), keep), ['D', 'E', 'F'], 'fewer left than the count');
});

test('real match path (盟约): no type settings = the classic draws; force / ban / count hold over many seeds', () => {
  for (const seed of [3, 11]) {
    const a = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed, fake: true }).start();
    const b = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed, fake: true, ruleset: custom({ types: { count: null, pick: {} } }) }).start();
    assert.deepEqual(setupOf(b.m), setupOf(a.m));
    a.m.dispose(); b.m.dispose();
  }
  const gd = new GameData(DATA, 'mode_multi_hard');
  gd.custom = sanitizeCustom({ types: { count: 4, pick: { ELEMENT: 'force', FLY: 'ban' } } });
  const seen = new Set();
  for (let s = 1; s <= 40; s++) {
    const w = setupMatchWaves(gd, createRng(s));
    assert.equal(w.factions.length, 4);
    assert.ok(w.factions.includes('ELEMENT') && !w.factions.includes('FLY'), `seed ${s}: ${w.factions}`);
    for (const f of w.factions) seen.add(f);
    // each drawn type owns its 3 of the 15 round slots, 特训敌人·特异 the 3 others
    assert.equal(w.typeSlots.filter((t) => t === 'SPECIAL').length, 15 - 4 * 3);
  }
  assert.deepEqual([...seen].sort(), randomTypes(DATA).filter((t) => t !== 'FLY'), 'every type left to the draw comes up');
  gd.custom = sanitizeCustom({ types: { count: 0 } });
  const none = setupMatchWaves(gd, createRng(7));
  assert.deepEqual([none.factions.length, new Set(none.typeSlots).size], [0, 1], 'only 特训敌人·特异 rounds');
});

test('real match path (规程): a forced CRITIC type is drawn and its round fields a battle; the ban counts reach 5', { skip: !ACT3 }, () => {
  assert.deepEqual(customBanLimits(ACT3.config), { core: [0, 5], addon: [0, 5] });
  assert.deepEqual(customBanLimits(DATA.config), { core: [0, 3], addon: [0, 4] });
  const registry = createRegistry({ data: ACT3, log: { error() {}, warn() {}, info() {}, log() {} } });
  const h = makeMatch({ mode: 'solo', difficulty: 'HARD', modeId: 'mode_single_12', seed: 4, data: ACT3, season: ACT3_ID, registry, fake: true,
    ruleset: custom({ types: { count: 2, pick: { CRITIC: 'force', REBORN: 'force' } }, bonds: { banCore: 5, banAddon: 5 } }) }).start();
  assert.equal(h.m.gd.mode.modeId, 'mode_single_12');
  assert.deepEqual([...h.m.factions].sort(), ['CRITIC', 'REBORN']);
  assert.deepEqual(h.m.gd.bans(h.m.gd.difficulty), { core: 5, addon: 5 });
  const slots = h.m.factions.schedule.typeSlots;
  const r = slots.findIndex((t) => t === 'CRITIC' || t === 'REBORN') + 1;
  assert.ok(r >= 1, 'a round of a forced type');
  h.toPrep(Math.min(r, 13), { band: 'band_amiya' });
  const spec = buildBattleSpec({ battleId: 'types.normal', ...h.m._normalOpts(h.ps('p_0')) });
  const b = createBattleFromSpec(spec, undefined, { recordEvents: false, quiet: true });
  for (let i = 0; i < 30 * 10; i++) b.step();
  assert.ok(b.enemies.length > 0, 'enemies spawned');
  h.m.dispose();
  // 盟约 keeps its own range: a code made in 规程 asking 5 draws 3 / 4 there
  const g = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed: 2, fake: true, ruleset: custom({ bonds: { banCore: 5, banAddon: 5 } }) }).start();
  assert.deepEqual(g.m.gd.bans('HARD'), { core: 3, addon: 4 });
  g.m.dispose();
});
