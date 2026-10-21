// test/render/funnel-fx.test.js — a 驭械术师's drones and 伺夜's wolf pack (docs/rules/fx.md 「驭械术师 드론」 / 「伺夜 늑대 무리」, 2026-10-16): modes.json `funnels`
// (char_modes.py funnel_entries, client FunnelEffectEmitter) — the idle drones of the mode now, the hide / shot / hit / show
// of each attack, 荒芜拉普兰德's active count; the pack's extra wolves, bites and 战术点形态 by the sim's wolf count. Node has no WebP: the trace counts the prefabs the layer starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const files = {
  '/assets/local/fx/index.json': { bundles: {
    kjera: ['kjera_token_default', 'kjera_token_attack_trail_01', 'kjera_token_hit_01', 'kjera_token_F_01', 'kjera_token_F_02', 'kjera_token_hide_01', 'kjera_token_show_01',
      'kjera_token_hide_02', 'kjera_token_show_02', 'kjera_token_skill_02_hit_F_L_01', 'kjera_token_skill_02_hit_F_L_02', 'kjera_token_skill_02_hit_F_R_01', 'kjera_token_skill_02_hit_F_R_02'],
    rockr: ['rockr_token_01', 'rockr_token_hide_01', 'rockr_token_show_01', 'rockr_token_overload_01', 'rockr_token_skill_02_hit_L_01', 'rockr_token_skill_02_hit_R_01',
      'rockr_token_skill_02_hit_L_overload_01', 'rockr_token_skill_02_hit_R_overload_02'],
    whitw2: ['whitw2_token_01', 'whitw2_token_02', 'whitw2_token_03', 'whitw2_token_end_01', 'whitw2_token_end_02', 'whitw2_token_hit_01', 'whitw2_token_hit_02'],
    vigil: ['vigil_token_sub_start_1', 'vigil_token_sub_start_2', 'vigil_token_sub_die_1', 'vigil_token_sub_die_2', 'vigil_token_buff_1', 'vigil_token_buff_2',
      'vigil_token_buff_3', 'vigil_token_buff_4', 'vigil_token_die', 'vigil_token_ghost', 'vigil_token_start', 'vigil_token_attack_hit_1', 'vigil_token_attack_hit_2',
      'vigil_token_attack_hit_3', 'vigil_token_attack_hit_extra', 'vigil_token_sub_attack_1', 'vigil_token_sub_attack_2', 'vigil_token_skill_02_hint',
      'vigil_token_skill_02_ready', 'vigil_token_heal'],
  } },
  '/assets/local/fx/modes.json': {
    char_4013_kjera: { modes: ['Default', 'S2'], skillMode: [null, 1], funnels: [
      [{ idle: ['kjera_token_default'] }, { proj: 'projectile_chr_kjera_funnel', from: 5, speed: 10, trail: ['kjera_token_attack_trail_01'], hit: ['kjera_token_hit_01'] }],
      [{ idle: ['kjera_token_F_01'], back: ['kjera_token_B_01'], hide: ['kjera_token_hide_01'], show: ['kjera_token_show_01'], proj: 'projectile_chr_kjera_funnel_s2_1', wait: 1, trail: [], hit: [],
        attach: 1, lock: 1, seq: [['kjera_token_skill_02_hit_F_L_01'], ['kjera_token_skill_02_hit_F_L_02']] },
      { idle: ['kjera_token_F_02'], hide: ['kjera_token_hide_02'], show: ['kjera_token_show_02'], proj: 'projectile_chr_kjera_funnel_s2_2', wait: 1, trail: [], hit: [],
        attach: 1, lock: 1, seq: [['kjera_token_skill_02_hit_F_R_01'], ['kjera_token_skill_02_hit_F_R_02']] }],
    ] },
    char_4040_rockr: { modes: ['Default', 'S2'], skillMode: [null, 1], funnels: [[{ idle: ['rockr_token_01'] }],
      [{ idle: ['rockr_token_01'], hide: ['rockr_token_hide_01'], show: ['rockr_token_show_01'], over: ['rockr_token_overload_01'], proj: 'projectile_chr_rockr_funnel_s2',
        wait: 1, trail: [], hit: [], attach: 1, lock: 1, seq: [['rockr_token_skill_02_hit_L_01'], ['rockr_token_skill_02_hit_R_01']],
        overSeq: [['rockr_token_skill_02_hit_L_overload_01'], ['rockr_token_skill_02_hit_R_overload_02']] }]] },
    char_1038_whitw2: { modes: ['Default', 'S1', 'S2', 'S3'], skillMode: [null, 2, 3], funnels: [[1, 2, 3].map((i) => (
      { idle: [`whitw2_token_0${i}`], hide: [`whitw2_token_end_0${i}`], show: [`whitw2_token_end_0${i}`], off: 1, proj: `projectile_chr_whitw2_funnel_${i}`, wait: 1, trail: [], hit: [`whitw2_token_hit_0${i}`],
        attach: 1, delay: 0.5 }))] },
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
    // S2: its mode's two drones replace the Default look; they lock (AttachToTarget, INFINITY hits). 2026-10-21: the kit's
    // 'drone' events drive them, one per locked drone of a tick (the sim locks both on a lone enemy, as the client's
    // Funnel_0 / Funnel_1 with `_alwaysIncludeTarget`) — each hides from her and hits at once, no flight, no show while held
    kj._fxSkillOn = true;
    layer.onEvent(['skill', 1, 1], views);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera_token_F') || n === 'kjera_token_default'), ['kjera_token_F_01', 'kjera_token_F_02']);
    tick(0.02);
    const droneHit = (at) => layer.onEvent(['fx', 'drone', at.x, at.y, { x: at.x, y: at.y, id: 1 }], views);
    droneHit(foe); droneHit(foe);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera_token')),
      ['kjera_token_hide_01', 'kjera_token_hide_02', 'kjera_token_skill_02_hit_F_L_01', 'kjera_token_skill_02_hit_F_R_01']);
    tick(0.5);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera_token')), [], 'locked: they stay on the target');
    // her body's own attack moves no drone of hers now
    layer.onEvent(['atk', 1, 9, 'drone'], views);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera_token')), []);
    // the next tick: the same drones again, a hit only each, the next effect group
    droneHit(foe); droneHit(foe);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera_token')), ['kjera_token_skill_02_hit_F_L_02', 'kjera_token_skill_02_hit_F_R_02']);
    tick(0.5);
    // the target falls: both come back (show)
    foe.alive = false;
    tick(0.2);
    assert.deepEqual(got().filter((n) => n.startsWith('kjera_token')), ['kjera_token_show_01', 'kjera_token_show_02']);
    foe.alive = true;
    // 荒芜拉普兰德: every active drone strikes (end effect as it leaves) and bites at once (AttachToTarget), back 0.5 s later
    layer.onEvent(['atk', 2, 9, 'drone'], views);
    assert.deepEqual(got().filter((n) => n.startsWith('whitw2')), ['whitw2_token_end_01', 'whitw2_token_end_02', 'whitw2_token_hit_01', 'whitw2_token_hit_02']);
    tick(0.3);
    assert.deepEqual(got().filter((n) => n.startsWith('whitw2')), []);
    tick(0.3);
    assert.deepEqual(got().filter((n) => n.startsWith('whitw2')), ['whitw2_token_end_01', 'whitw2_token_end_02']);
    layer.onEvent(['fx', 'talent', 0, 0, { x: 0, y: 0, id: 2, name: 'alpha', stage: 3 }], views);
    assert.deepEqual(got().filter((n) => /^whitw2_token_0\d$/.test(n)), ['whitw2_token_01', 'whitw2_token_02', 'whitw2_token_03']);
  } finally { globalThis.fetch = fetch0; }
});

