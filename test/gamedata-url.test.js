// Official tables come from the public dump's master, but its activity table lost the mode's sections in the update of
// 2026-11-01: that one file stays at the last commit with them, in every tool that downloads it (tools/gamedata-url.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gamedataBase, PINNED_GAMEDATA } from '../tools/gamedata-url.mjs';

test('the activity table is pinned, the others follow master', () => {
  const sha = PINNED_GAMEDATA['excel/activity_table.json'];
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.ok(gamedataBase('excel/activity_table.json').includes(`/${sha}/zh_CN/gamedata/`));
  assert.ok(gamedataBase('excel/skill_table.json').includes('/master/zh_CN/gamedata/'));
});

test('no download tool names the table repository\'s master for zh_CN itself', () => {
  for (const f of ['tools/build-data.mjs', 'tools/build-emotes.mjs', 'tools/build-i18n.mjs']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(src.includes('gamedataBase('), f);
    assert.ok(!/ArknightsGameData\/master\/zh_CN/.test(src), f);
  }
});
