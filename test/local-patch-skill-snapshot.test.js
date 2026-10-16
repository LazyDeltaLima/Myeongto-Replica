// test/local-patch-skill-snapshot.test.js — maintainer report (2026-10-08) leftovers (docs/LOCAL-PATCH.md 「스킬 특수 음악·대역
// 전환·모드 타격음」 → 「믹서 스냅샷」):
//   - 归溟幽灵鲨's switch to her 替身 turns the mixer snapshot AllLowpass_Reverb on (audio_data snapshotBanks, 5 s): the
//     manifest's sfx.snap (tools/assets/skill-mode-sfx.mjs snapshotSfx) and public/js/audioSnapshot.js on a stub Web Audio
//     graph, through the real match path's events;
//   - 耀骑士临光 S2 (activateOnDeploy) sounds its p_skill_goldspearboost on deployment (note 「sim sends no
//     'skill'」 was from before its own early-skill hold).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../public/js/audio.js';
import { SNAPSHOTS, snapshotHookOf, outsideBus } from '../public/js/audioSnapshot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const file = (u) => String(u).split('/').pop();
const STAND = '/assets/audio/sfx/player/p_skill/p_skill_sharpstandborn.mp3';
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A stub Web Audio context: every node records its connections, every param its scheduled values. */
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

/** An AudioManager on the stub graph, wired as unlock() wires it (master ← bus ← channels, master ← sfxOutside). */
function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  const c = (a.ctx = stubCtx());
  a.master = c.createGain(); a.bus = c.createGain(); a.sfxOutside = c.createGain();
  a.bgmGain = c.createGain(); a.sfxGain = c.createGain(); a.voiceGain = c.createGain();
  for (const ch of [a.bgmGain, a.sfxGain, a.voiceGain]) ch.connect(a.bus);
  a.bus.connect(a.master); a.sfxOutside.connect(a.master);
  a._buffer = (url) => Promise.resolve({ url, duration: 5.7 });
  a.voice = () => false;
  return a;
}
const lowpass = (a) => a.ctx.nodes.find((n) => n.kind === 'lowpass');
const sourceOf = (a, name) => a.ctx.sources.find((s) => file(s.buffer?.url) === name);
const sinkOf = (s) => s.out[0]?.out[0]; // source → its gain → the channel node

