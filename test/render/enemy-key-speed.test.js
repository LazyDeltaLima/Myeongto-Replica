// test/render/enemy-key-speed.test.js — an enemy prefab's animator key table (`_animations`) gives each key a playback
// `speed`, and until 2026-11-27 nothing read it (docs/rules/render.md 「적 키 표의 재생 배율」): 大鲍勃 walked its Move_Loop at 1×
// for the key's 0.45, and 深池逐火战士 / 深池逐火护卫 / 锋盔骑士团学徒 (Attack 1.4) swung their 1.5 s / 2 s clip at its own length.
// The client plays a key's clip at the speed asked × the row's speed (`SpineAnimator.PlayAnimation`), takes the ability's
// clip length as the clip ÷ it (`GetAnimationTimeInternal`) and, for an attack ability, asks once more for it
// (`AbstractAnimatedAbility.UpdatePlaybackSpeed` → `m_spineAnimSpeed`): the swing lasts clip ÷ speed, the strike comes at the
// OnAttack frame ÷ speed². tools/local-extract/attack_timing.py anim_speeds reads the speeds, tools/build-data.mjs applies
// them (and stops on a key it does not apply), tools/fetch-assets.mjs puts the walk's on the model's move role.
// Run: node --test test/render/enemy-key-speed.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import { TICK } from '../../server/sim/constants.js';
import { installFakePixi } from './fakepixi.js';

