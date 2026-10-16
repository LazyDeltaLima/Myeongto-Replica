// test/render/funnel-fx.test.js — a 驭械术师's drones and 伺夜's wolf pack (docs/rules/fx.md 「驭械术师 드론」 / 「伺夜 늑대 무리」, 2026-10-16): modes.json `funnels`
// (char_modes.py funnel_entries, client FunnelEffectEmitter) — the idle drones of the mode now, the hide / shot / hit / show
// of each attack, 荒芜拉普兰德's active count; the pack's extra wolves, bites and 战术点形态 by the sim's wolf count. Node has no WebP: the trace counts the prefabs the layer starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const files = {
  '/assets/local/fx/index.json': { bundles: {
    kjera: ['kjera_token_default', 'kjera_token_attack_trail_01', 'kjera_token_hit_01', 'kjera_token_F_01', 'kjera_token_F_02', 'kjera_token_hide_01', 'kjera_token_show_01', 'kjera_token_skill_02_hit_F_L_01'],
    whitw2: ['whitw2_token_01', 'whitw2_token_02', 'whitw2_token_03', 'whitw2_token_end_01', 'whitw2_token_end_02', 'whitw2_token_hit_01', 'whitw2_token_hit_02'],
    vigil: ['vigil_token_sub_start_1', 'vigil_token_sub_start_2', 'vigil_token_sub_die_1', 'vigil_token_sub_die_2', 'vigil_token_buff_1', 'vigil_token_buff_2',
      'vigil_token_buff_3', 'vigil_token_buff_4', 'vigil_token_die', 'vigil_token_ghost', 'vigil_token_start', 'vigil_token_attack_hit_1', 'vigil_token_attack_hit_2',
      'vigil_token_attack_hit_3', 'vigil_token_attack_hit_extra', 'vigil_token_sub_attack_1', 'vigil_token_sub_attack_2', 'vigil_token_skill_02_hint',
      'vigil_token_skill_02_ready', 'vigil_token_heal'],
  } },
  '/assets/local/fx/modes.json': {
    char_4013_kjera: { modes: ['Default', 'S2'], skillMode: [null, 1], funnels: [
      [{ idle: ['kjera_token_default'] }, { proj: 'projectile_chr_kjera_funnel', from: 5, speed: 10, trail: ['kjera_token_attack_trail_01'], hit: ['kjera_token_hit_01'] }],
      [{ idle: ['kjera_token_F_01'], back: ['kjera_token_B_01'], hide: ['kjera_token_hide_01'], show: ['kjera_token_show_01'], proj: 'projectile_chr_kjera_funnel_s2_1', wait: 1, trail: [], hit: ['kjera_token_skill_02_hit_F_L_01'] },
        { idle: ['kjera_token_F_02'], proj: 'projectile_chr_kjera_funnel_s2_2', wait: 1, trail: [], hit: [] }],
    ] },
    char_1038_whitw2: { modes: ['Default', 'S1', 'S2', 'S3'], skillMode: [null, 2, 3], funnels: [[1, 2, 3].map((i) => (
      { idle: [`whitw2_token_0${i}`], hide: [`whitw2_token_end_0${i}`], show: [`whitw2_token_end_0${i}`], off: 1, proj: `projectile_chr_whitw2_funnel_${i}`, wait: 1, trail: [], hit: [`whitw2_token_hit_0${i}`] }))] },
  },
};
const settle = () => new Promise((r) => setTimeout(r, 5));