describe('mixer snapshot AllLowpass_Reverb (归溟幽灵鲨\'s 替身 switch)', () => {
  test('the manifest: the hooks (归溟幽灵鲨 5 s, 浊心斯卡蒂 0.1 s) and the banks outside the bus', () => {
    const snap = manifest.audio.sfx.snap;
    assert.deepEqual(snap.hook[STAND], { snap: 'AllLowpass_Reverb', dur: 5 });
    // (her dubs' copies, under audio/voice/: test/audio-dub.test.js)
    const skadi = Object.entries(snap.hook).filter(([u, h]) => h.dur === 0.1 && !u.startsWith('/assets/audio/voice/')).map(([u]) => file(u)).sort();
    assert.deepEqual(skadi, ['b_char_spskadi1.mp3', 'p_skill_burningdarkness.mp3', 'p_skill_samegoaldiffways.mp3', 'p_skill_tidesurging.mp3']);
    // the held stand-in sound is Independent too: it stays clear while the rest sinks
    assert.ok(snap.outside.includes('/assets/audio/sfx/player/p_skill/p_skill_sharpstandspell.mp3'));
    for (const u of Object.keys(snap.hook)) assert.ok(snap.outside.includes(u), `${file(u)} outside the bus`);
  });

  test('generator rule on the official audio_data: snapshotBanks without the dub copies', { skip: !existsSync(OFFICIAL) && 'no .cache/gamedata' }, async () => {
    const { indexAudio } = await import('../tools/assets/audio.mjs');
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    assert.ok(audio.snapshots.length > 0 && audio.snapshots.every((s) => !s.hook.includes('@')));
    assert.deepEqual(audio.snapshots.find((s) => s.hook === 'battle.ON_BUFF_START.ghost2_switch2stand'),
      { hook: 'battle.ON_BUFF_START.ghost2_switch2stand', snap: 'AllLowpass_Reverb', delay: 0, dur: 5 });
  });

  test('a hook sinks the bus (556 Hz, dry −67 dB, reverb on) over its 5 s and comes back when it ends; it plays outside', async () => {
    const a = manager();
    assert.ok(snapshotHookOf(a, STAND) && outsideBus(a, STAND));
    a._play(STAND, { volume: 0.5, limited: true, bank: 'kit:ghost2:stand' });
    a._play('/assets/audio/sfx/player/p_atk/p_atk_saw_n.mp3', { volume: 0.3, limited: true, bank: 'char_x:attack' });
    await tick();
    const lp = lowpass(a);
    assert.ok(lp, 'the chain is built on the first hook');
    assert.deepEqual(a.bus.out, [lp], 'bus → lowpass');
    assert.deepEqual(lp.frequency.events.at(-1), ['exp', SNAPSHOTS.AllLowpass_Reverb.cutoff, 5]);
    const [dry, verb] = lp.out;
    assert.equal(verb.kind, 'convolver');
    assert.ok(Math.abs(dry.gain.events.at(-1)[1] - 10 ** (-6696 / 2000)) < 1e-9);
    assert.equal(sinkOf(sourceOf(a, 'p_skill_sharpstandborn.mp3')), a.sfxOutside, 'the hook itself stays clear');
    assert.equal(sinkOf(sourceOf(a, 'p_atk_saw_n.mp3')), a.sfxGain, 'a battle sound goes through the bus');
    a.ctx.currentTime = 5.7;
    sourceOf(a, 'p_skill_sharpstandborn.mp3').onended();
    assert.deepEqual(lp.frequency.events.at(-1), ['exp', 22000, 10.7], 'back to Default over the same 5 s');
    assert.deepEqual(dry.gain.events.at(-1), ['lin', 1, 10.7]);
    assert.equal(a._snapHolds, 0);
  });

  test('UI one-shots stay outside the bus (SFX_UI is not under BattleGameSound)', async () => {
    const a = manager();
    const url = Object.values(manifest.audio.sfx.ui).find((u) => typeof u === 'string');
    a._play(url, { volume: 0.9 });
    await tick();
    assert.equal(sinkOf(a.ctx.sources[0]), a.sfxOutside);
  });

  test('real match path: 归溟幽灵鲨 S2 ends → her 替身 → the snapshot is on; the switch back after it ended', async () => {
    const { b, u } = await realBattle('chess_char_5_13_b', 1);
    const a = manager();
    a.handleBattleEvents(b.drainEvents());
    run(a, b, () => b.time > 1);
    u.skill.activate('manual', { free: true });
    const ev = run(a, b, () => u.form === 'doll', 60);
    assert.ok(ev.some((e) => e[0] === 'fx' && e[1] === 'substitute'), 'the sim switched her');
    await tick(); await tick();
    assert.equal(a._snapHolds, 1, 'held by p_skill_sharpstandborn');
    assert.equal(lowpass(a).frequency.events.at(-1)[1], 556);
    // the held stand-in (audioOfficial.js startSkillLoop) plays outside the bus too
    assert.equal(sinkOf(sourceOf(a, 'p_skill_sharpstandspell.mp3')), a.sfxOutside);
  });
});

describe('耀骑士临光 S2 (activateOnDeploy)', () => {
  test('its p_skill_goldspearboost sounds on deployment through the real match path', async () => {
    const { b, u } = await realBattle('chess_char_6_17_b', 1);
    const a = manager();
    const played = [];
    a._play = (url, o) => played.push({ url, bank: o.bank });
    a.handleBattleEvents(b.drainEvents());
    run(a, b, () => b.time > 1);
    assert.equal(u.skill.active, true);
    assert.ok(played.some((p) => file(p.url) === 'p_skill_goldspearboost.mp3' && p.bank === 'char_1014_nearl2:x1:0'), played.map((p) => file(p.url)).join());
  });
});

/** One operator alone on the board through the real match path (as test/local-patch-skill-music.test.js). */
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

function run(a, b, until, max = 40) {
  const all = [];
  while (!b.finished && b.time < max && !until(b)) { b.step(); const ev = b.drainEvents(); all.push(...ev); a.handleBattleEvents(ev); }
  return all;
}
