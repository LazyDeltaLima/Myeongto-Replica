// test/audio-bond-block-sounds.test.js — two sounds of the client's buff graphs (2026-10-30, docs/rules/audio.md
// 「버프·커스텀 트리거 소리」): 叙拉古 [ex]'s proc (act2autochess_bond_eff_siracusa[ex][buff] PlayAudio siracusa_ex_attack on
// the target, after its effect — the sim's fx 'bondProc') and a hit a block layer stops whole (BlockDamage.Execute plays
// ON_DAMAGE_BLOCK at the holder with its block effect — the sim's fx 'parry'; a barrier layer the hit broke through,
// `whole` 0, plays neither). The committed data/assets.json predates these keys: the manifest here is it plus the keys
// built from the official audio_data.json by the generator (tools/assets/kit-sfx.mjs kitHitSfx).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, kitHitKey } from '../public/js/audio.js';
import { KIT_HIT_BANKS, kitHitSfx } from '../tools/assets/kit-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { makeBattle, chessRec, enemyRec } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const file = (u) => String(u).split('/').pop();

let built = null;
function manifest() {
  if (built) return built;
  const m = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
  Object.assign(m.audio.sfx.kit, kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => `/assets/audio/sfx/${file(p[0])}`));
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

describe('叙拉古 [ex] proc and a blocked hit', () => {
  test('the banks', { skip: NO_DATA }, () => {
    const out = kitHitSfx(indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))), (p) => p);
    assert.equal(KIT_HIT_BANKS['siracusa:ex'], 'battle.ON_CUSTOM_TRIGGER.siracusa_ex_attack');
    assert.equal(KIT_HIT_BANKS.block, 'battle.ON_DAMAGE_BLOCK');
    assert.equal(file(out['siracusa:ex'][0]), 'a_bat_xscthrtcl.mp3');
    assert.equal(file(out.block[0]), 'e_atk_soldiershield.mp3');
  });

  test('the keys (pure): the 叙拉古 proc only; every whole block, not a barrier break the hit went through', () => {
    const none = () => undefined;
    assert.equal(kitHitKey('bondProc', { id: 2, src: 'bond:siracusaShip', key: 'assassin', from: 1, amount: 300 }, none), 'siracusa:ex');
    assert.equal(kitHitKey('bondProc', { id: 2, src: 'bond:other' }, none), null);
    assert.equal(kitHitKey('parry', { id: 2, buff: 'talent:archet_shield' }, none), 'block', 'a counted shield layer');
    assert.equal(kitHitKey('parry', { id: 2, buff: 'ab:artsBarrier[1]', whole: 1, broke: 0 }, none), 'block');
    assert.equal(kitHitKey('parry', { id: 2, buff: 'ab:artsBarrier[1]', whole: 1, broke: 1 }, none), 'block');
    assert.equal(kitHitKey('parry', { id: 2, buff: 'ab:artsBarrier[1]', whole: 0, broke: 1 }, none), null);
  });

  test('the audio manager plays them', { skip: NO_DATA }, () => {
    const a = manager();
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', spine: 'char_1_x', defId: 'x' }, { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' }]);
    a.handleBattleEvents([['fx', 'bondProc', 0, 0, { id: 2, src: 'bond:siracusaShip', key: 'assassin', from: 1, amount: 300 }]]);
    assert.deepEqual(a.played, ['a_bat_xscthrtcl.mp3']);
    a.played.length = 0;
    a.handleBattleEvents([['fx', 'parry', 0, 0, { id: 1, buff: 'talent:archet_shield' }]]);
    assert.deepEqual(a.played, ['e_atk_soldiershield.mp3']);
  });

  test('a 叙拉古 6 battle: one proc sound per proc', { skip: NO_DATA }, () => {
    const ops = {};
    for (let i = 0; i < 6; i++) {
      ops[`r${i}`] = chessRec({
        id: `r${i}`, profession: 'WARRIOR', bonds: ['siracusaShip'], tier: 1, rangeGrid: [[0, 0], [0, 1]],
        stats: { maxHp: 2000, atk: 500, def: 200, res: 0, aspd: 100, bat: 1, respawnTime: 20, spRecovery: 1, blockCnt: 2 },
        skill: { spCost: 60, duration: 5, initSp: 0 },
      });
    }
    const units = Object.keys(ops).map((id, i) => ({ chessId: id, row: 9 + Math.floor(i / 3), col: 3 + 2 * (i % 3) }));
    const h = makeBattle({
      defs: { chess: ops, enemies: { e_d: enemyRec({ key: 'e_d', hp: 1e8, speed: 0, def: 0, res: 0 }) } }, units,
      bonds: { siracusaShip: { count: 6, active: true, tier: 2, layers: 20 } },
      enemies: [{ key: 'e_d', pos: [12, 9] }], timeLimit: 999, autoFinish: false, hooks: ['damaged'], captureNoisy: true,
    });
    h.step(1);
    const r0 = h.unit('r0'), e = h.b.enemies.find((x) => x.alive);
    for (let i = 0; i < 750; i++) h.b.dealDamage(r0, e, { amount: 1, type: 'phys', isAttack: true });
    const procs = h.hooksOf('damaged').filter((c) => c.dmg?.tags?.includes('bond:siracusa')).length;
    assert.ok(procs >= 1);
    const a = manager();
    a.setFieldUnits([...h.b.allyUnits, ...h.b.enemies].map((u) => ({ id: u.id, kind: u.side === 'enemy' ? 'enemy' : 'op', side: u.side, spine: 'x', defId: 'x' })));
    a.handleBattleEvents(h.eventsOf('fx'));
    assert.equal(a.played.filter((f) => f === 'a_bat_xscthrtcl.mp3').length, procs);
  });
});
