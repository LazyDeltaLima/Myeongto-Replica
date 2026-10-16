// test/local-patch-attack-signals.test.js — attack sound signals as the client builds them (docs/rules/audio.md 「공격 소리 신호」,
// 2026-10-10): tools/local-extract/char_audio.py → tools/assets/local-char-audio.json, tools/assets/skill-mode-sfx.mjs soundSet /
// abilityCues / skillHitCues / enemySkillCues / spineCues → manifest `cues` / `sel` / `kd` / `sk` / `spine`, played by public/js/audio.js
// (START at the 'swing', ON + projectile BORN at the strike, HIT / REACH on the impact; group children; the attacker of a 'dmg').

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, signalAttackKey, signalFxKey, snowRefreshed } from '../public/js/audio.js';
import { pickVariant, cuesAt, cueFile, cueSetOf, cueAbility } from '../public/js/audioOfficial.js';
import { signalBase, loadCharAudio, soundSet, enemyModeSets, spineCues } from '../tools/assets/skill-mode-sfx.mjs';
import { KIT_HIT_BANKS } from '../tools/assets/kit-sfx.mjs';
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

describe('spine events from the renderer (render/spine.js onEvent → audio.spineEvent, per unit)', () => {
  test('a unit whose model reports its events loses the strike stand-in; another unit keeps it', () => {
    const a = manager();
    a.setFieldUnits([
      { id: 1, kind: 'op', side: 'ally', spine: 'char_264_f12yin', defId: 'chess_x', skillIndex: 2 },
      { id: 4, kind: 'op', side: 'ally', spine: 'char_264_f12yin', defId: 'chess_x', skillIndex: 2 },
      { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' },
    ]);
    a.handleBattleEvents([['skill', 1, 1], ['skill', 4, 1]]);
    assert.equal(a.spineEvent(1, null), false, 'null = the model is up, nothing to play');
    a.played.length = 0;
    a.handleBattleEvents([['swing', 1, 0.3, 'none'], ['atk', 1, 2, 'none'], ['swing', 4, 0.3, 'none'], ['atk', 4, 2, 'none']]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_tigerpunch_d_1.mp3'], 'only unit 4 (no model) gets the stand-in');
    assert.equal(a.spineEvent(1, 'Skill_3_1'), true);
    assert.equal(a.played.at(-1).f, 'p_imp_tigerpunch_d_1.mp3');
    assert.equal(a.spineEvent(1, 'OnAttack'), false, 'an event without a bank is silent');
    assert.equal(a.spineEvent(99, 'Skill_3_1'), false, 'an unknown unit');
    // a redeploy's spawn of the same model keeps the flag (its view keeps reporting)
    a.handleBattleEvents([['spawn', { id: 1, kind: 'op', side: 'ally', spine: 'char_264_f12yin', defId: 'chess_x', skillIndex: 2 }]]);
    assert.equal(a.units.get(1).spineLive, true);
  });

  test('파투스 reload and 필라에 shield are spine events; enemies get theirs from the plan', () => {
    for (const [id, ev] of [['char_430_fartth', 'Attact_1'], ['char_430_fartth', 'Skill_1'], ['char_4148_philae', 'philae_shield']]) assert.ok(UNITS[id].spine?.[ev]?.u, `${id} ${ev}`);
    const en = Object.entries(UNITS).filter(([k, v]) => k.startsWith('enemy_') && v.spine);
    assert.ok(en.length >= 10, `enemies with spine-event sounds: ${en.length}`);
    const a = manager();
    const [eid, ue] = en[0];
    const ev = Object.keys(ue.spine)[0];
    a.setFieldUnits([{ id: 7, kind: 'enemy', side: 'enemy', spine: eid }]);
    assert.equal(a.spineEvent(7, ev), true);
    assert.equal(a.played.at(-1).f, file(ue.spine[ev].u));
  });

  test('the renderer wiring (source): the Spine listener, the unit view, the field view context', () => {
    const src = (f) => readFileSync(path.join(ROOT, 'public', 'js', 'render', f), 'utf8');
    assert.match(src('spine.js'), /state\.addListener\(\{ event:/);
    assert.match(src('units.js'), /actor\.onEvent = \(name\) =>/);
    assert.match(src('units.js'), /this\.ctx\.spineEvent\(uid, null\)/);
    assert.match(src('app.js'), /spineEvent: \(id, name\) => \{ if \(mode === 'battle' && !battleMeta\?\.prep\) opts\.audio\?\.spineEvent\?\.\(id, name\)/);
  });
});

describe('enemy modes (audio.enemyMode — the renderer reports the official prefab mode)', () => {
  const CA = loadCharAudio(ROOT);
  test('the plan: the other modes\' attack signals (em), a silent mode as cues []', { skip: !existsSync(OFFICIAL) && 'no .cache/gamedata' }, () => {
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    const leaf = (p) => `/x/${file(p[0])}`;
    const n = Object.entries(UNITS).filter(([k, v]) => k.startsWith('enemy_') && v.em).length;
    assert.ok(n >= 20, `enemies with mode sets: ${n}`);
    assert.equal(enemyModeSets(audio, 'enemy_1006_shield', CA.enemy_1006_shield, leaf), null, 'one mode: none');
    // every em set is a mode index of its prefab
    for (const [k, v] of Object.entries(UNITS)) if (v.em) for (const i of Object.keys(v.em)) assert.ok(Number(i) > 0 && Number(i) < (CA[k] || CA[k.replace(/_\d+$/, '')]).modes.length, `${k} mode ${i}`);
    assert.equal(spineCues(audio, 'enemy_1006_shield', leaf), null);
  });

  test('its attacks sound the reported mode; back to mode 0; an ally or an unknown unit is ignored', () => {
    const [eid, ue] = Object.entries(UNITS).find(([k, v]) => k.startsWith('enemy_') && v.cues?.length && v.em && Object.values(v.em).some((m) => m.cues.length));
    const [mi, mset] = Object.entries(ue.em).find(([, m]) => m.cues.length);
    const a = manager();
    a.setFieldUnits([{ id: 9, kind: 'enemy', side: 'enemy', spine: eid }, { id: 1, kind: 'op', side: 'ally', spine: 'char_102_texas' }]);
    const strike = () => { a.played.length = 0; a.lastAttacker.clear(); a.handleBattleEvents([['swing', 9, 0.3, 'none'], ['atk', 9, 1, 'none'], ['dmg', 1, 10, 'phys', 0, 9]]); return a.played.map((p) => p.f); };
    const base = strike();
    assert.equal(a.enemyMode(9, eid, Number(mi), 0), true);
    const moded = strike();
    const want = mset.cues.filter((c) => !c.k || c.k === 1).map((c) => file(c.u));
    for (const f of moded) assert.ok(want.includes(f) || mset.cues.some((c) => file(c.u) === f), `${eid} mode ${mi}: ${f}`);
    assert.notDeepEqual(moded, base, `${eid}: mode ${mi} sounds its own set`);
    assert.equal(a.enemyMode(9, eid, 0, Number(mi)), true);
    assert.deepEqual(strike(), base, 'mode 0 again');
    assert.equal(a.enemyMode(1, 'char_102_texas', 1, 0), false, 'an ally');
    assert.equal(a.enemyMode(42, eid, 1, 0), false, 'an unknown unit');
    assert.equal(a.enemyMode(9, 'enemy_other', 1, 0), false, 'another model');
  });
});

describe('buff and custom-trigger sounds (EN client buff templates → sfx.kit)', () => {
  test('the table: banks of the templates\' audio signals, each with a sound in the manifest', () => {
    assert.equal(KIT_HIT_BANKS['horn:2:overload:melee'], 'battle.ON_BUFF_START.horn_s_2[overload][melee].attack');
    assert.equal(KIT_HIT_BANKS['ascln:s2bomb'], 'battle.ON_CUSTOM_TRIGGER.ASCLN_S_2_BOMB');
    for (const k of Object.keys(KIT_HIT_BANKS).filter((x) => /^(horn|rockr|titi|ascln|sbell2):/.test(x))) assert.equal(typeof manifest.audio.sfx.kit[k], 'string', k);
  });

  test('혼 S3: every strike its normal / overload × melee / ranged buff sound; the overload start', () => {
    assert.equal(signalAttackKey({ def: 'char_4039_horn', skillOn: false, skillIndex: 2 }, 'a', true), null, 'no skill: none');
    assert.equal(signalAttackKey({ def: 'char_4039_horn', skillOn: true, skillIndex: 0 }, 'a', true), null, 'S1: none');
    const a = manager();
    field(a, 'char_4039_horn', 2);
    a.handleBattleEvents([['skill', 1, 1]]);
    a.played.length = 0;
    a.handleBattleEvents([['swing', 1, 0.3, 'arrow'], ['atk', 1, 2, 'arrow']]);
    assert.ok(a.played.some((p) => p.f === 'p_atk_blackcannon_s.mp3'), 'normal ranged');
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'overload', 0, 0, { id: 1 }]]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_skill_blackcannonboost.mp3'], 'overload start');
    a.played.length = 0;
    a.handleBattleEvents([['swing', 1, 0.3, 'none'], ['atk', 1, 2, 'none']]);
    assert.ok(a.played.some((p) => p.f === 'p_imp_blackshieldoverload_s.mp3'), 'overloaded melee');
    a.handleBattleEvents([['skill', 1, 0]]);
    assert.equal(a.units.get(1).over, false, 'the overload ends with the skill');
  });

  test('락락 S2: overload start / finish, her attack\'s start and hit (normal → overloaded)', () => {
    const a = manager();
    field(a, 'char_4040_rockr', 1);
    a.handleBattleEvents([['skill', 1, 1]]);
    a.played.length = 0;
    a.handleBattleEvents([['swing', 1, 0.3, 'bolt'], ['atk', 1, 2, 'bolt'], ['dmg', 2, 50, 'arts', 0, 1]]);
    for (const f of ['p_atk_elecwand_h.mp3', 'p_imp_elecwand_h.mp3']) assert.ok(a.played.some((p) => p.f === f), f);
    a.handleBattleEvents([['fx', 'overload', 0, 0, { id: 1 }]]);
    assert.ok(a.played.some((p) => p.f === 'p_skill_elecwandoverload.mp3'));
    a.played.length = 0; a.lastAttacker.clear();
    a.handleBattleEvents([['swing', 1, 0.3, 'bolt'], ['atk', 1, 2, 'bolt'], ['dmg', 2, 50, 'arts', 0, 1]]);
    for (const f of ['p_atk_elecwand_s.mp3', 'p_imp_elecwand_s.mp3']) assert.ok(a.played.some((p) => p.f === f), f);
    a.played.length = 0;
    a.handleBattleEvents([['skill', 1, 0]]);
    assert.ok(a.played.some((p) => p.f === 'p_skill_elecwanddizzy.mp3'), 'overload finish');
  });

  test('圣聆初雪: a snow tile effect created anew sounds sbell2_snow_refresh_audio, kept or emptied tiles do not', () => {
    const u = { def: 'char_1046_sbell2' };
    assert.equal(snowRefreshed(u, [[3, 2, 1], [4, 2, 1]]), true, 'new tiles');
    assert.equal(snowRefreshed(u, [[3, 2, 2]]), true, '_01 → _02');
    assert.equal(snowRefreshed(u, [[3, 2, 3], [3, 2, 4]]), false, '_02 kept');
    assert.equal(snowRefreshed(u, [[3, 2, 5]]), true, '_02 → _03');
    assert.equal(snowRefreshed(u, [[3, 2, 0], [4, 2, 0]]), false, 'emptied');
    assert.equal(snowRefreshed(u, [[3, 2, 1]]), true, 'snow again on an emptied tile');
    const a = manager();
    field(a, 'char_1046_sbell2');
    a.handleBattleEvents([['fx', 'snow', 0, 0, { id: 1, tiles: 2, cells: [[3, 2, 1], [4, 2, 1]] }]]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_swcvr.mp3']);
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'snow', 0, 0, { id: 1, cells: [[3, 2, 0]] }], ['fx', 'snow', 0, 0, { id: 1, tiles: 1, cells: [[4, 2, 2]] }]]);
    a.handleBattleEvents([['fx', 'snow', 0, 0, { id: 1, tiles: 1, cells: [[4, 2, 3]] }]]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_swcvr.mp3'], 'only the _01 → _02 change');
    // a redeployment starts from no tiles (the client clears them as she leaves)
    a.played.length = 0;
    field(a, 'char_1046_sbell2');
    a.handleBattleEvents([['fx', 'snow', 0, 0, { id: 1, tiles: 1, cells: [[4, 2, 3]] }]]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_swcvr.mp3']);
    // 银灰's own 'snow' (his S2) is no tile refresh
    assert.equal(signalFxKey('snow', { id: 1 }, () => ({ def: 'char_172_svrash' })), null);
  });

  test('티티 S3 wake-up on an enemy; 글래디아\'s own wake is none', () => {
    const units = new Map([[2, { def: 'enemy_1006_shield', side: 'enemy' }], [1, { def: 'char_4056_titi', side: 'ally' }]]);
    assert.equal(signalFxKey('wake', { id: 2 }, (id) => units.get(id)), 'titi:awake');
    assert.equal(signalFxKey('wake', { id: 1 }, (id) => units.get(id)), null);
    const a = manager();
    field(a, 'char_4056_titi', 2);
    a.handleBattleEvents([['fx', 'wake', 0, 0, { id: 2, scale: 1.5 }]]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_sdycrtlswk.mp3']);
  });

  test('real match path: 아스카론 S2 — an enemy killed in her range sends kitHit ascln:s2bomb (its sound)', async () => {
    const { makeMatch } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const T6 = 'chess_char_6_diy1_a';
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: { charId: 'char_4132_ascln', skillIndex: 1, uniEquipId: null } } }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const w = ps.acquireChess(T6, { source: 'buy' });
    const { legalTileFor } = await import('./match/harness.js');
    const tile = legalTileFor(m, ps, T6);
    assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: tile[0], col: tile[1] }, dir: 'RIGHT' }).ok);
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const a = manager();
    const ev = [];
    while (!b.finished && b.time < 120 && !ev.some((e) => e[0] === 'fx' && e[1] === 'kitHit' && e[4]?.k === 'ascln:s2bomb')) { b.step(); const d = b.drainEvents(); ev.push(...d); }
    const hit = ev.find((e) => e[0] === 'fx' && e[1] === 'kitHit' && e[4]?.k === 'ascln:s2bomb');
    assert.ok(hit, 'a kill under her S2');
    const u = b.allyUnits.find((x) => x.kind === 'op');
    assert.equal(hit[4].id, u.id, 'at her');
    a.setFieldUnits([]);
    a.handleBattleEvents([hit]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_smksndrtbf.mp3']);
  });
});

