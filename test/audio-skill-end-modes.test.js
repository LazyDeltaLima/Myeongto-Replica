// The modes a skill switches to on the way and as it ends (docs/rules/audio.md 「스킬 종료음」 / 「공격 소리 신호」, 2026-10-29):
// 蒂比 S2's landing and 蕾缪安 S3's closing call sound the START of the end mode (local-char-modes.json `skillEnd`);
// 维什戴尔's 过载 and 乌尔比安 S3 after the anchor attack with their mode's signals (shared/skill-modes.js SKILL_SUB_MODES).
// The manifest under test is the committed one with these entries rebuilt from the official audio table (skipped without it).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../public/js/audio.js';
import { cueSetOf } from '../public/js/audioOfficial.js';
import { SKILL_SUB_MODES } from '../shared/skill-modes.js';
import { skillEnds, skillModes, loadCharModes, loadCharAudio } from '../tools/assets/skill-mode-sfx.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const skip = existsSync(OFFICIAL) ? false : 'no official audio table (.cache/gamedata, tools/build-data.mjs)';
const file = (u) => String(u).split('/').pop();
const leaf = (p) => `/assets/audio/${p[0]}`;
const CM = loadCharModes(ROOT), CA = loadCharAudio(ROOT);
const chess = JSON.parse(readFileSync(path.join(ROOT, 'data', 'chess.json'), 'utf8'));
const skillsOf = (id) => (Object.values(chess.chess ?? chess).find((c) => c?.charId === id)?.skills || []).map((s, index) => ({ index, skillId: s.skillId }));
const WISDEL_SKILLS = ['skchr_wisdel_1', 'skchr_wisdel_2', 'skchr_wisdel_3'].map((skillId, index) => ({ index, skillId }));

let audio = null;
const official = () => (audio ??= indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8'))));

/** The committed manifest with the entries of these operators rebuilt by the builder. */
function manifestOf() {
  const m = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
  const units = m.audio.sfx.units;
  for (const id of ['char_4191_tippi', 'char_4193_lemuen', 'char_1035_wisdel', 'char_4145_ulpia']) {
    const sk = id === 'char_1035_wisdel' ? WISDEL_SKILLS : skillsOf(id);
    const u = (units[id] ||= {});
    const modes = skillModes(official(), id, sk, CM[id], leaf, () => false, CA[id]);
    if (modes) u.modes = modes;
    const ends = skillEnds(official(), sk, leaf, id, CM[id], CA[id]);
    if (ends) u.ends = ends; else delete u.ends;
  }
  return m;
}

function manager(manifest) {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url, o) => { a.played.push({ f: file(url), bank: o.bank }); };
  a.voice = () => false;
  return a;
}
const field = (a, op, skillIndex) => a.setFieldUnits([
  { id: 1, kind: 'op', side: 'ally', spine: op, defId: 'chess_x', skillIndex },
  { id: 2, kind: 'enemy', side: 'enemy', spine: 'enemy_1006_shield' },
]);

describe('the end mode of a skill (local-char-modes.json skillEnd)', () => {
  test('the extracted end modes: 蒂比 S1 / S2 → their landing, 蕾缪安 / 圣约送葬人 / 琳琅诗怀雅 S3 → S3_End', () => {
    assert.deepEqual(CM.char_4191_tippi.skillEnd, [3, 6]);
    assert.equal(CM.char_4191_tippi.modes[6], 'S2_Landing');
    for (const id of ['char_4193_lemuen', 'char_1032_excu2', 'char_1033_swire2']) assert.equal(CM[id].modes[CM[id].skillEnd[2]], 'S3_End', id);
    assert.equal(CM.char_1035_wisdel.skillEnd, undefined, 'her S2 switch ends back on the Default');
  });

  test('its START bank is the skill\'s end sound (no ON_SKILL_FINISH of its own)', { skip }, () => {
    const e = skillEnds(official(), skillsOf('char_4191_tippi'), leaf, 'char_4191_tippi', CM.char_4191_tippi, CA.char_4191_tippi);
    assert.deepEqual(Object.keys(e), ['0', '1']);
    assert.equal(file(e[1].url), 'p_skill_pmtjtckdw.mp3');
    assert.equal(e[1].grp, 'Battle_Skill_Important');
    assert.equal(e[1].mode, 1);
    const l = skillEnds(official(), skillsOf('char_4193_lemuen'), leaf, 'char_4193_lemuen', CM.char_4193_lemuen, CA.char_4193_lemuen);
    assert.equal(file(l[2].url), 'p_atk_lmwlcrstrst_s.mp3');
    assert.equal(skillEnds(official(), skillsOf('char_4191_tippi'), leaf), null, 'without the mode facts: nothing');
  });

  test('audio.js: 蒂比 S2 lands with it — not when she leaves the field in the same batch', { skip }, () => {
    const a = manager(manifestOf());
    field(a, 'char_4191_tippi', 1);
    a.handleBattleEvents([['skill', 1, 1]]);
    a.played.length = 0;
    a.handleBattleEvents([['skill', 1, 0]]);
    assert.deepEqual(a.played.map((p) => [p.f, p.bank]), [['p_skill_pmtjtckdw.mp3', 'char_4191_tippi:end:1']]);
    const b = manager(manifestOf());
    field(b, 'char_4191_tippi', 1);
    b.handleBattleEvents([['skill', 1, 1]]);
    b.played.length = 0;
    b.handleBattleEvents([['skill', 1, 0], ['die', 1, 'death']]);
    assert.ok(!b.played.some((p) => p.f === 'p_skill_pmtjtckdw.mp3'), b.played.map((p) => p.f).join());
  });
});

