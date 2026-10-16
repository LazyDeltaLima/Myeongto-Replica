// test/local-patch-status-boomerang.test.js — local patch (docs/LOCAL-PATCH.md 「전투 화면 UI」 ⑤ 상태 중첩, 「回环射手 부메랑」;
// maintainer report 2026-10-08):
// *: a status that ends takes its official effect with it at once (fxstatus.js → statusOff(…, now)); an ended effect
//     never restarts (fxgame.js statusOff clears `again`) and one effect per unit and status (playStatus) — re-stunning an
//     enemy stacked one more buff_stun per stun (debug arena 2026-10-08: 1 2 3 4 … instances)
// *: 跃跃's wheel is in her hand (Spine skin 'Bullet') while no drawn boomerang of hers is out (render/heldWheel.js,
//     fx/projectiles.js), and the official trail of a boomerang flies back (fxgame.js stepTrails)

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { installFakePixi, fakeViewCtx } from './render/fakepixi.js';
import { presetCamera } from '../public/js/render/projection.js';
import { UF } from '../shared/constants.js';
import { boomerangThrown, boomerangCaught, syncHeldWeapon, HELD_SKIN } from '../public/js/render/heldWheel.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('status effects: one per unit and status, gone with the status', () => {
  test('syncStatusFx ends a status with `now` (its particles go at once)', async () => {
    const F = await import('../public/js/render/fxstatus.js');
    const calls = [];
    const fxGame = {
      statusReady: () => true,
      statusOn: (v, b, n, k) => { (v._fxStatusOn ||= new Set()).add(k); calls.push(['on', k]); },
      statusOff: (v, k, now) => { v._fxStatusOn.delete(k); calls.push(['off', k, now]); },
    };
    const v = { flags: UF.STUNNED, alive: true, statuses: [] };
    const views = new Map([[1, v]]);
    F.syncStatusFx(views, fxGame, true);
    F.syncStatusFx(views, fxGame, true);   // still stunned: nothing new
    v.flags = 0;
    F.syncStatusFx(views, fxGame, true);
    v.flags = UF.STUNNED;
    F.syncStatusFx(views, fxGame, true);
    assert.deepEqual(calls, [['on', 'stun'], ['off', 'stun', true], ['on', 'stun']]);
  });

  test('fxgame.js: statusOff clears `again` and stops with `now`; playStatus refuses a second live copy', () => {
    const s = src('../public/js/render/fxgame.js');
    const off = s.slice(s.indexOf('statusOff(view, key, now = false) {'), s.indexOf('ownsFx(e)'));
    assert.match(off, /l\.again = null;/, 'an ended status effect must never restart (the stacked stun marks)');
    assert.match(off, /else l\.inst\.stop\(now\);/, 'without a finish delay it stops with `now` (test/render/status-finish.test.js)');
    const play = s.slice(s.indexOf('async function playStatus('), s.indexOf('function stoneFx('));
    assert.match(play, /live\.some\(\(l\) => l\.status === key && l\.unit === view && !l\.inst\.stopping && !l\.inst\.done\)\) return;/,
      'one live effect per unit and status (off → on while the file loaded started two)');
    // the loop restart still requires the status on and the effect not ended by statusOff
    assert.match(s, /l\.inst\.done && l\.status && l\.again && l\.unit\?\._fxStatusOn\?\.has\(l\.status\)/);
  });
});

