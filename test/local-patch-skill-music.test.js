// test/local-patch-skill-music.test.js — maintainer report (2026-10-08) 「스킬 특수 음악이 안 나온다」 and 「이격 텍사스 S2
// 지속 중에는 다른 타격음」 (docs/LOCAL-PATCH.md 「스킬 모드 효과음·믹서 볼륨」 → 「스킬 특수 음악·대역 전환·모드 타격음」).
//   - the manifest (tools/assets/skill-mode-sfx.mjs skillExtras / skillLoops / skillModes noHit, kit-sfx.mjs ghost2:*),
//   - the generator rules on the official audio_data (skipped without .cache/gamedata),
//   - public/js/audio.js on the events of the real match path (Match board → buildBattleSpec → createBattleFromSpec), in the
//     order the client hands them over (screens/game.js: the opening buffer's spawn / deploy / skill, then every event).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../public/js/audio.js';
import { dollSwitchSfx, skillExtrasOf } from '../public/js/audioOfficial.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
const UNITS = manifest.audio.sfx.units;
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const file = (u) => String(u).split('/').pop();

/**
 * An audio manager recording its one-shots (`played`) and its held sounds (`held`: { url, loop, key, stop: fade|null }) —
 * a stub Web Audio context under audioOfficial.js startSkillLoop / stopSkillLoop.
 */
function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.played = [];
  a.held = [];
  a._play = (url, o) => { a.played.push({ url, volume: o.volume, bank: o.bank ?? o.unitKey }); }; // bank: the sound's bank key (2026-10-10)
  a.voice = () => false;
  a._buffer = (url) => ({ url });
  a.sfxGain = {};
  a.ctx = {
    currentTime: 0,
    createBufferSource() {
      const rec = { url: null, loop: false, stop: null };
      return { set buffer(b) { rec.url = b.url; }, get loop() { return rec.loop; }, set loop(v) { rec.loop = v; },
        connect() {}, start() { a.held.push(rec); }, stop() { rec.stopped = true; } };
    },
    createGain() {
      const g = { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime(v, t) { g.rampTo = t; } };
      return { gain: g, connect() {} };
    },
  };
  return a;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

/** One operator alone on the board through the real match path; returns { b, u, ev } with `ev` = the client's batches. */
async function realBattle(chessId, skill) {
  const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
  h.toPrep(4);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  assert.ok(ps.setLoadout({ [chessId.replace(/_b$/, '_a')]: { skill } }), 'loadout');
  give(m, ps, chessId, 'board', legalTileFor(m, ps, chessId));
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  const u = b.allyUnits.find((x) => x.kind === 'op');
  m.dispose?.();
  return { b, u };
}

/** Run `b` until `until(b)` (or `max` s), feeding every batch to `a`; returns the events seen. */
function run(a, b, until, max = 40) {
  const all = [];
  while (!b.finished && b.time < max && !until(b)) { b.step(); const ev = b.drainEvents(); all.push(...ev); a.handleBattleEvents(ev); }
  return all;
}

