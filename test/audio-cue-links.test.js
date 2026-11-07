// test/audio-cue-links.test.js — the official sound signals wired from the linking sheet (docs/rules/audio.md 「공식 소리 신호 잇기」,
// tools/local-extract/link_sheet.py), each through a battle fed to the audio manager: how many times a file plays, not only whether one
// did. The start sound of a buff skill with attacks too (`deferStart`).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, kitHitKey } from '../public/js/audio.js';
import { field, cast } from './helpers/nextSeason.js';
import { readData, onBattleClock, sweepBattle } from './helpers/audio-sweep.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_DATA = !existsSync(path.join(ROOT, 'data', 'assets.json')) && 'no data/assets.json';
const manifest = NO_DATA ? null : readData('assets.json');
const stem = (u) => String(u).split('/').pop().replace(/\.\w+$/, '');
/** The file of a kit key: two keys can share one, so a case counts what it asks for through the key's own file. */
const fileOf = (k) => stem(manifest.audio.sfx.kit[k]);

function managerFor(h, u, skillIndex) {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.voice = () => false;
  const played = [];
  let now = 0;
  a._play = (url) => { played.push({ f: stem(url), t: now }); };
  a.setFieldUnits([...h.b.allyUnits, ...h.b.enemies].filter((x) => x.alive).map((x) => (x.side === 'enemy'
    ? { id: x.id, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' }
    : { id: x.id, kind: x.kind === 'token' ? 'token' : 'op', side: 'ally', spine: x.def?.charId ?? x.defId, ...(x === u ? { skillIndex } : null) })));
  return { a, played, at: (t) => { now = t; } };
}

/** Runs `secs` of game time; `act(t, u, h)` each tick. Returns the plays. */
function run(h, u, skillIndex, secs, act = () => {}) {
  const { a, played, at } = managerFor(h, u, skillIndex);
  return onBattleClock((tick) => {
    let t = 0;
    for (let i = 0, n = Math.round(secs / h.b.dt); i < n; i++) {
      act(t, u, h);
      h.step();
      tick(t += h.b.dt);
      a.ctx.currentTime = t;
      at(t);
      a.handleBattleEvents(h.events.splice(0));
    }
    return played;
  });
}

const count = (played, k) => { const f = fileOf(k); return played.filter((p) => p.f === f).length; };
/** Cast it once, at `at` s, as soon as it may. */
const castAt = (at) => { let done = false; return (t, u) => { if (!done && t >= at) { done = true; cast(u); } }; };
const pick = (charId, skill) => sweepBattle({ label: charId, skill, unit: { uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId, skillIndex: skill, uniEquipId: null }, row: 10, col: 5 } }, manifest);

