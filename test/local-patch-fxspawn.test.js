// local patch (docs/LOCAL-PATCH.md 「이펙트 붙는 자리」, maintainer report 2026-10-08 + ): an effect whose `_spawnLocation`
// is 3 / 6 (the client's MUZZLE_POINT) or 8–11 (MP_SPECIAL_0–3) plays at the model's Muzzle / SpecialPointN — a Spine bone
// from tools/local-extract/char_points.py's table (비르투오사's SpecialPoint0 = her cello string, F_Weapon_Chord /
// B_Weapon_Chord); official projectile trails leave the shooter's Muzzle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { boneMissing, mountSpawn, pointKey, pointOn } from '../public/js/render/fxpoints.js';

const ROOT = new URL('../', import.meta.url);
const FX = new URL('public/assets/local/fx/', ROOT);
const CELLO_FX = new URL('cello/cello_skill_03_buff_front_02.json', FX);
const TABLE = JSON.parse(readFileSync(new URL('tools/assets/local-char-points.json', ROOT), 'utf8'));

/** A skeleton stand-in: bones by name at fixed (worldX, worldY). */
const skel = (bones) => ({ findBone: (n) => (bones[n] ? { worldX: bones[n][0], worldY: bones[n][1] } : null) });

let runtime = null;
try { runtime = createRequire(new URL('package.json', ROOT))('@pixi-spine/runtime-3.8'); } catch { /* no pixi-spine */ }
/** Our own model's skeleton (public/assets/spine/op) posed at `anim` t = 0, or null. */
function ourSkeleton(charId, side, anim = 'Idle') {
  const f = new URL(`public/assets/spine/op/${charId}/${side === 'B' ? 'back' : 'front'}/${charId}.skel`, ROOT);
  if (!runtime || !existsSync(f)) return null;
  const r = runtime;
  const loader = {
    newRegionAttachment: (s, n) => new r.RegionAttachment(n), newMeshAttachment: (s, n) => new r.MeshAttachment(n),
    newBoundingBoxAttachment: (s, n) => new r.BoundingBoxAttachment(n), newPathAttachment: (s, n) => new r.PathAttachment(n),
    newPointAttachment: (s, n) => new r.PointAttachment(n), newClippingAttachment: (s, n) => new r.ClippingAttachment(n),
  };
  const data = new r.SkeletonBinary(loader).readSkeletonData(new Uint8Array(readFileSync(f)));
  const sk = new r.Skeleton(data);
  sk.setToSetupPose();
  data.findAnimation(anim)?.apply(sk, 0, 0, false, [], 1, 0, 0);
  sk.updateWorldTransform();
  return sk;
}

test('pointKey: _spawnLocation 3 / 6 → muzzle, MP_SPECIAL_0–15 → sp0–sp15 by the enum order, the rest keep their own heights', () => {
  assert.equal(pointKey(3), 'muzzle');
  assert.equal(pointKey(6), 'muzzle');
  assert.deepEqual([8, 9, 10, 11].map(pointKey), ['sp0', 'sp1', 'sp2', 'sp3']);
  assert.deepEqual([13, 14, 15, 16].map(pointKey), ['sp4', 'sp5', 'sp6', 'sp7'], '12 is CAMERA');
  assert.deepEqual([18, 25].map(pointKey), ['sp8', 'sp15'], '17 is TILE_CENTER');
  for (const s of [undefined, null, 0, 1, 2, 4, 5, 7, 12, 17, 26]) assert.equal(pointKey(s), null, `spawn ${s}`);
});

test('pointOn: the drawn side\'s bone, else the other side\'s, else that side\'s fixed spot (y up → the runtime\'s y down)', () => {
  const entry = { F: { bone: 'F_X', at: [10, 20] }, B: { bone: 'B_X', at: [30, 40] } };
  assert.deepEqual(pointOn(entry, skel({ F_X: [1, -2], B_X: [3, -4] }), false), { x: 1, y: -2 });
  assert.deepEqual(pointOn(entry, skel({ F_X: [1, -2], B_X: [3, -4] }), true), { x: 3, y: -4 });
  assert.deepEqual(pointOn(entry, skel({ F_X: [1, -2] }), true), { x: 1, y: -2 }, 'a skeleton swapping sides');
  assert.deepEqual(pointOn(entry, skel({}), true), { x: 30, y: -40 });
  assert.deepEqual(pointOn({ F: { at: [5, 6] } }, skel({}), true), { x: 5, y: -6 }, 'a one-sided entry serves both');
  assert.equal(pointOn(null, skel({}), false), null);
  assert.equal(pointOn(entry, null, false), null);
});

