// The stored-charge mark over a unit whose AUTO skill can be charged more than once (可充能N次), as the client: client
// UIHudCharSkillMarkPanel.UpdatePlugin shows `auto_skill_ready` with `text_skill_cnt` = BasicSkill.availableCnt while it is
// above 0, for an AUTO skill of maxChargeTime > 1 (a MANUAL skill's mark needs UNIT_HUD_SKILL_CAST_MASK, which 卫戍协议 turns
// off). The sim lists the count in b.snap `charge` (server/sim/local-hud.js chargeMark); render/hud-bars.js SkillMark draws it.
// docs/rules/ui.md 「충전 스킬 표식」.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { hudLists, chargeMark } from '../../server/sim/local-hud.js';
import { normalizeSnapshot } from '../../public/js/render/interp.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

let fake, UnitView, HB;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
  HB = await import('../../public/js/render/hud-bars.js');
});
after(() => fake.restore());

const BLEMSH = 'chess_char_3_12_b';   // 瑕光 elite: S1 (index 0) AUTO, 可充能2次
const SARIA = 'chess_char_5_11_b';    // 塞雷娅 elite: S1 (index 0) AUTO, 可充能2次
const TINMAN = 'chess_char_1_16_b';   // 锡人 elite: S2 MANUAL, 可充能2次
const DUMMY = { e: enemyRec({ key: 'e', hp: 1e9, atk: 0, speed: 0, blockCnt: 0 }) };
const opOf = (h, id) => h.b.allyUnits.find((a) => a.defId === id && a.kind === 'op');
const chargeOf = (snap, u) => (snap.charge || []).find((e) => e[0] === u.id)?.[1] ?? 0;

describe('chargeMark: which skills show the count', () => {
  test('AUTO and more than one charge: the charges stored; MANUAL, one charge or none stored: 0', () => {
    const sk = (o) => ({ kind: 'instant', maxCharges: 2, charges: 1, def: { skillType: 'AUTO' }, ...o });
    assert.equal(chargeMark(sk({})), 1);
    assert.equal(chargeMark(sk({ charges: 2 })), 2);
    assert.equal(chargeMark(sk({ charges: 0 })), 0);
    assert.equal(chargeMark(sk({ def: { skillType: 'MANUAL' } })), 0, 'MANUAL: no mark in 卫戍协议');
    assert.equal(chargeMark(sk({ maxCharges: 1, charges: 1 })), 0, 'one charge: no count');
    assert.equal(chargeMark(sk({ kind: 'passive' })), 0);
    assert.equal(chargeMark(null), 0);
  });
});

describe('real battles: charges are stored, listed, and spent back to back', () => {
  for (const [id, name] of [[BLEMSH, '瑕光 S1'], [SARIA, '塞雷娅 S1']]) {
    test(`${name}: both charges stored with no target, the mark counts 1 → 2, then both are cast in a row`, () => {
      const h = makeBattle({ seed: 5, autoFinish: false, timeLimit: 80, hooks: ['skillStart'], defs: { enemies: DUMMY },
        units: [{ chessId: id, row: 10, col: 5, skillIndex: 0 }, { chessId: 'chess_char_1_06_a', row: 11, col: 5 }] });
      const u = opOf(h, id);
      assert.equal(u.skill.maxCharges, 2);
      const seen = new Set();
      for (let i = 0; i < 60 * 2; i++) { h.run(0.5); seen.add(chargeOf(h.b.snapshot(), u)); }
      assert.deepEqual([...seen].sort(), [0, 1, 2], 'the count rose 0 → 1 → 2');
      assert.equal(u.skill.charges, 2, 'held at the cap, nothing lost');
      assert.equal(h.hooksOf('skillStart').length, 0, 'no cast without a reason');
      // a reason to cast: an injured ally (塞雷娅's heal) and an enemy on her tile
      const ally = opOf(h, 'chess_char_1_06_a');
      ally.hp = ally.s.maxHp * 0.3;
      h.spawn('e', { route: { motion: 'WALK', start: [u.tileR, u.tileC], end: [u.tileR, u.tileC], checkpoints: [] } });
      const t0 = h.b.time;
      // the reason stays (the ally kept injured): every stored charge goes, one per attack
      for (let i = 0; i < 30; i++) { ally.hp = Math.min(ally.hp, ally.s.maxHp * 0.3); h.run(0.1); }
      const casts = h.hooksOf('skillStart').filter((c) => c.unit === u).map((c) => c.t - t0);
      assert.ok(casts.length >= 2 && casts[1] < 2, `two casts in a row (${casts.map((t) => t.toFixed(2))})`);
    });
  }

  test('a MANUAL charge skill (锡人 S2) stores its charges but lists no mark', () => {
    const h = makeBattle({ seed: 5, autoFinish: false, timeLimit: 80, units: [{ chessId: TINMAN, row: 10, col: 5 }] });
    const u = opOf(h, TINMAN);
    h.run(75);
    assert.equal(u.skill.charges, 2);
    assert.equal(chargeOf(h.b.snapshot(), u), 0);
  });

  test('through the real match path (Match board → BattleSpec → createBattleFromSpec): 至简 elite S2 (×3)', async () => {
    const { makeMatch } = await import('../match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 5 }).start();
    h.toPrep(1);
    const m = h.m, ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const p = ps.acquireChess('chess_char_3_13_b', { source: 'buy' });
    assert.ok(p);
    let placed = false;
    for (let r = 0; r < 20 && !placed; r++) for (let c = 0; c < 22 && !placed; c++) placed = m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: r, col: c }, dir: 'RIGHT' }).ok;
    assert.ok(placed);
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'charge', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    const u = b.allyUnits.find((x) => x.def.charId === 'char_4054_malist');
    assert.ok(u && u.skill.maxCharges === 3 && !u.skill.manual);
    u.skill.gainSp(u.skill.spCost * 2, 'test');
    assert.equal(chargeOf(b.snapshot(), u), 2);
  });
});

