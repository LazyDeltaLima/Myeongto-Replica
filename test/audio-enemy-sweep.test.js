// test/audio-enemy-sweep.test.js — every enemy on the battle path, fed to the audio manager (docs/rules/audio.md 「공격 소리
// 신호」). test/audio-impact-sweep.test.js and test/audio-skill-silence.test.js ask about the operators; an enemy's strike takes
// another branch of the manager. Here, against a guard that never dies, for 12 s: damage that is no hit stays silent, a strike
// sounds at most its impact and no more, and an enemy whose banks name an impact sounds it — or test/audio-enemy-silence-list.js
// says why not. What needs another unit, a stage device or a phase change to happen is out of its reach.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../public/js/audio.js';
import { readData, onBattleClock } from './helpers/audio-sweep.js';
import { makeBattle, chessRec } from './helpers/battleHarness.js';
import { ENEMY_SILENT } from './audio-enemy-silence-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_DATA = !existsSync(path.join(ROOT, 'data', 'assets.json')) && 'no data/assets.json';
const SECS = 12;
/** Impacts one strike's damage may start: its own cue and a second bank of it (the manifest's largest today). */
const IMPACTS_PER_HIT = 2;
const guard = chessRec({ id: 'gd', profession: 'WARRIOR', skill: null, rangeGrid: [[0, 0]], stats: { hp: 1e9, atk: 0, def: 0, bat: 99, blockCnt: 9 } });

/** What enemy `key` sounds from its own damage. */
function listen(key, rec, manifest) {
  const h = makeBattle({ defs: { chess: { gd: guard } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true, units: [{ uid: 1, chessId: 'gd', row: 10, col: 5 }] });
  h.step();
  const e = h.spawn(key, { pos: [10, 6] });
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.voice = () => false;
  let plays = 0;
  a._play = () => { plays++; };
  a.setFieldUnits([{ id: h.unit(1).id, kind: 'op', side: 'ally', spine: 'char_102_texas' }, { id: e.id, kind: 'enemy', side: 'enemy', spine: rec.spine ?? key }]);
  h.events.length = 0;
  let t = 0, hits = 0, sounded = 0, most = 0;
  const noHit = [];
  onBattleClock((tick) => {
    for (let i = 0, n = Math.round(SECS / h.b.dt); i < n; i++) {
      h.step();
      tick(t += h.b.dt);
      a.ctx.currentTime = t;
      for (const x of h.events.splice(0)) {
        const before = plays;
        a.handleBattleEvents([x]);
        if (x[0] !== 'dmg' || x[5] !== e.id) continue;
        const n2 = plays - before;
        if (x[6] === 3 || x[1] === e.id) { if (n2) noHit.push(x); continue; }
        if (x[6]) continue;
        hits++;
        if (n2) sounded++;
        most = Math.max(most, n2);
      }
    }
  });
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
  return { hits, sounded, most, noHit };
}

/** Whether the manifest names an impact for this enemy's strike (`hit`, a 'd' cue of its attack or of a mode's). */
function declaresImpact(entry) {
  if (!entry) return false;
  const d = (cues) => (cues ?? []).some((c) => c.at === 'd');
  return !!entry.hit || d(entry.cues) || Object.values(entry.em ?? {}).some((m) => d(m.cues));
}

describe('enemies: their strikes sound what their banks name, and only that', { skip: NO_DATA }, () => {
  const manifest = NO_DATA ? null : readData('assets.json');
  const raw = NO_DATA ? {} : readData('enemies.json');
  const enemies = raw.enemies ?? raw;
  for (const [key, rec] of Object.entries(enemies)) {
    test(key, () => {
      const r = listen(key, rec, manifest);
      assert.deepEqual(r.noHit.slice(0, 2), [], 'an HP loss or damage to itself sounded');
      assert.ok(r.most <= IMPACTS_PER_HIT, `${r.most} sounds from one damage event`);
      const silent = r.hits > 0 && r.sounded === 0 && declaresImpact(manifest.audio.sfx.units[rec.spine ?? key]);
      const listed = ENEMY_SILENT[key];
      if (silent) assert.ok(listed, `${r.hits} hits, no sound, though its banks name an impact: wire it, or say why in audio-enemy-silence-list.js`);
      else assert.equal(listed, undefined, `${r.hits} hits, ${r.sounded} sounded: its entry in audio-enemy-silence-list.js no longer applies`);
    });
  }
  test('the list names only enemies that exist', () => {
    assert.deepEqual(Object.keys(ENEMY_SILENT).filter((k) => !enemies[k]), []);
  });
});