test('비르투오사 stays on her cello: SpecialPoint0 follows F_Weapon_Chord / B_Weapon_Chord (the a5d2e4ba bones)', () => {
  const sp0 = TABLE.char_245_cello?.sp0;
  assert.equal(sp0?.F?.bone, 'F_Weapon_Chord');
  assert.equal(sp0?.B?.bone, 'B_Weapon_Chord');
  assert.deepEqual(pointOn(sp0, skel({ F_Weapon_Chord: [60, -178] }), false), { x: 60, y: -178 });
  assert.deepEqual(pointOn(sp0, skel({ B_Weapon_Chord: [-50, -170] }), true), { x: -50, y: -170 });
});

test('the table\'s fixed spots are skeleton units: 비르투오사\'s Muzzle / SpecialPoint0 = her bones in the Idle pose',
  { skip: !ourSkeleton('char_245_cello', 'F') && 'no model or pixi-spine' }, () => {
    const sk = ourSkeleton('char_245_cello', 'F');
    for (const k of ['muzzle', 'sp0']) {
      const p = TABLE.char_245_cello[k].F, b = sk.findBone(p.bone);
      assert.ok(Math.abs(b.worldX - p.at[0]) < 0.5 && Math.abs(-b.worldY - p.at[1]) < 0.5, `${k}: ${b.worldX}, ${-b.worldY} vs ${p.at}`);
    }
  });

/** Every extracted prefab with a muzzle / special-point `_spawnLocation`: [bundle, name, spawn]. */
function pointPrefabs() {
  const out = [];
  for (const b of readdirSync(FX, { withFileTypes: true })) {
    if (!b.isDirectory()) continue;
    for (const f of readdirSync(new URL(`${b.name}/`, FX))) {
      if (!f.endsWith('.json')) continue;
      let d;
      try { d = JSON.parse(readFileSync(new URL(`${b.name}/${f}`, FX), 'utf8')); } catch { continue; }
      const spawn = mountSpawn(d?.mount) ?? d?.spawn;
      if (pointKey(spawn)) out.push([b.name, f.slice(0, -5), spawn]);
    }
  }
  return out;
}

test('every extracted muzzle / special-point prefab finds its point on our model (known gaps listed)',
  { skip: (!existsSync(FX) || !runtime) && 'no extracted effects or pixi-spine' }, () => {
    const byCode = Object.fromEntries(Object.keys(TABLE).filter((k) => k.startsWith('char_')).map((k) => [k.replace(/^char_\d+_/, ''), k]));
    // swire's melee model has no Muzzle (its attack start keeps the ground); 浊心斯卡蒂 has no Back model; 史尔特尔's Back
    // record follows Front face bones the Back skeleton lacks (client data — its fixed spot is used); 비즈왁스's model has
    // no SpecialPoint0 for her S2 buff's mount (the client pauses it, _pauseWhenMountPointInvalid; it keeps the ground)
    const GAPS = new Set(['swire/swire_attack_01_start', 'surtr/surtr_skill_03_buff_03 B', 'surtr/surtr_skill_03_buff_04 B', 'beewax/beewax_skill_02_buff_01']);
    const missing = [];
    for (const [b, n, spawn] of pointPrefabs()) {
      if (GAPS.has(`${b}/${n}`)) continue;
      const cid = byCode[b], entry = cid && TABLE[cid][pointKey(spawn)];
      if (!entry) { missing.push(`${b}/${n}: no point`); continue; }
      for (const side of ['F', 'B']) {
        const sk = ourSkeleton(cid, side);
        if (!sk) continue;
        if (!pointOn(entry, sk, side === 'B')) missing.push(`${b}/${n} ${side}`);
        else if (entry[side]?.bone && !sk.findBone(entry[side].bone) && !GAPS.has(`${b}/${n} ${side}`)) missing.push(`${b}/${n} ${side}: no bone ${entry[side].bone}`);
      }
    }
    assert.deepEqual(missing, []);
  });

test('the extracted 비르투오사 S3 glow is a _spawnLocation 8 prefab', { skip: !existsSync(CELLO_FX) && 'no extracted effects' }, () => {
  assert.equal(JSON.parse(readFileSync(CELLO_FX, 'utf8')).spawn, 8);
});