test("洛洛 S2: her locked drone's hits alternate its groups, the overload ones once she overloads", async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await settle();
    const ro = { id: 4, x: 0, y: 0, alive: true, info: { id: 4, side: 'ally', kind: 'op', defId: 'char_4040_rockr', skillIndex: 1 } };
    const foe = { id: 9, x: 3, y: 0, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_1001_bigbo' } };
    const views = new Map([[4, ro], [9, foe]]);
    const got = () => plays.splice(0).filter((p) => p.kind === 'spawn').map((p) => p.names[0]).filter((n) => n.startsWith('rockr_token_skill')).sort();
    layer.onEvent(['deploy', 4], views);
    layer.update(0.02, null, null);
    ro._fxSkillOn = true;
    layer.onEvent(['skill', 4, 1], views);
    layer.update(0.02, null, null);
    const droneHit = () => layer.onEvent(['fx', 'drone', foe.x, foe.y, { x: foe.x, y: foe.y, id: 4 }], views);   // her kit's locked-drone hit
    droneHit();
    layer.update(0.2, null, null);
    droneHit();
    assert.deepEqual(got(), ['rockr_token_skill_02_hit_L_01', 'rockr_token_skill_02_hit_R_01']);
    layer.onEvent(['fx', 'overload', 0, 0, { x: 0, y: 0, id: 4 }], views);
    layer.update(0.2, null, null);
    droneHit();
    assert.deepEqual(got(), ['rockr_token_skill_02_hit_L_overload_01']);
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
    // (2026-10-21) the gift's heal comes with its bite (vigil_wolf_s_2 ON_ABILITY_CAST_ON_TARGET), not with the cast
    fx('buff', { src: 7, skill: 'vigil_2' });
    assert.deepEqual(got(), ['vigil_token_skill_02_hint', 'vigil_token_skill_02_ready']);
    layer.onEvent(['atk', 3, 9, 'none'], views);
    assert.deepEqual(got(), ['vigil_token_attack_hit_2', 'vigil_token_attack_hit_extra', 'vigil_token_heal', 'vigil_token_sub_attack_1']);
    wolf.visFacing = -1;   // its 战术点 effects at the place it fell on, turned as it faced (vigil_token_die flips)
    fx('wolfShadowLost', { wolves: 0 });
    const lost = plays.filter((p) => p.kind === 'spawn' && /^vigil_token_(die|ghost)$/.test(p.names[0])).map((p) => `${p.names[0]} ${p.facing}`).sort();
    assert.deepEqual(got(), ['vigil_token_die', 'vigil_token_ghost']);
    assert.deepEqual(lost, ['vigil_token_die -1', 'vigil_token_ghost -1']);
    fx('summon', { src: 7, wolves: 1 });
    layer.onEvent(['deploy', 3], views);
    layer.update(0.02, null, null);
    assert.deepEqual(got(), ['vigil_token_buff_1', 'vigil_token_buff_2', 'vigil_token_buff_3', 'vigil_token_buff_4', 'vigil_token_start'], 'one wolf: no extra');
  } finally { globalThis.fetch = fetch0; }
});

