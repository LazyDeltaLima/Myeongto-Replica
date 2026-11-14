// Enemy prefab modes drawn in their own clips: the real kits' mode switches tell the view (fx 'phase' `form`) and
// render/units.js FORMS plays the mode's clips. 咸鳞汁推荐者 (GitHub #14): blocked it is in M2, whose hooker plays
// B_Idle / B_Move / B_Die — its first swing the barrel smash (Skills/BlockedBoom, Attack), every later one the Combat's
// B_Attack (and B_Attack while silenced: no BlockedBoom). 水遁忍者: its spin (M1) opens on Skill_Begin, stands and walks in
// Skill_Loop and closes on Skill_End.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const E = JSON.parse(readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));
const WINTUN = 'enemy_10044_wintun', YMGTOP = 'enemy_10116_ymgtop';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const haveModel = (id) => !!assets.enemies?.[id]?.spine;

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

function arena(wall) {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: { t_wall: WALL } }, kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: [{ chessId: 't_wall', row: wall[0], col: wall[1] }],
  });
}
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
function store(id) {
  const entry = assets.enemies[id].spine;
  const names = Object.keys(entry.animations || {});
  return { picture: () => null, image: async () => null, spineEntry: () => entry, spine: { acquire: async () => ({ animations: names.map((name) => ({ name })) }), release() {} } };
}
async function view(id, x, y) {
  const v = new UnitView(fakeViewCtx(fake.P, { assets: store(id), cam }), { id: 7, side: 'enemy', kind: 'enemy', defId: id, spine: id, tier: 1, x, y, maxHp: 1000, facing: -1 });
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.ok(v.actor, 'Spine model built');
  v.sync({ x, y, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0 }, 0);
  return v;
}
let clock = 0;
const frames = (v, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) { clock += dt; v.update(dt, cam(), clock); } };

/**
 * Steps the battle `s` s, handing enemy `e`'s mode switches (fx 'phase' with a form) and swings to view `v` as they come,
 * the view running alongside. Returns what the view played: [clip at each swing's start], [form, clip after it] per switch.
 */
function play(h, e, v, s) {
  const out = { swings: [], forms: [] };
  const end = h.b.time + s;
  while (h.b.time < end - 1e-9) {
    const n = h.events.length;
    h.step();
    for (const x of h.events.slice(n)) {
      if (x[0] === 'fx' && x[1] === 'phase' && x[4]?.id === e.id && 'form' in x[4]) {
        v.setForm(x[4].form, x[4]);
        out.forms.push([x[4].form, v.actor.current]);
      } else if (x[0] === 'swing' && x[1] === e.id) {
        v.onSwing(Number(x[2]), x[3]);
        out.swings.push(v.actor.current);
      }
    }
    frames(v, h.b.dt);
  }
  return out;
}

test('咸鳞汁推荐者 (GitHub #14): blocked, the B_* idle / walk; its first swing the barrel smash (Attack), then the bare-handed B_Attack', { skip: !haveModel(WINTUN) && 'no model' }, async () => {
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(WINTUN, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(WINTUN, e.x, e.y);
  frames(v, 0.1);
  assert.equal(v.actor.current, 'Idle', 'with its barrel before it is blocked');
  const r = play(h, e, v, 6);
  assert.deepEqual(r.forms.map((f) => f[0]), ['M2boom', 'M2'], 'M2 with the smash to come, then M2 for good');
  assert.equal(r.forms[0][1], 'B_Idle', 'the mode\'s hooker: B_Idle from the switch');
  assert.ok(r.swings.length >= 3, `swings seen (${r.swings.length})`);
  assert.equal(r.swings[0], 'Attack', 'the first swing: BlockedBoom\'s barrel smash');
  assert.deepEqual([...new Set(r.swings.slice(1))], ['B_Attack'], 'every later swing: the Combat\'s B_Attack — no barrel again');
  assert.ok(!e.findBuff('ab:barrel'), 'the sim dropped the barrel');
  frames(v, 3);
  assert.equal(v.actor.current, 'B_Idle', 'back to the bare-handed idle between swings');
});

test('咸鳞汁推荐者 silenced when blocked: B_Attack (no BlockedBoom) while the barrel is kept, the smash once the silence ends', { skip: !haveModel(WINTUN) && 'no model' }, async () => {
  const h = arena([9, 5]);
  h.step();
  const e = h.spawn(WINTUN, { pos: [9, 5], routeIndex: 0, mods: { speedMul: 0 } });
  h.b.applyStatus(e, 'silence', { duration: 4 });
  const v = await view(WINTUN, e.x, e.y);
  const r = play(h, e, v, 10);
  assert.deepEqual(r.forms.map((f) => f[0]), ['M2', 'M2boom', 'M2'], 'silenced M2, the smash to come after it, then M2 for good');
  const smash = r.swings.indexOf('Attack');
  assert.ok(smash > 0, `the silenced swings first (${r.swings.join(', ')})`);
  assert.deepEqual([...new Set(r.swings.slice(0, smash))], ['B_Attack'], 'silenced: the Combat\'s B_Attack');
  assert.equal(r.swings.filter((c) => c === 'Attack').length, 1, 'one barrel smash');
});

test('水遁忍者: its spin opens on Skill_Begin, stands and walks in Skill_Loop, closes on Skill_End', { skip: !haveModel(YMGTOP) && 'no model' }, async () => {
  const h = arena([10, 6]);
  h.step();
  const e = h.spawn(YMGTOP, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
  const v = await view(YMGTOP, e.x, e.y);
  const sk = E[YMGTOP].skills.find((s) => s.prefabKey === 'SwitchModeTrigger');
  const r = play(h, e, v, sk.initCooldown + 0.5);
  assert.deepEqual(r.forms, [['M1', 'Skill_Begin']], 'the spin starts on BeginAnim\'s Skill_Begin');
  assert.equal(v.actor.roles.move.loop, 'Skill_Loop', 'it walks spinning');
  frames(v, assets.enemies[YMGTOP].spine.animations.Skill_Begin);
  assert.equal(v.actor.current, 'Skill_Loop', 'then the hooker\'s Skill_Loop');
  // 失衡 stops it (the kit's unbalanced: pushed, as in content/enemies_bosses.test.js)
  h.b.displace(e, { x: 1, y: 0 }, 0.2, { force: 3 });
  const r2 = play(h, e, v, 1);
  assert.deepEqual(r2.forms, [[null, 'Skill_End']], 'the spin ends: back to its first mode on EndAnim\'s Skill_End');
  frames(v, assets.enemies[YMGTOP].spine.animations.Skill_End + 0.1);
  assert.equal(v.actor.current, 'Idle', 'then its own idle');
});
