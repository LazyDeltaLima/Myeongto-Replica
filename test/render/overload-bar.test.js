// The official overload bar of a 过载 skill (docs/rules/ui.md 「과부하 스킬」): the client's `_isOverloadSkill` is read from
// the skill prefabs (tools/local-extract/skill_hud.py → tools/assets/local-skill-hud.json `overload` → data `overload`),
// the sim lists a running one in b.snap `ovl` (server/sim/local-hud.js overloadMark) and the view splits the SP cast
// slider / bullet bar at the overload ratio 0.5 (render/hud-bars.js): the first half's share left #ffa800 with the spent
// part tinted #bd5a00 α.4 from the right, then the overload slider #d04500 opaque; 号角 S2's bullets likewise. Display
// only: the golden digests never read `ovl` (tools/golden.mjs).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { overloadMark, hudLists } from '../../server/sim/local-hud.js';
import { normalizeSnapshot } from '../../public/js/render/interp.js';
import { makeBattle } from '../helpers/battleHarness.js';

let fake, UnitView, HB;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
  HB = await import('../../public/js/render/hud-bars.js');
});
after(() => fake.restore());

const json = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const OVERLOAD = ['skchr_horn_2', 'skchr_horn_3', 'skchr_oxi_3', 'skchr_rockr_2', 'skchr_wisdel_2'];
const battle = (chessId, skillIndex) => {
  const h = makeBattle({ seed: 3, timeLimit: 90, units: [{ chessId, row: 9, col: 4, uid: 1, skillIndex }],
    enemies: [{ key: 'enemy_1007_slime', time: 0, route: 0, count: 90, interval: 1 }] });
  return { h, u: h.battle.allyUnits.find((x) => x.kind === 'op') };
};
const listed = (snap, id) => (snap.ovl || []).some((e) => e[0] === id);
const share = (snap, id) => { const t = snap.units.find((x) => x[0] === id); return t[5] / t[6]; };

describe('data: the client flag', () => {
  test('号角 S2 / S3, 洛洛 S2, 维什戴尔 S2 and 塔露拉 S3 are the overload skills, and every skill record says so', () => {
    assert.deepEqual(Object.keys(json('tools/assets/local-skill-hud.json').overload).sort(), OVERLOAD);
    const seen = new Map();
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;
      if (typeof o.skillId === 'string' && 'durationType' in o) seen.set(o.prefabId || o.skillId, o.overload ?? 0);
      for (const v of Object.values(o)) walk(v);
    };
    walk(json('data/chess.json')); walk(json('data/backups.json'));
    assert.ok(seen.size > 100);
    for (const [id, v] of seen) assert.equal(v, OVERLOAD.includes(id) ? 1 : 0, id);
  });
});

describe('sim: b.snap `ovl` (local-hud.js overloadMark)', () => {
  test('洛洛 S2: listed while it runs only; her overload begins as the share left reaches the ratio', () => {
    const { h, u } = battle('chess_char_2_10_a', 1);
    assert.equal(u.skill.id, 'skchr_rockr_2');
    h.run(0.5);
    assert.ok(!listed(h.battle.snapshot(), u.id), 'charging: the SP slider');
    u.skill.sp = u.skill.spCost;
    assert.ok(h.runUntil(() => u.skill.active, 20), 'S2 starts');
    assert.ok(listed(h.battle.snapshot(), u.id));
    assert.ok(h.runUntil(() => u.mem.rockOver, 60), 'her overload');
    const r = share(h.battle.snapshot(), u.id);
    assert.ok(Math.abs(r - HB.OVERLOAD_RATIO) < 0.02, `the bar turns at the kit's overload (${r})`);
    assert.ok(h.runUntil(() => !u.skill.active, 60), 'S2 ends');
    assert.ok(!listed(h.battle.snapshot(), u.id), 'gone with the skill');
  });

  test('号角 S3 is listed, S1 never', () => {
    for (const [i, want] of [[2, true], [0, false]]) {
      const { h, u } = battle('chess_char_5_08_a', i);
      h.run(0.5);
      u.skill.sp = u.skill.spCost;
      assert.ok(h.runUntil(() => u.skill.active || u.skill.sp < u.skill.spCost, 20), u.skill.id);
      if (u.skill.active) assert.equal(listed(h.battle.snapshot(), u.id), want, u.skill.id);
      else assert.equal(want, false, u.skill.id);
    }
  });

  test('interp: the entry rides on the tuple as `.ovl`; others and bad entries carry none', () => {
    const ally = (id, overload) => ({ id, alive: true, deployed: true, side: 'ally', buffs: [], skill: { kind: 'duration', active: true, def: { overload } } });
    const ovl = hudLists([ally(1, 1), ally(2, 0)]).ovl;
    assert.deepEqual(ovl, [[1]]);
    const n = normalizeSnapshot({ t: 1, units: [[1, 2, 3, 10, 10, 5, 10, 0, 0], [2, 2, 3, 10, 10, 5, 10, 0, 0]], ovl: [...ovl, [9], 'x'] });
    assert.equal(n.units.get(1).ovl, 1);
    assert.equal(n.units.get(2).ovl, undefined);
    const over = { ...ally(3, 1), mem: { hornS2Over: true } };
    assert.deepEqual(hudLists([over]).ovl, [[3, 1]], '号角 S2 overloaded');
    assert.equal(normalizeSnapshot({ t: 1, units: [[3, 2, 3, 10, 10, 5, 10, 0, 0]], ovl: [[3, 1]] }).units.get(3).ovl, 2);
  });

  test('overloadMark rules', () => {
    const sk = (o = {}) => ({ kind: 'duration', active: true, def: { overload: 1 }, ...o });
    assert.equal(overloadMark(sk()), true);
    assert.equal(overloadMark(sk({ active: false })), false);
    assert.equal(overloadMark(sk({ def: { overload: 0 } })), false);
    assert.equal(overloadMark(sk({ noSkill: true })), false);
    assert.equal(overloadMark(sk({ kind: 'passive' })), false);
    assert.equal(overloadMark(null), false);
  });
});

