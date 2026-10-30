// test/local-patch-talent-sounds.test.js — talent abilities, skill projectiles and summon modes in the sound (2026-10-11,
// docs/rules/audio.md 「재능·소환물 능력 소리」): 크루스 더 킨 글린트 中的 (sim 'swing' / 'atk' `signal` 'T.1' → T.1 START at the swing,
// ON at the strike; 2026-10-30 — her crit mark itself is silent), 이그제큐터 디 엑스 포에데레
// 受选之人 (sim 'atk' `signal` 'T.1' → T.1 START instead of the normal attack), 노시스 殊途同归 (kitHit gnosis:t2 once per deployment),
// 실버애쉬 더 레인프로스트 (S2 slash → its ability ON, S3 strike → projectile_chr_svash2_s3 BORN), 뮤엘시스's 流形 (fx 'copy' `mode` →
// its prefab mode's cues, Range_S2 / Melee_S3 while her S2 / S3 runs; the copy / pull buff sounds).
// The committed data/assets.json predates these keys: the manifest here is it plus the keys built from the official
// audio_data.json by the same generator functions (tools/assets/kit-sfx.mjs kitHitSfx, skill-mode-sfx.mjs tokenModeSets).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, kitHitKey, kitStartKey, signalAttackKey, signalFxKey, talentAttackKeys, talentSwingKeys, tokenModeName } from '../public/js/audio.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { loadCharAudio, soundSet, tokenModeSets } from '../tools/assets/skill-mode-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const file = (u) => String(u).split('/').pop();
const NEW_KEYS = ['kroos2:t1s', 'kroos2:t1', 'excu2:t1', 'gnosis:t2', 'svash2:s2', 'svash2:s3born', 'mlyss:melee', 'mlyss:range', 'mlyss:pull'];
const TOKEN = 'token_10030_mlyss_wtrman';

let built = null;
/** data/assets.json with the new sfx.kit keys and the 流形's `tm` built from the official data (file-name leaves). */
function manifest() {
  if (built) return built;
  const m = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
  const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
  const leaf = (p) => `/assets/audio/sfx/${file(p[0])}`;
  Object.assign(m.audio.sfx.kit, kitHitSfx(audio, leaf));
  const ta = loadCharAudio(ROOT)[TOKEN];
  const set = soundSet(audio, TOKEN, ta, ta.modes.indexOf('Default'), leaf);
  m.audio.sfx.units[TOKEN] = { ...m.audio.sfx.units[TOKEN], cues: set.cues, tm: tokenModeSets(audio, TOKEN, ta, leaf, set) };
  built = { m, audio, set };
  return built;
}
function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest().m, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url, o) => { a.played.push({ f: file(url), bank: o.bank }); };
  a.voice = () => false;
  return a;
}
const names = (a) => a.played.map((p) => p.f);

describe('the banks (EN / zh_CN audio_data.json)', { skip: NO_DATA }, () => {
  test('every new sfx.kit key names a bank with a sound', () => {
    const notes = [];
    const out = kitHitSfx(manifest().audio, (p) => p, notes);
    for (const k of NEW_KEYS) assert.ok(out[k]?.length, `${k}: ${KIT_HIT_BANKS[k]}`);
    assert.equal(file(out['kroos2:t1s'][0]), 'p_atk_krossbow_d.mp3');
    assert.equal(file(out['excu2:t1'][0]), 'p_atk_shotgunxdouble.mp3');
    assert.equal(file(out['gnosis:t2'][0]), 'p_skill_iceprickbuff.mp3');
    assert.equal(file(out['svash2:s3born'][0]), 'p_skill_snwfld_s.mp3');
    assert.equal(file(out['mlyss:pull'][0]), 'p_atk_wtrlimepull.mp3');
  });

  test('流形 prefab modes: [Recharge, Default, Melee, Range, Range_S2, Melee_S3] — the copy modes hit with the remote impact', () => {
    const { m } = manifest();
    const tm = m.audio.sfx.units[TOKEN].tm;
    assert.deepEqual(Object.keys(tm).sort(), ['Melee', 'Melee_S3', 'Range', 'Range_S2'], 'Recharge has no attack, Default is the base');
    assert.deepEqual(tm.Melee.cues.map((c) => `${c.at}:${file(c.u)}`), ['s:p_atk_wtrlime_n.mp3', 'd:p_imp_wtrlime_remote.mp3'], 'attack.2');
    assert.deepEqual(tm.Range.cues.map((c) => `${c.ab}:${c.at}:${file(c.u)}`).sort(),
      ['attack:d:p_imp_wtrlime_remote.mp3', 'attack:s:p_atk_wtrlime_n.mp3', 'combat:d:p_imp_wtrlime_n.mp3', 'combat:s:p_atk_wtrlime_n.mp3'], 'attack.3 / combat.3');
  });
});