test('drones: idle by mode, a shot per attack (trail, then its hit), the S2 drones hide and come back', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await settle();
    const op = (id, defId, skillIndex = 0) => ({ id, x: 0, y: 0, alive: true, info: { id, side: 'ally', kind: 'op', defId, skillIndex } });
    const foe = { id: 9, x: 3, y: 0, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_1001_bigbo' } };
    const kj = op(1, 'char_4013_kjera', 1), wl = op(2, 'char_1038_whitw2', 0);
    const views = new Map([[1, kj], [2, wl], [9, foe]]);
    const got = () => plays.splice(0).filter((p) => p.kind === 'spawn').map((p) => p.names[0]).sort();
    const tick = (s) => layer.update(s, null, null);
    layer.onEvent(['deploy', 1], views);
    layer.onEvent(['deploy', 2], views);
    tick(0.02);
    // Default: 耶拉's drone buff look; 荒芜拉普兰德 with S1 chosen: two of her three drones (1 + S1's passive)
    assert.deepEqual(got().filter((n) => !n.startsWith('common')), ['kjera_token_default', 'whitw2_token_01', 'whitw2_token_02']);
    // a Default attack: the drone's projectile from its point, its hit on arrival (0.3 s at 10 tiles / s)
    layer.onEvent(['atk', 1, 9, 'drone'], views);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera')), ['kjera_token_attack_trail_01']);
    tick(0.5);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera')), ['kjera_token_hit_01']);
    // S2: its mode's two drones replace the Default look; an attack hides the first (its hide effect), its hit and show later
    kj._fxSkillOn = true;
    layer.onEvent(['skill', 1, 1], views);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera_token_F') || n === 'kjera_token_default'), ['kjera_token_F_01', 'kjera_token_F_02']);
    tick(0.02);
    layer.onEvent(['atk', 1, 9, 'drone'], views);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera_token')), ['kjera_token_hide_01']);
    tick(0.5);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera_token')), ['kjera_token_show_01', 'kjera_token_skill_02_hit_F_L_01']);
    // 荒芜拉普兰德: every active drone strikes (end effect as it leaves), 头狼 stage 3 adds the third
    layer.onEvent(['atk', 2, 9, 'drone'], views);
    assert.deepEqual(got().filter((n) => n.startsWith('whitw2')), ['whitw2_token_end_01', 'whitw2_token_end_02']);
    layer.onEvent(['fx', 'talent', 0, 0, { x: 0, y: 0, id: 2, name: 'alpha', stage: 3 }], views);
    assert.deepEqual(got().filter((n) => /^whitw2_token_0\d$/.test(n)), ['whitw2_token_01', 'whitw2_token_02', 'whitw2_token_03']);
  } finally { globalThis.fetch = fetch0; }
});

test("伺夜's pack: extra wolves by the count, a lost one's sub_die, its bite by the extras, the 战术点 ghost and the way back", async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await settle();
    const wolf = { id: 3, x: 1, y: 0, alive: true, info: { id: 3, side: 'ally', kind: 'token', defId: 'token_10028_vigil_wolf' } };
    const foe = { id: 9, x: 2, y: 0, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_1001_bigbo' } };
    const views = new Map([[3, wolf], [9, foe]]);
    const got = () => plays.splice(0).filter((p) => p.kind === 'spawn').map((p) => p.names[0]).filter((n) => n.startsWith('vigil')).sort();
    const fx = (name, o) => layer.onEvent(['fx', name, 1, 0, { x: 1, y: 0, id: 3, ...o }], views);
    fx('summon', { src: 7, token: 'token_10028_vigil_wolf', wolves: 2 });
    layer.onEvent(['deploy', 3], views);
    layer.update(0.02, null, null);
    assert.deepEqual(got(), ['vigil_token_buff_1', 'vigil_token_buff_2', 'vigil_token_buff_3', 'vigil_token_buff_4', 'vigil_token_sub_start_1']);
    fx('wolfShadow', { n: 3 });
    assert.deepEqual(got(), ['vigil_token_sub_start_2']);
    layer.onEvent(['atk', 3, 9, 'none'], views);
    assert.deepEqual(got(), ['vigil_token_attack_hit_3', 'vigil_token_sub_attack_1', 'vigil_token_sub_attack_2']);
    fx('revive', { wolves: 2 });
    assert.deepEqual(got(), ['vigil_token_sub_die_2']);
    fx('buff', { src: 7, skill: 'vigil_2' });
    assert.deepEqual(got(), ['vigil_token_heal', 'vigil_token_skill_02_hint', 'vigil_token_skill_02_ready']);
    layer.onEvent(['atk', 3, 9, 'none'], views);
    assert.deepEqual(got(), ['vigil_token_attack_hit_2', 'vigil_token_attack_hit_extra', 'vigil_token_sub_attack_1']);
    fx('wolfShadowLost', { wolves: 0 });
    assert.deepEqual(got(), ['vigil_token_die', 'vigil_token_ghost']);
    fx('summon', { src: 7, wolves: 1 });
    layer.onEvent(['deploy', 3], views);
    layer.update(0.02, null, null);
    assert.deepEqual(got(), ['vigil_token_buff_1', 'vigil_token_buff_2', 'vigil_token_buff_3', 'vigil_token_buff_4', 'vigil_token_start'], 'one wolf: no extra');
  } finally { globalThis.fetch = fetch0; }
});
