// test/render/enemy-cond-child-fx.test.js — an enemy attack group that picks one child per attack (AbilitySelectableGroup
// `_abilityConfigs`, official client: the first child whose config trigger passes) must not draw a child this mode never
// casts. 自制投石机 (enemy_10162_mnctpt) has Normal and Special; Special's trigger needs the catapult itself to hold 入戏
// (trap_pirene_func[enemy][real]), which only the 喷泉水池 stage device (trap_279_pirene) gives and no stage of this mode
// fields — until 2026-11-26 enemy_bindings.py merged both children into one part and every attack showed both lock-ons
// (docs/rules/fx.md 「능력 묶음의 자식·COMBAT 상태 공격」).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BINDINGS = join(ROOT, 'tools/assets/local-enemy-bindings.json');
const MODES = join(ROOT, 'public/assets/local/fx/enemy-modes.json');
const RULE = 'docs/rules/fx.md 「능력 묶음의 자식·COMBAT 상태 공격」';

/**
 * A child that needs its owner to hold a buff this mode can give (enemy_bindings.py mark_never leaves it in): it is merged
 * with the other children until the sim says which child an attack is. `<enemy> <path>`: the reason.
 */
const REACHABLE = Object.freeze({});

const bindings = () => JSON.parse(readFileSync(BINDINGS, 'utf8'));
const conditional = (B) => Object.entries(B).filter(([k, r]) => !k.startsWith('$') && Array.isArray(r.abilities))
  .flatMap(([k, r]) => r.abilities.filter((a) => a.needBuffs).map((a) => ({ id: k, a })));

test('every child that needs its owner to hold a buff is one this mode never casts, or is listed', () => {
  const rows = conditional(bindings());
  assert.ok(rows.some(({ id, a }) => id === 'enemy_10162_mnctpt' && /\/Attack\/Special$/.test(a.path) && a.never === 'trap_279_pirene'),
    '自制投石机 Attack/Special is read (needs trap_pirene_func[enemy][real], never: trap_279_pirene)');
  const open = rows.filter(({ a }) => !a.never).map(({ id, a }) => `${id} ${a.path}`);
  assert.deepEqual(open.filter((k) => !REACHABLE[k]), [],
    `a selectable group child whose buff this mode can give is merged with the other children — make the sim name it, or list it with the reason (${RULE})`);
  assert.deepEqual(Object.keys(REACHABLE).filter((k) => !open.includes(k)), [], 'no stale entry');
});

test('a child this mode never casts draws nothing: 自制投石机 attacks show the Normal lock-on only', { skip: !existsSync(MODES) && 'no enemy-modes.json' }, () => {
  const M = JSON.parse(readFileSync(MODES, 'utf8'));
  const B = bindings();
  let ran = 0;
  for (const { id, a } of conditional(B)) {
    if (!a.never || !M[id]) continue;
    const others = new Set(B[id].abilities.filter((x) => x !== a)
      .flatMap((x) => ['castEffects', 'hitEffects', 'castTargetEffects', 'inputTargetEffects', 'attachEffects'].flatMap((k) => (x[k] || []).flatMap((e) => e.fx))));
    const own = ['castEffects', 'hitEffects', 'castTargetEffects', 'inputTargetEffects', 'attachEffects']
      .flatMap((k) => (a[k] || []).flatMap((e) => e.fx)).filter((n) => !others.has(n));
    const entry = JSON.stringify(M[id].modes);
    for (const n of own) assert.ok(!entry.includes(`"${n}"`), `${id} ${a.path}: ${n} is drawn though this mode never casts it (${RULE})`);
    ran++;
  }
  assert.ok(ran >= 2, '自制投石机 Combat/Special and Attack/Special were checked');
  const m = M.enemy_10162_mnctpt.modes[0];
  for (const part of [m.melee, m.ranged]) {
    assert.deepEqual(part.castTgt, ['enemy_mnctpt_lockon_1']);
    assert.equal(part.proj.key, 'projectile_enemy_mnctpt');
  }
  assert.deepEqual(m.anim, ['Attack'], 'Special\'s clip Attack_2 is not an attack clip here');
});
