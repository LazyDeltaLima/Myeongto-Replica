// test/render/cond-cast-fx.test.js — a cast effect the client binds only to a child ability that fires on a condition must not play
// with every attack. modes.json `cast` lists a mode's prefabs together; 涤火杰西卡 S3's ExtraBomb start played on each shot until
// 2026-11-04 (maintainer report; render/fxmap.js KIT_CAST). The groups come from the sound side's reading of the same client
// data (test/audio-cond-group-list.js): `plain` is what an attack is, every other child needs a condition.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COND_GROUPS } from '../audio-cond-group-list.js';
import { KIT_CAST } from '../../public/js/render/fxmap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = path.join(ROOT, 'public/assets/local/fx');
const NO_DATA = !existsSync(path.join(LOCAL, 'bindings.json')) && 'no extracted effects';

/**
 * Cast effects of a conditional child that fxmap.js KIT_CAST does not take off the attacks: 'ok: …' why that is right, or
 * 'todo: …' (STRONGHOLD-side open list). A new operator's entry settles it: KIT_CAST plus a kit moment, or the reason.
 */
const COND_CASTS = Object.freeze({
  'char_1033_swire2|S1|swire2_skill_01_start': 'todo: HealAlly\'s, on its coin buff and an injured ally — plays with every S1 attack',
  'char_1033_swire2|S2|swire2_skill_02_start': 'todo: SpawnToken\'s, on its coin and a free tile — plays with every S2 attack',
  'char_4039_horn|S2|horn_skill_02_start': 'todo: BlockedRangedAttack / SelfRangedAttack\'s — not RangedAttack\'s',
  'char_4039_horn|S2|horn_skill_02_start_01': 'todo: BlockedRangedAttack / SelfRangedAttack\'s — not RangedAttack\'s',
  'char_4207_branch|S2|branch_skill_02_range_01': 'todo: FirstAttack\'s, the mode\'s first attack only',
  'char_4207_branch|S2|branch_skill_02_start_01': 'todo: FirstAttack\'s, the mode\'s first attack only',
  'char_420_flamtl|Default|flamtl_attack_01_start_02': 'todo: Attack_T1 / Attack_T1+\'s, after a dodge (flamtl_t_1[evade])',
  'char_420_flamtl|S3|flamtl_skill_03_attack_start_01_2': 'todo: Attack_T1 / Attack_T1+\'s, after a dodge (flamtl_t_1[evade])',
  'char_420_flamtl|S3|flamtl_skill_03_attack_start_02': 'todo: Attack_T1 / Attack_T1+\'s, after a dodge (flamtl_t_1[evade])',
});

test('a cast effect bound only to a conditional child of an attack group is the kit\'s or is listed', { skip: NO_DATA }, () => {
  const rows = JSON.parse(readFileSync(path.join(LOCAL, 'bindings.json'), 'utf8')).rows;
  const modes = JSON.parse(readFileSync(path.join(LOCAL, 'modes.json'), 'utf8'));
  const found = new Set();
  for (const [key, group] of Object.entries(COND_GROUPS)) {
    const charId = key.split('|')[0];
    const others = Object.keys(group.others);
    const m = modes[charId];
    if (!m || !others.length) continue;
    (m.cast || []).forEach((list, i) => {
      for (const n of list) {
        const kids = rows.filter((r) => r.char === charId && r.fx === n && String(r.moment).startsWith('_castEffects') && r.key.includes(`/Modes/${m.modes[i]}/`))
          .map((r) => r.key.split('/').pop());
        if (kids.length && kids.every((k) => others.includes(k)) && !KIT_CAST.has(n)) found.add(`${charId}|${m.modes[i]}|${n}`);
      }
    });
  }
  assert.deepEqual([...found].filter((k) => !COND_CASTS[k]), [], 'put it in fxmap.js KIT_CAST with a kit moment, or list it with the reason');
  assert.deepEqual(Object.keys(COND_CASTS).filter((k) => !found.has(k)), [], 'no stale entry');
  for (const [k, v] of Object.entries(COND_CASTS)) assert.match(v, /^(ok|todo): /, k);
});

test('KIT_CAST names prefabs a kit plan plays', () => {
  const src = readFileSync(path.join(ROOT, 'public/js/render/fx/kitofficial.js'), 'utf8');
  for (const n of KIT_CAST) assert.ok(src.includes(`'${n}'`), `${n}: no plan plays it, so it would never show`);
});
