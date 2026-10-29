// test/audio-skill-cast-cues.test.js — a CastSkill's own ability sounds (2026-10-29, docs/rules/audio.md 「스킬 시전 능력
// 소리」): the client casts the skill ability as the skill starts and emits its START as it starts, ON at its OnAttack frame,
// HIT on its targets — `.<k>` banks for the k-th child of a group ability, a sequence group's later child as the animated one
// ends. The builder (skill-mode-sfx.mjs castCues → sfx.units[def].castCues), the sim's 'skill' event timing
// (skills.js _evOn: [strike, end]) and the manager's waits; 薄绿 S2's ON_ABILITY_ATTACK_FINISH on her end burst.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager, kitHitKey } from '../public/js/audio.js';
import { castCuesOf } from '../public/js/audioOfficial.js';
import { indexAudio } from '../tools/assets/audio.mjs';
import { castCues, loadCharModes, loadSkillCast, skillModeIndex } from '../tools/assets/skill-mode-sfx.mjs';
import { KIT_HIT_BANKS } from '../tools/assets/kit-sfx.mjs';
import { skillStartSounds } from '../tools/assets/skill-sfx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const NO_DATA = !existsSync(OFFICIAL) && 'no .cache/gamedata';
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
const file = (u) => String(u).split('/').pop();

// the 11 signals of the 2026-10-22 diagnosis: charId, skill index, skillId, [file, at] in bank order (START, ON, HIT)
const CASES = [
  ['char_1050_chen3', 1, 'skchr_chen3_2', [['p_atk_hljdswd_h', 's']]],
  ['char_420_flamtl', 1, 'skchr_flamtl_2', [['p_skill_lightsword', 'a']]],
  ['char_4036_forcer', 1, 'skchr_forcer_2', [['p_imp_fgun_s', 'a']]],
  ['char_474_glady', 2, 'skchr_glady_3', [['p_atk_seasword_h', 's']]], // .2 after the clip-less FinalAttack: the kit's 'tornado'
  ['char_206_gnosis', 1, 'skchr_gnosis_2', [['p_atk_iceprick_h', 'a'], ['p_imp_iceprick_h', 'a']]],
  ['char_373_lionhd', 1, 'skchr_lionhd_2', [['p_skill_magblast', 'a']]],
  ['char_213_mostma', 1, 'skchr_mostma_2', [['p_skill_blacktimewand_shot', 'a']]],
  ['char_4194_rmixer', 2, 'skchr_rmixer_3', [['p_atk_ftmxbrtlm_skiiop', 's']]],
  ['char_4145_ulpia', 2, 'skchr_ulpia_3', [['p_atk_wtrbatnchr_s', 's'], ['p_atk_wtrbatnchrfr_s', 'a']]],
  ['char_494_vendla', 1, 'skchr_vendla_2', [['p_imp_brmblhl_h', 'e']]],
];

function manager() {
  const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
  a.ctx = { currentTime: 0 };
  a.played = [];
  a._play = (url, o) => { a.played.push({ f: file(url), delay: o.delay ?? 0 }); };
  a.voice = () => false;
  return a;
}

