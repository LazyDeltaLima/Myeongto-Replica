// The official bullet bar for the client's `_showSpAsBulletMode` skills (docs/rules/ui.md 「탄환형 스킬」): the flag is read
// from the client (tools/local-extract/skill_hud.py → tools/assets/local-skill-hud.json → data `bulletMode`), the sim lists
// the bar in b.snap `ammo` (server/sim/local-hud.js bulletView) — a running ammo skill's bullets unless the flag is off,
// a non-ammo bullet-mode skill's SP while it is affecting: 琳琅诗怀雅's coins out of the skill's `sp` — and the view draws it
// in place of the SP row (render/hud-bars.js), a passive skill without UF.SKILL included. Display only: the golden
// digests never read `ammo` (tools/golden.mjs).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { bulletView } from '../../server/sim/local-hud.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { UF } from '../../shared/constants.js';

let fake, UnitView, HB;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
  HB = await import('../../public/js/render/hud-bars.js');
});
after(() => fake.restore());

const json = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const battle = (chessId, skillIndex) => {
  const h = makeBattle({ seed: 3, timeLimit: 60, units: [{ chessId, row: 9, col: 4, uid: 1, skillIndex }],
    enemies: [{ key: 'enemy_1001_bigbo', time: 0, route: 0, count: 6, interval: 2 }] });
  return { h, u: h.battle.allyUnits.find((x) => x.kind === 'op') };
};
const entry = (snap, id) => (snap.ammo || []).find((e) => e[0] === id) ?? null;

describe('data: the client flag on every skill record', () => {
  test('琳琅诗怀雅\'s three skills and the flagged ammo skills are 1; 新约能天使 S2 / S3 and 予愿安洁莉娜 S3 are 0', () => {
    const flags = json('tools/assets/local-skill-hud.json').skills;
    for (const id of ['skchr_swire2_1', 'skchr_swire2_2', 'skchr_swire2_3', 'skchr_excu2_1', 'skchr_lemuen_3', 'skchr_wang_3', 'skchr_clemnt_3', 'skchr_kalts2_2']) assert.equal(flags[id], 1, id);
    for (const id of ['skchr_angel2_2', 'skchr_angel2_3', 'skchr_aglna2_3', 'skchr_texas2_1']) assert.equal(flags[id], 0, id);
    // every skill record of the pool carries the flag it was read with
    const seen = new Map();
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;
      if (typeof o.skillId === 'string' && 'durationType' in o) seen.set(o.prefabId || o.skillId, o.bulletMode);
      for (const v of Object.values(o)) walk(v);
    };
    walk(json('data/chess.json')); walk(json('data/backups.json'));
    assert.ok(seen.size > 100);
    for (const [id, v] of seen) assert.equal(v, flags[id], id);
  });
});

