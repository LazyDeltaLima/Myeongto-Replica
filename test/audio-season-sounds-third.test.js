// test/audio-season-sounds-third.test.js — 规程's sounds of 2026-11-12, third part (docs/rules/audio.md 「규정 새 적 소리 — 셋째」,
// 「규정 새 적 소리」 walking allies, 「스킬 효과음」 begin clip; docs/rules/diy.md the 规程 chess picks' sounds): the 悬赏 enemies
// (遮天面包机's bomb, 聆风猎手's blink, 暴走食人花's digesting, 破城者's missiles), 赘生甲壳 made and destroyed, 淬羽赫默 S3's 不死,
// 机械师 S2 / S3, a walking ally's born / dead class, and a skill ability's START after its begin clip. Sound tests count: how many
// of each, and that the ones that must not sound do not.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, seasonSounds, mcnistChargeSounds, unitSoundClass, deploySfxUrl, deathSfxUrl } from '../public/js/audio.js';
import { skillBeginOf, castCuesOf } from '../public/js/audioOfficial.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { loadSkillBegin, skillBeginLeads } from '../tools/assets/skill-mode-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { getData } from '../server/data.js';
import { makeBattle, chessRec } from './helpers/battleHarness.js';
import * as enemiesMod from '../server/sim/content/enemies.js';
import * as bossesMod from '../server/sim/content/bosses.js';
import { fxEvent } from './helpers/fxEvent.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const file = (u) => String(u).split('/').pop();
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));

