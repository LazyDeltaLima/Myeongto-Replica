// The 선발 sound banks wired from the linking sheet (tools/local-extract/link_sheet.py; docs/rules/audio.md 「선발 소리 뱅크
// 커버리지」, 2026-11-01): 赤刃明霄陈's held dodge, 魂灵之影's shot, 凯尔希·思衡托's S3 transport, 予愿安洁莉娜's clip signals,
// S2 sweep and S3 flight, 酒神's 本能的召唤, and the start banks of 丰川祥子 S2 / 予愿安洁莉娜 S3. The manifest under test is
// the committed one.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, kitHitKey, kitStartKey, statusSoundKey } from '../public/js/audio.js';
import { KIT_HIT_BANKS } from '../tools/assets/kit-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { skillStartSounds, skillStartIsFallback } from '../tools/assets/skill-sfx.mjs';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const skip = existsSync(OFFICIAL) ? false : 'no official audio table (.cache/gamedata, tools/build-data.mjs)';
const file = (u) => String(u).split('/').pop();
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));

const NEW_KEYS = {
  'chen3:t2evade': 'p_skill_hljdfswd.mp3', 'wisdel:tokenon': 'p_atk_wichrfystlfr.mp3',
  'kalts2:s3start': 'p_atk_khlrftcrfls.mp3', 'kalts2:s3reach': 'p_imp_khlrftcrfls.mp3', 'kalts2:respawn': 'p_skill_khlrftcrfd.mp3',
  'aglna2:born': 'b_char_arstrnstf.mp3', 'aglna2:s2begin': 'p_atk_arstrnstfbk.mp3', 'aglna2:restart': 'p_imp_arstrnstfm.mp3',
  'aglna2:s2fly': 'p_atk_arstrnstfrls.mp3', 'aglna2:levitate': 'p_imp_arstrnstfrlsr.mp3', 'aglna2:groundbind': 'p_imp_arstrnstfrlsgd.mp3',
  'aglna2:s3fly': 'p_atk_arstrnstfm.mp3',
  'phatm2:lure': 'p_atk_dmgrcvtx.mp3', 'phatm2:lurehit': 'p_atk_dmgrctmk.mp3', 'phatm2:boom': 'p_atk_dmgrctbm.mp3',
  'phatm2:boomstart': 'p_imp_dmgrctbm.mp3', 'phatm2:boomhit': 'p_imp_dmgrctbm_h.mp3', 'phatm2:s2dmg': 'p_imp_dmgrct_h.mp3',
};

function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url, o) => { a.played.push({ f: file(url), delay: o.delay ?? null }); };
  a.voice = () => false;
  return a;
}
const files = (a) => a.played.map((p) => p.f);
const units = (a, list) => a.setFieldUnits(list.map(([id, spine, side = 'ally', skillIndex = 0]) => ({ id, kind: side === 'enemy' ? 'enemy' : 'op', side, spine, defId: 'chess_x', skillIndex })));

