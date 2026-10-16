// test/render/chain-attack-fx.test.js — a chain shot's effects (2026-10-16, decompile check, docs/rules/fx.md 「연쇄 공격」).
// The client's chain casters (惊蛰, 异客) shoot a projectile whose `_mainEffect` flies to the first unit; its chain graphic
// (ChainLightningEffectBehaviour) draws its own `_mainEffect` as the line through the struck units. char_modes.py used to
// list both as the mode's trail, so 异客's attacks and 惊蛰 S2's flew the line. The sim's bounce ('atk' prev → next,
// 'chain' / 'chainHeal') is no attack of its previous unit: before, the renderer ran the enemy's (estrikeFx) or the healed
// ally's (strikeFx) own attack cast for it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));

test('char_modes.py: a chain shot flies its projectile\'s trail; its chain graphic\'s line is the mode\'s `chain`', () => {
  const p = MODES.char_472_pasngr, l = MODES.char_306_leizi;
  assert.deepEqual(p.trail, [['pasngr_attack_trail'], ['pasngr_skill_02_trail']], '异客: projectile_chr_pasngr / _s2');
  assert.deepEqual(p.chain, [['pasngr_attack_line'], ['pasngr_attack_line']]);
  assert.deepEqual(l.trail, [['leizi_attack_01_trail'], ['leizi_skill_02_trail']], '惊蛰: projectile_leizi / _s2');
  assert.deepEqual(l.chain, [['leizi_attack_02_line'], ['leizi_skill_02_line']]);
  assert.deepEqual(MODES.char_4139_papyrs.chain, [['papyrs_line_01'], ['papyrs_line_01']], '莎草 (chain healer)');
  for (const [id, m] of Object.entries(MODES)) {
    if (id.startsWith('$') || !m.chain) continue;
    m.chain.forEach((line, i) => {
      for (const n of line) assert.ok(!(m.trail?.[i] || []).includes(n), `${id} mode ${i}: ${n} is no trail`);
    });
  }
});

const BIND = (id) => ({ modes: MODES[id].modes, cast: MODES[id].cast, hit: MODES[id].hit, trail: MODES[id].trail, chain: MODES[id].chain });
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
    const hop1 = ['atk', 11, 12, 'chain'], hop2 = ['atk', 12, 13, 'chain'];
    layer.onEvent(hop1, views);
    layer.onEvent(['dmg', 12, 85, 'arts', 0, 1], views);
    layer.onEvent(hop2, views);
    layer.onEvent(['dmg', 13, 72, 'arts', 0, 1], views);
    assert.equal(layer.arrowKind(hop1), 'officialTrail', 'its line replaces render/fx.js\'s purple beam');
    assert.equal(layer.arrowKind(hop2), 'officialTrail', 'the chain carries on from the unit it struck');
    assert.equal(e1._fxCast, undefined, 'the enemy it leaves casts no attack of its own');
    assert.equal(e2._fxCast, undefined);
    // a bounce no operator attack started (nothing aimed at its first unit) keeps the stand-in
    const lone = ['atk', 12, 11, 'chain'];
    views.set(14, { id: 14, x: 6, y: 0, alive: true, info: { id: 14, side: 'enemy', defId: 'enemy_x' } });
    const lone2 = ['atk', 14, 13, 'chain'];
    layer.onEvent(lone2, views);
    assert.equal(layer.arrowKind(lone2), 'chain');
    assert.equal(lone[3], 'chain');
    // a chain heal: the ally it leaves is no healer
    const healer = { id: 2, x: 0, y: 1, alive: true, info: { id: 2, side: 'ally', defId: 'char_4139_papyrs', skillIndex: 0 } };
    const a1 = { id: 3, x: 1, y: 1, alive: true, info: { id: 3, side: 'ally', defId: 'char_472_pasngr', skillIndex: 0 } };
    const a2 = { id: 4, x: 2, y: 1, alive: true, info: { id: 4, side: 'ally', defId: 'char_472_pasngr', skillIndex: 0 } };
    views.set(2, healer); views.set(3, a1); views.set(4, a2);
    layer.onEvent(['atk', 2, 3, 'heal'], views);
    const hh = ['atk', 3, 4, 'chainHeal'];
    layer.onEvent(hh, views);
    assert.equal(a1._fxCast, undefined, 'the healed ally casts no attack of its own');
    assert.equal(layer.arrowKind(hh), 'officialTrail', '莎草\'s papyrs_line_01');
  } finally { globalThis.fetch = fetch0; }
});
