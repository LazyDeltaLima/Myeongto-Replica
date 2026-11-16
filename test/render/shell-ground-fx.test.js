// test/render/shell-ground-fx.test.js — 2026-11-16 (official client: EffectBehaviour.OnProjectileReached). A projectile whose
// EffectBehaviour has `_forceReachTargetGround` / `_followTargetGround` makes its `_effectsWhenReached` at a fixed position: its
// own board x, y where it reached, on its target's ground. Which projectiles do so is extracted data (enemy_projectiles.py /
// enemy_bindings.py reach_ground → the shot / proj record's `ground`), not the 要塞 sub-profession the view tested before:
// docs/rules/fx.md 「포트리스 포탄의 폭발은 떨어진 자리에」 터지는 자리.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { bodyPoint } from '../../public/js/render/fx/camera.js';
import { onModelPlane } from '../../public/js/render/fxpoints.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const MODES = read('tools/assets/local-char-modes.json');
const CHESS = read('data/chess.json');
const ENEMIES = read('data/enemies.json');
const BINDINGS = read('tools/assets/local-enemy-bindings.json');
const records = Array.isArray(CHESS.chess) ? CHESS.chess : Object.values(CHESS.chess || CHESS);
const HORN = records.find((r) => r?.chessId === 'chess_char_5_08_a');
const HIT = 'horn_attack_01_hit_02';
const SFHU = 'enemy_1203_sfhu', SFHU_HIT = 'enemy_sfhu_attack_hit_range_01';

test('data: the shells whose reach effects land on the ground carry them as `ground` (号角, 灰毫, 烹泉), the others none', () => {
  assert.deepEqual(HORN.shot.base.ground, [HIT]);
  assert.deepEqual(HORN.shot.skills[0].ground, undefined, '号角 S1\'s shell projectile_chr_horn_s1: no ground reach effect');
  const ash = records.find((r) => r?.chessId === 'chess_char_2_18_a');
  assert.deepEqual(ash.shot.base.ground, ['ashlok_attack_01_hit']);
  assert.deepEqual(ENEMIES.enemies?.[SFHU]?.proj?.ground ?? ENEMIES[SFHU]?.proj?.ground, [SFHU_HIT]);
  assert.deepEqual(BINDINGS.$projectiles.projectile_enemy_sfhu.ground, [SFHU_HIT]);
  // every `ground` name is one of its projectile's reach effects
  for (const [k, p] of Object.entries(BINDINGS.$projectiles)) for (const n of p.ground || []) assert.ok(p.reached?.includes(n), `${k}: ${n}`);
});

const settle = () => new Promise((r) => setTimeout(r, 10));
const CAM = presetCamera('normal', { width: 1920, height: 1080 });
/** The hit point of a unit without a points table, on the ground under it (fxgame.js shotTo, shellLand). */
const landOf = (v) => {
  const p = onModelPlane(CAM, v.x, v.y, 0, bodyPoint(CAM, v, 0.5, v.x), { x: 0, y: 0, z: 0 });
  return [p.x, p.y, 0];
};
const near = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-6);

// 烹泉's ranged attack as extracted, and the same projectile without its flight (an AttachToTarget's record: no `move`) on a
// stand-in enemy id — one table for every layer: the effect tables are read once per module
const SFHU_PROJ = BINDINGS.$projectiles.projectile_enemy_sfhu;
const ATTACH = 'enemy_x_attach';
const epart = (p) => ({ modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: [], proj: p } }] });
const EMODES = {
  $fx: { [SFHU_HIT]: ['b', SFHU_HIT] },
  [SFHU]: epart({ key: SFHU_PROJ.key, mount: 2, reached: SFHU_PROJ.reached, ground: SFHU_PROJ.ground, move: SFHU_PROJ.move, speed: SFHU_PROJ.speed, raise: SFHU_PROJ.raise, noRaise: SFHU_PROJ.noRaise }),
  [ATTACH]: epart({ key: SFHU_PROJ.key, mount: 2, reached: SFHU_PROJ.reached, ground: SFHU_PROJ.ground }),
};
const FILES = {
  '/assets/local/fx/index.json': { bundles: { horn: [HIT, 'horn_attack_01_hit'], b: [SFHU_HIT] } },
  '/assets/local/fx/modes.json': { char_4039_horn: MODES.char_4039_horn },
  '/assets/local/fx/enemy-index.json': { bundles: { b: [SFHU_HIT] } },
  '/assets/local/fx/enemy-modes.json': EMODES,
};
async function withLayer(def, run) {
  const fetch0 = globalThis.fetch;
  const files = FILES;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p),
      unitDef: (info) => (info?.side === 'enemy' ? null : def), enemyDef: (id) => { const k = id === ATTACH ? SFHU : id; return ENEMIES.enemies?.[k] ?? ENEMIES[k] ?? null; } });
    await settle();
    const hits = (re) => seen.splice(0).filter((p) => p.names.some((n) => re.test(n))).map((p) => ({ name: p.names.join('+'), at: p.at ?? p.on ?? null, pt: p.pt ?? null }));
    await run({ layer, hits, step: (dt) => layer.update(dt, CAM) });
  } finally { globalThis.fetch = fetch0; }
}
const opView = () => ({ id: 1, x: 2, y: 9, alive: true, info: { id: 1, side: 'ally', defId: 'chess_char_5_08_a', spine: 'char_4039_horn', skillIndex: 0, kind: 'op' } });
const foe = (id, x, defId = 'enemy_x') => ({ id, x, y: 9, z: 0, alive: true, isEnemy: true, flags: 0, info: { id, side: 'enemy', defId } });

