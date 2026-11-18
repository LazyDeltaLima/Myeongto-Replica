// test/render/horn-overload-fx.test.js — 号角 S2 过载: horn_skill_02_hit_02_02 once per overloaded shot, on the enemy it was fired at.
// Official client: her S2 attack abilities (charpack char_4039_horn Modes/S2/Body/Attack RangedAttack → projectile_chr_horn_s2,
// BlockedRangedAttack / SelfRangedAttack → projectile_chr_horn_s2_melee) hold two `_conditionalActions` behind the
// OverloadValidator (she holds horn_s_2[overload_mark] when the shell is made): ON_HIT_OBJECT (0) the arts splash on each
// object hit, ON_REACHED_TARGET (1) CreateEffect horn_skill_02_hit_02_02 on TARGET — Projectile.ActionController
// OnProjectileReached runs event 1 with the projectile's trace target. kitofficial.js played the effect on every enemy the
// sim's arts splash hit (its 'horn:s2:overload' moments, which the sim no longer sends), and none when the shell killed a
// lone target.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const CHESS = JSON.parse(readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8'));
const records = Array.isArray(CHESS.chess) ? CHESS.chess : Object.values(CHESS.chess || CHESS);
const record = (id) => records.find((r) => r && r.chessId === id) || null;

const CHAR = 'char_4039_horn', CHESS_ID = 'chess_char_5_08_a', HIT = 'horn_skill_02_hit_02_02';

test('plans: 号角 S2\'s overload marks her shots (skillFlag shellReach) and the reach plays its hit on the shot\'s target', () => {
  assert.equal(kitOfficialPlan('overload', { id: 1 }, 'horn', { skill: 1 })?.skillFlag, 'shellReach');
  assert.equal(kitOfficialPlan('overload', { id: 1 }, 'horn', { skill: 2 })?.skillFlag, undefined, 'S3 has no such action');
  assert.deepEqual(kitOfficialPlan('shellReach', { src: 1, id: 9 }, 'horn', { skill: 1 }).play.map((p) => [p.n, p.on]), [[HIT, 'id']]);
  assert.equal(kitOfficialPlan('shellReach', { src: 1, id: 9 }, 'horn', { skill: 2 }), null);
});

const settle = () => new Promise((r) => setTimeout(r, 10));
const files = {
  '/assets/local/fx/index.json': { bundles: { horn: [HIT, 'horn_skill_02_hit_02', 'horn_skill_02_trail_02', 'horn_skill_02_start_02'] } },
  '/assets/local/fx/modes.json': { [CHAR]: MODES[CHAR] },
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
async function withLayer(run) {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p),
      unitDef: (info) => (info?.side === 'enemy' ? null : record(info?.defId)) });
    await settle();
    const op = { id: 1, x: 2, y: 0, alive: true, info: { id: 1, side: 'ally', defId: CHESS_ID, spine: CHAR, skillIndex: 1, kind: 'op' } };
    const foe = (id, x) => ({ id, x, y: 0, z: 0, alive: true, info: { id, side: 'enemy', defId: 'enemy_x' } });
    const views = new Map([[1, op], [9, foe(9, 5)], [8, foe(8, 5.5)]]);
    const step = (dt) => layer.update(dt, null);
    layer.onEvent(['deploy', 1], views);
    step(0.1);
    layer.onEvent(['skill', 1, true], views);
    step(0.1);
    seen.length = 0;
    const hits = () => seen.splice(0).filter((p) => p.kind === 'spawn' && p.names[0] === HIT).map((p) => p.on);
    await run({ layer, views, step, hits });
  } finally { globalThis.fetch = fetch0; }
}
// one shell at 9 whose splash also hits 8: the physical hits, then the sim's arts splash on each live one
function shell(layer, views, step, { kills = false } = {}) {
  layer.onEvent(['atk', 1, 9, 'bomb'], views);
  step(0.6);
  layer.onEvent(['dmg', 9, 100, 'phys', 0, 1], views);
  if (kills) { layer.onEvent(['die', 9, 'killed'], views); views.get(9).alive = false; }
  layer.onEvent(['dmg', 8, 100, 'phys', 0, 1], views);
  if (!kills) layer.onEvent(['dmg', 9, 50, 'arts', 0, 1], views);
  layer.onEvent(['dmg', 8, 50, 'arts', 0, 1], views);
}

for (const kills of [false, true]) {
  test(`号角 S2 过载: one ${HIT} per shell, on the enemy it was fired at${kills ? ' (the shell killed it)' : ''} (docs/rules/fx.md 「포트리스 포탄의 폭발은 떨어진 자리에」)`, () => withLayer(async ({ layer, views, step, hits }) => {
    layer.onEvent(['fx', 'overload', 2, 0, { id: 1 }], views);
    shell(layer, views, step, { kills });
    assert.deepEqual(hits(), [9], `the cause: the hit played on every enemy of the sim's arts splash (kitofficial.js 'hit'), not once at the shell's reach on its trace target (fxgame.js shellReachFx)`);
    if (kills) return;
    shell(layer, views, step);
    assert.deepEqual(hits(), [9], 'the next shell: its own one');
  }));
}

test('号角 S2 before the overload, and a shot after the skill ended: no overload hit', () => withLayer(async ({ layer, views, step, hits }) => {
  shell(layer, views, step);
  assert.deepEqual(hits(), [], 'not overloaded yet');
  layer.onEvent(['fx', 'overload', 2, 0, { id: 1 }], views);
  layer.onEvent(['skill', 1, false], views);
  step(0.1);
  shell(layer, views, step);
  assert.deepEqual(hits(), [], 'the skill ended: its flag with it');
}));
