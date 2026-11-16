// test/render/home-mark.test.js — a dragged prep piece (docs/rules/ui.md 「배치 UI」, maintainer check 2026-11-16 against an
// official recording): the carried model stays opaque, and the tile it left keeps its picture greyed (`_overlapColor`)
// and outlined until the drag state ends (render/home-mark.js, render/units.js UnitView.markHome / clearHome).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, UnitView, HomeMark, HOME_MARK, COLORS;
before(async () => {
  fake = installFakePixi();
  fake.P.BLEND_MODES.SRC_IN = 9;
  ({ UnitView } = await import('../../public/js/render/units.js'));
  ({ HomeMark, HOME_MARK } = await import('../../public/js/render/home-mark.js'));
  ({ COLORS } = await import('../../public/js/render/style.js'));
});
after(() => fake.restore());

const cam = () => presetCamera('prep', { width: 1280, height: 720 });
const store = () => ({
  picture: () => null, image: async () => null, spineEntry: () => null,
  spine: { acquire: async () => ({ animations: [{ name: 'Idle' }] }), release() {} },
});
const rig = () => {
  const renders = [];
  return { renders, renderer: { resolution: 1, render: (obj, o) => renders.push({ obj, kids: obj.children.slice(), o }) } };
};
const piece = (renderer) => {
  const ctx = fakeViewCtx(fake.P, { assets: store(), cam, renderer });
  const v = new UnitView(ctx, { id: 'p:7', uid: 7, side: 'ally', kind: 'chess', defId: 'char_x', tier: 3, x: 5, y: 12, maxHp: 1000 }, { prep: true });
  return { v, ctx };
};

describe('render/home-mark.js', () => {
  test('drawn once: the body into a snapshot, then 12 offset copies filled with the outline colour under the grey snapshot', () => {
    const { renders, renderer } = rig();
    const layer = new fake.P.Container();
    const body = new fake.P.Container();
    body.rotation = 0.2; body.alpha = 0.5;
    const m = HomeMark.draw(fake.P, renderer, body, { x: 5, y: 12, z: 0 }, 100, layer);
    assert.ok(m, 'a mark');
    assert.equal(renders.length, 2, 'two renders, both at the start');
    assert.ok(renders[0].obj === body && renders[0].o.clear, 'the body as it stands');
    const kids = renders[1].kids;
    assert.equal(kids.length, 14);
    const snap = kids[0].texture;
    assert.ok(kids.slice(0, 12).every((k) => k.texture === snap), 'the outline: the snapshot around a circle');
    assert.ok(kids[12].blendMode === fake.P.BLEND_MODES.SRC_IN && kids[12].tint === HOME_MARK.outline, 'filled with the outline colour');
    assert.ok(kids[13].texture === snap && kids[13].tint === 0xaaaaaa, 'the model on top, multiplied by the client\'s .667 grey');
    assert.equal(HOME_MARK.outline, COLORS.heldOutline, 'the same ring colour as a held item');
    assert.ok(snap.destroyed, 'the snapshot goes once the mark is drawn');
    assert.ok(body.rotation === 0.2 && body.alpha === 0.5, 'the body is given back as it was');
    assert.ok(layer.children.includes(m.sprite) && m.sprite.texture === m.texture);
    const c = cam();
    m.place(c, 123);
    const p = c.project(5, 12, 0);
    assert.ok(Math.abs(m.sprite.position.x - p.x) < 1e-9 && Math.abs(m.sprite.position.y - p.y) < 1e-9 && m.sprite.zIndex === 123);
    assert.ok(Math.abs(m.sprite.scale.x - p.s / 100) < 1e-12, 'scaled with the camera from the size it was drawn at');
    m.destroy();
    assert.ok(m.texture === null && !layer.children.length);
    m.destroy();
  });

  test('nothing without a renderer, a visible body or a drawn size', () => {
    const { renderer } = rig();
    const layer = new fake.P.Container();
    const b = new fake.P.Container();
    assert.equal(HomeMark.draw(fake.P, null, b, { x: 0, y: 0, z: 0 }, 100, layer), null);
    b.visible = false;
    assert.equal(HomeMark.draw(fake.P, renderer, b, { x: 0, y: 0, z: 0 }, 100, layer), null);
    const e = new fake.P.Container();
    e.getLocalBounds = () => ({ x: 0, y: 0, width: 0, height: 0 });
    assert.equal(HomeMark.draw(fake.P, renderer, e, { x: 0, y: 0, z: 0 }, 100, layer), null);
  });
});