describe('the keys of the moments (pure)', () => {
  const units = new Map([
    [1, { def: 'char_1021_kroos2', side: 'ally' }], [2, { def: 'enemy_1006_shield', side: 'enemy' }],
    [3, { def: 'char_1045_svash2', side: 'ally' }], [4, { def: TOKEN, side: 'ally' }], [5, { def: 'char_1_other', side: 'ally' }],
  ]);
  const unitOf = (id) => units.get(id);
  test('크루스 더 킨 글린트 中的: T.1 START at its swing, ON at its strike; the crit mark is silent (in her skills too)', () => {
    assert.deepEqual(talentSwingKeys('char_1021_kroos2', 'T.1'), ['kroos2:t1s']);
    assert.deepEqual(talentAttackKeys('char_1021_kroos2', 'T.1'), ['kroos2:t1']);
    assert.equal(talentSwingKeys('char_1021_kroos2', undefined), null);
    assert.equal(talentSwingKeys('char_1032_excu2', 'T.1'), null, 'the 受选之人 shot has no swing of its own');
    // kroos2_t_1[critical] (her skill modes' roll) creates no buff with an audio signal
    assert.equal(kitStartKey('crit', { id: 2, by: 1 }), null);
    assert.equal(kitHitKey('crit', { id: 2, by: 1 }, unitOf), null);
  });
  test('실버애쉬 더 레인프로스트: S2 slash (aoe svash2) → its ability ON; S3 strike → the projectile BORN', () => {
    assert.equal(kitHitKey('aoe', { id: 3, skill: 'svash2' }, unitOf), 'svash2:s2');
    assert.equal(kitHitKey('aoe', { id: 5, skill: 'svash2' }, unitOf), null, 'a waiting op\'s slash on redeploy');
    assert.equal(kitHitKey('aoe', { id: 3, skill: 'svash2Plan' }, unitOf), null);
    assert.equal(signalAttackKey({ def: 'char_1045_svash2', skillOn: true, skillIndex: 2 }, 'a', false), 'svash2:s3born');
    assert.equal(signalAttackKey({ def: 'char_1045_svash2', skillOn: true, skillIndex: 2 }, 's', false), null);
    assert.equal(signalAttackKey({ def: 'char_1045_svash2', skillOn: false, skillIndex: 2 }, 'a', false), null);
  });
  test('이그제큐터 디 엑스 포에데레 T.1; 流形 mode names and copy / pull sounds', () => {
    assert.deepEqual(talentAttackKeys('char_1032_excu2', 'T.1'), ['excu2:t1']);
    assert.equal(talentAttackKeys('char_1032_excu2', undefined), null);
    assert.equal(tokenModeName({ tmode: 'Range' }, { skillOn: true, skillIndex: 1 }), 'Range_S2');
    assert.equal(tokenModeName({ tmode: 'Range' }, { skillOn: true, skillIndex: 2 }), 'Range');
    assert.equal(tokenModeName({ tmode: 'Melee' }, { skillOn: true, skillIndex: 2 }), 'Melee_S3');
    assert.equal(tokenModeName({ tmode: 'Melee' }, { skillOn: false, skillIndex: 2 }), 'Melee');
    assert.equal(tokenModeName({}, null), null);
    assert.equal(signalFxKey('copy', { id: 4, mode: 'Range' }, unitOf), 'mlyss:range');
    assert.equal(signalFxKey('copy', { id: 4, mode: 'Melee' }, unitOf), 'mlyss:melee');
    assert.equal(signalFxKey('pulse', { id: 4 }, unitOf), 'mlyss:pull');
    assert.equal(signalFxKey('pulse', { id: 2 }, unitOf), null, 'an enemy DoT pulse');
  });
});

