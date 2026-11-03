// test/audio-diy-pick-sounds.test.js — the custom-trigger and buff sounds of the 선발 picks 白铁 / 遥 / 真言 (2026-11-03,
// docs/rules/audio.md 「버프·커스텀 트리거 소리」; EN client buff templates and prefabs): 铁钳号·原型机's skill START and its
// projectile REACH, 遥's bubble given / breaking, S3's levitation and its ticks, S2's extra damage at each healed unit
// (enemies or none), 真言's 侵入点 mark, each S1 / S2 hit by its 神经 burst branch and each S3 溢出麻痹 bounce hit; 斥罪 S2's
// pulse on each enemy, 逻各斯 S1's execution and follow-up shot, T1's shot leaving and landing; 薇薇安娜 S1's plain and 蓄力
// casts (skchr_vvana_1.1 / .2 by the swing signal), S3 from the second cast (mode 4 S3_2) and no start sound S3 lacks. The committed
// data/assets.json may predate these keys: the manifest here is it plus the keys built from the official audio_data.json
// (tools/assets/kit-sfx.mjs kitHitSfx).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, kitHitKey, signalFxKey } from '../public/js/audio.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { skillModes, loadCharModes, loadCharAudio } from '../tools/assets/skill-mode-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const file = (u) => String(u).split('/').pop();
const IRON = 'char_4072_ironmn', CRAB = 'token_10027_ironmn_pile3', HARUKA = 'char_4202_haruka', MANTRA = 'char_4204_mantra';
const JUDGE = 'char_4065_judge', LOGOS = 'char_4133_logos', VVANA = 'char_4098_vvana';
const SLOT5 = 'chess_char_5_diy1_a';
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, def: 0, res: 0, ...o });

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
  a._play = (url) => { a.played.push(file(url)); };
  a.voice = () => false;
  return a;
}
const kitHits = (h, k) => h.eventsOf('fx').filter((x) => x[1] === 'kitHit' && x[4]?.k === k);

