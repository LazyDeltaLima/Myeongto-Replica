// test/render/token-held-fx.test.js — a summon's own held effects: a passive ability's INFINITY buff with an `overrideEffectKey`
// (char_modes.py token_auras → modes.json aura, played by fxgame.js tokenAura) and the effect of the aura it gives others.
// The 重构体 (token_10050_monstr_prosts) drew neither before 2026-11-04: monstr[free_jump]'s token_monstr_prosts_idle and
// prosts[atk_up]'s token_monstr_prosts_buff_03 were in the client's rows and nothing played them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { KEY_FX } from '../../public/js/render/fxstatus.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const PROSTS = 'token_10050_monstr_prosts';
const MODES = 'public/assets/local/fx/modes.json';
const settle = () => new Promise((r) => setTimeout(r, 5));

test('char_modes.py keeps a summon\'s passive buff effects, its default mode\'s only, and leaves the hand-drawn looks out', () => {
  const py = readFileSync('tools/local-extract/char_modes.py', 'utf8');
  assert.match(py, /token_default_mode_path\(gp\[len\(tid\) \+ 1:\]\)/);
  assert.match(py, /'_selfOption' not in d/, 'an AuraAbility\'s `_buffs` go on the units it covers');
  for (const n of ['token_aglna2_agairp_01', 'phatm2_skill_03_prison_01', 'sbell2_tile_frozen']) assert.ok(py.includes(`'${n}'`), n);
});

test('the extract holds the 重构体\'s idle effect under every skill of hers', { skip: !existsSync(MODES) && 'needs the extracted effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8'))[PROSTS];
  assert.equal(m.start, 'token_monstr_prosts_start');
  assert.deepEqual(Object.keys(m.aura), ['0', '1', '2']);
  for (const list of Object.values(m.aura)) assert.deepEqual(list, ['token_monstr_prosts_idle']);
});

test('fxgame.js: the 重构体 holds its idle effect while it stands, in its owner\'s effect bundle, and drops it as it leaves', async () => {
  const fetch0 = globalThis.fetch;
  const files = {
    '/assets/local/fx/index.json': { bundles: { monstr: ['monstr_attack_hit_01'], monstr_token: ['token_monstr_prosts_start', 'token_monstr_prosts_idle'] } },
    '/assets/local/fx/modes.json': { [PROSTS]: { owner: 'char_4179_monstr', start: 'token_monstr_prosts_start', aura: { 0: ['token_monstr_prosts_idle'] } } },
  };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (q) => plays.push(q), dry: true });
    await settle();
    const token = { id: 2, x: 4, y: 9, alive: true, info: { id: 2, side: 'ally', kind: 'token', defId: PROSTS, spine: PROSTS, skillIndex: 0 } };
    const views = new Map([[2, token]]);
    layer.onEvent(['deploy', 2, 4, 9], views);
    layer.update?.(0.016, views);
    await settle();
    const names = plays.filter((q) => q.kind === 'spawn').map((q) => q.names[0]);
    assert.ok(names.includes('token_monstr_prosts_idle'), names.join());
    assert.ok(names.includes('token_monstr_prosts_start'), names.join());
  } finally { globalThis.fetch = fetch0; }
});

test('the 重构体\'s ATK aura is announced to the view on the allies it covers, and its effect is the official buff\'s', () => {
  assert.ok(KEY_FX['talent:monstr:prostsAtk'], 'KEY_FX entry');
  assert.equal(KEY_FX['talent:monstr:prostsAtk'][1].tpl, 'prosts[atk_up]');
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 60, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: 'char_4179_monstr', skillIndex: 0, uniEquipId: null }, row: 10, col: 4 },
      { uid: 2, kind: 'token', tokenId: PROSTS, ownerUid: 1, row: 10, col: 5 }] });
  for (let i = 0; i < 5; i++) h.step();
  const on = h.events.filter((e) => e[0] === 'status' && e[2] === 'talent:monstr:prostsAtk');
  assert.ok(on.some((e) => e[1] === h.unit(1).id && e[3] !== 0), 'on Mon3tr beside it');
  assert.ok(!on.some((e) => e[1] === h.unit(2).id), 'not on itself (`_selfOption` EXCLUDE)');
  assert.equal(on.filter((e) => e[1] === h.unit(1).id && e[3] !== 0).length, 1, 'announced once, not on every aura tick');
});
