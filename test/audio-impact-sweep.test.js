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

import { readData, sweepCases, sweepBattle, PASSIVE } from './helpers/audio-sweep.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_DATA = !existsSync(path.join(ROOT, 'data', 'assets.json')) && 'no data/assets.json';
const SECS = 12;
/** More fallback impacts than this in SECS seconds is a tick sounding as a hit, not a skill's strikes (today's most: 1). */
const FALLBACK_MAX = 6;

function hear(c, manifest) {
  const { h, u, a, field, castOnce } = sweepBattle(c, manifest);
  let plays = 0, fallback = 0;
  a._play = () => { plays++; };
  const skillImpact = a._skillImpact.bind(a);
  a._skillImpact = (au, now) => { const n = plays; const r = skillImpact(au, now); if (plays > n) fallback++; return r; };
  const noHit = [];
  let t = 0, losses = 0;
  for (let i = 0, n = Math.round(SECS / h.b.dt); i < n; i++) {
    castOnce();
    h.step();
    a.ctx.currentTime = (t += h.b.dt);
    const ev = h.events.splice(0);
    if (ev.some((e) => e[0] === 'spawn' || e[0] === 'deploy')) field();
    for (const e of ev) {
      const before = plays;
      a.handleBattleEvents([e]);
      if (e[0] === 'dmg' && e[6] === 3) losses++;
      if (e[0] === 'dmg' && (e[6] === 3 || (e[5] != null && e[5] === e[1])) && plays > before) noHit.push(e);
    }
  }
  return { noHit, fallback, cast: !u.skill || u.skill.activations > 0, losses };
}

describe('impact sounds across every operator and skill', () => {
  const manifest = NO_DATA ? null : readData('assets.json');
  for (const c of NO_DATA ? [] : sweepCases()) {
    test(c.label, () => {
      const r = hear(c, manifest);
      if (!PASSIVE.has(c.label)) assert.ok(r.cast, 'its skill never ran: this case tests nothing of it');
      assert.deepEqual(r.noHit.slice(0, 2), [], 'an HP loss or damage to itself sounded');
      assert.ok(r.fallback <= FALLBACK_MAX, `${r.fallback} skill-damage impacts in ${SECS} s: is a tick sounding as a hit? (AudioManager._skillImpact)`);
    });
  }
});
