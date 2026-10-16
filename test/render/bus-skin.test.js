// test/render/bus-skin.test.js — 伊利昂的木驮兽's riders (docs/rules/sim.md 「나무 버든비스트 승객」): the sim reports the
// passenger stacks as the model form 'half' / 'full' (server/sim/content/enemies/special.js kitBus, the client buff
// enemy_mntrjn_mark), and the view wears that Spine skin of the same skeleton (render/units.js SKIN_FORMS →
// SpineActor.setSkin): the default skin is the bike and its driver, Half adds two riders, Full five. Headless fake PIXI.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUS = 'enemy_10159_mntrjn';

let fake, SpineActor, UnitView, SKIN_FORMS;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ UnitView, SKIN_FORMS } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

test('SKIN_FORMS: 伊利昂的木驮兽 wears Half for the form \'half\' and Full for \'full\'', () => {
  assert.deepEqual({ ...SKIN_FORMS[BUS] }, { half: 'Half', full: 'Full' });
});

test('client data: SpineActor.setSkin shows the driver alone, two riders (Half) or five (Full), and back to the driver', (t) => {
  const f = path.join(ROOT, `public/assets/spine/enemy/${BUS}/${BUS}.skel`);
  if (!existsSync(f)) { t.skip('no local Spine art (public/assets is not in git)'); return; }
  const require = createRequire(import.meta.url);
  let r;
  try { r = require('@pixi-spine/runtime-3.8'); } catch { t.skip('no @pixi-spine/runtime-3.8'); return; }
  const L = { newRegionAttachment: (s, n) => new r.RegionAttachment(n), newMeshAttachment: (s, n) => new r.MeshAttachment(n),
    newBoundingBoxAttachment: (s, n) => new r.BoundingBoxAttachment(n), newPathAttachment: (s, n) => new r.PathAttachment(n),
    newPointAttachment: (s, n) => new r.PointAttachment(n), newClippingAttachment: (s, n) => new r.ClippingAttachment(n) };
  const sk = new r.Skeleton(new r.SkeletonBinary(L).readSkeletonData(new Uint8Array(readFileSync(f))));
  sk.setToSetupPose();
  const actor = { spine: { skeleton: sk }, _applied: true };
  const riders = () => [...new Set(sk.slots.filter((s) => s.getAttachment() && /^Guys[B-F]_/.test(s.data.name)).map((s) => s.data.name.slice(4, 5)))].sort().join('');
  const driver = () => sk.slots.some((s) => s.getAttachment() && s.data.name === 'GuysA_Head');
  assert.equal(riders(), '', 'the default skin: no riders');
  assert.ok(driver(), 'the driver');
  SpineActor.prototype.setSkin.call(actor, 'Half');
  assert.equal(riders(), 'BD', 'Half: two riders');
  assert.equal(actor._applied, false, 'a held pose is re-posed');
  SpineActor.prototype.setSkin.call(actor, 'Full');
  assert.equal(riders(), 'BCDEF', 'Full: five riders');
  assert.ok(driver());
  SpineActor.prototype.setSkin.call(actor, 'NoSuchSkin');
  assert.equal(riders(), 'BCDEF', 'a skin the skeleton lacks changes nothing');
  SpineActor.prototype.setSkin.call(actor, null);
  assert.equal(riders(), '', 'the passengers got off');
  assert.ok(driver());
});

test('UnitView: the form fx switch the skin, a view built later starts in it, other enemies are left alone', async () => {
  const calls = [];
  const orig = SpineActor.prototype.setSkin;
  SpineActor.prototype.setSkin = function (name) { calls.push(name); };
  try {
    const cam = presetCamera('prep', { width: 1280, height: 720 });
    const anims = { animations: ['Default', 'Die', 'Idle', 'Move'].map((name) => ({ name })) };
    const entry = { animations: Object.fromEntries(anims.animations.map((a) => [a.name, 1])) };
    const st = { picture: () => null, image: async () => null, spineEntry: () => entry, spine: { acquire: async () => anims, release() {} } };
    const view = (info) => new UnitView(fakeViewCtx(fake.P, { assets: st, cam: () => cam }), { side: 'enemy', kind: 'enemy', x: 4, y: 10, maxHp: 100, ...info }, {});
    const settle = async (v) => { for (let i = 0; i < 20 && !v.actor; i++) await new Promise((res) => setTimeout(res, 0)); assert.ok(v.actor, 'model built'); };

    const v = view({ id: 1, defId: BUS });
    await settle(v);
    calls.length = 0;
    v.setForm('half');
    v.setForm('full');
    v.setForm(null);
    assert.deepEqual(calls, ['Half', 'Full', null]);
    assert.equal(v.info.form, null);

    calls.length = 0;
    const late = view({ id: 2, defId: BUS, form: 'full' });
    await settle(late);
    assert.deepEqual(calls, ['Full'], 'built mid-battle with five riders on');

    calls.length = 0;
    const other = view({ id: 3, defId: 'enemy_1007_slime' });
    await settle(other);
    other.setForm('half');
    assert.deepEqual(calls, [], 'no skin form for another skeleton');
    assert.equal(other.form, null);
  } finally {
    SpineActor.prototype.setSkin = orig;
  }
});