describe('선발 白铁 / 遥 / 真言 custom-trigger sounds (2026-11-03)', () => {
  test('the banks', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    const want = {
      'ironmn:pile3s': 'p_atk_prototype_n', 'ironmn:pile3hit': 'p_imp_prototype_n',
      'haruka:t1': 'p_atk_gfshblcrt', 'haruka:break': 'p_imp_gfshblcrt', 'haruka:lev': 'p_atk_gfshblcrtb',
      'haruka:float': 'p_imp_gfshblcrtb_n', 'haruka:s2': 'p_imp_idgfshblm_h',
      'mantra:t2': 'p_skill_mtlscn', 'mantra:s1': 'p_imp_mtelrncpnt_d', 'mantra:s1el': 'p_imp_mtelrncpnth_d',
      'mantra:s2': 'p_imp_mtelrncpnt_h', 'mantra:s2el': 'p_imp_mtelrncpnth_h', 'mantra:s3': 'p_imp_mtelrncpnth_s',
    };
    for (const [k, f] of Object.entries(want)) {
      assert.ok(KIT_HIT_BANKS[k], k);
      assert.equal(file(out[k]?.[0]).replace(/\.\w+$/, ''), f, k);
    }
  });

  test('the fx events they follow (pure)', () => {
    const units = { 1: { def: HARUKA }, 2: { def: 'char_4010_aroma' }, 3: { def: MANTRA }, 4: { def: CRAB }, 5: { def: 'char_102_texas' }, 20: { def: 'enemy_1007_slime', side: 'enemy' } };
    const of = (id) => units[id];
    assert.equal(signalFxKey('shield', { id: 5, kind: 'bubble' }, of), 'haruka:t1');
    assert.equal(signalFxKey('shield', { id: 5 }, of), null, 'another shield');
    assert.equal(signalFxKey('levitate', { id: 20, src: 1 }, of), 'haruka:lev');
    assert.equal(signalFxKey('levitate', { id: 20, src: 2 }, of), null, 'another operator\'s levitation');
    assert.equal(signalFxKey('levitate', { id: 20 }, of), null);
    assert.equal(kitHitKey('aoe', { id: 1, skill: 'haruka:s2', n: 0 }, of), 'haruka:s2', 'with no enemy too');
    assert.equal(kitHitKey('aoe', { id: 4, skill: 'ironmn:crab' }, of), 'ironmn:pile3hit');
    assert.equal(signalFxKey('mantraGate', { id: 3 }, of), 'mantra:t2');
    assert.equal(signalFxKey('mantraArc', { id: 3, target: 20 }, of), 'mantra:s3');
    assert.equal(kitHitKey('kitHit', { id: 3, k: 'mantra:s2el' }, of), 'mantra:s2el');
  });

  test('the audio manager plays them', { skip: NO_DATA }, () => {
    const a = manager();
    a.setFieldUnits([
      { id: 1, kind: 'op', side: 'ally', spine: HARUKA }, { id: 3, kind: 'op', side: 'ally', spine: MANTRA },
      { id: 4, kind: 'token', side: 'ally', spine: CRAB }, { id: 5, kind: 'op', side: 'ally', spine: 'char_102_texas' },
      { id: 20, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' },
    ]);
    const heard = (ev) => { a.played.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
    assert.ok(heard([['fx', 'shield', 0, 0, { id: 5, kind: 'bubble' }]]).includes('p_atk_gfshblcrt.mp3'));
    assert.ok(heard([['fx', 'kitHit', 0, 0, { id: 5, src: 1, k: 'haruka:break', heal: 0 }]]).includes('p_imp_gfshblcrt.mp3'));
    assert.ok(heard([['fx', 'levitate', 0, 0, { id: 20, src: 1 }]]).includes('p_atk_gfshblcrtb.mp3'));
    assert.ok(heard([['fx', 'kitHit', 0, 0, { id: 1, k: 'haruka:float' }]]).includes('p_imp_gfshblcrtb_n.mp3'));
    assert.ok(heard([['fx', 'aoe', 0, 0, { id: 1, skill: 'haruka:s2', n: 0 }]]).includes('p_imp_idgfshblm_h.mp3'));
    assert.ok(heard([['fx', 'mantraGate', 0, 0, { id: 3 }]]).includes('p_skill_mtlscn.mp3'));
    assert.ok(heard([['fx', 'mantraArc', 0, 0, { id: 3, target: 20 }]]).includes('p_imp_mtelrncpnth_s.mp3'));
    assert.ok(heard([['fx', 'kitHit', 0, 0, { id: 3, k: 'mantra:s1el' }]]).includes('p_imp_mtelrncpnth_d.mp3'));
    assert.ok(heard([['skill', 4, 1]]).includes('p_atk_prototype_n.mp3'), '铁钳号·原型机\'s skill');
    assert.ok(heard([['fx', 'aoe', 0, 0, { id: 4, skill: 'ironmn:crab' }]]).includes('p_imp_prototype_n.mp3'));
  });

  test('a battle: 铁钳号·原型机\'s skill and its projectile\'s landing', () => {
    const h = makeBattle({
      defs: { enemies: { e_d: dummy('e_d') } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
      units: [{ uid: 1, diy: { slot: SLOT5, charId: IRON, skillIndex: 2, uniEquipId: null }, row: 12, col: 3 },
        { uid: 10, kind: 'token', tokenId: CRAB, ownerUid: 1, row: 10, col: 5, dir: 'RIGHT' }],
    });
    h.step();
    const c = h.b.allyUnits.find((x) => x.defId === CRAB);
    h.spawn('e_d', { pos: [10, 7] });
    c.skill.gainSp(99);
    assert.ok(h.runUntil(() => c.skill.activations === 1, 1), 'it casts');
    h.run(1);
    assert.ok(h.eventsOf('skill').some((x) => x[1] === c.id && x[2]), 'its skill event');
    assert.equal(h.eventsOf('fx').filter((x) => x[1] === 'aoe' && x[4]?.skill === 'ironmn:crab' && x[4].id === c.id).length, 1, 'one landing');
  });

  test('a battle: 遥 S3\'s levitation ticks (one kitHit each), S2\'s extra damage on a heal with no enemy near', () => {
    const run = (skill) => {
      const h = makeBattle({
        defs: { enemies: { e_d: dummy('e_d') } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
        hooks: ['damaged'], units: [{ uid: 1, diy: { slot: SLOT5, charId: HARUKA, skillIndex: skill, uniEquipId: null }, row: 10, col: 5 }],
      });
      h.step();
      return { h, u: h.unit(1) };
    };
    {
      const { h, u } = run(2);
      h.spawn('e_d', { pos: [10, 8] });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.active, 3), 'S3 on');
      const e = h.spawn('e_d', { pos: [12, 9] });
      h.b.addBuff(u, { key: 'haruka:bubble', source: u, data: { v: 0.3, atk: u.s.atk, heal: 0, prob: 0, sp: 0, boom: false } });
      h.b.dealDamage(e, u, { amount: 50, type: 'true' });
      const lev = h.eventsOf('fx').filter((x) => x[1] === 'levitate' && x[4]?.id === e.id);
      assert.equal(lev.length, 1);
      assert.equal(lev[0][4].src, u.id, 'its `src`');
      h.run(4);
      const ticks = kitHits(h, 'haruka:float');
      const dmg = h.hooksOf('damaged').filter((c) => c.target === e && c.dmg?.tags?.includes('haruka:float')).length;
      assert.ok(ticks.length >= 2 && ticks.every((x) => x[4].id === u.id), `a kitHit per tick (${ticks.length})`);
      assert.equal(ticks.length, dmg, 'one per damage tick');
      // the bubble the hit set off breaks 0.5 s later: haruka_t_1_delay's PlayAudio (the kit's kitHit, heal 0 too)
      const br = kitHits(h, 'haruka:break');
      assert.equal(br.length, 1, 'its break');
      assert.deepEqual([br[0][4].id, br[0][4].src], [u.id, u.id], 'at its holder, from her');
    }
    {
      const { h, u } = run(1);
      u.hp = u.s.maxHp * 0.5;
      u.skill.gainSp(999);
      assert.ok(u.skill.activate('test'));
      h.run(3);
      const s2 = h.eventsOf('fx').filter((x) => x[1] === 'aoe' && x[4]?.skill === 'haruka:s2');
      assert.ok(s2.length >= 1 && s2.every((x) => x[4].n === 0), `each heal, no enemy (${s2.length})`);
    }
  });

  test('a battle: 真言\'s S1 hit sounds its branch — normal, then 元素 on a target in its 神经 burst', () => {
    const h = makeBattle({
      defs: { enemies: { e_d: dummy('e_d') } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0 }, captureNoisy: true,
      units: [{ uid: 1, diy: { slot: SLOT5, charId: MANTRA, skillIndex: 0, uniEquipId: null }, row: 10, col: 5 }],
    });
    h.step();
    const u = h.unit(1);
    const e = h.spawn('e_d', { pos: [10, 7] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => kitHits(h, 'mantra:s1').length + kitHits(h, 'mantra:s1el').length > 0, 10), 'an S1 hit');
    const first = h.eventsOf('fx').find((x) => x[1] === 'kitHit' && /^mantra:s1/.test(x[4]?.k));
    assert.equal(first[4].k, e.findBuff('neuralBurst') ? 'mantra:s1el' : 'mantra:s1');
    assert.equal(first[4].id, u.id);
    h.b.addBuff(e, { key: 'neuralBurst', duration: 30, source: u });
    const n0 = kitHits(h, 'mantra:s1el').length;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => kitHits(h, 'mantra:s1el').length > n0, 10), 'in its burst: the element branch');
  });

  test('斥罪 S2\'s pulse on each enemy hit, 逻各斯\'s execution and shots: banks, keys, the audio manager', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    const want = { 'judge:s2hit': 'p_imp_gavel_h', 'logos:s1kill': 'p_imp_mgcqilpnfrc', 'logos:s1shot': 'p_atk_mgcqilpnfrcr', 'logos:t1shot': 'p_atk_exrmgcsht', 'logos:t1hit': 'p_imp_exrmgcsht' };
    for (const [k, f] of Object.entries(want)) assert.equal(file(out[k]?.[0]).replace(/\.\w+$/, ''), f, k);
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: JUDGE }, { id: 2, kind: 'op', side: 'ally', spine: LOGOS }, { id: 20, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' }]);
    const heard = (ev) => { a.played.length = 0; a.handleBattleEvents(ev); return [...a.played]; };
    assert.equal(heard([['fx', 'aoe', 0, 0, { id: 1, skill: 'judge:atonement', n: 3 }]]).filter((f) => f === 'p_imp_gavel_h.mp3').length, 2, 'each enemy, at most the bank\'s 2');
    assert.deepEqual(heard([['fx', 'aoe', 0, 0, { id: 1, skill: 'judge:atonement', n: 0 }]]), [], 'none hit: silent');
    assert.ok(heard([['fx', 'logosExecute', 0, 0, { id: 2, target: 20 }]]).includes('p_imp_mgcqilpnfrc.mp3'));
    assert.ok(heard([['fx', 'kitHit', 0, 0, { id: 2, src: 2, target: 20, k: 'logos:s1shot' }]]).includes('p_atk_mgcqilpnfrcr.mp3'));
    assert.ok(heard([['fx', 'kitHit', 0, 0, { id: 2, src: 2, target: 20, k: 'logos:t1shot' }]]).includes('p_atk_exrmgcsht.mp3'));
    assert.ok(heard([['fx', 'logosLexicon', 0, 0, { id: 2, target: 20 }]]).includes('p_imp_exrmgcsht.mp3'));
  });

  test('a battle: 斥罪 S2\'s pulse counts the enemies it hits; 逻各斯\'s follow-up shot leaves the executed enemy', () => {
    const enemies = { e_d: dummy('e_d') };
    {
      const h = makeBattle({ defs: { enemies }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0 }, captureNoisy: true,
        units: [{ uid: 1, diy: { slot: SLOT5, charId: JUDGE, skillIndex: 1, uniEquipId: null }, row: 10, col: 5 }] });
      h.step();
      const u = h.unit(1);
      h.spawn('e_d', { pos: [10, 6] }); h.spawn('e_d', { pos: [9, 5] });
      u.skill.gainSp(999, 'init');
      assert.ok(h.runUntil(() => u.skill.active, 3), 'S2 on');
      h.run(2.5);
      const p = h.eventsOf('fx').filter((x) => x[1] === 'aoe' && x[4]?.skill === 'judge:atonement');
      assert.ok(p.length >= 1 && p.every((x) => x[4].n === 2), `each pulse: both enemies (${p.map((x) => x[4].n)})`);
    }
    {
      const h = makeBattle({ defs: { enemies }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0 }, captureNoisy: true,
        units: [{ uid: 1, diy: { slot: SLOT5, charId: LOGOS, skillIndex: 0, uniEquipId: null }, row: 10, col: 5 }] });
      h.step();
      const u = h.unit(1);
      u.skill.gainSp(999);
      assert.ok(u.skill.activate('test'));
      const low = h.spawn('e_d', { pos: [10, 7] });
      low.hp = 1;
      const other = h.spawn('e_d', { pos: [9, 6] });
      h.step();
      assert.ok(!low.alive, 'executed');
      assert.equal(h.eventsOf('fx').filter((x) => x[1] === 'logosExecute' && x[4]?.target === low.id).length, 1);
      const shot = kitHits(h, 'logos:s1shot');
      assert.equal(shot.length, 1, 'its follow-up shot');
      assert.deepEqual([shot[0][4].id, shot[0][4].src, shot[0][4].target], [u.id, u.id, other.id]);
    }
  });

  test('real match path (Match → buildBattleSpec → createBattleFromSpec): 真言\'s 侵入点 mark sounds as she deploys', { skip: NO_DATA }, async () => {
    const { makeMatch } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const T6 = 'chess_char_6_diy1_a';
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: { charId: MANTRA, skillIndex: 0, uniEquipId: null } } }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(1);
    h.setStage('act2autochess_m04');
    const m = h.m, ps = h.ps('p_0');
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const t = ps.acquireChess(T6, { source: 'buy' });
    assert.ok(t && m.handle('p_0', { t: 'g.move', uid: t.uid, to: { area: 'board', row: 10, col: 7 }, dir: 'RIGHT' }).ok, 'on the board');
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const ev = [];
    while (b.waveT0 == null && !b.finished) { b.step(); ev.push(...b.drainEvents()); }
    const u = b.allyUnits.find((x) => x.kind === 'op' && x.def.charId === MANTRA);
    assert.ok(u, 'she is on the field');
    assert.ok(ev.some((x) => x[0] === 'fx' && x[1] === 'mantraGate' && x[4]?.id === u.id), 'her mark');
    const a = manager();
    a.setFieldUnits([{ id: u.id, kind: 'op', side: 'ally', spine: MANTRA }]);
    a.handleBattleEvents(ev.filter((x) => x[0] === 'fx'));
    assert.ok(a.played.includes('p_skill_mtlscn.mp3'), 'mantra_t_tile');
    assert.equal(b.errors.length, 0, JSON.stringify(b.errors[0]));
  });
});