test('fxgame: lifted() takes the point of pointKey(spawn) from the table; body / head lifts unchanged; trails leave the attack\'s mount point', () => {
  const src = readFileSync(new URL('public/js/render/fxgame.js', ROOT), 'utf8');
  assert.match(src, /const spawn = mountSpawn\(def\?\.mount\) \?\? def\?\.spawn;\n    const key = pointKey\(spawn\);/);
  assert.match(src, /specialPoint\(v, p, key\)/);
  assert.match(src, /const SPAWN_FRAC = \{ 2: 0\.5, 4: 1\.1 \};/, 'the body / head lifts are unchanged');
  assert.doesNotMatch(src, /const TRAIL_Z|TRAIL_Z \+ /, 'no fixed trail height');
  // 2026-10-10 (client RangedAttack._GetMountPoint): the mode's `shotFrom` point (GROUND = the feet), else the Muzzle; the
  // target's hit point when the table has it
  assert.match(src, /const p = \(key && specialPoint\(src, shotAt, key\)\) \|\| specialPoint\(src, shotAt, 'muzzle'\);/);
  assert.match(src, /if \(mp === 7\) return \{ x: src\.x, y: src\.y, z: \(src\.z \|\| 0\) \+ \(src\.hover \|\| 0\) \};/);
  assert.match(src, /const shotTo = \(t\) => specialPoint\(t, hitAt, 'hit'\)\?\.z \?\? bodyZ\(camRef, t, SPAWN_FRAC\[2\]\);/);
  assert.match(src, /const z = rec\.z0 \+ \(rec\.tz - rec\.z0\) \* k/);
});

// (maintainer report 2026-10-08): an effect's FollowMountPoint (fx_extract.py `mount`) — 스펙터 디 언체인드 S2's red ring
test('mountSpawn: MountPointType 0–3 FOOT / HIT / MUZZLE / HEAD, 5 / 6 / 8–21 SPECIAL_0 / 1 / 2–15 (4 UI, 7 GROUND) → the same point\'s _spawnLocation', () => {
  assert.deepEqual([0, 1, 2, 3].map((type) => mountSpawn({ type })), [1, 2, 3, 4]);
  assert.deepEqual([5, 6, 8, 9, 10, 13, 14, 21].map((type) => pointKey(mountSpawn({ type }))), ['sp0', 'sp1', 'sp2', 'sp3', 'sp4', 'sp7', 'sp8', 'sp15']);
  // the pairs the extracted prefabs carry (spawn ↔ mount): 8 ↔ 5, 9 ↔ 6, 10 ↔ 8, 11 ↔ 9, 13 ↔ 10, 14 ↔ 11, 15 ↔ 12, 2 ↔ 1, 3 ↔ 2, 4 ↔ 3
  for (const [spawn, type] of [[8, 5], [9, 6], [10, 8], [11, 9], [13, 10], [14, 11], [15, 12], [2, 1], [3, 2], [4, 3]]) assert.equal(mountSpawn({ type }), spawn);
  for (const m of [undefined, null, {}, { type: -1 }, { type: 4 }, { type: 7 }, { type: 22 }]) assert.equal(mountSpawn(m), null);
});

test('boneMissing: only when the skeleton has none of the point\'s bones (fixed spots are never invalid)', () => {
  const entry = { F: { bone: 'F_W_Ring' }, B: { bone: 'B_W_Ring' } };
  assert.equal(boneMissing(entry, skel({ B_W_Ring: [0, 0] })), false);
  assert.equal(boneMissing(entry, skel({})), true);
  assert.equal(boneMissing({ F: { at: [1, 2] } }, skel({})), false);
  assert.equal(boneMissing(entry, null), false, 'no skeleton yet: not paused');
});

const GHOST2 = new URL('ghost2/', FX);
test('스펙터 디 언체인드: S2 plays the red ring on her saw (buff_02, mount SPECIAL_0) and the eye light (buff_03, SPECIAL_1)',
  { skip: !existsSync(new URL('ghost2_skill_02_buff_02.json', GHOST2)) && 'no extracted effects' }, () => {
    const fx = (n) => JSON.parse(readFileSync(new URL(`${n}.json`, GHOST2), 'utf8'));
    assert.deepEqual([fx('ghost2_skill_02_buff_02').mount.type, fx('ghost2_skill_02_buff_02').mount.pauseWhenInvalid], [5, 1]);
    assert.equal(fx('ghost2_skill_02_buff_03').mount.type, 6);
    assert.equal(fx('ghost2_attack_start_01').mount.type, 5, 'the attack ring is on the saw too');
    assert.equal(fx('ghost2_beidong_buff_01').mount, undefined, 'the stand-in\'s blue waves stay on the ground');
    const m = JSON.parse(readFileSync(new URL('tools/assets/local-char-modes.json', ROOT), 'utf8')).char_1023_ghost2;
    assert.deepEqual(m.attach[m.modes.indexOf('S2')], ['ghost2_skill_02_buff_02', 'ghost2_skill_02_buff_03']);
    assert.deepEqual(TABLE.char_1023_ghost2.sp0.F.bone, 'B_W_Ring');
  });
