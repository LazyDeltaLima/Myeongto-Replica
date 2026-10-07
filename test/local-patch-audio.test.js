// test/local-patch-audio.test.js — skill-mode attack / impact sounds and the official battle mix (local patch,
// docs/LOCAL-PATCH.md 「스킬 모드 효과음·믹서 볼륨」): tools/local-extract/char_modes.py → tools/assets/local-char-modes.json,
// tools/assets/skill-mode-sfx.mjs (plan.mjs: sfx.units[id].modes / grp / skillMix, sfx.kitGrp), public/js/audioOfficial.js
// and its hooks in public/js/audio.js.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../public/js/audio.js';
import { GROUP_GAIN, VOICE_GAIN, officialGain, battleGain, roleGroup, modeEntry } from '../public/js/audioOfficial.js';
import { skillModeIndex, modeSounds, abilitySounds, loadCharModes } from '../tools/assets/skill-mode-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
const UNITS = manifest.audio.sfx.units;
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const close = (a, b) => Math.abs(a - b) < 1e-9;

/** An audio manager with a context, recording what it would play: [{ url, volume, unitKey }]. */
function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = {};
  a.played = [];
  a._play = (url, o) => { a.played.push({ url, volume: o.volume, unitKey: o.unitKey }); };
  a.voice = () => false;
  return a;
}
const file = (u) => String(u).split('/').pop();

describe('skill-mode sounds: the data (local-char-modes.json, plan.mjs)', () => {
  test('skillModeIndex: S<k>, ranges, Sk<k>, variants; Default and non-skill modes never', () => {
    assert.equal(skillModeIndex(['Default', 'S2', 'S2_Overload', 'S3'], 1), 1);
    assert.equal(skillModeIndex(['Default', 'S2', 'S2_Overload', 'S3'], 2), 3);
    assert.equal(skillModeIndex(['Default', 'S2', 'S2_Overload', 'S3'], 0), -1);
    assert.equal(skillModeIndex(['Default', 'S2-3'], 2), 1, 'a range');
    assert.equal(skillModeIndex(['Default', 'S1_TakeOff', 'S1'], 0), 2, 'the exact name before a variant');
    assert.equal(skillModeIndex(['Default', 'Sk2', 'Sk3_Zero', 'Sk3'], 2), 3);
    assert.equal(skillModeIndex(['Default', 'S2Respawn'], 1), 1, 'a variant when it is the only one');
    assert.equal(skillModeIndex(['Default', 'Reborn', 'Stand'], 0), -1);
  });

  test('local-char-modes.json: every operator of the pool, Default first, one projectile list per mode', () => {
    const modes = loadCharModes(ROOT);
    const chess = JSON.parse(readFileSync(path.join(ROOT, 'data', 'chess.json'), 'utf8'));
    const ids = new Set(Object.values(chess.chess ?? chess).map((c) => c && c.charId).filter((id) => typeof id === 'string' && id.startsWith('char_')));
    for (const id of ids) {
      assert.ok(modes[id], `${id} listed (run tools/local-extract/char_modes.py)`);
      assert.equal(modes[id].modes[0], 'Default', id);
      assert.equal(modes[id].proj.length, modes[id].modes.length, id);
    }
  });

  test('the manifest: 阿斯卡纶 S2 / S3 and 维什戴尔 S3 attack with their mode files, groups and bank volumes', () => {
    const a = UNITS.char_4132_ascln;
    assert.match(file(a.modes['1'].attack), /^p_atk_smksndrt_h\.mp3$/);
    assert.match(file(a.modes['1'].hit), /^p_imp_smksndrt_h\.mp3$/);
    assert.equal(a.modes['1'].mix.attack.vol, 1.8);
    assert.deepEqual(a.modes['2'].grp, { attack: 'Battle_P_SAtk', hit: 'Battle_P_SImp' });
    assert.match(file(a.modes['2'].attack), /_s\.mp3$/);
    assert.equal(a.grp.attack, 'Battle_P_NAtk');
    assert.match(file(UNITS.char_1035_wisdel.modes['2'].attack), /^p_atk_dkmrcaygnfr_s\.mp3$/, 'S3 = mode 3 (attack.3.1)');
    assert.match(file(UNITS.char_1035_wisdel.modes['2'].hit), /^p_imp_/, 'S3 impact: its projectile bank');
    assert.equal(a.modes['0'].deferStart, true, 'S1 (an attack ability, no ON_SKILL_START): its start sound waits for its attack');
    assert.ok(!a.modes['1'].deferStart, 'S2 has its own start bank');
    assert.equal(manifest.audio.sfx.kitGrp['wisdel:s2'], 'Battle_P_SImp');
    const enemy = Object.entries(UNITS).find(([k, v]) => k.startsWith('enemy_') && v.grp?.attack)?.[1];
    assert.match(enemy.grp.attack, /^Battle_(E|BE)_/, 'enemies carry their groups');
  });

  test('modeSounds / abilitySounds from the official audio_data (when the gamedata cache is there)', { skip: !existsSync(OFFICIAL) && 'no .cache/gamedata' }, () => {
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    const s3 = modeSounds(audio, 'char_1035_wisdel', 3, ['projectile_chr_wisdel_s3']);
    assert.deepEqual(s3.attack, ['player/p_atk/p_atk_dkmrcaygnfr_s.mp3']);
    assert.ok(s3.hit?.length, 'the S3 projectile impact');
    assert.deepEqual(modeSounds(audio, 'char_1035_wisdel', 9), {}, 'an unknown mode: nothing');
    assert.ok(abilitySounds(audio, 'skchr_ascln_1').hit?.length, 'an attack ability skill');
    assert.equal(audio.groupOf(audio.bank('battle.ON_ABILITY_START.char_4132_ascln.attack.1')), 'Battle_P_SAtk');
  });
});

