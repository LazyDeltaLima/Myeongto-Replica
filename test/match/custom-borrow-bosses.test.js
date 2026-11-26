// test/match/custom-borrow-bosses.test.js — a custom 规则 match drawing another season's 最终攻势 / 隐秘核心 leaders
// (shared/seasonBorrow.js `bosses.extra`; maintainer request 2026-11-25), on the real match path (harness → Match →
// setupMatchWaves → the boss round's fields → the sim): the borrowed record, its season's wave templates and enemies
// come with it, the draw takes it beside the own leaders of its group, its pool is its season's HP × the players ×
// the custom 敌方领袖 HP, its spawn takes the 敌方领袖 multipliers and its kit fights on both fields of the one pool;
// the browser's data store merges the same records, and the summary names it. docs/rules/ui.md 「규칙 모드 — 커스텀」.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { sanitizeCustom, customDiffs } from '../../shared/ruleset.js';
import { customBorrowIds, borrowKey, borrowPlan, withBorrowed, fitCustomToSeason, borrowSeasons, lendableBoss } from '../../shared/seasonBorrow.js';
import { GameData, bossBloodPoint } from '../../server/match/gamedata.js';
import { bossPoolHp } from '../../server/match/finalAssault.js';
import { borrowedData } from '../../server/match/borrow.js';
import { getData } from '../../server/data.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { createDataStore } from '../../public/js/data.js';
import { customSummary } from '../../public/js/ui/customSummary.js';
import { DATA, makeMatch } from './harness.js';

const ACT2_ID = 'act2autochess';
const ACT3_ID = 'act3autochess';
const QUIET = { warn() {}, error() {}, info() {}, log() {} };
const ACT3 = hasGeneratedData() ? getData({ log: QUIET, season: ACT3_ID }) : null;
const skip = !ACT3;
const custom = (c) => ({ preset: 'custom', custom: c });
/** every leader of a mode's group but none: the draw has only the borrowed ones (keepUnbanned keeps one if all are) */
const banGroup = (data, modeId, hidden) => Object.keys(data.config.modes[modeId][hidden ? 'hiddenBossWeights' : 'bossWeights'] || {});
const seasonFiles = (season) => (season === ACT3_ID ? ACT3 : DATA);

test('the settings: bosses.extra names the leaders borrowed; one diff each; the borrow key keeps its old form without them', () => {
  const c = sanitizeCustom({ bosses: { extra: ['boss_14', 'boss_11', 'bad id!', 'boss_11'] } });
  assert.deepEqual(c.bosses.extra, ['boss_11', 'boss_14']);
  assert.deepEqual(customDiffs(c), ['bosses.extra.boss_11', 'bosses.extra.boss_14']);
  assert.deepEqual(customBorrowIds(c), { stages: [], types: [], bosses: ['boss_11', 'boss_14'] });
  assert.equal(customBorrowIds(sanitizeCustom({})), null);
  assert.equal(borrowKey({ stages: ['a'], types: ['T'], bosses: [] }), 'a|T', 'no leaders: the key settings without them had');
  assert.equal(borrowKey(customBorrowIds(c)), '||boss_11,boss_14');
  assert.deepEqual(sanitizeCustom({}).bosses.extra, []);
});

