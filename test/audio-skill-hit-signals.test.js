// test/audio-skill-hit-signals.test.js — skill hit sounds the client plays outside the attack banks (2026-10-22,
// docs/rules/audio.md 「버프·커스텀 트리거 소리」 / 「공격 소리 신호」): 佩佩 S3's pepe_s_3_fx PlayAudio pepe_s3_hit_01–03 by her
// stacks (the kit's 'stacks' fx → signalFxKey → sfx.kit), and the Spine OnPlayAudio events, whose sound is the event's
// string value (마운틴 S2 / S3 punches, 필라에, 파투스, the enemies' — render/spine.js onEvent → audio.spineEvent).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, signalFxKey } from '../public/js/audio.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { skelParserAvailable } from '../tools/assets/skel.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
const file = (u) => String(u).split('/').pop();
const PEPE = 'char_4058_pepe';

function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url, o) => { a.played.push({ f: file(url), bank: o.bank }); };
  a.voice = () => false;
  return a;
}

describe('佩佩 S3: pepe_s_3_fx plays pepe_s3_hit_0N on each attack\'s main target', () => {
  test('the banks and the manifest keys', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    for (const n of [1, 2, 3]) {
      assert.equal(KIT_HIT_BANKS[`pepe:s3:${n}`], `battle.ON_CUSTOM_TRIGGER.pepe_s3_hit_0${n}`);
      assert.equal(file(out[`pepe:s3:${n}`][0]), `p_imp_ctmnyhmr_s${n}.mp3`);
      assert.equal(file(manifest.audio.sfx.kit[`pepe:s3:${n}`]), `p_imp_ctmnyhmr_s${n}.mp3`);
    }
  });

  test('the level by her stacks before the attack: ≥ max _03, ≥ 2 _02, else _01 (as the range effect)', () => {
    const unitOf = () => ({ def: PEPE });
    const key = (n) => signalFxKey('stacks', { id: 1, tgt: 2, buff: 'pepe:tremor', n, max: 5 }, unitOf);
    assert.deepEqual([0, 1, 2, 4, 5].map(key), ['pepe:s3:1', 'pepe:s3:1', 'pepe:s3:2', 'pepe:s3:2', 'pepe:s3:3']);
    assert.equal(signalFxKey('stacks', { id: 1, buff: 'mudrok', n: 3 }, unitOf), null, 'another kit\'s stacks');
  });

  test('real match path (Match → buildBattleSpec → createBattleFromSpec): each S3 attack sounds its level', async () => {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    give(m, ps, 'chess_char_6_06_a', 'board', legalTileFor(m, ps, 'chess_char_6_06_a'));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const ev = [];
    const stacks = () => ev.filter((x) => x[0] === 'fx' && x[1] === 'stacks' && x[4]?.buff === 'pepe:tremor');
    while (!b.finished && b.time < 150) { b.step(); ev.push(...b.drainEvents()); }
    const s = stacks();
    assert.ok(s.length, 'her S3 attacked');
    const pepe = b.allyUnits.find((u) => u.def?.charId === PEPE);
    assert.ok(s.every((x) => x[4].id === pepe.id && x[4].tgt != null));
    const a = manager();
    a.setFieldUnits([{ id: pepe.id, kind: 'op', side: 'ally', spine: PEPE, defId: 'chess_char_6_06_a', skillIndex: 2 }]);
    const hits = [];
    for (const x of s) {
      a.played.length = 0;
      a.handleBattleEvents([x]);
      hits.push(a.played.map((p) => p.f));
    }
    const level = (o) => (o.n >= o.max ? 3 : o.n >= 2 ? 2 : 1);
    assert.deepEqual(hits, s.map((x) => [`p_imp_ctmnyhmr_s${level(x[4])}.mp3`]), 'one sound per attack, by its stacks');
  });
});

