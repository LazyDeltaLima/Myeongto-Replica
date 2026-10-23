// test/render/enemy-fx.test.js — the enemies' official effects (2026-10-10, docs/rules/fx.md 「적 이펙트 바인딩」):
// tools/local-extract/enemy_bindings.py's tables, render/fxgame.js's enemy branch, the shot speed (data/enemies.json `proj`)
// and the second-boomerang / hit-aim / overwrite-height leftovers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mergeIndex } from '../../public/js/render/fxgame.js';
import { enemyProjSpeed, enemyShot } from '../../public/js/render/fx/speeds.js';
import { pointKey, mountSpawn } from '../../public/js/render/fxpoints.js';

const ROOT = new URL('../../', import.meta.url);
const SRC = readFileSync(new URL('public/js/render/fxgame.js', ROOT), 'utf8');
const REVIEW = new URL('tools/assets/local-enemy-bindings.json', ROOT);
const MODES = new URL('public/assets/local/fx/enemy-modes.json', ROOT);

test('mergeIndex: the operators\' and the enemies\' bundles as one, a bundle in both lists both', () => {
  const a = { bundles: { common: ['common_invisible'], chen3: ['x'] } };
  const b = { bundles: { common: ['common_enemy_hit_01', 'common_invisible'], pfx_enemy_16: ['enemy_acstmk_attack_start'] } };
  const m = mergeIndex(a, b);
  assert.deepEqual(m.bundles.common.sort(), ['common_enemy_hit_01', 'common_invisible']);
  assert.deepEqual(m.bundles.chen3, ['x']);
  assert.deepEqual(m.bundles.pfx_enemy_16, ['enemy_acstmk_attack_start']);
  assert.equal(mergeIndex(a, null), a);
  assert.equal(mergeIndex(null, b), b);
});

test('enemyShot / enemyProjSpeed: data/enemies.json proj (projModes[form] without case first); null = no projectile, absent = not read', () => {
  const def = { proj: { key: 'a', speed: 10 }, projModes: { Crawl: { key: 'b', speed: 15 } } };
  assert.equal(enemyShot(def).key, 'a');
  assert.equal(enemyShot(def, 'crawl').key, 'b');
  assert.equal(enemyProjSpeed(def, 'crawl'), 15);
  assert.equal(enemyProjSpeed(def, 'other'), 10);
  assert.equal(enemyShot({ proj: null }), null);
  assert.equal(enemyShot({}), undefined);
  assert.equal(enemyProjSpeed({ proj: null }), null);
  assert.equal(enemyProjSpeed({ proj: { move: 'ATTACH', speed: 0 } }), null);
  assert.equal(enemyProjSpeed(null), null);
});

test('an enemy\'s mount points: HIT / HEAD / MUZZLE / SPECIAL_0 resolve to its table keys', () => {
  assert.deepEqual([1, 2, 3, 5].map((type) => pointKey(mountSpawn({ type }))), ['hit', 'muzzle', 'head', 'sp0']);
});

test('fxgame: enemy events take their own branch (swing / atk / dmg attacker / skill / fx ability / spawn / die / leak)', () => {
  // (efoe: an enemy, or an ally built from an enemy record — 炎佑, 2026-10-23)
  assert.match(SRC, /if \(efoe\(src\)\) \{ if \(eOn\(src\)\) eswingFx\(src, Number\(e\[2\]\) \|\| 0, e\[3\]\); return; \}/);
  assert.match(SRC, /const p = estrikeFx\(src, e\[3\]\);/);
  assert.match(SRC, /etrailShot\(e, src, tgt, p\.part\);/);
  // contract 1: the attacker is the 6th field of 'dmg'
  assert.match(SRC, /const by = e\.length >= 6 && e\[5\] != null \? e\[5\] : null;/);
  assert.match(SRC, /if \(a && by != null && ownerOf\(a\.src\) !== by\) a = null;/);
  assert.match(SRC, /ehitFx\(a\.src, a\.epart, tgt\);/);
  // contract 3: the ability's prefabKey
  assert.match(SRC, /const k = o\.ability \?\? o\.prefabKey \?\? \(typeof o\.skill === 'string' \? o\.skill : null\);/);
  assert.match(SRC, /eskillFx\(v, k, \{ on: !!e\[2\], loop: true \}\)/);
  assert.match(SRC, /views\.get\(o\.caster \?\? o\.id \?\? o\.src \?\? o\.by\)/);
  assert.match(SRC, /if \(e\[1\]\?\.side === 'enemy' && e\[1\]\.id != null\) eborn\.set\(e\[1\]\.id, clockS\);/);
  assert.match(SRC, /if \(v\?\.info\?\.side === 'enemy' && e\[2\] !== 'forcedExit'\) edeathFx\(v\);/);
  assert.match(SRC, /case 'leak': stopOwned\(e\[1\]\); return;/);
  // the shot leaves its _mountPointType point; its flight takes the official speed
  assert.match(SRC, /const from = eshotFrom\(src, pr\.mount\);/);
  assert.match(SRC, /dur: Math\.max\(0\.04, dist \/ \(erec\(src\) \? projSpeed\(e\[3\]\) : eshotSpeed\(src\)\)\)/);
  // effect names without case
  assert.match(SRC, /emodes\?\.\$fx\?\.\[name\.toLowerCase\(\)\]/);
});