describe('the audio manager', { skip: NO_DATA }, () => {
  test('이그제큐터 디 엑스 포에데레: the extra shot sounds T.1 once, no normal ON, no impact; her normal shot as before', () => {
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: 'char_1032_excu2', defId: 'x' },
      { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' }, { id: 3, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' }]);
    a.handleBattleEvents([['atk', 1, 2, 'none', 'T.1'], ['atk', 1, 3, 'none', 'T.1'], ['dmg', 2, 50, 'phys', 0, 1]]);
    assert.deepEqual(names(a), ['p_atk_shotgunxdouble.mp3']);
    a.played.length = 0;
    a.handleBattleEvents([['swing', 1, 0.3, 'none'], ['atk', 1, 2, 'none']]);
    assert.deepEqual(names(a), ['p_atk_shotgunx_n.mp3']);
  });

  test('크루스 더 킨 글린트: a T.1 shot sounds START at the swing, ON at the strike, no normal cue or impact; 노시스 kitHit; 실버애쉬 S2 slash / S3 strike', () => {
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: 'char_1021_kroos2', defId: 'x' },
      { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' },
      { id: 3, kind: 'op', side: 'ally', spine: 'char_206_gnosis', defId: 'y' },
      { id: 4, kind: 'op', side: 'ally', spine: 'char_1045_svash2', defId: 'z', skillIndex: 2 }]);
    a.handleBattleEvents([['swing', 1, 0.3, 'arrow', 0, null, 0, 0, 'T.1']]);
    assert.deepEqual(names(a), ['p_atk_krossbow_d.mp3']);
    a.handleBattleEvents([['atk', 1, 2, 'arrow', 'T.1']]);
    a.handleBattleEvents([['dmg', 2, 50, 'phys', 0, 1], ['fx', 'crit', 0, 0, { id: 2, by: 1 }]]);
    assert.deepEqual(names(a), ['p_atk_krossbow_d.mp3', 'p_imp_krossbow_d.mp3']);
    a.played.length = 0;
    a.handleBattleEvents([['swing', 1, 0.3, 'arrow'], ['atk', 1, 2, 'arrow'], ['dmg', 2, 50, 'phys', 0, 1]]);
    assert.deepEqual(names(a), ['p_atk_crossbow_n.mp3', 'p_imp_crossbow_n.mp3'], 'her normal shot as before');
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'kitHit', 0, 0, { id: 3, k: 'gnosis:t2' }]]);
    assert.deepEqual(names(a), ['p_skill_iceprickbuff.mp3']);
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'aoe', 0, 0, { id: 4, r: 2, skill: 'svash2' }]]);
    assert.deepEqual(names(a), ['p_atk_snwlprdg_h.mp3']);
    a.handleBattleEvents([['skill', 4, 1]]);
    a.played.length = 0;
    a.handleBattleEvents([['swing', 4, 0.3, 'none'], ['atk', 4, 2, 'none'], ['atk', 4, 2, 'none']]);
    assert.equal(names(a).filter((f) => f === 'p_skill_snwfld_s.mp3').length, 1, 'one BORN per strike');
  });

  test('流形: its copy names its mode — Range, Range_S2 while her S2 runs; the split copy keeps it; the copy sound', () => {
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: 'char_249_mlyss', defId: 'x', skillIndex: 1 },
      { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' },
      { id: 4, kind: 'token', side: 'ally', spine: TOKEN, defId: TOKEN }, { id: 5, kind: 'token', side: 'ally', spine: TOKEN, defId: TOKEN }]);
    const strike = (id) => { a.played.length = 0; a.lastAttacker.clear(); a.handleBattleEvents([['swing', id, 0.3, 'bolt'], ['atk', id, 2, 'bolt'], ['dmg', 2, 50, 'arts', 0, id]]); return names(a); };
    assert.deepEqual(strike(4), ['p_atk_wtrlime_n.mp3', 'p_imp_wtrlime_n.mp3'], 'Default before a copy');
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'copy', 0, 0, { id: 4, src: 9, mode: 'Range', by: 1 }]]);
    assert.deepEqual(names(a), ['p_skill_wtrlimetrans_range.mp3']);
    assert.deepEqual(strike(4), ['p_atk_wtrlime_n.mp3', 'p_imp_wtrlime_remote.mp3'], 'Range (attack.3, ranged)');
    a.handleBattleEvents([['skill', 1, 1]]);
    assert.equal(a._swingOf(a.units.get(4), 'bolt', 0).set.cues, manifest().m.audio.sfx.units[TOKEN].tm.Range_S2.cues, 'Range_S2 while her S2 runs');
    a.handleBattleEvents([['fx', 'split', 0, 0, { id: 5, src: 4 }]]);
    assert.equal(a.units.get(5).tmode, 'Range');
  });
});

