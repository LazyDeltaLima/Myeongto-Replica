// test/audio-impact-sweep.test.js — every operator × skill on the battle path, fed to the audio manager (docs/rules/audio.md
// 「공격 소리 신호」, 2026-11-04). The client sounds an impact from an ability's or a projectile's HIT, never from damage as such; ours
// starts from the 'dmg' event, so damage that is no hit has sounded as one three times: 아스카론's DoT ticks (2026-10-11), the
// drones' additions (2026-10-29), Mon3tr S3's 流失 (2026-11-04, ten impacts a second). Tests of one operator asked "did her
// impact play" and passed. Here: damage that is no hit plays nothing, and no unit's skill-damage fallback runs like a tick.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../public/js/audio.js';
import { LOCAL_DIY_PICKS } from '../shared/local-diy.js';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_DATA = !existsSync(path.join(ROOT, 'data', 'assets.json')) && 'no data/assets.json';
const SECS = 12;
/** More fallback impacts than this in SECS seconds is a tick sounding as a hit, not a skill's strikes (today's most: 1). */
const FALLBACK_MAX = 6;
const dummy = (key) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
const read = (f) => JSON.parse(readFileSync(path.join(ROOT, 'data', f), 'utf8'));
/** No cast to make here: passive skills (狼眼, 荆棘, 琳琅诗怀雅's coin skill), and 森蚺 gains no SP while she blocks nobody. */
const PASSIVE = new Set(['chess_char_1_07_b', 'chess_char_3_04_b', 'chess_char_4_17_b', 'char_416_zumama S1', 'char_416_zumama S2', 'char_416_zumama S3']);
/** Summons a skill needs on the field to be cast at all (the cast is refused otherwise). */
const NEEDS = Object.freeze({ char_4179_monstr: { kind: 'token', tokenId: 'token_10050_monstr_prosts', ownerUid: 1, row: 10, col: 3 } });

function cases() {
  const chess = read('chess.json');
  const out = Object.keys(chess).filter((k) => k.endsWith('_b') && chess[k].backup?.charId?.startsWith('char_'))
    .map((k) => ({ label: k, unit: { uid: 1, chessId: k, row: 10, col: 5 } }));
  for (const c of LOCAL_DIY_PICKS) for (const skill of [0, 1, 2]) {
    out.push({ label: `${c} S${skill + 1}`, skill, extra: NEEDS[c] ? [{ uid: 2, ...NEEDS[c] }] : [], unit: { uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: c, skillIndex: skill, uniEquipId: null }, row: 10, col: 5 } });
  }
  return out;
}

function hear(c, manifest) {
  const h = makeBattle({ defs: { enemies: { e_d: dummy('e_d') } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true, units: [c.unit, ...(c.extra ?? [])] });
  h.step();
  const u = h.unit(1);
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  let plays = 0, fallback = 0;
  a._play = () => { plays++; };
  a.voice = () => false;
  const skillImpact = a._skillImpact.bind(a);
  a._skillImpact = (au, now) => { const n = plays; const r = skillImpact(au, now); if (plays > n) fallback++; return r; };
  for (const pos of [[10, 6], [10, 7], [9, 6]]) h.spawn('e_d', { pos });
  const skillIndex = c.skill ?? u.def?.skill?.index;
  const field = () => a.setFieldUnits([...h.b.allyUnits, ...h.b.enemies].filter((x) => x.alive).map((x) => (x.side === 'enemy'
    ? { id: x.id, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' }
    : { id: x.id, kind: x.kind === 'token' ? 'token' : 'op', side: 'ally', spine: x.def?.charId ?? x.defId, ...(x === u ? { skillIndex } : null) })));
  field();
  h.events.length = 0;
  const noHit = [];
  let t = 0, losses = 0;
  for (let i = 0, n = Math.round(SECS / h.b.dt); i < n; i++) {
    // cast it once, as soon as the kit allows (a charge skill or a born state can refuse the first tries)
    if (u.skill && !u.skill.activations && !u.skill.active && u.alive) { u.skill.gainSp?.(999); try { u.skill.activate?.('test'); } catch { /* refused */ } }
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
  const manifest = NO_DATA ? null : read('assets.json');
  for (const c of NO_DATA ? [] : cases()) {
    test(c.label, () => {
      const r = hear(c, manifest);
      if (!PASSIVE.has(c.label)) assert.ok(r.cast, 'its skill never ran: this case tests nothing of it');
      assert.deepEqual(r.noHit.slice(0, 2), [], 'an HP loss or damage to itself sounded');
      assert.ok(r.fallback <= FALLBACK_MAX, `${r.fallback} skill-damage impacts in ${SECS} s: is a tick sounding as a hit? (AudioManager._skillImpact)`);
    });
  }
});