describe('선발 sound banks wired from the linking sheet', () => {
  test('each new kit key sounds its official bank', { skip }, () => {
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    for (const [k, f] of Object.entries(NEW_KEYS)) {
      assert.equal(file(audio.bank(KIT_HIT_BANKS[k])?.[0]), f, k);
      assert.equal(file(manifest.audio.sfx.kit[k]), f, `manifest ${k}`);
    }
  });

  test('skill start: 丰川祥子 S2 sounds .2 (her cast from mode 2), 予愿安洁莉娜 S3 its suffixed signal — both real starts', { skip }, () => {
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    assert.equal(file(skillStartSounds(audio, 'skchr_oblvns_2')?.[0]), 'p_skill_mjckyrdslnt_h1.mp3');
    assert.equal(file(skillStartSounds(audio, 'skchr_aglna2_3')?.[0]), 'p_skill_arstrnstf_s.mp3');
    assert.equal(skillStartIsFallback(audio, 'skchr_oblvns_2'), false);
    assert.equal(skillStartIsFallback(audio, 'skchr_aglna2_3'), false);
    assert.equal(file(manifest.audio.sfx.units.char_4182_oblvns.skills[1]), 'p_skill_mjckyrdslnt_h1.mp3');
    assert.equal(file(manifest.audio.sfx.units.char_1015_aglna2.skills[2]), 'p_skill_arstrnstf_s.mp3');
  });

  test('kit keys by fx: the right operator only', () => {
    const defs = { 1: 'char_1050_chen3', 2: 'char_1052_kalts2', 3: 'char_1015_aglna2', 4: 'token_10054_phatm2_encdool', 5: 'token_10035_wisdel_wward', 6: 'char_1012_skadi2' };
    const unitOf = (id) => (defs[id] ? { def: defs[id] } : undefined);
    assert.equal(kitHitKey('evadeReady', { id: 1 }, unitOf), 'chen3:t2evade');
    assert.equal(kitHitKey('evadeReady', { id: 6 }, unitOf), null);
    assert.equal(kitHitKey('kalts2Takeoff', { id: 2 }, unitOf), 'kalts2:s3start');
    assert.equal(kitHitKey('teleport', { id: 2 }, unitOf), 'kalts2:s3reach');
    assert.equal(kitStartKey('teleport', { id: 2 }, unitOf), 'kalts2:respawn');
    assert.equal(kitHitKey('teleport', { id: 6 }, unitOf), null);
    assert.equal(kitHitKey('lure', { id: 9, src: 4 }, unitOf), 'phatm2:lurehit');
    assert.equal(kitStartKey('lure', { id: 9, src: 4 }, unitOf), 'phatm2:lure');
    assert.equal(kitHitKey('burst', { id: 5 }, unitOf), 'wisdel:token');
    assert.equal(kitStartKey('burst', { id: 5 }, unitOf), 'wisdel:tokenon');
    assert.equal(kitHitKey('dash', { id: 3, chant: 2.5 }, unitOf), 'aglna2:s2fly');
    assert.equal(kitHitKey('aglnaFlight', { id: 3, on: 1 }, unitOf), 'aglna2:s3fly');
    assert.equal(kitHitKey('aglnaFlight', { id: 3, on: 1, signal: 'comeback' }, unitOf), 'aglna2:restart');
    assert.equal(kitHitKey('aglnaFlight', { id: 3, on: 0 }, unitOf), null);
    assert.equal(kitStartKey('burst', { id: 5 }), null, 'without unitOf');
    assert.equal(statusSoundKey('levitate', 'char_1015_aglna2'), 'aglna2:levitate');
    assert.equal(statusSoundKey('groundbind', 'char_1015_aglna2'), 'aglna2:groundbind');
    assert.equal(statusSoundKey('levitate', 'char_1012_skadi2'), null);
    assert.equal(statusSoundKey('levitate'), null);
  });

  test('AudioManager: 予愿安洁莉娜 — deploy and S1 sound Born / Skill_1_Begin, S2 the sweep then Skill_2_Begin at the 吟唱\'s end, each enemy lifted / held down; a landing is silent', () => {
    const a = manager();
    units(a, [[1, 'char_1015_aglna2', 'ally', 1], [2, 'enemy_1006_shield', 'enemy'], [3, 'enemy_1006_shield', 'enemy']]);
    a.handleBattleEvents([['deploy', 1, 0]]);
    assert.ok(files(a).includes('b_char_arstrnstf.mp3'), files(a).join());
    a.played.length = 0;
    a.handleBattleEvents([['deploy', 1, 1]]);
    assert.ok(!files(a).includes('b_char_arstrnstf.mp3'), 'a flight\'s landing');
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'dash', 3, 0, { id: 1, tx: 5, ty: 0, t: 0.6, chant: 2.5 }]]);
    assert.deepEqual(a.played.map((p) => [p.f, p.delay]), [['p_atk_arstrnstfrls.mp3', null], ['p_atk_arstrnstfbk.mp3', 2.5]]);
    a.played.length = 0;
    a.handleBattleEvents([['status', 2, 'levitate', 1, 1], ['status', 3, 'groundbind', 1, 1], ['status', 2, 'levitate', 0]]);
    assert.deepEqual(files(a), ['p_imp_arstrnstfrlsr.mp3', 'p_imp_arstrnstfrlsgd.mp3']);
    const b = manager();
    units(b, [[1, 'char_1015_aglna2', 'ally', 0]]);
    b.handleBattleEvents([['skill', 1, 1]]);
    assert.ok(files(b).includes('b_char_arstrnstf.mp3'), files(b).join());
  });

  test('AudioManager: 本能的召唤 — a lure sounds its START and projectile HIT; leaving: Boom only on an arrival, boom_start, one boom_hit per enemy (at most the bank\'s 2); every phatm2_s_2[damage] tick', () => {
    const a = manager();
    units(a, [[1, 'char_1042_phatm2'], [4, 'token_10054_phatm2_encdool'], [2, 'enemy_1006_shield', 'enemy']]);
    a.handleBattleEvents([['fx', 'lure', 3, 0, { id: 2, src: 4, t: 9 }]]);
    assert.deepEqual(files(a).sort(), ['p_atk_dmgrctmk.mp3', 'p_atk_dmgrcvtx.mp3']);
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'aoe', 3, 0, { id: 4, radius: 2, skill: 'phatm2:call', n: 3, boom: 1 }]]);
    assert.deepEqual(files(a), ['p_atk_dmgrctbm.mp3', 'p_imp_dmgrctbm.mp3', 'p_imp_dmgrctbm_h.mp3', 'p_imp_dmgrctbm_h.mp3']);
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'aoe', 3, 0, { id: 4, radius: 2, skill: 'phatm2:call', n: 0 }]]);
    assert.deepEqual(files(a), ['p_imp_dmgrctbm.mp3'], 'its 10 s end with nobody in range');
    a.played.length = 0;
    a.handleBattleEvents([['dmg', 2, 50, 'arts', 0, 1, 1, 0, [['phatm2_s_2[damage]', 1]]]]);
    assert.deepEqual(files(a), ['p_imp_dmgrct_h.mp3']);
  });

  test('AudioManager: 赤刃明霄陈\'s held dodge, 魂灵之影\'s shot (ON + HIT), 凯尔希·思衡托\'s transport start and landing', () => {
    const a = manager();
    units(a, [[1, 'char_1050_chen3'], [5, 'token_10035_wisdel_wward'], [7, 'char_1052_kalts2', 'ally', 2], [2, 'enemy_1006_shield', 'enemy']]);
    a.handleBattleEvents([['fx', 'evadeReady', 3, 0, { id: 1 }]]);
    assert.deepEqual(files(a), ['p_skill_hljdfswd.mp3']);
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'burst', 3, 0, { id: 5 }]]);
    assert.ok(files(a).includes('p_atk_wichrfystlfr.mp3'), files(a).join());
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'kalts2Takeoff', 3, 0, { id: 7, signal: 'takeoff', t: 1, picks: [] }]]);
    assert.ok(files(a).includes('p_atk_khlrftcrfls.mp3'), files(a).join());
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'teleport', 3, 0, { id: 7, fromX: 1, fromY: 1 }]]);
    assert.deepEqual(files(a).sort(), ['p_imp_khlrftcrfls.mp3', 'p_skill_khlrftcrfd.mp3']);
  });
});

