// test/render/fx-round2.test.js — official client, round 2 (2026-10-11, docs/rules/fx.md 「입력 대상·루프 타격·클립별 이펙트·배치
// 이펙트」): InputTargetEffectOptions on the main target at their own event, looping hits ended with their cast, all of a
// cast's effects cut by 麻痹, the clip groups of an UberAnimationEffectEmitter, the operators' deploy / dead effects, an
// enemy's debuff mark held for its buff's life, and the extractor's root effect component read by its shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { activationEffects, castPhase, castTiming, clipGroup, deadEffect, DEPLOY_FX, deployEffect, hitLoopEnd } from '../../public/js/render/fxmap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const PY = (f) => readFileSync(path.join(ROOT, 'tools/local-extract', f), 'utf8');

test('char_modes.py: _inputTargetEffects are the mode\'s `input` (timed by castOpt t / p), not its hits', () => {
  const d = MODES.char_2015_dusk;
  assert.deepEqual(d.input[0], ['dusk_attack_01_hit', 'dusk_attack_01_hit_02']);
  assert.deepEqual(d.castOpt[0].dusk_attack_01_hit, { s: 4, e: 3, o: 1, t: 1, p: 1 });
  // the swing-start loop on the target until the strike
  assert.deepEqual(d.castOpt[0].dusk_attack_01_hit_02, { s: 2, e: 4, o: 0, t: 1, p: 1 });
  assert.equal(castPhase(castTiming(d, 0, 'dusk_attack_01_hit_02')), 'swing');
  // 위셔델 S3's aim: on the target, without _useInputPos
  const w = MODES.char_1035_wisdel;
  assert.deepEqual(w.castOpt[w.modes.indexOf('S3')].wisdel_skill_03_hit_03, { s: 2, e: 3, o: 1, t: 1 });
  // 페페 S2, 모스티마, 산탈라, 레온하르트 (once per cast)
  assert.deepEqual(MODES.char_4058_pepe.input[1], ['pepe_skill_02_hit_01']);
  assert.equal(MODES.char_373_lionhd.castOpt[0].lionhd_attack_01_hit.once, 1);
  for (const id of ['char_2015_dusk', 'char_1035_wisdel', 'char_213_mostma', 'char_341_sntlla', 'char_373_lionhd', 'char_4058_pepe']) {
    const m = MODES[id];
    m.input.forEach((list, i) => { for (const n of list) assert.ok(!m.hit[i].includes(n), `${id} ${n} is no hit`); });
  }
  // a skill activation never plays them on the caster
  const act = activationEffects(d, ['dusk_attack_01_hit_02', 'dusk_skill_03_hit_02', 'dusk_skill_03_start'], 2);
  assert.ok(!act.start.includes('dusk_skill_03_hit_02') && !act.loops.includes('dusk_skill_03_hit_02'));
});

test('char_modes.py: looping hits (hitLoop), cast-target hits (castTgt), clip groups (clipFx), deploy / dead effects', () => {
  assert.deepEqual(MODES.char_103_angel.hitLoop, { angle_attack_01_hit: 6, angle_attack_02_hit: 6 });
  assert.equal(hitLoopEnd(MODES.char_103_angel, 'angle_attack_01_hit'), 6);
  assert.equal(hitLoopEnd(MODES.char_103_angel, 'other'), null);
  assert.deepEqual(MODES.char_1045_svash2.castTgt, ['svash2_attack_hit_01']);
  const s = MODES.char_1019_siege2;
  assert.deepEqual(s.clipFx[0], { src: 'Attack_1', loop: 1, groups: [
    { anim: 'Attack_1', cast: ['siege2_attack_start_01'], hit: [] }, { anim: 'Attack_2', cast: ['siege2_attack_start_02'], hit: [] }] });
  assert.deepEqual(s.castOpt[0].siege2_attack_start_02, { s: 2, e: 3, o: 0 });
  assert.equal(MODES.char_2015_dusk.start, 'dusk_birth_01_start');
  assert.equal(MODES.char_4145_ulpia.modeStart[MODES.char_4145_ulpia.modes.indexOf('S3_Respawn_A')], 'ulpia_skill_03_bith_01');
});

