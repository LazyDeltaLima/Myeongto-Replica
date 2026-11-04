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
const IDLE = 'public/assets/local/fx/monstr_token/token_monstr_prosts_idle.json';
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

/**
 * The mesh particle's pivot offset of the shader itself, per unit of size: `vec3 piv = vec3(±uPivot.<axis>, …) * abs(iSize)`. The
 * first version of the ring test wrote the formula out, and passed with the old one back in the shader.
 */
function shaderPivot(pivot) {
  const src = readFileSync('public/js/render/fxplayer.js', 'utf8');
  const m = /vec3 piv = vec3\((-?uPivot\.[xyz]), (-?uPivot\.[xyz]), (-?uPivot\.[xyz])\) \* abs\(iSize\);/.exec(src);
  assert.ok(m, 'fxplayer.js: the mesh particle pivot line changed form');
  return m.slice(1, 4).map((c) => (c[0] === '-' ? -1 : 1) * pivot[c.at(-1)]);
}

test('the 重构体\'s crystals make a ring: 8 turns of 45° about one axis, 0.39 out along their long axis, as the official screen', { skip: !existsSync(IDLE) && 'needs the extracted effects' }, () => {
  const { nodes } = JSON.parse(readFileSync(IDLE, 'utf8'));
  const crystals = nodes.filter((n) => n.ps?.render?.mode === 4 && n.ps.render.trailMat?.includes('crystal'));
  assert.equal(crystals.length, 8);
  const yaws = new Set();
  for (const n of crystals) {
    assert.ok(Math.abs(n.rot[0]) < 1e-3 && Math.abs(n.rot[2]) < 1e-3, `${n.name} turns about y only`);
    yaws.add(Math.round((2 * Math.atan2(n.rot[1], n.rot[3]) * 180 / Math.PI + 720) % 360));
    // the shader's offset, as fxplayer.js has it (`piv`), × size again
    const [px, py, pz] = n.ps.render.pivot;
    const { x, y, z } = n.ps.mods.sizeOL;
    const s = [x.s, y.s, z.s].map((v) => v * n.ps.size.s);
    const off = shaderPivot({ x: px, y: py, z: pz }).map((v, i) => v * s[i] * s[i]);
    assert.deepEqual(off.slice(0, 2).map(Math.abs), [0, 0], 'along the mesh\'s z, its long axis: radial');
    assert.ok(Math.abs(off[2] - 0.39) < 0.002, `radius ${off[2]}`);
  }
  assert.deepEqual([...yaws].sort((a, b) => a - b), [0, 45, 90, 135, 180, 225, 270, 315]);
  const mesh = JSON.parse(readFileSync(`public/assets/local/fx/mesh/${crystals[0].ps.render.mesh}.json`, 'utf8')).pos;
  const ext = [0, 1, 2].map((c) => { const v = mesh.filter((_, i) => i % 3 === c); return Math.max(...v) - Math.min(...v); });
  assert.ok(ext[2] > ext[0] * 2 && ext[2] > ext[1] * 2, `the crystal's long axis is z: ${ext}`);
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

test('the 重构体\'s and her S3\'s 流失 take HP without a \'dmg\' event: each draws the white hit flash and sparks of 真实 damage', () => {
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 60, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: 'char_4179_monstr', skillIndex: 2, uniEquipId: null }, row: 10, col: 4 },
      { uid: 2, kind: 'token', tokenId: PROSTS, ownerUid: 1, row: 9, col: 4 }] });
  const steps = (s) => Math.round(s / h.b.dt);
  const r = h.unit(2), u = h.unit(1);
  for (let i = 0; i < steps(1.5); i++) h.step();
  const hp0 = r.hp;
  h.events.length = 0;
  for (let i = 0; i < steps(1); i++) h.step();
  assert.ok(r.hp < hp0, `it keeps losing HP: ${hp0} → ${r.hp}`);
  assert.equal(h.events.filter((e) => e[0] === 'dmg' && e[1] === r.id).length, 0, 'no \'dmg\' on the 重构体');
  h.spawn('e_d', { pos: [10, 5] });   // S3's trigger: an enemy in her x-4
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 2), 'S3 on');
  for (let i = 0; i < steps(u.skill.castTiming().action + 0.04); i++) h.step();   // (it runs from where she lands, as Skill_3_Begin ends)
  h.events.length = 0;
  // step by step: her attacks' 治疗 tops her up inside the window (her first strike lands 0.5 s in)
  let lost = 0;
  for (let i = 0; i < steps(0.7); i++) { const hp1 = u.hp; h.step(); lost = Math.max(lost, hp1 - u.hp); }
  assert.ok(lost > 0, 'S3 流失');
  assert.equal(h.events.filter((e) => e[0] === 'dmg' && e[1] === u.id && e[5] === u.id).length, 0, 'no \'dmg\' of her own');
});