test("伺夜's pack (2026-10-21): a board piece's first count ('wolfCount'), its 战术点形态 ended by 伺夜 leaving ('wolfTacEnd')", async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await settle();
    const wolf = { id: 3, x: 1, y: 0, alive: true, info: { id: 3, side: 'ally', kind: 'token', defId: 'token_10028_vigil_wolf' } };
    const views = new Map([[3, wolf]]);
    const got = () => plays.splice(0).filter((p) => p.kind === 'spawn').map((p) => p.names[0]).filter((n) => n.startsWith('vigil')).sort();
    const fx = (name, o) => layer.onEvent(['fx', name, 1, 0, { x: 1, y: 0, id: 3, ...o }], views);
    // a board piece: its deploy, then the sim's count (3 here — not the old assumed 2)
    layer.onEvent(['deploy', 3], views);
    layer.update(0.02, null, null);
    fx('wolfCount', { n: 3 });
    assert.ok(got().includes('vigil_token_sub_start_2'), 'two extra wolves');
    fx('wolfShadowLost', { wolves: 0 });
    assert.deepEqual(got(), ['vigil_token_die', 'vigil_token_ghost']);
    fx('wolfTacEnd', {});
    // a fresh pack later: its deploy is no return from the 战术点形态 (no vigil_token_start)
    fx('summon', { src: 7, wolves: 2 });
    layer.onEvent(['deploy', 3], views);
    layer.update(0.02, null, null);
    assert.ok(!got().includes('vigil_token_start'), 'the form ended without a return');
  } finally { globalThis.fetch = fetch0; }
});

test("a paused idle drone is hidden: the client's pause switches off its main particle system's node, over all it draws (耶拉 S2)", () => {
  const SRC = readFileSync(new URL('../../public/js/render/fxgame.js', import.meta.url), 'utf8');
  const at = SRC.indexOf('function holdDrone(rec, j, on) {');
  assert.ok(at >= 0);
  const body = SRC.slice(at, SRC.indexOf('\n  }\n', at));
  assert.match(body, /x\.offHeld = on;/);
  assert.match(body, /x\.inst\.object\.visible = !on && !\(x === l && l\.hidden\);/);
  assert.doesNotMatch(SRC, /holdDrone\([^)]*x\.off/);
});