describe('Spine audio events: the sound is the event\'s string value', () => {
  const SPINE_DIR = path.join(ROOT, 'public', 'assets', 'spine');
  test('every sfx.units[*].spine key is an OnPlayAudio string of that unit\'s model', { skip: (!existsSync(SPINE_DIR) || !skelParserAvailable()) && 'no models / Spine parser' }, () => {
    const r = createRequire(import.meta.url)('@pixi-spine/runtime-3.8');
    const loader = {
      newRegionAttachment: (s, n) => new r.RegionAttachment(n), newMeshAttachment: (s, n) => new r.MeshAttachment(n),
      newBoundingBoxAttachment: (s, n) => new r.BoundingBoxAttachment(n), newPathAttachment: (s, n) => new r.PathAttachment(n),
      newPointAttachment: (s, n) => new r.PointAttachment(n), newClippingAttachment: (s, n) => new r.ClippingAttachment(n),
    };
    const skels = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? skels(path.join(dir, e.name)) : e.name.endsWith('.skel') ? [path.join(dir, e.name)] : []));
    let checked = 0;
    for (const [id, u] of Object.entries(manifest.audio.sfx.units)) {
      if (!u.spine) continue;
      const dir = path.join(SPINE_DIR, id.startsWith('enemy_') ? 'enemy' : 'op', id);
      if (!existsSync(dir)) continue;
      const audioValues = new Set();
      for (const f of skels(dir)) {
        const d = new r.SkeletonBinary(loader).readSkeletonData(new Uint8Array(readFileSync(f)));
        for (const an of d.animations) for (const t of an.timelines) for (const e of t?.events ?? []) if (/^OnPlayAudio(_[1-3])?$/.test(e.data.name) && e.stringValue) audioValues.add(e.stringValue);
      }
      for (const k of Object.keys(u.spine)) assert.ok(audioValues.has(k), `${id}: ${k} is no OnPlayAudio string`);
      checked++;
    }
    assert.ok(checked >= 10, `units checked: ${checked}`);
  });

  test('마운틴 S3: OnPlayAudio "Skill_3_1" sounds p_imp_tigerpunch_d_1; the event name alone sounds nothing', () => {
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: 'char_264_f12yin', defId: 'chess_x', skillIndex: 2 }]);
    a.handleBattleEvents([['skill', 1, 1]]);
    a.spineEvent(1, null);
    a.played.length = 0;
    assert.equal(a.spineEvent(1, 'OnPlayAudio'), false);
    assert.equal(a.spineEvent(1, 'OnPlayAudio', 'Skill_3_1'), true);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_tigerpunch_d_1.mp3']);
  });
});

