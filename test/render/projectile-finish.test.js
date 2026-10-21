// test/render/projectile-finish.test.js — user report 2026-10-11 (docs/rules/fx.md 「투사체 꼬리 끝내기」): the projectiles of
// 언더플로우 (深巡) and 애쉬락 (灰毫) vanished late after reaching the enemy. A trail that arrived only stopped emitting and stayed
// until its last particle died — 언더플로우's bullet is a looping 5 s particle, 애쉬락's shell a mesh kept while its 1.5 s sparks
// lived. The client finishes a projectile's `_mainEffect` when the projectile stops (Effect.FinishMe on its ProjectileEffect
// root): the first particle system stops, the `_inactiveOnFinish` nodes go off at once, and the effect is recycled
// `_delayToFinish` s later (fx_extract.py `finish` / `offFinish`, FxInstance.finishMain, fxgame.js finishShot).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const PLAYER = readFileSync(path.join(ROOT, 'public/js/render/fxplayer.js'), 'utf8');
const EXTRACT = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const UDFLOW = path.join(FX, 'udflow/udflow_attack_01_trail_01.json');
const ASHLOK = path.join(FX, 'ashlok/ashlok_attack_01_trail.json');
const ASHLOK2 = path.join(FX, 'ashlok/ashlok_skill_02_trail.json');

const body = (src, head) => {
  const at = src.indexOf(head);
  assert.ok(at >= 0, head);
  return src.slice(at, src.indexOf('\n  }\n', at));
};

/** An extracted prefab as FxLibrary.load gives it, without fetching textures / meshes (a stand-in triangle). */
async function loadDef(file) {
  const THREE = await import('../../public/vendor/three.module.js');
  const def = JSON.parse(readFileSync(file, 'utf8'));
  const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
  def.geoms = new Proxy({}, { get: () => tri() });
  def.lib = { texture: () => new THREE.Texture() };
  return def;
}

test('an arrived trail ends through finishShot (stepTrails), so do her notes and 켈시 S3\'s teleport flight', () => {
  const step = body(SRC, 'function stepTrails(g)');
  assert.match(step, /if \(rec\.k >= 1\) \{ finishShot\(rec\.inst\); trails\.splice\(i, 1\); \}/);
  assert.doesNotMatch(step, /rec\.inst\?\.stop\(\); trails/, 'no bare stop() that leaves the particles to die out');
  assert.match(body(SRC, 'function endNote(rec)'), /finishShot\(c\.inst\)/);
  assert.match(SRC, /shotEnd: clockS \+ dur \}/);
  assert.match(SRC, /l\.shotEnd != null && clockS >= l\.shotEnd\) \{ l\.shotEnd = null; finishShot\(l\.inst, l\); \}/);
});

test('finishShot: the main effect\'s finishMain, then gone `finish` s later (finishAt) or at once without one', () => {
  const f = body(SRC, 'function finishShot(inst');
  assert.match(f, /Number\(inst\.def\?\.finish\)/);
  assert.match(f, /inst\.finishMain\?\.\(\)/);
  assert.match(f, /l\.finishAt = clockS \+ fin/);
  assert.match(f, /else inst\.stop\(true\)/);
  assert.match(SRC, /l\.finishAt != null && clockS >= l\.finishAt\) \{ l\.finishAt = null; l\.inst\.stop\(true\); \}/);
});

test('fx_extract.py reads the ProjectileEffect root: `_delayToFinish` → finish, `_inactiveOnFinish` → offFinish, the stopped system → mainPs', () => {
  assert.match(EXTRACT, /PROJECTILE_EFFECT_SCRIPT = 4524653206994915020/);
  assert.match(EXTRACT, /def projectile_effect\(self, root\)/);
  assert.match(EXTRACT, /out_def\['offFinish'\] = off/);
  assert.match(EXTRACT, /def main_ps\(self, root, parents, actives, ps_nodes, drawn\)/);
  assert.match(EXTRACT, /out_def\['mainPs'\] = main/);
  assert.match(PLAYER, /this\.def\.mainPs/);
  assert.match(PLAYER, /finishMain\(\) \{/);
});

test('the extracted values (skipped without public/assets): 언더플로우 0.1 s, 애쉬락 0.5 s with its shell off at once', { skip: !(existsSync(UDFLOW) && existsSync(ASHLOK)) && 'no extracted fx' }, () => {
  const u = JSON.parse(readFileSync(UDFLOW, 'utf8'));
  assert.equal(u.finish, 0.1);
  assert.equal(u.offFinish, undefined);
  for (const f of [ASHLOK, ASHLOK2]) {
    const a = JSON.parse(readFileSync(f, 'utf8'));
    assert.equal(a.finish, 0.5);
    assert.deepEqual(a.offFinish.map((i) => a.nodes[i].name), ['gonggaoban'], path.basename(f));
  }
});

test('FxInstance.finishMain (skipped without public/assets): 애쉬락\'s shell goes off for good, its container system stops the rest', { skip: !existsSync(ASHLOK) && 'no extracted fx' }, async () => {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = await loadDef(ASHLOK);
  const inst = new fxp.FxInstance(def, { quality: 'high', delays: false });
  inst.update(0.2);
  const shell = inst.nodes[def.offFinish[0]];
  assert.equal(shell.visible, true, 'flying: the shell shows');
  inst.finishMain();
  inst.update(0.05);
  assert.equal(shell.visible, false, 'switched off as it lands');
  const sys = (n) => inst.systems.find((s) => s.node.name === n);
  // (2026-10-21) the client's first system is the empty container `fixed` (no material, dropped by the extract: def.mainPs):
  // Stop(true) takes the smoke and the sparks under it — their live particles stay until the recycle
  assert.equal(def.nodes[def.mainPs].name, 'fixed');
  assert.equal(sys('smoke').stopped, true, 'the smoke stops emitting');
  assert.equal(sys('xindian').stopped, true, 'the sparks too (under the container)');
  assert.equal(inst.stopping, undefined, 'not stopped as a whole: the pool takes it back `finish` s later');
  inst.stop(true);
  inst.update(0.016);
  assert.equal(inst.done, true, 'gone with the recycle');
});

test('FxInstance.finishMain (skipped without public/assets): 언더플로우\'s first system (the bullet and its child) stops emitting', { skip: !existsSync(UDFLOW) && 'no extracted fx' }, async () => {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = await loadDef(UDFLOW);
  const inst = new fxp.FxInstance(def, { quality: 'high', delays: false });
  inst.update(0.2);
  const bullet = inst.systems.filter((s) => /^bullet/.test(s.node.name));
  assert.equal(bullet.length, 2);
  assert.ok(bullet.every((s) => !s.stopped));
  inst.finishMain();
  assert.ok(bullet.every((s) => s.stopped), 'GetComponentInChildren<ParticleSystem>().Stop(true): the bullet and bullet (2)');
  assert.equal(inst.done, false, 'its 5 s particle still lives — finishShot ends it 0.1 s later');
});