/** An audio manager that records what it plays (file, delay in game seconds) and lets a test cancel what waits. */
function manager() {
  const a = new AudioManager({ win: null, getManifest: () => MANIFEST, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a.waits = [];
  a._play = (url, o = {}) => {
    const rec = { f: file(url), delay: o.delay ?? null, cancelled: false };
    a.played.push(rec.f);
    a.waits.push(rec);
    return () => { rec.cancelled = true; };
  };
  a.voice = () => false;
  return a;
}
const count = (list, f) => list.filter((x) => x === f).length;

const NEW_KEYS = ['nsbomb:drop', 'nsbomb:reach', 'shkrbt:blink', 'shkrbt:blinkend', 'trwlpl:digested', 'trwlpl:vomit', 'dsshell:born',
  'dsshell:dead', 'cnnon:carry', 'slent2:grave', 'mcnist:s2shield', 'mcnist:s3born', 'mcnist:s3reach', 'mcnist:s3hit'];

describe('规程 sounds, third part (2026-11-12)', () => {
  test('the banks: each key has a sound in the official table, and the committed manifest has it', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    for (const k of NEW_KEYS) {
      assert.ok(KIT_HIT_BANKS[k] && out[k]?.length, `${k}: ${KIT_HIT_BANKS[k]}`);
      assert.equal(typeof MANIFEST.audio.sfx.kit[k], 'string', `${k} in data/assets.json`);
    }
  });

  test('the moments (pure)', () => {
    const units = { 1: { def: 'enemy_10147_nsbomb' }, 2: { def: 'enemy_2135_shkrbt' }, 3: { def: 'char_1031_slent2' }, 4: { def: 'char_4230_mcnist' },
      5: { def: 'char_102_texas' }, 6: { def: 'enemy_1007_slime' } };
    const of = (id) => units[id];
    assert.deepEqual(seasonSounds('telegraph', { kind: 'nsbomb', id: 1 }, of), [['nsbomb:drop', null]]);
    assert.deepEqual(seasonSounds('explode', { kind: 'nsbomb', id: 1 }, of), [['nsbomb:reach', null]]);
    assert.deepEqual(seasonSounds('explode', { kind: 'uareap', id: 6 }, of), [], '破城者\'s missile lands through _skillImpact');
    assert.deepEqual(seasonSounds('teleport', { kind: 'shkrbt', id: 2 }, of), [['shkrbt:blink', null], ['shkrbt:blinkend', null]]);
    assert.deepEqual(seasonSounds('teleport', { id: 5 }, of), []);
    assert.deepEqual(seasonSounds('undying', { id: 5, src: 3 }, of), [['slent2:grave', null]]);
    assert.deepEqual(seasonSounds('undying', { id: 5, src: 5 }, of), [], 'another\'s 不死');
    assert.deepEqual(seasonSounds('shieldBreak', { id: 5, src: 4, on: 1 }, of), [['mcnist:s2shield', null]]);
    assert.deepEqual(seasonSounds('shieldBreak', { id: 5, src: 4, on: 0 }, of), [], 'broken after S2: the branch with no PlayAudio');
    assert.deepEqual(seasonSounds('charge', { id: 9, src: 4, dir: 'RIGHT', left: 0 }, of), [['mcnist:s3born', null]]);
    assert.deepEqual(seasonSounds('charge', { id: 9, src: 4, dir: 'UP', left: 0 }, of), [], '_up_right has no banks');
    assert.deepEqual(seasonSounds('charge', { id: 9, src: 4, dir: 'DOWN', left: 1 }, of), [['mcnist:s3born', null]]);
    assert.deepEqual(seasonSounds('aoe', { id: 4, skill: 'mcnist:cross' }, of), [['mcnist:s3hit', 0.8]], 'as the cross lands');
    assert.deepEqual(seasonSounds('cannon', { x: 3, y: 4, carry: 1, pax: 6 }, of), [['cnnon:carry', null]], '염괴포 takes an enemy aboard');
    assert.deepEqual(seasonSounds('cannon', { x: 3, y: 4, carry: 0, pax: 6 }, of), [], 'it lets it down: nothing');
    assert.deepEqual(seasonSounds('cannon', { x: 3, y: 4, fire: 1, tx: 5, ty: 4, t: 1, pax: null }, of), [], 'EnemyCannon00D: no bank');
    assert.deepEqual(seasonSounds('explode', { x: 5, y: 4, kind: 'cnnonShell', hit: [] }, of), [], 'projectile_trap_cnnon_small_death: no bank');
    assert.deepEqual(seasonSounds('aoe', { id: 4, skill: 'mcnist:charge' }, of), [], 'the landing: AudioManager (after its charge)');
    assert.equal(mcnistChargeSounds({ dir: 'LEFT', left: 1 }), true);
    assert.equal(mcnistChargeSounds({ dir: 'RIGHT', left: 0 }), true, 'projectile_chr_mcnist_s3_token_right has banks');
    assert.equal(mcnistChargeSounds({ dir: 'UP', left: 1 }), true);
    assert.equal(mcnistChargeSounds({ dir: 'DOWN', left: 0 }), false, '_down_right has no banks');
  });

  test('a walking ally is an enemy unit for its born / dead sounds (Enemy.PlayAudioSignal: the class, whatever its side)', () => {
    const walker = { side: 'ally', kind: 'token', def: 'enemy_9025_aclts', defId: 'enemy_9025_aclts', walks: true };
    assert.equal(unitSoundClass(walker), 'enemy');
    assert.equal(unitSoundClass({ ...walker, walks: false }), 'token', 'a summon that does not walk (炎佑) stays a summon');
    assert.equal(deploySfxUrl(MANIFEST, walker), null, 'no ON_UNIT_BORN.enemy bank');
    assert.equal(deathSfxUrl(MANIFEST, walker, { reason: 'killed' }), MANIFEST.audio.sfx.battle.enemyDie, 'ON_UNIT_DEAD.enemy');
    assert.equal(file(MANIFEST.audio.sfx.battle.enemyDie), 'b_enemy_dead_n.mp3');
  });

  test('the audio manager: each once, and nothing for what must stay silent', { skip: NO_DATA }, () => {
    const a = manager();
    a.setFieldUnits([
      { id: 1, kind: 'enemy', side: 'enemy', spine: 'enemy_10147_nsbomb' }, { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_2135_shkrbt' },
      { id: 3, kind: 'char', side: 'ally', spine: 'char_1031_slent2' }, { id: 4, kind: 'char', side: 'ally', spine: 'char_4230_mcnist' },
      { id: 5, kind: 'char', side: 'ally', spine: 'char_102_texas' }, { id: 6, kind: 'enemy', side: 'enemy', spine: 'enemy_10003_trwlpl_2' },
      { id: 7, kind: 'enemy', side: 'enemy', spine: 'enemy_10003_trwlpl_2' },
    ]);
    const heard = (ev) => { a.played.length = 0; a.waits.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
    const fx = (kind, o) => fxEvent(kind, { x: 0, y: 0, ...o });
    assert.deepEqual(heard([fx('telegraph', { kind: 'nsbomb', id: 1, r: 1, dur: 0.5, ability: 'Bomb' })]), ['e_atk_brdmbfr.mp3'], 'the bomb dropped');
    assert.deepEqual(heard([fx('explode', { kind: 'nsbomb', id: 1, r: 1, ability: 'Bomb' })]), ['e_imp_brdmbfr.mp3'], 'it lands');
    let p = heard([fx('teleport', { kind: 'shkrbt', id: 2, ability: 'Blink' })]);
    assert.deepEqual([count(p, 'e_atk_rnspflsh.mp3'), count(p, 'e_imp_rnspflsh.mp3'), p.length], [1, 1, 2], 'Blink START and its end');
    assert.deepEqual(heard([fx('undying', { id: 5, src: 3, duration: 3 })]), ['p_imp_slblessbuff.mp3'], '淬羽赫默 S3 不死');
    assert.deepEqual(heard([fxEvent('cannon', { x: 3, y: 4, carry: 1, pax: 6 })]), ['e_atk_longmecha.mp3'], '염괴포 takes an enemy aboard');
    assert.deepEqual(heard([fxEvent('cannon', { x: 3, y: 4, fire: 1, tx: 5, ty: 4, t: 1, pax: 6 }), fxEvent('explode', { x: 5, y: 4, kind: 'cnnonShell', hit: [] })]), [], 'its shot and landing');
    assert.deepEqual(heard([fx('shieldBreak', { id: 5, src: 4, on: 1 })]), ['p_imp_megnrshd.mp3'], 'S2\'s 屏障 broken while S2 runs');
    assert.deepEqual(heard([fx('shieldBreak', { id: 5, src: 4, on: 0 })]), [], 'after S2');
    // 机械师 S3: the charge flies (BORN) and lands (REACH on the landing 'aoe'), unless it flies a projectile with no banks
    assert.deepEqual(heard([fx('charge', { id: 9, src: 4, dir: 'RIGHT', left: 0 })]), ['p_atk_megnrlgrfspt.mp3']);
    assert.deepEqual(heard([fx('aoe', { id: 4, skill: 'mcnist:charge', radius: 1.5 })]), ['p_imp_megnrlgrfspt.mp3']);
    assert.deepEqual(heard([fx('charge', { id: 9, src: 4, dir: 'UP', left: 0 })]), [], 'up, facing right');
    assert.deepEqual(heard([fx('aoe', { id: 4, skill: 'mcnist:charge', radius: 1.5 })]), [], 'its landing is silent too');
    p = heard([fx('aoe', { id: 4, skill: 'mcnist:cross', radius: 2 })]);
    assert.deepEqual(p, ['p_imp_megnrlg_s.mp3'], 'the cross');
    assert.equal(a.waits[0].delay, 0.8, '… as it lands, 0.8 s after the throw');
    // 暴走食人花: back from digesting → eat_complete once; killed while digesting → eat_failed, no eat_complete
    assert.deepEqual(heard([fx('phase', { id: 6, kind: 'eat', form: 'eat' })]), [], 'it starts digesting');
    assert.deepEqual(heard([fx('phase', { id: 6, kind: null, form: null })]), ['e_atk_flwrdgstn.mp3'], 'digested');
    assert.deepEqual(heard([fx('phase', { id: 6, kind: null, form: null })]), [], 'only after a digest');
    heard([fx('phase', { id: 7, kind: 'eat', form: 'eat' })]);
    p = heard([['die', 7, 'killed']]);
    assert.equal(count(p, 'e_atk_flwrthrwp.mp3'), 1, 'killed while digesting: it throws up');
    assert.equal(count(p, 'e_atk_flwrdgstn.mp3'), 0);
    a.setFieldUnits([{ id: 8, kind: 'enemy', side: 'enemy', spine: 'enemy_10003_trwlpl_2' }]);
    assert.equal(count(heard([['die', 8, 'killed']]), 'e_atk_flwrthrwp.mp3'), 0, 'killed while not digesting');
  });

  test('破城者\'s SkyProjectile: START as it is cast, the ON once per missile, the missiles\' own impact — not its normal attack\'s', { skip: NO_DATA }, () => {
    const sk = MANIFEST.audio.sfx.units.enemy_10123_uareap.sk.skyprojectile.map((c) => [c.at, file(c.u)]);
    assert.deepEqual(sk, [['s', 'e_atk_mchmsl.mp3'], ['a', 'e_atk_mchmslfr.mp3'], ['d', 'e_imp_mortar_n.mp3']]);
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'enemy', side: 'enemy', spine: 'enemy_10123_uareap' }, { id: 2, kind: 'char', side: 'ally', spine: 'char_102_texas' },
      { id: 3, kind: 'char', side: 'ally', spine: 'char_102_texas' }]);
    a.handleBattleEvents([fxEvent('enemySkill', { x: 0, y: 0, id: 1, ability: 'SkyProjectile', n: 1 })]);
    assert.deepEqual(a.played, ['e_atk_mchmsl.mp3'], 'the cast: START only');
    a.played.length = 0;
    a.handleBattleEvents([['atk', 1, 2, 'uareapMissile']]);
    a.handleBattleEvents([['atk', 1, 3, 'uareapMissile']]);
    assert.deepEqual(a.played, ['e_atk_mchmslfr.mp3', 'e_atk_mchmslfr.mp3'], 'one ON per missile, none of the normal attack\'s cues');
    a.played.length = 0;
    a.handleBattleEvents([['dmg', 2, 300, 'phys', 0, 1, 0, null]]);
    assert.deepEqual(a.played, ['e_imp_mortar_n.mp3'], 'the missile\'s impact');
  });

  test('a skill ability\'s START after its begin clip; a cast lost in the clip never sounds it', { skip: NO_DATA }, () => {
    const begin = loadSkillBegin(ROOT);
    assert.equal(begin.skchr_surtr_3, 0.6, 'data/ cast.begin, in whole ticks');
    assert.equal(skillBeginLeads([{ index: 2, skillId: 'skchr_surtr_3' }], begin, () => true)?.['2'], 0.6);
    assert.equal(skillBeginLeads([{ index: 2, skillId: 'skchr_surtr_3' }], begin, () => false), null, 'only for a START the manifest sounds');
    assert.equal(skillBeginOf(MANIFEST.audio.sfx.units.char_350_surtr, 2), 0.6);
    assert.equal(skillBeginOf(MANIFEST.audio.sfx.units.char_350_surtr, 0), 0);
    // castCues: 's' waits the clip, 'a' / 'e' come counted from the sim already
    assert.deepEqual(castCuesOf({ castCues: { 0: [{ at: 's', u: 'x' }, { at: 'a', u: 'y' }] } }, 0, [1.2, 2], 0.5).map((c) => c.after), [0.5, 1.2]);
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'char', side: 'ally', spine: 'char_350_surtr', skillIndex: 2 }]);
    a.handleBattleEvents([['skill', 1, 1]]);
    const x = a.waits.find((w) => w.f === 'p_skill_fireboost.mp3');
    assert.ok(x, 'ON_ABILITY_START.skchr_surtr_3');
    assert.equal(x.delay, 0.6, 'after the Skill_3_Begin clip');
    a.handleBattleEvents([['skill', 1, 0]]);
    assert.equal(x.cancelled, true, 'the cast lost in its begin clip: the START never sounds');
    // a skill without a begin clip sounds it at once
    const b = manager();
    b.setFieldUnits([{ id: 1, kind: 'char', side: 'ally', spine: 'char_245_cello', skillIndex: 2 }]);
    b.handleBattleEvents([['skill', 1, 1]]);
    assert.equal(b.waits.find((w) => w.f === 'p_skill_shphrtcltrill.mp3')?.delay, null);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// the sim's side: the events these sounds read come as the audio expects (one tick per batch — the finest a client gets)

const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const WALL = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const pool = (hp) => ({ hp, maxHp: hp, damage(_pid, x) { this.hp = Math.max(0, this.hp - x); } });
function arena(keys, units) {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'boss', sharedBoss: pool(1e7), enemies: [], units, captureNoisy: true,
    defs: { chess: { t_wall: WALL('t_wall') }, enemies: Object.fromEntries(keys.map((k) => [k, ACT3.enemies[k]])) },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) },
  });
}
function playFor(h, a, seconds) {
  const end = h.b.time + seconds;
  while (h.b.time < end) { h.b.step(); a.handleBattleEvents(h.b.drainEvents()); }
}

