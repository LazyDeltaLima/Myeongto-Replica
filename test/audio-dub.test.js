// test/audio-dub.test.js — docs/rules/audio.md 「더빙 효과음」: 浊心斯卡蒂's line was buried under her own skill start —
// the plain 作战中 line went through the voice channel, which her AllLowpass_Reverb snapshot (556 Hz) sinks. The client:
//   - BattleController.PlayAudioAtPos → VoiceLangManager.TryHookAudioByFxLang replaces her deploy / skill-start bank with
//     the voice dub's copy (audio_data soundFxVoiceLang: Voice_KR/char_1012_skadi2/FX_025_3 … = the tide with her line
//     mixed in, Independent group, itself a snapshot hook) — tools/assets/skill-mode-sfx.mjs dubbedSfx → sfx.units[id].dub,
//     public/js/audio.js unitDub;
//   - her skills' prefabs have `_playCharWordVoice` off: no 作战中 line (tools/local-extract/skill_cast.py `word` →
//     the skill record's `charWord: false` → public/js/voicePolicy.js).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, unitDub } from '../public/js/audio.js';
import { createVoicePolicy } from '../public/js/voicePolicy.js';
import { outsideBus, snapshotHookOf } from '../public/js/audioSnapshot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (...p) => JSON.parse(readFileSync(path.join(ROOT, ...p), 'utf8'));
const manifest = json('data', 'assets.json');
const chess = json('data', 'chess.json');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const SKADI = 'char_1012_skadi2';
const file = (u) => String(u).split('/').pop();
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('浊心斯卡蒂: the dubbed deploy / skill-start sounds', () => {
  test('generator rule on the official audio_data: soundFxVoiceLang → the dub\'s bank, its snapshot and group', { skip: !existsSync(OFFICIAL) && 'no .cache/gamedata' }, async () => {
    const { indexAudio } = await import('../tools/assets/audio.mjs');
    const { dubbedSfx } = await import('../tools/assets/skill-mode-sfx.mjs');
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    assert.equal(audio.dubsOf('battle.ON_SKILL_START.skchr_skadi2_3', SKADI)?.KR, 'battle.ON_SKILL_START.skchr_skadi2_3@KR');
    assert.equal(audio.dubsOf('battle.ON_SKILL_START.skchr_skadi_3', 'char_263_skadi'), null, 'only the characters the table names');
    assert.deepEqual(audio.snapshotOf('battle.ON_SKILL_START.skchr_skadi2_3@KR'), { hook: 'battle.ON_SKILL_START.skchr_skadi2_3@KR', snap: 'AllLowpass_Reverb', delay: 0, dur: 0.1 });
    const skills = [0, 1, 2].map((i) => ({ index: i, skillId: `skchr_skadi2_${i + 1}` }));
    const dub = dubbedSfx(audio, SKADI, skills, ['kr', 'jp'], (paths) => paths);
    assert.deepEqual(dub.kr.skills['2'], { url: ['voice_kr/char_1012_skadi2/fx_025_3.mp3', 'voice_kr/char_1012_skadi2/fx_026_3.mp3', 'voice_kr/char_1012_skadi2/fx_027_3.mp3', 'voice_kr/char_1012_skadi2/fx_028_3.mp3'], grp: 'Independent' });
    assert.deepEqual(dub.jp.born, { url: ['voice/char_1012_skadi2/fx_023.mp3', 'voice/char_1012_skadi2/fx_024.mp3'], grp: 'Independent' });
    assert.equal(dubbedSfx(audio, 'char_263_skadi', [{ index: 2, skillId: 'skchr_skadi_3' }], ['kr'], (p) => p), null);
  });

  test('the manifest: both dubs, every skill and the deploy, outside the bus and each a snapshot hook', () => {
    const dub = manifest.audio.sfx.units[SKADI]?.dub;
    assert.ok(dub, 'sfx.units.char_1012_skadi2.dub');
    for (const lang of ['kr', 'jp']) {
      assert.deepEqual(dub[lang].born.url.map(file), ['fx_023.mp3', 'fx_024.mp3']);
      for (const i of [0, 1, 2]) {
        const e = dub[lang].skills[String(i)];
        assert.deepEqual(e.url.map(file), [25, 26, 27, 28].map((n) => `fx_0${n}_${i + 1}.mp3`));
        assert.equal(e.grp, 'Independent');
        for (const u of e.url) {
          assert.ok(u.startsWith(`/assets/audio/voice/${lang}/${SKADI}/`), u); // the per-dub download filter (voice.js voiceWanted)
          assert.deepEqual(manifest.audio.sfx.snap.hook[u], { snap: 'AllLowpass_Reverb', dur: 0.1 });
          assert.ok(manifest.audio.sfx.snap.outside.includes(u), `${u} outside the bus`);
          assert.deepEqual(manifest.audio.sfx.bank[u], [1, 1, 2, 1], 'its bank: pitch 1, two at a time, the oldest cut');
        }
      }
    }
    assert.equal(Object.values(manifest.audio.sfx.units).filter((u) => u.dub).length, 1, 'only 浊心斯卡蒂 in the roster');
  });

  test('unitDub: the chosen dub\'s line (drawn), none with the voice off or without a dub', () => {
    const u = manifest.audio.sfx.units[SKADI];
    assert.equal(file(unitDub(u, 'skill', 2, 'kr', () => 0)), 'fx_025_3.mp3');
    assert.equal(file(unitDub(u, 'skill', 2, 'kr', () => 0.99)), 'fx_028_3.mp3');
    assert.ok(unitDub(u, 'skill', 2, 'jp', () => 0).includes('/voice/jp/'));
    assert.equal(file(unitDub(u, 'born', null, 'kr', () => 0.6)), 'fx_024.mp3');
    assert.equal(unitDub(u, 'skill', 2, 'off'), null);
    assert.equal(unitDub(u, 'skill', null, 'kr'), null);
    assert.equal(unitDub(manifest.audio.sfx.units.char_263_skadi, 'skill', 2, 'kr'), null);
  });

  test('her skills say no 作战中 line (charWord false); 斯卡蒂\'s do', () => {
    for (const id of ['chess_char_6_04_a', 'chess_char_6_04_b']) for (const s of chess[id].skills) assert.equal(s.charWord, false, `${id} ${s.skillId}`);
    const policy = createVoicePolicy({ skillOf: (u) => u.rec, slotsOf: () => ['skill1', 'skill2', 'skill3', 'skill4'], random: () => 0 });
    assert.deepEqual(policy.skill({ def: SKADI, rec: chess.chess_char_6_04_b.skills[2] }), { slot: null, type: 'SKILL_ACTIVE' });
    const other = Object.values(chess).find((c) => c?.charId === 'char_263_skadi');
    assert.deepEqual(policy.skill({ def: 'char_263_skadi', rec: other.skills[2] }), { slot: 'skill1', type: 'SKILL_ACTIVE' });
  });

  test('real match path: her S3 plays one dubbed line outside the bus, turns the snapshot on, and no voice-channel line', async () => {
    const { b, u } = await realBattle('chess_char_6_04_b', 2);
    const a = manager('kr');
    a.handleBattleEvents(b.drainEvents());
    run(a, b, () => b.time > 1);
    await tick(); await tick(); // the deploy's dub (fx_023 / fx_024) decoded and started
    assert.ok(a.ctx.sources.some((s) => /^fx_02[34]\.mp3$/.test(file(s.buffer?.url))), 'she deployed with the dub\'s 部署 line');
    a.ctx.sources.length = 0; a.voiced.length = 0;
    const holds = a._snapHolds ?? 0; // the deploy's dub still holds it (the stub never ends a sound)
    u.skill.activate('manual', { free: true });
    run(a, b, () => b.time > 2);
    await tick(); await tick();
    const played = a.ctx.sources.map((s) => file(s.buffer?.url));
    assert.deepEqual(played.filter((f) => /^fx_|tidesurging/.test(f)), ['fx_025_3.mp3'], played.join());
    const src = a.ctx.sources.find((s) => file(s.buffer?.url) === 'fx_025_3.mp3');
    assert.equal(src.out[0]?.out[0], a.sfxOutside, 'the dub stays clear');
    assert.ok(snapshotHookOf(a, src.buffer.url) && outsideBus(a, src.buffer.url));
    assert.equal(a._snapHolds, holds + 1, 'her S3 holds AllLowpass_Reverb too');
    assert.deepEqual(a.voiced.filter((v) => /^skill/.test(v.slot)), [], 'no 作战中 line on the voice channel');
  });

  test('real match path, voice off: the base tide sound, still no line', async () => {
    const { b, u } = await realBattle('chess_char_6_04_b', 2);
    const a = manager('off');
    a.handleBattleEvents(b.drainEvents());
    run(a, b, () => b.time > 1);
    await tick(); await tick();
    a.ctx.sources.length = 0;
    u.skill.activate('manual', { free: true });
    run(a, b, () => b.time > 2);
    await tick(); await tick();
    assert.ok(a.ctx.sources.some((s) => file(s.buffer?.url) === 'p_skill_tidesurging.mp3'));
    assert.ok(!a.ctx.sources.some((s) => /^fx_/.test(file(s.buffer?.url))));
    assert.deepEqual(a.voiced.filter((v) => /^skill/.test(v.slot)), []);
  });

  test('deploy: the dub\'s copy of her deploy sound (with her 部署 line), the base one with the voice off', () => {
    const urls = (lang) => { const a = manager(lang); const out = []; a._play = (url) => out.push(file(url)); a.playDeploySfx({ def: SKADI, defId: 'chess_char_6_04_b', kind: 'char', side: 'ally' }); return out; };
    assert.deepEqual(urls('kr'), ['fx_023.mp3']);
    assert.deepEqual(urls('off'), ['b_char_spskadi1.mp3']);
  });
});