test('withBorrowed: the leader, its season\'s wave templates and enemies; an own leader is never borrowed', { skip }, () => {
  const ids = { stages: [], types: [], bosses: ['boss_11', 'boss_14', 'boss_1'] };
  const plan = borrowPlan(DATA, [[ACT3_ID, ACT3]], ids);
  assert.deepEqual(plan.bosses, [['boss_11', ACT3_ID], ['boss_14', ACT3_ID]], 'boss_1 is the own season\'s');
  assert.equal(borrowPlan({ stages: DATA.stages, factions: DATA.factions }, [[ACT3_ID, ACT3]], ids), null, 'no own bosses.json: nothing to compare with, nothing borrowed');
  const d = withBorrowed(DATA, [[ACT3_ID, ACT3]], ids);
  assert.equal(d.bosses.boss_11.borrowed, ACT3_ID);
  assert.ok(d.bosses.boss_1 === DATA.bosses.boss_1, 'the own records stay');
  for (const k of ['act3autochess_h07_08', 'act3autochess_h07_08_s', 'act3autochess_h08_04', 'act3autochess_h08_04_s']) assert.ok(d.waves[k], `wave ${k}`);
  assert.ok(!d.waves.act3autochess_h07_09, 'another leader\'s template stays home');
  for (const k of Object.keys(DATA.waves)) assert.ok(d.waves[k] === DATA.waves[k], `own wave ${k}`);
  for (const k of ['enemy_9029_acfnc', 'enemy_9029_acfnc_2', 'enemy_9027_acfnca', 'enemy_9028_acfncb']) assert.ok(d.enemies[k], `enemy ${k}`);
  // every leader one season lacks the other lends (and only those)
  const lent3 = Object.values(ACT3.bosses).filter((b) => lendableBoss(b) && !DATA.bosses[b.bossId]).map((b) => b.bossId).sort();
  const lent2 = Object.values(DATA.bosses).filter((b) => lendableBoss(b) && !ACT3.bosses[b.bossId]).map((b) => b.bossId);
  assert.deepEqual(lent3, ['boss_11', 'boss_12', 'boss_13', 'boss_14', 'boss_15', 'boss_16', 'boss_17']);
  assert.deepEqual(lent2, ['boss_5']);
});

test('GameData: a borrowed leader joins its group at the mean of the group\'s own weights; its template in the round config; nothing moves without one', { skip }, () => {
  const c = sanitizeCustom({ bosses: { extra: ['boss_11', 'boss_14'] } });
  const gd = new GameData(borrowedData(DATA, ACT2_ID, c), 'mode_multi_hard', c);
  const off = new GameData(DATA, 'mode_multi_hard', sanitizeCustom({}));
  // 盟约 下半 co-op hard: 最终攻势 6·6·6·5·10·5·5, 隐秘核心 50·40·40 (activity_table bossInfoDict) — the mean, unrounded
  // (docs/rules/ui.md 「규칙 모드 — 커스텀」 「다른 시즌 리더 적」, maintainer decision 2026-11-26)
  const mean = (/** @type {[string, number][]} */ w) => w.reduce((t, [, v]) => t + v, 0) / w.length;
  assert.equal(mean(off.bossWeights(false)), 43 / 7);
  assert.equal(mean(off.bossWeights(true)), 130 / 3);
  assert.deepEqual(gd.bossWeights(false), [...off.bossWeights(false), ['boss_11', 43 / 7]]);
  assert.deepEqual(gd.bossWeights(true), [...off.bossWeights(true), ['boss_14', 130 / 3]]);
  // two borrowed leaders of one group both take the own mean (a borrowed one does not count toward it)
  const c2 = sanitizeCustom({ bosses: { extra: ['boss_11', 'boss_12'] } });
  const gd2 = new GameData(borrowedData(DATA, ACT2_ID, c2), 'mode_multi_hard', c2);
  assert.deepEqual(gd2.bossWeights(false), [...off.bossWeights(false), ['boss_11', 43 / 7], ['boss_12', 43 / 7]]);
  assert.equal(gd.roundCfg(14).bossTemplates.boss_11, 'act3autochess_h07_08');
  assert.equal(gd.roundCfg(15).bossTemplates.boss_14, 'act3autochess_h08_04');
  assert.equal(gd.roundCfg(14).bossTemplates.boss_14, undefined, 'a hidden leader only in the 隐秘核心 round');
  assert.ok(off.roundCfg(14) === DATA.config.modes.mode_multi_hard.rounds['14'], 'no borrow: the config entry itself');
  // a mode without 隐秘核心 draws no borrowed hidden leader
  const funny = new GameData(borrowedData(DATA, ACT2_ID, c), 'mode_multi_funny', c);
  assert.deepEqual(funny.bossWeights(true), []);
  // pool HP in a mode the lending season lacks: 盟约's single difficulties read 规程's co-op mode of that difficulty;
  // 规程's 规程等级 modes read 盟约's per-difficulty table
  assert.equal(bossBloodPoint(ACT3.bosses.boss_11, 'mode_single_hard', 'HARD'), ACT3.bosses.boss_11.bloodByMode.mode_multi_hard);
  assert.equal(bossBloodPoint(DATA.bosses.boss_5, 'mode_single_7', 'NORMAL'), DATA.bosses.boss_5.bloodPoint.NORMAL);
  for (const id of Object.keys(DATA.bosses)) for (const m of ['mode_single_hard', 'mode_multi_normal', 'mode_training_1']) {
    assert.equal(bossBloodPoint(DATA.bosses[id], m, DATA.config.modes[m].difficulty), DATA.bosses[id].bloodPoint[DATA.config.modes[m].difficulty] ?? DATA.bosses[id].bloodPoint.FUNNY, `own ${id} ${m}`);
  }
});

