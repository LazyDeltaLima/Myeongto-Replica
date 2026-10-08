// test/render/texas2-sword-rain-fx.test.js — user report 4 #4-5 (2026-10-08, LOCAL-PATCH.md 「사용자 제보 재수정」):
// 缄默德克萨斯 S3 剑雨滂沱's rain showed no falling sword. The sim's 'swordRain' drew texas2_skill_03_hit, a name the
// client never plays (a spark, no sword); ModeWithSwordRain's EmitSword shoots projectile_chr_texas2_s3_sword_rain, whose
// _effectsToTargetWhenStart is texas2_skill_03_hit_02 — the skill's target effect in modes.json (char_modes.py).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const HIT02 = path.join(ROOT, 'public/assets/local/fx/texas2/texas2_skill_03_hit_02.json');

test('#4-5 her S3 binding: the rain\'s target effect is the projectile\'s texas2_skill_03_hit_02', () => {
  assert.deepEqual(MODES.char_1028_texas2.skills[2].target, ['texas2_skill_03_hit_02']);
});

test('#4-5 a swordRain draws the skill\'s bound target effect, not a name picked by hand', () => {
  const at = SRC.indexOf("e[1] === 'swordRain'");
  assert.ok(at > 0);
  const branch = SRC.slice(at, SRC.indexOf('return true;', at));
  assert.match(branch, /extracted\(src, skillBind\(src\)\?\.target\)/);
  assert.doesNotMatch(SRC, /'texas2_skill_03_hit'/, 'the spark the client never plays is not drawn');
});

test('#4-5 the extracted hit_02 drops its sword from 5.5 tiles up in 0.13 s (skipped without public/assets)', { skip: !existsSync(HIT02) && 'no extracted fx' }, () => {
  const d = JSON.parse(readFileSync(HIT02, 'utf8'));
  const z = d.nodes.findIndex((n) => n.name === 'z');
  assert.equal(d.nodes[d.nodes.findIndex((n) => n.name === 'luojian') + 1].name, 'z');
  const pos = d.clips[0].tracks.find((t) => t.node === z && t.prop === 'pos');
  const keys = pos.curves[2];
  assert.equal(keys.at(-1)[0], 0.1333);
  assert.equal(keys.at(-1)[4], 0);
  assert.equal(keys[1][4], -5.5);
});
