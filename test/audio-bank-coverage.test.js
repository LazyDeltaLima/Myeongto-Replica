// Every official sound bank of a 선발 operator is played or listed (docs/rules/audio.md 「선발 소리 뱅크 커버리지」,
// 2026-11-01): 塔露拉's S3 fires exploded in silence because four of her banks never reached the data, and nothing said so.
// A bank counts as played when one of its sound files is in the asset manifest; the rest are in audio-bank-coverage-list.js.
// That says the file can play, not that it plays at its moment: test/audio-impact-sweep.test.js and audio-cond-group.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { LOCAL_DIY_PICKS } from '../shared/local-diy.js';
import { UNSOUNDED } from './audio-bank-coverage-list.js';
import { OFFICIAL_AUDIO, readData, pickBanks, enemyBank, manifestUrls } from './helpers/audio-sweep.js';

const skip = existsSync(OFFICIAL_AUDIO) ? false : 'no official audio table (.cache/gamedata, tools/build-data.mjs)';

/** {charId: {bank name without `battle.`: true}} of the picks' banks whose files the manifest never plays. */
function unsounded() {
  const played = manifestUrls(readData('assets.json'));
  const out = {}, all = new Set();
  for (const [id, banks] of Object.entries(pickBanks(LOCAL_DIY_PICKS))) {
    for (const { name, files } of banks) {
      all.add(`${id} ${name}`);
      if (!files.some((f) => played.has(f))) (out[id] ??= {})[name] = true;
    }
  }
  return { out, all };
}

test('every official bank of a 선발 operator is played, or listed with its status', { skip }, () => {
  const { out, all } = unsounded();
  const missing = [];
  for (const [id, names] of Object.entries(out)) for (const n of Object.keys(names)) if (!UNSOUNDED[id]?.[n]) missing.push(`${id} ${n}`);
  assert.deepEqual(missing, [], 'unplayed banks not in test/audio-bank-coverage-list.js');
  // an entry whose bank is played now goes; one whose bank the local table lacks (an older cache) is left alone
  const stale = [];
  for (const [id, names] of Object.entries(UNSOUNDED)) for (const n of Object.keys(names)) if (all.has(`${id} ${n}`) && !out[id]?.[n]) stale.push(`${id} ${n}`);
  assert.deepEqual(stale, [], 'entries whose bank is played now');
});

test('an enemy\'s banks are told apart by their owner part only', () => {
  assert.ok(enemyBank('ON_ABILITY_START.enemy_8010_mcnist.attack.0') && enemyBank('ON_PROJECTILE_HIT.projectile_enemy_mcnist'));
  assert.ok(!enemyBank('ON_CUSTOM_TRIGGER.haruka_shield_break_enemy') && !enemyBank('ON_CUSTOM_TRIGGER.mcnist_shield') && !enemyBank('ON_POPUP'));
});

test('each listed bank has a status of the list\'s grammar', () => {
  for (const [id, names] of Object.entries(UNSOUNDED)) {
    assert.ok(LOCAL_DIY_PICKS.includes(id), `${id} is a pick`);
    for (const [n, s] of Object.entries(names)) assert.match(s, /^(none|todo): \S/, `${id} ${n}`);
  }
});
