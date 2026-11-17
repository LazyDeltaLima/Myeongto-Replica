// test/audio-late-entry.test.js — a field entered late (watching another field, a reconnect, a tab brought back): screens/game.js
// replays no 'skill' event there, so a skill that runs already sounded its unit's normal attack until it ended
// (docs/rules/audio.md 「스킬 타격음 전수」, 2026-11-05). The manager takes the running skills from the buffered events and the
// field's first snapshot, without their starts.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../public/js/audio.js';
import { UF } from '../shared/constants.js';
import { keepEarly } from '../public/js/screens/game/early.js';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';
import { sweepCases } from './helpers/audio-sweep.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'data', 'assets.json');
const skip = existsSync(ASSETS) ? false : 'no data/assets.json';
const manifest = skip ? null : JSON.parse(readFileSync(ASSETS, 'utf8'));
const leaf = (url) => String(url).split('/').pop().replace(/\.\w+$/, '');
const dummy = enemyRec({ key: 'e_d', hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
/** The real ms per game second at the game's usual 2× (a manager's windows are real time). */
const MS_PER_S = 500;

function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.voice = () => false;
  a.played = [];
  a._play = (url) => { a.played.push(leaf(url)); };
  return a;
}

/** 宴 S2 (chess_char_1_18_b): a skill on from deployment, with a mode of its own, beside a dummy. */
function battle() {
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ uid: 1, chessId: 'chess_char_1_18_b', row: 10, col: 5 }] });
  h.step();
  h.spawn('e_d', { pos: [10, 6] });
  return { h, u: h.unit(1) };
}
const fieldUnits = (h) => h.b.fieldMeta().units;

/**
 * Enter the field after `before` seconds as screens/game.js does when it is no opening — spawn events only, then `enter(a, early, snapUnits)`
 * — and return what the next 6 s sound.
 */
function lateEntry(enter, before = 3) {
  const { h, u } = battle();
  const clock = performance.now;
  let t = 0;
  performance.now = () => t * MS_PER_S;
  try {
    h.run(before);
    const early = h.events.splice(0).filter(keepEarly);
    const a = manager();
    a.setFieldUnits(fieldUnits(h));
    a.handleBattleEvents(early.filter((e) => e[0] === 'spawn'));
    enter(a, early, h.b.snapshot().units);
    const atEntry = a.played.slice();
    a.played.length = 0;
    for (let i = 0, n = Math.round(6 / h.b.dt); i < n; i++) {
      h.step();
      a.ctx.currentTime = (t += h.b.dt);
      a.handleBattleEvents(h.events.splice(0));
    }
    return { a, u, atEntry, heard: a.played.slice() };
  } finally {
    performance.now = clock;
  }
}

