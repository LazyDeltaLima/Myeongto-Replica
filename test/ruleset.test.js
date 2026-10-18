// test/ruleset.test.js — 규칙 모드 (shared/ruleset.js): the option table's invariants (classic = every official value, casual
// = every casual value), preset resolution, the matchmaking key and the battle spec flags; the custom preset's settings
// (sanitizeCustom, the options read from them, customDiffs), its round plan and curves (maintainer decisions 2026-10-18).
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import {
  RULE_OPTIONS, RULE_PRESETS, QUEUE_PRESETS, DEFAULT_PRESET, PRESET_LABELS, isRulePreset, isQueuePreset, resolveRuleset, rulesetKey,
  simRuleFlags, sanitizeCustom, optionsOfCustom, customDiffs, sameRuleset, rulesetWire, customRoundPlan, curveScale, CUSTOM_CURVE_POWER,
  customPrepSeconds, keepUnbanned,
  CUSTOM_OFFICIAL, CUSTOM_CASUAL, CUSTOM_LIMITS, CUSTOM_VERSION,
} from '../shared/ruleset.js';

const config = JSON.parse(readFileSync(new URL('../data/config.json', import.meta.url), 'utf8'));

test('every option has an official and a casual boolean, a scope and a label; sim options name their flag', () => {
  assert.ok(Object.keys(RULE_OPTIONS).length > 0);
  for (const [k, o] of Object.entries(RULE_OPTIONS)) {
    assert.equal(typeof o.official, 'boolean', k);
    assert.equal(typeof o.casual, 'boolean', k);
    assert.ok(['ui', 'match', 'sim'].includes(o.scope), k);
    assert.ok(typeof o.label === 'string' && o.label.length > 0, k);
    if (o.scope === 'sim') assert.ok(typeof o.flag === 'string' && o.flag.length > 0, k);
    assert.ok(Object.isFrozen(o), k);
  }
});

test('classic is every official value, casual every casual value; both list every option', () => {
  const classic = resolveRuleset('classic');
  const casual = resolveRuleset('casual');
  for (const [k, o] of Object.entries(RULE_OPTIONS)) {
    assert.equal(classic.options[k], o.official, `classic.${k}`);
    assert.equal(casual.options[k], o.casual, `casual.${k}`);
  }
  assert.deepEqual(Object.keys(classic.options).sort(), Object.keys(RULE_OPTIONS).sort());
  assert.deepEqual(Object.keys(casual.options).sort(), Object.keys(RULE_OPTIONS).sort());
});

test('the casual preset turns on the maintainer-chosen conveniences and relaxes 限伤 to a clamp (maintainer decision 2026-10-15)', () => {
  const { options } = resolveRuleset('casual');
  assert.equal(options.battlefieldInfo, true);
  assert.equal(options.infoReroll, true);
  assert.equal(options.bossRoutePreview, true);
  assert.equal(options.bossHitClamp, true);
  const c = resolveRuleset('classic').options;
  assert.deepEqual([c.battlefieldInfo, c.infoReroll, c.bossRoutePreview, c.bossHitClamp], [false, false, false, false]);
});

test('presets: menu order, labels, default classic; anything unknown resolves to the default; results are shared frozen objects', () => {
  assert.deepEqual([...RULE_PRESETS], ['classic', 'casual', 'custom']);
  assert.deepEqual([...QUEUE_PRESETS], ['classic', 'casual'], 'custom never queues (maintainer decision 2026-10-18)');
  assert.equal(DEFAULT_PRESET, 'classic');
  for (const p of RULE_PRESETS) assert.ok(PRESET_LABELS[p], p);
  assert.equal(isRulePreset('casual'), true);
  assert.equal(isRulePreset('custom'), true);
  assert.equal(isQueuePreset('custom'), false);
  for (const bad of [undefined, null, '', 'zany', 'CASUAL', 1, {}, []]) {
    assert.equal(isRulePreset(bad), false, JSON.stringify(bad));
    assert.equal(resolveRuleset(bad).preset, 'classic', JSON.stringify(bad));
  }
  assert.equal(resolveRuleset({ preset: 'casual' }), resolveRuleset('casual'));
  assert.equal(resolveRuleset(resolveRuleset('casual')), resolveRuleset('casual'));
  assert.ok(Object.isFrozen(resolveRuleset('casual')) && Object.isFrozen(resolveRuleset('casual').options));
});

