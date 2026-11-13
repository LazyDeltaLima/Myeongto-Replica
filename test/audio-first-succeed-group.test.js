// test/audio-first-succeed-group.test.js — an attack ability that is an AbilityFirstSucceedGroup (docs/rules/audio.md
// 「공격 소리 신호」, 2026-11-01): the official client casts the first child in order that is ready and casts (CastToTarget) and
// gives child i the signal '{parent}.{i + 1}' (DoSetData). tools/local-extract/char_audio.py names the group by its
// MonoScript (`g: 'first'`), tools/assets/skill-mode-sfx.mjs soundSet → sel { how: 'first', def, sig }, public/js/audio.js picks
// the child the sim's swing names (9th field) — 冻河's T2Attack — else the plain attack. 蕾缪安 S2's M2Attack is one too: its
// Aim child is the kit's own channel (sfx.kit lemuen:aim / snipe / s2hit), her normal attacks are its Normal child.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, kitHitKey, signalFxKey } from '../public/js/audio.js';
import { pickVariant } from '../public/js/audioOfficial.js';
import { loadCharAudio, soundSet } from '../tools/assets/skill-mode-sfx.mjs';
import { KIT_HIT_BANKS } from '../tools/assets/kit-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';
import { fxEvent } from './helpers/fxEvent.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
const UNITS = manifest.audio.sfx.units;
const file = (u) => String(u).split('/').pop();
const TOCKA = 'char_4244_tocka', LEMUEN = 'char_4193_lemuen', SVASH2 = 'char_1045_svash2';