describe('official sound signals of the linking sheet', { skip: NO_DATA }, () => {
  test('홈바운드: the throw at an enemy — no ON, its landing once, a tick a second, its stop once', () => {
    const { h, u } = field('chess_char_3_nhbound_b', { skill: 0 });
    h.spawn('enemy_dummy', { pos: [10, 6] });
    const played = run(h, u, 0, 28, castAt(1));
    assert.equal(count(played, 'hbound:s1on'), 0, 'HitEnemy has no ON bank');
    assert.equal(count(played, 'hbound:s1reach'), u.skill.activations, 'one landing a throw');
    assert.ok(count(played, 'hbound:s1stop') >= 1 && count(played, 'hbound:s1stop') <= u.skill.activations, 'one stop a throw that ended');
    assert.ok(count(played, 'hbound:s1dot') >= 5, `${count(played, 'hbound:s1dot')} ticks`);
  });

  test('홈바운드: no enemy in range — the throw at a tile sounds its ON once', () => {
    const { h, u } = field('chess_char_3_nhbound_b', { skill: 0 });
    const played = run(h, u, 0, 4, castAt(1));
    assert.equal(count(played, 'hbound:s1on'), 1);
    assert.equal(count(played, 'hbound:s1reach'), 1);
  });

  test('홈바운드 S2: only an enemy heavy enough ticks its sound', () => {
    const ticks = (key) => {
      const { h, u } = field('chess_char_3_nhbound_b', { skill: 1 });
      h.spawn(key, { pos: [10, 6] });
      return count(run(h, u, 1, 12, castAt(1)), 'hbound:s2dot');
    };
    assert.equal(ticks('enemy_light'), 0, 'a light enemy holds no hbound_s_2[heavy_damage]');
    assert.ok(ticks('enemy_heavy') >= 3, 'each tick of [heavy_damage]');
  });

  test('리프레사 S2: its ON once a cast, a landing for each shot', () => {
    const { h, u } = field('chess_char_2_nliesel_b', { skill: 1 });
    for (const pos of [[10, 5], [10, 6], [9, 6]]) h.spawn('enemy_dummy', { pos });
    const played = run(h, u, 1, 5, castAt(1));
    assert.equal(count(played, 'liesel:s2on'), 1);
    assert.ok(count(played, 'liesel:s2reach') >= 1, 'the landings (the bank\'s limit may hold some back)');
  });

  test('체르니 S2: FinalAttack\'s start once', () => {
    const { h, u } = field('chess_char_3_npianst_b', { skill: 1 });
    h.spawn('enemy_dummy', { pos: [10, 5] });
    const played = run(h, u, 1, 25, castAt(1));
    assert.equal(count(played, 'pianst:final'), 1);
  });

  test('브리지드 S2: a cut sounds once, whichever of its three prefabs `n` names', () => {
    const { h, u } = field('chess_char_3_nbrigid_b', { skill: 1 });
    const { a, played } = managerFor(h, u, 1);
    const f = fileOf('brigid:cut');
    for (const n of [1, 2, 3]) {
      played.length = 0;
      a.handleBattleEvents([['fx', 'kitHit', 0, 0, { id: u.id, src: u.id, k: 'brigid:cut', n }]]);
      assert.equal(played.filter((p) => p.f === f).length, 1, `n = ${n}`);
    }
  });

  test('미스 크리스틴 S2 and 그레이 더 라이트닝베어러 S2: the orb lands once and each tick sounds once, enemies or none', () => {
    const ch = (() => { const { h, u } = field('chess_char_2_nchrist_b', { skill: 1 }); h.spawn('enemy_dummy', { pos: [10, 6] }); return run(h, u, 1, 20, castAt(1)); })();
    assert.equal(count(ch, 'christ:s2reach'), 1);
    assert.ok(count(ch, 'christ:s2tick') >= 3, `${count(ch, 'christ:s2tick')} ticks`);
    const { h, u } = field('chess_char_2_ngreyy2_b', { skill: 1 });
    h.spawn('enemy_dummy', { pos: [10, 6] });
    const gr = run(h, u, 1, 16, castAt(1));
    assert.equal(count(gr, 'greyy2:s2on'), 1);
    assert.equal(count(gr, 'greyy2:s2reach'), 1);
    assert.ok(count(gr, 'greyy2:s2tick') >= 3, `${count(gr, 'greyy2:s2tick')} ticks`);
  });

  test('무스: 연격\'s two hits sound its own HIT, not the normal attack\'s', () => {
    const { h, u } = field('chess_char_1_nfrncat_b', { skill: 1 });
    const { a, played } = managerFor(h, u, 1);
    a.handleBattleEvents([['atk', u.id, 0, 'none', 'T.1']]);
    assert.equal(played.filter((p) => p.f === fileOf('frncat:t1hit')).length, 1);
  });

  test('미틈\'s and 로베르타\'s device moments reach their keys', () => {
    const units = new Map([[1, { def: 'char_4147_mitm' }], [2, { def: 'token_10037_mitm_trshrb' }], [3, { def: 'token_10018_robrta_mach' }], [4, { def: 'char_4228_closur' }], [5, { def: 'token_10066_closur_ourbase' }]]);
    const of = (id) => units.get(id);
    assert.equal(kitHitKey('aoe', { id: 1, skill: 'mitm:s1' }, of), 'mitm:s1');
    assert.equal(kitHitKey('mitmSkill', { id: 2 }, of), 'mitm:s2');
    assert.equal(kitHitKey('mitmReborn', { id: 2 }, of), 'mitm:reborn');
    assert.equal(kitHitKey('machRun', { id: 3, form: 'running' }, of), 'robrta:run');
    assert.equal(kitHitKey('machRun', { id: 3, form: 'rest' }, of), null, 'at rest: its running buff is off');
    assert.equal(kitHitKey('shield', { id: 9, src: 4 }, of), 'closur:s1block');
    assert.equal(kitHitKey('disappear', { id: 5 }, of), 'closur:fakedeath');
    assert.equal(kitHitKey('disappear', { id: 2 }, of), null, '미틈\'s car has no bank for it (trshrb_t_1[fakedeath])');
  });

  test('로베르타 S2: its end clip\'s ATTACK_FINISH once, not when she falls', () => {
    const { h, u } = field('chess_char_3_nrobrta_b', { skill: 1 });
    const { a, played } = managerFor(h, u, 1);
    const f = fileOf('robrta:s2end');
    a.handleBattleEvents([['skill', u.id, 1]]);
    a.handleBattleEvents([['skill', u.id, 0]]);
    assert.equal(played.filter((p) => p.f === f).length, 1);
    played.length = 0;
    a.handleBattleEvents([['skill', u.id, 1]]);
    a.handleBattleEvents([['skill', u.id, 0], ['die', u.id, 'killed']]);
    assert.equal(played.filter((p) => p.f === f).length, 0);
  });

  test('클로저: S2\'s range loop starts once, 0.6 s on, only with her 지휘 센터 up', () => {
    const { h, u, a, skillIndex } = pick('char_4228_closur', 1);
    const fx = () => h.eventsOf('fx').filter((e) => e[1] === 'kitHit' && e[4]?.k === 'closur:range2');
    assert.equal(skillIndex, 1);
    assert.ok(a);
    h.step();
    u.skill.gainSp(u.skill.spCost + 1, 'test');
    assert.ok(u.skill.activate('test'));
    assert.ok(h.runUntil(() => fx().length > 0, 2), 'the loop\'s start');
    assert.equal(fx().length, 1);
  });

  test('쏜즈 더 로드스타: T2\'s sound once as she deploys', () => {
    const { h } = sweepBattle({ label: 'thorn2', unit: { uid: 1, chessId: 'chess_char_5_15_b', row: 10, col: 5 } }, manifest);
    h.step();
    assert.equal(h.eventsOf('fx').filter((e) => e[1] === 'kitHit' && e[4]?.k === 'thorn2:t2').length, 1);
  });

  test('a start bank the mode never sounds plays at the cast, attacks or none; one its attack sounds still waits', () => {
    const U = manifest.audio.sfx.units;
    for (const [id, i] of [['char_193_frostl', 1], ['char_488_buildr', 1], ['char_4198_christ', 1], ['char_1027_greyy2', 1], ['char_103_angel', 1]]) {
      assert.ok(!U[id].modes[i].deferStart, `${id} S${i + 1}: its own start`);
    }
    assert.equal(U.char_4132_ascln.modes['0'].deferStart, true, '아스카론 S1: its attack sounds that file');
    const { h, u } = field('chess_char_1_nfrostl_b', { skill: 1 });
    h.spawn('enemy_dummy', { pos: [10, 5] });
    const played = run(h, u, 1, 6, castAt(1));
    assert.equal(played.filter((p) => p.f === 'b_char_atkboost').length, 1, '프로스트리프 S2\'s start once, with attacks running');
  });
});

