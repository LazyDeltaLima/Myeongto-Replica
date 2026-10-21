// test/render/fx-cast-timing.test.js — decompile check 2026-10-10 (docs/rules/fx.md 「시전 이펙트 시점·붙는 대상」): the
// client starts most of an attack's cast effects as its swing starts (ON_CAST_START), ends the loop ones with their cast,
// puts 아스트젠 더 라이트체이서 S3's link effect on one enemy, ends 쏜즈 더 로드스타's token / range with their projectile,
// swaps a SwitchableBackEffect while its owner faces back, shoots from the attack's own mount point, and picks
// DirectionType 4 (UD_OR_LR) slots by up / down first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirCopies } from '../../public/js/render/fxgame.js';
import { activationEffects, castPhase, castTiming, CAST_EVENT, foeEffects } from '../../public/js/render/fxmap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const FX = path.join(ROOT, 'public/assets/local/fx');

test('char_modes.py records each cast effect\'s start / end events (AbilityStandard.Event) and first-attack delay', () => {
  const tx = MODES.char_1028_texas2;
  // 텍사스 디 오메르토사 S2: both swords start with the swing and end with its cast
  assert.deepEqual(tx.castOpt[tx.modes.indexOf('S2')].texas2_skill_02_start, { s: 2, e: 3, o: 0 });
  assert.deepEqual(tx.castOpt[tx.modes.indexOf('S2')].texas2_skill_02_start_02, { s: 2, e: 3, o: 0 });
  // 니어 더 래디언트 나이트: the first attack's start effect waits 0.1 s (÷ the playback speed)
  assert.equal(MODES.char_1014_nearl2.castOpt[0].nearl2_attack_01_start.d, 0.1);
  // 엑시아 더 뉴 커버넌트: her normal attack's effect starts at the strike (ON_SPELL_ON); her S3 loop start once per cast
  assert.equal(MODES.char_1041_angel2.castOpt[0].angel2_attack_loop_start_01.s, CAST_EVENT.SPELL_ON);
  const s3 = MODES.char_1041_angel2.castOpt[MODES.char_1041_angel2.modes.indexOf('S3')];
  assert.equal(s3.angel2_skill_3_loop_start_01.once, 1);
  // every mode with cast effects carries their timings; the start is ON_CAST_START for most of them
  let n = 0, swing = 0;
  for (const [id, m] of Object.entries(MODES)) {
    if (id.startsWith('$')) continue;
    m.cast.forEach((list, i) => {
      for (const name of list) {
        const o = castTiming(m, i, name);
        assert.ok(o, `${id} mode ${i} ${name} has a timing`);
        n++; if (castPhase(o) === 'swing') swing++;
      }
    });
  }
  assert.ok(n > 300 && swing / n > 0.8, `${swing} of ${n} start at the swing`);
});

test('castPhase / castTiming: ON_CAST_START → the swing, the rest (and an older modes.json) → the strike', () => {
  assert.equal(castPhase({ s: 2, e: 3, o: 0 }), 'swing');
  assert.equal(castPhase({ s: 4, e: 3, o: 1 }), 'strike');
  assert.equal(castPhase({ s: 5, e: 3, o: 1 }), 'strike');
  assert.equal(castPhase(null), 'strike');
  const bind = { castOpt: [{ a: { s: 2, e: 3, o: 0 } }] };
  assert.deepEqual(castTiming(bind, 0, 'a'), { s: 2, e: 3, o: 0 });
  assert.equal(castTiming(bind, 1, 'a'), null);
  assert.equal(castTiming({}, 0, 'a'), null);
});

