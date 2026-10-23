// test/render/chain-attack-fx.test.js — a chain shot's effects (2026-10-16, official client, docs/rules/fx.md 「연쇄 공격」).
// The client's chain casters (惊蛰, 异客) shoot a projectile whose `_mainEffect` flies to the first unit; its chain graphic
// (ChainLightningEffectBehaviour) draws its own `_mainEffect` as the line through the struck units. char_modes.py used to
// list both as the mode's trail, so 异客's attacks and 惊蛰 S2's flew the line. The sim's bounce ('atk' prev → next,
// 'chain' / 'chainHeal') is no attack of its previous unit: before, the renderer ran the enemy's (estrikeFx) or the healed
// ally's (strikeFx) own attack cast for it. The line is one LineRenderer through the struck units (PlayLineEffect),
// at their hit points or their feet by the graphic's `_playEffectOnHitPoint` (modes `chainHit`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const THREE = await import('../../public/vendor/three.module.js');
const fxp = await import('../../public/js/render/fxplayer.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));

test('char_modes.py: a chain shot flies its projectile\'s trail; its chain graphic\'s line is the mode\'s `chain`', () => {
  const p = MODES.char_472_pasngr, l = MODES.char_306_leizi;
  assert.deepEqual(p.trail, [['pasngr_attack_trail'], ['pasngr_skill_02_trail']], '异客: projectile_chr_pasngr / _s2');
  assert.deepEqual(p.chain, [['pasngr_attack_line'], ['pasngr_attack_line']]);
  assert.deepEqual(l.trail, [['leizi_attack_01_trail'], ['leizi_skill_02_trail']], '惊蛰: projectile_leizi / _s2');
  assert.deepEqual(l.chain, [['leizi_attack_02_line'], ['leizi_skill_02_line']]);
  assert.deepEqual(MODES.char_4139_papyrs.chain, [['papyrs_line_01'], ['papyrs_line_01']], '莎草 (chain healer)');
  // `_playEffectOnHitPoint` of the graphic the hit plays (the root's first ChainLightningEffectBehaviour)
  assert.deepEqual(l.chainHit, [0, 0], '惊蛰: the feet');
  assert.deepEqual(p.chainHit, [0, 0], '异客: the feet');
  assert.equal(p.skills[2].chain.hit, 0, '异客 S3 projectile_chr_pasngr_s3: the feet');
  assert.deepEqual(MODES.char_4139_papyrs.chainHit, [1, 1], '莎草: the hit points');
  assert.deepEqual(MODES.char_1047_halo2.chainHit, [null, 1, null], '溯光星源 S1: its first graphic (hit points), not the second (feet)');
  for (const [id, m] of Object.entries(MODES)) {
    if (id.startsWith('$') || !m.chain) continue;
    m.chain.forEach((line, i) => {
      for (const n of line) assert.ok(!(m.trail?.[i] || []).includes(n), `${id} mode ${i}: ${n} is no trail`);
    });
  }
});

test('fxplayer.js setPath: every LineRenderer runs through the points in order, the texture stretched over the whole line', () => {
  const tex = { img: 'x.webp', tiling: [1, 1], offset: [0, 0] };
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const lineR = (texMode) => ({ pts: [[0, 0, 0], [1, 0, 0]], world: true, loop: false, width: 0.5, widthCurve: [], grad: { c: [[0, 1, 1, 1], [1, 1, 1, 1]], a: [[0, 1], [1, 1]], mode: 0 }, align: 0, texMode, mat: 'm', order: 0 });
  const def = { name: 'l', duration: 0.3, materials: { m: { shader: 'Mobile/Particles/Additive', tex: { _MainTex: tex } } }, clips: [], geoms: {},
    lib: { texture: () => new THREE.Texture() }, nodes: [node('l', -1), node('a', 0, { lineR: lineR(0) }), node('b', 0, { lineR: lineR(3) })] };
  const inst = new fxp.FxInstance(def, { quality: 'high' });
  assert.equal(inst.lines.length, 2);
  inst.setPath([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }]);
  inst.update(0.01);
  const u = (ln) => [0, 1, 2].map((k) => ln.batch.vb.array[k * 2 * 18 + 3]);
  for (const ln of inst.lines) assert.equal(ln.batch.n, 3, 'three points');
  const inv = inst.lines[0].root.matrixWorld.clone().invert();
  const mid = new THREE.Vector3(1, 0, 0).applyMatrix4(inv), d = inst.lines[0].batch.vb.array;
  assert.ok(Math.hypot(d[2 * 18] - mid.x, d[2 * 18 + 1] - mid.y, d[2 * 18 + 2] - mid.z) < 1e-5, 'the second point is the second unit');
  assert.deepEqual(u(inst.lines[0]).map((x) => +x.toFixed(4)), [0, 0.3333, 1], 'Stretch: once over the whole line');
  assert.deepEqual(u(inst.lines[1]), [0, 1, 2], 'RepeatPerSegment: once per segment');
  inst.setPath(null);
  inst.update(0.01);
  assert.equal(inst.lines[0].batch.n, 2, 'null: its authored points');
  inst.dispose();
});