test('matchmaking key = the preset; sim flags only where a preset leaves the official value', () => {
  assert.equal(rulesetKey('casual'), 'casual');
  assert.equal(rulesetKey(null), 'classic');
  assert.deepEqual(simRuleFlags('classic'), {}, 'a classic battle spec is unchanged');
  assert.deepEqual(simRuleFlags(null), {});
  assert.deepEqual(simRuleFlags('casual'), { bossHitClamp: true });
});

test('the switch tooltip: one line per preset without a colon inside, then the 限伤 footnote with BOSS_HIT_LIMIT', async () => {
  const { rulesetTips } = await import('../public/js/ui/ruleset.js');
  const { BOSS_HIT_LIMIT } = await import('../shared/constants.js');
  const lines = rulesetTips().split('\n');
  assert.equal(lines.length, RULE_PRESETS.length + 1);
  assert.equal(lines[0], '【经典】与官方规则相同');
  assert.equal(lines[1], '【休闲】使用战场信息、重新抽取、移动型领袖路线预览、领袖限伤放宽');
  assert.equal(lines[2], '【自定义】由创建者逐项设置 · 不能用于同盟匹配');
  for (const l of lines) assert.ok(!/[:：]/.test(l), `no colon in ${l}`);
  assert.ok(lines[3].startsWith('※ 领袖限伤放宽 — ') && lines[3].includes(BOSS_HIT_LIMIT.toLocaleString('en-US')), lines[3]);
  assert.equal(rulesetTips(QUEUE_PRESETS).split('\n').length, QUEUE_PRESETS.length + 1, 'the stats / queue lists name their presets only');
});

test("the room's 匹配补位 button shows its own queue's waiting count (difficulty × ruleset)", async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../public/js/screens/room.js', import.meta.url), 'utf8');
  assert.match(src, /queueCountOf\(queueCounts, resolveRuleset\(room\.ruleset\)\.preset, room\.difficulty\)/);
  assert.match(src, /data-testid="fill-waiting"/);
  const { queueCountOf } = await import('../public/js/ui/ruleset.js');
  const counts = { casual: { NORMAL: 2 }, classic: { NORMAL: 1 } };
  assert.equal(queueCountOf(counts, 'casual', 'NORMAL'), 2);
  assert.equal(queueCountOf(counts, 'classic', 'HARD'), 0);
  assert.equal(queueCountOf(null, 'classic', 'NORMAL'), 0);
});

test('custom settings: every field at its official value by default; numbers clamped and rounded, unknown values and keys dropped, lists sorted', () => {
  const none = sanitizeCustom(null);
  assert.deepEqual(none, CUSTOM_OFFICIAL);
  assert.equal(none.v, CUSTOM_VERSION);
  const c = sanitizeCustom({
    v: 99, extra: 1,
    bonds: { banCore: 9, banAddon: -2.4, noLayerCap: 'yes', pick: { yanShip: 'ban', raidShip: 'allow', bad: 'maybe', 'x y': 'ban' } },
    enemies: { hp: 5000, atk: 1, def: 149.6, res: 'x', curve: 'wild' },
    leaders: { hp: 250 },
    bosses: { ban: ['boss_5', 'boss_1', 'boss_5', 7, ''], hitMode: 'none', hitLimit: 1 },
    stages: { info: true, ban: ['b', 'a'] },
    flow: { rounds: 99, prep: 'x2', prepSec: 5, lpShared: true },
  });
  assert.equal(c.v, CUSTOM_VERSION);
  assert.equal('extra' in c, false);
  assert.equal(c.bonds.banCore, CUSTOM_LIMITS.banCore[1]);
  assert.equal(c.bonds.banAddon, 0);
  assert.equal(c.bonds.noLayerCap, false);
  assert.deepEqual({ ...c.bonds.pick }, { raidShip: 'allow', yanShip: 'ban' });
  assert.deepEqual(Object.keys(c.bonds.pick), ['raidShip', 'yanShip'], 'sorted keys');
  assert.deepEqual([c.enemies.hp, c.enemies.atk, c.enemies.def, c.enemies.res, c.enemies.curve], [1000, 10, 150, 100, 'official']);
  assert.equal(c.leaders.hp, 250);
  assert.deepEqual([...c.bosses.ban], ['boss_1', 'boss_5']);
  assert.equal(c.bosses.hitMode, 'none');
  assert.equal(c.bosses.hitLimit, CUSTOM_LIMITS.hitLimit[0]);
  assert.deepEqual([...c.stages.ban], ['a', 'b']);
  assert.deepEqual([c.flow.rounds, c.flow.prep, c.flow.prepSec, c.flow.lpShared], [20, 'x2', 30, true]);
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.bonds.pick) && Object.isFrozen(c.bosses.ban));
  assert.deepEqual(sanitizeCustom(JSON.parse(JSON.stringify(c))), c, 'idempotent');
});

