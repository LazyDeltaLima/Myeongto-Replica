// test/render/texas2-skill-fx.test.js — 缄默德克萨斯's skill effects, user report 4 (2026-10-08, LOCAL-PATCH.md 「사용자 제보 4차 텍사스」).
// #4-3: her S2 activation texas2_birth_02_start stood as a frozen picture — the player played clips[0] (the root's) only,
// and the 4 slashes are nested sub-prefabs with their own clips (fxplayer.js FxInstance plays every clip now).
// #4-5: her S3 剑雨滂沱's rain showed no falling sword. The sim's 'swordRain' drew texas2_skill_03_hit, a name the
// client never plays (a spark, no sword); ModeWithSwordRain's EmitSword shoots projectile_chr_texas2_s3_sword_rain, whose
// _effectsToTargetWhenStart is texas2_skill_03_hit_02 — the skill's target effect in modes.json (char_modes.py).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const FX = path.join(ROOT, 'public/assets/local/fx/texas2');
const HIT02 = path.join(FX, 'texas2_skill_03_hit_02.json');
const BIRTH = path.join(FX, 'texas2_birth_02_start.json');

test('#4-5 her S3 binding: the rain\'s target effect is the projectile\'s texas2_skill_03_hit_02', () => {
  assert.deepEqual(MODES.char_1028_texas2.skills[2].target, ['texas2_skill_03_hit_02']);
});

test('#4-5 a swordRain draws the skill\'s bound target effect, not a name picked by hand', () => {
  const at = SRC.indexOf("e[1] === 'swordRain'");
  assert.ok(at > 0);
  const branch = SRC.slice(at, SRC.indexOf('return true;', at));
  assert.match(branch, /extracted\(src, skillBind\(src\)\?\.target\)/);
  assert.doesNotMatch(SRC, /'texas2_skill_03_hit'/, 'the spark the client never plays is not drawn');
});

test('#4-5 the extracted hit_02 drops its sword from 5.5 tiles up in 0.13 s (skipped without public/assets)', { skip: !existsSync(HIT02) && 'no extracted fx' }, () => {
  const d = JSON.parse(readFileSync(HIT02, 'utf8'));
  const z = d.nodes.findIndex((n) => n.name === 'z');
  assert.equal(d.nodes[d.nodes.findIndex((n) => n.name === 'luojian') + 1].name, 'z');
  const pos = d.clips[0].tracks.find((t) => t.node === z && t.prop === 'pos');
  const keys = pos.curves[2];
  assert.equal(keys.at(-1)[0], 0.1333);
  assert.equal(keys.at(-1)[4], 0);
  assert.equal(keys[1][4], -5.5);
});

test('#4-3 her S2 activation: the 4 nested slashes fade out within 1 s, the effect ends with its 2 s root clip (skipped without public/assets)', { skip: !existsSync(BIRTH) && 'no extracted fx' }, async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = JSON.parse(readFileSync(BIRTH, 'utf8'));
  assert.equal(def.clips.length, 5, 'the root + 4 slashes');
  // no textures / meshes are fetched here: a stand-in triangle and texture (the clip binding only needs the materials)
  const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
  def.geoms = new Proxy({}, { get: () => tri() });
  def.lib = { texture: () => new THREE.Texture() };
  const inst = new fxp.FxInstance(def, { quality: 'high' });
  const slashes = def.clips.slice(1).map((c) => inst.clipTracks.filter((b) => c.tracks.includes(b.tr)));
  assert.ok(slashes.every((b) => b.length > 0), 'every slash clip drives its nodes');
  const alpha = (b) => b.filter((x) => x.kind === 'matComp' && x.axis === 'w').map((x) => x.u.value.w);
  inst.update(0.05);
  assert.ok(slashes.some((b) => alpha(b).some((a) => a > 0.1)), 'the slashes show');
  inst.update(0.95);
  assert.ok(slashes.every((b) => alpha(b).every((a) => a < 0.01)), 'and are gone at 1 s');
  assert.equal(inst.clipLen, 2);
  inst.dispose();
});
