// The custom rules summary of a 自定义 match (public/js/ui/customSummary.js; maintainer decision 2026-10-18): one line per
// setting group that differs from the official rules, with its value; the difficulty's own bond ban counts and round
// count are no difference; the co-op-only settings are left out of a solo match. The briefing, the draft's 本局信息 dialog
// (ui/matchInfo.js MatchInfo) and the in-game 本局信息 tab (ui/enemyDrawer.js) show it; the step header tags 休闲 / 自定义.
// The model is checked on a match started through the real match path (test/match/harness.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { customSummary } = await import('../../public/js/ui/customSummary.js');
const { matchInfoModel } = await import('../../public/js/ui/matchInfo.js');
const { data, getMode } = await import('../../public/js/data.js');
const { customDiffs, CUSTOM_OFFICIAL, rulesetWire } = await import('../../shared/ruleset.js');
const { makeMatch } = await import('../match/harness.js');

await data.loadAll('chess', 'bonds', 'bosses', 'stages', 'config');

const keys = (lines) => lines.map((l) => l.key);
const custom = (c) => ({ preset: 'custom', custom: c });

test('the official settings give no line; the difficulty\'s own ban counts and round count are no difference', () => {
  assert.deepEqual(customSummary(CUSTOM_OFFICIAL), []);
  assert.deepEqual(customSummary({ bonds: { banCore: 3, banAddon: 4 }, flow: { rounds: 14 } }, { bans: { core: 3, addon: 4 }, rounds: 14 }), []);
  const l = customSummary({ bonds: { banCore: 1 }, flow: { rounds: 8 } }, { bans: { core: 3, addon: 4 }, rounds: 14 });
  assert.deepEqual(keys(l), ['bonds.banCore', 'flow.rounds']);
  assert.equal(l[0].text, '核心盟约随机禁用 1（官方 3）');
  assert.equal(l[1].text, '8 回合（官方 14）');
});

test('one line per group, in the dialog\'s tab order, with the values and the names', () => {
  const c = {
    bonds: { noLayerCap: true, pick: { yanShip: 'ban', sargonShip: 'ban', egirShip: 'allow' } },
    enemies: { hp: 150, atk: 120, speed: 80, curve: 'steep' },
    leaders: { res: 200 },
    bosses: { ban: ['boss_1'], hitMode: 'clamp', hitLimit: 500000 },
    stages: { info: true, reroll: true, ban: ['s1'] },
    flow: { prep: 'x1.5', lpCapOff: true, lpShared: true, routePreview: true },
  };
  const name = (kind, id) => `${kind}:${id}`;
  const l = customSummary(c, { name });
  assert.deepEqual(keys(l), ['bonds.noLayerCap', 'bonds.pick.ban', 'bonds.pick.allow', 'enemies.stats', 'leaders.stats', 'enemies.curve',
    'bosses.ban', 'bosses.hit', 'stages.info', 'stages.reroll', 'stages.ban', 'flow.prep', 'flow.lpCapOff', 'flow.lpShared', 'flow.routePreview']);
  const text = Object.fromEntries(l.map((x) => [x.key, x.text]));
  assert.equal(text['bonds.pick.ban'], '始终禁用盟约：bond:sargonShip、bond:yanShip');
  assert.equal(text['enemies.stats'], '普通敌人：生命值 150% · 攻击力 120% · 移动速度 80%');
  assert.equal(text['leaders.stats'], '敌方领袖：法术抗性 200%');
  assert.equal(text['enemies.curve'], '成长曲线：陡峭');
  assert.equal(text['bosses.hit'], '领袖限伤：超过 500,000 的一击按 500,000 计算');
  assert.equal(text['flow.prep'], '休整期 ×1.5');
  // every tab of the dialog that counts a difference has a line
  const tabs = new Set(customDiffs(c).map((d) => d.split('.')[0]));
  assert.deepEqual(new Set(l.map((x) => x.tab)), tabs);
});