/** the boss round of a match with four bot seats, its fields waiting for the test (instant: false) */
function bossRound(opts, hidden) {
  const seats = [0, 1, 2, 3].map((i) => ({ seat: i, playerId: `ai_${i}`, name: `AI${i}`, isBot: true, connected: true }));
  const h = makeMatch({ mode: 'coop', seats, captureFrames: false, instant: false, ...opts }).start();
  h.toPrep(1);
  const m = h.m;
  m.round = hidden ? m.gd.hiddenRound : m.gd.bossRound;
  m.teamLp = 400;
  m._planBossWaves();
  m.startFinalAssault(hidden);
  return h;
}

/**
 * 10 game s of the boss fields: on each the leader `key` stands with its HP the one pool's (a hit on it drains the
 * pool: server/sim/damage.js), and the fight runs on
 */
function fightBoss(m, key) {
  const fields = m.fields.filter((f) => f.battle);
  assert.ok(fields.length >= 1);
  for (let i = 0; i < 300; i++) for (const f of fields) if (!f.battle.finished) f.battle.step();
  for (const f of fields) {
    const lead = f.battle.enemies.find((e) => (e.key ?? e.defId) === key);
    assert.ok(lead?.alive && lead.isBoss, `${f.fieldId}: the leader ${key} is on the field`);
    assert.ok(lead.bossPool === m.bossPool || lead.bossPool?.pool === m.bossPool, `${f.fieldId}: its HP is the one pool`);
  }
  return fields;
}

for (const hidden of [false, true]) {
  const id = hidden ? 'boss_14' : 'boss_11';
  const tpl = hidden ? 'act3autochess_h08_04' : 'act3autochess_h07_08';
  test(`real match path (盟约 co-op): the 规程 leader ${id} is drawn, fights on its template, its HP the one pool at its season's value`, { skip }, () => {
    const c = { bosses: { extra: [id], ban: banGroup(DATA, 'mode_multi_hard', hidden) }, leaders: { hp: 150, atk: 200 } };
    const h = bossRound({ difficulty: 'HARD', seed: 4, ruleset: custom(c) }, hidden);
    const m = h.m;
    assert.equal(hidden ? m.hiddenBossId : m.bossId, id);
    assert.equal(m.gd.boss(id).borrowed, ACT3_ID);
    assert.equal(m.bossPool.maxHp, Math.round(ACT3.bosses[id].bloodByMode.mode_multi_hard * 4 * 1.5), 'its season\'s HP × 4 alive × 敌方领袖 150 %');
    assert.equal(m.bossPool.maxHp, bossPoolHp(m.gd, id, 4));
    const waves = m.bossWaves.map((w) => w.wave);
    assert.ok(waves.length === 2 && waves.every((w) => w.templateId === tpl), waves.map((w) => w.templateId).join());
    const lead = waves[0].spawns.find((s) => s.tag === 'boss');
    assert.equal(lead.enemyKey ?? lead.key, ACT3.bosses[id].enemyKey);
    assert.ok(Math.abs(lead.mods.atkMul - m.gd.leaderScale(m.round).atkMul) < 1e-9 && m.gd.leaderScale(m.round).atkMul > m.gd.enemyScale(m.round).atkMul, 'the 敌方领袖 multipliers');
    assert.equal(fightBoss(m, ACT3.bosses[id].enemyKey).length, 2, 'both pair fields');
    m.dispose();
  });
}

