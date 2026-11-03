// test/render/mode-switch-coverage.test.js — every mode a skill switches its operator to on the way (official client:
// tools/assets/local-char-modes.json `switchTo`) is one the effect layer draws the skill in, or is listed with its status in
// test/render/mode-switch-list.js — so a new operator whose skill changes mode mid-way (Mon3tr S3's S3_Reborn after her
// 【移动】, drawn with the S3 mode's heal shot until 2026-11-04) is caught before release, not by a player.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillModeIndex, SKILL_SUB_MODES } from '../../shared/skill-modes.js';
import { VARIANT_MODES } from '../../public/js/render/fxmap.js';
import { MODE_SWITCH_STATUS } from './mode-switch-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));

/** charId → { 'S<n> <mode>': true } of the switched modes the effect layer does not follow. */
function unfollowed() {
  const out = {};
  for (const [id, b] of Object.entries(MODES)) {
    if (!Array.isArray(b?.switchTo)) continue;
    b.switchTo.forEach((list, i) => {
      const pick = skillModeIndex(b.modes, i, b.skillMode);
      // (fxmap.js attackMode `sub`: a mode switched to on the way, a cast's variant; fxgame.js returnMode: the 【返回】's)
      const followed = new Set([...Object.values(SKILL_SUB_MODES[id] || {}), ...Object.values(VARIANT_MODES[id]?.[i] || {})]);
      if (pick > 0) followed.add(`${b.modes[pick]}_Restore`);
      for (const n of list) if (n !== pick && !followed.has(b.modes[n])) (out[id] ||= {})[`S${i + 1} ${b.modes[n]}`] = true;
    });
  }
  return out;
}

test('extracted: Mon3tr S3 switches to S3_Reborn as she lands and S3_Restore as she returns (monstr_s_3[route])', () => {
  const b = MODES.char_4179_monstr;
  assert.deepEqual(b.switchTo[2].map((n) => b.modes[n]).sort(), ['S3_Reborn', 'S3_Restore']);
  assert.deepEqual(unfollowed().char_4179_monstr, undefined, 'both followed: SKILL_SUB_MODES teleport, returnMode');
});

test('every mode a skill switches to on the way is drawn, or listed with its status', () => {
  const got = unfollowed();
  const missing = Object.entries(got).flatMap(([id, ks]) => Object.keys(ks).filter((k) => !MODE_SWITCH_STATUS[id]?.[k]).map((k) => `${id} ${k}`));
  assert.deepEqual(missing, [], 'a skill switches to a mode the effect layer does not follow: follow it (SKILL_SUB_MODES, VARIANT_MODES …) or list it');
});

test('every listed mode is still switched to and still unfollowed, with a status of the list\'s grammar', () => {
  const got = unfollowed();
  const stale = Object.entries(MODE_SWITCH_STATUS).flatMap(([id, ks]) => Object.keys(ks).filter((k) => !got[id]?.[k]).map((k) => `${id} ${k}: followed or gone — drop the entry`));
  assert.deepEqual(stale, []);
  for (const [id, ks] of Object.entries(MODE_SWITCH_STATUS)) for (const [k, st] of Object.entries(ks)) assert.match(st, /^(ok|todo): \S/, `${id} ${k}`);
});