describe('the modes a running skill switches to (SKILL_SUB_MODES)', () => {
  test('each names a mode of its skill\'s own mode', () => {
    for (const [id, subs] of Object.entries(SKILL_SUB_MODES)) for (const name of Object.values(subs)) assert.ok(CM[id].modes.includes(name), `${id} ${name}`);
  });

  test('the builder: 维什戴尔 S2 过载 attack.2 ON, 乌尔比安 S3 attack.3 START / HIT', { skip }, () => {
    const w = skillModes(official(), 'char_1035_wisdel', WISDEL_SKILLS, CM.char_1035_wisdel, leaf, () => false, CA.char_1035_wisdel);
    assert.deepEqual(w[1].sub.wisdelOverload.cues.map((c) => `${c.at}:${file(c.u)}`), ['a:p_atk_dkmrcaygnfrh_h.mp3', 'd:p_imp_dkmrcaygn_h.mp3']);
    assert.equal(w[2].sub, undefined, 'her S3 has none');
    const u = skillModes(official(), 'char_4145_ulpia', skillsOf('char_4145_ulpia'), CM.char_4145_ulpia, leaf, () => false, CA.char_4145_ulpia);
    assert.deepEqual(u[2].sub.anchor.cues.map((c) => `${c.at}:${file(c.u)}`), ['s:p_atk_wtrbatnchr.mp3', 'd:p_imp_wtrbatnchr.mp3']);
    assert.equal(u[0].sub, undefined, 'S1 (also an anchor) switches no mode');
    assert.equal(cueSetOf({ modes: { 2: u[2] } }, 2, 'anchor').cues, u[2].sub.anchor.cues);
    assert.equal(cueSetOf({ modes: { 2: u[2] } }, 2, 'other').cues, u[2].cues);
  });

  test('audio.js: after the fx, the skill\'s attacks sound the sub mode until the skill ends', { skip }, () => {
    const a = manager(manifestOf());
    field(a, 'char_4145_ulpia', 2);
    a.handleBattleEvents([['skill', 1, 1]]);
    a.played.length = 0; // its cast's own skchr_ulpia_3.2 START / ON (audio-skill-cast-cues.test.js)
    a.handleBattleEvents([['swing', 1, 0.3, 'none'], ['atk', 1, 2, 'none'], ['dmg', 2, 100, 'phys', 0, 1]]);
    a.handleBattleEvents([['fx', 'anchor', 0, 0, { id: 1 }]]);
    a.handleBattleEvents([['swing', 1, 0.3, 'none'], ['atk', 1, 2, 'none'], ['dmg', 2, 100, 'phys', 0, 1]]);
    a.handleBattleEvents([['skill', 1, 0]]);
    a.handleBattleEvents([['swing', 1, 0.3, 'none'], ['atk', 1, 2, 'none'], ['dmg', 2, 100, 'phys', 0, 1]]);
    const f = a.played.filter((p) => String(p.f).includes('wtrbatnchr')).map((p) => p.f);
    assert.deepEqual(f, ['p_atk_wtrbatnchr_n.mp3', 'p_imp_wtrbatnchr_n.mp3', 'p_atk_wtrbatnchr.mp3', 'p_imp_wtrbatnchr.mp3', 'p_atk_wtrbatnchr_n.mp3', 'p_imp_wtrbatnchr_n.mp3']);
  });

  test('real match path: 乌尔比安 S3 sends its anchor while the skill runs', async () => {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    give(m, ps, 'chess_char_5_05_b', 'board', legalTileFor(m, ps, 'chess_char_5_05_b'));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    const u = b.allyUnits.find((x) => x.kind === 'op');
    m.dispose?.();
    assert.equal(u.def.charId, 'char_4145_ulpia');
    b.drainEvents();
    while (b.time < 1) b.step();
    b.drainEvents();
    u.skill.activate('manual', { free: true });
    const ev = [];
    while (b.time < 2) { b.step(); ev.push(...b.drainEvents()); }
    const on = ev.findIndex((e) => e[0] === 'skill' && e[1] === u.id && e[2]);
    const anchor = ev.findIndex((e) => e[0] === 'fx' && e[1] === 'anchor' && e[4]?.id === u.id);
    assert.ok(on >= 0 && anchor > on, `skill on (${on}) then its anchor (${anchor})`);
    assert.ok(u.skill.active, 'still running');
  });
});
