// test/render/skill-aura-fx.test.js — 2026-10-24 (docs/rules/fx.md 「연결 전수 나머지 넷째 묶음」): what char_modes.py now reads
// from the client prefabs and render/ plays — a skill's aura abilities' own `_effects` on the caster for the skill
// (skills[i].buff: 浊心斯卡蒂 S3, 塞雷娅 S3, 深靛 S2), 归溟幽灵鲨's switch back from her 替身 (`dollBack`), and a summon's own start
// effect (modes.json `start` of every token: 凯尔希·思衡托's 战术锚点; one not extracted keeps the common one).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activationEffects, deployEffect, skillHeld } from '../../public/js/render/fxmap.js';
import { keyPlays } from '../helpers/fxBindings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const GAME = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const EXTRACT = readFileSync(path.join(ROOT, 'tools/local-extract/char_modes.py'), 'utf8');

test('a skill\'s aura `_effects` loop on the caster for the skill (skills[i].buff)', () => {
  const cases = [
    ['char_1012_skadi2', 2, 'skadi2_skill_03_buff_03'],   // the third of three: the `_buff` name rule kept two
    ['char_202_demkni', 2, 'demkni_skill_03_self'],
    ['char_469_indigo', 1, 'indigo_skill_02_buff_04'],
  ];
  for (const [id, i, n] of cases) {
    const bind = MODES[id];
    assert.ok(bind.skills[i].buff.includes(n), `${id} S${i + 1}: ${n} in its skill's buff list`);
    const prefabs = [...new Set([...bind.skills[i].buff, n])];
    assert.ok(activationEffects(bind, prefabs, i).loops.includes(n), `${id} S${i + 1}: ${n} loops`);
  }
  // a kit-owned one stays the kit's (纯烬艾雅法拉 S2's barrier: kitofficial.js 'shield')
  const ag = MODES.char_1016_agoat2;
  assert.ok(ag.skills[1].buff.includes('agoat2_skill_02_range_01'));
  assert.ok(!activationEffects(ag, ['agoat2_skill_02_range_01'], 1, new Set(['agoat2_skill_02_range_01'])).loops.includes('agoat2_skill_02_range_01'));
  assert.match(EXTRACT, /if isinstance\(d\.get\('_effects'\), list\) and \('_buffs' in d or '_passiveBuffs' in d\):\n\s+add\(e\['buff'\]/);
});

test('洛洛 S1 / S2: the two derived buffs of her skill\'s rockr_s_effect (SKILL_HELD with a key list)', () => {
  const plays = keyPlays();   // template rows
  for (const i of [0, 1]) assert.deepEqual(skillHeld('char_4040_rockr', i, null, plays), ['rockr_skill_buff_01', 'rockr_skill_buff_02']);
  assert.deepEqual(skillHeld('char_4040_rockr', 2, null, plays), []);
  assert.deepEqual(skillHeld('char_4040_rockr', 0, ['rockr_skill_buff_02'], plays), ['rockr_skill_buff_02'], 'extracted only');
});

test('归溟幽灵鲨 back from her 替身 to the 本体: `dollBack` plays once on \'swap\'', () => {
  assert.deepEqual(MODES.char_1023_ghost2.dollBack, ['ghost2_birth_01_start', 'ghost2_birth_empty_03']);
  assert.match(GAME, /if \(e\[1\] === 'swap' && v && q\(\) !== 'low'\) \{\n\s+const back = \(bindOf\(v\)\?\.dollBack \|\| \[\]\)/);
});

test('a summon\'s start effect: its own, \'common_empty\' none, an unextracted one the common', () => {
  assert.deepEqual(deployEffect({ owner: 'char_1052_kalts2', start: 'kalts2_skill_03_indicator_ground_01' }, true), { name: 'kalts2_skill_03_indicator_ground_01', override: false });
  assert.deepEqual(deployEffect(null, true), { name: 'common_call_start_01', override: false });
  assert.match(GAME, /const r = fx\.name === 'common_empty' \? null\n\s+: allyFx\(v, fx\.name\) \?\? \(v\.info\.kind === 'token' && !fx\.override \? allyFx\(v, deployEffect\(null, true\)\.name\) : null\);/);
  // every token's `_startEffect`, a pack this client lacks keeping its earlier entry
  assert.match(EXTRACT, /out\.setdefault\(tid, \{'owner': owners\[tid\]\}\)\['start'\] = d\['_startEffect'\]/);
  assert.match(EXTRACT, /fx\.update\(\{k: v for k, v in old\.items\(\) if k\.startswith\('token_'\)\}\)/);
});
