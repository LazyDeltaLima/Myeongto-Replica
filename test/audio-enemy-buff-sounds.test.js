// test/audio-enemy-buff-sounds.test.js — enemy buff / custom-trigger sounds of 2026-11-03 (docs/rules/audio.md 「적 버프·커스텀
// 트리거 소리」, EN client enemy prefabs and buff templates): a prisoner's 【解放】 (and freed by another), 阿利斯泰尔's piece
// picked up and vest taken, 绯红歌伶's war song, a hand of 假想敌：胄 shot down, “余音”'s ensembles · pulse · hit switch, 昆图斯's
// and “萨米的意志”'s dooms; 假想敌：骨刺's Horror / Cute modes, 元核孽生者 waking, 灼藤's burst, “萨科塔之眼”'s theft and “帝国的甲胄”'s
// barrage range. The committed data/assets.json may predate these keys: the manifest here is it plus the keys built
// from the official audio_data.json (tools/assets/kit-sfx.mjs kitHitSfx).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, enemyBuffSounds, enemyStatusOffSound } from '../public/js/audio.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { makeBattle } from './helpers/battleHarness.js';
import { fxEvent } from './helpers/fxEvent.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const file = (u) => String(u).split('/').pop();

let built = null;
function manifest() {
  if (built) return built;
  const m = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
  const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
  Object.assign(m.audio.sfx.kit, kitHitSfx(audio, (p) => `/assets/audio/sfx/${file(p[0])}`));
  return (built = m);
}
function manager() {
  const a = new AudioManager({ win: null, getManifest: manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url, o) => { a.played.push(o?.delay ? `${file(url)}@${o.delay}` : file(url)); };
  a.voice = () => false;
  return a;
}

describe('enemy buff / custom-trigger sounds (2026-11-03)', () => {
  test('the banks', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    const want = [
      'liberty:state', 'liberty:force', 'vtmstr:equip', 'vtlionk:shld', 'csdcr:skill', 'acstma:stun', 'acstmb:stun',
      'acdums:passion', 'acdums:passion2', 'acdums:depassion', 'acdums:depassion2', 'acdums:aoe', 'acdums:switcha',
      'acdums:switchb', 'dslily:doom', 'smdeer:doom', 'wlfmster:reborn', 'mcmstr:reborn', 'dugago:reborn', 'duskls:revive',
      'duskld:revive', 'acpupp:revive', 'balloon:land', 'achunt:charge', 'achunt:chain', 'actrp:dash', 'actrpa:shieldhit',
      'dsubrl:hit', 'cjhot:hit', 'ymgtop:hit', 'mntrjn:add', 'duckmi:run', 'lrrook:share', 'smgrd:up', 'smgrd:hit', 'smgrd:fog',
      'parrot:fly',
    ];
    for (const k of want) {
      assert.ok(KIT_HIT_BANKS[k], k);
      assert.ok(out[k]?.length, `${k}: a sound in ${KIT_HIT_BANKS[k]}`);
    }
  });

  test('the events (pure)', () => {
    const units = { 1: { def: 'enemy_9014_acstma' }, 2: { def: 'enemy_9015_acstmb' }, 3: { def: 'enemy_9023_acdums' }, 4: { def: 'enemy_9032_aclionk' }, 5: { def: 'enemy_1007_slime' } };
    const of = (id) => units[id];
    const keys = (fx, ex) => enemyBuffSounds(fx, ex, of);
    assert.deepEqual(keys('liberate', { id: 5, form: 'liberty' }), [['liberty:state', null]]);
    assert.deepEqual(keys('liberate', { id: 5, form: 'liberty', forced: 1 }), [['liberty:force', null], ['liberty:state', null]]);
    assert.deepEqual(keys('equip', { id: 9, kind: 'pickup' }), [['vtmstr:equip', null]]);
    assert.deepEqual(keys('equip', { id: 9 }), [], 'a piece dropped on the field');
    assert.deepEqual(keys('vest', { id: 4, side: 1 }), [['vtlionk:shld', null]]);
    assert.deepEqual(keys('telegraph', { id: 5, kind: 'songOfWar' }), [['csdcr:skill', null]]);
    assert.deepEqual(keys('telegraph', { id: 5, kind: 'speciesBurst' }), [['dslily:doom', 1], ['dslily:doom', 2], ['dslily:doom', 3]]);
    assert.deepEqual(keys('telegraph', { id: 5, kind: 'samiDoom' }), [['smdeer:doom', 1.8]]);
    assert.deepEqual(keys('phase', { id: 1, kind: 'shotDown' }), [['acstma:stun', null]]);
    assert.deepEqual(keys('phase', { id: 2, kind: 'shotDown' }), [['acstmb:stun', null]]);
    assert.deepEqual(keys('phase', { id: 3, kind: 'echo_gold', hit: 1 }), [['acdums:switcha', null]]);
    assert.deepEqual(keys('phase', { id: 3, kind: 'echo_dark', hit: 1 }), [['acdums:switchb', null]]);
    assert.deepEqual(keys('phase', { id: 3, kind: 'echo_dark' }), [], 'the form it starts in, or one a 管 / 弦 gives');
    assert.deepEqual(keys('explode', { kind: 'echoPulse' }), [['acdums:aoe', null]]);
    assert.deepEqual(keys('enemySkill', { id: 3, ability: 'PassionSkill' }), [['acdums:passion', null], ['acdums:passion2', null]]);
    assert.deepEqual(keys('enemySkill', { id: 3, ability: 'DepassionSkill' }), [['acdums:depassion', null], ['acdums:depassion2', null]]);
    assert.deepEqual(keys('enemySkill', { id: 5, ability: 'PassionSkill' }), []);
    // the 重生 ones
    const of2 = (id) => ({ 1: { def: 'enemy_1535_wlfmster' }, 2: { def: 'enemy_1512_mcmstr' }, 3: { def: 'enemy_1172_dugago_2' }, 4: { def: 'enemy_1288_duskls' }, 5: { def: 'enemy_9010_acpupp' }, 6: { def: 'enemy_1007_slime' } })[id];
    const k2 = (fx, ex) => enemyBuffSounds(fx, ex, of2).map(([k]) => k);
    assert.deepEqual(k2('telegraph', { id: 1, kind: 'reborn', form: 'reborn' }), ['wlfmster:reborn'], 'its knock-out');
    assert.deepEqual(k2('revive', { id: 1, kind: 'reborn', form: 'form2' }), [], 'not at its end');
    assert.deepEqual(k2('revive', { id: 2, kind: 'reborn', form: 'form2' }), ['mcmstr:reborn']);
    assert.deepEqual(k2('revive', { id: 3, kind: 'fly', form: 'fly' }), ['dugago:reborn']);
    assert.deepEqual(k2('revive', { id: 4, form: 'revived' }), ['duskls:revive']);
    assert.deepEqual(k2('revive', { id: 5, form: 'revived' }), ['acpupp:revive']);
    assert.deepEqual(k2('revive', { id: 6, kind: 'reborn' }), []);
    assert.equal(enemyStatusOffSound('ab:takeoff', 'enemy_2004_balloon'), 'balloon:land');
    assert.equal(enemyStatusOffSound('ab:takeoff', 'enemy_1007_slime'), null);
    // the counts the sim puts on its own fx (once per unit)
    const of3 = (id) => ({ 1: { def: 'enemy_1234_dsubrl_2' }, 2: { def: 'enemy_10045_parrot' }, 3: { def: 'enemy_1007_slime' } })[id];
    assert.deepEqual(enemyBuffSounds('pulse', { id: 1, n: 3 }, of3), [['dsubrl:hit', null, 3]]);
    assert.deepEqual(enemyBuffSounds('pulse', { id: 3, n: 3 }, of3), []);
    assert.deepEqual(enemyBuffSounds('explode', { kind: 'boil', n: 2 }, of3), [['cjhot:hit', null, 2]]);
    assert.deepEqual(enemyBuffSounds('explode', { kind: 'boil', n: 0 }, of3), [], 'nobody in range');
    assert.deepEqual(enemyBuffSounds('link', { kind: 'faithLink', n: 1 }, of3), [['achunt:chain', null, 1]]);
    assert.deepEqual(enemyBuffSounds('phase', { id: 2, kind: 'float' }, of3), [['parrot:fly', null]]);
  });

  test('a battle: the sim\'s own moments — 鸭爵 runs once, 鼎沸\'s pulse counts its units', () => {
    const h = makeBattle({
      units: [{ chessId: 'chess_char_1_01_a', row: 2, col: 2 }],
      enemies: [{ key: 'enemy_2001_duckmi', pos: [2, 3] }, { key: 'enemy_10054_cjhot', pos: [2, 3] }],
      timeLimit: 999, autoFinish: false, captureNoisy: true,
    });
    h.step(0.5);
    const duck = h.b.enemies.find((e) => e.defId === 'enemy_2001_duckmi');
    for (const e of h.b.enemies) { e.hp = e.s.maxHp = 1e9; e.s.moveSpeed = 0; }
    h.b.dealDamage(null, duck, { amount: 1, type: 'true' });
    h.b.dealDamage(null, duck, { amount: 1, type: 'true' });
    h.run(3);
    const fx = h.eventsOf('fx');
    assert.equal(fx.filter((x) => x[1] === 'kitHit' && x[4]?.k === 'duckmi:run').length, 1, 'its Run mode once');
    const boil = fx.filter((x) => x[1] === 'explode' && x[4]?.kind === 'boil');
    assert.ok(boil.length >= 2 && boil.every((x) => Number.isInteger(x[4].n)), 'each pulse carries its count');
  });

  test('the audio manager plays them', { skip: NO_DATA }, () => {
    const a = manager();
    a.setFieldUnits([{ id: 3, kind: 'enemy', side: 'enemy', spine: 'enemy_9023_acdums' }, { id: 5, kind: 'enemy', side: 'enemy', spine: 'enemy_1121_lifbos' }]);
    const heard = (ev) => { a.played.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
    assert.equal(heard([['fx', 'liberate', 0, 0, { id: 5, form: 'liberty', forced: 1 }]]).length, 2);
    // the [delay] bank's own 0.7 s (audio_data `delay`), the doom's 1 s triggers
    assert.ok(heard([['fx', 'enemySkill', 0, 0, { id: 3, ability: 'PassionSkill', n: 1 }]]).some((f) => f.startsWith('e_imp_slstrmnhg_d_u')));
    assert.deepEqual(heard([['fx', 'telegraph', 0, 0, { id: 5, kind: 'speciesBurst', r: 99 }]]).map((f) => f.replace(/^.*@/, '')), ['1', '2', '3']);
    a.setFieldUnits([{ id: 8, kind: 'enemy', side: 'enemy', spine: 'enemy_2004_balloon' }]);
    assert.equal(heard([['status', 8, 'ab:takeoff', 1]]).length, 0);
    assert.equal(heard([['status', 8, 'ab:takeoff', 0]]).length, 1, 'its landing');
  });

  test('a battle: 重犯 freed frees the other prisoners — `forced` on theirs only', () => {
    const h = makeBattle({
      units: [{ chessId: 'chess_char_1_01_a', row: 2, col: 2 }],
      enemies: [{ key: 'enemy_1121_lifbos', pos: [2, 3] }, { key: 'enemy_1116_liprr', pos: [2, 8] }, { key: 'enemy_1116_liprr', pos: [2, 9] }],
      timeLimit: 999, autoFinish: false, captureNoisy: true,
    });
    h.step(0.5);
    const boss = h.b.enemies.find((e) => e.defId === 'enemy_1121_lifbos');
    assert.ok(boss && h.b.enemies.length === 3, 'all three on the field');
    // its 4th attack frees it (archetypes.js prisoner `before`): the kit's own liberate, as that attack calls it
    const x = boss.mem.ab.list.find((k) => k.liberate);
    x.liberate(h.b, boss, x);
    h.step(0.1);
    const lib = h.eventsOf('fx').filter((x) => x[1] === 'liberate');
    assert.equal(lib.length, 3, 'the 重犯 and both others');
    assert.ok(lib.find((x) => x[4].id === boss.id && !x[4].forced), 'its own liberation is not forced');
    assert.equal(lib.filter((x) => x[4].forced).length, 2);
  });
});

describe('enemy buff / custom-trigger sounds: 骨刺 · 元核孽生者 · 灼藤 · 萨科塔之眼 · 帝国的甲胄 (2026-11-03)', () => {
  test('the banks', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    const want = { 'acbunn:horror': 'e_imp_trnkrtbsch', 'acbunn:cute': 'e_atk_trnkrtbsch', 'dslntf:awake': 'e_atk_monster_n',
      'ftsjc:aoe': 'e_atk_trftsdbrn', 'hlegle:steal': 'e_imp_hlegleb', 'vtsk:range': 'e_skill_stmblock_u' };
    for (const [k, f] of Object.entries(want)) assert.equal(file(out[k]?.[0]).replace(/\.\w+$/, ''), f, k);
    for (const k of ['acstma:back', 'acstmb:back']) assert.ok(out[k]?.length, `${k}: a sound in ${KIT_HIT_BANKS[k]}`);
  });

  test('the events (pure)', () => {
    const units = { 1: { def: 'enemy_10027_vtsk' }, 2: { def: 'enemy_10084_hlegle' }, 3: { def: 'enemy_10084_hlegle_2' }, 4: { def: 'enemy_1007_slime' } };
    const keys = (fx, ex) => enemyBuffSounds(fx, ex, (id) => units[id]);
    assert.deepEqual(keys('telegraph', { id: 1, kind: 'barrage' }), [['vtsk:range', 0.8]], 'the range 0.8 s after the zone');
    assert.deepEqual(keys('telegraph', { id: 4, kind: 'barrage' }), []);
    assert.deepEqual(keys('explode', { kind: 'flameVine' }), [['ftsjc:aoe', null]]);
    assert.deepEqual(keys('steal', { id: 9, from: 2 }), [['hlegle:steal', null]]);
    assert.deepEqual(keys('steal', { id: 9, from: 3 }), [['hlegle:steal', null]]);
    assert.deepEqual(keys('steal', { id: 9, src: 5 }), [], 'another steal (an operator kit\'s)');
  });

  test('a battle: 骨刺 sounds Horror as it spawns, Cute ≤ 0.3 s after its 隐匿 drops, Horror again; 元核孽生者 wakes once', () => {
    const h = makeBattle({
      units: [{ chessId: 'chess_char_1_01_a', row: 2, col: 2 }],
      enemies: [{ key: 'enemy_9008_acbunn', pos: [6, 6] }, { key: 'enemy_1439_dslntf', pos: [6, 7] }],
      timeLimit: 999, autoFinish: false, captureNoisy: true,
    });
    h.step(0.1);
    const bun = h.b.enemies.find((e) => e.defId === 'enemy_9008_acbunn');
    const nuc = h.b.enemies.find((e) => e.defId === 'enemy_1439_dslntf');
    for (const e of h.b.enemies) { e.hp = e.s.maxHp = 1e9; e.s.moveSpeed = 0; }
    const modes = () => h.eventsOf('fx').filter((x) => x[1] === 'kitHit' && x[4]?.id === bun.id).map((x) => x[4].k);
    assert.deepEqual(modes(), ['acbunn:horror'], 'its Horror mode at the spawn');
    h.run(1);
    assert.deepEqual(modes(), ['acbunn:horror'], 'no switch while its 隐匿 holds');
    h.b.addBuff(bun, { key: 'test:reveal', flags: { reveal: true }, persist: true });
    const t0 = h.b.time;
    assert.ok(h.runUntil(() => modes().length === 2, 1), 'Cute');
    assert.ok(h.b.time - t0 <= 0.3 + 1e-6, `at the next 0.3 s check (${h.b.time - t0})`);
    assert.equal(modes()[1], 'acbunn:cute');
    h.b.removeBuff(bun, 'test:reveal');
    assert.ok(h.runUntil(() => modes().length === 3, 1), 'Horror again');
    assert.equal(modes()[2], 'acbunn:horror');
    h.b.dealDamage(null, nuc, { amount: 1, type: 'true' });
    h.b.dealDamage(null, nuc, { amount: 1, type: 'true' });
    h.step(0.1);
    assert.equal(h.eventsOf('fx').filter((x) => x[1] === 'kitHit' && x[4]?.k === 'dslntf:awake' && x[4].id === nuc.id).length, 1, 'awake once');
  });

  test('the audio manager plays them', { skip: NO_DATA }, () => {
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'enemy', side: 'enemy', spine: 'enemy_10027_vtsk' }, { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_10084_hlegle' }]);
    const heard = (ev) => { a.played.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
    assert.ok(heard([['fx', 'telegraph', 0, 0, { id: 1, kind: 'barrage', r: 1 }]]).some((f) => f.startsWith('e_skill_stmblock_u') && f.includes('@')), 'later');
    assert.ok(heard([['fx', 'steal', 0, 0, { id: 9, from: 2 }]]).some((f) => f.startsWith('e_imp_hlegleb')));
    assert.ok(heard([['fx', 'explode', 0, 0, { kind: 'flameVine', r: 1.5 }]]).some((f) => f.startsWith('e_atk_trftsdbrn')));
    assert.ok(heard([['fx', 'kitHit', 0, 0, { id: 1, k: 'acbunn:cute' }]]).some((f) => f.startsWith('e_atk_trnkrtbsch')));
  });
});

describe('规程 隐秘核心 sounds (2026-11-11, CN prefabs)', () => {
  const STORM = 'a_bat_lthndrstm.mp3', RAIN_END = 'e_atk_bvspdrspt_h_u.mp3';
  /** A manager whose _play returns a cancel and records what is due (`delay`) and what was cancelled before it played. */
  function mgr() {
    const a = manager();
    a.due = [];
    a._play = (url, o) => {
      const rec = { f: file(url), delay: o?.delay ?? 0, cancelled: false };
      a.due.push(rec);
      return () => { rec.cancelled = true; };
    };
    return a;
  }
  const live = (a, f) => a.due.filter((r) => r.f === f && !r.cancelled).map((r) => r.delay);
  const rain = (field, id, dur = 10) => fxEvent('zone', { x: 0, y: 0, r: 0, dur, kind: 'acspiderRain', field, id, ability: 'AcidRain' });

  test('the banks', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    assert.equal(KIT_HIT_BANKS['aceel:thunder'], 'battle.ON_BUFF_START.Aceel_ThurderEnv');
    assert.equal(KIT_HIT_BANKS['acspider:rainend'], 'battle.ON_CUSTOM_TRIGGER.acid_rain');
    assert.ok(out['aceel:thunder']?.[0]?.endsWith('a_bat_lthndrstm.mp3'), 'the storm ambience');
    assert.ok(out['acspider:rainend']?.[0]?.endsWith('e_atk_bvspdrspt_h_u.mp3'), 'the rain end');
  });

  test('假想敌：鳍 (隐秘核心)\'s storm sounds once as it comes; the plain 鳍 has none', { skip: NO_DATA }, () => {
    const a = mgr();
    a.handleBattleEvents([['spawn', { id: 1, side: 'enemy', kind: 'enemy', defId: 'enemy_9037_aceel' }]]);
    assert.deepEqual(live(a, STORM), []);
    a.handleBattleEvents([['spawn', { id: 2, side: 'enemy', kind: 'enemy', defId: 'enemy_9037_aceel_2' }]]);
    assert.deepEqual(live(a, STORM), [0]);
  });

  test('假想敌：茧 (隐秘核心)\'s rain ends with its end sound: when due, at once when the 茧 dies or a new rain replaces it', { skip: NO_DATA }, () => {
    const a = mgr();
    a.handleBattleEvents([rain('p1', 7, 10)]);
    assert.deepEqual(live(a, RAIN_END), [10], 'due as the rain ends');
    // another field's rain is its own
    a.handleBattleEvents([rain('p2', 7, 10)]);
    assert.deepEqual(live(a, RAIN_END), [10, 10]);
    // a new rain on p1 ends the old one there now
    a.ctx.currentTime = 3;
    a.handleBattleEvents([rain('p1', 7, 10)]);
    assert.deepEqual(live(a, RAIN_END).sort((x, y) => x - y), [0, 10, 10], 'the old p1 rain: now instead of when due; the new one due');
    // the 茧 dies: every rain of it not ended yet ends now
    a.ctx.currentTime = 5;
    a.handleBattleEvents([['die', 7]]);
    assert.deepEqual(live(a, RAIN_END), [0, 0, 0], 'both fields\' rains end with it, nothing left due');
    // a rain already over: no second end sound when its 茧 dies later
    const b = mgr();
    b.handleBattleEvents([rain('p1', 8, 4)]);
    b.ctx.currentTime = 6;
    b.handleBattleEvents([['die', 8]]);
    assert.deepEqual(live(b, RAIN_END), [4], 'it sounded when due');
  });

  test('谢拉格\'s giant (a walking ally from an enemy record) sounds as its enemy: its mode, form switch, 【神迹之声】 and PowerAttack', { skip: NO_DATA }, () => {
    const a = manager();
    const G = 'enemy_9024_acsgnt';
    assert.ok(a.getManifest().audio.sfx.units[G]?.sk?.attract, 'the manifest has its abilities (local-char-audio.json from the CN prefab)');
    const heard = (ev) => { a.played.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
    heard([['spawn', { id: 9, side: 'ally', kind: 'token', defId: G, spine: G, walks: true }], ['spawn', { id: 10, side: 'ally', kind: 'token', defId: G, spine: G }]]);
    assert.equal(a.enemyMode(9, G, 1, 0), true, 'the renderer\'s mode change takes (its SnowyMountain attack set)');
    assert.equal(a.units.get(9).emode, 1);
    assert.equal(a.enemyMode(10, G, 1, 0), false, 'a summon of the record without `walks`: no enemy mode');
    assert.deepEqual(heard([fxEvent('phase', { x: 0, y: 0, id: 9, kind: 'SnowyMountain', form: 'SnowyMountain' })]), ['e_atk_stchnwtn.mp3'], 'Switch2Snowy');
    assert.deepEqual(heard([fxEvent('phase', { x: 0, y: 0, id: 9, kind: 'Giant', form: 'Giant' })]), ['e_atk_stchnwgt.mp3'], 'Switch2Giant');
    assert.deepEqual(heard([['skill', 9, true, 'Skills/Attract']]).filter((f) => f.startsWith('e_')), ['e_atk_snwtntrct.mp3'], 'Attract\'s START');
    heard([['skill', 9, false]]);
    assert.ok(heard([fxEvent('enemySkill', { x: 0, y: 0, id: 9, ability: 'PowerAttack', n: 1 })]).includes('e_atk_snwtnpch.mp3'), 'PowerAttack\'s START');
  });
});
