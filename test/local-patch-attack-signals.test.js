// test/local-patch-attack-signals.test.js — attack sound signals as the client builds them (docs/rules/audio.md 「공격 소리 신호」,
// 2026-10-10): tools/local-extract/char_audio.py → tools/assets/local-char-audio.json, tools/assets/skill-mode-sfx.mjs soundSet /
// abilityCues / skillHitCues / enemySkillCues / spineCues → manifest `cues` / `sel` / `kd` / `sk` / `spine`, played by public/js/audio.js
// (START at the 'swing', ON + projectile BORN at the strike, HIT / REACH on the impact; group children; the attacker of a 'dmg').

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../public/js/audio.js';
import { pickVariant, cuesAt, cueFile, cueSetOf, cueAbility } from '../public/js/audioOfficial.js';
import { signalBase, loadCharAudio, soundSet } from '../tools/assets/skill-mode-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
const UNITS = manifest.audio.sfx.units;
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const file = (u) => String(u).split('/').pop();
const files = (cues) => cues.map((c) => `${c.at}:${file(c.u)}${c.k ? `#${c.k}` : ''}`);

/** An audio manager with a context, recording what it would play: [{ f, volume, delay }]. */
function manager(random = () => 0) {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url, o) => { a.played.push({ f: file(url), volume: o.volume, delay: o.delay ?? null, bank: o.bank }); };
  a.voice = () => false;
  return a;
}
const field = (a, op, skillIndex = 0) => a.setFieldUnits([
  { id: 1, kind: 'op', side: 'ally', spine: op, defId: 'chess_x', skillIndex },
  { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' },
  { id: 3, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' },
]);

describe('the prefab facts (local-char-audio.json)', () => {
  const CA = loadCharAudio(ROOT);
  test('every operator of the pool, the summons and the enemies; mode signal flags', () => {
    const chess = JSON.parse(readFileSync(path.join(ROOT, 'data', 'chess.json'), 'utf8'));
    for (const c of Object.values(chess.chess ?? chess)) if (c?.charId?.startsWith('char_')) assert.ok(CA[c.charId], `${c.charId} (run tools/local-extract/char_audio.py)`);
    assert.ok(Object.keys(CA).filter((k) => k.startsWith('enemy_')).length >= 240, 'enemies');
    // 텍사스 디 오메르토사 [Default, S1, S2, S3]: only S2 adds its index — S1 / S3 attack with the Default's `.attack`
    assert.deepEqual(CA.char_1028_texas2.sig, [[0, 0], [0, 0], [1, 0], [0, 0]]);
    assert.equal(signalBase('attack', 1, CA.char_1028_texas2.sig), 'attack');
    assert.equal(signalBase('attack', 2, CA.char_1028_texas2.sig), 'attack.2');
    assert.equal(signalBase('attack', 0, [[1, 1]]), 'attack.0', '_includeIndexZero');
    assert.equal(signalBase('combat', 3), 'combat.3', 'no facts: the mode index');
  });

  test('ability groups: random (실버애쉬 더 레인프로스트, 위셔델 never twice), loop (아스카론), conditional (혼: melee / ranged)', () => {
    assert.deepEqual(CA.char_1045_svash2.ab[0].attack, { names: ['AttackA', 'AttackB', 'AttackC'], g: 'rand', n: 3 });
    assert.equal(CA.char_1035_wisdel.ab[0].attack.diff, 1);
    assert.equal(CA.char_4132_ascln.ab[0].attack.g, 'loop');
    assert.deepEqual(CA.char_4039_horn.ab[0].attack.names, ['BlockedMeleeAttack', 'RangedAttack', 'MeleeAttack']);
    assert.deepEqual(CA.char_4039_horn.ab[0].attack.kidProj, [[], ['projectile_chr_horn'], []], 'only the ranged child shoots');
    assert.equal(CA.char_1038_whitw2.ab[0].attack.go, 'M0FunnelsNormalAttack', 'a Body ability by another name signals as attack');
    assert.deepEqual(CA.char_1038_whitw2.ab[0].attack.proj, ['projectile_chr_whitw2'], 'its own shot, not its drones');
  });

  test('soundSet on the official audio_data', { skip: !existsSync(OFFICIAL) && 'no .cache/gamedata' }, () => {
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    const leaf = (p) => `/x/${file(p[0])}`;
    const svash = soundSet(audio, 'char_1045_svash2', CA.char_1045_svash2, 0, leaf);
    assert.deepEqual(files(svash.cues), ['s:p_atk_snwlprdg_n1.mp3#1', 'd:p_imp_snwlprdg_n.mp3#1', 's:p_atk_snwlprdg_n2.mp3#2', 'd:p_imp_snwlprdg_n.mp3#2',
      's:p_atk_snwlprdg_n2.mp3#3', 'd:p_imp_snwlprdg_n.mp3#3'], 'every variant attack.0.1–0.3 (was the first only)');
    assert.deepEqual(svash.sel, { attack: { n: 3, how: 'rand' } });
    // 혼's Default: the ranged child (attack.2 + its projectile), the melee one (attack.3) — attack.1 is a child's bank too
    const horn = soundSet(audio, 'char_4039_horn', CA.char_4039_horn, 0, leaf);
    assert.deepEqual(horn.sel, { attack: { n: 3, how: 'cond', melee: 3, ranged: 2 } });
    assert.deepEqual(files(horn.cues), ['a:p_imp_blackshield_n.mp3#1', 'a:p_atk_heavygun_n.mp3#2', 'd:p_imp_heavygun_n.mp3#2', 'a:p_imp_blackshield_n.mp3#3']);
    // 이네스: the ranged `attack` and the melee `combat` ability both
    const ines = soundSet(audio, 'char_4087_ines', CA.char_4087_ines, 0, leaf);
    assert.deepEqual(ines.cues.map((c) => c.ab), ['attack', 'attack', 'combat', 'combat']);
    // 텍사스 디 오메르토사 S1 sounds the Default `.attack` (its HIT), S2 its own attack.2 ON
    assert.deepEqual(files(soundSet(audio, 'char_1028_texas2', CA.char_1028_texas2, 1, leaf).cues), ['d:p_atk_reticentsword_n.mp3']);
    assert.deepEqual(files(soundSet(audio, 'char_1028_texas2', CA.char_1028_texas2, 2, leaf).cues), ['a:p_imp_reticentsword_h.mp3']);
    // 첸 더 던스트릭 S1: a two-hit attack, the spell count on its HIT (attack.1.0 / attack.1.1)
    const chen = soundSet(audio, 'char_1050_chen3', CA.char_1050_chen3, 1, leaf);
    assert.deepEqual(chen.cues.filter((c) => c.at === 'd').map((c) => c.sp), [0, 1]);
    // 텍사스's START carries its own delay (0.27 s)
    assert.equal(soundSet(audio, 'char_102_texas', CA.char_102_texas, 0, leaf).cues[0].dl, 0.27);
  });
});

describe('the manifest', () => {
  test('operators: Default cues + groups; a mode with no bank attacks in silence; skill impacts; spine events', () => {
    assert.ok(UNITS.char_1045_svash2.cues.length === 6 && UNITS.char_1045_svash2.sel.attack.how === 'rand');
    // official silence (G): 마운틴 S2 / S3, 첸 더 던스트릭 S2, 사리아 S3 … — the Default no longer sounds for them
    for (const [id, i] of [['char_264_f12yin', '1'], ['char_264_f12yin', '2'], ['char_1050_chen3', '1'], ['char_202_demkni', '2'], ['char_4162_cathy', '1']]) {
      assert.deepEqual(UNITS[id].modes[i].cues, [], `${id} S${+i + 1}`);
    }
    assert.deepEqual(UNITS.char_4039_horn.kd['0'].map((c) => file(c.u)), ['p_imp_blackcannonlight_d.mp3', 'p_imp_blackcannon_d.mp3'], '혼 S1 projectiles');
    assert.deepEqual(Object.keys(UNITS.char_264_f12yin.spine).sort(), ['Skill_2_1', 'Skill_2_2', 'Skill_3_1', 'Skill_3_2']);
    assert.ok(UNITS.token_10030_mlyss_wtrman.cues.some((c) => c.at === 's'), '유동체: its Default mode (index 1)');
  });

  test('enemies: their projectile impact, the official attack bank, skills by ability name', () => {
    const d = (id) => (UNITS[id].cues || []).filter((c) => c.at === 'd').map((c) => file(c.u));
    assert.deepEqual(d('enemy_9017_achunt'), ['e_imp_mchntr_n_u.mp3'], '가상적: 총 — its shot lands with a sound');
    assert.ok(d('enemy_9032_aclionk').length && d('enemy_9013_acstmk').length);
    assert.deepEqual(UNITS.enemy_1172_dugago.cues.map((c) => file(c.u)), ['e_imp_rockhit.mp3'], '무덤지기 석상: its Default mode (Walk) combat');
    assert.ok(UNITS.enemy_1272_nhtank_2.cues.some((c) => c.ab === 'combat' && file(c.u) === 'e_atk_shotgun_n.mp3'));
    assert.deepEqual(UNITS.enemy_1516_jakill.cues.map((c) => file(c.u)), ['e_atk_magic_ice.mp3', 'e_imp_magic_ice.mp3']);
    assert.ok(Object.keys(UNITS.enemy_9017_achunt.sk).includes('3'), 'Skills/3');
  });
});

describe('playing them (audio.js)', () => {
  test('pickVariant: random, never twice, in turn, conditional; cuesAt / cueFile', () => {
    let r = [0.9, 0.9, 0.1];
    const mem = {};
    const sel = { attack: { n: 3, how: 'rand', diff: 1 } };
    assert.equal(pickVariant(sel, null, { melee: false, mem, random: () => r.shift() }), 3);
    assert.notEqual(pickVariant(sel, null, { melee: false, mem, random: () => r.shift() ?? 0.9 }), 3, 'diff: not the last again');
    const loop = { attack: { n: 2, how: 'loop' } }, lm = {};
    assert.deepEqual([1, 2, 3].map(() => pickVariant(loop, 'attack', { melee: false, mem: lm, random: () => 0 })), [1, 2, 1]);
    const cond = { attack: { n: 3, how: 'cond', melee: 3, ranged: 2 } };
    assert.equal(pickVariant(cond, 'attack', { melee: true, mem: {}, random: () => 0 }), 3);
    assert.equal(pickVariant(cond, 'attack', { melee: false, mem: {}, random: () => 0 }), 2);
    const set = { cues: [{ at: 's', u: 'a', k: 1 }, { at: 's', u: 'b', k: 2 }, { at: 'a', u: 'c' }, { at: 'd', u: 'h0', sp: 0 }, { at: 'd', u: 'h1', sp: 1 }] };
    assert.deepEqual(cuesAt(set, 's', null, 2).map((c) => c.u), ['b']);
    assert.deepEqual(cuesAt(set, 's', null, null).map((c) => c.u), ['a'], 'no pick: the first child');
    assert.deepEqual(cuesAt(set, 'd', null, null, 1).map((c) => c.u), ['h1']);
    assert.deepEqual(cueFile({ u: 'x', or: [{ u: 'x', w: 1 }, { u: 'y', w: 3 }] }, () => 0.5), { url: 'y', vol: 1, delay: 0 });
    assert.equal(cueAbility({ cues: [{ ab: 'attack' }, { ab: 'combat' }] }, true), 'combat');
    assert.equal(cueSetOf({ cues: [], modes: { 1: { cues: [] } } }, 1).mode, true);
  });

  test('START at the swing (+ its delay ÷ the game speed), ON at the strike, HIT on the impact', () => {
    const a = manager();
    field(a, 'char_102_texas');
    a.setGameSpeed(2);
    a.handleBattleEvents([['swing', 1, 0.5, 'none']]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_atk_sword_n.mp3'], 'the swing: START');
    assert.ok(Math.abs(a.played[0].delay - 0.27) < 1e-9, 'its bank delay (the manager divides by the speed)');
    a.handleBattleEvents([['atk', 1, 2, 'none'], ['dmg', 2, 100, 'phys']]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_atk_sword_n.mp3', 'p_imp_sword_n.mp3'], 'no second START at the strike');
  });

  test('a strike without a swing (a kit\'s attack) sounds its START then; one ON per strike, not per target', () => {
    const a = manager();
    field(a, 'char_1035_wisdel');
    a.handleBattleEvents([['atk', 1, 2, 'arrow'], ['atk', 1, 3, 'arrow']]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_atk_dkmrcaygn_n.mp3', 'p_atk_dkmrcaygnfr_n.mp3']);
  });

  test('melee vs ranged: 이네스\'s combat on a melee strike, her attack on a ranged one', () => {
    const a = manager();
    field(a, 'char_4087_ines');
    a.handleBattleEvents([['swing', 1, 0.4, 'none']]);
    a.handleBattleEvents([['swing', 1, 0.4, 'arrow']]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_atk_insasn_n_2.mp3', 'p_atk_insasn_n_1.mp3']);
  });

  test('a mode with no bank: the skill\'s attacks are silent (마운틴 S3) — its spine events stand in at the strike', () => {
    const a = manager();
    field(a, 'char_264_f12yin', 2);
    a.handleBattleEvents([['skill', 1, 1]]);
    a.played.length = 0;
    a.handleBattleEvents([['swing', 1, 0.3, 'none'], ['atk', 1, 2, 'none'], ['dmg', 2, 50, 'phys']]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_tigerpunch_d_1.mp3'], 'Skill_3_1 at the strike, nothing else');
    a.spineEvent(1, 'Skill_3_2');
    assert.equal(a.played.at(-1).f, 'p_imp_tigerpunch_d_2.mp3', 'the renderer\'s spine event');
    a.played.length = 0;
    a.handleBattleEvents([['swing', 1, 0.3, 'none'], ['atk', 1, 2, 'none']]);
    assert.deepEqual(a.played, [], 'once the renderer reports them, no stand-in');
  });

  test('the attacker of a \'dmg\' (docs/SIM.md): its normal impact, a splash, its skill\'s own damage (kit) — not a kit with sfx.kit', () => {
    const a = manager();
    field(a, 'char_4039_horn', 0);
    a.handleBattleEvents([['swing', 1, 0.3, 'arrow'], ['atk', 1, 2, 'arrow']]);
    a.played.length = 0;
    a.handleBattleEvents([['dmg', 2, 100, 'phys', 0, 1], ['dmg', 3, 100, 'phys', 0, 1]]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_heavygun_n.mp3', 'p_imp_heavygun_n.mp3'], 'its target and the splash beside it');
    a.played.length = 0;
    a.handleBattleEvents([['skill', 1, 1]]);
    a.played.length = 0;
    a.lastAttacker.clear(); delete a.units.get(1).lastAtkAt; delete a.units.get(1).lastImpactAt;
    a.handleBattleEvents([['dmg', 2, 300, 'phys', 0, 1]]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_blackcannonlight_d.mp3'], 'S1\'s projectile impact (kd)');
    a.handleBattleEvents([['dmg', 3, 30, 'burn', 0, 1]]);
    assert.equal(a.played.length, 1, 'a DoT type is no impact');
    const b = manager();
    field(b, 'char_1050_chen3', 2);
    b.handleBattleEvents([['skill', 1, 1]]);
    b.played.length = 0;
    b.handleBattleEvents([['dmg', 2, 300, 'phys', 0, 1]]);
    assert.deepEqual(b.played, [], '첸 더 던스트릭: her 剑气 sounds through sfx.kit (kitHit) — no second impact');
  });

  test('an enemy skill named by the sim (fx enemySkill { id, ability }) sounds its ability\'s banks', () => {
    const a = manager();
    a.setFieldUnits([{ id: 9, kind: 'enemy', side: 'enemy', spine: 'enemy_9017_achunt', boss: true }, { id: 1, kind: 'op', side: 'ally', spine: 'char_102_texas' }]);
    a.handleBattleEvents([['fx', 'enemySkill', 0, 0, { id: 9, ability: '3', n: 1 }]]);
    const want = UNITS.enemy_9017_achunt.sk['3'].filter((c) => c.at !== 'd').map((c) => file(c.u));
    assert.ok(want.length);
    assert.deepEqual(a.played.map((p) => p.f), want);
  });

  test('real match path: the swing sounds before its strike', async () => {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const chess = JSON.parse(readFileSync(path.join(ROOT, 'data', 'chess.json'), 'utf8'));
    const c = Object.values(chess.chess ?? chess).find((x) => x?.charId === 'char_431_ashlok' && /_b$/.test(x.chessId));
    give(m, ps, c.chessId, 'board', legalTileFor(m, ps, c.chessId));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const a = manager(() => 0);
    const log = [];
    a._play = (url) => log.push({ f: file(url), t: b.time });
    a.handleBattleEvents(b.drainEvents());
    while (b.time < 20 && !log.some((x) => x.f === 'p_imp_heavygun_n.mp3')) { b.step(); a.handleBattleEvents(b.drainEvents()); }
    const cast = log.find((x) => x.f === 'p_atk_heavygun_n_cast.mp3'), fire = log.find((x) => x.f === 'p_atk_heavygun_n.mp3');
    assert.ok(cast && fire && cast.t < fire.t, `애쉬락: START (cast) at the swing ${cast?.t}, ON at the strike ${fire?.t}`);
  });
});