/** A stub Web Audio context (as test/local-patch-skill-snapshot.test.js). */
function stubCtx() {
  const ctx = { currentTime: 0, sampleRate: 8000, nodes: [], sources: [] };
  const param = (v) => {
    const p = { value: v, events: [] };
    p.cancelScheduledValues = () => {};
    p.setValueAtTime = (x) => { p.value = x; };
    p.linearRampToValueAtTime = (x, t) => p.events.push(['lin', x, t]);
    p.exponentialRampToValueAtTime = (x, t) => p.events.push(['exp', x, t]);
    p.setTargetAtTime = (x) => { p.value = x; };
    return p;
  };
  const node = (kind, extra = {}) => {
    const n = { kind, out: [], connect(d) { n.out.push(d); return d; }, disconnect(d) { n.out = d ? n.out.filter((x) => x !== d) : []; }, ...extra };
    ctx.nodes.push(n);
    return n;
  };
  ctx.createGain = () => node('gain', { gain: param(1) });
  ctx.createBiquadFilter = () => node('lowpass', { type: '', frequency: param(350), Q: param(1) });
  ctx.createConvolver = () => node('convolver', { buffer: null });
  ctx.createBuffer = (ch, len, rate) => { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { length: len, sampleRate: rate, getChannelData: (i) => d[i] }; };
  ctx.createBufferSource = () => {
    const s = node('source', { buffer: null, playbackRate: param(1), onended: null, start() { ctx.sources.push(s); }, stop() { s.stopped = true; } });
    return s;
  };
  return ctx;
}