describe('酒神\'s kit: 本能的召唤 leaving tells the sounds what happened', () => {
  const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
  const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 1, mass: 0, atk: 50 }) };
  const CALL = 'token_10054_phatm2_encdool';
  function field() {
    const op = { uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: 'char_1042_phatm2', skillIndex: 1, uniEquipId: null }, elite: false, row: 10, col: 5 };
    const h = makeBattle({
      defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 },
      units: [op, { uid: 9, kind: 'token', tokenId: CALL, ownerUid: 1, row: 10, col: 6 }],
    });
    h.step();
    const u = h.unit(1);
    h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });
    return { h, call: h.b.allyUnits.find((x) => x.kind === 'token' && x.defId === CALL) };
  }
  const leaves = (h) => h.eventsOf('fx').filter((e) => e[1] === 'aoe' && e[4]?.skill === 'phatm2:call');

  test('its 10 s end: `n` the enemies of its x-1, no `boom`', () => {
    const { h, call } = field();
    const a = h.spawn('enemy_dummy', { pos: [11, 7] }), b = h.spawn('enemy_dummy', { pos: [9, 6] });
    for (const e of [a, b]) h.b.addBuff(e, { key: 'test:noattract', flags: { attract: true } });
    assert.ok(h.runUntil(() => !call.alive, 11));
    const [ev] = leaves(h);
    assert.equal(ev[4].n, 2);
    assert.equal(ev[4].boom, undefined);
  });

  test('a lured enemy reaching it: `boom` 1', () => {
    const { h, call } = field();
    for (let i = 0; i < 2; i++) h.spawn('enemy_walk', { routeIndex: 0 });
    assert.ok(h.runUntil(() => !call.alive, 12));
    const [ev] = leaves(h);
    assert.equal(ev[4].boom, 1);
    assert.ok(ev[4].n >= 1, `n ${ev[4].n}`);
  });
});