describe('b.snap `charge` → the view', () => {
  test('interp hands the count to the sample; a bad entry is dropped', () => {
    const n = normalizeSnapshot({ t: 1, units: [[1, 2, 3, 10, 10, 0, 0, 0, 0], [2, 2, 3, 10, 10, 0, 0, 0, 0]], charge: [[1, 2], [2, 0], [9, 1], 'x'] });
    assert.equal(n.units.get(1).charge, 2);
    assert.equal(n.units.get(2).charge, undefined);
    assert.deepEqual(hudLists([{ id: 1, alive: true, deployed: true, side: 'ally', buffs: [], skill: { kind: 'instant', maxCharges: 3, charges: 3, def: { skillType: 'AUTO' } } }]).charge, [[1, 3]]);
  });

  test('SkillMark: the prefab sizes and colours over hud_unit; hidden at 0', () => {
    const M = HB.SKILL_MARK;
    const k = new HB.SkillMark(fake.P, new fake.P.Container());
    k.update(1000, 500, 2, 2);
    assert.ok(k.root.visible);
    assert.equal(k.label.text, '2');
    assert.equal(k.disc.width, M.disc * 2);
    assert.equal(k.disc.position.y, HB.hudAnchorY(500, 2) - M.y * 2);
    assert.equal(k.label.position.y, k.disc.position.y - M.textY * 2, 'the number 3 units up');
    assert.equal(k.label.style.fill, 0xffd900);
    k.update(1000, 500, 2, 0);
    assert.ok(!k.root.visible);
  });

  test('over the drawn model\'s head point (fxpoints.js `head`) when known, else the prefab\'s own place', () => {
    const M = HB.SKILL_MARK;
    const pts = { char_x: { head: { F: { at: [0, 400] }, B: { at: [0, 450] } } } };
    const v = { info: { spine: 'char_x' }, spineReady: true, modelSY: 0.25, root: { y: 600 }, body: { y: -10 }, entryBack: false };
    assert.equal(HB.headPointY(v, pts), 590 - 100);
    assert.equal(HB.headPointY({ ...v, entryBack: true }, pts), 590 - 112.5, 'the back model\'s point');
    assert.equal(HB.headPointY({ ...v, spineReady: false }, pts), null, 'no model drawn yet');
    assert.equal(HB.headPointY({ ...v, info: { spine: 'char_y' } }, pts), null, 'no points entry');
    const k = new HB.SkillMark(fake.P, new fake.P.Container());
    k.update(1000, 500, 2, 1, null, { ...v, info: { spine: 'char_none' } });
    assert.equal(k.disc.position.y, HB.hudAnchorY(500, 2) - M.y * 2, 'fallback: 154.7 over hud_unit');
  });

  test('a view: the mark shows with stored charges and goes with them', () => {
    const VP = { width: 1920, height: 1080 };
    const ctx = fakeViewCtx(fake.P, { assets: null, cam: () => presetCamera('prep', VP), viewport: () => VP });
    const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'op', defId: 'char_x', tier: 3, x: 5, y: 12, maxHp: 2000 }, {});
    const s = { x: 5, y: 12, hp: 2000, maxHp: 2000, sp: 3, spMax: 5, flags: 0, anim: 0, vx: 0, vy: 0, el: null, charge: 1 };
    v.sync(s, 0); v.update(1 / 60, presetCamera('prep', VP), 0);
    assert.ok(v.lpMark.root.visible);
    assert.equal(v.lpMark.label.text, '1');
    v.sync({ ...s, charge: 0 }, 0.1); v.update(1 / 60, presetCamera('prep', VP), 0.1);
    assert.ok(!v.lpMark.root.visible);
  });
});