test('custom ruleset: options read from the settings; casual settings give the casual options; sim flags only for a clamp', () => {
  const off = resolveRuleset({ preset: 'custom' });
  assert.equal(off.preset, 'custom');
  assert.deepEqual({ ...off.options }, { ...resolveRuleset('classic').options });
  assert.deepEqual(simRuleFlags(off), {});
  const cas = resolveRuleset({ preset: 'custom', custom: CUSTOM_CASUAL });
  assert.deepEqual({ ...cas.options }, { ...resolveRuleset('casual').options });
  assert.deepEqual(simRuleFlags(cas), { bossHitClamp: true });
  assert.deepEqual(simRuleFlags({ preset: 'custom', custom: { bosses: { hitMode: 'none' } } }), {}, 'no limit is a later step, not a clamp');
  assert.deepEqual({ ...optionsOfCustom(sanitizeCustom({ flow: { routePreview: true } })) },
    { battlefieldInfo: false, infoReroll: false, bossRoutePreview: true, bossHitClamp: false });
  assert.equal(rulesetKey(cas), 'custom');
  assert.equal(resolveRuleset(cas), cas, 'a resolved custom ruleset comes back as it is');
  assert.ok(Object.isFrozen(cas) && Object.isFrozen(cas.custom));
});

test('sameRuleset / rulesetWire: custom rulesets compare by their sanitized settings; the wire form round-trips', () => {
  const a = resolveRuleset({ preset: 'custom', custom: { enemies: { hp: 1500 }, stages: { ban: ['b', 'a'] } } });
  const b = resolveRuleset({ preset: 'custom', custom: { stages: { ban: ['a', 'b', 'a'] }, enemies: { hp: 1000 } } });
  assert.equal(sameRuleset(a, b), true);
  assert.equal(sameRuleset(a, { preset: 'custom', custom: { enemies: { hp: 900 } } }), false);
  assert.equal(sameRuleset('casual', { preset: 'casual' }), true);
  assert.equal(sameRuleset('casual', 'classic'), false);
  assert.equal(sameRuleset({ preset: 'custom' }, 'classic'), false, 'custom at official values is still custom');
  assert.deepEqual(rulesetWire('casual'), { preset: 'casual' });
  const w = JSON.parse(JSON.stringify(rulesetWire(a)));
  assert.equal(sameRuleset(resolveRuleset(w), a), true);
});

test('customDiffs: one path per differing setting (one per bond, leader and stage); a difficulty default given explicitly is none', () => {
  assert.deepEqual(customDiffs(null), []);
  assert.deepEqual(customDiffs(CUSTOM_CASUAL), ['bosses.hitMode', 'stages.info', 'stages.reroll', 'flow.routePreview']);
  const d = customDiffs({ bonds: { banCore: 3, pick: { yanShip: 'ban', sargonShip: 'allow' } }, enemies: { hp: 120 }, leaders: { res: 50 },
    bosses: { ban: ['boss_5'], hitLimit: 500000 }, stages: { ban: ['m1', 'm2'] }, flow: { rounds: 14, prep: 'x2', lpCapOff: true } },
  { bans: { core: 3, addon: 4 }, rounds: 14 });
  assert.deepEqual(d, ['bonds.pick.sargonShip', 'bonds.pick.yanShip', 'enemies.hp', 'leaders.res', 'bosses.ban.boss_5', 'bosses.hitLimit',
    'stages.ban.m1', 'stages.ban.m2', 'flow.prep', 'flow.lpCapOff']);
  assert.deepEqual(customDiffs({ bonds: { banCore: 3 }, flow: { rounds: 14 } }), ['bonds.banCore', 'flow.rounds'], 'no base: explicit is a difference');
  assert.deepEqual(customDiffs({ bosses: { hitMode: 'none', hitLimit: 500000 } }), ['bosses.hitMode'], 'no limit: its value does not count');
});

