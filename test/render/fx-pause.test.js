// test/render/fx-pause.test.js — docs/rules/fx.md 「이펙트 멈춤·끝 조건」: the client's effect behaviours that pause or finish
// their effect, carried by the extract per node (fx_extract.py pause_scripts) and applied each frame by render/fxgame.js
// stepPauses with render/fx/pause.js: PauseEffectIf (the owner's abnormal flags / combo / facing, OR-ed or AND-ed; what
// the view cannot answer is left out), PauseAnotherEffect (the owner's effect of a name held while this one plays),
// PauseEffectWithAnimation (the owner's Spine clip, with its delays), PauseEffectIfNotIdle, PauseEffectIfSpineEvent (the
// model's OnDeactivateEffect / OnActivateEffect) and FinishEffectIf. A paused effect is not drawn and not stepped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UF, ANIM } from '../../shared/constants.js';
import { UF_CAMOU } from '../../shared/local.js';
import { pauseIfNow, animPause, idlePause, clipOf } from '../../public/js/render/fx/pause.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const EXTRACT = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
const COVERAGE = readFileSync(path.join(ROOT, 'tools/local-extract/fx_coverage.py'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const prefab = (p) => JSON.parse(readFileSync(path.join(FX, `${p}.json`), 'utf8'));
const extracted = ['buff/buff_cold', 'mudrok/mudrok_buff_01_start', 'aglna2/aglna2_skill_02_buff_weapon_02'].every((p) => existsSync(path.join(FX, `${p}.json`)));

const view = (flags = 0, extra = {}) => ({ id: 1, flags, statuses: new Set(), anim: ANIM.IDLE, dir: 'RIGHT', ...extra });

test('fx_extract.py reads the six behaviours by their field names onto the node, and EmptyEffect\'s `_delayToFinish`; fx_coverage counts them read', () => {
  assert.match(EXTRACT, /PAUSE_IF_SCRIPT = -5974768320951421776/);
  assert.match(EXTRACT, /FINISH_IF_SCRIPT = -6490124024613466648/);
  assert.match(EXTRACT, /EMPTY_EFFECT_SCRIPT = -488665936260092151/);
  assert.match(EXTRACT, /node\.update\(self\.pause_scripts\(go\)\)/);
  for (const s of ['EmptyEffect', 'PauseEffectIf', 'PauseAnotherEffect', 'PauseEffectIfNotIdle', 'PauseEffectWithAnimation', 'PauseEffectIfSpineEvent', 'FinishEffectIf']) {
    assert.match(COVERAGE, new RegExp(`SCRIPTS_READ = \\{[^}]*'${s}'`), s);
    assert.doesNotMatch(COVERAGE, new RegExp(`'script:${s}': \\(_TODO`), s);
  }
});

test('the extracted records: 寒冷 pauses under 冻结, 晕眩 when not stunned (its immunity left to the view), 泥岩\'s first layer holds the other two, 予愿安洁莉娜 S2\'s weapon by her takeoff end', { skip: !extracted && 'no extracted effects' }, () => {
  assert.deepEqual(prefab('buff/buff_cold').nodes[0].pauseIf, { when: [{ flag: 'FROZEN' }], onPlay: true });
  assert.deepEqual(prefab('buff/buff_stun').nodes[0].pauseIf, { when: [{ immune: 'STUNNED' }, { flag: 'STUNNED', not: 1 }] });
  assert.deepEqual(prefab('mudrok/mudrok_buff_01_start').nodes[0].pauseOther.map((r) => r.effect), ['mudrok_buff_02_start', 'mudrok_buff_03_start']);
  assert.deepEqual(prefab('aglna2/aglna2_skill_02_buff_weapon_02').nodes[0].pauseAnim, { invalid: ['Skill_2_Takeoff_End'], restore: true, pre: 0.3 });
  assert.equal(prefab('pasngr/pasngr_attack_line').finish, 0.5, 'an EmptyEffect root\'s `_delayToFinish`');
});

test('pauseIfNow: the answered terms OR-ed (AND with `all`), the flags from the view (隐匿 without 迷彩), null when nothing is answered', () => {
  const cold = { when: [{ flag: 'FROZEN' }] };
  assert.equal(pauseIfNow(cold, view(UF.COLD | UF.FROZEN)), true);
  assert.equal(pauseIfNow(cold, view(UF.COLD)), false);
  const stun = { when: [{ immune: 'STUNNED' }, { flag: 'STUNNED', not: 1 }] };
  assert.equal(pauseIfNow(stun, view(UF.STUNNED)), false);
  assert.equal(pauseIfNow(stun, view(0)), true);
  assert.equal(pauseIfNow({ when: [{ immune: 'STUNNED' }] }, view(0)), null, 'an immunity is not answered');
  assert.equal(pauseIfNow({ when: [{ flag: 'SP_MODIFY_STOPPED' }, { buff: ['x'] }] }, view(0)), null);
  const both = { when: [{ flag: 'STUNNED' }, { flag: 'COLD' }] };
  assert.equal(pauseIfNow(both, view(UF.STUNNED)), true);
  assert.equal(pauseIfNow({ ...both, all: true }, view(UF.STUNNED)), false);
  const hid = { when: [{ flag: 'INVISIBLE', not: 1 }] };
  assert.equal(pauseIfNow(hid, view(UF.STEALTH)), false);
  assert.equal(pauseIfNow(hid, view(UF.STEALTH | UF_CAMOU)), true, '迷彩 is no 隐匿');
  assert.equal(pauseIfNow({ when: [{ combo: 'SLEEPING', not: 1 }] }, view(UF.SLEEP)), false);
  assert.equal(pauseIfNow({ when: [{ flag: 'SILENCED' }] }, view(0, { statuses: new Set(['silence']) })), true);
  assert.equal(pauseIfNow({ when: [{ back: 1 }] }, view(0, { dir: 'UP' })), true);
  assert.equal(pauseIfNow({ when: [{ back: 1 }] }, view(0, { entryBack: false, dir: 'UP' })), false);
});

test('animPause / idlePause / clipOf', () => {
  const rec = { invalid: ['Skill_2_Takeoff_End'], restore: true };
  assert.equal(animPause(rec, 'Skill_2_Takeoff_End'), true);
  assert.equal(animPause(rec, 'Idle'), false);
  assert.equal(animPause({ invalid: ['Die'] }, 'Idle'), null, 'no restore without `_noPauseWhenValid`');
  assert.equal(animPause({ valid: ['Skill_3_Loop'] }, 'Idle'), true);
  assert.equal(animPause(rec, null), null);
  assert.equal(idlePause({ back: false, front: false }, view(0, { anim: ANIM.ATTACK })), true);
  assert.equal(idlePause({ back: false, front: false }, view(0)), false);
  assert.equal(idlePause({ back: true, front: false }, view(0, { dir: 'UP' })), true);
  assert.equal(clipOf({ actor: { spine: { state: { getCurrent: () => ({ animation: { name: 'Attack' } }) } } } }), 'Attack');
  assert.equal(clipOf({}), null);
});

// stepPauses / setPaused / releaseOthers / the layer's spineEvent, from fxgame.js with their collaborators given
const body = (head) => {
  const at = SRC.indexOf(head);
  assert.ok(at >= 0, head);
  return SRC.slice(at, SRC.indexOf('\n  }\n', at) + 4);
};
const line = (head) => { const at = SRC.indexOf(head); assert.ok(at >= 0, head); return SRC.slice(at, SRC.indexOf('\n', at)); };
const method = (head) => { const at = SRC.indexOf(head); assert.ok(at >= 0, head); return SRC.slice(at, SRC.indexOf('\n    },\n', at) + 6); };
function harness() {
  const env = { clockS: 0, live: [], lastViews: new Map() };
  const src = [line('const entryOwner = '), body('function setPaused(l)'), line('const behPause = '), body('function releaseOthers(l)'),
    body('function stepPauses(l)'), `const spineEvent = ${method('    spineEvent(id, name)').trim().replace(/^spineEvent/, 'function')};`,
    'return { stepPauses, setPaused, spineEvent };'].join('\n');
  const make = new Function('env', 'pauseIfNow', 'idlePause', 'animPause', 'clipOf',
    `with (env) { ${src} }`);
  return { env, ...make(env, pauseIfNow, idlePause, animPause, clipOf) };
}
const entry = (name, owner, pausers = [], extra = {}) => ({
  owner, paused: false,
  inst: { def: { name }, pausers, stopping: false, done: false, time: 0, clips: [], clipLoops: false, clipLen: 0, object: { visible: true }, stop() { this.stopping = true; },
    get animEnded() { return !!this.clips.length && !this.clipLoops && this.time >= this.clipLen; } },
  ...extra,
});

test('stepPauses: PauseEffectIf hides and resumes its effect with its owner; PauseAnotherEffect holds the owner\'s effect of that name until it ends', () => {
  const h = harness();
  const v = view(UF.FROZEN);
  h.env.lastViews.set(1, v);
  const cold = entry('buff_cold', 1, [{ k: 'pauseIf', rec: { when: [{ flag: 'FROZEN' }] } }]);
  h.env.live.push(cold);
  h.stepPauses(cold);
  assert.equal(cold.paused, true);
  assert.equal(cold.inst.object.visible, false, 'not drawn while paused');
  v.flags = UF.COLD;
  h.stepPauses(cold);
  assert.deepEqual([cold.paused, cold.inst.object.visible], [false, true]);
  // 泥岩: the first layer's effect holds the second and third (`update`: one that comes later too)
  const l2 = entry('mudrok_buff_02_start', 1), other = entry('mudrok_buff_02_start', 2);
  const l1 = entry('mudrok_buff_01_start', 1, [{ k: 'pauseOther', rec: { effect: 'mudrok_buff_02_start', pre: 0, update: true } }, { k: 'pauseOther', rec: { effect: 'mudrok_buff_03_start', pre: 0, update: true } }]);
  h.env.live.push(l2, other, l1);
  h.stepPauses(l1);
  assert.deepEqual([l2.paused, other.paused], [true, false], 'the owner\'s only');
  const l3 = entry('mudrok_buff_03_start', 1);
  h.env.live.push(l3);
  h.stepPauses(l1);
  assert.equal(l3.paused, true, 'a later one with `update`');
  l1.inst.stopping = true;
  h.stepPauses(l1);
  assert.deepEqual([l2.paused, l3.paused, l2.inst.object.visible], [false, false, true], 'given back as it finishes');
  // `pre`: 0.2 s later (민트 S2)
  const base = entry('mint_skill_02_range', 1);
  const mint = entry('mint_skill_02_range_02', 1, [{ k: 'pauseOther', rec: { effect: 'mint_skill_02_range', pre: 0.2, update: false } }]);
  h.env.live.push(base, mint);
  h.stepPauses(mint);
  assert.equal(base.paused, false);
  h.env.clockS = 0.25;
  h.stepPauses(mint);
  assert.equal(base.paused, true);
});

test('stepPauses: PauseEffectWithAnimation pauses after its delay and finishes with `finish`; restores with `restore`; Spine events and FinishEffectIf', () => {
  const h = harness();
  let clip = 'Skill_2_Loop';
  const v = view(0, { actor: { spine: { state: { getCurrent: () => ({ animation: { name: clip } }) } } } });
  h.env.lastViews.set(1, v);
  const w = entry('aglna2_skill_02_buff_weapon_02', 1, [{ k: 'pauseAnim', rec: { invalid: ['Skill_2_Takeoff_End'], restore: true, pre: 0.3 } }], { speed: 1 });
  const trail = entry('aglna2_skill_02_fly_trail_up_01', 1, [{ k: 'pauseAnim', rec: { invalid: ['Skill_2_Takeoff_End'], finish: true } }]);
  h.env.live.push(w, trail);
  h.stepPauses(w); h.stepPauses(trail);
  assert.deepEqual([w.paused, trail.paused], [false, false]);
  clip = 'Skill_2_Takeoff_End';
  h.stepPauses(w); h.stepPauses(trail);
  assert.equal(w.paused, false, 'waits `_delayToPause`');
  assert.deepEqual([trail.paused, trail.inst.stopping], [true, true], '`_finishIfPause`');
  h.env.clockS = 0.31;
  h.stepPauses(w);
  assert.equal(w.paused, true);
  clip = 'Idle';
  h.stepPauses(w);
  assert.equal(w.paused, false, '`_noPauseWhenValid`');
  // PauseEffectIfSpineEvent: OnDeactivateEffect / OnActivateEffect of its owner, only inside `anims`
  clip = 'Skill_3_Combat';
  const sw = entry('svash2_skill_03_buff_weapon_01', 1, [{ k: 'pauseSpine', rec: { start: false, invert: false, anims: ['Skill_3_Combat'] } }]);
  h.env.live.push(sw);
  h.stepPauses(sw);
  h.spineEvent(1, 'OnDeactivateEffect');
  h.stepPauses(sw);
  assert.equal(sw.paused, true);
  h.spineEvent(1, 'OnActivateEffect');
  assert.equal(sw.paused, false);
  // (2026-10-23) the front model's Skill_3_Combat sends OnActivateEffect and OnDeactivateEffect both at 0.233 s, in that
  // order, then OnActivateEffect at 0.533 s: the last of one frame's events wins — hidden over the strike (0.5 s)
  h.spineEvent(1, 'OnActivateEffect');
  h.spineEvent(1, 'OnDeactivateEffect');
  assert.equal(sw.paused, true);
  h.spineEvent(1, 'OnActivateEffect');
  assert.equal(sw.paused, false);
  h.spineEvent(1, 'OnDeactivateEffect');
  clip = 'Idle';
  h.stepPauses(sw);
  assert.equal(sw.paused, false, 'outside its clips it plays');
  // FinishEffectIf: its owner gone; its own clip played once
  const eagle = entry('svash2_eagle_fly_01', 7, [{ k: 'finishIf', rec: { ownerGone: true } }]);
  h.stepPauses(eagle);
  assert.equal(eagle.inst.stopping, true);
  const ring = entry('x', 1, [{ k: 'finishIf', rec: { animEnd: true } }]);
  Object.assign(ring.inst, { clips: [{ len: 1 }], clipLen: 1, time: 0.5 });
  h.stepPauses(ring);
  assert.equal(ring.inst.stopping, false);
  ring.inst.time = 1;
  h.stepPauses(ring);
  assert.equal(ring.inst.stopping, true);
});

test('the layer steps them before each effect, a paused one is not stepped, a back switch keeps it hidden, the model\'s clip events reach the layer', () => {
  assert.match(SRC, /if \(l\.inst\.pausers\?\.length\) stepPauses\(l\);/);
  assert.match(SRC, /!l\.hidden && !l\.held && !l\.paused\) \|\| l\.inst\.stopping\) l\.inst\.update\(/);
  assert.match(SRC, /l\.inst\.object\.visible = !back && !l\.offHeld && !l\.paused;/);
  assert.match(SRC, /function dropLive\(l\) \{ if \(l\.inst\.pausers\?\.length\) releaseOthers\(l\);/);
  const app = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
  assert.match(app, /fxGame\.spineEvent\(id, name\)/);
});