describe('the manifest: skill extras, loops, mode impacts and the 替身 switch (tools/assets)', () => {
  test('耀骑士临光 S3 / 塑心 S3 extras, 烛煌 S3 loop, 缄默德克萨斯 S2 noHit, 归溟幽灵鲨 switch keys', () => {
    assert.deepEqual(skillExtrasOf(UNITS.char_1014_nearl2, 2).map((x) => file(x.url)), ['p_skill_goldspearboost1.mp3']);
    const cello = skillExtrasOf(UNITS.char_245_cello, 2);
    assert.deepEqual(cello.map((x) => [file(x.url), x.stop ?? null]), [['p_skill_shphrtcltrill.mp3', null], ['p_skill_shphrtcltrillmelody.mp3', 0.2]]);
    assert.equal(cello[1].grp, 'Battle_P_SAtk');
    assert.equal(file(UNITS.char_245_cello.loops['2'].url), 'p_skill_thrill_loop.mp3', 'the field loop stays');
    assert.equal(file(UNITS.char_1040_blaze2.loops['2'].url), 'p_skill_hcnsrfrfld.mp3', 'ON_ABILITY_END loop');
    assert.equal(UNITS.char_1028_texas2.modes['1'].noHit, true);
    assert.equal(file(UNITS.char_1028_texas2.modes['1'].attack), 'p_imp_reticentsword_h.mp3');
    const kit = manifest.audio.sfx.kit;
    assert.deepEqual(['ghost2:stand', 'ghost2:standin', 'ghost2:normal'].map((k) => file(kit[k])),
      ['p_skill_sharpstandborn.mp3', 'p_skill_sharpstandspell.mp3', 'p_skill_sharpborn.mp3']);
    assert.deepEqual(dollSwitchSfx('char_1023_ghost2', 'substitute'), { play: ['ghost2:stand'], hold: { key: 'ghost2:standin', fade: 0.8 }, stop: false });
    assert.equal(dollSwitchSfx('char_4016_kazema', 'substitute'), null);
  });

  test('generator rules on the official audio_data (skillExtras / skillModes noHit)', { skip: !existsSync(OFFICIAL) && 'no .cache/gamedata' }, async () => {
    const { indexAudio } = await import('../tools/assets/audio.mjs');
    const { skillExtras, skillModes, loadCharModes } = await import('../tools/assets/skill-mode-sfx.mjs');
    const { skillStartSounds } = await import('../tools/assets/skill-sfx.mjs');
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    const leaf = (p) => p[0];
    const sk = (id, n) => Array.from({ length: n }, (_, i) => ({ index: i, skillId: `skchr_${id}_${i + 1}` }));
    const starts = (id, n) => Object.fromEntries(sk(id, n).map((s) => [String(s.index), skillStartSounds(audio, s.skillId)]));
    const x = skillExtras(audio, 'char_245_cello', sk('cello', 3), leaf, starts('cello', 3));
    assert.deepEqual(x['2'].map((e) => [e.url, e.stop ?? null]), [['player/p_skill/p_skill_shphrtcltrill.mp3', null], ['player/p_skill/p_skill_shphrtcltrillmelody.mp3', 0.2]]);
    // a skill whose generic start cue is its only other bank gets nothing (诗怀雅 S2: ON_ABILITY_START b_char_atkboost)
    assert.equal(skillExtras(audio, 'char_173_slchan', sk('slchan', 2), leaf, starts('slchan', 2)), null);
    const modes = skillModes(audio, 'char_1028_texas2', sk('texas2', 3), loadCharModes(ROOT)['char_1028_texas2'], leaf);
    assert.equal(modes['1'].noHit, true, 'attack.2 has ON_ABILITY_ON only');
  });
});

