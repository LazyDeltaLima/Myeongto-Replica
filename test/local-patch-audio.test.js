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

  test('skillModeIndex: the skills\' own prefab modes (char_modes.py skillMode) — 莫斯提马 S3 / 水月 S2·S3 (user report 2026-10-07)', () => {
    // 莫斯提马 [Default, S2]: her S3 switches to mode 1 (skchr_mostma_3 switch_mode_restart_fsm mode 1), her S2 to none
    assert.equal(skillModeIndex(['Default', 'S2'], 2, [null, null, 1]), 1);
    assert.equal(skillModeIndex(['Default', 'S2'], 1, [null, null, 1]), -1, 'a mode another skill\'s prefab claims');
    // 水月 [Default, T1, S1, S2]: S2 → 2, S3 → 3
    assert.equal(skillModeIndex(['Default', 'T1', 'S1', 'S2'], 1, [null, 2, 3]), 2);
    assert.equal(skillModeIndex(['Default', 'T1', 'S1', 'S2'], 2, [null, 2, 3]), 3);
    // a name the prefabs do not contradict stays (新约能天使 S3 → S3, not its prefab's S2_Down)
    assert.equal(skillModeIndex(['Default', 'S2', 'S2_Down', 'S3', 'S3_Down', 'S1', 'S1_Burst_Mode'], 2, [5, null, 2]), 3);
    const lcm = loadCharModes(ROOT);
    assert.deepEqual(lcm.char_213_mostma?.skillMode, [null, null, 1]);
    assert.equal(UNITS.char_213_mostma.modes?.[2]?.attack, '/assets/audio/sfx/player/p_atk/p_atk_whitetimewand_s.mp3', 'S3 attacks with the white time wand');
    assert.equal(UNITS.char_213_mostma.modes?.[1], undefined);
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

  test('skill loops: 丰川祥子 S3\'s music runs while the skill does, stops at its end / a new field; a looping start bank plays only as the loop', () => {
    const U = UNITS.char_4182_oblvns;
    assert.match(file(U.loops['2'].url), /^p_atk_mjckyrdslnt_lp\.mp3$/, 'ON_BUFF_START.oblvns_s_3[loop]');
    assert.ok(!U.modes['2'].deferStart, 'her S3 start (ON_CUSTOM_TRIGGER …[start]) is a real start sound');
    assert.equal(UNITS.char_174_slbell.loops['0'].start, true, 'a field whose start bank loops');
    const a = manager();
    a._buffer = async () => null;
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: 'char_4182_oblvns', defId: 'chess_x', skillIndex: 2 }]);
    a.handleBattleEvents([['skill', 1, 1]]);
    assert.ok(a._skillLoops?.has(1), 'loop started');
    assert.deepEqual(a.played.map((p) => p.unitKey), ['1:skill'], 'and its start sound');
    a.handleBattleEvents([['skill', 1, 0]]);
    assert.ok(!a._skillLoops.has(1), 'stopped with the skill');
    a.handleBattleEvents([['skill', 1, 1]]);
    a.setFieldUnits([]);
    assert.equal(a._skillLoops.size, 0, 'a new field stops it');
    const b = manager();
    b._buffer = async () => null;
    b.setFieldUnits([{ id: 3, kind: 'op', side: 'ally', spine: 'char_174_slbell', defId: 'chess_y', skillIndex: 0 }]);
    b.handleBattleEvents([['skill', 3, 1]]);
    assert.ok(b._skillLoops.has(3));
    assert.equal(b.played.length, 0, 'the looping start bank is not also played once');
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

describe('normal attacks sound only their Default mode (user report 2026-10-07 #7: 银灰 S3 on every attack)', () => {
  test('defaultModeBanks: skill modes\' numbered attack banks leave the table; Default .0, combat, talent modes stay', async () => {
    const { defaultModeBanks } = await import('../tools/assets/skill-mode-sfx.mjs');
    const sv = new Map([['ON_ABILITY_HIT.combat', ['spear_n']], ['ON_ABILITY_START.attack.2', ['silver_n']], ['ON_ABILITY_HIT.attack.1', ['sword_n']],
      ['ON_UNIT_DEAD', ['die']]]);
    assert.deepEqual([...defaultModeBanks(sv, { modes: ['Default', 'S2', 'S3'] }).keys()], ['ON_ABILITY_HIT.combat', 'ON_UNIT_DEAD']);
    const ob = new Map([['ON_ABILITY_ON.attack.0.1', ['a_h']], ['ON_ABILITY_START.attack.4.1', ['slnt']]]);
    assert.deepEqual([...defaultModeBanks(ob, { modes: ['Default', 'S2_AttackSpeed', 'S2_Atk', 'S2_Fever', 'S3'] }).keys()], ['ON_ABILITY_ON.attack.0.1']);
    const ind = new Map([['ON_ABILITY_ON.attack.1', ['t1']], ['ON_ABILITY_ON.attack.2', ['s1']]]);
    assert.deepEqual([...defaultModeBanks(ind, { modes: ['Default', 'Default_T1', 'S1'] }, { projectile: true }).keys()], ['ON_ABILITY_ON.attack.1'], 'Default_T1 is a talent mode');
    assert.equal(defaultModeBanks(sv, undefined), sv, 'no mode info: unchanged');
    // [ASSUMED] no Default attack bank at all (玛恩纳 — only S1's): the old pick stays rather than a silent attack
    const ml = new Map([['ON_ABILITY_HIT.attack.1', ['loyal_n']]]);
    assert.equal(defaultModeBanks(ml, { modes: ['Default', 'S1', 'S2', 'S3'] }), ml);
    assert.equal(defaultModeBanks(ml, { modes: ['Default', 'S1', 'S2', 'S3'] }, { projectile: true }).size, 0, 'a Default projectile bank counts');
  });

  test('the manifest: 银灰 / 号角 / 丰川祥子 / 圣约送葬人 / 雷蛇 normal attacks without their skill-mode sounds', () => {
    const sv = UNITS.char_172_svrash;
    assert.equal(sv.attack, undefined, '银灰: no Default attack sound (not S3\'s p_atk_silver_n)');
    assert.match(file(sv.hit), /^p_imp_spear_n\.mp3$/, '银灰: his Default combat impact');
    assert.ok(!/blackcannon/.test(UNITS.char_4039_horn.attack || ''), '号角: not S2\'s cannon cast');
    assert.match(file(UNITS.char_4039_horn.hit), /^p_imp_heavygun_n\.mp3$/);
    assert.match(file(UNITS.char_4182_oblvns.attack), /^p_atk_mjckyrdnt_h\.mp3$/, '丰川祥子: her Default ON.attack.0.1, not S3\'s slnt');
    assert.equal(UNITS.char_1032_excu2.hit, undefined, '圣约送葬人: not S3_End\'s p_imp_bngel');
    assert.equal(UNITS.char_107_liskam.hit, undefined, '雷蛇: not S2\'s lightning');
    assert.match(file(UNITS.char_4064_mlynar.hit), /^p_imp_loyalsword_n\.mp3$/, '玛恩纳 [ASSUMED]: no Default bank — the old pick stays');
    assert.match(file(UNITS.char_172_svrash.modes['2'].attack), /^p_atk_silver_n\.mp3$/, 'S3 keeps its own');
  });

  test('蕾缪安 S3: lock mark, bombardment start, each shell landing (user report #10)', async () => {
    const { kitHitKey } = await import('../public/js/audio.js');
    const units = new Map([[1, { def: 'char_4193_lemuen', skillIndex: 2 }], [2, { def: 'char_4193_lemuen', skillIndex: 1 }], [3, { def: 'char_1035_wisdel' }]]);
    const of = (id) => units.get(id);
    assert.equal(kitHitKey('lock', { id: 9, src: 1 }, of), 'lemuen:mark');
    assert.equal(kitHitKey('lock', { id: 9, src: 2 }, of), null, 'S2\'s aim lock is no S3 mark');
    assert.equal(kitHitKey('bombardShell', { id: 1, i: 0 }, of), 'lemuen:s3end');
    assert.equal(kitHitKey('bombardShell', { id: 1, i: 3 }, of), null, 'the start sounds once');
    assert.equal(kitHitKey('bombardShell', { id: 3, i: 0 }, of), 'wisdel:s2');
    assert.equal(kitHitKey('bombard', { id: 1 }, of), 'lemuen:shell');
    assert.equal(kitHitKey('bombard', { id: 3 }, of), null);
    for (const k of ['lemuen:mark', 'lemuen:s3end', 'lemuen:shell']) assert.match(manifest.audio.sfx.kit?.[k] || '', /\/p_(imp|atk)\/p_(imp|atk)_lmwlcrstr/, k);
    assert.equal(manifest.audio.sfx.kitGrp['lemuen:shell'], 'Battle_P_SImp');
  });
});

describe('kit sounds cut their oldest copy like the official popOldest banks (蕾缪安 S3 shells, user report #10)', () => {
  /** A manager with a fake Web Audio context: every source it starts / stops is recorded. */
  function live() {
    const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
    const started = [], stopped = [];
    a.ctx = {
      createBufferSource: () => ({ buffer: null, playbackRate: { value: 1 }, onended: null, connect() {},
        start() { started.push(this); }, stop() { stopped.push(this); this.onended?.(); } }),
      createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    };
    a.sfxGain = {};
    a._buffer = async () => ({ duration: 30 });
    a.voice = () => false;
    a.limiter.unitCooldownMs = 0; a.limiter.urlGapMs = 0;   // the gaps are not under test
    return { a, started, stopped };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  test('the manifest carries the official limits of the kit banks (sfx.kitLimit)', () => {
    assert.deepEqual(manifest.audio.sfx.kitLimit?.['lemuen:shell'], { max: 3, pop: true });
    assert.deepEqual(manifest.audio.sfx.kitLimit?.['lemuen:mark'], { max: 1, pop: true });
  });

  test('five shells landing: all five sound, at most 3 at once, the oldest cut', async () => {
    const { a, started, stopped } = live();
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: 'char_4193_lemuen', defId: 'chess_x', skillIndex: 2 }]);
    const url = manifest.audio.sfx.kit['lemuen:shell'];
    for (let i = 0; i < 5; i++) { a.handleBattleEvents([['fx', 'bombard', 3, 3, { id: 1, r: 1 }]]); await tick(); }
    const shells = started.filter((s) => s.buffer);
    assert.equal(shells.length, 5, 'every landing starts its sound');
    assert.equal(stopped.length, 2, 'the two oldest were cut');
    assert.equal(a.limiter.activeByUrl.get(url), 3, 'three playing');
  });

  test('unit sounds keep the old cap: a third overlapping copy is dropped, nothing cut', async () => {
    const { a, started, stopped } = live();
    for (let i = 0; i < 3; i++) { a._play('/x/hit.mp3', { limited: true, unitKey: `u${i}` }); await tick(); }
    assert.equal(started.length, 2);
    assert.equal(stopped.length, 0);
  });
});