// 2026-10-11 user report (docs/rules/audio.md 「지속 피해 틱」): during 아스카론's S2 the ticks of her 死亡拘审 (talent DoT,
// client buff ascln_t_1[debuff]: DamageViaAttr on ON_BUFF_TRIGGER — no PlayAudio, no audioSignal) sounded her S2 attack impact
// p_imp_smksndrt_h as a skill impact. A DoT tick is flagged by the sim ('dmg' 7th field) and plays nothing.
describe('damage-over-time ticks (the \'dmg\' 7th field)', () => {
  test('a DoT tick credited to its applier plays no impact; the same damage without the flag still does', () => {
    const a = manager();
    field(a, 'char_4132_ascln', 1);
    a.handleBattleEvents([['skill', 1, 1]]);
    a.played.length = 0;
    a.handleBattleEvents([['dmg', 2, 80, 'arts', 0, 1, 1]]);
    assert.deepEqual(a.played, [], 'her 死亡拘审 tick under S2: silent');
    a.handleBattleEvents([['dmg', 2, 300, 'arts', 0, 1, 0]]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_smksndrt_h.mp3'], 'a skill\'s own damage (no attack) keeps its impact');
  });

  test('a DoT tick does not take the impact of the attack aimed at that target', () => {
    const a = manager();
    field(a, 'char_4132_ascln', 0);
    a.handleBattleEvents([['swing', 1, 0.3, 'none'], ['atk', 1, 2, 'none']]);
    a.played.length = 0;
    a.handleBattleEvents([['dmg', 2, 80, 'arts', 0, 1, 1]]);
    assert.deepEqual(a.played, [], 'the tick');
    a.handleBattleEvents([['dmg', 2, 300, 'arts', 0, 1, 0]]);
    assert.deepEqual(a.played.map((p) => p.f), ['p_imp_smksndrt_n.mp3'], 'the attack\'s own impact still sounds');
  });

  test('real match path: 아스카론 S2 — her 死亡拘审 ticks carry the flag, her attacks do not, the ticks play nothing', async () => {
    const { makeMatch, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const T6 = 'chess_char_6_diy1_a';
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: { charId: 'char_4132_ascln', skillIndex: 1, uniEquipId: null } } }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const w = ps.acquireChess(T6, { source: 'buy' });
    const tile = legalTileFor(m, ps, T6);
    assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: tile[0], col: tile[1] }, dir: 'RIGHT' }).ok);
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const u = b.allyUnits.find((x) => x.kind === 'op');
    const ticks = [], hits = [];
    b.on('damaged', (c) => { if (c.source === u) (c.dmg?.tags?.includes('dot') ? ticks : hits).push(c); });
    const ev = [];
    while (!b.finished && b.time < 120 && !(ticks.length >= 3 && u.skill?.active)) { b.step(); ev.push(...b.drainEvents()); }
    assert.ok(ticks.length >= 3 && hits.length > 0, 'her attacks and 死亡拘审 ticks');
    const mine = ev.filter((e) => e[0] === 'dmg' && e[5] === u.id);
    assert.ok(mine.some((e) => e[6] === 1) && mine.some((e) => e[6] === 0), 'ticks flagged 1, attacks 0');
    const a = manager();
    a.setFieldUnits([{ id: u.id, kind: 'op', side: 'ally', spine: 'char_4132_ascln', defId: u.def?.id, skillIndex: 1 }]);
    a.handleBattleEvents([['skill', u.id, 1]]);
    a.played.length = 0;
    a.handleBattleEvents(mine.filter((e) => e[6] === 1));
    assert.deepEqual(a.played, [], 'no tick sounds');
  });
});

