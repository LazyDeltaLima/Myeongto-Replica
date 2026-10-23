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
    assert.ok(Math.abs(far.lpBars.plate.rect.width - b.plate.rect.width) < 1e-9, 'no perspective scaling');
    assert.ok(Math.abs(b.plate.rect.alpha - 0.5 * 179 / 255) < 1e-9, 'no sprite: a plain plate at the sprite core\'s alpha');
    assert.ok(!near.hpFill.visible && !near.spFill.visible && !near.spGlow.visible);
  });

  // its model stands ≈ 0.16 tile lower (its prefab place, test/render/model-place.test.js): the bars stay ≈ 28 units under
  // the shoes, as the official captures (2026-10-23 PC: 29 units)
  test('an operator or token: hud_unit on its point, the HP centre 54.5 under it', () => {
    const u = HB.hudUnit(VP);
    for (const kind of ['op', 'token']) {
      const v = view({ kind });
      v.sync(sample({ hp: 600, sp: 3, spMax: 10 }), 0); v.update(1 / 60, cam(), 0);
      assert.equal(v.hudAnchor, 0, `${kind}: the client's hud_unit follows the unit's own transform`);
      assert.ok(Math.abs(v.lpBars.hp.position.y - (v.screen.y + 54.5 * u)) < 1e-6, `${kind}: HP centre 54.5 units under the point`);
    }
    const plain = view({});
    plain.sync(sample({}), 0); plain.update(1 / 60, cam(), 0);
    assert.equal(plain.hudAnchor, HB.HUD_ANCHOR, 'a model on its point keeps hud_unit 24.5 over it');
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

  test('every prep piece wears the equip bar: own pieces, battle-field prep units and the boss round partner', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../public/js/render/app.js', import.meta.url), 'utf8');
    const mates = src.slice(src.indexOf('function syncMates('), src.indexOf('function syncMates(') + 2000);
    assert.match(mates, /v\.setItems\(info\.items\.map[^\n]*\n(\s+\/\/[^\n]*\n)*\s+if \(v\.setEquip\) v\.setEquip\(info\.items\.map\(\(it\) => !!data\.item\(it\)\?\.isGolden\)\);/,
      "upstream ef101647's partner pieces (syncMates) set the official equip bar too, not only the old item pips");
    assert.equal((src.match(/v\.setItems\(/g) || []).length, (src.match(/v\.setEquip\(/g) || []).length, 'each setItems has its setEquip');
  });
});

describe('enemy bars (enemy_hp_slider / enemy_boss_hp_slider / the giant boss panel)', () => {
  const enemy = (info) => view({ side: 'enemy', kind: 'enemy', ...info });
  test('kinds: a normal enemy, a boss, a 卫戍协议 giant boss (by Spine id: the _2 variants share the prefab)', () => {
    assert.equal(enemy({ defId: 'enemy_1001_bigbo' }).lpBars.kind, 'normal');
    assert.equal(enemy({ defId: 'enemy_2016_csphtm', boss: true }).lpBars.kind, 'boss');
    const g = enemy({ defId: 'enemy_9013_acstmk_2', spine: 'enemy_9013_acstmk', boss: true }).lpBars;
    assert.equal(g.kind, 'giant'); assert.equal(g.giant.sx, 0.35);
    assert.deepEqual(HB.giantBossOf({ defId: 'enemy_9033_acdeer' }).off, [0, 1.4]);
    assert.equal(HB.giantBossOf({ defId: 'enemy_1001_bigbo' }), null);
  });

  test('sizes, colours and places; a normal enemy only once hurt', () => {
    const u = HB.hudUnit(VP);
    const n = enemy({ defId: 'enemy_1001_bigbo' });
    n.sync(sample({ hp: 1000 }), 0); n.update(1 / 60, cam(), 0);
    assert.ok(!n.lpBars.root.visible, 'full HP: no bar');
    n.sync(sample({ hp: 400 }), 0); n.update(1 / 60, cam(), 0);
    assert.ok(n.lpBars.root.visible);
    assert.equal(n.lpBars.hp.tint, 0xea4700);
    assert.ok(Math.abs(n.lpBars.hp.width - 105 * u * 0.4) < 1e-6);
    // hud_unit on the unit's point: the model stands at its prefab place (render.md 「모델 위치값·그림자」, 2026-10-24)
    assert.equal(n.hudAnchor, 0);
    assert.ok(Math.abs(n.lpBars.hp.position.y - (n.screen.y + 55.3 * u)) < 1e-6);
    const g = enemy({ defId: 'enemy_9021_acduml', boss: true });
    g.sync(sample({ hp: 1000 }), 0); g.update(1 / 60, cam(), 0);
    assert.ok(g.lpBars.root.visible, 'bosses always');
    assert.equal(g.lpBars.hp.tint, 0xff2b2b);
    assert.ok(Math.abs(g.lpBars.hp.width - 798 * 0.35 * u) < 1e-6, '279 units at 0.35');
    assert.ok(Math.abs(g.lpBars.hp.position.y - g.screen.y) < 1e-6, 'centred on the feet');
  });

  test('a hit flashes a giant boss bar; 圣堂剑士 bullets under its HP bar', () => {
    const g = enemy({ defId: 'enemy_9021_acduml', boss: true });
    g.sync(sample({ hp: 1000 }), 0); g.sync(sample({ hp: 900 }), 0);
    assert.ok(g.lpBars.flash > 0);
    const h = enemy({ defId: 'enemy_10087_hlchgr' });
    h.sync(sample({ hp: 500, sp: 3, spMax: 5 }), 0); h.update(1 / 60, cam(), 0);
    assert.equal(h.lpBars.blocks.filter((b) => b.visible).length, 3);
    assert.ok(!h.spFill.visible, 'the drawn SP bar stays hidden');
  });
});

describe('plates (sprite_bg 9-sliced: the core under the bars, the feather outside) and the boss SP row', () => {
  class NineSlicePlane extends fake.P.Container { constructor(t, l, tp, r, b) { super(); this.texture = t; this.borders = [l, tp, r, b]; } }
  const P = () => ({ ...fake.P, NineSlicePlane, Texture: { ...fake.P.Texture, from: (url) => ({ url, width: 157, height: 22, baseTexture: { valid: true } }) } });
  const assets = { localUrl: (g, n) => `/local/${g}/${n}.png` };
  test('ally plate: sprite_bg, 8.6 × 10.32 units larger than the two bars, borders at u px per texture px', () => {
    const b = new HB.AllyBars(P(), new fake.P.Container());
    b.update(1000, 500, 2, { hp: 1, ghost: 1, sp: 0.5 }, assets);
    const o = b.plate.slice;
    assert.ok(o.visible && !b.plate.rect.visible);
    assert.equal(o.texture.url, '/local/ui/battlecommon/sprite_bg.png');
    assert.deepEqual(o.borders, [4, 5, 4, 5]);
    assert.equal(o.scale.x, 2); assert.ok(Math.abs(o.width - 133.6) < 1e-9 && Math.abs(o.height - 24.32) < 1e-9);
    assert.ok(Math.abs(o.position.x - (1000 - 133.6)) < 1e-9);
  });
  test('boss SP row under the HP bar (enemy_boss_sp_slider #ebc9ff) and the giant one (#cab2d4, 16.3 under)', () => {
    const boss = new HB.EnemyBars(P(), new fake.P.Container(), 'boss');
    boss.update(1000, 500, 1, 100, 0, { hp: 1, ghost: 1, sp: 0.4 }, assets);
    assert.equal(boss.spRow.fill.tint, 0xebc9ff);
    assert.ok(Math.abs(boss.spRow.fill.width - 130 * 0.4) < 1e-9);
    assert.ok(Math.abs(boss.spRow.fill.position.y - boss.hp.position.y - 7.5) < 1e-9);
    const giant = new HB.EnemyBars(P(), new fake.P.Container(), 'giant', HB.GIANT_BOSS.enemy_9021_acduml);
    giant.update(1000, 500, 1, 100, 0, { hp: 1, ghost: 1, sp: 0.2 }, assets);
    assert.equal(giant.spRow.fill.tint, 0xcab2d4);
    assert.ok(Math.abs(giant.spRow.fill.position.y - giant.hp.position.y - 16.3) < 1e-9);
    assert.ok(Math.abs(giant.spRow.fill.width - 798 * 0.35 * 0.2) < 1e-9);
    giant.update(1000, 500, 1, 100, 0, { hp: 1, ghost: 1, sp: null }, assets);
    assert.ok(!giant.spRow.fill.visible, 'no SP: no row');
  });
});

describe('假想敌：管 official SP (content/bosses.js skillSp)', () => {
  test('裂管之奏 waits for SP 50 (0/50 +1/s): first cast at 50 s, not its 40-s initial cooldown; b.snap `bsp`', () => {
    const h = makeBattle({ seed: 3, timeLimit: 70, kind: 'boss', units: [{ chessId: 'chess_char_5_01_a', row: 9, col: 5, uid: 1, skillIndex: 0 }],
      enemies: [{ key: 'enemy_9021_acduml', time: 0, route: 0, count: 1 }] });
    const b = h.battle;
    let first = null, at40 = null;
    while (b.time < 60 && first == null) {
      b.step();
      for (const e of b.drainEvents()) if (e[0] === 'fx' && JSON.stringify(e).includes('pipeStrike') && first == null) first = b.time;
      if (at40 == null && b.time >= 40) at40 = b.snapshot().bsp;
    }
    assert.ok(first != null && first >= 49.9 && first < 51, `first cast at ${first}`);
    assert.ok(at40 && at40[0][2] === 50 && Math.abs(at40[0][1] - 40) < 0.2, 'SP 40/50 at 40 s');
  });
});

describe('element ring (char_ep_slider / enemy_ep_slider)', () => {
  class SimpleMesh extends fake.P.Container {
    constructor(t, v, uv) { super(); this.texture = t; this.vertices = v; this.geometry = { getBuffer: () => ({ update() {} }) }; }
  }
  const P = () => ({ ...fake.P, SimpleMesh, Texture: { ...fake.P.Texture, from: (url) => ({ url, width: 14, height: 14, baseTexture: { valid: true } }) } });
  const assets = { localUrl: (g, n) => `/local/${g}/${n}.png` };
  test('no SimpleMesh or no art: not ready (the drawn row stays)', () => {
    assert.equal(HB.epRingReady(fake.P, assets, 'ally'), false);
    assert.equal(HB.epRingReady(P(), {}, 'ally'), false);
    assert.equal(HB.epRingReady(P(), assets, 'enemy'), true);
  });
  test('ally: ×1.2 at 25.9 under hud_unit, the element colour and icon, a radial fill from 12 o\'clock clockwise', () => {
    const r = new HB.ElementRing(P(), new fake.P.Container(), 'ally');
    assert.ok(r.update(assets, 'apoptosis', 0.25, false, 1000, 500, 1, 0));
    assert.ok(Math.abs(r.root.position.y - (500 - HB.HUD_ANCHOR + 25.9)) < 1e-9 && r.root.scale.x === 1.2);
    assert.equal(r.disc.tint, 0x474747);
    assert.equal(r.icon.texture.url, '/local/ui/battlecommon/sprite_ep_dark_icon.png');
    const v = r.fill.v;
    assert.ok(Math.abs(v[2]) < 1e-6 && v[3] < 0, 'starts at the top');
    assert.ok(Math.abs(v[(48 + 1) * 2] - 14) < 1e-6 && Math.abs(v[(48 + 1) * 2 + 1]) < 1e-6, '25 %: ends at 3 o\'clock');
    assert.equal(r.ghostFill.mesh.alpha, 0.3);
  });
  test('enemy: no icon, the grey fill (#d5d5d5) and the break colour on a burst', () => {
    const r = new HB.ElementRing(P(), new fake.P.Container(), 'enemy');
    r.update(assets, 'burn', 0.6, false, 0, 0, 1, 0);
    assert.equal(r.disc.tint, 0xe3531a); assert.equal(r.fill.mesh.tint, 0xd5d5d5); assert.equal(r.icon, undefined);
    r.update(assets, 'burn', 0, true, 0, 0, 1, 0.01);
    assert.ok(r.spread.visible && r.spread.tint === 0xe3531a, 'the burst spreads');
  });
});

describe('④ official damage / heal numbers (num-official.js, local-hud.js damageNumberFlag, number-style.js)', () => {
  test('flag: a hit ≥ 1.5 × its expected damage is critical (PRTS 伤害红字); 蕾缪안 S3 (snipe / bombard) forced; DoT / sourceless never', async () => {
    const { damageNumberFlag } = await import('../server/sim/local-hud.js');
    const ss = { atk: 1000 };
    assert.equal(damageNumberFlag({ amount: 3000, tags: [] }, ss, 1000, 1499), 0, 'a 300 % skill without 脆弱: no number');
    assert.equal(damageNumberFlag({ amount: 1000, tags: [] }, ss, 600, 900), 1, '脆弱 / 增伤 ×1.5');
    assert.equal(damageNumberFlag({ amount: 3000, tags: ['dot'] }, ss, 100, 3000), 0);
    assert.equal(damageNumberFlag({ amount: 3000, tags: [], sourceless: true }, ss, 100, 3000), 0);
    assert.equal(damageNumberFlag({ amount: 10, tags: ['skill', 'bombard'] }, ss, 10, 10), 2);
    assert.equal(damageNumberFlag({ amount: 10, tags: ['skill', 'snipe'] }, ss, 10, 10), 2);
    assert.equal(damageNumberFlag({ amount: 3000, tags: [] }, null, 100, 3000), 0);
  });
  test('real battle: 脆弱 makes red numbers — the same hits without it have none', () => {
    const run = (fragile) => {
      const h = makeBattle({ seed: 3, timeLimit: 40, units: [{ chessId: 'chess_char_5_01_a', row: 9, col: 4, uid: 1, skillIndex: 0 }],
        enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 6, interval: 2 }] });
      for (let t = 0; t < 28; t++) {
        h.run(1);
        if (fragile) for (const e of h.battle.units) if (e.side === 'enemy' && e.alive && !e.findBuff('test:fragile')) h.battle.addBuff(e, { key: 'test:fragile', persist: true, mods: { dmgTakenMul: 1.6 } });
      }
      assert.ok(h.eventsOf('dmg').length > 0, 'hits landed');
      return h.eventsOf('dmg').filter((e) => e[4] === 1).length;
    };
    assert.equal(run(false), 0);
    assert.ok(run(true) > 0, 'with 脆弱 ×1.6');
  });
  test('real battle: 蕾缪안 S3 shots / shells carry the forced flag in the dmg event\'s 5th field', () => {
    const h = makeBattle({ seed: 3, timeLimit: 60, units: [{ chessId: 'chess_char_6_01_a', row: 9, col: 4, uid: 1, skillIndex: 2 }],
      enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 20, interval: 1.5 }] });
    const u = h.battle.allyUnits.find((x) => x.kind === 'op');
    h.run(1); u.skill.sp = u.skill.spCost; h.run(30);
    assert.ok(h.eventsOf('dmg').some((e) => e[4] === 2), 'forced numbers');
    assert.ok(h.eventsOf('dmg').some((e) => !e[4]), 'normal hits: none');
  });
  test('real battle: 锏 S3 slashes are red (天生的武者 at 100 %: its 165 % ATK is not in the expected damage — maintainer video)', () => {
    const h = makeBattle({ seed: 3, timeLimit: 60, units: [{ chessId: 'chess_char_6_19_a', row: 9, col: 4, uid: 1, skillIndex: 2 }],
      enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 20, interval: 1.5 }] });
    const u = h.battle.allyUnits.find((x) => x.kind === 'op');
    for (let i = 0; i < 20; i++) { h.run(1); if (!u.skill.active) u.skill.sp = u.skill.spCost; }
    const d = h.eventsOf('dmg');
    assert.ok(d.length >= 10, 'slashes landed');
    assert.ok(d.filter((e) => e[4] === 1).length >= d.length * 0.8, 'nearly every slash red');
  });
  test('official: damage only when flagged, heals always "+n"; sizes in HUD units from the popup 150 over hud_unit', async () => {
    const N = await import('../public/js/render/num-official.js');
    const ctx = fakeViewCtx(fake.P, { viewport: () => ({ width: 1920, height: 1080 }) });
    const nums = new N.OfficialNumbers(ctx);
    const v = { screen: { x: 500, y: 600 }, destroyed: false };
    nums.damage(v, 800, 0);
    assert.equal(nums.live.length, 0, 'an ordinary hit: no number');
    nums.damage(v, 1600, 1); nums.heal(v, 37);
    assert.equal(nums.live.length, 2);
    const [d, hl] = nums.live;
    assert.equal(d.text.text, '1600'); assert.equal(hl.text.text, '+37');
    assert.ok(d.crit && !hl.crit);
    nums.update(0.25);
    assert.ok(Math.abs(d.text.scale.x - 30 * 1.5 * 1.1 / 60) < 1e-9, 'crit: 30 × 1.1, at the peak 1.5× (_fontSizeScale)');
    assert.ok(d.text.position.y < 600 - (HB.HUD_ANCHOR + 150 - 5) , 'over the popup');
    const x0 = d.text.position.x;
    v.screen = { x: 700, y: 400 }; nums.update(0.01);
    assert.equal(d.text.position.x, x0, 'stays where it spawned (UIPopup.InitPosition sets it once) — the unit walking on does not move it');
    nums.update(0.34);
    assert.equal(nums.live.length, 0, 'gone after 0.5 s');
    // an operator's hud_unit is on its point (units.js hudAnchor 0): the heal number rises from 150 over the point
    nums.heal({ screen: { x: 500, y: 600 }, hudAnchor: 0 }, 5);
    const h0 = nums.live[0];
    assert.ok(Math.abs(h0.text.position.y - (600 - 150 - h0.dy)) < 1e-9, 'popup 150 over the point');
  });
  test('official numbers scale with the screen like the bars (a phone is not drawn at the 1080p size)', async () => {
    const N = await import('../public/js/render/num-official.js');
    const phone = { width: 915, height: 412 };
    const nums = new N.OfficialNumbers(fakeViewCtx(fake.P, { viewport: () => phone }));
    nums.heal({ screen: { x: 0, y: 300 } }, 180);
    assert.ok(Math.abs(nums.live[0].text.scale.x - 30 * HB.hudUnit(phone) / 60) < 1e-9, '30 units at 412 / 1080 px per unit');
    // the numbers live in the FX system (fx/numbers.js new OfficialNumbers(this.ctx)): its context must carry the viewport,
    // or hudUnit() falls back to 1 and every screen gets the 1920×1080 size
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../public/js/render/app.js', import.meta.url), 'utf8');
    const fxArgs = src.slice(src.indexOf('new FxSystem({'), src.indexOf('new FxSystem({') + 2500);
    assert.match(fxArgs.slice(0, fxArgs.indexOf('\n  });')), /\n\s+viewport: ctx\.viewport,/, 'FxSystem gets the frame viewport');
  });
  test('blocked: a forced / crit hit stopped by a shield → \'blk\' (1 blue for the client\'s showing shields, 0 BLOCK); ordinary hits nothing', () => {
    const run = (key) => {
      const h = makeBattle({ seed: 3, timeLimit: 60, units: [{ chessId: 'chess_char_6_01_a', row: 9, col: 4, uid: 1, skillIndex: 2 }],
        enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 20, interval: 1.5 }] });
      const u = h.battle.allyUnits.find((x) => x.kind === 'op');
      h.run(1); u.skill.sp = u.skill.spCost;
      for (let t = 0; t < 30; t++) {
        h.run(1);
        for (const e of h.battle.units) if (e.side === 'enemy' && e.alive && !e.findBuff(key)) h.battle.addBuff(e, { key, persist: true, shield: 1e9 });
      }
      return h.eventsOf('blk');
    };
    const plain = run('test:shield');
    assert.ok(plain.length > 0 && plain.every((e) => e[3] === 0), 'BLOCK');
    const xi = run('ab:xiShield');
    assert.ok(xi.length > 0 && xi.every((e) => e[3] === 1 && e[2] > 0), 'blue numbers');
  });
  test('official numbers: blue digits / BLOCK', async () => {
    const N = await import('../public/js/render/num-official.js');
    const nums = new N.OfficialNumbers(fakeViewCtx(fake.P, { viewport: () => ({ width: 1920, height: 1080 }) }));
    const v = { screen: { x: 0, y: 0 } };
    nums.blocked(v, 1234, true); nums.blocked(v, 1234, false);
    assert.deepEqual(nums.live.map((t) => [t.kind, t.text.text]), [['blue', '1234'], ['block', 'BLOCK']]);
  });
  test('numbers move as the client tweens them (UIDamageText / UIHealText.SetTweens)', async () => {
    const N = await import('../public/js/render/num-official.js');
    const nums = new N.OfficialNumbers(fakeViewCtx(fake.P, { viewport: () => ({ width: 1920, height: 1080 }) }));
    const v = { screen: { x: 0, y: 600 } };
    nums.damage(v, 2322, 2); nums.heal(v, 10);
    const [d, hl] = nums.live;
    const base = 30 / 60;
    const y0 = d.text.position.y;
    assert.ok(Math.abs(d.text.scale.x - base) < 1e-9, 'damage starts at scale 1');
    nums.update(1 / 30);
    assert.ok(Math.abs(d.text.scale.x / (1.5 * base) - (1 + 0.5 * N.outExpo(2 / 15)) / 1.5) < 1e-9, 'OutExpo to 1.5: 0.87 of the peak on the first frame');
    assert.ok(Math.abs(hl.text.scale.x - base) < 1e-9, 'the heal has no scale tween');
    nums.update(0.25 - 1 / 30);
    assert.ok(Math.abs(d.text.scale.x - 1.5 * base) < 1e-9, 'peak at half the life');
    const yTop = d.text.position.y;
    assert.ok(yTop < y0, 'risen');
    nums.update(0.2);
    assert.ok(d.text.scale.x < 0.8 * 1.5 * base, 'InExpo shrink at the end');
    assert.ok(d.text.position.y > yTop && d.text.position.y < y0, 'dropping, still above the start at 0.45 s');
    nums.update(0.04);
    assert.ok(d.text.position.y > y0, 'below the start at 0.49 s (_downOffset from the start point)');
    assert.equal(d.text.alpha, 1, 'no fade');
    assert.ok(hl.text.alpha < 0.8 && hl.text.alpha > 0, 'the heal fades (InExpo)');
  });
  test('style setting: official by default, classic kept in localStorage', async () => {
    const store = new Map();
    const prev = globalThis.localStorage;
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    try {
      const S = await import('../public/js/render/number-style.js?t=' + Date.now());
      assert.equal(S.numberStyle(), 'official');
      S.setNumberStyle('classic');
      assert.equal(S.numberStyle(), 'classic'); assert.equal(store.get('sp.pref.dmgNumberStyle'), '"classic"');
      S.setNumberStyle('nonsense');
      assert.equal(S.numberStyle(), 'official');
    } finally { globalThis.localStorage = prev; }
  });
});