describe('deploy sounds on every placement (user report 2026-10-07 #1 / #2, audio.js playDeploySfx / prepDeploy)', () => {
  test('a prep drop-in sounds the operator\'s own ON_UNIT_BORN (望, 余), else b_char_set; summons theirs / b_char_tokenset; items nothing', () => {
    const a = manager();
    a.prepDeploy({ kind: 'op', defId: 'chess_diy_wang_6_a', spine: 'char_2027_wang' }, 1);
    a.prepDeploy({ kind: 'op', defId: 'x', spine: 'char_2026_yu' }, 2);
    a.prepDeploy({ kind: 'op', defId: 'x', spine: 'char_263_skadi' }, 3);
    a.prepDeploy({ kind: 'token', defId: 'token_10064_wang_stone1', spine: 'token_10064_wang_stone1' }, 4);
    a.prepDeploy({ kind: 'token', defId: 'token_10017_skadi2_dedant', spine: 'token_10017_skadi2_dedant' }, 5);
    a.prepDeploy({ kind: 'item', defId: 'item_x' }, 6);
    assert.deepEqual(a.played.map((p) => file(p.url)),
      ['b_char_stwctpbn.mp3', 'p_skill_frbytrtn_bn.mp3', 'b_char_set.mp3', 'p_imp_stwctptkin.mp3', 'b_char_tokenset.mp3']);
    assert.ok(a.played.every((p, i) => close(p.volume, GROUP_GAIN.Battle_UI_Important * (i === 1 ? 0.75 : 1))), 'Battle_UI_Important (× 余\'s bank volume 0.75)');
  });

  test('battle: a deploy sounds once — not again right after the same model\'s prep drop-in; a 跟子 lands with its projectile birth, not a stone\'s', () => {
    const a = manager();
    a.handleBattleEvents([['spawn', { id: 7, spine: 'char_2027_wang', defId: 'chess_diy_wang_6_a', kind: 'op', side: 'ally' }], ['deploy', 7]]);
    assert.deepEqual(a.played.map((p) => file(p.url)), ['b_char_stwctpbn.mp3']);
    const b = manager();
    b.prepDeploy({ kind: 'op', defId: 'chess_diy_wang_6_a', spine: 'char_2027_wang' }, 1);
    b.handleBattleEvents([['spawn', { id: 7, spine: 'char_2027_wang', defId: 'chess_diy_wang_6_a', kind: 'op', side: 'ally' }], ['deploy', 7]]);
    assert.equal(b.played.length, 1, 'the prep drop-in already sounded');
    const c = manager();
    const S = 'token_10064_wang_stone1';
    c.handleBattleEvents([['spawn', { id: 8, spine: S, defId: S, kind: 'token', side: 'ally' }], ['deploy', 8],
      ['spawn', { id: 9, spine: S, defId: S, kind: 'token', side: 'ally' }], ['deploy', 9], ['fx', 'summon', 0, 0, { id: 9, follower: true }]]);
    assert.deepEqual(c.played.map((p) => file(p.url)), ['p_imp_stwctptkin.mp3', 'p_imp_stwctptkpa.mp3']);
  });

  test('battle start: the opening deployment sounds one by one with its drops (2-4, render/units.js BORN_STAGGER_S)', async () => {
    const src = readFileSync(path.join(ROOT, 'public', 'js', 'audio.js'), 'utf8');
    assert.match(src, /const OPENING_DEPLOY_STAGGER_MS = 120;/, '= BORN_STAGGER_S 0.12 s');
    const a = manager();
    const ops = ['char_2027_wang', 'char_2026_yu', 'char_263_skadi'];
    a.handleBattleEvents(ops.flatMap((spine, i) => [['spawn', { id: i + 1, spine, defId: 'x', kind: 'op', side: 'ally' }], ['deploy', i + 1]]));
    assert.deepEqual(a.played.map((p) => file(p.url)), ['b_char_stwctpbn.mp3'], 'the first at once');
    await new Promise((r) => setTimeout(r, 160));
    assert.deepEqual(a.played.map((p) => file(p.url)), ['b_char_stwctpbn.mp3', 'p_skill_frbytrtn_bn.mp3'], 'the second 0.12 s later');
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(a.played.length, 3, 'the third 0.24 s later');
    // a later deploy (a redeploy) is not part of it; a new field forgets the last one's pending turns
    a.handleBattleEvents([['spawn', { id: 9, spine: 'char_263_skadi', defId: 'x', kind: 'op', side: 'ally' }]]);
    a._opening.at -= 5000;
    a.handleBattleEvents([['deploy', 9]]);
    assert.equal(a.played.length, 4, 'a redeploy sounds at once');
    const b = manager();
    b.handleBattleEvents(ops.flatMap((spine, i) => [['spawn', { id: i + 1, spine, defId: 'x', kind: 'op', side: 'ally' }], ['deploy', i + 1]]));
    b.setFieldUnits([]);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(b.played.length, 1, 'cancelled with the field');
  });

  test('望 stone pop: the token ability start (p_atk_stwctp_*) with its impact; S1\'s impact rides the DoT ticks', () => {
    const a = manager();
    const S = 'token_10064_wang_stone1';
    a.handleBattleEvents([['fx', 'zone', 0, 0, { token: S, skill: 1, id: 3 }], ['fx', 'kitHit', 0, 0, { k: 'wang:1', id: 1 }],
      ['fx', 'zone', 0, 0, { token: S, skill: 2, id: 4 }], ['fx', 'zone', 0, 0, { token: S, skill: 2, id: 5, follower: true }], ['fx', 'zone', 0, 0, { token: S, skill: 3, id: 6 }]]);
    assert.deepEqual(a.played.map((p) => file(p.url)),
      ['p_atk_stwctp_d.mp3', 'p_imp_stwctp_d.mp3', 'p_atk_stwctp_h.mp3', 'p_imp_stwctp_h.mp3', 'p_atk_stwctps_h.mp3', 'p_imp_stwctp_h.mp3', 'p_atk_stwctp_s.mp3', 'p_imp_stwctp_s.mp3']);
  });
});