// 2026-10-16, decompile check (docs/rules/audio.md 「연쇄 공격 소리」): a chain shot's HIT sounds at every unit it strikes
// (Projectile.OnHitTarget), its REACH once at the first (cue `r`), its chain sound (ON_PROJECTILE_BEHAVIOUR_TRIGGER, cue
// 'c') once per chain of two units or more (ChainLightningHitBehaviour.PlayChainAudio)
describe('a chain shot\'s sounds', () => {
  const chainField = (a, op) => a.setFieldUnits([
    { id: 1, kind: 'op', side: 'ally', spine: op, defId: 'chess_x', skillIndex: 1 },
    ...[2, 3, 4].map((id) => ({ id, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' })),
  ]);
  const shot = [['swing', 1, 0.3, 'bolt'], ['atk', 1, 2, 'bolt'], ['dmg', 2, 100, 'arts', 0, 1]];
  const hops = [['atk', 2, 3, 'chain'], ['dmg', 3, 85, 'arts', 0, 1], ['atk', 3, 4, 'chain'], ['dmg', 4, 72, 'arts', 0, 1]];

  test('the manifest: 惊蛰\'s REACH once, her chain sound per mode', () => {
    const l = UNITS.char_306_leizi;
    assert.deepEqual(files(l.cues.filter((c) => c.at === 'd' || c.at === 'c')), ['d:p_imp_elecmag_n.mp3', 'c:p_imp_elecmag_n_combine.mp3']);
    assert.equal(l.cues.find((c) => c.at === 'd').r, 1, 'ON_PROJECTILE_REACH');
    assert.deepEqual(files(l.modes[1].cues), ['d:p_imp_elecmag_s.mp3', 'c:p_imp_elecmag_s_combine.mp3']);
    const p = UNITS.char_472_pasngr;
    assert.ok(!p.cues.some((c) => c.at === 'c' || c.r), '异客: ON_PROJECTILE_HIT, no chain bank');
  });

  test('惊蛰: one REACH at the first unit, one chain sound for the bounces', () => {
    const a = manager();
    chainField(a, 'char_306_leizi');
    a.handleBattleEvents([...shot, ...hops]);
    assert.deepEqual(a.played.map((p) => p.f).filter((f) => f.startsWith('p_imp')), ['p_imp_elecmag_n.mp3', 'p_imp_elecmag_n_combine.mp3']);
    a.played.length = 0;
    a.handleBattleEvents(shot);
    assert.ok(!a.played.some((p) => /combine/.test(p.f)), 'a shot that bounces nowhere has no chain sound');
  });

  test('异客: the HIT at every unit, no chain sound', () => {
    const a = manager();
    chainField(a, 'char_472_pasngr');
    a.handleBattleEvents([...shot, ...hops]);
    assert.deepEqual(a.played.map((p) => p.f).filter((f) => f.startsWith('p_imp')), ['p_imp_thunder_n.mp3', 'p_imp_thunder_n.mp3', 'p_imp_thunder_n.mp3']);
  });
});