const BIND = (id) => ({ modes: MODES[id].modes, cast: MODES[id].cast, hit: MODES[id].hit, trail: MODES[id].trail, chain: MODES[id].chain, chainHit: MODES[id].chainHit });
const files = {
  '/assets/local/fx/index.json': {
    bundles: {
      pasngr: ['pasngr_attack_trail', 'pasngr_attack_line', 'pasngr_attack_hit', 'pasngr_attack_start'],
      papyrs: ['papyrs_line_01'],
      enemy_x: ['enemy_x_attack_start'],
    },
  },
  '/assets/local/fx/modes.json': { char_472_pasngr: BIND('char_472_pasngr'), char_4139_papyrs: BIND('char_4139_papyrs'),
    char_306_leizi: BIND('char_306_leizi') },
  '/assets/local/fx/enemy-index.json': { bundles: { enemy_x: ['enemy_x_attack_start'] } },
  '/assets/local/fx/enemy-modes.json': {
    enemy_x: { modes: [{ name: 'Default', ranged: { cast: ['enemy_x_attack_start'], hit: [] }, melee: { cast: ['enemy_x_attack_start'], hit: [] } }] },
    $fx: { enemy_x_attack_start: ['enemy_x', 'enemy_x_attack_start'] },
  },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

test('fxgame.js: a bounce draws its shooter\'s chain line and is no attack of the unit it leaves', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high' });
    await settle();
    const op = { id: 1, x: 0, y: 0, alive: true, info: { id: 1, side: 'ally', defId: 'char_472_pasngr', skillIndex: 0 } };
    const e1 = { id: 11, x: 2, y: 0, alive: true, info: { id: 11, side: 'enemy', defId: 'enemy_x' } };
    const e2 = { id: 12, x: 3, y: 0, alive: true, info: { id: 12, side: 'enemy', defId: 'enemy_x' } };
    const e3 = { id: 13, x: 4, y: 0, alive: true, info: { id: 13, side: 'enemy', defId: 'enemy_x' } };
    const views = new Map([[1, op], [11, e1], [12, e2], [13, e3]]);
    // (no await between the events: in node the first spawn's WebP check fails the layer)
    layer.onEvent(['atk', 1, 11, 'bolt'], views);
    layer.onEvent(['dmg', 11, 100, 'arts', 0, 1], views);
    const hop1 = ['atk', 11, 12, 'chain', null, 1, 11], hop2 = ['atk', 12, 13, 'chain', null, 1, 11];
    layer.onEvent(hop1, views);
    layer.onEvent(['dmg', 12, 85, 'arts', 0, 1], views);
    layer.onEvent(hop2, views);
    layer.onEvent(['dmg', 13, 72, 'arts', 0, 1], views);
    assert.equal(layer.arrowKind(hop1), 'officialTrail', 'its line replaces render/fx.js\'s purple beam');
    assert.equal(layer.arrowKind(hop2), 'officialTrail', 'the chain carries on from the unit it struck');
    assert.equal(e1._fxCast, undefined, 'the enemy it leaves casts no attack of its own');
    assert.equal(e2._fxCast, undefined);
    // a bounce without a shooter the renderer knows keeps the stand-in
    views.set(14, { id: 14, x: 6, y: 0, alive: true, info: { id: 14, side: 'enemy', defId: 'enemy_x' } });
    const lone = ['atk', 14, 13, 'chain', null, 99, 14], bare = ['atk', 13, 14, 'chain'];
    layer.onEvent(lone, views);
    layer.onEvent(bare, views);
    assert.equal(layer.arrowKind(lone), 'chain');
    assert.equal(layer.arrowKind(bare), 'chain');
    // a chain heal: the ally it leaves is no healer
    const healer = { id: 2, x: 0, y: 1, alive: true, info: { id: 2, side: 'ally', defId: 'char_4139_papyrs', skillIndex: 0 } };
    const a1 = { id: 3, x: 1, y: 1, alive: true, info: { id: 3, side: 'ally', defId: 'char_472_pasngr', skillIndex: 0 } };
    const a2 = { id: 4, x: 2, y: 1, alive: true, info: { id: 4, side: 'ally', defId: 'char_472_pasngr', skillIndex: 0 } };
    views.set(2, healer); views.set(3, a1); views.set(4, a2);
    layer.onEvent(['atk', 2, 3, 'heal'], views);
    const hh = ['atk', 3, 4, 'chainHeal', null, 2, 3];
    layer.onEvent(hh, views);
    assert.equal(a1._fxCast, undefined, 'the healed ally casts no attack of its own');
    assert.equal(layer.arrowKind(hh), 'officialTrail', '莎草\'s papyrs_line_01');
  } finally { globalThis.fetch = fetch0; }
});
