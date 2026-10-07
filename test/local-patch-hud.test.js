// Local patch tests: the official battle HUD (docs/LOCAL-PATCH.md 「전투 화면 UI」) — render/hud-bars.js, the b.snap
// `ammo` list (server/sim/local-hud.js → render/interp.js → render/units.js).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './render/fakepixi.js';
import { presetCamera } from '../public/js/render/projection.js';
import { ammoList } from '../server/sim/local-hud.js';
import { normalizeSnapshot } from '../public/js/render/interp.js';
import { makeBattle } from './helpers/battleHarness.js';
import { UF } from '../shared/constants.js';

let fake, UnitView, HB;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../public/js/render/units.js'));
  HB = await import('../public/js/render/hud-bars.js');
});
after(() => fake.restore());

const VP = { width: 2000, height: 1125 };
const cam = () => presetCamera('prep', { width: VP.width, height: VP.height });
function view(info, opts = {}) {
  const ctx = fakeViewCtx(fake.P, { assets: null, cam, viewport: () => VP });
  return new UnitView(ctx, { id: 1, side: 'ally', kind: 'chess', defId: 'char_x', tier: 3, x: 5, y: 12, maxHp: 1000, ...info }, opts);
}
const sample = (o) => ({ x: 5, y: 12, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0, vy: 0, el: null, ...o });

describe('battle HUD unit (screen-fixed, 1920×1080 reference)', () => {
  test('px per unit = min(width / 1920, height / 1080): the CN capture 2000×1125 draws the 125-unit bar 130 px wide', () => {
    assert.equal(HB.hudUnit({ width: 1920, height: 1080 }), 1);
    assert.ok(Math.abs(HB.hudUnit(VP) * 125 - 130.2) < 0.1);
    assert.equal(HB.hudUnit({ width: 1080, height: 1920 }), 1080 / 1920, 'portrait: the width');
    assert.equal(HB.hudUnit({ width: 3840, height: 1080 }), 1, 'ultra-wide: the height');
    assert.equal(HB.hudUnit(null), 1);
  });
});

describe('ally bars (char_hp_slider / char_sp_slider / char_bullet_bar)', () => {
  test('under the feet, the same size at any depth, official colours; the drawn bars stay hidden', () => {
    const near = view({}), far = view({ id: 2, y: 14 });
    for (const v of [near, far]) { v.sync(sample({ hp: 600, sp: 3, spMax: 10 }), 0); v.update(1 / 60, cam(), 0); }
    const u = HB.hudUnit(VP), b = near.lpBars;
    assert.ok(b.root.visible);
    assert.ok(Math.abs(b.hp.position.y - (near.screen.y + 30 * u)) < 1e-6, 'HP centre 30 units under the feet (54.5 under hud_unit, 24.5 over the feet)');
    assert.ok(Math.abs(b.hp.width - 125 * u * 0.6) < 1e-6);
    assert.equal(b.hp.tint, 0x49b2e3); assert.equal(b.hp.alpha, 0.7);
    assert.equal(b.sp.tint, 0xcaec46);
    assert.ok(Math.abs(b.sp.position.y - b.hp.position.y - 7 * u) < 1e-6, 'SP right under HP');
    assert.ok(Math.abs(far.lpBars.plate.width - b.plate.width) < 1e-9, 'no perspective scaling');
    assert.ok(!near.hpFill.visible && !near.spFill.visible && !near.spGlow.visible);
  });

  test('a running skill turns the SP bar #ffa800; a full SP bar has no glow', () => {
    const v = view({});
    v.sync(sample({ sp: 10, spMax: 10 }), 0); v.update(1 / 60, cam(), 0);
    assert.equal(v.lpBars.sp.tint, 0xcaec46); assert.ok(!v.spGlow.visible);
    v.sync(sample({ sp: 5, spMax: 10, flags: UF.SKILL }), 0); v.update(1 / 60, cam(), 0);
    assert.equal(v.lpBars.sp.tint, 0xffa800);
    assert.ok(Math.abs(v.lpBars.sp.width - 125 * HB.hudUnit(VP) * 0.5) < 1e-6);
  });

  test('an ammo skill: one block per bullet left with 2-unit gaps on the #e56d00 track', () => {
    const v = view({});
    v.lpBars.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.5, cast: true, ammo: [3, 7] });
    const blocks = v.lpBars.blocks.filter((b) => b.visible);
    assert.equal(blocks.length, 3);
    const bw = (125 - 6 * 2) / 7;
    assert.ok(Math.abs(blocks[0].width - bw) < 1e-9 && Math.abs(blocks[1].position.x - blocks[0].position.x - bw - 2) < 1e-9);
    assert.ok(v.lpBars.ammoTrack.visible && !v.lpBars.sp.visible);
    assert.equal(v.lpBars.ammoTrack.tint, 0xe56d00);
    // too many for 1-px blocks: the bullets left as one bar
    v.lpBars.update(1000, 500, 0.5, { hp: 1, ghost: 1, sp: 0.5, cast: true, ammo: [30, 60] });
    assert.equal(v.lpBars.blocks.filter((b) => b.visible).length, 1);
    assert.ok(Math.abs(v.lpBars.blocks[0].width - 125 * 0.5 * 0.5) < 1e-9);
  });

  test('no tier chip in battle; prep keeps one (the drawn chip without the local client art)', () => {
    const b = view({ tier: 2 });
    b.sync(sample({}), 0); b.update(1 / 60, cam(), 0);
    assert.ok(b.chip && !b.chip.visible, 'battle: no chip');
    const p = view({ tier: 4 }, { prep: true });
    p.update(1 / 60, cam(), 0);
    assert.ok(p.chip.visible);
    assert.equal(p.chip.texture, p._chipTex);
  });
});

