// local patch (docs/LOCAL-PATCH.md 「이펙트 붙는 자리」, user report 2026-10-08 + session F): an effect whose `_spawnLocation`
// is 3 / 6 (the client's MUZZLE_POINT) or 8–11 (MP_SPECIAL_0–3) plays at the model's Muzzle / SpecialPointN — a Spine bone
// from tools/local-extract/char_points.py's table (비르투오사's SpecialPoint0 = her cello string, F_Weapon_Chord /
// B_Weapon_Chord); official projectile trails leave the shooter's Muzzle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { pointKey, pointOn } from '../public/js/render/fxpoints.js';

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

test('비르투오사 stays on her cello: SpecialPoint0 follows F_Weapon_Chord / B_Weapon_Chord (the 9458e2fa bones)', () => {
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
      if (pointKey(d?.spawn)) out.push([b.name, f.slice(0, -5), d.spawn]);
    }
  }
  return out;
}

test('every extracted muzzle / special-point prefab finds its point on our model (known gaps listed)',
  { skip: (!existsSync(FX) || !runtime) && 'no extracted effects or pixi-spine' }, () => {
    const byCode = Object.fromEntries(Object.keys(TABLE).filter((k) => k.startsWith('char_')).map((k) => [k.replace(/^char_\d+_/, ''), k]));
    // swire's melee model has no Muzzle (its attack start keeps the ground); 浊心斯卡蒂 has no Back model; 史尔特尔's Back
    // record follows Front face bones the Back skeleton lacks (client data — its fixed spot is used)
    const GAPS = new Set(['swire/swire_attack_01_start', 'surtr/surtr_skill_03_buff_03 B', 'surtr/surtr_skill_03_buff_04 B']);
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

test('fxgame: lifted() takes the point of pointKey(spawn) from the table; body / head lifts unchanged; trails leave the muzzle', () => {
  const src = readFileSync(new URL('public/js/render/fxgame.js', ROOT), 'utf8');
  assert.match(src, /const key = pointKey\(def\?\.spawn\);/);
  assert.match(src, /specialPoint\(v, p, key\)/);
  assert.match(src, /const SPAWN_FRAC = \{ 2: 0\.5, 4: 1\.1 \};/, 'the body / head lifts are unchanged');
  assert.doesNotMatch(src, /const TRAIL_Z|TRAIL_Z \+ /, 'no fixed trail height');
  assert.match(src, /const p = specialPoint\(src, shotAt, 'muzzle'\);/);
  assert.match(src, /const z = rec\.z0 \+ \(rec\.tz - rec\.z0\) \* k/);
});