describe('the view: the overload bar', () => {
  const VP = { width: 1920, height: 1080 };
  const cam = () => presetCamera('normal', VP);
  const view = () => new UnitView(fakeViewCtx(fake.P, { assets: null, cam, viewport: () => VP }),
    { id: 1, side: 'ally', kind: 'op', defId: 'char_4040_rockr', tier: 2, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT' }, {});
  const W = 125, near = (a, b) => Math.abs(a - b) < 1e-6;

  test('the cast slider: the first half\'s share left + the spent tint, then the red overload slider; others unchanged', () => {
    const b = view().lpBars, B = HB.ALLY_BAR;
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.75, cast: true, overload: true });
    assert.equal(b.sp.tint, B.cast); assert.equal(b.sp.alpha, B.alpha);
    assert.ok(near(b.sp.width, W * 0.5), 'clamp01((r − ½) / ½)');
    assert.ok(b.spTint.visible && near(b.spTint.width, W * 0.5) && near(b.spTint.position.x, b.sp.position.x + W * 0.5), 'from the right');
    assert.equal(b.spTint.tint, B.overTint); assert.equal(b.spTint.alpha, B.overTintAlpha);
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 1, cast: true, overload: true });
    assert.ok(near(b.sp.width, W) && !b.spTint.visible, 'just cast: the full orange bar');
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.3, cast: true, overload: true });
    assert.equal(b.sp.tint, B.over); assert.equal(b.sp.alpha, B.overAlpha);
    assert.ok(near(b.sp.width, W * 0.6), 'r / ½');
    assert.ok(!b.spTint.visible);
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.3, cast: true });
    assert.equal(b.sp.tint, B.cast); assert.equal(b.sp.alpha, B.alpha);
    assert.ok(near(b.sp.width, W * 0.3), 'not an overload skill: the plain share');
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.3, cast: false, overload: true });
    assert.equal(b.sp.tint, B.sp, 'charging: the SP slider');
  });

  test('号角 S2\'s bullets: the first half\'s bullets, then the overload bullet bar on its grey track', () => {
    const b = view().lpBars, B = HB.ALLY_BAR;
    const shown = () => b.blocks.filter((x) => x.visible);
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.8, cast: true, ammo: [8, 10], overload: true });
    assert.equal(shown().length, 3, 'left − ½·max');
    assert.ok(near(shown()[0].width, (W - 2 * 4) / 5), 'out of (1 − ½)·max');
    assert.equal(b.ammoTrack.tint, B.ammoTrack);
    assert.ok(shown().every((x) => x.tint === B.ammo));
    assert.equal(B.ammo, 0xebaa2d, 'ui_battle_ally_bullet_bar _BulletColor, output as is by Torappu/UI/BulletBar');
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.5, cast: true, ammo: [5, 10], overload: true });
    assert.equal(shown().length, 5, 'overloaded: left of ½·max');
    assert.equal(b.ammoTrack.tint, B.overTrack); assert.equal(b.ammoTrack.alpha, B.overTrackAlpha);
    assert.ok(shown().every((x) => x.tint === B.over));
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0, cast: true, ammo: [0, 10], overload: true });
    assert.ok(!b.ammoTrack.visible && shown().length === 0, 'hidden at 0 left');
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.6, cast: true, ammo: [6, 10] });
    assert.equal(shown().length, 6);
    assert.equal(b.ammoTrack.tint, B.ammoTrack); assert.equal(b.ammoTrack.alpha, B.ammoTrackAlpha);
    assert.ok(shown().every((x) => x.tint === B.ammo), 'back to the plain bar');
    // refilled above ½·max once overloaded: still the overload bar, which ignores a count above its max (ShowBulletCount)
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.4, cast: true, ammo: [4, 10], overload: true, overloaded: true });
    assert.equal(shown().length, 4);
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.7, cast: true, ammo: [7, 10], overload: true, overloaded: true });
    assert.equal(shown().length, 4, 'keeps what it last showed');
    assert.equal(b.ammoTrack.tint, B.overTrack);
    assert.ok(shown().every((x) => x.tint === B.over), 'not the first half\'s bar');
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.3, cast: true, ammo: [3, 10], overload: true, overloaded: true });
    assert.equal(shown().length, 3, 'back under the max: the count again');
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.8, cast: true, ammo: [8, 10] });
    b.update(1000, 500, 1, { hp: 1, ghost: 1, sp: 0.7, cast: true, ammo: [7, 10], overload: true, overloaded: true });
    assert.equal(shown().length, 5, 'a new activation forgets the old count: nothing shown yet, the full bar');
  });

  test('the snapshot flag reaches the bars (units.js sync)', () => {
    const v = view();
    const sample = (o = {}) => ({ x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 3, spMax: 10, flags: 0, anim: 0, vx: 0, vy: 0, el: null, ...o });
    v.sync(sample({ ovl: true }), 0);
    assert.equal(v.overload, true);
    v.sync(sample(), 1);
    assert.equal(v.overload, false);
  });
});