describe('castCues: a CastSkill\'s own ability banks', () => {
  test('the builder: START at the cast, ON / HIT at the strike, a sequence child after the clip at the end', { skip: NO_DATA }, () => {
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    const cast = loadSkillCast(ROOT);
    const charModes = loadCharModes(ROOT);
    const leaf = (p) => p[0];
    for (const [charId, index, skillId, want] of CASES) {
      const info = charModes[charId];
      const start = skillStartSounds(audio, skillId); // the start sound (plan.mjs skillPaths: 벤델라 S2's is its .1 START)
      const out = castCues(audio, [{ index, skillId }], cast, (i) => !!info && skillModeIndex(info.modes, i, info.skillMode) > 0, leaf, start?.length ? { [index]: start } : {});
      const built = (out?.[String(index)] || []).map((c) => [file(c.u).replace(/\.mp3$/, ''), c.at]);
      assert.deepEqual(built, want, `${charId} S${index + 1} (builder)`);
      const got = (manifest.audio.sfx.units[charId]?.castCues?.[index] || []).map((c) => [file(c.u).replace(/\.mp3$/, ''), c.at]);
      assert.deepEqual(got, want, `${charId} S${index + 1} (manifest)`);
    }
  });

  test('the banks the start sound / extras / attack cues already play stay out (모스티마 S2 START layer, 플레임테일 S2 HIT)', () => {
    const files = (id, i) => (manifest.audio.sfx.units[id]?.castCues?.[i] || []).map((c) => file(c.u));
    assert.ok(!files('char_213_mostma', 1).includes('p_skill_blacktimewand_layer.mp3'), 'an extra (skillExtras)');
    assert.ok(!files('char_420_flamtl', 1).includes('p_imp_lightsword_n.mp3'), 'an impact-group HIT (skillHitCues)');
    assert.ok(!files('char_1050_chen3', 1).includes('b_char_atkboost.mp3'), 'the start sound');
  });

  test('a group skill ability is its first child with a clip (인포서 S2: knock_back `Skill`, not the clip-less aura)', () => {
    const chess = JSON.parse(readFileSync(path.join(ROOT, 'data', 'chess.json'), 'utf8'));
    const c = (chess.chess || chess).chess_char_3_07_a.skill.cast;
    assert.equal(c.clip, 'Skill');
    assert.ok(c.hit > 0 && c.hit < c.dur, `its strike frame ${c.hit} inside the clip ${c.dur}`);
    assert.equal(c.face, 2, 'knock_back turns to its deploy direction');
  });

  test('castCuesOf: the waits from the skill event\'s [strike, end]', () => {
    const entry = { castCues: { 1: [{ at: 's', u: 'a' }, { at: 'a', u: 'b' }, { at: 'e', u: 'c' }] } };
    assert.deepEqual(castCuesOf(entry, 1, [0.3, 1.1]).map((x) => x.after), [0, 0.3, 1.1]);
    assert.deepEqual(castCuesOf(entry, 1, undefined).map((x) => x.after), [0, 0, 0], 'no timing: at once');
    assert.deepEqual(castCuesOf(entry, 2, [0.3, 1.1]), []);
  });

  test('the manager: 벤델라 S2 .2 START waits for the cast\'s end, 노시스 S2 HIT keeps its own 0.1 s', () => {
    const a = manager();
    a.gameSpeed = () => 1;
    a.setFieldUnits([
      { id: 1, kind: 'op', side: 'ally', spine: 'char_494_vendla', defId: 'chess_char_1_06_a', skillIndex: 1 },
      { id: 2, kind: 'op', side: 'ally', spine: 'char_206_gnosis', defId: 'chess_char_4_13_a', skillIndex: 1 },
    ]);
    a.handleBattleEvents([['skill', 1, 1, null, [0.2, 0.6]]]);
    assert.deepEqual(a.played.filter((p) => p.f === 'p_imp_brmblhl_h.mp3').map((p) => p.delay), [0.6]);
    a.played.length = 0;
    a.handleBattleEvents([['skill', 2, 1, null, [0.5, 1.2]]]);
    const d = Object.fromEntries(a.played.filter((p) => /iceprick/.test(p.f)).map((p) => [p.f, p.delay]));
    assert.deepEqual(d, { 'p_atk_iceprick_h.mp3': 0.5, 'p_imp_iceprick_h.mp3': 0.6 });
  });

  test('real match path (Match → buildBattleSpec → createBattleFromSpec): 레온하르트 S2\'s event carries its strike, the blast waits for it', async () => {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    give(m, ps, 'chess_char_4_14_a', 'board', legalTileFor(m, ps, 'chess_char_4_14_a'));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const lion = b.allyUnits.find((u) => u.def?.charId === 'char_373_lionhd');
    let on = null;
    while (!b.finished && b.time < 150 && !on) { b.step(); on = b.drainEvents().find((x) => x[0] === 'skill' && x[1] === lion.id && x[2]); }
    assert.ok(on, 'his S2 was cast');
    const t = lion.skill.castTiming();
    assert.deepEqual(on[4], [Math.round(t.strike * 1000) / 1000, Math.round(t.action * 1000) / 1000]);
    assert.ok(on[4][0] > 0 && on[4][0] < on[4][1], `strike ${on[4][0]} inside the cast ${on[4][1]}`);
    const a = manager();
    a.gameSpeed = () => 1;
    a.setFieldUnits([{ id: lion.id, kind: 'op', side: 'ally', spine: 'char_373_lionhd', defId: 'chess_char_4_14_a', skillIndex: 1 }]);
    a.handleBattleEvents([on]);
    assert.deepEqual(a.played.filter((p) => p.f === 'p_skill_magblast.mp3').map((p) => p.delay), [on[4][0]]);
  });
});

describe('薄绿 S2: her end burst sounds ON_ABILITY_ATTACK_FINISH', () => {
  test('the kit key, its bank and the manifest', () => {
    assert.equal(KIT_HIT_BANKS['mint:s2end'], 'battle.ON_ABILITY_ATTACK_FINISH.skchr_mint_2');
    assert.equal(file(manifest.audio.sfx.kit['mint:s2end']), 'p_skill_magend.mp3');
    const unitOf = (id) => (id === 7 ? { def: 'char_388_mint' } : { def: 'char_1045_svash2' });
    assert.equal(kitHitKey('aoe', { id: 7, skill: 'mint_2', radius: 2 }, unitOf), 'mint:s2end');
    assert.equal(kitHitKey('aoe', { id: 7, skill: 'other' }, unitOf), null);
    assert.equal(kitHitKey('aoe', { id: 8, skill: 'svash2' }, unitOf), 'svash2:s2');
  });

  test('歌蕾蒂娅 S3: the tornado forming (kit fx \'tornado\') sounds its Chant\'s ON, skchr_glady_3.2', () => {
    assert.equal(KIT_HIT_BANKS['glady:s3'], 'battle.ON_ABILITY_ON.skchr_glady_3.2');
    assert.equal(file(manifest.audio.sfx.kit['glady:s3']), 'p_skill_seasummon.mp3');
    assert.equal(kitHitKey('tornado', { id: 7, tgt: 2 }, () => ({ def: 'char_474_glady' })), 'glady:s3');
    assert.equal(kitHitKey('tornado', { id: 7 }, () => ({ def: 'char_1028_texas2' })), null);
  });
});
