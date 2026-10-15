// test/ruleset.test.js — 규칙 모드 (shared/ruleset.js): the option table's invariants (classic = every official value, casual
// = every casual value), preset resolution, the matchmaking key and the battle spec flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RULE_OPTIONS, RULE_PRESETS, DEFAULT_PRESET, PRESET_LABELS, isRulePreset, resolveRuleset, rulesetKey, simRuleFlags,
} from '../shared/ruleset.js';

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
  assert.deepEqual([...RULE_PRESETS], ['classic', 'casual']);
  assert.equal(DEFAULT_PRESET, 'classic');
  for (const p of RULE_PRESETS) assert.ok(PRESET_LABELS[p], p);
  assert.equal(isRulePreset('casual'), true);
  for (const bad of [undefined, null, '', 'custom', 'CASUAL', 1, {}, []]) {
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
  for (const l of lines) assert.ok(!/[:：]/.test(l), `no colon in ${l}`);
  assert.ok(lines[2].startsWith('※ 领袖限伤放宽 — ') && lines[2].includes(BOSS_HIT_LIMIT.toLocaleString('en-US')), lines[2]);
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
