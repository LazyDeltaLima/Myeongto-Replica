// Every official sound bank of a 선발 operator is played or listed (docs/rules/audio.md 「선발 소리 뱅크 커버리지」,
// 2026-11-01): 塔露拉's S3 fires exploded in silence because four of her banks never reached the data, and nothing said so.
// A bank counts as played when one of its sound files is in the asset manifest; the rest are in audio-bank-coverage-list.js.
// That says the file can play, not that it plays at its moment: test/audio-impact-sweep.test.js and audio-cond-group.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCAL_DIY_PICKS } from '../shared/local-diy.js';
import { UNSOUNDED } from './audio-bank-coverage-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const skip = existsSync(OFFICIAL) ? false : 'no official audio table (.cache/gamedata, tools/build-data.mjs)';

/** The manifest URL of a bank sound's asset (Audio/Sound_Beta_2/Player/p_imp/x → /assets/audio/sfx/player/p_imp/x.mp3). */
const urlOf = (asset) => `/assets/audio/sfx/${String(asset).split('/').slice(-3).join('/')}.mp3`.toLowerCase();

/** A regexp of `w` as a word of a bank name. */
const asWord = (w) => new RegExp(`(?<![a-z0-9])${w}(?![a-z0-9])`);

/**
 * The words that name a pick's banks: its codename and (2026-11-01) its summons' own codes (data/backups.json `tokens`:
 * token_<n>_<codename>_<code>) — 酒神's 本能的召唤 sounds token_encdool_boom_start, without her codename.
 */
function wordsOf(id, tokens) {
  const code = id.split('_').slice(2).join('_');
  const own = Object.keys(tokens).filter((t) => asWord(code).test(t)).map((t) => t.split('_').slice(2).join('_').replace(new RegExp(`^${code}_`), ''));
  return [code, ...own.filter((c) => c && c !== code)].map(asWord);
}

/**
 * Whether a bank (name without `battle.`) belongs to an enemy, whatever words its name shares with a pick: the part after
 * the event names an enemy id (enemy_8010_mcnist, the 机械之心 of another event, shares the pick 机械师's code) or its
 * projectile (projectile_enemy_mcnist). Only that part's start counts: an operator's own bank may end in _enemy
 * (haruka_shield_break_enemy).
 */
const enemyBank = (name) => /^(enemy_\d+_|projectile_enemy_)/.test(name.split('.')[1] ?? '');

/** {charId: {bank name without `battle.`: true}} of the picks' banks whose files the manifest never plays. */
function unsounded() {
  const banks = JSON.parse(readFileSync(OFFICIAL, 'utf8')).soundFXBanks;
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
  const tokens = JSON.parse(readFileSync(path.join(ROOT, 'data', 'backups.json'), 'utf8')).tokens ?? {};
  const played = new Set((JSON.stringify(manifest.audio).match(/\/assets\/audio\/[^"]+?\.mp3/g) || []).map((u) => u.toLowerCase()));
  const out = {}, all = new Set();
  for (const id of LOCAL_DIY_PICKS) {
    const words = wordsOf(id, tokens);
    for (const b of banks) {
      if (!b.name.startsWith('battle.') || !words.some((w) => w.test(b.name))) continue;
      const name = b.name.slice('battle.'.length);
      if (enemyBank(name)) continue;
      all.add(`${id} ${name}`);
      if (!(b.sounds || []).some((s) => played.has(urlOf(s.asset)))) (out[id] ??= {})[name] = true;
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
