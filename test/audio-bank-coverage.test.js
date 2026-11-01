// Every official sound bank of a 선발 operator is played or listed (docs/rules/audio.md 「선발 소리 뱅크 커버리지」,
// 2026-11-01): 塔露拉's S3 fires exploded in silence because four of her banks never reached the data, and nothing said so.
// A bank counts as played when one of its sound files is in the asset manifest; the rest are in audio-bank-coverage-list.js.

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

/** {charId: {bank name without `battle.`: true}} of the picks' banks whose files the manifest never plays. */
function unsounded() {
  const banks = JSON.parse(readFileSync(OFFICIAL, 'utf8')).soundFXBanks;
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
  const played = new Set((JSON.stringify(manifest.audio).match(/\/assets\/audio\/[^"]+?\.mp3/g) || []).map((u) => u.toLowerCase()));
  const out = {}, all = new Set();
  for (const id of LOCAL_DIY_PICKS) {
    const code = id.split('_').slice(2).join('_');
    const word = new RegExp(`(?<![a-z0-9])${code}(?![a-z0-9])`);
    for (const b of banks) {
      if (!b.name.startsWith('battle.') || !word.test(b.name)) continue;
      const name = b.name.slice('battle.'.length);
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

test('each listed bank has a status of the list\'s grammar', () => {
  for (const [id, names] of Object.entries(UNSOUNDED)) {
    assert.ok(LOCAL_DIY_PICKS.includes(id), `${id} is a pick`);
    for (const [n, s] of Object.entries(names)) assert.match(s, /^(none|todo): \S/, `${id} ${n}`);
  }
});
