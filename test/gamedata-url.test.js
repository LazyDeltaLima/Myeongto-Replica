// Official tables come from the public dump's master, but its activity table lost the mode's sections in the update of
// 2026-11-01: that file stays at the last commit with them, in every tool that downloads it (tools/gamedata-url.mjs), and so do the
// enemy tables (the current season keeps its enemies; the operators' changes apply to it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gamedataBase, PINNED_GAMEDATA } from '../tools/gamedata-url.mjs';

test('the activity table and the two enemy tables are pinned at one commit, the others follow master', () => {
  const sha = PINNED_GAMEDATA['excel/activity_table.json'];
  assert.match(sha, /^[0-9a-f]{40}$/);
  // the current season keeps the enemies it was played with (假想敌：铳 changed in the same update), the operators move on
  assert.deepEqual(Object.keys(PINNED_GAMEDATA).sort(), ['excel/activity_table.json', 'excel/enemy_handbook_table.json', 'levels/enemydata/enemy_database.json']);
  for (const rel of Object.keys(PINNED_GAMEDATA)) assert.ok(gamedataBase(rel).includes(`/${sha}/zh_CN/gamedata/`), rel);
  for (const rel of ['excel/skill_table.json', 'excel/battle_equip_table.json', 'excel/uniequip_table.json', 'excel/character_table.json']) {
    assert.ok(gamedataBase(rel).includes('/master/zh_CN/gamedata/'), rel);
  }
});

test('no download tool names the table repository\'s master for zh_CN itself', () => {
  for (const f of ['tools/build-data.mjs', 'tools/build-emotes.mjs', 'tools/build-i18n.mjs']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(src.includes('gamedataBase('), f);
    assert.ok(!/ArknightsGameData\/master\/zh_CN/.test(src), f);
  }
});
