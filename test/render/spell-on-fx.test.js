// A multi-spell attack plays its ON_SPELL_ON cast effects at every spell: the client's `AbilityStandard._DoCast` calls
// `OnSpellStart` again for each further spell (`CheckAnotherSpell`, `_additionalTimes`), and each sends ON_SPELL_ON,
// which `CastEffectOptions.OnEvent` answers with another effect unless it is `_onlyOnce` (docs/rules/fx.md
// 「시전 이펙트 시점·붙는 대상」 ①). The sim sends a later spell as a numbered strike of the same attack ('dmg' 8th field:
// 能天使 S2 / S3) or as an attack of its own ('atk' 8th field: 霍尔海雅 S2). Before, the strikes of one 'atk' played them
// once, and an 'atk' of its own 0.067 s later began another cast (its swing effects again after 0.2 s, the loops cut).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const SWING = 'texas_attack_01_start', SPELL = 'texas_attack_01_spell', ONCE = 'texas_attack_01_once', LOOP = 'texas_attack_01_loop', HIT = 'texas_attack_01_hit';
const FILES = {
  '/assets/local/fx/index.json': { bundles: { texas: [SWING, SPELL, ONCE, LOOP, HIT] } },
  '/assets/local/fx/modes.json': {
    char_102_texas: {
      modes: ['Default'], cast: [[SWING, SPELL, ONCE, LOOP]], hit: [[HIT]], trail: [[]], attach: [[]], skills: [],
      castOpt: [{ [SWING]: { s: 2, e: 3, o: 1 }, [SPELL]: { s: 4, e: 3, o: 1 }, [ONCE]: { s: 4, e: 3, o: 1, once: 1 }, [LOOP]: { s: 4, e: 3, o: 0 }, [HIT]: { s: 4, e: 3, o: 1, t: 3 } }],
    },
  },
};

async function layerWith() {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (FILES[url] ? { ok: true, json: async () => FILES[url] } : { ok: false, json: async () => null });
  const plays = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (q) => plays.push(q), dry: true });
  await new Promise((r) => setTimeout(r, 20));
  globalThis.fetch = fetch0;
  const foe = (id) => ({ id, x: 1, y: 0, alive: true, info: { id, side: 'enemy', kind: 'enemy', defId: 'enemy_x' } });
  const views = new Map([[1, { id: 1, x: 0, y: 0, alive: true, info: { id: 1, side: 'ally', kind: 'op', defId: 'char_102_texas', spine: 'char_102_texas' } }],
    [2, foe(2)], [3, foe(3)]]);
  const tick = (s) => { for (let t = 0; t < s - 1e-9; t += 1 / 30) layer.update(1 / 30, { dist: 20 }, { width: 100, height: 100 }); };
  const got = () => {
    const n = { [SWING]: 0, [SPELL]: 0, [ONCE]: 0, [LOOP]: 0, [HIT]: 0 };
    for (const q of plays.splice(0)) for (const x of q.names) if (x in n) n[x]++;
    return n;
  };
  return { ev: (...es) => { for (const e of es) layer.onEvent(e, views); }, tick, got };
}
const RULE = ' — every spell sends ON_SPELL_ON (docs/rules/fx.md 「시전 이펙트 시점·붙는 대상」 ①)';
const dmg = (tid, strike) => ['dmg', tid, 10, 'phys', 0, 1, 0, strike];