test('限伤: none, a cancelled hit at another value, a fixed prep; solo leaves the co-op-only lines out', () => {
  assert.equal(customSummary({ bosses: { hitMode: 'none' } })[0].text, '领袖限伤：不限制');
  assert.equal(customSummary({ bosses: { hitLimit: 1000000 } })[0].text, '领袖限伤：1,000,000 以上的一击无效');
  assert.equal(customSummary({ flow: { prep: 'fixed', prepSec: 45 } })[0].text, '休整期每回合 45 秒');
  const coop = { flow: { prep: 'x2', lpCapOff: true, lpShared: true, routePreview: true } };
  assert.deepEqual(keys(customSummary(coop)), ['flow.prep', 'flow.lpCapOff', 'flow.lpShared', 'flow.routePreview']);
  assert.deepEqual(keys(customSummary(coop, { solo: true })), ['flow.routePreview']);
});

test('a custom match on the real match path: matchInfoModel names the bonds, leaders and stages; other presets have no lines', () => {
  const stages = getMode('mode_multi_hard').stages;
  const c = { bonds: { pick: { yanShip: 'ban' } }, bosses: { ban: ['boss_1'] }, stages: { ban: [stages[0]] }, flow: { rounds: 10, lpShared: true } };
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed: 3, fake: true, ruleset: custom(c) }).start();
  // the public view as the client gets it (JSON over the wire)
  const pub = JSON.parse(JSON.stringify(h.m.publicView()));
  assert.equal(pub.ruleset.preset, 'custom');
  const mode = getMode(pub.modeId);
  const model = matchInfoModel(pub, { bonds: data.list('bonds'), chess: (id) => data.lookup('chess', id), mode });
  const text = Object.fromEntries(model.custom.map((x) => [x.key, x.text]));
  assert.deepEqual(Object.keys(text), ['bonds.pick.ban', 'bosses.ban', 'stages.ban', 'flow.rounds', 'flow.lpShared']);
  assert.equal(text['bonds.pick.ban'], `始终禁用盟约：${data.lookup('bonds', 'yanShip').name}`);
  assert.equal(text['bosses.ban'], `禁用领袖：${data.lookup('bosses', 'boss_1').name}`);
  assert.equal(text['stages.ban'], `禁用战场：${data.lookup('stages', stages[0]).name}`);
  assert.equal(text['flow.rounds'], `10 回合（官方 ${mode.lastRound}）`);
  // the same settings in a solo match: no co-op-only line
  const solo = makeMatch({ mode: 'solo', difficulty: 'HARD', seed: 3, fake: true, ruleset: custom(c) }).start();
  const spub = JSON.parse(JSON.stringify(solo.m.publicView()));
  assert.ok(!matchInfoModel(spub, { bonds: data.list('bonds'), mode: getMode(spub.modeId) }).custom.some((x) => x.key === 'flow.lpShared'));
  // 经典 / 休闲: no custom block
  for (const preset of ['classic', 'casual']) {
    const o = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed: 3, fake: true, ruleset: rulesetWire(preset) }).start();
    assert.equal(matchInfoModel(JSON.parse(JSON.stringify(o.m.publicView())), { bonds: data.list('bonds') }).custom, null, preset);
  }
});

test('the screens show it: MatchInfo (briefing, draft dialog), the in-game 本局信息 tab, the step header tag', () => {
  const info = read('public/js/ui/matchInfo.js');
  assert.match(info, /model\.custom \? html`<\$\{CustomRulesInfo\} lines=\$\{model\.custom\}/);
  assert.match(read('public/js/ui/enemyDrawer.js'), /model\.custom \? html`<\$\{CustomRulesInfo\} lines=\$\{model\.custom\} class="crs--sm"/);
  assert.match(read('public/js/ui/matchChrome.js'), /rules\.preset !== 'classic' \? html`<span class=\$\{`rtag rtag--\$\{rules\.preset\}`\} data-testid="match-ruleset">/);
});