test('fxgame: cast effects at their ability\'s speed, hits at 1.0; a hit with _useOwnerToTargetDirection aims along attacker → target', () => {
  assert.match(SRC, /until: end, speed: c\.speed, cast: c \}\)/);
  assert.match(SRC, /l\.inst\.update\(dt \* rate2 \* \(l\.speed > 0 \? l\.speed : 1\)\)/);
  assert.match(SRC, /if \(hits\.length\) \{ hitFx\(a\.src, tgt, hits, c\); return; \}/);
  assert.match(SRC, /if \(plain\.length\) play\(src, 'attackHit', 0, \{ at: tgt, names: plain, aim: src \}\);/);
  assert.match(SRC, /const aimSet = \(v\) => new Set\(bindOf\(v\)\?\.hitAim \|\| \[\]\);/);
});

test('fxgame: 跃跃 S2\'s second boomerang flies her S2 trail on the inverse arc; _overwriteHeight lifts to the ground under it', () => {
  assert.match(SRC, /if \(e\[1\] === 'caperBoomerang2' && e\[4\]\) \{ caperSecond\(e, views\); return; \}/);
  assert.match(SRC, /const caperArc = \(dist, inverse\) => \(dist < 1\.3 \? 0 : inverse \? -0\.3 : 0\.3\);/);
  assert.match(SRC, /if \(!drop && Number\.isFinite\(def\.height\)\) at = overHeight\(at, def\.height\);/);
  const simfx = readFileSync(new URL('public/js/render/fx/simfx.js', ROOT), 'utf8');
  assert.match(simfx, /if \(kind === 'caperBoomerang2'\) \{[\s\S]*?this\.attack\(s, t, 'boomerang', \{ inverse: true \}\);/);
});

test('local-enemy-bindings.json: every data/enemies.json enemy, the bosses\' abilities and projectiles', { skip: !existsSync(REVIEW) && 'not generated' }, () => {
  const d = JSON.parse(readFileSync(REVIEW, 'utf8'));
  const E = JSON.parse(readFileSync(new URL('data/enemies.json', ROOT), 'utf8'));
  for (const id of Object.keys(E)) assert.ok(d[id], id);
  const acstmk = d.enemy_9013_acstmk;
  assert.equal(acstmk.prefab, 'enemy_9013_acstmk');
  const atk = acstmk.abilities.find((a) => a.path === 'Modes/Default/Body/Attack');
  assert.deepEqual(atk.castEffects[0].fx, ['enemy_acstmk_attack_start']);
  assert.equal(atk.castEffects[0].start, 2, 'ON_CAST_START');
  assert.deepEqual(atk.projectiles[0], { key: 'projectile_enemy_acstmk', mount: 'SPECIAL_0' });
  assert.equal(d.$projectiles.projectile_crossbow_big.speed, 10);
  assert.deepEqual(d.$projectiles.projectile_crossbow_big.trail, ['common_gongjian_trail_01']);
});

test('enemy-modes.json: modes with melee / ranged parts, skills by name, points; extracted names resolve', { skip: !existsSync(MODES) && 'no local enemy table' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8'));
  const jshoot = m.enemy_1019_jshoot_2;
  assert.deepEqual(jshoot.modes[0].melee.hit, ['common_enemy_hit_01']);
  assert.equal(jshoot.modes[0].ranged.proj.key, 'projectile_crossbow_big');
  assert.equal(jshoot.modes[0].ranged.proj.mount, 2, 'MUZZLE');
  assert.equal(jshoot.points.muzzle.F.bone, 'Muzzle');
  assert.deepEqual(m.enemy_9013_acstmk.skills['1'].cast, ['enemy_acstmk_skill_01_start']);
  assert.equal(m.enemy_9032_aclionk.dead, 'enemy_vtlionk_die_01');
  for (const [k, v] of Object.entries(m.$fx)) {
    assert.equal(k, k.toLowerCase());
    assert.equal(v[1].toLowerCase(), k);
  }
});
