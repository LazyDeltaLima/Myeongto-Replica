// test/audio-makoto-sounds.test.js — 结城理 (char_4217_makoto, a 自选 傀儡师)'s sounds (docs/rules/audio.md 「유키 마코토 페르소나
// 소리」, docs/rules/diy.md 「유키 마코토」): the persona attacks of the mode his <替身> form holds (sfx.units[id].hm), the switches'
// guns and ranges, the 总攻击, S1 / S3 俄耳甫斯's heal landings, S2's execute and S3 塔纳托斯's 弱点 hits by type. Sound tests
// count: how many of each, at which delay, and that the <本体>'s attack sounds stay out of the persona's attacks.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, makotoSounds } from '../public/js/audio.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { heldModeSets, loadCharAudio, loadCharModes } from '../tools/assets/skill-mode-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { FORM_HELD_MODES } from '../shared/skill-modes.js';
import { FORM_HELD_MODES as RENDER_HELD } from '../public/js/render/fxmap.js';
import { makeBattle, enemyRec, checkInvariants } from './helpers/battleHarness.js';
import { DOLL_SWITCH } from '../server/sim/professions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
const C = 'char_4217_makoto';
const file = (u) => String(u).split('/').pop();

/** An audio manager that records what it plays (file, bank, delay in game seconds) and whether a wait was cancelled. */
function manager() {
  const a = new AudioManager({ win: null, getManifest: () => MANIFEST, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url, o = {}) => {
    const rec = { f: file(url), bank: o.bank ?? null, delay: o.delay ?? null, cancelled: false };
    a.played.push(rec);
    return () => { rec.cancelled = true; };
  };
  a.voice = () => false;
  return a;
}
const live = (a) => a.played.filter((r) => !r.cancelled);
const files = (a, f) => live(a).filter((r) => r.f === f);
const keyed = (a, k) => live(a).filter((r) => r.bank === `kit:${k}`);

const KEYS = ['makoto:s1gun', 'makoto:s2gun', 'makoto:s3gun', 'makoto:s3orpheus', 'makoto:s2range', 'makoto:s3range1', 'makoto:s3range2',
  'makoto:allout', 'makoto:alloutFlash', 'makoto:alloutHit', 'makoto:s1heal', 'makoto:execute', 'makoto:s3phys', 'makoto:s3arts', 'makoto:s3heal'];
/** The <本体>'s Default attack (START) and impact (HIT): never a persona's. */
const BODY = ['p_atk_pskptldr_n.mp3', 'p_imp_pskptldr_n.mp3'];

describe('结城理 sounds: manifest and moments', () => {
  test('the banks: each key has a sound in the official table, and the committed manifest has it', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    for (const k of KEYS) {
      assert.ok(KIT_HIT_BANKS[k] && out[k]?.length, `${k}: ${KIT_HIT_BANKS[k]}`);
      assert.equal(typeof MANIFEST.audio.sfx.kit[k], 'string', `${k} in data/assets.json`);
    }
  });

  test('the held modes: the render and the sounds read one table; the manifest holds each persona\'s attack signals', { skip: NO_DATA }, () => {
    assert.ok(RENDER_HELD === FORM_HELD_MODES, 'fxmap.js re-exports the shared table');
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    const hm = heldModeSets(audio, C, loadCharAudio()[C], loadCharModes()[C]?.modes, (p) => p.map((x) => file(x)).join('|'));
    const at = (set) => set.cues.map((c) => `${c.at}${c.k ?? ''}:${c.u}`);
    assert.deepEqual(Object.keys(hm), ['0', '1', '2']);
    assert.deepEqual(at(hm[0].doll), ['s1:p_atk_pskptldrh_d.mp3', 'a2:p_atk_pskptldrfr_d.mp3', 'd2:p_imp_pskptldr_d.mp3'], 'S1: heal START / MagicAttack ON + its shot\'s HIT');
    assert.deepEqual(hm[0].doll.sel.attack, { n: 2, how: 'cond', ranged: 2, sig: { HealAlly_Lt50Per: 1 } });
    assert.deepEqual(at(hm[1].doll), ['s:p_atk_pskptldr_h.mp3', 'd:p_imp_pskptldr_h.mp3'], 'S2: attack.2 START / HIT');
    assert.deepEqual(at(hm[2].doll), ['a:p_atk_pskptldr_s1.mp3|p_atk_pskptldr_s2.mp3|p_atk_pskptldr_s3.mp3'], 'S3 塔纳托斯: attack.3 ON');
    assert.deepEqual(hm[2].orpheus.cues, [], 'Stand_S3_2 has no attack');
    assert.equal(heldModeSets(audio, 'char_4182_oblvns', loadCharAudio().char_4182_oblvns, loadCharModes().char_4182_oblvns?.modes, (p) => p), null,
      '丰川祥子\'s held S2 is no 傀儡师 form');
    const m = MANIFEST.audio.sfx.units[C].hm;
    assert.equal(m[1].doll.cues.length, 2);
    assert.deepEqual(m[2].orpheus, { cues: [] });
  });

  test('the switch moments (pure)', () => {
    const su = (skillIndex) => ({ def: C, skillIndex });
    assert.deepEqual(makotoSounds('substitute', { id: 1, form: 'doll' }, su(0)), [['makoto:s1gun', 1]], 'S1 俄耳甫斯: its gun, no range sound');
    assert.deepEqual(makotoSounds('substitute', { id: 1, form: 'doll' }, su(1)), [['makoto:s2gun', 1], ['makoto:s2range', 1.99]]);
    assert.deepEqual(makotoSounds('substitute', { id: 1, form: 'doll' }, su(2)), [['makoto:s3gun', 1], ['makoto:s3range1', 1.99]]);
    assert.deepEqual(makotoSounds('persona', { id: 1, form: 'orpheus' }, su(2)), [['makoto:s3orpheus', 0.5], ['makoto:s3range2', 1.49]]);
    assert.deepEqual(makotoSounds('swap', { id: 1, form: null }, su(1)), [['makoto:allout', null], ['makoto:alloutFlash', null], ['makoto:alloutHit', 0.45]]);
    assert.deepEqual(makotoSounds('dollEnd', { id: 1, form: null }, su(1)), [], 'knocked out as the <替身>: no 总攻击');
    assert.deepEqual(makotoSounds('kitHit', { id: 1, tgt: 2, k: 'makoto:heal' }, su(2)), [['makoto:s3heal', 0.5]]);
    assert.deepEqual(makotoSounds('substitute', { id: 1, form: 'doll' }, { def: 'char_1023_ghost2', skillIndex: 1 }), [], 'another 傀儡师');
  });

  test('the audio manager: the form picks the persona\'s attack signals, the <本体> its own; a knock-out cancels what is still due', { skip: NO_DATA }, () => {
    const a = manager();
    a.handleBattleEvents([['spawn', { id: 1, side: 'ally', kind: 'char', defId: C, spine: C, skillIndex: 1 }], ['spawn', { id: 9, side: 'enemy', kind: 'enemy', defId: 'x', spine: 'x' }]]);
    a.handleBattleEvents([['atk', 1, 9, 'none'], ['dmg', 9, 100, 'phys', 0, 1]]);
    assert.deepEqual(a.played.map((r) => r.f), BODY, 'the <本体>');
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'substitute', 0, 0, { id: 1, form: 'doll', dur: 22 }]]);
    assert.deepEqual(live(a).map((r) => [r.bank, r.delay]), [['kit:makoto:s2gun', 1], ['kit:makoto:s2range', 1.99]]);
    a.played.length = 0;
    a.handleBattleEvents([['atk', 1, 9, 'none'], ['dmg', 9, 100, 'arts', 0, 1]]);
    assert.deepEqual(a.played.map((r) => r.f), ['p_atk_pskptldr_h.mp3', 'p_imp_pskptldr_h.mp3'], 'S2 塔纳托斯: attack.2');
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'swap', 0, 0, { id: 1, form: null }]]);
    assert.deepEqual(live(a).map((r) => [r.bank, r.delay]), [['kit:makoto:allout', null], ['kit:makoto:alloutFlash', null], ['kit:makoto:alloutHit', 0.45]]);
    a.played.length = 0;
    a.handleBattleEvents([['atk', 1, 9, 'none'], ['dmg', 9, 100, 'phys', 0, 1]]);
    assert.deepEqual(a.played.map((r) => r.f), BODY, 'the <本体> again');
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'substitute', 0, 0, { id: 1, form: 'doll', dur: 22 }], ['die', 1, 'killed']]);
    assert.ok(a.played.filter((r) => r.bank?.startsWith('kit:makoto:')).every((r) => r.cancelled), 'gun and range never sound after the knock-out');
  });
});

