// test/audio-skill-silence.test.js — every operator × skill: a skill whose hits land sounds an impact (docs/rules/audio.md
// 「스킬 타격음 전수」, 2026-11-04). test/audio-impact-sweep.test.js asks the opposite question, too many
// sounds. 佩佩 S3 (2026-10-22) and 怒潮凛冬 S3 (2026-11-04) were silent while test/audio-bank-coverage.test.js said `played`: that
// list asks whether a bank's file is in the manifest, not whether this moment reaches it. Tests of one operator check the
// sounds someone thought of. Here a case that fails is either a sound to wire or an entry of test/audio-skill-silence-list.js
// saying why it is silent, and an entry that no longer applies fails too.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readData, sweepCases, sweepBattle } from './helpers/audio-sweep.js';
import { SILENT_SKILLS } from './audio-skill-silence-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_DATA = !existsSync(path.join(ROOT, 'data', 'assets.json')) && 'no data/assets.json';
const SECS = 12;
/** A skill's window: while it runs, and this long after its cast (an instant skill's strike comes after it ended). */
const AFTER_CAST = 1.5;
/** The real ms per game second at the game's usual 2× (audio.js DEFAULT_GAME_SPEED): the manager's windows are real time. */
const MS_PER_S = 500;
const IMPACT_GROUP = /Imp$/;

/** url → its mixer group, wherever the manifest names one. */
function groupsOf(sfx) {
  const out = new Map();
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    if (typeof o.u === 'string' && o.g) out.set(o.u, o.g);
    if (Array.isArray(o.or) && o.g) for (const x of o.or) if (typeof x?.u === 'string') out.set(x.u, o.g);
    Object.values(o).forEach(walk);
  };
  walk(sfx.units);
  for (const [k, url] of Object.entries(sfx.kit ?? {})) if (typeof url === 'string' && sfx.kitGrp?.[k]) out.set(url, sfx.kitGrp[k]);
  for (const u of Object.values(sfx.units)) if (typeof u.hit === 'string' && u.grp?.hit) out.set(u.hit, u.grp.hit);
  return out;
}

/** A small seeded generator: a bank's or a group's random pick varies, the same way each run. */
const seeded = (s = 12345) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const leaf = (url) => String(url).split('/').pop().replace(/\.\w+$/, '');
const urlsOf = (c) => (Array.isArray(c.or) ? c.or.map((x) => x.u) : [c.u]).filter((u) => typeof u === 'string');

/** What case `c` sounds during its skill, on a clock that runs with the battle. */
function listen(c, manifest, groups) {
  const { h, u, a, castOnce, skillIndex } = sweepBattle(c, manifest, seeded());
  const clock = performance.now;
  let t = 0;
  performance.now = () => t * MS_PER_S;
  try {
    const played = [];
    let inWindow = false, castAt = null, hits = 0;
    a._play = (url) => { if (inWindow) played.push(url); };
    for (let i = 0, n = Math.round(SECS / h.b.dt); i < n; i++) {
      castOnce();
      h.step();
      a.ctx.currentTime = (t += h.b.dt);
      const ev = h.events.splice(0);
      if (castAt == null && u.skill?.activations) castAt = t;
      inWindow = castAt != null && (!!u.skill?.active || t - castAt <= AFTER_CAST);
      // the unit's hit on another: not a damage-over-time tick, a drone's addition or an HP loss (the 'dmg' 7th field)
      if (inWindow) hits += ev.filter((e) => e[0] === 'dmg' && e[5] === u.id && e[1] !== u.id && !e[6]).length;
      a.handleBattleEvents(ev);
    }
    const entry = manifest.audio.sfx.units[u.def?.charId ?? u.defId];
    const declared = [...(entry?.modes?.[skillIndex]?.cues ?? []), ...(entry?.kd?.[skillIndex] ?? [])]
      .filter((q) => IMPACT_GROUP.test(q.g ?? '')).flatMap(urlsOf);
    const impacts = played.filter((url) => IMPACT_GROUP.test(groups.get(url) ?? '') || url.includes('/p_imp/'));
    return { hits, impacts: impacts.map(leaf), declared: [...new Set(declared)].map(leaf), declaredPlayed: declared.some((url) => played.includes(url)) };
  } finally {
    performance.now = clock;
  }
}

/** Why case result `r` counts as silent, or null: no impact at all, or none of the impacts its skill's own banks name. */
function silence(r) {
  if (!r.hits) return null;
  if (!r.impacts.length) return 'silent';
  return r.declared.length && !r.declaredPlayed ? 'other' : null;
}

describe('a skill whose hits land sounds an impact, across every operator and skill', { skip: NO_DATA }, () => {
  const manifest = NO_DATA ? null : readData('assets.json');
  const groups = NO_DATA ? null : groupsOf(manifest.audio.sfx);
  const seen = new Set();
  for (const c of NO_DATA ? [] : sweepCases()) {
    seen.add(c.label);
    test(c.label, () => {
      const r = listen(c, manifest, groups);
      const got = silence(r), listed = SILENT_SKILLS[c.label];
      if (!got) { assert.equal(listed, undefined, `${r.hits} hits sound ${[...new Set(r.impacts)].slice(0, 4)}: its entry in audio-skill-silence-list.js no longer applies`); return; }
      assert.ok(listed, `${r.hits} hits during the skill, ${got === 'silent' ? 'no impact sound at all' : `impacts ${[...new Set(r.impacts)].slice(0, 4)}`}, its banks name ${r.declared}: wire it, or say why in audio-skill-silence-list.js`);
      assert.ok(listed.startsWith(`${got} `), `the entry says "${listed.split(' ')[0]}", the run says "${got}"`);
    });
  }
  test('a strike\'s skill impact (`kd`) sounds once, not its normal impact and not once per damage instance', () => {
    const one = (label, file) => {
      const c = sweepCases().find((x) => x.label === label);
      assert.deepEqual(listen(c, manifest, groups).impacts, [file], label);
    };
    one('char_4065_judge S1', 'p_imp_gavel_d');     // phys + arts on one target: one HIT
    one('char_4055_bgsnow S2', 'p_imp_penarrow_h'); // lands after the skill ended on the strike
  });

  test('what the sweep found on 2026-11-04 sounds what its banks say, and the sound it replaced does not', () => {
    const run = (label) => listen(sweepCases().find((x) => x.label === label), manifest, groups).impacts;
    const only = (label, want) => assert.deepEqual([...new Set(run(label))].sort(), [...want].sort(), label);
    only('char_2025_shu S3', ['p_imp_drgndfmr_s']);          // the group's Attack child on an enemy, not the Heal child's silence
    only('chess_char_1_18_b', ['p_imp_darksword_n', 'p_imp_heal_n']); // a skill on from deployment keeps its mode
    only('char_1015_aglna2 S1', ['p_imp_arstrnstf_d']);
    only('chess_char_3_13_b', ['p_imp_staffcannon_h']);      // the second shot, though the charge skill ended on the strike
    only('char_1035_wisdel S1', ['p_imp_dkmrcaygn_d', 'p_imp_dkmrcaybm']); // the shot, then its aftershocks
    only('chess_char_5_15_b', ['p_imp_trshldacy_h', 'p_imp_trshldacy_n']); // the unit landing, then its ticks
    assert.equal(run('chess_char_5_05_b').filter((f) => f === 'p_imp_wtrbatnchr_s').length, 1, '乌尔比安 S3: the anchor lands once');
  });

  test('the list names only cases that exist', () => {
    assert.deepEqual(Object.keys(SILENT_SKILLS).filter((k) => !seen.has(k)), []);
  });
});