describe('规程 sounds, third part, through a battle (2026-11-12)', () => {
  test('遮天面包机 flying on: as many bombs dropped as landed', { skip: NO_DATA }, () => {
    const K = 'enemy_10147_nsbomb';
    const h = arena([K], [{ chessId: 't_wall', row: 10, col: 3, uid: 1 }]);
    h.step();
    const a = manager();
    a.handleBattleEvents(h.b.drainEvents());
    const e = h.spawn(K, { pos: [10, 4], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
    a.handleBattleEvents([['spawn', { id: e.id, side: 'enemy', kind: 'enemy', defId: K, spine: K }]]);
    a.played.length = 0;
    playFor(h, a, 8.1);
    assert.equal(count(a.played, 'e_atk_brdmbfr.mp3'), 3, 'one every 2.5 s, the first 2.5 s in');
    assert.equal(count(a.played, 'e_imp_brdmbfr.mp3'), 3, 'each lands');
  });

  test('赘生甲壳: made as a 微核沉积者 falls, destroyed — its own two sounds, no summon\'s', { skip: NO_DATA }, () => {
    const K = 'enemy_1434_dsshel';
    const h = arena([K], [{ chessId: 't_wall', row: 10, col: 3, uid: 1 }]);
    h.step();
    const a = manager();
    a.handleBattleEvents(h.b.drainEvents());
    const e = h.spawn(K, { pos: [10, 6], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
    a.handleBattleEvents([['spawn', { id: e.id, side: 'enemy', kind: 'enemy', defId: K, spine: K }]]);
    h.step();
    a.handleBattleEvents(h.b.drainEvents());
    a.played.length = 0;
    h.b.kill(e, h.unit(1));
    a.handleBattleEvents(h.b.drainEvents());
    const shell = h.b.allyUnits.find((u) => u.defId === 'trap_156_dsshell' && u.alive);
    assert.ok(shell, 'the shell is made on its tile');
    assert.equal(count(a.played, 'e_atk_hrdsllnd.mp3'), 1, 'ON_UNIT_BORN.trap_156_dsshell');
    a.played.length = 0;
    h.b.kill(shell, null);
    a.handleBattleEvents(h.b.drainEvents());
    assert.equal(count(a.played, 'e_imp_hrdsllnd.mp3'), 1, 'ON_UNIT_DEAD.trap_156_dsshell');
    assert.equal(count(a.played, 'b_char_tokendead.mp3'), 0, 'not a summon\'s death');
  });
});