test('fxgame: swing → ON_CAST_START effects, atk → ON_SPELL_ON ones; loops end with their cast, a mode switch or the next swing', () => {
  assert.match(SRC, /case 'swing': \{\n\s+const src = views\.get\(e\[1\]\);\n.*eswingFx\(src, Number\(e\[2\]\) \|\| 0, e\[3\]\).*\n\s+if \(src\) src\._fxCombat = Number\(e\[6\]\) === 1;.*\n\s+if \(src\) swingFx\(src, Number\(e\[2\]\) \|\| 0, views, e\[3\]\);/);
  assert.match(SRC, /strikeFx\(src, mode, e\[3\], tgt\);/);
  assert.match(SRC, /playCast\(src, c, cast\.filter\(\(n\) => phaseOf\(src, mode, n\) === 'swing'\)\)/);
  assert.match(SRC, /playCast\(src, c, cast\.filter\(\(n\) => phaseOf\(src, mode, n\) === 'strike'\)\)/);
  // the cast lasts the anim-scaled clip: windup = scale × the OnAttack frame
  assert.match(SRC, /const scale = windup \/ hit;\n\s+return \{ len: dur \* scale, speed: 1 \/ scale \};/);
  // only the loop ones are cleared (OnCastFinish / ON_DETACHED: `!_oneshot`)
  assert.match(SRC, /if \(l\.tag === 'castLoop' && l\.owner === id && !l\.inst\.stopping\) l\.inst\.stop\(\);/);
  assert.match(SRC, /endCast\(v\); v\._fxFirstDone = null; v\._fxFoe = null;/);
  // the first attack's delay ÷ the playback speed
  assert.match(SRC, /const delay = c\.first && opt\?\.d > 0 \? opt\.d \/ c\.speed : 0;/);
});

test('아스트젠 더 라이트체이서 S3: the link effect is held by one enemy (its ability\'s _selector picks side 2, max 1), not by her', () => {
  const h = MODES.char_1047_halo2;
  const n = h.modes.indexOf('S3');
  assert.deepEqual(h.attachFoe[n], ['halo2_skill_03_buff_02']);
  assert.deepEqual(h.attachFoeMax, { halo2_skill_03_buff_02: 1 });
  const pre = [...h.attach[n], 'halo2_skill_03_buff_01', 'halo2_skill_03_buff_03'];
  assert.deepEqual(foeEffects(h, pre, n), ['halo2_skill_03_buff_02']);
  const act = activationEffects(h, pre, 2);
  assert.ok(!act.loops.includes('halo2_skill_03_buff_02'), 'not on her');
  assert.ok(act.loops.includes('halo2_skill_03_range_01'), 'her range stays on her');
  // the six other GeneralAbilities operators keep theirs (no selector)
  for (const id of ['char_1038_whitw2', 'char_4004_pudd', 'char_4140_lasher'].filter((x) => MODES[x])) assert.ok(!MODES[id].attachFoe, id);
  assert.match(SRC, /if \(src\._fxSkillOn\) foeFx\(src, tgt, mode\);/);
});

test('쏜즈 더 로드스타: the token / range are her projectile\'s, at its landing spot until it stops — not loops on her', () => {
  const t = MODES.char_1039_thorn2;
  assert.deepEqual(t.skills[0].zone, { fx: ['thorn2_token_start', 'thorn2_skill_01_token', 'thorn2_skill_01_range'], aura: [], onProj: 0 });
  assert.deepEqual(t.skills[1].zone, { fx: ['thorn2_token_start', 'thorn2_skill_02_token'], aura: ['thorn2_skill_02_range'], onProj: 1 });
  assert.deepEqual(t.skills[2].zone.fx, ['thorn2_token_start', 'thorn2_skill_03_token']);
  for (const sk of t.skills) assert.deepEqual(sk.target, [], 'no longer played on the damaged enemies');
  const pre = ['thorn2_skill_02_range', 'thorn2_skill_02_token', 'thorn2_token_start', 'thorn2_skill_start'];
  const act = activationEffects(t, pre, 1);
  assert.ok(!act.loops.includes('thorn2_skill_02_range') && !act.start.includes('thorn2_skill_02_range'), 'the S2 range is not on her');
  assert.match(SRC, /if \(\(e\[1\] === 'zone' \|\| e\[1\] === 'tornado' \|\| e\[1\] === 'storm'\) && zoneFx\(e, views\)\) \{ officialKitFx\(e, views\); return; \}/);
  assert.match(SRC, /spawn\(bundle, n, at, \{ owner: null, buff: false, until: nrec\.until \}, \{ over: false \}\)/);
});

test('歌蕾蒂娅 S3: her tornado (kit fx \'tornado\') plays her S3 projectile\'s reach effects at the marked point', () => {
  const g = MODES.char_474_glady;
  assert.deepEqual(g.skills[2].zone, { fx: ['glady_skill_03_range', 'glady_skill_03_range_02'], aura: [], onProj: 0 });
  assert.match(SRC, /e\[1\] === 'tornado' \|\| e\[1\] === 'storm'\) && zoneFx\(e, views\)/);
});

