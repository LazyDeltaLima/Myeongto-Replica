// test/content/enemy-clip-keys.test.js — an enemy ability names its clip by key, and the enemy prefab's animator
// (`SpineAnimator._animations`: animKey → animName) turns that key into the model's clip name; a key the table lacks plays
// nothing (docs/rules/sim.md 「일반 공격 타이밍」 「적 클립의 키 표」). tools/local-extract/attack_timing.py writes the
// table's name beside the key (`clip`, '' = not in the table) and tools/build-data.mjs times the attacks and skill casts
// by it. Until 2026-11-14 the extract read the key alone: 35 abilities named a clip the model lacks — 假想敌：械's
// `SommonSquad` (`Skill_1` → `A_Skill_1`) cast for 0 s (`skillCast.miss`), 大鲍勃 swung its `Attack` instead of its
// `Attack2`. Every key of every enemy ability must now name a clip of the enemy's model (data/assets.json) or none.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
const TIMING = read('tools/assets/local-attack-timing.json').enemies;
const MODELS = read('data/assets.json').enemies;
const FILES = ['data/enemies.json', ...readdirSync(path.join(ROOT, 'data/seasons')).map((s) => `data/seasons/${s}/enemies.json`)]
  .filter((f) => existsSync(path.join(ROOT, f)));
const ENEMIES = FILES.map((f) => { const d = read(f); return [f, d.enemies ?? d]; });

const model = (id) => MODELS[id]?.spineLocal ?? MODELS[id]?.spine;
/** The clip an ability plays: the table's name (`clip`), else its key. */
const clipOf = (ab) => (typeof ab.clip === 'string' ? ab.clip : ab.anim);

/** [path, ability] of every ability of an enemy row (its modes, skills, a group's children; not the channel's own clips). */
function abilities(o, p = '', out = []) {
  if (!o || typeof o !== 'object') return out;
  if (Array.isArray(o)) { o.forEach((v, i) => abilities(v, `${p}.${i}`, out)); return out; }
  if (typeof o.anim === 'string' && o.anim) out.push([p || '.', o]);
  for (const [k, v] of Object.entries(o)) if (k !== 'chan') abilities(v, `${p}.${k}`, out);
  return out;
}

test('every enemy ability key names a clip of its model through the prefab animator key table, or none', () => {
  const bad = [];
  let n = 0;
  for (const [id, row] of Object.entries(TIMING)) {
    const sp = model(id);
    if (!sp?.animations) continue;
    for (const [p, ab] of abilities(row)) {
      n++;
      const clip = clipOf(ab);
      if (clip && !(sp.animations[clip] > 0)) bad.push(`${id}${p}: key ${ab.anim} → ${clip}`);
    }
  }
  assert.ok(n > 500, `only ${n} enemy abilities read — tools/assets/local-attack-timing.json lost its enemies?`);
  assert.deepEqual(bad, [], 'an enemy ability names a clip its model lacks — the key must go through the prefab animator\'s ' +
    '`_animations` table (attack_timing.py anim_table → `clip`); docs/rules/sim.md 「일반 공격 타이밍」 「적 클립의 키 표」:\n' + bad.join('\n'));
});

test('no enemy skill of any season is timed without its clip (skillCast.miss)', () => {
  const miss = [];
  const walk = (o, p) => {
    if (!o || typeof o !== 'object') return;
    if (o.miss) miss.push(p);
    for (const [k, v] of Object.entries(o)) walk(v, `${p}.${k}`);
  };
  for (const [f, en] of ENEMIES) for (const [id, e] of Object.entries(en)) walk(e.skillCast, `${f} ${id}`);
  assert.deepEqual(miss, [], 'an enemy skill casts for 0 s because data/assets.json lacks its clip — see the clip name ' +
    'through the prefab animator key table (docs/rules/sim.md 「일반 공격 타이밍」 「적 클립의 키 표」):\n' + miss.join('\n'));
});

test('the known cases: 假想敌：械 SommonSquad plays A_Skill_1, 大鲍勃 swings Attack2, 普通囚犯 Attack3 until it breaks free', () => {
  for (const [f, en] of ENEMIES) {
    if (!en.enemy_9029_acfnc) continue;
    const sc = en.enemy_9029_acfnc.skillCast.sommonsquad;
    assert.equal(sc.clip, 'A_Skill_1', f);
    assert.ok(sc.dur > 3, `${f}: SommonSquad dur ${sc.dur}`);
  }
  const base = ENEMIES[0][1];
  assert.equal(base.enemy_1001_bigbo.attackAnim.clip, 'Attack2');
  assert.equal(base.enemy_1116_liprr.attackAnim.clip, 'Attack3');
  assert.equal(base.enemy_1116_liprr.attackAnim.modes.L.clip, 'Attack');
});