describe('prep: official chip and equip bar (shop_hud)', () => {
  const tex = (w, h) => ({ width: w, height: h, baseTexture: { valid: true } });
  test('the chip takes the 45-px img_chess_level (web shopCard first), its 39-px interior at 37.5 units', () => {
    const P = { Texture: { from: (u) => ({ ...tex(45, 45), url: u }) } };
    const web = HB.prepChip(P, { ui: (n) => `/web/${n}.png`, localUrl: (g, n) => `/local/${g}/${n}.png` }, 4);
    assert.equal(web.tex.url, '/web/shopCard/img_chess_level_4.png');
    assert.ok(Math.abs(web.k * 39 - 37.5) < 1e-9);
    const local = HB.prepChip(P, { localUrl: (g, n) => (n.startsWith('autochess') ? `/local/${g}/${n}.png` : null) }, 5);
    assert.equal(local.tex.url, '/local/ui/battle/autochess_level_5.png');
    assert.ok(Math.abs(local.k * 30 - 37.5) < 1e-9);
    assert.equal(HB.prepChip(P, {}, 2), null, 'none installed: the drawn chip');
  });

  test('the equip bar fills one slot per item (white, gold for a golden item) and hides without items', () => {
    const v = view({ tier: 4 }, { prep: true });
    const bar = new HB.EquipBar(fake.P, v.hud);
    const t = { bg: tex(74, 30), normal: tex(23, 6), gold: tex(31, 14) };
    bar.update(1000, 500, 1, [false], t);
    assert.ok(bar.root.visible && bar.slots[0].visible && !bar.slots[1].visible);
    assert.equal(bar.slots[0].texture, t.normal);
    assert.ok(Math.abs(bar.bg.position.x - 1014.75) < 1e-9 && Math.abs(bar.bg.position.y - (500 - 24.5 - 129.5)) < 1e-9);
    bar.update(1000, 500, 1, [false, true], t);
    assert.equal(bar.slots[1].texture, t.gold);
    assert.ok(Math.abs(bar.slots[1].width - 31 * 1.25) < 1e-9);
    v.setEquip([]); v.update(1 / 60, cam(), 0);
    assert.ok(!v._equipBar || !v._equipBar.root.visible, 'no items: no bar');
  });
});

describe('b.snap `ammo` (server/sim/local-hud.js)', () => {
  test('lists allies whose ammo skill runs, and interp hands it to the sample', () => {
    const units = [
      { id: 1, alive: true, deployed: true, side: 'ally', skill: { kind: 'ammo', active: true, ammoLeft: 5, ammoMax: 9, ammo: 8 } },
      { id: 2, alive: true, deployed: true, side: 'ally', skill: { kind: 'ammo', active: false, ammoLeft: 0, ammoMax: 0, ammo: 8 } },
      { id: 3, alive: true, deployed: true, side: 'ally', skill: { kind: 'duration', active: true } },
      { id: 4, alive: true, deployed: true, side: 'enemy', skill: { kind: 'ammo', active: true, ammoLeft: 1, ammoMax: 1 } },
    ];
    assert.deepEqual(ammoList(units), [[1, 5, 9]]);
    assert.equal(ammoList(units.slice(1)), null);
    const n = normalizeSnapshot({ t: 1, units: [[1, 2, 3, 10, 10, 5, 10, 0, 0], [2, 2, 3, 10, 10, 0, 10, 0, 0]], ammo: [[1, 5, 9], [9, 1, 1], 'x'] });
    assert.deepEqual(n.units.get(1).ammo, [5, 9]);
    assert.equal(n.units.get(2).ammo, undefined);
  });

  test('real battle: 圣约送葬人 S1 puts its bullets in the snapshot while the skill runs', () => {
    const h = makeBattle({ seed: 3, timeLimit: 40, units: [{ chessId: 'chess_char_5_01_a', row: 9, col: 5, uid: 1, skillIndex: 0 }],
      enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 6, interval: 2 }] });
    const u = h.battle.allyUnits.find((x) => x.kind === 'op');
    assert.equal(u.skill.kind, 'ammo');
    h.run(1);
    u.skill.sp = u.skill.spCost; // charged now (its SP gain alone takes longer than the test)
    let seen = null;
    h.runUntil(() => { const s = h.battle.snapshot(); if (s.ammo) seen = s.ammo; return !!seen; }, 40);
    assert.ok(seen, 'an ammo entry while the skill runs');
    assert.equal(seen[0][0], u.id);
    assert.ok(seen[0][1] <= seen[0][2] && seen[0][2] >= 1);
  });
});