describe('⑤ official status effects (fxstatus.js → fxgame.js statusOn / statusOff)', () => {
  test('sim status keys → client prefabs (feet / body / head)', async () => {
    const F = await import('../public/js/render/fxstatus.js');
    assert.equal(F.statusFxKey('tremble'), 'tremble');
    assert.deepEqual(F.STATUS_FX.tremble.slice(0, 2), ['common', 'common_buff_thrill']);
    assert.equal(F.statusFxKey('artsFragile'), 'fragile');
    assert.equal(F.statusFxKey('skill:haini_slow'), 'slow');
    // local patch (maintainer report 2026-10-07): talent marks — 蕾缪안 通缉 crosshair, 焰影苇草 灼痕 X
    assert.equal(F.statusFxKey('lemuen:wanted'), 'wanted');
    assert.deepEqual(F.STATUS_FX.wanted, ['lemuen', { tpl: 'char_lemuen_range_aim' }, 1.1, 2.0], 'by its client key (fxstatus.js keyed)');
    assert.equal(F.statusFxKey('reed2:scorch'), 'scorch');
    assert.deepEqual(F.STATUS_FX.scorch, ['reed2', { tpl: 'reed2_t_1', when: { all: true } }, 0.5], 'by its client key, the buff standing for its conditions');
    // 空弦's 铁弦 护盾 layer: its buff's overrideEffectKey (EN charpack); 凯尔希·思衡托's layer has none
    assert.equal(F.statusFxKey('talent:archet_shield'), 'archet_shield');
    assert.deepEqual(F.STATUS_FX.archet_shield, ['archet', { tpl: 'archet_t_2' }, 0], 'by its client key (fxstatus.js keyed)');
    const { PLAYS } = await import('./helpers/fxPlays.js');
    const archet = { isEnemy: false, alive: true, flags: 0, statuses: new Set(['talent:archet_shield']) };
    assert.deepEqual([...F.wantedStatusFx(archet, new Map(), null, PLAYS)], [['archet_shield', ['archet', 'archet_buff_01_start', 0]]]);
    assert.deepEqual([...F.wantedStatusFx(archet, new Map())], [], 'without the plays: none');
    const marked = { isEnemy: true, alive: true, flags: 0, statuses: new Set(['lemuen:wanted', 'reed2:scorch']) };
    assert.deepEqual([...F.wantedStatusFx(marked, new Map(), null, PLAYS).values()].map((x) => x[1]).sort(), ['lemuen_talent_buff_01', 'reed2_debuff_01']);
    assert.equal(F.statusFxKey('talent:kalts2:shield'), null);
    assert.equal(F.statusFxKey('ines:aspdGain'), null, 'an ASPD gain is no 攻速下降');
    assert.equal(F.statusFxKey('bind'), null, 'no common prefab: the applier\'s buff effect (SOURCE_FX)');
    assert.equal(F.statusFxKey('invulnerable'), null, 'no 脆弱 by the /vulner/ keyword');
    assert.equal(F.STATUS_FX.freeze[1], 'buff_autochess_frozen');
    assert.equal(F.STATUS_FX.freeze[2], 0); assert.ok(F.STATUS_FX.cold[2] > 1, 'head point over the head');
  });
  test('flags and statuses → wanted effects; stealth by side, 迷彩 by its flag; sync turns them on / off', async () => {
    const F = await import('../public/js/render/fxstatus.js');
    const { UF_CAMOU } = await import('../shared/local.js');
    const enemy = { isEnemy: true, alive: true, flags: UF.FROZEN | UF.COLD | UF.STEALTH, statuses: new Set(['tremble', 'bind']) };
    assert.deepEqual([...F.wantedStatusFx(enemy).keys()].sort(), ['cold', 'freeze', 'stealth', 'tremble']);
    const ally = { isEnemy: false, alive: true, flags: UF.STEALTH | UF_CAMOU, statuses: new Set() };
    assert.deepEqual([...F.wantedStatusFx(ally).keys()], ['camou']);
    const calls = [];
    const fxGame = { statusReady: (b, n) => n !== 'common_buff_thrill', statusOn: (v, b, n, k) => { (v._fxStatusOn ||= new Set()).add(k); calls.push(['on', k]); }, statusOff: (v, k) => { v._fxStatusOn.delete(k); calls.push(['off', k]); } };
    F.syncStatusFx(new Map([[1, enemy]]), fxGame, true);
    assert.deepEqual(calls.filter((c) => c[0] === 'on').map((c) => c[1]).sort(), ['cold', 'freeze', 'stealth'], 'the unextracted fist plays nothing');
    assert.equal(enemy._statusIcons, false, 'the layer is on: no drawn icons');
    enemy.flags = UF.COLD; calls.length = 0;
    F.syncStatusFx(new Map([[1, enemy]]), fxGame, true);
    assert.deepEqual(calls.map((c) => c.join(':')).sort(), ['off:freeze', 'off:stealth']);
    F.syncStatusFx(new Map([[1, enemy]]), fxGame, false);
    assert.equal(enemy._fxStatusOn.size, 0, 'none outside battle');
  });
  test('units.js: the drawn status icons only while the effect layer is off (maintainer decision 2026-10-14)', () => {
    const v = view({ side: 'enemy', kind: 'enemy', defId: 'enemy_1001_bigbo' });
    v.sync(sample({ hp: 500, flags: UF.COLD | UF.INVULN }), 0);
    v.statuses.add('bind');
    v._statusIcons = true;   // quality 'low' / no WebP / no extracted effects (fxstatus.js syncStatusFx)
    assert.deepEqual([...v._iconKeys()].sort(), ['bind', 'cold', 'invuln']);
    v._statusIcons = false;  // the layer is on: the official game draws no badge
    assert.deepEqual([...v._iconKeys()], []);
  });
});