describe('real match path (Match → buildBattleSpec → createBattleFromSpec)', () => {
  async function battle(chessIds, seed = 11) {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    for (const c of chessIds) give(m, ps, c, 'board', legalTileFor(m, ps, c));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    return b;
  }
  const run = (b, stop, max = 150) => { const ev = []; while (!b.finished && b.time < max && !stop(ev)) { b.step(); ev.push(...b.drainEvents()); } return ev; };

  test('크루스 더 킨 글린트: a 中的 shot outside her skills — its swing and its atk carry T.1, and its mark names her', async () => {
    const b = await battle(['chess_char_4_06_a']);
    const ev = run(b, (e) => e.some((x) => x[0] === 'fx' && x[1] === 'crit'));
    const crit = ev.find((x) => x[0] === 'fx' && x[1] === 'crit');
    assert.ok(crit, 'a 中的 shot');
    const id = b.allyUnits.find((u) => u.kind === 'op').id;
    assert.equal(crit[4].by, id);
    const sw = ev.filter((x) => x[0] === 'swing' && x[1] === id);
    assert.ok(sw.some((x) => x[8] === 'T.1') && sw.some((x) => x.length < 9), 'both kinds of swing');
    assert.ok(ev.some((x) => x[0] === 'atk' && x[1] === id && x[4] === 'T.1'));
  });

  test('이그제큐터 디 엑스 포에데레: the 受选之人 extra shot\'s atk events carry T.1, her normal ones none', async () => {
    const b = await battle(['chess_char_5_01_a']);
    const ev = run(b, (e) => e.some((x) => x[0] === 'fx' && x[1] === 'extraAttack'));
    assert.ok(ev.some((x) => x[0] === 'fx' && x[1] === 'extraAttack'), 'an extra attack');
    const atk = ev.filter((x) => x[0] === 'atk');
    assert.ok(atk.some((x) => x[4] === 'T.1') && atk.some((x) => x.length === 4), 'both kinds');
  });

  test('노시스: kitHit gnosis:t2 once, 10 s after her deployment', async () => {
    const b = await battle(['chess_char_4_13_a']);
    const ev = run(b, () => b.time > 25, 30);
    const t2 = ev.filter((x) => x[0] === 'fx' && x[1] === 'kitHit' && x[4]?.k === 'gnosis:t2');
    assert.equal(t2.length, 1);
    assert.equal(t2[0][4].id, b.allyUnits.find((u) => u.kind === 'op' && u.def?.charId === 'char_206_gnosis').id);
  });

  test('뮤엘시스: her 流形\'s copy names its mode and her', async () => {
    const b = await battle(['chess_char_6_11_a', 'chess_char_4_06_a']);
    const ev = run(b, (e) => e.some((x) => x[0] === 'fx' && x[1] === 'copy'));
    const copy = ev.find((x) => x[0] === 'fx' && x[1] === 'copy');
    assert.ok(copy, 'a copy');
    assert.ok(['Melee', 'Range'].includes(copy[4].mode));
    assert.equal(copy[4].by, b.allyUnits.find((u) => u.def?.charId === 'char_249_mlyss').id);
  });
});