describe('custom round plan and curves', () => {
  const mode = (id) => config.modes[id];
  test('the official count is the official rounds; the final assault is last, the 机变 rounds keep their kind', () => {
    const p = customRoundPlan(mode('mode_multi_hard'), null);
    assert.deepEqual(p.rounds.map((r) => r.src), Array.from({ length: 14 }, (_, i) => i + 1));
    assert.deepEqual(p.rounds.filter((r) => r.kind === 'sp').map((r) => r.src), [3, 9, 11]);
    assert.equal(p.rounds.at(-1).kind, 'boss');
    assert.equal(p.hidden.src, 15);
    assert.equal(customRoundPlan(mode('mode_multi_funny'), null).hidden, null, '标准 has no hidden core');
  });
  test('fewer rounds drop normal rounds from the middle, those with stats another kept round has first; round 1, 机变 and the final assault stay', () => {
    const p = customRoundPlan(mode('mode_multi_hard'), 10);
    assert.equal(p.rounds.length, 10);
    assert.deepEqual(p.rounds.map((r) => r.src), [1, 2, 3, 4, 9, 10, 11, 12, 13, 14]);
    const six = customRoundPlan(mode('mode_multi_hard'), 6).rounds;
    assert.equal(six.length, 6);
    for (const keep of [1, 3, 9, 11, 14]) assert.ok(six.some((r) => r.src === keep), `keeps ${keep}`);
    assert.equal(customRoundPlan(mode('mode_single_funny'), 6).rounds.length, 6);
  });
  test('more rounds cycle the three late waves before the final assault, their steps rising on [ASSUMED]', () => {
    const p = customRoundPlan(mode('mode_multi_hard'), 18);
    assert.equal(p.rounds.length, 18);
    assert.deepEqual(p.rounds.slice(13).map((r) => `${r.src}${r.kind[0]}`), ['11e', '12e', '13e', '11e', '14b']);
    const k = p.rounds.map((r) => r.kHp);
    for (let i = 13; i < 18; i++) assert.ok(k[i] > k[i - 1], `rising at ${i + 1}`);
    assert.ok(p.hidden.kHp > mode('mode_multi_hard').enemyScale[15].kHp);
  });
  test('curveScale: on the official multipliers; gentle ¾ of the rise from round 1 (in its exponent), steep 1¼, flat round 1', () => {
    assert.deepEqual({ ...CUSTOM_CURVE_POWER }, { official: 1, gentle: 0.75, steep: 1.25, flat: 0 });
    assert.equal(curveScale(4.3, 1.2, 'official'), 4.3);
    assert.equal(curveScale(4.3, 1.2, 'flat'), 1.2);
    assert.ok(Math.abs(curveScale(1.2 * 16, 1.2, 'gentle') - 1.2 * 8) < 1e-9);
    assert.ok(Math.abs(curveScale(1.2 * 16, 1.2, 'steep') - 1.2 * 32) < 1e-9);
  });
  test('the plan carries the multipliers the match spawns with (config.json enemyScale), the added rounds rising on from them', () => {
    for (const id of Object.keys(config.modes)) {
      const m = mode(id);
      if (!m.enemyScale?.[1]) continue;
      for (const r of customRoundPlan(m, null).rounds) {
        assert.equal(r.hp, m.enemyScale[r.src].hp, `${id} r${r.src} hp`);
        assert.equal(r.atk, m.enemyScale[r.src].atk, `${id} r${r.src} atk`);
      }
    }
    const p = customRoundPlan(mode('mode_multi_abyss'), 16).rounds;
    assert.ok(p[13].hp > mode('mode_multi_abyss').enemyScale[13].hp && p[15].hp > mode('mode_multi_abyss').enemyScale[14].hp);
  });
});

test('customPrepSeconds: the official prep × the setting (rounded) or the fixed seconds; untimed stays untimed', () => {
  assert.equal(customPrepSeconds({ prep: 'official', prepSec: 90 }, 65), 65);
  assert.equal(customPrepSeconds({ prep: 'x1.5', prepSec: 90 }, 65), 98);
  assert.equal(customPrepSeconds({ prep: 'x2', prepSec: 90 }, 65), 130);
  assert.equal(customPrepSeconds({ prep: 'fixed', prepSec: 45 }, 195), 45);
  assert.equal(customPrepSeconds({ prep: 'fixed', prepSec: 45 }, null), null);
});

test('keepUnbanned: the bans leave one at least (all banned = the official list)', () => {
  const list = [['a', 1], ['b', 2], ['c', 3]];
  assert.deepEqual(keepUnbanned(list, ([id]) => id, ['a', 'c']), [['b', 2]]);
  assert.equal(keepUnbanned(list, ([id]) => id, ['a', 'b', 'c']), list);
  assert.equal(keepUnbanned(list, ([id]) => id, []), list);
});