// ---- through a battle (the kit's events) -------------------------------------------------------------------------------
const enemy = (key, opts = {}) => enemyRec({ key, hp: 1e8, atk: 0, speed: 0, ...opts });
const defs = { enemies: { dummy: enemy('dummy'), weak: enemy('weak', { hp: 1000 }), armored: enemy('armored', { def: 3000, res: 0 }),
  warded: enemy('warded', { def: 0, res: 90 }) } };
const ALLY = { uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 4, dir: 'RIGHT' };
function field(skill, extra = []) {
  const h = makeBattle({ seed: 7, autoFinish: false, timeLimit: 300, defs, hooks: ['damaged', 'heal'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 6, charId: C, skillIndex: skill, uniEquipId: null }, elite: true, potential: 6, row: 10, col: 3, dir: 'RIGHT' }, ...extra] });
  const a = manager();
  h.step();
  // (the harness's opening units send no 'spawn': the view's UnitInfo by hand, as the client tracks them)
  a.handleBattleEvents([['spawn', { id: h.unit(1).id, side: 'ally', kind: 'char', defId: C, spine: C, skillIndex: skill }],
    ...extra.map((x) => ['spawn', { id: h.unit(x.uid).id, side: 'ally', kind: 'char', defId: x.chessId, spine: x.chessId }]), ...h.b.drainEvents()]);
  return { h, u: h.unit(1), a };
}
function play(h, a, seconds) {
  const end = h.b.time + seconds;
  while (h.b.time < end - 1e-9) { h.b.step(); a.handleBattleEvents(h.b.drainEvents()); }
}
function spawn(h, a, key, pos) {
  const e = h.spawn(key, { pos });
  a.handleBattleEvents(h.b.drainEvents());
  return e;
}
const cast = (u) => { u.skill.sp = u.skill.spCost; u.skill.charges = 1; assert.ok(u.skill.activate('test'), 'cast'); };
const done = (h) => { checkInvariants(h.b); assert.deepEqual(h.b.errors, []); };

