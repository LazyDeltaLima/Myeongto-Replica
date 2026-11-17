// test/audio-impact-sweep.test.js — every operator × skill on the battle path, fed to the audio manager (docs/rules/audio.md
// 「공격 소리 신호」, 2026-11-04). The client sounds an impact from an ability's or a projectile's HIT, never from damage as such; ours
// starts from the 'dmg' event, so damage that is no hit has sounded as one three times: 아스카론's DoT ticks (2026-10-11), the
// drones' additions (2026-10-29), Mon3tr S3's 流失 (2026-11-04, ten impacts a second). Tests of one operator asked "did her
// impact play" and passed. Here: damage that is no hit plays nothing, and no unit's skill-damage fallback runs like a tick.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readData, sweepCases, sweepBattle, onBattleClock, PASSIVE, backupOf } from './helpers/audio-sweep.js';
import { allSeasonData } from './helpers/seasonPicks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_DATA = !existsSync(path.join(ROOT, 'data', 'assets.json')) && 'no data/assets.json';
const SECS = 12;
/**
 * More fallback impacts than this in SECS seconds is a tick sounding as a hit, not a skill's strikes (Mon3tr S3's 流失: ten a
 * second, 120), unless the case is listed below. On a clock that follows the battle: a flat-out one squeezed every case under 2.
 */
const FALLBACK_MAX = 6;
/** The cases above it, what their fallback impacts are, and their most. An entry that no longer applies fails. */
const REPEATED = Object.freeze({
  'char_4009_irene S3': [10, 'strikes: the skill\'s run of slashes'],
  // (10: since its begin clip — skills.js _beginCast — the first slash comes as the skill starts, after the cast's 'skill' event)
  chess_char_6_19_b: [10, 'strikes: 锏 S3\'s run of slashes'],
  chess_char_3_20_b: [10, 'strikes: one each swing of 耶拉 S2'],
  // (chess_char_6_11_b, 缪尔赛思 S3, was listed at 12: her 流形 struck the same enemy between her shot and its landing. Her
  // begin clip — skills.js _beginCast — puts her swings on the 流形's tick, so her shot stays the last attacker: 1 now.)
  chess_char_4_03_b: [10, 'strikes: one each swing of 耶拉 S2'],
  chess_char_5_21_b: [23, 'strikes: 寒檀 S2\'s icicles, each an attack of hers landing (projectile_chr_sntlla_s2 REACH)'],
  // (a 规程 pick, on 规程's data: test/helpers/seasonPicks.js seasonPickList. ON_ABILITY_START.char_1041_angel2.attack.5.Burst
  // is no S3 bank: mode 5 is S1, its burst a hand stop this mode never makes — test/audio-bank-coverage-list.js)
  'char_1041_angel2 S3': [8, 'strikes: one each 5-hit attack of 新约能天使 S3 (its first the 投递坐标 splash)'],
  // (a 规程 backup operator, on 规程's data. Each tick the orb's SelectorHitBehaviour sounds its `_playAudioWhenSelect` — the kit's
  // christ:s2tick, ON_PROJECTILE_BEHAVIOUR_TRIGGER — then hits every enemy it finds, and Projectile.OnHitTarget sounds each hit's
  // ON_PROJECTILE_HIT: two banks a tick in the official client too, the hits of one tick one sound here (SKILL_HIT_GAP_MS))
  'act3autochess/chess_char_2_09_b': [12, 'strikes: each 1 s tick of 克里斯汀 S2\'s orb hitting, kd[1] p_imp_blkcrstn_h (ON_PROJECTILE_HIT.projectile_chr_christ_s2)'],
  // (水灯心 S2, act3autochess/chess_char_3_15_b, was listed at 13: her mode's impact sounded on top of each cut's brigid:cut. The cuts
  // are buff damage with no HIT — audio.js SKILL_DAMAGE_KEYS: none now)
});

function hear(c, manifest) {
  const { h, u, a, castOnce } = sweepBattle(c, manifest);
  let plays = 0, fallback = 0;
  a._play = () => { plays++; };
  const skillImpact = a._skillImpact.bind(a);
  a._skillImpact = (au, now) => { const n = plays; const r = skillImpact(au, now); if (plays > n) fallback++; return r; };
  const noHit = [];
  let t = 0, losses = 0;
  return onBattleClock((tick) => {
    for (let i = 0, n = Math.round(SECS / h.b.dt); i < n; i++) {
      castOnce();
      h.step();
      tick(t += h.b.dt);
      a.ctx.currentTime = t;
      for (const e of h.events.splice(0)) {
        const before = plays;
        a.handleBattleEvents([e]);
        if (e[0] === 'dmg' && e[6] === 3) losses++;
        if (e[0] === 'dmg' && (e[6] === 3 || (e[5] != null && e[5] === e[1])) && plays > before) noHit.push(e);
      }
    }
    return { noHit, fallback, cast: !u.skill || u.skill.activations > 0, losses };
  });
}

describe('impact sounds across every operator and skill', () => {
  const manifest = NO_DATA ? null : readData('assets.json');
  // docs/rules/diy.md 「선발 훑기 시험」: 规程 reuses 盟约's backup chess keys for other operators, so a 规程 backup run on 盟约's
  // data fields 盟约's operator under the same key without an error
  test('the sweep fields every season\'s backup operators and skills, each on its season\'s data', { skip: NO_DATA }, () => {
    const want = new Set(Object.values(allSeasonData()).flatMap(({ chess }) => Object.entries(chess)
      .filter(([k, v]) => k.endsWith('_b') && v?.backup?.charId?.startsWith('char_')).map(([, v]) => backupOf(v))));
    const backups = sweepCases().filter((c) => c.unit.chessId);
    assert.deepEqual([...want].filter((x) => !backups.some((c) => c.pair === x)), [], 'a backup operator × skill the sweep leaves out (test/helpers/audio-sweep.js sweepCases)');
    const later = backups.filter((c) => c.season);
    assert.ok(later.length >= 40, `${later.length} backup operators × skills only a later season fields`);
    const fielded = (c) => { try { const { u } = sweepBattle(c, manifest); return `${u.def.charId} S${u.def.skill.index + 1}`; } catch { return null; /* nothing fielded */ } };
    const wrong = later.filter((c) => fielded(c) !== c.pair).map((c) => c.label);
    assert.deepEqual(wrong, [], 'cases that did not field their season\'s operator and skill: run them with `season` (battleHarness makeBattle)');
  });
  for (const c of NO_DATA ? [] : sweepCases()) {
    test(c.label, () => {
      const r = hear(c, manifest);
      if (!PASSIVE.has(c.label)) assert.ok(r.cast, 'its skill never ran: this case tests nothing of it');
      assert.deepEqual(r.noHit.slice(0, 2), [], 'an HP loss or damage to itself sounded');
      const listed = REPEATED[c.label];
      if (listed) assert.ok(r.fallback > FALLBACK_MAX, `${r.fallback} skill-damage impacts: its entry in REPEATED no longer applies`);
      assert.ok(r.fallback <= (listed?.[0] ?? FALLBACK_MAX), `${r.fallback} skill-damage impacts in ${SECS} s: is a tick sounding as a hit? (AudioManager._skillImpact)`);
    });
  }
});
