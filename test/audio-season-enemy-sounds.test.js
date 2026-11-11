// test/audio-season-enemy-sounds.test.js — 规程's enemy sounds of 2026-11-12 (docs/rules/audio.md 「규정 새 적 소리」 and
// 「원소 폭발 소리」): an element burst's sound by element and side; a 萨卡兹子裔's summon sound as it is knocked out; 魂灵法骸 /
// 魂灵残迹 taking a soul; 神勇的帕拉杜利斯 setting off and striking; 假想敌：镜眼's slow; the ability sounds of the enemies the
// sound facts missed (local-char-audio.json: 残党乐团鼓手's aoeAttack, 神勇的帕拉杜利斯's rush). Sound tests count: how many of
// each, and that the ones that must not sound do not.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, elementBurstSounds, knockOutSound, mncturHitSound, enemyBuffSounds, statusSoundKey } from '../public/js/audio.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { getData } from '../server/data.js';
import { makeBattle, chessRec } from './helpers/battleHarness.js';
import * as enemiesMod from '../server/sim/content/enemies.js';
import * as bossesMod from '../server/sim/content/bosses.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const file = (u) => String(u).split('/').pop();
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));

function manager() {
  const a = new AudioManager({ win: null, getManifest: () => MANIFEST, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url) => { a.played.push(file(url)); };
  a.voice = () => false;
  return a;
}
const count = (list, f) => list.filter((x) => x === f).length;

const NEW_KEYS = ['ep:fire', 'ep:fireshow', 'ep:water', 'ep:sanity', 'ep:dark', 'ep:anger', 'bloodsucker:summon', 'dzoms:summon',
  'lrmzrd:capture', 'lrwzrd:capture', 'mnctur:run', 'mnctur:hit', 'acrefm:slow'];

describe('规程 enemy sounds (2026-11-12)', () => {
  test('the banks: each key has a sound in the official table, and the committed manifest has it', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    for (const k of NEW_KEYS) {
      assert.ok(KIT_HIT_BANKS[k] && out[k]?.length, `${k}: ${KIT_HIT_BANKS[k]}`);
      assert.equal(typeof MANIFEST.audio.sfx.kit[k], 'string', `${k} in data/assets.json`);
    }
  });

  test('element bursts (pure): by element; an operator\'s 狂躁 sounds nothing', () => {
    const units = { 1: { side: 'enemy' }, 2: { side: 'ally' } };
    const of = (id) => units[id];
    const keys = (element, id) => elementBurstSounds({ id, element }, of);
    assert.deepEqual(keys('burn', 1), ['ep:fire', 'ep:fireshow'], '灼燃: START and SHOW_EFFECT');
    assert.deepEqual(keys('erosion', 1), ['ep:water']);
    assert.deepEqual(keys('neural', 1), ['ep:sanity']);
    assert.deepEqual(keys('apoptosis', 1), ['ep:dark']);
    assert.deepEqual(keys('rampage', 1), ['ep:anger']);
    assert.deepEqual(keys('burn', 2), ['ep:fire', 'ep:fireshow'], 'an operator\'s burst sounds too');
    assert.deepEqual(keys('rampage', 2), [], 'ep_break_anger_char has no signal');
    assert.deepEqual(keys('necrosis', 1), []);
  });

  test('the other moments (pure)', () => {
    assert.equal(knockOutSound('enemy_1222_dpvt', 'killed'), 'bloodsucker:summon');
    assert.equal(knockOutSound('enemy_1226_dklord_2', 'killed'), 'bloodsucker:summon');
    assert.equal(knockOutSound('enemy_1361_dthrow', 'killed'), 'dzoms:summon');
    assert.equal(knockOutSound('enemy_1362_dfat_2', 'killed'), 'dzoms:summon');
    assert.equal(knockOutSound('enemy_1222_dpvt', 'expired'), null, 'only a knock-out');
    assert.equal(knockOutSound('enemy_1222_dpvt', null), null);
    assert.equal(knockOutSound('enemy_1220_dzoms', 'killed'), null, 'the 重生造物 itself summons nothing');
    const units = { 1: { def: 'enemy_1431_lrmzrd_2' }, 2: { def: 'enemy_1429_lrwzrd' }, 3: { def: 'enemy_10163_mnctur_2' }, 4: { def: 'enemy_1007_slime' } };
    const of = (id) => units[id];
    assert.deepEqual(enemyBuffSounds('capture', { id: 1, from: 9, n: 1 }, of), [['lrmzrd:capture', null]]);
    assert.deepEqual(enemyBuffSounds('capture', { id: 2, from: 9, n: 3 }, of), [['lrwzrd:capture', null]]);
    assert.deepEqual(enemyBuffSounds('capture', { id: 4, from: 9, n: 1 }, of), []);
    assert.deepEqual(enemyBuffSounds('phase', { id: 3, kind: 'Run', form: 'Run' }, of), [['mnctur:run', null]]);
    assert.deepEqual(enemyBuffSounds('phase', { id: 3, kind: null, form: null }, of), [], 'back to Default: nothing');
    assert.deepEqual(enemyBuffSounds('phase', { id: 4, kind: 'Run', form: 'Run' }, of), []);
    const end = { id: 3, ability: 'rushEndNormal', n: 1 };
    assert.equal(mncturHitSound(end, of, [['dmg', 7, 500, 'phys', 0, 3, 0, null], ['fx', 'enemySkill', 0, 0, end]]), 'mnctur:hit');
    assert.equal(mncturHitSound(end, of, [['dmg', 7, 500, 'phys', 0, 5, 0, null], ['fx', 'enemySkill', 0, 0, end]]), null, 'another\'s damage');
    assert.equal(mncturHitSound(end, of, [['fx', 'enemySkill', 0, 0, end]]), null, 'reached the spot, nobody met');
    assert.equal(mncturHitSound({ id: 3, ability: 'rush', n: 1 }, of, [['dmg', 7, 500, 'phys', 0, 3, 0, null]]), null);
    assert.equal(statusSoundKey('ab:acrefmSlow'), 'acrefm:slow');
  });

  test('the audio manager: each once, and nothing for what must stay silent', { skip: NO_DATA }, () => {
    const a = manager();
    a.setFieldUnits([
      { id: 1, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' }, { id: 2, kind: 'char', side: 'ally', spine: 'char_102_texas' },
      { id: 3, kind: 'enemy', side: 'enemy', spine: 'enemy_1222_dpvt' }, { id: 4, kind: 'enemy', side: 'enemy', spine: 'enemy_1361_dthrow_2' },
      { id: 5, kind: 'enemy', side: 'enemy', spine: 'enemy_1431_lrmzrd' }, { id: 6, kind: 'enemy', side: 'enemy', spine: 'enemy_10163_mnctur_2' },
      { id: 8, kind: 'enemy', side: 'enemy', spine: 'enemy_1220_dzoms' },
    ]);
    const heard = (ev) => { a.played.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
    const burst = (id, element) => ['fx', 'burst', 0, 0, { x: 0, y: 0, id, element }];
    let p = heard([burst(1, 'burn')]);
    assert.deepEqual([count(p, 'b_char_fireharm.mp3'), count(p, 'e_imp_dmfttrb_d.mp3'), p.length], [1, 1, 2]);
    assert.deepEqual(heard([burst(1, 'rampage')]), ['b_char_angerharm.mp3']);
    assert.deepEqual(heard([burst(2, 'apoptosis')]), ['b_char_darkharm.mp3']);
    assert.deepEqual(heard([burst(2, 'rampage')]), [], 'an operator\'s 狂躁');
    p = heard([['die', 3, 'killed']]);
    assert.equal(count(p, 'e_skill_reborn.mp3'), 1, '子裔战士 knocked out');
    p = heard([['die', 4, 'killed']]);
    assert.equal(count(p, 'e_skill_reborn.mp3'), 1, '子裔毁击者 knocked out');
    a.setFieldUnits([{ id: 9, kind: 'enemy', side: 'enemy', spine: 'enemy_1222_dpvt' }]);
    assert.equal(count(heard([['die', 9, 'expired']]), 'e_skill_reborn.mp3'), 0, 'gone without a knock-out');
    a.setFieldUnits([{ id: 5, kind: 'enemy', side: 'enemy', spine: 'enemy_1431_lrmzrd' }, { id: 6, kind: 'enemy', side: 'enemy', spine: 'enemy_10163_mnctur_2' },
      { id: 8, kind: 'enemy', side: 'enemy', spine: 'enemy_1220_dzoms' }, { id: 7, kind: 'char', side: 'ally', spine: 'char_102_texas' }]);
    p = heard([['fx', 'capture', 0, 0, { x: 0, y: 0, id: 5, from: 8, n: 1 }]]);
    assert.equal(count(p, 'e_atk_rhtakeoff.mp3'), 1, 'a soul taken');
    p = heard([['fx', 'phase', 0, 0, { x: 0, y: 0, id: 6, kind: 'Run', form: 'Run' }]]);
    assert.deepEqual(p, ['e_atk_lghtnhrsrn.mp3'], 'it sets off');
    const end = ['fx', 'enemySkill', 0, 0, { x: 0, y: 0, id: 6, ability: 'rushEndNormal', n: 1 }];
    p = heard([['dmg', 7, 600, 'phys', 0, 6, 0, null], end]);
    assert.equal(count(p, 'e_imp_berxplvbrl.mp3'), 1, 'its collision');
    p = heard([end]);
    assert.equal(count(p, 'e_imp_berxplvbrl.mp3'), 0, 'reached the spot, nobody met');
    p = heard([['status', 7, 'ab:acrefmSlow', 1, 5]]);
    assert.deepEqual(p, ['e_imp_slwdnbf.mp3'], '镜眼\'s slow on its arts attacker');
  });

  test('the ability sounds the sound facts missed: 鼓手\'s aoeAttack, 帕拉杜利斯\'s rush (local-char-audio.json → manifest sk)', { skip: NO_DATA }, () => {
    const u = MANIFEST.audio.sfx.units;
    assert.ok(u.enemy_1376_ltndru.sk?.aoeattack?.some((c) => file(c.u) === 'e_atk_drmsndwv.mp3'), '鼓手 aoeAttack ON');
    assert.ok(u.enemy_10163_mnctur_2.sk?.rush?.some((c) => file(c.u) === 'e_atk_lghtnhrshk.mp3'), 'rush START');
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'enemy', side: 'enemy', spine: 'enemy_1376_ltndru' }]);
    a.handleBattleEvents([['fx', 'enemySkill', 0, 0, { x: 0, y: 0, id: 1, ability: 'aoeAttack', n: 1 }]]);
    assert.deepEqual(a.played, ['e_atk_drmsndwv.mp3'], 'once, nothing else');
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
/** Step `h` until `pred`, handing each tick's events to the audio manager `a` as one batch. */
function playUntil(h, a, pred, seconds) {
  const end = h.b.time + seconds;
  while (!pred() && h.b.time < end) { h.b.step(); a.handleBattleEvents(h.b.drainEvents()); }
}

describe('规程 enemy sounds through a battle (2026-11-12)', () => {
  test('神勇的帕拉杜利斯 charging an operator: rush START, the setting off and the collision once each', { skip: NO_DATA }, () => {
    const K = 'enemy_10163_mnctur_2';
    const h = arena([K], [{ chessId: 't_wall', row: 10, col: 3, uid: 1 }]);
    h.step();
    const a = manager();
    a.handleBattleEvents(h.b.drainEvents());
    const e = h.spawn(K, { pos: [10, 9], routeIndex: 0, mods: { speedMul: 1 }, tag: null });
    a.handleBattleEvents([['spawn', { id: e.id, side: 'enemy', kind: 'enemy', defId: K, spine: K }]]);
    a.played.length = 0;
    let ended = false;
    const fx = h.b.fx.bind(h.b);
    h.b.fx = (kind, p) => { if (kind === 'enemySkill' && p?.id === e.id && p.ability === 'rushEndNormal') ended = true; return fx(kind, p); };
    playUntil(h, a, () => ended, 30);
    assert.ok(ended, 'the charge ended');
    assert.ok(h.unit(1).stats.taken > 0, 'it struck the operator');
    assert.equal(count(a.played, 'e_atk_lghtnhrshk.mp3'), 1, 'rush START');
    assert.equal(count(a.played, 'e_atk_lghtnhrsrn.mp3'), 1, 'setting off (Run)');
    assert.equal(count(a.played, 'e_imp_berxplvbrl.mp3'), 1, 'the collision: its damage and rushEndNormal in one tick');
  });

  test('a 萨卡兹子裔战士 knocked out: its summon sound once, as it falls', { skip: NO_DATA }, () => {
    const K = 'enemy_1222_dpvt';
    const h = arena([K, ACT3.enemies[K] && 'enemy_1220_dzoms'].filter(Boolean), [{ chessId: 't_wall', row: 10, col: 3, uid: 1 }]);
    h.step();
    const a = manager();
    a.handleBattleEvents(h.b.drainEvents());
    const e = h.spawn(K, { pos: [10, 9], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
    a.handleBattleEvents([['spawn', { id: e.id, side: 'enemy', kind: 'enemy', defId: K, spine: K }]]);
    a.played.length = 0;
    h.b.kill(e, h.unit(1));
    const batch = h.b.drainEvents();
    assert.ok(batch.some((x) => x[0] === 'die' && x[1] === e.id && x[2] === 'killed'), 'the sim says killed');
    a.handleBattleEvents(batch);
    assert.equal(count(a.played, 'e_skill_reborn.mp3'), 1);
  });
});