describe('回环射手: the wheel in her hand while no boomerang of hers flies', () => {
  /** A fake SpineActor: skeleton with the default skin and `skins`. */
  function actor(withSkin = true) {
    const att = { name: 'C_Weapon_03' };
    const skin = { name: HELD_SKIN, getAttachments: () => [{ slotIndex: 1, name: 'C_Weapon_03', attachment: att }] };
    const slots = [{ attachment: 'x', setAttachment(a) { this.attachment = a; } }, { attachment: null, setAttachment(a) { this.attachment = a; } }];
    const sk = { data: { findSkin: (n) => (withSkin && n === HELD_SKIN ? skin : null) }, skin: null, slots, setSkin(s) { this.skin = s; this.sets = (this.sets || 0) + 1; } };
    return { spine: { skeleton: sk }, sk, skin, att };
  }

  test('held: the Bullet skin + its slot attachment; thrown: neither; caught: back; set only on a change', () => {
    const a = actor(), v = {};
    syncHeldWeapon(a, v);
    assert.equal(a.sk.skin, a.skin); assert.equal(a.sk.slots[1].attachment, a.att); assert.equal(a._held, true);
    syncHeldWeapon(a, v);
    assert.equal(a.sk.sets, 1, 'no work while nothing changes');
    boomerangThrown(v);
    syncHeldWeapon(a, v);
    assert.equal(a.sk.skin, null); assert.equal(a.sk.slots[1].attachment, null); assert.equal(a._held, false);
    boomerangThrown(v); boomerangCaught(v);   // S2 / overlapping flights: still one out
    syncHeldWeapon(a, v);
    assert.equal(a.sk.skin, null);
    boomerangCaught(v); boomerangCaught(v);   // never below 0
    assert.equal(v._boomOut, 0);
    syncHeldWeapon(a, v);
    assert.equal(a.sk.skin, a.skin); assert.equal(a.sk.slots[1].attachment, a.att);
    assert.equal(a.sk.slots[0].attachment, 'x', 'other slots untouched');
  });

  test('a skeleton without the skin is left alone', () => {
    const a = actor(false), v = {};
    boomerangThrown(v);
    syncHeldWeapon(a, v);
    assert.equal(a.sk.sets, undefined);
    assert.equal(a._heldSkin, null);
  });

  test('client data: 跃跃\'s skeleton keeps the wheel (C_Weapon_03) in the skin \'Bullet\' only — front and back', (t) => {
    const require = createRequire(import.meta.url);
    let r;
    try { r = require('@pixi-spine/runtime-3.8'); } catch { t.skip('no @pixi-spine/runtime-3.8'); return; }
    const L = { newRegionAttachment: (s, n) => new r.RegionAttachment(n), newMeshAttachment: (s, n) => new r.MeshAttachment(n),
      newBoundingBoxAttachment: (s, n) => new r.BoundingBoxAttachment(n), newPathAttachment: (s, n) => new r.PathAttachment(n),
      newPointAttachment: (s, n) => new r.PointAttachment(n), newClippingAttachment: (s, n) => new r.ClippingAttachment(n) };
    let seen = 0;
    for (const side of ['front', 'back']) {
      const f = new URL(`../public/assets/spine/op/char_4100_caper/${side}/char_4100_caper.skel`, import.meta.url);
      if (!existsSync(f)) continue;
      const d = new r.SkeletonBinary(L).readSkeletonData(new Uint8Array(readFileSync(f)));
      const skin = d.findSkin(HELD_SKIN);
      assert.ok(skin, `${side}: skin ${HELD_SKIN}`);
      assert.deepEqual(skin.getAttachments().map((e) => e.name), ['C_Weapon_03']);
      assert.ok(!d.defaultSkin.getAttachments().some((e) => e.name === 'C_Weapon_03'), `${side}: the wheel is not in the default skin`);
      seen++;
    }
    if (!seen) t.skip('no local Spine art (public/assets is not in git)');
  });

  describe('procedural boomerang (fx/projectiles.js): out of her hand for the whole flight', () => {
    let fake, FX;
    before(async () => { fake = installFakePixi(); FX = await import('../public/js/render/fx.js'); });
    after(() => fake.restore());
    const cam = presetCamera('normal', { width: 1600, height: 900 });
    const unit = (id, x, y, o = {}) => ({ id, x, y, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, isEnemy: false, maxHp: 3000, info: { defId: 'char_4100_caper' }, onHit() {}, ...o });
    function makeFx(views) {
      const P = fake.P, ctx = fakeViewCtx(P), map = new Map(views.map((v) => [v.id, v]));
      return new FX.FxSystem({ P, layers: ctx.layers, cam: () => cam, heightAt: () => 0, settings: { quality: 'high', damageNumbers: true },
        timeScale: () => 1, loadLevel: () => 0, subProfOf: () => null, view: (id) => map.get(id) || null,
        screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120 });
    }
    const run = (fx, s, dt = 1 / 120) => { for (let t = 0; t < s; t += dt) fx.update(dt); };

    test('thrown at the attack, caught when the return leg ends (3 tiles: 0.2 s out + 0.8 s back)', () => {
      const a = unit(1, 2, 3), e = unit(2, 5, 3, { isEnemy: true });
      const fx = makeFx([a, e]);
      fx.attack(a, e, 'boomerang');
      assert.equal(a._boomOut, 1);
      run(fx, 0.5);
      assert.equal(a._boomOut, 1, 'still flying back');
      run(fx, 0.8);
      assert.equal(a._boomOut, 0, 'caught');
      assert.equal(fx.projs.length, 0);
    });

    test('a thrower gone meanwhile gets nothing back — the count does not stick; other kinds never count', () => {
      const a = unit(1, 2, 3), e = unit(2, 5, 3, { isEnemy: true });
      const fx = makeFx([a, e]);
      fx.attack(a, e, 'boomerang');
      run(fx, 0.1);
      a.alive = false;
      run(fx, 0.5);
      assert.equal(a._boomOut, 0);
      fx.attack(e, a, 'arrow');
      assert.equal(e._boomOut, undefined);
    });

    test('a cleared field releases its boomerangs (back in hand for the next battle)', () => {
      const a = unit(1, 2, 3), e = unit(2, 5, 3, { isEnemy: true });
      const fx = makeFx([a, e]);
      fx.attack(a, e, 'boomerang');
      fx.clear();
      assert.equal(a._boomOut, 0);
    });
  });

  test('fxgame.js: an official boomerang trail turns back at the hit and is cleared at once when caught', () => {
    const s = src('../public/js/render/fxgame.js');
    const shot = s.slice(s.indexOf('function trailShot('), s.indexOf('function shotFrom('));
    assert.match(shot, /if \(e\[3\] === 'boomerang'\) \{\n\s+rec\.src = src; rec\.back = Math\.max\(0\.04, dist \/ projSpeed\('boomerangReturn'\)\); boomerangThrown\(src\);/);
    const step = s.slice(s.indexOf('function stepTrails('), s.indexOf("// ---- 荒芜拉普兰德 S3's wolves"));
    assert.match(step, /if \(rec\.k >= 1 && rec\.back\) \{ rec\.phase = 1; rec\.k = 1; rec\.tgt = null; continue; \}/, 'turns back at the hit point');
    assert.match(step, /rec\.inst\?\.stop\(true\); trails\.splice\(i, 1\); boomerangCaught\(rec\.src\);/, 'caught: the wheel (a 5 s particle) goes at once');
    assert.match(s, /for \(const r of trails\) if \(r\.back\) boomerangCaught\(r\.src\);/, 'clear() hands the boomerangs back');
  });
});
