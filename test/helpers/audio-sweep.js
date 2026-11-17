// test/helpers/audio-sweep.js — the cases of the sound sweeps: every operator × skill on the battle path, fed to the audio
// manager (test/audio-impact-sweep.test.js: damage that is no hit stays silent; test/audio-skill-silence.test.js: a skill's
// hits are not silent; test/audio-pick-reach.test.js: a pick's banks are reached), and the 선발 operators' official banks
// (pickBanks: test/audio-bank-coverage.test.js too).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../../public/js/audio.js';
import { seasonPickList, allSeasonData } from './seasonPicks.js';
import { makeBattle, enemyRec } from './battleHarness.js';
import { DEFAULT_SEASON } from '../../shared/seasons.js';
import { LOCAL_DIY_PICKS } from '../../shared/local-diy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const readData = (f) => JSON.parse(readFileSync(path.join(ROOT, 'data', f), 'utf8'));
/** The official sound banks (zh_CN audio_data.json, downloaded by tools/build-data.mjs). */
export const OFFICIAL_AUDIO = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');

/** The manifest URL of a bank sound's asset (Audio/Sound_Beta_2/Player/p_imp/x → /assets/audio/sfx/player/p_imp/x.mp3). */
export const bankUrl = (asset) => `/assets/audio/sfx/${String(asset).split('/').slice(-3).join('/')}.mp3`.toLowerCase();

/** A regexp of `w` as a word of a bank name. */
export const asWord = (w) => new RegExp(`(?<![a-z0-9])${w}(?![a-z0-9])`);

/**
 * The words that name a pick's banks: its codename and (2026-11-01) its summons' own codes (data/backups.json `tokens`:
 * token_<n>_<codename>_<code>) — 酒神's 本能的召唤 sounds token_encdool_boom_start, without her codename.
 */
export function pickWords(id, tokens) {
  const code = id.split('_').slice(2).join('_');
  const own = Object.keys(tokens).filter((t) => asWord(code).test(t)).map((t) => t.split('_').slice(2).join('_').replace(new RegExp(`^${code}_`), ''));
  return [code, ...own.filter((c) => c && c !== code)].map(asWord);
}

/**
 * Whether a bank (name without `battle.`) belongs to an enemy, whatever words its name shares with a pick: the part after
 * the event names an enemy id (enemy_8010_mcnist, the 机械之心 of another event, shares the pick 机械师's code) or its
 * projectile (projectile_enemy_mcnist). Only that part's start counts: an operator's own bank may end in _enemy
 * (haruka_shield_break_enemy).
 */
export const enemyBank = (name) => /^(enemy_\d+_|projectile_enemy_)/.test(name.split('.')[1] ?? '');

/**
 * {charId: [{ name (without `battle.`), files (manifest URLs) }]}: every official `battle.` bank whose name carries a 自选
 * pick's codename or one of her summons' own codes as a word, an enemy's left out — the set of
 * test/audio-bank-coverage.test.js and test/audio-pick-reach.test.js (tools/local-extract/link_sheet.py prints the same).
 */
export function pickBanks(picks = LOCAL_DIY_PICKS) {
  const banks = JSON.parse(readFileSync(OFFICIAL_AUDIO, 'utf8')).soundFXBanks;
  const tokens = readData('backups.json').tokens ?? {};
  const out = {};
  for (const id of picks) {
    const words = pickWords(id, tokens);
    out[id] = [];
    for (const b of banks) {
      if (!b.name.startsWith('battle.') || !words.some((w) => w.test(b.name))) continue;
      const name = b.name.slice('battle.'.length);
      if (!enemyBank(name)) out[id].push({ name, files: (b.sounds || []).map((s) => bankUrl(s.asset)) });
    }
  }
  return out;
}

