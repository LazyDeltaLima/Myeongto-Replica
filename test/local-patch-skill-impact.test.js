// test/local-patch-skill-impact.test.js — maintainer report 2026-10-08 「이격 니어 S3 발동 후 적을 타격할 때마다 전용 효과음… 여러 종류
// 효과음이 같이 재생」 (docs/rules/audio.md 「START·ON·HIT」): an ability with a START bank (the swing) and an ON bank sounds
// both — 耀骑士临光 S3 attack.3 p_atk_goldspear_s + p_imp_goldspear_s. 2026-10-10 (the client: START / ON / HIT are separate
// signals and the middleware plays every bank of the name): the ON bank is its own role `on`, played with the attack ('atk',
// AbilityStandard.DoEmitAudioSignalForSpellOn) whatever its mixer group — no longer as the impact (tools/assets/skill-mode-sfx.mjs
// onBeside, audio.mjs pickUnitSfx).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioManager } from '../public/js/audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));
const UNITS = manifest.audio.sfx.units;
const OFFICIAL = path.join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
const file = (u) => String(u).split('/').pop();

describe('swing + its ON bank (START + ON both sound)', () => {
  test('the manifest: 耀骑士临光 S3 and the other entries the rule fills', () => {
    const s3 = UNITS.char_1014_nearl2.modes['2'];
    assert.deepEqual([file(s3.attack), file(s3.on), s3.hit ?? null, s3.noHit ?? null], ['p_atk_goldspear_s.mp3', 'p_imp_goldspear_s.mp3', null, true]);
    assert.deepEqual(s3.grp, { attack: 'Battle_P_SAtk', on: 'Battle_P_SImp' });
    // 归溟幽灵鲨 S3, 夕 S2 / S3, 卡涅利安 S1–S3 (modes) and 夕 / 莫斯提马 / 水月 / 野鬃 (their normal attack)
    const modeOns = [['char_1023_ghost2', '2', 'p_imp_sharpsaw_s.mp3'], ['char_2015_dusk', '1', 'p_imp_ancientsword_h.mp3'], ['char_2015_dusk', '2', 'p_imp_ancientsword_s.mp3'],
      ['char_426_billro', '0', 'p_imp_goldexplo_n.mp3'], ['char_426_billro', '1', 'p_imp_goldexplo_h.mp3'], ['char_426_billro', '2', 'p_imp_goldexplo_s.mp3']];
    for (const [id, i, f] of modeOns) assert.equal(file(UNITS[id].modes[i].on), f, `${id} mode ${i}`);
    const plain = [['char_2015_dusk', 'p_imp_ancientsword_n.mp3'], ['char_213_mostma', 'p_imp_timewand_n.mp3'], ['char_437_mizuki', 'p_imp_tentacle_n.mp3'], ['char_496_wildmn', 'p_imp_spearstab_n.mp3']];
    for (const [id, f] of plain) assert.equal(file(UNITS[id].on), f, id);
    // and an ON bank on an attack group beside a START too (阿斯卡纶 p_atk_smksndrtspd_n)
    assert.equal(file(UNITS.char_4132_ascln.on), 'p_atk_smksndrtspd_n.mp3');
  });

  test('generator rule on the official audio_data: exact START + ON keys only', { skip: !existsSync(OFFICIAL) && 'no .cache/gamedata' }, async () => {
    const { indexAudio } = await import('../tools/assets/audio.mjs');
    const { onBeside } = await import('../tools/assets/skill-mode-sfx.mjs');
    const audio = indexAudio(JSON.parse(readFileSync(OFFICIAL, 'utf8')));
    const at = (id, ab) => (onBeside(audio.unitBanks.get(id), ab) || []).map(file);
    assert.deepEqual(at('char_1014_nearl2', 'attack.3'), ['p_imp_goldspear_s.mp3']);
    // an ON bank alone is the swing itself (缄默德克萨斯 S2 attack.2 —'s noHit stays)
    assert.deepEqual(at('char_1028_texas2', 'attack.2'), []);
    assert.equal(UNITS.char_1028_texas2.modes['1'].noHit, true);
    // 号角 S2: START only under its Burst sub-abilities — not this rule's shape
    assert.deepEqual(at('char_4039_horn', 'attack.1'), []);
  });

  test('real match path: every 耀骑士临光 S3 attack sounds its swing and its ON bank', async () => {
    const { makeMatch, give, legalTileFor } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    assert.ok(ps.setLoadout({ chess_char_6_17_a: { skill: 2 } }), 'loadout');
    give(m, ps, 'chess_char_6_17_b', 'board', legalTileFor(m, ps, 'chess_char_6_17_b'));
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    m.dispose?.();
    const u = b.allyUnits.find((x) => x.kind === 'op');
    const a = new AudioManager({ win: null, getManifest: () => manifest, random: () => 0 });
    const played = [];
    a.ctx = { currentTime: 0 };
    a._play = (url, o) => played.push({ f: file(url), key: o.unitKey });
    a.voice = () => false;
    const feed = () => { b.step(); a.handleBattleEvents(b.drainEvents()); };
    a.handleBattleEvents(b.drainEvents());
    while (b.time < 1) feed();
    if (a._opening) a._opening.over = true; // past the opening burst (wall-clock window)
    played.length = 0;
    u.skill.activate('manual', { free: true });
    a.handleBattleEvents(b.drainEvents());
    // S3's start: the generic boost, her own goldspearboost1 and the 耀阳 sword's birth
    assert.deepEqual(played.map((p) => p.f).filter((f) => /boost|goldspearset/.test(f)), ['p_skill_goldspearboost1.mp3', 'b_char_atkboost.mp3', 'p_skill_goldspearset.mp3']);
    while (u.skill.active && b.time < 40 && !b.finished) feed();
    const swings = played.filter((p) => p.f === 'p_atk_goldspear_s.mp3').length;
    const ons = played.filter((p) => p.f === 'p_imp_goldspear_s.mp3').length;
    assert.ok(swings > 0 && ons === swings, `swings ${swings}, ON ${ons}`);
  });
});