describe('선발 薇薇安娜: S1\'s two casts, S3 from the second cast (2026-11-03)', () => {
  const VSKILLS = ['skchr_vvana_1', 'skchr_vvana_2', 'skchr_vvana_3'].map((skillId, index) => ({ index, skillId }));
  const bare = (u) => file(u).replace(/\.\w+$/, '');
  const cues = (set) => set.cues.map((c) => `${c.at}:${c.k ?? '-'}:${bare(c.u)}`);

  test('the builder: S1 sounds its ability\'s children (not the 蓄力 S1 mode), S3 its S3_2 from the second cast', { skip: NO_DATA }, () => {
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    const CM = loadCharModes(ROOT), CA = loadCharAudio(ROOT);
    const m = skillModes(audio, VVANA, VSKILLS, CM[VVANA], (p) => `/assets/audio/${p[0]}`, () => false, CA[VVANA]);
    assert.deepEqual(cues(m[0]), ['s:1:p_atk_shdswrd_dcast', 's:2:p_atk_lghtnswrd_n', 'a:2:p_atk_lghtnswrd_d', 'd:1:p_imp_shdswrd_d', 'd:2:p_imp_lghtnswrd_d'],
      'skchr_vvana_1.1 / .2');
    assert.deepEqual(m[0].sel, { attack: { n: 2, how: 'first', def: 1, sig: { vvanaCharged: 2 } } });
    assert.deepEqual(m[2].sub.vvanaS3Later.cues.map((c) => `${c.at}:${bare(c.u)}`), ['s:p_atk_shdswrd_s', 'd:p_imp_shdswrd_s'], 'attack.4');
  });

  test('a battle → the audio manager: plain S1, 蓄力 S1, the first and a later S3', { skip: NO_DATA }, () => {
    const enemies = { e_d: dummy('e_d') };
    const hear = (skill, prep, secs) => {
      const h = makeBattle({ defs: { enemies }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0 }, captureNoisy: true,
        units: [{ uid: 1, diy: { slot: SLOT5, charId: VVANA, skillIndex: skill, uniEquipId: null }, row: 10, col: 5 }] });
      h.step();
      const u = h.unit(1);
      prep(h, u);
      const a = manager();
      a.setFieldUnits([{ id: u.id, kind: 'op', side: 'ally', spine: VVANA, skillIndex: skill },
        ...h.enemies().map((e) => ({ id: e.id, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' }))]);
      h.events.length = 0;
      const all = [];
      let t = 0;
      for (let i = 0, n = Math.round(secs / h.b.dt); i < n; i++) {
        h.step();
        a.ctx.currentTime = (t += h.b.dt);
        const ev = h.events.splice(0);
        all.push(...ev);
        a.handleBattleEvents(ev);
      }
      return { u, of: (k) => all.filter((x) => x[0] === k), played: a.played.map((f) => f.replace(/\.\w+$/, '')) };
    };
    // plain: one charge — its first child
    const plain = hear(0, (h, u) => { u.skill.gainSp(u.skill.spCost); h.spawn('e_d', { pos: [10, 6] }); }, 0.6);
    assert.deepEqual(plain.played, ['p_atk_shdswrd_dcast', 'p_imp_shdswrd_d', 'p_imp_shdswrd_d'], 'plain cast: skchr_vvana_1.1, two hits');
    // 蓄力: both charges, the enemy 2 tiles ahead (the 3-2 range) — the swing names the second child
    const charged = hear(0, (h, u) => { u.skill.gainSp(999); h.step(); h.spawn('e_d', { pos: [10, 7] }); }, 0.6);
    assert.ok(charged.of('swing').some((x) => x[1] === charged.u.id && x[8] === 'vvanaCharged'), 'the swing signal');
    assert.deepEqual(charged.played, ['p_atk_lghtnswrd_n', 'p_atk_lghtnswrd_d', 'p_imp_lghtnswrd_d', 'p_imp_lghtnswrd_d', 'p_imp_lghtnswrd_d'],
      '蓄力 cast: skchr_vvana_1.2, three hits');
    // S3: no start bank of its own (not S1's), mode 3 the first time, mode 4 from the second
    const s3 = (later) => hear(2, (h, u) => { h.spawn('e_d', { pos: [10, 6] }); if (later) u.mem.vvanaS3Casts = 1; u.skill.gainSp(999); }, 2);
    const first = s3(false), again = s3(true);
    assert.ok(!first.played.includes('p_atk_shdswrd_dcast') && !again.played.includes('p_atk_shdswrd_dcast'), 'no S1 start at S3');
    assert.ok(first.played.includes('p_atk_lghtnswrd_s') && !first.played.includes('p_atk_shdswrd_s'), `first S3: S3_1 (${first.played})`);
    assert.equal(first.of('fx').filter((x) => x[1] === 'vvanaS3Later').length, 0);
    assert.equal(again.of('fx').filter((x) => x[1] === 'vvanaS3Later' && x[4]?.id === again.u.id).length, 1, 'the fx');
    assert.ok(again.played.includes('p_atk_shdswrd_s') && again.played.includes('p_imp_shdswrd_s') && !again.played.includes('p_atk_lghtnswrd_s'),
      `later S3: S3_2 (${again.played})`);
  });

  test('a listed skill with no start sound of its own sounds none, not the first skill\'s', () => {
    const a = new AudioManager({ win: null, getManifest: () => ({ audio: { sfx: { units: { x: { skill: '/a/s1.mp3', skills: { 0: '/a/s1.mp3' } }, y: { skill: '/a/y.mp3' } } } } }), random: () => 0 });
    a.ctx = { currentTime: 0 }; a.played = []; a._play = (url) => { a.played.push(file(url)); }; a.voice = () => false;
    assert.equal(a.unit('x', 'skill', 1, 2), false);
    assert.ok(a.unit('x', 'skill', 1, 0));
    assert.ok(a.unit('y', 'skill', 2, 2), 'no list: the unit\'s one skill sound');
    assert.deepEqual(a.played, ['s1.mp3', 'y.mp3']);
  });
});

describe('선발 贝洛内 / 维伊 / 怒潮凛冬 / Mon3tr: buff, custom-trigger and mode sounds (2026-11-03)', () => {
  const DEMETR = 'char_4037_demetr', VEEN = 'char_4226_veen', ZIMA = 'char_1051_headb2', MONSTR = 'char_4179_monstr';
  const PROSTS = 'token_10050_monstr_prosts';
  const bare = (u) => file(u).replace(/\.\w+$/, '');
  const skillsOf = (code) => [1, 2, 3].map((n, index) => ({ index, skillId: `skchr_${code}_${n}` }));
  /** A battle of `units`, then `prep`, then `secs` of steps fed to the audio manager as they come. */
  const hear = ({ units, rows = null, prep, secs, until = null }) => {
    const skill = units[0].diy.skillIndex;
    const h = makeBattle({ defs: { enemies: { e_d: dummy('e_d'), e_weak: dummy('e_weak', { hp: 1 }) } }, timeLimit: 900, autoFinish: false, seed: 5,
      flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true, ...(rows ? { flat: { rows } } : {}), units });
    h.step();
    const a = manager();
    const field = () => a.setFieldUnits([...h.b.allyUnits, ...h.b.enemies].filter((x) => x.alive || x === h.unit(1)).map((x) => (x.side === 'enemy'
      ? { id: x.id, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' }
      : { id: x.id, kind: x.kind === 'token' ? 'token' : 'op', side: 'ally', spine: x.def?.charId ?? x.defId, ...(x === h.unit(1) ? { skillIndex: skill } : null) })));
    prep(h, h.unit(1));
    field();
    h.events.length = 0;
    const all = [];
    let t = 0;
    for (let i = 0, n = Math.round(secs / h.b.dt); i < n && !(until && until(h)); i++) {
      h.step();
      a.ctx.currentTime = (t += h.b.dt);
      const ev = h.events.splice(0);
      all.push(...ev);
      a.handleBattleEvents(ev);
    }
    assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
    return { h, u: h.unit(1), fx: (k) => all.filter((x) => x[0] === 'fx' && x[1] === k).map((x) => x[4]), played: a.played.map((f) => f.replace(/\.\w+$/, '')) };
  };
  const count = (list, f) => list.filter((x) => x === f).length;

  test('the banks', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    const want = {
      'demetr:s2atk': 'p_atk_rdbrknclsfr_h', 'demetr:s3fly': 'p_atk_rdbrknclsflh', 'demetr:s3back': 'p_imp_rdbrknclsflh',
      'veen:store': 'p_skill_ergblb', 'veen:merge': 'p_skill_ergblr', 'veen:hit': 'p_imp_ergblb', 'veen:mhit': 'p_imp_ergblr',
      'veen:s2hit': 'p_imp_ergblb', 'veen:s2mhit': 'p_imp_ergblr', 'headb2:highland': 'p_imp_brhmxsprd',
      'monstr:s3move': 'p_atk_kxdtctmpr_s', 'monstr:s3back': 'p_atk_kxdtctmnd_s',
    };
    for (const [k, f] of Object.entries(want)) {
      assert.ok(KIT_HIT_BANKS[k], k);
      assert.equal(bare(out[k]?.[0]), f, k);
    }
  });

  test('the builder: 贝洛内 S3 and Mon3tr S3 attack in the mode their skill switches to (S3_Resapwn / S3_Reborn) from the first 【移动】', { skip: NO_DATA }, () => {
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    const CM = loadCharModes(ROOT), CA = loadCharAudio(ROOT);
    const cues = (set) => set.cues.map((c) => `${c.at}:${c.ab ?? '-'}:${c.k ?? '-'}:${bare(c.u)}`).sort();
    const d = skillModes(audio, DEMETR, skillsOf('demetr'), CM[DEMETR], (p) => `/assets/audio/${p[0]}`, () => false, CA[DEMETR]);
    assert.deepEqual(cues(d[2].sub.teleport), ['d:-:1:p_imp_rdbrkncls_s1', 'd:-:2:p_imp_rdbrkncls_s2', 's:-:1:p_atk_rdbrkncls_s', 's:-:2:p_atk_rdbrkncls_s'], 'attack.3.1 / .2');
    const m = skillModes(audio, MONSTR, skillsOf('monstr'), CM[MONSTR], (p) => `/assets/audio/${p[0]}`, () => false, CA[MONSTR]);
    assert.deepEqual([...new Set(m[2].sub.teleport.cues.map((c) => bare(c.u)))].sort(), ['p_atk_kxdtctm_s', 'p_imp_kxdtctm_s'], 'attack.4 / combat.4');
  });

  test('a battle: 贝洛内 S2 shots, S3 — the first 【移动】 silent, a FlyToTargetSecond and the 【返回】 sounding, S3_Resapwn attacks', { skip: NO_DATA }, () => {
    const unit = (skill) => [{ uid: 1, diy: { slot: SLOT5, charId: DEMETR, skillIndex: skill, uniEquipId: null }, row: 10, col: 5 }];
    const s2 = hear({ units: unit(1), secs: 3, prep: (h, u) => { h.spawn('e_d', { pos: [10, 8] }); u.skill.gainSp(999); } });
    assert.ok(s2.u.skill.activations >= 1, 'S2 cast');
    assert.ok(count(s2.played, 'p_atk_rdbrknclsfr_h') >= 2, `a sound each shot (${s2.played})`);
    let e1;
    const s3 = hear({ units: unit(2), secs: 40, until: (h) => h.unit(1).skill.activations && !h.unit(1).skill.active,
      prep: (h, u) => {
        e1 = h.spawn('e_d', { pos: [11, 7] });
        u.skill.gainSp(999);
        h.b.after(2, () => { h.b.kill(e1, null); h.spawn('e_d', { pos: [9, 6] }); });
      } });
    const tp = s3.fx('teleport').filter((o) => o.id === s3.u.id).map((o) => (o.back ? 'back' : o.second ? 'second' : 'first'));
    assert.deepEqual(tp, ['first', 'second', 'back']);
    assert.equal(count(s3.played, 'p_atk_rdbrknclsflh'), 1, 'FlyToTargetSecond');
    assert.equal(count(s3.played, 'p_imp_rdbrknclsflh'), 1, 'RespawnEnd');
    assert.ok(s3.played.includes('p_atk_rdbrkncls_s') && s3.played.some((f) => /^p_imp_rdbrkncls_s[12]$/.test(f)), `S3_Resapwn attacks (${s3.played})`);
    assert.ok(!s3.played.includes("p_atk_rdbrkncls_n"), `not the S3 / Default mode's (${s3.played})`);
  });

  test('a battle: 维伊 stores (the third a merge), her stored energies landing; under S2 its projectiles', { skip: NO_DATA }, () => {
    const unit = (skill) => [{ uid: 1, diy: { slot: SLOT5, charId: VEEN, skillIndex: skill, uniEquipId: null }, row: 10, col: 5 }];
    const stored = (u) => ({ s: u.trait.veen?.s ?? 0, t: u.trait.veen?.t ?? 0 });
    const plain = hear({ units: unit(0), secs: 30, until: (h) => stored(h.unit(1)).t === 1 && stored(h.unit(1)).s === 1, prep: (h, u) => { u.skill.sp = 0; } });
    // (her first store came with the first step, before the manager listened)
    const st = plain.fx('mysticStore');
    assert.deepEqual(st.map((o) => o.merged ?? 0), [0, 1, 0], 'the third store of a deployment merges');
    assert.deepEqual([count(plain.played, 'p_skill_ergblb'), count(plain.played, 'p_skill_ergblr')], [2, 1], 'the normal signal, or the merge one instead');
    const shoot = hear({ units: unit(0), secs: 34, until: (h) => h.eventsOf('fx').some((x) => x[1] === 'veenVolley') && h.b.time > h.eventsOf('fx').find((x) => x[1] === 'veenVolley')[0] + 1,
      prep: (h, u) => { u.skill.sp = 0; h.b.after(25, () => h.spawn('e_d', { pos: [10, 7] })); } });
    const vs = shoot.fx('veenVolley'), sum = (k) => vs.reduce((n, v) => n + v[k], 0);
    assert.ok(sum('stored') > 0 && sum('merged') > 0, `volleys with both (${JSON.stringify(vs)})`);
    assert.equal(shoot.fx('kitHit').filter((o) => o.k === 'veen:hit').length, sum('stored'), 'one landing each stored energy');
    assert.equal(shoot.fx('kitHit').filter((o) => o.k === 'veen:mhit').length, sum('merged'), 'one landing each 转置能量');
    assert.ok(shoot.played.includes('p_imp_ergblb') && shoot.played.includes('p_imp_ergblr'), 'projectile_chr_veen / _merged HIT');
    // under S2: ChargeAttackS2's projectiles
    const s2 = hear({ units: unit(1), secs: 40, until: (h) => h.eventsOf('fx').some((x) => x[1] === 'veenVolley' && x[4]?.s2) && h.eventsOf('fx').some((x) => x[1] === 'kitHit' && /^veen:s2/.test(x[4]?.k)),
      prep: (h, u) => { u.skill.sp = 0; h.b.after(25, () => { u.skill.gainSp(999); h.spawn('e_d', { pos: [10, 7] }); }); } });
    assert.ok(s2.fx('kitHit').some((o) => /^veen:s2m?hit$/.test(o.k)) && !s2.fx('kitHit').some((o) => /^veen:m?hit$/.test(o.k)), 'S2 keys only');
  });

  test('a battle: 怒潮凛冬\'s 高台 splash sounds at the 高台 tile, with or without an enemy there', { skip: NO_DATA }, () => {
    const units = [{ uid: 1, diy: { slot: SLOT5, charId: ZIMA, skillIndex: 0, uniEquipId: null }, row: 10, col: 5 }];
    const r = hear({ units, rows: { 11: '##hrrrr#rrfrrrrrrrf##' }, secs: 3, until: (h) => h.eventsOf('fx').some((x) => x[1] === 'aoe' && x[4]?.skill === 'headb2:highland'),
      prep: (h, u) => { u.skill.sp = 0; h.spawn('e_d', { pos: [10, 6] }); } });
    const a = r.fx('aoe').filter((o) => o.skill === 'headb2:highland');
    assert.ok(a.length >= 1 && r.h.enemies().every((e) => Math.round(e.y) !== 11 && Math.round(e.y) !== 12), 'a 高台 taking effect with nobody on its x-5');
    assert.equal(count(r.played, 'p_imp_brhmxsprd'), a.length, 'each one sounds, enemies or none');
  });

  test('a battle: Mon3tr S3 — the move onto her 重构体, S3_Reborn attacks on the enemy she blocks, the return', { skip: NO_DATA }, () => {
    const units = [{ uid: 1, diy: { slot: SLOT5, charId: MONSTR, skillIndex: 2, uniEquipId: null }, row: 10, col: 4 },
      { uid: 2, kind: 'token', tokenId: PROSTS, ownerUid: 1, row: 10, col: 6 }];
    const r = hear({ units, secs: 40, until: (h) => h.unit(1).skill.activations && !h.unit(1).skill.active,
      prep: (h, u) => { h.spawn('e_d', { pos: [10, 5] }); u.skill.gainSp(999); } });
    assert.deepEqual(r.fx('teleport').filter((o) => o.id === r.u.id).map((o) => o.back ?? 0), [0, 1]);
    assert.equal(count(r.played, 'p_atk_kxdtctmpr_s'), 1, 'monstr_s_3[respawn]');
    assert.equal(count(r.played, 'p_atk_kxdtctmnd_s'), 1, 'RespawnEnd');
    assert.ok(r.played.includes('p_atk_kxdtctm_s') && r.played.includes('p_imp_kxdtctm_s'), `S3_Reborn attacks (${r.played})`);
  });

  test('the fx events they follow (pure)', () => {
    const units = { 1: { def: DEMETR }, 2: { def: VEEN }, 3: { def: ZIMA }, 4: { def: MONSTR }, 5: { def: 'char_1052_kalts2' } };
    const of = (id) => units[id];
    assert.equal(signalFxKey('teleport', { id: 1 }, of), null, 'FlyToTarget: no bank');
    assert.equal(signalFxKey('teleport', { id: 1, second: 1 }, of), 'demetr:s3fly');
    assert.equal(signalFxKey('teleport', { id: 1, back: 1 }, of), 'demetr:s3back');
    assert.equal(signalFxKey('teleport', { id: 4 }, of), 'monstr:s3move');
    assert.equal(signalFxKey('teleport', { id: 4, back: 1 }, of), 'monstr:s3back');
    assert.equal(signalFxKey('mysticStore', { id: 2, n: 1 }, of), 'veen:store');
    assert.equal(signalFxKey('mysticStore', { id: 2, n: 3, merged: 1 }, of), 'veen:merge');
    assert.equal(signalFxKey('mysticStore', { id: 5, n: 1 }, of), null, 'another 秘术师');
    assert.equal(kitHitKey('aoe', { id: 3, skill: 'headb2:highland' }, of), 'headb2:highland');
    assert.equal(kitHitKey('aoe', { id: 3, skill: 'headb2:hammer' }, of), null);
  });
});
