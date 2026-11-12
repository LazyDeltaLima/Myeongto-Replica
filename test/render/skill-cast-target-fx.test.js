// test/render/skill-cast-target-fx.test.js — a skill ability's swing-start CastTargetEffectOptions (docs/rules/fx.md 「시전 대상
// 이펙트 — 스킬 능력」): char_modes.py skill_effects writes the `_castTargetEffects` whose `_startEvent` is ON_CAST_START as
// skills[i].castTgt (timed by castTgtOpt), not as the skill's `target`; the effect layer plays them on the swing's target as the
// skill's attack starts its cast (fxgame.js skillCastTgtFx). 酒神 S1 暗夜回声 (skchr_phatm2_1, a next-attack skill): the sim
// announces 'skill' on, then that attack's 'swing' half a second before its two strikes — before, her aim marks waited for a
// damage at the skill's start and never played. Node has no WebP: the trace lists the prefabs the layer starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { activationEffects } from '../../public/js/render/fxmap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const ID = 'char_1042_phatm2';
const AIM = ['phatm2_skill_01_hit_aim_01', 'phatm2_skill_01_hit_02_aim_01'];

test('char_modes.py: 酒神 S1\'s ON_CAST_START cast-target marks are skills[0].castTgt, not its targets or its strikes\' hits', () => {
  const s1 = MODES[ID].skills[0];
  assert.deepEqual(s1.castTgt, AIM);
  for (const n of AIM) {
    assert.deepEqual(s1.castTgtOpt[n], { s: 2, e: 3, o: 1, t: 2 });
    assert.ok(!s1.target.includes(n), `${n} is no target`);
    assert.ok(!(s1.shotHit || []).includes(n));
  }
  assert.deepEqual(s1.hitGroups.g.map((g) => g[0]), ['phatm2_skill_01_hit_01', 'phatm2_skill_01_hit_02'], 'its two strikes keep their hits');
  // every other skill row: a castTgt name is never also a target (one list per moment)
  for (const [id, m] of Object.entries(MODES)) for (const sk of m.skills || []) for (const n of sk.castTgt || []) assert.ok(!sk.target.includes(n), `${id} ${n}`);
});

test('activationEffects: a skill\'s castTgt is never played on the caster by the name rule', () => {
  const m = MODES[ID];
  const a = activationEffects(m, [...AIM, 'phatm2_skill_01_start_01'], 0);
  for (const n of AIM) assert.ok(!a.start.includes(n) && !a.loops.includes(n), n);
  // a `_buff` name the rule would loop on the caster (the shape of 雪雉's crane sktok_sleep sleep_buff_start)
  const row = { modes: ['Default'], skills: [{ cast: [], castLoop: [], buff: [], target: [], targetBuff: [], castTgt: ['x_skill_01_buff_start'] }] };
  const b = activationEffects(row, ['x_skill_01_buff_start'], 0);
  assert.ok(!b.start.includes('x_skill_01_buff_start') && !b.loops.includes('x_skill_01_buff_start'));
});

const files = {
  '/assets/local/fx/index.json': { bundles: { phatm2: [...AIM, 'phatm2_skill_01_start_01', 'phatm2_skill_01_hit_01', 'phatm2_skill_01_hit_02', 'phatm2_attack_hit_01'] } },
  '/assets/local/fx/modes.json': { [ID]: {
    modes: ['Default', 'S2', 'S3'], skillMode: [null, 1, 2], cast: [[], [], []], hit: [['phatm2_attack_hit_01'], [], []], trail: [[], [], []],
    skills: [{ castLoop: ['phatm2_skill_01_start_01'], target: [], targetBuff: [], castTgt: AIM,
      castTgtOpt: Object.fromEntries(AIM.map((n) => [n, { s: 2, e: 3, o: 1, t: 2 }])) }, {}, {}] } },
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};

test('fxgame: 酒神 S1\'s aim marks on the swing\'s target as the skill\'s attack starts; none on a normal attack', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await new Promise((r) => setTimeout(r, 10));
    const her = { id: 1, x: 0, y: 0, alive: true, info: { id: 1, side: 'ally', kind: 'op', defId: 'chess_char_5_diy1_a', spine: ID, skillIndex: 0 } };
    const foe = { id: 2, x: 2, y: 0, alive: true, info: { id: 2, side: 'enemy', defId: 'enemy_x' } };
    const views = new Map([[1, her], [2, foe]]);
    const aims = () => seen.splice(0).filter((p) => p.names.some((n) => AIM.includes(n))).map((p) => `${p.names.join('+')}@${p.at}`);
    // a normal attack (the sim's order: swing with its target in the 6th field, the strike 0.5 s later)
    layer.onEvent(['swing', 1, 0.5, 'bolt', 0, 2], views);
    layer.update(0.5);
    layer.onEvent(['atk', 1, 2, 'bolt'], views);
    layer.onEvent(['dmg', 2, 100, 'arts', 0, 1, 0, 0], views);
    assert.deepEqual(aims(), [], 'no aim on a normal attack');
    layer.update(1);
    // S1: 'skill' on, its attack's swing in the same tick → both marks on the target at once
    layer.onEvent(['skill', 1, 1], views);
    layer.onEvent(['swing', 1, 0.5, 'bolt', 0, 2], views);
    assert.deepEqual(aims(), AIM.map((n) => `${n}@2`));
    layer.update(0.5);
    layer.onEvent(['atk', 1, 2, 'bolt'], views);
    layer.onEvent(['dmg', 2, 100, 'arts', 0, 1, 0, 0], views);
    layer.onEvent(['dmg', 2, 100, 'arts', 0, 1, 0, 1], views);
    layer.onEvent(['skill', 1, 0], views);
    assert.deepEqual(aims(), [], 'not again at the strikes');
  } finally { globalThis.fetch = fetch0; }
});