test('real match path (规程 solo 规程等级 7): the 盟约 leader 卢西恩 (boss_5) is drawn at its NORMAL HP and fights', { skip }, () => {
  const registry = createRegistry({ data: ACT3, log: QUIET });
  const c = { bosses: { extra: ['boss_5'], ban: banGroup(ACT3, 'mode_single_7', false) } };
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', modeId: 'mode_single_7', seed: 2, data: ACT3, season: ACT3_ID, registry, instant: false, ruleset: custom(c) }).start();
  const m = h.m;
  assert.equal(m.bossId, 'boss_5');
  h.toPrep(1, { band: 'band_amiya' });
  m.round = m.gd.bossRound;
  m.teamLp = 400;
  m._planBossWaves();
  m.startFinalAssault(false);
  assert.equal(m.bossPool.maxHp, DATA.bosses.boss_5.bloodPoint.NORMAL, 'solo: its season\'s NORMAL value × 1');
  assert.equal(m.bossWaves[0].wave.templateId, 'act2autochess_h07_05_s');
  fightBoss(m, 'enemy_2016_csphtm');
  m.dispose();
});

test('fitCustomToSeason: a borrowed leader stays where another season lends it, goes where it is the own one', { skip }, () => {
  const fit = (raw, season) => fitCustomToSeason(raw, seasonFiles(season), borrowSeasons(season).map((s) => [s, seasonFiles(s)]), { season });
  const r2 = fit({ bosses: { extra: ['boss_11', 'boss_5'] } }, ACT2_ID);
  assert.deepEqual(r2.rules.bosses.extra, ['boss_11'], '盟约 owns boss_5');
  assert.equal(r2.dropped, 1);
  const r3 = fit({ bosses: { extra: ['boss_11', 'boss_5'] } }, ACT3_ID);
  assert.deepEqual(r3.rules.bosses.extra, ['boss_5'], '规程 owns boss_11');
});

test('the summary: one line per group of the borrowed leaders, with their names', () => {
  const names = { boss_11: '假想敌：械', boss_14: '假想敌：械' };
  const lines = customSummary({ bosses: { extra: ['boss_11', 'boss_14'] } }, { name: (_k, id) => names[id] ?? id, hidden: (id) => id === 'boss_14' });
  assert.deepEqual(lines.map((l) => [l.key, l.tab]), [['bosses.extra.final', 'bosses'], ['bosses.extra.hidden', 'bosses']]);
  assert.match(lines[0].text, /「假想敌：械」/);
});

test("browser data store: setBorrow reads the borrowed leader and its templates as the server's match does", { skip }, async () => {
  const fileOf = (url) => {
    const m = /^\/data\/(?:s\/([^/]+)\/)?([a-z-]+\.json)$/.exec(url);
    if (!m) return null;
    const own = m[1] ? `data/seasons/${m[1]}/${m[2]}` : `data/${m[2]}`;
    const p = existsSync(own) ? own : `data/${m[2]}`;
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  };
  const fetch = async (url) => {
    const body = fileOf(String(url));
    return body == null ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => JSON.parse(body) };
  };
  const st = createDataStore({ fetch, retryDelays: [], timeoutMs: 0 });
  const c = sanitizeCustom({ bosses: { extra: ['boss_11'] } });
  await st.loadAll('stages', 'enemies', 'factions', 'bosses', 'waves');
  assert.equal(st.lookup('bosses', 'boss_11'), null, 'nothing borrowed yet');
  assert.equal(st.lendable('bosses', 'boss_11')?.bossId ?? null, null, 'the lending season\'s file is fetched on first ask');
  await st.setBorrow(customBorrowIds(c));
  assert.equal(st.lookup('bosses', 'boss_11')?.borrowed, ACT3_ID);
  const server = borrowedData(DATA, ACT2_ID, c);
  for (const n of ['bosses', 'waves', 'enemies']) {
    const mine = st.borrowRaw(n, await st.load(n));
    assert.deepEqual(Object.keys(mine).sort(), Object.keys(server[n]).sort(), `${n}: the sim's records are the server's`);
  }
  assert.equal(st.lendable('bosses', 'boss_12')?.bossId, 'boss_12', 'another season lends the name of a leader not borrowed');
  await st.setBorrow(null);
  assert.equal(st.lookup('bosses', 'boss_11'), null, 'borrowing ends with the room');
});