describe('real match path → audio.js (maintainer report)', () => {
  test('缄默德克萨斯 S2: its deploy-time skill reaches the audio (held for its spawn); S2 hits sound p_imp_reticentsword_h only', async () => {
    const { b, u } = await realBattle('chess_char_4_16_b', 1);
    assert.equal(u.def.charId, 'char_1028_texas2');
    const a = manager();
    a.setFieldUnits([]);
    const early = b.drainEvents();
    assert.ok(early.findIndex((e) => e[0] === 'skill' && e[1] === u.id) < early.findIndex((e) => e[0] === 'spawn' && e[1]?.id === u.id), 'the sim sends skill before spawn');
    // screens/game.js: the opening buffer's spawn / deploy / skill
    a.handleBattleEvents(early.filter((e) => e[0] === 'spawn' || e[0] === 'deploy' || e[0] === 'skill'));
    assert.equal(a.units.get(u.id)?.skillOn, true, 'S2 runs for the audio');
    assert.ok(a.played.some((p) => p.bank === 'char_1028_texas2:skill:1' && file(p.url) === 'p_skill_reticentsword_h.mp3'), 'its start sound');
    a.played.length = 0;
    u.skill.timeLeft = 120; // the enemies of this field reach her after S2's 8 s: keep it running until a few attacks landed
    run(a, b, () => a.played.filter((p) => file(p.url) === 'p_imp_reticentsword_h.mp3').length >= 3, 90);
    u.skill.end('test');
    b.step(); a.handleBattleEvents(b.drainEvents());
    const during = a.played.filter((p) => String(p.bank).startsWith('char_1028_texas2:')).map((p) => file(p.url));
    assert.ok(during.includes('p_imp_reticentsword_h.mp3'), `S2 attack sound (${during.slice(0, 6)})`);
    assert.ok(!during.includes('p_atk_reticentsword_n.mp3'), 'no Default impact while S2 runs');
    assert.equal(a.units.get(u.id).skillOn, false, 'ended');
    a.played.length = 0;
    run(a, b, () => a.played.some((p) => file(p.url) === 'p_atk_reticentsword_n.mp3'), b.time + 10);
    assert.ok(a.played.some((p) => file(p.url) === 'p_atk_reticentsword_n.mp3'), 'after S2: the Default impact again');
  });

  test('耀骑士临光 S3: its start bank and its ability\'s p_skill_goldspearboost1', async () => {
    const { b, u } = await realBattle('chess_char_6_17_b', 2);
    const a = manager();
    a.handleBattleEvents(b.drainEvents());
    run(a, b, () => b.time > 1);
    u.skill.activate('manual', { free: true });
    run(a, b, () => b.time > 2);
    const urls = a.played.filter((p) => String(p.bank).startsWith('char_1014_nearl2:')).map((p) => file(p.url));
    assert.ok(urls.includes('b_char_atkboost.mp3') && urls.includes('p_skill_goldspearboost1.mp3'), urls.join());
  });

  test('塑心 S3: the field loop, the trill and the melody; its end cuts the loop (0.25 s) and the melody (0.2 s)', async () => {
    const { b, u } = await realBattle('chess_char_6_09_b', 2);
    const a = manager();
    a.handleBattleEvents(b.drainEvents());
    run(a, b, () => b.time > 1);
    u.skill.activate('manual', { free: true });
    run(a, b, () => b.time > 1.5);
    await tick();
    assert.deepEqual(a.held.map((h) => [file(h.url), h.loop]), [['p_skill_thrill_loop.mp3', true], ['p_skill_shphrtcltrillmelody.mp3', false]]);
    assert.ok(a.played.some((p) => file(p.url) === 'p_skill_shphrtcltrill.mp3'), 'the trill (one-shot)');
    u.skill.end('test');
    run(a, b, () => true, b.time + 0.1); b.step(); a.handleBattleEvents(b.drainEvents());
    assert.ok(a.held.every((h) => h.stopped), 'both cut with the skill');
    assert.equal(a._skillLoops.size, 0);
  });

  test('归溟幽灵鲨 S2: its end switches her to the 替身 — sharpstandborn + the held sharpstandspell; the switch back cuts it', async () => {
    const { b, u } = await realBattle('chess_char_5_13_b', 1);
    const a = manager();
    a.handleBattleEvents(b.drainEvents());
    run(a, b, () => b.time > 1);
    u.skill.activate('manual', { free: true });
    const ev = run(a, b, () => u.form === 'doll', 60);
    assert.ok(ev.some((e) => e[0] === 'fx' && e[1] === 'substitute'), 'the sim switched her');
    await tick();
    assert.ok(a.played.some((p) => file(p.url) === 'p_skill_sharpstandborn.mp3'), 'switch2stand');
    assert.deepEqual(a.held.map((h) => [file(h.url), h.loop, !!h.stopped]), [['p_skill_sharpstandspell.mp3', false, false]]);
    run(a, b, () => u.form !== 'doll', b.time + 60);
    assert.ok(a.played.some((p) => file(p.url) === 'p_skill_sharpborn.mp3'), 'switch2normal');
    assert.equal(a.held[0].stopped, true, 'the stand-in sound cut at the switch back');
  });
});
