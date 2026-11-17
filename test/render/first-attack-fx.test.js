// A cast effect's `_delayIfFirstAttack` (modes.json castOpt `d`) waits only on a first attack, which the sim's swing says:
// the client's `EffectOptions.isFirstAttack` reads the ability's `firstAttack`, true only for the cast that
// `AttackState.OnEnter` / `CombatState.OnEnter` start (docs/rules/fx.md 「시전 이펙트 시점·붙는 대상」 ①). The renderer used to
// guess it itself — the first swing of each mode since the unit was deployed —, so a unit that went idle and attacked again
// played the effect at once, and the first swing after a skill switched the mode mid-attack waited although the client's does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const START = 'texas_attack_01_start';
const FILES = {
  '/assets/local/fx/index.json': { bundles: { texas: [START] } },
  '/assets/local/fx/modes.json': {
    char_102_texas: { modes: ['Default'], cast: [[START]], castOpt: [{ [START]: { s: 2, e: 6, o: 0, d: 0.5 } }], hit: [[]], trail: [[]], attach: [[]], skills: [] },
  },
};

async function layerWith() {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (FILES[url] ? { ok: true, json: async () => FILES[url] } : { ok: false, json: async () => null });
  const plays = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (q) => plays.push(q), dry: true });
  await new Promise((r) => setTimeout(r, 20));
  globalThis.fetch = fetch0;
  const views = new Map([[1, { id: 1, x: 0, y: 0, alive: true, info: { id: 1, side: 'ally', kind: 'op', defId: 'char_102_texas', spine: 'char_102_texas' } }]]);
  const tick = (s) => { for (let t = 0; t < s - 1e-9; t += 0.05) layer.update(0.05, { dist: 20 }, { width: 100, height: 100 }); };
  const got = () => plays.splice(0).filter((q) => q.names.includes(START)).length;
  return { swing: (e) => layer.onEvent(e, views), tick, got };
}

test('fxgame: the first-attack delay waits only on a swing the sim marks first (8th field 1 / 2)', async () => {
  const { swing, tick, got } = await layerWith();
  swing(['swing', 1, 0.3, 'melee', 0, null, 0, 2]);
  assert.equal(got(), 0, 'a first attack: its start effect waits `_delayIfFirstAttack` (0.5 s ÷ the playback speed)');
  tick(0.6);
  assert.equal(got(), 1, '… and plays after it');
  tick(1);
  swing(['swing', 1, 0.3, 'melee']);
  assert.equal(got(), 1, 'a later swing in the same attack state: at once — the renderer no longer counts first attacks itself');
  tick(1);
  swing(['swing', 1, 0.3, 'melee', 0, null, 0, 1]);
  assert.equal(got(), 0, 'a first attack with a begin clip (1) waits too');
});

test('sim: the swing marks the first attack of an attack state, not the next ones, and again after the unit went idle (ai.js updateAlly)', () => {
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ uid: 1, chessId: 'chess_char_1_01_a', row: 10, col: 5 }] });
  h.step();
  const u = h.unit(1);
  const swings = [];
  const run = (s) => { for (let i = 0; i < Math.round(s / h.b.dt); i++) { h.step(); for (const e of h.events.splice(0)) if (e[0] === 'swing' && e[1] === u.id) swings.push(e); } };
  const e1 = h.spawn('e_d', { pos: [10, 6] });
  run(4);
  assert.ok(swings.length >= 3, `${swings.length} swings`);
  const fa = (e) => e[7] === 1 || e[7] === 2;
  assert.ok(fa(swings[0]), `the first swing is a first attack: ${JSON.stringify(swings[0])}`);
  assert.ok(swings.slice(1).every((e) => !fa(e)), `the next ones are not: ${JSON.stringify(swings.slice(1))}`);
  e1.alive = false; e1.hp = 0; h.b.enemies.splice(h.b.enemies.indexOf(e1), 1);
  run(4);
  swings.length = 0;
  h.spawn('e_d', { pos: [10, 6] });
  run(2);
  assert.ok(swings.length >= 1 && fa(swings[0]), `after its attack state ended, a first attack again: ${JSON.stringify(swings[0])}`);
});
