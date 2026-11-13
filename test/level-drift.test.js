// test/level-drift.test.js — tools/level-fields.mjs levelDrift: what a 规程 stage's scene level and its three battle
// sub-levels disagree on, warned by build-data. The generator once took m10's runes from the scene (盐坨子炮: ATK −300 / skill
// cost ×3) instead of the battle fields' (−400 / ×2) with nothing reported (a CN player's report, 2026-11-14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { levelDrift, subLevelPath } from '../tools/level-fields.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rune = (key, bb) => ({ key, blackboard: Object.entries(bb).map(([k, v]) => (typeof v === 'string' ? { key: k, valueStr: v } : { key: k, value: v })) });
const dev = (characterKey, mainSkillLvl = 1, overrideSkillBlackboard = null) => ({ position: { row: 0, col: 0 }, alias: `${characterKey}#1`, inst: { characterKey, level: 1, phase: 0 }, skillIndex: 0, mainSkillLvl, overrideSkillBlackboard, overrideTalents: null, uniEquipIds: null });
const level = ({ runes = null, globalBuffs = null, options = { characterLimit: 8 }, tokens = [] } = {}) => ({ runes, globalBuffs, options, predefines: { tokenInsts: tokens, characterInsts: [] } });

test('levelDrift: nothing when the scene and the battle fields agree (null and [] are both nothing; where a device stands does not count)', () => {
  const sub = level({ runes: [], globalBuffs: [], tokens: [dev('trap_013_blower', 2)] });
  const scene = level({ tokens: [{ ...dev('trap_013_blower', 2), position: { row: 30, col: 5 }, alias: 'trap_013_blower#7' }] });
  assert.deepEqual(levelDrift(scene, [sub, level({ tokens: [dev('trap_1112_acblzd')] }), sub]), []);
});

test('levelDrift: the runes, global buffs, options and device values the levels disagree on', () => {
  const cannon = (atk) => [rune('char_attribute_add', { char: 'trap_196_cnnon', ATK: atk })];
  const sub = level({ runes: cannon(-400), tokens: [dev('trap_196_cnnon', 1)] });
  const scene = level({ runes: cannon(-300), globalBuffs: [rune('env_gbuff_new', { key: 'x' })], tokens: [dev('trap_196_cnnon', 2)] });
  const odd = { ...sub, options: { characterLimit: 9 } };
  assert.deepEqual(levelDrift(scene, [sub, sub, odd]), [
    "options: the three sub-levels differ (sub_01's is used)",
    "runes: the scene's (char_attribute_add(char=trap_196_cnnon ATK=-300)) are not the battle fields' (char_attribute_add(char=trap_196_cnnon ATK=-400)) — the battle fields' are used",
    "globalBuffs: the scene's (env_gbuff_new(key=x)) are not the battle fields' (none) — the scene's are used",
    "device trap_196_cnnon: the battle fields' level / skill / overrides are not the scene's — the battle fields' are used",
  ]);
});

test('levelDrift on the cached 规程 levels: m10\'s runes and nothing else', { skip: !existsSync(join(ROOT, '.cache/gamedata-act3autochess/levels')) && 'no cached 规程 levels' }, () => {
  const dir = join(ROOT, '.cache/gamedata-act3autochess');
  const read = (rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
  const out = [];
  for (const n of [1, 2, 3, 4, 5, 6, 9, 10, 11, 12]) {
    const id = `act3autochess_m${String(n).padStart(2, '0')}`;
    if (!existsSync(join(dir, subLevelPath(id, 3)))) continue;
    for (const d of levelDrift(read(`levels/activities/act3autochess/level_${id}.json`), [1, 2, 3].map((k) => read(subLevelPath(id, k))))) out.push(`${id} ${d.split(':')[0]}`);
  }
  assert.deepEqual(out, ['act3autochess_m10 runes']);
});