test('fxgame: the numbered strikes of one attack are its spells — ON_SPELL_ON effects at each, once per spell number, `_onlyOnce` once', async () => {
  const { ev, tick, got } = await layerWith();
  ev(['swing', 1, 0.2, 'none', 0, 2]);
  assert.deepEqual(got(), { [SWING]: 1, [SPELL]: 0, [ONCE]: 0, [LOOP]: 0, [HIT]: 0 }, 'the swing: its ON_CAST_START effect');
  tick(0.2);
  ev(['atk', 1, 2, 'none'], ['atk', 1, 3, 'none'], dmg(2, 0), dmg(2, 1), dmg(2, 2), dmg(3, 0), dmg(3, 1), dmg(3, 2));
  assert.deepEqual(got(), { [SWING]: 0, [SPELL]: 3, [ONCE]: 1, [LOOP]: 3, [HIT]: 6 },
    'three strikes = three spells (the second target\'s strikes are the same spells); the `_onlyOnce` one at the first only;'
    + ' the shot\'s hits (castOpt t 3: HitEffectOptions.OnCastOnTarget) on each target at each spell' + RULE);
  tick(1);
  ev(['swing', 1, 0.2, 'none', 0, 2]);
  tick(0.2);
  ev(['atk', 1, 2, 'none'], dmg(2, 0), ['dmg', 2, 10, 'phys', 0, 1, 0, null]);
  assert.deepEqual(got(), { [SWING]: 1, [SPELL]: 1, [ONCE]: 1, [LOOP]: 1, [HIT]: 1 }, 'a one-strike attack: once (a talent\'s unnumbered extra hit is no spell)');
});

test('fxgame: a later spell sent as an attack of its own (\'atk\' 8th field) plays the cast\'s ON_SPELL_ON effects again, no new cast', async () => {
  const { ev, tick, got } = await layerWith();
  ev(['swing', 1, 0.3, 'arrow', 0, 2]);
  tick(0.3);
  ev(['atk', 1, 2, 'arrow']);
  for (let k = 1; k <= 8; k++) { tick(0.067); ev(['atk', 1, k % 2 ? 3 : 2, 'arrow', null, null, null, k]); }
  assert.deepEqual(got(), { [SWING]: 1, [SPELL]: 9, [ONCE]: 1, [LOOP]: 9, [HIT]: 9 },
    'nine spells of one cast: the swing effect once (no cast begun at each shot), the ON_SPELL_ON ones nine times' + RULE);
  ev(['atk', 1, 2, 'arrow', null, null, null, 8]);
  assert.equal(got()[SPELL], 0, 'a spell number already played: nothing');
  tick(1);
  ev(['swing', 1, 0.3, 'arrow', 0, 2]);
  ev(['atk', 1, 2, 'arrow', null, null, null, 9]);
  assert.equal(got()[SPELL], 0, 'a spell of the cast before, after the next swing began: not this cast\'s strike');
});

test('sim: 霍尔海雅 S2 sends its eight later shots as the swing\'s spells 1 … 8 (\'atk\' 8th field)', () => {
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ diy: { slot: 6, charId: 'char_4027_heyak', skillIndex: 1 }, elite: true, row: 10, col: 5, uid: 1 }] });
  h.step();
  const u = h.unit(1);
  h.spawn('e_d', { pos: [10, 6] });
  const swings = [];
  for (let i = 0; i < Math.round(12 / h.b.dt); i++) {
    if (u.skill && !u.skill.active && h.b.time > 2) u.skill.sp = u.skill.spCost;
    h.step();
    for (const e of h.events.splice(0)) {
      if (e[0] === 'swing' && e[1] === u.id) swings.push({ on: !!u.skill?.active, atk: [] });
      else if (e[0] === 'atk' && e[1] === u.id && swings.length) swings.at(-1).atk.push(e[7] ?? 0);
    }
  }
  const burst = swings.filter((s) => s.on && s.atk.length === 9);
  assert.ok(burst.length >= 3, `S2 swings with nine shots: ${JSON.stringify(swings.map((s) => s.atk))}`);
  for (const s of burst) assert.deepEqual(s.atk, [0, 1, 2, 3, 4, 5, 6, 7, 8], 'the first shot is the swing\'s strike, the next eight its spells 1 … 8' + RULE);
  assert.ok(swings.filter((s) => !s.on).every((s) => s.atk.every((k) => k === 0)), 'her normal attack: no later spell');
});
