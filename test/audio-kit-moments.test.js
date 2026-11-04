// test/audio-kit-moments.test.js — sounds whose moment no sweep reaches, because they need something to happen to the unit
// (docs/rules/audio.md, 2026-11-05): 塔露拉's S2 retaliation (test/helpers/audio-sweep.js casts by hand and no enemy attacks) and
// 怒潮凛冬 S3 cut by a stun.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../public/js/audio.js';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'data', 'assets.json');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const skip = existsSync(ASSETS) ? false : 'no data/assets.json';
const manifest = skip ? null : JSON.parse(readFileSync(ASSETS, 'utf8'));
const leaf = (url) => String(url).split('/').pop().replace(/\.\w+$/, '');
const enemy = (key, o = {}) => enemyRec({ key, hp: 1e9, atk: 0, speed: 0, mass: 0, def: 0, res: 0, ...o });
const MS_PER_S = 500;

/** Run `secs` of battle `h` through a manager on a clock that goes with the battle; `each(t)` before every step. */
function listen(h, secs, each = () => {}) {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.voice = () => false;
  const clock = performance.now;
  let t = 0;
  performance.now = () => t * MS_PER_S;
  const log = [];
  a._play = (url) => { log.push({ t, f: leaf(url) }); };
  try {
    a.setFieldUnits(h.b.fieldMeta().units);
    a.handleBattleEvents(h.events.splice(0).filter((e) => e[0] === 'skill'));
    for (let i = 0, n = Math.round(secs / h.b.dt); i < n; i++) {
      each(t);
      h.step();
      a.ctx.currentTime = (t += h.b.dt);
      const ev = h.events.splice(0);
      log.push(...ev.filter((e) => e[0] === 'dmg' || e[0] === 'skill').map((e) => ({ t, ev: e })));
      a.handleBattleEvents(ev);
    }
  } finally {
    performance.now = clock;
  }
  return log;
}

describe('塔露拉 S2: her retaliation sounds the skill\'s own HIT', { skip }, () => {
  const C = 'char_4247_oxi', HIT = 'p_imp_xtlfgbwfb_h';
  const defs = { enemies: { dummy: enemy('dummy'), archer: enemy('archer', { atk: 300, bat: 2.3, range: 3, dmgType: 'arts' }) } };
  const field = () => {
    const h = makeBattle({ seed: 31, autoFinish: false, timeLimit: 300, defs, captureNoisy: true,
      units: [{ uid: 1, diy: { slot: 6, charId: C, skillIndex: 1 }, elite: true, potential: 6, row: 10, col: 3, dir: 'RIGHT' }] });
    h.step();
    h.unit(1).skill.charges = 5;
    return { h, u: h.unit(1) };
  };
  /** Each retaliation's moment: the 'dmg' events of her skill's hit, what sounded on them. */
  const strikes = (log, u) => {
    const casts = log.filter((x) => x.ev?.[0] === 'skill' && x.ev[1] === u.id && x.ev[2] === 0).map((x) => x.t);
    return casts.map((t) => ({ t, heard: log.filter((x) => x.f && Math.abs(x.t - t) < 1e-6).map((x) => x.f) }));
  };

  test('the manifest\'s kd[1] is the official ON_ABILITY_HIT.skchr_oxi_2', { skip: existsSync(OFFICIAL) ? false : 'no official audio table' }, () => {
    const banks = Object.values(JSON.parse(readFileSync(OFFICIAL, 'utf8')).soundFXBanks);
    const bank = banks.find((b) => b.name === 'battle.ON_ABILITY_HIT.skchr_oxi_2');
    assert.deepEqual(bank.sounds.map((s) => s.asset.split('/').pop()), [HIT]);
    assert.equal(leaf(manifest.audio.sfx.units[C].kd['1'][0].u), HIT);
  });

  test('away from her, on three enemies: once at each retaliation, no normal impact', () => {
    const { h, u } = field();
    h.spawn('archer', { pos: [10, 6] }); h.spawn('dummy', { pos: [10, 6.5] }); h.spawn('dummy', { pos: [10, 5.6] });
    const s = strikes(listen(h, 8), u);
    assert.ok(s.length >= 2, `${s.length} retaliations`);
    for (const x of s) {
      assert.equal(x.heard.filter((f) => f === HIT).length, 1, `at ${x.t}: ${x.heard}`);
      assert.deepEqual(x.heard.filter((f) => /^p_imp_xtlfgbw_/.test(f)), [], `at ${x.t}: ${x.heard}`);
    }
  });

  test('cutting her own swing: the skill\'s HIT, not that swing\'s impact', () => {
    const { h, u } = field();
    h.spawn('archer', { pos: [10, 4] });
    const log = listen(h, 3);
    const [first] = strikes(log, u);
    assert.ok(first && log.some((x) => x.f === 'p_atk_xtlfgbw_n' && x.t < first.t), 'a swing was under way');
    assert.equal(first.heard.filter((f) => f === HIT).length, 1, String(first.heard));
    assert.deepEqual(log.filter((x) => x.f && /^p_imp_xtlfgbw_/.test(x.f) && x.t <= first.t), [], 'the swing it cut lands no impact');
  });
});

describe('怒潮凛冬 S3: the hammers sound in turn, and a stun leaves no later one', { skip }, () => {
  const C = 'char_1051_headb2';
  const field = () => {
    const h = makeBattle({ seed: 17, autoFinish: false, timeLimit: 300, defs: { enemies: { dummy: enemy('dummy') } }, captureNoisy: true,
      units: [{ uid: 1, diy: { slot: 6, charId: C, skillIndex: 2 }, elite: true, potential: 6, row: 10, col: 5, dir: 'RIGHT' }] });
    h.step();
    h.spawn('dummy', { pos: [10, 6] });
    const u = h.unit(1);
    u.skill.gainSp(999);
    return { h, u };
  };
  const hammers = (log) => log.filter((x) => /^p_imp_brhmx_s\d$/.test(x.f ?? '')).map((x) => x.f);

  test('five hammers: p_imp_brhmx_s1 to s5, once each', () => {
    const { h, u } = field();
    assert.ok(h.runUntil(() => u.skill.active, 1));
    assert.deepEqual(hammers(listen(h, 10)), [1, 2, 3, 4, 5].map((n) => `p_imp_brhmx_s${n}`));
  });

  test('stunned after the second: its two, and nothing after the stun ends', () => {
    const { h, u } = field();
    assert.ok(h.runUntil(() => u.skill.active, 1));
    let stunned = false;
    const log = listen(h, 12, (t) => { if (!stunned && t > 3.5) { stunned = true; h.b.applyStatus(u, 'stun', { duration: 1.5, source: null }); } });
    assert.ok(stunned);
    assert.deepEqual(hammers(log), ['p_imp_brhmx_s1', 'p_imp_brhmx_s2']);
    assert.ok(log.some((x) => x.ev?.[0] === 'skill' && x.ev[1] === u.id && x.ev[2] === 0 && x.t < 4), 'the skill ended with the stun');
  });
});