describe('a field entered late keeps the sounds of the skills that run', { skip }, () => {
  const MODE_IMPACT = 'p_imp_darksword_n';
  const NORMAL_IMPACT = () => leaf(manifest.audio.sfx.units.char_337_utage.hit);

  test('the case bites: without them, 宴 S2 sounds her normal impact', () => {
    assert.notEqual(NORMAL_IMPACT(), MODE_IMPACT);
    const { heard, u } = lateEntry(() => {});
    assert.ok(u.skill.active, 'her skill runs through the entry');
    assert.ok(heard.includes(NORMAL_IMPACT()) && !heard.includes(MODE_IMPACT), `heard ${[...new Set(heard)]}`);
  });

  test('from the buffered events: her mode\'s impact, and no start sound at the entry', () => {
    const { heard, atEntry } = lateEntry((a, early) => a.resumeSkills(early), 0.05);
    assert.deepEqual(atEntry, []);
    assert.ok(heard.includes(MODE_IMPACT) && !heard.includes(NORMAL_IMPACT()), `heard ${[...new Set(heard)]}`);
  });

  test('from the first snapshot, when the buffer began after her cast', () => {
    const { heard, atEntry } = lateEntry((a, _early, snap) => { a.resumeSkills([]); a.syncRunningSkills(snap); });
    assert.deepEqual(atEntry, []);
    assert.ok(heard.includes(MODE_IMPACT) && !heard.includes(NORMAL_IMPACT()), `heard ${[...new Set(heard)]}`);
  });

  test('a skill the events ended, or whose unit died, stays off whatever the first snapshot\'s flag says; only the first snapshot counts', () => {
    const id = 7;
    const units = [{ id, kind: 'op', side: 'ally', spine: 'char_337_utage', skillIndex: 1 }];
    const flagged = [[id, 0, 0, 1, 1, 0, 0, UF.SKILL, 0]];
    for (const early of [[['skill', id, 1], ['skill', id, 0]], [['skill', id, 1], ['die', id]]]) {
      const a = manager();
      a.setFieldUnits(units);
      a.resumeSkills(early);
      a.syncRunningSkills(flagged);
      assert.equal(a.units.get(id).skillOn, undefined, JSON.stringify(early));
    }
    const off = manager();
    off.setFieldUnits(units);
    off.handleBattleEvents([['skill', id, 0]]); // the events said so after the entry: the flag may still be set for a frame
    off.syncRunningSkills(flagged);
    assert.equal(off.units.get(id).skillOn, false);
    const later = manager();
    later.setFieldUnits(units);
    later.syncRunningSkills([[id, 0, 0, 1, 1, 0, 0, 0, 0]]);
    later.syncRunningSkills(flagged);
    assert.equal(later.units.get(id).skillOn, undefined, 'a later snapshot is not the entry');
    const enemy = manager();
    enemy.setFieldUnits([{ id, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' }]);
    enemy.syncRunningSkills(flagged);
    assert.equal(enemy.units.get(id).skillOn, undefined, 'an enemy\'s skill sounds through its own events');
  });

  test('a looping bank is picked up, and stops with the skill\'s \'off\'', () => {
    const id = 7;
    const a = manager();
    const started = [];
    a._buffer = async (url) => { started.push(leaf(url)); return null; };
    a.setFieldUnits([{ id, kind: 'op', side: 'ally', spine: 'char_388_mint', skillIndex: 0 }]);
    a.syncRunningSkills([[id, 0, 0, 1, 1, 0, 0, UF.SKILL, 0]]);
    assert.deepEqual(started, ['p_field_magloop']);
    assert.ok(a._skillLoops.has(id));
    a.handleBattleEvents([['skill', id, 0]]);
    assert.equal(a._skillLoops.has(id), false);
  });

  test('a passive skill has no UF.SKILL, so no entry can say it runs: each one sounds the same whether the manager knows or not', () => {
    const clock = performance.now;
    let t = 0;
    performance.now = () => t * MS_PER_S;
    try {
      const seen = [];
      for (const c of sweepCases()) {
        const h = makeBattle({ season: c.season, defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true, units: [c.unit, ...(c.extra ?? [])] });
        h.step();
        const u = h.unit(1);
        if (u.skill?.kind !== 'passive') continue;
        h.spawn('e_d', { pos: [10, 6] });
        h.run(3);
        h.events.splice(0);
        const units = fieldUnits(h).map((x) => (x.id === u.id ? { ...x, skillIndex: c.skill ?? u.def?.skill?.index } : x));
        const known = manager(), unknown = manager();
        known.setFieldUnits(units);
        unknown.setFieldUnits(units);
        known.units.get(u.id).skillOn = true;
        for (let i = 0, n = Math.round(10 / h.b.dt); i < n; i++) {
          h.step();
          t += h.b.dt;
          known.ctx.currentTime = unknown.ctx.currentTime = t;
          const ev = h.events.splice(0);
          known.handleBattleEvents(ev);
          unknown.handleBattleEvents(ev);
        }
        assert.deepEqual([...unknown.played].sort(), [...known.played].sort(), `${c.label}: it has sounds of its own — a late entry must learn that it runs`);
        seen.push([c.label, known.played.length]);
      }
      assert.ok(seen.some(([l, n]) => l === 'chess_char_3_04_b' && n > 0) && seen.some(([l]) => l === 'char_416_zumama S1'), `the sweep reached the passives: ${seen}`);
    } finally {
      performance.now = clock;
    }
  });

  test('screens/game.js hands the late entry\'s buffer and the first snapshots over', () => {
    const src = readFileSync(path.join(ROOT, 'public', 'js', 'screens', 'game.js'), 'utf8');
    assert.match(src, /if \(!opening\) audio\.resumeSkills\(early\);/);
    assert.match(src, /audio\.syncRunningSkills\(earlySnap\.units\);/);
    assert.match(src, /audio\.syncRunningSkills\(snap\.units\);/);
  });
});