const read = (rel) => JSON.parse(fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8'));
const TIMING = read('tools/assets/local-attack-timing.json').enemies;
const ASSETS = read('data/assets.json').enemies;
const SEASONS = fs.readdirSync(new URL('../../data/seasons/', import.meta.url)).sort()
  .filter((s) => fs.existsSync(new URL(`../../data/seasons/${s}/enemies.json`, import.meta.url)));
const DATA = [['data', read('data/enemies.json')], ...SEASONS.map((s) => [s, read(`data/seasons/${s}/enemies.json`)])];
const WHY = 'the key table\'s playback speed (local-attack-timing.json `animSpeed`) must reach the sim\'s swing (data/*/enemies.json '
  + 'attackAnim: clip ÷ speed, strike ÷ speed²; `node tools/build-data.mjs --offline`, also `--season <id>`) and the view\'s walk '
  + '(data/assets.json move role `speed`: `node tools/fetch-assets.mjs --offline`) — docs/rules/render.md 「적 키 표의 재생 배율」';
const near = (a, b, eps = 0.0015) => Math.abs(a - b) <= eps;

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

/** Every enemy record of both seasons whose prefab row lists key speeds: [season, id, record, speeds]. */
function* sped() {
  for (const [season, j] of DATA) {
    for (const [id, e] of Object.entries(j.enemies ?? j)) {
      const sp = (TIMING[e?.spine] ?? TIMING[id])?.animSpeed;
      if (sp) yield [season, id, e, sp];
    }
  }
}

test('every key-table speed reaches the sim\'s attack record and the view\'s walk — both seasons', () => {
  const bad = [], seen = new Map();
  for (const [season, id, e, sp] of sped()) {
    for (const [key, { clip, speed }] of Object.entries(sp)) {
      if (key === 'Move') {
        if (e.moveAnim?.clip !== clip || e.moveAnim?.speed !== speed) { bad.push(`${id} (${season}): moveAnim ${JSON.stringify(e.moveAnim)}`); continue; }
        const m = ASSETS[e.spine ?? id]?.spineLocal ?? ASSETS[e.spine ?? id]?.spine;
        if (m && Object.hasOwn(m.animations || {}, clip)) {
          if (m.anims?.move?.loop !== clip || m.anims.move.speed !== speed) bad.push(`${id}: model walk ${JSON.stringify(m.anims?.move)}`);
          else seen.set(`${id} Move`, speed);
        }
        continue;
      }
      const a = e.attackAnim;
      if (a?.clip !== clip) continue;   // not this enemy's attack key (the build stops on any other key: checkEnemyKeySpeeds)
      const m = ASSETS[e.spine ?? id]?.spineLocal ?? ASSETS[e.spine ?? id]?.spine;
      const len = m?.animations?.[clip], at = m?.hits?.[clip]?.[0];
      if (a.speed !== speed || !near(a.dur, len / speed) || !near(a.hit, at / (speed * speed))) {
        bad.push(`${id} (${season}): ${key} ${JSON.stringify(a)} — clip ${len} s, OnAttack ${at}, speed ${speed}`);
      } else seen.set(`${id} ${key}`, [a.dur, a.hit]);
    }
  }
  assert.deepEqual(bad, [], `${WHY}\n${bad.join('\n')}`);
  // the cases that ran at 1× until 2026-11-27 (the sweep really ran over them)
  assert.equal(seen.get('enemy_1001_bigbo Move'), 0.45, '大鲍勃 walk');
  assert.equal(seen.get('enemy_2001_duckmi Move'), 0.7, '“神秘顾客” walk');
  assert.deepEqual(seen.get('enemy_1288_duskls Attack'), [1.071, 0.272], '深池逐火战士: 1.5 s ÷ 1.4, OnAttack 0.533 ÷ 1.96');
  assert.deepEqual(seen.get('enemy_1104_lfkght Attack'), [1.429, 0.493], '锋盔骑士团学徒: 2 s ÷ 1.4, OnAttack 0.967 ÷ 1.96');
  assert.ok([...seen.keys()].filter((k) => k.endsWith(' Move')).length >= 30, `${seen.size} speeds checked`);
});

test('深池逐火战士 blocked: the swing lasts its clip ÷ 1.4 and strikes at the OnAttack frame ÷ 1.4² — the view swings its clip at 1.4²', () => {
  const rec = read('data/enemies.json').enemy_1288_duskls;
  const h = makeBattle({
    defs: { chess: { t_wall: chessRec({ id: 't_wall', stats: { maxHp: 1e9, atk: 0, def: 0 }, skill: null }) }, enemies: { enemy_1288_duskls: { ...rec, stats: { ...rec.stats, moveSpeed: 0 } } } },
    units: [{ chessId: 't_wall', row: 10, col: 6 }], enemies: [{ key: 'enemy_1288_duskls', pos: [10, 6] }],
    content: 'none', autoFinish: false, timeLimit: 30, hooks: ['attack'], captureNoisy: true,
  });
  h.step();
  const e = h.enemy('enemy_1288_duskls');
  const t0 = h.b.time;
  assert.ok(h.runUntil(() => h.hooksOf('attack').some((c) => c.attacker === e), 3), 'it strikes');
  const t = h.hooksOf('attack').find((c) => c.attacker === e).t;
  assert.ok(Math.abs(t - t0 - 0.272) <= 2 * TICK + 1e-9, `the first strike ${(t - t0).toFixed(3)} s after the block — 0.533 ÷ 1.96 (it was 0.533)`);
  // the view: the model's OnAttack frame meets that strike, so the clip plays at 1.96 (render/spine.js swing)
  const m = ASSETS.enemy_1288_duskls.spine;
  const a = new SpineActor({ animations: Object.keys(m.animations).map((name) => ({ name })) }, m);
  assert.ok(a.swing(0.272), 'swings');
  assert.ok(near(a.spine.state.tracks[0].timeScale, m.hits.Attack[0] / 0.272, 0.01) && near(a.spine.state.tracks[0].timeScale, 1.96, 0.02),
    `Attack at ${a.spine.state.tracks[0].timeScale}`);
});

test('大鲍勃 walks its Move_Loop at the key\'s 0.45 (render/spine.js _walkSpeed); its idle at 1', () => {
  const m = ASSETS.enemy_1001_bigbo.spine;
  const a = new SpineActor({ animations: Object.keys(m.animations).map((name) => ({ name })) }, m);
  a.setBase('move');
  assert.equal(a.current, 'Move_Loop');
  assert.equal(a.spine.state.tracks[0].timeScale, 0.45, WHY);
  a.setBase('idle');
  assert.equal(a.spine.state.tracks[0].timeScale, 1, 'the idle');
});