describe('buff / custom-trigger hit sounds wired 2026-10-22 (刺玫, 洛洛, 协律, 隐德来希, 锡人, 蕾缪安)', () => {
  const KEYS = {
    'vendla:s2': ['battle.ON_BUFF_START.vendla_s_2[extra_damage]', 'p_imp_brmblhldmg.mp3'],
    'rockr:funnel': ['battle.ON_BUFF_START.rockr_s2_funnel_attack_hit', 'p_atk_elecwandfunnel_n.mp3'],
    'rockr:funnelo': ['battle.ON_BUFF_START.rockr_s2_funnel_attack_hit_overload', 'p_atk_elecwandfunnel_h.mp3'],
    'akkord:s2': ['battle.ON_CUSTOM_TRIGGER.akkord_aoe_audio', 'p_imp_mlysndvbm.mp3'],
    'etlchi:s2': ['battle.ON_BUFF_START.etlchi_s_2[audio]', 'p_imp_vmprsckl_h.mp3'],
    'tinman:s2': ['battle.ON_CUSTOM_TRIGGER.tinman_s_2[audio]', 'p_imp_stmpnklchbm.mp3'],
    'lemuen:s3lock': ['battle.ON_BUFF_START.lemuen_s3_audio_triggered', 'p_atk_lmwlcrstr_s.mp3'],
  };
  test('the banks and the manifest keys', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    for (const [k, [bank, f]] of Object.entries(KEYS)) {
      assert.equal(KIT_HIT_BANKS[k], bank, k);
      assert.equal(file(out[k][0]), f, k);
      assert.equal(file(manifest.audio.sfx.kit[k]), f, k);
    }
  });

  const field = (a, units) => a.setFieldUnits(units.map(([id, spine, side = 'ally', skillIndex = 1]) => ({ id, kind: side === 'ally' ? 'op' : 'enemy', side, spine, defId: 'chess_x', skillIndex })));
  const heard = (a, ev) => { a.played.length = 0; a.handleBattleEvents(ev); return a.played.map((p) => p.f); };

  test('刺玫 S2 counter, 协律 S2 sonic boom, 洛洛 S2 drone (overloaded or not): their kit fx', () => {
    const a = manager();
    field(a, [[1, 'char_494_vendla'], [2, 'char_4051_akkord'], [3, 'char_4040_rockr'], [4, 'char_4040_rockr'], [9, 'enemy_1007_slime_2', 'enemy']]);
    assert.deepEqual(heard(a, [['fx', 'counter', 0, 0, { x: 0, y: 0, id: 1 }]]), ['p_imp_brmblhldmg.mp3']);
    assert.deepEqual(heard(a, [['fx', 'sonic', 0, 0, { x: 0, y: 0, radius: 0.9, id: 2 }]]), ['p_imp_mlysndvbm.mp3']);
    assert.deepEqual(heard(a, [['fx', 'drone', 0, 0, { x: 0, y: 0, id: 3 }]]), ['p_atk_elecwandfunnel_n.mp3']);
    heard(a, [['fx', 'overload', 0, 0, { x: 0, y: 0, id: 4 }]]);
    assert.deepEqual(heard(a, [['fx', 'drone', 0, 0, { x: 0, y: 0, id: 4 }]]), ['p_atk_elecwandfunnel_h.mp3']);
    assert.equal(signalFxKey('counter', { id: 5 }, () => ({ def: 'char_4013_rmixer' })), null, 'another kit\'s counter');
  });

  test('蕾缪安 S3: the first lock on an enemy sounds, a second lock on it does not; S2\'s aim lock (no hold) does not', () => {
    const a = manager();
    field(a, [[1, 'char_4193_lemuen'], [8, 'enemy_1007_slime_2', 'enemy'], [9, 'enemy_1007_slime_2', 'enemy']]);
    const lock = (id, hold = 1) => ['fx', 'lock', 0, 0, { x: 0, y: 0, id, src: 1, ...(hold ? { hold } : {}) }];
    assert.ok(heard(a, [lock(8)]).includes('p_atk_lmwlcrstr_s.mp3'));
    assert.ok(!heard(a, [lock(8)]).includes('p_atk_lmwlcrstr_s.mp3'));
    assert.ok(heard(a, [lock(9)]).includes('p_atk_lmwlcrstr_s.mp3'));
    assert.equal(signalFxKey('lock', { id: 9, src: 1 }, (id) => (id === 1 ? { def: 'char_4193_lemuen' } : { side: 'enemy' })), null);
  });

  test('隐德来希 S2: the sickles\' damage (no attack) sounds etlchi_s_2[audio]; outside S2 it does not', () => {
    const a = manager();
    field(a, [[1, 'char_4010_etlchi'], [9, 'enemy_1007_slime_2', 'enemy']]);
    assert.ok(!heard(a, [['dmg', 9, 100, 'phys', 0, 1, 0, null]]).includes('p_imp_vmprsckl_h.mp3'));
    a.handleBattleEvents([['skill', 1, 1]]);
    assert.deepEqual(heard(a, [['dmg', 9, 100, 'phys', 0, 1, 0, null]]), ['p_imp_vmprsckl_h.mp3']);
  });

  test('锡人: her alchemy unit\'s ticks sound; another unit\'s damage-over-time tick stays silent', () => {
    const a = manager();
    field(a, [[1, 'char_4151_tinman'], [2, 'char_4010_etlchi'], [9, 'enemy_1007_slime_2', 'enemy']]);
    assert.deepEqual(heard(a, [['dmg', 9, 50, 'arts', 0, 1, 1, null]]), ['p_imp_stmpnklchbm.mp3']);
    assert.deepEqual(heard(a, [['dmg', 9, 50, 'arts', 0, 2, 1, null]]), []);
  });

  test('real match path (Match → buildBattleSpec → createBattleFromSpec): 锡人\'s ticks are damage-over-time ticks credited to her', async () => {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    give(m, ps, 'chess_char_2_19_a', 'board', legalTileFor(m, ps, 'chess_char_2_19_a'));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const ev = [];
    while (!b.finished && b.time < 150) { b.step(); ev.push(...b.drainEvents()); }
    const tin = b.allyUnits.find((u) => u.def?.charId === 'char_4151_tinman');
    assert.ok(ev.some((x) => x[0] === 'fx' && x[1] === 'zone' && x[4]?.id === tin.id), 'she threw a unit');
    const ticks = ev.filter((x) => x[0] === 'dmg' && x[5] === tin.id && x[6] === 1);
    assert.ok(ticks.length, 'its ticks');
    const a = manager();
    a.setFieldUnits([{ id: tin.id, kind: 'op', side: 'ally', spine: 'char_4151_tinman', defId: 'chess_char_2_19_a', skillIndex: 1 }]);
    assert.ok(heard(a, [ticks[0]]).includes('p_imp_stmpnklchbm.mp3'));
  });
});