describe('a lone non-primary skill start sound is kept (user report 2026-10-08: 望 S3 had no sound, tools/assets/plan.mjs)', () => {
  test('望 S3 skchr_wang_3 = ON_SKILL_START p_skill_stwctp_s (Battle_UI_Boost) — her S1 / S2 have none', () => {
    assert.equal(file(UNITS.char_2027_wang.skills?.['2']), 'p_skill_stwctp_s.mp3');
    assert.equal(UNITS.char_2027_wang.skills['0'], undefined);
    const a = manager();
    a.handleBattleEvents([['spawn', { id: 7, spine: 'char_2027_wang', defId: 'chess_diy_wang_6_a', kind: 'op', side: 'ally', skillIndex: 2 }], ['skill', 7, 1]]);
    assert.deepEqual(a.played.filter((p) => /p_skill/.test(p.url)).map((p) => file(p.url)), ['p_skill_stwctp_s.mp3']);
    const b = manager();
    b.handleBattleEvents([['spawn', { id: 7, spine: 'char_2027_wang', defId: 'chess_diy_wang_6_a', kind: 'op', side: 'ally', skillIndex: 0 }], ['skill', 7, 1]]);
    assert.equal(b.played.filter((p) => /p_skill/.test(p.url)).length, 0, 'S1 stays silent (no bank)');
    // the same gap left 3 more operators silent: 琳琅诗怀雅 S3, 普罗旺斯 S2, 华法琳 S2 (b_char_atkboost / healboost)
    for (const [id, i] of [['char_1033_swire2', '2'], ['char_145_prove', '1'], ['char_171_bldsk', '1']]) assert.equal(typeof UNITS[id].skills?.[i], 'string', id);
  });
});