describe('UnitView: a dragged piece', () => {
  test('stays opaque and leaves its greyed, outlined picture on the tile until clearHome', () => {
    const { renders, renderer } = rig();
    const { v, ctx } = piece(renderer);
    v.update(1 / 60, cam(), 0);
    v.markHome();
    const m = v._homeMark;
    assert.ok(m && ctx.layers.units.children.includes(m.sprite), 'the mark stands in the unit layer');
    assert.equal(renders.length, 2);
    v.markHome();
    assert.ok(v._homeMark === m && renders.length === 2, 'one mark per drag, drawn once');
    // carried away, lifted: the model keeps its full alpha (the official dummy has no alpha anywhere on its path)
    v.lift = 0.3; v.x = 9; v.y = 10;
    for (let i = 1; i < 4; i++) v.update(1 / 60, cam(), i / 60);
    assert.equal(v.alpha, 1, 'not see-through while carried (maintainer check 2026-11-16: the official keeps its look)');
    assert.equal(v.root.alpha, 1);
    const p = cam().project(5, 12, 0);
    assert.ok(Math.abs(m.sprite.position.x - p.x) < 1e-6 && Math.abs(m.sprite.position.y - p.y) < 1e-6, 'the mark stays on the tile it left');
    assert.ok(v.root.zIndex > m.sprite.zIndex, 'the carried piece over its mark');
    assert.equal(renders.length, 2, 'nothing redrawn per frame');
    v.clearHome();
    assert.ok(!v._homeMark && m.sprite === null && !ctx.layers.units.children.some((k) => k.texture === m.texture));
    v.markHome();
    assert.ok(v._homeMark && v._homeMark !== m, 'a new drag, a new mark');
    const m2 = v._homeMark;
    v.destroy();
    assert.equal(m2.sprite, null, 'gone with the view');
  });

  test('the prep HUD (tier chip) stays on the tile it left while the dummy is carried, and comes back with clearHome', () => {
    const { renderer } = rig();
    const { v } = piece(renderer);
    v.update(1 / 60, cam(), 0);
    assert.ok(v.chip && v.chip.visible, 'a prep chip');
    const rel = () => [v.chip.position.x - v.screen.x, v.chip.position.y - v.screen.y];
    const [dx, dy] = rel();
    const home = cam().project(5, 12, 0);
    v.markHome();
    assert.ok(v._homeMark);
    v.lift = 0.3; v.x = 9; v.y = 10;
    for (let i = 1; i < 4; i++) v.update(1 / 60, cam(), i / 60);
    assert.ok(Math.abs(v.chip.position.x - (home.x + dx)) < 1e-6 && Math.abs(v.chip.position.y - (home.y + dy)) < 1e-6,
      'the chip over the home tile, not over the carried dummy (the client\'s HUD stays on the character MarkLeaving keeps; docs/rules/ui.md 「배치 UI」)');
    v.clearHome();
    v.lift = 0;
    v.update(1 / 60, cam(), 4 / 60);
    const far = v.chip.position.x;
    assert.ok(far > home.x + dx + 1, 'with the view again once the mark goes');
    v.x = 5; v.y = 12;
    v.update(1 / 60, cam(), 5 / 60);
    const [ax, ay] = rel();
    assert.ok(Math.abs(ax - dx) < 1e-6 && Math.abs(ay - dy) < 1e-6, 'at its place over the view');
    v.destroy();
  });

  test('setOverlap greys the model by the client\'s _overlapColor (a piece held over it for the direction step)', () => {
    const { renderer } = rig();
    const { v } = piece(renderer);
    v.update(1 / 60, cam(), 0);
    assert.equal(v.fallback.tint, 0xffffff);
    v.setOverlap(true);
    v.update(1 / 60, cam(), 1 / 60);
    assert.equal(v.fallback.tint, HOME_MARK.tint, 'greyed, no outline (docs/rules/ui.md 「배치 UI」 _DoBattleOverlap)');
    assert.equal(v._homeMark ?? null, null, 'no mark of its own');
    v.setOverlap(false);
    v.update(1 / 60, cam(), 2 / 60);
    assert.equal(v.fallback.tint, 0xffffff, 'its colour back (_RevertBattleOverlap)');
    assert.equal(HOME_MARK.overlapLift, 0.45, 'the held piece over it stands raised by _overlapOffset (0, 0, −0.45)');
    v.destroy();
  });

  test('a dragged hand item stays in its slot greyed under its ring; its copy keeps its colours', async () => {
    const { ItemView } = await import('../../public/js/render/units.js');
    const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
    const it = new ItemView(ctx, { id: 'p:9', uid: 9, kind: 'item', defId: 'item_x', tier: 2, x: 3, y: 18 });
    it.update(1 / 60, cam(), 0);
    assert.equal(it.plate.tint, 0xffffff);
    const p = cam().project(3, 18, 0);
    it.holdAt(p.x + 200, p.y - 100);
    it.update(1 / 60, cam(), 1 / 60);
    assert.equal(it.plate.tint, HOME_MARK.tint, 'the item left in its slot greyed like an operator (the same drag state)');
    assert.ok(it.copy && it.copy.plate.tint === 0xffffff, 'the carried copy is not greyed');
    it.endHold();
    it.update(1 / 60, cam(), 2 / 60);
    assert.equal(it.plate.tint, 0xffffff, 'its colour back when the drag ends');
    it.destroy();
  });

  test('a view never drawn yet leaves no mark', () => {
    const { renderer } = rig();
    const { v } = piece(renderer);
    v.markHome();
    assert.equal(v._homeMark ?? null, null);
    v.destroy();
  });
});