describe('sim: b.snap `ammo` (local-hud.js bulletView)', () => {
  test('琳琅诗怀雅 S1 / S2 (passive): her coins out of the skill\'s `sp` from deployment, zero included; gone when she leaves', () => {
    for (const skillIndex of [0, 1]) {
      const { h, u } = battle('chess_char_3_04_a', skillIndex);
      const cap = u.skill.bb.sp;
      assert.equal(u.skill.kind, 'passive');
      h.run(0.05);
      const s = h.battle.snapshot();
      assert.deepEqual(entry(s, u.id), [u.id, u.mem.coins ?? 0, cap]);
      assert.equal(s.units.find((t) => t[0] === u.id)[7] & UF.SKILL, 0, 'a passive skill carries no UF.SKILL');
      u.mem.coins = 0;
      assert.deepEqual(entry(h.battle.snapshot(), u.id), [u.id, 0, cap], 'zero is a balance');
      u.mem.coins = cap + 5;
      assert.deepEqual(entry(h.battle.snapshot(), u.id), [u.id, cap, cap], 'never over the cap');
      h.battle.retreat(u, { reason: 'retreat' });
      assert.equal(entry(h.battle.snapshot(), u.id), null, 'none once she left');
    }
  });

  test('琳琅诗怀雅 S3: the SP bar while it charges, the coins out of 10 while it runs', () => {
    const { h, u } = battle('chess_char_3_04_a', 2);
    h.run(0.05);
    assert.equal(entry(h.battle.snapshot(), u.id), null, 'not affecting yet: her SP slider');
    u.skill.sp = u.skill.spCost;
    assert.ok(h.runUntil(() => u.skill.active, 20), 'S3 starts');
    const e = entry(h.battle.snapshot(), u.id);
    assert.deepEqual(e, [u.id, Math.min(10, u.mem.coins ?? 0), 10]);
    assert.equal(u.skill.bb.sp, 10);
  });

  test('新约能天使 S2 (an ammo skill without the flag): no bullet bar — the draining cast bar of the unit tuple', () => {
    const { h, u } = battle('chess_char_6_13_a', 1);
    assert.equal(u.skill.id, 'skchr_angel2_2');
    assert.equal(u.skill.kind, 'ammo');
    h.run(0.5);
    u.skill.sp = u.skill.spCost;
    assert.ok(h.runUntil(() => u.skill.active, 20), 'S2 starts');
    const s = h.battle.snapshot();
    assert.equal(entry(s, u.id), null);
    const t = s.units.find((x) => x[0] === u.id);
    assert.ok(t[7] & UF.SKILL);
    assert.ok(t[6] > 0 && t[5] > 0 && t[5] <= t[6], 'bullets left as the SP share');
  });

  test('bulletView rules', () => {
    const ammo = (o = {}) => ({ kind: 'ammo', active: true, ammoLeft: 5, ammoMax: 9, ammo: 8, def: {}, ...o });
    assert.deepEqual(bulletView(ammo()), [5, 9], 'flag not read: the bullets, as before');
    assert.deepEqual(bulletView(ammo({ def: { bulletMode: 1 } })), [5, 9]);
    assert.equal(bulletView(ammo({ def: { bulletMode: 0 } })), null, 'flag off: the cast slider');
    assert.equal(bulletView(ammo({ active: false })), null);
    const sp = (o = {}) => ({ id: 'skchr_x_1', kind: 'auto', active: true, sp: 2.6, spCost: 4, def: { bulletMode: 1 }, ...o });
    assert.deepEqual(bulletView(sp()), [2, 4], 'any other skill: its SP out of its cost');
    assert.equal(bulletView(sp({ active: false })), null, 'not affecting');
    assert.deepEqual(bulletView(sp({ kind: 'passive', active: false })), [2, 4], 'a passive one always');
    assert.equal(bulletView(sp({ def: { bulletMode: null } })), null);
    assert.equal(bulletView(sp({ spCost: 0 })), null, 'no max');
    const swire = { id: 'skchr_swire2_3', kind: 'toggle', active: true, sp: 0, spCost: 5, bb: { sp: 10 }, def: { bulletMode: 1 } };
    assert.deepEqual(bulletView(swire, { mem: {} }), [0, 10], 'no coin yet = 0');
    assert.deepEqual(bulletView(swire, { mem: { coins: 7 } }), [7, 10]);
    assert.equal(bulletView({ ...swire, noSkill: true }, { mem: {} }), null);
    assert.equal(bulletView(null), null);
  });
});

describe('the view: the bullet bar in place of the SP row', () => {
  const VP = { width: 1920, height: 1080 };
  const cam = () => presetCamera('normal', VP);
  const view = () => new UnitView(fakeViewCtx(fake.P, { assets: null, cam, viewport: () => VP }),
    { id: 1, side: 'ally', kind: 'op', defId: 'char_1033_swire2', tier: 3, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT' }, {});
  const sample = (o = {}) => ({ x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0, vy: 0, el: null, ...o });

  test('a passive skill\'s coins (no UF.SKILL): one block per coin under the HP bar; hidden when the entry disappears', () => {
    const v = view();
    v.sync(sample({ ammo: [1, 3] }), 0); v.update(1 / 60, cam(), 0);
    const b = v.lpBars;
    assert.ok(b.ammoTrack.visible && !b.sp.visible);
    assert.equal(b.blocks.filter((x) => x.visible).length, 1);
    assert.ok(Math.abs(b.ammoTrack.position.y - b.hp.position.y - 7) < 1e-6, 'the SP row');
    v.sync(sample({ ammo: [3, 3] }), 1); v.update(1 / 60, cam(), 1);
    assert.equal(b.blocks.filter((x) => x.visible).length, 3);
    v.sync(sample(), 2); v.update(1 / 60, cam(), 2);
    assert.ok(!b.ammoTrack.visible && b.blocks.every((x) => !x.visible), 'no stale bar');
  });

  test('from 40 bullets one bar of the share left (UIBulletBar IGNORE_GAP_COUNT), below it blocks', () => {
    const v = view();
    v.lpBars.update(1000, 500, 1, { hp: 1, ghost: 1, sp: null, ammo: [20, HB.BULLET_NO_GAP] });
    assert.equal(v.lpBars.blocks.filter((x) => x.visible).length, 1);
    assert.ok(Math.abs(v.lpBars.blocks[0].width - 125 / 2) < 1e-9);
    v.lpBars.update(1000, 500, 1, { hp: 1, ghost: 1, sp: null, ammo: [20, HB.BULLET_NO_GAP - 1] });
    assert.equal(v.lpBars.blocks.filter((x) => x.visible).length, 20);
  });
});