describe('卡涅利安: her charge stages outside the skill sound billro_s_N_reach_half / _enhance', () => {
  test('the banks and the manifest keys', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    for (const n of [1, 2, 3]) {
      assert.equal(KIT_HIT_BANKS[`billro:s${n}:half`], `battle.ON_BUFF_START.billro_s_${n}_reach_half`);
      assert.equal(KIT_HIT_BANKS[`billro:s${n}:full`], `battle.ON_BUFF_START.billro_s_${n}_reach_enhance`);
      for (const k of ['half', 'full']) assert.equal(file(manifest.audio.sfx.kit[`billro:s${n}:${k}`]), file(out[`billro:s${n}:${k}`][0]));
    }
  });

  test('a stage sounds when its buff is created, not while she holds it nor while the skill runs', () => {
    const u = { def: 'char_426_billro', skillIndex: 0 };
    const seq = [1, 2, -1, 0, 1, -1, 1, 2, 0, 2].map((n) => signalFxKey('charges', { id: 1, n }, () => u));
    assert.deepEqual(seq, ['billro:s1:half', 'billro:s1:full', null, null, 'billro:s1:half', null, null, 'billro:s1:full', null, 'billro:s1:full']);
    assert.equal(signalFxKey('charges', { id: 1, n: 1 }, () => ({ def: 'char_426_billro', skillIndex: 2 })), 'billro:s3:half');
  });

  test('real match path: her charges events sound their stages', async () => {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    give(m, ps, 'chess_char_4_24_a', 'board', legalTileFor(m, ps, 'chess_char_4_24_a'));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const ev = [];
    while (!b.finished && b.time < 150) { b.step(); ev.push(...b.drainEvents()); }
    const bil = b.allyUnits.find((u) => u.def?.charId === 'char_426_billro');
    const ch = ev.filter((x) => x[0] === 'fx' && x[1] === 'charges' && x[4]?.id === bil.id);
    assert.ok(ch.some((x) => x[4].n >= 1), 'she stored a charge');
    const a = manager();
    a.setFieldUnits([{ id: bil.id, kind: 'op', side: 'ally', spine: 'char_426_billro', defId: 'chess_char_4_24_a', skillIndex: bil.skillIndex ?? 1 }]);
    a.handleBattleEvents(ch);
    assert.ok(a.played.some((p) => /^p_skill_goldexplobuff/.test(p.f)), a.played.map((p) => p.f).join());
  });
});
