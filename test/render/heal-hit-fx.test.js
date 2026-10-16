// test/render/heal-hit-fx.test.js — a heal shot's hit effects on its ally (2026-10-16, docs/rules/fx.md 「치료 명중」).
// The client's heal projectiles (赫默 projectile_silent, 莎草 projectile_chr_papyrs …) play their `_effectsWhenHit` on the
// ally they reach, as a damaging shot's on its enemy (modes.json `hit[mode]`). The sim sends no 'dmg' for a heal: before,
// nothing played on the healed ally — the render had no path from the 'heal' event to the healer's attack. The 'heal' now
// names its healer (damage.js), and fxgame.js healHit plays the hit of that healer's last heal attack on the ally.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const BIND = (id) => ({ modes: MODES[id].modes, cast: MODES[id].cast, hit: MODES[id].hit, trail: MODES[id].trail, chain: MODES[id].chain, chainHit: MODES[id].chainHit });
const files = {
  '/assets/local/fx/index.json': { bundles: { papyrs: ['papyrs_line_01', 'papyrs_hit_01'], silent: ['myrrh_attack_01_hit'] } },
  '/assets/local/fx/modes.json': { char_4139_papyrs: BIND('char_4139_papyrs'), char_108_silent: BIND('char_108_silent') },
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

test('char_modes.py: every 医疗 operator\'s heal shot has hit effects to play', () => {
  assert.deepEqual(MODES.char_4139_papyrs.hit, [['papyrs_hit_01'], ['papyrs_skill2_hit_01']], '莎草: projectile_chr_papyrs / _s1');
  assert.deepEqual(MODES.char_108_silent.hit, [['myrrh_attack_01_hit']], '赫默: projectile_silent');
});

test('fxgame.js healHit: the heal names its healer — the hit of that healer\'s heal attack plays on the ally, once', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await settle();
    const ally = (id, defId, x) => ({ id, x, y: 1, alive: true, info: { id, side: 'ally', defId, skillIndex: 0 } });
    const papyrs = ally(2, 'char_4139_papyrs', 0), silent = ally(5, 'char_108_silent', 0), a1 = ally(3, 'char_4139_papyrs', 1), a2 = ally(4, 'char_4139_papyrs', 2);
    const views = new Map([[2, papyrs], [3, a1], [4, a2], [5, silent]]);
    const hits = () => plays.filter((p) => p.kind === 'attackHit').map((p) => [p.by, p.at, ...p.names]);
    // (no await between the events: in node the first spawn's WebP check fails the layer)
    layer.onEvent(['atk', 2, 3, 'orb'], views);
    layer.onEvent(['heal', 3, 300, 2], views);
    layer.onEvent(['heal', 3, 40, 2], views);           // a later heal of the same healer (a talent's): the shot hit once
    layer.onEvent(['atk', 3, 4, 'chainHeal', null, 2, 3], views);
    layer.onEvent(['heal', 4, 200, 2], views);
    assert.deepEqual(hits(), [[2, 3, 'papyrs_hit_01'], [2, 4, 'papyrs_hit_01']], 'the first ally and the bounce\'s');
    // another unit's heal of an ally a heal shot is on its way to is not that shot's hit
    plays.length = 0;
    layer.onEvent(['atk', 5, 3, 'orb'], views);
    layer.onEvent(['heal', 3, 50, 2], views);
    assert.deepEqual(hits(), [], 'healed by 莎草, the shot was 赫默\'s');
    layer.onEvent(['heal', 3, 300, 5], views);
    assert.deepEqual(hits(), [[5, 3, 'myrrh_attack_01_hit']]);
    // a heal without a heal attack (a regen, a skill's heal field) plays nothing
    plays.length = 0;
    layer.onEvent(['heal', 4, 80, 2], views);
    layer.onEvent(['heal', 4, 80, null], views);
    assert.deepEqual(hits(), []);
  } finally { globalThis.fetch = fetch0; }
});
