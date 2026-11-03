// test/audio-diy-pick-sounds.test.js — the custom-trigger and buff sounds of the 선발 picks 白铁 / 遥 / 真言 (2026-11-03,
// docs/rules/audio.md 「버프·커스텀 트리거 소리」; EN client buff templates and prefabs): 铁钳号·原型机's skill START and its
// projectile REACH, 遥's bubble given / breaking, S3's levitation and its ticks, S2's extra damage at each healed unit
// (enemies or none), 真言's 侵入点 mark, each S1 / S2 hit by its 神经 burst branch and each S3 溢出麻痹 bounce hit. The committed
// data/assets.json may predate these keys: the manifest here is it plus the keys built from the official audio_data.json
// (tools/assets/kit-sfx.mjs kitHitSfx).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, kitHitKey, signalFxKey } from '../public/js/audio.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const file = (u) => String(u).split('/').pop();
const IRON = 'char_4072_ironmn', CRAB = 'token_10027_ironmn_pile3', HARUKA = 'char_4202_haruka', MANTRA = 'char_4204_mantra';
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