/** Every sound URL the asset manifest names (lower case). */
export const manifestUrls = (manifest) => new Set((JSON.stringify(manifest.audio).match(/\/assets\/audio\/[^"]+?\.mp3/g) || []).map((u) => u.toLowerCase()));
/** The real ms per game second at the game's usual 2×. */
const MS_PER_S = 500;
const dummy = (key) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
/** No cast to make here: passive skills (狼眼, 荆棘, 琳琅诗怀雅's coin skill), and 森蚺 gains no SP while she blocks nobody. */
export const PASSIVE = new Set(['chess_char_1_07_b', 'chess_char_3_04_b', 'chess_char_4_17_b', 'char_416_zumama S1', 'char_416_zumama S2', 'char_416_zumama S3']);
/** Summons a skill needs on the field to be cast at all (the cast is refused otherwise). */
const NEEDS = Object.freeze({ char_4179_monstr: { kind: 'token', tokenId: 'token_10050_monstr_prosts', ownerUid: 1, row: 10, col: 3 } });

/**
 * Runs `fn(tick)` on a clock that follows the battle: the manager's windows are real time, and a battle run flat out would
 * squeeze 12 game seconds into milliseconds, so `SKILL_HIT_GAP_MS` and the like would swallow what they should let through.
 * `tick(seconds)` sets it, at the game's usual 2× (audio.js DEFAULT_GAME_SPEED).
 */
export function onBattleClock(fn) {
  const real = performance.now;
  let t = 0;
  performance.now = () => t * MS_PER_S;
  try { return fn((s) => { t = s; }); } finally { performance.now = real; }
}

/** A backup chess's operator and skill (`<charId> S<n>`): a later season adds the pairs no earlier season runs. */
export const backupOf = (c) => `${c.backup.charId} S${(c.backup.skillIndex ?? 0) + 1}`;

/**
 * Every backup chess of every season and every 自选 pick of any season × skill, each on its season's data (`season`). The
 * default season's backup chess keep their chess key as the label; a later season adds one case for each operator × skill
 * no earlier season runs, labelled `<season>/<chess key>` (规程 reuses 盟约's chess keys for other operators, and fields three of
 * 盟约's backup operators with another skill). A 规程-only pick is one of 盟约's chess and has no 自选 form there
 * (test/helpers/seasonPicks.js seasonPickList).
 */
export function sweepCases() {
  const out = [];
  const seen = new Set();
  for (const [season, { chess }] of Object.entries(allSeasonData())) {
    const first = season === DEFAULT_SEASON;
    const here = new Set();
    for (const k of Object.keys(chess)) {
      if (!k.endsWith('_b') || !chess[k]?.backup?.charId?.startsWith('char_')) continue;
      const pair = backupOf(chess[k]);
      if (seen.has(pair) || (!first && here.has(pair))) continue;
      here.add(pair);
      out.push({ label: first ? k : `${season}/${k}`, charId: chess[k].backup.charId, pair, ...(first ? null : { season }), unit: { uid: 1, chessId: k, row: 10, col: 5 } });
    }
    for (const pair of here) seen.add(pair);
  }
  for (const { charId: c, season } of seasonPickList()) for (const skill of [0, 1, 2]) {
    out.push({ label: `${c} S${skill + 1}`, season, skill, extra: NEEDS[c] ? [{ uid: 2, ...NEEDS[c] }] : [], unit: { uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: c, skillIndex: skill, uniEquipId: null }, row: 10, col: 5 } });
  }
  return out;
}

/** The battle of case `c` (on its `season`'s data): its unit beside three dummies that never die, and the audio manager it feeds. */
export function sweepBattle(c, manifest, random = () => 0) {
  const h = makeBattle({ season: c.season, defs: { enemies: { e_d: dummy('e_d') } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true, units: [c.unit, ...(c.extra ?? [])] });
  h.step();
  const u = h.unit(1);
  const a = new AudioManager({ win: null, getManifest: () => manifest, random });
  a.ctx = { currentTime: 0 };
  a.voice = () => false;
  for (const pos of [[10, 6], [10, 7], [9, 6]]) h.spawn('e_d', { pos });
  const skillIndex = c.skill ?? u.def?.skill?.index;
  // once, as the game does for a new field: a 'spawn' event tracks a later unit, and setFieldUnits would forget a running skill
  // (the first step's events stay queued: a skill that starts on deployment sends its 'skill' there)
  a.setFieldUnits([...h.b.allyUnits, ...h.b.enemies].filter((x) => x.alive).map((x) => (x.side === 'enemy'
    ? { id: x.id, kind: 'enemy', side: 'enemy', spine: 'enemy_1007_slime' }
    : { id: x.id, kind: x.kind === 'token' ? 'token' : 'op', side: 'ally', spine: x.def?.charId ?? x.defId, ...(x === u ? { skillIndex } : null) })));
  /** Cast it once, as soon as the kit allows (a charge skill or a born state can refuse the first tries). */
  const castOnce = () => { if (u.skill && !u.skill.activations && !u.skill.active && u.alive) { u.skill.gainSp?.(999); try { u.skill.activate?.('test'); } catch { /* refused */ } } };
  return { h, u, a, castOnce, skillIndex };
}