/** An AudioManager on the stub graph with the official voice policy (as public/js/voice.js installs it) and voice `lang`. */
function manager(lang) {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  const c = (a.ctx = stubCtx());
  a.master = c.createGain(); a.bus = c.createGain(); a.sfxOutside = c.createGain();
  a.bgmGain = c.createGain(); a.sfxGain = c.createGain(); a.voiceGain = c.createGain();
  for (const ch of [a.bgmGain, a.sfxGain, a.voiceGain]) ch.connect(a.bus);
  a.bus.connect(a.master); a.sfxOutside.connect(a.master);
  a._buffer = (url) => Promise.resolve({ url, duration: 12.8 });
  a.voiceLang = () => lang;
  a.voicePolicy = createVoicePolicy({
    skillOf: (u) => (chess[u.defId]?.skills || []).find((s) => s.index === u.skillIndex) ?? null,
    slotsOf: () => ['skill1', 'skill2', 'skill3', 'skill4'],
  });
  a.voiced = [];
  a.voice = (charId, slot) => { a.voiced.push({ charId, slot }); return true; };
  return a;
}

/** One operator alone on the board through the real match path (as test/local-patch-skill-snapshot.test.js). */
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
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'dub', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  const u = b.allyUnits.find((x) => x.kind === 'op');
  m.dispose?.();
  return { b, u };
}

function run(a, b, until, max = 40) {
  while (!b.finished && b.time < max && !until(b)) { b.step(); a.handleBattleEvents(b.drainEvents()); }
}
