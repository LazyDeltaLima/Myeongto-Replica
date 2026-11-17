// test/render/tile-stealth-fx.test.js — a tile's 隐匿 is drawn by its tile buff's own effect, not by the operator's own
// common_invisible (docs/rules/fx.md 「공식 전투 이펙트 (2026-10-05)」, the 배기 구역 line): 排气格栅 tile_smog → its BuffTile
// buff's overrideEffectKey common_invisible_02, 规程 草地 → dule_grassland[invisible]'s common_079_stealth_01. Neither prefab
// has common_invisible's ColorModifier, so the model is not greyed (render/units.js). The sim sends the tile buffs as
// statuses (content/devices.js enterTerrain, `visible`) so the view can tell them from another 隐匿.
// Run: node --test test/render/tile-stealth-fx.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import * as F from '../../public/js/render/fxstatus.js';
import { UF } from '../../shared/constants.js';
import { makeBattle, chessRec, flatStage } from '../helpers/battleHarness.js';

const WHY = 'a tile 隐匿 draws its tile buff\'s effect (docs/rules/fx.md 「공식 전투 이펙트 (2026-10-05)」 배기 구역 줄)';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const view = (statuses, { enemy = false, flags = UF.STEALTH } = {}) => ({ info: { defId: enemy ? 'enemy_x' : 'char_x' }, isEnemy: enemy,
  alive: true, flags, statuses: new Set(statuses), statusFrom: new Map() });
const want = (v, ebuff = null) => [...F.wantedStatusFx(v, new Map(), ebuff).keys()].sort();

test('the sim sends the smog and grassland tile buffs as statuses (the view tells a tile 隐匿 by them)', () => {
  const rec = chessRec({ id: 't_a', profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, blockCnt: 1 }, rangeGrid: [[0, 0]], skill: null });
  for (const [ch, key] of [['g', 'terrain:smog'], ['G', 'terrain:grassland']]) {
    const stage = flatStage();
    if (ch === 'G') {
      // 规程 草地 is a stage legend tile (no grid letter): the stage's own legend entry
      stage.legend = { ...(stage.legend || {}), G: { height: 'LOW', build: 'ALL', pass: 'ALL', key: 'tile_duel_grassland', terrain: 'grassland' } };
    }
    stage.rows[9] = stage.rows[9].slice(0, 6) + ch + stage.rows[9].slice(7);
    const h = makeBattle({ stage, autoFinish: false, timeLimit: 10, defs: { chess: { t_a: rec } }, kits: { t_a: () => ({ trait: { noAttack: true } }) },
      units: [{ chessId: 't_a', row: 9, col: 6 }], enemies: [] });
    h.step(2);
    const u = h.unit('t_a');
    assert.ok(u.findBuff(key), `${key}: the unit on the tile holds it`);
    assert.ok(u.s.flags.stealth, `${key}: 隐匿`);
    assert.ok(h.eventsOf('status').some((e) => e[1] === u.id && e[2] === key && e[3] === 1), `${key} is sent as a status — ${WHY}`);
  }
});

test('an ally on 排气格栅 / 草地 shows the tile buff\'s effect, not common_invisible', () => {
  assert.deepEqual(want(view(['terrain:smog'])), ['common/common_invisible_02'], WHY);
  assert.deepEqual(want(view(['terrain:grassland'])), ['common/common_079_stealth_01'], WHY);
  // a 隐匿 status beside the tile's (锡拉库扎's bond, an item): both
  assert.deepEqual(want(view(['terrain:smog', 'stealth'])), ['common/common_invisible_02', 'stealthAlly']);
  // no tile: the operator's own
  assert.deepEqual(want(view([])), ['stealthAlly']);
});

test('an enemy on 草地: the tile buff\'s effect; its own invisible buff still beside it', () => {
  assert.deepEqual(want(view(['terrain:grassland'], { enemy: true })), ['common/common_079_stealth_01'], WHY);
  const ebuff = (v, kind) => (kind === 'stealth' ? { on: [['pfx', 'enemy_hide', 'own']], ends: new Map() } : null);
  assert.deepEqual(want(view(['terrain:grassland'], { enemy: true }), ebuff), ['common/common_079_stealth_01', 'pfx/enemy_hide']);
  // blocked on the grass (its flag off): the buff and its effect stay — the client's effect belongs to the buff
  assert.deepEqual(want(view(['terrain:grassland'], { enemy: true, flags: 0 })), ['common/common_079_stealth_01']);
});

test('units.js: a tile 隐匿 effect alone keeps the model\'s colour; common_invisible greys it; no effect drawn — the ghost', () => {
  const cam = () => presetCamera('normal', { width: 1280, height: 720 });
  const ctx = fakeViewCtx(fake.P, { cam });
  const sample = (flags) => ({ x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags, anim: 0, vx: 0, vy: 0 });
  const alphaOf = (flags, on) => {
    const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'chess', defId: 'char_x', tier: 3, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT' });
    v.sync(sample(flags), 1);
    if (on) v._fxStatusOn = new Set(on);
    v.update(1 / 30, cam(), 1);
    return v.alpha;
  };
  const base = alphaOf(0, null);
  assert.ok(base > 0);
  for (const k of F.TILE_STEALTH_FX) assert.ok(Math.abs(alphaOf(UF.STEALTH, [k]) - base) < 1e-9, `${k}: no ColorModifier — ${WHY}`);
  assert.ok(Math.abs(alphaOf(UF.STEALTH, ['stealthAlly', F.TILE_STEALTH_FX[0]]) - base * 0.894) < 1e-9, 'with common_invisible: its α .894');
  assert.ok(Math.abs(alphaOf(UF.STEALTH, ['stealthAlly']) - base * 0.894) < 1e-9);
  assert.ok(Math.abs(alphaOf(UF.STEALTH, null) - base * 0.45) < 1e-9, 'no effect drawn: the ghost');
});