test('cast-target effects (2026-10-26): timed in castOpt (t 2); the swing-start ones play on the target as the swing starts, not with the hits', () => {
  const p = MODES.char_1042_phatm2;
  // 酒神: her aim mark over the target at ON_CAST_START — S3's loops until the cast's end
  assert.deepEqual(p.castOpt[0].phatm2_attack_hit_aim_01, { s: 2, e: 3, o: 1, t: 2 });
  assert.deepEqual(p.castOpt[1].phatm2_skill_02_hit_aim_01, { s: 2, e: 3, o: 1, t: 2 });
  assert.deepEqual(p.castOpt[2].phatm2_skill_03_hit_aim_01, { s: 2, e: 3, o: 0, t: 2 });
  assert.equal(castPhase(castTiming(p, 0, 'phatm2_attack_hit_aim_01')), 'swing');
  // 凛御银灰's (an ability group's child): at the strike — it stays with the hits
  assert.deepEqual(MODES.char_1045_svash2.castOpt[0].svash2_attack_hit_01, { s: 4, e: 3, o: 1, t: 2 });
  assert.equal(castPhase(castTiming(MODES.char_1045_svash2, 0, 'svash2_attack_hit_01')), 'strike');
  assert.match(PY('char_modes.py'), /cast_target_timing\(d, cast_opt\[i\]\)/);
  assert.match(PY('char_modes.py'), /cast_target_timing\(x, timing\[i\]\)/);
  // fxgame: on the swing's target (its 6th field), the strike's when the swing named none; out of the hit list before its cap
  assert.match(SRC, /const face = faceId != null \? views\.get\(faceId\) \|\| null : null;/);
  assert.match(SRC, /castTgtFx\(src, c, mode, kind, face\);/);
  assert.match(SRC, /if \(c\.ctLate\) castTgtFx\(src, c, mode, kind, tgt, true\);/);
  assert.match(SRC, /\.filter\(\(n\) => !swingTarget\(a\.src, a\.mode, n\) && !shotHit\(a\.src, a\.mode, n\)\)\.slice\(0, MAX_HIT_FX\)/);
});

test('clipGroup: the group of the clip played, else LOOP the next one / RANDOM one at random', () => {
  const cf = { loop: 1, groups: [{ anim: 'Attack_1', cast: ['a'] }, { anim: 'Attack_2', cast: ['b'] }] };
  assert.equal(clipGroup(cf, 'Attack_2', -1, 0).cast[0], 'b');
  assert.equal(clipGroup(cf, 'attack_1', -1, 0.9).index, 0, 'by the clip, without case');
  assert.equal(clipGroup(cf, 'Attack', -1, 0.9).index, 1, 'RANDOM');
  assert.equal(clipGroup({ ...cf, loop: 0 }, 'Attack', 0, 0).index, 1, 'LOOP: the next');
  assert.equal(clipGroup({ ...cf, loop: 0 }, 'Attack', 1, 0).index, 0);
  assert.equal(clipGroup(null, 'Attack_1'), null);
});

test('deployEffect / deadEffect: the mode\'s override, the root\'s, else common_char_birth_01 / common_call_start_01 / common_char_die_01', () => {
  assert.deepEqual(deployEffect(null, false), { name: DEPLOY_FX.op, override: false });
  assert.deepEqual(deployEffect(null, true), { name: 'common_call_start_01', override: false });
  assert.deepEqual(deployEffect({ start: 'dusk_birth_01_start' }, false), { name: 'dusk_birth_01_start', override: false });
  const u = MODES.char_4145_ulpia;
  assert.deepEqual(deployEffect(u, false, 0), { name: DEPLOY_FX.op, override: false });
  assert.deepEqual(deployEffect(u, false, u.modes.indexOf('S3')), { name: 'ulpia_skill_03_bith_01', override: true });
  assert.equal(deadEffect(null), 'common_char_die_01');
  assert.equal(deadEffect({ dead: 'vigil_token_die' }), 'vigil_token_die');
});