describe('the official mix and mode sounds in audio.js (audioOfficial.js)', () => {
  test('group gains: operator attack 0.348, enemy attack 0.163, voice 0.978; a bank volume above 1 stays louder', () => {
    assert.equal(GROUP_GAIN.Battle_P_NAtk, 0.348);
    assert.equal(VOICE_GAIN, 0.978);
    assert.ok(close(officialGain('char_x', 'attack', { grp: { attack: 'Battle_P_NAtk' } }, { vol: 2 }), 0.696));
    assert.ok(close(officialGain('enemy_x', 'attack', null, null), GROUP_GAIN.Battle_E_NAtk), 'no group: the role\'s official group');
    assert.equal(roleGroup('char_x', 'hit', true), 'Battle_P_SImp');
    assert.ok(close(officialGain('char_x', 'skill', { grp: { skills: { 2: 'Battle_UI_Boost' } } }, { vol: 1.8 }, { skillIndex: 2 }), 0.67 * 1.8));
    assert.ok(close(battleGain('heal'), GROUP_GAIN.SFX_Battle * 0.8));
    assert.equal(modeEntry({ modes: { 1: { hit: 'x' } } }, 1, 'attack'), null, 'a mode without that role');
  });

  test('阿斯卡纶: S3 attacks and impacts sound S3; before and after it the normal ones; groups × bank volumes', () => {
    const a = manager();
    const U = UNITS.char_4132_ascln;
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: 'char_4132_ascln', defId: 'chess_x', skillIndex: 2 }, { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' }]);
    a.handleBattleEvents([['atk', 1, 2, 'none'], ['dmg', 2, 100, 'phys']]);
    a.handleBattleEvents([['skill', 1, 1], ['atk', 1, 2, 'none'], ['dmg', 2, 100, 'phys']]);
    a.handleBattleEvents([['skill', 1, 0], ['atk', 1, 2, 'none'], ['dmg', 2, 100, 'phys']]);
    const urls = a.played.map((p) => file(p.url));
    assert.deepEqual(urls, [file(U.attack), file(U.hit), file(U.skills['2']), file(U.modes['2'].attack), file(U.modes['2'].hit), file(U.attack), file(U.hit)]);
    assert.ok(close(a.played[0].volume, 0.348 * (U.mix?.attack?.vol ?? 1)), 'normal attack: Battle_P_NAtk × its bank volume');
    assert.ok(close(a.played[3].volume, 0.428 * 1.3), 'S3 attack: Battle_P_SAtk × 1.3');
  });

  test('an attack-ability skill (阿斯卡纶 S1): its attack sounds the skill, no separate start sound; one without an attack plays it at its end', () => {
    const a = manager();
    const U = UNITS.char_4132_ascln;
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: 'char_4132_ascln', defId: 'chess_x', skillIndex: 0 }, { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' }]);
    a.handleBattleEvents([['skill', 1, 1], ['atk', 1, 2, 'none'], ['dmg', 2, 100, 'phys'], ['skill', 1, 0]]);
    assert.deepEqual(a.played.map((p) => file(p.url)), [file(U.modes['0'].attack), file(U.modes['0'].hit)]);
    a.played.length = 0;
    a.handleBattleEvents([['skill', 1, 1]]);
    assert.equal(a.played.length, 0, 'held while the skill waits for its attack');
    a.handleBattleEvents([['atk', 1, 2, 'none']]);
    assert.deepEqual(a.played.map((p) => file(p.url)), [file(U.modes['0'].attack)], 'the attack of a later batch: the skill\'s attack sound only');
    a.handleBattleEvents([['skill', 1, 0]]);
    a.played.length = 0;
    a.handleBattleEvents([['skill', 1, 1], ['skill', 1, 0]]);
    assert.deepEqual(a.played.map((p) => p.unitKey), ['1:skill'], 'ended without an attack: the start sound then');
  });

  test('enemies attack at Battle_E_NAtk or their own group (−9 dB under the old 0.55)', () => {
    const [id, U] = Object.entries(UNITS).find(([k, v]) => k.startsWith('enemy_') && typeof v.attack === 'string' && !v.mix?.attack?.p);
    const a = manager();
    a.setFieldUnits([{ id: 5, kind: 'enemy', side: 'enemy', spine: id }, { id: 6, kind: 'op', side: 'ally', spine: 'char_4132_ascln' }]);
    a.handleBattleEvents([['atk', 5, 6, 'none']]);
    assert.ok(close(a.played[0].volume, GROUP_GAIN[U.grp?.attack ?? 'Battle_E_NAtk'] * (U.mix?.attack?.vol ?? 1)), id);
    assert.ok(a.played[0].volume < 0.4);
  });
});
