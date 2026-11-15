// 规程's 独立模拟 picks a 规程等级 on 选择模拟协议 (screens/lobby.js GRADES / GradeRow, docs/rules/ui.md 「규정 모드」): one row
// per mode, 极速模拟 first, each read from the season's mode record; the match screens name the grade (DifficultyTag
// modeId → shared/seasons.js modeGrade); 规程 has no 8-seat alliance yet (limitedSeason).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// the page's /data/<file> and /data/s/<season>/<file> from the repository's data/ (server/index.js serves them so)
globalThis.fetch = async (url) => {
  const m = /\/data\/(?:s\/([a-z0-9]+)\/)?([\w.-]+)$/.exec(String(url));
  try {
    const body = readFileSync(path.join(ROOT, 'data', ...(m?.[1] ? ['seasons', m[1]] : []), m?.[2] ?? ''), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { data } = await import('../../public/js/data.js');
const { GRADES, gradeInfo, gradedRoom, limitedSeason, lobbyGrade } = await import('../../public/js/screens/lobby.js');
const { gradeName, DifficultyTag } = await import('../../public/js/ui/components.js');
const { modeGrade, DEFAULT_SEASON } = await import('../../shared/seasons.js');
const { FAST_GRADE, MAX_GRADE } = await import('../../shared/constants.js');

const ACT3 = 'act3autochess';

test('the grades: 极速模拟 first, then 1–20; only a 规程 solo room has them; 规程 has no 自定义 / 8 seats', () => {
  assert.deepEqual(GRADES, [FAST_GRADE, ...Array.from({ length: MAX_GRADE }, (_, i) => i + 1)]);
  assert.deepEqual([gradedRoom('solo', ACT3), gradedRoom('coop', ACT3), gradedRoom('match', ACT3), gradedRoom('solo', DEFAULT_SEASON)], [true, false, false, false]);
  assert.deepEqual([limitedSeason(ACT3), limitedSeason(DEFAULT_SEASON)], [true, false]);
  assert.equal(lobbyGrade(), 1); // nothing remembered
});

test('modeGrade: a 规程 mode id names its grade; 盟约\'s and the co-op ones none', () => {
  assert.equal(modeGrade('mode_single_11', ACT3), 11);
  assert.equal(modeGrade('mode_single_funny', ACT3), FAST_GRADE);
  assert.equal(modeGrade('mode_single_funny', DEFAULT_SEASON), null);
  assert.equal(modeGrade('mode_multi_hard', ACT3), null);
  assert.equal(modeGrade('mode_single_21', ACT3), null);
  assert.equal(gradeName(FAST_GRADE), '极速模拟');
  assert.equal(gradeName(7), '规程等级 7');
});

test('gradeInfo reads each grade\'s own mode record of 规程', async () => {
  await data.setSeason(ACT3);
  try {
    await data.loadAll('config');
    const fast = gradeInfo(FAST_GRADE);
    assert.deepEqual([fast.code, fast.rounds, fast.hidden, fast.difficulty], ['AC-TB-1', 9, false, 'FUNNY']);
    const eleven = gradeInfo(11);
    assert.deepEqual([eleven.code, eleven.rounds, eleven.hidden, eleven.difficulty], ['AC-SP-11', 14, true, 'HARD']);
    assert.deepEqual([gradeInfo(1).hidden, gradeInfo(5).hidden], [false, true]); // 1–4 have no hidden core
    assert.ok(!/解锁/.test(gradeInfo(9).desc), 'no unlock clause');
  } finally { await data.setSeason(DEFAULT_SEASON); }
});

const textOf = (v) => (v == null || typeof v === 'boolean' ? '' : typeof v !== 'object' ? String(v) : Array.isArray(v) ? v.map(textOf).join('') : textOf(v.props?.children));

test('the match screens\' tag (briefing, HUD, result) names a 规程 grade, any other mode its difficulty', () => {
  assert.match(textOf(DifficultyTag({ difficulty: 'HARD', modeId: 'mode_single_11', season: ACT3 })), /规程等级 11/);
  assert.match(textOf(DifficultyTag({ difficulty: 'FUNNY', modeId: 'mode_single_funny', season: ACT3 })), /极速模拟/);
  assert.match(textOf(DifficultyTag({ difficulty: 'FUNNY', modeId: 'mode_single_funny', season: DEFAULT_SEASON })), /标准模拟/);
  assert.match(textOf(DifficultyTag({ difficulty: 'HARD', modeId: 'mode_multi_hard', season: ACT3 })), /绝境模拟/);
  assert.match(textOf(DifficultyTag({ difficulty: 'HARD' })), /绝境模拟/);
});
