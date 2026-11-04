// test/helpers/audio-sweep.js — the cases of the sound sweeps: every operator × skill on the battle path, fed to the audio
// manager (test/audio-impact-sweep.test.js: damage that is no hit stays silent; test/audio-skill-silence.test.js: a skill's
// hits are not silent).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../../public/js/audio.js';
import { LOCAL_DIY_PICKS } from '../../shared/local-diy.js';
import { makeBattle, enemyRec } from './battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const readData = (f) => JSON.parse(readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const dummy = (key) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
/** No cast to make here: passive skills (狼眼, 荆棘, 琳琅诗怀雅's coin skill), and 森蚺 gains no SP while she blocks nobody. */
export const PASSIVE = new Set(['chess_char_1_07_b', 'chess_char_3_04_b', 'chess_char_4_17_b', 'char_416_zumama S1', 'char_416_zumama S2', 'char_416_zumama S3']);
/** Summons a skill needs on the field to be cast at all (the cast is refused otherwise). */
const NEEDS = Object.freeze({ char_4179_monstr: { kind: 'token', tokenId: 'token_10050_monstr_prosts', ownerUid: 1, row: 10, col: 3 } });

/** Every 自选 backup chess and every 선발 pick × skill. */
export function sweepCases() {
  const chess = readData('chess.json');
  const out = Object.keys(chess).filter((k) => k.endsWith('_b') && chess[k].backup?.charId?.startsWith('char_'))
    .map((k) => ({ label: k, unit: { uid: 1, chessId: k, row: 10, col: 5 } }));
  for (const c of LOCAL_DIY_PICKS) for (const skill of [0, 1, 2]) {
    out.push({ label: `${c} S${skill + 1}`, skill, extra: NEEDS[c] ? [{ uid: 2, ...NEEDS[c] }] : [], unit: { uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: c, skillIndex: skill, uniEquipId: null }, row: 10, col: 5 } });
  }
  return out;
}

/** The battle of case `c`: its unit beside three dummies that never die, and the audio manager it feeds. */
export function sweepBattle(c, manifest, random = () => 0) {
  const h = makeBattle({ defs: { enemies: { e_d: dummy('e_d') } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true, units: [c.unit, ...(c.extra ?? [])] });
  h.step();
  const u = h.unit(1);
  const a = new AudioManager({ win: null, getManifest: () => manifest, random });
  a.ctx = { currentTime: 0 };
  a.voice = () => false;
  for (const pos of [[10, 6], [10, 7], [9, 6]]) h.spawn('e_d', { pos });
  const skillIndex = c.skill ?? u.def?.skill?.index;
  // once, as the game does for a new field: a 'spawn' event tracks a later unit, and setFieldUnits would forget a running skill
  a.setFieldUnits([...h.b.allyUnits, ...h.b.enemies].filter((x) => x.alive).map((x) => (x.side === 'enemy'
    ? { id: x.id, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' }
    : { id: x.id, kind: x.kind === 'token' ? 'token' : 'op', side: 'ally', spine: x.def?.charId ?? x.defId, ...(x === u ? { skillIndex } : null) })));
  h.events.length = 0;
  /** Cast it once, as soon as the kit allows (a charge skill or a born state can refuse the first tries). */
  const castOnce = () => { if (u.skill && !u.skill.activations && !u.skill.active && u.alive) { u.skill.gainSp?.(999); try { u.skill.activate?.('test'); } catch { /* refused */ } } };
  return { h, u, a, castOnce, skillIndex };
}
