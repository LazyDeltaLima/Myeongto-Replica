// test/audio-buff-trigger-sounds.test.js — buff / custom-trigger sounds of 2026-11-03 (docs/rules/audio.md 「버프·커스텀 트리거
// 소리」, EN client buff templates and charpack prefabs): 魔王's 微尘 HIT / cooldown_ready, 维什戴尔 S2's 过载, 菲莱 S2's blast and
// each enemy of it, 缇缇 S3's sleep spreading and T1's tick on a sleeping enemy, 蕾缪安's attack end (0.76 s after the strike),
// 风丸's 折纸生花 (T.1), 缪尔赛思 S3 on a ranged 流形, a redeployed operator's 凛御银灰 S2 slash. The committed data/assets.json
// may predate these keys: the manifest here is it plus the keys built from the official audio_data.json
// (tools/assets/kit-sfx.mjs kitHitSfx).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AudioManager, kitHitKey, signalFxKey, cetsyrMoteKey, motesBack, aoeHitKey, strikeAfterKey, mlyssS3Range,
} from '../public/js/audio.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const file = (u) => String(u).split('/').pop();
const CETSYR = 'char_4134_cetsyr';

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

describe('buff / custom-trigger sounds (2026-11-03)', () => {
  test('the banks', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    const want = {
      'cetsyr:hit': 'p_imp_tpartclhel_n', 'cetsyr:hit1': 'p_imp_tpartclhel_n', 'cetsyr:hit2': 'p_imp_tpartcldmge_h',
      'cetsyr:hit3': 'p_imp_tpartclhel_s', 'cetsyr:ready': 'p_atk_tpartclhelbrn', 'cetsyr:ready1': 'p_atk_tpartclhelbrn',
      'cetsyr:ready2': 'p_atk_tpartcldmgebrn', 'wisdel:s2ovs': 'p_atk_dkmrcayvld', 'philae:aoe': 'p_atk_hrnshld_h',
      'philae:aoehit': 'p_imp_hrnshld_h', 'titi:spread': 'p_imp_sdycrtlslnk', 'titi:t1': 'p_imp_sdycrtlsp',
      'lemuen:atkend': 'p_atk_lmwlcrstrd', 'kazema:t1': 'p_skill_brightenswordborn', 'kazema:t1token': 'p_skill_brightenswordborn_token',
      'mlyss:s3range': 'p_skill_wtrlimesplit', 'svash2:range': 'p_atk_snwsrd_h', 'svash2:s2redhit': 'p_imp_snwlprdg_h',
    };
    for (const [k, f] of Object.entries(want)) {
      assert.ok(KIT_HIT_BANKS[k], k);
      assert.equal(file(out[k]?.[0]).replace(/\.\w+$/, ''), f, k);
    }
  });

  test('魔王\'s 微尘: the running skill\'s projectile, a return only within one cap and look', () => {
    const u = (o) => ({ def: CETSYR, ...o });
    assert.equal(cetsyrMoteKey(u({ skillOn: false, skillIndex: 2 }), 'hit'), 'cetsyr:hit');
    assert.equal(cetsyrMoteKey(u({ skillOn: true, skillIndex: 0 }), 'hit'), 'cetsyr:hit1');
    assert.equal(cetsyrMoteKey(u({ skillOn: true, skillIndex: 1 }), 'ready'), 'cetsyr:ready2');
    assert.equal(cetsyrMoteKey(u({ skillOn: true, skillIndex: 2 }), 'hit'), 'cetsyr:hit3');
    assert.equal(cetsyrMoteKey(u({ skillOn: true, skillIndex: 2 }), 'ready'), null, 'S3\'s never leave');
    assert.equal(cetsyrMoteKey({ def: 'char_x' }, 'hit'), null);
    const me = u({});
    const seq = [[3, 3, 0], [1, 3, 0], [2, 3, 0], [3, 3, 0], [6, 6, 2], [4, 6, 2], [6, 6, 2], [3, 3, 0]].map(([n, cap, sk]) => motesBack(me, { n, cap, sk }));
    assert.deepEqual(seq, [0, 0, 1, 1, 0, 0, 2, 0]);
    const hero = { def: CETSYR, skillOn: false };
    assert.equal(kitHitKey('mote', { id: 5, src: 1 }, (id) => (id === 1 ? hero : { def: 'char_y' })), 'cetsyr:hit');
    assert.equal(kitHitKey('mote', { id: 1, src: 1 }, () => hero), null, 'S1\'s own cue at her');
  });

  test('the blasts\' enemies, 风丸, 维什戴尔, 蕾缪安, 缪尔赛思 (pure)', () => {
    const units = { 1: { def: 'char_4148_philae' }, 2: { def: 'char_1045_svash2' }, 3: { def: 'char_102_texas' }, 4: { def: 'char_4016_kazema' }, 5: { def: 'token_10022_kazema_shadow' } };
    const of = (id) => units[id];
    assert.equal(kitHitKey('aoe', { id: 1, skill: 'philae_2', n: 2 }, of), 'philae:aoe');
    assert.equal(aoeHitKey({ id: 1, skill: 'philae_2', n: 2 }, of), 'philae:aoehit');
    assert.equal(aoeHitKey({ id: 1, skill: 'philae_2', n: 0 }, of), null);
    assert.equal(kitHitKey('aoe', { id: 2, skill: 'svash2', n: 3 }, of), 'svash2:s2', 'his own slash');
    assert.equal(aoeHitKey({ id: 2, skill: 'svash2', n: 3 }, of), null, 'its hits are its ability\'s HIT');
    assert.equal(kitHitKey('aoe', { id: 3, skill: 'svash2', n: 3 }, of), 'svash2:range', 'a redeployed operator\'s');
    assert.equal(aoeHitKey({ id: 3, skill: 'svash2', n: 3 }, of), 'svash2:s2redhit');
    assert.equal(kitHitKey('aoe', { id: 4, skill: 'origami' }, of), 'kazema:t1');
    assert.equal(kitHitKey('aoe', { id: 5, skill: 'origami' }, of), 'kazema:t1token');
    assert.equal(signalFxKey('wisdelOverload', { id: 9, form: 'overload' }, () => ({ def: 'char_1035_wisdel' })), 'wisdel:s2ovs');
    const lem = (skillOn, skillIndex) => strikeAfterKey({ def: 'char_4193_lemuen', skillOn, skillIndex })?.key ?? null;
    assert.deepEqual([lem(false, 2), lem(true, 1), lem(true, 2)], ['lemuen:atkend', 'lemuen:atkend', null]);
    const tracked = new Map([[7, { tby: 6, tmode: 'Range' }], [8, { tby: 6, tmode: 'Melee' }]]);
    assert.equal(mlyssS3Range({ def: 'char_249_mlyss', skillIndex: 2 }, 6, tracked), true);
    assert.equal(mlyssS3Range({ def: 'char_249_mlyss', skillIndex: 1 }, 6, tracked), false, 'S2');
    tracked.get(7).gone = true;
    assert.equal(mlyssS3Range({ def: 'char_249_mlyss', skillIndex: 2 }, 6, tracked), false, 'its ranged copy is gone');
    tracked.set(9, { tby: 6, tmode: 'Range', split: true });
    assert.equal(mlyssS3Range({ def: 'char_249_mlyss', skillIndex: 2 }, 6, tracked), false, 'a split copy');
  });

  test('the audio manager plays them', { skip: NO_DATA }, () => {
    const a = manager();
    a.setFieldUnits([
      { id: 1, kind: 'op', side: 'ally', spine: 'char_4148_philae' }, { id: 2, kind: 'op', side: 'ally', spine: 'char_5_titi' },
      { id: 3, kind: 'op', side: 'ally', spine: CETSYR, skillIndex: 2 }, { id: 4, kind: 'op', side: 'ally', spine: 'char_4193_lemuen', skillIndex: 2 },
      { id: 6, kind: 'op', side: 'ally', spine: 'char_249_mlyss', skillIndex: 2 }, { id: 7, kind: 'token', side: 'ally', spine: 'token_10030_mlyss_wtrman' },
      { id: 20, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' },
    ]);
    const heard = (ev) => { a.played.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
    const ph = heard([['fx', 'aoe', 0, 0, { id: 1, skill: 'philae_2', n: 5 }]]);
    assert.deepEqual(ph.filter((f) => f.startsWith('p_imp_hrnshld_h')).length, 2, 'each enemy, at most the bank\'s 2');
    assert.ok(ph.includes('p_atk_hrnshld_h.mp3'));
    assert.deepEqual(heard([['fx', 'wake', 0, 0, { id: 20, scale: 1, to: [21] }]]).filter((f) => f.startsWith('p_imp_sdycrtlslnk')).length, 1);
    assert.deepEqual(heard([['fx', 'kitHit', 0, 0, { id: 2, k: 'titi:t1', n: 3 }]]).filter((f) => f.startsWith('p_imp_sdycrtlsp')).length, 2);
    assert.deepEqual(heard([['fx', 'kitHit', 0, 0, { id: 2, k: 'titi:spread', n: 1 }]]), ['p_imp_sdycrtlslnk.mp3'], 'a sleeping enemy killed');
    heard([['fx', 'motes', 0, 0, { id: 3, n: 1, cap: 3, sk: 0 }]]);
    assert.deepEqual(heard([['fx', 'motes', 0, 0, { id: 3, n: 3, cap: 3, sk: 0 }]]), ['p_atk_tpartclhelbrn.mp3', 'p_atk_tpartclhelbrn.mp3']);
    a.handleBattleEvents([['deploy', 3]]);
    assert.ok(!heard([['fx', 'motes', 0, 0, { id: 3, n: 3, cap: 3, sk: 0 }]]).includes('p_atk_tpartclhelbrn.mp3'), 'a new deployment');
    assert.ok(heard([['atk', 4, 20, 'ranged']]).some((f) => f.startsWith('p_atk_lmwlcrstrd') && f.includes('@')), 'later, its buff\'s end');
    a.handleBattleEvents([['fx', 'copy', 0, 0, { id: 7, src: 3, mode: 'Range', by: 6 }]]);
    assert.ok(heard([['skill', 6, 1]]).includes('p_skill_wtrlimesplit.mp3'));
  });

  test('a battle: 缇缇 T1 ticks once a second over the sleeping enemies (one kitHit, `n` of them)', () => {
    const h = makeBattle({
      defs: { enemies: { e_d: enemyRec({ key: 'e_d', hp: 1e8, speed: 0, def: 0, res: 0 }) } },
      units: [{ chessId: 'chess_char_5_02_a', row: 9, col: 3 }],
      enemies: [{ key: 'e_d', pos: [9, 6] }, { key: 'e_d', pos: [9, 7] }], timeLimit: 999, autoFinish: false, captureNoisy: true,
    });
    h.step(1);
    const tt = h.b.allyUnits.find((u) => u.def?.charId?.endsWith('_titi'));
    assert.ok(tt, 'she is on the field');
    for (const e of h.b.enemies) h.b.applyStatus(e, 'sleep', { duration: 30, source: tt });
    h.run(3.2);
    const hits = h.eventsOf('fx').filter((x) => x[1] === 'kitHit' && x[4]?.k === 'titi:t1');
    assert.ok(hits.length >= 2, `a tick a second (${hits.length})`);
    assert.ok(hits.every((x) => x[4].n === 2 && x[4].id === tt.id));
  });

  test('real match path (Match → buildBattleSpec → createBattleFromSpec): 魔王\'s 微尘 reach a neighbour and come back', { skip: NO_DATA }, async () => {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const at = legalTileFor(m, ps, 'chess_char_4_25_a');
    give(m, ps, 'chess_char_4_25_a', 'board', at);
    const next = legalTileFor(m, ps, 'chess_char_4_25_a');
    assert.ok(next && Math.abs(next[0] - at[0]) + Math.abs(next[1] - at[1]) === 1, 'a tile beside her');
    give(m, ps, 'chess_char_4_25_a', 'board', next);
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const ev = [];
    while (!b.finished && b.time < 20) { b.step(); ev.push(...b.drainEvents()); }
    const hers = b.allyUnits.filter((u) => u.def?.charId === CETSYR);
    assert.equal(hers.length, 2);
    const a = manager();
    a.setFieldUnits(b.allyUnits.map((u) => ({ id: u.id, kind: 'op', side: 'ally', spine: u.def?.charId, skillIndex: 2 })));
    a.handleBattleEvents(ev.filter((x) => x[0] === 'fx' || x[0] === 'skill'));
    assert.ok(a.played.includes('p_imp_tpartclhel_n.mp3'), 'a 微尘 reaching the other');
    assert.ok(a.played.includes('p_atk_tpartclhelbrn.mp3'), 'one back after its cool-down');
  });
});