test('fxgame: input effects on the main target, looping hits end with the cast, 麻痹 cuts the cast, debuff marks held', () => {
  // input: the swing's on its main target (the 'swing' face), else its last attack's target (or at the strike), the strike's on its first target
  assert.match(SRC, /inputFx\(src, c, mode, 'swing', face\);/);
  assert.match(SRC, /c\.inTgt = tgt \|\| lastTarget\(v\);/);
  assert.match(SRC, /inputFx\(src, c, mode, 'strike', tgt\);/);
  assert.match(SRC, /if \(dead && !opt\?\.p\) return;/);
  assert.match(SRC, /play\(v, 'attackHit', 0, \{ at, names: \[n\], tag: loop \? 'castLoop' : 'cast', until: end, speed: c\.speed, cast: c \}\);/);
  // looping hits: tagged castLoop (endCast / stopOwned end them), until the cast's end
  assert.match(SRC, /play\(src, 'attackHit', 0, \{ at: tgt, names: \[n\], aim: src, tag: 'castLoop', until, cast: c \}\);/);
  assert.match(SRC, /if \(l\.owner === ownerId && \(l\.buff \|\| l\.onCaster \|\| l\.tag === 'castLoop'\)\) l\.inst\.stop\(true\);/);
  // cast-target hits at the ability's speed
  assert.match(SRC, /names: quick, aim: src, speed: c\?\.speed \|\| 1/);
  // 麻痹: every effect of the cast, and what still loads
  assert.match(SRC, /if \(e\[1\] === 'palsy' && e\[4\]\?\.id != null\) \{[^\n]*\n\s*const v = views\.get\(e\[4\]\.id\);\n\s*if \(v\) cutCast\(v\);\n\s*if \(palsyFx\(e, views\)\) \{ ownFx\.add\(e\); return; \}/);
  assert.match(SRC, /for \(const l of live\) if \(l\.cast === c && !l\.inst\.stopping\) l\.inst\.stop\(\);/);
  assert.match(SRC, /if \(entry\.cast\?\.cut\) \{ inst\.dispose\(\); return null; \}/);
  // clip groups: cast at the swing, hits at the damage
  assert.match(SRC, /c\.group = castGroup\(src, mode, sig, .*\);/);
  assert.match(SRC, /const all = withGroup\(hitList, c\?\.group\?\.hit\);\n\s*const hits = all\.filter\(\(n\) => !swingTarget\(a\.src, a\.mode, n\) && !shotHit\(a\.src, a\.mode, n\)\)\.slice\(0, MAX_HIT_FX\);/);
  // the enemy's debuff mark: one per name per unit, renewed by a hit while it stands
  assert.match(SRC, /if \(Array\.isArray\(part\.hitBuff\) && part\.hitBuff\.length\) eholdBuff\(src, part, tgt\);/);
  assert.match(SRC, /const key = `\$\{tid\}:\$\{n\}`;/);
  // deploy effects after the view exists; dead effect on a knock-out only
  assert.match(SRC, /if \(index\) flushDeploys\(lastViews\);/);
  assert.match(SRC, /if \(reason !== 'killed' \|\| !isAlly\(v\) \|\| failed \|\| q\(\) === 'low'\) return;/);
});

// the layer driven with stub tables (no three.js in node: the decisions only, as test/render/enemy-fx-layer.test.js)
const files = {
  '/assets/local/fx/index.json': { bundles: { common: ['common_char_birth_01', 'common_char_die_01'], dusk: ['dusk_attack_01_hit', 'dusk_attack_01_hit_02', 'dusk_attack_01_start'] } },
  '/assets/local/fx/modes.json': { char_2015_dusk: MODES.char_2015_dusk },
  '/assets/local/fx/enemy-modes.json': { $fx: { m: ['b', 'm'] }, enemy_x: { modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: [], opt: {}, hit: [], hitBuff: ['m'], hitBuffLife: { m: 5 } } }] } },
};
const settle = () => new Promise((r) => setTimeout(r, 5));
test('fx layer: an operator\'s knock-out dead effect replaces the death puff (not a retreat); input / 麻痹 / deploy events never break it', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high' });
    await settle();
    const op = (id) => ({ id, x: 1, y: 1, alive: true, info: { id, side: 'ally', kind: 'op', defId: 'char_2015_dusk', spine: 'char_2015_dusk' } });
    const a = op(1), b = op(2), en = { id: 9, x: 3, y: 1, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_x' } };
    const views = new Map([[1, a], [2, b], [9, en]]);
    const cam = { liftFor: () => 0, scaleAt: () => 64, dist: 10 };
    assert.doesNotThrow(() => {
      layer.onEvent(['deploy', 1], views);
      layer.update(0.016, cam, { width: 10, height: 10 });
      layer.onEvent(['swing', 1, 0.5, 'none'], views);
      layer.onEvent(['atk', 1, 9, 'none'], views);
      layer.onEvent(['dmg', 9, 100, 'phys', 0, 1], views);
      layer.onEvent(['swing', 9, 0.4, 'none'], views);
      layer.onEvent(['fx', 'palsy', 3, 1, { x: 3, y: 1, id: 9 }], views);
      layer.onEvent(['atk', 9, 1, 'none'], views);
      layer.onEvent(['dmg', 1, 50, 'phys', 0, 9], views);
      layer.update(0.016, cam, { width: 10, height: 10 });
    });
    layer.onEvent(['die', 1, 'killed'], views);
    assert.equal(layer.ownsDeath(a), true, 'common_char_die_01 plays instead');
    layer.onEvent(['die', 2, 'retreat'], views);
    assert.equal(layer.ownsDeath(b), false, 'a retreat keeps the puff');
    layer.onEvent(['deploy', 1], views);
    assert.equal(layer.ownsDeath(a), false, 'redeployed');
  } finally { globalThis.fetch = saved; }
});

