// 迷彩 (위장) has its own status icon, apart from 隐匿 (은신) — user decision 2026-10-06 (docs/LOCAL-PATCH.md
// "위장 아이콘"). Snapshot flag UF_CAMOU (shared/local.js) → render/units.js icon 'camou' (textures.js atlas). Both keep
// the see-through look (UF.STEALTH).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './render/fakepixi.js';
import { presetCamera } from '../public/js/render/projection.js';
import { UF } from '../shared/constants.js';
import { UF_CAMOU } from '../shared/local.js';
import { makeBattle } from './helpers/battleHarness.js';
import { flagsOf } from '../server/sim/snapshot.js';

let fake, UnitView, T, style;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../public/js/render/units.js'));
  T = await import('../public/js/render/textures.js');
  style = await import('../public/js/render/style.js');
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const sample = (flags) => ({ x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags, anim: 0, vx: 0, vy: 0 });

test('snapshot: 迷彩 sets UF_CAMOU next to UF.STEALTH; 隐匿 sets UF.STEALTH only (寒芒克洛丝 S1 = 迷彩)', () => {
  assert.ok(UF_CAMOU > 0 && !Object.values(UF).includes(UF_CAMOU) && (UF_CAMOU & (UF_CAMOU - 1)) === 0, 'a free single bit');
  const h = makeBattle({ seed: 1, units: [
    { chessId: 'chess_char_4_06_b', row: 10, col: 4, uid: 1, skillIndex: 0, carryState: { sp: 999 } },
    { chessId: 'chess_char_1_01_a', row: 10, col: 6, uid: 2 },
  ] });
  h.step(2);
  const kroos = h.unit('chess_char_4_06_b'), other = h.unit('chess_char_1_01_a');
  if (!kroos.skill.active) kroos.skill.activate('manual', { free: true });
  h.step(1);
  assert.ok(kroos.s.flags.camou, 'S1 无痕 gives 迷彩');
  const fk = flagsOf(kroos);
  assert.ok(fk & UF.STEALTH, 'see-through like 隐匿');
  assert.ok(fk & UF_CAMOU, '… marked as 迷彩');
  h.b.addBuff(other, { key: 'bond:siracusa:stealth', duration: 30, flags: { stealth: true }, status: 'stealth' });
  const fo = flagsOf(other);
  assert.ok(fo & UF.STEALTH);
  assert.equal(fo & UF_CAMOU, 0, '隐匿 is not 迷彩');
  // both at once: 隐匿 wins the icon
  h.b.addBuff(kroos, { key: 't:stealth', duration: 30, flags: { stealth: true } });
  assert.equal(flagsOf(kroos) & UF_CAMOU, 0);
});

test('render: the 迷彩 unit shows the camou icon, the 隐匿 one the stealth icon; a camou status never adds a second icon', () => {
  assert.ok(T.STATUS_KEYS.includes('camou'), 'atlas frame');
  assert.equal(style.statusIconKey('vulpis:camou'), 'camou');
  assert.equal(style.statusIconKey('camou'), 'camou');
  assert.equal(style.statusIconKey('stealth'), 'stealth');
  const ctx = fakeViewCtx(fake.P, { cam });
  const a = new UnitView(ctx, { id: 1, side: 'ally', kind: 'chess', defId: 'char_x', tier: 3, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT' });
  a.sync(sample(UF.STEALTH | UF_CAMOU), 1);
  a.onStatus('camou', true);
  assert.deepEqual([...a._iconKeys()], ['camou']);
  const b = new UnitView(ctx, { id: 2, side: 'ally', kind: 'chess', defId: 'char_x', tier: 3, x: 6, y: 10, maxHp: 1000, dir: 'RIGHT' });
  b.sync(sample(UF.STEALTH), 1);
  b.onStatus('stealth', true);
  assert.deepEqual([...b._iconKeys()], ['stealth']);
  assert.ok(T.statusTexture('camou'), 'texture');
  assert.notEqual(T.statusTexture('camou'), T.statusTexture('stealth'));
});