test('패신저 S3: the storm (kit fx \'storm\') plays her S3 projectile\'s range; each strike its chain graphic', () => {
  const p = MODES.char_472_pasngr;
  // projectile_chr_pasngr_s3: `_effectsWhenReached` + `_clearReachedEffectWhenStop`, `_effectsWhenHit`, and its chain graphic
  // (`_mainEffect` line, `_specialHitEffect` on the first unit — `_playSpecialEffectOnFirstOne`; `_playEffectOnHitPoint` 0: the line
  // runs through the units' feet)
  assert.deepEqual(p.skills[2].zone, { fx: ['pasngr_skill_03_range'], aura: [], onProj: 0 });
  assert.deepEqual(p.skills[2].target, ['pasngr_attack_hit']);
  assert.deepEqual(p.skills[2].chain, { line: ['pasngr_attack_line'], first: ['pasngr_skill_03_hit'], hit: 0 });
  assert.match(SRC, /if \(e\[1\] === 'lightning' && chainFx\(e, views\)\) return;/);
  assert.match(SRC, /const names = \[\.\.\.\(Number\(o\.i\) === 0 \? extracted\(src, c\.first\) : \[\]\), \.\.\.extracted\(src, sk\.target\)\];/);
  // one line per strike through its units (chainLine: FxInstance.setPath)
  assert.match(SRC, /if \(line && camRef\) chainLine\(`storm:\$\{o\.src\}:\$\{strikes\.get\(o\.src\) \|\| 0\}`, bundleOf\(src\)\.bundle, line, from, tgt, c\.hit === 1\);/);
  // 2026-10-17: the range ends with the storm as Effect.FinishMe (gone at once: no `_delayToFinish`), not by its particles —
  // its cloud is one 50 s particle that kept the field on the board
  assert.match(SRC, /zoneEnd\(l, nrec\.until, !nrec\.aura\.has\(l\)\);/);
  assert.match(SRC, /zoneEnd\(l, until, !rec\.aura\.has\(l\)\);/);
  assert.match(SRC, /l\.finishAt = until \+ \(fin > 0 \? fin : 0\);/);
  const range = path.join(FX, 'pasngr/pasngr_skill_03_range.json');
  if (existsSync(range)) {
    const def = JSON.parse(readFileSync(range, 'utf8'));
    assert.ok(!(def.finish > 0), 'no _delayToFinish');
    assert.ok(def.nodes.some((n) => n.ps?.loop && n.ps.life?.s >= 10), 'a particle that outlives the storm');
  }
});

test('UD_OR_LR (4): slot 0 facing up, else slot 2; the left / right slot when that one is empty; unknown types play nothing', () => {
  const g = [{ t: 4, s: ['a_up', 'a_right', 'a_down', 'a_left'] }];
  assert.deepEqual(dirCopies(g, ['a_up'], 0, false).names, ['a_up']);
  assert.deepEqual(dirCopies(g, ['a_up'], 1, false).names, ['a_down']);
  assert.deepEqual(dirCopies(g, ['a_up'], 3, true).names, ['a_down']);
  const side = [{ t: 4, s: ['a_up', 'a_right', '', 'a_left'] }];
  assert.deepEqual(dirCopies(side, ['a_up'], 2, true).names, ['a_left']);
  assert.deepEqual(dirCopies(side, ['a_up'], 1, false).names, ['a_right']);
  assert.deepEqual(dirCopies([{ t: 6, s: ['x', 'y', '', ''] }], ['x'], 1, false).names, []);
});

test('projectiles leave the attack\'s _mountPointType point (로즈몬티스 S2 GROUND, 포덴코 S2 SPECIAL_0, 토가와 사키코 SPECIAL_3)', () => {
  const r = MODES.char_391_rosmon;
  assert.equal(r.shotFrom[r.modes.indexOf('S2')], 7);
  assert.equal(MODES.char_258_podego.shotFrom[1], 5);
  assert.equal(MODES.char_4182_oblvns.shotFrom[0], 9);
  // MUZZLE (2) is the default: not written
  for (const m of Object.values(MODES)) for (const x of m?.shotFrom || []) assert.notEqual(x, 2);
});

test('SwitchableBackEffect: the front pauses and the back copy plays while the owner faces back', () => {
  // (2026-10-21) the test lives in render/fx/pause.js (PauseEffectIf's face check asks the same)
  assert.match(SRC, /const faceBack = facesBack;/);
  assert.match(readFileSync(path.join(ROOT, 'public/js/render/fx/pause.js'), 'utf8'), /export const facesBack = \(v\) => !!\(v && \(v\.entryBack \?\? v\.dir === 'UP'\)\);/);
  assert.match(SRC, /if \(back\) startBack\(l\);\n\s+else if \(sw\.entry\) \{ sw\.entry\.inst\.stop\(true\); sw\.entry = null; \}/);
  const py = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
  assert.match(py, /BACK_SCRIPT = 7599136815520768295/);
  assert.match(py, /return \{'effect': t\['_backEffect'\], 'predict'/);
});

const CELLO = path.join(FX, 'cello', 'cello_skill_03_buff_front_02.json');
const celloBack = existsSync(CELLO) && JSON.parse(readFileSync(CELLO, 'utf8')).back;
test('the extracted 비르투오사 S3 front glow names its back copy (after fx_extract.py --back-only)', { skip: !celloBack && 'no extracted back switch' }, () => {
  assert.deepEqual(celloBack, { effect: 'cello_skill_03_buff_back_02', predict: 0, oneShot: 0 });
});