test('extractors: the root effect component by its shape (any _limitedPlaybackSpeed, _subFXDelayConfigs), hitBuffLife', () => {
  const fx = PY('fx_extract.py');
  assert.doesNotMatch(fx, /ints\[10\] == 1073741824/, 'no _limitedPlaybackSpeed == 2.0 condition');
  assert.match(fx, /s = 4 \+ 4 \* subs/);
  assert.match(fx, /FXDELAY_SCRIPT = 4526430437831129839/);
  assert.match(fx, /ap\.add_argument\('--root-only'/);
  const cm = PY('char_modes.py');
  assert.match(cm, /MODE_HIT_KEYS = \('_hitEffects', '_castTargetEffects'\)/);
  assert.match(cm, /'input', 'hit', 'hitGroups', 'tgtStart', 'hitLoop', 'castTgt', 'clipFx'/);
  assert.match(PY('enemy_bindings.py'), /part\['hitBuffLife'\] = life/);
});

const TX = path.join(ROOT, 'public/assets/local/fx/texas2/texas2_skill_02_start.json');
const tx = existsSync(TX) && JSON.parse(readFileSync(TX, 'utf8'));
test('the extracted 텍사스 디 오메르토사 S2 start has its spawn (after fx_extract.py --root-only)', { skip: !(tx && tx.face) && 'not re-extracted' }, () => {
  assert.equal(tx.spawn, 1);
  assert.deepEqual(tx.face, { rot: 1, limit: -1, fxDelay: 0.17 });
});
