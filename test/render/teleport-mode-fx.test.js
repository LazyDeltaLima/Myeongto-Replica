// test/render/teleport-mode-fx.test.js — a skill whose 【移动】 switches the operator's mode on the way (shared/skill-modes.js
// SKILL_SUB_MODES `teleport`): from the sim's 'teleport' fx until the skill ends her attacks draw that mode's effects, not the
// skill's own mode's. Mon3tr S3: monstr_s_3[route] SwitchMode 4 S3_Reborn as she lands on her 重构体's tile — before it,
// her S3 attacks drew the S3 mode's heal shot (monstr_skill_03_heal) instead of S3_Reborn's strike (official client). The
// 【返回】 brings her back in S3_Restore (the same buff's SwitchMode 3), whose `_overrideStartEffect` is the return's deploy effect.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const M = MODES.char_4179_monstr;
const files = {
  '/assets/local/fx/index.json': { bundles: { monstr: [...new Set([M.cast, M.hit, M.attach, M.modeStart].flat(2).filter(Boolean))], common: ['common_char_birth_01'] } },
  '/assets/local/fx/modes.json': { char_4179_monstr: M },
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

test('Mon3tr S3: lands in S3_Reborn (its start effect, buff and strike), comes back in S3_Restore (its start effect), then the plain mode', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await settle();
    const op = { id: 1, x: 2, y: 2, alive: true, info: { id: 1, side: 'ally', kind: 'op', defId: 'char_4179_monstr', spine: 'char_4179_monstr', skillIndex: 2 } };
    const foe = { id: 9, x: 3, y: 2, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_1007_slime' } };
    const views = new Map([[1, op], [9, foe]]);
    const names = () => seen.splice(0).flatMap((p) => p.names || []);
    const strike = (t) => { layer.onEvent(['swing', 1, 0.5, null, 9], views); layer.update(t); layer.onEvent(['atk', 1, 9, 'none'], views); layer.update(t); };
    layer.onEvent(['skill', 1, 1], views);
    await settle();
    const start = names();
    layer.onEvent(['deploy', 1, 0, 'reborn'], views);   // (the sim: moveRedeploy, then the 'teleport' fx)
    layer.onEvent(['fx', 'teleport', 2, 2, { id: 1, x: 2, y: 2, fromX: 4, fromY: 2 }], views);
    layer.update(0.05);
    await settle();
    const buff = [...start, ...names()];
    assert.ok(!buff.includes('monstr_skill_03_start') && !buff.includes('common_char_birth_01'), `she lands with S3_Reborn's start effect, common_empty (${buff})`);
    assert.equal(buff.filter((n) => n === 'monstr_skill_03_buff_01_root').length, 1, `S3_Reborn's buff on her once (${buff})`);
    strike(0.6);
    await settle();
    const s3 = names();
    assert.ok(s3.includes('monstr_skill_03_start_01'), `the S3_Reborn cast (${s3})`);
    assert.ok(!s3.includes('monstr_skill_03_heal'), `not the S3 mode's heal (${s3})`);
    layer.onEvent(['deploy', 1, 0, 'back'], views);   // the 【返回】 in the skill's onEnd, then its off event
    layer.onEvent(['fx', 'teleport', 4, 2, { id: 1, x: 4, y: 2, fromX: 2, fromY: 2, back: 1 }], views);
    layer.onEvent(['skill', 1, 0], views);
    layer.update(0.05);
    await settle();
    const back = names();
    assert.ok(back.includes('monstr_skill_03_end_01') && !back.includes('common_char_birth_01'), `she comes back in S3_Restore: its start effect (${back})`);
    strike(0.6);
    await settle();
    const after = names();
    assert.ok(after.includes('monstr_attack_start_01') && !after.includes('monstr_skill_03_start_01'), `the Default mode again (${after})`);
  } finally { globalThis.fetch = fetch0; }
});