describe('facing marker (DirectionIndicator: ring + arrow on the ground)', () => {
  test('no SimpleMesh / no art: none (the chevron stays)', async () => {
    const F = await import('../public/js/render/facing.js');
    assert.equal(F.facingTextures(fake.P, { ui: () => '/x.png' }), null);
  });
  test('the arrow quad: 0.333 tiles out, the packed texture inside its 0.704-tile rect, turned with the facing', async () => {
    const F = await import('../public/js/render/facing.js');
    class SimpleMesh extends fake.P.Container { constructor(t, v) { super(); this.texture = t; this.vertices = v; } }
    const P = { ...fake.P, SimpleMesh };
    const m = new F.FacingMarker(P, { ring: {}, arrow: {} });
    const camId = { project: (x, y, z, o) => { o.x = x; o.y = y; return o; } };
    m.update(camId, 0, 0, 0, [1, 0], 1);
    const v = m.arrow.vertices, k = 0.704 / 128;
    assert.ok(Math.abs(v[0] - (0.333 + (31 - 64) * k)) < 1e-6 && Math.abs(v[1] - (64 - 8) * k) < 1e-6, 'left-top corner');
    assert.ok(Math.abs(v[2] - (0.333 + (96 - 64) * k)) < 1e-6, 'tip side ≈ the tile edge');
    m.update(camId, 0, 0, 0, [0, 1], 1);
    assert.ok(Math.abs(m.arrow.vertices[1] - (0.333 + (31 - 64) * k)) < 1e-6, 'UP: along +y');
    assert.equal(m.arrow.tint, 0xff9900); assert.equal(m.ring.alpha, 0.502);
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