function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url) => { a.played.push(file(url)); };
  a.voice = () => false;
  return a;
}
const heard = (a, ev) => { a.played.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
const field = (a, op, skillIndex = 0) => a.setFieldUnits([
  { id: 1, kind: 'op', side: 'ally', spine: op, defId: 'chess_x', skillIndex },
  { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' },
]);

describe('the prefab facts and the sound sets', () => {
  const CA = loadCharAudio(ROOT);
  test('char_audio.py: 冻河\'s Attack and 蕾缪安 S2\'s M2Attack are first-succeed groups; 실버애쉬 더 레인프로스트 S3\'s ExtraAbilities is no group', () => {
    assert.deepEqual(CA[TOCKA].ab[0].attack, { names: ['T2Attack', 'NormalAttack'], g: 'first', n: 2,
      kidProj: [['projectile_chr_tocka_t2'], ['projectile_chr_tocka']] });
    assert.deepEqual([CA[LEMUEN].ab[2].attack.g, CA[LEMUEN].ab[2].attack.n, CA[LEMUEN].ab[2].attack.names], ['first', 2, ['Aim', 'Normal']]);
    assert.deepEqual(CA[SVASH2].ab[1].attack, {}, 'its S3 Attack sounds as itself (attack.1)');
  });

  test('soundSet: a child per signal, the plain attack by default, T2Attack\'s projectile on its own child', { skip: NO_DATA }, () => {
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    const leaf = (p) => `/x/${file(p[0])}`;
    const t = soundSet(audio, TOCKA, CA[TOCKA], 0, leaf);
    assert.deepEqual(t.sel, { attack: { n: 2, how: 'first', def: 2, sig: { T2Attack: 1 } } });
    assert.deepEqual(t.cues.map((c) => `${c.at}:${file(c.u)}#${c.k}`), ['a:p_atk_rylntbwmfr.mp3#1', 'd:p_imp_rylntbwm.mp3#1',
      'a:p_atk_rylntbwfr_n.mp3#2', 'd:p_imp_rylntbw_n.mp3#2']);
    const l = soundSet(audio, LEMUEN, CA[LEMUEN], 2, leaf);
    assert.deepEqual(l.sel, { attack: { n: 2, how: 'first', def: 2, sig: { Aim: 1 } } });
    assert.deepEqual(UNITS[TOCKA].sel, t.sel, 'the manifest');
    assert.deepEqual(UNITS[LEMUEN].modes['1'].sel, l.sel, 'the manifest (her S2 mode)');
  });

  test('pickVariant first: the named child, else `def`; a name outside the group is the plain attack', () => {
    const sel = { attack: { n: 2, how: 'first', def: 2, sig: { T2Attack: 1 } } };
    const pick = (signal) => pickVariant(sel, 'attack', { melee: false, mem: {}, random: () => 0, signal });
    assert.deepEqual([pick('T2Attack'), pick(null), pick('T.1'), pick(undefined)], [1, 2, 2, 2]);
  });
});

describe('playing them (audio.js)', () => {
  test('冻河: the swing T2Attack names sounds T2Attack\'s strike and its projectile\'s HIT; other attacks the plain one, never in turn', () => {
    const a = manager();
    field(a, TOCKA);
    const t2 = heard(a, [['swing', 1, 0.3, 'arrow', 0, null, null, 0, 'T2Attack'], ['atk', 1, 2, 'arrow', 'T2Attack'], ['dmg', 2, 100, 'phys']]);
    assert.deepEqual(t2, ['p_atk_rylntbwmfr.mp3', 'p_imp_rylntbwm.mp3']);
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(heard(a, [['swing', 1, 0.3, 'arrow'], ['atk', 1, 2, 'arrow'], ['dmg', 2, 100, 'phys']]),
        ['p_atk_rylntbwfr_n.mp3', 'p_imp_rylntbw_n.mp3'], `plain attack ${i + 1}`);
    }
  });

  test('蕾缪安 S2: her normal attacks sound the Normal child; the aim its charge, the shot its ON and projectile HIT', () => {
    const a = manager();
    field(a, LEMUEN, 1);
    a.handleBattleEvents([['skill', 1, 1]]);
    for (let i = 0; i < 2; i++) assert.deepEqual(heard(a, [['swing', 1, 0.3, 'arrow']]), ['p_atk_lmwlcrstr_h.mp3'], `Normal ${i + 1}`);
    assert.deepEqual(heard(a, [fxEvent('lemuenAim', { x: 0, y: 0, id: 1, signal: 'aim', on: 1 })]), ['p_atk_lmwlcrstrcg_h.mp3']);
    assert.deepEqual(heard(a, [fxEvent('lemuenAim', { x: 0, y: 0, id: 1, signal: 'aim', on: 0 })]), [], 'the aim ending');
    assert.deepEqual(heard(a, [fxEvent('crit', { x: 0, y: 0, id: 2, src: 1 })]).sort(), ['p_atk_lmwlcrstrcgst_h.mp3', 'p_imp_lmwlcrstr_d.mp3']);
    const unitOf = (id) => (id === 1 ? { def: 'char_1_05_vigna', skillIndex: 1 } : { side: 'enemy' });
    assert.equal(kitHitKey('crit', { id: 2, src: 1 }, unitOf), null, 'another operator\'s crit');
    assert.equal(signalFxKey('crit', { id: 2, src: 1 }, unitOf), null);
    assert.equal(KIT_HIT_BANKS['lemuen:aim'], 'battle.ON_ABILITY_START.char_4193_lemuen.attack.2.1');
  });

  test('冻河 in the sim: the attack that spends T2\'s mark swings T2Attack, and the audio manager plays its sounds', () => {
    const ENEMIES = { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, mass: 0 }) };
    const h = makeBattle({
      defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 },
      units: [{ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId: TOCKA, skillIndex: 0 }, row: 10, col: 5 }],
      enemies: [{ key: 'enemy_dummy', pos: [10, 8] }],
    });
    h.step();
    const u = h.unit(1);
    assert.ok(h.runUntil(() => u.buffs.some((x) => x.key === 'tocka:mark'), 30), 'S1 on herself: the mark');
    const n0 = h.eventsOf('swing').length;
    assert.ok(h.runUntil(() => !u.buffs.some((x) => x.key === 'tocka:mark'), 5), 'spent by the next attack');
    h.run(2);
    const swings = h.eventsOf('swing').slice(n0).filter((e) => e[1] === u.id);
    assert.ok(swings.length >= 2, 'the T2 attack and a plain one after it');
    assert.equal(swings[0][8], 'T2Attack');
    assert.ok(swings.slice(1).every((e) => e[8] == null), 'the attacks after it are plain');
    const a = manager();
    a.setFieldUnits([{ id: u.id, kind: 'op', side: 'ally', spine: TOCKA, defId: 'chess_x', skillIndex: 0 }]);
    assert.deepEqual(heard(a, [swings[0], ['atk', u.id, 99, 'arrow', 'T2Attack']]), ['p_atk_rylntbwmfr.mp3']);
    assert.deepEqual(heard(a, [swings[1], ['atk', u.id, 99, 'arrow']]), ['p_atk_rylntbwfr_n.mp3']);
  });
});