describe('结城理 sounds through a battle', () => {
  test('S1 俄耳甫斯: its gun; MagicAttack\'s ON + shot HIT on an enemy, the heal\'s START and its landing 0.5 s later on an ally under 50 %', { skip: NO_DATA }, () => {
    const { h, u, a } = field(0, [ALLY]);
    spawn(h, a, 'dummy', [10, 5]);
    cast(u);
    play(h, a, DOLL_SWITCH + 4);
    assert.equal(keyed(a, 'makoto:s1gun').length, 1);
    assert.equal(keyed(a, 'makoto:s1gun')[0].delay, 1);
    const shots = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack).length;
    assert.ok(shots >= 2);
    assert.equal(files(a, 'p_atk_pskptldrfr_d.mp3').length, shots, 'MagicAttack ON per shot');
    assert.equal(files(a, 'p_imp_pskptldr_d.mp3').length, shots, 'projectile_chr_makoto_s1 HIT per shot');
    assert.equal(files(a, 'p_atk_pskptldrh_d.mp3').length, 0, 'no heal swing without an injured ally');
    for (const f of BODY) assert.equal(files(a, f).length, 0, `${f}: none from the persona`);
    const ally = h.unit(2);
    ally.hp = ally.s.maxHp * 0.4;
    a.played.length = 0;
    play(h, a, 4);
    const heals = h.hooksOf('heal').filter((c) => c.source === u && c.target === ally).length;
    assert.ok(heals >= 1);
    assert.equal(files(a, 'p_atk_pskptldrh_d.mp3').length, heals, 'HealAlly_Lt50Per START per heal');
    const land = keyed(a, 'makoto:s1heal');
    assert.equal(land.length, heals, 'makoto_skill_01_heal_01\'s sound per heal');
    assert.ok(land.every((r) => r.delay === 0.5));
    assert.equal(keyed(a, 'makoto:s3heal').length, 0);
    done(h);
  });

  test('S2 塔纳托斯: gun and range; attack.2 START / HIT, never the <本体>\'s; an execute sounds once; the switch back is the 总攻击\'s three', { skip: NO_DATA }, () => {
    const { h, u, a } = field(1);
    spawn(h, a, 'dummy', [10, 4]);
    cast(u);
    play(h, a, DOLL_SWITCH + 3);
    assert.deepEqual([keyed(a, 'makoto:s2gun').length, keyed(a, 'makoto:s2range').length], [1, 1]);
    assert.deepEqual([keyed(a, 'makoto:s2gun')[0].delay, keyed(a, 'makoto:s2range')[0].delay], [1, 1.99]);
    assert.equal(keyed(a, 'makoto:s1gun').length + keyed(a, 'makoto:s3gun').length + keyed(a, 'makoto:s3range1').length, 0);
    const swings = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack).length;
    assert.ok(swings >= 1);
    assert.equal(files(a, 'p_atk_pskptldr_h.mp3').length, swings, 'attack.2 START');
    assert.equal(files(a, 'p_imp_pskptldr_h.mp3').length, swings, 'attack.2 HIT');
    a.played.length = 0;
    const w = spawn(h, a, 'weak', [10, 5]);
    h.b.applyStatus(w, 'fear', { duration: 5, source: u });
    play(h, a, 0.3);
    assert.ok(!w.alive, 'executed');
    assert.equal(keyed(a, 'makoto:execute').length, 1, 'makoto_skill_02_hit_01_finish\'s sound once');
    for (const f of BODY) assert.equal(files(a, f).length, 0, f);
    a.played.length = 0;
    play(h, a, u.findBuff('trait:substitute').timeLeft + 0.1);
    assert.deepEqual(['makoto:allout', 'makoto:alloutFlash', 'makoto:alloutHit'].map((k) => keyed(a, k).length), [1, 1, 1]);
    assert.equal(keyed(a, 'makoto:alloutHit')[0].delay, 0.45);
    done(h);
  });

  test('S3: 塔纳托斯\'s ON and the 弱点 hit by the type dealt; 俄耳甫斯 after a lethal hit: its gun and range, a heal landing per heal, no attack', { skip: NO_DATA }, () => {
    const { h, u, a } = field(2, [ALLY]);
    const armored = spawn(h, a, 'armored', [10, 5]), warded = spawn(h, a, 'warded', [9, 4]);
    cast(u);
    play(h, a, DOLL_SWITCH + 3);
    assert.deepEqual([keyed(a, 'makoto:s3gun').length, keyed(a, 'makoto:s3range1').length], [1, 1]);
    const mine = (e) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack && c.target === e).length;
    assert.ok(mine(armored) >= 1 && mine(warded) >= 1);
    assert.equal(keyed(a, 'makoto:s3arts').length, mine(armored), 'the armoured one takes arts: _magical per hit');
    assert.equal(keyed(a, 'makoto:s3phys').length, mine(warded), 'the warded one takes physical: _physical per hit');
    const strikes = files(a, 'p_atk_pskptldr_s1.mp3').length + files(a, 'p_atk_pskptldr_s2.mp3').length + files(a, 'p_atk_pskptldr_s3.mp3').length;
    assert.ok(strikes >= 1 && strikes <= mine(armored), 'attack.3 ON once per strike, not per target');
    for (const f of BODY) assert.equal(files(a, f).length, 0, `${f}: none from the persona`);
    a.played.length = 0;
    h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
    a.handleBattleEvents(h.b.drainEvents());
    assert.deepEqual(live(a).filter((r) => r.bank?.startsWith('kit:makoto:')).map((r) => [r.bank, r.delay]),
      [['kit:makoto:s3orpheus', 0.5], ['kit:makoto:s3range2', 1.49]]);
    const ally = h.unit(2);
    play(h, a, 1.6);
    ally.hp = ally.s.maxHp * 0.5;
    a.played.length = 0;
    play(h, a, 3);
    const heals = h.hooksOf('heal').filter((c) => c.source === u && c.target === ally).length;
    assert.ok(heals >= 1);
    assert.ok(Math.abs(keyed(a, 'makoto:s3heal').length - heals) <= 1, 'a heal landing per heal (one may still be due)');
    assert.ok(keyed(a, 'makoto:s3heal').every((r) => r.delay === 0.5));
    assert.equal(live(a).filter((r) => !r.bank?.startsWith('kit:') && /^p_(atk|imp)_pskptldr/.test(r.f)).length, 0, 'no attack sound as 俄耳甫斯');
    done(h);
  });
});