for (const [what, def, ground] of [
  ['its shot\'s `ground`, whatever its sub-profession', { ...HORN, subProfessionId: 'artsfghter' }, true],
  ['no `ground` on its shot: the blast on the target, though a 要塞', { ...HORN, shot: { ...HORN.shot, base: { ...HORN.shot.base, ground: undefined } } }, false],
]) {
  test(`operator shell: where its reach effect stands is ${what} (docs/rules/fx.md 「포트리스 포탄의 폭발은 떨어진 자리에」)`, () => withLayer(def, async ({ layer, hits, step }) => {
    const views = new Map([[1, opView()], [9, foe(9, 5)]]);
    layer.onEvent(['deploy', 1], views);
    step(0.1);
    hits(/./);
    layer.onEvent(['atk', 1, 9, 'bomb'], views);
    step(0.55);
    layer.onEvent(['dmg', 9, 100, 'phys', 0, 1], views);
    step(0.2);
    const got = hits(/_hit/);
    assert.equal(got.length, 1, JSON.stringify(got));
    assert.equal(got[0].name, HIT);
    if (ground) assert.ok(got[0].pt && near(got[0].pt, landOf(views.get(9))), `under the shell's end on the ground: ${JSON.stringify(got[0])} (the cause: the view placing it by the 要塞 sub-profession, not by the shot's \`ground\`)`);
    else assert.equal(got[0].at, 9, `on the target: ${JSON.stringify(got[0])}`);
    // a target that dies in flight: the ground blast still lands, a target-bound one does not
    layer.onEvent(['atk', 1, 9, 'bomb'], views);
    step(0.2);
    layer.onEvent(['die', 9, 'killed'], views);
    views.get(9).alive = false;
    step(0.6);
    assert.deepEqual(hits(/_hit/).map((h) => h.name), ground ? [HIT] : []);
  }));
}

test('enemy shell (烹泉): its reach effect stands under the shell\'s end on the ground; an AttachToTarget one (no `move`) on its target', async () => {
  for (const flying of [true, false]) {
    await withLayer(null, async ({ layer, hits, step }) => {
      const e = { ...foe(5, 6, flying ? SFHU : ATTACH), actor: { roles: { attack: { loop: 'Attack' } }, current: 'Move' } }, op = { id: 2, x: 3, y: 9, z: 0, alive: true, flags: 0, info: { id: 2, side: 'ally', defId: 'char_x' } };
      const views = new Map([[5, e], [2, op]]);
      layer.onEvent(['tick'], views);
      step(0.1);
      hits(/./);
      layer.onEvent(['swing', 5, 0.3, 'bomb', 0, 2], views);
      layer.onEvent(['atk', 5, 2, 'bomb'], views);
      step(0.6);
      layer.onEvent(['dmg', 2, 100, 'phys', 0, 5], views);
      step(0.2);
      const got = hits(/./);
      assert.equal(got.length, 1, `${flying}: ${JSON.stringify(got)}`);
      if (flying) assert.ok(got[0].pt && near(got[0].pt, landOf(op)), `under its end: ${JSON.stringify(got[0])} (the cause: proj.ground not read — fxgame.js ehitFx)`);
      else assert.equal(got[0].at, 2, `on the target: ${JSON.stringify(got[0])}`);
    });
  }
});
